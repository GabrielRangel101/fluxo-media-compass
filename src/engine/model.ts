// Modelo de negócio compartilhado: preços, eventos e o hazard de churn.
// O MESMO hazard alimenta (a) a simulação que gera o dataset e (b) o "risco de saída" do dashboard.
// Assim o que o dashboard mostra como risco é coerente com o comportamento real dos dados.

import { monthIndex } from "./calendar";
import { clamp } from "./rng";
import type { Channel, EventMarker, Plan, Subscriber } from "./types";

export const EVENT_BLACK_FRIDAY_24 = monthIndex(2024, 11); // 0
export const EVENT_BLACK_FRIDAY_25 = monthIndex(2025, 11); // 12
export const EVENT_COPA_START = monthIndex(2026, 6); // 19
export const EVENT_COPA_END = monthIndex(2026, 7); // 20
export const EVENT_REAJUSTE = monthIndex(2026, 7); // 20
export const EVENT_ELEICOES_START = monthIndex(2026, 9); // 22
export const EVENT_ELEICOES_END = monthIndex(2026, 10); // 23

export const EVENTS: EventMarker[] = [
  { month: EVENT_BLACK_FRIDAY_24, label: "Black Friday 24", kind: "campanha", description: "Campanha de Black Friday com 60% de desconto por 3 meses." },
  { month: EVENT_BLACK_FRIDAY_25, label: "Black Friday 25", kind: "campanha", description: "Maior campanha do período: aquisição 2,4x a média, majoritariamente mídia paga." },
  { month: EVENT_COPA_START, label: "Copa 2026", kind: "evento", description: "Passe Copa: oferta promocional de curta duração para o público de Esportes." },
  { month: EVENT_REAJUSTE, label: "Reajuste de preço", kind: "preço", description: "Planos Mensal e Combo reajustados (+12% e +11%)." },
  { month: EVENT_ELEICOES_START, label: "Eleições 2026", kind: "evento", description: "Cobertura eleitoral impulsiona aquisição orgânica e social." },
];

export const LAST_MONTH = 23;
export const FIRST_SIM_MONTH = -18;

/** Preço mensal-equivalente de tabela, por plano e mês (reajuste em jul/26) */
export function listPrice(plan: Plan, m: number): number {
  const hiked = m >= EVENT_REAJUSTE;
  switch (plan) {
    case "Mensal":
      return hiked ? 33.5 : 29.9;
    case "Combo Streaming":
      return hiked ? 49.9 : 44.9;
    case "Anual":
      return 24.92; // R$ 299/12 — renovação sem reajuste no período
    case "Estudante":
      return 14.9;
  }
}

export function planAt(s: Pick<Subscriber, "plan" | "planAfter" | "upgradeMonth">, m: number): Plan {
  return s.upgradeMonth !== null && s.planAfter !== null && m >= s.upgradeMonth ? s.planAfter : s.plan;
}

export function isActiveAt(s: Pick<Subscriber, "startMonth" | "endMonth">, m: number): boolean {
  return s.startMonth <= m && (s.endMonth === null || m < s.endMonth);
}

/** Receita recorrente mensal (MRR) do assinante no mês m (0 se inativo) */
export function mrrAt(s: Subscriber, m: number): number {
  if (!isActiveAt(s, m)) return 0;
  const plan = planAt(s, m);
  const base = listPrice(plan, m);
  const inPromo = s.promoDiscount > 0 && m < s.startMonth + s.promoMonths && plan === s.plan;
  return Math.round(base * (inPromo ? 1 - s.promoDiscount : 1) * 100) / 100;
}

// ---------------------------------------------------------------- hazard de churn

const BASE_HAZARD: Record<Plan, number> = {
  Mensal: 0.034,
  "Combo Streaming": 0.024,
  Estudante: 0.04,
  Anual: 0, // churn só na renovação
};

export const CHANNEL_HAZARD: Record<Channel, number> = {
  Orgânico: 0.8,
  Newsletter: 0.6,
  "Mídia paga (Meta)": 1.5,
  "Mídia paga (Google)": 1.3,
  "Social orgânico": 1.2,
  Parcerias: 1.0,
  Direto: 1.0,
};

export const PAYMENT_FAILURE_RATE = 0.006;
const ANNUAL_RENEWAL_CHURN = 0.26;

export interface Hazard {
  /** Probabilidade total de cancelar em m (decisão ao fim do mês anterior) */
  total: number;
  /** Componente involuntário (falha de pagamento) */
  involuntary: number;
  /** Mês em que o preço cheio chega para quem estava em promoção */
  promoCliff: boolean;
  /** Mês afetado pelo reajuste de preço */
  priceHike: boolean;
  /** Fim de contrato anual */
  renewal: boolean;
  /** Efeito pós-Copa */
  postEvent: boolean;
}

/**
 * Probabilidade de o assinante cancelar no mês m. Só depende de atributos observáveis,
 * então pode ser usada tanto na simulação quanto no score de risco do dashboard.
 */
export function hazardAt(s: Subscriber, m: number): Hazard {
  const age = m - s.startMonth;
  const plan = planAt(s, m);
  const engF = clamp(Math.exp((-1.6 * (s.engagement - 55)) / 45), 0.3, 3);

  if (plan === "Anual") {
    const anchor = s.upgradeMonth !== null && s.planAfter === "Anual" ? s.upgradeMonth : s.startMonth;
    const renewal = m > anchor && (m - anchor) % 12 === 0;
    const p = renewal ? clamp(ANNUAL_RENEWAL_CHURN * CHANNEL_HAZARD[s.channel] * (engF * 0.6 + 0.4), 0.05, 0.8) : 0;
    return {
      total: p + PAYMENT_FAILURE_RATE / 3,
      involuntary: PAYMENT_FAILURE_RATE / 3,
      promoCliff: false,
      priceHike: false,
      renewal,
      postEvent: false,
    };
  }

  const tenureF = age <= 1 ? 1.5 : age === 2 ? 1.35 : age === 3 ? 1.2 : age > 12 ? 0.9 : 1;
  const onPromoPlan = plan === s.plan && s.promoDiscount > 0;
  const cliff = onPromoPlan && age === s.promoMonths;
  const afterCliff = onPromoPlan && age === s.promoMonths + 1;
  const promoF = cliff ? 3.0 * (0.6 + s.promoDiscount) : afterCliff ? 1.6 : 1;
  const hike = (plan === "Mensal" || plan === "Combo Streaming") && (m === EVENT_REAJUSTE || m === EVENT_REAJUSTE + 1);
  const hikeF = hike ? (m === EVENT_REAJUSTE ? 1.7 : 1.3) : 1;
  const postEvent = s.campaign === "Copa 2026" && m > EVENT_COPA_END && m <= EVENT_COPA_END + 3;
  const eventF = postEvent ? 1.9 : 1;

  const voluntary = BASE_HAZARD[plan] * CHANNEL_HAZARD[s.channel] * engF * tenureF * promoF * hikeF * eventF;
  const total = clamp(voluntary + PAYMENT_FAILURE_RATE, 0, 0.9);
  return { total, involuntary: PAYMENT_FAILURE_RATE, promoCliff: cliff || afterCliff, priceHike: hike, renewal: false, postEvent };
}

/** Risco de cancelar nos próximos `horizon` meses, em % (0–100) */
export function churnRisk(s: Subscriber, fromMonth: number, horizon = 3): number {
  let survive = 1;
  for (let i = 1; i <= horizon; i++) survive *= 1 - hazardAt(s, fromMonth + i).total;
  return Math.round((1 - survive) * 1000) / 10;
}

// Gerador do dataset sintético da "Gazeta Meridiano" (marca fictícia).
// Tudo é determinístico por seed e 100% fictício (nomes, números, eventos).
//
// Histórias plantadas (o motor de insights deve ENCONTRÁ-LAS, não recebê-las prontas):
//  1. Black Friday 25: aquisição 2,4x, majoritariamente mídia paga com 60% off por 3 meses
//     → "penhasco" de cancelamento quando o preço cheio chega (fev/26) e retenção pior que as demais safras.
//  2. Mídia paga retém pior que Newsletter/Orgânico, em qualquer safra.
//  3. Reajuste de jul/26 eleva o churn de Mensal e Combo por dois meses.
//  4. Copa 2026: pico de Esportes, depois queda de interesse e churn acima do normal.
//  5. Eleições 2026: pico de aquisição orgânica/social em set–out.
//  6. ~1 em cada 6 cancelamentos é involuntário (falha de pagamento) — alavanca barata de recuperação.

import { calMonth, monthLabel } from "./calendar";
import {
  EVENTS,
  EVENT_BLACK_FRIDAY_24,
  EVENT_BLACK_FRIDAY_25,
  EVENT_COPA_END,
  EVENT_COPA_START,
  EVENT_ELEICOES_END,
  EVENT_ELEICOES_START,
  FIRST_SIM_MONTH,
  LAST_MONTH,
  hazardAt,
  isActiveAt,
  mrrAt,
  planAt,
} from "./model";
import { clamp, createRng } from "./rng";
import type { Rng } from "./rng";
import { CHANNELS, EDITORIAS, PLANS, TOUCHPOINTS } from "./types";
import type {
  Campaign,
  CancelReason,
  Channel,
  Dataset,
  Editoria,
  Nature,
  Plan,
  Subscriber,
  Touchpoint,
} from "./types";

const FIRST = [
  "Ana", "Bruno", "Carla", "Diego", "Eduarda", "Felipe", "Gabriela", "Henrique", "Isabela", "João",
  "Karina", "Lucas", "Mariana", "Nicolas", "Olívia", "Pedro", "Rafaela", "Sérgio", "Tatiane", "Vinícius",
  "Alice", "Bernardo", "Camila", "Daniel", "Elisa", "Fábio", "Giovana", "Heitor", "Ingrid", "Júlio",
  "Larissa", "Matheus", "Natália", "Otávio", "Paula", "Rodrigo", "Sabrina", "Thiago", "Valentina", "Yuri",
];
const LAST = [
  "Almeida", "Barros", "Cardoso", "Duarte", "Esteves", "Fontana", "Gomes", "Hoffmann", "Ibarra", "Jardim",
  "Klein", "Lima", "Machado", "Nunes", "Oliveira", "Pereira", "Quadros", "Ribeiro", "Schmidt", "Teixeira",
  "Uliana", "Vargas", "Weber", "Xavier", "Zanella", "Moraes", "Rocha", "Siqueira", "Bittencourt", "Farias",
];

const CHANNEL_BASE_ENGAGEMENT: Record<Channel, number> = {
  Orgânico: 62,
  Newsletter: 72,
  "Mídia paga (Meta)": 45,
  "Mídia paga (Google)": 50,
  "Social orgânico": 48,
  Parcerias: 55,
  Direto: 58,
};
const EDITORIA_ENGAGEMENT_ADJ: Record<Editoria, number> = { Política: 3, Esportes: 0, Economia: 2, Regional: 7, Cultura: -2, Variedades: -9 };
const PLAN_ENGAGEMENT_ADJ: Record<Plan, number> = { Mensal: 0, Anual: 6, "Combo Streaming": 4, Estudante: -4 };

const BASE_CHANNEL_W: Record<Channel, number> = {
  Orgânico: 0.26,
  Newsletter: 0.17,
  "Mídia paga (Meta)": 0.17,
  "Mídia paga (Google)": 0.15,
  "Social orgânico": 0.09,
  Parcerias: 0.08,
  Direto: 0.08,
};

const BASE_PLAN_W: Record<Channel, Record<Plan, number>> = {
  Orgânico: { Mensal: 0.5, Anual: 0.2, "Combo Streaming": 0.2, Estudante: 0.1 },
  Newsletter: { Mensal: 0.4, Anual: 0.32, "Combo Streaming": 0.2, Estudante: 0.08 },
  "Mídia paga (Meta)": { Mensal: 0.6, Anual: 0.1, "Combo Streaming": 0.15, Estudante: 0.15 },
  "Mídia paga (Google)": { Mensal: 0.58, Anual: 0.12, "Combo Streaming": 0.18, Estudante: 0.12 },
  "Social orgânico": { Mensal: 0.58, Anual: 0.1, "Combo Streaming": 0.14, Estudante: 0.18 },
  Parcerias: { Mensal: 0.35, Anual: 0.15, "Combo Streaming": 0.4, Estudante: 0.1 },
  Direto: { Mensal: 0.5, Anual: 0.22, "Combo Streaming": 0.2, Estudante: 0.08 },
};

const TOUCHPOINT_W: Record<Channel, Record<Touchpoint, number>> = {
  Orgânico: { "Paywall de matéria": 0.62, "Botão do header": 0.22, "Pop-up de oferta": 0.14, "CTA de newsletter": 0.0, "Landing de campanha": 0.02 },
  Newsletter: { "Paywall de matéria": 0.1, "Botão do header": 0.0, "Pop-up de oferta": 0.05, "CTA de newsletter": 0.85, "Landing de campanha": 0.0 },
  "Mídia paga (Meta)": { "Paywall de matéria": 0.1, "Botão do header": 0.02, "Pop-up de oferta": 0.18, "CTA de newsletter": 0.0, "Landing de campanha": 0.7 },
  "Mídia paga (Google)": { "Paywall de matéria": 0.22, "Botão do header": 0.04, "Pop-up de oferta": 0.14, "CTA de newsletter": 0.0, "Landing de campanha": 0.6 },
  "Social orgânico": { "Paywall de matéria": 0.55, "Botão do header": 0.1, "Pop-up de oferta": 0.3, "CTA de newsletter": 0.0, "Landing de campanha": 0.05 },
  Parcerias: { "Paywall de matéria": 0.1, "Botão do header": 0.1, "Pop-up de oferta": 0.1, "CTA de newsletter": 0.0, "Landing de campanha": 0.7 },
  Direto: { "Paywall de matéria": 0.3, "Botão do header": 0.5, "Pop-up de oferta": 0.18, "CTA de newsletter": 0.0, "Landing de campanha": 0.02 },
};

const SEASON = [1.05, 0.95, 0.95, 0.9, 0.9, 0.9, 0.95, 0.95, 1.0, 1.05, 1.2, 1.0]; // por mês do calendário (jan…dez)
const BASE_ACQUISITION = 255;

interface CampaignSpec {
  campaign: Campaign;
  /** aquisição extra como fração da base do mês */
  extra: number;
  channelW: Record<Channel, number>;
  planW: Record<Plan, number>;
  promoDiscount: number;
  promoMonths: number;
  engagementShift: number;
  interestBoost?: { editoria: Editoria; p: number };
}

function campaignSpecs(m: number): CampaignSpec[] {
  const specs: CampaignSpec[] = [];
  const bfChannels: Record<Channel, number> = {
    Orgânico: 0.1, Newsletter: 0.1, "Mídia paga (Meta)": 0.3, "Mídia paga (Google)": 0.25,
    "Social orgânico": 0.05, Parcerias: 0.05, Direto: 0.15,
  };
  const bfPlans: Record<Plan, number> = { Mensal: 0.6, Anual: 0.1, "Combo Streaming": 0.25, Estudante: 0.05 };
  if (m === EVENT_BLACK_FRIDAY_25) {
    specs.push({ campaign: "Black Friday", extra: 1.4, channelW: bfChannels, planW: bfPlans, promoDiscount: 0.6, promoMonths: 3, engagementShift: -10 });
  } else if (m === EVENT_BLACK_FRIDAY_24 || m === EVENT_BLACK_FRIDAY_25 - 12) {
    specs.push({ campaign: "Black Friday", extra: 0.8, channelW: bfChannels, planW: bfPlans, promoDiscount: 0.6, promoMonths: 3, engagementShift: -10 });
  }
  if (m === EVENT_COPA_START || m === EVENT_COPA_END) {
    specs.push({
      campaign: "Copa 2026",
      extra: m === EVENT_COPA_START ? 0.5 : 0.7,
      channelW: { Orgânico: 0.3, Newsletter: 0.08, "Mídia paga (Meta)": 0.1, "Mídia paga (Google)": 0.08, "Social orgânico": 0.28, Parcerias: 0.04, Direto: 0.12 },
      planW: { Mensal: 0.7, Anual: 0.0, "Combo Streaming": 0.2, Estudante: 0.1 },
      promoDiscount: 0.5, promoMonths: 2, engagementShift: 0,
      interestBoost: { editoria: "Esportes", p: 0.9 },
    });
  }
  if (m === EVENT_ELEICOES_START || m === EVENT_ELEICOES_END) {
    specs.push({
      campaign: "Eleições 2026",
      extra: m === EVENT_ELEICOES_START ? 0.35 : 0.6,
      channelW: { Orgânico: 0.35, Newsletter: 0.1, "Mídia paga (Meta)": 0.08, "Mídia paga (Google)": 0.07, "Social orgânico": 0.25, Parcerias: 0.05, Direto: 0.1 },
      planW: { Mensal: 0.55, Anual: 0.2, "Combo Streaming": 0.15, Estudante: 0.1 },
      promoDiscount: 0.4, promoMonths: 2, engagementShift: 4,
      interestBoost: { editoria: "Política", p: 0.85 },
    });
  }
  return specs;
}

function weights<T extends string>(keys: readonly T[], table: Record<T, number>): number[] {
  return keys.map((k) => table[k]);
}

function makeSubscriber(rng: Rng, id: number, startMonth: number, spec: CampaignSpec | null): Subscriber {
  const channel = rng.pick(CHANNELS, weights(CHANNELS, spec ? spec.channelW : BASE_CHANNEL_W));
  const plan = rng.pick(PLANS, weights(PLANS, spec ? spec.planW : BASE_PLAN_W[channel]));
  const touchpoint = rng.pick(TOUCHPOINTS, weights(TOUCHPOINTS, TOUCHPOINT_W[channel]));

  let promoDiscount = 0;
  let promoMonths = 0;
  if (plan === "Anual") {
    promoDiscount = rng.chance(0.3) ? 0.2 : 0;
    promoMonths = promoDiscount > 0 ? 12 : 0;
  } else if (plan !== "Estudante") {
    if (spec) {
      promoDiscount = spec.promoDiscount;
      promoMonths = spec.promoMonths;
    } else if (rng.chance(channel.startsWith("Mídia paga") ? 0.5 : 0.3)) {
      promoDiscount = 0.5;
      promoMonths = 3;
    }
  }

  const interest: Editoria =
    spec?.interestBoost && rng.chance(spec.interestBoost.p)
      ? spec.interestBoost.editoria
      : rng.pick(EDITORIAS, [0.24, 0.2, 0.14, 0.2, 0.1, 0.12]);

  const engagement = Math.round(
    clamp(
      rng.normal(CHANNEL_BASE_ENGAGEMENT[channel] + PLAN_ENGAGEMENT_ADJ[plan] + EDITORIA_ENGAGEMENT_ADJ[interest] + (spec?.engagementShift ?? 0), 14),
      5,
      98,
    ),
  );

  const npsScore = Math.round(clamp(rng.normal(3.2 + (engagement / 100) * 8, 1.8), 0, 10));
  const npsRespondent = rng.chance(engagement > 60 ? 0.28 : 0.2);

  const name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
  return {
    id,
    name,
    avatarSeed: `${name.replace(/\s/g, "-")}-${id}`.toLowerCase(),
    startMonth,
    endMonth: null,
    channel,
    touchpoint,
    plan,
    upgradeMonth: null,
    planAfter: null,
    promoDiscount,
    promoMonths,
    engagement,
    interest,
    cancelReason: null,
    nature: null,
    npsScore,
    npsRespondent,
    campaign: spec?.campaign ?? null,
  };
}

function reasonFor(rng: Rng, s: Subscriber, m: number): { reason: CancelReason; nature: Nature } {
  const h = hazardAt(s, m);
  if (h.renewal && rng.chance(1 - h.involuntary / h.total)) return { reason: "Não renovou", nature: "Fim de contrato" };
  if (rng.chance(h.involuntary / h.total)) return { reason: "Falha de pagamento", nature: "Involuntário" };
  const table: [CancelReason, number][] = h.promoCliff
    ? [["Fim da promoção", 0.65], ["Preço", 0.2], ["Pouco uso", 0.1], ["Outros", 0.05]]
    : h.priceHike
      ? [["Preço", 0.6], ["Concorrente", 0.12], ["Pouco uso", 0.18], ["Outros", 0.1]]
      : s.engagement < 45
        ? [["Pouco uso", 0.5], ["Preço", 0.2], ["Concorrente", 0.1], ["Conteúdo não atende", 0.1], ["Outros", 0.1]]
        : [["Preço", 0.35], ["Pouco uso", 0.2], ["Concorrente", 0.2], ["Conteúdo não atende", 0.15], ["Outros", 0.1]];
  const reason = rng.pick(table.map((t) => t[0]), table.map((t) => t[1]));
  return { reason, nature: "Voluntário" };
}

function simulate(rng: Rng, s: Subscriber): void {
  let upgraded = false;
  for (let m = s.startMonth + 1; m <= LAST_MONTH; m++) {
    const h = hazardAt(s, m);
    if (rng.chance(h.total)) {
      const r = reasonFor(rng, s, m);
      s.endMonth = m;
      s.cancelReason = r.reason;
      s.nature = r.nature;
      break;
    }
    if (!upgraded && planAt(s, m) === "Mensal" && m - s.startMonth >= 2 && s.engagement >= 62 && rng.chance(0.015)) {
      upgraded = true;
      s.upgradeMonth = m + 1;
      s.planAfter = rng.chance(0.65) ? "Anual" : "Combo Streaming";
    }
  }
  // upgrade só vale se o assinante sobreviveu ao mês do upgrade
  if (s.endMonth !== null && s.upgradeMonth !== null && s.upgradeMonth >= s.endMonth) {
    s.upgradeMonth = null;
    s.planAfter = null;
  }
}

export function generateDataset(seed = 20261021): Dataset {
  const rng = createRng(seed);
  const all: Subscriber[] = [];
  let id = 0;

  for (let m = FIRST_SIM_MONTH; m <= LAST_MONTH; m++) {
    const lambda = BASE_ACQUISITION * (1 + 0.01 * m) * SEASON[calMonth(m)];
    const baseCount = Math.max(0, Math.round(rng.normal(lambda, Math.sqrt(lambda))));
    for (let i = 0; i < baseCount; i++) all.push(makeSubscriber(rng, ++id, m, null));
    for (const spec of campaignSpecs(m)) {
      const extraCount = Math.max(0, Math.round(rng.normal(lambda * spec.extra, Math.sqrt(lambda * spec.extra))));
      for (let i = 0; i < extraCount; i++) all.push(makeSubscriber(rng, ++id, m, spec));
    }
  }

  for (const s of all) simulate(rng, s);

  // mantém só quem estava ativo em algum momento da janela observada (0..23)
  const subscribers = all
    .filter((s) => s.endMonth === null || s.endMonth >= 0)
    .sort((a, b) => a.startMonth - b.startMonth || a.id - b.id)
    .map((s, i) => ({ ...s, id: i + 1 }));

  const lastActive = subscribers.filter((s) => isActiveAt(s, LAST_MONTH)).length;
  return {
    meta: {
      brand: "Gazeta Meridiano",
      months: LAST_MONTH + 1,
      firstMonthLabel: monthLabel(0),
      lastMonthLabel: monthLabel(LAST_MONTH),
      events: EVENTS,
      goalActive: Math.ceil((lastActive * 1.09) / 100) * 100,
      goalMonth: LAST_MONTH + 2, // dez/26
      churnTarget: 0.03,
      seed,
    },
    subscribers,
  };
}

/** MRR total em m (conveniência para validação) */
export function totalMrr(ds: Dataset, m: number): number {
  let t = 0;
  for (const s of ds.subscribers) t += mrrAt(s, m);
  return t;
}

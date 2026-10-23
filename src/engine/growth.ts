// Camada de crescimento: funil de compra ponta a ponta, ponte de MRR e unit economics por canal.
// Funções puras sobre o Dataset, no mesmo padrão do motor (nada de UI, nada de IA).
//
// Honestidade dos dados: o dataset só tem quem ASSINOU. Compras e MRR são reais (calculados do dataset);
// visitantes, revisão e cartão são ESTIMADOS por taxas de conversão do canal com ruído determinístico,
// e o CAC é uma premissa sintética. A UI deve rotular isso.

import { cohortRetention, funnelByChannel } from "./metrics";
import { EVENT_REAJUSTE, isActiveAt, mrrAt, planAt } from "./model";
import { hash01 } from "./rng";
import { CHANNELS, PLANS } from "./types";
import type { Channel, Dataset, Plan } from "./types";

// ------------------------------------------------------------------ funil de compra ponta a ponta

export const FUNNEL_LABELS = ["Visitantes", "Iniciaram a compra", "Revisão do pedido", "Dados do cartão", "Compra concluída"] as const;
/** Rótulos das 4 transições entre etapas */
export const FUNNEL_STEPS = ["Visita → início", "Início → revisão", "Revisão → cartão", "Cartão → compra"] as const;

/** Parcela dos visitantes não assinantes que chega a ver o paywall/oferta, por canal */
const OFFER_REACH: Record<Channel, number> = {
  Orgânico: 0.38,
  Newsletter: 0.62,
  "Mídia paga (Meta)": 0.55,
  "Mídia paga (Google)": 0.5,
  "Social orgânico": 0.34,
  Parcerias: 0.58,
  Direto: 0.42,
};
/** Início da compra → revisão do pedido */
const START_TO_REVIEW: Record<Channel, number> = {
  Orgânico: 0.8,
  Newsletter: 0.88,
  "Mídia paga (Meta)": 0.72,
  "Mídia paga (Google)": 0.75,
  "Social orgânico": 0.7,
  Parcerias: 0.82,
  Direto: 0.85,
};
/** Revisão → dados do cartão (aqui mora o abandono por preço/frete de promoção) */
const REVIEW_TO_CARD: Record<Channel, number> = {
  Orgânico: 0.62,
  Newsletter: 0.7,
  "Mídia paga (Meta)": 0.52,
  "Mídia paga (Google)": 0.56,
  "Social orgânico": 0.5,
  Parcerias: 0.62,
  Direto: 0.66,
};

export interface FunnelStage {
  label: string;
  value: number;
  /** conversão vs etapa anterior (null na primeira) */
  fromPrev: number | null;
  /** conversão vs topo do funil */
  fromTop: number;
}

export interface FunnelChannelRow {
  channel: Channel;
  /** 5 etapas: visitantes, início, revisão, cartão, compra */
  stages: number[];
  /** 4 taxas entre etapas consecutivas */
  rates: number[];
  overall: number;
}

export interface FunnelLeak {
  channel: Channel;
  /** índice 1..3 em FUNNEL_STEPS */
  step: number;
  stepLabel: string;
  rate: number;
  benchmark: number;
  /** compras que o canal ganharia no período se igualasse o benchmark (mix total) nessa etapa */
  recoverable: number;
}

export interface FullFunnel {
  total: FunnelStage[];
  channels: FunnelChannelRow[];
  /** etapa com menor conversão do funil total (entre as etapas de compra, 1..3) */
  weakestStep: { step: number; label: string; rate: number };
  leak: FunnelLeak | null;
  /** conversão visitante → compra mês a mês dentro da janela */
  trend: { m: number; overall: number }[];
}

function stagesFor(channel: Channel, startsRaw: number, purchases: number, m: number): number[] {
  const noise = (k: string) => 0.97 + hash01(`${channel}:${k}:${m}`) * 0.06;
  const starts = Math.round(startsRaw);
  const review = Math.round(starts * START_TO_REVIEW[channel] * noise("rev"));
  // cartão nunca abaixo das compras reais (quem comprou passou pelo cartão)
  const card = Math.max(purchases, Math.round(review * REVIEW_TO_CARD[channel] * noise("card")));
  return [0, starts, Math.max(review, card), card, purchases];
}

/**
 * Funil visitantes (não assinantes) → início da compra → revisão → cartão → compra, por canal e total.
 * As compras e os inícios vêm de `funnelByChannel` (mesmos números que o Modo IA usa).
 */
export function fullFunnel(ds: Dataset, m0: number, m1: number): FullFunnel {
  const acc = new Map<Channel, number[]>(CHANNELS.map((c) => [c, [0, 0, 0, 0, 0]]));
  const trend: { m: number; overall: number }[] = [];

  for (let m = m0; m <= m1; m++) {
    let visitsM = 0;
    let buysM = 0;
    for (const row of funnelByChannel(ds, m, m)) {
      const st = stagesFor(row.channel, row.checkoutStarts, row.purchases, m);
      // visitantes = quem viu a oferta (paywallViews) ÷ alcance da oferta no canal
      st[0] = Math.max(st[1], Math.round(row.paywallViews / OFFER_REACH[row.channel]));
      const a = acc.get(row.channel) as number[];
      for (let i = 0; i < 5; i++) a[i] += st[i];
      visitsM += st[0];
      buysM += st[4];
    }
    trend.push({ m, overall: visitsM ? buysM / visitsM : 0 });
  }

  const ratesOf = (s: number[]) => [1, 2, 3, 4].map((i) => (s[i - 1] ? s[i] / s[i - 1] : 0));
  const channels: FunnelChannelRow[] = CHANNELS.map((channel) => {
    const stages = acc.get(channel) as number[];
    return { channel, stages, rates: ratesOf(stages), overall: stages[0] ? stages[4] / stages[0] : 0 };
  }).sort((a, b) => b.stages[4] - a.stages[4]);

  const sum = [0, 1, 2, 3, 4].map((i) => channels.reduce((a, c) => a + c.stages[i], 0));
  const total: FunnelStage[] = sum.map((value, i) => ({
    label: FUNNEL_LABELS[i],
    value,
    fromPrev: i === 0 ? null : sum[i - 1] ? value / sum[i - 1] : 0,
    fromTop: sum[0] ? value / sum[0] : 0,
  }));

  const totalRates = ratesOf(sum);
  let weakest = 1;
  for (let i = 2; i <= 3; i++) if (totalRates[i] < totalRates[weakest]) weakest = i;

  // maior vazamento: canal × etapa (1..3) que mais compras perde frente ao benchmark do mix total
  let leak: FunnelLeak | null = null;
  for (const c of channels) {
    for (let s = 1; s <= 3; s++) {
      const gap = totalRates[s] - c.rates[s];
      if (gap <= 0) continue;
      let downstream = 1;
      for (let k = s + 1; k <= 3; k++) downstream *= c.rates[k];
      const recoverable = Math.round(c.stages[s] * gap * downstream);
      if (!leak || recoverable > leak.recoverable) {
        leak = { channel: c.channel, step: s, stepLabel: FUNNEL_STEPS[s], rate: c.rates[s], benchmark: totalRates[s], recoverable };
      }
    }
  }

  return { total, channels, weakestStep: { step: weakest, label: FUNNEL_STEPS[weakest], rate: totalRates[weakest] }, leak, trend };
}

// ------------------------------------------------------------------ ponte de MRR

export type MrrStepKey = "start" | "new" | "promoEnd" | "hike" | "upgrades" | "churn" | "end";

export interface MrrStep {
  key: MrrStepKey;
  label: string;
  kind: "total" | "up" | "down";
  from: number;
  to: number;
  /** variação assinada (para totais, o próprio valor) */
  value: number;
}

export interface MrrBridge {
  start: number;
  end: number;
  net: number;
  steps: MrrStep[];
  /** componentes assinados, em R$ */
  parts: { new: number; promoEnd: number; hike: number; upgrades: number; churn: number };
}

/**
 * Decompõe a variação de MRR entre o fim de m0−1 e o fim de m1 por assinante e por mês:
 * novas assinaturas, fim de promoção (preço cheio chega), reajuste, upgrades/migrações (líquido) e cancelamentos.
 * Calcula em centavos inteiros, então início + componentes = fim exatamente.
 */
export function mrrBridge(ds: Dataset, m0: number, m1: number): MrrBridge {
  const cents = (x: number) => Math.round(x * 100);
  let start = 0;
  let end = 0;
  const p = { new: 0, promoEnd: 0, hike: 0, upgrades: 0, churn: 0 };

  for (const s of ds.subscribers) {
    start += cents(mrrAt(s, m0 - 1));
    end += cents(mrrAt(s, m1));
    for (let m = m0; m <= m1; m++) {
      const prev = cents(mrrAt(s, m - 1));
      const cur = cents(mrrAt(s, m));
      if (prev === cur) continue;
      if (prev === 0) p.new += cur;
      else if (cur === 0) p.churn -= prev;
      else if (s.upgradeMonth === m) p.upgrades += cur - prev;
      else if (s.promoDiscount > 0 && m === s.startMonth + s.promoMonths) p.promoEnd += cur - prev;
      else if (m === EVENT_REAJUSTE) p.hike += cur - prev;
      else p.upgrades += cur - prev; // resíduo (não deve ocorrer); mantém a identidade fechada
    }
  }

  const r = (c: number) => c / 100;
  const parts = { new: r(p.new), promoEnd: r(p.promoEnd), hike: r(p.hike), upgrades: r(p.upgrades), churn: r(p.churn) };
  const steps: MrrStep[] = [];
  let level = r(start);
  steps.push({ key: "start", label: "MRR inicial", kind: "total", from: 0, to: level, value: level });
  const move = (key: MrrStepKey, label: string, v: number) => {
    steps.push({ key, label, kind: v >= 0 ? "up" : "down", from: level, to: level + v, value: v });
    level += v;
  };
  move("new", "+ Novas assinaturas", parts.new);
  move("promoEnd", "+ Fim de promoção", parts.promoEnd);
  move("hike", "+ Reajuste", parts.hike);
  move("upgrades", "± Upgrades", parts.upgrades);
  move("churn", "− Cancelamentos", parts.churn);
  steps.push({ key: "end", label: "MRR final", kind: "total", from: 0, to: r(end), value: r(end) });

  return { start: r(start), end: r(end), net: r(end - start), steps, parts };
}

// ------------------------------------------------------------------ unit economics por canal

/** CAC médio por canal (R$ por assinante): PREMISSA sintética, não vem do dataset. */
export const CAC_BY_CHANNEL: Record<Channel, number> = {
  Orgânico: 38, // conteúdo + SEO alocados
  Newsletter: 26,
  "Mídia paga (Meta)": 135,
  "Mídia paga (Google)": 95,
  "Social orgânico": 48,
  Parcerias: 70, // repasse de parceiro
  Direto: 22,
};

export type EconTone = "bom" | "medio" | "ruim";
export const econTone = (ltvCac: number | null): EconTone | null => (ltvCac === null ? null : ltvCac >= 3 ? "bom" : ltvCac >= 1.5 ? "medio" : "ruim");

export interface UnitRow {
  channel: Channel;
  newSubs: number;
  cac: number;
  /** ticket médio realizado (R$/mês) nos primeiros 12 meses de vida */
  arpu: number | null;
  /** retenção em 6 meses (fração, Kaplan-Meier) */
  retention6: number | null;
  /** receita esperada em 12 meses por assinante: ARPU × Σ sobrevivência(0..11) */
  ltv12: number | null;
  ltvCac: number | null;
  /** meses de ARPU para pagar o CAC */
  payback: number | null;
  tone: EconTone | null;
}

export function unitEconomics(ds: Dataset, m0: number, m1: number): UnitRow[] {
  const curves = new Map(cohortRetention(ds, "channel", { minSize: 150 }).map((c) => [c.key, c.retention]));

  // ARPU realizado: MRR por assinante-mês, nos 12 primeiros meses de vida, de quem entrou em 0..LAST
  const rev = new Map<Channel, { sum: number; n: number }>();
  const news = new Map<Channel, number>();
  const spend = new Map<Channel, number>();
  for (const s of ds.subscribers) {
    if (s.startMonth < 0) continue;
    const last = Math.min(s.endMonth === null ? ds.meta.months - 1 : s.endMonth - 1, s.startMonth + 11, ds.meta.months - 1);
    const a = rev.get(s.channel) ?? rev.set(s.channel, { sum: 0, n: 0 }).get(s.channel)!;
    for (let m = s.startMonth; m <= last; m++) {
      a.sum += mrrAt(s, m);
      a.n++;
    }
    if (s.startMonth >= m0 && s.startMonth <= m1) {
      news.set(s.channel, (news.get(s.channel) ?? 0) + 1);
      const noise = 0.92 + hash01(`cac:${s.channel}:${s.startMonth}`) * 0.16;
      spend.set(s.channel, (spend.get(s.channel) ?? 0) + CAC_BY_CHANNEL[s.channel] * noise);
    }
  }

  return CHANNELS.map((channel) => {
    const n = news.get(channel) ?? 0;
    const cac = n ? (spend.get(channel) ?? 0) / n : CAC_BY_CHANNEL[channel];
    const r = rev.get(channel);
    const arpu = r && r.n ? r.sum / r.n : null;
    const curve = curves.get(channel);
    let ltv12: number | null = null;
    let retention6: number | null = null;
    if (curve && arpu !== null) {
      let last = 100;
      let surv = 0;
      for (let k = 0; k < 12; k++) {
        const v = curve[k];
        if (v !== null && v !== undefined) last = v;
        surv += last / 100;
      }
      ltv12 = arpu * surv;
      const r6 = curve[6];
      retention6 = r6 === null || r6 === undefined ? null : r6 / 100;
    }
    const ltvCac = ltv12 !== null && cac > 0 ? ltv12 / cac : null;
    return { channel, newSubs: n, cac, arpu, retention6, ltv12, ltvCac, payback: arpu && arpu > 0 ? cac / arpu : null, tone: econTone(ltvCac) };
  }).sort((a, b) => b.newSubs - a.newSubs);
}

// ------------------------------------------------------------------ planos: assinantes × receita

export interface PlanMixRow {
  plan: Plan;
  count: number;
  shareSubs: number;
  mrr: number;
  shareMrr: number;
  /** ticket médio realizado do plano no mês (R$) */
  arpu: number;
}

/** Participação de cada plano na base e no MRR do mês m (mostra quem pesa mais na receita que na base). */
export function planMix(ds: Dataset, m: number): PlanMixRow[] {
  const acc = new Map<Plan, { n: number; mrr: number }>(PLANS.map((p) => [p, { n: 0, mrr: 0 }]));
  let n = 0;
  let mrr = 0;
  for (const s of ds.subscribers) {
    if (!isActiveAt(s, m)) continue;
    const a = acc.get(planAt(s, m)) as { n: number; mrr: number };
    const v = mrrAt(s, m);
    a.n++;
    a.mrr += v;
    n++;
    mrr += v;
  }
  return PLANS.map((plan) => {
    const a = acc.get(plan) as { n: number; mrr: number };
    return { plan, count: a.n, shareSubs: n ? a.n / n : 0, mrr: a.mrr, shareMrr: mrr ? a.mrr / mrr : 0, arpu: a.n ? a.mrr / a.n : 0 };
  }).sort((a, b) => b.count - a.count);
}

// Motor de métricas: funções puras sobre o Dataset. Nenhuma toca na UI nem em IA.
// O dashboard e o "Modo IA" consomem SOMENTE estas funções → números sempre corretos.

import { monthLabel } from "./calendar";
import { LAST_MONTH, churnRisk, hazardAt, isActiveAt, mrrAt, planAt } from "./model";
import { hash01 } from "./rng";
import { diffs, linreg, mean, pearson, pctChange, round, sum } from "./stats";
import { CHANNELS, PLANS, TOUCHPOINTS } from "./types";
import type { Channel, Dataset, Editoria, Plan, Subscriber } from "./types";

// ------------------------------------------------------------------ série mensal

export interface MonthPoint {
  m: number;
  label: string;
  active: number;
  newSubs: number;
  cancelled: number;
  netAdds: number;
  /** churn mensal = cancelamentos do mês / ativos no fim do mês anterior (fração) */
  churnRate: number;
  involuntaryShare: number;
  upgrades: number;
  mrr: number;
  arpu: number;
  avgEngagement: number;
  /** % das novas assinaturas vindas de mídia paga (fração) */
  paidShareNew: number;
  /** NPS (janela móvel de 3 meses) */
  nps: number;
}

export const isPaid = (c: Channel) => c === "Mídia paga (Meta)" || c === "Mídia paga (Google)";

export function npsWindow(ds: Dataset, m: number, window = 3) {
  let promoters = 0;
  let detractors = 0;
  let responses = 0;
  let activeEnd = 0;
  for (const s of ds.subscribers) {
    if (isActiveAt(s, m)) activeEnd++;
    if (!s.npsRespondent) continue;
    // respondente conta uma vez por janela se esteve ativo em algum mês dela
    let counted = false;
    for (let k = 0; k < window && !counted; k++) if (isActiveAt(s, m - k)) counted = true;
    if (!counted) continue;
    responses++;
    if (s.npsScore >= 9) promoters++;
    else if (s.npsScore <= 6) detractors++;
  }
  const score = responses ? ((promoters - detractors) / responses) * 100 : 0;
  return { score: Math.round(score), responses, promoters, detractors, adoption: activeEnd ? responses / activeEnd : 0 };
}

export function buildSeries(ds: Dataset): MonthPoint[] {
  const n = ds.meta.months;
  const off = 1; // índice 0 do array = mês -1 (precisamos do ativo anterior ao mês 0)
  const active = new Array(n + off).fill(0);
  const mrr = new Array(n + off).fill(0);
  const eng = new Array(n + off).fill(0);
  const newSubs = new Array(n + off).fill(0);
  const newPaid = new Array(n + off).fill(0);
  const cancelled = new Array(n + off).fill(0);
  const involuntary = new Array(n + off).fill(0);
  const upgrades = new Array(n + off).fill(0);

  for (const s of ds.subscribers) {
    const from = Math.max(s.startMonth, -1);
    const to = Math.min(s.endMonth === null ? n - 1 : s.endMonth - 1, n - 1);
    for (let m = from; m <= to; m++) {
      active[m + off]++;
      mrr[m + off] += mrrAt(s, m);
      eng[m + off] += s.engagement;
    }
    if (s.startMonth >= 0 && s.startMonth < n) {
      newSubs[s.startMonth + off]++;
      if (isPaid(s.channel)) newPaid[s.startMonth + off]++;
    }
    if (s.endMonth !== null && s.endMonth >= 0 && s.endMonth < n) {
      cancelled[s.endMonth + off]++;
      if (s.nature === "Involuntário") involuntary[s.endMonth + off]++;
    }
    if (s.upgradeMonth !== null && s.upgradeMonth >= 0 && s.upgradeMonth < n) upgrades[s.upgradeMonth + off]++;
  }

  const out: MonthPoint[] = [];
  for (let m = 0; m < n; m++) {
    const i = m + off;
    out.push({
      m,
      label: monthLabel(m),
      active: active[i],
      newSubs: newSubs[i],
      cancelled: cancelled[i],
      netAdds: newSubs[i] - cancelled[i],
      churnRate: active[i - 1] ? cancelled[i] / active[i - 1] : 0,
      involuntaryShare: cancelled[i] ? involuntary[i] / cancelled[i] : 0,
      upgrades: upgrades[i],
      mrr: Math.round(mrr[i]),
      arpu: active[i] ? round(mrr[i] / active[i], 2) : 0,
      avgEngagement: active[i] ? round(eng[i] / active[i], 1) : 0,
      paidShareNew: newSubs[i] ? newPaid[i] / newSubs[i] : 0,
      nps: npsWindow(ds, m).score,
    });
  }
  return out;
}

// ------------------------------------------------------------------ KPIs com delta e sparkline

export interface Kpi {
  value: number;
  /** variação vs mês anterior (fração) */
  mom: number;
  /** variação vs mesmo mês do ano anterior (fração); null se não há 12 meses de histórico */
  yoy: number | null;
  /** valor 12 meses antes (para deltas em p.p.) */
  yearAgo: number | null;
  spark: number[];
}

export function kpi(series: MonthPoint[], key: keyof Omit<MonthPoint, "label">, m: number): Kpi {
  const v = (i: number) => series[i][key] as number;
  return {
    value: v(m),
    mom: m > 0 ? pctChange(v(m), v(m - 1)) : 0,
    yoy: m >= 12 ? pctChange(v(m), v(m - 12)) : null,
    yearAgo: m >= 12 ? v(m - 12) : null,
    spark: series.slice(Math.max(0, m - 11), m + 1).map((p) => p[key] as number),
  };
}

// ------------------------------------------------------------------ coortes / retenção

export type CohortBy = "month" | "channel" | "plan" | "campaign" | "interest" | "promo";

export function cohortKey(s: Subscriber, by: CohortBy): string {
  switch (by) {
    case "month":
      return monthLabel(s.startMonth);
    case "channel":
      return s.channel;
    case "plan":
      return s.plan;
    case "campaign":
      return s.campaign ?? "Base regular";
    case "interest":
      return s.interest;
    case "promo":
      return s.promoDiscount > 0 && s.plan !== "Anual" ? "Com promoção" : "Sem promoção";
  }
}

export interface Cohort {
  key: string;
  size: number;
  firstStart: number;
  /** retention[k] = % ainda ativo k meses após a entrada (Kaplan-Meier); null quando há poucos observáveis (censura à direita) */
  retention: (number | null)[];
}

/**
 * Curva de retenção por grupo, estimada por Kaplan-Meier (produto-limite).
 * Em cada idade k, só entram no denominador os assinantes que (a) ainda estavam ativos em k−1 e
 * (b) já podem ser observados em k (startMonth + k ≤ último mês). Isso trata a censura à direita:
 * "ainda não deu tempo" não vira "ficou", e a curva é monotônica mesmo quando o grupo mistura safras.
 */
export function cohortRetention(ds: Dataset, by: CohortBy, opts: { minSize?: number; minObservable?: number; maxAge?: number } = {}): Cohort[] {
  const { minSize = 60, minObservable = 40, maxAge = 18 } = opts;
  const groups = new Map<string, Subscriber[]>();
  for (const s of ds.subscribers) {
    if (s.startMonth < 0) continue; // coortes anteriores à janela têm início desconhecido
    const k = cohortKey(s, by);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(s);
  }
  const out: Cohort[] = [];
  for (const [key, subs] of groups) {
    if (subs.length < minSize) continue;
    const retention: (number | null)[] = [100];
    let surv = 1;
    let stop = false;
    for (let k = 1; k <= maxAge; k++) {
      if (stop) {
        retention.push(null);
        continue;
      }
      let atRisk = 0;
      let events = 0;
      for (const s of subs) {
        if (s.startMonth + k > LAST_MONTH) continue; // ainda não observável
        if (s.endMonth !== null && s.endMonth <= s.startMonth + k - 1) continue; // já saiu antes
        atRisk++;
        if (s.endMonth === s.startMonth + k) events++;
      }
      if (atRisk < minObservable) {
        stop = true;
        retention.push(null);
        continue;
      }
      surv *= 1 - events / atRisk;
      retention.push(round(surv * 100, 1));
    }
    out.push({ key, size: subs.length, firstStart: Math.min(...subs.map((s) => s.startMonth)), retention });
  }
  return out.sort((a, b) => a.firstStart - b.firstStart);
}

// ------------------------------------------------------------------ churn por segmento

export interface SegmentChurn {
  key: string;
  exposure: number; // assinante-mês em risco
  cancels: number;
  /** churn mensal médio (fração) */
  rate: number;
}

/** Churn mensal por segmento na janela [m0, m1]: cancelamentos / assinantes-mês expostos */
export function churnBySegment(ds: Dataset, m0: number, m1: number, keyFn: (s: Subscriber) => string): SegmentChurn[] {
  const map = new Map<string, { exposure: number; cancels: number }>();
  for (const s of ds.subscribers) {
    const key = keyFn(s);
    let acc = map.get(key);
    for (let m = m0; m <= m1; m++) {
      if (isActiveAt(s, m - 1)) {
        if (!acc) acc = map.set(key, { exposure: 0, cancels: 0 }).get(key)!;
        acc.exposure++;
        if (s.endMonth === m) acc.cancels++;
      }
    }
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, ...v, rate: v.exposure ? v.cancels / v.exposure : 0 }))
    .sort((a, b) => b.rate - a.rate);
}

// ------------------------------------------------------------------ motivos de cancelamento (donut duplo)

export interface ReasonRow {
  nature: string;
  reason: string;
  count: number;
  share: number;
}

export function churnReasons(ds: Dataset, m0: number, m1: number): { total: number; rows: ReasonRow[]; byNature: { nature: string; count: number; share: number }[] } {
  const rows = new Map<string, ReasonRow>();
  let total = 0;
  for (const s of ds.subscribers) {
    if (s.endMonth === null || s.endMonth < m0 || s.endMonth > m1 || !s.cancelReason || !s.nature) continue;
    total++;
    const k = `${s.nature}|${s.cancelReason}`;
    const r = rows.get(k) ?? rows.set(k, { nature: s.nature, reason: s.cancelReason, count: 0, share: 0 }).get(k)!;
    r.count++;
  }
  const list = [...rows.values()].map((r) => ({ ...r, share: total ? r.count / total : 0 })).sort((a, b) => b.count - a.count);
  const nat = new Map<string, number>();
  for (const r of list) nat.set(r.nature, (nat.get(r.nature) ?? 0) + r.count);
  const byNature = [...nat.entries()].map(([nature, count]) => ({ nature, count, share: total ? count / total : 0 })).sort((a, b) => b.count - a.count);
  return { total, rows: list, byNature };
}

// ------------------------------------------------------------------ composição (waffle)

export interface CompositionRow {
  key: string;
  count: number;
  share: number;
}

export function composition(ds: Dataset, m: number, by: "plan" | "channel" | "interest" | "touchpoint"): CompositionRow[] {
  const map = new Map<string, number>();
  let total = 0;
  for (const s of ds.subscribers) {
    if (!isActiveAt(s, m)) continue;
    total++;
    const k = by === "plan" ? planAt(s, m) : by === "channel" ? s.channel : by === "interest" ? s.interest : s.touchpoint;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([key, count]) => ({ key, count, share: total ? count / total : 0 })).sort((a, b) => b.count - a.count);
}

/** Converte participações em 100 células inteiras (waffle 10x10), maior-resto. */
export function toWaffle(rows: CompositionRow[], cells = 100): { key: string; cells: number }[] {
  const raw = rows.map((r) => ({ key: r.key, exact: r.share * cells }));
  const out = raw.map((r) => ({ key: r.key, cells: Math.floor(r.exact), rem: r.exact - Math.floor(r.exact) }));
  let left = cells - sum(out.map((o) => o.cells));
  for (const o of [...out].sort((a, b) => b.rem - a.rem)) {
    if (left <= 0) break;
    o.cells++;
    left--;
  }
  return out.map(({ key, cells: c }) => ({ key, cells: c }));
}

// ------------------------------------------------------------------ Sankey

export interface SankeyNode {
  id: string;
  label: string;
  group: string;
}
export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}
export interface Sankey {
  nodes: SankeyNode[];
  links: SankeyLink[];
  total: number;
}

const OUTCOMES = {
  stay: { id: "out:stay", label: "Permanecem", group: "positivo" },
  upgrade: { id: "out:upgrade", label: "Fizeram upgrade", group: "positivo" },
  vol: { id: "out:vol", label: "Cancelaram (voluntário)", group: "negativo" },
  invol: { id: "out:invol", label: "Cancelaram (pagamento)", group: "negativo" },
  end: { id: "out:end", label: "Não renovaram", group: "negativo" },
};

/** Fluxo de assinantes: base + novas → plano → desfecho no período [m0, m1] */
export function subscriberFlow(ds: Dataset, m0: number, m1: number): Sankey {
  const links = new Map<string, number>();
  const bump = (a: string, b: string) => links.set(`${a}>${b}`, (links.get(`${a}>${b}`) ?? 0) + 1);
  let baseCount = 0;
  let newCount = 0;

  for (const s of ds.subscribers) {
    const inBase = isActiveAt(s, m0 - 1);
    const isNew = s.startMonth >= m0 && s.startMonth <= m1;
    if (!inBase && !isNew) continue;
    const origin = inBase ? "base" : "novas";
    inBase ? baseCount++ : newCount++;
    const plan = inBase ? planAt(s, m0 - 1) : s.plan;
    const planId = `plan:${plan}`;
    bump(origin, planId);

    let outcome = OUTCOMES.stay;
    if (s.endMonth !== null && s.endMonth >= m0 && s.endMonth <= m1) {
      outcome = s.nature === "Involuntário" ? OUTCOMES.invol : s.nature === "Fim de contrato" ? OUTCOMES.end : OUTCOMES.vol;
    } else if (s.upgradeMonth !== null && s.upgradeMonth >= m0 && s.upgradeMonth <= m1) {
      outcome = OUTCOMES.upgrade;
    }
    bump(planId, outcome.id);
  }

  const nodes: SankeyNode[] = [
    { id: "base", label: `Base em ${monthLabel(m0 - 1)}`, group: "origem" },
    { id: "novas", label: "Novas assinaturas", group: "origem" },
    ...PLANS.map((p) => ({ id: `plan:${p}`, label: p, group: "plano" })),
    ...Object.values(OUTCOMES),
  ];
  const parsed: SankeyLink[] = [...links.entries()].map(([k, value]) => {
    const [source, target] = k.split(">");
    return { source, target, value };
  });
  return { nodes, links: parsed, total: baseCount + newCount };
}

/** Fluxo de aquisição: canal → ponto de contato (CRO) → plano, só novas assinaturas em [m0, m1] */
export function acquisitionFlow(ds: Dataset, m0: number, m1: number): Sankey {
  const links = new Map<string, number>();
  const bump = (a: string, b: string) => links.set(`${a}>${b}`, (links.get(`${a}>${b}`) ?? 0) + 1);
  let total = 0;
  for (const s of ds.subscribers) {
    if (s.startMonth < m0 || s.startMonth > m1) continue;
    total++;
    bump(`ch:${s.channel}`, `tp:${s.touchpoint}`);
    bump(`tp:${s.touchpoint}`, `pl:${s.plan}`);
  }
  const nodes: SankeyNode[] = [
    ...CHANNELS.map((c) => ({ id: `ch:${c}`, label: c, group: "canal" })),
    ...TOUCHPOINTS.map((t) => ({ id: `tp:${t}`, label: t, group: "ponto de contato" })),
    ...PLANS.map((p) => ({ id: `pl:${p}`, label: p, group: "plano" })),
  ];
  const parsed = [...links.entries()].map(([k, value]) => {
    const [source, target] = k.split(">");
    return { source, target, value };
  });
  return { nodes, links: parsed, total };
}

// ------------------------------------------------------------------ funil por canal

const FUNNEL_RATES: Record<Channel, { paywallToCheckout: number; checkoutToPurchase: number }> = {
  Orgânico: { paywallToCheckout: 0.032, checkoutToPurchase: 0.38 },
  Newsletter: { paywallToCheckout: 0.09, checkoutToPurchase: 0.52 },
  "Mídia paga (Meta)": { paywallToCheckout: 0.016, checkoutToPurchase: 0.29 },
  "Mídia paga (Google)": { paywallToCheckout: 0.024, checkoutToPurchase: 0.33 },
  "Social orgânico": { paywallToCheckout: 0.014, checkoutToPurchase: 0.27 },
  Parcerias: { paywallToCheckout: 0.04, checkoutToPurchase: 0.41 },
  Direto: { paywallToCheckout: 0.06, checkoutToPurchase: 0.47 },
};

export interface FunnelRow {
  channel: Channel;
  paywallViews: number;
  checkoutStarts: number;
  purchases: number;
  paywallToCheckout: number;
  checkoutToPurchase: number;
  overall: number;
}

/**
 * Funil por canal. As compras são reais (assinantes do dataset); as etapas anteriores são
 * derivadas das taxas de conversão do canal com ruído determinístico por canal×mês.
 */
export function funnelByChannel(ds: Dataset, m0: number, m1: number): FunnelRow[] {
  const perMonth = new Map<string, number>(); // `${canal}:${mês}` → compras
  for (const s of ds.subscribers) {
    if (s.startMonth < m0 || s.startMonth > m1) continue;
    const k = `${s.channel}:${s.startMonth}`;
    perMonth.set(k, (perMonth.get(k) ?? 0) + 1);
  }
  return CHANNELS.map((channel) => {
    const r = FUNNEL_RATES[channel];
    let purchases = 0;
    let checkoutStarts = 0;
    for (let m = m0; m <= m1; m++) {
      const p = perMonth.get(`${channel}:${m}`) ?? 0;
      const noise = 0.94 + hash01(`${channel}:${m}`) * 0.12;
      purchases += p;
      checkoutStarts += p / (r.checkoutToPurchase * noise);
    }
    checkoutStarts = Math.round(checkoutStarts);
    const paywallViews = Math.round(checkoutStarts / r.paywallToCheckout);
    return {
      channel,
      paywallViews,
      checkoutStarts,
      purchases,
      paywallToCheckout: paywallViews ? checkoutStarts / paywallViews : 0,
      checkoutToPurchase: checkoutStarts ? purchases / checkoutStarts : 0,
      overall: paywallViews ? purchases / paywallViews : 0,
    };
  }).sort((a, b) => b.purchases - a.purchases);
}

// ------------------------------------------------------------------ correlação / sinergia

export type SeriesKey = "newSubs" | "cancelled" | "churnRate" | "nps" | "arpu" | "mrr" | "avgEngagement" | "paidShareNew" | "active" | "upgrades";

export interface CorrelationMatrix {
  keys: SeriesKey[];
  r: number[][];
  n: number;
  mode: "diff" | "level";
}

/**
 * Matriz de correlação entre séries mensais.
 * mode "diff" (padrão) usa variações mês a mês: duas séries com tendência sempre parecem
 * correlacionadas em nível (correlação espúria); em diferenças só sobra o co-movimento real.
 */
export function correlationMatrix(series: MonthPoint[], keys: SeriesKey[], mode: "diff" | "level" = "diff", window = 24): CorrelationMatrix {
  const cols = keys.map((k) => {
    const xs = series.slice(-window).map((p) => p[k] as number);
    return mode === "diff" ? diffs(xs) : xs;
  });
  const r = keys.map((_, i) => keys.map((_, j) => (i === j ? 1 : round(pearson(cols[i], cols[j]), 2))));
  return { keys, r, n: cols[0]?.length ?? 0, mode };
}

/** Correlação entre x[t] e y[t+lag] (níveis; use com séries estacionárias, como taxas e participações) */
export function lagCorrelation(series: MonthPoint[], x: SeriesKey, y: SeriesKey, lag: number): number {
  const xs = series.map((p) => p[x] as number);
  const ys = series.map((p) => p[y] as number);
  return round(pearson(xs.slice(0, xs.length - lag), ys.slice(lag)), 2);
}

// ------------------------------------------------------------------ projeção vs meta

export interface Projection {
  points: { m: number; label: string; value: number }[];
  goal: number;
  goalMonth: number;
  projectedAtGoal: number;
  gap: number;
  /** adições líquidas por mês necessárias para bater a meta */
  requiredNetAdds: number;
  currentNetAdds: number;
  onTrack: boolean;
}

export function projectActive(series: MonthPoint[], goal: number, goalMonth: number, lookback = 6): Projection {
  const last = series[series.length - 1];
  const recent = series.slice(-lookback).map((p) => p.active);
  const { slope } = linreg(recent);
  const points: Projection["points"] = [];
  for (let m = last.m + 1; m <= goalMonth; m++) {
    points.push({ m, label: monthLabel(m), value: Math.round(last.active + slope * (m - last.m)) });
  }
  const projectedAtGoal = points.length ? points[points.length - 1].value : last.active;
  const monthsLeft = Math.max(1, goalMonth - last.m);
  return {
    points,
    goal,
    goalMonth,
    projectedAtGoal,
    gap: goal - projectedAtGoal,
    requiredNetAdds: Math.round((goal - last.active) / monthsLeft),
    currentNetAdds: Math.round(slope),
    onTrack: projectedAtGoal >= goal,
  };
}

// ------------------------------------------------------------------ risco de saída / mapa de assinantes

export interface AtRiskRow {
  id: number;
  name: string;
  avatarSeed: string;
  tenureMonths: number;
  engagement: number;
  plan: Plan;
  channel: Channel;
  interest: Editoria;
  risk: number; // % de cancelar nos próximos 3 meses
  mrr: number;
  driver: "promoção acabando" | "baixo engajamento" | "renovação anual" | "canal de risco" | "geral";
}

export const CRITICAL_RISK = 35;

export function atRisk(ds: Dataset, m: number) {
  const rows: AtRiskRow[] = [];
  for (const s of ds.subscribers) {
    if (!isActiveAt(s, m)) continue;
    const risk = churnRisk(s, m, 3);
    const future = [1, 2, 3].map((i) => hazardAt(s, m + i));
    const driver: AtRiskRow["driver"] = future.some((h) => h.promoCliff)
      ? "promoção acabando"
      : future.some((h) => h.renewal)
        ? "renovação anual"
        : s.engagement < 40
          ? "baixo engajamento"
          : isPaid(s.channel)
            ? "canal de risco"
            : "geral";
    rows.push({
      id: s.id,
      name: s.name,
      avatarSeed: s.avatarSeed,
      tenureMonths: m - s.startMonth,
      engagement: s.engagement,
      plan: planAt(s, m),
      channel: s.channel,
      interest: s.interest,
      risk,
      mrr: mrrAt(s, m),
      driver,
    });
  }
  const critical = rows.filter((r) => r.risk >= CRITICAL_RISK);
  const byEditoria = new Map<string, number>();
  for (const r of critical) byEditoria.set(r.interest, (byEditoria.get(r.interest) ?? 0) + 1);
  const topEditoria = [...byEditoria.entries()].sort((a, b) => b[1] - a[1])[0];
  const driverCount = new Map<string, number>();
  for (const r of critical) driverCount.set(r.driver, (driverCount.get(r.driver) ?? 0) + 1);
  const topDriver = [...driverCount.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    active: rows.length,
    critical: critical.length,
    criticalShare: rows.length ? critical.length / rows.length : 0,
    mrrAtRisk: round(sum(critical.map((r) => r.mrr)), 0),
    avgRiskCritical: round(mean(critical.map((r) => r.risk)), 0),
    topEditoria: topEditoria ? { key: topEditoria[0], count: topEditoria[1] } : null,
    topDriver: topDriver ? { key: topDriver[0], count: topDriver[1] } : null,
    /** maiores riscos primeiro */
    top: [...rows].sort((a, b) => b.risk - a.risk || b.mrr - a.mrr),
  };
}

/** Amostra determinística de N assinantes para o scatter "mapa de assinantes" (mistura risco alto + aleatórios) */
export function peopleMap(ds: Dataset, m: number, n = 60): AtRiskRow[] {
  const { top } = atRisk(ds, m);
  const hotCount = Math.round(n * 0.35);
  const hot = top.slice(0, hotCount);
  const rest = top
    .slice(hotCount)
    .sort((a, b) => hash01(`map:${a.id}`) - hash01(`map:${b.id}`))
    .slice(0, n - hotCount);
  return [...hot, ...rest];
}

// ------------------------------------------------------------------ saúde por editoria

export interface EditoriaHealth {
  editoria: Editoria;
  active: number;
  share: number;
  avgEngagement: number;
  /** churn mensal médio dos últimos 3 meses (fração) */
  churn3m: number;
  /** variação do nº de ativos vs 12 meses antes (fração) */
  yoy: number | null;
  /** 0–100: 55% engajamento + 45% estabilidade (100 − churn*1200, limitado) */
  score: number;
}

export function editoriaHealth(ds: Dataset, m: number): EditoriaHealth[] {
  const churn = new Map(churnBySegment(ds, m - 2, m, (s) => s.interest).map((c) => [c.key, c.rate]));
  const out = new Map<string, { active: number; eng: number; before: number }>();
  let total = 0;
  for (const s of ds.subscribers) {
    const k = s.interest;
    const e = out.get(k) ?? out.set(k, { active: 0, eng: 0, before: 0 }).get(k)!;
    if (isActiveAt(s, m)) {
      e.active++;
      e.eng += s.engagement;
      total++;
    }
    if (m >= 12 && isActiveAt(s, m - 12)) e.before++;
  }
  return [...out.entries()]
    .map(([k, v]) => {
      const avg = v.active ? v.eng / v.active : 0;
      const c = churn.get(k) ?? 0;
      const stability = Math.max(0, Math.min(100, 100 - c * 1200));
      return {
        editoria: k as Editoria,
        active: v.active,
        share: total ? v.active / total : 0,
        avgEngagement: round(avg, 1),
        churn3m: c,
        yoy: m >= 12 && v.before ? pctChange(v.active, v.before) : null,
        score: Math.round(0.55 * avg + 0.45 * stability),
      };
    })
    .sort((a, b) => b.score - a.score);
}

// Camada de dados do dashboard: chama SOMENTE o motor (src/engine) e monta view-models de apresentação.
import { useMemo } from "react";
import { answer } from "@/engine/ask";
import { explainAnswer, EXPLAIN_FOLLOWUP } from "@/engine/askexplain";
import { growthAnswer } from "@/engine/askgrowth";
import { priceAnswer } from "@/engine/askprice";
import type { AiAnswer } from "@/engine/ask";
import { monthLabel } from "@/engine/calendar";
import { generateDataset } from "@/engine/generate";
import { atRisk, buildSeries, churnReasons, cohortRetention, composition, correlationMatrix, CRITICAL_RISK, editoriaHealth, funnelByChannel, kpi, lagCorrelation, peopleMap, projectActive, toWaffle } from "@/engine/metrics";
import type { AtRiskRow, Cohort, CohortBy, CorrelationMatrix, Kpi, MonthPoint, SeriesKey } from "@/engine/metrics";
import { fullFunnel, mrrBridge, planMix, unitEconomics } from "@/engine/growth";
import { generateInsights } from "@/engine/insights";
import type { Insight, Severity } from "@/engine/insights";
import { fmtBRL, fmtBRLCompact, fmtInt, fmtPP, fmtPct, fmtSignedInt, fmtSignedPct } from "./format";

export type Direction = "up" | "down" | "flat";

export interface DeltaView {
  text: string;
  dir: Direction;
  /** true = bom para o negócio, false = ruim, null = neutro */
  good: boolean | null;
}

export interface KpiView {
  id: string;
  label: string;
  value: number;
  format: (n: number) => string;
  mom: DeltaView;
  yoy: DeltaView | null;
  caption?: string;
  spark: number[];
  kind: "spark" | "gauge";
}

const dirOf = (x: number): Direction => (Math.abs(x) < 1e-9 ? "flat" : x > 0 ? "up" : "down");
const delta = (x: number, text: string, higherIsBetter: boolean): DeltaView => {
  const dir = dirOf(x);
  return { text, dir, good: dir === "flat" ? null : (dir === "up") === higherIsBetter };
};
const prevOf = (k: Kpi) => (k.spark.length >= 2 ? k.spark[k.spark.length - 2] : k.value);

function compute() {
  const ds = generateDataset();
  const series = buildSeries(ds);
  const m = series.length - 1;
  const proj = projectActive(series, ds.meta.goalActive, ds.meta.goalMonth);
  const comp = composition(ds, m, "plan");
  const waffle = toWaffle(comp);
  const plans = planMix(ds, m);
  // Each expensive engine entry point runs once, inside the shared memoized computation.
  const risk = atRisk(ds, m);
  const people = peopleMap(ds, m, 60);
  const insights = generateInsights(ds);
  const correlations = {
    diff: correlationView(correlationMatrix(series, CORRELATION_KEYS, "diff")),
    level: correlationView(correlationMatrix(series, CORRELATION_KEYS, "level")),
  };
  const changes = CHANGE_KEYS.map((key) => monthlyChange(series, key, m)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const channelComp = composition(ds, m, "channel");
  const channelWaffle = toWaffle(channelComp);
  const cohorts = Object.fromEntries(COHORT_OPTIONS.map((o) => [o.by, cohortView(cohortRetention(ds, o.by))])) as Record<CohortSegment, CohortView>;
  const editorias = editoriaHealth(ds, m);
  const drivers = DRIVER_ORDER.map((key) => ({ key, color: DRIVER_COLORS[key], count: people.filter((p) => p.driver === key).length }));

  const kActive = kpi(series, "active", m);
  const kChurn = kpi(series, "churnRate", m);
  const kMrr = kpi(series, "mrr", m);
  const kArpu = kpi(series, "arpu", m);
  const kNps = kpi(series, "nps", m);

  const pctKpi = (id: string, label: string, k: Kpi, format: (n: number) => string): KpiView => ({
    id,
    label,
    value: k.value,
    format,
    mom: delta(k.mom, `${fmtSignedPct(k.mom)} vs mês ant.`, true),
    yoy: k.yoy === null ? null : delta(k.yoy, `${fmtSignedPct(k.yoy)} vs ano ant.`, true),
    spark: k.spark,
    kind: "spark",
  });

  const churnMom = kChurn.value - prevOf(kChurn);
  const npsMom = kNps.value - prevOf(kNps);

  const kpis: KpiView[] = [
    pctKpi("active", "Assinantes ativos", kActive, fmtInt),
    {
      id: "churn",
      label: "Churn mensal",
      value: kChurn.value,
      format: (n) => fmtPct(n, 1),
      mom: delta(churnMom, `${fmtPP(churnMom)} vs mês ant.`, false),
      yoy:
        kChurn.yearAgo === null
          ? null
          : delta(kChurn.value - kChurn.yearAgo, `${fmtPP(kChurn.value - kChurn.yearAgo)} vs ano ant.`, false),
      caption: `meta ${fmtPct(ds.meta.churnTarget, 1)}`,
      spark: kChurn.spark,
      kind: "spark",
    },
    pctKpi("mrr", "MRR", kMrr, fmtBRLCompact),
    pctKpi("arpu", "Ticket médio", kArpu, (n) => fmtBRL(n, 2)),
    {
      id: "nps",
      label: "NPS",
      value: kNps.value,
      format: (n) => `${n > 0 ? "+" : ""}${Math.round(n)}`,
      mom: delta(npsMom, `${fmtSignedInt(npsMom)} pts vs mês ant.`, true),
      yoy:
        kNps.yearAgo === null
          ? null
          : delta(kNps.value - kNps.yearAgo, `${fmtSignedInt(kNps.value - kNps.yearAgo)} pts vs ano ant.`, true),
      caption: "janela móvel de 3 meses",
      spark: kNps.spark,
      kind: "gauge",
    },
  ];

  const insightViews = insights.map((insight) => ({ ...insight, displayValue: formatInsightValue(insight) }));
  // Pauta do dia: os três achados mais graves do motor de regras, cada um com a pergunta que o aprofunda
  const agenda = insightViews.slice(0, AGENDA_SIZE).map((i) => ({ id: i.id, title: i.title, severity: i.severity, topic: i.topic, displayValue: i.displayValue, question: TOPIC_QUESTIONS[i.topic] }));

  return {
    ds,
    series,
    m,
    current: series[m],
    proj,
    comp,
    waffle,
    plans,
    kpis,
    goalLabel: monthLabel(ds.meta.goalMonth).toLowerCase(),
    risk,
    topRisk: diverseTopRisk(risk.top, 5),
    channelComp,
    channelWaffle,
    cohorts,
    editorias,
    people,
    drivers,
    criticalRisk: CRITICAL_RISK,
    correlations,
    lag: lagCorrelation(series, "paidShareNew", "churnRate", 3),
    changes,
    insights: insightViews,
    agenda,
    severityCounts: SEVERITIES.map((key) => ({ key, count: insights.filter((i) => i.severity === key).length })),
    topics: [...new Set(insights.map((i) => i.topic))].map((key) => ({ key, count: insights.filter((i) => i.topic === key).length })),
  };
}

export type DashboardData = ReturnType<typeof compute>;

let cache: DashboardData | null = null;
export function getDashboardData(): DashboardData {
  if (!cache) cache = compute();
  return cache;
}

export function useDashboardData(): DashboardData {
  return useMemo(getDashboardData, []);
}

const answerCache = new Map<string, AiAnswer>();
/** Called only from a scheduled browser task; no business calculations in AI components. */
export function getAiAnswer(question: string): AiAnswer {
  const cached = answerCache.get(question);
  if (cached) return cached;
  const { ds } = getDashboardData();
  // perguntas de preço que o roteador principal confundiria com a análise do reajuste
  const explained = explainAnswer(ds, question);
  let result = explained ?? growthAnswer(ds, question) ?? priceAnswer(ds, question) ?? answer(ds, question);
  // em toda análise de card, oferece a explicação de "como é calculado" como próxima pergunta
  const explainQ = !explained ? EXPLAIN_FOLLOWUP[result.intent] : undefined;
  if (explainQ && !result.followUps.includes(explainQ)) result = { ...result, followUps: [explainQ, ...result.followUps].slice(0, 4) };
  if (answerCache.size >= 50) answerCache.delete(answerCache.keys().next().value ?? "");
  answerCache.set(question, result);
  return result;
}

/** Cor categórica estável por plano (mesma em todos os gráficos) */
export const PLAN_COLORS: Record<string, string> = {
  Mensal: "var(--cat-1)",
  Anual: "var(--cat-2)",
  "Combo Streaming": "var(--cat-3)",
  Estudante: "var(--cat-4)",
};

// ------------------------------------------------------------------ janela fixa (motivos, funil, volume × qualidade, ponte)

/** Janela fixa de 6 meses terminando no mês de referência. */
export const WINDOW_MONTHS = 6;
export const WINDOW_LABEL = "últimos 6 meses";

const NATURE_ORDER = ["Voluntário", "Involuntário", "Fim de contrato"];

export function retentionTone(r: number | null): "bom" | "medio" | "ruim" | null {
  if (r === null) return null;
  return r >= 0.8 ? "bom" : r >= 0.6 ? "medio" : "ruim";
}

function computeWindow() {
  const { ds, m, series } = getDashboardData();
  const m0 = m - WINDOW_MONTHS + 1;
  const m1 = m;

  const reasons = churnReasons(ds, m0, m1);
  const natureRank = (n: string) => {
    const i = NATURE_ORDER.indexOf(n);
    return i === -1 ? 99 : i;
  };
  const byNature = [...reasons.byNature].sort((a, b) => natureRank(a.nature) - natureRank(b.nature));
  const reasonRows = [...reasons.rows].sort((a, b) => natureRank(a.nature) - natureRank(b.nature) || b.count - a.count);

  const funnel = funnelByChannel(ds, m0, m1);
  // Funil ponta a ponta, ponte de MRR e unit economics (src/engine/growth.ts)
  const journey = fullFunnel(ds, m0, m1);
  const mrr = mrrBridge(ds, m0, m1);
  const econ = unitEconomics(ds, m0, m1);
  const byOverall = [...funnel].sort((a, b) => b.overall - a.overall);

  // Volume × qualidade: compras no período e retenção em 6 meses por canal
  const ret = new Map(cohortRetention(ds, "channel", { minSize: 150 }).map((c) => [c.key, c.retention[6]]));
  const quality = [...funnel]
    .sort((a, b) => b.purchases - a.purchases)
    .map((f) => {
      const r = ret.get(f.channel);
      const retention6 = r === null || r === undefined ? null : r / 100;
      return { channel: f.channel, purchases: f.purchases, retention6, tone: retentionTone(retention6) };
    });

  // Ponte da base: início + novas − cancelamentos (por natureza) = fim; diferença residual vai para "Outros"
  const start = series[m0 - 1].active;
  const end = series[m1].active;
  const added = series.slice(m0, m1 + 1).reduce((a, p) => a + p.newSubs, 0);
  const nat = (n: string) => reasons.byNature.find((x) => x.nature === n)?.count ?? 0;
  const losses = [
    { key: "vol", label: "− Cancelamento voluntário", value: nat("Voluntário") },
    { key: "inv", label: "− Falha de pagamento", value: nat("Involuntário") },
    { key: "fim", label: "− Fim de contrato", value: nat("Fim de contrato") },
  ];
  const others = start + added - losses.reduce((a, l) => a + l.value, 0) - end;
  if (others !== 0) losses.push({ key: "outros", label: "− Outros", value: others });
  const bridgeSteps: BridgeStep[] = [];
  let level = start;
  bridgeSteps.push({ key: "start", label: `Base em ${series[m0 - 1].label}`, kind: "total", from: 0, to: start, value: start });
  bridgeSteps.push({ key: "new", label: "+ Novas assinaturas", kind: "up", from: level, to: level + added, value: added });
  level += added;
  for (const l of losses) {
    bridgeSteps.push({ key: l.key, label: l.label, kind: "down", from: level, to: level - l.value, value: -l.value });
    level -= l.value;
  }
  bridgeSteps.push({ key: "end", label: `Base em ${series[m1].label}`, kind: "total", from: 0, to: end, value: end });

  return {
    m0,
    m1,
    rangeLabel: `${series[m0].label} – ${series[m1].label}`,
    reasons: { total: reasons.total, byNature, rows: reasonRows },
    funnel,
    journey,
    mrr,
    econ,
    bestChannel: byOverall[0]?.channel ?? null,
    worstChannel: byOverall[byOverall.length - 1]?.channel ?? null,
    quality,
    bridge: { start, end, added, others, net: end - start, steps: bridgeSteps },
  };
}

export interface BridgeStep { key: string; label: string; kind: "total" | "up" | "down"; from: number; to: number; value: number }
export type WindowData = ReturnType<typeof computeWindow>;
let windowCache: WindowData | null = null;
export function getWindowData(): WindowData {
  if (!windowCache) windowCache = computeWindow();
  return windowCache;
}
export function useWindowData(): WindowData {
  return useMemo(getWindowData, []);
}

/** Cores por natureza do cancelamento; motivos usam tons da cor da natureza */
export const NATURE_COLORS: Record<string, string> = {
  Voluntário: "var(--cat-1)",
  Involuntário: "var(--danger)",
  "Fim de contrato": "var(--cat-3)",
};

export const METRIC_LABELS: Record<SeriesKey, string> = {
  newSubs: "novas assinaturas", cancelled: "cancelamentos", churnRate: "churn", nps: "NPS",
  arpu: "ticket médio", mrr: "MRR", avgEngagement: "engajamento", paidShareNew: "peso da mídia paga", active: "base ativa", upgrades: "upgrades",
};
const CORRELATION_KEYS: SeriesKey[] = ["newSubs", "cancelled", "churnRate", "nps", "arpu", "avgEngagement", "paidShareNew", "mrr"];
const CHANGE_KEYS: SeriesKey[] = ["active", "newSubs", "cancelled", "churnRate", "mrr", "arpu", "nps", "avgEngagement"];
export const SEVERITIES: Severity[] = ["perigo", "atenção", "positivo", "info"];
export const DRIVER_ORDER: AtRiskRow["driver"][] = ["promoção acabando", "baixo engajamento", "renovação anual", "canal de risco", "geral"];
export const DRIVER_COLORS: Record<AtRiskRow["driver"], string> = {
  "promoção acabando": "var(--cat-3)", "baixo engajamento": "var(--danger)", "renovação anual": "var(--cat-2)", "canal de risco": "var(--cat-4)", geral: "var(--cat-6)",
};
export const INSIGHT_TARGETS: Record<Insight["topic"], string> = {
  base: "evolution-card", churn: "evolution-card", meta: "evolution-card", coortes: "cohort-card", canais: "funnel-card", pagamento: "reasons-card", correlação: "correlation-card", risco: "risk-card", editorias: "editoria-card", preço: "kpi-section", nps: "kpi-section",
};

// ------------------------------------------------------------------ views do app
export const VIEW_IDS = ["geral", "aquisicao", "retencao", "risco", "simulador"] as const;
export type ViewId = (typeof VIEW_IDS)[number];
export function parseView(v: unknown): ViewId {
  return typeof v === "string" && (VIEW_IDS as readonly string[]).includes(v) ? (v as ViewId) : "geral";
}
/** Em qual view vive o card relacionado a cada tema de insight */
export const INSIGHT_VIEWS: Record<Insight["topic"], ViewId> = {
  base: "geral", churn: "geral", meta: "geral", preço: "geral", nps: "geral", coortes: "retencao", pagamento: "retencao", editorias: "retencao", canais: "aquisicao", correlação: "risco", risco: "risco",
};

/** Pergunta da Mesa de análise que aprofunda cada tema de insight (todas com intenção conhecida pelo ask.ts) */
export const TOPIC_QUESTIONS: Record<Insight["topic"], string> = {
  base: "Vamos bater a meta de dezembro?", churn: "Como está o churn?", meta: "Vamos bater a meta de dezembro?", coortes: "Compare as safras de campanha",
  canais: "Qual canal retém pior?", preço: "Como foi o reajuste de preço?", pagamento: "Por que os assinantes cancelam?", correlação: "Resumo dos principais alertas",
  nps: "Como está o NPS?", risco: "Quem está em risco de cancelar?", editorias: "Como estão as editorias?",
};
export const AGENDA_SIZE = 3;

/** Índice de cards para a barra de comandos (id do elemento → view em que ele vive) */
export const CARD_INDEX: { id: string; view: ViewId; label: string }[] = [
  { id: "kpi-section", view: "geral", label: "Indicadores principais" },
  { id: "evolution-card", view: "geral", label: "Evolução de assinantes" },
  { id: "funnel-card", view: "aquisicao", label: "Funil de compra" },
  { id: "acq-quality-card", view: "aquisicao", label: "Eficiência por canal · LTV × CAC" },
  { id: "cohort-card", view: "retencao", label: "Retenção por coorte" },
  { id: "editoria-card", view: "retencao", label: "Saúde por editoria" },
  { id: "bridge-card", view: "retencao", label: "Da base inicial à final" },
  { id: "mrr-bridge-card", view: "retencao", label: "Ponte de MRR" },
  { id: "reasons-card", view: "retencao", label: "Motivos de cancelamento" },
  { id: "risk-card", view: "risco", label: "Mapa de assinantes em risco" },
  { id: "correlation-card", view: "risco", label: "Rede de correlação" },
  { id: "insights-card", view: "risco", label: "Insights do motor de regras" },
  { id: "simulator-card", view: "simulador", label: "Simulador e se" },
];

/** Cor categórica estável por canal (mesma em todos os gráficos) */
export const CHANNEL_COLORS: Record<string, string> = {
  Orgânico: "var(--cat-1)", Newsletter: "var(--cat-4)", "Mídia paga (Meta)": "var(--cat-5)", "Mídia paga (Google)": "var(--cat-3)", "Social orgânico": "var(--cat-2)", Parcerias: "var(--cat-6)", Direto: "var(--positive-fill)",
};

export const COHORT_OPTIONS = [
  { by: "campaign", label: "Campanha" },
  { by: "channel", label: "Canal" },
  { by: "plan", label: "Plano" },
  { by: "promo", label: "Promoção" },
] as const satisfies readonly { by: CohortBy; label: string }[];
export type CohortSegment = (typeof COHORT_OPTIONS)[number]["by"];
export const COHORT_MAX_AGE = 12;
export interface CohortView {
  keys: string[];
  sizes: Record<string, number>;
  /** M0..M12; valores como fração (retenção do motor / 100), null = sem observação suficiente */
  rows: { age: string; values: Record<string, number | null> }[];
}
export function cohortView(cohorts: Cohort[]): CohortView {
  return {
    keys: cohorts.map((c) => c.key),
    sizes: Object.fromEntries(cohorts.map((c) => [c.key, c.size])),
    rows: Array.from({ length: COHORT_MAX_AGE + 1 }, (_, k) => ({
      age: `M${k}`,
      values: Object.fromEntries(cohorts.map((c) => { const v = c.retention[k]; return [c.key, v === null || v === undefined ? null : v / 100]; })),
    })),
  };
}

export function correlationView(cm: CorrelationMatrix) {
  const pairs = cm.keys.flatMap((a, i) => cm.keys.slice(i + 1).map((b, offset) => ({ a, b, i, j: i + offset + 1, r: cm.r[i][i + offset + 1] })));
  const strongest = [...pairs].sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
  return { ...cm, edges: pairs.filter((p) => Math.abs(p.r) >= 0.35), strongest };
}

export function monthlyChange(series: MonthPoint[], key: SeriesKey, m: number) {
  const metric = kpi(series, key, m);
  const before = metric.spark.at(-2) ?? metric.value;
  const value = key === "nps" || key === "churnRate" ? metric.value - before : metric.mom;
  const unit = key === "nps" ? "pontos" : key === "churnRate" ? "p.p." : "%";
  const formatted = key === "nps" ? `${fmtSignedInt(value)} pts` : key === "churnRate" ? fmtPP(value) : fmtSignedPct(value);
  return { key, label: METRIC_LABELS[key], value, unit, formatted, dir: dirOf(value), good: value === 0 ? null : (value > 0) === !(key === "cancelled" || key === "churnRate") };
}

export function formatInsightValue(i: Insight): string | null {
  if (i.value === null) return null;
  if (i.topic === "correlação") return `r = ${i.value.toFixed(2).replace(".", ",")}`;
  if (i.topic === "coortes" || i.topic === "canais" || i.id === "reajuste") return fmtPP(i.value);
  if (i.topic === "nps") return `${fmtSignedInt(i.value)} pts`;
  if (["churn", "pagamento"].includes(i.topic) || i.id === "penhasco-promo") return fmtPct(i.value);
  return fmtInt(i.value);
}

/** Maior risco de cada gatilho distinto, completado pelos próximos maiores; ordenado por risco. */
export function diverseTopRisk(top: AtRiskRow[], n: number): AtRiskRow[] {
  const picked: AtRiskRow[] = [];
  const seen = new Set<string>();
  for (const r of top) {
    if (picked.length >= n) break;
    if (!seen.has(r.driver)) { seen.add(r.driver); picked.push(r); }
  }
  for (const r of top) {
    if (picked.length >= n) break;
    if (!picked.includes(r)) picked.push(r);
  }
  return picked.sort((a, b) => b.risk - a.risk || b.mrr - a.mrr);
}

// ------------------------------------------------------------------ Modo IA: card analisável → pergunta
export const AI_TARGETS = {
  "kpi-active": { label: "Assinantes ativos", question: "Vamos bater a meta de dezembro?" },
  "kpi-churn": { label: "Churn mensal", question: "Como está o churn?" },
  "kpi-mrr": { label: "MRR", question: "Qual a composição por plano?" },
  "kpi-arpu": { label: "Ticket médio", question: "Qual a composição por plano?" },
  "kpi-nps": { label: "NPS", question: "Como está o NPS?" },
  evolution: { label: "Evolução de assinantes", question: "Vamos bater a meta de dezembro?" },
  "flow-bars": { label: "Novas × cancelamentos", question: "Como está o churn?" },
  "waffle-plans": { label: "Planos", question: "Qual a composição por plano?" },
  reasons: { label: "Motivos de cancelamento", question: "Por que os assinantes cancelam?" },
  funnel: { label: "Funil por canal", question: "Qual canal retém pior?" },
  "acq-quality": { label: "Volume × qualidade por canal", question: "Qual canal retém pior?" },
  "waffle-channels": { label: "Canais", question: "Qual canal retém pior?" },
  cohort: { label: "Retenção por coorte", question: "Compare as safras de campanha" },
  editorias: { label: "Saúde por editoria", question: "Como estão as editorias?" },
  "at-risk": { label: "Em risco agora", question: "Quem está em risco de cancelar?" },
  "risk-map": { label: "Mapa de assinantes em risco", question: "Quem está em risco de cancelar?" },
  "risk-panel": { label: "Detalhe e estatísticas", question: "Quem está em risco de cancelar?" },
  insights: { label: "Insights", question: "Resumo dos principais alertas" },
  "insights-full": { label: "Insights do motor de regras", question: "Resumo dos principais alertas" },
  changes: { label: "Variação mês a mês", question: "Resumo dos principais alertas" },
  correlation: { label: "Rede de correlação", question: "Resumo dos principais alertas" },
  "base-bridge": { label: "Da base inicial à final", question: "Como está o churn?" },
  "mrr-bridge": { label: "Ponte de MRR", question: "Como foi o reajuste de preço?" },
  simulator: { label: "Simulador e se", question: "Vamos bater a meta de dezembro?" },
  price: { label: "Preço", question: "Como foi o reajuste de preço?" },
} as const satisfies Record<string, { label: string; question: string }>;
export type AiTargetId = keyof typeof AI_TARGETS;

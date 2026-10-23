// Única porta de entrada dos dados para a UI: um singleton sobre o motor (src/engine).
// Os componentes são apresentacionais: não fazem conta de negócio, só leem o que está aqui.

import { channelEconomics, fitCurves, predictInstalls, simulateShift } from "@/engine/allocation";
import type { ChannelEconomics, ResponseCurve, Scenario } from "@/engine/allocation";
import { corrections } from "@/engine/adjust";
import type { Correction } from "@/engine/adjust";
import { blended, roasConfidence } from "@/engine/confidence";
import type { Blended, RoasEstimate } from "@/engine/confidence";
import { liftInterval } from "@/engine/experiments";
import { aiAnswer } from "@/engine/aiask";
import type { AiAnswer } from "@/engine/aiask";
import { answer } from "@/engine/ask";
import type { Answer } from "@/engine/ask";
import { readTests } from "@/engine/experiments";
import type { TestResult } from "@/engine/experiments";
import { generateDataset } from "@/engine/generate";
import { buildInsights } from "@/engine/insights";
import type { Insight, ViewId } from "@/engine/insights";
import { channelSummary, dailySeries, deltas, funnel, periods, platformSplit } from "@/engine/metrics";
import type { ChannelMetrics, DailyPoint, Delta, Funnel, PlatformRow } from "@/engine/metrics";
import { trackingSummary } from "@/engine/tracking";
import type { TrackingSummary } from "@/engine/tracking";
import { CHANNELS } from "@/engine/types";
import type { Channel, Dataset, DateRange } from "@/engine/types";

export type { ViewId } from "@/engine/insights";

export const VIEW_IDS: readonly ViewId[] = ["geral", "canais", "funil", "testes", "tracking", "tagbook", "sql"];

export function parseView(v: unknown): ViewId | undefined {
  return typeof v === "string" && (VIEW_IDS as readonly string[]).includes(v) ? (v as ViewId) : undefined;
}

export interface DashboardData {
  ds: Dataset;
  per: { last28: DateRange; prev28: DateRange; mature90: DateRange; full: DateRange };
  last: ChannelMetrics[];
  prev: ChannelMetrics[];
  mature: ChannelMetrics[];
  deltas: Delta[];
  daily: DailyPoint[];
  dailyByChannel: Record<Channel, DailyPoint[]>;
  eco: ChannelEconomics[];
  curves: ResponseCurve[];
  tracking: TrackingSummary;
  tests: TestResult[];
  /** IC 95% do lift de cada teste (mesma ordem de `tests`) */
  testCi: ({ lo: number; hi: number } | null)[];
  /** estimativa de atribuição perdida por canal/plataforma (CPI, CAC e ROAS corrigidos) */
  corrections: Correction[];
  roasConf: RoasEstimate[];
  blended: Blended[];
  insights: Insight[];
  funnelAll: Funnel;
  funnelBy: Record<Channel, Funnel>;
  platform: PlatformRow[];
  /** CPI semanal por canal (agregação de apresentação sobre as séries diárias do motor) */
  weeklyCpi: { x: string[]; series: { channel: Channel; values: (number | null)[] }[] };
}

let cache: DashboardData | null = null;

export function getDashboardData(): DashboardData {
  if (cache) return cache;
  const ds = generateDataset();
  const per = periods(ds);
  const chartRange: DateRange = { from: ds.dates[ds.dates.length - 90]!, to: ds.meta.refDate };
  const dailyByChannel = Object.fromEntries(CHANNELS.map((c) => [c, dailySeries(ds, chartRange, c)])) as Record<Channel, DailyPoint[]>;
  const tests = readTests(ds);
  const weekStarts: string[] = [];
  for (let i = 0; i < dailyByChannel.google_ads.length; i += 7) weekStarts.push(dailyByChannel.google_ads[i]!.date);
  const weeklyCpi = {
    x: weekStarts.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`),
    series: CHANNELS.map((channel) => ({
      channel,
      values: weekStarts.map((_, w) => {
        const b = dailyByChannel[channel].slice(w * 7, w * 7 + 7);
        const sp = b.reduce((a, d) => a + d.spend, 0), ins = b.reduce((a, d) => a + d.installs, 0);
        return ins >= 15 ? sp / ins : null;
      }),
    })),
  };
  cache = {
    ds,
    weeklyCpi,
    corrections: corrections(ds),
    roasConf: roasConfidence(ds),
    blended: blended(ds),
    per,
    last: channelSummary(ds, per.last28),
    prev: channelSummary(ds, per.prev28),
    mature: channelSummary(ds, per.mature90),
    deltas: deltas(ds, per.last28, per.prev28),
    daily: dailySeries(ds, chartRange),
    dailyByChannel,
    eco: channelEconomics(ds),
    curves: fitCurves(ds),
    tracking: trackingSummary(ds),
    tests: tests,
    testCi: tests.map((t) => liftInterval(t.a.installs, t.a.impressions, t.b.installs, t.b.impressions)),
    insights: buildInsights(ds),
    funnelAll: funnel(ds, per.full),
    funnelBy: Object.fromEntries(CHANNELS.map((c) => [c, funnel(ds, per.full, c)])) as Record<Channel, Funnel>,
    platform: platformSplit(ds, per.last28),
  };
  return cache;
}

export const useDashboardData = getDashboardData;

export function simulate(from: Channel, to: Channel, pct: number): Scenario {
  return simulateShift(getDashboardData().ds, from, to, pct);
}

export function ask(question: string): Answer {
  return answer(getDashboardData().ds, question);
}

/** Pontos observados e a curva ajustada de um canal (para o gráfico). */
export function curveSeries(channel: Channel) {
  const c = getDashboardData().curves.find((x) => x.channel === channel)!;
  const spends = c.points.map((p) => p.spend);
  const lo = Math.min(...spends);
  const hi = Math.max(...spends);
  const line = Array.from({ length: 24 }, (_, i) => {
    const spend = lo + ((hi - lo) * i) / 23;
    return { spend, installs: predictInstalls(c, spend) };
  });
  return { points: c.points, line, beta: c.beta, blockDays: c.lowConfidence ? 7 : 1, lowConfidence: c.lowConfidence };
}

// ------------------------------------------------------------------ Mesa de análise: card analisável → pergunta
export const AI_TARGETS = {
  "kpi-spend": { label: "Investimento", question: "Como está o investimento por canal?" },
  "kpi-installs": { label: "Instalações", question: "Como estão as instalações por canal?" },
  "kpi-cpi": { label: "CPI", question: "Por que o CPI mudou?" },
  "kpi-cpa": { label: "CPA de cadastro", question: "Como está o CPA de cadastro por canal?" },
  "kpi-cac": { label: "CAC", question: "Qual o CAC por canal?" },
  "kpi-roas": { label: "ROAS D90", question: "Qual canal paga o próprio custo em 90 dias?" },
  "card-serie": { label: "Investimento diário e CPI", question: "Por que o CPI mudou?" },
  "card-cpi-canais": { label: "CPI por canal", question: "Por que o CPI do Meta subiu?" },
  "card-quadrante": { label: "Custo × retorno por canal", question: "Compare os canais" },
  "card-leilao": { label: "Leilão e criativo", question: "O CPM subiu ou o criativo saturou?" },
  "card-confianca": { label: "Retorno com confiança", question: "Qual canal paga o próprio custo em 90 dias?" },
  "card-canais": { label: "Canais, últimos 28 dias", question: "Compare os canais" },
  "card-insights": { label: "O que merece atenção", question: "Resumo dos principais alertas" },
  "card-economia": { label: "Retorno em 90 dias por canal", question: "Qual canal paga o próprio custo em 90 dias?" },
  "card-unit": { label: "Unit economics por canal", question: "Qual o CAC por canal?" },
  "card-simulador": { label: "Simulador de verba", question: "Qual a melhor realocação de 20% da verba?" },
  "card-curva": { label: "Curva de resposta", question: "Qual o CPI marginal de cada canal?" },
  "card-funil": { label: "Funil do app", question: "Onde perco mais no funil?" },
  "card-funil-canais": { label: "Conversão por canal", question: "Compare o funil entre os canais" },
  "card-plataforma": { label: "iOS × Android", question: "iOS ou Android tem CPI menor?" },
  "card-lift": { label: "Lift por teste (IC 95%)", question: "Quais testes A/B posso ler?" },
  "card-testes": { label: "Leitura dos testes", question: "Quais testes A/B posso ler?" },
  "card-mapa": { label: "Mapa de saúde por canal", question: "Quais checagens de coleta estão quebradas?" },
  "card-recon": { label: "Reconciliação entre fontes", question: "Como a reconciliação funciona?" },
  "card-eventos": { label: "Eventos do tagbook", question: "Quais eventos do tagbook têm problema?" },
  "card-evento-serie": { label: "Série diária do evento", question: "Quais eventos do tagbook têm problema?" },
  "card-tagbook": { label: "Plano de coleta", question: "O que é o tagbook e como ele é monitorado?" },
} as const satisfies Record<string, { label: string; question: string }>;
export type AiTargetId = keyof typeof AI_TARGETS;
export const isAiTarget = (id: string | undefined): id is AiTargetId => !!id && id in AI_TARGETS;

const answerCache = new Map<string, AiAnswer>();
/** Chamado só de uma tarefa agendada do navegador; os componentes de IA não fazem conta de negócio. */
export function getAiAnswer(question: string, prev?: string): AiAnswer {
  const key = `${prev ?? ""}\u0000${question}`;
  const hit = answerCache.get(key);
  if (hit) return hit;
  const result = aiAnswer(getDashboardData().ds, question, prev);
  if (answerCache.size >= 60) answerCache.delete(answerCache.keys().next().value ?? "");
  answerCache.set(key, result);
  return result;
}

const AGENDA_QUESTION: Record<string, string> = {
  tracking: "Quais checagens de coleta estão quebradas?",
  eficiencia: "Por que o CPI mudou?",
  canais: "Compare os canais",
  testes: "Quais testes A/B posso ler?",
  funil: "Onde perco mais no funil?",
};
/** Pauta do dia: os achados mais graves do motor de regras, cada um com a pergunta que o aprofunda. */
export function aiAgenda() {
  return getDashboardData().insights.slice(0, 3).map((i) => ({ id: i.id, title: i.title, question: AGENDA_QUESTION[i.topic] ?? "Resumo dos principais alertas" }));
}

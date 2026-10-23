// Única porta de entrada dos dados para a UI: um singleton sobre o motor (src/engine).
// Os componentes são apresentacionais: não fazem conta de negócio, só leem o que está aqui.

import { channelEconomics, fitCurves, predictInstalls, simulateShift } from "@/engine/allocation";
import type { ChannelEconomics, ResponseCurve, Scenario } from "@/engine/allocation";
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
  insights: Insight[];
  funnelAll: Funnel;
  funnelBy: Record<Channel, Funnel>;
  platform: PlatformRow[];
}

let cache: DashboardData | null = null;

export function getDashboardData(): DashboardData {
  if (cache) return cache;
  const ds = generateDataset();
  const per = periods(ds);
  const chartRange: DateRange = { from: ds.dates[ds.dates.length - 90]!, to: ds.meta.refDate };
  cache = {
    ds,
    per,
    last: channelSummary(ds, per.last28),
    prev: channelSummary(ds, per.prev28),
    mature: channelSummary(ds, per.mature90),
    deltas: deltas(ds, per.last28, per.prev28),
    daily: dailySeries(ds, chartRange),
    dailyByChannel: Object.fromEntries(CHANNELS.map((c) => [c, dailySeries(ds, chartRange, c)])) as Record<Channel, DailyPoint[]>,
    eco: channelEconomics(ds),
    curves: fitCurves(ds),
    tracking: trackingSummary(ds),
    tests: readTests(ds),
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

// Motor de métricas de mídia e aquisição. Funções puras sobre o Dataset.
// Cada função tem uma consulta SQL equivalente em /sql; tests/sql-equivalence.test.ts garante que batem.
//
// Regras de maturidade (senso crítico sobre coortes recentes):
//  - topo de funil (gasto, impressões, cliques, CPI, CPA de cadastro): usa o período inteiro;
//  - fundo de funil (ativação, CAC): só coortes com >= 14 dias de vida na data de referência;
//  - ROAS D30: só coortes com >= 30 dias; ROAS D90 e LTV90: só coortes com >= 90 dias.

import { addDays } from "./calendar.ts";
import { CHANNELS } from "./types.ts";
import type { Channel, Dataset, DateRange, Platform } from "./types.ts";

export interface MaturityCutoffs {
  d14: string;
  d30: string;
  d90: string;
}

export function maturity(ds: Dataset): MaturityCutoffs {
  return {
    d14: addDays(ds.meta.refDate, -ds.meta.maturityDays),
    d30: addDays(ds.meta.refDate, -30),
    d90: addDays(ds.meta.refDate, -90),
  };
}

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export interface ChannelMetrics {
  channel: Channel | "paid_total";
  spend: number;
  impressions: number;
  clicks: number;
  platformInstalls: number;
  platformSignups: number;
  installs: number; // atribuídas pelo MMP
  signups: number;
  // coortes maduras (D14)
  installsM: number;
  signupsM: number;
  kycM: number;
  activatedM: number;
  spendM: number;
  // D30 / D90
  spend30: number;
  rev30: number;
  spend90: number;
  rev90: number;
  activated90: number;
  // derivadas
  cpm: number | null;
  ctr: number | null;
  cpc: number | null;
  cpi: number | null;
  installsPerClick: number | null;
  cpaSignup: number | null;
  signupRate: number | null;
  kycRate: number | null;
  activationRate: number | null;
  cac: number | null;
  roas30: number | null;
  roas90: number | null;
  ltv90: number | null;
}

type Acc = Omit<
  ChannelMetrics,
  "channel" | "cpm" | "ctr" | "cpc" | "cpi" | "installsPerClick" | "cpaSignup" | "signupRate" | "kycRate" | "activationRate" | "cac" | "roas30" | "roas90" | "ltv90"
>;

const emptyAcc = (): Acc => ({
  spend: 0, impressions: 0, clicks: 0, platformInstalls: 0, platformSignups: 0,
  installs: 0, signups: 0, installsM: 0, signupsM: 0, kycM: 0, activatedM: 0, spendM: 0,
  spend30: 0, rev30: 0, spend90: 0, rev90: 0, activated90: 0,
});

function finish(channel: ChannelMetrics["channel"], a: Acc): ChannelMetrics {
  return {
    channel, ...a,
    cpm: a.impressions > 0 ? (a.spend / a.impressions) * 1000 : null,
    ctr: div(a.clicks, a.impressions),
    cpc: div(a.spend, a.clicks),
    cpi: div(a.spend, a.installs),
    installsPerClick: div(a.installs, a.clicks),
    cpaSignup: div(a.spend, a.signups),
    signupRate: div(a.signupsM, a.installsM),
    kycRate: div(a.kycM, a.signupsM),
    activationRate: div(a.activatedM, a.installsM),
    cac: div(a.spendM, a.activatedM),
    roas30: div(a.rev30, a.spend30),
    roas90: div(a.rev90, a.spend90),
    ltv90: div(a.rev90, a.activated90),
  };
}

export interface Filters {
  platform?: Platform;
}

/** Resumo por canal pago + linha de total. Janela = data de instalação (coorte) e data do gasto. */
export function channelSummary(ds: Dataset, range: DateRange, f: Filters = {}): ChannelMetrics[] {
  const m = maturity(ds);
  const acc = new Map<Channel, Acc>(CHANNELS.map((c) => [c, emptyAcc()]));

  for (const r of ds.adSpend) {
    if (r.date < range.from || r.date > range.to) continue;
    if (f.platform && r.platform !== f.platform) continue;
    const a = acc.get(r.channel)!;
    a.spend += r.spend;
    a.impressions += r.impressions;
    a.clicks += r.clicks;
    a.platformInstalls += r.platform_installs;
    a.platformSignups += r.platform_signups;
    if (r.date <= m.d14) a.spendM += r.spend;
    if (r.date <= m.d30) a.spend30 += r.spend;
    if (r.date <= m.d90) a.spend90 += r.spend;
  }

  for (const u of ds.users) {
    if (u.channel === "organic") continue;
    if (u.install_date < range.from || u.install_date > range.to) continue;
    if (f.platform && u.platform !== f.platform) continue;
    const a = acc.get(u.channel)!;
    a.installs++;
    if (u.signup_date) a.signups++;
    if (u.install_date <= m.d14) {
      a.installsM++;
      if (u.signup_date) a.signupsM++;
      if (u.kyc_date) a.kycM++;
      if (u.first_use_date) a.activatedM++;
    }
    if (u.rev_d30 !== null) a.rev30 += u.rev_d30;
    if (u.rev_d90 !== null) {
      a.rev90 += u.rev_d90;
      if (u.first_use_date) a.activated90++;
    }
  }

  const rows = CHANNELS.map((c) => finish(c, acc.get(c)!));
  const total = emptyAcc();
  for (const a of acc.values())
    for (const k of Object.keys(total) as (keyof Acc)[]) total[k] += a[k];
  return [...rows, finish("paid_total", total)];
}

export function totals(ds: Dataset, range: DateRange, f: Filters = {}): ChannelMetrics {
  const rows = channelSummary(ds, range, f);
  return rows[rows.length - 1]!;
}

// Funil ---------------------------------------------------------------------------------------------

export interface FunnelStep {
  key: "impressions" | "clicks" | "installs" | "signups" | "kyc" | "activated";
  label: string;
  count: number;
  /** conversão em relação à etapa anterior */
  rate: number | null;
  /** custo acumulado por unidade da etapa (gasto do período / contagem) */
  costPer: number | null;
}

export interface Funnel {
  range: DateRange;
  spend: number;
  steps: FunnelStep[];
}

/** Funil de coorte. O período é cortado em D14 para o fundo do funil ser comparável entre canais. */
export function funnel(ds: Dataset, range: DateRange, channel?: Channel, f: Filters = {}): Funnel {
  const m = maturity(ds);
  const r: DateRange = { from: range.from, to: range.to < m.d14 ? range.to : m.d14 };
  let spend = 0, impressions = 0, clicks = 0, installs = 0, signups = 0, kyc = 0, activated = 0;
  for (const x of ds.adSpend) {
    if (x.date < r.from || x.date > r.to) continue;
    if (channel && x.channel !== channel) continue;
    if (f.platform && x.platform !== f.platform) continue;
    spend += x.spend;
    impressions += x.impressions;
    clicks += x.clicks;
  }
  for (const u of ds.users) {
    if (u.channel === "organic") continue;
    if (u.install_date < r.from || u.install_date > r.to) continue;
    if (channel && u.channel !== channel) continue;
    if (f.platform && u.platform !== f.platform) continue;
    installs++;
    if (u.signup_date) signups++;
    if (u.kyc_date) kyc++;
    if (u.first_use_date) activated++;
  }
  const raw: [FunnelStep["key"], string, number][] = [
    ["impressions", "Impressões", impressions], ["clicks", "Cliques", clicks], ["installs", "Instalações (MMP)", installs],
    ["signups", "Cadastros", signups], ["kyc", "KYC aprovado", kyc], ["activated", "Primeiro uso do cartão", activated],
  ];
  const steps = raw.map(([key, label, count], i) => ({
    key, label, count,
    rate: i === 0 ? null : div(count, raw[i - 1]![2]),
    costPer: div(spend, count),
  }));
  return { range: r, spend, steps };
}

// Séries diárias ---------------------------------------------------------------------------------------

export interface DailyPoint {
  date: string;
  spend: number;
  clicks: number;
  installs: number;
  signups: number;
  cpi: number | null;
}

export function dailySeries(ds: Dataset, range: DateRange, channel?: Channel): DailyPoint[] {
  const map = new Map<string, DailyPoint>();
  for (const d of ds.dates)
    if (d >= range.from && d <= range.to) map.set(d, { date: d, spend: 0, clicks: 0, installs: 0, signups: 0, cpi: null });
  for (const r of ds.adSpend) {
    const p = map.get(r.date);
    if (!p || (channel && r.channel !== channel)) continue;
    p.spend += r.spend;
    p.clicks += r.clicks;
  }
  for (const u of ds.users) {
    if (u.channel === "organic") continue;
    const p = map.get(u.install_date);
    if (!p || (channel && u.channel !== channel)) continue;
    p.installs++;
    if (u.signup_date) p.signups++;
  }
  const out = [...map.values()];
  for (const p of out) p.cpi = div(p.spend, p.installs);
  return out;
}

// Comparação entre períodos ---------------------------------------------------------------------------

export interface Delta {
  channel: ChannelMetrics["channel"];
  metric: "spend" | "installs" | "cpi" | "cpaSignup" | "cac" | "ctr";
  current: number | null;
  previous: number | null;
  /** variação relativa (0.1 = +10%) */
  change: number | null;
}

export function deltas(ds: Dataset, current: DateRange, previous: DateRange): Delta[] {
  const a = channelSummary(ds, current);
  const b = channelSummary(ds, previous);
  const metrics: Delta["metric"][] = ["spend", "installs", "cpi", "cpaSignup", "cac", "ctr"];
  const out: Delta[] = [];
  a.forEach((row, i) => {
    for (const metric of metrics) {
      const cur = row[metric];
      const prev = b[i]![metric];
      out.push({ channel: row.channel, metric, current: cur, previous: prev, change: cur !== null && prev ? cur / prev - 1 : null });
    }
  });
  return out;
}

export interface PlatformRow {
  channel: Channel;
  platform: Platform;
  spend: number;
  installs: number;
  cpi: number | null;
}

export function platformSplit(ds: Dataset, range: DateRange): PlatformRow[] {
  const out: PlatformRow[] = [];
  for (const platform of ["android", "ios"] as const) {
    const rows = channelSummary(ds, range, { platform });
    for (const r of rows) if (r.channel !== "paid_total") out.push({ channel: r.channel, platform, spend: r.spend, installs: r.installs, cpi: r.cpi });
  }
  return out;
}

/** Períodos de referência usados pelo painel. */
export function periods(ds: Dataset) {
  const to = ds.meta.refDate;
  const last28: DateRange = { from: addDays(to, -27), to };
  const prev28: DateRange = { from: addDays(to, -55), to: addDays(to, -28) };
  const m = maturity(ds);
  // Coorte madura para unit economics: instalações entre D+0 do dataset e a última data com D90 completo.
  const mature90: DateRange = { from: ds.meta.startDate, to: m.d90 };
  return { last28, prev28, mature90, full: { from: ds.meta.startDate, to } as DateRange };
}

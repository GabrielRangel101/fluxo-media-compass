// Curvas de resposta por canal e simulador de realocação de verba.
//
// Modelo: instalações = A × gasto^β (retorno decrescente quando β < 1). β é estimado por regressão
// log-log sobre o histórico diário, só em período sem falhas de coleta conhecidas (até D-45).
// Uso: CPI marginal = CPI médio ÷ β. Quanto menor β, mais caro o próximo real investido.
//
// Limites do modelo (mostrados no painel): extrapola só dentro do intervalo de gasto já observado
// e assume que a eficiência atual do canal se mantém.

import { addDays } from "./calendar.ts";
import { mean } from "./stats.ts";
import { channelSummary, periods } from "./metrics.ts";
import { CHANNELS } from "./types.ts";
import type { Channel, Dataset } from "./types.ts";

export const MAX_SHIFT = 0.5;
export const OBSERVED_BAND: [number, number] = [0.6, 1.6];

export interface ResponseCurve {
  channel: Channel;
  /** instalações = a × gasto^beta */
  a: number;
  beta: number;
  /** mean de instalações por dia nas observações usadas */
  meanDailyInstalls: number;
  lowConfidence: boolean;
  /** erro-padrão de β e R² do ajuste log-log (critério de confiança da curva) */
  betaSe: number;
  r2: number;
  /** pontos usados no ajuste (para gráfico): gasto e instalações por bloco */
  points: { spend: number; installs: number }[];
}

export function fitCurves(ds: Dataset): ResponseCurve[] {
  const to = addDays(ds.meta.refDate, -45);
  const spend = new Map<string, number>();
  const inst = new Map<string, number>();
  for (const r of ds.adSpend) {
    if (r.date > to) continue;
    spend.set(`${r.channel}|${r.date}`, (spend.get(`${r.channel}|${r.date}`) ?? 0) + r.spend);
  }
  for (const u of ds.users) {
    if (u.channel === "organic" || u.install_date > to) continue;
    inst.set(`${u.channel}|${u.install_date}`, (inst.get(`${u.channel}|${u.install_date}`) ?? 0) + 1);
  }
  const days = ds.dates.filter((d) => d <= to);

  return CHANNELS.map((channel) => {
    const daily = days.map((d) => ({ s: spend.get(`${channel}|${d}`) ?? 0, i: inst.get(`${channel}|${d}`) ?? 0 }));
    const meanDaily = mean(daily.map((x) => x.i));
    const lowConfidence = meanDaily < 20;
    // Canais com poucas instalações/dia (zeros distorcem o log) usam blocos de 7 dias.
    const block = lowConfidence ? 7 : 1;
    const pts: { spend: number; installs: number }[] = [];
    for (let k = 0; k + block <= daily.length; k += block) {
      const slice = daily.slice(k, k + block);
      const s = slice.reduce((a, x) => a + x.s, 0);
      const i = slice.reduce((a, x) => a + x.i, 0);
      if (s > 0 && i > 0) pts.push({ spend: s, installs: i });
    }
    // Regressão de ln(instalações) sobre ln(gasto) por mínimos quadrados (forma fechada).
    const xs = pts.map((p) => Math.log(p.spend));
    const ys = pts.map((p) => Math.log(p.installs));
    const mx = mean(xs);
    const my = mean(ys);
    let num = 0;
    let den = 0;
    for (let k = 0; k < xs.length; k++) {
      num += (xs[k]! - mx) * (ys[k]! - my);
      den += (xs[k]! - mx) ** 2;
    }
    const beta = den > 0 ? num / den : 1;
    const a = Math.exp(my - beta * mx);
    let rss = 0;
    let tss = 0;
    for (let k = 0; k < xs.length; k++) {
      const fit = my + beta * (xs[k]! - mx);
      rss += (ys[k]! - fit) ** 2;
      tss += (ys[k]! - my) ** 2;
    }
    const n = xs.length;
    const betaSe = n > 2 && den > 0 ? Math.sqrt(rss / (n - 2) / den) : 0.5;
    const r2 = tss > 0 ? 1 - rss / tss : 0;
    return { channel, a, beta, betaSe, r2, meanDailyInstalls: meanDaily, lowConfidence, points: pts };
  });
}

/** Instalações previstas pela curva para um gasto (no mesmo bloco do ajuste: 1 dia, ou 7 dias se baixa confiança). */
export const predictInstalls = (c: ResponseCurve, spend: number) => c.a * Math.pow(spend, c.beta);

export interface ChannelEconomics {
  channel: Channel;
  spend: number; // últimos 28 dias
  installs: number;
  cpi: number | null;
  /** CPI do próximo real = CPI ÷ β */
  marginalCpi: number | null;
  beta: number;
  lowConfidence: boolean;
  /** ativação e CAC: coortes dos 28 dias que completaram D14; LTV90 e ROAS: coortes com D90 */
  activationRate: number | null;
  ltv90: number | null;
  cac: number | null;
  roas90: number | null;
  /** valor (LTV90) gerado por instalação marginal */
  valuePerInstall: number | null;
}

export function channelEconomics(ds: Dataset): ChannelEconomics[] {
  const p = periods(ds);
  const recent = channelSummary(ds, p.last28);
  const mature = channelSummary(ds, p.mature90);
  const c14 = channelSummary(ds, p.cohort14);
  const curves = fitCurves(ds);
  return CHANNELS.map((channel, i) => {
    const r = recent[i]!;
    const m = mature[i]!;
    const k = c14[i]!;
    const c = curves[i]!;
    const valuePerInstall = k.activationRate !== null && m.ltv90 !== null ? k.activationRate * m.ltv90 : null;
    return {
      channel, spend: r.spend, installs: r.installs, cpi: r.cpi,
      marginalCpi: r.cpi !== null ? r.cpi / c.beta : null,
      beta: c.beta, lowConfidence: c.lowConfidence,
      activationRate: k.activationRate, ltv90: m.ltv90, cac: k.cac, roas90: m.roas90, valuePerInstall,
    };
  });
}

export interface Scenario {
  from: Channel;
  to: Channel;
  pct: number;
  movedAmount: number;
  rows: {
    channel: Channel;
    spendBefore: number;
    spendAfter: number;
    installsBefore: number;
    installsAfter: number;
  }[];
  installsDelta: number;
  activatedDelta: number;
  /** variação do LTV90 esperado das instalações adicionadas/perdidas, em R$ */
  valueDelta: number;
  /** faixa de 95% (β ± 1,96 erro-padrão: destino e origem em direções opostas) */
  band: { installs: [number, number]; activated: [number, number]; value: [number, number] };
  outOfBand: boolean;
  capped: boolean;
  warnings: string[];
}

/** Move `pct` do gasto de `from` para `to` (mesmo orçamento total). Base: últimos 28 dias. */
export function simulateShift(ds: Dataset, from: Channel, to: Channel, pctRequested: number): Scenario {
  const eco = channelEconomics(ds);
  const byCh = new Map(eco.map((e) => [e.channel, e]));
  const pct = Math.min(Math.max(pctRequested, 0), MAX_SHIFT);
  const a = byCh.get(from)!;
  const b = byCh.get(to)!;
  // Origem = destino não move nada (sem este caso, a verba do canal cresceria em vez de ficar parada).
  const moved = from === to ? 0 : a.spend * pct;
  const newSpend = new Map<Channel, number>(eco.map((e) => [e.channel, e.spend]));
  newSpend.set(from, a.spend - moved);
  newSpend.set(to, b.spend + moved);

  let outOfBand = false;
  let installsDelta = 0;
  let activatedDelta = 0;
  let valueDelta = 0;
  const rows = eco.map((e) => {
    const s1 = newSpend.get(e.channel)!;
    const ratio = e.spend > 0 ? s1 / e.spend : 1;
    if (ratio < OBSERVED_BAND[0] || ratio > OBSERVED_BAND[1]) outOfBand = true;
    const installsAfter = e.installs * Math.pow(ratio, e.beta);
    const d = installsAfter - e.installs;
    installsDelta += d;
    if (e.activationRate !== null) activatedDelta += d * e.activationRate;
    if (e.valuePerInstall !== null) valueDelta += d * e.valuePerInstall;
    return { channel: e.channel, spendBefore: e.spend, spendAfter: s1, installsBefore: e.installs, installsAfter };
  });

  // Faixa: pessimista = destino com β baixo e origem com β alto; otimista = o inverso.
  const curveBy = new Map(fitCurves(ds).map((c) => [c.channel, c]));
  const run = (betaTo: number, betaFrom: number) => {
    let di = 0, da = 0, dv = 0;
    for (const e of eco) {
      const ratio = e.spend > 0 ? newSpend.get(e.channel)! / e.spend : 1;
      const beta = e.channel === to ? betaTo : e.channel === from ? betaFrom : e.beta;
      const d = e.installs * Math.pow(ratio, beta) - e.installs;
      di += d;
      if (e.activationRate !== null) da += d * e.activationRate;
      if (e.valuePerInstall !== null) dv += d * e.valuePerInstall;
    }
    return { di, da, dv };
  };
  const ct = curveBy.get(to)!, cf = curveBy.get(from)!;
  const lo = run(Math.max(0.05, ct.beta - 1.96 * ct.betaSe), cf.beta + 1.96 * cf.betaSe);
  const hi = run(Math.min(1.2, ct.beta + 1.96 * ct.betaSe), Math.max(0.05, cf.beta - 1.96 * cf.betaSe));
  const band = { installs: [Math.min(lo.di, hi.di), Math.max(lo.di, hi.di)] as [number, number], activated: [Math.min(lo.da, hi.da), Math.max(lo.da, hi.da)] as [number, number], value: [Math.min(lo.dv, hi.dv), Math.max(lo.dv, hi.dv)] as [number, number] };

  const warnings: string[] = [];
  if (pctRequested > MAX_SHIFT) warnings.push(`Realocação limitada a ${MAX_SHIFT * 100}% do gasto do canal de origem.`);
  if (outOfBand) warnings.push("Algum canal sai da faixa de gasto já observada (60%–160% do atual): a projeção extrapola o histórico.");
  if (byCh.get(to)!.lowConfidence || byCh.get(from)!.lowConfidence)
    warnings.push("LinkedIn tem poucas instalações por dia: a elasticidade desse canal é estimada com blocos semanais e tem baixa confiança.");
  if (from === to) warnings.push("Origem e destino iguais: nada muda.");

  return {
    from, to, pct, movedAmount: moved, rows, installsDelta, activatedDelta, valueDelta, band,
    outOfBand, capped: pctRequested > MAX_SHIFT, warnings,
  };
}

/** Melhor realocação simples (origem → destino) para o pct dado, por valor LTV90 esperado. */
export function bestShift(ds: Dataset, pct: number): Scenario | null {
  let best: Scenario | null = null;
  for (const from of CHANNELS)
    for (const to of CHANNELS) {
      if (from === to) continue;
      const s = simulateShift(ds, from, to, pct);
      if (!best || s.valueDelta > best.valueDelta) best = s;
    }
  return best && best.valueDelta > 0 ? best : null;
}

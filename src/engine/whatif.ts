// Simulador "e se": três alavancas aplicadas sobre a projeção base de assinantes até a meta.
// Funções puras. A projeção base é a MESMA que o card de evolução mostra (projectActive); o cenário soma a ela
// o efeito acumulado das alavancas, mês a mês, então "antes" bate com o dashboard.

import type { MonthPoint, Projection } from "./metrics";

export interface WhatIfParams {
  /** redução do churn voluntário, em fração do churn mensal (0,01 = −1 p.p.) */
  churnCut: number;
  /** parcela das falhas de pagamento recuperadas (0..1) */
  paymentRecovery: number;
  /** aumento da aquisição mensal (0..1+) */
  acquisitionLift: number;
}

export const NO_CHANGE: WhatIfParams = { churnCut: 0, paymentRecovery: 0, acquisitionLift: 0 };

export interface WhatIfBase {
  /** churn mensal médio dos últimos 3 meses */
  churn: number;
  /** parcela involuntária (falha de pagamento) dos cancelamentos */
  involuntaryShare: number;
  /** churn voluntário = churn × (1 − involuntária): teto da alavanca de churn */
  voluntaryChurn: number;
  /** churn involuntário mensal */
  involuntaryChurn: number;
  /** novas assinaturas por mês (média dos últimos 3 meses) */
  newPerMonth: number;
  arpu: number;
  activeNow: number;
  mrrNow: number;
}

export interface WhatIfPoint {
  m: number;
  label: string;
  base: number;
  scenario: number;
}

export interface WhatIfResult {
  params: WhatIfParams;
  base: WhatIfBase;
  points: WhatIfPoint[];
  goal: number;
  goalLabel: string;
  baseActive: number;
  scenarioActive: number;
  deltaActive: number;
  baseMrr: number;
  scenarioMrr: number;
  deltaMrr: number;
  /** meta − projeção (positivo = falta) */
  baseGap: number;
  scenarioGap: number;
  hitsGoal: boolean;
  /** o que bastaria, SOZINHO, para bater a meta (null = não basta dentro do limite da alavanca) */
  required: { churnCut: number | null; paymentRecovery: number | null; acquisitionLift: number | null };
  /** aumento ADICIONAL de aquisição (sobre o cenário atual) que ainda falta para bater a meta; 0 se já bate, null se passar de +200% */
  extraLiftToGoal: number | null;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function whatIfBase(series: MonthPoint[]): WhatIfBase {
  const last3 = series.slice(-3);
  const cancelled = last3.reduce((a, p) => a + p.cancelled, 0);
  const invCancelled = last3.reduce((a, p) => a + p.cancelled * p.involuntaryShare, 0);
  const churn = avg(last3.map((p) => p.churnRate));
  const involuntaryShare = cancelled ? invCancelled / cancelled : 0;
  const now = series[series.length - 1];
  return {
    churn,
    involuntaryShare,
    voluntaryChurn: churn * (1 - involuntaryShare),
    involuntaryChurn: churn * involuntaryShare,
    newPerMonth: avg(last3.map((p) => p.newSubs)),
    arpu: now.arpu,
    activeNow: now.active,
    mrrNow: now.mrr,
  };
}

/** Efeito acumulado (Δ assinantes) por mês, para um conjunto de alavancas. Linear nas alavancas. */
function deltas(base: WhatIfBase, baseline: number[], p: WhatIfParams): number[] {
  const out: number[] = [];
  let d = 0;
  let prev = base.activeNow;
  for (const b of baseline) {
    // quem deixamos de perder / ganhamos neste mês, sobre a base do cenário-base do mês anterior
    const gain = prev * (p.churnCut + base.involuntaryChurn * p.paymentRecovery) + base.newPerMonth * p.acquisitionLift;
    d = d * (1 - base.churn) + gain;
    out.push(d);
    prev = b;
  }
  return out;
}

export function whatIf(series: MonthPoint[], proj: Projection, params: WhatIfParams): WhatIfResult {
  const base = whatIfBase(series);
  const baseline = proj.points.map((p) => p.value);
  const d = deltas(base, baseline, params);
  const points: WhatIfPoint[] = proj.points.map((p, i) => ({ m: p.m, label: p.label, base: p.value, scenario: Math.round(p.value + d[i]) }));
  const last = points[points.length - 1];
  const baseActive = last ? last.base : base.activeNow;
  const scenarioActive = last ? last.scenario : base.activeNow;
  const mrrAt = (active: number) => base.mrrNow + (active - base.activeNow) * base.arpu;

  // alavanca unitária → resolve cada uma sozinha (efeito é linear)
  const unit = (p: WhatIfParams) => {
    const u = deltas(base, baseline, p);
    return u.length ? u[u.length - 1] : 0;
  };
  const need = proj.goal - baseActive;
  const solve = (k: number, max: number): number | null => {
    if (need <= 0) return 0;
    if (k <= 0) return null;
    const x = need / k;
    return x <= max ? x : null;
  };
  const required = {
    churnCut: solve(unit({ ...NO_CHANGE, churnCut: 1 }), base.voluntaryChurn),
    paymentRecovery: solve(unit({ ...NO_CHANGE, paymentRecovery: 1 }), 1),
    acquisitionLift: solve(unit({ ...NO_CHANGE, acquisitionLift: 1 }), 2),
  };

  const extraLiftToGoal = solveExtra(proj.goal - scenarioActive, unit({ ...NO_CHANGE, acquisitionLift: 1 }));

  return {
    params,
    base,
    points,
    goal: proj.goal,
    goalLabel: last ? last.label : "",
    baseActive,
    scenarioActive,
    deltaActive: scenarioActive - baseActive,
    baseMrr: Math.round(mrrAt(baseActive)),
    scenarioMrr: Math.round(mrrAt(scenarioActive)),
    deltaMrr: Math.round(mrrAt(scenarioActive) - mrrAt(baseActive)),
    baseGap: proj.goal - baseActive,
    scenarioGap: proj.goal - scenarioActive,
    hitsGoal: scenarioActive >= proj.goal,
    required,
    extraLiftToGoal,
  };
}

function solveExtra(gapLeft: number, perUnit: number): number | null {
  if (gapLeft <= 0) return 0;
  if (perUnit <= 0) return null;
  const x = gapLeft / perUnit;
  return x <= 2 ? x : null;
}

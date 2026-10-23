import { describe, expect, it } from "vitest";
import { generateDataset } from "@/engine/generate";
import { buildSeries, projectActive } from "@/engine/metrics";
import { NO_CHANGE, whatIf, whatIfBase } from "@/engine/whatif";

const ds = generateDataset();
const series = buildSeries(ds);
const proj = projectActive(series, ds.meta.goalActive, ds.meta.goalMonth);

describe("simulador e se", () => {
  it("sem alavancas, o cenário é exatamente a projeção do dashboard", () => {
    const r = whatIf(series, proj, NO_CHANGE);
    expect(r.scenarioActive).toBe(proj.projectedAtGoal);
    expect(r.deltaActive).toBe(0);
    expect(r.deltaMrr).toBe(0);
    expect(r.baseGap).toBe(proj.gap);
  });
  it("cada alavanca só melhora o resultado, e mais alavanca = mais assinantes", () => {
    const a = whatIf(series, proj, { ...NO_CHANGE, churnCut: 0.005 });
    const b = whatIf(series, proj, { ...NO_CHANGE, churnCut: 0.01 });
    expect(a.deltaActive).toBeGreaterThan(0);
    expect(b.deltaActive).toBeGreaterThan(a.deltaActive);
    expect(whatIf(series, proj, { ...NO_CHANGE, paymentRecovery: 0.3 }).deltaActive).toBeGreaterThan(0);
    expect(whatIf(series, proj, { ...NO_CHANGE, acquisitionLift: 0.1 }).deltaActive).toBeGreaterThan(0);
  });
  it("o MRR extra é assinantes extras × ticket médio", () => {
    const r = whatIf(series, proj, { churnCut: 0.01, paymentRecovery: 0.3, acquisitionLift: 0.1 });
    expect(Math.abs(r.deltaMrr - r.deltaActive * r.base.arpu)).toBeLessThanOrEqual(1);
  });
  it("aplicar o que o solver pede, sozinho, fecha a meta", () => {
    const r = whatIf(series, proj, NO_CHANGE);
    const lift = r.required.acquisitionLift;
    expect(lift).not.toBeNull();
    expect(whatIf(series, proj, { ...NO_CHANGE, acquisitionLift: (lift as number) + 0.001 }).hitsGoal).toBe(true);
  });
  it("o aumento extra de aquisição que sobra fecha a meta no cenário combinado", () => {
    const params = { churnCut: 0.01, paymentRecovery: 0.3, acquisitionLift: 0 };
    const r = whatIf(series, proj, params);
    expect(r.hitsGoal).toBe(false);
    expect(r.extraLiftToGoal).not.toBeNull();
    expect(whatIf(series, proj, { ...params, acquisitionLift: (r.extraLiftToGoal as number) + 0.001 }).hitsGoal).toBe(true);
  });
  it("base: churn voluntário + involuntário = churn", () => {
    const b = whatIfBase(series);
    expect(b.voluntaryChurn + b.involuntaryChurn).toBeCloseTo(b.churn, 10);
  });
});

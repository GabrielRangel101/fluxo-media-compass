import { describe, expect, it } from "vitest";
import type { MonthPoint } from "@/engine/metrics";
import { cohortView, correlationView, getDashboardData, INSIGHT_TARGETS, INSIGHT_VIEWS, monthlyChange, parseView } from "@/lib/dashboard-data";

describe("Sinergia e risco", () => {
  it("includes edges at |r| = 0.35 and excludes weaker pairs", () => {
    const cm = correlationView({ keys: ['newSubs', 'churnRate', 'nps'], r: [[1, 0.35, -0.34], [0.35, 1, -0.62], [-0.34, -0.62, 1]], n: 23, mode: 'diff' });
    expect(cm.edges.map((p) => p.r)).toEqual([0.35, -0.62]);
    expect(cm.strongest?.r).toBe(-0.62);
  });
  const series = [{ m: 0, label: 'A', active: 100, newSubs: 10, cancelled: 5, churnRate: 0.03, nps: 20, mrr: 1000, arpu: 10, avgEngagement: 50, paidShareNew: 0.2, upgrades: 0 }, { m: 1, label: 'B', active: 110, newSubs: 12, cancelled: 6, churnRate: 0.04, nps: 25, mrr: 1100, arpu: 10, avgEngagement: 55, paidShareNew: 0.2, upgrades: 0 }] as MonthPoint[];
  it('treats rising cancellations as unfavorable', () => { expect(monthlyChange(series, 'cancelled', 1).good).toBe(false); });
  it('uses absolute NPS points, not percentage', () => { expect(monthlyChange(series, 'nps', 1).value).toBe(5); });
  it('uses absolute churn percentage-point differences and unfavorable direction', () => { const c = monthlyChange(series, 'churnRate', 1); expect(c.value).toBeCloseTo(0.01); expect(c.good).toBe(false); });
  it('uses fractional changes for the other metrics', () => { expect(monthlyChange(series, 'active', 1).value).toBeCloseTo(0.1); });
  it('memoizes the 60-person sample and risk results', () => { const data = getDashboardData(); expect(data.people).toHaveLength(60); expect(getDashboardData().risk).toBe(data.risk); expect(getDashboardData().people).toBe(data.people); });
  it('maps each required insight topic to the related section', () => {
    expect(INSIGHT_TARGETS).toMatchObject({ churn: 'evolution-card', meta: 'evolution-card', coortes: 'cohort-card', canais: 'funnel-card', pagamento: 'reasons-card', correlação: 'correlation-card', risco: 'risk-card', preço: 'kpi-section', nps: 'kpi-section' });
  });
  it('switches to the right view for each insight topic', () => {
    expect(INSIGHT_VIEWS).toMatchObject({ churn: 'geral', meta: 'geral', coortes: 'retencao', canais: 'aquisicao', pagamento: 'retencao', correlação: 'risco', risco: 'risco', preço: 'geral', nps: 'geral' });
  });
  it('defaults unknown or missing ?view to geral', () => {
    expect(parseView(undefined)).toBe('geral');
    expect(parseView('xpto')).toBe('geral');
    expect(parseView('retencao')).toBe('retencao');
  });
  it('builds cohort rows M0..M12 divided by 100 with gaps kept as null', () => {
    const v = cohortView([{ key: 'A', size: 100, firstStart: 0, retention: [100, 80.5, null, ...Array(16).fill(null)] }]);
    expect(v.rows).toHaveLength(13);
    expect(v.rows[0].age).toBe('M0');
    expect(v.rows[1].values['A']).toBeCloseTo(0.805);
    expect(v.rows[2].values['A']).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { generateDataset } from "@/engine/generate";
import { CAC_BY_CHANNEL, econTone, fullFunnel, mrrBridge, planMix, unitEconomics } from "@/engine/growth";
import { buildSeries } from "@/engine/metrics";

const ds = generateDataset();
const m1 = ds.meta.months - 1;
const m0 = m1 - 5;

describe("funil de compra ponta a ponta", () => {
  const f = fullFunnel(ds, m0, m1);
  it("tem 5 etapas que nunca crescem, por canal e no total", () => {
    expect(f.total).toHaveLength(5);
    for (let i = 1; i < 5; i++) expect(f.total[i].value).toBeLessThanOrEqual(f.total[i - 1].value);
    for (const c of f.channels) for (let i = 1; i < 5; i++) expect(c.stages[i]).toBeLessThanOrEqual(c.stages[i - 1]);
  });
  it("as compras do funil são os novos assinantes reais do período", () => {
    const real = ds.subscribers.filter((s) => s.startMonth >= m0 && s.startMonth <= m1).length;
    expect(f.total[4].value).toBe(real);
  });
  it("a conversão final é a razão compras ÷ visitantes e há 6 pontos de tendência", () => {
    expect(f.total[4].fromTop).toBeCloseTo(f.total[4].value / f.total[0].value, 10);
    expect(f.trend).toHaveLength(6);
  });
  it("o maior vazamento aponta uma etapa de compra e compras recuperáveis positivas", () => {
    expect(f.leak).not.toBeNull();
    expect(f.leak!.step).toBeGreaterThanOrEqual(1);
    expect(f.leak!.rate).toBeLessThan(f.leak!.benchmark);
    expect(f.leak!.recoverable).toBeGreaterThan(0);
  });
});

describe("ponte de MRR", () => {
  const b = mrrBridge(ds, m0, m1);
  it("início + componentes = fim, e fecha com a série mensal", () => {
    const sum = b.parts.new + b.parts.promoEnd + b.parts.hike + b.parts.upgrades + b.parts.churn;
    expect(b.start + sum).toBeCloseTo(b.end, 2);
    const series = buildSeries(ds);
    expect(b.end).toBeCloseTo(series[m1].mrr, -1);
  });
  it("novas e reajuste somam, cancelamentos subtraem", () => {
    expect(b.parts.new).toBeGreaterThan(0);
    expect(b.parts.hike).toBeGreaterThan(0);
    expect(b.parts.churn).toBeLessThan(0);
    expect(b.steps[0].kind).toBe("total");
    expect(b.steps[b.steps.length - 1].to).toBeCloseTo(b.end, 2);
  });
});

describe("unit economics por canal", () => {
  const rows = unitEconomics(ds, m0, m1);
  it("traz os 7 canais com LTV/CAC e payback coerentes", () => {
    expect(rows).toHaveLength(7);
    for (const r of rows) {
      expect(r.cac).toBeGreaterThan(0);
      if (r.ltv12 !== null) expect(r.ltvCac).toBeCloseTo(r.ltv12 / r.cac, 10);
      if (r.arpu) expect(r.payback).toBeCloseTo(r.cac / r.arpu, 10);
    }
  });
  it("mídia paga (Meta) é o canal de pior LTV/CAC", () => {
    const withRatio = rows.filter((r) => r.ltvCac !== null);
    const worst = [...withRatio].sort((a, b) => (a.ltvCac as number) - (b.ltvCac as number))[0];
    expect(worst.channel).toBe("Mídia paga (Meta)");
    expect(CAC_BY_CHANNEL["Mídia paga (Meta)"]).toBeGreaterThan(CAC_BY_CHANNEL["Orgânico"]);
  });
  it("tons: ≥3 bom, 1,5–3 médio, <1,5 ruim", () => {
    expect(econTone(3)).toBe("bom");
    expect(econTone(2)).toBe("medio");
    expect(econTone(1.2)).toBe("ruim");
    expect(econTone(null)).toBeNull();
  });
});

describe("planos: base × receita", () => {
  it("participações somam 100% e batem com a base ativa", () => {
    const rows = planMix(ds, m1);
    expect(rows.reduce((a, r) => a + r.shareSubs, 0)).toBeCloseTo(1, 6);
    expect(rows.reduce((a, r) => a + r.shareMrr, 0)).toBeCloseTo(1, 6);
    expect(rows.reduce((a, r) => a + r.count, 0)).toBe(buildSeries(ds)[m1].active);
  });
});

import { describe, expect, it } from "vitest";
import { cardCaption } from "@/engine/captions";
import { buildSeries, churnReasons } from "@/engine/metrics";
import { getAiAnswer, getDashboardData, getWindowData, WINDOW_MONTHS } from "@/lib/dashboard-data";

describe("janela fixa de 6 meses", () => {
  it("termina no mês de referência e começa 5 meses antes", () => {
    const { m } = getDashboardData();
    const w = getWindowData();
    expect(WINDOW_MONTHS).toBe(6);
    expect(w.m1).toBe(m);
    expect(w.m0).toBe(m - 5);
  });

  it("ponte da base: início + novas − cancelamentos (− outros) = fim", () => {
    const { ds } = getDashboardData();
    const w = getWindowData();
    const series = buildSeries(ds);
    const b = w.bridge;
    expect(b.start).toBe(series[w.m0 - 1].active);
    expect(b.end).toBe(series[w.m1].active);
    const cancels = churnReasons(ds, w.m0, w.m1).byNature.reduce((a, n) => a + n.count, 0);
    // registra a diferença residual que vai para "Outros" (0 quando os números fecham)
    expect(b.start + b.added - cancels - b.others).toBe(b.end);
    const last = b.steps[b.steps.length - 2];
    expect(last.to).toBe(b.end);
    expect(b.steps.some((s) => s.key === "outros")).toBe(b.others !== 0);
  });

  it("volume × qualidade: 7 canais ordenados por volume, tons pelos limites 80/60%", () => {
    const q = getWindowData().quality;
    expect(q).toHaveLength(7);
    for (let i = 1; i < q.length; i++) expect(q[i - 1].purchases).toBeGreaterThanOrEqual(q[i].purchases);
    for (const r of q) {
      if (r.retention6 === null) expect(r.tone).toBeNull();
      else expect(r.tone).toBe(r.retention6 >= 0.8 ? "bom" : r.retention6 >= 0.6 ? "medio" : "ruim");
    }
  });
});

describe("legendas dos cards do Modo IA", () => {
  const questions = ["Como está o churn?", "Por que os assinantes cancelam?", "Qual canal retém pior?", "Compare as safras de campanha", "Quem está em risco de cancelar?", "Vamos bater a meta de dezembro?", "Qual a composição por plano?", "Como estão as editorias?", "Como está o NPS?", "Como foi o reajuste de preço?", "Resumo dos principais alertas", "xyz"];
  const cards = questions.flatMap((q) => getAiAnswer(q).cards);

  it("nenhuma legenda contém NaN/undefined", () => {
    for (const c of cards) {
      const cap = cardCaption(c);
      if (cap) expect(cap).not.toMatch(/NaN|undefined/);
    }
    expect(cards.some((c) => cardCaption(c))).toBe(true);
  });

  it("stats e table não têm legenda", () => {
    for (const c of cards.filter((c) => c.kind === "stats" || c.kind === "table")) expect(cardCaption(c)).toBeNull();
  });
});

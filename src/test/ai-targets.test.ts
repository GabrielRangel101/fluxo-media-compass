import { describe, expect, it } from "vitest";
import { detectIntent } from "@/engine/ask";
import type { AtRiskRow } from "@/engine/metrics";
import { AI_TARGETS, diverseTopRisk } from "@/lib/dashboard-data";
import { layoutSlots } from "@/components/ai/gen-layout";

describe("Modo IA sobre o dashboard", () => {
  it.each(Object.entries(AI_TARGETS))("%s gera pergunta com intenção conhecida", (_id, t) => {
    expect(detectIntent(t.question).intent).not.toBe("desconhecida");
  });
  it("maps the churn KPI and reasons card to the requested questions", () => {
    expect(AI_TARGETS["kpi-churn"].question).toBe("Como está o churn?");
    expect(AI_TARGETS.reasons.question).toBe("Por que os assinantes cancelam?");
  });
  it("top-risk list takes the riskiest of each distinct trigger first", () => {
    const row = (id: number, risk: number, driver: AtRiskRow["driver"]) => ({ id, risk, driver, mrr: 10 }) as AtRiskRow;
    const top = [row(1, 80.3, "renovação anual"), row(2, 80.3, "renovação anual"), row(3, 80.3, "renovação anual"), row(4, 60, "baixo engajamento"), row(5, 50, "geral"), row(6, 40, "canal de risco")];
    const out = diverseTopRisk(top, 5);
    expect(out.map((r) => r.id)).toEqual([1, 2, 4, 5, 6]);
  });
  it("generated card slots never overlap the focused card", () => {
    const focus = { x: 350, y: 70, w: 260, h: 112 };
    const slots = layoutSlots({ x: 16, y: 84, w: 992, h: 800 }, [focus], focus, 6);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) expect(s.x + s.w <= focus.x || s.x >= focus.x + focus.w || s.y >= focus.y + focus.h || s.y + s.h <= focus.y).toBe(true);
    for (const s of slots) expect(s.x + s.w).toBeLessThanOrEqual(16 + 992);
  });
});

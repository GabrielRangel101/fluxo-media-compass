import { describe, expect, it } from "vitest";
import { detectIntent } from "@/engine/ask";
import { AGENDA_SIZE, CARD_INDEX, TOPIC_QUESTIONS, VIEW_IDS, getDashboardData } from "@/lib/dashboard-data";

describe("pauta do dia e índice de comandos", () => {
  it("a pauta tem os achados mais graves primeiro e cada um tem pergunta com intenção conhecida", () => {
    const { agenda, insights } = getDashboardData();
    expect(agenda).toHaveLength(AGENDA_SIZE);
    expect(agenda.map((a) => a.id)).toEqual(insights.slice(0, AGENDA_SIZE).map((i) => i.id));
    for (const a of agenda) expect(detectIntent(a.question).intent).not.toBe("desconhecida");
  });
  it("toda pergunta por tema é entendida pela Mesa de análise", () => {
    for (const q of Object.values(TOPIC_QUESTIONS)) expect(detectIntent(q).intent).not.toBe("desconhecida");
  });
  it("o índice de cards só aponta para views existentes, sem ids repetidos", () => {
    for (const c of CARD_INDEX) expect((VIEW_IDS as readonly string[]).includes(c.view)).toBe(true);
    expect(new Set(CARD_INDEX.map((c) => c.id)).size).toBe(CARD_INDEX.length);
  });
});

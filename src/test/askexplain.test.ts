import { describe, expect, it } from "vitest";
import { generateDataset } from "@/engine/generate";
import { classifyExplainQuestion, explainAnswer } from "@/engine/askexplain";

describe("askexplain", () => {
  const ds = generateDataset();
  it("reconhece perguntas de explicação", () => {
    expect(classifyExplainQuestion("como é feito esse calculo do saúde por editoria?")).toBe("editoria");
    expect(classifyExplainQuestion("o que é churn?")).toBe("churn");
    expect(classifyExplainQuestion("como é calculado o NPS")).toBe("nps");
    expect(classifyExplainQuestion("não entendi o LTV/CAC")).toBe("ltvcac");
    expect(classifyExplainQuestion("como leio a ponte de MRR?")).toBe("ponte");
    expect(classifyExplainQuestion("qual o CAC por canal?")).toBeNull();
    expect(classifyExplainQuestion("como estão as editorias?")).toBeNull();
  });
  it("explica com fórmula e exemplo numérico", () => {
    const a = explainAnswer(ds, "como é feito esse calculo do saúde por editoria?")!;
    expect(a.intent).toBe("editorias");
    expect(a.text).toContain("0,55");
    expect(a.cards[0].kind).toBe("table");
  });
});

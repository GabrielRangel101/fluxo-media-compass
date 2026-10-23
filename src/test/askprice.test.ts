import { describe, expect, it } from "vitest";
import { detectIntent } from "@/engine/ask";
import { classifyPriceQuestion, priceAnswer } from "@/engine/askprice";
import { generateDataset } from "@/engine/generate";

const ds = generateDataset();

describe("perguntas sobre preço", () => {
  it("separa 'qual o preço' de 'e se mudarmos o preço' e do reajuste", () => {
    expect(classifyPriceQuestion("qual o nosso preço?")).toEqual({ kind: "list" });
    expect(classifyPriceQuestion("Qual o preço da nossa assinatura?")).toEqual({ kind: "list" });
    expect(classifyPriceQuestion("e se diminuir o preço da assinatura?")).toEqual({ kind: "whatif", direction: "down", pct: 10 });
    expect(classifyPriceQuestion("e se subir o preço em 15%?")).toEqual({ kind: "whatif", direction: "up", pct: 15 });
    expect(classifyPriceQuestion("Como foi o reajuste de preço?")).toBeNull();
    expect(classifyPriceQuestion("Como está o churn?")).toBeNull();
  });
  it("lista os preços reais de tabela", () => {
    const a = priceAnswer(ds, "qual o nosso preço?")!;
    expect(a.text).toContain("R$ 33,50");
    expect(a.text).toContain("R$ 29,90");
    expect(a.cards.some((c) => c.kind === "table")).toBe(true);
  });
  it("a conta de equilíbrio de −10% pede +11,1% de base", () => {
    const a = priceAnswer(ds, "e se diminuir o preço da assinatura?")!;
    expect(a.text).toContain("11,1%");
    expect(a.text).toContain("elasticidade");
  });
  it("as perguntas sugeridas de volta são entendidas pelo roteador principal", () => {
    for (const q of ["qual o nosso preço?", "e se diminuir o preço?"]) for (const f of priceAnswer(ds, q)!.followUps) expect(detectIntent(f).intent).not.toBe("desconhecida");
  });
  it("outras perguntas passam direto (null)", () => {
    expect(priceAnswer(ds, "Quem está em risco de cancelar?")).toBeNull();
  });
});

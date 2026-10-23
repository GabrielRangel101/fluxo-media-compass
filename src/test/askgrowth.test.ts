import { describe, expect, it } from "vitest";
import { generateDataset } from "@/engine/generate";
import { growthAnswer, classifyGrowthQuestion } from "@/engine/askgrowth";

describe("askgrowth", () => {
  const ds = generateDataset();
  it("classifica perguntas de B2C", () => {
    expect(classifyGrowthQuestion("qual o CAC por canal?")?.kind).toBe("cac");
    expect(classifyGrowthQuestion("quanto custa adquirir um assinante?")?.kind).toBe("cac");
    expect(classifyGrowthQuestion("se eu abaixar o valor da assinatura isso melhora meu churn?")?.kind).toBe("pricechurn");
    expect(classifyGrowthQuestion("e se reduzir o churn em 1 ponto?")?.kind).toBe("churnwhatif");
    expect(classifyGrowthQuestion("quanto vou faturar em dezembro?")?.kind).toBe("mrrforecast");
    expect(classifyGrowthQuestion("qual o nosso preço?")).toBeNull();
  });
  it("responde com cards", () => {
    for (const q of ["qual o payback da mídia paga?", "onde perco mais no funil?", "falha de pagamento quanto perco de receita?", "se eu abaixar o preço melhora o churn?", "quanto vou faturar em dezembro?"]) {
      const a = growthAnswer(ds, q);
      expect(a).not.toBeNull();
      expect(a!.cards.length).toBeGreaterThan(0);
    }
  });
});

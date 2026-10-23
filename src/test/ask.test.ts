import { describe, expect, it } from "vitest";
import { answer, detectIntent, extractEntities, type Intent } from "../engine/ask";
import { generateDataset } from "../engine/generate";
import { appendVisible } from "../components/ai/session";
const ds = generateDataset();
const questions: [string, Intent][] = [
  ["Como está o churn?", "churn"],
  ["Por que os assinantes cancelam?", "motivos"],
  ["Qual canal retém pior?", "canais"],
  ["Compare as safras de campanha", "safras"],
  ["Quem está em risco?", "risco"],
  ["Vamos bater a meta de dezembro?", "meta"],
  ["Qual a composição por plano?", "planos"],
  ["Como estão as editorias?", "editorias"],
  ["Como está o NPS?", "nps"],
  ["Como foi o reajuste?", "preco"],
  ["Resumo dos principais alertas", "resumo"],
  ["Qual a previsão do tempo amanhã?", "desconhecida"],
];
describe("Modo IA determinístico", () => {
  it.each(questions)("%s → %s", (question, intent) => {
    expect(detectIntent(question).intent).toBe(intent);
    const result = answer(ds, question);
    expect(result.intent).toBe(intent);
    expect(result.cards.length).toBeGreaterThan(0);
    expect(result.followUps.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(result)).not.toMatch(/NaN|undefined/);
  });
  it("mantém apenas as três respostas mais recentes", () => {
    const rows = [1, 2, 3].map(id => ({ id, question: "churn", hidden: [] }));
    expect(appendVisible(rows, { id: 4, question: "risco", hidden: [] }).map(r => r.id)).toEqual([2, 3, 4]);
  });
  it("extrai período sem mudar os limites do motor", () => {
    expect(extractEntities("churn nos últimos 6 meses").months).toBe(6);
    expect(extractEntities("churn em 99 meses").months).toBe(24);
  });
});

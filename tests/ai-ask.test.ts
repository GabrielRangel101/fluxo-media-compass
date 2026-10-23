import test from "node:test";
import assert from "node:assert/strict";
import { generateDataset, SEED } from "../src/engine/generate.ts";
import { aiAnswer, AI_SUGGESTIONS } from "../src/engine/aiask.ts";
import { periods, totals } from "../src/engine/metrics.ts";
import { brl } from "../src/engine/fmt.ts";

const ds = generateDataset(SEED);

test("perguntas sobre os dados nunca caem em fora_de_escopo", () => {
  const qs = [
    ...AI_SUGGESTIONS,
    "Como o ROAS é calculado?", "Como a reconciliação funciona?", "Qual o CAC por canal?", "Quanto gastamos no Meta em setembro?",
    "Onde perco mais no funil?", "iOS ou Android tem CPI menor?", "Por que o T5 foi invalidado?", "Mova 20% do DV360 para o Google",
    "Se eu dobrar a verba do Google, o que acontece?", "Quais eventos do tagbook têm problema?", "Funil do TikTok",
  ];
  for (const q of qs) assert.notEqual(aiAnswer(ds, q).intent, "fora_de_escopo", q);
});

test("assunto sem relação com os dados recebe resposta de escopo, sem número", () => {
  for (const q of ["qual a previsão do tempo?", "quem ganhou a copa?", "oi"]) {
    const a = aiAnswer(ds, q);
    assert.equal(a.intent, "fora_de_escopo");
    assert.equal(a.cards.length, 0);
    assert.ok(a.followUps.length >= 3);
  }
});

test("os números do texto vêm do motor", () => {
  const t = totals(ds, periods(ds).last28);
  assert.ok(aiAnswer(ds, "Resumo dos principais alertas").text.includes(brl(t.cpi ?? 0)));
  assert.ok(aiAnswer(ds, "Como o CPI é calculado?").text.includes(brl(t.cpi ?? 0)));
});

test("decomposição do CPI: fatores explicam a variação e Meta avisa de tracking quebrado", () => {
  const a = aiAnswer(ds, "Por que o CPI do Meta subiu?");
  assert.equal(a.intent, "porque");
  const bars = a.cards.find((c) => c.kind === "bars");
  assert.ok(bars && bars.kind === "bars" && bars.rows.length === 3);
  assert.match(a.text, /medição|MMP|razão plataforma/);
});

test("período citado na pergunta muda a janela; mês sem dados avisa", () => {
  assert.match(aiAnswer(ds, "Quanto gastamos no Meta em setembro?").title, /setembro/);
  assert.match(aiAnswer(ds, "Quanto gastamos no Google em janeiro?").text, /Não há dados/);
});

test("simulação respeita o limite e avisa extrapolação", () => {
  const a = aiAnswer(ds, "Se eu dobrar a verba do TikTok, o que acontece?");
  assert.equal(a.intent, "verba");
  assert.match(a.text, /faixa de 60% a 160%/);
  assert.match(a.text, /não prova|hipótese/);
});

test("qual canal paga o próprio custo lista quem paga e quem não paga", () => {
  const a = aiAnswer(ds, "Qual canal paga o próprio custo em 90 dias?");
  assert.match(a.text, /não/);
  assert.equal(a.intent, "metrica");
});

test("toda resposta traz próximos passos e fonte SQL quando usa dados", () => {
  for (const q of AI_SUGGESTIONS) {
    const a = aiAnswer(ds, q);
    assert.ok(a.followUps.length > 0, q);
    assert.ok(a.sql.length > 0, q);
  }
});

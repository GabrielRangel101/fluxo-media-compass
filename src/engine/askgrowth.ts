// Perguntas de crescimento que o roteador principal (ask.ts) não cobre: CAC, LTV, payback, funil, receita perdida por falha de
// pagamento, "e se o churn cair X pontos" e "baixar o preço melhora o churn?". Só chama o motor; números sempre dele.

import type { AiAnswer } from "./ask";
import { norm } from "./ask";
import { fullFunnel, unitEconomics } from "./growth";
import { buildSeries, churnReasons } from "./metrics";
import { projectActive } from "./metrics";
import { whatIf, NO_CHANGE } from "./whatif";
import type { Dataset } from "./types";

const brl = (x: number) => `R$ ${Math.round(x).toLocaleString("pt-BR")}`;
const brlK = (x: number) => `R$ ${(x / 1000).toFixed(1).replace(".", ",")} mil`;
const int = (x: number) => Math.round(x).toLocaleString("pt-BR");
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d).replace(".", ",")}%`;
const FOLLOW = ["Vamos bater a meta de dezembro?", "Qual canal retém pior?", "Por que os assinantes cancelam?"];

export type GrowthKind = "cac" | "ltv" | "payback" | "roi" | "funnel" | "payfail" | "churnwhatif" | "pricechurn" | "mrrforecast";

export function classifyGrowthQuestion(question: string): { kind: GrowthKind; pp?: number } | null {
  const q = norm(question);
  const has = (re: RegExp) => re.test(q);
  const price = has(/\b(preco|valor da assinatura|mensalidade|barat\w*)\b/);
  const churn = has(/\b(churn|cancel\w*|retencao|permanencia)\b/);
  if (price && churn && has(/\b(melhor\w*|reduz\w*|diminu\w*|baix\w*|cai\w*|ajud\w*|segur\w*)\b/)) return { kind: "pricechurn" };
  if (churn && has(/\b(e se|se eu|se a gente|reduz\w*|diminu\w*|baix\w*|cair|cai)\b/) && has(/\d/)) {
    const m = /(\d+(?:[ .,]\d+)?)\s*(ponto|pontos|pp|p p|%)/.exec(q.replace(",", "."));
    if (m) return { kind: "churnwhatif", pp: Math.min(3, Math.max(0.1, Number(m[1].replace(" ", ".")))) };
  }
  if (has(/\b(cac|custo de aquisicao|custa adquirir|custa conquistar|custa captar|custo por assinante|custo por assinatura)\b/)) return { kind: "cac" };
  if (has(/\b(ltv|lifetime|valor do cliente|valor do assinante)\b/)) return { kind: "ltv" };
  if (has(/\b(payback)\b/)) return { kind: "payback" };
  if (has(/\b(roi|vale a pena|compensa|retorno)\b/) && has(/\b(midia|meta|google|canal|anuncio|ads)\b/)) return { kind: "roi" };
  if (has(/\b(funil|paywall|checkout|abandon\w*|conversao|carrinho)\b/) || has(/\bperd\w* .*(gente|visitante|usuario)\b/)) return { kind: "funnel" };
  if (has(/\b(falha|falhas)\b.*\b(pagamento|cartao)\b/) && has(/\b(receita|perco|perdendo|mrr|quanto|dinheiro)\b/)) return { kind: "payfail" };
  if (has(/\b(faturar|faturamento|receita|mrr)\b/) && has(/\b(dezembro|dez|fim do ano|projec\w*|previs\w*|vou|vai)\b/)) return { kind: "mrrforecast" };
  return null;
}

export function growthAnswer(ds: Dataset, question: string): AiAnswer | null {
  const c = classifyGrowthQuestion(question);
  if (!c) return null;
  const series = buildSeries(ds);
  const m1 = series.length - 1;
  const m0 = m1 - 5;
  const now = series[m1];
  const base = { intent: "canais" as const, followUps: FOLLOW };

  if (c.kind === "cac" || c.kind === "ltv" || c.kind === "payback" || c.kind === "roi") {
    const econ = unitEconomics(ds, m0, m1).filter((r) => r.ltvCac !== null);
    const byCac = [...econ].sort((a, b) => a.cac - b.cac);
    const byRatio = [...econ].sort((a, b) => (b.ltvCac as number) - (a.ltvCac as number));
    const worst = byRatio[byRatio.length - 1];
    const best = byRatio[0];
    const note = "O CAC é premissa sintética por canal (o dataset não tem custo de mídia); o LTV é a receita esperada em 12 meses.";
    const common = { ...base, basedOn: ["Eficiência por canal · LTV × CAC"] };
    if (c.kind === "cac")
      return { ...common, title: "CAC por canal", text: `O canal mais barato é ${byCac[0].channel} (${brl(byCac[0].cac)} por assinante) e o mais caro é ${byCac[byCac.length - 1].channel} (${brl(byCac[byCac.length - 1].cac)}). ${note}`, cards: [{ id: "cac", kind: "bars", title: "CAC por canal (R$)", rows: byCac.map((r) => ({ label: r.channel, value: Math.round(r.cac) })), format: "brl" }] };
    if (c.kind === "ltv")
      return { ...common, title: "LTV de 12 meses por canal", text: `${best.channel} tem o maior LTV/CAC (${(best.ltvCac as number).toFixed(1).replace(".", ",")}x) e ${worst.channel} o menor (${(worst.ltvCac as number).toFixed(1).replace(".", ",")}x, LTV de ${brl(worst.ltv12 as number)} contra CAC de ${brl(worst.cac)}). ${note}`, cards: [{ id: "ltv", kind: "bars", title: "LTV 12 meses (R$)", rows: [...econ].sort((a, b) => (b.ltv12 as number) - (a.ltv12 as number)).map((r) => ({ label: r.channel, value: Math.round(r.ltv12 as number), note: `${(r.ltvCac as number).toFixed(1).replace(".", ",")}x o CAC` })), format: "brl" }] };
    if (c.kind === "payback")
      return { ...common, title: "Payback do CAC por canal", text: `${worst.channel} é o que demora mais para se pagar: ${(worst.payback as number).toFixed(1).replace(".", ",")} meses de ticket para recuperar o CAC. ${best.channel} se paga em ${(best.payback as number).toFixed(1).replace(".", ",")} mês. ${note}`, cards: [{ id: "payback", kind: "bars", title: "Payback (meses)", rows: [...econ].sort((a, b) => (b.payback as number) - (a.payback as number)).map((r) => ({ label: r.channel, value: Number((r.payback as number).toFixed(1)) })), format: "num" }] };
    const paid = econ.filter((r) => r.channel.startsWith("Mídia paga"));
    return { ...common, title: "Vale a pena investir em mídia paga?", text: `${paid.map((r) => `${r.channel}: LTV/CAC de ${(r.ltvCac as number).toFixed(1).replace(".", ",")}x, payback de ${(r.payback as number).toFixed(1).replace(".", ",")} meses, retenção em 6 meses de ${pct(r.retention6 ?? 0, 0)}`).join("; ")}. Regra prática: abaixo de 3x o canal não sustenta escala, e o que mais pesa é a retenção. Já ${best.channel} entrega ${(best.ltvCac as number).toFixed(1).replace(".", ",")}x. ${note}`, cards: [{ id: "roi", kind: "table", title: "Eficiência da mídia paga", columns: ["Canal", "CAC", "LTV 12m", "LTV/CAC", "Payback"], rows: paid.map((r) => [r.channel, brl(r.cac), brl(r.ltv12 as number), `${(r.ltvCac as number).toFixed(1).replace(".", ",")}x`, `${(r.payback as number).toFixed(1).replace(".", ",")} m`]) }] };
  }

  if (c.kind === "funnel") {
    const f = fullFunnel(ds, m0, m1);
    const leak = f.leak;
    return {
      ...base,
      title: "Funil de compra",
      text: `De ${int(f.total[0].value)} visitantes não assinantes, ${int(f.total[1].value)} iniciaram a compra (${pct(f.total[1].fromPrev ?? 0)}), ${int(f.total[2].value)} chegaram à revisão, ${int(f.total[3].value)} ao cartão e ${int(f.total[4].value)} compraram: ${pct(f.total[4].fromTop, 2)} no total. A etapa mais fraca é ${f.weakestStep.label} (${pct(f.weakestStep.rate, 0)}).${leak ? ` O maior vazamento é ${leak.channel} em ${leak.stepLabel}: ${pct(leak.rate, 0)} contra ${pct(leak.benchmark, 0)} do mix, ~${int(leak.recoverable)} assinaturas a mais no período se igualasse.` : ""} Visitantes, revisão e cartão são estimados por taxas do canal; compras são reais.`,
      basedOn: ["Funil de compra"],
      cards: [{ id: "funnel", kind: "bars", title: "Etapas do funil", rows: f.total.map((s) => ({ label: s.label, value: s.value })), format: "num" }],
    };
  }

  if (c.kind === "mrrforecast") {
    const proj = projectActive(series, ds.meta.goalActive, ds.meta.goalMonth);
    const r = whatIf(series, proj, NO_CHANGE);
    return {
      ...base,
      intent: "meta",
      title: `MRR projetado para ${r.goalLabel}`,
      text: `No ritmo atual, ${r.goalLabel} termina com ${int(r.baseActive)} assinantes e ${brlK(r.baseMrr)} de MRR (ticket médio de ${brl(r.base.arpu)}). Para bater a meta de ${int(r.goal)} assinantes faltam ${int(Math.max(0, r.baseGap))}; isso equivaleria a ${brlK(r.base.mrrNow + (r.goal - r.base.activeNow) * r.base.arpu)} de MRR. Projeção linear sobre a base atual, sem novos reajustes.`,
      basedOn: ["Evolução de assinantes", "Simulador"],
      cards: [{ id: "mrr-forecast", kind: "stats", title: "Projeção " + r.goalLabel, items: [{ label: "Assinantes", value: int(r.baseActive), tone: "neutro" }, { label: "MRR", value: brlK(r.baseMrr), tone: "neutro" }, { label: "Falta p/ meta", value: int(Math.max(0, r.baseGap)), tone: r.baseGap > 0 ? "ruim" : "bom" }] }],
    };
  }

  if (c.kind === "payfail") {
    const last3 = series.slice(-3);
    const lost = last3.reduce((a, p) => a + p.cancelled * p.involuntaryShare, 0) / last3.length;
    const mrrLost = lost * now.arpu;
    return {
      ...base,
      intent: "motivos",
      title: "Receita perdida por falha de pagamento",
      text: `Nos últimos 3 meses, ${int(lost)} assinantes por mês cancelaram por falha de pagamento (${pct(last3.reduce((a, p) => a + p.involuntaryShare, 0) / 3, 0)} dos cancelamentos), cerca de ${brlK(mrrLost)} de MRR por mês. Recuperar 30% com cobrança melhor (nova tentativa, aviso antes do vencimento) devolveria ~${int(lost * 0.3)} assinantes e ${brlK(mrrLost * 0.3)} de MRR por mês. É a alavanca mais barata, porque o cliente não quis sair.`,
      basedOn: ["Motivos de cancelamento", "Simulador"],
      cards: [{ id: "payfail", kind: "stats", title: "Falha de pagamento por mês", items: [{ label: "Assinantes perdidos", value: int(lost), tone: "ruim" }, { label: "MRR perdido", value: brlK(mrrLost), tone: "ruim" }, { label: "Se recuperar 30%", value: `+${brlK(mrrLost * 0.3)}`, tone: "bom" }] }],
    };
  }

  if (c.kind === "churnwhatif") {
    const proj = projectActive(series, ds.meta.goalActive, ds.meta.goalMonth);
    const r = whatIf(series, proj, { ...NO_CHANGE, churnCut: (c.pp ?? 1) / 100 });
    const ppText = String(c.pp).replace(".", ",");
    const tooMuch = (c.pp ?? 1) / 100 > r.base.voluntaryChurn;
    return {
      ...base,
      intent: "churn",
      title: `E se o churn caísse ${ppText} p.p.?`,
      text: `${tooMuch ? `Atenção: o churn voluntário hoje é ${pct(r.base.voluntaryChurn)} ao mês, então cortar ${ppText} p.p. passa do teto. ` : ""}Com −${ppText} p.p. de churn voluntário, ${r.goalLabel} termina com ${int(r.scenarioActive)} assinantes (${r.deltaActive >= 0 ? "+" : "−"}${int(Math.abs(r.deltaActive))} vs a projeção de ${int(r.baseActive)}) e ${brlK(r.scenarioMrr)} de MRR (+${brlK(r.deltaMrr)}). ${r.hitsGoal ? "A meta fecha." : `Ainda faltam ${int(r.scenarioGap)} para os ${int(r.goal)}.`} Teste combinações na aba Simulador.`,
      basedOn: ["Simulador", "Evolução de assinantes"],
      cards: [{ id: "churn-whatif", kind: "stats", title: "Efeito no fim de " + r.goalLabel, items: [{ label: "Assinantes", value: int(r.scenarioActive), tone: r.hitsGoal ? "bom" : "neutro" }, { label: "Δ assinantes", value: `+${int(r.deltaActive)}`, tone: "bom" }, { label: "Δ MRR", value: `+${brlK(r.deltaMrr)}`, tone: "bom" }, { label: "Falta p/ meta", value: int(Math.max(0, r.scenarioGap)), tone: r.hitsGoal ? "bom" : "ruim" }] }],
    };
  }

  // pricechurn: "baixar o preço melhora o churn?" → teto do efeito, a partir dos motivos de cancelamento
  const reasons = churnReasons(ds, m0, m1);
  const priceRows = reasons.rows.filter((r) => r.reason === "Preço" || r.reason === "Fim da promoção");
  const priceOnly = reasons.rows.find((r) => r.reason === "Preço")?.count ?? 0;
  const priceAll = priceRows.reduce((a, r) => a + r.count, 0);
  const perMonth = priceOnly / 6;
  const ceiling = perMonth / Math.max(1, series[m1 - 3].active);
  return {
    ...base,
    intent: "preco",
    title: "Baixar o preço melhora o churn?",
    text: `Provavelmente alivia, mas pouco. "Preço" é o motivo de ${pct(priceOnly / Math.max(1, reasons.total), 0)} dos cancelamentos (${int(priceOnly)} nos últimos 6 meses, ~${int(perMonth)} por mês). Mesmo se um desconto eliminasse todos eles, o churn cairia no máximo ${pct(ceiling, 1)} ao mês: é o teto. Somando "fim da promoção", o efeito do preço chega a ${int(priceAll)} cancelamentos, mas esses saem quando o desconto acaba, então baixar o preço de tabela resolve só parte. O reajuste de jul/26 mostrou o sentido (churn de Mensal/Combo subiu), mas o dataset não tem teste de preço, então a elasticidade não é medida. O custo é certo: com −10% de preço, a base precisa crescer 11,1% para manter o MRR.`,
    basedOn: ["Motivos de cancelamento", "Reajuste de preço"],
    cards: [{ id: "price-churn", kind: "stats", title: "Teto do efeito do preço no churn", items: [{ label: "Cancelam por preço", value: `${int(perMonth)}/mês`, tone: "neutro" }, { label: "Teto de queda do churn", value: `${pct(ceiling, 1)} a.m.`, tone: "neutro" }, { label: "Custo de −10% no preço", value: "base +11,1%", tone: "ruim" }] }],
    followUps: ["Como foi o reajuste de preço?", "Por que os assinantes cancelam?", "Vamos bater a meta de dezembro?"],
  };
}

// Notas editoriais por mês: lê a série e os eventos e escreve 3–5 linhas objetivas sobre o que aconteceu.
// Sem IA generativa: regras determinísticas sobre números do motor (o texto sempre bate com o gráfico).

import type { MonthPoint } from "./metrics";
import type { EventMarker } from "./types";

export type NoteTone = "positivo" | "atenção" | "neutro";

export interface MonthNote {
  m: number;
  label: string;
  tone: NoteTone;
  /** frase-manchete */
  headline: string;
  lines: string[];
  /** pergunta para a Mesa de análise aprofundar */
  ask: string;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const num = (n: number) => Math.round(n).toLocaleString("pt-BR");
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${num(Math.abs(n))}`;
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d).replace(".", ",")}%`;
const pp = (x: number) => `${x >= 0 ? "+" : "−"}${(Math.abs(x) * 100).toFixed(1).replace(".", ",")} p.p.`;

/** Janela de comparação: até 12 meses antes do mês analisado. */
const LOOKBACK = 12;

export function monthNote(series: MonthPoint[], events: EventMarker[], m: number): MonthNote | null {
  const p = series[m];
  if (!p) return null;
  const prior = series.slice(Math.max(0, m - LOOKBACK), m);
  const hasRef = prior.length >= 3;
  const avgNew = avg(prior.map((x) => x.newSubs));
  const avgChurn = avg(prior.map((x) => x.churnRate));
  const avgNet = avg(prior.map((x) => x.netAdds));

  const lines: string[] = [`${p.newSubs.toLocaleString("pt-BR")} novas e ${p.cancelled.toLocaleString("pt-BR")} cancelamentos: saldo ${signed(p.netAdds)}${hasRef ? ` (média anterior: ${signed(avgNet)})` : ""}.`];

  let newRatio = 1;
  let churnDiff = 0;
  if (hasRef) {
    newRatio = avgNew ? p.newSubs / avgNew : 1;
    churnDiff = p.churnRate - avgChurn;
    if (newRatio >= 1.25) lines.push(`Aquisição em ${newRatio.toFixed(1).replace(".", ",")}x a média dos meses anteriores.`);
    else if (newRatio <= 0.8) lines.push(`Aquisição ${pct(1 - newRatio, 0)} abaixo da média dos meses anteriores.`);
    lines.push(`Churn de ${pct(p.churnRate)} (${pp(churnDiff)} vs a média anterior).`);
  } else {
    lines.push(`Churn de ${pct(p.churnRate)}.`);
  }
  if (p.involuntaryShare >= 0.15) lines.push(`${pct(p.involuntaryShare, 0)} dos cancelamentos foram falha de pagamento, parte recuperável com cobrança melhor.`);
  if (p.paidShareNew >= 0.45) lines.push(`${pct(p.paidShareNew, 0)} das novas vieram de mídia paga, canal que costuma reter pior.`);

  const here = events.filter((e) => e.month === m);
  for (const e of here) lines.push(`${e.label}: ${e.description}`);
  if (!here.length && hasRef && churnDiff >= 0.005) {
    const recent = events.filter((e) => e.month < m && m - e.month <= 3);
    if (recent.length) lines.push(`O churn acima da média coincide com o efeito recente de ${recent.map((e) => e.label).join(" e ")}.`);
  }

  const bad = hasRef && churnDiff >= 0.005;
  const good = hasRef && p.netAdds > avgNet && !bad;
  const tone: NoteTone = bad ? "atenção" : good ? "positivo" : "neutro";
  const headline = bad
    ? `${p.label}: churn acima do normal`
    : newRatio >= 1.25
      ? `${p.label}: pico de aquisição`
      : good
        ? `${p.label}: mês acima da média`
        : `${p.label}: mês dentro do padrão`;
  const ask = bad ? "Como está o churn?" : newRatio >= 1.25 ? "Qual canal retém pior?" : "Vamos bater a meta de dezembro?";
  return { m, label: p.label, tone, headline, lines, ask };
}

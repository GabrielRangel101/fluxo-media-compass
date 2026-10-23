// Perguntas sobre PREÇO que o roteador principal (ask.ts) não separa: "qual o preço?" e "e se mudarmos o preço?".
// ask.ts manda toda pergunta com "preço" para a análise do reajuste; aqui respondemos o que foi perguntado.
// Só chama o motor (model/metrics/growth); nenhum número é inventado.

import type { AiAnswer } from "./ask";
import { norm } from "./ask";
import { mrrBridge } from "./growth";
import { buildSeries } from "./metrics";
import { EVENT_REAJUSTE, LAST_MONTH, listPrice, isActiveAt } from "./model";
import { PLANS } from "./types";
import type { Dataset } from "./types";

const brl2 = (x: number) => `R$ ${x.toFixed(2).replace(".", ",")}`;
const brlK = (x: number) => `R$ ${(x / 1000).toFixed(1).replace(".", ",")} mil`;
const int = (x: number) => Math.round(x).toLocaleString("pt-BR");

const WHATIF = /\b(e se|se a gente|se nos|se eu|diminu\w*|reduz\w*|baix\w*|cort\w*|aument\w*|sub\w*|elev\w*|mud\w*|trocar)\b/;
const PRICE = /\b(preco|precos|valor|valores|mensalidade|quanto custa|quanto e|quanto sai)\b/;
const REAJUSTE = /\b(reajuste|reajustou|reajustes)\b/;

export type PriceQuestion = { kind: "list" } | { kind: "whatif"; direction: "down" | "up"; pct: number };

/** Classifica a pergunta; null = deixa o roteador principal responder. */
export function classifyPriceQuestion(question: string): PriceQuestion | null {
  const q = norm(question);
  if (!PRICE.test(q) || REAJUSTE.test(q)) return null;
  const mentionsChange = WHATIF.test(q);
  if (!mentionsChange) return { kind: "list" };
  const m = /(\d+(?:[.,]\d+)?)\s*%/.exec(question);
  const pct = m ? Math.min(60, Math.max(1, Number(m[1].replace(",", ".")))) : 10;
  const up = /\b(aument\w*|sub\w*|elev\w*)\b/.test(q) && !/\b(diminu\w*|reduz\w*|baix\w*|cort\w*)\b/.test(q);
  return { kind: "whatif", direction: up ? "up" : "down", pct };
}

export function priceAnswer(ds: Dataset, question: string): AiAnswer | null {
  const c = classifyPriceQuestion(question);
  if (!c) return null;
  const series = buildSeries(ds);
  const now = series[series.length - 1];
  const before = EVENT_REAJUSTE - 1;

  if (c.kind === "list") {
    let inPromo = 0;
    let active = 0;
    for (const s of ds.subscribers) {
      if (!isActiveAt(s, LAST_MONTH)) continue;
      active++;
      if (s.promoDiscount > 0 && LAST_MONTH < s.startMonth + s.promoMonths) inPromo++;
    }
    const rows = PLANS.map((p) => [p, brl2(listPrice(p, LAST_MONTH)), brl2(listPrice(p, before)), p === "Anual" ? "R$ 299,00 por ano" : "mensal"]);
    return {
      intent: "preco",
      title: "Preço de tabela dos planos",
      text: `Hoje: Mensal ${brl2(listPrice("Mensal", LAST_MONTH))} (era ${brl2(listPrice("Mensal", before))} até jun/26), Combo Streaming ${brl2(listPrice("Combo Streaming", LAST_MONTH))} (era ${brl2(listPrice("Combo Streaming", before))}), Anual ${brl2(listPrice("Anual", LAST_MONTH))} por mês-equivalente (R$ 299 por ano, sem reajuste) e Estudante ${brl2(listPrice("Estudante", LAST_MONTH))}. O ticket médio realizado é ${brl2(now.arpu)}: fica abaixo do Mensal pelo mix (Anual e Estudante custam menos) e porque ${int(inPromo)} assinantes (${((inPromo / Math.max(1, active)) * 100).toFixed(0)}%) ainda estão em promoção.`,
      basedOn: ["Planos · base × receita", "Reajuste de preço"],
      cards: [
        { id: "price-table", kind: "table", title: "Preço de tabela por plano", columns: ["Plano", "Hoje", "Até jun/26", "Cobrança"], rows },
        { id: "price-stats", kind: "stats", title: "Ticket realizado", items: [{ label: "Ticket médio", value: brl2(now.arpu), tone: "neutro" }, { label: "Em promoção", value: `${int(inPromo)} de ${int(active)}`, tone: inPromo / Math.max(1, active) > 0.25 ? "ruim" : "neutro" }] },
      ],
      followUps: ["Como foi o reajuste de preço?", "Qual a composição por plano?", "Vamos bater a meta de dezembro?"],
    };
  }

  // e se mudarmos o preço: conta de equilíbrio do MRR + evidência do reajuste de jul/26
  const d = c.pct / 100;
  const m1 = series.length - 1;
  const hike = mrrBridge(ds, m1 - 5, m1).parts.hike;
  const base = now.active;
  const evidence = `Evidência mais próxima no dataset: o reajuste de jul/26 (+12% Mensal, +11% Combo) elevou o churn desses planos, mas somou ${brlK(hike)} de MRR na janela de 6 meses.`;
  if (c.direction === "down") {
    const need = d / (1 - d);
    return {
      intent: "preco",
      title: `E se o preço caísse ${c.pct.toFixed(0)}%?`,
      text: `Para manter o MRR atual (${brlK(now.mrr)}), a base teria de crescer ${(need * 100).toFixed(1).replace(".", ",")}%: cerca de +${int(base * need)} assinantes sobre os ${int(base)} de hoje. O saldo líquido atual é de ${int(series[m1].netAdds)} por mês, então repor só essa perda levaria ~${(base * need / Math.max(1, series[m1].netAdds)).toFixed(0)} meses de crescimento. ${evidence} O dataset não tem teste de preço, então não há elasticidade medida: trate como conta de equilíbrio, não como previsão.`,
      basedOn: ["Ponte de MRR", "Reajuste de preço"],
      cards: [{ id: "price-whatif", kind: "stats", title: `Preço −${c.pct.toFixed(0)}%: o que precisa acontecer`, items: [{ label: "Base necessária", value: `+${(need * 100).toFixed(1).replace(".", ",")}%`, tone: "ruim" }, { label: "Assinantes a mais", value: `+${int(base * need)}`, tone: "ruim" }, { label: "MRR de hoje", value: brlK(now.mrr), tone: "neutro" }] }],
      followUps: ["Como foi o reajuste de preço?", "Vamos bater a meta de dezembro?", "Qual a composição por plano?"],
    };
  }
  const tol = d / (1 + d);
  return {
    intent: "preco",
    title: `E se o preço subisse ${c.pct.toFixed(0)}%?`,
    text: `Subir ${c.pct.toFixed(0)}% mantém o MRR atual (${brlK(now.mrr)}) mesmo perdendo até ${(tol * 100).toFixed(1).replace(".", ",")}% da base: cerca de ${int(base * tol)} dos ${int(base)} assinantes. Acima disso o reajuste custa receita. ${evidence} O dataset não tem teste de preço, então a elasticidade não é medida: é uma conta de equilíbrio, não uma previsão.`,
    basedOn: ["Ponte de MRR", "Reajuste de preço"],
    cards: [{ id: "price-whatif", kind: "stats", title: `Preço +${c.pct.toFixed(0)}%: tolerância de perda`, items: [{ label: "Perda máxima de base", value: `${(tol * 100).toFixed(1).replace(".", ",")}%`, tone: "bom" }, { label: "Assinantes", value: `${int(base * tol)}`, tone: "neutro" }, { label: "MRR de hoje", value: brlK(now.mrr), tone: "neutro" }] }],
    followUps: ["Como foi o reajuste de preço?", "Quanto de MRR está em risco?", "Como está o churn?"],
  };
}

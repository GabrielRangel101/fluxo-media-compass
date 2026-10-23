// Roteador de perguntas do "Modo IA": entende a pergunta por intenção + entidades (regras determinísticas)
// e devolve texto + cards de dados. NUNCA calcula nada: só chama o motor (metrics/insights) e monta a resposta.
// Um LLM local (ex.: Phi-3) poderia substituir apenas `detectIntent`/redação; os números continuam vindos daqui.

import { generateInsights } from "./insights";
import type { Insight } from "./insights";
import {
  atRisk,
  buildSeries,
  churnBySegment,
  churnReasons,
  cohortRetention,
  composition,
  editoriaHealth,
  funnelByChannel,
  npsWindow,
  projectActive,
} from "./metrics";
import { monthLabel } from "./calendar";
import { CHANNELS, EDITORIAS, PLANS } from "./types";
import type { Dataset } from "./types";

export type AskFormat = "pct" | "num" | "brl";

export type AiCard =
  | { id: string; kind: "line"; title: string; subtitle?: string; x: string[]; series: { name: string; values: (number | null)[] }[]; format: AskFormat; reference?: { label: string; value: number } }
  | { id: string; kind: "bars"; title: string; subtitle?: string; rows: { label: string; value: number; note?: string }[]; format: AskFormat }
  | { id: string; kind: "donut"; title: string; subtitle?: string; rows: { label: string; value: number }[] }
  | { id: string; kind: "stats"; title: string; items: { label: string; value: string; tone?: "bom" | "ruim" | "neutro" }[] }
  | { id: string; kind: "table"; title: string; columns: string[]; rows: string[][] };

export type Intent =
  | "resumo"
  | "churn"
  | "motivos"
  | "canais"
  | "safras"
  | "risco"
  | "meta"
  | "planos"
  | "editorias"
  | "nps"
  | "preco"
  | "desconhecida";

export interface AiAnswer {
  intent: Intent;
  title: string;
  /** texto curto em pt-BR, com os números injetados */
  text: string;
  /** seções do dashboard usadas ("Com base em: …") */
  basedOn: string[];
  cards: AiCard[];
  followUps: string[];
}

// ------------------------------------------------------------------ utilidades

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9% ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d).replace(".", ",")}%`;
const brl = (x: number) => `R$ ${Math.round(x).toLocaleString("pt-BR")}`;

const INTENT_KEYWORDS: Record<Exclude<Intent, "desconhecida">, string[]> = {
  resumo: ["resumo", "resumir", "visao geral", "como estamos", "como estao", "panorama", "principais", "insight", "o que esta pior", "destaque", "alerta"],
  churn: ["churn", "cancelamento", "cancelamentos", "cancelam", "cancelaram", "evasao", "saida", "perda de assinantes", "perdendo"],
  motivos: ["motivo", "motivos", "razao", "razoes", "por que cancel", "porque cancel", "causa", "involuntario", "falha de pagamento"],
  canais: ["canal", "canais", "midia paga", "meta ads", "google", "newsletter", "organico", "aquisicao", "funil", "conversao", "paywall", "cac"],
  safras: ["safra", "safras", "coorte", "coortes", "retencao", "permanencia", "black friday", "copa", "eleicoes", "campanha"],
  risco: ["risco", "criticos", "critica", "prestes", "vao cancelar", "quem vai sair", "em perigo", "propensao"],
  meta: ["meta", "projecao", "projetar", "objetivo", "dezembro", "vamos bater", "bater a meta", "forecast"],
  planos: ["plano", "planos", "mensal", "anual", "combo", "estudante", "composicao", "mix", "arpu", "ticket", "mrr", "receita"],
  editorias: ["editoria", "editorias", "esportes", "politica", "economia", "regional", "cultura", "variedades", "engajamento", "conteudo"],
  nps: ["nps", "satisfacao", "promotor", "detrator", "recomendacao"],
  preco: ["preco", "reajuste", "aumento", "promocao", "desconto", "penhasco"],
};

/** Pontua cada intenção por palavras-chave (frases mais longas valem mais) e devolve a melhor. */
export function detectIntent(question: string): { intent: Intent; score: number } {
  const q = ` ${norm(question)} `;
  let best: Intent = "desconhecida";
  let bestScore = 0;
  for (const [intent, words] of Object.entries(INTENT_KEYWORDS) as [Exclude<Intent, "desconhecida">, string[]][]) {
    let score = 0;
    for (const w of words) if (q.includes(` ${w} `) || (w.length > 5 && q.includes(w))) score += w.includes(" ") ? 3 : 2;
    if (score > bestScore) {
      best = intent;
      bestScore = score;
    }
  }
  // "por que ... cancel..." é pergunta de motivo, mesmo sem a frase exata
  if (/ (por que|porque|pq) /.test(q) && /cancel|sair|saem|deixam/.test(q)) return { intent: "motivos", score: bestScore + 4 };
  return { intent: best, score: bestScore };
}

export interface Entities {
  channel?: string;
  plan?: string;
  editoria?: string;
  /** nº de meses citados ("últimos 6 meses", "3 meses", "semestre", "ano") */
  months?: number;
}

export function extractEntities(question: string): Entities {
  const q = ` ${norm(question)} `;
  const e: Entities = {};
  e.channel = CHANNELS.find((c) => {
    const n = norm(c);
    return q.includes(n) || (c.includes("Meta") && q.includes(" meta ads ")) || (c.includes("Google") && q.includes(" google ")) || (c === "Orgânico" && q.includes(" organico "));
  });
  e.plan = PLANS.find((p) => q.includes(` ${norm(p)} `) || (p === "Combo Streaming" && q.includes(" combo ")));
  e.editoria = EDITORIAS.find((x) => q.includes(norm(x)));
  const m = q.match(/(\d{1,2}) mes/);
  if (m) e.months = Math.min(24, Math.max(1, Number(m[1])));
  else if (q.includes(" semestre ")) e.months = 6;
  else if (q.includes(" trimestre ")) e.months = 3;
  else if (q.includes(" ano ")) e.months = 12;
  return e;
}

// ------------------------------------------------------------------ respostas por intenção

const SUGGESTIONS: Record<Intent, string[]> = {
  resumo: ["Como está o churn?", "Quem está em risco de cancelar?", "Vamos bater a meta de dezembro?"],
  churn: ["Por que os assinantes cancelam?", "Qual canal retém pior?", "Como foi o reajuste de preço?"],
  motivos: ["Como está o churn?", "Quanto de MRR está em risco?", "Qual safra retém pior?"],
  canais: ["Compare as safras de campanha", "Por que os assinantes cancelam?", "Resumo dos principais alertas"],
  safras: ["Qual canal retém pior?", "Como está o churn?", "Quem está em risco de cancelar?"],
  risco: ["Por que os assinantes cancelam?", "Como estão as editorias?", "Vamos bater a meta de dezembro?"],
  meta: ["Como está o churn?", "Qual canal converte melhor?", "Resumo dos principais alertas"],
  planos: ["Como está o NPS?", "Como está o churn?", "Como estão as editorias?"],
  editorias: ["Quem está em risco de cancelar?", "Como está o NPS?", "Qual a composição por plano?"],
  nps: ["Como estão as editorias?", "Como está o churn?", "Resumo dos principais alertas"],
  preco: ["Qual safra retém pior?", "Como está o churn?", "Quanto de MRR está em risco?"],
  desconhecida: ["Resumo dos principais alertas", "Como está o churn?", "Quem está em risco de cancelar?", "Vamos bater a meta de dezembro?"],
};

function byTopic(insights: Insight[], ...topics: Insight["topic"][]) {
  return insights.filter((i) => topics.includes(i.topic));
}

export function answer(ds: Dataset, question: string, month?: number): AiAnswer {
  const series = buildSeries(ds);
  const m = month ?? series.length - 1;
  const cur = series[m];
  const { intent } = detectIntent(question);
  const ent = extractEntities(question);
  const insights = generateInsights(ds, m);
  const n = ent.months ?? 12;
  const m0 = Math.max(0, m - n + 1);
  const slice = series.slice(m0, m + 1);
  const cards: AiCard[] = [];
  const out = (title: string, text: string, basedOn: string[]): AiAnswer => ({ intent, title, text, basedOn, cards, followUps: SUGGESTIONS[intent] });

  switch (intent) {
    case "churn": {
      const target = ds.meta.churnTarget;
      const avg = slice.reduce((a, p) => a + p.churnRate, 0) / slice.length;
      const peak = [...slice].sort((a, b) => b.churnRate - a.churnRate)[0];
      cards.push({
        id: "churn-line",
        kind: "line",
        title: "Churn mensal",
        subtitle: `${slice[0].label} a ${cur.label}`,
        x: slice.map((p) => p.label),
        series: [{ name: "Churn", values: slice.map((p) => p.churnRate) }],
        format: "pct",
        reference: { label: `Meta ${pct(target)}`, value: target },
      });
      const involuntary = churnReasons(ds, m0, m).byNature.find((x) => x.nature === "Involuntário");
      cards.push({
        id: "churn-stats",
        kind: "stats",
        title: "Leitura rápida",
        items: [
          { label: `Churn de ${cur.label}`, value: pct(cur.churnRate), tone: cur.churnRate > target ? "ruim" : "bom" },
          { label: `Média de ${slice.length} meses`, value: pct(avg), tone: "neutro" },
          { label: "Pico no período", value: `${peak.label} · ${pct(peak.churnRate)}`, tone: "ruim" },
          ...(involuntary ? [{ label: "Involuntário", value: pct(involuntary.share, 0), tone: "neutro" as const }] : []),
        ],
      });
      const gap = cur.churnRate - target;
      return out(
        "Churn",
        `O churn de ${cur.label} é ${pct(cur.churnRate)}, ${gap > 0 ? `${((gap) * 100).toFixed(1).replace(".", ",")} p.p. acima` : `${(-gap * 100).toFixed(1).replace(".", ",")} p.p. abaixo`} da meta de ${pct(target)}. Média de ${slice.length} meses: ${pct(avg)}; pico em ${peak.label} (${pct(peak.churnRate)}).`,
        ["Churn mensal", "Evolução de assinantes", "Motivos de cancelamento"],
      );
    }

    case "motivos": {
      const r = churnReasons(ds, m0, m);
      cards.push({ id: "reasons-donut", kind: "donut", title: "Motivos de cancelamento", subtitle: `${monthLabel(m0)} a ${cur.label}`, rows: r.rows.slice(0, 8).map((x) => ({ label: x.reason, value: x.count })) });
      cards.push({ id: "nature-bars", kind: "bars", title: "Natureza do cancelamento", rows: r.byNature.map((x) => ({ label: x.nature, value: x.share, note: `${x.count}` })), format: "pct" });
      const top = r.rows[0];
      const inv = r.byNature.find((x) => x.nature === "Involuntário");
      return out(
        "Motivos de cancelamento",
        `Em ${slice.length} meses foram ${r.total.toLocaleString("pt-BR")} cancelamentos. O principal motivo é "${top.reason}" (${pct(top.share, 0)})${inv ? `; ${pct(inv.share, 0)} foram involuntários (falha de pagamento), a alavanca mais barata de recuperar` : ""}.`,
        ["Motivos de cancelamento", "Fluxo de assinantes"],
      );
    }

    case "canais": {
      const ret = cohortRetention(ds, "channel", { minSize: 150 }).filter((c) => c.retention[6] != null);
      const funnel = funnelByChannel(ds, m0, m);
      const focus = ent.channel;
      cards.push({
        id: "channel-ret",
        kind: "bars",
        title: "Retenção em 6 meses por canal",
        rows: ret.map((c) => ({ label: c.key, value: (c.retention[6] as number) / 100, note: `${c.size.toLocaleString("pt-BR")} assin.` })).sort((a, b) => b.value - a.value),
        format: "pct",
      });
      cards.push({ id: "channel-conv", kind: "bars", title: "Conversão paywall → compra", subtitle: `${slice.length} meses`, rows: funnel.map((f) => ({ label: f.channel, value: f.overall, note: `${f.purchases.toLocaleString("pt-BR")} compras` })).sort((a, b) => b.value - a.value), format: "pct" });
      const ins = byTopic(insights, "canais")[0];
      const f = focus ? funnel.find((x) => x.channel === focus) : undefined;
      const r6 = focus ? ret.find((x) => x.key === focus) : undefined;
      const base = f
        ? `${focus}: ${f.purchases.toLocaleString("pt-BR")} compras no período, conversão total ${pct(f.overall, 2)}${r6 ? ` e retenção de ${Math.round(r6.retention[6] as number)}% em 6 meses` : ""}.`
        : "";
      return out("Canais de aquisição", `${base} ${ins ? ins.text : ""}`.trim(), ["Funil por canal", "Coortes por canal"]);
    }

    case "safras": {
      const camp = cohortRetention(ds, "campaign", { minSize: 80, minObservable: 60 });
      const maxAge = 8;
      cards.push({
        id: "cohort-lines",
        kind: "line",
        title: "Retenção por safra",
        subtitle: "% ainda ativo, por meses desde a entrada (Kaplan-Meier)",
        x: Array.from({ length: maxAge + 1 }, (_, k) => `M${k}`),
        series: camp.map((c) => ({ name: c.key, values: c.retention.slice(0, maxAge + 1).map((v) => (v === null ? null : v / 100)) })),
        format: "pct",
      });
      const list = byTopic(insights, "coortes").slice(0, 3);
      cards.push({ id: "cohort-stats", kind: "stats", title: "Safras vs. base regular", items: list.map((i) => ({ label: i.title, value: `${i.value != null ? (i.value * 100).toFixed(0).replace(".", ",") : ""} p.p.`, tone: i.severity === "positivo" ? "bom" : "ruim" })) });
      return out("Safras e retenção", list.length ? list.map((i) => i.text).join(" ") : "Nenhuma safra de campanha foge do padrão da base regular.", ["Coortes de retenção", "Insights"]);
    }

    case "risco": {
      const risk = atRisk(ds, m);
      cards.push({
        id: "risk-stats",
        kind: "stats",
        title: "Zona crítica",
        items: [
          { label: "Assinantes críticos", value: risk.critical.toLocaleString("pt-BR"), tone: "ruim" },
          { label: "% da base", value: pct(risk.criticalShare), tone: "ruim" },
          { label: "MRR em risco", value: brl(risk.mrrAtRisk), tone: "ruim" },
          ...(risk.topDriver ? [{ label: "Gatilho principal", value: risk.topDriver.key, tone: "neutro" as const }] : []),
        ],
      });
      cards.push({
        id: "risk-table",
        kind: "table",
        title: "Maiores riscos (90 dias)",
        columns: ["Assinante", "Plano", "Engaj.", "Risco", "Gatilho"],
        rows: risk.top.slice(0, 6).map((r) => [r.name, r.plan, String(r.engagement), `${r.risk.toFixed(0)}%`, r.driver]),
      });
      return out(
        "Assinantes em risco",
        `${risk.critical.toLocaleString("pt-BR")} assinantes (${pct(risk.criticalShare)} da base) têm risco ≥ 35% de cancelar em 90 dias, somando ${brl(risk.mrrAtRisk)} de MRR${risk.topDriver ? `. Gatilho principal: ${risk.topDriver.key}` : ""}${risk.topEditoria ? `; editoria mais exposta: ${risk.topEditoria.key}` : ""}.`,
        ["Mapa de assinantes em risco"],
      );
    }

    case "meta": {
      const proj = projectActive(series.slice(0, m + 1), ds.meta.goalActive, ds.meta.goalMonth);
      cards.push({
        id: "goal-line",
        kind: "line",
        title: "Assinantes ativos: histórico e projeção",
        x: [...series.slice(Math.max(0, m - 11), m + 1).map((p) => p.label), ...proj.points.map((p) => p.label)],
        series: [
          { name: "Histórico", values: [...series.slice(Math.max(0, m - 11), m + 1).map((p) => p.active), ...proj.points.map(() => null)] },
          { name: "Projeção", values: [...series.slice(Math.max(0, m - 11), m).map(() => null), cur.active, ...proj.points.map((p) => p.value)] },
        ],
        format: "num",
        reference: { label: `Meta ${ds.meta.goalActive.toLocaleString("pt-BR")}`, value: ds.meta.goalActive },
      });
      cards.push({
        id: "goal-stats",
        kind: "stats",
        title: "Caminho até a meta",
        items: [
          { label: `Projeção em ${monthLabel(proj.goalMonth)}`, value: proj.projectedAtGoal.toLocaleString("pt-BR"), tone: proj.onTrack ? "bom" : "ruim" },
          { label: "Falta para a meta", value: proj.gap.toLocaleString("pt-BR"), tone: proj.onTrack ? "bom" : "ruim" },
          { label: "Saldo necessário/mês", value: `${proj.requiredNetAdds >= 0 ? "+" : ""}${proj.requiredNetAdds}`, tone: "neutro" },
          { label: "Saldo atual/mês", value: `${proj.currentNetAdds >= 0 ? "+" : ""}${proj.currentNetAdds}`, tone: "neutro" },
        ],
      });
      const i = insights.find((x) => x.topic === "meta");
      return out("Meta de assinantes", i?.text ?? "", ["Evolução de assinantes", "Projeção vs. meta"]);
    }

    case "planos": {
      const comp = composition(ds, m, "plan");
      cards.push({ id: "plan-donut", kind: "donut", title: "Composição por plano", subtitle: cur.label, rows: comp.map((c) => ({ label: c.key, value: c.count })) });
      cards.push({
        id: "money-stats",
        kind: "stats",
        title: "Receita",
        items: [
          { label: "MRR", value: brl(cur.mrr), tone: "neutro" },
          { label: "Ticket médio", value: `R$ ${cur.arpu.toFixed(2).replace(".", ",")}`, tone: "neutro" },
          { label: "Upgrades no mês", value: String(cur.upgrades), tone: "bom" },
        ],
      });
      const focus = ent.plan ? comp.find((c) => c.key === ent.plan) : comp[0];
      return out("Planos e receita", `${focus ? `${focus.key} responde por ${pct(focus.share)} da base (${focus.count.toLocaleString("pt-BR")} assinantes). ` : ""}MRR de ${cur.label}: ${brl(cur.mrr)}, ticket médio R$ ${cur.arpu.toFixed(2).replace(".", ",")}.`, ["Composição por plano", "KPIs"]);
    }

    case "editorias": {
      const h = editoriaHealth(ds, m);
      cards.push({ id: "editoria-bars", kind: "bars", title: "Saúde por editoria (0–100)", rows: h.map((x) => ({ label: x.editoria, value: x.score, note: `${pct(x.share, 0)} da base` })), format: "num" });
      const f = ent.editoria ? h.find((x) => x.editoria === ent.editoria) : h[0];
      const worst = h[h.length - 1];
      cards.push({ id: "editoria-eng", kind: "bars", title: "Engajamento médio", rows: [...h].sort((a, b) => b.avgEngagement - a.avgEngagement).map((x) => ({ label: x.editoria, value: x.avgEngagement })), format: "num" });
      return out(
        "Editorias",
        `${f ? `${f.editoria}: nota ${f.score}, engajamento ${f.avgEngagement}, churn de ${pct(f.churn3m)} nos últimos 3 meses. ` : ""}A editoria mais frágil é ${worst.editoria} (nota ${worst.score}).`,
        ["Saúde por editoria"],
      );
    }

    case "nps": {
      const now = npsWindow(ds, m);
      cards.push({ id: "nps-line", kind: "line", title: "NPS (janela de 3 meses)", x: slice.map((p) => p.label), series: [{ name: "NPS", values: slice.map((p) => p.nps) }], format: "num" });
      cards.push({
        id: "nps-stats",
        kind: "stats",
        title: "Respostas",
        items: [
          { label: "NPS", value: `${now.score >= 0 ? "+" : ""}${now.score}`, tone: now.score >= 30 ? "bom" : "neutro" },
          { label: "Respondentes", value: now.responses.toLocaleString("pt-BR"), tone: "neutro" },
          { label: "Promotores", value: now.promoters.toLocaleString("pt-BR"), tone: "bom" },
          { label: "Detratores", value: now.detractors.toLocaleString("pt-BR"), tone: "ruim" },
        ],
      });
      return out("NPS", `O NPS está em ${now.score >= 0 ? "+" : ""}${now.score} (${now.responses.toLocaleString("pt-BR")} respostas na janela). ${byTopic(insights, "nps")[0]?.text ?? ""}`.trim(), ["NPS"]);
    }

    case "preco": {
      const hike = ds.meta.events.find((e) => e.kind === "preço");
      const promo = cohortRetention(ds, "promo", { minSize: 200 });
      if (promo.length)
        cards.push({
          id: "promo-lines",
          kind: "line",
          title: "Retenção com e sem promoção",
          x: Array.from({ length: 7 }, (_, k) => `M${k}`),
          series: promo.map((c) => ({ name: c.key, values: c.retention.slice(0, 7).map((v) => (v === null ? null : v / 100)) })),
          format: "pct",
        });
      if (hike) {
        const isRec = (p: string) => p === "Mensal" || p === "Combo Streaming";
        const seg = (a: number, b: number) => churnBySegment(ds, a, b, (s) => (isRec(s.plan) ? "recorrente" : "outros")).find((c) => c.key === "recorrente")?.rate ?? 0;
        cards.push({
          id: "hike-bars",
          kind: "bars",
          title: "Churn de Mensal/Combo",
          rows: [
            { label: "6 meses antes", value: seg(hike.month - 6, hike.month - 1) },
            { label: "Reajuste (2 meses)", value: seg(hike.month, hike.month + 1) },
          ],
          format: "pct",
        });
      }
      const ts = byTopic(insights, "preço");
      return out("Preço e promoções", ts.length ? ts.map((i) => i.text).join(" ") : "Não há efeito relevante de preço no período.", ["Coortes por promoção", "Reajuste de preço"]);
    }

    case "resumo": {
      const top = insights.slice(0, 4);
      cards.push({ id: "resume-table", kind: "table", title: "Principais achados", columns: ["Severidade", "Achado"], rows: top.map((i) => [i.severity, i.title]) });
      cards.push({
        id: "resume-stats",
        kind: "stats",
        title: cur.label,
        items: [
          { label: "Ativos", value: cur.active.toLocaleString("pt-BR"), tone: "neutro" },
          { label: "Churn", value: pct(cur.churnRate), tone: cur.churnRate > ds.meta.churnTarget ? "ruim" : "bom" },
          { label: "MRR", value: brl(cur.mrr), tone: "neutro" },
          { label: "NPS", value: `${cur.nps >= 0 ? "+" : ""}${cur.nps}`, tone: "neutro" },
        ],
      });
      return out("Resumo", top.map((i) => `${i.title}: ${i.text}`).join(" "), ["Insights", "KPIs"]);
    }

    default: {
      cards.push({ id: "help", kind: "table", title: "Posso responder sobre", columns: ["Tema", "Exemplo"], rows: [["Churn", "Como está o churn?"], ["Motivos", "Por que os assinantes cancelam?"], ["Canais", "Qual canal retém pior?"], ["Safras", "Compare as safras de campanha"], ["Risco", "Quem está em risco?"], ["Meta", "Vamos bater a meta?"], ["Planos", "Qual a composição por plano?"], ["Editorias", "Como estão as editorias?"], ["NPS", "Como está o NPS?"], ["Preço", "Como foi o reajuste?"]] });
      return out("Não entendi a pergunta", "Ainda não sei responder isso com os dados deste painel. Tente um dos temas abaixo.", []);
    }
  }
}

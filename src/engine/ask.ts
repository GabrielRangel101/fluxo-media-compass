// Mesa de análise: roteia uma pergunta em português para uma análise do motor e devolve a resposta.
// Regra de ouro: NENHUM número nasce aqui. Cada resposta é montada com valores calculados pelo motor
// (e aponta a consulta SQL que gera o número). Um LLM pode, no futuro, só escolher a análise e redigir.

import { bestShift, channelEconomics, simulateShift } from "./allocation.ts";
import { brl, brl0, n2, pct, spct } from "./fmt.ts";
import { buildInsights } from "./insights.ts";
import { channelSummary, deltas, funnel, periods } from "./metrics.ts";
import { readTests } from "./experiments.ts";
import { trackingSummary } from "./tracking.ts";
import { CHANNELS, CHANNEL_LABEL } from "./types.ts";
import type { Channel, Dataset } from "./types.ts";

export type Intent = "resumo" | "cpi" | "cac" | "roas" | "funil" | "tracking" | "testes" | "verba" | "canais";

export interface Answer {
  intent: Intent;
  title: string;
  paragraphs: string[];
  table?: { head: string[]; rows: string[][] };
  /** arquivos de /sql que geram os números desta resposta */
  sql: string[];
  followUps: string[];
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const ALIASES: Record<Channel, string[]> = {
  google_ads: ["google", "uac", "search", "pesquisa"],
  meta_ads: ["meta", "facebook", "instagram"],
  tiktok_ads: ["tiktok", "tik tok"],
  linkedin_ads: ["linkedin"],
  dv360: ["dv360", "dv 360", "youtube", "display", "programatica"],
};

export function mentionedChannels(q: string): Channel[] {
  const n = norm(q);
  return CHANNELS.map((c) => ({ c, i: Math.min(...ALIASES[c].map((a) => (n.indexOf(a) === -1 ? 1e9 : n.indexOf(a)))) }))
    .filter((x) => x.i < 1e9)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.c);
}

export function route(question: string): Intent {
  const n = norm(question);
  const has = (...k: string[]) => k.some((x) => n.includes(x));
  if (has("verba", "alocac", "realoc", "orcamento", "investir mais", "simul", "transfer", "tirar") || /\bmov(er|a|e|endo)\b/.test(n))
    return "verba";
  if (has("tracking", "coleta", "divergen", "evento", "gtm", "appsflyer", "ga4", "utm", "atribuic", "inconsist", "quebrad", "tagbook")) return "tracking";
  if (has("teste", "a/b", "criativo", "publico", "srm", "variante")) return "testes";
  if (has("roas", "ltv", "retorno", "paga o proprio", "compensa")) return "roas";
  if (has("cac", "custo de aquisicao")) return "cac";
  if (has("cpi", "custo por instal")) return "cpi";
  if (has("funil", "conversao", "etapa", "kyc", "cadastro", "ativacao")) return "funil";
  if (has("melhor", "pior", "canal", "canais", "comparar", "ranking")) return "canais";
  return "resumo";
}

function parsePct(q: string): number | null {
  const m = q.match(/(\d{1,2})\s*%/);
  return m ? Number(m[1]) / 100 : null;
}

export function answer(ds: Dataset, question: string): Answer {
  const intent = route(question);
  const per = periods(ds);
  const eco = channelEconomics(ds);
  const last = channelSummary(ds, per.last28);
  const mature = channelSummary(ds, per.mature90);
  const chans = mentionedChannels(question);
  const label = (c: Channel) => CHANNEL_LABEL[c];
  const row = (c: Channel) => last.find((r) => r.channel === c)!;
  const mrow = (c: Channel) => mature.find((r) => r.channel === c)!;

  switch (intent) {
    case "cpi": {
      const d = deltas(ds, per.last28, per.prev28);
      const list = chans.length ? chans : CHANNELS;
      return {
        intent, title: "CPI por canal · últimos 28 dias",
        paragraphs: [
          `O CPI considera instalações atribuídas pelo AppsFlyer (a plataforma costuma reportar mais: ver Saúde da coleta). Comparado aos 28 dias anteriores:`,
        ],
        table: {
          head: ["Canal", "CPI", "Variação", "CPI marginal"],
          rows: list.map((c) => {
            const ch = d.find((x) => x.channel === c && x.metric === "cpi")?.change ?? null;
            const e = eco.find((x) => x.channel === c)!;
            return [label(c), brl(row(c).cpi ?? 0), ch === null ? "—" : spct(ch), brl(e.marginalCpi ?? 0)];
          }),
        },
        sql: ["01_channel_summary.sql"],
        followUps: ["O CPI do Meta subiu por quê?", "Qual canal paga o próprio custo em 90 dias?"],
      };
    }
    case "cac":
    case "roas": {
      const list = chans.length ? chans : CHANNELS;
      return {
        intent, title: intent === "cac" ? "CAC e retorno por canal" : "ROAS e LTV por canal · coortes maduras",
        paragraphs: [
          "CAC = gasto ÷ usuários que usaram o cartão em até 14 dias. ROAS e LTV usam só coortes com a janela completa (D30 e D90), por isso olham instalações mais antigas que o CPI.",
        ],
        table: {
          head: ["Canal", "CAC", "ROAS D30", "ROAS D90", "LTV90/usuário"],
          rows: list.map((c) => {
            const m = mrow(c);
            return [label(c), brl(m.cac ?? 0), n2(m.roas30 ?? 0) + "×", n2(m.roas90 ?? 0) + "×", brl(m.ltv90 ?? 0)];
          }),
        },
        sql: ["01_channel_summary.sql"],
        followUps: ["Se eu mover 20% da verba, o que muda?", "Por que o TikTok tem CAC alto?"],
      };
    }
    case "funil": {
      const c = chans[0];
      const f = funnel(ds, per.full, c);
      return {
        intent, title: `Funil · ${c ? label(c) : "mídia paga"}`,
        paragraphs: [`Coortes com 14+ dias (${f.range.from} a ${f.range.to}). Custo por etapa = gasto total ÷ contagem da etapa.`],
        table: {
          head: ["Etapa", "Volume", "Conversão", "Custo por unidade"],
          rows: f.steps.map((s) => [s.label, Math.round(s.count).toLocaleString("pt-BR"), s.rate === null ? "—" : pct(s.rate, 1), brl(s.costPer ?? 0)]),
        },
        sql: ["02_funnel.sql"],
        followUps: ["Compare o funil do Google com o do TikTok", "Por que o KYC no Android parece baixo?"],
      };
    }
    case "tracking": {
      const t = trackingSummary(ds);
      const issues = buildInsights(ds).filter((i) => i.topic === "tracking");
      return {
        intent, title: "Saúde da coleta",
        paragraphs: [
          `${t.broken} checagens quebradas e ${t.warn} em atenção, de ${t.checks}. Cada razão entre fontes é comparada ao seu próprio nível normal, não a um valor absoluto.`,
          ...issues.map((i) => `${i.title}. ${i.detail}`),
        ],
        sql: ["04_reconciliation.sql", "05_event_health.sql"],
        followUps: ["Qual o impacto no CPI do Meta?", "Quais eventos do tagbook estão com problema?"],
      };
    }
    case "testes": {
      const tests = readTests(ds);
      return {
        intent, title: "Leitura dos testes A/B",
        paragraphs: ["Ordem de checagem: SRM, amostra mínima (100 instalações por variante) e só então significância."],
        table: {
          head: ["Teste", "Canal", "Lift (inst./impr.)", "p", "Veredito"],
          rows: tests.map((t) => [
            `${t.testId} · ${t.name}`, t.channelLabel, spct(t.primary.lift ?? 0), t.primary.p.toFixed(3).replace(".", ","),
            { winner_a: "Vence A", winner_b: "Vence B", no_difference: "Sem diferença", underpowered: "Amostra pequena", srm: "SRM: inválido" }[t.verdict],
          ]),
        },
        sql: ["06_ab_tests.sql"],
        followUps: ["Por que o T5 foi invalidado?", "Qual teste devo estender?"],
      };
    }
    case "verba": {
      const p = parsePct(question) ?? 0.2;
      if (chans.length >= 2) {
        const [from, to] = chans as [Channel, Channel];
        const s = simulateShift(ds, from, to, p);
        return {
          intent, title: `Mover ${pct(s.pct, 0)} de ${label(from)} para ${label(to)}`,
          paragraphs: [
            `Mesmo orçamento total, base dos últimos 28 dias (${brl0(s.movedAmount)} realocados). Projeção: ${s.installsDelta >= 0 ? "+" : "−"}${Math.abs(Math.round(s.installsDelta))} instalações, ${s.activatedDelta >= 0 ? "+" : "−"}${Math.abs(Math.round(s.activatedDelta))} ativações e ${s.valueDelta >= 0 ? "+" : "−"}${brl0(Math.abs(s.valueDelta))} em LTV90 esperado.`,
            ...s.warnings,
          ],
          sql: ["08_curve_inputs.sql"],
          followUps: ["E se for 30%?", "Qual a melhor realocação possível?"],
        };
      }
      const b = bestShift(ds, p);
      return {
        intent, title: `Melhor realocação de ${pct(p, 0)}`,
        paragraphs: b
          ? [`Entre todas as combinações, a de maior valor esperado é ${label(b.from)} → ${label(b.to)}: ${b.installsDelta >= 0 ? "+" : "−"}${Math.abs(Math.round(b.installsDelta))} instalações, ${b.activatedDelta >= 0 ? "+" : "−"}${Math.abs(Math.round(b.activatedDelta))} ativações e ${brl0(b.valueDelta)} em LTV90 esperado. É uma projeção por curva de resposta: use como hipótese de teste.`, ...b.warnings]
          : ["Nenhuma realocação simples aumenta o valor esperado com a curva atual."],
        sql: ["08_curve_inputs.sql"],
        followUps: ["Mova 30% do DV360 para o Google", "Qual o CPI marginal de cada canal?"],
      };
    }
    case "canais": {
      return {
        intent, title: "Canais lado a lado",
        paragraphs: ["Volume e qualidade apontam para lados diferentes: CPI baixo não significa retorno alto."],
        table: {
          head: ["Canal", "Gasto 28d", "CPI", "Ativação", "CAC", "ROAS D90"],
          rows: CHANNELS.map((c) => [label(c), brl0(row(c).spend), brl(row(c).cpi ?? 0), pct(mrow(c).activationRate ?? 0, 0), brl(mrow(c).cac ?? 0), n2(mrow(c).roas90 ?? 0) + "×"]),
        },
        sql: ["01_channel_summary.sql"],
        followUps: ["Se eu mover 20% da verba, o que muda?", "Qual canal paga o próprio custo em 90 dias?"],
      };
    }
    default: {
      const top = buildInsights(ds).slice(0, 4);
      const tot = last[last.length - 1]!;
      return {
        intent: "resumo", title: "Resumo executivo",
        paragraphs: [
          `Últimos 28 dias: ${brl0(tot.spend)} investidos, ${tot.installs.toLocaleString("pt-BR")} instalações atribuídas (CPI ${brl(tot.cpi ?? 0)}) e ${tot.signups.toLocaleString("pt-BR")} cadastros (CPA ${brl(tot.cpaSignup ?? 0)}).`,
          ...top.map((i) => `${i.title}. ${i.detail}`),
        ],
        sql: ["01_channel_summary.sql"],
        followUps: ["Como está a coleta de dados?", "Qual canal paga o próprio custo em 90 dias?"],
      };
    }
  }
}

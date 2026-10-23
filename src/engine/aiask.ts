// Mesa de análise: entende uma pergunta em português sobre os dados do painel (intenção + entidades) e devolve
// texto + cards de dados. REGRA: nenhum número nasce aqui sem vir do motor (metrics, allocation, tracking,
// experiments). Este arquivo só roteia, agrega o que o motor já calcula e redige. Perguntas fora do escopo dos
// dados recebem uma resposta de escopo, nunca um palpite.

import { fitCurves, simulateShift, bestShift, channelEconomics, MAX_SHIFT } from "./allocation.ts";
import { addDays } from "./calendar.ts";
import { readTests } from "./experiments.ts";
import { brl, brl0, dm, n0, n2, pct, spct } from "./fmt.ts";
import { buildInsights } from "./insights.ts";
import { channelSummary, dailySeries, funnel, periods, platformSplit, totals } from "./metrics.ts";
import type { ChannelMetrics } from "./metrics.ts";
import { RECON_LABEL, trackingSummary } from "./tracking.ts";
import { CHANNELS, CHANNEL_LABEL } from "./types.ts";
import type { Channel, Dataset, DateRange } from "./types.ts";

export type AskFormat = "pct" | "num" | "brl" | "x";

export type AiCard =
  | { id: string; kind: "line"; title: string; x: string[]; series: { name: string; values: (number | null)[] }[]; format: AskFormat; reference?: { label: string; value: number } }
  | { id: string; kind: "bars"; title: string; rows: { label: string; value: number; note?: string }[]; format: AskFormat }
  | { id: string; kind: "stats"; title: string; items: { label: string; value: string; tone?: "bom" | "ruim" | "neutro" }[] }
  | { id: string; kind: "table"; title: string; columns: string[]; rows: string[][] };

export type AiIntent =
  | "resumo" | "explicar" | "porque" | "metrica" | "canais" | "funil" | "plataforma" | "tracking" | "testes" | "verba" | "curva" | "fora_de_escopo";

export interface AiAnswer {
  intent: AiIntent;
  title: string;
  text: string;
  /** seções do painel usadas ("Com base em: …") */
  basedOn: string[];
  cards: AiCard[];
  followUps: string[];
  /** arquivos de /sql que geram os números */
  sql: string[];
}

export const AI_SUGGESTIONS = [
  "Resumo dos principais alertas",
  "Qual canal paga o próprio custo em 90 dias?",
  "Por que o CPI do Meta subiu?",
  "Quais checagens de coleta estão quebradas?",
];

export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

const ALIASES: Record<Channel, RegExp> = {
  google_ads: /\b(google|uac|search|pesquisa)\b/,
  meta_ads: /\b(meta|facebook|instagram|fb)\b/,
  tiktok_ads: /\b(tik ?tok)\b/,
  linkedin_ads: /\b(linkedin)\b/,
  dv360: /\b(dv ?360|youtube|display|programatica)\b/,
};

export function channelsIn(q: string): Channel[] {
  const n = norm(q);
  return CHANNELS.map((c) => ({ c, i: n.search(ALIASES[c]) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i).map((x) => x.c);
}

const MONTHS: [RegExp, number][] = [
  [/\bjan(eiro)?\b/, 1], [/\bfev(ereiro)?\b/, 2], [/\bmar(co)?\b/, 3], [/\babr(il)?\b/, 4], [/\bmai(o)?\b/, 5], [/\bjun(ho)?\b/, 6],
  [/\bjul(ho)?\b/, 7], [/\bago(sto)?\b/, 8], [/\bset(embro)?\b/, 9], [/\bout(ubro)?\b/, 10], [/\bnov(embro)?\b/, 11], [/\bdez(embro)?\b/, 12],
];

interface Period { range: DateRange; label: string; empty?: boolean }

/** Período citado na pergunta (mês, últimos N dias, semana, ontem). Padrão: últimos 28 dias. */
function parsePeriod(ds: Dataset, q: string): Period {
  const n = norm(q);
  const ref = ds.meta.refDate;
  const start = ds.meta.startDate;
  const clip = (from: string, to: string, label: string): Period => {
    const f = from < start ? start : from;
    const t = to > ref ? ref : to;
    return f > t ? { range: { from: start, to: ref }, label, empty: true } : { range: { from: f, to: t }, label };
  };
  for (const [re, m] of MONTHS) {
    if (re.test(n)) {
      const y = Number(start.slice(0, 4));
      const from = `${y}-${String(m).padStart(2, "0")}-01`;
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return clip(from, `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`, `em ${n.match(re)![0]}`);
    }
  }
  const nd = n.match(/ultimos? (\d{1,3}) dias/);
  if (nd) return clip(addDays(ref, -(Number(nd[1]) - 1)), ref, `nos últimos ${nd[1]} dias`);
  if (/\b(semana|7 dias)\b/.test(n)) return clip(addDays(ref, -6), ref, "nos últimos 7 dias");
  if (/\bontem\b/.test(n)) return clip(ref, ref, `em ${dm(ref)}`);
  if (/\b(tudo|todo o periodo|desde o inicio|periodo inteiro)\b/.test(n)) return clip(start, ref, "no período todo");
  const p = periods(ds);
  return { range: p.last28, label: "nos últimos 28 dias" };
}

const rowFor = (rows: ChannelMetrics[], c: Channel | "paid_total") => rows.find((r) => r.channel === c)!;
const labelOf = (c: Channel | "paid_total") => (c === "paid_total" ? "mídia paga (total)" : CHANNEL_LABEL[c]);
const x2 = (v: number | null) => (v === null ? "—" : `${n2(v)}×`);

function weekly(ds: Dataset, range: DateRange, channel?: Channel) {
  const days = dailySeries(ds, range, channel);
  const x: string[] = [];
  const spend: number[] = [], installs: number[] = [], cpi: (number | null)[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const b = days.slice(i, i + 7);
    const s = b.reduce((a, d) => a + d.spend, 0), n = b.reduce((a, d) => a + d.installs, 0);
    x.push(dm(b[0]!.date)); spend.push(s); installs.push(n); cpi.push(n ? s / n : null);
  }
  return { x, spend, installs, cpi };
}

// ------------------------------------------------------------------ "por que mudou": decomposição do CPI
// CPI = (CPM ÷ 1000) ÷ (CTR × instalações por clique). Em log, a variação do CPI é a soma das variações dos três fatores.
interface Driver { label: string; change: number; contrib: number }

function cpiDrivers(a: ChannelMetrics, b: ChannelMetrics): { total: number; drivers: Driver[] } | null {
  if (!a.cpm || !a.ctr || !a.installsPerClick || !b.cpm || !b.ctr || !b.installsPerClick || !a.cpi || !b.cpi) return null;
  const lc = Math.log(b.cpi / a.cpi);
  const parts = [
    { label: "CPM (preço do leilão)", change: b.cpm / a.cpm - 1, log: Math.log(b.cpm / a.cpm) },
    { label: "CTR (cliques por impressão)", change: b.ctr / a.ctr - 1, log: -Math.log(b.ctr / a.ctr) },
    { label: "Instalações por clique", change: b.installsPerClick / a.installsPerClick - 1, log: -Math.log(b.installsPerClick / a.installsPerClick) },
  ];
  return { total: b.cpi / a.cpi - 1, drivers: parts.map((p) => ({ label: p.label, change: p.change, contrib: Math.abs(lc) < 1e-9 ? 0 : p.log / lc })) };
}

// ------------------------------------------------------------------ glossário ("como é calculado")
type Topic = "cpi" | "cpa" | "cac" | "roas" | "ltv" | "ativacao" | "funil" | "mmp" | "tracking" | "tagbook" | "teste" | "srm" | "curva" | "quadrante" | "coorte" | "simulador" | "reconciliacao" | "cpm" | "ctr";

const TOPICS: [Topic, RegExp][] = [
  ["srm", /\bsrm\b|sample ratio/],
  ["teste", /\b(teste a\/?b|teste ab|significancia|p-?valor|z-?test|lift)\b/],
  ["reconciliacao", /reconcilia|razao entre fontes|plataforma ?(÷|\/|sobre|vs|x) ?(mmp|appsflyer)/],
  ["quadrante", /quadrante|bolha|custo [x×] retorno|custo versus retorno/],
  ["curva", /curva de resposta|elasticidade|beta|cpi marginal|retorno decrescente|saturacao/],
  ["simulador", /simulador|realocacao|realocar/],
  ["tagbook", /tagbook|plano de coleta|governanca de eventos/],
  ["mmp", /\b(mmp|appsflyer|adjust|atribuicao)\b/],
  ["coorte", /coorte|madura|maturidade|imatur/],
  ["tracking", /tracking|saude da coleta|health|ga4|gtm/],
  ["cpm", /\bcpm\b/],
  ["ctr", /\bctr\b/],
  ["cac", /\bcac\b|custo de aquisicao/],
  ["cpa", /\bcpa\b/],
  ["roas", /\broas\b/],
  ["ltv", /\bltv\b|lifetime/],
  ["ativacao", /ativacao|ativado|uso do cartao/],
  ["funil", /\bfunil\b/],
  ["cpi", /\bcpi\b|custo por instal/],
];

const EXPLAIN_TRIGGER = /\b(calculad\w*|como (e|foi|sao|eh) (feit\w*|calculad\w*|medid\w*|apurad\w*)|como (se )?calcula\w*|calculo|formula|o que (e|eh|significa|quer dizer|sao|mede)|nao entend\w*|explic\w*|como (ler|interpretar|leio)|funciona\w*|de onde vem|para que serve|pra que serve|o que ve)\b/;

function explain(ds: Dataset, topic: Topic): AiAnswer {
  const p = periods(ds);
  const t = totals(ds, p.last28);
  const m = totals(ds, p.mature90);
  const base = (title: string, text: string, basedOn: string[], sql: string[], follow: string[], cards: AiCard[] = []): AiAnswer =>
    ({ intent: "explicar", title, text, basedOn, sql, cards, followUps: follow });
  switch (topic) {
    case "cpi":
      return base("Como o CPI é calculado", `CPI = gasto ÷ instalações atribuídas pelo AppsFlyer (MMP), não as que a plataforma de mídia reporta. Nos últimos 28 dias: ${brl0(t.spend)} ÷ ${n0(t.installs)} instalações = ${brl(t.cpi ?? 0)}. A plataforma costuma declarar mais instalações (view-through, modelagem), por isso o CPI "da plataforma" é menor e menos confiável. Leia sempre junto com a Saúde da coleta.`, ["Visão geral", "Canais"], ["01_channel_summary.sql"], ["Por que o CPI mudou?", "O que é CPI marginal?"]);
    case "cpa":
      return base("Como o CPA de cadastro é calculado", `CPA = gasto ÷ cadastros concluídos (cadastros do backend, atribuídos ao canal pelo MMP). Últimos 28 dias: ${brl0(t.spend)} ÷ ${n0(t.signups)} = ${brl(t.cpaSignup ?? 0)}. Se a plataforma de mídia declara muito mais cadastros que o backend, o evento pode estar duplicado: veja a reconciliação.`, ["Visão geral", "Saúde da coleta"], ["01_channel_summary.sql"], ["Quais checagens de coleta estão quebradas?"]);
    case "cac":
      return base("Como o CAC é calculado", `CAC = gasto ÷ usuários que usaram o cartão em até 14 dias. Só entram coortes com 14 dias completos, então olha instalações mais antigas que o CPI. Na janela madura (${dm(p.mature90.from)}–${dm(p.mature90.to)}): ${brl(m.cac ?? 0)} por usuário ativado, contra um CPI de ${brl(m.cpi ?? 0)}. A distância entre os dois é a taxa de ativação (${m.activationRate === null ? "—" : pct(m.activationRate, 0)}).`, ["Canais", "Unit economics"], ["01_channel_summary.sql"], ["Qual o CAC por canal?"]);
    case "roas":
    case "ltv":
      return base(topic === "roas" ? "Como o ROAS é calculado" : "Como o LTV é calculado", `ROAS D90 = receita acumulada em 90 dias ÷ gasto da mesma coorte. LTV90 = receita D90 ÷ usuários ativados, então LTV90 ÷ CAC é o mesmo número do ROAS D90. Só existe para instalações com 90 dias completos (${dm(p.mature90.from)}–${dm(p.mature90.to)}); no total pago deu ${x2(m.roas90)} e ${m.ltv90 === null ? "—" : brl(m.ltv90)} de LTV90. Acima de 1,00× a coorte pagou o próprio custo.`, ["Canais"], ["01_channel_summary.sql"], ["Qual canal paga o próprio custo em 90 dias?"]);
    case "ativacao":
      return base("O que é ativação", `Ativação = usuário que usou o cartão em até 14 dias após a instalação. É o evento de valor deste produto: uma conta aberta sem uso gera custo e nenhuma receita. No total pago, ${m.activationRate === null ? "—" : pct(m.activationRate, 0)} das instalações maduras ativaram.`, ["Funil"], ["02_funnel.sql"], ["Onde perco mais no funil?"]);
    case "funil":
      return base("Como ler o funil", "Impressões → cliques → instalações → cadastros → KYC → uso do cartão. Cada etapa mostra a conversão em relação à anterior e o custo por unidade (gasto do período ÷ contagem da etapa). O funil usa coortes com 14+ dias para o fundo ser comparável entre canais.", ["Funil"], ["02_funnel.sql"], ["Onde perco mais no funil?"]);
    case "mmp":
      return base("O que é o MMP (AppsFlyer)", "O MMP é a fonte neutra de atribuição: cruza o clique do anúncio com a instalação do app. É ele, e não a plataforma de mídia, que define a instalação usada em CPI, CPA e CAC. Quando a razão plataforma ÷ MMP foge do nível normal do canal, a medição quebrou (ex.: SKAdNetwork no iOS).", ["Saúde da coleta"], ["04_reconciliation.sql"], ["Quais checagens de coleta estão quebradas?"]);
    case "reconciliacao":
      return base("Como a reconciliação funciona", `Cada razão entre duas fontes (plataforma ÷ MMP, backend ÷ MMP) tem um nível normal por canal, medido nos primeiros 60 dias. Compara-se a razão dos últimos 14 dias com esse nível: desvio de 15% ou mais é atenção, 35% ou mais é quebrado, e menos de 40 eventos vira "pouco volume". Hoje há ${trackingSummary(ds).broken} checagens quebradas.`, ["Saúde da coleta"], ["04_reconciliation.sql"], ["Quais checagens de coleta estão quebradas?"]);
    case "tracking":
      return base("Saúde da coleta", "É o painel que diz se dá para confiar nos números. Compara as fontes entre si (plataforma, AppsFlyer, backend) e cada evento do SDK com uma referência independente. Nenhuma fonte é a verdade: o alerta é a razão sair do próprio nível normal.", ["Saúde da coleta"], ["04_reconciliation.sql", "05_event_health.sql"], ["Quais checagens de coleta estão quebradas?"]);
    case "tagbook":
      return base("O que é o tagbook", `É o plano de coleta: para cada evento (${ds.tagbook.length} no total) define dono, gatilho, parâmetros, destinos e a referência de qualidade usada para checar se a contagem está certa. O status de cada linha vem da checagem automática, não de preenchimento manual.`, ["Tagbook"], ["05_event_health.sql"], ["Quais eventos do tagbook têm problema?"]);
    case "teste":
    case "srm":
      return base("Como os testes A/B são lidos", "Ordem de checagem: 1) SRM (a divisão de impressões deveria ser 50/50; p < 0,001 invalida o teste), 2) amostra mínima de 100 instalações por variante, 3) só então significância (teste z de duas proporções, p < 0,05). A métrica principal é instalações por impressão. Um teste sem amostra não perde nem ganha: fica \"amostra pequena\".", ["Testes A/B"], ["06_ab_tests.sql"], ["Quais testes A/B posso ler?", "Por que o T5 foi invalidado?"]);
    case "curva":
      return base("Curva de resposta e CPI marginal", "Instalações = A × gasto^β, ajustada por regressão log-log no histórico sem falhas de coleta. β < 1 significa retorno decrescente: cada real a mais compra menos instalações que o anterior. CPI marginal = CPI médio ÷ β é o custo do próximo real investido. Canal com poucas instalações por dia (LinkedIn) é estimado em blocos semanais e tem baixa confiança.", ["Canais"], ["08_curve_inputs.sql"], ["Qual o CPI marginal de cada canal?"]);
    case "simulador":
      return base("Como o simulador de verba funciona", `Move uma parte do gasto de um canal para outro, mantendo o orçamento total, e projeta instalações, ativações e LTV90 pela curva de resposta de cada canal. Limite de ${n0(MAX_SHIFT * 100)}% por movimento, com aviso quando algum canal sai da faixa de 60% a 160% do gasto atual, onde a curva extrapola. É uma hipótese para testar, não uma previsão.`, ["Canais"], ["08_curve_inputs.sql"], ["Qual a melhor realocação de 20% da verba?"]);
    case "quadrante":
      return base("Como ler o quadrante custo × retorno", "Cada bolha é um canal: CPI no eixo horizontal, ROAS D90 no vertical, tamanho pelo investimento. Abaixo da linha de 1,00× a coorte não paga o próprio custo em 90 dias. Um canal barato (esquerda) pode estar embaixo da linha, e é por isso que CPI sozinho não decide verba.", ["Visão geral"], ["01_channel_summary.sql"], ["Compare os canais"]);
    case "coorte":
      return base("Coortes maduras", "Cada métrica espera o tempo que precisa: ativação e CAC usam instalações com 14+ dias, ROAS D30 usa 30+ dias e ROAS D90/LTV90 usam 90+ dias. Instalações mais novas entram no CPI e no CPA, mas ainda não têm receita ou ativação para medir, e ficam vazias em vez de parecerem zero.", ["Canais"], ["01_channel_summary.sql"], ["Como o ROAS é calculado?"]);
    case "cpm":
      return base("O que é CPM", `CPM = custo por mil impressões. É o preço do leilão: sobe quando há mais concorrência ou o público fica mais disputado. No total pago, últimos 28 dias: ${t.cpm === null ? "—" : brl(t.cpm)}.`, ["Visão geral"], ["01_channel_summary.sql"], ["Por que o CPI mudou?"]);
    case "ctr":
      return base("O que é CTR", `CTR = cliques ÷ impressões. Mede o quanto o criativo e o público chamam atenção. No total pago, últimos 28 dias: ${t.ctr === null ? "—" : pct(t.ctr, 2)}.`, ["Visão geral"], ["01_channel_summary.sql"], ["Por que o CPI mudou?"]);
  }
}

// ------------------------------------------------------------------ respostas por intenção
function summary(ds: Dataset): AiAnswer {
  const p = periods(ds);
  const tot = totals(ds, p.last28);
  const prev = totals(ds, p.prev28);
  const top = buildInsights(ds).slice(0, 4);
  const ch = (a: number | null, b: number | null) => (a !== null && b ? a / b - 1 : null);
  return {
    intent: "resumo", title: "Resumo executivo",
    text: `Nos últimos 28 dias: ${brl0(tot.spend)} investidos, ${n0(tot.installs)} instalações atribuídas (CPI ${brl(tot.cpi ?? 0)}) e ${n0(tot.signups)} cadastros (CPA ${brl(tot.cpaSignup ?? 0)}). ${top.map((i) => `${i.title}.`).join(" ")}`,
    basedOn: ["Visão geral", "Insights"], sql: ["01_channel_summary.sql"],
    cards: [
      { id: "kpis", kind: "stats", title: "Últimos 28 dias", items: [
        { label: "Investimento", value: brl0(tot.spend) },
        { label: "CPI", value: brl(tot.cpi ?? 0), tone: (ch(tot.cpi, prev.cpi) ?? 0) > 0.03 ? "ruim" : "neutro" },
        { label: "CPA cadastro", value: brl(tot.cpaSignup ?? 0) },
        { label: "Instalações", value: n0(tot.installs) },
      ] },
      { id: "alerts", kind: "table", title: "Alertas do motor de regras", columns: ["Gravidade", "Achado"], rows: top.map((i) => [i.severity, i.title]) },
    ],
    followUps: ["Por que o CPI mudou?", "Quais checagens de coleta estão quebradas?", "Compare os canais"],
  };
}

function why(ds: Dataset, q: string): AiAnswer {
  const p = periods(ds);
  const last = channelSummary(ds, p.last28);
  const prev = channelSummary(ds, p.prev28);
  const ch = channelsIn(q)[0];
  const key = ch ?? "paid_total";
  const a = rowFor(prev, key), b = rowFor(last, key);
  const dr = cpiDrivers(a, b);
  const rec = trackingSummary(ds).recon.filter((r) => (ch ? r.channel === ch : true) && r.check === "installs_platform_vs_mmp" && r.status === "broken");
  const guard = rec.length
    ? ` Atenção: a razão plataforma ÷ MMP de ${rec.map((r) => `${CHANNEL_LABEL[r.channel]}${r.platform === "all" ? "" : ` ${r.platform}`}`).join(", ")} está quebrada, então parte dessa variação pode ser medição e não comportamento do canal.`
    : "";
  if (!dr) return { intent: "porque", title: `CPI · ${labelOf(key)}`, text: `Não há volume suficiente em ${labelOf(key)} para decompor o CPI.`, basedOn: ["Canais"], sql: ["01_channel_summary.sql"], cards: [], followUps: AI_SUGGESTIONS.slice(0, 3) };
  const main = [...dr.drivers].sort((x, y) => Math.abs(y.contrib) - Math.abs(x.contrib))[0]!;
  const stable = Math.abs(dr.total) < 0.03;
  const text = stable
    ? `O CPI de ${labelOf(key)} ficou estável: ${brl(a.cpi ?? 0)} nos 28 dias anteriores e ${brl(b.cpi ?? 0)} agora (${spct(dr.total, 1)}).${guard}`
    : `O CPI de ${labelOf(key)} foi de ${brl(a.cpi ?? 0)} para ${brl(b.cpi ?? 0)} (${spct(dr.total, 1)}) contra os 28 dias anteriores. O fator que mais pesa é ${main.label}: ${spct(main.change, 1)}. CPI = (CPM ÷ 1000) ÷ (CTR × instalações por clique), então a variação se divide entre preço do leilão, atração do criativo e conversão do clique em instalação.${guard}`;
  return {
    intent: "porque", title: `Por que o CPI mudou · ${labelOf(key)}`, text, basedOn: ["Canais", "Saúde da coleta"], sql: ["01_channel_summary.sql"],
    cards: [
      { id: "drivers", kind: "bars", title: "Variação dos fatores do CPI", format: "pct", rows: dr.drivers.map((d) => ({ label: d.label, value: d.change, note: `${pct(Math.abs(d.contrib), 0)} da variação do CPI` })) },
      { id: "cpi-w", kind: "line", title: `CPI semanal · ${labelOf(key)}`, format: "brl", x: weekly(ds, p.full, ch).x, series: [{ name: "CPI", values: weekly(ds, p.full, ch).cpi }] },
    ],
    followUps: ch ? [`Como está a coleta do ${CHANNEL_LABEL[ch]}?`, "Compare os canais"] : ["Por que o CPI do Meta subiu?", "Compare os canais"],
  };
}

function metric(ds: Dataset, q: string): AiAnswer {
  const n = norm(q);
  const per = parsePeriod(ds, q);
  const chans = channelsIn(q);
  const rows = channelSummary(ds, per.range);
  const matRows = channelSummary(ds, periods(ds).mature90);
  const key = (/\bcac\b/.test(n) ? "cac" : /\broas\b|\bltv\b|paga\w* o proprio|compensa|retorno/.test(n) ? "roas" : /\bcpa\b|cadastr/.test(n) ? "cpa" : /\bcpi\b/.test(n) ? "cpi" : /instal/.test(n) ? "installs" : "spend") as "cac" | "roas" | "cpa" | "cpi" | "installs" | "spend";
  const pick = (r: ChannelMetrics, m: ChannelMetrics) => ({ cac: m.cac, roas: m.roas90, cpa: r.cpaSignup, cpi: r.cpi, installs: r.installs, spend: r.spend })[key];
  const fmtV = (v: number | null) => (v === null ? "—" : key === "installs" ? n0(v) : key === "roas" ? x2(v) : key === "spend" ? brl0(v) : brl(v));
  const name = { cac: "CAC", roas: "ROAS D90", cpa: "CPA de cadastro", cpi: "CPI", installs: "Instalações", spend: "Investimento" }[key];
  const fm: AskFormat = key === "installs" ? "num" : key === "roas" ? "x" : "brl";
  const notice = per.empty ? ` Não há dados para esse período: o painel cobre ${dm(ds.meta.startDate)} a ${dm(ds.meta.refDate)}/${ds.meta.refDate.slice(0, 4)}; mostrei o período todo.` : "";
  const immature = key === "cac" || key === "roas" ? " CAC e ROAS usam só coortes maduras (14 e 90 dias), independentemente do período pedido." : "";
  const list = chans.length ? chans : CHANNELS;
  const cards: AiCard[] = [
    { id: "bars", kind: "bars", title: `${name} por canal`, format: fm, rows: list.map((c) => ({ label: CHANNEL_LABEL[c], value: pick(rowFor(rows, c), rowFor(matRows, c)) ?? 0 })) },
  ];
  const w = weekly(ds, per.range, chans[0]);
  if (w.x.length >= 2 && (key === "spend" || key === "installs" || key === "cpi"))
    cards.push({ id: "weekly", kind: "line", title: `${name} por semana · ${chans[0] ? CHANNEL_LABEL[chans[0]] : "mídia paga"}`, format: fm, x: w.x, series: [{ name, values: key === "spend" ? w.spend : key === "installs" ? w.installs : w.cpi }] });
  const tot = rowFor(rows, "paid_total"), totM = rowFor(matRows, "paid_total");
  const one = chans.length === 1 ? chans[0]! : null;
  const subject = one ? CHANNEL_LABEL[one] : "Mídia paga (total)";
  let head = `${subject}, ${name}: ${fmtV(one ? pick(rowFor(rows, one), rowFor(matRows, one)) : pick(tot, totM))}`;
  if (key === "roas" && !one) {
    const ok = CHANNELS.filter((c) => (rowFor(matRows, c).roas90 ?? 0) >= 1), no = CHANNELS.filter((c) => (rowFor(matRows, c).roas90 ?? 0) < 1);
    head = `${ok.length ? `${ok.map((c) => CHANNEL_LABEL[c]).join(", ")} pag${ok.length > 1 ? "am" : "a"} o próprio custo em 90 dias (ROAS de 1,00× ou mais)` : "Nenhum canal paga o próprio custo em 90 dias"}${no.length ? `; ${no.map((c) => CHANNEL_LABEL[c]).join(" e ")} não` : ""}. No total pago, o ROAS D90 é ${x2(pick(tot, totM))}`;
  }
  const days = Math.round((Date.parse(`${per.range.to}T00:00:00Z`) - Date.parse(`${per.range.from}T00:00:00Z`)) / 86400000) + 1;
  const perDay = /por dia|diari|media/.test(n) && (key === "installs" || key === "spend") && !per.empty && days > 0;
  if (perDay) {
    const total = (one ? rowFor(rows, one) : tot)[key];
    head = `${subject}: média de ${key === "installs" ? `${n0(total / days)} instalações` : brl0(total / days)} por dia (${key === "installs" ? n0(total) : brl0(total)} em ${days} dias`;
    head += ")";
  }
  return {
    intent: "metrica", title: `${name} ${per.label}`, text: `${head}${key === "roas" || key === "cac" ? "" : ` ${per.label}`}.${immature}${notice}`,
    basedOn: ["Visão geral", "Canais"], sql: ["01_channel_summary.sql"], cards,
    followUps: [`Por que o ${name === "CAC" || name === "CPI" ? name : "CPI"} mudou?`, "Compare os canais"],
  };
}

function compareChannels(ds: Dataset): AiAnswer {
  const p = periods(ds);
  const last = channelSummary(ds, p.last28);
  const mat = channelSummary(ds, p.mature90);
  const eco = channelEconomics(ds);
  const best = [...CHANNELS].sort((a, b) => (rowFor(mat, b).roas90 ?? 0) - (rowFor(mat, a).roas90 ?? 0));
  const cheap = [...CHANNELS].sort((a, b) => (rowFor(last, a).cpi ?? 1e9) - (rowFor(last, b).cpi ?? 1e9));
  const under = CHANNELS.filter((c) => (rowFor(mat, c).roas90 ?? 0) < 1);
  return {
    intent: "canais", title: "Canais lado a lado",
    text: `${CHANNEL_LABEL[best[0]!]} tem o maior ROAS D90 (${x2(rowFor(mat, best[0]!).roas90)}) e ${CHANNEL_LABEL[cheap[0]!]} o menor CPI (${brl(rowFor(last, cheap[0]!).cpi ?? 0)}). ${under.length ? `${under.map((c) => CHANNEL_LABEL[c]).join(" e ")} não pag${under.length > 1 ? "am" : "a"} o próprio custo em 90 dias (ROAS abaixo de 1,00×).` : "Todos os canais pagam o próprio custo em 90 dias."} CPI baixo e retorno alto nem sempre andam juntos.`,
    basedOn: ["Visão geral", "Canais"], sql: ["01_channel_summary.sql"],
    cards: [
      { id: "roas", kind: "bars", title: "ROAS D90 por canal", format: "x", rows: CHANNELS.map((c) => ({ label: CHANNEL_LABEL[c], value: rowFor(mat, c).roas90 ?? 0 })) },
      { id: "tbl", kind: "table", title: "Unit economics", columns: ["Canal", "CPI", "CPI marg.", "CAC", "ROAS D90"], rows: eco.map((e) => [CHANNEL_LABEL[e.channel], brl(e.cpi ?? 0), brl(e.marginalCpi ?? 0), brl(e.cac ?? 0), x2(e.roas90)]) },
    ],
    followUps: ["Qual a melhor realocação de 20% da verba?", "Como ler o quadrante custo × retorno?"],
  };
}

function funnelAnswer(ds: Dataset, q: string): AiAnswer {
  const p = periods(ds);
  const n = norm(q);
  const chans = channelsIn(q);
  if (chans.length === 0 && /compar|canais|cada canal|entre/.test(n)) {
    const rows = CHANNELS.map((c) => ({ c, f: funnel(ds, p.full, c) }));
    return {
      intent: "funil", title: "Funil por canal", text: "Conversão entre etapas por canal, em coortes com 14+ dias. As diferenças de topo (clique, instalação) refletem criativo e público; as de fundo (KYC, uso do cartão) refletem a qualidade de quem chega.",
      basedOn: ["Funil"], sql: ["02_funnel.sql"],
      cards: [{ id: "tbl", kind: "table", title: "Conversão entre etapas", columns: ["Canal", "Inst.→Cad.", "Cad.→KYC", "KYC→Uso"], rows: rows.map(({ c, f }) => [CHANNEL_LABEL[c], ...["signups", "kyc", "activated"].map((k) => { const s = f.steps.find((x) => x.key === k); return s?.rate == null ? "—" : pct(s.rate, 0); })]) }],
      followUps: ["Onde perco mais no funil?", "iOS ou Android tem CPI menor?"],
    };
  }
  const c = chans[0];
  const f = funnel(ds, p.full, c);
  const steps = f.steps.filter((s) => s.rate !== null && s.key !== "impressions");
  const worst = [...steps].filter((s) => s.key === "signups" || s.key === "kyc" || s.key === "activated").sort((a, b) => (a.rate ?? 1) - (b.rate ?? 1))[0];
  return {
    intent: "funil", title: `Funil · ${c ? CHANNEL_LABEL[c] : "mídia paga"}`,
    text: `${worst ? `Dentro do app, a etapa com menor conversão é "${worst.label}" (${pct(worst.rate ?? 0, 0)} da etapa anterior). ` : ""}Coortes de ${dm(f.range.from)} a ${dm(f.range.to)} (cortadas em 14 dias para o fundo do funil ser comparável). Custo por unidade = gasto ÷ contagem da etapa.`,
    basedOn: ["Funil"], sql: ["02_funnel.sql"],
    cards: [
      { id: "steps", kind: "table", title: "Etapas", columns: ["Etapa", "Volume", "Conversão", "Custo/un."], rows: f.steps.map((s) => [s.label, n0(s.count), s.rate === null ? "—" : pct(s.rate, 1), s.costPer === null ? "—" : brl(s.costPer)]) },
    ],
    followUps: c ? ["Compare o funil entre os canais"] : ["Compare o funil entre os canais", "O que é ativação?"],
  };
}

function platform(ds: Dataset): AiAnswer {
  const p = periods(ds);
  const rows = platformSplit(ds, p.last28);
  const gap = CHANNELS.map((c) => ({ c, a: rows.find((r) => r.channel === c && r.platform === "android")?.cpi ?? null, i: rows.find((r) => r.channel === c && r.platform === "ios")?.cpi ?? null }));
  const ios = rows.filter((r) => r.platform === "ios"), and = rows.filter((r) => r.platform === "android");
  const cpiOf = (rs: typeof rows) => { const s = rs.reduce((a, r) => a + r.spend, 0), i = rs.reduce((a, r) => a + r.installs, 0); return i ? s / i : null; };
  return {
    intent: "plataforma", title: "iOS × Android",
    text: `No total pago, o CPI de iOS é ${brl(cpiOf(ios) ?? 0)} e o de Android ${brl(cpiOf(and) ?? 0)} nos últimos 28 dias. iOS costuma ser mais caro e mais sujeito a perda de atribuição (SKAdNetwork): se o CPI de iOS num canal sobe sem o CPM subir, vale checar a reconciliação desse canal antes de cortar verba.`,
    basedOn: ["Funil"], sql: ["07_platform_split.sql"],
    cards: [{ id: "tbl", kind: "table", title: "CPI por canal e plataforma", columns: ["Canal", "Android", "iOS"], rows: gap.map((g) => [CHANNEL_LABEL[g.c], g.a === null ? "—" : brl(g.a), g.i === null ? "—" : brl(g.i)]) }],
    followUps: ["Por que o CPI do Meta subiu?", "Quais checagens de coleta estão quebradas?"],
  };
}

function tracking(ds: Dataset, q: string): AiAnswer {
  const n = norm(q);
  const t = trackingSummary(ds);
  const ch = channelsIn(q)[0];
  const bad = t.events.filter((e) => e.status === "broken" || e.status === "warn");
  const badRecon = t.recon.filter((r) => (r.status === "broken" || r.status === "warn") && (!ch || r.channel === ch));
  const eventOnly = /evento|tagbook|kyc|form_submit|sdk/.test(n);
  const lines = [...bad.map((e) => `${e.event} (${e.platform})${e.onset ? `, desde ${dm(e.onset)}` : ""}`)];
  const text = `${t.broken} checagens quebradas e ${t.warn} em atenção, de ${t.checks}. Cada razão entre fontes é comparada ao nível normal do próprio canal. ${bad.length ? `Eventos com problema: ${lines.join("; ")}. ` : ""}${bad[0]?.cause ? `Exemplo (${bad[0].event}): ${bad[0].cause}` : ""}`;
  const cards: AiCard[] = [];
  if (!eventOnly || badRecon.length)
    cards.push({ id: "recon", kind: "table", title: "Reconciliação fora do normal", columns: ["Canal", "Checagem", "Desvio"], rows: badRecon.slice(0, 8).map((r) => [CHANNEL_LABEL[r.channel] + (r.platform === "all" ? "" : ` ${r.platform}`), RECON_LABEL[r.check].title, r.deviation === null ? "—" : spct(r.deviation, 0)]) });
  cards.push({ id: "events", kind: "table", title: "Eventos do tagbook", columns: ["Evento", "Plataforma", "Status", "Desvio"], rows: t.events.map((e) => [e.event, e.platform, { ok: "Ok", warn: "Atenção", broken: "Quebrado", low_volume: "Pouco volume" }[e.status], e.deviation === null ? "—" : spct(e.deviation, 0)]) });
  return {
    intent: "tracking", title: ch ? `Saúde da coleta · ${CHANNEL_LABEL[ch]}` : "Saúde da coleta", text,
    basedOn: ["Saúde da coleta", "Tagbook"], sql: ["04_reconciliation.sql", "05_event_health.sql"], cards,
    followUps: ["Qual o impacto no CPI do Meta?", "Como a reconciliação funciona?"],
  };
}

function testsAnswer(ds: Dataset, q: string): AiAnswer {
  const tests = readTests(ds);
  const id = norm(q).match(/\bt([1-9])\b/)?.[1];
  const verdict = { winner_a: "vence A", winner_b: "vence B", no_difference: "sem diferença", underpowered: "amostra pequena", srm: "inválido por SRM" } as const;
  const one = id ? tests.find((t) => t.testId.toLowerCase() === `t${id}`) : undefined;
  if (one) {
    return {
      intent: "testes", title: `${one.testId} · ${one.name}`,
      text: `${one.channelLabel}, ${dm(one.start)} a ${dm(one.end)}. Veredito: ${verdict[one.verdict]}. ${one.note} Lift em instalações por impressão: ${one.primary.lift === null ? "—" : spct(one.primary.lift, 1)} (p = ${one.primary.p.toFixed(3).replace(".", ",")}); SRM p = ${one.srmP < 0.001 ? "< 0,001" : one.srmP.toFixed(3).replace(".", ",")}.`,
      basedOn: ["Testes A/B"], sql: ["06_ab_tests.sql"],
      cards: [{ id: "var", kind: "table", title: "Variantes", columns: ["Variante", "Impressões", "Cliques", "Instalações"], rows: [one.a, one.b].map((v) => [v.variant, n0(v.impressions), n0(v.clicks), n0(v.installs)]) }],
      followUps: ["Quais testes A/B posso ler?", "Como os testes A/B são lidos?"],
    };
  }
  return {
    intent: "testes", title: "Leitura dos testes A/B",
    text: `${tests.length} testes. Ordem de checagem: SRM, amostra mínima (100 instalações por variante) e só então significância. ${tests.filter((t) => t.verdict === "srm").map((t) => `${t.testId} foi invalidado por SRM`).join("; ")}${tests.some((t) => t.verdict === "srm") ? "." : ""}`,
    basedOn: ["Testes A/B"], sql: ["06_ab_tests.sql"],
    cards: [{ id: "tbl", kind: "table", title: "Testes", columns: ["Teste", "Canal", "Lift", "p", "Veredito"], rows: tests.map((t) => [`${t.testId} · ${t.name}`, t.channelLabel, t.primary.lift === null ? "—" : spct(t.primary.lift, 1), t.primary.p.toFixed(3).replace(".", ","), verdict[t.verdict]]) }],
    followUps: ["Por que o T5 foi invalidado?", "O que é SRM?"],
  };
}

function budget(ds: Dataset, q: string): AiAnswer {
  const n = norm(q);
  const chans = channelsIn(q);
  const pctQ = n.match(/(\d{1,3}) ?%/);
  const p = pctQ ? Number(pctQ[1]) / 100 : 0.2;
  // "se eu dobrar / aumentar a verba do X": escala um canal só, sem origem
  if (chans.length === 1 && /aument|dobr|reduz|cort|diminu|mais verba|menos verba/.test(n)) {
    const c = chans[0]!;
    const e = channelEconomics(ds).find((x) => x.channel === c)!;
    const sign = /reduz|cort|diminu|menos/.test(n) ? -1 : 1;
    const f = /dobr/.test(n) ? 1 : p;
    const ratio = 1 + sign * Math.min(f, 1);
    const after = e.installs * Math.pow(ratio, e.beta);
    const dSpend = e.spend * (ratio - 1), dInst = after - e.installs;
    const marg = Math.abs(dInst) > 1e-6 ? dSpend / dInst : null;
    const warn = ratio < 0.6 || ratio > 1.6 ? " Essa mudança sai da faixa de 60% a 160% do gasto atual, em que a curva foi observada: trate como hipótese." : "";
    return {
      intent: "verba", title: `${sign > 0 ? "Aumentar" : "Reduzir"} ${pct(Math.min(f, 1), 0)} a verba de ${CHANNEL_LABEL[c]}`,
      text: `Com β = ${n2(e.beta)}, ${spct(ratio - 1, 0)} de gasto (${brl0(dSpend)}) dá ${dInst >= 0 ? "+" : "−"}${n0(Math.abs(dInst))} instalações${marg === null ? "" : `, ou ${brl(Math.abs(marg))} por instalação adicional contra um CPI médio de ${brl(e.cpi ?? 0)}`}. Retorno decrescente: o real extra rende menos que o médio. A curva descreve o que já aconteceu no histórico; não prova que o efeito se repetiria com um teste de verba.${warn}${e.lowConfidence ? " Este canal tem poucas instalações por dia e a elasticidade tem baixa confiança." : ""}`,
      basedOn: ["Canais"], sql: ["08_curve_inputs.sql"],
      cards: [{ id: "scale", kind: "stats", title: "Projeção (base 28 dias)", items: [
        { label: "Gasto", value: `${brl0(e.spend)} → ${brl0(e.spend * ratio)}` },
        { label: "Instalações", value: `${n0(e.installs)} → ${n0(after)}`, tone: dInst >= 0 ? "bom" : "ruim" },
        { label: "CPI médio → marginal", value: `${brl(e.cpi ?? 0)} → ${brl(e.marginalCpi ?? 0)}` },
        { label: "β (elasticidade)", value: n2(e.beta) },
      ] }],
      followUps: ["Qual a melhor realocação de 20% da verba?", "Como a curva de resposta funciona?"],
    };
  }
  if (chans.length >= 2) {
    const [from, to] = chans as [Channel, Channel];
    const s = simulateShift(ds, from, to, p);
    return {
      intent: "verba", title: `Mover ${pct(s.pct, 0)} de ${CHANNEL_LABEL[from]} para ${CHANNEL_LABEL[to]}`,
      text: `Mesmo orçamento total, base dos últimos 28 dias (${brl0(s.movedAmount)} realocados). Projeção: ${s.installsDelta >= 0 ? "+" : "−"}${n0(Math.abs(s.installsDelta))} instalações, ${s.activatedDelta >= 0 ? "+" : "−"}${n0(Math.abs(s.activatedDelta))} ativações e ${s.valueDelta >= 0 ? "+" : "−"}${brl0(Math.abs(s.valueDelta))} em LTV90 esperado. É uma hipótese pela curva de resposta, não uma previsão. ${s.warnings.join(" ")}`,
      basedOn: ["Canais"], sql: ["08_curve_inputs.sql"],
      cards: [{ id: "rows", kind: "table", title: "Antes e depois", columns: ["Canal", "Gasto", "Instalações"], rows: s.rows.filter((r) => r.channel === from || r.channel === to).map((r) => [CHANNEL_LABEL[r.channel], `${brl0(r.spendBefore)} → ${brl0(r.spendAfter)}`, `${n0(r.installsBefore)} → ${n0(r.installsAfter)}`]) }],
      followUps: ["E se for 30%?", "Qual a melhor realocação de 20% da verba?"],
    };
  }
  const b = bestShift(ds, p);
  return {
    intent: "verba", title: `Melhor realocação de ${pct(p, 0)}`,
    text: b ? `Entre todas as combinações, a de maior valor esperado é ${CHANNEL_LABEL[b.from]} → ${CHANNEL_LABEL[b.to]}: ${b.installsDelta >= 0 ? "+" : "−"}${n0(Math.abs(b.installsDelta))} instalações, ${b.activatedDelta >= 0 ? "+" : "−"}${n0(Math.abs(b.activatedDelta))} ativações e ${brl0(b.valueDelta)} em LTV90 esperado. Use como hipótese de teste. ${b.warnings.join(" ")}` : "Nenhuma realocação simples aumenta o valor esperado com as curvas atuais.",
    basedOn: ["Canais"], sql: ["08_curve_inputs.sql"],
    cards: b ? [{ id: "rows", kind: "table", title: "Antes e depois", columns: ["Canal", "Gasto", "Instalações"], rows: b.rows.filter((r) => r.channel === b.from || r.channel === b.to).map((r) => [CHANNEL_LABEL[r.channel], `${brl0(r.spendBefore)} → ${brl0(r.spendAfter)}`, `${n0(r.installsBefore)} → ${n0(r.installsAfter)}`]) }] : [],
    followUps: ["Mova 20% do DV360 para o Google", "Se eu dobrar a verba do Google, o que acontece?"],
  };
}

function curve(ds: Dataset): AiAnswer {
  const eco = channelEconomics(ds);
  const curves = fitCurves(ds);
  return {
    intent: "curva", title: "CPI marginal por canal",
    text: `CPI marginal = CPI médio ÷ β: é o custo do próximo real investido. ${eco.map((e) => `${CHANNEL_LABEL[e.channel]} ${brl(e.cpi ?? 0)} → ${brl(e.marginalCpi ?? 0)}`).join("; ")}. Quanto menor o β, mais cara a instalação extra. ${curves.filter((c) => c.lowConfidence).map((c) => CHANNEL_LABEL[c.channel]).join(", ")} tem baixa confiança por ter poucas instalações por dia.`,
    basedOn: ["Canais"], sql: ["08_curve_inputs.sql"],
    cards: [{ id: "marg", kind: "bars", title: "CPI médio × marginal", format: "brl", rows: eco.map((e) => ({ label: CHANNEL_LABEL[e.channel], value: e.marginalCpi ?? 0, note: `médio ${brl(e.cpi ?? 0)} · β ${n2(e.beta)}` })) }],
    followUps: ["Qual a melhor realocação de 20% da verba?", "Se eu dobrar a verba do TikTok, o que acontece?"],
  };
}

// ------------------------------------------------------------------ roteador
const DOMAIN = /\b(canal|canais|midia|verba|gasto|invest\w*|instal\w*|cpi|cpa|cac|roas|ltv|cpm|ctr|cadastr\w*|funil|ativa\w*|kyc|cartao|teste\w*|a\/?b|srm|variante|criativo|coleta|tracking|evento\w*|tagbook|utm|ga4|gtm|appsflyer|mmp|atribuic\w*|campanha\w*|ios|android|plataforma|dado\w*|painel|dashboard|metrica\w*|orcamento|retorno|custo\w*|conversao|alerta\w*|insight\w*|simul\w*|curva|coorte|resumo|google|meta|tiktok|linkedin|dv ?360|youtube|facebook|instagram|receita|usuario\w*|app|sdk|quebrad\w*|reconcilia\w*|razao|mapa|quadrante|tagbook|marginal|t[1-9])\b/;

export function aiAnswer(ds: Dataset, question: string, prev?: string): AiAnswer {
  // pergunta curta de continuação ("por dia", "e no Meta?"): herda o assunto da pergunta anterior
  if (prev && !DOMAIN.test(norm(question)) && norm(question).length > 1 && norm(question).split(" ").length <= 4 && !/\b(qual|quem|quando|onde|capital|receita de|clima|tempo)\b/.test(norm(question))) return aiAnswer(ds, `${prev} ${question}`);
  const q = question.trim();
  const n = norm(q);
  if (n.length < 2 || n === "?") return summary(ds);
  if (!DOMAIN.test(n)) {
    return {
      intent: "fora_de_escopo", title: "Fora do que os dados cobrem",
      text: "Só respondo sobre os dados deste painel: investimento e custos por canal (CPI, CPA, CAC, ROAS, LTV), funil do app, testes A/B, saúde da coleta (GA4, AppsFlyer, backend), tagbook e simulação de verba. Não tenho informação sobre outros assuntos e não vou inventar. Tente uma das perguntas abaixo.",
      basedOn: [], sql: [], cards: [], followUps: AI_SUGGESTIONS,
    };
  }
  const topic = EXPLAIN_TRIGGER.test(n) ? TOPICS.find(([, re]) => re.test(n))?.[0] : undefined;
  if (topic) return explain(ds, topic);
  if (/(por ?que|porque|pq|motivo|causa|impacto|o que (aconteceu|mudou|houve)|subiu|caiu|aumentou|piorou|melhorou|explique a variacao)/.test(n) && /(cpi|custo|cpa|cac|cpm|ctr|instal)/.test(n) && !/coleta|tracking|evento/.test(n)) return why(ds, q);
  if (/\b(verba|realoc\w*|orcamento|simul\w*|mova|mover|transfer\w*|tirar|dobr\w*|aument\w* (a )?verba|reduz\w* (a )?verba)\b/.test(n) || /\bmov(a|er|e)\b/.test(n)) return budget(ds, q);
  if (/marginal|elasticidade|curva|saturac|retorno decrescente/.test(n)) return curve(ds);
  if (/coleta|tracking|divergen|evento|gtm|ga4|appsflyer|mmp|utm|atribuic|inconsist|quebrad|tagbook|sdk|reconcilia|duplic/.test(n)) return tracking(ds, q);
  if (/\bt[1-9]\b|teste|a\/?b|criativo|publico|srm|variante/.test(n)) return testsAnswer(ds, q);
  if (/ios|android|plataforma/.test(n) && /cpi|custo|instal|caro|barato|menor|maior/.test(n)) return platform(ds);
  if (/funil|conversao|etapa|kyc|cadastro|ativacao|onde perco/.test(n) && !/\bcpa\b|custo/.test(n)) return funnelAnswer(ds, q);
  if (/(paga|pagam) o proprio|compensa|\bcpi\b|\bcac\b|\bcpa\b|\broas\b|\bltv\b|gast\w*|invest\w*|instal\w*|cadastr\w*/.test(n) && (channelsIn(q).length || /\b(\d+ dias|semana|ontem|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/.test(n) || /por canal|cada canal|por que canal|qual canal/.test(n) || /^(qual|quanto|quantos|quantas|como esta)/.test(n))) return metric(ds, q);
  if (/melhor|pior|canal|canais|comparar|compare|ranking|lado a lado/.test(n)) return compareChannels(ds);
  return summary(ds);
}

/** Legenda de uma linha para cada card, derivada só dos dados do próprio card. */
export function cardCaption(card: AiCard): string | null {
  const f = (v: number, fm: AskFormat) => (fm === "pct" ? pct(v, 1) : fm === "brl" ? brl(v) : fm === "x" ? `${n2(v)}×` : n0(v));
  if (card.kind === "bars" && card.rows.length >= 2) {
    const s = [...card.rows].sort((a, b) => b.value - a.value);
    return `${s[0]!.label} lidera (${f(s[0]!.value, card.format)}); ${s[s.length - 1]!.label} tem o menor valor (${f(s[s.length - 1]!.value, card.format)}).`;
  }
  if (card.kind === "line" && card.series[0]) {
    const pts = card.series[0].values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
    if (pts.length >= 2) {
      const a = pts[0]!, b = pts[pts.length - 1]!;
      return `De ${f(a.v, card.format)} (${card.x[a.i]}) para ${f(b.v, card.format)} (${card.x[b.i]}).`;
    }
  }
  return null;
}


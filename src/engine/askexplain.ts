// "Como é calculado / o que significa": explica cada métrica e gráfico do painel, com a fórmula real do motor
// e um exemplo com os números do mês de referência. Só lê o motor; nada é calculado por IA.

import type { AiAnswer, AiCard, Intent } from "./ask";
import { norm } from "./ask";
import { buildSeries, editoriaHealth, npsWindow } from "./metrics";
import { unitEconomics } from "./growth";
import type { Dataset } from "./types";

const int = (x: number) => Math.round(x).toLocaleString("pt-BR");
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d).replace(".", ",")}%`;
const brl = (x: number, d = 0) => `R$ ${x.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const num1 = (x: number) => x.toFixed(1).replace(".", ",");

export type ExplainTopic = "editoria" | "churn" | "mrr" | "ticket" | "nps" | "ltvcac" | "cac" | "ltv" | "payback" | "coorte" | "risco" | "funil" | "ponte" | "correlacao" | "simulador" | "meta" | "engajamento";

const EXPLAIN_TRIGGER = /\b(como (e|foi|sao|eh) (feit\w*|calculad\w*|medid\w*|apurad\w*|o calculo)|como se calcula|como calcula\w*|como e o calculo|calculo (do|da|de)|como funciona\w*|formula|o que (e|eh|significa|quer dizer|sao)|nao entend\w*|nao entendi|explic\w*|como (ler|interpretar|leio|interpreto)|de onde vem|o que mede|para que serve|pra que serve)\b/;

const TOPICS: { topic: ExplainTopic; re: RegExp }[] = [
  { topic: "editoria", re: /\b(saude|editoria|editorias)\b/ },
  { topic: "ltvcac", re: /ltv ?\/? ?cac|ltv cac|ltv sobre cac/ },
  { topic: "payback", re: /\bpayback\b/ },
  { topic: "ltv", re: /\b(ltv|lifetime)\b/ },
  { topic: "cac", re: /\b(cac|custo de aquisicao)\b/ },
  { topic: "ponte", re: /\b(ponte|bridge|waterfall|cascata)\b/ },
  { topic: "mrr", re: /\b(mrr|receita recorrente)\b/ },
  { topic: "ticket", re: /\b(ticket|arpu)\b/ },
  { topic: "nps", re: /\b(nps|promotor\w*|detrator\w*)\b/ },
  { topic: "coorte", re: /\b(coorte|coortes|safra|safras|curva de permanencia|kaplan\w*|retencao por)\b/ },
  { topic: "risco", re: /\b(risco|em risco|score de risco|mapa de assinantes)\b/ },
  { topic: "funil", re: /\b(funil|paywall)\b/ },
  { topic: "correlacao", re: /\b(correlac\w*|rede de correlac\w*)\b/ },
  { topic: "simulador", re: /\b(simulador|e se)\b/ },
  { topic: "meta", re: /\b(meta|projecao|saldo necessario)\b/ },
  { topic: "engajamento", re: /\bengajamento\b/ },
  { topic: "churn", re: /\b(churn|cancelamento|cancelamentos)\b/ },
];

export function classifyExplainQuestion(question: string): ExplainTopic | null {
  const q = norm(question);
  if (!EXPLAIN_TRIGGER.test(q)) return null;
  return TOPICS.find((t) => t.re.test(q))?.topic ?? null;
}

/** Pergunta de "como é calculado" por intenção da resposta (usada como sugestão de próxima pergunta). */
export const EXPLAIN_FOLLOWUP: Partial<Record<Intent, string>> = {
  editorias: "Como é calculada a saúde por editoria?",
  churn: "Como é calculado o churn?",
  nps: "Como é calculado o NPS?",
  safras: "Como ler a curva de retenção por safra?",
  risco: "Como é calculado o risco de cancelamento?",
  meta: "Como é calculada a projeção até a meta?",
  planos: "Como é calculado o MRR?",
};

interface Entry {
  intent: Intent;
  basedOn: string;
  title: string;
  what: string;
  formula: string[][];
  read: string;
  example: string;
  items: { label: string; value: string; tone?: "bom" | "ruim" | "neutro" }[];
  caveat?: string;
  followUps: string[];
}

function entry(ds: Dataset, topic: ExplainTopic): Entry {
  const series = buildSeries(ds);
  const m1 = series.length - 1;
  const now = series[m1];
  const prev = series[m1 - 1];
  const m0 = m1 - 5;

  switch (topic) {
    case "editoria": {
      const h = editoriaHealth(ds, m1);
      const w = h[h.length - 1];
      const b = h[0];
      const stab = Math.max(0, Math.min(100, 100 - w.churn3m * 1200));
      return {
        intent: "editorias", basedOn: "Saúde por editoria", title: "Como é calculada a saúde por editoria",
        what: "É uma nota de 0 a 100 para cada editoria (o assunto de maior interesse do assinante). Ela junta dois sinais: o quanto os leitores engajam e o quanto eles permanecem.",
        formula: [
          ["Engajamento médio", "média do índice de engajamento (0–100) dos assinantes ativos da editoria", "peso 55%"],
          ["Estabilidade", "100 − (churn mensal dos últimos 3 meses × 1.200), limitada entre 0 e 100", "peso 45%"],
          ["Nota", "0,55 × engajamento + 0,45 × estabilidade", "0–100"],
        ],
        read: "Verde a partir de 70, âmbar de 50 a 69, vermelho abaixo de 50. A barra mostra a nota; ao lado aparece o engajamento. Nota baixa por engajamento fraco é problema de conteúdo; por estabilidade fraca é problema de retenção.",
        example: `${w.editoria}: engajamento ${num1(w.avgEngagement)} e churn de ${pct(w.churn3m)} ao mês. Estabilidade = 100 − ${num1(w.churn3m * 1200)} = ${Math.round(stab)}. Nota = 0,55 × ${num1(w.avgEngagement)} + 0,45 × ${Math.round(stab)} = ${w.score}. A melhor é ${b.editoria}, com ${b.score}.`,
        items: [{ label: `Pior: ${w.editoria}`, value: String(w.score), tone: "ruim" }, { label: `Melhor: ${b.editoria}`, value: String(b.score), tone: "bom" }, { label: "Churn 3m da pior", value: pct(w.churn3m), tone: "neutro" }],
        caveat: "Os pesos 55/45 e o fator 1.200 são escolhas de modelagem deste painel, não um padrão de mercado. Servem para comparar editorias entre si, não como nota absoluta.",
        followUps: ["Como estão as editorias?", "Como é calculado o churn?", "Qual o NPS dos assinantes?"],
      };
    }
    case "churn":
      return {
        intent: "churn", basedOn: "Churn mensal", title: "Como é calculado o churn",
        what: "É a parcela da base que cancela em um mês.",
        formula: [["Churn mensal", "cancelamentos do mês ÷ assinantes ativos no fim do mês anterior", "%"], ["Voluntário", "cliente decidiu sair (preço, pouco uso, concorrente)", "motivo"], ["Involuntário", "falha de pagamento; o cliente não pediu para sair", "motivo"]],
        read: "Compare sempre com o mês anterior e o mesmo mês do ano anterior (os dois aparecem no card). Um pico isolado costuma ter causa pontual, como reajuste ou fim de promoção; veja as notas no gráfico.",
        example: `${now.label}: ${int(now.cancelled)} cancelamentos ÷ ${int(prev.active)} ativos no mês anterior = ${pct(now.churnRate, 2)}.`,
        items: [{ label: "Cancelamentos", value: int(now.cancelled), tone: "neutro" }, { label: "Base anterior", value: int(prev.active), tone: "neutro" }, { label: "Churn", value: pct(now.churnRate, 2), tone: "neutro" }],
        followUps: ["Como está o churn?", "Por que os assinantes cancelam?", "E se o churn cair 1 ponto?"],
      };
    case "mrr":
      return {
        intent: "planos", basedOn: "MRR", title: "Como é calculado o MRR",
        what: "É a receita mensal recorrente: quanto entra por mês com a base atual.",
        formula: [["MRR", "soma da mensalidade vigente de cada assinante ativo no mês", "R$"], ["Anual", "convertido para valor mensal", "÷ 12"], ["Promoção", "entra com o desconto enquanto durar", "preço × (1 − desconto)"]],
        read: "MRR sobe com novas assinaturas e upgrades e cai com cancelamentos, fim de promoção (que, ao acabar, aumenta a receita por assinante) e reajustes. A Ponte de MRR mostra essa decomposição.",
        example: `${now.label}: ${int(now.active)} ativos somam ${brl(now.mrr)} de MRR.`,
        items: [{ label: "MRR", value: brl(now.mrr), tone: "neutro" }, { label: "Ativos", value: int(now.active), tone: "neutro" }, { label: "Ticket médio", value: brl(now.arpu, 2), tone: "neutro" }],
        followUps: ["Como foi o reajuste de preço?", "Qual a composição por plano?", "Quanto vou faturar em dezembro?"],
      };
    case "ticket":
      return {
        intent: "planos", basedOn: "Ticket médio", title: "Como é calculado o ticket médio",
        what: "É quanto cada assinante ativo paga por mês, em média.",
        formula: [["Ticket médio (ARPU)", "MRR ÷ assinantes ativos", "R$/mês"]],
        read: "Pode cair mesmo sem baixar preço: entrada de muitos assinantes em promoção ou no plano Estudante (R$ 14,90) puxa a média para baixo. Veja a composição por plano.",
        example: `${now.label}: ${brl(now.mrr)} ÷ ${int(now.active)} = ${brl(now.arpu, 2)}.`,
        items: [{ label: "Ticket médio", value: brl(now.arpu, 2), tone: "neutro" }],
        followUps: ["Qual a composição por plano?", "Como é calculado o MRR?", "Qual o nosso preço?"],
      };
    case "nps": {
      const n = npsWindow(ds, m1);
      return {
        intent: "nps", basedOn: "NPS", title: "Como é calculado o NPS",
        what: "Mede a disposição de recomendar o produto, numa escala de 0 a 10.",
        formula: [["Promotores", "notas 9 e 10", "%"], ["Neutros", "notas 7 e 8 (não entram na conta)", "—"], ["Detratores", "notas 0 a 6", "%"], ["NPS", "% promotores − % detratores", "−100 a +100"]],
        read: "Acima de 0 há mais quem recomenda do que quem critica; acima de 50 é considerado muito bom. Aqui o NPS usa janela móvel de 3 meses e conta só quem respondeu, então depende da taxa de resposta.",
        example: `${now.label}: ${int(n.promoters)} promotores e ${int(n.detractors)} detratores em ${int(n.responses)} respostas = (${int(n.promoters)} − ${int(n.detractors)}) ÷ ${int(n.responses)} = ${n.score > 0 ? "+" : ""}${n.score}.`,
        items: [{ label: "NPS", value: `${n.score > 0 ? "+" : ""}${n.score}`, tone: n.score >= 50 ? "bom" : n.score >= 0 ? "neutro" : "ruim" }, { label: "Respostas", value: int(n.responses), tone: "neutro" }, { label: "Adesão", value: pct(n.adoption, 0), tone: "neutro" }],
        followUps: ["Como está o NPS?", "Qual o NPS por editoria?", "Como estão as editorias?"],
      };
    }
    case "coorte":
      return {
        intent: "safras", basedOn: "Retenção por coorte", title: "Como ler a retenção por safra",
        what: "Uma safra (coorte) é o grupo de assinantes que entrou no mesmo período ou campanha. A curva mostra que % dela continua ativa a cada mês de vida.",
        formula: [["Eixo X", "meses desde a assinatura (não o mês do calendário)", "idade"], ["Eixo Y", "% da safra ainda ativa (Kaplan-Meier, que trata quem ainda não completou aquela idade)", "retenção"], ["Comparação", "cada safra contra a curva regular", "p.p."]],
        read: "Curva mais alta é safra melhor. Quedas bruscas em idades específicas indicam gatilhos, como o fim da promoção. Safras de campanha, como a Black Friday, tendem a reter pior por entrarem com desconto.",
        example: "Em 'Safra Black Friday retém pior', a diferença em p.p. é a distância entre a curva dela e a base regular na mesma idade.",
        items: [], followUps: ["Compare as safras de campanha", "Qual canal retém pior?", "Por que os assinantes cancelam?"],
      };
    case "risco":
      return {
        intent: "risco", basedOn: "Risco de cancelamento", title: "Como é calculado o risco de cancelamento",
        what: "É a probabilidade estimada de cada assinante ativo cancelar nos próximos 3 meses.",
        formula: [["Entradas", "plano, canal de entrada, engajamento, tempo de casa, fim de promoção, reajuste e eventos", "por assinante"], ["Risco 3 meses", "1 − (chance de permanecer mês 1 × mês 2 × mês 3)", "%"], ["Crítico", "faixa mais alta de risco", "lista"]],
        read: "'Gatilho' diz o motivo dominante (promoção acabando, renovação anual, baixo engajamento, canal de risco). Priorize quem tem risco alto e MRR relevante.",
        example: "O 'MRR em risco' soma a mensalidade de quem está na faixa crítica.",
        items: [], caveat: "Aqui o modelo é o mesmo que gera os dados sintéticos. Com dados reais, ele seria treinado com o histórico de cancelamentos.",
        followUps: ["Quem está em risco de cancelar?", "Por que os assinantes cancelam?", "Como é calculado o churn?"],
      };
    case "funil":
      return {
        intent: "canais", basedOn: "Funil de compra", title: "Como ler o funil de compra",
        what: "Mostra por onde se perdem os visitantes não assinantes até a compra.",
        formula: [["Visitantes", "estimado a partir da oferta exibida por canal", "estimado"], ["Início da compra e compra", "contagem real do dataset", "real"], ["Revisão e cartão", "estimados por taxa do canal", "estimado"], ["Etapa mais fraca", "menor % de passagem entre etapas", "%"]],
        read: "Compare cada canal contra o mix. O 'vazamento' destaca onde um canal converte abaixo do esperado e quantas assinaturas a mais seriam obtidas se igualasse.",
        example: "Escala logarítmica nas barras: cada etapa é bem menor que a anterior, então a escala linear esconderia as últimas.",
        items: [], caveat: "Visitantes, revisão e cartão são premissas sintéticas; só início da compra e compra são reais.",
        followUps: ["Onde estou perdendo mais gente no funil?", "Qual o CAC por canal?", "Qual canal retém pior?"],
      };
    case "ponte":
      return {
        intent: "planos", basedOn: "Ponte de MRR", title: "Como ler a ponte de MRR",
        what: "Explica de onde veio a variação do MRR entre dois meses, parte por parte.",
        formula: [["Novas", "MRR das assinaturas novas", "+"], ["Fim de promoção", "receita que sobe quando o desconto acaba", "+"], ["Reajuste", "efeito do aumento de preço", "+"], ["Upgrades", "troca para plano mais caro", "+"], ["Cancelamentos", "MRR de quem saiu", "−"]],
        read: "MRR inicial + todas as barras = MRR final. A barra que mais pesa mostra qual alavanca está movendo a receita.",
        example: "O reajuste de jul/26 aparece como barra positiva, mas veja o custo no churn do mesmo período.",
        items: [], followUps: ["Como foi o reajuste de preço?", "Como é calculado o MRR?", "Como está o churn?"],
      };
    case "ltvcac": case "ltv": case "cac": case "payback": {
      const rows = unitEconomics(ds, m0, m1).filter((r) => r.ltvCac !== null);
      const meta = [...rows].sort((a, b) => (a.ltvCac as number) - (b.ltvCac as number))[0];
      return {
        intent: "canais", basedOn: "Eficiência por canal · LTV × CAC", title: "Como ler LTV, CAC e payback",
        what: "Respondem se vale a pena pagar para trazer assinantes de um canal.",
        formula: [["CAC", "custo para adquirir um assinante no canal", "premissa sintética"], ["LTV 12 meses", "ticket realizado × soma da probabilidade de continuar ativo nos meses 0 a 11", "R$"], ["LTV/CAC", "LTV ÷ CAC", "x"], ["Payback", "CAC ÷ ticket mensal", "meses"]],
        read: "LTV/CAC ≥ 3x é saudável, entre 1,5x e 3x é atenção e abaixo de 1,5x não sustenta escala. Payback curto libera caixa mais rápido.",
        example: `${meta.channel}: LTV de ${brl(meta.ltv12 as number)} ÷ CAC de ${brl(meta.cac)} = ${num1(meta.ltvCac as number)}x, com payback de ${num1(meta.payback as number)} meses.`,
        items: [{ label: meta.channel, value: `${num1(meta.ltvCac as number)}x`, tone: "ruim" }],
        caveat: "O dataset não tem custo de mídia: o CAC por canal é premissa. O LTV vem da retenção real do dataset.",
        followUps: ["Qual o CAC por canal?", "Vale a pena investir em mídia paga?", "Qual o payback da mídia paga?"],
      };
    }
    case "correlacao":
      return {
        intent: "resumo", basedOn: "Rede de correlação", title: "Como ler a rede de correlação",
        what: "Mostra quais métricas andam juntas mês a mês.",
        formula: [["r", "correlação entre as variações mensais de duas métricas", "−1 a +1"], ["Variação, não nível", "usa a diferença de um mês para o outro, para evitar correlação falsa de duas séries que só crescem", "método"]],
        read: "Perto de +1 sobem juntas; perto de −1, uma sobe e a outra cai; perto de 0, sem relação. Correlação não prova causa.",
        example: "'novas assinaturas × engajamento' com r negativo indica que meses de muita entrada trazem engajamento médio menor.",
        items: [], followUps: ["Resumo dos principais alertas", "Como está o churn?", "Qual canal retém pior?"],
      };
    case "simulador":
      return {
        intent: "meta", basedOn: "Simulador", title: "Como funciona o simulador",
        what: "Testa 'e se' sobre a projeção de assinantes até a meta.",
        formula: [["Churn voluntário", "quanto você reduz do churn que não é falha de pagamento", "p.p. ao mês"], ["Falhas de pagamento", "parcela recuperada dos cancelamentos involuntários", "%"], ["Aquisição", "aumento de novas assinaturas por mês", "%"]],
        read: "O gráfico compara a projeção atual com o cenário. 'O que bastaria sozinho' mostra quanto cada alavanca precisaria render isolada para bater a meta.",
        example: "Não simula preço: não há dado para medir como o preço muda o churn.",
        items: [], followUps: ["E se o churn cair 1 ponto?", "Vamos bater a meta de dezembro?", "Se eu abaixar o preço melhora o churn?"],
      };
    case "meta": {
      return {
        intent: "meta", basedOn: "Evolução de assinantes", title: "Como é calculada a projeção até a meta",
        what: "Estende a tendência recente da base até dezembro e compara com a meta.",
        formula: [["Projeção", "ritmo líquido recente (novas − cancelamentos) mantido até a data da meta", "linear"], ["Falta p/ meta", "meta − projeção", "assinantes"], ["Saldo necessário/mês", "quanto o saldo líquido mensal precisa ser para chegar à meta", "assinantes/mês"]],
        read: "A linha tracejada é a projeção. Se ela termina abaixo da linha da meta, a diferença é o que falta.",
        example: `${now.label}: ${int(now.active)} ativos hoje; meta de ${int(ds.meta.goalActive)}.`,
        items: [], caveat: "Projeção linear sobre a tendência recente: não prevê campanhas nem novos reajustes.",
        followUps: ["Vamos bater a meta de dezembro?", "E se o churn cair 1 ponto?", "Quanto vou faturar em dezembro?"],
      };
    }
    default:
      return {
        intent: "resumo", basedOn: "Engajamento", title: "Como é o índice de engajamento",
        what: "É uma nota de 0 a 100 por assinante que resume o quanto ele lê e usa o produto.",
        formula: [["Índice", "0–100 por assinante; o card mostra a média por grupo", "média"]],
        read: "Engajamento baixo (abaixo de 40) é um dos gatilhos de risco de cancelamento.",
        example: `Média da base em ${now.label}: ${num1(now.avgEngagement)}.`,
        items: [], caveat: "No dataset sintético o índice é gerado por canal, plano e editoria; em dados reais viria de leitura, frequência e recência.",
        followUps: ["Como estão as editorias?", "Como é calculado o risco de cancelamento?", "Como está o NPS?"],
      };
  }
}

export function explainAnswer(ds: Dataset, question: string): AiAnswer | null {
  const topic = classifyExplainQuestion(question);
  if (!topic) return null;
  const e = entry(ds, topic);
  const cards: AiCard[] = [{ id: `explain-${topic}`, kind: "table", title: "Como entra na conta", columns: ["Item", "Definição", "Unidade"], rows: e.formula }];
  if (e.items.length) cards.push({ id: `explain-${topic}-ex`, kind: "stats", title: "Com os números de hoje", items: e.items });
  return {
    intent: e.intent,
    title: e.title,
    text: `${e.what} Exemplo: ${e.example} Como ler: ${e.read}${e.caveat ? ` Atenção: ${e.caveat}` : ""}`,
    basedOn: [e.basedOn],
    cards,
    followUps: e.followUps,
  };
}

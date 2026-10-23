// Motor de insights: regras determinísticas sobre as métricas → achados com severidade e evidência.
// Texto em pt-BR com os números injetados (o "Modo IA" só precisa escolher/ordenar/parafrasear).

import { monthLabel } from "./calendar";
import {
  CRITICAL_RISK,
  atRisk,
  buildSeries,
  churnBySegment,
  churnReasons,
  cohortRetention,
  correlationMatrix,
  isPaid,
  lagCorrelation,
  npsWindow,
  projectActive,
} from "./metrics";
import type { SeriesKey } from "./metrics";
import { mean, round, stdev } from "./stats";
import type { Dataset } from "./types";

export type Severity = "perigo" | "atenção" | "positivo" | "info";

export interface Insight {
  id: string;
  severity: Severity;
  /** card/seção do dashboard a que o achado se refere (usado pelo Modo IA para "Com base em: …") */
  topic: "base" | "churn" | "coortes" | "canais" | "preço" | "pagamento" | "meta" | "correlação" | "nps" | "risco" | "editorias";
  title: string;
  text: string;
  /** número de destaque do achado */
  value: number | null;
  /** peso para ordenação dentro da mesma severidade (maior = mais importante) */
  weight: number;
}

const SEV_ORDER: Record<Severity, number> = { perigo: 0, atenção: 1, positivo: 2, info: 3 };
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d).replace(".", ",")}%`;
const pp = (x: number, d = 1) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d).replace(".", ",")} p.p.`;
const brl = (x: number) => `R$ ${Math.round(x).toLocaleString("pt-BR")}`;

const LABELS: Record<SeriesKey, string> = {
  newSubs: "novas assinaturas",
  cancelled: "cancelamentos",
  churnRate: "churn",
  nps: "NPS",
  arpu: "ticket médio",
  mrr: "MRR",
  avgEngagement: "engajamento",
  paidShareNew: "peso da mídia paga",
  active: "base ativa",
  upgrades: "upgrades",
};

export function generateInsights(ds: Dataset, month?: number): Insight[] {
  const series = buildSeries(ds);
  const m = month ?? series.length - 1;
  const cur = series[m];
  const out: Insight[] = [];
  const add = (i: Insight) => out.push(i);

  // 1) Churn do mês vs. média recente (z-score)
  const hist = series.slice(Math.max(0, m - 12), m).map((p) => p.churnRate);
  const mu = mean(hist);
  const sd = stdev(hist);
  const z = sd > 0 ? (cur.churnRate - mu) / sd : 0;
  if (z >= 1.5) {
    add({
      id: "churn-alto",
      severity: z >= 2.2 ? "perigo" : "atenção",
      topic: "churn",
      title: "Churn acima do padrão",
      text: `O churn de ${cur.label} foi ${pct(cur.churnRate)}, ${pp(cur.churnRate - mu)} acima da média dos 12 meses anteriores (${pct(mu)}).`,
      value: cur.churnRate,
      weight: z,
    });
  } else if (z <= -1.2) {
    add({
      id: "churn-baixo",
      severity: "positivo",
      topic: "churn",
      title: "Churn abaixo do padrão",
      text: `O churn de ${cur.label} foi ${pct(cur.churnRate)}, ${pp(cur.churnRate - mu)} em relação à média dos 12 meses anteriores (${pct(mu)}).`,
      value: cur.churnRate,
      weight: -z,
    });
  }
  // meses de pico no histórico recente (para anotação no gráfico)
  const peak = [...series.slice(Math.max(0, m - 12), m + 1)].sort((a, b) => b.churnRate - a.churnRate)[0];
  if (peak && peak.m !== m && sd > 0 && (peak.churnRate - mu) / sd >= 1.8) {
    add({
      id: "churn-pico",
      severity: "atenção",
      topic: "churn",
      title: `Pico de cancelamentos em ${peak.label}`,
      text: `${peak.label} teve ${peak.cancelled} cancelamentos (churn de ${pct(peak.churnRate)}), o maior do período.`,
      value: peak.churnRate,
      weight: 1.5,
    });
  }

  // 2) Safras de campanha: retenção em M3 vs. base regular
  const byCampaign = cohortRetention(ds, "campaign", { minSize: 80, minObservable: 60 });
  const base = byCampaign.find((c) => c.key === "Base regular");
  if (base) {
    for (const c of byCampaign) {
      if (c.key === "Base regular") continue;
      const age = [6, 3, 2].find((k) => c.retention[k] != null && base.retention[k] != null);
      if (age === undefined) continue;
      const gap = (c.retention[age]! - base.retention[age]!) / 100;
      if (gap <= -0.05) {
        add({
          id: `safra-${c.key}`,
          severity: gap <= -0.12 ? "perigo" : "atenção",
          topic: "coortes",
          title: `Safra ${c.key} retém pior`,
          text: `A safra ${c.key} (${c.size.toLocaleString("pt-BR")} assinantes) mantém ${round(c.retention[age]!, 0)}% no mês ${age}, contra ${round(base.retention[age]!, 0)}% da base regular (${pp(gap, 0)}).`,
          value: gap,
          weight: (Math.abs(gap) * c.size) / 50,
        });
      } else if (gap >= 0.04) {
        add({
          id: `safra-${c.key}`,
          severity: "positivo",
          topic: "coortes",
          title: `Safra ${c.key} retém melhor`,
          text: `A safra ${c.key} mantém ${round(c.retention[age]!, 0)}% no mês ${age}, ${pp(gap, 0)} acima da base regular.`,
          value: gap,
          weight: gap * 10,
        });
      }
    }
  }

  // 3) Canais: pior vs. melhor retenção em M6
  const byChannel = cohortRetention(ds, "channel", { minSize: 150 }).filter((c) => c.retention[6] != null);
  if (byChannel.length >= 2) {
    const sorted = [...byChannel].sort((a, b) => b.retention[6]! - a.retention[6]!);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const gap = (best.retention[6]! - worst.retention[6]!) / 100;
    add({
      id: "canal-gap",
      severity: gap >= 0.15 ? "atenção" : "info",
      topic: "canais",
      title: `${worst.key} é o canal de pior retenção`,
      text: `Em 6 meses, ${worst.key} retém ${round(worst.retention[6]!, 0)}% das assinaturas; ${best.key} retém ${round(best.retention[6]!, 0)}% (${round(gap * 100, 0)} p.p. de diferença).`,
      value: gap,
      weight: gap * 8,
    });
  }
  const paidRet = cohortRetention(ds, "channel", { minSize: 150 }).filter((c) => isPaid(c.key as never) && c.retention[3] != null);
  const organicRet = cohortRetention(ds, "channel", { minSize: 150 }).filter((c) => (c.key === "Orgânico" || c.key === "Newsletter") && c.retention[3] != null);
  if (paidRet.length && organicRet.length) {
    const gap = (mean(paidRet.map((c) => c.retention[3]!)) - mean(organicRet.map((c) => c.retention[3]!))) / 100;
    if (gap <= -0.06) {
      add({
        id: "paga-vs-organico",
        severity: "atenção",
        topic: "canais",
        title: "Mídia paga retém menos que o orgânico",
        text: `No mês 3, assinaturas de mídia paga retêm ${Math.round(Math.abs(gap) * 100)} p.p. a menos que Orgânico/Newsletter. O CAC deve ser comparado com o LTV, não só com o volume de vendas.`,
        value: gap,
        weight: Math.abs(gap) * 8,
      });
    }
  }

  // 4) Penhasco da promoção: churn em M(promo) vs sem promoção
  const promo = cohortRetention(ds, "promo", { minSize: 200 });
  const withP = promo.find((c) => c.key === "Com promoção");
  const noP = promo.find((c) => c.key === "Sem promoção");
  if (withP && noP && withP.retention[3] != null && noP.retention[3] != null) {
    const drop = (withP.retention[2]! - withP.retention[4]!) / 100;
    const dropNo = (noP.retention[2]! - noP.retention[4]!) / 100;
    if (drop > dropNo * 1.5) {
      add({
        id: "penhasco-promo",
        severity: "atenção",
        topic: "preço",
        title: "Penhasco quando acaba a promoção",
        text: `Entre os meses 2 e 4, quem entrou em promoção perde ${pct(drop, 0)} da base; sem promoção, ${pct(dropNo, 0)}. O momento do preço cheio é onde a oferta vaza.`,
        value: drop,
        weight: drop * 10,
      });
    }
  }

  // 5) Reajuste: churn de Mensal/Combo nos 2 meses do reajuste vs. 6 meses anteriores
  const reajuste = ds.meta.events.find((e) => e.kind === "preço");
  if (reajuste && m >= reajuste.month + 1) {
    const isRecurring = (p: string) => p === "Mensal" || p === "Combo Streaming";
    const during = churnBySegment(ds, reajuste.month, reajuste.month + 1, (s) => (isRecurring(s.plan) ? "x" : "outros")).find((c) => c.key === "x");
    const before = churnBySegment(ds, reajuste.month - 6, reajuste.month - 1, (s) => (isRecurring(s.plan) ? "x" : "outros")).find((c) => c.key === "x");
    if (during && before && during.rate > before.rate * 1.2) {
      const lost = Math.round((during.rate - before.rate) * during.exposure);
      add({
        id: "reajuste",
        severity: during.rate > before.rate * 1.4 ? "atenção" : "info",
        topic: "preço",
        title: "Reajuste elevou o churn",
        text: `Nos 2 meses do reajuste, o churn dos planos Mensal e Combo foi ${pct(during.rate)} (vs. ${pct(before.rate)} antes): cerca de ${lost} cancelamentos a mais.`,
        value: during.rate - before.rate,
        weight: (during.rate / before.rate) * 2,
      });
    }
  }

  // 6) Cancelamento involuntário (falha de pagamento)
  const reasons = churnReasons(ds, Math.max(0, m - 11), m);
  const invol = reasons.byNature.find((n) => n.nature === "Involuntário");
  if (invol && invol.share >= 0.12) {
    const mrrLoss = (() => {
      const avgTicket = cur.arpu || 0;
      return invol.count * avgTicket;
    })();
    add({
      id: "involuntario",
      severity: invol.share >= 0.2 ? "atenção" : "info",
      topic: "pagamento",
      title: "Cancelamentos por falha de pagamento",
      text: `${pct(invol.share, 0)} dos cancelamentos em 12 meses (${invol.count}) foram involuntários. Recuperar parte disso (retentativa de cobrança, aviso de cartão) é a alavanca mais barata de retenção: cerca de ${brl(mrrLoss)}/mês em MRR.`,
      value: invol.share,
      weight: invol.share * 10,
    });
  }

  // 7) Meta de assinantes ativos
  const proj = projectActive(series.slice(0, m + 1), ds.meta.goalActive, ds.meta.goalMonth);
  add({
    id: "meta",
    severity: proj.onTrack ? "positivo" : proj.gap > ds.meta.goalActive * 0.03 ? "atenção" : "info",
    topic: "meta",
    title: proj.onTrack ? "Meta de assinantes no caminho" : "Meta de assinantes em risco",
    text: proj.onTrack
      ? `No ritmo atual (${proj.currentNetAdds >= 0 ? "+" : ""}${proj.currentNetAdds}/mês), a base chega a ${proj.projectedAtGoal.toLocaleString("pt-BR")} em ${monthLabel(proj.goalMonth)}, acima da meta de ${proj.goal.toLocaleString("pt-BR")}.`
      : `No ritmo atual (${proj.currentNetAdds >= 0 ? "+" : ""}${proj.currentNetAdds}/mês), a base chega a ${proj.projectedAtGoal.toLocaleString("pt-BR")} em ${monthLabel(proj.goalMonth)}: faltam ${proj.gap.toLocaleString("pt-BR")} para a meta de ${proj.goal.toLocaleString("pt-BR")}. É preciso ${proj.requiredNetAdds}/mês de saldo líquido.`,
    value: proj.gap,
    weight: Math.abs(proj.gap) / 100,
  });

  // 8) NPS
  const npsNow = npsWindow(ds, m).score;
  const npsBefore = m >= 3 ? npsWindow(ds, m - 3).score : npsNow;
  const dNps = npsNow - npsBefore;
  if (Math.abs(dNps) >= 4) {
    add({
      id: "nps",
      severity: dNps > 0 ? "positivo" : "atenção",
      topic: "nps",
      title: dNps > 0 ? "NPS em alta" : "NPS em queda",
      text: `O NPS está em ${npsNow >= 0 ? "+" : ""}${npsNow}, ${dNps > 0 ? "+" : ""}${dNps} pontos vs. 3 meses antes.`,
      value: dNps,
      weight: Math.abs(dNps) / 3,
    });
  }

  // 9) Correlações (em diferenças, para evitar correlação espúria por tendência) + defasada
  const keys: SeriesKey[] = ["newSubs", "churnRate", "nps", "arpu", "avgEngagement"];
  const cm = correlationMatrix(series.slice(0, m + 1), keys, "diff");
  let best: { a: SeriesKey; b: SeriesKey; r: number } | null = null;
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) if (!best || Math.abs(cm.r[i][j]) > Math.abs(best.r)) best = { a: keys[i], b: keys[j], r: cm.r[i][j] };
  if (best && Math.abs(best.r) >= 0.5) {
    add({
      id: "correlacao",
      severity: "info",
      topic: "correlação",
      title: `${LABELS[best.a]} × ${LABELS[best.b]}`,
      text: `Mês a mês, ${LABELS[best.a]} e ${LABELS[best.b]} se movem ${best.r > 0 ? "juntos" : "em sentidos opostos"} (r = ${String(best.r).replace(".", ",")}, calculado sobre variações para evitar correlação espúria por tendência).`,
      value: best.r,
      weight: Math.abs(best.r) * 2,
    });
  }
  const lag = lagCorrelation(series.slice(0, m + 1), "paidShareNew", "churnRate", 3);
  if (lag >= 0.4) {
    add({
      id: "lag-paga-churn",
      severity: "atenção",
      topic: "correlação",
      title: "Mídia paga hoje, churn em 3 meses",
      text: `Quando a mídia paga pesa mais nas novas assinaturas, o churn sobe cerca de 3 meses depois (r = ${String(lag).replace(".", ",")}). Vale medir campanhas pelo retorno em 90 dias, não só pelo volume de vendas.`,
      value: lag,
      weight: lag * 3,
    });
  }

  // 10) Zona crítica de risco
  const risk = atRisk(ds, m);
  if (risk.critical > 0) {
    add({
      id: "risco",
      severity: risk.criticalShare >= 0.1 ? "atenção" : "info",
      topic: "risco",
      title: `${risk.critical} assinantes em zona crítica`,
      text: `${risk.critical.toLocaleString("pt-BR")} assinantes (${pct(risk.criticalShare, 1)} da base) têm risco ≥ ${CRITICAL_RISK}% de cancelar em 90 dias, somando ${brl(risk.mrrAtRisk)} de MRR${risk.topDriver ? `. Principal gatilho: ${risk.topDriver.key}` : ""}${risk.topEditoria ? `; editoria mais exposta: ${risk.topEditoria.key}` : ""}.`,
      value: risk.critical,
      weight: risk.criticalShare * 20,
    });
  }

  return out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.weight - a.weight);
}

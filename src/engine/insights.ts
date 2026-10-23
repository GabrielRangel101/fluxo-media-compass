// Insights por regras (sem IA): cada regra lê números do motor e redige a frase. Ordenados por gravidade.

import { bestShift, channelEconomics } from "./allocation.ts";
import { brl, brl0, dm, n2, pct, spct } from "./fmt.ts";
import { addDays } from "./calendar.ts";
import { channelSummary, deltas, funnel, periods } from "./metrics.ts";
import { readTests } from "./experiments.ts";
import { CURRENT_DAYS, reconcile, eventHealth } from "./tracking.ts";
import { CHANNEL_LABEL } from "./types.ts";
import type { Channel, Dataset } from "./types.ts";

export type ViewId = "geral" | "canais" | "funil" | "testes" | "tracking" | "tagbook" | "sql";

export interface Insight {
  id: string;
  severity: "alta" | "media" | "info";
  topic: "tracking" | "eficiencia" | "canais" | "testes" | "funil";
  title: string;
  detail: string;
  view: ViewId;
  /** id estável do card de destino */
  target: string;
}

const RANK = { alta: 0, media: 1, info: 2 } as const;

const cpmChangeText = (now: number | null, prev: number | null) => {
  if (now === null || !prev) return "";
  const ch = now / prev - 1;
  return Math.abs(ch) >= 0.1
    ? `O CPM ${ch > 0 ? "subiu" : "caiu"} ${pct(Math.abs(ch), 0)} no período: o leilão ${ch > 0 ? "encareceu" : "barateou"}.`
    : "O CPM ficou estável: a perda vem de conversão ou criativo, não de leilão.";
};

const listPt = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`);

export function buildInsights(ds: Dataset): Insight[] {
  const out: Insight[] = [];
  const per = periods(ds);
  const eco = channelEconomics(ds);
  const d = deltas(ds, per.last28, per.prev28);
  const cpiChange = (c: Channel) => d.find((x) => x.channel === c && x.metric === "cpi")?.change ?? null;

  // 1) Coleta -----------------------------------------------------------------------------------------
  const recon = reconcile(ds);
  const metaIos = recon.find((r) => r.check === "installs_platform_vs_mmp" && r.channel === "meta_ads" && r.platform === "ios");
  if (metaIos && metaIos.status === "broken") {
    const ch = cpiChange("meta_ads");
    // Estimativa: quantas instalações iOS o MMP "deveria" ter, dada a razão do período-base.
    const lost = metaIos.ratioBaseline ? Math.max(0, metaIos.a / metaIos.ratioBaseline - metaIos.b) : 0;
    const win14 = { from: addDays(ds.meta.refDate, -(CURRENT_DAYS - 1)), to: ds.meta.refDate };
    const meta14 = channelSummary(ds, win14).find((r) => r.channel === "meta_ads")!;
    const corrected = meta14.spend > 0 && meta14.installs + lost > 0 ? meta14.spend / (meta14.installs + lost) : null;
    out.push({
      id: "trk-meta-ios", severity: "alta", topic: "tracking", view: "tracking", target: "card-recon",
      title: "Meta iOS: o MMP está perdendo atribuição",
      detail: `A razão plataforma ÷ AppsFlyer passou de ${n2(metaIos.ratioBaseline ?? 0)} para ${n2(metaIos.ratioCurrent ?? 0)} (${spct(metaIos.deviation ?? 0)}). As instalações iOS não somem: viram "orgânico" no MMP.${ch !== null && corrected !== null && meta14.cpi !== null ? ` O CPI do Meta subiu ${spct(ch)} em 28 dias; nos últimos ${CURRENT_DAYS} dias ele aparece como ${brl(meta14.cpi)}, e estimo ${brl(corrected)} se as ~${Math.round(lost)} instalações perdidas fossem atribuídas (estimativa pela razão do período-base). Revisar o mapeamento de conversion values do SKAdNetwork.` : " Revisar o mapeamento de conversion values do SKAdNetwork."}`,
    });
  }
  const gSignups = recon.find((r) => r.check === "signups_platform_vs_mmp" && r.channel === "google_ads");
  const gBackendOk = recon.find((r) => r.check === "signups_backend_vs_mmp" && r.channel === "google_ads")?.status === "ok";
  if (gSignups && gSignups.status === "broken")
    out.push({
      id: "trk-google-signups", severity: "alta", topic: "tracking", view: "tracking", target: "card-recon",
      title: "Google Ads reporta quase o dobro dos cadastros",
      detail: `Plataforma ÷ MMP foi de ${n2(gSignups.ratioBaseline ?? 0)} para ${n2(gSignups.ratioCurrent ?? 0)} (${spct(gSignups.deviation ?? 0)})${gBackendOk ? ", enquanto a razão backend ÷ AppsFlyer ficou estável" : ""}. Padrão típico de conversão importada duas vezes (GA4 e AppsFlyer). O CPA que o Google mostra está subestimado e o algoritmo otimiza em cima de um sinal inflado.`,
    });
  const liUtm = recon.find((r) => r.check === "signups_backend_vs_mmp" && r.channel === "linkedin_ads");
  if (liUtm && liUtm.status === "broken") {
    const from = addDays(ds.meta.refDate, -(CURRENT_DAYS - 1));
    const byCamp = new Map<string, { n: number; miss: number }>();
    for (const u of ds.users) {
      if (u.channel !== "linkedin_ads" || !u.signup_date || u.install_date < from) continue;
      const c = byCamp.get(u.campaign_id) ?? { n: 0, miss: 0 };
      c.n++;
      if (u.utm_internal === "unattributed") c.miss++;
      byCamp.set(u.campaign_id, c);
    }
    const worst = [...byCamp.entries()].filter(([, v]) => v.n >= 10).sort((a, b) => b[1].miss / b[1].n - a[1].miss / a[1].n)[0];
    const name = worst ? ds.campaigns.find((c) => c.campaign_id === worst[0])?.name : null;
    out.push({
      id: "trk-linkedin-utm", severity: "media", topic: "tracking", view: "tracking", target: "card-recon",
      title: "LinkedIn: boa parte dos cadastros chega sem UTM no backend",
      detail: `A razão UTM do backend ÷ MMP caiu ${pct(Math.abs(liUtm.deviation ?? 0), 0)} frente ao período-base.${worst && name ? ` A campanha "${name}" concentra a perda: ${pct(worst[1].miss / worst[1].n, 0)} dos cadastros recentes sem utm_source.` : ""} URLs sem parâmetros deixam de ser atribuídas por qualquer relatório que dependa de UTM.`,
    });
  }
  for (const e of eventHealth(ds).filter((x) => x.status === "broken")) {
    out.push({
      id: `trk-event-${e.event}-${e.platform}`, severity: "alta", topic: "tracking", view: "tracking", target: "card-eventos",
      title:
        e.direction === "drop"
          ? `${e.event} parou de chegar${e.platform === "web" ? "" : ` no ${e.platform === "android" ? "Android" : "iOS"}`} desde ${e.onset ? dm(e.onset) : "—"}`
          : `${e.event} está duplicado desde ${e.onset ? dm(e.onset) : "—"}`,
      detail: `${e.cause ?? ""} ${e.impact ?? ""}`.trim(),
    });
  }

  // 2) Eficiência e canais ------------------------------------------------------------------------------
  const ranked = eco.filter((e) => e.roas90 !== null).sort((a, b) => (b.roas90 ?? 0) - (a.roas90 ?? 0));
  if (ranked.length >= 2) {
    const paying = ranked.filter((r) => (r.roas90 ?? 0) >= 1);
    const best = ranked[0]!;
    const worst = ranked[ranked.length - 1]!;
    out.push({
      id: "eff-roas-gap", severity: "alta", topic: "eficiencia", view: "canais", target: "card-economia",
      title: `${CHANNEL_LABEL[best.channel]} devolve ${n2(best.roas90!)}× em 90 dias; ${CHANNEL_LABEL[worst.channel]}, ${n2(worst.roas90!)}×`,
      detail: `Em coortes com 90 dias completos, ${paying.length === 0 ? "nenhum canal paga o próprio custo" : `só ${listPt(paying.map((r) => CHANNEL_LABEL[r.channel]))} ${paying.length > 1 ? "pagam" : "paga"} o próprio custo`} em 90 dias. O CPI sozinho esconde isso: o CPI do ${CHANNEL_LABEL[worst.channel]} é de ${brl(worst.cpi ?? 0)}, mas só ${pct(worst.activationRate ?? 0, 0)} das instalações usam o cartão.`,
    });
  }
  const shift = bestShift(ds, 0.2);
  if (shift)
    out.push({
      id: "eff-shift", severity: "media", topic: "eficiencia", view: "canais", target: "card-simulador",
      title: `Mover 20% de ${CHANNEL_LABEL[shift.from]} para ${CHANNEL_LABEL[shift.to]} rende ~${brl0(shift.valueDelta)} em LTV90`,
      detail: `Mesmo orçamento total (${brl0(shift.movedAmount)} realocados em 28 dias). Variação projetada: ${shift.installsDelta >= 0 ? "+" : "−"}${Math.abs(Math.round(shift.installsDelta))} instalações e ${shift.activatedDelta >= 0 ? "+" : "−"}${Math.abs(Math.round(shift.activatedDelta))} ativações. Projeção por curva de resposta; vale como hipótese a testar, não como certeza.`,
    });
  const cpmNow = new Map(channelSummary(ds, per.last28).map((r) => [r.channel, r.cpm]));
  const cpmPrev = new Map(channelSummary(ds, per.prev28).map((r) => [r.channel, r.cpm]));
  for (const c of eco) {
    const ch = cpiChange(c.channel);
    if (c.channel === "meta_ads" && metaIos?.status === "broken") continue; // já explicado pela coleta
    if (ch !== null && ch >= 0.1)
      out.push({
        id: `cpi-${c.channel}`, severity: "media", topic: "canais", view: "geral", target: "card-canais",
        title: `CPI do ${CHANNEL_LABEL[c.channel]} subiu ${spct(ch)} em 28 dias`,
        detail: `Gasto ${brl0(c.spend)} no período, CPI ${brl(c.cpi ?? 0)} (era ${brl((c.cpi ?? 0) / (1 + ch))}). ${recon.some((r) => r.channel === c.channel && r.status === "broken") ? "Há falha de coleta neste canal (ver Saúde da coleta): ler o CPI com cautela." : "Sem falha de coleta associada."} ${cpmChangeText(cpmNow.get(c.channel) ?? null, cpmPrev.get(c.channel) ?? null)} A próxima instalação custa ~${brl(c.marginalCpi ?? 0)} (CPI marginal pela curva de resposta).`,
      });
  }

  // 3) Testes -----------------------------------------------------------------------------------------------
  const tests = readTests(ds);
  const srm = tests.find((t) => t.verdict === "srm");
  if (srm)
    out.push({
      id: `test-${srm.testId}`, severity: "media", topic: "testes", view: "testes", target: "card-testes",
      title: `Teste ${srm.testId} (${srm.name.toLowerCase()}) não pode ser lido: SRM`,
      detail: srm.note,
    });
  const win = tests.find((t) => t.verdict === "winner_a" || t.verdict === "winner_b");
  if (win)
    out.push({
      id: `test-${win.testId}`, severity: "info", topic: "testes", view: "testes", target: "card-testes",
      title: `Teste ${win.testId}: variante ${win.verdict === "winner_b" ? "B" : "A"} ganha em ${win.channelLabel}`,
      detail: `${win.name}: ${spct(win.primary.lift ?? 0)} instalações por impressão. ${win.note}`,
    });

  // 4) Funil -------------------------------------------------------------------------------------------------
  const f = funnel(ds, per.full);
  const use = f.steps.find((s) => s.key === "activated");
  if (use && use.rate !== null)
    out.push({
      id: "funnel-use", severity: "info", topic: "funil", view: "funil", target: "card-funil",
      title: `${pct(use.rate, 0)} dos KYC aprovados usam o cartão em até 14 dias`,
      detail: `É a etapa que mais separa canais de qualidade (LinkedIn, Google) de canais de volume (TikTok, DV360). Custo por usuário ativado no total de mídia: ${brl0(use.costPer ?? 0)}.`,
    });

  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

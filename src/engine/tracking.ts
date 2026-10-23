// Saúde da coleta: reconciliação entre fontes (plataforma de mídia × MMP × backend) e
// monitoramento de eventos do tagbook (SDK/GA4 × referência).
//
// Princípio: nenhuma fonte é "a verdade". Cada razão entre duas fontes tem um nível normal (a plataforma
// sempre infla instalações vs. o MMP, por exemplo). O alerta é o desvio da razão atual em relação à
// razão do período-base, não o valor absoluto.

import { addDays } from "./calendar.ts";
import { CHANNELS } from "./types.ts";
import type { Channel, Dataset, EventName, Platform, TagbookEntry } from "./types.ts";

export const BASELINE_DAYS = 60;
export const CURRENT_DAYS = 14;
export const EVENT_CURRENT_DAYS = 7;

export type HealthStatus = "ok" | "warn" | "broken" | "low_volume";

export const WARN_DEV = 0.15;
export const BROKEN_DEV = 0.35;
export const MIN_VOLUME = 40;

export function statusFor(deviation: number | null, volume: number): HealthStatus {
  if (deviation === null || volume < MIN_VOLUME) return "low_volume";
  const d = Math.abs(deviation);
  return d >= BROKEN_DEV ? "broken" : d >= WARN_DEV ? "warn" : "ok";
}

interface Windows {
  baseFrom: string;
  baseTo: string;
  curFrom: string;
  curTo: string;
}

function windows(ds: Dataset, currentDays: number): Windows {
  return {
    baseFrom: ds.meta.startDate,
    baseTo: addDays(ds.meta.startDate, BASELINE_DAYS - 1),
    curFrom: addDays(ds.meta.refDate, -(currentDays - 1)),
    curTo: ds.meta.refDate,
  };
}

// Reconciliação entre fontes ----------------------------------------------------------------------------

export type ReconCheck = "installs_platform_vs_mmp" | "signups_platform_vs_mmp" | "signups_backend_vs_mmp";

export interface ReconRow {
  check: ReconCheck;
  channel: Channel;
  platform: Platform | "all";
  /** numerador e denominador no período atual */
  a: number;
  b: number;
  ratioBaseline: number | null;
  ratioCurrent: number | null;
  deviation: number | null;
  status: HealthStatus;
}

export const RECON_LABEL: Record<ReconCheck, { title: string; a: string; b: string }> = {
  installs_platform_vs_mmp: { title: "Instalações: plataforma ÷ MMP", a: "Plataforma de mídia", b: "AppsFlyer" },
  signups_platform_vs_mmp: { title: "Cadastros: plataforma ÷ MMP", a: "Plataforma de mídia", b: "AppsFlyer" },
  signups_backend_vs_mmp: { title: "Cadastros: UTM do backend ÷ MMP", a: "Backend (utm_source)", b: "AppsFlyer" },
};

interface Pair {
  a: number;
  b: number;
}
const zero = (): Pair => ({ a: 0, b: 0 });

export function reconcile(ds: Dataset): ReconRow[] {
  const w = windows(ds, CURRENT_DAYS);
  // chave: check|channel|platform → {base, cur}
  const base = new Map<string, Pair>();
  const cur = new Map<string, Pair>();
  const get = (m: Map<string, Pair>, k: string) => {
    let p = m.get(k);
    if (!p) m.set(k, (p = zero()));
    return p;
  };
  const bucket = (d: string): Map<string, Pair> | null =>
    d >= w.baseFrom && d <= w.baseTo ? base : d >= w.curFrom && d <= w.curTo ? cur : null;

  for (const r of ds.adSpend) {
    const m = bucket(r.date);
    if (!m) continue;
    get(m, `installs_platform_vs_mmp|${r.channel}|${r.platform}`).a += r.platform_installs;
    get(m, `signups_platform_vs_mmp|${r.channel}|all`).a += r.platform_signups;
  }
  for (const u of ds.users) {
    const m = bucket(u.install_date);
    if (!m) continue;
    if (u.channel !== "organic") {
      get(m, `installs_platform_vs_mmp|${u.channel}|${u.platform}`).b++;
      if (u.signup_date) {
        get(m, `signups_platform_vs_mmp|${u.channel}|all`).b++;
        get(m, `signups_backend_vs_mmp|${u.channel}|all`).b++;
      }
    }
    // Backend: o cadastro conta para o canal indicado pela UTM (mesmo que o MMP tenha atribuído a outro).
    if (u.signup_date && u.utm_internal && u.utm_internal !== "unattributed" && u.utm_internal !== "organic")
      get(m, `signups_backend_vs_mmp|${u.utm_internal}|all`).a++;
  }

  const rows: ReconRow[] = [];
  const add = (check: ReconCheck, channel: Channel, platform: Platform | "all") => {
    const k = `${check}|${channel}|${platform}`;
    const b0 = base.get(k) ?? zero();
    const c0 = cur.get(k) ?? zero();
    const rb = b0.b > 0 ? b0.a / b0.b : null;
    const rc = c0.b > 0 ? c0.a / c0.b : null;
    const deviation = rb && rc !== null ? rc / rb - 1 : null;
    rows.push({ check, channel, platform, a: c0.a, b: c0.b, ratioBaseline: rb, ratioCurrent: rc, deviation, status: statusFor(deviation, c0.b) });
  };
  for (const ch of CHANNELS) {
    add("installs_platform_vs_mmp", ch, "android");
    add("installs_platform_vs_mmp", ch, "ios");
    add("signups_platform_vs_mmp", ch, "all");
    add("signups_backend_vs_mmp", ch, "all");
  }
  return rows;
}

// Saúde dos eventos -----------------------------------------------------------------------------------------

export interface EventHealthRow {
  event: EventName;
  platform: Platform | "web";
  source: "af_sdk" | "ga4";
  owner: TagbookEntry["owner"];
  isConversion: boolean;
  reference: string;
  ratioBaseline: number | null;
  ratioCurrent: number | null;
  deviation: number | null;
  status: HealthStatus;
  /** primeiro dia do trecho contínuo, até hoje, com a razão fora da banda */
  onset: string | null;
  direction: "drop" | "spike" | null;
  cause: string | null;
  impact: string | null;
  /** razão diária (para gráfico) */
  daily: { date: string; ratio: number | null }[];
}

type SeriesMap = Map<string, number>; // `${date}` -> valor

const backendKind: Partial<Record<EventName, "install_date" | "signup_date" | "kyc_date" | "first_use_date">> = {
  first_open: "install_date",
  signup_completed: "signup_date",
  kyc_done: "kyc_date",
  card_first_use: "first_use_date",
};

function backendSeries(ds: Dataset, event: EventName, platform: Platform): SeriesMap {
  const col = backendKind[event]!;
  const m: SeriesMap = new Map();
  for (const u of ds.users) {
    if (u.platform !== platform) continue;
    const d = u[col];
    if (d) m.set(d, (m.get(d) ?? 0) + 1);
  }
  return m;
}

function eventSeries(ds: Dataset, event: EventName, platform: Platform | "web"): SeriesMap {
  const m: SeriesMap = new Map();
  for (const e of ds.events) if (e.event_name === event && e.platform === platform) m.set(e.date, e.event_count);
  return m;
}

function referenceSeries(ds: Dataset, event: EventName, platform: Platform | "web"): SeriesMap {
  if (event in backendKind) return backendSeries(ds, event, platform as Platform);
  if (event === "page_view") {
    const m: SeriesMap = new Map();
    for (const r of ds.adSpend) m.set(r.date, (m.get(r.date) ?? 0) + r.clicks);
    return m;
  }
  if (event === "cta_click") return eventSeries(ds, "page_view", "web");
  return eventSeries(ds, "cta_click", "web");
}

const sumWindow = (s: SeriesMap, from: string, to: string) => {
  let t = 0;
  for (const [d, v] of s) if (d >= from && d <= to) t += v;
  return t;
};

const CAUSES: Record<string, { cause: string; impact: string }> = {
  "kyc_done|android|drop": {
    cause: "Queda abrupta só no Android, sem queda no backend: o evento deixou de ser enviado pelo SDK. Cruzar a data de início com a versão do app publicada nesse dia (regressão de instrumentação) e conferir o mapeamento do evento no AppsFlyer.",
    impact: "O funil do MMP mostra KYC e ativação artificialmente baixos no Android; campanhas otimizadas por kyc_done aprendem com sinal quebrado.",
  },
  "form_submit|web|spike": {
    cause: "Contagem dobrou sem aumento de cliques: gatilho do GTM disparando duas vezes (ex.: Form Submission e Click na mesma tag) depois de uma publicação do contêiner. Revisar as versões publicadas do GTM na data de início.",
    impact: "Conversões de formulário infladas no GA4 e nas plataformas que importam essa conversão (Google Ads, LinkedIn): CPA parece melhor do que é.",
  },
};

function causeFor(event: EventName, platform: Platform | "web", direction: "drop" | "spike") {
  return (
    CAUSES[`${event}|${platform}|${direction}`] ?? {
      cause:
        direction === "drop"
          ? "Queda da razão em relação ao período-base: verificar disparo do evento, versão do app/contêiner e filtros da propriedade."
          : "Alta da razão em relação ao período-base: verificar disparo duplicado, bots ou mudança de definição do evento.",
      impact: "Métricas derivadas deste evento ficam enviesadas até a correção.",
    }
  );
}

export function eventHealth(ds: Dataset): EventHealthRow[] {
  const w = windows(ds, EVENT_CURRENT_DAYS);
  const out: EventHealthRow[] = [];
  for (const t of ds.tagbook) {
    for (const platform of t.platforms) {
      const ev = eventSeries(ds, t.event_name, platform);
      const ref = referenceSeries(ds, t.event_name, platform);
      const rb = sumWindow(ref, w.baseFrom, w.baseTo);
      const rc = sumWindow(ref, w.curFrom, w.curTo);
      const ratioBaseline = rb > 0 ? sumWindow(ev, w.baseFrom, w.baseTo) / rb : null;
      const ratioCurrent = rc > 0 ? sumWindow(ev, w.curFrom, w.curTo) / rc : null;
      const deviation = ratioBaseline && ratioCurrent !== null ? ratioCurrent / ratioBaseline - 1 : null;
      const status = statusFor(deviation, rc);

      const daily = ds.dates.map((date) => {
        const r = ref.get(date) ?? 0;
        return { date, ratio: r > 0 ? (ev.get(date) ?? 0) / r : null };
      });

      // Início do trecho contínuo (até a data de referência) com razão diária fora da banda de 30%.
      let onset: string | null = null;
      let direction: "drop" | "spike" | null = null;
      if (ratioBaseline && (status === "broken" || status === "warn")) {
        direction = (deviation ?? 0) < 0 ? "drop" : "spike";
        for (let i = daily.length - 1; i >= 0; i--) {
          const r = daily[i]!.ratio;
          const dev = r === null ? null : r / ratioBaseline - 1;
          const out30 = dev !== null && (direction === "drop" ? dev <= -0.3 : dev >= 0.3);
          if (!out30) break;
          onset = daily[i]!.date;
        }
      }
      const c = direction && status === "broken" ? causeFor(t.event_name, platform, direction) : null;
      out.push({
        event: t.event_name, platform, source: t.platforms[0] === "web" ? "ga4" : "af_sdk",
        owner: t.owner, isConversion: t.is_conversion, reference: t.reference,
        ratioBaseline, ratioCurrent, deviation, status, onset, direction,
        cause: c?.cause ?? null, impact: c?.impact ?? null, daily,
      });
    }
  }
  return out;
}

export interface TrackingSummary {
  recon: ReconRow[];
  events: EventHealthRow[];
  broken: number;
  warn: number;
  checks: number;
}

export function trackingSummary(ds: Dataset): TrackingSummary {
  const recon = reconcile(ds);
  const events = eventHealth(ds);
  const all = [...recon.map((r) => r.status), ...events.map((e) => e.status)];
  return {
    recon, events,
    broken: all.filter((s) => s === "broken").length,
    warn: all.filter((s) => s === "warn").length,
    checks: all.length,
  };
}

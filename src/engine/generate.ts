// Gerador determinístico do dataset sintético da "Fluxo" (fintech fictícia: conta digital + cartão).
// Mesmo seed => mesmo dataset, sempre. Nenhum dado real.
//
// Estrutura: gasto por canal/dia -> instalações por curva de resposta (retorno decrescente) ->
// usuários com funil (cadastro, KYC, primeiro uso do cartão) e receita D30/D90 -> eventos de coleta.
// Cinco defeitos de tracking são injetados de propósito (ver DEFECTS) para o painel de saúde da coleta
// ter o que encontrar.

import { clamp, createRng } from "./rng.ts";
import type { Rng } from "./rng.ts";
import { addDays, dateList, dow } from "./calendar.ts";
import type {
  AdSpendRow,
  Campaign,
  Channel,
  Dataset,
  EventDailyRow,
  ExperimentRow,
  Platform,
  TagbookEntry,
  UserChannel,
  UserRow,
} from "./types.ts";

export const SEED = 20261022;
export const START_DATE = "2026-05-04";
export const REF_DATE = "2026-09-30";
export const DAYS = 150;
/** Dias que uma coorte precisa ter para o funil de ativação ser considerado maduro. */
export const MATURITY_DAYS = 14;

/** Defeitos de coleta injetados (documentados no README e conferidos nos testes). */
export const DEFECTS = {
  metaIosAttributionLoss: { from: "2026-08-24", lossShare: 0.38 },
  kycDoneAndroidSdk: { from: "2026-09-08", capture: 0.04 },
  ga4FormSubmitDuplicate: { from: "2026-08-12", factor: 2 },
  googleSignupDoubleCount: { from: "2026-08-01", factor: 1.9 },
  linkedinUtmLoss: { from: "2026-07-20", campaign: "li_pj_cartao", missShare: 0.9 },
} as const;

interface CampaignCfg {
  id: string;
  name: string;
  objective: Campaign["objective"];
  w: number; // fatia do gasto do canal
  eff: number; // eficiência relativa (instalações por real)
}

interface ChannelCfg {
  id: Channel;
  baseSpend: number;
  spendSd: number;
  beta: number; // elasticidade da curva instalações = A * gasto^beta
  cpi0: number; // CPI de referência no gasto base
  iosShare: number;
  cpm: number;
  ctr: number;
  platformOver: Record<Platform, number>; // quanto a plataforma "infla" instalações vs. a verdade
  signupOver: number;
  signupRate: number;
  kycRate: number;
  actRate: number;
  rev30: number;
  missUtm: number;
  campaigns: CampaignCfg[];
}

const CFG: ChannelCfg[] = [
  {
    id: "google_ads", baseSpend: 1000, spendSd: 0.18, beta: 0.85, cpi0: 10.5, iosShare: 0.35, cpm: 65, ctr: 0.031,
    platformOver: { android: 1.06, ios: 1.1 }, signupOver: 1.05, signupRate: 0.62, kycRate: 0.78, actRate: 0.58, rev30: 40, missUtm: 0.04,
    campaigns: [
      { id: "ggl_uac_install", name: "UAC · Instalação de app", objective: "install", w: 0.5, eff: 1.0 },
      { id: "ggl_search_brand", name: "Search · Marca", objective: "search", w: 0.2, eff: 1.5 },
      { id: "ggl_search_generic", name: "Search · Conta e cartão", objective: "search", w: 0.3, eff: 0.75 },
    ],
  },
  {
    id: "meta_ads", baseSpend: 1150, spendSd: 0.2, beta: 0.78, cpi0: 8.6, iosShare: 0.45, cpm: 18, ctr: 0.012,
    platformOver: { android: 1.22, ios: 1.18 }, signupOver: 1.15, signupRate: 0.55, kycRate: 0.74, actRate: 0.5, rev30: 32, missUtm: 0.06,
    campaigns: [
      { id: "meta_adv_cartao", name: "Advantage+ · Cartão", objective: "install", w: 0.45, eff: 1.05 },
      { id: "meta_prospect_lal", name: "Prospecção · Lookalike", objective: "prospecting", w: 0.35, eff: 0.9 },
      { id: "meta_retarg", name: "Retargeting · Cadastro incompleto", objective: "retargeting", w: 0.2, eff: 1.25 },
    ],
  },
  {
    id: "tiktok_ads", baseSpend: 650, spendSd: 0.22, beta: 0.62, cpi0: 6.4, iosShare: 0.3, cpm: 9, ctr: 0.009,
    platformOver: { android: 1.3, ios: 1.25 }, signupOver: 1.2, signupRate: 0.42, kycRate: 0.62, actRate: 0.38, rev30: 19, missUtm: 0.08,
    campaigns: [
      { id: "tt_spark", name: "Spark Ads · Creators", objective: "video", w: 0.6, eff: 1.0 },
      { id: "tt_topview", name: "TopView · Lançamento", objective: "video", w: 0.4, eff: 0.85 },
    ],
  },
  {
    id: "linkedin_ads", baseSpend: 220, spendSd: 0.25, beta: 0.9, cpi0: 44, iosShare: 0.55, cpm: 55, ctr: 0.006,
    platformOver: { android: 1.1, ios: 1.12 }, signupOver: 1.1, signupRate: 0.66, kycRate: 0.85, actRate: 0.62, rev30: 98, missUtm: 0.05,
    campaigns: [
      { id: "li_pj_conta", name: "Conta PJ · Sócios", objective: "lead_gen", w: 0.55, eff: 1.0 },
      { id: "li_pj_cartao", name: "Cartão PJ · Financeiro", objective: "lead_gen", w: 0.45, eff: 0.95 },
    ],
  },
  {
    id: "dv360", baseSpend: 400, spendSd: 0.2, beta: 0.55, cpi0: 13.5, iosShare: 0.4, cpm: 14, ctr: 0.0007,
    platformOver: { android: 1.9, ios: 1.7 }, signupOver: 1.6, signupRate: 0.5, kycRate: 0.68, actRate: 0.3, rev30: 27, missUtm: 0.45,
    campaigns: [
      { id: "dv_display", name: "Programática · Display", objective: "prospecting", w: 0.55, eff: 0.9 },
      { id: "dv_video", name: "YouTube · Vídeo curto", objective: "video", w: 0.45, eff: 1.1 },
    ],
  },
];

export const CHANNEL_CFG = CFG;

const DOW_INSTALL = [0.92, 1.02, 1.05, 1.04, 1.02, 0.98, 0.9];
const DOW_SPEND = [0.95, 1.02, 1.03, 1.02, 1.01, 0.99, 0.95];
const IOS_EFF = 0.85;
const ANDROID_EFF = 1.12;

const lognormal = (rng: Rng, mean: number, sd: number) => {
  const mu = Math.log(mean) - (sd * sd) / 2;
  return Math.exp(mu + sd * rng.normal(0, 1));
};

export const TAGBOOK: TagbookEntry[] = [
  {
    event_name: "first_open", area: "app", platforms: ["android", "ios"],
    trigger: "Primeira abertura do app após a instalação", params: ["install_time", "af_status", "media_source", "campaign"],
    is_conversion: true, destinations: ["AppsFlyer", "GA4", "Meta", "Google Ads", "TikTok"], owner: "Mídia",
    reference: "Backend: usuários por data de instalação",
  },
  {
    event_name: "signup_completed", area: "app", platforms: ["android", "ios"],
    trigger: "Conta criada com sucesso (resposta 201 do backend)", params: ["user_id_hash", "method", "media_source"],
    is_conversion: true, destinations: ["AppsFlyer", "GA4", "Meta", "Google Ads", "TikTok"], owner: "Produto",
    reference: "Backend: cadastros por data",
  },
  {
    event_name: "kyc_done", area: "app", platforms: ["android", "ios"],
    trigger: "Verificação de identidade aprovada", params: ["user_id_hash", "kyc_level", "duration_s"],
    is_conversion: true, destinations: ["AppsFlyer", "GA4"], owner: "Engenharia",
    reference: "Backend: KYC aprovados por data",
  },
  {
    event_name: "card_first_use", area: "app", platforms: ["android", "ios"],
    trigger: "Primeira compra aprovada com o cartão", params: ["user_id_hash", "value", "currency", "mcc"],
    is_conversion: true, destinations: ["AppsFlyer", "GA4", "Meta", "Google Ads", "TikTok"], owner: "Produto",
    reference: "Backend: primeiros usos por data",
  },
  {
    event_name: "page_view", area: "web", platforms: ["web"],
    trigger: "Carregamento de página das landing pages (GTM · All Pages)", params: ["page_location", "utm_source", "utm_medium", "utm_campaign"],
    is_conversion: false, destinations: ["GA4"], owner: "Mídia",
    reference: "Cliques pagos reportados pelas plataformas",
  },
  {
    event_name: "cta_click", area: "web", platforms: ["web"],
    trigger: "Clique no botão de download / abrir conta (GTM · Click)", params: ["cta_id", "store", "utm_campaign"],
    is_conversion: false, destinations: ["GA4"], owner: "Mídia",
    reference: "Eventos page_view",
  },
  {
    event_name: "form_submit", area: "web", platforms: ["web"],
    trigger: "Envio do formulário de interesse PJ (GTM · Form Submit)", params: ["form_id", "utm_source", "utm_campaign"],
    is_conversion: true, destinations: ["GA4", "Google Ads", "LinkedIn"], owner: "Mídia",
    reference: "Eventos cta_click",
  },
];

function normalCount(rng: Rng, expected: number, relSd: number): number {
  return Math.max(0, Math.round(expected * (1 + rng.normal(0, relSd))));
}

export function generateDataset(seed: number = SEED): Dataset {
  const rng = createRng(seed);
  const dates = dateList(START_DATE, DAYS);
  const matured30 = addDays(REF_DATE, -30);
  const matured90 = addDays(REF_DATE, -90);

  const campaigns: Campaign[] = CFG.flatMap((c) =>
    c.campaigns.map((k) => ({ campaign_id: k.id, channel: c.id, name: k.name, objective: k.objective })),
  );
  const adSpend: AdSpendRow[] = [];
  const users: UserRow[] = [];
  const cellSignups = new Map<string, number>();
  let uid = 1;

  const makeUser = (
    installDate: string,
    attributed: UserChannel,
    trueChannel: UserChannel,
    campaignId: string,
    platform: Platform,
    rates: { signup: number; kyc: number; act: number; rev30: number; missUtm: number },
  ): UserRow => {
    const ios = platform === "ios";
    let signup: string | null = null;
    let kyc: string | null = null;
    let firstUse: string | null = null;
    if (rng.chance(clamp(rates.signup * (ios ? 1.04 : 0.96), 0, 0.97))) {
      const r = rng.next();
      signup = addDays(installDate, r < 0.72 ? 0 : r < 0.9 ? 1 : r < 0.97 ? 2 : 3);
      if (rng.chance(rates.kyc)) {
        const r2 = rng.next();
        kyc = addDays(signup, r2 < 0.6 ? 0 : r2 < 0.85 ? 1 : 2);
        if (rng.chance(rates.act)) {
          const lag = 1 + Math.min(20, Math.floor(-Math.log(1 - rng.next()) / 0.35));
          firstUse = addDays(kyc, lag);
        }
      }
    }
    // Censura à direita: o que ainda não aconteceu na data de referência fica NULL.
    if (signup && signup > REF_DATE) signup = null;
    if (kyc && (kyc > REF_DATE || !signup)) kyc = null;
    if (firstUse && (firstUse > REF_DATE || !kyc)) firstUse = null;

    const latent30 = firstUse ? lognormal(rng, rates.rev30, 0.55) : 0;
    const latent90 = latent30 * (1.5 + 0.9 * rng.next());
    const rev30 = installDate <= matured30 ? Math.round(latent30 * 100) / 100 : null;
    const rev90 = installDate <= matured90 ? Math.round(latent90 * 100) / 100 : null;

    let utm: string | null = null;
    if (signup) {
      let miss = rates.missUtm;
      if (
        trueChannel === "linkedin_ads" &&
        campaignId === DEFECTS.linkedinUtmLoss.campaign &&
        signup >= DEFECTS.linkedinUtmLoss.from
      )
        miss = DEFECTS.linkedinUtmLoss.missShare;
      utm = rng.chance(miss) ? "unattributed" : trueChannel;
    }
    return {
      user_id: uid++,
      install_date: installDate,
      channel: attributed,
      campaign_id: attributed === "organic" ? "organic" : campaignId,
      platform,
      signup_date: signup,
      kyc_date: kyc,
      first_use_date: firstUse,
      rev_d30: rev30,
      rev_d90: rev90,
      utm_internal: utm,
    };
  };

  dates.forEach((date, i) => {
    const wd = dow(date);
    for (const ch of CFG) {
      // Gasto do canal no dia (orçamento com ritmo irregular: pausas e escalas ocasionais).
      let spend = ch.baseSpend * DOW_SPEND[wd]! * lognormal(rng, 1, ch.spendSd);
      const u = rng.next();
      if (u < 0.03) spend *= 0.3;
      else if (u > 0.96) spend *= 1.6;

      // Eficiência no tempo: TikTok perde eficiência nas últimas semanas (CPM sobe ~38%).
      let eff = 1;
      let cpmMult = 1;
      if (ch.id === "tiktok_ads") {
        const t = clamp((i - 115) / 34, 0, 1);
        eff = 1 / (1 + 0.38 * t);
        cpmMult = 1 + 0.38 * t;
      }
      if (ch.id === "google_ads") eff = 1 + 0.0003 * i;

      const A = ch.baseSpend / ch.cpi0 / Math.pow(ch.baseSpend, ch.beta);
      const installsTotal = A * Math.pow(spend, ch.beta) * DOW_INSTALL[wd]! * eff * lognormal(rng, 1, 0.08);

      // Divisão em células campanha × plataforma.
      const cells: { k: CampaignCfg; p: Platform; sw: number; iw: number }[] = [];
      for (const k of ch.campaigns)
        for (const p of ["android", "ios"] as const) {
          const ps = p === "ios" ? ch.iosShare : 1 - ch.iosShare;
          cells.push({ k, p, sw: k.w * ps, iw: k.w * k.eff * ps * (p === "ios" ? IOS_EFF : ANDROID_EFF) });
        }
      const iwSum = cells.reduce((a, c) => a + c.iw, 0);

      for (const cell of cells) {
        const cellSpend = Math.round(spend * cell.sw * lognormal(rng, 1, 0.12) * 100) / 100;
        const n = Math.max(0, Math.round((installsTotal * cell.iw) / iwSum * lognormal(rng, 1, 0.1)));
        const imps = Math.max(1, Math.round(((cellSpend / (ch.cpm * cpmMult)) * 1000) * lognormal(rng, 1, 0.04)));
        const clicks = Math.max(0, Math.round(imps * ch.ctr * lognormal(rng, 1, 0.05)));

        let signups = 0;
        for (let j = 0; j < n; j++) {
          const lost =
            ch.id === "meta_ads" &&
            cell.p === "ios" &&
            date >= DEFECTS.metaIosAttributionLoss.from &&
            rng.chance(DEFECTS.metaIosAttributionLoss.lossShare);
          const user = makeUser(date, lost ? "organic" : ch.id, ch.id, cell.k.id, cell.p, {
            signup: ch.signupRate, kyc: ch.kycRate, act: ch.actRate, rev30: ch.rev30, missUtm: ch.missUtm,
          });
          if (user.signup_date) signups++;
          users.push(user);
        }
        cellSignups.set(`${date}|${cell.k.id}|${cell.p}`, signups);

        const signupOver =
          ch.id === "google_ads" && date >= DEFECTS.googleSignupDoubleCount.from
            ? ch.signupOver * DEFECTS.googleSignupDoubleCount.factor
            : ch.signupOver;
        adSpend.push({
          date, channel: ch.id, campaign_id: cell.k.id, platform: cell.p,
          impressions: imps, clicks, spend: cellSpend,
          platform_installs: Math.round(n * ch.platformOver[cell.p] * lognormal(rng, 1, 0.05)),
          platform_signups: Math.round(signups * signupOver * lognormal(rng, 1, 0.06)),
        });
      }
    }

    // Orgânico (inclui halo): base estável + ruído.
    const organic = Math.round(55 * DOW_INSTALL[wd]! * lognormal(rng, 1, 0.1));
    for (let j = 0; j < organic; j++) {
      const p: Platform = rng.chance(0.55) ? "android" : "ios";
      users.push(makeUser(date, "organic", "organic", "organic", p, { signup: 0.68, kyc: 0.8, act: 0.62, rev30: 55, missUtm: 0.15 }));
    }
  });

  // Eventos de coleta ---------------------------------------------------------------------------
  const events: EventDailyRow[] = [];
  const backend = new Map<string, number>();
  const bump = (kind: string, d: string | null, p: Platform) => {
    if (!d) return;
    const key = `${kind}|${d}|${p}`;
    backend.set(key, (backend.get(key) ?? 0) + 1);
  };
  for (const u of users) {
    bump("first_open", u.install_date, u.platform);
    bump("signup_completed", u.signup_date, u.platform);
    bump("kyc_done", u.kyc_date, u.platform);
    bump("card_first_use", u.first_use_date, u.platform);
  }
  const clicksByDay = new Map<string, number>();
  for (const r of adSpend) clicksByDay.set(r.date, (clicksByDay.get(r.date) ?? 0) + r.clicks);

  for (const date of dates) {
    for (const p of ["android", "ios"] as const)
      for (const ev of ["first_open", "signup_completed", "kyc_done", "card_first_use"] as const) {
        let capture = 0.97;
        if (ev === "kyc_done" && p === "android" && date >= DEFECTS.kycDoneAndroidSdk.from)
          capture = DEFECTS.kycDoneAndroidSdk.capture;
        const truth = backend.get(`${ev}|${date}|${p}`) ?? 0;
        events.push({ date, event_name: ev, platform: p, source: "af_sdk", event_count: normalCount(rng, truth * capture, 0.02) });
      }
    const pv = normalCount(rng, (clicksByDay.get(date) ?? 0) * 0.62, 0.05);
    const cta = normalCount(rng, pv * 0.14, 0.06);
    const dup = date >= DEFECTS.ga4FormSubmitDuplicate.from ? DEFECTS.ga4FormSubmitDuplicate.factor : 1;
    const form = normalCount(rng, cta * 0.36 * dup, 0.07);
    events.push({ date, event_name: "page_view", platform: "web", source: "ga4", event_count: pv });
    events.push({ date, event_name: "cta_click", platform: "web", source: "ga4", event_count: cta });
    events.push({ date, event_name: "form_submit", platform: "web", source: "ga4", event_count: form });
  }

  // Experimentos A/B -------------------------------------------------------------------------------
  const experiments: ExperimentRow[] = [];
  const exp = (
    test_id: string, channel: Channel, test_type: ExperimentRow["test_type"], name: string,
    start_date: string, end_date: string,
    a: { imp: number; ctr: number; cvr: number }, b: { imp: number; ctr: number; cvr: number },
  ) => {
    (["A", "B"] as const).forEach((v) => {
      const s = v === "A" ? a : b;
      const clicks = Math.round(s.imp * s.ctr * lognormal(rng, 1, 0.015));
      const installs = Math.round(clicks * s.cvr * lognormal(rng, 1, 0.015));
      experiments.push({ test_id, channel, test_type, name, variant: v, start_date, end_date, impressions: s.imp, clicks, installs });
    });
  };
  exp("T1", "meta_ads", "creative", "Vídeo 15s vs. carrossel de benefícios", "2026-08-03", "2026-08-23",
    { imp: 181000, ctr: 0.0115, cvr: 0.17 }, { imp: 181000, ctr: 0.0138, cvr: 0.17 });
  exp("T2", "tiktok_ads", "creative", "Creator UGC vs. Spark Ad de marca", "2026-09-14", "2026-09-27",
    { imp: 40500, ctr: 0.008, cvr: 0.15 }, { imp: 40500, ctr: 0.0086, cvr: 0.17 });
  exp("T3", "google_ads", "audience", "Públicos similares vs. intenção de compra", "2026-07-06", "2026-07-26",
    { imp: 90500, ctr: 0.031, cvr: 0.2 }, { imp: 90500, ctr: 0.0312, cvr: 0.2 });
  exp("T4", "linkedin_ads", "audience", "Segmentação por cargo vs. por setor", "2026-08-10", "2026-09-20",
    { imp: 25000, ctr: 0.0062, cvr: 0.2 }, { imp: 25000, ctr: 0.0064, cvr: 0.31 });
  exp("T5", "meta_ads", "bid", "Menor custo vs. cost cap", "2026-09-01", "2026-09-21",
    { imp: 120000, ctr: 0.012, cvr: 0.15 }, { imp: 150000, ctr: 0.012, cvr: 0.19 });
  exp("T6", "dv360", "creative", "Vídeo 6s vs. 15s", "2026-07-20", "2026-08-09",
    { imp: 159000, ctr: 0.0007, cvr: 1.4 }, { imp: 159000, ctr: 0.0007, cvr: 1.45 });

  return {
    meta: { brand: "Fluxo", seed, refDate: REF_DATE, startDate: START_DATE, days: DAYS, maturityDays: MATURITY_DAYS },
    dates,
    campaigns,
    adSpend,
    users,
    events,
    experiments,
    tagbook: TAGBOOK,
  };
}

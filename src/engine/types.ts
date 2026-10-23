// Tipos do dataset sintético "Fluxo" (fintech fictícia: conta digital + cartão).
// Todas as datas são strings ISO (YYYY-MM-DD) para que o mesmo dado funcione em TS e em SQL.

export type Channel = "google_ads" | "meta_ads" | "tiktok_ads" | "linkedin_ads" | "dv360";
export type UserChannel = Channel | "organic";
export type Platform = "android" | "ios";

export const CHANNELS: readonly Channel[] = ["google_ads", "meta_ads", "tiktok_ads", "linkedin_ads", "dv360"];
export const PLATFORMS: readonly Platform[] = ["android", "ios"];

export const CHANNEL_LABEL: Record<UserChannel, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  tiktok_ads: "TikTok Ads",
  linkedin_ads: "LinkedIn Ads",
  dv360: "DV360",
  organic: "Orgânico",
};

export interface DateRange {
  from: string; // inclusivo
  to: string; // inclusivo
}

export interface Campaign {
  campaign_id: string;
  channel: Channel;
  name: string;
  objective: "install" | "search" | "prospecting" | "retargeting" | "video" | "lead_gen";
}

/** Uma linha por campanha × plataforma × dia, como no export de uma plataforma de mídia. */
export interface AdSpendRow {
  date: string;
  channel: Channel;
  campaign_id: string;
  platform: Platform;
  impressions: number;
  clicks: number;
  spend: number;
  /** Instalações que a própria plataforma reporta (inclui view-through e modelagem). */
  platform_installs: number;
  /** Conversões de cadastro que a plataforma reporta. */
  platform_signups: number;
}

/** Uma linha por usuário (backend + atribuição do MMP). */
export interface UserRow {
  user_id: number;
  install_date: string;
  /** Canal atribuído pelo MMP (AppsFlyer). */
  channel: UserChannel;
  campaign_id: string;
  platform: Platform;
  signup_date: string | null;
  kyc_date: string | null;
  first_use_date: string | null;
  /** Receita acumulada em 30/90 dias. NULL = coorte ainda não completou a janela. */
  rev_d30: number | null;
  rev_d90: number | null;
  /** utm_source capturado pelo backend no cadastro. 'unattributed' = sem UTM. NULL = não cadastrou. */
  utm_internal: string | null;
}

export type EventName =
  | "first_open"
  | "signup_completed"
  | "kyc_done"
  | "card_first_use"
  | "page_view"
  | "cta_click"
  | "form_submit";

export interface EventDailyRow {
  date: string;
  event_name: EventName;
  platform: Platform | "web";
  source: "af_sdk" | "ga4";
  event_count: number;
}

export interface ExperimentRow {
  test_id: string;
  channel: Channel;
  test_type: "creative" | "audience" | "bid";
  name: string;
  variant: "A" | "B";
  start_date: string;
  end_date: string;
  impressions: number;
  clicks: number;
  installs: number;
}

export interface TagbookEntry {
  event_name: EventName;
  area: "app" | "web";
  platforms: readonly (Platform | "web")[];
  trigger: string;
  params: readonly string[];
  is_conversion: boolean;
  destinations: readonly string[];
  owner: "Mídia" | "Produto" | "Engenharia";
  /** O que o evento é comparado para saber se a coleta está correta. */
  reference: string;
}

export interface Dataset {
  meta: { brand: string; seed: number; refDate: string; startDate: string; days: number; maturityDays: number };
  dates: string[];
  campaigns: Campaign[];
  adSpend: AdSpendRow[];
  users: UserRow[];
  events: EventDailyRow[];
  experiments: ExperimentRow[];
  tagbook: TagbookEntry[];
}

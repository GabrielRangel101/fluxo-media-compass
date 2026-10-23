// Tipos do domínio. Só sintaxe "apagável" (sem enums) para rodar direto no Node e no Vite.

export const CHANNELS = [
  "Orgânico",
  "Newsletter",
  "Mídia paga (Meta)",
  "Mídia paga (Google)",
  "Social orgânico",
  "Parcerias",
  "Direto",
] as const;
export type Channel = (typeof CHANNELS)[number];

export const TOUCHPOINTS = [
  "Paywall de matéria",
  "Botão do header",
  "Pop-up de oferta",
  "CTA de newsletter",
  "Landing de campanha",
] as const;
export type Touchpoint = (typeof TOUCHPOINTS)[number];

export const PLANS = ["Mensal", "Anual", "Combo Streaming", "Estudante"] as const;
export type Plan = (typeof PLANS)[number];

export const EDITORIAS = ["Política", "Esportes", "Economia", "Regional", "Cultura", "Variedades"] as const;
export type Editoria = (typeof EDITORIAS)[number];

export const CANCEL_REASONS = [
  "Preço",
  "Fim da promoção",
  "Pouco uso",
  "Conteúdo não atende",
  "Concorrente",
  "Falha de pagamento",
  "Não renovou",
  "Outros",
] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

export type Nature = "Voluntário" | "Involuntário" | "Fim de contrato";

export type Campaign = "Black Friday" | "Copa 2026" | "Eleições 2026";

/** Assinante ativo nos meses [startMonth, endMonth). endMonth = null → ainda ativo. */
export interface Subscriber {
  id: number;
  name: string;
  avatarSeed: string;
  startMonth: number;
  endMonth: number | null;
  channel: Channel;
  touchpoint: Touchpoint;
  plan: Plan;
  /** Upgrade (ex.: Mensal → Anual) */
  upgradeMonth: number | null;
  planAfter: Plan | null;
  promoDiscount: number; // 0..1
  promoMonths: number;
  engagement: number; // 0..100
  interest: Editoria;
  cancelReason: CancelReason | null;
  nature: Nature | null;
  npsScore: number; // 0..10
  npsRespondent: boolean;
  campaign: Campaign | null;
}

export interface EventMarker {
  month: number;
  label: string;
  kind: "campanha" | "preço" | "evento";
  description: string;
}

export interface DatasetMeta {
  brand: string;
  /** Índice 0 = primeiro mês observado */
  months: number;
  firstMonthLabel: string;
  lastMonthLabel: string;
  events: EventMarker[];
  /** Meta de assinantes ativos ao fim do horizonte de projeção */
  goalActive: number;
  goalMonth: number;
  churnTarget: number; // meta de churn mensal (fração)
  seed: number;
}

export interface Dataset {
  meta: DatasetMeta;
  subscribers: Subscriber[];
}

// Google Ads: busca de marca × restante. A busca de marca capta demanda que já existia e satura rápido;
// misturada com UAC e busca genérica, ela infla o ROAS e a curva de resposta do canal.

import { fitCurves } from "./allocation.ts";
import { maturity, periods } from "./metrics.ts";
import type { Dataset, DateRange } from "./types.ts";

export const BRAND_CAMPAIGN = "ggl_search_brand";

export interface BrandGroup {
  key: "marca" | "sem_marca";
  label: string;
  spend28: number;
  spendShare: number;
  installs28: number;
  cpi: number | null;
  /** CAC das coortes dos 28 dias que completaram D14 */
  cac: number | null;
  roas90: number | null;
  /** instalações dos 28 dias atribuídas à marca + custo marginal pela curva do grupo */
  beta: number;
  r2: number;
  marginalCpi: number | null;
}

function group(ds: Dataset, brand: boolean): Omit<BrandGroup, "spendShare" | "key" | "label"> {
  const per = periods(ds);
  const mat = maturity(ds);
  const inGroup = (c: string) => (c === BRAND_CAMPAIGN) === brand;
  const within = (d: string, r: DateRange) => d >= r.from && d <= r.to;
  let spend28 = 0, spendC14 = 0, spend90 = 0;
  for (const r of ds.adSpend) {
    if (r.channel !== "google_ads" || !inGroup(r.campaign_id)) continue;
    if (within(r.date, per.last28)) spend28 += r.spend;
    if (within(r.date, per.cohort14)) spendC14 += r.spend;
    if (within(r.date, per.mature90) && r.date <= mat.d90) spend90 += r.spend;
  }
  let installs28 = 0, act14 = 0, rev90 = 0;
  for (const u of ds.users) {
    if (u.channel !== "google_ads" || !inGroup(u.campaign_id)) continue;
    if (within(u.install_date, per.last28)) installs28++;
    if (within(u.install_date, per.cohort14) && u.first_use_date) act14++;
    if (within(u.install_date, per.mature90) && u.rev_d90 !== null) rev90 += u.rev_d90;
  }
  const sub: Dataset = {
    ...ds,
    adSpend: ds.adSpend.filter((r) => r.channel !== "google_ads" || inGroup(r.campaign_id)),
    users: ds.users.filter((u) => u.channel !== "google_ads" || inGroup(u.campaign_id)),
  };
  const curve = fitCurves(sub).find((c) => c.channel === "google_ads")!;
  const cpi = installs28 > 0 ? spend28 / installs28 : null;
  return {
    spend28, installs28, cpi,
    cac: act14 > 0 ? spendC14 / act14 : null,
    roas90: spend90 > 0 ? rev90 / spend90 : null,
    beta: curve.beta, r2: curve.r2,
    marginalCpi: cpi !== null && curve.beta > 0 ? cpi / curve.beta : null,
  };
}

export function googleBrandSplit(ds: Dataset): BrandGroup[] {
  const m = group(ds, true), n = group(ds, false);
  const total = m.spend28 + n.spend28;
  return [
    { key: "marca", label: "Busca de marca", spendShare: total > 0 ? m.spend28 / total : 0, ...m },
    { key: "sem_marca", label: "UAC e busca genérica", spendShare: total > 0 ? n.spend28 / total : 0, ...n },
  ];
}

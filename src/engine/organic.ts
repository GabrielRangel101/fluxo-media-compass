// Parcela de instalações que o MMP classifica como orgânicas, por semana. Quando a atribuição de mídia paga
// quebra (ex.: iOS no Meta), as instalações não somem: viram "orgânico". Esta série é a confirmação do alerta.

import { addDays } from "./calendar.ts";
import { BASELINE_DAYS } from "./tracking.ts";
import type { Dataset } from "./types.ts";

export interface OrganicWeekly {
  x: string[];
  weekStarts: string[];
  share: number[];
  installs: number[];
  /** média da parcela nos primeiros 60 dias (antes de qualquer defeito) */
  baseline: number;
}

export function organicWeekly(ds: Dataset, weeks = 13): OrganicWeekly {
  const refStart = addDays(ds.meta.refDate, -(weeks * 7 - 1));
  const weekStarts = Array.from({ length: weeks }, (_, i) => addDays(refStart, i * 7));
  const tot = new Array<number>(weeks).fill(0);
  const org = new Array<number>(weeks).fill(0);
  let bTot = 0, bOrg = 0;
  const baseTo = addDays(ds.meta.startDate, BASELINE_DAYS - 1);
  for (const u of ds.users) {
    if (u.install_date <= baseTo) { bTot++; if (u.channel === "organic") bOrg++; }
    if (u.install_date < refStart) continue;
    const w = Math.floor((Date.parse(`${u.install_date}T00:00:00Z`) - Date.parse(`${refStart}T00:00:00Z`)) / (7 * 86400000));
    if (w < 0 || w >= weeks) continue;
    tot[w]!++;
    if (u.channel === "organic") org[w]!++;
  }
  return {
    x: weekStarts.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`),
    weekStarts,
    share: tot.map((t, i) => (t > 0 ? org[i]! / t : 0)),
    installs: tot,
    baseline: bTot > 0 ? bOrg / bTot : 0,
  };
}

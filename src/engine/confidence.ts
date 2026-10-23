// Confiança do ROAS por canal, projeção para D90 e visão blended.
// - Intervalo de 95% do ROAS D90: aproximação normal sobre a receita por instalação da coorte (gasto fixo).
// - Projeção: ROAS D30 das coortes recentes × razão receita D90 ÷ receita D30 observada nas coortes maduras do próprio canal.
//   É uma projeção, não um dado; ela existe porque o D90 real olha 3 a 5 meses para trás.
// - Blended: receita de TODOS os usuários (inclusive os que o MMP chama de orgânico) ÷ gasto pago, contra o ROAS atribuído.

import { addDays } from "./calendar.ts";
import { channelSummary, maturity, periods } from "./metrics.ts";
import { CHANNELS } from "./types.ts";
import type { Channel, Dataset, DateRange } from "./types.ts";

export const MIN_COHORT_INSTALLS = 500;

export type RoasVerdict = "paga" | "nao_paga" | "inconclusivo";

export interface RoasEstimate {
  channel: Channel;
  n: number;
  roas: number | null;
  lo: number | null;
  hi: number | null;
  verdict: RoasVerdict;
  lowSample: boolean;
  /** ROAS D90 projetado a partir do D30 das coortes recentes */
  projected: number | null;
  recentRange: DateRange;
  /** razão receita D90 ÷ D30 usada na projeção */
  tail: number | null;
}

export interface Blended {
  range: DateRange;
  horizon: "D90" | "D30";
  attributedRoas: number | null;
  blendedRoas: number | null;
  /** parcela da receita que o MMP atribui a orgânico */
  organicShare: number | null;
}

export function roasConfidence(ds: Dataset): RoasEstimate[] {
  const per = periods(ds);
  const mat = maturity(ds);
  const recentRange: DateRange = { from: addDays(mat.d90, 1), to: mat.d30 };
  const mature = channelSummary(ds, per.mature90);
  const recent = channelSummary(ds, recentRange);

  return CHANNELS.map((channel) => {
    const m = mature.find((r) => r.channel === channel)!;
    const rec = recent.find((r) => r.channel === channel)!;
    let n = 0, sum = 0, sumSq = 0, s30 = 0, s90 = 0;
    for (const u of ds.users) {
      if (u.channel !== channel || u.install_date < per.mature90.from || u.install_date > per.mature90.to) continue;
      n++;
      const r = u.rev_d90 ?? 0;
      sum += r; sumSq += r * r;
      if (u.rev_d30 !== null && u.rev_d90 !== null) { s30 += u.rev_d30; s90 += u.rev_d90; }
    }
    const spend = m.spend90;
    let lo: number | null = null, hi: number | null = null;
    if (n > 1 && spend > 0) {
      const mean = sum / n;
      const sd = Math.sqrt(Math.max(0, (sumSq - n * mean * mean) / (n - 1)));
      const se = (sd * Math.sqrt(n)) / spend;
      const roas = sum / spend;
      lo = Math.max(0, roas - 1.96 * se);
      hi = roas + 1.96 * se;
    }
    const verdict: RoasVerdict = lo === null || hi === null ? "inconclusivo" : lo >= 1 ? "paga" : hi < 1 ? "nao_paga" : "inconclusivo";
    const tail = s30 > 0 ? s90 / s30 : null;
    return {
      channel, n, roas: m.roas90, lo, hi, verdict, lowSample: n < MIN_COHORT_INSTALLS,
      projected: rec.roas30 !== null && tail !== null ? rec.roas30 * tail : null,
      recentRange, tail,
    };
  });
}

export function blended(ds: Dataset): Blended[] {
  const per = periods(ds);
  const mat = maturity(ds);
  const one = (range: DateRange, horizon: "D90" | "D30"): Blended => {
    const paid = channelSummary(ds, range).find((r) => r.channel === "paid_total")!;
    let all = 0, org = 0;
    for (const u of ds.users) {
      if (u.install_date < range.from || u.install_date > range.to) continue;
      const r = (horizon === "D90" ? u.rev_d90 : u.rev_d30) ?? 0;
      all += r;
      if (u.channel === "organic") org += r;
    }
    const spend = horizon === "D90" ? paid.spend90 : paid.spend30;
    return {
      range, horizon,
      attributedRoas: horizon === "D90" ? paid.roas90 : paid.roas30,
      blendedRoas: spend > 0 ? all / spend : null,
      organicShare: all > 0 ? org / all : null,
    };
  };
  return [one(per.mature90, "D90"), one({ from: addDays(mat.d90, 1), to: mat.d30 }, "D30")];
}

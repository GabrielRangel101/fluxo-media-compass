// Correção de atribuição: estima as instalações que o MMP deixou de atribuir a um canal (viraram "orgânico")
// quando a reconciliação plataforma ÷ MMP está quebrada, e recalcula CPI, CAC e ROAS como se elas estivessem lá.
// É uma ESTIMATIVA: usa a razão do período-base (primeiros 60 dias, antes de qualquer defeito) e supõe que as
// instalações recuperadas se comportam como a média do canal. O valor bruto continua sendo o número oficial.

import { addDays } from "./calendar.ts";
import { channelSummary, maturity, periods } from "./metrics.ts";
import { BASELINE_DAYS, WARN_DEV, reconcile } from "./tracking.ts";
import type { Channel, Dataset, DateRange, Platform } from "./types.ts";

export interface Correction {
  channel: Channel;
  platform: Platform;
  /** primeiro dia do desvio persistente */
  onset: string | null;
  lost28: number;
  cpiRaw: number | null;
  cpi: number | null;
  cacRaw: number | null;
  cac: number | null;
  /** o ROAS D90 só muda se a coorte de 90 dias tocar o período com defeito */
  roas90Raw: number | null;
  roas90: number | null;
  roas90Affected: boolean;
}

interface Day { plat: number; mmp: number }

function dailyPair(ds: Dataset, channel: Channel, platform: Platform): Map<string, Day> {
  const m = new Map<string, Day>();
  const get = (d: string) => { let x = m.get(d); if (!x) m.set(d, (x = { plat: 0, mmp: 0 })); return x; };
  for (const r of ds.adSpend) if (r.channel === channel && r.platform === platform) get(r.date).plat += r.platform_installs;
  for (const u of ds.users) if (u.channel === channel && u.platform === platform) get(u.install_date).mmp++;
  return m;
}

export function corrections(ds: Dataset): Correction[] {
  const per = periods(ds);
  const mat = maturity(ds);
  const out: Correction[] = [];
  const broken = reconcile(ds).filter((r) => r.check === "installs_platform_vs_mmp" && r.status === "broken" && r.ratioBaseline);
  const sumRange = (c: Channel, r: DateRange) => channelSummary(ds, r).find((x) => x.channel === c)!;

  for (const row of broken) {
    const r0 = row.ratioBaseline!;
    const days = dailyPair(ds, row.channel, row.platform as Platform);
    const searchFrom = addDays(ds.meta.startDate, BASELINE_DAYS);
    let onset: string | null = null;
    for (let d = searchFrom; d <= ds.meta.refDate; d = addDays(d, 1)) {
      let p = 0, q = 0;
      for (let k = 0; k < 3; k++) { const x = days.get(addDays(d, k)); if (x) { p += x.plat; q += x.mmp; } }
      if (q > 0 && p / q > r0 * (1 + WARN_DEV)) { onset = d; break; }
    }
    const lostIn = (r: DateRange) => {
      if (!onset) return 0;
      let lost = 0;
      for (let d = r.from < onset ? onset : r.from; d <= r.to; d = addDays(d, 1)) {
        const x = days.get(d);
        if (x) lost += Math.max(0, x.plat / r0 - x.mmp);
      }
      return lost;
    };
    const s28 = sumRange(row.channel, per.last28);
    const lost28 = lostIn(per.last28);
    const cohortM: DateRange = { from: ds.meta.startDate, to: mat.d14 };
    const m14 = sumRange(row.channel, cohortM);
    const lostM = lostIn(cohortM);
    const m90 = sumRange(row.channel, per.mature90);
    const lost90 = lostIn(per.mature90);
    const gainM = m14.installs > 0 ? (m14.installs + lostM) / m14.installs : 1;
    const gain90 = m90.installs > 0 ? (m90.installs + lost90) / m90.installs : 1;
    out.push({
      channel: row.channel, platform: row.platform as Platform, onset, lost28,
      cpiRaw: s28.cpi, cpi: s28.spend > 0 && s28.installs + lost28 > 0 ? s28.spend / (s28.installs + lost28) : null,
      cacRaw: m14.cac, cac: m14.cac === null ? null : m14.cac / gainM,
      roas90Raw: m90.roas90, roas90: m90.roas90 === null ? null : m90.roas90 * gain90,
      roas90Affected: lost90 >= 1,
    });
  }
  return out;
}

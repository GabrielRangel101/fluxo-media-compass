// Leitura de testes A/B de mídia (criativo, público, lance).
//
// Métrica primária: instalações por impressão (proporção válida mesmo em canais com view-through, como DV360).
// Métrica secundária: CTR. Teste z de duas proporções, bicaudal.
// Salvaguardas, nesta ordem: SRM (divisão de tráfego quebrada) > amostra insuficiente > significância.

import { CHANNEL_LABEL } from "./types.ts";
import type { Channel, Dataset, ExperimentRow } from "./types.ts";

/** Φ(x) pela aproximação de Abramowitz–Stegun 7.1.26 para erf. */
export function normCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = 1 - poly * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

export const twoSidedP = (z: number) => 2 * (1 - normCdf(Math.abs(z)));

export interface ProportionTest {
  pA: number;
  pB: number;
  /** lift relativo de B sobre A */
  lift: number | null;
  z: number;
  p: number;
  /** menor lift relativo detectável (80% de poder, 5%) com a amostra atual */
  mdeRel: number | null;
}

export function proportionTest(xA: number, nA: number, xB: number, nB: number): ProportionTest {
  const pA = xA / nA;
  const pB = xB / nB;
  const pooled = (xA + xB) / (nA + nB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nA + 1 / nB));
  const z = se > 0 ? (pB - pA) / se : 0;
  const mdeRel = pooled > 0 ? (2.8 * se) / pA : null;
  return { pA, pB, lift: pA > 0 ? pB / pA - 1 : null, z, p: twoSidedP(z), mdeRel };
}

/** Intervalo de 95% do lift relativo B/A − 1 (método log da razão de proporções). Null se faltar evento. */
export function liftInterval(xA: number, nA: number, xB: number, nB: number): { lo: number; hi: number } | null {
  if (xA <= 0 || xB <= 0 || nA <= 0 || nB <= 0) return null;
  const lr = Math.log((xB / nB) / (xA / nA));
  const se = Math.sqrt((1 - xA / nA) / xA + (1 - xB / nB) / xB);
  return { lo: Math.exp(lr - 1.96 * se) - 1, hi: Math.exp(lr + 1.96 * se) - 1 };
}

export type TestVerdict = "winner_a" | "winner_b" | "no_difference" | "underpowered" | "srm";

export interface TestResult {
  testId: string;
  channel: Channel;
  channelLabel: string;
  type: ExperimentRow["test_type"];
  name: string;
  start: string;
  end: string;
  a: ExperimentRow;
  b: ExperimentRow;
  primary: ProportionTest; // instalações / impressões
  ctr: ProportionTest; // cliques / impressões
  srmP: number;
  verdict: TestVerdict;
  note: string;
}

export const MIN_INSTALLS_PER_VARIANT = 100;
export const SRM_ALPHA = 0.001;
export const ALPHA = 0.05;

export function readTests(ds: Dataset): TestResult[] {
  const ids = [...new Set(ds.experiments.map((e) => e.test_id))];
  return ids.map((id) => {
    const rows = ds.experiments.filter((e) => e.test_id === id);
    const a = rows.find((r) => r.variant === "A")!;
    const b = rows.find((r) => r.variant === "B")!;
    const primary = proportionTest(a.installs, a.impressions, b.installs, b.impressions);
    const ctr = proportionTest(a.clicks, a.impressions, b.clicks, b.impressions);

    // SRM: a divisão de impressões deveria ser 50/50. χ² com 1 gl = z².
    const total = a.impressions + b.impressions;
    const chi2 = ((a.impressions - total / 2) ** 2 + (b.impressions - total / 2) ** 2) / (total / 2);
    const srmP = twoSidedP(Math.sqrt(chi2));

    let verdict: TestVerdict;
    let note: string;
    const minInstalls = Math.min(a.installs, b.installs);
    if (srmP < SRM_ALPHA) {
      verdict = "srm";
      note = `Divisão de impressões ${((a.impressions / total) * 100).toFixed(0)}/${((b.impressions / total) * 100).toFixed(0)} em vez de 50/50 (p < 0,001). O experimento não randomizou direito; não decidir com este resultado.`;
    } else if (minInstalls < MIN_INSTALLS_PER_VARIANT) {
      verdict = "underpowered";
      note = `Só ${minInstalls} instalações na menor variante (mínimo ${MIN_INSTALLS_PER_VARIANT}). Com esta amostra, só dá para detectar lift acima de ${primary.mdeRel === null ? "—" : (primary.mdeRel * 100).toFixed(0) + "%"}. Continuar o teste.`;
    } else if (primary.p < ALPHA) {
      verdict = primary.pB > primary.pA ? "winner_b" : "winner_a";
      note = `Diferença significativa (p = ${primary.p.toFixed(3).replace(".", ",")}) em instalações por impressão.`;
    } else {
      verdict = "no_difference";
      note = `Sem diferença detectável (p = ${primary.p.toFixed(2).replace(".", ",")}). Escolher pela variante mais barata de produzir.`;
    }
    return {
      testId: id, channel: a.channel, channelLabel: CHANNEL_LABEL[a.channel], type: a.test_type, name: a.name,
      start: a.start_date, end: a.end_date, a, b, primary, ctr, srmP, verdict, note,
    };
  });
}

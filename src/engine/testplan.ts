// Plano de teste para validar uma realocação antes de mover verba de verdade.
// Desenho: holdout geográfico (praças pareadas por volume), com a verba movida só no grupo tratado.
// Duração: dias até a amostra detectar o efeito esperado (aproximação de Poisson: erro relativo ≈ √(2/N) por braço).

import { periods, channelSummary } from "./metrics.ts";
import { reconcile } from "./tracking.ts";
import { CHANNEL_LABEL } from "./types.ts";
import type { Scenario } from "./allocation.ts";
import type { Channel, Dataset } from "./types.ts";

export interface TestPlan {
  from: Channel;
  to: Channel;
  design: string;
  /** fatia da verba de origem que o teste move (nunca mais que 10%) */
  pctMoved: number;
  movedAmountPerMonth: number;
  /** efeito relativo esperado em instalações do destino (da simulação) */
  expectedLift: number;
  /** instalações do destino por dia, por braço */
  armDailyInstalls: number;
  days: number;
  weeks: number;
  /** semanas que o efeito esperado exigiria, sem o teto de 12 */
  weeksNeeded: number;
  primaryMetric: string;
  guardrails: string[];
  preconditions: string[];
  /** true quando o efeito esperado é pequeno demais para o volume: o teste não distinguiria de ruído */
  underpowered: boolean;
}

export function planTest(ds: Dataset, s: Scenario): TestPlan {
  const per = periods(ds);
  const dest = channelSummary(ds, per.last28).find((r) => r.channel === s.to)!;
  const destRow = s.rows.find((r) => r.channel === s.to)!;
  const expectedLift = destRow.installsBefore > 0 ? (destRow.installsAfter - destRow.installsBefore) / destRow.installsBefore : 0;
  const pctMoved = Math.min(0.1, s.pct);
  // com o teste menor que a simulação, o efeito esperado escala de forma aproximada pela fração movida
  const effect = Math.max(0.01, expectedLift * (s.pct > 0 ? pctMoved / s.pct : 1));
  const arm = dest.installs / 28 / 2;
  const nNeeded = 2 * Math.pow(2.8 / effect, 2);
  const rawDays = arm > 0 ? nNeeded / arm : Infinity;
  const weeks = Math.max(2, Math.ceil(Math.min(rawDays, 84) / 7));
  const broken = reconcile(ds).filter((r) => r.status === "broken" && (r.channel === s.to || r.channel === s.from));
  return {
    from: s.from, to: s.to,
    design: "Holdout geográfico: praças pareadas por volume de instalações. O grupo tratado recebe a verba movida, o controle mantém o orçamento atual.",
    pctMoved, movedAmountPerMonth: s.movedAmount * (s.pct > 0 ? pctMoved / s.pct : 0),
    expectedLift: effect, armDailyInstalls: arm, days: weeks * 7, weeks, weeksNeeded: Number.isFinite(rawDays) ? Math.ceil(rawDays / 7) : 999,
    primaryMetric: `Instalações atribuídas por real investido em ${CHANNEL_LABEL[s.to]}, tratado contra controle, e CAC com ativação D14 como leitura final.`,
    guardrails: [
      `CPI marginal de ${CHANNEL_LABEL[s.to]} no grupo tratado não passar de ${Math.round(100 * 1.25)}% do CPI atual.`,
      "Taxa de ativação D14 do tratado não cair mais que 15% contra o controle.",
      `Efeito sobre o orgânico: se o orgânico do controle cair, parte do ganho é canibalização e não conta.`,
    ],
    preconditions: broken.map((r) => `Corrigir antes: ${CHANNEL_LABEL[r.channel]} tem checagem de coleta quebrada (${r.platform === "all" ? "todas as plataformas" : r.platform}).`),
    underpowered: rawDays > 84,
  };
}

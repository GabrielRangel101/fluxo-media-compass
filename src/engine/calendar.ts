// Calendário: mês 0 = nov/2024 … mês 23 = out/2026. Meses negativos = histórico anterior à janela.

export const FIRST_YEAR = 2024;
export const FIRST_CAL_MONTH = 10; // 0-based → novembro

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function calMonth(m: number): number {
  return (((FIRST_CAL_MONTH + m) % 12) + 12) % 12;
}

export function calYear(m: number): number {
  return FIRST_YEAR + Math.floor((FIRST_CAL_MONTH + m) / 12);
}

export function monthLabel(m: number): string {
  return `${MONTHS_PT[calMonth(m)]}/${String(calYear(m)).slice(2)}`;
}

export function monthShort(m: number): string {
  return MONTHS_PT[calMonth(m)];
}

/** Índice do mês para um (ano, mês 1-12) */
export function monthIndex(year: number, month1: number): number {
  return (year - FIRST_YEAR) * 12 + (month1 - 1) - FIRST_CAL_MONTH;
}

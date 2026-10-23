// Formatação pt-BR usada pelos textos gerados pelo motor (insights e respostas). Só apresentação.

export const n0 = (x: number) => Math.round(x).toLocaleString("pt-BR");
export const n1 = (x: number) => x.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const n2 = (x: number) => x.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const brl = (x: number) => x.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const brl0 = (x: number) =>
  x.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export const pct = (x: number, d = 1) => `${(x * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
export const spct = (x: number, d = 0) => `${x >= 0 ? "+" : "−"}${pct(Math.abs(x), d)}`;

/** 2026-09-08 -> 08/09 */
export const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

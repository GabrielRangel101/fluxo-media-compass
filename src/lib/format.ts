// Formatação pt-BR (apenas apresentação).

export const fmtInt = (n: number) => Math.round(n).toLocaleString("pt-BR");

export const fmtPct = (x: number, d = 1) => `${(x * 100).toFixed(d).replace(".", ",")}%`;

export const fmtSignedPct = (x: number, d = 1) => `${x >= 0 ? "+" : "−"}${fmtPct(Math.abs(x), d)}`;

export const fmtPP = (x: number, d = 1) =>
  `${x >= 0 ? "+" : "−"}${(Math.abs(x) * 100).toFixed(d).replace(".", ",")} p.p.`;

export const fmtSignedInt = (n: number) => `${n >= 0 ? "+" : "−"}${fmtInt(Math.abs(n))}`;

export const fmtBRL = (x: number, d = 2) =>
  x.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: d, maximumFractionDigits: d });

export const fmtBRLCompact = (x: number) =>
  x.toLocaleString("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

export const fmtCompact = (x: number) => x.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

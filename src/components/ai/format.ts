import type { AskFormat } from "@/engine/aiask";
export const AI_COLORS = Array.from({ length: 6 }, (_, i) => `var(--cat-${i + 1})`);
export function formatAi(value: number, format: AskFormat = "num") {
  if (format === "pct") return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(value);
  if (format === "brl") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: Math.abs(value) < 100 ? 2 : 0 }).format(value);
  if (format === "x") return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}×`;
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);
}

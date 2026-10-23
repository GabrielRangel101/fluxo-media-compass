import type { AskFormat } from "@/engine/ask";
export const AI_COLORS = Array.from({ length: 6 }, (_, i) => `var(--cat-${i + 1})`);
export function formatAi(value: number, format: AskFormat = "num") {
  return new Intl.NumberFormat("pt-BR", format === "pct" ? { style: "percent", maximumFractionDigits: 1 } : format === "brl" ? { style: "currency", currency: "BRL", maximumFractionDigits: 0 } : { maximumFractionDigits: 1 }).format(value);
}
export const chartTooltipStyle = { background: "var(--popover)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 8 };

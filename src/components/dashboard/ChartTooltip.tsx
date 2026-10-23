import type { ReactNode } from "react";

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

/** Tooltip em vidro reutilizado por todos os gráficos. */
export function GlassTooltip({ title, rows, footer }: { title: string; rows: TooltipRow[]; footer?: ReactNode }) {
  return (
    <div className="glass min-w-44 rounded-xl px-3 py-2.5 text-xs shadow-lg">
      <p className="mb-1.5 text-xs font-semibold text-foreground">{title}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden />}
              {r.label}
            </span>
            <span className="font-medium tabular-nums text-foreground">{r.value}</span>
          </li>
        ))}
      </ul>
      {footer && <div className="mt-2 border-t pt-2 text-muted-foreground">{footer}</div>}
    </div>
  );
}

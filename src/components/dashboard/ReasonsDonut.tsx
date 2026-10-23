import type { WindowData } from "@/lib/dashboard-data";
import { NATURE_COLORS } from "@/lib/dashboard-data";
import { fmtInt, fmtPct } from "@/lib/format";
import { DashCard } from "./DashCard";

type Reasons = WindowData["reasons"];

const natureColor = (n: string) => NATURE_COLORS[n] ?? "var(--cat-6)";

export function ReasonsCard({ reasons, rangeLabel, className }: { reasons: Reasons; rangeLabel: string; className?: string }) {
  return (
    <DashCard id="reasons-card" ai="reasons" title="Motivos de cancelamento" info={`Natureza do cancelamento (voluntário, involuntário, fim de contrato) e motivo dentro de cada uma · ${rangeLabel}`} summary={`${fmtInt(reasons.total)} cancel. · últimos 6 meses`} className={className}>
      <ReasonsBars reasons={reasons} />
    </DashCard>
  );
}

/** Barras horizontais agrupadas por natureza: lê-se de cima para baixo, sem decodificar anéis. */
export function ReasonsBars({ reasons }: { reasons: Reasons }) {
  const max = Math.max(0.001, ...reasons.rows.map((r) => r.share));
  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" role="list" aria-label="Motivos de cancelamento por natureza">
      {reasons.byNature.map((n) => (
        <div key={n.nature} role="listitem">
          <p className="mb-0.5 flex items-center justify-between gap-2 border-b border-border pb-0.5 text-xs font-semibold text-foreground">
            <span className="flex min-w-0 items-center gap-1.5"><span className="size-2 shrink-0 rounded-full" style={{ background: natureColor(n.nature) }} aria-hidden /><span className="truncate">{n.nature}</span></span>
            <span className="shrink-0 tabular-nums">{fmtPct(n.share, 0)}</span>
          </p>
          <ul>
            {reasons.rows.filter((r) => r.nature === n.nature).map((r) => (
              <li key={r.reason} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_2.75rem] items-center gap-2 py-px text-[11px] leading-5" title={`${r.reason}: ${fmtInt(r.count)} cancelamentos (${fmtPct(r.share, 1)})`}>
                <span className="truncate text-muted-foreground">{r.reason}</span>
                <span className="h-2 overflow-hidden rounded-sm bg-muted/40">
                  <span className="block h-full rounded-sm transition-[width] duration-500" style={{ width: `${(r.share / max) * 100}%`, background: natureColor(n.nature) }} />
                </span>
                <span className="text-right tabular-nums text-foreground">{fmtPct(r.share, 1)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

import type { PlanMixRow } from "@/engine/growth";
import { PLAN_COLORS } from "@/lib/dashboard-data";
import { fmtBRL, fmtInt, fmtPct } from "@/lib/format";
import { DashCard } from "./DashCard";

/** Planos: quanto pesa na base × quanto pesa na receita, com o ticket de cada um. */
export function PlanMix({ rows, month, className }: { rows: PlanMixRow[]; month: string; className?: string }) {
  const total = rows.reduce((a, r) => a + r.count, 0);
  const max = Math.max(0.01, ...rows.map((r) => Math.max(r.shareSubs, r.shareMrr)));
  return (
    <DashCard
      ai="waffle-plans"
      title="Planos · base × receita"
      info={`Base ativa e MRR de ${month} por plano. Barra cheia = % dos assinantes; barra clara = % do MRR. Quando a barra de receita é menor que a da base, o plano pesa menos no caixa do que na contagem.`}
      summary={`${fmtInt(total)} ativos`}
      className={className}
      bodyClassName="gap-2"
    >
      <ul className="flex min-h-0 flex-1 flex-col justify-around gap-1">
        {rows.map((r) => (
          <li key={r.plan} className="min-w-0">
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                <span className="size-2 shrink-0 rounded-[2px]" style={{ background: PLAN_COLORS[r.plan] ?? "var(--cat-6)" }} aria-hidden />
                <span className="truncate">{r.plan}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">ticket <strong className="font-semibold text-foreground">{fmtBRL(r.arpu, 2)}</strong></span>
            </div>
            <div className="space-y-0.5" title={`${r.plan}: ${fmtInt(r.count)} assinantes (${fmtPct(r.shareSubs, 1)}) · ${fmtPct(r.shareMrr, 1)} do MRR`}>
              <Bar label="base" value={r.shareSubs} max={max} color={PLAN_COLORS[r.plan] ?? "var(--cat-6)"} />
              <Bar label="MRR" value={r.shareMrr} max={max} color={PLAN_COLORS[r.plan] ?? "var(--cat-6)"} faded />
            </div>
          </li>
        ))}
      </ul>
    </DashCard>
  );
}

function Bar({ label, value, max, color, faded }: { label: string; value: number; max: number; color: string; faded?: boolean }) {
  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)_2.75rem] items-center gap-1.5 text-[10px] text-muted-foreground">
      <span>{label}</span>
      <span className="h-2 overflow-hidden rounded-sm bg-muted/40">
        <span className="block h-full rounded-sm transition-[width] duration-500" style={{ width: `${(value / max) * 100}%`, background: color, opacity: faded ? 0.45 : 1 }} />
      </span>
      <span className="text-right tabular-nums text-foreground">{fmtPct(value, 1)}</span>
    </div>
  );
}

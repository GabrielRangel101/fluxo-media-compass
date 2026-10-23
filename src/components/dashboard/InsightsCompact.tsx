import { Link } from "@tanstack/react-router";
import type { Severity } from "@/engine/insights";
import type { DashboardData } from "@/lib/dashboard-data";
import { INSIGHT_TARGETS, INSIGHT_VIEWS } from "@/lib/dashboard-data";
import { useGoToCard } from "@/components/shell/use-go-to-card";
import { cn } from "@/lib/utils";
import { DashCard } from "./DashCard";

/** Hierarquia visual: a cor da barra lateral carrega a severidade (em vez de repetir a palavra em cada linha). */
const BAR: Record<Severity, string> = { perigo: "bg-danger", atenção: "bg-accent", positivo: "bg-positive-fill", info: "bg-primary" };
const DOT: Record<Severity, string> = { perigo: "bg-danger", atenção: "bg-accent", positivo: "bg-positive-fill", info: "bg-primary" };
/** Quantos achados ganham destaque com o texto explicativo */
const FEATURED = 2;

export function InsightsCompact({ data, className }: { data: DashboardData; className?: string }) {
  const goTo = useGoToCard();
  return (
    <DashCard
      ai="insights"
      title="Insights"
      info="Achados do motor de regras, do mais grave ao menos grave. Os dois primeiros trazem o porquê; clique para abrir o card relacionado."
      summary={
        <span className="inline-flex items-center gap-2">
          {data.severityCounts.filter((s) => s.count > 0).map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1" title={`${s.count} ${s.key}`}>
              <span className={cn("size-2 rounded-full", DOT[s.key])} aria-hidden />
              <span className="tabular-nums">{s.count}</span>
            </span>
          ))}
        </span>
      }
      actions={<Link to="/" search={{ view: "risco" }} className="text-[11px] font-medium text-primary hover:underline">ver todos</Link>}
      className={className}
    >
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {data.insights.slice(0, 10).map((i, idx) => {
          const featured = idx < FEATURED;
          return (
            <li key={i.id} className="min-w-0">
              <button
                type="button"
                onClick={() => goTo(INSIGHT_VIEWS[i.topic], INSIGHT_TARGETS[i.topic])}
                className={cn("flex w-full min-w-0 items-stretch gap-2 rounded-md text-left hover:bg-secondary/60", featured ? "bg-secondary/40 py-1.5 pr-2" : "py-1 pr-1")}
                title={i.text}
              >
                <span className={cn("w-1 shrink-0 rounded-full", BAR[i.severity])} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("min-w-0 truncate text-foreground", featured ? "text-[13px] font-semibold" : "text-xs")}>{i.title}</span>
                    {i.displayValue && <strong className={cn("shrink-0 tabular-nums", featured ? "text-sm text-foreground" : "text-xs text-muted-foreground")}>{i.displayValue}</strong>}
                  </span>
                  {featured && <span className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{i.text}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </DashCard>
  );
}

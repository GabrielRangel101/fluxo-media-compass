import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { DashboardData } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";
import { DashCard } from "./DashCard";

export function MonthlyChanges({ changes, className }: { changes: DashboardData["changes"]; className?: string }) {
  const max = Math.max(...changes.map((c) => Math.abs(c.value)), 0.001);
  return (
    <DashCard ai="changes" title="Variação mês a mês" info="Em relação ao mês anterior, ordenado por magnitude. Churn em p.p., NPS em pontos, demais em %. Verde = favorável, vermelho = desfavorável." className={className}>
      <ul className="flex min-h-0 flex-1 flex-col justify-between gap-1 overflow-y-auto">
        {changes.map((c) => {
          const Icon = c.dir === "up" ? ArrowUpRight : c.dir === "down" ? ArrowDownRight : ArrowRight;
          const tone = c.good === null ? "text-muted-foreground" : c.good ? "text-positive" : "text-danger";
          const width = (Math.abs(c.value) / max) * 48;
          return (
            <li key={c.key} className="min-w-0">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate capitalize text-foreground">{c.label} <span className="text-[10px] normal-case text-muted-foreground">({c.unit})</span></span>
                <span className={cn("flex shrink-0 items-center gap-0.5 font-semibold tabular-nums", tone)}>
                  <Icon className="size-3.5" aria-hidden />
                  {c.formatted}
                  <span className="sr-only">{c.good === null ? "neutro" : c.good ? "favorável" : "desfavorável"}</span>
                </span>
              </div>
              <svg viewBox="0 0 100 4" preserveAspectRatio="none" className="mt-0.5 h-1.5 w-full" aria-hidden>
                <rect x={0} y={0.5} width={100} height={3} rx={1.5} fill="var(--muted)" />
                <line x1={50} x2={50} y1={0} y2={4} stroke="var(--muted-foreground)" strokeWidth={0.4} />
                <rect x={c.value >= 0 ? 50 : 50 - width} y={0.5} width={width} height={3} rx={1} fill={c.good === null ? "var(--cat-6)" : c.good ? "var(--positive-fill)" : "var(--danger)"} />
              </svg>
            </li>
          );
        })}
      </ul>
    </DashCard>
  );
}

import { useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react";
import type { DashboardData } from "@/lib/dashboard-data";
import { INSIGHT_TARGETS, INSIGHT_VIEWS } from "@/lib/dashboard-data";
import type { Insight, Severity } from "@/engine/insights";
import { useGoToCard } from "@/components/shell/use-go-to-card";
import { cn } from "@/lib/utils";
import { DashCard } from "./DashCard";

export const SEVERITY_TONES: Record<Severity, string> = { perigo: "bg-danger/15 text-danger", atenção: "bg-accent/15 text-warning", positivo: "bg-positive/15 text-positive", info: "bg-primary/15 text-primary" };

function Chip({ on, onClick, children, className }: { on: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] capitalize transition-colors", on ? "border-primary bg-primary/15 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground", className)}>
      {children}
    </button>
  );
}

export function RuleInsights({ data, className }: { data: DashboardData; className?: string }) {
  const [severity, setSeverity] = useState<Severity | "todos">("todos");
  const [topic, setTopic] = useState<Insight["topic"] | "todos">("todos");
  const [expanded, setExpanded] = useState(false);
  const goTo = useGoToCard();
  const filtered = useMemo(() => data.insights.filter((i) => (severity === "todos" || i.severity === severity) && (topic === "todos" || i.topic === topic)), [data.insights, severity, topic]);
  const pickSeverity = (s: Severity | "todos") => { setSeverity(s); setExpanded(false); };
  const pickTopic = (t: Insight["topic"] | "todos") => { setTopic(t); setExpanded(false); };

  return (
    <DashCard id="insights-card" ai="insights-full" title="Insights do motor de regras" info="Achados automáticos do motor de regras. Clique num achado para abrir o card relacionado." summary={`${filtered.length} achados`} className={className} bodyClassName="gap-1.5">
      <div className="flex shrink-0 gap-1 overflow-x-auto pb-0.5" role="group" aria-label="Filtrar por severidade">
        <Chip on={severity === "todos"} onClick={() => pickSeverity("todos")}>Todos ({data.insights.length})</Chip>
        {data.severityCounts.map((s) => <Chip key={s.key} on={severity === s.key} onClick={() => pickSeverity(s.key)} className={severity === s.key ? SEVERITY_TONES[s.key] : undefined}>{s.key} ({s.count})</Chip>)}
      </div>
      <div className="flex shrink-0 gap-1 overflow-x-auto pb-0.5" role="group" aria-label="Filtrar por tema">
        <Chip on={topic === "todos"} onClick={() => pickTopic("todos")} className="normal-case">Todos os temas</Chip>
        {data.topics.map((t) => <Chip key={t.key} on={topic === t.key} onClick={() => pickTopic(t.key)}>{t.key} ({t.count})</Chip>)}
      </div>
      <ul className="min-h-0 flex-1 divide-y overflow-y-auto pr-1">
        {(expanded ? filtered : filtered.slice(0, 6)).map((i) => (
          <li key={i.id}>
            <button type="button" className="flex w-full items-start gap-2 rounded py-1.5 text-left hover:bg-secondary/60" onClick={() => goTo(INSIGHT_VIEWS[i.topic], INSIGHT_TARGETS[i.topic])} aria-label={`Ver card relacionado: ${i.title}`}>
              <span className={cn("mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize", SEVERITY_TONES[i.severity])}>{i.severity}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-xs font-semibold text-foreground">{i.title}</span>
                  {i.displayValue && <strong className="ml-auto shrink-0 text-xs tabular-nums text-foreground">{i.displayValue}</strong>}
                </span>
                <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{i.text}</span>
              </span>
              <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="py-6 text-center text-xs text-muted-foreground">Nenhum achado neste filtro.</li>}
      </ul>
      {filtered.length > 6 && (
        <button type="button" className="mx-auto flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-secondary" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          {expanded ? "Ver menos" : "Ver todos"}
        </button>
      )}
    </DashCard>
  );
}

import { motion } from "framer-motion";
import type { DashboardData } from "@/lib/dashboard-data";
import { fmtInt, fmtPct } from "@/lib/format";
import { DashCard } from "./DashCard";

const scoreColor = (s: number) => (s >= 70 ? "var(--positive-fill)" : s >= 50 ? "var(--accent)" : "var(--danger)");

export function EditoriaHealth({ data, className }: { data: DashboardData; className?: string }) {
  return (
    <DashCard id="editoria-card" ai="editorias" title="Saúde por editoria" info="Nota 0–100: 55% engajamento médio + 45% estabilidade (churn dos últimos 3 meses). Ordenado pela nota." className={className}>
      <ul className="flex min-h-0 flex-1 flex-col justify-between gap-1 overflow-y-auto">
        {data.editorias.map((e, i) => (
          <li key={e.editoria} className="min-w-0" title={`${e.editoria}: ${fmtInt(e.active)} ativos (${fmtPct(e.share, 1)}), churn 3m ${fmtPct(e.churn3m, 1)}`}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-foreground">{e.editoria}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">eng. {fmtInt(e.avgEngagement)} · <strong className="text-foreground">{e.score}</strong></span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.div className="h-full rounded-full" style={{ background: scoreColor(e.score) }} initial={{ width: 0 }} animate={{ width: `${e.score}%` }} transition={{ duration: 0.6, delay: i * 0.04 }} />
            </div>
          </li>
        ))}
      </ul>
    </DashCard>
  );
}

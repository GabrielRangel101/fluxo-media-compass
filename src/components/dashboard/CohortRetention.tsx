import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardData, CohortSegment } from "@/lib/dashboard-data";
import { COHORT_OPTIONS } from "@/lib/dashboard-data";
import { fmtInt, fmtPct } from "@/lib/format";
import { GlassTooltip } from "./ChartTooltip";
import { DashCard, Segmented } from "./DashCard";
import { AXIS_TICK } from "./EvolutionChart";

const OPTIONS = COHORT_OPTIONS.map((o) => ({ value: o.by, label: o.label }));
const colorAt = (i: number) => `var(--cat-${(i % 6) + 1})`;

export function CohortRetention({ data, className }: { data: DashboardData; className?: string }) {
  const [by, setBy] = useState<CohortSegment>("campaign");
  const [focus, setFocus] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const view = data.cohorts[by];

  return (
    <DashCard
      id="cohort-card"
      ai="cohort"
      title="Retenção por coorte"
      info="% ainda ativo M meses após a entrada (Kaplan-Meier). Lacunas = poucos assinantes observáveis naquela idade."
      actions={<Segmented label="Agrupar coortes por" value={by} options={OPTIONS} onChange={(v) => { setBy(v); setFocus(null); }} />}
      className={className}
    >
      <div className="min-h-0 flex-1" role="img" aria-label={`Curvas de retenção M0 a M12 por ${OPTIONS.find((o) => o.value === by)?.label.toLowerCase()}: ${view.keys.join(", ")}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={view.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="age" tick={AXIS_TICK} tickLine={false} axisLine={false} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} domain={[0, 1]} tickFormatter={(v: number) => fmtPct(v, 0)} />
            <Tooltip
              cursor={{ stroke: "var(--primary)", strokeOpacity: 0.3 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as (typeof view.rows)[number];
                return <GlassTooltip title={`${label} após a entrada`} rows={view.keys.map((k, i) => ({ label: k, value: row.values[k] === null ? "—" : fmtPct(row.values[k] as number, 1), color: colorAt(i) }))} />;
              }}
            />
            {view.keys.map((k, i) => (
              <Line key={`${by}-${k}`} type="monotone" dataKey={(r: (typeof view.rows)[number]) => r.values[k]} name={k} stroke={colorAt(i)} strokeWidth={focus === k ? 3 : 2} strokeOpacity={focus && focus !== k ? 0.2 : 1} dot={false} connectNulls={false} isAnimationActive={!reduce} animationDuration={600} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex max-h-10 shrink-0 flex-wrap gap-x-3 gap-y-0.5 overflow-y-auto text-[11px] text-muted-foreground" aria-label="Legenda das coortes">
        {view.keys.map((k, i) => (
          <li key={k}>
            <button type="button" className="flex items-center gap-1 hover:text-foreground" onMouseEnter={() => setFocus(k)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(k)} onBlur={() => setFocus(null)} title={`${fmtInt(view.sizes[k])} assinantes`}>
              <span className="h-0.5 w-3 rounded" style={{ background: colorAt(i) }} aria-hidden />
              {k}
            </button>
          </li>
        ))}
      </ul>
    </DashCard>
  );
}

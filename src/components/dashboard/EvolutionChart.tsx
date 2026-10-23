import { useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { monthLabel } from "@/engine/calendar";
import type { EventMarker } from "@/engine/types";
import type { DashboardData } from "@/lib/dashboard-data";
import { fmtCompact, fmtInt, fmtSignedInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GlassTooltip } from "./ChartTooltip";
import { DashCard } from "./DashCard";
import { EventLegend, EventPopover, eventMarkers } from "./EventMarkers";
import { MonthNotePanel, noteMarker, useMonthNote } from "./MonthNote";

interface Row {
  label: string;
  active?: number;
  projection?: number;
}

export const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" };

export function EvolutionChart({ data, className }: { data: DashboardData; className?: string }) {
  const { series, proj, ds, current, goalLabel } = data;
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<{ e: EventMarker | null; x: number }>({ e: null, x: 0 });

  const rows = useMemo<Row[]>(() => {
    const hist: Row[] = series.map((p) => ({ label: p.label, active: p.active }));
    hist[hist.length - 1].projection = current.active; // projeção parte do último ponto real
    return [...hist, ...proj.points.map((p) => ({ label: p.label, projection: p.value }))];
  }, [series, proj, current]);

  const goal = ds.meta.goalActive;
  const mn = useMonthNote(series, ds.meta.events);

  return (
    <DashCard
      id="evolution-card"
      ai="evolution"
      title="Evolução de assinantes"
      info={`Base ativa mensal e projeção linear até ${goalLabel}. Marcadores indicam campanhas, reajustes e eventos. Clique em um mês para ler a nota do Meridiano.`}
      actions={<div className="hidden md:block"><EventLegend /></div>}
      className={className}
    >
      <div className="relative min-h-0 flex-1 cursor-pointer" role="img" aria-label={`Gráfico de linha: assinantes ativos de ${series[0].label} a ${current.label}, com projeção até ${goalLabel} e meta de ${fmtInt(goal)}.`}>
        <EventPopover event={hover.e} x={hover.x} />
        {mn.note && <MonthNotePanel note={mn.note} onClose={mn.close} />}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} onClick={mn.onChartClick} margin={{ top: 26, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="evo-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} tickFormatter={fmtCompact} domain={[(min: number) => Math.floor((min * 0.95) / 500) * 500, (max: number) => Math.max(max, goal) * 1.02]} />
            <Tooltip
              cursor={{ stroke: "var(--primary)", strokeOpacity: 0.3 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as Row;
                return (
                  <GlassTooltip
                    title={String(label)}
                    rows={[
                      ...(r.active !== undefined ? [{ label: "Ativos", value: fmtInt(r.active), color: "var(--primary)" }] : []),
                      ...(r.active === undefined && r.projection !== undefined ? [{ label: "Projeção", value: fmtInt(r.projection), color: "var(--primary-glow)" }] : []),
                      { label: "Meta", value: fmtInt(goal), color: "var(--accent)" },
                    ]}
                  />
                );
              }}
            />
            <ReferenceLine y={goal} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="6 4" label={{ value: `Meta ${fmtInt(goal)} · ${goalLabel}`, position: "insideTopLeft", fill: "var(--warning)", fontSize: 11, fontWeight: 600 }} />
            <ReferenceLine x={current.label} stroke="var(--foreground)" strokeOpacity={0.4} label={{ value: "HOJE", position: "insideBottomRight", fill: "var(--foreground)", fontSize: 10, fontWeight: 600 }} />
            {noteMarker(mn.selected)}
            {eventMarkers(ds.meta.events, monthLabel, (e, x) => setHover({ e, x: x ?? 0 }))}
            <Area type="monotone" dataKey="active" stroke="var(--primary)" strokeWidth={2.25} fill="url(#evo-fill)" isAnimationActive={!reduce} animationDuration={900} connectNulls={false} />
            <Line type="monotone" dataKey="projection" stroke="var(--primary-glow)" strokeWidth={2} strokeDasharray="6 5" dot={false} isAnimationActive={!reduce} animationBegin={700} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <dl className="mt-2 grid shrink-0 grid-cols-3 gap-2">
        <MiniStat label={`Projeção ${goalLabel}`} value={fmtInt(proj.projectedAtGoal)} />
        <MiniStat
          label="Falta p/ meta"
          value={proj.gap > 0 ? fmtInt(proj.gap) : "Superada"}
          badge={<span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", proj.onTrack ? "bg-positive/15 text-positive" : "bg-danger/15 text-danger")}>{proj.onTrack ? "✓ no caminho" : "↓ abaixo"}</span>}
        />
        <MiniStat label="Saldo necessário/mês" value={fmtSignedInt(proj.requiredNetAdds)} hint={`atual ${fmtSignedInt(proj.currentNetAdds)}`} />
      </dl>
    </DashCard>
  );
}

function MiniStat({ label, value, hint, badge }: { label: string; value: string; hint?: string; badge?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border bg-background/30 px-2.5 py-1.5">
      <dt className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        <span className="text-base font-semibold tabular-nums text-foreground">{value}</span>
        {badge}
        {hint && <span className="truncate text-[10px] tabular-nums text-muted-foreground">{hint}</span>}
      </dd>
    </div>
  );
}

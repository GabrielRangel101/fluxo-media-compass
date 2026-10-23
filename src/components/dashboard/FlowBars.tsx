import { useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { monthLabel } from "@/engine/calendar";
import type { MonthPoint } from "@/engine/metrics";
import type { EventMarker } from "@/engine/types";
import { fmtInt, fmtPct, fmtSignedInt } from "@/lib/format";
import { GlassTooltip } from "./ChartTooltip";
import { DashCard } from "./DashCard";
import { AXIS_TICK } from "./EvolutionChart";
import { EventPopover, eventMarkers } from "./EventMarkers";
import { MonthNotePanel, noteMarker, useMonthNote } from "./MonthNote";

export function FlowBars({ series, events, className }: { series: MonthPoint[]; events: EventMarker[]; className?: string }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<{ e: EventMarker | null; x: number }>({ e: null, x: 0 });
  // apenas apresentação: cancelamentos desenhados para baixo
  const rows = useMemo(() => series.map((p) => ({ ...p, cancelledDown: -p.cancelled })), [series]);
  const last = series[series.length - 1];
  const mn = useMonthNote(series, events);

  return (
    <DashCard
      ai="flow-bars"
      title="Novas × cancelamentos"
      info="24 meses · novas assinaturas acima de zero, cancelamentos abaixo e linha de saldo líquido. Clique em um mês para ler a nota do Meridiano."
      summary={<>saldo <strong className={last.netAdds >= 0 ? "text-positive" : "text-danger"}>{fmtSignedInt(last.netAdds)}</strong></>}
      className={className}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-positive-fill" aria-hidden />Novas</span>
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-danger" aria-hidden />Cancelamentos</span>
        <span className="inline-flex items-center gap-1"><span className="h-0.5 w-3 rounded bg-accent" aria-hidden />Saldo</span>
      </div>
      <div className="relative min-h-0 flex-1 cursor-pointer" role="img" aria-label={`Gráfico de barras divergentes de ${series[0].label} a ${last.label}: novas assinaturas acima de zero, cancelamentos abaixo e linha de saldo líquido.`}>
        <EventPopover event={hover.e} x={hover.x} />
        {mn.note && <MonthNotePanel note={mn.note} onClose={mn.close} />}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} stackOffset="sign" onClick={mn.onChartClick} margin={{ top: 24, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => fmtInt(Math.abs(v))} />
            <ReferenceLine y={0} stroke="var(--foreground)" strokeOpacity={0.4} />
            {noteMarker(mn.selected)}
            {eventMarkers(events, monthLabel, (e, x) => setHover({ e, x: x ?? 0 }))}
            <Tooltip
              cursor={{ fill: "var(--primary)", fillOpacity: 0.08 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as MonthPoint;
                return (
                  <GlassTooltip
                    title={String(label)}
                    rows={[
                      { label: "Novas", value: fmtInt(p.newSubs), color: "var(--positive-fill)" },
                      { label: "Cancelamentos", value: fmtInt(p.cancelled), color: "var(--danger)" },
                      { label: "Saldo", value: fmtSignedInt(p.netAdds), color: "var(--accent)" },
                      { label: "Churn do mês", value: fmtPct(p.churnRate, 1) },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="newSubs" stackId="flow" fill="var(--positive-fill)" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={!reduce} />
            <Bar dataKey="cancelledDown" stackId="flow" fill="var(--danger)" fillOpacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={!reduce} />
            <Line type="monotone" dataKey="netAdds" stroke="var(--accent)" strokeWidth={2} dot={{ r: 2, fill: "var(--accent)", strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </DashCard>
  );
}

import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AiCard } from "@/engine/ask";
import { AI_COLORS, chartTooltipStyle, formatAi } from "./format";
import { useMotionPreference } from "@/hooks/use-motion-preference";
export function LineCard({ card }: { card: Extract<AiCard, { kind: "line" }> }) {
  const reduced = useMotionPreference();
  const data = card.x.map((label, i) => Object.fromEntries([["label", label], ...card.series.map((s, j) => [`s${j}`, s.values[i] ?? null])]));
  return <div className="ai-chart" role="img" aria-label={`${card.title}. ${card.series.map(s => s.name).join(", ")}`}><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 24, right: 16, bottom: 0, left: 0 }} accessibilityLayer>
    <CartesianGrid stroke="var(--border)" vertical={false} />
    <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} minTickGap={28} axisLine={false} tickLine={false} />
    <YAxis width={62} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickFormatter={v => formatAi(Number(v), card.format)} axisLine={false} tickLine={false} />
    <Tooltip contentStyle={chartTooltipStyle} formatter={v => formatAi(Number(v), card.format)} />
    <Legend wrapperStyle={{ fontSize: 11 }} />
    {card.reference && <ReferenceLine y={card.reference.value} stroke="var(--accent)" strokeDasharray="5 5" ifOverflow="extendDomain" label={{ value: card.reference.label, position: "insideTopRight", fill: "var(--accent)", fontSize: 10 }} />}
    {card.series.map((s, i) => <Line key={s.name} dataKey={`s${i}`} name={s.name} stroke={AI_COLORS[i % 6]} strokeWidth={2} dot={false} connectNulls={false} strokeDasharray={s.name === "Projeção" ? "6 5" : undefined} isAnimationActive={!reduced} />)}
  </LineChart></ResponsiveContainer></div>;
}

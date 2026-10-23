import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { AiCard } from "@/engine/ask";
import { useMotionPreference } from "@/hooks/use-motion-preference";
import { AI_COLORS, chartTooltipStyle, formatAi } from "./format";
export function DonutCard({ card }: { card: Extract<AiCard, { kind: "donut" }> }) {
  const reduced = useMotionPreference();
  // Total and arc geometry are presentation-only reductions of values returned by answer().
  const total = card.rows.reduce((sum, r) => sum + r.value, 0);
  return <div><div className="ai-donut" role="img" aria-label={card.title}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={card.rows} dataKey="value" nameKey="label" innerRadius={52} outerRadius={76} stroke="var(--background)" isAnimationActive={!reduced}>{card.rows.map((r, i) => <Cell key={r.label} fill={AI_COLORS[i % 6]} />)}</Pie><Tooltip contentStyle={chartTooltipStyle} formatter={v => formatAi(Number(v))} /></PieChart></ResponsiveContainer><div className="ai-donut-total"><strong className="font-display">{formatAi(total)}</strong><small>Total</small></div></div>
    <ul className="ai-legend">{card.rows.map((r, i) => <li key={r.label}><span className="ai-swatch" style={{ background: AI_COLORS[i % 6] }} /><span>{r.label}</span><strong>{formatAi(r.value)}</strong></li>)}</ul>
  </div>;
}

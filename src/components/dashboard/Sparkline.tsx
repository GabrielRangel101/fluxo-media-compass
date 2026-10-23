import { useId } from "react";
import { Area, AreaChart, ReferenceDot, ResponsiveContainer, YAxis } from "recharts";
import { useReducedMotion } from "framer-motion";

export function Sparkline({ data, color = "var(--primary)", label }: { data: number[]; color?: string; label: string }) {
  const id = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const points = data.map((v, i) => ({ i, v }));
  const last = points[points.length - 1];
  return (
    <div className="h-full w-full" role="img" aria-label={`Tendência de 12 meses: ${label}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 6, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={`sg-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#sg-${id})`}
            isAnimationActive={!reduce}
            animationDuration={800}
          />
          {last && <ReferenceDot x={last.i} y={last.v} r={3.5} fill={color} stroke="var(--background)" strokeWidth={2} />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

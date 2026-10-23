import { useState } from "react";
import { channelColor } from "@/components/dashboard/primitives";
import { fmtBRL, fmtBRLCompact } from "@/lib/format";
import { CHANNELS, CHANNEL_LABEL } from "@/engine/types";
import type { Channel } from "@/engine/types";

interface RowLike { channel: string; spend: number; cpi: number | null; roas90: number | null }

/** Quadrante CPI × ROAS D90 com tamanho = investimento. SVG puro, só apresentação. */
export function CostReturnChart({ width, height, rows, mature }: { width: number; height: number; rows: RowLike[]; mature: RowLike[] }) {
  const [hover, setHover] = useState<Channel | null>(null);
  const m = { t: 12, r: 16, b: 34, l: 44 };
  const pts = CHANNELS.map((c) => {
    const r = rows.find((x) => x.channel === c);
    const q = mature.find((x) => x.channel === c);
    return { c, cpi: r?.cpi ?? null, roas: q?.roas90 ?? null, spend: r?.spend ?? 0 };
  }).filter((p): p is { c: Channel; cpi: number; roas: number; spend: number } => p.cpi !== null && p.roas !== null);
  if (!pts.length) return null;

  const xMax = Math.max(...pts.map((p) => p.cpi)) * 1.18;
  const yMax = Math.max(1.4, ...pts.map((p) => p.roas)) * 1.15;
  const sMax = Math.max(...pts.map((p) => p.spend)) || 1;
  const iw = width - m.l - m.r, ih = height - m.t - m.b;
  const X = (v: number) => m.l + (v / xMax) * iw;
  const Y = (v: number) => m.t + ih - (v / yMax) * ih;
  const R = (s: number) => 7 + Math.sqrt(s / sMax) * 15;
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * xMax);
  const yTicks = [0, 0.5, 1, 1.5, 2, 2.5].filter((v) => v <= yMax);
  const active = pts.find((p) => p.c === hover);

  return (
    <svg width={width} height={height} role="img" aria-label="Gráfico de bolhas: CPI no eixo horizontal, ROAS D90 no vertical, tamanho pelo investimento">
      <rect x={m.l} y={Y(1)} width={iw} height={Y(0) - Y(1)} fill="var(--danger)" opacity={0.06} />
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={m.l} x2={m.l + iw} y1={Y(v)} y2={Y(v)} stroke="var(--chart-grid)" />
          <text x={m.l - 8} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">{v.toFixed(1).replace(".", ",")}×</text>
        </g>
      ))}
      {xTicks.map((v) => (
        <text key={v} x={X(v)} y={height - 14} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">{fmtBRL(v, 0)}</text>
      ))}
      <text x={m.l + iw / 2} y={height - 1} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">CPI, últimos 28 dias</text>
      <line x1={m.l} x2={m.l + iw} y1={Y(1)} y2={Y(1)} stroke="var(--danger)" strokeWidth={1.25} strokeDasharray="5 4" />
      <text x={m.l + iw - 4} y={Y(1) - 6} textAnchor="end" fontSize={11} fontWeight={600} fill="var(--danger)">1,00× · paga o próprio custo</text>
      {pts.map((p) => {
        const on = hover === null || hover === p.c;
        const r = R(p.spend);
        return (
          <g key={p.c} opacity={on ? 1 : 0.35} onMouseEnter={() => setHover(p.c)} onMouseLeave={() => setHover(null)} style={{ cursor: "default" }}>
            <circle cx={X(p.cpi)} cy={Y(p.roas)} r={r} fill={channelColor(p.c)} fillOpacity={0.8} stroke="var(--card)" strokeWidth={2} />
            <text x={X(p.cpi)} y={Y(p.roas) - r - 6} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--foreground)">{CHANNEL_LABEL[p.c]}</text>
          </g>
        );
      })}
      {active ? (
        <g pointerEvents="none">
          <rect x={Math.min(X(active.cpi) + 14, width - 176)} y={Math.max(Y(active.roas) - 34, 4)} width={162} height={50} rx={8} fill="var(--popover)" stroke="var(--border)" />
          <text x={Math.min(X(active.cpi) + 14, width - 176) + 10} y={Math.max(Y(active.roas) - 34, 4) + 18} fontSize={12} fontWeight={600} fill="var(--popover-foreground)">{CHANNEL_LABEL[active.c]}</text>
          <text x={Math.min(X(active.cpi) + 14, width - 176) + 10} y={Math.max(Y(active.roas) - 34, 4) + 36} fontSize={11} fill="var(--muted-foreground)">
            CPI {fmtBRL(active.cpi)} · ROAS {active.roas.toFixed(2).replace(".", ",")}× · {fmtBRLCompact(active.spend)}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

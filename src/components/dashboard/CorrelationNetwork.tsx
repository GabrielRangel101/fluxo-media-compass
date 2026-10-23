import { useState } from "react";
import { motion } from "framer-motion";
import { useMotionPreference } from "@/hooks/use-motion-preference";
import type { DashboardData } from "@/lib/dashboard-data";
import { METRIC_LABELS } from "@/lib/dashboard-data";
import { DashCard, Segmented } from "./DashCard";

const decimal = (r: number) => r.toFixed(2).replace(".", ",");
const MODES = [
  { value: "diff", label: "Variações" },
  { value: "level", label: "Níveis" },
] as const;

export function CorrelationNetwork({ data, className }: { data: DashboardData; className?: string }) {
  const [mode, setMode] = useState<"diff" | "level">("diff");
  const [node, setNode] = useState<number | null>(null);
  const [edge, setEdge] = useState<string | null>(null);
  const reduce = useMotionPreference();
  const cm = data.correlations[mode];
  const points = cm.keys.map((key, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 4;
    return { key, x: 240 + Math.cos(a) * 132, y: 200 + Math.sin(a) * 132, lx: 240 + Math.cos(a) * (key === "paidShareNew" ? 182 : 170), ly: 200 + Math.sin(a) * 168 };
  });
  return (
    <DashCard
      id="correlation-card"
      ai="correlation"
      title="Rede de correlação"
      info="Pearson entre oito métricas (n meses). Arestas a partir de |r| ≥ 0,35; azul = positiva, vermelho = negativa. Em níveis, séries com tendência parecem correlacionadas sem estarem (correlação espúria) — prefira variações mês a mês."
      summary={`n = ${cm.n}`}
      actions={<Segmented label="Modo da correlação" value={mode} options={MODES} onChange={(v) => { setMode(v); setEdge(null); }} />}
      className={className}
    >
      <div className="relative min-h-0 flex-1">
        {mode === "level" && <p className="absolute left-0 top-0 max-w-[45%] text-[11px] leading-snug text-warning">Níveis com tendência podem gerar correlação espúria</p>}
        <svg viewBox="0 0 480 400" className="h-full w-full" aria-label="Rede de correlação entre oito métricas" role="group">
          {cm.edges.map((e) => {
            const a = points[e.i], b = points[e.j];
            const active = node === null || e.i === node || e.j === node;
            const label = `${METRIC_LABELS[e.a]} × ${METRIC_LABELS[e.b]}: r = ${decimal(e.r)}`;
            return (
              <g key={`${e.a}-${e.b}`} opacity={active ? 1 : 0.1}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={e.r > 0 ? "var(--primary)" : "var(--danger)"} strokeWidth={1 + Math.abs(e.r) * 5} strokeOpacity={Math.abs(e.r)} />
                {Math.abs(e.r) >= 0.65 && !reduce && <motion.line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--foreground)" strokeWidth={2} strokeDasharray="3 65" animate={{ strokeDashoffset: [0, -136] }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} className="pointer-events-none" />}
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={14} tabIndex={0} aria-label={label} onMouseEnter={() => setEdge(label)} onMouseLeave={() => setEdge(null)} onFocus={() => setEdge(label)} onBlur={() => setEdge(null)}><title>{label}</title></line>
              </g>
            );
          })}
          {points.map((p, i) => (
            <g key={p.key} tabIndex={0} aria-label={METRIC_LABELS[p.key]} onMouseEnter={() => setNode(i)} onMouseLeave={() => setNode(null)} onFocus={() => setNode(i)} onBlur={() => setNode(null)} opacity={node === null || node === i ? 1 : 0.4}>
              <circle cx={p.x} cy={p.y} r={13} fill={`var(--cat-${(i % 6) + 1})`} stroke="var(--card)" strokeWidth={3} />
              <text x={p.lx} y={p.ly} textAnchor="middle" fill="var(--foreground)" fontSize={13} fontWeight={500}>
                {METRIC_LABELS[p.key].split(" ").length > 2 ? <><tspan x={p.lx} dy="-0.2em">{METRIC_LABELS[p.key].split(" ").slice(0, 2).join(" ")}</tspan><tspan x={p.lx} dy="1.3em">{METRIC_LABELS[p.key].split(" ").slice(2).join(" ")}</tspan></> : METRIC_LABELS[p.key]}
              </text>
            </g>
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate text-center text-[11px] font-medium text-foreground" aria-live="polite">{edge}</div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 border-t pt-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-primary" />Positiva</span>
        <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-danger" />Negativa</span>
        {cm.strongest && <span className="text-foreground">Mais forte: {METRIC_LABELS[cm.strongest.a]} × {METRIC_LABELS[cm.strongest.b]} <strong className="text-primary">r = {decimal(cm.strongest.r)}</strong></span>}
        <span>Mídia paga → churn +3m: <strong className="text-primary">r = {decimal(data.lag)}</strong></span>
      </div>
    </DashCard>
  );
}

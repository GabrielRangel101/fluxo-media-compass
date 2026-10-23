import { motion, useReducedMotion } from "framer-motion";
import type { MrrBridge as MrrBridgeData } from "@/engine/growth";
import { useSize } from "@/hooks/use-size";
import { WINDOW_LABEL } from "@/lib/dashboard-data";
import { fmtBRLCompact } from "@/lib/format";
import { DashCard } from "./DashCard";

const FILL = { total: "var(--cat-1)", up: "var(--positive-fill)", down: "var(--danger)" } as const;
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${fmtBRLCompact(Math.abs(v))}`;

/** Cascata de MRR: inicial + novas + fim de promoção + reajuste ± upgrades − cancelamentos = final. */
export function MrrBridge({ bridge, className }: { bridge: MrrBridgeData; className?: string }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const reduce = useReducedMotion();
  const steps = bridge.steps;
  const W = size.w;
  const H = Math.max(180, size.h);
  const top = 22;
  const bottom = W / steps.length < 90 ? 46 : 34;
  const maxV = Math.max(...steps.map((s) => Math.max(s.from, s.to)));
  const y = (v: number) => top + (1 - v / maxV) * (H - top - bottom);
  const slot = W / steps.length;
  const bw = Math.min(64, slot * 0.6);
  const growth = bridge.start ? bridge.net / bridge.start : 0;
  const summary = (
    <>
      <strong className={bridge.net >= 0 ? "text-positive" : "text-danger"}>{signed(bridge.net)}</strong> ({growth >= 0 ? "+" : "−"}{Math.abs(growth * 100).toFixed(1).replace(".", ",")}%) · {WINDOW_LABEL}
    </>
  );
  return (
    <DashCard id="mrr-bridge-card" ai="mrr-bridge" title="Ponte de MRR" info="De onde veio a variação da receita recorrente: novas assinaturas, preço cheio chegando após promoção, reajuste de julho, upgrades/migrações (líquido) e receita perdida em cancelamentos." summary={summary} className={className}>
      <div ref={ref} className="relative min-h-0 flex-1">
        {W > 0 && (
          <svg width={W} height={H} role="img" aria-label={steps.map((s) => `${s.label}: ${fmtBRLCompact(Math.abs(s.value))}`).join("; ")}>
            <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--chart-grid)" />
            {steps.map((s, i) => {
              const x = i * slot + (slot - bw) / 2;
              const y1 = y(Math.max(s.from, s.to));
              const h = Math.max(1, Math.abs(y(s.from) - y(s.to)));
              const next = steps[i + 1];
              return (
                <g key={s.key}>
                  {next && <line x1={x + bw} x2={(i + 1) * slot + (slot - bw) / 2} y1={y(s.to)} y2={y(s.to)} stroke="var(--muted-foreground)" strokeDasharray="3 3" opacity={0.6} />}
                  <motion.rect x={x} width={bw} rx={3} fill={FILL[s.kind]} initial={reduce ? false : { y: y(0), height: 0 }} animate={{ y: y1, height: h }} transition={{ duration: 0.5, delay: i * 0.06 }} />
                  <text x={x + bw / 2} y={y1 - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--foreground)" className="tabular-nums">
                    {s.kind === "total" ? fmtBRLCompact(s.value) : signed(s.value)}
                  </text>
                  <foreignObject x={i * slot + 2} y={H - bottom + 4} width={Math.max(0, slot - 4)} height={bottom - 4}>
                    <div className="text-center text-[10px] leading-tight text-muted-foreground">{s.label}</div>
                  </foreignObject>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </DashCard>
  );
}

import { motion, useReducedMotion } from "framer-motion";
import type { WindowData } from "@/lib/dashboard-data";
import { WINDOW_LABEL } from "@/lib/dashboard-data";
import { useSize } from "@/hooks/use-size";
import { fmtInt, fmtSignedInt } from "@/lib/format";
import { DashCard } from "./DashCard";

const FILL = { total: "var(--cat-1)", up: "var(--positive-fill)", down: "var(--danger)" } as const;

/** Cascata: base inicial → + novas → − cancelamentos por natureza → base final. */
export function BaseBridge({ bridge, className }: { bridge: WindowData["bridge"]; className?: string }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const reduce = useReducedMotion();
  const steps = bridge.steps;
  const W = size.w;
  const H = Math.max(180, size.h);
  const top = 22;
  const slot = W / steps.length;
  const bottom = slot < 90 ? 46 : 34;
  const maxV = Math.max(...steps.map((s) => Math.max(s.from, s.to)));
  const y = (v: number) => top + (1 - v / maxV) * (H - top - bottom);
  const bw = Math.min(64, slot * 0.6);
  const summary = (
    <>saldo líquido <strong className={bridge.net >= 0 ? "text-positive" : "text-danger"}>{fmtSignedInt(bridge.net)}</strong> · {WINDOW_LABEL}</>
  );
  return (
    <DashCard id="bridge-card" ai="base-bridge" title="Da base inicial à final" info="Base ativa no início da janela, mais novas assinaturas, menos cancelamentos por natureza, chega à base ativa atual." summary={summary} className={className}>
      <div ref={ref} className="relative min-h-0 flex-1">
        {W > 0 && (
          <svg width={W} height={H} role="img" aria-label={steps.map((s) => `${s.label}: ${fmtInt(Math.abs(s.value))}`).join("; ")}>
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
                    {s.kind === "total" ? fmtInt(s.value) : fmtSignedInt(s.value)}
                  </text>
                  <foreignObject x={i * slot + 2} y={H - bottom + 4} width={slot - 4} height={bottom - 4}>
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

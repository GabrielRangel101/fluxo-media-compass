import { useMemo, useState } from "react";
import type { AtRiskRow } from "@/engine/metrics";
import type { DashboardData } from "@/lib/dashboard-data";
import { DRIVER_COLORS } from "@/lib/dashboard-data";
import { fmtBRL, fmtInt, fmtPct } from "@/lib/format";
import { avatarHash, fmtRisk, initials } from "./avatar";
import { DashCard } from "./DashCard";
import { SubscriberDetail } from "./SubscriberDetail";
import { useSize } from "@/hooks/use-size";

const PAD = { left: 40, right: 14, top: 26, bottom: 34 };

function layoutPeople(rows: AtRiskRow[], width: number, height: number) {
  const compact = width < 500 || height < 320;
  const left = PAD.left, right = width - PAD.right, top = PAD.top, bottom = height - PAD.bottom;
  const nodes = rows.map((p) => {
    const h = avatarHash(p.avatarSeed);
    const ax = left + (p.engagement / 100) * (right - left), ay = bottom - (p.risk / 100) * (bottom - top);
    const r = (compact ? 6 : 8) + Math.sqrt(p.mrr / 50) * (compact ? 3 : 4.5);
    return { p, h, ax, ay, x: ax + ((h % 13) - 6), y: ay + (((h >>> 8) % 13) - 6), r };
  });
  // Deterministic collision relaxation affects geometry only, never risk/engagement values.
  for (let step = 0; step < 90; step++) {
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x || 0.1, dy = b.y - a.y || 0.1, distance = Math.hypot(dx, dy), target = a.r + b.r + 2;
      if (distance < target) { const move = (target - distance) / 2; a.x -= (dx / distance) * move; a.y -= (dy / distance) * move; b.x += (dx / distance) * move; b.y += (dy / distance) * move; }
    }
    for (const n of nodes) { n.x = Math.max(left + n.r, Math.min(right - n.r, n.x)); n.y = Math.max(top + n.r, Math.min(bottom - n.r, n.y)); }
  }
  return nodes;
}

export function RiskMap({ data, selected, onSelect, className }: { data: DashboardData; selected: AtRiskRow | null; onSelect: (p: AtRiskRow) => void; className?: string }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const width = Math.max(240, size.w || 900);
  const height = Math.max(300, size.h || 400);
  const [hover, setHover] = useState<AtRiskRow | null>(null);
  const nodes = useMemo(() => layoutPeople(data.people, width, height), [data.people, width, height]);
  const bottom = height - PAD.bottom, span = bottom - PAD.top;
  const y = (pct: number) => bottom - (pct / 100) * span;
  const x = (v: number) => PAD.left + (v / 100) * (width - PAD.left - PAD.right);
  const criticalY = y(data.criticalRisk);

  return (
    <DashCard id="risk-card" ai="risk-map" title="Mapa de assinantes em risco" info="Amostra de assinantes por engajamento (eixo X) e risco de cancelar em 90 dias (eixo Y). Tamanho = MRR; borda = gatilho principal. Clique num avatar para ver o detalhe." summary={`${data.people.length} assinantes · 90 dias`} className={className}>
      <div ref={ref} className="relative min-h-[360px] flex-1 xl:min-h-0" onMouseLeave={() => setHover(null)}>
        <svg width={width} height={height} className="absolute inset-0" role="group" aria-label="Assinantes por engajamento e risco de cancelar em 90 dias">
          <rect x={PAD.left} y={PAD.top} width={width - PAD.left - PAD.right} height={criticalY - PAD.top} fill="var(--danger)" opacity={0.08} />
          <text x={width - PAD.right - 4} y={PAD.top + 14} textAnchor="end" fill="var(--danger)" fontSize={11}>Zona crítica ≥ {data.criticalRisk}%</text>
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">{t}%</text>
              <text x={x(t)} y={bottom + 16} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">{t}</text>
            </g>
          ))}
          <text x={PAD.left} y={12} fill="var(--muted-foreground)" fontSize={11}>Risco em 90 dias (%)</text>
          <text x={width / 2} y={height - 2} textAnchor="middle" fill="var(--muted-foreground)" fontSize={11}>Engajamento</text>
          {nodes.map((n) => (
            <g key={n.p.id} role="button" tabIndex={0} aria-label={`Selecionar ${n.p.name}, risco ${fmtRisk(n.p.risk)}`} className="cursor-pointer"
              onMouseEnter={() => setHover(n.p)} onFocus={() => setHover(n.p)} onBlur={() => setHover(null)}
              onClick={() => { onSelect(n.p); setHover(null); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(n.p); setHover(null); } }}>
              <circle cx={n.x} cy={n.y} r={n.r + 4} fill="transparent" />
              <circle cx={n.x} cy={n.y} r={n.r} fill={`var(--cat-${(n.h % 6) + 1})`} stroke={selected?.id === n.p.id ? "var(--foreground)" : DRIVER_COLORS[n.p.driver]} strokeWidth={selected?.id === n.p.id ? 3 : 2} />
              <text x={n.x} y={n.y} dy="0.35em" textAnchor="middle" fill="var(--primary-foreground)" fontSize={n.r * 0.78} fontWeight={600} pointerEvents="none">{initials(n.p.name)}</text>
              <title>{`${n.p.name}: engajamento ${n.p.engagement}, risco ${fmtRisk(n.p.risk)}, MRR ${fmtBRL(n.p.mrr)}`}</title>
            </g>
          ))}
        </svg>
        {hover && <div className="pointer-events-none absolute left-12 top-8 z-10 w-72 max-w-[calc(100%-3.5rem)]"><SubscriberDetail compact person={hover} /></div>}
      </div>
    </DashCard>
  );
}

/** Painel lateral: estatísticas de atRisk, gatilhos da amostra e detalhe do assinante selecionado. */
export function RiskPanel({ data, selected, onClose, className }: { data: DashboardData; selected: AtRiskRow | null; onClose: () => void; className?: string }) {
  const stats = [
    { label: "Zona crítica", value: fmtInt(data.risk.critical), note: `${fmtPct(data.risk.criticalShare)} da base`, tone: "text-danger" },
    { label: "MRR em risco", value: fmtBRL(data.risk.mrrAtRisk, 0), note: "receita mensal", tone: "text-danger" },
    { label: "Gatilho principal", value: data.risk.topDriver?.key ?? "Nenhum", note: data.risk.topDriver ? `${fmtInt(data.risk.topDriver.count)} críticos` : "—", tone: "text-foreground" },
    { label: "Editoria exposta", value: data.risk.topEditoria?.key ?? "Nenhuma", note: data.risk.topEditoria ? `${fmtInt(data.risk.topEditoria.count)} críticos` : "—", tone: "text-foreground" },
  ];
  return (
    <DashCard ai="risk-panel" title="Detalhe e estatísticas" info="Estatísticas de toda a base ativa; gatilhos contados na amostra do mapa." className={className} bodyClassName="gap-3 overflow-y-auto">
      <dl className="grid shrink-0 grid-cols-2 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0 rounded-lg border bg-background/30 px-2.5 py-1.5">
            <dt className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</dt>
            <dd className={`truncate text-base font-semibold tabular-nums ${s.tone}`} title={s.value}>{s.value}</dd>
            <dd className="truncate text-[10px] text-muted-foreground">{s.note}</dd>
          </div>
        ))}
      </dl>
      <ul className="flex shrink-0 flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-label="Gatilhos na amostra">
        {data.drivers.map((d) => <li key={d.key} className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: d.color }} />{d.key} <strong className="text-foreground">{d.count}</strong></li>)}
      </ul>
      <div className="min-h-0 flex-1 border-t pt-2">
        {selected ? <SubscriberDetail person={selected} onClose={onClose} /> : <p className="py-4 text-center text-xs text-muted-foreground">Selecione um avatar no mapa para ver o detalhe do assinante.</p>}
      </div>
    </DashCard>
  );
}

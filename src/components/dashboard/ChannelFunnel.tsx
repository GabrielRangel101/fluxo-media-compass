import type { FullFunnel } from "@/engine/growth";
import { FUNNEL_STEPS } from "@/engine/growth";
import { CHANNEL_COLORS } from "@/lib/dashboard-data";
import { fmtInt, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DashCard } from "./DashCard";

const STAGE_FILL = ["var(--cat-6)", "var(--cat-1)", "var(--cat-1)", "var(--cat-1)", "var(--positive-fill)"];

/** Largura em escala log: visitantes (centenas de milhares) e compras (milhares) cabem na mesma régua. */
function logWidth(v: number, min: number, max: number): number {
  if (v <= 0) return 4;
  const lo = Math.log10(Math.max(1, min * 0.4));
  const hi = Math.log10(Math.max(2, max));
  return Math.max(6, ((Math.log10(v) - lo) / (hi - lo)) * 100);
}

/** Tom da taxa de um canal vs a média do mix: acima = bom, abaixo = ruim. */
function rateTone(rate: number, bench: number): string {
  if (bench <= 0) return "";
  const r = rate / bench;
  if (r >= 1.12) return "bg-positive/15 text-positive";
  if (r <= 0.88) return "bg-danger/15 text-danger";
  return "text-foreground";
}

const pct = (x: number) => fmtPct(x, x < 0.1 ? 1 : 0);

export function FunnelCard({ journey, rangeLabel, className }: { journey: FullFunnel; rangeLabel: string; className?: string }) {
  const top = journey.total[0];
  const buy = journey.total[4];
  return (
    <DashCard
      id="funnel-card"
      ai="funnel"
      title="Funil de compra · do visitante à assinatura"
      info={`Visitantes não assinantes → início da compra → revisão do pedido → dados do cartão → compra concluída · ${rangeLabel}. Compras e inícios vêm do dataset; visitantes, revisão e cartão são estimados pelas taxas de conversão de cada canal. Barras em escala logarítmica.`}
      summary={<>{fmtInt(top.value)} visitantes → <strong className="text-foreground">{fmtInt(buy.value)}</strong> assinaturas · {fmtPct(buy.fromTop, 2)}</>}
      className={className}
      bodyClassName="gap-2"
    >
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <FunnelStages journey={journey} />
        <ChannelMatrix journey={journey} />
      </div>
      {journey.leak && (
        <p className="shrink-0 rounded-md border border-danger/25 bg-danger/10 px-3 py-1.5 text-xs text-foreground">
          <strong className="text-danger">Maior vazamento:</strong> {journey.leak.channel} converte {fmtPct(journey.leak.rate, 0)} em {journey.leak.stepLabel} (mix total: {fmtPct(journey.leak.benchmark, 0)}). Igualar o mix recuperaria ~{fmtInt(journey.leak.recoverable)} assinaturas no período.
        </p>
      )}
    </DashCard>
  );
}

function FunnelStages({ journey }: { journey: FullFunnel }) {
  const vals = journey.total.map((s) => s.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return (
    <ol className="flex min-h-0 flex-col justify-between gap-1" aria-label="Etapas do funil de compra">
      {journey.total.map((s, i) => {
        const isWeak = i > 0 && i === journey.weakestStep.step + 1;
        return (
          <li key={s.label} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.75rem_3rem] items-center gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_4rem_3.25rem]">
            <span className="truncate text-xs text-foreground" title={s.label}>{s.label}</span>
            <div className="h-5 overflow-hidden rounded-sm bg-muted/40">
              <div className="h-full rounded-sm transition-[width] duration-500" style={{ width: `${logWidth(s.value, min, max)}%`, background: STAGE_FILL[i], opacity: i === 0 ? 0.55 : 1 }} />
            </div>
            <span className="text-right text-xs font-semibold tabular-nums text-foreground">{fmtInt(s.value)}</span>
            <span className={cn("text-right text-[11px] tabular-nums", isWeak ? "font-semibold text-danger" : "text-muted-foreground")} title={i === 0 ? undefined : `${FUNNEL_STEPS[i - 1]}: ${fmtPct(s.fromPrev ?? 0, 1)}`}>
              {i === 0 ? "" : `↓ ${pct(s.fromPrev ?? 0)}`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const COLS = "grid-cols-[minmax(0,1.5fr)_repeat(5,minmax(0,1fr))]";

function ChannelMatrix({ journey }: { journey: FullFunnel }) {
  const bench = [...journey.total.slice(1).map((s) => s.fromPrev ?? 0), journey.total[4].fromTop];
  return (
    <div className="flex min-h-0 flex-col" role="table" aria-label="Conversão por canal em cada etapa">
      <div className={cn("grid shrink-0 gap-1 pb-1 text-[10px] uppercase leading-tight tracking-wider text-muted-foreground", COLS)} role="row">
        <span role="columnheader">Canal</span>
        {FUNNEL_STEPS.map((s) => <span key={s} className="text-right" role="columnheader">{s.replace(" → ", "→")}</span>)}
        <span className="text-right" role="columnheader">Visita→compra</span>
      </div>
      <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
        {journey.channels.map((c) => (
          <li key={c.channel} className={cn("grid h-8 items-center gap-1 text-xs", COLS)} role="row">
            <span className="flex min-w-0 items-center gap-1.5 text-foreground" role="cell">
              <span className="size-2 shrink-0 rounded-full" style={{ background: CHANNEL_COLORS[c.channel] ?? "var(--cat-6)" }} aria-hidden />
              <span className="truncate" title={c.channel}>{c.channel}</span>
            </span>
            {[...c.rates, c.overall].map((r, i) => (
              <span key={i} role="cell" className={cn("justify-self-end rounded px-1.5 py-0.5 tabular-nums", rateTone(r, bench[i]), i === 4 && "font-semibold")}>
                {i === 0 || i === 4 ? fmtPct(r, 2) : fmtPct(r, 0)}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

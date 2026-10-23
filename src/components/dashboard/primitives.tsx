import { useSize } from "@/hooks/use-size";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Database, Info, Sparkles } from "lucide-react";
import { aiStore, useAiTarget } from "@/components/ai/ai-store";
import type { AiTargetId } from "@/lib/dashboard-data";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtSignedPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CHANNELS, CHANNEL_LABEL } from "@/engine/types";
import type { UserChannel } from "@/engine/types";
import type { HealthStatus } from "@/engine/tracking";

/** Cor por canal (tokens --cat-n; ordem de CHANNELS, orgânico por último). */
export const channelColor = (c: UserChannel): string => {
  const i = CHANNELS.indexOf(c as (typeof CHANNELS)[number]);
  return `var(--cat-${i === -1 ? 6 : i + 1})`;
};

export function ChannelTag({ channel, className }: { channel: UserChannel | "paid_total"; className?: string }) {
  if (channel === "paid_total")
    return <span className={cn("font-semibold", className)}>Total de mídia paga</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: channelColor(channel) }} aria-hidden />
      {CHANNEL_LABEL[channel]}
    </span>
  );
}

export function InfoTip({ text, label = "Mais informações" }: { text: ReactNode; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
          <Info className="size-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-xs leading-relaxed">{text}</TooltipContent>
    </Tooltip>
  );
}

/** Botão "Ver SQL": abre a aba SQL já no arquivo que gera o número do card. */
export function SqlLink({ file }: { file: string }) {
  return (
    <Link
      to="/"
      search={{ view: "sql", file }}
      className="inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
      title={`Ver a consulta ${file}`}
    >
      <Database className="size-3" aria-hidden />
      SQL
    </Link>
  );
}

/** Botão ✦ que abre a Mesa de análise já focada neste card. */
export function AskButton({ target, label }: { target: AiTargetId; label: string }) {
  return (
    <button
      type="button"
      onClick={() => aiStore.open(target)}
      aria-label={`Analisar com IA: ${label}`}
      title="Analisar com IA"
      className="grid size-7 shrink-0 place-items-center rounded-md text-primary transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Sparkles className="size-3.5" aria-hidden />
    </button>
  );
}

export function Panel({
  id, title, info, sql, actions, className, children, ai,
}: {
  id?: string; title: string; info?: ReactNode; sql?: string; actions?: ReactNode; className?: string; children: ReactNode; ai?: AiTargetId;
}) {
  const target = useAiTarget(ai);
  return (
    <section id={id} {...target.props} className={cn("scroll-mt-24 rounded-2xl border bg-card p-5 text-card-foreground", className)}>
      <header className="mb-4 flex min-h-7 items-center gap-2">
        <h2 className="font-display truncate text-[17px] font-semibold tracking-tight text-foreground">{title}</h2>
        {info ? <InfoTip text={info} /> : null}
        <div className="ml-auto flex items-center gap-2">
          {actions}
          {sql ? <SqlLink file={sql} /> : null}
          {ai ? <AskButton target={ai} label={title} /> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

/** Variação relativa. `good` diz que direção é boa (CPI cair é bom; instalações subirem é bom). */
export function DeltaPill({ change, good = "up", className }: { change: number | null; good?: "up" | "down" | "none"; className?: string }) {
  if (change === null) return <span className={cn("text-xs text-muted-foreground", className)}>—</span>;
  const better = good === "none" ? null : good === "up" ? change > 0 : change < 0;
  const tone = Math.abs(change) < 0.005 || better === null ? "text-muted-foreground" : better ? "text-positive" : "text-danger";
  return <span className={cn("tnum text-xs font-medium", tone, className)}>{fmtSignedPct(change, 1)}</span>;
}

/** Minigráfico de tendência (SVG puro, sem eixos): contexto do KPI, não leitura de valores. */
export function Spark({ values, className }: { values: number[]; className?: string }) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return null;
  const W = 96, H = 32, pad = 3;
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((y, i) => [pad + (i / (v.length - 1)) * (W - pad * 2), H - pad - ((y - min) / span) * (H - pad * 2)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn("h-7 w-full text-primary", className)} aria-hidden>
      <path d={`${d} L${pts[pts.length - 1]![0]} ${H} L${pts[0]![0]} ${H} Z`} fill="currentColor" opacity={0.1} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Contagem animada 0 → valor, uma vez por montagem; respeita prefers-reduced-motion. */
function useCountUp(target: number | undefined, delayMs: number) {
  const [v, setV] = useState<number | undefined>(target);
  useEffect(() => {
    if (target === undefined) { setV(target); return; }
    let reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* sem matchMedia */ }
    if (reduce) { setV(target); return; }
    setV(0);
    let raf = 0;
    const t0 = performance.now() + delayMs;
    const dur = 900;
    const tick = (now: number) => {
      const k = Math.min(Math.max((now - t0) / dur, 0), 1);
      setV(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, delayMs]);
  return v;
}

export function Kpi({
  label, value, num, format, index = 0, change, good, hint, info, spark, ai,
}: {
  label: string; value: string; num?: number; format?: (n: number) => string; index?: number;
  change?: number | null; good?: "up" | "down" | "none"; hint?: string; info?: ReactNode; spark?: number[]; ai?: AiTargetId;
}) {
  const target = useAiTarget(ai);
  const shown = useCountUp(num, index * 70);
  const text = num !== undefined && format && shown !== undefined ? format(shown) : value;
  return (
    <div {...target.props} className="kpi-in relative flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-2xl border bg-card p-4" style={{ ["--i" as string]: index }}>
      <div className="flex items-center gap-1.5">
        <span className="truncate text-[13px] font-medium text-muted-foreground">{label}</span>
        {info ? <InfoTip text={info} /> : null}
        {ai ? <span className="-my-1 ml-auto"><AskButton target={ai} label={label} /></span> : null}
      </div>
      <div className="font-display tnum text-[30px] font-semibold leading-none tracking-tight"><span className="sr-only">{value}</span><span aria-hidden>{text}</span></div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {change !== undefined ? <DeltaPill change={change} good={good} /> : null}
        {hint ? <span className="truncate">{hint}</span> : null}
      </div>
      {spark ? <Spark values={spark} className="mt-1" /> : null}
    </div>
  );
}

const STATUS: Record<HealthStatus, { label: string; cls: string }> = {
  ok: { label: "Ok", cls: "bg-positive/12 text-positive border-positive/30" },
  warn: { label: "Atenção", cls: "bg-warning/12 text-warning border-warning/35" },
  broken: { label: "Quebrado", cls: "bg-danger/12 text-danger border-danger/35" },
  low_volume: { label: "Pouco volume", cls: "bg-muted text-muted-foreground border-border" },
};

export function StatusBadge({ status, className }: { status: HealthStatus; className?: string }) {
  const s = STATUS[status];
  return <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold", s.cls, className)}>{s.label}</span>;
}

/** Tabela leve, rolável na horizontal no celular. */
export function DataTable({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-medium text-muted-foreground">
            {head.map((h, i) => (
              <th key={i} className={cn("whitespace-nowrap px-2 py-2 font-medium first:pl-0 last:pr-0", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:px-2 [&_td]:py-2 [&_td:first-child]:pl-0 [&_td:last-child]:pr-0 [&_td:not(:first-child)]:text-right [&_tr]:border-b [&_tr:last-child]:border-0">{children}</tbody>
      </table>
    </div>
  );
}

export const chart = {
  /** cursor vertical tracejado para gráficos de linha/área (hover mostra todas as séries do mesmo dia) */
  crosshair: { stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "3 3" },
  grid: "var(--chart-grid)",
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
  tooltip: {
    contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" },
    labelStyle: { color: "var(--muted-foreground)", marginBottom: 4 },
  },
} as const;

/** Contêiner de gráfico que mede o próprio tamanho (ResizeObserver) e entrega largura/altura ao gráfico.
 *  Evita o recharts ResponsiveContainer renderizar vazio quando mede 0 no primeiro frame (SSR/hidratação). */
export function SizedChart({ children, className }: { children: (w: number, h: number) => ReactNode; className?: string }) {
  const [ref, size] = useSize<HTMLDivElement>();
  return (
    <div ref={ref} className={cn("h-full w-full", className)}>
      {size.w > 0 && size.h > 0 ? children(size.w, size.h) : null}
    </div>
  );
}

/** Legenda de gráfico: obrigatória com 2+ séries. A cor identifica; o texto fica em tinta de texto. */
export function Legend({ items, className }: { items: { label: string; color: string; kind?: "bar" | "line" | "dash" | "dot" }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-1.5">
          <svg width="16" height="8" aria-hidden>
            {it.kind === "bar" ? <rect x="2" y="0" width="12" height="8" rx="2" fill={it.color} opacity="0.7" />
              : it.kind === "dot" ? <circle cx="8" cy="4" r="3.5" fill={it.color} />
              : <line x1="0" x2="16" y1="4" y2="4" stroke={it.color} strokeWidth="2.25" strokeLinecap="round" strokeDasharray={it.kind === "dash" ? "4 3" : undefined} />}
          </svg>
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/** Alternativa em tabela para um gráfico (acessibilidade: o dado nunca depende só da cor). */
export function DataDetails({ head, rows, label = "Ver os dados em tabela" }: { head: string[]; rows: string[][]; label?: string }) {
  return (
    <details className="group mt-3 text-sm">
      <summary className="inline-flex cursor-pointer select-none items-center gap-1 rounded-md px-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        {label}
      </summary>
      <div className="mt-2 max-h-64 overflow-auto">
        <DataTable head={head}>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => (<td key={j} className="tnum whitespace-nowrap">{c}</td>))}</tr>
          ))}
        </DataTable>
      </div>
    </details>
  );
}

import { useSize } from "@/hooks/use-size";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Database, Info } from "lucide-react";
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

export function Panel({
  id, title, info, sql, actions, className, children,
}: {
  id?: string; title: string; info?: ReactNode; sql?: string; actions?: ReactNode; className?: string; children: ReactNode;
}) {
  return (
    <section id={id} className={cn("scroll-mt-24 rounded-xl border bg-card p-4 text-card-foreground shadow-sm", className)}>
      <header className="mb-3 flex min-h-6 items-center gap-2">
        <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</h2>
        {info ? <InfoTip text={info} /> : null}
        <div className="ml-auto flex items-center gap-2">
          {actions}
          {sql ? <SqlLink file={sql} /> : null}
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

export function Kpi({
  label, value, change, good, hint, info,
}: {
  label: string; value: string; change?: number | null; good?: "up" | "down" | "none"; hint?: string; info?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-3.5 shadow-sm">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
        {info ? <InfoTip text={info} /> : null}
      </div>
      <div className="tnum text-2xl font-semibold leading-tight tracking-tight">{value}</div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {change !== undefined ? <DeltaPill change={change} good={good} /> : null}
        {hint ? <span className="truncate">{hint}</span> : null}
      </div>
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
          <tr className="border-b text-left text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            {head.map((h, i) => (
              <th key={i} className={cn("whitespace-nowrap px-2 py-2 font-semibold first:pl-0 last:pr-0", i > 0 && "text-right")}>
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

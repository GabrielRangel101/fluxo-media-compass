import { motion } from "framer-motion";
import { useMotionPreference } from "@/hooks/use-motion-preference";
import { useMemo, useState } from "react";
import type { CompositionRow } from "@/engine/metrics";
import { fmtInt, fmtPct } from "@/lib/format";
import type { AiTargetId } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";
import { DashCard } from "./DashCard";

export function WaffleCard({
  id,
  ai,
  title,
  info,
  comp,
  waffle,
  colors,
  className,
}: {
  id?: string;
  ai?: AiTargetId;
  title: string;
  info: string;
  comp: CompositionRow[];
  waffle: { key: string; cells: number }[];
  colors: Record<string, string>;
  className?: string;
}) {
  const reduce = useMotionPreference();
  const [focus, setFocus] = useState<string | null>(null);
  const cells = useMemo(() => waffle.flatMap((w) => Array.from({ length: w.cells }, () => w.key)), [waffle]);
  const summary = comp.map((c) => `${c.key} ${fmtPct(c.share, 0)}`).join(", ");
  const total = comp.reduce((a, c) => a + c.count, 0);
  const color = (k: string) => colors[k] ?? "var(--cat-6)";

  return (
    <DashCard id={id} ai={ai} title={title} info={info} summary={fmtInt(total)} className={className} bodyClassName="gap-2">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="grid aspect-square h-full max-h-full max-w-full grid-cols-10 gap-[3px]" role="img" aria-label={`Gráfico waffle de 100 células: ${summary}.`}>
          {cells.map((key, i) => (
            <motion.span
              key={i}
              className="rounded-[3px]"
              style={{ background: color(key) }}
              initial={reduce ? false : { scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: focus && focus !== key ? 0.15 : 1 }}
              transition={{ delay: reduce ? 0 : 0.1 + i * 0.004, duration: 0.2 }}
              aria-hidden
            />
          ))}
        </div>
      </div>
      <ul className="grid shrink-0 grid-cols-1 gap-x-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {comp.map((c) => (
          <li key={c.key} className="min-w-0">
            <button
              type="button"
              onMouseEnter={() => setFocus(c.key)}
              onMouseLeave={() => setFocus(null)}
              onFocus={() => setFocus(c.key)}
              onBlur={() => setFocus(null)}
              className={cn("flex w-full min-w-0 items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-[11px] transition-colors hover:bg-secondary", focus === c.key && "bg-secondary")}
            >
              <span className="flex min-w-0 items-center gap-1.5 text-foreground">
                <span className="size-2 shrink-0 rounded-[2px]" style={{ background: color(c.key) }} aria-hidden />
                <span className="truncate">{c.key}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground" title={`${fmtInt(c.count)} assinantes`}>
                <strong className="font-semibold text-foreground">{fmtPct(c.share, 1)}</strong>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </DashCard>
  );
}

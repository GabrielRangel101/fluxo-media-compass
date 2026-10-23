import { useCallback, useMemo, useState } from "react";
import { ReferenceLine } from "recharts";
import { X } from "lucide-react";
import { aiStore } from "@/components/ai/ai-store";
import { monthNote } from "@/engine/notes";
import type { MonthPoint } from "@/engine/metrics";
import type { EventMarker } from "@/engine/types";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = { positivo: "bg-positive-fill", "atenção": "bg-danger", neutro: "bg-primary" };

/** Clique num mês do gráfico → nota do Meridiano ancorada naquele ponto. */
export function useMonthNote(series: MonthPoint[], events: EventMarker[]) {
  const [label, setLabel] = useState<string | null>(null);
  const note = useMemo(() => {
    if (!label) return null;
    const m = series.findIndex((p) => p.label === label);
    return m < 0 ? null : monthNote(series, events, m);
  }, [label, series, events]);
  /** handler para o onClick do gráfico do Recharts (clica de novo no mesmo mês para fechar) */
  const onChartClick = useCallback((state: unknown) => {
    const l = (state as { activeLabel?: string | number } | undefined)?.activeLabel;
    if (typeof l !== "string") return;
    setLabel((cur) => (cur === l || !series.some((p) => p.label === l) ? null : l));
  }, [series]);
  return { note, onChartClick, close: () => setLabel(null), selected: note ? note.label : null };
}

/** Linha vertical marcando o ponto anotado (chamar como função dentro do gráfico Recharts). */
export function noteMarker(selected: string | null) {
  return selected ? <ReferenceLine key="month-note" x={selected} stroke="var(--brand)" strokeWidth={1.75} ifOverflow="extendDomain" /> : null;
}

export function MonthNotePanel({ note, onClose, className }: { note: NonNullable<ReturnType<typeof monthNote>>; onClose: () => void; className?: string }) {
  return (
    <aside aria-label={`Nota do Meridiano: ${note.label}`} className={cn("glass absolute left-2 top-7 z-20 w-72 max-w-[calc(100%-1rem)] rounded-xl p-3 text-xs shadow-lg", className)}>
      <header className="flex items-start gap-2">
        <span className={cn("mt-1 size-2 shrink-0 rounded-full", TONE[note.tone])} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand">Nota do Meridiano</p>
          <p className="font-display text-sm font-semibold leading-snug text-foreground">{note.headline}</p>
        </div>
        <button type="button" aria-label="Fechar nota" onClick={onClose} className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </header>
      <ul className="mt-2 space-y-1 leading-snug text-muted-foreground">
        {note.lines.map((l) => <li key={l} className="text-foreground/90">{l}</li>)}
      </ul>
      <button type="button" onClick={() => { aiStore.open(); aiStore.ask(note.ask, `Sobre ${note.label}`); }} className="mt-2 rounded-full border px-2.5 py-1 text-[11px] font-medium text-primary hover:border-primary hover:bg-primary/10">
        ✦ Aprofundar na mesa de análise
      </button>
    </aside>
  );
}

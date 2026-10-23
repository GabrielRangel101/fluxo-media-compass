import { X } from "lucide-react";
import { cardCaption } from "@/engine/captions";
import { AiCardContent } from "./AiCardContent";
import { aiStore, type GenItem } from "./ai-store";

export function AiBadge({ area }: { area?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 rounded-full bg-[hsl(8_70%_45%)] px-1.5 py-0.5 text-[10px] font-bold text-white">✦ Meridiano</span>
      {area && <span className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{area}</span>}
    </span>
  );
}

/** Conteúdo de um card gerado: "Leitura do Meridiano" (texto + follow-ups) ou um card de dados do answer(). */
export function GenCardBody({ item, busy, compact = false }: { item: GenItem; busy: boolean; compact?: boolean }) {
  const a = item.exchange.answer!;
  if (!item.card)
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs leading-relaxed text-foreground">{a.text}</p>
        <div className="flex flex-wrap gap-1.5">
          {a.followUps.map((q) => (
            <button key={q} type="button" disabled={busy} onPointerDown={(e) => e.stopPropagation()} onClick={() => aiStore.ask(q)} className="rounded-full border border-[hsl(38_70%_55%/0.4)] px-2 py-0.5 text-left text-[11px] text-foreground hover:bg-white/10 disabled:opacity-50">
              {q}
            </button>
          ))}
        </div>
      </div>
    );
  const caption = cardCaption(item.card);
  return (
    <div className={compact ? "" : "min-h-0"}>
      <AiCardContent card={item.card} />
      {caption && <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{caption}</p>}
    </div>
  );
}

export function GenCardHeader({ item, title }: { item: GenItem; title: string }) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-2">
      <div className="min-w-0">
        <AiBadge area={item.exchange.answer?.basedOn[0]} />
        <h3 className="mt-1 truncate text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <button type="button" aria-label={`Fechar ${title}`} onPointerDown={(e) => e.stopPropagation()} onClick={() => aiStore.hide(item.key)} className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground">
        <X className="size-3.5" />
      </button>
    </header>
  );
}

export const genTitle = (item: GenItem) => (item.card ? item.card.title : "Leitura do Meridiano");

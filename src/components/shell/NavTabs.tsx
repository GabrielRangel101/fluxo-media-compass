import { Link } from "@tanstack/react-router";
import { useAi } from "@/components/ai/ai-store";
import type { ViewId } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";
import { VIEWS } from "./views";

/** Abas da edição, no estilo de caderno de jornal: texto em serifa com filete vermelho na aba ativa. */
export function NavTabs({ view, className }: { view: ViewId; className?: string }) {
  const { active } = useAi();
  return (
    <nav aria-label="Views do dashboard" className={cn("items-end gap-7", className)}>
      {VIEWS.map((v) => {
        const on = v.id === view;
        return (
          <Link
            key={v.id}
            to="/"
            search={{ view: v.id }}
            aria-current={on ? "page" : undefined}
            aria-disabled={active || undefined}
            tabIndex={active ? -1 : undefined}
            onClick={(e) => active && e.preventDefault()}
            className={cn("relative pb-1 font-display text-[15px] transition-colors", on ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground", active && "pointer-events-none opacity-50")}
          >
            {v.label}
            {on && <span className="absolute inset-x-0 -bottom-0.5 h-0.5 bg-brand" aria-hidden />}
          </Link>
        );
      })}
    </nav>
  );
}

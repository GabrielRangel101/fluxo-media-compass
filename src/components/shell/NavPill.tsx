import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { aiStore, useAi } from "@/components/ai/ai-store";
import type { ViewId } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";
import { VIEWS } from "./views";

function ViewLink({ id, view, disabled, side }: { id: ViewId; view: ViewId; disabled: boolean; side: "top" | "bottom" }) {
  const v = VIEWS.find((x) => x.id === id)!;
  const on = id === view;
  const Icon = v.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to="/"
          search={{ view: id }}
          aria-label={v.label}
          aria-current={on ? "page" : undefined}
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? -1 : undefined}
          onClick={(e) => disabled && e.preventDefault()}
          className={cn("relative grid size-10 place-items-center rounded-full transition-colors", on ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground", disabled && "pointer-events-none opacity-40")}
        >
          <Icon className="size-[18px]" aria-hidden />
          {on && <span className="bg-gradient-primary absolute bottom-1 h-0.5 w-4 rounded-full" aria-hidden />}
        </Link>
      </TooltipTrigger>
      <TooltipContent side={side}>{disabled ? `${v.label} (saia da mesa de análise para navegar)` : v.label}</TooltipContent>
    </Tooltip>
  );
}

/** Pílula flutuante de navegação com o orbe do Modo IA ao centro. */
export function NavPill({ view, className, side = "bottom" }: { view: ViewId; className?: string; side?: "top" | "bottom" }) {
  const { active } = useAi();
  return (
    <nav aria-label="Views do dashboard" className={cn("dash-card flex items-center gap-1 rounded-full p-1.5", className)}>
      <ViewLink id="geral" view={view} disabled={active} side={side} />
      <ViewLink id="aquisicao" view={view} disabled={active} side={side} />
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label="Mesa de análise" aria-pressed={active} onClick={() => aiStore.toggle()} className="ai-orb mx-1 grid size-12 shrink-0 place-items-center rounded-full text-primary-foreground">
            <Sparkles className="size-5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side={side}>Mesa de análise</TooltipContent>
      </Tooltip>
      <ViewLink id="retencao" view={view} disabled={active} side={side} />
      <ViewLink id="risco" view={view} disabled={active} side={side} />
      <ViewLink id="simulador" view={view} disabled={active} side={side} />
    </nav>
  );
}

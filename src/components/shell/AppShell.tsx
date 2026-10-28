import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { aiStore, useAi } from "@/components/ai/ai-store";
import { cn } from "@/lib/utils";
import type { ViewId } from "@/lib/dashboard-data";
import { ThemeToggle } from "./ThemeToggle";
import { VIEWS } from "./views";

/** Autoria (mesma assinatura nos três dashboards do portfólio). */
const AUTHOR = {
  name: "Gabriel Rangel",
  role: "Analista de dados",
  repo: "https://github.com/GabrielRangel101/fluxo-media-compass",
  github: "https://github.com/GabrielRangel101",
  linkedin: "https://www.linkedin.com/in/gabriel-rangel-a954ba26a/",
};
const LINK = "underline-offset-2 hover:text-foreground hover:underline";

export function AppShell({ view, brand, refLabel, brokenCount, children }: { view: ViewId; brand: string; refLabel: string; brokenCount: number; children: ReactNode }) {
  const { active: open } = useAi();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-none items-center gap-3 px-3 py-2.5 sm:px-6 2xl:px-10">
          <img src="/logo.svg" alt="" width={34} height={34} className="size-[34px] shrink-0 rounded-lg" />
          <div className="mr-auto flex min-w-0 flex-col">
            <span className="font-display truncate text-xl font-semibold leading-none tracking-tight">{brand} Media Compass</span>
            <span className="mt-1 hidden truncate text-[11px] text-muted-foreground sm:block">
              Mídia, aquisição de app e saúde da coleta. Dados sintéticos até {refLabel}.
            </span>
          </div>
          <a href={AUTHOR.linkedin} target="_blank" rel="noreferrer" className="hidden shrink-0 text-xs text-muted-foreground hover:text-foreground lg:block" title="Autor do projeto">
            por <span className="font-semibold text-foreground">{AUTHOR.name}</span>
          </a>
          <button
            type="button"
            aria-pressed={open}
            onClick={() => aiStore.toggle()}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors",
              open ? "bg-foreground text-background" : "bg-primary text-primary-foreground hover:opacity-90",
            )}
          >
            <Sparkles className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Mesa de análise</span>
            <span className="sm:hidden">Analisar</span>
          </button>
          <ThemeToggle />
        </div>
        <nav aria-label="Seções" className="mx-auto flex w-full max-w-none gap-1 overflow-x-auto px-3 pb-2 sm:px-6 2xl:px-10">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            const active = v.id === view;
            return (
              <Link
                key={v.id}
                to="/"
                search={{ view: v.id }}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {v.label}
                {v.id === "tracking" && brokenCount > 0 ? (
                  <span className="grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-white" aria-label={`${brokenCount} checagens quebradas`}>
                    {brokenCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-none flex-1 px-3 pb-12 pt-4 sm:px-6 2xl:px-10">{children}</main>
      <footer className="border-t">
        <div className="flex w-full flex-col gap-1 px-3 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 2xl:px-10">
          <p>
            Projeto de portfólio de <strong className="font-semibold text-foreground">{AUTHOR.name}</strong>, {AUTHOR.role.toLowerCase()}. Todos os dados são sintéticos e não vêm de nenhuma empresa real.
          </p>
          <p className="flex items-center gap-4">
            <a href={AUTHOR.linkedin} target="_blank" rel="noreferrer" className={LINK}>LinkedIn</a>
            <a href={AUTHOR.github} target="_blank" rel="noreferrer" className={LINK}>GitHub</a>
            <a href={AUTHOR.repo} target="_blank" rel="noreferrer" className={LINK}>Código deste projeto</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

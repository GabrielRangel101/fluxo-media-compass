import type { ReactNode } from "react";
import type { ViewId } from "@/lib/dashboard-data";
import { NavPill } from "./NavPill";
import { TopBar } from "./TopBar";

/** ≥1280px: app em altura fixa sem scroll de página; abaixo disso a página rola e a pílula vai para o rodapé. */
export function AppShell({ view, brand, monthLabel, children }: { view: ViewId; brand: string; monthLabel: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col xl:h-dvh xl:overflow-hidden">
      <TopBar brand={brand} monthLabel={monthLabel} view={view} />
      <main className="min-h-0 flex-1 px-3 pb-28 pt-3 sm:px-4 xl:overflow-hidden xl:pb-3">{children}</main>
      <div className="fixed inset-x-0 bottom-3 z-50 flex justify-center pb-[env(safe-area-inset-bottom)] xl:hidden">
        <NavPill view={view} side="top" />
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/shell/AppShell";
import { AiLayer } from "@/components/ai/AiLayer";
import { OverviewView } from "@/components/views/OverviewView";
import { CanaisView } from "@/components/views/CanaisView";
import { FunilView } from "@/components/views/FunilView";
import { TestesView } from "@/components/views/TestesView";
import { TrackingView } from "@/components/views/TrackingView";
import { TagbookView } from "@/components/views/TagbookView";
import { SqlView } from "@/components/views/SqlView";
import { parseView, useDashboardData } from "@/lib/dashboard-data";
import type { ViewId } from "@/lib/dashboard-data";
import { dm } from "@/engine/fmt";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { view?: ViewId; file?: string } => ({
    view: parseView(search["view"]),
    file: typeof search["file"] === "string" ? search["file"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Dashboard · Fluxo Media Compass" },
      { name: "description", content: "Mídia paga, aquisição de app e saúde da coleta: CPI, CAC, ROAS, funil, testes A/B, reconciliação GA4 × AppsFlyer × backend e pacote SQL. Dados sintéticos." },
      { property: "og:title", content: "Dashboard · Fluxo Media Compass" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { view = "geral", file } = Route.useSearch();
  const data = useDashboardData();
  const ref = data.ds.meta.refDate;

  return (
    <TooltipProvider delayDuration={150}>
      <AppShell view={view} brand={data.ds.meta.brand} refLabel={`${dm(ref)}/${ref.slice(0, 4)}`} brokenCount={data.tracking.broken}>
        <div data-view={view}>
          {view === "geral" && <OverviewView data={data} />}
          {view === "canais" && <CanaisView data={data} />}
          {view === "funil" && <FunilView data={data} />}
          {view === "testes" && <TestesView data={data} />}
          {view === "tracking" && <TrackingView data={data} />}
          {view === "tagbook" && <TagbookView data={data} />}
          {view === "sql" && <SqlView file={file} />}
        </div>
      </AppShell>
      <AiLayer />
    </TooltipProvider>
  );
}

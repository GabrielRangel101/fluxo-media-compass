import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/shell/AppShell";
import { AiLayer } from "@/components/ai/AiLayer";
import { CommandBar } from "@/components/shell/CommandBar";
import { DemoTour } from "@/components/demo/DemoTour";
import { AcquisitionView, OverviewView, RetentionView, RiskView, SimulatorPage } from "@/components/views/DashboardViews";
import { parseView, useDashboardData, useWindowData } from "@/lib/dashboard-data";
import type { ViewId } from "@/lib/dashboard-data";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { view?: ViewId } => ({ view: parseView(search["view"]) }),
  head: () => ({
    meta: [
      { title: "Dashboard · Gazeta Meridiano Subscription Intelligence" },
      { name: "description", content: "Dashboard de assinaturas digitais da Gazeta Meridiano: visão geral, aquisição, retenção por coorte, risco de saída e sinergia entre métricas, com dados sintéticos." },
      { property: "og:title", content: "Dashboard · Gazeta Meridiano Subscription Intelligence" },
      { property: "og:description", content: "Command center de assinaturas de um jornal fictício: KPIs, funil, coortes, risco em 90 dias e insights." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const VIEW_COMPONENTS = { geral: OverviewView, aquisicao: AcquisitionView, retencao: RetentionView, risco: RiskView, simulador: SimulatorPage } as const;

function Index() {
  const view = Route.useSearch().view ?? "geral";
  const data = useDashboardData();
  const period = useWindowData();
  const View = VIEW_COMPONENTS[view];

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={150}>
        <AppShell view={view} brand={data.ds.meta.brand} monthLabel={data.current.label}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={view} data-view={view} className="xl:h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <View data={data} period={period} />
            </motion.div>
          </AnimatePresence>
        </AppShell>
        <AiLayer />
        <CommandBar />
        <DemoTour />
      </TooltipProvider>
    </MotionConfig>
  );
}

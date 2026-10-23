import { LayoutDashboard, Megaphone, Repeat, ShieldAlert, SlidersHorizontal } from "lucide-react";
import type { ViewId } from "@/lib/dashboard-data";

export const VIEWS: { id: ViewId; label: string; short: string; icon: typeof LayoutDashboard }[] = [
  { id: "geral", label: "Visão geral", short: "Geral", icon: LayoutDashboard },
  { id: "aquisicao", label: "Aquisição", short: "Aquisição", icon: Megaphone },
  { id: "retencao", label: "Retenção", short: "Retenção", icon: Repeat },
  { id: "risco", label: "Risco e sinergia", short: "Risco", icon: ShieldAlert },
  { id: "simulador", label: "Simulador", short: "E se", icon: SlidersHorizontal },
];

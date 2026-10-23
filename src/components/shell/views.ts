import { BookOpenText, Database, FlaskConical, Funnel, LayoutDashboard, Megaphone, ShieldAlert } from "lucide-react";
import type { ViewId } from "@/lib/dashboard-data";

export const VIEWS: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "geral", label: "Visão geral", icon: LayoutDashboard },
  { id: "canais", label: "Canais e verba", icon: Megaphone },
  { id: "funil", label: "Funil do app", icon: Funnel },
  { id: "testes", label: "Testes A/B", icon: FlaskConical },
  { id: "tracking", label: "Saúde da coleta", icon: ShieldAlert },
  { id: "tagbook", label: "Tagbook", icon: BookOpenText },
  { id: "sql", label: "SQL", icon: Database },
];

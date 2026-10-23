import { useNavigate } from "@tanstack/react-router";
import type { ViewId } from "@/lib/dashboard-data";

/** Navega para a aba e destaca o card de destino (id estável). */
export function useGoToCard() {
  const navigate = useNavigate();
  return (view: ViewId, target?: string) => {
    void navigate({ to: "/", search: { view } });
    if (!target) return;
    window.setTimeout(() => {
      const el = document.getElementById(target);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("pulse-card");
      window.setTimeout(() => el.classList.remove("pulse-card"), 2400);
    }, 160);
  };
}

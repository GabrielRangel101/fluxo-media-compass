import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ViewId } from "@/lib/dashboard-data";
import { useMotionPreference } from "@/hooks/use-motion-preference";

/** Troca para a view do card, espera ele montar e o destaca por 1,2s. */
export function useGoToCard() {
  const navigate = useNavigate();
  const reduce = useMotionPreference();
  return useCallback(
    (view: ViewId, cardId: string) => {
      void navigate({ to: "/", search: { view } });
      let tries = 0;
      const tick = () => {
        const el = document.getElementById(cardId);
        const host = el?.closest<HTMLElement>("[data-view]");
        if (!el || host?.dataset["view"] !== view) {
          if (++tries < 90) requestAnimationFrame(tick);
          return;
        }
        el.scrollIntoView({ behavior: reduce ? "instant" : "smooth", block: "nearest" });
        el.classList.remove("insight-highlight");
        void el.offsetWidth;
        el.classList.add("insight-highlight");
        window.setTimeout(() => el.classList.remove("insight-highlight"), 1200);
      };
      requestAnimationFrame(tick);
    },
    [navigate, reduce],
  );
}

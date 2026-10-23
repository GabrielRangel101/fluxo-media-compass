import { useHydrated } from "@tanstack/react-router";
import { useReducedMotion } from "framer-motion";

/** Stable SSR/first-client fallback: do not hide content before preferences are available. */
export function useMotionPreference() {
  const hydrated = useHydrated();
  const reduced = useReducedMotion();
  return !hydrated || Boolean(reduced);
}
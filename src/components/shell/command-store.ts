import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const commandStore = {
  get: () => open,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  set(v: boolean) {
    if (open === v) return;
    open = v;
    emit();
  },
  toggle() {
    commandStore.set(!open);
  },
};

export function useCommandOpen(): boolean {
  return useSyncExternalStore(commandStore.subscribe, commandStore.get, () => false);
}

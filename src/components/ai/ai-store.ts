import { useSyncExternalStore } from "react";
import { ask } from "@/lib/dashboard-data";
import type { Answer } from "@/engine/ask";

export interface Turn {
  id: number;
  question: string;
  answer: Answer;
}

interface State {
  open: boolean;
  turns: Turn[];
}

let state: State = { open: false, turns: [] };
let nextId = 1;
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const aiStore = {
  open: () => set({ open: true }),
  close: () => set({ open: false }),
  toggle: () => set({ open: !state.open }),
  clear: () => set({ turns: [] }),
  /** O número vem do motor: ask() só roteia a pergunta e monta a resposta. */
  ask: (question: string) => {
    const q = question.trim();
    if (!q) return;
    set({ open: true, turns: [...state.turns, { id: nextId++, question: q, answer: ask(q) }] });
  },
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => state;

export function useAi(): State {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

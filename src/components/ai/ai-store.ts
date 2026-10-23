import { useSyncExternalStore } from "react";
import type { AiAnswer } from "@/engine/ask";
import { AI_TARGETS, getAiAnswer } from "@/lib/dashboard-data";
import type { AiTargetId } from "@/lib/dashboard-data";

export interface AiExchange {
  id: number;
  question: string;
  /** texto mostrado na pílula do usuário (ex.: "Analisar: Churn mensal") */
  display: string;
  focusId: AiTargetId | null;
  answer?: AiAnswer;
}

export interface AiState {
  active: boolean;
  focusId: AiTargetId | null;
  exchanges: AiExchange[];
  busy: boolean;
  hidden: string[];
  collapsed: boolean;
  error: string;
}

const initial: AiState = { active: false, focusId: null, exchanges: [], busy: false, hidden: [], collapsed: false, error: "" };
let state = initial;
let job = 0;
const listeners = new Set<() => void>();

function set(patch: Partial<AiState> | ((s: AiState) => Partial<AiState>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  if (typeof document !== "undefined") document.documentElement.classList.toggle("ai-on", state.active);
  listeners.forEach((l) => l());
}

export const aiStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  open(focus?: AiTargetId) {
    set({ active: true });
    if (focus) aiStore.focus(focus);
  },
  close() {
    job++;
    set({ active: false, focusId: null, busy: false });
  },
  toggle() {
    if (state.active) aiStore.close();
    else aiStore.open();
  },
  focus(id: AiTargetId) {
    const t = AI_TARGETS[id];
    set({ focusId: id });
    aiStore.ask(t.question, `Analisar: ${t.label}`);
  },
  clearFocus() {
    set({ focusId: null });
  },
  ask(question: string, display?: string) {
    const q = question.trim();
    if (!q || state.busy) return;
    const id = ++job;
    const entry: AiExchange = { id, question: q, display: display ?? q, focusId: state.focusId };
    set((s) => ({ busy: true, error: "", exchanges: [...s.exchanges, entry].slice(-20) }));
    const start = performance.now();
    const run = () => {
      if (job !== id) return;
      try {
        const result = getAiAnswer(q); // cacheado; fora da renderização
        globalThis.setTimeout(() => {
          if (job !== id) return;
          set((s) => ({ busy: false, exchanges: s.exchanges.map((e) => (e.id === id ? { ...e, answer: result } : e)) }));
        }, Math.max(0, 600 - (performance.now() - start)));
      } catch {
        set({ busy: false, error: "Não foi possível concluir a análise. Tente outra pergunta." });
      }
    };
    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 100 });
    else globalThis.setTimeout(run, 0);
  },
  hide(key: string) {
    set((s) => ({ hidden: [...s.hidden, key] }));
  },
  clear() {
    job++;
    set({ exchanges: [], hidden: [], busy: false, focusId: null, error: "" });
  },
  setCollapsed(collapsed: boolean) {
    set({ collapsed });
  },
};

export function useAi(): AiState {
  return useSyncExternalStore(aiStore.subscribe, aiStore.get, () => initial);
}

/** Registra um card como "analisável" no Modo IA. Espalhe o retorno no elemento raiz do card. */
export function useAiTarget(id: AiTargetId | undefined) {
  const { active, focusId } = useAi();
  if (!id) return { props: {}, focused: false };
  const focused = active && focusId === id;
  return {
    focused,
    props: {
      "data-ai-target": id,
      onClickCapture: active
        ? (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (!aiStore.get().busy) aiStore.focus(id);
          }
        : undefined,
    },
  };
}

export type GenItem = { key: string; exchange: AiExchange; card: AiAnswer["cards"][number] | null };

/** Cards gerados visíveis para o foco atual (mais recentes primeiro, no máx. `max`). */
export function visibleGenerated(s: AiState, max = 6): GenItem[] {
  const out: GenItem[] = [];
  for (const ex of [...s.exchanges].reverse()) {
    if (ex.focusId !== s.focusId || !ex.answer) continue;
    const items: GenItem[] = [{ key: `${ex.id}:read`, exchange: ex, card: null }, ...ex.answer.cards.map((c) => ({ key: `${ex.id}:${c.id}`, exchange: ex, card: c }))];
    for (const it of items) {
      if (out.length >= max) return out;
      if (!s.hidden.includes(it.key)) out.push(it);
    }
  }
  return out;
}

import type { AiAnswer } from "@/engine/ask";
export interface Exchange { id: number; question: string; answer?: AiAnswer; hidden: string[]; }
export const INITIAL_SUGGESTIONS = ["Resumo dos principais alertas", "Como está o churn?", "Quem está em risco de cancelar?", "Vamos bater a meta de dezembro?"];
export function appendVisible(items: Exchange[], next: Exchange) { return [...items, next].slice(-3); }

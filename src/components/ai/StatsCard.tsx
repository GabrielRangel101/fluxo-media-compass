import type { AiCard } from "@/engine/ask";
export function StatsCard({ card }: { card: Extract<AiCard, { kind: "stats" }> }) {
  return <dl className="ai-stats">{card.items.map(item => <div key={item.label}><dt>{item.label}</dt><dd className={`ai-tone-${item.tone ?? "neutro"} font-display`}>{item.value}</dd></div>)}</dl>;
}

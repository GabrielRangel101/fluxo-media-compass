import { motion } from "framer-motion";
import type { AiCard } from "@/engine/ask";
import { useMotionPreference } from "@/hooks/use-motion-preference";
import { AI_COLORS, formatAi } from "./format";
export function BarsCard({ card }: { card: Extract<AiCard, { kind: "bars" }> }) {
  const reduced = useMotionPreference();
  const max = Math.max(...card.rows.map(r => Math.abs(r.value)), 1e-9);
  return <div className="ai-bars">{card.rows.map((r, i) => <div key={r.label}>
    <div className="ai-bar-label"><span>{r.label}</span><strong>{formatAi(r.value, card.format)}</strong></div>
    <div className="ai-bar-track"><motion.div initial={{ scaleX: reduced ? 1 : 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduced ? 0 : .5, delay: reduced ? 0 : i * .05 }} style={{ width: `${Math.abs(r.value) / max * 100}%`, background: AI_COLORS[i % 6] }} /></div>
    {r.note && <small className="text-muted-foreground">{r.note}</small>}
  </div>)}</div>;
}

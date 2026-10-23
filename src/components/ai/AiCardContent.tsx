import type { AiCard } from "@/engine/ask";
import { LineCard } from "./LineCard";
import { BarsCard } from "./BarsCard";
import { DonutCard } from "./DonutCard";
import { StatsCard } from "./StatsCard";
import { TableCard } from "./TableCard";
export function AiCardContent({ card }: { card: AiCard }) {
  switch (card.kind) {
    case "line": return <LineCard card={card} />;
    case "bars": return <BarsCard card={card} />;
    case "donut": return <DonutCard card={card} />;
    case "stats": return <StatsCard card={card} />;
    case "table": return <TableCard card={card} />;
  }
}

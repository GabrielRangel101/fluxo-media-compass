import type { AiCard } from "@/engine/ask";
export function TableCard({ card }: { card: Extract<AiCard, { kind: "table" }> }) {
  return <div className="ai-table-scroll" tabIndex={0} aria-label={card.title}><table className="ai-table"><thead><tr>{card.columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead><tbody>{card.rows.map((r, i) => <tr key={i}>{r.map((cell, j) => j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

import { motion } from "framer-motion";
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import type { AiCard } from "@/engine/aiask";
import { useMotionPreference } from "@/hooks/use-motion-preference";
import { Legend, SizedChart } from "@/components/dashboard/primitives";
import { AI_COLORS, formatAi } from "./format";

type Of<K extends AiCard["kind"]> = Extract<AiCard, { kind: K }>;

const tip = { background: "var(--popover)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };

function LineCard({ card }: { card: Of<"line"> }) {
  const reduced = useMotionPreference();
  const data = card.x.map((label, i) => Object.fromEntries([["label", label], ...card.series.map((s, j) => [`s${j}`, s.values[i] ?? null])]));
  return (
    <div>
      <div className="ai-chart" role="img" aria-label={`${card.title}. ${card.series.map((s) => s.name).join(", ")}`}>
        <SizedChart>
          {(w, h) => (
            <LineChart width={w} height={h} data={data} margin={{ top: 14, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} minTickGap={28} axisLine={false} tickLine={false} />
              <YAxis width={52} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickFormatter={(v) => formatAi(Number(v), card.format)} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tip} formatter={(v) => formatAi(Number(v), card.format)} />
              {card.reference && <ReferenceLine y={card.reference.value} stroke="var(--muted-foreground)" strokeDasharray="5 5" ifOverflow="extendDomain" label={{ value: card.reference.label, position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 10 }} />}
              {card.series.map((s, i) => (
                <Line key={s.name} dataKey={`s${i}`} name={s.name} stroke={AI_COLORS[i % 6]} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={!reduced} />
              ))}
            </LineChart>
          )}
        </SizedChart>
      </div>
      {card.series.length > 1 && <Legend className="mt-1" items={card.series.map((s, i) => ({ label: s.name, color: AI_COLORS[i % 6] }))} />}
    </div>
  );
}

function BarsCard({ card }: { card: Of<"bars"> }) {
  const reduced = useMotionPreference();
  const max = Math.max(...card.rows.map((r) => Math.abs(r.value)), 1e-9);
  return (
    <div className="ai-bars">
      {card.rows.map((r, i) => (
        <div key={r.label}>
          <div className="ai-bar-label"><span>{r.label}</span><strong>{formatAi(r.value, card.format)}</strong></div>
          <div className="ai-bar-track">
            <motion.div initial={{ scaleX: reduced ? 1 : 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : i * 0.05 }} style={{ width: `${(Math.abs(r.value) / max) * 100}%`, background: AI_COLORS[i % 6] }} />
          </div>
          {r.note && <small className="text-muted-foreground">{r.note}</small>}
        </div>
      ))}
    </div>
  );
}

function StatsCard({ card }: { card: Of<"stats"> }) {
  return (
    <dl className="ai-stats">
      {card.items.map((it) => (
        <div key={it.label}><dt>{it.label}</dt><dd className={`ai-tone-${it.tone ?? "neutro"} font-display`}>{it.value}</dd></div>
      ))}
    </dl>
  );
}

function TableCard({ card }: { card: Of<"table"> }) {
  return (
    <div className="ai-table-scroll" tabIndex={0} aria-label={card.title}>
      <table className="ai-table">
        <thead><tr>{card.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>{card.rows.map((r, i) => <tr key={i}>{r.map((cell, j) => (j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>))}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function AiCardContent({ card }: { card: AiCard }) {
  switch (card.kind) {
    case "line": return <LineCard card={card} />;
    case "bars": return <BarsCard card={card} />;
    case "stats": return <StatsCard card={card} />;
    case "table": return <TableCard card={card} />;
  }
}

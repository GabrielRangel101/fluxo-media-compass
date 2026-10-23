// Legenda de uma linha para cada card do Modo IA, derivada SOMENTE dos dados do próprio card
// (maior/menor, início/fim, maior fatia). Determinística; nenhuma métrica nova é calculada aqui.

import type { AiCard, AskFormat } from "./ask";

const num = (x: number, d = 0) => x.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

function fmt(v: number, f: AskFormat): string {
  if (f === "pct") return `${num(v * 100, 1)}%`;
  if (f === "brl") return `R$ ${num(v)}`;
  return Math.abs(v) >= 100 ? num(v) : num(v, 1);
}

function fmtDelta(a: number, b: number, f: AskFormat): string {
  const d = b - a;
  if (f === "pct") return `${d >= 0 ? "+" : "−"}${num(Math.abs(d) * 100, 1)} p.p.`;
  return `${d >= 0 ? "+" : "−"}${fmt(Math.abs(d), f)}`;
}

export function cardCaption(card: AiCard): string | null {
  switch (card.kind) {
    case "bars": {
      if (card.rows.length < 2) return null;
      const sorted = [...card.rows].sort((a, b) => b.value - a.value);
      const top = sorted[0];
      const low = sorted[sorted.length - 1];
      return `${top.label} lidera (${fmt(top.value, card.format)}); ${low.label} tem o menor valor (${fmt(low.value, card.format)}).`;
    }
    case "line": {
      const series = card.series
        .map((s) => {
          const pts = s.values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
          return { name: s.name, pts };
        })
        .filter((s) => s.pts.length >= 2);
      if (!series.length) return null;
      if (series.length === 1) {
        const { pts } = series[0];
        const first = pts[0];
        const last = pts[pts.length - 1];
        const peak = [...pts].sort((a, b) => b.v - a.v)[0];
        const ref = card.reference ? ` Referência: ${card.reference.label}.` : "";
        return `De ${fmt(first.v, card.format)} (${card.x[first.i]}) para ${fmt(last.v, card.format)} (${card.x[last.i]}), ${fmtDelta(first.v, last.v, card.format)}; pico de ${fmt(peak.v, card.format)} em ${card.x[peak.i]}.${ref}`;
      }
      const ends = series.map((s) => ({ name: s.name, v: s.pts[s.pts.length - 1].v }));
      const hi = [...ends].sort((a, b) => b.v - a.v)[0];
      const lo = [...ends].sort((a, b) => a.v - b.v)[0];
      return `${hi.name} termina mais alto (${fmt(hi.v, card.format)}); ${lo.name} termina mais baixo (${fmt(lo.v, card.format)}).`;
    }
    case "donut": {
      const total = card.rows.reduce((a, r) => a + r.value, 0);
      if (!total || card.rows.length < 2) return null;
      const sorted = [...card.rows].sort((a, b) => b.value - a.value);
      const top = sorted[0];
      const second = sorted[1];
      return `${top.label} é o maior grupo (${num((top.value / total) * 100, 0)}%), seguido de ${second.label} (${num((second.value / total) * 100, 0)}%).`;
    }
    default:
      return null;
  }
}

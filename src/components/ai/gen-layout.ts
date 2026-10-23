// Geometria pura (apresentação): posiciona cards gerados em slots livres ao redor do foco.
export interface Rect { x: number; y: number; w: number; h: number }
export const GEN_W = 300;
export const GEN_H = 260;
const GAP = 14;

const overlaps = (a: Rect, b: Rect, pad = 12) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

/**
 * Slots determinísticos dentro de `region`, sem tocar `avoid` nem uns aos outros, mais próximos do foco primeiro.
 * Varre posições candidatas em passo fino, então encontra espaço livre mesmo quando o foco é grande.
 */
export function layoutSlots(region: Rect, avoid: Rect[], focus: Rect, count: number): Rect[] {
  const STEP = 16;
  const fx = focus.x + focus.w / 2, fy = focus.y + focus.h / 2;
  const candidates: Rect[] = [];
  for (let y = region.y; y + GEN_H <= region.y + region.h; y += STEP)
    for (let x = region.x; x + GEN_W <= region.x + region.w; x += STEP) {
      const s = { x, y, w: GEN_W, h: GEN_H };
      if (!avoid.some((a) => overlaps(s, a))) candidates.push(s);
    }
  const d = (s: Rect) => Math.hypot(s.x + s.w / 2 - fx, s.y + s.h / 2 - fy);
  candidates.sort((a, b) => d(a) - d(b) || a.y - b.y || a.x - b.x);
  const picked: Rect[] = [];
  for (const s of candidates) {
    if (picked.length >= count) break;
    if (!picked.some((p) => overlaps(s, p, GAP - 12))) picked.push(s);
  }
  return picked;
}

/** Bezier da borda do foco até a borda do card. */
export function threadPath(from: Rect, to: Rect): { d: string; a: [number, number]; b: [number, number] } {
  const fc = [from.x + from.w / 2, from.y + from.h / 2], tc = [to.x + to.w / 2, to.y + to.h / 2];
  const dx = tc[0] - fc[0], dy = tc[1] - fc[1];
  let a: [number, number], b: [number, number], c1: [number, number], c2: [number, number];
  if (Math.abs(dx) * from.h > Math.abs(dy) * from.w) {
    const sx = dx > 0 ? 1 : -1;
    a = [sx > 0 ? from.x + from.w : from.x, fc[1]];
    b = [sx > 0 ? to.x : to.x + to.w, tc[1]];
    const k = Math.max(40, Math.abs(b[0] - a[0]) / 2) * sx;
    c1 = [a[0] + k, a[1]]; c2 = [b[0] - k, b[1]];
  } else {
    const sy = dy > 0 ? 1 : -1;
    a = [fc[0], sy > 0 ? from.y + from.h : from.y];
    b = [tc[0], sy > 0 ? to.y : to.y + to.h];
    const k = Math.max(40, Math.abs(b[1] - a[1]) / 2) * sy;
    c1 = [a[0], a[1] + k]; c2 = [b[0], b[1] - k];
  }
  return { d: `M ${a[0]} ${a[1]} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${b[0]} ${b[1]}`, a, b };
}

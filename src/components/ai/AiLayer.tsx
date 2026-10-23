import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useMotionPreference } from "@/hooks/use-motion-preference";
import { AiPanel } from "./AiPanel";
import { aiStore, useAi, visibleGenerated } from "./ai-store";
import { GEN_H, GEN_W, layoutSlots, threadPath, type Rect } from "./gen-layout";
import { GenCardBody, GenCardHeader, genTitle } from "./GenCard";

const PANEL_W = 400 + 16 + 16;
const TOP = 84;
const toRect = (r: DOMRect): Rect => ({ x: r.left, y: r.top, w: r.width, h: r.height });

function useViewport() {
  const [vp, setVp] = useState({ w: 1440, h: 900, mobile: false });
  useEffect(() => {
    const update = () => setVp({ w: innerWidth, h: innerHeight, mobile: innerWidth < 768 });
    update();
    addEventListener("resize", update);
    return () => removeEventListener("resize", update);
  }, []);
  return vp;
}

/** Camada do Modo IA sobre o dashboard vivo: escurece, eleva o card em foco e espalha os cards gerados. */
export function AiLayer() {
  const s = useAi();
  const reduced = useMotionPreference();
  const vp = useViewport();
  const [focusRect, setFocusRect] = useState<Rect | null>(null);
  const [paths, setPaths] = useState<{ key: string; d: string; a: [number, number]; b: [number, number] }[]>([]);
  const regionRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => visibleGenerated(s), [s]);
  const latest = s.exchanges.at(-1);

  useEffect(() => {
    if (!s.active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") aiStore.close(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [s.active]);

  // foco: mede o card real (permanece no lugar, elevado acima da camada)
  useEffect(() => {
    if (!s.active || !s.focusId) { setFocusRect(null); return; }
    const el = document.querySelector<HTMLElement>(`[data-ai-target="${s.focusId}"]`);
    el?.classList.add("ai-focused");
    const measure = () => el && setFocusRect(toRect(el.getBoundingClientRect()));
    measure();
    addEventListener("resize", measure);
    return () => { el?.classList.remove("ai-focused"); removeEventListener("resize", measure); };
  }, [s.active, s.focusId, vp.w, vp.h]);

  const region: Rect = { x: 16, y: TOP, w: Math.max(GEN_W, vp.w - PANEL_W - 16), h: Math.max(GEN_H, vp.h - TOP - 16) };
  const anchor: Rect = { x: region.x + region.w / 2 - 180, y: TOP, w: 360, h: 40 };
  const avoid = focusRect ? [focusRect] : [anchor];
  const slots = useMemo(() => layoutSlots(region, avoid, focusRect ?? anchor, 6), [region.w, region.h, focusRect?.x, focusRect?.y, focusRect?.w, focusRect?.h]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = items.slice(0, slots.length);

  // linhas seguem o arraste: mede a cada quadro enquanto há cards
  useEffect(() => {
    if (!s.active || vp.mobile || !shown.length) { setPaths([]); return; }
    let raf = 0, last = "";
    const loop = () => {
      const from = s.focusId ? document.querySelector<HTMLElement>(`[data-ai-target="${s.focusId}"]`) : document.getElementById("ai-anchor");
      if (from) {
        const fr = toRect(from.getBoundingClientRect());
        const next = [...document.querySelectorAll<HTMLElement>("[data-gen-card]")].map((c) => ({ key: c.dataset["genCard"]!, ...threadPath(fr, toRect(c.getBoundingClientRect())) }));
        const sig = next.map((p) => p.d).join("|");
        if (sig !== last) { last = sig; setPaths(next); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [s.active, s.focusId, vp.mobile, shown.length]);

  if (!s.active) return null;

  return (
    <>
      <motion.div className="ai-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.25 }} onClick={() => aiStore.clearFocus()} aria-hidden />
      {!vp.mobile && (
        <div className="ai-dark pointer-events-none fixed inset-0 z-[53] bg-transparent">
          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
            <defs>
              <linearGradient id="ai-thread" x1="0" x2="1">
                <stop offset="0" stopColor="#E0A93B" />
                <stop offset="1" stopColor="#E0614F" />
              </linearGradient>
            </defs>
            {paths.map((p) => (
              <g key={p.key}>
                <path d={p.d} stroke="url(#ai-thread)" strokeWidth={1.75} fill="none" opacity={0.85} />
                {!reduced && <path className="ai-thread-pulse" d={p.d} stroke="#FFF3D6" strokeWidth={2.5} fill="none" strokeDasharray="10 240" strokeLinecap="round" />}
                <circle cx={p.a[0]} cy={p.a[1]} r={3.5} fill="#E0A93B" />
                <circle cx={p.b[0]} cy={p.b[1]} r={3.5} fill="#E0614F" />
              </g>
            ))}
          </svg>

          {focusRect && (
            <div className="absolute -translate-x-1/2 rounded-full border border-white/20 bg-[hsl(205_38%_9%)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground shadow-lg" style={{ left: focusRect.x + focusRect.w / 2, top: Math.max(4, focusRect.y - 14) }}>
              Em análise · {items.length} {items.length === 1 ? "leitura" : "leituras"}
            </div>
          )}
          {!s.focusId && latest && (
            <div id="ai-anchor" className="pointer-events-auto absolute flex items-center justify-center gap-2 truncate rounded-full px-4 text-xs font-medium text-primary-foreground shadow-lg" style={{ left: anchor.x, top: anchor.y, width: anchor.w, height: anchor.h, background: "var(--gradient-primary)" }}>
              <Sparkles className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{latest.display}</span>
            </div>
          )}

          <div ref={regionRef} className="absolute" style={{ left: 0, top: TOP - 8, width: vp.w - PANEL_W, height: vp.h - TOP }} />
          <AnimatePresence>
            {shown.map((item, i) => {
              const slot = slots[i];
              return (
                <motion.article
                  key={item.key}
                  data-gen-card={item.key}
                  aria-label={genTitle(item)}
                  className="ai-gen-card pointer-events-auto absolute flex cursor-grab flex-col gap-2 overflow-hidden rounded-2xl p-3 active:cursor-grabbing"
                  style={{ left: slot.x, top: slot.y, width: GEN_W, height: GEN_H }}
                  drag
                  dragConstraints={regionRef}
                  dragMomentum={false}
                  dragElastic={0}
                  initial={reduced ? false : { opacity: 0, scale: 0.85, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: reduced ? 1 : 0.9 }}
                  transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 24, delay: i * 0.08 }}
                >
                  <GenCardHeader item={item} title={genTitle(item)} />
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1" onPointerDown={(e) => item.card === null && e.stopPropagation()}>
                    <GenCardBody item={item} busy={s.busy} />
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      )}
      <AiPanel mobile={vp.mobile} />
    </>
  );
}

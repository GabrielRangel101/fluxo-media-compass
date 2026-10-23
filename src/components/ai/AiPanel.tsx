import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, ChevronUp, Trash2, X } from "lucide-react";
import { getAiAnswer, getDashboardData } from "@/lib/dashboard-data";
import { useMotionPreference } from "@/hooks/use-motion-preference";
import { cn } from "@/lib/utils";
import { aiStore, useAi, type AiExchange } from "./ai-store";
import { GenCardBody, GenCardHeader } from "./GenCard";

function Typed({ text, animate }: { text: string; animate: boolean }) {
  const [count, setCount] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate) { setCount(text.length); return; }
    setCount(0);
    const start = performance.now();
    const t = setInterval(() => {
      const n = Math.floor((performance.now() - start) * 0.6);
      setCount(n);
      if (n >= text.length) clearInterval(t);
    }, 30);
    return () => clearInterval(t);
  }, [text, animate]);
  return (
    <button type="button" className="block w-full text-left text-xs leading-relaxed text-foreground" aria-label="Mostrar resposta completa" onClick={() => setCount(text.length)}>
      <span aria-hidden>{text.slice(0, count)}</span>
    </button>
  );
}

function ExchangeView({ ex, last, mobile, reduced, busy }: { ex: AiExchange; last: boolean; mobile: boolean; reduced: boolean; busy: boolean }) {
  const a = ex.answer;
  return (
    <li className="flex flex-col gap-2">
      <p className="ml-auto max-w-[85%] rounded-full px-3 py-1.5 text-xs font-medium text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>{ex.display}</p>
      {!a ? (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">analisando… <span className="ai-dots" aria-hidden><i /><i /><i /></span></p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-foreground">{a.title}</p>
          <Typed text={a.text} animate={last && !reduced} />
          {last && <p className="sr-only" aria-live="polite">{a.text}</p>}
          {!!a.basedOn.length && (
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              <span>Com base em:</span>
              {a.basedOn.map((b) => <span key={b} className="inline-flex items-center gap-1 rounded border border-white/15 px-1.5 py-0.5"><Check className="size-3" aria-hidden />{b}</span>)}
            </div>
          )}
          {a.cards.slice(0, 2).map((c) => (
            <div key={c.id} className="rounded-lg border border-[hsl(38_70%_55%/0.3)] bg-white/5 px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(38_85%_62%)]">Nota do Meridiano · {a.basedOn[0] ?? "dashboard"}</p>
              <p className="mt-0.5 text-xs text-foreground">{c.title}</p>
            </div>
          ))}
          {mobile && (
            <div className="flex flex-col gap-2">
              {[null, ...a.cards].map((card) => {
                const item = { key: `${ex.id}:${card?.id ?? "read"}`, exchange: ex, card };
                return (
                  <article key={item.key} className="ai-gen-card rounded-xl p-3">
                    <GenCardHeader item={item} title={card?.title ?? "Leitura do Meridiano"} />
                    <div className="mt-2"><GenCardBody item={item} busy={busy} compact /></div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** Painel "Pergunte ao Meridiano": conversa, respostas digitadas, fontes e campo de pergunta. */
export function AiPanel({ mobile }: { mobile: boolean }) {
  const s = useAi();
  const reduced = useMotionPreference();
  const [q, setQ] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const suggestions = useMemo(() => getAiAnswer("?").followUps.slice(0, 3), []);
  const agenda = useMemo(() => getDashboardData().agenda, []);
  const edition = useMemo(() => getDashboardData().current.label, []);
  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: reduced ? "instant" : "smooth" }); }, [s.exchanges, reduced]);
  const collapsed = s.collapsed;

  return (
    <aside
      aria-label="Pergunte ao Meridiano"
      className={cn(
        "ai-dark ai-panel fixed z-[55] flex flex-col overflow-hidden text-foreground",
        mobile ? "inset-x-0 bottom-0 max-h-[80dvh] rounded-t-2xl" : "right-4 top-[84px] w-[400px] rounded-2xl",
        !mobile && (collapsed ? "h-auto" : "bottom-4"),
        mobile && !collapsed && "h-[80dvh]",
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2.5">
        <span className="rounded-full bg-[hsl(8_70%_45%)] px-2.5 py-1 text-[11px] font-bold text-white">✦ Pergunte ao Meridiano</span>
        <button type="button" onClick={() => aiStore.clear()} className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-white/10 hover:text-foreground">
          <Trash2 className="size-3.5" aria-hidden />Nova conversa
        </button>
        <button type="button" aria-label={collapsed ? "Expandir painel" : "Recolher painel"} onClick={() => aiStore.setCollapsed(!collapsed)} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground">
          {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </button>
        {mobile && <button type="button" aria-label="Sair da mesa de análise" onClick={() => aiStore.close()} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-white/10"><X className="size-4" /></button>}
      </header>
      {!collapsed && (
        <>
          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {s.exchanges.length === 0 ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[hsl(38_85%_62%)]">Pauta do dia · edição {edition}</p>
                <ol className="mt-2 flex flex-col gap-1.5">
                  {agenda.map((a, i) => (
                    <li key={a.id}>
                      <button type="button" disabled={s.busy} onClick={() => aiStore.ask(a.question, `Pauta: ${a.title}`)} className="flex w-full items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-left hover:bg-white/10 disabled:opacity-50">
                        <span className="font-display text-lg leading-none text-[hsl(8_74%_62%)]">{i + 1}</span>
                        <span className="min-w-0 flex-1 text-xs leading-snug text-foreground">{a.title}</span>
                        {a.displayValue && <strong className="shrink-0 text-xs tabular-nums text-foreground">{a.displayValue}</strong>}
                      </button>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">Os três achados mais graves do motor de regras. Clique num para aprofundar, num card destacado para analisá-lo, ou pergunte sobre o quadro. Tudo roda no navegador, com dados sintéticos.</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-4">
                {s.exchanges.map((ex, i) => <ExchangeView key={ex.id} ex={ex} last={i === s.exchanges.length - 1} mobile={mobile} reduced={reduced} busy={s.busy} />)}
              </ul>
            )}
            {s.error && <p role="alert" className="mt-2 text-xs text-danger">{s.error}</p>}
          </div>
          <footer className="shrink-0 border-t border-white/10 p-3">
            {s.exchanges.length === 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {suggestions.map((sg) => <button key={sg} type="button" onClick={() => aiStore.ask(sg)} className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-foreground hover:bg-white/10">{sg}</button>)}
              </div>
            )}
            <form className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 py-1 pl-3 pr-1" onSubmit={(e) => { e.preventDefault(); if (q.trim() && !s.busy) { aiStore.ask(q); setQ(""); } }}>
              <label htmlFor="ai-question-input" className="sr-only">Pergunte sobre as assinaturas</label>
              <input id="ai-question-input" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pergunte sobre as assinaturas…" className="min-w-0 flex-1 bg-transparent py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground" />
              <button type="submit" disabled={!q.trim() || s.busy} aria-label="Enviar pergunta" className="grid size-8 place-items-center rounded-lg text-primary-foreground disabled:opacity-40" style={{ background: "var(--gradient-primary)" }}><ArrowUp className="size-4" /></button>
            </form>
          </footer>
        </>
      )}
    </aside>
  );
}

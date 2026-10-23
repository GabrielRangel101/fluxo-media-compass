import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CornerDownLeft, LayoutDashboard, MessageCircle, Search, Sparkles } from "lucide-react";
import { aiStore } from "@/components/ai/ai-store";
import { AI_TARGETS, CARD_INDEX, getDashboardData } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";
import { commandStore, useCommandOpen } from "./command-store";
import { useGoToCard } from "./use-go-to-card";
import { VIEWS } from "./views";

interface Item {
  key: string;
  group: "Ir para" | "Cards" | "Pauta do dia" | "Perguntar";
  label: string;
  hint?: string;
  run: () => void;
}

/** minúsculas e sem acento, para busca tolerante */
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Barra de comandos (Ctrl/⌘ + K): ir para uma aba ou card, abrir a pauta do dia ou perguntar ao Meridiano. */
export function CommandBar() {
  const open = useCommandOpen();
  const navigate = useNavigate();
  const goTo = useGoToCard();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        commandStore.toggle();
      } else if (e.key === "Escape" && commandStore.get()) {
        commandStore.set(false);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const data = getDashboardData();
    const done = () => commandStore.set(false);
    const leaveAi = () => { if (aiStore.get().active) aiStore.close(); };
    const ask = (question: string, display?: string) => () => { done(); aiStore.open(); aiStore.ask(question, display); };
    const list: Item[] = [];
    for (const v of VIEWS) list.push({ key: `v:${v.id}`, group: "Ir para", label: v.label, run: () => { done(); leaveAi(); void navigate({ to: "/", search: { view: v.id } }); } });
    for (const c of CARD_INDEX) {
      const view = VIEWS.find((v) => v.id === c.view);
      list.push({ key: `c:${c.id}`, group: "Cards", label: c.label, hint: view?.label, run: () => { done(); leaveAi(); goTo(c.view, c.id); } });
    }
    for (const a of data.agenda) list.push({ key: `a:${a.id}`, group: "Pauta do dia", label: a.title, hint: a.displayValue ?? undefined, run: ask(a.question, `Pauta: ${a.title}`) });
    const seen = new Set<string>();
    for (const t of Object.values(AI_TARGETS)) {
      if (seen.has(t.question)) continue;
      seen.add(t.question);
      list.push({ key: `q:${t.question}`, group: "Perguntar", label: t.question, run: ask(t.question) });
    }
    return list;
  }, [navigate, goTo]);

  const results = useMemo<Item[]>(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    const matched = terms.length ? items.filter((i) => terms.every((t) => norm(`${i.label} ${i.hint ?? ""} ${i.group}`).includes(t))) : items.filter((i) => i.group !== "Cards").slice(0, 16);
    const free: Item[] = q.trim()
      ? [{ key: "free", group: "Perguntar", label: `Perguntar ao Meridiano: “${q.trim()}”`, run: () => { commandStore.set(false); aiStore.open(); aiStore.ask(q.trim()); } }]
      : [];
    // sem busca: lista padrão; com busca: o que casou primeiro e a pergunta livre por último (ou sozinha, se nada casou)
    return [...matched, ...free].slice(0, 30);
  }, [items, q]);

  useEffect(() => setIdx(0), [q]);
  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); results[idx]?.run(); }
    else if (e.key === "Escape") { e.stopPropagation(); commandStore.set(false); }
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-foreground/30 px-3 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && commandStore.set(false)}>
      <div role="dialog" aria-modal="true" aria-label="Barra de comandos" className="glass flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl shadow-2xl">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={results[idx] ? `cmd-${results[idx].key}` : undefined}
            placeholder="Ir para uma aba ou card, ou perguntar ao Meridiano…"
            className="min-w-0 flex-1 bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">Esc</kbd>
        </div>
        <ul id="command-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-6 text-center text-xs text-muted-foreground">Nada encontrado. Pressione Enter para perguntar ao Meridiano.</li>}
          {results.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            const Icon = r.group === "Perguntar" ? MessageCircle : r.group === "Pauta do dia" ? Sparkles : LayoutDashboard;
            return (
              <li key={r.key} role="presentation">
                {header && <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{header}</p>}
                <button
                  id={`cmd-${r.key}`}
                  type="button"
                  role="option"
                  aria-selected={i === idx}
                  onMouseMove={() => setIdx(i)}
                  onClick={r.run}
                  className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-foreground", i === idx && "bg-primary/10")}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  {r.hint && <span className="shrink-0 text-[11px] text-muted-foreground">{r.hint}</span>}
                  {i === idx && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Database, Send, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Answer } from "@/engine/ask";
import { aiStore, useAi } from "./ai-store";

const SUGGESTIONS = [
  "Qual canal paga o próprio custo em 90 dias?",
  "Como está a coleta de dados?",
  "Mova 20% do DV360 para o Google",
  "Quais testes A/B posso ler?",
  "Qual o CAC por canal?",
];

function AnswerView({ a }: { a: Answer }) {
  return (
    <div className="space-y-2.5 rounded-xl border bg-card p-3 text-sm">
      <h3 className="text-[13px] font-semibold">{a.title}</h3>
      {a.paragraphs.map((p, i) => (
        <p key={i} className="leading-relaxed text-muted-foreground">
          {p}
        </p>
      ))}
      {a.table ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[20rem] border-collapse text-xs">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                {a.table.head.map((h, i) => (
                  <th key={h} className={i === 0 ? "py-1.5 pr-2" : "px-2 py-1.5 text-right"}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {a.table.rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  {r.map((c, j) => (
                    <td key={j} className={j === 0 ? "py-1.5 pr-2" : "tnum px-2 py-1.5 text-right"}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {a.sql.map((f) => (
          <Link key={f} to="/" search={{ view: "sql", file: f }} onClick={() => aiStore.close()} className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">
            <Database className="size-3" aria-hidden />
            {f}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {a.followUps.map((f) => (
          <button key={f} type="button" onClick={() => aiStore.ask(f)} className="rounded-full border bg-secondary px-2.5 py-1 text-[11px] hover:bg-accent">
            {f}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AiPanel() {
  const { open, turns } = useAi();
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  const submit = () => {
    if (!text.trim()) return;
    aiStore.ask(text);
    setText("");
  };

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? aiStore.open() : aiStore.close())}>
      <SheetContent side="right" className="flex w-full flex-col gap-3 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Mesa de análise</SheetTitle>
          <SheetDescription>
            Pergunte em português. Os números vêm do motor de métricas; a resposta indica a consulta SQL de origem. Nenhum número é calculado por IA.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {turns.length === 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => aiStore.ask(s)} className="rounded-full border bg-secondary px-3 py-1.5 text-xs hover:bg-accent">
                  {s}
                </button>
              ))}
            </div>
          ) : (
            turns.map((t) => (
              <div key={t.id} className="space-y-2">
                <p className="ml-auto w-fit max-w-[90%] rounded-xl bg-primary px-3 py-1.5 text-sm text-primary-foreground">{t.question}</p>
                <AnswerView a={t.answer} />
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ex.: por que o CPI do TikTok subiu?"
            aria-label="Pergunta"
            className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
          />
          <button type="submit" aria-label="Enviar" className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <Send className="size-4" aria-hidden />
          </button>
          {turns.length > 0 ? (
            <button type="button" onClick={() => aiStore.clear()} aria-label="Limpar conversa" className="grid size-9 place-items-center rounded-md border text-muted-foreground hover:text-foreground">
              <Trash2 className="size-4" aria-hidden />
            </button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}

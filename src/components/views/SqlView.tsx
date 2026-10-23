import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Panel } from "@/components/dashboard/primitives";
import { SQL_FILES } from "@/lib/sql-files";
import { cn } from "@/lib/utils";

export function SqlView({ file }: { file?: string }) {
  const initial = SQL_FILES.find((f) => f.file === file) ?? SQL_FILES[1]!;
  const [selected, setSelected] = useState(initial.file);
  const [copied, setCopied] = useState(false);
  const cur = SQL_FILES.find((f) => f.file === selected) ?? initial;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cur.source);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* sem permissão de área de transferência */
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <Panel id="card-sql-lista" title="Pacote SQL" info="Cada consulta tem um teste automático que a executa sobre o mesmo dataset e exige o mesmo resultado do motor TypeScript.">
        <ul className="space-y-1">
          {SQL_FILES.map((f) => (
            <li key={f.file}>
              <button
                type="button"
                onClick={() => setSelected(f.file)}
                aria-current={f.file === selected}
                className={cn("w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors", f.file === selected ? "bg-accent text-accent-foreground" : "hover:bg-secondary")}
              >
                <div className="font-mono text-xs">{f.file}</div>
                <div className="text-[13px] font-medium">{f.title}</div>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel
        id="card-sql-codigo"
        title={cur.title}
        actions={
          <button type="button" onClick={copy} className="inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">
            {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        }
      >
        <p className="mb-3 text-sm text-muted-foreground"><strong className="text-foreground">Alimenta:</strong> {cur.feeds}</p>
        <pre className="max-h-[34rem] overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed"><code>{cur.source}</code></pre>
        <p className="mt-3 text-xs text-muted-foreground">
          Dialeto SQLite. Parâmetros nomeados (<code>:from</code>, <code>:to</code>, <code>:ref</code>…) estão descritos no cabeçalho de cada arquivo. Para rodar localmente: <code>node scripts/build-db.ts</code> gera <code>data/fluxo.sqlite</code>.
        </p>
      </Panel>
    </div>
  );
}

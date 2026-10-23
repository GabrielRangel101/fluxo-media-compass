import { Panel } from "@/components/dashboard/primitives";
import { fmtInt } from "@/lib/format";
import type { DashboardData } from "@/lib/dashboard-data";
import type { TestResult, TestVerdict } from "@/engine/experiments";
import { cn } from "@/lib/utils";

const VERDICT: Record<TestVerdict, { label: string; cls: string }> = {
  winner_a: { label: "Vence A", cls: "bg-positive/12 text-positive border-positive/30" },
  winner_b: { label: "Vence B", cls: "bg-positive/12 text-positive border-positive/30" },
  no_difference: { label: "Sem diferença", cls: "bg-muted text-muted-foreground border-border" },
  underpowered: { label: "Amostra insuficiente", cls: "bg-warning/12 text-warning border-warning/35" },
  srm: { label: "SRM: não confiável", cls: "bg-danger/12 text-danger border-danger/35" },
};
const TYPE = { creative: "Criativo", audience: "Público", bid: "Lance" } as const;
const pct = (x: number, d = 2) => `${(x * 100).toFixed(d).replace(".", ",")}%`;
const signed = (x: number | null) => (x === null ? "—" : `${x >= 0 ? "+" : "−"}${(Math.abs(x) * 100).toFixed(0)}%`);

function Variant({ t, v }: { t: TestResult; v: "A" | "B" }) {
  const r = v === "A" ? t.a : t.b;
  const rate = v === "A" ? t.primary.pA : t.primary.pB;
  const ctr = v === "A" ? t.ctr.pA : t.ctr.pB;
  const winner = (t.verdict === "winner_a" && v === "A") || (t.verdict === "winner_b" && v === "B");
  return (
    <div className={cn("rounded-lg border p-3", winner && "border-positive/50 bg-positive/5")}>
      <div className="mb-1 flex items-center justify-between text-xs font-semibold text-muted-foreground">
        <span>Variante {v}</span>
        {winner ? <span className="text-positive">vencedora</span> : null}
      </div>
      <div className="tnum text-xl font-semibold">{(rate * 1000).toFixed(2).replace(".", ",")}</div>
      <div className="text-[11px] text-muted-foreground">instalações por mil impressões</div>
      <dl className="tnum mt-2 grid grid-cols-3 gap-1 text-xs">
        <div><dt className="text-muted-foreground">Impr.</dt><dd>{fmtInt(r.impressions)}</dd></div>
        <div><dt className="text-muted-foreground">CTR</dt><dd>{pct(ctr)}</dd></div>
        <div><dt className="text-muted-foreground">Instalações</dt><dd>{fmtInt(r.installs)}</dd></div>
      </dl>
    </div>
  );
}

export function TestesView({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-4">
      <Panel
        id="card-testes" ai="card-testes"
        title="Como cada teste é lido"
        sql="06_ab_tests.sql"
        info="Métrica primária: instalações por impressão (vale também para DV360, com view-through). Teste z de duas proporções, bicaudal, 5%. A significância roda no motor TypeScript; o SQL entrega as taxas e a divisão de impressões."
      >
        <ol className="grid gap-2 text-sm sm:grid-cols-3">
          <li className="rounded-lg bg-secondary p-3"><strong>1 · SRM.</strong> A divisão de impressões bate 50/50? Se não, o teste não randomizou e nada mais importa.</li>
          <li className="rounded-lg bg-secondary p-3"><strong>2 · Amostra.</strong> Pelo menos 100 instalações por variante. Abaixo disso, um p baixo é sorte provável.</li>
          <li className="rounded-lg bg-secondary p-3"><strong>3 · Significância.</strong> Só então: p &lt; 0,05 declara vencedor.</li>
        </ol>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        {data.tests.map((t) => {
          const v = VERDICT[t.verdict];
          return (
            <Panel key={t.testId} title={`${t.testId} · ${t.channelLabel} · ${TYPE[t.type]}`} actions={<span className={cn("rounded-md border px-2 py-0.5 text-[11px] font-semibold", v.cls)}>{v.label}</span>}>
              <h3 className="mb-3 text-sm font-semibold">{t.name}</h3>
              <div className="grid grid-cols-2 gap-3">
                <Variant t={t} v="A" />
                <Variant t={t} v="B" />
              </div>
              <div className="tnum mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <span>Lift B vs. A: <strong className="text-foreground">{signed(t.primary.lift)}</strong></span>
                <span>p = <strong className="text-foreground">{t.primary.p.toFixed(3).replace(".", ",")}</strong></span>
                <span>Lift de CTR: <strong className="text-foreground">{signed(t.ctr.lift)}</strong></span>
              </div>
              <p className="mt-2 text-sm leading-relaxed">{t.note}</p>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

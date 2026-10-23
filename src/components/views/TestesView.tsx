import { DataDetails, Legend, Panel, SizedChart } from "@/components/dashboard/primitives";
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

const VERDICT_COLOR: Record<TestVerdict, string> = {
  winner_a: "var(--positive)", winner_b: "var(--positive)", no_difference: "var(--muted-foreground)", underpowered: "var(--warning)", srm: "var(--danger)",
};

/** Floresta de lifts: ponto = lift de B sobre A, barra = IC 95%. Barra que cruza 0 = sem evidência de diferença. */
function LiftForest({ data, w }: { data: DashboardData; w: number }) {
  const rows = data.tests.map((t, i) => ({ t, ci: data.testCi[i] ?? null }));
  const LABEL = Math.min(210, w * 0.38), R = 24, ROW = 38, TOP = 8, H = TOP + rows.length * ROW + 26;
  const vals = rows.flatMap((r) => (r.ci ? [r.ci.lo, r.ci.hi] : [r.t.primary.lift ?? 0]));
  const lim = Math.max(0.1, Math.ceil(Math.max(...vals.map(Math.abs)) * 10) / 10);
  const x = (v: number) => LABEL + ((v + lim) / (2 * lim)) * (w - LABEL - R);
  const ticks = [-lim, -lim / 2, 0, lim / 2, lim];
  return (
    <svg width={w} height={H} role="img" aria-label="Lift de cada teste com intervalo de confiança de 95%">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={TOP} y2={H - 22} stroke={v === 0 ? "var(--foreground)" : "var(--chart-grid)"} strokeWidth={v === 0 ? 1.25 : 1} strokeDasharray={v === 0 ? undefined : "3 3"} />
          <text x={x(v)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">{v > 0 ? "+" : v < 0 ? "−" : ""}{Math.abs(Math.round(v * 100))}%</text>
        </g>
      ))}
      {rows.map(({ t, ci }, i) => {
        const y = TOP + i * ROW + ROW / 2, c = VERDICT_COLOR[t.verdict], lift = t.primary.lift;
        return (
          <g key={t.testId}>
            <title>{`${t.testId} · ${t.channelLabel}: lift ${signed(lift)}${ci ? `, IC 95% de ${signed(ci.lo)} a ${signed(ci.hi)}` : ""}. ${VERDICT[t.verdict].label}.`}</title>
            <text x={0} y={y + 4} fontSize={12} fill="var(--foreground)">{t.testId} · {t.channelLabel}</text>
            {ci ? <line x1={x(ci.lo)} x2={x(ci.hi)} y1={y} y2={y} stroke={c} strokeWidth={3} strokeLinecap="round" opacity={0.55} /> : null}
            {lift !== null ? <circle cx={x(lift)} cy={y} r={5.5} fill={c} stroke="var(--card)" strokeWidth={2} /> : null}
          </g>
        );
      })}
    </svg>
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
      <Panel id="card-lift" ai="card-lift" title="Lift por teste, com intervalo de 95%" sql="06_ab_tests.sql" info="Ponto: lift de B sobre A em instalações por impressão. Barra: intervalo de 95%. Quando a barra cruza o zero, o teste não separa A de B. Testes com SRM aparecem em vermelho: a barra não vale, a divisão de tráfego quebrou.">
        <Legend className="mb-2" items={[{ label: "Há vencedor", color: "var(--positive)", kind: "dot" }, { label: "Sem diferença", color: "var(--muted-foreground)", kind: "dot" }, { label: "Amostra insuficiente", color: "var(--warning)", kind: "dot" }, { label: "SRM: não confiável", color: "var(--danger)", kind: "dot" }]} />
        <div style={{ height: 38 * data.tests.length + 34 }}>
          <SizedChart>{(w) => <LiftForest data={data} w={w} />}</SizedChart>
        </div>
        <DataDetails
          head={["Teste", "Lift B vs. A", "IC 95%", "p", "Leitura"]}
          rows={data.tests.map((t, i) => { const ci = data.testCi[i]; return [`${t.testId} · ${t.channelLabel}`, signed(t.primary.lift), ci ? `${signed(ci.lo)} a ${signed(ci.hi)}` : "—", t.primary.p.toFixed(3).replace(".", ","), VERDICT[t.verdict].label]; })}
        />
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

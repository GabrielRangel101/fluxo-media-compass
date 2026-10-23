import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { whatIf, NO_CHANGE } from "@/engine/whatif";
import type { WhatIfParams, WhatIfResult } from "@/engine/whatif";
import { Slider } from "@/components/ui/slider";
import type { DashboardData } from "@/lib/dashboard-data";
import { fmtBRLCompact, fmtInt, fmtPct, fmtSignedInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GlassTooltip } from "./ChartTooltip";
import { DashCard } from "./DashCard";
import { AXIS_TICK } from "./EvolutionChart";

const pp = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")} p.p.`;
const pct0 = (x: number) => `${Math.round(x * 100)}%`;

export function SimulatorView({ data }: { data: DashboardData }) {
  const [params, setParams] = useState<WhatIfParams>(NO_CHANGE);
  const result = useMemo(() => whatIf(data.series, data.proj, params), [data.series, data.proj, params]);
  const set = (patch: Partial<WhatIfParams>) => setParams((p) => ({ ...p, ...patch }));

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:h-full xl:grid-cols-12">
      <Levers result={result} params={params} set={set} setAll={setParams} className="md:col-span-2 xl:col-span-4 xl:h-auto" />
      <div className="flex min-h-0 flex-col gap-3 md:col-span-2 xl:col-span-8">
        <Tiles result={result} />
        <PathChart result={result} now={data.current.label} className="h-[340px] xl:h-auto xl:flex-1" />
        <Required result={result} set={set} />
      </div>
    </div>
  );
}

function Levers({ result, params, set, setAll, className }: { result: WhatIfResult; params: WhatIfParams; set: (p: Partial<WhatIfParams>) => void; setAll: (p: WhatIfParams) => void; className?: string }) {
  const b = result.base;
  const closeGoal = () => setAll({ ...params, acquisitionLift: Math.min(2, result.extraLiftToGoal ?? 0) + params.acquisitionLift });
  return (
    <DashCard
      id="simulator-card"
      ai="simulator"
      title="Simulador · e se…"
      info="Três alavancas aplicadas sobre a mesma projeção do gráfico de evolução. O efeito é acumulado mês a mês até a meta; o churn e a aquisição de partida são a média dos últimos 3 meses."
      summary={`base: churn ${fmtPct(b.churn, 1)} · ${fmtInt(b.newPerMonth)} novas/mês`}
      className={className}
      bodyClassName="gap-5"
    >
      <Lever
        label="Reduzir o churn voluntário"
        value={params.churnCut > 0 ? `−${pp(params.churnCut)}` : pp(0)}
        hint={`churn voluntário hoje: ${fmtPct(b.voluntaryChurn, 1)} ao mês`}
        min={0}
        max={Math.round(Math.min(0.03, b.voluntaryChurn) * 1000)}
        step={1}
        current={Math.round(params.churnCut * 1000)}
        onChange={(v) => set({ churnCut: v / 1000 })}
      />
      <Lever
        label="Recuperar falhas de pagamento"
        value={pct0(params.paymentRecovery)}
        hint={`falha de pagamento = ${fmtPct(b.involuntaryShare, 0)} dos cancelamentos (${fmtPct(b.involuntaryChurn, 2)} ao mês)`}
        min={0}
        max={100}
        step={5}
        current={Math.round(params.paymentRecovery * 100)}
        onChange={(v) => set({ paymentRecovery: v / 100 })}
      />
      <Lever
        label="Aumentar a aquisição"
        value={params.acquisitionLift > 0 ? `+${pct0(params.acquisitionLift)}` : "0%"}
        hint={`hoje: ${fmtInt(b.newPerMonth)} novas assinaturas por mês`}
        min={0}
        max={100}
        step={5}
        current={Math.round(params.acquisitionLift * 100)}
        onChange={(v) => set({ acquisitionLift: v / 100 })}
      />
      <div className="flex flex-wrap gap-2 pt-3">
        <Chip onClick={() => setAll({ churnCut: 0.01, paymentRecovery: 0.3, acquisitionLift: 0 })}>Cenário prudente</Chip>
        <Chip onClick={closeGoal} disabled={result.hitsGoal || result.extraLiftToGoal === null}>Fechar a meta com aquisição</Chip>
        <Chip onClick={() => setAll(NO_CHANGE)}>Zerar</Chip>
      </div>
      <div className="mt-auto hidden space-y-1.5 rounded-lg bg-secondary/50 p-3 text-[11px] leading-relaxed text-muted-foreground xl:block">
        <p className="font-semibold text-foreground">Como usar</p>
        <p><strong className="text-foreground">Churn voluntário:</strong> quantos pontos você corta do cancelamento por decisão do cliente (preço, pouco uso, concorrente).</p>
        <p><strong className="text-foreground">Falhas de pagamento:</strong> parcela dos cartões recusados que você recupera com nova tentativa ou aviso antes do vencimento.</p>
        <p><strong className="text-foreground">Aquisição:</strong> quanto as novas assinaturas mensais crescem sobre o ritmo atual.</p>
        <p>O gráfico compara a projeção atual (tracejada) com o cenário. Embaixo, &quot;só com…&quot; mostra quanto cada alavanca precisaria render sozinha para bater a meta.</p>
      </div>
    </DashCard>
  );
}

function Lever({ label, value, hint, min, max, step, current, onChange }: { label: string; value: string; hint: string; min: number; max: number; step: number; current: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <strong className="font-display text-xl tabular-nums text-brand">{value}</strong>
      </div>
      <Slider min={min} max={max} step={step} value={[Math.min(max, current)]} onValueChange={(v) => onChange(v[0] ?? 0)} aria-label={label} />
      <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function Chip({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="rounded-full border px-3 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-40">
      {children}
    </button>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="dash-card flex min-w-0 flex-col justify-between gap-1 p-3">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <span className={cn("font-display text-2xl tabular-nums", tone === "good" ? "text-positive" : tone === "bad" ? "text-danger" : "text-foreground")}>{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function Tiles({ result: r }: { result: WhatIfResult }) {
  return (
    <section aria-label="Resultado do cenário" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Tile label={`Assinantes ${r.goalLabel}`} value={fmtInt(r.scenarioActive)} sub={<>projeção atual {fmtInt(r.baseActive)} · <strong className={r.deltaActive > 0 ? "text-positive" : ""}>{fmtSignedInt(r.deltaActive)}</strong></>} />
      <Tile label={`MRR ${r.goalLabel}`} value={fmtBRLCompact(r.scenarioMrr)} sub={<>projeção atual {fmtBRLCompact(r.baseMrr)} · <strong className={r.deltaMrr > 0 ? "text-positive" : ""}>{r.deltaMrr === 0 ? "" : r.deltaMrr > 0 ? "+" : "−"}{fmtBRLCompact(Math.abs(r.deltaMrr))}</strong></>} />
      <Tile label="Meta" value={fmtInt(r.goal)} sub={`${r.goalLabel} · ${r.hitsGoal ? "meta atingida" : "ainda não atinge"}`} />
      <Tile label={r.hitsGoal ? "Folga sobre a meta" : "Falta para a meta"} value={fmtInt(Math.abs(r.scenarioGap))} tone={r.hitsGoal ? "good" : "bad"} sub={`antes: ${r.baseGap > 0 ? "faltavam" : "sobravam"} ${fmtInt(Math.abs(r.baseGap))}`} />
    </section>
  );
}

function PathChart({ result: r, now, className }: { result: WhatIfResult; now: string; className?: string }) {
  const rows = useMemo(() => [{ label: now, base: r.base.activeNow, scenario: r.base.activeNow }, ...r.points], [r.points, r.base.activeNow, now]);
  const lo = Math.floor((Math.min(...rows.map((x) => x.base)) * 0.98) / 50) * 50;
  const hi = Math.ceil((Math.max(r.goal, ...rows.map((x) => x.scenario)) * 1.015) / 50) * 50;
  return (
    <DashCard title="Caminho até a meta" info="Linha tracejada: projeção atual (a mesma do gráfico de evolução). Linha cheia: cenário com as alavancas." summary={`${r.goalLabel}: ${fmtInt(r.scenarioActive)} vs meta ${fmtInt(r.goal)}`} className={className}>
      <div className="flex shrink-0 gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 rounded bg-primary" aria-hidden />cenário</span>
        <span className="inline-flex items-center gap-1"><span className="h-0 w-4 border-t-2 border-dashed border-muted-foreground" aria-hidden />projeção atual</span>
        <span className="inline-flex items-center gap-1"><span className="h-0 w-4 border-t-2 border-dashed border-accent" aria-hidden />meta</span>
      </div>
      <div className="min-h-0 flex-1" role="img" aria-label={`Projeção de assinantes até ${r.goalLabel}: atual ${fmtInt(r.baseActive)}, cenário ${fmtInt(r.scenarioActive)}, meta ${fmtInt(r.goal)}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 12, right: 24, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} domain={[lo, hi]} tickFormatter={(v: number) => fmtInt(v)} />
            <ReferenceLine y={r.goal} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="6 4" label={{ value: `Meta ${fmtInt(r.goal)}`, position: "insideTopLeft", fill: "var(--warning)", fontSize: 11, fontWeight: 600 }} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { base: number; scenario: number };
                return <GlassTooltip title={String(label)} rows={[{ label: "Cenário", value: fmtInt(p.scenario), color: "var(--primary)" }, { label: "Projeção atual", value: fmtInt(p.base), color: "var(--muted-foreground)" }, { label: "Diferença", value: fmtSignedInt(p.scenario - p.base) }]} />;
              }}
            />
            <Line type="monotone" dataKey="base" stroke="var(--muted-foreground)" strokeWidth={2} strokeDasharray="6 5" dot={{ r: 3 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="scenario" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 4, fill: "var(--primary)" }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </DashCard>
  );
}

function Required({ result: r, set }: { result: WhatIfResult; set: (p: Partial<WhatIfParams>) => void }) {
  const q = r.required;
  const cell = (title: string, text: string | null, apply: () => void) => (
    <button type="button" disabled={text === null} onClick={apply} className="dash-card min-w-0 p-3 text-left transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-60">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</span>
      <span className="mt-1 block font-display text-lg tabular-nums text-foreground">{text ?? "não fecha sozinho"}</span>
    </button>
  );
  const headline = r.hitsGoal
    ? `Com esse cenário a meta de ${r.goalLabel} fecha, com folga de ${fmtInt(-r.scenarioGap)} assinantes.`
    : `Esse cenário traz ${fmtSignedInt(r.deltaActive)} assinantes, mas ainda faltam ${fmtInt(r.scenarioGap)} para a meta.${r.extraLiftToGoal !== null ? ` Para fechar, a aquisição teria que subir mais ${pct0(r.extraLiftToGoal)}.` : " Só alavanca de retenção não resolve: é preciso mais aquisição."}`;
  return (
    <section aria-label="O que bastaria para bater a meta" className="shrink-0 space-y-2">
      <p className="rounded-md border bg-secondary/40 px-3 py-2 text-xs text-foreground">{headline}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cell("Só com churn", q.churnCut === null ? null : `−${pp(q.churnCut)}`, () => q.churnCut !== null && set({ churnCut: q.churnCut }))}
        {cell("Só com falhas de pagamento", q.paymentRecovery === null ? null : `${pct0(q.paymentRecovery)} recuperadas`, () => q.paymentRecovery !== null && set({ paymentRecovery: q.paymentRecovery }))}
        {cell("Só com aquisição", q.acquisitionLift === null ? null : `+${pct0(q.acquisitionLift)}`, () => q.acquisitionLift !== null && set({ acquisitionLift: Math.min(1, q.acquisitionLift) }))}
      </div>
      <p className="text-[10px] text-muted-foreground">Clique em um bloco para aplicar. Simulação sobre dados sintéticos; efeito acumulado mês a mês com o churn atual de {fmtPct(r.base.churn, 1)}.</p>
    </section>
  );
}

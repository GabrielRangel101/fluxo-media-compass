import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChannelTag, DataTable, Kpi, Panel, StatusBadge, chart } from "@/components/dashboard/primitives";
import { fmtSignedPct } from "@/lib/format";
import type { DashboardData } from "@/lib/dashboard-data";
import { RECON_LABEL } from "@/engine/tracking";
import type { EventHealthRow, ReconCheck } from "@/engine/tracking";
import { cn } from "@/lib/utils";

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const r2 = (v: number | null) => (v === null ? "—" : v.toFixed(2).replace(".", ","));
const r3 = (v: number | null) => (v === null ? "—" : v.toFixed(3).replace(".", ","));
const PLAT: Record<string, string> = { android: "Android", ios: "iOS", web: "Web", all: "Todas" };
const CHECKS: ReconCheck[] = ["installs_platform_vs_mmp", "signups_platform_vs_mmp", "signups_backend_vs_mmp"];
const keyOf = (e: EventHealthRow) => `${e.event}|${e.platform}`;

export function TrackingView({ data }: { data: DashboardData }) {
  const { tracking } = data;
  const worst = tracking.events.find((e) => e.status === "broken") ?? tracking.events[0]!;
  const [sel, setSel] = useState(keyOf(worst));
  const ev = tracking.events.find((e) => keyOf(e) === sel) ?? worst;
  const okCount = [...tracking.recon, ...tracking.events].filter((r) => r.status === "ok").length;
  const base = ev.ratioBaseline ?? 0;
  const series = ev.daily.map((d) => ({ date: d.date, ratio: d.ratio }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Checagens" value={String(tracking.checks)} hint="fontes e eventos" />
        <Kpi label="Quebradas" value={String(tracking.broken)} hint="desvio ≥ 35%" />
        <Kpi label="Em atenção" value={String(tracking.warn)} hint="desvio ≥ 15%" />
        <Kpi label="Saudáveis" value={String(okCount)} hint="dentro do normal" />
      </div>

      <Panel
        id="card-recon"
        title="Reconciliação entre fontes"
        sql="04_reconciliation.sql"
        info="Nenhuma fonte é a verdade. A plataforma sempre infla instalações frente ao MMP (view-through, modelagem), então a razão normal não é 1. O alerta é o desvio da razão atual (14 dias) contra a do período-base (primeiros 60 dias)."
      >
        <div className="space-y-5">
          {CHECKS.map((chk) => (
            <div key={chk}>
              <h3 className="mb-1 text-sm font-semibold">{RECON_LABEL[chk].title}</h3>
              <DataTable head={["Canal", "Plataforma", "Razão-base", "Razão atual", "Desvio", "Status"]}>
                {tracking.recon.filter((r) => r.check === chk).map((r) => (
                  <tr key={`${r.channel}|${r.platform}`} className={cn(r.status === "broken" && "bg-danger/5")}>
                    <td className="whitespace-nowrap"><ChannelTag channel={r.channel} /></td>
                    <td>{PLAT[r.platform]}</td>
                    <td className="tnum">{r2(r.ratioBaseline)}</td>
                    <td className="tnum">{r2(r.ratioCurrent)}</td>
                    <td className="tnum">{r.deviation === null ? "—" : fmtSignedPct(r.deviation, 0)}</td>
                    <td><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </DataTable>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel id="card-eventos" title="Eventos do tagbook" sql="05_event_health.sql" info="Contagem do SDK/GA4 ÷ uma referência independente (backend para eventos do app). Clique numa linha para ver a série diária.">
          <DataTable head={["Evento", "Plataforma", "Razão-base", "Atual", "Desvio", "Status"]}>
            {tracking.events.map((e) => (
              <tr
                key={keyOf(e)}
                onClick={() => setSel(keyOf(e))}
                className={cn("cursor-pointer hover:bg-secondary", keyOf(e) === sel && "bg-accent/60")}
                aria-selected={keyOf(e) === sel}
              >
                <td className="font-mono text-xs">{e.event}</td>
                <td>{PLAT[e.platform]}</td>
                <td className="tnum">{r3(e.ratioBaseline)}</td>
                <td className="tnum">{r3(e.ratioCurrent)}</td>
                <td className="tnum">{e.deviation === null ? "—" : fmtSignedPct(e.deviation, 0)}</td>
                <td><StatusBadge status={e.status} /></td>
              </tr>
            ))}
          </DataTable>
        </Panel>

        <Panel id="card-evento-serie" title={`Série diária · ${ev.event} (${PLAT[ev.platform]})`}>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis dataKey="date" tickFormatter={dm} tick={chart.tick} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis tick={chart.tick} tickLine={false} axisLine={false} width={40} domain={[0, "auto"]} tickFormatter={(v: number) => v.toFixed(2).replace(".", ",")} />
                <Tooltip {...chart.tooltip} labelFormatter={(d: string) => dm(d)} formatter={(v: number) => [r3(v), "Razão"]} />
                {base > 0 ? <ReferenceLine y={base} stroke="var(--muted-foreground)" strokeDasharray="4 4" /> : null}
                {base > 0 ? <ReferenceLine y={base * 0.65} stroke="var(--danger)" strokeOpacity={0.5} strokeDasharray="2 4" /> : null}
                {base > 0 ? <ReferenceLine y={base * 1.35} stroke="var(--danger)" strokeOpacity={0.5} strokeDasharray="2 4" /> : null}
                {ev.onset ? <ReferenceLine x={ev.onset} stroke="var(--danger)" label={{ value: `início ${dm(ev.onset)}`, fill: "var(--danger)", fontSize: 11, position: "insideTopRight" }} /> : null}
                <Line dataKey="ratio" stroke="var(--primary)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Razão evento ÷ referência ({ev.reference.toLowerCase()}). Linha cinza: nível normal. Linhas vermelhas: banda de ±35%.</p>
          {ev.cause ? (
            <div className="mt-3 space-y-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm leading-relaxed">
              <p><strong>Causa provável.</strong> {ev.cause}</p>
              {ev.impact ? <p><strong>Impacto.</strong> {ev.impact}</p> : null}
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}

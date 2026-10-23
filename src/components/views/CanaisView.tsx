import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { ChannelTag, DataTable, Kpi, Panel, channelColor, chart, SizedChart, Legend } from "@/components/dashboard/primitives";
import { fmtBRL, fmtBRLCompact, fmtInt, fmtPct, fmtSignedInt } from "@/lib/format";
import { curveSeries, simulate } from "@/lib/dashboard-data";
import type { DashboardData } from "@/lib/dashboard-data";
import { CHANNELS, CHANNEL_LABEL } from "@/engine/types";
import type { Channel } from "@/engine/types";

const x2 = (v: number | null) => (v === null ? "—" : `${v.toFixed(2).replace(".", ",")}×`);
const select = "h-9 rounded-md border bg-background px-2 text-sm";

function Simulator() {
  const [from, setFrom] = useState<Channel>("dv360");
  const [to, setTo] = useState<Channel>("google_ads");
  const [pct, setPct] = useState(20);
  const s = simulate(from, to, pct / 100);
  const changed = s.rows.filter((r) => Math.abs(r.spendAfter - r.spendBefore) > 0.5);

  return (
    <Panel
      id="card-simulador" ai="card-simulador"
      title="Simulador de realocação de verba"
      sql="08_curve_inputs.sql"
      info="Move uma fatia do gasto dos últimos 28 dias de um canal para outro, mantendo o orçamento total. Usa a curva de resposta de cada canal (retorno decrescente). É uma projeção para formular hipótese de teste, não uma garantia."
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Tirar de
          <select className={select} value={from} onChange={(e) => setFrom(e.target.value as Channel)}>
            {CHANNELS.map((c) => (<option key={c} value={c}>{CHANNEL_LABEL[c]}</option>))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Levar para
          <select className={select} value={to} onChange={(e) => setTo(e.target.value as Channel)}>
            {CHANNELS.map((c) => (<option key={c} value={c}>{CHANNEL_LABEL[c]}</option>))}
          </select>
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-muted-foreground">
          Fatia do gasto: <strong className="text-foreground">{pct}%</strong>
          <input type="range" min={5} max={50} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="accent-[var(--primary)]" aria-label="Fatia do gasto a mover" />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Verba movida" value={fmtBRLCompact(s.movedAmount)} hint="em 28 dias" />
        <Kpi label="Instalações" value={fmtSignedInt(Math.round(s.installsDelta))} />
        <Kpi label="Ativações" value={fmtSignedInt(Math.round(s.activatedDelta))} />
        <Kpi label="LTV90 esperado" value={`${s.valueDelta >= 0 ? "+" : "−"}${fmtBRLCompact(Math.abs(s.valueDelta))}`} />
      </div>

      {changed.length > 0 ? (
        <div className="mt-4">
          <h3 className="mb-1 text-sm font-semibold">De onde saem e para onde vão as instalações</h3>
          <Legend className="mb-2" items={[{ label: "Ganha instalações", color: "var(--positive)", kind: "bar" }, { label: "Perde instalações", color: "var(--danger)", kind: "bar" }, { label: "Saldo", color: "var(--foreground)", kind: "bar" }]} />
          <div style={{ height: 44 * (changed.length + 1) + 28 }}>
            <SizedChart>{(w, h) => (
              <BarChart width={w} height={h} layout="vertical" data={[...changed.map((r) => ({ name: CHANNEL_LABEL[r.channel], v: r.installsAfter - r.installsBefore })), { name: "Saldo", v: s.installsDelta }]} margin={{ top: 4, right: 56, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={chart.grid} horizontal={false} />
                <XAxis type="number" tick={chart.tick} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtSignedInt(Math.round(v))} />
                <YAxis type="category" dataKey="name" tick={chart.tick} tickLine={false} axisLine={false} width={84} />
                <ReferenceLine x={0} stroke="var(--foreground)" />
                <Tooltip {...chart.tooltip} cursor={{ fill: "var(--secondary)" }} formatter={(v: number) => [fmtSignedInt(Math.round(v)), "Instalações"]} />
                <Bar dataKey="v" radius={3} barSize={20} isAnimationActive={false} label={{ position: "right", fontSize: 11, fill: "var(--foreground)", formatter: (v: number) => fmtSignedInt(Math.round(v)) }}>
                  {[...changed.map((r) => r.installsAfter - r.installsBefore), s.installsDelta].map((v, i, a) => <Cell key={i} fill={i === a.length - 1 ? "var(--foreground)" : v >= 0 ? "var(--positive)" : "var(--danger)"} />)}
                </Bar>
              </BarChart>
            )}</SizedChart>
          </div>
        </div>
      ) : null}
      {changed.length > 0 ? (
        <DataTable className="mt-4" head={["Canal", "Gasto antes", "Gasto depois", "Instalações antes", "Instalações depois"]}>
          {changed.map((r) => (
            <tr key={r.channel}>
              <td><ChannelTag channel={r.channel} /></td>
              <td className="tnum">{fmtBRLCompact(r.spendBefore)}</td>
              <td className="tnum">{fmtBRLCompact(r.spendAfter)}</td>
              <td className="tnum">{fmtInt(r.installsBefore)}</td>
              <td className="tnum">{fmtInt(r.installsAfter)}</td>
            </tr>
          ))}
        </DataTable>
      ) : null}
      {s.warnings.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-warning">
          {s.warnings.map((w) => (<li key={w}>⚠ {w}</li>))}
        </ul>
      ) : null}
    </Panel>
  );
}

function ResponseCurve({ data }: { data: DashboardData }) {
  const [channel, setChannel] = useState<Channel>("tiktok_ads");
  const c = curveSeries(channel);
  const e = data.eco.find((x) => x.channel === channel)!;
  return (
    <Panel
      id="card-curva" ai="card-curva"
      title="Curva de resposta"
      sql="08_curve_inputs.sql"
      info="Instalações = A × gasto^β, ajustada por regressão log-log no período sem falhas de coleta (até D-45). β < 1 indica retorno decrescente: o próximo real compra menos que o anterior."
      actions={
        <select className={select} value={channel} onChange={(e2) => setChannel(e2.target.value as Channel)} aria-label="Canal da curva">
          {CHANNELS.map((ch) => (<option key={ch} value={ch}>{CHANNEL_LABEL[ch]}</option>))}
        </select>
      }
    >
      <Legend className="mb-2" items={[{ label: "Dias observados", color: channelColor(channel), kind: "dot" }, { label: "Curva ajustada", color: "var(--foreground)", kind: "line" }]} />
      <div className="h-56">
        <SizedChart>{(w, h) => (<>
          <ComposedChart width={w} height={h} margin={{ top: 4, right: 8, bottom: 16, left: 0 }}>
            <CartesianGrid stroke={chart.grid} />
            <XAxis type="number" dataKey="spend" name="Gasto" tick={chart.tick} tickLine={false} axisLine={false} domain={["auto", "auto"]} tickFormatter={(v: number) => fmtBRLCompact(v)} label={{ value: c.blockDays === 7 ? "Gasto semanal" : "Gasto diário", position: "insideBottom", offset: -8, fill: "var(--muted-foreground)", fontSize: 11 }} />
            <YAxis type="number" dataKey="installs" name="Instalações" tick={chart.tick} tickLine={false} axisLine={false} width={40} domain={["auto", "auto"]} />
            <Tooltip {...chart.tooltip} formatter={(v: number, n: string) => [n === "Gasto" ? fmtBRL(v, 0) : fmtInt(v), n]} />
            <Scatter data={c.points} name="Observado" fill={channelColor(channel)} fillOpacity={0.55} />
            <Line data={c.line} dataKey="installs" name="Curva" stroke="var(--foreground)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </>)}</SizedChart>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-3 text-xs">
        <div><div className="text-muted-foreground">β (elasticidade)</div><div className="tnum text-base font-semibold">{c.beta.toFixed(2).replace(".", ",")}</div></div>
        <div><div className="text-muted-foreground">CPI médio → marginal</div><div className="tnum text-base font-semibold">{fmtBRL(e.cpi ?? 0)} → {fmtBRL(e.marginalCpi ?? 0)}</div></div>
        <div><div className="text-muted-foreground">Confiança</div><div className="text-base font-semibold">{c.lowConfidence ? "Baixa (poucas instalações/dia)" : "Boa"}</div></div>
      </div>
    </Panel>
  );
}

export function CanaisView({ data }: { data: DashboardData }) {
  const bars = data.eco.map((e) => ({ name: CHANNEL_LABEL[e.channel], roas: e.roas90 ?? 0, channel: e.channel }));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          id="card-economia" ai="card-economia"
          title="Retorno em 90 dias por canal"
          sql="01_channel_summary.sql"
          info="ROAS D90 = receita acumulada em 90 dias ÷ gasto, em instalações com 90 dias completos. A linha tracejada em 1,00× é o ponto em que o canal paga o próprio custo."
        >
          <div className="h-56">
            <SizedChart>{(w, h) => (<>
              <BarChart width={w} height={h} data={bars} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 8 }}>
                <CartesianGrid stroke={chart.grid} horizontal={false} />
                <XAxis type="number" tick={chart.tick} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}×`} />
                <YAxis type="category" dataKey="name" tick={chart.tick} tickLine={false} axisLine={false} width={84} />
                <Tooltip {...chart.tooltip} formatter={(v: number) => [x2(v), "ROAS D90"]} cursor={{ fill: "var(--secondary)" }} />
                <ReferenceLine x={1} stroke="var(--foreground)" strokeDasharray="4 4" />
                <Bar dataKey="roas" radius={[0, 4, 4, 0]}>
                  {bars.map((b) => (<Cell key={b.channel} fill={channelColor(b.channel)} />))}
                </Bar>
              </BarChart>
            </>)}</SizedChart>
          </div>
        </Panel>

        <Panel id="card-unit" ai="card-unit" title="Unit economics por canal" sql="01_channel_summary.sql" info="CPI e CPI marginal vêm dos últimos 28 dias. Ativação, CAC, LTV90 e ROAS vêm de coortes maduras.">
          <DataTable head={["Canal", "CPI", "CPI marginal", "Ativação", "CAC", "LTV90", "ROAS D90"]}>
            {data.eco.map((e) => (
              <tr key={e.channel}>
                <td className="whitespace-nowrap"><ChannelTag channel={e.channel} /></td>
                <td className="tnum">{fmtBRL(e.cpi ?? 0)}</td>
                <td className="tnum">{fmtBRL(e.marginalCpi ?? 0)}</td>
                <td className="tnum">{e.activationRate === null ? "—" : fmtPct(e.activationRate, 0)}</td>
                <td className="tnum">{fmtBRL(e.cac ?? 0)}</td>
                <td className="tnum">{fmtBRL(e.ltv90 ?? 0, 0)}</td>
                <td className="tnum font-medium">{x2(e.roas90)}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Simulator />
        <ResponseCurve data={data} />
      </div>
    </div>
  );
}

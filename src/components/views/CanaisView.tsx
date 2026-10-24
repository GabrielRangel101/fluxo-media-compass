import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { ChannelTag, DataTable, Kpi, Panel, channelColor, chart, SizedChart, Legend } from "@/components/dashboard/primitives";
import { fmtBRL, fmtBRLCompact, fmtInt, fmtPct, fmtSignedInt } from "@/lib/format";
import { curveSeries, simulate } from "@/lib/dashboard-data";
import type { DashboardData } from "@/lib/dashboard-data";
import { CHANNELS, CHANNEL_LABEL } from "@/engine/types";
import type { Channel } from "@/engine/types";
import { cn } from "@/lib/utils";

const x2 = (v: number | null) => (v === null ? "—" : `${v.toFixed(2).replace(".", ",")}×`);
const select = "h-9 rounded-md border bg-background px-2 text-sm";

function Simulator({ data }: { data: DashboardData }) {
  const [from, setFrom] = useState<Channel>(data.bestShift?.from ?? "dv360");
  const [to, setTo] = useState<Channel>(data.bestShift?.to ?? "google_ads");
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
        <Kpi label="Instalações" value={fmtSignedInt(Math.round(s.installsDelta))} hint={`faixa ${fmtSignedInt(Math.round(s.band.installs[0]))} a ${fmtSignedInt(Math.round(s.band.installs[1]))}`} />
        <Kpi label="Ativações" value={fmtSignedInt(Math.round(s.activatedDelta))} hint={`faixa ${fmtSignedInt(Math.round(s.band.activated[0]))} a ${fmtSignedInt(Math.round(s.band.activated[1]))}`} />
        <Kpi label="LTV90 esperado" value={`${s.valueDelta >= 0 ? "+" : "−"}${fmtBRLCompact(Math.abs(s.valueDelta))}`} hint={`faixa ${fmtBRLCompact(s.band.value[0])} a ${fmtBRLCompact(s.band.value[1])}`} />
      </div>

      {changed.length > 0 ? (
        <div className="mt-4">
          <h3 className="mb-1 text-sm font-semibold">De onde saem e para onde vão as instalações</h3>
          <Legend className="mb-2" items={[{ label: "Ganha instalações", color: "var(--positive)", kind: "bar" }, { label: "Perde instalações", color: "var(--danger)", kind: "bar" }, { label: "Saldo", color: "var(--foreground)", kind: "bar" }]} />
          <div style={{ height: 44 * (changed.length + 1) + 28 }}>
            <SizedChart>{(w, h) => (
              <BarChart width={w} height={h} layout="vertical" data={[...changed.map((r) => ({ name: CHANNEL_LABEL[r.channel], v: r.installsAfter - r.installsBefore })), { name: "Saldo", v: s.installsDelta }]} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={chart.grid} horizontal={false} />
                <XAxis type="number" domain={[(m: number) => m - Math.max(40, Math.abs(m) * 0.35), (m: number) => m + Math.max(40, Math.abs(m) * 0.35)]} tick={chart.tick} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtSignedInt(Math.round(v))} />
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
      <p className="mt-3 text-xs text-muted-foreground">A faixa vem da incerteza da elasticidade de cada curva (β ± 1,96 erro-padrão): o canal de destino com β baixo e a origem com β alto dão o limite inferior, e o inverso dá o superior. Ela não cobre mudanças de leilão ou de criativo.</p>
      {(from === "google_ads" || to === "google_ads") && data.googleBrand[0] ? (
        <p className="mt-2 text-xs text-warning">⚠ O Google inclui busca de marca ({fmtPct(data.googleBrand[0].spendShare, 0)} do gasto), que capta demanda que já existia e satura rápido. A curva do canal mistura as duas partes; sem a marca o ROAS D90 é {x2(data.googleBrand[1]?.roas90 ?? null)}, e não {x2(data.googleBrand[0].roas90)}. Trate o ganho de mover verba para o Google como teto.</p>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">A projeção usa a curva de resposta de cada canal (retorno decrescente), não um retorno linear. Mesmo assim, comece com um teste de 5 a 10% da verba antes de mover mais.</p>
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
        <div title="Boa = pelo menos 20 instalações por dia e R² do ajuste log-log de 0,6 ou mais. Abaixo disso a curva usa blocos semanais e a incerteza de β cresce."><div className="text-muted-foreground">Confiança</div><div className="text-base font-semibold">{c.lowConfidence || c.r2 < 0.6 ? "Baixa" : "Boa"}</div><div className="tnum text-[11px] text-muted-foreground">R² {c.r2.toFixed(2).replace(".", ",")} · β ± {(1.96 * c.betaSe).toFixed(2).replace(".", ",")}</div></div>
      </div>
    </Panel>
  );
}

const ATTR_NOTE: Partial<Record<Channel, string>> = {
  dv360: "Display: parte das instalações vem de view-through, então o retorno atribuído tende a vir inflado. Não compare direto com canais de performance.",
  linkedin_ads: "B2B de ciclo longo e volume pequeno: o D90 pode subestimar o retorno e o intervalo é largo.",
  google_ads: "Inclui busca de marca, que capta demanda que já existia.",
  tiktok_ads: "Topo de funil: parte do efeito pode aparecer depois como orgânico.",
};
const VERDICT_TXT = { paga: ["Paga o custo", "text-positive"], nao_paga: ["Não paga o custo", "text-danger"], inconclusivo: ["Inconclusivo", "text-warning"] } as const;

function ConfidencePanel({ data }: { data: DashboardData }) {
  const rr = data.roasConf[0]!.recentRange;
  const dmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return (
    <Panel id="card-confianca" ai="card-confianca" title="Retorno em 90 dias, com confiança e projeção" sql="01_channel_summary.sql" info="ROAS D90 real: coortes com 90 dias completos, com intervalo de 95%. Projeção: ROAS D30 das coortes mais recentes × a razão receita D90 ÷ D30 que o próprio canal teve. A projeção é uma estimativa, não um dado. Se o intervalo cruza 1,00×, não dá para dizer se o canal paga o próprio custo.">
      <DataTable head={["Canal", "Instalações na coorte", "ROAS D90 real", "Intervalo 95%", "Leitura", `ROAS D90 projetado (coortes ${dmm(rr.from)}–${dmm(rr.to)})`]}>
        {data.roasConf.map((r) => {
          const [txt, cls] = VERDICT_TXT[r.verdict];
          return (
            <tr key={r.channel}>
              <td className="whitespace-nowrap"><ChannelTag channel={r.channel} /></td>
              <td className="tnum">{fmtInt(r.n)}{r.lowSample ? <span className="ml-1.5 rounded border px-1 text-[10px] font-medium text-warning">amostra baixa</span> : null}</td>
              <td className="tnum">{x2(r.roas)}</td>
              <td className="tnum text-muted-foreground">{x2(r.lo)} a {x2(r.hi)}</td>
              <td className={cn("font-medium", cls)}>{txt}</td>
              <td className="tnum">{x2(r.projected)}</td>
            </tr>
          );
        })}
      </DataTable>
      <ul className="mt-3 space-y-1 text-xs leading-relaxed text-muted-foreground">
        {data.roasConf.filter((r) => ATTR_NOTE[r.channel]).map((r) => (
          <li key={r.channel}><strong className="text-foreground">{CHANNEL_LABEL[r.channel]}:</strong> {ATTR_NOTE[r.channel]}</li>
        ))}
        {data.corrections.filter((c) => c.channel === "meta_ads").map((c) => (
          <li key="meta-corr"><strong className="text-foreground">Meta:</strong> o iOS perde atribuição desde {c.onset ? dmm(c.onset) : "—"}. O D90 não é afetado (coorte anterior), mas CPI e CAC recentes são.</li>
        ))}
      </ul>
      <h3 className="mb-1 mt-5 text-sm font-semibold">Atribuído × blended</h3>
      <DataTable head={["Coortes", "Horizonte", "ROAS atribuído (mídia paga)", "ROAS blended (toda a receita ÷ gasto pago)", "Receita que o MMP chama de orgânico"]}>
        {data.blended.map((b) => (
          <tr key={b.horizon}>
            <td className="whitespace-nowrap">{dmm(b.range.from)} a {dmm(b.range.to)}</td>
            <td>{b.horizon}</td>
            <td className="tnum">{x2(b.attributedRoas)}</td>
            <td className="tnum">{x2(b.blendedRoas)}</td>
            <td className="tnum">{b.organicShare === null ? "—" : fmtPct(b.organicShare, 0)}</td>
          </tr>
        ))}
      </DataTable>
      <p className="mt-2 text-xs text-muted-foreground">O blended inclui a receita de usuários que o MMP atribui a orgânico. Se essa parcela sobe sem o orgânico crescer de verdade, o MMP está perdendo atribuição de mídia paga.</p>
    </Panel>
  );
}

function GoogleBrandPanel({ data }: { data: DashboardData }) {
  const [marca, sem] = data.googleBrand;
  if (!marca || !sem) return null;
  return (
    <Panel id="card-google-marca" ai="card-google-marca" title="Google Ads: busca de marca × restante" sql="01_channel_summary.sql" info="A busca de marca capta quem já ia chegar ao produto: ROAS alto, CPI baixo e saturação rápida. Misturada com UAC e busca genérica, ela infla o ROAS e o retorno que o simulador atribui ao Google. O CPI marginal vem da curva de resposta ajustada em cada grupo separadamente.">
      <DataTable head={["Grupo", "Parcela do gasto", "CPI (28 dias)", "CAC", "ROAS D90", "β da curva", "CPI marginal"]}>
        {[marca, sem].map((g) => (
          <tr key={g.key}>
            <td className="whitespace-nowrap">{g.label}</td>
            <td className="tnum">{fmtPct(g.spendShare, 0)}</td>
            <td className="tnum">{fmtBRL(g.cpi ?? 0)}</td>
            <td className="tnum">{fmtBRL(g.cac ?? 0)}</td>
            <td className="tnum font-medium">{x2(g.roas90)}</td>
            <td className="tnum">{g.beta.toFixed(2).replace(".", ",")}</td>
            <td className="tnum">{fmtBRL(g.marginalCpi ?? 0)}</td>
          </tr>
        ))}
      </DataTable>
      <p className="mt-2 text-xs text-muted-foreground">Para decidir verba no Google, use a linha "{sem.label}": é o retorno que um real a mais, fora da marca, tende a ter. Nenhuma outra aba separa os dois grupos.</p>
    </Panel>
  );
}

export function CanaisView({ data }: { data: DashboardData }) {
  const corr = (c: Channel) => data.corrections.find((x) => x.channel === c);
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

        <Panel id="card-unit" ai="card-unit" title="Unit economics por canal" sql="01_channel_summary.sql" info="CPI e CPI marginal vêm dos últimos 28 dias. Ativação e CAC usam as coortes dos 28 dias que completaram D14, a mesma janela da aba Geral. LTV90 e ROAS usam coortes com 90 dias. As colunas corrigidas estimam o efeito de atribuição perdida no MMP; o valor bruto continua sendo o oficial.">
          <DataTable head={["Canal", "CPI", "CPI corrigido", "CPI marginal", "Ativação", "CAC", "CAC corrigido", "LTV90", "ROAS D90"]}>
            {data.eco.map((e) => (
              <tr key={e.channel}>
                <td className="whitespace-nowrap"><ChannelTag channel={e.channel} /></td>
                <td className="tnum">{fmtBRL(e.cpi ?? 0)}</td>
                <td className="tnum">{corr(e.channel)?.cpi != null ? <>{fmtBRL(corr(e.channel)!.cpi!)}<span className="ml-1 text-[10px] text-muted-foreground">est.</span></> : <span className="text-muted-foreground">—</span>}</td>
                <td className="tnum">{fmtBRL(e.marginalCpi ?? 0)}</td>
                <td className="tnum">{e.activationRate === null ? "—" : fmtPct(e.activationRate, 0)}</td>
                <td className="tnum">{fmtBRL(e.cac ?? 0)}</td>
                <td className="tnum">{corr(e.channel)?.cac != null ? <>{fmtBRL(corr(e.channel)!.cac!)}<span className="ml-1 text-[10px] text-muted-foreground">est.</span></> : <span className="text-muted-foreground">—</span>}</td>
                <td className="tnum">{fmtBRL(e.ltv90 ?? 0, 0)}</td>
                <td className="tnum font-medium">{x2(e.roas90)}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      </div>
      <ConfidencePanel data={data} />
      <GoogleBrandPanel data={data} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Simulator data={data} />
        <ResponseCurve data={data} />
      </div>
    </div>
  );
}

import { Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { channelColor, ChannelTag, DataDetails, DataTable, DeltaPill, Kpi, Legend, Panel, chart, SizedChart } from "@/components/dashboard/primitives";
import { CostReturnChart } from "@/components/dashboard/CostReturnChart";
import { useGoToCard } from "@/components/shell/use-go-to-card";
import { fmtBRL, fmtBRLCompact, fmtInt, fmtPct } from "@/lib/format";
import type { DashboardData } from "@/lib/dashboard-data";
import { CHANNEL_LABEL } from "@/engine/types";
import { DEFECTS } from "@/engine/generate";
import { cn } from "@/lib/utils";

const rel = (a: number | null, b: number | null) => (a !== null && b ? a / b - 1 : null);
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const MARKS = [
  { n: "1", date: DEFECTS.googleSignupDoubleCount.from, text: "Google Ads passa a contar cadastro em dobro" },
  { n: "2", date: DEFECTS.ga4FormSubmitDuplicate.from, text: "form_submit duplicado no GA4" },
  { n: "3", date: DEFECTS.metaIosAttributionLoss.from, text: "Meta iOS: MMP perde atribuição" },
  { n: "4", date: DEFECTS.kycDoneAndroidSdk.from, text: "kyc_done para de chegar no Android" },
] as const;
const SEV = { alta: "bg-danger", media: "bg-warning", info: "bg-muted-foreground" } as const;

export function OverviewView({ data }: { data: DashboardData }) {
  const go = useGoToCard();
  const tot = data.last[data.last.length - 1]!;
  const prev = data.prev[data.prev.length - 1]!;
  const mat = data.mature[data.mature.length - 1]!;
  const { last28, mature90 } = data.per;
  const recent = data.daily.slice(-28);
  const fill = (xs: (number | null)[]) => { let lastV = 0; return xs.map((x) => (lastV = x ?? lastV)); };
  const headline = data.insights[0];
  const cpiSeries = data.daily.map((d, i, arr) => {
    const win = arr.slice(Math.max(0, i - 6), i + 1).filter((x) => x.installs > 0);
    const inst = win.reduce((a, x) => a + x.installs, 0);
    return { date: d.date, cpi: d.cpi, ma7: inst ? win.reduce((a, x) => a + x.spend, 0) / inst : null };
  });

  return (
    <div className="space-y-4">
      {headline ? (
        <button
          type="button"
          onClick={() => go(headline.view, headline.target)}
          className="group relative flex w-full flex-col gap-3 overflow-hidden rounded-2xl bg-[hsl(222_32%_11%)] p-6 text-left text-[hsl(210_25%_95%)] transition-colors hover:bg-[hsl(222_32%_13%)] focus-visible:outline-2 focus-visible:outline-ring sm:flex-row sm:items-end sm:gap-8 sm:p-7"
        >
          <span className="relative min-w-0 flex-1">
            <span className="mb-2 block text-xs font-medium text-[hsl(210_18%_68%)]">Principal alerta da semana</span>
            <span className="font-display block max-w-[34ch] text-2xl font-semibold leading-[1.15] tracking-tight sm:text-[28px]">{headline.title}</span>
            <span className="mt-3 block max-w-[60ch] text-sm leading-relaxed text-[hsl(210_18%_74%)]">{headline.summary}</span>
          </span>
          <span className="relative flex shrink-0 gap-6 sm:flex-col sm:gap-3 sm:text-right">
            <span>
              <span className="font-display tnum block text-3xl font-semibold leading-none">{data.tracking.broken}</span>
              <span className="mt-1 block text-xs text-[hsl(210_18%_68%)]">checagens quebradas</span>
            </span>
            <span>
              <span className="font-display tnum block text-3xl font-semibold leading-none">{data.tracking.warn}</span>
              <span className="mt-1 block text-xs text-[hsl(210_18%_68%)]">em atenção</span>
            </span>
          </span>
        </button>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi ai="kpi-spend" label="Investimento" index={0} num={tot.spend} format={fmtBRLCompact} value={fmtBRLCompact(tot.spend)} change={rel(tot.spend, prev.spend)} good="none" hint="28 dias" spark={recent.map((d) => d.spend)} />
        <Kpi ai="kpi-installs" label="Instalações" index={1} num={tot.installs} format={fmtInt} value={fmtInt(tot.installs)} change={rel(tot.installs, prev.installs)} good="up" hint="atribuídas (MMP)" spark={recent.map((d) => d.installs)} />
        <Kpi ai="kpi-cpi" label="CPI" index={2} num={tot.cpi ?? 0} format={fmtBRL} value={fmtBRL(tot.cpi ?? 0)} change={rel(tot.cpi, prev.cpi)} good="down" hint="gasto ÷ instalações" spark={fill(recent.map((d) => d.cpi))} />
        <Kpi ai="kpi-cpa" label="CPA cadastro" index={3} num={tot.cpaSignup ?? 0} format={fmtBRL} value={fmtBRL(tot.cpaSignup ?? 0)} change={rel(tot.cpaSignup, prev.cpaSignup)} good="down" hint="gasto ÷ cadastros" spark={fill(recent.map((d) => (d.signups ? d.spend / d.signups : null)))} />
        <Kpi
          ai="kpi-cac"
          label="CAC"
          index={4}
          num={tot.cac ?? 0}
          format={fmtBRL}
          value={fmtBRL(tot.cac ?? 0)}
          change={rel(tot.cac, prev.cac)}
          good="down"
          hint="coortes com 14+ dias"
          info="Gasto ÷ usuários que usaram o cartão em até 14 dias. Só entram coortes com 14 dias de vida: instalações mais recentes ainda não tiveram tempo de ativar."
        />
        <Kpi
          ai="kpi-roas"
          label="ROAS D90"
          index={5}
          num={mat.roas90 ?? 0}
          format={(n) => `${n.toFixed(2).replace(".", ",")}×`}
          value={`${(mat.roas90 ?? 0).toFixed(2).replace(".", ",")}×`}
          hint={`coorte ${dm(mature90.from)}–${dm(mature90.to)}`}
          info="Receita acumulada em 90 dias ÷ gasto da mesma coorte. Só existe para instalações com 90 dias completos; por isso olha para trás, não para os últimos 28 dias."
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-4">
          <Panel id="card-serie" ai="card-serie" title="Investimento diário e CPI · 90 dias" sql="03_daily_series.sql" info="Dois gráficos, um eixo cada: misturar R$ de investimento com R$ de CPI em escalas diferentes engana a leitura. A linha tracejada é a média móvel de 7 dias do CPI.">
            <Legend className="mb-2" items={[{ label: "Investimento por dia", color: "var(--cat-6)", kind: "bar" }, { label: "CPI do dia", color: "var(--muted-foreground)", kind: "line" }, { label: "CPI, média de 7 dias", color: "var(--primary)", kind: "line" }, { label: "Defeito de coleta (1 a 4)", color: "var(--danger)", kind: "dash" }]} />
            <div className="h-28">
              <SizedChart>{(w, h) => (<>
                <ComposedChart width={w} height={h} data={data.daily} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="date" hide />
                  <YAxis tick={chart.tick} tickLine={false} axisLine={false} width={62} tickFormatter={(v: number) => fmtBRLCompact(v)} />
                  <Tooltip {...chart.tooltip} cursor={{ fill: "var(--secondary)" }} labelFormatter={(d: string) => dm(d)} formatter={(v: number) => [fmtBRL(v, 0), "Investimento"]} />
                  <Bar dataKey="spend" name="Investimento" fill="var(--cat-6)" fillOpacity={0.55} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                </ComposedChart>
              </>)}</SizedChart>
            </div>
            <div className="h-44">
              <SizedChart>{(w, h) => (<>
                <ComposedChart width={w} height={h} data={cpiSeries} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={dm} tick={chart.tick} tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis tick={chart.tick} tickLine={false} axisLine={false} width={62} domain={["auto", "auto"]} tickFormatter={(v: number) => fmtBRL(v, 0)} />
                  <Tooltip {...chart.tooltip} cursor={chart.crosshair} labelFormatter={(d: string) => dm(d)} formatter={(v: number, n: string) => [fmtBRL(v), n]} />
                  <Line dataKey="cpi" name="CPI do dia" stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeWidth={1} dot={false} connectNulls isAnimationActive={false} />
                  <Line dataKey="ma7" name="CPI, média 7 dias" stroke="var(--primary)" strokeWidth={2.25} dot={false} connectNulls isAnimationActive={false} />
                  {MARKS.filter((m) => cpiSeries.some((d) => d.date === m.date)).map((m) => (
                    <ReferenceLine key={m.n} x={m.date} stroke="var(--danger)" strokeDasharray="4 3" strokeOpacity={0.7} label={{ value: m.n, position: "insideTopRight", fill: "var(--danger)", fontSize: 11, fontWeight: 700 }} />
                  ))}
                </ComposedChart>
              </>)}</SizedChart>
            </div>
            <ol className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
              {MARKS.map((m) => (
                <li key={m.n} className="flex gap-2"><span className="font-semibold text-danger">{m.n}</span><span>{dm(m.date)}: {m.text}</span></li>
              ))}
            </ol>
            <DataDetails
              head={["Dia", "Investimento", "Instalações", "CPI do dia", "CPI, média 7 dias"]}
              rows={cpiSeries.slice(-14).reverse().map((d, i) => { const x = data.daily[data.daily.length - 1 - i]!; return [dm(d.date), fmtBRL(x.spend, 0), fmtInt(x.installs), d.cpi === null ? "—" : fmtBRL(d.cpi), d.ma7 === null ? "—" : fmtBRL(d.ma7)]; })}
              label="Ver os últimos 14 dias em tabela"
            />
          </Panel>

          <Panel id="card-cpi-canais" ai="card-cpi-canais" title="CPI por canal, por semana" sql="03_daily_series.sql" info="Cada linha é um canal, semana a semana, no mesmo eixo em R$. Semanas com menos de 15 instalações no canal ficam em branco. Separa o canal que piorou do canal que sempre foi caro.">
            <Legend className="mb-2" items={data.weeklyCpi.series.map((s) => ({ label: CHANNEL_LABEL[s.channel], color: channelColor(s.channel), kind: "line" as const }))} />
            <div className="h-52">
              <SizedChart>{(w, h) => (
                <LineChart width={w} height={h} data={data.weeklyCpi.x.map((x, i) => ({ x, ...Object.fromEntries(data.weeklyCpi.series.map((s) => [s.channel, s.values[i]])) }))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="x" tick={chart.tick} tickLine={false} axisLine={false} minTickGap={20} />
                  <YAxis tick={chart.tick} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => fmtBRL(v, 0)} />
                  <Tooltip {...chart.tooltip} cursor={chart.crosshair} labelFormatter={(d: string) => `Semana de ${d}`} formatter={(v: number, n: string) => [fmtBRL(v), CHANNEL_LABEL[n as keyof typeof CHANNEL_LABEL] ?? n]} />
                  {data.weeklyCpi.series.map((s) => <Line key={s.channel} dataKey={s.channel} stroke={channelColor(s.channel)} strokeWidth={2} dot={{ r: 2.5 }} connectNulls={false} isAnimationActive={false} />)}
                </LineChart>
              )}</SizedChart>
            </div>
            <DataDetails
              head={["Semana", ...data.weeklyCpi.series.map((s) => CHANNEL_LABEL[s.channel])]}
              rows={data.weeklyCpi.x.map((x, i) => [x, ...data.weeklyCpi.series.map((s) => (s.values[i] === null ? "—" : fmtBRL(s.values[i]!)))]).reverse()}
              label="Ver as semanas em tabela"
            />
          </Panel>

          <Panel id="card-quadrante" ai="card-quadrante" title="Custo × retorno por canal" info="Cada bolha é um canal. Eixo horizontal: CPI dos últimos 28 dias. Vertical: ROAS D90 das coortes maduras. Tamanho: investimento. Abaixo da linha de 1,00× a coorte não paga o próprio custo em 90 dias. CPI baixo não garante retorno." sql="01_channel_summary.sql">
            <div className="h-72">
              <SizedChart>{(w, h) => <CostReturnChart width={w} height={h} rows={data.last} mature={data.mature} />}</SizedChart>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Os mesmos valores, com legenda por canal, estão na tabela logo abaixo.</p>
          </Panel>

          <Panel
            id="card-canais" ai="card-canais"
            title="Canais · últimos 28 dias"
            sql="01_channel_summary.sql"
            info="Topo de funil (gasto, instalações, CPI, CPA) usa os últimos 28 dias. Ativação, CAC e ROAS D90 usam coortes maduras e, por isso, vêm de instalações mais antigas (mai–jul para o ROAS)."
          >
            <DataTable head={["Canal", "Gasto", "Instalações", "CPI", "Δ CPI", "CPI corrigido", "CPA", "Ativação", "CAC", "ROAS D90"]}>
              {data.last.map((r, i) => {
                const p = data.prev[i]!;
                const m = data.mature[i]!;
                const isTotal = r.channel === "paid_total";
                return (
                  <tr key={r.channel} className={cn(isTotal && "font-semibold")}>
                    <td className="whitespace-nowrap"><ChannelTag channel={r.channel} /></td>
                    <td className="tnum">{fmtBRLCompact(r.spend)}</td>
                    <td className="tnum">{fmtInt(r.installs)}{!isTotal && r.installs < 200 ? <span className="ml-1.5 rounded border px-1 text-[10px] font-medium text-warning" title="Menos de 200 instalações em 28 dias: leia as taxas com cautela.">amostra baixa</span> : null}</td>
                    <td className="tnum">{fmtBRL(r.cpi ?? 0)}</td>
                    <td><DeltaPill change={rel(r.cpi, p.cpi)} good="down" /></td>
                    <td className="tnum">{(() => { const c = data.corrections.find((x) => x.channel === r.channel); return c && c.cpi !== null ? <span title={`Estimativa: soma ~${fmtInt(c.lost28)} instalações iOS que o MMP deixou de atribuir.`}>{fmtBRL(c.cpi)}<span className="ml-1 text-[10px] text-muted-foreground">est.</span></span> : <span className="text-muted-foreground">—</span>; })()}</td>
                    <td className="tnum">{fmtBRL(r.cpaSignup ?? 0)}</td>
                    <td className="tnum">{r.activationRate === null ? "—" : fmtPct(r.activationRate, 0)}</td>
                    <td className="tnum">{r.cac === null ? "—" : fmtBRL(r.cac)}</td>
                    <td className={cn("tnum", (m.roas90 ?? 0) < 1 ? "text-danger" : "text-positive")}>{m.roas90 === null ? "—" : `${m.roas90.toFixed(2).replace(".", ",")}×`}</td>
                  </tr>
                );
              })}
            </DataTable>
            {data.corrections.map((c) => (
              <p key={`${c.channel}-${c.platform}`} className="mt-2 text-xs leading-relaxed text-muted-foreground">
                <strong className="text-foreground">{CHANNEL_LABEL[c.channel]} {c.platform === "ios" ? "iOS" : "Android"}:</strong> desde ~{c.onset ? dm(c.onset) : "—"} o MMP perde atribuição. O CPI bruto ({fmtBRL(c.cpiRaw ?? 0)}) está inflado; com ~{fmtInt(c.lost28)} instalações recuperadas seria {fmtBRL(c.cpi ?? 0)}. CAC das coortes maduras: {fmtBRL(c.cacRaw ?? 0)} bruto, {fmtBRL(c.cac ?? 0)} corrigido. {c.roas90Affected ? `ROAS D90: ${c.roas90Raw?.toFixed(2).replace(".", ",")}× bruto, ${c.roas90?.toFixed(2).replace(".", ",")}× corrigido.` : "O ROAS D90 não é afetado: a coorte é anterior ao defeito."} Não pause campanha pelo número bruto.
              </p>
            ))}
            <p className="mt-2 text-xs text-muted-foreground">
              Janela: {dm(last28.from)}–{dm(last28.to)} contra os 28 dias anteriores. ROAS ≥ 1,00× significa que a coorte pagou o próprio custo em 90 dias.
            </p>
          </Panel>

          <Panel id="card-leilao" ai="card-leilao" title="Leilão e criativo por canal" sql="01_channel_summary.sql" info="CPI = (CPM ÷ 1000) ÷ (CTR × instalações por clique). CPM subindo com CTR estável aponta o leilão. CTR caindo com CPM estável aponta criativo cansado. Instalações por clique caindo aponta a loja, o link ou o tracking. Frequência não está nos dados deste painel.">
            <DataTable head={["Canal", "CPM", "Δ CPM", "CTR", "Δ CTR", "CPC", "Δ CPC", "Instalações por clique", "Δ"]}>
              {data.last.map((r, i) => {
                const p = data.prev[i]!;
                return (
                  <tr key={r.channel} className={cn(r.channel === "paid_total" && "font-semibold")}>
                    <td className="whitespace-nowrap"><ChannelTag channel={r.channel} /></td>
                    <td className="tnum">{fmtBRL(r.cpm ?? 0)}</td>
                    <td><DeltaPill change={rel(r.cpm, p.cpm)} good="down" /></td>
                    <td className="tnum">{r.ctr === null ? "—" : fmtPct(r.ctr, 2)}</td>
                    <td><DeltaPill change={rel(r.ctr, p.ctr)} good="up" /></td>
                    <td className="tnum">{fmtBRL(r.cpc ?? 0)}</td>
                    <td><DeltaPill change={rel(r.cpc, p.cpc)} good="down" /></td>
                    <td className="tnum">{r.installsPerClick === null ? "—" : fmtPct(r.installsPerClick, 1)}</td>
                    <td><DeltaPill change={rel(r.installsPerClick, p.installsPerClick)} good="up" /></td>
                  </tr>
                );
              })}
            </DataTable>
            <p className="mt-2 text-xs text-muted-foreground">Últimos 28 dias contra os 28 anteriores. CPM por mil impressões.</p>
          </Panel>
        </div>

        <Panel id="card-insights" ai="card-insights" title="O que merece atenção" info="Insights gerados por regras sobre os números do motor. Clique para ir ao card de origem.">
          <ul className="space-y-3">
            {data.insights.slice(0, 8).map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => go(i.view, i.target)} className="group w-full rounded-lg p-2 text-left transition-colors hover:bg-secondary">
                  <div className="flex items-start gap-2">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", SEV[i.severity])} aria-hidden />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold leading-snug">{i.title}</div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{i.summary}</p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

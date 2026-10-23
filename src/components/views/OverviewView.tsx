import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { ChannelTag, DataTable, DeltaPill, Kpi, Panel, chart, SizedChart } from "@/components/dashboard/primitives";
import { useGoToCard } from "@/components/shell/use-go-to-card";
import { fmtBRL, fmtBRLCompact, fmtInt, fmtPct } from "@/lib/format";
import type { DashboardData } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

const rel = (a: number | null, b: number | null) => (a !== null && b ? a / b - 1 : null);
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const SEV = { alta: "bg-danger", media: "bg-warning", info: "bg-muted-foreground" } as const;

export function OverviewView({ data }: { data: DashboardData }) {
  const go = useGoToCard();
  const tot = data.last[data.last.length - 1]!;
  const prev = data.prev[data.prev.length - 1]!;
  const mat = data.mature[data.mature.length - 1]!;
  const { last28, mature90 } = data.per;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Investimento" value={fmtBRLCompact(tot.spend)} change={rel(tot.spend, prev.spend)} good="none" hint="28 dias" />
        <Kpi label="Instalações" value={fmtInt(tot.installs)} change={rel(tot.installs, prev.installs)} good="up" hint="atribuídas (MMP)" />
        <Kpi label="CPI" value={fmtBRL(tot.cpi ?? 0)} change={rel(tot.cpi, prev.cpi)} good="down" hint="gasto ÷ instalações" />
        <Kpi label="CPA cadastro" value={fmtBRL(tot.cpaSignup ?? 0)} change={rel(tot.cpaSignup, prev.cpaSignup)} good="down" hint="gasto ÷ cadastros" />
        <Kpi
          label="CAC"
          value={fmtBRL(tot.cac ?? 0)}
          change={rel(tot.cac, prev.cac)}
          good="down"
          hint="coortes com 14+ dias"
          info="Gasto ÷ usuários que usaram o cartão em até 14 dias. Só entram coortes com 14 dias de vida: instalações mais recentes ainda não tiveram tempo de ativar."
        />
        <Kpi
          label="ROAS D90"
          value={`${(mat.roas90 ?? 0).toFixed(2).replace(".", ",")}×`}
          hint={`coorte ${dm(mature90.from)}–${dm(mature90.to)}`}
          info="Receita acumulada em 90 dias ÷ gasto da mesma coorte. Só existe para instalações com 90 dias completos; por isso olha para trás, não para os últimos 28 dias."
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-4">
          <Panel id="card-serie" title="Investimento diário e CPI · 90 dias" sql="03_daily_series.sql">
            <div className="h-64">
              <SizedChart>{(w, h) => (<>
                <ComposedChart width={w} height={h} data={data.daily} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={dm} tick={chart.tick} tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis yAxisId="spend" tick={chart.tick} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => fmtBRLCompact(v)} />
                  <YAxis yAxisId="cpi" orientation="right" tick={chart.tick} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => `R$${v}`} domain={["auto", "auto"]} />
                  <Tooltip
                    {...chart.tooltip}
                    labelFormatter={(d: string) => dm(d)}
                    formatter={(v: number, name: string) => [name === "CPI" ? fmtBRL(v) : fmtBRL(v, 0), name]}
                  />
                  <Bar yAxisId="spend" dataKey="spend" name="Investimento" fill="var(--cat-6)" fillOpacity={0.35} radius={[2, 2, 0, 0]} />
                  <Line yAxisId="cpi" dataKey="cpi" name="CPI" stroke="var(--primary)" strokeWidth={2} dot={false} connectNulls />
                </ComposedChart>
              </>)}</SizedChart>
            </div>
          </Panel>

          <Panel
            id="card-canais"
            title="Canais · últimos 28 dias"
            sql="01_channel_summary.sql"
            info="Topo de funil (gasto, instalações, CPI, CPA) usa os últimos 28 dias. Ativação, CAC e ROAS D90 usam coortes maduras e, por isso, vêm de instalações mais antigas (mai–jul para o ROAS)."
          >
            <DataTable head={["Canal", "Gasto", "Instalações", "CPI", "Δ CPI", "CPA", "Ativação", "CAC", "ROAS D90"]}>
              {data.last.map((r, i) => {
                const p = data.prev[i]!;
                const m = data.mature[i]!;
                const isTotal = r.channel === "paid_total";
                return (
                  <tr key={r.channel} className={cn(isTotal && "font-semibold")}>
                    <td className="whitespace-nowrap"><ChannelTag channel={r.channel} /></td>
                    <td className="tnum">{fmtBRLCompact(r.spend)}</td>
                    <td className="tnum">{fmtInt(r.installs)}</td>
                    <td className="tnum">{fmtBRL(r.cpi ?? 0)}</td>
                    <td><DeltaPill change={rel(r.cpi, p.cpi)} good="down" /></td>
                    <td className="tnum">{fmtBRL(r.cpaSignup ?? 0)}</td>
                    <td className="tnum">{r.activationRate === null ? "—" : fmtPct(r.activationRate, 0)}</td>
                    <td className="tnum">{r.cac === null ? "—" : fmtBRL(r.cac)}</td>
                    <td className={cn("tnum", (m.roas90 ?? 0) < 1 ? "text-danger" : "text-positive")}>{m.roas90 === null ? "—" : `${m.roas90.toFixed(2).replace(".", ",")}×`}</td>
                  </tr>
                );
              })}
            </DataTable>
            <p className="mt-2 text-xs text-muted-foreground">
              Janela: {dm(last28.from)}–{dm(last28.to)} contra os 28 dias anteriores. ROAS ≥ 1,00× significa que a coorte pagou o próprio custo em 90 dias.
            </p>
          </Panel>
        </div>

        <Panel id="card-insights" title="O que merece atenção" info="Insights gerados por regras sobre os números do motor. Clique para ir ao card de origem.">
          <ul className="space-y-3">
            {data.insights.slice(0, 8).map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => go(i.view, i.target)} className="group w-full rounded-lg p-2 text-left transition-colors hover:bg-secondary">
                  <div className="flex items-start gap-2">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", SEV[i.severity])} aria-hidden />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold leading-snug">{i.title}</div>
                      <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground group-hover:line-clamp-none">{i.detail}</p>
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

import { useState } from "react";
import { ChannelTag, DataTable, Panel, channelColor } from "@/components/dashboard/primitives";
import { fmtBRL, fmtInt, fmtPct } from "@/lib/format";
import type { DashboardData } from "@/lib/dashboard-data";
import { CHANNELS, CHANNEL_LABEL } from "@/engine/types";
import type { Channel } from "@/engine/types";
import { cn } from "@/lib/utils";

type Sel = "all" | Channel;

export function FunilView({ data }: { data: DashboardData }) {
  const [sel, setSel] = useState<Sel>("all");
  const f = sel === "all" ? data.funnelAll : data.funnelBy[sel];
  const installs = f.steps.find((s) => s.key === "installs")!.count || 1;
  const color = sel === "all" ? "var(--primary)" : channelColor(sel);

  return (
    <div className="space-y-4">
      <Panel
        id="card-funil" ai="card-funil"
        title="Funil de coorte"
        sql="02_funnel.sql"
        info="Coortes com 14+ dias de vida, para o fundo do funil ser comparável. Custo por unidade = gasto do período ÷ contagem da etapa."
        actions={
          <div className="flex flex-wrap gap-1" role="group" aria-label="Canal">
            {(["all", ...CHANNELS] as Sel[]).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={sel === c}
                onClick={() => setSel(c)}
                className={cn("h-7 rounded-md border px-2 text-xs font-medium", sel === c ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary")}
              >
                {c === "all" ? "Todos" : CHANNEL_LABEL[c]}
              </button>
            ))}
          </div>
        }
      >
        <ul className="space-y-2.5">
          {f.steps.map((s) => {
            const topOfFunnel = s.key === "impressions" || s.key === "clicks";
            const width = topOfFunnel ? 100 : Math.max(2, Math.min(100, (s.count / installs) * 100));
            return (
              <li key={s.key} className="grid grid-cols-[8.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 text-sm sm:grid-cols-[11rem_minmax(0,1fr)_14rem]">
                <span className="truncate font-medium">{s.label}</span>
                <div className="h-6 rounded bg-muted">
                  <div className="h-full rounded" style={{ width: `${width}%`, background: color, opacity: topOfFunnel ? 0.3 : 0.9 }} />
                </div>
                <div className="tnum flex flex-col items-end text-right leading-tight">
                  <span className="font-semibold">{fmtInt(s.count)}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {s.rate === null ? "" : `${fmtPct(s.rate, 1)} da etapa anterior · `}
                    <span className="hidden sm:inline">{fmtBRL(s.costPer ?? 0)} por unidade</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Barras de impressões e cliques são só contexto (escala diferente). A partir de instalações, a largura é proporcional às instalações. Período: {f.range.from} a {f.range.to}.
        </p>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel id="card-funil-canais" ai="card-funil-canais" title="Conversão entre etapas, por canal" sql="02_funnel.sql">
          <DataTable head={["Canal", "Instalou → cadastrou", "Cadastro → KYC", "KYC → uso do cartão", "Instalou → usou"]}>
            {CHANNELS.map((c) => {
              const st = data.funnelBy[c].steps;
              const rate = (k: string) => st.find((s) => s.key === k)!.rate;
              const inst = st.find((s) => s.key === "installs")!.count;
              const act = st.find((s) => s.key === "activated")!.count;
              return (
                <tr key={c}>
                  <td className="whitespace-nowrap"><ChannelTag channel={c} /></td>
                  <td className="tnum">{fmtPct(rate("signups") ?? 0, 0)}</td>
                  <td className="tnum">{fmtPct(rate("kyc") ?? 0, 0)}</td>
                  <td className="tnum">{fmtPct(rate("activated") ?? 0, 0)}</td>
                  <td className="tnum font-medium">{inst > 0 ? fmtPct(act / inst, 0) : "—"}</td>
                </tr>
              );
            })}
          </DataTable>
        </Panel>

        <Panel id="card-plataforma" ai="card-plataforma" title="iOS × Android · CPI, últimos 28 dias" sql="07_platform_split.sql">
          <DataTable head={["Canal", "CPI Android", "CPI iOS", "iOS vs. Android"]}>
            {CHANNELS.map((c) => {
              const a = data.platform.find((p) => p.channel === c && p.platform === "android");
              const i = data.platform.find((p) => p.channel === c && p.platform === "ios");
              const ratio = a?.cpi && i?.cpi ? i.cpi / a.cpi - 1 : null;
              return (
                <tr key={c}>
                  <td className="whitespace-nowrap"><ChannelTag channel={c} /></td>
                  <td className="tnum">{fmtBRL(a?.cpi ?? 0)}</td>
                  <td className="tnum">{fmtBRL(i?.cpi ?? 0)}</td>
                  <td className="tnum">{ratio === null ? "—" : `${ratio >= 0 ? "+" : "−"}${fmtPct(Math.abs(ratio), 0)}`}</td>
                </tr>
              );
            })}
          </DataTable>
          <p className="mt-2 text-xs text-muted-foreground">O CPI do Meta no iOS está inflado pela perda de atribuição no MMP (ver Saúde da coleta).</p>
        </Panel>
      </div>
    </div>
  );
}

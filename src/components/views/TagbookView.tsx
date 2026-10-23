import { Check } from "lucide-react";
import { Panel, StatusBadge } from "@/components/dashboard/primitives";
import type { DashboardData } from "@/lib/dashboard-data";
import type { HealthStatus } from "@/engine/tracking";

const ORDER: HealthStatus[] = ["broken", "warn", "ok", "low_volume"];
const PLAT = { android: "Android", ios: "iOS", web: "Web" } as const;

export function TagbookView({ data }: { data: DashboardData }) {
  const statusOf = (event: string): HealthStatus => {
    const all = data.tracking.events.filter((e) => e.event === event).map((e) => e.status);
    return ORDER.find((s) => all.includes(s)) ?? "low_volume";
  };
  return (
    <div className="space-y-4">
      <Panel
        id="card-tagbook" ai="card-tagbook"
        title="Plano de coleta (tagbook)"
        sql="05_event_health.sql"
        info="Cada evento tem dono, gatilho, parâmetros, destinos e uma referência independente usada para saber se a coleta está correta. O status vem da checagem de saúde, não de um campo preenchido à mão."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                {["Evento", "Onde", "Gatilho", "Parâmetros", "Conversão", "Destinos", "Dono", "Referência de qualidade", "Status"].map((h) => (
                  <th key={h} className="px-2 py-2 font-semibold first:pl-0 last:pr-0">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="align-top [&_td]:px-2 [&_td]:py-3 [&_td:first-child]:pl-0 [&_td:last-child]:pr-0 [&_tr]:border-b [&_tr:last-child]:border-0">
              {data.ds.tagbook.map((t) => (
                <tr key={t.event_name}>
                  <td className="font-mono text-xs font-semibold">{t.event_name}</td>
                  <td className="whitespace-nowrap text-xs">{t.platforms.map((p) => PLAT[p]).join(", ")}</td>
                  <td className="max-w-56 text-xs leading-relaxed">{t.trigger}</td>
                  <td>
                    <div className="flex max-w-48 flex-wrap gap-1">
                      {t.params.map((p) => (<code key={p} className="rounded bg-secondary px-1 py-0.5 text-[11px]">{p}</code>))}
                    </div>
                  </td>
                  <td>{t.is_conversion ? <Check className="size-4 text-positive" aria-label="É conversão" /> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="max-w-40 text-xs">{t.destinations.join(", ")}</td>
                  <td className="whitespace-nowrap text-xs">{t.owner}</td>
                  <td className="max-w-48 text-xs leading-relaxed text-muted-foreground">{t.reference}</td>
                  <td><StatusBadge status={statusOf(t.event_name)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel id="card-governanca" title="Governança" info="Regras de padronização usadas neste plano de coleta.">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          <li className="rounded-lg bg-secondary p-3"><strong>Nome.</strong> snake_case, verbo no particípio para o que já aconteceu (<code>signup_completed</code>), sem espaços nem maiúsculas.</li>
          <li className="rounded-lg bg-secondary p-3"><strong>Conversão.</strong> Só vira conversão em plataforma de mídia o evento que também existe no backend, para que haja referência independente.</li>
          <li className="rounded-lg bg-secondary p-3"><strong>Dono.</strong> Todo evento tem um responsável. Mudou o gatilho ou a versão do app: o dono avisa Mídia antes da publicação.</li>
          <li className="rounded-lg bg-secondary p-3"><strong>Monitoramento.</strong> Cada evento tem razão-base e banda de ±35%. Fora da banda por vários dias vira alerta com data de início.</li>
        </ul>
      </Panel>
    </div>
  );
}

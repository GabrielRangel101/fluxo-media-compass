import { Link } from "@tanstack/react-router";
import type { DashboardData } from "@/lib/dashboard-data";
import { fmtBRLCompact, fmtInt } from "@/lib/format";
import { avatarColor, fmtRisk, initials } from "./avatar";
import { DashCard } from "./DashCard";

export function AtRiskNow({ data, className }: { data: DashboardData; className?: string }) {
  const stats = [
    { label: "Críticos", value: fmtInt(data.risk.critical), tone: "text-danger" },
    { label: "MRR em risco", value: fmtBRLCompact(data.risk.mrrAtRisk), tone: "text-danger" },
    { label: "Gatilho", value: data.risk.topDriver?.key ?? "—", tone: "text-foreground" },
  ];
  return (
    <DashCard
      ai="at-risk"
      title="Em risco agora"
      info={`Assinantes com risco de cancelar em 90 dias ≥ ${data.criticalRisk}% e os cinco maiores riscos da base ativa.`}
      actions={<Link to="/" search={{ view: "risco" }} className="text-[11px] font-medium text-primary hover:underline">ver mapa</Link>}
      className={className}
      bodyClassName="gap-2"
    >
      <dl className="grid shrink-0 grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0 rounded-lg border bg-background/30 px-2 py-1.5">
            <dt className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</dt>
            <dd className={`truncate text-sm font-semibold tabular-nums ${s.tone}`} title={s.value}>{s.value}</dd>
          </div>
        ))}
      </dl>
      <ul className="flex min-h-0 flex-1 flex-col justify-between overflow-y-auto" aria-label="Cinco maiores riscos">
        {data.topRisk.map((p) => (
          <li key={p.id} className="flex min-w-0 items-center gap-2 py-0.5">
            <span className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-primary-foreground" style={{ background: avatarColor(p.avatarSeed) }} aria-hidden>{initials(p.name)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-foreground">{p.name}</span>
              <span className="block truncate text-[10px] text-muted-foreground">{p.plan} · {p.driver}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-danger">{fmtRisk(p.risk)}</span>
          </li>
        ))}
      </ul>
    </DashCard>
  );
}

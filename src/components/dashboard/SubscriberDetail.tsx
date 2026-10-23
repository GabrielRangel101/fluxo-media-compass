import { X } from "lucide-react";
import type { AtRiskRow } from "@/engine/metrics";
import { Button } from "@/components/ui/button";
import { DRIVER_COLORS } from "@/lib/dashboard-data";
import { fmtBRL, fmtInt } from "@/lib/format";
import { fmtRisk } from "./avatar";

export function SubscriberDetail({ person, onClose, compact = false }: { person: AtRiskRow; onClose?: () => void; compact?: boolean }) {
  return (
    <div className={compact ? "glass max-w-full rounded-lg p-2.5 text-[11px]" : "min-w-0"} aria-label={compact ? `Resumo de ${person.name}` : "Detalhe do assinante"}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold">{person.name}</h4>
          <p className="text-[11px] font-medium" style={{ color: DRIVER_COLORS[person.driver] }}>{person.driver}</p>
        </div>
        {onClose && <Button size="icon" variant="ghost" className="size-6" aria-label="Fechar detalhe" onClick={onClose}><X /></Button>}
      </div>
      <dl className={compact ? "mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1" : "mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs"}>
        {[
          ["Plano", person.plan], ["Canal", person.channel], ["Editoria", person.interest], ["Tempo de casa", `${fmtInt(person.tenureMonths)} meses`], ["Engajamento", `${fmtInt(person.engagement)} / 100`], ["Risco em 90 dias", fmtRisk(person.risk)], ["MRR", fmtBRL(person.mrr)], ["Gatilho", person.driver],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[10px] text-muted-foreground">{label}</dt>
            <dd className="truncate font-medium" title={value}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

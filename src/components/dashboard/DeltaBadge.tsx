import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { DeltaView } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export function DeltaBadge({ delta, subtle = false }: { delta: DeltaView; subtle?: boolean }) {
  const Icon = delta.dir === "up" ? ArrowUpRight : delta.dir === "down" ? ArrowDownRight : ArrowRight;
  const tone = delta.good === null ? "text-muted-foreground" : delta.good ? "text-positive" : "text-danger";
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-0.5 text-[11px] font-medium tabular-nums", subtle ? "text-muted-foreground" : tone)}>
      <Icon className={cn("size-3.5", subtle && tone)} aria-hidden />
      {delta.text}
      <span className="sr-only">{delta.good === null ? "" : delta.good ? "(favorável)" : "(desfavorável)"}</span>
    </span>
  );
}

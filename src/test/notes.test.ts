import { describe, expect, it } from "vitest";
import { generateDataset } from "@/engine/generate";
import { buildSeries } from "@/engine/metrics";
import { monthNote } from "@/engine/notes";

const ds = generateDataset();
const series = buildSeries(ds);
const find = (label: string) => series.findIndex((p) => p.label === label);

describe("notas por mês", () => {
  it("a Black Friday 25 aparece como pico de aquisição, citando o evento", () => {
    const n = monthNote(series, ds.meta.events, find("Nov/25"));
    expect(n).not.toBeNull();
    expect(n!.headline).toContain("pico de aquisição");
    expect(n!.lines.join(" ")).toContain("Black Friday 25");
  });
  it("o saldo da nota é o do gráfico", () => {
    const i = find("Jul/26");
    const n = monthNote(series, ds.meta.events, i)!;
    expect(n.lines[0]).toContain(series[i].newSubs.toLocaleString("pt-BR"));
    expect(n.lines[0]).toContain(series[i].cancelled.toLocaleString("pt-BR"));
  });
  it("mês fora da série devolve null e os primeiros meses não quebram", () => {
    expect(monthNote(series, ds.meta.events, 999)).toBeNull();
    expect(monthNote(series, ds.meta.events, 0)!.lines.length).toBeGreaterThan(0);
  });
});

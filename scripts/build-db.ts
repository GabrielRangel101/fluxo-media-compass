// Gera data/fluxo.sqlite e CSVs do dataset sintético (para abrir no DBeaver, Power BI, Looker Studio...).
//   node scripts/build-db.ts
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { generateDataset } from "../src/engine/generate.ts";
import { loadDataset } from "./load-sqlite.ts";

mkdirSync("data", { recursive: true });
rmSync("data/fluxo.sqlite", { force: true });
const ds = generateDataset();
const db = loadDataset(ds, "data/fluxo.sqlite");
db.close();

const csv = (rows: object[]) => {
  const cols = Object.keys(rows[0] ?? {});
  const esc = (v: unknown) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(","))].join("\n");
};
writeFileSync("data/ad_spend_daily.csv", csv(ds.adSpend));
writeFileSync("data/users.csv", csv(ds.users));
writeFileSync("data/events_daily.csv", csv(ds.events));
writeFileSync("data/experiments.csv", csv(ds.experiments));
writeFileSync("data/campaigns.csv", csv(ds.campaigns));
console.log(`ok: ${ds.users.length} usuários, ${ds.adSpend.length} linhas de mídia, ${ds.events.length} eventos → data/`);

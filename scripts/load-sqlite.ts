// Carrega o dataset sintético em SQLite (node:sqlite, sem dependências) e executa os arquivos de /sql.
// Usado pelo teste de equivalência SQL × TypeScript e por scripts/build-db.ts.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Dataset } from "../src/engine/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
export const SQL_DIR = join(here, "..", "sql");

export function readSql(file: string): string {
  return readFileSync(join(SQL_DIR, file), "utf8");
}

export function loadDataset(ds: Dataset, path = ":memory:"): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(readSql("00_schema.sql"));
  const tx = (fn: () => void) => {
    db.exec("BEGIN");
    fn();
    db.exec("COMMIT");
  };
  tx(() => {
    const c = db.prepare("INSERT INTO campaigns VALUES (?,?,?,?)");
    for (const x of ds.campaigns) c.run(x.campaign_id, x.channel, x.name, x.objective);

    const a = db.prepare("INSERT INTO ad_spend_daily VALUES (?,?,?,?,?,?,?,?,?)");
    for (const r of ds.adSpend)
      a.run(r.date, r.channel, r.campaign_id, r.platform, r.impressions, r.clicks, r.spend, r.platform_installs, r.platform_signups);

    const u = db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?,?,?)");
    for (const r of ds.users)
      u.run(r.user_id, r.install_date, r.channel, r.campaign_id, r.platform, r.signup_date, r.kyc_date, r.first_use_date, r.rev_d30, r.rev_d90, r.utm_internal);

    const e = db.prepare("INSERT INTO events_daily VALUES (?,?,?,?,?)");
    for (const r of ds.events) e.run(r.date, r.event_name, r.platform, r.source, r.event_count);

    const x = db.prepare("INSERT INTO experiments VALUES (?,?,?,?,?,?,?,?,?,?)");
    for (const r of ds.experiments)
      x.run(r.test_id, r.channel, r.test_type, r.name, r.variant, r.start_date, r.end_date, r.impressions, r.clicks, r.installs);

    const t = db.prepare("INSERT INTO tagbook VALUES (?,?,?,?,?,?,?,?,?)");
    for (const r of ds.tagbook)
      t.run(r.event_name, r.area, r.platforms.join(","), r.trigger, r.params.join(","), r.is_conversion ? 1 : 0, r.destinations.join(","), r.owner, r.reference);
  });
  return db;
}

export type Params = Record<string, string | number | null>;

/** Executa um arquivo .sql com parâmetros nomeados (só liga os que a consulta usa). */
export function runQuery(db: DatabaseSync, file: string, params: Params = {}): Record<string, unknown>[] {
  const sql = readSql(file);
  const used = new Set([...sql.matchAll(/:([a-z_]+)/g)].map((m) => m[1]!));
  const bound: Params = {};
  for (const k of used) {
    if (!(k in params)) throw new Error(`${file}: parâmetro :${k} não informado`);
    bound[k] = params[k]!;
  }
  return db.prepare(sql).all(bound) as Record<string, unknown>[];
}

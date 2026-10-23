// Prova que o SQL de /sql e o motor TypeScript calculam os mesmos números sobre o mesmo dataset.
// Rodar: node --test tests/
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { generateDataset } from "../src/engine/generate.ts";
import { channelSummary, dailySeries, funnel, periods, platformSplit } from "../src/engine/metrics.ts";
import { eventHealth, reconcile } from "../src/engine/tracking.ts";
import { readTests } from "../src/engine/experiments.ts";
import { CHANNELS } from "../src/engine/types.ts";
import type { Channel, Dataset, DateRange } from "../src/engine/types.ts";
import { loadDataset, runQuery } from "../scripts/load-sqlite.ts";
import type { DatabaseSync } from "node:sqlite";

let ds: Dataset;
let db: DatabaseSync;
before(() => {
  ds = generateDataset();
  db = loadDataset(ds);
});

function near(a: unknown, b: unknown, label: string) {
  if (a === null || a === undefined || b === null || b === undefined) {
    assert.equal(a ?? null, b ?? null, `${label}: um é nulo e o outro não (${a} vs ${b})`);
    return;
  }
  const x = Number(a);
  const y = Number(b);
  const tol = 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
  assert.ok(Math.abs(x - y) <= tol, `${label}: SQL=${x} TS=${y}`);
}

const camel: Record<string, string> = {
  platform_installs: "platformInstalls", platform_signups: "platformSignups", installs_m: "installsM",
  signups_m: "signupsM", kyc_m: "kycM", activated_m: "activatedM", spend_m: "spendM", spend_30: "spend30",
  rev_30: "rev30", spend_90: "spend90", rev_90: "rev90", activated_90: "activated90",
  installs_per_click: "installsPerClick", cpa_signup: "cpaSignup", signup_rate: "signupRate", kyc_rate: "kycRate",
  activation_rate: "activationRate", roas_30: "roas30", roas_90: "roas90", ltv_90: "ltv90",
};

const p = () => periods(ds);

test("01 resumo por canal: SQL = TS em 3 janelas × (todas | iOS)", () => {
  const windows: [string, DateRange][] = [["last28", p().last28], ["mature90", p().mature90], ["full", p().full]];
  for (const [name, range] of windows)
    for (const platform of [null, "ios"] as const) {
      const sql = runQuery(db, "01_channel_summary.sql", { from: range.from, to: range.to, ref: ds.meta.refDate, platform });
      const ts = channelSummary(ds, range, platform ? { platform } : {});
      assert.equal(sql.length, ts.length, `${name}: nº de linhas`);
      for (const row of ts) {
        const s = sql.find((r) => r["channel"] === row.channel)!;
        assert.ok(s, `${name}: canal ${row.channel} ausente no SQL`);
        for (const [col, val] of Object.entries(s)) {
          if (col === "channel") continue;
          const key = (camel[col] ?? col) as keyof typeof row;
          near(val, row[key], `${name}/${platform ?? "all"}/${row.channel}/${col}`);
        }
      }
    }
});

test("02 funil: SQL = TS (todos os canais e cada canal)", () => {
  const range = p().full;
  for (const channel of [null, ...CHANNELS] as (Channel | null)[]) {
    const sql = runQuery(db, "02_funnel.sql", { from: range.from, to: range.to, ref: ds.meta.refDate, channel, platform: null })[0]!;
    const f = funnel(ds, range, channel ?? undefined);
    const counts = Object.fromEntries(f.steps.map((s) => [s.key, s.count]));
    near(sql["spend"], f.spend, `funil/${channel}/spend`);
    for (const k of ["impressions", "clicks", "installs", "signups", "kyc", "activated"])
      near(sql[k], counts[k], `funil/${channel}/${k}`);
  }
});

test("03 série diária: SQL = TS", () => {
  const range = p().last28;
  for (const channel of [null, "tiktok_ads"] as (Channel | null)[]) {
    const sql = runQuery(db, "03_daily_series.sql", { from: range.from, to: range.to, channel });
    const ts = dailySeries(ds, range, channel ?? undefined);
    assert.equal(sql.length, ts.length);
    ts.forEach((pt, i) => {
      const s = sql[i]!;
      assert.equal(s["date"], pt.date);
      near(s["spend"], pt.spend, `diária/${pt.date}/spend`);
      near(s["clicks"], pt.clicks, `diária/${pt.date}/clicks`);
      near(s["installs"], pt.installs, `diária/${pt.date}/installs`);
      near(s["signups"], pt.signups, `diária/${pt.date}/signups`);
      near(s["cpi"], pt.cpi, `diária/${pt.date}/cpi`);
    });
  }
});

test("04 reconciliação entre fontes: SQL = TS (razões, desvio e status)", () => {
  const sql = runQuery(db, "04_reconciliation.sql", { start: ds.meta.startDate, ref: ds.meta.refDate });
  const ts = reconcile(ds);
  assert.equal(sql.length, ts.length);
  for (const r of ts) {
    const s = sql.find((x) => x["check"] === r.check && x["channel"] === r.channel && x["platform"] === r.platform);
    assert.ok(s, `${r.check}/${r.channel}/${r.platform} ausente no SQL`);
    const k = `${r.check}/${r.channel}/${r.platform}`;
    near(s["a"], r.a, `${k}/a`);
    near(s["b"], r.b, `${k}/b`);
    near(s["ratio_baseline"], r.ratioBaseline, `${k}/base`);
    near(s["ratio_current"], r.ratioCurrent, `${k}/cur`);
    near(s["deviation"], r.deviation, `${k}/dev`);
    assert.equal(s["status"], r.status, `${k}/status`);
  }
});

test("05 saúde dos eventos: SQL = TS (razões, desvio e status)", () => {
  const sql = runQuery(db, "05_event_health.sql", { start: ds.meta.startDate, ref: ds.meta.refDate });
  const ts = eventHealth(ds);
  assert.equal(sql.length, ts.length);
  for (const r of ts) {
    const s = sql.find((x) => x["event"] === r.event && x["platform"] === r.platform);
    assert.ok(s, `${r.event}/${r.platform} ausente no SQL`);
    const k = `${r.event}/${r.platform}`;
    near(s["ratio_baseline"], r.ratioBaseline, `${k}/base`);
    near(s["ratio_current"], r.ratioCurrent, `${k}/cur`);
    near(s["deviation"], r.deviation, `${k}/dev`);
    assert.equal(s["status"], r.status, `${k}/status`);
  }
});

test("06 testes A/B: taxas por variante e divisão de impressões", () => {
  const sql = runQuery(db, "06_ab_tests.sql");
  for (const t of readTests(ds))
    for (const v of [t.a, t.b]) {
      const s = sql.find((x) => x["test_id"] === t.testId && x["variant"] === v.variant)!;
      near(s["ctr"], v.clicks / v.impressions, `${t.testId}/${v.variant}/ctr`);
      near(s["installs_per_impression"], v.installs / v.impressions, `${t.testId}/${v.variant}/ipi`);
      near(s["impression_share"], v.impressions / (t.a.impressions + t.b.impressions), `${t.testId}/${v.variant}/share`);
    }
});

test("07 plataforma: SQL = TS", () => {
  const range = p().last28;
  const sql = runQuery(db, "07_platform_split.sql", { from: range.from, to: range.to });
  for (const r of platformSplit(ds, range)) {
    const s = sql.find((x) => x["channel"] === r.channel && x["platform"] === r.platform)!;
    near(s["spend"], r.spend, `${r.channel}/${r.platform}/spend`);
    near(s["installs"], r.installs, `${r.channel}/${r.platform}/installs`);
    near(s["cpi"], r.cpi, `${r.channel}/${r.platform}/cpi`);
  }
});

test("08 insumo da curva de resposta: totais por canal batem com o dataset", () => {
  const sql = runQuery(db, "08_curve_inputs.sql", { ref: ds.meta.refDate });
  const cutoff = ds.dates[ds.dates.length - 1 - 45]!;
  for (const ch of CHANNELS) {
    const rows = sql.filter((r) => r["channel"] === ch);
    const spend = ds.adSpend.filter((r) => r.channel === ch && r.date <= cutoff).reduce((a, r) => a + r.spend, 0);
    const installs = ds.users.filter((u) => u.channel === ch && u.install_date <= cutoff).length;
    near(rows.reduce((a, r) => a + Number(r["spend"]), 0), spend, `${ch}/spend`);
    near(rows.reduce((a, r) => a + Number(r["installs"]), 0), installs, `${ch}/installs`);
  }
});

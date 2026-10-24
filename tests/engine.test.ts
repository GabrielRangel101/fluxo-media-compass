// Testes do motor de dados. Rodar: node --test "tests/*.test.ts"
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { CHANNEL_CFG, DEFECTS, generateDataset } from "../src/engine/generate.ts";
import { channelSummary, funnel, maturity, periods } from "../src/engine/metrics.ts";
import { eventHealth, reconcile } from "../src/engine/tracking.ts";
import { normCdf, readTests, twoSidedP } from "../src/engine/experiments.ts";
import { MAX_SHIFT, channelEconomics, fitCurves, simulateShift } from "../src/engine/allocation.ts";
import { answer, route } from "../src/engine/ask.ts";
import { buildInsights } from "../src/engine/insights.ts";
import { addDays } from "../src/engine/calendar.ts";
import type { Dataset } from "../src/engine/types.ts";

let ds: Dataset;
before(() => {
  ds = generateDataset();
});

test("dataset é determinístico: mesmo seed, mesmo conteúdo", () => {
  const h = (d: Dataset) => createHash("sha256").update(JSON.stringify([d.adSpend, d.users, d.events, d.experiments])).digest("hex");
  assert.equal(h(generateDataset()), h(ds));
  assert.notEqual(h(generateDataset(1)), h(ds));
});

test("invariantes do funil e da censura à direita", () => {
  const m = maturity(ds);
  for (const u of ds.users) {
    if (u.signup_date) assert.ok(u.signup_date >= u.install_date);
    if (u.kyc_date) assert.ok(u.signup_date && u.kyc_date >= u.signup_date, "KYC sem cadastro");
    if (u.first_use_date) assert.ok(u.kyc_date && u.first_use_date > u.kyc_date, "uso sem KYC");
    for (const d of [u.signup_date, u.kyc_date, u.first_use_date]) if (d) assert.ok(d <= ds.meta.refDate, "evento no futuro");
    assert.equal(u.rev_d30 === null, u.install_date > m.d30, "rev_d30 nulo só para coorte imatura");
    assert.equal(u.rev_d90 === null, u.install_date > m.d90, "rev_d90 nulo só para coorte imatura");
    if (!u.first_use_date && u.rev_d30 !== null) assert.equal(u.rev_d30, 0, "sem ativação, receita zero");
  }
});

test("regras de maturidade: ROAS não existe para coorte recente e CAC usa só D14", () => {
  const p = periods(ds);
  const m = maturity(ds);
  const recent = channelSummary(ds, p.last28);
  for (const r of recent) {
    assert.equal(r.roas30, null, `${r.channel}: ROAS D30 de coorte < 30 dias deveria ser nulo`);
    assert.equal(r.roas90, null);
    if (r.cac !== null) assert.ok(Math.abs(r.cac - r.spendM / r.activatedM) < 1e-9);
    assert.ok(r.spendM < r.spend, "gasto maduro é subconjunto do gasto total");
  }
  const lastDay = addDays(p.last28.to, 0);
  assert.ok(m.d14 < lastDay);
});

test("a economia por canal conta a história esperada (qualidade ≠ volume)", () => {
  const mature = channelSummary(ds, periods(ds).mature90);
  const roas = Object.fromEntries(mature.map((r) => [r.channel, r.roas90!]));
  assert.ok(roas["google_ads"]! > roas["meta_ads"]!);
  assert.ok(roas["meta_ads"]! > roas["tiktok_ads"]!);
  assert.ok(roas["tiktok_ads"]! > roas["dv360"]!);
  assert.ok(roas["google_ads"]! > 1 && roas["dv360"]! < 0.5);
  const cpi = Object.fromEntries(mature.map((r) => [r.channel, r.cpi!]));
  assert.ok(cpi["tiktok_ads"]! < cpi["google_ads"]!, "TikTok tem o menor CPI entre os canais de volume");
  assert.ok(roas["tiktok_ads"]! < roas["google_ads"]!, "...mas retorno pior: CPI baixo não é eficiência");
});

test("funil é monotônico decrescente", () => {
  for (const ch of [undefined, "google_ads", "tiktok_ads"] as const) {
    const f = funnel(ds, periods(ds).full, ch);
    for (let i = 1; i < f.steps.length; i++) assert.ok(f.steps[i]!.count <= f.steps[i - 1]!.count, `${ch}: etapa ${f.steps[i]!.key}`);
    assert.ok(f.range.to <= maturity(ds).d14);
  }
});

test("coleta: os 5 defeitos injetados são encontrados, e só eles", () => {
  const recon = reconcile(ds);
  const events = eventHealth(ds);
  const key = (r: { check: string; channel: string; platform: string }) => `${r.check}|${r.channel}|${r.platform}`;
  assert.deepEqual(
    recon.filter((r) => r.status === "broken").map(key).sort(),
    ["installs_platform_vs_mmp|meta_ads|ios", "signups_backend_vs_mmp|linkedin_ads|all", "signups_platform_vs_mmp|google_ads|all"].sort(),
  );
  assert.deepEqual(
    events.filter((e) => e.status === "broken").map((e) => `${e.event}|${e.platform}`).sort(),
    ["form_submit|web", "kyc_done|android"],
  );
  // O início de cada defeito é recuperado com exatidão a partir dos dados.
  assert.equal(events.find((e) => e.event === "kyc_done" && e.platform === "android")!.onset, DEFECTS.kycDoneAndroidSdk.from);
  assert.equal(events.find((e) => e.event === "form_submit")!.onset, DEFECTS.ga4FormSubmitDuplicate.from);
  assert.equal(events.find((e) => e.event === "kyc_done" && e.platform === "android")!.direction, "drop");
  assert.equal(events.find((e) => e.event === "form_submit")!.direction, "spike");
  // Efeito colateral esperado do defeito do Meta iOS: atenção (não quebrado) nos cadastros do Meta.
  const warns = recon.filter((r) => r.status === "warn").map(key).sort();
  assert.deepEqual(warns, ["signups_backend_vs_mmp|meta_ads|all", "signups_platform_vs_mmp|meta_ads|all"].sort());
  // Canal com pouco volume nunca é julgado.
  assert.ok(recon.filter((r) => r.channel === "linkedin_ads" && r.check === "installs_platform_vs_mmp").every((r) => r.status === "low_volume"));
});

test("a plataforma sempre infla instalações vs. o MMP, e isso não é alerta", () => {
  const rows = reconcile(ds).filter((r) => r.check === "installs_platform_vs_mmp" && r.status === "ok");
  assert.ok(rows.length >= 6);
  for (const r of rows) assert.ok((r.ratioCurrent ?? 0) >= 1, `${r.channel}/${r.platform}: razão < 1`);
});

test("curva de resposta recupera a elasticidade verdadeira", () => {
  const truth = Object.fromEntries(CHANNEL_CFG.map((c) => [c.id, c.beta]));
  for (const c of fitCurves(ds)) {
    const tol = c.lowConfidence ? 0.2 : 0.08;
    assert.ok(Math.abs(c.beta - truth[c.channel]!) <= tol, `${c.channel}: β=${c.beta.toFixed(3)} vs verdadeiro ${truth[c.channel]}`);
  }
  assert.deepEqual(fitCurves(ds).filter((c) => c.lowConfidence).map((c) => c.channel), ["linkedin_ads"]);
});

test("simulador: orçamento total preservado, limite de 50% e avisos", () => {
  const s = simulateShift(ds, "dv360", "google_ads", 0.3);
  const before = s.rows.reduce((a, r) => a + r.spendBefore, 0);
  const after = s.rows.reduce((a, r) => a + r.spendAfter, 0);
  assert.ok(Math.abs(before - after) < 1e-6, "realocação não pode mudar o orçamento total");
  assert.ok(s.valueDelta > 0, "tirar de DV360 e dar ao Google gera valor");
  const capped = simulateShift(ds, "dv360", "google_ads", 0.9);
  assert.equal(capped.pct, MAX_SHIFT);
  assert.ok(capped.capped && capped.warnings.some((w) => w.includes("limitada")));
  const noop = simulateShift(ds, "meta_ads", "meta_ads", 0.2);
  assert.equal(noop.installsDelta, 0);
  assert.equal(noop.movedAmount, 0);
  assert.ok(noop.rows.every((r) => r.spendAfter === r.spendBefore), "origem = destino não pode alterar nenhum gasto");
  const big = simulateShift(ds, "google_ads", "linkedin_ads", 0.5); // LinkedIn quase triplica: fora da faixa observada
  assert.ok(big.outOfBand && big.warnings.some((w) => w.includes("extrapola")));
  const eco = channelEconomics(ds);
  assert.ok(eco.every((e) => e.marginalCpi! > e.cpi!), "com β < 1, o CPI marginal é maior que o médio");
});

test("testes A/B: SRM > amostra mínima > significância", () => {
  const v = Object.fromEntries(readTests(ds).map((t) => [t.testId, t.verdict]));
  assert.deepEqual(v, { T1: "winner_b", T2: "underpowered", T3: "no_difference", T4: "underpowered", T5: "srm", T6: "no_difference" });
  const t4 = readTests(ds).find((t) => t.testId === "T4")!;
  assert.ok(t4.primary.p < 0.05, "T4 é 'significativo' mas com poucas conversões: não pode virar vencedor");
  assert.ok(Math.abs(normCdf(1.96) - 0.975) < 1e-3);
  assert.ok(Math.abs(twoSidedP(1.96) - 0.05) < 2e-3);
  assert.ok(Math.abs(twoSidedP(0) - 1) < 1e-6, "erf de Abramowitz–Stegun tem erro de ~1,5e-7");
});

test("insights: ordenados por gravidade e cobrem coleta, eficiência, testes e funil", () => {
  const ins = buildInsights(ds);
  const rank = { alta: 0, media: 1, info: 2 };
  for (let i = 1; i < ins.length; i++) assert.ok(rank[ins[i]!.severity] >= rank[ins[i - 1]!.severity]);
  const topics = new Set(ins.map((i) => i.topic));
  for (const t of ["tracking", "eficiencia", "canais", "testes", "funil"]) assert.ok(topics.has(t as never), `sem insight de ${t}`);
  assert.equal(new Set(ins.map((i) => i.id)).size, ins.length, "ids únicos");
  // O insight do Meta não pode atribuir a alta de CPI a piora do canal, e o do TikTok não pode citar falha de coleta.
  assert.ok(ins.find((i) => i.id === "trk-meta-ios")!.detail.includes("estimativa"), "CPI corrigido do Meta deve vir marcado como estimativa");
  assert.ok(!ins.some((i) => i.id === "cpi-meta_ads"), "CPI do Meta já é explicado pela falha de coleta");
  assert.ok(ins.find((i) => i.id === "cpi-tiktok_ads")!.detail.includes("Sem falha de coleta"));
});

test("mesa de análise: roteamento e números vêm do motor", () => {
  assert.equal(route("qual o CAC por canal?"), "cac");
  assert.equal(route("como está a coleta de eventos?"), "tracking");
  assert.equal(route("mova 30% do dv360 para o google"), "verba");
  assert.equal(route("o teste A/B do meta vale?"), "testes");
  assert.equal(route("oi"), "resumo");
  const a = answer(ds, "qual o CPI do tiktok?");
  const tiktok = channelSummary(ds, periods(ds).last28).find((r) => r.channel === "tiktok_ads")!;
  assert.equal(a.table!.rows.length, 1);
  assert.ok(a.table!.rows[0]![1]!.replace(/\s/g, "").includes(tiktok.cpi!.toFixed(2).replace(".", ",")));
  assert.ok(answer(ds, "mova 30% do dv360 para o google").title.includes("30%"));
  for (const q of ["resumo", "funil do google", "testes", "coleta", "cac", "roas", "canais", "cpi", "verba"])
    assert.ok(answer(ds, q).sql.length > 0, `${q}: resposta sem SQL de origem`);
});

import { corrections } from "../src/engine/adjust.ts";
test("correção de atribuição: só onde a reconciliação está quebrada, e nunca piora o CPI", () => {
  const cs = corrections(ds);
  const meta = cs.find((c) => c.channel === "meta_ads" && c.platform === "ios")!;
  assert.ok(meta, "Meta iOS tem defeito de atribuição");
  assert.ok(meta.onset && meta.onset >= "2026-08-20" && meta.onset <= "2026-08-30", `onset ${meta.onset}`);
  assert.ok(meta.lost28 > 50);
  assert.ok(meta.cpi! < meta.cpiRaw!);
  assert.ok(meta.cac! <= meta.cacRaw!);
  assert.equal(meta.roas90Affected, false, "coorte D90 é anterior ao defeito");
  assert.equal(meta.roas90, meta.roas90Raw);
  assert.ok(!cs.some((c) => c.channel === "google_ads" && c.platform === "ios"));
});

import { blended, roasConfidence } from "../src/engine/confidence.ts";
test("confiança do ROAS: intervalo contém o ROAS, veredito coerente, blended ≥ atribuído", () => {
  const rc = roasConfidence(ds);
  for (const r of rc) {
    assert.ok(r.roas !== null && r.lo !== null && r.hi !== null && r.lo <= r.roas && r.roas <= r.hi);
    assert.equal(r.verdict, r.lo >= 1 ? "paga" : r.hi < 1 ? "nao_paga" : "inconclusivo");
    assert.ok(r.projected !== null && r.projected > 0);
  }
  assert.equal(rc.find((r) => r.channel === "linkedin_ads")!.lowSample, true);
  for (const b of blended(ds)) assert.ok(b.blendedRoas! >= b.attributedRoas!);
});

import { googleBrandSplit } from "../src/engine/brand.ts";
import { organicWeekly } from "../src/engine/organic.ts";
import { planTest } from "../src/engine/testplan.ts";
import { bestShift } from "../src/engine/allocation.ts";
test("marca × sem marca soma o Google; orgânico sobe depois do defeito; faixa do simulador contém o ponto; plano de teste", () => {
  const [marca, sem] = googleBrandSplit(ds);
  assert.ok(marca!.spendShare + sem!.spendShare > 0.999 && marca!.spendShare + sem!.spendShare < 1.001);
  assert.ok(marca!.roas90! > sem!.roas90!, "marca tende a ter ROAS maior que o restante");
  const o = organicWeekly(ds);
  assert.ok(o.share[o.share.length - 1]! > o.baseline + 0.02, "orgânico acima da linha de base");
  const s = simulateShift(ds, "dv360", "google_ads", 0.2);
  assert.ok(s.band.installs[0] <= s.installsDelta && s.installsDelta <= s.band.installs[1]);
  const plan = planTest(ds, bestShift(ds, 0.2)!);
  assert.ok(plan.pctMoved <= 0.1 && plan.weeks >= 2);
  assert.ok(plan.preconditions.length > 0, "Google e Meta têm checagens quebradas");
});

"use strict";
// WorldAxis tools/chronicle_view_smoke.js — E5 世界纪事冒烟（零依赖，走 ui-gate-sync 的真实装载面）
const path = require("path");
process.chdir(path.resolve(__dirname, ".."));
const sync = require("../tests/ui-gate-sync.js");
const boot = sync.fresh({});
const WA = boot.WA;
var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log("FAIL: " + name); } }

ok("S1: chronicleView loaded", typeof WA.chronicleView === "object");
ok("S2: 10 exports", ["getSettings", "setSettings", "entries", "entry", "hiddenSummary", "coverage", "sources", "diagnose", "stat", "reset"]
  .every(function (k) { return typeof WA.chronicleView[k] === "function"; }));
ok("S3: default off", WA.chronicleView.getSettings().enabled === false);

// 关闭时整面拒算
var d0 = WA.chronicleView.entries();
ok("S4: disabled reject", d0.ok === false && d0.reason === "disabled");
ok("S4b: disabled entry reject", WA.chronicleView.entry("x").reason === "disabled");

WA.chronicleView.setSettings({ enabled: true });
ok("S5: enabled true", WA.chronicleView.getSettings().enabled === true);

// 空历史：ok:true + 空表（与「读不到」可区分，边界 7）
var d1 = WA.chronicleView.entries();
ok("S6: empty history honest", d1.ok === true && d1.count === 0 && d1.total === 0);
ok("S6b: empty coverage labeled", String(d1.coverage).indexOf("全部 0 条") >= 0);

// ── 播种三源 ──────────────────────────────────────────────
WA.store.transact(function (d) {
  d.chronicle = d.chronicle || [];
  d.chronicle.push({ id: "ch1", kind: "fact", title: "城门换了守将", summary: "北门归了新人", at: 3000, refs: [] });
  d.chronicle.push({ id: "ch2", kind: "event", title: "密约", summary: "不该被玩家看到", at: 2000, visibility: "hidden" });
  d.worldFacts = d.worldFacts || [];
  d.worldFacts.push({ id: "wf1", key: "wf1", value: "粮价上涨", scope: "world", source: "smoke", at: 1000 });
}, "smoke:seed");

// 沉积：地点名必须落在 rec.place（E5 修正过的形状）
WA.sediment.setSettings({ enabled: true });
var s1r = WA.sediment.settle("旧码头", { key: "血战", text: "甲板上的刀痕", trace: "scar", kind: "battle", at: 1500 });
ok("S7: sediment settled", s1r.ok === true);

// 因果：链数组真源是 state().causal.chains
WA.causal.setSettings({ enabled: true });
var c1r = WA.causal.addChain({ cause: "wf1", action: "开仓平粜" });
ok("S8: causal chain added", c1r.ok === true);

var d2 = WA.chronicleView.entries();
ok("S9: chronicle appears", d2.rows.some(function (r) { return r.source === "chronicle" && r.ref === "ch1"; }));
ok("S10: hidden整条不进", !d2.rows.some(function (r) { return r.ref === "ch2"; }));
ok("S11: hidden counted", d2.hiddenCount === 1);
ok("S12: sediment appears with place", d2.rows.some(function (r) { return r.source === "sediment" && String(r.title).indexOf("旧码头") === 0; }));
ok("S13: causal appears", d2.rows.some(function (r) { return r.source === "causal" && String(r.ref).indexOf("cau:") === 0; }));
ok("S14: perSource counted", d2.perSource.chronicle === 1 && d2.perSource.sediment === 1 && d2.perSource.causal === 1);

// 排序：按剧情时间升序
var ats = d2.rows.map(function (r) { return r.at; });
var sorted = ats.slice().sort(function (a, b) { return a - b; });
ok("S15: sorted ascending by at", JSON.stringify(ats) === JSON.stringify(sorted));

// ── 下钻 ──────────────────────────────────────────────────
var e1 = WA.chronicleView.entry("ch1");
ok("S16: drill chronicle ok", e1.ok === true && e1.row.ref === "ch1");
ok("S17: drill sourceRecord verbatim", !!e1.sourceRecord && e1.sourceRecord.title === "城门换了守将");
ok("S18: drill refAudit present", e1.refAudit !== null && e1.refAudit.valid === false && e1.refAudit.reason === "no_sources");

var cauRef = d2.rows.filter(function (r) { return r.source === "causal"; })[0].ref;
var e2 = WA.chronicleView.entry(cauRef);
ok("S19: drill causal ok", e2.ok === true);
ok("S20: drill causal sourceRecord from chains", !!e2.sourceRecord && String(e2.sourceRecord.id).indexOf("cs_") === 0);
ok("S20b: drill causal not absent", e2.sourceRecordAbsent === false);

var sedRef = d2.rows.filter(function (r) { return r.source === "sediment"; })[0].ref;
var e3 = WA.chronicleView.entry(sedRef);
ok("S21: drill sediment honest absent", e3.ok === true && e3.sourceRecordAbsent === true && typeof e3.note === "string");

ok("S22: drill not-found", WA.chronicleView.entry("nope").reason === "not-found");
ok("S23: drill missing-fields", WA.chronicleView.entry("").reason === "missing-fields");

// ── 隐藏与覆盖 ────────────────────────────────────────────
var hs = WA.chronicleView.hiddenSummary();
ok("S24: hiddenSummary count", hs.ok === true && hs.count === 1);
ok("S25: hiddenSummary reason", String(hs.rows[0].why).indexOf("visibility=hidden") >= 0);
var cov = WA.chronicleView.coverage();
ok("S26: coverage visible/hidden", cov.ok === true && cov.visible === 1 && cov.hidden === 1);

// ── 截断标注 ──────────────────────────────────────────────
var d3 = WA.chronicleView.entries({ limit: 1 });
ok("S27: capped flagged", d3.capped === true && d3.total === 3 && d3.count === 1);
ok("S28: capped coverage labeled", String(d3.coverage).indexOf("滚出视图") >= 0);

// ── 只读不变式：连读三次，存档字节级不变 ─────────────────
var b1 = JSON.stringify(WA.store.get());
WA.chronicleView.entries(); WA.chronicleView.entry("ch1");
WA.chronicleView.hiddenSummary(); WA.chronicleView.coverage();
WA.chronicleView.sources(); WA.chronicleView.stat();
var b2 = JSON.stringify(WA.store.get());
ok("S29: read-only (store unchanged)", b1 === b2);

// ── 源可用性 ──────────────────────────────────────────────
var srcs = WA.chronicleView.sources();
ok("S30: sources list 5", Array.isArray(srcs) && srcs.length === 5);
ok("S31: sources chronicle available", srcs.filter(function (s) { return s.name === "chronicle"; })[0].available === true);

// ── 诊断 / 计数 ───────────────────────────────────────────
var dg = WA.chronicleView.diagnose();
ok("S32: diagnose closedLoop", dg.closedLoop === true);
ok("S33: diagnose checks store", dg.checks.store === true);
var st = WA.chronicleView.stat();
ok("S34: stat reads counted", typeof st.reads === "number" && st.reads >= 1);
ok("S35: stat drills counted", st.drills >= 3);
ok("S36: stat refused counted", st.refused >= 3);
WA.chronicleView.reset();
ok("S37: reset clears", WA.chronicleView.stat().reads === 0 && WA.chronicleView.stat().drills === 0);

console.log(String.fromCharCode(10, 69, 53, 32, 99, 104, 114, 111, 110, 105, 99, 108, 101, 45, 118, 105, 101, 119, 32, 115, 109, 111, 107, 101, 58, 32) + pass + " / " + fail);
process.exit(fail > 0 ? 1 : 0);

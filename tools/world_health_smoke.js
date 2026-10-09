"use strict";
// WorldAxis tools/world_health_smoke.js — O5 世界健康中心冒烟
//   零依赖，走 tests/ui-gate-sync.js 的真实装载面（与 agenda_smoke 同一口径）。
//
//   本冒烟**刻意验**的两件「诚实边界」：
//     ① `empty`（没数据）与 `allClear`（有数据但无事）必须**可分** —— 把两者压成一个绿点，
//        正是「点了没反应」的另一种写法（计划原文边界 5）。
//     ② 关掉的模块其待办**不出现**，但要如实进 `skipped`（边界 6，不静默当作「没有待办」）。
const path = require("path");
process.chdir(path.resolve(__dirname, ".."));
const sync = require("../tests/ui-gate-sync.js");
const boot = sync.fresh({});
const WA = boot.WA;
var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log("FAIL: " + name); } }

ok("S1: worldHealth loaded", typeof WA.worldHealth === "object");
ok("S2: 8 exports", ["getSettings", "setSettings", "summary", "drill", "sources", "diagnose", "stat", "reset"]
  .every(function (k) { return typeof WA.worldHealth[k] === "function"; }));
ok("S3: default off", WA.worldHealth.getSettings().enabled === false);

// 关闭时拒算
ok("S4a: disabled reject summary", WA.worldHealth.summary().ok === false && WA.worldHealth.summary().reason === "disabled");
ok("S4b: disabled reject drill", WA.worldHealth.drill("todo", "commission").ok === false);

WA.worldHealth.setSettings({ enabled: true });
ok("S5: enabled true", WA.worldHealth.getSettings().enabled === true);

// ── 三栏摘要 ──────────────────────────────────────────────
var sm = WA.worldHealth.summary();
ok("S6: summary ok", sm.ok === true);
ok("S7: three bars", sm.bars && sm.bars.todo && sm.bars.blocked && sm.bars.water);
ok("S8: barsAsked default 3", sm.barsAsked.join(",") === "todo,blocked,water");
ok("S9: headline is one sentence", typeof sm.headline === "string" && sm.headline.length > 0);
ok("S10: note forbids acting", sm.note.indexOf("不做任何确认") >= 0);

// ── 待办栏 ────────────────────────────────────────────────
var tb = sm.bars.todo;
ok("S11: todo bar shape", typeof tb.total === "number" && Array.isArray(tb.rows));
ok("S12: todo scans 6 sources", Object.keys(tb.perSource).length + tb.skipped.length === 6);
// 边界 5：六个源全关 ⇒ empty 真、allClear 假（不能报成「一切正常」）
ok("S13: empty vs allClear distinct (all off)", tb.total === 0 && tb.empty === true && tb.allClear === false);
ok("S14: skipped names the reason", tb.skipped.length >= 1 && tb.skipped.every(function (s) { return typeof s.key === "string" && typeof s.why === "string"; }));
ok("S15: disabled reasons present", tb.skipped.some(function (s) { return s.why === "disabled"; }));
ok("S16: note scopes the bar", tb.note.indexOf("玩家能处置") >= 0);

// 开一个源并造真待办
WA.commission.setSettings({ enabled: true });
WA.commission.create({ title: "护送商队", principal: "商会", agent: "护卫",
  stages: [{ label: "接洽", deadline: 0 }, { label: "启程", deadline: 0 }] });
var sm2 = WA.worldHealth.summary();
var tb2 = sm2.bars.todo;
ok("S17: todo picks up real item", tb2.total >= 1 && tb2.perSource.commission >= 1);
ok("S18: todo row shape", tb2.rows.every(function (r) { return r.kind === "todo" && typeof r.source === "string" && typeof r.route === "string"; }));
ok("S19: allClear false when todo exists", tb2.allClear === false && tb2.empty === false);
ok("S20: headline reports todo first", sm2.headline.indexOf("待办") >= 0);
ok("S21: skipped no longer lists commission", !tb2.skipped.some(function (s) { return s.key === "commission"; }));

// 截断标注：上限压到 2 并造 3 条
WA.worldHealth.setSettings({ maxRows: 2 });
WA.commission.create({ title: "b", principal: "p", agent: "a", stages: [{ label: "s", deadline: 0 }] });
WA.commission.create({ title: "c", principal: "p", agent: "a", stages: [{ label: "s", deadline: 0 }] });
var tb3 = WA.worldHealth.summary().bars.todo;
ok("S22: capped flagged with coverage", tb3.total >= 3 && tb3.capped === true && tb3.count === 2
  && tb3.coverage.indexOf("其余待办仍在世界状态里") >= 0);
WA.worldHealth.setSettings({ maxRows: 6 });

// ── 阻塞栏 ────────────────────────────────────────────────
var bb = WA.worldHealth.summary().bars.blocked;
ok("S23: blocked bar shape", typeof bb.total === "number" && typeof bb.scanned === "number");
ok("S24: blocked scans registry modules", bb.scanned > 50);
ok("S25: blocked rows carry codes+counter", bb.rows.every(function (r) {
  return r.kind === "blocked" && typeof r.module === "string" && Array.isArray(r.codes) && typeof r.total === "number"; }));
// 造一次真拒收：委托传空标题（各模块自己判，不由本模块判）
WA.commission.create({ title: "", principal: "", agent: "", stages: [] });
var bb2 = WA.worldHealth.summary().bars.blocked;
var cRow = bb2.rows.filter(function (r) { return r.module === "commission"; })[0];
ok("S26: real rejection shows up in blocked", !!cRow && cRow.codes.length >= 1);
ok("S27: code carries player hint when known", typeof cRow.codes[0].code === "string");
ok("S28: hint may be empty but shape stable", cRow.codes.every(function (c) { return typeof c.hint === "string"; }));
ok("S29: blocked note keeps maintainer stuff out", bb2.note.indexOf("不搬到这里") >= 0);

// ── 水位栏 ────────────────────────────────────────────────
var wb = WA.worldHealth.summary().bars.water;
ok("S30: water bar shape", typeof wb.scanned === "number" && Array.isArray(wb.rows));
ok("S31: water scans containers", wb.scanned > 100);
ok("S32: wildcard not expanded", wb.wildcardSkipped > 0 && wb.rows.every(function (r) { return r.path.indexOf("*") < 0; }));
ok("S33: water rows carry level", wb.rows.every(function (r) { return r.level === "full" || r.level === "near"; }));
// 造满容器（chronicle cap=200）
WA.store.transact(function (d) {
  d.chronicle = [];
  for (var i = 0; i < 200; i++) d.chronicle.push({ at: i, what: "x" + i, kind: "k" });
}, "smoke:fill");
var wb2 = WA.worldHealth.summary().bars.water;
ok("S34: full detected in water bar", wb2.fullCount >= 1);
ok("S35: full row present with cap", wb2.rows.some(function (r) { return r.path === "chronicle" && r.level === "full" && r.cap === 200; }));
ok("S36: allClear false when full", wb2.allClear === false);
ok("S37: headline can report full", WA.worldHealth.summary().headline.length > 0);

// ── 下钻 ──────────────────────────────────────────────────
var d1 = WA.worldHealth.drill("todo", "commission");
ok("S38: drill todo ok", d1.ok === true && d1.route === "commission");
ok("S39: drill todo says where", d1.howTo.indexOf("只指路") >= 0);

var d2 = WA.worldHealth.drill("blocked", "commission");
ok("S40: drill blocked ok", d2.ok === true && d2.module === "commission");
ok("S41: drill blocked finds setting keys via registry", Array.isArray(d2.settingKeys) && d2.settingKeys.length >= 1
  && d2.settingKeys.indexOf("worldaxis_commission_settings_v1") >= 0);
ok("S42: drill blocked splits hint known/unknown", typeof d2.hintKnown === "number" && typeof d2.hintUnknown === "number"
  && d2.hintKnown + d2.hintUnknown === d2.codes.filter(function (c) { return c.count > 0; }).length);

var d3 = WA.worldHealth.drill("water", "chronicle");
ok("S43: drill water ok", d3.ok === true && d3.path === "chronicle" && d3.cap === 200 && d3.len === 200);
ok("S44: drill water reports level", d3.level === "full");
ok("S45: drill water names cap source", d3.capSource.indexOf("唯一真源") >= 0);

ok("S46: drill unknown kind rejected", WA.worldHealth.drill("nope", "x").ok === false);
ok("S47: drill missing fields rejected", WA.worldHealth.drill("", "").ok === false && WA.worldHealth.drill("", "").reason === "missing-fields");
ok("S48: drill unknown id rejected", WA.worldHealth.drill("todo", "no_such_source").ok === false);
ok("S49: drill unknown module rejected", WA.worldHealth.drill("blocked", "no_such_module").ok === false);
ok("S50: drill unknown container rejected", WA.worldHealth.drill("water", "no.such.path").ok === false);

// ── 只读不变式（本模块核心承诺：不替模块动手）─────────────
var s1 = JSON.stringify(WA.store.get());
WA.worldHealth.summary();
WA.worldHealth.drill("todo", "commission");
WA.worldHealth.drill("blocked", "commission");
WA.worldHealth.drill("water", "chronicle");
WA.worldHealth.sources();
var s2 = JSON.stringify(WA.store.get());
ok("S51: read-only (store unchanged)", s1 === s2);

// ── 源可用性 / 诊断 / 计数 ────────────────────────────────
var srcs = WA.worldHealth.sources();
ok("S52: sources 4+6", srcs.length === 10);
ok("S53: sources carry availability", srcs.every(function (s) { return typeof s.name === "string" && typeof s.available === "boolean"; }));
ok("S54: store available", srcs.filter(function (s) { return s.name === "store"; })[0].available === true);
ok("S55: settingsBus available", srcs.filter(function (s) { return s.name === "settingsBus"; })[0].available === true);

var dg = WA.worldHealth.diagnose();
ok("S56: diagnose closedLoop", dg.closedLoop === true && dg.ok === true);
ok("S57: diagnose checks all true", Object.keys(dg.checks).every(function (k) { return dg.checks[k] === true; }));
ok("S58: diagnose bars 3 / todoSources 6", dg.bars.length === 3 && dg.todoSources === 6);

var st = WA.worldHealth.stat();
ok("S59: stat reads counted", st.reads >= 1);
ok("S60: stat drills counted", st.drills >= 3);
ok("S61: stat byKind tracks bars", typeof st.byKind.todo === "number" && typeof st.byKind.water === "number");
ok("S62: stat faults counted", typeof st.faults.disabled === "number" && st.faults.disabled >= 2);

WA.worldHealth.reset();
ok("S63: reset clears reads+drills", WA.worldHealth.stat().reads === 0 && WA.worldHealth.stat().drills === 0);
ok("S64: reset clears faults", Object.keys(WA.worldHealth.stat().faults).length === 0);

// 关闭后再拒算一次（开关是活的）
WA.worldHealth.setSettings({ enabled: false });
ok("S65: disabled again rejects", WA.worldHealth.summary().ok === false && WA.worldHealth.drill("todo", "commission").ok === false);

console.log(String.fromCharCode(10, 79, 53, 32, 119, 111, 114, 108, 100, 45, 104, 101, 97, 108, 116, 104, 32, 115, 109, 111, 107, 101, 58, 32) + pass + " / " + fail);
process.exit(fail > 0 ? 1 : 0);
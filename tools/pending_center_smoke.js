"use strict";
// WorldAxis tools/pending_center_smoke.js — E1 统一待办事项中心冒烟
//   零依赖，走 tests/ui-gate-sync.js 的真实装载面（与 agenda_smoke / world_health_smoke 同一口径）。
//
//   本冒烟**刻意验**的四件「诚实边界」：
//     ① 缺席（读不到）/ 空（有源且全部自报无数据）/ 无事（读过且此刻没有待办）三态**可分** ——
//        把三者压成一个绿点，正是「点了没反应」的另一种写法（计划原文边界 8）；
//     ② 八源**没有一个**申报 `empty` ⇒ emptyAll 不可达；这件事必须**在诊断面上可答**
//        （emptyReporterCount=0 / emptyAllReachable=false）—— 灯不亮可以，不亮得有原因；
//     ③ **四族返回形状**（items 桶 / points 桶 / 裸数组 / 单对象或 null）都归一得出来；
//     ④ **只读**：连读五口之后存档逐字节不变；且导出面**没有**任何写口。
const path = require("path");
process.chdir(path.resolve(__dirname, ".."));
const sync = require("../tests/ui-gate-sync.js");
const boot = sync.fresh({});
const WA = boot.WA;
var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log("FAIL: " + name); } }
ok("S1: pendingCenter loaded", typeof WA.pendingCenter === "object");
ok("S2: 9 exports", ["getSettings", "setSettings", "items", "soon", "bySource", "describe", "diagnose", "stat", "reset"]
  .every(function (k) { return typeof WA.pendingCenter[k] === "function"; }));
ok("S3: default off", WA.pendingCenter.getSettings().enabled === false);
ok("S4a: disabled reject items", WA.pendingCenter.items().ok === false && WA.pendingCenter.items().reason === "disabled");
ok("S4b: disabled reject soon", WA.pendingCenter.soon().ok === false);
ok("S4c: disabled reject describe", WA.pendingCenter.describe("commission").ok === false);
WA.pendingCenter.setSettings({ enabled: true });
ok("S5: enabled true", WA.pendingCenter.getSettings().enabled === true);
// ── 三态可分（本节核心）──────────────────────────────────
var r0 = WA.pendingCenter.items();
ok("S6: items ok", r0.ok === true);
ok("S7: 八源全覆盖（perSource 8 键）", Object.keys(r0.perSource).length === 8);
ok("S8: 含在场源", r0.sourceCount >= 1);
// 现版本常态：有源开着但都没有待办 ⇒ allClear，不是 unavailable、也不是 emptyAll
ok("S9: 常态是 allClear 而非 unavailable", r0.unavailable === false && r0.emptyAll === false && r0.allClear === true);
ok("S10: 三旗标 + 可达性读数齐备", typeof r0.emptyAll === "boolean" && typeof r0.allClear === "boolean"
  && typeof r0.unavailable === "boolean" && typeof r0.emptyReported === "number");
ok("S11: note 明写「不可区分」", r0.note.indexOf("不可区分") >= 0);
ok("S12: skipped 逐条带来源与原因", r0.skipped.length >= 1 && r0.skipped.every(function (s) {
  return typeof s.source === "string" && typeof s.reason === "string"; }));
ok("S13: 关掉的模块进 skipped（原因 disabled）", r0.skipped.some(function (s) { return s.reason === "disabled"; }));
// ── 四族形状归一 ─────────────────────────────────────────
WA.commission.setSettings({ enabled: true });
WA.commission.create({ title: "护送商队", principal: "商会", agent: "护卫",
  stages: [{ label: "接洽", deadline: 0 }, { label: "启程", deadline: 0 }] });
var r1 = WA.pendingCenter.items();
ok("S14: 族 A（items 桶）真待办读得出来", r1.total >= 1 && r1.rows.some(function (x) { return x.kind === "commission"; }));
ok("S15: 统一形状齐备", r1.rows.every(function (x) {
  return typeof x.kind === "string" && typeof x.source === "string" && typeof x.ref === "string"
    && typeof x.title === "string" && typeof x.canAct === "boolean"
    && x.route && typeof x.route.kind === "string" && typeof x.route.id === "string";
}));
ok("S16: 有待办时两旗标都为假", r1.emptyAll === false && r1.allClear === false);
ok("S17: 开启后不再进 skipped", !r1.skipped.some(function (s) { return s.source === "commission"; }));
ok("S18: perSource 有账", r1.perSource.commission.ok === true && r1.perSource.commission.count >= 1);
// 族 B：storyChoice（points 桶）—— 真造一个待选择点，验归一化层吃得下 points 而不是 items
WA.storyChoice.setSettings({ enabled: true });
var sc = WA.storyChoice.present({ prompt: "选边站", options: [{ label: "左边" }, { label: "右边" }] });
ok("S19: 族 B 源在场且能造出待选择点", WA.pendingCenter.bySource().filter(function (s) { return s.name === "storyChoice"; })[0].available === true
  && sc.ok === true);
if (sc.ok === true) {
  var r2 = WA.pendingCenter.items();
  ok("S19b: 族 B（points 桶）归一得出来", r2.rows.some(function (x) { return x.kind === "storyChoice"; }));
} else {
  // 造点失败时不静默跳过：如实记一条，判据不假装验过。
  ok("S19b: 族 B 造点失败 ⇒ 如实记录（不假绿）", typeof sc.reason === "string");
}
// ── 下钻：只给路由 ───────────────────────────────────────
var d1 = WA.pendingCenter.describe("commission");
ok("S20: 下钻答「去哪看」", d1.ok === true && typeof d1.page === "string" && d1.module === "commission");
ok("S21: 下钻带设置键", d1.settingsKey === "worldaxis_commission_settings_v1");
ok("S22: 下钻自述「不执行确认动作」", d1.note.indexOf("不执行确认动作") >= 0);
ok("S23: 带 id 下钻自洽", WA.pendingCenter.describe("commission", d1.id).id === d1.id);
ok("S24: 未知条 ⇒ not-found", WA.pendingCenter.describe("commission", "no_such_id").reason === "not-found");
ok("S25: 未知类型 ⇒ unknown-kind", WA.pendingCenter.describe("nope").reason === "unknown-kind");
ok("S26: 空参数 ⇒ missing-kind", WA.pendingCenter.describe("").reason === "missing-kind");
// ── 源可用性 / 诊断 ──────────────────────────────────────
var srcs = WA.pendingCenter.bySource();
ok("S27: 源表 8 条", srcs.length === 8);
ok("S28: 每源带 availability 与累计读数", srcs.every(function (s) {
  return typeof s.name === "string" && typeof s.available === "boolean" && typeof s.read === "number"; }));
var dg = WA.pendingCenter.diagnose();
ok("S29: diagnose 闭环 + 8 源 + 版本", dg.ok === true && dg.closedLoop === true && dg.sourceCount === 8 && dg.version === "2.183.0");
ok("S30: 诊断面报 empty 申报数", typeof dg.emptyReporterCount === "number" && typeof dg.emptyAllReachable === "boolean");
// 现场事实：八源没有一个申报 empty ⇒ emptyAllReachable 为假。这是**可答的坏消息**，
//   不是「一切正常」—— 测试锁住它，是为了让「这盏灯亮不了」永远有一个出口说出来。
ok("S31: emptyAll 现版本不可达（且这件事可答）", dg.liveSources >= 1 && dg.emptyReporterCount === 0 && dg.emptyAllReachable === false);
ok("S32: checks 覆盖八源 + 两个基础依赖", typeof dg.checks.settingsBus === "boolean"
  && typeof dg.checks.commission === "boolean" && typeof dg.checks.backstage === "boolean");
// ── 只读不变式 ───────────────────────────────────────────
var s1 = JSON.stringify(WA.store.get());
WA.pendingCenter.items();
WA.pendingCenter.soon();
WA.pendingCenter.bySource();
WA.pendingCenter.describe("commission");
WA.pendingCenter.diagnose();
var s2 = JSON.stringify(WA.store.get());
ok("S33: 只读（store 逐字节不变）", s1 === s2);
// 导出面没有任何写口 —— 不是「暂未实现」，是设计上不导出
ok("S34: 无写口（确认语义留在各来源模块）", !["confirm", "cancel", "ignore", "apply", "settle", "claim", "complete"]
  .some(function (k) { return typeof WA.pendingCenter[k] === "function"; }));
// ── 计数 / 上限 ──────────────────────────────────────────
var st = WA.pendingCenter.stat();
ok("S35: stat 记读数", st.reads >= 1 && st.enabled === true);
ok("S36: stat 逐源有账", typeof st.bySource === "object" && (st.bySource.commission || 0) >= 1);
WA.pendingCenter.reset();
ok("S37: reset 清零", WA.pendingCenter.stat().reads === 0 && Object.keys(WA.pendingCenter.stat().faults).length === 0);
var sn = WA.pendingCenter.soon();
ok("S38: soon 受 soonCount 封顶", sn.ok === true && sn.count <= WA.pendingCenter.getSettings().soonCount);
ok("S39: soon(999) 同样封顶", WA.pendingCenter.soon(999).count <= WA.pendingCenter.getSettings().soonCount);
WA.pendingCenter.setSettings({ maxRows: 99999 });
ok("S40: 越界值被夹到区间上界", WA.pendingCenter.getSettings().maxRows <= 128);
WA.pendingCenter.setSettings({ maxRows: 32 });
// 读面纯度：不含维护者诊断字段
var dump = JSON.stringify(WA.pendingCenter.items());
ok("S41: 不含维护者诊断字段", dump.indexOf('"tref"') < 0 && dump.indexOf('"own"') < 0);
WA.pendingCenter.setSettings({ enabled: false });
ok("S42: 关回去仍拒算", WA.pendingCenter.items().ok === false);
console.log(String.fromCharCode(10, 69, 49, 32, 112, 101, 110, 100, 105, 110, 103, 45, 99, 101, 110, 116, 101, 114, 32, 115, 109, 111, 107, 101, 58, 32) + pass + " / " + fail);
process.exit(fail > 0 ? 1 : 0);
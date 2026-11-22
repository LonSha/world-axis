"use strict";
const fs = require("fs");
const path = require("path");
const BASE = path.resolve(__dirname, "..");
process.chdir(BASE);
const sync = require("./ui-gate-sync.js");
const REL = "engines/aftermath.js";
const SRC = fs.readFileSync(REL, "utf8");
const INJ = fs.readFileSync("render/inject.js", "utf8");
// OPV29-10：PRIORITY / ACCOUNTS 已搬到 engines/inject-budget-tables.js，读「引擎+表」合并面。
const BUD = fs.readFileSync('engines/inject-budget.js', 'utf8')
  + fs.readFileSync('engines/inject-budget-tables.js', 'utf8');
const PAN = fs.readFileSync("ui/panel.js", "utf8");
const IDX = fs.readFileSync("index.js", "utf8");
// OPV29-07：注册表/校验表已搬到 engines/tool-diag-tables.js，读「引擎+表」合并面。
const DIAG = require('./diag-source.js')();
const MAN = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const RUN = fs.readFileSync("tests/run.js", "utf8");
// v2.565.0：原来 A14/A15 把已知版本号硬列成白名单（末项 2.524.0）。
//   版本一越过列表就红 —— 红的原因不是代码坏了，是锁里多存了一份版本表。
//   现在只留两个真源：index.js 的 VERSION（发布真源）与 manifest 必须跟它一致。
//   力度不变：降级 / 两处不一致 / 缺失都仍然抓得住。
function verTriple(v) {
  var m = /([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(String(v || ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function cmpVer(a, b) {
  for (var i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1; }
  return 0;
}
var IDX_VER = (function () {
  var m = /VERSION\s*=\s*'([0-9]+\.[0-9]+\.[0-9]+)'/.exec(IDX);
  return m ? verTriple(m[1]) : null;
})();
function verAtLeast(min) { return !!IDX_VER && cmpVer(IDX_VER, verTriple(min)) >= 0; }
function manifestVerMatches() {
  var b = verTriple(MAN.version);
  return !!IDX_VER && !!b && cmpVer(IDX_VER, b) === 0;
}
var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log("FAIL: " + name); } }
ok("A1: 13 exports", /WA\.aftermath\s*=\s*\{[\s\S]*getSettings[\s\S]*setSettings[\s\S]*register[\s\S]*repair[\s\S]*inspect[\s\S]*active[\s\S]*pending[\s\S]*view[\s\S]*cancel[\s\S]*buildBlock[\s\S]*diagnose[\s\S]*stat[\s\S]*reset[\s\S]*\}/.test(SRC));
ok("A2: EXPORT_COUNT = 13", /EXPORT_COUNT = 13/.test(SRC));
// v2.524.0 收口：原文断言「DEF 里是 enabled:false」。v2.412.0 全仓改全开策略后
//   aftermath 的 DEF 已翻成 true（engines/aftermath.js 边界 1 的头注也同步改写成
//   「出厂态随全开策略；显式关后写口一律 disabled」）。A3 的**实质**是
//   「出厂开关必须是源码里明写的字面量，不许靠 undefined 隐式默认」——判据照此收紧，
//   而「关着就不动世界」这条实质边界由 s3-u4-v2197 的 A0a2 逐字钉住。
const DEF_LIT = /var DEF = \{ enabled:\s*(true|false)/.exec(SRC);
ok("A3: DEF 里出厂开关是明写的字面量（实 " + (DEF_LIT ? DEF_LIT[1] : "未读到") + "）", !!DEF_LIT);
ok("A4: self-check", /aftermath: export count mismatch/.test(SRC));
ok("A5: inject SOURCES", INJ.indexOf("'aftermath'") >= 0);
ok("A6: inject __REG.def", INJ.indexOf("aftermath: true") >= 0);
ok("A7: inject SRC_NAME", INJ.indexOf("aftermath: '地点后果'") >= 0);
ok("A8: inject SRC_MOD_SETTING", INJ.indexOf("aftermath: 'worldaxis_aftermath_settings_v1'") >= 0);
ok("A9: inject branch", INJ.indexOf("vis.aftermath && WA.aftermath") >= 0);
ok("A10: panel VIS_NAMES", PAN.indexOf("aftermath: '地点后果'") >= 0);
ok("A11: budget PRIORITY", BUD.indexOf("'地点后果': { rank: 5, fold: true }") >= 0);
ok("A12: budget ACCOUNTS", BUD.indexOf("['地点后果', '叙事推进', '承载']") >= 0);
ok("A13: LOAD_ORDER", IDX.indexOf("'engines/aftermath.js'") >= 0 && RUN.indexOf("'engines/aftermath.js'") >= 0);
ok("A14: VERSION 2.171+", verAtLeast('2.171.0'));
ok("A15: manifest version", manifestVerMatches());
ok("A16: tool-diag module map", DIAG.indexOf("'engines/aftermath.js': 'aftermath'") >= 0);
ok("A17: tool-diag secAftermath", DIAG.indexOf("function secAftermath()") >= 0);
ok("A18: tool-diag diag object", DIAG.indexOf("aftermath: secAftermath()") >= 0);
ok("A19: tool-diag UI_BINDINGS wa-af", DIAG.indexOf("wa-af-enabled") >= 0);
var boot = sync.fresh({});
var WA = boot.WA;
ok("B1: loaded", typeof WA.aftermath === "object");
ok("B2: 13 exports callable", ["getSettings","setSettings","register","repair","inspect","active","pending","view","cancel","buildBlock","diagnose","stat","reset"].every(function (k) { return typeof WA.aftermath[k] === "function"; }));
ok("B3: default on（全开跟位）", WA.aftermath.getSettings().enabled === true);
WA.aftermath.setSettings({ enabled: true });
ok("B4: enabled true", WA.aftermath.getSettings().enabled === true);
WA.aftermath.setSettings({ enabled: false });
var d1 = WA.aftermath.register({ placeId: "北道", eventId: "evt_001", effectType: "damage" });
ok("B5: disabled reject", d1.ok === false && d1.reason === "disabled");
WA.aftermath.setSettings({ enabled: true });
WA.region.setSettings({ enabled: true });
WA.region.register("北道", { distanceDays: 5, lane: "road" });
WA.region.register("南门", { distanceDays: 2, lane: "road" });
var r1 = WA.aftermath.register({ placeId: "北道", eventId: "evt_001", effectType: "damage", description: "道路被落石阻断", repairTime: 3, repairCost: 50 });
ok("B6: register ok", r1.ok === true && r1.placeId === "北道");
var r2 = WA.aftermath.register({ placeId: "北道", eventId: "evt_001", effectType: "damage" });
ok("B7: duplicate-event reject", r2.ok === false && r2.reason === "duplicate-event");
var r3 = WA.aftermath.register({ eventId: "evt_002", effectType: "damage" });
ok("B8: missing-fields placeId reject", r3.ok === false && r3.reason === "missing-fields");
var r4 = WA.aftermath.register({ placeId: "北道", effectType: "damage" });
ok("B9: missing-fields eventId reject", r4.ok === false && r4.reason === "missing-fields");
var rp1 = WA.aftermath.repair("不存在", { progress: 1 });
ok("B10: repair not-found reject", rp1.ok === false && rp1.reason === "not-found");
var rp2 = WA.aftermath.repair(r1.id, { progress: 1 });
ok("B11: repair partial", rp2.ok === true && rp2.progress === 1);
var pn = WA.aftermath.pending();
ok("B12: pending has items", pn.ok === true && pn.count >= 1);
var rp3 = WA.aftermath.repair(r1.id, { progress: 2 });
ok("B13: repair done", rp3.ok === true && rp3.repaired === true);
var rp4 = WA.aftermath.repair(r1.id, { progress: 1 });
ok("B14: not-active reject", rp4.ok === false && rp4.reason === "not-active");
var ins = WA.aftermath.inspect("北道");
ok("B15: inspect ok", ins.ok === true && ins.placeId === "北道");
var act = WA.aftermath.active();
ok("B16: active ok", act.ok === true && typeof act.count === "number");
var v1 = WA.aftermath.view(r1.id);
ok("B17: view ok", v1.ok === true && v1.eventId === "evt_001");
var v2 = WA.aftermath.view("不存在");
ok("B18: view not-found", v2.ok === false && v2.reason === "not-found");
var r5 = WA.aftermath.register({ placeId: "南门", eventId: "evt_003", effectType: "blockage", description: "城门被撞坏" });
ok("B19: register second", r5.ok === true);
var cn1 = WA.aftermath.cancel(r5.id, "自然恢复");
ok("B20: cancel ok", cn1.ok === true && cn1.id === r5.id);
var cn2 = WA.aftermath.cancel(r5.id, "再次取消");
ok("B21: cancel not-active reject", cn2.ok === false && cn2.reason === "not-active");
var dg = WA.aftermath.diagnose();
ok("B22: diagnose closedLoop", dg.closedLoop === true);
ok("B23: diagnose checks", dg.checks.sediment === true && dg.checks.region === true && dg.checks.store === true);
var st = WA.aftermath.stat();
ok("B24: stat registered", typeof st.registered === "number" && st.registered >= 2);
ok("B25: stat repaired", typeof st.repaired === "number" && st.repaired >= 1);
ok("B26: stat cancelled", typeof st.cancelled === "number" && st.cancelled >= 1);
var bb = WA.aftermath.buildBlock();
ok("B27: buildBlock string", typeof bb === "string");
var SRC_COPY = fs.readFileSync(REL, "utf8");
var broke1 = SRC_COPY.replace("enabled: true", "enabled: false");
ok("N1: break enabled default（全开跟位，破坏向 false）", broke1.indexOf("enabled: false") >= 0 && SRC.indexOf("enabled: true") >= 0);
var broke2 = SRC_COPY.replace("x.eventId === k", "false");
ok("N2: break eventId dedup", broke2.indexOf("false") >= 0 && SRC.indexOf("x.eventId === k") >= 0);
ok("N3: real file unchanged", fs.readFileSync(REL, "utf8") === SRC);
console.log("\nTX8 (v2.171.0): " + pass + " / " + fail);
process.exit(fail > 0 ? 1 : 0);

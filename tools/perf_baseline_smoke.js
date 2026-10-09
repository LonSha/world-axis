"use strict";
// WorldAxis tools/perf_baseline_smoke.js — O3 性能基线（可无头部分）冒烟
//   零依赖，走 tests/ui-gate-sync.js 的真实装载面（与 agenda_smoke 同一口径）。
//
//   本冒烟**刻意不做**的事：不验任何「实机读数」。gap() 在无头环境里必须为空
//   （reason==='needs-real-device'），那条空是**正确结果**而不是待办漏做——
//   故 S20 断言的是「它为空且给得理由」，而不是「它有数」。
//   同理：不验百分比收益（计划原文即禁），readings() 只报现场值/预算值/档位。
const path = require("path");
process.chdir(path.resolve(__dirname, ".."));
const sync = require("../tests/ui-gate-sync.js");
const boot = sync.fresh({});
const WA = boot.WA;
var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log("FAIL: " + name); } }

ok("S1: perfBaseline loaded", typeof WA.perfBaseline === "object");
ok("S2: 10 exports", ["getSettings", "setSettings", "bands", "budget", "readings", "gap",
  "sources", "diagnose", "stat", "reset"]
  .every(function (k) { return typeof WA.perfBaseline[k] === "function"; }));
ok("S3: default off", WA.perfBaseline.getSettings().enabled === false);

// 关闭时逐面拒算（四个读面都要拒）
ok("S4a: disabled reject bands", WA.perfBaseline.bands().ok === false && WA.perfBaseline.bands().reason === "disabled");
ok("S4b: disabled reject budget", WA.perfBaseline.budget().ok === false);
ok("S4c: disabled reject readings", WA.perfBaseline.readings().ok === false);
ok("S4d: disabled reject gap", WA.perfBaseline.gap().ok === false);

WA.perfBaseline.setSettings({ enabled: true });
ok("S5: enabled true", WA.perfBaseline.getSettings().enabled === true);

// ── 三档定义与当前档位 ────────────────────────────────────
var bd = WA.perfBaseline.bands();
ok("S6: bands ok", bd.ok === true);
ok("S7: three bands", Array.isArray(bd.rows) && bd.rows.length === 3);
ok("S8: band ids small/typical/edge", bd.rows.map(function (r) { return r.id; }).join(",") === "small,typical,edge");
ok("S9: each band carries class+judge", bd.rows.every(function (r) { return typeof r.class === "string" && typeof r.judge === "string" && r.judge.length > 0; }));
ok("S10: exactly one current", bd.rows.filter(function (r) { return r.current; }).length === 1);
ok("S11: current matches", bd.rows.filter(function (r) { return r.current; })[0].id === bd.current);
ok("S12: currentDetail carries byte source", bd.currentDetail !== null && typeof bd.currentDetail.bytesSource === "string");
// 档位必须由现场读数判定：空存档（很小）不应落在 edge
ok("S13: fresh store not edge", bd.current === "small" || bd.current === "typical");
ok("S14: note forbids defaulting", bd.note.indexOf("不默认成小局") >= 0);

// ── 冻结预算表 ────────────────────────────────────────────
var bu = WA.perfBaseline.budget();
ok("S15: budget ok", bu.ok === true);
ok("S16: budget rows 3 (one per band)", Array.isArray(bu.rows) && bu.rows.length === 3);
ok("S17: budgets match CLASS_DEF", bu.rows.filter(function (r) { return r.class === "short"; })[0].budgetMs === 800
  && bu.rows.filter(function (r) { return r.class === "medium"; })[0].budgetMs === 2000
  && bu.rows.filter(function (r) { return r.class === "long"; })[0].budgetMs === 4000);
ok("S18: frozen available", bu.frozenAvailable === true && typeof bu.frozenAt === "number" && bu.frozenAt > 0);
ok("S19: frozen equals live at load (no drift yet)", bu.driftCount === 0 && bu.drift.length === 0);
ok("S20: note says comparable", bu.note.indexOf("可直接比较") >= 0);
ok("S21: declared table present (4 faces)", Array.isArray(bu.declared) && bu.declared.length === 4);
ok("S22: declared carries basis separately", bu.declared.every(function (d) { return typeof d.p95Ms === "number" && typeof d.source === "string"; }));
// 冻结的是**快照**不是活引用：动活值不改冻结副本
var liveBefore = JSON.stringify(bu.rows.map(function (r) { return r.frozenBudgetMs; }));
var liveDef = WA.perfTrace.CLASS_DEF.long.budget;
WA.perfTrace.CLASS_DEF.long.budget = 9999;
var bu2 = WA.perfBaseline.budget();
ok("S23: drift detected on live change", bu2.driftCount === 1 && bu2.drift[0].cls === "long" && bu2.drift[0].to === 9999);
ok("S24: frozen copy unchanged", JSON.stringify(bu2.rows.map(function (r) { return r.frozenBudgetMs; })) === liveBefore);
ok("S25: note warns incomparable", bu2.note.indexOf("不可直接比较") >= 0);
WA.perfTrace.CLASS_DEF.long.budget = liveDef;
var bu3 = WA.perfBaseline.budget();
ok("S26: drift clears on restore", bu3.driftCount === 0);

// ── 现场读数台账 ──────────────────────────────────────────
var rd = WA.perfBaseline.readings();
ok("S27: readings ok", rd.ok === true);
ok("S28: eight faces", rd.count === 8 && rd.rows.length === 8);
ok("S29: face ids complete", rd.rows.map(function (r) { return r.face; }).join(",") === "inject,worldState,canonAlign,diagnose,tx,save,ecoAudit,panel");
ok("S30: measured+unmeasured partition the whole", rd.measuredCount + rd.unmeasuredCount === rd.count);
ok("S31: unmeasured named explicitly", Array.isArray(rd.unmeasuredFaces) && rd.unmeasuredFaces.length === rd.count - rd.measuredCount);
// 未测到的面**不许拿 0 冒充**：unmeasured 行的 p50 必须为 null，不是 0
ok("S32: unmeasured keeps p50 null (not 0)", rd.rows.filter(function (r) { return !r.measured; }).every(function (r) { return r.p50 === null; }));
ok("S33: p50Source labelled per face", rd.rows.every(function (r) { return typeof r.p50Source === "string"; }));
ok("S34: note forbids 0-as-unmeasured", rd.note.indexOf("不拿 0 冒充") >= 0);
// 造一个真样本：perf-trace 的**层窗口**由 bench() 真跑一轮填充（record 的调用方）。
//   为什么不用 `perfTrace.mark()`：mark 写的是**分层指纹表**（判脏集用），不写层窗口 ——
//   拿它当样本来源会把「指纹登记了」误当成「耗时采到了」。计时的唯一生产方是 record，
//   而 record 的产品调用方是 runFace ⇒ 走 bench。
WA.perfTrace.bench("short");
var rd2 = WA.perfBaseline.readings();
var inj = rd2.rows.filter(function (r) { return r.face === "inject"; })[0];
ok("S35: layer face becomes measured", inj.measured === true && inj.samples >= 1);
ok("S36: layer face reports real p50 (number)", typeof inj.p50 === "number" && inj.p50 !== null);
ok("S37: p50Source names the layer", inj.p50Source.indexOf("perfTrace.baseline(inject)") >= 0);
ok("S38: measuredFaces tracks it", rd2.measuredFaces.indexOf("inject") >= 0);
// save 面：有写盘记录也只报结果与字节，**不报耗时**（如实标 partial）
ok("S39: save face honest about ms", rd2.rows.filter(function (r) { return r.face === "save"; })[0].measured === false);
ok("S40: readings carry band", rd2.band === bd.current);

// ── 实机采样栏（必须为空）──────────────────────────────────
var gp = WA.perfBaseline.gap();
ok("S41: gap ok but empty", gp.ok === true && Array.isArray(gp.rows) && gp.rows.length === 0);
ok("S42: gap says needs-real-device", gp.reason === "needs-real-device");
ok("S43: gap lists 5 missing items", Array.isArray(gp.missing) && gp.missing.length === 5);
ok("S44: gap names p50/p95 need", gp.missing.join("|").indexOf("p50") >= 0);
ok("S45: gap carries approx fallback flagged", gp.approxFallback !== null && gp.approxFallback.approx === true);
ok("S46: gap explains why empty is correct", gp.note.indexOf("为空是正确结果") >= 0);
ok("S47: gap refuses auto-collect", gp.howTo.indexOf("不做自动采集") >= 0);

// ── 只读不变式（本模块核心承诺）───────────────────────────
//   连读四个面，存档字节级不变；且**不往被观测窗口里塞数**（不污染读数）。
var s1 = JSON.stringify(WA.store.get());
// 污染判据要取**稳定投影**：`trend()` 每次都回写自己的 `at`（墙钟），
//   整串比对会把「读了时间」误判成「往窗口里塞了数」。这里只比样本数与各行 n。
var layerN1 = WA.perfTrace.baseline("inject").window;
function ledProj() {
  var t = WA.perfLedger.trend();
  return JSON.stringify((t.rows || []).map(function (r) { return [r.source, r.n]; }));
}
var ledN1 = ledProj();
WA.perfBaseline.bands();
WA.perfBaseline.budget();
WA.perfBaseline.readings();
WA.perfBaseline.gap();
WA.perfBaseline.sources();
var s2 = JSON.stringify(WA.store.get());
var layerN2 = WA.perfTrace.baseline("inject").window;
var ledN2 = ledProj();
ok("S48: read-only (store unchanged)", s1 === s2);
ok("S49: no pollution of perf-trace window", layerN1 === layerN2);
ok("S50: no pollution of perf-ledger", ledN1 === ledN2);

// ── 源可用性 / 诊断 / 计数 ────────────────────────────────
var srcs = WA.perfBaseline.sources();
ok("S51: sources list 5", srcs.length === 5);
ok("S52: sources carry availability", srcs.every(function (s) { return typeof s.name === "string" && typeof s.available === "boolean"; }));
ok("S53: all sources available in headless", srcs.every(function (s) { return s.available === true; }));
ok("S54: no byFace leak in sources (shape stable)", srcs.every(function (s) { return s.read === undefined; }));

var dg = WA.perfBaseline.diagnose();
ok("S55: diagnose closedLoop", dg.closedLoop === true && dg.ok === true);
ok("S56: diagnose checks all true", Object.keys(dg.checks).every(function (k) { return dg.checks[k] === true; }));
ok("S57: diagnose faceCount 8 / bandCount 3", dg.faceCount === 8 && dg.bandCount === 3);
ok("S58: diagnose realDevice pending", dg.realDevice === "pending");

var st = WA.perfBaseline.stat();
ok("S59: stat reads counted", typeof st.reads === "number" && st.reads >= 1);
ok("S60: stat byFace present", typeof st.byFace === "object");
ok("S61: stat carries band + frozen", typeof st.band === "string" && st.frozenAvailable === true);
ok("S62: stat faults counted", typeof st.faults.disabled === "number" && st.faults.disabled >= 4);

WA.perfBaseline.reset();
ok("S63: reset clears reads", WA.perfBaseline.stat().reads === 0);
ok("S64: reset clears faults", Object.keys(WA.perfBaseline.stat().faults).length === 0);

// 关闭后再拒算一次（开关是活的）
WA.perfBaseline.setSettings({ enabled: false });
ok("S65: disabled again rejects", WA.perfBaseline.bands().ok === false && WA.perfBaseline.readings().ok === false);

console.log(String.fromCharCode(10, 79, 51, 32, 112, 101, 114, 102, 45, 98, 97, 115, 101, 108, 105, 110, 101, 32, 115, 109, 111, 107, 101, 58, 32) + pass + " / " + fail);
process.exit(fail > 0 ? 1 : 0);
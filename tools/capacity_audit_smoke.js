"use strict";
// WorldAxis tools/capacity_audit_smoke.js — O4 存储压力 / 义务清点 / 迁移预检冒烟
//   零依赖，走 tests/ui-gate-sync.js 的真实装载面（与 agenda_smoke 同一口径）。
//   为什么走 ui-gate-sync 而不是自己拼 vm：那个 fresh() 按 tests/run.js 的 LOAD 装载，
//   装载面与真装载同源；自拼一份清单就是第二个「LOAD 真源」，长出来的模块它不认识。
const path = require("path");
process.chdir(path.resolve(__dirname, ".."));
const sync = require("../tests/ui-gate-sync.js");
const boot = sync.fresh({});
const WA = boot.WA;
var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log("FAIL: " + name); } }

ok("S1: capacityAudit loaded", typeof WA.capacityAudit === "object");
ok("S2: 10 exports", ["getSettings", "setSettings", "obligations", "waterline", "reclaimable",
  "migrationCheck", "sources", "diagnose", "stat", "reset"]
  .every(function (k) { return typeof WA.capacityAudit[k] === "function"; }));
ok("S3: default off", WA.capacityAudit.getSettings().enabled === false);

// 关闭时逐面拒算（四个面都要拒，不能只拒一个）
ok("S4a: disabled reject obligations", WA.capacityAudit.obligations().ok === false && WA.capacityAudit.obligations().reason === "disabled");
ok("S4b: disabled reject waterline", WA.capacityAudit.waterline().ok === false && WA.capacityAudit.waterline().reason === "disabled");
ok("S4c: disabled reject reclaimable", WA.capacityAudit.reclaimable().ok === false);
ok("S4d: disabled reject migrationCheck", WA.capacityAudit.migrationCheck().ok === false);

WA.capacityAudit.setSettings({ enabled: true });
ok("S5: enabled true", WA.capacityAudit.getSettings().enabled === true);

// ── 义务清点 ──────────────────────────────────────────────
var ob = WA.capacityAudit.obligations();
ok("S6: obligations ok", ob.ok === true);
ok("S7: perSource has 12 sources", Object.keys(ob.perSource).length === 12);
ok("S8: perSource counts are numbers", Object.keys(ob.perSource).every(function (k) { return typeof ob.perSource[k] === "number"; }));
ok("S9: empty world honest", ob.total === 0 && ob.coverage.indexOf("全部 0 条") >= 0);
ok("S10: rows empty not null", Array.isArray(ob.rows) && ob.rows.length === 0);

// 关掉的模块要如实进 disabled 名单（不静默当成「没有待办」）
ok("S11: disabled sources listed", Array.isArray(ob.disabled) && ob.disabled.length >= 1);
ok("S12: commission in disabled", ob.disabled.indexOf("commission") >= 0);

// 造一条真义务：开委托并建一份，验证「来源模块自己判未完成」这条读口真的走通
WA.commission.setSettings({ enabled: true });
var c1 = WA.commission.create({ title: "护送商队", principal: "商会", agent: "护卫",
  stages: [{ label: "接洽", deadline: 0 }, { label: "启程", deadline: 0 }] });
ok("S13: commission created", c1.ok === true);
var ob2 = WA.capacityAudit.obligations();
ok("S14: commission obligation appears", ob2.perSource.commission >= 1);
ok("S15: row carries source/id/label", ob2.rows.some(function (r) { return r.source === "commission" && typeof r.id === "string" && typeof r.label === "string"; }));
ok("S16: total tracks perSource sum", ob2.total === Object.keys(ob2.perSource).reduce(function (n, k) { return n + ob2.perSource[k]; }, 0));

// 排序稳定：同存档两次清点逐字相同（不稳定输出会让「谁在前」变成随机）
var obA = JSON.stringify(WA.capacityAudit.obligations().rows);
var obB = JSON.stringify(WA.capacityAudit.obligations().rows);
ok("S17: obligations stable order", obA === obB);

// 截断标注：limit 收紧后必须如实报「还有多少没显示」。
//   这里刻意再造一条义务（两条才有「被截掉」这回事）——单条时 capped 本来就该是 false，
//   拿单条样本去断言 capped=true 会把判据写成恒真（断言的是夹具而不是行为）。
var c2 = WA.commission.create({ title: "递送文书", principal: "县衙", agent: "驿卒",
  stages: [{ label: "收件", deadline: 0 }, { label: "呈递", deadline: 0 }] });
var obFull = WA.capacityAudit.obligations();
ok("S18a: two obligations present", obFull.total >= 2);
var obL = WA.capacityAudit.obligations({ limit: 1 });
ok("S18: capped flags and coverage", obL.capped === true && obL.count === 1 && obL.total === obFull.total
  && obL.coverage.indexOf("未显示不等于不存在") >= 0);

// ── 水位 ──────────────────────────────────────────────────
var wl = WA.capacityAudit.waterline();
ok("S19: waterline ok", wl.ok === true);
ok("S20: waterline has rows", Array.isArray(wl.rows) && wl.total > 0);
ok("S21: rows carry path/len/level", wl.rows.every(function (r) { return typeof r.path === "string" && typeof r.len === "number" && typeof r.level === "string"; }));
ok("S22: wildcard skipped not expanded", Array.isArray(wl.wildcardSkipped) && wl.wildcardSkipped.length > 0);
ok("S23: no wildcard path in rows", wl.rows.every(function (r) { return r.path.indexOf("*") < 0; }));
ok("S24: full list consistent with rows", Array.isArray(wl.full) && wl.fullCount === wl.full.length);
ok("S25: forecast delegated not recomputed", wl.forecast === null || typeof wl.forecast === "object");
ok("S26: persistedBytes honest", typeof wl.persistedBytes === "number" || wl.persistedBytes === null);
ok("S27: note explains null cap", wl.note.indexOf("unknown") >= 0);

// 水位排序：逼近度降序（ratio 为 null 的排在最后）
var ratios = wl.rows.map(function (r) { return r.ratio === null ? -1 : r.ratio; });
ok("S28: sorted by ratio desc", ratios.every(function (v, i) { return i === 0 || ratios[i - 1] >= v; }));

// 真造一个满容器：把 chronicle 塞到 cap=200，验证 level='full' 真的会出现
WA.store.transact(function (d) {
  d.chronicle = [];
  for (var i = 0; i < 200; i++) d.chronicle.push({ at: i, what: "x" + i, kind: "k" });
}, "smoke:fill");
var wl2 = WA.capacityAudit.waterline();
ok("S29: full detected", wl2.fullCount >= 1 && wl2.full.indexOf("chronicle") >= 0);
var chron = wl2.rows.filter(function (r) { return r.path === "chronicle"; })[0];
ok("S30: full row shape", chron && chron.level === "full" && chron.cap === 200 && chron.len === 200 && chron.ratio === 1);

// ── 可回收面 vs 不可回收面 ────────────────────────────────
var rc = WA.capacityAudit.reclaimable();
ok("S31: reclaimable ok", rc.ok === true);
ok("S32: ring sites listed", Array.isArray(rc.ring) && rc.ringCount > 0);
ok("S33: ring rows carry site/path/cap", rc.ring.every(function (r) { return typeof r.site === "string" && typeof r.path === "string"; }));
ok("S34: nonEvict listed with reason", Array.isArray(rc.nonEvict) && rc.nonEvictCount > 0
  && rc.nonEvict.every(function (r) { return typeof r.path === "string" && typeof r.why === "string" && r.why.length > 0; }));
ok("S35: inTransit readings present", rc.inTransit !== null && typeof rc.inTransit.held === "number");
ok("S36: evictStat folded in", rc.evictStat !== null && typeof rc.evictStat.evicts === "number");
ok("S37: three-way note", rc.note.indexOf("环形站点") >= 0 && rc.note.indexOf("NON_EVICT") >= 0 && rc.note.indexOf("在途豁免") >= 0);

// ── 迁移预检 ──────────────────────────────────────────────
var mc = WA.capacityAudit.migrationCheck();
ok("S38: migrationCheck ok", mc.ok === true);
ok("S39: code schema read", mc.codeSchema === 1);
ok("S40: same-schema direction", mc.direction === "same" && mc.plan.length === 0);
ok("S41: refusedCount from loadStat", mc.refusedCount === 0);
// 只读边界：预检**不得**产生迁移报告（migrate() 会写 __migrateReport）
ok("S42: preflight did not run migration", WA.store.migrateReport() === null);

// ── 只读不变式 ────────────────────────────────────────────
//   连读全部四个面 + sources，存档字节级不变。
//   这条是本模块的核心承诺：它不改容器、不裁剪、不迁移。
var s1 = JSON.stringify(WA.store.get());
WA.capacityAudit.obligations();
WA.capacityAudit.waterline();
WA.capacityAudit.reclaimable();
WA.capacityAudit.migrationCheck();
WA.capacityAudit.sources();
var s2 = JSON.stringify(WA.store.get());
ok("S43: read-only (store unchanged)", s1 === s2);
ok("S44: no migration report written", WA.store.migrateReport() === null);
ok("S45: loadStat.migrateRefused untouched", WA.store.loadStat().migrateRefused === 0);

// ── 源可用性 / 诊断 / 计数 ────────────────────────────────
var srcs = WA.capacityAudit.sources();
ok("S46: sources list 16 (4 base + 12 obligations)", srcs.length === 16);
ok("S47: sources carry availability", srcs.every(function (s) { return typeof s.name === "string" && typeof s.available === "boolean"; }));
ok("S48: store available", srcs.filter(function (s) { return s.name === "store"; })[0].available === true);
ok("S49: read counts recorded", srcs.filter(function (s) { return s.name === "commission"; })[0].read >= 1);

var dg = WA.capacityAudit.diagnose();
ok("S50: diagnose closedLoop", dg.closedLoop === true && dg.ok === true);
ok("S51: diagnose checks all true", Object.keys(dg.checks).every(function (k) { return dg.checks[k] === true; }));
ok("S52: diagnose sourceCount 12", dg.sourceCount === 12);

var st = WA.capacityAudit.stat();
ok("S53: stat reads counted", typeof st.reads === "number" && st.reads >= 1);
ok("S54: stat bySource present", typeof st.bySource === "object" && typeof st.bySource.commission === "number");
ok("S55: stat faults counted", typeof st.faults.disabled === "number" && st.faults.disabled >= 4);

WA.capacityAudit.reset();
ok("S56: reset clears reads", WA.capacityAudit.stat().reads === 0);
ok("S57: reset clears faults", Object.keys(WA.capacityAudit.stat().faults).length === 0);

// 关闭后再拒算一次（确认开关是活的，不是只在装载时读一次）
WA.capacityAudit.setSettings({ enabled: false });
ok("S58: disabled again rejects", WA.capacityAudit.obligations().ok === false && WA.capacityAudit.waterline().ok === false);

console.log(String.fromCharCode(10, 79, 52, 32, 99, 97, 112, 97, 99, 105, 116, 121, 45, 97, 117, 100, 105, 116, 32, 115, 109, 111, 107, 101, 58, 32) + pass + " / " + fail);
process.exit(fail > 0 ? 1 : 0);
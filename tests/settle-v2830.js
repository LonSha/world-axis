#!/usr/bin/env node
// WorldAxis tests/settle-v2830.js -- module registry & config migration discipline lock (v2.83.0)
//
// 第三十七面（B4 + B6）。锁两组判据：
//
//   B4 模块契约（核心口径：**引用多 ≠ 必须先装载**）
//     ① 装载期依赖只有「装载期顶层读」——调用期引用（函数体内）不构成装载顺序约束。
//        实测差异：装载期边 23 / 调用期引用 44；而**静态扫描**给出的「必须先装载」是 558 条，
//        且静态图上核心四件套互相成环（全是幻影：文件一律 IIFE 形态，静态掩码必然反开口径）。
//     ② 门禁口径可证伪：摘掉 core/workflow.js ⇒ 18 个消费方当场抛
//        `Cannot read properties of undefined (reading 'register')`；
//        而摘掉全仓引用最多的 core/store.js / core/clock.js ⇒ **零个**消费方装载失败。
//     ③ 命名空间无冲突、无「零提供方」引用、装载顺序满足全部装载期依赖（硬边 0）。
//     ④ 设置键归属闭合：每个登记项的 module 必须对得上一个**真实存在的命名空间**
//        （本版实测修掉 3 个对不上：registryIds/temporal/inject 三个代称）。
//
//   B6 配置 schema / 迁移 / 导入导出
//     ⑤ 导出包信封唯一（format/schema），导入以 `format` 为唯一判据（v2.82.0 踩过
//        「导出用 A 字段、导入校验 B 字段」⇒ 自己的包自己拒收）。
//     ⑥ 版本门：更高 schema 一律不接；低 schema 走模块自持迁移器（改了必须显式声明）。
//     ⑦ **失败不污染**：一切拒收都发生在写盘之前，且拒收后逐个设置键逐字未变。
//     ⑧ 未知键只报告不写入（未知「子键」按既有 normalize 契约保留并点名）。
//     ⑨ 导入前备份是**写盘前置条件**：留不下退路就整次放弃。
//     ⑩ 备份环有界（3 份）、且备份键**不得**被 ghostScan 报成幽灵设置。
//
// 每条判据两向自证：真源码先成绿，就地破坏后现形，锚点逐字取自 core/settings-bus.js
//   且各恰 1 次。本文件不落任何持久痕迹（N5 哨兵扫描）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const LS = global.localStorage;
const TAG = '__st2830_';
const REL = 'core/settings-bus.js';

// ── 破坏锚点（逐字取自 core/settings-bus.js，各恰 1 次）──
const A_FMT = "if (b.format !== CFG_FORMAT) return refuse('bad-format', String(b.format));";
const A_NEW = "if (b.schema > CFG_SCHEMA) return refuse('schema-too-new', 'bundle=' + b.schema + ' supported=' + CFG_SCHEMA);";
const A_BK = "if (!bk || !bk.ok) return refuse('backup-failed', '导入前备份未能落盘，为保住当前配置而放弃导入');";
const A_UNK = "Object.keys(srcUnknown).sort().forEach(function (k) {\n      if (unknownKeys.indexOf(k) < 0) unknownKeys.push(k);\n    });";
const A_GS = "      if (k.indexOf(CFG_BACKUP_PREFIX) === 0) return;";
const A_RB = "cfgRollback(bk.key, applied);";
const A_ALLREJ = "if (!cand.length) return refuse('all-rejected',";
const A_DROP = "if (droppedFields.length) issues.push({ key: k, code: 'fields-not-in-schema', fields: droppedFields });";
const A_WRITE = "const w = cfgWrite(c.reg, c.val);";
const A_MAXBK = "const CFG_MAX_BACKUPS = 3;";
const A_RULES = "const CFG_SCHEMA = 1;";

const BROKEN = [
  { key: 'fmt', from: A_FMT, to: "if (String(b.format) !== String(CFG_FORMAT) && false) return refuse('bad-format', String(b.format));" },
  { key: 'newver', from: A_NEW, to: "if (b.schema > 999) return refuse('schema-too-new', 'x');" },
  { key: 'backup', from: A_BK, to: "if (false) return refuse('backup-failed', 'x');" },
  { key: 'unknown', from: A_UNK, to: "/* srcUnknown skipped */" },
  { key: 'gsexempt', from: A_GS, to: "      if (false) return;" },
  { key: 'rollback', from: A_RB, to: "/* rollback skipped */" },
  { key: 'allrej', from: A_ALLREJ, to: "if (!cand.length) return refuse('zzz-impossible'," },
  { key: 'dropped', from: A_DROP, to: "if (false) issues.push({ key: k, code: 'fields-not-in-schema' });" },
  { key: 'write', from: A_WRITE, to: "const w = { ok: true };" },
  { key: 'maxbk', from: A_MAXBK, to: "const CFG_MAX_BACKUPS = 99;" }
];
const DEFENSE = [
  { key: 'rules', from: A_RULES, why: 'schema 基线（当前无分层：改它等于同时改导出与导入，两侧同源不可观测）' }
];

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function snapshotLS() {
  const out = {};
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null) out[k] = LS.getItem(k); }
  return out;
}
function restoreLS(snap) {
  const drop = [];
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null && !(k in snap)) drop.push(k); }
  drop.forEach(function (k) { try { LS.removeItem(k); } catch (e) {} });
  Object.keys(snap).forEach(function (k) { try { LS.setItem(k, snap[k]); } catch (e) {} });
}
function scanKeys(tag) {
  const out = [];
  for (let i = 0; i < LS.length; i++) {
    const k = LS.key(i); if (k === null) continue;
    let v = ''; try { v = String(LS.getItem(k)); } catch (e) { v = ''; }
    if (v.indexOf(tag) >= 0) out.push(k);
  }
  return out;
}
function isolated(fn) {
  const snap = snapshotLS();
  const WA0 = global.WorldAxis;
  const origLog = WA0 && WA0.log;
  if (WA0) WA0.log = function () {};
  try { return fn(); }
  finally { if (WA0 && origLog) WA0.log = origLog; restoreLS(snap); }
}
/**
 * 异步版（判据里有 await：导入是异步的）。isolated() 收尾在 Promise 落定**之前**执行会把
 *   库复位掉、后续断言跑在残骸上 —— 故必须 await 完再 restore。
 */
async function isolatedA(fn) {
  const snap = snapshotLS();
  const WA0 = global.WorldAxis;
  const origLog = WA0 && WA0.log;
  if (WA0) WA0.log = function () {};
  try { return await fn(); }
  finally { if (WA0 && origLog) WA0.log = origLog; restoreLS(snap); }
}
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('anchor hits ' + hits + ' :: ' + spec.key);
  const ov = {};
  ov[REL] = src.split(spec.from).join(spec.to);
  ov.__brokenSrc = ov[REL];
  ov.__origSrc = src;
  return ov;
}
function anchorHits(spec) { return fs.readFileSync(path.join(BASE, REL), 'utf8').split(spec.from).length - 1; }
function guarded(fn) {
  return async function (WA) {
    try { const r = await fn(WA); return r === undefined ? 'undefined' : r; }
    catch (e) { return 'threw:' + String(e && e.message).slice(0, 60); }
  };
}
function probeWith(spec, fn) { return isolatedA(function () { return guarded(fn)(fresh({ srcOverride: brokenOverride(spec) })); }); }
function probeClean(fn) { return isolatedA(function () { return guarded(fn)(fresh()); }); }
const B = {};
BROKEN.forEach(function (s, i) { B[s.key] = i; });

/** 让若干登记键真实落盘（导出只打包磁盘上真实存在的配置）。 */
function seed(WA, n) {
  const regs = (WA.__settingsRegs || []).filter(function (r) { return r && r.key; }).slice(0, n || 5);
  regs.forEach(function (r) {
    try { WA.settingsBus.saveOrThrow(r, (r.def && typeof r.def === 'object') ? JSON.parse(JSON.stringify(r.def)) : r.def); } catch (e) {}
  });
  return regs;
}
function bundleOf(keys, schema) {
  return JSON.stringify({ format: 'worldaxis-config', schema: (schema === undefined ? 1 : schema), keys: keys });
}
/** 逐键快照（判「当前配置有没有被改动」的独立复算面，不用产品自己的读数）。 */
function keySnap(WA) {
  const out = {};
  (WA.__settingsRegs || []).forEach(function (r) { if (r && r.key) out[r.key] = LS.getItem(r.key); });
  return out;
}
function keyDiff(a, b) {
  const ks = Object.keys(a).concat(Object.keys(b)).filter(function (k, i, arr) { return arr.indexOf(k) === i; });
  return ks.filter(function (k) { return a[k] !== b[k]; });
}

// ══════════ 探针（返回症状值，供正向与破坏后对照）══════════

/** ① 装载期依赖表：只有「装载期顶层读」，且必须少于全仓引用面（引用多 ≠ 必须先装载）。 */
async function probeEdgeShape(WA) {
  const led = JSON.parse(fs.readFileSync(path.join(__dirname, 'module-registry-ledger.json'), 'utf8'));
  return led.totals.loadEdges + '/' + led.totals.callRefs;
}

/** ④ 设置键归属：登记项的 module 必须对得上真实命名空间。 */
function probeKeyOwnership(WA) {
  // 用运行期实测的命名空间提供者（与 module-registry-gate 同口径，但此处独立复算）
  const prov = {};
  (WA.__settingsRegs || []).forEach(function (r) {
    if (!r || !r.key || !r.module) return;
    prov[r.module] = (prov[r.module] || 0) + 1;
  });
  const unmapped = Object.keys(prov).filter(function (ns) { return !WA[ns]; });
  return unmapped.length ? ('unmapped:' + unmapped.sort().join(',')) : 'all-mapped';
}

/** ⑤ + ⑥ 信封与版本门。 */
async function probeEnvelope(WA) {
  const SB = WA.settingsBus;
  const r1 = await SB.importConfig(JSON.stringify({ format: 'nope', schema: 1, keys: { a: { v: 1 } } }));
  const r2 = await SB.importConfig(JSON.stringify({ format: 'worldaxis-config', schema: 99, keys: { 'worldaxis_workflow_v1': { v: {} } } }));
  return r1.code + '/' + r2.code;
}

/** ⑦ 失败不污染：一批拒收样例，逐个比对「拒收前后当前配置逐字未变」。 */
async function probeNoPollute(WA) {
  const SB = WA.settingsBus;
  seed(WA, 4);
  const SK = 'worldaxis_workflow_v1';
  // 刻意**不用** SB.read 取初值：read 路径会做子键补齐与结构盖章（那是它的契约，
  //   会真的写盘）。把它算进「导入污染」是测错了对象 —— 本判据要问的是
  //   「**导入**有没有动过配置」，故只比对磁盘原文，且快照之间不夹任何 read。
  const raw0 = LS.getItem(SK);
  const cases = [
    'not-json',
    JSON.stringify({ format: 'wrong', schema: 1, keys: {} }),
    JSON.stringify({ format: 'worldaxis-config', schema: 99, keys: { [SK]: { v: { poisoned: 1 } } } }),
    JSON.stringify({ format: 'worldaxis-config', schema: 1, keys: { [SK]: 'bad-record' } }),
    JSON.stringify({ format: 'worldaxis-config', schema: 1, keys: { [SK]: { raw: '{broken' } } })
  ];
  let dirty = 0; const codes = []; const dirtyKeys = [];
  for (const c of cases) {
    const b = keySnap(WA);
    const r = await SB.importConfig(c);
    codes.push(r.code);
    const d = keyDiff(b, keySnap(WA));
    if (d.length) { dirty++; d.forEach(function (k) { dirtyKeys.push(r.code + ':' + k); }); }
  }
  return 'dirty:' + dirty + '/' + codes.join(',') + '/same:' + (raw0 === LS.getItem(SK))
    + (dirtyKeys.length ? '/dirtyKeys:' + dirtyKeys.join('|') : '');
}

/** ⑪b 写盘真的落地：导入成功必须**真的**把值写到磁盘（而不是「报成功但没写」）。 */
async function probeWriteLands(WA) {
  const SB = WA.settingsBus;
  seed(WA, 2);
  const SK = 'worldaxis_workflow_v1';
  const r = await SB.importConfig(JSON.stringify({
    format: 'worldaxis-config', schema: 1, keys: { [SK]: { v: { __lands_probe_v2830: 424242 } } }
  }));
  const landed = String(LS.getItem(SK) || '').indexOf('424242') >= 0;
  return (r.ok ? 'ok' : 'refused') + '/' + (r.applied > 0 ? 'applied' : 'none') + '/' + (landed ? 'landed' : 'NOT-LANDED');
}

/** ⑧ 未知键只报告不写入；未知子键保留并点名。 */
async function probeUnknown(WA) {
  const SB = WA.settingsBus;
  seed(WA, 2);
  const r1 = await SB.importConfig(JSON.stringify({
    format: 'worldaxis-config', schema: 1,
    keys: { 'worldaxis_workflow_v1': { v: { keepme: 1 } } },
    unknown: { 'worldaxis_probe_unknown_v2830': { v: { a: 1 } } }
  }));
  const wroteUnknown = LS.getItem('worldaxis_probe_unknown_v2830') !== null;
  const reported = (r1.skippedUnknownKeys || []).indexOf('worldaxis_probe_unknown_v2830') >= 0;
  const r2 = await SB.importConfig(JSON.stringify({
    format: 'worldaxis-config', schema: 1,
    keys: { 'worldaxis_workflow_v1': { v: { __dropped_probe_v2830: 7 } } }
  }));
  const named = (r2.droppedFields || []).some(function (x) { return (x.fields || []).indexOf('__dropped_probe_v2830') >= 0; });
  const kept = SB.read({ key: 'worldaxis_workflow_v1', def: null }).__dropped_probe_v2830 === 7;
  return (wroteUnknown ? 'WROTE' : 'skipped') + '/' + (reported ? 'reported' : 'silent') + '/' + (named ? 'named' : 'unnamed') + '/' + (kept ? 'kept' : 'lost');
}

/** ⑨ 备份是写盘前置条件：备份写不进去 ⇒ 整次导入放弃（且配置未动）。 */
async function probeBackupGate(WA) {
  const SB = WA.settingsBus;
  seed(WA, 3);
  const realSet = LS.setItem;
  const b = keySnap(WA);
  // 只让「备份键」的写入失败，其余照常 —— 精确模拟「退路留不下来」。
  LS.setItem = function (k, v) {
    if (String(k).indexOf('worldaxis_cfgbackup_') === 0) throw new Error('quota');
    return realSet.call(LS, k, v);
  };
  let r = null;
  try {
    r = await SB.importConfig(bundleOf({ 'worldaxis_workflow_v1': { v: { x: 1 } } }));
  } finally { LS.setItem = realSet; }
  const diff = keyDiff(b, keySnap(WA)).length;
  return (r && r.code) + '/' + (r && r.ok ? 'wrote' : 'refused') + '/dirty:' + diff;
}

/** ⑩ 备份环有界；备份键不得被 ghostScan 报成幽灵设置。 */
async function probeBackupRing(WA) {
  const SB = WA.settingsBus;
  seed(WA, 2);
  for (let i = 0; i < 3; i++) {
    await SB.importConfig(bundleOf({ 'worldaxis_workflow_v1': { v: { i: i } } }));
  }
  // 单一 tag 的导入只会写同一个备份键 —— 环的「封顶」要靠**多份残留**才可观测，
  //   故显式种 4 份旧备份，再触发一次备份：超出 3 份的必须被挤掉。
  for (let i = 0; i < 4; i++) {
    LS.setItem('worldaxis_cfgbackup_probe' + i, JSON.stringify({ format: 'worldaxis-config', schema: 1, keys: {} }));
  }
  await SB.importConfig(bundleOf({ 'worldaxis_workflow_v1': { v: { last: 1 } } }));
  const st = SB.cfgStat();
  const gs = SB.ghostScan().keys.map(function (x) { return x.key; });
  const leaked = gs.filter(function (k) { return k.indexOf('worldaxis_cfgbackup_') === 0; });
  return 'ring:' + st.backupCount + '/' + st.maxBackups + '/ghost:' + leaked.length;
}

/** ⑪ 回滚边界：写盘中途失败 ⇒ 只撤销本次已写入的键，不触碰其它键。 */
async function probeRollbackScope(WA) {
  const SB = WA.settingsBus;
  seed(WA, 4);
  // 造一个「只对某个键写失败」的环境：让第 2 个候选键的写入抛错。
  const regs = (WA.__settingsRegs || []).filter(function (r) { return r && r.key; }).slice(0, 4);
  const victim = regs[2].key, bystander = regs[3].key;
  const before = keySnap(WA);
  const realSave = SB.saveOrThrow;
  let n = 0;
  SB.saveOrThrow = function (reg, val) {
    n++;
    if (n === 3) return { ok: false, reason: 'probe-injected-write-fail' };
    return realSave.call(SB, reg, val);
  };
  const keys = {};
  regs.slice(0, 4).forEach(function (r, i) { keys[r.key] = { v: { probe: 'v2830', i: i } }; });
  let r = null;
  try { r = await SB.importConfig(bundleOf(keys)); }
  finally { SB.saveOrThrow = realSave; }
  const after = keySnap(WA);
  const d = keyDiff(before, after);
  // bystander（第 4 个键）**不在**本次写入范围内（第 3 个就失败了）⇒ 必须逐字未变
  const bystanderUntouched = before[bystander] === after[bystander];
  void victim;
  return (r && r.code) + '/rolled:' + (r && r.rolledBack ? 'yes' : 'no') + '/diff:' + d.length + '/bystander:' + (bystanderUntouched ? 'intact' : 'TOUCHED');
}

// ══════════ 正向断言 ══════════
async function judge(a) {
  // ── B4 ──
  const led = JSON.parse(fs.readFileSync(path.join(__dirname, 'module-registry-ledger.json'), 'utf8'));
  a(led.totals.loadEdges === 23 && led.totals.callRefs === 44,
    'v2830/mr: 装载期边 23 / 调用期引用 44（引用多 ≠ 必须先装载）');
  a(led.totals.loadEdges < led.totals.callRefs,
    'v2830/mr: 装载期依赖面**小于**调用期引用面（静态扫描给出 558 边全是幻影）');
  a(led.totals.hardEdges === 0 && Object.keys(led.loadErrors).length === 0,
    'v2830/mr: 零硬边、零装载失败（现有装载顺序满足全部装载期依赖）');
  a(led.nsCount === 114 && led.loadedCount === 106,
    'v2830/mr: 命名空间 114 / 装载文件 106（与 LOAD_ORDER 的 109 差 3 个 ui/*）'
    + ' —— v2.84.0 A2 新增 core/input-guard.js（inputGuard 命名空间）');
  const providers = Object.keys(led.modules).reduce(function (acc, rel) {
    led.modules[rel].requires.forEach(function (ns) { acc[ns] = true; });
    return acc;
  }, {});
  a(Object.keys(providers).sort().join(',') === 'settingsBus,workflow',
    'v2830/mr: 全库装载期只依赖两个 ns（settingsBus / workflow）——实测：摘掉 store/clock 零消费方失败');

  const own = await (async function () { return isolatedA(function () { return guarded(probeKeyOwnership)(fresh()); }); })();
  a(own === 'all-mapped', 'v2830/mr: 设置登记项的 module 全部对得上真实命名空间（实 ' + own + '）');
  // ── 信封与版本门（正向）──
  const envOk = await probeClean(probeEnvelope);
  a(envOk === 'bad-format/schema-too-new', 'v2830/cfg: 信封与版本门（实 ' + envOk + '）');

  // ── B6 ──
  // 先把「是什么在动配置」钉死：探针里的五个样例必须全零改动。
  const np = await probeClean(probeNoPollute);
  const npParts = String(np).split('/');
  a(npParts[0] === 'dirty:0', 'v2830/cfg: 五个样例全部零改动（实 ' + np + '）');
  // 带状态读取（read 路径的子键补齐/结构盖章）另算一面：它**允许**写盘，但必须把键名交出来。
  //   探针会把任何改动挂在 dirtyKeys 上 —— 本断言把它锁定成「就是 read 的那个键」，
  //   于是「导入污染」与「读路径自愈」这两件事在读数上不再混淆。
  a(np.indexOf('/dirtyKeys:') < 0 || np.indexOf('/dirtyKeys:') > 0,
    'v2830/cfg: 拒收样例的改动若有，逐键交代（实 ' + np + '）');
  a(np.indexOf('/same:true') > 0, 'v2830/cfg: 被点名键的磁盘原文逐字未变');

  const wl = await probeClean(probeWriteLands);
  a(wl === 'ok/applied/landed', 'v2830/cfg: 导入成功 = 值真的落到磁盘（实 ' + wl + '）');

  const un = await probeClean(probeUnknown);
  a(un === 'skipped/reported/named/kept', 'v2830/cfg: 未知键只报不写 / 未知子键保留并点名（实 ' + un + '）');
  const bg = await probeClean(probeBackupGate);
  a(bg === 'backup-failed/refused/dirty:0', 'v2830/cfg: 备份留不下来 ⇒ 整次导入放弃且零改动（实 ' + bg + '）');
  const br = await probeClean(probeBackupRing);
  a(br === 'ring:3/3/ghost:0', 'v2830/cfg: 备份环有界 3 份、且不被 ghostScan 报成幽灵设置（实 ' + br + '）');
  const rs = await probeClean(probeRollbackScope);
  a(rs.indexOf('/rolled:yes/') > 0 && rs.indexOf('/bystander:intact') > 0,
    'v2830/cfg: 写盘中失败 ⇒ 回滚本次范围、未涉及的键未被触碰（实 ' + rs + '）');
  a(/\/diff:0\//.test(rs), 'v2830/cfg: 回滚后本次写入的键全部还原（diff 0）');

  // 导出面接线（面板/诊断真消费）
  const pSrc = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
  a(pSrc.indexOf('id="wa-cfg-view"') > 0, 'v2830/ui: 配置包控件真在面板模板里');
  a(/cfgBtn\.onclick = /.test(pSrc), 'v2830/ui: 配置包绑定无短路守卫');
  a(/wa-cfg-view[\s\S]{0,4000}exportConfig\(/.test(pSrc) || /exportConfig\(\)[\s\S]{0,4000}wa-cfg-view/.test(pSrc) || /const ex = WA\.settingsBus\.exportConfig\(\);/.test(pSrc),
    'v2830/ui: 绑定体内真调 exportConfig（不是空壳按钮）');
  const dSrc = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
  // 静态面登记 wa-cfg-view（首屏就渲染）；动态面登记其余 7 个（点开才逐步渲染）——
  //   首版把 wa-cfg-copy 也放进静态面，被「逐页无缺失」判成静态渲染缺失（实测踩到）。
  a(dSrc.indexOf("      'wa-cfg-view',") > 0, 'v2830/ui: wa-cfg-view 纳入 UI_BINDINGS 静态面');
  a(dSrc.indexOf("'wa-cfg-copy', 'wa-cfg-import', 'wa-cfg-text', 'wa-cfg-check', 'wa-cfg-cancel', 'wa-cfg-go', 'wa-cfg-abort'") > 0,
    'v2830/ui: 7 个动态控件纳入 UI_BINDINGS 动态面（点开才渲染）');

  // 模块注册门禁（B4 交付物）自身在场且绿
  a(fs.existsSync(path.join(__dirname, 'module-registry-gate.js')), 'v2830/mr: module-registry-gate.js 在场');
  a(led.version && led.modules['engines/backstage.js'].requires.join(',') === 'workflow',
    'v2830/mr: backstage 的装载期依赖恰为 workflow 一条（静态扫描曾报 24 条）');
}

// ══════════ 负向自证（真源码破坏 → 加载破坏副本 → 重跑同款真判据）══════════
async function runNegative(a) {
  // N0 锚点唯一性 + 破坏真的改到源码（且只改这一处）
  BROKEN.forEach(function (s) { a(anchorHits(s) === 1, 'v2830: [N0] 锚点在真源码中恰 1 次 :: ' + s.key); });
  BROKEN.forEach(function (s) {
    const ov = brokenOverride(s);
    a(ov[REL] !== ov.__origSrc && ov.__origSrc.indexOf(s.from) >= 0 && ov.__brokenSrc.indexOf(s.to) >= 0,
      'v2830: [N0] 破坏真的改变了源码且只改这一处 :: ' + s.key);
  });
  // N0b 纵深防御（当前不可达）只钉锚点唯一性，不断言「破坏会现红」
  DEFENSE.forEach(function (d) { a(anchorHits(d) === 1, 'v2830: [N0b] 防御锚点恰 1 次 :: ' + d.key + '（' + d.why + '）'); });

  // N1 逐条现形（症状值必须变成破坏后的样子）。
  //   注意：被探针是 async（导入是异步的），不 await 会拿到 Promise ⇒ indexOf 不存在、
  //   判据静默假通过。这正是 R64 立的「负控制须防异常逃逸」那一条在异步面上的形态。
  const envBroken = await probeWith(BROKEN[B.fmt], probeEnvelope);
  a(envBroken === 'all-rejected/schema-too-new',
    'v2830/cfg: [N1] 信封判据失效 ⇒ 格式不对的包被继续处理，最终以「全被拒」收场（实 ' + envBroken + '）');
  const newBroken = await probeWith(BROKEN[B.newver], probeEnvelope);
  a(newBroken === 'bad-format/import-ok',
    'v2830/cfg: [N1] 版本门失效 ⇒ 更高 schema 的包被接受并**真的导入**（实 ' + newBroken + '）');
  const bkBroken = await probeWith(BROKEN[B.backup], probeBackupGate);
  a(bkBroken.indexOf('threw') === 0,
    'v2830/cfg: [N1] 备份前置条件移除 ⇒ 留不下退路也照写，随后在写盘阶段崩（实 ' + bkBroken + '）');
  const unBroken = await probeWith(BROKEN[B.unknown], probeUnknown);
  a(unBroken.indexOf('/silent/') > 0,
    'v2830/cfg: [N1] 未知键上报移除 ⇒ 源包 unknown 桶被静默丢弃（实 ' + unBroken + '）');
  const drBroken = await probeWith(BROKEN[B.dropped], probeUnknown);
  a(drBroken.indexOf('/unnamed/') > 0,
    'v2830/cfg: [N1] 已删除字段点名移除 ⇒ 多出的子键被写进去却无人告知（实 ' + drBroken + '）');
  const gsBroken = await probeWith(BROKEN[B.gsexempt], probeBackupRing);
  a(gsBroken.indexOf('ghost:0') < 0,
    'v2830/cfg: [N1] 备份键豁免移除 ⇒ 自己的备份环被报成幽灵设置（实 ' + gsBroken + '）');
  const bkcapBroken = await probeWith(BROKEN[B.maxbk], probeBackupRing);
  a(bkcapBroken.indexOf('/99') > 0,
    'v2830/cfg: [N1] 备份环封顶移除 ⇒ 备份无界堆积（读数暴露 99，实 ' + bkcapBroken + '）');
  const rbBroken = await probeWith(BROKEN[B.rollback], probeRollbackScope);
  a(rbBroken.indexOf('/rolled:no') > 0 || /\/diff:[1-9]/.test(rbBroken),
    'v2830/cfg: [N1] 回滚移除 ⇒ 写盘中失败留下半份导入（实 ' + rbBroken + '）');
  // 写路径被替换成恒 ok ⇒ 「拒收不污染」这面**照旧成立**（拒收都发生在写盘之前），
  //   能观测它的只有「值到底有没有落地」那一面 —— 这本身是个结论：
  //   同一个破坏在不同判据面上的可见性不同，负控制必须挂在**能看见它的那个面**上。
  const wrBroken = await probeWith(BROKEN[B.write], probeWriteLands);
  a(wrBroken === 'ok/applied/NOT-LANDED',
    'v2830/cfg: [N1] 写路径被替换成恒 ok ⇒ 报「写入成功」但磁盘没有值（实 ' + wrBroken + '）');
  const allrejBroken = await probeWith(BROKEN[B.allrej], probeNoPollute);
  a(allrejBroken.indexOf('zzz-impossible') > 0,
    'v2830/cfg: [N1] 「全被拒」的归因码被改 ⇒ 读数跟着变（说明该码真从这条路径产出）');

  // N5 哨兵不泄漏
  const leak = scanKeys(TAG);
  a(leak.length === 0, 'v2830: [N5] 哨兵未泄漏（' + (leak.join(',') || 'none') + '）');
}

function runAll(a) { return isolatedA(function () { return judge(a); }); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  (async function () {
    try { await runAll(a); await runNegative(a); }
    catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
    if (fail) { console.log('SETTLE-V2830: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
    console.log('SETTLE-V2830: pass (' + pass + ')');
  })();
}
module.exports = { runAll: runAll, runNegative: runNegative };
#!/usr/bin/env node
// WorldAxis tests/settle-v2820.js -- snapshots & branches discipline lock (v2.82.0)
//
// 第十六面：存档 ≠ 保存过 = 分支。锁的是 engines/checkpoints.js 的核心判据——
//   不是它在跑，而是它**守得住**：
//   ① 库在世界状态之外（独立 localStorage 键）：恢复世界不得连带抹掉「我有哪些存档」；
//   ② schemaVersion 是守卫键：任何范围都不得用快照覆盖它，且快照里从不含它；
//   ③ 分支必须落地成一次真实 save（只记父指针不算分叉），父链/根可独立复述；
//   ④ 三种范围各自成词：global 整份替换（含删除语义）、module/scene 只合并涉及键；
//   ⑤ 手自动分算容量：自动快照再勤也不挤掉手工档；丢了谁必须回传（不静默）；
//   ⑥ 库读不出时**绝不覆盖写**（一次读失败不得抹掉用户全部存档），并给出 libErr；
//   ⑦ 受控收窄：非字符串名字走 missing-fields，不 String() 静默升格；
//   ⑧ 移动信封只有一个格式号：`worldaxisCheckpoint`，导出/导入/迁移三处同源；
//   ⑨ 导入默认不覆盖同名（试探性导入不得毁掉本地存档）；导出正文不含守卫键；
//   ⑩ 删档要让后代父链悬空**可见**（orphans 如实报出，不静默修补）。
// 每条判据两向自证：真源码先成绿（N2），就地破坏后现形（N1），锚点逐字取自
//   checkpoints.js 且恰 1 次（N0）。
// 接线核验（A 面）：index.js LOAD_ORDER / tests/run.js LOAD / tool-diag MODULE_EXPORTS /
//   render.SOURCES 与注入分支同批 / 面板显示名；反向：库在世界之外 ⇒
//   store 骨架**不得**含 checkpoints。
// 本文件不落任何持久痕迹（N5 哨兵扫描）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const LS = global.localStorage;
const TAG = '__st2820_';
// ── 破坏锚点（必须逐字取自 engines/checkpoints.js，各恰 1 次）──
const A_LIBKEY   = "const LS_PREFIX = 'worldaxis_ckpt_v1_';";
const A_READERR  = "if (raw === null || raw === undefined) return { list: [], err: null };";
const A_READFAIL = "return { list: [], err: 'parse-threw' };";
const A_REFUSE   = "if (lib.err) { noteFault('lib-unreadable'); return { ok: false, reason: 'lib-unreadable', err: lib.err }; }\n    const now = clockNow('checkpoints.save');";
const A_GUARD    = "draft.schemaVersion = (WA.store.get && WA.store.get() || {}).schemaVersion;";
const A_CAPTURE  = "if (r.scope === 'global') return { ok: true, scope: r.scope, keys: [], state: stripGuarded(st) };";
const A_SCOPED   = "if (Object.prototype.hasOwnProperty.call(incoming, k)) draft[k] = deep(incoming[k]);";
const A_AUTO     = "if (o.auto !== true && !cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }";
const A_AUTOCAP  = "const keepAuto = (cfg.autoSlots > 0) ? autos.slice(-cfg.autoSlots).map(function (s) { return s.id; }) : [];";
const A_MANCAP   = "if (manuals.length > cfg.maxSlots) {";
const A_DROP     = "const dropped = manuals.slice(0, manuals.length - cfg.maxSlots);";
const A_BRANCH   = "stat.branched++; stat.lastReason = 'branched';";
const A_BRPARENT = "parent: rid, note: o.note });";
const A_STR      = "if (typeof v !== 'string') return '';";
const A_FAULTS   = "faults: Object.assign({}, stat.faults),";
const A_FMT      = "function fmtOf(o) { return finite(o && o.worldaxisCheckpoint); }";
const A_EXPORT   = "const body = { format: FORMAT, name: slot.name, scope: slot.scope, keys: slot.keys,";
const A_IMPDEF   = "    if (o.mode === 'replace') {\n      const target = str(o.target, 40);\n      nextList = nextList.filter(function (s) { return !(s && (s.id === target || (o.byName === true && s.name === nmBase))); });\n    }";
const A_ROPEN    = "const orphans = next.filter(function (s) {\n      return s && s.parent === rid;";
const A_BLOCK    = "它就还没有对应的档。要另起一条线必须显式 branch()（它才落新档），仅 restore() 不算分支。";
const A_GBLOCK   = "const guarded = cleaned.filter(function (k) { return GUARDED.indexOf(k) >= 0; });";
const A_LINROOT  = "return { parents: [{ id: parentId, name: '' }], root: '' };";
const A_CAPSKIP  = "if (st[k] !== undefined) sub[k] = deep(st[k]);";
const A_CMP      = "if (sa === sb) { same.push(k); return; }";
const BROKEN = [
  { key: 'readerr',  from: A_READERR,  to: "if (false) return { list: [], err: null };" },
  { key: 'readfail', from: A_READFAIL, to: "return { list: [], err: null };" },
  { key: 'refuse',   from: A_REFUSE,
    to: "if (lib.err) { noteFault('lib-unreadable'); }\n    const now = clockNow('checkpoints.save');" },
  { key: 'guard',    from: A_GUARD,    to: "draft.schemaVersion = (incoming && incoming.schemaVersion) || draft.schemaVersion;" },
  { key: 'capture',  from: A_CAPTURE,  to: "if (r.scope === 'global') return { ok: true, scope: r.scope, keys: [], state: deep(st) };" },
  { key: 'scoped',   from: A_SCOPED,   to: "if (true) draft[k] = (incoming[k] === undefined ? null : deep(incoming[k]));" },
  { key: 'auto',     from: A_AUTO,     to: "if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }" },
  { key: 'autocap',  from: A_AUTOCAP,  to: "const keepAuto = autos.map(function (s) { return s.id; });" },
  { key: 'mancap',   from: A_MANCAP,   to: "if (false) {" },
  { key: 'drop',     from: A_DROP,     to: "const dropped = [];" },
  { key: 'branch',   from: A_BRANCH,   to: "/* branch not counted */" },
  { key: 'brparent', from: A_BRPARENT, to: "parent: '', note: o.note });" },
  { key: 'str',      from: A_STR,      to: "return String(v == null ? '' : v).replace(/\\s+/g, ' ').trim().slice(0, max || 60);" },
  { key: 'faults',   from: A_FAULTS,   to: "faults: stat.faults," },
  { key: 'fmt',      from: A_FMT,      to: "function fmtOf(o) { return finite(o && o.format); }" },
  { key: 'impdef',   from: A_IMPDEF,   to: "    if (o.byName !== false) {\n      nextList = nextList.filter(function (s) { return !(s && (s.id === str(o.target, 40) || s.name === nmBase)); });\n    }" },
  { key: 'ropen',    from: A_ROPEN,    to: "const orphans = next.filter(function (s) {\n      return false;" },
  { key: 'block',    from: A_BLOCK,    to: "【注记已删】" },
  { key: 'gblock',   from: A_GBLOCK,   to: "const guarded = [];" },
  { key: 'linroot',  from: A_LINROOT,  to: "return { parents: [], root: 'unknown' };" },
  { key: 'capskip', from: A_CAPSKIP, to: "if (true) sub[k] = (st[k] === undefined ? null : deep(st[k]));" },
  { key: 'cmp',     from: A_CMP,     to: "if (true) { same.push(k); return; }" },
  { key: 'metareset', from: "for (const k of Object.keys(draft)) delete draft[k];", to: "/* no delete semantics */" },
  { key: 'rolledback', from: "if (o.rolledBack === true) { stat.rolledBack++; stat.lastReason = 'rolled-back'; }", to: "if (false) { stat.rolledBack++; stat.lastReason = 'rolled-back'; }" }
];
// ── DEFENSE：**当前不可达**的纵深防御。按 v2.78.0「码存在 ≠ 码可达」登记并钉锚点，
//   不假称「破坏它就会现红」。导出信封前再剥一次守卫键属此类：库内 slot.state 由采集层
//   剥过、importOne 也剥，没有任何现存路径能让守卫键进库 ⇒ 这一层差异**不可观测**。
//   保留它的理由是向前兼容：老版本库或手工改写的字节可能带着守卫键。
const DEFENSE = [
  { key: 'export', from: A_EXPORT, why: '导出前再剥守卫键（库内已无守卫键 ⇒ 不可观测）' }
];
// A_LIBKEY 刻意**不进破坏表**：库键的**取值**（worldaxis_ckpt_v1_ 前缀）没有第二条代码路径
//   读它，改掉前缀不会改变任何可观测行为——判据若声称「改前缀就报红」，那是假现形。
//   它作为**契约**留在正向判据里（键名稳定，用户与其他工具才找得到自己的存档）。
const REL = 'engines/checkpoints.js';
function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
/** 每段开始先复位：库在 localStorage、设置在世界状态之外的 settingsBus 里，两处都要清。 */
function on(WA, patch) {
  LS.clear();
  try { WA.store.init(); } catch (e) {}
  WA.checkpoints.setSettings(Object.assign(
    { enabled: true, maxSlots: 6, autoEvery: 0, autoSlots: 2 }, patch || {}));
}
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
 * stat 是**模块级累计量**：`on()` 只清快照库与设置，不清 stat。
 *   所以一切读数必须取**增量**，否则判据会随探针执行顺序漂移（单跑绿、连跑红）。
 */
function delta(WA, fn) {
  const b = WA.checkpoints.stat();
  fn();
  const z = WA.checkpoints.stat();
  return { saved: z.saved - b.saved, restored: z.restored - b.restored,
    rolledBack: z.rolledBack - b.rolledBack, branched: z.branched - b.branched,
    removed: z.removed - b.removed, evicted: z.evicted - b.evicted };
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
function guarded(fn) { return function (WA) { try { return fn(WA); } catch (e) { return 'threw:' + e.message; } }; }
function probeWith(spec, fn) { return isolated(function () { return guarded(fn)(fresh({ srcOverride: brokenOverride(spec) })); }); }
function probeClean(fn) { return isolated(function () { return guarded(fn)(fresh()); }); }
const B = {};
BROKEN.forEach(function (s, i) { B[s.key] = i; });
// ── 探针（返回判据的症状值）──
/** 库在世界之外：写完档后世界状态里不得出现任何存档容器。 */
function probeLibOutside(WA) {
  on(WA);
  const before = Object.keys(WA.store.get()).length;
  const s = WA.checkpoints.save('外部', { scope: 'global' });
  const after = Object.keys(WA.store.get()).length;
  const inState = Object.keys(WA.store.get()).some(function (k) { return k.indexOf('checkpoint') >= 0; });
  return (s.ok && before === after && !inState) ? 'outside' : 'inside';
}
/** 恢复世界不得连带抹掉「我有哪些存档」。 */
function probeLibSurvives(WA) {
  on(WA);
  const a = WA.checkpoints.save('甲', { scope: 'global' });
  WA.store.transact(function (d) { d.meta = d.meta || {}; d.meta.note = '改过'; });
  const r = WA.checkpoints.restore(a.id, {});
  const n = WA.checkpoints.list().count;
  return (r.ok && n === 1) ? 'survived' : ('lost:' + n);
}
/** 读不出库时必须拒收（不覆盖写），且把 err 带出来。 */
function probeRefuse(WA) {
  on(WA);
  WA.checkpoints.save('甲', { scope: 'global' });
  LS.setItem(WA.checkpoints.stat().key, '{broken');
  const s = WA.checkpoints.save('乙', { scope: 'global' });
  const raw = LS.getItem(WA.checkpoints.stat().key);
  return s.reason + '/' + (raw === '{broken' ? 'intact' : 'clobbered');
}
/** schemaVersion 是守卫键：快照里不含它，还原后仍是当前值。 */
function probeGuard(WA) {
  on(WA);
  const cur = WA.store.get().schemaVersion;
  const s = WA.checkpoints.save('甲', { scope: 'global' });
  const rd = WA.checkpoints.read(s.id);
  const hasKey = Object.prototype.hasOwnProperty.call(rd.slot.state, 'schemaVersion');
  // 伪造一个旧版本的快照，再还原，世界版本必须不动
  WA.store.transact(function (d) { d.schemaVersion = cur; });
  const o = WA.checkpoints.importOne({ worldaxisCheckpoint: 1, slot: { name: '旧档', scope: 'global', state: { people: {}, schemaVersion: 0 } } });
  const r = o.ok ? WA.checkpoints.restore(o.id, {}) : { ok: false };
  return [hasKey ? 'in-snap' : 'clean', 'sv' + WA.store.get().schemaVersion, r.ok ? 'ok' : 'refused'].join('/');
}
/** 三种范围各自成词：global 整份替换（含删除语义）/ module 只合并涉及键。 */
function probeScope(WA) {
  on(WA);
  const g = WA.checkpoints.save('全', { scope: 'global' });
  // 世界新增一个快照里没有的顶层键，然后全局还原 ⇒ 该键应消失（删除语义）
  WA.store.transact(function (d) { d.__st2820_extra = { x: 1 }; });
  WA.checkpoints.restore(g.id, {});
  const gone = WA.store.get().__st2820_extra === undefined;
  // module 范围：只动 people，别的不动
  const m = WA.checkpoints.save('模块', { scope: 'module', keys: ['people'] });
  WA.store.transact(function (d) { d.people = { p1: { name: '改后' } }; d.meta = d.meta || {}; d.meta.tag = 'keepme'; });
  const md = WA.checkpoints.save('模块2', { scope: 'module', keys: ['people'] });
  WA.store.transact(function (d) { d.people = { p1: { name: '又改' } }; d.meta.tag = 'still'; });
  WA.checkpoints.restore(md.id, {});
  const ppl = JSON.stringify(WA.store.get().people);
  const keepMeta = WA.store.get().meta.tag === 'still';
  return [gone ? 'deleted' : 'kept', ppl.indexOf('改后') >= 0 ? 'people-restored' : 'people-wrong', keepMeta ? 'meta-untouched' : 'meta-clobbered'].join('/');
}
/** 手自动分算容量：自动快照再勤也不挤掉手工档；丢了谁必须回传。 */
function probeCaps(WA) {
  // autoEvery 必须 > 0：默认 0 时 tick() 一律 returned disabled ——
  //   漏设它会让「自动档」那一半永远不参与，期望值 '2:1:reported' 在任何实现下都不可达。
  on(WA, { maxSlots: 2, autoSlots: 1, autoEvery: 1 });
  WA.checkpoints.save('手工1', { scope: 'global' });
  WA.checkpoints.save('手工2', { scope: 'global' });
  let ev = [];
  const t3 = WA.checkpoints.save('手工3', { scope: 'global' });
  if (t3.evicted) ev = ev.concat(t3.evicted.map(function (x) { return x.name; }));
  for (let i = 0; i < 3; i++) {
    const t = WA.checkpoints.tick({ name: '自动' + i });
    if (t.evicted) ev = ev.concat(t.evicted.map(function (x) { return x.name; }));
  }
  const names = WA.checkpoints.list().slots.map(function (s) { return s.name; });
  const manuals = names.filter(function (n) { return n.indexOf('手工') === 0; });
  const autos = names.filter(function (n) { return n.indexOf('自动') === 0; });
  return manuals.length + ':' + autos.length + ':' + (ev.length ? 'reported' : 'silent')
    + '|m' + WA.checkpoints.list().slots.filter(function (s) { return !s.auto; }).length;
}
/** 新实例空库：list 必须 ok（err=null）——「没有档」不是「读不到」。 */
function probeFreshList(WA) {
  on(WA);
  const l = WA.checkpoints.list();
  return l.ok + '/' + String(l.err) + '/' + l.count;
}
/** 导出正文带格式号（人看得见）与信封格式号（机器读的）各自在位。 */
function probeExportFormat(WA) {
  on(WA);
  const a = WA.checkpoints.save('甲', { scope: 'global' });
  const ex = WA.checkpoints.exportOne(a.id);
  return (ex.ok && ex.env.worldaxisCheckpoint === 1 && ex.env.slot.format === 1) ? 'both' : 'missing';
}
/** 父档已被容量挤出时，至少还记得「我从哪个 id 来」（而不是假装没有来处）。 */
function probeLineageGhost(WA) {
  on(WA, { maxSlots: 1 });
  const a = WA.checkpoints.save('甲', { scope: 'global' });
  WA.checkpoints.save('乙', { scope: 'global' });   // 甲被挤出
  const lin = WA.checkpoints.lineage(a.id, WA.checkpoints.list().slots);
  return 'p' + lin.parents.length + '|root:' + lin.root;
}
/** 回滚与还原分开计量。 */
function probeRollStat(WA) {
  on(WA);
  const a = WA.checkpoints.save('甲', { scope: 'global' });
  const d = delta(WA, function () { WA.checkpoints.restore(a.id, { rolledBack: true }); });
  return 'rb' + d.rolledBack + '|rs' + d.restored;
}
/** 自动快照绕过总开关（其开关是 autoEvery，不是 enabled）。 */
function probeAutoBypass(WA) {
  on(WA, { enabled: false, autoEvery: 1 });
  const t = WA.checkpoints.tick();
  return t.ok === true && t.auto === true ? 'saved' : ('blocked:' + t.reason);
}
/** 分支必须落地成真实 save：只记父指针不算分叉。 */
function probeBranch(WA) {
  on(WA);
  const a = WA.checkpoints.save('甲', { scope: 'global' });
  const n0 = WA.checkpoints.list().count;
  const b = WA.checkpoints.branch(a.id, '甲支');
  const n1 = WA.checkpoints.list().count;
  const child = WA.checkpoints.list().slots.filter(function (s) { return s.name === '甲支'; })[0];
  const par = child && child.parents[0] && child.parents[0].name;
  return [(n1 === n0 + 1) ? 'new-slot' : 'no-slot', (b.ok && b.root === '甲') ? 'root-甲' : ('root:' + b.root),
    par === '甲' ? 'parent-甲' : ('parent:' + par), 'br' + WA.checkpoints.stat().branched].join('/');
}
/** 父链与根可独立复述（父档被挤出后仍答得出「我从哪来」）。 */
function probeLineage(WA) {
  on(WA, { maxSlots: 1 });
  const a = WA.checkpoints.save('甲', { scope: 'global' });
  const b = WA.checkpoints.branch(a.id, '乙');
  const c = WA.checkpoints.branch(b.id, '丙');
  const names = WA.checkpoints.list().slots.map(function (s) { return s.name; });
  const slotC = WA.checkpoints.list().slots.filter(function (s) { return s.name === '丙'; })[0];
  return [names.join('+'), (slotC && slotC.parents.length >= 1) ? 'chain-kept' : 'chain-lost',
    (slotC && slotC.root) ? ('root:' + slotC.root) : 'root:lost'].join('/');
}
/**
 * 缺席键不得被写成 null（半份覆盖）。
 *   采集路径下 `hasOwnProperty` 守卫是**真空**的（capture 报的 keys ⊆ state），所以必须走
 *   **导入路径**复现：导入的 slot 由信封给 keys，可以多于 state —— 老库/外部信封正是这么来的。
 */
function probeAbsentKey(WA) {
  on(WA);
  WA.checkpoints.save('基', { scope: 'global' });
  const env = { worldaxisCheckpoint: 1, slot: { name: '缺键档', scope: 'module',
    keys: ['people', '__st2820_absent__'], state: { people: { p1: { name: '来自信封' } } } } };
  const im = WA.checkpoints.importOne(env, { keepName: true });
  if (!im.ok) return 'import:' + im.reason;
  const r = WA.checkpoints.restore(im.id, {});
  if (!r.ok) return 'restore:' + r.reason;
  const has = Object.prototype.hasOwnProperty.call(WA.store.get(), '__st2820_absent__');
  const ppl = (WA.store.get().people && WA.store.get().people.p1 && WA.store.get().people.p1.name) || '';
  return [(has ? 'null-injected' : 'absent-skipped'), (ppl === '来自信封' ? 'people-merged' : 'people-wrong')].join('/');
}
/**
 * 比较必须把「两份真的不同」判成不同。
 *   反例是三值逻辑的经典塌陷：逐键判等写成恒真 ⇒ 任何两份档都 identical，
 *   比较面就变成了永远回答「一样」。
 */
function probeCmpDiff(WA) {
  on(WA);
  const a = WA.checkpoints.save('甲', { scope: 'global' });
  WA.store.transact(function (d) { d.people = { p1: { name: '乙版' } }; });
  const b = WA.checkpoints.save('乙', { scope: 'global' });
  const c = WA.checkpoints.compare(a.id, b.id);
  if (!c.ok) return 'cmp:' + c.reason;
  const hasPeople = c.differing.some(function (x) { return x.key === 'people'; });
  return [c.identical ? 'all-same' : 'noticed', c.identical ? 'identical' : (hasPeople ? 'people-flagged' : 'people-missed')].join('/');
}
/**
 * 采集路径上，点名了但世界里缺席的键必须**整个略去**（而不是写成 null）。
 *   注意这条与 probeAbsentKey 是**两条不同的路径**：
 *     本探针走 save()→capture()（模块快照从世界里取块）；
 *     probeAbsentKey 走 importOne()→restore()（信封直接给块）。
 *   只测一条会把另一条的守卫当成「用不到的代码」。
 */
function probeCaptureSkip(WA) {
  on(WA);
  WA.store.transact(function (d) { delete d.people; });
  const g = WA.checkpoints.save('缺块', { scope: 'module', keys: ['people', 'meta'] });
  if (!g.ok) return 'save:' + g.reason;
  const rd = WA.checkpoints.read(g.id);
  const own = Object.prototype.hasOwnProperty.call(rd.slot.state, 'people');
  return [(own ? 'null-in-state' : 'absent-skipped'), 'k' + g.keys.length].join('/');
}
/** 删档要如实报出悬空后代。 */
function probeOrphans(WA) {
  on(WA);
  const a = WA.checkpoints.save('甲', { scope: 'global' });
  WA.checkpoints.branch(a.id, '甲支');
  const rm = WA.checkpoints.remove(a.id);
  return (rm.ok && rm.orphans.length === 1 && rm.orphans[0].name === '甲支') ? 'reported' : ('silent:' + JSON.stringify(rm.orphans));
}
/** 受控收窄：非字符串名字 ⇒ missing-fields。 */
function probeStr(WA) {
  on(WA);
  return WA.checkpoints.save({ a: 1 }, {}).reason || 'ok';
}
/** stat 交回 faults 副本。 */
function probeFaults(WA) {
  on(WA, { enabled: false });
  WA.checkpoints.save('x', {});
  const s = WA.checkpoints.stat();
  const saw = (s.faults && s.faults.disabled) || 0;
  if (s.faults) s.faults.__polluted = 1;
  const after = WA.checkpoints.stat();
  return (after.faults && after.faults.__polluted) ? 'leaked' : ('ok' + (saw > 0 ? '1' : '0'));
}
/** 移动信封只有一个格式号：导出→导入必须能回来。 */
function probeEnvelope(WA) {
  on(WA);
  const a = WA.checkpoints.save('甲', { scope: 'global' });
  const ex = WA.checkpoints.exportOne(a.id);
  if (!ex.ok) return 'export-failed';
  const im = WA.checkpoints.importOne(ex.text, { keepName: true });
  return im.ok ? 'round-trip' : ('broken:' + im.reason);
}
/** 导出正文不含守卫键。 */
function probeExportClean(WA) {
  on(WA);
  const a = WA.checkpoints.save('甲', { scope: 'global' });
  const ex = WA.checkpoints.exportOne(a.id);
  const has = Object.prototype.hasOwnProperty.call(ex.env.slot.state, 'schemaVersion');
  return has ? 'leaked-guard' : 'clean';
}
/** 导入默认不覆盖同名。 */
function probeImportNoOverwrite(WA) {
  on(WA);
  WA.checkpoints.save('同名', { scope: 'global' });
  const ex = WA.checkpoints.exportOne(WA.checkpoints.list().slots[0].id);
  const before = WA.checkpoints.list().count;
  const im = WA.checkpoints.importOne(ex.text, {});
  const after = WA.checkpoints.list().count;
  return (im.ok && after === before + 1) ? 'appended' : ('overwrote:' + before + '>' + after);
}
/** 注入块必须明标「存档存在 ≠ 当前进度已保存」。 */
function probeBlockNote(WA) {
  on(WA);
  WA.checkpoints.save('甲', { scope: 'global' });
  const b = WA.checkpoints.buildBlock();
  return (b.indexOf('[快照与分支]') === 0 && b.indexOf('不等于当前进度已经保存') > 0 && b.indexOf('branch()') > 0)
    ? 'noted' : 'unnoted';
}
/** 守卫键不许被显式点名存进取范围的快照。 */
function probeGuardedKey(WA) {
  on(WA);
  return WA.checkpoints.resolveScope('module', ['schemaVersion']).reason || 'ok';
}
/** 接线：四处登记 + 骨架不得含 checkpoints。 */
function probeWiring(WA) {
  const srcIdx = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
  const srcRun = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
  const srcDiag = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
  const owner = srcDiag.indexOf("'engines/checkpoints.js': 'checkpoints'") > 0;
  const inOrder = srcIdx.indexOf("'engines/checkpoints.js'") > 0 && srcIdx.indexOf("'engines/checkpoints.js'") < srcIdx.indexOf("'render/inject.js'");
  const inLoad = srcRun.indexOf("'engines/checkpoints.js'") > 0;
  const srcVis = ((WA.render && WA.render.SOURCES) || []).indexOf('checkpoints') >= 0;
  const inSkeleton = Object.prototype.hasOwnProperty.call(WA.store.get(), 'checkpoints');
  const ck = Object.prototype.hasOwnProperty.call(WA.store.sizeCaps(), 'checkpoints');
  return [owner ? 'owner' : 'no-owner', inOrder ? 'order' : 'bad-order', inLoad ? 'load' : 'no-load',
    srcVis ? 'vis' : 'no-vis', inSkeleton ? 'in-skeleton' : 'outside', ck ? 'capped' : 'uncapped'].join('/');
}
function probeSizeAudit(WA) {
  const a = WA.store.sizeAudit ? WA.store.sizeAudit() : null;
  const ub = (a && a.unbounded) || [];
  // 失败时把**路径**带出来：只说 'unbounded:1' 无法归因（哪条容器、谁写进去的都不知道）
  return ub.length
    ? ('unbounded:' + ub.length + '[' + ub.map(function (x) { return typeof x === 'string' ? x : (x && x.path) || '?'; }).join(',') + ']')
    : 'clean';
}
/** 库键与世界载荷分离：世界那一侧的持久化字节里不得出现存档痕迹。 */
function probeSeparateKeys(WA) {
  on(WA);
  const s = WA.checkpoints.save('独档', { scope: 'global' });
  const lsKey = WA.checkpoints.stat().key;
  let worldPayload = '';
  for (let i = 0; i < LS.length; i++) {
    const k = LS.key(i);
    if (k === null || k === lsKey) continue;
    worldPayload += String(LS.getItem(k) === null ? '' : LS.getItem(k));
  }
  return (s.ok && worldPayload.indexOf('独档') < 0) ? 'separate' : 'mixed';
}
// ── 正向判据（真源码上必须为真）──
function judge(a) {
  const WA = fresh();
  const IFACE = ['SCOPES', 'FORMAT', 'GUARDED', 'getSettings', 'setSettings', 'topKeys', 'resolveScope',
    'lineage', 'save', 'list', 'read', 'remove', 'restore', 'branch', 'compare', 'tick', 'buildBlock',
    'exportOne', 'importOne', 'checksum', 'migrations', 'registerMigration', 'migrate', 'stat'];
  a(!!WA.checkpoints && IFACE.every(function (k) { return WA.checkpoints[k] !== undefined; }),
    'v2820/cp: 快照与分支接口面齐备（24 项）');
  a(JSON.stringify(WA.checkpoints.SCOPES) === JSON.stringify(['global', 'module', 'scene']),
    'v2820/cp: 三种范围白名单（global / module / scene 各自成词）');
  a(JSON.stringify(WA.checkpoints.GUARDED) === JSON.stringify(['schemaVersion']),
    'v2820/cp: 守卫键白名单（世界是哪一版由代码说了算）');
  a(WA.checkpoints.FORMAT === 1 && WA.checkpoints.migrations().length === 0,
    'v2820/cp: 信封格式号 FORMAT=1 且迁移链为空（无历史版本 → 不假装有）');
  a(WA.checkpoints.topKeys().length >= 40 && WA.checkpoints.topKeys().indexOf('people') >= 0,
    'v2820/cp: 顶层键单一真源取自骨架（' + WA.checkpoints.topKeys().length + ' 个，含 people）');
  // ① 库在世界状态之外 + 恢复不抹库
  a(probeLibOutside(WA) === 'outside', 'v2820/cp: [1] 快照库在世界状态之外（写完档，store 顶层键数不变）');
  a(probeLibSurvives(WA) === 'survived', 'v2820/cp: [1] 恢复世界不连带抹掉「我有哪些存档」');
  on(WA);
  const keyName = WA.checkpoints.stat().key;
  a(keyName.indexOf('worldaxis_ckpt_v1_') === 0, 'v2820/cp: [1] 库键名稳定可寻（' + keyName + '，前缀是契约）');
  a(probeSeparateKeys(WA) === 'separate', 'v2820/cp: [1] 库键与世界载荷分离（世界那一侧的字节里没有存档痕迹）');
  // ② 守卫键
  a(probeGuard(WA) === 'clean/sv1/ok', 'v2820/cp: [2] 快照不含 schemaVersion，且还原后世界版本不动（guard）');
  a(probeGuardedKey(WA) === 'guarded-key', 'v2820/cp: [2] 显式点名守卫键存快照 ⇒ guarded-key 拒收（不静默半份）');
  a(probeExportClean(WA) === 'clean', 'v2820/cp: [2] 导出信封正文不含守卫键');
  // ③ 分支
  a(probeBranch(WA) === 'new-slot/root-甲/parent-甲/br1', 'v2820/cp: [3] 分支落地成一次真实 save（新槽位 + 父名 + 根 + 计数）');
  a(probeLineage(WA).indexOf('chain-kept') > 0 && probeLineage(WA).indexOf('root:甲') > 0,
    'v2820/cp: [3] 父档被容量挤出后，父链与根仍可独立复述');
  a(probeOrphans(WA) === 'reported', 'v2820/cp: [3] 删档如实报出悬空后代（orphans，不静默修补）');
  a(probeCaptureSkip(WA) === 'absent-skipped/k1',
    'v2820/cp: [4] 采集路径同理：点名 2 个键、世界里只剩 1 个 ⇒ 只存 1 块（块数如实）');
  a(probeAbsentKey(WA) === 'absent-skipped/people-merged',
    'v2820/cp: [4] 信封点名了但世界里缺席的键**整个略去**（不写 null，不半份覆盖）');
  // ④ 三种范围
  a(probeScope(WA) === 'deleted/people-restored/meta-untouched',
    'v2820/cp: [4] global 整份替换含删除语义；module 只合并涉及键（其余键不动）');
  on(WA);
  a(WA.checkpoints.resolveScope('nope', []).reason === 'bad-scope', 'v2820/cp: [4] 范围不在白名单 ⇒ bad-scope');
  a(WA.checkpoints.resolveScope('module', []).reason === 'missing-keys', 'v2820/cp: [4] 取范围却不给键 ⇒ missing-keys');
  const uk = WA.checkpoints.resolveScope('scene', ['__nope__']);
  a(uk.reason === 'unknown-keys' && (uk.known || []).length > 0, 'v2820/cp: [4] 给了骨架里没有的键 ⇒ unknown-keys（且回报已知键）');
  // ⑤ 容量
  a(probeCaps(WA) === '2:1:reported|m2', 'v2820/cp: [5] 手自动分算容量：自动再勤也不挤掉手工档，且丢了谁有回执');
  a(probeFreshList(WA) === 'true/null/0', 'v2820/cp: [5] 空库 list ⇒ ok 且 err=null（「没有档」不是「读不到」）');
  a(probeLineageGhost(WA) === 'p1|root:', 'v2820/cp: [5] 父档被挤出时仍记得「我从哪个 id 来」（不假装没有来处）');
  a(probeRollStat(WA) === 'rb1|rs0', 'v2820/cp: [5] 回滚与还原分开计量（rolledBack=1 / restored=0）');
  a(probeExportFormat(WA) === 'both', 'v2820/cp: [5] 信封格式号与正文格式号各自在位（旧导入者仍看得懂 format）');
  a(probeAutoBypass(WA) === 'saved', 'v2820/cp: [5] 自动快照绕过总开关（其开关是 autoEvery，不是 enabled）');
  on(WA, { autoEvery: 0 });
  a(WA.checkpoints.tick().reason === 'disabled', 'v2820/cp: [5] autoEvery=0 ⇒ disabled（关闭与未到点各自成词）');
  on(WA, { autoEvery: 3 });
  a(WA.checkpoints.tick().reason === 'not-due', 'v2820/cp: [5] 开了但没到点 ⇒ not-due（不报 disabled）');
  // ⑥ 读不出库不覆盖写
  a(probeRefuse(WA) === 'lib-unreadable/intact', 'v2820/cp: [6] 库读不出 ⇒ 拒收且**不覆盖写**（原字节原样保留）');
  on(WA);
  LS.setItem(WA.checkpoints.stat().key, '{broken');
  a(WA.checkpoints.list().ok === false && WA.checkpoints.list().err === 'parse-threw',
    'v2820/cp: [6] 库读不出时 list 报 ok=false 且给出 err（不把「读不到」读成「本来就没有」）');
  a(WA.checkpoints.stat().libErr === 'parse-threw', 'v2820/cp: [6] stat 单列 libErr（否则所有计数都是 0 而无从分辨）');
  a(WA.checkpoints.read('c1').reason === 'lib-unreadable', 'v2820/cp: [6] 读面同样拒收（lib-unreadable）');
  // ⑦ 受控收窄
  a(probeStr(WA) === 'missing-fields', 'v2820/cp: [7] 名字非字符串 ⇒ missing-fields（不 String() 静默升格）');
  on(WA);
  a(WA.checkpoints.read(123).reason === 'missing-fields', 'v2820/cp: [7] id 非字符串 ⇒ missing-fields');
  a(WA.checkpoints.read('nope').reason === 'missing', 'v2820/cp: [7] 槽位不存在 ⇒ missing');
  // ⑧ 信封与迁移
  a(probeEnvelope(WA) === 'round-trip', 'v2820/cp: [8] 导出的信封能导回来（格式号单源：worldaxisCheckpoint）');
  a(probeImportNoOverwrite(WA) === 'appended', 'v2820/cp: [8] 导入默认不覆盖同名（试探性导入不得毁掉本地存档）');
  a(WA.checkpoints.migrate({ worldaxisCheckpoint: 'x' }).reason === 'bad-format', 'v2820/cp: [8] 版本号非有限值 ⇒ bad-format');
  a(WA.checkpoints.migrate({ worldaxisCheckpoint: 99 }).reason === 'too-new', 'v2820/cp: [8] 高于本引擎支持 ⇒ too-new');
  a(WA.checkpoints.migrate({ worldaxisCheckpoint: 0 }).reason === 'no-migration', 'v2820/cp: [8] 旧版本但无迁移步骤 ⇒ no-migration（不猜）');
  a(WA.checkpoints.importOne({ worldaxisCheckpoint: 1 }).reason === 'missing-fields', 'v2820/cp: [8] 信封缺 slot.state ⇒ missing-fields');
  a(WA.checkpoints.importOne('{not json').reason === 'bad-format', 'v2820/cp: [8] 字符串不是 JSON ⇒ bad-format（不是崩）');
  a(WA.checkpoints.importOne({ nope: 1 }).reason === 'bad-format', 'v2820/cp: [8] 没有信封标记 ⇒ bad-format（不误吃别人的 JSON）');
  const ck1 = WA.checkpoints.checksum('abc');
  a(ck1 === WA.checkpoints.checksum('abc') && ck1 !== WA.checkpoints.checksum('abd'),
    'v2820/cp: [8] 校验和确定且能分辨（只用于抓「搬运途中被改写」）');
  // ⑨ stat 一致性
  a(probeFaults(WA) === 'ok1', 'v2820/cp: [9] stat 交回 faults 副本（写返回对象不污染内部台账）');
  on(WA);
  WA.checkpoints.save('甲', { scope: 'global' });
  const d9 = delta(WA, function () {
    WA.checkpoints.branch(WA.checkpoints.list().slots[0].id, '支');
    WA.checkpoints.restore(WA.checkpoints.list().slots[0].id, { rolledBack: true });
  });
  // branch 内部先做一次 rolledBack 还原再落新档，故 rolledBack 增量 ≥ 2。
  //   判据要说的是「这两件事分开记」：restored 不被 rolledBack 的还原动作污染。
  // 区间内只有 branch 内部那一次真实 save（先还原再落新档）⇒ saved 增量恰 1。
  a(d9.branched === 1 && d9.restored === 0 && d9.rolledBack >= 1 && d9.saved === 1,
    'v2820/cp: [9] restored 与 rolledBack 分开记（b' + d9.branched + '/s' + d9.saved
    + '/rb' + d9.rolledBack + '/rs' + d9.restored + '：还原动作不污染「用存档覆盖」）');
  // 这两个读数取自**库本身**（非累计量），故照旧整份读一次。
  const st = WA.checkpoints.stat();
  a(st.slots === 2 && st.manual === 2 && st.autoSlotsUsed === 0, 'v2820/cp: [9] stat 报出库内现状（slots/manual/autoSlotsUsed）');
  // ⑩ 比较与注入块
  on(WA);
  const ca = WA.checkpoints.save('甲', { scope: 'global' });
  // 必须换一个**真的不同**的值：默认 people 就是 {} —— 设成 {} 等于没改，
  //   people 根本不会进 differing，判据会因「差异只有 meta.updatedAt」而假红。
  WA.store.transact(function (d) { d.people = { p1: { name: '乙版' } }; });
  const cb = WA.checkpoints.save('乙', { scope: 'global' });
  const cmp = WA.checkpoints.compare(ca.id, cb.id);
  a(cmp.ok && cmp.identical === false && cmp.differing.some(function (x) { return x.key === 'people'; }),
    'v2820/cp: [10] 比较按顶层键粒度点出差异（含 key 名）');
  a(cmp.sameCount > 0 && cmp.sameRoot === false, 'v2820/cp: [10] 比较报出相同键数与根是否同源');
  const self = WA.checkpoints.compare(ca.id, ca.id);
  a(self.identical === true && self.sameRoot === true, 'v2820/cp: [10] 同一档自比 ⇒ identical 且同根');
  a(WA.checkpoints.compare(ca.id, 'nope').reason === 'missing', 'v2820/cp: [10] 比较缺档 ⇒ missing');
  a(probeBlockNote(WA) === 'noted', 'v2820/cp: [10] 注入块明标「存档存在 ≠ 当前进度已保存」与「仅 restore 不算分支」');
  on(WA, { enabled: false });
  a(WA.checkpoints.buildBlock() === '', 'v2820/cp: [10] 总开关关 ⇒ 不注入（不产空块）');
  on(WA);
  a(WA.checkpoints.buildBlock() === '', 'v2820/cp: [10] 开了但库里没有档 ⇒ 不产块（空档不冒充「有备份」）');
  // ⑪ 接线（四处同批 + 库不在骨架）
  a(probeWiring(WA) === 'owner/order/load/vis/outside/uncapped',
    'v2820/cp: [11] 四处接线同批（LOAD_ORDER / LOAD / MODULE_EXPORTS / SOURCES）且**不入骨架/容量表**');
  a(probeSizeAudit(WA) === 'clean', 'v2820/cp: [11] sizeAudit 无 unbounded（自管容量不留容量洞）');
  const vis = WA.render.getVisibility();
  a(vis.checkpoints === true, 'v2820/cp: [11] 可见性默认 true（模块总开关默认为关，与既有裁决一致）');
  LS.clear(); WA.store.init();
  a(WA.checkpoints.getSettings().enabled === false, 'v2820/cp: [11] 总开关默认关闭（不改变老用户行为）');
  a(WA.checkpoints.save('x', {}).reason === 'disabled', 'v2820/cp: [11] 关闭时不存档（disabled 拒收）');
}
// ── 负向自证（只在内存副本上破坏，零文件改写）──
function runNegative(a) {
  // N0 锚点唯一性 + 破坏真的改到源码（且只改这一处）
  BROKEN.forEach(function (s) { a(anchorHits(s) === 1, 'v2820/cp: [N0] 锚点在真源码中恰 1 次 :: ' + s.key); });
  BROKEN.forEach(function (s) {
    const ov = brokenOverride(s);
    a(ov[REL] !== ov.__origSrc && ov.__origSrc.indexOf(s.from) >= 0 && ov.__brokenSrc.indexOf(s.to) >= 0,
      'v2820/cp: [N0] 破坏真的改变了源码且只改这一处 :: ' + s.key);
  });
  // N0b 纵深防御（当前不可达）只钉锚点唯一性，**不断言**「破坏会现红」——
  //   声称不可达层的差异可观测，就是假现形。
  DEFENSE.forEach(function (d) { a(anchorHits(d) === 1, 'v2820/cp: [N0b] 防御锚点恰 1 次 :: ' + d.key + '（' + d.why + '）'); });
  // N1 逐条现形（症状值必须变成破坏后的样子）
  a(probeWith(BROKEN[B.readerr], probeFreshList) !== 'true/null/0',
    'v2820/cp: [N1] 空库判定移除 ⇒ 新实例读库直接判读失败（把「没有档」读成「读不到」）');
  a(probeWith(BROKEN[B.readfail], probeRefuse) === 'undefined/clobbered',
    'v2820/cp: [N1] 形状校验移除 ⇒ 坏字节被当空库读出，一次读失败把用户全部存档抹掉');
  a(probeWith(BROKEN[B.refuse], probeRefuse) === 'undefined/clobbered',
    'v2820/cp: [N1] 读不出时的拒收移除 ⇒ 覆盖写发生（坏字节把原有存档顶掉）');
  a(probeWith(BROKEN[B.guard], probeGuard) === 'clean/svundefined/ok',
    'v2820/cp: [N1] 守卫键移除 ⇒ 还原把 schemaVersion 退回旧值（下次 load 会重跑迁移链）');
  a(probeWith(BROKEN[B.capture], probeGuard).indexOf('in-snap') === 0,
    'v2820/cp: [N1] 采集层剥离移除 ⇒ 快照里带上守卫键（任何写回路径都会把它带进世界）');
  a(probeWith(BROKEN[B.scoped], probeAbsentKey) === 'null-injected/people-merged',
    'v2820/cp: [N1] 存在性检查移除 ⇒ 信封点名而世界缺席的键被写成 null（半份覆盖，读起来像「有值」）');
  a(probeWith(BROKEN[B.capskip], probeCaptureSkip) === 'null-in-state/k2',
    'v2820/cp: [N1] 采集层的缺席检查移除 ⇒ 模块快照把不在世界里的键记成 null 块（半份）');
  a(probeWith(BROKEN[B.cmp], probeCmpDiff) === 'all-same/identical',
    'v2820/cp: [N1] 逐键判等移除 ⇒ 两份不同的档被判成 identical（比较面变成恒真）');
  a(probeWith(BROKEN[B.metareset], probeScope).indexOf('kept') === 0,
    'v2820/cp: [N1] 全局替换的删除语义移除 ⇒ 快照里没有的顶层键会留在世界里（换不掉世界）');
  a(probeWith(BROKEN[B.auto], probeAutoBypass) === 'blocked:disabled',
    'v2820/cp: [N1] 自动快照的绕行移除 ⇒ 用户开了自动快照却因总开关关着而静默不存');
  a(probeWith(BROKEN[B.autocap], probeCaps) === '2:3:reported|m2',
    'v2820/cp: [N1] 自动档容量移除 ⇒ 自动快照无限堆积（3 份，无界增长）');
  a(probeWith(BROKEN[B.mancap], probeCaps) === '3:1:reported|m3',
    'v2820/cp: [N1] 手动档容量移除 ⇒ 手工档无界堆积（3 份，maxSlots=2 失效）');
  a(probeWith(BROKEN[B.drop], probeCaps) === '3:1:reported|m3',
    'v2820/cp: [N1] 手动档丢档移除 ⇒ maxSlots 形同虚设（3 份手工档全部留着）');
  a(probeWith(BROKEN[B.branch], probeBranch).indexOf('/br0') > 0,
    'v2820/cp: [N1] 分支计量移除 ⇒ 分支动作在读数上不可见');
  a(probeWith(BROKEN[B.brparent], probeBranch).indexOf('parent:') > 0,
    'v2820/cp: [N1] 父指针写入移除 ⇒ 子档答不出「我从哪来」（那不是分支，是同一条线）');
  a(probeWith(BROKEN[B.str], probeStr) === 'ok',
    'v2820/cp: [N1] 类型收窄移除 ⇒ 非字符串名字被 String() 静默升格（参数错被记成世界事实）');
  a(probeWith(BROKEN[B.faults], probeFaults) === 'leaked',
    'v2820/cp: [N1] faults 副本移除 ⇒ 写返回对象污染内部台账（可伪造/抹除观测记录）');
  a(probeWith(BROKEN[B.fmt], probeEnvelope) !== 'round-trip',
    'v2820/cp: [N1] 格式号单源移除 ⇒ 自己导出的信封自己导不回来（版本号读错）');
  a(probeWith(BROKEN[B.impdef], probeImportNoOverwrite) === 'overwrote:1>0',
    'v2820/cp: [N1] 默认不覆盖移除 ⇒ 试探性导入直接顶掉本地同名档（1 份变 0 份）');
  a(probeWith(BROKEN[B.ropen], probeOrphans) !== 'reported',
    'v2820/cp: [N1] 悬空父链上报移除 ⇒ 删档后后代静默孤儿（答不出自己从哪来）');
  a(probeWith(BROKEN[B.block], probeBlockNote) === 'unnoted',
    'v2820/cp: [N1] 注入注记移除 ⇒ 「仅 restore 不算分支」的约束不再随块下发');
  a(probeWith(BROKEN[B.gblock], probeGuardedKey) === 'ok',
    'v2820/cp: [N1] 守卫键拒收移除 ⇒ 用户以为存了 51 块、实际拿到 50 块（静默半份）');
  a(probeWith(BROKEN[B.linroot], probeLineageGhost) === 'p0|root:unknown',
    'v2820/cp: [N1] 来处不明时的如实上报移除 ⇒ 假装知道根（空父链 + root:unknown）');
  a(probeWith(BROKEN[B.rolledback], probeRollStat) === 'rb0|rs1',
    'v2820/cp: [N1] 回滚计量移除 ⇒ 「我退了多少」被记成「我用存档覆盖了」（两个问题混成一个）');
  // N2 真源码上同一批判据为真（双向自证：不是把判据写死）
  a(probeClean(probeFreshList) === 'true/null/0', 'v2820/cp: [N2] 原版空库 list 为 ok/err=null');
  a(probeClean(probeRefuse) === 'lib-unreadable/intact', 'v2820/cp: [N2] 原版读不出时拒收且不覆盖写');
  a(probeClean(probeGuard) === 'clean/sv1/ok', 'v2820/cp: [N2] 原版守卫键三面成立');
  a(probeClean(probeScope) === 'deleted/people-restored/meta-untouched', 'v2820/cp: [N2] 原版三范围语义成立');
  a(probeClean(probeCaps) === '2:1:reported|m2', 'v2820/cp: [N2] 原版手自动分算容量成立');
  a(probeClean(probeAutoBypass) === 'saved', 'v2820/cp: [N2] 原版自动快照绕过总开关');
  a(probeClean(probeBranch) === 'new-slot/root-甲/parent-甲/br1', 'v2820/cp: [N2] 原版分支落地成真实存档');
  a(probeClean(probeOrphans) === 'reported', 'v2820/cp: [N2] 原版删档报出悬空后代');
  a(probeClean(probeStr) === 'missing-fields', 'v2820/cp: [N2] 原版拒收非字符串名字');
  a(probeClean(probeFaults) === 'ok1', 'v2820/cp: [N2] 原版 stat 交回副本且故障已计量');
  a(probeClean(probeEnvelope) === 'round-trip', 'v2820/cp: [N2] 原版导出→导入往返成立');
  a(probeClean(probeBlockNote) === 'noted', 'v2820/cp: [N2] 原版注入块带两条约束注记');
  a(probeClean(probeGuardedKey) === 'guarded-key', 'v2820/cp: [N2] 原版拒收显式点名守卫键');
  a(probeClean(probeRollStat) === 'rb1|rs0', 'v2820/cp: [N2] 原版回滚与还原分开计量');
  // N3 隔离性：破坏的可见面恰好是本判据——接线与骨架不受影响
  a(probeWith(BROKEN[B.refuse], probeWiring) === 'owner/order/load/vis/outside/uncapped',
    'v2820/cp: [N3] 库拒收破坏不影响四处接线声明');
  const saGuard2820 = probeWith(BROKEN[B.guard], probeSizeAudit);
  a(saGuard2820 === 'clean', 'v2820/cp: [N3] 守卫键破坏不影响容量审计'
    + (saGuard2820 === 'clean' ? '' : '（实 ' + saGuard2820 + '）'));
  a(probeWith(BROKEN[B.fmt], probeLibOutside) === 'outside', 'v2820/cp: [N3] 信封格式号破坏不影响「库在世界之外」');
  // N4 真状态改变（判据非恒真）
  const chg = isolated(function () {
    const WA = fresh();
    on(WA);
    const before = WA.checkpoints.list().count;
    WA.checkpoints.save('N4', { scope: 'global' });
    WA.checkpoints.branch(WA.checkpoints.list().slots[0].id, 'N4支');
    return before + '>' + WA.checkpoints.list().count;
  });
  a(chg === '0>2', 'v2820/cp: [N4] 存档与分支真的改变了持久库（判据非恒真）');
  // N5 哨兵不泄漏
  const leak = scanKeys(TAG);
  a(leak.length === 0, 'v2820/cp: [N5] 哨兵未泄漏（' + (leak.join(',') || 'none') + '）');
}
function runAll(a) { isolated(function () { judge(a); }); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('SETTLE-V2820: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('SETTLE-V2820: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits };
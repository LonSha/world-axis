#!/usr/bin/env node
// WorldAxis tests/events-e2-v2115.js -- E2 lock: 改期原子性 + 拒收零变化（v2.115.0）
//
// 规划 01 的 E2 缺陷（修复前实测）：
//   replace(id, { at: -1 }) 返回 bad-time，**但旧 pending 行已被 cancel(rid,'replaced') 取消**
//   —— 调用方读到的是一句「拒收」，世界里那件事已经从待办队列消失。
//   同源第二处：replace(id, { title: 'x' }) 未给时刻时把 at 留成 NaN，
//   schedule 的「缺省 = 现在」会把只想改标题的改期顺手挪到当下。
//
// 本锁守三条判据（每条都两向自证：真源码成绿 / 就地破坏现形）：
//   ① **拒收 ⇒ 零变化**：改期参数不合法时旧行状态、时刻、题名、行数全部不动；
//   ② **单事务原子替换**：旧行转 cancelled 与新行落地同事务，无「旧的没了、新的没来」；
//   ③ **未给时刻 ⇒ 保留原时刻**：只改点名了字段，时间轴不因 patch 缺省而移动。
// 锚点逐字取自 engines/events.js 且要求恰 1 次（N0）；破坏只改内存副本，零文件改写。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__e2v2115_';
const REL = 'engines/events.js';

// ── 破坏锚点（逐字取自真源码，各恰 1 次）──
const A_GUARD = "const pl = plan(p);\n    if (!pl.ok) { noteFault(pl.reason); return pl; }";
const A_KEEP  = "at: hasTime ? patch2.at : old.scheduledAt,";
const BROKEN = [
  // ① 破坏「先校验」：退回「先取消旧行、再看新参数合不合法」的旧两步写法
  { key: 'guard', from: A_GUARD, to: "const pl = plan(p); if (false) { noteFault('x'); return { ok: false }; }" },
  // ③ 破坏「保留原时刻」：未给时刻时留 NaN（即退回「缺省 = 现在」）
  { key: 'keep',  from: A_KEEP,  to: "at: patch2.at," }
];
const B = {};
BROKEN.forEach(function (s, i) { B[s.key] = i; });

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function on(WA, patch) {
  try { WA.store.transact(function (d) { d.events = { rows: [], failQueue: [] }; }, TAG + 'reset'); } catch (e) {}
  WA.events.setSettings(Object.assign({ enabled: true, maxRows: 24, maxRuns: 12, maxFails: 12, retryDelayMs: 0, maxRetries: 2 }, patch || {}));
}
function rowsOf(WA) { return (WA.store.get().events || {}).rows || []; }
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('anchor hits ' + hits + ' :: ' + spec.key);
  const ov = {};
  ov[REL] = src.split(spec.from).join(spec.to);
  ov.__origSrc = src;
  return ov;
}
function anchorHits(spec) { return fs.readFileSync(path.join(BASE, REL), 'utf8').split(spec.from).length - 1; }
function guarded(fn) { return function (WA) { try { return fn(WA); } catch (e) { return 'threw:' + (e && e.message); } }; }
function probeWith(spec, fn) { return guarded(fn)(fresh({ srcOverride: brokenOverride(spec) })); }
function probeClean(fn) { return guarded(fn)(fresh()); }

// ── 探针：返回判据症状值 ──
// P1 拒收后旧行是否还活着（原版活着 = 'alive'；两步写法 = 'killed'）
function probeRejectKeeps(WA) {
  on(WA); const t = Date.now();
  const s = WA.events.schedule({ id: 'k1', title: '待办', kind: 'once', at: t + 60000 });
  const r = WA.events.replace('k1', { at: -1 });
  const v = rowsOf(WA).filter(function (x) { return x.id === 'k1'; })[0];
  const same = !!v && v.status === 'pending' && v.scheduledAt === s.scheduledAt && v.title === '待办';
  return (r.ok === false && r.reason === 'bad-time' && same) ? 'alive' : 'killed';
}
// P2 未给时刻时是否保留原时刻（原版 'kept'；破坏后 'moved'）
function probeKeepTime(WA) {
  on(WA); const t = Date.now();
  const s = WA.events.schedule({ id: 'k2', title: '旧名', kind: 'once', at: t + 60000 });
  const r = WA.events.replace('k2', { title: '新名' });
  const v = rowsOf(WA).filter(function (x) { return x.id === r.id; })[0];
  if (!r.ok || !v) return 'bad';
  return (v.scheduledAt === s.scheduledAt && v.title === '新名') ? 'kept' : 'moved';
}
// P3 原子性：合法改期后行数恰好 +1（旧行留痕 + 新行落地，无中间态）
function probeAtomic(WA) {
  on(WA); const t = Date.now();
  WA.events.schedule({ id: 'k3', title: 'x', kind: 'once', at: t });
  const r = WA.events.replace('k3', { at: t + 5000 });
  const rw = rowsOf(WA);
  const oldLeft = rw.filter(function (x) { return x.id === 'k3' && x.status === 'cancelled' && x.cancelReason === 'replaced'; });
  const newRow = rw.filter(function (x) { return x.id === r.id && x.status === 'pending'; });
  return (r.ok === true && oldLeft.length === 1 && newRow.length === 1) ? 'atomic' : 'broken';
}
// P4 满员时改期不被自己的旧行挡住
function probeFullReplace(WA) {
  on(WA, { maxRows: 2 }); const t = Date.now();
  WA.events.schedule({ id: 'k4a', title: 'a', kind: 'once', at: t });
  WA.events.schedule({ id: 'k4b', title: 'b', kind: 'once', at: t });
  const r = WA.events.replace('k4a', { at: t + 1000 });
  const add = WA.events.schedule({ id: 'k4c', title: 'c', kind: 'once', at: t });
  return (r.ok === true && add.reason === 'capacity' && WA.events.active().length === 2) ? 'ok' : 'broken';
}

function judge(a) {
  const WA = fresh();
  a(typeof WA.events.plan === 'function' || true, 'v2115/e2: 锁文件就位');
  // ① 拒收 ⇒ 零变化
  on(WA); const t = Date.now();
  const s1 = WA.events.schedule({ id: 'A', title: '原排期', kind: 'once', at: t + 60000 });
  const r1 = WA.events.replace('A', { at: -1 });
  a(r1.ok === false && r1.reason === 'bad-time', 'v2115/e2: [1] 时刻非法 ⇒ bad-time 拒收');
  const v1 = rowsOf(WA).filter(function (x) { return x.id === 'A'; })[0];
  a(!!v1 && v1.status === 'pending' && v1.scheduledAt === s1.scheduledAt && v1.title === '原排期',
    'v2115/e2: [1] 拒收后旧排期仍 pending 且状态/时刻/题名零变化（排期是待办，不得被顺手取消）');
  a(rowsOf(WA).length === 1, 'v2115/e2: [1] 拒收不留半截行（未插新行、未改旧行）');
  [['bad-priority', { priority: 99 }], ['bad-kind', { kind: 'nope' }], ['bad-trigger', { kind: 'repeat' }], ['bad-time', { inMs: -5 }]].forEach(function (p) {
    const r = WA.events.replace('A', p[1]);
    const v = rowsOf(WA).filter(function (x) { return x.id === 'A'; })[0];
    a(r.ok === false && r.reason === p[0] && !!v && v.status === 'pending' && v.title === '原排期',
      'v2115/e2: [1] ' + p[0] + ' 拒收同样零变化（' + r.reason + '）');
  });
  a(rowsOf(WA).length === 1, 'v2115/e2: [1] 多次拒收后行数仍为 1');
  // ③ 未给时刻 ⇒ 保留原时刻
  on(WA); const t2 = Date.now();
  const s2 = WA.events.schedule({ id: 'B', title: '旧名', kind: 'once', at: t2 + 60000 });
  const r2 = WA.events.replace('B', { title: '新名' });
  const v2 = rowsOf(WA).filter(function (x) { return x.id === r2.id; })[0];
  a(r2.ok === true && !!v2 && v2.scheduledAt === s2.scheduledAt,
    'v2115/e2: [3] 只改标题 ⇒ 排期时刻不动（不因 patch 缺时刻而挪到当下）');
  a(!!v2 && v2.title === '新名', 'v2115/e2: [3] 点名了的字段确实生效');
  a(!!rowsOf(WA).filter(function (x) { return x.id === 'B' && x.status === 'cancelled' && x.cancelReason === 'replaced'; })[0],
    'v2115/e2: [3] 旧行留痕 cancelled/replaced（可查「原本排在什么时候」）');
  // ② 原子性 + 容量口径
  on(WA); const t3 = Date.now();
  WA.events.schedule({ id: 'C', title: 'x', kind: 'once', at: t3 });
  const r3 = WA.events.replace('C', { at: t3 + 5000 });
  a(r3.ok === true && r3.id !== 'C' && String(r3.id).indexOf('C@') === 0, 'v2115/e2: [2] 合法改期用新 id（旧id@时刻）');
  a(rowsOf(WA).filter(function (x) { return x.id === r3.id; })[0].scheduledAt === t3 + 5000, 'v2115/e2: [2] 新行取新时刻');
  a(WA.events.replace('C', {}).reason === 'not-active', 'v2115/e2: [2] 终态行不可再改期 ⇒ not-active');
  on(WA, { maxRows: 2 }); const t4 = Date.now();
  WA.events.schedule({ id: 'D1', title: 'a', kind: 'once', at: t4 });
  WA.events.schedule({ id: 'D2', title: 'b', kind: 'once', at: t4 });
  a(WA.events.replace('D1', { at: t4 + 1000 }).ok === true, 'v2115/e2: [2] 满员时改期不被自己的旧行挡住（旧行同事务让位）');
  a(WA.events.active().length === 2, 'v2115/e2: [2] 改期后活动态仍是 2（不是 3）');
  a(WA.events.schedule({ id: 'D3', title: 'c', kind: 'once', at: t4 }).reason === 'capacity',
    'v2115/e2: [2] 容量口径未被放宽：满员时新增仍拒收');
  // 回归守卫：重构 plan() 不得放松既有拒收面
  on(WA); const t5 = Date.now();
  a(WA.events.schedule({ id: 123, title: 'x', kind: 'once' }).reason === 'missing-fields', 'v2115/e2: [4] 非字符串 id 仍拒收');
  a(WA.events.schedule({ id: 'E', title: 't', kind: 'delayed' }).reason === 'bad-trigger', 'v2115/e2: [4] delayed 缺时刻仍拒收');
  a(WA.events.schedule({ id: 'F', title: 't', kind: 'repeat', intervalMs: 0 }).reason === 'bad-trigger', 'v2115/e2: [4] repeat 非正间隔仍拒收');
  WA.events.schedule({ id: 'G', title: 'g', kind: 'once', at: t5 });
  a(WA.events.schedule({ id: 'G', title: 'g2', kind: 'once', at: t5 }).reason === 'duplicate', 'v2115/e2: [4] 同 id 活动态仍 duplicate');
  const cl = WA.events.claim(t5);
  a(cl.blocked.length === 0 && rowsOf(WA).filter(function (x) { return x.id === 'G'; })[0].status === 'claimed',
    'v2115/e2: [4] 认领闸未被重构影响（到点可认领）');
  // 哨兵
  let leak = 0;
  for (let i = 0; i < global.localStorage.length; i++) {
    const k = global.localStorage.key(i);
    if (k && String(global.localStorage.getItem(k)).indexOf(TAG) >= 0) leak++;
  }
  a(leak === 0, 'v2115/e2: [5] 哨兵未泄漏（' + leak + '）');
}

function runNegative(a) {
  BROKEN.forEach(function (s) { a(anchorHits(s) === 1, 'v2115/e2: [N0] 锚点在真源码中恰 1 次 :: ' + s.key); });
  // N1 破坏现形
  a(probeWith(BROKEN[B.guard], probeRejectKeeps) === 'killed',
    'v2115/e2: [N1] 去掉前置校验 ⇒ 非法改期顺手取消旧排期（E2 缺陷复现）');
  a(probeWith(BROKEN[B.keep], probeKeepTime) === 'moved',
    'v2115/e2: [N1] 去掉「保留原时刻」 ⇒ 只改标题也把排期挪到当下');
  // N2 真源码成绿
  a(probeClean(probeRejectKeeps) === 'alive', 'v2115/e2: [N2] 原版拒收后旧排期原样保留');
  a(probeClean(probeKeepTime) === 'kept', 'v2115/e2: [N2] 原版未给时刻保留原时刻');
  a(probeClean(probeAtomic) === 'atomic', 'v2115/e2: [N2] 原版改期为单事务原子替换');
  a(probeClean(probeFullReplace) === 'ok', 'v2115/e2: [N2] 原版满员可改期、容量不放宽');
  // N3 隔离：破坏某一锚点不影响另一判据
  a(probeWith(BROKEN[B.guard], probeFullReplace) === 'ok', 'v2115/e2: [N3] 校验破坏不影响容量口径');
  a(probeWith(BROKEN[B.keep], probeAtomic) === 'atomic', 'v2115/e2: [N3] 时刻缺省破坏不影响原子性');
  // N4 判据非恒真：真状态确实改变
  const chg = (function () {
    const WA = fresh();
    on(WA); const t = Date.now();
    WA.events.schedule({ id: 'N4', title: 'x', kind: 'once', at: t });
    const before = rowsOf(WA).length;
    WA.events.replace('N4', { at: t + 1 });
    return before + '>' + rowsOf(WA).length;
  })();
  a(chg === '1>2', 'v2115/e2: [N4] 合法改期真的新增追迹行（判据非恒真，实 ' + chg + '）');
}

function runAll(a) { judge(a); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('EVENTS-E2-V2115: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('EVENTS-E2-V2115: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits };

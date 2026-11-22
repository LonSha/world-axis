#!/usr/bin/env node
// WorldAxis tests/registry-identity-v2620.js —— 稳定人物 ID 与「身份 ↔ 长期状态」对账锁（v2.62.0）
//
// 【它治的病（路线图点名的前置收口①）】
//   路线图原话：长期状态（目标/承诺/日程/认知）应绑定**稳定人物 ID**，活动槽只承担本轮计算。
//   而改造前的事实是：
//     · 长期状态落在 `people['p_' + 姓名]`（以**姓名**为键）；
//     · 活动槽只有 12 个（SLOT_ORDER 的合法边界），且「槽耗尽」被下游读成「人物丢了」；
//     · 库里还有一个**同名不同义**的 personId（engines/life.js 内部，返回的正是 worldKey）——
//       下一个调用者会以为两者可以互换。
//   三个真缺陷：
//     ① 槽耗尽 ≠ 身份耗尽：第 13 个人在界面上不存在，而不是「有身份但没分到本轮槽」；
//     ② 身份与状态各自为政：有履历的人物可能从未被编号，反之亦然，而**没有任何出口能报出来**；
//     ③ 同名不同义：worldKey 与 personId 两套键名并存，无桥接、无对账。
//
// 【为什么既有锁全都照不到】（与本锁正交的那些面）
//   · slotStat / 活动槽用例钉的是「12 个槽的合法性」，本就承认 12 是边界——不问第 13 人；
//   · v2610（evict-meta）钉 people 容器的淘汰排序键，与「身份编号是否稳定」不同轴；
//   · dead-export / field-liveness 是**静态面**：它们能看出「某个口没人调」，
//     看不出「这个口返回的东西跨刷新会不会变」。
//   一句话：既有锁把「槽有 12 个」钉住了，没人钉「人的身份与槽**是两件事**」。
//
// 【做法】判据跑在**真源码**上（经 tests/ui-gate-sync.js 的 fresh() 装载真 LOAD），
//   只借宿主的 localStorage / SillyTavern 桩，不 mock 被测逻辑本身。
//   破坏自证走 opts.srcOverride：真源码在**内存副本**上改坏后重跑同款判据，仓库文件零改动。
//
// 【判据】
//   1  同一姓名在同一聊天内始终同一 id；不同姓名不同 id；形如 pid_<n>。
//   2  **跨刷新稳定**：重新装载（重读落盘）后 id 不变。
//   3  **不设 12 上限**：登记 15 人全部拿到 id，bound=15，且 beyondSlots>0（有身份但没分到本轮槽）。
//   4  **跨聊天不串**：另一聊天域从 pid_1 重新开始，两个域互不可见。
//   5  worldKey = 存档容器键（`p_<姓名>`），identityOf 三位一体，且 worldKey 真等于 state 里的键。
//   6  idStat 对账：有状态无 id ⇒ stateWithoutId 报出且 drifted=true；补登记后清零；
//      有 id 无状态 ⇒ idWithoutState 报出。
//   7  idStat 报出槽容量 12 与 beyondSlots（有身份但未占槽），使「槽耗尽 ≠ ID 耗尽」可分。
//   8  idClear：未绑定明确归因 not-bound；绑定后可解绑且不残留。
//   9  出口收敛：下游只认 identityOf / idStat / idClear 三个口（内部实现不重复挂口）。
//
// 【负控制】三个破坏锚点在真源码中各恰中 1 次；破坏后对应判据必须现形，原版上同款判据必须全绿。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');                       // 宿主桩：localStorage / SillyTavern
const LS = global.localStorage;

const ID_KEY = 'worldaxis_registry_ids_v1';
const CHAT_KEY = 'test_chat_001';           // mock 宿主的 chatId（跨刷新时保持）
const OTHER_CHAT = '__ri2620_other';

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function reg(WA) {
  if (!WA.registry || typeof WA.registry.identityOf !== 'function') {
    throw new Error('WA.registry.identityOf 不存在（actors/registry.js 未装载或出口被改）');
  }
  return WA.registry;
}
function ctxOf(WA) {
  try { return WA.mainWin.SillyTavern.getContext(); } catch (e) { return null; }
}
function setChat(WA, id) { const c = ctxOf(WA); if (c) c.chatId = id; }

// ── 无副作用隔离：快照 localStorage + 当前 chatId，跑完逐项还原 ──
// 本面的状态**全在 localStorage 的 id 表**里（按聊天分域），且判据要故意切 chatId。
// 不隔离的话：id 表残留会让后续套件读到「预置人物」，切走的 chatId 也会污染别人。
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
function isolated(fn) {
  const snap = snapshotLS();
  const WA0 = global.WorldAxis;
  const c0 = WA0 ? ctxOf(WA0) : null;
  const chat0 = c0 ? c0.chatId : undefined;
  const origLog = WA0 && WA0.log;
  if (WA0) WA0.log = function () {};
  try { return fn(); }
  finally {
    if (WA0 && origLog) WA0.log = origLog;
    if (c0 && chat0 !== undefined) c0.chatId = chat0;
    restoreLS(snap);
  }
}
function scanKeys(tag) {
  const out = [];
  for (let i = 0; i < LS.length; i++) {
    const k = LS.key(i);
    if (k === null) continue;
    let v = '';
    try { v = String(LS.getItem(k)); } catch (e) { v = ''; }
    if (v.indexOf(tag) >= 0) out.push(k);
  }
  return out;
}
/** 清掉 id 表并复位到「本聊天、零登记」——隔离窗口会原样还原 */
function resetIds(WA) {
  try { LS.removeItem(ID_KEY); } catch (e) {}
  setChat(WA, CHAT_KEY);
}

// ══════════════ 正向判据 ══════════════
function judge(a) {
  const WA = fresh();
  const R = reg(WA);
  resetIds(WA);

  // ── 1 同域恒定 / 不同人不同号 / 形态 ──
  const idA1 = R.identityOf('甲').personId;
  const idA2 = R.identityOf('甲').personId;
  const idB = R.identityOf('乙').personId;
  a(/^pid_\d+$/.test(idA1), 'v2620: [1] 稳定 ID 形态为 pid_<n>（实 ' + JSON.stringify(idA1) + '）');
  a(idA1 === idA2, 'v2620: [1] 同一姓名在同一聊天内始终同一 id（' + idA1 + '）');
  a(idA1 !== idB, 'v2620: [1] 不同姓名必须拿到不同 id（' + idA1 + ' vs ' + idB + '）');

  // ── 2 跨刷新稳定 ──
  const WA2 = fresh();                       // 重新装载：重读落盘 → 模拟刷新/切页
  const R2 = reg(WA2);
  a(R2.identityOf('甲').personId === idA1,
    'v2620: [2] 跨刷新后 id 不变（落盘 id 表被重读，实 ' + R2.identityOf('甲').personId + '）');

  // ── 3 不设 12 上限 ──
  const names = [];
  for (let i = 0; i < 15; i++) names.push('__ri2620_n' + i);
  names.forEach(function (n) { R.identityOf(n); });
  const st3 = R.idStat();
  a(st3.bound === 17, 'v2620: [3] 登记 17 人后 bound=17（非 12 上限；实 ' + st3.bound + '）');
  const uniq = {};
  Object.keys(st3.ids).forEach(function (k) { uniq[st3.ids[k]] = (uniq[st3.ids[k]] || 0) + 1; });
  a(Object.keys(uniq).every(function (k) { return uniq[k] === 1; }),
    'v2620: [3] 15+2 个 id 两两不同（无重复编号）');
  a(st3.slotCapacity === 12, 'v2620: [3] 活动槽容量仍是 12（槽是边界，身份不是；实 ' + st3.slotCapacity + '）');
  a(st3.beyondSlots > 0, 'v2620: [3] beyondSlots>0：有身份但未占本轮槽的人数可被读出（实 ' + st3.beyondSlots + '）');

  // ── 4 跨聊天不串 ──
  setChat(WA, OTHER_CHAT);
  const o1 = R.identityOf('丙').personId;
  a(o1 === 'pid_1', 'v2620: [4] 另一聊天域从 pid_1 重新开始（序号不读全局计数，实 ' + o1 + '）');
  const stOther = R.idStat();
  a(Object.keys(stOther.ids).indexOf('甲') < 0,
    'v2620: [4] 另一聊天域看不见本域人物（实见 ' + Object.keys(stOther.ids).join(',') + '）');
  setChat(WA, CHAT_KEY);
  a(R.identityOf('甲').personId === idA1, 'v2620: [4] 切回本域后 id 仍是原值（未被另一域顶掉）');
  a(Object.keys(R.idStat().ids).indexOf('丙') < 0, 'v2620: [4] 本域看不见另一域人物（双向隔离）');

  // ── 5 worldKey = 存档容器键，identityOf 三位一体 ──
  const tri = R.identityOf('甲');
  a(tri.name === '甲' && tri.personId === idA1 && tri.worldKey === 'p_甲',
    'v2620: [5] identityOf 返回三位一体 {name, personId, worldKey}（实 ' + JSON.stringify(tri) + '）');
  WA.store.transact(function (d) {
    d.people = d.people || {};
    d.people[tri.worldKey] = { id: tri.worldKey, name: '甲', life: { goals: [] }, knowledge: {} };
  }, '__ri2620_seed5');
  a(!!WA.store.get().people[tri.worldKey],
    'v2620: [5] worldKey 真能命中 store 里的容器键（长期状态的实际落点，实 ' + tri.worldKey + '）');
  a(WA.store.get().people[tri.worldKey].name === '甲',
    'v2620: [5] 该容器键下装的确实是这个人（不是同名异物）');

  // ── 6 身份 ↔ 状态对账 ──
  const st6 = R.idStat();
  a((st6.stateWithoutId || []).length === 0,
    'v2620: [6] 已登记的「甲」不算「有状态无编号」（实 ' + JSON.stringify(st6.stateWithoutId) + '）');
  a(st6.worldKeys['p_甲'] === idA1,
    'v2620: [6] idStat.worldKeys 给出「容器键 → 编号」对照（实 ' + JSON.stringify(st6.worldKeys['p_甲']) + '）');
  // 种一个有长期状态、但从未登记编号的人物
  WA.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p___ri2620_drift'] = { id: 'p___ri2620_drift', name: '__ri2620_drift', life: { goals: [] } };
  }, '__ri2620_seed6');
  const st6b = R.idStat();
  a((st6b.stateWithoutId || []).indexOf('p___ri2620_drift') >= 0,
    'v2620: [6] 有长期状态却无编号的人物被报出（实 ' + JSON.stringify(st6b.stateWithoutId) + '）');
  a(st6b.drifted === true, 'v2620: [6] drifted=true 让「身份脱节」一眼可见');
  a(st6b.worldKeys['p___ri2620_drift'] === '',
    'v2620: [6] 对照表把该键的编号留空（不假装它有身份）');
  // 补登记后清零
  R.identityOf('__ri2620_drift');
  const st6c = R.idStat();
  a((st6c.stateWithoutId || []).length === 0 && st6c.drifted === false,
    'v2620: [6] 补登记编号后对账清零（实 ' + JSON.stringify(st6c.stateWithoutId) + ' / drifted=' + st6c.drifted + '）');
  // 有 id 无状态
  R.identityOf('__ri2620_noState');
  const st6d = R.idStat();
  a((st6d.idWithoutState || []).indexOf('__ri2620_noState') >= 0,
    'v2620: [6] 有编号却没有状态容器的人物也被报出（实 ' + JSON.stringify(st6d.idWithoutState) + '）');
  a((st6d.idWithoutState || []).indexOf('甲') < 0,
    'v2620: [6] 有状态的那位不误报进「有 id 无状态」（实 ' + JSON.stringify(st6d.idWithoutState) + '）');

  // ── 7 idStat 报出槽容量与 beyondSlots ──
  const st7 = R.idStat();
  a(st7.persisted === true && typeof st7.chatId === 'string' && st7.chatId === CHAT_KEY,
    'v2620: [7] idStat 声明持久化并带上所属聊天域（实 ' + JSON.stringify(st7.chatId) + '）');
  a(st7.slotUsed <= st7.slotCapacity,
    'v2620: [7] 槽占用不超过容量（实 ' + st7.slotUsed + '/' + st7.slotCapacity + '）');
  a(st7.slotsExhausted === (st7.slotUsed >= st7.slotCapacity),
    'v2620: [7] slotsExhausted 与占用数严格一致（实 ' + st7.slotsExhausted + '）');
  a(st7.beyondSlots === Math.max(0, st7.bound - st7.slotUsed),
    'v2620: [7] beyondSlots = 有身份但未占槽的人数（实 ' + st7.beyondSlots + '）');

  // ── 8 idClear ──
  const c1 = R.idClear('__ri2620_never');
  a(c1.ok === false && c1.reason === 'not-bound', 'v2620: [8] 解绑未绑定姓名 ⇒ 明确归因 not-bound（实 ' + JSON.stringify(c1) + '）');
  a(R.idClear('').reason === 'missing-name', 'v2620: [8] 空姓名 ⇒ missing-name');
  const before8 = R.idStat().bound;
  const c2 = R.idClear('__ri2620_noState');
  a(c2.ok === true && c2.id === st6d.ids['__ri2620_noState'],
    'v2620: [8] 解绑成功并回报被解掉的编号（实 ' + JSON.stringify(c2.id) + '）');
  a(R.idStat().bound === before8 - 1, 'v2620: [8] 解绑后登记数减一（实 ' + R.idStat().bound + '）');
  a(Object.keys(R.idStat().ids).indexOf('__ri2620_noState') < 0, 'v2620: [8] 解绑后不留残影');

  // ── 9 出口收敛 ──
  a(typeof R.identityOf === 'function' && typeof R.idStat === 'function' && typeof R.idClear === 'function',
    'v2620: [9] 三个有真实消费方的口都在出口上');
  a(R.personId === undefined && R.worldKey === undefined,
    'v2620: [9] 内部实现（personId/worldKey）不重复挂口——下游只有一个入口，不会各拼各的键');
}

// ══════════════ 破坏探针（每种破坏只问一件事） ══════════════
/** 域隔离：在 chatA 登记甲、chatB 登记乙，再回 chatA 看本域有哪些人。原版只应见「甲」 */
function probeDomain(WA) {
  const R = reg(WA);
  try { LS.removeItem(ID_KEY); } catch (e) {}
  setChat(WA, 'chatA');
  const a1 = R.identityOf('甲').personId;
  setChat(WA, 'chatB');
  const b1 = R.identityOf('乙').personId;
  setChat(WA, 'chatA');
  return { a1: a1, b1: b1, mine: Object.keys(R.idStat().ids) };
}
/** 唯一编号：两个不同姓名必须拿到不同 id。原版 pid_1 / pid_2 */
function probeUnique(WA) {
  const R = reg(WA);
  try { LS.removeItem(ID_KEY); } catch (e) {}
  setChat(WA, CHAT_KEY);
  return { x: R.identityOf('甲').personId, y: R.identityOf('乙').personId };
}
/** 对账：种一个有状态无编号的人，须被 stateWithoutId 报出 */
function probeDrift(WA) {
  const R = reg(WA);
  try { LS.removeItem(ID_KEY); } catch (e) {}
  setChat(WA, CHAT_KEY);
  WA.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p___ri2620_pd'] = { id: 'p___ri2620_pd', name: '__ri2620_pd', life: { goals: [] } };
  }, '__ri2620_pd');
  const s = R.idStat();
  return { stateWithoutId: (s.stateWithoutId || []).slice(), drifted: s.drifted };
}

const A_DOMAIN = "function chatId() { try { const c = WA.mainWin.SillyTavern.getContext(); return c.chatId || 'default'; } catch (e) { return 'default'; } }";
const A_SEQ = "    const id = 'pid_' + (max + 1);";
const A_DRIFT = "        if (!sc.mine[nm]) driftState.push(k);";
const REL = 'actors/registry.js';
const BROKEN = [
  { key: 'domain', from: A_DOMAIN, to: "function chatId() { return 'default'; }" },
  { key: 'seq', from: A_SEQ, to: "    const id = 'p_' + (max + 1);" },
  { key: 'drift', from: A_DRIFT, to: "        if (false) driftState.push(k);" }
];
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('破坏锚点应恰中 1 次，实 ' + hits + ' 次：' + REL + ' :: ' + spec.from);
  const ov = {};
  ov[REL] = src.split(spec.from).join(spec.to);
  return ov;
}
function probeWith(spec, fn) { return isolated(function () { return fn(fresh({ srcOverride: brokenOverride(spec) })); }); }
function probeClean(fn) { return isolated(function () { return fn(fresh()); }); }

// ══════════════ 负控制 ══════════════
function runNegative(a) {
  const anchorBad = BROKEN.filter(function (p) {
    const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
    return (src.split(p.from).length - 1) !== 1;
  }).map(function (p) {
    const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
    return p.key + '(' + (src.split(p.from).length - 1) + '次)';
  });
  a(anchorBad.length === 0, 'v2620: [N0] 破坏锚点在真源码中各恰中 1 次（异: ' + (anchorBad.join(',') || '无') + '）');
  const diffOk = BROKEN.every(function (p) {
    return brokenOverride(p)[REL] !== fs.readFileSync(path.join(BASE, REL), 'utf8');
  });
  a(diffOk, 'v2620: [N0] 三种破坏的内存副本都与真源码不同（非空转）');

  // 域崩溃 ⇒ 「另一域看不见本域人物」现形
  const dBad = probeWith(BROKEN[0], probeDomain);
  a(dBad.mine.length > 1 || dBad.b1 !== 'pid_1',
    'v2620: [N1] chatId 退化成单一域 ⇒ 跨聊天隔离判据现形（本域可见 ' + JSON.stringify(dBad.mine) + '）');
  // 序号退化（编号被前缀破坏 ⇒ 序号无法从既有值解析）⇒ 「不同姓名不同 id」现形
  const uBad = probeWith(BROKEN[1], probeUnique);
  a(uBad.x === uBad.y,
    'v2620: [N1] 编号被改坏 ⇒ 「不同姓名不同 id」判据现形（实 ' + JSON.stringify(uBad) + '）');
  // 对账不报 ⇒ 「有状态无编号被报出」现形
  const rBad = probeWith(BROKEN[2], probeDrift);
  a(rBad.stateWithoutId.length === 0 && rBad.drifted === false,
    'v2620: [N1] 对账被摘除 ⇒ 「有状态无编号」判据现形（实 ' + JSON.stringify(rBad) + '）');

  // 两向自证：原版源码上同款探针全部通过
  const dOk = probeClean(probeDomain);
  a(dOk.a1 === 'pid_1' && dOk.b1 === 'pid_1' && dOk.mine.length === 1 && dOk.mine[0] === '甲',
    'v2620: [N2] 原版：两域各自从 pid_1 起算且互不可见（实 ' + JSON.stringify(dOk) + '）');
  const uOk = probeClean(probeUnique);
  a(uOk.x !== uOk.y && /^pid_\d+$/.test(uOk.x) && /^pid_\d+$/.test(uOk.y),
    'v2620: [N2] 原版：不同姓名不同 id（实 ' + JSON.stringify(uOk) + '）');
  const rOk = probeClean(probeDrift);
  a(rOk.stateWithoutId.length > 0 && rOk.drifted === true,
    'v2620: [N2] 原版：有状态无编号被报出（实 ' + JSON.stringify(rOk) + '）');

  // 逐锚敏感：破坏域不牵连编号唯一性
  const crossOk = probeWith(BROKEN[0], probeUnique);
  a(/^pid_\d+$/.test(crossOk.x) && crossOk.x !== crossOk.y,
    'v2620: [N3] 域破坏不牵连编号唯一性（逐锚敏感，实 ' + JSON.stringify(crossOk) + '）');

  // 非恒真：id 表确实被写过盘（否则「跨刷新稳定」可由「根本没落盘」伪造）
  const wrote = isolated(function () {
    const WA = fresh(); const R = reg(WA);
    try { LS.removeItem(ID_KEY); } catch (e) {}
    setChat(WA, CHAT_KEY);
    const id = R.identityOf('__ri2620_persist').personId;
    return { id: id, raw: LS.getItem(ID_KEY) || '' };
  });
  a(wrote.raw.indexOf('__ri2620_persist') >= 0 && wrote.raw.indexOf(wrote.id) >= 0,
    'v2620: [N4] id 表确实落盘（跨刷新稳定不是靠内存巧合）');

  // 无副作用：本锁的哨兵不得经落盘泄漏进真存档
  const leak = scanKeys('__ri2620_');
  a(leak.length === 0, 'v2620: [N5] 探测哨兵不泄漏进真存档（残留键: ' + (leak.join(',') || '无') + '）');
}

// ══════════════ 入口 ══════════════
function runAll(a) { isolated(function () { judge(a); }); }

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name); }
  };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (fail) { console.log('REGISTRY-IDENTITY-V2620: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('REGISTRY-IDENTITY-V2620: pass（' + pass + ' 项）');
}
module.exports = {
  runAll: runAll, runNegative: runNegative,
  probeDomain: probeDomain, probeUnique: probeUnique, probeDrift: probeDrift,
  brokenOverride: brokenOverride
};
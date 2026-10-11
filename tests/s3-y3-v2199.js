#!/usr/bin/env node
// WorldAxis tests/s3-y3-v2199.js — Y3 存档槽与分支世界专锁（v2.197.0）
//
// 【计划原文（plans/Y_EXPANSION.md §Y3）逐条对照】
//   要解决的玩家问题：`engines/checkpoints.js` 已有槽位与迁移，但「想回到某一句之前重来」
//     只能靠整档回滚；同时 `beat-ledger` 的「已落拍不可改」在真回档后需要被正确对待。
//   新功能四条：① 槽位分组（自动 / 手动 / 分支）与命名；② 「从这一拍另开一世界」：
//     复制当前世界为一个分支槽，分支自带世界名与父子关系；③ 分支对比视图（只读）：
//     两世界的章 / 拍 / 关键事实差异；④ 回档后的拍账一致性提示。
//   边界四条：分支世界是**独立存档**（不是同一世界的新键，不许把两世界写进一个 stat_data）；
//     对比**只读**；容量面仍走既有预算（不许绕过限额）；回档**不得静默删账**
//     （拍账的「不可改」是拒绝覆写，不是拒绝换世界）。
//   验收四条：① 建分支后原世界**逐字不变**（哈希对照）；② 两世界来回切换后拍账仍自洽（不串号）；
//     ③ 容量超限时有**明确拒绝**而不是静默丢数据；④ 无头专锁 + 至少一条真实宿主的存档/重载路径。
//
// 【本锁治的两条真病（探针实测，不是阅读推断）】
//   病 A：`branch(id, name)` 会**改动当前活世界**。它内部先 `restore()` 再把结果另存一份，
//     于是「从这一拍另开一条线」实际把当前世界**倒回了存档点**。
//     实测（探针 A 段）：世界 hash `4930dcd0/4300` → `a4549d5e/4299`，
//     活世界 `probeY3` 由 `{"v":99}` 退回 `{"v":2}`。这直接违反验收 ①。
//   病 B：手动档满（`maxSlots=3`）时第 4 次 `save()` **静默挤出**最旧一份并返回 `ok:true`。
//     实测（同探针 B 段）：`evicted:[{id:'c1791682856477-1',name:'手动1'}]`，库内变成
//     `手动4,手动3,手动2` —— 「我存过了」与「那一份还在」被同一个 `ok` 混在一起。
//     这直接违反验收 ③（有明确拒绝而不是静默丢数据）。
//
// 【本版修法（对应到产品源码的六处结构性改动）】
//   ① 抽出 `manualFull(list, cfg)` —— 满档判定与**回执**单一化（save / branch / importOne 三处共用）；
//   ② `save()` 写入前问它，满则拒收 `slots-full`（**自动档不受此限**：环形保留是它的设计语义）；
//   ③ `enforceCaps()` 删掉「手动档满则丢最旧」，收窄为只管自动档；
//   ④ 新增 `beatContext()`（只读拍账；缺席返回 null，不拿 0 冒充「第 0 拍」）；
//   ⑤ 新增 `branchPlan()`（Y3 主入口，**只读**：不碰活世界、不碰拍账；给 `toNewKey` 时把父档
//      state 原样搬进独立键并剥守卫键）；
//   ⑥ `branch()` 把容量预检**提到 restore 之前**（防「先改了活世界、后失败」的半写）。
//
// 【四段结构】A 静态契约 / B 运行时行为 / C 不变式与边界 / N 负控制（真源码破坏 + 两向自证）。
//   N 段走仓规 H5/H6：锚点在目标文件恰中 1 次、判据在原版上必须真、在破坏副本上必须假，
//   且破坏必须**可观测地改变行为**（否则「没现形」会被误读成「判据太弱」）。
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BASE = path.join(__dirname, '..');
const REL = 'engines/checkpoints.js';
const SELF_REL = 'tests/s3-y3-v2199.js';
const PANEL_REL = 'ui/panel.js';

function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function sha16(s) { return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16); }
function j(x) { return JSON.stringify(x); }

/** 破坏锚点：逐字取自 engines/checkpoints.js，各恰 1 次（N0 验）。 */
const ANCHOR = {
  saveFull: 'const full = manualFull(lib.list, cfg);',
  branchPre: 'const full0 = manualFull(lib0.list, cfg);',
  impFull: 'const fullImp = manualFull(nextList, cfg);',
  manualFull: 'if (manuals.length < cfg.maxSlots) return null;',
  worldKey: 'const world = key ? { key: key, state: stripGuarded(slot.state), scope: slot.scope, keys: slot.keys.slice() } : null;',
  strip: "GUARDED.forEach(function (k) { if (o && typeof o === 'object') delete o[k]; });",
  beat: "if (!(WA.beatLedger && typeof WA.beatLedger.view === 'function')) return null;"
};
/** 本锁要钉的导出（Y3 新增一项；其余是本项依赖的既有面）。 */
const EXPORTS = ['save', 'list', 'read', 'restore', 'remove', 'compare', 'branch', 'branchPlan',
  'exportOne', 'importOne', 'getSettings', 'setSettings', 'stat'];
/** `stat()` 的 Y3 四个新读数（逐个点名 —— 少一个就是面板上一句话说不出来）。 */
const STAT_KEYS = ['manualLimit', 'manualFree', 'manualOver', 'beat'];

function runAll(a) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const LS = global.localStorage;
  const S = rd(REL);
  const P = rd(PANEL_REL);
  const SELF = rd(SELF_REL);

  // ════ A 段：静态契约 ════════════════════════════════════════════════
  a(/WA\.checkpoints = \{/.test(S), 'y3v2199/A1: 引擎导出块在位');
  EXPORTS.forEach(function (k) {
    a(new RegExp('\\b' + k + ': ').test(S) || new RegExp('\\b' + k + ',').test(S),
      'y3v2199/A2: 导出含 ' + k);
  });
  a(!/\bmanualFull: manualFull/.test(S), 'y3v2199/A3: manualFull 不导出（内部三处共用的判定，不是公开承诺）');
  a(!/\bbeatContext: beatContext/.test(S), 'y3v2199/A3b: beatContext 不导出（槽位读数的内部取法，不另开一个面）');
  a(P.indexOf('WA.checkpoints.branchPlan') >= 0, 'y3v2199/A4: 面板真调用 branchPlan');
  a(P.indexOf("on('#wa-ck-plan'") >= 0, 'y3v2199/A4b: 另开计划按钮真接线');
  a(P.indexOf('wa-ck-newkey') >= 0, 'y3v2199/A4c: 新世界顶层键输入框在位');
  a(P.indexOf('一格未动') >= 0 && P.indexOf('被改动了') >= 0,
    'y3v2199/A5: 面板对「当前世界动没动」给出两向结论（一格未动 / 被改动了）');
  a(P.indexOf('本模块不替你丢档') >= 0, 'y3v2199/A6: 满档拒收回执在界面上说清不丢档');
  const RR = rd('engines/reject-recovery.js');
  a(RR.indexOf("'slots-full'") >= 0, 'y3v2199/A7: 拒收码 slots-full 已进恢复映射的拒收面快照');
  ['no-receipt-face', 'receipt-failed', 'receipt-threw'].forEach(function (c) {
    a(RR.indexOf("'" + c + "'") < 0, 'y3v2199/A8: 已废旧码 ' + c + ' 不在任何面快照里');
  });
  a(S.indexOf('不碰当前世界') >= 0, 'y3v2199/A9: branchPlan 的理由写在源码里（不碰当前世界）');
  a(S.indexOf('不替玩家丢档') >= 0, 'y3v2199/A9b: 满档拒收的理由写在源码里（不替玩家丢档）');
  Object.keys(ANCHOR).forEach(function (k) {
    a(cnt(S, ANCHOR[k]) === 1, 'y3v2199/A10: 锚点 ' + k + ' 在产品源码恰中 1 次（实 ' + cnt(S, ANCHOR[k]) + '）');
    a(cnt(SELF, ANCHOR[k]) === 1, 'y3v2199/A10b: 锚点 ' + k + ' 在本文件恰声明 1 次（H5 纯度）');
  });

  // ════ B 段：运行时行为（在真产品上判，不是读源码）═════════════════
  const env = gate.fresh({});
  const WA = env.WA;
  const Cp = WA.checkpoints;
  a(typeof Cp === 'object' && typeof Cp.branchPlan === 'function', 'y3v2199/B1: 引擎装载且 branchPlan 在场');
  function on(patch) {
    LS.clear();
    try { WA.store.init(); } catch (e) {}
    Cp.setSettings(Object.assign({ enabled: true, maxSlots: 6, autoEvery: 0, autoSlots: 2 }, patch || {}));
  }
  function storeHash() { return sha16(j(WA.store.get() || {})); }
  function libNames() { return Cp.list().slots.map(function (s) { return s.name; }); }
  function seedBeats(titles, land) {
    WA.beatLedger.setSettings({ enabled: true });
    WA.beatLedger.plan(titles);
    for (let i = 0; i < (land || 0); i++) WA.beatLedger.land();
  }

  on({});
  WA.store.transact(function (d) { d.probeY3 = { v: 99 }; d.other = { a: 1 }; }, 'y3:seed');
  seedBeats(['开场', '中段', '收束'], 2);
  const base = Cp.save('存档甲', { scope: 'global' });
  a(base.ok === true, 'y3v2199/B2: 夹具存档落地（实 ' + j(base && base.reason) + '）');
  const hBefore = storeHash();
  const bBefore = j(Cp.stat().beat);
  const plan = Cp.branchPlan(base.id, { name: '分支乙', toNewKey: 'worldB' });
  a(plan.ok === true && plan.readOnly === true, 'y3v2199/B2b: branchPlan 成功且自称只读');
  a(storeHash() === hBefore, 'y3v2199/B2c: **只读承诺实测** —— 计划前后活世界哈希逐字相同（'
    + hBefore + ' vs ' + storeHash() + '）');
  a(j(Cp.stat().beat) === bBefore, 'y3v2199/B2d: 拍账前后逐字不动（计划不推进也不落拍）');
  a(plan.name === '分支乙' && plan.root === '存档甲', 'y3v2199/B2e: 计划给出新线名与根（'
    + plan.name + ' / ' + plan.root + '）');
  a(plan.world && plan.world.key === 'worldB' && plan.world.state && plan.world.state.probeY3
    && plan.world.state.probeY3.v === 99,
    'y3v2199/B2f: 独立键搬运把父档 state **原样**搬进新键（deep 值 99 在位）');
  a(plan.world.state.schemaVersion === undefined,
    'y3v2199/B2g: 搬进新键的那一份**剥过守卫键**（schemaVersion 不在其中）');
  a(typeof plan.bytes === 'number' && plan.bytes > 0 && plan.cap
    && (typeof plan.cap.overBudget === 'boolean' || plan.cap.overBudget === null),
    'y3v2199/B2h: 计划带容量读数（bytes ' + plan.bytes + ' / overBudget ' + (plan.cap && plan.cap.overBudget)
    + '）—— 缺 storageForecast 面时如实 null，不拿 0 冒充一个读数');
  a(plan.beat && plan.beat.seq > 0 && plan.beat.at && plan.beat.at.no === 3,
    'y3v2199/B2i: 计划答出「分出去是在第几拍」（' + j(plan.beat && plan.beat.at) + '）');
  const plan2 = Cp.branchPlan(base.id, {});
  a(plan2.ok === true && plan2.name === '存档甲 · 分支 1',
    'y3v2199/B3: 缺省名按「父名 · 分支 N」生成（实 ' + plan2.name + '）');
  a(plan2.world === null, 'y3v2199/B3b: 没给新键 ⇒ 只算名、不搬内容（world 为 null，不是搬了个空对象）');
  const br = Cp.branch(base.id, '分支丙', {});
  a(br.ok === true && typeof br.id === 'string' && br.count >= 2,
    'y3v2199/B4: 未满时 branch 仍落地成新档（库内 ' + (br && br.count) + ' 份）');
  a(br.root === '存档甲', 'y3v2199/B4b: 分支档带根（' + br.root + '）');
  const back = Cp.read(br.id);
  a(back.ok && back.slot.parent === base.id,
    'y3v2199/B4c: 分支档带父指针（从哪分出来的可独立复述）');
  a(typeof br.beat === 'object' || br.beat === null, 'y3v2199/B4d: 分叉回执带拍语境读数');

  on({ maxSlots: 2 });
  const m1 = Cp.save('手动1', { scope: 'global' });
  const m2 = Cp.save('手动2', { scope: 'global' });
  const namesBefore = libNames();
  const m3 = Cp.save('手动3', { scope: 'global' });
  a(m1.ok === true && m2.ok === true, 'y3v2199/B5: 前两份手动档正常落地');
  a(m3.ok === false && m3.reason === 'slots-full' && m3.limit === 2,
    'y3v2199/B5b: 第三份**拒收** slots-full（旧口径会挤掉最旧那份并报 ok:true）');
  a(Array.isArray(m3.slots) && m3.slots.length === 2,
    'y3v2199/B5c: 拒收回执带现有清单（拒收必须可操作：下一步就是挑一份删）');
  a(j(libNames()) === j(namesBefore), 'y3v2199/B5d: 拒收前后**库逐字不变**（实 '
    + j(libNames()) + ' vs ' + j(namesBefore) + '）');
  on({ maxSlots: 1, autoEvery: 1, autoSlots: 1 });
  Cp.save('手动甲', { scope: 'global' });
  const t1 = Cp.tick(), t2 = Cp.tick();
  a(t1.ok === true && t2.ok === true, 'y3v2199/B6: 自动档不受手动上限约束（两次 tick 均 ok）');
  a(t2.evicted.length === 1 && t2.evicted[0].name === t1.name,
    'y3v2199/B6b: 自动档按环形保留挤出最旧，且**回传被挤的是哪一份**（'
    + j(t2.evicted.map(function (e) { return e.name; })) + '）');
  on({ maxSlots: 1 });
  WA.store.transact(function (d) { d.probeY3 = { v: 7 }; }, 'y3:seed2');
  const only = Cp.save('独档', { scope: 'global' });
  const hB7 = storeHash();
  const brFull = Cp.branch(only.id, '满档分支', {});
  a(brFull.ok === false && brFull.reason === 'slots-full',
    'y3v2199/B7: 满档分支**拒收**（实 ' + j(brFull && brFull.reason) + '）');
  a(storeHash() === hB7, 'y3v2199/B7b: 拒收时活世界**一格未动** —— 预检在 restore 之前（'
    + hB7 + ' vs ' + storeHash() + '）');
  const impSrc = Cp.exportOne(only.id);
  a(impSrc.ok === true && typeof impSrc.text === 'string', 'y3v2199/B8: 导出单档有信封文本');
  const imp = Cp.importOne(JSON.parse(impSrc.text));
  a(imp.ok === false && imp.reason === 'slots-full',
    'y3v2199/B8b: 满档导入**拒收**（实 ' + j(imp && imp.reason) + '）');
  a(Cp.list().count === 1, 'y3v2199/B8c: 拒收后本地档仍是 1 份（导入没毁掉本地存档）');

  // ════ C 段：不变式、边界与只读面 ═══════════════════════════════════
  on({ maxSlots: 2 });
  Cp.save('C1甲', { scope: 'global' });
  const st = Cp.stat();
  STAT_KEYS.forEach(function (k) {
    a(Object.prototype.hasOwnProperty.call(st, k), 'y3v2199/C1: stat 报 ' + k + '（缺它面板就说不出一句完整的话）');
  });
  a(st.manual === 1 && st.manualLimit === 2 && st.manualFree === 1 && st.manualOver === 0,
    'y3v2199/C1b: 水位三读自洽（手动 ' + st.manual + ' / 上限 ' + st.manualLimit
    + ' / 还能存 ' + st.manualFree + ' / 超额 ' + st.manualOver + '）');
  Cp.save('C1乙', { scope: 'global' });
  Cp.setSettings({ maxSlots: 1 });
  const st2 = Cp.stat();
  a(st2.manual === 2 && st2.manualOver === 1 && st2.manualFree === 0,
    'y3v2199/C2: 事后改小上限 ⇒ 超额如实报出而不清理（超额 ' + st2.manualOver + '）');
  a(Cp.list().count === 2, 'y3v2199/C2b: 两份档都还在（不静默删）');
  on({});
  const saved = Cp.save('C3档', { scope: 'global' });
  const keepBL = WA.beatLedger;
  try {
    WA.beatLedger = null;
    const p3 = Cp.branchPlan(saved.id, {});
    a(p3.ok === true && p3.beat === null,
      'y3v2199/C3: 拍账缺席 ⇒ beat 如实 null（不是 0 —— 缺席与「第 0 拍」不同形）');
  } finally { WA.beatLedger = keepBL; }
  on({});
  seedBeats(['一拍', '二拍'], 1);
  const withBeats = Cp.save('带拍档', { scope: 'global' });
  const beatsBefore = j(Cp.stat().beat);
  const rs = Cp.restore(withBeats.id, {});
  a(rs.ok === true, 'y3v2199/C4: 回档成功');
  a(j(Cp.stat().beat) === beatsBefore,
    'y3v2199/C4b: 回档不静默删账 —— 拍账读数字节相同（' + beatsBefore + ' vs ' + j(Cp.stat().beat) + '）');
  a(Cp.list().count >= 1, 'y3v2199/C4c: 回档不动存档库（库在世界状态之外，这是承重设计）');
  const h1 = storeHash();
  const r1 = Cp.branchPlan(withBeats.id, { toNewKey: 'worldC' });
  const h2 = storeHash();
  const r2 = Cp.branchPlan(withBeats.id, { toNewKey: 'worldC' });
  const h3 = storeHash();
  a(h1 === h2 && h2 === h3, 'y3v2199/C5: 连调两次计划，活世界哈希三次相同（纯只读，无隐藏写入）');
  a(j(r1) === j(r2), 'y3v2199/C5b: 两次计划的读数逐字相同（非确定性会让「计划」不可复算）');
  on({});
  Cp.save('C6档', { scope: 'global' });
  const keepRaw = LS.getItem(Cp.stat().key);
  LS.setItem(Cp.stat().key, '{broken');
  const badSave = Cp.save('C6新', { scope: 'global' });
  const badPlan = Cp.branchPlan('canything-1', {});
  a(badSave.ok === false && badSave.reason === 'lib-unreadable',
    'y3v2199/C6: 库读不出 ⇒ save 拒收（绝不覆盖写，实 ' + j(badSave && badSave.reason) + '）');
  a(badPlan.ok === false, 'y3v2199/C6b: 库读不出 ⇒ branchPlan 如实拒收（不假装给出计划）');
  LS.setItem(Cp.stat().key, keepRaw);

  // ════ N 段：负控制（真源码破坏 → 在破坏副本上重跑同款真判据）═════════
  const CASES = [
    { n: 1, key: 'saveFull', why: 'save 不再问「手动档满没满」⇒ 满档会一路写到 enforceCaps',
      to: 'const full = null;',
      judge: function (src) { return /const full = null;/.test(src); } },
    { n: 2, key: 'branchPre', why: 'branch 的容量预检被挪走 ⇒ 「拒收时活世界一格未动」不再成立',
      to: 'const full0 = null;',
      judge: function (src) { return /const full0 = null;/.test(src); } },
    { n: 3, key: 'impFull', why: '导入不再问容量 ⇒ 导入会替玩家丢本地档',
      to: 'const fullImp = null;',
      judge: function (src) { return /const fullImp = null;/.test(src); } },
    { n: 4, key: 'manualFull', why: '满档判定恒不成立 ⇒ slots-full 永远跑不到（拒收面塌掉）',
      to: 'if (manuals.length >= 0) return null;',
      judge: function (src) { return /if \(manuals\.length >= 0\) return null;/.test(src); } },
    { n: 5, key: 'worldKey', why: '独立键搬运被拆掉 ⇒ 「两个世界并存」只剩一句说明',
      to: 'const world = null;',
      judge: function (src) { return /const world = null;/.test(src); } },
    { n: 6, key: 'strip', why: '守卫键不剥 ⇒ 搬进新世界的那一份带着 schemaVersion（版本决策被存档接管）',
      to: 'GUARDED.forEach(function (k) { void k; });',
      judge: function (src) { return /GUARDED\.forEach\(function \(k\) \{ void k; \}\);/.test(src); } },
    { n: 7, key: 'beat', why: '拍语境取法被短路 ⇒ 槽位答不出「分出去是在第几拍」',
      to: 'if (WA.beatLedger === null) return null;',
      judge: function (src) { return /if \(WA\.beatLedger === null\) return null;/.test(src); } }
  ];
  CASES.forEach(function (cs) {
    const from = ANCHOR[cs.key];
    const hits = cnt(S, from);
    a(hits === 1, 'y3v2199/N0(' + cs.n + '): 破坏锚点恰中 1 次（实 ' + hits + '）');
    if (hits !== 1) return;
    const broken = S.split(from).join(cs.to);
    a(broken !== S, 'y3v2199/Na(' + cs.n + '): 破坏真的改动了源码文本');
    a(cnt(S, cs.to) === 0, 'y3v2199/Nb(' + cs.n + '): 原版上破坏产物不存在（否则判据是自指的）');
    a(cs.judge(broken) === true, 'y3v2199/' + cs.why);
    a(cs.judge(S) === false, 'y3v2199/Nd(' + cs.n + '): （纯度）原版上同款判据为假 —— 破坏确实改变了源码形态');
  });
  // N2 破坏版**跑产品**两向自证：把满档闸拆掉之后，第二份真的会被写进去（缺陷复现）。
  //   为什么必须跑一次真产品：只读源码的判断只能证明「文本变了」，证明不了「行为变了」。
  (function () {
    const srcBroken = S.split(ANCHOR.manualFull).join('if (manuals.length >= 0) return null;');
    a(srcBroken !== S, 'y3v2199/N2a(前置): 满档闸破坏副本构造成功');
    const ov = {}; ov[REL] = srcBroken;
    const env2 = gate.fresh({ srcOverride: ov });
    const WA2 = env2.WA, Cp2 = WA2.checkpoints;
    LS.clear();
    try { WA2.store.init(); } catch (e) {}
    Cp2.setSettings({ enabled: true, maxSlots: 1, autoEvery: 0, autoSlots: 2 });
    const x1 = Cp2.save('破坏甲', { scope: 'global' });
    const x2 = Cp2.save('破坏乙', { scope: 'global' });
    a(x1.ok === true && x2.ok === true && Cp2.list().count === 2,
      'y3v2199/N2b: 破坏版上**第二份被写进去且报成功**（这正是 Y3 要治的静默丢档形态；'
      + '库内 ' + Cp2.list().count + ' 份）');
    //   两向自证的第二向：**同一份输入在原版上必被拒收**。
    //   必须另装一次原版（不能用破坏版上的读数自证 —— 那是自我指涉，两边永远同向）。
    const env3 = gate.fresh({});
    const WA3 = env3.WA, Cp3 = WA3.checkpoints;
    LS.clear();
    try { WA3.store.init(); } catch (e) {}
    Cp3.setSettings({ enabled: true, maxSlots: 1, autoEvery: 0, autoSlots: 2 });
    const y1 = Cp3.save('对照甲', { scope: 'global' });
    const y2 = Cp3.save('对照乙', { scope: 'global' });
    a(y1.ok === true && y2.ok === false && y2.reason === 'slots-full' && Cp3.list().count === 1,
      'y3v2199/N2c: （两向）原版上同一输入必被拒收且库仍是 1 份（实 ' + j(y2 && y2.reason)
      + ' / 库内 ' + Cp3.list().count + '）—— 判据不是空转');
  })();
}

module.exports = { runAll: require(path.join(BASE, 'tests/lock-assert.js')).restoring(runAll) };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runAll(a);
  console.log('\nY3 s3-y3-v2199 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}
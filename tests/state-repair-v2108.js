#!/usr/bin/env node
'use strict';
/**
 * tests/state-repair-v2108.js — 存档损坏三级自动修复（计划一 #18）四段专锁。
 *
 * 治的病：v0.1.38 起 `load()` 在解析失败时把原始 payload 存进 `*_corrupt_*` 隔离键并返回 null——
 *    **保住了现场，却从未尝试救回世界**。调用方拿到 null、`init()` 回落 `defaultWorldState()`，
 *    用户看到的是「一整局归零」，而全程**零修复尝试、零修复记录**：坏得再可惜也没人试过。
 *
 * 本版能力（三级，逐级降级，每级都有归因）：
 *   L1 截断到最后完整对象（半写/配额截断/GC 半截是主流形态：头完好、尾丢）
 *   L2 读同聊天后备键 `worldaxis_state_<chat>_bak`（由 save() 在会话内首个成功写时建一次）
 *   L3 三级都救不回 ⇒ 如实报告「未救回」，调用方照旧回落空世界（旧行为原样保留）
 *
 * 四段：
 *   A 静态契约：出口面零扩张 / 家族四处同批登记 / 判定次序在 state 之前 / 锚点纯度。
 *   B 运行时：三级各真跑一次 + 「修复不计 hits」+ 「写回失败不返回现场」。
 *   C 不变式：只读探针连调不改存档；连调幂等。
 *   N 负控制：**真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据**（零文件改写）。
 *
 * 为什么负控制走 `fresh({srcOverride})`：`core/store.js` 是绑在 `WA` 上的脚本而非 CommonJS 模块，
 *   vm 裸壳装不动它（它会去写 `WA.store`）。本仓既有口径（v2.61.0 起）就是这条路：
 *   `ui-gate-sync.fresh({srcOverride:{'core/store.js': broken}})` 在内存副本上重装全产品，
 *   真文件逐字不动，而判据跑的是**真装载的真模块**（不是字符串匹配）。
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const STORE_REL = 'core/store.js';
const RUN_REL = 'tests/run.js';
const SELF_REL = 'tests/state-repair-v2108.js';

const PROBE = 'v2108_repair_probe';           // 专用探针聊天：绝不碰 test_chat_001（那是全套回归的主聊天）
const PROBE_MAIN = 'worldaxis_state_' + PROBE;
const PROBE_BAK = PROBE_MAIN + '_bak';
const PROBE_MARK = PROBE_MAIN + '_recovered';

function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function allReplace(src, from, to) { return src.split(from).join(to); }

/** 现场破坏：锚点必须真的打中（没打中 ⇒ 抛，不许静默）。 */
function breakOnce(src, from, to, label) {
  const out = allReplace(src, from, to);
  if (out === src) throw new Error('破坏未生效（锚点没打中）:: ' + label + ' :: ' + from);
  return out;
}

/** 统一锚点表（每条在 core/store.js 里恰中 1 次；且在本文件里恰声明 1 次）。 */
const ANCHORS = {
  aBakKey: { rel: STORE_REL, txt: "function bakKey(chatId) { return 'worldaxis_state_' + (chatId || getChatId()) + '_bak'; }" },
  aWorldLike: { rel: STORE_REL, txt: "const worldLike = hasOwn.call(obj, 'schemaVersion') || (obj.meta && typeof obj.meta === 'object');" },
  aRepairs: { rel: STORE_REL, txt: '__loadStat.repairs = (__loadStat.repairs || 0) + 1;' },
  aWriteBack: { rel: STORE_REL, txt: "const w = writeVerified(storageKey(chatId), JSON.stringify(rep.state));" },
  aFamily: { rel: STORE_REL, txt: "if ((m = key.match(KEY_FAMILIES.recover))) return { family: 'recover', chat: m[1], kind: m[2] };" },
  aWire: { rel: RUN_REL, txt: "runLock('./state-repair-v2108.js');" }
};

/** H5 锚点纯度：目标文件里恰 1 次 + 本文件里恰 1 次（缺失与重复同罪）。 */
function auditAnchors(A) {
  const self = rd(SELF_REL);
  Object.keys(ANCHORS).forEach(function (k) {
    const a = ANCHORS[k];
    const nT = rd(a.rel).split(a.txt).length - 1;
    const nS = self.split(a.txt).length - 1;
    A(nT === 1, 'A5 锚点 ' + k + ' 在 ' + a.rel + ' 里恰 1 次（实 ' + nT + '）');
    A(nS === 1, 'A5 锚点 ' + k + ' 在本锁里恰声明 1 次（实 ' + nS + '，缺失与重复同罪）');
  });
}

/** 清掉本锁建过的全部键（锁不得留下残骸 —— 后面还有别的块会数键）。 */
function cleanupProbe() {
  const LS = global.localStorage;
  const drop = [];
  for (let i = 0; i < LS.length; i++) {
    const k = LS.key(i);
    if (k !== null && k.indexOf('worldaxis_state_' + PROBE) === 0) drop.push(k);
  }
  drop.forEach(function (k) { try { LS.removeItem(k); } catch (e) {} });
  return drop.length;
}

/** 探针前置：一个「合法世界骨架」的最小形态（world-like 判据要认它）。 */
function goodPayload(tag) {
  return JSON.stringify({ schemaVersion: 1, meta: { tag: tag, updatedAt: 1 }, clock: { label: tag } });
}

function runAll(A) {
  const WA = global.WorldAxis;
  const S = WA.store;
  const LS = global.localStorage;
  //   只比存档域：诊断日志（error_log/event_log）是 WA.log 的正常产物，与「动了别的聊天」无关。
  const othersBefore = Object.keys(LS._dump()).filter(function (k) {
    return k.indexOf('worldaxis_state_') === 0 && k.indexOf('worldaxis_state_' + PROBE) !== 0;
  }).sort().join(',');

  // ── A 静态契约 ──
  const st = S.loadStat();
  A(typeof st.repairs === 'number' && ('lastRepair' in st),
    'A1 修复计量已挂在既有 loadStat()（repairs ' + st.repairs + ' / lastRepair ' + (st.lastRepair ? '有' : 'null') + '）——零新导出');
  // 零新导出：内部函数名不得出现在 store 的公开面上
  ['bakKey', 'recoveredKey', 'tryRepair', 'tryBackupRepair', 'writeBackup', 'truncateToLastComplete', 'noteRecover', 'writeRecoverMark']
    .forEach(function (n) {
      A(S[n] === undefined, 'A1b 内部函数 ' + n + ' 未挂上出口面（能力内建，不加接口）');
    });
  // 家族四处同批登记
  const fam = S.classifyKey(PROBE_BAK), famM = S.classifyKey(PROBE_MARK);
  A(fam.family === 'recover' && fam.kind === 'bak' && fam.chat === PROBE,
    'A2 后备键归 `recover` 家族（实 ' + JSON.stringify(fam) + '）');
  A(famM.family === 'recover' && famM.kind === 'recovered',
    'A2b 自愈标记键同族（实 ' + JSON.stringify(famM) + '）');
  // 判定次序：`_bak` 满足 state 正则的负向断言 ⇒ 若不先判 recover 就会被吞成「另一个聊天」
  A(S.classifyKey(PROBE_MAIN).family === 'state', 'A2c 主键仍是 state（次序不得把主键抢走）');
  A(S.classifyKey(PROBE_MAIN + '_corrupt_123').family === 'corrupt', 'A2d 隔离副本仍是 corrupt（不被 recover 抢）');
  A(S.classifyKey('worldaxis_state_other_syncrev').family === 'stateDerived', 'A2e 同步修订号仍归 stateDerived');
  // families / perFamilyBytes 两份列表必须同批有 recover
  LS.setItem(PROBE_MAIN, goodPayload('fam-probe'));
  LS.setItem(PROBE_BAK, goodPayload('fam-probe'));
  const ss = S.storageStat();
  A(typeof ss.families.recover === 'number' && ss.families.recover >= 1,
    'A3 storageStat().families.recover 计入（实 ' + ss.families.recover + '）');
  A(typeof ss.perFamilyBytes.recover === 'number' && ss.perFamilyBytes.recover > 0,
    'A3b perFamilyBytes.recover 同步计入（实 ' + ss.perFamilyBytes.recover + ' B）');
  A(ss.families.state >= 1 && ss.families.recover >= 1,
    'A3c state 与 recover 各占自己的格子（state ' + ss.families.state + ' / recover ' + ss.families.recover + '）');
  cleanupProbe();

  auditAnchors(A);

  // ── B 运行时：三级各真跑一次 ──
  const hits0 = S.loadStat().hits;
  const err0 = S.loadStat().errors;

  // B1 L1：头完好 + 尾截断（无闭合） ⇒ 截到最后完整对象
  cleanupProbe();
  LS.setItem(PROBE_MAIN, goodPayload('L1') + ',"tail":"trunc');
  const rep0 = S.loadStat().repairs || 0;
  const r1 = S.load(PROBE);
  const ls1 = S.loadStat();
  A(r1 !== null && r1.meta && r1.meta.tag === 'L1',
    'B1 L1 截断修复：返回头部的完整世界（tag ' + (r1 && r1.meta && r1.meta.tag) + '）');
  A(ls1.lastRepair && ls1.lastRepair.stage === 'L1-truncate' && ls1.lastRepair.droppedChars > 0,
    'B1b 归因是 L1-truncate 且报出丢弃字符数（实 ' + JSON.stringify(ls1.lastRepair) + '）');
  A((ls1.repairs || 0) === rep0 + 1, 'B1c repairs 推进 1（实 ' + ls1.repairs + '）');
  A(ls1.lastRepair.filled >= 0 && ls1.lastRepair.marked === true, 'B1d 补齐字段并落下自愈标记');
  const l1Back = JSON.parse(LS.getItem(PROBE_MAIN));
  A(l1Back.meta && l1Back.meta.tag === 'L1', 'B1e 修复结果已**写回主键**（不是只在内存里好看）');
  A(!!LS.getItem(PROBE_MARK), 'B1f 自愈标记键已落盘（' + PROBE_MARK + '）');
  const mk1 = JSON.parse(LS.getItem(PROBE_MARK));
  A(mk1.stage === 'L1-truncate' && typeof mk1.droppedChars === 'number',
    'B1g 标记内容可复核（stage ' + mk1.stage + ' / dropped ' + mk1.droppedChars + '）');
  // 既有契约不变：errors++ 且原始损坏现场逐字节保留在隔离键
  A(ls1.errors === err0 + 1, 'B1h errors 照旧 +1（修复是追加，不是替换那句计数）');
  const corKeys = Object.keys(LS._dump()).filter(function (k) { return k.indexOf(PROBE_MAIN + '_corrupt_') === 0; });
  A(corKeys.length >= 1, 'B1i 损坏现场仍被隔离（' + corKeys.length + ' 个键）');
  A(corKeys.every(function (k) { return LS.getItem(k) === goodPayload('L1') + ',"tail":"trunc'; }),
    'B1j 隔离内容与损坏现场逐字节一致（修复不得动现场）');

  // B2 L2：主键无任何 `}` 可截（L1 必败） + 后备键完好
  cleanupProbe();
  LS.setItem(PROBE_MAIN, '{"schemaVersion":1,"meta":{"trunc');
  LS.setItem(PROBE_BAK, goodPayload('L2'));
  const rep2 = S.loadStat().repairs || 0;
  const r2 = S.load(PROBE);
  const ls2 = S.loadStat();
  A(r2 !== null && r2.meta && r2.meta.tag === 'L2',
    'B2 L2 后备键修复：L1 无 `}` 可截 ⇒ 取回独立的后备世代（tag ' + (r2 && r2.meta && r2.meta.tag) + '）');
  A(ls2.lastRepair && ls2.lastRepair.stage === 'L2-backup' && ls2.lastRepair.droppedChars === 0,
    'B2b 归因是 L2-backup（与 L1 分开：一个是本份的头，一个是**另一份**世代）');
  A((ls2.repairs || 0) === rep2 + 1, 'B2c repairs 推进 1');
  const l2Back = JSON.parse(LS.getItem(PROBE_MAIN));
  A(l2Back.meta && l2Back.meta.tag === 'L2', 'B2d 后备世代已写回主键（下次开机不再坏）');

  // B3 L3：三级全败 ⇒ 仍返回 null（「绝不自造一个世界」）
  cleanupProbe();
  LS.setItem(PROBE_MAIN, '{"schemaVersion":1,"meta":{"trunc');   // 无 `}`
  const rep3 = S.loadStat().repairs || 0;
  const r3 = S.load(PROBE);
  const ls3 = S.loadStat();
  A(r3 === null, 'B3 L3：无 `}` 可截且无后备键 ⇒ 仍返回 null（绝不自造世界）');
  A(ls3.lastRepair && ls3.lastRepair.ok === false && ls3.lastRepair.stage === 'none',
    'B3b 未救回时如实报告（stage=none / ok=false，实 ' + JSON.stringify(ls3.lastRepair) + '）');
  A((ls3.repairs || 0) === rep3, 'B3c 未救回不得推进 repairs（防「修复率」被无修复凑数）');

  // B4 修复不得计入 hits（它不是「载入成功」，是「救回一份残缺现场」）
  cleanupProbe();
  LS.setItem(PROBE_MAIN, goodPayload('HITS') + ',"tail":"x');
  const h0 = S.loadStat().hits;
  S.load(PROBE);
  A(S.loadStat().hits === h0, 'B4 修复不计入 hits（hits ' + h0 + ' -> ' + S.loadStat().hits + '）');
  A(S.loadStat().repairs >= 1, 'B4b 而 repairs 有账（两件事分开记）');

  // B5 写回失败 ⇒ 不返回现场（防「内存里看着好了、重启又坏」）
  cleanupProbe();
  LS.setItem(PROBE_MAIN, goodPayload('WRITEFAIL') + ',"tail":"x');
  const rawSet = LS.setItem;
  const rep5 = S.loadStat().repairs || 0;
  let r5 = 'NOT-RUN';
  let ls5 = null;
  try {
    LS.setItem = function (k, v) {
      if (k === PROBE_MAIN) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      return rawSet.call(LS, k, v);
    };
    r5 = S.load(PROBE);
    ls5 = S.loadStat();
  } finally { LS.setItem = rawSet; }
  A(r5 === null, 'B5 写回失败 ⇒ 不返回该现场（磁盘仍是坏的，不许假装修好）');
  A(ls5 && ls5.lastRepair && ls5.lastRepair.ok === false && ls5.lastRepair.writeReason,
    'B5b 如实标注写失败归因（实 ' + JSON.stringify(ls5 && ls5.lastRepair) + '）');
  A((ls5.repairs || 0) === rep5, 'B5c 写回失败不计 repairs');

  // B6 探针聊天零残留（锁不得污染后续块）
  const dropped = cleanupProbe();
  cleanupProbe();
  A(dropped > 0, 'B6 探针键已清（释放 ' + dropped + ' 个键；不断言具体数，断言「清过」）');
  A(Object.keys(LS._dump()).filter(function (k) { return k.indexOf('worldaxis_state_' + PROBE) === 0; }).length === 0,
    'B6b 探针聊天零残留');
  const keepStateKeys = function (ks) {
    return ks.filter(function (k) { return k.indexOf('worldaxis_state_') === 0 && k.indexOf('worldaxis_state_' + PROBE) !== 0; }).sort().join(',');
  };
  const othersAfter = keepStateKeys(Object.keys(LS._dump()));
  const setO = othersBefore ? othersBefore.split(',') : [];
  const setA = othersAfter ? othersAfter.split(',') : [];
  const added = setA.filter(function (k) { return setO.indexOf(k) < 0; });
  const removed = setO.filter(function (k) { return setA.indexOf(k) < 0; });
  A(othersAfter === othersBefore, 'B6c 非探针键集合前后逐字一致（探针只动自己的键）；新增[' + added.join('、') + '] 移除[' + removed.join('、') + ']');

  // ── C 不变式 ──
  const before = rd(STORE_REL);
  const q1 = S.loadStat(), q2 = S.loadStat();
  A(JSON.stringify(q1) === JSON.stringify(q2), 'C1 loadStat 连调幂等');
  const v1 = S.verifyState(PROBE), v2 = S.verifyState(PROBE);
  A(JSON.stringify(v1) === JSON.stringify(v2), 'C1b verifyState 连调幂等（只读探针）');
  A(rd(STORE_REL) === before, 'C2 判据纯只读：连调后产品文件逐字未变');
  const rpt = S.exportAuditReport({ minBytes: 64 });
  A(typeof rpt === 'string' && rpt.indexOf('自愈痕迹') >= 0, 'C3 体积/键审计报告透出 recover 段（自愈痕迹可见）');
}

function runNegative(A) {
  const fresh = require('./ui-gate-sync.js').fresh;
  const S0 = rd(STORE_REL);

  // N1 破坏「形如世界存档」判据 ⇒ 无关 JSON 片段会被当世界救回（比归零更坏）
  const n1src = breakOnce(S0, ANCHORS.aWorldLike.txt, 'const worldLike = true;', 'N1');
  const e1 = fresh({ srcOverride: { 'core/store.js': n1src } });
  const LS1 = global.localStorage;
  //   喂入必须是「**parse 失败**、但 L1 截断后能得到一个完整对象」的形态，否则根本走不到修复路径：
  //   若喂一个能 parse 成功的片段，load() 会直接 `hits++` 原样返回（那条路径上判据压根不被执行）——
  //   本锁首版就是这么写的，两个负控制都成了空转，正是「负控制假绿」的第二形。
  LS1.setItem(PROBE_MAIN, '{"unrelated":"json-fragment"},"tail":"trunc');
  const rn1 = e1.WA.store.load(PROBE);
  A(rn1 !== null && rn1.unrelated === 'json-fragment',
    'N1b 装载破坏副本 ⇒ 无关 JSON 片段被当世界救回（实 ' + JSON.stringify(rn1) + '）——证明原版那道判据真在挡');
  cleanupProbe();

  // N2 破坏「修复不计 hits」⇒ 修复被记成「载入成功」
  const n2src = breakOnce(S0, ANCHORS.aRepairs.txt,
    '__loadStat.hits = (__loadStat.hits || 0) + 1;', 'N2');
  const e2 = fresh({ srcOverride: { 'core/store.js': n2src } });
  const LS2 = global.localStorage;
  LS2.setItem(PROBE_MAIN, goodPayload('N2') + ',"tail":"x');
  const h2 = e2.WA.store.loadStat().hits;
  e2.WA.store.load(PROBE);
  A(e2.WA.store.loadStat().hits === h2 + 1,
    'N2b 装载破坏副本 ⇒ 修复被计入 hits（' + h2 + ' -> ' + e2.WA.store.loadStat().hits + '）——证明 B4 真在测这条口径');
  cleanupProbe();

  // N3 破坏 recover 家族分类 ⇒ `_bak` 被吞成「另一个聊天」（纪律⑩⑪ 的现场）
  const n3src = breakOnce(S0, ANCHORS.aFamily.txt, '/* recover 分类已摘除 */', 'N3');
  const e3 = fresh({ srcOverride: { 'core/store.js': n3src } });
  const f3 = e3.WA.store.classifyKey(PROBE_BAK);
  A(f3.family === 'state' && f3.chat === PROBE + '_bak',
    'N3b 装载破坏副本 ⇒ 后备键被吞成「另一个聊天」（family ' + f3.family + ' / chat ' + JSON.stringify(f3.chat) + '）'
    + '——证明 A2 的次序判据真在挡「后备键参与别人的存档对账」');
  cleanupProbe();

  // N4 破坏「写回失败不返回现场」⇒ 返回一份磁盘上并不存在的世界
  // 破坏点选在「写回那一步」：把它换成恒成功的假句柄 ⇒ 写回失败也会把现场当修好了交出去。
  const n4src = breakOnce(S0, ANCHORS.aWriteBack.txt, 'const w = { ok: true, reason: null };', 'N4');
  const e4 = fresh({ srcOverride: { 'core/store.js': n4src } });
  const LS4 = global.localStorage;
  LS4.setItem(PROBE_MAIN, goodPayload('N4') + ',"tail":"x');
  const rawSet4 = LS4.setItem;
  let rn4 = 'NOT-RUN';
  try {
    LS4.setItem = function (k, v) {
      if (k === PROBE_MAIN) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      return rawSet4.call(LS4, k, v);
    };
    rn4 = e4.WA.store.load(PROBE);
  } finally { LS4.setItem = rawSet4; }
  A(rn4 !== null && rn4 !== 'NOT-RUN',
    'N4b 装载破坏副本 ⇒ 写回失败也把现场当「修好了」交出去（实 ' + (rn4 === 'NOT-RUN' ? rn4 : (rn4 && rn4.meta && rn4.meta.tag)) + '）'
    + '——证明 B5 真在挡「重启又坏」的假修复');
  cleanupProbe();

  // N5 双向自证：原版上同款判据必须为真
  const e5 = fresh({});
  const LS5 = global.localStorage;
  LS5.setItem(PROBE_MAIN, '{"unrelated":"json-fragment"},"tail":"trunc');
  const ro = e5.WA.store.load(PROBE);
  A(ro === null, 'N5 原版上「不像世界存档的片段不得被救回」为真，破坏副本上为假（N1b）—— 两向自证成立');
  cleanupProbe();

  A(rd(STORE_REL) === S0, 'N6 真文件在全部负控制跑完后逐字未变（四处破坏全是内存副本）');
  A(global.localStorage.getItem('worldaxis_state_' + PROBE) === null, 'N7 负控制后探针键零残留');
}

module.exports = { ANCHORS: ANCHORS, runAll: runAll, runNegative: runNegative };

if (require.main === module) {
  let P = 0, F = 0;
  const A = function (c, m) { if (c) { P += 1; } else { F += 1; console.log('  x ' + m); } };
  try { require('./mock.js'); require('./ui-gate-sync.js').fresh({}); runAll(A); runNegative(A); }
  catch (e) { F += 1; console.log('  x 异常：' + (e && e.stack)); }
  console.log('STATE-REPAIR-V2108: ' + (F === 0 ? 'pass（' + P + ' 项）' : 'FAIL ' + F + ' / ' + (P + F)));
  process.exit(F === 0 ? 0 : 1);
}

#!/usr/bin/env node
// WorldAxis tests/coord-v2970.js —— v2.97.0（O10 回放语义坐标）
//
// 【它治的病：复核结论定位不到现场】
//   v2.89.0 的磁带只记**位置**（第 7 格对不上）。可「第 7 格」对作者毫无意义——
//   他要的是「第 2 轮 causal.tick 那一段里第 3 步对不上」。位置量与语义量之间
//   此前没有任何桥，于是复核结论虽然为真，却回不到现场去查。
//
// 【口径（三条，全是否定式）】
//   ① 坐标是**标记出来的**，不是猜出来的。没人标记时照实报 `round:null` / `label:''`
//      ——为无标记的磁带编一个轮次，比没有坐标更坏（它让复核结论不可信）。
//   ② 坐标只在**录制时**落进磁带：回放期 `take()` 不写磁带，故回放不会把坐标改掉。
//   ③ `n`（段内第几步）由磁带长度现算，是**位置真源**；坐标是附加的语义层，两者分列
//      ——坐标标错时，位置仍然对得上。
//
// 【判据】
//   A 静态面：常量 `__mark` + 两个导出口 + 消费方（causal.record / replayWith / evidence）。
//   B 运行时面（真装载真调用）：
//     B1 markCoord 返回**上一个标记**（成对还原的习俗；不内置栈——「标记是调用方的事」）
//     B2 未标记时坐标照实报空（round:null / label:'' / marked:false）——不编一个默认轮次
//     B3 标记之后磁带里**逐格带坐标**（r / s 与当时标记一致）
//     B4 `n` 是位置真源：标签写错也不影响 n 的连续性（坐标标错时位置仍对得上）
//     B5 回放期不写磁带 ⇒ 坐标不被回放改掉（口径②）
//     B6 verifyTape 报 withCoord / orphanSlots / rounds（0 时能指着第几轮第几步，>0 时只能说第几格）
//     B7 stopReplay 报 firstMissCoord（**第一次断点**才是要找的那一处，与 lastMiss 分列）
//     B8 causal.record 打标记并**成对还原**（失败录制也不把后续整局标成 record 段）
//     B9 evidence() 带出 coord 与 coordGaps
//     B10 roundNow 未装载 evolution ⇒ null 而非 0（0 是合法的第一轮）
//   C 不变式：坐标不参与**判定**（verifyTape 的 ok 只由值与通道决定）；
//             磁带里坐标字段不改变 n 的语义。
//   N1–N6 负控制：真源码破坏 ⇒ 加载破坏副本 ⇒ 在副本上重跑同款真判据。
'use strict';
const fs = require('fs');
const path = require('path');
const { fresh } = require('./ui-gate-sync.js');
const ROOT = path.resolve(__dirname, '..');
const RAND = 'core/rand.js', CAUSAL = 'engines/causal.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js';
let PASS = 0, FAIL = 0;
const a = (ok, msg) => { if (ok) PASS++; else { FAIL++; console.log('  ✗ ' + msg); } };
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function must1(s, x, tag) { const n = hits(s, x); if (n !== 1) throw new Error('anchor hits != 1 (' + n + ') :: ' + tag); return n; }
// ══════════════ 真源码破坏锚点（各自恰中 1 次）══════════════
const ANCHORS = {
  // 口径① 未标记时**不编**默认轮次（照实报 null）
  NO_FAKE_ROUND: { rel: RAND, txt: "__mark = { round: (round === undefined ? null : round), label: String(label === undefined || label === null ? '' : label).slice(0, 40)," },
  // 口径① 位置真源 n 由磁带长度现算（不取自标记）
  N_FROM_LENGTH: { rel: RAND, txt: "n: __tape.entries.length + 1, r: __mark.round, s: __mark.label });" },
  // 口径③ verifyTape 报无坐标格数（0 与 >0 是两句不同的话）
  ORPHAN_SLOTS: { rel: RAND, txt: "orphanSlots: es.filter(function (e) { return !coordHas(e); }).length," },
  // 口径② 回放期不记磁带（take 不调 noteTape）
  REPLAY_NO_WRITE: { rel: RAND, txt: "if (__mode === 'replay') {\n      const r = take(name, 'i');" },
  // 口径 B10 未装载 evolution ⇒ null 而非 0
  ROUND_NO_ZERO: { rel: CAUSAL, txt: "    return null;\n  }\n  function state()" },
  // 口径 B8 成对还原标记
  //   ⚠ 这一对在 causal.js 里出现两次（record / replayWith 各一份，逐字相同），
  //   故锚点带上**函数身份**（`const prevMark = ... roundNow()` 那一段）才唯一。
  PAIR_RESTORE: { rel: CAUSAL, txt: "    const prevMark = (WA.rand && typeof WA.rand.markCoord === 'function')\n      ? WA.rand.markCoord(roundNow(), 'causal.record') : null;\n    let result = null, err = null;\n    try {\n      result = fn();\n    } catch (e) {\n      err = (e && e.message) ? e.message : String(e);\n    } finally {\n      // 无条件收卷：录制态漏出去 = 整局被静默记录，这比丢一卷磁带严重得多\n      // v2.89.0 O2：直呼产品导出（不绕别名 `tz`）——别名让**引用面门禁看不见这次调用**，\n      //   于是 endTape 被判成「导出即无消费方」的死子面（实测：dead 443→446 里的一条）。\n      //   守卫已过（tz 非空）之后没有理由再绕一层：配对出口的开门与关门都该被看得见。\n      try { if (WA.rand && WA.rand.endTape) stat.lastTape = WA.rand.endTape(); } catch (e2) {}\n      try {\n        if (prevMark && WA.rand && WA.rand.markCoord) WA.rand.markCoord(prevMark.round, prevMark.label, prevMark.at);\n        else if (WA.rand && WA.rand.markCoord) WA.rand.markCoord(null, '', 0);\n      } catch (e3) {}" }
};
const BREAK = {
  NO_FAKE_ROUND: "__mark = { round: (round === undefined ? 0 : round), label: String(label === undefined || label === null ? '' : label).slice(0, 40),",
  N_FROM_LENGTH: "n: (__mark.round === null ? 0 : __mark.round), r: __mark.round, s: __mark.label });",
  ORPHAN_SLOTS: "orphanSlots: 0, // 破坏：恒报零 ⇒ 「这句话这次说不出口」永远说不出口",
  REPLAY_NO_WRITE: "if (__mode === 'no-replay-here') {\n      const r = take(name, 'i');",
  ROUND_NO_ZERO: "    return 0;\n  }\n  function state()",
  PAIR_RESTORE: "    const prevMark = (WA.rand && typeof WA.rand.markCoord === 'function')\n      ? WA.rand.markCoord(roundNow(), 'causal.record') : null;\n    let result = null, err = null;\n    try {\n      result = fn();\n    } catch (e) {\n      err = (e && e.message) ? e.message : String(e);\n    } finally {\n      // 无条件收卷：录制态漏出去 = 整局被静默记录，这比丢一卷磁带严重得多\n      // v2.89.0 O2：直呼产品导出（不绕别名 `tz`）——别名让**引用面门禁看不见这次调用**，\n      //   于是 endTape 被判成「导出即无消费方」的死子面（实测：dead 443→446 里的一条）。\n      //   守卫已过（tz 非空）之后没有理由再绕一层：配对出口的开门与关门都该被看得见。\n      try { if (WA.rand && WA.rand.endTape) stat.lastTape = WA.rand.endTape(); } catch (e2) {}\n      try {\n        if (false && prevMark && WA.rand && WA.rand.markCoord) WA.rand.markCoord(prevMark.round, prevMark.label, prevMark.at);\n        else if (false && WA.rand && WA.rand.markCoord) WA.rand.markCoord(null, '', 0);\n      } catch (e3) {}"
};
function breakOne(key) {
  const A = ANCHORS[key];
  const s = src(A.rel);
  must1(s, A.txt, key);
  const bad = s.replace(A.txt, BREAK[key]);
  if (bad === s) throw new Error('break no-op :: ' + key);
  return { rel: A.rel, src: bad };
}
// ══════════════ 运行时装置 ══════════════
function seed(WA) {
  WA.store.init();
  WA.store.transact(function (d) {
    d.causal = { chains: [], settled: [], phoneOps: [] };
    d.evolution = d.evolution || {};
    d.evolution.round = 3;
  }, 'v2970c:seed');
  return WA;
}
function env(over) {
  const H = fresh(over ? { srcOverride: over } : undefined);
  seed(H.WA);
  return H;
}
/** 打标记 → 抽几格 → 收卷。返回 {tape, prev}。 */
function recordFew(W, round, label, n) {
  const R = W.rand;
  const prev = R.markCoord(round, label);
  R.beginTape(true);
  for (let i = 0; i < (n || 3); i++) R.next('coord.probe');
  const t = R.endTape();
  return { tape: t.tape, prev: prev };
}
// ══════════════ 同款真判据 ══════════════
/** 口径①：未标记时照实报空（不编一个默认轮次）。 */
function probeNoFakeRound(W) {
  try {
    const R = W.rand;
    const c0 = R.coordOf();
    if (c0.round !== null || c0.label !== '' || c0.marked !== false) return false;
    // 无参调用与显式两参复位都不得留下「默认轮次」或时刻残渣。
    //   补这一段的原因：原探针从不走**无参**形态 ⇒ 破坏成 `round===undefined ? 0` 时它观测不到
    //   （该分支根本没被走到，判据因此是假敏感）。
    R.markCoord();
    const c1 = R.coordOf();
    if (c1.round !== null || c1.label !== '' || c1.marked !== false) return false;
    // at 也必须一起归零 —— 「回到未标记」却带着一个非零时刻，三态自洽性当场被破坏
    //   （这是本版锁当场抓出的产品第二处缺陷，判据在此固定下来）。
    R.markCoord(null, '', 0);
    if (R.coordOf().at !== 0) return false;
    R.beginTape(true); R.next('p'); const t = R.endTape();
    // 磁带格里的坐标也必须是空的（不是 0 / 不是 'default'）
    const e = t.tape.entries[0];
    return e.r === null && e.s === '';
  } catch (e) { return false; }
}
/** 口径③：n 由磁带长度现算（位置真源，与坐标分列）。 */
function probeNFrame(W) {
  try {
    const R = W.rand;
    const prev = R.markCoord(99, '标错也照样');
    R.beginTape(true);
    R.next('p'); R.next('p'); R.next('p');
    const t = R.endTape();
    R.markCoord(prev.round, prev.label);
    const ns = t.tape.entries.map(function (e) { return e.n; });
    return ns.join(',') === '1,2,3' && t.tape.entries[0].r === 99;
  } catch (e) { return false; }
}
/** 口径③：orphanSlots 把「能定位到轮」与「只能定位到格」分成两句不同的话。 */
function probeOrphan(W) {
  try {
    const R = W.rand;
    // 全标记 ⇒ orphanSlots 应为 0
    const p1 = R.markCoord(1, 'a');
    R.beginTape(true); R.next('p'); R.next('p'); const t1 = R.endTape();
    const v1 = R.verifyTape(t1.tape);
    R.markCoord(p1.round, p1.label);
    // 无标记 ⇒ 每一格都是 orphan
    R.beginTape(true); R.next('p'); const t2 = R.endTape();
    const v2 = R.verifyTape(t2.tape);
    return v1.orphanSlots === 0 && v1.withCoord === 2 && v1.rounds.length === 1
      && v2.orphanSlots === 1 && v2.withCoord === 0;
  } catch (e) { return false; }
}
/** 口径②：回放期不写磁带（坐标因此不会被回放改掉）。 */
function probeReplayNoWrite(W) {
  try {
    const R = W.rand;
    const p = R.markCoord(4, 'causal.record');
    // 走**标识流**（`id()` → `draw()` → `take(name,'i')`）：它是回放期第二条真实取数路径。
    //   为什么不走 `next()`：`next()` 那条即使被破坏成 live 抽取，`noteTape` 仍会被
    //   `!__tape.open` 拦住 ⇒ 磁带一样逐字节不变，判据**观测不到破坏**（本段实测）。
    R.beginTape(true); R.id('zz'); const t = R.endTape();
    const before = JSON.stringify(t.tape.entries);
    // 换一个完全不同的标记，再回放：磁带若被写，坐标会变
    R.markCoord(77, 'causal.replay');
    const rp = R.replay(t.tape);
    if (!rp.ok) return false;
    R.id('zz');
    const after = JSON.stringify(t.tape.entries);
    const st = R.stopReplay();
    R.markCoord(p.round, p.label);
    // 两件事一并验：① 磁带逐字节不变；② 回放**真的从磁带取数**（used > 0）。
    //   缺了②，判据只证「没写」而不证「走了回放路径」——破坏成 live 抽取时它照样绿。
    return before === after && st.used > 0;
  } catch (e) { return false; }
}
/** 口径③：stopReplay 报**第一次**断点坐标（与 lastMiss 分列）。 */
function probeFirstMiss(W) {
  try {
    const R = W.rand;
    const p = R.markCoord(5, 'seg');
    R.beginTape(true); R.next('a'); R.next('b'); R.next('c'); const t = R.endTape();
    R.replay(t.tape);
    // 自纠（本段第六例）：原探针第 1 格就断 —— 于是 `firstMissCoord.n` 无论实现取「磁带第一格」
    //   还是「第一次断点」都等于 1，判据**根本不具备区分力**（它测的是同一个数）。
    //   真正的形态是：先命中几格，断在中间。这里第 1 格命中、第 2 格断 ⇒ 期望 n 为 2。
    R.next('a');          // 第 1 格：命中（断点不在这里）
    R.next('q');          // 第 2 格：通道不符 ⇒ 第一次断点在此
    const st = R.stopReplay();
    R.markCoord(p.round, p.label);
    // 断点在**第 2 格**（先命中 a，再在 b 处断）：firstMissCoord.n 必须为 2。
    //   若它报 1，说明取的是「磁带第一格」——那答的是「磁带从哪开始」，不是「第一次断在哪」。
    return !!st.firstMissCoord && st.firstMissCoord.n === 2
      && !!st.byRound && st.rounds === 1 && st.byRound['5'] === 2;   // rounds 是轮数（数字），byRound 才是逐轮表：两句分开念
  } catch (e) { return false; }
}
/** 口径 B10：evolution 缺席 ⇒ round 为 null 而非 0。 */
function probeRoundNoZero(W) {
  try {
    const keep = W.evolution;
    W.evolution = undefined;
    // 自纠（本段第七例）：原探针打的是 `evidence().coord` —— 那是**未标记**态的快照，
    //   `roundNow` 根本没被走到 ⇒ 破坏成 `return 0` 时它照样绿（假敏感）。
    //   `roundNow` 的真消费点是**录制期的坐标标记**，故在 fn 里抓那一刻的坐标。
    let seen = null;
    const r = W.causal.record(function () { seen = W.rand.coordOf(); return W.causal.tick({ now: 1000 }); });
    W.evolution = keep;
    return !!seen && seen.round === null && seen.label === 'causal.record' && r.ok === true;
  } catch (e) { return false; }
}
/** 口径 B8：成对还原（一次失败录制不把后续整局标成 record 段）。 */
function probePairRestore(W) {
  try {
    const R = W.rand;
    const before = JSON.stringify(R.coordOf());
    // 故意让 fn 抛：record 必须在 finally 里把标记还原
    const r = W.causal.record(function () { throw new Error('boom'); });
    const after = JSON.stringify(R.coordOf());
    return r.ok === false && before === after;
  } catch (e) { return false; }
}
function runAll(a) {
  const randSrc = src(RAND), causSrc = src(CAUSAL), diagSrc = src(DIAG), panSrc = src(PANEL);
  // ── A 静态面 ──
  a(randSrc.indexOf('let __mark = { round: null, label: \'\', at: 0 };') >= 0,
    'v2970: [A1] 标记槽在位，初值就是**空**（round null / label 空）——不给「默认轮次」留位置');
  a(randSrc.indexOf('markCoord: markCoord,') >= 0 && randSrc.indexOf('coordOf: coordOf,') >= 0,
    'v2970: [A2] 两个导出口在位（markCoord / coordOf）');
  a(causSrc.indexOf("markCoord(roundNow(), 'causal.record')") >= 0
    && causSrc.indexOf("markCoord(roundNow(), 'causal.replay')") >= 0,
    'v2970: [A2] 两个真消费方在位（录制与回放各自打标记——坐标不是给测试看的装饰）');
  // 自纠（本段第五例）：原判据要求 `coordNow()` 这个字面 —— 而它不是公开 API（causal 的内部函数，
  //   未导出），诊断**不可能**合法地调用它。判据要求一个不该出现的东西，等于把正确实现判成失败。
  //   真消费点是 rand 的读口 `coordOf()`（诊断直读现场，与它直读 tape / verifyTape 同规格）。
  a(diagSrc.indexOf('coordOf()') >= 0,
    'v2970: [A3] 诊断节真读坐标（secCausal 直取 coordOf()——无消费方的导出等于死面，本仓库判据只认调用点）');
  a(panSrc.indexOf('coordGaps') >= 0 || panSrc.indexOf('coords') >= 0,
    'v2970: [A3] 面板真读坐标面（回放证据里带 coord / coordGaps / coords）');
  // ── B 运行时面 ──
  const W = env().WA;
  const R = W.rand;
  // B1 markCoord 返回上一个标记
  const c0 = R.coordOf();
  a(c0.round === null && c0.label === '' && c0.marked === false,
    'v2970: [B1] 未标记时照实报空（round:null / label:\'\' / marked:false）——**不编一个默认轮次**');
  const prev1 = R.markCoord(2, 'a');
  a(prev1.round === null && prev1.label === '',
    'v2970: [B1] markCoord 返回**上一个标记**（首次为空）——成对还原靠它，不内置栈（「标记是调用方的事」）');
  const prev2 = R.markCoord(5, 'b');
  a(prev2.round === 2 && prev2.label === 'a',
    'v2970: [B1] 第二次调用返回第一次那个标记（2/a）——链式标记因此可以逐层还原');
  const c2 = R.coordOf();
  a(c2.round === 5 && c2.label === 'b' && c2.marked === true && c2.at > 0,
    'v2970: [B1] coordOf 读出当前标记（含 at 时刻——坐标带「什么时候标的」，不只是一个编号）');
  R.markCoord(prev2.round, prev2.label);
  a(R.coordOf().round === 2, 'v2970: [B1] 按返回值还原之后回到上一层标记');
  R.markCoord(null, '');
  // B3 标记之后逐格带坐标
  const rec = recordFew(W, 9, 'round9.seg', 3);
  const ents = rec.tape.entries;
  a(ents.length === 3 && ents.every(function (e) { return e.r === 9 && e.s === 'round9.seg'; }),
    'v2970: [B3] 标记之后磁带**逐格带坐标**（3 格全是 r=9 / s=round9.seg）');
  a(ents.map(function (e) { return e.n; }).join(',') === '1,2,3',
    'v2970: [B3] `n` 是位置真源（1,2,3 由磁带长度现算，与坐标分列）');
  R.markCoord(rec.prev.round, rec.prev.label);
  // B4 坐标标错时位置仍对得上
  a(probeNFrame(W), 'v2970: [B4] 标签写错（99）也不影响 n 的连续性——坐标是附加层，位置仍对得上');
  // B5 回放不写磁带
  a(probeReplayNoWrite(W), 'v2970: [B5] 回放期磁带**不被写**（先记的坐标逐字节不变）——口径②的运行时证据');
  // B6 verifyTape 的坐标面
  a(probeOrphan(W), 'v2970: [B6] verifyTape 报 withCoord / orphanSlots / rounds（全标记 ⇒ orphan 0；无标记 ⇒ 每格都是 orphan）');
  // B7 firstMissCoord
  a(probeFirstMiss(W), 'v2970: [B7] stopReplay 报 firstMissCoord 与 byRound（**第一次**断点才是要找的那一处，与 lastMiss 分列）');
  // B8 成对还原
  a(probePairRestore(W), 'v2970: [B8] 录制抛异常也**成对还原**标记（一次失败录制不把后续整局标成 record 段）');
  const recOk = (function () {
    try {
      const p0 = JSON.stringify(R.coordOf());
      const r = W.causal.record(function () { return W.causal.tick({ now: 1000 }); });
      const p1 = JSON.stringify(R.coordOf());
      return r.ok === true && r.tape && p0 === p1;
    } catch (e) { return false; }
  })();
  a(recOk, 'v2970: [B8] 成功录制同样成对还原（录完标记回到录制前——否则下一段的坐标会被上一段污染）');
  // B9 evidence 带出 coord / coordGaps
  const W9 = env().WA;
  W9.causal.record(function () { return W9.causal.tick({ now: 1000 }); });
  const ev9 = W9.causal.evidence();
  a(ev9.coord && typeof ev9.coord.marked === 'boolean',
    'v2970: [B9] evidence() 带出当前坐标（复核结论能指着「第几轮第几步」说话）');
  a(ev9.coordGaps === null || (typeof ev9.coordGaps.orphanSlots === 'number'
    && typeof ev9.coordGaps.withCoord === 'number' && Array.isArray(ev9.coordGaps.rounds)),
    'v2970: [B9] evidence() 带出 coordGaps（orphanSlots / withCoord / rounds）——它就是「这句话能不能说出口」的判据');
  // B10 roundNow 缺席 ⇒ null
  a(probeRoundNoZero(W), 'v2970: [B10] evolution 缺席时坐标 round 为 **null 而非 0**（0 是合法的第一轮，拿它冒充「不知道」会让坐标面从第一格起就说假话）');
  // B11 面板 / 诊断真消费
  const W11 = env().WA;
  W11.causal.record(function () { return W11.causal.tick({ now: 1000 }); });
  const dg11 = W11.toolDiag.collect();
  a(!!(dg11.causal && dg11.causal.coord !== undefined && dg11.causal.coordGaps !== undefined),
    'v2970: [B11] 诊断节 causal 面读到坐标与覆盖缺口（coord=' + JSON.stringify(dg11.causal && dg11.causal.coord)
      + ' / gap=' + JSON.stringify(dg11.causal && dg11.causal.coordGaps) + '）');
  // ── C 不变式 ──
  const Wc = env().WA; const Rc = Wc.rand;
  const pc = Rc.markCoord(1, '不变式');
  Rc.beginTape(true); Rc.next('a'); Rc.next('a'); const tc = Rc.endTape();
  const vc1 = Rc.verifyTape(tc.tape);
  // 换掉坐标再复核同一卷磁带：ok 结论**不得**因坐标变化而变（坐标不参与判定）
  Rc.markCoord(999, '完全不同的段');
  const vc2 = Rc.verifyTape(tc.tape);
  Rc.markCoord(pc.round, pc.label);
  a(vc1.ok === vc2.ok && vc1.checked === vc2.checked,
    'v2970: [C1] 坐标**不参与判定**（换掉标记后同一卷磁带的 ok / checked 不变——坐标是话语层，不是判据层）');
  a(vc1.orphanSlots === 0 && typeof vc1.withCoord === 'number',
    'v2970: [C1] 全标记的磁带 orphanSlots 为 0（「能定位到第几轮第几步」这句话说得出口）');
}
function runNegative(a) {
  const randSrc = src(RAND), causSrc = src(CAUSAL);
  Object.keys(ANCHORS).forEach(function (k) { must1(src(ANCHORS[k].rel), ANCHORS[k].txt, k); });
  a(hits(randSrc, ANCHORS.NO_FAKE_ROUND.txt) === 1 && hits(causSrc, ANCHORS.ROUND_NO_ZERO.txt) === 1,
    'v2970c: [N0] 六个破坏锚点在真源码各恰中 1 次');
  let threw = 0;
  try { must1(randSrc, '锚点根本不在源码里__v2970c', 'self'); } catch (e) { threw++; }
  try { must1(randSrc + ANCHORS.N_FROM_LENGTH.txt, ANCHORS.N_FROM_LENGTH.txt, 'self'); } catch (e) { threw++; }
  a(threw === 2, 'v2970c: [N0] 锚点工具两向自证：不存在 / 不唯一都必须抛（实抛 ' + threw + '/2）');
  // N1 原版干净（每条探针独立实例——它们都会写标记/磁带，共享实例会读到前一条的手指印）
  const n1 = [['noFakeRound', probeNoFakeRound], ['nFrame', probeNFrame], ['orphan', probeOrphan],
    ['replayNoWrite', probeReplayNoWrite], ['firstMiss', probeFirstMiss],
    ['roundNoZero', probeRoundNoZero], ['pairRestore', probePairRestore]]
    .map(function (p) { return { name: p[0], ok: p[1](env().WA) }; });
  const bad = n1.filter(function (x) { return !x.ok; }).map(function (x) { return x.name; });
  a(bad.length === 0, 'v2970c: [N1] 原版上七条判据全部干净（不干净的是 ' + (bad.join(',') || '无') + '）');
  // N2–N7 逐锚
  function neg(key, fn, label) {
    const b = breakOne(key);
    const Hn = env({ [b.rel]: b.src });
    const ok = fn(Hn.WA);
    a(ok === false, 'v2970c: [N' + label + '] 拆掉「' + key + '」后判据现形');
    a(!!Hn.WA.rand && typeof Hn.WA.rand.coordOf === 'function',
      'v2970c: [N' + label + '] 破坏副本仍正常装载（不是「装不起来」，是**判据真敏感**）');
  }
  neg('NO_FAKE_ROUND', probeNoFakeRound, '2');
  neg('N_FROM_LENGTH', probeNFrame, '3');
  neg('ORPHAN_SLOTS', probeOrphan, '4');
  neg('REPLAY_NO_WRITE', probeReplayNoWrite, '5');
  neg('ROUND_NO_ZERO', probeRoundNoZero, '6');
  neg('PAIR_RESTORE', probePairRestore, '7');
  // N8 非恒真
  const W8 = env().WA;
  const o1 = W8.rand.coordOf().round;
  W8.rand.markCoord(8, 'x');
  const o2 = W8.rand.coordOf().round;
  a(o1 === null && o2 === 8, 'v2970c: [N8] 非恒真：标记前后 round 从 ' + o1 + ' 变 ' + o2 + '（读数随标记变化）');
  // N9 判据纯度
  const self = src('tests/coord-v2970.js');
  const ok9 = Object.keys(ANCHORS).every(function (k) {
    return hits(self, ANCHORS[k].txt.replace(/\n/g, '\\n')) === 1;
  });
  a(ok9, 'v2970c: [N9] 每条锚点字面量在本文件只出现一次（判据不得引用锚点串）');
}
if (require.main === module) {
  const a2 = function (cond, name) {
    if (cond) { PASS++; }
    else { FAIL++; console.log('  ✗ ' + name); }
  };
  try { runAll(a2); runNegative(a2); }
  catch (e) { FAIL++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (FAIL) { console.log('COORD-V2970: FAIL ' + FAIL + ' / ' + (PASS + FAIL)); process.exit(1); }
  console.log('COORD-V2970: pass（' + PASS + ' 项）');
}
module.exports = { runAll: runAll, runNegative: runNegative, ANCHORS: ANCHORS };
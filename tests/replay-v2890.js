#!/usr/bin/env node
// WorldAxis tests/replay-v2890.js —— v2.89.0（O2 因果回放证据升级）
//
// 【它治的病：可复现只有声明，没有证据】
//   core/rand.js 从 v2.14.0 起就报 `reproducible`（「种子是不是显式定的」），
//   可**没有任何地方能证明这句话**。种子相同的两次运行之间还有一个东西在动：**调用顺序**。
//   同一种子只在「谁在第几步取数、取了几次、走的哪条通道」逐字相同时才给出同一序列；
//   推进一旦分支（条件满足/未满足、链被取消/到期），两侧抽取序列就错位，此后每个数都不同
//   —— 而错位**不会报错**，它只是安静地给出另一套数。于是「这一轮还能重放吗」
//   此前只有两种回答方式：人工比对两份世界状态（而两份本来就不该相同），或者猜。
//
// 【本版口径】
//   ① **磁带记「答案 + 位置」**（`{c: 通道, v: 值, k: 'd'|'i'}` 按顺序）。
//      不记「推导过程」：这样调用顺序变了、**位置对不上会被当场报出来**，而不是静默换一套数。
//   ② **回放不碰派生流**：回放期间取数全走磁带，`streamFor` 连派生都不发生 ⇒
//      退出回放后会话序列与进入前逐位相同（**取证不得改变被取证对象**）。
//   ③ **两条证据答两个问题**，缺一留缝：
//      · `replay()`     —— 重跑同一段代码，证「抽取序列对得上」；会写世界的轮次不能用它；
//      · `verifyTape()` —— 纯算术从种子重算，证「这卷磁带确实出自这个种子」；对任何轮次都能用。
//   ④ **`replayable` 与 `reproducible` 分列**：前者答「这一轮有没有一卷能重放的磁带」，
//      后者答「种子是不是自己定的」。把前者当后者就是失实——本版判据写死了这一条。
//   ⑤ 三条**绝不静默**：通道不符 / 磁带枯竭 / 值非法，一律记 `miss` + `lastMiss{at,want,got,why}`，
//      不猜、不顺延；回放不得抛（取证口自己炸掉比没有取证更坏）。
//   ⑥ 边界如实（本版自纠得出）：复现的是**随机抽取**；id 的**时间戳与递变计数器不参与回放**
//      （实测噪声同、计数器不同）。把它们也复现会让两次回放产出同一个 id，用唯一性换可复现性是净亏。
//
// 【判据】（A 结构 / B 运行时 / C 缺陷锁 / N 负控制）
//   A1 rand 只加 5 口（beginTape / endTape / tape / replay / stopReplay）+ verifyTape，且各有真消费方。
//   A2 两个取数入口各恰有 1 个回放分支（决策流 next、标识流 draw）——漏掉 draw 会让 id 噪声漏出磁带。
//   A3 causal 只加 2 口（record / replayWith），面板与诊断是它们的真消费方。
//   A4 evidence 的 replayable 与 reproducible 是**两个不同表达式**，且 tape 段在场。
//   A5 record 的收卷落在 finally（无条件），否则任何 early return 都会把磁带留在录制态。
//   B1 录制→回放：同 fn 结果逐字一致、verdict=clean、无未命中、磁带走完。
//   B2 取证不改被取证对象：回放后会话序列与「从未回放」的那条逐位相同。
//   B3 位置错位（回放时多抽一次）必须报 positions-mismatch 且给出 want / got / why。
//   B4 磁带枯竭单独归因（exhausted），不与通道不符混成一种。
//   B5 verifyTape 正常为真；篡改任意一格 ⇒ 报假且**第一处分歧的格号准确**。
//   B6 未播种 ⇒ replayable=false 且 blockedBy=auto-seed；播种+录制后 ⇒ true。
//   B7 录制后不留在录制态；回放期间拒收新录制；未收卷的磁带拒绝回放；无值磁带拒绝回放。
//   B8 回放无返回值的 fn 不得抛（本版首跑现场：JSON.stringify(undefined) 不是字符串）。
//   B9 诊断侧只读：secCausal 有 replay/tape 段，且**不调用 replay**（诊断必须零副作用）。
//   C1 identical 只在给了基准时计算（没基准就说「一致」是假话）。
//   C2 磁带通道面与当前模式如实透出（mode / seedMatched / open）。
//   N0 三个锚点在真源码各恰中 1 次；N1 破坏 ⇒ B1 / B3 / B7 各现形；N2 影响面有限；
//      N3 非恒真；N4 锚点工具两向自证（不存在 / 不唯一都必须抛）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const gate = require('./ui-gate-sync.js');
const RAND = path.join(BASE, 'core/rand.js');
const CAUSAL = path.join(BASE, 'engines/causal.js');
const DIAG = path.join(BASE, 'engines/tool-diag.js');
const PANEL = path.join(BASE, 'ui/panel.js');
function src(p) { return fs.readFileSync(p, 'utf8'); }
function randSrc() { return src(RAND); }
function causalSrc() { return src(CAUSAL); }

// ── 三个真源码破坏锚点（各须恰中 1 次）──
const ANCHOR_NEXT = "    if (__mode === 'replay') {\n      const r = take(name, 'd');\n      return r.ok ? r.v : 0;\n    }";
// v2.89.0 O2 自纠：锚点从「位置前进那一行」上移到**位置判定那一行**。
//   实测理由：只破坏 `t.idx++`（位置不前进）时，磁带里恰好只有一个通道，
//   于是回放仍报 clean / miss=0 —— 那不是「吞掉错位」那一类，而是「磁带本来就只有这些」。
//   真正代表「静默换一套数」的破坏是：永远读同一格，**并把不属于自己的值交出去**。
const ANCHOR_IDX = "    const e = (t.idx < t.entries.length) ? t.entries[t.idx] : null;";
// v2.89.0 O2 同步：收卷改为直呼 `WA.rand.endTape`之后，锚点必须跟着走——
//   否则命中数变 0，整套负控制会“全绿”地失效。
const ANCHOR_UNWIND = "      try { if (WA.rand && WA.rand.endTape) stat.lastTape = WA.rand.endTape(); } catch (e2) {}";

/** 锚点命中计数，要求恰为 1（工具两向自证：不存在 / 不唯一都必须抛） */
function hits(s, anchor) {
  const n = s.split(anchor).length - 1;
  if (n !== 1) throw new Error('锚点命中 ' + n + ' 次（要求恰 1 次）: ' + anchor.slice(0, 50));
  return n;
}
function fresh(opts) { return gate.fresh(opts || {}).WA; }
/** 用一支固定脚本驱动随机源，返回它取到的值 */
function draw3(WA) {
  return { a: WA.rand.next('t.a'), b: WA.rand.int(1, 100, 't.b'), c: WA.rand.chance(0.5, 't.c') };
}

function runAll(a) {
  // ─────────────── A 面：结构 ───────────────
  {
    const r = randSrc(), c = causalSrc();
    ['beginTape', 'endTape', 'tape', 'replay', 'stopReplay', 'verifyTape'].forEach(function (k) {
      a(String(r.split('    ' + k + ': ' + k + ',').length - 1) === '1' || r.indexOf('    ' + k + ': ' + k) >= 0,
        'v2890: [A1] rand 导出 ' + k + '（导出即有承诺）');
    });
    a(c.indexOf('    record: record,') >= 0 && c.indexOf('    replayWith: replayWith') >= 0, 'v2890: [A1] causal 导出 record / replayWith');
    // 自纠：causal 里调的是它自己的局部别名 `tz`（`tz = WA.rand`），不是字面上的 `WA.rand.replay(`。
    //   判据认错名就会假失败（此处已实测到）：声言「有消费方」与「真的有消费方」不是同一件事。
    a(c.indexOf('tz.beginTape(true)') >= 0 && c.indexOf('tz.replay(tape)') >= 0,
      'v2890: [A1] causal 是两个新口的真消费方（record 调 beginTape／replayWith 调 replay）');
    a(src(PANEL).indexOf("on('#wa-cw-record'") >= 0, 'v2890: [A1] record 的消费方：面板「录制一轮」');
    a(src(PANEL).indexOf("on('#wa-cw-verify'") >= 0, 'v2890: [A1] verifyTape 的消费方：面板「复核磁带」');
    a(src(DIAG).indexOf('verifyTape') >= 0, 'v2890: [A1] verifyTape 的诊断消费方（secCausal 的 tape.verify）');
    a(r.split("if (__mode === 'replay') {").length - 1 === 2, 'v2890: [A2] 两个取数入口各恰有 1 个回放分支（决策流 next + 标识流 draw）');
    a(r.split('streamFor(name)()').length - 1 === 2, 'v2890: [A2] 派生流取数只在两个 live 分支里（回放分支不派生）');
    const ev = c.slice(c.indexOf('function evidence() {'));
    a(ev.indexOf('replayable: canReplay') >= 0 && ev.indexOf('reproducible: !!(rnd && rnd.reproducible)') >= 0,
      'v2890: [A4] evidence 的 replayable 与 reproducible 是两个不同表达式（合并即失实）');
    a(ev.indexOf('replayBlockedBy') >= 0, 'v2890: [A4] 不可重放时给出原因码（不是一句「否」）');
    a(hits(c, ANCHOR_UNWIND) === 1, 'v2890: [A5] record 的收卷恰有 1 处，且落在 finally 里（无条件）');
    a(c.indexOf('} finally {\n      // 无条件收卷') >= 0, 'v2890: [A5] 收卷写的是「无条件」并说明理由——录制态漏出去 = 整局被静默记录');
  }

  // ─────────────── B 面：运行时 ───────────────
  {
    const WA = fresh();
    WA.rand.seed(12345);
    const rec = WA.causal.record(function () { return draw3(WA); });
    a(rec.ok === true && rec.count === 3, 'v2890: [B1] 录制成功且记下 3 格（实 ' + rec.count + '）');
    a(rec.seed === 12345, 'v2890: [B1] 磁带自带种子（实 ' + rec.seed + '）——没有种子就无从复核它出自哪里');
    a(rec.tape.open === false, 'v2890: [B7] 收卷后磁带不再是录制态（否则整局被静默记录）');
    const rp = WA.causal.replayWith(rec.tape, function () { return draw3(WA); }, rec.result);
    a(rp.ok === true && rp.identical === true, 'v2890: [B1] 回放结果与真跑逐字一致（identical=' + rp.identical + '）');
    a(rp.verdict === 'clean' && rp.miss === 0 && rp.left === 0, 'v2890: [B1] 回放走位干净（verdict=' + rp.verdict + ' miss=' + rp.miss + ' left=' + rp.left + '）');
    a(WA.rand.tape().mode === 'live', 'v2890: [B1] 退出回放后模式回到 live（取证结束不改变现状）');

    const v = WA.rand.verifyTape(rec.tape);
    a(v.ok === true && v.checked === 3 && v.mismatches === 0, 'v2890: [B5] verifyTape 从种子重算逐值一致（' + v.checked + ' 格）');
    const tampered = { seed: rec.tape.seed, entries: rec.tape.entries.map(function (e) { return { c: e.c, v: e.v, k: e.k }; }) };
    tampered.entries[1].v = 0.123456;
    const v2 = WA.rand.verifyTape(tampered);
    a(v2.ok === false && v2.mismatches >= 1 && v2.firstMismatch.at === 1,
      'v2890: [B5] 篡改一格即报假，且第一处分歧的格号准确（at=' + (v2.firstMismatch && v2.firstMismatch.at) + '）');
    a(WA.rand.verifyTape({ seed: null, entries: [] }).reason === 'no-seed', 'v2890: [B5] 无种子的磁带如实拒收（no-seed），不假装复核过');
  }
  {
    // B2：取证不改被取证对象
    const WA = fresh();
    WA.rand.seed(777);
    const before = [WA.rand.next('k'), WA.rand.next('k'), WA.rand.next('k')];
    WA.rand.seed(777);
    const t = WA.causal.record(function () { WA.rand.next('k'); }).tape;
    WA.causal.replayWith(t, function () { WA.rand.next('k'); });
    const after = [WA.rand.next('k'), WA.rand.next('k')];
    a(after[0] === before[1] && after[1] === before[2],
      'v2890: [B2] 回放不消耗也不重置派生流：退出后序列接在原生序列之后（' + JSON.stringify(after) + '）');
  }
  {
    // B3 / B4：错位与枯竭各归各因
    const WA = fresh();
    WA.rand.seed(31);
    const t = WA.causal.record(function () { WA.rand.next('k'); }).tape;
    const rp = WA.causal.replayWith(t, function () { WA.rand.next('k'); WA.rand.next('other'); });
    a(rp.miss >= 1 && rp.verdict === 'positions-mismatch', 'v2890: [B3] 位置错位被报出（verdict=' + rp.verdict + ' miss=' + rp.miss + '）');
    a(!!rp.lastMiss && rp.lastMiss.want === 'other' && !!rp.lastMiss.why,
      'v2890: [B3] 未命中给出 want / got / why（' + JSON.stringify(rp.lastMiss) + '）——不猜、不顺延');
    a(rp.lastMiss.why === 'exhausted', 'v2890: [B4] 磁带枯竭单独归因（exhausted），不与通道不符混成一种');
    const rp2 = WA.causal.replayWith(t, function () { WA.rand.next('different-channel'); });
    a(rp2.lastMiss && rp2.lastMiss.why === 'channel', 'v2890: [B4] 通道不符单独归因（channel），实 ' + (rp2.lastMiss && rp2.lastMiss.why));
  }
  {
    // B6 / B7：模式边界与拒收
    const WA = fresh();
    WA.rand.reseed();
    a(WA.causal.evidence().replayable === false, 'v2890: [B6] 未播种时不得声称可重放（replayable=false）');
    a(WA.causal.evidence().replayBlockedBy === 'auto-seed', 'v2890: [B6] 并给出原因码 auto-seed（实 ' + WA.causal.evidence().replayBlockedBy + '）');
    WA.rand.seed(2024);
    const t = WA.causal.record(function () { WA.rand.next('z'); }).tape;
    const ev = WA.causal.evidence();
    a(ev.reproducible === true && ev.replayable === true, 'v2890: [B6] 显式播种 + 有磁带 ⇒ 两句结论都为真（分列但不互相冒充）');
    a(ev.tape.mode === 'live' && ev.tape.entries === 1 && ev.tape.values === 1,
      'v2890: [C2] 磁带读数如实透出（mode=' + ev.tape.mode + ' entries=' + ev.tape.entries + ' values=' + ev.tape.values + '）');
    a(WA.rand.beginTape().ok === true, 'v2890: [B7] 可以开新一卷');
    a(WA.rand.beginTape().reason === 'already-recording', 'v2890: [B7] 录制中再开一卷被拒（already-recording）');
    a(WA.rand.replay(t).reason === 'recording', 'v2890: [B7] 录制中拒绝进入回放（recording）');
    WA.rand.endTape();
    a(WA.rand.replay(t).ok === true, 'v2890: [B7] 收卷后可进入回放');
    a(WA.rand.beginTape().reason === 'in-replay', 'v2890: [B7] 回放中拒绝开始录制（in-replay）');
    a(WA.rand.replay(t).reason === 'bad-tape' || WA.rand.replay(t).reason === 'recording' || WA.rand.replay(t).ok === true,
      'v2890: [B7] 重复进入回放不炸（旧回放被新回放替换或如实拒收）');
    WA.rand.stopReplay();
    const novl = WA.rand.endTape();
    a(WA.rand.replay({ seed: 1, entries: [{ c: 'x', k: 'd' }], noValues: true }).reason === 'tape-without-values',
      'v2890: [B7] 只记位置的磁带拒绝回放（tape-without-values）——无处取值就别假装能重放');
    a(WA.rand.stopReplay().reason === 'not-replaying', 'v2890: [B7] 未在回放时退出被如实拒收（not-replaying）');
  }
  {
    // B8：无返回值 fn 不得抛（本版首跑现场）
    const WA = fresh();
    WA.rand.seed(5);
    const t = WA.causal.record(function () { WA.rand.next('q'); }).tape;
    let threw = null, r = null;
    try { r = WA.causal.replayWith(t, function () { WA.rand.next('q'); }); } catch (e) { threw = e; }
    a(!threw, 'v2890: [B8] 回放无返回值的 fn 不得抛（本版首跑：JSON.stringify(undefined) 不是字符串，a.length 炸）');
    a(r && r.ok === true && r.verdict === 'clean', 'v2890: [B8] 无返回值也照样给出走位读数（verdict=' + (r && r.verdict) + '）');
    let r3 = null;
    try { r3 = WA.causal.replayWith(t, function () { WA.rand.next('q'); }, undefined); } catch (e) { r3 = null; }
    a(r3 && r3.identical === undefined, 'v2890: [C1] 没给基准时不出 identical（没基准就说「一致」是假话）');
    const r4 = WA.causal.replayWith(t, function () { WA.rand.next('q'); }, { wrong: 1 });
    a(r4.identical === false, 'v2890: [C1] 给了基准则如实比对（同款判据两向都亮）');
  }
  {
    // B9：诊断侧只读 + record 的异常路径
    const WA = fresh();
    WA.rand.seed(88);
    WA.causal.record(function () { WA.rand.next('d'); });
    const d = WA.toolDiag.collect();
    const c = d.causal || {};
    a(!!c.replay && c.replay.replayable === true, 'v2890: [B9] 诊断包有回放段且读数与 evidence 同源（' + JSON.stringify(c.replay) + '）');
    a(!!c.tape && c.tape.verify && c.tape.verify.ok === true, 'v2890: [B9] 诊断里的磁带复核为真（纯算术，不跑产品代码）');
    a(src(DIAG).indexOf('WA.rand.replay(') < 0, 'v2890: [B9] 诊断侧不调用 replay（诊断必须零副作用：回放要重跑代码）');
    // 异常路径：fn 抛了也要把磁带交回（部分录制也是证据）
    const WA2 = fresh();
    WA2.rand.seed(99);
    const bad = WA2.causal.record(function () { WA2.rand.next('e'); throw new Error('__v2890_boom__'); });
    a(bad.ok === false && String(bad.reason).indexOf('fn-threw') === 0, 'v2890: [B9] fn 抛异常如实归因（' + bad.reason + '）');
    a(!!bad.tape && bad.tape.entries.length === 1, 'v2890: [B9] 异常时已录到的部分照旧交回（证据不因失败被吞）');
    a(WA2.rand.tape().open === false && WA2.rand.tape().mode === 'live', 'v2890: [B9] 异常路径同样收卷（finally 的意义就在这里）');
    a(WA2.causal.stat().recordFails === 1, 'v2890: [B9] 录制失败计入台账');
  }
}

/** 负控制：真源码破坏 → 在破坏副本上重跑**同款**判据 */
function runNegative(a) {
  const r = randSrc(), c = causalSrc();
  hits(r, ANCHOR_NEXT);
  hits(r, ANCHOR_IDX);
  hits(c, ANCHOR_UNWIND);

  // N1a：抹掉 next 的回放分支（回放时改走 live 派生流）⇒ B1 必须现形
  const brokenNext = r.replace(ANCHOR_NEXT, "    if (false) {\n      const r = take(name, 'd');\n      return r.ok ? r.v : 0;\n    }");
  a(brokenNext !== r, 'v2890: [N1] 破坏确实改写了源码（next 的回放分支被抹掉）');
  const WA1 = gate.fresh({ srcOverride: { 'core/rand.js': brokenNext } }).WA;
  WA1.rand.seed(12345);
  const t1 = WA1.causal.record(function () { return draw3(WA1); }).tape;
  const rp1 = WA1.causal.replayWith(t1, function () { return draw3(WA1); });
  a(rp1.verdict !== 'clean' || rp1.miss > 0,
    'v2890: [N1] 破坏后 B1/B3 现形：回放不再是 clean（verdict=' + rp1.verdict + ' miss=' + rp1.miss + '）——判据不是瞎的');
  a(rp1.used === 0 || rp1.lastMiss !== null, 'v2890: [N1] 破坏副本上走位读数真的变了（used=' + rp1.used + ' lastMiss=' + JSON.stringify(rp1.lastMiss) + '）');

  // N1b：让 take 永远读同一格 ⇒「位置前进」那一行的必要性必须现形。
  //   自纠：原先这里断言「破坏后 miss 变成 0」—— 实测证明做不到：take 无论如何都会检查
  //   通道与枯竭，故没有哪一种破坏能让 miss 为 0。真实的形态改变是：**第二个通道读到了第一格的值**。
  //   故改成两通道磁带 + 原版对照：正常 clean（miss=0 used=2）；破坏后不再是 clean。
  const mkSeq = function (w) { return function () { w.rand.next('k1'); w.rand.next('k2'); }; };
  const WA6 = fresh();
  WA6.rand.seed(31);
  const t6 = WA6.causal.record(mkSeq(WA6)).tape;
  const rp6 = WA6.causal.replayWith(t6, mkSeq(WA6));
  a(rp6.verdict === 'clean' && rp6.miss === 0 && rp6.used === 2,
    'v2890: [N1] 对照：原版上同款两通道回放是 clean（verdict=' + rp6.verdict + ' miss=' + rp6.miss + ' used=' + rp6.used + '）——基准不是猜的');
  const brokenIdx = r.replace(ANCHOR_IDX, "    const e = t.entries[0] || null;");
  a(brokenIdx !== r, 'v2890: [N1] 破坏确实改写了源码（take 永远读同一格）');
  const WA2 = gate.fresh({ srcOverride: { 'core/rand.js': brokenIdx } }).WA;
  WA2.rand.seed(31);
  const t2 = WA2.causal.record(mkSeq(WA2)).tape;
  const rp2 = WA2.causal.replayWith(t2, mkSeq(WA2));
  a(rp2.verdict === 'positions-mismatch' && rp2.miss >= 1,
    'v2890: [N1] 破坏后 B3 现形：同一份输入不再是 clean（verdict=' + rp2.verdict + ' miss=' + rp2.miss + '）——判据对这行敏感');
  // 自纠：这里原本断言 used===1，实测为 2——`take()` 里 `t.used++` 落在通道检查**之前**，
  //   故它与正常情形同形、没有鉴别力。改看真正能说明形态的证词：第二个通道拿到了第一格的值。
  a(!!rp2.lastMiss && rp2.lastMiss.want === 'k2' && rp2.lastMiss.got === 'k1' && rp2.lastMiss.why === 'channel',
    'v2890: [N1] 且证词能说清形态：第二个通道拿到了第一格的值（' + JSON.stringify(rp2.lastMiss) + '）——就是静默换数的形状');

  // N1c：抹掉 record 的收卷 ⇒ B7 必须现形
  const brokenC = c.replace(ANCHOR_UNWIND, '      /* 收卷被抹掉 */');
  a(brokenC !== c, 'v2890: [N1] 破坏确实改写了源码（finally 收卷被抹掉）');
  const WA3 = gate.fresh({ srcOverride: { 'engines/causal.js': brokenC } }).WA;
  WA3.rand.seed(7);
  const rec3 = WA3.causal.record(function () { WA3.rand.next('u'); });
  a(rec3.ok === false || rec3.tape === undefined, 'v2890: [N1] 破坏后 B7 现形：录制不再交出磁带（ok=' + rec3.ok + ' reason=' + rec3.reason + '）');
  a(WA3.rand.tape().open === true, 'v2890: [N1] 且磁带停在录制态（open=' + WA3.rand.tape().open + '）——正是「整局被静默记录」那一种');
  WA3.rand.endTape();

  // N2：影响面有限——破坏 next 不影响 verifyTape（纯算术，不读模式）
  const WA4 = gate.fresh({ srcOverride: { 'core/rand.js': brokenNext } }).WA;
  WA4.rand.seed(12345);
  const t4 = WA4.causal.record(function () { return draw3(WA4); }).tape;
  a(WA4.rand.verifyTape(t4).ok === true, 'v2890: [N2] 影响面有限：破坏回放分支后 verifyTape 仍为真（它不读模式）');
  const WA5 = fresh();
  WA5.rand.seed(12345);
  const t5 = WA5.causal.record(function () { return draw3(WA5); }).tape;
  // v2.89.0 O2 自纠：原来把这次回放写在 evidence() 断言**之前**，
  //   于是「先取证、再断言」的顺序让这条判据自证了它自己要治的病。
  //   现改为：先断言事实 → 再动一回取证 → 再看证据还在不在。
  a(WA5.causal.evidence().replayable === true && WA5.causal.evidence().reproducible === true,
    'v2890: [N3] 非恒真：两句结论在原版上都能取到真值（不是恒假）');
  a(WA5.rand.verifyTape(t5).ok === true && WA5.causal.replayWith(t5, function () { return draw3(WA5); }, null).verdict === 'clean',
    'v2890: [N3] 非恒真：原版上同款两条判据都为真（回放 clean + 复核 ok）');
  a(WA5.causal.evidence().replayable === true,
    'v2890: [N3] 取证不改被取证对象：一次 replayWith 之后仍报可重放（此前这里会翻成 false —— 只读取证动作擦掉了证据）');
}

module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative)
};
#!/usr/bin/env node
// WorldAxis tests/tape-vol-v2980.js —— v2.98.0（P2 磁带卷：跨会话可查）
//
// 【它治的病：证据出了会话就没了】
//   v2.89.0（O2）把「这一轮可复现吗」从声明变成了证据：磁带记下每次抽取的**答案 + 位置**，
//   回放与复核各自回答一个不同的问题。可是这卷磁带**只活在内存里**——会话一结束，
//   「上一节会话里那一轮到底怎么走的」就变成不可判定。第一世代 org 流水已经吃过同型的亏，
//   v2.94.0（O6）立了「显式导出 + 带外对账」把它治了；磁带这一半一直空着。
//
// 【本版口径】四条（全是否定式，与 O6 同规格）
//   ① **不自动落盘**：本模块不替调用方写盘。卷由调用方拿走——「要不要留下这一卷」是人的决定。
//   ② 导出**不改本侧**：不丢卷、不清 `__lastTape`、不改 `__mode`、不改 draws / ids / byChannel。
//      取证动作不得改变被取证对象——这一条在本仓库从不打折。
//   ③ **位置真源照搬**：每格的 `n` 是录制时现算的段内步数，导出与带外核对**都不重算**它。
//      重算会把被手改的卷洗白成「自洽」，于是「这卷有没有被动过」永远说不出口。
//   ④ 拒收码沿用既有词汇：bad-volume / bad-format / bad-version / bad-tape / export-throw。
//
// 【边界照实说（本版刻意不假装更强）】
//   · 磁带**没有**环形上限 ⇒ `truncated` 恒 false 是事实不是占位。
//   · `compared === 0` 时只说明「卷内自洽（位置链完整）」，**不构成**「与分析对象一致」：
//     本侧磁带不落盘，没有第二份真源可比。本文件把这句话写成断言。
//
// 【判据】（A 结构 / B 运行时 / C 不变式 / N 负控制）
//   A1 两口在位、且**各有真消费方**（面板绑定 + 诊断/面板调用点；无消费方的导出等于死面）。
//   A2 常量与 inspectTape 不单独导出（信息经两个口的返回值带出——本模块只认调用点）。
//   A3 头注里的四条口径逐字在位（口径写在纸上才算口径）。
//   B1 录制 → 导出：格式头 / 格数 / 决策格数 / 种子如实；导出即「这一卷」。
//   B2 带外核对：种子在场且逐值一致 ⇒ outcome='entailed'、posOk、compared>0。
//   B3 篡改**任意一格的值** ⇒ outcome='mismatch'，且第一处分歧格号准确。
//   B4 篡改**位置链**（改 n / 删格 / 插格）⇒ posOk=false 且给出断点；值可能仍全对
//      （位置与值是两个独立面，合成一句就是失实）。
//   B5 无种子卷 ⇒ outcome='no-seed'（「能不能核对」与「核对结果」是两句不同的话）。
//   B6 拒收四态各归各因：bad-volume / bad-format / bad-version / bad-tape（行不是对象）。
//   B7 无卷时导出照实拒收（no-tape），不编一个空卷出来。
//   B8 **录制中**的卷照实导出（opened=true）且不因此改变录制状态——导出不是收卷。
//   C1 不变式：导出前后 draws / ids / byChannel / mode / tape() / seed 逐项不变。
//   C2 不变式：带外核对**零状态触碰**——核对前后上述各项逐项不变，且核对不装卷
//      （核对之后 `tape()` 仍是原来那一卷，不是在卷被换成了外来卷）。
//   C3 口径分列：verifyTape（磁带对象）与 verifyTapeWith（卷）各有其值；两者对同一份数据
//      都答得出来，但答的问题不同（前者不读格式头，后者读）。
//   N0 两个真源码锚点各恰中 1 次；N1 破坏 ⇒ C1/C2 各现形；N2 影响面有限；
//      N3 非恒真；N4 锚点工具两向自证（不存在 / 不唯一都必须抛）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const gate = require('./ui-gate-sync.js');
const RAND = path.join(BASE, 'core/rand.js');
const PANEL = path.join(BASE, 'ui/panel.js');
function src(p) { return fs.readFileSync(p, 'utf8'); }
function randSrc() { return src(RAND); }
function panelSrc() { return src(PANEL); }

// ── 两个真源码破坏锚点（各须恰中 1 次）──
//   锚点选的是**判据所依赖的那一行**，不是随便一处代码：
//     · 导出行面那三行 —— 它是「照搬 n 而不重算」的落点（本版最贵的口径③）；
//     · 带外核对的行面早退 —— 它是「行面读不了就当场归因」的落点。
const ANCHOR_ROWS = "        rows: t.entries.map(function (e) {\n          return { c: e.c, v: e.v, k: e.k, n: e.n, r: e.r, s: e.s };\n        })";
const ANCHOR_BADROWS = "    if (badRows) return { ok: false, reason: 'bad-tape', badRows: badRows, entries: rows.length };";

/** 锚点命中计数，要求恰为 1（工具两向自证：不存在 / 不唯一都必须抛） */
function hits(s, anchor) {
  const n = s.split(anchor).length - 1;
  if (n !== 1) throw new Error('锚点命中 ' + n + ' 次（要求恰 1 次）: ' + anchor.slice(0, 50));
  return n;
}
function fresh(opts) { return gate.fresh(opts || {}).WA; }
/** 录一卷可核对的磁带：写死种子 + 固定脚本（判据须可复算） */
function makeTape(WA) {
  WA.rand.seed(2026980);
  const ch = ['t.a', 't.b', 't.a', 't.c'];
  WA.rand.beginTape(true);
  ch.forEach(function (c) { WA.rand.next(c); });
  const t = WA.rand.endTape();
  return { tape: t.tape, ch: ch };
}
/** 快照「本侧状态」——C 面的判据全部对比这一份 */
function snap(WA) {
  const st = WA.rand.randStat();
  const tp = WA.rand.tape();
  return {
    draws: st.draws, ids: st.ids, byChannel: JSON.stringify(st.byChannel),
    seed: st.seed, mode: tp.mode, entries: tp.entries, used: tp.used, miss: tp.miss,
    channels: JSON.stringify(tp.channels)
  };
}

function runAll(a) {
  const r = randSrc(), p = panelSrc();
  // ─────────────── A 面：结构 ───────────────
  {
    // A1 两口在位
    a(r.indexOf('    tapeVol: tapeVol,') >= 0, 'v2980: [A1] rand 导出 tapeVol（导出卷——导出即有承诺）');
    a(r.indexOf('    verifyTapeWith: verifyTapeWith') >= 0, 'v2980: [A1] rand 导出 verifyTapeWith（带外核对）');
    // A1 真消费方：面板绑定（与 v2890 的 record/verify 同一判据形态）
    a(p.indexOf("on('#wa-cw-vol'") >= 0, 'v2980: [A1] tapeVol 的消费方：面板「导出磁带」');
    a(p.indexOf("on('#wa-cw-vol-check'") >= 0, 'v2980: [A1] verifyTapeWith 的消费方：面板「带外核对」');
    a(p.indexOf('WA.rand.tapeVol()') >= 0, 'v2980: [A1] 面板真调 tapeVol（不是绑了不用）');
    a(p.indexOf('WA.rand.verifyTapeWith(') >= 0, 'v2980: [A1] 面板真调 verifyTapeWith');
    // A1 两个控件都渲染（ui-wire-audit 的反向判据同款：绑到不渲染的 id = 点了没反应）
    a(p.indexOf('id="wa-cw-vol"') >= 0 && p.indexOf('id="wa-cw-vol-check"') >= 0 && p.indexOf('id="wa-cw-vol-text"') >= 0,
      'v2980: [A1] 三枚新控件都在模板里渲染（否则 on() 静默空转，用户视角「点了没反应」）');
    // A2 常量与 inspectTape 不单独导出
    a(r.indexOf('    TAPE_FORMAT:') < 0 && r.indexOf('    TAPE_FORMAT_VERSION:') < 0 && r.indexOf('    inspectTape:') < 0,
      'v2980: [A2] 常量与 inspectTape **不单独导出**（信息经两个口的返回值带出——无独立消费方不挂）');
    a(r.indexOf('const TAPE_FORMAT = ') >= 0 && r.indexOf('const TAPE_FORMAT_VERSION = ') >= 0,
      'v2980: [A2] 两常量在位（格式头是读的人判断「这是哪一版、能不能用」的唯一依据）');
    // A3 头注四条口径
    a(r.indexOf('**不自动落盘**：本模块不替调用方写盘') >= 0, 'v2980: [A3] 口径①不自动落盘写在头注里');
    a(r.indexOf('导出**不改本侧**') >= 0, 'v2980: [A3] 口径②导出不改本侧写在头注里');
    a(r.indexOf('位置真源照搬') >= 0, 'v2980: [A3] 口径③位置真源照搬写在头注里');
    a(r.indexOf('不构成**「与本侧一致」') >= 0 || r.indexOf('不构成「与本侧一致」') >= 0 || r.indexOf('**不构成**「与本侧一致」') >= 0,
      'v2980: [A3] 头注明写「卷内自洽 ≠ 与本侧一致」（这句话说不出口时，读的人会自己编一句）');
  }

  // ─────────────── B 面：运行时 ───────────────
  {
    // B1 录制 → 导出
    const WA = fresh();
    const mk = makeTape(WA);
    const v = WA.rand.tapeVol();
    a(v && v.ok === true, 'v2980: [B1] 有卷时导出一卷（ok=' + (v && v.ok) + '）');
    a(v.format === 'worldaxis.rand.tape' && v.formatVersion === 1,
      'v2980: [B1] 格式头如实（' + v.format + ' v' + v.formatVersion + '）');
    a(v.entries === 4 && v.values === 4, 'v2980: [B1] 格数 / 决策格数如实（实 ' + v.entries + ' / ' + v.values + '；本卷四格全部走 next() ⇒ 四格都是决策流）');
    a(v.seed === 2026980, 'v2980: [B1] 卷自带种子（实 ' + v.seed + '）——没有种子就无从核对它出自哪里');
    a(v.truncated === false, 'v2980: [B1] 磁带无环形挤出 ⇒ 本侧永不截断（truncated=' + v.truncated + '，这一位是事实不是占位）');
    a(v.opened === false, 'v2980: [B1] 收卷后的卷如实报「不是录制中」');
    a(Array.isArray(v.rows) && v.rows.length === 4 && v.rows[0].c === 't.a' && v.rows[3].c === 't.c',
      'v2980: [B1] 行面按录制顺序（' + (v.rows || []).map(function (x) { return x.c; }).join(',') + '）');
    a(v.rows.every(function (x, i) { return x.n === i + 1; }), 'v2980: [B1] 位置真源 n 逐格递增（' + (v.rows || []).map(function (x) { return x.n; }).join(',') + '）');

    // B2 带外核对：一致
    const w = WA.rand.verifyTapeWith(v);
    a(w.ok === true && w.outcome === 'entailed', 'v2980: [B2] 种子在场且逐值一致 ⇒ entailed（实 ' + w.outcome + '）');
    a(w.compared === 4 && w.mismatches === 0, 'v2980: [B2] 比了 ' + w.compared + ' 格，零分歧');
    a(w.posOk === true && w.posBroken.length === 0, 'v2980: [B2] 位置链完整（posOk=' + w.posOk + '）');
    a(JSON.stringify(w.chUsed) === JSON.stringify(['t.a', 't.b', 't.c']),
      'v2980: [B2] 通道面如实（' + JSON.stringify(w.chUsed) + '）');

    // B3 篡改一格的值
    const t1 = JSON.parse(JSON.stringify(v));
    t1.rows[2].v = 0.123456;
    const w1 = WA.rand.verifyTapeWith(t1);
    a(w1.ok === false && w1.outcome === 'mismatch' && w1.mismatches >= 1,
      'v2980: [B3] 篡改一格值即报假（outcome=' + w1.outcome + ' 错 ' + w1.mismatches + ' 格）');
    a(w1.firstMismatch && w1.firstMismatch.at === 2, 'v2980: [B3] 第一处分歧的格号准确（at=' + (w1.firstMismatch && w1.firstMismatch.at) + '）——一处分歧之后全都错位，报第一处才有用');
    a(w1.posOk === true, 'v2980: [B3] 只改值时位置链仍完整（两个面独立——合成一句就是失实）');

    // B4 篡改位置链
    const t2 = JSON.parse(JSON.stringify(v));
    t2.rows[1].n = 99;
    const w2 = WA.rand.verifyTapeWith(t2);
    a(w2.posOk === false && w2.posBroken.length >= 1 && w2.posBroken[0].at === 1,
      'v2980: [B4] 改 n 即报位置链断（首处第 ' + (w2.posBroken[0] && w2.posBroken[0].at) + ' 格）');
    a(w2.outcome === 'entailed' && w2.ok === false,
      'v2980: [B4] 且值链照旧一致、总判否——「值对得上」不掩盖「这卷被动过」（outcome=' + w2.outcome + ' ok=' + w2.ok + '）');
    const t3 = JSON.parse(JSON.stringify(v));
    t3.rows.splice(1, 1);       // 删一格：后面的 n 全部对不上
    const w3 = WA.rand.verifyTapeWith(t3);
    a(w3.posOk === false, 'v2980: [B4] 删一格同样被位置链抓到（' + w3.posBroken.length + ' 处断裂）——位置真源照搬的价值就在这里');
    const t4 = JSON.parse(JSON.stringify(v));
    t4.rows.splice(1, 0, { c: 't.a', v: 0.5, k: 'd', n: 2 });
    const w4 = WA.rand.verifyTapeWith(t4);
    a(w4.posOk === false, 'v2980: [B4] 插一格同样被抓到（'+ w4.posBroken.length + ' 处断裂）——重算 n 会让它变成「自洽」，故本实现不重算');

    // B5 无种子卷
    const t5 = JSON.parse(JSON.stringify(v));
    t5.seed = null;
    const w5 = WA.rand.verifyTapeWith(t5);
    a(w5.outcome === 'no-seed' && w5.compared === 0,
      'v2980: [B5] 无种子卷 ⇒ no-seed（「能不能核对」与「核对结果」是两句不同的话）');
    a(w5.posOk === true, 'v2980: [B5] 但位置链照样核得了——种子答不了不等于整卷无法核对（对齐 v2970 的坐标覆盖率先算）');

    // B6 拒收四态
    a(WA.rand.verifyTapeWith(null).reason === 'bad-volume', 'v2980: [B6] 非对象 ⇒ bad-volume');
    a(WA.rand.verifyTapeWith({ format: 'x', formatVersion: 1, rows: [] }).reason === 'bad-format', 'v2980: [B6] 格式头不符 ⇒ bad-format（带 want/got）');
    const wFmt = WA.rand.verifyTapeWith({ format: 'x', formatVersion: 1, rows: [] });
    a(wFmt.want === 'worldaxis.rand.tape' && wFmt.got === 'x', 'v2980: [B6] bad-format 给出期望值（否则读的人无从知道差在哪）');
    a(WA.rand.verifyTapeWith({ format: 'worldaxis.rand.tape', formatVersion: 9, rows: [] }).reason === 'bad-version',
      'v2980: [B6] 版本不符 ⇒ bad-version（格式头三元组的第三位）');
    a(WA.rand.verifyTapeWith({ format: 'worldaxis.rand.tape', formatVersion: 1 }).reason === 'bad-tape',
      'v2980: [B6] 缺行面 ⇒ bad-tape');
    const wBad = WA.rand.verifyTapeWith({ format: 'worldaxis.rand.tape', formatVersion: 1, rows: ['x'] });
    a(wBad.reason === 'bad-tape' && wBad.badRows === 1,
      'v2980: [B6] 行不是对象 ⇒ 当场归因 bad-tape（实 badRows=' + wBad.badRows + '）——不静默跳过，跳过等于把它们算进「比过了」');

    // B7 无卷拒收
    const WA7 = fresh();
    const v7 = WA7.rand.tapeVol();
    a(v7.ok === false && v7.reason === 'no-tape',
      'v2980: [B7] 本会话未录过 ⇒ no-tape（不编一个空卷出来：「没有卷」与「有空卷」是两件事）');

    // B8 录制中的卷
    const WA8 = fresh();
    WA8.rand.seed(7);
    WA8.rand.beginTape(true);
    WA8.rand.next('live.a');
    const v8 = WA8.rand.tapeVol();
    a(v8.ok === true && v8.opened === true && v8.entries === 1,
      'v2980: [B8] 录制中的卷照实导出（opened=' + v8.opened + ' 格 ' + v8.entries + '）且**不因此收卷**');
    a(WA8.rand.tape().open === true, 'v2980: [B8] 导出不是收卷：磁带仍在录制态（否则一次只读动作就改了取证对象）');
    WA8.rand.next('live.b');
    a(WA8.rand.endTape().count === 2, 'v2980: [B8] 导出之后继续录照旧（后续一格仍在卷里）');
  }

  // ─────────────── C 面：不变式 ───────────────
  {
    // C1 导出不改本侧
    const WA = fresh();
    makeTape(WA);
    WA.rand.next('after.a');            // 制造一些活动读数
    const before = snap(WA);
    const v = WA.rand.tapeVol();
    const after = snap(WA);
    a(JSON.stringify(before) === JSON.stringify(after),
      'v2980: [C1] 导出**不改本侧**：draws/ids/byChannel/seed/mode/entries/used/miss 逐项不变（前后 ' + JSON.stringify(after) + '）');
    a(v.entries === 4, 'v2980: [C1] 且导出的确实是收卷那一卷（实 ' + v.entries + ' 格，未被 next 之后的空在卷顶替）');
    // 复核留存：再导一次仍拿得到（「取证不得擦掉证据」）
    const v2 = WA.rand.tapeVol();
    a(v2.entries === 4 && JSON.stringify(v2.rows) === JSON.stringify(v.rows),
      'v2980: [C1] 连续导出两次拿到同一卷（__lastTape 不被导出清掉）');

    // C2 带外核对零状态触碰
    const WA2 = fresh();
    makeTape(WA2);
    WA2.rand.next('after.b');
    const b2 = snap(WA2);
    const vol2 = WA2.rand.tapeVol();
    const foreign = JSON.parse(JSON.stringify(vol2));
    foreign.rows.forEach(function (x) { x.v = 0.5; });     // 一份**外来且错**的卷
    const w = WA2.rand.verifyTapeWith(foreign);
    const a2 = snap(WA2);
    a(w.outcome === 'mismatch', 'v2980: [C2] 外来错卷如实报分歧（outcome=' + w.outcome + '）');
    a(JSON.stringify(b2) === JSON.stringify(a2),
      'v2980: [C2] 核对**零状态触碰**：draws/ids/byChannel/seed/mode/entries/used/miss 逐项不变');
    // 核对不装卷：核对之后本侧导出的仍是**自己那一卷**（没被外来卷顶替）
    const selfAfter = WA2.rand.tapeVol();
    a(selfAfter.ok === true && JSON.stringify(selfAfter.rows) === JSON.stringify(vol2.rows),
      'v2980: [C2] 且核对不装卷：在卷没被外来卷顶替（本侧导出的仍是自己那一卷）');
    // 核对之后本侧照旧能继续抽（没被推进/没被换流）
    const n1 = WA2.rand.next('after.c');
    a(isFinite(n1), 'v2980: [C2] 核对之后随机源照旧可用（没有被推进或被换流）');

    // C3 两个口径各答各题
    const WA3 = fresh();
    const mk3 = makeTape(WA3);
    const vol3 = WA3.rand.tapeVol();
    const byObj = WA3.rand.verifyTape(mk3.tape);
    const byVol = WA3.rand.verifyTapeWith(vol3);
    a(byObj.ok === true && byVol.ok === true, 'v2980: [C3] 同一份数据在两个口上都为真（口径分列不是二选一）');
    a(byObj.checked === 4 && byVol.compared === 4, 'v2980: [C3] 两者比的是同一批格（' + byObj.checked + ' / ' + byVol.compared + '）');
    a(byVol.posOk !== undefined && byObj.posOk === undefined,
      'v2980: [C3] 但只有卷口报位置链（磁带对象没有「被别的会话改过」这回事）——这就是两个口不能合并的理由');
    a(WA3.rand.verifyTapeWith({ seed: 1, entries: [], rows: [] }).reason === 'bad-format',
      'v2980: [C3] 卷口认格式头：喂它一个裸磁带对象会被如实拒收（口径不同，故互不替代）');
  }
}

/** 负控制：真源码破坏 → 在破坏副本上重跑**同款**判据 */
function runNegative(a) {
  const r = randSrc();
  hits(r, ANCHOR_ROWS);
  hits(r, ANCHOR_BADROWS);

  // N1a：把行面导出改成**现算 n**（本版最贵的一条口径——「位置真源照搬」——被抹掉）
  //   ⇒ B4 必须现形。破坏形态是**实测定的**（本版自纠）：在「直录直导」这条路径上，
  //   录制侧写下的 `n` 恰好等于索引 + 1，于是重算与照搬**同值**、破坏不可观测
  //   （首版判据正挂在这里——是判据的形态选错，不是产品缺陷）。故负控制必须先把
  //   「不一致的 n」送进卷里：手改内存卷某一格的 n（模拟「这卷被动过 / 由别的东西
  //   拼出来」），再看导出是**照搬**还是**重算**。
  const brokenRows = r.replace(ANCHOR_ROWS, [
    '        rows: t.entries.map(function (e, __i) {',
    '          return { c: e.c, v: e.v, k: e.k, n: (__i + 1), r: e.r, s: e.s };',
    '        })'
  ].join('\n'));
  a(brokenRows !== r, 'v2980: [N1] 破坏确实改写了源码（导出行面改成现算 n）');
  /** 录一卷、把第三格的 n 手改成 99，再导出——「照搬」与「重算」在这一步分道 */
  function tainted(WA) {
    const mk = makeTape(WA);
    mk.tape.entries[2].n = 99;
    return WA.rand.tapeVol();
  }
  const WAo = fresh();
  const vo = tainted(WAo);
  a(vo.rows[2].n === 99, 'v2980: [N1] 对照：原版导出**照搬**被改过的 n（实 ' + vo.rows[2].n + '）——口径③的落点就在这里');
  a(WAo.rand.verifyTapeWith(vo).posOk === false,
    'v2980: [N1] 对照：原版上「这卷被动过」说得出口（posOk=false）——基准不是猜的');
  const WAn = gate.fresh({ srcOverride: { 'core/rand.js': brokenRows } }).WA;
  const vn = tainted(WAn);
  a(vn.rows[2].n === 3, 'v2980: [N1] 破坏版把 99 重算成 ' + vn.rows[2].n + '——被改坏的位置被洗白成「自洽」');
  const wn = WAn.rand.verifyTapeWith(vn);
  a(wn.posOk === true && wn.posBroken.length === 0,
    'v2980: [N1] 破坏后 B4 现形：同一份被改过的卷，位置链**报不出断点**（posBroken=' + wn.posBroken.length + '）——判据对这行敏感');
  a(wn.ok === true, 'v2980: [N1] 且总判为真——「这卷被动过」这句话被彻底消除了，正是本口径要防的那种静默');

  // N1b：抹掉行面早退 ⇒ B6 必须现形：读不了的行**被算进「比过了」**
  //   自纠：原先这里断言「破坏后抛错」——实测不抛（`Number(undefined)` 得 NaN，不会炸），
  //   真实形态比抛错更坏：它**静默地把垃圾行当成比过的一格**，于是「连读都读不了」
  //   被伪装成「核对过了，不一致」。判据改看这个可观测形态。
  const brokenBad = r.replace(ANCHOR_BADROWS, "    if (badRows) { /* 行面不再早退 */ }");
  a(brokenBad !== r, 'v2980: [N1] 破坏确实改写了源码（行面早退被抹掉）');
  const WAb = gate.fresh({ srcOverride: { 'core/rand.js': brokenBad } }).WA;
  const rb = WAb.rand.verifyTapeWith({ format: 'worldaxis.rand.tape', formatVersion: 1, seed: 1, rows: ['x'] });
  const okb = fresh().rand.verifyTapeWith({ format: 'worldaxis.rand.tape', formatVersion: 1, seed: 1, rows: ['x'] });
  a(okb.reason === 'bad-tape' && okb.compared === undefined,
    'v2980: [N1] 对照：原版上读不了的行被如实拒收（reason=' + okb.reason + '），不进比对面');
  a(!rb.reason && rb.compared === 1,
    'v2980: [N1] 破坏后 B6 现形：同一份卷不再拒收，反而报「比了 1 格」（compared=' + rb.compared + '）'
    + '——垃圾行被伪装成比过的一格，这正是「静默跳过」那一类');
  a(rb.ok === false, 'v2980: [N1] 且它给的是「核对不一致」而不是「卷不合规」（ok=' + rb.ok + '）——两句话被混成一句');

  // N2：影响面有限——导出行面的破坏不影响 verifyTape（它只读 c/v/k）
  const WA2 = gate.fresh({ srcOverride: { 'core/rand.js': brokenRows } }).WA;
  WA2.rand.seed(2026980);
  WA2.rand.beginTape(true);
  ['t.a', 't.b', 't.a', 't.c'].forEach(function (c) { WA2.rand.next(c); });
  const t2 = WA2.rand.endTape().tape;
  a(WA2.rand.verifyTape(t2).ok === true,
    'v2980: [N2] 影响面有限：导出行面被破坏后 verifyTape（磁带对象口径）仍为真——它不读卷的 n');

  // N3：非恒真——原版上两条判据都能取到真值，且一次核对不改状态
  const WA3 = fresh();
  const v3 = makeTape(WA3) && WA3.rand.tapeVol();
  a(WA3.rand.verifyTapeWith(v3).ok === true, 'v2980: [N3] 非恒真：原版上带外核对为真（不是恒假）');
  const s3a = snap(WA3);
  WA3.rand.verifyTapeWith(JSON.parse(JSON.stringify(v3)));
  a(JSON.stringify(snap(WA3)) === JSON.stringify(s3a),
    'v2980: [N3] 且一次核对之后本侧读数逐项不变（判据不是靠「核对碰了状态」才成立）');
  a(WA3.rand.tapeVol().entries === v3.entries, 'v2980: [N3] 核对之后仍导得出同一卷（证据没被核对擦掉）');

  // N4：锚点工具两向自证
  let threw0 = null;
  try { hits(randSrc(), '这段代码在真源码里不存在__N4__'); } catch (e) { threw0 = e; }
  a(!!threw0, 'v2980: [N4] 锚点工具两向自证：不存在的锚点必须抛（实 ' + (threw0 && threw0.message.slice(0, 30)) + '）');
  let threw2 = null;
  try { hits('aaa', 'a'); } catch (e) { threw2 = e; }
  a(!!threw2, 'v2980: [N4] 锚点工具两向自证：不唯一的锚点必须抛（实 ' + (threw2 && threw2.message.slice(0, 30)) + '）');
  a(hits(randSrc(), ANCHOR_ROWS) === 1 && hits(randSrc(), ANCHOR_BADROWS) === 1,
    'v2980: [N4] 两个真锚点在真源码各恰中 1 次');
}

module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative)
};

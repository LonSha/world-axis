#!/usr/bin/env node
// WorldAxis tests/canon-align-v2100.js —— v2.100.0（第五十七面 原著对位）
//
// 【它治的病：v2.99.0 只交了「基准」，没交「对位」】
//   上一面把原著切成「幕 → 剧情点」，于是「原著本该长什么样」第一次有了输入面。
//   但它没回答那个真问题：**现在演到哪一幕了**。基准没有读出面，等于还是靠人记。
//   本面补上「可观测的那一半」：把世界侧**已经发生的事**（chronicle / currents /
//   echoes / 章节历史）与幕目题名做**字面重叠对位**，交出两样东西——读数与证据。
//
// 【口径（全是否定式）】
//   ① **对的是题名，不是正文**：原著正文不入存档（v2.99.0 口径 5），故粒度是题名级，
//      如实写进返回（`scope`），不假装做过逐句比对。
//   ② **不调模型**：纯算术（二字窗口交集计数）。模型判定不可复现，而「上次定位到第 3 幕」
//      这句话要有意义，就不能随模型漂移。
//   ③ **证据与推断分列**：`evidence`（共有片段）与 `score` 一起交出——说不出
//      「它说在第 3 幕，凭什么」的读数，等于让人替引擎背书。
//   ④ **没信号就说没信号**：一行都没撞上一律 `no-signal`，**不给「最接近」的坐标**。
//      「随便挑一个最像的」与「没对上」在面板上必须长得不一样。
//   ⑤ **观测不得改变被观测对象**：诊断面 `alignView` 连 stat 都不写，读面不改存档、
//      不改 stat、不隐式写盘。取证不得改变被取证对象。
//   ⑥ **不替用户回写坐标**：对位结果**不自动** markCoord。O10 立的规矩是
//      「坐标是标出来的、不是猜的」——对位是猜，猜的输出要人看一眼后**手动**标。
//   ⑦ 题名归一化后不足 4 字（窗口数 < ALIGN_MIN_NEED）的幕不参与对位（标 `thin`）：
//      两字撞上不是信号，是噪声。这条是**噪声下限**，不是精度调优。
//   ⑧ **凡拒收都记账**：no-outline / empty-text / too-long 全进 stat.blocked，
//      「你给的东西不对」是我们这边看得见的账。
//   ⑨ **计数分列**：signals / aligns / gaps 与 builds / adopted / cleared 分列——
//      「我看了几眼对位」与「我整理了几次原著」是两件事，挤进同一个计数器就再也分不出。
//   ⑩ **不判偏离**：只报读数（最接近第几幕、还剩几幕）。「所以你不该在这里」是判定，
//      判定标准是作者的，不是引擎的。
//   ⑪ **规模上界如实生效**：单次对位文本 / 每源行数 / 报出的证据条数各有上界，
//      越界一律先拒收再说话（不静默截断，也不静默放行）。
//   ⑫ **分母取题名窗口数**：世界侧历史行远长于幕题名，用 Jaccard 会被长度压死；
//      要问的是「这一幕的题名有多少真的出现在这段历史里」。
//   ⑬ **平手取幕号小者**：顺序稳定才可复现——「同一次对位两次读出的幕号不同」
//      比「读错一幕」更难查。
//
// 【判据】
//   A 静态面：不调模型 + 面板 10 条 canon 绑定（新增三枚对位按钮各接一个**真**导出）
//             + 诊断节 19 个 canon 控件登记 + canon 为必载模块 + 出口面 17 成员。
//   B 运行时面（真装载真调用，每条口径一个探针）：
//     B1 未采纳时照实说没有基准（signal / position / gap / alignView 都不编读数）
//     B2 一行都没撞上 ⇒ no-signal，**不给坐标**（口径④）
//     B3 撞上时交出读数 + 证据 + 票数/峰值/次选（口径③⑫）
//     B4 只有 hit>0 的幕进读数（`hitActs` 不是幕总数——那是两回事）
//     B5 题名过短的幕不参与对位（口径⑦：两字撞上不是信号）
//     B6 三计数分列：position 记 aligns、signal 记 signals、gap 记 gaps（口径⑨）
//     B7 诊断面零 stat 写入（口径⑤）
//     B8 no-signal 时 `lastReason` 照实说没信号（不谎称有信号）
//     B9 gap 的总幕数取自 `acts0`（被截断的骨架仍要报**原著总幕数**）
//     B10 幕号越界一律 out-of-range 且**不夹到边界**（口径⑩：夹了就说不出「不存在」）
//     B11 坐标往返：coordOf 拼出的号 gap 解回同一个（拼装只有一处实现）
//     B12 观测不得改变被观测对象：诊断节 collect() 不写任何计数（口径⑤）
//     B13 拒收三态（no-outline / empty-text / too-long）各带自己的理由与上界
//     B14 scope 只认四源之一；不指定或写错一律**四源全扫**（写错不报错，因为错名回落
//         不会给出错答案）
//     B15 每源取最近 24 行、总数上限 48（口径⑪：上界如实生效）
//   C 不变式：对位结果**不落盘**（存档 canon 子树逐字不变，键集恰为 outline）。
//   N1–N9 负控制：真源码破坏 ⇒ 装载破坏副本 ⇒ 在副本上重跑**同款**真判据。
//   N10 判据纯度：每条锚点字面量在本文件只出现一次（判据不得引用锚点串）。
//
// 【为什么静态面判据不做负控制】
//   面板 / 诊断的「消费方在位」判据读的是**真文件**；而负控制的破坏写在**临时副本**上
//   （srcOverride）。读真文件的判据在破坏副本面前照样绿——那样得到的是一条**假绿**的负控制。
//   故静态锚点一律不做 N 步：这类「导出有没有人用」由 tests/dead-export-gate.js 兜
//   （它是全仓面的，比本锁一处一处数得全）。
'use strict';
const fs = require('fs');
const path = require('path');
const { fresh } = require('./ui-gate-sync.js');
const ROOT = path.resolve(__dirname, '..');
const CANON = 'engines/canon.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js';
let PASS = 0, FAIL = 0;
const a = (ok, msg) => { if (ok) PASS++; else { FAIL++; console.log('  ✗ ' + msg); } };
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function must1(s, x, tag) { const n = hits(s, x); if (n !== 1) throw new Error('anchor hits != 1 (' + n + ') :: ' + tag); return n; }
// ══════════════ 真源码破坏锚点（各自恰中 1 次）══════════════
const ANCHORS = {
  // 口径④ 一行都没撞上 ⇒ 照实说没信号（**不给坐标**）
  NO_SIGNAL_HONEST: { rel: CANON, txt: "    if (!hit.length) return { ok: false, reason: 'no-signal', rows: rows.length, sources: sources, scope: ALIGN_TITLE };" },
  // 口径⑧⑨ signal 的计数与理由：没信号就说没信号（不许把「没对上」写成「对上了」）
  SIGNAL_NO_SIGNAL: { rel: CANON, txt: "    stat.signals++;\n    stat.lastReason = rows.length ? 'signal' : 'no-signal';" },
  // 口径④ 的下游：只有 hit>0 的幕进读数（0 命中的幕不是「最接近」，是「没关系」）
  COVER_HIT_FILTER: { rel: CANON, txt: "    }).filter(function (r) { return r && r.hit > 0; })" },
  // 口径⑦ 噪声下限：题名归一化后不足 4 字不参与对位
  THIN_GUARD: { rel: CANON, txt: "    if (keys.length < ALIGN_MIN_NEED) return { score: 0, hit: 0, need: keys.length, thin: true, evidence: [] };" },
  // 口径⑤ 诊断面调**纯算核心**（不碰任何计数）——「看一眼」不该改账
  ALIGN_CALC_PURE: { rel: CANON, txt: "    const r = alignCalc('');" },
  // 口径⑨ position 记 aligns（不是 signals：两件事不能挤进同一个计数器）
  POSITION_STAT_SPLIT: { rel: CANON, txt: "    stat.aligns++; stat.lastReason = 'aligned';" },
  // B9 总幕数取自 acts0：被截断的骨架仍要报**原著总幕数**（否则「还剩几幕」会凭空变少）
  GAP_TOTAL_FROM_ACTS0: { rel: CANON, txt: "    const total = o.acts0 || arch;\n    stat.gaps++; stat.lastReason = 'gap';" },
  // 口径⑩ 幕号越界照实不成立（夹到边界 = 说了一个假句：你指的是最后一幕）
  GAP_RANGE_NO_CLAMP: { rel: CANON, txt: "    if (!(a >= 1 && a <= arch)) {" },
  // 口径⑤ 诊断节只读对位视图（**不调**会改 stat 的 position）
  DIAG_ALIGN_PURE: { rel: DIAG, txt: "      const align = (typeof WA.canon.alignView === 'function') ? safe(function () { return WA.canon.alignView(); }, null) : null;" }
};
const BREAK = {
  // 破坏：一行都没撞上也硬给一个坐标（「随便挑一个最像的」——正是口径④要根除的那类谎）
  NO_SIGNAL_HONEST: "    if (false) return { ok: false, reason: 'no-signal', rows: rows.length, sources: sources, scope: ALIGN_TITLE };",
  // 破坏：没信号也说「有信号」
  SIGNAL_NO_SIGNAL: "    stat.signals++;\n    stat.lastReason = 'signal';",
  // 破坏：0 命中的幕也进读数（幕总数被伪装成「有几幕跟你有关」）
  COVER_HIT_FILTER: "    }).filter(function (r) { return r; })",
  // 破坏：噪声下限失效（两个字撞上就算信号）
  THIN_GUARD: "    if (false) return { score: 0, hit: 0, need: keys.length, thin: true, evidence: [] };",
  // 破坏：诊断面调**会改 count 的**入口——「看一眼」变成「动了一下」
  ALIGN_CALC_PURE: "    const r = (stat.aligns++, alignCalc(''));",
  // 破坏：对位成功记进 signals（两件事挤进同一个计数器，「我看了几眼」被算成「我整理了几次」）
  POSITION_STAT_SPLIT: "    stat.signals++; stat.lastReason = 'aligned';",
  // 破坏：总幕数取**已整理幕数**（截断过的骨架会报出一个更小的「共几幕」）
  GAP_TOTAL_FROM_ACTS0: "    const total = arch;\n    stat.gaps++; stat.lastReason = 'gap';",
  // 破坏：越界也放行（返回一个不存在的幕号，调用方以为被接受了）
  GAP_RANGE_NO_CLAMP: "    if (false) {",
  // 破坏：诊断节改调 position ⇒ 面板上每一次「看一眼」都涨计数（并带走 scope 语义）
  DIAG_ALIGN_PURE: "      const align = (typeof WA.canon.position === 'function') ? safe(function () { return WA.canon.position('x'); }, null) : null;"
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
/** 复位到已知票面：fresh() 复用宿主 localStorage，上一个探针写过的设置会带着出场。 */
function seed(W) {
  W.store.transact(function (d) { d.canon = { outline: null }; }, 'v2100c:seed');
  W.canon.setSettings({ enabled: false, segChars: 1200, minPointChars: 40, maxPointChars: 400, perAct: 6, maxActs: 24, maxPoints: 600 });
  return W;
}
function env(over) {
  const H = fresh(over ? { srcOverride: over } : undefined);
  seed(H.WA);
  return H;
}
function seedSources(W, o) {
  o = o || {};
  W.store.transact(function (d) {
    d.chronicle = (o.chronicle || []).slice();
    d.currents = (o.currents || []).slice();
    d.echoes = (o.echoes || []).slice();
    const hs = (o.chapters || []).slice();
    d.chapters = { active: hs.length > 0, current: null, history: hs, seq: hs.length };
  }, 'v2100c:src');
  return W;
}
// ── 语料夹具 ────────────────────────────────────────────────
// 四幕夹具：每行 ≈ 700 字，行长远超 segChars(1200) 的一半 ⇒ **每行自成一节**；
//   perAct 1 ⇒ 一节一幕，于是「幕题名」= 「该行首句」，读数可逐字钉住。
const T4 = ['江面风急', '拍卖会风波', '码头易主', '夜访旧宅'];
const PHRASE = { A1: '江面风急', A2: '拍卖会风波', A3: '码头易主', A4: '夜访旧宅' };
function lineFor(title, padChar) {
  const pad = 700 - (title.length + 1);
  return title + '。' + padChar.repeat(pad);
}
function text4() {
  return T4.map(function (t, i) { return lineFor(t, String.fromCharCode(88 + i)); }).join('\n');  // X/Y/Z/W
}
function build4(W, opts) {
  const b = W.canon.buildOutline(text4(), Object.assign({ perAct: 1, maxActs: 8 }, opts || {}));
  if (!b.ok) throw new Error('fixture: build4 failed');
  return b;
}
function adopted4(W, opts) {
  const b = build4(W, opts);
  const r = W.canon.adopt(b, '锁');
  if (!r.ok) throw new Error('fixture: adopt4 failed');
  return b;
}
function chRow(i, summary) { return { id: 'ch' + i, kind: 'event', title: '第' + i + '回', summary: summary, at: 1000 + i, refs: [] }; }
function cuRow(i, summary) { return { id: 'cu' + i, title: '暗流' + i, summary: summary, visibility: 'hidden', stage: 'open', createdAt: 0, updatedAt: 0 }; }
function ecRow(i, result) { return { id: 'ec' + i, refCurrent: 'cu1', result: result, exposure: 'trace', at: 0 }; }
// 行文里带上幕题名（对位撞的就是这个）——不匹配行一律用无汉字的填充，避免假命中
function hitCh(i, phrase) { return chRow(i, '这是' + phrase + '的一天'); }
function missCh(i) { return chRow(i, 'F' + i + 'x'); }
function statJson(W) { return JSON.stringify(W.canon.stat()); }
/**
 * 期望的二字窗列表（**重叠**）：'江面风急' ⇒ ['江面','面风','风急']。
 *   自纠：这三条判据最初写成 `evidence.join('') === 原短语`，而重叠窗口拼起来是
 *   '江面面风风急'——判据从出生起就是恒假的。恒假的判据比没有判据更坏：它长得像绿灯。
 */
function bigrams(p) { const o = []; for (let i = 0; i + 2 <= p.length; i++) o.push(p.slice(i, i + 2)); return o; }
function evEq(ev, p) { return JSON.stringify(ev) === JSON.stringify(bigrams(p)); }
function keysOf(o) { return Object.keys(o).sort().join(','); }
// ══════════════ 同款真判据（每条口径一个探针）══════════════
/** B2 一行都没撞上 ⇒ no-signal，**不给坐标**；诊断面同样照实说。 */
function probeNoSignal(W) {
  try {
    const C = W.canon;
    adopted4(W);
    seedSources(W, { chronicle: [missCh(1), missCh(2)] });
    const before = statJson(W);
    const p = C.position({});
    const v = C.alignView();
    if (p.ok !== false || p.reason !== 'no-signal') return false;
    if ('best' in p || 'coord' in p) return false;          // 不许带坐标出来
    if (v.hasSignal !== false || v.reason !== 'no-signal') return false;
    if (v.rows !== 2 || !v.sources || v.sources.chronicle !== 2) return false;
    const st = C.stat();
    if (st.blocked !== 1) return false;                     // 只有 position 记拒收
    if (st.signals !== 0 || st.aligns !== 0 || st.gaps !== 0) return false;
    // 诊断面这一次调用必须**零写入**：把 before 与「position 之后」的状态比，只多 blocked
    return JSON.parse(before).signals === 0;
  } catch (e) { return false; }
}
/** B8 no-signal 时 lastReason 照实说没信号。 */
function probeSignalReason(W) {
  try {
    const C = W.canon;
    adopted4(W);
    const r = C.signal('完全不相干的一段文本甲乙丙丁');
    const st = C.stat();
    return r.ok === false && r.reason === 'no-signal'
      && st.lastReason === 'no-signal' && st.signals === 1 && st.blocked === 0;
  } catch (e) { return false; }
}
/** B4 只有 hit>0 的幕进读数（不是「幕总数」）。 */
function probeCoverFilter(W) {
  try {
    const C = W.canon;
    adopted4(W);
    const r = C.signal(PHRASE.A1);
    if (!r.ok) return false;
    if (r.best.coord !== 'A1' || r.best.score !== 1 || r.best.hit !== 3 || r.best.need !== 3) return false;
    if (!evEq(r.best.evidence, PHRASE.A1)) return false;
    // 四幕在场、只有一幕被撞上：rows / hitActs 都必须是 1（0 命中的幕不是「最接近」）
    return r.acts === 4 && r.rows.length === 1 && r.hitActs === 1;
  } catch (e) { return false; }
}
/** B5 题名过短的幕不参与对位；够长的照常参与（两向都验，防「一律不参与」也能绿）。 */
function probeThinGuard(W) {
  try {
    const thin = W;
    const b = thin.canon.buildOutline(lineFor('夜访', 'X'), { perAct: 1, maxActs: 8 });
    if (!b.ok) return false;
    if (b.acts.length !== 1 || b.acts[0].title !== '夜访。') return false;   // 夹具自证
    if (!thin.canon.adopt(b, '锁').ok) return false;
    seedSources(thin, { chronicle: [chRow(1, '他提起了夜访这件事')] });
    const p = thin.canon.position({});
    const v = thin.canon.alignView();
    if (p.ok !== false || p.reason !== 'no-signal') return false;
    if (v.hasSignal !== false || v.reason !== 'no-signal') return false;
    // 对照：同一段历史换个够长的题名就应当**被撞上**（否则「一律不参与」也能让上面全绿）
    const W2 = env().WA;
    adopted4(W2);
    seedSources(W2, { chronicle: [chRow(1, '他提起了夜访旧宅这件事')] });
    const p2 = W2.canon.position({});
    return p2.ok === true && p2.best.coord === 'A4' && p2.best.votes === 1;
  } catch (e) { return false; }
}
/** B7 诊断面零 stat 写入（口径⑤）＋ 读数确定性（口径⑬）。 */
function probeAlignViewPure(W) {
  try {
    const C = W.canon;
    adopted4(W);
    seedSources(W, { chronicle: [hitCh(1, PHRASE.A1), hitCh(2, PHRASE.A1)] });
    const before = statJson(W);
    const v1 = C.alignView();
    const mid = statJson(W);
    const v2 = C.alignView();
    const after = statJson(W);
    if (before !== mid || mid !== after) return false;
    const st = JSON.parse(after);
    if (st.signals !== 0 || st.aligns !== 0 || st.gaps !== 0 || st.blocked !== 0 || st.builds !== 1) return false;
    if (v1.hasSignal !== true || v1.coord !== 'A1' || v1.title !== '江面风急。') return false;
    if (v1.votes !== 2 || v1.score !== 1 || v1.rows !== 2 || v1.hitRows !== 2 || v1.hitActs !== 1) return false;
    if (v1.passed !== 1 || v1.remain !== 3 || v1.total !== 4) return false;
    if (!evEq(v1.evidence, PHRASE.A1)) return false;
    if (JSON.stringify(v1) !== JSON.stringify(v2)) return false;   // 口径⑬：顺序稳定才可复现
    return v1.sources.chronicle === 2 && v1.runners.length === 0;
  } catch (e) { return false; }
}
/** B6 三计数分列 + 平手取幕号小者（口径⑨⑬）。 */
function probePositionSplit(W) {
  try {
    const C = W.canon;
    adopted4(W);
    // 平手：两行指 A1、两行指 A3 ⇒ 票数相同、峰值相同 ⇒ 取幕号小者
    seedSources(W, { chronicle: [hitCh(1, PHRASE.A1), hitCh(2, PHRASE.A1), hitCh(3, PHRASE.A3), hitCh(4, PHRASE.A3)] });
    const r1 = C.position({});
    if (!r1.ok) return false;
    if (r1.best.coord !== 'A1' || r1.best.votes !== 2 || r1.best.score !== 1) return false;
    if (r1.runners.length !== 1 || r1.runners[0].coord !== 'A3' || r1.runners[0].votes !== 2) return false;
    if (r1.rows !== 4 || r1.hitRows !== 4 || r1.hitActs !== 2) return false;
    if (r1.passed !== 1 || r1.remain !== 3 || r1.total !== 4) return false;
    const st1 = C.stat();
    if (st1.aligns !== 1 || st1.signals !== 0 || st1.gaps !== 0 || st1.blocked !== 0) return false;
    // 第三人指 A3 ⇒ 票数反超，读数必须换
    const W2 = env().WA;
    adopted4(W2);
    seedSources(W2, { chronicle: [hitCh(1, PHRASE.A1), hitCh(2, PHRASE.A1), hitCh(3, PHRASE.A3), hitCh(4, PHRASE.A3), hitCh(5, PHRASE.A3)] });
    const r2 = W2.canon.position({});
    if (!r2.ok || r2.best.coord !== 'A3' || r2.best.votes !== 3) return false;
    if (r2.passed !== 3 || r2.remain !== 1) return false;
    const st2 = W2.canon.stat();
    return st2.aligns === 1 && st2.signals === 0 && st2.gaps === 0;
  } catch (e) { return false; }
}
/** B9 gap 的总幕数取自 acts0（截断过的骨架仍报原著总幕数）。 */
function probeGapTotal(W) {
  try {
    const C = W.canon;
    const b = build4(W, { maxActs: 2 });
    if (b.acts.length !== 2 || b.truncated.totalActs !== 4) return false;   // 夹具自证
    if (!C.adopt(b, '锁').ok) return false;
    const g = C.gap('A2');
    if (!g.ok) return false;
    if (g.act !== 2 || g.total !== 4 || g.archived !== 2 || g.passed !== 2 || g.remain !== 2) return false;
    if (g.truncated !== true) return false;
    const o = C.gap('A3');
    const st = C.stat();
    return o.ok === false && o.reason === 'out-of-range' && o.acts === 2 && o.total === 4
      && st.gaps === 1 && st.blocked === 1;
  } catch (e) { return false; }
}
/** B10 幕号越界不夹到边界 + B11 坐标往返。 */
function probeGapClamp(W) {
  try {
    const C = W.canon;
    adopted4(W);
    const big = C.gap('A99'), zero = C.gap('A0');
    if (big.ok !== false || big.reason !== 'out-of-range' || big.acts !== 4 || big.total !== 4) return false;
    if (zero.ok !== false || zero.reason !== 'out-of-range' || zero.acts !== 4) return false;
    // coordOf 只管**号本身的合法域**（LIMITS.MAX_ACTS = 200），幕数界在 gap / locate 里：
    //   面板「按号定位」就是这么走的（先拼号、再让引擎拒收），故这里照抄同一条路。
    //   自纠：原判据写 `coordOf(99) === null`——那是把**构建期**的界错当成**幕数**的界，
    //   于是判据在正确实现上恒假。
    if (C.coordOf(0) !== null || C.coordOf(201) !== null) return false;
    const far = C.coordOf(99);
    if (far === null || far.text !== 'A99') return false;
    const farGap = C.gap(far.text);
    if (farGap.ok !== false || farGap.reason !== 'out-of-range') return false;
    for (let n = 1; n <= 4; n++) {
      const c = C.coordOf(n);
      const g = C.gap(c.text);
      if (!g.ok || g.act !== n || g.coord !== 'A' + n || g.remain !== 4 - n) return false;
    }
    const st = C.stat();
    return st.gaps === 4 && st.blocked === 3;
  } catch (e) { return false; }
}
/** B12 观测不得改变被观测对象：诊断节 collect() 不写任何计数（口径⑤）。 */
function probeDiagPure(W) {
  try {
    adopted4(W);
    seedSources(W, { chronicle: [hitCh(1, PHRASE.A1), hitCh(2, PHRASE.A1)] });
    const before = statJson(W);
    const d1 = W.toolDiag.collect();
    const mid = statJson(W);
    const d2 = W.toolDiag.collect();
    const after = statJson(W);
    if (before !== mid || mid !== after) return false;
    if (!d1.canon || !d1.canon.align) return false;
    const al = d1.canon.align;
    if (al.adopted !== true || al.hasSignal !== true || al.coord !== 'A1') return false;
    // rows 是**世界侧历史行数**（喂了 2 行 ⇒ 2），不是幕数（4）——两者混用会把
    //   「有 4 行历史」读成「有 4 幕」，而那正是本面对位要分清的东西。
    if (al.rows !== 2 || al.hitRows !== 2 || al.votes !== 2 || al.passed !== 1 || al.remain !== 3) return false;
    // 诊断面同节的 acts / acts0 才是幕数的出处（align 段**有意只挑对位读数**，不带幕数）：
    //   断言 align 里有 acts 等于要求诊断面重复一遍幕数，那是把口径摊薄。
    if (d1.canon.acts !== 4 || d1.canon.acts0 !== 4) return false;
    if (d1.canon.signals !== 0 || d1.canon.aligns !== 0 || d1.canon.gaps !== 0) return false;
    return d2.canon.signals === 0 && d2.canon.aligns === 0 && d2.canon.gaps === 0;
  } catch (e) { return false; }
}
// ── 非锚点探针（口径的其余一半，不参与逐锚负控制）──────────────
/** B1 未采纳时照实说没有基准（四个读出口都不编读数）。 */
function probeNoOutline(W) {
  try {
    const C = W.canon;
    const v = C.alignView();
    if (v.ok !== true || v.adopted !== false || v.hasSignal !== false) return false;
    if ('coord' in v) return false;
    const s = C.signal('江面风急'), p = C.position({}), g = C.gap('A1');
    if (s.ok !== false || s.reason !== 'no-outline') return false;
    if (p.ok !== false || p.reason !== 'no-outline') return false;
    if (g.ok !== false || g.reason !== 'no-outline') return false;
    const st = C.stat();
    return st.signals === 0 && st.aligns === 0 && st.gaps === 0 && st.blocked === 3;
  } catch (e) { return false; }
}
/** B13 拒收三态：empty-text（含纯空白）/ too-long（带上界与实长）。 */
function probeAlignReject(W) {
  try {
    const C = W.canon;
    adopted4(W);
    const e1 = C.signal(''), e2 = C.signal('   \n  ');
    if (e1.ok !== false || e1.reason !== 'empty-text') return false;
    if (e2.ok !== false || e2.reason !== 'empty-text') return false;
    const t = C.signal('X'.repeat(20001));
    if (t.ok !== false || t.reason !== 'too-long' || t.chars !== 20001 || t.max !== 20000) return false;
    const st = C.stat();
    // 拒收全进 blocked；**三个计数一个都不许涨**（被拒的东西不构成一次对位）
    return st.blocked === 3 && st.signals === 0 && st.aligns === 0 && st.gaps === 0;
  } catch (e) { return false; }
}
/** B14 scope 只认四源之一；不指定 / 写错名一律四源全扫。 */
function probeAlignScope(W) {
  try {
    const C = W.canon;
    adopted4(W);
    seedSources(W, { chronicle: [hitCh(1, PHRASE.A1), hitCh(2, PHRASE.A1)], currents: [cuRow(1, '这是码头易主的一天')] });
    const p1 = C.position({ scope: 'chronicle' });
    if (!p1.ok || keysOf(p1.sources) !== 'chronicle' || p1.best.coord !== 'A1' || p1.best.votes !== 2) return false;
    if (p1.rows !== 2) return false;
    const p2 = C.position({ scope: 'currents' });
    if (!p2.ok || keysOf(p2.sources) !== 'currents' || p2.best.coord !== 'A3' || p2.best.votes !== 1) return false;
    const p3 = C.position({ scope: '不存在的源' });
    if (!p3.ok || keysOf(p3.sources) !== 'chronicle,currents' || p3.rows !== 3) return false;
    const p4 = C.position();
    if (!p4.ok || keysOf(p4.sources) !== 'chronicle,currents' || p4.best.coord !== 'A1') return false;
    const p5 = C.position({});
    return p5.ok === true && keysOf(p5.sources) === 'chronicle,currents';
  } catch (e) { return false; }
}
/** B15 上界如实生效：每源最近 24 行、总数 48。 */
function probeAlignRowsCap(W) {
  try {
    const C = W.canon;
    adopted4(W);
    const many = function (n) { const o = []; for (let i = 1; i <= n; i++) o.push(missCh(i)); return o; };
    const manyCu = function (n) { const o = []; for (let i = 1; i <= n; i++) o.push(cuRow(i, 'F' + i + 'x')); return o; };
    const manyEc = function (n) { const o = []; for (let i = 1; i <= n; i++) o.push(ecRow(i, 'F' + i + 'x')); return o; };
    seedSources(W, { chronicle: many(30) });
    const v1 = C.alignView();
    if (v1.hasSignal !== false || v1.reason !== 'no-signal' || v1.rows !== 24 || keysOf(v1.sources) !== 'chronicle') return false;
    seedSources(W, { chronicle: many(30), currents: manyCu(30) });
    const v2 = C.alignView();
    if (v2.rows !== 48 || keysOf(v2.sources) !== 'chronicle,currents') return false;
    seedSources(W, { chronicle: many(30), currents: manyCu(30), echoes: manyEc(30) });
    const v3 = C.alignView();
    return v3.rows === 48 && keysOf(v3.sources) === 'chronicle,currents';
  } catch (e) { return false; }
}
function runAll(a) {
  const canonSrc = src(CANON), diagSrc = src(DIAG), panSrc = src(PANEL);
  // ── A 静态面（消费方在位；这类判据读真文件，故不做负控制，见文件头）──
  a(hits(canonSrc, 'WA.apiRouter') === 0 && canonSrc.indexOf('不调模型') >= 0,
    'v2100: [A1] 不调模型（口径②：对位是纯算术——模型判定不可复现，「上次定位到第 3 幕」就没有意义）；'
    + '判据认 `WA.apiRouter` 而不是裸字串（后者在注释里本来就出现）');
  a(panSrc.indexOf('WA.canon') >= 0 && hits(panSrc, "on('#wa-cn-") === 10,
    'v2100: [A2] 面板真接线（v2.100.0 起 10 条 canon 绑定：7 条既有 + 对位三枚 signal / position / gap）');
  a(panSrc.indexOf('WA.canon.signal(') >= 0 && panSrc.indexOf('WA.canon.position(') >= 0
    && panSrc.indexOf('WA.canon.gap(') >= 0,
    'v2100: [A2] 三枚对位按钮各接一个**真**导出（无消费方不挂导出——只在测试里活的导出不算交付）');
  a(hits(diagSrc, "'wa-cn-") === 19,
    'v2100: [A2] 诊断节的 UI_BINDINGS 登记 19 个 canon 控件 id（渲染 + 绑定 + 守卫登记三件齐做；'
    + 'v2.100.0 新增 wa-cn-check / wa-cn-signal / wa-cn-position / wa-cn-gap 四枚）');
  a(diagSrc.indexOf("'engines/canon.js': 'canon',") >= 0
    && diagSrc.indexOf("const OPTIONAL_EXPORTS = ['ui', 'uiSettings', 'assistant', 'compat'];") >= 0,
    'v2100: [A3] canon 登记为**必载**模块（不在 OPTIONAL_EXPORTS 里——缺席即断裂，不该被静默兜住）');
  a(diagSrc.indexOf('secCanon') >= 0 && diagSrc.indexOf('canon: secCanon(),') >= 0
    && diagSrc.indexOf('WA.canon.alignView') >= 0,
    'v2100: [A3] 诊断节 canon 面在位且对位段接的是**只读**出口（alignView）');
  // ── B 运行时面 ──
  a(probeNoOutline(env().WA),
    'v2100: [B1] 未采纳时照实说「没有基准」（signal / position / gap 全报 no-outline，诊断面 adopted:false）');
  a(probeNoSignal(env().WA),
    'v2100: [B2] 一行都没撞上 ⇒ no-signal，**不给坐标**（口径④：没对上与「最接近」必须长得不一样）');
  a(probeSignalReason(env().WA),
    'v2100: [B8] no-signal 时 lastReason 照实说没信号（不把「没对上」写成「对上了」）');
  a(probeCoverFilter(env().WA),
    'v2100: [B4] 只有 hit>0 的幕进读数（acts 4 / rows 1 / hitActs 1——幕总数与「有几幕跟你有关」是两回事）');
  a(probeThinGuard(env().WA),
    'v2100: [B5] 题名过短的幕不参与对位（口径⑦两字撞上不是信号），够长的照常参与（两向都验）');
  a(probeAlignViewPure(env().WA),
    'v2100: [B7] 诊断面零 stat 写入（口径⑤取证不得改变被取证对象）+ 连调两次读数逐字相同（口径⑬）');
  a(probePositionSplit(env().WA),
    'v2100: [B6] 三计数分列（position 记 aligns，signals/gaps 不动）+ 平手取幕号小者（口径⑨⑬）');
  a(probeGapTotal(env().WA),
    'v2100: [B9] gap 的总幕数取自 acts0（截断过的骨架仍报原著总幕数 4，不是已整理 2）');
  a(probeGapClamp(env().WA),
    'v2100: [B10/B11] 幕号越界不夹到边界（A99 / A0 一律 out-of-range）+ coordOf 拼出的号 gap 解回同一个');
  a(probeDiagPure(env().WA),
    'v2100: [B12] 观测不得改变被观测对象：诊断节 collect() 两次都不写任何计数（口径⑤）');
  a(probeAlignReject(env().WA),
    'v2100: [B13] 拒收三态（empty-text ×2 / too-long 20001 > 20000）全进 blocked，三个计数一个不涨');
  a(probeAlignScope(env().WA),
    'v2100: [B14] scope 只认四源之一；不指定 / 写错名一律四源全扫（错名回落不会给出错答案）');
  a(probeAlignRowsCap(env().WA),
    'v2100: [B15] 上界如实生效：每源取最近 24 行、总数上限 48（30+30+30 ⇒ 48 且 echoes 不进来源表）');
  // ── C 不变式：对位结果不落盘 ──
  const Wc = env().WA;
  adopted4(Wc);
  seedSources(Wc, { chronicle: [hitCh(1, PHRASE.A1)] });
  const canonBefore = JSON.stringify(Wc.store.get().canon);
  Wc.canon.alignView();
  Wc.canon.signal(PHRASE.A1);
  Wc.canon.position({});
  Wc.canon.gap('A1');
  const canonAfter = JSON.stringify(Wc.store.get().canon);
  a(canonBefore === canonAfter && keysOf(Wc.store.get().canon) === 'outline',
    'v2100: [C1] 对位结果**不落盘**（口径⑥：坐标是标出来的不是猜的——存档 canon 子树逐字不变、键集恰为 outline）');
  const Wc2 = env().WA;
  adopted4(Wc2);
  seedSources(Wc2, { chronicle: [hitCh(1, PHRASE.A1), hitCh(2, PHRASE.A1)] });
  const pC = Wc2.canon.position({});
  const pk = Wc2.canon.coordOf(pC.best.actNo);
  a(pk !== null && pk.text === pC.best.coord,
    'v2100: [C2] 读数与坐标同源（position 报的 coord 与 coordOf(该幕号) 拼出来的逐字相同）');
}
function runNegative(a) {
  Object.keys(ANCHORS).forEach(function (k) { must1(src(ANCHORS[k].rel), ANCHORS[k].txt, k); });
  a(Object.keys(ANCHORS).length === 9, 'v2100c: [N0] 九个破坏锚点在真源码各恰中 1 次');
  let threw = 0;
  try { must1(src(CANON), '锚点根本不在源码里__v2100c', 'self'); } catch (e) { threw++; }
  try { must1(src(CANON) + ANCHORS.GAP_RANGE_NO_CLAMP.txt, ANCHORS.GAP_RANGE_NO_CLAMP.txt, 'self'); } catch (e) { threw++; }
  a(threw === 2, 'v2100c: [N0] 锚点工具两向自证：不存在 / 不唯一都必须抛（实抛 ' + threw + '/2）');
  // N1 原版干净（每条探针独立实例——它们都会写 store / stat，共享实例会读到前一条的手指印）
  const probes = [['noSignal', probeNoSignal], ['signalReason', probeSignalReason], ['coverFilter', probeCoverFilter],
    ['thinGuard', probeThinGuard], ['alignPure', probeAlignViewPure], ['positionSplit', probePositionSplit],
    ['gapTotal', probeGapTotal], ['gapClamp', probeGapClamp], ['diagPure', probeDiagPure]];
  const n1 = probes.map(function (x) { return { name: x[0], ok: x[1](env().WA) }; });
  const bad = n1.filter(function (x) { return !x.ok; }).map(function (x) { return x.name; });
  a(bad.length === 0, 'v2100c: [N1] 原版上九条判据全部干净（不干净的是 ' + (bad.join(',') || '无') + '）');
  // N2–N10 逐锚：真源码破坏 ⇒ 装载破坏副本 ⇒ 在副本上重跑**同款**真判据
  let step = 1;
  Object.keys(ANCHORS).forEach(function (key) {
    step++;
    const fn = probes.filter(function (x) { return x[0] === CAMP[key]; })[0];
    if (!fn) throw new Error('no probe bound to anchor :: ' + key);
    const b = breakOne(key);
    const Hn = env({ [b.rel]: b.src });
    const ok = fn[1](Hn.WA);
    a(ok === false, 'v2100c: [N' + step + '] 拆掉「' + key + '」后判据现形');
    a(!!Hn.WA.canon && typeof Hn.WA.canon.signal === 'function' && !!Hn.WA.toolDiag,
      'v2100c: [N' + step + '] 破坏副本仍正常装载（不是「装不起来」，是**判据真敏感**）');
  });
  // N10 判据纯度（H5：锚点字面量在本文件只准声明一次）
  const self = src('tests/canon-align-v2100.js');
  const ok9 = Object.keys(ANCHORS).every(function (k) {
    return hits(self, ANCHORS[k].txt.replace(/\n/g, '\\n')) === 1;
  });
  a(ok9, 'v2100c: [N10] 每条锚点字面量在本文件只出现一次（判据不得引用锚点串）');
}
// 锚点 → 探针的绑定（逐锚负控制要跑**同款**判据，绑定关系显式写出来）
const CAMP = {
  NO_SIGNAL_HONEST: 'noSignal', SIGNAL_NO_SIGNAL: 'signalReason', COVER_HIT_FILTER: 'coverFilter',
  THIN_GUARD: 'thinGuard', ALIGN_CALC_PURE: 'alignPure', POSITION_STAT_SPLIT: 'positionSplit',
  GAP_TOTAL_FROM_ACTS0: 'gapTotal', GAP_RANGE_NO_CLAMP: 'gapClamp', DIAG_ALIGN_PURE: 'diagPure'
};
if (require.main === module) {
  const a2 = function (cond, name) {
    if (cond) { PASS++; }
    else { FAIL++; console.log('  ✗ ' + name); }
  };
  try { runAll(a2); runNegative(a2); }
  catch (e) { FAIL++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (FAIL) { console.log('CANON-ALIGN-V2100: FAIL ' + FAIL + ' / ' + (PASS + FAIL)); process.exit(1); }
  console.log('CANON-ALIGN-V2100: pass（' + PASS + ' 项）');
}
module.exports = { runAll: runAll, runNegative: runNegative, ANCHORS: ANCHORS };
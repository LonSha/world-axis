#!/usr/bin/env node
// WorldAxis tests/canon-v2990.js —— v2.99.0（第五十六面 原著幕目）
//
// 【它治的病：原著向玩法最贵的那三个问题在本仓不可答】
//   本仓的叙事状态全是**世界侧**的（currents / echoes / chronicle / causal.chains），
//   没有任何一处记录「原著里本该长什么样」。于是——
//     ·「现在演到原著哪一段了」只能靠人记；
//     ·「已偏离原著哪一段」「哪一段已经不可能再发生」连**输入面**都没有（没有幕坐标）。
//   canon 把长文本切成分层可定位的「幕 → 剧情点」骨架（只切分，不改写）。
//
// 【口径（全是否定式）】
//   ① 总开关默认关闭；关闭时不切分、不采纳、不注入。
//   ② **只切分，不改写**：不修改用户给的原著，也不生成原著内容。
//      切分在**句级无损**，点只保留题名与长度，**正文本身不进存储**。
//   ③ **不调模型**：分幕是纯算术（按字符与段落边界合并）。
//      「用模型分幕」是上游做法，本仓不放：模型分幕不可复现，
//      而幕坐标一旦不可复现，「上次定位到第 3 幕」这句话就没有意义。
//   ④ 信息量随篇幅**线性**（幕数 = 节数/perAct，不是固定拍数）。
//   ⑤ 原著文本**不入存档**：只有大纲落盘（体积与篇幅无关）。
//   ⑥ `buildOutline` 纯计算（不写 store、不注入），`adopt` 是**唯一写入口**。
//   ⑦ 截断**必须报出**：`truncated.acts` / `truncated.points` 各自独立，且**先截点再分幕**。
//   ⑧ 坐标是**标出来的**：越界一律照实不成立（out-of-range），**不夹到边界**。
//   ⑨ 引擎内部异常与「你给的东西不对」**分开报**（build-throw / adopt-throw / clear-throw）。
//
// 【判据】
//   A 静态面：不调模型（apiRouter 零提及）+ 两个「按号」入口有真消费方（面板）
//             + 诊断节登记（MODULE_EXPORTS / OPTIONAL_EXPORTS 不含 canon）+ 出口面 13 成员。
//   B 运行时面（真装载真调用，每条口径一个探针）：
//     B1  未采纳时照实说「没有基准」（locate / actText / actsBrief 都报 no-outline，不编一份出来）
//     B2  坐标语法不对 ⇒ bad-coord（并把原始串带出来：got）
//     B3  坐标语法对但号越界 ⇒ out-of-range，且**报出实际有多少幕/点**（不夹到边界）
//     B4  点数截断如实报出（maxPoints 生效 ⇒ points 恰为上限、truncated.points 为真、totalPoints 是截断前的数）
//     B5  幕数截断如实报出（truncated.acts 为真、totalActs 是截断前的数）
//     B6  `pick` 是**全域总**的：越界或非数一律**回落设置里的默认值**，既不夹到边界、也不抛
//     B7  `adopt` 的形状闸：不是大纲的东西一律拒收（面板没试算就点采纳 / 外部传空）
//     B8  build-throw：切分过程内部异常如实归因（并记账 stat.faults.build）
//     B9  adopt-throw：落盘事务抛异常 ⇒ 如实归因，且**不留半份大纲**
//     B10 clear-throw：清空事务抛异常 ⇒ 如实归因，且**大纲不被当成已清掉**
//     B11 clearOutline 的闸：没大纲时清空报 no-outline（不能把「没得清」当「清成功」）
//     B12 注入块的题名收尾：幕题名自带句末标点，拼接前必须剥掉（不许出现「。。」）
//     B13 出口面恰为 13 个成员（新增导出必付代价——加成员就得来改本锁）
//     B14 **观测不得改变被观测对象**：诊断节只读（collect() 不改 buildOutline 的计数）
//   C 不变式：coordOf 拼出来的坐标与 locate 解析出来的坐标同一（拼装只有一处实现）。
//   N1–N15 负控制：真源码破坏 ⇒ 装载破坏副本 ⇒ 在副本上重跑**同款**真判据。
//   N16 判据纯度：每条锚点字面量在本文件只出现一次（判据不得引用锚点串）。
//
// 【为什么消费方在位只进 A 面、不进 ANCHORS（自纠，记录以免后人补错）】
//   面板 / 诊断的「消费方在位」判据读的是**真文件**；而负控制的破坏写在**临时副本**上
//   （srcOverride）。读真文件的判据在破坏副本面前照样绿——那样得到的是一条**假绿**的负控制。
//   所以静态锚点一律不做 N 步：这类「导出有没有人用」由 tests/dead-export-gate.js 兜
//   （它是全仓面的，比本锁一处一处数得全）。
//
// 【为什么 ANCHORS 里有一条 tool-diag 的锚点】
//   第九条口径里最容易被顺手破坏的一条是「观测不得改变被观测对象」：
//   诊断节若改用会改 stat 的入口（`buildOutline`），面板上每一次「看一眼」都会涨计数。
//   它与 canon.js 的锚点同规格（有运行时探针、破坏可观测），故并入同一张表。
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
  // 口径⑧ locate 的前置：没有基准就照实说没有（**不编一份出来**）
  NO_FAKE_OUTLINE: { rel: CANON, txt: "    const o = outline();\n    if (!o) { stat.blocked++; stat.lastReason = 'no-outline'; return { ok: false, reason: 'no-outline' }; }\n    const raw = clean(coord, 20);" },
  // 口径⑧ 语法不对 ⇒ bad-coord（且把原始串带出来）
  BAD_COORD_REJECT: { rel: CANON, txt: "    const m = raw.match(COORD_RE);\n    if (!m) { stat.blocked++; stat.lastReason = 'bad-coord'; return { ok: false, reason: 'bad-coord', got: raw }; }" },
  // 口径⑧ 号越界 ⇒ out-of-range（**不夹到边界**：夹了就说不出「你指的这段不存在」）
  OUT_OF_RANGE_NO_CLAMP: { rel: CANON, txt: "    const act = (o.acts || []).filter(function (x) { return x && x.no === a; })[0] || null;\n    if (!act) {\n      stat.blocked++; stat.lastReason = 'out-of-range';" },
  // 口径⑦ 点数截断如实报出（截了就得说截了，还要说截前多少）
  POINT_CUT_REPORT: { rel: CANON, txt: "      const totalPoints = pts.length;\n      let pointCut = false;\n      if (totalPoints > cfg.maxPoints) { pts = pts.slice(0, cfg.maxPoints); pointCut = true; }" },
  // 口径⑦ 幕数截断如实报出
  ACT_CUT_REPORT: { rel: CANON, txt: "      let actCut = false, kept = acts;\n      if (totalActs > cfg.maxActs) { kept = acts.slice(0, cfg.maxActs); actCut = true; }" },
  // 口径⑧ 的下游：越界/非数一律**回落默认值**（既不夹到边界，也不抛）
  PICK_FALLBACK: { rel: CANON, txt: "    return (n >= lo && n <= hi) ? n : dft;" },
  // 口径⑥ adopt 的形状闸（唯一写入口不能什么都收）
  ADOPT_SHAPE_GUARD: { rel: CANON, txt: "    if (!(built && built.ok)) { stat.blocked++; stat.lastReason = 'bad-outline'; return { ok: false, reason: 'bad-outline' }; }" },
  // 口径⑨ 「侧边坏了」与「你给的东西不对」分开报（三处）
  BUILD_THROW_ATTR: { rel: CANON, txt: "      noteFault('build', e); stat.blocked++; stat.lastReason = 'build-throw';\n      return { ok: false, reason: 'build-throw' };" },
  ADOPT_THROW_ATTR: { rel: CANON, txt: "      noteFault('adopt', e); stat.blocked++; stat.lastReason = 'adopt-throw';\n      return { ok: false, reason: 'adopt-throw' };" },
  CLEAR_THROW_ATTR: { rel: CANON, txt: "      noteFault('clear', e); stat.blocked++; stat.lastReason = 'clear-throw';\n      return { ok: false, reason: 'clear-throw' };" },
  // 口径⑥ 清空的闸：没大纲 ⇒ no-outline（不是「清成功」）
  CLEAR_GUARD: { rel: CANON, txt: "    if (!outline()) { stat.blocked++; stat.lastReason = 'no-outline'; return { ok: false, reason: 'no-outline' }; }" },
  // 口径④ 门面文字：幕题名自带句末标点，拼接前要剥（否则「…了几句。。」）
  TITLE_TRIM: { rel: CANON, txt: "    const trim = function (s) { return String(s || '').replace(/[。！？!?…，,；;：:]+$/, ''); };" },
  // 出口面：coordOf / actText 是**有真消费方**的（面板两个「按号」入口）
  EXACT_KEY_REMOVED: { rel: CANON, txt: "    coordOf: coordOf,\n    actsBrief: actsBrief,\n    actText: actText," },
  // 「观测不得改变被观测对象」：诊断节只读 outlineView（**不调**会改 stat 的 buildOutline）
  DIAG_PURE: { rel: DIAG, txt: "      const view = (typeof WA.canon.outlineView === 'function') ? safe(function () { return WA.canon.outlineView(); }, null) : null;" }
};
const BREAK = {
  // 破坏：没有基准时**编一份出来**（返回 ok:true 的空壳）——这正是口径⑧要根除的那类谎
  NO_FAKE_OUTLINE: "    const o = outline();\n    if (!o) { return { ok: true, coord: raw0() }; }\n    const raw = clean(coord, 20);",
  // 破坏：语法不对也放行（把「人写的坐标往往不是坐标」这件事实抹掉）
  BAD_COORD_REJECT: "    const m = raw.match(COORD_RE) || ['A1', '1'];\n    if (!m) { stat.blocked++; stat.lastReason = 'bad-coord'; return { ok: false, reason: 'bad-coord', got: raw }; }",
  // 破坏：越界就**夹到边界**（说成「你指的是最后一幕」——这句话是假的）
  OUT_OF_RANGE_NO_CLAMP: "    const act = (o.acts || []).filter(function (x) { return x && x.no === a; })[0] || (o.acts || [])[0] || null;\n    if (!act) {\n      stat.blocked++; stat.lastReason = 'out-of-range';",
  // 破坏：恒报「没截」（截断这件事这次就永远说不出口）
  POINT_CUT_REPORT: "      const totalPoints = pts.length;\n      let pointCut = false;\n      if (false) { pts = pts.slice(0, cfg.maxPoints); pointCut = true; }",
  // 破坏：截了却说没截
  ACT_CUT_REPORT: "      let actCut = false, kept = acts;\n      if (false) { kept = acts.slice(0, cfg.maxActs); actCut = true; }",
  // 破坏：越界值**夹到边界**（调用方以为自己的 999 被接受了）。
  //   ★ 这里刻意**不**写成 `return n;`：那会让 perAct=0 一路走到分幕循环（`i += 0` 永不前进），
  //     负控制会把整把锁挂死——而「挂死」不是判据现形，是判据失效。夹到边界同样是口径⑧
  //     要根除的那类谎（「你填的 999 被接受了」），且破坏可观测、无死循环。
  PICK_FALLBACK: "    return (n >= lo && n <= hi) ? n : (n < lo ? lo : hi);",
  // 破坏：形状闸失效（什么都收，坏大纲会在落盘时才炸）
  ADOPT_SHAPE_GUARD: "    if (false) { stat.blocked++; stat.lastReason = 'bad-outline'; return { ok: false, reason: 'bad-outline' }; }",
  // 破坏：异常归因塌成「存储不可用」（面板就只能用同一句话回答两件不同的事）
  BUILD_THROW_ATTR: "      noteFault('build', e); stat.blocked++; stat.lastReason = 'store-unavailable';\n      return { ok: false, reason: 'store-unavailable' };",
  ADOPT_THROW_ATTR: "      noteFault('adopt', e); stat.blocked++; stat.lastReason = 'store-unavailable';\n      return { ok: false, reason: 'store-unavailable' };",
  CLEAR_THROW_ATTR: "      noteFault('clear', e); stat.blocked++; stat.lastReason = 'store-unavailable';\n      return { ok: false, reason: 'store-unavailable' };",
  // 破坏：闸失效 ⇒ 把「没得清」当成「清成功」
  CLEAR_GUARD: "    if (false) { stat.blocked++; stat.lastReason = 'no-outline'; return { ok: false, reason: 'no-outline' }; }",
  // 破坏：不收尾（门面上出现「。。」）
  TITLE_TRIM: "    const trim = function (s) { return String(s || ''); };",
  // 破坏：两个「按号」入口连同导出一并消失（面板会静默失效 / dead-export 面会涨）
  EXACT_KEY_REMOVED: "    actsBrief: actsBrief,",
  // 破坏：诊断节改调**会改 stat 的**入口——「看一眼」变成「动了一下」
  DIAG_PURE: "      const view = (typeof WA.canon.buildOutline === 'function') ? safe(function () { return WA.canon.buildOutline('x'); }, null) : null;"
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
// 语料：句号句、无换行 ⇒ 段边界只由 segChars 决定（读数稳定）。
const S = '先生。'.repeat(400);        // 1200 字 ⇒ 1 段 / 4 点 / 1 幕
const M = '先生。'.repeat(3000);       // 9000 字 ⇒ 8 段 / 30 点 / 1 幕（默认点数上限 600 够不着）
const L = '先生。'.repeat(6000);       // 18000 字 ⇒ 2 幕（用于多幕门面文字）
/** 复位到已知票面：fresh() 复用宿主 localStorage，上一个探针写过的设置会带着出场。 */
function seed(W) {
  W.store.transact(function (d) { d.canon = { outline: null }; }, 'v2990c:seed');
  W.canon.setSettings({ enabled: false, segChars: 1200, minPointChars: 40, maxPointChars: 400, perAct: 6, maxActs: 24, maxPoints: 600 });
  return W;
}
function env(over) {
  const H = fresh(over ? { srcOverride: over } : undefined);
  seed(H.WA);
  return H;
}
/** 备一份「已采纳 + 开关打开」的现场（多数探针的起手式）。 */
function adopted(W, text, opts) {
  const b = W.canon.buildOutline(text, opts || {});
  if (!b.ok) throw new Error('fixture: build failed');
  const r = W.canon.adopt(b, '锁');
  if (!r.ok) throw new Error('fixture: adopt failed');
  W.canon.setSettings({ enabled: true });
  return b;
}
// ══════════════ 同款真判据（每条口径一个探针）══════════════
/** B1 未采纳时照实说「没有基准」。 */
function probeNoFakeOutline(W) {
  try {
    const C = W.canon;
    const v = C.outlineView();
    if (v.adopted !== false || v.acts !== 0 || v.points !== 0 || v.chars !== 0) return false;
    const l = C.locate('A1'), t = C.actText(1), brief = C.actsBrief(6);
    return l.ok === false && l.reason === 'no-outline'
      && t.ok === false && t.reason === 'no-outline'
      && brief.ok === false && brief.reason === 'no-outline' && brief.rows.length === 0;
  } catch (e) { return false; }
}
/** B2 语法不对 ⇒ bad-coord（并带出原始串；人写的坐标往往不是坐标）。 */
function probeBadCoord(W) {
  try {
    const C = W.canon;
    adopted(W, S);
    const z = C.locate('zz'), bare = C.locate('A'), dotted = C.locate('A1.x'), empty = C.locate('');
    return z.reason === 'bad-coord' && z.got === 'zz'
      && bare.reason === 'bad-coord' && dotted.reason === 'bad-coord' && empty.reason === 'bad-coord';
  } catch (e) { return false; }
}
/** B3 语法对但号越界 ⇒ out-of-range，且报出**实际有多少**（不夹到边界）。 */
function probeOutOfRange(W) {
  try {
    const C = W.canon;
    adopted(W, S);
    const bigAct = C.locate('A99'), bigPoint = C.locate('A1.9999'), t = C.actText(5);
    return bigAct.ok === false && bigAct.reason === 'out-of-range' && bigAct.acts === 1
      && bigPoint.ok === false && bigPoint.reason === 'out-of-range' && bigPoint.points === 4
      && t.ok === false && t.reason === 'out-of-range';
  } catch (e) { return false; }
}
/** B4 点数截断如实报出（上限生效、截前多少一并报出）。 */
function probePointCut(W) {
  try {
    const C = W.canon;
    const b = C.buildOutline(M, { maxPoints: 20 });
    return b.ok === true && b.points === 20 && b.truncated.points === true
      && b.truncated.totalPoints === 30 && b.truncated.acts === false
      && b.acts.length === 1 && b.segs === 8;
  } catch (e) { return false; }
}
/** B5 幕数截断如实报出。 */
function probeActCut(W) {
  try {
    const C = W.canon;
    const b = C.buildOutline(S, { perAct: 1, maxActs: 1 });
    return b.ok === true && b.acts.length === 1 && b.truncated.acts === true
      && b.truncated.totalActs === 4 && b.truncated.points === false && b.perAct === 1;
  } catch (e) { return false; }
}
/** B6 pick 全域总：越界或非数一律回落默认值（既不夹到边界、也不抛）。 */
function probePickFallback(W) {
  try {
    const C = W.canon;
    const lo = C.buildOutline(S, { perAct: 0 });
    const hi = C.buildOutline(S, { perAct: 999 });
    const nan = C.buildOutline(S, { perAct: Symbol('bad') });
    // 三件都要：① 没抛（ok 为真）；② 落回默认值 6；③ **不是**夹到边界（那会是 1 或 40）。
    //   缺了③，破坏成「夹到边界」时判据照样绿——本版锁刻意把边界值写死在这里。
    return lo.ok === true && lo.perAct === 6 && hi.ok === true && hi.perAct === 6
      && nan.ok === true && nan.perAct === 6 && C.getSettings().perAct === 6;
  } catch (e) { return false; }
}
/** B7 adopt 的形状闸：不是大纲的东西一律拒收。 */
function probeAdoptShape(W) {
  try {
    const C = W.canon;
    const n0 = C.adopt(null, 'x'), n1 = C.adopt(undefined, 'x'), n2 = C.adopt({}, 'x');
    const b = C.buildOutline(S, {});
    // 闸不能把真的也拦下：真大纲必须收（否则「一律拒收」也能让上面三条绿）
    return n0.ok === false && n0.reason === 'bad-outline'
      && n1.ok === false && n1.reason === 'bad-outline'
      && n2.ok === false && n2.reason === 'bad-outline'
      && C.adopt(b, 'x').ok === true;
  } catch (e) { return false; }
}
/** B8 切分内部异常如实归因（并记账）。 */
function probeBuildThrow(W) {
  const C = W.canon;
  const keep = W.settingsBus.normalize;
  try {
    // 打桩**设置层**：它在 buildOutline 的 try 内被 settings() 调到。
    //   ★ 本探针曾用 `{ perAct: Symbol }` 触发 —— 那条路在 pick 加固后**返回 ok:true**
    //     （pick 已是全域总的），于是判据变成假绿。记录在此以免后人「修回去」。
    W.settingsBus.normalize = function () { throw new Error('v2990c:settings-boom'); };
    const r = C.buildOutline(S, {});
    return r.ok === false && r.reason === 'build-throw' && C.stat().faults.build === 1;
  } catch (e) { return false; }
  finally { W.settingsBus.normalize = keep; }
}
/** B9 落盘事务抛异常 ⇒ 如实归因，且**不留半份大纲**。 */
function probeAdoptThrow(W) {
  const C = W.canon;
  const keep = W.store.transact;
  try {
    const b = C.buildOutline(S, {});
    W.store.transact = function () { throw new Error('v2990c:adopt-boom'); };
    const r = C.adopt(b, '锁');
    const after = C.outlineView();
    return r.ok === false && r.reason === 'adopt-throw' && C.stat().faults.adopt === 1
      && after.adopted === false;
  } catch (e) { return false; }
  finally { W.store.transact = keep; }
}
/** B10 清空事务抛异常 ⇒ 如实归因，且大纲**不被当成已清掉**。 */
function probeClearThrow(W) {
  const C = W.canon;
  const keep = W.store.transact;
  try {
    adopted(W, S);
    W.store.transact = function () { throw new Error('v2990c:clear-boom'); };
    const r = C.clearOutline();
    const after = C.outlineView();
    return r.ok === false && r.reason === 'clear-throw' && C.stat().faults.clear === 1
      && after.adopted === true;
  } catch (e) { return false; }
  finally { W.store.transact = keep; }
}
/** B11 没大纲时清空报 no-outline（不能把「没得清」当「清成功」）。 */
function probeClearGuard(W) {
  try {
    const C = W.canon;
    const r0 = C.clearOutline();
    adopted(W, S);
    const r1 = C.clearOutline();
    const r2 = C.clearOutline();
    return r0.ok === false && r0.reason === 'no-outline'
      && r1.ok === true && r2.ok === false && r2.reason === 'no-outline';
  } catch (e) { return false; }
}
/** B12 门面文字：题名收尾（不许「。。」，多幕用分号分隔）。 */
function probeTitleTrim(W) {
  try {
    const C = W.canon;
    adopted(W, M);
    const one = C.buildBlock();
    if (one.indexOf('先生。推进') < 0 || one.indexOf('。。') >= 0) return false;
    // 多幕：题名末尾的句号一律剥掉（分句用分号，不用把两个句号叠起来）
    //   自纠：原探针写 `adopted(C2, L)` 而 C2 是 `env().WA.canon`（应是 WA）——
    //   打桩式误用会抛进 catch，于是探针**永远返回 false**（一条恒红的判据等于没判据）。
    const W2 = env().WA;
    adopted(W2, L);
    const two = W2.canon.buildBlock();
    return two.indexOf('；') >= 0 && two.indexOf('。。') < 0 && two.indexOf('共 2 幕') >= 0;
  } catch (e) { return false; }
}
/** B13 出口面恰为 13 个成员（新增导出必付代价）。 */
function probeExactKey(W) {
  try {
    const keys = Object.keys(W.canon);
    return keys.length === 13 && keys.indexOf('coordOf') >= 0 && keys.indexOf('actText') >= 0
      && keys.indexOf('LIMITS') >= 0 && keys.indexOf('stat') >= 0;
  } catch (e) { return false; }
}
/** B14 观测不得改变被观测对象：诊断节只读（collect 不改计数）。 */
function probeDiagPureRead(W) {
  try {
    adopted(W, S);
    const C = W.canon;
    const before = C.stat().builds;
    const d1 = W.toolDiag.collect();
    const after = C.stat().builds;
    const d2 = W.toolDiag.collect();
    if (before !== after) return false;
    if (!d1.canon || d1.canon.adopted !== true) return false;
    return d1.canon.brief.length > 0 && d2.canon.acts === d1.canon.acts;
  } catch (e) { return false; }
}
function runAll(a) {
  const canonSrc = src(CANON), diagSrc = src(DIAG), panSrc = src(PANEL);
  // ── A 静态面（消费方在位；这类判据读真文件，故不做负控制，见文件头）──
  a(hits(canonSrc, 'WA.apiRouter') === 0 && canonSrc.indexOf('不调模型') >= 0,
    'v2990: [A1] 不调模型（口径③：canon.js 零提及 WA.apiRouter——分幕是纯算术，模型分幕不可复现）；'
    + '判据刻意认 `WA.apiRouter` 而不是裸字串 `apiRouter`：后者在头部说明里本来就出现一次（自纠，'
    + '原判据把「注释里说了这件事」误判成「代码里做了这件事」）');
  a(panSrc.indexOf('WA.canon') >= 0 && hits(panSrc, "on('#wa-cn-") === 7,
    'v2990: [A2] 面板真接线（7 条 canon 绑定：build / adopt / locate / view / clear / go / act）');
  a(hits(diagSrc, "'wa-cn-") === 15,
    'v2990: [A2] 诊断节的 UI_BINDINGS 登记 15 个 canon 控件 id（渲染 + 绑定 + 守卫登记三件齐做）');
  a(diagSrc.indexOf("'engines/canon.js': 'canon',") >= 0
    && diagSrc.indexOf("const OPTIONAL_EXPORTS = ['ui', 'uiSettings', 'assistant', 'compat'];") >= 0,
    'v2990: [A3] canon 登记为**必载**模块（不在 OPTIONAL_EXPORTS 里——缺席即断裂，不该被静默兜住）');
  a(diagSrc.indexOf('secCanon') >= 0 && diagSrc.indexOf('canon: secCanon(),') >= 0,
    'v2990: [A3] 诊断节 canon 面在位（secCanon 且已并入 collect 的返回体）');
  // ── B 运行时面 ──
  a(probeNoFakeOutline(env().WA),
    'v2990: [B1] 未采纳时照实说「没有基准」（locate / actText / actsBrief 全报 no-outline，不编一份出来）');
  a(probeBadCoord(env().WA),
    'v2990: [B2] 坐标语法不对 ⇒ bad-coord（`zz` / `A` / `A1.x` / 空串一律照实拒收，并把原始串带出来）');
  a(probeOutOfRange(env().WA),
    'v2990: [B3] 语法对但号越界 ⇒ out-of-range，且报出**实际有多少幕/点**（**不夹到边界**）');
  a(probePointCut(env().WA),
    'v2990: [B4] 点数截断如实报出（maxPoints 20 ⇒ points 恰为 20、truncated.points 为真、totalPoints 30）');
  a(probeActCut(env().WA),
    'v2990: [B5] 幕数截断如实报出（perAct 1 / maxActs 1 ⇒ 1 幕、truncated.acts 为真、totalActs 4）');
  a(probePickFallback(env().WA),
    'v2990: [B6] pick 全域总：越界（0 / 999）与非数一律**回落默认值 6**——既不夹到边界、也不抛');
  a(probeAdoptShape(env().WA),
    'v2990: [B7] adopt 的形状闸（null / undefined / {} 一律 bad-outline，而真大纲照收）');
  a(probeBuildThrow(env().WA),
    'v2990: [B8] build-throw：切分内部异常如实归因（并记账 stat.faults.build——「侧边坏了」自成一句）');
  a(probeAdoptThrow(env().WA),
    'v2990: [B9] adopt-throw：落盘事务抛异常 ⇒ 如实归因，且**不留半份大纲**');
  a(probeClearThrow(env().WA),
    'v2990: [B10] clear-throw：清空事务抛异常 ⇒ 如实归因，且大纲**不被当成已清掉**');
  a(probeClearGuard(env().WA),
    'v2990: [B11] 没大纲时清空报 no-outline（不把「没得清」当「清成功」）');
  a(probeTitleTrim(env().WA),
    'v2990: [B12] 门面文字收尾：题名末尾句号剥掉（不出现「。。」；多幕用分号分隔）');
  a(probeExactKey(env().WA),
    'v2990: [B13] 出口面恰为 13 个成员（加成员就得来改本锁——「新增导出必付代价」）');
  a(probeDiagPureRead(env().WA),
    'v2990: [B14] 观测不得改变被观测对象：诊断节只读（collect() 不改 buildOutline 的计数）');
  // ── C 不变式 ──
  const Wc = env().WA;
  adopted(Wc, S);
  // 自纠：原判据把 **幕号** 当成点号映射（`coordOf(n)` 对 2/3/4 本来就不成立——这份语料只有 1 幕）。
  //   真不变式是「coordOf 拼出的**每一种**坐标 locate 都解回同一个」，故两种形态都取：
  //   整幕 `A1` 与幕内每一点 `A1.n`。
  const pairs = [Wc.canon.coordOf(1)].concat([1, 2, 3, 4].map(function (n) { return Wc.canon.coordOf(1, n); }))
    .map(function (c) { return { c: c, r: c ? Wc.canon.locate(c.text) : null }; });
  a(pairs.length === 5 && pairs.every(function (p) { return p.c && p.r && p.r.ok === true && p.r.coord === p.c.text; }),
    'v2990: [C1] coordOf 拼出来的坐标（整幕 A1 + 幕内 4 点）locate 都能解析回同一个'
    + '（拼装只有一处实现，面板不自己拼 A+n）');
  const Wc2 = env().WA;
  adopted(Wc2, S);
  const off = Wc2.canon.coordOf(0);
  a(off === null, 'v2990: [C2] 号越界时 coordOf 返回 **null 而非夹到边界的 A1**（拼装阶段就照实说「这个号不成立」）');
}
function runNegative(a) {
  Object.keys(ANCHORS).forEach(function (k) { must1(src(ANCHORS[k].rel), ANCHORS[k].txt, k); });
  a(Object.keys(ANCHORS).length === 14,
    'v2990c: [N0] 十四个破坏锚点在真源码各恰中 1 次');
  let threw = 0;
  try { must1(src(CANON), '锚点根本不在源码里__v2990c', 'self'); } catch (e) { threw++; }
  try { must1(src(CANON) + ANCHORS.PICK_FALLBACK.txt, ANCHORS.PICK_FALLBACK.txt, 'self'); } catch (e) { threw++; }
  a(threw === 2, 'v2990c: [N0] 锚点工具两向自证：不存在 / 不唯一都必须抛（实抛 ' + threw + '/2）');
  // N1 原版干净（每条探针独立实例——它们都会写 store / stat，共享实例会读到前一条的手指印）
  const probes = [['noFakeOutline', probeNoFakeOutline], ['badCoord', probeBadCoord],
    ['outOfRange', probeOutOfRange], ['pointCut', probePointCut], ['actCut', probeActCut],
    ['pickFallback', probePickFallback], ['adoptShape', probeAdoptShape], ['buildThrow', probeBuildThrow],
    ['adoptThrow', probeAdoptThrow], ['clearThrow', probeClearThrow], ['clearGuard', probeClearGuard],
    ['titleTrim', probeTitleTrim], ['exactKey', probeExactKey], ['diagPureRead', probeDiagPureRead]];
  const n1 = probes.map(function (p) { return { name: p[0], ok: p[1](env().WA) }; });
  const bad = n1.filter(function (x) { return !x.ok; }).map(function (x) { return x.name; });
  a(bad.length === 0, 'v2990c: [N1] 原版上十四条判据全部干净（不干净的是 ' + (bad.join(',') || '无') + '）');
  // N2–N15 逐锚
  let step = 1;
  Object.keys(ANCHORS).forEach(function (key) {
    step++;
    const fn = probes.filter(function (p) { return p[0] === CAMP[key]; })[0];
    if (!fn) throw new Error('no probe bound to anchor :: ' + key);
    const b = breakOne(key);
    const Hn = env({ [b.rel]: b.src });
    const ok = fn[1](Hn.WA);
    a(ok === false, 'v2990c: [N' + step + '] 拆掉「' + key + '」后判据现形');
    a(!!Hn.WA.canon && typeof Hn.WA.canon.buildOutline === 'function' && !!Hn.WA.toolDiag,
      'v2990c: [N' + step + '] 破坏副本仍正常装载（不是「装不起来」，是**判据真敏感**）');
  });
  // N16 判据纯度
  const self = src('tests/canon-v2990.js');
  const ok9 = Object.keys(ANCHORS).every(function (k) {
    return hits(self, ANCHORS[k].txt.replace(/\n/g, '\\n')) === 1;
  });
  a(ok9, 'v2990c: [N16] 每条锚点字面量在本文件只出现一次（判据不得引用锚点串）');
}
// 锚点 → 探针的绑定（逐锚负控制要跑**同款**判据，绑定关系显式写出来）
const CAMP = {
  NO_FAKE_OUTLINE: 'noFakeOutline', BAD_COORD_REJECT: 'badCoord',
  OUT_OF_RANGE_NO_CLAMP: 'outOfRange', POINT_CUT_REPORT: 'pointCut', ACT_CUT_REPORT: 'actCut',
  PICK_FALLBACK: 'pickFallback', ADOPT_SHAPE_GUARD: 'adoptShape', BUILD_THROW_ATTR: 'buildThrow',
  ADOPT_THROW_ATTR: 'adoptThrow', CLEAR_THROW_ATTR: 'clearThrow', CLEAR_GUARD: 'clearGuard',
  TITLE_TRIM: 'titleTrim', EXACT_KEY_REMOVED: 'exactKey', DIAG_PURE: 'diagPureRead'
};
if (require.main === module) {
  const a2 = function (cond, name) {
    if (cond) { PASS++; }
    else { FAIL++; console.log('  ✗ ' + name); }
  };
  try { runAll(a2); runNegative(a2); }
  catch (e) { FAIL++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (FAIL) { console.log('CANON-V2990: FAIL ' + FAIL + ' / ' + (PASS + FAIL)); process.exit(1); }
  console.log('CANON-V2990: pass（' + PASS + ' 项）');
}
module.exports = { runAll: runAll, runNegative: runNegative, ANCHORS: ANCHORS };

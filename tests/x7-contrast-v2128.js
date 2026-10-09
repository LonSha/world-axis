#!/usr/bin/env node
// WorldAxis tests/x7-theme-contrast-v2128.js —— v2.128.0（拓展计划 X7）：题材生成差异对照
//
// 【它治的病】
//   B7 只做到「模块进没进注入面」，答不出**「换了题材，注入面到底哪里不一样」**。
//   用户勾掉一个题材后能看到的只有总字数变了 —— 两个题材要是装出逐字一样的注入面，
//   那题材就是摆设，而这种「摆设」在**没有对照实验时是看不出来的**。
//
// 【本版落点（已实现，本锁钉住它）】
//   · `theme.contrast(a, b)` —— 对**同一世界快照**在两种题材下做**模块级**结构 diff
//     （增删模块 / 字数差 / 共有部分），纯计算：不落设置、不改题材、不碰存档。
//     空题材侧取**全量 ORDER**（与 `preview` 的基线口径逐字一致 —— 用错基线的差异预览会撒谎）。
//   · `render.themeContrast(a, b)` —— 把模块级 diff **投影到源级**（「题材 A 注入了 X 源而 B 没有」），
//     并**如实报覆盖**（`coverage.unmapped` 列出没有模块归属的源，不硬归）。
//   · 两个读者：面板「预览」显示对照、诊断节真读 `render.themeContrast`。
//
// 【判据结构（与 x1–x6 同规格）】A 结构 · B 运行时 · C 消费方 · N1–N4 真源码破坏 + N5 纯度
'use strict';
const fs = require('fs');
const path = require('path');
const gate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const THEME = 'engines/theme.js', INJ = 'render/inject.js', PANEL = 'ui/panel.js', DIAG = 'engines/tool-diag.js';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function fresh(ov) { return (ov ? gate.fresh({ srcOverride: ov }) : gate.fresh()).WA; }
function over(rel, s) { const o = {}; o[rel] = s; return o; }
function breakOnce(s, from, to, label) {
  const out = s.split(from).join(to);
  if (out === s) throw new Error('破坏未生效（锚点没打中）:: ' + label);
  return out;
}
const ANCHORS = {
  // 空题材侧 = 全量 ORDER（与 preview 同基线；用 compose([]) 那四个核模块就是撒谎的对照）
  baseline: { rel: THEME, txt: "    const setOf = function (names) { return names.length ? compose(names).modules : order.slice(); };" },
  // 未知题材拒收（不猜、不当空）
  unknownTheme: { rel: THEME, txt: "    const bad = A.concat(B).filter(function (n) { return !known(n); });" },
  // 反判据的读数形态：两侧一致 ⇒ identical:true
  identicalMark: { rel: THEME, txt: "    const identical = added.length === 0 && removed.length === 0;" },
  // 方向：added = 只在 B 出现的（A→B 的迁移方向）
  direction: { rel: THEME, txt: "    const added = sb.filter(function (k) { return sa.indexOf(k) < 0; });" },
  // 源级投影：模块级与源级**两侧都一致**才记 identical
  sourceProjection: { rel: INJ, txt: "      const identical = c.identical === true && addedSources.length === 0 && removedSources.length === 0;" },
  // 覆盖诚实：没模块归属的源如实列出
  coverage: { rel: INJ, txt: "        coverage: { sources: SOURCES.length, mapped: SOURCES.length - unmapped.length, unmapped: unmapped.slice() }," },
  // 读者①：面板「预览」显示对照
  panelReader: { rel: PANEL, txt: "WA.render.themeContrast(cur, picked)" },
  // 读者②：诊断节真读
  diagReader: { rel: DIAG, txt: "      const r = WA.render.themeContrast([], cur);" }
};
function env() {
  const WA = fresh();
  // theme 的写入口只有 `apply`（导出面不含 setSettings）—— 空数组 = 未启用题材 = 全量基线。
  WA.theme.apply([]);
  return WA;
}
// ── A 面 ────────────────────────────────────────────────────────────
function runA(a) {
  Object.keys(ANCHORS).forEach(function (k) {
    const n = hits(src(ANCHORS[k].rel), ANCHORS[k].txt);
    a(n === 1, 'v2128/x7: [A] 锚点 ' + k + ' 在 ' + ANCHORS[k].rel + ' 里恰 1 次（实 ' + n + '）');
  });
  const s = src(THEME);
  a(s.indexOf('  function contrast(a, b) {') > 0, 'v2128/x7: [A] `contrast` 在位');
  //   真源码是单行对象字面量（无 4 空格缩进），裸串匹配即可。
  a(s.indexOf('contrast: contrast,') > 0, 'v2128/x7: [A] `contrast` 登记在导出面');
  // 纯计算：contrast 体内零落盘、零改题材
  const body = s.slice(s.indexOf('  function contrast(a, b) {'), s.indexOf('  function statView() {'));
  ['store.transact', 'WA.store.save', 'saveSettings(', 'theme = '].forEach(function (bad) {
    a(body.indexOf(bad) < 0, 'v2128/x7: [A] `contrast` 体内零 `' + bad + '`（只做结构 diff，不改世界）');
  });
  a(body.indexOf('contrastOnly: true') > 0,
    'v2128/x7: [A] 返回体明写 `contrastOnly`（本口只做对照，不评判生成内容质量）');
}
// ── B 面 ────────────────────────────────────────────────────────────
function runB(a) {
  const W = env();
  // B0 前置：先把题材摆成确定值（空 = 全量基线），后面的「不落盘 / 不改题材」才有参照
  a(JSON.stringify(W.theme.statView().themes) === '[]',
    'v2128/x7: [B0]（前置）题材已清空（全量基线现场；实 '
    + JSON.stringify(W.theme.statView().themes) + '）');
  // B1 空题材侧 = 全量基线（与 preview 同口径）
  const c1 = W.theme.contrast([], ['urban']);
  const pv = W.theme.preview(['urban']);
  a(c1.ok === true && c1.a.all === true && c1.a.count === c1.a.modules.length
    && c1.a.count === (W.rules.ORDER || []).length,
    'v2128/x7: [B1] 空题材侧取**全量 ORDER**（实 ' + JSON.stringify([c1.a.count, (W.rules.ORDER || []).length]) + '）');
  a(pv.moduleCount === c1.b.count,
    'v2128/x7: [B1] 与 `preview` 同基线（两处的模块数必须一致；实 ' + JSON.stringify([pv.moduleCount, c1.b.count]) + '）');
  // B2 正判据：能列出「A 注入了 X 而 B 没有」
  a(c1.ok === true && c1.identical === false && (c1.added.length + c1.removed.length) > 0,
    'v2128/x7: [B2] 两题材不同 ⇒ 列出增删模块（实 ' + JSON.stringify([c1.added, c1.removed]) + '）');
  // B3 反判据的读数形态：两侧一样 ⇒ identical:true（而不是含糊地「有差异」）
  const c3 = W.theme.contrast(['urban'], ['urban']);
  a(c3.ok === true && c3.identical === true && c3.added.length === 0 && c3.removed.length === 0,
    'v2128/x7: [B3] 两侧一样 ⇒ `identical:true` 且增删为空（实 ' + JSON.stringify(c3.identical) + '）');
  a(typeof c3.note === 'string' && c3.note.indexOf('完全一致') > 0,
    'v2128/x7: [B3] 一致时把原因写明白（「红」要有据可查，不是只有一句「一样」）');
  // B4 方向：added 是「只在 B 出现的」，不是「只在 A 出现的」
  const c4 = W.theme.contrast(['urban'], []);
  a(c4.a.count < c4.b.count,
    'v2128/x7: [B4] `a` 是 urban（部分）、`b` 是全量（实 ' + JSON.stringify([c4.a.count, c4.b.count]) + '）');
  const back = W.theme.contrast([], ['urban']);
  a(back.added.length === c4.removed.length && back.removed.length === c4.added.length,
    'v2128/x7: [B4] A/B 换位 ⇒ 增删互换（方向指的是「A→B 的迁移方向」；实 '
    + JSON.stringify([back.added.length, c4.removed.length]) + '）');
  // B5 未知题材拒收且列出合法表（不猜、不当空）
  const c5 = W.theme.contrast(['nope'], ['urban']);
  a(c5.ok === false && c5.reason === 'unknown-theme' && Array.isArray(c5.known) && c5.known.indexOf('urban') >= 0,
    'v2128/x7: [B5] 未知题材 ⇒ `unknown-theme` 且带出合法表（实 ' + JSON.stringify(c5.reason) + '）');
  // B6 纯计算：读数两次逐字相同、存档逐字未变、题材未被动
  const sig = JSON.stringify(W.store.get());
  const t0 = JSON.stringify(W.theme.statView().themes);
  const r1 = W.theme.contrast([], ['urban']), r2 = W.theme.contrast([], ['urban']);
  a(JSON.stringify(r1) === JSON.stringify(r2), 'v2128/x7: [B6] 同输入两次读数逐字相同');
  a(JSON.stringify(W.store.get()) === sig && JSON.stringify(W.theme.statView().themes) === t0,
    'v2128/x7: [B6] `contrast` 不落盘、不改题材（纯对照）');
  // B7 只对结构答话：不返回正文字段
  a(c1.a.chars > 0 && typeof c1.deltaChars === 'number' && c1.a.modules.length > 0,
    'v2128/x7: [B7] 报的是结构（模块 / 字数 / 增删），不是正文措辞');
  // B8 statView 记了对照次数（可核对：真的算过几次）
  const W8 = env();
  W8.theme.contrast([], ['urban']);
  a(W8.theme.statView().contrasts >= 1,
    'v2128/x7: [B8] `statView` 记下对照次数（实 ' + W8.theme.statView().contrasts + '）');
}
// ── C 面：源级投影与真读者 ──────────────────────────────────────────
function runC(a) {
  const W = env();
  // C1 对照读数**不谎报**：模块级有差异时，源级增删为空必须明说差异在模块层。
  //   （原断言写的是「增删源非空」—— 那是假判据：被题材增删的模块走非模块级注入源，
  //    源级增删对任何内置题材对都恒空；那条断言证伪的是实现根本做不到的事。）
  const rc = W.render.themeContrast(['campus'], ['mystery']);
  a(rc && rc.ok === true && rc.identical === false && rc.addedModules.length > 0,
    'v2128/x7: [C1] 模块级 diff 报得出来（实 ' + JSON.stringify([rc && rc.identical, rc && rc.addedModules]) + '）');
  a(rc.a.sources.length > 0 && rc.b.sources.length > 0 && rc.a.sourceCount === rc.a.sources.length,
    'v2128/x7: [C1] 两侧都带源清单（实 ' + JSON.stringify([rc.a.sourceCount, rc.b.sourceCount]) + '）');
  a(typeof rc.readout === 'string' && rc.readout.indexOf('模块层') > 0,
    'v2128/x7: [C1] 源级增删为空时读数明说「差异在模块层」（不写成「新增源 无」；实 '
    + JSON.stringify(rc.readout) + '）');
  const rc2 = W.render.themeContrast([], ['urban']);
  a(typeof rc2.readout === 'string' && rc2.readout.length > 0,
    'v2128/x7: [C1b] 空侧对照也有读数（实 ' + JSON.stringify(rc2.readout) + '）');
  // C2 覆盖诚实：没模块归属的源如实列出，不硬归
  a(rc.coverage && typeof rc.coverage.mapped === 'number' && Array.isArray(rc.coverage.unmapped)
    && rc.coverage.mapped + rc.coverage.unmapped.length === rc.coverage.sources,
    'v2128/x7: [C2] `coverage` 账目自洽（mapped + unmapped = sources；实 ' + JSON.stringify(rc.coverage) + '）');
  // C3 两侧一致时源级也报一致（两层的 identical 不互相打脸）
  const same = W.render.themeContrast(['urban'], ['urban']);
  a(same.ok === true && same.identical === true,
    'v2128/x7: [C3] 模块级一致 ⇒ 源级也一致（实 ' + JSON.stringify(same.identical) + '）');
  // C4 题材面缺席 ⇒ 如实降级（不假装）
  const W4 = env();
  const keep = W4.theme;
  W4.theme = undefined;
  const ab = (function () { try { return W4.render.themeContrast([], ['urban']); } catch (e) { return { ok: false, reason: 'threw' }; } })();
  W4.theme = keep;
  a(ab && ab.ok === false && ab.reason === 'theme-absent',
    'v2128/x7: [C4] 题材面缺席 ⇒ `theme-absent`（如实降级；实 ' + JSON.stringify(ab && ab.reason) + '）');
  // C5 真读者在场（面板 + 诊断）
  const pn = src(PANEL), dg = src(DIAG);
  a(pn.indexOf(ANCHORS.panelReader.txt) > 0,
    'v2128/x7: [C5] 面板「预览」真读对照（读了不显示 = 读者缺一半）');
  a(pn.indexOf('注入面对照') > 0, 'v2128/x7: [C5] 对照读数落在既有输出节点上');
  a(pn.indexOf('c.readout') > 0,
    'v2128/x7: [C5] 面板取**引擎给的读数**而不是自拼（自拼会在源级空增删时写成「新增源 无」）');
  a(dg.indexOf('WA.render.themeContrast([], cur)') > 0,
    'v2128/x7: [C5] 诊断节真读（「题材到底影响不影响注入面」必须在诊断面可答）');
  const th = src(THEME);
  a(th.indexOf('contrast: contrast,') > 0,
    'v2128/x7: [C5] `contrast` 有导出面登记（没登记 = 上面两处读者调不到）');
}
// ── N 面 ────────────────────────────────────────────────────────────
function runNegative(a) {
  const T0 = src(THEME), I0 = src(INJ);
  const q = function (WA, x, y) { try { return WA.theme.contrast(x, y); } catch (e) { return { ok: false, reason: 'threw' }; } };
  const qr = function (WA, x, y) { try { return WA.render.themeContrast(x, y); } catch (e) { return { ok: false, reason: 'threw' }; } };
  // N1 基线被拆（空侧改成 compose([]) 的核模块）⇒ 差异预览撒谎
  const n1 = breakOnce(T0, ANCHORS.baseline.txt, '    const setOf = function (names) { return compose(names.length ? names : []).modules; };', 'N1');
  const b1 = q(fresh(over(THEME, n1)), [], ['urban']);
  const o1 = q(fresh(), [], ['urban']);
  a(b1.a && b1.a.count !== o1.a.count && o1.a.count === (fresh().rules.ORDER || []).length,
    'v2128/x7: [N1] 拆掉全量基线 ⇒ 空侧的差异预览撒谎（B1 不是恒真；破坏后实 '
    + JSON.stringify(b1.a && b1.a.count) + ' vs 原版 ' + o1.a.count + '）');
  // N2 未知题材闸被拆 ⇒ 自造题材混进对照（静默当空）
  const n2 = breakOnce(T0, ANCHORS.unknownTheme.txt, '    const bad = [];', 'N2');
  a(q(fresh(over(THEME, n2)), ['nope'], ['urban']).reason !== 'unknown-theme'
    && q(fresh(), ['nope'], ['urban']).reason === 'unknown-theme',
    'v2128/x7: [N2] 拆掉题材闸 ⇒ 自造题材混进对照（B5 不是恒真；破坏后实 '
    + JSON.stringify(q(fresh(over(THEME, n2)), ['nope'], ['urban']).reason) + '）');
  // N3 方向被拆（added 取反）⇒ 「谁多了谁少了」反过来
  const n3 = breakOnce(T0, ANCHORS.direction.txt, '    const added = sa.filter(function (k) { return sb.indexOf(k) < 0; });', 'N3');
  const f3 = q(fresh(over(THEME, n3)), [], ['urban']);
  const o3 = q(fresh(), [], ['urban']);
  a(JSON.stringify(f3.added) !== JSON.stringify(o3.added),
    'v2128/x7: [N3] 拆掉方向 ⇒ 增删反过来（B4 不是恒真；破坏后实 '
    + JSON.stringify(f3.added.slice(0, 3)) + '）');
  // N4 源级投影被拆 ⇒ 面板与诊断读到的对照失真
  //   破坏形态要选**可观测**的：把 identical 拆成「跟着模块级走」在原版题材对下不改变读数
  //   （源级增删本来就恒空）⇒ 会静默哑火。直接钉成 true，才是「模块有差异却报一致」。
  const n4 = breakOnce(I0, ANCHORS.sourceProjection.txt, '      const identical = true;', 'N4');
  const W4 = fresh(over(INJ, n4));
  W4.theme.apply([]);
  a(qr(W4, [], ['urban']).identical === true && qr(fresh(), [], ['urban']).identical === false,
    'v2128/x7: [N4] 拆掉源级投影 ⇒ 模块级有差异也报「两侧一致」（C1 不是恒真；破坏后实 '
    + JSON.stringify(qr(W4, [], ['urban']).identical) + '，原版 '
    + JSON.stringify(qr(fresh(), [], ['urban']).identical) + '）');
  // N5 纯度
  a(src(THEME) === T0 && src(INJ) === I0,
    'v2128/x7: [N5]（纯度）全部负控制跑完后两个真文件逐字未变');
}
const restoring = require('./lock-assert.js').restoring;
module.exports = {
  ANCHORS: ANCHORS,
  runA: restoring(runA), runB: restoring(runB), runC: restoring(runC),
  runNegative: restoring(runNegative),
  runAll: restoring(function (a) { runA(a); runB(a); runC(a); }),
  REL: THEME
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { runA(a); runB(a); runC(a); } catch (e) { fail++; console.log('  x A/B/C threw: ' + (e && e.stack)); }
  try { runNegative(a); } catch (e) { fail++; console.log('  x neg threw: ' + (e && e.stack)); }
  if (fail) { console.log('X7-THEME-CONTRAST-V2128: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('X7-THEME-CONTRAST-V2128: pass（' + pass + ' 项）');
}
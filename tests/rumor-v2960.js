#!/usr/bin/env node
// WorldAxis tests/rumor-v2960.js —— v2.96.0（X3 传播与辟谣：四层分层 · 传播链 · 隐瞒 · 辟谣）
//
// 【它治的病：世界只有「谁知道」一个答案】
//   intel.js 回答「张三知道这件事」（带来源的人物认知条目）；opinion.js 回答「公众在传什么」；
//   两者都答不出这一句——**「传到最后还是不是原来那条」**。
//   于是下面两句话在世界状态里长得一模一样：
//       「张三听说了那件事」      （一句转述，值没变）
//       「张三听说的是另一件事」  （一句转述，值被改了）
//   而比「无法表达」更坏的是**合并**：把「谁知道」与「谁知道的是不是真的」压成一个字段，
//   就再也答不出「谁被误导了、谁在骗人、辟过谣没有」。本锁定的是这一分。
//
// 【口径（全是否定式——这八条正是模块存在的全部理由）】
//   ① 事实不得被本模块改写：事实唯一写者是 memory.upsertFact，本模块只记「谁把哪个值传给了谁」。
//   ② 层不得升格：传播只许从更真走向更不真；低置信不得被写成既成事实。
//   ③ 篡改不许落进事实层与目击层：否则「我听说」会被记成「我看见」。
//   ④ 未声明的改写一律拒收：如实转述却改了口径，是账面上最危险的一种错——
//      `intact` 仍是 true，而值已经不一样了。
//   ⑤ 置信度不内联第二套数：由 intel.CONFIDENCE 经 LAYER_LEVEL 反查；intel 缺席报 engine-absent。
//   ⑥ 玩家面不剧透：buildBlock 只出 fact / witness；转述与流言只进 fullView（全知诊断）。
//   ⑦ 观测不得改变被观测对象：investigate / chains / visibleTo 是纯读，不落盘、不动 stat。
//   ⑧ `intact` 一旦被改写就再也回不来（累积不可恢复）：后来改回原样也不能宣称「没被改过」。
//
// 判据：
//   A 静态面：六常量 + 单源映射 + 十五口在导出对象里 + 三处登记（store / evict / index）
//            + 诊断 secRumor + 面板控件与绑定与守卫登记 + 注入源表与显示名与分支。
//   B 运行时面（真装载真调用）：
//     B1 起链：未登记事实报 unknown-fact、不凭空造一条；已登记 ⇒ id=rm_key、层=fact、conf=intel 反查值
//     B2 逐层下走：如实转述 fact→witness→hearsay→rumor，值不变、intact 恒 true
//     B3 升格拒收：指定更高层 ⇒ layer-ascend
//     B4 篡改不许落公开层：distort + witness ⇒ tamper-layer
//     B5 未声明改写：如实却递了别的值 ⇒ undeclared-rewrite
//     B6 声明改写：distort + hearsay ⇒ 改值、intact=false、investigate 报 drift from→to
//     B7 累积不可恢复：把值改回原样，intact **仍是 false**
//     B8 满员拒收不挤出：hop 满了报 hops-full，且链的跳数没被悄悄改写
//     B9 隐瞒不进跳：conceal 只进 suppressed；满报 suppressed-full
//     B10 辟谣不改事实：refute 强制沿用上一跳的值，层不升格
//     B11 调查纯读：连读三次，存档与 stat 字节级不变
//     B12 玩家面只出公开层 / B13 全知视图四层全出 + byLayer + B14 链停在事实层且无人经手不进正文
//     B15 某人可见只出公开层 / B16 诊断读数与 stat 同源且观测纯读
//     B17 面板真消费：起链（含 id 回填）→ 转述 → 调查 三段读数落在输出节点上
//     B18 总开关默认关闭：关闭时起链不落盘
//     B19 置信度单一真源：改 intel.CONFIDENCE ⇒ conf 跟着变（证无第二套数）
//     B20 intel 缺席 ⇒ engine-absent（不回落成自造数字）
//     B21 环形挤出：maxChains 调到超出登记 cap ⇒ 链数被裁到 cap（evict 站点真接线）
//   C 不变式：事实副本（worldFacts + memory.facts）经整轮传播后**字节级不变**；
//             rumor.js 全库零 upsertFact 调用；导出面恰 15 口。
//   N0–N4 负控制：**真源码破坏 ⇒ 加载破坏副本 ⇒ 在副本上重跑同款真判据**（不是只验文本被改过）。
'use strict';
const fs = require('fs');
const path = require('path');
const { fresh } = require('./ui-gate-sync.js');
const ROOT = path.resolve(__dirname, '..');
const RUMOR = 'engines/rumor.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js';
const INJECT = 'render/inject.js', STORE = 'core/store.js', EVICT = 'core/evict.js', INDEX = 'index.js';
let PASS = 0, FAIL = 0;
const a = (ok, msg) => { if (ok) PASS++; else { FAIL++; console.log('  ✗ ' + msg); } };
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function must1(s, x, tag) { const n = hits(s, x); if (n !== 1) throw new Error('anchor hits != 1 (' + n + ') :: ' + tag); return n; }
// ══════════════ 真源码破坏锚点（各自**只在本文件声明一次**）══════════════
const ANCHORS = {
  // 口径② 层不得升格
  ASCEND_GUARD: { rel: RUMOR, txt: "if (LAYER_ORDER[want] < LAYER_ORDER[cur]) return { bad: 'layer-ascend', from: cur, to: want };" },
  // 口径③ 篡改不许落公开层
  TAMPER_LAYER: { rel: RUMOR, txt: "if (rewrites && PUBLIC_LAYERS.indexOf(target) >= 0) return { bad: 'tamper-layer', layer: target, motive: motive };" },
  // 口径④ 未声明的改写一律拒收
  UNDECLARED_REWRITE: { rel: RUMOR, txt: "if (!rewrites && given !== prevValue) return { bad: 'undeclared-rewrite', motive: motive, expect: prevValue };" },
  // 口径⑧ intact 累积不可恢复
  INTACT_CUMULATIVE: { rel: RUMOR, txt: 'c.intact = !!c.intact && h.intact;' },
  // 口径 B8 满员拒收不挤出（中间跳丢了结论就再也算不出来）
  HOPS_NO_EVICT: { rel: RUMOR, txt: "if (c.hops.length >= cap) { out = { ok: false, reason: 'hops-full', id: k, cap: cap }; return false; }" },
  // 口径⑤ 置信度不内联第二套数（intel 缺席即拒收）
  CONF_NO_FALLBACK: { rel: RUMOR, txt: "if (conf === null) return { bad: 'engine-absent', engine: 'intel', level: LAYER_LEVEL[target] };" },
  // 口径⑥ 玩家面只出公开层
  PUBLIC_ONLY_BLOCK: { rel: RUMOR, txt: 'if (!c || PUBLIC_LAYERS.indexOf(c.layer) < 0) return false;' },
  // 口径 B1 未登记事实不凭空造一条
  FACT_NO_FABRICATE: { rel: RUMOR, txt: "if (!f) { noteFault('unknown-fact'); return { ok: false, reason: 'unknown-fact', key: k }; }" },
  // 口径 B9 隐瞒不是一次传播（不进 hops）
  CONCEAL_NOT_HOP: { rel: RUMOR, txt: "c.suppressed.push({ at: clockNow('rumor'), by: by, layer: LAYERS.indexOf(c.layer) >= 0 ? c.layer : 'rumor', why: why });" },
  // 口径 B10 辟谣不改事实（值强制沿用上一跳）
  REFUTE_NO_REWRITE: { rel: RUMOR, txt: "return doHop(id, Object.assign({}, item || {}, { value: null }), 'refute');" }
};
// ══════════════ 破坏形态（每条对应一个可观测行为变化）══════════════
const BREAK = {
  ASCEND_GUARD: 'void 0;',
  TAMPER_LAYER: 'void 0;',
  UNDECLARED_REWRITE: 'void 0;',
  INTACT_CUMULATIVE: 'c.intact = !!h.intact;',
  HOPS_NO_EVICT: "if (false) { out = { ok: false, reason: 'hops-full', id: k, cap: cap }; return false; }",
  CONF_NO_FALLBACK: "if (false) return { bad: 'engine-absent', engine: 'intel', level: LAYER_LEVEL[target] };",
  PUBLIC_ONLY_BLOCK: 'if (!c) return false;',
  FACT_NO_FABRICATE: "if (false) { noteFault('unknown-fact'); return { ok: false, reason: 'unknown-fact', key: k }; }",
  CONCEAL_NOT_HOP: "c.hops.push({ at: clockNow('rumor'), from: by, to: '', fromLayer: c.layer, layer: c.layer, motive: 'conceal', value: '', conf: 0, intact: true, why: why });",
  REFUTE_NO_REWRITE: "return doHop(id, (item || {}), 'refute');"
};
/** 真源码破坏：锚点恰中 1 次才动手，返回 {rel, src} */
function breakOne(key) {
  const A = ANCHORS[key];
  const s = src(A.rel);
  must1(s, A.txt, key);
  const bad = s.replace(A.txt, BREAK[key]);
  if (bad === s) throw new Error('break no-op :: ' + key);
  return { rel: A.rel, src: bad };
}
// ══════════════ 运行时装置 ══════════════
const FACT_KEY = '甲镇有人失踪', FACT_VAL = '三日未归';
const FACT2 = '茶楼失火', FACT2_VAL = '烧了半间';
/** 夹具必须把世界复位到**已知票面**（fresh 复用宿主 localStorage，上一用例的存档会带着出场）。 */
function seed(WA) {
  WA.store.init();
  WA.store.transact(function (d) {
    d.worldFacts = [{ id: 'wf_1', key: FACT_KEY, value: FACT_VAL, scope: 'world', source: 'engine', at: 0 }];
    d.memory = (d.memory && typeof d.memory === 'object') ? d.memory : {};
    d.memory.facts = [];
    d.rumor = { chains: [] };
  }, 'v2960:seed');
  WA.rumor.setSettings({ enabled: true, maxChains: 8, maxHops: 6, maxSuppressed: 4 });
  return WA;
}
function env(over) {
  const H = fresh(over ? { srcOverride: over } : undefined);
  seed(H.WA);
  return H.WA;
}
const RID = 'rm_' + FACT_KEY;
/** 起一条链（多数探针的公共前缀）。 */
function chain(W, key) {
  return W.rumor.startChain(key || FACT_KEY, '测试');
}
// ══════════════ 同款真判据（原版与破坏副本上跑的是同一批函数）══════════════
/** B3：层不得升格 —— 到了 witness 之后不许再指名 fact。 */
function probeAscend(W) {
  try {
    chain(W);
    const up = W.rumor.relay(RID, { from: '甲', to: '乙', layer: 'witness' });
    if (!up.ok) return false;
    const back = W.rumor.relay(RID, { from: '乙', to: '丙', layer: 'fact' });
    return back.ok === false && back.reason === 'layer-ascend' && back.from === 'witness' && back.to === 'fact';
  } catch (e) { return false; }
}
/** B4：篡改不许落公开层 —— distort 落在 witness 必须拒收。 */
function probeTamperLayer(W) {
  try {
    chain(W);
    const r = W.rumor.relay(RID, { from: '甲', to: '乙', layer: 'witness', motive: 'distort', value: '被人绑走了' });
    return r.ok === false && r.reason === 'tamper-layer' && r.layer === 'witness';
  } catch (e) { return false; }
}
/** B5：未声明的改写一律拒收 —— 如实转述却递了别的值。 */
function probeUndeclaredRewrite(W) {
  try {
    chain(W);
    const r = W.rumor.relay(RID, { from: '甲', to: '乙', motive: 'honest', value: '其实是他自己走了' });
    return r.ok === false && r.reason === 'undeclared-rewrite' && r.expect === FACT_VAL;
  } catch (e) { return false; }
}
/** B7：intact 累积不可恢复 —— 改过之后再改回原样，`未被改写` 这个结论回不来。 */
function probeIntactCumulative(W) {
  try {
    chain(W);
    if (!W.rumor.relay(RID, { from: '甲', to: '乙', layer: 'witness' }).ok) return false;
    const bad = W.rumor.relay(RID, { from: '乙', to: '丙', layer: 'hearsay', motive: 'distort', value: '被人绑走了' });
    if (!bad.ok || bad.intact !== false) return false;
    const back = W.rumor.relay(RID, { from: '丙', to: '丁', layer: 'rumor', motive: 'distort', value: FACT_VAL });
    if (!back.ok) return false;
    const iv = W.rumor.investigate(RID);
    return back.value === FACT_VAL && back.intact === false && iv.tampered === true && iv.intact === false;
  } catch (e) { return false; }
}
/** B8：满员拒收不挤出 —— 中间跳被丢掉，「传到最后还是不是原来那条」就再也算不出来。 */
function probeHopsNoEvict(W) {
  try {
    W.rumor.setSettings({ maxHops: 1 });
    chain(W);
    const h1 = W.rumor.relay(RID, { from: '甲', to: '乙' });
    const h2 = W.rumor.relay(RID, { from: '乙', to: '丙' });
    const iv = W.rumor.investigate(RID);
    return h1.ok === true && h2.ok === false && h2.reason === 'hops-full' && h2.cap === 1 && iv.hopCount === 1;
  } catch (e) { return false; }
}
/** B20：intel 缺席 ⇒ engine-absent（不回落成一个自造的数字）。 */
function probeConfNoFallback(W) {
  try {
    chain(W);
    const keep = W.intel.CONFIDENCE;
    W.intel.CONFIDENCE = undefined;
    const r = W.rumor.relay(RID, { from: '甲', to: '乙', layer: 'witness' });
    W.intel.CONFIDENCE = keep;
    return r.ok === false && r.reason === 'engine-absent' && r.engine === 'intel' && r.level === 'witness';
  } catch (e) { return false; }
}
/** B14：玩家面只出公开层 —— 链的**当前层**不在公开层时整条不进正文（那是「听说的」）。 */
function probePublicOnlyBlock(W) {
  try {
    W.store.transact(function (d) {
      d.worldFacts = (d.worldFacts || []).concat([{ id: 'wf_2', key: FACT2, value: FACT2_VAL, scope: 'world', at: 0 }]);
    }, 'v2960:fact2');
    // 链一：亲历一跳 + 转述一跳 ⇒ 当前层=hearsay（不在公开层），但 hops 里**有**公开层的跳。
    //   这样「按当前层滤」与「按跳滤」两种实现才会给出不同答案——锚点判的正是前者。
    chain(W, FACT_KEY);
    if (!W.rumor.relay(RID, { from: '甲', to: '乙', layer: 'witness' }).ok) return false;
    if (!W.rumor.relay(RID, { from: '乙', to: '丙', layer: 'hearsay' }).ok) return false;
    // 链二：停在目击层。
    if (!W.rumor.startChain(FACT2, '测试').ok) return false;
    if (!W.rumor.relay('rm_' + FACT2, { from: '甲', to: '乙', layer: 'witness' }).ok) return false;
    const bb = W.rumor.buildBlock();
    return bb.indexOf(FACT_KEY) < 0 && bb.indexOf(FACT2_VAL) > 0 && bb.indexOf('有人亲历') > 0;
  } catch (e) { return false; }
}
/** B1：未登记事实不凭空造一条（「没发生的事不该有传播链」）。 */
function probeFactNoFabricate(W) {
  try {
    const r = W.rumor.startChain('从没发生过的事', '测试');
    const st = W.store.get();
    const rows = (st.rumor && st.rumor.chains) || [];
    return r.ok === false && r.reason === 'unknown-fact' && rows.length === 0;
  } catch (e) { return false; }
}
/** B9：隐瞒不是一次传播 —— 有人知道但没往外传，故它进 suppressed 而不进 hops。 */
function probeConcealNotHop(W) {
  try {
    chain(W);
    const c = W.rumor.conceal(RID, { by: '甲', why: '不想让家里知道' });
    const iv = W.rumor.investigate(RID);
    return c.ok === true && c.suppressed === 1 && iv.hopCount === 0 && iv.suppressed === 1;
  } catch (e) { return false; }
}
/** B10：辟谣不改事实、不升格 —— 值强制沿用上一跳（「这件事没发生过」与「我不再当它是一回事」是两件事）。 */
function probeRefuteNoRewrite(W) {
  try {
    chain(W);
    if (!W.rumor.relay(RID, { from: '甲', to: '乙', layer: 'witness' }).ok) return false;
    if (!W.rumor.relay(RID, { from: '乙', to: '丙', layer: 'hearsay' }).ok) return false;
    const r = W.rumor.refute(RID, { from: '丙', to: '丁', layer: 'hearsay', value: '完全是造谣' });
    const iv = W.rumor.investigate(RID);
    return r.ok === true && r.value === FACT_VAL && r.layer === 'hearsay'
      && iv.hopCount === 3 && iv.factValue === FACT_VAL && iv.tampered === false;
  } catch (e) { return false; }
}
// ══════════════ A / B / C 判据 ══════════════
function runAll(a) {
  const rSrc = src(RUMOR), dSrc = src(DIAG), pSrc = src(PANEL);
  // ── A 静态面 ──
  Object.keys(ANCHORS).forEach(function (k) {
    a(hits(src(ANCHORS[k].rel), ANCHORS[k].txt) === 1, 'v2960: [A1] 锚点在真源码恰中 1 次（' + k + '）');
  });
  a(rSrc.indexOf("  const LAYERS = ['fact', 'witness', 'hearsay', 'rumor'];") > 0
    && rSrc.indexOf('const LAYER_ORDER = { fact: 0, witness: 1, hearsay: 2, rumor: 3 };') > 0,
    'v2960: [A2] 四层与可信度序是单一真源（只许向下走，不许向上走）');
  a(rSrc.indexOf("const LAYER_LEVEL = { fact: 'record', witness: 'witness', hearsay: 'report', rumor: 'rumor' };") > 0
    && hits(rSrc, 'WA.intel && WA.intel.CONFIDENCE') === 1,
    'v2960: [A2] 层 ↔ intel 层级的映射单一真源，且置信度**反查** intel.CONFIDENCE');
  a(!/\bCONF\s*=\s*\{/.test(rSrc) && !/\bCONFIDENCE\s*=\s*\{/.test(rSrc),
    'v2960: [A2] 本模块不内联第二套置信度表（两套数并存是本仓库最贵的一类缺陷）');
  a(rSrc.indexOf("const MOTIVES = ['honest', 'conceal', 'distort', 'refute'];") > 0
    && rSrc.indexOf("const REWRITABLE = ['distort'];") > 0
    && rSrc.indexOf("const PUBLIC_LAYERS = ['fact', 'witness'];") > 0,
    'v2960: [A2] 动机四值 / 唯一可改写动机 / 公开层三者各自单一真源');
  a(!/upsertFact\s*\(/.test(rSrc) && rSrc.indexOf('draft.worldFacts') < 0 && rSrc.indexOf('.facts.push') < 0,
    'v2960: [A2] 事实唯一写者是 memory.upsertFact —— 本模块**零**事实写入点（口径①）');
  // 导出面恰 15 口
  const exp = src(RUMOR).split('WA.rumor = {')[1] || '';
  const names = ['LAYERS', 'MOTIVES', 'PUBLIC_LAYERS', 'LAYER_LEVEL', 'getSettings', 'setSettings', 'startChain',
    'relay', 'refute', 'conceal', 'investigate', 'visibleTo', 'fullView', 'buildBlock', 'stat'];
  const missExp = names.filter(function (n) { return exp.indexOf(n) < 0; });
  const extra = ['factRow', 'nextLayer', 'layerOf', 'confOf', 'hopCalc', 'doHop', 'settings', 'chains', 'find']
    .filter(function (n) { return exp.indexOf(n + ':') >= 0; });
  a(missExp.length === 0 && extra.length === 0,
    'v2960: [A3] 导出面恰 15 口、内部助手一律不导出（缺 ' + (missExp.join('/') || '无')
    + ' / 多 ' + (extra.join('/') || '无') + '）');
  // 三处登记
  a(src(INDEX).indexOf("'engines/rumor.js'") > 0, 'v2960: [A4] index.js 装载序列登记');
  a(src(STORE).indexOf('rumor: { chains: [] }') > 0 && src(STORE).indexOf("'rumor.chains': { cap: 8,") > 0,
    'v2960: [A4] store 骨架声明 + 有界表登记同时在场（写侧幽灵的死敌）');
  a(src(EVICT).indexOf("'rumor.chains':") > 0, 'v2960: [A4] evict SITES 登记（未登记站点不截断）');
  // 诊断真消费
  a(dSrc.indexOf('function secRumor()') > 0 && dSrc.indexOf('rumor: secRumor(),') > 0,
    'v2960: [A5] 诊断 secRumor 定义与接线同时在场（真消费方一）');
  a(dSrc.indexOf('WA.rumor.LAYERS.reduce') > 0,
    'v2960: [A5] 诊断逐层计数取产品面 LAYERS（不抄第二份层表）');
  // 面板真消费
  const ctl = ['wa-rm-enabled', 'wa-rm-fact', 'wa-rm-start', 'wa-rm-investigate', 'wa-rm-fullview',
    'wa-rm-id', 'wa-rm-from', 'wa-rm-to', 'wa-rm-motive', 'wa-rm-value', 'wa-rm-layer',
    'wa-rm-relay', 'wa-rm-refute', 'wa-rm-conceal', 'wa-rm-person', 'wa-rm-why', 'wa-rm-visible', 'wa-rm-out'];
  const missRender = ctl.filter(function (x) { return pSrc.indexOf('id="' + x + '"') < 0; });
  const missBind = ctl.filter(function (x) { return pSrc.indexOf("'#" + x + "'") < 0; });
  a(missRender.length === 0, 'v2960: [A6] 面板渲染全部 18 控件（缺 ' + (missRender.join('/') || '无') + '）');
  a(missBind.length === 0, 'v2960: [A6] 每个控件都有绑定代码（缺 ' + (missBind.join('/') || '无') + '）');
  a(dSrc.indexOf("'wa-rm-enabled', 'wa-rm-fact', 'wa-rm-start'") > 0,
    'v2960: [A6] 守卫表登记（登记错页比不登记更坏——它看起来已被覆盖）');
  a(dSrc.indexOf("'wa-rm-relay', 'wa-rm-refute', 'wa-rm-conceal', 'wa-rm-person', 'wa-rm-why', 'wa-rm-visible',") > 0
    && dSrc.indexOf("'wa-rm-out'],") > 0,
    'v2960: [A6] 守卫表登记覆盖面到最后一个控件（漏一个即静默幽灵绑定）');
  // 注入面三处同批
  a(src(INJECT).indexOf("'rumor'") > 0 && src(INJECT).indexOf('rumor: true') > 0
    && src(INJECT).indexOf("source: '传开的与亲眼见的'") > 0
    && src(INJECT).indexOf("rumor: '传开的与亲眼见的',") > 0,
    'v2960: [A7] 注入源表 / 开关默认 / 注入分支 / 失败台账显示名四处同批登记');
  a(pSrc.indexOf("rumor: '传开的与亲眼见的',") > 0,
    'v2960: [A7] 面板显示名同批（只加源表不加显示名 ⇒ 裸露英文键名）');

  // ── B 运行时面 ──
  const W = env();
  // B18 默认关闭：**读源码常量**（夹具已把开关写进宿主 localStorage，运行期读不到默认值）
  a(rSrc.indexOf('const DEF = { enabled: false,') > 0, 'v2960: [B18] 总开关默认关闭写在 DEF 里（不是「看起来关了」）');
  // 关闭态在**另一个实例**上验；验完必须把 W 开回来——设置落在宿主 localStorage 上、跨实例共享，
  //   一处关掉，后面所有用 W 的块都会读到关闭态（本轮实测：B1/B2/B17 集体返回 disabled）。
  const WD = env();
  WD.rumor.setSettings({ enabled: false });
  const dOff = WD.rumor.startChain(FACT_KEY, '关着试');
  const dSt = WD.store.get();
  a(dOff.ok === true && dOff.reason === 'disabled' && ((dSt.rumor || {}).chains || []).length === 0,
    'v2960: [B18] 关闭时起链不落盘（如实报 disabled，而不是静默成功）');
  W.rumor.setSettings({ enabled: true });
  a(W.rumor.getSettings().enabled === true, 'v2960: [B18] 夹具复位回启用（设置跨实例共享，验完必须复位）');
  // B1 起链
  const c1 = chain(W);
  a(c1.ok === true && c1.id === RID && c1.layer === 'fact' && c1.hops === 0,
    'v2960: [B1] 起链：id 由 factKey 派生（一事实一链）、层为事实层（实 ' + JSON.stringify(c1) + '）');
  a(c1.conf === W.intel.CONFIDENCE.record,
    'v2960: [B1] 事实层置信度 = intel.CONFIDENCE.record（反查，不是内联，实 ' + c1.conf + '）');
  a(chain(W).reason === 'exists', 'v2960: [B1] 同一事实重复起链报 exists（一事实一链）');
  a(W.rumor.startChain('', '空').reason === 'missing-fields', 'v2960: [B1] 空事实名报 missing-fields');
  // B2 逐层下走
  const w1 = W.rumor.relay(RID, { from: '甲', to: '乙' });
  const w2 = W.rumor.relay(RID, { from: '乙', to: '丙' });
  const w3 = W.rumor.relay(RID, { from: '丙', to: '丁' });
  a(w1.ok && w1.fromLayer === 'fact' && w1.layer === 'witness', 'v2960: [B2] 不指定层即自动下一层（fact→witness）');
  a(w2.ok && w2.layer === 'hearsay' && w3.ok && w3.layer === 'rumor',
    'v2960: [B2] 一路走到流言层（witness→hearsay→rumor）');
  a(w1.value === FACT_VAL && w2.value === FACT_VAL && w3.value === FACT_VAL,
    'v2960: [B2] 如实转述值**一字不变**（四层只改置信度与层名，正文不动）');
  a(w3.intact === true && w3.hops === 3 && w3.conf === W.intel.CONFIDENCE.rumor,
    'v2960: [B2] 全程未被改写 ⇒ intact 恒 true，conf 逐层取 intel 反查值');
  a(W.rumor.relay('rm_不存在', { from: '甲', to: '乙' }).reason === 'missing',
    'v2960: [B2] 对不存在的链转述报 missing（不静默建一条）');
  a(W.rumor.relay(RID, { from: '甲', to: '乙', motive: '编个动机' }).reason === 'bad-motive',
    'v2960: [B2] 动机不在四值内报 bad-motive，并列出合法动机');
  a(W.rumor.relay(RID, { from: '', to: '乙' }).reason === 'missing-fields',
    'v2960: [B2] 缺经手人报 missing-fields（跳必须有两个人才叫跳）');
  a(W.rumor.relay(RID, { from: '甲', to: '乙', layer: '真相' }).reason === 'bad-layer',
    'v2960: [B2] 层不在四值内报 bad-layer');
  // B6 声明改写 + B11 纯读 + B12/B13/B15/B16
  const H2 = fresh(); const W2 = seed(H2.WA);
  chain(W2);
  W2.rumor.relay(RID, { from: '甲', to: '乙', layer: 'witness' });
  const tam = W2.rumor.relay(RID, { from: '乙', to: '丙', layer: 'hearsay', motive: 'distort', value: '被人绑走了' });
  a(tam.ok === true && tam.value === '被人绑走了' && tam.intact === false && tam.hopIntact === false,
    'v2960: [B6] 声明改写（distort 落 trans述层）⇒ 值改、intact 变 false（实 ' + JSON.stringify(tam) + '）');
  const iv2 = W2.rumor.investigate(RID);
  a(iv2.ok === true && iv2.tampered === true && iv2.drift && iv2.drift.from === FACT_VAL && iv2.drift.to === '被人绑走了'
    && iv2.factValue === FACT_VAL,
    'v2960: [B6] 调查报 drift from→to，而**事实侧仍是原值**（事实不被改写，口径①）');
  a(iv2.hops.length === 2 && iv2.hops[1].motive === 'distort' && iv2.hops[0].motive === 'honest',
    'v2960: [B6] 逐跳带动机（能答出「是哪一跳被改的」，而不是「这条链脏了」）');
  // B11 纯读
  const snap0 = JSON.stringify(W2.store.get()), st0 = JSON.stringify(W2.rumor.stat());
  W2.rumor.investigate(RID); W2.rumor.investigate(RID); W2.rumor.investigate(RID);
  a(JSON.stringify(W2.store.get()) === snap0 && JSON.stringify(W2.rumor.stat()) === st0,
    'v2960: [B11] 调查是纯读：连读三次存档与 stat 字节级不变（观测不得改变被观测对象）');
  a(W2.rumor.investigate('rm_没有').reason === 'missing' && W2.rumor.investigate('').reason === 'missing-fields',
    'v2960: [B11] 调查四态如实（缺字段 / 不存在 各自点名，不把「没找到」与「没传」混为一谈）');
  // B12/B13 玩家面 / 全知面
  //   B12 用**独立的实例**：链的当前层一旦离开公开层就整条不进正文，
  //   而「被改写」这一跳必然把层推到转述层——所以想验「公开层进正文」必须另起一条干净的链。
  const H12 = fresh(); const W12 = seed(H12.WA);
  chain(W12);
  W12.rumor.relay(RID, { from: '甲', to: '乙', layer: 'witness' });
  const bb = W12.rumor.buildBlock();
  a(bb.indexOf('[传开的与亲眼见的]') === 0 && bb.indexOf(FACT_VAL) > 0 && bb.indexOf(FACT_KEY) >= 0,
    'v2960: [B12] 正文块只出公开层（该链停在目击层 ⇒ 进正文，实 ' + JSON.stringify(bb.slice(0, 40)) + '）');
  a(bb.indexOf('听来的转述与流言不进此处') > 0,
    'v2960: [B12] 块内明写「不得把听说写成看见」（否则模型会把转述写成既成事实）');
  a(bb.indexOf('conf-') < 0 && bb.indexOf('intact') < 0,
    'v2960: [B12] 正文块不带置信度与账目术语（那是给作者看的底牌，不是给角色看的）');
  // 再走一跳转述：当前层离开公开层 ⇒ 整条退出正文，且块里从不出现被改写的值
  W12.rumor.relay(RID, { from: '乙', to: '丙', layer: 'hearsay', motive: 'distort', value: '被人绑走了' });
  const bb2 = W12.rumor.buildBlock();
  a(bb2 === '' && W12.rumor.investigate(RID).tampered === true,
    'v2960: [B12] 链的当前层离开公开层 ⇒ 整条退出正文（被改写那一步自然不落进正文，实 '
    + JSON.stringify(bb2.slice(0, 40)) + '）');
  const fv = W12.rumor.fullView();
  a(fv.ok === true && fv.chains.length === 1 && fv.chains[0].hopCount === 2 && fv.chains[0].intact === false,
    'v2960: [B13] 全知视图四层全出（含已被改写者）');
  a(typeof fv.chains[0].byLayer === 'object' && Object.keys(fv.chains[0].byLayer).length === W12.rumor.LAYERS.length,
    'v2960: [B13] 逐层计数按 LAYERS 全覆盖（合起来数就看不出「烂到哪一层」）');
  a(fv.chains[0].byLayer.witness === 1 && fv.chains[0].byLayer.hearsay === 1,
    'v2960: [B13] 逐层计数与该链真实跳分布一致（实 ' + JSON.stringify(fv.chains[0].byLayer) + '）');
  // B15 可见面
  const vt = W2.rumor.visibleTo('乙');
  a(vt.ok === true && vt.person === '乙' && vt.rows.every(function (x) { return W2.rumor.PUBLIC_LAYERS.indexOf(x.layer) >= 0; }),
    'v2960: [B15] 某人可见只出公开层（转述与流言不过玩家面）');
  a(W2.rumor.visibleTo('').reason === 'missing-fields', 'v2960: [B15] 缺人名报 missing-fields');
  // B16 诊断同源 + 观测纯读
  const rep1 = W2.toolDiag.collect();
  const rd1 = rep1.rumor || {};
  a(rd1.layers && JSON.stringify(rd1.layers) === JSON.stringify(W2.rumor.LAYERS)
    && JSON.stringify(rd1.motives) === JSON.stringify(W2.rumor.MOTIVES)
    && JSON.stringify(rd1.publicLayers) === JSON.stringify(W2.rumor.PUBLIC_LAYERS),
    'v2960: [B16] 诊断三集合与产品面同源（不抄第二份）');
  a(rd1.chains === 1 && rd1.tampered === 1 && rd1.hops === 2 && rd1.byLayer && rd1.byLayer.hearsay === 1,
    'v2960: [B16] 诊断读数与 stat / fullView 同读数（实 ' + JSON.stringify({ c: rd1.chains, t: rd1.tampered, h: rd1.hops }) + '）');
  const snap1 = JSON.stringify(W2.store.get());
  const rep2 = W2.toolDiag.collect();
  a(JSON.stringify(W2.store.get()) === snap1 && JSON.stringify(rep2.rumor) === JSON.stringify(rep1.rumor),
    'v2960: [B16] 连采两次读数不变（诊断节不调 startChain / relay / refute / conceal）');
  // B17 面板真消费（用**全新实例**：面板绑定读写的是宿主 localStorage，
  //   前面 W2 已经起过链，同一 factKey 再起一次会报 exists，验不到起链那一路）
  const H17 = fresh(); const W17 = seed(H17.WA);
  // 显式开启：`fresh()` 复用宿主 localStorage，前段的 enabled 会是残留值——
  //   断言「勾选框与真实设置同源」必须自己先把真实设置定下来，否则测的是上一条用例的余温。
  W17.rumor.setSettings({ enabled: true });
  const panel = H17.dom.getElementById('wa-panel');
  const tab = panel.querySelectorAll('.wa-tab').filter(function (x) { return x.dataset.page === 'people'; })[0];
  a(!!tab, 'v2960: [B17] 承载传播与辟谣控件的 tab 在场');
  tab.click();
  // 每次点击都会 renderBody() 重建 DOM ⇒ 控件引用必须**每步重查**（复用旧引用必然空转）
  const body = function () { return panel.querySelector('.wa-body'); };
  const btn = function (id) { return body().querySelectorAll('button').filter(function (b) { return b.id === id; })[0]; };
  const inp = function (id) { return body().querySelectorAll('input').filter(function (b) { return b.id === id; })[0]; };
  const outTxt = function () { const o = H17.dom.getElementById('wa-rm-out'); return o ? String(o.textContent || '') : ''; };
  a(!!btn('wa-rm-start') && !!btn('wa-rm-relay') && !!btn('wa-rm-investigate') && !!inp('wa-rm-fact'),
    'v2960: [B17] 起链 / 转述 / 调查三控件同时渲染成树（绑定不会空转）');
  a(inp('wa-rm-enabled') && inp('wa-rm-enabled').checked === true,
    'v2960: [B17] 启用勾选框与真实设置同源（不是写死的 checked）');
  inp('wa-rm-fact').value = FACT_KEY;
  btn('wa-rm-start').click();
  const t1 = outTxt();
  a(t1.indexOf('rm_' + FACT_KEY) > 0 && t1.indexOf('conf-90') > 0 && t1.indexOf('已记录') === 0,
    'v2960: [B17] 起链读数带 id 与置信度（实 ' + t1 + '）');
  a(inp('wa-rm-id').value === RID,
    'v2960: [B17] 起链后 id 自动回填（人手抄一遍必错；实 ' + inp('wa-rm-id').value + '）');
  inp('wa-rm-from').value = '甲'; inp('wa-rm-to').value = '乙';
  btn('wa-rm-relay').click();
  const t2 = outTxt();
  a(t2.indexOf('witness') > 0 && t2.indexOf('intact-y') > 0 && t2.indexOf('1跳') > 0,
    'v2960: [B17] 转述读数报层 / 置信度 / 是否被改写 / 跳数（实 ' + t2 + '）');
  btn('wa-rm-investigate').click();
  const t3 = outTxt();
  a(t3.indexOf('未被改写') > 0 && t3.indexOf('1跳') > 0,
    'v2960: [B17] 调查读数回答「传到最后还是不是原来那条」（实 ' + t3 + '）');
  inp('wa-rm-value').value = '其实是他自己走了';
  btn('wa-rm-relay').click();
  const t4 = outTxt();
  a(t4.indexOf('未记录') === 0 && t4.indexOf('undeclared-rewrite') > 0,
    'v2960: [B17] 未声明改写在面板上如实显示（面板不替用户把值抹掉，实 ' + t4 + '）');
  // 全知视图按钮也真消费（面板上的第三条读出口）
  btn('wa-rm-fullview').click();
  const t5 = outTxt();
  a(t5.indexOf(FACT_KEY) > 0 && t5.indexOf('@') > 0,
    'v2960: [B17] 全知视图读数落在输出节点上（真消费，不是装饰按钮，实 ' + t5 + '）');
  // B19 置信度单一真源
  const H3 = fresh(); const W3 = seed(H3.WA);
  const keepRecord = W3.intel.CONFIDENCE.record;
  W3.intel.CONFIDENCE.record = 42;
  const c3 = chain(W3);
  W3.intel.CONFIDENCE.record = keepRecord;
  a(c3.conf === 42, 'v2960: [B19] 改 intel.CONFIDENCE ⇒ conf 跟着变（证明确无第二套数，实 ' + c3.conf + '）');
  // B21 环形挤出
  const H4 = fresh(); const W4 = seed(H4.WA);
  W4.store.transact(function (d) {
    d.worldFacts = [];
    for (let i = 0; i < 10; i += 1) d.worldFacts.push({ key: 'k' + i, value: 'v' + i, scope: 'world', at: 0 });
  }, 'v2960:many');
  W4.rumor.setSettings({ maxChains: 16 });
  for (let i = 0; i < 10; i += 1) W4.rumor.startChain('k' + i, '批量');
  const n4 = (((W4.store.get().rumor || {}).chains) || []).length;
  a(n4 === 8, 'v2960: [B21] 超出登记 cap 的部分被环形裁掉（cap=8，实 ' + n4 + '）——evict 站点真接线，否则不会截断');
  // ── C 不变式 ──
  const WC = env();
  const facts0 = JSON.stringify(WC.store.get().worldFacts) + '|' + JSON.stringify((WC.store.get().memory || {}).facts);
  chain(WC);
  WC.rumor.relay(RID, { from: '甲', to: '乙', layer: 'witness' });
  WC.rumor.relay(RID, { from: '乙', to: '丙', layer: 'hearsay', motive: 'distort', value: '被人绑走了' });
  WC.rumor.refute(RID, { from: '丙', to: '丁', layer: 'hearsay' });
  WC.rumor.conceal(RID, { by: '丁', why: '不说' });
  const facts1 = JSON.stringify(WC.store.get().worldFacts) + '|' + JSON.stringify((WC.store.get().memory || {}).facts);
  a(facts0 === facts1, 'v2960: [C1] 整轮传播（如实 / 歪曲 / 辟谣 / 隐瞒）后事实副本**字节级不变**（口径①）');
  const sn = WC.rumor.stat();
  // 计数口径：三跳转述 / 一跳辟谣 / 一次隐瞒 / 一次起链；refute 不计进 relays（辟谣不是「转述」）。
  a(sn.started === 1 && sn.relays === 2 && sn.refuted === 1 && sn.concealed === 1 && sn.blocked === 0,
    'v2960: [C2] stat 五计数各自分列（实 ' + JSON.stringify({ s: sn.started, r: sn.relays, f: sn.refuted, c: sn.concealed, b: sn.blocked }) + '）');
  a(sn.relays + sn.refuted === 3 && sn.relays !== sn.refuted,
    'v2960: [C2] 辟谣与转述分列计数（「有人否认过」与「有人传过」不是同一件事，混起来就答不出「谁在骗人」）');
  a(WC.rumor.fullView().chains[0].suppressed === 1,
    'v2960: [C2] 隐瞒与跳分列计数（读账时不会把「没传出去」算成「传了几手」）');
  a(WC.rumor.getSettings().maxChains === 8 && WC.rumor.LAYER_LEVEL.fact === W.intel.LEVELS[W.intel.LEVELS.length - 1],
    'v2960: [C3] 层 ↔ intel 层级的映射与 intel 真实层级表对得上（不硬编码第二份）');
}
// ══════════════ 负控制（真源码破坏 → 破坏副本 → 副本上重跑同款真判据）══════════════
function runNegative(a) {
  const CASES = [
    ['ASCEND_GUARD', probeAscend, '层不得升格'],
    ['TAMPER_LAYER', probeTamperLayer, '篡改不许落公开层'],
    ['UNDECLARED_REWRITE', probeUndeclaredRewrite, '未声明的改写一律拒收'],
    ['INTACT_CUMULATIVE', probeIntactCumulative, 'intact 一旦被改写就回不来'],
    ['HOPS_NO_EVICT', probeHopsNoEvict, '满员拒收不挤出'],
    ['CONF_NO_FALLBACK', probeConfNoFallback, 'intel 缺席报 engine-absent'],
    ['PUBLIC_ONLY_BLOCK', probePublicOnlyBlock, '玩家面只出公开层'],
    ['FACT_NO_FABRICATE', probeFactNoFabricate, '未登记事实不凭空造'],
    ['CONCEAL_NOT_HOP', probeConcealNotHop, '隐瞒不是一次传播'],
    ['REFUTE_NO_REWRITE', probeRefuteNoRewrite, '辟谣不改事实']
  ];
  // N0 十锚点各中 1 次（并顺带证明原版上同款判据为真——判据纯度）
  let n0 = 0;
  CASES.forEach(function (c) {
    try {
      const br = breakOne(c[0]);
      must1(src(ANCHORS[c[0]].rel), ANCHORS[c[0]].txt, c[0] + ':origin');
      if (c[1](env()) !== true) throw new Error('probe false on ORIGINAL');
      const o = {}; o[br.rel] = br.src;
      const got = c[1](env(o));
      if (got !== false) throw new Error('probe still true on BROKEN');
      n0++;
    } catch (e) { console.log('  ✗ N1 ' + c[0] + ' (' + c[2] + '): ' + e.message); }
  });
  a(n0 === CASES.length, 'v2960: [N1] ' + CASES.length + ' 向破坏各自现形（真源码破坏 ⇒ 破坏副本上同款判据由真变假）');

  // N2 读数随事实变化（同一实例内 0 → 1，不跨段复用实例）
  const W = env();
  a((((W.store.get().rumor || {}).chains) || []).length === 0 && W.rumor.stat().started === 0,
    'v2960: [N2] 起始零链零计数');
  chain(W);
  a((((W.store.get().rumor || {}).chains) || []).length === 1 && W.rumor.stat().started === 1,
    'v2960: [N2] 起一条链 ⇒ 0 → 1（读数真的随事实走，不是恒值）');
  a(W.rumor.buildBlock() === '', 'v2960: [N2] 停在事实层且无人经手的链不进正文（那是事实本身，记忆块已在讲它）');

  // N3 坏参数各自点名
  const W3 = env();
  const bads = [W3.rumor.relay('', { from: '甲', to: '乙' }).reason,
    W3.rumor.refute('rm_x', { from: '', to: '乙' }).reason,
    W3.rumor.conceal('rm_x', { by: '' }).reason];
  a(JSON.stringify(bads) === JSON.stringify(['missing-fields', 'missing-fields', 'missing-fields']),
    'v2960: [N3] 三处缺字段各自点名 missing-fields（不静默跳过；实 ' + JSON.stringify(bads) + '）');
  a(W3.rumor.conceal('rm_没有', { by: '甲' }).reason === 'missing', 'v2960: [N3] 对不存在的链隐瞒报 missing');
  const W3b = env();
  chain(W3b);
  W3b.rumor.setSettings({ maxSuppressed: 1 });
  W3b.rumor.conceal(RID, { by: '甲', why: '一' });
  const sp = W3b.rumor.conceal(RID, { by: '乙', why: '二' });
  a(sp.ok === false && sp.reason === 'suppressed-full' && sp.cap === 1,
    'v2960: [N3] 隐瞒满员报 suppressed-full 且带 cap（实 ' + JSON.stringify(sp) + '）');

  // N4 工具两向自证：锚点不存在 / 不唯一须抛；破坏须可观测改行为
  let n4 = 0;
  try { must1(src(RUMOR), 'const NO_SUCH_ANCHOR_2960 = 1;', 'n4-absent'); } catch (e) { n4++; }
  try { must1(src(RUMOR), '  function ', 'n4-not-unique'); } catch (e) { n4++; }
  try {
    const br = breakOne('INTACT_CUMULATIVE');
    const broken = (function () { const o = {}; o[br.rel] = br.src; return o; })();
    // 必须先**制造改写**再比：两条链都没被改过时读数逐字相同，差异根本观测不到。
    const intactAfter = function (W) {
      chain(W);
      W.rumor.relay(RID, { from: '甲', to: '乙', layer: 'witness' });
      W.rumor.relay(RID, { from: '乙', to: '丙', layer: 'hearsay', motive: 'distort', value: '被人绑走了' });
      W.rumor.relay(RID, { from: '丙', to: '丁', layer: 'rumor', motive: 'distort', value: FACT_VAL });
      return W.rumor.investigate(RID).intact;
    };
    const so = intactAfter(env()), sb = intactAfter(env(broken));
    if (so === false && sb === true) n4++;
  } catch (e) {}
  a(n4 === 3, 'v2960: [N4] 锚点不存在/不唯一各自抛；且破坏真能改变可观测行为（工具两向自证）');

  // H5 判据纯度：负控制层内每条锚点字面量只声明一次（判据不得引用锚点串）
  const self = src('tests/rumor-v2960.js');
  const ok5 = Object.keys(ANCHORS).every(function (k) {
    return hits(self, ANCHORS[k].txt.replace(/\n/g, '\\n')) === 1;
  });
  a(ok5, 'v2960: [H5] 每条锚点字面量在本文件只出现一次（判据不得引用锚点串）');
}
// ══════════════ 入口 ══════════════
if (require.main === module) {
  let pass = 0, fail = 0;
  const a2 = function (cond, name) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name); }
  };
  try { runAll(a2); runNegative(a2); }
  catch (e) { fail++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (fail) { console.log('RUMOR-V2960: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('RUMOR-V2960: pass（' + pass + ' 项）');
}
module.exports = { runAll: runAll, runNegative: runNegative, ANCHORS: ANCHORS };

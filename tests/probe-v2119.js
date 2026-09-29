#!/usr/bin/env node
// WorldAxis tests/probe-v2119.js -- 拓展计划 ⑤ 专锁：证据驱动的调查与对质（v2.119.0）
//
// 逐条守住：
//   ① 立案至少两条假说（单假说拒收——只有一个可能性的不是调查）；
//   ② 来源等级必须具名（自造等级拒收）；
//   ③ 举证必须写明指向与方向；
//   ④ 支持与反驳各自留行、不取平均；
//   ⑤ 对质要有本钱（支持不够不让去）；
//   ⑥ 定案需「支持够 + 无任何反证」，否则记未决；
//   ⑦ 误指留痕不删行；
//   ⑧ 总开关关闭零台账。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__probe2119_';
const REL = 'engines/probe.js';
// ── 破坏锚点（逐字取自真源码，各恰 1 次）──
const A_FEW    = "    if (list.length < 2) {";
const A_LEVEL  = "    if (LEVELS.indexOf(lvl) < 0) { noteFault('bad-level'); return { ok: false, reason: 'bad-level', allowed: LEVELS.slice() }; }";
const A_DIR    = "    if (dir !== 'support' && dir !== 'refute') { noteFault('missing-direction'); return { ok: false, reason: 'missing-direction', hint: '不说支持还是反驳的线索不进卷宗' }; }";
const A_CF     = "    if (t.support < cfg.minSupport) {";
const A_SETTLE = "    const settled = top && top.support >= cfg.minSupport && top.refute === 0;";
const A_WRONG  = "    if (!why) { noteFault('missing-reason'); return { ok: false, reason: 'missing-reason', hint: '误指也要写明为何认定查错了' }; }";
const A_OFF    = "    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }\n    const o = opts || {};\n    const q = clean(question, 80);";
const BROKEN = [
  { rel: REL, key: 'few',    from: A_FEW,    to: "    if (false) {" },
  { rel: REL, key: 'level',  from: A_LEVEL,  to: "    if (false) { noteFault('bad-level'); return { ok: false, reason: 'bad-level' }; }" },
  { rel: REL, key: 'dir',    from: A_DIR,    to: "    if (false) { noteFault('missing-direction'); return { ok: false, reason: 'missing-direction' }; }" },
  { rel: REL, key: 'cf',     from: A_CF,     to: "    if (false) {" },
  { rel: REL, key: 'settle', from: A_SETTLE, to: "    const settled = top && top.support >= cfg.minSupport;" },
  { rel: REL, key: 'wrong',  from: A_WRONG,  to: "    if (false) { noteFault('missing-reason'); return { ok: false, reason: 'missing-reason' }; }" },
  { rel: REL, key: 'off',    from: A_OFF,    to: "    if (false) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }\n    const o = opts || {};\n    const q = clean(question, 80);" }
];
const B = {};
BROKEN.forEach(function (s, i) { B[s.key] = i; });
function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function readSrc(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function anchorHits(spec) { return readSrc(spec.rel).split(spec.from).length - 1; }
function brokenOverride(spec) {
  const src = readSrc(spec.rel);
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('anchor hits ' + hits + ' :: ' + spec.key);
  const ov = {};
  ov[spec.rel] = src.split(spec.from).join(spec.to);
  return ov;
}
function mkW(ov) { return reset(fresh(ov ? { srcOverride: ov } : {})); }
function probeWith(spec, fn) {
  let out;
  try { out = fn({ ov: brokenOverride(spec) }); } catch (e) { out = 'threw:' + (e && e.message); }
  return out;
}
function probeClean(fn) {
  let out;
  try { out = fn({ ov: null }); } catch (e) { out = 'threw:' + (e && e.message); }
  return out;
}
function reset(WA) {
  WA.probe.setSettings({ enabled: false, maxCases: 4, maxEvidence: 8, minSupport: 2 });
  WA.intel.setSettings({ enabled: true });
  WA.store.transact(function (d) { d.probe = { cases: [] }; }, TAG + 'reset');
  WA.probe.setSettings({ enabled: true, maxCases: 4, maxEvidence: 8, minSupport: 2 });
  return WA;
}
// 两个假说、四路可选手段
function seeded(WA) {
  const r = WA.probe.open('仓库失窃', ['老王', '小李']);
  return r.id;
}
function twoSup(WA, id) {
  WA.probe.addEvidence(id, '门锁没坏', { level: 'witness', dir: 'support', about: 'h0', by: '甲' });
  WA.probe.addEvidence(id, '他当晚在店里', { level: 'record', dir: 'support', about: 'h0', by: '乙' });
}

const PROBES = {
  pFew: function (env) {
    const WA = mkW(env.ov);
    const a = WA.probe.open('仓库失窃', ['老王']);
    const b = WA.probe.open('仓库失窃', []);
    const c = WA.probe.open('仓库失窃', ['老王', '小李']);
    const d = WA.probe.open('仓库失窃', ['老王', '小李']);
    const n = WA.probe.statView().cases;
    // 单假说不是调查；同一问题不许开两案。
    return (a.reason === 'too-few-hypotheses' && b.reason === 'too-few-hypotheses'
      && c.ok === true && d.reason === 'exists' && n === 1) ? 'many-hypotheses'
      : 'x:' + [a.reason, b.reason, c.ok, d.reason, n].join(',');
  },
  pLevel: function (env) {
    const WA = mkW(env.ov);
    const id = seeded(WA);
    const a = WA.probe.addEvidence(id, '我说是他', { level: 'gut', dir: 'support', about: 'h0' });
    const v1 = WA.probe.view(id);
    const b = WA.probe.addEvidence(id, '门锁没坏', { level: 'witness', dir: 'support', about: 'h0' });
    return (a.reason === 'bad-level' && v1.evidence === 0 && b.ok === true)
      ? 'level-named' : 'x:' + [a.reason, v1.evidence, b.ok].join(',');
  },
  pDir: function (env) {
    const WA = mkW(env.ov);
    const id = seeded(WA);
    const a = WA.probe.addEvidence(id, '不明方向的线索', { level: 'report', about: 'h0' });
    const v1 = WA.probe.view(id);
    const b = WA.probe.addEvidence(id, '方向错的', { level: 'report', dir: 'maybe', about: 'h0' });
    const v2 = WA.probe.view(id);
    const c = WA.probe.addEvidence(id, '指错了假说', { level: 'report', dir: 'support', about: 'h9' });
    const d = WA.probe.addEvidence(id, '正常一条', { level: 'report', dir: 'support', about: 'h0' });
    return (a.reason === 'missing-direction' && v1.evidence === 0 && b.reason === 'missing-direction'
      && v2.evidence === 0 && c.reason === 'unknown-hypothesis' && d.ok === true)
      ? 'direction-required' : 'x:' + [a.reason, v1.evidence, b.reason, c.reason, d.ok].join(',');
  },
  pBoth: function (env) {
    const WA = mkW(env.ov);
    const id = seeded(WA);
    twoSup(WA, id);
    const v1 = WA.probe.view(id);
    const r = WA.probe.addEvidence(id, '监控显示另有其人', { level: 'record', dir: 'refute', about: 'h0', by: '丙' });
    const v2 = WA.probe.view(id);
    const h = v2.hypotheses[0];
    // 支持与反驳各自留行、不取平均：反驳不消减支持数。
    return (v1.decidable === true && r.ok === true && h.support === 2 && h.refute === 1
      && v2.decidable === false && v2.blockedBy === 'refuted') ? 'both-kept'
      : 'x:' + JSON.stringify([v1.decidable, h.support, h.refute, v2.decidable, v2.blockedBy]);
  },
  pConfront: function (env) {
    const WA = mkW(env.ov);
    const id = seeded(WA);
    WA.probe.addEvidence(id, '门锁没坏', { level: 'witness', dir: 'support', about: 'h0' });
    const a = WA.probe.confront(id, '小李', { about: 'h0' });
    WA.probe.addEvidence(id, '他当晚在店里', { level: 'record', dir: 'support', about: 'h0' });
    const b = WA.probe.confront(id, '小李', { about: 'h0', level: 'witness', by: '甲' });
    const v = WA.probe.view(id);
    // 对质要有本钱：1 条不够 2 条够。
    return (a.reason === 'insufficient-support' && a.support === 1 && a.need === 2
      && b.ok === true && v.confronts === 1) ? 'costly-confront'
      : 'x:' + JSON.stringify([a.reason, a.support, a.need, b.ok, v.confronts]);
  },
  pSettle: function (env) {
    const WA = mkW(env.ov);
    const id = seeded(WA);
    WA.probe.addEvidence(id, '门锁没坏', { level: 'witness', dir: 'support', about: 'h0' });
    const a = WA.probe.decide(id, {});
    const v1 = WA.probe.view(id);
    const id2 = WA.probe.open('另一桩', ['甲', '乙']);
    twoSup(WA, id2.id);
    const b = WA.probe.decide(id2.id, {});
    const v2 = WA.probe.view(id2.id);
    // 支持够且无反驳才定 guilty；支持不够一律未决。
    return (a.verdict === 'undecided' && v1.status === 'closed' && v1.verdict === 'undecided'
      && b.verdict === 'guilty' && v2.verdict === 'guilty') ? 'settle-threshold'
      : 'x:' + JSON.stringify([a.verdict, v1.verdict, b.verdict, v2.verdict]);
  },
  pWrong: function (env) {
    const WA = mkW(env.ov);
    const id = seeded(WA);
    const a = WA.probe.wrong(id, '老王', {});
    const v1 = WA.probe.view(id);
    const b = WA.probe.wrong(id, '老王', { why: '后来查清是别人' });
    const v2 = WA.probe.view(id);
    // 误指也要写明原因，且留行不删。
    return (a.reason === 'missing-reason' && v1.wrongs === 0 && b.ok === true
      && b.verdict === 'clear' && v2.wrongs === 1 && v2.status === 'closed') ? 'wrong-recorded'
      : 'x:' + JSON.stringify([a.reason, v1.wrongs, b.ok, v2.wrongs, v2.status]);
  },
  pRefDec: function (env) {
    const WA = mkW(env.ov);
    const id = seeded(WA);
    twoSup(WA, id);
    WA.probe.addEvidence(id, '监控显示另有其人', { level: 'record', dir: 'refute', about: 'h0', by: '丙' });
    const r = WA.probe.decide(id, { note: '有反证' });
    // 有反证就不能定案：支持够但被反驳 ⇒ 只能记未决。
    return (r.verdict === 'undecided' && r.support === 2 && r.refute === 1) ? 'refuted-undecided'
      : 'x:' + JSON.stringify([r.verdict, r.support, r.refute]);
  },
  pOff: function (env) {
    const WA = mkW(env.ov);
    const id = seeded(WA);
    WA.probe.setSettings({ enabled: false });
    const a = WA.probe.open('新案', ['甲', '乙']);
    const b = WA.probe.addEvidence(id, 'x', { level: 'report', dir: 'support', about: 'h0' });
    const c = WA.probe.confront(id, '甲', { about: 'h0' });
    const d = WA.probe.decide(id, {});
    const e = WA.probe.wrong(id, '甲', { why: 'y' });
    const n = WA.probe.statView().cases;
    return ([a.reason, b.reason, c.reason, d.reason, e.reason].every(function (x) { return x === 'disabled'; })
      && n === 1 && WA.probe.buildBlock() === '') ? 'off-refused'
      : 'x:' + [a.reason, b.reason, n].join(',');
  },
  pBound: function (env) {
    const WA = mkW(env.ov);
    let ok = 0;
    for (let i = 0; i < 8; i++) { if (WA.probe.open('案' + i, ['甲', '乙']).ok) ok++; }
    const n = WA.probe.statView().cases;
    const cap = WA.store.sizeCaps()['probe.cases'].cap;
    // 容量有界且挤出有账。
    return (n === 4 && ok === 4 && n <= cap) ? 'cases-bounded' : 'x:n:' + n + '/ok:' + ok;
  }
};

const N1 = [
  { k: 'few',    p: PROBES.pFew,      okk: 'many-hypotheses',  note: '单假说也能立案' },
  { k: 'level',  p: PROBES.pLevel,    okk: 'level-named',      note: '自造来源等级也被当证据' },
  { k: 'dir',    p: PROBES.pDir,      okk: 'direction-required', note: '不说方向的线索进卷宗' },
  { k: 'cf',     p: PROBES.pConfront, okk: 'costly-confront',  note: '证据不足也能去对质' },
  { k: 'settle', p: PROBES.pRefDec,   okk: 'refuted-undecided', note: '有反证也能定案' },
  { k: 'wrong',  p: PROBES.pWrong,    okk: 'wrong-recorded',   note: '误指不必写明原因' },
  { k: 'off',    p: PROBES.pOff,      okk: 'off-refused',      note: '关闭时仍立案' }
];
const BAD_PREFIX = ['x:', 'threw:'];
function isOk(got) {
  return typeof got === 'string' && BAD_PREFIX.every(function (p) { return got.indexOf(p) !== 0; });
}
function judge(a) {
  const ev = readSrc('core/evict.js');
  const st = readSrc('core/store.js');
  const ix = readSrc('index.js');
  const rj = readSrc('tests/run.js');
  const td = readSrc('engines/tool-diag.js');
  const inj = readSrc('render/inject.js');
  const pn = readSrc('ui/panel.js');
  const src = readSrc(REL);
  a(ev.indexOf("'probe.cases'") >= 0, 'v2119/probe: [A1] evict.SITES 登记 probe.cases');
  a(st.indexOf("'probe.cases'") >= 0 && st.indexOf('probe: { cases: [] }') >= 0,
    'v2119/probe: [A2] store 骨架物化 probe 且 __BOUNDED_CAPS 登记同键');
  a(ix.indexOf("'engines/probe.js'") >= 0 && rj.indexOf("'engines/probe.js'") >= 0,
    'v2119/probe: [A3] index.js / tests/run.js 两处 LOAD 都登记');
  a(td.indexOf("'engines/probe.js': 'probe'") >= 0, 'v2119/probe: [A4] tool-diag MODULE_EXPORTS 登记');
  a(inj.indexOf("'probe'") >= 0 && inj.indexOf('vis.probe && WA.probe') >= 0
    && inj.indexOf('调查卷宗') >= 0, 'v2119/probe: [A5] 注入源表与注入分支同批登记');
  a(pn.indexOf("probe: '调查卷宗'") >= 0, 'v2119/probe: [A6] 面板显示名登记');
  a(td.indexOf("'wa-probe-open'") >= 0 && td.indexOf("'wa-probe-out'") >= 0,
    'v2119/probe: [A7] 守卫表登记控件');
  a(src.indexOf('enabled: false, maxCases: 8, maxEvidence: 24, minSupport: 2') >= 0,
    'v2119/probe: [A8] 总开关默认关');
  a(src.indexOf("const LEVELS = ['rumor', 'report', 'witness', 'record'];") >= 0,
    'v2119/probe: [A9] 来源等级具名（与 intel 同尺）');
  a(src.indexOf('WA.registerModule(') >= 0 && src.indexOf('engines/probe.js') >= 0,
    'v2119/probe: [A10] 模块自注册');
  // 定案需「支持够 + 无任何反证」两件事同时成立；对质与定案各有一处真判据。
  a(src.indexOf('top.support >= cfg.minSupport && top.refute === 0') >= 0,
    'v2119/probe: [A11] 定案双条件（支持够且无反驳）');
  // 卷宗三个子表（evidence / confronts / wrongs）都有界，且对质走 intel.believe（唯一一次）。
  a(src.indexOf("'probe.cases.*.evidence'") >= 0 && src.indexOf("'probe.cases.*.confronts'") >= 0
    && src.indexOf("'probe.cases.*.wrongs'") >= 0, 'v2119/probe: [A12] 三个子表都走 evict 单一出口');
  a((src.match(/WA\.intel\.believe\(/g) || []).length === 1,
    'v2119/probe: [A13] 认知变化只走 intel.believe 一处（不自造真相口径）');
  a(src.indexOf('autoDecide') < 0 && src.indexOf('autoConfront') < 0,
    'v2119/probe: [A14] 无「自动定案 / 自动对质」路径');
  Object.keys(PROBES).forEach(function (k) {
    const got = probeClean(PROBES[k]);
    a(isOk(got), 'v2119/probe: [B] 原版可用 :: ' + k + '（实 ' + got + '）');
  });
  const W = mkW(null);
  const c = W.probe.open('仓库失窃', ['老王', '小李'], { note: '入室' });
  a(c.ok === true && c.hypotheses === 2, 'v2119/probe: [C] 立案得两条假说');
  const e1 = W.probe.addEvidence(c.id, '门锁没坏', { level: 'witness', dir: 'support', about: 'h0', by: '甲' });
  a(e1.ok === true && e1.support === 1 && e1.refute === 0, 'v2119/probe: [C] 第一条支持入卷');
  const v1 = W.probe.view(c.id);
  a(v1.ok === true && v1.evidence === 1 && v1.need === 2 && v1.decidable === false
    && v1.blockedBy === 'thin', 'v2119/probe: [C] 证据薄时当场报「不可定案」');
  const e2 = W.probe.addEvidence(c.id, '他当晚在店里', { level: 'record', dir: 'support', about: 'h0', by: '乙' });
  const v2 = W.probe.view(c.id);
  a(e2.ok === true && e2.support === 2 && v2.decidable === true && v2.leader === 'h0',
    'v2119/probe: [C] 二条支持后变为可定案');
  const cf = W.probe.confront(c.id, '小李', { about: 'h0', level: 'witness', by: '甲' });
  a(cf.ok === true && cf.support === 2 && cf.belief !== null, 'v2119/probe: [C] 对质留痕（含认知回执）');
  const dd = W.probe.decide(c.id, { note: '证据充分', accused: '老王' });
  a(dd.ok === true && dd.verdict === 'guilty' && dd.leader === 'h0' && dd.refute === 0,
    'v2119/probe: [C] 支持够且无反驳才定案');
  const v3 = W.probe.view(c.id);
  a(v3.status === 'closed' && v3.verdict === 'guilty' && v3.accused === '老王',
    'v2119/probe: [C] 结案留名（定案也不删行）');
  const again = W.probe.addEvidence(c.id, '又一条', { level: 'report', dir: 'support', about: 'h0' });
  a(again.ok === false && again.reason === 'already-closed', 'v2119/probe: [C] 结案后不再收线索');
  const sv = W.probe.statView();
  a(sv.cases === 1 && sv.open === 0 && sv.byVerdict.guilty === 1 && sv.evidence === 2,
    'v2119/probe: [C] statView 分列读数');
  const caps = W.store.sizeCaps();
  a(caps['probe.cases'].cap === 8, 'v2119/probe: [C] 容量登记可见');
  const arr = [];
  for (let i = 0; i < 12; i++) arr.push({ i: i });
  const rr = W.evict.array(arr, 'probe.cases', 8);
  a(rr.ok && rr.dropped === 4 && arr.length === 8, 'v2119/probe: [C] 站点「声明即执行」实测通过');
  // 注入块只报「在查」的案子：新开一案才可见。
  const c2 = W.probe.open('另案', ['甲', '乙']);
  const bb = W.probe.buildBlock();
  a(c2.ok === true && bb.indexOf('[调查卷宗]') >= 0 && bb.indexOf('支持') >= 0
    && bb.indexOf('不得取平均') >= 0 && bb.indexOf('未决') >= 0,
    'v2119/probe: [C] 注入块说清支持/反驳与未决口径');
  const before = JSON.stringify(W.store.get().probe);
  W.probe.view(c.id); W.probe.statView(); W.probe.buildBlock();
  a(JSON.stringify(W.store.get().probe) === before, 'v2119/probe: [C] 读取路径不写盘');
}
function runNegative(a) {
  a(BROKEN.length === 7 && new Set(BROKEN.map(function (x) { return x.key; })).size === 7,
    'v2119/probe: [N0] 破坏面覆盖 7 个互异锚点（实 ' + BROKEN.length + '）');
  BROKEN.forEach(function (s) {
    a(anchorHits(s) === 1, 'v2119/probe: [N0] 锚点在真源码中恰 1 次 :: ' + s.key);
  });
  N1.forEach(function (it) {
    const got = probeWith(BROKEN[B[it.k]], it.p);
    a(got !== it.okk, 'v2119/probe: [N1] ' + it.note + '（缺口复现；实测 ' + got + '）');
  });
  Object.keys(PROBES).forEach(function (k) {
    const got = probeClean(PROBES[k]);
    a(isOk(got), 'v2119/probe: [N2] 原版成立 :: ' + k + '（实 ' + got + '）');
  });
  a(probeWith(BROKEN[B['level']], PROBES.pDir) === 'direction-required', 'v2119/probe: [N3] 破坏来源等级不影响方向判定');
  a(probeWith(BROKEN[B['cf']], PROBES.pSettle) === 'settle-threshold', 'v2119/probe: [N3] 破坏对质成本不影响定案阈值');
  a(probeWith(BROKEN[B['settle']], PROBES.pConfront) === 'costly-confront', 'v2119/probe: [N3] 破坏定案条件不影响对质成本');
  a(probeWith(BROKEN[B['few']], PROBES.pWrong) === 'wrong-recorded', 'v2119/probe: [N3] 破坏多假说要求不影响误指留痕');
  const okv = probeClean(PROBES.pRefDec);
  const badv = probeWith(BROKEN[B['settle']], PROBES.pRefDec);
  a(okv !== badv && okv === 'refuted-undecided',
    'v2119/probe: [N4] 反证阻断定案判据非恒真（原版 ' + okv + ' / 破坏 ' + badv + '）');
  const ok2 = probeClean(PROBES.pConfront);
  const bad2 = probeWith(BROKEN[B['cf']], PROBES.pConfront);
  a(ok2 !== bad2 && ok2 === 'costly-confront',
    'v2119/probe: [N4] 对质成本判据非恒真（原版 ' + ok2 + ' / 破坏 ' + bad2 + '）');
  const ok3 = probeClean(PROBES.pFew);
  const bad3 = probeWith(BROKEN[B['few']], PROBES.pFew);
  a(ok3 !== bad3 && ok3 === 'many-hypotheses',
    'v2119/probe: [N4] 多假说判据非恒真（原版 ' + ok3 + ' / 破坏 ' + bad3 + '）');
}
function runAll(a) { judge(a); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('PROBE-V2119: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('PROBE-V2119: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits,
  PROBES: PROBES, mkW: mkW, probeClean: probeClean, probeWith: probeWith };

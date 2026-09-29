#!/usr/bin/env node
// WorldAxis tests/stage-v2119.js -- 拓展计划 ⑦ 专锁：玩法包与长篇阶段变化（v2.119.0）
//
// 逐条守住：
//   ① 玩法包必须具名；
//   ② 一套包只能采纳一次（换包要显式 replace）；
//   ③ 指标必须是包声明的；
//   ④ 指标只能递增（成就不可回卷）；
//   ⑤ 迁移必须写明条件与清单；
//   ⑥ 门槛未达不得换阶段；
//   ⑦ 清单未逐项生效不得换阶段；
//   ⑧ 总开关关闭零台账。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__stage2119_';
const REL = 'engines/stage.js';
const A_PACK = "    if (!def) { noteFault('unknown-pack'); return { ok: false, reason: 'unknown-pack', pack: name, known: Object.keys(PACKS) }; }";
const A_ADOPT = "    if (cur && cur.pack && !o.replace) {";
const A_METRIC = "    if (!def || def.metrics.indexOf(m) < 0) {";
const A_ADV = "    if (d <= 0) {";
const A_TRIG = "    if (!metric || need === null) {";
const A_CHG = "    if (!changes.length) {";
const A_THR = "    if (have < row.need) {";
const A_APPL = "    if (missing.length) {";
const A_OFF = "    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }\n    const o = opts || {};\n    const name = clean(pack, 40);";
const BROKEN = [
  { rel: REL, key: 'pack',   from: A_PACK,   to: "    if (false) { noteFault('unknown-pack'); return { ok: false, reason: 'unknown-pack' }; }" },
  { rel: REL, key: 'adopt',  from: A_ADOPT,  to: "    if (false) {" },
  { rel: REL, key: 'metric', from: A_METRIC, to: "    if (false) {" },
  { rel: REL, key: 'adv',    from: A_ADV,    to: "    if (false) {" },
  { rel: REL, key: 'trig',   from: A_TRIG,   to: "    if (false) {" },
  { rel: REL, key: 'chg',    from: A_CHG,    to: "    if (false) {" },
  { rel: REL, key: 'thr',    from: A_THR,    to: "    if (false) {" },
  { rel: REL, key: 'appl',   from: A_APPL,   to: "    if (false) {" },
  { rel: REL, key: 'off',    from: A_OFF,    to: "    if (false) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }\n    const o = opts || {};\n    const name = clean(pack, 40);" }
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
  WA.stage.setSettings({ enabled: false, maxMetrics: 8, maxTransitions: 6 });
  WA.store.transact(function (d) { d.stage = { pack: '', stage: '', metrics: {}, transitions: [] }; }, TAG + 'reset');
  WA.stage.setSettings({ enabled: true, maxMetrics: 8, maxTransitions: 6 });
  return WA;
}
function seeded(WA) { const r = WA.stage.adopt('冒险'); return r; }

const PROBES = {
  pPack: function (env) {
    const WA = mkW(env.ov);
    const a = WA.stage.adopt('赛博朋克');
    const b = WA.stage.adopt('冒险');
    const v = WA.stage.statView();
    return (a.reason === 'unknown-pack' && b.ok === true && v.pack === '冒险' && v.stage === '启程')
      ? 'pack-named' : 'x:' + JSON.stringify([a.reason, b.ok, v.pack, v.stage]);
  },
  pOnce: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    const a = WA.stage.adopt('悬疑');
    const v1 = WA.stage.statView();
    const b = WA.stage.adopt('悬疑', { replace: true });
    const v2 = WA.stage.statView();
    return (a.reason === 'already-adopted' && v1.pack === '冒险'
      && b.ok === true && v2.pack === '悬疑') ? 'one-pack'
      : 'x:' + JSON.stringify([a.reason, v1.pack, b.ok, v2.pack]);
  },
  pMetric: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    const a = WA.stage.mark('体重', 1);
    const b = WA.stage.mark('里程', 1);
    const v = WA.stage.view();
    return (a.reason === 'unknown-metric' && a.declared.join('/') === '里程/声望'
      && b.ok === true && v.metrics[0].metric === '里程' && v.metrics[0].value === 1) ? 'metric-declared'
      : 'x:' + JSON.stringify([a.reason, a.declared, b.ok, v.metrics]);
  },
  pAdvance: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    WA.stage.mark('里程', 2);
    const a = WA.stage.mark('里程', -1);
    const b = WA.stage.mark('里程', 0);
    const v = WA.stage.view();
    return (a.reason === 'not-advancing' && b.reason === 'not-advancing'
      && v.metrics[0].value === 2) ? 'no-rewind'
      : 'x:' + JSON.stringify([a.reason, b.reason, v.metrics[0].value]);
  },
  pTrigger: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    const a = WA.stage.plan({ to: '深入', changes: ['场景种子'] });
    const b = WA.stage.plan({ to: '深入', metric: '里程', need: 3 });
    const c = WA.stage.plan({ to: '深入', metric: '体重', need: 3, changes: ['x'] });
    const v = WA.stage.statView();
    return (a.reason === 'missing-trigger' && b.reason === 'missing-changes'
      && c.reason === 'unknown-metric' && v.pending === 0) ? 'plan-complete'
      : 'x:' + JSON.stringify([a.reason, b.reason, c.reason, v.pending]);
  },
  pThr: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    const p = WA.stage.plan({ to: '深入', metric: '里程', need: 3, changes: ['场景种子'] });
    WA.stage.mark('里程', 2);
    const a = WA.stage.transit(p.id, { applied: ['场景种子'] });
    const v1 = WA.stage.statView();
    WA.stage.mark('里程', 1);
    const b = WA.stage.transit(p.id, { applied: ['场景种子'] });
    const v2 = WA.stage.statView();
    return (a.reason === 'threshold-unmet' && a.have === 2 && a.need === 3 && v1.stage === '启程'
      && b.ok === true && v2.stage === '深入') ? 'threshold-gated'
      : 'x:' + JSON.stringify([a.reason, a.have, a.need, v1.stage, b.ok, v2.stage]);
  },
  pApplied: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    const p = WA.stage.plan({ to: '深入', metric: '里程', need: 1, changes: ['场景种子', '信息边界'] });
    WA.stage.mark('里程', 1);
    const a = WA.stage.transit(p.id, {});
    const b = WA.stage.transit(p.id, { applied: ['场景种子'] });
    const v1 = WA.stage.statView();
    const c = WA.stage.transit(p.id, { applied: ['场景种子', '信息边界'] });
    const v2 = WA.stage.statView();
    return (a.reason === 'change-not-applied' && a.missing.length === 2
      && b.reason === 'change-not-applied' && b.missing[0] === '信息边界' && v1.stage === '启程'
      && c.ok === true && v2.stage === '深入') ? 'changes-first'
      : 'x:' + JSON.stringify([a.reason, b.reason, b.missing, v1.stage, c.ok, v2.stage]);
  },
  pOff: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    WA.stage.setSettings({ enabled: false });
    const a = WA.stage.adopt('悬疑');
    const b = WA.stage.mark('里程', 1);
    const c = WA.stage.plan({ to: '深入', metric: '里程', need: 1, changes: ['x'] });
    const d = WA.stage.transit('tr_x', {});
    const v = WA.stage.statView();
    return ([a.reason, b.reason, c.reason, d.reason].every(function (x) { return x === 'disabled'; })
      && v.pack === '冒险' && WA.stage.buildBlock() === '') ? 'off-refused'
      : 'x:' + [a.reason, b.reason, c.reason, d.reason].join(',');
  },
  pBound: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    let ok = 0;
    for (let i = 0; i < 5; i++) {
      if (WA.stage.plan({ to: '归返', metric: '里程', need: 99 + i, changes: ['x'] }).ok) ok++;
    }
    const n = WA.stage.statView().pending;
    const cap = WA.store.sizeCaps()['stage.transitions'].cap;
    return (n === 5 && ok === 5 && n <= cap) ? 'transitions-bounded' : 'x:n:' + n + '/ok:' + ok;
  }
};

const N1 = [
  { k: 'pack',   p: PROBES.pPack,   okk: 'pack-named',       note: '自造玩法包也能采纳' },
  { k: 'adopt',  p: PROBES.pOnce,   okk: 'one-pack',         note: '一套包能被采纳两次' },
  { k: 'metric', p: PROBES.pMetric, okk: 'metric-declared',  note: '包外指标也能记' },
  { k: 'adv',    p: PROBES.pAdvance, okk: 'no-rewind',       note: '指标可以回卷' },
  { k: 'trig',   p: PROBES.pTrigger, okk: 'plan-complete',   note: '迁移不要触发条件' },
  { k: 'chg',    p: PROBES.pTrigger, okk: 'plan-complete',   note: '迁移不要迁移清单' },
  { k: 'thr',    p: PROBES.pThr,    okk: 'threshold-gated',  note: '门槛未达也能换阶段' },
  { k: 'appl',   p: PROBES.pApplied, okk: 'changes-first',   note: '清单未落实也能换阶段' },
  { k: 'off',    p: PROBES.pOff,    okk: 'off-refused',      note: '关闭时仍采纳' }
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
  a(ev.indexOf("'stage.transitions'") >= 0 && ev.indexOf("{ path: 'stage.metrics'") < 0
    && ev.indexOf("'stage.metrics': '写入侧硬上界") >= 0,
    'v2119/stage: [A1] transitions 走挤出站点；metrics 是**写入侧硬上界 + 对象映射**'
    + '（NON_EVICT 声明、SITES 不再登记）——v2.119.0 优化③：原先按 kind:array 登记 ⇒ 零调用站点'
    + '且 store.registryParity() 报类型错配（骨架为 metrics: {}）');
  a(st.indexOf("'stage.metrics'") >= 0 && st.indexOf("stage: { pack: '', stage: '', metrics: {}, transitions: [] }") >= 0,
    'v2119/stage: [A2] store 骨架物化 stage 且 __BOUNDED_CAPS 登记同键');
  a(ix.indexOf("'engines/stage.js'") >= 0 && rj.indexOf("'engines/stage.js'") >= 0,
    'v2119/stage: [A3] index.js / tests/run.js 两处 LOAD 都登记');
  a(td.indexOf("'engines/stage.js': 'stage'") >= 0, 'v2119/stage: [A4] tool-diag MODULE_EXPORTS 登记');
  a(inj.indexOf("'region', 'stage'") >= 0 && inj.indexOf('vis.stage && WA.stage') >= 0
    && inj.indexOf("'玩法进度'") >= 0, 'v2119/stage: [A5] 注入源表与注入分支同批登记');
  a(pn.indexOf("stage: '玩法进度'") >= 0, 'v2119/stage: [A6] 面板显示名登记');
  a(td.indexOf("'wa-st-adopt'") >= 0 && td.indexOf("'wa-st-out'") >= 0,
    'v2119/stage: [A7] 守卫表登记控件');
  a(src.indexOf('enabled: false, maxMetrics: 24, maxTransitions: 12') >= 0,
    'v2119/stage: [A8] 总开关默认关');
  a(src.indexOf('const PACKS = {') >= 0 && src.indexOf('unknown-pack') >= 0,
    'v2119/stage: [A9] 玩法包具名（不能凭空发明一套玩法）');
  a(src.indexOf('WA.registerModule(') >= 0 && src.indexOf('engines/stage.js') >= 0,
    'v2119/stage: [A10] 模块自注册');
  a(src.indexOf('missing-trigger') >= 0 && src.indexOf('missing-changes') >= 0,
    'v2119/stage: [A11] 条件与清单两条前置门都在');
  a(src.indexOf("reason: 'threshold-unmet'") >= 0 && src.indexOf("reason: 'change-not-applied'") >= 0,
    'v2119/stage: [A12] 门槛与清单两种拒收都在');
  a(src.indexOf('not-advancing') >= 0 && src.indexOf('d <= 0') >= 0,
    'v2119/stage: [A13] 指标单调递增（成就不可回卷）');
  a(src.indexOf('autoStage') < 0 && src.indexOf('autoTransit') < 0,
    'v2119/stage: [A14] 无「自动换阶段 / 自动采纳」路径');
  a(src.indexOf('ready') >= 0 && src.indexOf('未达条件的变动尚未发生') >= 0,
    'v2119/stage: [A15] 注入只报已达条件的迁移（不剧透）');
  Object.keys(PROBES).forEach(function (k) {
    const got = probeClean(PROBES[k]);
    a(isOk(got), 'v2119/stage: [B] 原版可用 :: ' + k + '（实 ' + got + '）');
  });
  const W = mkW(null);
  const ad = W.stage.adopt('冒险');
  a(ad.ok === true && ad.stage === '启程' && ad.metrics.join('/') === '里程/声望'
    && ad.stages.join('/') === '启程/深入/归返', 'v2119/stage: [C] 采纳得阶段与指标声明');
  const m1 = W.stage.mark('里程', 1);
  const m2 = W.stage.mark('里程', 2);
  a(m1.ok === true && m2.ok === true && m2.before === 1 && m2.value === 3, 'v2119/stage: [C] 指标累加');
  const p1 = W.stage.plan({ to: '深入', metric: '里程', need: 3, changes: ['场景种子', '信息边界'] });
  a(p1.ok === true && p1.from === '启程' && p1.changes.length === 2, 'v2119/stage: [C] 声明迁移记下条件与清单');
  const v1 = W.stage.view();
  a(v1.ok === true && v1.pending.length === 1 && v1.pending[0].ready === true
    && v1.pending[0].have === 3, 'v2119/stage: [C] 读侧当场答「够不够推进」');
  const bb1 = W.stage.buildBlock();
  a(bb1.indexOf('已达条件') >= 0 && bb1.indexOf('场景种子') >= 0, 'v2119/stage: [C] 可推进的迁移进正文');
  const t1 = W.stage.transit(p1.id, { applied: ['场景种子', '信息边界'] });
  a(t1.ok === true && t1.from === '启程' && t1.to === '深入', 'v2119/stage: [C] 清单落实后才换阶段');
  const v2 = W.stage.view();
  a(v2.stage === '深入' && v2.pending.length === 0 && v2.done.length === 1
    && v2.done[0].applied.length === 2, 'v2119/stage: [C] 已走的迁移留痕');
  const t2 = W.stage.transit(p1.id, { applied: ['场景种子', '信息边界'] });
  a(t2.ok === false && t2.reason === 'already-transited', 'v2119/stage: [C] 同一迁移不得换两次');
  const caps = W.store.sizeCaps();
  a(caps['stage.metrics'].cap === 24 && caps['stage.transitions'].cap === 12, 'v2119/stage: [C] 容量登记可见');
  const arr = [];
  for (let i = 0; i < 16; i++) arr.push({ i: i });
  const rr = W.evict.array(arr, 'stage.transitions', 12);
  a(rr.ok && rr.dropped === 4 && arr.length === 12, 'v2119/stage: [C] 站点「声明即执行」实测通过');
  const before = JSON.stringify(W.store.get().stage);
  W.stage.view(); W.stage.statView(); W.stage.buildBlock(); W.stage.stagesOf('冒险'); W.stage.metricsOf('冒险');
  a(JSON.stringify(W.store.get().stage) === before, 'v2119/stage: [C] 读取路径不写盘');
}
function runNegative(a) {
  a(BROKEN.length === 9 && new Set(BROKEN.map(function (x) { return x.key; })).size === 9,
    'v2119/stage: [N0] 破坏面覆盖 9 个互异锚点（实 ' + BROKEN.length + '）');
  BROKEN.forEach(function (s) {
    a(anchorHits(s) === 1, 'v2119/stage: [N0] 锚点在真源码中恰 1 次 :: ' + s.key);
  });
  N1.forEach(function (it) {
    const got = probeWith(BROKEN[B[it.k]], it.p);
    a(got !== it.okk, 'v2119/stage: [N1] ' + it.note + '（缺口复现；实测 ' + got + '）');
  });
  Object.keys(PROBES).forEach(function (k) {
    const got = probeClean(PROBES[k]);
    a(isOk(got), 'v2119/stage: [N2] 原版成立 :: ' + k + '（实 ' + got + '）');
  });
  a(probeWith(BROKEN[B['metric']], PROBES.pThr) === 'threshold-gated', 'v2119/stage: [N3] 破坏指标准入不影响门槛');
  a(probeWith(BROKEN[B['thr']], PROBES.pApplied) === 'changes-first', 'v2119/stage: [N3] 破坏门槛不影响清单落实');
  a(probeWith(BROKEN[B['adv']], PROBES.pOnce) === 'one-pack', 'v2119/stage: [N3] 破坏单调递增不影响一包一次');
  a(probeWith(BROKEN[B['pack']], PROBES.pMetric) === 'metric-declared', 'v2119/stage: [N3] 破坏包准入门不影响指标声明');
  const okv = probeClean(PROBES.pThr);
  const badv = probeWith(BROKEN[B['thr']], PROBES.pThr);
  a(okv !== badv && okv === 'threshold-gated',
    'v2119/stage: [N4] 门槛判据非恒真（原版 ' + okv + ' / 破坏 ' + badv + '）');
  const ok2 = probeClean(PROBES.pApplied);
  const bad2 = probeWith(BROKEN[B['appl']], PROBES.pApplied);
  a(ok2 !== bad2 && ok2 === 'changes-first',
    'v2119/stage: [N4] 清单落实判据非恒真（原版 ' + ok2 + ' / 破坏 ' + bad2 + '）');
  const ok3 = probeClean(PROBES.pAdvance);
  const bad3 = probeWith(BROKEN[B['adv']], PROBES.pAdvance);
  a(ok3 !== bad3 && ok3 === 'no-rewind',
    'v2119/stage: [N4] 不可回卷判据非恒真（原版 ' + ok3 + ' / 破坏 ' + bad3 + '）');
}
function runAll(a) { judge(a); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('STAGE-V2119: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('STAGE-V2119: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits,
  PROBES: PROBES, mkW: mkW, probeClean: probeClean, probeWith: probeWith };

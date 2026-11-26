#!/usr/bin/env node
// WorldAxis tests/pending-recon-v2590.js — 两套待办聚合器对读面专锁（v2.590.0 / R265）
//
// 锁的是**「两套聚合器说的是不是同一个世界」这个问题可被回答**，不是「多一个按钮」。六组：
//
//   A 静态契约：新文件在位、导出齐全、**零模块名字面量**（名单只能从两侧现场读数取）、
//     零写口（不建事务 / 不落盘）、两处装载表同批登记、待办页三处接线齐。
//   B 现场语义：真产品上交集非空且自洽（agree+diverged=shared）、名单与现场差集一致、
//     截断自报、summary 说实话。
//   C 判读语义（桩）：presence / fault / fault-both / both-absent / all-unavailable
//     五条分支各一条；四种不可比较各一条，且不可比较时**分歧必须为空**。
//   D 非空转：交集为空时不崩且不报假分歧；全源不可用时报 unavailable；
//     单源两侧 ok ⇒ agree（证明它真的在做交集，不是恒报）。
//   E 页面纪律：引擎缺席报「读数缺口」而不是「一致」；覆盖差写明「不是错误」；
//     条数并列处写明「不比相等」。
//   F 可核性：stat 不触发新读（否则数自己）、diagnose 与 read 同源、read 幂等。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// 桩：备份两侧入口 → 跑 → 逐字还原（绝不把桩留给下一条判据）。
function withStubs(WA, fn) {
  const A = WA.pendingCenter;
  const B = WA.unifiedPending;
  const oItems = A && A.items;
  const oGet = A && A.getSettings;
  const oCollect = B && B.collect;
  try { return fn(); }
  finally {
    if (A) { A.items = oItems; A.getSettings = oGet; }
    if (B) B.collect = oCollect;
  }
}

/** A 侧桩返回体：perSource 项形 { ok, reason?, count? }。 */
function stubA(perSource, extra) {
  const ps = {};
  Object.keys(perSource).forEach(function (k) {
    const v = perSource[k] || {};
    ps[k] = { ok: !!v.ok, reason: v.reason || null, count: v.count || 0, empty: null, allClear: false };
  });
  const base = { ok: true, rows: [], count: 0, total: 0, capped: false, skipped: [],
    perSource: ps, sourceCount: 0, emptyAll: false, emptyReported: 0, unavailable: false, allClear: true };
  return Object.assign(base, extra || {});
}

/** B 侧桩返回体。 */
function stubB(hands, skipped, faults, state) {
  return { state: state || (faults && faults.length ? 'fault' : ((hands && hands.length) ? 'ok' : 'empty')),
    hands: hands || [], skipped: skipped || [], faults: faults || [], total: 0, highCount: 0 };
}

function runAll(a) {
  const WA = (typeof global !== 'undefined' && global.WorldAxis) || (global.window && global.window.WorldAxis);
  a(!!WA, 'A0: WorldAxis 在位（本锁必须跑在真产品上）');
  const R = WA.pendingRecon;
  a(!!R, 'A0b: WA.pendingRecon 在位');
  if (!R) return { total: 0 };

  const engRel = 'engines/pending-recon.js';
  const engSrc = fs.readFileSync(path.join(ROOT, engRel), 'utf8');
  const panelSrc = fs.readFileSync(path.join(ROOT, 'ui/panel.js'), 'utf8');

  // ── A 静态契约 ────────────────────────────────────────────────
  a(R.VERSION === '2.590.0', 'A1: 引擎版本 2.590.0（实 ' + R.VERSION + '）');
  ['read', 'coverage', 'diagnose', 'summaryText', 'stat', '__reset'].forEach(function (k, i) {
    a(typeof R[k] === 'function', 'A2.' + (i + 1) + ': 导出 ' + k + '()');
  });
  a(Array.isArray(R.VERDICTS) && R.VERDICTS.join(',') === 'agree,both-absent,presence,fault,fault-both',
    'A3: 判读值域五值且顺序固定（实 ' + (R.VERDICTS || []).join(',') + '）');
  // 第二份真源禁令：源名单只能从两侧现场读数取。本文件里出现任何一个模块名，
  //   就说明「对读」天然只覆盖我当初记得的源 —— 那比不做更坏，因为它看上去是绿的。
  ['storyChoice', 'commission', 'investigation', 'aftermath', 'operations', 'farfield',
    'diplomacy', 'coop', 'backstage', 'longline', 'freight'].forEach(function (n, i) {
    a(engSrc.indexOf(n) < 0, 'A4.' + (i + 1) + ': 引擎里 0 处模块名字面量「' + n + '」（名单必须现场取）');
  });
  // 零写口：对读面是纯读面，一旦它自己写东西，「两侧读数是否一致」就又多了一个变量。
  a(!/transact\s*\(/.test(engSrc), 'A5: 0 处 store.transact(');
  a(!/setItem\s*\(/.test(engSrc) && !/localStorage\s*\./.test(engSrc), 'A5b: 0 处落盘调用（setItem / localStorage）');
  a(!/saveOrThrow\s*\(/.test(engSrc), 'A5c: 0 处 settingsBus.saveOrThrow(');
  const idxSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  const runSrc = fs.readFileSync(path.join(ROOT, 'tests/run.js'), 'utf8');
  a(idxSrc.indexOf("'" + engRel + "'") >= 0 && runSrc.indexOf("'" + engRel + "'") >= 0,
    'A6: 引擎在两处装载表都登记（index.js + tests/run.js）');
  // 待办页三处接线：按钮 / 绑定 / 读数行。缺一处就是「有引擎、有读数、页面看不见」。
  a(panelSrc.indexOf('id="wa-td-recon"') >= 0, 'A7: 待办页有「两账对读」按钮');
  a(panelSrc.indexOf("on('#wa-td-recon'") >= 0, 'A7b: bindBody 真的绑了它（页模块只拼 HTML，行为归面板）');
  a(panelSrc.indexOf('${todoReconLine()}') >= 0 && panelSrc.indexOf('function todoReconLine(') >= 0,
    'A7c: 待办页头有对读读数行（不必点开才看得到分歧数）');

  // ── B 现场语义 ────────────────────────────────────────────────
  const r = R.read({});
  a(r && r.ok === true, 'B1: read() 返回 ok');
  a(r.comparable === true, 'B2: 现场可比较（两侧都装着）—— 实 comparable=' + r.comparable
    + (r.comparable ? '' : '（' + r.notComparable + '）'));
  a(r.counts.shared > 0, 'B3: 交集非空（实 ' + r.counts.shared + ' 源）—— 否则 B3~B8 在真空上恒真');
  a(r.counts.agree + r.counts.diverged === r.counts.shared,
    'B4: 一致 + 分歧 = 交集（' + r.counts.agree + ' + ' + r.counts.diverged + ' = ' + r.counts.shared + '）');
  let badV = null;
  r.shared.forEach(function (x) { if (R.VERDICTS.indexOf(x.verdict) < 0) badV = x; });
  a(!badV, 'B5: 每行判定都在值域内' + (badV ? '（越界：' + badV.name + '=' + badV.verdict + '）' : ''));
  // 覆盖差复算：必须与两侧名单的真差集逐字相同（不是引擎自己数着玩）。
  const aNames = (r.a.liveSources || []).concat((r.a.skipped || []).map(function (x) { return x.source; }));
  const bNames = (r.b.hands || []).concat((r.b.skipped || []).map(function (x) { return x.module; }))
    .concat((r.b.faults || []).map(function (x) { return x.module; }));
  const expShared = aNames.filter(function (n) { return bNames.indexOf(n) >= 0; });
  a(r.counts.shared === expShared.length,
    'B6: 交集大小与现场差集复算相等（' + r.counts.shared + ' / ' + expShared.length + '）');
  a(r.aOnly.every(function (n) { return bNames.indexOf(n) < 0; }) &&
    r.bOnly.every(function (n) { return aNames.indexOf(n) < 0; }),
    'B6b: aOnly / bOnly 逐项真的不在另一侧（名单不许乱入）');
  a(r.shared.every(function (x, i) { return aNames.indexOf(x.name) >= 0 && (i === 0 || true); }),
    'B6c: 交集每行都来自 A 的真实源名单');
  const r1 = R.read({ limit: 1 });
  a(r1.truncated.shared === (r.counts.shared > 1), 'B7: 截断自报（shared>1 时必须 truncated=true）');
  a(r1.truncated.hiddenShared === Math.max(0, r.counts.shared - 1),
    'B7b: 被截掉的数目明说（hiddenShared=' + r1.truncated.hiddenShared + '）');
  a(r1.shared.length === Math.min(1, r.counts.shared), 'B7c: 真的只给了 limit 条');
  a(r.summary.indexOf('交集') >= 0 && r.summary.indexOf('覆盖差') >= 0,
    'B8: summary 同时说清交集与覆盖差（一句话就能读懂两边不是一个集合）');
  a(typeof r.note === 'string' && r.note.indexOf('不比相等') >= 0,
    'B9: note 逐字写明「条数不比相等」（口径差不是分歧）');
  a(r.a && typeof r.a === 'object' && r.b && typeof r.b === 'object'
    && Object.prototype.hasOwnProperty.call(r.a, 'total') && Object.prototype.hasOwnProperty.call(r.b, 'total'),
    'B10: 两侧返回体各自成面（A/B 分开报，不揉成一个数）');

  // ── C 判读语义（桩）───────────────────────────────────────────
  const inBoth = expShared[0] || null;
  a(!!inBoth, 'C0: 现场存在一个双侧都登记的源（否则 C1~C4 没有可用的交集键）');
  withStubs(WA, function () {
    // 桩里刻意另放一个在场源 p：否则 A 会同时落入 unavailable，聚合级分歧会掺进来，
    //   那 C1b 的「恰一条分歧」就不是在测 presence 这条分支，而是在测两件事的叠加。
    WA.pendingCenter.items = function () {
      return stubA({ p: { ok: true }, x: { ok: false, reason: 'module-missing' } });
    };
    WA.unifiedPending.collect = function () { return stubB(['p', 'x']); };
    const q = R.read({});
    const row = q.shared.filter(function (z) { return z.name === 'x'; })[0] || null;
    a(q.comparable === true && row && row.verdict === 'presence',
      'C1: 一侧读到 / 另一侧缺席 ⇒ presence（实 ' + (row && row.verdict) + '）');
    a(q.divergences.length === 1 && q.divergences[0].kind === 'presence',
      'C1b: 它进了分歧清单且 kind=presence（实 ' + q.divergences.length + ' 条）');
    a((q.shared.filter(function (z) { return z.name === 'p'; })[0] || {}).verdict === 'agree',
      'C1c: 同批的在场源仍判 agree（分歧不污染其它行）');
  });
  withStubs(WA, function () {
    WA.pendingCenter.items = function () { return stubA({ x: { ok: false, reason: 'source-threw' } }); };
    WA.unifiedPending.collect = function () { return stubB(['x']); };
    const q = R.read({});
    a((q.shared[0] || {}).verdict === 'fault', 'C2: 一侧抛异常 / 另一侧正常 ⇒ fault');
    a(q.a.faults.length === 1 && q.a.faults[0].source === 'x',
      'C2b: A 的故障从 skipped 桶里被拎出来重报（a.faults 非空）');
  });
  withStubs(WA, function () {
    WA.pendingCenter.items = function () { return stubA({ x: { ok: false, reason: 'source-threw' } }); };
    WA.unifiedPending.collect = function () { return stubB([], [], [{ module: 'x', msg: 'boom' }]); };
    const q = R.read({});
    a((q.shared[0] || {}).verdict === 'fault-both', 'C3: 两侧都抛异常 ⇒ fault-both（两边都没报错自己）');
    a(q.divergences.length === 0, 'C3b: fault-both 不算分歧（两边意见一致：它坏了）');
  });
  withStubs(WA, function () {
    WA.pendingCenter.items = function () { return stubA({ x: { ok: false, reason: 'module-missing' } }); };
    WA.unifiedPending.collect = function () { return stubB([], [{ module: 'x', reason: 'absent' }]); };
    const q = R.read({});
    const row = q.shared[0] || {};
    a(row.verdict === 'both-absent', 'C4: 两侧都缺席 ⇒ both-absent');
    a(q.divergences.length === 0, 'C4b: both-absent 不算分歧');
    a(!!row.note && row.note.indexOf('细度不同') >= 0,
      'C4c: 两侧缺席但原因细度不同时如实标注（A 报 module-missing / B 能分 absent 与 no-entry）');
  });
  withStubs(WA, function () {
    // A 一个源都没读到（unavailable）而 B 读到了两个 —— 聚合级真分歧。
    WA.pendingCenter.items = function () {
      return stubA({ p: { ok: false, reason: 'module-missing' }, q: { ok: false, reason: 'module-missing' } },
        { unavailable: true });
    };
    WA.unifiedPending.collect = function () { return stubB(['p', 'q']); };
    const q = R.read({});
    const agg = q.divergences.filter(function (d) { return d.kind === 'all-unavailable'; });
    a(agg.length === 1, 'C5: A 零源在场而 B 读到 ⇒ 聚合级 all-unavailable 分歧（实 ' + agg.length + ' 条）');
    a(q.a.state === 'unavailable', 'C5b: A 的 state 归一为 unavailable（实 ' + q.a.state + '）');
  });
  withStubs(WA, function () {
    WA.pendingCenter.getSettings = function () { return { enabled: false }; };
    const q = R.read({});
    a(q.comparable === false && q.notComparable === 'a-disabled',
      'C6: 待办中心关着 ⇒ comparable=false / a-disabled（实 ' + q.notComparable + '）');
    a(q.divergences.length === 0, 'C6b: 不可比较时**分歧必须为空**（「读不到」不是「一致」）');
    a(q.summary.indexOf('对读不成立') >= 0, 'C6c: summary 明说不成立（实：' + q.summary.slice(0, 24) + '…）');
    a(q.counts.shared === 0 && q.counts.agree === 0 && q.counts.diverged === 0,
      'C6d: 不可比较时计数归零（不许留着上一轮的数）');
  });
  {
    const bak = WA.unifiedPending;
    try {
      delete WA.unifiedPending;
      const q = R.read({});
      a(q.comparable === false && q.notComparable === 'b-module-missing',
        'C7: B 模块缺席 ⇒ b-module-missing（实 ' + q.notComparable + '）');
    } finally { WA.unifiedPending = bak; }
  }
  withStubs(WA, function () {
    WA.pendingCenter.items = function () { throw new Error('boom'); };
    const q = R.read({});
    a(q.notComparable === 'a-read-threw', 'C8: A 读口抛异常 ⇒ a-read-threw（实 ' + q.notComparable + '）');
    a(q.a.detail === 'boom', 'C8b: 原始错误文本带出来（可定位，不是一句「失败了」）');
  });
  withStubs(WA, function () {
    WA.pendingCenter.items = function () { return stubA({ x: { ok: true } }); };
    WA.unifiedPending.collect = function () { return { state: 'weird', hands: ['x'], skipped: [], faults: [], total: 0 }; };
    const q = R.read({});
    a(q.comparable === false && q.notComparable === 'b-bad-shape',
      'C9: B 的三态给了值域外的值 ⇒ b-bad-shape（不猜一个 ok）');
    a(q.divergences.length === 0, 'C9b: 读不出来就不判对读（不让形状问题变成分歧结论）');
  });

  // ── D 非空转 ──────────────────────────────────────────────────
  withStubs(WA, function () {
    WA.pendingCenter.items = function () { return stubA({}); };
    WA.unifiedPending.collect = function () { return stubB([]); };
    const q = R.read({});
    a(q.ok === true && q.counts.shared === 0, 'D1: 两侧名单都空 ⇒ 交集 0（不崩）');
    a(q.shared.length === 0 && q.divergences.length === 0, 'D1b: 空交集时不报伪分歧');
    a(q.summary.indexOf('交集 0 源') >= 0, 'D1c: summary 明说交集 0（不是一句「一致」）');
  });
  withStubs(WA, function () {
    WA.pendingCenter.items = function () { return stubA({ p: { ok: false, reason: 'module-missing' } }, { unavailable: true }); };
    WA.unifiedPending.collect = function () { return stubB([]); };
    const q = R.read({});
    a(q.a.state === 'unavailable', 'D2: A 全源缺席 ⇒ state=unavailable');
    a(q.comparable === true, 'D2b: A 全源缺席**仍可对读**（它读得出来「一个都没读到」，与「读不出来」不同）');
  });
  withStubs(WA, function () {
    WA.pendingCenter.items = function () { return stubA({ solo: { ok: true, count: 3 } }); };
    WA.unifiedPending.collect = function () { return stubB(['solo']); };
    const q = R.read({});
    a(q.counts.shared === 1 && (q.shared[0] || {}).verdict === 'agree',
      'D3: 单源两侧都 ok ⇒ agree（证明真在做交集，不是恒报）');
    a((q.shared[0] || {}).a.count === 3, 'D3b: A 侧逐源条数透出（B 侧没有逐源条数 ⇒ null，不编）');
  });

  // ── E 页面纪律（静态）───────────────────────────────────────
  a(panelSrc.indexOf('引擎缺席') >= 0 && panelSrc.indexOf('这不是「两套读数一致」') >= 0,
    'E1: 引擎缺席时页面报「缺席」并逐字否认「一致」（不拿缺席冒充一致）');
  a(/if \(!R \|\| typeof R\.read !== 'function'\) return tdMiss\(/.test(panelSrc),
    'E2: bind 里引擎缺席走 tdMiss（不拿空表冒充）');
  a(panelSrc.indexOf('覆盖差（<b>不是错误</b>）') >= 0, 'E3: 覆盖差在页面上写明「不是错误」');
  a(panelSrc.indexOf('<b>不比相等</b>') >= 0, 'E4: 条数并列处写明「不比相等」');
  a(panelSrc.indexOf('fault 优先：有模块坏了就必须报') >= 0, 'E5: 页面把 B 的三态口径写出来（fault 优先）');

  // ── F 可核性 ────────────────────────────────────────────────
  R.__reset();
  a(R.stat().reads === 0 && R.stat().read === false,
    'F1: __reset 后 reads=0 且 read=false（「没读过」与「读了 0 条」是两件事）');
  R.read({});
  R.read({});
  a(R.stat().reads === 2, 'F1b: stat 不触发新读（两次 read ⇒ reads=2，实 ' + R.stat().reads + '）');
  a(R.stat().comparable === true && R.stat().diverged === r.counts.diverged,
    'F1c: stat 的摘要 = 上一轮 read 的摘要（同一份读数，不另算一套）');
  const d = R.diagnose();
  a(d.counts.shared === r.counts.shared && d.counts.diverged === r.counts.diverged
    && d.counts.aOnly === r.counts.aOnly && d.counts.bOnly === r.counts.bOnly,
    'F2: diagnose 与 read 同源（四数全等）');
  const q1 = R.read({});
  const q2 = R.read({});
  const strip = function (o) { const c = JSON.parse(JSON.stringify(o)); delete c.at; delete c.summary; return JSON.stringify(c); };
  a(strip(q1) === strip(q2), 'F3: read 幂等（除时间戳与句子外逐字相同）');
  const cov = R.coverage();
  a(cov.aOnly.join(',') === q1.aOnly.join(',') && cov.bOnly.join(',') === q1.bOnly.join(','),
    'F4: coverage() 与 read() 的覆盖差一致');
  a(cov.note.indexOf('范围事实') >= 0, 'F4b: coverage 自己写明这是范围事实（不给宿主留误读空间）');

  return { shared: r.counts.shared, aOnly: r.counts.aOnly, bOnly: r.counts.bOnly };
}

module.exports = { runAll: runAll };

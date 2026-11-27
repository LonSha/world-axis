/**
 * WorldAxis tests/time-axis-bridge-v2604.js (v2.604.0) — TLX-1 专锁
 *
 * 锁什么：`WA.timeAxisBridge` 真的能看见「两个今天」，而且**不靠调用被读方的计算函数**。
 * 本锁的三条核心判据：
 *   ① D 组：`calendarPlan.label` / `undercurrentCalendar.build` 一旦被调就 throw ——
 *      它们的 `stat.labels` / `stat.builds` 会变，体检不能改现场。
 *   ② F 组：四处口径的**源码原文**必须与桥里 ORIGINS 写的一致（基变了桥没改 ⇒ 红）。
 *   ③ E 组：`clock.label` 是用户可编辑的自由文本，桥只能回解析出的日号，不许回显原串。
 */
(function () {
  'use strict';
  const assert = require('assert');
  const fs = require('fs');
  const path = require('path');
  const BASE = path.join(__dirname, '..');

  let pass = 0, fail = 0;
  function ok(name, fn) {
    try { fn(); pass++; console.log('  \u2713 ' + name); }
    catch (e) { fail++; console.log('  X ' + name + '\n      ' + (e && e.message)); }
  }

  global.window = global.window || {};
  const W = global.window.WorldAxis = global.window.WorldAxis || {};
  // 先给一个可控的 store 桩，再按真实装载顺序引入四台被读方
  W.store = {
    _s: { clock: { iso: '', label: '', dayIndex: 0, source: 'unset' } },
    get() { return this._s; },
    transact(fn) { return fn(this._s); }
  };
  require(path.join(BASE, 'engines/calendar.js'));
  require(path.join(BASE, 'engines/calendar-custom.js'));
  require(path.join(BASE, 'engines/undercurrent-calendar.js'));
  require(path.join(BASE, 'engines/time-axis-bridge.js'));

  const B = W.timeAxisBridge;
  const CP = W.calendarPlan;
  const UC = W.undercurrentCalendar;

  function setClock(dayIndex, label) {
    W.store._s.clock = { iso: '', label: label == null ? '' : label, dayIndex: dayIndex, source: 'test' };
  }
  function resetAll() { B.__reset(); setClock(0, ''); }

  /** 把「会改 stat 的计算函数」换成炸弹：被调即 throw 并计数。 */
  function bomb() {
    const fired = { planLabel: 0, planNow: 0, ucBuild: 0, ucGetBase: 0, setClock: 0 };
    const keep = { label: CP.label, labelNow: CP.labelNow, build: UC.build };
    CP.label = function () { fired.planLabel++; throw new Error('calendarPlan.label 被调了'); };
    CP.labelNow = function () { fired.planNow++; throw new Error('calendarPlan.labelNow 被调了'); };
    UC.build = function () { fired.ucBuild++; throw new Error('undercurrentCalendar.build 被调了'); };
    const restore = function () { CP.label = keep.label; CP.labelNow = keep.labelNow; UC.build = keep.build; };
    return { fired: fired, restore: restore };
  }

  console.log('\nA 导出面与常量\n');
  ok('A1 导出面恰为约定的 15 个键', function () {
    const want = ['NAME', 'ORIGINS', 'VERDICT', 'WHY', '__reset', 'audit', 'diagnose', 'faults', 'lineOf', 'origin', 'readings', 'skew', 'stat', 'summaryText', 'version'];
    assert.deepStrictEqual(Object.keys(B).sort(), want.sort());
  });
  ok('A2 八值 verdict / 四值 why 与设计一致', function () {
    assert.deepStrictEqual(B.VERDICT.slice(), ['module-missing', 'no-store', 'drift', 'clock-unset', 'derived-absent', 'skewed', 'aligned', 'ok']);
    assert.deepStrictEqual(B.WHY.slice(), ['ok', 'module-missing', 'no-store', 'drift']);
  });
  ok('A3 ORIGINS 四条、基约定 0/1/0/1（与源码同源，F 组逐条核）', function () {
    const o = B.ORIGINS.slice();
    assert.strictEqual(o.length, 4);
    assert.deepStrictEqual(o.map(function (x) { return x.src; }),
      ['clock.dayIndex', 'clock.label', 'calendarPlan.label', 'undercurrent.baseDay']);
    assert.deepStrictEqual(o.map(function (x) { return x.base; }), [0, 1, 0, 1]);
  });
  ok('A4 版本口径与引擎面一致：VERSION 是**引入版本**（≤ manifest），且与源码头部同源', function () {
    // ⚠ v2.605.0 自纠：本条原写 `B.version === manifest.version`——把「引入版本」当成了「当前版本」。
    //   它与引擎面的既有口径**相反**：本仓 97 个引擎都把 `VERSION` 写成自己的引入版本
    //   （2.330.0 / 2.380.0 / 2.524.0 …），不跟着仓库升。后果实测：R279 把仓库升到 2.604.0 之后，已完成的 CAL 面
    //   的 A4 静默转红（它单跑才能看见）—— 判据自己制造了一个「每升一版就多一条红」的面。
    //   现口径三条：形态合法 / 不高于 manifest（不许谎报未来版本）/ 与本源码头部注释同源。
    const mf = JSON.parse(fs.readFileSync(path.join(BASE, 'manifest.json'), 'utf8'));
    const le = function (a, b) {
      const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
      for (let k = 0; k < 3; k += 1) { if (pa[k] !== pb[k]) return pa[k] < pb[k]; }
      return true;
    };
    assert.ok(/^\d+\.\d+\.\d+$/.test(B.version), 'VERSION 形态不合法：' + B.version);
    assert.ok(le(B.version, mf.version), 'VERSION 高于 manifest（谎报未来版本）：' + B.version + ' > ' + mf.version);
    const head = fs.readFileSync(path.join(BASE, 'engines/time-axis-bridge.js'), 'utf8').split('\n')[1] || '';
    assert.ok(head.indexOf(B.version) >= 0, '与源码头部注释不同源（头部：' + head.trim().slice(0, 70) + '）');
  });

  console.log('\nB 逐源读数\n');
  ok('B1 世界钟未走（dayIndex 0 / 无标签）：label 不 present、plan 因无月表失败、ucSkew 0', function () {
    resetAll();
    const r = B.readings();
    assert.strictEqual(r.clockDay, 0);
    assert.strictEqual(r.label.present, false);
    assert.strictEqual(r.labelSkew, null);
    assert.strictEqual(r.plan.ok, false);
    assert.strictEqual(r.plan.why, 'no-months');
    assert.strictEqual(r.ucBaseDay, 1);
    assert.strictEqual(r.ucSkew, 0, '无标签时两边都从 +1 起，此刻应同基');
  });
  ok('B2 第 1 日且标签「第1日」：ucSkew = +1（本轮的核心实锤）', function () {
    resetAll(); setClock(1, '第1日');
    const r = B.readings();
    assert.strictEqual(r.clockDay, 1);
    assert.strictEqual(r.label.num, 1);
    assert.strictEqual(r.labelSkew, 0, '标签与整数日应一致');
    assert.strictEqual(r.ucBaseDay, 2);
    assert.strictEqual(r.ucShown, 1);
    assert.strictEqual(r.ucSkew, 1, '暗流内部算 2、面子说 1 —— 这就是差的那一天');
  });
  ok('B3 第 7 日：标签对得上，但 ucSkew 仍恒 1（不是偶然）', function () {
    resetAll(); setClock(7, '第7日');
    const r = B.readings();
    assert.strictEqual(r.labelSkew, 0);
    assert.strictEqual(r.ucSkew, 1);
  });
  ok('B4 手写标签与 dayIndex 不同步 ⇒ labelSkew ≠ 0（另一条独立缺口）', function () {
    resetAll(); setClock(5, '第9日·黄昏');
    const r = B.readings();
    assert.strictEqual(r.labelSkew, 4);
    // ucSkew = (dayIndex + 1) - 标签日号 = 6 - 9 = -3（不是 2 - 9：当天的基是 dayIndex+1，不是常量 2）
    assert.strictEqual(r.ucSkew, -3);
  });
  ok('B5 标签无法解析（自由文本）⇒ parsed=false，且记 label-unparsed 故障', function () {
    resetAll(); setClock(3, '第三纪·暗月望日');
    B.__reset();
    const r = B.readings();
    assert.strictEqual(r.label.present, true);
    assert.strictEqual(r.label.parsed, false);
    assert.strictEqual(r.labelSkew, null);
    const f = B.faults();
    assert.ok(f.known.some(function (x) { return x.code === 'label-unparsed'; }), '应记 label-unparsed');
  });
  ok('B6 dayIndex 非数 ⇒ 记 bad-type，且 clockDay 为 null 而非 0（0 是「一天没走」，null 是「写错了」）', function () {
    resetAll();
    W.store._s.clock = { iso: '', label: '第1日', dayIndex: 'abc', source: 'test' };
    B.__reset();
    const r = B.readings();
    assert.strictEqual(r.clockDay, null, '非数不许静默当成 0');
    assert.ok(B.faults().known.some(function (x) { return x.code === 'bad-type'; }));
  });
  ok('B7 有月表时折算与 engines/calendar-custom.js 的 label() 逐字相同（第 0 日 = 月1日1）', function () {
    const save = CP.getMonths;
    CP.getMonths = function () { return [{ name: 'a', days: 30 }, { name: 'b', days: 30 }]; };
    try {
      resetAll();
      const p0 = B.readings().plan;
      assert.strictEqual(p0.ok, true);
      assert.strictEqual(p0.monthIndex, 0);
      assert.strictEqual(p0.dayOfMonth, 1, '第 0 日应是月1的第1日（0 基）');
      assert.strictEqual(p0.year, 1);
      setClock(30, '第30日');
      const p30 = B.readings().plan;
      assert.strictEqual(p30.monthIndex, 1, '第 30 日应进第二个月');
      assert.strictEqual(p30.dayOfMonth, 1);
      setClock(60, '第60日');
      const p60 = B.readings().plan;
      assert.strictEqual(p60.year, 2, '满 60 日应进第二年');
      assert.strictEqual(p60.monthIndex, 0);
    } finally { CP.getMonths = save; }
  });
  ok('B8 月表有坏项 ⇒ plan 报 bad-value，不拿半份月表算出看似正确的日期', function () {
    const save = CP.getMonths;
    CP.getMonths = function () { return [{ name: 'a', days: 30 }, { name: 'b', days: 0 }]; };
    try {
      resetAll(); setClock(10, '第10日');
      const p = B.readings().plan;
      assert.strictEqual(p.ok, false);
      assert.strictEqual(p.why, 'bad-value');
    } finally { CP.getMonths = save; }
  });

  console.log('\nC 判定与优先级\n');
  ok('C1 现场（第 1 日）= drift，且 state 仍报 derived-absent（结构压运行态，但不丢运行态）', function () {
    resetAll(); setClock(1, '第1日');
    const a = B.audit();
    assert.strictEqual(a.verdict, 'drift');
    assert.strictEqual(a.state, 'derived-absent');
    assert.strictEqual(a.why, 'drift');
  });
  ok('C2 无 store ⇒ module-missing（与「clock 没初始化」分开）', function () {
    const save = W.store;
    try {
      delete W.store;
      assert.strictEqual(B.audit().verdict, 'module-missing');
      assert.strictEqual(B.audit().why, 'module-missing');
    } finally { W.store = save; }
  });
  ok('C3 store 在但无 clock ⇒ no-store（不是 module-missing）', function () {
    const save = W.store.get;
    try {
      W.store.get = function () { return {}; };
      const a = B.audit();
      assert.strictEqual(a.verdict, 'no-store');
      assert.strictEqual(a.why, 'no-store');
    } finally { W.store.get = save; }
  });
  ok('C4 clock-unset：dayIndex 0 且无标签', function () {
    resetAll();
    assert.strictEqual(B.audit().verdict, 'clock-unset', '无 drift 时应落到 clock-unset');
  });
  ok('C5 aligned：标签对上、月表在、ucSkew 被消掉（造一个基一致的场景）', function () {
    const save = CP.getMonths;
    CP.getMonths = function () { return [{ name: 'a', days: 30 }]; };
    try {
      // 拿不到「uncSkew=0 且有标签」的真场景（这正是缺口本身），所以只验 skew() 的形状
      resetAll(); setClock(1, '第1日');
      const s = B.skew();
      assert.strictEqual(s.ok, false, '有偏差时 skew.ok 应为 false');
      assert.strictEqual(s.uc, 1);
      assert.strictEqual(s.worst.src, 'undercurrent.baseDay');
      assert.strictEqual(s.vals.length, 2);
    } finally { CP.getMonths = save; }
  });
  ok('C6 skew 汇总与 readings 同源（两个出口不会不一样）', function () {
    resetAll(); setClock(4, '第4日');
    const r = B.readings();
    const s = B.skew();
    assert.strictEqual(s.label, r.labelSkew);
    assert.strictEqual(s.uc, r.ucSkew);
  });

  console.log('\nD 零调零写（本面的核心边界）\n');
  ok('D1 跑完全部读数，calendarPlan.label / labelNow、undercurrent.build 一个都没被调', function () {
    resetAll(); setClock(2, '第2日');
    B.__reset();
    const b = bomb();
    try {
      B.audit(); B.lineOf(); B.summaryText(); B.diagnose(); B.readings(); B.skew(); B.origin(); B.faults();
      assert.strictEqual(b.fired.planLabel, 0, 'calendarPlan.label 被调了（它会 stat.labels++）');
      assert.strictEqual(b.fired.planNow, 0, 'calendarPlan.labelNow 被调了');
      assert.strictEqual(b.fired.ucBuild, 0, 'undercurrent.build 被调了（它会 stat.builds++）');
    } finally { b.restore(); }
  });
  ok('D2 零写：不 setClock / 不 transact（存盘值前后逐字相等）', function () {
    resetAll(); setClock(6, '第6日');
    let transacts = 0;
    const saveTransact = W.store.transact;
    W.store.transact = function (fn) { transacts++; return saveTransact.call(W.store, fn); };
    const before = JSON.stringify(W.store._s);
    try {
      B.audit(); B.readings(); B.skew(); B.diagnose();
      assert.strictEqual(transacts, 0, '本面跑了 ' + transacts + ' 次 transact（写口）');
      assert.strictEqual(JSON.stringify(W.store._s), before, 'store 被改动了');
    } finally { W.store.transact = saveTransact; }
  });

  console.log('\nE 剧透面（不回显标签原串）\n');
  ok('E1 clock.label 里的剧情词一个字都不出现在读数里', function () {
    resetAll(); setClock(3, '第3日·SECRET-PLOT-NAME');
    const dump = JSON.stringify(B.readings()) + JSON.stringify(B.audit()) + B.lineOf();
    assert.strictEqual(dump.indexOf('SECRET-PLOT-NAME'), -1, '标签原串漏进了读数');
  });
  ok('E2 能解析时只回日号与布尔，不回原串长度之外的任何信息', function () {
    resetAll(); setClock(3, '第3日·SECRET-PLOT-NAME');
    const l = B.readings().label;
    assert.deepStrictEqual(Object.keys(l).sort(), ['num', 'parsed', 'present']);
    assert.strictEqual(l.num, 3);
    assert.strictEqual(l.parsed, true);
  });

  console.log('\nF 源口径钉住（基变了桥没改 ⇒ 红）\n');
  ok('F1 undercurrent-calendar 仍用 dayIndex + 1', function () {
    const src = fs.readFileSync(path.join(BASE, 'engines/undercurrent-calendar.js'), 'utf8');
    assert.ok(/const d = Math\.floor\(s\.clock\.dayIndex\) \+ 1;/.test(src), 'getBaseStoryDay 的 +1 已改 —— 桥的 ORIGINS 需同批跟位');
  });
  ok('F2 calendar.advanceDay 仍把 label 写成「第 day 日」且 dayIndex = day', function () {
    const src = fs.readFileSync(path.join(BASE, 'engines/calendar.js'), 'utf8');
    assert.ok(/const day = \(clock\.dayIndex \|\| 0\) \+ 1;/.test(src), 'advanceDay 的口径已改');
    assert.ok(/setClock\('\u7b2c' \+ day \+ '\u65e5'/.test(src), 'advanceDay 的标签写法已改');
  });
  ok('F3 calendar-custom 的 label 仍以 dayIndex 原值为 0 基（n = Number(dayIndex)）', function () {
    const src = fs.readFileSync(path.join(BASE, 'engines/calendar-custom.js'), 'utf8');
    assert.ok(/const n = Number\(dayIndex\);/.test(src), 'label 的入参口已改');
    assert.ok(/const year = Math\.floor\(n \/ total\) \+ 1;/.test(src), '年份折算已改');
  });
  ok('F4 桥自己仍是零写口（源文件里不出现 setClock / transact / setItem）', function () {
    const src = fs.readFileSync(path.join(BASE, 'engines/time-axis-bridge.js'), 'utf8');
    ['\.setClock(', '\.transact(', 'setItem(', '\.setSettings('].forEach(function (pat) {
      assert.strictEqual(src.indexOf(pat), -1, '桥里出现了写口：' + pat);
    });
  });

  console.log('\nG 一句话读数与诊断\n');
  ok('G1 lineOf 在 drift 时以「实锤」开头且点名差值', function () {
    resetAll(); setClock(1, '第1日');
    const s = B.lineOf();
    assert.strictEqual(s.indexOf('\u5b9e\u9524'), 0, '读数应以「实锤」开头，实际：' + s.slice(0, 20));
    assert.ok(s.indexOf('暗流日历') >= 0);
    assert.ok(/\+1/.test(s), '应点名 +1 这个差值');
  });
  ok('G2 lineOf 对 module-missing / no-store / clock-unset 各有专句', function () {
    const save = W.store;
    try {
      delete W.store;
      assert.ok(B.lineOf().indexOf('\u7f3a store') === 0);
    } finally { W.store = save; }
    const saveGet = W.store.get;
    try {
      W.store.get = function () { return {}; };
      assert.ok(B.lineOf().indexOf('store \u5728\u4f46\u6ca1\u6709 clock') === 0);
    } finally { W.store.get = saveGet; }
    resetAll();
    assert.ok(B.lineOf().indexOf('\u4e16\u754c\u949f\u4e00\u6b21\u6ca1\u8d70\u8fc7') === 0);
  });
  ok('G3 diagnose 给出「两边必有一边改基」这条修法（不指定改哪边）', function () {
    resetAll(); setClock(1, '第1日');
    const d = B.diagnose();
    const all = d.fixes.join(' | ');
    assert.strictEqual(d.verdict, 'drift');
    assert.ok(all.indexOf('getBaseStoryDay') >= 0);
    assert.ok(all.indexOf('dayIndex + 1') >= 0);
    assert.ok(/\u4e24\u8fb9\u5fc5\u6709\u4e00\u8fb9\u6539\u57fa|\u6216\u5728/.test(all), '应给出两条路而不是替人决定');
  });
  ok('G4 stat 计数随 audit 累加、__reset 归零、last 镜像平铺值', function () {
    B.__reset();
    assert.strictEqual(B.stat().audits, 0);
    resetAll(); setClock(1, '第1日');
    B.audit(); B.audit();
    const s = B.stat();
    assert.ok(s.audits >= 2);
    assert.ok(s.drift >= 2);
    assert.strictEqual(s.lastWhy, 'drift');
    assert.strictEqual(s.last.audits, s.audits);
    B.__reset();
    assert.strictEqual(B.stat().audits, 0);
  });

  console.log('\nTLX-1 专锁: ' + (fail ? 'FAIL ' + pass + ' / ' + (pass + fail) : 'pass (' + pass + ')'));
  if (fail) process.exit(1);
})();

/**
 * WorldAxis tests/calendar-custom-bridge-v2603.js (v2.603.0) — CAL-1 专锁
 *
 * 锁什么：`WA.calendarPlanBridge` 的读数是不是真的（而不是照着注释抄的）。
 * 核心三条实锤各自一条判据：
 *   ① 注释 ③ 承诺 `labelBack` 而导出表里没有（contract().missing）
 *   ② `DEF.enabled = true` 而边界 1 原文写「总开关默认关闭」（switches().contradict）
 *   ③ `clear()` 不看开关（bypass().unguarded = ['clear']）
 * ③ 是用 `Function.prototype.toString` 静态判的 —— 本锁要证它「判得出真假两种情形」，
 * 否则一个恒 true/恒 false 的实现也能全绿。
 *
 * 另加一条本锁特有的判据：**源口径不许漂**。
 * `engines/calendar-custom.js` 的注释原文（「总开关默认关闭」、`labelBack(dayIndex, atDay)`）
 * 是桥接里写死的那两个常量的事实依据；谁改了注释而没改桥接，本锁要红。
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
  require(path.join(BASE, 'engines/calendar-custom.js'));
  require(path.join(BASE, 'engines/calendar-custom-bridge.js'));
  const W = global.window.WorldAxis;
  const B = W.calendarPlanBridge;
  const ENG = W.calendarPlan;

  /**\u628a\u5f15\u64ce\u7684\u5199\u53e3\u5168\u6362\u6210\u6869\uff1a\u88ab\u8c03\u5c31\u8ba1\u6570\uff0c\u8ba9\u300c\u96f6\u8dd1\u300d\u53ef\u5b9e\u6d4b\u3002 */
  function stubEng() {
    const fired = { setMonths: 0, clear: 0, label: 0, labelNow: 0, setSettings: 0 };
    const keep = { setMonths: ENG.setMonths, clear: ENG.clear, label: ENG.label, labelNow: ENG.labelNow };
    ENG.setMonths = function () { fired.setMonths++; throw new Error('setMonths 被调了'); };
    ENG.clear = function () { fired.clear++; throw new Error('clear 被调了'); };
    ENG.label = function () { fired.label++; throw new Error('label 被调了'); };
    ENG.labelNow = function () { fired.labelNow++; throw new Error('labelNow 被调了'); };
    const restore = function () {
      ENG.setMonths = keep.setMonths; ENG.clear = keep.clear; ENG.label = keep.label; ENG.labelNow = keep.labelNow;
    };
    return { fired: fired, restore: restore };
  }

  console.log('\nA 导出面（15 导出 + version，只读）');
  ok('A1 导出面恰为约定的 16 个键（多一个少一个都算契约漂移）', function () {
    const want = ['CONTRACT', 'NAME', 'VERDICT', 'WHY', '__reset', 'audit', 'bypass', 'contract', 'diagnose', 'faults', 'lineOf', 'stat', 'summaryText', 'switches', 'table', 'version'];
    assert.deepStrictEqual(Object.keys(B).slice().sort(), want.slice().sort());
  });
  ok('A2 导出的是副本、且内部判断不读导出数组（外部 push 污染不了读数）', function () {
    assert.ok(Array.isArray(B.VERDICT) && Array.isArray(B.WHY) && Array.isArray(B.CONTRACT));
    assert.strictEqual(B.VERDICT.length, 8, 'VERDICT 起步就该是八值');
    assert.strictEqual(B.WHY.length, 4);
    assert.strictEqual(B.CONTRACT.length, 4);
    // 导出数组是副本：调用方 push 只会就地改自己拿到的那一份（这在本仓是已知取舍，
    // 不是 getter）—— 要紧的是**读数不受影响**。所以判据落在读数上，不落在数组长度上。
    B.VERDICT.push('zzz'); B.WHY.push('zzz'); B.CONTRACT.push('zzz');
    try {
      assert.strictEqual(B.audit().verdict, 'drift', '读数被导出数组污染了');
      assert.strictEqual(B.contract().promised.length, 4, 'contract().promised 走了导出数组而非内部常量');
      assert.strictEqual(B.CONTRACT.length, 5, '这份副本本身就该被改到 5（证明 push 落在副本上）');
    } finally { B.VERDICT.pop(); B.WHY.pop(); B.CONTRACT.pop(); }
    assert.strictEqual(B.VERDICT.length, 8, '复原后应回到八值');
  });
  ok('A3 八值 verdict / 四值 why / 四方法承诺 与设计一致', function () {
    assert.deepStrictEqual(B.VERDICT.slice(), ['module-missing', 'no-settings', 'drift', 'disabled', 'never-set', 'table-empty', 'unknown-only', 'ok']);
    assert.deepStrictEqual(B.WHY.slice(), ['ok', 'module-missing', 'no-settings', 'drift']);
    assert.deepStrictEqual(B.CONTRACT.slice(), ['setMonths', 'getMonths', 'label', 'labelBack']);
  });
  ok('A4 version 与仓内版本面同源', function () {
    const mf = JSON.parse(fs.readFileSync(path.join(BASE, 'manifest.json'), 'utf8'));
    assert.strictEqual(B.version, mf.version, 'version 与 manifest 不一致');
  });

  console.log('\nB 契约面（注释承诺 vs 导出表）\n');
  ok('B1 现场必缺 labelBack（注释 ③ 承诺了它）', function () {
    const c = B.contract();
    assert.strictEqual(c.ok, false);
    assert.deepStrictEqual(c.missing, ['labelBack']);
    assert.strictEqual(c.why, 'drift');
  });
  ok('B2 多出来的导出不算缺口，但要被列出来（extra 覆盖实际导出）', function () {
    const c = B.contract();
    ['getSettings', 'setSettings', 'labelNow', 'clear', 'stat'].forEach(function (k) {
      assert.ok(c.extra.indexOf(k) >= 0, k + ' 应在 extra 里');
    });
  });
  ok('B3 补上 labelBack 后 contract 转 ok（判据不是恒假）', function () {
    const save = ENG.labelBack;
    ENG.labelBack = function () { return { ok: false, reason: 'not-implemented' }; };
    try {
      const c = B.contract();
      assert.strictEqual(c.ok, true, '补上后仍报缺：判据恒假');
      assert.deepStrictEqual(c.missing, []);
      assert.strictEqual(c.why, 'ok');
    } finally { if (save === undefined) delete ENG.labelBack; else ENG.labelBack = save; }
  });
  ok('B4 引擎缺席时报 module-missing，且 missing 列满四个承诺', function () {
    const save = W.calendarPlan;
    try {
      delete W.calendarPlan;
      const c = B.contract();
      assert.strictEqual(c.why, 'module-missing');
      assert.strictEqual(c.missing.length, 4);
    } finally { W.calendarPlan = save; }
  });

  console.log('\nC 开关面（实现默认值 vs 文档口径）\n');
  ok('C1 现场默认值相反：实现 true / 文档 false / contradict=true', function () {
    const s = B.switches();
    assert.strictEqual(s.ok, true);
    assert.strictEqual(s.regs, 1, '\u5f15\u64ce\u5e94\u81ea\u6ce8\u518c\u4e00\u6761 __REG');
    assert.strictEqual(s.defEnabled, true);
    assert.strictEqual(s.docEnabledDefault, false);
    assert.strictEqual(s.contradict, true);
  });
  ok('C2 maxMonths 与 bounds 同源（48 / [1,128]）', function () {
    const s = B.switches();
    assert.strictEqual(s.maxMonths, 48);
    assert.deepStrictEqual(s.bounds, [1, 128]);
  });
  ok('C3 改默认值为 false 后 contradict 转假（判据不是恒真）', function () {
    const regs = W.__settingsRegs;
    const target = regs.filter(function (r) { return r && r.module === 'calendarPlan'; })[0];
    const saveDef = Object.assign({}, target.def);
    try {
      target.def.enabled = false;
      assert.strictEqual(B.switches().contradict, false, '把实现改成与文档一致后仍报相反：判据恒真');
    } finally { target.def.enabled = saveDef.enabled; }
  });
  ok('C4 无 __settingsRegs 条目时报 no-settings（与 never-set 分开）', function () {
    const save = W.__settingsRegs;
    try {
      W.__settingsRegs = save.filter(function (r) { return !r || r.module !== 'calendarPlan'; });
      const s = B.switches();
      assert.strictEqual(s.ok, false);
      assert.strictEqual(s.why, 'no-settings');
      assert.strictEqual(s.regs, 0);
    } finally { W.__settingsRegs = save; }
  });

  console.log('\nD 月表面（只报个数，不回显月名）\n');
  ok('D1 现场月表为空：count 0 / yearDays 0 / badItems 0', function () {
    const t0 = B.table();
    assert.strictEqual(t0.count, 0);
    assert.strictEqual(t0.yearDays, 0);
    assert.strictEqual(t0.badItems, 0);
    assert.strictEqual(t0.namesHidden, true);
  });
  ok('D2 正常月表：三项 / 一年 360 日', function () {
    const save = ENG.getMonths;
    ENG.getMonths = function () { return [{ name: '\u6697\u6708', days: 30 }, { name: '\u8840\u6708', days: 30 }, { name: '\u9ed1\u6708', days: 300 }]; };
    try {
      const t0 = B.table();
      assert.strictEqual(t0.count, 3);
      assert.strictEqual(t0.yearDays, 360);
      assert.strictEqual(t0.badItems, 0);
    } finally { ENG.getMonths = save; }
  });
  ok('D3 坏项（0 / 负 / 小数）计入 badItems 且不进 yearDays', function () {
    const save = ENG.getMonths;
    ENG.getMonths = function () { return [{ name: 'a', days: 0 }, { name: 'b', days: -5 }, { name: 'c', days: 1.5 }, { name: 'd', days: 10 }]; };
    try {
      const t0 = B.table();
      assert.strictEqual(t0.count, 4);
      assert.strictEqual(t0.badItems, 3, '三条坏项应被数出来');
      assert.strictEqual(t0.yearDays, 10, '坏项不得计入总天数');
    } finally { ENG.getMonths = save; }
  });
  ok('D4 只报个数：返回对象里不含任何月名（剧透面）', function () {
    const save = ENG.getMonths;
    ENG.getMonths = function () { return [{ name: 'SECRET-MOON-NAME', days: 30 }]; };
    try {
      const s = JSON.stringify(B.table());
      assert.strictEqual(s.indexOf('SECRET-MOON-NAME'), -1, '月名漏进了读数');
    } finally { ENG.getMonths = save; }
  });

  console.log('\nE 旁路面（写口是否受开关约束）\n');
  ok('E1 现场：clear 不看开关，setMonths / label 都看', function () {
    const b = B.bypass();
    assert.strictEqual(b.ok, false);
    assert.deepStrictEqual(b.unguarded, ['clear']);
    assert.strictEqual(b.guards.setMonths, true);
    assert.strictEqual(b.guards.label, true);
    assert.strictEqual(b.static, true);
  });
  ok('E2 给 clear 补开关判定后 unguarded 转空（判据不是恒真）', function () {
    const save = ENG.clear;
    ENG.clear = function () { if (!ENG.getSettings().enabled) return { ok: false, reason: 'disabled' }; return { ok: true, dropped: 0 }; };
    try {
      assert.deepStrictEqual(B.bypass().unguarded, [], '给 clear 补了开关后仍报无保护：判据恒真');
    } finally { ENG.clear = save; }
  });
  ok('E3 静态判也是「静态」：全程没真调 clear / setMonths', function () {
    const s = stubEng();
    try {
      B.bypass();
      assert.strictEqual(s.fired.clear, 0, 'bypass 真调了 clear');
      assert.strictEqual(s.fired.setMonths, 0, 'bypass 真调了 setMonths');
    } finally { s.restore(); }
  });

  console.log('\nF 码面（五码含义 + 表外码）\n');
  ok('F1 现场零码：known/unknown 都空，codes=5', function () {
    const f = B.faults();
    assert.strictEqual(f.codes, 5);
    assert.deepStrictEqual(f.known, []);
    assert.deepStrictEqual(f.unknown, []);
    assert.strictEqual(f.ok, true);
  });
  ok('F2 已知码带文案（disabled 的文案要写出 clear 不看开关）', function () {
    const save = ENG.stat;
    ENG.stat = function () { return { sets: 0, labels: 0, unknowns: 0, blocked: 3, lastReason: 'disabled', faults: { disabled: 3 } }; };
    try {
      const f = B.faults();
      assert.strictEqual(f.known.length, 1);
      assert.strictEqual(f.known[0].code, 'disabled');
      assert.strictEqual(f.known[0].count, 3);
      assert.ok(f.known[0].text.indexOf('clear') >= 0, 'disabled 文案应指出 clear 不看开关');
    } finally { ENG.stat = save; }
  });
  ok('F3 表外码单列且 ok=false（新码不许静默混进 known）', function () {
    const save = ENG.stat;
    ENG.stat = function () { return { sets: 0, labels: 0, unknowns: 0, blocked: 1, lastReason: 'zzz', faults: { 'zzz-new': 2 } }; };
    try {
      const f = B.faults();
      assert.strictEqual(f.ok, false);
      assert.strictEqual(f.unknown.length, 1);
      assert.strictEqual(f.unknown[0].code, 'zzz-new');
    } finally { ENG.stat = save; }
  });

  console.log('\nG 判定面（七态 + drift 优先级）\n');
  function withScene(o, fn) {
    const saveStat = ENG.stat, saveGet = ENG.getMonths;
    ENG.stat = function () { return Object.assign({ sets: 0, labels: 0, unknowns: 0, blocked: 0, lastReason: '', faults: {} }, o.stat || {}); };
    ENG.getMonths = function () { return o.months || []; };
    try { return fn(); } finally { ENG.stat = saveStat; ENG.getMonths = saveGet; }
  }
  ok('G1 现场 verdict=drift 且 state=never-set（结构缺口压过运行态是刻意的）', function () {
    const a = B.audit();
    assert.strictEqual(a.verdict, 'drift');
    assert.strictEqual(a.state, 'never-set');
    assert.strictEqual(a.why, 'drift');
  });
  ok('G2 never-set：sets=0 且开关开着', function () {
    const st = withScene({ months: [], stat: { sets: 0 } }, function () { return B.audit().state; });
    assert.strictEqual(st, 'never-set');
  });
  ok('G3 table-empty：设过又清空（sets>0 但月表 0 项）', function () {
    const st = withScene({ months: [], stat: { sets: 2 } }, function () { return B.audit().state; });
    assert.strictEqual(st, 'table-empty');
  });
  ok('G4 unknown-only：有月表、只产出过待确认', function () {
    const st = withScene({ months: [{ name: 'a', days: 30 }], stat: { sets: 1, labels: 0, unknowns: 4 } }, function () { return B.audit().state; });
    assert.strictEqual(st, 'unknown-only');
  });
  ok('G5 ok：有月表且有成功标签', function () {
    const st = withScene({ months: [{ name: 'a', days: 30 }], stat: { sets: 1, labels: 7, unknowns: 1 } }, function () { return B.audit().state; });
    assert.strictEqual(st, 'ok');
  });
  ok('G6 disabled：开关关着（即使月表在也报 disabled，先于 never-set）', function () {
    const saveSB = W.settingsBus;
    W.settingsBus = { read: function () { return { enabled: false }; } };
    try {
      const st = withScene({ months: [{ name: 'a', days: 30 }], stat: { sets: 1 } }, function () { return B.audit().state; });
      assert.strictEqual(st, 'disabled');
    } finally { W.settingsBus = saveSB; }
  });
  ok('G7 module-missing / no-settings 在 audit 里短路，不往深处读', function () {
    const save = W.calendarPlan;
    try {
      delete W.calendarPlan;
      const a = B.audit();
      assert.strictEqual(a.verdict, 'module-missing');
      assert.strictEqual(a.why, 'module-missing');
    } finally { W.calendarPlan = save; }
    const saveRegs = W.__settingsRegs;
    try {
      W.__settingsRegs = saveRegs.filter(function (r) { return !r || r.module !== 'calendarPlan'; });
      assert.strictEqual(B.audit().verdict, 'no-settings');
    } finally { W.__settingsRegs = saveRegs; }
  });

  console.log('\nH 一句话读数与诊断\n');
  ok('H1 lineOf 结论在首字节（drift 时以「实锤」开头）', function () {
    const s = B.lineOf();
    assert.strictEqual(s.indexOf('\u5b9e\u9524'), 0, '读数应以「实锤」开头，实际：' + s.slice(0, 20));
    assert.ok(s.indexOf('labelBack') >= 0, '读数该点名缺哪个方法');
    assert.ok(s.indexOf('clear') >= 0, '读数该点名哪个写口绕过开关');
    assert.ok(s.indexOf('never-set') >= 0, '读数该带上运行态');
  });
  ok('H2 lineOf 对 module-missing / no-settings 各有专句', function () {
    const save = W.calendarPlan;
    try {
      delete W.calendarPlan;
      assert.ok(B.lineOf().indexOf('\u7f3a\u5f15\u64ce') === 0);
    } finally { W.calendarPlan = save; }
    const saveRegs = W.__settingsRegs;
    try {
      W.__settingsRegs = saveRegs.filter(function (r) { return !r || r.module !== 'calendarPlan'; });
      assert.ok(B.lineOf().indexOf('\u7f3a\u5f00\u5173') === 0);
    } finally { W.__settingsRegs = saveRegs; }
  });
  ok('H3 diagnose 对现场三条实锤各给一条修法（且给出「改注释」这个选项）', function () {
    const d = B.diagnose();
    assert.strictEqual(d.verdict, 'drift');
    const all = d.fixes.join(' | ');
    assert.ok(all.indexOf('labelBack') >= 0);
    assert.ok(all.indexOf('DEF.enabled') >= 0);
    assert.ok(all.indexOf('clear') >= 0);
    assert.ok(all.indexOf('\u6539\u6210') >= 0 || all.indexOf('\u6ce8\u91ca') >= 0, '应给出「要么补实现、要么改注释」两条路');
  });
  ok('H4 summaryText 与 audit 同源（verdict 不会两个出口不一样）', function () {
    const a = B.audit();
    const s = B.summaryText();
    assert.strictEqual(s.verdict, a.verdict);
    assert.strictEqual(s.state, a.state);
    assert.strictEqual(s.why, a.why);
  });

  console.log('\nI 零跑零写（本面的核心边界）\n');
  ok('I1 跑完全部读数，一个写口都没被调（setMonths/clear/setSettings）', function () {
    B.__reset();
    const s = stubEng();
    const saveSS = ENG.setSettings;
    ENG.setSettings = function () { s.fired.setSettings++; throw new Error('setSettings 被调了'); };
    try {
      B.audit(); B.lineOf(); B.summaryText(); B.diagnose(); B.table(); B.switches(); B.bypass(); B.faults(); B.contract();
      assert.strictEqual(s.fired.setMonths, 0, 'setMonths 被调了 ' + s.fired.setMonths + ' 次');
      assert.strictEqual(s.fired.clear, 0, 'clear 被调了 ' + s.fired.clear + ' 次');
      assert.strictEqual(s.fired.setSettings, 0, 'setSettings 被调了 ' + s.fired.setSettings + ' 次');
      assert.strictEqual(s.fired.label, 0, 'label 被调了 —— 它会改 stat.labels，读数就不干净了');
      assert.strictEqual(s.fired.labelNow, 0, 'labelNow 被调了 —— 它连带调 label');
    } finally { s.restore(); ENG.setSettings = saveSS; }
  });
  ok('I2 桥接自有计数随读数增长，__reset 归零', function () {
    B.__reset();
    assert.strictEqual(B.stat().audits, 0);
    B.audit(); B.audit(); B.lineOf();
    const s = B.stat();
    assert.ok(s.audits >= 3, 'audits 应累加，实 ' + s.audits);
    assert.ok(s.drift >= 2, '现场每次都 drift，实 ' + s.drift);
    assert.strictEqual(s.lastWhy, 'drift');
    assert.ok(s.last && s.last.audits === s.audits, 'last 应镜像平铺值');
    B.__reset();
    assert.strictEqual(B.stat().audits, 0, '__reset 没归零');
  });

  console.log('\nJ 源口径钉住（注释改了而桥接没改，本锁要红）\n');
  ok('J1 源文件仍写着「总开关默认关闭」（桥接的 DOC_ENABLED_DEFAULT=false 的依据）', function () {
    const src = fs.readFileSync(path.join(BASE, 'engines/calendar-custom.js'), 'utf8');
    assert.ok(src.indexOf('\u603b\u5f00\u5173\u9ed8\u8ba4\u5173\u95ed') >= 0, '边界 1 原文已改 —— 桥接的文档口径常量需要同批跟位');
  });
  ok('J2 源文件仍写着 labelBack（承诺仍在，实锤就仍成立）', function () {
    const src = fs.readFileSync(path.join(BASE, 'engines/calendar-custom.js'), 'utf8');
    assert.ok(src.indexOf('labelBack(dayIndex, atDay)') >= 0, '注释 ③ 的 labelBack 承诺已改');
  });
  ok('J3 源文件的导出表里确实没有 labelBack（不是桥接看漏了）', function () {
    const src = fs.readFileSync(path.join(BASE, 'engines/calendar-custom.js'), 'utf8');
    const i = src.indexOf('WA.calendarPlan = {');
    assert.ok(i >= 0, '找不到导出表');
    const seg = src.slice(i, src.indexOf('};', i) + 2);
    assert.strictEqual(seg.indexOf('labelBack'), -1, '导出表里出现了 labelBack —— 实锤已被修，桥接与本文口径需同批更新');
    assert.ok(seg.indexOf('setMonths') >= 0 && seg.indexOf('getMonths') >= 0 && seg.indexOf('label') >= 0, '导出表该有承诺里的另外三个');
  });
  ok('J4 桥接文件自身不在本锁的「读引擎」名单外（防止锁写跑偏）', function () {
    const src = fs.readFileSync(path.join(BASE, 'engines/calendar-custom-bridge.js'), 'utf8');
    assert.ok(src.indexOf("const NAME = 'calendarPlan'") >= 0, '桥接锁定的引擎名不是 calendarPlan');
    assert.ok(src.indexOf('static: true') >= 0, 'bypass 应标明自己是静态判');
  });

  console.log('\nCAL-1 专锁: ' + (fail ? 'FAIL ' + pass + ' / ' + (pass + fail) : 'pass (' + pass + ')'));
  if (fail) process.exit(1);
})();

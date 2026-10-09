'use strict';
// WorldAxis tests/s3-b3-e4-v2187.js (v2.187.0) — E4 场景 / 战役层专锁（四段齐备）
//
// 本锁钉的是**否定式核心**（每条都是「不许把两种不同的状况压成同一个绿点」）：
//   ① **不可读 ≠ 未达成 ≠ 已达成**：谓词返回 `ok:false` 时阶段**不前进**，
//      也不许把 `ok:false` 折成 `met:false`（后者会让「引擎没装」读成「还没做到」）；
//   ② **不得跳级**：前一阶段未成时，后一阶段即便谓词为真也不计 —— 顺序是阶段的本义；
//   ③ **不为「有进度」而伪造完成**：达成结束条件只记 finished + 复盘，**不动世界**；
//      复盘数字全部现场读（不与落盘历史比对 —— 一比对就成了两套真源）；
//   ④ **只登记目标与阶段判定**：只写自有单一键 `campaign`，不写别人的键；
//   ⑤ 场景模板**读蓝图真源**（`worldBlueprint.SCENES`），蓝图缺席时如实报缺席，
//      不许自带一份兜底模板 —— 两套模板就是两个真源，它们必然漂移；
//   ⑥ 参数**不许猜**：谓词里要填的势力名 / 货运单号必须由玩家给（猜一个名字 = 凭空造一个世界事实）。
//
// 装载走 tests/ui-gate-sync.js 的 fresh()（与真装载同源的 LOAD），而不是自拼一份模块清单。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const synthHost = require('./synth-host.js');
const REL = 'engines/campaign.js';
const KEYS = ['getSettings', 'setSettings', 'templates', 'planOf', 'start', 'advance', 'reset',
  'status', 'current', 'review', 'evaluate', 'diagnose', 'stat', 'resetStat'];
// 按仓规「无消费方不挂导出」：本模块的消费方是面板与诊断节，**没有**注入段。
const MUST_BE_ABSENT = ['buildBlock'];
function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function readOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function exportBody(src) {
  const at = src.indexOf('WA.campaign = {');
  if (at < 0) return '';
  let i = src.indexOf('{', at), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return '';
}
/** 最小 localStorage 桩 */
function fakeLS() {
  const m = Object.create(null);
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    _dump: function () { return m; }
  };
}
/** 合成宿主：真 settingsBus + 真 inputGuard + **真 store**（本模块写自有键，假 store 会掩盖事务失败）。 */
function hostWith(src, stubs) {
  const c = synthHost.negativeContext({});
  c.window.localStorage = fakeLS();
  vm.runInContext(readOf('core/settings-bus.js'), c, { filename: 'core/settings-bus.js' });
  vm.runInContext(readOf('core/store.js'), c, { filename: 'core/store.js' });
  vm.runInContext(readOf('core/input-guard.js'), c, { filename: 'core/input-guard.js' });
  vm.runInContext(src, c, { filename: REL });
  const WA = c.window.WorldAxis;
  try { WA.store.init(); } catch (e) { /* 已初始化 */ }
  if (stubs) stubs(WA);
  return WA;
}
/** 蓝图桩：**只给 SCENES**（本模块的模板真源面就是这三个 id）。 */
const BLUEPRINT = function (WA) {
  WA.worldBlueprint = {
    SCENES: [
      { id: 'blank', label: '空白开局', note: '进度全零' },
      { id: 'cold-open', label: '事件开局', note: '从事件开始' },
      { id: 'market-day', label: '集市日', note: '从集市开始' }
    ]
  };
};
/** 把「已达成」造出来：blank 的唯一阶段判据是 round ≥ 1。 */
const REACH_ROUND = function (WA) { WA.store.transact(function (d) { d.clock.round = 1; }); };

// ── A 段：静态契约 ─────────────────────────────────────────────────────
function runA(a) {
  const src = srcOf();
  const body = exportBody(src);
  a(body.length > 0, 'e4/A1: 能从真源码取出 WA.campaign 的对象字面量体');
  KEYS.forEach(function (k) { a(body.indexOf(k + ':') > 0, 'e4/A2: 导出面含 ' + k); });
  MUST_BE_ABSENT.forEach(function (k) { a(body.indexOf(k + ':') < 0, 'e4/A3: 导出面**没有** ' + k); });
  a(/const DEF = \{ enabled: false, stageCap: 12, logCap: 24 \}/.test(src), 'e4/A4: 默认关 + 两项参数声明');
  a(/bounds: \{ stageCap: \[3, 24\], logCap: \[4, 64\] \}/.test(src), 'e4/A5: 区间声明逐字在位');
  a(/LS_KEY = 'worldaxis_campaign_settings_v1'/.test(src), 'e4/A6: 设置键是单一真源');
  a(/module: 'campaign'/.test(src), 'e4/A7: 设置登记 module 为 campaign（settings-registry-only 档的存在性前提）');
  ['diplomacy-state', 'freight-arrived', 'relation-tier', 'day-reached']
    .forEach(function (k) { a(src.indexOf("'" + k + "'") >= 0, 'e4/A8: 谓词 ' + k + ' 在位'); });
  a(/const PARAM_KEYS = \{ 'diplomacy-state': \['a', 'b'\], 'freight-arrived': \['id'\], 'relation-tier': \['a', 'b'\] \};/.test(src),
    'e4/A9: 需要玩家填的参数表逐字在位（不猜世界里的名字）');
  a(/if \(!cur\.ok\) \{ fault\('unreadable'\);/.test(src), 'e4/A10: 判据不可读 ⇒ 走 unreadable 分支（不折成未达成）');
  // A10b：字段名必须**真实存在于骨架**（初版读了一个不存在的字段 ⇒ 谓词恒不可读）
  a(/WA\.store\.read\('clock\.dayIndex'\)/.test(src) && src.indexOf("'clock." + "round'") < 0,
    'e4/A10b: 世界时间读数走骨架真实字段 clock.dayIndex（不凭印象写字段名）');
  a(/c\.stage = nextIdx;/.test(src) && /const nextIdx = idx \+ 1;/.test(src),
    'e4/A11: 提升是 idx + 1（**不是** idx++ 的任意跳）');
  a(/if \(done\) c\.finished = true;/.test(src), 'e4/A12: 结束条件达成只记 finished');
  a(/开新局是玩家的动作/.test(src), 'e4/A13: 「结束不自动清空世界」写在模块里');
  a(/本模块\*\*不猜世界里的名字\*\*/.test(src) || /不猜世界里的名字/.test(src),
    'e4/A14: 「不猜世界名字」写在模块头');
  a(/worldBlueprint\.SCENES/.test(src), 'e4/A15: 场景模板读蓝图真源');
  a(/blueprint-absent/.test(src), 'e4/A16: 蓝图缺席时如实报 blueprint-absent');
  ['disabled', 'store-absent', 'no-scene', 'unknown-scene', 'unreadable', 'not-met'].forEach(function (c) {
    a(src.indexOf("'" + c + "'") >= 0, 'e4/A17: 拒收码 ' + c + ' 在位');
  });
  a(readOf('index.js').indexOf("'engines/campaign.js'") >= 0, 'e4/A18: index.js LOAD_ORDER 装载');
  a(readOf('tests/run.js').indexOf("'engines/campaign.js'") >= 0, 'e4/A19: tests/run.js LOAD 装载');
  a(readOf('core/store.js').indexOf('campaign: { scene: \'\', stage: 0') >= 0, 'e4/A20: store 骨架声明 campaign 键');
  const diag = readOf('engines/tool-diag.js');
  a(diag.indexOf("'engines/campaign.js': 'campaign'") >= 0, 'e4/A21: tool-diag MODULE_EXPORTS 登记');
  a(diag.indexOf('function secCampaign()') >= 0, 'e4/A22: tool-diag secCampaign() 存在');
  a(diag.indexOf('campaign: secCampaign()') >= 0, 'e4/A23: tool-diag 诊断对象成员在位');
  const pan = readOf('ui/panel.js');
  // A20b：三处「导出但零消费」的口必须有**真实消费方**（本仓口径：无消费方不挂导出）
  a(pan.indexOf('WA.campaign.planOf') >= 0 && pan.indexOf('WA.campaign.evaluate') >= 0
    && pan.indexOf('WA.campaign.review') >= 0,
    'e4/A20b: planOf / evaluate / review 在面板上有真消费方（不是 test-only 挂着）');
  ['wa-cp-enabled', 'wa-cp-scene', 'wa-cp-start', 'wa-cp-advance', 'wa-cp-status', 'wa-cp-review', 'wa-cp-reset', 'wa-cp-out']
    .forEach(function (id) { a(pan.indexOf(id) >= 0, 'e4/A24: 面板渲染 ' + id); });
  a(pan.indexOf("<div class=\"wa-sec\">战役层（目标与阶段）</div>") >= 0, 'e4/A25: 分区标题是纯文本形态且含模块身份词（须含「战役层」——v2.57.0 模块分区锁按开关标签判归属）');
  const mv = (readOf('index.js').match(/VERSION = '([0-9.]+)'/) || [])[1] || '';
  const cmp = function (x, y) {
    const A = String(x).split('.').map(Number), B = String(y).split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0); }
    return 0;
  };
  a(cmp(mv, '2.188.0') >= 0, 'e4/A26: 入口版本不低于本锁的交付基线（实 ' + mv + '）');
}

// ── B 段：运行时行为 ───────────────────────────────────────────────────
function runB(a) {
  const boot = sync.fresh({});
  const WA = boot.WA;
  a(typeof WA.campaign === 'object', 'e4/B1: 模块装载');
  a(KEYS.every(function (k) { return typeof WA.campaign[k] === 'function'; }), 'e4/B2: 全部导出可调用');
  a(WA.campaign.getSettings().enabled === false, 'e4/B3: 默认关');
  a(WA.campaign.start('blank').reason === 'disabled', 'e4/B4: 关闭时 start 拒收 disabled');
  a(WA.campaign.advance().reason === 'disabled', 'e4/B5: 关闭时 advance 拒收 disabled');
  WA.campaign.setSettings({ enabled: true });
  a(WA.campaign.start('nonexistent-scene').reason === 'unknown-scene', 'e4/B6: 未知场景拒收 unknown-scene');
  a(WA.campaign.templates().ok === true && WA.campaign.templates().scenes.length >= 1,
    'e4/B7: 模板来自蓝图真源（' + WA.campaign.templates().scenes.length + ' 个）');
  const s = WA.campaign.start('blank');
  a(s.ok === true && s.stage === undefined, 'e4/B8: start 成功（返回 scene/stages）');
  // 未达成时不前进
  const a1 = WA.campaign.advance();
  a(a1.ok === false && a1.reason === 'not-met', 'e4/B9: 判据未达成 ⇒ not-met 且阶段不动（实 ' + a1.reason + '）');
  a(WA.campaign.current().stage === 0, 'e4/B10: 未达成后 stage 仍为 0');
  // 造出真实世界变化 ⇒ 阶段前进一次
  WA.store.transact(function (d) { d.clock.dayIndex = 1; });
  const a2 = WA.campaign.advance();
  a(a2.ok === true && a2.done === false && a2.stage === 1, 'e4/B11: 真实变化后阶段前进一格（blank 两阶段 ⇒ 尚未结束）');
  // 第二格：世界天数到 3 才达成 —— 不许跳级、也不许提前结束
  a(WA.campaign.advance().reason === 'not-met', 'e4/B11b: 第二格的判据未达成 ⇒ 停在阶段 1');
  WA.store.transact(function (d) { d.clock.dayIndex = 3; });
  const a2b = WA.campaign.advance();
  a(a2b.ok === true && a2b.done === true, 'e4/B11c: 第二格达成后这一局结束');
  a(WA.campaign.status().finished === true, 'e4/B12: 结束后 finished = true');
  const rv = WA.campaign.review();
  a(rv.ok === true && rv.day === 3 && rv.finished === true, 'e4/B13: 复盘数字与现场读数一致（day=' + rv.day + '）');
  a(rv.stages === 2, 'e4/B14: 复盘报出的阶段数与计划一致（blank 两阶段）');
  const a3 = WA.campaign.advance();
  a(a3.reason === 'finished', 'e4/B15: 结束后再 advance 拒收 finished');
  // 结束不清空世界
  a(WA.store.read('clock.dayIndex') === 3, 'e4/B16: 结束**不动世界**（dayIndex 仍为 3）');
  // reset 开新局：清战役进度、不动世界
  const rt = WA.campaign.reset(false);
  a(rt.ok === true && rt.scene === '', 'e4/B17: reset 清空战役进度');
  a(WA.store.read('clock.dayIndex') === 3, 'e4/B18: reset **不动世界**（dayIndex 仍为 3）');
  a(WA.campaign.status().reason === 'no-campaign', 'e4/B19: 清空后 status 报 no-campaign');
  // 不可读与未达成可分：抽掉 round 的读面
  WA.campaign.start('blank');
  const keep = WA.store.read;
  WA.store.read = function (k) { return k === 'clock.dayIndex' ? 'not-a-number' : keep.call(WA.store, k); };
  const ev = WA.campaign.evaluate(WA.store.read('campaign'));
  a(ev.ok === true && ev.stages[0].ok === false && ev.stages[0].why === 'clock-unreadable',
    'e4/B20: 时钟读不到 ⇒ 阶段判据 ok:false（**不是** met:false）');
  const a4 = WA.campaign.advance();
  a(a4.reason === 'unreadable', 'e4/B21: 不可读时 advance 拒收 unreadable（不前进）');
  WA.store.read = keep;
  // 计数器真的在动，且 resetStat 能把它清零（诊断面复核用 —— 不清零则累计读数
  //   会被下一段测试继承，「这一版跑了多少次」就答不出来了）
  a(WA.campaign.stat().advances >= 2, 'e4/B22a: 会话累计读数真的在动（advances=' + WA.campaign.stat().advances + '）');
  WA.campaign.resetStat();
  a(WA.campaign.stat().advances === 0 && WA.campaign.stat().refused === 0,
    'e4/B22b: resetStat 清零计数器（读数可复核）');
  // 参数不猜：diplomacy 谓词缺参数 ⇒ 拒收
  WA.campaign.start('cold-open');
  const ev2 = WA.campaign.evaluate(WA.store.read('campaign'));
  a(ev2.stages[0].ok === false, 'e4/B22: 玩家没填参数时谓词不可读（不猜名字）');
}

// ── C 段：接线面 ───────────────────────────────────────────────────────
function runC(a) {
  const src = srcOf();
  a(src.indexOf('bounds: {') >= 0, 'e4/C1: 设置区间声明（settingsBus 越界拒收的前提）');
  a(src.indexOf("WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);") >= 0,
    'e4/C2: 设置键走 __settingsRegs 登记');
  a(src.indexOf('WA.store.transact') >= 0, 'e4/C3: 写路径走 store.transact（唯一写口）');
  a(src.indexOf("WA.store.read('campaign')") >= 0, 'e4/C4: 读路径读自有单一键');
  a(src.indexOf('WA.registerModule') >= 0, 'e4/C5: 装载期自注册（模块图需要）');
  a(/module: 'campaign'/.test(src), 'e4/C6: 设置登记的 module 与命名空间同名');
  const others = ['diplomacy', 'freight', 'factionGraph', 'worldBlueprint', 'chrono', 'sediment'];
  others.forEach(function (ns) {
    var wrote = new RegExp('d\\.' + ns + '\\s*=').test(src);
    a(!wrote, 'e4/C7: 不写 ' + ns + ' 的键（只读它的公开读口）');
  });
}

// ── N 段：真源码破坏 + 两向自证 ─────────────────────────────────────────
function runN(a) {
  const SRC = srcOf();
  const CASES = [
    { n: 1, why: 'N1: 不可读被折成未达成 ⇒ 「引擎没装」读成「还没做到」',
      from: "    if (!cur.ok) { fault('unreadable'); return { ok: false, reason: 'unreadable', stage: cur.id, why: cur.why }; }",
      to: "    if (false) { fault('unreadable'); return { ok: false, reason: 'unreadable', stage: cur.id, why: cur.why }; }",
      probe: function (WA) {
        WA.campaign.setSettings({ enabled: true });
        BLUEPRINT(WA);
        WA.campaign.start('blank');
        const keep = WA.store.read;
        WA.store.read = function (k) { return k === 'clock.dayIndex' ? null : keep.call(WA.store, k); };
        const r = WA.campaign.advance();
        WA.store.read = keep;
        return r.reason;
      },
      want: 'unreadable' },
    { n: 2, why: 'N2: 允许跳级 ⇒ 后一阶段的达成把前一阶段一起带过去（阶段失去本义）',
      from: '    const nextIdx = idx + 1;',
      to: '    const nextIdx = ev.stages.length;',
      probe: function (WA) {
        WA.campaign.setSettings({ enabled: true });
        BLUEPRINT(WA);
        WA.campaign.start('blank');
        WA.store.transact(function (d) { d.clock.dayIndex = 1; });
        const r = WA.campaign.advance();
        return [r.ok, r.done, WA.store.read('campaign').stage];
      },
      want: [true, false, 1] },
    { n: 3, why: 'N3: 结束后自动清空世界 ⇒ 「开新局」这个玩家动作被系统替他做了',
      from: '    if (done) { _stat.finishes += 1; return { ok: true, done: true, review: review() }; }',
      to: "    if (done) { _stat.finishes += 1; WA.store.transact(function (d) { d.clock.dayIndex = 0; }); return { ok: true, done: true, review: review() }; }",
      probe: function (WA) {
        WA.campaign.setSettings({ enabled: true });
        BLUEPRINT(WA);
        WA.campaign.start('blank');
        WA.store.transact(function (d) { d.clock.dayIndex = 3; });
        WA.campaign.advance();
        WA.campaign.advance();
        return WA.store.read('clock.dayIndex');
      },
      want: 3 },
    { n: 4, why: 'N4: 模板改成本地兜底副本 ⇒ 与蓝图真源分叉（两套模板必然漂移）',
      from: "    const B = WA.worldBlueprint;\n    if (!B || !Array.isArray(B.SCENES)) return { ok: false, reason: 'blueprint-absent', scenes: [] };",
      to: "    const B = WA.worldBlueprint;\n    if (!B || !Array.isArray(B.SCENES)) return { ok: true, reason: null, scenes: [{ id: 'blank', label: '空白开局', note: '本地兜底' }] };",
      probe: function (WA) {
        WA.campaign.setSettings({ enabled: true });
        return WA.campaign.templates().reason;
      },
      want: 'blueprint-absent' },
    { n: 5, why: 'N5: 谓词参数允许为空 ⇒ 拿空名字去问世界（等于猜一个不存在的势力）',
      from: "      if (typeof v === 'string' && v !== '') out[n] = v;",
      to: "      if (true) out[n] = (typeof v === 'string' ? v : '');",
      probe: function (WA) {
        WA.campaign.setSettings({ enabled: true });
        BLUEPRINT(WA);
        WA.diplomacy = { pairView: function (a, b) { return { ok: true, state: (a === '' && b === '') ? 'unknown' : 'contact' }; } };
        WA.campaign.start('cold-open');
        const ev = WA.campaign.evaluate(WA.store.read('campaign'));
        return [ev.stages[0].ok, ev.stages[0].why];
      },
      want: [false, 'diplomacy-no-state'] }
  ];
  CASES.forEach(function (cs) {
    const hits = SRC.split(cs.from).length - 1;
    a(hits === 1, 'e4/N0(' + cs.n + '): 破坏锚点恰中 1 次（实 ' + hits + '）');
    if (hits !== 1) return;
    const broken = SRC.split(cs.from).join(cs.to);
    a(broken !== SRC, 'e4/Na(' + cs.n + '): 破坏真的改动了源码文本');
    let got = '#threw#';
    try { const WA = hostWith(broken); got = cs.probe(WA); }
    catch (e) { got = '#threw#:' + (e && e.message); }
    a(JSON.stringify(got) !== JSON.stringify(cs.want),
      'e4/' + cs.why + '（破坏后实得 ' + JSON.stringify(got) + '，原版为 ' + JSON.stringify(cs.want) + '）');
  });
  // 纯度：原版上同款判据必须真
  const W0 = hostWith(SRC);
  W0.campaign.setSettings({ enabled: true });
  BLUEPRINT(W0);
  W0.campaign.start('blank');
  const keep0 = W0.store.read;
  W0.store.read = function (k) { return k === 'clock.dayIndex' ? null : keep0.call(W0.store, k); };
  a(W0.campaign.advance().reason === 'unreadable', 'e4/Nb1: （纯度）原版上不可读 ⇒ unreadable');
  W0.store.read = keep0;
  W0.campaign.start('blank');
  W0.store.transact(function (d) { d.clock.dayIndex = 3; });
  const r0 = W0.campaign.advance();
  a(r0.ok === true && r0.done === false && W0.store.read('clock.dayIndex') === 3,
    'e4/Nb2: （纯度）原版上达成后只前进一格，且世界未被清空');
  const W1 = hostWith(SRC);
  W1.campaign.setSettings({ enabled: true });
  a(W1.campaign.templates().reason === 'blueprint-absent', 'e4/Nb3: （纯度）原版上蓝图缺席 ⇒ blueprint-absent');
  a(SRC.length > 8000, 'e4/Nc: 被破坏的源码面非空（' + SRC.length + ' 字符）');
}
module.exports = { runA: runA, runB: runB, runC: runC, runN: runN, KEYS: KEYS, REL: REL };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runA(a); runB(a); runC(a); runN(a);
  console.log('\nE4 s3-b3-e4-v2187 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}
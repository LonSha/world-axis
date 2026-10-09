'use strict';
// WorldAxis tests/s3-b2-e5-v2182.js (v2.182.0) — E5 世界纪事专锁（四段齐备）
//
// 本锁钉的是**否定式核心**（每条都是「不许把两种不同的东西写成同一个形状」）：
//   ① **空历史**（ok:true + 空表）与**读不到**（ok:false + no-store）必须可分；
//   ② `visibility=hidden` 的条目**整条不进**视图（不是截断、不是隐藏样式），只进 hiddenSummary 计数；
//   ③ 截断如实标注覆盖范围 —— 「最近 N 条都正常」不许被读成「历史全部正常」；
//   ④ **只读**：连读六口之后存档逐字节不变（本模块只搬来源记录，不造第二套历史存储）；
//   ⑤ 来源记录缺失**如实标注**（sourceRecordAbsent），不许拿视图行冒充来源原件。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const synthHost = require('./synth-host.js');
const REL = 'engines/chronicle-view.js';
const KEYS = ['getSettings', 'setSettings', 'entries', 'entry', 'hiddenSummary', 'coverage', 'sources', 'diagnose', 'stat', 'reset'];

function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function readOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function exportBody(src) {
  const at = src.indexOf('WA.chronicleView = {');
  if (at < 0) return '';
  let i = src.indexOf('{', at), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return '';
}
function fakeLS() {
  const m = Object.create(null);
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; }, _dump: function () { return m; } };
}
function hostWith(src, stubs) {
  const c = synthHost.negativeContext({});
  c.window.localStorage = fakeLS();
  vm.runInContext(readOf('core/settings-bus.js'), c, { filename: 'core/settings-bus.js' });
  vm.runInContext(src, c, { filename: REL });
  const WA = c.window.WorldAxis;
  if (stubs) stubs(WA);
  return WA;
}
/** 带钟 + 一条可见 / 一条 hidden 的存档桩（N 段与纯度判据共用，逐字同形） */
const SEED = function (WA) {
  WA.store = { get: function () { return {
    clock: { label: '第1日', dayIndex: 1 },
    chronicle: [
      { id: 'v1', title: '可见', summary: '看得见', at: 1, refs: [] },
      { id: 'h1', title: '不可见', summary: '不该被玩家看到', at: 2, visibility: 'hidden' }
    ] }; },
    sizeCaps: function () { return {}; } };
};

// ── A 段：静态契约 ───────────────────────────────────────────────────────
function runA(a) {
  const src = srcOf();
  const body = exportBody(src);
  a(body.length > 0, 'e5v2182/A1: 能从真源码取出 WA.chronicleView 的对象字面量体');
  KEYS.forEach(function (k) { a(body.indexOf(k + ':') > 0, 'e5v2182/A2: 导出面含 ' + k); });
  a(body.indexOf('buildBlock:') < 0, 'e5v2182/A3: 导出面**没有** buildBlock（无消费方不挂导出）');
  a(/EXPORT_COUNT\s*=\s*10/.test(src), 'e5v2182/A4: EXPORT_COUNT = 10');
  a(/chronicleView: export count mismatch/.test(src), 'e5v2182/A5: 自证串在位');
  a(/const DEF = \{ enabled: false, maxRows: 48 \}/.test(src), 'e5v2182/A6: 默认关 + 上限声明');
  a(/maxDrill/.test(src) && src.indexOf('const DEF = { enabled: false, maxRows: 48, maxDrill') < 0,
    'e5v2182/A7: maxDrill 死键已在落盘时删掉（声明必须有消费点）');
  a(/LS_KEY = 'worldaxis_chronicle_view_settings_v1'/.test(src), 'e5v2182/A8: 设置键单一真源');
  a(vm.runInNewContext('(' + (src.match(/bounds: (\{[^}]*\})/) || ['', '{}'])[1] + ')').maxRows.length === 2,
    'e5v2182/A9: maxRows 区间声明是二元组');
  a(/vis === 'hidden'/.test(src), 'e5v2182/A10: hidden 过滤锚点在位（整条不进）');
  a(/reason: 'no-store'/.test(src) && /missing-fields/.test(src) && /'not-found'/.test(src),
    'e5v2182/A11: 三个拒收码字面量在位');
  a(/sourceRecordAbsent/.test(src), 'e5v2182/A12: 来源缺失如实标注字段在位');
  a(readOf('index.js').indexOf("'engines/chronicle-view.js'") >= 0, 'e5v2182/A13: index.js LOAD_ORDER 装载');
  a(readOf('tests/run.js').indexOf("'engines/chronicle-view.js'") >= 0, 'e5v2182/A14: tests/run.js LOAD 装载');
  const diag = readOf('engines/tool-diag.js');
  a(diag.indexOf("'engines/chronicle-view.js': 'chronicleView'") >= 0, 'e5v2182/A15: tool-diag MODULE_EXPORTS 登记');
  a(diag.indexOf('function secChronicleView()') >= 0, 'e5v2182/A16: tool-diag 节函数存在');
  a(diag.indexOf('chronicleView: secChronicleView()') >= 0, 'e5v2182/A17: tool-diag 诊断对象成员在位');
  a(diag.indexOf('wa-wh-cv-view') >= 0 && diag.indexOf('wa-wh-cv-hidden') >= 0,
    'e5v2182/A18: tool-diag UI_BINDINGS 登记本模块控件');
  const pan = readOf('ui/panel.js');
  ['wa-wh-cv-enabled', 'wa-wh-cv-view', 'wa-wh-cv-hidden', 'wa-wh-cv-diag', 'wa-wh-cv-out'].forEach(function (id) {
    a(pan.indexOf(id) >= 0, 'e5v2182/A19: 面板渲染 ' + id);
  });
  a(pan.indexOf("'#wa-wh-cv-hidden'") >= 0, 'e5v2182/A20: 面板接线（点击处理器）在位');
  a(readOf('tests/run.js').indexOf('|chronicleView:coverage diagnose entries getSettings hiddenSummary setSettings stat|') >= 0,
    'e5v2182/A21: FROZEN2800 逐字含本模块的契约成员集');
  a(/VERSION = '2\.(182|183|184)\.0'/.test(readOf('index.js')) && JSON.parse(readOf('manifest.json')).version && ['2.182.0', '2.183.0', '2.184.0'].indexOf(JSON.parse(readOf('manifest.json')).version) >= 0,
    'e5v2182/A22: 版本钉一致（index.js + manifest）');
}

// ── B 段：运行时行为 ─────────────────────────────────────────────────────
function runB(a) {
  const boot = sync.fresh({});
  const WA = boot.WA;
  a(typeof WA.chronicleView === 'object', 'e5v2182/B1: 模块装载');
  a(KEYS.every(function (k) { return typeof WA.chronicleView[k] === 'function'; }), 'e5v2182/B2: 10 口全部可调用');
  a(WA.chronicleView.getSettings().enabled === false, 'e5v2182/B3: 默认关');
  var d0 = WA.chronicleView.entries();
  a(d0.ok === false && d0.reason === 'disabled', 'e5v2182/B4: 关闭时整面拒算');
  a(WA.chronicleView.entry('x').reason === 'disabled', 'e5v2182/B5: 关闭时下钻也拒算（四个口一致）');
  WA.chronicleView.setSettings({ enabled: true });
  var d1 = WA.chronicleView.entries();
  a(d1.ok === true && d1.count === 0 && d1.total === 0,
    'e5v2182/B6: 空历史 ⇒ ok:true + 空表（**不是** ok:false —— 空与读不到必须可分）');
  a(String(d1.coverage).indexOf('全部 0 条') >= 0, 'e5v2182/B7: 空历史覆盖范围也如实标注');
  // 播种三源
  WA.store.transact(function (d) {
    d.chronicle = d.chronicle || [];
    d.chronicle.push({ id: 'ch1', kind: 'fact', title: '城门换了守将', summary: '北门归了新人', at: 3000, refs: [] });
    d.chronicle.push({ id: 'ch2', kind: 'event', title: '密约', summary: '不该被玩家看到', at: 2000, visibility: 'hidden' });
    d.worldFacts = d.worldFacts || [];
    d.worldFacts.push({ id: 'wf1', key: 'wf1', value: '粮价上涨', scope: 'world', source: 'smoke', at: 1000 });
  }, 'lock:seed');
  WA.sediment.setSettings({ enabled: true });
  var s1 = WA.sediment.settle('旧码头', { key: '血战', text: '甲板上的刀痕', trace: 'scar', kind: 'battle', at: 1500 });
  a(s1.ok === true, 'e5v2182/B8: 夹具（沉积痕迹）建立成功');
  WA.causal.setSettings({ enabled: true });
  a(WA.causal.addChain({ cause: 'wf1', action: '开仓平粜' }).ok === true, 'e5v2182/B9: 夹具（因果链）建立成功');
  var d2 = WA.chronicleView.entries();
  a(d2.rows.some(function (r) { return r.source === 'chronicle' && r.ref === 'ch1'; }), 'e5v2182/B10: 可见纪事进视图');
  a(!d2.rows.some(function (r) { return r.ref === 'ch2'; }), 'e5v2182/B11: hidden 整条不进（不是截断）');
  a(d2.hiddenCount === 1, 'e5v2182/B12: hidden 只计数（实 ' + d2.hiddenCount + '）');
  a(d2.rows.some(function (r) { return r.source === 'sediment' && String(r.title).indexOf('旧码头') === 0; }),
    'e5v2182/B13: 沉积行走通且地点名来自 rec.place（不是数组下标）');
  a(d2.rows.some(function (r) { return r.source === 'causal'; }), 'e5v2182/B14: 因果链行走通');
  var ats = d2.rows.map(function (r) { return r.at; });
  a(JSON.stringify(ats) === JSON.stringify(ats.slice().sort(function (x, y) { return x - y; })),
    'e5v2182/B15: 按剧情时间升序');
  a(d2.perSource.chronicle === 1 && d2.perSource.sediment === 1 && d2.perSource.causal === 1,
    'e5v2182/B16: perSource 如实计数');
  // 下钻
  var e1 = WA.chronicleView.entry('ch1');
  a(e1.ok === true && e1.row.ref === 'ch1', 'e5v2182/B17: 下钻可见条目');
  a(!!e1.sourceRecord && e1.sourceRecord.title === '城门换了守将', 'e5v2182/B18: 下钻给来源记录逐字（不是视图行的副本）');
  a(e1.refAudit !== null && e1.refAudit.valid === false && e1.refAudit.reason === 'no_sources',
    'e5v2182/B19: 引用校验走既有 timeline.auditRefs 口径');
  var cauRef = d2.rows.filter(function (r) { return r.source === 'causal'; })[0].ref;
  var e2 = WA.chronicleView.entry(cauRef);
  a(e2.ok === true && e2.sourceRecordAbsent === false, 'e5v2182/B20: 因果链下钻取到来源（chains 是真数组真源）');
  var hs = WA.chronicleView.hiddenSummary();
  a(hs.ok === true && hs.count === 1 && String(hs.rows[0].why).indexOf('visibility=hidden') >= 0,
    'e5v2182/B21: hiddenSummary 报数与原因');
  var cov = WA.chronicleView.coverage();
  a(cov.ok === true && cov.visible === 1 && cov.hidden === 1, 'e5v2182/B22: coverage 可见/不可见分列');
  var d3 = WA.chronicleView.entries({ limit: 1 });
  a(d3.capped === true && d3.total === 3 && d3.count === 1 && String(d3.coverage).indexOf('滚出视图') >= 0,
    'e5v2182/B23: 截断如实标注覆盖范围');
  a(WA.chronicleView.entry('nope').reason === 'not-found', 'e5v2182/B24: 下钻未知 ref ⇒ not-found');
  a(WA.chronicleView.entry('').reason === 'missing-fields', 'e5v2182/B25: 空 ref ⇒ missing-fields（与 not-found 分开）');
  // 只读不变式
  var z1 = JSON.stringify(WA.store.get());
  WA.chronicleView.entries(); WA.chronicleView.entry('ch1');
  WA.chronicleView.hiddenSummary(); WA.chronicleView.coverage();
  WA.chronicleView.sources(); WA.chronicleView.stat();
  var z2 = JSON.stringify(WA.store.get());
  a(z1 === z2, 'e5v2182/B26: 只读（连读六口存档逐字节不变）');
  var srcs = WA.chronicleView.sources();
  a(Array.isArray(srcs) && srcs.length === 5, 'e5v2182/B27: 五源可用性表');
  var dg = WA.chronicleView.diagnose();
  a(dg.closedLoop === true && dg.checks.store === true && dg.version === '2.182.0', 'e5v2182/B28: diagnose 闭环 + 版本');
  var st = WA.chronicleView.stat();
  a(st.reads >= 1 && st.drills >= 2 && st.hiddenSeen >= 1, 'e5v2182/B29: stat 三面计数（reads / drills / hiddenSeen）');
  WA.chronicleView.reset();
  a(WA.chronicleView.stat().reads === 0 && WA.chronicleView.stat().drills === 0, 'e5v2182/B30: reset 清零');
  WA.chronicleView.setSettings({ enabled: false });
  a(WA.chronicleView.entries().reason === 'disabled', 'e5v2182/B31: 关回去仍拒算（开关是活的）');
}

// ── C 段：不变式 ─────────────────────────────────────────────────────────
function runC(a) {
  const boot = sync.fresh({});
  const WA = boot.WA;
  WA.chronicleView.setSettings({ enabled: true });
  WA.store.transact(function (d) { d.chronicle = []; for (var i = 0; i < 10; i++) d.chronicle.push({ id: 'c' + i, title: 't' + i, at: i }); }, 'lock:fill');
  // 截断取**最近**的（历史向前滚动）。
  //   判据写成「限流行 == 全量的末 n 行」而不是写死 c7,c8,c9 —— 写死 ref 会把判据绑在
  //   **本节恰好只有哪些来源**上：同进程里上一次 fresh() 留下的沉积/因果行仍在 localStorage 里，
  //   于是「末尾三条」不一定是那三条 chronicle 行（判据变成对夹具的断言，而不是对行为的断言）。
  var full = WA.chronicleView.entries();
  var r = WA.chronicleView.entries({ limit: 3 });
  a(r.capped === true && JSON.stringify(r.rows) === JSON.stringify(full.rows.slice(-3)),
    'e5v2182/C1: 截断取最近的（限流 == 全量末 3 行，实 ' + r.rows.map(function (x) { return x.ref; }).join(',') + '）');
  a(JSON.stringify(WA.chronicleView.entries({ limit: 3 }).rows) === JSON.stringify(r.rows),
    'e5v2182/C2: 同一存档两次读数逐字相同');
  var rows1 = WA.chronicleView.entries({ limit: 3 }).rows;
  rows1[0].title = '__mutated__';
  a(WA.chronicleView.entries({ limit: 3 }).rows.every(function (x) { return x.title !== '__mutated__'; }),
    'e5v2182/C3: 返回的是副本（改返回值不改下一次读数）');
  // 叙事化不改事实：视图行的 text 只能来自来源字段，不生成描述
  WA.store.transact(function (d) { d.chronicle = [{ id: 'noSum', title: '无摘要', at: 1 }]; }, 'lock:nosum');
  var r2 = WA.chronicleView.entries();
  a(r2.rows[0].text === '' && r2.rows[0].title === '无摘要',
    'e5v2182/C4: 来源没有 summary ⇒ 如实留空（不编描述性文字）');
  // maxRows 区间外写入被夹取（真归一路径）
  WA.chronicleView.setSettings({ maxRows: 4 });
  a(WA.chronicleView.getSettings().maxRows === 8, 'e5v2182/C5: 区间下限外被夹到 8（实 ' + WA.chronicleView.getSettings().maxRows + '）');
  WA.chronicleView.setSettings({ maxRows: 48 });
  a(WA.chronicleView.getSettings().maxRows === 48, 'e5v2182/C6: 区间内原样保留');
}

// ── N 段：负控制（真源码破坏 → 合成宿主装载破坏副本 → 重跑同款真判据）──────
function runN(a) {
  const SRC = srcOf();
  const CASES = [
    { n: 1, why: 'N1: hidden 条目进视图 ⇒ 玩家不可知的内容出现在玩家面上（与 O9 同一条边界）',
      from: "      if (vis === 'hidden') {", to: '      if (false) {',
      probe: function (WA) { WA.chronicleView.setSettings({ enabled: true }); return WA.chronicleView.entries().rows.length; },
      want: 1, stubs: SEED },
    { n: 2, why: 'N2: 读不到时假称「空历史」⇒ 两种完全不同的状况塌成同一个形状',
      from: "    if (!(WA.store && typeof WA.store.get === 'function')) { noteFault('no-store'); return { ok: false, reason: 'no-store', rows: [] }; }\n    const o = (opts && typeof opts === 'object') ? opts : {};",
      to: "    if (!(WA.store && typeof WA.store.get === 'function')) { noteFault('no-store'); return { ok: true, rows: [] }; }\n    const o = (opts && typeof opts === 'object') ? opts : {};",
      probe: function (WA) { WA.chronicleView.setSettings({ enabled: true }); return WA.chronicleView.entries().ok; },
      want: false, stubs: function (WA) { WA.store = {}; } },
    { n: 3, why: 'N3: 截断不标注 ⇒ 「最近 N 条都正常」被读成「历史全部正常」',
      from: '    const capped = all.length > limit;', to: '    const capped = false;',
      probe: function (WA) { WA.chronicleView.setSettings({ enabled: true }); return WA.chronicleView.entries({ limit: 1 }).capped; },
      want: true, stubs: SEED },
    { n: 4, why: 'N4: hidden 只挡视图不计数 ⇒ 「被挡下几条」在读数上消失（静默丢）',
      from: '    return { ok: true, count: chr.hidden.length, rows: chr.hidden.slice(0, 24),',
      to: '    return { ok: true, count: 0, rows: chr.hidden.slice(0, 24),',
      probe: function (WA) { WA.chronicleView.setSettings({ enabled: true }); return WA.chronicleView.hiddenSummary().count; },
      want: 1, stubs: SEED },
    { n: 5, why: 'N5: 读数不计数 ⇒ 「读过几次」不可观测（面在，账不在）',
      from: '    _stat.hiddenSeen += chr.hidden.length;\n    _stat.reads++;',
      to: '    _stat.hiddenSeen += chr.hidden.length;\n    ;',
      probe: function (WA) { WA.chronicleView.setSettings({ enabled: true }); WA.chronicleView.reset(); WA.chronicleView.entries(); WA.chronicleView.entries(); return WA.chronicleView.stat().reads; },
      want: 2, stubs: SEED },
    { n: 6, why: 'N6: 下钻不计数 ⇒ 「这条线索被查过几次」不可答（归因面缺一格）',
      from: '    _stat.drills++;\n    return { ok: true, ref: key, row: Object.assign({}, hit),',
      to: '    ;\n    return { ok: true, ref: key, row: Object.assign({}, hit),',
      probe: function (WA) { WA.chronicleView.setSettings({ enabled: true }); WA.chronicleView.reset(); WA.chronicleView.entry('v1'); return WA.chronicleView.stat().drills; },
      want: 1, stubs: SEED }
  ];
  CASES.forEach(function (cs) {
    const hits = SRC.split(cs.from).length - 1;
    a(hits === 1, 'e5v2182/N0(' + cs.n + '): 破坏锚点恰中 1 次（实 ' + hits + '）');
    if (hits !== 1) return;
    const broken = SRC.split(cs.from).join(cs.to);
    a(broken !== SRC, 'e5v2182/Na(' + cs.n + '): 破坏真的改动了源码文本');
    let got = '#threw#';
    try { const WA = hostWith(broken, cs.stubs); got = cs.probe(WA); }
    catch (e) { got = '#threw#:' + (e && e.message); }
    a(got !== cs.want, 'e5v2182/' + cs.why + '（破坏后实得 ' + JSON.stringify(got) + '，原版为 ' + JSON.stringify(cs.want) + '）');
  });
  // Nb. 纯度：原版上同款判据必须为真
  const W0 = hostWith(SRC, SEED);
  W0.chronicleView.setSettings({ enabled: true });
  a(W0.chronicleView.entries().rows.length === 1, 'e5v2182/Nb1: （纯度）原版上 hidden 不进视图成立');
  W0.chronicleView.reset();
  W0.chronicleView.entries({ limit: 1 });
  a(W0.chronicleView.stat().reads === 1, 'e5v2182/Nb2: （纯度）原版上读数记账成立');
  W0.chronicleView.reset();
  W0.chronicleView.entry('v1');
  a(W0.chronicleView.stat().drills === 1, 'e5v2182/Nb3: （纯度）原版上下钻记账成立');
  a(W0.chronicleView.hiddenSummary().count === 1, 'e5v2182/Nb4: （纯度）原版上 hidden 计数成立');
  const W1 = hostWith(SRC, function (WA) { WA.store = {}; });
  W1.chronicleView.setSettings({ enabled: true });
  a(W1.chronicleView.entries().reason === 'no-store', 'e5v2182/Nb5: （纯度）原版上读不到即报 no-store');
  a(SRC.length > 12000, 'e5v2182/Nc: 被破坏的源码面非空（' + SRC.length + ' 字符）');
}

module.exports = { runA: runA, runB: runB, runC: runC, runN: runN, KEYS: KEYS, REL: REL };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runA(a); runB(a); runC(a); runN(a);
  console.log('\nE5 s3-b2-e5-v2182 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}
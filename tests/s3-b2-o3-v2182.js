'use strict';
// WorldAxis tests/s3-b2-o3-v2182.js (v2.182.0) — O3 性能基线专锁（四段齐备）
//
// 本锁钉的是**否定式核心**（每条都是「不许拿估计顶替测量」）：
//   ① 实机采样栏在无头环境里**为空是正确结果**（reason:'needs-real-device'），
//      不是「待办漏做」；把 `approx:true` 的同机估计填进实测栏，
//      下一个读者就再也分不出「手机上是 60ms」与「桌上机放大估算是 60ms」；
//   ② 未采到样本的面报 `unmeasured` 且 **p50 保持 null** —— 0 是一个合法耗时读数
//      （cache hit 就是 0ms），拿它冒充「没测过」会让两件事同形；
//   ③ 预算表**冻结**的是取值时刻的副本 + 之后的漂移检测：动活值不改冻结副本，
//      但漂移必须当场可见（否则历史读数悄悄失去可比性）；
//   ④ **只读**：连读四个面之后存档逐字节不变，且**不往被观测窗口里塞数**
//      （观测污染被观测者）；
//   ⑤ 不报百分比收益（计划原文即禁）：读数只报现场值 / 预算值 / 判定档。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const synthHost = require('./synth-host.js');
const REL = 'engines/perf-baseline.js';
const KEYS = ['getSettings', 'setSettings', 'bands', 'budget', 'readings', 'gap', 'sources', 'diagnose', 'stat', 'reset'];

function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function readOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function exportBody(src) {
  const at = src.indexOf('WA.perfBaseline = {');
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
/** store + perfTrace 双桩：CLASS_DEF 是活值（冻结副本与漂移检测的对照面） */
function makeStubs(mutate) {
  return function (WA) {
    var live = { short: { budget: 800, repeats: 3, approx: false, note: 's' },
      medium: { budget: 2000, repeats: 2, approx: false, note: 'm' },
      long: { budget: 4000, repeats: 1, approx: false, note: 'l' },
      lowend: { budget: 2000, repeats: 2, approx: true, note: '估算' } };
    WA.perfTrace = { CLASS_DEF: live, baseline: function () { return { window: 0, p50: null, p95: null, max: null, cap: 64, dropped: 0 }; } };
    WA.perfLedger = { trend: function () { return { ok: true, rows: [], degrading: 0 }; } };
    WA.renderPerf = { renderStat: function () { return { rows: [] }; }, getSettings: function () { return { enabled: false }; } };
    WA.store = { get: function () { return {}; },
      saveStat: function () { return { at: 0, ok: null, bytes: 0, reason: null, failCount: 0 }; },
      sizeAudit: function () { return { total: 0 }; },
      sizeCaps: function () { return {}; } };
    if (mutate) mutate(WA, live);
  };
}

// ── A 段：静态契约 ───────────────────────────────────────────────────────
function runA(a) {
  const src = srcOf();
  const body = exportBody(src);
  a(body.length > 0, 'o3v2182/A1: 能从真源码取出 WA.perfBaseline 的对象字面量体');
  KEYS.forEach(function (k) { a(body.indexOf(k + ':') > 0, 'o3v2182/A2: 导出面含 ' + k); });
  a(body.indexOf('buildBlock:') < 0, 'o3v2182/A3: 导出面**没有** buildBlock（无消费方不挂导出）');
  a(/EXPORT_COUNT\s*=\s*10/.test(src), 'o3v2182/A4: EXPORT_COUNT = 10');
  a(/perfBaseline: export count mismatch/.test(src), 'o3v2182/A5: 自证串在位');
  a(/const DEF = \{ enabled: false, nearRatio: 0.8 \}/.test(src), 'o3v2182/A6: 默认关 + 小数阈值 0.8');
  a(/bounds: \{ nearRatio: \[0\.5, 1\] \}/.test(src), 'o3v2182/A7: 区间声明逐字在位（小数域）');
  a(/LS_KEY = 'worldaxis_perf_baseline_settings_v1'/.test(src), 'o3v2182/A8: 设置键单一真源');
  a(/reason: 'needs-real-device'/.test(src), 'o3v2182/A9: 实机缺口码字面量在位');
  a(/reason: 'no-bytes'/.test(src) && /noteFault\('no-perf-trace'\)/.test(src), 'o3v2182/A10: 另两个拒收码在位');
  a(/p50: null, p95: null, maxMs: null/.test(src), 'o3v2182/A11: 未测面 p50 初始为 null（不是 0）');
  a(src.indexOf('WA.perfLedger.ingest') < 0 && src.indexOf('perfTrace.mark(') < 0,
    'o3v2182/A12: 不调用采样入口（只读面不污染被观测窗口）');
  a(/不默认成小局/.test(src), 'o3v2182/A13: 「不默认成小局」写在返回体里');
  a(/不拿 0 冒充/.test(src), 'o3v2182/A14: 「不拿 0 冒充」写在返回体里');
  a(/本栏不做自动采集/.test(src), 'o3v2182/A15: 实机栏不做自动采集（写在 howTo 里）');
  a(/frozenBudgetMs/.test(src) && /drift/.test(src), 'o3v2182/A16: 冻结副本 + 漂移检测两件都在');
  a(readOf('index.js').indexOf("'engines/perf-baseline.js'") >= 0, 'o3v2182/A17: index.js LOAD_ORDER 装载');
  a(readOf('tests/run.js').indexOf("'engines/perf-baseline.js'") >= 0, 'o3v2182/A18: tests/run.js LOAD 装载');
  const diag = readOf('engines/tool-diag.js');
  a(diag.indexOf("'engines/perf-baseline.js': 'perfBaseline'") >= 0, 'o3v2182/A19: tool-diag MODULE_EXPORTS 登记');
  a(diag.indexOf('function secPerfBaseline()') >= 0, 'o3v2182/A20: tool-diag 节函数存在');
  a(diag.indexOf('perfBaseline: secPerfBaseline()') >= 0, 'o3v2182/A21: tool-diag 诊断对象成员在位');
  a(diag.indexOf('wa-pbl-enabled') >= 0 && diag.indexOf('wa-pbl-gap') >= 0, 'o3v2182/A22: tool-diag UI_BINDINGS 登记本模块控件');
  const pan = readOf('ui/panel.js');
  ['wa-pbl-enabled', 'wa-pbl-bands', 'wa-pbl-budget', 'wa-pbl-readings', 'wa-pbl-gap', 'wa-pbl-diag'].forEach(function (id) {
    a(pan.indexOf(id) >= 0, 'o3v2182/A23: 面板渲染 ' + id);
  });
  a(pan.indexOf("'#wa-pbl-gap'") >= 0, 'o3v2182/A24: 面板接线（实机缺口按钮）在位');
  a(readOf('tests/run.js').indexOf('|perfBaseline:bands budget diagnose gap getSettings readings setSettings stat|') >= 0,
    'o3v2182/A25: FROZEN2800 逐字含本模块的契约成员集');
  a(/VERSION = '2\.182\.0'/.test(readOf('index.js')) && JSON.parse(readOf('manifest.json')).version === '2.182.0',
    'o3v2182/A26: 版本钉一致（index.js + manifest）');
}

// ── B 段：运行时行为 ─────────────────────────────────────────────────────
function runB(a) {
  const boot = sync.fresh({});
  const WA = boot.WA;
  a(typeof WA.perfBaseline === 'object', 'o3v2182/B1: 模块装载');
  a(KEYS.every(function (k) { return typeof WA.perfBaseline[k] === 'function'; }), 'o3v2182/B2: 10 口全部可调用');
  a(WA.perfBaseline.getSettings().enabled === false, 'o3v2182/B3: 默认关');
  a(WA.perfBaseline.bands().reason === 'disabled' && WA.perfBaseline.budget().ok === false
    && WA.perfBaseline.readings().ok === false && WA.perfBaseline.gap().ok === false,
    'o3v2182/B4: 关闭时**四个读面都拒算**');
  WA.perfBaseline.setSettings({ enabled: true });
  a(WA.perfBaseline.getSettings().enabled === true, 'o3v2182/B5: 开关是活的');
  var bd = WA.perfBaseline.bands();
  a(bd.ok === true && bd.rows.length === 3, 'o3v2182/B6: 三档齐备');
  a(bd.rows.map(function (r) { return r.id; }).join(',') === 'small,typical,edge', 'o3v2182/B7: 档位 id 稳定序');
  a(bd.rows.filter(function (r) { return r.current; }).length === 1, 'o3v2182/B8: **恰好一档**被判为当前（不能是 0 或 2）');
  a(bd.rows.filter(function (r) { return r.current; })[0].id === bd.current, 'o3v2182/B9: current 与行内旗标一致');
  a(bd.current !== 'edge' && bd.currentDetail !== null && typeof bd.currentDetail.bytesSource === 'string',
    'o3v2182/B10: 空存档不落在 edge + 字节来源可读');
  a(bd.note.indexOf('不默认成小局') >= 0, 'o3v2182/B11: 「判不出时不默认成小局」写在返回体里');
  var bu = WA.perfBaseline.budget();
  a(bu.ok === true && bu.rows.length === 3, 'o3v2182/B12: 预算表三档');
  a(bu.rows.filter(function (r) { return r.class === 'short'; })[0].budgetMs === 800
    && bu.rows.filter(function (r) { return r.class === 'medium'; })[0].budgetMs === 2000
    && bu.rows.filter(function (r) { return r.class === 'long'; })[0].budgetMs === 4000,
    'o3v2182/B13: 预算值逐档与 CLASS_DEF 一致（唯一真源）');
  a(bu.frozenAvailable === true && bu.driftCount === 0 && bu.drift.length === 0, 'o3v2182/B14: 冻结副本可用且当前无漂移');
  a(Array.isArray(bu.declared) && bu.declared.length === 4, 'o3v2182/B15: 声明目标四行（与实测基线分列）');
  a(bu.declared.every(function (d) { return typeof d.p95Ms === 'number' && typeof d.source === 'string'; }),
    'o3v2182/B16: 声明目标自带 source（不许把声明说成实测）');
  var frozenBefore = JSON.stringify(bu.rows.map(function (r) { return r.frozenBudgetMs; }));
  var liveDef = WA.perfTrace.CLASS_DEF.long.budget;
  WA.perfTrace.CLASS_DEF.long.budget = 9999;
  var bu2 = WA.perfBaseline.budget();
  a(bu2.driftCount === 1 && bu2.drift[0].cls === 'long' && bu2.drift[0].to === 9999, 'o3v2182/B17: 漂移当场可见');
  a(JSON.stringify(bu2.rows.map(function (r) { return r.frozenBudgetMs; })) === frozenBefore, 'o3v2182/B18: 冻结副本不被活值改动');
  a(bu2.note.indexOf('不可直接比较') >= 0, 'o3v2182/B19: 漂移后如实声明「历史读数不可直接比较」');
  WA.perfTrace.CLASS_DEF.long.budget = liveDef;
  a(WA.perfBaseline.budget().driftCount === 0, 'o3v2182/B20: 复原后漂移清零（判据是当前态，不是累计）');
  var rd = WA.perfBaseline.readings();
  a(rd.ok === true && rd.count === 8 && rd.rows.length === 8, 'o3v2182/B21: 八面台账');
  a(rd.rows.map(function (r) { return r.face; }).join(',') === 'inject,worldState,canonAlign,diagnose,tx,save,ecoAudit,panel',
    'o3v2182/B22: 面 id 稳定序');
  a(rd.measuredCount + rd.unmeasuredCount === rd.count, 'o3v2182/B23: 已测 + 未测 = 全量（无遗漏无重复）');
  a(rd.rows.filter(function (r) { return !r.measured; }).every(function (r) { return r.p50 === null; }),
    'o3v2182/B24: 未测面 p50 **保持 null**（不拿 0 冒充）');
  a(rd.note.indexOf('不拿 0 冒充') >= 0, 'o3v2182/B25: 「不拿 0 冒充」写在返回体里');
  WA.perfTrace.bench('short');
  var rd2 = WA.perfBaseline.readings();
  var inj = rd2.rows.filter(function (r) { return r.face === 'inject'; })[0];
  a(inj.measured === true && inj.samples >= 1 && typeof inj.p50 === 'number', 'o3v2182/B26: 采样后该面转为 measured 且 p50 是真数');
  a(inj.p50Source.indexOf('perfTrace.baseline(inject)') >= 0, 'o3v2182/B27: p50Source 指明来源层');
  a(rd2.rows.filter(function (r) { return r.face === 'save'; })[0].measured === false,
    'o3v2182/B28: 写盘面**如实标未测**（它只记结果与字节，不记耗时）');
  var gp = WA.perfBaseline.gap();
  a(gp.ok === true && Array.isArray(gp.rows) && gp.rows.length === 0, 'o3v2182/B29: 实机栏**为空**');
  a(gp.reason === 'needs-real-device', 'o3v2182/B30: 空是「这个环境测不出来」而不是「没做」');
  a(Array.isArray(gp.missing) && gp.missing.length === 5, 'o3v2182/B31: 缺什么清单五条');
  a(gp.approxFallback !== null && gp.approxFallback.approx === true,
    'o3v2182/B32: 同机估计作为**回退项**单列（不填进实测栏）');
  a(gp.note.indexOf('为空是正确结果') >= 0 && gp.howTo.indexOf('不做自动采集') >= 0,
    'o3v2182/B33: 「为空是正确结果」+「不做自动采集」两条都在返回体里');
  var z1 = JSON.stringify(WA.store.get());
  var layerN1 = WA.perfTrace.baseline('inject').window;
  var ledN1 = WA.perfLedger.trend().rows.map(function (r) { return [r.source, r.n]; }).join('|');
  WA.perfBaseline.bands(); WA.perfBaseline.budget(); WA.perfBaseline.readings();
  WA.perfBaseline.gap(); WA.perfBaseline.sources();
  var z2 = JSON.stringify(WA.store.get());
  a(z1 === z2, 'o3v2182/B34: 只读（连读四个面存档逐字节不变）');
  a(WA.perfTrace.baseline('inject').window === layerN1, 'o3v2182/B35: 不往被观测窗口里塞数（污染判据一）');
  a(WA.perfLedger.trend().rows.map(function (r) { return [r.source, r.n]; }).join('|') === ledN1,
    'o3v2182/B36: 不污染 perf-ledger（污染判据二）');
  var srcs = WA.perfBaseline.sources();
  a(Array.isArray(srcs) && srcs.length === 5 && srcs.every(function (s) { return typeof s.available === 'boolean'; }),
    'o3v2182/B37: 五源可用性表');
  a(srcs.every(function (s) { return s.read === undefined; }), 'o3v2182/B38: 源表形状稳定（不夹带 byFace）');
  var dg = WA.perfBaseline.diagnose();
  a(dg.closedLoop === true && dg.faceCount === 8 && dg.bandCount === 3 && dg.realDevice === 'pending' && dg.version === '2.182.0',
    'o3v2182/B39: diagnose 闭环 + 8 面 / 3 档 + 实机待验收 + 版本');
  var st = WA.perfBaseline.stat();
  a(st.reads >= 1 && typeof st.band === 'string' && st.frozenAvailable === true && typeof st.faults.disabled === 'number' && st.faults.disabled >= 4,
    'o3v2182/B40: stat 记读数 / 档位 / 冻结可用 / 四个 disabled 拒收');
  WA.perfBaseline.reset();
  a(WA.perfBaseline.stat().reads === 0 && Object.keys(WA.perfBaseline.stat().faults).length === 0, 'o3v2182/B41: reset 清零');
  WA.perfBaseline.setSettings({ enabled: false });
  a(WA.perfBaseline.bands().ok === false && WA.perfBaseline.readings().ok === false,
    'o3v2182/B42: 关回去仍拒算（开关是活的）');
}

// ── C 段：不变式 ─────────────────────────────────────────────────────────
function runC(a) {
  const boot = sync.fresh({});
  const WA = boot.WA;
  WA.perfBaseline.setSettings({ enabled: true });
  a(WA.perfBaseline.getSettings().nearRatio === 0.8, 'o3v2182/C1: 小数域默认 0.8 原样保留（不被取整成 1）');
  WA.perfBaseline.setSettings({ nearRatio: 0.5 });
  a(WA.perfBaseline.getSettings().nearRatio === 0.5,
    'o3v2182/C2: 阈值可写下小数（**死旋钮判据**：写 0.5 读回必须是 0.5）');
  WA.perfBaseline.setSettings({ nearRatio: 1.4 });
  a(WA.perfBaseline.getSettings().nearRatio === 1, 'o3v2182/C3: 越上限夹到 1（夹取仍在，只是不取整）');
  WA.perfBaseline.setSettings({ nearRatio: 0.8 });
  var rd = WA.perfBaseline.readings();
  a(rd.rows.every(function (r) { return typeof r.p50Source === 'string' && r.p50Source.length > 0; }),
    'o3v2182/C4: 每面都指明口径来源（不许留空让人猜）');
  a(rd.rows.every(function (r) { return typeof r.samples === 'number'; }), 'o3v2182/C5: samples 恒为数字');
  a(JSON.stringify(WA.perfBaseline.bands().rows) === JSON.stringify(WA.perfBaseline.bands().rows),
    'o3v2182/C6: 同一状态两次读数逐字相同');
  var rows1 = WA.perfBaseline.readings().rows;
  rows1[0].p50 = '__mutated__';
  a(WA.perfBaseline.readings().rows[0].p50 !== '__mutated__', 'o3v2182/C7: 返回的是副本（改返回值不改下一次读数）');
  a(WA.perfBaseline.budget().declared.every(function (d) { return d.measured === undefined; }),
    'o3v2182/C8: 声明目标行**没有** measured 字段（声明不是实测，形状上就分开）');
}

// ── N 段：负控制（真源码破坏 → 合成宿主装载破坏副本 → 重跑同款真判据）──────
function runN(a) {
  const SRC = srcOf();
  const CASES = [
    { n: 1, why: 'N1: 实机栏拿同机估计冒充实测 ⇒ 「测过」与「没测过」在读数上同形（本模块的头号禁令）',
      from: "    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [], missing: [] }; }",
      to: "    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [], missing: [] }; }\n    if (true) return { ok: true, reason: null, rows: [{ p50: 60 }], missing: [] };",
      probe: function (WA) { WA.perfBaseline.setSettings({ enabled: true }); var g = WA.perfBaseline.gap(); return [g.rows.length, g.reason]; },
      want: [0, 'needs-real-device'], stubs: makeStubs() },
    { n: 2, why: 'N2: 未测面拿 0 冒充 ⇒ 0ms（cache hit 的合法读数）与「没测过」同形',
      from: "        p50: null, p95: null, maxMs: null, p50Source: 'unavailable', source: null, note: null };",
      to: "        p50: 0, p95: 0, maxMs: 0, p50Source: 'unavailable', source: null, note: null };",
      probe: function (WA) { WA.perfBaseline.setSettings({ enabled: true }); return WA.perfBaseline.readings().rows[0].p50; },
      want: null, stubs: makeStubs() },
    { n: 3, why: 'N3: 关掉的模块照算 ⇒ 开关是死旋钮',
      from: "    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [] }; }\n    const cur = bandOf();",
      to: "    if (false) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [] }; }\n    const cur = bandOf();",
      probe: function (WA) { return WA.perfBaseline.bands().ok; },
      want: false, stubs: makeStubs() },
    { n: 4, why: 'N4: 漂移检测被摘掉 ⇒ 「预算悄悄变了」在读数上不可见（历史读数失去可比性而无人知道）',
      from: '    const drift = [];\n    if (FROZEN_CLASS_DEF) {',
      to: '    const drift = [];\n    if (false) {',
      probe: function (WA) {
        WA.perfBaseline.setSettings({ enabled: true });
        WA.perfTrace.CLASS_DEF.long.budget = 9999;
        return WA.perfBaseline.budget().driftCount;
      },
      want: 1, stubs: makeStubs() },
    { n: 5, why: 'N5: 冻结取活引用（不深拷贝）⇒ 「冻结」名存实亡：动活值就把冻结副本一起改了',
      from: "    try { return JSON.parse(JSON.stringify(live)); } catch (e) { return null; }",
      to: '    try { return live; } catch (e) { return null; }',
      probe: function (WA) {
        WA.perfBaseline.setSettings({ enabled: true });
        WA.perfTrace.CLASS_DEF.long.budget = 9999;
        return WA.perfBaseline.budget().rows.filter(function (r) { return r.class === 'long'; })[0].frozenBudgetMs;
      },
      want: 4000, stubs: makeStubs() },
    { n: 6, why: 'N6: 读数不计数 ⇒ 「读过几次」不可观测（面在，账不在）',
      from: '    _stat.reads++;\n    return { ok: true,\n      rows: BANDS.map(',
      to: '    ;\n    return { ok: true,\n      rows: BANDS.map(',
      probe: function (WA) { WA.perfBaseline.setSettings({ enabled: true }); WA.perfBaseline.reset(); WA.perfBaseline.bands(); WA.perfBaseline.bands(); return WA.perfBaseline.stat().reads; },
      want: 2, stubs: makeStubs() }
  ];
  CASES.forEach(function (cs) {
    const hits = SRC.split(cs.from).length - 1;
    a(hits === 1, 'o3v2182/N0(' + cs.n + '): 破坏锚点恰中 1 次（实 ' + hits + '）');
    if (hits !== 1) return;
    const broken = SRC.split(cs.from).join(cs.to);
    a(broken !== SRC, 'o3v2182/Na(' + cs.n + '): 破坏真的改动了源码文本');
    let got = '#threw#';
    try { const WA = hostWith(broken, cs.stubs); got = cs.probe(WA); }
    catch (e) { got = '#threw#:' + (e && e.message); }
    a(JSON.stringify(got) !== JSON.stringify(cs.want), 'o3v2182/' + cs.why + '（破坏后实得 ' + JSON.stringify(got) + '，原版为 ' + JSON.stringify(cs.want) + '）');
  });
  const W0 = hostWith(SRC, makeStubs());
  W0.perfBaseline.setSettings({ enabled: true });
  a(W0.perfBaseline.gap().rows.length === 0 && W0.perfBaseline.gap().reason === 'needs-real-device',
    'o3v2182/Nb1: （纯度）原版上实机栏为空且给得理由');
  a(W0.perfBaseline.readings().rows[0].p50 === null, 'o3v2182/Nb2: （纯度）原版上未测面 p50 为 null');
  a(W0.perfBaseline.budget().driftCount === 0, 'o3v2182/Nb3: （纯度）原版上无漂移');
  W0.perfBaseline.reset();
  W0.perfBaseline.bands();
  a(W0.perfBaseline.stat().reads === 1, 'o3v2182/Nb4: （纯度）原版上读数记账成立');
  const W1 = hostWith(SRC, makeStubs(function (WA) { WA.perfTrace = null; }));
  W1.perfBaseline.setSettings({ enabled: true });
  a(W1.perfBaseline.budget().reason === 'no-perf-trace', 'o3v2182/Nb5: （纯度）原版上 perf-trace 缺席即报 no-perf-trace（不自带副本）');
  a(SRC.length > 15000, 'o3v2182/Nc: 被破坏的源码面非空（' + SRC.length + ' 字符）');
}

module.exports = { runA: runA, runB: runB, runC: runC, runN: runN, KEYS: KEYS, REL: REL };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runA(a); runB(a); runC(a); runN(a);
  console.log('\nO3 s3-b2-o3-v2182 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}
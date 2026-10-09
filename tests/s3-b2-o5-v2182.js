'use strict';
// WorldAxis tests/s3-b2-o5-v2182.js (v2.182.0) — O5 世界健康中心专锁（四段齐备）
//
// 本锁钉的是**否定式核心**（每条都是「不许把两种不同的状况压成同一个绿点」）：
//   ① `empty`（没数据）与 `allClear`（有数据但无事）必须**可分** —— 把两者合成一个
//      「一切正常」，正是「点了没反应」的另一种写法；
//   ② 关掉的模块其待办**不出现**，但要如实进 `skipped` —— 不许静默当作「没有待办」；
//   ③ 截断如实标注覆盖范围（`其余待办仍在世界状态里`）—— 「前 N 条都清空」不等于「全清空」；
//   ④ **只读**：连读三栏与三种下钻之后存档逐字节不变（本模块不替任何模块动手）；
//   ⑤ 玩家面**不搬维护者诊断**（原始统计 / 内部路径不在返回体里）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const synthHost = require('./synth-host.js');
const REL = 'engines/world-health.js';
const KEYS = ['getSettings', 'setSettings', 'summary', 'drill', 'sources', 'diagnose', 'stat', 'reset'];

function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function readOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function exportBody(src) {
  const at = src.indexOf('WA.worldHealth = {');
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
/** store 桩 + 一个「有数据但没待办」的模块（empty/allClear 的可分性判据就建在它上面） */
const SEED = function (WA) {
  WA.store = {
    get: function () { return { chronicle: [] }; },
    sizeCaps: function () { return { 'chronicle': { cap: 200, kind: 'array' } }; }
  };
  WA.settingsBus = WA.settingsBus || {};
  WA.settingsBus.registry = function () { return [{ key: 'k1', module: 'commission' }]; };
  WA.commission = { pending: function () { return { ok: true, items: [] }; }, stat: function () { return { faults: {}, lastReason: '' }; } };
};

// ── A 段：静态契约 ───────────────────────────────────────────────────────
function runA(a) {
  const src = srcOf();
  const body = exportBody(src);
  a(body.length > 0, 'o5v2182/A1: 能从真源码取出 WA.worldHealth 的对象字面量体');
  KEYS.forEach(function (k) { a(body.indexOf(k + ':') > 0, 'o5v2182/A2: 导出面含 ' + k); });
  a(body.indexOf('buildBlock:') < 0, 'o5v2182/A3: 导出面**没有** buildBlock（无消费方不挂导出）');
  a(/EXPORT_COUNT\s*=\s*8/.test(src), 'o5v2182/A4: EXPORT_COUNT = 8');
  a(/worldHealth: export count mismatch/.test(src), 'o5v2182/A5: 自证串在位');
  a(/const DEF = \{ enabled: false, maxRows: 6, nearRatio: 0.8, maxFaultModules: 6 \}/.test(src),
    'o5v2182/A6: 默认关 + 三项参数声明（含小数阈值 0.8）');
  a(/bounds: \{ maxRows: \[2, 24\], nearRatio: \[0\.5, 1\], maxFaultModules: \[1, 24\] \}/.test(src),
    'o5v2182/A7: 三区间声明逐字在位');
  a(/LS_KEY = 'worldaxis_world_health_settings_v1'/.test(src), 'o5v2182/A8: 设置键单一真源');
  a(/empty: total === 0 && Object\.keys\(perSource\)\.length === 0,/.test(src),
    'o5v2182/A9: empty 判据含「一个源都没读到」这一半（不是单纯 total===0）');
  a(/allClear: total === 0 && Object\.keys\(perSource\)\.length > 0,/.test(src),
    'o5v2182/A10: allClear 判据含「有源在读」这一半');
  a(/why: 'disabled'/.test(src), 'o5v2182/A11: 关掉的模块走 disabled 分支如实进 skipped');
  a(/其余待办仍在世界状态里/.test(src), 'o5v2182/A12: 截断覆盖范围写在返回体里');
  a(/这里只做聚合与下钻/.test(src) || src.indexOf('不替代各模块自己的确认语义') >= 0,
    'o5v2182/A13: 「只聚合不下手」写在返回体里');
  a(/不搬到这里/.test(src), 'o5v2182/A14: 维护者诊断不搬进玩家面（写在返回体里）');
  a(/REJECT_HINT/.test(src) && /hintKnown/.test(src), 'o5v2182/A15: 拒收码→玩家提示的映射与「已知/未知」分列');
  a(readOf('index.js').indexOf("'engines/world-health.js'") >= 0, 'o5v2182/A16: index.js LOAD_ORDER 装载');
  a(readOf('tests/run.js').indexOf("'engines/world-health.js'") >= 0, 'o5v2182/A17: tests/run.js LOAD 装载');
  const diag = readOf('engines/tool-diag.js');
  a(diag.indexOf("'engines/world-health.js': 'worldHealth'") >= 0, 'o5v2182/A18: tool-diag MODULE_EXPORTS 登记');
  a(diag.indexOf('function secWorldHealth()') >= 0, 'o5v2182/A19: tool-diag 节函数存在');
  a(diag.indexOf('worldHealth: secWorldHealth()') >= 0, 'o5v2182/A20: tool-diag 诊断对象成员在位');
  a(diag.indexOf('wa-wh-enabled') >= 0 && diag.indexOf('wa-wh-drill-go') >= 0, 'o5v2182/A21: tool-diag UI_BINDINGS 登记本模块控件');
  const pan = readOf('ui/panel.js');
  ['wa-wh-enabled', 'wa-wh-view', 'wa-wh-sources', 'wa-wh-diag', 'wa-wh-drill', 'wa-wh-drill-go', 'wa-wh-out']
    .forEach(function (id) { a(pan.indexOf(id) >= 0, 'o5v2182/A22: 面板渲染 ' + id); });
  a(pan.indexOf("'#wa-wh-drill-go'") >= 0, 'o5v2182/A23: 面板接线（下钻按钮）在位');
  a(pan.indexOf('health: renderHealth') >= 0 || pan.indexOf('renderHealth') >= 0, 'o5v2182/A24: 面板 RENDERERS 挂载');
  a(readOf('tests/run.js').indexOf('|worldHealth:diagnose drill getSettings setSettings sources stat summary|') >= 0,
    'o5v2182/A25: FROZEN2800 逐字含本模块的契约成员集');
  a(/VERSION = '2\.182\.0'/.test(readOf('index.js')) && JSON.parse(readOf('manifest.json')).version === '2.182.0',
    'o5v2182/A26: 版本钉一致（index.js + manifest）');
}

// ── B 段：运行时行为 ─────────────────────────────────────────────────────
function runB(a) {
  const boot = sync.fresh({});
  const WA = boot.WA;
  a(typeof WA.worldHealth === 'object', 'o5v2182/B1: 模块装载');
  a(KEYS.every(function (k) { return typeof WA.worldHealth[k] === 'function'; }), 'o5v2182/B2: 8 口全部可调用');
  a(WA.worldHealth.getSettings().enabled === false, 'o5v2182/B3: 默认关');
  a(WA.worldHealth.summary().reason === 'disabled' && WA.worldHealth.drill('todo', 'commission').reason === 'disabled',
    'o5v2182/B4: 关闭时摘要与下钻**都**拒算（不是只拒一个）');
  WA.worldHealth.setSettings({ enabled: true });
  a(WA.worldHealth.getSettings().enabled === true, 'o5v2182/B5: 开关是活的');
  var sm = WA.worldHealth.summary();
  a(sm.ok === true, 'o5v2182/B6: 摘要可读');
  a(sm.bars && sm.bars.todo && sm.bars.blocked && sm.bars.water, 'o5v2182/B7: 三栏齐备');
  a(sm.barsAsked.join(',') === 'todo,blocked,water', 'o5v2182/B8: 三栏问询顺序稳定');
  a(typeof sm.headline === 'string' && sm.headline.length > 0, 'o5v2182/B9: headline 是一句话（不是数字拼盘）');
  a(sm.note.indexOf('不做任何确认') >= 0, 'o5v2182/B10: 「不做任何确认动作」写在返回体里');
  // ── empty / allClear 可分（本节核心）──
  var tb = sm.bars.todo;
  a(tb.total === 0 && tb.empty === true && tb.allClear === false,
    'o5v2182/B11: 六源全关 ⇒ empty 真 / allClear 假（实 empty=' + tb.empty + ' allClear=' + tb.allClear + '）');
  a(tb.skipped.length >= 1 && tb.skipped.every(function (s) { return typeof s.key === 'string' && typeof s.why === 'string'; }),
    'o5v2182/B12: skipped 逐条带原因');
  a(tb.skipped.some(function (s) { return s.why === 'disabled'; }), 'o5v2182/B13: 关掉的模块进 skipped 且原因就是 disabled');
  a(tb.note.indexOf('玩家能处置') >= 0, 'o5v2182/B14: 待办栏自述口径（只列玩家能处置的）');
  // 开一个源并造真待办
  WA.commission.setSettings({ enabled: true });
  WA.commission.create({ title: '护送商队', principal: '商会', agent: '护卫',
    stages: [{ label: '接洽', deadline: 0 }, { label: '启程', deadline: 0 }] });
  var sm2 = WA.worldHealth.summary();
  var tb2 = sm2.bars.todo;
  a(tb2.total >= 1 && tb2.perSource.commission >= 1, 'o5v2182/B15: 真待办进栏（读口真的走通了）');
  a(tb2.rows.every(function (r) { return r.kind === 'todo' && typeof r.source === 'string' && typeof r.route === 'string'; }),
    'o5v2182/B16: 待办行带 kind/source/route（下钻要靠 route）');
  a(tb2.empty === false && tb2.allClear === false, 'o5v2182/B17: 有待办时两个旗标都为假');
  a(!tb2.skipped.some(function (s) { return s.key === 'commission'; }), 'o5v2182/B18: 开启后不再出现在 skipped');
  a(sm2.headline.indexOf('待办') >= 0, 'o5v2182/B19: 最紧的那件事先进 headline');
  // 上限与覆盖范围
  WA.worldHealth.setSettings({ maxRows: 2 });
  WA.commission.create({ title: 'b', principal: 'p', agent: 'a', stages: [{ label: 's', deadline: 0 }] });
  WA.commission.create({ title: 'c', principal: 'p', agent: 'a', stages: [{ label: 's', deadline: 0 }] });
  var tb3 = WA.worldHealth.summary().bars.todo;
  a(tb3.total >= 3 && tb3.capped === true && tb3.count === 2 && tb3.coverage.indexOf('其余待办仍在世界状态里') >= 0,
    'o5v2182/B20: 截断如实标注覆盖范围（实 total=' + tb3.total + ' count=' + tb3.count + '）');
  WA.worldHealth.setSettings({ maxRows: 6 });
  // 阻塞栏
  var bb = WA.worldHealth.summary().bars.blocked;
  a(typeof bb.total === 'number' && typeof bb.scanned === 'number' && bb.scanned > 50,
    'o5v2182/B21: 阻塞栏扫全部登记模块（实 ' + bb.scanned + ' 个）');
  a(bb.rows.every(function (r) {
    return r.kind === 'blocked' && typeof r.module === 'string' && Array.isArray(r.codes) && typeof r.total === 'number';
  }), 'o5v2182/B22: 阻塞行带 module/codes/total');
  WA.commission.create({ title: '', principal: '', agent: '', stages: [] });
  var bb2 = WA.worldHealth.summary().bars.blocked;
  var cRow = bb2.rows.filter(function (r) { return r.module === 'commission'; })[0];
  a(!!cRow && cRow.codes.length >= 1, 'o5v2182/B23: 真拒收进阻塞栏（各模块自己判，本模块不代判）');
  a(cRow.codes.every(function (c) { return typeof c.code === 'string' && typeof c.hint === 'string'; }),
    'o5v2182/B24: 每个码带 hint 字段（可能为空，但形状稳定）');
  a(bb2.note.indexOf('不搬到这里') >= 0, 'o5v2182/B25: 维护者诊断不搬进玩家面（写在返回体里）');
  // 水位栏
  var wb = WA.worldHealth.summary().bars.water;
  a(typeof wb.scanned === 'number' && wb.scanned > 100, 'o5v2182/B26: 水位栏扫全部声明容器（实 ' + wb.scanned + '）');
  a(wb.wildcardSkipped > 0 && wb.rows.every(function (r) { return r.path.indexOf('*') < 0; }),
    'o5v2182/B27: 通配键不展开且如实计数');
  a(wb.rows.every(function (r) { return r.level === 'full' || r.level === 'near'; }),
    'o5v2182/B28: 水位行**只收满/近满**（本栏是摘要不是全表）');
  WA.store.transact(function (d) {
    d.chronicle = []; for (var i = 0; i < 200; i++) d.chronicle.push({ at: i, what: 'x' + i, kind: 'k' });
  }, 'lock:fill');
  var wb2 = WA.worldHealth.summary().bars.water;
  a(wb2.fullCount >= 1 && wb2.rows.some(function (r) { return r.path === 'chronicle' && r.level === 'full' && r.cap === 200; }),
    'o5v2182/B29: 满容器进水位栏且带 cap');
  a(wb2.allClear === false, 'o5v2182/B30: 有满容器时 allClear 为假');
  // 下钻
  var d1 = WA.worldHealth.drill('todo', 'commission');
  a(d1.ok === true && d1.route === 'commission' && d1.howTo.indexOf('只指路') >= 0, 'o5v2182/B31: 待办下钻只给路由');
  var d2 = WA.worldHealth.drill('blocked', 'commission');
  a(d2.ok === true && d2.module === 'commission', 'o5v2182/B32: 阻塞下钻定位模块');
  a(Array.isArray(d2.settingKeys) && d2.settingKeys.indexOf('worldaxis_commission_settings_v1') >= 0,
    'o5v2182/B33: 设置键**从 registry 反查**（不硬编码）');
  a(typeof d2.hintKnown === 'number' && typeof d2.hintUnknown === 'number'
    && d2.hintKnown + d2.hintUnknown === d2.codes.filter(function (c) { return c.count > 0; }).length,
    'o5v2182/B34: 提示已知/未知分列且与码数之和自洽');
  var d3 = WA.worldHealth.drill('water', 'chronicle');
  a(d3.ok === true && d3.path === 'chronicle' && d3.cap === 200 && d3.len === 200 && d3.level === 'full',
    'o5v2182/B35: 水位下钻报路径/长度/上限/档位');
  a(d3.capSource.indexOf('唯一真源') >= 0, 'o5v2182/B36: 下钻指明 cap 来源（不另立一份 cap 表）');
  a(WA.worldHealth.drill('nope', 'x').ok === false, 'o5v2182/B37: 未知 kind 拒收');
  a(WA.worldHealth.drill('', '').reason === 'missing-fields', 'o5v2182/B38: 空参数 ⇒ missing-fields（与 not-found 分开）');
  a(WA.worldHealth.drill('todo', 'no_such_source').ok === false, 'o5v2182/B39: 未知待办源拒收');
  a(WA.worldHealth.drill('blocked', 'no_such_module').ok === false, 'o5v2182/B40: 未知模块拒收');
  a(WA.worldHealth.drill('water', 'no.such.path').ok === false, 'o5v2182/B41: 未知容器拒收');
  // 只读
  var z1 = JSON.stringify(WA.store.get());
  WA.worldHealth.summary();
  WA.worldHealth.drill('todo', 'commission');
  WA.worldHealth.drill('blocked', 'commission');
  WA.worldHealth.drill('water', 'chronicle');
  WA.worldHealth.sources();
  var z2 = JSON.stringify(WA.store.get());
  a(z1 === z2, 'o5v2182/B42: 只读（连读三栏 + 三种下钻存档逐字节不变）');
  var srcs = WA.worldHealth.sources();
  a(srcs.length === 10, 'o5v2182/B43: 源表 4 基础 + 6 待办源 = 10（实 ' + srcs.length + '）');
  a(srcs.every(function (s) { return typeof s.name === 'string' && typeof s.available === 'boolean'; }),
    'o5v2182/B44: 每源带 availability');
  var dg = WA.worldHealth.diagnose();
  a(dg.closedLoop === true && dg.ok === true && dg.bars.length === 3 && dg.todoSources === 6 && dg.version === '2.182.0',
    'o5v2182/B45: diagnose 闭环 + 3 栏 / 6 待办源 + 版本');
  a(Object.keys(dg.checks).every(function (k) { return dg.checks[k] === true; }), 'o5v2182/B46: 四项自证全真');
  var st = WA.worldHealth.stat();
  a(st.reads >= 1 && st.drills >= 3 && typeof st.byKind.todo === 'number' && st.faults.disabled >= 2,
    'o5v2182/B47: stat 记读数 / 下钻 / 按栏 / 拒收');
  WA.worldHealth.reset();
  a(WA.worldHealth.stat().reads === 0 && WA.worldHealth.stat().drills === 0
    && Object.keys(WA.worldHealth.stat().faults).length === 0, 'o5v2182/B48: reset 清零三面');
  WA.worldHealth.setSettings({ enabled: false });
  a(WA.worldHealth.summary().ok === false && WA.worldHealth.drill('todo', 'commission').ok === false,
    'o5v2182/B49: 关回去仍拒算（开关是活的）');
}

// ── C 段：不变式 ─────────────────────────────────────────────────────────
function runC(a) {
  const boot = sync.fresh({});
  const WA = boot.WA;
  WA.worldHealth.setSettings({ enabled: true });
  a(WA.worldHealth.getSettings().nearRatio === 0.8, 'o5v2182/C1: 小数域默认 0.8 原样保留（不被取整成 1）');
  WA.worldHealth.setSettings({ nearRatio: 0.5 });
  a(WA.worldHealth.getSettings().nearRatio === 0.5, 'o5v2182/C2: 阈值可写下小数（**死旋钮判据**：0.5 必须读回 0.5）');
  WA.worldHealth.setSettings({ nearRatio: 0.9, maxRows: 3 });
  a(WA.worldHealth.getSettings().nearRatio === 0.9 && WA.worldHealth.getSettings().maxRows === 3,
    'o5v2182/C3: 两个子键互不串写');
  a(WA.worldHealth.getSettings().maxFaultModules === 6, 'o5v2182/C4: 未写的子键保持默认（不塌成 undefined）');
  // 近满阈值真的参与判定（0.6 满的容器在 0.5 阈值下进 near，在 0.9 阈值下不进）
  WA.store.transact(function (d) { d.chronicle = []; for (var i = 0; i < 120; i++) d.chronicle.push({ at: i }); }, 'lock:near');
  WA.worldHealth.setSettings({ nearRatio: 0.5 });
  var w1 = WA.worldHealth.summary().bars.water;
  a(w1.rows.some(function (r) { return r.path === 'chronicle' && r.level === 'near'; }),
    'o5v2182/C5: 近满阈值参与判定（0.6 ≥ 0.5 ⇒ near）');
  WA.worldHealth.setSettings({ nearRatio: 0.9 });
  var w2 = WA.worldHealth.summary().bars.water;
  a(!w2.rows.some(function (r) { return r.path === 'chronicle'; }),
    'o5v2182/C6: 阈值调高后同一容器退出本栏 —— 参数真的被用上');
  WA.worldHealth.setSettings({ nearRatio: 0.8 });
  a(JSON.stringify(WA.worldHealth.summary().bars.todo.rows) === JSON.stringify(WA.worldHealth.summary().bars.todo.rows),
    'o5v2182/C7: 同一状态两次读数逐字相同');
  var rows1 = WA.worldHealth.summary().bars.water.rows;
  if (rows1.length) { rows1[0].level = '__mutated__'; }
  a(WA.worldHealth.summary().bars.water.rows.every(function (r) { return r.level !== '__mutated__'; }),
    'o5v2182/C8: 返回的是副本（改返回值不改下一次读数）');
  // 玩家面纯度：摘要不夹带**维护者面专属**字段。
  //   判据分两半，两半都是「形状上可证伪」的：
  //     ① 水位行**逐字**只带玩家看的七个键（维护者面的 `site` / `capDeclared` 不在其中）；
  //     ② 摘要顶层不出现维护者面字段名。
  //   注意 `wildcardSkipped`（通配键计数）与 `lastReason`（拒收原因）**不在禁止表里**：
  //   它们是「为什么不在这里」的答案，正是玩家面需要的；维护者面的是
  //   「原始统计 / 内部路径 / 逐容器全表」那一类。
  var dump = JSON.stringify(WA.worldHealth.summary());
  var waterRows = WA.worldHealth.summary().bars.water.rows;
  var PLAYER_KEYS = ['kind', 'route', 'path', 'len', 'cap', 'ratio', 'level'];
  a(waterRows.every(function (r) { return JSON.stringify(Object.keys(r).sort()) === JSON.stringify(PLAYER_KEYS.slice().sort()); }),
    'o5v2182/C9a: 水位行逐字只带玩家七键（实 ' + JSON.stringify(waterRows.length ? Object.keys(waterRows[0]) : []) + '）');
  a(dump.indexOf('"site"') < 0 && dump.indexOf('"capDeclared"') < 0 && dump.indexOf('"forecast"') >= 0,
    'o5v2182/C9b: 摘要排除维护者字段（site / capDeclared）但保留玩家可读的存盘读数（persistedBytes / forecast）');
}

// ── N 段：负控制（真源码破坏 → 合成宿主装载破坏副本 → 重跑同款真判据）──────
function runN(a) {
  const SRC = srcOf();
  const CASES = [
    { n: 1, why: 'N1: empty 与 allClear 被塌成同一个旗标 ⇒ 「没数据」与「有数据但无事」不可分（本模块的头号禁令）',
      from: '      empty: total === 0 && Object.keys(perSource).length === 0,',
      to: '      empty: total === 0,',
      probe: function (WA) {
        WA.worldHealth.setSettings({ enabled: true });
        var b = WA.worldHealth.summary().bars.todo;
        return [b.empty, b.allClear];
      },
      want: [false, true], stubs: SEED },
    { n: 2, why: 'N2: 关掉的模块被当成「读过了、没待办」⇒ 待办栏的 empty/allClear 判据被污染',
      // 破局点：disabled 分支里的 `return;` 是**唯一**拦住「没读过的源也进 perSource」的东西。
      //   去掉它，代码继续走 list 收集（r.items 是 undefined ⇒ 空表），于是 perSource 多出一个
      //   0 —— 而 `allClear` 的判据正是「有源在读且无待办」，它会因此从「没数据」翻成
      //   「有数据但无事」。两条路在读数上完全一样，而用户看到的结论相反。
      from: "        else skipped.push({ key: s.key, why: clean((r && r.reason) || 'no-result', 30) });\n        return;\n      }",
      to: "        else skipped.push({ key: s.key, why: clean((r && r.reason) || 'no-result', 30) });\n      }",
      probe: function (WA) {
        WA.worldHealth.setSettings({ enabled: true });
        var b = WA.worldHealth.summary().bars.todo;
        return [Object.prototype.hasOwnProperty.call(b.perSource, 'operations'), b.empty, b.allClear];
      },
      want: [false, false, true],
      stubs: function (WA) {
        SEED(WA);
        // 一个**关着**的源：它的待办不出现，但它必须如实进 skipped 而**不进** perSource。
        WA.operations = { pending: function () { return { ok: false, reason: 'disabled' }; }, stat: function () { return {}; } };
      } },
    { n: 3, why: 'N3: 关掉的模块照算 ⇒ 开关是死旋钮',
      from: "    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', bars: null }; }\n    if (!(WA.store && typeof WA.store.get === 'function'))",
      to: "    if (false) { noteFault('disabled'); return { ok: false, reason: 'disabled', bars: null }; }\n    if (!(WA.store && typeof WA.store.get === 'function'))",
      probe: function (WA) { return WA.worldHealth.summary().ok; },
      want: false, stubs: SEED },
    { n: 4, why: 'N4: 截断不标注 ⇒ 「前 N 条都清空了」被读成「全清空」',
      from: '    const capped = total > limit;\n    const kept = capped ? rows.slice(0, limit) : rows;',
      to: '    const capped = false;\n    const kept = capped ? rows.slice(0, limit) : rows;',
      probe: function (WA) {
        WA.worldHealth.setSettings({ enabled: true, maxRows: 2 });
        WA.commission = { pending: function () { return { ok: true, items: [
          { id: 'a', title: 'A', stage: 0, total: 1 }, { id: 'b', title: 'B', stage: 0, total: 1 },
          { id: 'c', title: 'C', stage: 0, total: 1 }] }; }, stat: function () { return {}; } };
        return WA.worldHealth.summary().bars.todo.capped;
      },
      want: true, stubs: SEED },
    { n: 5, why: 'N5: 下钻不计数 ⇒ 「这条线索被查过几次」不可答（归因面缺一格）',
      from: '    _stat.drills++;\n    if (k === \'todo\') {',
      to: '    ;\n    if (k === \'todo\') {',
      probe: function (WA) { WA.worldHealth.setSettings({ enabled: true }); WA.worldHealth.reset(); WA.worldHealth.drill('todo', 'commission'); return WA.worldHealth.stat().drills; },
      want: 1, stubs: SEED },
    { n: 6, why: 'N6: 未知模块照算 ⇒ 下钻给不出路由却报成功（「点了没反应」的读数形态）',
      from: "      if (!m) { noteFault('not-found'); return { ok: false, reason: 'not-found', kind: k, id: key }; }",
      to: "      if (false) { noteFault('not-found'); return { ok: false, reason: 'not-found', kind: k, id: key }; }",
      probe: function (WA) { WA.worldHealth.setSettings({ enabled: true }); return WA.worldHealth.drill('blocked', 'no_such_module').ok; },
      want: false, stubs: SEED }
  ];
  CASES.forEach(function (cs) {
    const hits = SRC.split(cs.from).length - 1;
    a(hits === 1, 'o5v2182/N0(' + cs.n + '): 破坏锚点恰中 1 次（实 ' + hits + '）');
    if (hits !== 1) return;
    const broken = SRC.split(cs.from).join(cs.to);
    a(broken !== SRC, 'o5v2182/Na(' + cs.n + '): 破坏真的改动了源码文本');
    let got = '#threw#';
    try { const WA = hostWith(broken, cs.stubs); got = cs.probe(WA); }
    catch (e) { got = '#threw#:' + (e && e.message); }
    a(JSON.stringify(got) !== JSON.stringify(cs.want),
      'o5v2182/' + cs.why + '（破坏后实得 ' + JSON.stringify(got) + '，原版为 ' + JSON.stringify(cs.want) + '）');
  });
  const W0 = hostWith(SRC, SEED);
  W0.worldHealth.setSettings({ enabled: true });
  var b0 = W0.worldHealth.summary().bars.todo;
  a(b0.empty === false && b0.allClear === true, 'o5v2182/Nb1: （纯度）原版上 empty/allClear 可分');
  W0.worldHealth.reset();
  W0.worldHealth.drill('todo', 'commission');
  a(W0.worldHealth.stat().drills === 1, 'o5v2182/Nb2: （纯度）原版上下钻记账成立');
  a(W0.worldHealth.drill('blocked', 'no_such_module').ok === false, 'o5v2182/Nb3: （纯度）原版上未知模块拒收');
  a(W0.worldHealth.drill('', '').reason === 'missing-fields', 'o5v2182/Nb4: （纯度）原版上空参数报 missing-fields');
  a(SRC.length > 15000, 'o5v2182/Nc: 被破坏的源码面非空（' + SRC.length + ' 字符）');
}

module.exports = { runA: runA, runB: runB, runC: runC, runN: runN, KEYS: KEYS, REL: REL };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runA(a); runB(a); runC(a); runN(a);
  console.log('\nO5 s3-b2-o5-v2182 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}
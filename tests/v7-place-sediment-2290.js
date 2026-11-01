#!/usr/bin/env node
'use strict';
/**
 * tests/v7-place-sediment-2290.js — v2.290.0（V7 EXV7-6 地点沉积）专锁
 *
 * 治的病：`sediment` 有 `feel(place)`（单地点）与 `stat()`（几个标量），
 *   但「世界里哪几处地方还留着事、各自当前最强是什么档、有几条已经淡成传说」
 *   没有任何一处能一屏答出来 —— 只能逐个地点循环 feel，那是调用方各自重算，
 *   不是一份读数。本锁盯的就是新增的 `placesView()` 是否**真投影真源**、
 *   是否**真现算衰减**、是否**真有界**、以及两条消费方（诊断 / 面板）是否真接上。
 *
 * A 静态面：导出与实现锚点、消费方锚点、UI_BINDINGS 登记
 * B 运行时：聚合正确性 / 现算衰减 / 档位分布 / 稳定排序 / 不跨界（不自造地点）
 * C 边界：零写盘 / 关闭态拒收 / 容量截断与 dropped / 参数转发
 * N 真源码破坏负控制：摘掉 placesView 的聚合体 ⇒ 消费方必须现形
 *
 * 纪律：本锁**不在主进程装载产品面**（与 v7 系各锁同规：走 vm 上下文自建 WA）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');
const SED = 'engines/sediment.js';
const DIAG = 'engines/tool-diag.js';
const PANEL = 'ui/panel.js';
const RUN = 'tests/run.js';
const SED_SRC = fs.readFileSync(path.join(BASE, SED), 'utf8');
const DIAG_SRC = fs.readFileSync(path.join(BASE, DIAG), 'utf8');
const PANEL_SRC = fs.readFileSync(path.join(BASE, PANEL), 'utf8');
const RUN_SRC = fs.readFileSync(path.join(BASE, RUN), 'utf8');
let pass = 0, fail = 0;
function a(ok, msg) { if (ok) pass++; else { fail++; console.log('  x ' + msg); } }

function load(override) {
  Object.keys(require.cache).forEach(function (k) {
    if (k.indexOf(path.join(BASE, 'tests')) === 0 || k.indexOf(path.join(BASE, 'engines')) === 0) delete require.cache[k];
  });
  require(path.join(BASE, 'tests/mock.js'));
  try { global.localStorage.clear(); } catch (e) {}
  const m = RUN_SRC.match(/const LOAD = \[([\s\S]*?)\];/);
  const list = vm.runInNewContext('[' + m[1] + ']');
  const ctx = vm.createContext(global);
  for (const rel of list) {
    const p = path.join(BASE, rel);
    if (!fs.existsSync(p)) continue;
    try {
      vm.runInContext(override && override[rel] !== undefined ? override[rel] : fs.readFileSync(p, 'utf8'), ctx, { filename: rel });
    } catch (e) {}
  }
  const WA = global.WorldAxis;
  WA.store.init();
  WA.sediment.setSettings({ enabled: true, traceWindowMs: 86400000 });
  return WA;
}
/** 固定时钟：用冻结虚拟时间做「衰减几步」的可复现断言（不依赖真实墙钟）。 */
function freezeAt(WA, t) { WA.clock.freeze(t); }

function runAll(assertFn) {
  const WA = load();
  const aa = function (ok, msg) { a(ok, msg); if (assertFn) assertFn(ok, msg); };

  // ── A 静态面 ──────────────────────────────────────────────────────
  aa(typeof WA.sediment.placesView === 'function', 'A0 placesView 导出');
  aa(SED_SRC.indexOf('function placesView(opts)') >= 0, 'A1 placesView 实现锚点');
  aa(SED_SRC.indexOf('placesView: placesView,') >= 0, 'A2 导出面接上实现（不是同名空壳）');
  aa(SED_SRC.indexOf('decayedTrace(e.trace, e.at, now, cfg.traceWindowMs)') >= 0,
    'A3 衰走去 decayedTrace 现算（不读回写字段）');
  aa(DIAG_SRC.indexOf('accountsView:') >= 0 && DIAG_SRC.indexOf('WA.sediment.placesView(') >= 0,
    'A4 诊断 secSediment 真消费 placesView');
  aa(PANEL_SRC.indexOf("id=\"wa-sed-places\"") >= 0 && PANEL_SRC.indexOf("on('#wa-sed-places'") >= 0,
    'A5 面板渲染 + 绑定双件齐做');
  aa(DIAG_SRC.indexOf("'wa-sed-places'") >= 0, 'A6 UI_BINDINGS 登记 wa-sed-places（守卫表唯一真源）');

  // ── B 运行时聚合 ──────────────────────────────────────────────────
  freezeAt(WA, 1700000000000);
  const T0 = 1700000000000;
  WA.sediment.settle('旧战场', { key: 'b1', text: '墙根下还留着弹孔', trace: 'scar', at: T0 });
  WA.sediment.settle('旧战场', { key: 'b2', text: '断箭插在土里', trace: 'minor', at: T0 });
  WA.sediment.settle('渡口', { key: 'd1', text: '桩上刻着一道痕', trace: 'marked', at: T0 + 1000 });
  WA.sediment.settle('祠堂', { key: 'c1', text: '门楣上少了半块匾', trace: 'minor', at: T0 - 5000 });

  const v = WA.sediment.placesView();
  aa(v.ok === true, 'B1 placesView ok');
  aa(v.total === 3 && v.rows.length === 3, 'B2 只列已沉积过的地点（实 total=' + v.total + '）');
  const rowOld = v.rows.filter(function (x) { return x.place === '旧战场'; })[0];
  aa(!!rowOld && rowOld.count === 2 && rowOld.alive === 2 && rowOld.legends === 0, 'B3 单地点条数与可辨数');
  aa(!!rowOld && rowOld.peak === 'scar' && rowOld.peakLabel === '遍地残骸',
    'B4 peak 取当前最强档（实 ' + (rowOld && rowOld.peak) + '）');
  aa(v.rows[0].place === '渡口', 'B5 稳定排序：最近一条痕迹降序（实首行 ' + v.rows[0].place + '）');
  aa(v.peakCount.scar === 1 && v.peakCount.marked === 1 && v.peakCount.minor === 1,
    'B6 档位分布 peakCount（实 ' + JSON.stringify(v.peakCount) + '）');
  aa(v.aliveCount === 4 && v.legendCount === 0, 'B7 全局可辨 / 传说计数');

  // 不跨界：world 里登记但没沉积过的地点不进表
  WA.world.addPlace({ name: '空集' });
  const v2 = WA.sediment.placesView();
  aa(v2.total === 3 && v2.rows.every(function (x) { return x.place !== '空集'; }),
    'B8 不自造地点：world 有但没沉积过的地方不进台账');

  // ── 现算衰减：推进 1 档窗口，scar→marked / marked→minor / minor→legend ──
  freezeAt(WA, T0 + 86400000 + 1000);
  const v3 = WA.sediment.placesView();
  const r3 = v3.rows.filter(function (x) { return x.place === '旧战场'; })[0];
  aa(!!r3 && r3.peak === 'marked' && r3.alive === 1 && r3.legends === 1,
    'B9 衰减现算：scar→marked、minor→legend（实 ' + JSON.stringify(r3 && { peak: r3.peak, alive: r3.alive, legends: r3.legends }) + '）');
  aa(v3.legendCount >= 1, 'B10 传说档计入 legendCount');
  // 衰减**不写回**：存档里的 trace 仍是原始档
  const rawRows = (WA.store.get().sediment || {}).rows || [];
  const rawOld = rawRows.filter(function (r) { return r.place === '旧战场'; })[0] || { events: [] };
  aa(rawOld.events.every(function (e) { return e.trace === 'scar' || e.trace === 'minor'; }),
    'B11 衰减不写回存档（写回即第二真源）');

  // ── C 边界 ────────────────────────────────────────────────────────
  const before = JSON.stringify(WA.store.get());
  const st0 = JSON.stringify(WA.sediment.stat());
  WA.sediment.placesView(); WA.sediment.placesView();
  aa(before === JSON.stringify(WA.store.get()), 'C1 placesView 零写盘');
  aa(st0 !== JSON.stringify(WA.sediment.stat()), 'C2 placesView 留下读数计数（placesReads；零计数=调用没发生）');

  const capped = WA.sediment.placesView({ maxPlaces: 2 });
  aa(capped.rows.length === 2 && capped.cap === 2 && capped.truncated === true && capped.dropped === 1,
    'C3 显式容量截断（实 rows=' + capped.rows.length + ' dropped=' + capped.dropped + '）');
  const capped2 = WA.sediment.placesView({ maxRows: 1 });
  aa(capped2.cap === 1 && capped2.rows.length === 1, 'C4 maxRows 别名同样生效');

  WA.sediment.setSettings({ enabled: false });
  const off = WA.sediment.placesView();
  aa(off.ok === false && off.reason === 'disabled', 'C5 关闭态如实拒收（不是空表）');
  WA.sediment.setSettings({ enabled: true });

  // ── N 真源码破坏负控制 ────────────────────────────────────────────
  //   破坏点必须**恰中 1 次**，且破坏要能改行为（不是删判据、不是写死常量）。
  const BRK = '        place: place, count: traces.length, alive: traces.length - legends, legends: legends,';
  aa(SED_SRC.split(BRK).length - 1 === 1, 'N0 破坏锚点恰中 1 次');
  const broken = load({ [SED]: SED_SRC.replace(BRK, '        place: place, count: 0, alive: 0, legends: 0,') });
  freezeAt(broken, T0);
  broken.sediment.settle('旧战场', { key: 'b1', text: 'x', trace: 'scar', at: T0 });
  const bv = broken.sediment.placesView();
  aa(bv.ok === true && bv.rows.length === 1 && bv.rows[0].count === 0 && bv.aliveCount === 0,
    'N1 真源码破坏（聚合体置零）⇒ 台账读数当场现形（实 count=' + (bv.rows[0] || {}).count + '）');
  aa(SED_SRC === fs.readFileSync(path.join(BASE, SED), 'utf8'), 'N2 负控制不改动真源码');
  aa(typeof WA.sediment.placesView === 'function' && WA.sediment.placesView({ maxPlaces: 1 }).total > 0,
    'N3 原版在同一判据上仍真（破坏不是把判据自己删了）');
  return true;
}

function runNegative(assertFn) {
  const aa = function (ok, msg) { a(ok, msg); if (assertFn) assertFn(ok, msg); };
  // 摘掉导出 ⇒ 消费方必须报 module-missing 面，而不是静默空表
  const BRK = '    placesView: placesView,';
  const src = SED_SRC.split(BRK).length - 1;
  aa(src === 1, 'N4 导出锚点恰中 1 次');
  const def = load({ [SED]: SED_SRC.replace(BRK, '') });
  aa(def.sediment.placesView === undefined, 'N5 摘掉导出 ⇒ API 真消失（消费方走 module-missing 分支）');
  aa(DIAG_SRC.indexOf("accountsView: (function () {") >= 0
    && DIAG_SRC.indexOf("typeof WA.sediment.placesView !== 'function'") >= 0,
    'N6 诊断面对「placesView 缺席」有显式分支（不回落成空台账）');
}

module.exports = { runAll, runNegative };
if (require.main === module) {
  try { runAll(); runNegative(); } catch (e) { fail++; console.log('  x threw: ' + e.stack); }
  console.log('EXV7-6 PLACE SEDIMENT LOCK: ' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'pass (' + pass + ')'));
  if (fail) process.exit(1);
}
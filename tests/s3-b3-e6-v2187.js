'use strict';
// WorldAxis tests/s3-b3-e6-v2187.js (v2.187.0) — E6 统一世界地图与关系视图专锁（四段齐备）
//
// 本锁钉的是**否定式核心**（每条都是「不许把两种不同的东西并成同一条读数」）：
//   ① **只读视图**：本模块**零 store 写** —— 它不 `transact`、不建自有状态键。
//      一旦它开始写，「看地图」与「改地图」就分不开了（负控制 N6 真破坏验这条）；
//   ② **两层永不合并**：derived（由两势力态度档位**推导**，每条带 basis）与
//      fact（成对谈成的结果）各自带 `layer`。合并之后「算出来的」会读成「谈成了」；
//   ③ **unknown ≠ 中立**：`diplomacy` 里没有成对条目的一对，**不进事实层** ——
//      它进 `gaps`（显式未知）。把 unknown 折成「中立」是这条边界唯一要防的事；
//   ④ **不为未知地点造坐标**：坐标的唯一真源是 `region.places()`。出现在端点里却
//      不在那儿名字，进 `unplaced` 如实报出，**不补一份坐标**；
//   ⑤ **远近分域不猜**：分域真源是 `farfield.partition()`；它缺席时地点标 `zone:'unknown'`，
//      **不默认成近场**（默认成近场会让「不知道多远」读成「就在旁边」）；
//   ⑥ **到达即移出**：只有 `status === 'transit'` 进在途层，已到 / 已取消的不再画在路上；
//   ⑦ **源缺席与源抛错分列**：前者是模块没装（配置），后者是装了但炸了（故障）。
//
// 装载走 tests/ui-gate-sync.js 的 fresh()（与真装载同源的 LOAD），而不是自拼一份模块清单。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const synthHost = require('./synth-host.js');
const REL = 'engines/atlas.js';
const KEYS = ['getSettings', 'setSettings', 'places', 'routes', 'relations', 'view', 'diagnose', 'stat'];
// 按仓规「无消费方不挂导出」：本模块的消费方是面板区块与诊断节，**没有**注入段，
// 而 resetStat 连产品侧消费方都没有（不导出）。
const MUST_BE_ABSENT = ['resetStat', 'buildBlock'];
function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function readOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function exportBody(src) {
  const at = src.indexOf('WA.atlas = {');
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
/** 合成宿主：真 settingsBus + 真 inputGuard + **真 store**（快照走 store.get，假 store 会掩盖读面差异）。 */
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
/** 宿主注入：抽掉**源模块**（region / faction-graph / economy …）并把 `store.get` 也一并断掉。
 *   为什么必须连 store.get 一起断：真装载环境里这七处的**状态块**本来就住在骨架里
 *   （`region: { places: [], events: [] }` 等），「抽出引擎」只抽得掉**读口**，抽不掉快照里的块。
 *   而「源缺席」这条读数问的是「这个模块在不在」，所以在桩宿主里要把它造干净。 */
function dropSources(WA) {
  ['region', 'farfield', 'sediment', 'economy', 'freight', 'factionGraph', 'diplomacy'].forEach(function (k) { WA[k] = undefined; });
  const keep = WA.store && WA.store.get;
  if (keep) { WA.store.get = function () { return {}; }; }
}
/** 七处来源的**可核对面**桩：形状与真引擎的公开读口一致（不是「随便编一份」，见各条注释）。 */
function SOURCES(WA) {
  // region.places() → [{name, distanceDays, lane, blocked}]（region.js 的导出面第 411 行）
  WA.region = { places: function () { return [
    { name: '青石镇', distanceDays: 0, lane: 'road', blocked: false },
    { name: '山外', distanceDays: 9, lane: 'river', blocked: false }
  ]; } };
  // farfield.partition() → {near, far, nearDays, known}（farfield.js 第 165-177 行）
  WA.farfield = { partition: function () { return {
    near: [{ name: '青石镇', distanceDays: 0 }], far: [{ name: '山外', distanceDays: 9 }], nearDays: 1, known: 2
  }; } };
  // sediment.feel(place) → {ok, place, rows, peak, count}（sediment.js 第 196-216 行）
  WA.sediment = { feel: function (n) { return { ok: true, place: n, rows: [{ label: '清晰可辨', now: 'marked' }], peak: 'marked', count: 1 }; } };
  // economy.routeView(id) → {ok, id, lane, from, to, cost, status}（economy.js 第 434-439 行）
  WA.economy = { routeView: function (id) { return { ok: true, id: id, lane: 'road', from: '青石镇', to: '山外', cost: 3, status: 'open' }; } };
  // freight.view(id) → {ok, id, status, from, to, resource, qty, eta}（freight.js 第 245-264 行）
  WA.freight = { view: function (id) {
    return (id === 'shp_in')
      ? { ok: true, id: id, status: 'transit', from: '青石镇', to: '山外', resource: '盐', qty: 4, eta: 111 }
      : { ok: true, id: id, status: 'arrived', from: '青石镇', to: '山外', resource: '盐', qty: 4, eta: 0 };
  } };
  // factionGraph.buildGraph() → {ok, nodes, edges:[{a,b,tier,derived,basis}]}（faction-graph.js 第 188 行）
  WA.factionGraph = { buildGraph: function () { return { ok: true, nodes: [],
    edges: [{ a: '甲帮', b: '乙帮', tier: '敌对', derived: true, basis: ['evolution.factions[0].relation=敌对'] }] }; } };
  // diplomacy.view() → {ok, pairs:[{a,b,state,stateLabel,activeTerms}]}（diplomacy.js 第 462-468 行）
  //   + pairView(a,b) → {ok, state}（第 483 行起）。这里故意让甲乙**只有派生、没有成对条目**。
  WA.diplomacy = {
    view: function () { return { ok: true, pairs: [
      { a: '丙帮', b: '丁帮', state: 'unknown', stateLabel: '未接触', activeTerms: [] },
      { a: '戊帮', b: '己帮', state: 'accord', stateLabel: '有约', activeTerms: [{ term: 'trade', until: 5 }] }
    ] }; },
    pairView: function () { return { ok: true, state: 'unknown' }; }
  };
  WA.store.transact(function (d) {
    d.economy = { goods: [], orders: [], routes: [{ id: 'r1', lane: 'road', from: '青石镇', to: '山外', cost: 3, status: 'open' }] };
    d.freight = { shipments: [{ id: 'shp_in' }, { id: 'shp_done' }] };
  });
}

// ── A 段：静态契约 ─────────────────────────────────────────────────────
function runA(a) {
  const src = srcOf();
  const body = exportBody(src);
  a(body.length > 0, 'e6/A1: 能从真源码取出 WA.atlas 的对象字面量体');
  KEYS.forEach(function (k) { a(body.indexOf(k + ':') > 0, 'e6/A2: 导出面含 ' + k); });
  MUST_BE_ABSENT.forEach(function (k) { a(body.indexOf(k + ':') < 0, 'e6/A3: 导出面**没有** ' + k); });
  a(/const DEF = \{ enabled: false, maxPlaces: 32, maxEdges: 64, showFacts: true \}/.test(src),
    'e6/A4: 默认关 + 三项参数声明');
  a(/bounds: \{ maxPlaces: \[4, 128\], maxEdges: \[4, 256\] \}/.test(src), 'e6/A5: 区间声明逐字在位');
  a(/LS_KEY = 'worldaxis_atlas_settings_v1'/.test(src), 'e6/A6: 设置键是单一真源');
  a(/module: 'atlas'/.test(src), 'e6/A7: 设置登记 module 为 atlas（settings-registry-only 档的存在性前提）');
  // 边界① 只读
  a(src.indexOf('WA.store.transact') < 0 && src.indexOf('.transact(') < 0,
    'e6/A8: **零 store 写** —— 全文没有 transact（地图是只读视图）');
  // 边界② 两层
  a(/layer: 'derived'/.test(src) && /layer: 'fact'/.test(src), 'e6/A9: 两层各带自己的 layer 标记（永不合并）');
  a(/derived: true/.test(src) && /derived: false/.test(src), 'e6/A10: derived 布尔与层标记同源');
  // 边界③ unknown 不折成中立
  a(/st === 'unknown'\) return;/.test(src) || /if \(!st \|\| st === 'unknown'\) return;/.test(src),
    'e6/A11: unknown 的对**不进事实层**（unknown ≠ 中立）');
  a(/no-pair-record/.test(src) && /unknown ≠ 中立/.test(src), 'e6/A12: 仅派生无事实的一对进 gaps 且逐字写明 unknown ≠ 中立');
  // 边界④ 不造坐标
  a(/endpoint-not-in-region/.test(src) && /不为它们补坐标|不补一份坐标/.test(src),
    'e6/A13: 端点没有坐标 ⇒ 记 unplaced，且逐字写明不补坐标');
  // 边界⑤ 分域不猜
  a(/zone: z \|\| 'unknown'/.test(src), "e6/A14: 分域读不到 ⇒ zone 落 'unknown'（不默认近场）");
  a(/while \(e\) \{\} \} catch \(e\) \{ return \{ '\+'?/.test('') || /partitionOf/.test(src),
    'e6/A15: 分域读 farfield.partition 真源（不另立 nearDays）');
  a(src.indexOf('nearDays: 1') < 0 && src.indexOf('const nearDays') < 0,
    'e6/A16: 本模块**不带** nearDays 默认值（那是 farfield 的设置）');
  // 边界⑥ 到达即移出
  a(/!== 'transit'\) return;/.test(src), "e6/A17: 只有 transit 进在途层（已到 / 已取消移出）");
  // 边界⑦ 源缺席 / 源抛错分列
  a(/source-absent/.test(src) && /source-threw/.test(src),
    'e6/A18: 源缺席与源抛错是两个码（配置问题 ≠ 故障）');
  ['source-absent', 'source-threw', 'disabled', 'facts-off'].forEach(function (c) {
    a(src.indexOf("'" + c + "'") >= 0, 'e6/A19: 拒收/归因码 ' + c + ' 在位');
  });
  a(readOf('index.js').indexOf("'engines/atlas.js'") >= 0, 'e6/A20: index.js LOAD_ORDER 装载');
  a(readOf('tests/run.js').indexOf("'engines/atlas.js'") >= 0, 'e6/A21: tests/run.js LOAD 装载');
  // 装载顺序：atlas 的七处来源都必须排在它之前（否则装载期谓词的源不在场）
  const idx = readOf('index.js');
  const atPos = idx.indexOf("'engines/atlas.js'");
  ['engines/region.js', 'engines/farfield.js', 'engines/economy.js', 'engines/freight.js',
    'engines/faction-graph.js', 'engines/diplomacy.js', 'engines/sediment.js'].forEach(function (f) {
    a(idx.indexOf("'" + f + "'") >= 0 && idx.indexOf("'" + f + "'") < atPos, 'e6/A22: ' + f + ' 排在 atlas 之前');
  });
  const diag = readOf('engines/tool-diag.js');
  a(diag.indexOf("'engines/atlas.js': 'atlas'") >= 0, 'e6/A23: tool-diag MODULE_EXPORTS 登记');
  a(diag.indexOf('function secAtlas()') >= 0, 'e6/A24: tool-diag secAtlas() 存在');
  a(diag.indexOf('atlas: secAtlas()') >= 0, 'e6/A25: tool-diag 诊断对象成员在位');
  const pan = readOf('ui/panel.js');
  // 六枚只读口必须有**真实消费方**（本仓口径：无消费方不挂导出；UI_BINDINGS 只是字符串）
  a(pan.indexOf('WA.atlas.view') >= 0 && pan.indexOf('WA.atlas.places') >= 0 && pan.indexOf('WA.atlas.routes') >= 0
    && pan.indexOf('WA.atlas.relations') >= 0 && pan.indexOf('WA.atlas.diagnose') >= 0 && pan.indexOf('WA.atlas.getSettings') >= 0,
    'e6/A26: 六枚只读口在面板上有真消费方（不是 test-only 挂着）');
  ['wa-at-enabled', 'wa-at-view', 'wa-at-places', 'wa-at-routes', 'wa-at-rel', 'wa-at-unplaced', 'wa-at-diag', 'wa-at-out']
    .forEach(function (id) { a(pan.indexOf(id) >= 0, 'e6/A27: 面板渲染 ' + id); });
  a(pan.indexOf('<div class="wa-sec">统一地图与关系视图</div>') >= 0, 'e6/A28: 分区标题是纯文本形态且含模块身份词');
  a(diag.indexOf("page: 'world', ids: ['wa-at-enabled'") >= 0, 'e6/A29: UI_BINDINGS 登记在**世界页**（与渲染处同页）');
  const mv = (readOf('index.js').match(/VERSION = '([0-9.]+)'/) || [])[1] || '';
  const cmp = function (x, y) {
    const A = String(x).split('.').map(Number), B = String(y).split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0); }
    return 0;
  };
  a(cmp(mv, '2.189.0') >= 0, 'e6/A30: 入口版本不低于本锁的交付基线（实 ' + mv + '）');
}

// ── B 段：运行时行为 ───────────────────────────────────────────────────
function runB(a) {
  const boot = sync.fresh({});
  const WA = boot.WA;
  a(typeof WA.atlas === 'object', 'e6/B1: 模块装载');
  a(KEYS.every(function (k) { return typeof WA.atlas[k] === 'function'; }), 'e6/B2: 全部导出可调用');
  a(WA.atlas.getSettings().enabled === false, 'e6/B3: 默认关');
  a(WA.atlas.view().reason === 'disabled', 'e6/B4: 关闭时 view 拒收 disabled');
  WA.atlas.setSettings({ enabled: true });
  // 空态与读不到**可分**：
  //   · 真装载环境（region 在、世界空）⇒ 地点面 ok:true 且**空**；
  //   · 抽出 region（桩宿主不注入）⇒ ok:false 且报源缺席。
  //   两者若同形，「地图是空的」与「地图根本没画出来」就再也分不开了。
  const pl0 = WA.atlas.places();
  a(pl0.ok === true && pl0.count === 0, 'e6/B5: 源在而世界空 ⇒ ok:true 且 count=0（空 ≠ 读不到）');
  const NO = hostWith(srcOf(), dropSources);
  NO.atlas.setSettings({ enabled: true });
  const plN = NO.atlas.places();
  a(plN.ok === false && plN.reason === 'source-absent' && plN.source === 'region',
    'e6/B5b: region 整块缺席 ⇒ 报 source-absent（**不是**「没有地点」）');
  const rt0 = WA.atlas.routes();
  a(rt0.ok === true && rt0.count === 0, 'e6/B6: 道路面在无路时是**空**（ok:true），与读不到分列');
  const rel0 = WA.atlas.relations();
  a(rel0.ok === true && rel0.derivedCount === 0 && typeof rel0.derivedReason === 'string' && rel0.derivedReason.length > 0,
    'e6/B7: 关系面空时给空 + 层原因（不是把缺席读成「没有关系」）');
  const v0 = WA.atlas.view();
  a(v0.ok === true && v0.empty === true, 'e6/B8: 空图上 empty=true（空 ≠ 读不到）');
  const dg0 = WA.atlas.diagnose();
  a(dg0.deps.region === true && dg0.deps.factionGraph === true && dg0.deps.economy === true && dg0.deps.freight === true
    && dg0.deps.sediment === true && dg0.deps.farfield === true && dg0.deps.diplomacy === true,
    'e6/B9: 真装载环境下七处来源逐项报「在」');
  a(NO.atlas.diagnose().deps.region === false, 'e6/B9b: 抽出 region 后诊断如实报「缺席」');
  a(Object.keys(NO.atlas.diagnose().faults).length >= 1, 'e6/B10: 源缺席进了故障分桶（可复算）');
  WA.atlas.resetStat === undefined;
  a(WA.atlas.resetStat === undefined, 'e6/B11: 不导出没有消费方的 resetStat');

  // 造全源
  const H = hostWith(srcOf(), SOURCES);
  H.atlas.setSettings({ enabled: true });
  const pl = H.atlas.places();
  a(pl.ok === true && pl.count === 2, 'e6/B12: 地点坐标来自 region 真源（2 处）');
  a(pl.places[0].zone === 'near' && pl.places[1].zone === 'far', 'e6/B13: 远近分域来自 farfield 真源');
  a(pl.nearDays === 1, 'e6/B14: 划分线取自分域真源（不重算）');
  a(pl.sources.sediment === true && pl.places[0].traces.count === 1, 'e6/B15: 地点痕迹走 sediment 公开读口');
  const rt = H.atlas.routes();
  a(rt.ok === true && rt.count === 1 && rt.transitCount === 1, 'e6/B16: 道路 1 条 / 在途 1 件（已到的不计）');
  a(rt.transit[0].id === 'shp_in', 'e6/B17: 在途层里只有 transit 的那一件');
  const rel = H.atlas.relations();
  a(rel.derivedCount === 1 && rel.derived[0].layer === 'derived' && rel.derived[0].derived === true,
    'e6/B18: 推导边带 layer:derived 与 derived:true（自报家门）');
  a(rel.derived[0].basis.length === 1, 'e6/B19: 推导边带 basis（可复算的来源）');
  a(rel.factsCount === 1 && rel.facts[0].layer === 'fact' && rel.facts[0].state === 'accord',
    'e6/B20: 事实层只装已成对谈过的那一对');
  // 边界③ 关键一条：unknown 不进事实层
  a(rel.facts.every(function (f) { return f.state !== 'unknown'; }),
    'e6/B21: unknown 的对**不在**事实层（unknown ≠ 中立）');
  a(rel.gaps.length === 1 && rel.gaps[0].a === '甲帮', 'e6/B22: 仅派生无事实的一对进 gaps');
  // 两层不合并：同名的对不会同时出现在两层的「事实」项里
  a(rel.derived.every(function (d) { return d.layer !== 'fact'; })
    && rel.facts.every(function (f) { return f.layer !== 'derived'; }),
    'e6/B23: 两层的 layer 互斥（不存在既 derived 又 fact 的条目）');
  const v = H.atlas.view();
  a(v.ok === true && v.counts.places === 2 && v.counts.derived === 1 && v.counts.facts === 1 && v.counts.gaps === 1,
    'e6/B24: view 一次取全且各层计数分列');
  a(v.empty === false, 'e6/B25: 有内容时 empty=false');
  // 边界⑥ 到达即移出
  H.store.transact(function (d) { d.freight.shipments = [{ id: 'shp_done' }]; });
  a(H.atlas.routes().transitCount === 0 && H.atlas.routes().count === 1,
    'e6/B26: 货物到达后**移出在途层**（道路行还在）');
  // 边界④ 不造坐标
  const H2 = hostWith(srcOf(), function (WA) {
    SOURCES(WA);
    WA.region = { places: function () { return [{ name: '青石镇', distanceDays: 0, lane: 'road' }]; } };
    WA.farfield = { partition: function () { return { near: [{ name: '青石镇' }], far: [], nearDays: 1, known: 1 }; } };
  });
  H2.atlas.setSettings({ enabled: true });
  const rt2 = H2.atlas.routes();
  a(rt2.unplaced.length >= 1 && rt2.unplaced.some(function (u) { return u.name === '山外' && u.why === 'endpoint-not-in-region'; }),
    'e6/B27: 端点「山外」不在 region ⇒ 进 unplaced（**不补坐标**）');
  a(H2.atlas.places().places.every(function (p) { return p.name !== '山外'; }),
    'e6/B28: 未落位的名字**不会**被补进地点表');
  a(H2.atlas.routes().unplaced.every(function (u) { return u.name !== '青石镇'; }),
    'e6/B28b: **有坐标的名字不会被误报为未落位**（否则「缺坐标」这条读数本身不可信）');
  // 边界⑤ 分域读不到 ⇒ unknown，不猜
  const H3 = hostWith(srcOf(), function (WA) {
    SOURCES(WA);
    WA.farfield = undefined;
  });
  H3.atlas.setSettings({ enabled: true });
  const pl3 = H3.atlas.places();
  a(pl3.ok === true && pl3.places.every(function (p) { return p.zone === 'unknown'; }) && pl3.zoneUnknown === 2,
    "e6/B29: farfield 缺席 ⇒ 全部 zone='unknown'（**不默认近场**）");
  a(pl3.nearDays === null, 'e6/B30: 分域读不到时划分线报 null（不是 0）');
  // 边界⑦ 源抛错 ≠ 源缺席
  const H4 = hostWith(srcOf(), function (WA) { SOURCES(WA); WA.region = { places: function () { throw new Error('boom'); } }; });
  H4.atlas.setSettings({ enabled: true });
  a(H4.atlas.places().reason === 'source-threw', 'e6/B31: region 抛错 ⇒ source-threw（与 source-absent 分列）');
  const H5 = hostWith(srcOf(), function (WA) { SOURCES(WA); WA.factionGraph = { buildGraph: function () { return { ok: false, reason: 'no-factions' }; } }; });
  H5.atlas.setSettings({ enabled: true });
  const rel5 = H5.atlas.relations();
  a(rel5.derivedReason === 'no-factions' && H5.atlas.stat().faults['no-factions'] === 1,
    'e6/B32: 源自己的域内码如实归因（**不折成**一句「读不到」）');
  // 边界② 两层可区分：事实层与派生层对同一对给出不同结论
  const H6 = hostWith(srcOf(), function (WA) {
    SOURCES(WA);
    WA.diplomacy = { view: function () { return { ok: true, pairs: [{ a: '甲帮', b: '乙帮', state: 'cold', stateLabel: '冷淡', activeTerms: [] }] }; },
      pairView: function () { return { ok: true, state: 'cold' }; } };
  });
  H6.atlas.setSettings({ enabled: true });
  const rel6 = H6.atlas.relations();
  a(rel6.derived[0].tier === '敌对' && rel6.facts[0].state === 'cold',
    'e6/B33: 同一对在派生层（敌对）与事实层（冷淡）**显示不同且各自可解释**');
  a(rel6.gaps.length === 0, 'e6/B34: 已成对的一对不再进 gaps（gaps 只装「只有派生」的）');
  // 边界① 只读：真跑一遍全部读口，store 写次数必须为 0
  const H7 = hostWith(srcOf(), SOURCES);
  let writes = 0;
  const origTx = H7.store.transact;
  H7.store.transact = function () { writes++; return origTx.apply(this, arguments); };
  H7.atlas.setSettings({ enabled: true });
  H7.atlas.view(); H7.atlas.places(); H7.atlas.routes(); H7.atlas.relations(); H7.atlas.diagnose(); H7.atlas.stat();
  a(writes === 0, 'e6/B35: 跑遍全部读口后 store **零写**（实 ' + writes + '）');
  // 计数器真在动且可复算
  a(H7.atlas.stat().places === 2 && H7.atlas.stat().derived === 1 && H7.atlas.stat().facts === 1,
    'e6/B36: 会话读数与现场一致（places=2 / derived=1 / facts=1）');
}

// ── C 段：接线面 ───────────────────────────────────────────────────────
function runC(a) {
  const src = srcOf();
  a(src.indexOf('bounds: {') >= 0, 'e6/C1: 设置区间声明（settingsBus 越界拒收的前提）');
  a(src.indexOf('WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);') >= 0,
    'e6/C2: 设置键走 __settingsRegs 登记');
  a(src.indexOf('WA.registerModule') >= 0, 'e6/C3: 装载期自注册（模块图需要）');
  a(/module: 'atlas'/.test(src), 'e6/C4: 设置登记的 module 与命名空间同名');
  a(src.indexOf('WA.store.get') >= 0, 'e6/C5: 快照走 store.get 的**公开读面**（不是偷读私有键）');
  a(src.indexOf('WA.store.read') < 0, 'e6/C6: 不绕道 read 取别人的单键（要块就读块）');
  // 只读：不写任何别人的键
  ['diplomacy', 'freight', 'factionGraph', 'economy', 'region', 'sediment', 'farfield'].forEach(function (ns) {
    var wrote = new RegExp('d\\.' + ns + '\\s*=').test(src) || new RegExp('draft\\.' + ns + '\\s*=').test(src);
    a(!wrote, 'e6/C7: 不写 ' + ns + ' 的键（只读它的公开读口）');
  });
  a(src.indexOf('WA.freight.dispatch') < 0 && src.indexOf('WA.economy.route ') < 0
    && src.indexOf('WA.economy.route(') < 0,
    'e6/C8: 不调任何写口（地图不发起货运 / 不开商路）');
}

// ── N 段：真源码破坏 + 两向自证 ─────────────────────────────────────────
function runN(a) {
  const SRC = srcOf();
  const CASES = [
    { n: 1, why: 'N1: unknown 被折成事实 ⇒ 「没谈过」读成「谈过了」',
      from: "          if (!st || st === 'unknown') return;",
      to: "          if (!st) return;",
      probe: function (WA) {
        SOURCES(WA);
        WA.atlas.setSettings({ enabled: true });
        const r = WA.atlas.relations();
        return [r.factsCount, r.gaps.length];
      },
      want: [1, 1] },
    { n: 2, why: 'N2: 推导边被标成事实层 ⇒ 两层合并（算出来的读成谈成的）',
      from: "            layer: 'derived', derived: true, basis: Array.isArray(e.basis) ? e.basis.slice(0, 2) : [] };",
      to: "            layer: 'fact', derived: true, basis: Array.isArray(e.basis) ? e.basis.slice(0, 2) : [] };",
      probe: function (WA) {
        SOURCES(WA);
        WA.atlas.setSettings({ enabled: true });
        const r = WA.atlas.relations();
        return [r.derived[0].layer, r.facts.every(function (f) { return f.layer !== 'derived'; })];
      },
      want: ['derived', true] },
    { n: 3, why: 'N3: 分域读不到时默认近场 ⇒ 「不知道多远」读成「就在旁边」',
      from: "        zone: z || 'unknown',",
      to: "        zone: z || 'near',",
      probe: function (WA) {
        SOURCES(WA);
        WA.farfield = undefined;
        WA.atlas.setSettings({ enabled: true });
        const p = WA.atlas.places();
        return [p.zoneUnknown, p.places[0].zone];
      },
      want: [2, 'unknown'] },
    { n: 4, why: 'N4: 在途过滤失效 ⇒ 早该走完的货永远画在路上',
      from: "      if (clean(v.status, 20) !== 'transit') return;      // 已到 / 已取消 ⇒ 移出地图",
      to: "      if (false) return;      // 已到 / 已取消 ⇒ 移出地图",
      probe: function (WA) {
        SOURCES(WA);
        WA.store.transact(function (d) { d.freight.shipments = [{ id: 'shp_done' }]; });
        WA.atlas.setSettings({ enabled: true });
        return WA.atlas.routes().transitCount;
      },
      want: 0 },
    { n: 5, why: 'N5: 缺坐标的端点被静默吞掉 ⇒ 「缺坐标」这件事在地图上消失（缺就不该看不见）',
      from: "      [v.from, v.to].forEach(function (n) { const k = clean(n, 40); if (k && !known[k]) unplaced.push({ name: k, why: 'endpoint-not-in-region' }); });",
      to: "      [v.from, v.to].forEach(function (n) { const k = clean(n, 40); if (false && k && !known[k]) unplaced.push({ name: k, why: 'endpoint-not-in-region' }); });",
      probe: function (WA) {
        SOURCES(WA);
        WA.region = { places: function () { return [{ name: '青石镇', distanceDays: 0, lane: 'road' }]; } };
        WA.farfield = { partition: function () { return { near: [{ name: '青石镇' }], far: [], nearDays: 1, known: 1 }; } };
        WA.atlas.setSettings({ enabled: true });
        const rt = WA.atlas.routes();
        return rt.unplaced.length;
      },
      want: 1 },
    { n: 5, why: 'N5b: 有坐标的名字被误报成未落位 ⇒ 「缺坐标」这条读数本身不可信',
      from: "      const k = clean(p && p.name, 40); if (k) names[k] = true;",
      to: "      const k = clean(p && p.name, 40); if (k) names[k] = false;",
      probe: function (WA) {
        SOURCES(WA);
        WA.atlas.setSettings({ enabled: true });
        const rt = WA.atlas.routes();
        return [rt.unplaced.length, rt.unplaced[0] ? rt.unplaced[0].name : null];
      },
      want: [0, null] },
    { n: 6, why: 'N6: 只读视图开始写世界 ⇒ 「看地图」变成「改地图」',
      from: "  function snap() { try { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; } catch (e) { return null; } }",
      to: "  function snap() { try { if (WA.store && WA.store.transact) WA.store.transact(function (d) { d.atlasTouched = 1; }); return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; } catch (e) { return null; } }",
      probe: function (WA) {
        SOURCES(WA);
        WA.atlas.setSettings({ enabled: true });
        var writes = 0;
        var orig = WA.store.transact;
        WA.store.transact = function () { writes++; return orig.apply(this, arguments); };
        WA.atlas.view(); WA.atlas.routes();
        WA.store.transact = orig;
        return writes;
      },
      want: 0 },
    { n: 7, why: 'N7: 源抛错被折成源缺席 ⇒ 故障读成「没装这个模块」',
      from: "    try { list = R.places(); } catch (e) { return srcFail('source-threw', 'region'); }",
      to: "    try { list = R.places(); } catch (e) { return srcFail('source-absent', 'region'); }",
      probe: function (WA) {
        WA.region = { places: function () { throw new Error('boom'); } };
        WA.atlas.setSettings({ enabled: true });
        return WA.atlas.places().reason;
      },
      want: 'source-threw' }
  ];
  CASES.forEach(function (cs) {
    const hits = SRC.split(cs.from).length - 1;
    a(hits === 1, 'e6/N0(' + cs.n + '): 破坏锚点恰中 1 次（实 ' + hits + '）');
    if (hits !== 1) return;
    const broken = SRC.split(cs.from).join(cs.to);
    a(broken !== SRC, 'e6/Na(' + cs.n + '): 破坏真的改动了源码文本');
    let got = '#threw#';
    try { const WA = hostWith(broken); got = cs.probe(WA); }
    catch (e) { got = '#threw#:' + (e && e.message); }
    a(JSON.stringify(got) !== JSON.stringify(cs.want),
      'e6/' + cs.why + '（破坏后实得 ' + JSON.stringify(got) + '，原版为 ' + JSON.stringify(cs.want) + '）');
  });
  // 纯度：原版上同款判据必须真
  const W0 = hostWith(SRC, SOURCES);
  W0.atlas.setSettings({ enabled: true });
  const r0 = W0.atlas.relations();
  a(r0.factsCount === 1 && r0.gaps.length === 1, 'e6/Nb1: （纯度）原版上 unknown 不进事实层、进 gaps');
  a(r0.derived[0].layer === 'derived', 'e6/Nb2: （纯度）原版上推导边带 layer:derived');
  const W1 = hostWith(SRC, function (WA) { SOURCES(WA); WA.farfield = undefined; });
  W1.atlas.setSettings({ enabled: true });
  a(W1.atlas.places().places.every(function (p) { return p.zone === 'unknown'; }),
    'e6/Nb3: （纯度）原版上分域读不到 ⇒ 全 unknown');
  const W2 = hostWith(SRC, function (WA) { SOURCES(WA); WA.store.transact(function (d) { d.freight.shipments = [{ id: 'shp_done' }]; }); });
  W2.atlas.setSettings({ enabled: true });
  a(W2.atlas.routes().transitCount === 0, 'e6/Nb4: （纯度）原版上已到的货移出在途层');
  const W3 = hostWith(SRC, function (WA) { WA.region = { places: function () { throw new Error('boom'); } }; });
  W3.atlas.setSettings({ enabled: true });
  a(W3.atlas.places().reason === 'source-threw', 'e6/Nb5: （纯度）原版上源抛错 ⇒ source-threw');
  a(SRC.length > 8000, 'e6/Nc: 被破坏的源码面非空（' + SRC.length + ' 字符）');
}
module.exports = { runA: runA, runB: runB, runC: runC, runN: runN, KEYS: KEYS, REL: REL };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runA(a); runB(a); runC(a); runN(a);
  console.log('\nE6 s3-b3-e6-v2187 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}
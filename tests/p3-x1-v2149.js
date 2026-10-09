#!/usr/bin/env node
// WorldAxis tests/p3-x1-v2149.js —— P3（观测视角贯穿）+ X1（世界沉积层）双锁（v2.149.0）
//
// 【它治的病】
//   P3：视角锁自 v2.142.0 管的是**叙事视角**（这一笔能不能由这个视角交代）。
//       而面板本身是「上帝视角的控制台」——玩家视角下，面板把世界的一切摊在同一屏上。
//       缺口不是「某页写错了」，而是**面板没有「给谁看」这一档**：能读的东西全都在场。
//       本版把观测视角做成面板级开关：切到玩家视角后，带 `data-omniscient` 标记的
//       节点在**重绘出口**被摘除（DOM 层，不是 CSS 隐藏——CSS 隐藏的数据仍在 DOM 里可读）。
//   X1：chronicle / echoes 都是**流水账**——事件发生了、记下来了，然后沉进环形缓冲区，
//       永不与「发生的地点」重新发生关系。后果是玩家路过三个月前的旧战场，世界答不出
//       「这里发生了什么」。本版新增第四件东西：**地点**上沉积了什么（带衰减）。
//
// 【判据全部跑在真源码上】gate.fresh 装载真 LOAD；破坏自证走 opts.srcOverride
//   （把真源码在内存副本上改坏，再重跑同款探针）。
//
// 【正向判据】
//   P3-1 视角成表：VIEWS 是闭集（omniscient / player），表外值拒收并带 allowed（自造视角=自造判定）。
//   P3-2 切换三态：changed:true（真换了）/ changed:false（本来就是这一档，幂等非失败）/ ok:false（表外）。
//   P3-3 落盘往返：切换后重读仍是玩家视角（不是内存态幻觉）。
//   P3-4 applyView 的**真消费方是面板重绘出口**：玩家视角下 data-omniscient 节点被摘除，
//        全知视角下原样保留（两向都判，只判一向的话「恒摘除」也会绿）。
//   P3-5 boundary() 必须带 view 四字段（诊断读的是 boundary，不挂上去那一整段恒取默认值）。
//   P3-6 面板真执行：切到玩家视角 → renderBody → overview 页的 omniscient 块从 DOM 消失；
//        切回全知 → 重新在场（证明过滤挂在重绘出口上，而不是「渲染时就不画」）。
//   X1-1 settle 三态：入账 / 同键只升不降（后来者不许把 scar 降回 minor）/ 表外痕迹档拒收带 allowed。
//   X1-2 缺地点 / 缺键分开拒收（合成一个「没记上」之后用户答不出该补哪一项）。
//   X1-3 feel 现算衰减：过一档窗口降一档；legend 永驻（再衰减也不再降）。
//   X1-4 feel 的 absent 与「空列表」分开（查不到 ≠ 这里什么都没发生过）。
//   X1-5 buildBlock：关闭返回空串；只在场地点念非传说痕迹；legend 不进块（已是最久远的底噪）。
//   X1-6 面板真执行：sediment 页渲染成树，控件 id 与守卫表一致（渲染面 ↔ 接线面）。
//   X1-7 三容器上限登记（capPlaces / capEvents / capTotal）并走 evict 单一出口。
//   X1-8 **引用面 ↔ 导出面**：面板引用的每个 sediment 成员都真的存在（本版实测抓到
//        `setSettings` 只被引用、未被导出——「启用世界沉积层」是一个点了没反应的控件）。
//
// 【负控制】N0 破坏锚点各恰中 1 次；N1 破坏后判据现形；N2 原版全绿（两向自证）；
//   N3 逐锚敏感（一个锚坏掉不把别的面的判据带偏）；N4 破坏副本非空转。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');

const TAG = '__p3x1_2149_';

// ── 破坏锚点：只在真源码里各出现一次 ──
const BROKEN = [
  { key: 'viewgate', rel: 'engines/perspective-lock.js',
    from: "    if (VIEWS.indexOf(to) < 0) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', field: 'view', allowed: VIEWS.slice() }; }\n",
    to:   "    if (false) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', field: 'view', allowed: VIEWS.slice() }; }\n" },
  { key: 'viewfilter', rel: 'engines/perspective-lock.js',
    from: "    if (v !== 'player') return { ok: true, view: v, removed: 0, kept: omni.length };\n",
    to:   "    if (true) return { ok: true, view: v, removed: 0, kept: omni.length };\n" },
  { key: 'boundview', rel: 'engines/perspective-lock.js',
    from: "      view: viewNow(), viewSwitches: view.switches,\n      viewFiltered: view.filtered, viewLastAt: view.lastAt\n",
    to:   "      viewSwitches: view.switches,\n      viewFiltered: view.filtered, viewLastAt: view.lastAt\n" },
  { key: 'tracegate', rel: 'engines/sediment.js',
    from: "    if (TRACES.indexOf(trace) < 0) {\n      noteFault('bad-value');\n      return { ok: false, reason: 'bad-value', field: 'trace', allowed: TRACES.slice() };\n    }\n",
    to:   "    if (false) {\n      noteFault('bad-value');\n      return { ok: false, reason: 'bad-value', field: 'trace', allowed: TRACES.slice() };\n    }\n" },
  { key: 'onlyup', rel: 'engines/sediment.js',
    from: "        const better = TRACES.indexOf(trace) > TRACES.indexOf(prev.trace) ? trace : prev.trace;\n",
    to:   "        const better = trace;\n" },
  { key: 'decay', rel: 'engines/sediment.js',
    from: "    const steps = Math.floor(age / w);\n",
    to:   "    const steps = 0;\n" },
  { key: 'omni', rel: 'ui/panel.js',
    from: "      <div data-omniscient>${heartbeatBlock()}${evictBlock()}${randBlock()}${clockBlock()}${bridgeBlock()}${lonshaBlock()}</div>\n",
    to:   "      <div>${heartbeatBlock()}${evictBlock()}${randBlock()}${clockBlock()}${bridgeBlock()}${lonshaBlock()}</div>\n" },
  { key: 'writeset', rel: 'engines/sediment.js',
    from: "    setSettings: saveSettings,\n",
    to:   "    setSettingsX: saveSettings,\n" }
];

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts); }
function isolated(fn) {
  const LS = global.localStorage;
  const snap = {};
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null) snap[k] = LS.getItem(k); }
  try { return fn(); }
  finally {
    const drop = [];
    for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null && !(k in snap)) drop.push(k); }
    drop.forEach(function (k) { try { LS.removeItem(k); } catch (e) {} });
    Object.keys(snap).forEach(function (k) { try { LS.setItem(k, snap[k]); } catch (e) {} });
  }
}

// ══════════════ P3 探针 ══════════════
function probeViews(WA) {
  const pv = WA.perspective;
  const bad = pv.setView('omniscient-eye');           // 表外值
  const toPlayer = pv.setView('player');
  const again = pv.setView('player');                  // 幂等
  const back = pv.setView('omniscient');
  return {
    views: (pv.VIEWS || []).slice(),
    badOk: bad.ok, badReason: bad.reason, badAllowed: bad.allowed || null,
    pOk: toPlayer.ok, pChanged: toPlayer.changed, pTo: toPlayer.to,
    againOk: again.ok, againChanged: again.changed,
    backOk: back.ok, backChanged: back.changed,
    persisted: pv.getSettings().view
  };
}
function probeApplyView(WA) {
  const doc = WA.__uiDoc || WA.mainDoc;
  const mk = function () {
    const d = doc.createElement('div');
    d.innerHTML = '<div data-omniscient id="' + TAG + 'omni"><b>全知块</b></div><div id="' + TAG + 'plain">普通块</div>';
    doc.body.appendChild(d);
    return d;
  };
  WA.perspective.setSettings({ enabled: true, view: 'omniscient' });
  const host1 = mk();
  const keep = WA.perspective.applyView(doc);
  const omniKept = !!doc.getElementById(TAG + 'omni');
  host1.parentNode && host1.parentNode.removeChild(host1);

  WA.perspective.setSettings({ view: 'player' });
  const host2 = mk();
  const gone = WA.perspective.applyView(doc);
  const omniGone = !doc.getElementById(TAG + 'omni');
  const plainAlive = !!doc.getElementById(TAG + 'plain');
  host2.parentNode && host2.parentNode.removeChild(host2);
  WA.perspective.setSettings({ view: 'omniscient' });
  return { keepRemoved: keep.removed, omniKept: omniKept,
    goneRemoved: gone.removed, omniGone: omniGone, plainAlive: plainAlive };
}
function probeBoundaryView(WA) {
  const b = WA.perspective.boundary();
  return { view: b.view, switches: b.viewSwitches, filtered: b.viewFiltered, lastAt: b.viewLastAt };
}
function probePanelView(WA, dom) {
  const panel = dom.getElementById('wa-panel');
  if (!panel) return { noPanel: true };
  const sel = panel.querySelector('#wa-view-sel');
  if (!sel) return { noSel: true };
  const tabOf = function (p) { return panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === p; })[0]; };
  tabOf('overview').click();
  const bodyOf = function () { return panel.querySelector('.wa-body'); };
  // 数的是**子节点数**（真树），不是 innerHTML.length —— 后者在 mini-DOM 下是解析前的
  //   字符串缓存，摘除节点不改它（实测 9739→9739 的假红）。子节点数才是 DOM 层摘除的判据。
  const lenOf = function () { const b = bodyOf(); return b ? b.childNodes.length : -1; };
  const before = bodyOf().querySelectorAll('[data-omniscient]').length;
  const beforeLen = lenOf();
  sel.value = 'player';
  if (typeof sel.onchange === 'function') sel.onchange({ target: sel });
  const after = bodyOf().querySelectorAll('[data-omniscient]').length;
  // 长度是**独立于标记**的判据：标记自身被摘掉时节点数恒 0，只有「body 有没有变短」
  //   才分得清「过滤生效」与「本来就没标记」（前者 N1 实测踩到的假红）。
  const afterLen = lenOf();
  const outTxt = (panel.querySelector('#wa-view-out') || {}).textContent || '';
  sel.value = 'omniscient';
  if (typeof sel.onchange === 'function') sel.onchange({ target: sel });
  const restored = bodyOf().querySelectorAll('[data-omniscient]').length;
  return { before: before, after: after, restored: restored, outTxt: outTxt,
    beforeLen: beforeLen, afterLen: afterLen };
}

// ══════════════ X1 探针 ══════════════
function probeSettle(WA) {
  const sd = WA.sediment;
  if (typeof sd.setSettings === 'function') sd.setSettings({ enabled: true });
  const a = sd.settle('旧战场', { key: '大战', text: '墙根下还留着弹孔', trace: 'minor' });
  const up = sd.settle('旧战场', { key: '大战', text: '又打了一仗', trace: 'scar' });   // 只升
  const down = sd.settle('旧战场', { key: '大战', text: '有人扫了地', trace: 'minor' }); // 不许降
  const bad = sd.settle('旧战场', { key: 'x', trace: 'epic' });                          // 表外档
  const noPlace = sd.settle('', { key: 'k' });
  const noKey = sd.settle('旧战场', { text: 't' });
  const st = sd.stat();
  return {
    aOk: a.ok, aTrace: a.trace, aUpdated: a.updated,
    upTrace: up.trace, upUpdated: up.updated,
    downTrace: down.trace,
    badOk: bad.ok, badReason: bad.reason, badField: bad.field, badAllowed: bad.allowed || null,
    noPlaceOk: noPlace.ok, noPlaceField: noPlace.field,
    noKeyOk: noKey.ok, noKeyField: noKey.field,
    places: st.places, events: st.events
  };
}
function probeDecay(WA) {
  const sd = WA.sediment;
  const now = Date.now();
  sd.setSettings({ enabled: true, traceWindowMs: 60000 });   // 一档 = 1 分钟（bounds 下限）
  sd.settle('钟楼', { key: 'k1', text: '刚发生', trace: 'scar', at: now });
  sd.settle('钟楼', { key: 'k2', text: '一小时前', trace: 'scar', at: now - 3600000 });
  sd.settle('钟楼', { key: 'k3', text: '很久以前', trace: 'minor', at: now - 86400000 });
  const f = sd.feel('钟楼');
  const byKey = {};
  (f.rows || []).forEach(function (r) { byKey[r.key] = r; });
  const absent = sd.feel('不存在的地方');
  const noPlace = sd.feel('');
  return {
    ok: f.ok, count: f.count, peak: f.peak,
    k1: byKey.k1 ? byKey.k1.now : null,
    k2: byKey.k2 ? byKey.k2.now : null,
    k3: byKey.k3 ? byKey.k3.now : null,
    k3faded: byKey.k3 ? byKey.k3.faded : null,
    absentOk: absent.ok, absentFlag: absent.absent, absentCount: absent.count,
    noPlaceOk: noPlace.ok, noPlaceReason: noPlace.reason
  };
}
function probeBlock(WA) {
  const sd = WA.sediment;
  sd.setSettings({ enabled: true, traceWindowMs: 2592000000, maxItems: 4 });
  sd.settle('旧战场', { key: 'b1', text: '弹孔还在墙上', trace: 'marked', at: Date.now() });
  sd.settle('旧战场', { key: 'b2', text: '烧焦的旗杆', trace: 'minor', at: Date.now() });
  sd.settle('传说之地', { key: 'l1', text: '远古的传说', trace: 'scar', at: Date.now() - 10 * 86400000 * 30 });
  const on = sd.buildBlock('旧战场');
  const legendOnly = sd.buildBlock('传说之地');
  const nowhere = sd.buildBlock('从没去过的地方');
  sd.setSettings({ enabled: false });
  const off = sd.buildBlock('旧战场');
  sd.setSettings({ enabled: true });
  return { on: on, hasHeader: on.indexOf('[此地的历史痕迹]') === 0,
    legendOnly: legendOnly, nowhere: nowhere, off: off };
}
function probeCaps(WA) {
  const sd = WA.sediment;
  const st = sd.stat();
  const cfg = sd.getSettings();
  return { caps: st.caps, cfgCaps: { p: cfg.capPlaces, e: cfg.capEvents, t: cfg.capTotal } };
}
function probeRefs(WA) {
  // 面板引用的每个 sediment 成员都真的存在（引用面 ↔ 导出面）
  const sd = WA.sediment || {};
  const want = ['TRACES', 'LADDER', 'LABEL', 'getSettings', 'setSettings', 'settle', 'feel', 'buildBlock', 'stat'];
  const miss = want.filter(function (k) { return typeof sd[k] === 'undefined'; });
  const src = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
  const used = ['setSettings', 'settle', 'feel', 'buildBlock', 'stat', 'getSettings', 'TRACES', 'LABEL'];
  const usedMiss = used.filter(function (k) { return src.indexOf('WA.sediment.' + k) < 0; });
  return { miss: miss, usedMiss: usedMiss };
}
function probePanelSediment(WA, dom) {
  const panel = dom.getElementById('wa-panel');
  const tab = panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'sediment'; })[0];
  if (!tab) return { noTab: true };
  tab.click();
  const body = panel.querySelector('.wa-body');
  const ids = ['wa-sed-enabled', 'wa-sed-place', 'wa-sed-trace', 'wa-sed-key', 'wa-sed-text',
    'wa-sed-settle', 'wa-sed-feel', 'wa-sed-block', 'wa-sed-stat', 'wa-sed-out'];
  const inTree = ids.filter(function (id) { return !!body.querySelector('#' + id); });
  // 总开关真能写：点一下 → 设置层落盘。
  //   起点必须**显式置假**：本探针会被负控制组复用，而前一组的探针已把这个键写成 true
  //   并落盘 —— 在脏起点上「点了有没有反应」恒为 true（N1h 实测踩到的假红）。
  //   故先删该设置键（环境层复位，不经产品口），记 before / after 两个读数。
  try { global.localStorage.removeItem('worldaxis_sediment_settings_v1'); } catch (e) {}
  const before = WA.sediment.getSettings().enabled;
  const el = body.querySelector('#wa-sed-enabled');
  let wrote = null;
  if (el) {
    el.checked = true;
    if (typeof el.onchange === 'function') el.onchange({ target: el });
    wrote = WA.sediment.getSettings().enabled;
  }
  return { present: inTree.length, want: ids.length, wrote: wrote, before: before };
}

// ══════════════ 判据 ══════════════
function judge(a) {
  // ── P3 ──
  const envP = fresh();
  const WA = envP.WA;

  const v = probeViews(WA);
  a(v.views.length === 2 && v.views.indexOf('omniscient') >= 0 && v.views.indexOf('player') >= 0,
    'v2149: [P3-1] 观测视角成表且是闭集（实 ' + JSON.stringify(v.views) + '）');
  a(v.badOk === false && v.badReason === 'bad-value' && v.badAllowed && v.badAllowed.length === 2,
    'v2149: [P3-1b] 表外视角如实拒收并带 allowed（自造视角等于自造判定；实 ' + v.badReason + '/' + JSON.stringify(v.badAllowed) + '）');
  a(v.pOk === true && v.pChanged === true && v.pTo === 'player',
    'v2149: [P3-2] 切到玩家视角：ok 且 changed（实 ok=' + v.pOk + ' changed=' + v.pChanged + '）');
  a(v.againOk === true && v.againChanged === false,
    'v2149: [P3-2b] 重复切同一档是幂等（changed:false 不是失败；实 ' + v.againChanged + '）');
  a(v.backOk === true && v.backChanged === true,
    'v2149: [P3-2c] 切回全知视角：ok 且 changed');
  a(v.persisted === 'omniscient',
    'v2149: [P3-3] 切换真落盘（重读设置得到 ' + v.persisted + '）');

  const av = probeApplyView(WA);
  a(av.omniKept === true && av.keepRemoved === 0,
    'v2149: [P3-4] 全知视角下 data-omniscient 节点原样保留（实 removed=' + av.keepRemoved + '）');
  a(av.omniGone === true && av.goneRemoved >= 1 && av.plainAlive === true,
    'v2149: [P3-4b] 玩家视角下全知块被摘除、普通块留下（DOM 层摘除，不是 CSS 隐藏；实 removed=' + av.goneRemoved + '）');

  const bv = probeBoundaryView(WA);
  a(bv.view === 'omniscient' && typeof bv.switches === 'number' && typeof bv.filtered === 'number',
    'v2149: [P3-5] boundary() 带 view 四字段（诊断读的是 boundary，不挂上去那一段恒取默认值；实 view=' + bv.view + '）');
  WA.perspective.setView('player');
  a(probeBoundaryView(WA).view === 'player',
    'v2149: [P3-5b] 切换后 boundary().view 跟随（诊断看得见「谁把它切到了玩家视角」）');
  WA.perspective.setView('omniscient');

  const pv = probePanelView(WA, envP.dom);
  a(pv.before >= 1 && pv.after === 0 && pv.restored >= 1 && pv.afterLen < pv.beforeLen,
    'v2149: [P3-6] 面板真执行：玩家视角下 overview 的 omniscient 块离树且 body 变短、切回后在场（实 '
      + pv.before + '→' + pv.after + '→' + pv.restored + ' 子节点 ' + pv.beforeLen + '→' + pv.afterLen + '）');
  a(String(pv.outTxt).length > 0,
    'v2149: [P3-6b] 选择器给出回执（不是静默切换；实「' + String(pv.outTxt).slice(0, 40) + '」）');

  // ── X1 ──
  const envX = fresh();
  const WX = envX.WA;
  const s = probeSettle(WX);
  a(s.aOk === true && s.aTrace === 'minor' && s.aUpdated === false,
    'v2149: [X1-1] settle 入账（新增：updated=false，实 ' + s.aTrace + '）');
  a(s.upOk !== false && s.upTrace === 'scar' && s.upUpdated === true,
    'v2149: [X1-1b] 同键再登记只刷新且痕迹**只升不降**（minor→scar，实 ' + s.upTrace + '）');
  a(s.downTrace === 'scar',
    'v2149: [X1-1c] 后来者不许把 scar 降回 minor（「这里曾经遍地残骸」是事实；实 ' + s.downTrace + '）');
  a(s.badOk === false && s.badReason === 'bad-value' && s.badField === 'trace' && s.badAllowed && s.badAllowed.length === 3,
    'v2149: [X1-1d] 表外痕迹档如实拒收并带 field/allowed（实 ' + s.badReason + '/' + s.badField + '）');
  a(s.noPlaceOk === false && s.noPlaceField === 'place',
    'v2149: [X1-2] 缺地点如实拒收且 field=place（实 ' + s.noPlaceField + '）');
  a(s.noKeyOk === false && s.noKeyField === 'key',
    'v2149: [X1-2b] 缺键如实拒收且 field=key（两码不合成一个「没记上」；实 ' + s.noKeyField + '）');
  a(s.places === 1 && s.events === 1,
    'v2149: [X1-2c] 同键不堆行（旧战场 1 处 1 条，实 ' + s.places + ' 处 ' + s.events + ' 条）');

  const d = probeDecay(WX);
  a(d.k1 === 'scar' && d.k2 === 'legend' && d.k3 === 'legend',
    'v2149: [X1-3] 衰减现算：0 分钟=scar / 60 分钟已降到 legend / 一天前=legend（实 ' + d.k1 + ',' + d.k2 + ',' + d.k3 + '）');
  a(d.k3faded === true,
    'v2149: [X1-3b] 已淡的痕迹标 faded（读数看得出「现在是哪一档」；实 ' + d.k3faded + '）');
  a(d.absentOk === true && d.absentFlag === true && d.absentCount === 0,
    'v2149: [X1-4] 查不到的地点：ok=true 且 absent 标记（「查不到」≠「什么都没发生过」）');
  a(d.noPlaceOk === false && d.noPlaceReason === 'missing-fields',
    'v2149: [X1-4b] 空地点 feel 如实拒收（实 ' + d.noPlaceReason + '）');

  const bl = probeBlock(WX);
  a(bl.hasHeader && bl.on.indexOf('弹孔还在墙上') > 0,
    'v2149: [X1-5] buildBlock 在场地点的块含痕迹正文（实 ' + bl.on.length + ' 字符）');
  a(bl.legendOnly === '',
    'v2149: [X1-5b] 只剩传说档时不进块（它已是最久远的底噪，再占预算就挤掉近事）');
  a(bl.nowhere === '', 'v2149: [X1-5c] 无沉积的地点返回空串（不编造）');
  a(bl.off === '', 'v2149: [X1-5d] 总开关关闭时返回空串');

  const cp = probeCaps(WX);
  a(cp.caps && cp.caps.places > 0 && cp.caps.events > 0 && cp.caps.total > 0
    && cp.cfgCaps.p === cp.caps.places && cp.cfgCaps.e === cp.caps.events && cp.cfgCaps.t === cp.caps.total,
    'v2149: [X1-7] 三容器上限登记且读数与设置同源（实 ' + JSON.stringify(cp.caps) + '）');

  const rf = probeRefs(WX);
  a(rf.miss.length === 0,
    'v2149: [X1-8] 面板引用的 sediment 成员全部真存在（缺 ' + (rf.miss.join(',') || '无') + '）');
  a(rf.usedMiss.length === 0,
    'v2149: [X1-8b] 反向：导出面这九口在面板里都有真引用面（缺 ' + (rf.usedMiss.join(',') || '无') + '）');

  const ps = probePanelSediment(WX, envX.dom);
  a(ps.present === ps.want && ps.want === 10,
    'v2149: [X1-6] 沉积页十枚控件渲染成树（实 ' + ps.present + '/' + ps.want + '）');
  a(ps.before === false && ps.wrote === true,
    'v2149: [X1-6b] 面板总开关真能写进设置层（起点 ' + ps.before + ' → 点后 ' + ps.wrote + '）');
}

// ══════════════ 负控制 ══════════════
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
  return { [spec.rel]: src.replace(spec.from, spec.to) };
}
function probeWith(spec, fn) {
  const env = fresh({ srcOverride: brokenOverride(spec) });
  return fn(env.WA, env.dom);
}
function probeClean(fn) {
  const env = fresh();
  return fn(env.WA, env.dom);
}

function runNegative(a) {
  const byKey = {};
  BROKEN.forEach(function (s) { byKey[s.key] = s; });

  // N0 破坏锚点恰中 1 次
  const bad = [];
  BROKEN.forEach(function (spec) {
    const src = fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
    const hits = src.split(spec.from).length - 1;
    if (hits !== 1) bad.push(spec.key + '(' + hits + ')');
  });
  a(bad.length === 0, 'v2149: [N0] 八个破坏锚点在真源码中各恰中 1 次（异: ' + (bad.join(',') || '无') + '）');

  // N0b 破坏副本非空转
  const nonEmpty = BROKEN.every(function (spec) {
    return brokenOverride(spec)[spec.rel] !== fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
  });
  a(nonEmpty, 'v2149: [N0b] 八种破坏的内存副本都与真源码不同（非空转）');

  // N1 破坏后判据现形
  const bView = probeWith(byKey.viewgate, probeViews);
  a(bView.badOk !== false,
    'v2149: [N1a] 视角表外拒收被拆掉 ⇒ 自造视角被放行（实 ok=' + bView.badOk + '）');

  const bFilter = probeWith(byKey.viewfilter, probeApplyView);
  a(bFilter.omniGone !== true,
    'v2149: [N1b] 玩家视角过滤被短路 ⇒ 全知块在玩家视角下仍在（实 gone=' + bFilter.omniGone + '）');

  const bBound = probeWith(byKey.boundview, probeBoundaryView);
  a(bBound.view !== 'player',
    'v2149: [N1c] boundary 不挂 view ⇒ 诊断看不到当前档（实 ' + bBound.view + '）');

  const bTrace = probeWith(byKey.tracegate, probeSettle);
  a(bTrace.badOk !== false,
    'v2149: [N1d] 痕迹档表外拒收被拆掉 ⇒ 自造档位被放行（实 ok=' + bTrace.badOk + '）');

  const bUp = probeWith(byKey.onlyup, probeSettle);
  a(bUp.downTrace !== 'scar',
    'v2149: [N1e] 「只升不降」被拆掉 ⇒ 后来者把 scar 降回 minor（实 ' + bUp.downTrace + '）');

  const bDecay = probeWith(byKey.decay, probeDecay);
  a(bDecay.k2 !== 'legend',
    'v2149: [N1f] 衰减步数被写死 0 ⇒ 一小时前的痕迹仍停在 scar（实 ' + bDecay.k2 + '）');

  const bOmni = probeWith(byKey.omni, probePanelView);
  // 判「玩家视角下 body 有没有变短」而不是数标记节点：标记被摘掉时节点数恒 0，
  //   数节点分不出「被过滤」与「本来就没标记」（这正是本锚要证的失效模式）。
  a(!(bOmni.afterLen < bOmni.beforeLen),
    'v2149: [N1g] overview 的 omniscient 标记被摘掉 ⇒ 玩家视角下该块照旧在场、子节点数不变（实 '
      + bOmni.beforeLen + '→' + bOmni.afterLen + '）');

  const bWrite = probeWith(byKey.writeset, probePanelSediment);
  a(bWrite.before === false && bWrite.wrote !== true,
    'v2149: [N1h] 导出面把 setSettings 改名 ⇒ 面板总开关点了没反应（起点 ' + bWrite.before + ' → 点后 ' + bWrite.wrote + '）');

  // N2 原版两向自证
  const cViews = probeClean(probeViews);
  a(cViews.badOk === false && cViews.pChanged === true && cViews.againChanged === false,
    'v2149: [N2a] 原版源码上视角三态判据全绿');
  const cApply = probeClean(probeApplyView);
  a(cApply.omniKept === true && cApply.omniGone === true,
    'v2149: [N2b] 原版源码上过滤两向判据全绿（保留 / 摘除）');
  const cSettle = probeClean(probeSettle);
  a(cSettle.upTrace === 'scar' && cSettle.downTrace === 'scar' && cSettle.badOk === false,
    'v2149: [N2c] 原版源码上入账 / 只升不降 / 表外拒收全绿');
  const cDecay = probeClean(probeDecay);
  a(cDecay.k1 === 'scar' && cDecay.k2 === 'legend' && cDecay.absentFlag === true,
    'v2149: [N2d] 原版源码上衰减与 absent 判据全绿');
  const cPanel = probeClean(probePanelView);
  a(cPanel.before >= 1 && cPanel.after === 0 && cPanel.restored >= 1,
    'v2149: [N2e] 原版源码上面板视角切换端到端全绿');
  const cSed = probeClean(probePanelSediment);
  a(cSed.present === 10 && cSed.wrote === true,
    'v2149: [N2f] 原版源码上沉积页十控件与总开关写入全绿');

  // N3 逐锚敏感
  const x1 = probeWith(byKey.viewgate, probeApplyView);
  a(x1.omniGone === true, 'v2149: [N3a] viewgate 破坏不影响 DOM 过滤判据（逐锚敏感）');
  const x2 = probeWith(byKey.decay, probeSettle);
  a(x2.upTrace === 'scar' && x2.downTrace === 'scar', 'v2149: [N3b] decay 破坏不影响只升不降判据（逐锚敏感）');
  const x3 = probeWith(byKey.tracegate, probeDecay);
  a(x3.k1 === 'scar' && x3.k2 === 'legend', 'v2149: [N3c] tracegate 破坏不影响衰减判据（逐锚敏感）');
  const x4 = probeWith(byKey.omni, probeViews);
  a(x4.pChanged === true && x4.badOk === false, 'v2149: [N3d] omni 破坏不影响视角三态判据（逐锚敏感）');
  // 不能用 probeSettle 做这一格：它第一行就调 sd.setSettings，锚坏掉时直接抛
  //   （探针自己成了污染源，测出来的不是「别的面有没有被带偏」）。
  const x5 = probeWith(byKey.writeset, probeApplyView);
  a(x5.omniGone === true && x5.omniKept === true,
    'v2149: [N3e] writeset 破坏不影响观测视角的 DOM 过滤判据（逐锚敏感）');
  const x6 = probeWith(byKey.boundview, probeViews);
  a(x6.pChanged === true, 'v2149: [N3f] boundview 破坏不影响切换判据（逐锚敏感）');
}

function runAll(a) { isolated(function () { judge(a); }); }

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name); }
  };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (fail) { console.log('P3-X1-V2149: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('P3-X1-V2149: pass（' + pass + ' 项）');
}
module.exports = { runAll: runAll, runNegative: runNegative, brokenOverride: brokenOverride };
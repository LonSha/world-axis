#!/usr/bin/env node
/**
 * v2.266.0, 2.267.0（V6 · EXV6-2）接线锁：**人物今日动线在产品侧真的被玩家看到了吗**
 *
 * ── 为什么还要一把锁 ───────────────────────────────────────────────────────
 *  `tests/day-route-v2266.js` 判的是**引擎语义**（三段三态 / 地名五栏 / 日程四域 /
 *  零写盘）。它全绿也只证明「引擎算得对」—— 本仓反复裁决过的那类失效
 *  （引擎算得对，玩家在面板上看不到 = 功能不存在）它管不着。
 *
 *  本锁只判接线，读的是**渲染产物与真实点击链路**，不是源码字面量：
 *    A 面 概览页渲染成型（动线块进树 / class 承载态 / 行数与引擎同源 / 三种零读数分开）
 *    B 面 点击链路真跑到引擎（设置页改设置 → 引擎设置真的变了 → 概览页跟着变）
 *    C 面 诊断节读数在场且分行（五栏地名 / 三栏日程 / 判域自证 / 零构建与关着分开）
 *    D 面 登记面完整（UI_BINDINGS 七枚控件全登记；LOAD 双登记同序）
 *    N 面 负控制（真源码破坏 → 破坏副本上重跑同款判据必现形；原版上必真）
 *
 * ── 本锁刻意不判什么 ───────────────────────────────────────────────────────
 *  · 不判句子措辞（那是引擎的事，v2266 已判；这里再判一份就是第二个措辞真源）
 *  · 不判 CSS 长什么样（样式无契约，判它只会让每次调色都要改测试）
 *  · 不判日程时间域语义（C 段只看诊断节是否把三栏如实报出，判域本身在引擎锁）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const ENG_REL = 'engines/day-route.js';
const PANEL_REL = 'ui/panel.js';
const SET_REL = 'ui/settings.js';
const DIAG_REL = 'engines/tool-diag.js';
const IDX_REL = 'index.js';
const RUN_REL = 'tests/run.js';
const SELF_REL = 'tests/day-route-ui-v2266.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }

function runAll(assertFn) {
  require(path.join(BASE, 'tests/mock.js'));
  let pass = 0, fail = 0;
  const fails = [];
  const a = function (ok, name) {
    if (ok) { pass++; } else { fail++; fails.push(name); }
    if (typeof assertFn === 'function') assertFn(ok, name);
  };
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const P = rd(PANEL_REL), S = rd(SET_REL), D = rd(DIAG_REL), SELF = rd(SELF_REL);

  /** 打开面板并切到某页，返回该页 body 产物的文本面 */
  function pageHtml(env, page) {
    const WA = env.WA, dom = env.dom;
    const panel = dom.getElementById('wa-panel');
    if (WA.ui && typeof WA.ui.open === 'function') WA.ui.open();
    if (WA.ui && typeof WA.ui.goPage === 'function') WA.ui.goPage(page);
    const body = panel.querySelector('.wa-body');
    return { html: String((body && body.innerHTML) || ''), body: body, panel: panel };
  }
  function freshEnv(ov) {
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    const env = gate.fresh(ov ? { srcOverride: ov } : {});
    const WA = env.WA;
    WA.store.init();
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    return env;
  }
  function breakOnce(src, anchor, rep, tag) {
    const n = cnt(src, anchor);
    if (n !== 1) throw new Error(tag + ': 锚点须恰中 1 次（实 ' + n + '）—— 工具自证');
    return src.split(anchor).join(rep);
  }
  /** 造一个「此刻在集市赶集、life 开着、目标有下一步」的人物（走产品既有容器，不新开） */
  function seedPerson(WA, opt) {
    const o = opt || {};
    const t = WA.clock.now('seed');
    WA.store.transact(function (d) {
      d.people = d.people || {};
      d.people['p_老周'] = {
        name: '老周',
        location: o.location || '集市',
        life: {
          lastDecision: { action: o.action || 'work', reason: 'schedule' },
          schedule: o.schedule || [],
          goals: o.goals === undefined ? [{ text: '把货出手', status: 'active', next: '去钱庄' }] : o.goals,
          commitments: []
        }
      };
    }, 'v2266ui:seed');
    return t;
  }
  /** 让「世界日记边界口」可用：配齐身份 + 开 noesis（动线复用它的 boundary） */
  function armBoundary(WA) {
    WA.worldBridge.setSettings({ worldTitle: '临水镇', playerName: '沈砚' });
    WA.noesis.setSettings({ enabled: true, rangeEnabled: true });
  }

  // ════ A 面：概览页渲染成型 ══════════════════════════════════════════════
  //   A1 引擎与面板都在场（没有它，下面每条判据都退化成在空集上恒真）
  {
    const env = freshEnv();
    const WA = env.WA;
    a(!!WA.dayRoute && typeof WA.dayRoute.build === 'function', 'v2266ui/A1: dayRoute 已装载');
    a(!!WA.uiSettings, 'v2266ui/A1b: uiSettings 已装载');
  }
  //   A2 概览页渲染出动线块（且不是「不可用」降级态）
  {
    const env = freshEnv();
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('id="wa-route-block"') >= 0,
      'v2266ui/A2: 概览页渲染出动线块 #wa-route-block（实 ' + (r.html.indexOf('id="wa-route-block"') >= 0) + '）');
    a(r.html.indexOf('人物动线读数不可用') < 0, 'v2266ui/A2b: 不是「引擎缺席」降级态');
    const el = env.dom.getElementById('wa-route-block');
    a(!!el, 'v2266ui/A2c: 动线块在 DOM 树内（不是游离字符串）');
  }
  //   A3 空态：说得出「确实没有」，且带稳定 class
  {
    const env = freshEnv();
    const r = pageHtml(env, 'overview');
    const el = env.dom.getElementById('wa-route-block');
    const txt = el ? String(el.textContent || '') : '';
    a(!!el && String(el.className || '').indexOf('wa-route-quiet') >= 0,
      'v2266ui/A3: 空态带 wa-route-quiet class（类名是契约，文字会改；实 ' + j(el && el.className) + '）');
    a(txt.indexOf('还没有可读的') >= 0 || txt.indexOf('读不到依据') >= 0,
      'v2266ui/A3b: 空态说得出「没有可读的」（实 ' + j(txt.slice(0, 60)) + '）');
    a(r.html.indexOf('读数不可用') < 0, 'v2266ui/A3c: 空态不被渲染成「读数不可用」—— 那是没装上，不是没事');
  }
  //   A4 有事实时：行数与引擎同源（面板不另算一份 —— 另算就是第二个措辞真源）
  {
    const env = freshEnv();
    const WA = env.WA;
    armBoundary(WA);
    WA.life.setSettings({ enabled: true });
    seedPerson(WA);
    const r = pageHtml(env, 'overview');
    const el = env.dom.getElementById('wa-route-block');
    a(!!el && String(el.className || '').indexOf('wa-route-live') >= 0,
      'v2266ui/A4: 有事实时带 wa-route-live class（实 ' + j(el && el.className) + '）');
    const b = WA.dayRoute.build();
    const lines = b.lines || [];
    a(lines.length > 0, 'v2266ui/A4b: （前置）引擎这一轮确实说出了行（实 ' + lines.length + '）');
    const missing = lines.filter(function (l) {
      return r.html.indexOf(String(l).replace(/&/g, '&amp;')) < 0 && r.html.indexOf(String(l)) < 0;
    });
    a(missing.length === 0, 'v2266ui/A4c: 引擎句子逐行进入 DOM（缺 ' + j(missing) + '）');
    const n = cnt(r.html, 'class="wa-route-line"');
    a(n === lines.length, 'v2266ui/A4d: DOM 行数与引擎行数一致（DOM ' + n + ' / 引擎 ' + lines.length + '）');
    // 日子头部：动线语义是「今天」，不给日子等于让玩家自己去别处对
    a(r.html.indexOf('第1日的动线') >= 0 || r.html.indexOf('日子读不到') >= 0,
      'v2266ui/A4e: 块头带日子（或如实说读不到）');
  }
  //   A5 关闭时：只留一行「已关闭」，不铺空块、不谎称没事
  {
    const env = freshEnv();
    const WA = env.WA;
    WA.dayRoute.setSettings({ enabled: false });
    armBoundary(WA);
    WA.life.setSettings({ enabled: true });
    seedPerson(WA);
    const r = pageHtml(env, 'overview');
    const el = env.dom.getElementById('wa-route-block');
    const txt = el ? String(el.textContent || '') : '';
    a(txt.indexOf('已关闭') >= 0, 'v2266ui/A5: 关着时说「已关闭」（实 ' + j(txt.slice(0, 50)) + '）');
    a(txt.indexOf('没有可读的') < 0, 'v2266ui/A5b: 关着时**不**说「没有可读的」—— 关着 ≠ 没人');
    a(cnt(r.html, 'class="wa-route-line"') === 0, 'v2266ui/A5c: 关着时零行（不渲染旧行）');
  }
  //   A6 切页计量：动线块只在概览页求值（OPT-9 惰性口径）
  {
    const env = freshEnv();
    const WA = env.WA;
    armBoundary(WA);
    WA.life.setSettings({ enabled: true });
    seedPerson(WA);
    pageHtml(env, 'overview');
    const n0 = WA.dayRoute.stat().builds;
    WA.ui.goPage('world');
    const n1 = WA.dayRoute.stat().builds;
    a(n1 === n0, 'v2266ui/A6: 切到世界页零 build（动线块只在概览页求值；实 ' + n0 + '→' + n1 + '）');
    WA.ui.goPage('overview');
    const n2 = WA.dayRoute.stat().builds;
    a(n2 === n1 + 1, 'v2266ui/A6b: 切回概览页恰多 build 一次（实 ' + n1 + '→' + n2 + '）');
  }
  //   A7 上限：maxPeople 生效（页面行数跟着设置走，不是写死的）
  {
    const env = freshEnv();
    const WA = env.WA;
    armBoundary(WA);
    WA.life.setSettings({ enabled: true });
    for (let i = 0; i < 4; i++) {
      WA.store.transact(function (d) {
        d.people = d.people || {};
        d.people['p_甲' + i] = { name: '甲' + i, location: '集市',
          life: { lastDecision: { action: 'work', reason: 'schedule' }, schedule: [], goals: [{ text: '做事', status: 'active' }] } };
      }, 'v2266ui:seed' + i);
    }
    WA.dayRoute.setSettings({ maxPeople: 2 });
    const r = pageHtml(env, 'overview');
    const n = cnt(r.html, 'class="wa-route-line"');
    a(n === 2, 'v2266ui/A7: maxPeople=2 时页面恰 2 行（实 ' + n + '）');
    a(r.html.indexOf('另有 2 人没展开') >= 0,
      'v2266ui/A7b: 截断时如实报出还有几人（不静默吞掉）');
  }

  // ════ B 面：设置页改得上、改得动、概览页跟着变 ════════════════════
  {
    const env = freshEnv();
    const WA = env.WA;
    const r = pageHtml(env, 'settings');
    const IDS = ['wa-dr-enable', 'wa-dr-maxp', 'wa-dr-maxpv', 'wa-dr-next', 'wa-dr-hideplace', 'wa-dr-save', 'wa-dr-out'];
    const miss = IDS.filter(function (id) { return r.html.indexOf('id="' + id + '"') < 0; });
    a(miss.length === 0, 'v2266ui/B1: 设置页七枚动线控件全部渲染（缺 ' + j(miss) + '）');
    const domMiss = IDS.filter(function (id) { return !env.dom.getElementById(id); });
    a(domMiss.length === 0, 'v2266ui/B1b: 七枚都在 DOM 树内、可被玩家点到（缺 ' + j(domMiss) + '）');
    // 读数是引擎原值（渲染不另算）
    const cfg = WA.dayRoute.getSettings();
    const mpv = env.dom.getElementById('wa-dr-maxpv');
    a(!!mpv && String(mpv.textContent || '').trim() === String(cfg.maxPeople),
      'v2266ui/B1c: 人数读数与引擎同源（引擎 ' + cfg.maxPeople + ' / DOM ' + j(mpv && mpv.textContent) + '）');
    // 滑块拖动 → 读数跟着变（不落盘，只回显）
    const w0 = WA.settingsBus.stats.writes;
    const mp = env.dom.getElementById('wa-dr-maxp');
    if (mp) { mp.value = '5'; mp.oninput && mp.oninput(); }
    a(!!mpv && String(mpv.textContent || '').trim() === '5', 'v2266ui/B2: 拖动滑块读数即时跟随（实 ' + j(mpv && mpv.textContent) + '）');
    a(WA.settingsBus.stats.writes === w0, 'v2266ui/B2b: 只是拖动时零写盘（不是拖一下就落盘）');
    // 点保存 → 引擎设置真变（这才是「入口通了」的判据）
    const before = WA.dayRoute.getSettings().maxPeople;
    const sv = env.dom.getElementById('wa-dr-save');
    a(!!sv, 'v2266ui/B3: 保存按钮在树中');
    if (sv) sv.click();
    const after = WA.dayRoute.getSettings();
    a(after.maxPeople === 5, 'v2266ui/B3b: 点保存后引擎设置真的变了（' + before + ' → ' + after.maxPeople + '，期望 5）');
    const outEl = env.dom.getElementById('wa-dr-out');
    const outTxt = outEl ? String(outEl.textContent || '') : '';
    a(outTxt.indexOf('✓') >= 0 && outTxt.indexOf('5') >= 0,
      'v2266ui/B3c: 结果出口回显真实生效值（实 ' + j(outTxt) + '）');
    // showNext 关掉 → 引擎设置真变，且概览页**真的**不再念预告段
    armBoundary(WA);
    WA.life.setSettings({ enabled: true });
    seedPerson(WA);
    pageHtml(env, 'settings');
    const nx = env.dom.getElementById('wa-dr-next');
    a(!!nx && nx.checked === true, 'v2266ui/B4: showNext 出厂默认开（渲染出 checked）');
    if (nx) nx.checked = false;
    const sv2 = env.dom.getElementById('wa-dr-save');
    if (sv2) sv2.click();
    a(WA.dayRoute.getSettings().showNext === false,
      'v2266ui/B4b: 取消勾选后引擎设置真的变了（实 ' + WA.dayRoute.getSettings().showNext + '）');
    const ro = pageHtml(env, 'overview');
    const el4 = env.dom.getElementById('wa-route-block');
    const txt4 = el4 ? String(el4.textContent || '') : '';
    a(txt4.indexOf('去钱庄') < 0,
      'v2266ui/B4c: 关掉预告后概览页**真的**不再念「接下来」（实 ' + j(txt4.slice(0, 80)) + '）');
    a(ro.html.indexOf('id="wa-route-block"') >= 0, 'v2266ui/B4d: 但动线块本身还在（关的是预告段，不是整个功能）');
    // hidePlace 打开 → 引擎设置真变，且概览页不报地名
    pageHtml(env, 'settings');
    const hp = env.dom.getElementById('wa-dr-hideplace');
    if (hp) hp.checked = true;
    const sv3 = env.dom.getElementById('wa-dr-save');
    if (sv3) sv3.click();
    a(WA.dayRoute.getSettings().hidePlace === true,
      'v2266ui/B5: 勾上「不显示地名」后引擎设置真的变了（实 ' + WA.dayRoute.getSettings().hidePlace + '）');
    pageHtml(env, 'overview');
    const el5 = env.dom.getElementById('wa-route-block');
    const txt5 = el5 ? String(el5.textContent || '') : '';
    a(txt5.indexOf('集市') < 0, 'v2266ui/B5b: 打开后概览页**真的**不报地名（实 ' + j(txt5.slice(0, 80)) + '）');
    a(txt5.indexOf('看不见') < 0, 'v2266ui/B5c: 也**不许**因此说「看不见」—— 是玩家不想看，不是世界挡住了');
    // 开关关掉 → 概览页说「已关闭」
    pageHtml(env, 'settings');
    const en = env.dom.getElementById('wa-dr-enable');
    if (en) en.checked = false;
    const sv4 = env.dom.getElementById('wa-dr-save');
    if (sv4) sv4.click();
    pageHtml(env, 'overview');
    const el6 = env.dom.getElementById('wa-route-block');
    a(!!el6 && String(el6.textContent || '').indexOf('已关闭') >= 0,
      'v2266ui/B6: 关掉后概览页说「已关闭」（实 ' + j(el6 && String(el6.textContent || '').slice(0, 40)) + '）');
    // 写的是引擎唯一写路径（不是本页直写 localStorage）
    const writes = WA.settingsBus.stats.writes;
    pageHtml(env, 'settings');
    const en2 = env.dom.getElementById('wa-dr-enable');
    if (en2) en2.checked = true;
    const sv5 = env.dom.getElementById('wa-dr-save');
    if (sv5) sv5.click();
    a(WA.settingsBus.stats.writes > writes,
      'v2266ui/B7: 保存走 settingsBus 写路径（不是本页自己写盘；写次数 ' + writes + ' → ' + WA.settingsBus.stats.writes + '）');
  }

  // ════ C 面：诊断节读数在场且分行 ══════════════════════════════════
  {
    const env = freshEnv();
    const WA = env.WA;
    a(!!WA.toolDiag && typeof WA.toolDiag.collect === 'function', 'v2266ui/C1: toolDiag 已装载且 collect 可用');
    let rep = null;
    try { rep = WA.toolDiag.collect(); } catch (e) { rep = { error: String((e && e.message) || e) }; }
    const dr = rep && rep.dayRoute;
    a(!!dr, 'v2266ui/C1b: 诊断包里有 dayRoute 节（实键：' + j(Object.keys(rep || {}).filter(function (k) { return k === 'dayRoute'; })) + '）');
    a(!!dr && !dr.error, 'v2266ui/C1c: 该节不是缺席降级（实 ' + j(dr && dr.error) + '）');
    // 地名五栏分行（判不了 / 玩家要求不报 / 真看不见 —— 三件不同的事）
    a(!!dr && dr.where && typeof dr.where.known === 'number' && typeof dr.where.hidden === 'number'
      && typeof dr.where.unjudgeable === 'number' && typeof dr.where.suppressed === 'number'
      && typeof dr.where.unknown === 'number',
      'v2266ui/C2: 地名五栏各自可数（实 ' + j(dr && dr.where) + '）');
    // 日程三栏
    a(!!dr && dr.schedule && typeof dr.schedule.absolute === 'number'
      && typeof dr.schedule.clock === 'number' && typeof dr.schedule.unjudgeable === 'number',
      'v2266ui/C2b: 日程三栏各自可数（判不了此刻 ≠ 没有安排；实 ' + j(dr && dr.schedule) + '）');
    // 判域自证：钟点口径与绝对口径**确实不同域**
    a(!!dr && dr.schedule && dr.schedule.probe && dr.schedule.probe.clock === 'clock'
      && dr.schedule.probe.absolute === 'absolute',
      'v2266ui/C2c: 判域自证 —— 钟点口径 ≠ 绝对口径（实 ' + j(dr && dr.schedule && dr.schedule.probe) + '）');
    // 边界面如实报，且不可用时说得出后果
    a(!!dr && dr.boundary && typeof dr.boundary.present === 'boolean',
      'v2266ui/C3: 边界面如实报 present（判不了 vs 看不见要分行）');
    a(!!dr && dr.boundary && dr.boundary.present === false && String(dr.boundary.why || '').length > 0,
      'v2266ui/C3b: 边界不可用时 why 说得出后果（实 ' + j(dr && dr.boundary && dr.boundary.why) + '）');
    // 五路来源各自在场与否
    a(!!dr && dr.sources && typeof dr.sources.life === 'boolean'
      && typeof dr.sources.lifeEnabled === 'boolean' && typeof dr.sources.laborSchedule === 'boolean'
      && typeof dr.sources.boundaryOwner === 'boolean' && typeof dr.sources.clock === 'boolean',
      'v2266ui/C3c: 五路来源各自在场与否分行报出（缺一路 ≠ 那一路没事）');
    // 零构建时不说「每次都空」而是「还没构建过」
    a(!!dr && (dr.builds === 0 ? String(dr.note || '').indexOf('还没') >= 0 : true),
      'v2266ui/C4: 零构建时 note 说「还没构建过」而不是「每次都空」（实 ' + j(dr && dr.note) + '）');
    // 关掉后 note 必须切成「关着」（同形不同因）
    WA.dayRoute.setSettings({ enabled: false });
    let rep2 = null;
    try { rep2 = WA.toolDiag.collect(); } catch (e) { rep2 = { error: String((e && e.message) || e) }; }
    const dr2 = rep2 && rep2.dayRoute;
    a(!!dr2 && dr2.enabled === false && String(dr2.note || '').indexOf('关着') >= 0,
      'v2266ui/C5: 关着时 note 说「关着」而不是「没内容」（实 ' + j(dr2 && { e: dr2.enabled, n: dr2.note }) + '）');
    // 诊断读取不得推进引擎计量
    WA.dayRoute.setSettings({ enabled: true });
    const b0 = WA.dayRoute.stat().builds;
    try { WA.toolDiag.collect(); } catch (e) {}
    a(WA.dayRoute.stat().builds === b0, 'v2266ui/C6: 诊断读取零 build（诊断面不污染引擎计量）');
    // 故事日：读不到与「真的是第 1 天」分开
    a(!!dr && dr.storyDay && (dr.storyDay.ok === true ? typeof dr.storyDay.day === 'number' : String(dr.storyDay.why || '').length > 0),
      'v2266ui/C7: 故事日读不到时给 why（不把读不到读成第 1 天；实 ' + j(dr && dr.storyDay) + '）');
  }

  // ════ D 面：登记面（UI_BINDINGS / LOAD 双登记同序）══════════════════
  {
    const env = freshEnv();
    const WA = env.WA;
    const grp = (WA.toolDiag.UI_BINDINGS || []).filter(function (g) { return g.page === 'settings'; })[0] || { ids: [] };
    const need = ['wa-dr-enable', 'wa-dr-maxp', 'wa-dr-maxpv', 'wa-dr-next', 'wa-dr-hideplace', 'wa-dr-save', 'wa-dr-out'];
    const miss = need.filter(function (id) { return grp.ids.indexOf(id) < 0; });
    a(miss.length === 0, 'v2266ui/D1: 七枚控件全登记进 UI_BINDINGS 的 settings 组（缺 ' + j(miss) + '）');
    // 双登记同序：index.js LOAD_ORDER 与 tests/run.js LOAD 里 day-route 的相对位置一致
    const IDX = rd(IDX_REL), RUN = rd(RUN_REL);
    a(cnt(IDX, "'engines/day-route.js'") === 1, 'v2266ui/D2: index.js 里 day-route 登记恰 1 次（实 ' + cnt(IDX, "'engines/day-route.js'") + '）');
    a(cnt(RUN, "'engines/day-route.js'") === 1, 'v2266ui/D2b: tests/run.js 里 day-route 登记恰 1 次（实 ' + cnt(RUN, "'engines/day-route.js'") + '）');
    const ord = function (src, rel) { return src.indexOf("'" + rel + "'"); };
    const rels = ['engines/world-diary.js', 'engines/day-route.js', 'engines/capability-tier.js'];
    const okIdx = ord(IDX, rels[0]) < ord(IDX, rels[1]) && ord(IDX, rels[1]) < ord(IDX, rels[2]);
    const okRun = ord(RUN, rels[0]) < ord(RUN, rels[1]) && ord(RUN, rels[1]) < ord(RUN, rels[2]);
    a(okIdx, 'v2266ui/D3: index.js LOAD_ORDER 顺序为 diary → day-route → tier（实 ' + j(rels.map(function (x) { return ord(IDX, x); })) + '）');
    a(okRun, 'v2266ui/D3b: tests/run.js LOAD 顺序与 index.js 严格同序（实 ' + j(rels.map(function (x) { return ord(RUN, x); })) + '）');
    // 两条锁都登记进 run.js 且带 await
    a(/await\s+runLock\('\.\/day-route-v2266\.js'/.test(RUN), 'v2266ui/D4: 引擎专锁已登记且带 await');
    a(/await\s+runLock\('\.\/day-route-ui-v2266\.js'/.test(RUN), 'v2266ui/D4b: 接线锁已登记且带 await');
  }

  // ════ N 面：负控制（真源码破坏 → 破坏副本上重跑同款判据必现形）═══
  const N_ANCHOR = {
    // 概览页：动线块定义（破坏后整块不再产出）
    blockDef: "if (!WA.dayRoute || typeof WA.dayRoute.build !== 'function') {",
    // 概览页：动线块插进渲染流
    blockUse: '      ${routeBlock}\n',
    // 设置页：保存走引擎唯一写路径
    saveCall: 'const r = WA.dayRoute.setSettings({',
    // 诊断节：地名五栏里「判不了」那一栏（摘掉后「判不了」不再单列）
    diagUnjudgeable: 'unjudgeable: wh.unjudgeable,',
    // 诊断节：日程三栏里 clock 那一栏
    diagClock: 'schedule: { absolute: sc.absolute, clock: sc.clock, unjudgeable: sc.unjudgeable,'
  };
  {
    const vals = Object.keys(N_ANCHOR).map(function (k) { return N_ANCHOR[k]; });
    const uniq = vals.filter(function (v, i) { return vals.indexOf(v) === i; });
    a(uniq.length === vals.length, 'v2266ui/N0: 破坏锚点值互不相同（' + uniq.length + ' / ' + vals.length + '）');
    const dup = Object.keys(N_ANCHOR).filter(function (k) { return cnt(SELF, N_ANCHOR[k]) > 1; });
    a(dup.length === 0, 'v2266ui/N0b: 破坏锚点字面量在 SELF 里只出现 1 次（越界：' + j(dup) + '）—— H5 判据纯度');
    let t0 = null; try { breakOnce('abc', 'zzz', 'y', 't0'); } catch (e) { t0 = String(e.message); }
    a(t0 !== null, 'v2266ui/N0c: （工具自证）锚点不存在必须抛（实 ' + j(t0) + '）');
    let t1 = null; try { breakOnce('xyxy', 'xy', 'z', 't1'); } catch (e) { t1 = String(e.message); }
    a(t1 !== null, 'v2266ui/N0d: （工具自证）锚点不唯一必须抛（实 ' + j(t1) + '）');
  }
  function withBrokenFile(rel, anchor, rep, fn) {
    let threw = null, out = null;
    try {
      const src = breakOnce(rd(rel), anchor, rep, 'break-' + rel);
      const env = freshEnv({ [rel]: src });
      out = fn(env, env.WA);
    } catch (e) { threw = String((e && e.message) || e); }
    return { threw: threw, out: out };
  }
  //   N1 删掉概览页的动线块使用点 ⇒ A2 必现形
  {
    const bad = withBrokenFile(PANEL_REL, N_ANCHOR.blockUse, '', function (env) {
      const r = pageHtml(env, 'overview');
      return { has: r.html.indexOf('id="wa-route-block"') >= 0 };
    });
    a(bad.threw === null, 'v2266ui/N1a: 破坏版不抛（实 ' + j(bad.threw) + '）');
    a(bad.out && bad.out.has === false, 'v2266ui/N1b: （两向）摘掉使用点后概览页无动线块（实 ' + j(bad.out) + '）');
    const good = (function () {
      try { const env = freshEnv(); const r = pageHtml(env, 'overview'); return { has: r.html.indexOf('id="wa-route-block"') >= 0 }; }
      catch (e) { return { err: String(e.message) }; }
    })();
    a(good.has === true, 'v2266ui/N1c: 原版上同判据为真（实 ' + j(good) + '）');
  }
  //   N2 「引擎缺席」闸门：造出真·缺席场景（删掉 dayRoute 再渲染概览页）
  {
    const env = freshEnv();
    const WA = env.WA;
    const keep = WA.dayRoute;
    try { delete WA.dayRoute; } catch (e) {}
    pageHtml(env, 'overview');
    const el = env.dom.getElementById('wa-route-block');
    const txt = el ? String(el.textContent || '') : '';
    a(txt.indexOf('读数不可用') >= 0, 'v2266ui/N2a: 引擎真缺席时说「读数不可用」（实 ' + j(txt.slice(0, 40)) + '）');
    WA.dayRoute = keep;
    const bad = withBrokenFile(PANEL_REL, N_ANCHOR.blockDef, 'if (false) {', function (env2, WA2) {
      try { delete WA2.dayRoute; } catch (e) {}
      pageHtml(env2, 'overview');
      const el2 = env2.dom.getElementById('wa-route-block');
      return { txt: el2 ? String(el2.textContent || '') : '' };
    });
    a(bad.threw === null, 'v2266ui/N2b: 破坏版不抛（实 ' + j(bad.threw) + '）');
    a(bad.out && bad.out.txt.indexOf('读数不可用') < 0,
      'v2266ui/N2c: （两向）摘掉闸门后「没装上」不再被说出来（实 ' + j(bad.out && bad.out.txt.slice(0, 40)) + '）');
  }
  //   N3 摘掉设置页的保存调用 ⇒ B3b 必现形（设置改不动 = 入口假通）
  {
    const bad = withBrokenFile(SET_REL, N_ANCHOR.saveCall, 'const r = false && WA.dayRoute.setSettings({', function (env, WA) {
      pageHtml(env, 'settings');
      const mp = env.dom.getElementById('wa-dr-maxp');
      if (mp) { mp.value = '4'; }
      const sv = env.dom.getElementById('wa-dr-save');
      if (sv) sv.click();
      return { maxPeople: WA.dayRoute.getSettings().maxPeople };
    });
    a(bad.threw === null, 'v2266ui/N3a: 破坏版不抛（实 ' + j(bad.threw) + '）');
    a(bad.out && bad.out.maxPeople !== 4,
      'v2266ui/N3b: （两向）摘掉写路径后点保存改不动引擎设置（实 ' + j(bad.out) + '）');
    const good = (function () {
      try {
        const env = freshEnv(); const WA = env.WA;
        pageHtml(env, 'settings');
        const mp = env.dom.getElementById('wa-dr-maxp');
        if (mp) { mp.value = '4'; }
        const sv = env.dom.getElementById('wa-dr-save');
        if (sv) sv.click();
        return { maxPeople: WA.dayRoute.getSettings().maxPeople };
      } catch (e) { return { err: String(e.message) }; }
    })();
    a(good.maxPeople === 4, 'v2266ui/N3c: 原版上同判据为真（点保存真写进引擎；实 ' + j(good) + '）');
  }
  //   N4 摘掉诊断节的地名「判不了」栏 ⇒ C2 必现形
  {
    const bad = withBrokenFile(DIAG_REL, N_ANCHOR.diagUnjudgeable, '', function (env, WA) {
      let rep = null;
      try { rep = WA.toolDiag.collect(); } catch (e) { rep = { error: String((e && e.message) || e) }; }
      const dr = rep && rep.dayRoute;
      return { has: !!(dr && dr.where && Object.prototype.hasOwnProperty.call(dr.where, 'unjudgeable')) };
    });
    a(bad.threw === null, 'v2266ui/N4a: 破坏版不抛（实 ' + j(bad.threw) + '）');
    a(bad.out && bad.out.has === false,
      'v2266ui/N4b: （两向）摘掉「判不了」栏后它不再单列（实 ' + j(bad.out) + '）');
    const good = (function () {
      try {
        const env = freshEnv(); const WA = env.WA;
        const rep = WA.toolDiag.collect();
        const dr = rep && rep.dayRoute;
        return { has: !!(dr && dr.where && Object.prototype.hasOwnProperty.call(dr.where, 'unjudgeable')) };
      } catch (e) { return { err: String(e.message) }; }
    })();
    a(good.has === true, 'v2266ui/N4c: 原版上同判据为真（实 ' + j(good) + '）');
  }
  //   N5 摘掉诊断节的日程 clock 栏 ⇒ C2b 必现形
  {
    const bad = withBrokenFile(DIAG_REL, N_ANCHOR.diagClock,
      'schedule: { absolute: sc.absolute, unjudgeable: sc.unjudgeable,', function (env, WA) {
        let rep = null;
        try { rep = WA.toolDiag.collect(); } catch (e) { rep = { error: String((e && e.message) || e) }; }
        const dr = rep && rep.dayRoute;
        return { has: !!(dr && dr.schedule && Object.prototype.hasOwnProperty.call(dr.schedule, 'clock')) };
      });
    a(bad.threw === null, 'v2266ui/N5a: 破坏版不抛（实 ' + j(bad.threw) + '）');
    a(bad.out && bad.out.has === false,
      'v2266ui/N5b: （两向）摘掉 clock 栏后「判不了此刻」不再单列（实 ' + j(bad.out) + '）');
    const good = (function () {
      try {
        const env = freshEnv(); const WA = env.WA;
        const rep = WA.toolDiag.collect();
        const dr = rep && rep.dayRoute;
        return { has: !!(dr && dr.schedule && Object.prototype.hasOwnProperty.call(dr.schedule, 'clock')) };
      } catch (e) { return { err: String(e.message) }; }
    })();
    a(good.has === true, 'v2266ui/N5c: 原版上同判据为真（实 ' + j(good) + '）');
  }
  //   N6 五个锚点各自在真源码里恰 1 次（H6 工具两向自证：破坏必须可观测改行为已由 N1/N3/N4/N5 证）
  {
    a(cnt(P, N_ANCHOR.blockDef) === 1, 'v2266ui/N6: 概览页闸门锚点在 panel.js 恰 1 次（实 ' + cnt(P, N_ANCHOR.blockDef) + '）');
    a(cnt(P, N_ANCHOR.blockUse) === 1, 'v2266ui/N6b: 使用点锚点在 panel.js 恰 1 次（实 ' + cnt(P, N_ANCHOR.blockUse) + '）');
    a(cnt(S, N_ANCHOR.saveCall) === 1, 'v2266ui/N6c: 写路径锚点在 settings.js 恰 1 次（实 ' + cnt(S, N_ANCHOR.saveCall) + '）');
    a(cnt(D, N_ANCHOR.diagUnjudgeable) === 1, 'v2266ui/N6d: 地名判不了栏锚点在 tool-diag.js 恰 1 次（实 ' + cnt(D, N_ANCHOR.diagUnjudgeable) + '）');
    a(cnt(D, N_ANCHOR.diagClock) === 1, 'v2266ui/N6e: 日程 clock 栏锚点在 tool-diag.js 恰 1 次（实 ' + cnt(D, N_ANCHOR.diagClock) + '）');
  }
  return { pass: pass, fail: fail, fails: fails };
}
const r = runAll();
console.log('══ EXV6-2 接线锁（day-route-ui-v2266）══');
console.log('通过 ' + r.pass + ' / 失败 ' + r.fail);
if (r.fail) { r.fails.forEach(function (f) { console.log('  ✗ ' + f); }); }
process.exit(r.fail > 0 ? 1 : 0);
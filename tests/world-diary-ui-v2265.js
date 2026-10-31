#!/usr/bin/env node
/**
 * v2.265.0（V6 · EXV6-1）接线锁：**世界日记在产品侧真的被玩家看到了吗**
 *
 * ── 为什么世界日记要有两把锁 ───────────────────────────────────────────────
 *  `tests/world-diary-v2265.js` 判的是**引擎语义**（三态地点 / 判不了 vs 看不见 /
 *  三句上限 / 去重 / 零写盘）。它全绿也只证明「引擎算得对」——本仓反复裁决过的那类
 *  失效（引擎算得对，玩家在面板上看不到 = 功能不存在）它管不着。
 *
 *  本锁只判接线，读的是**渲染产物与真实点击链路**，不是源码字面量：
 *    A 面 概览页渲染成型（日记块进树、行数/句数与引擎同源、quiet 与 absent 分得开）
 *    B 面 点击链路真跑到引擎（设置页改「每屏句数」→ 引擎设置真的变了 → 概览页跟着变）
 *    C 面 诊断节读数在场（tool-diag 的 worldDiary 节不缺席、三路来源分行）
 *    N 面 负控制（真源码破坏 → 在破坏副本上重跑同款判据必现形；原版上必真）
 *
 * ── 本锁刻意不判什么 ─────────────────────────────────────────────────────
 *  · 不判句子措辞（那是引擎的事，v2265 已判；这里再判一份就是第二个措辞真源）
 *  · 不判 CSS 长什么样（样式无契约，判它只会让每次调色都要改测试）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const ENG_REL = 'engines/world-diary.js';
const PANEL_REL = 'ui/panel.js';
const SET_REL = 'ui/settings.js';
const DIAG_REL = 'engines/tool-diag.js';
const SELF_REL = 'tests/world-diary-ui-v2265.js';
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
  const E = rd(ENG_REL), P = rd(PANEL_REL), S = rd(SET_REL), D = rd(DIAG_REL), SELF = rd(SELF_REL);

  /** 打开面板并切到某页，返回该页 body 产物的文本面 */
  function pageHtml(env, page) {
    const WA = env.WA, dom = env.dom;
    const panel = dom.getElementById('wa-panel');
    if (WA.ui && typeof WA.ui.open === 'function') WA.ui.open();
    if (WA.ui && typeof WA.ui.goPage === 'function') WA.ui.goPage(page);
    const body = panel.querySelector('.wa-body');
    return { html: String((body && body.innerHTML) || ''), body: body, panel: panel };
  }
  /** 造一路幕后事实（走 store.transact，产品既有容器，不新开） */
  function seed(WA, n) {
    WA.store.transact(function (d) {
      const lw = d.livingWorld = d.livingWorld || { tick: 0, intersections: [], vignettes: [], ripples: [], livingTraces: [], characterStates: {} };
      lw.tick = 5;
      for (let i = 0; i < n; i++) {
        lw.vignettes.push({ name: '老周' + i, place: '集市', detail: '在摊前讨价还价', tick: 5 });
      }
    }, 'v2265ui:seed');
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

  // ════ A 面：概览页渲染成型 ══════════════════════════════════════════
  //   A1 引擎与面板都在场（没有它，下面每条判据都退化成在空集上恒真）
  {
    const env = freshEnv();
    const WA = env.WA;
    a(!!WA.worldDiary, 'v2265ui/A1: worldDiary 已装载');
    a(!!WA.uiSettings, 'v2265ui/A1b: uiSettings 已装载');
  }
  //   A2 概览页渲染出日记块（且不是「不可用」降级态）
  {
    const env = freshEnv();
    const r = pageHtml(env, 'overview');
    a(r.html.indexOf('id="wa-diary-block"') >= 0,
      'v2265ui/A2: 概览页渲染出日记块 #wa-diary-block（实 ' + (r.html.indexOf('id="wa-diary-block"') >= 0) + '）');
    a(r.html.indexOf('世界日记读数不可用') < 0, 'v2265ui/A2b: 不是「引擎缺席」降级态');
    const el = env.dom.getElementById('wa-diary-block');
    a(!!el, 'v2265ui/A2c: 日记块在 DOM 树内（不是游离字符串）');
  }
  //   A3 空态：显示「确实没有」而不是「不可用」，且带稳定 class
  {
    const env = freshEnv();
    const r = pageHtml(env, 'overview');
    const el = env.dom.getElementById('wa-diary-block');
    const txt = el ? String(el.textContent || '') : '';
    a(!!el && String(el.className || '').indexOf('wa-diary-quiet') >= 0,
      'v2265ui/A3: 空态带 wa-diary-quiet class（类名是契约，文字会改；实 ' + j(el && el.className) + '）');
    a(txt.indexOf('确实没有') >= 0 || txt.indexOf('没有需要你知道的事') >= 0,
      'v2265ui/A3b: 空态说得出「确实没有」（实 ' + j(txt.slice(0, 60)) + '）');
    a(r.html.indexOf('读数不可用') < 0, 'v2265ui/A3c: 空态不被渲染成「读数不可用」—— 那是没装上，不是没事');
  }
  //   A4 有事实时：行数与引擎同源（面板不另算一份 — 另算就是第二个措辞真源）
  {
    const env = freshEnv();
    const WA = env.WA;
    seed(WA, 5);
    const r = pageHtml(env, 'overview');
    const el = env.dom.getElementById('wa-diary-block');
    a(!!el && String(el.className || '').indexOf('wa-diary-live') >= 0,
      'v2265ui/A4: 有事实时带 wa-diary-live class（实 ' + j(el && el.className) + '）');
    // 面板拿的是 build() 的结果：这里读引擎自己的读数作对照
    const b = WA.worldDiary.build();
    const lines = b.lines || [];
    a(lines.length > 0, 'v2265ui/A4b: （前置）引擎这一轮确实说出了行（实 ' + lines.length + '）');
    // 逐句查在 DOM 里（不做措辞判据，只判「引擎说的那几句确实出现在屏幕上」）
    const missing = lines.filter(function (l) { return r.html.indexOf(String(l).replace(/&/g, '&amp;')) < 0 && r.html.indexOf(String(l)) < 0; });
    a(missing.length === 0, 'v2265ui/A4c: 引擎句子逐行进入 DOM（缺 ' + j(missing) + '）');
    // 行数上限：DOM 里 wa-diary-line 的个数不超过引擎 cap
    const n = cnt(r.html, 'class="wa-diary-line"');
    a(n === lines.length, 'v2265ui/A4d: DOM 行数与引擎行数一致（DOM ' + n + ' / 引擎 ' + lines.length + '）');
  }
  //   A5 关闭时：只留一行「已关闭」，不铺空块、不谎称没有事
  {
    const env = freshEnv();
    const WA = env.WA;
    WA.worldDiary.setSettings({ enabled: false });
    seed(WA, 5);
    const r = pageHtml(env, 'overview');
    const el = env.dom.getElementById('wa-diary-block');
    const txt = el ? String(el.textContent || '') : '';
    a(txt.indexOf('已关闭') >= 0, 'v2265ui/A5: 关着时说「已关闭」（实 ' + j(txt.slice(0, 50)) + '）');
    a(txt.indexOf('没有需要你知道的事') < 0, 'v2265ui/A5b: 关着时**不**说「没有事」—— 关着 ≠ 没事（同形不同因）');
    a(cnt(r.html, 'class="wa-diary-line"') === 0, 'v2265ui/A5c: 关着时零行（不渲染旧行）');
  }
  //   A6 切页计量：概览页渲染会 build（这是它的本职），但**切到别的页不许 build**
  //      —— 「日记块只在概览页求值」是 OPT-9 惰性口径；若世界页也 build，玩家每点一次
  //      页签就多算一遍日记（多路只读聚合，重复算在长跑里就是白烧）。
  {
    const env = freshEnv();
    const WA = env.WA;
    seed(WA, 3);
    pageHtml(env, 'overview');                       // 打开并停在概览页
    const n0 = WA.worldDiary.stat().builds;
    WA.ui.goPage('world');
    const n1 = WA.worldDiary.stat().builds;
    a(n1 === n0, 'v2265ui/A6: 切到世界页零 build（日记块只在概览页求值；实 ' + n0 + '→' + n1 + '）');
    WA.ui.goPage('overview');
    const n2 = WA.worldDiary.stat().builds;
    a(n2 === n1 + 1, 'v2265ui/A6b: 切回概览页恰多 build 一次（实 ' + n1 + '→' + n2 + '）');
  }

  // ════ B 面：设置页改得上、改得动、概览页跟着变 ════════════════════
  {
    const env = freshEnv();
    const WA = env.WA;
    const r = pageHtml(env, 'settings');
    const IDS = ['wa-wd-enable', 'wa-wd-maxlines', 'wa-wd-maxlinesv', 'wa-wd-offline', 'wa-wd-save', 'wa-wd-out'];
    const miss = IDS.filter(function (id) { return r.html.indexOf('id="' + id + '"') < 0; });
    a(miss.length === 0, 'v2265ui/B1: 设置页六枚日记控件全部渲染（缺 ' + j(miss) + '）');
    const domMiss = IDS.filter(function (id) { return !env.dom.getElementById(id); });
    a(domMiss.length === 0, 'v2265ui/B1b: 六枚都在 DOM 树内、可被玩家点到（缺 ' + j(domMiss) + '）');
    // 读数是引擎原值（渲染不另算）
    const cfg = WA.worldDiary.getSettings();
    const mlv = env.dom.getElementById('wa-wd-maxlinesv');
    a(!!mlv && String(mlv.textContent || '').trim() === String(cfg.maxLines),
      'v2265ui/B1c: 句数读数与引擎同源（引擎 ' + cfg.maxLines + ' / DOM ' + j(mlv && mlv.textContent) + '）');
    // 滑块拖动 → 读数跟着变（不落盘，只回显）
    const w0 = WA.settingsBus.stats.writes;
    const ml = env.dom.getElementById('wa-wd-maxlines');
    if (ml) { ml.value = '5'; ml.oninput && ml.oninput(); }
    a(!!mlv && String(mlv.textContent || '').trim() === '5', 'v2265ui/B2: 拖动滑块读数即时跟随（实 ' + j(mlv && mlv.textContent) + '）');
    a(WA.settingsBus.stats.writes === w0, 'v2265ui/B2b: 只是拖动时零写盘（不是拖一下就落盘）');
    // 点保存 → 引擎设置真变（这才是「入口通了」的判据）
    const before = WA.worldDiary.getSettings().maxLines;
    const sv = env.dom.getElementById('wa-wd-save');
    a(!!sv, 'v2265ui/B3: 保存按钮在树中');
    if (sv) sv.click();
    const after = WA.worldDiary.getSettings();
    a(after.maxLines === 5, 'v2265ui/B3b: 点保存后引擎设置真的变了（' + before + ' → ' + after.maxLines + '，期望 5）');
    const outEl = env.dom.getElementById('wa-wd-out');
    const outTxt = outEl ? String(outEl.textContent || '') : '';
    a(outTxt.indexOf('✓') >= 0 && outTxt.indexOf('5') >= 0,
      'v2265ui/B3c: 结果出口回显真实生效值（实 ' + j(outTxt) + '）');
    // 概览页立刻跟着变（同一个 env 内切页 → 句数上限生效）
    seed(WA, 6);
    const ro = pageHtml(env, 'overview');
    const n = cnt(ro.html, 'class="wa-diary-line"');
    a(n === 5, 'v2265ui/B4: 概览页按新上限压到 5 行（实 ' + n + ' 行）');
    // 关掉 includeOffline：引擎设置真变
    //   ⚠ 先切回设置页：面板一次只渲染当前页，上一步在概览页 ⇒ 设置页控件此刻不在 DOM。
    //     不切回来会拿到 null，而绑定里 `off ? !!off.checked : true` 会把「找不到」读成 true
    //     —— 判据当场把「我自己找错了节点」报成「保存没生效」。
    pageHtml(env, 'settings');
    const off = env.dom.getElementById('wa-wd-offline');
    if (off) { off.checked = false; }
    const sv2 = env.dom.getElementById('wa-wd-save');
    if (sv2) sv2.click();
    a(WA.worldDiary.getSettings().includeOffline === false,
      'v2265ui/B5: 取消勾选「并入离线」后引擎设置真的变了（实 ' + WA.worldDiary.getSettings().includeOffline + '）');
    // 开关关掉 → 概览页说「已关闭」
    pageHtml(env, 'settings');
    const en = env.dom.getElementById('wa-wd-enable');
    if (en) { en.checked = false; }
    const sv3 = env.dom.getElementById('wa-wd-save');
    if (sv3) sv3.click();
    const ro2 = pageHtml(env, 'overview');
    const el2 = env.dom.getElementById('wa-diary-block');
    a(!!el2 && String(el2.textContent || '').indexOf('已关闭') >= 0,
      'v2265ui/B6: 关掉后概览页说「已关闭」（实 ' + j(el2 && String(el2.textContent || '').slice(0, 40)) + '）');
  }

  // ════ C 面：诊断节读数在场且分行 ═══════════════════════════════════
  {
    const env = freshEnv();
    const WA = env.WA;
    a(!!WA.toolDiag && typeof WA.toolDiag.collect === 'function', 'v2265ui/C1: toolDiag 已装载且 collect 可用');
    let rep = null;
    try { rep = WA.toolDiag.collect(); } catch (e) { rep = { error: String((e && e.message) || e) }; }
    const wd = rep && rep.worldDiary;
    a(!!wd, 'v2265ui/C1b: 诊断包里有 worldDiary 节（实键：' + j(Object.keys(rep || {}).filter(function (k) { return k === 'worldDiary'; })) + '）');
    a(!!wd && !wd.error, 'v2265ui/C1c: 该节不是缺席降级（实 ' + j(wd && wd.error) + '）');
    a(!!wd && wd.boundary && typeof wd.boundary.present === 'boolean',
      'v2265ui/C2: 边界面如实报 present（判不了 vs 看不见要分行）');
    a(!!wd && wd.boundary && wd.boundary.present === false && String(wd.boundary.why || '').length > 0,
      'v2265ui/C2b: 边界不可用时 why 说得出后果（「判不了」不是「全都看得见」；实 ' + j(wd && wd.boundary && wd.boundary.why) + '）');
    a(!!wd && wd.sources && typeof wd.sources.livingWorld === 'boolean'
      && typeof wd.sources.elsewhere === 'boolean' && typeof wd.sources.offlineTick === 'boolean',
      'v2265ui/C3: 三路来源各自在场与否分行报出（缺一路 ≠ 那一路没事）');
    // 零构建时不说「每次都空」而是「还没构建过」—— 两种零读数不同因
    a(!!wd && (wd.builds === 0 ? String(wd.note || '').indexOf('还没') >= 0 : true),
      'v2265ui/C3b: 零构建时 note 说「还没构建过」而不是「每次都空」（实 ' + j(wd && wd.note) + '）');
    // 关掉后 note 必须切成「关着」，不能还说「还没构建过」（同形不同因）
    WA.worldDiary.setSettings({ enabled: false });
    let rep2 = null;
    try { rep2 = WA.toolDiag.collect(); } catch (e) { rep2 = { error: String((e && e.message) || e) }; }
    const wd2 = rep2 && rep2.worldDiary;
    a(!!wd2 && wd2.enabled === false && String(wd2.note || '').indexOf('关着') >= 0,
      'v2265ui/C4: 关着时 note 说「关着」而不是「没内容」（实 ' + j(wd2 && { e: wd2.enabled, n: wd2.note }) + '）');
    // 诊断读取不得推进引擎计量（诊断面不污染计数）
    const b0 = WA.worldDiary.stat().builds;
    try { WA.toolDiag.collect(); } catch (e) {}
    a(WA.worldDiary.stat().builds === b0, 'v2265ui/C5: 诊断读取零 build（诊断面不污染引擎计量）');
  }

  // ════ N 面：负控制（真源码破坏 → 破坏副本上重跑同款判据必现形）═══
  const N_ANCHOR = {
    // 概览页：日记块定义（破坏后整块不再产出）
    blockDef: "if (!WA.worldDiary || typeof WA.worldDiary.build !== 'function') {",
    // 概览页：日记块插进渲染流
    blockUse: '      ${diaryBlock}\n',
    // 设置页：保存走引擎唯一写路径
    saveCall: 'const r = WA.worldDiary.setSettings({',
    // 诊断节：边界 why 分行
    diagWhy: '边界口不在场 ⇒ 地名一律不点名是**判不了**，不是「全都看得见」'
  };
  {
    const vals = Object.keys(N_ANCHOR).map(function (k) { return N_ANCHOR[k]; });
    const uniq = vals.filter(function (v, i) { return vals.indexOf(v) === i; });
    a(uniq.length === vals.length, 'v2265ui/N0: 破坏锚点值互不相同（' + uniq.length + ' / ' + vals.length + '）');
    const dup = Object.keys(N_ANCHOR).filter(function (k) { return cnt(SELF, N_ANCHOR[k]) > 1; });
    a(dup.length === 0, 'v2265ui/N0b: 破坏锚点字面量在 SELF 里只出现 1 次（越界：' + j(dup) + '）—— H5 判据纯度');
    // 工具自证：破坏函数本身真的会改字，且锚点不存在/不唯一会抛
    let t0 = null; try { breakOnce('abc', 'zzz', 'y', 't0'); } catch (e) { t0 = String(e.message); }
    a(t0 !== null, 'v2265ui/N0c: （工具自证）锚点不存在必须抛（实 ' + j(t0) + '）');
    let t1 = null; try { breakOnce('xyxy', 'xy', 'z', 't1'); } catch (e) { t1 = String(e.message); }
    a(t1 !== null, 'v2265ui/N0d: （工具自证）锚点不唯一必须抛（实 ' + j(t1) + '）');
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
  //   N1 删掉概览页的日记块使用点 ⇒ A2 必现形（证明 A2 判的是真产物）
  {
    const bad = withBrokenFile(PANEL_REL, N_ANCHOR.blockUse, '', function (env) {
      const r = pageHtml(env, 'overview');
      return { has: r.html.indexOf('id="wa-diary-block"') >= 0 };
    });
    a(bad.threw === null, 'v2265ui/N1a: 破坏版不抛（实 ' + j(bad.threw) + '）');
    a(bad.out && bad.out.has === false, 'v2265ui/N1b: （两向）摘掉使用点后概览页无日记块（实 ' + j(bad.out) + '）');
    const good = (function () {
      try { const env = freshEnv(); const r = pageHtml(env, 'overview'); return { has: r.html.indexOf('id="wa-diary-block"') >= 0 }; }
      catch (e) { return { err: String(e.message) }; }
    })();
    a(good.has === true, 'v2265ui/N1c: 原版上同判据为真（实 ' + j(good) + '）');
  }
  //   N2 「引擎缺席」闸门：造出真·缺席场景（删掉 worldDiary 再渲染概览页）。
  //     闸门在 ⇒ 说「读数不可用」；闸门被摘 ⇒ 不再说这句（此时会发生什么不重要，
  //     重要的是「没装上」这件事不再被说出来 —— 那就是玩家眼里的「什么都没发生」）。
  //     首版这里断言「破坏后不含『已关闭』」，实测打到的是 enabled 分支而非闸门分支：
  //     判据打偏不会报错，只会永远为真 —— 本仓点名的假绿形态，故重写为下面这样。
  {
    const env = freshEnv();
    const WA = env.WA;
    const keep = WA.worldDiary;
    try { delete WA.worldDiary; } catch (e) {}
    pageHtml(env, 'overview');
    const el = env.dom.getElementById('wa-diary-block');
    const txt = el ? String(el.textContent || '') : '';
    a(txt.indexOf('读数不可用') >= 0,
      'v2265ui/N2a: 引擎真缺席时说「读数不可用」（实 ' + j(txt.slice(0, 40)) + '）');
    WA.worldDiary = keep;
    const bad = withBrokenFile(PANEL_REL, N_ANCHOR.blockDef, "if (false) {", function (env2, WA2) {
      try { delete WA2.worldDiary; } catch (e) {}
      pageHtml(env2, 'overview');
      const el2 = env2.dom.getElementById('wa-diary-block');
      return { txt: el2 ? String(el2.textContent || '') : '' };
    });
    a(bad.threw === null, 'v2265ui/N2b: 破坏版不抛（实 ' + j(bad.threw) + '）');
    a(bad.out && bad.out.txt.indexOf('读数不可用') < 0,
      'v2265ui/N2c: （两向）摘掉闸门后「没装上」不再被说出来（实 ' + j(bad.out && bad.out.txt.slice(0, 40)) + '）');
  }
  //   N3 摘掉设置页的保存调用 ⇒ B3b 必现形（设置改不动 = 入口假通）
  {
    const bad = withBrokenFile(SET_REL, N_ANCHOR.saveCall, 'const r = false && WA.worldDiary.setSettings({', function (env, WA) {
      const r = pageHtml(env, 'settings');
      const ml = env.dom.getElementById('wa-wd-maxlines');
      if (ml) { ml.value = '4'; }
      const sv = env.dom.getElementById('wa-wd-save');
      if (sv) sv.click();
      return { maxLines: WA.worldDiary.getSettings().maxLines };
    });
    a(bad.threw === null, 'v2265ui/N3a: 破坏版不抛（实 ' + j(bad.threw) + '）');
    a(bad.out && bad.out.maxLines !== 4,
      'v2265ui/N3b: （两向）摘掉写路径后点保存改不动引擎设置（实 ' + j(bad.out) + '）');
    const good = (function () {
      try {
        const env = freshEnv(); const WA = env.WA;
        pageHtml(env, 'settings');
        const ml = env.dom.getElementById('wa-wd-maxlines');
        if (ml) { ml.value = '4'; }
        const sv = env.dom.getElementById('wa-wd-save');
        if (sv) sv.click();
        return { maxLines: WA.worldDiary.getSettings().maxLines };
      } catch (e) { return { err: String(e.message) }; }
    })();
    a(good.maxLines === 4, 'v2265ui/N3c: 原版上同判据为真（点保存真写进引擎；实 ' + j(good) + '）');
  }
  //   N4 摘掉诊断节的 why 分行（写成空串）⇒ C2b 必现形
  {
    const bad = withBrokenFile(DIAG_REL, N_ANCHOR.diagWhy, '', function (env, WA) {
      let rep = null;
      try { rep = WA.toolDiag.collect(); } catch (e) { rep = { error: String((e && e.message) || e) }; }
      const wd = rep && rep.worldDiary;
      return { why: wd && wd.boundary && wd.boundary.why };
    });
    a(bad.threw === null, 'v2265ui/N4a: 破坏版不抛（实 ' + j(bad.threw) + '）');
    a(bad.out && !bad.out.why, 'v2265ui/N4b: （两向）摘掉 why 后「判不了」的后果不再被说出（实 ' + j(bad.out) + '）');
    const good = (function () {
      try {
        const env = freshEnv(); const WA = env.WA;
        const rep = WA.toolDiag.collect();
        return { why: rep && rep.worldDiary && rep.worldDiary.boundary && rep.worldDiary.boundary.why };
      } catch (e) { return { err: String(e.message) }; }
    })();
    a(!!good.why && String(good.why).length > 0, 'v2265ui/N4c: 原版上同判据为真（实 ' + j(good) + '）');
  }
  //   N5 三件锚点各自在真源码里恰 1 次（H6 工具两向自证：破坏必须可观测改行为已由 N1/N3/N4 证）
  {
    a(cnt(P, N_ANCHOR.blockDef) === 1, 'v2265ui/N5: 概览页闸门锚点在 panel.js 恰 1 次（实 ' + cnt(P, N_ANCHOR.blockDef) + '）');
    a(cnt(P, N_ANCHOR.blockUse) === 1, 'v2265ui/N5b: 使用点锚点在 panel.js 恰 1 次（实 ' + cnt(P, N_ANCHOR.blockUse) + '）');
    a(cnt(S, N_ANCHOR.saveCall) === 1, 'v2265ui/N5c: 写路径锚点在 settings.js 恰 1 次（实 ' + cnt(S, N_ANCHOR.saveCall) + '）');
    a(cnt(D, N_ANCHOR.diagWhy) === 1, 'v2265ui/N5d: 诊断 why 锚点在 tool-diag.js 恰 1 次（实 ' + cnt(D, N_ANCHOR.diagWhy) + '）');
  }

  return { pass: pass, fail: fail, fails: fails };
}
// ── v2.274.0 挂载形态修正（本轮全量回归现场立据）────────────────────────
//   本文件原先是**纯脚本体**：顶层直接 `runAll()` 再 `process.exit()`，且没有 module.exports。
//   而 tests/run.js 的 runLock 语义是 `require(spec)[m](assert)` —— require 时顶层代码立刻跑，
//   `process.exit(0)` 把整个回归 worker 直接杀掉：运行器读到 code=0 判 `passed`，
//   其后的节一条都没跑，日志里的 ✗ 全部作废（实测只跑到本节就报「通过 57 / 失败 0」）。
//   修法照仓库里其余 258 把锁的标准形状：导出 runAll + `require.main === module` 守卫。
//   判据不变、断言不变，变的只是「谁在什么时候调用它」。
module.exports = { runAll: runAll };
if (require.main === module) {
  const r = runAll();
  console.log('══ EXV6-1 接线锁（world-diary-ui-v2265）══');
  console.log('通过 ' + r.pass + ' / 失败 ' + r.fail);
  if (r.fail) { r.fails.forEach(function (f) { console.log('  ✗ ' + f); }); }
  process.exit(r.fail > 0 ? 1 : 0);
}

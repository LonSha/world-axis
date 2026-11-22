/**
 * WorldAxis ui/console.js — 开发者面「工作台」外壳（v2.405.0：内容整理 · 全部长页分组 · 白话层 · 交互细节）
 *
 * 原则：**只加一层，不动 panel.js 的业务**。
 *   - 不改 PAGES 顺序、不改任何控件 id、不改 renderBody/bindBody；
 *   - 只在 #wa-panel 上加 `wc` 类（整套新样式都挂在这个类下，本模块失败 ⇒ 原样式原样）；
 *   - 页签只换「呈现」：emoji → 线性图标，加分组标题；data-page/data-cat/onclick 原封不动；
 *   - 每次 body 重绘后（MutationObserver），在顶部补「页头」：页名 + 一句话用途 + 段落目录；
 *   - 命令面板（Ctrl/⌘+K 或 头部 ⌕）：34 页 + 当前页所有段落，模糊跳转，全走 WA.ui.goPage；
 *   - 收藏页：星标常用页，侧栏置顶（本地偏好，不进存档）。
 * 零 store 写、零引擎调用（除 WA.ui.goPage / showCat）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const doc = WA.mainDoc || (typeof document !== 'undefined' ? document : null);
  // 同 ui/journal.js：UA 判据识别不了 tests/mock.js 的极简 document，补结构判据。
  const __noDom = !doc || !doc.body || !doc.documentElement || typeof doc.querySelector !== 'function' || typeof doc.createDocumentFragment !== 'function' || (typeof navigator !== 'undefined' && /jsdom|HeadlessChrome/i.test(navigator.userAgent || ''));
  const __headless = __noDom;
  if (__headless) { WA.console = { tidy: () => null }; return; }   // 无头/测试：只登记空壳，不碰面板 DOM   // 无头装载（测试）：只登记空壳
  const KEY = 'worldaxis_console_v1';
  // ── 偏好：走 settingsBus 登记（**不裸调 localStorage**，理由同 ui/journal.js）──
  //   open 是「每页每段的展开状态」映射，属偏好而非世界状态 —— 不进存档、不进面板业务。
  const consoleReg = {
    key: KEY,
    def: { pins: ['overview', 'inject', 'logs'], wide: false, tidy: true, open: {} },
    module: 'ui'
  };
  WA.__settingsRegs = (WA.__settingsRegs || []).filter(function (r) {
    return !r || r.key !== KEY;
  }).concat([consoleReg]);
  let pref = { pins: ['overview', 'inject', 'logs'], wide: false, tidy: true, open: {} };
  try {
    if (WA.settingsBus && typeof WA.settingsBus.read === 'function') {
      const v = WA.settingsBus.read(consoleReg);
      if (v && typeof v === 'object') pref = Object.assign(pref, v);
    }
  } catch (e) {}
  if (!Array.isArray(pref.pins)) pref.pins = ['overview', 'inject', 'logs'];
  if (!pref.open || typeof pref.open !== 'object') pref.open = {};
  const save = () => {
    try {
      if (WA.settingsBus && typeof WA.settingsBus.saveOrThrow === 'function') {
        const r = WA.settingsBus.saveOrThrow(consoleReg, pref);
        if (r && r.ok === false && WA.log) WA.log('warn', 'ui.console: 工作台偏好未落盘（' + (r.reason || '?') + '，本次会话内仍生效）', null);
        return r || { ok: false };
      }
      if (WA.log) WA.log('warn', 'ui.console: 工作台偏好未落盘——设置总线未装载（本次会话内仍生效）', null);
    } catch (e) {
      if (WA.log) WA.log('warn', 'ui.console: 工作台偏好写盘异常', e);
    }
    return { ok: false };
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ── 页面目录：分组 + 一句话用途（玩家看不到，给作者/调试者的导航）──
  const GROUPS = [
    { id: 'core', label: '叙事' }, { id: 'world', label: '世界' },
    { id: 'workshop', label: '工坊' }, { id: 'meta', label: '系统' }
  ];
  const DESC = {
    overview: '世界是否在转、哪里卡住——启用面、体检与开局引导',
    world: '世界钟、地点、道路、背景与远方地图',
    people: 'NPC 档案、知识账本、关系、成长与物件',
    memory: '事实版本、伏笔生命周期、阶段纪要',
    enemies: '仇敌与对立关系',
    parallel: '分支世界与平行线',
    inject: '本轮进了正文什么、多少、为什么',
    sediment: '长线沉积：被时间压实的世界层',
    offline: '跨会话记忆锚与离线推进',
    net: '传说进出与四本账自洽审计',
    health: '接下来 / 已经 / 此刻卡在哪',
    beat: '叙事节拍控制',
    chapter: '章节起止与章节回顾',
    todo: '待办：引擎提出的跟进项',
    port: '快照导入导出、蓝图互转',
    find: '跨会话旧事检索',
    graph: '实体关系图谱',
    travel: '行程与在途',
    supply: '供应链与物流',
    evidence: '证据板：结论与其来源',
    branchdiff: '两条分支的差异',
    storyloop: '事件从起因到回收的闭环',
    retrieval: '留存：什么被记住、什么被淘汰',
    actiondesk: '行动桌：可执行的世界动作',
    events: '冲突阶段、势力、声誉与经济',
    director: '导演视角、剧情参谋与分支推演',
    settings: '机制开关、强度档位与设置检索',
    connect: 'API 通道（default / inference …）',
    desk: '写口台：悬空引擎的手动写入',
    boot: '开局：给空世界立骨架',
    drive: '轮次驱动器',
    assistant: '内置助手',
    tools: '快照、存档槽、自检、审计、实验室',
    logs: '运行日志（可只看错误）'
  };
  // 线性图标（1.5px 描边），按页映射；未列出的用通用点
  const P = {
    dot: '<circle cx="12" cy="12" r="2.5"/>',
    overview: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    world: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16"/>',
    people: '<circle cx="9" cy="9" r="3"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5"/><path d="M16 6a3 3 0 0 1 0 6M21 19c0-2-1.5-4-4-4.7"/>',
    memory: '<path d="M12 5a4 4 0 0 0-7 3c0 2 1 3 1 5s-1 3 1 4 4 1 5-1"/><path d="M12 5a4 4 0 0 1 7 3c0 2-1 3-1 5s1 3-1 4-4 1-5-1V5"/>',
    enemies: '<path d="M5 19L19 5M15 5h4v4M9 19H5v-4"/><path d="M5 5l6 6M19 19l-4-4"/>',
    parallel: '<path d="M6 4v16M18 4v6c0 4-6 4-6 8v2"/><circle cx="6" cy="4" r="1.5"/><circle cx="18" cy="4" r="1.5"/>',
    inject: '<path d="M4 12h12M12 6l6 6-6 6"/><path d="M20 4v16"/>',
    sediment: '<path d="M3 18l5-7 4 4 3-3 6 6z"/><path d="M3 21h18"/>',
    offline: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9"/>',
    net: '<circle cx="12" cy="12" r="2"/><path d="M8 8a6 6 0 0 0 0 8M16 8a6 6 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
    health: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
    beat: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
    chapter: '<path d="M4 5c3-1 6-1 8 1v14c-2-2-5-2-8-1zM20 5c-3-1-6-1-8 1v14c2-2 5-2 8-1z"/>',
    todo: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l3 3 5-6"/>',
    port: '<path d="M4 8l8-4 8 4-8 4z"/><path d="M4 8v8l8 4 8-4V8M12 12v8"/>',
    find: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    graph: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="9" cy="18" r="2"/><path d="M8 6.5l8 1.2M7 8l1.6 8M16.6 9.5L10.5 16.6"/>',
    travel: '<circle cx="12" cy="12" r="8"/><path d="M15 9l-2 4-4 2 2-4z"/>',
    supply: '<rect x="3" y="7" width="11" height="9" rx="1"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/>',
    evidence: '<path d="M6 3h9l3 3v15H6z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
    branchdiff: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 7v10M18 11c0 4-6 3-12 6"/>',
    storyloop: '<path d="M9 7a5 5 0 1 0 0 10h6a5 5 0 1 0 0-10"/><path d="M12 4l-3 3 3 3"/>',
    retrieval: '<rect x="4" y="4" width="16" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>',
    actiondesk: '<path d="M5 12l5 5 9-11"/>',
    events: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
    director: '<rect x="3" y="8" width="18" height="12" rx="1.5"/><path d="M3 8l3-5 4 5M10 3l4 5M14 3l4 5"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    connect: '<path d="M9 7V3M15 7V3M7 7h10v5a5 5 0 0 1-10 0zM12 17v4"/>',
    desk: '<path d="M4 20h16M6 16l9-9 3 3-9 9H6z"/>',
    boot: '<path d="M12 20v-8M12 12c0-4 3-7 7-7 0 4-3 7-7 7zM12 14c0-3-2-5-6-5 0 3 2 5 6 5z"/>',
    drive: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
    assistant: '<path d="M4 5h16v11H9l-5 4z"/>',
    tools: '<path d="M14 6a4 4 0 0 0 5 5l-8 8a2 2 0 0 1-3-3z"/>',
    logs: '<path d="M5 6h14M5 10h14M5 14h9M5 18h6"/>',
    star: '<path d="M12 4l2.4 5 5.6.6-4.2 3.8 1.2 5.6L12 16.2 7 19l1.2-5.6L4 9.6 9.6 9z"/>',
    k: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    tidy: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    expand: '<path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/>'
  };
  const icon = (k, n) => '<svg viewBox="0 0 24 24" width="' + (n || 16) + '" height="' + (n || 16) + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[k] || P.dot) + '</svg>';

  function panel() { return doc.getElementById('wa-panel'); }
  function cur() { try { return WA.ui.currentPage(); } catch (e) { return ''; } }
  function pageList() {
    const p = panel(); if (!p) return [];
    return Array.from(p.querySelectorAll('.wa-tab')).map(t => ({ id: t.dataset.page, cat: t.dataset.cat || 'core', label: t.__wcLabel || t.textContent.replace(/^\S+\s/, '').trim(), el: t }));
  }
  function go(id) { try { const r = WA.ui.goPage(id); return r; } catch (e) { return null; } }

  // ── 1. 页签：换图标 + 分组标题 + 收藏置顶 ──
  let dressing = false;
  function dressTabs() {
    const p = panel(); const box = p && p.querySelector('.wa-tabs'); if (!box) return;
    dressing = true;
    box.querySelectorAll('.wa-tab').forEach(t => {
      if (t.__wcDressed) return;
      const raw = t.textContent.trim();
      const label = raw.replace(/^[^\s]+\s+/, '').trim() || raw;
      t.__wcLabel = label; t.__wcDressed = true;
      t.title = DESC[t.dataset.page] || label;
      t.innerHTML = '<span class="wc-ic">' + icon(t.dataset.page) + '</span><span class="wc-lb">' + esc(label) + '</span>'
        + '<span class="wc-pin" data-wc-pin="' + esc(t.dataset.page) + '" title="收藏 / 取消收藏" role="button" aria-label="收藏">' + icon('star', 12) + '</span>';
    });
    // 分组标题与顺序：收藏 → 叙事 → 世界 → 工坊 → 系统。用 CSS order，不移动 DOM 节点（原 querySelectorAll 顺序不变）
    box.querySelectorAll('.wc-gh').forEach(x => x.remove());
    const ord = { pins: 0, core: 1, world: 3, workshop: 5, meta: 7 };
    const mk = (txt, o) => { const h = doc.createElement('div'); h.className = 'wc-gh'; h.textContent = txt; h.style.order = o; box.appendChild(h); };
    if (pref.pins.length) mk('收藏', 0);
    GROUPS.forEach(g => mk(g.label, ord[g.id] * 10 - 1));
    box.querySelectorAll('.wa-tab').forEach(t => {
      const pinned = pref.pins.indexOf(t.dataset.page) >= 0;
      t.classList.toggle('wc-pinned', pinned);
      t.style.order = pinned ? (1 + pref.pins.indexOf(t.dataset.page)) : (ord[t.dataset.cat] || 1) * 10;
    });
    // 分组标题：在当前分类过滤下没有可见页就藏起来
    requestAnimationFrame(() => box.querySelectorAll('.wc-gh').forEach(h => {
      const o = Number(h.style.order);
      const vis = Array.from(box.querySelectorAll('.wa-tab')).some(t => t.style.display !== 'none' && (o === 0 ? t.classList.contains('wc-pinned') : Number(t.style.order) === o + 1));
      h.style.display = vis ? '' : 'none';
    }));
    setTimeout(() => { dressing = false; }, 0);   // 自己改的 style 不回灌观察者（防循环）
  }

  // ── 2. 页头：页名 + 用途 + 段落目录（每次重绘后补上）──
  function dressBody() {
    const p = panel(); const body = p && p.querySelector('.wa-body'); if (!body) return;
    if (body.querySelector(':scope > .wc-pagehead')) return;
    const id = cur(); const t = pageList().find(x => x.id === id);
    const secs = Array.from(body.querySelectorAll('.wa-sec'));
    secs.forEach((s, i) => { s.id = s.id || ('wc-sec-' + i); });
    const toc = secs.length > 2 ? '<div class="wc-toc">' + secs.slice(0, 24).map(s => '<button data-wc-jump="' + esc(s.id) + '">' + esc((s.childNodes[0] && s.childNodes[0].textContent || s.textContent).trim().slice(0, 14)) + '</button>').join('') + '</div>' : '';
    const h = doc.createElement('div');
    h.className = 'wc-pagehead';
    h.innerHTML = '<div class="wc-ph-row"><span class="wc-ph-ic">' + icon(id, 20) + '</span><div><div class="wc-ph-t">' + esc(t ? t.label : id) + '</div><div class="wc-ph-d">' + esc(DESC[id] || '') + '</div></div></div>' + toc;
    body.insertBefore(h, body.firstChild);
  }

  // ── 3. 命令面板 ──
  let pal = null, palSel = 0, palItems = [];
  function buildPal() {
    pal = doc.createElement('div'); pal.id = 'wc-pal'; pal.hidden = true;
    pal.innerHTML = '<div class="wc-pal-box" role="dialog" aria-label="跳转"><div class="wc-pal-in">' + icon('k', 16) + '<input placeholder="跳到页面或段落…（↑↓ 选择，回车前往）" aria-label="跳转"/><kbd>Esc</kbd></div><div class="wc-pal-list" role="listbox"></div></div>';
    panel().appendChild(pal);
    const inp = pal.querySelector('input');
    inp.addEventListener('input', () => { palSel = 0; fillPal(inp.value); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { palSel = Math.min(palItems.length - 1, palSel + 1); paintSel(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { palSel = Math.max(0, palSel - 1); paintSel(); e.preventDefault(); }
      else if (e.key === 'Enter') { pick(palItems[palSel]); e.preventDefault(); }
      else if (e.key === 'Escape') { closePal(); e.stopPropagation(); }
    });
    pal.addEventListener('click', e => { if (e.target === pal) return closePal(); const it = e.target.closest('[data-i]'); if (it) pick(palItems[Number(it.dataset.i)]); });
  }
  function score(q, s) {
    if (!q) return 1; s = s.toLowerCase(); q = q.toLowerCase();
    if (s.indexOf(q) >= 0) return 10 - s.indexOf(q) / 50;
    let i = 0; for (const c of s) if (c === q[i]) i++;
    return i === q.length ? 2 : 0;
  }
  function fillPal(q) {
    const body = panel().querySelector('.wa-body');
    const pages = pageList().map(x => ({ kind: 'page', id: x.id, t: x.label, d: DESC[x.id] || '', s: score(q, x.label + ' ' + x.id + ' ' + (DESC[x.id] || '')) }));
    const secs = q ? Array.from(body.querySelectorAll('.wa-sec')).map(s => ({ kind: 'sec', id: s.id, t: s.textContent.trim().slice(0, 30), d: '本页段落', s: score(q, s.textContent) * 0.9 })) : [];
    palItems = pages.concat(secs).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 14);
    pal.querySelector('.wc-pal-list').innerHTML = palItems.length ? palItems.map((x, i) => '<div class="wc-pal-it" role="option" data-i="' + i + '">' + '<span class="wc-ic">' + icon(x.kind === 'page' ? x.id : 'evidence') + '</span><b>' + esc(x.t) + '</b><span>' + esc(x.d) + '</span>' + (x.id === cur() ? '<em>当前</em>' : '') + '</div>').join('') : '<div class="wc-pal-none">没有匹配的页或段落</div>';
    paintSel();
  }
  function paintSel() { pal.querySelectorAll('.wc-pal-it').forEach((el, i) => el.classList.toggle('on', i === palSel)); const on = pal.querySelector('.wc-pal-it.on'); on && on.scrollIntoView && on.scrollIntoView({ block: 'nearest' }); }
  function openPal() { if (!pal) buildPal(); pal.hidden = false; const i = pal.querySelector('input'); i.value = ''; palSel = 0; fillPal(''); setTimeout(() => i.focus(), 10); }
  function closePal() { if (pal) pal.hidden = true; }
  function pick(x) {
    if (!x) return; closePal();
    if (x.kind === 'page') { if (x.id !== 'all' && WA.ui.showCat && pageList().find(p => p.id === x.id)) { try { WA.ui.showCat('all'); } catch (e) {} } go(x.id); }
    else jump(x.id);
  }
  function jump(id) {
    const el = panel().querySelector('#' + ((window.CSS && CSS.escape) ? CSS.escape(id) : id)); if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('wc-flash'); setTimeout(() => el.classList.remove('wc-flash'), 1200);
  }

  // ── 4. 头部：⌕ 跳转 + 宽屏切换；状态药丸 ──
  function dressHead() {
    const p = panel(); const head = p.querySelector('.wa-head'); if (!head || head.querySelector('.wc-tools')) return;
    const box = doc.createElement('span'); box.className = 'wc-tools';
    box.innerHTML = '<button class="wc-hbtn" data-wc="pal" title="跳转（Ctrl/⌘+K）">' + icon('k') + '<span>跳转</span><kbd>⌘K</kbd></button>'
      + '<button class="wc-hbtn' + (pref.tidy ? ' on' : '') + '" data-wc="tidy" title="精简显示（折叠段落、收拢未装载提示、弱化版本号）">' + icon('tidy') + '</button>'
      + '<button class="wc-hbtn wc-only-desk" data-wc="wide" title="宽屏 / 标准">' + icon('expand') + '</button>';
    const close = head.querySelector('.wa-close'); head.insertBefore(box, close);
  }


  // ── 5. 内容整理（v2.403）：**不改任何文字、不移动任何节点**──
  //   只做三件事：给节点加类 / 把文本里的片段包进 <span>（textContent 逐字不变）/ 在页头插摘要。
  //   ① 段落折叠：段落多的页（>5 段）默认只展开前两段 + 你上次展开过的；点段落标题开合。
  //      实现是给「本段到下一段之间」的兄弟节点打 data-wc-sec，再用类隐藏 —— 节点不搬家，绑定不丢。
  //   ② 缺席行收拢：「xxx 缺席 / 不可用 / 未装载」这类诊断行统一收进页头一枚「N 项未装载」，点开才看。
  //   ③ 噪声降级：正文里的版本号（v2.xxx.x）与引擎文件名（engines/xxx.js）包成弱化的等宽片段；
  //      段落标题里的「（N）」计数变成徽章。
  const ABSENT = /(缺席|不可用|未装载|模块缺失|读数失败|读数异常|未加载)/;
  const VER = /v\d+\.\d+\.\d+(?:（[^）]{0,24}）)?/g;
  const FILE = /(?:engines|core|ui|render|tools)\/[\w\-]+\.js/g;
  function wrapText(root, re, cls) {
    const w = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => {
      const p = n.parentNode; if (!p || /^(SCRIPT|STYLE|TEXTAREA|INPUT|OPTION|SELECT|CODE|PRE)$/.test(p.nodeName) || p.classList && (p.classList.contains('wc-ver') || p.classList.contains('wc-file'))) return NodeFilter.FILTER_REJECT;
      re.lastIndex = 0; return re.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; } });
    const list = []; while (w.nextNode()) list.push(w.currentNode);
    list.forEach(n => {
      const s = n.nodeValue, frag = doc.createDocumentFragment(); let last = 0; re.lastIndex = 0; let m;
      while ((m = re.exec(s))) { if (m.index > last) frag.appendChild(doc.createTextNode(s.slice(last, m.index))); const sp = doc.createElement('span'); sp.className = cls; sp.textContent = m[0]; frag.appendChild(sp); last = m.index + m[0].length; }
      if (last < s.length) frag.appendChild(doc.createTextNode(s.slice(last)));
      n.parentNode.replaceChild(frag, n);
    });
  }
  function secTitle(s) { const t = s.firstChild && s.firstChild.nodeType === 3 ? s.firstChild.nodeValue : s.textContent; return String(t || '').trim().slice(0, 40); }
  function tidy() {
    const p = panel(); const body = p && p.querySelector('.wa-body'); if (!body) return null;
    p.classList.toggle('wc-tidy', !!pref.tidy);
    if (!pref.tidy || body.__wcTidied) return null;
    body.__wcTidied = true;
    const id = cur(); const st = { secs: 0, folded: 0, absent: 0 };
    // ② 缺席行
    const absent = [];
    body.querySelectorAll('.wa-dim,.wa-item.wa-dim,.wa-empty').forEach(el => {
      if (el.querySelector('button,input,select,textarea')) return;
      const t = el.textContent || ''; if (t.length < 120 && ABSENT.test(t)) { el.classList.add('wc-absent'); absent.push(t.trim()); }
    });
    st.absent = absent.length;
    // ③ 噪声降级
    try { wrapText(body, VER, 'wc-ver'); wrapText(body, FILE, 'wc-file'); } catch (e) {}
    // 段落标题计数 → 徽章
    const secs = Array.from(body.querySelectorAll(':scope > .wa-sec, :scope > div > .wa-sec')).filter(s => s.parentNode === body);
    secs.forEach(s => {
      const f = s.firstChild; if (!f || f.nodeType !== 3) return;
      const m = /^(.*?)（(\d+)）\s*$/.exec(f.nodeValue) || /^(.*?)（(\d+)）(\s*)$/.exec(f.nodeValue);
      if (!m) return;
      const a = doc.createTextNode(m[1]); const b = doc.createElement('span'); b.className = 'wc-count'; b.textContent = '（' + m[2] + '）';
      s.replaceChild(b, f); s.insertBefore(a, b);
    });
    // ① 段落折叠
    st.secs = secs.length;
    if (secs.length > 5) {
      const opened = pref.open[id] || {};
      secs.forEach((s, i) => {
        const key = secTitle(s);
        s.classList.add('wc-sec-h'); s.dataset.wcKey = key;
        let n = s.nextElementSibling, cnt = 0; const own = [];
        while (n && !n.classList.contains('wa-sec')) { if (!n.classList.contains('wc-pagehead')) { own.push(n); cnt++; } n = n.nextElementSibling; }
        own.forEach(x => x.setAttribute('data-wc-of', String(i)));
        const real = own.filter(x => !x.classList.contains('wc-absent')).length;
        if (!real) s.classList.add('wc-sec-empty');
        const isOpen = key in opened ? opened[key] : i < 2;
        s.classList.toggle('wc-closed', !isOpen); if (!isOpen) st.folded++;
        s.setAttribute('aria-expanded', String(isOpen));
        own.forEach(x => x.classList.toggle('wc-hide', !isOpen));
      });
    }
    // 页头摘要
    const head = body.querySelector('.wc-pagehead');
    if (head && !head.querySelector('.wc-meta')) {
      const m = doc.createElement('div'); m.className = 'wc-meta';
      m.innerHTML = '<span>' + st.secs + ' 段</span>'
        + (st.folded ? '<button data-wc-all="1">全部展开</button>' : (st.secs > 5 ? '<button data-wc-all="0">全部收起</button>' : ''))
        + (st.absent ? '<button class="wc-absent-chip" data-wc-absent title="' + esc(absent.slice(0, 12).join('\n')) + '">' + st.absent + ' 项未装载 / 不可用</button>' : '');
      head.appendChild(m);
    }
    return st;
  }
  function toggleSec(s, force) {
    const p = panel(); const body = p.querySelector('.wa-body'); const id = cur();
    const open = force !== undefined ? force : s.classList.contains('wc-closed');
    s.classList.toggle('wc-closed', !open); s.setAttribute('aria-expanded', String(open));
    const i = Array.from(body.querySelectorAll('.wc-sec-h')).indexOf(s);
    body.querySelectorAll('[data-wc-of="' + i + '"]').forEach(x => x.classList.toggle('wc-hide', !open));
    (pref.open[id] = pref.open[id] || {})[s.dataset.wcKey] = open;
  }


  // ── 6. 三页深改（v2.404）：概览 / 人物 / 注入 ──
  //   仍然**只在浏览器显示层**：给段落归组、加子页签、拆长标题；源码与控件 id 一个不动，
  //   无头/测试环境本模块不装载 ⇒ 不触任何读数锁。精简显示关掉 ⇒ 全部回原样。
  //   分组规则 = 段落标题的正则（按顺序首个命中归组；都不中 → 「其他」）。
  const LAYOUTS = {
    people: { def: 'who', groups: [
      { id: 'who', label: '人物', re: /世界人物状态|人物档案|NPC注册|独白推演|人物身份/ },
      { id: 'mind', label: '认知与视角', re: /防全知|视角锁|生理与照护|长线伏笔/ },
      { id: 'life', label: '生活与行动', re: /人物生活|人物行动|人物计划|能力成长|场所用途|世界织体/ },
      { id: 'bond', label: '关系', re: /关系|社交漩涡/ },
      { id: 'econ', label: '经济与物件', re: /资源与组织|唯一物件|供需|漏摊|持续生产|组织制度|探索与地理/ },
      { id: 'case', label: '因果与调查', re: /因果|调查卷宗|悬案|传播与辟谣|远方传播|机会与题材/ },
      { id: 'sys', label: '协作与扩展', re: /协作|多人场|插件|跨插件|玩法进度|原著幕目/ }
    ] },
    world: { def: 'clock', groups: [
      { id: 'clock', label: '时间与背景', re: /世界钟|世界背景|权威世界事实/ },
      { id: 'flow', label: '暗流与纪事', re: /暗流|纪事|传播与辟谣/ },
      { id: 'book', label: '世界书', re: /世界书/ },
      { id: 'far', label: '远方与地图', re: /远方|地图|空间位置|视口/ }
    ] },
    events: { def: 'live', groups: [
      { id: 'live', label: '正在发生', re: /突发事件|世界推演|演化事件|剧情选择点|事件泳道|重大事件/ },
      { id: 'power', label: '势力与声誉', re: /势力|声誉|仇敌|天下大势|风声/ },
      { id: 'econ', label: '经济与运输', re: /经济|货运|委托|运营项目/ },
      { id: 'act', label: '行动与调查', re: /行动调度|线索调查|灾后余波/ },
      { id: 'edit', label: '编辑器', re: /编辑器/ },
      { id: 'check', label: '体检与实体', re: /一致性|实体库|章节/ }
    ] },
    memory: { def: 'fact', groups: [
      { id: 'fact', label: '事实与伏笔', re: /长期事实|伏笔/ },
      { id: 'pm', label: '个人记忆', re: /个人主观/ },
      { id: 'chron', label: '编年史', re: /编年史/ },
      { id: 'find', label: '检索与溯源', re: /检索|溯源/ }
    ] },
    offline: { def: 'away', groups: [
      { id: 'away', label: '你不在时', re: /跨会话|远方世界脉搏|离线恢复|游玩活动/ },
      { id: 'story', label: '剧情深度', re: /剧情深度|分支树|多结局/ },
      { id: 'perf', label: '性能与存储', re: /性能|渲染|存储/ }
    ] },
    director: { def: 'guide', groups: [
      { id: 'guide', label: '剧情引导', re: /剧情引导|行动选项|剧情参谋/ },
      { id: 'rule', label: '规则与可见性', re: /可见性|题材规则/ },
      { id: 'lab', label: '因果与回放', re: /因果工作台|磁带/ }
    ] },
    health: { def: 'now', groups: [
      { id: 'now', label: '健康与待办', re: /健康中心|待办|战役层/ },
      { id: 'cal', label: '日程与日历', re: /日程|日历/ },
      { id: 'story', label: '纪事与自传', re: /期刊|自传|纪事/ },
      { id: 'seed', label: '播种', re: /播种/ }
    ] },
    tools: { def: 'save', groups: [
      { id: 'save', label: '存档与快照', re: /快照|存档槽|导入|播种/ },
      { id: 'diag', label: '诊断', re: /态势|诊断|体检|依赖|降级|兼容|互操作|协议|性能|冷启|增量|档位/ }
    ] },
    actiondesk: { def: 'now', groups: [
      { id: 'now', label: '可做的事', re: /场景行动桌|可行行动|受阻行动/ },
      { id: 'life', label: '约定与变化', re: /生命周期|可知变化|共同约定/ }
    ] },
    inject: { def: 'now', groups: [
      { id: 'now', label: '本轮结果', re: /本轮注入落地|公开世界变化|注入项去向|槽位落地/ },
      { id: 'budget', label: '预算与选材', re: /预算|选材|主块账/ },
      { id: 'ledger', label: '台账', re: /激活账|变更联动账|结算账|台账时间轴/ },
      { id: 'rule', label: '开关与路由', re: /可见性|按需路由|变量驱动/ },
      { id: 'check', label: '自检与评估', re: /自检|价值评估/ }
    ] }
  };
  // 概览没有段落结构（全是块），按块的特征归组
  function overviewGroup(el) {
    if (el.classList.contains('wc-pagehead') || el.classList.contains('wc-subnav')) return null;
    if (el.classList.contains('wa-stat-grid')) return 'state';
    const sum = el.querySelector && el.querySelector(':scope > summary');
    const t = (sum ? sum.textContent : '') || '';
    if (/工作流节点/.test(t)) return 'flow';
    if (/自检|底层读数/.test(t) || el.hasAttribute('data-omniscient') || el.classList.contains('wa-fold')) return 'diag';
    if (/first|wa-first/.test(el.className) || el.id === 'wa-first-line' || /开局|第一步/.test((el.textContent || '').slice(0, 30))) return 'state';
    return 'brief';
  }
  const OV_GROUPS = [{ id: 'state', label: '首屏' }, { id: 'brief', label: '简报' }, { id: 'diag', label: '诊断' }, { id: 'flow', label: '工作流' }];

  // 长标题拆成「主标题 + 小注」：只改显示（测试面不加载本模块）
  function splitTitle(s) {
    const f = s.firstChild; if (!f || f.nodeType !== 3 || s.querySelector('.wc-sub')) return;
    const m = /^\s*([^（(]{1,16})[（(](.{4,})[）)]\s*$/.exec(f.nodeValue);
    if (!m || /^\d+$/.test(m[2])) return;
    f.nodeValue = m[1];
    const sub = doc.createElement('span'); sub.className = 'wc-sub'; sub.textContent = m[2];
    s.insertBefore(sub, f.nextSibling);
  }
  function subnav(body, groups, counts, cur, page) {
    const nav = doc.createElement('div'); nav.className = 'wc-subnav'; nav.setAttribute('role', 'tablist');
    nav.innerHTML = groups.filter(g => counts[g.id]).map(g => '<button role="tab" data-wc-grp="' + g.id + '" aria-selected="' + (g.id === cur) + '">' + esc(g.label) + '<i>' + counts[g.id] + '</i></button>').join('')
      + '<button role="tab" data-wc-grp="*" aria-selected="' + (cur === '*') + '">全部</button>';
    nav.dataset.page = page;
    const head = body.querySelector('.wc-pagehead');
    head ? head.after(nav) : body.insertBefore(nav, body.firstChild);
  }
  function applyGroup(body, g) {
    body.querySelectorAll('[data-wc-grp-of]').forEach(el => el.classList.toggle('wc-grp-hide', g !== '*' && el.dataset.wcGrpOf !== g));
    body.querySelectorAll('.wc-subnav [data-wc-grp]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.wcGrp === g)));
    // 选中一组时把这组段落全部展开（组内通常 3–8 段，不必再逐段点）
    if (g !== '*') body.querySelectorAll('.wc-sec-h[data-wc-grp-of="' + g + '"].wc-closed').forEach(s => toggleSec(s, true));
  }
  function layout() {
    const p = panel(); const body = p && p.querySelector('.wa-body'); if (!body || !pref.tidy || body.__wcLaid) return;
    body.__wcLaid = true;
    const id = cur(); pref.grp = pref.grp || {};
    if (id !== 'overview') p.classList.remove('wc-ov');
    p.querySelectorAll('.wa-sec').forEach(splitTitle);
    if (id === 'overview') {
      p.classList.add('wc-ov');
      const counts = {};
      Array.from(body.children).forEach(el => { const g = overviewGroup(el); if (!g) return; el.dataset.wcGrpOf = g; counts[g] = (counts[g] || 0) + 1; });
      const g = pref.grp.overview || 'state';
      subnav(body, OV_GROUPS, counts, g, id);
      // 状态组：把「简报」也并进来当默认首屏（玩家最常看的两类），诊断与工作流单独成页
      applyGroup(body, g === 'state' ? '__state' : g);
      if (g === 'state') body.querySelectorAll('[data-wc-grp-of]').forEach(el => el.classList.toggle('wc-grp-hide', !/state|brief/.test(el.dataset.wcGrpOf)));
      return;
    }
    p.classList.remove('wc-ov');
    const L = LAYOUTS[id]; if (!L) return;
    const secs = Array.from(body.querySelectorAll('.wc-sec-h, :scope > .wa-sec'));
    const counts = {};
    let lastG = L.groups[0].id;
    // 段落之前的散块（统计格、说明行）归入默认组
    Array.from(body.children).forEach(el => {
      if (el.classList.contains('wc-pagehead')) return;
      if (el.classList.contains('wa-sec')) {
        const t = el.textContent || '';
        const hit = L.groups.find(g => g.re.test(t));
        lastG = hit ? hit.id : 'other';
        counts[lastG] = (counts[lastG] || 0) + 1;
      }
      el.dataset.wcGrpOf = lastG;
    });
    const groups = L.groups.concat(counts.other ? [{ id: 'other', label: '其他' }] : []);
    const g = (pref.grp[id] && (counts[pref.grp[id]] || pref.grp[id] === '*')) ? pref.grp[id] : L.def;
    subnav(body, groups, counts, g, id);
    applyGroup(body, g);
  }


  // ── 7. 白话层（v2.405）：版本号整段去掉 + 黑话译白话 ──
  //   只改**浏览器里显示的文本节点**（测试/无头环境本模块不装载 ⇒ 源码与 textContent 断言不受影响）。
  //   精简显示关掉 ⇒ 重绘回原文（原文从未被写回任何存储）。
  //   规则按顺序执行；整句规则在前、单词规则在后（避免「读数不可用」先被拆成「数据不可用」再漏匹配）。
  const PLAIN_RULES = [
    // 版本号与开发标记：玩家/作者都不需要知道某功能哪一版加入
    [/[（(]\s*v\d+\.\d+\.\d+[^）)]{0,30}[）)]/g, ''],
    [/\s*v\d+\.\d+\.\d+(?:\s*[（(][^）)]{0,20}[）)])?\s*[:：]?\s*/g, ''],
    [/[（(]\s*(?:B\d|G\d{1,2}(?:-[A-Z])?|RX\d+|OPV\d+-\d+|EXV\d+-\d+|V\d+)\s*[）)]/g, ''],
    [/[（(]\s*(?:engines|core|ui|render|tools)\/[\w\-]+\.js\s*(?:缺席|未加载|未装载)?\s*[）)]/g, ''],
    // 整句：缺席/读数类
    [/([\u4e00-\u9fffA-Za-z]{1,10})读数(?:不可用|失败|异常)/g, '$1暂时读不到'],
    [/([\u4e00-\u9fffA-Za-z]{1,10})(?:模块|引擎)?(?:缺席|未装载|未加载)/g, '$1没有加载'],
    [/读数一直空|读数恒空/g, '会一直显示为空'],
    [/如实报缺|如实报出|如实报/g, '直接说明'],
    [/只报不改/g, '只显示，不修改'],
    [/带外核对|带外对账/g, '独立核对'],
    [/第二份真源/g, '重复的数据来源'],
    [/单一真源|真源/g, '唯一来源'],
    [/拒收归因|拒收桶/g, '被拒原因'],
    [/一律拒收|来源拒收|拒收/g, '拒绝'],
    [/未落盘|状态未落盘/g, '还没保存'],
    [/落盘/g, '保存'],
    [/按上限截断|已截断/g, '超出上限，只保留一部分'],
    [/挤出/g, '清理旧数据'],
    [/台账时间轴/g, '记录时间线'],
    [/驱动者台账/g, '推进记录'],
    [/台账|账本/g, '记录'],
    [/写口台/g, '手动写入'],
    [/写口/g, '写入入口'],
    [/口径/g, '算法'],
    [/悬空边/g, '断开的关联'],
    [/悬空/g, '没被用上'],
    [/未登记键/g, '未登记的设置'],
    [/水位预测/g, '容量预测'],
    [/水位/g, '用量'],
    [/世界签名/g, '世界标识'],
    [/(?<=[\u4e00-\u9fff])读数/g, '数据'],
    [/^读数/g, '数据'],
    [/裁决/g, '判定'],
    [/全知面/g, '作者视图'],
    [/玩家面/g, '玩家视图'],
    [/judge 通道/g, '评审模型'],
    [/子agent/g, '子模型'],
    // 收尾：清掉因删除留下的空括号、重复标点与首尾空白
    [/[（(]\s*[）)]/g, ''],
    [/([，。；、])\1+/g, '$1'],
    [/^[\s，；、]+|[\s，；、]+$/g, '']
  ];
  function plainText(s) {
    let t = s;
    for (const [re, rep] of PLAIN_RULES) { re.lastIndex = 0; t = t.replace(re, rep); }
    return t;
  }
  function plain(root) {
    if (!root || !pref.tidy) return;
    const w = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => {
      const p = n.parentNode; if (!p) return NodeFilter.FILTER_REJECT;
      if (/^(SCRIPT|STYLE|TEXTAREA|CODE|PRE)$/.test(p.nodeName)) return NodeFilter.FILTER_REJECT;
      if (p.closest && p.closest('.wa-log,.wa-pre,.wa-ta,[contenteditable],.wc-raw')) return NodeFilter.FILTER_REJECT;   // 日志与原始数据保留原文，方便对代码
      return n.nodeValue && n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; } });
    const list = []; while (w.nextNode()) list.push(w.currentNode);
    list.forEach(n => { if (n.__wcOrig != null) return; const v = plainText(n.nodeValue); if (v !== n.nodeValue) { n.__wcOrig = n.nodeValue; n.nodeValue = v || ' '; } });
    // 版本号片段（已被 tidy 包进 .wc-ver）直接隐藏
    root.querySelectorAll('.wc-ver').forEach(x => { x.hidden = true; });
    // title / placeholder 同样白话
    root.querySelectorAll('[title],[placeholder]').forEach(el => {
      ['title', 'placeholder'].forEach(a => { const v = el.getAttribute(a); if (v && !el.hasAttribute('data-wc-orig-' + a)) { const t = plainText(v); if (t !== v) { el.setAttribute('data-wc-orig-' + a, v); el.setAttribute(a, t); } } });
    });
  }
  function unplain(root) {
    const w = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const n = w.currentNode; if (n.__wcOrig != null) { n.nodeValue = n.__wcOrig; n.__wcOrig = null; } }
    root.querySelectorAll('.wc-ver').forEach(x => { x.hidden = false; });
    root.querySelectorAll('*').forEach(el => ['title', 'placeholder'].forEach(a => { const o = el.getAttribute('data-wc-orig-' + a); if (o != null) { el.setAttribute(a, o); el.removeAttribute('data-wc-orig-' + a); } }));
  }

  // ── 8. 细节（v2.405）──
  //   · 输出框：写入时淡入一次 + 一键复制 + 失败语句染色；
  //   · 按钮：点了之后 1.2s 内不可重复点（防连点触发两次写入），显示「处理中」；
  //   · 危险操作（删除/清空/重置/覆盖/恢复/导入）：按钮染赭红，需二次点击确认；
  //   · 空状态：只剩「无/暂无/还没有」一句的块，换成居中的弱化样式；
  //   · 数字：长整数加千分位（只在 .wa-stat-v / .wa-num / .wa-kv b 里）。
  const DANGER = /^(?:删除|清空|重置|覆盖|恢复|导入|放弃|丢弃|回滚|全部清除|移除)/;
  function details(root) {
    if (!pref.tidy) return;
    root.querySelectorAll('.wa-btn').forEach(b => {
      if (b.__wcDet) return; b.__wcDet = true;
      const t = (b.textContent || '').trim();
      if (DANGER.test(t)) b.classList.add('wc-danger');
    });
    root.querySelectorAll('.wa-stat-v,.wa-num,.wa-kv b').forEach(el => {
      if (el.children.length) return;
      const v = el.textContent; const m = /^(\s*)(\d{5,})(\s*)$/.exec(v);
      if (m) el.textContent = m[1] + Number(m[2]).toLocaleString('en-US') + m[3];
    });
    root.querySelectorAll('.wa-item,.wa-dim').forEach(el => {
      if (el.children.length) return;
      const t = (el.textContent || '').trim();
      if (t.length < 40 && /^(?:无|暂无|还没有|尚无|没有|此刻没有|未记录)/.test(t)) el.classList.add('wc-quiet');
    });
    root.querySelectorAll('.wa-out').forEach(o => {
      if (o.__wcObs) return; o.__wcObs = true;
      new MutationObserver(() => {
        const t = o.textContent || '';
        o.classList.toggle('wc-out-bad', /失败|拒绝|拒收|错误|异常|没走成/.test(t));
        o.classList.toggle('wc-out-ok', !!t && !o.classList.contains('wc-out-bad') && /已|成功|完成|保存/.test(t));
        o.classList.remove('wc-out-in'); void o.offsetWidth; if (t) o.classList.add('wc-out-in');
        if (t && !o.querySelector('.wc-copy') && t.length > 40) {
          const c = doc.createElement('button'); c.className = 'wc-copy'; c.type = 'button'; c.textContent = '复制';
          c.onclick = ev => { ev.stopPropagation(); try { navigator.clipboard.writeText(t); c.textContent = '已复制'; setTimeout(() => { c.textContent = '复制'; }, 1200); } catch (e) {} };
          o.appendChild(c);
        }
      }).observe(o, { childList: true, characterData: true, subtree: true });
    });
  }
  // 捕获阶段：危险按钮二次确认 + 普通按钮防连点（不改按钮自身的 onclick）
  function guard(e) {
    if (!pref.tidy) return;
    const b = e.target.closest && e.target.closest('.wa-btn'); if (!b || b.disabled) return;
    if (b.classList.contains('wc-danger') && !b.__wcArmed) {
      e.stopImmediatePropagation(); e.preventDefault();
      b.__wcArmed = true; b.__wcTxt = b.innerHTML; b.classList.add('wc-armed'); b.textContent = '再点一次确认';
      setTimeout(() => { if (b.__wcArmed) { b.__wcArmed = false; b.classList.remove('wc-armed'); b.innerHTML = b.__wcTxt; } }, 2600);
      return;
    }
    if (b.__wcArmed) { b.__wcArmed = false; b.classList.remove('wc-armed'); b.innerHTML = b.__wcTxt; }
    if (b.__wcBusy) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    b.__wcBusy = true; b.classList.add('wc-busy');
    setTimeout(() => { b.__wcBusy = false; b.classList.remove('wc-busy'); }, 1200);
  }

  // ── 装配 ──
  function mount() {
    const p = panel(); if (!p || p.__wc) return !!p;
    p.__wc = true; p.classList.add('wc'); p.classList.toggle('wc-wide', !!pref.wide);
    dressHead(); dressTabs(); dressBody();
    p.addEventListener('click', e => {
      const pin = e.target.closest('[data-wc-pin]');
      if (pin) { e.stopPropagation(); e.preventDefault(); const id = pin.dataset.wcPin; const i = pref.pins.indexOf(id); i >= 0 ? pref.pins.splice(i, 1) : pref.pins.push(id); save(); dressTabs(); return; }
      const j = e.target.closest('[data-wc-jump]'); if (j) { const s = panel().querySelector('#' + j.dataset.wcJump); if (s && s.classList.contains('wc-closed')) { toggleSec(s, true); save(); } jump(j.dataset.wcJump); return; }
      const sh = e.target.closest('.wc-sec-h');
      if (sh && !e.target.closest('button,input,select,label,a')) { toggleSec(sh); save(); return; }
      const all = e.target.closest('[data-wc-all]');
      if (all) { const o = all.dataset.wcAll === '1'; panel().querySelectorAll('.wc-sec-h').forEach(s => toggleSec(s, o)); save(); all.dataset.wcAll = o ? '0' : '1'; all.textContent = o ? '全部收起' : '全部展开'; return; }
      const gb = e.target.closest('[data-wc-grp]');
      if (gb) { const bd = panel().querySelector('.wa-body'); const pg = cur(); pref.grp = pref.grp || {}; pref.grp[pg] = gb.dataset.wcGrp; save();
        if (pg === 'overview' && gb.dataset.wcGrp === 'state') { bd.querySelectorAll('[data-wc-grp-of]').forEach(el => el.classList.toggle('wc-grp-hide', !/state|brief/.test(el.dataset.wcGrpOf))); bd.querySelectorAll('.wc-subnav [data-wc-grp]').forEach(b => b.setAttribute('aria-selected', String(b === gb))); }
        else applyGroup(bd, gb.dataset.wcGrp);
        bd.scrollTop = 0; return; }
      if (e.target.closest('[data-wc-absent]')) { panel().classList.toggle('wc-show-absent'); return; }
      const b = e.target.closest('[data-wc]'); if (!b) return;
      if (b.dataset.wc === 'pal') openPal();
      if (b.dataset.wc === 'wide') { pref.wide = !pref.wide; save(); p.classList.toggle('wc-wide', pref.wide); }
      if (b.dataset.wc === 'tidy') { pref.tidy = !pref.tidy; save(); b.classList.toggle('on', pref.tidy); b.title = pref.tidy ? '精简显示：开（点击看原样）' : '精简显示：关'; const bd = p.querySelector('.wa-body'); if (pref.tidy) { bd.__wcTidied = false; bd.__wcLaid = false; tidy(); layout(); plain(bd); details(bd); } else { p.classList.remove('wc-tidy'); unplain(bd); } }
    }, true);
    const body = p.querySelector('.wa-body');
    new MutationObserver(() => {
      // 切页/重绘时 panel.js 复用同一个 .wa-body（只换子节点）⇒ 「已整理」标记必须随新内容重置，
      //   否则只有第一页会被整理。判据：页头不在了 = 这是一份新内容。
      if (!body.querySelector(':scope > .wc-pagehead')) { body.__wcTidied = false; body.__wcLaid = false; p.classList.remove('wc-show-absent'); }
      dressBody(); tidy(); layout(); plain(body); details(body);
    }).observe(body, { childList: true });
    tidy(); layout(); plain(body); details(body); plain(p.querySelector('.wa-head')); plain(p.querySelector('.wa-tabs'));
    p.addEventListener('click', guard, true);
    const tabs = p.querySelector('.wa-tabs');
    // 分类切换/开发者模式切换会改 tab 的 display ⇒ 重算分组标题
    new MutationObserver(() => { if (dressing) return; clearTimeout(tabs.__t); tabs.__t = setTimeout(dressTabs, 30); }).observe(tabs, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });
    doc.addEventListener('keydown', e => {
      if (p.classList.contains('wa-hidden')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal && !pal.hidden ? closePal() : openPal(); return; }
      const ae = doc.activeElement; const typing = ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName);
      if (e.key === '/' && !typing) { e.preventDefault(); openPal(); }
    });
    return true;
  }
  let tries = 0;
  (function wait() { if (mount()) return; if (++tries < 80) setTimeout(wait, 400); })();

  WA.console = { tidy: tidy };
})();

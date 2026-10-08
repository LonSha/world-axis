/**
 * WorldAxis ui/theme-switch.js — 主题切换（v2.181.0）
 *
 * 设计：把整套赛博朋克视觉做成**可切换主题**，默认主题下不注入任何新样式，
 *       界面与 v2.173.0 逐像素一致。切换入口挂在悬浮球右键上——
 *       为什么是右键而不是面板里加按钮：面板里任何新控件都必须同时做
 *       「渲染 + 绑定 + tool-diag 的 UI_BINDINGS 登记」三件事，否则
 *       「渲染了但绑定写错 id」这类断裂在新增出口上无人发现（本仓已裁决过的规矩）。
 *       右键菜单在面板树之外，既不动 panel.js，也不进 G17-B 的控件遍历面。
 *
 * 单一真源：主题清单只在本文件声明一份；样本文本由 ui/cyberpunk-*.js 登记进
 *           WA.themeStyles，本文件只负责按当前主题装卸，不自带第二份样式。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainDoc = WA.mainDoc || document;

  // ── 主题清单（单一真源）──
  //   样式 id 的**顺序有意义**：wa-cyberpunk-theme 提供 :root 变量，必须最先注入，
  //   后续样式表都读这些变量。顺序错了会看到「变量未定义」的原生色。
  const CYBER_STYLES = [
    'wa-cyberpunk-theme',
    'wa-cyberpunk-bg',
    'wa-cyberpunk-components',
    'wa-cyberpunk-dashboard',
    'wa-cyberpunk-people',
    'wa-cyberpunk-logs',
    'wa-cyberpunk-animations',
    'wa-cyberpunk-responsive'
  ];
  const THEMES = [
    { id: 'default', label: '默认 · 冷峻控制台', desc: '原版外观：深色玻璃拟态 + 青色单色强调', styles: [] },
    { id: 'cyberpunk', label: '赛博朋克控制台', desc: '深空背景 + 荧光强调色 + 六角网格 + CRT 扫描线', styles: CYBER_STYLES }
  ];

  // ── 持久化：走 settingsBus 登记（**不裸调 localStorage**）──
  //   为什么必须走登记：裸调 localStorage.setItem 会让「一次用户操作」在诊断里变成
  //   「没有发生过」——那条路径内含写后读回校验、失败分桶、结构指纹与迁移引擎，
  //   绕开它等于自断观测面（本仓对这件事已有裁决，见 ui/panel.js 顶部的同款说明）。
  const THEME_KEY = 'worldaxis_ui_theme_v1';
  const themeReg = {
    key: THEME_KEY,
    def: { theme: 'default' },
    module: 'ui',
    // 枚举白名单：主题 id 是**闭合集合**。不声明的话，旧版本删掉某主题后磁盘里会留下
    //   一个永远切不过去的值，表现为「设置里显示已切换、界面却没变」且零报错。
    enums: { theme: THEMES.map(function (t) { return t.id; }) }
  };
  // 幂等登记（与 panel.js 同款 filter+concat）：tests/run.js 有多处直接求值本文件，
  //   无条件 concat 会让同一个键在表里出现多次，而「重复登记」在 settingsBus.selfCheck()
  //   里是 error 级阻断项 —— 那会是一盏自造的红灯。
  WA.__settingsRegs = (WA.__settingsRegs || []).filter(function (r) {
    return !r || r.key !== THEME_KEY;
  }).concat([themeReg]);

  function readTheme() {
    try {
      if (WA.settingsBus && typeof WA.settingsBus.read === 'function') {
        const v = WA.settingsBus.read(themeReg);
        if (v && typeof v.theme === 'string') return v.theme;
      }
    } catch (e) {}
    return 'default';
  }
  function persistTheme(id) {
    try {
      if (WA.settingsBus && typeof WA.settingsBus.saveOrThrow === 'function') {
        const r = WA.settingsBus.saveOrThrow(themeReg, { theme: id });
        if (r && r.ok === false && WA.log) {
          WA.log('warn', 'ui.theme: 主题未落盘（' + (r.reason || '?') + '，本次会话内仍生效）', null);
        }
        return r || { ok: false };
      }
      if (WA.log) WA.log('warn', 'ui.theme: 主题未落盘——设置总线未装载（本次会话内仍生效）', null);
    } catch (e) {
      if (WA.log) WA.log('warn', 'ui.theme: 主题写盘异常', e);
    }
    return { ok: false };
  }

  // ── 样式装卸（全部委托给 WA.themeStyles，本文件不自持样式表）──
  function applyStyle(id) {
    try {
      if (WA.themeStyles && typeof WA.themeStyles.apply === 'function') return WA.themeStyles.apply(id);
    } catch (e) {
      if (WA.log) WA.log('warn', 'ui.theme: 样式注入失败 ' + id, e);
    }
    return null;
  }
  function removeStyle(id) {
    try {
      if (WA.themeStyles && typeof WA.themeStyles.remove === 'function') WA.themeStyles.remove(id);
    } catch (e) {
      if (WA.log) WA.log('warn', 'ui.theme: 样式移除失败 ' + id, e);
    }
  }

  function byId(id) {
    for (let i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return null;
  }

  /** 切换主题。返回 {ok, changed, to, reason?} —— 与 WA.perspective.setView 同口径，
   *  两态严格分开：ok:false 是「没切上」，ok:true + changed:false 是「本来就是这档」（幂等）。 */
  function setTheme(id) {
    const t = byId(id);
    if (!t) return { ok: false, reason: 'unknown-theme', allowed: THEMES.map(function (x) { return x.id; }) };
    const from = readTheme();
    if (from === id) {
      // 幂等：即便当前已是该主题，也补一次 apply —— 样式表可能被宿主清理过
      t.styles.forEach(applyStyle);
      return { ok: true, changed: false, to: id };
    }
    // 先卸旧再装新（顺序不能反：反了会有一瞬间两套样式并存，视觉闪一下）
    const prev = byId(from);
    if (prev) prev.styles.forEach(removeStyle);
    t.styles.forEach(applyStyle);
    persistTheme(id);
    try { if (typeof WA.emit === 'function') WA.emit('ui:theme-changed', { from: from, to: id }); } catch (e) {}
    if (WA.log) WA.log('info', 'ui.theme: ' + from + ' → ' + id);
    return { ok: true, changed: true, to: id, from: from };
  }

  function currentTheme() { return readTheme(); }

  // ── 右键菜单 ──
  //   为什么用「文档级捕获 + 判断 target」而不是给 #wa-orb 直接挂监听：
  //   本模块在 panel.js **之后**装载，而悬浮球是 panel.js 的 mount() 阶段才建出来的
  //   （index.js 在全部模块加载完才调 mount）——装载期 orb 根本不存在，直接挂会挂空。
  //   捕获阶段监听不需要目标先存在，且不依赖任何模块的挂载时机。
  const MENU_ID = 'wa-theme-menu';
  function closeMenu() {
    const m = mainDoc.getElementById(MENU_ID);
    if (m && m.parentNode) m.parentNode.removeChild(m);
  }
  function openMenu(x, y) {
    closeMenu();
    const cur = currentTheme();
    const box = mainDoc.createElement('div');
    box.id = MENU_ID;
    box.setAttribute('role', 'menu');
    box.setAttribute('aria-label', '界面主题');
    box.innerHTML = '<div class="wa-theme-mtitle">界面主题</div>'
      + THEMES.map(function (t) {
        return '<button type="button" class="wa-theme-mitem' + (t.id === cur ? ' wa-theme-on' : '') + '"'
          + ' data-theme="' + t.id + '" role="menuitemradio" aria-checked="' + (t.id === cur ? 'true' : 'false') + '">'
          + '<b>' + t.label + (t.id === cur ? ' ✓' : '') + '</b><span>' + t.desc + '</span></button>';
      }).join('')
      + '<div class="wa-theme-mnote">右键悬浮球可再次打开</div>';
    box.style.position = 'fixed';
    box.style.zIndex = '1000001';
    box.style.left = Math.max(8, Math.min(x, (mainDoc.documentElement.clientWidth || 1024) - 268)) + 'px';
    box.style.top = Math.max(8, Math.min(y, (mainDoc.documentElement.clientHeight || 768) - 200)) + 'px';
    (mainDoc.body || mainDoc.documentElement).appendChild(box);
    box.querySelectorAll('[data-theme]').forEach(function (b) {
      b.onclick = function () {
        setTheme(b.dataset.theme);
        closeMenu();
      };
    });
    return box;
  }

  // 菜单样式：与主题无关（默认主题下也要能看），故内联注入且自带 id（幂等）
  const MENU_CSS = [
    '#' + MENU_ID + '{background:#12161c;border:1px solid rgba(94,234,212,.35);border-radius:10px;',
    'box-shadow:0 10px 40px rgba(0,0,0,.65);padding:8px;width:260px;',
    'font:12px/1.5 -apple-system,"Segoe UI",sans-serif;color:#d7dde4}',
    '#' + MENU_ID + ' .wa-theme-mtitle{color:#5eead4;font-weight:600;padding:4px 8px 8px;font-size:12px}',
    '#' + MENU_ID + ' .wa-theme-mitem{display:block;width:100%;text-align:left;background:none;border:none;',
    'color:#d7dde4;padding:8px;border-radius:6px;cursor:pointer;font:inherit}',
    '#' + MENU_ID + ' .wa-theme-mitem:hover{background:rgba(94,234,212,.12)}',
    '#' + MENU_ID + ' .wa-theme-mitem b{display:block;font-weight:600}',
    '#' + MENU_ID + ' .wa-theme-mitem span{display:block;color:#77828f;font-size:11px;margin-top:2px}',
    '#' + MENU_ID + ' .wa-theme-on b{color:#5eead4}',
    '#' + MENU_ID + ' .wa-theme-mnote{color:#5a6470;font-size:11px;padding:6px 8px 2px;border-top:1px solid rgba(255,255,255,.08);margin-top:6px}'
  ].join('');

  // 文档级捕获监听：右键悬浮球 → 打开主题菜单；点别处 → 关闭
  try {
    mainDoc.addEventListener('contextmenu', function (e) {
      const orb = mainDoc.getElementById('wa-orb');
      const onOrb = orb && (e.target === orb || (orb.contains && orb.contains(e.target)));
      if (onOrb) {
        e.preventDefault();
        e.stopPropagation();
        openMenu(e.clientX || 100, e.clientY || 100);
        return;
      }
      if (mainDoc.getElementById(MENU_ID)) closeMenu();
    }, true);
    mainDoc.addEventListener('click', function (e) {
      const m = mainDoc.getElementById(MENU_ID);
      if (m && !(m.contains && m.contains(e.target))) closeMenu();
    }, true);
    mainDoc.addEventListener('keydown', function (e) {
      if (e && e.key === 'Escape') closeMenu();
    }, true);
  } catch (e) {
    if (WA.log) WA.log('warn', 'ui.theme: 右键入口挂载失败', e);
  }

  // 装载期应用当前主题（默认主题时 styles 为空数组，等于什么都不做）
  try {
    const cur = readTheme();
    const t = byId(cur);
    if (t) t.styles.forEach(applyStyle);
  } catch (e) {
    if (WA.log) WA.log('warn', 'ui.theme: 初始主题应用失败', e);
  }

  WA.themeSwitch = {
    version: '2.181.0',
    themes: function () { return THEMES.slice(); },
    current: currentTheme,
    set: setTheme,
    open: openMenu,
    close: closeMenu,
    menuId: MENU_ID,
    _css: MENU_CSS,
    /** 幂等注入菜单样式（默认主题下也要能看菜单，故与主题样式分开管理）。 */
    injectMenuCss: function () {
      try {
        if (mainDoc.getElementById('wa-theme-menu-css')) return;
        const s = mainDoc.createElement('style');
        s.id = 'wa-theme-menu-css';
        s.textContent = MENU_CSS;
        (mainDoc.head || mainDoc.documentElement).appendChild(s);
      } catch (e) {}
    }
  };
  // 菜单样式无条件注入（它不属于任何主题，是入口自身的外观）
  WA.themeSwitch.injectMenuCss();
})();

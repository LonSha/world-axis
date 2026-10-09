/**
 * WorldAxis ui/cyberpunk-responsive.js — 响应式 + 性能 + 可访问性
 * v2.180.0: 三档断点适配 + 性能优化 + 无障碍增强
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainDoc = WA.mainDoc || document;
  const mainWin = WA.mainWin || window;

  const RESPONSIVE_CSS = `
    /* ============ 断点变量（桌面基准）============ */
    :root {
      --wa-bp-tablet: 1200px;
      --wa-bp-mobile: 768px;
      --wa-pad-page: 24px;
      --wa-pad-card: 20px;
      --wa-gap-grid: 20px;
      --wa-font-base: 15px;
      --wa-tabbar-height: 56px;
    }

    /* ============ 平板端（768-1200px）============ */
    @media (max-width: 1200px) {
      :root {
        --wa-pad-page: 18px;
        --wa-pad-card: 16px;
        --wa-gap-grid: 16px;
      }

      .wa-dashboard,
      .wa-people-grid {
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)) !important;
      }

      .wa-dashboard-large {
        grid-column: span 1 !important;
      }

      .wa-tabs {
        padding: 10px 18px;
      }
    }

    /* ============ 移动端（<768px）============ */
    @media (max-width: 768px) {
      :root {
        --wa-pad-page: 12px;
        --wa-pad-card: 14px;
        --wa-gap-grid: 12px;
        --wa-font-base: 14px;
      }

      /* 面板改为全屏纵向滚动 */
      #wa-panel {
        overflow: hidden;
      }

      .wa-head {
        padding: 12px 14px;
      }

      .wa-title {
        font-size: 16px;
      }

      .wa-viewsel {
        padding: 5px 8px;
        font-size: 12px;
      }

      /* 标签栏横向滚动 + 隐藏滚动条 */
      .wa-tabs {
        padding: 8px 12px;
        gap: 6px;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }

      .wa-tabs::-webkit-scrollbar {
        display: none;
      }

      .wa-tab {
        padding: 7px 12px;
        font-size: 12px;
        flex-shrink: 0;
      }

      .wa-body {
        padding: var(--wa-pad-page);
      }

      /* 所有网格降为单列 */
      .wa-dashboard,
      .wa-people-grid,
      .wa-grid-2,
      .wa-grid-3,
      .wa-quick-actions,
      .wa-person-stats {
        grid-template-columns: 1fr !important;
      }

      /* 卡片内边距压缩 */
      .wa-card,
      .wa-stat-card,
      .wa-person-card {
        padding: var(--wa-pad-card);
        margin-bottom: 12px;
      }

      /* 大字号降级 */
      .wa-time-main {
        font-size: 36px;
      }

      .wa-stat-value {
        font-size: 26px;
      }

      .wa-person-detail-header {
        flex-direction: column;
        align-items: center;
        text-align: center;
      }

      /* 触摸目标放大（≥44px）*/
      .wa-btn,
      .wa-quick-btn,
      .wa-tab,
      .wa-log-filter-btn {
        min-height: 44px;
      }

      .wa-toggle {
        width: 52px;
        height: 28px;
      }

      .wa-toggle-slider::before {
        height: 20px;
        width: 20px;
        left: 3px;
        bottom: 3px;
      }

      .wa-toggle input:checked + .wa-toggle-slider::before {
        transform: translateX(24px);
      }

      /* 悬浮球缩小并避让安全区 */
      #wa-orb {
        width: 48px;
        height: 48px;
        font-size: 20px;
        right: 16px;
        bottom: calc(16px + env(safe-area-inset-bottom, 0px));
      }

      /* 日志行改为纵向堆叠 */
      .wa-log-line {
        flex-wrap: wrap;
        gap: 6px;
      }

      .wa-log-time {
        min-width: auto;
      }

      .wa-log-level {
        min-width: auto;
      }

      .wa-log-message {
        flex-basis: 100%;
      }

      /* 通知全宽 */
      .wa-notification {
        left: 12px;
        right: 12px;
        min-width: auto;
        max-width: none;
        top: 60px;
      }

      /* 表格横向滚动 */
      .wa-table-wrap {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
    }

    /* ============ 超窄屏（<420px）============ */
    @media (max-width: 420px) {
      .wa-tab {
        padding: 6px 10px;
        font-size: 11px;
      }

      .wa-title {
        font-size: 15px;
      }

      .wa-time-main {
        font-size: 30px;
      }
    }

    /* ============ 横屏矮视口 ============ */
    @media (max-height: 500px) and (orientation: landscape) {
      .wa-head {
        padding: 8px 14px;
      }

      .wa-tabs {
        padding: 6px 12px;
      }

      .wa-body {
        padding: 12px;
      }

      .wa-time-display {
        padding: 16px;
      }
    }

    /* ============ 性能优化 ============ */

    /* 离屏内容跳过渲染（超长列表）*/
    .wa-engine-list,
    .wa-timeline,
    .wa-logs-container {
      content-visibility: auto;
      contain-intrinsic-size: 0 400px;
    }

    /* 卡片提升为独立层（减少重排）*/
    .wa-card,
    .wa-stat-card,
    .wa-person-card {
      contain: layout style paint;
    }

    /* 动效元素 GPU 加速 */
    #wa-orb,
    .wa-progress-bar,
    .wa-fondness-fill,
    .wa-loading-spinner-large,
    .wa-spinner {
      will-change: transform;
      transform: translateZ(0);
    }

    /* 尊重系统降低动效偏好 */
    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }

      /* 保留必要的状态提示（改为静态可见）*/
      .wa-status-dot,
      .wa-log-live-dot {
        opacity: 1 !important;
        transform: none !important;
      }
    }

    /* ============ 可访问性 ============ */

    /* 键盘焦点可见 */
    .wa-btn:focus-visible,
    .wa-tab:focus-visible,
    .wa-input:focus-visible,
    .wa-viewsel:focus-visible,
    .wa-quick-btn:focus-visible,
    .wa-toggle input:focus-visible + .wa-toggle-slider,
    .wa-log-filter-btn:focus-visible,
    .wa-close:focus-visible,
    #wa-orb:focus-visible {
      outline: 2px solid var(--wa-accent-cyan);
      outline-offset: 2px;
      box-shadow: 0 0 0 4px rgba(0,217,255,0.2);
    }

    /* 移除鼠标点击焦点框（保留键盘）*/
    .wa-btn:focus:not(:focus-visible),
    .wa-tab:focus:not(:focus-visible) {
      outline: none;
    }

    /* 屏幕阅读器专用文本 */
    .wa-sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    /* 高对比度模式 */
    @media (prefers-contrast: more) {
      :root {
        --wa-text-primary: #ffffff;
        --wa-text-secondary: #cbd5e1;
        --wa-text-tertiary: #94a3b8;
        --wa-border-subtle: rgba(0,217,255,0.4);
        --wa-border-normal: rgba(0,217,255,0.6);
      }

      .wa-card,
      .wa-stat-card,
      .wa-person-card {
        border-width: 2px;
      }
    }

    /* 强制高对比色（系统色）*/
    @media (forced-colors: active) {
      .wa-btn,
      .wa-tab,
      .wa-card {
        border: 1px solid ButtonText;
      }

      .wa-status-dot,
      .wa-log-live-dot {
        forced-color-adjust: none;
      }
    }

    /* 触摸设备：禁用悬停位移（避免误触）*/
    @media (hover: none) {
      .wa-card:hover,
      .wa-stat-card:hover,
      .wa-person-card:hover,
      .wa-quick-btn:hover {
        transform: none;
      }
    }

    /* 打印样式 */
    @media print {
      #wa-orb,
      .wa-tabs,
      .wa-close {
        display: none !important;
      }

      #wa-panel {
        position: static;
        background: #fff;
        color: #000;
      }

      .wa-card,
      .wa-stat-card {
        border: 1px solid #000;
        box-shadow: none;
        page-break-inside: avoid;
      }
    }
  `;

  // 注入样式
  function injectResponsive() {
    if (mainDoc.getElementById('wa-cyberpunk-responsive')) return;
    // v2.181.0：样式登记进主题注册表，不再自动注入（可切换主题的地基）
    if (WA.themeStyles && WA.themeStyles.register) WA.themeStyles.register('wa-cyberpunk-responsive', RESPONSIVE_CSS);
  }
  injectResponsive();

  // ── 视口档位检测 ──
  //   为什么需要它：CSS 媒体查询只管样式，但有些行为必须走 JS ——
  //   例如「移动端只渲染当前页 / 桌面端做重绘节流」这类渲染策略。
  //   单一真源：档位只在此处判定一次，别处读 WA.cyberResponsive.tier()。
  function currentTier() {
    try {
      const w = mainWin.innerWidth || 1024;
      if (w <= 768) return 'mobile';
      if (w <= 1200) return 'tablet';
      return 'desktop';
    } catch (e) {
      return 'desktop';
    }
  }

  // ── 渲染节流 ──
  //   移动端 CPU 弱、重绘成本高：把面板自动重绘窗口从 150ms 拉长到 400ms。
  //   不改 panel.js 的节流常量（那是它的锚点区），而是提供阈值供其读取。
  const RERENDER_MS = { desktop: 150, tablet: 250, mobile: 400 };

  // ── 长列表虚拟化阈值 ──
  //   超过此值的长列表才启用分片渲染（移动端更保守）。
  const LIST_CHUNK = { desktop: 200, tablet: 120, mobile: 60 };

  // ── 档位变化广播 ──
  //   为什么广播：resize 时若档位跨越断点，调用方需要重算布局相关状态
  //   （不能只在初始化时判定一次，否则「手机转平板」后一直是手机档）。
  let lastTier = currentTier();
  function onResize() {
    const t = currentTier();
    if (t === lastTier) return;
    const from = lastTier;
    lastTier = t;
    if (WA.emit) { try { WA.emit('ui:tier-changed', { from: from, to: t }); } catch (e) {} }
    if (WA.log) { try { WA.log('info', 'ui: 视口档位 ' + from + ' → ' + t); } catch (e) {} }
  }
  if (mainWin.addEventListener) {
    let resizeTimer = null;
    mainWin.addEventListener('resize', function () {
      if (resizeTimer) return;
      resizeTimer = setTimeout(function () { resizeTimer = null; onResize(); }, 200);
    });
  }

  WA.cyberResponsive = {
    version: '2.180.0',
    tier: currentTier,
    rerenderMs: function () { return RERENDER_MS[currentTier()] || 150; },
    listChunk: function () { return LIST_CHUNK[currentTier()] || 200; },
    isMobile: function () { return currentTier() === 'mobile'; },
    inject: injectResponsive,
    // 长列表分片（供页面渲染器调用）
    chunk: function (items, size) {
      const n = size || TABLE_CHUNK_SAFE(items);
      const out = [];
      for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
      return out;
    }
  };

  // 防御：chunk 的默认尺寸（避免未定义引用）
  function TABLE_CHUNK_SAFE(items) {
    const base = LIST_CHUNK[currentTier()] || 200;
    return base;
  }
})();

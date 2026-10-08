/**
 * WorldAxis ui/cyberpunk-theme.js — 赛博朋克主题系统
 * v2.174.0: 色彩变量 + 玻璃态样式 + 动效基础
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainDoc = WA.mainDoc || document;

  const CYBERPUNK_CSS = `
    /* ============ 色彩系统 ============ */
    :root {
      /* 深空背景 */
      --wa-bg-void: #0a0e1a;
      --wa-bg-layer1: #0f1419;
      --wa-bg-layer2: #151b24;
      --wa-bg-layer3: #1a212e;
      --wa-glass-dark: rgba(15,20,25,0.85);
      --wa-glass-light: rgba(26,33,46,0.7);
      
      /* 荧光强调色 */
      --wa-accent-cyan: #00d9ff;
      --wa-accent-cyan-glow: rgba(0,217,255,0.5);
      --wa-accent-magenta: #ff006e;
      --wa-accent-violet: #7c3aed;
      --wa-accent-amber: #fbbf24;
      --wa-accent-emerald: #10b981;
      
      /* 文本层级 */
      --wa-text-primary: #e2e8f0;
      --wa-text-secondary: #94a3b8;
      --wa-text-tertiary: #64748b;
      --wa-text-disabled: #475569;
      --wa-text-glow: #ffffff;
      
      /* 边框 */
      --wa-border-subtle: rgba(0,217,255,0.15);
      --wa-border-normal: rgba(0,217,255,0.3);
      --wa-border-strong: rgba(0,217,255,0.6);
      
      /* 阴影 */
      --wa-shadow-sm: 0 2px 8px rgba(0,0,0,0.3);
      --wa-shadow-md: 0 4px 16px rgba(0,0,0,0.4);
      --wa-shadow-lg: 0 8px 32px rgba(0,0,0,0.5);
      --wa-shadow-glow: 0 0 20px var(--wa-accent-cyan-glow);
      
      /* 动画时长 */
      --wa-duration-fast: 150ms;
      --wa-duration-normal: 300ms;
      --wa-duration-slow: 500ms;
      
      /* 缓动函数 */
      --wa-ease-out: cubic-bezier(0.33, 1, 0.68, 1);
      --wa-ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
    }

    /* ============ 悬浮球（量子核心）============ */
    #wa-orb {
      position: fixed;
      right: 24px;
      bottom: 24px;
      width: 56px;
      height: 56px;
      background: linear-gradient(135deg, var(--wa-accent-cyan), var(--wa-accent-violet));
      border-radius: 50%;
      box-shadow: 0 0 24px var(--wa-accent-cyan-glow), var(--wa-shadow-md);
      clip-path: polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%);
      cursor: pointer;
      z-index: 999999;
      font-size: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--wa-text-glow);
      user-select: none;
      transition: all var(--wa-duration-normal) var(--wa-ease-out);
      animation: wa-orb-pulse 2s ease-in-out infinite;
    }

    @keyframes wa-orb-pulse {
      0%, 100% { transform: scale(0.95); opacity: 0.85; }
      50% { transform: scale(1.05); opacity: 1; }
    }

    #wa-orb:hover {
      transform: scale(1.1) !important;
      box-shadow: 0 0 32px var(--wa-accent-cyan-glow), var(--wa-shadow-lg);
    }

    #wa-orb.wa-busy {
      background: linear-gradient(135deg, var(--wa-accent-amber), var(--wa-accent-magenta));
      animation: wa-orb-spin 1s linear infinite, wa-orb-pulse 2s ease-in-out infinite;
    }

    @keyframes wa-orb-spin {
      from { transform: rotate(0deg) scale(1); }
      to { transform: rotate(360deg) scale(1); }
    }

    /* ============ 主面板容器 ============ */
    #wa-panel {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(10,14,26,0.95);
      backdrop-filter: blur(16px) saturate(180%);
      z-index: 999998;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: var(--wa-text-primary);
      transition: opacity var(--wa-duration-normal) var(--wa-ease-out);
    }

    #wa-panel.wa-hidden {
      opacity: 0;
      pointer-events: none;
    }

    /* ============ 顶部头部 ============ */
    .wa-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 24px;
      background: var(--wa-glass-dark);
      border-bottom: 1px solid var(--wa-border-subtle);
      box-shadow: var(--wa-shadow-sm);
    }

    .wa-title {
      font-size: 20px;
      font-weight: 700;
      color: var(--wa-accent-cyan);
      text-shadow: 0 0 12px var(--wa-accent-cyan-glow);
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .wa-ver {
      font-size: 12px;
      font-weight: 400;
      color: var(--wa-text-secondary);
      opacity: 0.7;
    }

    .wa-view {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .wa-viewsel {
      background: var(--wa-bg-layer2);
      border: 1px solid var(--wa-border-normal);
      border-radius: 6px;
      padding: 6px 12px;
      color: var(--wa-text-primary);
      font-size: 13px;
      cursor: pointer;
      transition: all var(--wa-duration-fast) var(--wa-ease-out);
    }

    .wa-viewsel:hover {
      border-color: var(--wa-accent-cyan);
      box-shadow: 0 0 8px var(--wa-accent-cyan-glow);
    }

    .wa-close {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--wa-bg-layer2);
      border: 1px solid var(--wa-border-subtle);
      border-radius: 6px;
      color: var(--wa-text-secondary);
      font-size: 18px;
      cursor: pointer;
      transition: all var(--wa-duration-fast) var(--wa-ease-out);
    }

    .wa-close:hover {
      background: var(--wa-accent-magenta);
      border-color: var(--wa-accent-magenta);
      color: var(--wa-text-glow);
      box-shadow: 0 0 12px rgba(255,0,110,0.5);
    }

    /* ============ 标签栏 ============ */
    .wa-tabs {
      display: flex;
      gap: 4px;
      padding: 12px 24px;
      background: var(--wa-bg-layer1);
      border-bottom: 1px solid var(--wa-border-subtle);
      overflow-x: auto;
      scrollbar-width: thin;
      scrollbar-color: var(--wa-accent-cyan) var(--wa-bg-layer2);
    }

    .wa-tab {
      padding: 8px 16px;
      background: var(--wa-bg-layer2);
      border: 1px solid var(--wa-border-subtle);
      border-radius: 8px;
      color: var(--wa-text-secondary);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--wa-duration-fast) var(--wa-ease-out);
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .wa-tab:hover {
      background: var(--wa-bg-layer3);
      border-color: var(--wa-border-normal);
      color: var(--wa-text-primary);
      transform: translateY(-1px);
    }

    .wa-tab.active {
      background: linear-gradient(135deg, var(--wa-accent-cyan), var(--wa-accent-violet));
      border-color: var(--wa-accent-cyan);
      color: var(--wa-text-glow);
      box-shadow: 0 0 16px var(--wa-accent-cyan-glow), var(--wa-shadow-sm);
      font-weight: 600;
    }

    /* ============ 主体内容区 ============ */
    .wa-body {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      background: var(--wa-bg-void);
    }

    /* ============ 卡片系统 ============ */
    .wa-card {
      background: var(--wa-glass-dark);
      backdrop-filter: blur(12px) saturate(180%);
      border: 1px solid var(--wa-border-subtle);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
      box-shadow: var(--wa-shadow-md);
      transition: all var(--wa-duration-normal) var(--wa-ease-out);
    }

    .wa-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--wa-shadow-lg), var(--wa-shadow-glow);
      border-color: var(--wa-border-normal);
    }

    .wa-card-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--wa-accent-cyan);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* ============ 按钮系统 ============ */
    .wa-btn {
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all var(--wa-duration-fast) var(--wa-ease-out);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .wa-btn-primary {
      background: linear-gradient(135deg, var(--wa-accent-cyan) 0%, var(--wa-accent-violet) 100%);
      color: var(--wa-text-glow);
      box-shadow: var(--wa-shadow-glow);
      border: 1px solid var(--wa-border-strong);
    }

    .wa-btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 0 32px var(--wa-accent-cyan-glow), var(--wa-shadow-md);
    }

    .wa-btn-primary:active {
      transform: scale(0.98);
    }

    .wa-btn-secondary {
      background: var(--wa-bg-layer2);
      border: 1px solid var(--wa-border-normal);
      color: var(--wa-accent-cyan);
    }

    .wa-btn-secondary:hover {
      background: var(--wa-bg-layer3);
      box-shadow: 0 0 12px var(--wa-accent-cyan-glow);
    }

    .wa-btn-danger {
      background: linear-gradient(135deg, var(--wa-accent-magenta) 0%, #c62828 100%);
      border: 1px solid var(--wa-accent-magenta);
      color: var(--wa-text-glow);
    }

    .wa-btn-danger:hover {
      box-shadow: 0 0 20px rgba(255,0,110,0.5);
    }

    /* ============ 输入框 ============ */
    .wa-input {
      background: var(--wa-bg-layer2);
      border: 1px solid var(--wa-border-subtle);
      border-radius: 6px;
      padding: 8px 12px;
      color: var(--wa-text-primary);
      font-size: 14px;
      transition: all var(--wa-duration-fast) var(--wa-ease-out);
      width: 100%;
    }

    .wa-input:focus {
      outline: none;
      border-color: var(--wa-accent-cyan);
      box-shadow: 0 0 12px var(--wa-accent-cyan-glow);
    }

    /* ============ 工具类 ============ */
    .wa-dim {
      color: var(--wa-text-tertiary);
      font-size: 12px;
    }

    .wa-sep {
      height: 1px;
      background: var(--wa-border-subtle);
      margin: 16px 0;
    }

    .wa-grid-2 {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }

    .wa-grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }

    /* ============ 响应式 ============ */
    @media (max-width: 768px) {
      .wa-tabs {
        padding: 8px 12px;
      }
      .wa-body {
        padding: 16px;
      }
      .wa-grid-2,
      .wa-grid-3 {
        grid-template-columns: 1fr;
      }
    }
  `;

  // 注入样式
  function injectTheme() {
    const existing = mainDoc.getElementById('wa-cyberpunk-theme');
    if (existing) return;
    
    const style = mainDoc.createElement('style');
    style.id = 'wa-cyberpunk-theme';
    style.textContent = CYBERPUNK_CSS;
    (mainDoc.head || mainDoc.documentElement).appendChild(style);
  }

  // 自动注入
  injectTheme();

  WA.cyberpunkTheme = {
    inject: injectTheme,
    version: '2.174.0'
  };
})();

/**
 * v2.174.1: 背景动效增强
 */
(function () {
  const mainDoc = WA.mainDoc || document;

  // 添加背景动效CSS
  const BG_EFFECTS = `
    /* 六角网格背景 */
    .wa-body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image: 
        linear-gradient(30deg, rgba(0,217,255,0.02) 12%, transparent 12.5%, transparent 87%, rgba(0,217,255,0.02) 87.5%, rgba(0,217,255,0.02)),
        linear-gradient(150deg, rgba(0,217,255,0.02) 12%, transparent 12.5%, transparent 87%, rgba(0,217,255,0.02) 87.5%, rgba(0,217,255,0.02)),
        linear-gradient(30deg, rgba(0,217,255,0.02) 12%, transparent 12.5%, transparent 87%, rgba(0,217,255,0.02) 87.5%, rgba(0,217,255,0.02)),
        linear-gradient(150deg, rgba(0,217,255,0.02) 12%, transparent 12.5%, transparent 87%, rgba(0,217,255,0.02) 87.5%, rgba(0,217,255,0.02));
      background-size: 80px 140px;
      background-position: 0 0, 0 0, 40px 70px, 40px 70px;
      pointer-events: none;
      z-index: 0;
      animation: wa-hex-drift 60s linear infinite;
    }

    @keyframes wa-hex-drift {
      from { background-position: 0 0, 0 0, 40px 70px, 40px 70px; }
      to { background-position: 80px 140px, 80px 140px, 120px 210px, 120px 210px; }
    }

    /* 扫描线效果 */
    .wa-body::after {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(
        to bottom,
        transparent 50%,
        rgba(0,217,255,0.03) 50%
      );
      background-size: 100% 4px;
      pointer-events: none;
      z-index: 1;
      animation: wa-scanline 8s linear infinite;
    }

    @keyframes wa-scanline {
      from { transform: translateY(0); }
      to { transform: translateY(100%); }
    }

    /* 确保内容在动效之上 */
    .wa-body > * {
      position: relative;
      z-index: 2;
    }

    /* 数据流粒子 */
    @keyframes wa-particle-float {
      0% { transform: translateY(100vh) translateX(0) scale(0); opacity: 0; }
      10% { opacity: 0.3; }
      90% { opacity: 0.3; }
      100% { transform: translateY(-20vh) translateX(20px) scale(1); opacity: 0; }
    }
  `;

  const style = mainDoc.createElement('style');
  style.textContent = BG_EFFECTS;
  (mainDoc.head || mainDoc.documentElement).appendChild(style);
})();

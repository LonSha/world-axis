/**
 * WorldAxis ui/cyberpunk-animations.js — 赛博朋克动效润色
 * v2.179.0: 页面过渡 + 加载状态 + 微交互动效
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const ANIMATIONS_CSS = `
    /* ============ 页面过渡 ============ */
    @keyframes wa-page-enter {
      from {
        opacity: 0;
        transform: translateX(20px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    @keyframes wa-page-exit {
      from {
        opacity: 1;
        transform: translateX(0);
      }
      to {
        opacity: 0;
        transform: translateX(-20px);
      }
    }

    .wa-page-enter {
      animation: wa-page-enter 300ms var(--wa-ease-out) forwards;
    }

    .wa-page-exit {
      animation: wa-page-exit 200ms var(--wa-ease-in) forwards;
    }

    /* ============ 淡入淡出 ============ */
    @keyframes wa-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes wa-fade-out {
      from { opacity: 1; }
      to { opacity: 0; }
    }

    .wa-fade-in {
      animation: wa-fade-in var(--wa-duration-normal) var(--wa-ease-out);
    }

    .wa-fade-out {
      animation: wa-fade-out var(--wa-duration-fast) var(--wa-ease-in);
    }

    /* ============ 缩放弹出 ============ */
    @keyframes wa-scale-in {
      from {
        opacity: 0;
        transform: scale(0.9);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    .wa-scale-in {
      animation: wa-scale-in var(--wa-duration-normal) var(--wa-ease-out);
    }

    /* ============ 骨架屏加载 ============ */
    .wa-skeleton {
      background: linear-gradient(
        90deg,
        var(--wa-bg-layer2) 25%,
        var(--wa-bg-layer3) 50%,
        var(--wa-bg-layer2) 75%
      );
      background-size: 200% 100%;
      animation: wa-skeleton-pulse 1.5s ease-in-out infinite;
      border-radius: 4px;
    }

    @keyframes wa-skeleton-pulse {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .wa-skeleton-text {
      height: 14px;
      margin: 8px 0;
    }

    .wa-skeleton-title {
      height: 20px;
      width: 60%;
      margin: 12px 0;
    }

    .wa-skeleton-avatar {
      width: 80px;
      height: 80px;
      border-radius: 50%;
    }

    /* ============ 加载中遮罩 ============ */
    .wa-loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(10,14,26,0.9);
      backdrop-filter: blur(8px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
      z-index: 999999;
      animation: wa-fade-in var(--wa-duration-normal);
    }

    .wa-loading-spinner-large {
      width: 60px;
      height: 60px;
      border: 4px solid var(--wa-bg-layer3);
      border-top-color: var(--wa-accent-cyan);
      border-radius: 50%;
      animation: wa-spin 0.8s linear infinite;
      filter: drop-shadow(0 0 16px var(--wa-accent-cyan-glow));
    }

    .wa-loading-text {
      color: var(--wa-accent-cyan);
      font-size: 14px;
      font-weight: 500;
      text-shadow: 0 0 12px var(--wa-accent-cyan-glow);
    }

    /* ============ 通知消息 ============ */
    .wa-notification {
      position: fixed;
      top: 80px;
      right: 24px;
      min-width: 300px;
      max-width: 400px;
      background: var(--wa-glass-dark);
      backdrop-filter: blur(12px);
      border: 1px solid var(--wa-border-subtle);
      border-radius: 12px;
      padding: 16px 20px;
      box-shadow: var(--wa-shadow-lg), 0 0 24px var(--wa-accent-cyan-glow);
      z-index: 999990;
      animation: wa-notification-slide-in 300ms var(--wa-ease-out);
    }

    @keyframes wa-notification-slide-in {
      from {
        opacity: 0;
        transform: translateX(100%);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    .wa-notification-close {
      animation: wa-notification-slide-out 200ms var(--wa-ease-in) forwards;
    }

    @keyframes wa-notification-slide-out {
      from {
        opacity: 1;
        transform: translateX(0);
      }
      to {
        opacity: 0;
        transform: translateX(100%);
      }
    }

    .wa-notification-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }

    .wa-notification-icon {
      font-size: 20px;
    }

    .wa-notification-title {
      flex: 1;
      font-weight: 600;
      color: var(--wa-accent-cyan);
    }

    .wa-notification-close-btn {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: var(--wa-text-tertiary);
      cursor: pointer;
      border-radius: 4px;
      transition: all var(--wa-duration-fast);
    }

    .wa-notification-close-btn:hover {
      background: rgba(255,0,110,0.2);
      color: var(--wa-accent-magenta);
    }

    .wa-notification-body {
      color: var(--wa-text-secondary);
      font-size: 13px;
      line-height: 1.5;
    }

    .wa-notification-info {
      border-left: 3px solid var(--wa-accent-cyan);
    }

    .wa-notification-success {
      border-left: 3px solid var(--wa-accent-emerald);
    }

    .wa-notification-warning {
      border-left: 3px solid var(--wa-accent-amber);
    }

    .wa-notification-error {
      border-left: 3px solid var(--wa-accent-magenta);
    }

    /* ============ 涟漪效果 ============ */
    .wa-ripple {
      position: relative;
      overflow: hidden;
    }

    .wa-ripple::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 0;
      height: 0;
      border-radius: 50%;
      background: rgba(0,217,255,0.3);
      transform: translate(-50%, -50%);
      pointer-events: none;
    }

    .wa-ripple:active::after {
      animation: wa-ripple-effect 0.6s ease-out;
    }

    @keyframes wa-ripple-effect {
      to {
        width: 200%;
        height: 200%;
        opacity: 0;
      }
    }

    /* ============ 数字滚动 ============ */
    @keyframes wa-number-count-up {
      from {
        transform: translateY(20px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    .wa-number-animate {
      animation: wa-number-count-up 0.5s var(--wa-ease-out);
    }

    /* ============ 故障效果 ============ */
    @keyframes wa-glitch {
      0%, 100% {
        transform: translate(0);
        opacity: 1;
      }
      20% {
        transform: translate(-2px, 2px);
        opacity: 0.8;
      }
      40% {
        transform: translate(2px, -2px);
        opacity: 0.9;
      }
      60% {
        transform: translate(-1px, -1px);
        opacity: 0.85;
      }
      80% {
        transform: translate(1px, 1px);
        opacity: 0.95;
      }
    }

    .wa-glitch-effect {
      animation: wa-glitch 0.3s ease-in-out;
    }

    /* ============ 弹性按钮 ============ */
    @keyframes wa-bounce {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }

    .wa-bounce {
      animation: wa-bounce 0.3s ease-in-out;
    }

    /* ============ 抖动 ============ */
    @keyframes wa-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-4px); }
      75% { transform: translateX(4px); }
    }

    .wa-shake {
      animation: wa-shake 0.3s ease-in-out;
    }

    /* ============ 工具类 ============ */
    .wa-transition-all {
      transition: all var(--wa-duration-normal) var(--wa-ease-out);
    }

    .wa-transition-fast {
      transition: all var(--wa-duration-fast) var(--wa-ease-out);
    }

    .wa-transition-slow {
      transition: all var(--wa-duration-slow) var(--wa-ease-out);
    }

    /* ============ 延迟动画 ============ */
    .wa-delay-100 { animation-delay: 100ms; }
    .wa-delay-200 { animation-delay: 200ms; }
    .wa-delay-300 { animation-delay: 300ms; }
    .wa-delay-400 { animation-delay: 400ms; }
    .wa-delay-500 { animation-delay: 500ms; }
  `;

  // v2.181.0：样式登记进主题注册表，不再自动注入（可切换主题的地基）
  if (WA.themeStyles && WA.themeStyles.register) WA.themeStyles.register('wa-cyberpunk-animations', ANIMATIONS_CSS);

  // 动效工具集
  WA.cyberAnimate = {
    version: '2.179.0',

    // 显示加载遮罩
    showLoading: function(text) {
      const overlay = document.createElement('div');
      overlay.className = 'wa-loading-overlay';
      overlay.id = 'wa-loading';
      overlay.innerHTML = `
        <div class="wa-loading-spinner-large"></div>
        <div class="wa-loading-text">${text || '加载中...'}</div>
      `;
      document.body.appendChild(overlay);
    },

    // 隐藏加载遮罩
    hideLoading: function() {
      const overlay = document.getElementById('wa-loading');
      if (overlay) {
        overlay.classList.add('wa-fade-out');
        setTimeout(() => overlay.remove(), 200);
      }
    },

    // 显示通知
    notify: function(options) {
      const { type, title, message, duration } = options;
      const id = 'wa-notif-' + WA.clock.now();
      const icons = {
        info: 'ℹ️',
        success: '✓',
        warning: '⚠️',
        error: '✕'
      };
      
      const notif = document.createElement('div');
      notif.className = `wa-notification wa-notification-${type || 'info'}`;
      notif.id = id;
      notif.innerHTML = `
        <div class="wa-notification-header">
          <span class="wa-notification-icon">${icons[type] || icons.info}</span>
          <span class="wa-notification-title">${title || '通知'}</span>
          <button class="wa-notification-close-btn">✕</button>
        </div>
        <div class="wa-notification-body">${message}</div>
      `;
      
      document.body.appendChild(notif);
      
      const closeBtn = notif.querySelector('.wa-notification-close-btn');
      const close = () => {
        notif.classList.add('wa-notification-close');
        setTimeout(() => notif.remove(), 200);
      };
      
      closeBtn.onclick = close;
      
      if (duration !== 0) {
        setTimeout(close, duration || 3000);
      }
    },

    // 添加涟漪效果
    addRipple: function(element) {
      if (!element.classList.contains('wa-ripple')) {
        element.classList.add('wa-ripple');
      }
    },

    // 数字动画
    animateNumber: function(element, target, duration) {
      const start = parseInt(element.textContent) || 0;
      const increment = (target - start) / (duration / 16);
      let current = start;
      
      const timer = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= target) || (increment < 0 && current <= target)) {
          element.textContent = target;
          clearInterval(timer);
        } else {
          element.textContent = Math.round(current);
        }
      }, 16);
    }
  };
})();

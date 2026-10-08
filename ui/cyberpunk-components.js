/**
 * WorldAxis ui/cyberpunk-components.js — 赛博朋克组件库
 * v2.175.0: Toggle开关 + 进度条 + 数据表格 + 状态指示灯 + 徽章
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainDoc = WA.mainDoc || document;

  const COMPONENTS_CSS = `
    /* ============ Toggle 开关 ============ */
    .wa-toggle {
      position: relative;
      display: inline-block;
      width: 48px;
      height: 24px;
      cursor: pointer;
    }

    .wa-toggle input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .wa-toggle-slider {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--wa-bg-layer3);
      border: 1px solid var(--wa-border-subtle);
      border-radius: 24px;
      transition: all var(--wa-duration-normal) var(--wa-ease-out);
    }

    .wa-toggle-slider::before {
      content: '';
      position: absolute;
      height: 16px;
      width: 16px;
      left: 3px;
      bottom: 3px;
      background: var(--wa-text-tertiary);
      border-radius: 50%;
      transition: all var(--wa-duration-normal) var(--wa-ease-out);
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }

    .wa-toggle input:checked + .wa-toggle-slider {
      background: linear-gradient(135deg, var(--wa-accent-cyan), var(--wa-accent-violet));
      border-color: var(--wa-accent-cyan);
      box-shadow: 0 0 12px var(--wa-accent-cyan-glow);
    }

    .wa-toggle input:checked + .wa-toggle-slider::before {
      transform: translateX(24px);
      background: var(--wa-text-glow);
      box-shadow: 0 0 8px var(--wa-accent-cyan-glow);
    }

    .wa-toggle:hover .wa-toggle-slider {
      border-color: var(--wa-border-normal);
    }

    /* ============ 进度条 ============ */
    .wa-progress {
      width: 100%;
      height: 8px;
      background: var(--wa-bg-layer2);
      border: 1px solid var(--wa-border-subtle);
      border-radius: 8px;
      overflow: hidden;
      position: relative;
    }

    .wa-progress-bar {
      height: 100%;
      background: linear-gradient(90deg, var(--wa-accent-cyan), var(--wa-accent-violet));
      border-radius: 8px;
      transition: width var(--wa-duration-normal) var(--wa-ease-out);
      position: relative;
      box-shadow: 0 0 12px var(--wa-accent-cyan-glow);
    }

    .wa-progress-bar::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
      animation: wa-progress-shine 2s ease-in-out infinite;
    }

    @keyframes wa-progress-shine {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }

    .wa-progress-circular {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: conic-gradient(
        var(--wa-accent-cyan) 0deg,
        var(--wa-accent-violet) 180deg,
        var(--wa-bg-layer2) 180deg
      );
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .wa-progress-circular::before {
      content: '';
      position: absolute;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: var(--wa-bg-layer1);
    }

    .wa-progress-circular-text {
      position: relative;
      z-index: 1;
      font-size: 14px;
      font-weight: 600;
      color: var(--wa-accent-cyan);
    }

    /* ============ 状态指示灯 ============ */
    .wa-status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
    }

    .wa-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      animation: wa-status-pulse 2s ease-in-out infinite;
    }

    @keyframes wa-status-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(0.9); }
    }

    .wa-status-idle {
      background: rgba(100,116,139,0.15);
      border: 1px solid rgba(100,116,139,0.3);
      color: var(--wa-text-tertiary);
    }

    .wa-status-idle .wa-status-dot {
      background: #64748b;
      box-shadow: 0 0 8px rgba(100,116,139,0.5);
    }

    .wa-status-active {
      background: rgba(0,217,255,0.15);
      border: 1px solid rgba(0,217,255,0.3);
      color: var(--wa-accent-cyan);
    }

    .wa-status-active .wa-status-dot {
      background: var(--wa-accent-cyan);
      box-shadow: 0 0 12px var(--wa-accent-cyan-glow);
    }

    .wa-status-busy {
      background: rgba(251,191,36,0.15);
      border: 1px solid rgba(251,191,36,0.3);
      color: var(--wa-accent-amber);
    }

    .wa-status-busy .wa-status-dot {
      background: var(--wa-accent-amber);
      box-shadow: 0 0 12px rgba(251,191,36,0.5);
      animation: wa-status-pulse 0.8s ease-in-out infinite;
    }

    .wa-status-error {
      background: rgba(255,0,110,0.15);
      border: 1px solid rgba(255,0,110,0.3);
      color: var(--wa-accent-magenta);
    }

    .wa-status-error .wa-status-dot {
      background: var(--wa-accent-magenta);
      box-shadow: 0 0 12px rgba(255,0,110,0.5);
      animation: wa-status-pulse 0.5s ease-in-out infinite;
    }

    .wa-status-success {
      background: rgba(16,185,129,0.15);
      border: 1px solid rgba(16,185,129,0.3);
      color: var(--wa-accent-emerald);
    }

    .wa-status-success .wa-status-dot {
      background: var(--wa-accent-emerald);
      box-shadow: 0 0 12px rgba(16,185,129,0.5);
    }

    /* ============ 徽章 ============ */
    .wa-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .wa-badge-primary {
      background: linear-gradient(135deg, var(--wa-accent-cyan), var(--wa-accent-violet));
      color: var(--wa-text-glow);
      box-shadow: 0 0 8px var(--wa-accent-cyan-glow);
    }

    .wa-badge-secondary {
      background: var(--wa-bg-layer3);
      border: 1px solid var(--wa-border-normal);
      color: var(--wa-text-secondary);
    }

    .wa-badge-success {
      background: rgba(16,185,129,0.2);
      border: 1px solid var(--wa-accent-emerald);
      color: var(--wa-accent-emerald);
    }

    .wa-badge-warning {
      background: rgba(251,191,36,0.2);
      border: 1px solid var(--wa-accent-amber);
      color: var(--wa-accent-amber);
    }

    .wa-badge-danger {
      background: rgba(255,0,110,0.2);
      border: 1px solid var(--wa-accent-magenta);
      color: var(--wa-accent-magenta);
    }

    /* ============ 数据表格 ============ */
    .wa-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 13px;
    }

    .wa-table thead tr {
      background: var(--wa-glass-dark);
      border-bottom: 2px solid var(--wa-border-normal);
    }

    .wa-table th {
      padding: 12px 16px;
      text-align: left;
      font-weight: 600;
      color: var(--wa-accent-cyan);
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.5px;
      position: sticky;
      top: 0;
      background: var(--wa-glass-dark);
      backdrop-filter: blur(12px);
      z-index: 10;
    }

    .wa-table tbody tr {
      border-bottom: 1px solid var(--wa-border-subtle);
      transition: all var(--wa-duration-fast) var(--wa-ease-out);
    }

    .wa-table tbody tr:nth-child(even) {
      background: rgba(255,255,255,0.01);
    }

    .wa-table tbody tr:hover {
      background: rgba(0,217,255,0.05);
      border-color: var(--wa-border-normal);
    }

    .wa-table td {
      padding: 12px 16px;
      color: var(--wa-text-primary);
    }

    .wa-table td.wa-table-number {
      font-family: 'SF Mono', 'Fira Code', 'Courier New', monospace;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }

    /* ============ 分隔线 ============ */
    .wa-divider {
      height: 1px;
      background: linear-gradient(
        90deg,
        transparent,
        var(--wa-border-normal) 20%,
        var(--wa-border-normal) 80%,
        transparent
      );
      margin: 20px 0;
      position: relative;
    }

    .wa-divider-glow {
      box-shadow: 0 0 8px var(--wa-accent-cyan-glow);
    }

    /* ============ 标签组 ============ */
    .wa-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .wa-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      background: var(--wa-bg-layer2);
      border: 1px solid var(--wa-border-subtle);
      border-radius: 6px;
      font-size: 12px;
      color: var(--wa-text-secondary);
      transition: all var(--wa-duration-fast) var(--wa-ease-out);
      cursor: pointer;
    }

    .wa-tag:hover {
      border-color: var(--wa-accent-cyan);
      color: var(--wa-accent-cyan);
      box-shadow: 0 0 8px var(--wa-accent-cyan-glow);
    }

    /* ============ 复选框 ============ */
    .wa-checkbox {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      user-select: none;
    }

    .wa-checkbox input {
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
    }

    .wa-checkbox-box {
      width: 18px;
      height: 18px;
      border: 2px solid var(--wa-border-normal);
      border-radius: 4px;
      background: var(--wa-bg-layer2);
      transition: all var(--wa-duration-fast) var(--wa-ease-out);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .wa-checkbox input:checked + .wa-checkbox-box {
      background: linear-gradient(135deg, var(--wa-accent-cyan), var(--wa-accent-violet));
      border-color: var(--wa-accent-cyan);
      box-shadow: 0 0 8px var(--wa-accent-cyan-glow);
    }

    .wa-checkbox input:checked + .wa-checkbox-box::after {
      content: '✓';
      color: var(--wa-text-glow);
      font-size: 12px;
      font-weight: 700;
    }

    .wa-checkbox:hover .wa-checkbox-box {
      border-color: var(--wa-accent-cyan);
    }

    .wa-checkbox-label {
      font-size: 14px;
      color: var(--wa-text-primary);
    }

    /* ============ 加载动画 ============ */
    .wa-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--wa-bg-layer3);
      border-top-color: var(--wa-accent-cyan);
      border-radius: 50%;
      animation: wa-spin 0.8s linear infinite;
    }

    @keyframes wa-spin {
      to { transform: rotate(360deg); }
    }

    .wa-spinner-glow {
      filter: drop-shadow(0 0 8px var(--wa-accent-cyan-glow));
    }
  `;

  // 注入样式
  const style = mainDoc.createElement('style');
  style.id = 'wa-cyberpunk-components';
  style.textContent = COMPONENTS_CSS;
  (mainDoc.head || mainDoc.documentElement).appendChild(style);

  // 组件构建器
  WA.cyberUI = {
    version: '2.175.0',
    
    // Toggle 开关
    toggle: function(id, checked, label) {
      return `
        <label class="wa-toggle">
          <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
          <span class="wa-toggle-slider"></span>
        </label>
        ${label ? `<span style="margin-left: 8px; color: var(--wa-text-primary);">${label}</span>` : ''}
      `;
    },

    // 进度条
    progress: function(value, max) {
      const percent = Math.min(100, Math.max(0, (value / (max || 100)) * 100));
      return `
        <div class="wa-progress">
          <div class="wa-progress-bar" style="width: ${percent}%"></div>
        </div>
      `;
    },

    // 圆形进度
    progressCircular: function(percent) {
      return `
        <div class="wa-progress-circular" style="background: conic-gradient(
          var(--wa-accent-cyan) ${percent * 3.6}deg,
          var(--wa-bg-layer2) ${percent * 3.6}deg
        );">
          <span class="wa-progress-circular-text">${Math.round(percent)}%</span>
        </div>
      `;
    },

    // 状态指示灯
    status: function(type, text) {
      return `
        <div class="wa-status wa-status-${type}">
          <span class="wa-status-dot"></span>
          <span>${text}</span>
        </div>
      `;
    },

    // 徽章
    badge: function(text, type) {
      return `<span class="wa-badge wa-badge-${type || 'secondary'}">${text}</span>`;
    },

    // 复选框
    checkbox: function(id, label, checked) {
      return `
        <label class="wa-checkbox">
          <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
          <span class="wa-checkbox-box"></span>
          <span class="wa-checkbox-label">${label}</span>
        </label>
      `;
    },

    // 加载器
    spinner: function(glow) {
      return `<div class="wa-spinner ${glow ? 'wa-spinner-glow' : ''}"></div>`;
    }
  };
})();

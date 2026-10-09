/**
 * WorldAxis ui/cyberpunk-dashboard.js — 赛博朋克概览页
 * v2.176.0: Dashboard 重构（世界状态 + 系统监控 + 快捷操作）
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const DASHBOARD_CSS = `
    /* ============ Dashboard 布局 ============ */
    .wa-dashboard {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
      padding: 0;
    }

    .wa-dashboard-large {
      grid-column: span 2;
    }

    @media (max-width: 768px) {
      .wa-dashboard-large {
        grid-column: span 1;
      }
    }

    /* ============ 数据卡片增强 ============ */
    .wa-stat-card {
      background: var(--wa-glass-dark);
      backdrop-filter: blur(12px) saturate(180%);
      border: 1px solid var(--wa-border-subtle);
      border-radius: 12px;
      padding: 20px;
      transition: all var(--wa-duration-normal) var(--wa-ease-out);
      position: relative;
      overflow: hidden;
    }

    .wa-stat-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 3px;
      background: linear-gradient(90deg, var(--wa-accent-cyan), var(--wa-accent-violet));
      opacity: 0;
      transition: opacity var(--wa-duration-fast);
    }

    .wa-stat-card:hover {
      transform: translateY(-4px);
      box-shadow: var(--wa-shadow-lg), 0 0 24px var(--wa-accent-cyan-glow);
      border-color: var(--wa-border-normal);
    }

    .wa-stat-card:hover::before {
      opacity: 1;
    }

    .wa-stat-label {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--wa-text-secondary);
      margin-bottom: 8px;
    }

    .wa-stat-value {
      font-size: 32px;
      font-weight: 700;
      color: var(--wa-accent-cyan);
      font-variant-numeric: tabular-nums;
      text-shadow: 0 0 16px var(--wa-accent-cyan-glow);
      line-height: 1;
      margin-bottom: 8px;
    }

    .wa-stat-desc {
      font-size: 13px;
      color: var(--wa-text-tertiary);
    }

    /* ============ 时间显示 ============ */
    .wa-time-display {
      text-align: center;
      padding: 32px 20px;
    }

    .wa-time-main {
      font-size: 48px;
      font-weight: 700;
      color: var(--wa-accent-cyan);
      text-shadow: 0 0 24px var(--wa-accent-cyan-glow);
      font-variant-numeric: tabular-nums;
      letter-spacing: 2px;
      margin-bottom: 12px;
    }

    .wa-time-sub {
      font-size: 16px;
      color: var(--wa-text-secondary);
      font-weight: 500;
    }

    /* ============ 引擎列表 ============ */
    .wa-engine-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 300px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: var(--wa-accent-cyan) var(--wa-bg-layer2);
    }

    .wa-engine-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      background: var(--wa-bg-layer2);
      border: 1px solid var(--wa-border-subtle);
      border-radius: 8px;
      transition: all var(--wa-duration-fast) var(--wa-ease-out);
    }

    .wa-engine-item:hover {
      background: var(--wa-bg-layer3);
      border-color: var(--wa-border-normal);
      transform: translateX(4px);
    }

    .wa-engine-name {
      font-size: 13px;
      color: var(--wa-text-primary);
      font-weight: 500;
    }

    /* ============ 快捷按钮组 ============ */
    .wa-quick-actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
    }

    .wa-quick-btn {
      padding: 16px;
      background: var(--wa-bg-layer2);
      border: 1px solid var(--wa-border-subtle);
      border-radius: 10px;
      color: var(--wa-text-primary);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--wa-duration-fast) var(--wa-ease-out);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      text-align: center;
    }

    .wa-quick-btn-icon {
      font-size: 24px;
    }

    .wa-quick-btn:hover {
      background: linear-gradient(135deg, var(--wa-accent-cyan), var(--wa-accent-violet));
      border-color: var(--wa-accent-cyan);
      color: var(--wa-text-glow);
      box-shadow: 0 0 16px var(--wa-accent-cyan-glow);
      transform: translateY(-2px);
    }

    /* ============ 内存图表 ============ */
    .wa-memory-chart {
      display: flex;
      align-items: flex-end;
      gap: 4px;
      height: 80px;
      padding: 12px 0;
    }

    .wa-memory-bar {
      flex: 1;
      background: linear-gradient(to top, var(--wa-accent-cyan), var(--wa-accent-violet));
      border-radius: 3px 3px 0 0;
      min-height: 10px;
      transition: height var(--wa-duration-normal) var(--wa-ease-out);
      box-shadow: 0 0 8px var(--wa-accent-cyan-glow);
    }

    /* ============ 事件时间轴 ============ */
    .wa-timeline {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 240px;
      overflow-y: auto;
      scrollbar-width: thin;
    }

    .wa-timeline-item {
      display: flex;
      gap: 12px;
      padding: 12px;
      background: var(--wa-bg-layer2);
      border-left: 3px solid var(--wa-accent-cyan);
      border-radius: 6px;
      transition: all var(--wa-duration-fast) var(--wa-ease-out);
    }

    .wa-timeline-item:hover {
      background: var(--wa-bg-layer3);
      box-shadow: 0 0 12px var(--wa-accent-cyan-glow);
      transform: translateX(4px);
    }

    .wa-timeline-time {
      font-size: 11px;
      color: var(--wa-text-tertiary);
      font-weight: 600;
      min-width: 60px;
    }

    .wa-timeline-content {
      flex: 1;
      font-size: 13px;
      color: var(--wa-text-primary);
      line-height: 1.4;
    }
  `;

  // v2.181.0：样式登记进主题注册表，不再自动注入（可切换主题的地基）
  if (WA.themeStyles && WA.themeStyles.register) WA.themeStyles.register('wa-cyberpunk-dashboard', DASHBOARD_CSS);

  // Dashboard 构建器
  WA.cyberDashboard = {
    version: '2.176.0',

    // 数据卡片
    statCard: function(label, value, desc, large) {
      return `
        <div class="wa-stat-card ${large ? 'wa-dashboard-large' : ''}">
          <div class="wa-stat-label">${label}</div>
          <div class="wa-stat-value">${value}</div>
          ${desc ? `<div class="wa-stat-desc">${desc}</div>` : ''}
        </div>
      `;
    },

    // 时间显示卡片
    timeCard: function(time, subtitle) {
      return `
        <div class="wa-card wa-time-display">
          <div class="wa-time-main">${time}</div>
          <div class="wa-time-sub">${subtitle || '世界时间'}</div>
        </div>
      `;
    },

    // 引擎状态列表
    engineList: function(engines) {
      const items = engines.map(e => `
        <div class="wa-engine-item">
          <span class="wa-engine-name">${e.name}</span>
          ${WA.cyberUI.status(e.status, e.statusText)}
        </div>
      `).join('');
      return `<div class="wa-engine-list">${items}</div>`;
    },

    // 快捷操作按钮组
    quickActions: function(actions) {
      const buttons = actions.map(a => `
        <button class="wa-quick-btn" data-action="${a.id}">
          <span class="wa-quick-btn-icon">${a.icon}</span>
          <span>${a.label}</span>
        </button>
      `).join('');
      return `<div class="wa-quick-actions">${buttons}</div>`;
    },

    // 内存图表
    memoryChart: function(bars) {
      const barElements = bars.map(h => `
        <div class="wa-memory-bar" style="height: ${h}%"></div>
      `).join('');
      return `<div class="wa-memory-chart">${barElements}</div>`;
    },

    // 事件时间轴
    timeline: function(events) {
      const items = events.map(e => `
        <div class="wa-timeline-item">
          <div class="wa-timeline-time">${e.time}</div>
          <div class="wa-timeline-content">${e.content}</div>
        </div>
      `).join('');
      return `<div class="wa-timeline">${items}</div>`;
    }
  };
})();

/**
 * WorldAxis ui/cyberpunk-logs.js — 赛博朋克日志页
 * v2.178.0: 终端风格日志 + 级别着色 + 实时滚动
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LOGS_CSS = `
    /* ============ 日志容器（终端风格）============ */
    .wa-logs-container {
      background: #0d1117;
      border: 1px solid var(--wa-border-subtle);
      border-radius: 8px;
      padding: 16px;
      font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.6;
      max-height: 600px;
      overflow-y: auto;
      position: relative;
      scrollbar-width: thin;
      scrollbar-color: var(--wa-accent-cyan) #0d1117;
    }

    .wa-logs-container::before {
      content: '';
      position: sticky;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--wa-accent-cyan), transparent);
      display: block;
      margin-bottom: 12px;
    }

    /* ============ 日志行 ============ */
    .wa-log-line {
      display: flex;
      gap: 12px;
      padding: 4px 8px;
      margin: 2px 0;
      border-radius: 4px;
      transition: background var(--wa-duration-fast);
      font-variant-numeric: tabular-nums;
    }

    .wa-log-line:hover {
      background: rgba(0,217,255,0.05);
    }

    .wa-log-time {
      color: var(--wa-text-tertiary);
      font-size: 11px;
      min-width: 80px;
      flex-shrink: 0;
      opacity: 0.7;
    }

    .wa-log-level {
      font-weight: 700;
      text-transform: uppercase;
      font-size: 11px;
      min-width: 50px;
      flex-shrink: 0;
      letter-spacing: 0.5px;
    }

    .wa-log-message {
      flex: 1;
      color: var(--wa-text-primary);
      word-break: break-word;
    }

    /* ============ 级别着色 ============ */
    .wa-log-error {
      border-left: 2px solid var(--wa-accent-magenta);
    }

    .wa-log-error .wa-log-level {
      color: var(--wa-accent-magenta);
      text-shadow: 0 0 8px rgba(255,0,110,0.5);
    }

    .wa-log-error .wa-log-message {
      color: #ffb3d9;
    }

    .wa-log-warn {
      border-left: 2px solid var(--wa-accent-amber);
    }

    .wa-log-warn .wa-log-level {
      color: var(--wa-accent-amber);
      text-shadow: 0 0 8px rgba(251,191,36,0.5);
    }

    .wa-log-warn .wa-log-message {
      color: #ffd97d;
    }

    .wa-log-info {
      border-left: 2px solid var(--wa-accent-cyan);
    }

    .wa-log-info .wa-log-level {
      color: var(--wa-accent-cyan);
      text-shadow: 0 0 8px var(--wa-accent-cyan-glow);
    }

    .wa-log-debug {
      border-left: 2px solid #64748b;
    }

    .wa-log-debug .wa-log-level {
      color: #94a3b8;
    }

    .wa-log-debug .wa-log-message {
      color: var(--wa-text-secondary);
      opacity: 0.8;
    }

    .wa-log-success {
      border-left: 2px solid var(--wa-accent-emerald);
    }

    .wa-log-success .wa-log-level {
      color: var(--wa-accent-emerald);
      text-shadow: 0 0 8px rgba(16,185,129,0.5);
    }

    .wa-log-success .wa-log-message {
      color: #6ee7b7;
    }

    /* ============ 日志过滤器 ============ */
    .wa-log-filters {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .wa-log-filter-btn {
      padding: 6px 12px;
      background: var(--wa-bg-layer2);
      border: 1px solid var(--wa-border-subtle);
      border-radius: 6px;
      color: var(--wa-text-secondary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--wa-duration-fast) var(--wa-ease-out);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .wa-log-filter-btn:hover {
      border-color: var(--wa-accent-cyan);
      color: var(--wa-accent-cyan);
    }

    .wa-log-filter-btn.active {
      background: var(--wa-accent-cyan);
      border-color: var(--wa-accent-cyan);
      color: var(--wa-text-glow);
      box-shadow: 0 0 12px var(--wa-accent-cyan-glow);
    }

    .wa-log-filter-count {
      background: rgba(0,0,0,0.3);
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
    }

    /* ============ 日志搜索 ============ */
    .wa-log-search {
      margin-bottom: 16px;
      position: relative;
    }

    .wa-log-search-input {
      width: 100%;
      padding: 10px 40px 10px 16px;
      background: var(--wa-bg-layer2);
      border: 1px solid var(--wa-border-subtle);
      border-radius: 8px;
      color: var(--wa-text-primary);
      font-size: 13px;
      font-family: 'SF Mono', monospace;
      transition: all var(--wa-duration-fast) var(--wa-ease-out);
    }

    .wa-log-search-input:focus {
      outline: none;
      border-color: var(--wa-accent-cyan);
      box-shadow: 0 0 12px var(--wa-accent-cyan-glow);
    }

    .wa-log-search-icon {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--wa-text-tertiary);
      font-size: 16px;
      pointer-events: none;
    }

    /* ============ 日志统计 ============ */
    .wa-log-stats {
      display: flex;
      gap: 16px;
      padding: 12px 16px;
      background: var(--wa-glass-dark);
      border: 1px solid var(--wa-border-subtle);
      border-radius: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .wa-log-stat-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .wa-log-stat-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .wa-log-stat-label {
      font-size: 12px;
      color: var(--wa-text-secondary);
    }

    .wa-log-stat-value {
      font-weight: 700;
      font-size: 14px;
      color: var(--wa-text-primary);
      font-variant-numeric: tabular-nums;
    }

    /* ============ 实时指示器 ============ */
    .wa-log-live-indicator {
      position: sticky;
      top: 0;
      right: 0;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: rgba(0,217,255,0.1);
      border: 1px solid var(--wa-accent-cyan);
      border-radius: 12px;
      font-size: 11px;
      color: var(--wa-accent-cyan);
      font-weight: 600;
      margin-bottom: 8px;
      float: right;
    }

    .wa-log-live-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--wa-accent-cyan);
      box-shadow: 0 0 8px var(--wa-accent-cyan-glow);
      animation: wa-log-pulse 1.5s ease-in-out infinite;
    }

    @keyframes wa-log-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.8); }
    }

    /* ============ 日志清空确认 ============ */
    .wa-log-clear-btn {
      padding: 6px 12px;
      background: transparent;
      border: 1px solid rgba(255,0,110,0.3);
      border-radius: 6px;
      color: var(--wa-accent-magenta);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--wa-duration-fast) var(--wa-ease-out);
    }

    .wa-log-clear-btn:hover {
      background: var(--wa-accent-magenta);
      border-color: var(--wa-accent-magenta);
      color: var(--wa-text-glow);
      box-shadow: 0 0 12px rgba(255,0,110,0.5);
    }

    /* ============ 代码块高亮 ============ */
    .wa-log-code {
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(0,217,255,0.2);
      border-radius: 4px;
      padding: 2px 6px;
      color: var(--wa-accent-cyan);
      font-family: inherit;
    }

    /* ============ 滚动条样式 ============ */
    .wa-logs-container::-webkit-scrollbar {
      width: 8px;
    }

    .wa-logs-container::-webkit-scrollbar-track {
      background: #0d1117;
    }

    .wa-logs-container::-webkit-scrollbar-thumb {
      background: var(--wa-accent-cyan);
      border-radius: 4px;
    }

    .wa-logs-container::-webkit-scrollbar-thumb:hover {
      background: var(--wa-accent-violet);
    }
  `;

  // 注入样式
  const style = document.createElement('style');
  style.id = 'wa-cyberpunk-logs';
  style.textContent = LOGS_CSS;
  (document.head || document.documentElement).appendChild(style);

  // 日志系统构建器
  WA.cyberLogs = {
    version: '2.178.0',

    // 格式化时间
    formatTime: function(timestamp) {
      const d = new Date(timestamp);
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    },

    // 单条日志
    logLine: function(log) {
      return `
        <div class="wa-log-line wa-log-${log.level}">
          <span class="wa-log-time">${this.formatTime(log.timestamp)}</span>
          <span class="wa-log-level">${log.level}</span>
          <span class="wa-log-message">${this.escapeHtml(log.message)}</span>
        </div>
      `;
    },

    // 日志容器
    logsContainer: function(logs) {
      return `
        <div class="wa-logs-container" id="wa-logs-output">
          ${logs.map(l => this.logLine(l)).join('')}
        </div>
      `;
    },

    // 过滤按钮组
    filters: function(counts) {
      const levels = ['all', 'error', 'warn', 'info', 'debug', 'success'];
      const labels = { all: '全部', error: '错误', warn: '警告', info: '信息', debug: '调试', success: '成功' };
      return `
        <div class="wa-log-filters">
          ${levels.map(level => `
            <button class="wa-log-filter-btn ${level === 'all' ? 'active' : ''}" data-level="${level}">
              ${labels[level]}
              <span class="wa-log-filter-count">${counts[level] || 0}</span>
            </button>
          `).join('')}
        </div>
      `;
    },

    // 搜索框
    searchBox: function() {
      return `
        <div class="wa-log-search">
          <input type="text" class="wa-log-search-input" placeholder="搜索日志..." id="wa-log-search">
          <span class="wa-log-search-icon">🔍</span>
        </div>
      `;
    },

    // 统计面板
    stats: function(counts) {
      return `
        <div class="wa-log-stats">
          <div class="wa-log-stat-item">
            <span class="wa-log-stat-dot" style="background:var(--wa-accent-magenta);"></span>
            <span class="wa-log-stat-label">错误</span>
            <span class="wa-log-stat-value">${counts.error || 0}</span>
          </div>
          <div class="wa-log-stat-item">
            <span class="wa-log-stat-dot" style="background:var(--wa-accent-amber);"></span>
            <span class="wa-log-stat-label">警告</span>
            <span class="wa-log-stat-value">${counts.warn || 0}</span>
          </div>
          <div class="wa-log-stat-item">
            <span class="wa-log-stat-dot" style="background:var(--wa-accent-cyan);"></span>
            <span class="wa-log-stat-label">信息</span>
            <span class="wa-log-stat-value">${counts.info || 0}</span>
          </div>
          <div class="wa-log-stat-item">
            <span class="wa-log-stat-dot" style="background:#64748b;"></span>
            <span class="wa-log-stat-label">调试</span>
            <span class="wa-log-stat-value">${counts.debug || 0}</span>
          </div>
        </div>
      `;
    },

    // 实时指示器
    liveIndicator: function() {
      return `
        <div class="wa-log-live-indicator">
          <span class="wa-log-live-dot"></span>
          <span>实时</span>
        </div>
      `;
    },

    // HTML 转义
    escapeHtml: function(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  };
})();

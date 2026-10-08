/**
 * WorldAxis ui/cyberpunk-people.js — 赛博朋克人物页
 * v2.177.0: 人物卡片 + 关系网可视化 + 好感度系统
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const PEOPLE_CSS = `
    /* ============ 人物网格 ============ */
    .wa-people-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 20px;
    }

    /* ============ 人物卡片 ============ */
    .wa-person-card {
      background: var(--wa-glass-dark);
      backdrop-filter: blur(12px) saturate(180%);
      border: 1px solid var(--wa-border-subtle);
      border-radius: 12px;
      padding: 20px;
      transition: all var(--wa-duration-normal) var(--wa-ease-out);
      position: relative;
      overflow: hidden;
      cursor: pointer;
    }

    .wa-person-card::before {
      content: '';
      position: absolute;
      top: -2px;
      left: -2px;
      right: -2px;
      bottom: -2px;
      background: linear-gradient(135deg, var(--wa-accent-cyan), var(--wa-accent-violet));
      border-radius: 12px;
      opacity: 0;
      transition: opacity var(--wa-duration-fast);
      z-index: -1;
    }

    .wa-person-card:hover {
      transform: translateY(-4px);
      box-shadow: var(--wa-shadow-lg), 0 0 24px var(--wa-accent-cyan-glow);
    }

    .wa-person-card:hover::before {
      opacity: 0.15;
    }

    /* ============ 头像系统 ============ */
    .wa-avatar-wrapper {
      display: flex;
      justify-content: center;
      margin-bottom: 16px;
      position: relative;
    }

    .wa-avatar {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      border: 3px solid transparent;
      background: linear-gradient(var(--wa-bg-layer1), var(--wa-bg-layer1)) padding-box,
                  linear-gradient(135deg, var(--wa-accent-cyan), var(--wa-accent-violet)) border-box;
      padding: 3px;
      position: relative;
      transition: all var(--wa-duration-normal) var(--wa-ease-out);
    }

    .wa-avatar img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }

    .wa-avatar-placeholder {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--wa-bg-layer2), var(--wa-bg-layer3));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      color: var(--wa-accent-cyan);
      font-weight: 700;
    }

    .wa-person-card:hover .wa-avatar {
      transform: scale(1.05);
      box-shadow: 0 0 20px var(--wa-accent-cyan-glow);
    }

    /* 关系着色 */
    .wa-avatar-friend {
      background: linear-gradient(var(--wa-bg-layer1), var(--wa-bg-layer1)) padding-box,
                  linear-gradient(135deg, var(--wa-accent-emerald), var(--wa-accent-cyan)) border-box;
    }

    .wa-avatar-neutral {
      background: linear-gradient(var(--wa-bg-layer1), var(--wa-bg-layer1)) padding-box,
                  linear-gradient(135deg, #64748b, #94a3b8) border-box;
    }

    .wa-avatar-hostile {
      background: linear-gradient(var(--wa-bg-layer1), var(--wa-bg-layer1)) padding-box,
                  linear-gradient(135deg, var(--wa-accent-magenta), #c62828) border-box;
    }

    /* ============ 人物信息 ============ */
    .wa-person-name {
      font-size: 18px;
      font-weight: 600;
      color: var(--wa-accent-cyan);
      text-align: center;
      margin-bottom: 8px;
      text-shadow: 0 0 8px var(--wa-accent-cyan-glow);
    }

    .wa-person-title {
      font-size: 13px;
      color: var(--wa-text-secondary);
      text-align: center;
      margin-bottom: 16px;
      font-style: italic;
    }

    /* ============ 好感度条 ============ */
    .wa-fondness {
      margin-bottom: 12px;
    }

    .wa-fondness-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      font-size: 12px;
      color: var(--wa-text-tertiary);
    }

    .wa-fondness-value {
      font-weight: 600;
      color: var(--wa-accent-cyan);
      font-variant-numeric: tabular-nums;
    }

    .wa-fondness-bar {
      height: 6px;
      background: var(--wa-bg-layer2);
      border: 1px solid var(--wa-border-subtle);
      border-radius: 6px;
      overflow: hidden;
      position: relative;
    }

    .wa-fondness-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--wa-accent-cyan), var(--wa-accent-violet));
      border-radius: 6px;
      transition: width var(--wa-duration-slow) var(--wa-ease-out);
      position: relative;
      box-shadow: 0 0 8px var(--wa-accent-cyan-glow);
    }

    .wa-fondness-fill::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
      animation: wa-fondness-shine 3s ease-in-out infinite;
    }

    @keyframes wa-fondness-shine {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }

    /* ============ 状态标签 ============ */
    .wa-person-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }

    .wa-person-tag {
      padding: 3px 8px;
      background: var(--wa-bg-layer2);
      border: 1px solid var(--wa-border-subtle);
      border-radius: 4px;
      font-size: 11px;
      color: var(--wa-text-secondary);
      font-weight: 500;
    }

    /* ============ 关系网可视化 ============ */
    .wa-relationship-map {
      background: var(--wa-glass-dark);
      backdrop-filter: blur(12px);
      border: 1px solid var(--wa-border-subtle);
      border-radius: 12px;
      padding: 24px;
      position: relative;
      min-height: 400px;
    }

    .wa-relation-node {
      position: absolute;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: 2px solid var(--wa-accent-cyan);
      background: var(--wa-bg-layer1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: var(--wa-text-primary);
      font-weight: 600;
      cursor: pointer;
      transition: all var(--wa-duration-fast) var(--wa-ease-out);
      box-shadow: 0 0 12px var(--wa-accent-cyan-glow);
    }

    .wa-relation-node:hover {
      transform: scale(1.15);
      box-shadow: 0 0 20px var(--wa-accent-cyan-glow);
      z-index: 10;
    }

    .wa-relation-node-center {
      width: 80px;
      height: 80px;
      border-width: 3px;
      font-size: 14px;
      box-shadow: 0 0 24px var(--wa-accent-cyan-glow);
    }

    .wa-relation-line {
      position: absolute;
      height: 2px;
      background: linear-gradient(90deg, var(--wa-accent-cyan), transparent);
      transform-origin: left center;
      opacity: 0.3;
      transition: opacity var(--wa-duration-fast);
    }

    .wa-relation-line:hover {
      opacity: 0.8;
    }

    /* ============ 人物详情面板 ============ */
    .wa-person-detail {
      background: var(--wa-glass-dark);
      backdrop-filter: blur(12px);
      border: 1px solid var(--wa-border-subtle);
      border-radius: 12px;
      padding: 24px;
    }

    .wa-person-detail-header {
      display: flex;
      gap: 20px;
      margin-bottom: 24px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--wa-border-subtle);
    }

    .wa-person-detail-avatar {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      border: 4px solid transparent;
      background: linear-gradient(var(--wa-bg-layer1), var(--wa-bg-layer1)) padding-box,
                  linear-gradient(135deg, var(--wa-accent-cyan), var(--wa-accent-violet)) border-box;
      flex-shrink: 0;
    }

    .wa-person-detail-info {
      flex: 1;
    }

    .wa-person-detail-name {
      font-size: 24px;
      font-weight: 700;
      color: var(--wa-accent-cyan);
      margin-bottom: 8px;
      text-shadow: 0 0 12px var(--wa-accent-cyan-glow);
    }

    .wa-person-detail-desc {
      font-size: 14px;
      color: var(--wa-text-secondary);
      line-height: 1.6;
      margin-top: 12px;
    }

    .wa-person-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
      margin-top: 20px;
    }

    .wa-person-stat {
      text-align: center;
    }

    .wa-person-stat-label {
      font-size: 11px;
      color: var(--wa-text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .wa-person-stat-value {
      font-size: 20px;
      font-weight: 700;
      color: var(--wa-accent-cyan);
      font-variant-numeric: tabular-nums;
    }
  `;

  // 注入样式
  const style = document.createElement('style');
  style.id = 'wa-cyberpunk-people';
  style.textContent = PEOPLE_CSS;
  (document.head || document.documentElement).appendChild(style);

  // 人物页构建器
  WA.cyberPeople = {
    version: '2.177.0',

    // 人物卡片
    personCard: function(person) {
      const relationClass = person.relation === 'friend' ? 'wa-avatar-friend' :
                           person.relation === 'hostile' ? 'wa-avatar-hostile' : 'wa-avatar-neutral';
      return `
        <div class="wa-person-card" data-id="${person.id}">
          <div class="wa-avatar-wrapper">
            <div class="wa-avatar ${relationClass}">
              ${person.avatar ? 
                `<img src="${person.avatar}" alt="${person.name}">` :
                `<div class="wa-avatar-placeholder">${person.name.charAt(0)}</div>`
              }
            </div>
          </div>
          <div class="wa-person-name">${person.name}</div>
          ${person.title ? `<div class="wa-person-title">${person.title}</div>` : ''}
          ${person.fondness !== undefined ? `
            <div class="wa-fondness">
              <div class="wa-fondness-label">
                <span>好感度</span>
                <span class="wa-fondness-value">${person.fondness}</span>
              </div>
              <div class="wa-fondness-bar">
                <div class="wa-fondness-fill" style="width: ${person.fondness}%"></div>
              </div>
            </div>
          ` : ''}
          ${person.tags ? `
            <div class="wa-person-tags">
              ${person.tags.map(t => `<span class="wa-person-tag">${t}</span>`).join('')}
            </div>
          ` : ''}
          ${person.status ? WA.cyberUI.status(person.status.type, person.status.text) : ''}
        </div>
      `;
    },

    // 人物网格
    peopleGrid: function(people) {
      return `
        <div class="wa-people-grid">
          ${people.map(p => this.personCard(p)).join('')}
        </div>
      `;
    },

    // 人物详情
    personDetail: function(person) {
      return `
        <div class="wa-person-detail">
          <div class="wa-person-detail-header">
            <div class="wa-person-detail-avatar">
              ${person.avatar ? 
                `<img src="${person.avatar}" alt="${person.name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` :
                `<div class="wa-avatar-placeholder" style="width:100%;height:100%;font-size:48px;">${person.name.charAt(0)}</div>`
              }
            </div>
            <div class="wa-person-detail-info">
              <div class="wa-person-detail-name">${person.name}</div>
              ${person.title ? `<div class="wa-person-title">${person.title}</div>` : ''}
              ${person.tags ? `
                <div class="wa-person-tags" style="margin-top:12px;">
                  ${person.tags.map(t => `<span class="wa-person-tag">${t}</span>`).join('')}
                </div>
              ` : ''}
              ${person.desc ? `<div class="wa-person-detail-desc">${person.desc}</div>` : ''}
            </div>
          </div>
          ${person.stats ? `
            <div class="wa-person-stats">
              ${Object.entries(person.stats).map(([k, v]) => `
                <div class="wa-person-stat">
                  <div class="wa-person-stat-label">${k}</div>
                  <div class="wa-person-stat-value">${v}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }
  };
})();

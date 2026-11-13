/**
 * WorldAxis ui/pages/dashboards.js (2.401.0) — 四个大盘（OPV23-3，原 ui/panel.js 16971-17129 行）
 *
 * ── 它治什么 ────────────────────────────────────────────────────
 *   概览页那三个 `__dashboardBlock` 背后的大盘，加上 V17 沙盘：
 *     · renderV17DramaPsycheBoard —— 宏观因果与心智戏剧沙盘（V17）
 *     · renderV20HolomapDashboard —— 纪元全息态势大盘（V20）
 *     · renderV21CivEcoHub         —— 文明盛衰与生态全景（V21）
 *     · renderV19ImmersionFold     —— 沉浸式深水机制与暗网（V19）
 *   四段共 159 行，**外部闭包依赖为零**（只读 `WA.*` 的引擎读口）——
 *   整个 panel.js 里唯一一段「搬走不需要注入任何符号」的代码，故单列。
 *
 * ── 为什么段体是对象成员列表而不是函数 ────────────────────────────
 *   原文这四段就是 `WA.ui = { ... }` 对象字面量里的方法（方法简写语法），
 *   段体逐字保留「4 空格缩进 + 尾部逗号」的成员列表形态，由下方的 `METHODS`
 *   字面量承载。这样重组时整段原样拼回对象内，**一个字符都不用改**。
 *
 * ── 口径 ────────────────────────────────────────────────────────
 *   零世界写（只读引擎读口）、零 require / module.exports、零控件零 id。
 *   四个方法在无 `container` 时返回 `{ ok:true, headless:true, data }` —— 这是原有行为，
 *   逐字保留（负控与 headless 断言都依赖这个形状）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const METHODS = {
  // ══ 段体开始（原 ui/panel.js 16971-17129 行，逐字搬迁，一个字符未改）══
    // v2.340.0 (V17 EXV17-9): 全息宏观因果与心智戏剧沙盘大盘渲染
    renderV17DramaPsycheBoard(container) {
      const data = {
        tension: (WA.dramaticTension && typeof WA.dramaticTension.getSceneTension === 'function') ? WA.dramaticTension.getSceneTension() : 20.0,
        epoch: (WA.epochTide && typeof WA.epochTide.getCurrentEpoch === 'function') ? WA.epochTide.getCurrentEpoch() : { epochType: 'normal_era' },
        butterfly: (WA.butterflyCascade && typeof WA.butterflyCascade.diagnose === 'function') ? WA.butterflyCascade.diagnose() : {},
        psyche: (WA.psycheTrauma && typeof WA.psycheTrauma.diagnose === 'function') ? WA.psycheTrauma.diagnose() : {}
      };
      if (!container || typeof container.appendChild !== 'function') {
        // 安全无 DOM 环境降级
        return { ok: true, headless: true, data: data };
      }
      try {
        const div = document.createElement('div');
        div.id = 'wa-drama-v17-dash';
        div.className = 'wa-v17-board';
        div.innerHTML = `<div class="board-header">V17 全息戏剧因果大盘</div><div class="board-content">张力: ${data.tension}% | 纪元: ${data.epoch.epochType}</div>`;
        container.appendChild(div);
        return { ok: true, rendered: true, data: data };
      } catch (e) {
        return { ok: true, headless: true, data: data, error: e.message };
      }
    },
    // v2.351.0 (V19 EXV19-9 & OPV19-9): 沉浸式微观生理创伤与隐秘暗网原生折叠面板
        // v2.360.0 (V20 EXV20-9): 史诗全息世界态势仪表大盘 (Holistic World Holomap)
    renderV20HolomapDashboard(container) {
      const data = {
        epoch: (WA.epochalTransition && typeof WA.epochalTransition.buildBlock === 'function') ? WA.epochalTransition.buildBlock() : '',
        hazard: (WA.cataclysmHazard && typeof WA.cataclysmHazard.buildBlock === 'function') ? WA.cataclysmHazard.buildBlock() : '',
        finance: (WA.financialContagion && typeof WA.financialContagion.buildBlock === 'function') ? WA.financialContagion.buildBlock() : '',
        bridgeDirty: (WA.bridge && typeof WA.bridge.stat === 'function') ? WA.bridge.stat() : null
      };
      if (!container || typeof container.appendChild !== 'function') {
        return { ok: true, headless: true, data: data };
      }
      try {
        const wrap = document.createElement('div');
        wrap.id = 'wa-holomap-v20-wrap';
        wrap.className = 'wa-holomap-v20-dashboard';
        wrap.innerHTML = `
          <div class="wa-holomap-header"><h4>WorldAxis 纪元全息态势仪表大盘</h4></div>
          <details class="wa-details" id="wa-epoch-holomap" open>
            <summary class="wa-summary">历史演进与纪元形态</summary>
            <div class="wa-fold-body">${data.epoch || '文明演进平稳，当前处于承平纪元'}</div>
          </details>
          <details class="wa-details" id="wa-cataclysm-holomap" open>
            <summary class="wa-summary">极端地貌灾变与迁徙流民</summary>
            <div class="wa-fold-body">${data.hazard || '地壳板块稳固，暂无大尺度灾变'}</div>
          </details>
          <details class="wa-details" id="wa-finance-holomap" open>
            <summary class="wa-summary">地下金融信用与挤兑预警</summary>
            <div class="wa-fold-body">${data.finance || '流动性充裕，未侦测到钱庄暴雷'}</div>
          </details>
        `;
        container.appendChild(wrap);
        return { ok: true, rendered: true, data: data };
      } catch (e) {
        return { ok: true, headless: true, data: data, error: e.message };
      }
    },
    // v2.380.0 (V21 EXV21-9): 史诗级活世界文明与生态全景控制中心 (Holistic Civ-Eco Hub)
    renderV21CivEcoHub(container) {
      const data = {
        theology: (WA.theologyCult && typeof WA.theologyCult.buildBlock === 'function') ? WA.theologyCult.buildBlock() : '',
        regiment: (WA.regimentTactics && typeof WA.regimentTactics.buildBlock === 'function') ? WA.regimentTactics.buildBlock() : '',
        prison: (WA.incarcerationJailbreak && typeof WA.incarcerationJailbreak.buildBlock === 'function') ? WA.incarcerationJailbreak.buildBlock() : '',
        bloodline: (WA.bloodlineHeritage && typeof WA.bloodlineHeritage.buildBlock === 'function') ? WA.bloodlineHeritage.buildBlock() : '',
        engineering: (WA.engineeringBlueprint && typeof WA.engineeringBlueprint.buildBlock === 'function') ? WA.engineeringBlueprint.buildBlock() : '',
        dungeon: (WA.dungeonHazardMesh && typeof WA.dungeonHazardMesh.buildBlock === 'function') ? WA.dungeonHazardMesh.buildBlock() : '',
        eco: (WA.ecosystemCascade && typeof WA.ecosystemCascade.buildBlock === 'function') ? WA.ecosystemCascade.buildBlock() : '',
        court: (WA.courtIntrigue && typeof WA.courtIntrigue.buildBlock === 'function') ? WA.courtIntrigue.buildBlock() : ''
      };
      if (!container || typeof container.appendChild !== 'function') {
        return { ok: true, headless: true, data: data };
      }
      try {
        const wrap = document.createElement('div');
        wrap.id = 'wa-civ-eco-hub-v21';
        wrap.className = 'wa-civ-eco-hub-dashboard';
        wrap.innerHTML = `
          <div class="wa-hub-header"><h4>WorldAxis V21 文明盛衰与生态全景控制大盘</h4></div>
          <details class="wa-details" id="wa-theology-hub">
            <summary class="wa-summary">神权信仰天平与教派狂热</summary>
            <div class="wa-fold-body">${data.theology || '四海向化，神权信仰平和自守'}</div>
          </details>
          <details class="wa-details" id="wa-regiment-hub">
            <summary class="wa-summary">战役军团排阵与阵线士气</summary>
            <div class="wa-fold-body">${data.regiment || '营垒坚实，军容肃整'}</div>
          </details>
          <details class="wa-details" id="wa-prison-hub">
            <summary class="wa-summary">刑狱地道与水牢禁闭档案</summary>
            <div class="wa-fold-body">${data.prison || '囹圄安稳，门禁森严'}</div>
          </details>
          <details class="wa-details" id="wa-bloodline-hub">
            <summary class="wa-summary">宗族血脉信托与先祖诅咒</summary>
            <div class="wa-fold-body">${data.bloodline || '昭穆序定，谱系传续无虞'}</div>
          </details>
          <details class="wa-details" id="wa-engineering-hub">
            <summary class="wa-summary">文明工程图纸与器械工坊</summary>
            <div class="wa-fold-body">${data.engineering || '百工严谨，工坊按部就班'}</div>
          </details>
          <details class="wa-details" id="wa-dungeon-hub">
            <summary class="wa-summary">地牢秘境迷宫与机关陷阱拓扑</summary>
            <div class="wa-fold-body">${data.dungeon || '地宫虚静，陷阱静默待发'}</div>
          </details>
          <details class="wa-details" id="wa-eco-hub">
            <summary class="wa-summary">深层生态食物链与异化灾警</summary>
            <div class="wa-fold-body">${data.eco || '林野自适，物种营养级稳态平衡'}</div>
          </details>
          <details class="wa-details" id="wa-court-hub">
            <summary class="wa-summary">深宫内斗派系与禁军兵权</summary>
            <div class="wa-fold-body">${data.court || '君臣相得，宫廷法度清明'}</div>
          </details>
        `;
        container.appendChild(wrap);
        return { ok: true, rendered: true, data: data };
      } catch (e) {
        return { ok: true, headless: true, data: data, error: e.message };
      }
    },
    renderV19ImmersionFold(container) {
      const data = {
        maritime: (WA.maritimeNavigation && typeof WA.maritimeNavigation.buildBlock === 'function') ? WA.maritimeNavigation.buildBlock() : '',
        blackmarket: (WA.blackmarketUsury && typeof WA.blackmarketUsury.buildBlock === 'function') ? WA.blackmarketUsury.buildBlock() : '',
        stealth: (WA.stealthInfiltration && typeof WA.stealthInfiltration.buildBlock === 'function') ? WA.stealthInfiltration.buildBlock() : '',
        toxicology: (WA.alchemyToxicology && typeof WA.alchemyToxicology.buildBlock === 'function') ? WA.alchemyToxicology.buildBlock() : '',
        covenant: (WA.covenantSanction && typeof WA.covenantSanction.buildBlock === 'function') ? WA.covenantSanction.buildBlock() : ''
      };
      if (!container || typeof container.appendChild !== 'function') {
        return { ok: true, headless: true, data: data };
      }
      try {
        const wrap = document.createElement('div');
        wrap.id = 'wa-immersion-v19-wrap';
        wrap.className = 'wa-immersion-fold-wrap';
        wrap.innerHTML = `
          <details class="wa-details" id="wa-trauma-fold">
            <summary class="wa-summary">身体创伤与病理诊查</summary>
            <div class="wa-fold-body">${data.toxicology || '经络血气平稳，未探得致命毒质'}</div>
          </details>
          <details class="wa-details" id="wa-blackmarket-fold">
            <summary class="wa-summary">隐秘市集与商誉信用</summary>
            <div class="wa-fold-body">${data.blackmarket || '当前无逾期借贷，市井流水如常'}</div>
          </details>
          <details class="wa-details" id="wa-shadow-network-fold">
            <summary class="wa-summary">暗中潜伏与眼线网络</summary>
            <div class="wa-fold-body">${data.stealth || '未处于严密盯梢视锥盲区'}</div>
          </details>
          <details class="wa-details" id="wa-naval-fold">
            <summary class="wa-summary">远洋水文与操舵航程</summary>
            <div class="wa-fold-body">${data.maritime || '泊锚于安全港湾'}</div>
          </details>
        `;
        container.appendChild(wrap);
        return { ok: true, rendered: true, data: data };
      } catch (e) {
        return { ok: true, headless: true, data: data, error: e.message };
      }
    }
  // ══ 段体结束 ══
  };
  function bind(ctx) { return API; }
  const API = {
    renderV17DramaPsycheBoard: METHODS.renderV17DramaPsycheBoard,
    renderV20HolomapDashboard: METHODS.renderV20HolomapDashboard,
    renderV21CivEcoHub: METHODS.renderV21CivEcoHub,
    renderV19ImmersionFold: METHODS.renderV19ImmersionFold,
    bind: bind,
    ver: '2.401.0'
  };
  WA.uiDashboards = API;
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('ui/pages/dashboards.js', { kind: 'ui', ver: '2.401.0' });
  }
})();

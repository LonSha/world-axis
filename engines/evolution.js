/**
 * WorldAxis engines/evolution.js (v0.3 完整版)
 * 事件演化：双类型四阶段骰子推进 + 势力/声誉/经济/风声/仇敌/影响链/黑盒/天下大势
 * 移植自 DlSNlGHT World world-engine-evolution.js
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_evolution_settings_v1';

  // ── 阶段定义 ──
  const STAGE_MAP = { conflict: ['萌芽', '发酵', '逼近', '已爆发', '已消散'], progress: ['筹备', '执行', '关键', '已完成', '已失败'] };
  const TERMINAL = { conflict: ['已爆发', '已消散'], progress: ['已完成', '已失败'] };
  const FINAL = { conflict: '已爆发', progress: '已完成' };
  const STAGE_BASE = { conflict: { '萌芽': 85, '发酵': 80, '逼近': 75 }, progress: { '筹备': 85, '执行': 80, '关键': 75 } };
  const REPUTATION_LEVELS = ['天怒人怨', '声名狼藉', '默默无闻', '受人尊敬', '万众敬仰'];
  const FACTION_STATUS = ['鼎盛', '稳固', '倾轧', '困顿', '衰落', '瓦解'];
  const FACTION_RELATION = ['血盟', '盟友', '友好', '中立', '冷淡', '敌对', '世仇'];
  const ECONOMY_CLIMATE = ['繁荣', '平稳', '衰退', '动荡'];
  const WIND_DECAY = { announcement: { grace: 3, base: 20, linear: 15, quadratic: 3 }, report: { grace: 2, base: 25, linear: 15, quadratic: 4 }, rumor: { grace: 1, base: 30, linear: 18, quadratic: 5 }, sentiment: { grace: 2, base: 22, linear: 16, quadratic: 4 } };

  function loadSettings() {
    const def = {
      diceEnabled: true,           // 本地骰子推进
      progressFailBase: 2, conflictFailBase: 6,
      diceModifier: 0, setbackRatio: 40,
      distantEventEnabled: false, distantChance: 20, distantCooldown: 5,
      nearEventEnabled: false, nearChance: 20, nearCooldown: 5,
      regionalIncidentEnabled: false
    };
    try { return Object.assign(def, JSON.parse(WA.mainWin.localStorage.getItem(LS_KEY) || '{}')); } catch (e) { return def; }
  }
  const __REG = { key: LS_KEY, def: null, module: 'evolution' };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function saveSettings(s) { WA.settingsBus.save(__REG, s); }

  function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  const MAX_WINDS = 12;   // v0.6.0: 风声环形容量（衰减引擎是常态收敛，入账点兜底）
  const evolution = WA.evolution = {
    STAGE_MAP, TERMINAL, REPUTATION_LEVELS, FACTION_STATUS, FACTION_RELATION, ECONOMY_CLIMATE,
    getSettings: loadSettings,
    setSettings(o) { saveSettings(Object.assign(loadSettings(), o || {})); },

    // ════════════════════════════════════════════════════
    // 事件链 CRUD + 骰子推进（移植 forceTriggerEvents）
    // ════════════════════════════════════════════════════
    addEvent(ev) {
      return WA.store.transact(draft => {
        // v0.6.0: 容量治理——编辑器容量上限对有机路径同样生效（探针实证直推可绕过）。
        // 挤出优先级：终局事件（剧情档案价值低）> 最早创建（保留最新剧情张力）。
        const evArr = draft.evolution.events = draft.evolution.events || [];
        const evMax = (WA.editorEvents && WA.editorEvents.MAX_EVENTS) || 16;
        while (evArr.length >= evMax) {
          let evIdx = evArr.findIndex(e => e && (TERMINAL[e.type] || []).includes(e.stage));
          if (evIdx < 0) evIdx = 0;
          evArr.splice(evIdx, 1);
        }
        draft.evolution.events.push(Object.assign({
          id: uid('ev'), type: 'conflict', name: '', level: 1, stage: '萌芽', stageRound: 1,
          desc: '', stall: false, consecutiveFails: 0, createdRound: draft.evolution.round
        }, ev, { title: ev.name || ev.title })); // title兼容旧字段
      });
    },

    getMaxFails(ev) {
      const st = loadSettings();
      const level = ev.level || 1;
      return ev.type === 'progress' ? st.progressFailBase + level : Math.max(1, st.conflictFailBase - level);
    },

    advanceStageRound(ev) {
      const order = STAGE_MAP[ev.type] || STAGE_MAP.conflict;
      ev.stageRound++;
      if (ev.stageRound >= 9) {
        const idx = order.indexOf(ev.stage);
        if (idx !== -1 && idx < order.length - 2) { ev.stage = order[idx + 1]; ev.stageRound = 1; }
        else { ev.stage = FINAL[ev.type]; ev.stageRound = 9; }
      }
    },

    /** 本地骰子推进所有活跃事件（移植阈值公式） */
    rollEvents() {
      const st = loadSettings();
      if (!st.diceEnabled) return [];
      const results = [];
      WA.store.transact(draft => {
        (draft.evolution.events || []).forEach(ev => {
          delete ev.evolveResult;
          if (!ev.type || !STAGE_MAP[ev.type]) ev.type = 'conflict';
          if (ev.stageRound === undefined) ev.stageRound = 1;
          if (ev.consecutiveFails === undefined) ev.consecutiveFails = 0;
          if ((TERMINAL[ev.type] || []).includes(ev.stage)) return;
          if (!ev.stage || !STAGE_MAP[ev.type].includes(ev.stage)) ev.stage = STAGE_MAP[ev.type][0];
          // 保底：连续非成功达上限强制成功
          const maxFails = this.getMaxFails(ev);
          if (ev.consecutiveFails >= maxFails) {
            this.advanceStageRound(ev); ev.consecutiveFails = 0; ev.evolveResult = '成功(保底)';
            results.push({ name: ev.name || ev.title, result: '成功(保底)', stage: ev.stage });
            return;
          }
          // 正常掷骰（移植公式：threshold = stageBase - 200*r*(1-r) + levelAdjust - modifier）
          const r = Math.min(1, (ev.stageRound || 1) / 9);
          const base = (STAGE_BASE[ev.type] || STAGE_BASE.conflict)[ev.stage] || 85;
          const level = ev.level || 1;
          const levelAdjust = ev.type === 'progress' ? (level - 1) * 10 : -((level - 1) * 10);
          const threshold = Math.round(base - 200 * r * (1 - r) + levelAdjust - st.diceModifier);
          const dice = Math.floor(Math.random() * 100) + 1;
          if (dice > threshold) {
            this.advanceStageRound(ev); ev.consecutiveFails = 0; ev.evolveResult = '成功';
            results.push({ name: ev.name || ev.title, result: '成功', stage: ev.stage, dice, threshold });
          } else if (dice < threshold * (st.setbackRatio / 100)) {
            ev.stageRound = Math.max(1, ev.stageRound - 1); ev.consecutiveFails++; ev.evolveResult = '受挫';
            results.push({ name: ev.name || ev.title, result: '受挫', stage: ev.stage, dice, threshold });
          } else {
            ev.consecutiveFails++; ev.evolveResult = '保持';
            results.push({ name: ev.name || ev.title, result: '保持', stage: ev.stage, dice, threshold });
          }
        });
      });
      return results;
    },

    // ════════════════════════════════════════════════════
    // 风声传播 + 消散骰（移植 decayWinds）
    // ════════════════════════════════════════════════════
    // v0.6.0: 风声环形容量（模块级 MAX_WINDS，此字段供 backstage/测试引用，单源防漂移）
    MAX_WINDS: MAX_WINDS,

    addWind(wind) {
      return WA.store.transact(draft => {
        const w = Object.assign({ id: uid('w'), topic: '', type: 'rumor', level: 1, content: '', scope: '', source: '', quietRounds: 0 }, wind);
        // 同主题归并
        const old = (draft.evolution.winds || []).find(x => x.topic === w.topic);
        if (old) { old.content = w.content || old.content; old.level = Math.max(old.level, w.level); old.scope = w.scope || old.scope; old.quietRounds = 0; }
        else {
          const wArr = draft.evolution.winds = draft.evolution.winds || [];
          while (wArr.length >= MAX_WINDS) wArr.shift();   // v0.6.0: 环形容量（衰减引擎是常态收敛，此处是兜底）
          wArr.push(w);
        }
      });
    },

    decayWinds() {
      const decayed = [];
      WA.store.transact(draft => {
        const survivors = [];
        for (const w of (draft.evolution.winds || [])) {
          const params = WIND_DECAY[w.type] || WIND_DECAY.rumor;
          const level = Math.min(4, Math.max(1, w.level || 1));
          w.quietRounds = (w.quietRounds || 0) + 1;
          if (w.quietRounds <= params.grace) { survivors.push(w); continue; }
          const n = w.quietRounds - params.grace - 1;
          const chance = Math.min(95, Math.max(5, params.base + params.linear * n + params.quadratic * n * n - (level - 1) * 10));
          const dice = Math.floor(Math.random() * 100) + 1;
          if (dice <= chance) decayed.push(w.topic); else survivors.push(w);
        }
        draft.evolution.winds = survivors;
      });
      if (decayed.length) WA.log('info', '风声消散：' + decayed.join('、'));
      return decayed;
    },

    // ════════════════════════════════════════════════════
    // 势力/声誉/经济（结算入账，供backstage applyResult调用）
    // ════════════════════════════════════════════════════
    applyFactions(draft, factions) {
      (factions || []).slice(0, 8).forEach(f => {
        if (!f || !f.name) return;
        draft.evolution.factions = draft.evolution.factions || [];
        const old = draft.evolution.factions.find(x => x.name === f.name);
        const status = FACTION_STATUS.includes(f.status) ? f.status : (old && old.status) || '稳固';
        const relation = FACTION_RELATION.includes(f.relation) ? f.relation : (old && old.relation) || '中立';
        if (old) {
          old.scope = f.scope || old.scope; old.status = status; old.relation = relation;
          old.currentGoal = f.currentGoal || old.currentGoal; old.core_person = f.core_person || old.core_person;
          old.powerPillars = Array.isArray(f.powerPillars) ? f.powerPillars.slice(0, 3) : old.powerPillars;
        } else {
          // v0.6.0: 容量治理——有机入账与编辑器同容量（环形挤出最早创建，不阻塞入账）
          const faArr = draft.evolution.factions = draft.evolution.factions || [];
          const faMax = (WA.editorFaction && WA.editorFaction.MAX_FACTIONS) || 16;
          while (faArr.length >= faMax) faArr.shift();
          faArr.push({ id: uid('fa'), name: f.name, scope: f.scope || '', status, relation, currentGoal: f.currentGoal || '', core_person: f.core_person || '', powerPillars: Array.isArray(f.powerPillars) ? f.powerPillars.slice(0, 3) : [] });
        }
      });
    },

    applyReputation(draft, rep) {
      if (!rep) return;
      const r = draft.evolution.reputation = draft.evolution.reputation || { authority: '默默无闻', common: '默默无闻', shadow: '默默无闻', circuit: '默默无闻', lastChange: '' };
      ['authority', 'common', 'shadow', 'circuit'].forEach(dim => {
        if (rep[dim] && REPUTATION_LEVELS.includes(rep[dim])) r[dim] = rep[dim];
      });
      if (rep.lastChange) r.lastChange = String(rep.lastChange).slice(0, 100);
    },

    applyEconomy(draft, eco) {
      if (!eco) return;
      const e = draft.evolution.economy = draft.evolution.economy || { climate: '平稳', signals: [] };
      if (eco.climate && ECONOMY_CLIMATE.includes(eco.climate)) e.climate = eco.climate;
      if (Array.isArray(eco.signals)) {
        e.signals = eco.signals.slice(0, 3).filter(s => s && s.summary).map(s => ({ summary: String(s.summary).slice(0, 80), scope: String(s.scope || '').slice(0, 40) }));
      }
    },

    applyInfluenceChain(draft, chains) {
      (chains || []).slice(0, 5).forEach(c => {
        if (!c || !c.trigger) return;
        draft.evolution.trends = draft.evolution.trends || [];
        const old = draft.evolution.trends.find(x => x.trigger === c.trigger);
        if (old) { old.impact = c.impact || old.impact; old.fallout = c.fallout || old.fallout; }
        else draft.evolution.trends.push({ id: uid('ic'), trigger: String(c.trigger).slice(0, 60), impact: String(c.impact || '').slice(0, 80), fallout: String(c.fallout || '').slice(0, 80), at: Date.now() });
        draft.evolution.trends = draft.evolution.trends.slice(-20);
      });
    },

    // ════════════════════════════════════════════════════
    // 快照（供backstage注入/面板）
    // ════════════════════════════════════════════════════
    activeSnapshot() {
      const s = WA.store.get();
      return {
        events: (s.evolution.events || []).filter(e => !(TERMINAL[e.type] || []).includes(e.stage)).slice(0, 8).map(e => ({ n: e.name || e.title, ty: e.type, lv: e.level, st: e.stage, sr: e.stageRound })),
        factions: (s.evolution.factions || []).slice(0, 6).map(f => ({ n: f.name, st: f.status, rel: f.relation, goal: (f.currentGoal || '').slice(0, 30) })),
        winds: (s.evolution.winds || []).slice(0, 6).map(w => ({ t: w.topic, lv: w.level, ty: w.type })),
        reputation: s.evolution.reputation,
        economy: s.evolution.economy
      };
    },

    /** 演化注入块（before链） */
    buildEvolutionBlock() {
      const snap = this.activeSnapshot();
      const parts = [];
      if (snap.events.length) parts.push('【活跃事件链】' + snap.events.map(e => e.n + '(' + e.st + e.sr + '/9)').join('；'));
      if (snap.winds.length) parts.push('【传播中风声】' + snap.winds.map(w => w.t + '(Lv' + w.lv + ')').join('；'));
      if (snap.factions.length) parts.push('【势力态度】' + snap.factions.map(f => f.n + ':' + f.rel).join('；'));
      if (snap.reputation && Object.values(snap.reputation).some(v => v !== '默默无闻' && v !== '')) {
        parts.push('【玩家声誉】朝堂:' + snap.reputation.authority + ' 市井:' + snap.reputation.common + ' 草莽:' + snap.reputation.shadow + ' 同道:' + snap.reputation.circuit);
      }
      if (snap.economy && snap.economy.climate !== '平稳') parts.push('【经济气候】' + snap.economy.climate + (snap.economy.signals.length ? ' — ' + snap.economy.signals.map(x => x.summary).join('；') : ''));
      if (!parts.length) return '';
      return '<world_axis_evolution>\n' + parts.join('\n') + '\n</world_axis_evolution>';
    },

    /** 回合计（after链）：round+1 + 骰子推进 + 风声消散 */
    tick() {
      WA.store.transact(draft => { draft.evolution.round++; });
      const results = this.rollEvents();
      this.decayWinds();
      if (results.some(r => r.result.startsWith('成功'))) {
        WA.log('info', '演化推进：' + results.filter(r => r.result.startsWith('成功')).map(r => r.name + '→' + r.stage).join('、'));
      }
      return results;
    }
  };

  WA.workflow.register({
    id: 'evolution.tick', chain: 'after', order: 30, label: '事件演化·骰子推进',
    async run() { WA.evolution.tick(); }
  });

  WA.workflow.register({
    id: 'evolution.inject', chain: 'before', order: 18, label: '演化状态注入',
    async run(ctx) {
      const block = WA.evolution.buildEvolutionBlock();
      if (block) ctx.injections.push({ source: '演化状态', position: 'after_last_user', depth: 1, content: block });
    }
  });
})();
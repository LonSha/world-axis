/**
 * WorldAxis engines/narrative-deduction.js (v2.247.0) — 双轨因果与线索断裂补偿推演台
 *
 * 核心职责（缝合 Gloria 叙事三部曲 MYSTERY_ENGINE / DUNGEON_ARCHITECT / SPINOF_WEAVER）：
 *   ① 客观事实轨 (objectiveTruth) 与 角色主观认知轨 (subjectiveBelief) 强隔离；
 *   ② 线索断裂自适应补偿 (compensateStall)：当剧情陷入调查死胡同时，引入环境扰动、传闻或第三方目击介入；
 *   ③ 规则碰撞与机制张力计 (ruleClashAudit)：检测超自然法则/异能/异常设定的互斥排斥度；
 *   ④ 番外平行视角侧写切面 (spinOffSnapshot)：抽取特定 NPC 的第一视角切片，生成幕后小传。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_narrative_deduction_settings_v1';
  const DEF = {
    enabled: true,
    enforceDualTrack: true,
    autoCompensateStall: true,
    stallThresholdRounds: 3,
    maxTimelineNodes: 50
  };

  const __REG = {
    key: LS_KEY, def: DEF, module: 'narrativeDeduction',
    bounds: { stallThresholdRounds: [1, 10], maxTimelineNodes: [10, 200] }
  };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  let _localSettings = null;

  function settings() {
    if (_localSettings) return Object.assign({}, DEF, _localSettings);
    if (WA.settingsBus && WA.settingsBus.read) {
      const raw = WA.settingsBus.read(__REG);
      return WA.settingsBus.normalize
        ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
        : Object.assign({}, DEF, raw || {});
    }
    return Object.assign({}, DEF);
  }

  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    _localSettings = merged;
    if (WA.settingsBus && WA.settingsBus.saveOrThrow) {
      const normalized = WA.settingsBus.normalize
        ? WA.settingsBus.normalize(__REG, merged)
        : merged;
      return WA.settingsBus.saveOrThrow(__REG, normalized);
    }
    return merged;
  }

  const __stat = {
    evaluatedRounds: 0,
    dualTrackEnforced: 0,
    compensationsTriggered: 0,
    ruleClashesDetected: 0,
    spinOffGenerations: 0
  };

  /**
   * 双轨因果核验：核实角色做出的陈述或推断，是否具备已合法获得的情报凭证
   * @param {Object} actor 角色对象
   * @param {string} claimAssertion 角色做出的关键断言
   * @param {Array<string>} actorKnownClues 角色已合法感知的线索列表
   * @param {Array<string>} objectiveFacts 客观绝对真相列表
   */
  function auditDualTrack(actor, claimAssertion, actorKnownClues, objectiveFacts) {
    const cfg = settings();
    if (!cfg.enabled || !cfg.enforceDualTrack) {
      return { ok: true, privileged: false, reason: 'disabled' };
    }

    __stat.evaluatedRounds++;
    const known = Array.isArray(actorKnownClues) ? actorKnownClues : [];
    const truth = Array.isArray(objectiveFacts) ? objectiveFacts : [];
    const claim = String(claimAssertion || '').trim();

    // 检查断言是否直接引用了客观存在但角色尚未获知的真相（越权全知）
    const leakedFacts = truth.filter(function (fact) {
      if (!fact || claim.indexOf(fact) < 0) return false;
      // 若该事实角色并未掌握，则属非法泄漏
      return !known.some(k => k.indexOf(fact) >= 0 || fact.indexOf(k) >= 0);
    });

    if (leakedFacts.length > 0) {
      __stat.dualTrackEnforced++;
      return {
        ok: false,
        privileged: true,
        leakedFacts: leakedFacts,
        reason: '角色陈述包含未合法获知的客观真相（全知穿帮越权）'
      };
    }

    return { ok: true, privileged: false, leakedFacts: [] };
  }

  /**
   * 线索断裂与调查陷入死胡同补偿算法
   * @param {number} unresolvedRounds 连续未推进轮数
   * @param {Object} contextCurrent 当前场景环境
   */
  function compensateStall(unresolvedRounds, contextCurrent) {
    const cfg = settings();
    if (!cfg.enabled || !cfg.autoCompensateStall) return null;

    const rounds = Number(unresolvedRounds) || 0;
    if (rounds < cfg.stallThresholdRounds) return null;

    __stat.compensationsTriggered++;
    const place = (contextCurrent && contextCurrent.place) || '现场';
    
    // 生成三种维度的外界自适应扰动补偿
    const compensations = [
      { type: 'environmental', desc: `由于时间推移，${place}的环境发生物理变动（如风化、异味扩散或遗落物显露），引出新线索` },
      { type: 'witness', desc: `一名神色慌张的旁观者或路人因无法承受压力，主动吐露了部分见闻` },
      { type: 'rumor', desc: `街巷间传开了一则看似荒诞但直指核心异常的流言传闻` }
    ];

    const pick = compensations[Math.floor(Math.random() * compensations.length)];
    noteTimeline('compensate', { place: place, rounds: rounds, type: pick.type });
    return {
      triggered: true,
      stalledRounds: rounds,
      compensation: pick,
      actionableGuidance: `[剧情推进扰动]：调查在${place}已滞留 ${rounds} 轮，系统介入环境线索：“${pick.desc}”。`
    };
  }

  /**
   * 规则碰撞与机制张力计
   */
  function auditRuleClash(activeRules) {
    if (!Array.isArray(activeRules) || activeRules.length < 2) return { clashes: [] };
    const clashes = [];
    for (let i = 0; i < activeRules.length; i++) {
      for (let j = i + 1; j < activeRules.length; j++) {
        const r1 = activeRules[i];
        const r2 = activeRules[j];
        if (r1.domain === r2.domain && r1.effect === 'forbid' && r2.effect === 'permit') {
          clashes.push({ r1: r1.id, r2: r2.id, domain: r1.domain, severity: 'high' });
          __stat.ruleClashesDetected++;
        }
      }
    }
    if (clashes.length) noteTimeline('clash', { pairs: clashes.length, domain: clashes[0].domain });
    return { clashes: clashes };
  }

  /**
   * 生成番外视角切面 (Spin-off Snapshot)
   */
  function generateSpinOffSnapshot(actor, sceneContext) {
    __stat.spinOffGenerations++;
    const name = (actor && actor.name) || '人物';
    const place = (sceneContext && sceneContext.place) || '未明场所';
    noteTimeline('spinOff', { actor: name, place: place });
    return {
      perspectiveActor: name,
      scene: place,
      lens: 'third-person-intimate',
      subtextPrompt: `【番外视角·${name}】脱离主视角叙事，仅以${name}此刻在${place}的感官切面与内心未言之事展开。`
    };
  }

  function stat() {
    return Object.assign({}, __stat);
  }

  /**
   * 把一次推演结论记进时间线（双轨隔离的**可回溯面**）。
   *   v2.250.0：`maxTimelineNodes` 此前零消费（声明了却没有任何容器可裁），
   *   于是「拦了多少条推演、哪一轮拦的」只能看计数、看不到内容 —— 计数说不出因果。
   *   环形由调用点显式给上限（per-call 站点 narrativeDeduction.timeline）。
   * @returns {{ok:boolean, dropped:number}} 恒不抛（记账失败不影响推演本身）
   */
  function noteTimeline(kind, payload) {
    try {
      const cfg = settings();
      if (!WA.store || typeof WA.store.transact !== 'function') return { ok: false, dropped: 0 };
      let dropped = 0;
      WA.store.transact(function (d) {
        if (!d.narrativeDeduction || typeof d.narrativeDeduction !== 'object') d.narrativeDeduction = { timeline: [] };
        const b = d.narrativeDeduction;
        if (!Array.isArray(b.timeline)) b.timeline = [];
        b.timeline.push({ kind: String(kind || 'note'), payload: payload || null, at: Date.now() });
        if (WA.evict && WA.evict.array) {
          const r = WA.evict.array(b.timeline, 'narrativeDeduction.timeline', cfg.maxTimelineNodes);
          dropped = (r && r.dropped) || 0;
        }
      }, 'narrativeDeduction:timeline');
      return { ok: true, dropped: dropped };
    } catch (e) { return { ok: false, dropped: 0 }; }
  }

  /** 只读最近若干条推演痕迹（新的在末尾）。 */
  function timeline(n) {
    try {
      const d = (WA.store && WA.store.get && WA.store.get()) || {};
      const arr = (d.narrativeDeduction && Array.isArray(d.narrativeDeduction.timeline)) ? d.narrativeDeduction.timeline : [];
      const k = Math.max(1, Number(n) || 10);
      return arr.slice(-k).map(function (x) { return Object.assign({}, x); });
    } catch (e) { return []; }
  }

  WA.narrativeDeduction = {
    auditDualTrack: auditDualTrack,
    compensateStall: compensateStall,
    auditRuleClash: auditRuleClash,
    generateSpinOffSnapshot: generateSpinOffSnapshot,
    noteTimeline: noteTimeline,
    timeline: timeline,
    getSettings: settings,
    setSettings: saveSettings,
    stat: stat
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/narrative-deduction 已加载（2.247.0）');
  }
})();
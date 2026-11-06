/**
 * WorldAxis engines/subtext-tension.js (v2.303.0)
 * OPV13-6: 叙事潜台词解码与情境张力动态调节
 *
 * 核心功能：
 *   1. 张力分级判定（assessTension）：根据双方历史恩怨、背叛记录、利益对立计算张力等级（low | medium | high | lethal）；
 *   2. 潜台词防线注入（encodeSubtext）：为台词绑定隐藏意图（hiddenMotives）与潜台词动作（subtextActions）；
 *   3. 意图解码与侦测（decodeSubtext）：基于角色洞察力解码隐藏弦外之音；
 *   4. 拦截空洞客套（filterPlatitudes）：在 high/lethal 张力场景下严格过滤模板化回复。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_subtext_tension_settings_v1';
  const DEF = { enabled: true, maxHistory: 80 };
  const __REG = { key: LS_KEY, def: DEF, module: 'subtextTension', bounds: {} };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return Object.assign({}, DEF, raw || {});
  }

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80);
  }

  function state() {
    return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
  }

  const _stat = {
    assessed: 0,
    encoded: 0,
    decoded: 0,
    platitudesBlocked: 0,
    refused: 0,
    lastReason: ''
  };

  /**
   * 1. 心理张力等级评估
   * tension_grade: low | medium | high | lethal
   */
  function assessTension(actorA, actorB, opts) {
    const a = clean(actorA, 40);
    const b = clean(actorB, 40);
    const o = opts || {};

    if (!a || !b) {
      _stat.refused++;
      _stat.lastReason = 'missing-actors';
      return { ok: false, reason: 'missing-actors' };
    }

    const s = state();
    let score = 0;
    const factors = [];

    // 因素1：入参直接给出的对抗基础或前置危机
    if (typeof o.baseTension === 'number') {
      score += Math.max(0, o.baseTension);
      factors.push('baseTension:' + o.baseTension);
    }

    // 因素2：角色人际关系中的负面摩擦
    if (s.people) {
      const pA = s.people['p_' + a] || s.people[a];
      const pB = s.people['p_' + b] || s.people[b];
      if (pA && pA.profile && Array.isArray(pA.profile.relations)) {
        const rel = pA.profile.relations.find(function (r) { return r && (r.target === b || r.name === b); });
        if (rel && typeof rel.affinity === 'number') {
          if (rel.affinity < -30) { score += 40; factors.push('deep_hostility'); }
          else if (rel.affinity < 0) { score += 20; factors.push('mild_friction'); }
        }
      }
      // 犯罪前科与背叛记载
      if (pA && pA.commitments && pA.commitments.some(function (c) { return c.type === 'criminal_record'; })) {
        score += 15;
        factors.push('actorA_criminal_record');
      }
      if (pB && pB.commitments && pB.commitments.some(function (c) { return c.type === 'criminal_record'; })) {
        score += 15;
        factors.push('actorB_criminal_record');
      }
    }

    // 因素3：当前场景处于警戒/危急
    if (o.alertLevel === 'lethal_alert' || o.threatLevel === 'lethal_alert' || o.crisis) {
      score += 45;
      factors.push('scene_crisis_alert');
    }

    let grade = 'low';
    if (score >= 70) grade = 'lethal';
    else if (score >= 45) grade = 'high';
    else if (score >= 20) grade = 'medium';

    _stat.assessed++;
    _stat.lastReason = 'assessed:' + grade;

    return {
      ok: true,
      actors: [a, b],
      score: score,
      grade: grade,
      factors: factors
    };
  }

  /**
   * 2. 编码注入潜台词防线（表层台词 vs 深层意图）
   */
  function encodeSubtext(spec) {
    const s = spec || {};
    const speaker = clean(s.speaker, 40);
    const listener = clean(s.listener || s.target, 40);
    const surfaceSpeech = clean(s.speech || s.surfaceSpeech, 200);
    const realIntent = clean(s.intent || s.realIntent, 150);
    const grade = clean(s.grade || 'medium', 20);

    if (!speaker || !surfaceSpeech || !realIntent) {
      _stat.refused++;
      _stat.lastReason = 'missing-subtext-fields';
      return { ok: false, reason: 'missing-subtext-fields' };
    }

    // 在高张力下检测空洞客套（platitudes）
    const platitudePatterns = ['您好', '幸会', '今天天气不错', '多谢关照', '一切听凭吩咐'];
    let isPlatitude = false;
    for (let i = 0; i < platitudePatterns.length; i++) {
      if (surfaceSpeech.indexOf(platitudePatterns[i]) >= 0) {
        isPlatitude = true;
        break;
      }
    }

    if (isPlatitude && (grade === 'high' || grade === 'lethal')) {
      _stat.platitudesBlocked++;
      _stat.lastReason = 'platitude_blocked';
      return {
        ok: false,
        reason: 'platitude_blocked',
        detail: '高压对峙情境下禁止空洞客套，必须使用带刺、试探或暗藏杀机的微反应表达'
      };
    }

    // 根据张力构建潜台词防线
    let subtextDefense = 'polite_mask';
    let physicalTells = ['眼神微动'];
    if (grade === 'lethal') {
      subtextDefense = 'lethal_stalemate';
      physicalTells = ['右手悄然触及佩刃', '呼吸频率骤降', '视线锁定对方要害'];
    } else if (grade === 'high') {
      subtextDefense = 'probing_barbs';
      physicalTells = ['嘴角带冷笑', '指节轻叩桌面', '刻意拉开防守身位'];
    } else if (grade === 'medium') {
      subtextDefense = 'cautious_hedging';
      physicalTells = ['眼神闪烁', '言辞闪烁其词'];
    }

    const packageResult = {
      ok: true,
      subtextId: 'st_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      speaker: speaker,
      listener: listener,
      surfaceSpeech: surfaceSpeech,
      realIntent: realIntent,
      grade: grade,
      subtextDefense: subtextDefense,
      physicalTells: physicalTells,
      unlockedCompromise: (grade === 'high' || grade === 'lethal') ? clean(s.compromiseHint || '出示旧盟约或家族史料可解除对峙', 100) : null
    };

    _stat.encoded++;
    _stat.lastReason = 'encoded';
    return packageResult;
  }

  /**
   * 3. 解码潜台词（听出弦外之音）
   */
  function decodeSubtext(subtextPack, observer, insightSkill) {
    const pack = subtextPack || {};
    const who = clean(observer, 40);
    const skill = typeof insightSkill === 'number' ? insightSkill : 50;

    if (!pack.realIntent || !pack.subtextDefense) {
      _stat.refused++;
      return { ok: false, reason: 'invalid-subtext-pack' };
    }

    // 检定阈值与张力挂钩
    let threshold = 40;
    if (pack.grade === 'lethal') threshold = 70;
    else if (pack.grade === 'high') threshold = 55;

    const success = skill >= threshold;
    _stat.decoded++;

    if (success) {
      return {
        ok: true,
        decoded: true,
        observer: who,
        realIntent: pack.realIntent,
        unlockedCompromise: pack.unlockedCompromise,
        message: '敏锐察觉言下之意与微动作暗语：【' + pack.realIntent + '】'
      };
    } else {
      return {
        ok: true,
        decoded: false,
        observer: who,
        realIntent: null,
        message: '仅捕捉到表面言辞，未能看穿对方戒备与防线。'
      };
    }
  }

  function stat() {
    return Object.assign({}, _stat);
  }

  WA.subtextTension = {
    assessTension: assessTension,
    encodeSubtext: encodeSubtext,
    decodeSubtext: decodeSubtext,
    stat: stat
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/subtext-tension.js', { kind: 'engine', ver: '2.303.0' });
  }
})();

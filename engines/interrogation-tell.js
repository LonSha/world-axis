/**
 * WorldAxis engines/interrogation-tell.js (v2.340.0)
 * EXV18-2: 微表情伪装破绽与审讯心理击穿引擎 (Interrogation Tells & Deception Breakdown)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 通用的心理防线博弈与口供审讯模型。不局限于现代刑侦，无论是公堂审案、
 * 宗门戒律堂过堂、地牢逼供、还是谍报刺探，均遵循心理防御崩溃曲线：
 *  1. 心理防线双槽:
 *     - deceptionStress (谎言与隐瞒心压 0~100, 初始0);
 *     - mentalDefiance (心理抵抗意志 0~100, 初始80~100).
 *  2. 审讯攻防策略 (Inquest Tactics):
 *     - 'present_evidence' (出示关键物证): 物证越铁，心防击破越猛烈；
 *     - 'expose_contradiction' (戳穿供词矛盾): 精准提升其心压，诱发微表情破绽；
 *     - 'intimidation' (严刑/威慑施压): 增加心压，但易触发负隅顽抗；
 *     - 'empathy' (共情瓦解/诱导赦免): 降低防备，引导认罪。
 *  3. 生理微表情破绽外溢 (Micro-Expression Tells):
 *     - 'pupil_dilation' (瞳孔骤缩/震颤);
 *     - 'cold_sweat' (冷汗涔涔/呼吸紊乱);
 *     - 'gaze_aversion' (眼神回避不敢直视);
 *     - 'speech_stumble' (语速骤变/结巴矛盾);
 *     - 'throat_swallow' (喉结剧烈吞咽/双拳紧攥).
 *  4. 招供相态状态机:
 *     - 'denial' (死不认罪/坚壁清野)
 *     - 'wavering' (心虚动摇/破绽频出)
 *     - 'partial_admission' (部分交代/丢卒保车)
 *     - 'full_confession' (全盘崩溃/决堤招供)
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  WA.engines = WA.engines || {};
  const VERSION = '2.340.0';

  const VALID_TACTICS = Object.freeze(['present_evidence', 'expose_contradiction', 'intimidation', 'empathy']);
  const VALID_STATUSES = Object.freeze(['denial', 'wavering', 'partial_admission', 'full_confession']);

  // 审讯对象表: Map<suspectId, SuspectRecord>
  const _subjects = new Map();

  function _clamp(n, min, max) {
    const num = Number(n);
    if (!isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
  }

  function _cleanStr(s, max) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, max || 60);
  }

  function registerSubject(suspectId, opts) {
    const id = _cleanStr(suspectId, 48);
    if (!id) return { ok: false, reason: 'missing-suspect-id' };
    const opt = opts || {};
    const state = {
      suspectId: id,
      deceptionStress: _clamp(opt.deceptionStress || 0, 0, 100),
      mentalDefiance: _clamp(opt.mentalDefiance !== undefined ? opt.mentalDefiance : 100, 0, 100),
      status: VALID_STATUSES.includes(opt.status) ? opt.status : 'denial',
      tellsHistory: [],
      presentedEvidence: [],
      stoicLevel: _clamp(opt.stoicLevel || 0, 0, 100), // 抗审讯训练度
      confessionText: '',
      updatedAt: Date.now()
    };
    _subjects.set(id, state);
    return { ok: true, subject: JSON.parse(JSON.stringify(state)) };
  }

  function getSubject(suspectId) {
    const id = _cleanStr(suspectId, 48);
    if (!id || !_subjects.has(id)) return null;
    return JSON.parse(JSON.stringify(_subjects.get(id)));
  }

  /**
   * 推进审讯交锋
   * @param {object} spec
   *   interrogatorId, suspectId, tactic, evidenceItems (Array of string/obj),
   *   contradictionDesc, pressurePower (0~100)
   */
  function pressInquest(spec) {
    const s = spec || {};
    const intId = _cleanStr(s.interrogatorId, 48) || 'inquisitor';
    const susId = _cleanStr(s.suspectId, 48);
    if (!susId) return { ok: false, reason: 'missing-suspect-id' };

    let sub = _subjects.get(susId);
    if (!sub) {
      registerSubject(susId, { mentalDefiance: 100 });
      sub = _subjects.get(susId);
    }

    if (sub.status === 'full_confession') {
      return { ok: false, reason: 'already-fully-confessed' };
    }

    const tactic = VALID_TACTICS.includes(s.tactic) ? s.tactic : 'present_evidence';
    let evidenceList = Array.isArray(s.evidenceItems) ? s.evidenceItems.filter(Boolean) : [];
    if (s.evidenceName && !evidenceList.length) {
      evidenceList = [String(s.evidenceName)];
    }
    const pressurePower = _clamp(s.pressurePower !== undefined ? s.pressurePower : (s.persuasionPower || 50), 1, 100);

    // 负控制铁律：若出示物证策略下未提供任何有效物证，且心理抵抗高于 40，断言绝不产生心理崩溃
    if (tactic === 'present_evidence' && evidenceList.length === 0 && sub.mentalDefiance > 40) {
      return { ok: false, reason: 'unsubstantiated-bluff-refused' };
    }

    const result = {
      ok: true,
      suspectId: susId,
      tacticUsed: tactic,
      defianceLoss: 0,
      stressGain: 0,
      tellObserved: null,
      newStatus: sub.status,
      confessionGained: false,
      summary: ''
    };

    let stressDelta = 0;
    let defianceDelta = 0;
    let tellKind = 'gaze_aversion';

    if (tactic === 'present_evidence') {
      const evWeight = evidenceList.length * 25;
      defianceDelta = Math.round(pressurePower * 0.6 + evWeight);
      stressDelta = Math.round(pressurePower * 0.5 + evWeight * 0.8);
      evidenceList.forEach(e => {
        const estr = typeof e === 'string' ? e : e.id || 'evidence';
        if (!sub.presentedEvidence.includes(estr)) sub.presentedEvidence.push(estr);
      });
      tellKind = 'cold_sweat';
      result.summary = `呈出关键物证 [${evidenceList.join(', ')}]，嫌疑人面色剧变！`;
    } else if (tactic === 'expose_contradiction') {
      defianceDelta = Math.round(pressurePower * 0.8);
      stressDelta = Math.round(pressurePower * 0.9);
      tellKind = 'speech_stumble';
      result.summary = `当堂戳穿证词矛盾，嫌疑人语塞结巴，支吾难辩！`;
    } else if (tactic === 'intimidation') {
      stressDelta = Math.round(pressurePower * 0.8);
      defianceDelta = Math.round(pressurePower * 0.4);
      tellKind = 'pupil_dilation';
      result.summary = `施加无上威压与律法威慑，嫌疑人瞳孔收缩心率骤增！`;
    } else if (tactic === 'empathy') {
      defianceDelta = Math.round(pressurePower * 0.7);
      stressDelta = -15; // 缓和应激
      tellKind = 'throat_swallow';
      result.summary = `温和诱导并陈述利害，嫌疑人喉头耸动，心防动摇。`;
    }

    // 扣减抵抗与增加应激（受受训度抵扣）
    const effectiveDefianceLoss = Math.max(0, Math.round(defianceDelta * (1 - sub.stoicLevel / 150)));
    const effectiveStressGain = Math.max(0, Math.round(stressDelta * (1 - sub.stoicLevel / 200)));

    sub.mentalDefiance = Math.max(0, sub.mentalDefiance - effectiveDefianceLoss);
    sub.deceptionStress = Math.min(100, Math.max(0, sub.deceptionStress + effectiveStressGain));

    result.defianceLoss = effectiveDefianceLoss;
    result.stressGain = effectiveStressGain;

    // 破绽外溢记录
    const tellRecord = {
      tactic: tactic,
      tell: tellKind,
      atDefiance: sub.mentalDefiance,
      atStress: sub.deceptionStress,
      timestamp: Date.now()
    };
    sub.tellsHistory.push(tellRecord);
    result.tellObserved = tellRecord;

    // 状态流转推进
    if (sub.mentalDefiance <= 0) {
      sub.status = 'full_confession';
      sub.confessionText = s.confessionDraft || '心防决堤，瘫软于地全盘招认罪行与幕后主使！';
      result.confessionGained = true;
      result.summary += ` [全盘招供] 心理防线彻底瓦解，嫌疑人决堤伏法！`;
    } else if (sub.mentalDefiance < 30) {
      sub.status = 'partial_admission';
      result.summary += ` [部分交代] 嫌疑人松口吐露次要线索，试图丢卒保车。`;
    } else if (sub.mentalDefiance < 70) {
      sub.status = 'wavering';
      result.summary += ` [心虚动摇] 嫌疑人眼神闪烁，言辞退缩。`;
    }

    result.newStatus = sub.status;
    sub.updatedAt = Date.now();

    return result;
  }

  function resetAll() {
    _subjects.clear();
  }

  function diagnose() {
    return {
      ok: true,
      version: VERSION,
      subjectsCount: _subjects.size,
      tactics: VALID_TACTICS,
      statuses: VALID_STATUSES
    };
  }

  const exportObj = {
    registerSubject: registerSubject,
    registerSuspect: registerSubject, // 别名兼容
    getSubject: getSubject,
    getSuspect: getSubject,
    pressInquest: pressInquest,
    resetAll: resetAll,
    diagnose: diagnose
  };

  WA.interrogationTell = exportObj;
  WA.engines.interrogationTell = exportObj;
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/interrogation-tell.js', { kind: 'engine', ver: VERSION });
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportObj;
  }
})();
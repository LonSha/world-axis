/**
 * WorldAxis engines/toxic-metabolism.js (v2.330.0)
 * EXV16-2: 生物机能毒素积蓄与生理解毒代谢引擎 (Toxicology & Toxin Metabolism)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 通用毒理生物学模型。无论生化毒气、奇幻猛毒草药、修仙尸瘴剧毒或废土核辐射，
 * 抽象为统一四大毒理病理学分类：
 *  1. neuro_paralysis (神经麻痹: 削减敏捷与感知响应，迟钝失调)
 *  2. tissue_corrosion (组织腐蚀: 剧烈消耗体力生命值，脏器与外表坏死)
 *  3. hallucinogen (致幻失真: 扭曲主观认知与视界，产生错误动线)
 *  4. asphyxiation (凝血窒息: 阻断氧气能量交换，耐力崩溃与休克昏迷)
 *
 * 核心方法：
 *  - applyToxin(actorId, toxinType, dose, opts)
 *  - metabolize(actorId, elapsedMinutes)
 *  - administerAntidote(actorId, antidotePower, targetToxinType)
 *  - getActorToxinStatus(actorId)
 *  - resetAll()
 *  - diagnose()
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  WA.engines = WA.engines || {};

  const VERSION = '2.330.0';

  const VALID_TOXIN_TYPES = Object.freeze([
    'neuro_paralysis',
    'tissue_corrosion',
    'hallucinogen',
    'asphyxiation'
  ]);

  // 基础自然半衰期（分钟）
  const TOXIN_HALF_LIVES = Object.freeze({
    neuro_paralysis: 60.0,
    tissue_corrosion: 45.0,
    hallucinogen: 30.0,
    asphyxiation: 15.0
  });

  // 角色体内毒素台账: Map<actorId, Map<toxinType, { concentration, peakDose, stage, lastTick }>>
  const _actorToxins = new Map();

  function _ensureActorToxins(actorId) {
    if (!_actorToxins.has(actorId)) {
      _actorToxins.set(actorId, new Map());
    }
    return _actorToxins.get(actorId);
  }

  function _calcStage(concentration) {
    if (concentration <= 0) return 'none';
    if (concentration < 25) return 'mild';
    if (concentration < 60) return 'moderate';
    if (concentration < 90) return 'severe';
    return 'lethal';
  }

  /**
   * 角色染毒/注入毒素
   */
  function applyToxin(actorId, toxinType, dose, opts) {
    if (!actorId || typeof actorId !== 'string') {
      return { ok: false, error: 'invalid_actor_id' };
    }
    if (!VALID_TOXIN_TYPES.includes(toxinType)) {
      return { ok: false, error: 'invalid_toxin_type', validTypes: VALID_TOXIN_TYPES };
    }
    const d = typeof dose === 'number' ? Math.max(0, dose) : 0;
    if (d <= 0) {
      return { ok: false, error: 'invalid_dose_must_be_positive' };
    }

    const tMap = _ensureActorToxins(actorId);
    let record = tMap.get(toxinType);
    if (!record) {
      record = {
        toxinType: toxinType,
        concentration: 0.0,
        peakDose: 0.0,
        stage: 'none',
        lastTick: clockNow('toxic-metabolism')
      };
      tMap.set(toxinType, record);
    }

    // 叠加毒素浓度 (上限 100)
    record.concentration = Math.min(100.0, Math.round((record.concentration + d) * 10) / 10);
    record.peakDose = Math.max(record.peakDose, record.concentration);
    record.stage = _calcStage(record.concentration);
    record.lastTick = clockNow('toxic-metabolism');

    // 计算即时机能减损判定
    const penalty = {
      agilityPenalty: toxinType === 'neuro_paralysis' ? record.concentration * 0.008 : 0,
      vitalityDrain: toxinType === 'tissue_corrosion' ? record.concentration * 0.15 : 0,
      hallucinationDistortion: toxinType === 'hallucinogen' ? record.concentration >= 25 : false,
      staminaLockout: toxinType === 'asphyxiation' ? record.concentration >= 60 : false
    };

    return {
      ok: true,
      actorId: actorId,
      toxinType: toxinType,
      concentration: record.concentration,
      stage: record.stage,
      penalty: penalty
    };
  }

  /** 历史缺省 tick 分钟（调用方既没给分钟数、也没给正文证据时用）。 */
  const DEFAULT_MINUTES = 15.0;
  /** clock 档的天然上界：一天。超过它说明中间断档太久，按一天结算而不是无限吃满。 */
  const MINUTES_CAP_DAY = 1440;
  /**
   * 分钟数的**来源分级**（v2.542.14）。
   *
   *   此前 metabolize 的签名只有 (actorId, elapsedMinutes)，缺省一律 15.0：于是
   *   「正文里根本没写过多久」与「正文写了三小时」在算术上完全同形 —— 这正是
   *   engines/elapsed-evidence.js 存在的理由（它自己的注释就点名了本引擎持有
   *   已算好的 deltaMinutes、却从不从正文明文取时长）。
   *
   *   本函数把三档来源**显式分开**，只在调用方给出正文证据时才引入解析：
   *     caller   调用方给了正数分钟 → 原样采用（与旧版逐字等价）
   *     evidence 调用方给了 text/evidence → 由 elapsedEvidence 判「这句话能不能当依据」
   *     default  两者都没给 → 用 DEFAULT_MINUTES，并如实把来源标出来
   *
   *   证据在场但判不出来时**不回落 default**：回 { ok:false, reason }，让调用方看见拒绝。
   *   理由：回落默认值会把「时间未确证」悄悄变成「过了 15 分钟」，与本仓
   *   「压下项必须可见」纪律直接冲突。
   */
  function resolveMinutes(elapsedMinutes, opts, tMap) {
    const o = opts || {};
    const want = (typeof elapsedMinutes === 'number' && isFinite(elapsedMinutes) && elapsedMinutes > 0)
      ? elapsedMinutes : null;
    if (want !== null) return { ok: true, minutes: want, source: 'caller', reason: 'ok', clause: '' };
    const text = (typeof o.text === 'string' && o.text) ? o.text
      : ((typeof o.source === 'string' && o.source) ? o.source : '');
    const ev = typeof o.evidence === 'string' ? o.evidence : '';
    if (!text && !ev) {
      // ── clock 档（v2.542.15）：引擎自己一直记着每条毒素的 lastTick（77/95/199 三处写），
      //    却从不用它算间隔 —— 缺省一律 15 分钟。而「上次 tick 到现在真的过了多久」是可测的，
      //    比常量准得多，也和 engines/mood-glide.js 的 `now - cur.at` 同一条口径。
      //    只在**每条**毒素都能算出有限非负 dt 时启用；缺一条就整档不用（不做部分推算）。
      let oldest = null;
      let allHave = true;
      if (tMap && typeof tMap.forEach === 'function') {
        tMap.forEach(function (rec) {
          const t = rec && rec.lastTick;
          if (!(typeof t === 'number' && isFinite(t))) { allHave = false; return; }
          if (oldest === null || t < oldest) oldest = t;
        });
      }
      if (allHave && oldest !== null) {
        const now = clockNow('toxic-metabolism');
        const dt = (now - oldest) / 60000;
        if (isFinite(dt) && dt >= 0) {
          return {
            ok: true, minutes: Math.min(dt, MINUTES_CAP_DAY), source: 'clock',
            reason: 'ok', clause: '', note: 'from lastTick'
          };
        }
      }
      return { ok: true, minutes: DEFAULT_MINUTES, source: 'default', reason: 'ok', clause: '', note: 'no elapsed given' };
    }
    const EE = WA.elapsedEvidence;
    if (!EE || typeof EE.parse !== 'function') {
      // 证据面本身缺失（基础设施降级）⇒ 退回历史默认，**不让代谢停摆**，并把降级原因标出来。
      //   v2.542.14：这一档刻意不产出新的拒收码 —— 「依赖没装」不是世界语义上的拒绝，
      //   拿它当拒绝会让毒素永远不衰减；但也不能假装证据判过了，故 source 仍报 'default'。
      return { ok: true, minutes: DEFAULT_MINUTES, source: 'default', reason: 'ok', clause: '', note: 'elapsedEvidence missing' };
    }
    let r;
    if (typeof o.deltaMinutes === 'number' && ev && typeof EE.verify === 'function') {
      // 调用方既给了声称的分钟数、又给了证据原文 ⇒ 走最硬的双重校验。
      const v = EE.verify(text, ev, o.deltaMinutes);
      r = { ok: !!v.ok, minutes: v.actual, reason: v.reason, clause: v.clause };
    } else {
      // 只有正文：判「这段文字本身是不是一个确凿的时长」。
      const p = EE.parse(text);
      r = { ok: !!p.ok, minutes: p.minutes, reason: p.reason, clause: p.anchor || '' };
    }
    if (!r.ok) {
      return { ok: false, minutes: null, source: 'evidence', reason: r.reason || 'not-fact', clause: r.clause || '' };
    }
    return { ok: true, minutes: r.minutes, source: 'evidence', reason: 'ok', clause: r.clause || '' };
  }
  /**
   * 角色生理半衰期自然代谢演化
   *
   *   v2.542.14：第三参 opts（`{text|source, evidence, deltaMinutes}`）。
   *   不给 opts 时行为与旧版逐字一致（caller / default 两档）。
   *   给了正文证据时，分钟数必须由证据推出；推不出就返回 ok:false + reason。
   */
  function metabolize(actorId, elapsedMinutes, opts) {
    if (!actorId || typeof actorId !== 'string') {
      return { ok: false, error: 'invalid_actor_id' };
    }
    const tMap = _actorToxins.get(actorId);
    if (!tMap || tMap.size === 0) {
      return { ok: true, actorId: actorId, activeToxins: [], clearedAll: true };
    }

    const rm = resolveMinutes(elapsedMinutes, opts, tMap);
    if (!rm.ok) {
      return {
        ok: false, actorId: actorId, reason: rm.reason,
        minutesSource: rm.source, evidenceClause: rm.clause
      };
    }
    const minutes = rm.minutes;
    const results = [];

    for (const [tType, rec] of tMap.entries()) {
      const halfLife = TOXIN_HALF_LIVES[tType] || 45.0;
      // 指数衰减方程: C(t) = C0 * 0.5 ^ (t / halfLife)
      const decayFactor = Math.pow(0.5, minutes / halfLife);
      rec.concentration = Math.max(0.0, Math.round(rec.concentration * decayFactor * 10) / 10);
      rec.stage = _calcStage(rec.concentration);
      rec.lastTick = clockNow('toxic-metabolism');

      results.push({
        toxinType: tType,
        concentration: rec.concentration,
        stage: rec.stage
      });

      if (rec.concentration <= 0.0) {
        tMap.delete(tType);
      }
    }

    return {
      ok: true,
      actorId: actorId,
      elapsedMinutes: minutes,
      minutesSource: rm.source,
      evidenceClause: rm.clause,
      toxinStatus: results,
      totalActiveToxins: tMap.size
    };
  }

  /**
   * 服用解药进行靶向中和
   */
  function administerAntidote(actorId, antidotePower, targetToxinType) {
    if (!actorId || typeof actorId !== 'string') {
      return { ok: false, error: 'invalid_actor_id' };
    }
    const power = typeof antidotePower === 'number' ? Math.max(0, antidotePower) : 0;
    if (power <= 0) {
      return { ok: false, error: 'invalid_antidote_power' };
    }

    const tMap = _actorToxins.get(actorId);
    // 负控制拦截：无毒角色服用解药，指标绝不受损，绝不溢出负数毒性
    if (!tMap || tMap.size === 0) {
      return {
        ok: true,
        actorId: actorId,
        neutralizedDose: 0,
        message: 'actor_has_no_active_toxins',
        healthy: true
      };
    }

    let neutralizedTotal = 0;
    if (targetToxinType) {
      if (tMap.has(targetToxinType)) {
        const rec = tMap.get(targetToxinType);
        const prev = rec.concentration;
        rec.concentration = Math.max(0.0, Math.round((rec.concentration - power) * 10) / 10);
        neutralizedTotal = Math.round((prev - rec.concentration) * 10) / 10;
        rec.stage = _calcStage(rec.concentration);
        if (rec.concentration <= 0.0) tMap.delete(targetToxinType);
      } else {
        neutralizedTotal = 0;
      }
    } else {
      // 广谱解药中和所有毒素
      for (const [tType, rec] of tMap.entries()) {
        const prev = rec.concentration;
        rec.concentration = Math.max(0.0, Math.round((rec.concentration - power) * 10) / 10);
        neutralizedTotal += Math.round((prev - rec.concentration) * 10) / 10;
        rec.stage = _calcStage(rec.concentration);
        if (rec.concentration <= 0.0) tMap.delete(tType);
      }
    }

    return {
      ok: true,
      actorId: actorId,
      neutralizedDose: neutralizedTotal,
      remainingToxinsCount: tMap.size
    };
  }

  /**
   * 查询角色当前毒理状态
   */
  function getActorToxinStatus(actorId) {
    if (!actorId || !_actorToxins.has(actorId)) {
      return { ok: true, actorId: actorId, toxins: [], highestStage: 'none' };
    }
    const tMap = _actorToxins.get(actorId);
    const list = [];
    let highestStage = 'none';
    const stageRank = { none: 0, mild: 1, moderate: 2, severe: 3, lethal: 4 };

    for (const rec of tMap.values()) {
      list.push(Object.assign({}, rec));
      if (stageRank[rec.stage] > stageRank[highestStage]) {
        highestStage = rec.stage;
      }
    }

    return {
      ok: true,
      actorId: actorId,
      toxins: list,
      highestStage: highestStage
    };
  }

  function resetAll() {
    _actorToxins.clear();
    return { ok: true, reset: true };
  }

  const engine = {
    version: VERSION,
    VALID_TOXIN_TYPES: VALID_TOXIN_TYPES,
    applyToxin: applyToxin,
    metabolize: metabolize,
    administerAntidote: administerAntidote,
    getActorToxinStatus: getActorToxinStatus,
    resetAll: resetAll,
    diagnose: function () {
      return {
        ok: true,
        poisonedActorsCount: _actorToxins.size,
        version: VERSION
      };
    }
  };

  WA.engines.toxicMetabolism = engine;
  WA.toxicMetabolism = engine;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
})();
/**
 * WorldAxis engines/epochal-transition.js (v2.380.0)
 * EXV20-1: 宏观历史突变与文明纪元跃迁引擎 (Macro-Historical Rupture & Civilized Epoch Transition)
 *
 * ── 核心架构哲学（Genre-Neutral Architecture）─────────────────────────
 * 无论古风王朝更迭、修仙纪元末劫、废土核冬天还是赛博企业联合体解体，统一抽象为四维危机熵累积模型：
 *  1. 四维微观危机因子聚合：
 *     - 粮荒与围城断粮（attritionCrisis, 0~100）
 *     - 恶性疫病与生化蔓延（epidemicCrisis, 0~100）
 *     - 统治中枢被刺与法统崩溃（regicideCrisis, 0~100）
 *     - 商业破产与民怨民愤（unrestCrisis, 0~100）
 *  2. 临界突变点判定：
 *     - 当综合危机熵（crisisEntropy）突破临界阈值（默认 75），触发不可逆的“文明纪元跃迁”；
 *     - 跃迁为：'anarchy_fracture' (群雄割据/军阀乱世), 'dark_plague_age' (黑死枯萎纪), 
 *              'warlord_collapse' (王朝瓦解), 'renaissance_reconstruction' (浴火重建)
 *  3. 破坏性负控制与状态持久化：
 *     - 微观危机总值不足阈值（<75）时强行跃迁文明纪元必须严格驳回（refusal: 'crisis-entropy-subcritical'）；
 *     - 纪元跃迁后持久化写入 store.epochalHistory 台账并对外发布 'epochal:transition' 事件。
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  WA.engines = WA.engines || {};
  const VERSION = '2.380.0';
  const LS_KEY = 'worldaxis_epochal_transition_settings_v1';

  const DEF = {
    enabled: true,
    crisisThreshold: 75,
    maxHistory: 20
  };

  let stat = {
    evaluations: 0,
    transitionsTriggered: 0,
    refusals: 0,
    lastReason: ''
  };

    const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'epochalTransition'
  };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return Object.assign({}, DEF, raw || {});
  }

  function saveSettings(next) {
    if (WA.settingsBus && typeof WA.settingsBus.saveOrThrow === 'function') {
      return WA.settingsBus.saveOrThrow(__REG, Object.assign({}, DEF, next || {}));
    }
    return Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function cleanStr(s, max) { return String(s || '').trim().slice(0, max || 60); }
  function clamp(v, min, max) { const n = Number(v); if (isNaN(n)) return min; return Math.max(min, Math.min(max, n)); }
  function clockNow(site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } }
  function noteFault(r) { stat.refusals++; stat.lastReason = String(r || 'unknown'); }

  function getEpochStore(draft) {
    const target = draft || (WA.store ? WA.store.get() : null);
    if (!target) return null;
    if (!target.epochalTransition || typeof target.epochalTransition !== 'object') {
      if (draft) target.epochalTransition = { currentEpoch: 'flourishing_dynasty', epochTurn: 1, history: [] };
      return draft ? target.epochalTransition : null;
    }
    return target.epochalTransition;
  }

  /**
   * 核心评估与跃迁写口：evaluateEpochShift
   */
  function evaluateEpochShift(crisisFactors, opts) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    crisisFactors = crisisFactors || {};
    opts = opts || {};
    stat.evaluations++;

    const attrition = clamp(crisisFactors.attritionCrisis || 0, 0, 100);
    const epidemic = clamp(crisisFactors.epidemicCrisis || 0, 0, 100);
    const regicide = clamp(crisisFactors.regicideCrisis || 0, 0, 100);
    const unrest = clamp(crisisFactors.unrestCrisis || 0, 0, 100);

    // 综合危机熵加权计算
    const crisisEntropy = Math.round(attrition * 0.25 + epidemic * 0.25 + regicide * 0.3 + unrest * 0.2);
    const threshold = settings().crisisThreshold;

    // 破坏性负控制：危机熵未达临界阈值强行触发文明纪元崩溃/跃迁一律驳回
    if (crisisEntropy < threshold && !opts.force) {
      noteFault('crisis-entropy-subcritical');
      return {
        ok: false,
        refusal: 'crisis-entropy-subcritical',
        crisisEntropy: crisisEntropy,
        threshold: threshold,
        reason: '当前社会微观危机熵为 ' + crisisEntropy + '，未突破崩溃临界阈值 ' + threshold + '，文明秩序依然稳固，严禁触发宏观纪元跃迁！'
      };
    }

    // 判定突变跃迁的新纪元形态
    let targetEpoch = 'anarchy_fracture';
    if (epidemic >= 80) targetEpoch = 'dark_plague_age';
    else if (regicide >= 80) targetEpoch = 'warlord_collapse';
    else if (attrition >= 80) targetEpoch = 'wasteland_famine';

    let result = null;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const epStore = getEpochStore(draft);
        if (!epStore) {
          result = { ok: false, reason: 'no-epoch-store' };
          return false;
        }
        const prevEpoch = epStore.currentEpoch;
        const now = clockNow('epochalTransition');
        epStore.currentEpoch = targetEpoch;
        epStore.epochTurn = (epStore.epochTurn || 1) + 1;
        const record = {
          transitionId: 'ep_' + now,
          fromEpoch: prevEpoch,
          toEpoch: targetEpoch,
          crisisEntropy: crisisEntropy,
          factors: { attrition: attrition, epidemic: epidemic, regicide: regicide, unrest: unrest },
          timestamp: now
        };
        epStore.history = epStore.history || [];
        epStore.history.unshift(record);
        if (epStore.history.length > settings().maxHistory) epStore.history.pop();
        stat.transitionsTriggered++;

        result = {
          ok: true,
          transitioned: true,
          fromEpoch: prevEpoch,
          toEpoch: targetEpoch,
          crisisEntropy: crisisEntropy,
          narrative: '【宏观历史剧变】多重危机共振击穿阈值（危机熵 ' + crisisEntropy + '）！「' + prevEpoch + '」彻底终结，世界正式步入「' + (targetEpoch === 'dark_plague_age' ? '黑死枯萎纪 (dark_plague_age)' : (targetEpoch === 'warlord_collapse' ? '王朝瓦解 (warlord_collapse)' : targetEpoch)) + '」新纪元！'
        };
      }, 'epochalTransition:evaluateEpochShift');
    }

    if (result && result.ok && WA.emit) {
      try { WA.emit('epochal:transition', result); } catch (e) {}
    }

    return result || { ok: false, reason: 'transact-failed' };
  }

  function view() {
    const store = getEpochStore();
    return {
      ok: true,
      enabled: settings().enabled,
      currentEpoch: store ? store.currentEpoch : 'unknown',
      epochTurn: store ? store.epochTurn : 1,
      history: store ? store.history.slice(0, 5) : []
    };
  }

  function buildBlock() {
    if (!settings().enabled) return '';
    const store = getEpochStore();
    if (!store || !store.currentEpoch || store.currentEpoch === 'flourishing_dynasty') return '';
    return '【历史纪元大潮】当前世界已步入「' + store.currentEpoch + '」纪元（历经 ' + store.epochTurn + ' 代跃迁）。社会秩序受微观危机瓦解重塑。';
  }

  function statView() {
    return Object.assign({}, stat, {
      enabled: settings().enabled,
      currentEpoch: (getEpochStore() || {}).currentEpoch || 'none'
    });
  }

  WA.epochalTransition = {
    settings: settings,
    saveSettings: saveSettings,
    evaluateEpochShift: evaluateEpochShift,
    view: view,
    statView: statView,
    buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat); }
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/epochal-transition.js', { kind: 'engine', ver: VERSION });
  }
})();

/**
 * WorldAxis engines/psyche-dissociation.js (v2.408.0) — EXV23-3 深层心智解离、创伤闪回与记忆虚构
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   G3 实测：心智/人格/精神模块中，缺乏创伤闪回（Flashback）、偏执妄想、
 *   现实检验扭曲与记忆虚构（Confabulation）动力学。角色受创后无潜意识扭曲表现。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `psycheDissociation.triggerTraumaShock` 植入创伤源；
 *   `psycheDissociation.evaluateSanityFringe` 判定当前是否诱发闪回或认知扭曲；
 *   `psycheDissociation.confabulateMemory` 在受到盘问时，生成偏执而自洽的虚构事实。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 无创伤来源的角色强行闪回被拦截（refusal: no-anchored-trauma-origin）。
 *   ② 虚构记忆仅作为局部心理滤镜，不覆写真实权威 store.worldFacts。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_psyche_dissociation_settings_v1';
  const DEF = {
    enabled: true,
    traumaFlashbackThreshold: 60,
    paranoiaThreshold: 50
  };

  const __REG = {
    module: 'psycheDissociation',
    key: 'psycheDissociation',
    name: '心智解离与虚构记忆 (EXV23-3)',
    desc: '深度精神创伤、闪回应激与偏执虚构记忆动力学',
    settingsKey: LS_KEY,
    schema: {
      enabled: { type: 'boolean', default: true },
      traumaFlashbackThreshold: { type: 'number', default: 60 },
      paranoiaThreshold: { type: 'number', default: 50 }
    }
  };
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  let STATE = null;

  let stat = null;

  function settings() {
    // v2.408.0（OPV23-9 回归逮到）：本函数此前调 `WA.settingsBus.getModuleSettings(key, DEF)` ——
    //   该成员在 settingsBus 的真实导出面上**不存在**（真实读口是 `read(reg)`）。
    //   因为带 `typeof === 'function'` 守卫，调用**静默落空**：本引擎的开关恒等于 DEF，
    //   「关闭引擎」这件事在宿主里从来没生效过。它是 HEAD 上就存在的预存缺陷
    //   （tests/gates.js / member-surface-gate / settings-bus-api-gate 三处同时点名），
    //   不是本批引入；本批按既有库内口径修正（与 engines/affect.js 逐字同规）。
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus
      ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }

  /** v2.409.0: 时钟守卫（**单行式**，声明与 fallback 同行共现）。
   *  旧写法是跨四行的 `if (WA.clock && ...) return WA.clock.now(); return Date.now();` ——
   *  语义对（兜底不裸调），但右侧不在**同一行**，v2.22.0 的静态判据只认「同行有 WA.clock.」
   *  这一事实（守卫 vs 绕过的区别正在于它），于是 9 个模块的合法兜底全被归到裸调。
   *  改成本仓既有的单行式（intel/life/coop 等 12 个引擎同款），并补站点名 —— 站点名让
   *  「冻结之后时间还从哪漏」能定位到具体引擎。 */
  function clockNow(site) { try { return WA.clock.now(site || 'psyche-dissociation'); } catch (e) { return Date.now(); } }

  function ensureActor(actorId) {
    if (!STATE.actors[actorId]) {
      STATE.actors[actorId] = {
        traumaIndex: 0,
        traumaOrigin: '',
        triggers: [],
        activeFlashback: false,
        paranoiaLevel: 0
      };
    }
  }

  function triggerTraumaShock(actorId, shockSpec) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, refusal: 'psyche-dissociation-disabled' };
    if (!actorId) return { ok: false, refusal: 'missing-actor-id' };
    ensureActor(actorId);

    const s = shockSpec || {};
    const severity = Math.max(1, Math.min(100, Number(s.severity) || 30));
    const origin = String(s.origin || 'unspecified-horror');
    const trigs = Array.isArray(s.triggers) ? s.triggers : [origin];

    const st = STATE.actors[actorId];
    st.traumaIndex = Math.min(100, st.traumaIndex + severity);
    st.traumaOrigin = origin;
    trigs.forEach(function (t) {
      if (!st.triggers.includes(t)) st.triggers.push(t);
    });
    st.paranoiaLevel = Math.min(100, st.paranoiaLevel + Math.floor(severity * 0.7));

    stat.traumasInflicted++;
    return {
      ok: true,
      actorId: actorId,
      traumaIndex: st.traumaIndex,
      paranoiaLevel: st.paranoiaLevel,
      origin: origin,
      at: clockNow()
    };
  }

  function evaluateSanityFringe(actorId, sensoryStimulus) {
    ensureActor(actorId);
    const st = STATE.actors[actorId];
    if (st.traumaIndex <= 0 && (!st.triggers || st.triggers.length === 0)) {
      return {
        ok: false,
        refusal: 'no-anchored-trauma-origin',
        hint: '该角色不存在锚定精神创伤，无法诱发闪回解离'
      };
    }

    const stim = String(sensoryStimulus || '');
    const matched = st.triggers.some(function (t) { return stim.includes(t); });
    const isFlashback = matched || (st.traumaIndex >= DEF.traumaFlashbackThreshold);

    st.activeFlashback = isFlashback;
    if (isFlashback) stat.flashbacksTriggered++;

    return {
      ok: true,
      actorId: actorId,
      activeFlashback: isFlashback,
      paranoiaLevel: st.paranoiaLevel,
      projectedHostility: st.paranoiaLevel >= DEF.paranoiaThreshold,
      distortionFilter: isFlashback ? ('flashback-to:' + st.traumaOrigin) : 'lucid',
      at: clockNow()
    };
  }

  function confabulateMemory(actorId, queryTopic) {
    ensureActor(actorId);
    const st = STATE.actors[actorId];
    if (st.traumaIndex < 20 && st.paranoiaLevel < 20) {
      return { ok: false, refusal: 'mind-too-lucid-to-confabulate' };
    }
    stat.confabulationsGenerated++;
    return {
      ok: true,
      actorId: actorId,
      queryTopic: queryTopic,
      confabulation: '虚构认知：关于[' + queryTopic + ']的记忆已被偏执扭曲为[' + st.traumaOrigin + ']的同谋线索',
      reliability: 0.15,
      at: clockNow()
    };
  }

  function reset() {
    STATE.actors = {};
    stat.traumasInflicted = 0;
    stat.flashbacksTriggered = 0;
    stat.confabulationsGenerated = 0;
    return { ok: true };
  }

  function ownerCall(fn, args, readOnly) {
    if (!WA.store || typeof WA.store.withOwnerState !== 'function') return { ok: false, refusal: 'owner-store-unavailable' };
    return WA.store.withOwnerState('psycheDissociation', function (owned) {
      const prevState = STATE, prevStat = stat;
      STATE = owned; stat = owned._stats;
      try { return fn.apply(null, args); }
      finally { STATE = prevState; stat = prevStat; }
    }, { readOnly: readOnly });
  }

  WA.psycheDissociation = {
    triggerTraumaShock: function () { return ownerCall(triggerTraumaShock, arguments, false); },
    evaluateSanityFringe: function () { return ownerCall(evaluateSanityFringe, arguments, false); },
    confabulateMemory: function () { return ownerCall(confabulateMemory, arguments, false); },
    reset: function () { return ownerCall(reset, arguments, false); },
    getSettings: settings
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/psyche-dissociation.js', { kind: 'engine', ver: '2.408.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/psyche-dissociation 已加载（2.408.0）');
  }
})();
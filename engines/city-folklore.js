/**
 * WorldAxis engines/city-folklore.js (v2.304.0) — EXV13-6 城市风俗禁忌与集体祭典狂欢日
 *
 * ── 核心业务职责 ──────────────────────────────────────────
 *   1. 城市节点特定风俗与禁忌宣告（proclaimTaboo / activateFestival）：
 *      为城邦/地点绑定传承性的历史禁忌（如静默祭日全城禁火、工坊禁锻、肃静禁言）；
 *   2. 违禁动作审查与公愤裁决（checkTabooViolation）：
 *      在禁忌生效期内尝试执行违禁动作（如开炉锻造），将面临市政巡查与民意公愤惩罚；
 *   3. 狂欢节庆声学掩蔽（maskWithFestivity）：
 *      在风俗祭典狂欢时刻，利用全城锣鼓狂欢或烟花爆发的背景噪音掩盖工坊违规噪音，
 *      实现瞒天过海完成紧急工单交付。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) {
    try { return WA.clock.now(site); } catch (e) { return Date.now(); }
  };

  const LS_KEY = 'worldaxis_city_folklore_settings_v1';
  const DEF = { enabled: true, maxTaboos: 40 };
  const __REG = { key: LS_KEY, def: DEF, module: 'cityFolklore', bounds: {} };

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

  function ensure(draft) {
    draft.cityFolklore = draft.cityFolklore && typeof draft.cityFolklore === 'object' && !Array.isArray(draft.cityFolklore)
      ? draft.cityFolklore : { taboos: [], violations: [] };
    if (!Array.isArray(draft.cityFolklore.taboos)) draft.cityFolklore.taboos = [];
    if (!Array.isArray(draft.cityFolklore.violations)) draft.cityFolklore.violations = [];
    return draft.cityFolklore;
  }

  const _stat = {
    taboosProclaimed: 0,
    violationsChecked: 0,
    violationsBlocked: 0,
    maskedEvaded: 0,
    refused: 0,
    lastReason: ''
  };

  /**
   * 1. 宣告城市风俗禁忌与祭典
   */
  function proclaimTaboo(spec) {
    const s = spec || {};
    const tid = clean(s.tabooId || s.id, 50);
    const loc = clean(s.locationId || s.location || 'city_center', 50);
    const name = clean(s.name || s.title, 60);
    const prohibitedActions = Array.isArray(s.prohibitedActions)
      ? s.prohibitedActions.map(function (a) { return clean(a, 40); }).filter(Boolean)
      : [clean(s.prohibitedAction || 'forge_metal', 40)];

    if (!tid || !name) {
      _stat.refused++;
      _stat.lastReason = 'missing-taboo-fields';
      return { ok: false, reason: 'missing-taboo-fields' };
    }

    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const existing = bag.taboos.find(function (t) { return t.tabooId === tid; });
      if (existing) {
        out = { ok: false, reason: 'already-exists', tabooId: tid };
        return false;
      }

      const now = clockNow('cityFolklore');
      const item = {
        tabooId: tid,
        locationId: loc,
        name: name,
        prohibitedActions: prohibitedActions,
        active: s.active !== false,
        festivityLevel: typeof s.festivityLevel === 'number' ? s.festivityLevel : 80,
        inspectionRisk: typeof s.inspectionRisk === 'number' ? s.inspectionRisk : 75,
        wrathPenalty: typeof s.wrathPenalty === 'number' ? s.wrathPenalty : 35,
        createdAt: now,
        updatedAt: now
      };

      bag.taboos.push(item);
      out = { ok: true, taboo: JSON.parse(JSON.stringify(item)) };
      return true;
    }, 'cityFolklore:proclaimTaboo');

    if (out && out.ok) {
      _stat.taboosProclaimed++;
      _stat.lastReason = 'taboo_proclaimed';
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 2. 审查违禁动作
   */
  function checkTabooViolation(locationId, actionType, opts) {
    const loc = clean(locationId, 50);
    const act = clean(actionType, 40);
    const o = opts || {};
    _stat.violationsChecked++;

    const bag = ensure(state());
    const hitTaboo = bag.taboos.find(function (t) {
      return t.active && t.locationId === loc && t.prohibitedActions.indexOf(act) >= 0;
    });

    if (!hitTaboo) {
      return { ok: true, violated: false, message: '当前地点与行动未触犯任何活跃风俗禁忌' };
    }

    // 若已经有被节庆掩盖标志
    if (o.masked === true) {
      return {
        ok: true,
        violated: false,
        masked: true,
        tabooId: hitTaboo.tabooId,
        message: '虽违规操作，但被全城祭典狂欢声响成功掩盖，未被市政巡查察觉！'
      };
    }

    _stat.violationsBlocked++;
    _stat.lastReason = 'taboo_violated';
    return {
      ok: false,
      violated: true,
      reason: 'taboo_violated',
      tabooId: hitTaboo.tabooId,
      tabooName: hitTaboo.name,
      prohibitedAction: act,
      inspectionRisk: hitTaboo.inspectionRisk,
      wrathPenalty: hitTaboo.wrathPenalty,
      message: '行动触犯【' + hitTaboo.name + '】风俗禁忌，将引来市政巡查扣押与市民公愤！'
    };
  }

  /**
   * 3. 节庆背景声学掩蔽（利用狂欢声掩盖违规工作噪音）
   */
  function maskWithFestivity(noiseLevel, festivityLoudness, opts) {
    const noise = typeof noiseLevel === 'number' ? noiseLevel : 60;
    const loud = typeof festivityLoudness === 'number' ? festivityLoudness : 80;
    const o = opts || {};
    const noiseType = clean(o.noiseType || 'forge_hammering', 40);

    const diff = loud - noise;
    const success = diff >= 0;

    if (success) {
      _stat.maskedEvaded++;
      _stat.lastReason = 'masked_evaded';
      return {
        ok: true,
        evadedInspection: true,
        maskingRatio: Math.min(1.0, (loud / (noise || 1))),
        ambientDecibel: loud,
        workplaceNoise: noise,
        noiseType: noiseType,
        message: '全城祭典狂欢鼓乐与烟火轰鸣（' + loud + 'dB）完美掩盖了工坊开炉锻造噪音（' + noise + 'dB）！'
      };
    } else {
      return {
        ok: true,
        evadedInspection: false,
        maskingRatio: (loud / (noise || 1)),
        shortfall: noise - loud,
        message: '工坊作业声响过大，祭典噪音未能完全遮蔽，引起巡查注意！'
      };
    }
  }

  function getTaboo(id) {
    const tid = clean(id, 50);
    const bag = ensure(state());
    const t = bag.taboos.find(function (x) { return x.tabooId === tid; });
    return t ? JSON.parse(JSON.stringify(t)) : null;
  }

  function stat() {
    return Object.assign({}, _stat);
  }

  WA.cityFolklore = {
    proclaimTaboo: proclaimTaboo,
    checkTabooViolation: checkTabooViolation,
    maskWithFestivity: maskWithFestivity,
    getTaboo: getTaboo,
    stat: stat
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/city-folklore.js', { kind: 'engine', ver: '2.304.0' });
  }
})();

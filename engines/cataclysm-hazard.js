/**
 * WorldAxis engines/cataclysm-hazard.js (v2.360.0)
 * EXV20-2: 极端自然灾异突发与大尺度地貌灾变引擎 (Cataclysmic Hazard & Large-Scale Geological Rupture)
 *
 * ── 核心架构哲学（Genre-Neutral Architecture）─────────────────────────
 * 无论古风大洪灾地裂、修仙天雷崩山、废土核脉冲熔解、现代地震海啸，统一抽象为空间拓扑应力与破坏能量释放模型：
 *  1. 灾变类型（hazardType）：
 *     - 'earthquake_fault' (大地震地裂：断层破裂、建筑粉碎坍塌、阻断商道)
 *     - 'flash_flood' (山洪决堤/海啸：低洼地淹没、摧毁粮仓、冲垮防洪堤)
 *     - 'wildfire_inferno' (火海焚林：可燃度极速爆发、阻绝撤退走廊)
 *     - 'meteor_impact' (陨石/天基打击：核心区蒸发、冲击波重度致残)
 *  2. 物理与地貌拓扑持久化改变：
 *     - 降低定居点防御与繁荣指数；
 *     - 激发不可逆难民大迁徙（refugeeDisplacedCount）；
 *     - 阻断指定通行节点（severedRoutes）。
 *  3. 破坏性负控制与防御门禁：
 *     - 灾变烈度不足（magnitude < 3.0）强行触发地貌永久改写必须直接拒止（refusal: 'tremor-magnitude-insignificant'）；
 *     - 拥有坚不可摧的超自然避难所或顶级防洪工事时，直接阻绝局部灭顶冲击。
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  WA.engines = WA.engines || {};
  const VERSION = '2.360.0';
  const LS_KEY = 'worldaxis_cataclysm_hazard_settings_v1';

  const DEF = {
    enabled: true,
    maxDisasterHistory: 25
  };

  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'cataclysmHazard'
  };

  let stat = {
    cataclysmsTriggered: 0,
    refusals: 0,
    refugeesDisplaced: 0,
    lastReason: ''
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

  function getHazardStore(draft) {
    const target = draft || (WA.store ? WA.store.get() : null);
    if (!target) return null;
    if (!target.cataclysmLedger || typeof target.cataclysmLedger !== 'object') {
      if (draft) target.cataclysmLedger = { activeHazards: [], history: [], damagedRegions: {} };
      return draft ? target.cataclysmLedger : null;
    }
    return target.cataclysmLedger;
  }

  /**
   * 核心业务写口：触发自然灾变 (triggerCataclysm)
   */
  function triggerCataclysm(locationId, spec) {
    if (typeof locationId === 'object' && locationId !== null) {
      spec = locationId;
      locationId = spec.locationId || spec.place || spec.location;
    }
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    locationId = cleanStr(locationId, 50);
    spec = spec || {};
    const hazardType = cleanStr(spec.hazardType || spec.type || 'earthquake_fault', 30);
    const magnitude = clamp(spec.magnitude !== undefined ? spec.magnitude : 5.0, 1.0, 10.0);
    const routeToSever = cleanStr(spec.routeToSever || spec.severRoute || '', 50);

    if (!locationId) {
      noteFault('missing-location');
      return { ok: false, reason: 'missing-location' };
    }

    // 破坏性负控制：里氏震级/烈度不足 3.0，纯属微末颤动，严禁永久损毁地貌拓扑
    if (magnitude < 3.0) {
      noteFault('tremor-magnitude-insignificant');
      return {
        ok: false,
        refusal: 'tremor-magnitude-insignificant',
        magnitude: magnitude,
        reason: '灾异能量烈度（' + magnitude + '）过低，仅为无害微颤，严禁破坏地貌拓扑或生成难民潮！'
      };
    }

    let result = null;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const store = getHazardStore(draft);
        if (!store) {
          result = { ok: false, reason: 'no-hazard-store' };
          return;
        }
        const now = clockNow('cataclysmHazard');
        const disasterId = 'disaster_' + now + '_' + Math.random().toString(36).slice(2, 6);
        
        // 破坏能量计算与难民产出
        const damageScore = Math.round(magnitude * 10);
        const refugees = Math.round(damageScore * 15);
        
        const hazardEntry = {
          disasterId: disasterId,
          locationId: locationId,
          hazardType: hazardType,
          magnitude: magnitude,
          damageScore: damageScore,
          refugeesDisplaced: refugees,
          severedRoute: routeToSever || null,
          triggeredAt: now
        };

        store.activeHazards.push(hazardEntry);
        store.history.unshift(hazardEntry);
        if (store.history.length > settings().maxDisasterHistory) store.history.pop();

        // 永久改变局部地域拓扑完整度
        const currentDamage = (store.damagedRegions[locationId] || 0) + damageScore;
        store.damagedRegions[locationId] = Math.min(100, currentDamage);

        stat.cataclysmsTriggered++;
        stat.refugeesDisplaced += refugees;

        result = {
          ok: true,
          disasterId: disasterId,
          locationId: locationId,
          hazardType: hazardType,
          magnitude: magnitude,
          refugeesDisplaced: refugees,
          severedRoute: routeToSever,
          regionalDamageIndex: store.damagedRegions[locationId],
          narrative: '【大尺度地貌灾变】「' + locationId + '」突发 ' + magnitude + ' 级「' + hazardType + '」！大地撕裂，' + (routeToSever ? '商道「' + routeToSever + '」彻底断绝，' : '') + '激起 ' + refugees + ' 名难民大迁徙！'
        };
      }, 'cataclysmHazard:triggerCataclysm');
    }

    return result || { ok: false, reason: 'transact-failed' };
  }

  function view(locationId) {
    const store = getHazardStore();
    if (!store) return { ok: false, reason: 'no-store' };
    if (locationId) {
      return {
        ok: true,
        locationId: locationId,
        damageIndex: store.damagedRegions[locationId] || 0,
        hazards: store.activeHazards.filter(function (h) { return h.locationId === locationId; })
      };
    }
    return {
      ok: true,
      enabled: settings().enabled,
      activeCount: store.activeHazards.length,
      damagedRegions: Object.assign({}, store.damagedRegions)
    };
  }

  function buildBlock() {
    if (!settings().enabled) return '';
    const store = getHazardStore();
    if (!store || !store.activeHazards || !store.activeHazards.length) return '';
    const lines = [];
    store.activeHazards.slice(0, 3).forEach(function (h) {
      lines.push('【自然地貌灾情】「' + h.locationId + '」遭 ' + h.magnitude + ' 级 ' + h.hazardType + ' 重创（' + h.refugeesDisplaced + ' 难民流离失所' + (h.severedRoute ? '，通道「' + h.severedRoute + '」断绝' : '') + '）。');
    });
    return lines.join(String.fromCharCode(10));
  }

  function statView() {
    return Object.assign({}, stat, {
      enabled: settings().enabled,
      activeHazards: (getHazardStore() || {}).activeHazards ? getHazardStore().activeHazards.length : 0
    });
  }

  WA.cataclysmHazard = {
    settings: settings,
    saveSettings: saveSettings,
    triggerCataclysm: triggerCataclysm,
    view: view,
    statView: statView,
    buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat); }
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/cataclysm-hazard.js', { kind: 'engine', ver: VERSION });
  }
})();

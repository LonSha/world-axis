/**
 * WorldAxis engines/playable-blueprint.js (v2.231.0) — OP-9 可玩的世界蓝图
 *
 * 核心职责：
 *   蓝图分开保存静态玩法定义、初始条件和可选开场场景。
 *   训练阶段/方法、装备槽/功能模板、配方/设施、研究前置、共同生活规则。
 *   提供三份可直接开局的跨题材样例：城镇工坊与家庭生活、探索聚落、科幻站点。
 *   同一规则可换主题而不是只换名词。
 *
 * 数据与接线：
 *   沿用 worldBlueprint 的导出、预览、导入；只补各 owner 的定义适配。
 *   不导出进行中项目、私有记忆或已知成果进度。
 *   导入明确显示依赖缺失和可选玩法，不自动打开全部引擎。
 *
 * 边界：
 *   1. 不导出进行中项目、私有记忆或已知成果进度。
 *   2. 导入明确显示依赖缺失和可选玩法，不自动打开全部引擎。
 *   3. 禁用一个可选玩法仍可开始基础剧情，玩家不必手填 JSON。
 *   4. 不是角色卡市场、发布平台或公开 API 项目。
 *   5. 三份样例蓝图（城镇工坊/探索聚落/科幻站点）可直接开局且各具名玩法定义确实可用。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60);
  }

  function num(v) {
    var n = Number(v);
    return (typeof n === 'number' && isFinite(n)) ? n : null;
  }

  var THEME_KEYS = ['town-workshop', 'settlement-exploration', 'sci-fi-station'];
  var PLAY_DEF_KEYS = ['training', 'equipment', 'recipe', 'research', 'family-ops'];

  // 三份样例蓝图
  var SAMPLES = [
    {
      id: 'town-workshop',
      label: '城镇工坊与家庭生活',
      theme: 'town-workshop',
      playDefs: {
        training: { method: 'apprenticeship', stages: ['observe', 'assist', 'practice', 'master'] },
        equipment: { slots: ['hand', 'body', 'tool'], templates: ['craftsman', 'merchant'] },
        recipe: { types: ['textile', 'cooking'], facilities: ['workshop', 'kitchen'] },
        research: { enabled: true, prerequisites: ['literacy'] },
        'family-ops': { enabled: true, budgetCycle: 7, gapSolutions: ['hire', 'cover', 'postpone'] }
      },
      initConditions: {
        places: ['town_square', 'workshop', 'market', 'home'],
        factions: [{ name: '工匠协会', type: 'guild' }, { name: '商户会', type: 'guild' }],
        startingResources: { funds: 50, materials: { wood: 10, cloth: 5 } }
      },
      openingScene: { id: 'market-day', label: '集市日开局' },
      requiredEngines: ['training', 'research', 'family-ops'],
      optionalEngines: ['inst', 'customLax']
    },
    {
      id: 'settlement-exploration',
      label: '探索聚落',
      theme: 'settlement-exploration',
      playDefs: {
        training: { method: 'expedition', stages: ['scout', 'pathfinder', 'cartographer'] },
        equipment: { slots: ['hand', 'body', 'pack'], templates: ['explorer', 'guide'] },
        recipe: { types: ['camp', 'trail'], facilities: ['campsite', 'waystation'] },
        research: { enabled: true, prerequisites: ['cartography'] },
        'family-ops': { enabled: false }
      },
      initConditions: {
        places: ['frontier_camp', 'ruins', 'river_crossing', 'lookout'],
        factions: [{ name: '探险者协会', type: 'guild' }],
        startingResources: { funds: 30, materials: { rope: 3, provisions: 10 } }
      },
      openingScene: { id: 'cold-open', label: '事件开局' },
      requiredEngines: ['training', 'research'],
      optionalEngines: ['aftermath-impact', 'service-network']
    },
    {
      id: 'sci-fi-station',
      label: '科幻站点',
      theme: 'sci-fi-station',
      playDefs: {
        training: { method: 'simulation', stages: ['trainee', 'operator', 'specialist'] },
        equipment: { slots: ['hand', 'body', 'augment'], templates: ['technician', 'scientist'] },
        recipe: { types: ['component', 'prototype'], facilities: ['fab-lab', 'lab'] },
        research: { enabled: true, prerequisites: ['base-theory'] },
        'family-ops': { enabled: false }
      },
      initConditions: {
        places: ['station_core', 'lab_wing', 'habitat_deck', 'airlock'],
        factions: [{ name: '站点委员会', type: 'council' }],
        startingResources: { funds: 100, materials: { alloy: 20, electronics: 10 } }
      },
      openingScene: { id: 'blank', label: '空白开局' },
      requiredEngines: ['training', 'research'],
      optionalEngines: ['epistemic-view', 'shared-awareness']
    }
  ];

  /**
   * 列出全部可用样例蓝图。
   */
  function listSamples() {
    return { ok: true, samples: SAMPLES.map(function (s) {
      return { id: s.id, label: s.label, theme: s.theme, openingScene: s.openingScene.label };
    }) };
  }

  /**
   * 获取某样例蓝图的完整定义。
   */
  function getSample(sampleId) {
    var sid = clean(sampleId, 40);
    var s = SAMPLES.filter(function (x) { return x.id === sid; })[0];
    if (!s) return { ok: false, reason: 'sample-not-found', available: SAMPLES.map(function (x) { return x.id; }) };
    return { ok: true, sample: s };
  }

  /**
   * 检查蓝图依赖的引擎是否可用。
   * 返回 missing 列表与 optional 列表。
   */
  function checkDependencies(sampleId) {
    var r = getSample(sampleId);
    if (!r.ok) return r;
    var s = r.sample;
    var missing = [];
    var optional = [];

    (s.requiredEngines || []).forEach(function (e) {
      // 检查 WA 上是否有对应模块
      var available = false;
      var keyMap = {
        'training': 'training', 'research': 'research', 'family-ops': 'familyOps',
        'inst': 'inst', 'customLax': 'customLax',
        'aftermath-impact': 'aftermathImpact', 'service-network': 'serviceNetwork',
        'epistemic-view': 'epistemicView', 'shared-awareness': 'sharedAwareness'
      };
      var waKey = keyMap[e] || e;
      available = !!(WA[waKey]);
      if (!available) missing.push(e);
    });

    (s.optionalEngines || []).forEach(function (e) {
      var keyMap = {
        'training': 'training', 'research': 'research', 'family-ops': 'familyOps',
        'inst': 'inst', 'customLax': 'customLax',
        'aftermath-impact': 'aftermathImpact', 'service-network': 'serviceNetwork',
        'epistemic-view': 'epistemicView', 'shared-awareness': 'sharedAwareness'
      };
      var waKey = keyMap[e] || e;
      var available = !!(WA[waKey]);
      optional.push({ engine: e, available: available });
    });

    return {
      ok: true,
      sampleId: s.id,
      requiredMissing: missing,
      optionalEngines: optional,
      canStart: missing.length === 0,
      note: missing.length > 0 ? '缺少必要引擎：' + missing.join(', ') + '。请先加载对应模块。' : '所有必要引擎已就绪，可以开始。'
    };
  }

  /**
   * 生成可导出的玩法定义摘要（不包含进行中项目、私有记忆或已知成果进度）。
   */
  function exportPlayDefs(sampleId) {
    var r = getSample(sampleId);
    if (!r.ok) return r;
    var s = r.sample;
    return {
      ok: true,
      sampleId: s.id,
      theme: s.theme,
      playDefs: JSON.parse(JSON.stringify(s.playDefs)),
      initConditions: JSON.parse(JSON.stringify(s.initConditions)),
      openingScene: s.openingScene,
      note: '只导出静态玩法定义和初始条件；不导出进行中项目、私有记忆或已知成果进度'
    };
  }

  WA.playableBlueprint = {
    listSamples: listSamples,
    getSample: getSample,
    checkDependencies: checkDependencies,
    exportPlayDefs: exportPlayDefs,
    THEME_KEYS: THEME_KEYS.slice(),
    PLAY_DEF_KEYS: PLAY_DEF_KEYS.slice()
  };

  if (typeof WA.registerModule === 'function') WA.registerModule('engines/playable-blueprint.js', { kind: 'engine', ver: '2.231.0' });
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/playable-blueprint 已加载（2.231.0）');
  }
})();
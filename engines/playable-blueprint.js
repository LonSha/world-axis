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
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const WA = window.WorldAxis = window.WorldAxis || {};

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60);
  }

  function num(v) {
    var n = Number(v);
    return (typeof n === 'number' && isFinite(n)) ? n : null;
  }

  var THEME_KEYS = ['town-workshop', 'settlement-exploration', 'sci-fi-station', 'frontier-scarcity', 'coop-pledge', 'epistemic-city'];
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
        startingResources: { funds: 50, materials: { wood: 10, cloth: 5 } },
        initialPeople: [
          { name: '大师傅', role: 'master', place: 'workshop' },
          { name: '青年学徒', role: 'apprentice', place: 'workshop' }
        ]
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
        startingResources: { funds: 30, materials: { rope: 3, provisions: 10 } },
        initialPeople: [
          { name: '老向导', role: 'explorer', place: 'frontier_camp' },
          { name: '先遣员', role: 'scout', place: 'frontier_camp' }
        ]
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
        startingResources: { funds: 100, materials: { alloy: 20, electronics: 10 } },
        initialPeople: [
          { name: '首席技师', role: 'technician', place: 'fab-lab' },
          { name: '站点操作员', role: 'operator', place: 'station_core' }
        ]
      },
      openingScene: { id: 'blank', label: '空白开局' },
      requiredEngines: ['training', 'research'],
      optionalEngines: ['epistemic-view', 'shared-awareness']
    },
    // ── V3 官方主题开局 (OPV3-9) ──────────────────────────────────────────
    {
      id: 'frontier-scarcity',
      label: '资源紧张的边地聚落',
      theme: 'frontier-scarcity',
      playDefs: {
        recipe: { types: ['forging', 'logging'], facilities: ['border_forge'] },
        research: { enabled: true, prerequisites: ['metallurgy'] }
      },
      initConditions: {
        places: ['border_camp', 'forest_fringe', 'inland_town'],
        factions: [{ name: '边关巡防所', type: 'garrison' }],
        startingResources: { funds: 30, materials: { timber: 15, iron: 20 } },
        initialPeople: [
          { name: '老工匠', role: 'craftsman', place: 'border_camp' },
          { name: '边塞戍卒', role: 'guard', place: 'border_camp' }
        ],
        facilities: [
          {
            id: 'fac_border_forge',
            name: '边地简易铁匠炉',
            placeId: 'border_camp',
            serviceType: 'crafting',
            capacity: 2,
            status: 'degraded',
            coverage: ['border_camp']
          }
        ],
        capacityResources: [
          { regionId: 'border_camp', resourceId: 'res_forest', resourceType: 'forest', stock: 20, maxStock: 100 }
        ]
      },
      openingScene: { id: 'frontier_scarcity_opening', label: '边塞风雪与林木匮乏开局' },
      requiredEngines: ['service-network', 'environmental-capacity', 'aftermath-impact'],
      optionalEngines: ['coop', 'customLax']
    },
    {
      id: 'coop-pledge',
      label: '承诺密集的共同生活',
      theme: 'coop-pledge',
      playDefs: {
        recipe: { types: ['construction', 'masonry'], facilities: ['community_hall'] }
      },
      initConditions: {
        places: ['settlement_hub', 'community_hall', 'shared_mill'],
        factions: [{ name: '互助公所', type: 'council' }],
        startingResources: { funds: 100, materials: { timber: 40, stone: 60 } },
        initialPeople: [
          { name: '公所主簿', role: 'clerk', place: 'community_hall' },
          { name: '营造匠师', role: 'builder', place: 'community_hall' },
          { name: '行商外客', role: 'merchant', place: 'settlement_hub' }
        ],
        localRules: [
          { id: 'rule_equal_slot', name: '公所工位均分则例', type: 'slot-booking', orgId: 'community_hall', dailyLimit: 1 }
        ]
      },
      openingScene: { id: 'coop_pledge_opening', label: '拦河共建与契约立信开局' },
      requiredEngines: ['customLax', 'coop', 'shared-awareness'],
      optionalEngines: ['actionDesk']
    },
    {
      id: 'epistemic-city',
      label: '信息不对称的调查城市',
      theme: 'epistemic-city',
      playDefs: {
        recipe: { types: ['scribe', 'herbal'], facilities: ['magistrate_office'] }
      },
      initConditions: {
        places: ['city_gate', 'inner_market', 'shadow_alley'],
        factions: [{ name: '城防公署', type: 'bureau' }],
        startingResources: { funds: 120, materials: { medicine: 15, paper: 30 } },
        initialPeople: [
          { name: '暗访密探', role: 'investigator', place: 'shadow_alley' },
          { name: '关防校尉', role: 'officer', place: 'city_gate' }
        ],
        checkpoints: [
          {
            id: 'cp_city_gate',
            name: '内城九门卫所',
            fromPlace: 'city_gate',
            toPlace: 'inner_market',
            controlType: 'permit-required',
            requiredPermit: 'pass_city'
          }
        ]
      },
      openingScene: { id: 'epistemic_city_opening', label: '关防严查与流言迷雾开局' },
      requiredEngines: ['epistemic-view', 'rumor', 'service-network'],
      optionalEngines: ['sceneNarrative', 'actionDesk']
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
        'epistemic-view': 'epistemicView', 'shared-awareness': 'sharedAwareness',
        'environmental-capacity': 'envCapacity', 'coop': 'coop', 'rumor': 'rumor'
      };
      var waKey = keyMap[e] || e;
      available = !!(WA[waKey] || WA[e]);
      if (!available) missing.push(e);
    });

    (s.optionalEngines || []).forEach(function (e) {
      var keyMap = {
        'training': 'training', 'research': 'research', 'family-ops': 'familyOps',
        'inst': 'inst', 'customLax': 'customLax',
        'aftermath-impact': 'aftermathImpact', 'service-network': 'serviceNetwork',
        'epistemic-view': 'epistemicView', 'shared-awareness': 'sharedAwareness',
        'environmental-capacity': 'envCapacity', 'coop': 'coop', 'rumor': 'rumor'
      };
      var waKey = keyMap[e] || e;
      var available = !!(WA[waKey] || WA[e]);
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
  /**
   * 安装玩法蓝图（WP-9 玩法可安装骨架）：
   * 将蓝图中的静态玩法定义、初始条件与关联设施安全注入世界真源。
   */
  function installSample(sampleId, opts) {
    var r = getSample(sampleId);
    if (!r.ok) return r;
    var s = r.sample;
    var o = opts || {};
    var dep = checkDependencies(sampleId);
    if (!dep.canStart && !o.ignoreMissing) {
      return { ok: false, reason: 'missing-required-engines', missing: dep.requiredMissing };
    }
    var st = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
    var hasExistingData = (st.people && Object.keys(st.people).length > 0) ||
      (st.world && Array.isArray(st.world.places) && st.world.places.length > 0);

    if (o.dryRun) {
      return {
        ok: true,
        dryRun: true,
        sampleId: s.id,
        willInstall: {
          places: (s.initConditions && s.initConditions.places) || [],
          factions: (s.initConditions && s.initConditions.factions) || [],
          playDefs: s.playDefs,
          openingScene: s.openingScene
        }
      };
    }

    if (hasExistingData && !o.force && !o.overwrite) {
      var samplePlaces = (s.initConditions && s.initConditions.places) || [];
      var wplaces = (st.world && Array.isArray(st.world.places)) ? st.world.places : [];
      var confPlaces = samplePlaces.filter(function (p) {
        return wplaces.some(function (wp) { return wp && (wp.id === p || wp.name === p); });
      });
      return {
        ok: false,
        reason: 'conflict-existing-world',
        conflicts: { places: confPlaces },
        note: '当前世界已存在人物或地点资产，请传入 { force: true } 确认覆盖导入，以防静默破坏'
      };
    }
    var installed = null;
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (draft) {
        draft.world = draft.world || {};
        draft.world.places = draft.world.places || [];
        draft.region = draft.region || {};
        draft.region.places = draft.region.places || [];
        var places = (s.initConditions && s.initConditions.places) || [];
        places.forEach(function (pName) {
          var pId = clean(pName, 40);
          if (!draft.world.places.some(function (p) { return p && (p.id === pId || p.name === pId); })) {
            draft.world.places.push({ id: pId, name: pId, desc: '由玩法蓝图【' + s.label + '】初始创建' });
          }
          if (!draft.region.places.some(function (p) { return p && (p.id === pId || p.name === pId); })) {
            draft.region.places.push({ id: pId, name: pId });
          }
        });
        if (places.length > 0 && !draft.region.currentPlace) {
          draft.region.currentPlace = places[0];
        }
        draft.world.factions = draft.world.factions || [];
        var factions = (s.initConditions && s.initConditions.factions) || [];
        factions.forEach(function (f) {
          if (!draft.world.factions.some(function (x) { return x && x.name === f.name; })) {
            draft.world.factions.push({ name: f.name, type: f.type || 'guild' });
          }
        });
        draft.blueprint = draft.blueprint || {};
        if (!draft.blueprint.installed || typeof draft.blueprint.installed !== 'object' || draft.blueprint.installed.sampleId) {
          draft.blueprint.installed = {};
        }
        draft.blueprint.installed[s.id] = {
          sampleId: s.id,
          theme: s.theme,
          playDefs: JSON.parse(JSON.stringify(s.playDefs)),
          openingScene: s.openingScene,
          installedAt: clockNow('blueprint')
        };
        draft.blueprint.latestInstalled = s.id;
        installed = draft.blueprint.installed[s.id];
        if (s.playDefs && s.playDefs.recipe && Array.isArray(s.playDefs.recipe.facilities) && WA.production) {
          draft.production = draft.production || { jobs: [], facilities: [] };
          draft.production.facilities = draft.production.facilities || [];
          s.playDefs.recipe.facilities.forEach(function (facName) {
            if (!draft.production.facilities.some(function (f) { return f && f.name === facName; })) {
              draft.production.facilities.push({
                name: facName,
                label: facName,
                slots: 2,
                at: clockNow('blueprint'),
                updatedAt: clockNow('blueprint')
              });
            }
          });
        }
        // 初始资源注入
        if (s.initConditions && s.initConditions.startingResources) {
          draft.economy = draft.economy || {};
          draft.economy.money = draft.economy.money || { funds: 0 };
          draft.economy.money.funds = Math.max(draft.economy.money.funds || 0, s.initConditions.startingResources.funds || 0);
          draft.economy.stock = draft.economy.stock || {};
          var mats = s.initConditions.startingResources.materials || {};
          Object.keys(mats).forEach(function (m) {
            draft.economy.stock[m] = Math.max(draft.economy.stock[m] || 0, mats[m] || 0);
          });
        }
        // 初始人物注入
        if (s.initConditions && Array.isArray(s.initConditions.initialPeople)) {
          draft.people = draft.people || {};
          s.initConditions.initialPeople.forEach(function (p) {
            var pKey = 'p_' + clean(p.name, 40);
            if (!draft.people[pKey]) {
              draft.people[pKey] = {   // fallback：开局初始人物兜底建档
                id: pKey,
                name: clean(p.name, 40),
                createdVia: 'playableBlueprint:fallback',
                role: clean(p.role || 'citizen', 30),
                where: clean(p.place || places[0] || 'town_square', 40),
                profile: { status: 'idle', energy: 100 },
                resources: { funds: 10 }
              };
            }
          });
        }
        // 注入主题设施
        if (s.initConditions && Array.isArray(s.initConditions.facilities)) {
          draft.serviceNetwork = draft.serviceNetwork || { facilities: [], usage: [] };
          draft.serviceNetwork.facilities = draft.serviceNetwork.facilities || [];
          s.initConditions.facilities.forEach(function (fac) {
            if (!draft.serviceNetwork.facilities.some(function (f) { return f && f.id === fac.id; })) {
              draft.serviceNetwork.facilities.push(Object.assign({}, fac, { createdAt: clockNow('blueprint') }));
            }
          });
        }
        // 注入主题关卡
        if (s.initConditions && Array.isArray(s.initConditions.checkpoints)) {
          draft.serviceNetwork = draft.serviceNetwork || { facilities: [], usage: [] };
          draft.serviceNetwork.checkpoints = draft.serviceNetwork.checkpoints || [];
          s.initConditions.checkpoints.forEach(function (cp) {
            if (!draft.serviceNetwork.checkpoints.some(function (c) { return c && c.id === cp.id; })) {
              draft.serviceNetwork.checkpoints.push(Object.assign({}, cp, { createdAt: clockNow('blueprint') }));
            }
          });
        }
        // 注入地方规约
        if (s.initConditions && Array.isArray(s.initConditions.localRules)) {
          draft.customLax = draft.customLax || { rules: [] };
          draft.customLax.rules = draft.customLax.rules || [];
          s.initConditions.localRules.forEach(function (rule) {
            if (!draft.customLax.rules.some(function (r) { return r && r.id === rule.id; })) {
              draft.customLax.rules.push(Object.assign({ active: true, stage: 'active', enactedAt: clockNow('blueprint') }, rule));
            }
          });
        }
        // 注入承载力资源
        if (s.initConditions && Array.isArray(s.initConditions.capacityResources)) {
          draft.envCapacity = draft.envCapacity || { resources: {} };
          draft.envCapacity.resources = draft.envCapacity.resources || {};
          s.initConditions.capacityResources.forEach(function (cr) {
            draft.envCapacity.resources[cr.resourceId] = Object.assign({
              strain: 'depleted',
              declaredAt: clockNow('blueprint')
            }, cr);
          });
        }
        installed = draft.blueprint.installed;
        return true;
      }, 'playableBlueprint:install');
    }
    return {
      ok: true,
      sampleId: s.id,
      installed: installed,
      note: '玩法包【' + s.label + '】已成功安装至世界真源'
    };
  }

  /**
   * OPV4-9: 玩法蓝图的安全调参、差异预览与续局
   */
  function findSampleDefinition(sampleId) {
    var sid = clean(sampleId, 40);
    var s = SAMPLES.filter(function (x) { return x.id === sid; })[0];
    if (!s) return { ok: false, reason: 'sample-not-found', available: SAMPLES.map(function (x) { return x.id; }) };
    return { ok: true, sample: s };
  }

  /**
   * 1. 差异预览（previewDiff）：对比当前世界已安装玩法定义与待调参/待升级蓝图之间的结构差异
   */
  function previewDiff(sampleId, overrides, opts) {
    var r = findSampleDefinition(sampleId);
    if (!r.ok) return r;
    var s = r.sample;
    var o = opts || {};
    var st = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
    var currentInstalled = (st.blueprint && st.blueprint.installed && st.blueprint.installed[s.id]) || null;
    var targetPlayDefs = JSON.parse(JSON.stringify(s.playDefs || {}));
    if (overrides && typeof overrides === 'object') {
      Object.keys(overrides).forEach(function (k) {
        if (targetPlayDefs[k] && typeof targetPlayDefs[k] === 'object' && !Array.isArray(targetPlayDefs[k])) {
          targetPlayDefs[k] = Object.assign({}, targetPlayDefs[k], overrides[k]);
        } else {
          targetPlayDefs[k] = overrides[k];
        }
      });
    }

    var diffs = [];
    var keys = Array.from(new Set(Object.keys(targetPlayDefs).concat(currentInstalled ? Object.keys(currentInstalled.playDefs || {}) : [])));
    keys.forEach(function (k) {
      var before = currentInstalled ? currentInstalled.playDefs[k] : undefined;
      var after = targetPlayDefs[k];
      if (before === undefined) {
        diffs.push({ key: k, type: 'added', after: after });
      } else if (after === undefined) {
        diffs.push({ key: k, type: 'removed', before: before });
      } else if (JSON.stringify(before) !== JSON.stringify(after)) {
        diffs.push({ key: k, type: 'modified', before: before, after: after });
      }
    });

    return {
      ok: true,
      sampleId: s.id,
      currentlyInstalled: !!currentInstalled,
      diffCount: diffs.length,
      diffs: diffs,
      note: currentInstalled ? '已存在已安装版本，已生成调参/升级差异预览' : '世界真源中尚未安装该蓝图，为纯新增预览'
    };
  }

  /**
   * 2. 安全调参（tuneConfig）：在受约束范围内调整蓝图参数，确保运行中进度不受覆盖
   */
  function tuneConfig(sampleId, params, opts) {
    var r = findSampleDefinition(sampleId);
    if (!r.ok) return r;
    var s = r.sample;
    var p = params || {};
    var o = opts || {};
    var st = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
    if (!st.blueprint || !st.blueprint.installed || !st.blueprint.installed[s.id]) {
      return { ok: false, reason: 'blueprint-not-installed', note: '必须先安装玩法蓝图方可进行运行时调参' };
    }

    var tuned = null;
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (draft) {
        draft.blueprint = draft.blueprint || {};
        draft.blueprint.installed = draft.blueprint.installed || {};
        var inst = draft.blueprint.installed[s.id];
        inst.playDefs = inst.playDefs || {};
        inst.tuningHistory = inst.tuningHistory || [];

        var tuningRecord = {
          at: clockNow('blueprint'),
          changes: {}
        };

        // 逐类安全调参（受约束参数范围：数值边界、方法白名单、可选开关注入）
        if (p.training && typeof p.training === 'object') {
          inst.playDefs.training = inst.playDefs.training || {};
          if (p.training.method && typeof p.training.method === 'string') {
            tuningRecord.changes.trainingMethod = { from: inst.playDefs.training.method, to: clean(p.training.method, 40) };
            inst.playDefs.training.method = clean(p.training.method, 40);
          }
        }

        if (p['family-ops'] && typeof p['family-ops'] === 'object') {
          inst.playDefs['family-ops'] = inst.playDefs['family-ops'] || {};
          if (typeof p['family-ops'].budgetCycle === 'number') {
            var cycle = Math.max(1, Math.min(30, Math.floor(p['family-ops'].budgetCycle)));
            tuningRecord.changes.budgetCycle = { from: inst.playDefs['family-ops'].budgetCycle, to: cycle };
            inst.playDefs['family-ops'].budgetCycle = cycle;
          }
          if (typeof p['family-ops'].enabled === 'boolean') {
            tuningRecord.changes.familyOpsEnabled = { from: inst.playDefs['family-ops'].enabled, to: p['family-ops'].enabled };
            inst.playDefs['family-ops'].enabled = p['family-ops'].enabled;
          }
        }

        if (p.research && typeof p.research === 'object') {
          inst.playDefs.research = inst.playDefs.research || {};
          if (typeof p.research.enabled === 'boolean') {
            tuningRecord.changes.researchEnabled = { from: inst.playDefs.research.enabled, to: p.research.enabled };
            inst.playDefs.research.enabled = p.research.enabled;
          }
        }

        inst.tuningHistory.push(tuningRecord);
        inst.updatedAt = clockNow('blueprint');
        tuned = inst;
        return true;
      }, 'playableBlueprint:tuneConfig');
    }

    return {
      ok: true,
      sampleId: s.id,
      tuned: tuned,
      note: '玩法蓝图参数已在约束范围内安全更新，进行中游戏进度完整保留'
    };
  }

  /**
   * 3. 版本迁移与校验（migrateBlueprint）：旧格式升级或明确拒收，支持可选引擎缺失时的解释性降级
   */
  function migrateBlueprint(blueprintData, opts) {
    var o = opts || {};
    if (!blueprintData || typeof blueprintData !== 'object') {
      return { ok: false, reason: 'invalid-data', note: '蓝图数据必须为非空对象' };
    }

    // 格式版本识别
    var version = blueprintData.version || (blueprintData.sampleId ? 1 : 0);
    if (version === 0 || (!blueprintData.sampleId && !blueprintData.id && !blueprintData.theme)) {
      return {
        ok: false,
        reason: 'unsupported-format-rejected',
        note: '未知或不兼容的旧版蓝图格式，已明确拒收（fail-closed）以防数据污染'
      };
    }

    var sid = clean(blueprintData.sampleId || blueprintData.id, 40);
    var dep = checkDependencies(sid);
    var degradations = [];

    // 若存在可选引擎不可用，提供解释性降级方案而非直接崩溃
    if (dep.optionalEngines && dep.optionalEngines.length > 0) {
      dep.optionalEngines.forEach(function (oe) {
        if (!oe.available) {
          degradations.push({
            engine: oe.engine,
            status: 'degraded',
            reason: '模块未挂载，相关联动转为简化或只读模式'
          });
        }
      });
    }

    var migrated = {
      version: 2,
      sampleId: sid,
      theme: blueprintData.theme || 'custom',
      playDefs: JSON.parse(JSON.stringify(blueprintData.playDefs || {})),
      initConditions: JSON.parse(JSON.stringify(blueprintData.initConditions || {})),
      migratedAt: clockNow('blueprint'),
      degradations: degradations
    };

    return {
      ok: true,
      sampleId: sid,
      migrated: migrated,
      degradations: degradations,
      canStart: dep.canStart,
      note: degradations.length > 0 ? '完成格式迁移，检测到 ' + degradations.length + ' 项可选玩法降级' : '蓝图格式版本迁移成功'
    };
  }

  /**
   * 4. 重置初始条件并保留进度（resetInitialConditions）：
   * 显式操作，仅重置物资配额与基础设施初始状态，严格保留人们的经历、事件历史与人物档案。
   */
  function resetInitialConditions(sampleId, opts) {
    var r = findSampleDefinition(sampleId);
    if (!r.ok) return r;
    var s = r.sample;
    var o = opts || {};
    var st = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};

    var resetSummary = {
      fundsReset: false,
      materialsReset: false,
      preservedPeopleCount: 0,
      preservedEventsCount: 0
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (draft) {
        // 重置初始资源
        if (s.initConditions && s.initConditions.startingResources) {
          draft.economy = draft.economy || {};
          draft.economy.money = draft.economy.money || {};
          draft.economy.money.funds = s.initConditions.startingResources.funds || 0;
          resetSummary.fundsReset = true;

          draft.economy.stock = draft.economy.stock || {};
          var mats = s.initConditions.startingResources.materials || {};
          Object.keys(mats).forEach(function (m) {
            draft.economy.stock[m] = mats[m] || 0;
          });
          resetSummary.materialsReset = true;
        }

        // 统计并确认严格保留的进行中进度（人物状态、履历与世界事件历史）
        if (draft.people) {
          resetSummary.preservedPeopleCount = Object.keys(draft.people).length;
        }
        if (draft.world && Array.isArray(draft.world.events)) {
          resetSummary.preservedEventsCount = draft.world.events.length;
        }

        // 记录蓝图重置审计日志
        draft.blueprint = draft.blueprint || {};
        draft.blueprint.resetHistory = draft.blueprint.resetHistory || [];
        draft.blueprint.resetHistory.push({
          sampleId: s.id,
          at: clockNow('blueprint'),
          reason: clean(o.reason || '显式重置初始条件', 60),
          summary: resetSummary
        });

        return true;
      }, 'playableBlueprint:resetInitialConditions');
    }

    return {
      ok: true,
      sampleId: s.id,
      summary: resetSummary,
      note: '初始资源条件已显式重置；人物成长状态与世界历史事件已完整保留（无静默删除）'
    };
  }

  WA.playableBlueprint = {
    listSamples: listSamples,
    getSample: getSample,
    checkDependencies: checkDependencies,
    exportPlayDefs: exportPlayDefs,
    installSample: installSample,
    previewDiff: previewDiff,
    tuneConfig: tuneConfig,
    migrateBlueprint: migrateBlueprint,
    resetInitialConditions: resetInitialConditions,
    THEME_KEYS: THEME_KEYS.slice(),
    PLAY_DEF_KEYS: PLAY_DEF_KEYS.slice()
  };

  if (typeof WA.registerModule === 'function') WA.registerModule('engines/playable-blueprint.js', { kind: 'engine', ver: '2.231.0' });
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/playable-blueprint 已加载（2.231.0）');
  }
})();
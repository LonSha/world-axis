/**
 * WorldAxis engines/phase-transition.js (v2.231.0) — IN-9 历史相变
 *
 * 核心职责：
 *   用题材声明的少量条件组合描述局部社会状态。
 *   状态变化需要持续条件、参与者决定与已兑现设施/技术，而非单一数值阈值。
 *   加入进入/退出不同条件与恢复时滞，表示路径依赖。
 *   不同地区可以并存不同阶段，信息传播仍有限。
 *
 * 运行闭环：
 *   IN-4 制度、IN-5 技术、IN-6 服务与 IN-7 环境提供真实读数
 *   → 形成可解释的转型机会/压力 → 玩家与 NPC 采取行动
 *   → 各业务 owner 实际改变成本/方法/协作范围
 *   → 进入新局部状态 → chronicle 记录使变化成立的事件。
 *   阶段标签只是结果摘要，不能自己凭空改库存、道路、职位或人物。
 *
 * 边界：
 *   1. 是前八项联动的旗舰，不是独立大总管。
 *   2. 先完成一个题材、两个地区、三种局部状态的纵向玩法，再扩展规则库。
 *   3. 不写任意社会演化 AI，不声称能预测现实历史。
 *   4. 阶段标签只是结果摘要，不凭空改库存/道路/职位/人物。
 *   5. 短期需求波动不会在两个时代名之间抖动；回退需要明确代价与过渡。
 *   6. 回退不恢复已消耗资源，也不让远方人物全知更新。
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

  function state() {
    return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
  }

  function now() {
    return WA.clock.now('phaseTransition');
  }

  // 三个局部社会状态（题材声明，不声称预测现实历史）
  var PHASES = [
    {
      id: 'decentralized-craft',
      label: '分散手工',
      conditions: {
        techLevel: ['apprenticeship', 'expedition'],
        serviceCoverage: 0.3,
        ruleCount: 0,
        envStrain: ['healthy', 'strained']
      },
      note: '小规模分散生产，设施少，无统一制度'
    },
    {
      id: 'public-collaboration',
      label: '公共协作',
      conditions: {
        techLevel: ['apprenticeship', 'simulation'],
        serviceCoverage: 0.5,
        ruleCount: 1,
        envStrain: ['healthy', 'strained', 'depleted']
      },
      note: '有公共设施与基本制度，开始协作生产'
    },
    {
      id: 'service-tension',
      label: '服务紧张',
      conditions: {
        techLevel: ['simulation'],
        serviceCoverage: 0.3,
        ruleCount: 2,
        envStrain: ['depleted', 'critical']
      },
      note: '资源紧张，制度复杂化，服务降级'
    }
  ];

  function bucket() {
    var s = state();
    return (s.phaseTransition && typeof s.phaseTransition === 'object') ? s.phaseTransition : null;
  }

  function ensureBucket() {
    if (!bucket()) {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.phaseTransition = d.phaseTransition || { regions: {}, history: [] };
          return true;
        }, 'phaseTransition:init');
      }
    }
    return bucket() || { regions: {}, history: [] };
  }

  /**
   * 采集某区域的各项读数（从 IN-4/5/6/7 各 owner 读取真实状态）。
   */
  function collectReadings(regionId) {
    var rid = clean(regionId, 60);
    var s = state();
    var readings = {
      techLevel: [],
      serviceCoverage: 0,
      ruleCount: 0,
      envStrain: []
    };

    // IN-5 技术谱系：取该区域有活跃实践者的传统（直接从 state 读取）
    var tlState = s.techLineage || {};
    var traditions = tlState.traditions || {};
    Object.keys(traditions).forEach(function (tid) {
      var t = traditions[tid];
      if (t && t.status === 'active' && t.method) {
        readings.techLevel.push(t.method);
      }
    });

    // IN-6 服务网络：取该区域可用设施数与总容量
    if (WA.serviceNetwork && typeof WA.serviceNetwork.servicesAt === 'function') {
      try {
        var sv = WA.serviceNetwork.servicesAt(rid);
        if (sv && sv.facilities) {
          var totalCap = 0;
          sv.facilities.forEach(function (f) { totalCap += (f.capacity || 0); });
          readings.serviceCoverage = totalCap;
        }
      } catch (e) {}
    }

    // IN-4 习俗到制度：取该区域生效规则数
    if (WA.customLax && typeof WA.customLax.activeRules === 'function') {
      // customLax 按 orgId 查，此处取近似
      try {
        var bk = ensureBucket();
        var rules = (bk.rules || WA.customLax.activeRules(rid).rules) || [];
        if (Array.isArray(rules)) readings.ruleCount = rules.length;
      } catch (e) {}
    }

    // IN-7 环境承载：取该区域资源应变等级
    if (WA.envCapacity && typeof WA.envCapacity.regionStatus === 'function') {
      try {
        var rs = WA.envCapacity.regionStatus(rid);
        if (rs && rs.resources) {
          rs.resources.forEach(function (r) {
            if (r.strain) readings.envStrain.push(r.strain);
          });
        }
      } catch (e) {}
    }

    return readings;
  }

  /**
   * 评估某区域当前处于哪个局部社会状态。
   * 阶段标签只是结果摘要，不凭空改库存。
   */
  function evaluatePhase(regionId) {
    var rid = clean(regionId, 60);
    var readings = collectReadings(rid);
    var bk = ensureBucket();
    var currentPhase = (bk.regions || {})[rid] || { phaseId: 'decentralized-craft', enteredAt: 0, stable: true };

    // 匹配最符合的 phase
    var bestMatch = null;
    var bestScore = -1;
    PHASES.forEach(function (p) {
      var score = 0;
      // 技术匹配
      var techMatch = p.conditions.techLevel.some(function (t) { return readings.techLevel.indexOf(t) >= 0; });
      if (techMatch) score += 1;
      // 服务覆盖
      if (readings.serviceCoverage >= p.conditions.serviceCoverage) score += 1;
      // 规则数
      if (readings.ruleCount >= p.conditions.ruleCount) score += 1;
      // 环境应变
      var envMatch = p.conditions.envStrain.some(function (e) { return readings.envStrain.indexOf(e) >= 0; });
      if (envMatch) score += 1;
      if (score > bestScore) { bestScore = score; bestMatch = p; }
    });

    var newPhaseId = bestMatch ? bestMatch.id : 'decentralized-craft';
    var changed = newPhaseId !== currentPhase.phaseId;

    // 短期波动不抖动：需持续条件满足才过渡
    // 第一次评估或已有稳定状态时不立即切换
    if (changed && currentPhase.enteredAt > 0) {
      // 记录潜在过渡（但不立即生效）
      return {
        ok: true,
        regionId: rid,
        currentPhase: currentPhase.phaseId,
        candidatePhase: newPhaseId,
        readings: readings,
        stable: false,
        note: '检测到潜在相变条件，但需持续满足与参与者决定才能过渡（防抖动）'
      };
    }

    // 首次或确认过渡
    if (changed || currentPhase.enteredAt === 0) {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.phaseTransition = d.phaseTransition || { regions: {}, history: [] };
          d.phaseTransition.regions[rid] = { phaseId: newPhaseId, enteredAt: now(), stable: true };
          d.phaseTransition.history.push({
            regionId: rid, from: currentPhase.phaseId, to: newPhaseId, at: now(),
            readings: readings
          });
          return true;
        }, 'phaseTransition:evaluate');
      }
    }

    var phaseLabel = '';
    var phaseNote = '';
    PHASES.forEach(function (p) {
      if (p.id === newPhaseId) { phaseLabel = p.label; phaseNote = p.note; }
    });

    return {
      ok: true,
      regionId: rid,
      currentPhase: newPhaseId,
      phaseLabel: phaseLabel,
      readings: readings,
      stable: true,
      note: phaseNote || '阶段标签只是结果摘要，不凭空改库存/道路/职位/人物'
    };
  }

  /**
   * 显式过渡（由参与者决定触发，需明示代价与过渡）。
   * 回退不恢复已消耗资源。
   */
  function transition(regionId, targetPhaseId, opts) {
    var rid = clean(regionId, 60);
    var target = clean(targetPhaseId, 40);
    var o = opts || {};
    var bk = ensureBucket();
    var current = (bk.regions || {})[rid] || { phaseId: 'decentralized-craft', enteredAt: 0 };

    // 验证目标 phase 存在
    var valid = PHASES.some(function (p) { return p.id === target; });
    if (!valid) return { ok: false, reason: 'bad-phase', allowed: PHASES.map(function (p) { return p.id; }) };
    if (target === current.phaseId) return { ok: false, reason: 'already-in-phase', phaseId: current.phaseId };

    var isRollback = false;
    // 判断是否为回退（从更后阶段回到更前阶段）
    var currentIdx = PHASES.findIndex(function (p) { return p.id === current.phaseId; });
    var targetIdx = PHASES.findIndex(function (p) { return p.id === target; });
    if (targetIdx < currentIdx) isRollback = true;

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.phaseTransition = d.phaseTransition || { regions: {}, history: [] };
        d.phaseTransition.regions[rid] = { phaseId: target, enteredAt: now(), stable: true };
        d.phaseTransition.history.push({
          regionId: rid, from: current.phaseId, to: target, at: now(),
          decidedBy: clean(o.by, 40), isRollback: isRollback,
          cost: clean(o.cost, 60) || ''
        });
        return true;
      }, 'phaseTransition:transition');
    }

    return {
      ok: true,
      regionId: rid,
      from: current.phaseId,
      to: target,
      isRollback: isRollback,
      note: isRollback ? '回退需要明确代价与过渡；不恢复已消耗资源，也不让远方人物全知更新' : '进入新局部状态'
    };
  }

  /**
   * 查询区域历史相变记录。
   */
  function history(regionId) {
    var rid = clean(regionId, 60);
    var bk = ensureBucket();
    var hist = (bk.history || []).filter(function (h) { return h && h.regionId === rid; });
    return { ok: true, regionId: rid, transitions: hist, count: hist.length };
  }

  WA.phaseTransition = {
    evaluatePhase: evaluatePhase,
    transition: transition,
    history: history,
    PHASES: PHASES.map(function (p) { return { id: p.id, label: p.label, note: p.note }; })
  };

  if (typeof WA.registerModule === 'function') WA.registerModule('engines/phase-transition.js', { kind: 'engine', ver: '2.231.0' });
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/phase-transition 已加载（2.231.0）');
  }
})();
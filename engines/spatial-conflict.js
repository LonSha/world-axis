/**
 * WorldAxis engines/spatial-conflict.js (v2.330.0)
 * 多角色同域动线空间冲突与拥挤仲裁引擎 (Spatial Conflict & Chokepoint Arbitration)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 空间是不可穿透的物理实体。当多个具身实体试图在狭窄隘口（窄门、山谷吊桥、柜台、庇护所仅剩床位）
 * 同时占位时，必然产生物理级空间冲突与排队优先级仲裁：
 *  1. 隘口通行能力队列 (Chokepoint Throughput Queue)：
 *     - 窄门/走廊限制同 tick 仅能通过 N 人；
 *     - 超出吞吐量者进入排队阻塞态。
 *  2. 争夺与避让仲裁 (Contention Resolution)：
 *     - 当两名角色发生直接空间争夺（如抢占避难干燥位、抢先通过单人隘口）：
 *     - 综合判定：力量/体格 (physique)、敏捷 (agility)、气场威慑 (intimidation) 与阶层优先级 (priority)；
 *     - 裁决结局：
 *       · 'yield'（一方自愿或被迫礼貌让行）；
 *       · 'force_push'（体格强行推挤突进，伴随对方重心不稳与体力损耗）；
 *       · 'clash'（势均力敌发生肢体擦碰/对峙停滞）；
 *       · 'queue'（秩序井然依次通行）。
 */
'use strict';

(function () {
  const root = typeof window !== 'undefined' ? window : global;
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  WA.engines = WA.engines || {};

  const VERSION = '2.330.0';

  const VALID_INTENTS = Object.freeze([
    'pass_chokepoint',  // 通过狭窄通道/门洞
    'scramble_resource',// 抢占干燥位/掩体/床位
    'counter_service'   // 柜台/商户窗口前排队
  ]);

  // 隘口队列状态表: Map<chokepointId, ChokepointQueueRecord>
  const _chokepoints = new Map();

  function _cleanStr(s, max) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, max || 60);
  }

  function _clamp(num, min, max) {
    const n = Number(num);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  /**
   * 注册狭窄隘口/瓶颈位
   */
  function registerChokepoint(chokepointId, maxThroughput, opts) {
    const cid = _cleanStr(chokepointId);
    if (!cid) return { ok: false, reason: 'missing-chokepoint-id' };

    const tp = Math.round(Number(maxThroughput));
    if (!Number.isFinite(tp) || tp < 1) {
      return { ok: false, reason: 'invalid-throughput', expected: '>= 1' };
    }

    opts = opts || {};
    const record = {
      chokepointId: cid,
      maxThroughput: tp,
      queue: [],
      passedInCurrentTick: 0,
      desc: _cleanStr(opts.desc || '', 100)
    };

    _chokepoints.set(cid, record);
    return { ok: true, chokepointId: cid, maxThroughput: tp };
  }

  /**
   * 角色加入隘口排队队列
   */
  function enqueueChokepoint(chokepointId, actorId, priorityScore) {
    const cid = _cleanStr(chokepointId);
    if (!cid || !_chokepoints.has(cid)) {
      return { ok: false, reason: 'chokepoint-not-found' };
    }

    const aid = _cleanStr(actorId);
    if (!aid) return { ok: false, reason: 'missing-actor-id' };

    const cp = _chokepoints.get(cid);
    // 检查是否已经在队内
    const existingIdx = cp.queue.findIndex(item => item.actorId === aid);
    if (existingIdx >= 0) {
      return { ok: false, reason: 'actor-already-enqueued', queuePosition: existingIdx + 1 };
    }

    const score = Number.isFinite(Number(priorityScore)) ? Number(priorityScore) : 0;
    const item = {
      actorId: aid,
      priorityScore: score,
      enqueuedAt: Date.now()
    };

    // 按 priority 降序插入
    let inserted = false;
    for (let i = 0; i < cp.queue.length; i++) {
      if (item.priorityScore > cp.queue[i].priorityScore) {
        cp.queue.splice(i, 0, item);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      cp.queue.push(item);
    }

    const position = cp.queue.findIndex(q => q.actorId === aid) + 1;
    return { ok: true, chokepointId: cid, actorId: aid, position: position, queueLength: cp.queue.length };
  }

  /**
   * 隘口放行处理 (每时步放行至多 maxThroughput 人)
   */
  function advanceChokepointQueue(chokepointId) {
    const cid = _cleanStr(chokepointId);
    if (!cid || !_chokepoints.has(cid)) {
      return { ok: false, reason: 'chokepoint-not-found' };
    }

    const cp = _chokepoints.get(cid);
    const passed = [];
    while (cp.queue.length > 0 && passed.length < cp.maxThroughput) {
      passed.push(cp.queue.shift());
    }

    return {
      ok: true,
      chokepointId: cid,
      passedActors: passed.map(p => p.actorId),
      remainingInQueue: cp.queue.length
    };
  }

  /**
   * 两个角色在同一空间节点发生抢占/碰头时的即时仲裁
   * @param {string} placeId 发生地点
   * @param {object} actorA { actorId, physique, agility, intimidation, aggressive: boolean }
   * @param {object} actorB { actorId, physique, agility, intimidation, aggressive: boolean }
   * @param {object} context { intent: 'pass_chokepoint'|'scramble_resource'|'counter_service', contestedResource: string }
   */
  function resolveSpatialConflict(placeId, actorA, actorB, context) {
    const pid = _cleanStr(placeId);
    if (!pid) return { ok: false, reason: 'missing-place-id' };

    if (!actorA || !actorA.actorId) return { ok: false, reason: 'missing-actor-a' };
    if (!actorB || !actorB.actorId) return { ok: false, reason: 'missing-actor-b' };

    const aidA = _cleanStr(actorA.actorId);
    const aidB = _cleanStr(actorB.actorId);
    if (aidA === aidB) return { ok: false, reason: 'cannot-conflict-with-self' };

    context = context || {};
    const intent = _cleanStr(context.intent || 'pass_chokepoint').toLowerCase();
    if (!VALID_INTENTS.includes(intent)) {
      return { ok: false, reason: 'invalid-conflict-intent', valid: VALID_INTENTS };
    }

    const phyA = _clamp(Number(actorA.physique || 50), 0, 100);
    const agiA = _clamp(Number(actorA.agility || 50), 0, 100);
    const intA = _clamp(Number(actorA.intimidation || 50), 0, 100);
    const aggA = !!actorA.aggressive;

    const phyB = _clamp(Number(actorB.physique || 50), 0, 100);
    const agiB = _clamp(Number(actorB.agility || 50), 0, 100);
    const intB = _clamp(Number(actorB.intimidation || 50), 0, 100);
    const aggB = !!actorB.aggressive;

    // 计算对抗综合得分
    // 抢资源偏向 physique 与 aggression，过狭道偏向 agility 与 physique
    let scoreA = 0;
    let scoreB = 0;

    if (intent === 'scramble_resource') {
      scoreA = phyA * 0.5 + intA * 0.3 + (aggA ? 20 : 0);
      scoreB = phyB * 0.5 + intB * 0.3 + (aggB ? 20 : 0);
    } else {
      scoreA = agiA * 0.4 + phyA * 0.4 + intA * 0.2 + (aggA ? 15 : 0);
      scoreB = agiB * 0.4 + phyB * 0.4 + intB * 0.2 + (aggB ? 15 : 0);
    }

    const diff = scoreA - scoreB;
    let resolution = 'yield';
    let winner = null;
    let loser = null;
    let narrativeBrief = '';
    let staminaCostWinner = 0;
    let staminaCostLoser = 0;

    if (Math.abs(diff) < 8 && !aggA && !aggB) {
      // 双方差异小且都不具备攻击性 -> 互相礼让或排队
      resolution = 'queue';
      winner = aidA;
      loser = aidB;
      narrativeBrief = `${aidA} 与 ${aidB} 在狭道前对视微顿，依序相互侧身礼让通行。`;
    } else if (Math.abs(diff) < 10 && (aggA || aggB)) {
      // 差异小但有人好斗 -> 发生推搡肢体冲突
      resolution = 'clash';
      winner = diff >= 0 ? aidA : aidB;
      loser = diff >= 0 ? aidB : aidA;
      staminaCostWinner = 8;
      staminaCostLoser = 12;
      narrativeBrief = `${aidA} 与 ${aidB} 在狭道剧烈推搡发生肢体摩擦，双方均受阻滞损耗体力。`;
    } else if (diff >= 10) {
      // A 优势胜出
      winner = aidA;
      loser = aidB;
      if (aggA) {
        resolution = 'force_push';
        staminaCostLoser = 6;
        narrativeBrief = `${aidA} 依仗体格蛮力强行推开 ${aidB}，率先抢占通过。`;
      } else {
        resolution = 'yield';
        narrativeBrief = `${aidB} 感受到对方势头，主动驻足退步侧身让路，${aidA} 顺利先行。`;
      }
    } else {
      // B 优势胜出
      winner = aidB;
      loser = aidA;
      if (aggB) {
        resolution = 'force_push';
        staminaCostLoser = 6;
        narrativeBrief = `${aidB} 蛮横挤开 ${aidA} 夺得先机。`;
      } else {
        resolution = 'yield';
        narrativeBrief = `${aidA} 主动侧身退让，让 ${aidB} 先行通过。`;
      }
    }

    // 扣除体力代谢 (若 metabolism-clock 可用)
    if (WA.engines && WA.engines.metabolismClock && typeof WA.engines.metabolismClock.accumulateFatigue === 'function') {
      if (staminaCostWinner > 0) WA.engines.metabolismClock.accumulateFatigue(winner, staminaCostWinner, 'spatial_conflict_clash');
      if (staminaCostLoser > 0) WA.engines.metabolismClock.accumulateFatigue(loser, staminaCostLoser, 'spatial_conflict_bumped');
    }

    return {
      ok: true,
      placeId: pid,
      intent: intent,
      resolution: resolution,
      winner: winner,
      loser: loser,
      scoreDiff: Math.round(diff * 10) / 10,
      staminaCostWinner: staminaCostWinner,
      staminaCostLoser: staminaCostLoser,
      narrativeBrief: narrativeBrief
    };
  }

  function resetAll() {
    _chokepoints.clear();
    return { ok: true, reset: true };
  }

  const engine = {
    version: VERSION,
    registerChokepoint: registerChokepoint,
    enqueueChokepoint: enqueueChokepoint,
    advanceChokepointQueue: advanceChokepointQueue,
    resolveSpatialConflict: resolveSpatialConflict,
    resetAll: resetAll,
    diagnose: function () {
      return {
        ok: true,
        chokepointCount: _chokepoints.size,
        version: VERSION
      };
    }
  };

  WA.engines.spatialConflict = engine;
  WA.spatialConflict = engine;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
})();
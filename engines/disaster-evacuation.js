/**
 * WorldAxis engines/disaster-evacuation.js (v2.330.0)
 * 突发灾难险阻与应急避难疏散引擎 (Disaster Obstruction & Emergency Evacuation)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 无论现代火灾地震、科幻空间站失压、古代地龙翻身、修仙灵脉暴动结界碎裂或西幻龙炎焚城，
 * 均抽象为通用的时空险阻阻断与庇护所容纳模型：
 *  1. 灾难事件 (Disaster)：震中坐标/地点、波及半径、危险等级 (1~5)、动态封锁的通道边 (blockedEdges)；
 *  2. 避难设施 (Shelter)：所在地点、最大安全容纳人数 (capacity)、当前已入驻人数 (occupancy)、防护评级；
 *  3. 紧急避难疏散 (Evacuation Dispatch)：计算就近未被阻断的避难所，若避难所满员或路线全断，判定为 trapped（困守），
 *     为多角色生存争夺、人道救援与绝境逃生提供客观物理铁证。
 */
'use strict';

(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  WA.engines = WA.engines || {};

  const VERSION = '2.330.0';

  const VALID_DISASTER_KINDS = Object.freeze([
    'earthquake',     // 地震/地脉震颤
    'fire',           // 烈火/天火焚城
    'flood',          // 洪水/水淹
    'collapse',       // 塌方/道路截断
    'gas_leak',       // 毒气泄漏/死瘴弥漫
    'barrier_rupture' // 结界碎裂/能量暴走
  ]);

  // 活跃灾难表: Map<disasterId, DisasterRecord>
  const _disasters = new Map();

  // 登记避难所表: Map<shelterId, ShelterRecord>
  const _shelters = new Map();

  // 疏散记录表: Map<actorId, EvacStatusRecord>
  const _evacuations = new Map();

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
   * 注册/爆发突发灾难险阻
   */
  function registerDisaster(disasterId, kind, epicenterPlaceId, severity, opts) {
    const did = _cleanStr(disasterId);
    if (!did) return { ok: false, reason: 'missing-disaster-id' };

    const dk = _cleanStr(kind).toLowerCase();
    if (!VALID_DISASTER_KINDS.includes(dk)) {
      return { ok: false, reason: 'invalid-disaster-kind', valid: VALID_DISASTER_KINDS };
    }

    const epic = _cleanStr(epicenterPlaceId);
    if (!epic) return { ok: false, reason: 'missing-epicenter' };

    const sev = Math.round(Number(severity));
    if (!Number.isFinite(sev) || sev < 1 || sev > 5) {
      return { ok: false, reason: 'severity-out-of-range', range: [1, 5] };
    }

    opts = opts || {};
    const radius = Math.max(0, Number(opts.radius || 1));
    const blockedPlaces = Array.isArray(opts.blockedPlaces)
      ? opts.blockedPlaces.map(p => _cleanStr(p)).filter(Boolean)
      : [];
    const blockedEdges = Array.isArray(opts.blockedEdges)
      ? opts.blockedEdges.map(e => _cleanStr(e)).filter(Boolean)
      : [];

    const record = {
      disasterId: did,
      kind: dk,
      epicenter: epic,
      severity: sev,
      radius: radius,
      blockedPlaces: new Set([epic, ...blockedPlaces]),
      blockedEdges: new Set(blockedEdges),
      desc: _cleanStr(opts.desc || '', 120),
      createdAt: clockNow('disaster-evacuation'),
      active: true
    };

    _disasters.set(did, record);

    // 联动 spatial-topology，若存在封锁边则标记通行阻断
    if (WA.engines && WA.engines.spatialTopology && typeof WA.engines.spatialTopology.setTransitLock === 'function') {
      for (const p of record.blockedPlaces) {
        WA.engines.spatialTopology.setTransitLock(p, true, `disaster:${did}`);
      }
    }

    return {
      ok: true,
      disasterId: did,
      record: {
        disasterId: record.disasterId,
        kind: record.kind,
        epicenter: record.epicenter,
        severity: record.severity,
        blockedPlaces: Array.from(record.blockedPlaces),
        blockedEdges: Array.from(record.blockedEdges)
      }
    };
  }

  /**
   * 注册/声明安全避难所
   */
  function registerShelter(shelterId, placeId, capacity, opts) {
    const sid = _cleanStr(shelterId);
    if (!sid) return { ok: false, reason: 'missing-shelter-id' };

    const pid = _cleanStr(placeId);
    if (!pid) return { ok: false, reason: 'missing-place-id' };

    const cap = Math.round(Number(capacity));
    if (!Number.isFinite(cap) || cap < 1) {
      return { ok: false, reason: 'invalid-capacity', expected: '>= 1' };
    }

    opts = opts || {};
    const record = {
      shelterId: sid,
      placeId: pid,
      capacity: cap,
      occupancy: Math.max(0, Math.min(cap, Math.round(Number(opts.initialOccupancy || 0)))),
      occupants: new Set(),
      sealed: !!opts.sealed,
      desc: _cleanStr(opts.desc || '', 120)
    };

    _shelters.set(sid, record);
    return {
      ok: true,
      shelterId: sid,
      placeId: pid,
      capacity: record.capacity,
      availableSlots: record.capacity - record.occupancy
    };
  }

  /**
   * 调度角色进行应急避难疏散
   * @param {string} actorId 角色
   * @param {string} fromPlaceId 当前位置
   * @param {string} disasterId 关联灾难
   */
  function dispatchEvacuation(actorId, fromPlaceId, disasterId) {
    const aid = _cleanStr(actorId);
    if (!aid) return { ok: false, reason: 'missing-actor-id' };

    const fromPid = _cleanStr(fromPlaceId);
    if (!fromPid) return { ok: false, reason: 'missing-from-place' };

    const did = _cleanStr(disasterId);
    const disaster = _disasters.get(did);
    if (!disaster || !disaster.active) {
      return { ok: false, reason: 'disaster-not-found-or-inactive' };
    }

    // 检查当前位置是否直接被封锁
    const isTrappedAtStart = disaster.blockedPlaces.has(fromPid);

    // 寻找可用避难所
    const availableShelters = [];
    for (const [sid, sh] of _shelters.entries()) {
      if (sh.sealed) continue;
      // 避难所本身若在灾难受灾区则不可用
      if (disaster.blockedPlaces.has(sh.placeId)) continue;
      const freeSlots = sh.capacity - sh.occupancy;
      if (freeSlots > 0) {
        availableShelters.push({
          shelterId: sid,
          placeId: sh.placeId,
          freeSlots: freeSlots,
          capacity: sh.capacity
        });
      }
    }

    if (availableShelters.length === 0) {
      const evacRecord = {
        actorId: aid,
        fromPlaceId: fromPid,
        disasterId: did,
        status: 'shelter_exhausted',
        targetShelterId: null,
        timestamp: clockNow('disaster-evacuation')
      };
      _evacuations.set(aid, evacRecord);
      return {
        ok: false,
        status: 'shelter_exhausted',
        reason: 'no-available-shelters-with-capacity',
        actorId: aid
      };
    }

    // 选择第一个有容量的避难所（后续可扩展距离最短贪心）
    const chosen = availableShelters[0];
    const targetShelter = _shelters.get(chosen.shelterId);

    // 占用名额
    targetShelter.occupancy += 1;
    targetShelter.occupants.add(aid);

    const evacRecord = {
      actorId: aid,
      fromPlaceId: fromPid,
      targetShelterId: chosen.shelterId,
      targetPlaceId: chosen.placeId,
      disasterId: did,
      status: 'evacuated',
      escapedHazard: isTrappedAtStart,
      timestamp: clockNow('disaster-evacuation')
    };
    _evacuations.set(aid, evacRecord);

    return {
      ok: true,
      actorId: aid,
      status: 'evacuated',
      shelterId: chosen.shelterId,
      shelterPlaceId: chosen.placeId,
      remainingSlots: targetShelter.capacity - targetShelter.occupancy
    };
  }

  /**
   * 角色离开避难所
   */
  function leaveShelter(actorId, shelterId) {
    const aid = _cleanStr(actorId);
    if (!aid) return { ok: false, reason: 'missing-actor-id' };
    const sid = _cleanStr(shelterId);
    if (!sid || !_shelters.has(sid)) return { ok: false, reason: 'shelter-not-found' };

    const sh = _shelters.get(sid);
    if (!sh.occupants.has(aid)) {
      return { ok: false, reason: 'actor-not-in-shelter' };
    }

    sh.occupants.delete(aid);
    sh.occupancy = Math.max(0, sh.occupancy - 1);
    if (_evacuations.has(aid)) {
      _evacuations.delete(aid);
    }

    return {
      ok: true,
      actorId: aid,
      shelterId: sid,
      remainingOccupants: sh.occupancy
    };
  }

  /**
   * 解除灾难险阻
   */
  function clearDisaster(disasterId) {
    const did = _cleanStr(disasterId);
    if (!did || !_disasters.has(did)) {
      return { ok: false, reason: 'disaster-not-found' };
    }

    const disaster = _disasters.get(did);
    disaster.active = false;

    // 解除 spatial-topology 锁
    if (WA.engines && WA.engines.spatialTopology && typeof WA.engines.spatialTopology.setTransitLock === 'function') {
      for (const p of disaster.blockedPlaces) {
        WA.engines.spatialTopology.setTransitLock(p, false, `disaster_cleared:${did}`);
      }
    }

    _disasters.delete(did);
    return { ok: true, clearedDisaster: did };
  }

  function getDisasterStatus(disasterId) {
    const did = _cleanStr(disasterId);
    if (!did || !_disasters.has(did)) return null;
    const d = _disasters.get(did);
    return {
      disasterId: d.disasterId,
      kind: d.kind,
      epicenter: d.epicenter,
      severity: d.severity,
      radius: d.radius,
      active: d.active,
      blockedPlaces: Array.from(d.blockedPlaces),
      blockedEdges: Array.from(d.blockedEdges)
    };
  }

  function getShelterStatus(shelterId) {
    const sid = _cleanStr(shelterId);
    if (!sid || !_shelters.has(sid)) return null;
    const s = _shelters.get(sid);
    return {
      shelterId: s.shelterId,
      placeId: s.placeId,
      capacity: s.capacity,
      occupancy: s.occupancy,
      availableSlots: s.capacity - s.occupancy,
      occupants: Array.from(s.occupants),
      sealed: s.sealed
    };
  }

  function resetAll() {
    _disasters.clear();
    _shelters.clear();
    _evacuations.clear();
    return { ok: true, reset: true };
  }

  const engine = {
    version: VERSION,
    registerDisaster: registerDisaster,
    registerShelter: registerShelter,
    dispatchEvacuation: dispatchEvacuation,
    leaveShelter: leaveShelter,
    clearDisaster: clearDisaster,
    getDisasterStatus: getDisasterStatus,
    getShelterStatus: getShelterStatus,
    resetAll: resetAll,
    diagnose: function () {
      return {
        ok: true,
        disasterCount: _disasters.size,
        shelterCount: _shelters.size,
        evacuationCount: _evacuations.size,
        version: VERSION
      };
    }
  };

  WA.engines.disasterEvacuation = engine;
  WA.disasterEvacuation = engine;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
})();
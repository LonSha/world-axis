/**
 * WorldAxis engines/terrain-hazard.js (v2.302.0)
 * OPV13-4 地理通达度演化、险道阻隔与季节性天堑
 *
 * 机制设计：
 *   1. 地图边拓扑增加动态通行阻力因子（traversabilityFactor）；
 *   2. 暴风雪、泥石流、汛期等极端气象与季节将关键通道状态置为 blocked 或 hazardous；
 *   3. 强行通过需执行高难度体能检定（forceTraverse），失败将发生物资沉没倾覆或人员冻伤失散；
 *   4. 与 world / weather / actionDesk 深度耦合，形成不可穿透的自然界限。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_terrain_hazard_settings_v1';
  const DEF = {
    enabled: true,
    maxHazards: 32,
    maxTraverseLogs: 64,
    defaultHazardDifficulty: 70
  };
  const __REG = {
    key: LS_KEY, def: DEF, module: 'terrainHazard',
    bounds: { maxHazards: [4, 64], maxTraverseLogs: [8, 128] }
  };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { assessed: 0, blocked: 0, unblocked: 0, forcedAttempts: 0, casualties: 0, lastReason: '', faults: {} };
  function noteFault(reason) {
    stat.faults[reason] = (stat.faults[reason] || 0) + 1;
    stat.lastReason = reason;
  }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v || '').slice(0, max || 60); }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }

  function openHazardStore(draft) {
    draft.terrainHazard = draft.terrainHazard && typeof draft.terrainHazard === 'object' && !Array.isArray(draft.terrainHazard)
      ? draft.terrainHazard : { hazards: [], logs: [] };
    if (!Array.isArray(draft.terrainHazard.hazards)) draft.terrainHazard.hazards = [];
    if (!Array.isArray(draft.terrainHazard.logs)) draft.terrainHazard.logs = [];
    return draft.terrainHazard;
  }

  function channelKey(from, to) {
    const a = clean(from, 40), b = clean(to, 40);
    return a < b ? (a + '~' + b) : (b + '~' + a);
  }

  /**
   * 1. 评估通道的自然通行阻力与受阻状态
   */
  function assessPassability(from, to, opts) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const f = clean(from, 40), t = clean(to, 40);
    if (!f || !t || f === t) { noteFault('bad-places'); return { ok: false, reason: 'bad-places' }; }
    const o = opts || {};
    const key = channelKey(f, t);

    // 查询人工登记或自然发生的险道灾害
    const st = state();
    const storeHz = (st.terrainHazard && Array.isArray(st.terrainHazard.hazards)) ? st.terrainHazard.hazards : [];
    const activeHazard = storeHz.filter(function (h) { return h && h.key === key && h.status === 'blocked'; })[0];

    // 查询季节与天气修正
    let curSeason = 'spring';
    if (WA.weather && typeof WA.weather.season === 'function') {
      const s = WA.weather.season();
      if (s && s.ok && s.season) curSeason = s.season;
    }
    const envSeason = clean(o.season, 20) || curSeason;
    const weatherKind = clean(o.weather, 20) || (WA.weather && typeof WA.weather.weatherOf === 'function' ? WA.weather.weatherOf(t) : 'clear');
    const terrainType = clean(o.terrainType, 20) || 'mountain'; // mountain, canyon, river, marsh, plain

    let traversabilityFactor = 1.0;
    let status = 'open';
    let riskLevel = 'safe';
    let reason = '通途无阻';

    if (activeHazard) {
      status = 'blocked';
      traversabilityFactor = 9.9;
      riskLevel = 'lethal';
      reason = activeHazard.reason || '极端自然天堑阻隔';
    } else if (envSeason === 'winter' && (terrainType === 'mountain' || terrainType === 'canyon')) {
      status = 'hazardous';
      traversabilityFactor = 2.5;
      riskLevel = 'dangerous';
      reason = '寒冬大雪封山，积雪深没马膝，栈道极度湿滑';
    } else if (weatherKind === 'storm' || weatherKind === 'snow') {
      status = 'hazardous';
      traversabilityFactor = 2.0;
      riskLevel = 'dangerous';
      reason = '极端暴风雪肆虐，视线受阻且有落石泥石流风险';
    } else if (terrainType === 'river' && envSeason === 'summer') {
      traversabilityFactor = 1.5;
      riskLevel = 'caution';
      reason = '夏汛水势湍急，轮渡需谨慎候潮';
    }

    stat.assessed++;
    stat.lastReason = 'assessed';
    return {
      ok: true,
      from: f,
      to: t,
      channelKey: key,
      status: status,
      traversabilityFactor: traversabilityFactor,
      riskLevel: riskLevel,
      terrainType: terrainType,
      season: envSeason,
      weather: weatherKind,
      reason: reason,
      canPassNormally: status === 'open',
      recommendDetour: status !== 'open'
    };
  }

  /**
   * 2. 标记关键通道因极端灾害阻断
   */
  function blockChannel(from, to, reason, opts) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const f = clean(from, 40), t = clean(to, 40), why = clean(reason || '暴风雪封山阻断', 80);
    if (!f || !t || f === t) { noteFault('bad-places'); return { ok: false, reason: 'bad-places' }; }
    const o = opts || {};
    const key = channelKey(f, t);
    const hazardType = clean(o.type || 'blizzard', 30);
    const difficulty = Math.max(30, Math.min(95, num(o.difficulty) !== null ? num(o.difficulty) : cfg.defaultHazardDifficulty));

    let out = null;
    WA.store.transact(function (draft) {
      const store = openHazardStore(draft);
      let hit = store.hazards.filter(function (h) { return h && h.key === key; })[0];
      const now = clockNow('terrainHazard');
      if (!hit) {
        hit = {
          key: key,
          from: f,
          to: t,
          status: 'blocked',
          type: hazardType,
          reason: why,
          difficulty: difficulty,
          blockedAt: now,
          updatedAt: now
        };
        store.hazards.push(hit);
      } else {
        hit.status = 'blocked';
        hit.type = hazardType;
        hit.reason = why;
        hit.difficulty = difficulty;
        hit.updatedAt = now;
      }
      WA.evict.array(store.hazards, 'terrainHazard.hazards', cfg.maxHazards);

      // 同步联动 world 引擎路段封锁（若 world 存在）
      if (WA.world && typeof WA.world.addBlock === 'function') {
        WA.world.addBlock('hazard', 'disaster', f + '~' + t, ['person', 'goods'], { why: why });
      }

      out = Object.assign({ ok: true }, hit);
    }, 'terrainHazard:blockChannel');

    if (out && out.ok) { stat.blocked++; stat.lastReason = 'channel-blocked'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 3. 解除通道阻断
   */
  function unblockChannel(from, to) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const f = clean(from, 40), t = clean(to, 40);
    if (!f || !t) { noteFault('bad-places'); return { ok: false, reason: 'bad-places' }; }
    const key = channelKey(f, t);

    let out = null;
    WA.store.transact(function (draft) {
      const store = openHazardStore(draft);
      const hit = store.hazards.filter(function (h) { return h && h.key === key; })[0];
      if (!hit) { out = { ok: false, reason: 'not-blocked', key: key }; return false; }
      hit.status = 'open';
      hit.updatedAt = clockNow('terrainHazard');
      out = { ok: true, key: key, status: 'open', lifted: true };
    }, 'terrainHazard:unblockChannel');

    if (out && out.ok) { stat.unblocked++; stat.lastReason = 'channel-unblocked'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 4. 强行翻越险道天堑（体能与生存对抗检定）
   */
  function forceTraverse(who, from, to, opts) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const personId = clean(who, 60), f = clean(from, 40), t = clean(to, 40);
    if (!personId || !f || !t) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const o = opts || {};
    const key = channelKey(f, t);

    const st = state();
    const storeHz = (st.terrainHazard && Array.isArray(st.terrainHazard.hazards)) ? st.terrainHazard.hazards : [];
    const activeHazard = storeHz.filter(function (h) { return h && h.key === key && h.status === 'blocked'; })[0];
    const difficulty = activeHazard ? (activeHazard.difficulty || cfg.defaultHazardDifficulty) : 50;

    const person = (st.people && st.people['p_' + personId]) || (st.people && st.people[personId]);
    const currentStamina = person && person.resources ? (num(person.resources.stamina) || 20) : 20;

    // 检定计算：可显式传入 roll，或根据体能加成计算
    const roll = num(o.roll) !== null ? num(o.roll) : Math.floor(Math.random() * 100) + 1;
    const isSuccess = roll >= difficulty;

    let out = null;
    WA.store.transact(function (draft) {
      const store = openHazardStore(draft);
      const p = (draft.people && draft.people['p_' + personId]) || (draft.people && draft.people[personId]);
      const now = clockNow('terrainHazard');

      if (isSuccess) {
        // 【翻越成功但代价惨重】：耗尽大量体能，受寒应激
        const staminaCost = Math.min(currentStamina, Math.max(10, Math.floor(difficulty * 0.4)));
        if (p) {
          p.resources = p.resources || {};
          p.resources.stamina = Math.max(0, (num(p.resources.stamina) || currentStamina) - staminaCost);
          p.stress = Math.min(100, (num(p.stress) || 0) + 15);
          p.location = t; // 成功抵达对面
        }
        const logRec = {
          id: 'log_' + now + '_' + store.logs.length,
          who: personId,
          from: f,
          to: t,
          roll: roll,
          difficulty: difficulty,
          outcome: 'success',
          staminaCost: staminaCost,
          at: now
        };
        store.logs.push(logRec);
        WA.evict.array(store.logs, 'terrainHazard.logs', cfg.maxTraverseLogs);

        out = {
          ok: true,
          status: 'success',
          who: personId,
          destination: t,
          roll: roll,
          difficulty: difficulty,
          staminaCost: staminaCost,
          staminaLeft: p && p.resources ? p.resources.stamina : 0,
          summary: '队伍咬牙顶着暴风雪翻过绝壁悬崖，虽人困马乏，终安全抵达！'
        };
      } else {
        // 【翻越惨败】：货物倾覆沉没，人员重伤/冻伤昏厥，被迫折返原处
        stat.casualties++;
        let lostGoods = null;
        if (p) {
          p.resources = p.resources || {};
          p.resources.stamina = 0; // 体力彻底耗尽
          p.stress = Math.min(100, (num(p.stress) || 0) + 40);
          p.trauma = Math.min(100, (num(p.trauma) || 0) + 25);
          // 倾覆扣除随身物资（例如货物、药材、粮食等）
          const resKeys = Object.keys(p.resources).filter(function (k) { return k !== 'stamina' && (p.resources[k] || 0) > 0; });
          if (resKeys.length) {
            const targetRes = resKeys[0];
            const lostQty = Math.max(1, Math.floor((p.resources[targetRes] || 1) * 0.5));
            p.resources[targetRes] -= lostQty;
            lostGoods = { resource: targetRes, lostQty: lostQty };
          }
          p.life = p.life || {};
          p.life.commitments = Array.isArray(p.life.commitments) ? p.life.commitments : [];
          p.life.commitments.push({
            type: 'survival_injury',
            cause: 'canyon_blizzard_fall',
            injury: '严重冻伤与右足骨折',
            timestamp: now
          });
          p.location = f; // 狼狈退回起点
        }

        const logRec = {
          id: 'log_' + now + '_' + store.logs.length,
          who: personId,
          from: f,
          to: t,
          roll: roll,
          difficulty: difficulty,
          outcome: 'failed',
          lostGoods: lostGoods,
          at: now
        };
        store.logs.push(logRec);
        WA.evict.array(store.logs, 'terrainHazard.logs', cfg.maxTraverseLogs);

        out = {
          ok: true,
          status: 'failed',
          who: personId,
          reboundedTo: f,
          roll: roll,
          difficulty: difficulty,
          lostGoods: lostGoods,
          injury: '严重冻伤与摔伤',
          summary: '强渡天堑遭遇雪崩与暗冰滑坠，物资辎重倾覆谷底，全员重伤溃退！'
        };
      }
    }, 'terrainHazard:forceTraverse');

    if (out && out.ok) {
      stat.forcedAttempts++;
      stat.lastReason = out.status === 'success' ? 'traverse-success' : 'traverse-failed';
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  WA.terrainHazard = {
    assessPassability: assessPassability,
    blockChannel: blockChannel,
    unblockChannel: unblockChannel,
    forceTraverse: forceTraverse
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/terrain-hazard.js', { kind: 'engine', ver: '2.302.0' });
  }
})();
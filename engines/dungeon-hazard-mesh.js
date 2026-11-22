/**
 * WorldAxis engines/dungeon-hazard-mesh.js (v2.380.0)
 * EXV21-6: 动态地下城地牢迷宫、机关陷阱拓扑与秘境演变引擎 (Dungeon Hazard Mesh, Labyrinth Topology & Trap Cascade Engine)
 *
 * ── 核心架构哲学（Genre-Neutral Architecture）─────────────────────────
 * 无论是古老帝王地宫、修仙上古洞府秘境、克苏鲁地下迷窟还是废土核弹掩体与生化地下实验室，统一抽象为有向拓扑网格（Room Node DAG）：
 *  1. 房间节点与连通拓扑模型（Room Node & Passage Mesh）：
 *     - 节点类型（nodeType）: 'entrance' (入口大厅), 'corridor' (回廊回旋), 'chamber' (密室石室), 'vault' (核心藏宝殿), 'flooded_shaft' (蓄水坑道);
 *     - 连通状态（connectionStatus）: 'open' (通行), 'locked' (锁死), 'portcullis_down' (断龙石压下), 'rubble_blocked' (塌方乱石堆积);
 *     - 机关陷阱级联（hazardTraps）: pressure_plate (重力踏板), poison_darts (毒弩排箭), rolling_boulder (滚石碾压), toxic_gas (毒气弥漫).
 *  2. 秘境动力学与破壁爆破（Disaster Clock & Demolition）：
 *     - disasterClock: 秘境灾难倒计时（地火熔岩上升、毒气充满、洞窟塌陷）；
 *     - triggerTrap: 误踩机关引发门扇阻断与复合伤害；
 *     - breachWall: 使用炸药或重工器械爆破虚弱墙壁开辟新通路。
 *  3. 破坏性负控制与状态持久化：
 *     - 面对坚不可摧承重墙（impenetrable）且无爆破物强行肉身穿墙，严格驳回（refusal: 'impenetrable-barrier'）；
 *     - 探索已彻底坍塌毁坏的死绝房间驳回（refusal: 'room-node-collapsed'）；
 *     - 地牢迷宫状态落入 store.dungeons 台账。
 */
'use strict';

(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  WA.engines = WA.engines || {};

  const VERSION = '2.380.0';
  const LS_KEY = 'worldaxis_dungeon_hazard_mesh_settings_v1';

  const DEF = {
    enabled: true,
    maxDungeons: 20,
    baseTrapDamage: 35,
    collapseClockMax: 30
  };

  let stat = {
    dungeonsGenerated: 0,
    roomsTraversed: 0,
    trapsTriggered: 0,
    wallsBreached: 0,
    refusals: 0,
    lastReason: ''
  };

  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'dungeonHazardMesh'
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

  function cleanStr(s, max) { return String(s || '').trim().slice(0, max || 80); }
  function clamp(v, min, max) { const n = Number(v); if (isNaN(n)) return min; return Math.max(min, Math.min(max, n)); }
  function clockNow(site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } }
  function noteFault(r) { stat.refusals++; stat.lastReason = String(r || 'unknown'); }

  function getStore(draft) {
    const target = draft || (WA.store ? WA.store.get() : null);
    if (!target) return null;
    if (!target.dungeons || typeof target.dungeons !== 'object') {
      if (draft) target.dungeons = { meshes: {}, log: [] };
      return draft ? target.dungeons : null;
    }
    return target.dungeons;
  }

  function generateDungeon(dungeonId, spec) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    const did = cleanStr(dungeonId, 40);
    if (!did) {
      noteFault('invalid-dungeon-id');
      return { ok: false, refusal: 'invalid-dungeon-id' };
    }

    stat.dungeonsGenerated++;
    const p = spec || {};
    const record = {
      dungeonId: did,
      name: cleanStr(p.name || did, 60),
      theme: cleanStr(p.theme || 'Ancient Crypt', 40),
      disasterClock: clamp(p.disasterClock || settings().collapseClockMax, 1, 100),
      clockActive: !!p.clockActive,
      nodes: {
        entry: {
          nodeId: 'entry',
          title: 'Entrance Hall',
          nodeType: 'entrance',
          status: 'intact',
          connections: ['corridor_1'],
          trap: null,
          weakWall: false
        },
        corridor_1: {
          nodeId: 'corridor_1',
          title: 'Trapped Antechamber',
          nodeType: 'corridor',
          status: 'intact',
          connections: ['entry', 'vault'],
          trap: { kind: 'pressure_plate', armed: true, damage: 30 },
          weakWall: true
        },
        vault: {
          nodeId: 'vault',
          title: 'Inner Relic Sanctum',
          nodeType: 'vault',
          status: 'intact',
          connections: ['corridor_1'],
          trap: { kind: 'poison_darts', armed: true, damage: 45 },
          weakWall: false
        }
      },
      updatedAt: clockNow('dungeon:generate')
    };

    let capacityReached = false;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const s = getStore(draft);
        if (s && !s.meshes[did] && Object.keys(s.meshes).length >= Math.max(1, Math.floor(settings().maxDungeons))) {
          capacityReached = true;
          return;
        }
        if (s) {
          s.meshes[did] = record;
        }
      });
    }

    if (capacityReached) return { ok: false, reason: 'capacity-reached' };
    return { ok: true, dungeon: record };
  }

  function navigateOrTrigger(dungeonId, actionSpec, opts) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    const did = cleanStr(dungeonId, 40);
    const st = getStore();
    if (!st || !st.meshes || !st.meshes[did]) {
      noteFault('dungeon-not-found');
      return { ok: false, refusal: 'dungeon-not-found', dungeonId: did };
    }

    const dungeon = Object.assign({}, st.meshes[did]);
    const p = actionSpec || {};
    const action = cleanStr(p.action || 'traverse', 30);
    const targetNodeId = cleanStr(p.nodeId || 'entry', 40);

    const node = dungeon.nodes[targetNodeId];
    if (!node) {
      noteFault('node-not-found');
      return { ok: false, refusal: 'node-not-found', nodeId: targetNodeId };
    }

    // 负控制拦截：已坍塌毁灭的房间严禁通行
    if (node.status === 'collapsed') {
      noteFault('room-node-collapsed');
      return {
        ok: false,
        refusal: 'room-node-collapsed',
        nodeId: targetNodeId,
        reason: 'The chamber is utterly crushed by boulders and impassable.'
      };
    }

    switch (action) {
      case 'traverse': {
        stat.roomsTraversed++;
        let trapDamage = 0;
        let trapSprung = false;

        // 检查并触发陷阱
        if (node.trap && node.trap.armed) {
          stat.trapsTriggered++;
          trapSprung = true;
          trapDamage = node.trap.damage || settings().baseTrapDamage;
          node.trap.armed = false; // 触发后卸除或一次性失效
        }

        // 灾难倒计时流逝
        if (dungeon.clockActive && dungeon.disasterClock > 0) {
          dungeon.disasterClock -= 1;
          if (dungeon.disasterClock <= 0) {
            node.status = 'collapsed';
          }
        }

        dungeon.updatedAt = clockNow('dungeon:traverse');

        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s && s.meshes[did]) {
              s.meshes[did] = dungeon;
              s.log.push({ op: 'traverse', did, targetNodeId, trapSprung, trapDamage, at: clockNow() });
            }
          });
        }

        return {
          ok: true,
          op: 'traverse',
          dungeonId: did,
          currentNode: node.nodeId,
          title: node.title,
          trapSprung,
          trapDamage,
          disasterClockRemaining: dungeon.disasterClock,
          status: node.status
        };
      }

      case 'breach_wall': {
        const hasExplosives = !!p.hasExplosives;
        const breachPower = parseInt(p.breachPower, 10) || 0;

        // 破坏性负控制：面对坚不可摧墙体且毫无爆破器具，肉身强攻必驳回
        if (!node.weakWall && !hasExplosives && breachPower < 80) {
          noteFault('impenetrable-barrier');
          return {
            ok: false,
            refusal: 'impenetrable-barrier',
            nodeId: targetNodeId,
            reason: 'Wall is solid bedrock/reinforced obsidian; impossible to breach without heavy demolition explosives.'
          };
        }

        stat.wallsBreached++;
        const newPassageId = 'secret_shortcut_' + clockNow('dungeon-hazard-mesh');
        node.connections.push(newPassageId);
        dungeon.nodes[newPassageId] = {
          nodeId: newPassageId,
          title: 'Blown-out Secret Breach',
          nodeType: 'chamber',
          status: 'intact',
          connections: [node.nodeId],
          trap: null,
          weakWall: false
        };

        dungeon.updatedAt = clockNow('dungeon:breach');

        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s && s.meshes[did]) {
              s.meshes[did] = dungeon;
              s.log.push({ op: 'breach_wall', did, targetNodeId, newPassageId, at: clockNow() });
            }
          });
        }

        return {
          ok: true,
          op: 'breach_wall',
          dungeonId: did,
          breachedNode: targetNodeId,
          newPassage: newPassageId,
          effect: 'Demolition opened an emergency detour.'
        };
      }

      default: {
        noteFault('unsupported-op');
        return { ok: false, refusal: 'unsupported-op', action };
      }
    }
  }

  function getDungeon(dungeonId) {
    const st = getStore();
    if (!st || !st.meshes) return null;
    return st.meshes[cleanStr(dungeonId, 40)] || null;
  }

  function listDungeons() {
    const st = getStore();
    if (!st || !st.meshes) return [];
    return Object.keys(st.meshes).map(k => st.meshes[k]);
  }

  function buildBlock(context) {
    if (!settings().enabled) return '';
    const dungs = listDungeons();
    if (!dungs.length) return '';

    const lines = dungs.slice(0, 3).map(d => {
      const roomCount = Object.keys(d.nodes || {}).length;
      return `【地牢迷宫·${d.name}】类型:${d.theme} 房间:${roomCount}间 灾异时钟:${d.disasterClock}轮`;
    });

    return '[地下城机关拓扑与秘境]\n' + lines.join('\n');
  }

  function diagnose() {
    return {
      version: VERSION,
      enabled: settings().enabled,
      dungeonCount: listDungeons().length,
      stat: Object.assign({}, stat)
    };
  }

  function statView() {
    return Object.assign({}, stat);
  }

  function resetStat() {
    stat = {
      dungeonsGenerated: 0,
      roomsTraversed: 0,
      trapsTriggered: 0,
      wallsBreached: 0,
      refusals: 0,
      lastReason: ''
    };
  }

  const dungeonHazardMesh = {
    version: VERSION,
    settings,
    saveSettings,
    generateDungeon,
    navigateOrTrigger,
    getDungeon,
    listDungeons,
    buildBlock,
    diagnose,
    stat: statView,
    resetStat
  };

  WA.engines.dungeonHazardMesh = dungeonHazardMesh;
  WA.dungeonHazardMesh = dungeonHazardMesh;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = dungeonHazardMesh;
  }
})();
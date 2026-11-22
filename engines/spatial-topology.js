/**
 * WorldAxis engines/spatial-topology.js (v2.328.0)
 * 空间分形拓扑与微观嵌套引擎 (Fractal Locality & Facility Affordance Matrix)
 *
 * 核心机制：
 * 1. 四级分形嵌套树：宏观区域(Region) -> 街区(Sector) -> 实体建筑/场所(Venue) -> 微观子空间/房间/楼层(SubSpace)。
 * 2. 门禁连通与物理锁止：门/通道具备物理状态（open开放 / locked锁止 / restricted需权限 / sealed断绝封死）。
 * 3. 场所功能与潜力矩阵(Affordances)：支持 shelter(遮蔽暴雨), sleep(留宿过夜), supply(水食补给), phone(公用电话), stealth(监控死角) 等。
 * 4. 真实营业作息(Operating Hours)：支持 24h、昼行、深夜夜行、黄昏闭店等，打烊时自动变为不可进入或触发驱逐。
 * 5. 纯框架中立，支持缺省自愈、纯净快照导出与正文透镜反哺。
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  WA.engines = WA.engines || {};

  const VERSION = '2.522.0';
  // v2.522.0：三容器的静态上界（写入侧硬上界，满即拒写；与 core/store.js __BOUNDED_CAPS、
  //   core/evict.js NON_EVICT 三处同名同值）。为什么是静态而不是设置项：拓扑树是世界的**结构**，
  //   不是可调偏好 —— 让用户能把节点上限调成 0 等于让地图消失；而 per-call 上界一旦与设置脱钩
  //   就变成「点了没效果的开关」。512/1024/64 按现场规模定：四级树 512 节点 ≈ 32 个场所 × 16 子空间，
  //   通道数按节点数的两倍留余量（每处场所平均 2 条门/楼梯），同时在场的角色 64 远超实际。
  const MAX = Object.freeze({ nodes: 512, portals: 1024, activeScenes: 64 });

  // 场所类型与默认功能映射
  const DEFAULT_AFFORDANCES = Object.freeze({
    convenience_store: ['supply', 'shelter', 'atm', 'light_dense'],
    izakaya: ['supply', 'social', 'stealth_corner', 'shelter'],
    hotel: ['sleep', 'shelter', 'privacy', 'bath'],
    station: ['transit', 'shelter', 'public_phone', 'crowded'],
    rooftop: ['stealth', 'sight_open', 'hazard_fall'],
    back_alley: ['stealth', 'darkness', 'blind_spot'],
    residence: ['sleep', 'privacy', 'shelter', 'personal_cache'],
    cyber_cafe: ['sleep_budget', 'shelter', 'terminal', 'semi_privacy']
  });

  const DEFAULT_TOPOLOGY_STATE = Object.freeze({
    nodes: {},           // 地点字典: id -> NodeData
    portals: [],         // 通道列表: [{ id, from, to, type, status: 'open'|'locked'|'sealed', keyId }]
    activeScenes: {}     // 角色当前所处的精准子空间映射: charName -> { nodeId, floor, room }
  });

  /**
   * 规范化地点节点
   */
  function createNode(id, opts) {
    opts = opts || {};
    return {
      id: String(id),
      name: opts.name || String(id),
      level: opts.level || 'venue', // 'region' | 'sector' | 'venue' | 'subspace'
      parentId: opts.parentId || null,
      type: opts.type || 'generic',
      affordances: Array.isArray(opts.affordances) ? opts.affordances.slice() : (DEFAULT_AFFORDANCES[opts.type] || ['shelter']),
      schedule: Object.assign({ openHour: 0, closeHour: 24, allDay: true }, opts.schedule || {}),
      capacity: typeof opts.capacity === 'number' ? opts.capacity : 20,
      metadata: Object.assign({}, opts.metadata || {})
    };
  }

  // ── v2.522.0：持久化写入通道（本轮的核心变更）─────────────────────────────
  //   此前本模块**自己持一份 `_memState`**：`getState()` 在 store 里找不到 `spatialTopology`
  //   这个键就退回进程态。于是 registerNode / connect 都返回 ok，但
  //     ① 重启后投影出来的节点全丢；② 分支复制带不走；③ mirrorStatus 只能报 persisted:false。
  //   现在（与 geoTracker / localGrid 同款三处结构）：
  //     · **读**仍走 `store.get()`（memCache 是活对象，transact 提交后就地生效）；
  //     · **写**一律走 `store.transact` —— 权限闸 / 写失败记账 / 骨架校验都在那一处；
  //     · 只有 store 不可用（裸上下文、单测）才退回进程态，且退回这件事本身是**可见的**
  //       （`stateSource()` 报 `mem` 而不是 `store`）。
  //   为什么不在两个写口各写一份：本仓反复治的就是「同一件事两本账」—— 写路径只能有一个入口。
  function blankState() {
    // 默认结构仍以 DEFAULT_TOPOLOGY_STATE 为**唯一真源**（冻结的是顶层；JSON 往返拿到可写副本）；
    //   transitLocks 是本模块自己追加的台账（按 nodeId 增删，不进骨架），故在这里补上。
    const s = JSON.parse(JSON.stringify(DEFAULT_TOPOLOGY_STATE));
    s.transitLocks = {};
    return s;
  }
  function ensureShape(st) {
    const s = (st && typeof st === 'object') ? st : blankState();
    if (!s.nodes || typeof s.nodes !== 'object') s.nodes = {};
    if (!Array.isArray(s.portals)) s.portals = [];
    if (!s.activeScenes || typeof s.activeScenes !== 'object') s.activeScenes = {};
    if (!s.transitLocks || typeof s.transitLocks !== 'object') s.transitLocks = {};
    return s;
  }
  function memState() {
    if (!spatialTopology._memState) spatialTopology._memState = blankState();
    return spatialTopology._memState;
  }
  /** 唯一写入口：返回 mutator 的返回值（失败返回 {ok:false, reason}，不吞错）。 */
  function write(fn) {
    if (WA.store && typeof WA.store.transact === 'function') {
      let out = null;
      try {
        WA.store.transact(function (draft) {
          draft.spatialTopology = ensureShape(draft.spatialTopology);
          out = fn(draft.spatialTopology);
        });
      } catch (e) {
        return { ok: false, reason: 'store-threw' };
      }
      return out;
    }
    return fn(ensureShape(memState()));
  }
  /** v2.522.0：状态来源（store / mem）—— 诊断面据此说清「这份地图存不存得下来」。 */
  function stateSource() {
    try {
      if (WA.store && typeof WA.store.get === 'function') {
        const s = WA.store.get();
        if (s && s.spatialTopology) return 'store';
      }
    } catch (e) {}
    return 'mem';
  }
  /**
   * 空间拓扑管理器
   */
  const spatialTopology = {
    version: VERSION,
    MAX: MAX,
    /**
     * 获取（不写）当前状态。**只读用途**：要改就调下面的写方法，别就地改返回值。
     */
    getState() {
      try {
        if (WA.store && typeof WA.store.get === 'function') {
          const s = WA.store.get();
          if (s && s.spatialTopology) return ensureShape(s.spatialTopology);
        }
      } catch (e) {}
      return ensureShape(memState());
    },
    /** v2.522.0：当前状态来源（'store' = 随存档持久化 / 'mem' = 仅在本次进程内） */
    stateSource: stateSource,

    /**
     * 注册或更新空间节点
     */
registerNode(id, opts) {
      // v2.522.0：走唯一写入口（transact ⇒ 持久化）。满则拒写，既有节点一条不动。
      if (id === undefined || id === null || String(id) === '') return { ok: false, reason: 'missing-id' };
      const key = String(id);
      return write(function (state) {
        if (!state.nodes[key] && Object.keys(state.nodes).length >= MAX.nodes) {
          return { ok: false, reason: 'nodes-full', cap: MAX.nodes };
        }
        const node = createNode(key, opts);
        state.nodes[key] = node;
        return { ok: true, node: node };
      });
    },
    /**
     * 批量导入预设地点拓扑（如外部世界书/东京大舞台数据）
     */
    importNodes(nodeList) {
      if (!Array.isArray(nodeList)) return { ok: false, reason: 'nodeList-must-be-array' };
      // v2.522.0：满即停（不是先写一半再报错）—— skipped 如实报被拒的条数，绝不静默丢弃。
      return write(function (state) {
        let imported = 0, skipped = 0;
        for (const item of nodeList) {
          if (!(item && item.id)) continue;
          const key = String(item.id);
          if (!state.nodes[key] && Object.keys(state.nodes).length >= MAX.nodes) { skipped++; continue; }
          state.nodes[key] = createNode(key, item);
          imported++;
        }
        return skipped ? { ok: true, count: imported, skipped: skipped, reason: 'nodes-full' }
          : { ok: true, count: imported };
      });
    },

    /**
     * 建立两点之间的门禁连接通道
     */
    connect(fromId, toId, opts) {
      opts = opts || {};
      // v2.522.0：同走唯一写入口。查重/替换在同一次事务里做（先读后写不能跨事务）。
      if (fromId === undefined || fromId === null || toId === undefined || toId === null) {
        return { ok: false, reason: 'missing-endpoint' };
      }
      return write(function (state) {
        const portal = {
          id: opts.id || (String(fromId) + '<->' + String(toId)),
          from: String(fromId),
          to: String(toId),
          type: opts.type || 'door', // 'door' | 'stair' | 'elevator' | 'street' | 'gate'
          status: opts.status || 'open', // 'open' | 'locked' | 'sealed'
          keyId: opts.keyId || null,
          bidirectional: opts.bidirectional !== false
        };
        // 查重：同一 id 视为改门禁状态（不新增），故只有**新**通道才受上界约束
        const idx = state.portals.findIndex(p => p.id === portal.id);
        if (idx >= 0) {
          state.portals[idx] = portal;
          return { ok: true, portal: portal, replaced: true };
        }
        if (state.portals.length >= MAX.portals) {
          return { ok: false, reason: 'portals-full', cap: MAX.portals };
        }
        state.portals.push(portal);
        return { ok: true, portal: portal };
      });
    },

    /**
     * 检验物理通行许可
     */
    canTraverse(fromId, toId, actorContext) {
      actorContext = actorContext || {};
      const state = this.getState();
      const toNode = state.nodes[toId];
      if (!toNode) {
        return { ok: true, direct: true, note: 'untracked-destination' };
      }

      // 1. 营业时间校验
      if (!toNode.schedule.allDay) {
        const curHour = typeof actorContext.currentHour === 'number' ? actorContext.currentHour : 14;
        const open = toNode.schedule.openHour;
        const close = toNode.schedule.closeHour;
        const isOpen = (close >= open)
          ? (curHour >= open && curHour < close)
          : (curHour >= open || curHour < close); // 跨午夜营业
        if (!isOpen) {
          return { ok: false, reason: 'closed_hours', openHour: open, closeHour: close, note: toNode.name + '当前已打烊' };
        }
      }

      // 2. 门禁连通锁止检查
      const p = state.portals.find(x =>
        (x.from === fromId && x.to === toId) ||
        (x.bidirectional && x.from === toId && x.to === fromId)
      );

      if (p) {
        if (p.status === 'sealed') {
          return { ok: false, reason: 'portal_sealed', portal: p, note: '通道已被物理封死，无法通行' };
        }
        if (p.status === 'locked') {
          const hasKey = Array.isArray(actorContext.keys) && p.keyId && actorContext.keys.includes(p.keyId);
          if (!hasKey) {
            return { ok: false, reason: 'portal_locked', portal: p, keyId: p.keyId, note: '门已被反锁，缺少对应钥匙或凭证' };
          }
        }
      }

      return { ok: true, traversable: true, portal: p || null };
    },

    /**
     * v2.381.0: 灾难封锁/解封某个地点的所有出入通道。
     *
     * 此前 disaster-evacuation 在灾难发生与解除时都以
     * `WA.engines.spatialTopology.setTransitLock(placeId, bool, reason)` 调用本方法，
     * 但引擎从未导出它 —— 于是「灾区被物理封锁、其他人不许走进来」这条联动从未生效。
     *
     * 语义：按 nodeId 找出所有 from/to 落在该地点的 portal，加锁时把 status 置为
     *   'sealed' 并把原状态压进 transitLocks 台账，解封时逐条还原 —— 不粗暴覆盖，
     *   否则原本 locked 的门禁（需要钥匙那种）会被当作 open 放行。
     *
     * @param {string} nodeId 地点 id
     * @param {boolean} locked true=封锁 / false=解封
     * @param {string} reason 归因（如 'disaster:d_xxx'），写进台账便于叙事追溯
     * @returns {{ok:boolean, nodeId:string, affected:number, locked:boolean, reason:string}}
     */
    setTransitLock(nodeId, locked, reason) {
      if (!nodeId) return { ok: false, reason: 'missing-nodeId' };
      const id = String(nodeId);
      const tag = String(reason || 'unspecified');
      // v2.522.0：锁/解封都在一次事务里（跨事务会留下「门已封、台账没记」的半写现场）。
      return write(function (state) {
        if (locked) {
          const ledger = Array.isArray(state.transitLocks[id]) ? state.transitLocks[id] : [];
          const seen = new Set(ledger.map(x => x.portalId));
          let affected = 0;
          for (const p of state.portals) {
            if (!p || (p.from !== id && p.to !== id)) continue;
            if (seen.has(p.id)) continue;           // 已登账，不重复压栈（幂等）
            ledger.push({ portalId: p.id, prevStatus: p.status, reason: tag });
            p.status = 'sealed';
            affected++;
          }
          state.transitLocks[id] = ledger;
          return { ok: true, nodeId: id, affected: affected, locked: true, reason: tag };
        }
        const ledger = Array.isArray(state.transitLocks[id]) ? state.transitLocks[id] : [];
        let restored = 0;
        for (const rec of ledger) {
          const p = state.portals.find(x => x && x.id === rec.portalId);
          if (p) { p.status = rec.prevStatus || 'open'; restored++; }
        }
        delete state.transitLocks[id];
        return { ok: true, nodeId: id, affected: restored, locked: false, reason: tag };
      });
    },
    /**
     * 角色进入具体子空间/位置
     */
    locateCharacter(charName, nodeId, detail) {
      if (!charName) return { ok: false, reason: 'missing-charName' };
      const who = String(charName);
      const d = detail || {};
      return write(function (state) {
        // 上界：只约束**新**角色，已登记角色的移动不受影响（否则场景里第 65 个角色永远动不了）
        if (!state.activeScenes[who] && Object.keys(state.activeScenes).length >= MAX.activeScenes) {
          return { ok: false, reason: 'activeScenes-full', cap: MAX.activeScenes };
        }
        state.activeScenes[who] = {
          nodeId: String(nodeId),
          floor: d.floor || null,
          room: d.room || null,
          timestamp: clockNow('spatial-topology')
        };
        return { ok: true, location: state.activeScenes[who] };
      });
    },

    /**
     * 获取角色的完整空间层级溯源（如：歌舞伎町一番街 > 风林会馆 > 3F 台球厅）
     */
    getHierarchy(nodeId) {
      const state = this.getState();
      const chain = [];
      let cur = state.nodes[nodeId];
      let depth = 0;
      while (cur && depth < 6) {
        chain.unshift(cur);
        if (!cur.parentId || !state.nodes[cur.parentId]) break;
        cur = state.nodes[cur.parentId];
        depth++;
      }
      return chain;
    },

    /**
     * 查询某角色所在位置的功能潜力
     */
    getAffordancesFor(charName) {
      const state = this.getState();
      const loc = state.activeScenes[charName];
      if (!loc) return [];
      const node = state.nodes[loc.nodeId];
      return node ? node.affordances : [];
    },
    /**
     * OPV19-3: 水文洋流、气象与声学视口在空间拓扑的级联感知评估
     */
    evaluateSensoryOcclusion(sourceId, targetId, envCondition) {
      envCondition = envCondition || {};
      const weather = String(envCondition.weather || 'clear');
      const lightLevel = envCondition.lightLevel != null ? Number(envCondition.lightLevel) : 100; // 0~100
      const distance = envCondition.distance != null ? Number(envCondition.distance) : 10; // 米

      let visualOcclusion = 0; // 0~100% 遮蔽
      let acousticOcclusion = 0;

      // 气象与光照视锥衰减
      if (lightLevel <= 20 || weather.indexOf('fog') !== -1 || weather.indexOf('night') !== -1) {
        visualOcclusion = 85; // 浓雾/暗夜视线极度受阻
      } else if (lightLevel <= 50) {
        visualOcclusion = 40;
      }

      // 暴雨与风暴声学掩盖
      if (weather.indexOf('storm') !== -1 || weather.indexOf('rain') !== -1) {
        acousticOcclusion = 80;
      }

      const canSee = distance <= (visualOcclusion >= 80 ? 5 : 40);
      const canHear = acousticOcclusion < 75;

      return {
        ok: true,
        sourceId: sourceId,
        targetId: targetId,
        weather: weather,
        lightLevel: lightLevel,
        distance: distance,
        visualOcclusionPct: visualOcclusion,
        acousticOcclusionPct: acousticOcclusion,
        canSee: canSee,
        canHear: canHear,
        stealthViable: !canSee && !canHear
      };
    },
    /**
     * 叙事透镜 Prompt 构建器
     */
    buildBlock() {
      const state = this.getState();
      const charEntries = Object.entries(state.activeScenes);
      if (charEntries.length === 0) return '';

      const lines = ['【微观空间与拓扑】'];
      for (const [charName, loc] of charEntries) {
        const chain = this.getHierarchy(loc.nodeId);
        const pathStr = chain.length > 0 ? chain.map(n => n.name).join(' 〉') : loc.nodeId;
        const sub = [];
        if (loc.floor) sub.push(loc.floor);
        if (loc.room) sub.push(loc.room);
        const subStr = sub.length > 0 ? ` [${sub.join(' · ')}]` : '';
        const node = state.nodes[loc.nodeId];
        const affStr = (node && node.affordances && node.affordances.length > 0)
          ? ` (空间功能: ${node.affordances.slice(0, 3).join('/')})`
          : '';
        lines.push(`· ${charName}: ${pathStr}${subStr}${affStr}`);
      }
      return lines.join('\n');
    }
  };

  WA.engines.spatialTopology = spatialTopology;
  WA.spatialTopology = spatialTopology;
})();

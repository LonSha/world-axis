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
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  WA.engines = WA.engines || {};

  const VERSION = '2.328.0';

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

  /**
   * 空间拓扑管理器
   */
  const spatialTopology = {
    version: VERSION,

    /**
     * 获取或初始化状态
     */
    getState() {
      if (WA.store && typeof WA.store.get === 'function') {
        const s = WA.store.get();
        if (s && s.spatialTopology) return s.spatialTopology;
      }
      if (!this._memState) {
        this._memState = JSON.parse(JSON.stringify(DEFAULT_TOPOLOGY_STATE));
      }
      return this._memState;
    },

    /**
     * 注册或更新空间节点
     */
    registerNode(id, opts) {
      const state = this.getState();
      const node = createNode(id, opts);
      state.nodes[id] = node;
      return { ok: true, node };
    },

    /**
     * 批量导入预设地点拓扑（如外部世界书/东京大舞台数据）
     */
    importNodes(nodeList) {
      if (!Array.isArray(nodeList)) return { ok: false, reason: 'nodeList-must-be-array' };
      const state = this.getState();
      let imported = 0;
      for (const item of nodeList) {
        if (item && item.id) {
          state.nodes[item.id] = createNode(item.id, item);
          imported++;
        }
      }
      return { ok: true, count: imported };
    },

    /**
     * 建立两点之间的门禁连接通道
     */
    connect(fromId, toId, opts) {
      opts = opts || {};
      const state = this.getState();
      const portal = {
        id: opts.id || (fromId + '<->' + toId),
        from: String(fromId),
        to: String(toId),
        type: opts.type || 'door', // 'door' | 'stair' | 'elevator' | 'street' | 'gate'
        status: opts.status || 'open', // 'open' | 'locked' | 'sealed'
        keyId: opts.keyId || null,
        bidirectional: opts.bidirectional !== false
      };
      // 查重
      const idx = state.portals.findIndex(p => p.id === portal.id);
      if (idx >= 0) {
        state.portals[idx] = portal;
      } else {
        state.portals.push(portal);
      }
      return { ok: true, portal };
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
     * 角色进入具体子空间/位置
     */
    locateCharacter(charName, nodeId, detail) {
      if (!charName) return { ok: false, reason: 'missing-charName' };
      const state = this.getState();
      detail = detail || {};
      state.activeScenes[charName] = {
        nodeId: String(nodeId),
        floor: detail.floor || null,
        room: detail.room || null,
        timestamp: Date.now()
      };
      return { ok: true, location: state.activeScenes[charName] };
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

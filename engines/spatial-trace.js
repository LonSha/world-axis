/**
 * WorldAxis engines/spatial-trace.js (v2.328.0)
 * 空间物理痕迹与环境残留引擎 (Physical Trace Decay & Discovery Lens)
 *
 * 核心机制：
 * 1. 物理痕迹与感官残留沉淀 (Trace Types & Half-life Decay)：
 *    - `cigarette`: 熄灭烟头与焦油烟气 (半衰期 2.0h)；
 *    - `perfume`: 幽微香水与洗发水香气 (半衰期 3.5h)；
 *    - `puddle`: 雨伞滴落水洼或湿泥脚印 (半衰期 0.8h)；
 *    - `receipt`: 丢弃或揉成一团的便利店票据 (半衰期 24.0h)；
 *    - `struggle`: 物品打翻、桌椅移位的争执痕迹 (半衰期 48.0h)；
 *    - `blood`: 细微血迹或擦拭残留 (半衰期 72.0h)。
 * 2. 衰减与清洁淘汰机制 (Decay Math & Eviction)：
 *    - 强度公式：strength = initialStrength * Math.pow(0.5, elapsedHours / halfLifeHours)；
 *    - 强度低于 0.05 自动消散剔除，单地点最多缓存 8 条高权重残留，严格防止账本膨胀。
 * 3. 后到者勘验与叙事透镜 (Discovery & Sensory Lens)：
 *    - 当其他角色进入该空间时，自动提取感知可见的残留物与气味，
 *      生成“【空间痕迹与现场勘验】”透镜反哺给模型，让追踪、推理与前后脚擦肩而过充满细节！
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  WA.engines = WA.engines || {};

  const VERSION = '2.328.0';

  const TRACE_SPECS = Object.freeze({
    cigarette: { name: '烟头与烟草气味', halfLife: 2.0, sensory: 'smell', desc: '刚熄灭不久的烟草辛辣焦味' },
    perfume: { name: '淡雅香水残留', halfLife: 3.5, sensory: 'smell', desc: '空气中依稀萦绕着特异的香水前调' },
    puddle: { name: '雨伞水渍与湿泥印', halfLife: 0.8, sensory: 'sight', desc: '地面尚未风干的水渍滴落圆印' },
    receipt: { name: '揉皱的消费小票', halfLife: 24.0, sensory: 'sight', desc: '角落揉成一团的便利店收银小票' },
    struggle: { name: '物品翻动打斗痕迹', halfLife: 48.0, sensory: 'sight', desc: '桌椅移位与急促争执抓扯的痕迹' },
    blood: { name: '微量干涸血痕', halfLife: 72.0, sensory: 'sight', desc: '踢脚线边缘暗红色已干涸的飞溅血点' }
  });

  const DEFAULT_TRACE_STATE = Object.freeze({
    tracesByNode: {} // nodeId -> [TraceItem]
  });

  const spatialTrace = {
    version: VERSION,

    getState() {
      if (WA.store && typeof WA.store.get === 'function') {
        const s = WA.store.get();
        if (s && s.spatialTrace) return s.spatialTrace;
      }
      if (!this._memState) {
        this._memState = JSON.parse(JSON.stringify(DEFAULT_TRACE_STATE));
      }
      return this._memState;
    },

    /**
     * 留下新痕迹
     * @param {string} nodeId 地点ID
     * @param {string} type 痕迹类型 ('cigarette'|'perfume'|'puddle'|'receipt'|'struggle'|'blood')
     * @param {object} opts { sourceChar, customDesc, initialStrength, createdHour }
     */
    leaveTrace(nodeId, type, opts) {
      if (!nodeId || !type) return { ok: false, reason: 'missing-nodeId-or-type' };
      opts = opts || {};
      const state = this.getState();
      state.tracesByNode[nodeId] = state.tracesByNode[nodeId] || [];

      const spec = TRACE_SPECS[type] || { name: type, halfLife: 4.0, sensory: 'sight', desc: '不明物理残留' };
      const trace = {
        id: 'tr_' + WA.rand.next('spatial-trace').toString(36).slice(2, 9),
        type,
        name: spec.name,
        sensory: spec.sensory,
        desc: opts.customDesc || spec.desc,
        sourceChar: opts.sourceChar || null,
        initialStrength: typeof opts.initialStrength === 'number' ? Math.max(0.1, Math.min(1.0, opts.initialStrength)) : 1.0,
        halfLifeHours: spec.halfLife,
        createdHour: typeof opts.createdHour === 'number' ? opts.createdHour : 12.0,
        createdAt: clockNow('spatial-trace')
      };

      state.tracesByNode[nodeId].push(trace);
      // 容量控制：每个节点最多保留 8 条痕迹
      if (state.tracesByNode[nodeId].length > 8) {
        state.tracesByNode[nodeId].shift();
      }

      return { ok: true, trace };
    },

    /**
     * 衰减并获取某地点当前的全部有效痕迹
     * @param {string} nodeId
     * @param {number} currentHour 当前世界时间小时 (用于计算半衰期)
     */
    inspectTraces(nodeId, currentHour) {
      const state = this.getState();
      const list = state.tracesByNode[nodeId] || [];
      if (list.length === 0) return [];

      currentHour = typeof currentHour === 'number' ? currentHour : 14.0;
      const survivors = [];

      for (const t of list) {
        let elapsed = currentHour - t.createdHour;
        if (elapsed < 0) elapsed += 24.0; // 跨天补齐
        const strength = t.initialStrength * Math.pow(0.5, elapsed / t.halfLifeHours);

        if (strength >= 0.08) {
          let freshness = '依稀可辨';
          if (strength >= 0.65) freshness = '新鲜刚留';
          else if (strength >= 0.35) freshness = '散去大半';

          survivors.push(Object.assign({}, t, {
            currentStrength: parseFloat(strength.toFixed(2)),
            freshness,
            elapsedHours: parseFloat(elapsed.toFixed(1))
          }));
        }
      }

      // 更新清理沉淀
      state.tracesByNode[nodeId] = survivors.map(s => {
        const copy = Object.assign({}, s);
        delete copy.currentStrength;
        delete copy.freshness;
        delete copy.elapsedHours;
        return copy;
      });

      return survivors;
    },

    /**
     * 清理或抹除某地点的特定痕迹 (如擦拭/毁尸灭迹)
     */
    sweepTraces(nodeId, type) {
      const state = this.getState();
      if (!state.tracesByNode[nodeId]) return { ok: true, swept: 0 };
      const before = state.tracesByNode[nodeId].length;
      if (!type || type === 'all') {
        state.tracesByNode[nodeId] = [];
      } else {
        state.tracesByNode[nodeId] = state.tracesByNode[nodeId].filter(x => x.type !== type);
      }
      return { ok: true, swept: before - state.tracesByNode[nodeId].length };
    },

    /**
     * OPV16-4: 物证与感官痕迹的环境介质吸附与异化演化 (Trace Medium Adsorption & Environmental Weathering)
     * 多孔泥土、毛毯吸附延长半衰期；水流冲刷加速消除；焚烧产生异化不可逆残渣
     */
    evolveTrace(nodeId, traceId, mediumType, opts) {
      const state = this.getState();
      const list = state.tracesByNode[nodeId] || [];
      const trace = list.find(t => t.id === traceId);
      if (!trace) return { ok: false, error: 'trace_not_found' };

      const opt = opts || {};
      const weather = opt.weather || 'clear';
      const rainAmount = typeof opt.rainAmount === 'number' ? opt.rainAmount : (weather === 'rain' ? 30 : 0);
      const isFire = Boolean(opt.isFire);

      // 负控制拦截：不可溶的物理微观刻痕（如匕首划痕、岩石裂痕）在水流冲刷下绝不降解
      if (trace.type === 'scratch' || trace.type === 'carving') {
        return {
          ok: true,
          traceId: traceId,
          strength: trace.strength || 100,
          weathered: false,
          adsorbed: false,
          message: 'Insoluble physical carving is impervious to water wash.'
        };
      }

      let curStrength = typeof trace.strength === 'number' ? trace.strength : 100;

      // 1. 介质吸附修正
      let halfLifeFactor = 1.0;
      if (mediumType === 'carpet' || mediumType === 'soil' || mediumType === 'wood_unpainted') {
        halfLifeFactor = 3.0; // 多孔材质延长 3 倍
      }

      // 2. 水流降雨冲刷
      if (rainAmount > 10 && trace.type !== 'carving') {
        const washDrain = rainAmount * 2.5;
        curStrength = Math.max(0, curStrength - washDrain);
      }

      // 3. 烈火焚烧异化
      let isCarbonized = false;
      if (isFire) {
        curStrength = Math.max(5, curStrength * 0.15); // 破坏至不可辨识
        trace.desc = (trace.desc || '') + ' [已高温碳化变质]';
        isCarbonized = true;
      }

      trace.strength = Math.round(curStrength * 10) / 10;
      trace.halfLifeFactor = halfLifeFactor;
      trace.isCarbonized = isCarbonized;

      return {
        ok: true,
        traceId: traceId,
        nodeId: nodeId,
        remainingStrength: trace.strength,
        isWashedAway: trace.strength <= 0,
        isCarbonized: isCarbonized,
        halfLifeFactor: halfLifeFactor
      };
    },

    /**
     * 叙事透镜 Prompt 反哺
     */
    buildBlock() {
      const state = this.getState();
      const nodesWithTraces = Object.entries(state.tracesByNode).filter(([_, traces]) => traces && traces.length > 0);
      if (nodesWithTraces.length === 0) return '';

      const lines = ['【现场痕迹与感官残留】'];
      for (const [nodeId, traces] of nodesWithTraces.slice(-3)) {
        const topTraces = traces.slice(-2);
        const traceDescs = topTraces.map(t => `${t.name}(${t.desc})`).join('、');
        lines.push(`· 场所 [${nodeId}]: 现场有残留 —— ${traceDescs}`);
      }
      return lines.join('\n');
    }
  };

  WA.engines.spatialTrace = spatialTrace;
  WA.spatialTrace = spatialTrace;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = spatialTrace;
  }
})();
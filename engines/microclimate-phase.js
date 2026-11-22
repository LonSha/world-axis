/**
 * WorldAxis engines/microclimate-phase.js (v2.330.0)
 * EXV16-1: 微气候相变与极端介质传导引擎 (Microclimate Phase & Media Dynamics)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 通用物理空间介质相变模型。不硬编码具体世界题材，无论是现实冰天雪地、奇幻寒冰洞穴、
 * 灵气严霜之境、废土油料泄露还是沼泽泥泞，统一抽象为温度、湿度与介质相态（Phase）：
 *  1. water_liquid -> water_ice (结冰打滑，通行阻力降低摩擦，失稳风险提升)
 *  2. soil_dry -> mud_quagmire (遇水泥泞化，通行粘滞降速，体力消耗翻倍，物证足迹加深)
 *  3. liquid_water -> mist_fog (高温高湿水汽凝结，视距与能见度阻抗大幅上升)
 *  4. flammables -> oil_fire_spread (火油受热引燃扩散，阻断通行节点，释放高温烟尘)
 *
 * 核心方法：
 *  - registerNodeMedium(nodeId, mediumState)
 *  - simulatePhase(opts)
 *  - getNodeMedium(nodeId)
 *  - resetAll()
 *  - diagnose()
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  WA.engines = WA.engines || {};

  const VERSION = '2.330.0';

  // 节点介质状态存储: Map<nodeId, { temperature, humidity, mediaType, phaseState, frictionCoef, visibilityFactor, dragPenalty, hazards }>
  const _nodeMedia = new Map();

  /**
   * 注册或初始化节点的介质状态
   */
  function registerNodeMedium(nodeId, opts) {
    if (!nodeId || typeof nodeId !== 'string') {
      return { ok: false, error: 'invalid_node_id' };
    }
    const opt = opts || {};
    const state = {
      nodeId: nodeId,
      regionId: opt.regionId || 'default_region',
      temperature: typeof opt.temperature === 'number' ? opt.temperature : 20.0, // 摄氏度
      humidity: typeof opt.humidity === 'number' ? Math.max(0, Math.min(100, opt.humidity)) : 50.0, // 0~100%
      mediaType: opt.mediaType || 'water', // 'water' | 'soil' | 'oil' | 'air'
      phaseState: opt.phaseState || 'normal', // 'normal' | 'frozen' | 'muddy' | 'burning' | 'foggy'
      frictionCoef: typeof opt.frictionCoef === 'number' ? opt.frictionCoef : 1.0, // 摩擦阻力系数 (0.1 极滑 ~ 2.5 极粘)
      visibilityFactor: typeof opt.visibilityFactor === 'number' ? opt.visibilityFactor : 1.0, // 能见度系数 (0.0 彻底失明 ~ 1.0 清晰)
      dragPenalty: typeof opt.dragPenalty === 'number' ? opt.dragPenalty : 0.0, // 移速延时/体力惩罚
      activeFire: Boolean(opt.activeFire),
      lastUpdated: clockNow('microclimate-phase')
    };
    _nodeMedia.set(nodeId, state);
    return { ok: true, nodeMedium: Object.assign({}, state) };
  }

  /**
   * 模拟微气候与环境介质相态演化
   * @param {Object} opts { nodeId, ambientTemperature, precipitation, hasIgnition, indoor }
   */
  function simulatePhase(opts) {
    if (!opts || !opts.nodeId) {
      return { ok: false, error: 'missing_node_id' };
    }
    const state = _nodeMedia.get(opts.nodeId);
    if (!state) {
      return { ok: false, error: 'node_medium_not_registered' };
    }

    // 负控制拦截：若为密封保暖室内（indoor: true），室外环境极端降温不传导演化室内水体
    if (opts.indoor === true) {
      return {
        ok: true,
        nodeId: opts.nodeId,
        insulated: true,
        phaseState: state.phaseState,
        frictionCoef: state.frictionCoef,
        visibilityFactor: state.visibilityFactor,
        temperature: state.temperature
      };
    }

    const ambTemp = typeof opts.ambientTemperature === 'number' ? opts.ambientTemperature : state.temperature;
    const precip = typeof opts.precipitation === 'number' ? opts.precipitation : 0.0; // 降水量/浇灌量
    const ignition = Boolean(opts.hasIgnition);

    state.temperature = ambTemp;
    state.humidity = Math.max(0, Math.min(100, state.humidity + precip * 2));

    // 1. 水体与湿地相变：低温结冰
    if (state.mediaType === 'water' || state.mediaType === 'wetland') {
      if (ambTemp <= 0.0) {
        state.phaseState = 'frozen';
        state.frictionCoef = 0.15; // 极滑冰面
        state.dragPenalty = 0.1;
      } else if (ambTemp >= 40.0 && state.humidity >= 80) {
        state.phaseState = 'foggy';
        state.frictionCoef = 0.8;
        state.visibilityFactor = 0.25; // 大雾浓重
      } else {
        state.phaseState = 'normal';
        state.frictionCoef = 1.0;
        state.visibilityFactor = 1.0;
        state.dragPenalty = 0.0;
      }
    }

    // 2. 土壤与地面相变：大量降水产生泥泞黏滞
    if (state.mediaType === 'soil' || state.mediaType === 'road') {
      if (precip > 15.0 || state.humidity >= 75) {
        state.phaseState = 'muddy';
        state.frictionCoef = 2.2; // 极高泥泞阻滞
        state.dragPenalty = 0.6; // 移速减半，体力翻倍消耗
      } else if (ambTemp <= -5.0) {
        state.phaseState = 'frozen';
        state.frictionCoef = 0.4; // 冻土硬化伴有暗冰
        state.dragPenalty = 0.2;
      } else {
        state.phaseState = 'normal';
        state.frictionCoef = 1.0;
        state.dragPenalty = 0.0;
      }
    }

    // 3. 火油与易燃介质相变：点火燃烧
    if (state.mediaType === 'oil' || state.mediaType === 'flammable') {
      if (ignition || (ambTemp >= 80.0 && !state.activeFire)) {
        state.activeFire = true;
        state.phaseState = 'burning';
        state.temperature = Math.max(state.temperature, 250.0);
        state.visibilityFactor = 0.3; // 浓烟滚滚
        state.dragPenalty = 0.9; // 烈焰阻路
      }
    }

    state.lastUpdated = clockNow('microclimate-phase');

    return {
      ok: true,
      nodeId: opts.nodeId,
      temperature: state.temperature,
      humidity: state.humidity,
      phaseState: state.phaseState,
      frictionCoef: state.frictionCoef,
      visibilityFactor: state.visibilityFactor,
      dragPenalty: state.dragPenalty,
      activeFire: state.activeFire
    };
  }

  /**
   * 获取节点当前介质物相读数
   */
  function getNodeMedium(nodeId) {
    if (!_nodeMedia.has(nodeId)) return null;
    return Object.assign({}, _nodeMedia.get(nodeId));
  }

  function resetAll() {
    _nodeMedia.clear();
    return { ok: true, reset: true };
  }

  const engine = {
    version: VERSION,
    registerNodeMedium: registerNodeMedium,
    simulatePhase: simulatePhase,
    getNodeMedium: getNodeMedium,
    resetAll: resetAll,
    diagnose: function () {
      return {
        ok: true,
        registeredNodesCount: _nodeMedia.size,
        version: VERSION
      };
    }
  };

  WA.engines.microclimatePhase = engine;
  WA.microclimatePhase = engine;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
})();

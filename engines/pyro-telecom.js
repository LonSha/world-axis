/**
 * WorldAxis engines/pyro-telecom.js (v2.330.0)
 * EXV16-3: 视听超视距光热与烟火信号传导引擎 (Pyro-Optic & Long-Range Signal Propagation)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 适用于古典、冷兵器、西幻或废土等缺乏现代电信基础设施的情境。
 * 抽象统一的超视距物理光热信号传输机制：
 *  - 信号媒介：beacon (烽火台), flare (信号弹/求救烟火), smoke (狼烟/彩烟),
 *             signal_arrow (鸣镝响箭), mana_flash (灵光/法宝辉光)
 *  - 衰减与阻抗因子：
 *     1. 几何视线阻挡 (遮蔽物 line-of-sight obstruction)
 *     2. 气象透光度 (雨雪浓雾降低视距, 逆风削减声学响箭)
 *     3. 环境对比度 (夜间火光可见距离是白昼的 3~5 倍)
 *  - 核心方法：
 *     - broadcastSignal(opts)
 *     - getSignalsAtNode(nodeId)
 *     - clearNodeSignals(nodeId)
 *     - resetAll()
 *     - diagnose()
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  WA.engines = WA.engines || {};

  const VERSION = '2.330.0';

  const SIGNAL_TYPES = Object.freeze([
    'beacon',
    'flare',
    'smoke',
    'signal_arrow',
    'mana_flash'
  ]);

  // 各信号基准物理传播半径（米，良好天气夜间视界）
  const BASE_SIGNAL_RADII = Object.freeze({
    beacon: 25000,       // 25km (高山烽火)
    flare: 8000,         // 8km (高空信号弹)
    smoke: 12000,        // 12km (白昼浓烟)
    signal_arrow: 1500,  // 1.5km (声光鸣镝)
    mana_flash: 10000    // 10km (高阶辉光)
  });

  // 记录各节点接收到的信号广播: Map<nodeId, Array<ReceivedSignalRecord>>
  const _receivedSignals = new Map();
  // 历史广播记录
  const _broadcastHistory = [];

  /**
   * 广播超视距光热信号
   * @param {Object} opts {
   *   sourceNodeId: string,
   *   signalType: 'beacon'|'flare'|'smoke'|'signal_arrow'|'mana_flash',
   *   altitude: number, // 米 (0~500)
   *   isNight: boolean,
   *   weatherVisibility: number, // 0.0 (浓雾暴雪) ~ 1.0 (晴朗)
   *   targetNodes: Array<{ nodeId, distanceMeters, lineOfSightClear }>
   * }
   */
  function broadcastSignal(opts) {
    if (!opts || !opts.sourceNodeId) {
      return { ok: false, error: 'missing_source_node_id' };
    }
    const sType = opts.signalType || 'flare';
    if (!SIGNAL_TYPES.includes(sType)) {
      return { ok: false, error: 'invalid_signal_type', validTypes: SIGNAL_TYPES };
    }

    const altitude = typeof opts.altitude === 'number' ? Math.max(0, opts.altitude) : 50;
    const isNight = Boolean(opts.isNight);
    const vis = typeof opts.weatherVisibility === 'number' ? Math.max(0, Math.min(1.0, opts.weatherVisibility)) : 1.0;

    // 负控制拦截：若恶劣气象视距为 0（如伸手不见五指的大浓雾），光信号彻底无法穿透传播
    if (vis <= 0.05 && sType !== 'signal_arrow') {
      return {
        ok: true,
        broadcastId: 'sig_' + Date.now(),
        sourceNodeId: opts.sourceNodeId,
        effectiveRadius: 0,
        perceivedNodes: [],
        blockedByWeather: true
      };
    }

    let baseRadius = BASE_SIGNAL_RADII[sType] || 5000;
    // 高度增益
    baseRadius += altitude * 15;

    // 昼夜修正
    if (sType === 'smoke') {
      // 烟雾在夜间辨识度极差
      if (isNight) baseRadius *= 0.15;
    } else if (sType === 'flare' || sType === 'beacon' || sType === 'mana_flash') {
      // 光辉在夜间更明显
      if (isNight) baseRadius *= 1.4;
      else baseRadius *= 0.6;
    }

    // 天气能见度削减
    const effectiveRadius = Math.round(baseRadius * vis);

    const broadcastRecord = {
      id: 'sig_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      sourceNodeId: opts.sourceNodeId,
      signalType: sType,
      effectiveRadius: effectiveRadius,
      createdAt: Date.now()
    };
    _broadcastHistory.push(broadcastRecord);

    const perceivedNodes = [];
    const targets = Array.isArray(opts.targetNodes) ? opts.targetNodes : [];

    for (const tgt of targets) {
      if (!tgt || !tgt.nodeId) continue;
      const dist = typeof tgt.distanceMeters === 'number' ? tgt.distanceMeters : 999999;
      const los = tgt.lineOfSightClear !== false; // 默认视线通畅

      // 负控制拦截：超出有效半径或视线被高山阻断（LOS=false）时，绝对不可捕获
      if (dist <= effectiveRadius && los) {
        perceivedNodes.push(tgt.nodeId);
        if (!_receivedSignals.has(tgt.nodeId)) {
          _receivedSignals.set(tgt.nodeId, []);
        }
        _receivedSignals.get(tgt.nodeId).push({
          signalId: broadcastRecord.id,
          sourceNodeId: opts.sourceNodeId,
          signalType: sType,
          perceivedAt: Date.now(),
          distanceMeters: dist
        });
      }
    }

    return {
      ok: true,
      broadcastId: broadcastRecord.id,
      sourceNodeId: opts.sourceNodeId,
      signalType: sType,
      effectiveRadius: effectiveRadius,
      perceivedNodes: perceivedNodes
    };
  }

  /**
   * 获取节点当前目击到的信号列表
   */
  function getSignalsAtNode(nodeId) {
    if (!nodeId || !_receivedSignals.has(nodeId)) {
      return [];
    }
    return (_receivedSignals.get(nodeId) || []).slice();
  }

  /**
   * 清除指定节点的已知信号（例如处理完毕撤销警戒）
   */
  function clearNodeSignals(nodeId) {
    if (_receivedSignals.has(nodeId)) {
      _receivedSignals.delete(nodeId);
      return { ok: true, cleared: true, nodeId: nodeId };
    }
    return { ok: true, cleared: false, nodeId: nodeId };
  }

  function resetAll() {
    _receivedSignals.clear();
    _broadcastHistory.length = 0;
    return { ok: true, reset: true };
  }

  const engine = {
    version: VERSION,
    SIGNAL_TYPES: SIGNAL_TYPES,
    broadcastSignal: broadcastSignal,
    getSignalsAtNode: getSignalsAtNode,
    clearNodeSignals: clearNodeSignals,
    resetAll: resetAll,
    diagnose: function () {
      return {
        ok: true,
        broadcastHistoryCount: _broadcastHistory.length,
        nodesWithSignalsCount: _receivedSignals.size,
        version: VERSION
      };
    }
  };

  WA.engines.pyroTelecom = engine;
  WA.pyroTelecom = engine;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
})();
/**
 * WorldAxis engines/ruin-mechanism.js (v2.340.0)
 * EXV18-8: 远古遗迹机关密码与环境自毁陷阱引擎 (Ruin Mechanisms & Environmental Traps)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 抽象古迹、古墓、失落神殿或废土金库中的致命机关拓扑网络：
 *  1. 机关核心类型 (Mechanism Traps):
 *     - 'pressure_plate' (重力踏板暗弩/落石陷阱);
 *     - 'cipher_wheel' (连环滚轮密码锁/五行阵眼符文);
 *     - 'collapsing_ceiling' (断龙石断路/顶板崩塌);
 *     - 'environmental_deluge' (流沙/水银/毒气自毁注满).
 *  2. 破解与操作行为 (Mechanism Interactions):
 *     - 'solve_cipher' (知识解密/旋转轮盘);
 *     - 'disarm_wire' (工匠/盗贼技巧拆解触发线);
 *     - 'force_bypass' (暴力强行破拆/破阵);
 *     - 'use_key' (使用正统秘匙/掌门信物直接过关).
 *  3. 自毁逃生动力学 (Self-Destruct Sequence):
 *     - 破解连续失误触发警报闭锁与环境自毁；
 *     - countdownTurns (逃生限定轮次 1~5);
 *     - 倒计时归零时节点彻底塌陷沦为永久绝地。
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  WA.engines = WA.engines || {};
  const VERSION = '2.340.0';

  const VALID_TRAPS = Object.freeze(['pressure_plate', 'cipher_wheel', 'collapsing_ceiling', 'environmental_deluge']);
  const VALID_ACTIONS = Object.freeze(['solve_cipher', 'disarm_wire', 'force_bypass', 'use_key']);

  // 遗迹机关表: Map<ruinNodeId, RuinNodeRecord>
  const _ruins = new Map();

  function _clamp(n, min, max) {
    const num = Number(n);
    if (!isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
  }

  function _cleanStr(s, max) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, max || 60);
  }

  function registerRuinMechanism(ruinNodeId, opts) {
    const id = _cleanStr(ruinNodeId, 48);
    if (!id) return { ok: false, reason: 'missing-node-id' };
    const opt = opts || {};
    const state = {
      ruinNodeId: id,
      trapKind: VALID_TRAPS.includes(opt.trapKind) ? opt.trapKind : 'pressure_plate',
      difficultyRating: _clamp(opt.difficultyRating || 60, 10, 100),
      isDisarmed: !!opt.isDisarmed,
      isTriggered: false,
      selfDestructActive: false,
      countdownTurns: _clamp(opt.countdownTurns || 3, 1, 10),
      isCollapsed: !!opt.isCollapsed,
      hasMasterKey: !!opt.hasMasterKey,
      updatedAt: Date.now()
    };
    _ruins.set(id, state);
    return { ok: true, mechanism: JSON.parse(JSON.stringify(state)) };
  }

  function getRuinMechanism(ruinNodeId) {
    const id = _cleanStr(ruinNodeId, 48);
    if (!id || !_ruins.has(id)) return null;
    return JSON.parse(JSON.stringify(_ruins.get(id)));
  }

  /**
   * 触发或尝试破解遗迹机关
   * @param {object} spec
   *   ruinNodeId, solverId, actionKind ('solve_cipher'|'disarm_wire'|'force_bypass'|'use_key'),
   *   skillRating (0~100), toolQuality (0~100), hasMasterKey (boolean)
   */
  function triggerMechanism(spec) {
    const s = spec || {};
    const nodeId = _cleanStr(s.ruinNodeId, 48);
    if (!nodeId) return { ok: false, reason: 'missing-node-id' };

    let ruin = _ruins.get(nodeId);
    if (!ruin) {
      registerRuinMechanism(nodeId, {});
      ruin = _ruins.get(nodeId);
    }

    if (ruin.isCollapsed) {
      return { ok: false, reason: 'ruin-already-collapsed' };
    }

    const action = VALID_ACTIONS.includes(s.actionKind) ? s.actionKind : 'solve_cipher';
    const skill = _clamp(s.skillRating !== undefined ? s.skillRating : 50, 0, 100);
    const hasKey = !!s.hasMasterKey || ruin.hasMasterKey;

    // 负控制铁律：当已成功拆除引信或持有正统真传秘匙时，绝不允许误触发自爆自毁陷阱
    if ((ruin.isDisarmed || hasKey) && s.forceSelfDestruct) {
      return { ok: false, reason: 'disarmed-or-keyed-cannot-detonate' };
    }

    const result = {
      ok: true,
      ruinNodeId: nodeId,
      actionKind: action,
      success: false,
      trapTriggered: false,
      selfDestructActive: ruin.selfDestructActive,
      turnsRemaining: ruin.countdownTurns,
      summary: ''
    };

    // 1. 使用正统秘匙
    if (action === 'use_key' && hasKey) {
      ruin.isDisarmed = true;
      ruin.selfDestructActive = false;
      result.success = true;
      result.summary = `真传金钥插入中枢阵眼，齿轮严丝合缝咔嗒作响，机关暗锁全数解除安全开启！`;
    }
    // 2. 技巧拆除或学识解密
    else if (action === 'solve_cipher' || action === 'disarm_wire') {
      const checkScore = skill + (s.toolQuality || 0) * 0.3;
      if (checkScore >= ruin.difficultyRating) {
        ruin.isDisarmed = true;
        result.success = true;
        result.summary = `凭借高超技巧切断隐秘引信并排齐密码齿轮，危机解除！`;
      } else {
        // 解密失败触怒机关
        ruin.isTriggered = true;
        ruin.selfDestructActive = true;
        result.trapTriggered = true;
        result.selfDestructActive = true;
        result.summary = `破解失误触动暗锁！警报巨震，断龙石封死退路，墓室开始灌入流沙进入 ${ruin.countdownTurns} 轮生死逃脱！`;
      }
    }
    // 3. 强拆触发
    else {
      ruin.isTriggered = true;
      ruin.selfDestructActive = true;
      result.trapTriggered = true;
      result.selfDestructActive = true;
      result.summary = `暴力强拆破坏了平衡承重柱，整座地宫剧烈晃动，顶板开始坍塌！`;
    }

    // 自毁推进
    if (ruin.selfDestructActive && s.advanceCountdown) {
      ruin.countdownTurns = Math.max(0, ruin.countdownTurns - 1);
      result.turnsRemaining = ruin.countdownTurns;
      if (ruin.countdownTurns === 0) {
        ruin.isCollapsed = true;
        result.summary += ` [彻底塌陷] 巨石覆顶流沙埋没，密室彻底沦为万劫不复的绝地！`;
      }
    }

    ruin.updatedAt = Date.now();
    return result;
  }

  function resetAll() {
    _ruins.clear();
  }

  function diagnose() {
    return {
      ok: true,
      version: VERSION,
      ruinsCount: _ruins.size,
      traps: VALID_TRAPS,
      actions: VALID_ACTIONS
    };
  }

  const exportObj = {
    registerRuinMechanism: registerRuinMechanism,
    getRuinMechanism: getRuinMechanism,
    getRuin: getRuinMechanism, // 别名兼容
    triggerMechanism: triggerMechanism,
    resetAll: resetAll,
    diagnose: diagnose
  };

  WA.ruinMechanism = exportObj;
  WA.engines.ruinMechanism = exportObj;
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/ruin-mechanism.js', { kind: 'engine', ver: VERSION });
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportObj;
  }
})();
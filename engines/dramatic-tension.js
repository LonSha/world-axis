/**
 * WorldAxis engines/dramatic-tension.js (v2.340.0)
 * EXV17-5: 戏剧性悬念弧光与契诃夫之枪引爆引擎 (Dramatic Tension & Chekhov's Gun Engine)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 通用文学叙事学悬念梯度与伏笔引爆模型。在故事推演中，第一幕出现的关键物品或预言伏笔，
 * 绝不能随风飘散，而是在剧情张力攀升至高潮时，作为命运逆转钥匙强制打响：
 *  1. primeChekhovGun: 装填挂载契诃夫之枪
 *     - gunId: 伏笔唯一键
 *     - anchorEntityId: 依托物理实体 (如断簪、带血玉佩、未鉴定毒药)
 *     - foreshadowText: 伏笔文字白描
 *     - detonationTension: 引爆所需的剧情张力阈值 (0~100)
 *  2. sceneTension: 当前场景张力指数 (0~100)
 *  3. status: 'primed' | 'detonated' | 'misfired_destroyed'
 *
 * 核心方法：
 *  - primeChekhovGun(gunId, anchorEntityId, foreshadowText, detonationTension, opts)
 *  - updateSceneTension(tensionDelta, cause)
 *  - detonateChekhovGun(gunId, opts)
 *  - getGun(gunId)
 *  - getSceneTension()
 *  - resetAll()
 *  - diagnose()
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  WA.engines = WA.engines || {};

  const VERSION = '2.340.0';

  // 契诃夫之枪台账: Map<gunId, { gunId, anchorEntityId, foreshadowText, detonationTension, status, isDestroyed, primedAt, detonatedAt }>
  const _gunRegistry = new Map();
  let _sceneTension = 20.0; // 默认平缓张力

  function primeChekhovGun(gunId, anchorEntityId, foreshadowText, detonationTension, opts) {
    if (!gunId || typeof gunId !== 'string') {
      return { ok: false, error: 'invalid_gun_id' };
    }
    if (!anchorEntityId || !foreshadowText) {
      return { ok: false, error: 'missing_anchor_or_text' };
    }
    const opt = opts || {};
    const threshold = typeof detonationTension === 'number' ? Math.max(0, Math.min(100, detonationTension)) : 70.0;

    const gun = {
      gunId: gunId,
      anchorEntityId: anchorEntityId,
      foreshadowText: foreshadowText,
      detonationTension: threshold,
      status: 'primed',
      isDestroyed: false,
      primedAt: Date.now(),
      detonatedAt: null
    };

    _gunRegistry.set(gunId, gun);

    return {
      ok: true,
      gunId: gunId,
      anchorEntityId: anchorEntityId,
      detonationTension: threshold,
      status: 'primed'
    };
  }

  function updateSceneTension(tensionDelta, cause) {
    const delta = typeof tensionDelta === 'number' ? tensionDelta : 0;
    _sceneTension = Math.max(0, Math.min(100, _sceneTension + delta));
    return {
      ok: true,
      currentTension: _sceneTension,
      cause: cause || 'narrative_progression'
    };
  }

  function detonateChekhovGun(gunId, opts) {
    if (!gunId || !_gunRegistry.has(gunId)) {
      return { ok: false, error: 'gun_not_found' };
    }
    const gun = _gunRegistry.get(gunId);
    const opt = opts || {};

    // 负控制拦截：若实体已被高温火化、腐蚀或物理彻底粉碎（destroyed），断言永久哑火，严禁机械降神凭空引爆
    if (gun.isDestroyed || opt.entityDestroyed === true) {
      gun.status = 'misfired_destroyed';
      gun.isDestroyed = true;
      return {
        ok: false,
        error: 'chekhov_gun_destroyed_or_corroded_misfire',
        gunId: gunId,
        reason: 'physical_anchor_permanently_lost'
      };
    }

    // 负控制拦截：剧情张力未达高潮阈值，断言无法引爆命运转折
    if (_sceneTension < gun.detonationTension && opt.force !== true) {
      return {
        ok: false,
        error: 'insufficient_dramatic_tension_to_detonate',
        currentTension: _sceneTension,
        requiredTension: gun.detonationTension
      };
    }

    gun.status = 'detonated';
    gun.detonatedAt = Date.now();

    return {
      ok: true,
      gunId: gunId,
      anchorEntityId: gun.anchorEntityId,
      climaxNarrativeEcho: gun.foreshadowText,
      status: 'detonated',
      message: 'Chekhov gun fired! Crucial foreshadowing revealed at the dramatic climax.'
    };
  }

  function getGun(gunId) {
    if (!gunId || !_gunRegistry.has(gunId)) return null;
    return Object.assign({}, _gunRegistry.get(gunId));
  }

  function getSceneTension() {
    return _sceneTension;
  }

  function resetAll() {
    _gunRegistry.clear();
    _sceneTension = 20.0;
    return { ok: true, cleared: true };
  }

  function diagnose() {
    return {
      version: VERSION,
      totalGuns: _gunRegistry.size,
      currentTension: _sceneTension
    };
  }

  const api = {
    VERSION: VERSION,
    primeChekhovGun: primeChekhovGun,
    updateSceneTension: updateSceneTension,
    detonateChekhovGun: detonateChekhovGun,
    getGun: getGun,
    getSceneTension: getSceneTension,
    resetAll: resetAll,
    diagnose: diagnose
  };

  WA.engines.dramaticTension = api;
  WA.dramaticTension = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
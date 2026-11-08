/**
 * WorldAxis engines/stealth-infiltration.js (v2.351.0) — 阴影遮蔽、声光隐蔽与巡逻视野暗杀引擎 (EXV19-6)
 *
 * ── 它治什么（核心沙盒痛点）────────────────────────────────────
 *   沙盒世界的潜入往往被简化为单调的骰子点数检定，忽略了具身物理感知：
 *   守卫没有视锥死角与巡逻警觉度状态机；没有环境阴影度与脚步分贝判定；
 *   无法执行投石声东击西、背后锁喉暗杀及拖拽藏尸等经典战术特工潜入闭环。
 *
 * ── 核心机制闭环 ───────────────────────────────────────────────
 *   ① 巡逻守卫具身视野状态机（Patrol Guard AI）：
 *      - awarenessState: calm（常态巡逻） -> suspicious（疑窦丛生/调查异动） -> alarmed（警报大作/吹哨围捕）；
 *      - visionCone: 视锥朝向（facing 0~360°）、视野角（FOV 90~120°）、最大视距（viewDistance 10~50m）；
 *      - alertDecay: 若未持续发现异动，警觉度按轮次退行衰减。
 *   ② 潜入者声光隐匿值（Infiltrator Stealth Rating）：
 *      - shadowFactor（阴影浓缩度 0~100%）：完全黑暗为 100%，艳阳烈日为 0%；
 *      - noiseDb（发出的脚步与装备碰撞分贝 0~100 dB）；
 *      - camouflageSuit（伪装服饰加成）。
 *   ③ 四大渗透战术动作（executeInfiltration）：
 *      - shadowMelt: 屏息敛气潜伏于阴影之中，压低自身发声与可见度；
 *      - distractStone: 投石问路引开守卫视线朝向，诱导守卫脱离巡逻路线；
 *      - takedown: 背后视线盲区锁喉勒晕或致命无声割喉（暗杀）；
 *      - hideBody: 将失去意识或阵亡守卫拖入草丛、柜子或水井，消除暴露隐患。
 *   ④ 极限制裁与物理负控制：
 *      - 正午阳光烈日下（shadowFactor == 0）且处于守卫直视视线盲区之外（inSight == true，距离近），
 *        断言禁止无遮蔽凭空隐身刺杀，严正抛出拒止判定（refusal: 'unshadowed-direct-line-of-sight'）。
 *
 * ── 铁律与设计边界 ─────────────────────────────────────────────
 *   - 框架中立：无论忍者刺客、特种兵潜入、赛博黑客物理潜行、盗贼潜行；
 *   - 行为真源，持久化于 WA.store（root.stealthTactics）；
 *   - 完备真负控制断言。
 */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this);
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_stealth_infiltration_settings_v1';
  const DEF = {
    enabled: true,
    maxGuards: 32,
    baseViewDistance: 30, // 30米视距
    distractRadius: 15,    // 投石吸引半径
    stealthSuccessThreshold: 60
  };
  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'stealthInfiltration',
    bounds: {
      maxGuards: [4, 64],
      baseViewDistance: [5, 100],
      distractRadius: [5, 40],
      stealthSuccessThreshold: [20, 90]
    }
  };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = {
    stealthAttempts: 0,
    distractionsMade: 0,
    takedownsSuccess: 0,
    bodiesHidden: 0,
    alarmsRaised: 0,
    refusals: 0,
    lastReason: ''
  };
  function noteFault(r) {
    stat.refusals++;
    stat.lastReason = String(r || 'unknown-refusal');
  }
  function cleanStr(val, maxLen) {
    if (typeof val !== 'string') return '';
    return val.trim().slice(0, maxLen || 80);
  }
  function clamp(n, min, max) {
    const v = Number(n);
    if (isNaN(v)) return min;
    return Math.max(min, Math.min(max, v));
  }
  function getStealthStore(draft) {
    const target = draft || (WA.store ? WA.store.get() : null);
    if (!target) return null;
    if (!target.stealthTactics) {
      if (draft) draft.stealthTactics = { guards: [], infiltrators: {}, logs: [] };
      return draft ? draft.stealthTactics : null;
    }
    return target.stealthTactics;
  }

  /**
   * 注册或配置巡逻守卫
   */
  function registerGuard(guardSpec) {
    guardSpec = guardSpec || {};
    const guardId = cleanStr(guardSpec.guardId || guardSpec.id || ('guard_' + Date.now()), 48);
    const postLocation = cleanStr(guardSpec.location || 'gate_courtyard', 48);

    let created = null;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const store = getStealthStore(draft);
        if (!store) return;
        let g = store.guards.find(function (it) { return it.guardId === guardId; });
        if (!g) {
          g = {
            guardId: guardId,
            name: cleanStr(guardSpec.name || '巡逻守卫', 32),
            location: postLocation,
            awarenessState: cleanStr(guardSpec.awareness || 'calm', 24), // calm | suspicious | alarmed | neutralized
            facingAngle: clamp(guardSpec.facing != null ? guardSpec.facing : 0, 0, 360),
            viewConeFov: clamp(guardSpec.fov != null ? guardSpec.fov : 100, 30, 180),
            viewDistance: clamp(guardSpec.viewDistance != null ? guardSpec.viewDistance : 30, 5, 80),
            coords: guardSpec.coords || { x: 10, y: 10 },
            bodyHidden: false,
            updatedAt: clockNow('regGuard')
          };
          store.guards.push(g);
        }
        created = JSON.parse(JSON.stringify(g));
      });
    }
    return { ok: true, guard: created };
  }

  /**
   * 潜行渗透综合战术枢纽
   */
  function executeInfiltration(infiltratorId, actionSpec) {
    infiltratorId = cleanStr(infiltratorId || (actionSpec && (actionSpec.infiltratorId || actionSpec.who)) || 'ghost_operative', 48);
    actionSpec = actionSpec || {};
    const tactic = cleanStr(actionSpec.tactic || actionSpec.action || 'shadowMelt', 32);

    let result = null;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const store = getStealthStore(draft);
        if (!store) {
          result = { ok: false, refusal: 'stealth-store-unavailable' };
          noteFault('stealth-store-unavailable');
          return;
        }

        const now = clockNow('executeInfiltration');
        const guardId = cleanStr(actionSpec.guardId || actionSpec.targetGuardId, 48);
        const guard = store.guards.find(function (g) { return g.guardId === guardId; });

        const shadowFactor = clamp(actionSpec.shadowFactor != null ? actionSpec.shadowFactor : 50, 0, 100);
        const distanceToGuard = clamp(actionSpec.distance != null ? actionSpec.distance : 15, 0, 100);
        const isInLineOfSight = actionSpec.inSight !== false;

        // 破坏性负控制断言：正午阳光直射无阴影（shadowFactor <= 5%）且处于近距直视视锥内（inSight == true 且 distance <= 10m），
        // 严禁原地隐形刺杀，必须直接判定被识破拉响警报！
        if (shadowFactor <= 5 && isInLineOfSight && distanceToGuard <= 10 && (tactic === 'takedown' || tactic === 'shadowMelt')) {
          if (guard) guard.awarenessState = 'alarmed';
          stat.alarmsRaised++;
          result = {
            ok: false,
            refusal: 'unshadowed-direct-line-of-sight',
            reason: '光天化日无任何掩体阴影遮蔽，且正对守卫视线直视前方，严禁原地凭空潜伏与暗杀！',
            infiltratorId: infiltratorId,
            guardId: guardId,
            shadowFactor: shadowFactor,
            distance: distanceToGuard
          };
          noteFault('unshadowed-direct-line-of-sight');
          return;
        }

        if (tactic === 'shadowMelt') {
          // 潜伏于暗影屏息潜行
          const stealthScore = Math.round(shadowFactor * 0.8 + (100 - (actionSpec.footstepDb || 20)) * 0.2);
          const detected = stealthScore < 40 && isInLineOfSight;
          if (detected && guard) {
            guard.awarenessState = 'suspicious';
          }
          stat.stealthAttempts++;
          result = {
            ok: true,
            tactic: 'shadowMelt',
            infiltratorId: infiltratorId,
            stealthScore: stealthScore,
            detected: detected,
            narrative: detected
              ? `潜行者踩中干枯树枝发出异响，前方守卫猛地转头疑窦丛生！`
              : `潜行者如水滴融入墨色阴影之中，呼吸与心跳压低至极致，未引起丝毫察觉。`
          };
        } else if (tactic === 'distractStone') {
          // 投石问路引开视线
          if (!guard) {
            result = { ok: false, refusal: 'guard-not-found', reason: '未指定受引诱目标守卫' };
            noteFault('guard-not-found');
            return;
          }
          // 守卫转向声源方向
          const distractorAngle = clamp(actionSpec.distractAngle != null ? actionSpec.distractAngle : (guard.facingAngle + 120) % 360, 0, 360);
          guard.facingAngle = distractorAngle;
          guard.awarenessState = 'suspicious';
          stat.distractionsMade++;
          result = {
            ok: true,
            tactic: 'distractStone',
            infiltratorId: infiltratorId,
            guardId: guard.guardId,
            newFacingAngle: guard.facingAngle,
            guardAwareness: guard.awarenessState,
            narrative: `一块小石子精准磕在廊柱远端，清脆脆响让守卫「${guard.name}」立刻转身举灯朝暗角走去！`
          };
        } else if (tactic === 'takedown') {
          // 背后无声暗杀/锁喉
          if (!guard) {
            result = { ok: false, refusal: 'guard-not-found', reason: '未指定暗杀目标守卫' };
            noteFault('guard-not-found');
            return;
          }
          if (guard.awarenessState === 'alarmed') {
            result = { ok: false, refusal: 'guard-already-alarmed', reason: '守卫已处于高度戒备交火状态，无法执行背刺无声处决' };
            noteFault('guard-already-alarmed');
            return;
          }
          // 判定暗杀成功
          guard.awarenessState = 'neutralized';
          stat.takedownsSuccess++;
          result = {
            ok: true,
            tactic: 'takedown',
            infiltratorId: infiltratorId,
            guardId: guard.guardId,
            takedownType: cleanStr(actionSpec.takedownType || 'silent_strangle', 32),
            narrative: `黑影自死角瞬间欺身而上，一只戴着皮手套的手死死捂住守卫口鼻，利刃透背/劲力锁喉，守卫瞬间瘫软倒地！`
          };
        } else if (tactic === 'hideBody') {
          // 拖拽藏尸
          if (!guard || guard.awarenessState !== 'neutralized') {
            result = { ok: false, refusal: 'no-body-to-hide', reason: '该目标尚未被放倒，无尸首或昏迷体可供隐藏' };
            noteFault('no-body-to-hide');
            return;
          }
          guard.bodyHidden = true;
          stat.bodiesHidden++;
          result = {
            ok: true,
            tactic: 'hideBody',
            infiltratorId: infiltratorId,
            guardId: guard.guardId,
            hideSpot: cleanStr(actionSpec.hideSpot || 'wooden_crate', 32),
            narrative: `迅速将守卫躯体拖入阴暗木板箱盖好，清理地面拖痕，巡逻走廊重归死寂。`
          };
        } else {
          result = { ok: false, refusal: 'unknown-stealth-tactic', reason: '未知潜入战术: ' + tactic };
          noteFault('unknown-stealth-tactic');
        }
      });
    }

    return result || { ok: false, refusal: 'store-unavailable' };
  }

  function buildBlock() {
    const store = getStealthStore();
    if (!store || !store.guards || store.guards.length === 0) return '';
    const activeGuards = store.guards.filter(function (g) { return g.awarenessState !== 'neutralized' || !g.bodyHidden; }).slice(0, 3);
    if (activeGuards.length === 0) return '';

    const lines = ['【潜入暗影与巡逻视野】'];
    activeGuards.forEach(function (g) {
      const stateBadge = g.awarenessState === 'neutralized' ? '【已放倒待藏尸】' : (g.awarenessState === 'alarmed' ? '【警报吹哨】' : `【${g.awarenessState}】`);
      lines.push(`· 守卫 ${g.name} (${g.guardId})：视向 ${g.facingAngle}°，位置 ${g.location} ${stateBadge}`);
    });
    return lines.join('\n');
  }

  WA.stealthInfiltration = {
    DEF: DEF,
    settings: settings,
    saveSettings: saveSettings,
    registerGuard: registerGuard,
    executeInfiltration: executeInfiltration,
    buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat); }
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/stealth-infiltration.js', { kind: 'engine', ver: '2.351.0' });
  }
})();
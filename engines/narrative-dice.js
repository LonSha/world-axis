/**
 * WorldAxis engines/narrative-dice.js (v2.302.0) — 跑团式剧情变奏骰与偶发扰动引擎
 * 
 * 融合升华 AutoRandomInput 核心机制：
 *   把外挂式「发送前拼接随机指令」升华为基于 core/rand 的确定性可复现扰动骰。
 *   支持独立骰面组（d4/d6/d20 等）、预设样板（进展判定、变奏转折、情绪张力、危机偶发）、
 *   结果可审计（纳入 audit-log）、潜台词无痕传导与反事实可回放。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_narrative_dice_settings_v1';
  const DEF = { enabled: true, auditLog: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'narrativeDice', bounds: {} };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
  }

  const PRESETS = {
    progression: {
      dice: 'd6',
      name: '进展判定组',
      slots: [
        { roll: 1, grade: 'costly_failure', desc: '行动失败并触发严重连锁阻力', modifier: -20 },
        { roll: 2, grade: 'unexpected_obstacle', desc: '遇到未曾预料的环境阻碍或第三方介入', modifier: -10 },
        { roll: 3, grade: 'minor_setback', desc: '推进受阻，需额外付出小幅代价', modifier: -5 },
        { roll: 4, grade: 'expected', desc: '符合预期，平稳达成当前阶段目标', modifier: 0 },
        { roll: 5, grade: 'windfall', desc: '小幅意外收获，发现隐藏线索或省下开支', modifier: 10 },
        { roll: 6, grade: 'critical_triumph', desc: '远超预期的大成功，形成压倒性态势', modifier: 25 }
      ]
    },
    crisis: {
      dice: 'd20',
      name: '危机偶发组',
      slots: [
        { roll: 1, grade: 'lethal_hazard', desc: '致命危机降临，现场结构坍塌或伏兵突起', hazard: true },
        { roll: 20, grade: 'miraculous_turn', desc: '天佑机缘，出现绝对有利的突发转机', miracle: true }
      ]
    },
    tension: {
      dice: 'd4',
      name: '情绪张力组',
      slots: [
        { roll: 1, tension: 'low', atmosphere: '松散平静，守备松懈' },
        { roll: 2, tension: 'medium', atmosphere: '互有猜忌，暗流涌动' },
        { roll: 3, tension: 'high', atmosphere: '剑拔弩张，一触即发' },
        { roll: 4, tension: 'lethal', atmosphere: '杀意已决，死局死斗' }
      ]
    }
  };

  const _groups = new Map();

  function initDefaultGroups() {
    for (const [key, def] of Object.entries(PRESETS)) {
      if (!_groups.has(key)) {
        _groups.set(key, {
          id: key,
          name: def.name,
          dice: def.dice,
          slots: def.slots.slice(),
          enabled: true
        });
      }
    }
  }

  function parseDiceSides(dStr) {
    if (typeof dStr === 'number' && dStr >= 1) return Math.floor(dStr);
    if (typeof dStr === 'string' && dStr.startsWith('d')) {
      const n = parseInt(dStr.slice(1), 10);
      if (n >= 1) return n;
    }
    return 6;
  }

  function roll(groupId, opts) {
    opts = opts || {};
    initDefaultGroups();
    const cfg = settings();
    if (!cfg.enabled && !opts.force) {
      return { ok: false, reason: 'disabled', groupId: groupId };
    }
    const grp = _groups.get(groupId);
    if (!grp) return { ok: false, reason: 'unknown-group', groupId: groupId };
    if (!grp.enabled && !opts.force) return { ok: false, reason: 'group-disabled', groupId: groupId };

    const sides = parseDiceSides(grp.dice);
    let result = 1;
    // 优先接入 core/rand 决策流，确保可复现与反事实回放
    if (opts.fixedRoll && Number.isInteger(opts.fixedRoll)) {
      result = Math.max(1, Math.min(sides, opts.fixedRoll));
    } else if (WA.rand && typeof WA.rand.int === 'function') {
      result = WA.rand.int(1, sides, 'narrative-dice');
    } else {
      result = Math.floor(Math.random() * sides) + 1;
    }

    // 命中匹配的 slot
    const matchedSlot = grp.slots.find(s => s.roll === result) || {
      roll: result,
      grade: 'neutral',
      desc: '掷出点数 ' + result + '/' + sides
    };

    const out = {
      ok: true,
      groupId: groupId,
      groupName: grp.name,
      dice: grp.dice,
      sides: sides,
      roll: result,
      slot: matchedSlot,
      at: (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('dice') : Date.now()
    };

    if (cfg.auditLog && WA.auditLog && typeof WA.auditLog.append === 'function') {
      try {
        WA.auditLog.append('narrativeDice', 'roll', out);
      } catch (e) {}
    }
    return out;
  }

  function configureGroup(groupId, patch) {
    initDefaultGroups();
    patch = patch || {};
    let grp = _groups.get(groupId);
    if (!grp) {
      grp = { id: groupId, name: patch.name || groupId, dice: patch.dice || 'd6', slots: [], enabled: true };
      _groups.set(groupId, grp);
    }
    if (patch.name) grp.name = String(patch.name);
    if (patch.dice) grp.dice = String(patch.dice);
    if (Array.isArray(patch.slots)) grp.slots = patch.slots.slice();
    if (typeof patch.enabled === 'boolean') grp.enabled = patch.enabled;
    return { ok: true, group: Object.assign({}, grp) };
  }

  function listGroups() {
    initDefaultGroups();
    return Array.from(_groups.values()).map(g => ({
      id: g.id,
      name: g.name,
      dice: g.dice,
      enabled: g.enabled,
      slotCount: g.slots.length
    }));
  }

  WA.narrativeDice = {
    PRESETS: PRESETS,
    roll: roll
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/narrative-dice 已加载（2.302.0）');
  }
})();

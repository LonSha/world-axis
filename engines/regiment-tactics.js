/**
 * WorldAxis engines/regiment-tactics.js (v2.380.0)
 * EXV21-2: 战役级军团排阵、士气溃散与三军阵形对撞引擎 (Regiment Tactics, Formation Clash & Morale Rout Engine)
 *
 * ── 核心架构哲学（Genre-Neutral Architecture）─────────────────────────
 * 无论是古风冷兵器万人方阵、修仙万仙剑阵、近现代装甲集群还是星际机甲军团，统一抽象为战役军团动能学：
 *  1. 五大经典阵形拓扑与生克矩阵（Formation Mesh）：
 *     - phalanx (方阵/盾墙): 防御极高，正面克制骑兵/突击，但转向迟缓，被散兵抛射克制；
 *     - wedge (锋矢/突击阵): 突破穿透力极强，克制散兵与松散阵线，被密集方阵正面抵消；
 *     - skirmish (散兵/游击线): 机动与射程遮蔽，克制迟缓方阵，被骑兵高速冲击撕裂；
 *     - crane_wing (雁行/两翼包抄): 善于形成合围与局部多打少，要求统率极高，被中央锋矢突破分割；
 *     - wagon_fort (车营/临时工事工事要塞): 阵地战稳固，对所有正面冲击有极大抗性，但丧失全部机动。
 *  2. 战场士气雪崩动力学（Morale & Rout）：
 *     - 阵形破绽与伤亡累积降低士气（morale 0~100）；
 *     - 侧翼被包抄或主将被斩触发战场恐慌共振（panic cascade）；
 *     - 当士气归零时，军团直接陷入溃散溃逃（status: 'rout'），丢弃辎重重伤逃窜；
 *     - 督战队（vanguardGuard）机制：斩杀逃兵稳固士气，但连用过多引发阵前倒戈。
 *  3. 破坏性负控制与状态持久化：
 *     - 已处于溃散（rout）或全军覆没状态强行发起决死冲锋，严惩驳回（refusal: 'regiment-broken-in-rout'）；
 *     - 兵力小于等于 0 驳回（refusal: 'insufficient-headcount'）；
 *     - 所有军团战斗推演落入 store.regiments 台账。
 */
'use strict';

(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  WA.engines = WA.engines || {};

  const VERSION = '2.380.0';
  const LS_KEY = 'worldaxis_regiment_tactics_settings_v1';

  const DEF = {
    enabled: true,
    maxRegiments: 40,
    routMoraleThreshold: 15,
    flankPanicPenalty: 25
  };

  let stat = {
    clashes: 0,
    routs: 0,
    vanguardExecutions: 0,
    refusals: 0,
    lastReason: ''
  };

  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'regimentTactics'
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

  // 阵形相克系数矩阵 (attacker vs defender)
  const FORMATION_ADVANTAGE = {
    phalanx: { wedge: 1.3, skirmish: 0.7, crane_wing: 1.0, wagon_fort: 0.9, phalanx: 1.0 },
    wedge: { skirmish: 1.4, crane_wing: 1.2, phalanx: 0.7, wagon_fort: 0.6, wedge: 1.0 },
    skirmish: { phalanx: 1.3, wagon_fort: 1.1, wedge: 0.6, crane_wing: 0.8, skirmish: 1.0 },
    crane_wing: { phalanx: 1.1, wagon_fort: 1.2, wedge: 0.8, skirmish: 1.2, crane_wing: 1.0 },
    wagon_fort: { wedge: 1.4, phalanx: 1.1, skirmish: 0.9, crane_wing: 0.8, wagon_fort: 1.0 }
  };

  function getStore(draft) {
    const target = draft || (WA.store ? WA.store.get() : null);
    if (!target) return null;
    if (!target.regiments || typeof target.regiments !== 'object') {
      if (draft) target.regiments = { roster: {}, battleLog: [] };
      return draft ? target.regiments : null;
    }
    return target.regiments;
  }

  function registerRegiment(regimentId, spec) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    const rid = cleanStr(regimentId, 40);
    if (!rid) {
      noteFault('invalid-regiment-id');
      return { ok: false, refusal: 'invalid-regiment-id' };
    }

    const p = spec || {};
    const headcount = parseInt(p.headcount, 10);
    if (isNaN(headcount) || headcount <= 0) {
      noteFault('insufficient-headcount');
      return { ok: false, refusal: 'insufficient-headcount' };
    }

    const validFormations = ['phalanx', 'wedge', 'skirmish', 'crane_wing', 'wagon_fort'];
    const formation = validFormations.includes(p.formation) ? p.formation : 'phalanx';

    const record = {
      regimentId: rid,
      name: cleanStr(p.name || rid, 60),
      factionId: cleanStr(p.factionId || 'neutral', 40),
      commander: cleanStr(p.commander || 'Unknown', 60),
      headcount: headcount,
      maxHeadcount: headcount,
      training: clamp(p.training !== undefined ? p.training : 60, 10, 100),
      morale: clamp(p.morale !== undefined ? p.morale : 80, 0, 100),
      formation: formation,
      status: 'ready', // ready, engaged, rout, shattered
      vanguardCount: Math.max(0, parseInt(p.vanguardCount, 10) || 0),
      updatedAt: clockNow('regiment:register')
    };

    let capacityReached = false;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const s = getStore(draft);
        if (s && !s.roster[rid] && Object.keys(s.roster).length >= Math.max(1, Math.floor(settings().maxRegiments))) {
          capacityReached = true;
          return;
        }
        if (s) {
          s.roster[rid] = record;
        }
      });
    }

    if (capacityReached) return { ok: false, reason: 'capacity-reached' };
    return { ok: true, regiment: record };
  }

  /**
   * 战役两军阵形对撞结算写口：clashRegiments
   */
  function clashRegiments(attackerRegimentId, defenderRegimentId, clashContext) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    stat.clashes++;

    const aid = cleanStr(attackerRegimentId, 40);
    const did = cleanStr(defenderRegimentId, 40);

    const st = getStore();
    if (!st || !st.roster || !st.roster[aid] || !st.roster[did]) {
      noteFault('regiment-not-found');
      return { ok: false, refusal: 'regiment-not-found' };
    }

    const att = Object.assign({}, st.roster[aid]);
    const def = Object.assign({}, st.roster[did]);

    // 负控制拦截：溃散部队无法主动发起对撞
    if (att.status === 'rout' || att.status === 'shattered') {
      noteFault('regiment-broken-in-rout');
      return {
        ok: false,
        refusal: 'regiment-broken-in-rout',
        regimentId: aid,
        status: att.status,
        reason: 'Attacker is broken or routed and cannot initiate clash.'
      };
    }

    const ctx = clashContext || {};
    const terrain = cleanStr(ctx.terrain || 'plains', 30);
    const flankAmbush = !!ctx.flankAmbush; // 侧翼突袭

    // 相克乘数
    const fAdvMap = FORMATION_ADVANTAGE[att.formation] || {};
    let formMultiplier = fAdvMap[def.formation] || 1.0;

    // 地形加成
    let terrainMod = 1.0;
    if (terrain === 'hills' && def.formation === 'phalanx') terrainMod = 1.25;
    if (terrain === 'narrow_pass' && def.formation === 'wagon_fort') terrainMod = 1.4;
    if (terrain === 'swamp' && att.formation === 'wedge') formMultiplier *= 0.6; // 泥沼阻遏锋矢

    // 伤害与战损模型
    const attPower = (att.headcount * (att.training / 100) * (att.morale / 100)) * formMultiplier;
    const defPower = (def.headcount * (def.training / 100) * (def.morale / 100)) * terrainMod;

    // 伤亡
    const defLoss = Math.min(def.headcount, Math.round(attPower * 0.08));
    const attLoss = Math.min(att.headcount, Math.round(defPower * 0.06));

    def.headcount = Math.max(0, def.headcount - defLoss);
    att.headcount = Math.max(0, att.headcount - attLoss);

    // 士气扣减
    let defMoraleHit = Math.round((defLoss / (def.maxHeadcount || 1)) * 50) + 5;
    let attMoraleHit = Math.round((attLoss / (att.maxHeadcount || 1)) * 40);

    if (flankAmbush) {
      defMoraleHit += settings().flankPanicPenalty;
    }

    def.morale = clamp(def.morale - defMoraleHit, 0, 100);
    att.morale = clamp(att.morale - attMoraleHit, 0, 100);

    // 检查溃散
    const routThreshold = settings().routMoraleThreshold;
    let defRouted = false;
    let attRouted = false;

    if (def.morale <= routThreshold || def.headcount <= 0) {
      def.status = 'rout';
      defRouted = true;
      stat.routs++;
    } else {
      def.status = 'engaged';
    }

    if (att.morale <= routThreshold || att.headcount <= 0) {
      att.status = 'rout';
      attRouted = true;
      stat.routs++;
    } else {
      att.status = 'engaged';
    }

    att.updatedAt = clockNow('regiment:clash');
    def.updatedAt = clockNow('regiment:clash');

    // 落盘事务
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const s = getStore(draft);
        if (s && s.roster) {
          s.roster[aid] = att;
          s.roster[did] = def;
          s.battleLog.push({
            attackerId: aid,
            defenderId: did,
            attLoss,
            defLoss,
            defRouted,
            attRouted,
            at: clockNow()
          });
        }
      });
    }

    return {
      ok: true,
      attacker: { regimentId: aid, headcount: att.headcount, morale: att.morale, status: att.status, loss: attLoss },
      defender: { regimentId: did, headcount: def.headcount, morale: def.morale, status: def.status, loss: defLoss },
      formationAdvantage: formMultiplier,
      terrain,
      defRouted,
      attRouted
    };
  }

  /**
   * 督战队稳定军心（斩首逃兵维持战线）
   */
  function enforceVanguardDiscipline(regimentId) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    const rid = cleanStr(regimentId, 40);
    const st = getStore();
    if (!st || !st.roster || !st.roster[rid]) {
      noteFault('regiment-not-found');
      return { ok: false, refusal: 'regiment-not-found' };
    }

    const reg = Object.assign({}, st.roster[rid]);
    if (reg.vanguardCount <= 0) {
      noteFault('no-vanguard-guards');
      return { ok: false, refusal: 'no-vanguard-guards', reason: 'No vanguard unit assigned.' };
    }

    if (reg.headcount <= 10) {
      noteFault('insufficient-soldiers-to-execute');
      return { ok: false, refusal: 'insufficient-soldiers-to-execute' };
    }

    stat.vanguardExecutions++;
    const executedDeserters = Math.min(5, Math.max(1, Math.floor(reg.headcount * 0.02)));
    reg.headcount -= executedDeserters;
    reg.morale = clamp(reg.morale + 18, 0, 80); // 督战提振至多到80
    if (reg.status === 'rout') {
      reg.status = 'engaged'; // 强行拉回防线
    }
    reg.updatedAt = clockNow('regiment:vanguard');

    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const s = getStore(draft);
        if (s && s.roster) {
          s.roster[rid] = reg;
        }
      });
    }

    return {
      ok: true,
      regimentId: rid,
      executedDeserters,
      recoveredMorale: reg.morale,
      status: reg.status
    };
  }

  function getRegiment(regimentId) {
    const st = getStore();
    if (!st || !st.roster) return null;
    return st.roster[cleanStr(regimentId, 40)] || null;
  }

  function listRegiments() {
    const st = getStore();
    if (!st || !st.roster) return [];
    return Object.keys(st.roster).map(k => st.roster[k]);
  }

  function buildBlock(context) {
    if (!settings().enabled) return '';
    const list = listRegiments();
    if (!list.length) return '';

    const lines = list.slice(0, 5).map(r => {
      return `【军团·${r.name}】阵形:${r.formation} 兵力:${r.headcount} 士气:${r.morale}% 状态:${r.status}`;
    });

    return '[大兵团阵势与军心]\n' + lines.join('\n');
  }

  function diagnose() {
    const list = listRegiments();
    return {
      version: VERSION,
      enabled: settings().enabled,
      regimentCount: list.length,
      stat: Object.assign({}, stat)
    };
  }

  function statView() {
    return Object.assign({}, stat);
  }

  function resetStat() {
    stat = {
      clashes: 0,
      routs: 0,
      vanguardExecutions: 0,
      refusals: 0,
      lastReason: ''
    };
  }

  const regimentTactics = {
    version: VERSION,
    settings,
    saveSettings,
    registerRegiment,
    clashRegiments,
    enforceVanguardDiscipline,
    getRegiment,
    listRegiments,
    buildBlock,
    diagnose,
    stat: statView,
    resetStat
  };

  WA.engines.regimentTactics = regimentTactics;
  WA.regimentTactics = regimentTactics;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = regimentTactics;
  }
})();

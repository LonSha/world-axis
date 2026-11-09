/**
 * WorldAxis engines/court-intrigue.js (v2.380.0)
 * EXV21-8: 宫廷深宫内斗、派系结党与权臣政变逼宫引擎 (Court Intrigue, Factional Clique & Palace Coup Engine)
 *
 * ── 核心架构哲学（Genre-Neutral Architecture）─────────────────────────
 * 无论是封建王朝深宫夺嫡、修仙仙朝帝座之争、赛博财阀董事会逼宫清洗还是星际帝国禁卫军哗变，统一抽象为核心权力矢量与政变博弈动力学：
 *  1. 权力中枢四维向量（Power Vector Dynamics, 0~100）：
 *     - palaceGuardLoyalty: 禁卫军统领与御林军对至高皇权/君王的死忠度；
 *     - innerChamber: 内廷近侍、宦官亲信或核心侍从的信息垄断与密旨控制力；
 *     - bureaucracyInfluence: 门阀宰相、六部九卿文官集团的公论舆情与政令执行度；
 *     - privyPurse: 皇室私帑、大内金库与国库控制权。
 *  2. 深宫权谋四大核心行动（Intrigue Actions）：
 *     - frameRival: 构陷罗织异己、制造谋反巫蛊伪证，诱发抄家清洗；
 *     - bribeInnerChamber: 重金收买内廷宦官侍从，探听绝密圣谕或暗改脉案；
 *     - forgeDecree: 伪造传位遗诏或中旨密令，夺取法理名器；
 *     - executePalaceCoup: 发动午夜玄武门式流血兵变或御前逼宫禅让。
 *  3. 破坏性负控制与状态持久化：
 *     - 当禁卫军死忠守卫（palaceGuardLoyalty >= 85）且君王手握虎符御卫森严时，文弱权臣无兵刃兵权强行闯殿逼宫，
 *       当场格杀驳回（refusal: 'imperial-guard-lethal-resistance'）；
 *     - 证据不足盲目诬陷三公九卿驳回（refusal: 'frame-evidence-insufficient'）；
 *     - 宫廷派系数据持久化落入 store.courtIntrigue 台账。
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  WA.engines = WA.engines || {};

  const VERSION = '2.380.0';
  const LS_KEY = 'worldaxis_court_intrigue_settings_v1';
  const DEF = {
    enabled: true,
    maxCourts: 20,
    minGuardLoyaltyResistance: 85,
    coupSuccessGuardThreshold: 50
  };

  let stat = {
    intriguesExecuted: 0,
    frameRivals: 0,
    innerChamberBribes: 0,
    decreesForged: 0,
    coupsAttempted: 0,
    coupsSucceeded: 0,
    refusals: 0,
    lastReason: ''
  };

  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'courtIntrigue'
  };
  // v2.381.0: 补齐设置键登记 —— 此前本引擎是全仓 274 个引擎里唯一的登记漏项：
  //   settingsBus 的 ghostScan / applyDefaults / verifyDefaults 全部以 __settingsRegs
  //   为唯一真源。未登记则该键被判成幽灵键（进清理候选），子键级默认值也永不回填。
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return Object.assign({}, DEF, raw || {});
  }

  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    // v2.381.0: 修「调用了不存在的 API」—— settingsBus 导出面 34 个成员里从来没有
    //   `write`，只有 save / saveOrThrow。原写口必抛 TypeError，后果是『设置改了不生效』。
    //   与其余 7 个 V21 引擎同批对齐为 saveOrThrow（写失败可见，不静默）。
    if (WA.settingsBus && typeof WA.settingsBus.saveOrThrow === 'function') {
      WA.settingsBus.saveOrThrow(__REG, merged);
    }
    return merged;
  }

  function _clamp(n, min, max) {
    const v = Number(n);
    if (isNaN(v)) return min;
    return Math.max(min, Math.min(max, v));
  }

  function _getStore() {
    return WA.store || null;
  }

  function registerCourt(courtId, opts = {}) {
    if (!courtId) return { ok: false, error: 'courtId is required' };
    const s = _getStore();
    if (!s || !s.transact) return { ok: false, error: 'store unavailable' };

    let created = null;
    let capacityReached = false;
    s.transact(raw => {
      raw.courtIntrigue = raw.courtIntrigue || {};
      raw.courtIntrigue.courts = raw.courtIntrigue.courts || {};

      const existing = raw.courtIntrigue.courts[courtId];
      if (existing) {
        created = existing;
        return;
      }

      if (Object.keys(raw.courtIntrigue.courts).length >= Math.max(1, Math.floor(settings().maxCourts))) {
        capacityReached = true;
        return;
      }
      created = {
        courtId: String(courtId),
        realmName: String(opts.realmName || '大盛皇朝'),
        monarch: {
          name: String(opts.monarchName || '建元大帝'),
          status: String(opts.monarchStatus || 'active'), // 'active', 'ailing', 'puppet', 'deposed'
          authority: _clamp(opts.monarchAuthority != null ? opts.monarchAuthority : 75, 0, 100)
        },
        powerVector: {
          palaceGuardLoyalty: _clamp(opts.guardLoyalty != null ? opts.guardLoyalty : 80, 0, 100),
          innerChamber: _clamp(opts.innerChamber != null ? opts.innerChamber : 50, 0, 100),
          bureaucracyInfluence: _clamp(opts.bureaucracy != null ? opts.bureaucracy : 60, 0, 100),
          privyPurse: _clamp(opts.privyPurse != null ? opts.privyPurse : 70, 0, 100)
        },
        factions: Array.isArray(opts.factions) ? opts.factions : [
          { id: 'royalist', name: '帝党皇威派', influence: 70 },
          { id: 'chancellor_clique', name: '首辅权臣党', influence: 65 }
        ],
        activeIntrigues: [],
        auditLog: []
      };

      raw.courtIntrigue.courts[courtId] = created;
    });

    if (capacityReached) return { ok: false, reason: 'court-capacity' };
    return { ok: true, court: created };
  }

  function executeIntrigue(courtId, opKind, spec = {}) {
    const s = _getStore();
    if (!s || !s.transact) return { ok: false, error: 'store unavailable' };
    if (!settings().enabled) return { ok: false, error: 'court-intrigue disabled' };

    let out = null;

    s.transact(raw => {
      raw.courtIntrigue = raw.courtIntrigue || {};
      raw.courtIntrigue.courts = raw.courtIntrigue.courts || {};

      const court = raw.courtIntrigue.courts[courtId];
      if (!court) {
        stat.refusals++;
        stat.lastReason = 'court-not-found';
        out = { ok: false, refusal: 'court-not-found', error: `宫廷实体 ${courtId} 不存在` };
        return false;
      }

      const pVec = court.powerVector;
      const actorFaction = String(spec.actorFaction || 'rebel_faction');
      const targetRival = String(spec.targetRival || 'monarch');

      // 1. 负控制拦截：禁军铁血忠诚且大帝森严，文弱权臣无兵刃强闯逼宫
      if (opKind === 'executePalaceCoup') {
        const armedAssault = Boolean(spec.armedSupporters);
        if (pVec.palaceGuardLoyalty >= settings().minGuardLoyaltyResistance && !armedAssault) {
          stat.refusals++;
          stat.lastReason = 'imperial-guard-lethal-resistance';
          court.auditLog.unshift(`[政变诛杀] 派系 ${actorFaction} 孤身闯宫，被大内禁卫军当场乱箭射杀诛连九族。`);
          out = {
            ok: false,
            refusal: 'imperial-guard-lethal-resistance',
            error: '禁卫军御林军誓死效忠君王，谋逆权臣无兵力策应强行逼宫，被当场格杀诛灭九族！'
          };
          return;
        }
      }

      // 2. 负控制拦截：构陷罗织异己但完全无罪证线索
      if (opKind === 'frameRival') {
        const evidenceLevel = Number(spec.evidenceLevel || 0);
        if (evidenceLevel <= 10) {
          stat.refusals++;
          stat.lastReason = 'frame-evidence-insufficient';
          court.auditLog.unshift(`[诬告反噬] 派系 ${actorFaction} 罗织罪名过于低劣，大理寺与言官直接驳回并交御史台弹劾。`);
          out = {
            ok: false,
            refusal: 'frame-evidence-insufficient',
            error: '构陷罪证粗制滥造不足采信，已被司法言路直接驳回并遭遇政治反噬'
          };
          return;
        }
      }

      stat.intriguesExecuted++;
      let changeDesc = '';

      switch (opKind) {
        case 'frameRival': {
          stat.frameRivals++;
          const target = String(spec.targetRival || '宰相');
          const ev = _clamp(spec.evidenceLevel || 50, 10, 100);
          pVec.bureaucracyInfluence = _clamp(pVec.bureaucracyInfluence - Math.round(ev * 0.25), 0, 100);
          court.monarch.authority = _clamp(court.monarch.authority - 5, 0, 100);

          changeDesc = `罗织谋逆巫蛊密信构陷 ${target}，三法司会审将其下狱削夺官禄，文官政令陷入震荡。`;
          break;
        }

        case 'bribeInnerChamber': {
          stat.innerChamberBribes++;
          const goldAmount = Number(spec.goldAmount || 1000);
          pVec.innerChamber = _clamp(pVec.innerChamber + Math.round(goldAmount / 100), 0, 100);
          pVec.palaceGuardLoyalty = _clamp(pVec.palaceGuardLoyalty - 10, 0, 100);

          changeDesc = `重金私贿大内掌印太监与御前侍卫，成功收买内廷眼线，密旨脉案尽在掌握。`;
          break;
        }

        case 'forgeDecree': {
          stat.decreesForged++;
          const sealQuality = _clamp(spec.sealQuality || 70, 0, 100);
          if (sealQuality >= 60) {
            court.monarch.status = 'puppet';
            pVec.bureaucracyInfluence = _clamp(pVec.bureaucracyInfluence + 20, 0, 100);
            changeDesc = `以假乱真之私铸玺印伪造传位受禅诏书，掌控六部九卿公文流转，架空内朝。`;
          } else {
            pVec.palaceGuardLoyalty = _clamp(pVec.palaceGuardLoyalty + 15, 0, 100);
            changeDesc = `假借圣意被内廷密探窥破，伪诏未发，禁卫防范森严度剧增！`;
          }
          break;
        }

        case 'executePalaceCoup': {
          stat.coupsAttempted++;
          const coupForce = Number(spec.coupForce || 60);
          // 逼宫成功率受禁卫军忠诚与内廷渗透影响
          const guardFactor = 100 - pVec.palaceGuardLoyalty;
          const totalPower = coupForce * 0.5 + guardFactor * 0.3 + pVec.innerChamber * 0.2;

          if (totalPower >= settings().coupSuccessGuardThreshold) {
            stat.coupsSucceeded++;
            court.monarch.status = 'deposed';
            court.monarch.authority = 0;
            pVec.palaceGuardLoyalty = 30; // 彻底换防
            changeDesc = `【玄武喋血·逼宫得手】派系火把封锁宫闱，禁卫统领弃暗投明，逼迫大帝当榻写下退位诏书，王权更迭！`;
          } else {
            pVec.palaceGuardLoyalty = _clamp(pVec.palaceGuardLoyalty + 20, 0, 100);
            court.monarch.authority = _clamp(court.monarch.authority + 15, 0, 100);
            changeDesc = `【兵变受挫】政变武装遭遇忠勇御林军死战顽抗，血战黎明功亏一篑，逆党主谋仓皇潜逃！`;
          }
          break;
        }

        default:
          stat.refusals++;
          stat.lastReason = 'unknown-intrigue-kind';
          out = { ok: false, error: `未知的权谋行动: ${opKind}` };
          return false;
      }

      court.auditLog.unshift(`[${opKind}] ${changeDesc}`);
      if (court.auditLog.length > 30) court.auditLog.pop();

      out = {
        ok: true,
        courtId,
        opKind,
        desc: changeDesc,
        monarchStatus: court.monarch.status,
        powerVector: Object.assign({}, pVec)
      };
    });

    return out;
  }

  // v2.382.0：这两处是**只读**查询，却走了 `s.transact(...)` —— transact 是写口，
  //   每次调用都 bump `meta.writeSeq / stateRev` 并留下 writer。于是 `buildBlock()`
  //   （诊断出口，按本仓纪律「只报读数、不写世界」）被调用一次就改一次世界，
  //   v8-panel-activity 的「panel audit does not mutate world」当场咬住（实 meta 变化）。
  //   修法：改走 `s.get()` 只读快照，与 act.js / affect.js / action-desk.js 等同族写法一致。
  //   这不是放宽判据：诊断函数写世界**本身**就是缺陷，改的是产品侧。
  function getCourt(courtId) {
    const s = _getStore();
    if (!s || typeof s.get !== 'function') return null;
    const raw = s.get() || {};
    if (raw.courtIntrigue && raw.courtIntrigue.courts) {
      return raw.courtIntrigue.courts[courtId] || null;
    }
    return null;
  }
  function listCourts() {
    const s = _getStore();
    if (!s || typeof s.get !== 'function') return [];
    const raw = s.get() || {};
    if (raw.courtIntrigue && raw.courtIntrigue.courts) {
      return Object.values(raw.courtIntrigue.courts);
    }
    return [];
  }

  function buildBlock(state) {
    let courts = [];
    if (state && state.courtIntrigue && state.courtIntrigue.courts) {
      courts = Object.values(state.courtIntrigue.courts);
    } else {
      courts = listCourts();
    }
    if (!courts.length) return '';

    const lines = ['[深宫内斗与权臣逼宫态势 (Court Intrigue)]'];
    for (const c of courts) {
      lines.push(`- 皇廷【${c.realmName}】 君主: ${c.monarch.name}(${c.monarch.status}, 威权:${c.monarch.authority})`);
      lines.push(`  * 禁卫军死忠度: ${c.powerVector.palaceGuardLoyalty}% | 内廷近侍渗透: ${c.powerVector.innerChamber}% | 文官舆论: ${c.powerVector.bureaucracyInfluence}%`);
      if (c.auditLog && c.auditLog.length > 0) {
        lines.push(`  * 近期秘谋风波: ${c.auditLog[0]}`);
      }
    }
    return lines.join('\n');
  }

  function diagnose() {
    return {
      name: 'court-intrigue',
      version: VERSION,
      enabled: settings().enabled,
      monitoredCount: listCourts().length,
      stat: Object.assign({}, stat)
    };
  }

  function statView() {
    return Object.assign({}, stat);
  }

  function resetStat() {
    stat = {
      intriguesExecuted: 0,
      frameRivals: 0,
      innerChamberBribes: 0,
      decreesForged: 0,
      coupsAttempted: 0,
      coupsSucceeded: 0,
      refusals: 0,
      lastReason: ''
    };
  }

  const courtIntrigue = {
    version: VERSION,
    settings,
    saveSettings,
    registerCourt,
    executeIntrigue,
    getCourt,
    listCourts,
    buildBlock,
    diagnose,
    stat: statView,
    resetStat
  };

  WA.engines.courtIntrigue = courtIntrigue;
  WA.courtIntrigue = courtIntrigue;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = courtIntrigue;
  }
})();

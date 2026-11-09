/**
 * WorldAxis engines/incarceration-jailbreak.js (v2.380.0)
 * EXV21-3: 司法陪审团审判、狱政囚禁与亡命越狱追缉引擎 (Incarceration, Dungeon Ecology & Jailbreak Pursuit Engine)
 *
 * ── 核心架构哲学（Genre-Neutral Architecture）─────────────────────────
 * 无论是中世纪地牢黑狱、修仙锁妖塔天牢、近现代重刑犯水牢还是科幻轨道冷冻监狱，统一抽象为监禁羁押与逃脱博弈动力学：
 *  1. 羁押状态机与地牢生态（Prison Mesh & Custody）：
 *     - 关押形式（custodyType）: 'general' (普通监房), 'solitary' (单间水牢禁闭), 'forced_labor' (苦役石场), 'death_row' (死囚牢);
 *     - 戒备等级（securityLevel, 1~5）与 狱卒腐败度（guardCorruption, 0~100）；
 *     - 隐秘准备指标：暗道挖掘（tunnelProgress, 0~100）、藏匿工具（contrabandStash: 锉刀、迷药、麻绳、伪造钥匙）。
 *  2. 越狱行动与全境猎犬追缉（Escape & Bloodhound Pursuit）：
 *     - executeJailbreak: 触发逃脱结算（地道潜逃、制造暴动、撬锁潜行）；
 *     - 警报拉响（alarmTriggered）：全城宵禁封锁，出动搜捕队携带猎犬（bloodhoundTracking）；
 *     - 气味追踪判定：逃犯流血或未涉水时，猎犬追缉成功率极高；渡河过水或涂抹刺激性香料可斩断气味追踪。
 *  3. 破坏性负控制与状态持久化：
 *     - 处于最高戒备（securityLevel >= 4）且毫无内应或违禁工具（preparation == 0）强行徒手越狱，严格驳回（refusal: 'maximum-security-lockdown'）；
 *     - 非在押人员（自由身）调用越狱操作驳回（refusal: 'actor-not-incarcerated'）；
 *     - 所有牢狱收押与越狱记录落入 store.prisonSystem 台账。
 */
'use strict';

(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  WA.engines = WA.engines || {};

  const VERSION = '2.380.0';
  const LS_KEY = 'worldaxis_incarceration_jailbreak_settings_v1';

  const DEF = {
    enabled: true,
    maxPrisoners: 50,
    baseEscapeThreshold: 50,
    houndDetectionBase: 65
  };

  let stat = {
    inmatesAdmitted: 0,
    jailbreakAttempts: 0,
    successfulEscapes: 0,
    recaptures: 0,
    refusals: 0,
    lastReason: ''
  };

  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'incarcerationJailbreak'
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

  function getStore(draft) {
    const target = draft || (WA.store ? WA.store.get() : null);
    if (!target) return null;
    if (!target.prisonSystem || typeof target.prisonSystem !== 'object') {
      if (draft) target.prisonSystem = { inmates: {}, fugitives: {}, log: [] };
      return draft ? target.prisonSystem : null;
    }
    return target.prisonSystem;
  }

  /**
   * 押解收监登记：admitPrisoner
   */
  function admitPrisoner(actorId, spec) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    const aid = cleanStr(actorId, 60);
    if (!aid) {
      noteFault('invalid-prisoner-id');
      return { ok: false, refusal: 'invalid-prisoner-id' };
    }

    stat.inmatesAdmitted++;
    const p = spec || {};
    const validCustody = ['general', 'solitary', 'forced_labor', 'death_row'];
    const custodyType = validCustody.includes(p.custodyType) ? p.custodyType : 'general';

    const record = {
      actorId: aid,
      name: cleanStr(p.name || aid, 60),
      crime: cleanStr(p.crime || 'Heresy or Sedition', 100),
      custodyType: custodyType,
      securityLevel: clamp(p.securityLevel || (custodyType === 'death_row' ? 5 : 2), 1, 5),
      guardCorruption: clamp(p.guardCorruption !== undefined ? p.guardCorruption : 0, 0, 100),
      tunnelProgress: 0,
      contraband: Array.isArray(p.contraband) ? p.contraband.slice(0, 5) : [],
      status: 'in-custody',
      sentenceDays: Math.max(1, parseInt(p.sentenceDays, 10) || 30),
      daysServed: 0,
      admittedAt: clockNow('prison:admit')
    };

    let capacityReached = false;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const s = getStore(draft);
        if (s && !s.inmates[aid] && Object.keys(s.inmates).length >= Math.max(1, Math.floor(settings().maxPrisoners))) {
          capacityReached = true;
          return;
        }
        if (s) {
          s.inmates[aid] = record;
        }
      });
    }

    if (capacityReached) return { ok: false, reason: 'capacity-reached' };
    return { ok: true, inmate: record };
  }

  /**
   * 狱中走私与挖掘准备操作
   */
  function advanceEscapePrep(actorId, prepKind, spec) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    const aid = cleanStr(actorId, 60);
    const st = getStore();
    if (!st || !st.inmates || !st.inmates[aid]) {
      noteFault('actor-not-incarcerated');
      return { ok: false, refusal: 'actor-not-incarcerated' };
    }

    const inmate = Object.assign({}, st.inmates[aid]);
    if (inmate.status !== 'in-custody') {
      noteFault('actor-not-incarcerated');
      return { ok: false, refusal: 'actor-not-incarcerated', currentStatus: inmate.status };
    }

    const p = spec || {};
    const kind = cleanStr(prepKind, 30);

    if (kind === 'bribe_guard') {
      const bribeAmount = Math.max(10, parseInt(p.amount, 10) || 50);
      inmate.guardCorruption = clamp(inmate.guardCorruption + Math.round(bribeAmount / 10), 0, 100);
    } else if (kind === 'smuggle_tool') {
      const tool = cleanStr(p.tool || 'lockpick', 30);
      if (inmate.contraband.length < 5) inmate.contraband.push(tool);
    } else if (kind === 'dig_tunnel') {
      const effort = clamp(p.effort || 10, 5, 25);
      // 水牢无法挖掘地道
      if (inmate.custodyType === 'solitary') {
        noteFault('solitary-dig-impossible');
        return { ok: false, refusal: 'solitary-dig-impossible', reason: 'Flooded cell makes digging impossible.' };
      }
      inmate.tunnelProgress = clamp(inmate.tunnelProgress + effort, 0, 100);
    }

    inmate.updatedAt = clockNow('prison:prep');

    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const s = getStore(draft);
        if (s && s.inmates) {
          s.inmates[aid] = inmate;
        }
      });
    }

    return {
      ok: true,
      actorId: aid,
      tunnelProgress: inmate.tunnelProgress,
      guardCorruption: inmate.guardCorruption,
      contraband: inmate.contraband
    };
  }

  /**
   * 核心业务派发：executeJailOp
   */
  function executeJailOp(opKind, spec, opts) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    const op = cleanStr(opKind, 30);
    const p = spec || {};
    const aid = cleanStr(p.actorId, 60);

    if (op === 'admit') {
      return admitPrisoner(aid, p);
    }
    if (op === 'prep') {
      return advanceEscapePrep(aid, p.prepKind, p);
    }

    if (op === 'jailbreak') {
      stat.jailbreakAttempts++;
      const st = getStore();
      if (!st || !st.inmates || !st.inmates[aid]) {
        noteFault('actor-not-incarcerated');
        return { ok: false, refusal: 'actor-not-incarcerated' };
      }

      const inmate = Object.assign({}, st.inmates[aid]);
      if (inmate.status !== 'in-custody') {
        noteFault('actor-not-incarcerated');
        return { ok: false, refusal: 'actor-not-incarcerated', currentStatus: inmate.status };
      }

      const method = cleanStr(p.method || 'tunnel', 30); // tunnel, riot, lockpick
      const preparationScore = (inmate.tunnelProgress * 0.4) + (inmate.guardCorruption * 0.3) + (inmate.contraband.length * 10);

      // 破坏性负控制拦截：高戒备且零准备强行越狱必遭镇压
      if (inmate.securityLevel >= 4 && preparationScore <= 5) {
        noteFault('maximum-security-lockdown');
        inmate.custodyType = 'solitary'; // 关入水牢加刑
        inmate.contraband = [];
        inmate.tunnelProgress = 0;
        inmate.status = 'in-custody';
        
        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s && s.inmates) {
              s.inmates[aid] = inmate;
            }
          });
        }

        return {
          ok: false,
          refusal: 'maximum-security-lockdown',
          actorId: aid,
          punishment: 'Thrown into solitary water dungeon with all contraband confiscated.',
          reason: 'Cannot break out of high-security cell without tools, bribes or tunnels.'
        };
      }

      // 计算逃脱成功几率
      const difficulty = inmate.securityLevel * 20;
      const successChance = clamp(preparationScore - difficulty + (90 - settings().baseEscapeThreshold), 5, 95);
      const roll = (typeof p.testRoll === 'number') ? p.testRoll : Math.floor(WA.rand.next('incarceration-jailbreak') * 100);
      const isSuccess = roll < successChance;

      if (isSuccess) {
        stat.successfulEscapes++;
        inmate.status = 'escaped';
        const fugitiveRecord = {
          actorId: aid,
          name: inmate.name,
          crime: inmate.crime,
          bounty: inmate.securityLevel * 200,
          scentCovered: false,
          lastSeen: cleanStr(p.exitRoute || 'Drainage Canal', 60),
          escapedAt: clockNow('prison:escaped')
        };

        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s) {
              s.inmates[aid] = inmate;
              s.fugitives[aid] = fugitiveRecord;
              s.log.push({ op: 'jailbreak_success', actorId: aid, method, at: clockNow() });
            }
          });
        }

        return {
          ok: true,
          op: 'jailbreak',
          escaped: true,
          actorId: aid,
          bounty: fugitiveRecord.bounty,
          exitRoute: fugitiveRecord.lastSeen
        };
      } else {
        // 逃脱失败被当场捕回加刑
        inmate.sentenceDays += 30;
        inmate.contraband = [];
        inmate.tunnelProgress = 0;

        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s && s.inmates) {
              s.inmates[aid] = inmate;
              s.log.push({ op: 'jailbreak_failed', actorId: aid, method, at: clockNow() });
            }
          });
        }

        return {
          ok: true,
          op: 'jailbreak',
          escaped: false,
          actorId: aid,
          extendedSentence: inmate.sentenceDays,
          reason: 'Guards sounded the alarm during breakout.'
        };
      }
    }

    if (op === 'pursue') {
      // 搜捕队与猎犬追缉
      const st = getStore();
      if (!st || !st.fugitives || !st.fugitives[aid]) {
        noteFault('fugitive-not-found');
        return { ok: false, refusal: 'fugitive-not-found', actorId: aid };
      }

      const fug = Object.assign({}, st.fugitives[aid]);
      const crossedWater = !!p.crossedWater; // 涉水过河斩断气味
      const scentMaskUsed = !!p.scentMaskUsed; // 刺激性药粉

      let houndScentTrack = settings().houndDetectionBase;
      if (crossedWater) houndScentTrack -= 50;
      if (scentMaskUsed) houndScentTrack -= 35;
      houndScentTrack = clamp(houndScentTrack, 5, 95);

      const roll = (typeof p.testRoll === 'number') ? p.testRoll : Math.floor(WA.rand.next('incarceration-jailbreak') * 100);
      const tracked = roll < houndScentTrack;

      if (tracked) {
        stat.recaptures++;
        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s) {
              delete s.fugitives[aid];
              if (s.inmates[aid]) {
                s.inmates[aid].status = 'in-custody';
                s.inmates[aid].custodyType = 'death_row'; // 抓回直接送入死囚牢
              }
              s.log.push({ op: 'recaptured', actorId: aid, at: clockNow() });
            }
          });
        }

        return {
          ok: true,
          op: 'pursue',
          recaptured: true,
          actorId: aid,
          reason: 'Bloodhounds followed the scent track directly to the hideout.'
        };
      } else {
        fug.scentCovered = true;
        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s && s.fugitives[aid]) {
              s.fugitives[aid] = fug;
            }
          });
        }

        return {
          ok: true,
          op: 'pursue',
          recaptured: false,
          actorId: aid,
          reason: crossedWater ? 'Scent trace severed by running river current.' : 'Scent masked successfully.'
        };
      }
    }

    noteFault('unsupported-op');
    return { ok: false, refusal: 'unsupported-op', opKind };
  }

  function getPrisoner(actorId) {
    const st = getStore();
    if (!st || !st.inmates) return null;
    return st.inmates[cleanStr(actorId, 60)] || null;
  }

  function listPrisoners() {
    const st = getStore();
    if (!st || !st.inmates) return [];
    return Object.keys(st.inmates).map(k => st.inmates[k]);
  }

  function listFugitives() {
    const st = getStore();
    if (!st || !st.fugitives) return [];
    return Object.keys(st.fugitives).map(k => st.fugitives[k]);
  }

  function buildBlock(context) {
    if (!settings().enabled) return '';
    const fugs = listFugitives();
    const inmates = listPrisoners().filter(i => i.status === 'in-custody' && i.custodyType === 'death_row');

    let out = '';
    if (fugs.length > 0) {
      out += '【刑狱通缉·在逃要犯】\n' + fugs.slice(0, 3).map(f => `• ${f.name} (罪名:${f.crime}, 悬赏:${f.bounty}两, 出逃方向:${f.lastSeen})`).join('\n') + '\n';
    }
    if (inmates.length > 0) {
      out += '【天牢死囚】\n' + inmates.slice(0, 2).map(i => `• ${i.name} (罪名:${i.crime}, 戒备等级:${i.securityLevel})`).join('\n') + '\n';
    }

    return out.trim() ? '[司法狱政与通缉令]\n' + out.trim() : '';
  }

  function diagnose() {
    return {
      version: VERSION,
      enabled: settings().enabled,
      inmatesCount: listPrisoners().length,
      fugitivesCount: listFugitives().length,
      stat: Object.assign({}, stat)
    };
  }

  function statView() {
    return Object.assign({}, stat);
  }

  function resetStat() {
    stat = {
      inmatesAdmitted: 0,
      jailbreakAttempts: 0,
      successfulEscapes: 0,
      recaptures: 0,
      refusals: 0,
      lastReason: ''
    };
  }

  const incarcerationJailbreak = {
    version: VERSION,
    settings,
    saveSettings,
    admitPrisoner,
    advanceEscapePrep,
    executeJailOp,
    getPrisoner,
    listPrisoners,
    listFugitives,
    buildBlock,
    diagnose,
    stat: statView,
    resetStat
  };

  WA.engines.incarcerationJailbreak = incarcerationJailbreak;
  WA.incarcerationJailbreak = incarcerationJailbreak;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = incarcerationJailbreak;
  }
})();

/**
 * WorldAxis engines/bloodline-heritage.js (v2.380.0)
 * EXV21-4: 跨世代血脉遗赠、家谱传续与家族诅咒信托引擎 (Bloodline Heritage, Dynastic Curse & Testamentary Trust Engine)
 *
 * ── 核心架构哲学（Genre-Neutral Architecture）─────────────────────────
 * 无论是古风门阀氏族宗祠、修仙世家真血道统、西幻贵族私生子继承还是赛博财阀基因密钥信托，统一抽象为血脉因果模型：
 *  1. 世代家谱图谱与继承顺位（Genealogy Tree & Succession）：
 *     - 记录宗族辈分代际（generation）、父系/母系血亲节点、直系婚生与私生顺位；
 *     - 显隐性遗传特质与先祖诅咒（dynasticCurse）：如狂暴失心、短命早夭、眼盲、天生灵慧或基因衰竭。
 *  2. 宗祠密匣与遗嘱信托（Ancestral Trust & Testamentary Secret）：
 *     - 宗族设立不可撤销血脉信托基金（trustVault）：存有黄金、地契、不传秘宝或禁忌科技；
 *     - 继承验真契约：必须满足血统匹配度（bloodMatchPct >= 70）或持信物验真方可解封宗祠密室；
 *     - 绝嗣危机（extinctionCrisis）：直系断绝触发旁系分支争权夺宗与宗法仲裁。
 *  3. 破坏性负控制与状态持久化：
 *     - 伪造血统、外姓冒充或血契验真不匹配强行开锁，严格驳回（refusal: 'bloodline-mismatch-unauthorized'）并触发反噬自毁；
 *     - 宗族不存在或家谱空指针驳回（refusal: 'lineage-not-found'）；
 *     - 宗族台账落入 store.bloodlines。
 */
'use strict';

(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  WA.engines = WA.engines || {};

  const VERSION = '2.380.0';
  const LS_KEY = 'worldaxis_bloodline_heritage_settings_v1';

  const DEF = {
    enabled: true,
    maxLineages: 30,
    requiredBloodMatch: 70
  };

  let stat = {
    lineagesRegistered: 0,
    successionsResolved: 0,
    trustsClaimed: 0,
    curseManifestations: 0,
    refusals: 0,
    lastReason: ''
  };

  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'bloodlineHeritage'
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
    if (!target.bloodlines || typeof target.bloodlines !== 'object') {
      if (draft) target.bloodlines = { clans: {}, successionLog: [] };
      return draft ? target.bloodlines : null;
    }
    return target.bloodlines;
  }

  function registerClan(clanId, spec) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    const cid = cleanStr(clanId, 40);
    if (!cid) {
      noteFault('invalid-clan-id');
      return { ok: false, refusal: 'invalid-clan-id' };
    }

    stat.lineagesRegistered++;
    const p = spec || {};
    const record = {
      clanId: cid,
      name: cleanStr(p.name || cid, 60),
      patriarch: cleanStr(p.patriarch || 'Current Head', 60),
      generation: Math.max(1, parseInt(p.generation, 10) || 1),
      curse: cleanStr(p.curse || 'None', 80),
      curseSeverity: clamp(p.curseSeverity || 0, 0, 100),
      members: Array.isArray(p.members) ? p.members.slice(0, 50) : [],
      successionOrder: Array.isArray(p.successionOrder) ? p.successionOrder.slice(0, 10) : [],
      trustVault: {
        wealth: Math.max(0, parseInt(p.trustWealth, 10) || 1000),
        secretItem: cleanStr(p.secretItem || 'Ancestral Seal', 60),
        locked: true,
        dnaKey: cleanStr(p.dnaKey || cid + '_blood_sigil', 40)
      },
      updatedAt: clockNow('bloodline:register')
    };

    let capacityReached = false;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const s = getStore(draft);
        if (s && !s.clans[cid] && Object.keys(s.clans).length >= Math.max(1, Math.floor(settings().maxLineages))) {
          capacityReached = true;
          return;
        }
        if (s) {
          s.clans[cid] = record;
        }
      });
    }

    if (capacityReached) return { ok: false, reason: 'capacity-reached' };
    return { ok: true, clan: record };
  }

  function transactLineage(opKind, spec, opts) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    const op = cleanStr(opKind, 30);
    const p = spec || {};
    const cid = cleanStr(p.clanId, 40);

    const st = getStore();
    const clan = (st && st.clans && st.clans[cid]) ? Object.assign({}, st.clans[cid]) : null;

    if (!clan && op !== 'register') {
      noteFault('lineage-not-found');
      return { ok: false, refusal: 'lineage-not-found', clanId: cid };
    }

    switch (op) {
      case 'claim_trust': {
        const claimantId = cleanStr(p.claimantId, 60);
        const bloodMatchPct = clamp(p.bloodMatchPct || 0, 0, 100);
        const hasSealToken = !!p.hasSealToken;

        const reqMatch = settings().requiredBloodMatch;
        // 破坏性负控制：血统不符且无有效宗族印鉴信物，强行开启信托密匣必驳回
        if (bloodMatchPct < reqMatch && !hasSealToken) {
          noteFault('bloodline-mismatch-unauthorized');
          return {
            ok: false,
            refusal: 'bloodline-mismatch-unauthorized',
            claimantId,
            bloodMatchPct,
            requiredPct: reqMatch,
            reason: 'Claimant lacks legitimate blood heritage and holds no ancestral seal.'
          };
        }

        stat.trustsClaimed++;
        clan.trustVault.locked = false;
        const inheritedWealth = clan.trustVault.wealth;
        const inheritedItem = clan.trustVault.secretItem;
        clan.trustVault.wealth = 0;
        clan.patriarch = claimantId; // 成为新族长
        clan.updatedAt = clockNow('bloodline:claimTrust');

        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s && s.clans[cid]) {
              s.clans[cid] = clan;
              s.successionLog.push({ op: 'claim_trust', clanId: cid, claimantId, at: clockNow() });
            }
          });
        }

        return {
          ok: true,
          op: 'claim_trust',
          clanId: cid,
          claimantId,
          inheritedWealth,
          inheritedItem,
          newPatriarch: claimantId
        };
      }

      case 'manifest_curse': {
        stat.curseManifestations++;
        const targetMember = cleanStr(p.targetMember, 60);
        const intensity = clamp(p.intensity || 20, 5, 50);

        clan.curseSeverity = clamp(clan.curseSeverity + intensity, 0, 100);
        clan.updatedAt = clockNow('bloodline:curse');

        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s && s.clans[cid]) {
              s.clans[cid] = clan;
            }
          });
        }

        return {
          ok: true,
          op: 'manifest_curse',
          clanId: cid,
          targetMember,
          curseName: clan.curse,
          newCurseSeverity: clan.curseSeverity,
          symptoms: clan.curseSeverity >= 70 ? 'Terminal Affliction or Madness' : 'Mild Hereditary Tremors'
        };
      }

      case 'resolve_succession': {
        stat.successionsResolved++;
        if (!clan.successionOrder || clan.successionOrder.length === 0) {
          noteFault('succession-extinction-crisis');
          return {
            ok: false,
            refusal: 'succession-extinction-crisis',
            clanId: cid,
            reason: 'Direct bloodline completely extinct; collateral branches contesting.'
          };
        }

        const nextHeir = clan.successionOrder[0];
        clan.patriarch = nextHeir;
        clan.successionOrder = clan.successionOrder.slice(1);
        clan.generation += 1;
        clan.updatedAt = clockNow('bloodline:succession');

        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s && s.clans[cid]) {
              s.clans[cid] = clan;
              s.successionLog.push({ op: 'succession', clanId: cid, nextHeir, at: clockNow() });
            }
          });
        }

        return {
          ok: true,
          op: 'resolve_succession',
          clanId: cid,
          newHead: nextHeir,
          newGeneration: clan.generation,
          remainingHeirs: clan.successionOrder
        };
      }

      default: {
        noteFault('unsupported-op');
        return { ok: false, refusal: 'unsupported-op', opKind };
      }
    }
  }

  function getClan(clanId) {
    const st = getStore();
    if (!st || !st.clans) return null;
    return st.clans[cleanStr(clanId, 40)] || null;
  }

  function listClans() {
    const st = getStore();
    if (!st || !st.clans) return [];
    return Object.keys(st.clans).map(k => st.clans[k]);
  }

  function buildBlock(context) {
    if (!settings().enabled) return '';
    const clans = listClans();
    if (!clans.length) return '';

    const lines = clans.slice(0, 4).map(c => {
      return `【名门望族·${c.name}】代系:第${c.generation}代 族长:${c.patriarch} 诅咒:${c.curse}(${c.curseSeverity}%) 继承顺位:${c.successionOrder.join('>') || '绝嗣断代'}`;
    });

    return '[世代门阀与宗族血脉]\n' + lines.join('\n');
  }

  function diagnose() {
    return {
      version: VERSION,
      enabled: settings().enabled,
      clanCount: listClans().length,
      stat: Object.assign({}, stat)
    };
  }

  function statView() {
    return Object.assign({}, stat);
  }

  function resetStat() {
    stat = {
      lineagesRegistered: 0,
      successionsResolved: 0,
      trustsClaimed: 0,
      curseManifestations: 0,
      refusals: 0,
      lastReason: ''
    };
  }

  const bloodlineHeritage = {
    version: VERSION,
    settings,
    saveSettings,
    registerClan,
    transactLineage,
    getClan,
    listClans,
    buildBlock,
    diagnose,
    stat: statView,
    resetStat
  };

  WA.engines.bloodlineHeritage = bloodlineHeritage;
  WA.bloodlineHeritage = bloodlineHeritage;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = bloodlineHeritage;
  }
})();
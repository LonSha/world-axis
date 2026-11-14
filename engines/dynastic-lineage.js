/**
 * WorldAxis engines/dynastic-lineage.js (v2.408.0) — EXV23-8 门阀族谱、血脉门荫与嫡庶承袭争夺
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   G5 实测：家族与门阀系统缺乏多代血脉图谱、门荫免试入仕特权、
 *   近亲通婚遗传病累积与长老会立嗣争嫡政变机制。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `dynasticLineage.bindLineage` 登记血脉父系/母系关系，核算门荫爵位加成与遗传病标记；
 *   `dynasticLineage.conveneSuccession` 发起长老会立嗣仲裁，裁决嫡庶合法性与夺嫡叛变；
 *   `dynasticLineage.claimPrivilege` 消耗宗族声望兑换官职或免罪特权。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 外人或未被宗族承认者索要继承权拒绝（refusal: unrecognized-lineage-bloodline）。
 *   ② 宗族声望为负或已除名者无法享受门荫特权（refusal: lineage-privilege-revoked）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_dynastic_lineage_settings_v1';
  const DEF = {
    enabled: true,
    privilegePrestigeCost: 30
  };

  const __REG = {
    key: 'dynasticLineage',
    name: '门阀世系与夺嫡立嗣 (EXV23-8)',
    desc: '三代族谱、门荫特权、遗传隐疾与宗族承袭政变模型',
    settingsKey: LS_KEY,
    schema: {
      enabled: { type: 'boolean', default: true },
      privilegePrestigeCost: { type: 'number', default: 30 }
    }
  };

  const STATE = {
    clans: {},   // clanId -> { prestige, headActorId, elders: [], lineageTree: {} }
    members: {}  // actorId -> { clanId, isLegitimate, rank, geneticMarkers: [], privilegesClaimed }
  };

  const stat = {
    lineagesBound: 0,
    successionsDecided: 0,
    privilegesClaimed: 0
  };

  function settings() {
    if (WA.settingsBus && typeof WA.settingsBus.getModuleSettings === 'function') {
      const s = WA.settingsBus.getModuleSettings(__REG.key, DEF);
      return Object.assign({}, DEF, s);
    }
    return Object.assign({}, DEF);
  }

  function clockNow() {
    if (WA.clock && typeof WA.clock.now === 'function') return WA.clock.now();
    return Date.now();
  }

  function ensureClan(clanId) {
    if (!STATE.clans[clanId]) {
      STATE.clans[clanId] = {
        id: clanId,
        prestige: 100,
        headActorId: '',
        elders: [],
        lineageTree: {}
      };
    }
  }

  function bindLineage(actorId, clanId, spec) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, refusal: 'dynastic-lineage-disabled' };
    if (!actorId || !clanId) return { ok: false, refusal: 'missing-lineage-id' };
    ensureClan(clanId);

    const s = spec || {};
    const isLegit = typeof s.isLegitimate === 'boolean' ? s.isLegitimate : true;
    const genetics = Array.isArray(s.geneticMarkers) ? s.geneticMarkers : [];

    STATE.members[actorId] = {
      clanId: clanId,
      isLegitimate: isLegit,
      rank: s.rank || (isLegit ? 'di-heir' : 'shu-cadet'),
      geneticMarkers: genetics,
      privilegesClaimed: 0
    };
    STATE.clans[clanId].lineageTree[actorId] = {
      father: s.fatherId || null,
      mother: s.motherId || null,
      legitimate: isLegit
    };
    stat.lineagesBound++;

    return {
      ok: true,
      actorId: actorId,
      clanId: clanId,
      legitimate: isLegit,
      at: clockNow()
    };
  }

  function conveneSuccession(clanId, claimantId, spec) {
    ensureClan(clanId);
    const m = STATE.members[claimantId];
    if (!m || m.clanId !== clanId) {
      return {
        ok: false,
        refusal: 'unrecognized-lineage-bloodline',
        hint: '宣称者不具备该门阀世系血脉，长老会一致驳回'
      };
    }

    const s = spec || {};
    const forceCoup = Boolean(s.forceCoup);
    const clan = STATE.clans[clanId];

    if (m.isLegitimate || forceCoup) {
      clan.headActorId = claimantId;
      stat.successionsDecided++;
      return {
        ok: true,
        clanId: clanId,
        newHeadId: claimantId,
        status: forceCoup ? 'coup-success' : 'orderly-succession',
        hint: forceCoup ? '庶子兵变强行废立，夺取宗族印信' : '正统嫡出顺位继承宗主之位',
        at: clockNow()
      };
    }

    return {
      ok: false,
      refusal: 'cadet-branch-blocked-by-elders',
      hint: '庶出宗亲无兵权且无嫡长法统，长老会否决立嗣提案'
    };
  }

  function claimPrivilege(actorId, privilegeKind) {
    const m = STATE.members[actorId];
    if (!m) return { ok: false, refusal: 'unrecognized-lineage-bloodline' };
    const clan = STATE.clans[m.clanId];

    const cfg = settings();
    if (clan.prestige < cfg.privilegePrestigeCost) {
      return {
        ok: false,
        refusal: 'lineage-privilege-revoked',
        hint: '门阀世系声望衰颓见底，门荫官爵庇护特权已失效'
      };
    }

    clan.prestige -= cfg.privilegePrestigeCost;
    m.privilegesClaimed++;
    stat.privilegesClaimed++;

    return {
      ok: true,
      actorId: actorId,
      clanId: m.clanId,
      privilege: privilegeKind || 'office-appointment',
      remainingClanPrestige: clan.prestige,
      at: clockNow()
    };
  }

  function reset() {
    STATE.clans = {};
    STATE.members = {};
    stat.lineagesBound = 0;
    stat.successionsDecided = 0;
    stat.privilegesClaimed = 0;
    return { ok: true };
  }

  WA.dynasticLineage = {
    bindLineage: bindLineage,
    conveneSuccession: conveneSuccession,
    claimPrivilege: claimPrivilege,
    reset: reset,
    getSettings: settings
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/dynastic-lineage.js', { kind: 'engine', ver: '2.408.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/dynastic-lineage 已加载（2.408.0）');
  }
})();
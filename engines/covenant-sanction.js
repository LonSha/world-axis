/**
 * WorldAxis engines/covenant-sanction.js (v2.351.0) — 铁律盟约契书、违约清算与超自然契约反噬引擎 (EXV19-8)
 *
 * ── 它治什么（核心沙盒痛点）────────────────────────────────────
 *   沙盒世界的“盟约/誓言”常被视作一纸空文，随时撕毁且无实质制度成本与因果惩戒：
 *   两国停火条约撕毁后商人不会被驱逐、资产不会被查封、阵营信誉不会全图归零；
 *   更缺乏奇幻/修仙/克苏鲁语境下违背天道誓言与恶魔血契的心魔噬体、因果天劫当场暴毙反噬。
 *
 * ── 核心机制闭环 ───────────────────────────────────────────────
 *   ① 契约矩阵与法理层级（Covenant Tiers）：
 *      - secular（世俗公理条约）：商业专营合同、停战盟约、宗门从属契书；
 *      - supernatural（超自然因果血契）：灵魂抵押、血誓盟约、天道立誓。
 *   ② 契约治理全生命周期（enforceCovenant）：
 *      - signCovenant: 订立条约，确立签约各方（signatories）、白名单条款（terms）与抵押品/违约代价；
 *      - inspectCompliance: 依据当前行为判定是否触犯条约禁忌；
 *      - breachAndSanction: 执行清算制裁。世俗条约触发扣押质押、全图阵营声誉破产（reputationBankruptcy）；
 *        超自然条约触发因果雷劫或灵魂撕裂反噬（karmicBacklash）。
 *   ③ 破坏性负控制：
 *      - 当当事方的行为完全在条约白名单合法允许范围内（未触犯任何禁止条款），强行申请清算制裁，
 *        断言直接驳回（refusal: 'valid-terms-no-breach-detected'）。
 *
 * ── 铁律与设计边界 ─────────────────────────────────────────────
 *   - 纯框架中立，全题材通用；
 *   - 状态持久化于 WA.store（root.covenantLedger）；
 *   - 行为真源，绝无虚假虚构。
 */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this);
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_covenant_sanction_settings_v1';
  const DEF = {
    enabled: true,
    maxCovenants: 32,
    maxSanctions: 64,
    defaultBankruptcyDuration: 30
  };
  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'covenantSanction',
    bounds: {
      maxCovenants: [4, 64],
      maxSanctions: [8, 128],
      defaultBankruptcyDuration: [5, 120]
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
    covenantsSigned: 0,
    sanctionsEnforced: 0,
    karmicBacklashes: 0,
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
  function getCovenantStore(draft) {
    const target = draft || (WA.store ? WA.store.get() : null);
    if (!target) return null;
    if (!target.covenantLedger) {
      if (draft) draft.covenantLedger = { covenants: [], sanctions: [] };
      return draft ? draft.covenantLedger : null;
    }
    return target.covenantLedger;
  }

  /**
   * 盟约契约主调度写口
   */
  function enforceCovenant(covenantId, eventSpec) {
    covenantId = cleanStr(covenantId || (eventSpec && eventSpec.covenantId), 48);
    eventSpec = eventSpec || {};
    const action = cleanStr(eventSpec.action || 'breachAndSanction', 32);

    let result = null;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const store = getCovenantStore(draft);
        if (!store) {
          result = { ok: false, refusal: 'covenant-store-unavailable' };
          noteFault('covenant-store-unavailable');
          return;
        }

        const now = clockNow('enforceCovenant');

        if (action === 'signCovenant') {
          // 签订契约盟书
          const covRecord = {
            covenantId: covenantId || ('cov_' + Date.now()),
            name: cleanStr(eventSpec.name || '互不侵犯与通商铁约', 48),
            tier: cleanStr(eventSpec.tier || 'secular', 24), // secular | supernatural
            signatories: Array.isArray(eventSpec.signatories) ? eventSpec.signatories.slice() : ['party_a', 'party_b'],
            prohibitedActs: Array.isArray(eventSpec.prohibitedActs) ? eventSpec.prohibitedActs.slice() : ['border_attack', 'cargo_confiscation'],
            collateralValue: clamp(eventSpec.collateralValue != null ? eventSpec.collateralValue : 1000, 0, 1000000),
            status: 'active', // active | breached | fulfilled | revoked
            createdAt: now
          };
          store.covenants.unshift(covRecord);
          if (store.covenants.length > 50) store.covenants.length = 50;
          stat.covenantsSigned++;

          result = {
            ok: true,
            action: 'signCovenant',
            covenantId: covRecord.covenantId,
            name: covRecord.name,
            tier: covRecord.tier,
            signatories: covRecord.signatories,
            narrative: `「${covRecord.name}」正式订立，各方加盖朱印/血契真言，以 ${covRecord.collateralValue} 资产及法理因果为押！`
          };
        } else if (action === 'breachAndSanction') {
          // 清算制裁与反噬
          const cov = store.covenants.find(function (c) { return c.covenantId === covenantId; });
          if (!cov) {
            result = { ok: false, refusal: 'covenant-not-found', reason: '未找到指定契约编号' };
            noteFault('covenant-not-found');
            return;
          }

          const violatorId = cleanStr(eventSpec.violatorId || 'party_a', 48);
          const actCommitted = cleanStr(eventSpec.committedAct || '', 48);
          const isBreach = cov.prohibitedActs.includes(actCommitted) || eventSpec.forceBreach === true;

          // 破坏性负控制断言：完全在合法条款范围（非禁止行为且未强制标记违约），严禁触发违约制裁！
          if (!isBreach) {
            result = {
              ok: false,
              refusal: 'valid-terms-no-breach-detected',
              reason: '该行为属于条约许可范围或未触犯明文禁止条款，严禁无故发起违约清算制裁！',
              covenantId: covenantId,
              committedAct: actCommitted
            };
            noteFault('valid-terms-no-breach-detected');
            return;
          }

          cov.status = 'breached';
          stat.sanctionsEnforced++;

          let sanctionType = 'reputationBankruptcy';
          let consequence = '';

          if (cov.tier === 'supernatural') {
            sanctionType = 'karmicBacklash';
            stat.karmicBacklashes++;
            consequence = `超自然契约反噬爆发！九天惊雷与心魔剧烈冲击「${violatorId}」，神魂道基重创，修为暴跌甚至血脉枯竭！`;
          } else {
            sanctionType = 'reputationBankruptcy';
            consequence = `世俗盟约彻底破裂！「${violatorId}」在所有邦国商会的信用归零，没收其在押物资 ${cov.collateralValue}，解除盟友防御庇护！`;
          }

          const sanctionRecord = {
            sanctionId: 'sanc_' + Date.now(),
            covenantId: covenantId,
            violatorId: violatorId,
            act: actCommitted,
            sanctionType: sanctionType,
            consequence: consequence,
            at: now
          };
          store.sanctions.unshift(sanctionRecord);
          if (store.sanctions.length > 50) store.sanctions.length = 50;

          result = {
            ok: true,
            action: 'breachAndSanction',
            covenantId: covenantId,
            violatorId: violatorId,
            sanctionType: sanctionType,
            narrative: consequence
          };
        } else {
          result = { ok: false, refusal: 'unknown-covenant-action', reason: '未知契约操作: ' + action };
          noteFault('unknown-covenant-action');
        }
      });
    }

    return result || { ok: false, refusal: 'store-unavailable' };
  }

  function buildBlock() {
    const store = getCovenantStore();
    if (!store) return '';
    const activeCovs = (store.covenants || []).filter(function (c) { return c.status === 'active'; }).slice(0, 3);
    const recentBreaches = (store.sanctions || []).slice(0, 2);
    if (activeCovs.length === 0 && recentBreaches.length === 0) return '';

    const lines = ['【盟约铁律与契约因果】'];
    activeCovs.forEach(function (c) {
      lines.push(`· 活跃条约「${c.name}」(${c.covenantId})：签署方 [${c.signatories.join(', ')}]，层级 ${c.tier}`);
    });
    recentBreaches.forEach(function (s) {
      lines.push(`· 违约惩戒案：${s.violatorId} 背誓触犯「${s.act}」，承受「${s.sanctionType}」因果制裁！`);
    });
    return lines.join('\n');
  }

  WA.covenantSanction = {
    DEF: DEF,
    settings: settings,
    saveSettings: saveSettings,
    enforceCovenant: enforceCovenant,
    buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat); }
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/covenant-sanction.js', { kind: 'engine', ver: '2.351.0' });
  }
})();
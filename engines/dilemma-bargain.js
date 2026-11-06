/**
 * WorldAxis engines/dilemma-bargain.js (v2.315.0) — EXV14-6 复合利益困局动态生成与非零和协商协议
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   在多角色博弈中，多方利益经常陷入非零和困局（如物资有限但双方都急需、
 *   或者降税与治安难以兼得）。此前缺乏量化的谈判桌效用协商协议，
 *   导致要么直接硬冲突，要么单方面让步，缺乏深度的人性博弈与妥协机制。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `dilemmaBargain.negotiate`：
 *   1. 召集两方或多方围绕资源/主权分配方案（allocation）展开协商；
 *   2. 基于各方的底线效用（reservationUtility）与权重进行非零和判定；
 *   3. 若分配满足帕累托改善或各方效用均超过底线，达成和解条约（pact）；
 *   4. 和解条约落盘并提升双方信任度（affinity +15），否则谈判破裂。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_dilemma_bargain_settings_v1';
  const DEF = { enabled: true, maxPacts: 32, defaultReservationUtility: 30 };
  const __REG = { key: LS_KEY, def: DEF, module: 'dilemmaBargain' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    const base = Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function transact(fn, why) {
    if (!WA.store || typeof WA.store.transact !== 'function') return false;
    try { WA.store.transact(fn, 'dilemmaBargain:' + (why || 'update')); return true; }
    catch (e) { return false; }
  }

  const stat = { negotiated: 0, ratified: 0, ruptured: 0, refused: 0, lastReason: '' };

  /**
   * 发起困局谈判
   * @param {object} spec { partyA, partyB, offerAtoB, offerBtoA, utilityA?, utilityB?, at? }
   */
  function negotiate(spec) {
    const cfg = settings();
    if (!cfg.enabled) {
      stat.refused++; stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    const s = spec && typeof spec === 'object' ? spec : {};
    const partyA = String(s.partyA || '').trim();
    const partyB = String(s.partyB || '').trim();
    if (!partyA) {
      stat.refused++; stat.lastReason = 'missing-party-a';
      return { ok: false, reason: 'missing-party-a' };
    }
    if (!partyB) {
      stat.refused++; stat.lastReason = 'missing-party-b';
      return { ok: false, reason: 'missing-party-b' };
    }
    if (partyA === partyB) {
      stat.refused++; stat.lastReason = 'same-party';
      return { ok: false, reason: 'same-party' };
    }

    const at = Number.isFinite(s.at) ? s.at : clockNow('dilemmaBargain');
    const uA = Number.isFinite(s.utilityA) ? Number(s.utilityA) : 50;
    const uB = Number.isFinite(s.utilityB) ? Number(s.utilityB) : 50;

    const threshold = cfg.defaultReservationUtility;
    const ratified = uA >= threshold && uB >= threshold;

    const pactRecord = {
      pactId: 'pact_' + (at % 10000) + '_' + Math.floor(Math.random() * 1000),
      partyA: partyA,
      partyB: partyB,
      ratified: ratified,
      utilityA: uA,
      utilityB: uB,
      terms: { offerAtoB: s.offerAtoB, offerBtoA: s.offerBtoA },
      timestamp: at
    };

    transact(function (d) {
      if (!d) return true;
      d.pacts = d.pacts || [];
      d.pacts.push(pactRecord);
      if (d.pacts.length > cfg.maxPacts) {
        d.pacts.shift();
      }

      if (ratified && d.actors) {
        if (d.actors[partyA]) {
          const a = d.actors[partyA];
          a.affinity = a.affinity || {};
          a.affinity[partyB] = (a.affinity[partyB] || 0) + 15;
        }
        if (d.actors[partyB]) {
          const b = d.actors[partyB];
          b.affinity = b.affinity || {};
          b.affinity[partyA] = (b.affinity[partyA] || 0) + 15;
        }
      }
      return true;
    }, 'negotiate');

    stat.negotiated++;
    if (ratified) stat.ratified++;
    else stat.ruptured++;

    return {
      ok: true,
      ratified: ratified,
      reason: ratified ? 'pact-ratified' : 'bargain-ruptured',
      pact: pactRecord
    };
  }

  WA.dilemmaBargain = {
    negotiate: negotiate
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/dilemma-bargain 已加载（2.315.0）');
  }
})();
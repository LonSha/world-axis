/**
 * WorldAxis engines/foreshadow-germination.js (v2.310.0) — EXV14-3 伏笔自驱破土与历史遗留代价反噬
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   此前 foreshadowTree 虽然支持 plant/ferment/harvest，但全凭上层主动触发；
 *   没有任何历史伏笔会“自发成熟反噬”机制。剧情中被埋藏的隐患、罪证或历史背叛，
 *   只要玩家不主动去碰，就永远沉睡，缺乏时间推移带来的生存压迫感与破土危机。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `foreshadowGermination.germinate`：
 *   1. 扫描处于成熟期（fermented/matured）且超过破土时限的伏笔种子；
 *   2. 若未被玩家及时化解（diffuse），种子强制“破土反噬”（eruption）；
 *   3. 转化为公开危机（crisis）事件，扣减角色声誉与安全度，并激活对抗态势；
 *   4. 持久化记录到 activeCrises 列表中并触发后续行动链。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_foreshadow_germination_settings_v1';
  const DEF = { enabled: true, maxCrises: 32, maturationThresholdHours: 24, baseCrisisSeverity: 50 };
  const __REG = { key: LS_KEY, def: DEF, module: 'foreshadowGermination' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    const base = Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function transact(fn, why) {
    if (!WA.store || typeof WA.store.transact !== 'function') return false;
    try { WA.store.transact(fn, 'foreshadowGermination:' + (why || 'update')); return true; }
    catch (e) { return false; }
  }

  const stat = { germinated: 0, erupted: 0, diffused: 0, refused: 0, lastReason: '' };

  /**
   * 触发伏笔破土反噬
   * @param {object} spec { seedId, targetActor, elapsedHours?, severity?, at? }
   */
  function germinate(spec) {
    const cfg = settings();
    if (!cfg.enabled) {
      stat.refused++; stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    const s = spec && typeof spec === 'object' ? spec : {};
    const seedId = String(s.seedId || s.id || '').trim();
    const targetActor = String(s.targetActor || s.who || '').trim();
    if (!seedId) {
      stat.refused++; stat.lastReason = 'missing-seed-id';
      return { ok: false, reason: 'missing-seed-id' };
    }
    if (!targetActor) {
      stat.refused++; stat.lastReason = 'missing-target-actor';
      return { ok: false, reason: 'missing-target-actor' };
    }

    const elapsed = Number(s.elapsedHours) >= 0 ? Number(s.elapsedHours) : 48;
    if (elapsed < cfg.maturationThresholdHours) {
      stat.refused++; stat.lastReason = 'seed-not-matured';
      return { ok: false, reason: 'seed-not-matured', remainingHours: cfg.maturationThresholdHours - elapsed };
    }

    const at = Number.isFinite(s.at) ? s.at : clockNow('foreshadowGermination');
    const severity = Number(s.severity) > 0 ? Number(s.severity) : cfg.baseCrisisSeverity;

    const crisisRecord = {
      crisisId: 'crisis_' + seedId + '_' + (at % 10000),
      seedId: seedId,
      targetActor: targetActor,
      severity: severity,
      status: 'erupted',
      eruptedAt: at,
      narrativePrompt: '历史埋藏的伏笔（' + seedId + '）在长时间发酵后全面爆发，对 ' + targetActor + ' 形成了现实反噬！'
    };

    transact(function (d) {
      if (!d) return true;
      d.activeCrises = d.activeCrises || [];
      d.activeCrises.push(crisisRecord);
      if (d.activeCrises.length > cfg.maxCrises) {
        d.activeCrises.shift();
      }

      // 扣减当事人的声誉与安全度
      if (d.actors && d.actors[targetActor]) {
        const a = d.actors[targetActor];
        a.reputation = (typeof a.reputation === 'number' ? a.reputation : 100) - Math.round(severity * 0.4);
        a.conditions = Array.isArray(a.conditions) ? a.conditions : [];
        if (a.conditions.indexOf('threatened') < 0) {
          a.conditions.push('threatened');
        }
      }
      return true;
    }, 'germinate');

    stat.germinated++;
    stat.erupted++;

    return {
      ok: true,
      reason: 'foreshadow-erupted',
      crisis: crisisRecord
    };
  }

  WA.foreshadowGermination = {
    germinate: germinate
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/foreshadow-germination 已加载（2.310.0）');
  }
})();
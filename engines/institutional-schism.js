/**
 * WorldAxis engines/institutional-schism.js (v2.317.0) — EXV14-7 制度变迁门槛与地方行会自治风潮
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   此前虽然有 law/legislation 模块，但世界规则集（rulebook）永远固定不变。
 *   即使民怨沸腾、工团思潮指数爆表，市政厅公决也从不改变底层的税收或商业限制，
 *   缺乏制度变迁门槛带来的历史转折点。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `institutionalSchism.enactReform`：
 *   1. 评估地方思潮/工团诉求强度（reformDemand >= threshold）；
 *   2. 达到门槛后执行改革法令（enactReform），永久重构市政规则（如改写 localTaxRate 与 tradeFreedom）；
 *   3. 触发全城法令公决公告并持久化至 institutionalReforms 历史册。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_institutional_schism_settings_v1';
  const DEF = { enabled: true, maxReforms: 16, defaultDemandThreshold: 60 };
  const __REG = { key: LS_KEY, def: DEF, module: 'institutionalSchism' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    const base = Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function transact(fn, why) {
    if (!WA.store || typeof WA.store.transact !== 'function') return false;
    try { WA.store.transact(fn, 'institutionalSchism:' + (why || 'update')); return true; }
    catch (e) { return false; }
  }

  const stat = { reforms: 0, refused: 0, lastReason: '' };

  /**
   * 推行体制变迁与地方改革公决
   * @param {object} spec { regionId, reformType, reformDemand?, newTaxRate?, at? }
   */
  function enactReform(spec) {
    const cfg = settings();
    if (!cfg.enabled) {
      stat.refused++; stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    const s = spec && typeof spec === 'object' ? spec : {};
    const regionId = String(s.regionId || '').trim();
    const reformType = String(s.reformType || '').trim();
    if (!regionId) {
      stat.refused++; stat.lastReason = 'missing-region-id';
      return { ok: false, reason: 'missing-region-id' };
    }
    if (!reformType) {
      stat.refused++; stat.lastReason = 'missing-reform-type';
      return { ok: false, reason: 'missing-reform-type' };
    }

    const demand = Number.isFinite(s.reformDemand) ? Number(s.reformDemand) : 75;
    if (demand < cfg.defaultDemandThreshold) {
      stat.refused++; stat.lastReason = 'demand-below-threshold';
      return { ok: false, reason: 'demand-below-threshold', demand: demand, threshold: cfg.defaultDemandThreshold };
    }

    const at = Number.isFinite(s.at) ? s.at : clockNow('institutionalSchism');
    const newTaxRate = Number.isFinite(s.newTaxRate) ? Number(s.newTaxRate) : 0.05;

    const reformRecord = {
      reformId: 'ref_' + (at % 10000),
      regionId: regionId,
      reformType: reformType,
      demand: demand,
      newTaxRate: newTaxRate,
      enactedAt: at
    };

    transact(function (d) {
      if (!d) return true;
      d.regionalInstitutions = d.regionalInstitutions || {};
      d.regionalInstitutions[regionId] = {
        regionId: regionId,
        charter: 'autonomous-guild',
        taxRate: newTaxRate,
        tradeFreedom: 'high',
        updatedAt: at
      };

      d.institutionalReforms = d.institutionalReforms || [];
      d.institutionalReforms.push(reformRecord);
      if (d.institutionalReforms.length > cfg.maxReforms) {
        d.institutionalReforms.shift();
      }
      return true;
    }, 'enactReform');

    stat.reforms++;
    return {
      ok: true,
      reason: 'reform-enacted',
      reform: reformRecord
    };
  }

  WA.institutionalSchism = {
    enactReform: enactReform
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/institutional-schism 已加载（2.317.0）');
  }
})();
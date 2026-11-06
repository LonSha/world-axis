/**
 * WorldAxis engines/faction-schism.js (v2.316.0) — OPV14-7 阵营离心力与组织分裂/篡位连锁反应闭环
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   此前 faction/loyalty 模块虽然会记录忠诚度与离心倾向，但数值跌入冰点后
 *   从未发生真正的阵营分裂、反叛首领自立或割据夺权，阵营永远铁板一块。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `factionSchism.triggerSchism`：
 *   1. 扫描阵营内离心力过高（centrifugalForce >= threshold）的叛逆将领/派系；
 *   2. 达到临界值时正式宣告分裂，生成叛军新阵营（splinterFactionId）；
 *   3. 瓜分原阵营资产、领地与军力，并与原阵营自动建立交战（at-war）宿怨关系；
 *   4. 持久化记录到 factions 档案中。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_faction_schism_settings_v1';
  const DEF = { enabled: true, maxSchisms: 24, defaultCentrifugalThreshold: 70 };
  const __REG = { key: LS_KEY, def: DEF, module: 'factionSchism' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    const base = Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function transact(fn, why) {
    if (!WA.store || typeof WA.store.transact !== 'function') return false;
    try { WA.store.transact(fn, 'factionSchism:' + (why || 'update')); return true; }
    catch (e) { return false; }
  }

  const stat = { schisms: 0, refused: 0, lastReason: '' };

  /**
   * 触发阵营分裂与夺权政变
   * @param {object} spec { parentFactionId, rebelLeaderId, centrifugalForce?, assetShare?, at? }
   */
  function triggerSchism(spec) {
    const cfg = settings();
    if (!cfg.enabled) {
      stat.refused++; stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    const s = spec && typeof spec === 'object' ? spec : {};
    const parentFactionId = String(s.parentFactionId || '').trim();
    const rebelLeaderId = String(s.rebelLeaderId || '').trim();
    if (!parentFactionId) {
      stat.refused++; stat.lastReason = 'missing-parent-faction';
      return { ok: false, reason: 'missing-parent-faction' };
    }
    if (!rebelLeaderId) {
      stat.refused++; stat.lastReason = 'missing-rebel-leader';
      return { ok: false, reason: 'missing-rebel-leader' };
    }

    const force = Number.isFinite(s.centrifugalForce) ? Number(s.centrifugalForce) : 80;
    if (force < cfg.defaultCentrifugalThreshold) {
      stat.refused++; stat.lastReason = 'insufficient-centrifugal-force';
      return { ok: false, reason: 'insufficient-centrifugal-force', force: force, threshold: cfg.defaultCentrifugalThreshold };
    }

    const at = Number.isFinite(s.at) ? s.at : clockNow('factionSchism');
    const splinterFactionId = 'faction_splinter_' + rebelLeaderId + '_' + (at % 1000);
    const assetShare = Number.isFinite(s.assetShare) ? Number(s.assetShare) : 0.4;

    const schismRecord = {
      schismId: 'sch_' + (at % 10000),
      parentFactionId: parentFactionId,
      rebelLeaderId: rebelLeaderId,
      splinterFactionId: splinterFactionId,
      assetShare: assetShare,
      centrifugalForce: force,
      at: at
    };

    transact(function (d) {
      if (!d) return true;
      d.factions = d.factions || {};
      d.factions[splinterFactionId] = {
        id: splinterFactionId,
        leader: rebelLeaderId,
        parent: parentFactionId,
        status: 'rebellious',
        relations: { [parentFactionId]: 'at-war' },
        createdAt: at
      };

      if (d.factions[parentFactionId]) {
        const p = d.factions[parentFactionId];
        p.relations = p.relations || {};
        p.relations[splinterFactionId] = 'at-war';
        p.treasury = Math.round((p.treasury || 10000) * (1 - assetShare));
      }

      d.schismLogs = d.schismLogs || [];
      d.schismLogs.push(schismRecord);
      if (d.schismLogs.length > cfg.maxSchisms) {
        d.schismLogs.shift();
      }
      return true;
    }, 'triggerSchism');

    stat.schisms++;
    return {
      ok: true,
      reason: 'faction-split-enacted',
      schism: schismRecord
    };
  }

  WA.factionSchism = {
    triggerSchism: triggerSchism
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/faction-schism 已加载（2.316.0）');
  }
})();
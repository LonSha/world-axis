/**
 * WorldAxis engines/cognitive-poisoning.js (v2.314.0) — EXV14-5 假情报投毒与多角色认知盲区博弈
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   现有的情报与信念系统中，所有流通的“情报”默认均被视为真事实。
 *   角色无法伪造伪令、投毒假情报以误导敌方 NPC。缺乏虚假信息的博弈机制，
 *   导致间谍战与多角色智斗沦为空谈。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `poisoning.plantForgedIntel`：
 *   1. 密探角色制造虚假情报（forgedIntel），设定真伪标记（forged: true）与伪装置信度（disguiseDC）；
 *   2. 投毒给目标角色，目标角色依据自身洞察力（insight）进行鉴别判定（discern）；
 *   3. 判定失败时，目标角色被假情报深度欺骗（deceived），产生误判动机并沉淀至其信念档案中；
 *   4. 判定成功时，假情报当场识破，触发反侦察与关系破裂。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_cognitive_poisoning_settings_v1';
  const DEF = { enabled: true, maxForgedRecords: 32, defaultDisguiseDC: 65 };
  const __REG = { key: LS_KEY, def: DEF, module: 'cognitivePoisoning' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    const base = Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function transact(fn, why) {
    if (!WA.store || typeof WA.store.transact !== 'function') return false;
    try { WA.store.transact(fn, 'cognitivePoisoning:' + (why || 'update')); return true; }
    catch (e) { return false; }
  }

  const stat = { planted: 0, deceived: 0, uncovered: 0, refused: 0, lastReason: '' };

  /**
   * 投放伪造假情报
   * @param {object} spec { planterId, targetActorId, fakeClaim, disguiseDC?, targetInsight?, at? }
   */
  function plantForgedIntel(spec) {
    const cfg = settings();
    if (!cfg.enabled) {
      stat.refused++; stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    const s = spec && typeof spec === 'object' ? spec : {};
    const planterId = String(s.planterId || '').trim();
    const targetActorId = String(s.targetActorId || '').trim();
    const fakeClaim = String(s.fakeClaim || '').trim();

    if (!planterId) {
      stat.refused++; stat.lastReason = 'missing-planter';
      return { ok: false, reason: 'missing-planter' };
    }
    if (!targetActorId) {
      stat.refused++; stat.lastReason = 'missing-target-actor';
      return { ok: false, reason: 'missing-target-actor' };
    }
    if (planterId === targetActorId) {
      stat.refused++; stat.lastReason = 'same-planter-target';
      return { ok: false, reason: 'same-planter-target' };
    }
    if (!fakeClaim) {
      stat.refused++; stat.lastReason = 'empty-fake-claim';
      return { ok: false, reason: 'empty-fake-claim' };
    }

    const at = Number.isFinite(s.at) ? s.at : clockNow('cognitivePoisoning');
    const disguiseDC = Number.isFinite(s.disguiseDC) ? Number(s.disguiseDC) : cfg.defaultDisguiseDC;
    const targetInsight = Number.isFinite(s.targetInsight) ? Number(s.targetInsight) : 40;

    // 鉴别判定：若目标洞察力 >= 伪装DC 则识破，否则中计受骗
    const deceived = targetInsight < disguiseDC;

    const intelRecord = {
      intelId: 'forge_' + (at % 10000) + '_' + Math.floor(Math.random() * 1000),
      planterId: planterId,
      targetActorId: targetActorId,
      fakeClaim: fakeClaim,
      forged: true,
      deceived: deceived,
      disguiseDC: disguiseDC,
      targetInsight: targetInsight,
      plantedAt: at
    };

    transact(function (d) {
      if (!d) return true;
      d.forgedIntelLogs = d.forgedIntelLogs || [];
      d.forgedIntelLogs.push(intelRecord);
      if (d.forgedIntelLogs.length > cfg.maxForgedRecords) {
        d.forgedIntelLogs.shift();
      }

      d.actors = d.actors || {};
      d.actors[targetActorId] = d.actors[targetActorId] || { id: targetActorId, beliefs: [] };
      const target = d.actors[targetActorId];
      target.beliefs = Array.isArray(target.beliefs) ? target.beliefs : [];

      if (deceived) {
        // 中计：将假情报作为真实事实接纳入认知
        target.beliefs.push({
          claim: fakeClaim,
          poisoned: true,
          acceptedAt: at
        });
      } else {
        // 识破：记录警觉并在目标心中生成警惕记录
        target.suspicions = Array.isArray(target.suspicions) ? target.suspicions : [];
        target.suspicions.push({
          suspectId: planterId,
          reason: 'forgery-detected',
          at: at
        });
      }
      return true;
    }, 'plantForgedIntel');

    stat.planted++;
    if (deceived) stat.deceived++;
    else stat.uncovered++;

    return {
      ok: true,
      reason: deceived ? 'intel-poisoned-deceived' : 'intel-forgery-uncovered',
      deceived: deceived,
      intel: intelRecord
    };
  }

  WA.cognitivePoisoning = {
    plantForgedIntel: plantForgedIntel
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/cognitive-poisoning 已加载（2.314.0）');
  }
})();
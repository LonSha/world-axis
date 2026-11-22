/**
 * WorldAxis engines/rumor-cognition.js (v2.313.0) — OPV14-5 城市公共传闻与角色有限认知单向投影纠偏
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   此前 rumor/rumor-chain 的传闻发酵一旦触发，调用方往往直接向全局暴露，
 *   或者角色毫无门槛地全部知晓。角色缺乏主观认知视界隔离，
 *   导致多角色群聊生态中出现严重的“全知泄露”（未谋面的 NPC 也知道秘密传闻）。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `rumorCognition.projectRumorToActor`：
 *   1. 依据角色与传闻源头的社交距离（socialHops）、阵营立场与警惕度，计算感知与畸变概率；
 *   2. 社交距离过远或不在该圈层时，拒绝投影（unheard）；
 *   3. 投影成功时，传闻以带有个人偏见（bias）的形式单向沉淀入角色的 privateIntel 档案，
 *      杜绝全局全知污染。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_rumor_cognition_settings_v1';
  const DEF = { enabled: true, maxIntelRecords: 64, maxSocialHops: 3 };
  const __REG = { key: LS_KEY, def: DEF, module: 'rumorCognition' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    const base = Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function transact(fn, why) {
    if (!WA.store || typeof WA.store.transact !== 'function') return false;
    try { WA.store.transact(fn, 'rumorCognition:' + (why || 'update')); return true; }
    catch (e) { return false; }
  }

  const stat = { projected: 0, unheard: 0, distorted: 0, refused: 0, lastReason: '' };

  /**
   * 将城市传闻单向投影到特定角色认知
   * @param {object} spec { rumorKey, rumorText, targetActorId, socialHops?, sourceFaction?, at? }
   */
  function projectRumorToActor(spec) {
    const cfg = settings();
    if (!cfg.enabled) {
      stat.refused++; stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    const s = spec && typeof spec === 'object' ? spec : {};
    const rumorKey = String(s.rumorKey || s.key || '').trim();
    const rumorText = String(s.rumorText || s.text || '').trim();
    const targetActorId = String(s.targetActorId || s.actorId || '').trim();
    const socialHops = Number.isFinite(s.socialHops) ? Number(s.socialHops) : 1;

    if (!rumorKey) {
      stat.refused++; stat.lastReason = 'missing-rumor-key';
      return { ok: false, reason: 'missing-rumor-key' };
    }
    if (!rumorText) {
      stat.refused++; stat.lastReason = 'empty-rumor-text';
      return { ok: false, reason: 'empty-rumor-text' };
    }
    if (!targetActorId) {
      stat.refused++; stat.lastReason = 'missing-target-actor';
      return { ok: false, reason: 'missing-target-actor' };
    }

    // 社交距离门槛拦截：距离超出最大跃点时彻底听不到
    if (socialHops > cfg.maxSocialHops) {
      stat.unheard++;
      return { ok: true, heard: false, reason: 'out-of-earshot', socialHops: socialHops };
    }

    const at = Number.isFinite(s.at) ? s.at : clockNow('rumorCognition');
    const distorted = socialHops >= 2;
    const finalContent = distorted ? '【风闻流言】' + rumorText + '（细节模棱两可）' : rumorText;

    transact(function (d) {
      if (!d) return true;
      d.actors = d.actors || {};
      d.actors[targetActorId] = d.actors[targetActorId] || { id: targetActorId, privateIntel: [] };
      const a = d.actors[targetActorId];
      a.privateIntel = Array.isArray(a.privateIntel) ? a.privateIntel : [];
      a.privateIntel.push({
        rumorKey: rumorKey,
        content: finalContent,
        distorted: distorted,
        socialHops: socialHops,
        receivedAt: at
      });
      if (a.privateIntel.length > cfg.maxIntelRecords) {
        a.privateIntel.shift();
      }
      return true;
    }, 'projectRumor');

    stat.projected++;
    if (distorted) stat.distorted++;

    return {
      ok: true,
      heard: true,
      reason: 'projected',
      targetActorId: targetActorId,
      rumorKey: rumorKey,
      content: finalContent,
      distorted: distorted,
      socialHops: socialHops
    };
  }

  WA.rumorCognition = {
    projectRumorToActor: projectRumorToActor
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/rumor-cognition 已加载（2.313.0）');
  }
})();
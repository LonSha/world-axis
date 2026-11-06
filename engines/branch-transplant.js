/**
 * WorldAxis engines/branch-transplant.js (v2.319.0) — OPV14-9 历史分支语义对比与局部记忆移植
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   此前 branchDiff 仅能产出只读差异计划（readOnly:true），两行分支差了什么虽然
 *   能比出语义，但没有任何写口能把另一条平行线的因果/事实作为「既视感（déjà vu）」
 *   或「残余记忆碎片」植入到当前世界线的指定角色大脑中。
 *
 * ── 机制──────────────────────────────────────────────────────────────
 *   `branchTransplant.transplantFact`：
 *   1. 接收 targetActor、sourceBranch、factPayload；
 *   2. 进行真伪与阻尼判定（平行分支距离越远，转化率越低）；
 *   3. 将事实降解为带标记的残存记忆（déjàVu），写入 actor 记忆池；
 *   4. 触发轻微的认知解离（dissonance + 5）；
 *   5. 持久化回写到 store。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_branch_transplant_settings_v1';
  const DEF = { enabled: true, maxImplantedMemories: 20, maxDissonance: 100 };
  const __REG = { key: LS_KEY, def: DEF, module: 'branchTransplant' };
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    const base = Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function transact(fn, why) {
    if (!WA.store || typeof WA.store.transact !== 'function') return false;
    try { WA.store.transact(fn, 'branchTransplant:' + (why || 'update')); return true; }
    catch (e) { return false; }
  }
  const stat = { transplanted: 0, refused: 0, lastReason: '' };

  /**
   * 移植平行世界线事实到角色记忆
   * @param {object} spec { actorId, sourceBranch, factText, divergenceDepth?, at? }
   */
  function transplantFact(spec) {
    const cfg = settings();
    if (!cfg.enabled) {
      stat.refused++; stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    const s = spec && typeof spec === 'object' ? spec : {};
    const actorId = String(s.actorId || s.who || '').trim();
    const sourceBranch = String(s.sourceBranch || s.fromBranch || '').trim();
    const factText = String(s.factText || s.fact || '').trim();

    if (!actorId) {
      stat.refused++; stat.lastReason = 'missing-actor';
      return { ok: false, reason: 'missing-actor' };
    }
    if (!sourceBranch) {
      stat.refused++; stat.lastReason = 'missing-source-branch';
      return { ok: false, reason: 'missing-source-branch' };
    }
    if (!factText) {
      stat.refused++; stat.lastReason = 'missing-fact';
      return { ok: false, reason: 'missing-fact' };
    }

    const depth = Number.isFinite(s.divergenceDepth) ? Math.max(1, Number(s.divergenceDepth)) : 1;
    const clarity = Math.max(10, Math.min(100, Math.floor(100 / depth)));
    const at = Number.isFinite(s.at) ? s.at : clockNow('branchTransplant');

    const memoryEntry = {
      id: 'dejavu_' + at + '_' + Math.random().toString(36).slice(2, 6),
      sourceBranch: sourceBranch,
      factText: factText,
      clarity: clarity,
      kind: 'deja_vu',
      implantedAt: at
    };

    let newDissonance = 0;
    transact(function (d) {
      if (!d) return true;
      d.actors = d.actors || {};
      d.actors[actorId] = d.actors[actorId] || { id: actorId };
      const a = d.actors[actorId];
      a.implantedMemories = Array.isArray(a.implantedMemories) ? a.implantedMemories : [];
      a.implantedMemories.push(memoryEntry);
      if (a.implantedMemories.length > cfg.maxImplantedMemories) {
        a.implantedMemories.shift();
      }
      a.cognitiveDissonance = Math.min(cfg.maxDissonance, (Number(a.cognitiveDissonance) || 0) + 5);
      newDissonance = a.cognitiveDissonance;
      return true;
    }, 'transplantFact');

    stat.transplanted++;
    return {
      ok: true,
      reason: 'memory-transplanted',
      actorId: actorId,
      memory: memoryEntry,
      cognitiveDissonance: newDissonance
    };
  }

  WA.branchTransplant = {
    transplantFact: transplantFact
  };
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/branch-transplant 已加载（2.319.0）');
  }
})();

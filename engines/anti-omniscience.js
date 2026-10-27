/**
 * WorldAxis engines/anti-omniscience.js (v2.248.0) — 全域认知隔离与防全知阻断引擎
 *
 * 核心职责：
 *   彻底根除 NPC“未卜先知”、“隔空听音”、“场外偷窥”等全知穿帮顽疾。
 *   让角色严格受限于自身肉身所处时空、感官界限与信息传播物理规律。
 *
 * ── 核心防御四大铁律屏障（Quad-Barrier Model）─────────────────────
 *   ① 物理时空视界屏障 (Spatial Horizon Barrier)：
 *      角色只能感知同物理地点或在感官半径 (Perception Horizon) 内发生的事件。
 *      未在场、无通讯手段、隔空发生的事件判定为 UNREACHABLE_HORIZON，绝对不可知。
 *
 *   ② 隐秘与私密屏障 (Confidentiality & Concealment Barrier)：
 *      标记为 secret、inner_monologue、conspiracy、private 的状态与心声，
 *      仅归属者及明确知情人持有；其他 NPC 纵使同处一室亦判定为 CONCEALED_SECRET。
 *
 *   ③ 物理遮蔽与未搜查屏障 (Occlusion & Search Barrier)：
 *      存放于暗格、锁箱、背包或隔壁房间的物体/线索，未执行 explicit search 动作前，
 *      处于感官盲区 (OCCLUDED_OBJECT)，严禁借由模型全知本能直接道破。
 *
 *   ④ 信息传播物理时滞屏障 (Propagation Latency Barrier)：
 *      异地事件传播必须依附载体（书信、口信、广播、电报），并遵守传播距离与速度限制；
 *      在未完成传播耗时前，任何远方角色提及该事件皆定性为 ILLEGAL_LEAK。
 *
 * ── 双向工程化落地管线 ──────────────────────────────────────────
 *   · 上游注入过滤 (filterInjectKnowledge)：在渲染注入 Prompt 前，根据目标角色的认识论
 *     凭证裁决知识可见性，不可知的事实根本不送入上下文，从源头掐灭全知诱因；
 *   · 下游生成后审计 (auditGeneratedContent)：扫描正文/独白中是否越权陈述了未获知的高敏真相；
 *   · 认知凭证审计 (validateReceipt)：为每一条角色陈述核查合法认知凭据 (witnessed/informed/deduced/investigated)。
 */
(function () {
  'use strict';
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_anti_omniscience_settings_v1';
  const DEF = {
    enabled: true,
    enforceSpatialHorizon: true,       // 强制物理时空视界隔离
    enforceConcealment: true,          // 强制私密/暗线信息屏障
    enforceOcclusion: true,            // 强制遮蔽物搜查要求
    enforcePropagationLag: true,       // 强制信息异地传播时滞
    filterPromptInjections: true,      // 生成前对注入 Prompt 执行知识过滤脱敏
    auditOutputLeaks: true,            // 生成后扫描正文全知穿帮
    maxAuditHistory: 50
  };

  const __REG = {
    key: LS_KEY, def: DEF, module: 'antiOmniscience',
    bounds: { maxAuditHistory: [10, 200] }
  };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  let _localSettings = null;

  function settings() {
    if (_localSettings) return Object.assign({}, DEF, _localSettings);
    if (WA.settingsBus && WA.settingsBus.read) {
      const raw = WA.settingsBus.read(__REG);
      return WA.settingsBus.normalize
        ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
        : Object.assign({}, DEF, raw || {});
    }
    return Object.assign({}, DEF);
  }

  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    _localSettings = merged;
    if (WA.settingsBus && WA.settingsBus.saveOrThrow) {
      const normalized = WA.settingsBus.normalize
        ? WA.settingsBus.normalize(__REG, merged)
        : merged;
      return WA.settingsBus.saveOrThrow(__REG, normalized);
    }
    return merged;
  }

  const __stat = {
    totalAudits: 0,
    blockedSpatial: 0,
    blockedConcealed: 0,
    blockedOccluded: 0,
    blockedLag: 0,
    injectionsSanitized: 0,
    outputLeaksCaught: 0,
    recentAudits: []
  };

  function recordAuditLog(type, actor, factId, reason) {
    const cfg = settings();
    const entry = {
      type: String(type || 'audit'),
      actor: (actor && actor.name) || String(actor || 'unknown'),
      factId: String(factId || ''),
      reason: String(reason || ''),
      timestamp: clockNow('antiOmniscience')
    };
    __stat.recentAudits.push(entry);
    if (__stat.recentAudits.length > cfg.maxAuditHistory) {
      __stat.recentAudits.shift();
    }
  }

  /**
   * 认知判定核心：判定角色 actor 是否合法拥有某项事实/事件/状态 fact 的知情权
   * @param {Object} actor 角色对象 { name, place, floor, receipts: [] }
   * @param {Object} fact 事实/事件对象 { id, title, place, floor, visibility, secret, holders, requiresSearch, discovered, originRound, propagationRounds }
   * @param {Object} [currentEnv] 当前全局环境 { round: 10 }
   * @returns {{ canKnow: boolean, code: string, reason: string }}
   */
  function canCharacterKnow(actor, fact, currentEnv) {
    const cfg = settings();
    if (!cfg.enabled) {
      return { canKnow: true, code: 'DISABLED', reason: '防全知引擎已关闭' };
    }
    if (!actor || !fact) {
      return { canKnow: false, code: 'INVALID_INPUT', reason: '缺少角色或事实输入' };
    }

    const aName = actor.name || 'NPC';
    const aPlace = actor.place || '';
    const env = currentEnv || {};
    const curRound = Number(env.round) || 0;

    // 0. 特权与直接知情人：若角色本身就是事实记录的唯一发生者或持有者
    if (Array.isArray(fact.holders) && fact.holders.includes(aName)) {
      return { canKnow: true, code: 'DIRECT_HOLDER', reason: '角色为该信息的合法持有者或亲历者' };
    }

    // 1. 屏障一：私密与隐秘事件隔离
    if (cfg.enforceConcealment && (fact.secret || fact.visibility === 'private' || fact.visibility === 'inner_monologue')) {
      const isHolder = Array.isArray(fact.holders) && fact.holders.includes(aName);
      if (!isHolder) {
        __stat.blockedConcealed++;
        recordAuditLog('concealment', aName, fact.id, '私密心声或阴谋未对该角色公开');
        return {
          canKnow: false,
          code: 'CONCEALED_SECRET',
          reason: `事实属于私密信息或内部心声，角色「${aName}」不在知情名单内`
        };
      }
    }

    // 2. 屏障二：物理时空视界隔离
    if (cfg.enforceSpatialHorizon && fact.place) {
      const samePlace = (aPlace && fact.place && aPlace === fact.place);
      const sameFloor = (!fact.floor || !actor.floor || fact.floor === actor.floor);
      
      // 若地点完全不一致，且未通过通讯/目击传递合法凭据
      if (!samePlace || !sameFloor) {
        const hasTransferReceipt = Array.isArray(actor.receipts) && actor.receipts.some(r => r && r.factId === fact.id && (r.type === 'informed' || r.type === 'letter' || r.type === 'broadcast'));
        const hasPropagation = (fact.originRound != null && fact.propagationRounds != null);
        if (!hasTransferReceipt && !hasPropagation) {
          __stat.blockedSpatial++;
          recordAuditLog('spatial', aName, fact.id, `物理空间隔离：人在 ${aPlace}，事件发生在 ${fact.place}`);
          return {
            canKnow: false,
            code: 'UNREACHABLE_HORIZON',
            reason: `事件发生在「${fact.place}」，角色此刻身在「${aPlace}」，无远距通讯或传信凭证`
          };
        }
      }
    }

    // 3. 屏障三：物理遮蔽与搜查限制
    if (cfg.enforceOcclusion && fact.requiresSearch && !fact.discovered) {
      const hasSearchReceipt = Array.isArray(actor.receipts) && actor.receipts.some(r => r && r.factId === fact.id && r.type === 'investigated');
      if (!hasSearchReceipt) {
        __stat.blockedOccluded++;
        recordAuditLog('occlusion', aName, fact.id, '物体藏于暗格或深处，未经显式搜查不可感知');
        return {
          canKnow: false,
          code: 'OCCLUDED_OBJECT',
          reason: `目标藏匿于遮蔽处或暗格中，角色尚未进行针对性搜查，处于感官盲区`
        };
      }
    }

    // 4. 屏障四：异地传播物理时滞
    if (cfg.enforcePropagationLag && fact.originRound != null && fact.propagationRounds != null) {
      const roundsPassed = curRound - Number(fact.originRound);
      const requiredLag = Number(fact.propagationRounds) || 0;
      if (roundsPassed < requiredLag) {
        // 未完成传播所需时滞
        const isEyeWitness = (aPlace === fact.place);
        if (!isEyeWitness) {
          __stat.blockedLag++;
          recordAuditLog('propagation_lag', aName, fact.id, `信息尚在传播途中（已历 ${roundsPassed}/${requiredLag} 轮）`);
          return {
            canKnow: false,
            code: 'TRANSIT_DELAY',
            reason: `异地消息尚在传递途中（需 ${requiredLag} 轮传播，当前仅过 ${roundsPassed} 轮），角色绝不可能提前获知`
          };
        }
      }
    }

    return { canKnow: true, code: 'AUTHORIZED', reason: '角色具备合法感知或获知通道' };
  }

  /**
   * 上游过滤：在组装 Context/Prompt 前，对知识块列表执行认识论过滤脱敏
   * @param {Object} actor 视角角色
   * @param {Array<Object>} factsList 准备注入的所有事实/知识/状态
   * @param {Object} [currentEnv] 当前环境
   * @returns {Array<Object>} 仅包含该角色合法可知的事实列表
   */
  function filterInjectKnowledge(actor, factsList, currentEnv) {
    const cfg = settings();
    if (!cfg.enabled || !cfg.filterPromptInjections || !Array.isArray(factsList)) {
      return factsList || [];
    }

    const filtered = factsList.filter(function (fact) {
      const decision = canCharacterKnow(actor, fact, currentEnv);
      return decision.canKnow;
    });

    if (filtered.length < factsList.length) {
      __stat.injectionsSanitized += (factsList.length - filtered.length);
    }
    return filtered;
  }

  /**
   * 下游审查：对生成出的文本执行全知泄露与越权穿帮扫描
   * @param {Object} actor 说话角色
   * @param {string} text 生成的正文或台词
   * @param {Array<Object>} secretFacts 不应被知晓的机密事实列表
   */
  function auditGeneratedContent(actor, text, secretFacts) {
    const cfg = settings();
    if (!cfg.enabled || !cfg.auditOutputLeaks || typeof text !== 'string' || !Array.isArray(secretFacts)) {
      return { ok: true, violations: [] };
    }

    __stat.totalAudits++;
    const violations = [];

    secretFacts.forEach(function (fact) {
      if (!fact || !fact.keywords || !Array.isArray(fact.keywords)) return;
      // 检查角色知情权
      const perm = canCharacterKnow(actor, fact);
      if (perm.canKnow) return; // 合法知情则跳过

      // 角色不可知，但生成文本中命中了该秘密的核心敏感关键词组合
      const hits = fact.keywords.filter(kw => text.includes(kw));
      if (hits.length > 0) {
        violations.push({
          factId: fact.id,
          factTitle: fact.title,
          leakedKeywords: hits,
          barrierCode: perm.code,
          reason: perm.reason
        });
        __stat.outputLeaksCaught++;
        recordAuditLog('output_leak', actor, fact.id, `正文台词包含未获知关键词: ${hits.join(', ')}`);
      }
    });

    return {
      ok: violations.length === 0,
      violations: violations,
      guidance: violations.length > 0 ? `[全知违规拦截]：角色「${actor.name || 'NPC'}」在未获知事实「${violations[0].factTitle}」的情况下在正文越权道破秘密，必须修正为基于自身视角的合理未知反应。` : null
    };
  }

  /**
   * 提示词屏障段落：向模型强制声明防全知纪律
   */
  function buildBlock(actor) {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const aName = (actor && actor.name) || '当前角色';
    const aPlace = (actor && actor.place) || '当前所在地点';
    return [
      `[防全知铁律·认知视界约束]`,
      `1. 角色「${aName}」肉身位于「${aPlace}」，绝对不具备千里眼与顺风耳。`,
      `2. 凡不在该场景、未当面目击、未收到信件/电话通知的事实，该角色必须处于「完全不知情」状态。`,
      `3. 严禁基于上帝视角、玩家内心独白或场外剧情即兴推理出超自然结论；未亲身搜查之密道/暗格绝不可无端发现。`,
      `4. 面对未知事物，角色必须流露困惑、猜测、迟疑或警惕，绝不给出先知式断言。`
    ].join('\n') + '\n';
  }

  function stat() {
    return Object.assign({}, __stat, {
      recentAudits: __stat.recentAudits.slice()
    });
  }

  WA.antiOmniscience = {
    canCharacterKnow: canCharacterKnow,
    filterInjectKnowledge: filterInjectKnowledge,
    auditGeneratedContent: auditGeneratedContent,
    buildBlock: buildBlock,
    getSettings: settings,
    setSettings: saveSettings,
    stat: stat
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/anti-omniscience 已加载（2.248.0）');
  }
})();
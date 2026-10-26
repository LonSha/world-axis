/**
 * WorldAxis engines/persona-anchor.js (v2.249.0) — PA-1 人物性格锚定与防漂移引擎
 *
 * 核心痛点与机制目标：
 * 低智力 / 弱泛化模型在多轮对话中常出现严重的人物性格前后不一致与崩人设（OOC）。
 * 这种漂移常被模型拙劣地掩盖为“多面性”，本质是因记忆遗忘、迎合讨好（媚粉谄媚）、
 * 或语言风格失锚导致的随机漫步。
 *
 * 本引擎确立「性格惰性与因果重力法则（Persona Inertia Law）」：
 * 1. 核心性格硬锁定（Core Anchor Hard-Lock）：每个角色登记核心特质、语言风格基准与禁忌行为。
 * 2. 重大事件门禁（Major Event Gating）：在缺乏经系统裁决的重大事件（生死危机、重大背叛、
 *    重大创伤、认知破壁等，intensity >= 80 且有事实验证）驱动下，性格演化阻尼为绝对刚性（drift resistance），
 *    严禁任何突发性质变、严禁突变式讨好。
 * 3. 语言指纹防护（Linguistic Fingerprint）：锁定角色的句式特征、语气助词禁忌、口吻距离感。
 * 4. 注入纪律铁律（Discipline Injection）：在上游上下文注入极高优先级的性格锁定约束，明文斩断弱模型的随机漂移。
 * 5. 下游审查审计（Downstream Drift Audit）：在生成后链路审查有无越权讨好或禁忌反应并记录台账。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_persona_anchor_settings_v1';
  const DEF = {
    enabled: true,
    maxAnchors: 20,
    strictDriftAudit: true,
    minMajorEventIntensity: 80,
    defaultResistance: 0.95
  };
  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'personaAnchor',
    bounds: { maxAnchors: [2, 50], minMajorEventIntensity: [50, 100] }
  };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = {
    anchorsRegistered: 0,
    driftsBlocked: 0,
    driftsAllowed: 0,
    auditsPerformed: 0,
    auditsFlagged: 0,
    lastReason: '',
    faults: {}
  };
  function noteFault(reason) {
    stat.faults[reason] = (stat.faults[reason] || 0) + 1;
  }
  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 100) : String(v || '').trim().slice(0, max || 100);
  }
  function state() {
    return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
  }

  /**
   * 登记 / 更新角色的核心性格锚点
   * @param {string} person 角色姓名
   * @param {Object} spec 锚点配置
   *   - coreTraits: Array<string> 核心特质（不可轻易动摇）
   *   - toneStyle: string 语言风格基准（短句/冷淡/书面/温和等）
   *   - forbiddenBehaviors: Array<string> 禁忌行为/反应（绝不可在无重大诱因下触发）
   *   - resistance: number 演化阻尼系数 [0..1]
   */
  function registerAnchor(person, spec) {
    const who = clean(person, 40);
    if (!who) {
      noteFault('missing-person');
      return { ok: false, reason: 'missing-person' };
    }
    const s = spec || {};
    const traits = Array.isArray(s.coreTraits) ? s.coreTraits.map(t => clean(t, 40)).filter(Boolean) : [];
    if (!traits.length) {
      noteFault('missing-core-traits');
      return { ok: false, reason: 'missing-core-traits' };
    }
    const tone = clean(s.toneStyle || '保持固有言语习惯', 120);
    const forbidden = Array.isArray(s.forbiddenBehaviors) ? s.forbiddenBehaviors.map(b => clean(b, 60)).filter(Boolean) : [];
    const resistance = typeof s.resistance === 'number' ? Math.max(0.1, Math.min(1.0, s.resistance)) : settings().defaultResistance;

    let out = null;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        draft.personaAnchor = draft.personaAnchor && typeof draft.personaAnchor === 'object' && !Array.isArray(draft.personaAnchor)
          ? draft.personaAnchor : { anchors: {} };
        draft.personaAnchor.anchors = draft.personaAnchor.anchors || {};
        
        const existed = !!draft.personaAnchor.anchors[who];
        draft.personaAnchor.anchors[who] = {
          person: who,
          coreTraits: traits,
          toneStyle: tone,
          forbiddenBehaviors: forbidden,
          resistance: resistance,
          updatedAt: clockNow('personaAnchor:register')
        };
        out = { ok: true, person: who, existed: existed };
      }, 'personaAnchor:register');
    } else {
      out = { ok: true, person: who, existed: false };
    }

    if (out && out.ok) {
      stat.anchorsRegistered++;
      stat.lastReason = out.existed ? 'updated' : 'registered';
    } else {
      noteFault('store-unavailable');
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 获取某人的性格锚点配置
   */
  function getAnchor(person) {
    const who = clean(person, 40);
    if (!who) return null;
    const s = state().personaAnchor;
    const map = (s && s.anchors) || {};
    return map[who] || null;
  }

  /**
   * 判定角色的行为或转变是否合法（防无依据性格突变）
   * @param {string} person 角色姓名
   * @param {Object} proposal 拟发生的转变 / 行为
   *   - deltaTrait: string 试图展现的偏离特质或极端行为
   *   - isFlattery: boolean 是否是无原则谄媚讨好
   * @param {Object} context 现场环境上下文
   *   - majorEvent: Object { title: string, intensity: number, evidence: string } 重大事件标记
   *   - sharedBonds: number 共享羁绊/信任度量值
   */
  function evaluateDrift(person, proposal, context) {
    const cfg = settings();
    if (!cfg.enabled) {
      return { ok: true, allowed: true, reason: 'disabled' };
    }
    const who = clean(person, 40);
    const anchor = getAnchor(who);
    if (!anchor) {
      return { ok: true, allowed: true, reason: 'no-anchor-registered' };
    }

    const p = proposal || {};
    const ctx = context || {};
    const ev = ctx.majorEvent;

    // 检查是否有系统裁决的重大事件驱动
    const hasMajorEvent = ev && typeof ev === 'object' && (ev.intensity >= cfg.minMajorEventIntensity) && ev.evidence;

    // 1. 若存在禁忌行为命中且无重大事件驱动：坚决否决
    if (p.deltaTrait && anchor.forbiddenBehaviors && anchor.forbiddenBehaviors.length) {
      const hitForbidden = anchor.forbiddenBehaviors.some(function (fb) {
        return p.deltaTrait.indexOf(fb) >= 0 || (p.action && String(p.action).indexOf(fb) >= 0);
      });
      if (hitForbidden && !hasMajorEvent) {
        stat.driftsBlocked++;
        stat.lastReason = 'forbidden-behavior-without-major-event';
        return {
          ok: true,
          allowed: false,
          person: who,
          reason: 'forbidden-behavior-without-major-event',
          detail: '角色「' + who + '」触碰性格锚定禁忌，且本轮无重大事件驱动，判定为低智力模型性格漂移'
        };
      }
    }

    // 2. 谄媚与无原则迎合拦截（在反谄媚协议基础上双重防御）
    if (p.isFlattery && !hasMajorEvent) {
      const bonds = ctx.sharedBonds || 0;
      if (bonds < 60) {
        stat.driftsBlocked++;
        stat.lastReason = 'unjustified-flattery-blocked';
        return {
          ok: true,
          allowed: false,
          person: who,
          reason: 'unjustified-flattery-blocked',
          detail: '角色「' + who + '」在缺乏深层羁绊且无重大转折下突变式讨好，判定为人设崩塌（OOC）'
        };
      }
    }

    // 3. 演化阻尼计算：未达到重大事件阈值时，核心性格偏离度受到高阻尼压制
    if (!hasMajorEvent && p.deltaTrait) {
      stat.driftsBlocked++;
      stat.lastReason = 'inertia-suppressed';
      return {
        ok: true,
        allowed: false,
        person: who,
        reason: 'inertia-suppressed',
        detail: '性格惰性定律生效：未发生重大转折，角色核心性格必须保持连续性'
      };
    }

    stat.driftsAllowed++;
    return {
      ok: true,
      allowed: true,
      person: who,
      reason: hasMajorEvent ? 'major-event-justified' : 'within-anchor-boundary'
    };
  }

  /**
   * 下游生成正文审查：审计是否存在明显的性格崩塌与违规反应
   */
  function auditGeneratedContent(person, text, context) {
    stat.auditsPerformed++;
    const cfg = settings();
    if (!cfg.enabled || !cfg.strictDriftAudit) {
      return { ok: true, compliant: true, reason: 'audit-skipped' };
    }
    const who = clean(person, 40);
    const anchor = getAnchor(who);
    if (!anchor) {
      return { ok: true, compliant: true, reason: 'no-anchor' };
    }

    const t = String(text || '');
    const ctx = context || {};
    const ev = ctx.majorEvent;
    const hasMajorEvent = ev && (ev.intensity >= cfg.minMajorEventIntensity);

    // 违规行为/用语匹配
    const flagged = [];
    if (!hasMajorEvent && anchor.forbiddenBehaviors && anchor.forbiddenBehaviors.length) {
      anchor.forbiddenBehaviors.forEach(function (fb) {
        if (t.indexOf(fb) >= 0) {
          flagged.push(fb);
        }
      });
    }

    if (flagged.length > 0) {
      stat.auditsFlagged++;
      stat.lastReason = 'persona-drift-detected';
      return {
        ok: true,
        compliant: false,
        person: who,
        flagged: flagged,
        reason: 'persona-drift-detected',
        warning: '检测到角色「' + who + '」发生无重大事件支撑的性格漂移：触发禁忌特征 [' + flagged.join(', ') + ']'
      };
    }

    return { ok: true, compliant: true, person: who, reason: 'compliant' };
  }

  /**
   * 构造注入提示词块：强力约束大模型的言行一致性
   */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const s = state().personaAnchor;
    const anchors = (s && s.anchors) || {};
    const keys = Object.keys(anchors).slice(-Math.max(1, cfg.maxAnchors));
    if (!keys.length) return '';

    const lines = [];
    lines.push('[人物性格绝对锚定律 (Anti-Persona-Drift)]');
    lines.push('【铁律】：严禁任何形式的性格漂移、崩人设（OOC）或突发性谄媚迎合。');
    lines.push('人有多面性，但多面性绝非无逻辑的性格跳变。在没有重大生死转折、世界危机或深刻信任建立（重大事件）驱动前，角色必须严格坚守以下基线：');

    keys.forEach(function (k) {
      const a = anchors[k];
      let row = '· 角色「' + a.person + '」：核心特质=[' + a.coreTraits.join('、') + ']；语言基调=' + a.toneStyle;
      if (a.forbiddenBehaviors && a.forbiddenBehaviors.length) {
        row += '；绝对禁忌=[' + a.forbiddenBehaviors.join('、') + ']';
      }
      lines.push(row);
    });

    lines.push('任何违反上述基线的话术或违和态度均属于劣质表现，严禁无故转变。');
    return lines.join('\n') + '\n';
  }

  WA.personaAnchor = {
    getSettings: settings,
    setSettings: function (patch) {
      return saveSettings(Object.assign(settings(), patch || {}));
    },
    registerAnchor: registerAnchor,
    getAnchor: getAnchor,
    evaluateDrift: evaluateDrift,
    auditGeneratedContent: auditGeneratedContent,
    buildBlock: buildBlock,
    stat: function () {
      return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) });
    }
  };

  if (typeof WA.log === 'function') {
    WA.log('info', 'engines/persona-anchor 已加载（2.249.0）');
  }
})();

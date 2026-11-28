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

  // ── v2.616.0（R291 / NPC 分层棱镜缝合）──────────────────────────────
  // 机制移植自 layered-npc-persona Skill 的 npc-persona-prism：
  //   Stage 0 表层身份 / Stage 1 深层人设 / Stage 2 私密档案三层渐进建档；
  //   情分 × 情愫双轨正交归一化；确定性随机（同种子同签）；开放 Schema（未知字段原样保留）。
  // 只取机制与接口，不搬外部词库；随机自包含（不走 WA.rand，避免污染随机通道计数）。
  const BOND_TIERS = ['死敌', '敌视', '戒备疏远', '萍水客套', '熟稔认可', '亲近信赖', '生死莫逆'];
  const ROMANCE_TIERS = ['无意风月', '初见微澜', '一见倾心', '逐利逢迎', '暗生情愫', '暧昧拉扯', '露水欢好', '热恋痴缠', '深爱不渝', '爱恨交缠'];
  const INTIMATE_MODES = ['自动', '亲密', '普通'];
  const PRISM_SURFACE = ['冷静自持', '外热内冷', '温和疏离', '锋利直接', '慢热寡言'];
  const PRISM_DEEP = [
    { conflict: '表面顺从，内里绝不交出主导权', trace: '住处只留一把椅子是旧的', soft: '被认真记住小事时会短暂失态' },
    { conflict: '渴望被需要，又惧怕被看穿', trace: '手机相册里全是没发出去的照片', soft: '对方不问自取的温柔' },
    { conflict: '以玩笑掩饰不容触碰的底线', trace: '抽屉深处压着一枚旧徽章', soft: '被人当众认真维护' }
  ];
  const PRISM_PRIVATE = [
    { history: '情史留白多、只肯说结果', kink: '慢热、重仪式感', sense: '后颈与手腕最经不起触碰' },
    { history: '有过一段不愿细说的旧关系', kink: '偏好掌控节奏', sense: '低声叫名字时防线会松' },
    { history: '经验有限但观察入微', kink: '克制的试探', sense: '被从背后环住时呼吸会乱' }
  ];
  function hash32(s) { let h = 2166136261 >>> 0; const str = String(s); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function seededRng(seed) { let x = hash32(seed) >>> 0; return function () { x = (x + 0x6D2B79F5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function pickOf(rng, arr) { return (Array.isArray(arr) && arr.length) ? arr[Math.floor(rng() * arr.length) % arr.length] : null; }
  function normEnum(v, allowed) { const s = String(v == null ? '' : v).trim(); return allowed.indexOf(s) >= 0 ? s : undefined; }
  function normalizeBondTier(v) {
    const fuzzy = [[/死敌|不共戴天/, '死敌'], [/敌视|厌恶|仇视/, '敌视'], [/戒备|疏远|冷淡|防备/, '戒备疏远'], [/生死|莫逆|过命|托付/, '生死莫逆'], [/亲近|信赖|贴心|心腹|挚友/, '亲近信赖'], [/熟稔|认可|友善|融洽/, '熟稔认可'], [/萍水|客套|初识|点头/, '萍水客套']];
    const s = normEnum(v, BOND_TIERS); if (s) return s;
    const raw = String(v == null ? '' : v).trim();
    for (let i = 0; i < fuzzy.length; i++) if (fuzzy[i][0].test(raw)) return fuzzy[i][1];
    return undefined;
  }
  function normalizeRomanceTier(v) {
    const fuzzy = [[/无意|绝缘|纯友谊/, '无意风月'], [/爱恨|交缠|虐恋/, '爱恨交缠'], [/深爱|不渝|挚爱/, '深爱不渝'], [/热恋|痴缠|相恋/, '热恋痴缠'], [/露水|欢好|炮友/, '露水欢好'], [/暧昧|拉扯|试探/, '暧昧拉扯'], [/暗生|暗恋|心动/, '暗生情愫'], [/逐利|逢迎|攀附/, '逐利逢迎'], [/一见|倾心/, '一见倾心'], [/初见|微澜/, '初见微澜']];
    const s = normEnum(v, ROMANCE_TIERS); if (s) return s;
    const raw = String(v == null ? '' : v).trim();
    for (let i = 0; i < fuzzy.length; i++) if (fuzzy[i][0].test(raw)) return fuzzy[i][1];
    return undefined;
  }
  function normalizeIntimateMode(v) {
    if (v === undefined) return undefined;
    if (v === null || v === '') return '自动';
    const s = normEnum(v, INTIMATE_MODES); if (s) return s;
    const raw = String(v).trim();
    if (/冻结|普通|normal|freeze/i.test(raw)) return '普通';
    if (/提拔|亲密|核心|intimate/i.test(raw)) return '亲密';
    if (/自动|auto/i.test(raw)) return '自动';
    return undefined;
  }
  function normalizeTiers(t) {
    const src = t || {}; const out = {}; let n = 0;
    ['bondTier', 'romanceTier', 'intimateMode'].forEach(function (k) {
      const fn = k === 'bondTier' ? normalizeBondTier : (k === 'romanceTier' ? normalizeRomanceTier : normalizeIntimateMode);
      if (src[k] !== undefined) { const v = fn(src[k]); if (v) { out[k] = v; n++; } }
    });
    stat.tiersNormalized += n;
    return out;
  }
  function rollPrism(person, seed) {
    const who = clean(person, 40);
    const rng = seededRng(who + '|' + String(seed == null ? '' : seed));
    const surface = pickOf(rng, PRISM_SURFACE);
    const deepSrc = pickOf(rng, PRISM_DEEP) || {};
    const privSrc = pickOf(rng, PRISM_PRIVATE) || {};
    stat.prismsRolled++;
    return {
      person: who,
      stage0: { surface: surface || '' },
      stage1: { coreConflict: deepSrc.conflict || '', trace: deepSrc.trace || '', softSpot: deepSrc.soft || '' },
      stage2: { history: privSrc.history || '', taste: privSrc.kink || '', sense: privSrc.sense || '' },
      seed: String(seed == null ? '' : seed)
    };
  }
  function collectPending() {
    const s = state().personaAnchor; const anchors = (s && s.anchors) || {}; const pending = [];
    Object.keys(anchors).forEach(function (k) {
      const a = anchors[k];
      const mode = normalizeIntimateMode(a.intimateMode) || '自动';
      if (mode === '普通') return;
      const needStage1 = !(a.deep && a.deep.coreConflict);
      const needStage2 = !(a.private && a.private.history);
      if (!needStage1 && !needStage2) return;
      pending.push({ person: a.person, needStage1: needStage1, needStage2: needStage2, mode: mode, rerollCount: a.rerollCount || 0 });
    });
    stat.pendingBuilt += pending.length;
    return pending;
  }

  const stat = {
    anchorsRegistered: 0,
    driftsBlocked: 0,
    driftsAllowed: 0,
    auditsPerformed: 0,
    auditsFlagged: 0,
    prismsRolled: 0,
    tiersNormalized: 0,
    pendingBuilt: 0,
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
        const tiers = normalizeTiers({ bondTier: s.bondTier, romanceTier: s.romanceTier, intimateMode: s.intimateMode });
        let surface = s.surface ? clean(s.surface, 120) : null;
        let deep = (s.deep && typeof s.deep === 'object' && !Array.isArray(s.deep)) ? Object.assign({}, s.deep) : null;
        let priv = (s.private && typeof s.private === 'object' && !Array.isArray(s.private)) ? Object.assign({}, s.private) : null;
        // 确定性分层填充：autoPrism 且缺层时，用 who+prismSeed 自包含 rng 现摇，
        // 同人同种子必同签（Skill 的主/副模型同签口径），但**不新增任何导出面**。
        if (s.autoPrism && (!surface || !deep || !priv)) {
          const rp = rollPrism(who, s.prismSeed);
          if (!surface) surface = rp.stage0.surface;
          if (!deep) deep = { coreConflict: rp.stage1.coreConflict, softSpot: rp.stage1.softSpot, trace: rp.stage1.trace };
          if (!priv) priv = { history: rp.stage2.history, taste: rp.stage2.taste, sense: rp.stage2.sense };
        }
        const KNOWN = ['person','coreTraits','toneStyle','forbiddenBehaviors','resistance','surface','deep','private','bondTier','romanceTier','intimateMode','rerollCount','ext','autoPrism','prismSeed'];
        const ext = (s.ext && typeof s.ext === 'object' && !Array.isArray(s.ext))
          ? Object.assign({}, s.ext)
          : (function () { const o = {}; Object.keys(s).forEach(function (k) { if (KNOWN.indexOf(k) < 0) o[k] = s[k]; }); return o; })();
        draft.personaAnchor.anchors[who] = {
          person: who,
          coreTraits: traits,
          toneStyle: tone,
          forbiddenBehaviors: forbidden,
          resistance: resistance,
          surface: surface,
          deep: deep,
          private: priv,
          bondTier: tiers.bondTier || null,
          romanceTier: tiers.romanceTier || null,
          intimateMode: tiers.intimateMode || '自动',
          rerollCount: Number.isFinite(s.rerollCount) ? s.rerollCount : 0,
          ext: ext,
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
  function supportedMajorEvent(ev, cfg) {
    return !!(ev && typeof ev === 'object' && Number.isFinite(ev.intensity) && ev.intensity >= cfg.minMajorEventIntensity && typeof ev.evidence === 'string' && ev.evidence.trim());
  }
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
    const hasMajorEvent = supportedMajorEvent(ev, cfg);

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
    const hasMajorEvent = supportedMajorEvent(ev, cfg);

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
      if (a.surface) lines.push('  · 表层身份（Stage 0）：' + a.surface);
      if (a.deep && a.deep.coreConflict) lines.push('  · 深层人设（Stage 1）：内核矛盾=' + a.deep.coreConflict + (a.deep.softSpot ? '；软肋=' + a.deep.softSpot : ''));
      if (a.private && a.private.history) lines.push('  · 私密档案（Stage 2）：情史=' + a.private.history + (a.private.taste ? '；口味=' + a.private.taste : ''));
      if (a.bondTier || a.romanceTier) lines.push('  · 关系双轨：情分=' + (a.bondTier || '未定') + ' × 情愫=' + (a.romanceTier || '未定'));
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

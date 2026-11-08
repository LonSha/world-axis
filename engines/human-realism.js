/**
 * WorldAxis engines/human-realism.js (v2.324.0) — 真实人物肉身生理、七情六欲、记恨小账本与同人豁免引擎
 *
 * ── 它治什么（拒绝虚假提线木偶与无底线谄媚工具人）──────────────────────────────
 *   1. 肉身生理极限逼仄（Physiological Needs & Limits）：
 *      - 人必须吃喝、会困乏、会憋急了找如厕茅舍、受创会剧痛抽搐；
 *      - 生理指标跌破底线时，崇高意志必须让位于肉身本能（头昏眼花、暴躁烦闷、注意力涣散）。
 *   2. 真实七情与情绪临界爆发（Emotional Outburst Breaker）：
 *      - 喜怒哀惧怨动态起伏，受委屈与挑衅怒气会攀升；
 *      - 超过阈值触发情绪断路器爆发（摔门、冷嘲热讽、拍桌对峙、拒绝顺从），绝不做顺从工具人。
 *   3. 心底芥蒂与记恨小账本（Grudge & Grievance Ledger）：
 *      - 遭遇当众羞辱、背刺出卖、克扣压榨、轻蔑怠慢后，心里会狠狠记上一笔；
 *      - 只要未得到实质补偿或道歉，记恨会催生消极怠工、关键时刻故意放水、落井下石等被动阻抗。
 *   4. 同人与特殊角色豁免矩阵（Exemption & Fan-Fiction Immunity Matrix）：
 *      - 支持同人角色或神怪/机械/仙尊等设定豁免：
 *        · divine: 神明豁免（免饥渴、免困乏、免排泄、免凡俗伤病）
 *        · construct: 机械/仿生人/傀儡（免生物饥困与如厕，受能源与机械磨损约束）
 *        · ascetic: 辟谷仙尊/得道高僧（免饮食摄入，免凡俗排泄）
 *        · spirit: 灵体/器灵（免全肉身负荷）
 *        · unfeeling: 无心/情感绝缘（豁免怨恨与情绪爆发）
 *        · custom: 自定义豁免白名单列表
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_human_realism_settings_v1';
  const DEF = {
    enabled: true,
    maxActors: 48,
    maxGrudges: 48,
    maxLogs: 32,
    outburstThreshold: 80,
    grudgeDecayPerRound: 0.5
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'humanRealism' };
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80);
  }

  const stat = {
    needsUpdated: 0,
    routinesConsumed: 0,
    grudgesRecorded: 0,
    grudgesSettled: 0,
    outburstsTriggered: 0,
    exemptionsApplied: 0,
    refused: 0,
    lastReason: ''
  };

  function noteRefusal(r) {
    stat.refused++;
    stat.lastReason = r;
    return { ok: false, reason: r };
  }

  let activeDraft = null;
  function getRoot() {
    const st = activeDraft || (WA.store && WA.store.get ? WA.store.get() : null);
    if (!st) return null;
    if (activeDraft) {
      st.humanRealism = st.humanRealism || {actors:{}, grudges:[], log:[]};
      return st.humanRealism;
    }
    // 读口不暴露可变存档引用，也不在读取时创建容器。
    return st.humanRealism ? JSON.parse(JSON.stringify(st.humanRealism)) : null;
  }
  function transactional(fn) {
    return function () {
      if (!WA.store || typeof WA.store.transact !== 'function') return {ok:false,reason:'store-unavailable'};
      const args=arguments, before=JSON.parse(JSON.stringify(stat));
      let output=null;
      const tx=WA.store.transact(function(draft) {
        const parent=activeDraft;
        activeDraft=draft;
        try { output=fn.apply(null,args); }
        finally { activeDraft=parent; }
        if (!output || output.ok!==true) return false;
      });
      if (!tx || tx.ok!==true) {
        Object.keys(stat).forEach(k=>{delete stat[k];}); Object.assign(stat,before);
        return output && output.ok===false ? output : {ok:false,reason:'transaction-rejected'};
      }
      // store 的 ok 与落盘成功不是同义词，保留其原始语义。
      return Object.assign({}, JSON.parse(JSON.stringify(output)), {persisted:tx.persisted,deferred:tx.deferred===true});
    };
  }
  // 预设豁免类型定义
  const PRESET_EXEMPTIONS = {
    divine: ['nourishment', 'energy', 'comfort', 'vitality'],
    construct: ['nourishment', 'energy', 'comfort', 'emotion_outburst'],
    ascetic: ['nourishment', 'comfort'],
    spirit: ['nourishment', 'energy', 'comfort', 'vitality', 'grudge'],
    unfeeling: ['emotion_outburst', 'grudge']
  };

  /**
   * 判断角色在某个维度是否享受豁免
   */
  function isExempt(actorCard, dimension) {
    if (!actorCard || !actorCard.exemptions) return false;
    const ex = actorCard.exemptions;
    // Explicit per-character capability overrides the species preset, including all.
    if (ex.overrides && typeof ex.overrides[dimension] === 'boolean') return ex.overrides[dimension];
    if (ex.all === true) return true;
    if (typeof ex.preset === 'string' && PRESET_EXEMPTIONS[ex.preset]) {
      if (PRESET_EXEMPTIONS[ex.preset].indexOf(dimension) >= 0) return true;
    }
    if (Array.isArray(ex.custom) && ex.custom.indexOf(dimension) >= 0) {
      return true;
    }
    return false;
  }

  /**
   * 初始化或获取角色的肉身与情感档案
   */
  function getOrCreateActor(name, opts) {
    const root = getRoot();
    if (!root) return null;
    const who = clean(name, 48);
    if (!who) return null;

    if (!root.actors[who]) {
      const o = opts || {};
      root.actors[who] = {
        name: who,
        genre: clean(o.genre || 'generic', 24),
        // 四大肉身生理需求（0-100，默认 80 良好）
        needs: {
          nourishment: 80, // 温饱（100饱腹 / 0极饿脱水）
          energy: 85,      // 精力（100充沛 / 0极度疲倦）
          comfort: 90,     // 生理舒适度（100从容 / 0急迫如厕或极度肮脏发臭）
          vitality: 95     // 肉身生机/无痛感（100健康 / 0重伤剧痛）
        },
        // 五大情感动态波幅（0-100）
        emotions: {
          joy: 50,
          anger: 10,
          sorrow: 10,
          fear: 10,
          resentment: 5
        },
        // 豁免档案（同人/特殊角色）
        exemptions: {
          preset: o.exemptionPreset || null,
          custom: Array.isArray(o.exemptions) ? o.exemptions.slice(0, 10) : []
        },
        lastOutburst: null,
        updatedAt: clockNow('humanRealism')
      };
      if (WA.evict && WA.evict.object) {
        WA.evict.object(root.actors, 'humanRealism.actors', settings().maxActors);
      }
    }
    return root.actors[who];
  }

  /**
   * 设置角色的肉身生理需求或情感状态
   */
  function setNeeds(name, patch) {
    const cfg = settings();
    if (!cfg.enabled) return noteRefusal('disabled');
    const who = clean(name, 48);
    if (!who) return noteRefusal('missing-actor-name');
    const p = patch || {};

    const actor = getOrCreateActor(who, p);
    if (!actor) return noteRefusal('store-unavailable');

    // 检查并应用生理需求
    if (p.needs && typeof p.needs === 'object') {
      ['nourishment', 'energy', 'comfort', 'vitality'].forEach(function (k) {
        if (p.needs[k] !== undefined) {
          if (isExempt(actor, k)) {
            stat.exemptionsApplied++;
            return; // 享受豁免，不改变
          }
          const val = Math.max(0, Math.min(100, Math.round(Number(p.needs[k]))));
          actor.needs[k] = isNaN(val) ? actor.needs[k] : val;
        }
      });
    }

    // 检查并应用情感波幅
    if (p.emotions && typeof p.emotions === 'object') {
      ['joy', 'anger', 'sorrow', 'fear', 'resentment'].forEach(function (k) {
        if (p.emotions[k] !== undefined) {
          const val = Math.max(0, Math.min(100, Math.round(Number(p.emotions[k]))));
          actor.emotions[k] = isNaN(val) ? actor.emotions[k] : val;
        }
      });
    }

    actor.updatedAt = clockNow('humanRealism');
    stat.needsUpdated++;
    return { ok: true, actor: Object.assign({}, actor) };
  }

  /**
   * 日常多轮时间流转消耗（生理代谢递减）
   */
  function consumeRoutine(name, opts) {
    const cfg = settings();
    if (!cfg.enabled) return noteRefusal('disabled');
    const who = clean(name, 48);
    if (!who) return noteRefusal('missing-actor-name');

    const actor = getOrCreateActor(who);
    if (!actor) return noteRefusal('store-unavailable');

    const o = opts || {};
    const rounds = Math.max(1, Math.min(24, Math.floor(Number(o.rounds) || 1)));

    // 计算各维度消耗（受豁免影响）
    if (!isExempt(actor, 'nourishment')) {
      const dropN = (o.foodAvailable ? 2 : 12) * rounds;
      actor.needs.nourishment = Math.max(0, actor.needs.nourishment - dropN);
    } else {
      stat.exemptionsApplied++;
    }

    if (!isExempt(actor, 'energy')) {
      const dropE = (o.rested ? -15 : 10) * rounds;
      actor.needs.energy = Math.max(0, Math.min(100, actor.needs.energy - dropE));
    } else {
      stat.exemptionsApplied++;
    }

    if (!isExempt(actor, 'comfort')) {
      const dropC = (o.freshened ? -20 : 8) * rounds;
      actor.needs.comfort = Math.max(0, Math.min(100, actor.needs.comfort - dropC));
    } else {
      stat.exemptionsApplied++;
    }

    // 生理逼仄自然影响情绪：饿极了或累极了极易暴躁
    if (actor.needs.nourishment < 25 || actor.needs.energy < 25 || actor.needs.comfort < 25) {
      actor.emotions.resentment = Math.min(100, actor.emotions.resentment + 10 * rounds);
      actor.emotions.anger = Math.min(100, actor.emotions.anger + 8 * rounds);
    }

    actor.updatedAt = clockNow('humanRealism');
    stat.routinesConsumed++;

    return {
      ok: true,
      who: who,
      rounds: rounds,
      currentNeeds: Object.assign({}, actor.needs),
      emotions: Object.assign({}, actor.emotions),
      strainSymptoms: evaluateStrain(actor)
    };
  }

  /**
   * 评估角色的生理压迫症状与身体微反应
   */
  function evaluateStrain(actor) {
    const symptoms = [];
    if (!actor || !actor.needs) return symptoms;

    if (!isExempt(actor, 'nourishment')) {
      if (actor.needs.nourishment <= 15) symptoms.push('腹如火烧、两眼发黑虚脱、满脑子被食物香气夺走心神');
      else if (actor.needs.nourishment <= 35) symptoms.push('唇干口燥、腹中咕咕作响、频繁吞咽唾沫');
    }
    if (!isExempt(actor, 'energy')) {
      if (actor.needs.energy <= 15) symptoms.push('眼皮沉重如灌铅、呵欠连连、站立打晃、言语极度不耐烦');
      else if (actor.needs.energy <= 35) symptoms.push('眉头紧锁揉捏太阳穴、反应迟缓半拍');
    }
    if (!isExempt(actor, 'comfort')) {
      if (actor.needs.comfort <= 15) symptoms.push('神色焦躁不安、坐立不宁、急迫地左右顾盼寻找茅舍净室');
      else if (actor.needs.comfort <= 35) symptoms.push('频繁挪动身子、衣襟沾染泥灰污汗让人极度膈应');
    }
    if (!isExempt(actor, 'vitality')) {
      if (actor.needs.vitality <= 25) symptoms.push('伤处钻心剧痛、冷汗浸湿背脊、倒抽冷气咬牙强撑');
      else if (actor.needs.vitality <= 50) symptoms.push('动作僵硬避让痛处、脸色苍白');
    }
    return symptoms;
  }

  /**
   * 记录一笔受委屈或记恨（记小账本）
   */
  function recordGrudge(opts) {
    const cfg = settings();
    if (!cfg.enabled) return noteRefusal('disabled');
    const o = opts || {};
    const who = clean(o.who, 48);
    const target = clean(o.target, 48);
    const reason = clean(o.reason, 120);
    const kind = clean(o.kind || 'contempt', 24);

    if (!who) return noteRefusal('missing-actor-who');
    if (!target) return noteRefusal('missing-target');
    if (!reason) return noteRefusal('missing-grudge-reason');

    const actor = getOrCreateActor(who);
    if (!actor) return noteRefusal('store-unavailable');

    // 检查是否具备情感或恩怨豁免
    if (isExempt(actor, 'grudge')) {
      stat.exemptionsApplied++;
      return { ok: false, reason: 'exempted-from-grudge', note: '该角色享有超然/构造体豁免，不滋生凡俗记恨' };
    }

    const intensity = Math.max(10, Math.min(100, Math.round(Number(o.intensity) || 50)));
    const grudgeId = 'grd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

    const root = getRoot();
    const entry = {
      id: grudgeId,
      who: who,
      target: target,
      kind: kind, // humiliation(羞辱), breach_trust(背信), contempt(轻慢), profit_theft(剥削), physical_harm(伤害)
      intensity: intensity,
      reason: reason,
      roundsHeld: 0,
      settled: false,
      resolution: '',
      recordedAt: clockNow('humanRealism')
    };

    root.grudges.unshift(entry);
    if (WA.evict && WA.evict.array) {
      WA.evict.array(root.grudges, 'humanRealism.grudges', cfg.maxGrudges);
    }

    // 提高角色的愤怒与怨恨
    actor.emotions.resentment = Math.min(100, actor.emotions.resentment + Math.round(intensity * 0.6));
    actor.emotions.anger = Math.min(100, actor.emotions.anger + Math.round(intensity * 0.4));
    actor.updatedAt = clockNow('humanRealism');

    stat.grudgesRecorded++;
    return { ok: true, grudge: Object.assign({}, entry) };
  }
  /**
   * 化解或结算一笔恩怨（拒绝无凭据白开脱，支持赔偿、停火与释怀三层分立）
   */
  function settleGrudge(grudgeId, opts) {
    const cfg = settings();
    if (!cfg.enabled) return noteRefusal('disabled');
    const gid = clean(grudgeId, 48);
    if (!gid) return noteRefusal('missing-grudge-id');
    const o = opts || {};
    const resolution = clean(o.resolution, 120);

    // 负控制纪律：必须给出具体化解行为（如：赔礼道歉、归还利益、生死相助等），严禁空头勾销
    if (!resolution) return noteRefusal('missing-resolution');

    const root = getRoot();
    if (!root) return noteRefusal('store-unavailable');

    const hit = root.grudges.find(function (g) { return g && g.id === gid; });
    if (!hit) return noteRefusal('grudge-not-found');
    if (hit.settled) return noteRefusal('already-settled');

    const evidence = clean(o.evidence, 160);
    if (!evidence) return noteRefusal('missing-resolution-evidence');
    const response = o.response;
    if (['reject', 'acknowledge', 'accept-repair', 'truce', 'forgive'].indexOf(response) < 0) return noteRefusal('missing-personal-response');

    // OPV18-1: 赔偿价值检定与负控制硬门禁
    const compensationValue = Number(o.compensationValue !== undefined ? o.compensationValue : (hit.intensity * 2));
    if (response === 'accept-repair' || response === 'truce' || response === 'forgive') {
      if (o.compensationValue !== undefined && Number(o.compensationValue) < hit.intensity) {
        return noteRefusal('insufficient-compensation');
      }
    }

    if (!Array.isArray(hit.resolutionAttempts)) hit.resolutionAttempts = [];
    hit.resolutionAttempts.push({
      resolution: resolution,
      evidence: evidence,
      response: response,
      compensationValue: compensationValue,
      at: clockNow('humanRealism')
    });
    hit.resolutionAttempts = hit.resolutionAttempts.slice(-8);

    hit.resolution = resolution;
    hit.resolutionEvidence = evidence;
    hit.response = response;

    // 三层化解状态分立
    hit.compensationAccepted = (response === 'accept-repair' || response === 'truce' || response === 'forgive');
    hit.truceAgreed = (response === 'truce' || response === 'forgive');
    hit.heartForgiven = (response === 'forgive');
    hit.repairAccepted = hit.compensationAccepted;
    hit.forgiven = hit.heartForgiven;
    hit.settled = hit.heartForgiven; // 仅彻底释怀视为恩怨完全终结
    if (hit.settled) hit.settledAt = clockNow('humanRealism');

    const actor = root.actors[hit.who];
    if (actor) {
      if (hit.heartForgiven) {
        actor.emotions.resentment = Math.max(0, actor.emotions.resentment - Math.round(hit.intensity * 0.6));
        actor.emotions.anger = Math.max(0, actor.emotions.anger - Math.round(hit.intensity * 0.5));
        stat.grudgesSettled++;
      } else if (hit.truceAgreed) {
        // 表面停火：暂时压制怒气，但怨恨转为冷性戒备（cold_grudge）
        actor.emotions.anger = Math.max(0, actor.emotions.anger - Math.round(hit.intensity * 0.3));
        hit.coldGrudge = true;
      } else if (hit.compensationAccepted) {
        // 仅收下赔偿：略微缓和暴怒，保留防备
        actor.emotions.anger = Math.max(0, actor.emotions.anger - Math.round(hit.intensity * 0.2));
      }
      actor.updatedAt = clockNow('humanRealism');
    }

    return { ok: true, grudge: Object.assign({}, hit) };
  }
  /**
   * 触发或检测情绪临界爆发（Outburst Breaker）
   */
  function triggerOutburst(name, opts) {
    const cfg = settings();
    if (!cfg.enabled) return noteRefusal('disabled');
    const who = clean(name, 48);
    if (!who) return noteRefusal('missing-actor-name');

    const actor = getOrCreateActor(who);
    if (!actor) return noteRefusal('store-unavailable');

    if (isExempt(actor, 'emotion_outburst')) {
      stat.exemptionsApplied++;
      return { ok: false, reason: 'exempted-from-outburst', note: '该角色豁免情绪失控与爆发' };
    }

    const o = opts || {};
    const force = o.force === true;
    const currentAnger = actor.emotions.anger || 0;
    const currentResentment = actor.emotions.resentment || 0;
    const threshold = Number(cfg.outburstThreshold) || 80;

    // 门禁：怒气或怨恨必须达到爆发阈值，或者显式指定 force
    if (!force && currentAnger < threshold && currentResentment < threshold) {
      return {
        ok: false,
        reason: 'below-threshold',
        anger: currentAnger,
        resentment: currentResentment,
        threshold: threshold
      };
    }

    // 生成爆发行为外溢反应
    let action = clean(o.action, 80);
    if (!action) {
      if (currentAnger >= threshold) {
        action = '当众脸色剧变，猛地拍案而起冷声怒斥，拒绝妥协并拂袖而去';
      } else {
        action = '眼神如淬寒冰，嘴角扬起极度讥诮的冷笑，冷暴力沉默抗拒';
      }
    }

    actor.lastOutburst = {
      action: action,
      at: clockNow('humanRealism')
    };
    // 爆发后怒气得到宣泄，略微回落，但转化为深层芥蒂
    actor.emotions.anger = Math.max(20, actor.emotions.anger - 40);
    actor.emotions.resentment = Math.min(100, actor.emotions.resentment + 10);
    actor.updatedAt = clockNow('humanRealism');

    stat.outburstsTriggered++;
    return {
      ok: true,
      who: who,
      outburstAction: action,
      remainingAnger: actor.emotions.anger,
      remainingResentment: actor.emotions.resentment
    };
  }

  /**
   * 为角色配置豁免白名单（同人角色/特殊世界观实体）
   */
  function setExemption(name, opts) {
    const cfg = settings();
    if (!cfg.enabled) return noteRefusal('disabled');
    const who = clean(name, 48);
    if (!who) return noteRefusal('missing-actor-name');
    const o = opts || {};

    const actor = getOrCreateActor(who);
    if (!actor) return noteRefusal('store-unavailable');

    if (o.preset) {
      actor.exemptions.preset = clean(o.preset, 24);
    }
    if (Array.isArray(o.custom)) {
      actor.exemptions.custom = o.custom.map(function (c) { return clean(c, 32); }).filter(Boolean);
    }
    if (o.overrides && typeof o.overrides === 'object') {
      actor.exemptions.overrides = actor.exemptions.overrides || {};
      ['nourishment','energy','comfort','vitality','emotion_outburst','grudge'].forEach(function (k) {
        if (typeof o.overrides[k] === 'boolean') actor.exemptions.overrides[k] = o.overrides[k];
      });
    }
    if (o.all !== undefined) {
      actor.exemptions.all = !!o.all;
    }

    actor.updatedAt = clockNow('humanRealism');
    return { ok: true, who: who, exemptions: Object.assign({}, actor.exemptions) };
  }

  /**
   * 提示词汇流块生产（注入管线）
   */
  function buildBlock(opts) {
    const cfg = settings();
    if (!cfg.enabled || !WA.store || !WA.store.get) return '';
    const st = WA.store.get() || {};
    const root = st.humanRealism;
    if (!root || !root.actors) return '';

    const lines = [];
    const filterWho = opts && opts.who ? String(opts.who) : '';

    // 1. 生理压迫与七情外溢
    let actorsList = Object.keys(root.actors).map(function (k) { return root.actors[k]; });
    if (filterWho) {
      actorsList = actorsList.filter(function (a) { return a.name === filterWho; });
    } else {
      actorsList = actorsList.slice(0, 4);
    }

    const realismLines = [];
    actorsList.forEach(function (a) {
      const symptoms = evaluateStrain(a);
      const exNote = a.exemptions && a.exemptions.preset ? '（设定豁免: ' + a.exemptions.preset + '）' : '';
      if (symptoms.length > 0 || a.lastOutburst) {
        let text = '· 【肉身实感】' + a.name + exNote + '：';
        if (symptoms.length > 0) {
          text += symptoms.join('；');
        }
        if (a.lastOutburst) {
          text += '；近期情绪激变：「' + a.lastOutburst.action + '」';
        }
        realismLines.push(text);
      }
    });

    // 2. 活跃记恨与芥蒂小账本
    const activeGrudges = (root.grudges || []).filter(function (g) { return g && !g.settled; }).slice(0, 3);
    const grudgeLines = [];
    activeGrudges.forEach(function (g) {
      grudgeLines.push('· 【心底芥蒂】' + g.who + ' 对 ' + g.target + ' 尚有未解芥蒂（缘由：' + g.reason + '，烈度：' + g.intensity + (g.repairAccepted ? '；已接受补偿，不等于原谅或恢复信任' : '') + '；结合性格、经历、现实牵挂与场合表现，可克制、疏远、交涉或暂时合作，不强制报复，也不凭主角意愿抹消恩怨）');
    });

    if (!realismLines.length && !grudgeLines.length) return '';

    lines.push('【人物肉身实感与心底芥蒂约束】（人有生理逼仄与真实私心恩怨，绝非冰冷顺从人偶）：');
    realismLines.forEach(function (l) { lines.push(l); });
    grudgeLines.forEach(function (l) { lines.push(l); });

    return lines.join('\n') + '\n';
  }

  function getActor(name) {
    const root = getRoot();
    if (!root || !root.actors) return null;
    return root.actors[clean(name, 48)] || null;
  }

  function listGrudges(who) {
    const root = getRoot();
    if (!root || !root.grudges) return [];
    if (!who) return root.grudges.slice();
    const w = clean(who, 48);
    return root.grudges.filter(function (g) { return g && (g.who === w || g.target === w); });
  }

  /**
   * OPV19-5: 睡眠剥夺阶梯病理学与深度疲劳强制宕机
   */
  function applySleepDeprivation(actorId, hoursAwake) {
    const aid = clean(actorId, 48);
    const hours = Number(hoursAwake) || 0;
    if (!aid) return { ok: false, refusal: 'missing-actor-id', reason: '未指定角色' };

    // 破坏性负控制：刚醒不久睡眠充沛（<4小时），严禁触发任何疲劳昏厥病理
    if (hours < 4) {
      return {
        ok: false,
        refusal: 'rested-no-deprivation',
        reason: '该角色精力充沛且刚醒不久（清醒不足4小时），严禁触发睡眠剥夺与虚假昏厥！',
        actorId: aid,
        hoursAwake: hours
      };
    }

    let pathology = 'alert';
    let forcedCollapse = false;
    let narrative = '';

    if (hours >= 72) {
      // 72 小时极限强制昏睡宕机
      pathology = 'narcolepsyCrash';
      forcedCollapse = true;
      narrative = `【生理强制宕机】连续 ${hours} 小时未眠！神经突触彻底衰竭，大脑自我保护机制强行关闭意识，当场扑倒昏厥长眠！`;
    } else if (hours >= 48) {
      // 48 小时出现幻视与手部震颤
      pathology = 'hallucinations_tremor';
      narrative = `连续 ${hours} 小时未眠！视野边缘扭曲发黑，眼前浮现不存在的幢幢鬼影，手指剧烈颤抖无法平稳握持兵刃。`;
    } else if (hours >= 24) {
      // 24 小时注意力涣散
      pathology = 'cognitive_fog';
      narrative = `清醒已达 ${hours} 小时，太阳穴突突胀痛，反应迟钝且注意力严重涣散。`;
    } else {
      pathology = 'mild_weariness';
      narrative = `清醒 ${hours} 小时，略显疲态，需要休整。`;
    }

    return {
      ok: true,
      actorId: aid,
      hoursAwake: hours,
      pathology: pathology,
      forcedCollapse: forcedCollapse,
      narrative: narrative
    };
  }

  WA.humanRealism = {
    setNeeds: transactional(setNeeds),
    consumeRoutine: transactional(consumeRoutine),
    recordGrudge: transactional(recordGrudge),
    settleGrudge: transactional(settleGrudge),
    triggerOutburst: transactional(triggerOutburst),
    setExemption: transactional(setExemption),
    getActor: getActor,
    isExempt: function (name, dimension) { return isExempt(getActor(name), dimension); },
    listGrudges: listGrudges,
    applySleepDeprivation: applySleepDeprivation,
    buildBlock: buildBlock,
    PRESET_EXEMPTIONS: PRESET_EXEMPTIONS
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/human-realism.js', { kind: 'engine', ver: '2.324.0' });
  }
})();

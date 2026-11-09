/**
 * WorldAxis engines/idiosyncrasy.js (v2.306.0)
 * EXV13-7: 潜意识动作与下意识心理微反应（Subconscious Idiosyncrasy）
 *
 * 核心机制：
 *   1. 登记角色潜意识微反应模式（registerIdiosyncrasy）：
 *      将角色长期创伤或隐藏秘密绑定到特定情境/话题触发器（triggerTag）与下意识微动作（microBehavior）；
 *   2. 情境压力下下意识触发（triggerReaction）：
 *      当对话/质询涉及敏感话题或压力激增时，角色无法自控地流露生理微动作；
 *   3. 敏锐洞察侦测（observeSubconscious）：
 *      外部观察者在交互中敏锐捕捉到微动作破绽，进而推导或揭开潜在隐秘（leakedSecretKey）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) {
    try { return WA.clock.now(site); } catch (e) { return Date.now(); }
  };
  const LS_KEY = 'worldaxis_idiosyncrasy_settings_v1';
  const DEF = { enabled: true, defaultSensitivity: 0.65, maxPerActor: 10 };
  const __REG = { key: LS_KEY, def: DEF, module: 'idiosyncrasy', bounds: {} };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return Object.assign({}, DEF, raw || {});
  }
  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80);
  }
  function state() {
    return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
  }

  const _stat = {
    registered: 0,
    triggered: 0,
    observed: 0,
    refused: 0,
    lastReason: ''
  };

  /**
   * 1. 登记角色潜意识微反应模式
   */
  function registerIdiosyncrasy(actorId, spec) {
    const cfg = settings();
    if (!cfg.enabled) {
      _stat.refused++;
      _stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    const aid = clean(actorId, 40);
    spec = spec || {};
    const triggerTag = clean(spec.triggerTag || spec.trigger, 40);
    const microBehavior = clean(spec.microBehavior || spec.behavior, 120);
    const leakedSecretKey = clean(spec.leakedSecretKey || spec.secretKey || spec.secret, 60);

    if (!aid || !triggerTag || !microBehavior) {
      _stat.refused++;
      _stat.lastReason = 'missing-params';
      return { ok: false, reason: 'missing-params' };
    }

    let out = null;
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (draft) {
        draft.people = draft.people || {};
        // v2.381.0 修复（第二处，与上面 updatedAt 同一条 C 面判据咬出来的）：
        //   原写法 `draft.people[aid] ? aid : (draft.people['p_'+aid] ? 'p_'+aid : aid)`
        //   —— **两侧都找不到时回落成裸 `aid`**，而全库其它建人路径（actors/registry.ensurePerson
        //   经 life / backstage / world-seed 等）一律用 `'p_' + 名字`。后果不是命名风格：
        //   同一个人先被本引擎建成 `{aid}`、再被 life.addGoal 建成 `{p_aid}`，
        //   于是**一个人两条记录**——idiosyncrasies 挂在裸键那条上，目标/承诺挂在 p_ 那条上，
        //   两半永远合不到一起（本仓点名的「同一实体两个身份」缺陷）。
        //   故回落分支改为 `'p_' + aid`，与既有前缀约定一致；读取面本来就同时认两种键
        //   （下方 115/137 行 `s.people[aid] || s.people['p_' + aid]`），旧档里的裸键照样读得到。
        const pKey = draft.people[aid] ? aid : (draft.people['p_' + aid] ? 'p_' + aid : 'p_' + aid);
        // v2.381.0 修复（evict-meta-v2610 的 C2「未覆盖: engines/idiosyncrasy.js:57」）：
        //   本函数是 people 条目的**生产者之一**（容器满时新来者会与全场人竞争挤出位），
        //   但建人点是裸对象字面量，既没走 actors/registry.ensurePerson（唯一写者），
        //   也没写 `updatedAt` —— 而 people 的容量治理（engines/backstage.js:1058 的
        //   `WA.evict.object(draft.people, 'people', pKeys)`）正是按 `updatedAt` 最旧优先挤出。
        //   后果：一个刚登场、身上正挂着秘密的 NPC，`updatedAt` 缺省被读成 0，
        //   **一建出来就是全场最旧的一个** ⇒ 下一条新人物进来时它第一个被删。
        //   这不是「测试要的数字」：缺排序键的生产者在本仓一律判越界（见 v2.261.0 的 C 面
        //   「每条创建 people 条目的路径都提供淘汰排序键，新条目不被优先挤出」）。
        //   故建人点补齐 createdAt / updatedAt 两键，与本文件其它写入点（83 行 registeredAt、
        //   145 行 at）同一时钟口径 clockNow('idiosyncrasy')。
        const nowAt = clockNow('idiosyncrasy');
        draft.people[pKey] = draft.people[pKey] || { id: pKey, name: aid, resources: {}, life: {}, createdAt: nowAt, updatedAt: nowAt };
        const p = draft.people[pKey];
        p.idiosyncrasies = Array.isArray(p.idiosyncrasies) ? p.idiosyncrasies : [];

        // 避免重复登记同类触发标签
        const existingIdx = p.idiosyncrasies.findIndex(x => x.triggerTag === triggerTag);
        const record = {
          id: 'idio_' + aid + '_' + triggerTag.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          triggerTag: triggerTag,
          microBehavior: microBehavior,
          leakedSecretKey: leakedSecretKey || null,
          stressThreshold: Number(spec.stressThreshold != null ? spec.stressThreshold : 30),
          involuntary: spec.involuntary !== false,
          registeredAt: clockNow('idiosyncrasy')
        };

        if (existingIdx >= 0) {
          p.idiosyncrasies[existingIdx] = record;
        } else {
          p.idiosyncrasies.push(record);
          if (p.idiosyncrasies.length > cfg.maxPerActor) p.idiosyncrasies.shift();
        }

        _stat.registered++;
        out = {
          ok: true,
          actorId: aid,
          idiosyncrasy: record,
          total: p.idiosyncrasies.length
        };
      }, 'idiosyncrasy:register');
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 2. 情境/话题压力匹配与微动作触发
   */
  function triggerReaction(actorId, context) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const aid = clean(actorId, 40);
    context = context || {};
    const topic = clean(context.topic || context.tag, 40);
    const s = state();
    const p = (s.people && (s.people[aid] || s.people['p_' + aid])) || null;
    if (!p || !Array.isArray(p.idiosyncrasies) || p.idiosyncrasies.length === 0) {
      return { ok: true, triggered: false, reason: 'no-idiosyncrasies' };
    }

    const currentStress = Number(context.stress != null ? context.stress : (p.stress || 0));
    const matched = p.idiosyncrasies.filter(item => {
      const tagMatch = !topic || item.triggerTag.toLowerCase() === topic.toLowerCase() || (context.tags && context.tags.includes(item.triggerTag));
      const stressMatch = currentStress >= item.stressThreshold;
      return tagMatch && stressMatch;
    });

    if (matched.length === 0) {
      return { ok: true, triggered: false, reason: 'threshold-not-met' };
    }

    const selected = matched[0];
    _stat.triggered++;

    // 沉淀至短期遥测记录
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (draft) {
        const pKey = draft.people[aid] ? aid : (draft.people['p_' + aid] ? 'p_' + aid : aid);
        const target = draft.people[pKey];
        if (target) {
          target.recentMicroBehaviors = Array.isArray(target.recentMicroBehaviors) ? target.recentMicroBehaviors : [];
          target.recentMicroBehaviors.push({
            behavior: selected.microBehavior,
            triggerTag: selected.triggerTag,
            leakedSecretKey: selected.leakedSecretKey,
            at: clockNow('idiosyncrasy')
          });
          if (target.recentMicroBehaviors.length > 10) target.recentMicroBehaviors.shift();
        }
      }, 'idiosyncrasy:trigger');
    }

    return {
      ok: true,
      triggered: true,
      actorId: aid,
      behavior: selected.microBehavior,
      leakedSecretKey: selected.leakedSecretKey,
      involuntary: selected.involuntary
    };
  }

  /**
   * 3. 敏锐洞察侦测：观察者捕捉潜意识微破绽
   */
  function observeSubconscious(observerId, targetId, opts) {
    const cfg = settings();
    if (!cfg.enabled) {
      _stat.refused++;
      _stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    const obsId = clean(observerId, 40);
    const tgtId = clean(targetId, 40);
    const o = opts || {};

    if (!obsId || !tgtId) {
      _stat.refused++;
      _stat.lastReason = 'missing-params';
      return { ok: false, reason: 'missing-params' };
    }

    // 先行评估目标是否在当前情境下触发了微反应
    const reaction = triggerReaction(tgtId, o);
    const s = state();
    const obs = (s.people && (s.people[obsId] || s.people['p_' + obsId])) || {};
    const insight = Number(o.insightScore != null ? o.insightScore : (obs.resources && obs.resources.insight ? obs.resources.insight : 50));

    _stat.observed++;
    if (!reaction.triggered) {
      return {
        ok: true,
        detected: false,
        observerId: obsId,
        targetId: tgtId,
        note: '目标神色如常，未流露异常微动作'
      };
    }

    // 观察力检定：若洞察力超过门槛，则洞悉弦外之音与隐秘线索
    // v2.382.0（死键族）：洞察门槛改由登记的 defaultSensitivity 生效 —— 此前 40 是硬编码，
    //   声明了 defaultSensitivity 却零消费（改敏感度不影响任何判定）。口径：敏感度与门槛成反比
    //   （基准 0.65 ⇒ 门槛仍 40；调高敏感度 ⇒ 门槛下降，更易看破弦外之音）。
    const sens = Number(cfg.defaultSensitivity) || DEF.defaultSensitivity;
    const insightBar = Math.max(10, Math.round(40 * (DEF.defaultSensitivity / sens)));
    const success = insight >= insightBar || o.forceDetect;
    return {
      ok: true,
      detected: true,
      observerId: obsId,
      targetId: tgtId,
      microBehavior: reaction.behavior,
      secretKey: success ? reaction.leakedSecretKey : null,
      insightGrade: success ? 'acute_insight' : 'fleeting_impression',
      exposition: success
        ? '观察到「' + tgtId + '」流露出「' + reaction.behavior + '」，暴露了与「' + reaction.leakedSecretKey + '」相关的隐秘心防破绽！'
        : '察觉到「' + tgtId + '」有些坐立不安，但未完全摸清其缘由。'
    };
  }

  function stat() {
    return Object.assign({}, _stat);
  }
  function resetStat() {
    _stat.registered = 0;
    _stat.triggered = 0;
    _stat.observed = 0;
    _stat.refused = 0;
    _stat.lastReason = '';
  }
  function getSettings() {
    return settings();
  }
  function setSettings(patch) {
    // v2.381.0: 修「调用了不存在的 API」—— settingsBus 无 `write` 成员（真源只有
    //   save / saveOrThrow），原调用必抛 TypeError。
    if (WA.settingsBus && typeof WA.settingsBus.saveOrThrow === 'function') {
      return WA.settingsBus.saveOrThrow(__REG, Object.assign({}, settings(), patch || {}));
    }
    return Object.assign({}, settings(), patch || {});
  }

  WA.idiosyncrasy = {
    registerIdiosyncrasy: registerIdiosyncrasy,
    observeSubconscious: observeSubconscious,
    // v2.381.0: 补导出 —— 让设置有公开读写口（此前 getSettings/setSettings 全是文件内私有，
    //   面板与测试都改不了这个引擎的设置，等于「有默认值无开关」）。
    getSettings: getSettings,
    setSettings: setSettings
  };

  if (WA.log) WA.log('info', '潜意识动作与下意识心理微反应引擎已加载（v2.306.0）');
})();

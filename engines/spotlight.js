/**
 * WorldAxis engines/spotlight.js (v2.71.0)
 * 焦点分配：登场轮次的连续计数与久缺名单（均衡读数，不改剧情）。
 *
 * 缝合来源：MoM 果实「各角色有自己的事务、偏好与目的。只展开当前相关的人物，
 * 不强制人人表态，也不让配角只负责赞叹、嫉妒或附和」；打工喵「🌊叙事独立」——
 * 「双方可以同时进行彼此无关的活动……交集必须具有合理的因果来源」；Phantasm
 * 「阶段推进」中「每阶段都会根据不同角色的行动触发一些小事件」。
 *
 * 预设里那是给模型的均衡要求；能落成引擎判据的是**登场是可数事件**：
 * 谁在场、连续在场多少轮、谁已经多少轮没露面——都是登记与计数，不是感觉。
 * 本模块只产出读数与注入提示，**不阻断任何剧情**（均衡是建议不是闸门，
 * 与 ladder/rivalry 那类「不满足即拒收」的纪律型模块区分开）。
 *
 * 与 actors/observe.js 的分工：observe 从正文切片观察「谁出现在场景里」（文本面）；
 * 本模块是叙事者**显式登记**的登场账（声明面），不读正文、不猜。两账可互相印证。
 *
 * ── v2.548.0：轻提三分级（缝合「迷雾之外」的冷落分级）─────────
 *   两个真病在这一步被照出来：
 *   ① `resolveIntervention` 此前**全仓只有测试在调**（产品零消费者）——
 *      静默闸、防全知拦截、在场熟人线索全都是「判了没人用」。
 *   ② `followupGate.fire` 同样零产品调用 ⇒ due 的「今天已提过」与「每日上限」
 *      两道闸恒无账可判（每轮都会重新放行）。
 *   现在：buildBlock 按 resolveIntervention 的结论写一行提示，level（followupGate 给）
 *   译成三种措词：顺口提一句 / 只留痕迹 / 暂不打扰；并在真要提的那一刻
 *   调一次 `fire`（幂等：同日同人只记一次，构建两次不会吃多日额度）。
 *   冷落不分级的后果是「越久没见越热络」——正是倒贴；三档是为了让
 *   久断联的人只留痕迹、不给台词（直到玩家去找）。
 *
 * 边界（全是否定式）：
 *   1 总开关默认开启。关闭时写路径报 reason:'disabled'，不出读数。
 *   2 名字缺或空整次拒收（bad-who）——空名登场不是登场。
 *   3 同一轮内重复登记同一人**幂等**（不重复计数，报 already 标记但不拒收——
 *      「他这轮说过三次话」与「他这轮在场」是同一件事）。
 *   4 seal() 结算轮次；未 seal 就再 seal 会报 empty-round（没有任何登记者时
 *     结算不进历史）——空轮不算「所有人缺席」，缺省语义必须显式。
 *   5 单轮登记名单有界（maxRows）：满员后新面孔拒收（pending-full），
 *     不静默顶掉本轮更早的登记者；结算（seal）后名单清空。
 *   6 报告只含**已登记过的人**；从未登记的名字不出现在任何读面（不猜存在性）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_spotlight_settings_v1';
  const DEF = { enabled: true, idleThreshold: 5, hotStreak: 6, maxRows: 32 };
  const __REG = { key: LS_KEY, def: DEF, module: 'spotlight',
    bounds: { idleThreshold: [2, 20], hotStreak: [2, 30], maxRows: [8, 64] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { notes: 0, seals: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard.text(v, max || 40); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().spotlight; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function pendingRound() { const m = state().spotlight; return (m && Array.isArray(m.pending)) ? m.pending : []; }
  /**
   * 登记登场：本轮 who 在场（幂等——同一轮重复登记不重复计数）。
   * 返回值带 already 标记：调用方可以知道「这是本轮第一次还是重复登记」。
   */
  function note(who) {
    const w = clean(who, 40);
    if (!w) { noteFault('bad-who'); return { ok: false, reason: 'bad-who' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.spotlight = draft.spotlight && typeof draft.spotlight === 'object' && !Array.isArray(draft.spotlight) ? draft.spotlight : { rows: [], pending: [] };
      draft.spotlight.rows = Array.isArray(draft.spotlight.rows) ? draft.spotlight.rows : [];
      draft.spotlight.pending = Array.isArray(draft.spotlight.pending) ? draft.spotlight.pending : [];
      if (draft.spotlight.pending.indexOf(w) >= 0) { out = { ok: true, who: w, already: true, pending: draft.spotlight.pending.length }; return; }
      const pendCap = settings().maxRows;
      if (draft.spotlight.pending.length >= pendCap) { out = { ok: false, reason: 'pending-full', who: w, cap: pendCap }; return false; }
      draft.spotlight.pending.push(w);
      if (WA.evict) WA.evict.array(draft.spotlight.pending, 'spotlight.pending', pendCap);
      out = { ok: true, who: w, already: false, pending: draft.spotlight.pending.length };
    }, 'spotlight:note');
    if (out && out.ok) { if (out.reason !== 'disabled' && !out.already) stat.notes++; stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'noted'; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 结算轮次：本轮登记者 seen+1（连续在场 streak+1、missed 清零）；
   * 其余已建档者 missed+1（streak 清零）。本轮没人登记 ⇒ empty-round（不进历史）。
   */
  function seal() {
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.spotlight = draft.spotlight && typeof draft.spotlight === 'object' && !Array.isArray(draft.spotlight) ? draft.spotlight : { rows: [], pending: [] };
      draft.spotlight.rows = Array.isArray(draft.spotlight.rows) ? draft.spotlight.rows : [];
      draft.spotlight.pending = Array.isArray(draft.spotlight.pending) ? draft.spotlight.pending : [];
      if (WA.evict) WA.evict.array(draft.spotlight.pending, 'spotlight.pending', settings().maxRows);
      const pend = draft.spotlight.pending.slice();
      if (!pend.length) { out = { ok: false, reason: 'empty-round' }; return false; }
      const known = {};
      draft.spotlight.rows.forEach(function (r) { if (r && r.who) known[r.who] = r; });
      pend.forEach(function (w) {
        let r = known[w];
        if (!r) {
          const cap = settings().maxRows;
          if (draft.spotlight.rows.length >= cap) return;   // 容量已满：新人不建档（旧档不受影响）
          r = { who: w, seen: 0, missed: 0, streak: 0, at: clockNow('spotlight') };
          draft.spotlight.rows.push(r);
          known[w] = r;
        }
        r.seen = (r.seen || 0) + 1;
        r.streak = (r.streak || 0) + 1;
        r.missed = 0;
        r.at = clockNow('spotlight');
      });
      draft.spotlight.rows.forEach(function (r) {
        if (!r || pend.indexOf(r.who) >= 0) return;
        r.missed = (r.missed || 0) + 1;
        r.streak = 0;
      });
      if (WA.evict) WA.evict.array(draft.spotlight.rows, 'spotlight.rows');
      draft.spotlight.pending = [];
      out = { ok: true, round: pend.slice(), total: draft.spotlight.rows.length };
    }, 'spotlight:seal');
    if (out && out.ok) { if (out.reason !== 'disabled') stat.seals++; stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'sealed'; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 读数：全档（seen/missed/streak），按 streak 降序。未启用返回 disabled。 */
  function report() {
    const cfg = settings();
    if (!cfg.enabled) return { ok: true, reason: 'disabled' };
    const list = rows().map(function (r) { return { who: r.who, seen: r.seen || 0, missed: r.missed || 0, streak: r.streak || 0 }; });
    list.sort(function (a, b) { return b.streak - a.streak || b.seen - a.seen; });
    return { ok: true, rows: list, pending: pendingRound().slice() };
  }
  /** 久缺名单：missed >= 阈值的人（从未登记的人不出现在这里）。 */
  function idle(threshold) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: true, reason: 'disabled', rows: [] };
    const t = Number(threshold);
    const th = isFinite(t) && t > 0 ? Math.floor(t) : cfg.idleThreshold;
    const list = rows().filter(function (r) { return (r.missed || 0) >= th; })
      .map(function (r) { return { who: r.who, missed: r.missed, seen: r.seen || 0, at: Number(r.at) || 0 }; });
    list.sort(function (a, b) { return b.missed - a.missed; });
    return { ok: true, threshold: th, rows: list };
  }
  /** 注入块：久缺 + 过热 + 均衡铁律（零 token：关闭或无档案时返回空串）。 */
  /**
   * 因果登场仲裁器 (FateLoom Director 缝合 + 防全知硬拦截)
   * 支持场景词强命中登场与不在场痕迹（熟人/物品）轻提，防全知穿帮校验
   */
  function resolveIntervention(ctx) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: true, reason: 'disabled' };
    ctx = ctx || {};
    if (ctx.busy) {
      return { ok: true, action: 'skip', reason: 'busy-scene', note: '当前场景在激烈冲突中，避让强插人员' };
    }
    const idleList = idle(cfg.idleThreshold).rows || [];
    if (!idleList.length) {
      return { ok: true, action: 'none', reason: 'no-idle-characters' };
    }
    const inScene = Array.isArray(ctx.inScene) ? ctx.inScene : [];
    const eligible = idleList.filter(function (r) { return inScene.indexOf(r.who) < 0; });
    if (!eligible.length) {
      return { ok: true, action: 'none', reason: 'all-idle-in-scene' };
    }
    const target = eligible[0];
    const who = target.who;
    const scenes = (ctx.registeredScenes && Array.isArray(ctx.registeredScenes[who])) ? ctx.registeredScenes[who] : [];
    const currLoc = String(ctx.currentLocation || '').trim();

    // 1. 强介入：场景词命中
    const sceneHit = currLoc && scenes.some(function (s) { return s && currLoc.indexOf(s) >= 0; });
    if (sceneHit) {
      return {
        ok: true,
        action: 'scene-hit-entry',
        target: who,
        missed: target.missed,
        location: currLoc,
        cue: '角色在其常驻活动圈内自然现身',
        epistemicSafe: true
      };
    }

    // 2. 弱介入：轻提 (Presence Trace)
    //   v2.545.0（引擎深度第一批·4）：轻提前先过 followup-gate 的静默阈值。
    //   治什么：本口原来只要「missed 够多」就每轮轻提一次，于是读者读到的是
    //   「刚见过的人又被顺口带一句」——催办感。followup-gate 回答的正是
    //   「什么都没发生、只是很久没动静了，谁该先开口、多久、一天最多几次」。
    //   本口只问 due，**不在这里 fire**：这个函数被测试与面板当只读探针调，写账会污染读数。
    //   v2.548.0 起 fire 落在 buildBlock 里「真的要提」的那一处（注入构建侧、幂等），
    //   于是 due 的「今天已提过 / 每日上限」两道闸第一次有账可判。
    const gateAt = clockNow('spotlight.followup');
    let gateLevel = 'light', gateChase = 0;
    if (WA.followupGate && typeof WA.followupGate.due === 'function') {
      const lastAt = Number(target.at) || 0;
      const idleMinutes = lastAt > 0 ? Math.max(0, Math.round((gateAt - lastAt) / 60000)) : 99999;
      const gate = WA.followupGate.due({ item: who, idleMinutes: idleMinutes, at: gateAt });
      if (gate && gate.level) gateLevel = gate.level;
      if (gate && Number(gate.chase) > 0) gateChase = Number(gate.chase);
      if (!gate || gate.ok !== true) {
        return {
          ok: true,
          action: 'none',
          reason: 'followup-hold',
          target: who,
          missed: target.missed,
          idleMinutes: idleMinutes,
          gateReason: (gate && gate.reason) || 'no-gate-result'
        };
      }
    }
    const rels = (ctx.relations && Array.isArray(ctx.relations[who])) ? ctx.relations[who] : [];
    const presentAcquaintances = inScene.filter(function (p) { return rels.indexOf(p) >= 0; });

    // 防全知硬拦截：若外部指定了提及者，但他与目标角色并无认知/社交确凿交集，拒收
    if (ctx.mentioner && rels.indexOf(ctx.mentioner) < 0) {
      noteFault('epistemic-leak-blocked');
      return {
        ok: false,
        reason: 'epistemic-leak-blocked',
        target: who,
        mentioner: ctx.mentioner,
        note: '在场提及者与目标角色无确立认知/人际关系，拒绝生成穿帮轻提'
      };
    }

    const traces = (ctx.registeredTraces && ctx.registeredTraces[who]) || {};
    const items = Array.isArray(traces.items) ? traces.items : [];
    const cue = presentAcquaintances.length > 0
      ? '不让他本人出场，可由在场的熟人（' + presentAcquaintances.join('、') + '）顺口带一句'
      : (items.length > 0 ? '不让他本人出场，仅呈现其遗留痕迹（' + items[0] + '）' : '保持场外，不强行插入');

    return {
      ok: true,
      action: 'presence-trace',
      target: who,
      missed: target.missed,
      level: gateLevel,
      chase: gateChase,
      allowedSpeakers: presentAcquaintances.slice(),
      itemTrace: items[0] || null,
      cue: cue,
      epistemicSafe: true
    };
  }

  function buildBlock(opt) {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const all = rows();
    if (!all.length) return '';
    const idleList = all.filter(function (r) { return (r.missed || 0) >= cfg.idleThreshold; })
      .sort(function (a, b) { return b.missed - a.missed; }).slice(0, 4);
    const hotList = all.filter(function (r) { return (r.streak || 0) >= cfg.hotStreak; })
      .sort(function (a, b) { return b.streak - a.streak; }).slice(0, 3);
    const lines = ['[焦点分配] 登场均衡读数：'];
    if (idleList.length) lines.push('· 久未登场：' + idleList.map(function (r) { return r.who + '（缺 ' + r.missed + ' 轮）'; }).join('、'));
    if (hotList.length) lines.push('· 连续在场：' + hotList.map(function (r) { return r.who + '（连 ' + r.streak + ' 轮）'; }).join('、'));
    // v2.548.0：轻提三分级 —— resolveIntervention 的第一个产品消费者。
    //   只提**最该被提的那一个**：这里不是名单渲染器，一行就够。
    //   三种措词对应 followupGate 的 level：light 随口提、medium 只留痕迹、
    //   heavy 不再主动开口。heavy 仍然写进去：「别让他开口」是一条约束，
    //   不是没有提示（没有提示时模型会自己猜「该轮到他了吧」）。
    const traces = [];
    if (idleList.length) {
      const o = opt || {};
      let res = null;
      try {
        res = resolveIntervention({ busy: !!o.busy, inScene: Array.isArray(o.inScene) ? o.inScene : [],
          mentioner: o.mentioner, relations: o.relations, registeredTraces: o.registeredTraces });
      } catch (e) { noteFault('trace-exception'); }
      if (res && res.ok === true && res.action === 'presence-trace' && res.target) {
        const lvl = (res.level === 'medium' || res.level === 'heavy') ? res.level : 'light';
        const missed = Number(res.missed) || 0;
        if (lvl === 'light') lines.push('· 顺口提一句：' + res.target + '（缺 ' + missed + ' 轮）—— 一句带过即可，不必让他本人出场');
        else if (lvl === 'medium') lines.push('· 只留痕迹：' + res.target + '（缺 ' + missed + ' 轮）—— 由在场的熟人带一句，不给他台词');
        else lines.push('· 暂不打扰：' + res.target + '（缺 ' + missed + ' 轮）—— 这一轮别让他主动开口，等玩家去找');
        let fired = null;
        // fire 是幂等的（同日同人只记一次），所以落在构建侧不会因为
        //   「一次生成里构建两次」而多吃日额度；不落账则 due 的
        //   「今天已提过」与「每日上限」两道闸永远没有账可判。
        try { if (WA.followupGate && typeof WA.followupGate.fire === 'function') fired = WA.followupGate.fire(res.target, clockNow('spotlight.fire')); }
        catch (e) { noteFault('fire-exception'); }
        traces.push({ who: res.target, level: lvl, missed: missed, fired: !!(fired && fired.ok === true) });
        stat.lastTrace = traces[traces.length - 1];
      } else if (res && res.ok === true && res.action === 'none') {
        stat.lastTrace = { who: '', level: '', missed: 0, fired: false, hold: res.reason || 'none' };
      } else if (res && res.ok === false) {
        noteFault(res.reason || 'trace-refused');
      }
    }
    lines.push('均衡铁律：各角色有自己的事务与目的，不强制人人表态，也不让配角只负责附和；镜头外的角色可以继续与主线无关的活动，交集必须具有合理的因果来源。');
    return lines.join('\n') + '\n';
  }
  /**
   * EXV29-12（v2.524.0）：公平尺 —— 谁最久没被点到，下一轮就该轮到谁。
   *   `list: [{who, lastRound}]`（调用方给"上次被点到是第几轮"），`round` 是当前轮。
   *   入参优先于内部账：这样它不依赖别的引擎怎么写存档，判据仍是可核的。
   */
  function fairness(list, round) {
    const arr = Array.isArray(list) ? list : [];
    if (!arr.length) return { ok: false, reason: 'missing-fields', missing: ['list'] };
    const cur = isFinite(Number(round)) ? Number(round) : 0;
    const rows = arr.map(function (p) {
      const who = String((p && p.who) || '').trim();
      if (!who) return null;
      const last = isFinite(Number(p.lastRound)) ? Number(p.lastRound) : -9999;
      return { who: who, lastRound: last, idle: (last === -9999) ? 9999 : (cur - last) };
    }).filter(Boolean);
    if (!rows.length) return { ok: false, reason: 'missing-fields', missing: ['who'] };
    rows.sort(function (a, b) { return (b.idle - a.idle); });
    const top = rows[0];
    return {
      ok: true, reason: 'ok', due: top.who, idle: top.idle, rows: rows,
      why: top.idle === 9999 ? (top.who + ' 一次都没被点到：这一轮该他') : (top.who + ' 已经 ' + top.idle + ' 轮没被点到：这一轮该他'),
      starved: rows.filter(function (r) { return r.idle >= 3; }).length
    };
  }

  WA.spotlight = {
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    note: note, seal: seal, report: report, idle: idle, resolveIntervention: resolveIntervention, buildBlock: buildBlock,
    fairness: fairness,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();
/**
 * WorldAxis engines/floor-changes.js (v2.50.0) — 楼层变更联动账（纯只读）
 *
 * 缝合来源：
 *   · Nocturne Memory 的 change-rollback 口径——「源被改写了，下游派生数据必须知道」；
 *   · Luker 的 World Info Activation Trace 反向用法——它记「注入了什么」，本引擎记
 *     「注入/入账所依据的楼层后来被删或改了」。
 *
 * 本仓为什么需要它（v2.49.0 收口时实测）：
 *   全库零订阅 `MESSAGE_DELETED` / `MESSAGE_EDITED`。但判据**早就有了**：
 *   `engines/timeline.js::auditRefs(refs)` 能算出 `missing`（楼层已删）/`changed`
 *   （内容被编辑/重roll），消费端在 `engines/inspector-state.js::checkRefs`
 *   （产出 `refs.missing` / `refs.changed` 两条 warn）与 `ui/panel.js::_msAudit`。
 *   也就是说：**有判据、无处置**——
 *     楼层被删后：记忆 L0~L3 的引用、`facts`、伏笔链接、`entityMemory` 来源、纪事
 *     `chronicle` 全都还指着已经不存在的楼层；`currents`（暗流）仍停在那个未来；
 *     而面板上只是多两条 warn，没人回收。
 *
 * 本引擎的职责边界（**刻意只做一半**）：
 *   它**不**去删记忆、**不**改 `currents`、**不**动 store。原因是：自动回收派生数据
 *   是本仓数据一致性最重的一刀，一旦判据有偏差就会**不可逆地删掉用户的世界**。
 *   所以本版把「发现 → 归类 → 出处置计划」做实，「执行」留给显式动作（见下）。
 *
 * v2.50.0 的第二层：**与 settleGuard 对账**。
 *   删楼/编辑楼层与「回退重玩（rewind）」在宿主侧看起来很像（都是 floor 变小/内容变），
 *   而 `core/settle-guard.js` 对 rewind 的口径是**跳过世界推进**（防重复结算）。
 *   两套口径若不比对，就会出现「守卫说这是 rewind 不用管，变更账说这是删除要回收」的
 *   互相打脸。本引擎因此把 settleGuard 的判定结果**原样引用**并显式标注一致性：
 *     · consistent   —— 双方都认为「楼层没了/变了」
 *     · rewind-only  —— 守卫判 rewind（楼层变小但**楼层仍存在**），变更账无 missing ⇒ 正常
 *     · guard-blind  —— 变更账有 missing，但守卫本轮判了 settle（可能正在把新路径吸收进来）
 *   三种结论都可能正确，**不判谁对**，只把分歧摆出来（否则就是替调用方猜）。
 *
 * 三条铁律：
 *   ① 纯只读：不写 store、不改 currents/facts/memory；
 *   ② 三态如实：'unsupported'（宿主无删除/编辑事件）≠ 'awaiting'（已订阅未派发）
 *      ≠ 'quiet'（派发了但没有缺失）≠ 'found'（真检出缺失/改动）；
 *   ③ 时序走 clockWall（测量时间），本引擎**不进存档**。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  const MAX_EVENTS = 20;      // 变更事件环形
  const MAX_LIST = 40;        // 单次清单上限（面板/摘要不刷屏）

  const clean = function (v) { return String(v == null ? '' : v).trim(); };
  function safe(fn, fb) { try { const v = fn(); if (v !== undefined) return v; } catch (e) {} return fb === undefined ? null : fb; }
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  let __state = 'awaiting';       // unsupported | awaiting | quiet | found
  let __subscribed = false;
  let __events = [];              // {at, kind:'deleted'|'edited', floor, mesLen, hash}
  let __lastPlan = null;
  let __planEpoch = 0;            // 计划签名（同一状态下不重复算，省开销也防抖动）

  /** 订阅回报（由 core/interceptor.js 调用；本引擎不自己挂宿主） */
  function markSubscribed(how) {
    // v2.50.0 修：同 host-wb-trace.js —— `unsupported` 是本次挂接尝试的环境事实，
    //   历史上订阅成功过不得豁免它（否则「宿主不再给删楼/改楼事件」会被显示成
    //   「已订阅，尚未盘点」）。
    if (how === 'subscribed') { __subscribed = true; if (__state === 'unsupported') __state = 'awaiting'; }
    else { __subscribed = false; __state = 'unsupported'; }
    return __state;
  }

  /**
   * 记录一次楼层变更事件。
   * 宿主事件回调通常只给 index/message；这里只做「记下来」，不做判断——
   * 判断统一走 plan()（单一路径，避免事件路径与轮询路径给出两种结论）。
   */
  function onFloorEvent(kind, payload) {
    try {
      const k = (kind === 'deleted' || kind === 'edited') ? kind : clean(kind) || 'edited';
      const p = payload || {};
      const mes = (p.message && typeof p.message.mes === 'string') ? p.message.mes : (typeof p.mes === 'string' ? p.mes : '');
      __events.push({
        at: clockWall(), kind: k,
        floor: (typeof p.index === 'number') ? p.index : (typeof p.floor === 'number' ? p.floor : null),
        mesLen: mes.length,
        hash: mes ? safe(function () { return WA.timeline.hashText(mes); }, '') : ''
      });
      while (__events.length > MAX_EVENTS) __events.shift();
      __planEpoch++;
      return true;
    } catch (e) { return false; }
  }

  /**
   * 明细盘点：把 store 里**所有引用楼层**的派生数据扫一遍，按来源分类。
   * 复用 `inspector-state.js::checkRefs` 的同一份扫描面口径（l0~l3 / smallSummaries /
   * foreshadows.links / entityMemory[type][i].refs / chronicle[].refs），但**逐条定位**，
   * 因为处置计划需要知道「是哪一条」，而不只是「有几条」。
   */
  function sweep(state) {
    const st = state || safe(function () { return WA.store.get(); }, null);
    const mem = (st && st.memory) || {};
    const scan = [];
    ['l0', 'l1', 'l2', 'l3'].forEach(function (tier) {
      (mem[tier] || []).forEach(function (entry, i) {
        // 摘要条目的正文键是 `s`（不是 summary/text）——漏了它，缺失清单里的「哪一条」就没有
        // 可读标签，用户只能看到 `l2#0` 这种下标（判据 [D2b] 当场现形）。三个键都兜。
        if (entry && Array.isArray(entry.refs) && entry.refs.length) scan.push({ where: tier + '#' + i, label: clean(entry.title || entry.summary || entry.s || '').slice(0, 20), refs: entry.refs });
      });
    });
    (mem.smallSummaries || []).forEach(function (entry, i) {
      if (entry && Array.isArray(entry.refs) && entry.refs.length) scan.push({ where: 'small#' + i, label: clean(entry.title || entry.summary || entry.s || '').slice(0, 20), refs: entry.refs });
    });
    (mem.foreshadows || []).forEach(function (f, i) {
      if (f && Array.isArray(f.links) && f.links.length) scan.push({ where: 'foreshadow#' + i, label: clean(f.title || f.name || '').slice(0, 20), refs: f.links });
    });
    const em = (st && st.evolution && st.evolution.entityMemory) || {};
    Object.keys(em).forEach(function (type) {
      if (type === '_index') return;
      (em[type] || []).forEach(function (entity, i) {
        if (entity && Array.isArray(entity.refs) && entity.refs.length) scan.push({ where: 'entity:' + type + '#' + i, label: clean(entity.name || '').slice(0, 20), refs: entity.refs });
      });
    });
    (st && st.chronicle || []).forEach(function (c, i) {
      if (c && Array.isArray(c.refs) && c.refs.length) scan.push({ where: 'chronicle#' + i, label: clean(c.title || c.name || c.text || '').slice(0, 20), refs: c.refs });
    });

    const missing = [], changed = [], scanned = { sites: scan.length, refs: 0, inherited: 0, synthetic: 0 };
    for (let i = 0; i < scan.length; i++) {
      const item = scan[i];
      const audit = safe(function () { return WA.timeline.auditRefs(item.refs); }, null);
      if (!audit) continue;                                  // 算不出来：跳过（不当成「没有」）
      if (audit.inherited || audit.synthetic) { scanned.inherited += (audit.inherited ? 1 : 0); scanned.synthetic += (audit.synthetic ? 1 : 0); continue; }
      scanned.refs += (audit.refs || []).length;
      if ((audit.missing || []).length) missing.push({ where: item.where, label: item.label, count: audit.missing.length, floors: audit.missing.map(function (r) { return r.layer; }).slice(0, 8) });
      if ((audit.changed || []).length) changed.push({ where: item.where, label: item.label, count: audit.changed.length, floors: audit.changed.map(function (c) { return (c.after || c.before || {}).layer; }).slice(0, 8) });
    }
    return { scanned: scanned, missing: missing.slice(0, MAX_LIST), changed: changed.slice(0, MAX_LIST), scannedAt: clockNow('floorChanges.sweep') };
  }

  /**
   * 与 core/settle-guard.js 对账。
   * 只读调用守卫**已暴露**的 stat()/peekForce()；守卫缺失时 conclusively 报 'no-guard'
   * （而不是默认「一致」——那等于替守卫签了字）。
   */
  function guardReconcile(sweepResult) {
    const g = WA.settleGuard;
    if (!g || typeof g.stat !== 'function') {
      return { available: false, verdict: 'no-guard', reason: '守卫未加载（无可对账对象——不视为一致）' };
    }
    const gs = safe(function () { return g.stat(); }, null);
    if (!gs) return { available: false, verdict: 'unreadable', reason: '守卫 stat() 读取失败（不推测其判定）' };
    const hasMissing = !!(sweepResult && sweepResult.missing && sweepResult.missing.length);
    const hasChanged = !!(sweepResult && sweepResult.changed && sweepResult.changed.length);
    const reason = clean(gs.lastReason);
    let verdict, note;
    if (hasMissing) {
      // 变更账说「有楼层没了」。守卫那边三种可能，语义完全不同：
      if (reason === 'rewind') { verdict = 'guard-blind'; note = '守卫本轮判 rewind（跳过世界推进）而变更账检出楼层缺失——回退重玩时旧路径楼层被删属预期，但派生数据仍指着旧楼层，需人工确认后才回收'; }
      else if (reason === 'new-floor' || reason === 'fresh' || reason === 'settled' || reason === 'forced') { verdict = 'consistent'; note = '守卫已按新楼层结算，缺失引用属「旧路径残留」，与 settler 口径不冲突'; }
      else { verdict = 'divergent'; note = '守卫判 ' + (reason || '(未记录)') + '，变更账检出缺失——两套口径不一致，回收前必须人工判断谁是当前真相'; }
    } else if (hasChanged) {
      verdict = 'changed-only';
      note = '无楼层缺失，但有内容被编辑/重roll——无需回收，但依赖这些内容推导出的摘要/事实可能已过时（不自动改）';
    } else {
      verdict = 'clean';
      note = '变更账无缺失、无改动';
    }
    return { available: true, verdict: verdict, note: note, guard: { lastReason: gs.lastReason, lastSettle: gs.lastSettle, skips: gs.skips } };
  }

  /**
   * 出处置计划（只读：只描述该做什么，不做）。
   * 每条动作都带 `needConfirm`——本版**全部**为 true：没有一条自动执行。
   */
  function plan(state) {
    const sw = sweep(state);
    const rec = guardReconcile(sw);
    const actions = [];
    if (sw.missing.length) {
      actions.push({
        act: 'pruneRefs', needConfirm: true,
        scope: sw.missing.map(function (m) { return m.where; }).slice(0, MAX_LIST),
        detail: sw.missing.length + ' 处派生数据引用了已删除楼层（' + sw.missing.reduce(function (n, m) { return n + m.count; }, 0) + ' 个引用）——选项：整条删除 / 仅摘除失效 refs / 保留待人工核对'
      });
    }
    if (sw.changed.length) {
      actions.push({
        act: 'recheckDerived', needConfirm: true,
        scope: sw.changed.map(function (m) { return m.where; }).slice(0, MAX_LIST),
        detail: sw.changed.length + ' 处派生数据所依据的楼层内容已被编辑/重roll（' + sw.changed.reduce(function (n, m) { return n + m.count; }, 0) + ' 个引用）——摘要/事实可能已过时'
      });
    }
    if ((rec.verdict === 'guard-blind' || rec.verdict === 'divergent') && actions.length) {
      actions.push({ act: 'settleGuardReconcile', needConfirm: true, scope: ['settleGuard'], detail: rec.note });
    }
    const out = {
      at: clockNow('floorChanges.plan'),
      state: sw.missing.length ? 'found' : (sw.changed.length ? 'changed' : 'quiet'),
      events: __events.slice(-6),
      scanned: sw.scanned,
      missing: sw.missing,
      changed: sw.changed,
      guard: rec,
      actions: actions,
      executable: false,          // 本版**不提供**自动执行：回收是不可逆动作
      note: actions.length
        ? '检出 ' + actions.length + ' 项待处置（均为 needConfirm：本版不自动回收，回收会不可逆地删掉用户的世界）'
        : '无待处置项'
    };
    __lastPlan = out;
    if (out.state === 'found') __state = 'found';
    else if (out.state === 'quiet' && __state !== 'found') __state = 'quiet';
    return out;
  }

  /** 三态+读文案（消费端不得自造语义） */
  function stateText() {
    if (__state === 'unsupported') return '宿主未提供楼层删除/编辑事件（此面不可观测：不是「没人删楼」，是「无从得知」）';
    const last = __lastPlan;
    if (!last) return '已订阅楼层变更事件，尚未盘点';
    if (last.state === 'found') return '楼层变更：' + last.missing.length + ' 处派生数据引用已删楼层（未自动回收，待确认）';
    if (last.state === 'changed') return '楼层变更：无缺失，' + last.changed.length + ' 处所依据内容被编辑/重roll';
    return '楼层变更：无缺失、无改动';
  }

  function stat() {
    return {
      state: __state,
      subscribed: __subscribed,
      events: __events.length,
      lastEvents: __events.slice(-6),
      lastPlan: __lastPlan ? {
        state: __lastPlan.state, missing: __lastPlan.missing.length, changed: __lastPlan.changed.length,
        actions: __lastPlan.actions.length, guard: __lastPlan.guard.verdict, at: __lastPlan.at
      } : null
    };
  }

  function reset() { __events = []; __lastPlan = null; __planEpoch++; if (__state === 'found' || __state === 'quiet') __state = 'awaiting'; return true; }

  WA.floorChanges = {
    MAX_EVENTS, MAX_LIST,
    markSubscribed, onFloorEvent, sweep, guardReconcile, plan,
    stat, stateText, reset,
    __state: function () { return __state; }
  };
  if (WA.log) WA.log('info', '楼层变更联动账已加载（只读；回收动作一律待确认）');
})();

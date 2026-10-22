/**
 * WorldAxis engines/floor-settle.js (v2.231.0) — OPT-5：楼层结算账（重掷/删楼不残留旧状态）
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   计划 OPT-5 原文：「建立消息与实际结算变更的绑定，由明确的应用层处理补丁及关联操作；
 *   当前楼重掷、删最后楼优先形成可用闭环……明确重载后的可恢复范围。」
 *
 *   现场事实（本版开工前逐条复核）：
 *     · `engines/floor-snapshot.js::rollback` **只返回一份白名单补丁**（`{patch, untouched}`），
 *       全函数零 `store.transact` —— 它算得出「该退回什么」，却**没有任何人把它写回去**。
 *       于是「重掷之后旧版本扣的钱、关系变化、身体状态还在」这件事在代码里**根本没有出口**。
 *     · `engines/floor-changes.js` 会记「哪一楼被删/被改」，但它**刻意只做一半**：
 *       只出处置计划（`executable:false`），不碰 store。它答的是「派生数据过时了没有」，
 *       不答「这一楼结算过的世界变化要不要退」。
 *     · `core/settle-guard.js` 只保证「同一楼层世界推进至多一次」，它**不记录改了什么**，
 *       所以「跳过第二次结算」与「退回第一次结算」是两件事，前者做完了，后者一行都没有。
 *   三者合起来就是本仓最贵的一类静默失真：**世界状态与它据以产生的那一楼脱钩了**，
 *   而面板、诊断、健康分都显示正常。
 *
 * ── 机制（三句话）────────────────────────────────────────────────
 *   ① **记账在轮边界**：`beginRound()` 在生成前抓一份世界键快照（只抓顶层键、只抓可序列化值），
 *      `endRound()` 在 after 链跑完后逐键比对，把「这一楼真正改了哪些键、改前是什么」写进
 *      `store.floorSettle.entries`。记账**跟着存档走**，所以重载后仍能退（这正是
 *      `floorSnapshot` 用模块内存 RING 做不到的那一半）。
 *   ② **退回是显式动作**：`rollback(floor)` 才写 store，且**逐键判「还是当初那一版吗」**——
 *      当前值与记账里的 after 指纹一致才退回；被后续楼层改过的键**不动并报冲突**。
 *      「只改几个字段冒充整个世界回退」是本项点名要挡的形态，故冲突必须如实报出。
 *   ③ **中间楼只出范围不擅自动手**：删掉的不是最后一楼时，`onFloorEvent('deleted')` 只算
 *      「后面还有几楼、动了哪些键」（`scopeOf`），要退得显式调 `rollbackFrom`。
 *      删最后一楼才是安全的自闭环（后面没有楼层依赖它）。
 *
 * ── 六条否定式边界（都有判据咬）──────────────────────────────────
 *   ① 总开关关闭 ⇒ 记/退一律拒收 `disabled`（不记也不退，不猜）。
 *   ② **无聊天不记**：`no-chat` —— 没有楼层就没有「这一楼」，凭空上下文记账会把
 *      不同会话的变化混成一笔。
 *   ③ **换聊天不套补丁**：记账带 `chatId`，`rollback` 在 chatId 不符时拒收 `other-chat`
 *      （「换聊天不能应用另一个聊天的补丁」是验收原文）。
 *   ④ **同楼重掷才自动退**：`beginRound()` 见到「同一楼层、同一指纹、仍 live」的记账才自动
 *      退回（那正是重掷）；指纹不同（楼层被编辑过）只标 `stale` 交人决定，不擅自回退。
 *   ⑤ **被后续楼层改过的键不退**：`rollback` 逐键比对 after 指纹，不一致进 `conflicts`。
 *   ⑥ **记不下就说记不下**：单键序列化超过 `maxKeyChars` ⇒ 进 `skipped` 并计数，
 *      **不**假装退得回去（「假成功」比「记不下」贵得多）。
 *
 * ── 与既有模块的分工（三者不互相替代）──────────────────────────────
 *   · `floorSnapshot` —— 面板字段级快照（FIELDS 白名单，只读补丁）；
 *   · `floorChanges`  —— 「派生数据依据的楼层没了/变了」的只读盘点与处置计划；
 *   · `settleGuard`   —— 「同一楼只结算一次」的守卫；
 *   · 本模块          —— **这一楼结算改了哪些世界键 + 怎么退**（唯一写回者）。
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function (site) { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_floor_settle_settings_v1';
  const DEF = { enabled: true, maxFloors: 16, maxKeyChars: 120000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'floorSettle',
    bounds: { maxFloors: [2, 64], maxKeyChars: [2000, 800000] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // 不入账的顶层键：
  //   meta        —— 每轮 contextSize 都在动，它不是「结算」，记进来会把每楼都标成脏；
  //   floorSettle —— 记账自己（自指会让每笔记账都把上一笔判成变化）。
  const EXCLUDE = ['meta', 'floorSettle'];
  const STATES = ['live', 'rolled-back', 'stale'];

  const stat = { rounds: 0, journaled: 0, skippedKeys: 0, dropped: 0,
    rolledBack: 0, restoredKeys: 0, conflicts: 0, stale: 0, refused: 0, faults: {}, lastReason: '' };

  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; stat.lastReason = r; }
  function refuse(r) { stat.refused++; noteFault(r); return { ok: false, reason: r }; }

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus
      ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    if (!WA.settingsBus) return Object.assign({}, DEF, next || {});
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }

  function state() { try { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { return {}; } }
  function hash(s) { try { return WA.store.fnv1a(s); } catch (e) { return String(s).length + ':' + String(s).slice(0, 16); } }
  function clone(v) { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return null; } }
  function bucket(draft) {
    if (!draft.floorSettle || typeof draft.floorSettle !== 'object' || Array.isArray(draft.floorSettle)) {
      draft.floorSettle = { entries: [] };
    }
    if (!Array.isArray(draft.floorSettle.entries)) draft.floorSettle.entries = [];
    return draft.floorSettle;
  }
  function entries() {
    const b = state().floorSettle;
    return (b && Array.isArray(b.entries)) ? b.entries : [];
  }
  function chatCtx() {
    try {
      const w = WA.mainWin || (typeof window !== 'undefined' ? window : null);
      const st = w && w.SillyTavern;
      return (st && st.getContext) ? st.getContext() : null;
    } catch (e) { return null; }
  }
  function chatId() {
    try { return WA.store && WA.store.chatId ? (WA.store.chatId() || 'no-chat') : 'no-chat'; }
    catch (e) { return 'no-chat'; }
  }
  function floorNow() {
    const c = chatCtx();
    const chat = c && c.chat;
    if (!chat || !chat.length) return null;
    return chat.length - 1;
  }
  function sigNow() { try { return WA.store.floorSig(); } catch (e) { return 'no-sig'; } }

  /** 顶层世界键的浅快照（逐键深拷贝；不可序列化的键直接跳过并计数）。 */
  function snapshot() {
    const s = state();
    const out = {};
    Object.keys(s).forEach(function (k) {
      if (EXCLUDE.indexOf(k) >= 0) return;
      if (typeof s[k] === 'function') return;
      const c = clone(s[k]);
      if (c === null && s[k] !== null) return;
      out[k] = c;
    });
    return out;
  }

  let __pending = null;      // {floor, sig, chatId, at, snap}（**只在内存**：它只是本轮基线）
  let __lastRollback = null; // 最近一次退回报告（面板/诊断读）

  /**
   * 逐键比对出「这一楼改了什么」。
   * 返回 {keys:{k:{before,h,had,gone}}, skipped:[k]}；`h` 是**改后**值的指纹，
   * 退回时用它判「当前值还是当初那一版吗」。
   * `had` = 这一楼开始前该键**存在与否**：不存在 ⇒ 退回时必须**删掉**整键，
   * 而不是写一个 null 进去（`weather: null` 与「从来没有过 weather」在面板与
   * 注入上长得不一样，是本仓反复治的「空值冒充缺失」同族）。
   */
  function diffOf(before, after) {
    const cfg = settings();
    const keys = {}; const skipped = [];
    Object.keys(after).forEach(function (k) {
      const a = JSON.stringify(after[k]);
      const had = Object.prototype.hasOwnProperty.call(before, k);
      const b = had ? JSON.stringify(before[k]) : null;
      if (a === b) return;
      if (a && a.length > cfg.maxKeyChars) { skipped.push(k); return; }
      keys[k] = { before: had ? before[k] : null, had: had, h: hash(a), gone: false };
    });
    Object.keys(before).forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(after, k)) return;
      const b = JSON.stringify(before[k]);
      if (b && b.length > cfg.maxKeyChars) { skipped.push(k); return; }
      keys[k] = { before: before[k], had: true, h: null, gone: true };   // 这一楼把整键删掉了
    });
    return { keys: keys, skipped: skipped };
  }

  /**
   * 轮开始：抓基线。若本楼已有「同楼同指纹仍 live」的记账（= 重掷），**先退回它**再抓基线 ——
   * 顺序不能反：先抓再退，新基线就含旧结算，退回等于没退。
   */
  function beginRound() {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const floor = floorNow();
    if (floor == null) return refuse('no-chat');
    const sig = sigNow();
    const cid = chatId();
    let reconciled = null;
    const same = entries().filter(function (e) { return e && e.floor === floor && e.state === 'live'; });
    if (same.length) {
      const rec = same[same.length - 1];
      if (rec.sig === sig) {
        const r = rollback(floor, { why: 'reroll' });
        reconciled = { state: 'rolled-back', ok: !!r.ok, restored: r.restored || 0, conflicts: r.conflicts || 0 };
      } else {
        // 楼层被编辑过：指纹不同 ⇒ 不擅自回退（口径 ④）
        try {
          WA.store.transact(function (draft) {
            const list = bucket(draft).entries;
            for (let i = 0; i < list.length; i++) {
              if (list[i] && list[i].floor === floor && list[i].state === 'live') list[i].state = 'stale';
            }
            return true;
          }, 'floorSettle:stale');
        } catch (e) { /* 标脏失败不影响本轮记账 */ }
        stat.stale++;
        reconciled = { state: 'stale', ok: false };
      }
    }
    __pending = { floor: floor, sig: sig, chatId: cid, at: clockWall('floorSettle.begin'), snap: snapshot() };
    stat.rounds++;
    return { ok: true, reason: 'ok', floor: floor, sig: sig, chatId: cid, reconciled: reconciled };
  }

  /** 轮结束：把本轮真实改动的世界键写进存档账（跟着存档走 ⇒ 重载后仍退得回去）。 */
  function endRound() {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    if (!__pending) return refuse('no-begin');
    const p = __pending;
    const after = snapshot();
    const d = diffOf(p.snap, after);
    const keyNames = Object.keys(d.keys);
    if (!keyNames.length) {
      __pending = null;
      return { ok: true, reason: 'no-change', floor: p.floor, changed: 0, keys: [], skipped: d.skipped };
    }
    const entry = {
      floor: p.floor, sig: p.sig, chatId: p.chatId, at: clockNow('floorSettle.end'),
      keys: d.keys, skipped: d.skipped.slice(0, 12), changed: keyNames.length, state: 'live'
    };
    const r = WA.store.transact(function (draft) {
      const b = bucket(draft);
      b.entries.push(entry);
      // 环形上限：超 cap 从最旧丢；丢了要**说出来**（stat.dropped），不静默。
      while (b.entries.length > cfg.maxFloors) { b.entries.shift(); stat.dropped++; }
      return true;
    }, 'floorSettle:end');
    __pending = null;
    if (!r || r.ok === false) return { ok: false, reason: 'write-failed', floor: p.floor, changed: 0, keys: keyNames };
    stat.journaled++;
    stat.skippedKeys += d.skipped.length;
    return { ok: true, reason: 'ok', floor: p.floor, changed: keyNames.length, keys: keyNames, skipped: d.skipped };
  }

  /**
   * 退回某一楼的结算。逐键判「还是当初那一版吗」：一致才退，不一致进 conflicts 不动。
   * 显式动作（面板/删楼自闭环调用），不是 beginRound 的副作用。
   */
  function rollback(floor, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const n = Number(floor);
    if (!isFinite(n)) return refuse('bad-floor');
    const o = opts || {};
    const cid = chatId();
    const live = entries().filter(function (e) {
      return e && e.floor === n && e.state === 'live';
    });
    if (!live.length) return refuse('no-entry');
    const rec = live[live.length - 1];
    if (rec.chatId && rec.chatId !== cid) return refuse('other-chat');   // 口径 ③
    const cur = state();
    const plan = { restored: 0, conflicts: [], gone: [] };
    Object.keys(rec.keys || {}).forEach(function (k) {
      const r = rec.keys[k];
      const has = Object.prototype.hasOwnProperty.call(cur, k);
      const curH = has ? hash(JSON.stringify(cur[k])) : null;
      if (curH !== r.h) { plan.conflicts.push(k); return; }               // 被后续楼层改过 ⇒ 不动
      // 退回方向由 `had` 定：这一楼开始前**有**该键 ⇒ 写回改前的值；
      // 这一楼开始前**没有** ⇒ 删掉整键（写 null 会把「从来没有过」冒充成「有个空值」）。
      if (r.had) plan.restored++; else plan.gone.push(k);
    });
    if (!plan.restored && !plan.gone.length) {
      stat.conflicts += plan.conflicts.length;
      return { ok: false, reason: 'all-conflict', floor: n, restored: 0, conflicts: plan.conflicts.length, keys: plan.conflicts };
    }
    const w = WA.store.transact(function (draft) {
      Object.keys(rec.keys || {}).forEach(function (k) {
        if (plan.conflicts.indexOf(k) >= 0) return;
        const r = rec.keys[k];
        if (r.had) draft[k] = clone(r.before);
        else delete draft[k];
      });
      const b = bucket(draft);
      for (let i = 0; i < b.entries.length; i++) {
        if (b.entries[i] && b.entries[i].floor === n && b.entries[i].state === 'live') {
          b.entries[i].state = 'rolled-back';
          b.entries[i].rolledAt = clockNow('floorSettle.rollback');
        }
      }
      return true;
    }, 'floorSettle:rollback');
    if (!w || w.ok === false) return { ok: false, reason: 'write-failed', floor: n, restored: 0, conflicts: 0 };
    stat.rolledBack++;
    stat.restoredKeys += plan.restored + plan.gone.length;
    stat.conflicts += plan.conflicts.length;
    __lastRollback = { floor: n, restored: plan.restored + plan.gone.length, conflicts: plan.conflicts.length,
      why: o.why || 'explicit', at: clockNow('floorSettle.last') };
    return { ok: true, reason: 'ok', floor: n, restored: plan.restored + plan.gone.length,
      conflicts: plan.conflicts.length, keys: Object.keys(rec.keys || {}), conflictKeys: plan.conflicts };
  }

  /** 从某一楼起全部退回（中间楼被删后的显式选择）。倒序退，退完再让人确认新路径。 */
  function rollbackFrom(floor) {
    const n = Number(floor);
    if (!isFinite(n)) return refuse('bad-floor');
    const targets = entries()
      .filter(function (e) { return e && e.floor >= n && e.state === 'live'; })
      .map(function (e) { return e.floor; })
      .sort(function (a, b) { return b - a; });
    const out = [];
    for (let i = 0; i < targets.length; i++) out.push(rollback(targets[i], { why: 'from' }));
    return { ok: out.length > 0 && out.every(function (r) { return r.ok !== false; }),
      reason: out.length ? 'ok' : 'no-entry', floors: targets.length, reports: out };
  }

  /** 中间楼被删：只算「后面还有几楼、都动了什么」，不擅自回退。 */
  function scopeOf(floor) {
    const n = Number(floor);
    if (!isFinite(n)) return refuse('bad-floor');
    const down = entries().filter(function (e) { return e && e.floor > n && e.state === 'live'; });
    const keys = {};
    down.forEach(function (e) {
      Object.keys(e.keys || {}).forEach(function (k) { keys[k] = (keys[k] || 0) + 1; });
    });
    return { ok: true, reason: 'ok', floor: n, floors: down.length,
      rows: down.map(function (e) { return { floor: e.floor, changed: e.changed, sig: e.sig }; }),
      keys: Object.keys(keys).sort(), executable: false };
  }

  /** 宿主楼层事件：删最后一楼 ⇒ 自闭环退回；删中间楼 ⇒ 只出范围。 */
  function onFloorEvent(kind, payload) {
    const p = payload || {};
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    let floor = (typeof p.index === 'number') ? p.index : (typeof p.floor === 'number' ? p.floor : null);
    if (floor == null && p.args && p.args.length) {
      for (let i = 0; i < p.args.length; i++) {
        if (typeof p.args[i] === 'number' && isFinite(p.args[i])) { floor = p.args[i]; break; }
      }
    }
    if (floor == null) return refuse('no-floor');
    const tail = floorNow();
    const isLast = (tail == null) || (floor >= tail);
    if (kind === 'deleted' || kind === 'edited') {
      if (isLast) {
        const r = rollback(floor, { why: kind });
        return { ok: r.ok !== false, reason: r.reason, floor: floor, mode: 'self-close',
          restored: r.restored || 0, conflicts: r.conflicts || 0 };
      }
      const s = scopeOf(floor);
      return { ok: true, reason: 'scope', floor: floor, mode: 'scope',
        floors: s.floors, keys: s.keys, executable: false };
    }
    return refuse('bad-kind');
  }

  function list() {
    return entries().map(function (e) {
      return { floor: e.floor, sig: e.sig, chatId: e.chatId, at: e.at, changed: e.changed,
        state: e.state, keys: Object.keys(e.keys || {}), skipped: e.skipped || [],
        rolledAt: e.rolledAt || 0 };
    });
  }
  function view() {
    const cfg = settings();
    const rows = list();
    return { enabled: cfg.enabled, maxFloors: cfg.maxFloors, entries: rows.length,
      live: rows.filter(function (r) { return r.state === 'live'; }).length,
      floors: rows.map(function (r) { return r.floor; }), lastRollback: __lastRollback };
  }
  function statView() { return Object.assign({}, JSON.parse(JSON.stringify(stat))); }
  function resetStat() {
    Object.keys(stat).forEach(function (k) {
      if (k === 'faults') stat.faults = {}; else if (k === 'lastReason') stat.lastReason = '';
      else stat[k] = 0;
    });
    __lastRollback = null;
    return true;
  }
  function reset() {
    const n = entries().length;
    WA.store.transact(function (draft) { bucket(draft).entries = []; return true; }, 'floorSettle:reset');
    __pending = null; __lastRollback = null;
    return { ok: true, reason: 'ok', dropped: n };
  }

  WA.floorSettle = {
    getSettings: settings, setSettings: saveSettings,
    beginRound: beginRound, endRound: endRound,
    rollback: rollback, rollbackFrom: rollbackFrom, scopeOf: scopeOf, onFloorEvent: onFloorEvent,
    list: list, view: view, stat: statView, resetStat: resetStat, reset: reset,
    STATES: STATES, EXCLUDE: EXCLUDE
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/floor-settle.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'floorSettle 已加载（2.230.0）');
})();

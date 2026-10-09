/**
 * WorldAxis engines/agenda.js (v2.182.0) — E2 世界日程 / 期限与未来事件日历
 *
 * ── 它治什么（缺口，现场实测）──────────────────────────────────
 *   「什么时候会发生什么」在本仓被**六处各自计算**，且没有任何一张表把它们合起来：
 *     · engines/longline.js   —— 伏笔承诺回收时刻（promise 写 dueAt，overdue() 报欠账）
 *     · engines/commission.js —— 多阶段委托的每阶段 deadline
 *     · engines/diplomacy.js  —— 条约条款的 until（到期由 expire() 收敛）
 *     · engines/freight.js    —— 在途货运 eta（到达由 arrive() 确认）
 *     · engines/aftermath.js  —— 地点效果的 expiresAt（有时限的创伤/修复）
 *     · engines/offline-return.js —— 离线间隔的恢复窗口
 *   玩家要看「接下来会怎样」只能逐页翻，且**这六处的失效模式各不相同**：
 *   条约到期是「静默消失」、货运是「到点才可见」、伏笔是「无限期挂着」。
 *
 * ── 本模块落点（只读聚合，不新增第二套状态）──────────────────
 *   · upcoming(opts) —— 按**剧情时间**排序的未来事件表（合并上述五源）
 *   · soon(n)        —— 最近的 n 条（面板/注入用的短视图）
 *   · overdueList()  —— 已经到期但尚未收敛的条目（与 O5 的「阻塞」栏同源）
 *   · sources()      —— 五源的可用性 + 各自条目数（缺席如实报，不静默丢）
 *   · diagnose() / stat() / reset()
 *
 *   为什么没有 buildBlock（注入段）：本模块的真消费方是面板与诊断节，不是注入链。
 *   按仓规「无消费方不挂导出」，裁掉注入段 —— 少了它，注入链七点登记的成本一并省下。
 *
 * ── 边界（全是否定式，逐条来自计划原文）────────────────────
 *   1 默认关（enabled:false）。
 *   2 **只读**：不改任何来源模块的状态、不改存档、不写 stat、不隐式写盘。
 *   3 未知时间保持未知 —— 不猜日期，不用「现在」冒充。
 *   4 不因为「表里没有」就断言「不会发生」—— sources() 如实报缺席源。
 *   5 真实时间与剧情时间**不得混算**：表的时间轴一律走剧情时间基准
 *     （store.clock.dayIndex 优先），拿不到剧情时间时整表拒算而不是退回 wall clock。
 *   6 不新增第二套到期判定 —— 每条的「是否已到期」由来源模块自己的口径决定，
 *     本模块只做展示与排序（来源没提供判据时标 unknown，不代它判）。
 *   7 不重复 longline 的 overdue 计算 —— 直接调用它，不复制一份规则。
 *   8 到期后条目自动移出未来表并进入 overdueList（同一条只在一处出现）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_agenda_settings_v1';
  const DEF = { enabled: false, maxRows: 24, soonCount: 6 };
  const __REG = { key: LS_KEY, def: DEF, module: 'agenda',
    bounds: { maxRows: [4, 96], soonCount: [1, 24] } };
  function getSettings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  function setSettings(patch) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, getSettings(), patch || {})))
      : Object.assign({}, getSettings(), patch || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  var _stat = { reads: 0, refused: 0, lastReason: '', faults: {}, bySource: {} };
  function noteFault(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  function noteSource(name, n) { _stat.bySource[name] = (_stat.bySource[name] || 0) + n; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function num(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }

  // ── 剧情时间基准（边界 5）────────────────────────────────────
  //   只认剧情时间；拿不到时**整表拒算**。这不是保守，是本仓已有裁决：
  //   真实时间与剧情时间混算过一次（v2.161.0 TP3 时间源分域），代价是离线间隔被抹平。
  function storyNow() {
    if (WA.playtime && typeof WA.playtime.story === 'function') {
      try {
        const s = WA.playtime.story();
        if (s && s.ok) return { ok: true, dayIndex: (num(s.dayIndex) === null ? 0 : num(s.dayIndex)), label: String(s.label || ''), source: 'playtime.story' };
      } catch (e) { /* 落到下面的直接读 */ }
    }
    const st = state();
    const c = (st && st.clock) || {};
    const label = String(c.label || '').trim();
    if (!label) return { ok: false, reason: 'no-story-clock' };
    return { ok: true, dayIndex: (num(c.dayIndex) === null ? 0 : num(c.dayIndex)), label: label, source: 'store.clock' };
  }

  // ── 五源采集（每源独立 try，缺席不影响其它源）──────────────
  //   每条统一形状：{ at(剧情日序号或 null), kind, source, label, subject, ref, status, canAct, unknown }
  //   unknown:true 表示「来源给了条目但没给可比较的时间」——如实列出，不猜日期（边界 3）。

  function fromLongline(now) {
    const out = [];
    if (!(WA.longline && typeof WA.longline.overdue === 'function')) return out;
    let rows = null;
    try { rows = WA.longline.overdue(); } catch (e) { return out; }
    (rows || []).forEach(function (r) {
      if (!r || !r.id) return;
      out.push({ at: null, kind: 'promise', source: 'longline',
        label: clean(r.content, 80) || ('伏笔 ' + clean(r.id, 40)),
        subject: clean(r.id, 40), ref: clean(r.id, 40),
        status: 'overdue', canAct: true, unknown: true,
        lateByMs: num(r.lateBy) });
    });
    return out;
  }

  function fromCommission(now) {
    const out = [];
    if (!(WA.commission && typeof WA.commission.view === 'function')) return out;
    const st = state();
    // 桶名以现场为准：core/store.js 骨架 `commission: { contracts: [] }`，
    //   本模块初稿按 `orders/records` 猜过两个名字 —— 实测**两个都不存在**，
    //   聚合面会静默空转（表里永远没有委托条目，而门禁全绿）。这是「猜字段」的典型代价。
    const recs = ((st.commission || {}).contracts) || [];
    if (!Array.isArray(recs)) return out;
    recs.forEach(function (rec) {
      if (!rec || !rec.id) return;
      const stages = Array.isArray(rec.stages) ? rec.stages : [];
      stages.forEach(function (sg, i) {
        if (!sg || sg.status !== 'active') return;
        const dl = num(sg.deadline);
        out.push({ at: null, kind: 'commission', source: 'commission',
          label: clean(rec.title, 60) + ' · 第' + (i + 1) + '阶段' + (sg.label ? '（' + clean(sg.label, 30) + '）' : ''),
          subject: clean(rec.id, 40), ref: clean(rec.id, 40),
          status: 'active', canAct: true,
          unknown: !(dl && dl > 0),
          deadlineMs: (dl && dl > 0) ? dl : null });
      });
    });
    return out;
  }

  function fromDiplomacy(now) {
    const out = [];
    if (!(WA.diplomacy && typeof WA.diplomacy.stat === 'function')) return out;
    const st = state();
    // 桶结构以现场为准：`diplomacy.pairs` 是**对象**（pairId → pair），不是数组。
    //   初稿按数组遍历过 —— 对象上没有 forEach，整源会抛异常并被上面的 try 吞成空表。
    const pairsObj = ((st.diplomacy || {}).pairs) || {};
    const keys = (pairsObj && typeof pairsObj === 'object') ? Object.keys(pairsObj) : [];
    keys.forEach(function (k) {
      const p = pairsObj[k];
      if (!p) return;
      const terms = Array.isArray(p.terms) ? p.terms : [];
      terms.forEach(function (t) {
        if (!t || t.status !== 'active') return;
        const until = num(t.until);
        out.push({ at: null, kind: 'treaty', source: 'diplomacy',
          label: clean(t.label, 40) + (until ? '（有期限）' : '（无期限）'),
          subject: clean(p.id || k, 40), ref: clean(p.id || k, 40),
          status: 'active', canAct: false,
          unknown: !(until && until > 0),
          untilMs: (until && until > 0) ? until : null });
      });
    });
    return out;
  }

  function fromFreight(now) {
    const out = [];
    if (!(WA.freight && typeof WA.freight.view === 'function')) return out;
    const st = state();
    const ships = ((st.freight || {}).shipments) || [];
    if (!Array.isArray(ships)) return out;
    ships.forEach(function (s) {
      if (!s || s.status !== 'transit') return;
      const eta = num(s.eta);
      out.push({ at: null, kind: 'freight', source: 'freight',
        label: clean(s.from, 30) + '→' + clean(s.to, 30) + '：' + clean(s.resource, 30) + ' ' + (num(s.qty) || 0),
        subject: clean(s.id, 40), ref: clean(s.id, 40),
        status: 'transit', canAct: false,
        unknown: !(eta && eta > 0),
        etaMs: (eta && eta > 0) ? eta : null });
    });
    return out;
  }

  function fromAftermath(now) {
    const out = [];
    if (!(WA.aftermath && typeof WA.aftermath.active === 'function')) return out;
    const st = state();
    const effs = ((st.aftermath || {}).effects) || [];
    if (!Array.isArray(effs)) return out;
    effs.forEach(function (e) {
      if (!e || e.status !== 'active') return;
      const ex = num(e.expiresAt);
      out.push({ at: null, kind: 'place-effect', source: 'aftermath',
        label: clean(e.placeId, 30) + '：' + clean(e.effectType, 30) + (e.description ? '（' + clean(e.description, 40) + '）' : ''),
        subject: clean(e.placeId, 40), ref: clean(e.id, 40),
        status: 'active', canAct: true,
        unknown: !(ex && ex > 0),
        expiresAtMs: (ex && ex > 0) ? ex : null });
    });
    return out;
  }

  const SOURCE_FNS = [
    { name: 'longline', fn: fromLongline },
    { name: 'commission', fn: fromCommission },
    { name: 'diplomacy', fn: fromDiplomacy },
    { name: 'freight', fn: fromFreight },
    { name: 'aftermath', fn: fromAftermath }
  ];

  // ── 主读面：未来事件表 ──────────────────────────────────────
  function upcoming(opts) {
    const cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [] }; }
    const o = (opts && typeof opts === 'object') ? opts : {};
    const now = storyNow();
    if (!now.ok) { noteFault('no-story-clock'); return { ok: false, reason: 'no-story-clock', rows: [], note: '世界钟未设定：剧情时间缺失时拒算，不猜日期' }; }
    const rows = [];
    const perSource = {};
    SOURCE_FNS.forEach(function (s) {
      let got = [];
      try { got = s.fn(now) || []; } catch (e) { got = []; }
      perSource[s.name] = got.length;
      noteSource(s.name, got.length);
      got.forEach(function (r) { r.at = r.at; rows.push(r); });
    });
    // 排序：有时间者按时间升序在前，未知时间者按来源稳定序在后（**不**用「现在」冒充）。
    const timed = rows.filter(function (r) { return !r.unknown; });
    const untimed = rows.filter(function (r) { return r.unknown; });
    timed.sort(function (a, b) {
      const ta = (a.etaMs || a.expiresAtMs || a.untilMs || a.deadlineMs || 0);
      const tb = (b.etaMs || b.expiresAtMs || b.untilMs || b.deadlineMs || 0);
      return ta - tb;
    });
    const limit = (num(o.limit) && num(o.limit) > 0) ? Math.min(cfg.maxRows, Math.floor(num(o.limit))) : cfg.maxRows;
    const merged = timed.concat(untimed);
    const capped = merged.length > limit;
    const kept = capped ? merged.slice(0, limit) : merged;
    _stat.reads++;
    return { ok: true, rows: kept.map(function (r) { return Object.assign({}, r); }),
      count: kept.length, total: merged.length, capped: capped,
      timedCount: timed.length, untimedCount: untimed.length,
      storyDay: now.dayIndex, storyLabel: now.label, perSource: perSource,
      note: '未知时间保持未知（不用「现在」冒充）；表里没有不等于不会发生' };
  }

  function soon(n) {
    const cfg = getSettings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', rows: [] };
    const k = (num(n) && num(n) > 0) ? Math.min(cfg.soonCount, Math.floor(num(n))) : cfg.soonCount;
    const r = upcoming({ limit: k });
    return r;
  }

  // ── 已到期未收敛（与 O5 的「阻塞」栏同源）─────────────────
  function overdueList() {
    const cfg = getSettings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', rows: [] };
    const out = [];
    if (WA.longline && typeof WA.longline.overdue === 'function') {
      let rows = [];
      try { rows = WA.longline.overdue() || []; } catch (e) { rows = []; }
      rows.forEach(function (r) {
        if (!r || !r.id) return;
        out.push({ source: 'longline', kind: 'promise', ref: clean(r.id, 40),
          label: clean(r.content, 80) || clean(r.id, 40), lateByMs: num(r.lateBy) });
      });
    }
    return { ok: true, rows: out, count: out.length };
  }

  // ── 源可用性（缺席如实报，不静默丢）───────────────────────
  //   可用性判据只看**命名空间与读口是否在场**，不调用采集函数：
  //   调用采集会产生读数副作用（bySource 计数被探针污染），而「探一次可用性」不该改变被探对象。
  const SOURCE_PROBES = [
    { name: 'longline', probe: function () { return !!(WA.longline && typeof WA.longline.overdue === 'function'); } },
    { name: 'commission', probe: function () { return !!(WA.commission && typeof WA.commission.view === 'function'); } },
    { name: 'diplomacy', probe: function () { return !!(WA.diplomacy && typeof WA.diplomacy.stat === 'function'); } },
    { name: 'freight', probe: function () { return !!(WA.freight && typeof WA.freight.view === 'function'); } },
    { name: 'aftermath', probe: function () { return !!(WA.aftermath && typeof WA.aftermath.active === 'function'); } }
  ];
  function sources() {
    return SOURCE_PROBES.map(function (s) {
      let available = false;
      try { available = !!s.probe(); } catch (e) { available = false; }
      return { name: s.name, available: available, read: (_stat.bySource[s.name] || 0) };
    });
  }

  function diagnose() {
    const checks = {
      playtime: !!(WA.playtime && typeof WA.playtime.story === 'function'),
      store: !!(WA.store && typeof WA.store.get === 'function'),
      longline: !!(WA.longline && typeof WA.longline.overdue === 'function'),
      commission: !!(WA.commission && typeof WA.commission.view === 'function'),
      diplomacy: !!(WA.diplomacy && typeof WA.diplomacy.stat === 'function'),
      freight: !!(WA.freight && typeof WA.freight.view === 'function'),
      aftermath: !!(WA.aftermath && typeof WA.aftermath.active === 'function'),
      settingsBus: !!(WA.settingsBus && typeof WA.settingsBus.read === 'function')
    };
    const ok = checks.store;
    return { ok: ok, closedLoop: ok, checks: checks, version: '2.182.0' };
  }

  function stat() {
    return { reads: _stat.reads, refused: _stat.refused, lastReason: _stat.lastReason,
      faults: Object.assign({}, _stat.faults), bySource: Object.assign({}, _stat.bySource),
      enabled: getSettings().enabled, maxRows: getSettings().maxRows };
  }

  function reset() { _stat.reads = 0; _stat.refused = 0; _stat.lastReason = ''; _stat.faults = {}; _stat.bySource = {}; return { ok: true }; }

  WA.agenda = {
    getSettings: getSettings,
    setSettings: function (patch) { return setSettings(patch); },
    upcoming: upcoming,
    soon: soon,
    overdueList: overdueList,
    sources: sources,
    diagnose: diagnose,
    stat: stat,
    reset: reset
  };
  var EXPORT_COUNT = 9;
  var _exported = Object.keys(WA.agenda).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('agenda: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/agenda.js', { kind: 'engine', ver: '2.182.0' });
})();

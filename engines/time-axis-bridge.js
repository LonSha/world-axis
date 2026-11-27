/**
 * WorldAxis engines/time-axis-bridge.js (v2.604.0) — 时间轴对账面（R279 / TLX-1）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓有四台器官各自回答「今天是哪天」，而**没有任何地方把它们对读过**：
 *     · `store.clock.dayIndex`  —— 世界钟的整数日（0 基）
 *     · `store.clock.label`     —— 面子上的自由标签（`calendar.advanceDay` 写成「第 day 日」，
 *                                  推完后 dayIndex = day，故**标签里的数字恰好等于 dayIndex**）
 *     · `calendarPlan.label(d)` —— 自定义历法：`n = dayIndex`、0 基直接除月表，
 *                                  第 0 日 = 第 1 年第 1 月第 1 日
 *     · `undercurrent-calendar.getBaseStoryDay()` —— 暗流日历：`day = Math.floor(dayIndex) + 1`
 *
 *   现场实测的口径分歧（本轮的核心发现）：
 *     `clock.dayIndex = 1` 时 —— `clock.label` 是「第 1 日」，暗流日历内部算的 `baseDay` 是 **2**。
 *     `getBaseStoryDay` 的返回体里，`day` 与 `label` **同时出现且相差 1**：
 *       return { day: dayIndex + 1, label: s.clock.label || ('第' + d + '日'), source: 'clock-dayIndex' }
 *     `label` 取的是 `clock.label`（=「第 1 日」，且它自己那个 fallback 分支恰好也写 `d`）。
 *     ⇒ 暗流日历说的「还剩 2 轮」，读者按面板上的「第 1 日」去数，会落到**第 3 日**而不是第 2 日。
 *     这不是算术错，是**两套 0/1 基约定在同一句读数里相遇而没人声明**。
 *
 * ── 它做什么（15 导出）──────────────────────────────────────
 *   `origin()`   逐源报它的基约定（0 基 / 1 基 / 不适用）与依据（哪一行代码定的）
 *   `readings()` 逐源报「今天是哪天」：clockDay / labelNum / labelSkew / planLabel / ucBaseDay / ucSkew
 *   `skew()`     只回差值摘要：{label, plan, uc, worst}
 *   `faults()`   五码含义 + 表外码
 *   `audit()` / `lineOf()` / `summaryText()` / `diagnose()` / `stat()` / `__reset()`
 *
 * ── 八值 verdict（优先级即顺序）─────────────────────────────
 *   `module-missing` > `no-store` > `drift` > `clock-unset`
 *   > `derived-absent` > `skewed` > `aligned` > `ok`
 *   `drift` 仍压在运行态之上：口径不一致是**结构**问题，不该被「世界钟还没走过」盖掉。
 *   why 四值：`ok` / `module-missing` / `no-store` / `drift`。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 **零调发动机的计算函数**。`calendarPlan.label()` 会把 `stat.labels` 加一，
 *     `undercurrentCalendar.build()` 会把 `stat.builds` 加一 —— 体检把计数改掉之后，
 *     读出来的就不是现场了。所以本面**自己复算**两台的折算，只读 `getMonths()` 与 `store`。
 *   2 零写：不 setClock / 不 setSettings / 不 transact。
 *   3 只报数字不报正文：`clock.label` 是用户可编辑的自由文本（可能含剧情），
 *     本面只回**从中解析出的日号**与能否解析，**不回显原串**。
 *   4 基约定写死在本文件里（`ORIGINS`），并由专锁去核源码原文：
 *     哪台改了基而没有同批改本表，专锁红而不是桥静默跟随。
 *   5 `clock-unset` 与 `derived-absent` 分开：前者是世界钟一次没走过，后者是钟在走但历法没月表。
 *   6 读数唯一出口：所有判断从 `audit()` 出，`lineOf()` 只做格式化。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const VERSION = '2.604.0';
  const NAME = 'timeAxis';
  const WHY = ['ok', 'module-missing', 'no-store', 'drift'];
  const VERDICT = ['module-missing', 'no-store', 'drift', 'clock-unset', 'derived-absent', 'skewed', 'aligned', 'ok'];

  /** 各源的基约定（依据是源码行，不是推测）。
   *  改任何一台的基，都要同批改这里 —— 专锁 T 组去核三处源码原文。 */
  const ORIGINS = [
    { src: 'clock.dayIndex', base: 0, basis: 'core/store.js 默认 clock.dayIndex = 0（「一天都没走过」）' },
    { src: 'clock.label', base: 1, basis: 'engines/calendar.js advanceDay：推进后 dayIndex = day、label = 第 day 日' },
    { src: 'calendarPlan.label', base: 0, basis: 'engines/calendar-custom.js label：n = dayIndex，第 0 日 = 第1年第1月第1日' },
    { src: 'undercurrent.baseDay', base: 1, basis: 'engines/undercurrent-calendar.js getBaseStoryDay：day = Math.floor(dayIndex) + 1' }
  ];

  const FAULT_TEXT = {
    'no-store': 'WA.store 缺席 —— 时间轴无从对读，不是「今天没有分歧」',
    'no-clock': 'store 在但没有 clock 结构 —— 世界钟从未初始化',
    'bad-type': 'dayIndex 不是数 —— 写了非数值却照样显示日期',
    'label-unparsed': 'clock.label 存在但解析不出「第 N 日」—— 自由文本与整数日无法对账',
    'no-months': '自定义历法未登记月表 —— 折算不出月名，只能待确认'
  };

  const stat = { audits: 0, drift: 0, skewHits: 0, lastWhy: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; }

  function store() {
    return (WA.store && typeof WA.store.get === 'function') ? WA.store : null;
  }
  function clockOf() {
    const st = store();
    if (!st) return null;
    let s = null;
    try { s = st.get() || {}; } catch (e) { return null; }
    return (s && s.clock && typeof s.clock === 'object') ? s.clock : null;
  }

  /** 只回能解析出的日号与是否解析成功 —— 不回显 label 原串（可能是用户写进去的剧情）。 */
  function labelNumOf(label) {
    const raw = String(label == null ? '' : label);
    if (!raw) return { present: false, parsed: false, num: null };
    const m = raw.match(/第\s*(\d+)\s*日/);
    return { present: true, parsed: !!m, num: m ? parseInt(m[1], 10) : null };
  }

  /** 自定义历法的折算 —— 与 engines/calendar-custom.js label() 逐行同构，但**不调它**。 */
  function planOf(dayIndex) {
    const cp = WA.calendarPlan;
    if (!cp || typeof cp !== 'object') return { ok: false, why: 'module-missing', months: 0, yearDays: 0, label: null };
    let months = [];
    try { months = cp.getMonths() || []; } catch (e) { months = []; }
    const list = Array.isArray(months) ? months : [];
    let total = 0, bad = 0;
    for (let i = 0; i < list.length; i++) {
      const d = Number(list[i] && list[i].days);
      if (!isFinite(d) || d <= 0 || Math.floor(d) !== d) { bad++; continue; }
      total += d;
    }
    if (!list.length || !(total > 0) || bad > 0) {
      return { ok: false, why: bad > 0 ? 'bad-value' : 'no-months', months: list.length, yearDays: total, label: null };
    }
    const n = Number(dayIndex);
    if (!isFinite(n) || n < 0) return { ok: false, why: 'bad-value', months: list.length, yearDays: total, label: null };
    const year = Math.floor(n / total) + 1;
    let rest = n % total;
    let mi = 0;
    while (mi < list.length && rest >= Number(list[mi].days)) { rest -= Number(list[mi].days); mi++; }
    const m = list[mi];
    if (!m) return { ok: false, why: 'bad-value', months: list.length, yearDays: total, label: null };
    return { ok: true, why: 'ok', months: list.length, yearDays: total, year: year, monthIndex: mi, dayOfMonth: rest + 1, label: 'M' + (mi + 1) + 'D' + (rest + 1) + '/Y' + year };
  }

  /** 各源的基约定与依据。 */
  function origin() {
    return { ok: true, list: ORIGINS.map(function (o) { return { src: o.src, base: o.base, basis: o.basis }; }), count: ORIGINS.length };
  }

  /** 逐源报「今天是哪天」。 */
  function readings() {
    const ck = clockOf();
    if (!ck) {
      noteFault('no-clock');
      return { ok: false, why: 'no-clock', clockDay: null, label: { present: false, parsed: false, num: null }, labelSkew: null, plan: null, ucBaseDay: null, ucSkew: null };
    }
    const raw = ck.dayIndex;
    if (typeof raw !== 'number' || !isFinite(raw)) noteFault('bad-type');
    const clockDay = (typeof raw === 'number' && isFinite(raw)) ? Math.floor(raw) : null;
    const label = labelNumOf(ck.label);
    if (label.present && !label.parsed) noteFault('label-unparsed');
    // clock.label 的口径：calendar.advanceDay 推完后 label 的数字 === dayIndex
    const labelSkew = (label.parsed && clockDay != null) ? (label.num - clockDay) : null;
    const plan = (clockDay == null) ? null : planOf(clockDay);
    // 暗流日历的基：dayIndex + 1（复算，不调 build / getBaseStoryDay）
    const ucBaseDay = (clockDay == null) ? null : (clockDay + 1);
    // 它拿 clock.label 当「今天的面子」，却用 baseDay 当「算术里的今天」⇒ 两者相减就是读者会差的那一天
    const shown = label.parsed ? label.num : (clockDay != null ? clockDay + 1 : null);
    const ucSkew = (ucBaseDay != null && shown != null) ? (ucBaseDay - shown) : null;
    return { ok: true, why: 'ok', clockDay: clockDay, label: label, labelSkew: labelSkew, plan: plan, ucBaseDay: ucBaseDay, ucShown: shown, ucSkew: ucSkew };
  }

  /** 差值摘要：只回数字，不重复读数体。 */
  function skew() {
    const r = readings();
    if (!r.ok) return { ok: false, why: r.why, label: null, plan: null, uc: null, worst: null };
    const vals = [];
    if (r.labelSkew != null) vals.push({ src: 'clock.label', d: r.labelSkew });
    if (r.ucSkew != null) vals.push({ src: 'undercurrent.baseDay', d: r.ucSkew });
    // plan 的偏差：历法的「第几天」在年内序号应等于 dayIndex % yearDays + 1；这里只报它是否可折算
    const planSkew = (r.plan && r.plan.ok) ? 0 : null;
    const worst = vals.length ? vals.reduce(function (a, b) { return Math.abs(b.d) > Math.abs(a.d) ? b : a; }) : null;
    return { ok: vals.length === 0 || vals.every(function (v) { return v.d === 0; }), why: 'ok', label: r.labelSkew, plan: planSkew, uc: r.ucSkew, worst: worst, vals: vals };
  }

  function faults() {
    const known = [], unknown = [];
    Object.keys(stat.faults).forEach(function (k) {
      const n = stat.faults[k];
      if (!n) return;
      if (FAULT_TEXT[k]) known.push({ code: k, count: n, text: FAULT_TEXT[k] });
      else unknown.push({ code: k, count: n });
    });
    return { ok: unknown.length === 0, known: known, unknown: unknown, codes: Object.keys(FAULT_TEXT).length };
  }

  function audit() {
    stat.audits++;
    if (!store()) {
      stat.lastWhy = 'module-missing'; noteFault('no-store');
      return { why: 'module-missing', verdict: 'module-missing', state: 'module-missing', readings: null, skew: null, origin: origin(), faults: faults() };
    }
    const ck = clockOf();
    if (!ck) {
      stat.lastWhy = 'no-store'; noteFault('no-clock');
      return { why: 'no-store', verdict: 'no-store', state: 'no-store', readings: null, skew: null, origin: origin(), faults: faults() };
    }
    const rd = readings();
    const sk = skew();
    const ft = faults();
    const labelDrift = rd.labelSkew != null && rd.labelSkew !== 0;
    const ucDrift = rd.ucSkew != null && rd.ucSkew !== 0;
    const anyDrift = labelDrift || ucDrift;
    let state;
    if (!rd.label.present && rd.clockDay === 0) state = 'clock-unset';
    else if (rd.plan && !rd.plan.ok) state = 'derived-absent';
    else if (anyDrift) state = 'skewed';
    else state = 'aligned';
    const verdict = anyDrift ? 'drift' : state;
    if (anyDrift) { stat.drift++; stat.skewHits += (labelDrift ? 1 : 0) + (ucDrift ? 1 : 0); }
    stat.lastWhy = anyDrift ? 'drift' : 'ok';
    return { why: anyDrift ? 'drift' : 'ok', verdict: verdict, state: state, readings: rd, skew: sk, origin: origin(), faults: ft };
  }

  function lineOf(a) {
    const r = a || audit();
    if (r.verdict === 'module-missing') return '缺 store：时间轴无从对读 —— 这不是「今天没有分歧」';
    if (r.verdict === 'no-store') return 'store 在但没有 clock 结构：世界钟从未初始化';
    if (r.verdict === 'drift') {
      const bits = [];
      if (r.readings.labelSkew) bits.push('标签与整数日差 ' + (r.readings.labelSkew > 0 ? '+' : '') + r.readings.labelSkew);
      if (r.readings.ucSkew) bits.push('暗流日历的基准日与面子差 ' + (r.readings.ucSkew > 0 ? '+' : '') + r.readings.ucSkew + '（「还剩几轮」会整差一天）');
      return '实锤「两个今天」：第 ' + r.readings.clockDay + ' 日，' + bits.join('；') + '（运行态：' + r.state + '）';
    }
    if (r.verdict === 'clock-unset') return '世界钟一次没走过（dayIndex 0 且无标签）：此刻谈对账没意义';
    if (r.verdict === 'derived-absent') return '钟在走但自定义历法没月表：折算不出月名，只能待确认';
    if (r.verdict === 'aligned') return '四源对齐：第 ' + r.readings.clockDay + ' 日，标签与暗流基准都一致';
    return '时间轴对齐';
  }

  function summaryText() { const a = audit(); return { verdict: a.verdict, state: a.state, why: a.why, line: lineOf(a) }; }

  function diagnose() {
    const a = audit();
    const out = { verdict: a.verdict, state: a.state, why: a.why, fixes: [] };
    if (a.verdict === 'module-missing' || a.verdict === 'no-store') out.fixes.push('先确认 core/store.js 已装载（时间轴的四源都在它上面）');
    if (a.verdict === 'drift') {
      out.fixes.push('暗流日历的 getBaseStoryDay 用 dayIndex + 1，而 clock.label 的数字等于 dayIndex —— 两边必有一边改基，或在 getBaseStoryDay 的返回体里把 day 与 label 改成同一基');
      if (a.readings && a.readings.labelSkew) out.fixes.push('clock.label 的数字与 dayIndex 不一致（手写过标签）—— 让写标签的地方统一走 calendar.setClock，或补一个重算入口');
    }
    if (a.verdict === 'derived-absent') out.fixes.push('给 calendarPlan 登记月表（否则历法只能回「日期待确认」）');
    if (!out.fixes.length) out.fixes.push('无结构缺口：四源的基一致');
    return out;
  }

  function statOut() {
    const body = { audits: stat.audits, drift: stat.drift, skewHits: stat.skewHits, lastWhy: stat.lastWhy, faults: Object.assign({}, stat.faults) };
    return Object.assign({ version: VERSION }, body, { last: Object.assign({}, body) });
  }
  function __reset() { stat.audits = 0; stat.drift = 0; stat.skewHits = 0; stat.lastWhy = ''; stat.faults = {}; }

  WA.timeAxisBridge = {
    NAME: NAME, ORIGINS: ORIGINS.map(function (o) { return { src: o.src, base: o.base }; }), VERDICT: VERDICT.slice(), WHY: WHY.slice(), version: VERSION,
    audit: audit, diagnose: diagnose, faults: faults, lineOf: lineOf, origin: origin,
    readings: readings, skew: skew, stat: statOut, summaryText: summaryText, __reset: __reset
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/time-axis-bridge.js', { kind: 'engine', ver: VERSION });
})();

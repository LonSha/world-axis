/**
 * WorldAxis engines/fact-age-bridge.js (v2.596.0) — 事实老化的落地面（谁在陈、谁根本测不出）
 *
 * 病（开工前先看现场）：`engines/fact-age.js`（v2.529.0）能把一批事实按「距上次引用多少楼」
 *   分成四档（fresh / aging / stale / dead，缺时间戳的记 unknown 不判死），但它是**纯判据**：
 *   要 `{ id, lastTurn, weight, text }` 这样的行。而全库的事实源写的是另一种形状：
 *     · `worldFacts`（backstage 写）：`{ id, key, value, scope, source, at, branchId }`；
 *     · `memory.facts`（memory.upsertFact 写）：`{ key, value, version, active, reason, at }`
 *       —— 注意连 id 都没有（用 key），旧版本还以 `active:false` 长期保留在账上。
 *   两个源都只有 `at`（**写入时刻**），没有 `lastTurn`（**上次被引用时刻**）。
 *   于是「哪些事实已经陈了」这个问题今天谁也答不了，而这在 v2.568.0 已经被裁决过（C8：
 *   「lastTurn 全库无人写」）—— 裁决写在文档里，产品面上却什么都没有。
 *
 * 本模块只做三件事：
 *   ① `sources()` / `audit()` —— **生产面体检**：逐源数「有多少行带 lastTurn / 有多少行只有 at /
 *      有多少行是 active:false 的旧版本」，并给出可复算的结论（不是拍一句“大概不可用”）。
 *   ② `plan()` —— 委托 `factAge.plan`。默认只按 `lastTurn` 算；**没有就明说不可用**，
 *      绝不拿 `at` 偷换 `lastTurn`。
 *   ③ `degraded()` —— 显式降级：把 `at` 当老化基准。它是**另一个问题**（“多久没更新过”，
 *      不是“多久没被引用过”），所以单独一个出口、每一行都带 `degraded:'at-as-age'`、
 *      读数里逐字写明两者不是一回事。
 *
 * 边界（都是否定式）
 *   1 **零写**：只读 `WA.store.get()`。不删事实、不改 `active`、不改 `at`、不补 `lastTurn`。
 *   2 **不猜时间**：`lastTurn` 缺失就是缺失；本模块**不**用 `at` 顶替（那是 degraded 出口要显式开启的事），
 *      也不用当前时刻反推。
 *   3 **不解析不拼装**：id 取哪一列按源表声明（worldFacts 取 `id`，memory.facts 取 `key`），
 *      不按点号切路径之外的任何东西。
 *   4 **旧版本不混进当前事实**：`memory.facts` 里 `active:false` 的行仍然计入账（`inactive`），
 *      但**不进打档行** —— 同一条事实的多个版本各算一次，分档会被版本数顶歪（与 OPJ-1 的
 *      「三档分开数」同源纪律）。
 *   5 **测不到就说测不到**：`now` 读不到（`WA.clock` 缺席且没有传入）时，`factAge` 会把每行都记
 *      `unknown`；本模块把这件事提前说破（`why:'no-now'`），不让一屏 `unknown` 冒充“全是新的”。
 *   6 **一行读数只有一份**：`lineOf` 是唯一出口，`summaryText` 直接回它（RFA-1 那一格踩过
 *      `return` 被注释吞掉）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.596.0';

  /**
   * 源表（封闭）：改这里就等于声明“本仓的事实源就这些”。
   *   `path` 是相对 `store.get()` 状态的路径（点号分隔，只走对象，不执行任何表达式）；
   *   `idField` 是该源真正可用的身份列 —— 两个源不一样，这正是不能统一“id”的原因；
   *   `keep` 是“哪些行算当前事实”的判据（返回 false 的行计入 inactive，不进分档）。
   */
  const SOURCES = [
    {
      name: 'worldFacts',
      path: 'worldFacts',
      idField: 'id',
      note: 'backstage 写（id/key/value/scope/source/at/branchId）',
      keep: function () { return true; }
    },
    {
      name: 'memoryFacts',
      path: 'memory.facts',
      idField: 'key',
      note: 'memory.upsertFact 写（key/value/version/active/reason/at）—— 旧版本 active:false 仍留在账上',
      keep: function (f) { return f && f.active !== false; }
    }
  ];

  const ZERO = { fresh: 0, aging: 0, stale: 0, dead: 0, unknown: 0 };
  var _stat = { audits: 0, plans: 0, degraded: 0, last: null };

  function clockNow() {
    try {
      if (WA.clock && typeof WA.clock.now === 'function') {
        const n = Number(WA.clock.now('fact-age-bridge'));
        return isFinite(n) ? n : null;
      }
    } catch (e) { /* 读不到就是读不到，不抛给调用方 */ }
    return null;
  }

  function state() {
    try {
      const s = WA.store && typeof WA.store.get === 'function' ? WA.store.get() : null;
      return s && typeof s === 'object' ? s : null;
    } catch (e) { return null; }
  }

  function rowsOf(st, src) {
    if (!st) return [];
    const seg = String(src.path).split('.');
    let cur = st;
    for (let i = 0; i < seg.length; i++) {
      if (!cur || typeof cur !== 'object') return [];
      cur = cur[seg[i]];
      if (cur === undefined || cur === null) return [];
    }
    return Array.isArray(cur) ? cur : [];
  }

  function textOf(f) {
    if (!f || typeof f !== 'object') return '';
    const k = f.key === undefined ? '' : String(f.key);
    const v = f.value === undefined ? '' : String(f.value);
    if (k && v) return k + '：' + v;
    return k || v || (f.id === undefined ? '' : String(f.id));
  }

  /** 形状体检（纯函数）：只数，不猜。`fields` 是行内实际出现过的键及出现次数。 */
  function shapeOf(rows) {
    const fields = {};
    let lastTurn = 0;
    let at = 0;
    let inactive = 0;
    let bad = 0;
    for (let i = 0; i < rows.length; i++) {
      const f = rows[i];
      if (!f || typeof f !== 'object') { bad++; continue; }
      for (const k in f) if (Object.prototype.hasOwnProperty.call(f, k)) fields[k] = (fields[k] || 0) + 1;
      if (isFinite(Number(f.lastTurn))) lastTurn++;
      if (isFinite(Number(f.at))) at++;
      if (f.active === false) inactive++;
    }
    return { rows: rows.length, bad: bad, fields: fields, lastTurn: lastTurn, at: at, inactive: inactive };
  }

  /** 逐源体检：不给结论，只给数。结论在 audit() 里统一说。 */
  function sources() {
    const st = state();
    const out = [];
    for (let i = 0; i < SOURCES.length; i++) {
      const src = SOURCES[i];
      const rows = rowsOf(st, src);
      const sh = shapeOf(rows);
      const taken = rows.filter(function (f) { return src.keep(f); }).length;
      out.push({
        name: src.name,
        path: src.path,
        idField: src.idField,
        note: src.note,
        ok: !!st,
        why: st ? 'ok' : 'no-store',
        count: sh.rows,
        bad: sh.bad,
        keep: taken,
        inactive: sh.rows - taken,
        hasLastTurn: sh.lastTurn > 0,
        hasAt: sh.at > 0,
        lastTurn: sh.lastTurn,
        at: sh.at,
        fields: sh.fields
      });
    }
    return { ok: !!st, why: st ? 'ok' : 'no-store', at: clockNow(), sources: out };
  }

  /**
   * 生产面体检：本模块存在的主要理由。
   *   结论只有三种，且都是可复算的：
   *     `module-missing` —— 被委托方（fact-age）没装载；
   *     `no-store`      —— 读不到状态；
   *     `no-last-turn`  —— 有事实，但**0 行**带 lastTurn（今天就是这个）；
   *     `ok`            —— 有行带 lastTurn，可以真打档。
   */
  function audit(opts) {
    const o = opts || {};
    _stat.audits++;
    const now = (o.now === undefined || o.now === null) ? clockNow() : Number(o.now);
    const FA = WA.factAge;
    let why = 'ok';
    let sr = { ok: false, why: 'no-store', sources: [] };
    if (!FA || typeof FA.plan !== 'function') why = 'module-missing';
    else {
      sr = sources();
      if (!sr.ok) why = 'no-store';
      else {
        const total = sr.sources.reduce(function (n, s) { return n + s.keep; }, 0);
        const lt = sr.sources.reduce(function (n, s) { return n + s.lastTurn; }, 0);
        if (total === 0) why = 'no-facts';
        else if (lt === 0) why = 'no-last-turn';
      }
    }
    const totalKeep = (sr.sources || []).reduce(function (n, s) { return n + s.keep; }, 0);
    const totalLast = (sr.sources || []).reduce(function (n, s) { return n + s.lastTurn; }, 0);
    const totalAt = (sr.sources || []).reduce(function (n, s) { return n + s.at; }, 0);
    const r = {
      ok: why === 'ok',
      version: VERSION,
      at: clockNow(),
      now: isFinite(now) ? now : null,
      why: why,
      sources: sr.sources || [],
      verdict: {
        facts: totalKeep,
        lastTurnRows: totalLast,
        atRows: totalAt,
        usable: (sr.sources || []).filter(function (s) { return s.hasLastTurn; }).map(function (s) { return s.name; }),
        blocked: (sr.sources || []).filter(function (s) { return !s.hasLastTurn && s.at > 0; }).map(function (s) { return s.name; }),
        why: why
      }
    };
    _stat.last = { why: why, facts: totalKeep, lastTurnRows: totalLast };
    return r;
  }

  function adapt(rows, src, ageField) {
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const f = rows[i];
      if (!src.keep(f)) continue;
      const id = f && f[src.idField] !== undefined ? f[src.idField] : null;
      out.push({
        id: id,
        // 只搬这一列：调用方点名要哪一列做老化基准，本模块不改语义、不做合并
        lastTurn: f ? f[ageField] : undefined,
        weight: f && f.weight !== undefined ? f.weight : 1,
        text: textOf(f)
      });
    }
    return out;
  }

  /**
   * 打档：委托 `factAge.plan`。
   *   `ageField` 默认 `'lastTurn'` —— 这是**难的、也正确**的那个问题；本仓今天没有数据，所以会回
   *   `no-last-turn` 而不是回一屏 fresh。要问“多久没更新过”，请走 `degraded()`，别把这里偷换掉。
   */
  function plan(opts) {
    const o = opts || {};
    _stat.plans++;
    const FA = WA.factAge;
    if (!FA || typeof FA.plan !== 'function') {
      return { ok: false, why: 'module-missing', source: o.source || null, rows: [], counts: Object.assign({}, ZERO), ids: { stale: [], dead: [], unknown: [] }, now: null, line: '' };
    }
    const sr = sources();
    if (!sr.ok) return { ok: false, why: 'no-store', source: o.source || null, rows: [], counts: Object.assign({}, ZERO), ids: { stale: [], dead: [], unknown: [] }, now: null, line: '' };
    const ageField = o.ageField === undefined ? 'lastTurn' : String(o.ageField);
    const now = (o.now === undefined || o.now === null) ? clockNow() : Number(o.now);
    const pick = o.source
      ? sr.sources.filter(function (s) { return s.name === String(o.source); })
      : sr.sources;
    if (!pick.length) {
      return { ok: false, why: 'unknown-source', source: o.source, rows: [], counts: Object.assign({}, ZERO), ids: { stale: [], dead: [], unknown: [] }, now: null, line: '' };
    }
    const srcBy = {};
    for (let i = 0; i < SOURCES.length; i++) srcBy[SOURCES[i].name] = SOURCES[i];
    let rows = [];
    for (let i = 0; i < pick.length; i++) {
      rows = rows.concat(adapt(rowsOf(state(), srcBy[pick[i].name]), srcBy[pick[i].name], ageField));
    }
    const aged = rows.filter(function (x) { return isFinite(Number(x.lastTurn)); }).length;
    if (ageField === 'lastTurn' && aged === 0) {
      return {
        ok: false, why: 'no-last-turn', source: o.source || null, ageField: ageField,
        rows: [], counts: Object.assign({}, ZERO), ids: { stale: [], dead: [], unknown: [] },
        now: isFinite(now) ? now : null, aged: 0, total: rows.length, line: ''
      };
    }
    // Number(null) === 0 —— 用 isFinite(now) 单独守不住“读不到时间”：null 会被当成第 0 轮，
    //   于是一屏 unknown 就被写成了“可算”。先看空再判有限，两步都要。
    if (now === null || now === undefined || !isFinite(Number(now))) {
      // “读不到时间”与“全是新的”不是一回事：提前说破，不让一屏 unknown 冒充正常。
      return {
        ok: false, why: 'no-now', source: o.source || null, ageField: ageField,
        rows: [], counts: Object.assign({}, ZERO), ids: { stale: [], dead: [], unknown: [] },
        now: null, aged: aged, total: rows.length, line: ''
      };
    }
    const r = FA.plan(rows, now);
    return {
      ok: true, why: 'ok', source: o.source || null, ageField: ageField,
      degraded: ageField === 'at' ? 'at-as-age' : null,
      rows: r.rows, counts: r.counts, ids: r.ids, now: r.now,
      aged: aged, total: rows.length, line: ''
    };
  }

  /** 显式降级：把 `at`（写入时刻）当老化基准。名字自带警示，不要把它当 plan 的别名用。 */
  function degraded(opts) {
    _stat.degraded++;
    const o = Object.assign({}, opts || {});
    o.ageField = 'at';
    return plan(o);
  }

  /** 单源读数：形状 + 能不能打档 + 降级打档的分档数。 */
  function view(name) {
    const nm = name === undefined || name === null ? '' : String(name);
    const sr = sources();
    const one = sr.sources.filter(function (s) { return s.name === nm; })[0] || null;
    if (!sr.ok) return { ok: false, why: 'no-store', source: nm || null, line: whyText('no-store') };
    if (!one) return { ok: false, why: 'unknown-source', source: nm || null, line: whyText('unknown-source') };
    const d = degraded({ source: nm });
    const r = {
      ok: true, why: 'ok', source: nm, shape: one,
      usable: one.hasLastTurn,
      planWhy: one.hasLastTurn ? 'ok' : 'no-last-turn',
      counts: d.ok ? d.counts : Object.assign({}, ZERO),
      degraded: d.ok ? d.degraded : (d.why || null),
      line: ''
    };
    r.line = viewText(r);
    return r;
  }

  function whyText(why) {
    const w = String(why || '');
    if (w === 'module-missing') return '事实老化面：被委托方 factAge 未装载（engines/fact-age.js）—— 分档规则不在本模块复写一份';
    if (w === 'no-store') return '事实老化面：读不到状态（store 缺席）—— 这不是“没有陈事实”，是根本没读到账';
    if (w === 'no-facts') return '事实老化面：账上有 0 条事实 —— 还没写进来，不等于“全都不陈”';
    if (w === 'no-last-turn') return '事实老化面：0 行带 lastTurn —— 这个读数今天不可用（全库没有人在写「上次被引用第几轮」）';
    if (w === 'no-now') return '事实老化面：读不到当前轮（clock 缺席且没传 now）—— 一屏 unknown 不等于“全是新的”';
    if (w === 'unknown-source') return '事实老化面：没有叫这个名字的源（源表是封闭表，外名一律拒收）';
    if (w === 'ok') return '事实老化面：可算';
    return '事实老化面：' + (w || '未知原因');
  }

  function viewText(r) {
    if (!r || r.ok !== true) return whyText(r && r.why);
    const s = r.shape || {};
    const head = s.name + '：' + s.keep + ' 条事实';
    const shp = '（共 ' + s.count + ' 行' + (s.inactive ? ' · 旧版本 ' + s.inactive + ' 行不入档' : '')
      + ' · 带 lastTurn ' + s.lastTurn + ' / 带 at ' + s.at + '）';
    if (r.usable) return head + shp + ' · 可按 lastTurn 打档';
    return head + shp + ' · **不可按 lastTurn 打档**（0 行有 lastTurn）；按写入时刻的降级读数：'
      + '新 ' + r.counts.fresh + ' / 渐陈 ' + r.counts.aging + ' / 陈 ' + r.counts.stale + ' / 死 ' + r.counts.dead
      + (r.counts.unknown ? (' / 无时间戳 ' + r.counts.unknown) : '')
      + ' —— 这是“多久没更新过”，不是“多久没被引用过”';
  }

  /** 唯一的一行读数出口。 */
  function lineOf(r) {
    if (!r) return whyText('no-store');
    const v = r.verdict || {};
    const total = v.facts || 0;
    // 不可用态必须**说得完**：先说“0 行带 lastTurn、所以不可用”，再把 at 能回答的那个
    //   不同问题一并摆出来。否则这两句只活在 ok 分支里，就变成了永远跑不到的死代码
    //   （RFA-1 那一格踩过 `return` 被注释吞掉，这里踩的是“分支写反”）。
    if (r.why === 'no-last-turn' && total > 0) {
      return '事实老化面：' + (r.sources || []).length + ' 个源 / ' + total + ' 条事实 · **0 行带 lastTurn** —— 本读数不可用'
        + '（没有人在写「上次被引用第几轮」）；' + (v.atRows || 0) + ' 行只有写入时刻 at，'
        + '按它算得是「多久没更新过」—— 与「多久没被引用过」不是一回事，故本面不拿它冒充分档';
    }
    if (r.ok !== true) return whyText(r.why);
    if (total === 0) return whyText('no-facts');
    return '事实老化面：' + (r.sources || []).length + ' 个源 / ' + total + ' 条事实 · 带 lastTurn ' + v.lastTurnRows + ' 行 · 可打档';
  }

  function summaryText(r) {
    const own = lineOf(r);
    if (own) return own;
    return '事实老化面：' + whyText(r && r.why);
  }

  function diagnose() {
    const a = audit({});
    const out = [];
    for (let i = 0; i < a.sources.length; i++) {
      const s = a.sources[i];
      const ks = Object.keys(s.fields || {}).sort();
      out.push(s.name + '：' + s.count + ' 行 · 字段 ' + (ks.length ? ks.join('/') : '（无）')
        + ' · lastTurn ' + s.lastTurn + ' 行 · at ' + s.at + ' 行'
        + (s.inactive ? ' · 旧版本 ' + s.inactive + ' 行' : '')
        + ' ⇒ ' + (s.hasLastTurn ? '可打档' : '不可按 lastTurn 打档'));
    }
    return { ok: a.ok, why: a.why, at: a.at, lines: out, verdict: a.verdict };
  }

  function stat() {
    return { version: VERSION, audits: _stat.audits, plans: _stat.plans, degraded: _stat.degraded, last: _stat.last ? Object.assign({}, _stat.last) : null };
  }

  function __reset() { _stat = { audits: 0, plans: 0, degraded: 0, last: null }; return true; }

  WA.factAgeBridge = {
    version: VERSION,
    SOURCES: SOURCES,
    sources: sources,
    audit: audit,
    plan: plan,
    degraded: degraded,
    view: view,
    lineOf: lineOf,
    summaryText: summaryText,
    diagnose: diagnose,
    stat: stat,
    __reset: __reset
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/fact-age-bridge.js', { kind: 'engine', ver: VERSION });
})();

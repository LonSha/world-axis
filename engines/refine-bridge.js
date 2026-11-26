/**
 * WorldAxis engines/refine-bridge.js (v2.592.0) — 档案精编的落地面（RFA-1）
 *
 * 【它治什么（开工前先看现场）】
 *   `engines/refine.js` 的三件事（normalize / merge / condense）都是纯函数，
 *   写得再对也从来没被任何产品面调用过（`WA.refine` 产品面零命中，
 *   只在设置面登记了一个总开关）。于是「同一件事被记了三遍、
 *   同一条设定写了两处、短句堆成一堆」这件事，在界面上只有
 *   「看着难受」这一个状态 —— 没人能说出「能省几条」。
 *
 *   本文件不重写精编算法：三个变换全部委托 `WA.refine.merge` /
 *   `WA.refine.condense`。它只补两个缺口：
 *     ① 从哪取档案 —— 三处只增不减的台账（worldFacts / memory.facts / chronicle）；
 *     ② 取出来给人看 —— 每源「原 N 条 → 精编后 M 条，可省 X 条 / 超长 Y 条」
 *        加重复组明细。
 *
 * 【三条口径（不给回退）】
 *   1 零写：本文件 0 处 `transact(` / `patch(` / `setItem(` / `saveOrThrow(`。
 *     「精编了要不要落盘」是另一件事（那要事务、权限与挤出），
 *     本面一律不代替调用方做。
 *   2 只收正文不收键：worldFacts 收 `value` 不收 `key`、memory.facts 收 `value`
 *     不收 `key` —— 键是标识不是文本，拿键去重会把「两个不同的人同名」
 *     判成一条。
 *   3 空源不是错误：某源 0 条就报 0 条并给 why，不拿「空」冒充「干净」。
 *     而且只报能证伪的量：可省条数 = 原 − 精编后（现场复算），不估算字符收益。
 */
(function () {
  'use strict';
  var WA = window.WorldAxis = window.WorldAxis || {};
  var VERSION = '2.592.0';
  // 本文件里的多行拼接不写字面转义（本仓历史上真被这件事咬过两次）。
  var NL = String.fromCharCode(10);

  function clockWall() { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } }
  function state() { try { return (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : {}; } catch (e) { return {}; } }
  function num(v) { var n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }
  function clip(s, max) {
    var t = String(s == null ? '' : s);
    return t.length > max ? (t.slice(0, max - 1) + '…') : t;
  }

  // 源表：三处只增不减的台账。pick 只取正文，不取键（口径 2）。
  //   ⚠ 三个源全部来自 store 骨架里**已物化**的字段（core/store.js:93 worldFacts /
  //      :173 memory.facts / :167 chronicle），不读任何未登记字段。
  var SOURCES = [
    { id: 'worldFacts', label: '世界事实', field: 'value',
      pick: function (s) { return (s && Array.isArray(s.worldFacts)) ? s.worldFacts : []; } },
    { id: 'memoryFacts', label: '长期记忆事实', field: 'value',
      pick: function (s) { return (s && s.memory && Array.isArray(s.memory.facts)) ? s.memory.facts : []; } },
    { id: 'chronicle', label: '纪事', field: 'summary',
      pick: function (s) { return (s && Array.isArray(s.chronicle)) ? s.chronicle : []; } }
  ];

  /** 取正文：非对象项 / 空串逐项跳过并计数（不整批拒，同 refine 边界 5）。 */
  function textsOf(rows, field) {
    var out = [];
    var skipped = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || typeof r !== 'object') { skipped++; continue; }
      var v = r[field];
      if (typeof v !== 'string' || !v) { skipped++; continue; }
      out.push(v);
    }
    return { texts: out, skipped: skipped };
  }

  function zeroTotals() { return { raw: 0, kept: 0, dropped: 0, long: 0, groups: 0, skipped: 0 }; }

  var _stat = { scans: 0, last: null, faults: {} };
  function fault(code) { _stat.faults[code] = (_stat.faults[code] || 0) + 1; }

  /**
   * 扫一遍三源，返回逐源读数。**只读**：不写 store、不删任何一条。
   * @param {Object} [opts] `{maxLen}` — 超过则覆盖 refine 自己的 maxLen。
   */
  function scan(opts) {
    var o = opts || {};
    var at = clockWall();
    var R = WA.refine;
    if (!R || typeof R.merge !== 'function' || typeof R.condense !== 'function') {
      fault('module-missing');
      return { ok: false, reason: 'module-missing', version: VERSION, at: at, maxLen: null, sources: [], totals: zeroTotals() };
    }
    var cfg = (typeof R.getSettings === 'function') ? (R.getSettings() || {}) : {};
    if (cfg.enabled === false) {
      fault('disabled');
      return { ok: false, reason: 'disabled', version: VERSION, at: at, maxLen: num(cfg.maxLen), sources: [], totals: zeroTotals() };
    }
    var cap = num(o.maxLen) || num(cfg.maxLen) || 120;
    var s = state();
    var rowsOut = [];
    var totals = zeroTotals();
    for (var i = 0; i < SOURCES.length; i++) {
      var src = SOURCES[i];
      var got = textsOf(src.pick(s), src.field);
      var m = R.merge(got.texts);
      if (!m || m.ok !== true) { fault('merge-failed'); continue; }
      // 两步分开只为了在中间取「超长几条」这个读数；
      //   顺序与 refine.polish() 的复合逐字一致（merge → condense），不是另一套算法。
      var long = 0;
      for (var j = 0; j < m.rows.length; j++) if (m.rows[j].length > cap) long++;
      var c = R.condense(m.rows, cap);
      if (!c || c.ok !== true) { fault('condense-failed'); continue; }
      var groups = Array.isArray(m.merged) ? m.merged : [];
      rowsOut.push({
        id: src.id, label: src.label,
        raw: got.texts.length, kept: c.rows.length,
        dropped: num(m.dropped) || 0, long: long,
        groupTotal: groups.length,
        groups: groups.slice(0, 6).map(function (g) {
          return { key: clip(g && g.key, 60), n: num(g && g.n) || 0 };
        }),
        skipped: got.skipped + (num(m.skipped) || 0)
      });
      totals.raw += got.texts.length;
      totals.kept += c.rows.length;
      totals.dropped += num(m.dropped) || 0;
      totals.long += long;
      totals.groups += groups.length;
      totals.skipped += got.skipped;
    }
    _stat.scans++;
    _stat.last = { at: at, raw: totals.raw, kept: totals.kept, dropped: totals.dropped, long: totals.long };
    return { ok: true, version: VERSION, at: at, maxLen: cap, sources: rowsOut, totals: totals };
  }

  /**
   * 面向界面的读数面：不拿「读不到」冲「干净」。
   * why 四值：`module-missing` / `disabled` / `no-archive` / `ok`。
   * ⚠ 总开关关着用的是本仓的**既有码 `disabled`**（night-watch / fire-watch 那一批同码），
   *   不编 `refine-disabled` 这种带模块名的新码 —— 新码要配一条可跑见证，
   *   而「总开关关着」这件事本就已有统一语义。
   */
  function view() {
    var r = scan();
    if (!r.ok) {
      return { ok: false, version: VERSION, ready: false, why: r.reason, line: '', sources: [], totals: r.totals, maxLen: r.maxLen, at: r.at };
    }
    var why = r.totals.raw > 0 ? 'ok' : 'no-archive';
    return {
      ok: true, version: VERSION, ready: true, why: why,
      maxLen: r.maxLen, at: r.at, sources: r.sources, totals: r.totals,
      line: lineOf(r)
    };
  }

  /** 一行读数（面板与诊断面共用同一句：**两处各写一遍必然漂移**）。 */
  function lineOf(r) {
    if (!r || !r.ok) return '';
    var t = r.totals;
    if (!t.raw) return '档案精编：三源均为空（0 条）—— 没东西可编，不是「已经很干净」';
    return '档案精编：' + t.raw + ' → ' + t.kept + '（可省 ' + t.dropped + '）· 超长 ' + t.long
      + '（上限 ' + r.maxLen + ' 字）· 重复组 ' + t.groups + '（本面只读，不删）';
  }

  /** 单行摘要（供注入面 / 工具面复用）。 */
  function summaryText() {
    var v = view();
    if (!v.ok) return '';
    // 一行读数只有一份（lineOf）：「三源均为空」这句话写在那里，不在这里另写一个短版
    //   —— 两份读数写同一件事，迟早会漂移。
    return v.line || ('档案精编：' + v.why);
  }

  /** 逐源明细（诊断面按钮的输出）。 */
  function diagnose() {
    var r = scan();
    var L = [];
    if (!r.ok) {
      L.push('[档案精编] v' + VERSION + ' —— 不可编：' + r.reason);
      if (r.reason === 'disabled') L.push('  总开关关着：请先在设置面打开 engines/refine');
      if (r.reason === 'module-missing') L.push('  engines/refine.js 未装载（装载序或版本对不上）');
      return L.join(NL);
    }
    L.push('[档案精编预览] v' + VERSION + ' · 压短上限 ' + r.maxLen + ' 字 · 零写（不落盘）');
    for (var i = 0; i < r.sources.length; i++) {
      var s = r.sources[i];
      L.push('[' + s.label + '] 原 ' + s.raw + ' 条 → 精编 ' + s.kept + ' 条（可省 ' + s.dropped
        + ' · 超长 ' + s.long + ' · 跳过非字符串 ' + s.skipped + '）');
      if (!s.raw) L.push('  本源为空（不是「已干净」）');
      for (var j = 0; j < s.groups.length; j++) {
        L.push('  · 重复组 ×' + s.groups[j].n + '：' + s.groups[j].key);
      }
      if (s.groupTotal > s.groups.length) L.push('  · 另有 ' + (s.groupTotal - s.groups.length) + ' 个重复组未列出');
    }
    var t = r.totals;
    L.push('[合计] 原 ' + t.raw + ' → ' + t.kept + '（可省 ' + t.dropped + '）· 超长 ' + t.long + ' · 重复组 ' + t.groups);
    L.push('[纪律] 本面只预览：不删除任何一条档案、不写盘。落盘由调用方在事务里做。');
    return L.join(NL);
  }

  /** 计数口只读上一次扫描的摘要，**不触发新扫描**（否则计数口自己让它数自己）。 */
  function stat() {
    return { scans: _stat.scans, last: _stat.last ? Object.assign({}, _stat.last) : null, faults: Object.assign({}, _stat.faults) };
  }

  function __reset() { _stat.scans = 0; _stat.last = null; _stat.faults = {}; return { ok: true }; }

  WA.refineBridge = {
    VERSION: VERSION,
    SOURCE_IDS: SOURCES.map(function (x) { return x.id; }),
    scan: scan,
    view: view,
    summaryText: summaryText,
    diagnose: diagnose,
    stat: stat,
    __reset: __reset
  };

  if (typeof WA.registerModule === 'function') WA.registerModule('engines/refine-bridge.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/refine-bridge 已加载（' + VERSION + '）');
  }
})();

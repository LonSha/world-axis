/**
 * WorldAxis engines/calendar-custom-bridge.js (v2.603.0) — 自定义历法面（R278 / CAL-1）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   `engines/calendar-custom.js` 的边界**是三条承诺**（setMonths/getMonths、label、
 *   labelBack）+ 六条否定式边界，但 `WA.calendarPlan` **零产品读者**（
 *   `core/evict.js` 只认站点名、`ui/settings.js` 只画开关、`engines/tool-diag.js`
 *   只 `st('calendarPlan')` 打一行）。也就是说：**承诺写在注释里，兑现写在函数里，
 *   而「两者差在哪里」没有任何地方回答**。
 *
 *   本轮逐条对齐后，现场差出一处硬缺口（见 `contract()`）：
 *     注释 ③ 承诺 `labelBack(dayIndex, atDay)`「历史楼用当时的历法算」，
 *     导出表里**没有这个函数**。全仓范围内 `labelBack` 只出现一次 —— 就是那句注释本身。
 *   这不是“还没写”，而是“注释把未完成写成已完成”：读注释的人会以为历史楼口径已就绪。
 *
 * ── 它做什么（15 导出）──────────────────────────────────────
 *   `contract()`  现读导出表 vs 三条承诺 → 报 `missing` / `extra`
 *                 （多出来的导出不算缺口，只是没写进承诺的“超额”）
 *   `switches()`  报实现默认值与文档口径，相**反**时报 `contradict`。
 *                 现场：`DEF.enabled = true`，而边界 1 原文写着「总开关默认关闭」。
 *   `table()`     月表读数：月数 / 一年总天数 / 坏项数（月名逐个不回显）
 *   `bypass()`    写口是否受开关约束 —— 用 `Function.prototype.toString` **静态**判，
 *                 不真调（`clear()` 会写盘）。现场：`setMonths` 看开关、`clear` **不看**。
 *                 ⇒ 「关着开关也能把月表清空」：否定式边界 1 只说 label 会返回 null，
 *                 没说写口也一起关。
 *   `faults()`    五码含义 + 表外码
 *   `audit()` / `lineOf()` / `summaryText()` / `diagnose()` / `stat()` / `__reset()`
 *
 * ── 八值 verdict（优先级即顺序）───────────────────────────────
 *   `module-missing` > `no-settings` > `drift` > `disabled` > `never-set`
 *   > `table-empty` > `unknown-only` > `ok`
 *   **`drift` 压过运行态是刻意的**：读数的第一句该是「这份注释承诺了它没做的事」，
 *   而不是「它没跑过」—— 后者在结构修好以后才有意义。运行态不丢掉，`audit().state`
 *   始终带着，`lineOf()` 在 drift 时也会附一句「且 X」。
 *   why 四值：`ok` / `module-missing` / `no-settings` / `drift`。
 *
 * ── 边界（全是否定式，与本仓同一口径）────────────────────────────
 *   1 **零跑**：不调 `setMonths` / `clear`（会写盘）、不调 `label` / `labelNow`
 *     （`stat.labels` / `stat.unknowns` / `stat.blocked` 会变，读数就不干净了）。
 *     `getMonths()` 是纯读（内部 `plan()` 只 `store.get()`），可以调。
 *   2 **零写**：不调 `setSettings`。
 *   3 **只报结构，不回显月名**：月名是用户自定义的设定名（可能含剧情/剧透），
 *     `table()` 只回个数与总天数，一个月名都不出。
 *   4 承诺表与文档口径都**写死在本文件里**并由专锁去核源文件原文：
 *     口径漂移（注释改了口径、或 labelBack 补上了）会让专锁红，而不是让桥接静默跟随。
 *   5 `no-settings` 与 `never-set` 分开：前者是「开关都读不到」，后者是「开关读到了、
 *     一次没设过月表」。两者在旧读数上同形，后果不同。
 *   6 读数唯一出口：所有判断从 `audit()` 出，`lineOf()` 只做格式化，不另算。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const VERSION = '2.603.0';
  const NAME = 'calendarPlan';
  const WHY = ['ok', 'module-missing', 'no-settings', 'drift'];
  const VERDICT = ['module-missing', 'no-settings', 'drift', 'disabled', 'never-set', 'table-empty', 'unknown-only', 'ok'];
  /** 注释里承诺的三个方法（① 算两条）。顺序即注释顺序。 */
  const CONTRACT = ['setMonths', 'getMonths', 'label', 'labelBack'];
  /** engines/calendar-custom.js 边界 1 的原文口径：「总开关默认关闭」。 */
  const DOC_ENABLED_DEFAULT = false;
  const FAULT_TEXT = {
    'disabled': '开关关着 —— 但只有写月表与 label 看它，clear() 不看（见 bypass）',
    'bad-value': '月表形态不对（非 [{name,days}] 或 days 非正整数）—— 整批拒收，不做半份生效',
    'too-long': '月数超过 maxMonths（bounds 1..128，默认 48）',
    'store-unavailable': 'transact 没落地或回 ok:false —— 写盘失败，月表未变',
    'empty-text': '没登记月表 / 总天数 <= 0 —— 显式「日期待确认」，不拿 30 天/月凑答案'
  };

  const stat = { audits: 0, drift: 0, missing: 0, unguarded: 0, lastWhy: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; }

  function eng() {
    const api = WA[NAME];
    return (api && typeof api === 'object') ? api : null;
  }
  function fnText(api, key) {
    try { const f = api[key]; return typeof f === 'function' ? String(f) : ''; } catch (e) { return ''; }
  }
  /**
   * 剥注释再判 —— 否则一句「本函数不看 enabled」的注释就能把静态判骗过去。
   * 也不能只认 `settings().enabled`：引擎本地那份叫 `settings()`，而外部/后续实现
   * 可能写 `getSettings().enabled`。判据是「函数体里到底有没有 enabled 这个词」，
   * 不锚定调用形态。
   */
  function stripComments(src) {
    return String(src || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  }

  /** 现读导出表 vs 三条承诺。多出来的导出记 extra，不算缺口。 */
  function contract() {
    const api = eng();
    if (!api) return { ok: false, why: 'module-missing', promised: CONTRACT.slice(), missing: CONTRACT.slice(), extra: [] };
    const missing = CONTRACT.filter(function (k) { return typeof api[k] !== 'function'; });
    const extra = Object.keys(api).filter(function (k) { return typeof api[k] === 'function' && CONTRACT.indexOf(k) < 0; });
    return { ok: missing.length === 0, why: missing.length ? 'drift' : 'ok', promised: CONTRACT.slice(), missing: missing, extra: extra };
  }

  /** 开关面：实现默认值 vs 文档口径。 */
  function switches() {
    const api = eng();
    if (!api) return { ok: false, why: 'module-missing', regs: 0 };
    const regs = (WA.__settingsRegs || []).filter(function (r) { return r && r.module === NAME; });
    if (!regs.length) return { ok: false, why: 'no-settings', regs: 0 };
    const reg = regs[0] || {};
    const def = reg.def || {};
    const bounds = reg.bounds || {};
    let cur = {};
    try {
      cur = (WA.settingsBus && typeof WA.settingsBus.read === 'function') ? WA.settingsBus.read(reg) : {};
    } catch (e) { noteFault('settings-read'); cur = {}; }
    const curEnabled = (cur && typeof cur.enabled === 'boolean') ? cur.enabled : !!def.enabled;
    const defEnabled = (typeof def.enabled === 'boolean') ? def.enabled : null;
    return {
      ok: true, why: 'ok', regs: regs.length,
      defEnabled: defEnabled, curEnabled: curEnabled,
      docEnabledDefault: DOC_ENABLED_DEFAULT,
      contradict: defEnabled !== null && defEnabled !== DOC_ENABLED_DEFAULT,
      maxMonths: (typeof def.maxMonths === 'number') ? def.maxMonths : null,
      bounds: Array.isArray(bounds.maxMonths) ? bounds.maxMonths.slice() : null
    };
  }

  /** 月表读数：只回个数与总天数，一个月名都不出。 */
  function table() {
    const api = eng();
    if (!api) return { ok: false, why: 'module-missing', count: 0, yearDays: 0, badItems: 0 };
    let months;
    try { months = api.getMonths(); } catch (e) { noteFault('table-read'); return { ok: false, why: 'bad-value', count: 0, yearDays: 0, badItems: 0 }; }
    const list = Array.isArray(months) ? months : [];
    let total = 0, bad = 0;
    for (let i = 0; i < list.length; i++) {
      const d = Number(list[i] && list[i].days);
      if (!isFinite(d) || d <= 0 || Math.floor(d) !== d) { bad++; continue; }
      total += d;
    }
    return { ok: true, why: 'ok', count: list.length, yearDays: total, badItems: bad, namesHidden: true };
  }

  /** 写口是否受开关约束 —— 静态判源码文本，不真调。 */
  function bypass() {
    const api = eng();
    if (!api) return { ok: false, why: 'module-missing', guards: {}, unguarded: [] };
    const looks = function (k) { return /enabled/.test(stripComments(fnText(api, k))); };
    const guards = { setMonths: looks('setMonths'), clear: looks('clear'), label: looks('label') };
    const unguarded = Object.keys(guards).filter(function (k) { return guards[k] === false; });
    return { ok: unguarded.length === 0, why: unguarded.length ? 'drift' : 'ok', guards: guards, unguarded: unguarded, static: true };
  }

  /** 五码含义 + 表外码。 */
  function faults() {
    const api = eng();
    let raw = {};
    try { const s = api && typeof api.stat === 'function' ? api.stat() : null; raw = (s && s.faults) || {}; } catch (e) { raw = {}; }
    const known = [], unknown = [];
    Object.keys(raw).forEach(function (k) {
      const n = raw[k];
      if (!n) return;
      if (FAULT_TEXT[k]) known.push({ code: k, count: n, text: FAULT_TEXT[k] });
      else unknown.push({ code: k, count: n });
    });
    return { ok: unknown.length === 0, known: known, unknown: unknown, codes: Object.keys(FAULT_TEXT).length };
  }

  /** 运行态（与结构态分开算，drift 时不丢失）。 */
  function stateOf(st, tb, sw) {
    if (sw && sw.curEnabled === false) return 'disabled';
    if (!st || !(Number(st.sets) > 0)) return 'never-set';
    if (!tb || !(Number(tb.count) > 0)) return 'table-empty';
    if (Number(st.unknowns) > 0 && !(Number(st.labels) > 0)) return 'unknown-only';
    return 'ok';
  }

  /** 唯一判断出口。 */
  function audit() {
    stat.audits++;
    const c = contract();
    if (!c.ok && c.why === 'module-missing') {
      stat.lastWhy = 'module-missing'; noteFault('module-missing'); stat.missing += c.missing.length;
      return { why: 'module-missing', verdict: 'module-missing', state: 'module-missing', contract: c, switches: { why: 'module-missing' }, table: { count: 0, yearDays: 0 }, bypass: { unguarded: [] }, faults: faults(), stat: null };
    }
    const sw = switches();
    if (sw.why === 'no-settings') {
      stat.lastWhy = 'no-settings';
      return { why: 'no-settings', verdict: 'no-settings', state: 'no-settings', contract: c, switches: sw, table: { count: 0, yearDays: 0 }, bypass: { unguarded: [] }, faults: faults(), stat: null };
    }
    const tb = table();
    const bp = bypass();
    const ft = faults();
    let engineStat = null;
    try { engineStat = (typeof WA.calendarPlan.stat === 'function') ? WA.calendarPlan.stat() : null; } catch (e) { engineStat = null; }
    const state = stateOf(engineStat, tb, sw);
    const drift = (c.missing.length > 0) || !!sw.contradict || bp.unguarded.length > 0 || tb.badItems > 0 || ft.unknown.length > 0;
    if (c.missing.length > 0) stat.missing += c.missing.length;
    if (bp.unguarded.length > 0) stat.unguarded += bp.unguarded.length;
    const verdict = drift ? 'drift' : state;
    if (drift) stat.drift++; else if (state === 'ok') { /* 健康 */ }
    stat.lastWhy = drift ? 'drift' : 'ok';
    return { why: drift ? 'drift' : 'ok', verdict: verdict, state: state, contract: c, switches: sw, table: tb, bypass: bp, faults: ft, stat: engineStat };
  }

  /** 一句话读数：结论在首字节。 */
  function lineOf(a) {
    const r = a || audit();
    if (r.verdict === 'module-missing') return '缺引擎：WA.' + NAME + ' 不在 —— 承诺查无此处';
    if (r.verdict === 'no-settings') return '缺开关：__settingsRegs 里没有 ' + NAME + ' —— 开关面都没挂上';
    if (r.verdict === 'drift') {
      const bits = [];
      if (r.contract.missing.length) bits.push('注释承诺了却没实现：' + r.contract.missing.join('/'));
      if (r.switches.contradict) bits.push('默认值相反（实现 ' + r.switches.defEnabled + '，文档 ' + r.switches.docEnabledDefault + '）');
      if (r.bypass.unguarded.length) bits.push('写口绕过开关：' + r.bypass.unguarded.join('/'));
      if (r.table.badItems > 0) bits.push('月表坏项 ' + r.table.badItems + ' 条');
      if (r.faults.unknown.length) bits.push('表外码 ' + r.faults.unknown.map(function (x) { return x.code; }).join('/'));
      return '实锤「解释不在」：' + bits.join('；') + '（运行态：' + r.state + '）';
    }
    if (r.verdict === 'disabled') return '开关关着且无结构缺口：label 会返回 null，月表 ' + r.table.count + ' 项不动';
    if (r.verdict === 'never-set') return '引擎在、开关在、月表一次没设过（sets=0）：历法标签全都落到「日期待确认」';
    if (r.verdict === 'table-empty') return '设过月表但现在是空的（sets=' + (r.stat && r.stat.sets) + '，clear 过的痕迹）：同样只能待确认';
    if (r.verdict === 'unknown-only') return '只产出过「待确认」（labels=' + (r.stat && r.stat.labels) + '，unknowns=' + (r.stat && r.stat.unknowns) + '）：一次成功标签都没有';
    return '结构齐、月表 ' + r.table.count + ' 项 / 一年 ' + r.table.yearDays + ' 日、标签 ' + (r.stat && r.stat.labels) + ' 次：到了';
  }

  function summaryText() { const a = audit(); return { verdict: a.verdict, state: a.state, why: a.why, line: lineOf(a) }; }

  function diagnose() {
    const a = audit();
    const out = { verdict: a.verdict, state: a.state, why: a.why, fixes: [] };
    if (a.verdict === 'module-missing') out.fixes.push('先确认 engines/calendar-custom.js 是否在装载面（index.js / tests/run.js）');
    if (a.verdict === 'no-settings') out.fixes.push('把 __REG 推进 WA.__settingsRegs（引擎自注册那一行）');
    if (a.contract && a.contract.missing.length) out.fixes.push('补 ' + a.contract.missing.join('/') + '，或把注释 ③ 改成「未实现」—— 两者必须有一');
    if (a.switches && a.switches.contradict) out.fixes.push('要么把 DEF.enabled 改 false，要么把边界 1 的原文改掉');
    if (a.bypass && a.bypass.unguarded.length) out.fixes.push('给 ' + a.bypass.unguarded.join('/') + ' 补 enabled 判定，或在边界里写明「clear 不受开关约束」是有意的');
    if (!out.fixes.length) out.fixes.push('无结构缺口；剩余动作只可能是设月表/开开关这类产品操作');
    return out;
  }

  function statOut() {
    return { version: VERSION, audits: stat.audits, drift: stat.drift, missing: stat.missing, unguarded: stat.unguarded, lastWhy: stat.lastWhy, faults: Object.assign({}, stat.faults), last: { audits: stat.audits, drift: stat.drift, missing: stat.missing, unguarded: stat.unguarded, lastWhy: stat.lastWhy, faults: Object.assign({}, stat.faults) } };
  }
  function __reset() { stat.audits = 0; stat.drift = 0; stat.missing = 0; stat.unguarded = 0; stat.lastWhy = ''; stat.faults = {}; }

  WA.calendarPlanBridge = {
    NAME: NAME, VERDICT: VERDICT.slice(), WHY: WHY.slice(), CONTRACT: CONTRACT.slice(), version: VERSION,
    audit: audit, bypass: bypass, contract: contract, diagnose: diagnose, faults: faults,
    lineOf: lineOf, stat: statOut, summaryText: summaryText, switches: switches, table: table,
    __reset: __reset
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/calendar-custom-bridge.js', { kind: 'engine', ver: VERSION });
})();

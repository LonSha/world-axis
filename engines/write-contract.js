/**
 * WorldAxis engines/write-contract.js（v2.280.0 · V7 OPV7-4）
 * 写口契约自描述：每个可调用写口「要什么形状的入参、会因什么被拒、拒了该怎么办」。
 *
 * 【它治什么（现场立据，tools/v7probes/p_write_contract.js）】
 *   实测：3335 个产品导出口函数里，**95 个**在拒收时带 `hint` —— 那些 hint 是写作者
 *   当场写下的「所以你到底该怎么做」，比如：
 *     · `contractAudit.audit`  ：hint 说明缺的是哪几路来源
 *     · `production.deliver`   ：『工期没走完就交不出货（两日单首日不出货）』
 *     · `worldbook.safeUpdateEntry`：『条目内容已被外部手动修改，拒绝静默覆盖（需 force: true）』
 *   这些提示**只存在于函数体内部**：调用方拿到 `{ok:false, reason, hint}` 才知道该怎么办 ——
 *   而「拿到之前」它无从知道。于是同一类调用要试错三轮才试对，而每一轮都要真的写一次世界
 *   （OPV7-1 的派发器实测就撞在这上面：51 次写口调用里 missing-fields / bad-kind / disabled 占压倒多数）。
 *   本模块把这些**已经写在源码里的**信息变成可查询的：`contractOf(ns, method)`。
 *
 * 【三条硬纪律】
 *   ① **不新写一份契约**，只把已经在源码里的东西读出来。真源是 `Function.prototype.toString`
 *      的函数体 —— 那正是引擎自己写的那份。任何「另写一张表描述写口要什么」的做法都会漂移：
 *      引擎改了，表还在念旧的，而表比引擎更容易被相信（本仓点名过的第二真源）。
 *   ② **读不到就说读不到**。宿主若跑在 `[native code]` 环境（打包/压缩/特殊注入），
 *      `describe()` 一律报 `readable:false` 并说明原因，**绝不返回空契约冒充「没有约束」**。
 *      「没有约束」与「读不出来」在调用方眼里长得一样，但处置完全相反。
 *   ③ **零写、零缓存落盘**。缓存只在内存里，且按「函数体文本指纹」失效 ——
 *      同一份源码重复读零成本，源码一变立刻重读（拿旧契约指导新引擎是最坏的一种过期）。
 *
 * 【契约里到底有什么（都来自函数体文本，逐项可核）】
 *   · `reasons`  ：函数体里出现的全部拒收码字面量（`reason: 'x'` / `refuse('x'` / `stat.lastReason = 'x'`）
 *   · `hints`    ：拒收码 → hint 文案（**仅在函数体内真写了 hint 时才有**，不推断）
 *   · `guards`   ：前置闸的形态（`!settings().enabled` ⇒ 开关闸；`!clean(x)` ⇒ 必填闸）
 *   · `params`   ：形参名列表（`toString` 能直接拿到，不需要解析）
 *   · `arity`    ：形参个数
 *   · `readable` ：能不能读到函数体（读不到时其余字段一律为 null，不给空数组冒充「没有」）
 *
 * 【为什么 hints 用「就近归属」而不是精确解析】
 *   引擎的拒收形态有四种主流写法（`return { ok:false, reason:'x', hint:'y' }` /
 *   `return refuse('x', { hint:'y' })` / `stat.lastReason='x'; return { reason:'x' }` /
 *   多分支共用一个 refuse 辅助函数）。要做到**精确**就必须把每个辅助函数的定义也读进来、
 *   做控制流分析 —— 那是写一个 JS 解释器。
 *   本模块取的是**保守归属**：把函数体按 `reason:` / `refuse(` 切段，每段里出现的第一个 `hint:`
 *   归给该段的 reason。段内没有 hint 就**不归属**（宁缺勿错）。
 *   这个规则是**可被证伪的**：探针会拿三个已知带 hint 的真实写口逐条核对，
 *   并构造一个「hint 出现在别的 reason 段里」的假函数验证它不会被错配。
 *
 * 【消费方（每个口都要有真读者，否则就是过度导出）】
 *   · `contractOf`  —— tool-diag 的诊断节（维护者面）；
 *   · `explain`     —— 拒收恢复路径：拿到 `{ok:false,reason}` 时查「这个码通常因为什么」；
 *   · `summaryText` —— 概览页一行（多少写口带自述）。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  const LS_KEY = 'worldaxis_write_contract_settings_v1';
  const DEF = { enabled: true, maxScan: 4000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'writeContract', bounds: { maxScan: [100, 8000] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus
      ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    return WA.settingsBus
      ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, merged))
      : merged;
  }

  const stat = { scans: 0, lastAt: 0, entries: 0, withHint: 0, unreadable: 0, lastReason: '' };
  function note(r) { stat.lastReason = r; }

  // ── 内存缓存：键 = ns.mem，值 = { sig, rec } ─────────────────────────────
  //   sig 是函数体文本的长度 + 一个轻量指纹。源码一变，sig 变 ⇒ 重读。
  //   不做 LRU：条目上限由 maxScan 控制，超了就不再多记（如实报 truncated）。
  const __cache = {};
  function sigOf(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return text.length + ':' + h.toString(36);
  }

  // ── 从函数体文本里抽契约 ──────────────────────────────────────────────────
  //   ⚠ 这些正则刻意**不碰注释**：引擎注释极多，注释里的 `reason: 'x'` 是文档不是码。
  //     故先用一个极简的「去注释但保留字符串」剥离器（与 tests/test-surface-gate.js 同思路，
  //     但那一个是文件级、这里只需要函数级，且必须保留字符串内容因为 code 就在字符串里）。
  function stripComments(t) {
    let out = '', i = 0, n = t.length;
    while (i < n) {
      const c = t.charAt(i), d = t.charAt(i + 1);
      if (c === '/' && d === '/') { while (i < n && t.charAt(i) !== '\n') i++; continue; }
      if (c === '/' && d === '*') { i += 2; while (i < n && !(t.charAt(i) === '*' && t.charAt(i + 1) === '/')) i++; i += 2; continue; }
      if (c === "'" || c === '"' || c === '`') {
        const q = c; out += c; i++;
        while (i < n) {
          const k = t.charAt(i);
          if (k === '\\') { out += k + t.charAt(i + 1); i += 2; continue; }
          out += k; i++;
          if (k === q) break;
        }
        continue;
      }
      out += c; i++;
    }
    return out;
  }

  //  拒收形态的三种主流写法都认：`reason: 'x'` / `refuse('x'` / `lastReason = 'x'`。
  //  刻意**不认** `reason: someVar`（变量值在运行期才知道，静态读只能猜）。
  const RE_REASON_OBJ = /reason:\s*'([A-Za-z0-9_\-]+)'/g;
  const RE_REASON_CALL = /\brefuse\(\s*'([A-Za-z0-9_\-]+)'/g;
  const RE_REASON_STAT = /lastReason\s*=\s*'([A-Za-z0-9_\-]+)'/g;
  const RE_HINT = /hint:\s*'((?:[^'\\]|\\.)*)'/g;

  /** 保守归属：每个 hint 归给它前面**最近一个** reason；中间若又出现 reason，则归后者。 */
  function attribHints(body) {
    // 收全部 (位置, 类型, 值) 事件，按位置排序后一次扫描
    const ev = [];
    let m;
    RE_REASON_OBJ.lastIndex = 0; while ((m = RE_REASON_OBJ.exec(body)) !== null) ev.push({ at: m.index, k: 'r', v: m[1] });
    RE_REASON_CALL.lastIndex = 0; while ((m = RE_REASON_CALL.exec(body)) !== null) ev.push({ at: m.index, k: 'r', v: m[1] });
    RE_REASON_STAT.lastIndex = 0; while ((m = RE_REASON_STAT.exec(body)) !== null) ev.push({ at: m.index, k: 'r', v: m[1] });
    RE_HINT.lastIndex = 0; while ((m = RE_HINT.exec(body)) !== null) ev.push({ at: m.index, k: 'h', v: m[1] });
    ev.sort(function (a, b) { return a.at - b.at; });
    const reasons = [];
    const hints = {};
    let cur = null;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.k === 'r') {
        if (reasons.indexOf(e.v) < 0) reasons.push(e.v);
        cur = e.v;
      } else if (cur) {
        // 同一 reason 多个 hint：**只留第一个**（引擎里后者多是兜底分支，前者更具体）
        if (hints[cur] === undefined) hints[cur] = e.v;
      }
    }
    return { reasons: reasons, hints: hints };
  }

  /** 前置闸：只认两种能在文本上判死的形态，其余一律不猜。 */
  function guardsOf(body) {
    const out = [];
    // ① 开关闸：`!settings().enabled` / `!cfg.enabled`（引擎统一形态）
    if (/!\s*(settings\(\)|cfg|s)\.enabled/.test(body)) out.push('switch');
    // ② 必填闸：`!clean(x` / `!personId(` / `!numOrNull(` —— 只认「取完值再判空」这一形态
    if (/if\s*\(\s*!\s*(clean|personId|num|numOrNull|tidy|str)\s*\(/.test(body)) out.push('required');
    return out;
  }

  /** 单条描述（不做 I/O，纯文本处理，可单独测）。 */
  function describeBody(body, params) {
    const clean = stripComments(String(body || ''));
    const at = attribHints(clean);
    return {
      readable: true,
      params: (params || []).slice(),
      arity: (params || []).length,
      reasons: at.reasons,
      hints: at.hints,
      guards: guardsOf(clean)
    };
  }

  /** 读一个导出函数的契约。`contractOf(ns, method)`。 */
  function contractOf(ns, method) {
    const N = String(ns || ''), M = String(method || '');
    if (!N || !M) return { ok: false, reason: 'missing-fields', hint: 'contractOf(ns, method) 两个都要给' };
    const mod = WA[N];
    if (!mod || typeof mod !== 'object') return { ok: false, reason: 'unknown-namespace', ns: N };
    let fn = null;
    try { fn = mod[M]; } catch (e) { fn = null; }
    if (typeof fn !== 'function') return { ok: false, reason: 'unknown-method', ns: N, method: M };
    let text = '';
    try { text = Function.prototype.toString.call(fn); } catch (e) { text = ''; }
    // ⚠ 读不到函数体时**不许返回空契约**：空契约在调用方眼里等于「没有约束」
    if (!text || text.indexOf('[native code]') >= 0) {
      stat.unreadable++;
      note('unreadable');
      return { ok: true, ns: N, method: M, readable: false,
        why: !text ? 'toString 返回空串（不可读的函数体）' : '函数体是 [native code]（打包/注入环境）',
        params: null, arity: null, reasons: null, hints: null, guards: null };
    }
    const sig = sigOf(text);
    const key = N + '.' + M;
    const hit = __cache[key];
    if (hit && hit.sig === sig) return Object.assign({ ok: true, ns: N, method: M, cached: true }, hit.rec);

    // 形参：从函数头取。toString 的第一行要么 `function name(a, b) {`，要么 `(a, b) => {`。
    let params = [];
    try {
      const head = text.slice(0, text.indexOf('{'));
      const lp = head.indexOf('('), rp = head.lastIndexOf(')');
      if (lp >= 0 && rp > lp) {
        params = head.slice(lp + 1, rp).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      }
    } catch (e) { params = []; }
    const rec = describeBody(text, params);
    // 缓存写入不做容量淘汰：条目数天然被「导出函数总数」封顶（同一个 ns.mem 永远只有一格），
    //   而扫描面上限已经由 settings.maxScan 控制。加一版 LRU 只会让「为什么这次没命中」
    //   变成一个新的不可解释变量 —— 缓存要简单到能被相信。
    __cache[key] = { sig: sig, rec: rec };
    return Object.assign({ ok: true, ns: N, method: M, cached: false }, rec);
  }

  /** 拒收恢复：拿到 `{ok:false, reason}` 时查「这个码在这个写口通常因为什么」。 */
  function explain(ns, method, reason) {
    const c = contractOf(ns, method);
    if (!c.ok) return c;
    if (!c.readable) return { ok: false, reason: 'unreadable', ns: ns, method: method, why: c.why };
    const R = String(reason || '');
    if (!R) return { ok: false, reason: 'missing-reason', ns: ns, method: method };
    if ((c.reasons || []).indexOf(R) < 0) {
      return { ok: true, ns: ns, method: method, code: R, known: false,
        why: '这个写口的函数体里没有出现该拒收码 —— 要么它来自更底层（被调函数），要么码名传错了' };
    }
    const h = (c.hints || {})[R];
    return { ok: true, ns: ns, method: method, code: R, known: true,
      hint: h === undefined ? null : h,
      why: h === undefined
        ? '该码在这个写口里没有自带 hint（作者没写下一步）—— 猜不出来，如实说没有'
        : undefined,
      guards: (c.guards || []).slice() };
  }

  /** 全表盘点（只读；扫描面上限由 maxScan 控制）。 */
  function scan() {
    stat.scans++;
    try { stat.lastAt = (WA.clock && typeof WA.clock.wallNow === 'function') ? WA.clock.wallNow() : Date.now(); }
    catch (e) { stat.lastAt = Date.now(); }
    const cap = Number(settings().maxScan) || DEF.maxScan;
    const rows = [];
    let scanned = 0, truncated = false;
    let names = [];
    try { names = Object.keys(WA); } catch (e) { names = []; }
    for (let i = 0; i < names.length; i++) {
      const ns = names[i];
      if (ns === 'modules') continue;
      let mod = null;
      try { mod = WA[ns]; } catch (e) { mod = null; }
      if (!mod || typeof mod !== 'object') continue;
      let mems = [];
      try { mems = Object.keys(mod); } catch (e) { mems = []; }
      for (let j = 0; j < mems.length; j++) {
        let fn = null;
        try { fn = mod[mems[j]]; } catch (e) { fn = null; }
        if (typeof fn !== 'function') continue;
        if (scanned >= cap) { truncated = true; break; }
        scanned++;
        const c = contractOf(ns, mems[j]);
        if (!c || !c.ok) continue;
        if (!c.readable) { rows.push({ ns: ns, method: mems[j], readable: false, reasons: null, hints: null }); continue; }
        if (!c.reasons || !c.reasons.length) continue;
        rows.push({ ns: ns, method: mems[j], readable: true, arity: c.arity,
          params: c.params, reasons: c.reasons, hints: c.hints, guards: c.guards });
      }
      if (truncated) break;
    }
    const withHint = rows.filter(function (r) { return r.hints && Object.keys(r.hints).length > 0; });
    stat.entries = rows.length;
    stat.withHint = withHint.length;
    stat.unreadable = rows.filter(function (r) { return r.readable === false; }).length;
    return { ok: true, scanned: scanned, truncated: truncated, cap: cap,
      entries: rows.length, withHint: withHint.length, unreadable: stat.unreadable,
      rows: rows };
  }

  /** 一行人话（概览页 / 诊断面共用；读不到就说读不到）。 */
  function summaryText() {
    const r = scan();
    if (!r.ok) return '写口契约不可用：' + (r.why || '未知');
    let s = '可自述的写口 ' + r.entries + ' 个（扫过 ' + r.scanned + ' 个导出函数）：'
      + r.withHint + ' 个在拒收时自带下一步提示';
    if (r.unreadable) s += '、' + r.unreadable + ' 个函数体读不到（打包/注入环境，不冒充「没有约束」）';
    if (r.truncated) s += '；⚠ 扫描面被 maxScan=' + r.cap + ' 截断，读数只是下界';
    return s + '。';
  }

  WA.writeContract = {
    getSettings: settings,
    setSettings: saveSettings,
    contractOf: contractOf,
    explain: explain,
    scan: scan,
    summaryText: summaryText,
    stat: function () { return Object.assign({}, stat); },
    // describeBody 刻意**不导出**：它是纯文本处理，产品侧没有第二个消费者。
    //   要测它就测 contractOf —— 那才是真实的输入面（含 toString / 缓存 / 不可读三条分支）。
  };
})();

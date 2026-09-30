/**
 * WorldAxis engines/purify-scope.js (v2.130.0) — 净化作用域保护（缝 A2）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   `render/purifier.js` 的净化是**全文级**的：`applySafe(text)` 把正则
 *   跑在整段回复上。它的空结果守卫挡得住「被清空」，挡不住「**精确地删掉了
 *   不该删的那一段**」——规则里一个 `.*` 就能把状态栏 / MVU 块 / 结构标签吞掉，
 *   而输出仍然非空，守卫不报，用户看到的是「状态栏忽然不见了」。
 *
 *   缝合来源：The-Veridis-Lion 的「范围保护」+ story-oracle —— 原文口径是
 *   「净化只作用于正文，`<状态栏>` / 结构块 / 代码块一律剥离后再拼回」。
 *
 * ── 本模块只做两件事，每件一个硬条件 ─────────────────────────
 *   ① `protect(text)` —— 把受保护段落切出来换为占位符（返回 protected 文本 + 还原表）；
 *   ② `restore(text, table)` —— 把占位符原位换回原文（**缺失任一项即报错**）。
 *
 *   两者必须**同进同出**：调用方拿 `protect` 的结果去净化，再用 `restore`
 *   拼回。本模块不自己调 purifier（净化策略是调用方的，本模块只管「哪些不能碰」）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 **只保留受保护段，不改写正文**：占位符是唯一写入物，且写入位置在受保护段原位。
 *   2 受保护面的判据是**结构标签与围栏**（成对尖括号块、`<!-- -->` 注释块、
 *      三重反引号围栏）—— 不做语义猜测。猜不准的一律**不保护**（宁漏不放）。
 *   3 占位符必须**不可能在原文里出现**：用控制符包裹的前缀 + 序号，
 *      且构造后**逐字检查原文不含它**；撞了就换号重来。
 *   4 `restore` 必须**每一项都能换回**。占位符被净化规则吃掉（或重复）时
 *      返回失败体，**并附带已成功还原的文本**——
 *      「保护出得去回不来」是比「没保护」更坏的结局（正文会永久残留占位符）。
 *   5 不拆开嵌套：外层块包内层块时按**最外层**切（一次到位），不递归拆——
 *      递归拆会把内层的占位符重新暴露给外层还原（顺序依赖）。
 *   6 空文本、非字符串一律拒收（`empty-text` / `bad-type`），不产出占位符。
 *   7 不写 store、不落盘、不进 `SOURCES`：它是一次**文本变换**，不是世界状态。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_purifyscope_settings_v1';
  const DEF = { enabled: false, maxBlocks: 64 };
  const __REG = { key: LS_KEY, def: DEF, module: 'purifyScope', bounds: { maxBlocks: [1, 256] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { protects: 0, restored: 0, blocks: 0, charsKept: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }

  const MARK = String.fromCharCode(1) + 'WA-PS-';
  const MARK_END = '-PS-WA' + String.fromCharCode(1);

  // 受保护面：结构块 / 注释块 / 围栏 / 成对标签。不做语义猜测。
  const PATTERNS = [
    { kind: 'fence',   re: /```[\s\S]*?```/g },
    { kind: 'comment', re: /<!--[\s\S]*?-->/g },
    { kind: 'angle',   re: /<([A-Za-z\u4e00-\u9fa5][\w\u4e00-\u9fa5:-]*)\b[^>]*>[\s\S]*?<\/\1\s*>/g }
  ];

  function makeMark(i) { return MARK + i + MARK_END; }

  /**
   * 把受保护段换为占位符。
   * @returns {ok, protect, table, count, disabled?}
   */
  function protect(text) {
    if (text === undefined || text === null) { noteFault('empty-text'); return { ok: false, reason: 'empty-text' }; }
    if (typeof text !== 'string') { noteFault('bad-type'); return { ok: false, reason: 'bad-type' }; }
    if (!text) { noteFault('empty-text'); return { ok: false, reason: 'empty-text' }; }
    if (!settings().enabled) { stat.blocked++; stat.lastReason = 'disabled'; return { ok: true, protect: text, table: [], count: 0, disabled: true }; }
    const cap = settings().maxBlocks;
    const spans = [];
    const seen = {};
    PATTERNS.forEach(function (pt) {
      const flags = pt.re.flags.indexOf('g') >= 0 ? pt.re.flags : pt.re.flags + 'g';
      const re = new RegExp(pt.re.source, flags);
      let m;
      while ((m = re.exec(text)) !== null) {
        const from = m.index, to = m.index + m[0].length;
        if (seen[from]) { seen[from] = { from: from, to: Math.max(seen[from].to, to), kind: pt.kind }; }
        else { seen[from] = { from: from, to: to, kind: pt.kind }; }
        if (re.lastIndex === m.index) re.lastIndex++;
      }
    });
    Object.keys(seen).forEach(function (k) { spans.push(seen[k]); });
    spans.sort(function (a, b) { return a.from - b.from || b.to - a.to; });
    const outer = [];
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      if (outer.length && s.from < outer[outer.length - 1].to) continue;
      outer.push(s);
      if (outer.length >= cap) break;
    }
    if (!outer.length) { stat.protects++; stat.lastReason = 'no-block'; return { ok: true, protect: text, table: [], count: 0 }; }
    const table = [];
    let out = '';
    let cursor = 0;
    outer.forEach(function (s, i) {
      let mark = makeMark(i);
      let guard = 0;
      while (text.indexOf(mark) >= 0 && guard < 1000) { mark = makeMark(i + '-' + guard); guard++; }
      out += text.slice(cursor, s.from) + mark;
      cursor = s.to;
      table.push({ mark: mark, kind: s.kind, text: text.slice(s.from, s.to) });
    });
    out += text.slice(cursor);
    stat.protects++; stat.blocks += table.length;
    stat.charsKept += table.reduce(function (a, t) { return a + t.text.length; }, 0);
    stat.lastReason = 'protected';
    return { ok: true, protect: out, table: table, count: table.length };
  }

  /**
   * 原位还原。每一项都必须能换回（边界 4）。
   * @returns {ok, text} —— 失败时 `text` 仍是尽力还原后的文本（并带 missing 清单）
   */
  function restore(text, table) {
    const src = (typeof text === 'string') ? text : '';
    if (!Array.isArray(table) || !table.length) { stat.restored++; return { ok: true, text: src, count: 0 }; }
    let out = src;
    const missing = [];
    for (let i = 0; i < table.length; i++) {
      const t = table[i] || {};
      if (typeof t.mark !== 'string' || !t.mark) { missing.push('bad-entry'); continue; }
      if (out.indexOf(t.mark) < 0) { missing.push(t.kind || 'unknown'); continue; }
      out = out.split(t.mark).join(String(t.text == null ? '' : t.text));
    }
    if (missing.length) {
      noteFault('not-found');
      return { ok: false, reason: 'not-found', missing: missing, text: out,
        detail: '占位符被净化规则吃掉或重复（' + missing.join('/') + '）——正文里可能残留占位符，请回退原文' };
    }
    stat.restored++;
    return { ok: true, text: out, count: table.length };
  }

  /** 一步到位：保护 → 净化 → 还原。净化器由调用方传入（本模块不依赖 purifier 存在）。 */
  function applyWith(text, purify) {
    const p = protect(text);
    if (!p || p.ok !== true) return Object.assign({ ok: false }, p || {});
    let body = p.protect;
    if (typeof purify === 'function') {
      try { body = purify(body); } catch (e) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', text: String(text) }; }
    }
    const r = restore(body, p.table);
    return { ok: r.ok, text: r.text, count: p.count, kept: r.ok ? null : r.missing };
  }

  WA.purifyScope = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    protect: protect, restore: restore, applyWith: applyWith,
    kinds: function () { return PATTERNS.map(function (pt) { return pt.kind; }); },
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/purify-scope.js', { kind: 'engine', ver: '2.130.0' });
})();

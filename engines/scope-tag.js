/**
 * WorldAxis engines/scope-tag.js (v2.230.0) — 范围标签
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   本仓 `purify-scope` 能保护一段范围不被净化（范围保护），但**范围本身没有名字**：
 *   现场实测 `范围标签` / `scopeTag` / `scope_label` 在 engines|core|actors|direction|
 *   render|ui **零命中**。保护范围只能按位置（起止下标）指，位置一漂就失效，
 *   也没法回答「这一段属于哪一类（对话/旁白/系统/引用）」。
 *   后果：「哪些字是旁白、哪些是引用」这件事在清理、注入、审查三条链上各判一次。
 *
 * ── 缝合来源（显式写明，不冒称原创）──────────────────────────────────
 *   来源是 The-Veridis-Lion 的「范围保护 + 标签」口径（range-protect 与
 *   The-Veridis-Lion 的区块语义标注）：
 *     · 标签是**成对开闭**（开标签 / 闭标签），未闭合一律不认（`unclosed`）；
 *     · 同类标签**不许交叉嵌套**（`A … B … /A … /B` ⇒ `crossed`）——
 *       交叉嵌套会让「取哪一段」没有唯一答案；
 *     · 标签只**描述**范围，不改一字（`writes:0`）；
 *     · 未知标签不复用已知语义（`unknown-tag`），也不靠猜补全。
 *   本模块只取其中**可判定的那一层**（成对开闭 / 交叉检测 / 同类区间归并）；
 *   与净化、注入的接线由各自调用方做，本模块不替它们改字。
 *
 * ── 与既有模块的分工（三者不读写对方）────────────────────────────────
 *   · purify-scope —— 「哪些范围受保护」（按位置），本模块给它**可命名的范围**；
 *   · rewriter —— 「命中即改写」，本模块不改写；
 *   · 本模块 —— **范围命名 + 成对校验 + 交叉检测 + 区间归并**（纯函数面）。
 *
 * ── 八条否定式边界（本模块存在的全部理由）────────────────────────────
 *   ① 标签集合是**封闭白名单**：白名单外的标签 ⇒ `unknown-tag`。
 *   ② **未闭合拒收**：开而无闭 ⇒ `unclosed`（不猜它闭在哪）。
 *   ③ **孤闭拒收**：闭而无开 ⇒ `orphan-close`。
 *   ④ **不许同类交叉**：交叉嵌套 ⇒ `crossed`（取哪一段没有唯一答案）。
 *   ⑤ 本模块**零改字**：`parse` 恒 `writes:0`。
 *   ⑥ **不猜未标注部分**：没被任何标签覆盖的区间一律 `plain`，不硬塞进某类。
 *   ⑦ 有硬上限：标签数与嵌套深度由 settings 定，超限拒收并具名。
 *   ⑧ 不落盘、不跨会话（解析结果是当场派生物，不是事实账）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_scope_tag_settings_v1';
  const DEF = { enabled: false, tags: ['say', 'narr', 'sys', 'quote', 'meta', 'state'], maxDepth: 8, maxSpans: 256 };
  const __REG = { key: LS_KEY, def: DEF, module: 'scopeTag',
    bounds: { maxDepth: [1, 32], maxSpans: [1, 2000] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const TAG_LABEL = { say: '台词', narr: '旁白', sys: '系统', quote: '引用', meta: '元信息', state: '状态块' };
  const PLAIN = 'plain';

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }

  const stat = { parsed: 0, spans: 0, plainChars: 0, bad: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; stat.blocked++; stat.lastReason = r; }
  function refuse(r) { stat.refused++; noteFault(r); return { ok: false, reason: r }; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }

  function tagSet(cfg, tags) {
    const list = Array.isArray(tags) && tags.length ? tags : cfg.tags;
    return list.map(function (t) { return clean(t, 20); }).filter(Boolean);
  }
  /**
   * 解析：只做成对校验与区间归并，零改字。
   * 返回 spans 按原文顺序，覆盖区间不相交；未被标注的补 plain 缝。
   */
  function parse(text, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const src = String(text == null ? '' : text);
    if (!src) return refuse('empty-text');
    const o = opts || {};
    const allowed = tagSet(cfg, o.tags);
    if (!allowed.length) return refuse('no-tags');
    if (allowed.length > 64) return refuse('too-many-tags');
    const stack = []; const events = []; const bads = [];
    const re = /\[\[\s*(\/?)\s*([A-Za-z_][\w-]{0,19})\s*\]\]/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const closing = m[1] === '/';
      const rawTag = m[2];
      const tag = allowed.indexOf(rawTag) >= 0 ? rawTag : null;
      if (!tag) { bads.push({ at: m.index, tag: rawTag, why: 'unknown-tag' }); continue; }
      if (!closing) {
        if (stack.length >= cfg.maxDepth && stack.indexOf(tag) < 0) { bads.push({ at: m.index, tag: tag, why: 'too-deep' }); continue; }
        const openIdx = stack.findIndex(function (s) { return s.tag === tag; });
        if (openIdx >= 0) { bads.push({ at: m.index, tag: tag, why: 'reopen' }); continue; }
        stack.push({ tag: tag, from: m.index + m[0].length, openAt: m.index });
      } else {
        const idx = stack.map(function (s) { return s.tag; }).lastIndexOf(tag);
        if (idx < 0) { bads.push({ at: m.index, tag: tag, why: 'orphan-close' }); continue; }
        // 同类不许交叉：闭合时栈顶必须就是它
        if (idx !== stack.length - 1) {
          bads.push({ at: m.index, tag: tag, why: 'crossed', with: stack.slice(idx + 1).map(function (s) { return s.tag; }) });
          continue;
        }
        const top = stack.pop();
        events.push({ tag: top.tag, from: top.from, to: m.index });
      }
    }
    const unclosed = stack.map(function (s) { return { at: s.openAt, tag: s.tag, why: 'unclosed' }; });
    if (unclosed.length) { bads.push.apply(bads, unclosed); }
    if (bads.length) {
      stat.bad += bads.length;
      const first = bads[0];
      refuse(first.why);
      return { ok: false, reason: first.why, bads: bads, writes: 0, events: events };
    }
    events.sort(function (a, b) { return a.from - b.from || a.to - b.to; });
    const spans = []; let cursor = 0; let plainChars = 0;
    events.forEach(function (e) {
      if (e.from > cursor) { spans.push({ tag: PLAIN, from: cursor, to: e.from }); plainChars += e.from - cursor; }
      spans.push({ tag: e.tag, label: TAG_LABEL[e.tag] || e.tag, from: Math.max(e.from, cursor), to: e.to });
      cursor = Math.max(cursor, e.to);
    });
    if (cursor < src.length) { spans.push({ tag: PLAIN, from: cursor, to: src.length }); plainChars += src.length - cursor; }
    if (spans.length > cfg.maxSpans) return refuse('too-many-spans');
    stat.parsed++; stat.spans += spans.length; stat.plainChars += plainChars;
    return { ok: true, reason: 'ok', spans: spans, count: spans.length, plainChars: plainChars,
      writes: 0, allowedTags: allowed.slice(), tagLabel: TAG_LABEL };
  }
  /** 取某类标签的全部区间（只读投影）。 */
  function rangesOf(text, tag, opts) {
    const r = parse(text, opts);
    if (!r.ok) return r;
    const t = clean(tag, 20);
    const rows = r.spans.filter(function (s) { return s.tag === t; });
    return { ok: true, reason: 'ok', tag: t, count: rows.length, ranges: rows.map(function (s) { return { from: s.from, to: s.to, text: String(text).slice(s.from, s.to) }; }) };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, tags: cfg.tags.slice(), tagLabel: TAG_LABEL, plain: PLAIN,
      maxDepth: cfg.maxDepth, maxSpans: cfg.maxSpans, syntax: '[[tag]] … [[/tag]]' };
  }
  function resetStat() {
    stat.parsed = 0; stat.spans = 0; stat.plainChars = 0; stat.bad = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }

  WA.scopeTag = {
    getSettings: settings, setSettings: saveSettings, view: view,
    parse: parse, rangesOf: rangesOf,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, resetStat: resetStat,
    TAG_LABEL: TAG_LABEL, PLAIN: PLAIN,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/scope-tag.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'scopeTag 已加载（2.230.0）');
})();
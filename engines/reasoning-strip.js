/**
 * WorldAxis engines/reasoning-strip.js (v2.230.0) — 推理块过滤
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   本仓 `reasoning` 管的是「思考预算单列、正文不足即重发」（SoulLink 的预算口径），
 *   **不负责把模型吐出的思考块从正文里摘掉**。现场实测：`推理块过滤` /
 *   `reasoningFilter` / `思考块过滤` 在 engines|core|actors|direction|render|ui
 *   **零命中**（deep-clean 的 `think-block` 规则只做「列区间」，不做增量流式处理）。
 *   后果：流式生成时思考块**还没闭合**就被当正文发出去（残块泄漏），
 *   而只按 `<\/think>` 一刀切又会把未闭合残块留在文本里。
 *
 * ── 缝合来源（显式写明，不冒称原创）──────────────────────────────────
 *   来源是 st-theater 的 reasoning-filter.js：
 *     · 识别三类思考标签 `think` / `thinking` / `electric`（**封闭集合**）；
 *     · **深度计数**：嵌套同名标签按深度配对，不靠「找最近一个闭标签」；
 *     · **未完成块不泄漏**：累计流式更新时，未闭合的尾块整段扣住（`incomplete:true`），
 *       连「标签前缀写了一半」（如 `<thi`）也要扣住（`trailingPartialTagLength`）；
 *     · 返回三件事：正文 / 是否出现过思考块 / 是否未完成。
 *   本模块只取其中**可判定的那一层**；渲染与 UI 不进本模块。
 *
 * ── 与既有模块的分工（三者不读写对方）────────────────────────────────
 *   · reasoning —— 思考预算（够不够、要不要重发），本模块不管预算；
 *   · deep-clean —— 一次性清理（出区间给复核），本模块管**增量流式扣块**；
 *   · 本模块 —— **思考块剥离 + 未完成扣留 + 深度配对**（纯函数面）。
 *
 * ── 八条否定式边界（本模块存在的全部理由）────────────────────────────
 *   ① 标签集合是**封闭白名单**（think / thinking / electric），白名单外不动一字。
 *   ② **按深度配对**：嵌套同名标签不提前闭合（`找最近闭标签`是错的）。
 *   ③ **未完成整段扣住**：未闭合尾块一律不进正文，且 `incomplete:true`。
 *   ④ **半个标签也扣**：结尾是合法标签的前缀（`<thi`）⇒ 一并扣住，不吐半截。
 *   ⑤ **不改正文一字**：只做「保留 / 扣留」两态，不做同义改写。
 *   ⑥ 无思考块时**快路径原样返回**（`hadReasoning:false`，不重排文本）。
 *   ⑦ 总开关关闭时**原样返回**（不静默剥——剥与不剥必须能被调用方知道）。
 *   ⑧ 有硬上限：单次处理字符数由 settings 定，超限拒收并具名。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_reasoning_strip_settings_v1';
  const DEF = { enabled: true, maxChars: 400000, holdIncomplete: true, strict: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'reasoningStrip',
    bounds: { maxChars: [1000, 4000000] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const TAG_NAMES = ['think', 'thinking', 'electric'];
  const OPEN_TAGS = TAG_NAMES.map(function (t) { return '<' + t + '>'; });
  const CLOSE_TAGS = TAG_NAMES.map(function (t) { return '</' + t + '>'; });
  const ALL_TAGS = OPEN_TAGS.concat(CLOSE_TAGS);
  const SCAN_RE = /<\s*(\/?)\s*(think|thinking|electric)\b[^>]*>/gi;

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }

  const stat = { calls: 0, had: 0, held: 0, chars: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; stat.blocked++; stat.lastReason = r; }
  function refuse(r) { stat.refused++; noteFault(r); return { ok: false, reason: r, content: '', hadReasoning: false, incomplete: false }; }

  /** 结尾是否为某个合法标签的「前缀」（写了一半的标签也要扣住）。 */
  function trailingPartialTagLength(value) {
    const text = String(value == null ? '' : value);
    const start = text.lastIndexOf('<');
    if (start < 0) return 0;
    const suffix = text.slice(start).toLowerCase();
    if (suffix.indexOf('>') >= 0) return 0;
    for (let i = 0; i < ALL_TAGS.length; i++) {
      if (ALL_TAGS[i].indexOf(suffix) === 0) return text.length - start;
    }
    return 0;
  }
  /** 深度配对剥离：未闭合尾块整段扣住（含半个标签）。 */
  function strip(value, opts) {
    const cfg = settings();
    const text = String(value == null ? '' : value);
    if (!cfg.enabled) return { ok: true, reason: 'disabled-passthrough', content: text, hadReasoning: false, incomplete: false, heldChars: 0 };
    if (!text) return { ok: true, reason: 'ok', content: '', hadReasoning: false, incomplete: false, heldChars: 0 };
    if (text.length > cfg.maxChars) return refuse('too-long');
    const o = opts || {};
    const hold = o.holdIncomplete === undefined ? cfg.holdIncomplete : o.holdIncomplete === true;
    stat.calls++;
    let content = ''; let cursor = 0; let depth = 0; let hadReasoning = false;
    SCAN_RE.lastIndex = 0;
    let m;
    while ((m = SCAN_RE.exec(text)) !== null) {
      const seg = text.slice(cursor, m.index);
      if (depth === 0) content += seg;
      if (m[1] === '/') {
        if (depth > 0) depth--;
        // 孤闭标签在深度 0：按「不在思考块里」处理，原样留在正文（标记但不吞）
        else content += m[0];
      } else {
        depth++;
        hadReasoning = true;
      }
      cursor = m.index + m[0].length;
    }
    const rest = text.slice(cursor);
    let incomplete = false; let held = 0;
    if (depth > 0) {
      // 未闭合：尾巴整段扣住（cfg 缺省扣；显式 holdIncomplete:false 时如实放行但报 incomplete）
      incomplete = true;
      if (hold) { held = rest.length; stat.held++; }
      else content += rest;
    } else {
      const partial = trailingPartialTagLength(rest);
      if (partial > 0) {
        incomplete = true;
        if (hold) { content += rest.slice(0, rest.length - partial); held = partial; stat.held++; }
        else content += rest;
      } else {
        content += rest;
      }
    }
    if (hadReasoning) stat.had++;
    stat.chars += text.length;
    return { ok: true, reason: 'ok', content: content, hadReasoning: hadReasoning, incomplete: incomplete,
      heldChars: held, tags: TAG_NAMES.slice(), via: cleanVia(o.via) };
  }
  function cleanVia(v) { return WA.inputGuard ? WA.inputGuard.text(v, 30) : String(v == null ? '' : v).slice(0, 30); }
  /** 只判是否含未闭合块（不改字，供调用方决定要不要重发）。 */
  function hasIncomplete(value) {
    const r = strip(value, { holdIncomplete: false });
    return { ok: r.ok, reason: r.reason, hadReasoning: r.hadReasoning, incomplete: r.incomplete };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, maxChars: cfg.maxChars, holdIncomplete: cfg.holdIncomplete,
      strict: cfg.strict, tags: TAG_NAMES.slice(), openTags: OPEN_TAGS.slice(), closeTags: CLOSE_TAGS.slice() };
  }
  function resetStat() {
    stat.calls = 0; stat.had = 0; stat.held = 0; stat.chars = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }

  WA.reasoningStrip = {
    getSettings: settings, setSettings: saveSettings, view: view,
    strip: strip, hasIncomplete: hasIncomplete, trailingPartialTagLength: trailingPartialTagLength,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, resetStat: resetStat,
    TAG_NAMES: TAG_NAMES, OPEN_TAGS: OPEN_TAGS, CLOSE_TAGS: CLOSE_TAGS,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/reasoning-strip.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'reasoningStrip 已加载（2.230.0）');
})();
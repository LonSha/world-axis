/**
 * WorldAxis engines/length-policy.js (v2.230.0) — 字数策略
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   本仓 `word-budget` 管的是**注入侧**的「这块还能塞多少字」（预算裁剪），
 *   它不负责另一件事：**从用户指令里读出「这次要写多少字」**。
 *   现场实测：`字数策略` / `lengthPolicy` / `length-policy` 在
 *   engines|core|actors|direction|render|ui **零命中**。
 *   后果：「不得少于 800 字」「写满一千五」这类要求**没有任何一处被读懂**：
 *   要么被模型忽略，要么被注入面当无关文本裁掉。
 *
 * ── 缝合来源（显式写明，不冒称原创）──────────────────────────────────
 *   来源是 st-theater 的 length-policy.js：
 *     · 五条目标句式（前缀式「不得少于 N 字」/ 后缀式「N 字以上」/
 *       动词式「写满 N 字」/ 字段式「字数：N」/ 独立行「N 字」）；
 *     · **中文数字解析**（含 `十/百/千/万` 单位与 `k/K/千/万` 缩放）；
 *     · **三档字数区间** `short / comfort / long` 与 `unspecified`；
 *     · **低于门槛不认**（原文 `value >= 100`）：`三字` 不是字数要求。
 *   本模块只取其中**可判定的那一层**（解析与分档）；「解析到之后怎么用」
 *   （补写、重发、警告）由调用方决定，本模块不出手。
 *
 * ── 与既有模块的分工（三者不读写对方）────────────────────────────────
 *   · word-budget —— 注入预算（能塞多少），本模块不碰预算；
 *   · limits —— 输出规范（写多少条），本模块只读**用户明文里的数字**；
 *   · 本模块 —— **字数目标解析 + 中文数字 + 三档区段 + 分阶段渲染门槛**。
 *
 * ── 八条否定式边界（本模块存在的全部理由）────────────────────────────
 *   ① 总开关默认关闭。关闭时解析一律 `disabled`（不偷偷认字数）。
 *   ② **低于下限不认**：解析值 < `minTarget` ⇒ 不认（`below-min`），
 *      不要把「三字」当字数要求。
 *   ③ **不猜**：没有匹配句式 ⇒ `unspecified`（不拿默认字数兜底）。
 *   ④ **中文数字只在能确定时转换**：非法组合（`二三` 之类）⇒ `bad-number`。
 *   ⑤ **同句多条取第一条命中**（顺序即优先级，不做加权平均）。
 *   ⑥ 纯函数面：不读 store、不写盘、不改正文（只返回读数）。
 *   ⑦ 区间是**闭区间**且必须递增，乱序的档位定义拒收（`bad-tiers`）。
 *   ⑧ 有硬上限：单条指令长度与命中数由 settings 定，超限截断并具名。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_length_policy_settings_v1';
  const DEF = { enabled: false, minTarget: 100, maxInstructionChars: 4000, stagedRenderThreshold: 5000, longFormSplitThreshold: 8000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'lengthPolicy',
    bounds: { minTarget: [10, 10000], maxInstructionChars: [100, 100000], stagedRenderThreshold: [500, 50000], longFormSplitThreshold: [500, 100000] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const TIERS = ['short', 'comfort', 'long', 'unspecified'];
  const TIER_LABEL = { short: '短', comfort: '适中', long: '长', unspecified: '未指定' };
  const DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const UNITS = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
  const NUM = '(\\d[\\d,]*(?:\\.\\d+)?\\s*[kK千万]?|[零〇一二两三四五六七八九十百千万]+)';
  const PREFIX = '(?:不得少于|不能少于|不可少于|不得低于|不能低于|不可低于|不得超过|不能超过|不可超过|不少于|不低于|不超过|不多于|至少|至多|最多|最少|起码|最低|最高|保底|大于|超过|少于|低于|写满|达到|达成|大约|大概|约莫|约)';
  const SUFFIX = '(?:以上|以下|左右|上下|以内|附近|内|起)';

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }

  const stat = { parsed: 0, hit: 0, unspecified: 0, belowMin: 0, badNumber: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; stat.blocked++; stat.lastReason = r; }
  function refuse(r) { stat.refused++; noteFault(r); return { ok: false, reason: r, tier: 'unspecified' }; }

  function parseChineseNumber(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return null;
    const scaled = text.match(/^(\d[\d,]*(?:\.\d+)?)\s*([kK千万])$/);
    if (scaled) return Math.round(Number(scaled[1].replace(/,/g, '')) * (scaled[2] === '万' ? 10000 : 1000));
    if (/^\d+(?:\.\d+)?\s*[kK]$/.test(text)) return Math.round(parseFloat(text) * 1000);
    if (/^\d[\d,]*(?:\.\d+)?$/.test(text)) return Math.round(parseFloat(text.replace(/,/g, '')));
    // 中文：逐字扫，遇单位结算；同段出现两个裸数字（如「二三」）视为非法
    let total = 0, section = 0, number = 0, seen = false, bare = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (DIGITS[ch] !== undefined) { number = DIGITS[ch]; seen = true; bare++; if (bare > 1) return null; continue; }
      if (UNITS[ch]) {
        seen = true; bare = 0;
        const unit = UNITS[ch];
        if (unit === 10000) { section = (section + number) || 1; total += section * unit; section = 0; }
        else section += (number || 1) * unit;
        number = 0;
        continue;
      }
      return null;
    }
    return seen ? total + section + number : null;
  }
  function patterns() {
    return [
      { name: 'prefix', re: new RegExp(PREFIX + '\\s*[：:]?\\s*' + NUM + '\\s*(?:个)?字') },
      { name: 'suffix', re: new RegExp('(?<![\\d,.])' + NUM + '\\s*(?:个)?字\\s*' + SUFFIX) },
      { name: 'verb',   re: new RegExp('(?:写|生成|输出|正文|篇幅|字数)[^\\n。；;]{0,12}?' + NUM + '\\s*(?:个)?字') },
      { name: 'field',  re: new RegExp('(?:字数|篇幅)(?:要求|目标)?\\s*[：:=为在]?\\s*' + NUM + '(?:\\s*字)?(?=[\\s。；;！!，,]|$)') },
      { name: 'line',   re: new RegExp('^\\s*' + NUM + '\\s*(?:个)?字\\s*[。！!]?\\s*$', 'm') },
    ];
  }
  function tierOf(value, cfg) {
    if (!Number.isFinite(value)) return 'unspecified';
    if (value < cfg.stagedRenderThreshold) return 'short';
    if (value < cfg.longFormSplitThreshold) return 'comfort';
    return 'long';
  }
  /** 解析用户指令里的字数目标。不猜：认不出即 unspecified。 */
  function parse(instruction, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    let text = String(instruction == null ? '' : instruction);
    let truncated = false;
    if (text.length > cfg.maxInstructionChars) { text = text.slice(0, cfg.maxInstructionChars); truncated = true; }
    if (!text) return refuse('empty-instruction');
    const o = opts || {};
    const min = Number.isFinite(Number(o.minTarget)) ? Number(o.minTarget) : cfg.minTarget;
    const norm = text.replace(/，/g, ',');
    stat.parsed++;
    const P = patterns();
    for (let i = 0; i < P.length; i++) {
      const m = norm.match(P[i].re);
      if (!m) continue;
      const value = parseChineseNumber(m[1]);
      if (value === null) { stat.badNumber++; refuse('bad-number'); return { ok: false, reason: 'bad-number', tier: 'unspecified', pattern: P[i].name }; }
      if (value < min) { stat.belowMin++; refuse('below-min'); return { ok: false, reason: 'below-min', tier: 'unspecified', value: value, pattern: P[i].name }; }
      stat.hit++;
      return { ok: true, reason: 'ok', value: value, tier: tierOf(value, cfg), tierLabel: TIER_LABEL[tierOf(value, cfg)],
        pattern: P[i].name, raw: m[0], truncated: truncated, brackets: { staged: value >= cfg.stagedRenderThreshold, longForm: value >= cfg.longFormSplitThreshold } };
    }
    stat.unspecified++;
    return { ok: true, reason: 'unspecified', value: null, tier: 'unspecified', tierLabel: TIER_LABEL.unspecified, truncated: truncated };
  }
  /** 只取目标值（便捷口）。 */
  function targetOf(instruction, opts) {
    const r = parse(instruction, opts);
    return { ok: r.ok, reason: r.reason, value: r.value == null ? null : r.value, tier: r.tier || 'unspecified' };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, minTarget: cfg.minTarget, maxInstructionChars: cfg.maxInstructionChars,
      tiers: TIERS.slice(), tierLabel: TIER_LABEL, stagedRenderThreshold: cfg.stagedRenderThreshold,
      longFormSplitThreshold: cfg.longFormSplitThreshold, patterns: patterns().map(function (p) { return p.name; }) };
  }
  function resetStat() {
    stat.parsed = 0; stat.hit = 0; stat.unspecified = 0; stat.belowMin = 0; stat.badNumber = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }

  WA.lengthPolicy = {
    getSettings: settings, setSettings: saveSettings, view: view,
    parse: parse, targetOf: targetOf, parseNumber: parseChineseNumber, tierOf: tierOf,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, resetStat: resetStat,
    TIERS: TIERS, TIER_LABEL: TIER_LABEL,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/length-policy.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'lengthPolicy 已加载（2.230.0）');
})();
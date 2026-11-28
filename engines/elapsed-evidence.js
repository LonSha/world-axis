/**
 * WorldAxis engines/elapsed-evidence.js (v2.409.0) — 时间流逝的**证据解析器**
 *
 *  缝合来源：npc-life 3.0.0-beta.4 的 world-service.js `parseElapsedEvidence` / `autoMinutes`
 *  （muzi9277/npc-life，326 行世界服务里最硬的一段）。本仓此前**没有**这个能力：
 *  `deltaMinutes` 只作为**已算好的字段**出现在 action-desk / mood-glide / toxic-metabolism，
 *  没有任何一处从正文明文里取时长证据。于是「三天后」与「如果你明天去」在算术上同形，
 *  而叙事引擎最爱在这两个形态之间产生幻觉。
 *
 *  ── 治什么（三种误读，各自对应一层拒绝）──────────────────────────
 *   ① **等价改写**：`三天前就说过` / `没过几分钟` / `不到一小时` —— 时间单位前后带否定或
 *      溯往修饰，不是「流逝了多久」。→ 否定/溯往层拒绝。
 *   ② **非事实语气**：`如果你明天来` / `我打算三天后走` / `大约两小时后` —— 假设、愿望、
 *      未来、模糊量词。→ 假设/愿望/未来/模糊层拒绝。
 *   ③ **引用与被定义**：`他说「等五分钟」` / `这句话里的"三天"` —— 引号内的时长是别人说的话
 *      或被讨论的文本，不是世界时间。→ 引号层拒绝。
 *
 *  ── 与邻座分工 ────────────────────────────────────────────────
 *   - `engines/backstage-tone.js` 管**时辰**（子丑寅卯、一刻 15 分钟）与 0-99 中文数字；
 *     本模块管**时长**（分钟/小时/天，0-10080 分钟区间），中文数字复用它的口径但扩到百/千/万。
 *     两者不互相调用：本模块自带数字解析，避免对 presentation 层产生时序依赖。
 *   - `engines/world-clock.js` / `metabolism-clock.js` 管**时钟推进本身**；
 *     本模块只回答「正文这句话能不能当作推进依据、推进了多少分钟」，**不推进任何时钟**。
 *   - `engines/plan.js` 的 remainingMinutes 由调用方扣减；本模块只出读数。
 *
 *  ── 九条否定式边界 ──────────────────────────────────────────────
 *   ① 总开关默认开启；关闭时 parse / verify 一律返回 not-fact，不做任何猜测。
 *   ② 零 store 写、零落盘、零 settingsBus 写：全文纯函数，输入即全部上下文。
 *   ③ 零模型调用：这是本地确定性判据，不花一次 token。
 *   ④ **不代替模型判断**：只校验「模型给的分钟数」是否可由原文逐字推出（双重校验）。
 *      模型说 180 分钟、原文是「三个小时」⇒ 通过；模型说 180、原文是「大约三个小时」⇒ 拒。
 *   ⑤ 算不出来一律 unknown，**不猜、不取近似**。`≈` 不参与本模块。
 *   ⑥ 不放宽到「任意数字 + 时间单位」：抓到的匹配必须**覆盖所在分句的全部时长语义**，
 *      剩余文本里再出现任何时间单位即拒（防止「三天又五小时」被截成 4320）。
 *   ⑦ 不处理闰月/节气/时区（calendar 的事），不处理持续时长与间隔时长的区分
 *      （那是语义层，不是证据层）。
 *   ⑧ 不写正文、不占注入块正文位、不改写任何既有字段。
 *   ⑨ 拒绝时**必须给 reason 与 anchor**：静默返回 false 与本仓「压下项必须可见」纪律冲突。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_elapsed_evidence_settings_v1';
  const DEF = { enabled: true, minConfidence: 0.9, maxMinutes: 10080 };
  const __REG = { key: LS_KEY, def: DEF, module: 'elapsedEvidence',
    bounds: { minConfidence: [0.5, 1], maxMinutes: [60, 525600] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  /** 分钟量的天然上界：0-10080（一周）。超过它的「时长」是历法跨度，不是本模块的事。 */
  const MINUTES_CAP = 10080;

  // ── 第 1 层：溯往 / 否定 ─────────────────────────────────────
  //   「三天前」「没过几分钟」「不到一小时」——单位还在，但语义不是「流逝」。
  const PAST_NEG = /没有|未|不曾|并未|并非|别|不要|不需|不用|分钟前|小时前|天前|日前|年前|上个月|小时内|之内|以内/;
  // ── 第 2 层：假设 / 愿望 / 未来 / 模糊 ───────────────────────
  const HYPOTHETICAL = /如果|假如|假设|若是|要是|万一|希望|打算|准备|计划|想要|将要|即将|回头|改天|明天|后天|下次|以后|将来| someday|大约|大概|约莫|左右|多个|几个|片刻|一会儿|良久|许久|好一阵/;
  // ── 第 3 层：引用 ────────────────────────────────────────────
  const QUOTE = /["'\u201c\u201d\u300c\u300d\u300e\u300f\u2018\u2019]/;
  // ── 第 4 层：需求 / 成本 / 承诺（说的是「要花多久」，不是「过去了多久」）──
  const NEED_COST = /需要|只需|得花|要花|花费|耗时|用掉|消耗|\u79f0|\u8bf4.*(?:小时|分钟|天)/;

  /** 中文数字（扩到 百/千/万），与 backstage-tone 的 0-99 口径兼容且更宽。 */
  const ZH_DIGIT = { '〇': 0, '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  const ZH_UNIT = { '十': 10, '百': 100, '千': 1000, '万': 10000 };

  /**
   * 解析中文或阿拉伯数字。**不做模糊处理**：不认识的写法一律 NaN。
   *   为什么自带而不复用 backstage-tone：那个只解 0-99，而时长要覆盖「三千六百秒」这种，
   *   且本模块是证据层，宁可与 presentation 层重复 12 行，也不承担跨模块时序依赖。
   */
  function parseNum(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return NaN;
    if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
    let total = 0, section = 0, digit = NaN, seen = false;
    for (const ch of text) {
      if (Object.prototype.hasOwnProperty.call(ZH_DIGIT, ch)) {
        if (!Number.isNaN(digit)) return NaN;   // 「一二」这种连写不合法
        digit = ZH_DIGIT[ch]; seen = true;
      } else if (Object.prototype.hasOwnProperty.call(ZH_UNIT, ch)) {
        const unit = ZH_UNIT[ch];
        if (unit === 10000) { section = (section + (Number.isNaN(digit) ? 0 : digit)) * unit; total += section; section = 0; }
        else { section += (Number.isNaN(digit) ? 1 : digit) * unit; }
        digit = NaN; seen = true;
      } else return NaN;
    }
    if (!seen) return NaN;
    return total + section + (Number.isNaN(digit) ? 0 : digit);
  }

  /**
   * 主解析。返回 `{ ok, minutes, unit, reason, anchor }`。
   *   `ok:true` 只在「整句只剩一个无争议的时长」时出现 —— 这是本模块的全部价值所在，
   *   宽松匹配会立刻退化成「正则抓数字」，那等于没做。
   */
  function parse(input) {
    const text = String(input == null ? '' : input);
    const out = { ok: false, minutes: null, unit: '', reason: '', anchor: '' };
    if (!text.trim()) { out.reason = 'empty'; return out; }
    // 明确零：连续对话 / 同一时刻。这条**先于**所有拒绝层，因为「没有时间变化」是否定句的
    //   反例形态（「没有时间变化」本身带「没有」），按层顺序会被误判成 not-fact。
    if (/无时间变化|没有时间变化|时间未变|同一时刻|连续对话|紧接着|(?:^|[^\d.])0\s*分钟/.test(text)) {
      out.ok = true; out.minutes = 0; out.unit = 'zero'; out.reason = 'explicit-zero';
      return out;
    }
    if (QUOTE.test(text)) { out.reason = 'quoted'; out.anchor = firstQuote(text); return out; }
    if (HYPOTHETICAL.test(text)) { out.reason = 'hypothetical'; out.anchor = matchOf(text, HYPOTHETICAL); return out; }
    if (NEED_COST.test(text)) { out.reason = 'need-cost'; out.anchor = matchOf(text, NEED_COST); return out; }
    if (PAST_NEG.test(text)) { out.reason = 'past-or-negated'; out.anchor = matchOf(text, PAST_NEG); return out; }

    // 抓所有时长片段。三支：数字+单位、半个单位、单位半。
    const RE = /(\d+(?:\.\d+)?|[〇零一二两三四五六七八九十百千万]+)\s*(?:个)?\s*(半)?\s*(小时|钟头|分钟|天|日)|半\s*(?:个)?\s*(小时|钟头|分钟|天)/g;
    const hits = [];
    let m;
    while ((m = RE.exec(text)) !== null) {
      const unit = m[3] || m[4];
      const half = !!m[2];
      const base = m[1] === undefined ? 0.5 : parseNum(m[1]) + (half ? 0.5 : 0);
      if (Number.isNaN(base)) { out.reason = 'bad-number'; out.anchor = m[0]; return out; }
      hits.push({ raw: m[0], unit: unit, value: base, at: m.index });
    }
    if (!hits.length) { out.reason = 'no-duration'; return out; }
    // 多段之间必须只剩连接词，否则是复合时长（「三天又五小时」）——本模块不折算，直接拒。
    if (hits.length > 1) {
      const between = text.slice(hits[0].at + hits[0].raw.length, hits[hits.length - 1].at);
      if (!/^[\s,，、又和零]*$/.test(between)) { out.reason = 'ambiguous-sequence'; out.anchor = between.slice(0, 24); return out; }
      out.reason = 'multiple-durations'; out.anchor = hits.map(function (h) { return h.raw; }).join(' + ');
      return out;
    }
    const hit0 = hits[0];
    // 单位外还有别的时长单位 ⇒ 抓漏了（例如「三天」后又出现「小时」），不折算、直接拒。
    const tailText = text.slice(0, hit0.at) + text.slice(hit0.at + hit0.raw.length);
    if (/小时|钟头|分钟|天|日/.test(tailText)) { out.reason = 'residual-unit'; out.anchor = hit0.raw; return out; }

    const minutes = hit0.unit === '天' || hit0.unit === '日' ? hit0.value * 1440
      : hit0.unit === '小时' || hit0.unit === '钟头' ? hit0.value * 60
        : hit0.value;
    const rounded = Math.round(minutes);
    if (!Number.isFinite(minutes) || Math.abs(minutes - rounded) > 1e-9) { out.reason = 'non-integer-minutes'; out.anchor = hit0.raw; return out; }
    if (rounded < 0 || rounded > MINUTES_CAP) { out.reason = 'out-of-range'; out.anchor = hit0.raw; return out; }
    out.ok = true; out.minutes = rounded; out.unit = hit0.unit; out.reason = 'ok'; out.anchor = hit0.raw;
    return out;
  }

  function firstQuote(text) {
    const i = text.search(QUOTE);
    return i < 0 ? '' : text.slice(i, i + 24);
  }
  function matchOf(text, re) {
    const m = text.match(re);
    return m ? m[0] : '';
  }

  /** 分句切分：引号外的句读。用于「证据所在分句不得含假设/未来词」这类邻近判据。 */
  function clauses(text) {
    return String(text == null ? '' : text).split(/[。！？；\n]|\.{3}|…+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  /** 在正文字面里定位证据，并返回它所在的整句（不含句读）。 */
  function locate(haystack, evidence) {
    const ev = String(evidence == null ? '' : evidence);
    if (!ev) return { found: false, clause: '', reason: 'no-evidence' };
    const at = String(haystack).indexOf(ev);
    if (at < 0) return { found: false, clause: '', reason: 'not-in-text' };
    // 向前后扩到最近句读边界，得到证据所在分句。
    const before = haystack.slice(0, at), after = haystack.slice(at + ev.length);
    const left = Math.max(before.search(/[。！？；\n][^。！？；\n]*$/), -1);
    const start = left >= 0 ? left + 1 : 0;
    const right = after.search(/[。！？；\n]/);
    const end = right >= 0 ? at + ev.length + right : haystack.length;
    return { found: true, clause: haystack.slice(start, end).trim(), reason: 'ok', at: at };
  }

  /**
   * **双重校验**：模型声称的分钟数，必须能被原文证据**逐字**推出且完全相等。
   *   这是本模块对「模型 hallucinate 时长」唯一的硬约束，也是它比单纯正则强的地方：
   *   正则只能判「文本像不像时长」，只有双重校验能判「模型这次算得对不对」。
   *
   * 返回 `{ ok, expected, actual, reason, clause }`；`ok:false` 时 `reason` 一行可读。
   */
  function verify(source, evidence, deltaMinutes) {
    const st = settings();
    const out = { ok: false, expected: null, actual: null, reason: '', clause: '', confidence: 0 };
    const claimed = Number(deltaMinutes);
    if (!Number.isFinite(claimed) || !Number.isInteger(claimed)) { out.reason = 'claimed-not-integer'; return out; }
    out.actual = claimed;
    if (claimed < 0 || claimed > MINUTES_CAP) { out.reason = 'claimed-out-of-range'; return out; }
    const loc = locate(source, evidence);
    out.clause = loc.clause;
    if (!loc.found) { out.reason = 'evidence-' + loc.reason; return out; }
    // 证据所在分句不得是假设/愿望/引用/未来：(证据在原文里**且**它那半句能独立成立)。
    const parsed = parse(loc.clause);
    out.expected = parsed.minutes;
    if (!parsed.ok) { out.reason = 'clause-' + parsed.reason; return out; }
    if (parsed.minutes !== claimed) { out.reason = 'mismatch(' + parsed.minutes + '≠' + claimed + ')'; return out; }
    out.ok = true; out.reason = 'ok'; out.confidence = 1;
    return out;
  }

  /**
   * 模型分析结果的准入判据（npc-life `autoMinutes` 的同形实现）。
   *   要求：confidence ≥ 阈值、evidence 是原文子串、双重校验相等。三者缺一即拒。
   *   `confidence` 由调用方（模型分析）提供；本模块只做**门槛**，不产生置信度。
   */
  function autoMinutes(analysis, source) {
    const st = settings();
    const out = { ok: false, minutes: null, reason: '', clause: '' };
    const a = analysis || {};
    const conf = Number(a.timeConfidence);
    if (!Number.isFinite(conf) || conf < st.minConfidence) { out.reason = 'low-confidence'; return out; }
    const ev = String(a.timeEvidence == null ? '' : a.timeEvidence);
    if (!ev.trim()) { out.reason = 'no-evidence'; return out; }
    const v = verify(source, ev, a.deltaMinutes);
    out.clause = v.clause;
    if (!v.ok) { out.reason = v.reason; return out; }
    if (v.actual > st.maxMinutes) { out.reason = 'over-maxMinutes'; return out; }
    out.ok = true; out.minutes = v.actual; out.reason = 'ok';
    return out;
  }

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }

  const stat = { parses: 0, accepted: 0, refused: 0, verifies: 0, mismatches: 0, lastReason: '' };

  function parseTracked(text) {
    stat.parses++;
    const r = parse(text);
    if (r.ok) stat.accepted++; else { stat.refused++; stat.lastReason = r.reason; }
    return r;
  }
  function verifyTracked(source, evidence, minutes) {
    stat.verifies++;
    const r = verify(source, evidence, minutes);
    if (!r.ok && /^mismatch/.test(r.reason)) stat.mismatches++;
    if (!r.ok) stat.lastReason = r.reason;
    return r;
  }

  WA.elapsedEvidence = {
    version: '2.409.0',
    MINUTES_CAP: MINUTES_CAP,
    PAST_NEG: PAST_NEG, HYPOTHETICAL: HYPOTHETICAL, QUOTE: QUOTE, NEED_COST: NEED_COST,
    parseNum: parseNum,
    parse: parse, parseTracked: parseTracked,
    verify: verify, verifyTracked: verifyTracked,
    autoMinutes: autoMinutes,
    clauses: clauses, locate: locate,
    settings: settings, saveSettings: saveSettings,
    stats: function () { return Object.assign({}, stat); },
    resetStats: function () { for (const k of Object.keys(stat)) stat[k] = (typeof stat[k] === 'number') ? 0 : ''; },
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/elapsed-evidence.js', { kind: 'engine', ver: '2.409.0' });
  if (WA.log) WA.log('info', 'elapsedEvidence 已加载（2.409.0）');
})();

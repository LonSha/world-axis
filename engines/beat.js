/* beat.js —— 提取·修复·色带引擎（WA.beat）
 *
 * 治什么：模型吐出的结构化块（JSON / 故事线编号 / 好感数值）不再靠人肉挑刺。
 *   - JSON 提取：先找代码栅栏里的 json 块，找不到就取首花括号到末花括号的最大化区间（上游两步策略）。
 *   - JSON 修复：最多 20 次尝试，从报错信息里取 position，向前找最近的引号补齐（上游思路）。
 *   - 故事线 ID 校验：类别白名单，防分类错乱（把感情线塞进主线槽）。
 *   - 好感色带：0-50 蓝→绿、50-85 绿→橙、85-100 橙→红，输出 HSL。
 *
 * 缝合来源：st-beat-tracker（utils/jsonExtractor.js、utils/jsonRepair.js、utils/storylineValidator.js、
 *   utils/colorUtils.js）
 *
 * 与邻座分工：story-loop.js 管循环，beat-ledger/beat-report/beat-mask 管台账与掩码；
 *   beat 只管「从一段文本里把块挖出来、把缺引号补上、把线归到正确槽、把分数翻成颜色」。
 *
 * 边界（否定式）：
 *   1. 修引用不猜语义：只补引号/去尾逗号，不改数字不改键名。
 *   2. 修复上限 20 次，超限按 unrepairable 拒，不死循环。
 *   3. 提取只认第一个可解析区间；不合并多块，不做嵌套合并。
 *   4. 类别白名单外的线一律归 stray 并记 fault，不静默丢弃也不静默归类。
 *   5. 色带输入先夹到 0..100，越界只夹不报错（上游行为），但记一次 clamp。
 *   6. 不 eval 提取结果，只用 JSON.parse。
 *   7. 不改写原文：提取与修复都返回新串，原串不动。
 *   8. 不做 JSON5/注释语法，不做 YAML。
 *   9. 色带只给 HSL 三数，不做主题适配。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_beat_settings_v1';
  const DEF = { enabled: false, maxRepair: 20, clampColor: true, categoryStrict: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'beat',
    bounds: { maxRepair: [1, 64] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const CATEGORY_RULES = [
    { name: 'main', label: '主线', re: /^(?:M|main|主线)[-_]?\d+$/i },
    { name: 'bond', label: '感情线', re: /^(?:B|bond|感情|羁绊)[-_]?\d+$/i },
    { name: 'side', label: '支线', re: /^(?:S|side|支线)[-_]?\d+$/i },
    { name: 'foreshadow', label: '伏笔', re: /^(?:F|fore|伏笔)[-_]?\d+$/i },
    { name: 'event', label: '事件', re: /^(?:E|event|事件)[-_]?\d+$/i }
  ];
  const CATEGORIES = CATEGORY_RULES.map(function (c) { return c.name; });
  const BANDS = ['blue-green', 'green-orange', 'orange-red'];
  const BAND_LABEL = { 'blue-green': '蓝→绿', 'green-orange': '绿→橙', 'orange-red': '橙→红' };
  const THRESHOLDS = [50, 85];
  const DEFAULT_HUE = { cold: 210, mid: 120, hot: 30, boil: 0 };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  const stat = { extracts: 0, repairs: 0, parsed: 0, validated: 0, colored: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function refuse(reason) { stat.refused++; noteFault(reason); return { ok: false, reason: reason }; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 120) : String(v == null ? '' : v).slice(0, max || 120); }
  const BT = String.fromCharCode(96);
  /** 第一步：找代码栅栏里的 json 块；第二步：回退到首花括号→末花括号最大化区间。 */
  function extract(text) {
    const raw = String(text == null ? '' : text);
    if (!raw) return refuse('empty-text');
    const fence3 = BT + BT + BT;
    const re = new RegExp(fence3 + '\\s*(?:json)?\\s*([\\s\\S]*?)' + fence3, 'i');
    const m = re.exec(raw);
    if (m) {
      const body = m[1].trim();
      const s = body.indexOf('{'), e = body.lastIndexOf('}');
      if (s >= 0 && e > s) { stat.extracts++; return { ok: true, reason: 'ok', via: 'fence', text: body.slice(s, e + 1) }; }
      const sa = body.indexOf('['), ea = body.lastIndexOf(']');
      if (sa >= 0 && ea > sa) { stat.extracts++; return { ok: true, reason: 'ok', via: 'fence-array', text: body.slice(sa, ea + 1) }; }
    }
    const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
    if (s >= 0 && e > s) { stat.extracts++; return { ok: true, reason: 'ok', via: 'brace', text: raw.slice(s, e + 1) }; }
    const sa = raw.indexOf('['), ea = raw.lastIndexOf(']');
    if (sa >= 0 && ea > sa) { stat.extracts++; return { ok: true, reason: 'ok', via: 'bracket', text: raw.slice(sa, ea + 1) }; }
    return refuse('no-block');
  }
  /** 修复：读 JSON.parse 报错里的 position，向前找最近的引号补齐。最多 maxRepair 次。 */
  function repair(text, opts) {
    const cfg = settings();
    const o = opts || {};
    const limit = Number.isFinite(Number(o.maxRepair)) ? Number(o.maxRepair) : cfg.maxRepair;
    let s = String(text == null ? '' : text).trim();
    if (!s) return refuse('empty-text');
    const tried = [];
    for (let i = 0; i < limit; i++) {
      try { const v = JSON.parse(s); stat.parsed++; return { ok: true, reason: 'ok', attempts: i, value: v, text: s, fixes: tried }; }
      catch (e) {
        const msg = String(e && e.message || '');
        const pos = extractPosition(msg);
        const fix = applyFix(s, pos, msg);
        if (!fix) { noteFault('unrepairable'); return { ok: false, reason: 'unrepairable', attempts: i, fixes: tried, detail: msg.slice(0, 120) }; }
        if (fix.text === s) { noteFault('no-progress'); return { ok: false, reason: 'no-progress', attempts: i, fixes: tried, detail: msg.slice(0, 120) }; }
        s = fix.text;
        tried.push(fix.kind);
      }
    }
    noteFault('repair-limit');
    return { ok: false, reason: 'repair-limit', attempts: limit, fixes: tried };
  }
  function extractPosition(msg) {
    let m = /position\s+(\d+)/i.exec(msg) || /at\s+position\s+(\d+)/i.exec(msg) || /position\s*\(?\s*(\d+)/i.exec(msg);
    if (!m) m = /column\s+(\d+)/i.exec(msg);
    return m ? parseInt(m[1], 10) : -1;
  }
  /** 只做三类无害修补：补引号、去尾逗号、补右括号。 */
  function applyFix(s, pos, msg) {
    const low = String(msg || '').toLowerCase();
    // 尾逗号：优先用正则一次性剔除（比按 position 切更稳）
    if (/expected.*property name|unexpected token|trailing/i.test(low)) {
      const cut = s.replace(/,\s*([}\]])/g, '$1');
      if (cut !== s) return { kind: 'drop-trailing-comma', text: cut };
      if (pos > 0 && s[pos - 1] === ',') return { kind: 'drop-comma', text: s.slice(0, pos - 1) + s.slice(pos) };
    }
    // 未闭合字符串：末引号数为奇 → 尾部补引号
    if (countChar(s, '"') % 2 !== 0 && /unterminated|unexpected end|end of json|expected ',' or '\}'/i.test(low)) {
      return { kind: 'close-quote', text: s + '"' };
    }
    // 括号/引号未闭合：按栈补齐
    const need = bracketBalance(s);
    if (need) return { kind: 'close-tail:' + need, text: s + need };
    // 末次尝试：末引号为奇则补引号
    if (countChar(s, '"') % 2 !== 0) return { kind: 'close-quote-last', text: s + '"' };
    return null;
  }
  function countChar(s, c) { let n = 0; for (let i = 0; i < s.length; i++) if (s[i] === c) n++; return n; }
  function bracketBalance(s) {
    const stack = [];
    let inStr = false, esc = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') { inStr = true; continue; }
      if (c === '{' || c === '[') stack.push(c);
      else if (c === '}' || c === ']') stack.pop();
    }
    if (inStr) return '"';
    return stack.reverse().map(function (c) { return c === '{' ? '}' : ']'; }).join('');
  }
  /** 故事线 ID 校验：类别白名单。白名单外的归 stray（不静默丢弃、不静默归类）。 */
  function validateId(id, opts) {
    const cfg = settings();
    const o = opts || {};
    const raw = clean(id, 40);
    if (!raw) return refuse('empty-id');
    const rule = CATEGORY_RULES.filter(function (c) { return c.re.test(raw); })[0];
    if (!rule) {
      if (cfg.categoryStrict && o.lenient !== true) { noteFault('stray'); return { ok: false, reason: 'stray', id: raw, category: 'stray' }; }
      return { ok: true, reason: 'lenient', id: raw, category: 'stray', strict: false };
    }
    stat.validated++;
    return { ok: true, reason: 'ok', id: raw, category: rule.name, categoryLabel: rule.label,
      num: parseInt(String(raw).replace(/[^0-9]/g, ''), 10) || 0 };
  }
  function categoryOf(id) { const r = validateId(id, { lenient: true }); return r.category; }
  /** 批量校验：返回分组，stray 单独一栏。 */
  function validateList(ids) {
    const list = Array.isArray(ids) ? ids : [];
    const groups = {}, stray = [];
    list.forEach(function (x) {
      const r = validateId(x, { lenient: true });
      if (r.category === 'stray') stray.push(r.id);
      else { if (!groups[r.category]) groups[r.category] = []; groups[r.category].push(r.id); }
    });
    return { ok: true, reason: 'ok', groups: groups, stray: stray, total: list.length };
  }
  /** 好感色带：0-50 蓝→绿、50-85 绿→橙、85-100 橙→红。输出 HSL。 */
  function hue(v) {
    const cfg = settings();
    let n = Number(v);
    let clamped = false;
    if (!Number.isFinite(n)) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', value: v }; }
    if (n < 0) { n = 0; clamped = true; }
    if (n > 100) { n = 100; clamped = true; }
    if (clamped && !cfg.clampColor) { noteFault('out-of-range'); return { ok: false, reason: 'out-of-range', value: v }; }
    if (clamped) noteFault('clamped');
    let band, h;
    if (n < THRESHOLDS[0]) { band = BANDS[0]; h = lerpHue(DEFAULT_HUE.cold, DEFAULT_HUE.mid, n / THRESHOLDS[0]); }
    else if (n < THRESHOLDS[1]) { band = BANDS[1]; h = lerpHue(DEFAULT_HUE.mid, DEFAULT_HUE.hot, (n - THRESHOLDS[0]) / (THRESHOLDS[1] - THRESHOLDS[0])); }
    else { band = BANDS[2]; h = lerpHue(DEFAULT_HUE.hot, DEFAULT_HUE.boil, (n - THRESHOLDS[1]) / (100 - THRESHOLDS[1])); }
    stat.colored++;
    return { ok: true, reason: 'ok', value: n, band: band, bandLabel: BAND_LABEL[band],
      hsl: { h: Math.round(h), s: 70, l: 50 }, css: 'hsl(' + Math.round(h) + ',70%,50%)' };
  }
  function lerpHue(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
  function bandOf(v) { const r = hue(v); return r.ok ? r.band : null; }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, maxRepair: cfg.maxRepair, clampColor: cfg.clampColor,
      categoryStrict: cfg.categoryStrict, categories: CATEGORIES.slice(), bands: BANDS.slice(), thresholds: THRESHOLDS.slice() };
  }
  function reset() {
    stat.extracts = 0; stat.repairs = 0; stat.parsed = 0; stat.validated = 0; stat.colored = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }
  WA.beat = {
    getSettings: settings, setSettings: saveSettings, view: view,
    extract: extract, repair: repair, parseOrExtract: parseOrExtract,
    validateId: validateId, validateList: validateList, categoryOf: categoryOf,
    hue: hue, bandOf: bandOf,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, reset: reset,
    CATEGORIES: CATEGORIES, CATEGORY_RULES: CATEGORY_RULES.map(function (c) { return { name: c.name, label: c.label, source: c.re.source }; }),
    BANDS: BANDS, BAND_LABEL: BAND_LABEL, THRESHOLDS: THRESHOLDS, MAX_REPAIR: DEF.maxRepair,
  };
  /** 一体化：提取 → 修复 → 返回对象。任一步失败即返回该步失败原因。 */
  function parseOrExtract(text, opts) {
    const ex = extract(text);
    if (!ex.ok) return ex;
    return repair(ex.text, opts);
  }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/beat.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'beat 已加载（2.230.0）');
})();

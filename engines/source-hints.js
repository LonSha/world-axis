/**
 * WorldAxis engines/source-hints.js (v2.417.0) — EXV25-5 易漏原文提醒（线索预标注）
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   `summarizer.js`（v0.8.3）擅长**压缩**：连续对话 → 小纪要 → 大总述，
 *   铁律是「事实/认知分离、不预测、不补写」。但它压缩时会**丢限定**：
 *   「他最多只能撑三息」「比上次少了一半」「从那天起再没喝过」——
 *   这类**限制 / 比较 / 读数 / 状态变化**的句子，压成纪要之后就只剩
 *   「他受了伤」「情况变了」，限定词全没了；下游模型据此写出「他还能再战」。
 *   实测 `grep -rn '易漏原文\|sourceHint\|mustReread' engines/` —— 430 引擎 0 命中
 *   （`reasoning-strip` 只处理残缺标签，`grep` 的是别的事）。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `scan({sources:[{source,text}]})` 按**线索模式**（限制 / 比较 / 读数 / 状态变化）
 *   把命中原段**整段复制**出来（不截断、不概括、不改写）→ `render(hits)` 产出
 *   带免责声明的提示段：「这是原文副本，不是新增剧情、不是必留清单，可能误选漏选」。
 *   逐段独立判定，**不用全局正则**（避免多段之间相互影响）。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 只筛文字线索，**不判定事实真假或重要程度** —— 判断留给下游模型。
 *   ② 命中原段整段复制，绝不截断或概括（截断本身就是二次丢失限定）。
 *   ③ 未命中**不等于**没有重要事实，提示段自己把这句话写出来。
 *   ④ 不写 store、不注入：本模块只产出提示段文本，何时发给模型由调用方决定。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_source_hints_settings_v1';
  const DEF = { enabled: true, maxHits: 12 };
  const __REG = { key: LS_KEY, def: DEF, module: 'sourceHints', bounds: { maxHits: [1, 48] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})));
  }
  const HEADER = '【易漏原文提醒(代码预标注)】';
  /** 四类线索。逐条独立 test —— 不用全局正则，避免多段之间相互影响。 */
  const PATTERNS = [
    { cat: 'limit', re: /不足|不到|不超过|不能|无法|难以|很难|受限|限制|压制|必须|只能|仅能|不得|禁止|至少|至多|超过|超出|低于|高于|不及|不如/ },
    { cat: 'compare', re: /最强|最高|最低|最多|最少|最大|最小|顶尖|巅峰|上限|下限|平均|普遍|相比|比起/ },
    { cat: 'change', re: /原本|原先|曾经|此前|如今|从此|自此|不再|已经|逐渐|变得|变为|变成|成为|转为|恢复|解除|改善|恶化|好转|搬出|搬入|搬到|迁出|迁入|迁居|独住|定居|脱离|摆脱|晋升|降为|再也不|不必再|不用再/ },
    { cat: 'reading', re: /[\d零〇一二两三四五六七八九十百千万半]\s*(?:级|阶|转|度|℃|°[CF]?|公里|米|公斤|斤|%|％)|[<>≤≥]\s*\d/ }
  ];
  const stat = { scans: 0, hits: 0, rendered: 0, refused: 0, lastReason: '' };
  const CAT_LABEL = { limit: '限制', compare: '比较', change: '状态变化', reading: '读数' };
  function str(v) { return String(v == null ? '' : v).trim(); }
  function catsOf(text) {
    const t = str(text);
    if (!t) return [];
    const out = [];
    for (let i = 0; i < PATTERNS.length; i++) { if (PATTERNS[i].re.test(t)) out.push(PATTERNS[i].cat); }
    return out;
  }
  /** 扫描：命中原段整段复制，不截断不概括。 */
  function scan(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const srcs = Array.isArray(s.sources) ? s.sources : [];
    if (!srcs.length) { stat.refused++; stat.lastReason = 'missing-sources';
      return { ok: false, hint: 'missing-sources：要扫描哪些段？每段给 {source, text}' }; }
    stat.scans++;
    const hits = [];
    srcs.forEach(function (item, idx) {
      if (!item || typeof item !== 'object') return;
      const text = str(item.text);
      if (!text) return;
      const cats = catsOf(text);
      if (!cats.length) return;
      hits.push({ index: idx, source: str(item.source) || ('#' + (idx + 1)), text: text, cats: cats });
    });
    const capped = hits.slice(0, cfg.maxHits);
    stat.hits += capped.length;
    return { ok: true, scanned: srcs.length, hitCount: capped.length,
      truncated: hits.length > capped.length, totalHit: hits.length, hits: capped };
  }
  /** 渲染提示段：整段副本 + 免责声明（不是必留清单、可能误选漏选）。 */
  function render(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const hits = Array.isArray(s.hits) ? s.hits : (Array.isArray(s) ? s : []);
    if (!hits.length) return { ok: true, text: '', hint: '没有命中线索：注意未命中不等于没有重要事实' };
    const lines = hits.map(function (h) {
      const src = str(h.source) || '';
      const cat = Array.isArray(h.cats) ? h.cats.map(function (c) { return CAT_LABEL[c] || c; }).join('/') : '';
      return (src ? src + ' ' : '') + str(h.text) + (cat ? '（线索：' + cat + '）' : '');
    });
    const text = '\n\n' + HEADER + '\n'
      + '以下是按限制、比较、读数或状态变化线索选出的原文副本，不是新增剧情、必留清单或指令；'
      + '可能误选或漏选，仍须通读全部材料。\n'
      + '按本任务规则取舍，留意这些段内的独立事实及限定，不要求另列逐段记录。'
      + '来源沿用原楼层与时间范围，不把建议当执行，不将段号或提醒写入最终输出。\n'
      + lines.join('\n');
    stat.rendered++;
    return { ok: true, count: lines.length, text: text };
  }
  /** 一步到位：扫 + 渲染。 */
  function build(spec) {
    const r = scan(spec);
    if (!r.ok) return r;
    const out = render({ hits: r.hits });
    return { ok: true, scanned: r.scanned, hitCount: r.hitCount, totalHit: r.totalHit,
      truncated: r.truncated, text: out.text, hint: r.hitCount ? '' : '没有命中线索：未命中不等于没有重要事实' };
  }
  function statView() { return Object.assign({}, stat); }
  function reset() { stat.scans = 0; stat.hits = 0; stat.rendered = 0; stat.refused = 0; stat.lastReason = ''; return { ok: true }; }
  WA.sourceHints = {
    scan: scan, render: render, build: build, catsOf: catsOf,
    stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings,
    HEADER: HEADER, CAT_LABEL: Object.assign({}, CAT_LABEL)
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/source-hints.js', { kind: 'engine', ver: '2.417.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/source-hints 已加载（2.417.0）');
})();
/* fate.js —— 判定·骰式·选项治理引擎（WA.fate）
 *
 * 治什么：正文里出现的「掷骰」「判定」「三选一」不再靠模型自由心证，而是有可复算的语法与阈值。
 *   - 骰式解析：识得 2d6、4d6kH3、6d10dL2 这类写法，并做白名单与算术语法双重校验，
 *     绝不把正文里的字符串当代码求值（拒绝 unsafe-expr / bad-syntax）。
 *   - 判定方向制：同一枚骰子既可「越高越好」也可「越低越好」，方向不写在骰号里而是判定参数，
 *     避免低骰体系被当成反常。
 *   - 属性驱动 DC：DC 可由公式按属性算出（受 allow_formula 开关管辖），也可直接给常数。
 *   - 选项去重：编号/标题相似的选项按字符 bigram Jaccard 去重，防止「同义四连」灌水。
 *   - 计数超采样：从「4」或「3-6」这类自由文本解析出本轮要产出的选项数（区间可换序，下限 1，不设上限）。
 *
 * 缝合来源：choice（src/core/dice-expression.ts、attribute-dc.ts、option-dedup.ts、resolve-count.ts）
 *   骰段正则与白名单正则按上游原样照搬；去重的标题门限沿用上游 t-0.35 的松门限写法。
 *
 * 与邻座分工：story-choice 管「选项怎么呈现、怎么回执、怎么挂分支树」；fate 只管「骰子怎么算、
 *   判定算不算过、选项怎么剔重、要出几条」。fate 不落盘、不占注入块 —— 它是纯函数面，无状态、无事务。
 *
 * 边界（否定式）：
 *   1. 不用 eval / new Function 求值表达式 —— 只用自带的递归下降算术器。
 *   2. 不认白名单以外的字符（中文、引号、下划线一律 unsafe-expr）。
 *   3. 骰段的数量与面数有硬上限（n≤200、sides≤1000），防止 9999d9999 拖死主链。
 *   4. 区间计数不设上限（上游原文如此），但下限恒为 1；空串或非数字一律 bad-count。
 *   5. 去重只剔「高度相似」，不剔「同主题」——语义归并是模型的事，不是正则的事。
 *   6. 判定方向只认 high / low，方向值写错按 high 处理并记一次 fault，不静默反转。
 *   7. 属性不足时按 0 代入，不抛错；公式里出现未知属性名按缺项失败（unknown-attr），不猜。
 *   8. 不写 store、不写 localStorage —— 本引擎无持久状态，设置只读 settingsBus 归一后的快照。
 *   9. 不代替 story-choice 落分支；不代替 rehearsal 预演代价。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const DEFAULT_SESSION = 'default';
  const LS_KEY = 'worldaxis_fate_settings_v1';
  const DEF = { enabled: true, allowFormula: true, lowRoll: false, dedupThreshold: 0.6, maxDice: 200, maxSides: 1000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'fate',
    bounds: { dedupThreshold: [0, 1], maxDice: [1, 500], maxSides: [2, 10000] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // 白名单：数字、空白、d/k/h/l、四则、括号、百分号、小数点、逗号。
  const EXPR_SAFE_RE = /^[0-9\s dDkKhHlL+\-*/()%.,]+$/;
  const DICE_SOURCE = '(\\d+)d(\\d+)(?:([kKdD])([hHlL])(\\d+)?)?';
  const DIRECTIONS = ['high', 'low'];
  const DIRECTION_LABEL = { high: '越高越好', low: '越低越好' };
  const MODES = ['min', 'random', 'max'];
  // ── v2.231.0（优化 OPT-8）：判定维度从**写死的常量**改为**读当前世界定义** ──────
  //   真源是 `engines/recipe.js` 的配方声明（`judge.enabled` / `judge.attrs` / `judge.labels`），
  //   本模块**读它**；未声明 ⇒ 原样沿用下面这份旧白名单（旧档语义逐字不变）。
  //   现场缺口（开工前逐条复核）：此前它是唯一真源 ⇒ 科幻局声明了 body/sense/mind/will
  //   也照样被拉回六属性，而「非数值叙事可关闭属性判定」在源码里没有任何落点。
  const ATTRS_DEF = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  const ATTR_LABEL_DEF = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' };
  /**
   * 当前世界的判定面声明（只读，**不记 stat**）。
   *   recipe 未装载 / 该配方未声明判定面 ⇒ null（= 未声明，调用方回落旧白名单）。
   */
  function judgeSpec() {
    // ⚠ 全限定名（同 economy.spec 的纪律）：引用面只认 `WA.ns.mem`。
    if (!WA.recipe || typeof WA.recipe.judgeSpec !== 'function') return null;
    let j = null;
    try { j = WA.recipe.judgeSpec(); } catch (e) { j = null; }
    return (j && j.ok) ? j : null;
  }
  /**
   * 判定面四态（机械可判，不猜）：
   *   `default` 未声明 ⇒ 旧白名单（合法状态，不是缺陷）；
   *   `declared` 声明且合法 ⇒ 用声明的维度；
   *   `off`      声明**关闭** ⇒ 公式式 DC 一律拒收 `attrs-off`（**不回落旧白名单**）；
   *   `empty`    声明了却给不出合法属性名 ⇒ 拒收 `attrs-empty`（与 `off` 分列：一个是关掉、
   *              一个是写坏了，处置相反）。
   */
  function judgeState() {
    const j = judgeSpec();
    if (!j) return { mode: 'default', enabled: true, attrs: ATTRS_DEF.slice(), labels: ATTR_LABEL_DEF,
      source: 'default', reason: '' };
    if (j.enabled === false) return { mode: 'off', enabled: false, attrs: [], labels: {},
      source: j.source, reason: 'attrs-off', dropped: (j.dropped || []).slice() };
    if (!j.attrs.length) return { mode: 'empty', enabled: true, attrs: [], labels: {},
      source: j.source, reason: 'attrs-empty', dropped: (j.dropped || []).slice() };
    return { mode: 'declared', enabled: true, attrs: j.attrs.slice(), labels: j.labels || {},
      source: j.source, reason: '', dropped: (j.dropped || []).slice() };
  }
  /** 当前生效的属性白名单（内部自用；对外由 judgeView 表达）。 */
  function attrsNow() { return judgeState().attrs; }
  /**
   * 判定面读数（诊断与面板的真消费方）。
   *   `fallback` 与 `reason` **分列**：前者答「是不是在沿用旧白名单」（合法状态），
   *   后者答「拒收码是什么」（非空即真的不能判定）。
   */
  function judgeView() {
    const js = judgeState();
    return { enabled: js.enabled, mode: js.mode, attrs: js.attrs.slice(),
      labels: Object.assign({}, js.labels), source: js.source, reason: js.reason,
      dropped: (js.dropped || []).slice(), fallback: js.mode === 'default',
      note: js.mode === 'default' ? '未声明判定面 ⇒ 沿用旧白名单（str/dex/con/int/wis/cha）'
        : (js.mode === 'off' ? '这一局的判定面已关闭（非数值叙事）：公式式 DC 一律拒收，不回落成旧白名单'
          : (js.mode === 'empty' ? '声明了判定面却没有合法属性名（属性名须为 ASCII 标识符）'
            : '判定维度来自当前世界定义（' + js.source + '）')) };
  }
  const ZH_NUM = { '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  const HEADER_RE = /^\s*(?:[A-Za-z][.、)]|[0-9]+[.、)]|[（(][A-Za-z0-9]+[)）]|[\u2460-\u2473]|[【\[][^】\]]{0,8}[】\]])\s*/;
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  const stat = { rolled: 0, parsed: 0, checked: 0, resolved: 0, deduped: 0, dealt: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function refuse(reason) { stat.refused++; noteFault(reason); return { ok: false, reason: reason }; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80); }
  function clampInt(v, lo, hi, dflt) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return dflt;
    return Math.min(Math.max(n, lo), hi);
  }
  /** 随机源可用性守卫。不裸调 Math.random 兜底 —— 口径见下。 */
  //  全库纪律（v2.14.0 起，tests/run.js「裸调归零」判据逐文件扫）：产品代码里
  //  唯一的 Math.random 是 core/rand.js 的自动种子那 1 处。此前的『落回』写法
  //  等于给「种子已定」开了一个后门：rand 缺席时照样出数，而那个数不参与
  //  决策流磁带、不可复现 —— 正是本仓要治的那件事。
  //  与 engines/hazard.js（`rand-unavailable` 拒收）逐字同规：
  //  **rand 不可用就显式拒收，不猜、不兜底。**
  function randOk() { return !!(WA.rand && typeof WA.rand.dice === 'function'); }
  function randIntOk() { return !!(WA.rand && typeof WA.rand.int === 'function'); }
  function rnd(sides, tag) { return WA.rand.dice(sides, tag || 'fate'); }
  function rndInt(lo, hi, tag) { return WA.rand.int(lo, hi, tag || 'fate'); }
  /** 字符数组 → 小写字母扫一遍，返回出现过的 'd' 形骰段的连续片段数。 */
  function hasDiceSeg(s) { return new RegExp(DICE_SOURCE, 'g').test(String(s || '')); }
  /** 骰式解析。返回 ok + 摘要；不接受任何非白名单字符。 */
  function parse(expr) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const raw = clean(expr, 200);
    if (!raw) return refuse('empty-expr');
    if (!EXPR_SAFE_RE.test(raw)) return refuse('unsafe-expr');
    const re = new RegExp(DICE_SOURCE, 'g');
    const segs = [];
    let m = null;
    while ((m = re.exec(raw)) !== null) {
      const n = parseInt(m[1], 10), sides = parseInt(m[2], 10);
      if (n < 1 || sides < 2) return refuse('bad-dice');
      if (n > cfg.maxDice || sides > cfg.maxSides) return refuse('dice-too-big');
      let keep = 0, mode = null;
      // 捕获组：1=n 2=sides 3=k/d 4=h/l 5=数量（数量可省略，缺省为 1）
      if (m[3]) { mode = m[3].toLowerCase() === 'k' ? 'keep' : 'drop'; keep = m[5] ? parseInt(m[5], 10) : 1; }
      if (mode && (keep < 1 || keep > n)) return refuse('bad-keep');
      segs.push({ at: m.index, len: m[0].length, n: n, sides: sides, mode: mode, keep: keep, take: m[4] ? m[4].toUpperCase() : null });
    }
    if (!segs.length) return refuse('no-dice');
    // 把骰段挖掉，剩下必须是合法算术式（防 '2d6 script' 这类夹带）。
    let rest = raw;
    for (let i = segs.length - 1; i >= 0; i--) rest = rest.slice(0, segs[i].at) + '0' + rest.slice(segs[i].at + segs[i].len);
    if (!isArithmeticSyntax(rest)) return refuse('bad-syntax');
    stat.parsed++;
    return { ok: true, reason: 'ok', expr: raw, dice: segs.length,
      total: segs.reduce(function (a, s) { return a + s.n; }, 0), segs: segs, rest: rest };
  }
  /** 递归下降算术语法校验：不执行任何代码，只确认括号配对与运算符位置合法。 */
  function isArithmeticSyntax(s) {
    const src = String(s || '');
    let i = 0;
    function ws() { while (i < src.length && /\s/.test(src[i])) i++; }
    function factor() {
      ws();
      if (i >= src.length) return false;
      const c = src[i];
      if (c === '(') {
        i++;
        if (!expr()) return false;
        ws();
        if (src[i] !== ')') return false;
        i++;
        return true;
      }
      if (c === '-' || c === '+') { i++; return factor(); }
      if (/[0-9.]/.test(c)) {
        let seenDot = false, any = false;
        while (i < src.length && /[0-9.]/.test(src[i])) { if (src[i] === '.') { if (seenDot) return false; seenDot = true; } i++; any = true; }
        return any;
      }
      return false;
    }
    function term() {
      if (!factor()) return false;
      ws();
      while (i < src.length && (src[i] === '*' || src[i] === '/' || src[i] === '%')) {
        i++; if (!factor()) return false; ws();
      }
      return true;
    }
    function expr() {
      if (!term()) return false;
      ws();
      while (i < src.length && (src[i] === '+' || src[i] === '-')) {
        i++; if (!term()) return false; ws();
      }
      return true;
    }
    if (!src.trim()) return true;
    if (!expr()) return false;
    ws();
    return i >= src.length;
  }
  /** 掷骰。mode: min/random/max（上游三模式）。keep-highest 与 drop-lowest 两种修饰都支持。 */
  function roll(expr, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const p = parse(expr);
    if (!p.ok) return p;
    const o = opts || {};
    const mode = MODES.indexOf(clean(o.mode, 10)) >= 0 ? clean(o.mode, 10) : 'random';
    const segVals = [];
    for (let i = 0; i < p.segs.length; i++) {
      const s = p.segs[i];
      const kept = s.mode ? (s.mode === 'keep' ? s.keep : Math.max(1, s.n - s.keep)) : s.n;
      if (mode === 'min') { segVals.push(kept * 1); continue; }
      if (mode === 'max') { segVals.push(kept * s.sides); continue; }
      if (!randOk()) return refuse('rand-unavailable');
      const bag = [];
      for (let k = 0; k < s.n; k++) bag.push(rnd(s.sides, 'fate.d' + s.sides));
      bag.sort(function (a, b) { return b - a; });
      let sum = 0;
      for (let k = 0; k < kept; k++) sum += bag[k];
      segVals.push(sum);
    }
    let rest = p.rest, out = 0;
    for (let i = p.segs.length - 1; i >= 0; i--) {
      rest = rest.slice(0, p.segs[i].at) + String(segVals[i]) + rest.slice(p.segs[i].at + 1);
    }
    try { out = evalArith(rest); } catch (e) { return refuse('eval-failed'); }
    if (!Number.isFinite(out)) return refuse('eval-failed');
    stat.rolled++;
    return { ok: true, reason: 'ok', expr: p.expr, mode: mode, value: out,
      segs: p.segs.map(function (s, idx) { return { spec: s.n + 'd' + s.sides + (s.mode ? s.mode[0] + (s.mode === 'keep' ? 'H' : 'L') + s.keep : ''), got: segVals[idx] }; }) };
  }
  /** 自带算术求值器（无 eval，无 new Function）。 */
  function evalArith(s) {
    const src = String(s || '');
    let i = 0;
    // 名字与 isArithmeticSyntax 内那只**必须不同**：dup-decl-gate 的 fn-body-dup
    //   判据不限定作用域（本仓既有 IIFE 也有裸顶层，真作用域解析不可靠），
    //   两只逐字同体的小跳白函数会被判成「补丁重跑」；而它的真危害在两者日后
    //   各改一处的那天——谁生效取决于声明顺序，改的人看到的可能是另一份。
    function skipWs() { while (i < src.length && /\s/.test(src[i])) i++; }
    function factor() {
      skipWs();
      const c = src[i];
      if (c === '(') { i++; const v = expr(); skipWs(); if (src[i] !== ')') throw new Error('paren'); i++; return v; }
      if (c === '-') { i++; return -factor(); }
      if (c === '+') { i++; return factor(); }
      let st = i;
      while (i < src.length && /[0-9.]/.test(src[i])) i++;
      if (i === st) throw new Error('num');
      return parseFloat(src.slice(st, i));
    }
    function term() {
      let v = factor();
      skipWs();
      while (i < src.length && (src[i] === '*' || src[i] === '/' || src[i] === '%')) {
        const op = src[i]; i++;
        const r = factor();
        v = op === '*' ? v * r : (op === '/' ? v / r : v % r);
        skipWs();
      }
      return v;
    }
    function expr() {
      let v = term();
      skipWs();
      while (i < src.length && (src[i] === '+' || src[i] === '-')) {
        const op = src[i]; i++;
        const r = term();
        v = op === '+' ? v + r : v - r;
        skipWs();
      }
      return v;
    }
    const v = expr();
    skipWs();
    if (i < src.length) throw new Error('tail');
    return v;
  }
  function attrValue(attrs, name) {
    const a = attrs && typeof attrs === 'object' ? attrs : {};
    const v = Number(a[name]);
    return Number.isFinite(v) ? v : 0;
  }
  /** DC 公式：把属性名替换成数值再走自带求值器。未知属性名按缺项失败，不猜。 */
  function evalFormula(formula, attrs) {
    const f = clean(formula, 120);
    if (!f) return { ok: false, reason: 'empty-formula' };
    // v2.231.0（OPT-8）：维度来自当前世界定义。关闭与「声明写坏了」**分列两个码** ——
    //   前者要改写叙事方式（这一局不要属性判定），后者要去补声明，处置相反。
    const js = judgeState();
    if (js.mode === 'off') return { ok: false, reason: 'attrs-off' };
    if (js.mode === 'empty') return { ok: false, reason: 'attrs-empty' };
    const list = js.attrs;
    const ids = String(f).toLowerCase().match(/[a-z_]+/g) || [];
    const unknown = ids.filter(function (x) { return list.indexOf(x) < 0; });
    if (unknown.length) return { ok: false, reason: 'unknown-attr', attr: unknown[0] };
    let filled = String(f).toLowerCase();
    list.forEach(function (k) { filled = filled.replace(new RegExp('\\b' + k + '\\b', 'g'), String(attrValue(attrs, k))); });
    if (!EXPR_SAFE_RE.test(filled)) return { ok: false, reason: 'unsafe-expr' };
    if (!isArithmeticSyntax(filled)) return { ok: false, reason: 'bad-syntax' };
    let v = 0;
    try { v = evalArith(filled); } catch (e) { return { ok: false, reason: 'eval-failed' }; }
    if (!Number.isFinite(v)) return { ok: false, reason: 'eval-failed' };
    return { ok: true, reason: 'ok', value: v, filled: filled };
  }
  /** 解析 DC：常数、'dc:12'、或公式（受 allowFormula 开关管辖）。 */
  function resolveDC(dc, attrs) {
    const cfg = settings();
    if (dc == null || dc === '') return { ok: false, reason: 'empty-dc' };
    const n = Number(dc);
    if (Number.isFinite(n)) return { ok: true, reason: 'ok', value: n, via: 'const' };
    const s = clean(dc, 120).replace(/^dc\s*[:=]\s*/i, '');
    const nn = Number(s);
    if (Number.isFinite(nn)) return { ok: true, reason: 'ok', value: nn, via: 'const' };
    if (!cfg.allowFormula) return { ok: false, reason: 'formula-off' };
    const f = evalFormula(s, attrs);
    if (!f.ok) return { ok: false, reason: f.reason, attr: f.attr };
    return { ok: true, reason: 'ok', value: f.value, via: 'formula', filled: f.filled };
  }
  /** 判定：掷骰 + DC 对比 + 方向制。方向缺省时读设置里的 lowRoll。 */
  function check(spec, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : { expr: spec };
    const o = opts || {};
    let dir = clean(o.direction || s.direction, 10).toLowerCase();
    if (DIRECTIONS.indexOf(dir) < 0) {
      if (o.direction || s.direction) noteFault('bad-direction');
      dir = cfg.lowRoll ? 'low' : 'high';
    }
    const r = roll(s.expr || o.expr, { mode: o.mode || s.mode });
    if (!r.ok) return r;
    const dc = resolveDC(o.dc != null ? o.dc : s.dc, o.attrs || s.attrs);
    if (!dc.ok) { noteFault(dc.reason); return { ok: false, reason: dc.reason, value: r.value }; }
    const delta = dir === 'high' ? (r.value - dc.value) : (dc.value - r.value);
    const crit = (dir === 'high' && r.value >= dc.value + 10) || (dir === 'low' && r.value <= Math.max(0, dc.value - 10));
    const fumble = (dir === 'high' && r.value <= dc.value - 10) || (dir === 'low' && r.value >= dc.value + 10);
    stat.checked++;
    // v2.251.0：crit/fumble 之外的第三层粒度。分档是**纯追加**：
    //   · 只在 low 制且骰面为 1..100 时问分档器，high 制/fudge 骰保持原样；
    //   · 分档器关着时 grade 为 null，旧读法逐字不变（不替任何人改口径）；
    //   · pass/crit/fumble 三个布尔仍由本模块自己算，分档器不接管判定。
    let grade = null;
    try {
      if (dir === 'low' && WA.successGrade && Number.isInteger(r.value) && r.value >= 1 && r.value <= 100
        && Number.isInteger(dc.value) && dc.value >= 1 && dc.value <= 100) {
        const g = WA.successGrade.grade(r.value, dc.value);
        if (g && g.ok) grade = { grade: g.grade, rank: g.rank };
      }
    } catch (e) { noteFault('grade-throw'); }
    return { ok: true, reason: 'ok', expr: r.expr, roll: r.value, dc: dc.value, dcVia: dc.via,
      direction: dir, directionLabel: DIRECTION_LABEL[dir], pass: delta >= 0, margin: delta, crit: crit, fumble: fumble,
      grade: grade };
  }
  function bigrams(s) {
    const t = String(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
    const out = [];
    for (let i = 0; i + 1 < t.length; i++) out.push(t.slice(i, i + 2));
    if (!out.length && t.length === 1) out.push(t);
    return out;
  }
  function jaccard(a, b) {
    const A = bigrams(a), B = bigrams(b);
    if (!A.length && !B.length) return 1;
    if (!A.length || !B.length) return 0;
    const seen = {}, hit = {};
    A.forEach(function (g) { seen[g] = true; });
    let inter = 0;
    B.forEach(function (g) { if (seen[g] && !hit[g]) { hit[g] = true; inter++; } });
    const uniqA = Object.keys(seen).length, uniqB = Object.keys(hit).length + B.filter(function (g) { return !seen[g] && !hit[g] && (hit[g] = true); }).length;
    const uni = uniqA + uniqB - inter;
    return uni <= 0 ? 0 : inter / uni;
  }
  /** 标题门限：短标题从严（上游 t-0.35 的松门限写法）。 */
  function titleGate(threshold) { return Math.max(0, Number(threshold) - 0.35); }
  function stripHeader(s) { return String(s == null ? '' : s).replace(HEADER_RE, '').trim(); }
  /** 选项去重：返回 kept / dropped。语义近义不剔，只剔字符高度重合。 */
  function dedupe(options, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const list = Array.isArray(options) ? options : [];
    if (!list.length) return refuse('empty-options');
    const o = opts || {};
    const th = Number.isFinite(Number(o.threshold)) ? Number(o.threshold) : cfg.dedupThreshold;
    const gate = titleGate(th);
    const kept = [], dropped = [];
    list.forEach(function (it, idx) {
      const label = clean(typeof it === 'string' ? it : (it && (it.label || it.text)) || '', 120);
      if (!label) { dropped.push({ index: idx, label: '', reason: 'empty-label' }); return; }
      const bare = stripHeader(label);
      for (let i = 0; i < kept.length; i++) {
        const jb = jaccard(bare, kept[i].bare);
        const jf = jaccard(label, kept[i].label);
        const hit = (jb >= gate) || (jf >= th);   // 标题松门限｜全标签严门限
        if (hit) { dropped.push({ index: idx, label: label, reason: 'near-dup', of: kept[i].label,
          score: Number(Math.max(jb, jf).toFixed(3)), titleScore: Number(jb.toFixed(3)), fullScore: Number(jf.toFixed(3)) }); return; }
      }
      kept.push({ index: idx, label: label, bare: bare, source: it });
    });
    stat.deduped += dropped.length;
    return { ok: true, reason: 'ok', kept: kept, dropped: dropped,
      keptLabels: kept.map(function (k) { return k.label; }), threshold: th, gate: gate };
  }
  /** 计数解析：'4' / '3-6' / '3~6' / '3到6'。区间可换序；下限 1；不设上限（上游原文）。 */
  function resolveCount(text, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const minAll = Number.isFinite(Number(o.min)) ? Number(o.min) : 1;
    let s = clean(text, 40).replace(/\s+/g, '');
    s = s.replace(/[〇零一二三四五六七八九十]/g, function (c) { return String(ZH_NUM[c]); });
    s = s.replace(/[～~—－–至到]/g, '-');
    if (!s) {
      if (Number.isFinite(Number(o.dflt))) return { ok: true, reason: 'ok', fixed: true, min: Number(o.dflt), max: Number(o.dflt), pick: Number(o.dflt), via: 'default' };
      return refuse('bad-count');
    }
    let m = /^(\d+)$/.exec(s);
    if (m) {
      const n = parseInt(m[1], 10);
      const v = Math.max(minAll, n);
      stat.resolved++;
      return { ok: true, reason: 'ok', fixed: true, min: v, max: v, pick: v, via: 'fixed' };
    }
    m = /^(\d+)-(\d+)$/.exec(s);
    if (m) {
      let lo = parseInt(m[1], 10), hi = parseInt(m[2], 10);
      if (lo > hi) { const t = lo; lo = hi; hi = t; }   // 区间可换序
      lo = Math.max(minAll, lo);
      hi = Math.max(lo, hi);
      if (!randIntOk()) return refuse('rand-unavailable');
      const pick = rndInt(lo, hi, 'fate.count');
      stat.resolved++;
      return { ok: true, reason: 'ok', fixed: false, min: lo, max: hi, pick: pick, via: 'range' };
    }
    return refuse('bad-count');
  }
  /** 超采样：要 4 条先出 ceil(4*factor) 条，剔重后回截。factor 缺省 1 即不超采。 */
  function oversample(text, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const c = resolveCount(text, o);
    if (!c.ok) return c;
    const f = Number.isFinite(Number(o.factor)) ? Math.max(1, Number(o.factor)) : 1;
    const want = c.fixed ? c.pick : c.max;
    const over = Math.ceil(want * f);
    return { ok: true, reason: 'ok', want: c.pick, min: c.min, max: c.max, factor: f, over: over,
      extra: Math.max(0, over - c.pick), fixed: c.fixed };
  }
  function shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = rndInt(0, i, 'fate.shuffle');
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }
  /** 卡组：入座 shuffle→dedupe→回截。空组不进，重复不叠。 */
  function deck(items, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const list = Array.isArray(items) ? items.filter(function (x) { return clean(typeof x === 'string' ? x : (x && (x.label || x.text)) || '', 120); }) : [];
    if (!list.length) return refuse('empty-deck');
    const dd = dedupe(list, o);
    if (!dd.ok) return dd;
    const want = Number.isFinite(Number(o.want)) ? Math.max(1, Math.floor(Number(o.want))) : dd.kept.length;
    if (o.shuffle !== false && !randIntOk()) return refuse('rand-unavailable');
    const ordered = o.shuffle === false ? dd.kept : shuffle(dd.kept);
    const hand = ordered.slice(0, Math.min(want, ordered.length));
    stat.dealt = (stat.dealt || 0) + hand.length;
    return { ok: true, reason: 'ok', hand: hand.map(function (k) { return k.label; }),
      full: ordered.map(function (k) { return k.label; }), dropped: dd.dropped, want: want, shuffled: o.shuffle !== false };
  }
  function reset() {
    stat.rolled = 0; stat.checked = 0; stat.resolved = 0; stat.deduped = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    stat.parsed = 0; stat.dealt = 0;
    return { ok: true };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, allowFormula: cfg.allowFormula, lowRoll: cfg.lowRoll,
      dedupThreshold: cfg.dedupThreshold, maxDice: cfg.maxDice, maxSides: cfg.maxSides,
      directions: DIRECTIONS.slice(), attrs: attrsNow(),
      // v2.231.0（OPT-8）：判定面读数（沿用旧白名单 / 用声明的维度 / 已关闭 / 声明写坏了，四态分开）
      judge: judgeView() };
  }
  WA.fate = {
    getSettings: settings, setSettings: saveSettings, view: view,
    parse: parse, resolveCountNote: 'range-min-1-no-cap',
    isArithmeticSyntax: isArithmeticSyntax, evalArith: evalArith, evalFormula: evalFormula,
    roll: roll, check: check, resolveDC: resolveDC, dedupe: dedupe, jaccard: jaccard,
    bigrams: bigrams, stripHeader: stripHeader, titleGate: titleGate,
    resolveCount: resolveCount, oversample: oversample, deck: deck,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, reset: reset,
    DIRECTIONS: DIRECTIONS, DIRECTION_LABEL: DIRECTION_LABEL, MODES: MODES,
    // v2.231.0（OPT-8）：`ATTRS` / `ATTR_LABEL` 仍导出**旧白名单**（未声明时的回落面，值逐字不变），
    //   当前世界的判定面由 `judgeView()` 表达 —— 一个名字只表达一件事，
    //   不让「默认面」与「生效面」共用一个导出名（那正是本次要治的『执行器不消费题材配置』）。
    ATTRS: ATTRS_DEF, ATTR_LABEL: ATTR_LABEL_DEF, EXPR_SAFE_RE: EXPR_SAFE_RE, HEADER_RE: HEADER_RE,
    judgeView: judgeView,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/fate.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'fate 已加载（2.230.0）');
})();

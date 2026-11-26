/**
 * WorldAxis engines/contrast-bridge.js (v2.599.0) — 配色可读性体检面（CNT-1）
 *
 * ── 它治什么（缺口）────────────────────────────────────────
 *   `engines/contrast.js`（v2.529.0，133 行）把 WCAG 的相对亮度与对比度公式、三张默认画布、
 *   背景图压暗量都写好了 —— 但它至今**零产品读者**（零读名单里一直在）。
 *   更基础的一件事也没人做：**`grep -rn getComputedStyle` 全仓 0 命中**。
 *   也就是说，本仓的配色从未被“实际渲染成什么色”验证过 —— CSS 变量 `--wa-text-primary` /
 *   `--wa-bg-layer3` 这些值是否存在、是否比 4.5:1 低，没有任何一处能回答。
 *   而这种错**不会报错**：只会在某台手机上有人看不见字。
 *
 * ── 本模块只做三件事，每件一个硬条件 ────────────────────────
 *   ① `readVar(name)` / `palette()` —— 从**运行时计算样式**读 CSS 变量的生效值；
 *   ② `matrix()` —— 4 个字色 × 4 个底色逐对算对比度（委托 `contrast.contrast`）；
 *   ③ `canvases()` —— 字色 × 三张默认画布（委托 `contrast.checkOn`，语义完全对齐）。
 *
 * ── 边界（全是否定式）──────────────────────────────────
 *   1 **不内置色值兜底**。读不到就是读不到（`no-dom` / `no-css` / `empty`）——
 *      内置一份 “#d1d5db” 就等于造了第二套真源，而那套永远不会跟 CSS 改。
 *   2 **不自带阈值**。4.5 一律取 `contrast.MIN_RATIO`；两处各写一个 4.5 的那天，
 *      会变成“体检说合格、审阅说不合格”。
 *   3 **不自算公式**。相对亮度与对比度全走 `contrast.contrast` / `contrast.checkOn`。
 *   4 **认不出的颜色不参与结论**：含 alpha 或非 hex 的值 `contrast` 会返回 0，
 *      本面把它归为 `unparsed`（pass = null）并单列。**既不当成通过，也不当成不达标** ——
 *      混进去会让“不达标数”里藏着一批算不出的。
 *   5 **不读图、不算叠加**：背景图压暗量（shadeFor）需要图像像素，本面不假装能算；
 *      透明叠加后的实际颜色也不在本面结论里 —— 读数会逐字写明“按不透明算”。
 *   6 **零写**：不写 style / 不写 store / 不改 CSS 变量。本面只量。
 *   7 **读数只一个出口**：`lineOf`。
 *
 * ── why 五值（封闭表）────────────────────────────────
 *   `ok` / `module-missing` / `no-dom` / `no-css` / `no-var`。
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const VERSION = '2.599.0';
  const TEXT_VARS = ['--wa-text-primary', '--wa-text-secondary', '--wa-text-tertiary', '--wa-text-disabled'];
  const BG_VARS = ['--wa-bg-void', '--wa-bg-layer1', '--wa-bg-layer2', '--wa-bg-layer3'];
  const WHY = ['ok', 'module-missing', 'no-dom', 'no-css', 'no-var'];
  let _stat = { reads: 0, matrices: 0, last: null };

  function clean(v, max) {
    try { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
    catch (e) { return String(v == null ? '' : v).slice(0, max || 60); }
  }
  function engine() {
    const C = WA.contrast;
    return (C && typeof C.contrast === 'function') ? C : null;
  }

  /** 读一个 CSS 变量的**生效值**（运行时计算样式，不是源码字面量）。 */
  function readVar(name) {
    const nm = clean(name, 60);
    const out = { ok: false, why: 'no-dom', name: nm, value: '' };
    _stat.reads++;
    const win = WA.mainWin, doc = WA.mainDoc;
    if (!win || typeof win.getComputedStyle !== 'function' || !doc || !doc.documentElement) return out;
    let v = '';
    try {
      const cs = win.getComputedStyle(doc.documentElement);
      v = String((cs && typeof cs.getPropertyValue === 'function' ? cs.getPropertyValue(nm) : '') || '').trim();
    } catch (e) { out.why = 'no-css'; return out; }
    out.value = v;
    if (!v) { out.why = 'empty'; return out; }
    out.ok = true; out.why = 'ok';
    return out;
  }

  /** 两张清单逐项读一遍。 */
  function palette() {
    const texts = TEXT_VARS.map(readVar);
    const bgs = BG_VARS.map(readVar);
    const missing = texts.concat(bgs).filter(function (r) { return !r.ok; }).map(function (r) { return r.name + ':' + r.why; });
    const out = { ok: false, why: 'no-dom', texts: texts, bgs: bgs, missing: missing };
    const all = texts.concat(bgs);
    const anyDom = all.some(function (r) { return r.why !== 'no-dom'; });
    if (!anyDom) return out;                        // 连窗口/文档都没有
    if (missing.length) {
      // 缺的若是**全部**因为取样式抛错，报 no-css（“拿不到”与“没有值”下一步动作不同）
      const allCssErr = all.filter(function (r) { return !r.ok; }).every(function (r) { return r.why === 'no-css'; });
      out.why = allCssErr ? 'no-css' : 'no-var';
      return out;
    }
    out.ok = true; out.why = 'ok';
    return out;
  }

  /** 4×4 逐对算。认不出的颜色单列 unparsed，不进 pass/fail。 */
  function matrix(opts) {
    _stat.matrices++;
    const o = opts || {};
    const C = engine();
    const out = { ok: false, why: 'module-missing', minRatio: 0, rows: [], pairs: 0, pass: 0, fail: 0, unparsed: 0, worst: null };
    if (!C) return out;
    out.minRatio = Number(C.MIN_RATIO) || 0;
    const p = palette();
    out.palette = { ok: p.ok, why: p.why, missing: p.missing };
    if (!p.texts.length || !p.bgs.length) { out.why = 'no-var'; return out; }
    p.texts.forEach(function (t) {
      if (!t.ok) return;
      p.bgs.forEach(function (b) {
        if (!b.ok) return;
        const ratio = C.contrast(t.value, b.value);
        const row = { text: t.name, bg: b.name, fg: t.value, bgv: b.value, ratio: 0, pass: null, why: '' };
        if (!(ratio > 0)) {               // 认不出颜色：contrast 返回 0
          row.why = 'unparsed'; out.unparsed++; out.rows.push(row); return;
        }
        row.ratio = Math.round(ratio * 100) / 100;
        row.pass = row.ratio >= out.minRatio;
        if (row.pass) out.pass++; else out.fail++;
        if (!out.worst || row.ratio < out.worst.ratio) out.worst = { text: row.text, bg: row.bg, ratio: row.ratio };
        out.rows.push(row);
      });
    });
    out.pairs = out.rows.length;
    out.ok = true;
    out.why = out.pairs ? 'ok' : 'no-var';
    void o;
    return out;
  }

  /** 字色 × 三张默认画布（真委托 checkOn，语义与它完全对齐）。 */
  function canvases() {
    const C = engine();
    const out = { ok: false, why: 'module-missing', minRatio: 0, rows: [], fail: 0 };
    if (!C) return out;
    out.minRatio = Number(C.MIN_RATIO) || 0;
    const kinds = Array.isArray(C.LOOK_KINDS) ? C.LOOK_KINDS : [];
    TEXT_VARS.forEach(function (nm) {
      const t = readVar(nm);
      if (!t.ok) return;
      kinds.forEach(function (k) {
        const r = C.checkOn(k, t.value);
        const ratio = r && isFinite(r.ratio) ? Math.round(Number(r.ratio) * 100) / 100 : 0;
        const row = { text: nm, canvas: k, ratio: ratio, pass: ratio > 0 ? ratio >= out.minRatio : null };
        if (row.pass === false) out.fail++;
        out.rows.push(row);
      });
    });
    out.ok = out.rows.length > 0;
    out.why = out.ok ? 'ok' : 'no-var';
    return out;
  }

  /** 体检：两条路合一份结论。 */
  function audit(opts) {
    const C = engine();
    if (!C) return { ok: false, version: VERSION, why: 'module-missing', matrix: null, canvases: null,
      verdict: { minRatio: 0, pairs: 0, fail: 0, unparsed: 0, worst: null, canvasFail: 0 } };
    const m = matrix(opts);
    const cv = canvases();
    const verdict = { minRatio: m.minRatio, pairs: m.pairs, pass: m.pass, fail: m.fail,
      unparsed: m.unparsed, worst: m.worst, canvasFail: cv.fail, canvasRows: cv.rows.length };
    let why = 'ok';
    if (m.why === 'no-var' && cv.why === 'no-var') {
      const p = palette();
      why = (p.why === 'no-dom') ? 'no-dom' : (p.why === 'no-css' ? 'no-css' : 'no-var');
    }
    _stat.last = { why: why, pairs: m.pairs, fail: m.fail, unparsed: m.unparsed };
    return { ok: why === 'ok', version: VERSION, why: why, matrix: m, canvases: cv, verdict: verdict };
  }

  function whyText(why) {
    const w = clean(why, 32);
    if (w === 'ok') return '可读';
    if (w === 'module-missing') return 'contrast 不在装载面（WCAG 公式没有单一真源）';
    if (w === 'no-dom') return '宿主窗口/文档不在，读不到计算样式';
    if (w === 'no-css') return '取计算样式抛错';
    if (w === 'no-var') return '有变量读不到（缺值或空值）';
    return '未登记：' + w;
  }

  /** 读数**唯一出口**。 */
  function lineOf(a) {
    if (!a) return '配色面：没有体检结果';
    const v = a.verdict || {};
    if (a.why === 'module-missing') return '配色面：contrast 不在装载面 —— 本面不自带一份 WCAG 公式，读数不可用';
    if (a.why === 'no-dom') return '配色面：读不到计算样式（宿主窗口或文档不在）—— 配色不猜，本读数不可用';
    if (a.why === 'no-css') return '配色面：取计算样式抛错 —— 本读数不可用';
    if (a.why === 'no-var') {
      const miss = (a.matrix && a.matrix.palette && a.matrix.palette.missing) || [];
      return '配色面：有 ' + miss.length + ' 个色值读不到（' + miss.slice(0, 3).join(' / ') + '）—— 不内置兜底色，本读数不可用';
    }
    const head = '配色面：' + v.pairs + ' 对（4 字色 × 4 底色） · 低于 ' + v.minRatio + ':1 的 ' + v.fail + ' 对'
      + (v.worst ? ' · 最差 ' + v.worst.ratio + '（' + v.worst.text + ' 在 ' + v.worst.bg + '）' : '');
    const tail = (v.unparsed ? ' · 认不出颜色的 ' + v.unparsed + ' 对未参与结论' : '')
      + (v.canvasFail ? ' · 三张默认画布上另有 ' + v.canvasFail + ' 对不达标' : '')
      + '（按不透明算：透明叠加与背景图不在本面结论里）';
    return head + tail;
  }

  function summaryText(a) {
    const l = lineOf(a || audit({}));
    return l || ('配色面：' + whyText(a && a.why));
  }

  function diagnose(opts) {
    const a = audit(opts);
    const out = [lineOf(a)];
    if (a.matrix && a.matrix.rows) {
      a.matrix.rows.filter(function (r) { return r.pass === false; }).slice(0, 8).forEach(function (r) {
        out.push('· 不达标 ' + r.text + ' 在 ' + r.bg + '：' + r.ratio + ':1');
      });
    }
    if (a.canvases && a.canvases.rows) {
      a.canvases.rows.filter(function (r) { return r.pass === false; }).slice(0, 4).forEach(function (r) {
        out.push('· 画布 ' + r.canvas + ' 上的 ' + r.text + '：' + r.ratio + ':1');
      });
    }
    return { ok: a.ok, why: a.why, lines: out, verdict: a.verdict };
  }

  function stat() {
    return { version: VERSION, reads: _stat.reads, matrices: _stat.matrices, last: _stat.last ? Object.assign({}, _stat.last) : null };
  }
  function __reset() { _stat = { reads: 0, matrices: 0, last: null }; return true; }

  WA.contrastBridge = {
    version: VERSION,
    TEXT_VARS: TEXT_VARS.slice(),
    BG_VARS: BG_VARS.slice(),
    WHY: WHY.slice(),
    readVar: readVar,
    palette: palette,
    matrix: matrix,
    canvases: canvases,
    audit: audit,
    lineOf: lineOf,
    summaryText: summaryText,
    diagnose: diagnose,
    whyText: whyText,
    stat: stat,
    __reset: __reset
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/contrast-bridge.js', { kind: 'engine', ver: VERSION });
})();

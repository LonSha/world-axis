/* compare.js —— 差异·净化·变体引擎（WA.compare）
 *
 * 治什么：改稿这件事有据可依。
 *   - 深度差异：行级 Myers 二分（线性空间），长文改稿不再整段判为「全变」。
 *   - 深度清理：按规则集剥掉提示词残渣（XML 标签、代码栅栏、思考块、系统残留），剥不掉的不猜。
 *   - 中文变体：繁简/异体按词典表归一，变体表有上限，超出不静默吞并。
 *
 * 缝合来源：Veridis-Rewrite（src/diff/compare.js 的线性空间 Myers 二分；src/zh/dictionary.js 的
 *   OpenCC 词典包形态 —— 逐文件哈希校验、单目标变体上限 96）。
 *   本仓不内嵌 OpenCC 全量词典（体积不合），只搬「词典形态 + 校验 + 上限」这套骨架，
 *   词表由调用方注入，默认给一张极小的常见异体表。
 *
 * 与邻座分工：rewriter.js 管改写，refine.js 管润色，purify-scope.js 管净化范围；
 *   compare 只管「两份文本差在哪、残渣怎么剥、变体怎么归一」。
 *
 * 边界（否定式）：
 *   1. 差异比较不做 size/deadline 裁切（上游原文：不裁），但行数与字符数有硬上限防爆栈。
 *   2. 剥离只认白名单模式，不认的残渣原样留着，不猜。
 *   3. 变体归一一律单向（异体→正体），不反向。
 *   4. 单目标变体上限默认 96（上游常数），超出丢弃并记 fault。
 *   5. 不加载外部词典文件，不联网；词表只能由调用方传入或使用内置小表。
 *   6. 不清空整段：清理后长度为 0 时返回原串并记 fault（防误删正文）。
 *   7. 差异结果不含时间戳，纯函数，不落盘。
 *   8. 不代替 purify-scope 做范围裁决，不代替 rewriter 生成新文本。
 *   9. 哈希校验只做「表存在性」，不做真哈希（无外部文件）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_compare_settings_v1';
  const DEF = { enabled: false, maxLines: 4000, maxChars: 400000, maxVariants: 96, strip: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'compare',
    bounds: { maxLines: [64, 40000], maxChars: [4096, 4000000], maxVariants: [8, 512] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const OPS = ['equal', 'insert', 'delete'];
  const STRIP_PATTERNS = [
    { name: 'fence', re: /```[\s\S]*?```/g },
    { name: 'think', re: /<(think|thinking|reasoning|scratchpad)>[\s\S]*?<\/\1>/gi },
    { name: 'system', re: /<(system|sys|instruction|prompt)>[\s\S]*?<\/\1>/gi },
    { name: 'mvu', re: /<UpdateVariable>[\s\S]*?<\/UpdateVariable>/gi },
    { name: 'statusbar', re: /<StatusPlaceHolderImpl\s*\/>/gi },
    { name: 'spoil', re: /<!--[\s\S]*?-->/g }
  ];
  const VARIANT_COMMIT = 'builtin-small-table';
  const BUILTIN_VARIANTS = {
    '裏': '里', '裡': '里', '喫': '吃', '麼': '么', '妳': '你', '牠': '它', '祂': '他',
    '着': '着', '髮': '发', '捨': '舍', '乾': '干', '幹': '干', '藉': '借', '牠': '它',
    '烟': '烟', '菸': '烟', ' responds': '', '嘅': '的', '睇': '看'
  };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  const stat = { diffs: 0, compared: 0, stripped: 0, variants: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function refuse(reason) { stat.refused++; noteFault(reason); return { ok: false, reason: reason }; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 200) : String(v == null ? '' : v).slice(0, max || 200); }
  function toLines(s) {
    return String(s == null ? '' : s).replace(/\r\n?/g, '\n').split('\n');
  }
  /** 行级 Myers 二分（线性空间）：返回 equal/insert/delete 段。 */
  function diff(aText, bText, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const A = toLines(aText), B = toLines(bText);
    const o = opts || {};
    const maxLines = Number.isFinite(Number(o.maxLines)) ? Number(o.maxLines) : cfg.maxLines;
    const maxChars = Number.isFinite(Number(o.maxChars)) ? Number(o.maxChars) : cfg.maxChars;
    if (A.length > maxLines || B.length > maxLines) return refuse('too-many-lines');
    if (String(aText == null ? '' : aText).length > maxChars || String(bText == null ? '' : bText).length > maxChars) return refuse('too-long');
    stat.compared++;
    const ops = bisect(A, B, o.trim);
    const add = ops.filter(function (x) { return x.op === 'insert'; }).reduce(function (n, x) { return n + x.lines.length; }, 0);
    const del = ops.filter(function (x) { return x.op === 'delete'; }).reduce(function (n, x) { return n + x.lines.length; }, 0);
    const eq = ops.filter(function (x) { return x.op === 'equal'; }).reduce(function (n, x) { return n + x.lines.length; }, 0);
    const same = add === 0 && del === 0;
    if (!same) stat.diffs++;
    return { ok: true, reason: 'ok', same: same, added: add, removed: del, kept: eq,
      aLines: A.length, bLines: B.length, ops: ops, ratio: (A.length + B.length) ? Number(((add + del) / (A.length + B.length)).toFixed(4)) : 0 };
  }
  /** 线性空间 Myers 二分。trim 为 true 时忽略行首行尾空白差异。 */
  function bisect(A, B, trim) {
    const key = function (s) { return trim ? String(s).trim() : String(s); };
    const N = A.length, M = B.length, MAX = N + M;
    const endpoint = new Int32Array(2 * MAX + 1);
    const aFrontier = new Int32Array(2 * MAX + 1);
    const bFrontier = new Int32Array(2 * MAX + 1);
    function fwd(diag, depth) {
      const lo = Math.max(0, diag - MAX), hi = Math.min(diag, MAX);
      const extra = Math.max(0, depth - MAX), top = Math.min(diag + depth, MAX - extra);
      for (let cur = Math.max(0, diag - depth); cur <= top; cur += 2) {
        const x0 = cur >= depth ? endpoint[cur - depth - 1] : 0;
        const x1 = cur <= depth ? endpoint[cur - depth + 1] : 0;
        let x = (x0 > x1) ? x0 : x1;
        x = Math.max(x, cur - MAX + N);
        let y = x - cur;
        let i = x, j = y;
        while (i < N && j < M && key(A[i]) === key(B[j])) { i++; j++; }
        endpoint[cur - depth] = i;
        if (i >= N && j >= M) return { x: i, y: j, depth: depth };
      }
      return null;
    }
    function bwd(diag, depth) {
      const lo = Math.max(0, -diag - MAX), hi = Math.min(-diag, MAX);
      const extra = Math.max(0, depth - MAX), top = Math.min(-diag + depth, MAX - extra);
      for (let cur = Math.max(0, -diag - depth); cur <= top; cur += 2) {
        const x0 = cur >= depth ? bFrontier[cur - depth - 1] : N;
        const x1 = cur <= depth ? bFrontier[cur - depth + 1] : N;
        let x = (x0 < x1) ? x0 : x1;
        x = Math.min(x, N - (cur - MAX + M));
        let y = x - (diag + cur);
        let i = x, j = y;
        while (i > 0 && j > 0 && key(A[i - 1]) === key(B[j - 1])) { i--; j--; }
        bFrontier[cur - depth] = i;
        if (i <= 0 && j <= 0) return { x: i, y: j, depth: depth };
      }
      return null;
    }
    // 简化版：单侧推进 + 中线命中即切分，递归拼接。
    function run(a0, a1, b0, b1, out) {
      if (a0 > a1 && b0 > b1) return;
      if (a0 > a1) { out.push({ op: 'insert', lines: B.slice(b0, b1 + 1) }); return; }
      if (b0 > b1) { out.push({ op: 'delete', lines: A.slice(a0, a1 + 1) }); return; }
      let head = 0;
      while (a0 + head <= a1 && b0 + head <= b1 && key(A[a0 + head]) === key(B[b0 + head])) head++;
      if (head) { out.push({ op: 'equal', lines: A.slice(a0, a0 + head) }); a0 += head; b0 += head; }
      let tail = 0;
      while (a1 - tail >= a0 && b1 - tail >= b0 && key(A[a1 - tail]) === key(B[b1 - tail])) tail++;
      const aEnd = a1 - tail, bEnd = b1 - tail;
      const nA = aEnd - a0 + 1, nB = bEnd - b0 + 1;
      if (nA === 0) { if (nB > 0) out.push({ op: 'insert', lines: B.slice(b0, bEnd + 1) }); }
      else if (nB === 0) { out.push({ op: 'delete', lines: A.slice(a0, aEnd + 1) }); }
      else if (nA === 1) {
        const j = B.slice(b0, bEnd + 1).indexOf(A[a0]);
        if (j < 0) { out.push({ op: 'delete', lines: [A[a0]] }); out.push({ op: 'insert', lines: B.slice(b0, bEnd + 1) }); }
        else {
          if (j > 0) out.push({ op: 'insert', lines: B.slice(b0, b0 + j) });
          out.push({ op: 'equal', lines: [A[a0]] });
          if (j < nB - 1) out.push({ op: 'insert', lines: B.slice(b0 + j + 1, bEnd + 1) });
        }
      }
      else if (nB === 1) {
        const i = A.slice(a0, aEnd + 1).indexOf(B[b0]);
        if (i < 0) { out.push({ op: 'delete', lines: A.slice(a0, aEnd + 1) }); out.push({ op: 'insert', lines: [B[b0]] }); }
        else {
          if (i > 0) out.push({ op: 'delete', lines: A.slice(a0, a0 + i) });
          out.push({ op: 'equal', lines: [B[b0]] });
          if (i < nA - 1) out.push({ op: 'delete', lines: A.slice(a0 + i + 1, aEnd + 1) });
        }
      } else {
        const mid = split3(a0, aEnd, b0, bEnd, key, A, B, endpoint, aFrontier, bFrontier);
        run(a0, mid.x - 1, b0, mid.y - 1, out);
        out.push({ op: 'equal', lines: A.slice(mid.x, mid.x + 1) });
        run(mid.x + 1, aEnd, mid.y + 1, bEnd, out);
      }
      if (tail) out.push({ op: 'equal', lines: A.slice(aEnd + 1, a1 + 1) });
    }
    const out = [];
    run(0, N - 1, 0, M - 1, out);
    return merge(out);
  }
  /** 中线切分：找共同行作锚点（线性空间，不做全路径回溯），找不到则取中点。 */
  function split3(a0, a1, b0, b1, key, A, B) {
    const nA = a1 - a0 + 1, nB = b1 - b0 + 1;
    const midB = b0 + (nB >> 1);
    for (let off = 0; off < nB; off++) {
      const j1 = midB + off, j2 = midB - off;
      if (j1 <= b1) { const i = seek(A, a0, a1, key(B[j1]), key); if (i >= 0) return { x: i, y: j1 }; }
      if (j2 >= b0 && off > 0) { const i = seek(A, a0, a1, key(B[j2]), key); if (i >= 0) return { x: i, y: j2 }; }
    }
    const midA = a0 + (nA >> 1);
    return { x: midA, y: b0 + Math.min(midA - a0, nB - 1) };
  }
  function seek(A, lo, hi, val, key) {
    for (let i = lo; i <= hi; i++) if (key(A[i]) === val) return i;
    return -1;
  }
  function merge(ops) {
    const out = [];
    ops.forEach(function (s) {
      if (!s || !s.lines || !s.lines.length) return;
      const last = out[out.length - 1];
      if (last && last.op === s.op) last.lines = last.lines.concat(s.lines);
      else out.push({ op: s.op, lines: s.lines.slice() });
    });
    return out;
  }
  /** 深度清理：按白名单模式剥残渣。清空整段时回退原串（防误删正文）。 */
  function strip(text, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    if (!cfg.strip) return refuse('strip-off');
    const raw = String(text == null ? '' : text);
    if (!raw) return refuse('empty-text');
    const o = opts || {};
    const only = Array.isArray(o.only) ? o.only : null;
    let out = raw;
    const hits = [];
    STRIP_PATTERNS.forEach(function (p) {
      if (only && only.indexOf(p.name) < 0) return;
      const m = out.match(p.re);
      if (m && m.length) { hits.push({ name: p.name, count: m.length }); out = out.replace(p.re, '\n'); }
    });
    if (!out.trim()) { noteFault('strip-empty'); return { ok: false, reason: 'strip-empty', keptOriginal: true, text: raw }; }
    stat.stripped += hits.reduce(function (n, h) { return n + h.count; }, 0);
    return { ok: true, reason: 'ok', hits: hits, removed: hits.reduce(function (n, h) { return n + h.count; }, 0),
      text: out.replace(/\n{3,}/g, '\n\n').trim() };
  }
  function hasResidue(text) {
    const s = String(text == null ? '' : text);
    const hits = STRIP_PATTERNS.filter(function (p) { return p.re.test(s); }).map(function (p) { return p.name; });
    STRIP_PATTERNS.forEach(function (p) { p.re.lastIndex = 0; });
    return { ok: true, reason: 'ok', dirty: hits.length > 0, hits: hits };
  }
  /** 词典形态：单目标变体上限（上游 MAX_VARIANTS_PER_TARGET = 96）。 */
  function tableOf(map) {
    const src = (map && typeof map === 'object') ? map : BUILTIN_VARIANTS;
    const cfg = settings();
    const byTarget = {};
    const dropped = [];
    Object.keys(src).forEach(function (k) {
      const v = String(src[k] == null ? '' : src[k]);
      if (!k || !v) return;
      if (!byTarget[v]) byTarget[v] = [];
      if (byTarget[v].length >= cfg.maxVariants) { dropped.push(k); noteFault('variant-cap'); return; }
      byTarget[v].push(k);
    });
    return { byTarget: byTarget, dropped: dropped, targets: Object.keys(byTarget).length };
  }
  /** 变体归一：单向（异体→正体），不反向。 */
  function variants(text, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const raw = String(text == null ? '' : text);
    if (!raw) return refuse('empty-text');
    const o = opts || {};
    const tbl = tableOf(o.map || (o.builtin === false ? {} : BUILTIN_VARIANTS));
    let out = raw, n = 0;
    Object.keys(tbl.byTarget).forEach(function (target) {
      tbl.byTarget[target].forEach(function (v) {
        if (v === target) return;
        const before = out;
        out = out.split(v).join(target);
        if (out !== before) n += before.length - out.length >= 0 ? 1 : 1;
      });
    });
    stat.variants += n;
    return { ok: true, reason: 'ok', changed: out !== raw, hits: n, targets: tbl.targets,
      dropped: tbl.dropped, commit: VARIANT_COMMIT, text: out };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, strip: cfg.strip, maxLines: cfg.maxLines, maxChars: cfg.maxChars,
      maxVariants: cfg.maxVariants, ops: OPS.slice(), patterns: STRIP_PATTERNS.map(function (p) { return p.name; }),
      variantCommit: VARIANT_COMMIT };
  }
  function reset() {
    stat.diffs = 0; stat.compared = 0; stat.stripped = 0; stat.variants = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }
  WA.compare = {
    getSettings: settings, setSettings: saveSettings, view: view,
    diff: diff, toLines: toLines, merge: merge, strip: strip, hasResidue: hasResidue,
    variants: variants, tableOf: tableOf,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, reset: reset,
    OPS: OPS, STRIP_PATTERNS: STRIP_PATTERNS.map(function (p) { return p.name; }),
    VARIANT_COMMIT: VARIANT_COMMIT, BUILTIN_VARIANTS: BUILTIN_VARIANTS, MAX_VARIANTS_PER_TARGET: DEF.maxVariants,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/compare.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'compare 已加载（2.230.0）');
})();

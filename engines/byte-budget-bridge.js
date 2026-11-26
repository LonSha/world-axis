/**
 * WorldAxis engines/byte-budget-bridge.js (v2.598.0) — 字节预算体检面（SLT-1）
 *
 * ── 它治什么（缺口）────────────────────────────────────────
 *   本仓里「文本有多长」这件事有两个不同的计数法：`String.length` 是 **UTF-16 码元数**，
 *   而局限是字节：localStorage 配额、后端对世界书文件名的 255 字节截断、深存导出，全都按 **UTF-8 字节**。
 *   一个 30 字的中文名是 90 字节，一个带 emoji 的句子按 length 算 2、按字节算 4。
 *   `engines/slot-format.js`（v2.529.0）把**正确的字节算法**（按码点整字、代理对算一个）写好了 ——
 *   但它只服务于「存档位命名」，至今**零产品读者**：仓里没有任何一处能回答
 *   「我的存档里哪一条文本快要被截了 / 字符数报喜不报忧了多少倍」。
 *
 * ── 本模块只做三件事，每件一个硬条件 ────────────────────────
 *   ① `scan()` —— 逐字段量字节（**只记路径与数字，不记内容**）；
 *   ② `longest(n)` / `audit()` —— 报最长的几条与超线计数（超线阈值可给）；
 *   ③ `slotRoom(name)` —— 拿存档位命名规则算名字的字节预算与余量。
 *
 * ── 边界（全是否定式）────────────────────────────────────
 *   1 **不自带一套字节算法**：一律调 `slotFormat.byteLength`。两套字节算法必然漂移，
 *      而漂移的后果是「体检说没事、落盘时被截了」—— 比不量更坏。
 *   2 **只记数字，不记内容**：返回值里只有路径、字符数、字节数、比值。
 *      任何一处文本内容都不进读数、不进诊断行、不进面板。
 *   3 **敏感键名整枝跳过**：字段名命中 key/secret/token/password 的子树**连字节数也不报**
 *      （长度本身也是信息）。跳过的枝在 `skipped` 里**只报字段名与深度**，不报值。
 *   4 **零写、零截断**：不 `truncateBytes`、不改任何字段、不碰 store 的写口。
 *      本面只回答「快要被截了」，不替你截。
 *   5 **扫不到就停、停过就说**：节点数到上限就停，`truncated:true` 带回已扫数。
 *      把「只扫了一部分」写成「全仓都量过了」就是伪造。
 *   6 **读不到就说读不到**：没有 store / store 里没有任何字符串，各报各的 why，
 *      不拿「0 字节」冒充「看过了」。
 *   7 **一行读数只一个出口**：`lineOf`。
 *
 * ── why 五值（封闭表）────────────────────────────────
 *   `ok` / `module-missing` / `no-store` / `no-text` / `unknown-name`。
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const VERSION = '2.598.0';
  const LIMITS = { warnBytes: 4096, topN: 10, maxDepth: 6, maxNodes: 20000 };
  const WHY = ['ok', 'module-missing', 'no-store', 'no-text', 'unknown-name'];
  let _stat = { scans: 0, rooms: 0, last: null };

  function clean(v, max) {
    try { return WA.inputGuard ? WA.inputGuard.text(v, max || 200) : String(v == null ? '' : v).slice(0, max || 200); }
    catch (e) { return String(v == null ? '' : v).slice(0, max || 200); }
  }

  function engine() {
    const S = WA.slotFormat;
    return (S && typeof S.byteLength === 'function') ? S : null;
  }
  function state() {
    try { return (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || null) : null; }
    catch (e) { return null; }
  }

  /** 敏感键名：命中则**整枝不进测量**（连长度也不报）。 */
  function sensitive(k) {
    const s = String(k == null ? '' : k);
    return /(^|_)key$/i.test(s) || /^key$/i.test(s) || /secret|token|password|apikey|auth/i.test(s);
  }

  function pos(v) { const n = Number(v); return isFinite(n) && n > 0 ? Math.floor(n) : 0; }

  /**
   * 扫全仓的字符串面。
   *   返回 `{ok, why, rows, count, bytes, maxBytes, worstPath, worstChars, worstRatio,
   *     overWarn, warnBytes, skipped, truncated, scanned}`。
   *   `rows` 已按字节降序，只留 topN。
   */
  function scan(opts) {
    const o = opts || {};
    const warnBytes = pos(o.warnBytes) || LIMITS.warnBytes;
    const topN = pos(o.topN) || LIMITS.topN;
    const maxDepth = pos(o.maxDepth) || LIMITS.maxDepth;
    const maxNodes = pos(o.maxNodes) || LIMITS.maxNodes;
    const SF = engine();
    const out = { ok: false, why: 'module-missing', rows: [], count: 0, bytes: 0, maxBytes: 0,
      worstPath: '', worstChars: 0, worstRatio: 0, overWarn: 0, warnBytes: warnBytes,
      skipped: [], truncated: false, scanned: 0, maxDepth: maxDepth };
    if (!SF) return out;
    const st = state();
    if (!st) { out.why = 'no-store'; return out; }
    const all = [];
    let nodes = 0;
    let cap = false;
    const walk = function (v, path, depth) {
      if (cap) return;
      nodes++;
      if (nodes > maxNodes) { cap = true; return; }
      if (typeof v === 'string') {
        if (!v.length) return;
        const chars = v.length;
        const bytes = SF.byteLength(v);
        out.count++;
        out.bytes += bytes;
        all.push({ path: path || '(root)', chars: chars, bytes: bytes,
          ratio: chars ? Math.round((bytes / chars) * 100) / 100 : 0 });
        if (bytes > out.maxBytes) {
          out.maxBytes = bytes; out.worstPath = path || '(root)'; out.worstChars = chars;
          out.worstRatio = chars ? Math.round((bytes / chars) * 100) / 100 : 0;
        }
        if (bytes >= warnBytes) out.overWarn++;
        return;
      }
      if (v == null || typeof v !== 'object') return;
      if (depth >= maxDepth) return;
      if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) { walk(v[i], path + '[' + i + ']', depth + 1); if (cap) return; }
        return;
      }
      const ks = Object.keys(v);
      for (let i = 0; i < ks.length; i++) {
        const k = ks[i];
        const child = path ? path + '.' + k : k;
        if (sensitive(k)) { out.skipped.push({ key: clean(k, 40), depth: depth }); continue; }
        walk(v[k], child, depth + 1);
        if (cap) return;
      }
    };
    walk(st, '', 0);
    out.scanned = nodes;
    out.truncated = cap;
    all.sort(function (a, b) { return b.bytes - a.bytes; });
    out.rows = all.slice(0, topN);
    if (!out.count) { out.why = 'no-text'; return out; }
    out.ok = true; out.why = 'ok';
    return out;
  }

  /** 最长的 n 条（默认 10）。零文本时回空表，不编一行。 */
  function longest(n) {
    const s = scan({ topN: pos(n) || LIMITS.topN });
    return { ok: s.ok, why: s.why, rows: s.rows.slice(), warnBytes: s.warnBytes };
  }

  /**
   * 存档位名字的字节预算与余量。
   *   委托 slotFormat 的命名 + 预算常量 —— 本面不重算 220 / 后缀 / 四位档号。
   */
  function slotRoom(name) {
    _stat.rooms++;
    const SF = engine();
    const nm = clean(name, 200).trim();
    const out = { ok: false, why: 'module-missing', name: nm, chars: 0, bytes: 0, budget: 0, room: 0, ratio: 0 };
    if (!SF) return out;
    if (!nm) { out.why = 'unknown-name'; return out; }
    out.budget = pos(SF.MAX_NAME_BYTES) || 0;
    out.chars = nm.length;
    out.bytes = SF.byteLength(nm);
    out.room = out.budget - out.bytes;
    out.ratio = out.chars ? Math.round((out.bytes / out.chars) * 100) / 100 : 0;
    out.ok = out.room >= 0; out.why = 'ok';
    return out;
  }

  /** 体检：扫一遍 + 归结论。阈值可给。 */
  function audit(opts) {
    const s = scan(opts);
    const verdict = { count: s.count, bytes: s.bytes, maxBytes: s.maxBytes, worstPath: s.worstPath,
      worstChars: s.worstChars, worstRatio: s.worstRatio, overWarn: s.overWarn, warnBytes: s.warnBytes,
      skipped: s.skipped.length, truncated: s.truncated, scanned: s.scanned };
    _stat.scans++;
    _stat.last = { why: s.why, count: s.count, maxBytes: s.maxBytes, overWarn: s.overWarn };
    return { ok: s.ok, version: VERSION, why: s.why, rows: s.rows, verdict: verdict };
  }

  function whyText(why) {
    const w = clean(why, 32);
    if (w === 'ok') return '可读';
    if (w === 'module-missing') return 'slotFormat 不在装载面（字节算法没有单一真源）';
    if (w === 'no-store') return 'store 读不到';
    if (w === 'no-text') return 'store 里没有任何非空文本';
    if (w === 'unknown-name') return '没给名字';
    return '未登记：' + w;
  }

  /** 读数**唯一出口**。只写数字与路径，不写任何文本内容。 */
  function lineOf(a) {
    if (!a) return '字节面：没有体检结果';
    const v = a.verdict || {};
    if (a.why === 'module-missing') return '字节面：slotFormat 不在装载面 —— 字节算法没有单一真源，本读数不可用（不自己再写一套）';
    if (a.why === 'no-store') return '字节面：store 读不到 —— 不是“没有长文本”，是量不了';
    if (a.why === 'no-text') return '字节面：store 里没有任何非空文本（扫了 ' + v.scanned + ' 个节点）—— 这是“真的没有”，不是量不了';
    const head = '字节面：' + v.count + ' 条文本 · 共 ' + v.bytes + ' 字节 · 最长 ' + v.maxBytes
      + ' 字节（' + v.worstPath + '，字符 ' + v.worstChars + ' → ×' + v.worstRatio + '）'
      + ' · ≥' + v.warnBytes + ' 字节的 ' + v.overWarn + ' 条';
    const tail = (v.truncated ? '；扫到节点上限就停（已扫 ' + v.scanned + ' 个）—— 这是部分读数' : '')
      + (v.skipped ? '；敏感键名整枝跳过 ' + v.skipped + ' 处（连长度也不报）' : '');
    return head + tail;
  }

  function summaryText(a) {
    const l = lineOf(a || audit({}));
    return l || ('字节面：' + whyText(a && a.why));
  }

  /** 诊断：读数一行 + 最长的几行（路径与两个数）。 */
  function diagnose(opts) {
    const a = audit(opts);
    const out = [lineOf(a)];
    a.rows.forEach(function (r) {
      out.push('· ' + r.path + '：' + r.chars + ' 字符 / ' + r.bytes + ' 字节（×' + r.ratio + '）');
    });
    return { ok: a.ok, why: a.why, lines: out, verdict: a.verdict };
  }

  function stat() {
    return { version: VERSION, scans: _stat.scans, rooms: _stat.rooms, last: _stat.last ? Object.assign({}, _stat.last) : null };
  }
  function __reset() { _stat = { scans: 0, rooms: 0, last: null }; return true; }

  WA.byteBudgetBridge = {
    version: VERSION,
    LIMITS: Object.assign({}, LIMITS),
    WHY: WHY.slice(),
    scan: scan,
    longest: longest,
    slotRoom: slotRoom,
    audit: audit,
    lineOf: lineOf,
    summaryText: summaryText,
    diagnose: diagnose,
    whyText: whyText,
    stat: stat,
    __reset: __reset
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/byte-budget-bridge.js', { kind: 'engine', ver: VERSION });
})();

// WorldAxis tests/audit-log-v2112.js (v2.112.0) — 审计**落盘**专锁（计划二 #67 收尾）
//
// 缺口（它治什么）：
//   v2.111.0 的审计环**只驻内存**：刷新一次页面，这次会话的写痕迹全部消失。
//   于是「上一次存档是谁写的、几点、写了多少字节」在**跨会话**场景下不可答 ——
//   而"事后归因"正是本模块存在的唯一理由。
//
// 本锁钉住落盘面的**否定式**核心（四条，每条都是「不许把缺失当成通过」）：
//   ① **只增不减**：落盘是**追加**，不是覆写。断点续写的可证伪形态是
//      「连续两次 flush，第二次必须写 0 条」—— 若实现变成整环覆写，第二次会重写全部。
//   ② **挤出不静默**：两次落盘之间被环挤掉、因而没能落盘的行数必须**如实报**
//      （`lost`）。「没落盘」与「没有过」在排查时读起来一模一样，这条不许含混。
//   ③ **痕迹不改世界、不抛**：flush / restore 在任何宿主状态下都返回结构化结果，
//      从不抛。宿主不可用（无 localStorage）时如实报 `storage-unavailable` ——
//      **不假称成功**（返回 ok:true / written:0 会让「落盘成功」与「根本没落」同形）。
//   ④ **读回是只读的**：`restore()` **不**把历史合并进内存环 —— 环是**本次会话**的现场，
//      历史是**上一次会话**的现场。两者混在一起，「这次看到的是不是新事实」就无法回答。
//      故判据是「restore 之后 count() 一个都不变」。
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const synthHost = require('./synth-host.js');
const BASE = path.join(__dirname, '..');
const REL = 'core/audit-log.js';
// 导出面（v2.111.0 十口 + v2.112.0 两口）。**多一个口就要在这里多一行**（A 段会报红）。
const KEYS = ['record', 'recent', 'byAction', 'count', 'stat', 'reset', 'flush', 'restore',
  'CAP', 'PARAM_CAP', 'PERSIST_KEY', 'PERSIST_CAP', 'FIELDS', 'FORBIDDEN'];
// 只能追加：这些名字在导出面上必须**不存在**（v2.111.0 的否定面，本版重钉一遍 ——
//   新增两个口不许顺手破坏它）。
const MUST_BE_ABSENT = ['remove', 'clear', 'delete', 'splice', 'drop', 'purge'];
const FIELDS = ['seq', 'at', 'user', 'action', 'surface', 'params', 'paramsTruncated', 'result', 'ip'];
const PERSIST_KEY = 'worldaxis_auditlog_v1';

function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function exportBody(src) {
  const at = src.indexOf('WA.auditLog');
  if (at < 0) return '';
  let i = src.indexOf('{', at), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return '';
}
function attempt(fn) { try { return { threw: false, value: fn() }; } catch (e) { return { threw: true, error: e }; } }

/** 最小 localStorage 桩（真 localStorage 的语义：缺键返 null、值恒为字符串）。 */
function fakeLS(seed) {
  const m = Object.create(null);
  if (seed) Object.keys(seed).forEach(function (k) { m[k] = seed[k]; });
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    _dump: function () { return m; }
  };
}
/** 真源码装进**带 localStorage 的**合成宿主（核心原语仍是真实现，见 synth-host.negativeContext）。 */
function hostWithLS(ls) {
  const c = synthHost.negativeContext({});
  if (ls) c.window.localStorage = ls;
  vm.runInContext(srcOf(), c, { filename: REL });
  return { WA: c.window.WorldAxis, ls: ls };
}
function rowsOf(ls) {
  const raw = ls.getItem(PERSIST_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

// ── A 段：导出面枚举 ─────────────────────────────────────────────────────
function runA(a) {
  const src = srcOf();
  const body = exportBody(src);
  a(body.length > 0, 'audit2112/A1: 能从真源码取出 WA.auditLog 的对象字面量体');
  KEYS.forEach(function (k) {
    a(body.indexOf(k + ':') > 0, 'audit2112/A2: 导出面含 ' + k);
  });
  MUST_BE_ABSENT.forEach(function (k) {
    a(body.indexOf(k + ':') < 0,
      'audit2112/A3: 新增落盘口之后，导出体里仍然没有 ' + k + '（只增不减不许被顺手破坏）');
  });
  a(/PERSIST_KEY\s*=\s*['"]worldaxis_auditlog_v1['"]/.test(src),
    'audit2112/A4: 落盘键名是单一真源（' + PERSIST_KEY + '）');
  a(/PERSIST_CAP\s*=\s*256/.test(src) && /PERSIST_FORMAT\s*=\s*1/.test(src),
    'audit2112/A5: 落盘上限与格式版本都是确定量');
}

// ── B 段：运行时探针 ────────────────────────────────────────────────────
function runB(a) {
  // B16. 无宿主 ⇒ 如实报 storage-unavailable（**不**假称成功）
  const noLS = (function () {
    const c = synthHost.negativeContext({});
    vm.runInContext(srcOf(), c, { filename: REL });
    return c.window.WorldAxis.auditLog;
  })();
  noLS.record('a');
  const f0 = attempt(function () { return noLS.flush(); });
  a(f0.threw === false && f0.value.ok === false && f0.value.reason === 'storage-unavailable',
    'audit2112/B16: 无 localStorage ⇒ flush 如实报 storage-unavailable（实 ' + JSON.stringify(f0.value) + '）'
    + '—— 不许返回 ok:true/written:0：那会让「落盘成功」与「根本没落」同形');
  const r0 = attempt(function () { return noLS.restore(); });
  a(r0.threw === false && r0.value.available === false && r0.value.reason === 'storage-unavailable',
    'audit2112/B17: 无 localStorage ⇒ restore 如实报不可用（不假称「没有历史」）');
  a(noLS.stat().flushFailed === 1 && noLS.stat().restoreFailed === 1,
    'audit2112/B18: 失败计数单列（flushFailed / restoreFailed 各有其位）');

  // B19. 有宿主：flush 真落盘
  const H1 = hostWithLS(fakeLS());
  const L1 = H1.WA.auditLog;
  L1.record('store.save', { bytes: 10 });
  L1.record('settings.set', { k: 'x' });
  L1.record('permissions.deny', { user: 'u' });
  const f1 = L1.flush();
  const doc1 = rowsOf(H1.ls);
  a(f1.ok === true && f1.written === 3 && f1.total === 3 && f1.lost === 0,
    'audit2112/B19: flush 落盘 3 条（实 ' + JSON.stringify(f1) + '）');
  a(doc1 && doc1.format === 1 && doc1.rows.length === 3 && typeof doc1.savedAt === 'number',
    'audit2112/B20: 落盘体是 {format, savedAt, rows} 且格式版本可读（实 '
    + JSON.stringify(doc1 && Object.keys(doc1)) + '）');
  a(doc1.rows.map(function (r) { return r.seq; }).join(',') === '1,2,3',
    'audit2112/B21: 落盘行保序（seq 1,2,3 —— 顺序即时间）');

  // B22. 断点续写：第二次 flush **只**写增量（这是「只增不减」的可证伪形态）
  L1.record('a'); L1.record('b');
  const f2 = L1.flush();
  a(f2.written === 2 && f2.total === 5,
    'audit2112/B23: 断点续写（第二次只写 2 条、共 5 条，实 ' + JSON.stringify(f2) + '）'
    + '—— 整环覆写会让这次也写 5 条');
  const f3 = L1.flush();
  a(f3.written === 0 && f3.total === 5,
    'audit2112/B24: 无新增时 flush 幂等（written 0，实 ' + JSON.stringify(f3) + '）');
  a(L1.stat().persisted === 5 && L1.stat().persistedSeq === 5,
    'audit2112/B25: 落盘计数与断点都被记账且**可读**（stat 是唯一出口）');

  // B26. 上限：300 条入环 ⇒ 落盘只留最近 256（与内存环同量级）
  const H2 = hostWithLS(fakeLS());
  const L2 = H2.WA.auditLog;
  for (let i = 1; i <= 300; i++) L2.record('fill', { i: i });
  const f4 = L2.flush();
  const doc2 = rowsOf(H2.ls);
  a(f4.written === 256 && f4.total === 256 && f4.lost === 0,
    'audit2112/B26: 落盘写入被上限夹住（300 条入环，落盘写 256；上限是落盘侧也守的同一道闸，实 '
    + JSON.stringify(f4) + '）');
  a(doc2.rows[0].seq === 45 && doc2.rows[255].seq === 300,
    'audit2112/B27: 落盘留下的是**最近**的（首条 seq 45 = 300-256+1）');

  // B28. 挤出不静默：两次落盘之间被环挤掉、因而没落盘的行数必须如实报
  const H3 = hostWithLS(fakeLS());
  const L3 = H3.WA.auditLog;
  for (let i = 1; i <= 3; i++) L3.record('a');
  L3.flush();                                   // 断点 = 3
  for (let i = 1; i <= 300; i++) L3.record('fill');  // 环首条 seq = 48
  const f5 = L3.flush();
  a(f5.lost === 44,
    'audit2112/B28: 被环挤出而没能落盘的行如实报 lost=44（4..47 共 44 条，实 ' + f5.lost + '）'
    + '—— 「没落盘」与「没有过」必须可分');
  a(L3.stat().lost === 44, 'audit2112/B29: lost 进 stat（读数不是只写不读的暗计数）');

  // B30. 读回：只读、不改环、如实报「没有历史」
  const H4 = hostWithLS(fakeLS());
  const L4 = H4.WA.auditLog;
  const r1 = L4.restore();
  a(r1.available === true && r1.reason === 'no-history' && r1.rows.length === 0,
    'audit2112/B30: 无历史 ⇒ available:true + reason:no-history（「确实没有」不是「读不出来」）');
  L4.record('x'); L4.record('y');
  L4.flush();
  const before = L4.count();
  const r2 = L4.restore(1);
  a(r2.rows.length === 1 && r2.total === 2 && r2.rows[0].action === 'y',
    'audit2112/B31: restore(n) 夹取到最近 n 条（实 ' + JSON.stringify(r2.rows.map(function (x) { return x.action; })) + '）');
  a(L4.count() === before,
    'audit2112/B32: restore **不**把历史并进内存环（环是本次会话的现场，实 count=' + L4.count() + '）');
  a(FIELDS.every(function (f) { return f in r2.rows[0]; }),
    'audit2112/B33: 读回的行按 FIELDS 补齐九字段（读面与写面同一份字段表）');
  a(JSON.stringify(Object.keys(r2.rows[0])) === JSON.stringify(FIELDS),
    'audit2112/B34: 字段**顺序**也一致（顺序即输出顺序，读面不许自排）');
  a(L4.stat().restored === 2 && L4.stat().restoreFailed === 0,
    'audit2112/B35: 读回计数单列');

  // B36. 坏历史 / 坏落盘体：如实归因，不炸
  const H5 = hostWithLS(fakeLS({ 'worldaxis_auditlog_v1': '{不是 JSON' }));
  const L5 = H5.WA.auditLog;
  const r3 = attempt(function () { return L5.restore(); });
  a(r3.threw === false && r3.value.available === false && r3.value.reason === 'bad-format',
    'audit2112/B36: 坏落盘体 ⇒ bad-format（与「没有历史」分开报）');
  L5.record('z');
  const f6 = attempt(function () { return L5.flush(); });
  a(f6.threw === false && f6.value.ok === true && f6.value.written === 1,
    'audit2112/B37: 坏历史不阻断落盘（按「无历史」重建，实 ' + JSON.stringify(f6.value) + '）');
  const bad5 = hostWithLS(fakeLS({ 'worldaxis_auditlog_v1': JSON.stringify({ format: 99, rows: [] }) }));
  a(bad5.WA.auditLog.restore().reason === 'bad-format',
    'audit2112/B38: 不认识的格式版本按 bad-format 处理（不硬读、不猜）');

  // B39. 序号谱系重启：`reset()`（测试夹具）会把内存序号从 1 起算——
  //   此时若照旧按断点取增量，**新行会被判成「已落盘」而静默丢失**。
  const H6 = hostWithLS(fakeLS());
  const L6 = H6.WA.auditLog;
  for (let i = 1; i <= 3; i++) L6.record('old');
  L6.flush();                       // 断点 = 3
  L6.reset();                       // 序号回到 1
  L6.record('new1'); L6.record('new2');
  const f7 = L6.flush();
  a(f7.ok === true && f7.written === 2 && f7.lineageRestart === true,
    'audit2112/B39: 序号谱系重启后另起一条落盘线（写 2 条并如实标注 lineageRestart，实 '
    + JSON.stringify(f7) + '）—— 不做这件事会让新行静默丢掉');
  const doc6 = rowsOf(H6.ls);
  a(doc6.rows.map(function (r) { return r.action; }).join(',') === 'new1,new2',
    'audit2112/B40: 重启后的落盘体只含新谱系（4 条旧夹具行不并进来：按 seq 相并等于伪造历史）');
  a(L6.stat().lineageResets === 1, 'audit2112/B41: 谱系重启计数可读');

  // B42. 环里的东西**不因落盘而改变**（落盘不许改内存现场）
  a(L6.count() === 2, 'audit2112/B42: flush 之后内存环原样（落盘是另一条线，不回头改环）');
  const L7 = hostWithLS(fakeLS()).WA.auditLog;
  const LONG = 'q'.repeat(4096);
  L7.record('big', { s: LONG });
  L7.flush();
  a(L7.recent(1)[0].paramsTruncated === true,
    'audit2112/B43: 落盘不绕过参数截断（超长仍打标——落盘不是「整段留在盘上」的后门）');
}

// ── C 段：不变式 ────────────────────────────────────────────────────────
function runC(a) {
  const H = hostWithLS(fakeLS());
  const L = H.WA.auditLog;
  a(L.PERSIST_CAP === L.CAP,
    'audit2112/C1: 落盘上限与内存环同量级（' + L.PERSIST_CAP + ' vs ' + L.CAP + '）：审计是排查面不是归档面');
  a(L.PERSIST_KEY === PERSIST_KEY, 'audit2112/C2: 落盘键名与判据同源（可被读，不是文档里的一句话）');
  // C3. 落盘行集合 ⊆ 环的集合（不凭空造行）
  const seen = {};
  for (let i = 1; i <= 40; i++) { L.record('m', { i: i }); seen[i] = true; }
  L.flush();
  const back = L.restore().rows;
  a(back.length === 40 && back.every(function (r) { return r.seq >= 1 && r.seq <= 40; }),
    'audit2112/C3: 落盘行**全部**来自环（落盘不是第二个写入口 —— 它只搬，不造）');
  a(back.every(function (r, i) { return r.seq === i + 1; }),
    'audit2112/C4: 落盘行序与序号序一致（不许重排：顺序即时间）');
  // C5. flush / restore 的返回体形态稳定（无论成败）
  const ok1 = L.flush();
  a(['ok', 'written', 'total', 'lost'].every(function (k) { return k in ok1; }),
    'audit2112/C5: flush 返回体恒含 ok/written/total/lost（实 ' + JSON.stringify(Object.keys(ok1)) + '）');
  const bad = (function () {
    const c = synthHost.negativeContext({});
    vm.runInContext(srcOf(), c, { filename: REL });
    return c.window.WorldAxis.auditLog.restore();
  })();
  a(['available', 'rows', 'total'].every(function (k) { return k in bad; }),
    'audit2112/C6: restore 返回体恒含 available/rows/total（失败时也不缺件）');
  // C7. 只增不减在**落盘层**也成立
  MUST_BE_ABSENT.forEach(function (k) {
    a(typeof L[k] === 'undefined', 'audit2112/C7: 落盘面也没有 ' + k + '（只增不减是两层的规矩）');
  });
  // C8. 落盘读回之后环仍不受影响（与 B32 同族，强调一次：两个方向都成立）
  const n1 = L.count();
  L.restore(5);
  a(L.count() === n1, 'audit2112/C8: 读回不写环（双向：flush 不改环、restore 也不改环）');
}

// ── N 段：负控制（真源码破坏 + 真宿主重跑同款判据）────────────────────────
function runN(a) {
  const SRC = srcOf();
  const q = function (s) { return String.fromCharCode(34) + s + String.fromCharCode(34); };
  // 负控制的**宿主差异**：破坏「重启识别」后，原版判据里的两个写点会落在不同谱系上，
  //   所以 N3 的探针必须把「断点已落在旧谱系高位」这个条件**显式造出来**（多次 flush），
  //   否则破坏版与真版都写 2 条、破坏不显现（那是假绿）。
  const CASES = [
    { n: 1, why: 'N1: 断点续写改成整环覆写 ⇒ 「只增不减」退化成「每次重写全部」',
      from: 'const fresh = restarted ? _ring.slice() : _ring.filter(function (r) { return r.seq > _persistedSeq; });',
      to: 'const fresh = _ring.slice();',
      probe: function (L) {
        L.record('a'); L.record('b');
        L.flush();
        L.record('c'); L.record('d');
        return L.flush().written;    // 原版：2（只写 2 条增量）
      }, want: 2 },
    { n: 2, why: 'N2: 不报被挤出的行 ⇒ 「没落盘」与「没有过」同形（静默丢痕迹）',
      from: 'if (lost) _stat.lost = (_stat.lost || 0) + lost;',
      to: 'if (false) _stat.lost = (_stat.lost || 0) + lost;',
      probe: function (L) {
        for (let i = 1; i <= 3; i++) L.record('a');
        L.flush();
        for (let i = 1; i <= 300; i++) L.record('fill');
        L.flush();
        return L.stat().lost;        // 原版：44
      }, want: 44 },
    { n: 3, why: 'N3: 去掉谱系重启识别 ⇒ reset 之后的新行被判成「已落盘」而静默丢失',
      from: 'const restarted = _lineageBreak && _ring.length > 0;',
      to: 'const restarted = false;',
      probe: function (L) {
        for (let i = 1; i <= 3; i++) L.record('old');
        L.flush();
        L.record('old4');            // 断点推进到 4（旧谱系高位）
        L.flush();
        L.reset();                   // 序号回到 1（新谱系）
        L.record('new1'); L.record('new2');
        return L.flush().written;    // 原版：2；破坏版：0（新行被判成「已落盘」）
      }, want: 2 },
    { n: 4, why: 'N4: 宿主不可用时假称成功（ok:true）⇒ 失败与成功同形',
      from: "if (!ls) { _stat.flushFailed++; return { ok: false, reason: 'storage-unavailable', written: 0, lost: 0 }; }",
      to: 'if (!ls) { _stat.flushFailed++; return { ok: true, reason: null, written: 0, lost: 0 }; }',
      probe: function (L) { return L.flush().ok; }, want: false },
    { n: 5, why: 'N5: 读回时把历史并进内存环 ⇒ 「本次现场」与「上次现场」混成一个',
      from: '      _stat.restored++;\n      return { available: true, savedAt: parsed.savedAt || null, total: all.length,',
      to: '      _stat.restored++;\n      all.forEach(function (r) { _ring.push(r); });\n      return { available: true, savedAt: parsed.savedAt || null, total: all.length,',
      probe: function (L) {
        L.record('x'); L.record('y');
        L.flush();
        const before = L.count();
        L.restore();
        return L.count() - before;   // 原版：0
      }, want: 0 },
    { n: 6, why: 'N6: 坏格式版本被硬读 ⇒ 把不认识的落盘体当成本模块的历史（编事实）',
      from: "if (!parsed || parsed.format !== PERSIST_FORMAT || !Array.isArray(parsed.rows)) {",
      to: 'if (!parsed || !Array.isArray(parsed.rows)) {',
      probe: function (L) { return L.restore().reason; }, want: null,
      seed: { 'worldaxis_auditlog_v1': JSON.stringify({ format: 99, rows: [] }) } }
  ];
  CASES.forEach(function (cs) {
    const hits = SRC.split(cs.from).length - 1;
    a(hits === 1, 'audit2112/N0(' + cs.n + '): 破坏锚点恰中 1 次（实 ' + hits + '）—— 否则该条不算通过（不假绿）');
    if (hits !== 1) return;
    const broken = SRC.split(cs.from).join(cs.to);
    a(broken !== SRC, 'audit2112/Na(' + cs.n + '): 破坏真的改动了源码文本');
    // 破坏版走**同款宿主**（带同一个 localStorage 桩）
    const hb = (function () {
      const ls = fakeLS(cs.seed);
      const c = synthHost.negativeContext({});
      c.window.localStorage = ls;
      vm.runInContext(broken, c, { filename: REL + '#broken' });
      return c.window.WorldAxis.auditLog;
    })();
    let got = null;
    try { got = cs.probe(hb); } catch (e) { got = '#threw#:' + (e && e.message); }
    a(got !== cs.want, 'audit2112/' + cs.why + '（破坏后实得 ' + JSON.stringify(got) + '，原版为 '
      + JSON.stringify(cs.want) + '）');
  });
  // Nb. 纯度：原版上同款判据必须为真（否则「破坏后不同」可能只是因为原版本来就不成立）
  const H0 = hostWithLS(fakeLS());
  const L0 = H0.WA.auditLog;
  L0.record('a'); L0.record('b');
  a(L0.flush().written === 2, 'audit2112/Nb: （纯度）原版上「只写增量」成立');
  L0.reset();
  L0.record('n1'); L0.record('n2');
  a(L0.flush().written === 2, 'audit2112/Nb2: （纯度）原版上「谱系重启后写新行」成立');
  L0.record('x'); L0.flush();
  const before0 = L0.count();
  L0.restore();
  a(L0.count() === before0, 'audit2112/Nb3: （纯度）原版上「读回不改环」成立');
  a(hostWithLS(fakeLS({ 'worldaxis_auditlog_v1': JSON.stringify({ format: 99, rows: [] }) }))
    .WA.auditLog.restore().reason === 'bad-format', 'audit2112/Nb4: （纯度）原版上「坏格式版本拒读」成立');
  a(SRC.length > 6000, 'audit2112/Nc: 被破坏的源码面非空（' + SRC.length + ' 字符）');
}

module.exports = { KEYS: KEYS, REL: REL, runA: runA, runB: runB, runC: runC, runN: runN, srcOf: srcOf };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runA(a); runB(a); runC(a); runN(a);
  console.log('audit-log-v2112 ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
}

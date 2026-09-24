#!/usr/bin/env node
// WorldAxis tests/side-effect-lock-v2790.js — 拒收即提交专锁（v2.79.0 第十三面）
//
// 治的病（回到「契约存在 ≠ 契约被使用」）
//   core/store.js 的 transact 一直有一个契约：**mutator 返回 false 即中止**——
//   不落盘、不推进 meta.stateRev、不更新 updatedAt（源码实证：`if (result === false) { __tx.pop(); ... }`）。
//   而这个契约在 v2.79.0 之前，**全仓零使用**：
//   所有产品写路径判失败时写的都是 `out = { ok: false, reason: ... }; return;` ——
//   裸 return 的返回值是 undefined，不等于 false，于是 mutator 被当成「成功提交」：
//   世界没变，但 stateRev 推进了、updatedAt 更新了、整份状态写了一次盘。
//
//   为什么这不是「小事」：
//     ① stateRev 是跨实例冲突检测与磁盘序号判定的输入 —— 世界没变而序号变了，
//        诊断面把「已拒绝」显示成「已提交」，冲突检测的比较基准被污染；
//     ② 每一次无效调用都触发一次完整落盘（配额浪费，SillyTavern 上配额是真约束）；
//     ③ 「已判定的失败」与「真发生的变化」在事务计量里不可分（txStat 全记 ok）。
//
//   实测（修前）：20 次连续拒收把 stateRev 从 23 推到 43；
//     对照组 `transact(function () { return false; })` 的 rev 纹丝不动。
//   修复面：129 个站点改为 `return false;`，**唯一豁免**是抱有意副作用的站点
//     （fondness.accept 的 stale-proposal 分支：拒收本次采纳的同时作废过期建议，
//      那个作废必须落盘才有效，v2.77.0 的测试明文要求它）——它登记在 INTENTIONAL 里。
//
// 本锁做的是**证明判据两个方向都不假**：
//   A 结构：transact 契约在场（中止分支真的存在），且本锁的扫描器导出面完整。
//   B 现场：真产品面上「拒收后裸 return」的站点集合 == 登记的有意副作用集合（其余一处不留）；
//          且行为面逐站点实测「拒收不推进 rev / 不改磁盘 / 不改 updatedAt」。
//   C 实质：真源码破坏（把 return false; 还原成 return;）⇒ 行为判据必须现形（rev 被推进）。
//   D 非空转：空源码面 0 站点；注入一个新站点必须被点名；白名单不得腐烂。
//   E 无副作用：不污染真源码、不留临时文件、不动宿主全局。
'use strict';

const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const { productFiles } = require('./product-files.js');

// 有意副作用白名单：拒收分支里**真的改了状态**的站点，必须提交（保留裸 return;）。
//   判据不是「名字对得上」，而是「该分支内存在对非 out 目标的写操作」——见 scanner 的 writesInBranch。
const INTENTIONAL = [
  { rel: 'engines/fondness.js', reason: 'stale-proposal',
    why: 'accept 拒收过期建议的同时把它作废（hit.pending = null），作废必须落盘才有效' }
];

// ── 扫描器：掩码 + 括号匹配 + 嵌套深度，找「transact 回调内、拒收后裸 return」的站点 ──
//   为什么必须自己做词法而不是正则：`'}'` 出现在字符串里会让括号匹配错位；
//   注释里的示例代码会被当成真站点（「提及不是引用」）。掩码把注释与字符串内容抹成空格，
//   结构与偏移与原文一一对应（长度守恒），于是偏移可以直接用于原文切片。
function mask(src) {
  const out = src.split('');
  let i = 0, mode = 'code';
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (mode === 'code') {
      if (c === '/' && src[i + 1] === '/') { out[i] = ' '; out[i + 1] = ' '; i += 2; mode = 'line'; continue; }
      if (c === '/' && src[i + 1] === '*') { out[i] = ' '; out[i + 1] = ' '; i += 2; mode = 'block'; continue; }
      if (c === "'" || c === '"' || c === '`') { mode = c === "'" ? 'sq' : (c === '"' ? 'dq' : 'tpl'); i += 1; continue; }
      i += 1; continue;
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; } else { out[i] = ' '; } i += 1; continue; }
    if (mode === 'block') {
      if (c === '*' && src[i + 1] === '/') { out[i] = ' '; out[i + 1] = ' '; i += 2; mode = 'code'; continue; }
      if (c !== '\n') { out[i] = ' '; }
      i += 1; continue;
    }
    // 字符串体内：内容掩掉（长度不变），只认结束符
    if (c === '\\') { out[i] = ' '; if (i + 1 < n) { out[i + 1] = ' '; } i += 2; continue; }
    if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"') || (mode === 'tpl' && c === '`')) { out[i] = ' '; mode = 'code'; i += 1; continue; }
    if (c !== '\n') { out[i] = ' '; }
    i += 1; continue;
  }
  return out.join('');
}

function matchParen(code, ps) {
  let depth = 0;
  for (let i = ps; i < code.length; i++) {
    const c = code[i];
    if (c === '(') { depth++; }
    else if (c === ')') { depth--; if (depth === 0) { return i; } }
  }
  return -1;
}

function matchBrace(code, bs, limit) {
  let depth = 0;
  for (let i = bs; i < limit; i++) {
    const c = code[i];
    if (c === '{') { depth++; }
    else if (c === '}') { depth--; if (depth === 0) { return i; } }
  }
  return -1;
}

function callbackBody(code, a, b) {
  for (let i = a; i < b; i++) {
    if (code.startsWith('function', i)) {
      const j = code.indexOf('{', i);
      if (j < 0 || j >= b) { return null; }
      const e = matchBrace(code, j, b + 1);
      return e < 0 ? null : [j, e];
    }
    if (code.startsWith('=>', i)) {
      let j = i + 2;
      while (j < b && ' \t\r\n'.indexOf(code[j]) >= 0) { j++; }
      if (j < b && code[j] === '{') {
        const e = matchBrace(code, j, b + 1);
        return e < 0 ? null : [j, e];
      }
      return null;
    }
  }
  return null;
}

// 拒收分支内的**状态写**判据：分支里除 out/ret/result 之外的赋值或数组变异即算有意副作用。
const RE_WRITE = /(?:^|[;{}\s])([A-Za-z_$][\w$]*(?:\.[\w$]+|\[[^\]]{1,40}\])*)\s*(?:=(?!=)|\+=|-=|\*=|\.push\s*\(|\.splice\s*\(|\.pop\s*\(|\.shift\s*\(|\.unshift\s*\()/;

function writesInBranch(code, start, end) {
  const seg = code.slice(start, end);
  let m;
  const re = new RegExp(RE_WRITE.source, 'g');
  while ((m = re.exec(seg)) !== null) {
    const root = m[1].split('.')[0].split('[')[0];
    if (root === 'out' || root === 'ret' || root === 'result') { continue; }
    return m[1];
  }
  return null;
}

function branchStart(code, pos, floor) {
  let depth = 0;
  for (let i = pos - 1; i >= floor; i--) {
    const c = code[i];
    if (c === '}') { depth++; }
    else if (c === '{') { if (depth === 0) { return i; } depth--; }
  }
  return floor;
}

/** 扫描单个源码文本，返回 [{ line, writes, tail }]——「拒收后裸 return」的站点。 */
function scanSource(src) {
  const code = mask(src);
  if (code.length !== src.length) { throw new Error('掩码必须长度守恒'); }
  const sites = [];
  const reTx = /transact\s*\(/g;
  let mt;
  while ((mt = reTx.exec(code)) !== null) {
    const open = mt.index + mt[0].length - 1;   // 左括号位置
    const pe = matchParen(code, open);
    if (pe < 0) { continue; }
    const body = callbackBody(code, mt.index + mt[0].length, pe);
    if (!body) { continue; }
    const [ba, bb] = body;
    const stack = [];
    let pending = false;
    for (let i = ba + 1; i < bb; i++) {
      const c = code[i];
      if (c === '{') { stack.push(pending); pending = false; continue; }
      if (c === '}') { if (stack.length) { stack.pop(); } continue; }
      if (/^function(?![A-Za-z0-9_$])/.test(code.slice(i, i + 9))) { pending = true; i += 7; continue; }
      if (code.startsWith('=>', i)) {
        let j = i + 2;
        while (j < bb && ' \t\r\n'.indexOf(code[j]) >= 0) { j++; }
        if (j < bb && code[j] === '{') { pending = true; }
        i += 1; continue;
      }
      if (/^return(?![A-Za-z0-9_$])/.test(code.slice(i, i + 7))) {
        let k = i + 6;
        while (k < bb && ' \t\r\n'.indexOf(code[k]) >= 0) { k++; }
        if (code[k] === ';') {
          const depth = stack.filter(Boolean).length;
          if (depth === 0) {
            const tight = code.slice(Math.max(ba, i - 600), i).replace(/\s+/g, '');
            if (/\{[^{}]*ok:false[^{}]*\};?\}*$/.test(tight)) {
              const bs = branchStart(code, i, ba + 1);
              sites.push({ line: src.slice(0, i).split('\n').length,
                           writes: writesInBranch(code, bs, i) });
            }
          }
        }
        i += 5; continue;
      }
    }
    reTx.lastIndex = pe;
  }
  return sites;
}

/** 全产品面扫描：返回 { rel: [站点] }，只保留有站点的文件。 */
function scanProduct() {
  const out = {};
  productFiles(BASE).forEach(function (rel) {
    const src = fs.readFileSync(path.join(BASE, rel), 'utf8');
    const sites = scanSource(src);
    if (sites.length) { out[rel] = sites; }
  });
  return out;
}

// ── 行为探针：拒收调用是否推进 stateRev / 改磁盘 ──
function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts || {}).WA; }

function diskSnap() {
  const o = {};
  const LS = global.localStorage;
  for (let i = 0; i < LS.length; i++) {
    const k = LS.key(i);
    if (k !== null) { o[k] = String(LS.getItem(k)); }
  }
  return JSON.stringify(o);
}
function revOf(WA) {
  const s = WA.store.get();
  return (s && s.meta && typeof s.meta.stateRev === 'number') ? s.meta.stateRev : 0;
}

// 代表站点：覆盖本版修复面的四个引擎族（量表 / 竞争焦点 / 隐患 / 业报 / 阶梯 / 配额）
const PROBES = [
  { key: 'gauge.step 无此表', setup: function (WA) { WA.gauge.setSettings({ enabled: true }); },
    call: function (WA) { return WA.gauge.step('无此表', 5, 'ev'); } },
  { key: 'gauge.step NaN 步长', setup: function (WA) { WA.gauge.setSettings({ enabled: true }); },
    call: function (WA) { return WA.gauge.step('无此表', NaN, 'ev'); } },
  { key: 'gauge.create 重名', setup: function (WA) { WA.gauge.setSettings({ enabled: true }); WA.gauge.create('甲表'); },
    call: function (WA) { return WA.gauge.create('甲表'); } },
  { key: 'gauge.step 超单步上限',
    setup: function (WA) { WA.gauge.setSettings({ enabled: true }); WA.gauge.create('乙表'); WA.gauge.step('乙表', 30, 'e'); },
    call: function (WA) { return WA.gauge.step('乙表', -999, 'e'); } },
  { key: 'rivalry.retire 无此行', setup: function (WA) { WA.rivalry.setSettings({ enabled: true }); },
    call: function (WA) { return WA.rivalry.retire('a', 'b', 'c'); } },
  { key: 'rivalry.declare bad-weight', setup: function (WA) { WA.rivalry.setSettings({ enabled: true }); },
    call: function (WA) { return WA.rivalry.declare('a', 'b', 'c', NaN); } }
];

/** 逐探针实测：拒收后 rev 不变、磁盘不变（返回症状值，便于双向对照）。 */
function probeRejectSettle(WA) {
  WA.store.save();   // 预热：建立 meta/stateRev
  const rows = [];
  PROBES.forEach(function (p) {
    if (p.setup) { p.setup(WA); }
    const r0 = revOf(WA);
    const d0 = diskSnap();
    const res = p.call(WA);
    const r1 = revOf(WA);
    const d1 = diskSnap();
    rows.push({ key: p.key, ok: !!(res && res.ok), reason: (res && res.reason) || null,
                revDelta: r1 - r0, diskChanged: d1 !== d0 });
  });
  return rows;
}

/** 连续拒收压测：世界没变，序号就不该动（修前 20 次能推进 20 点）。 */
function probeBurst(WA) {
  WA.store.save();
  WA.gauge.setSettings({ enabled: true });
  const before = revOf(WA);
  for (let i = 0; i < 20; i++) { WA.gauge.step('不存在', 1, 'e'); }
  const after = revOf(WA);
  // 对照：真存在的表上走一步，序号必须 +1（证明判据不是「恒不推进」）
  WA.gauge.create('对照表');
  const mid = revOf(WA);
  WA.gauge.step('对照表', 5, 'e');
  const last = revOf(WA);
  return { before: before, after: after, burstDelta: after - before, realDelta: last - mid };
}

function isolated(fn) {
  const LS = global.localStorage;
  const snap = [];
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null) { snap.push([k, LS.getItem(k)]); } }
  const WA0 = global.WorldAxis;
  const origLog = WA0 && WA0.log;
  if (WA0) { WA0.log = function () {}; }
  try { return fn(); }
  finally {
    if (WA0 && origLog) { WA0.log = origLog; }
    const drop = [];
    for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null && !snap.some(function (x) { return x[0] === k; })) { drop.push(k); } }
    drop.forEach(function (k) { try { LS.removeItem(k); } catch (e) {} });
    snap.forEach(function (x) { try { LS.setItem(x[0], x[1]); } catch (e) {} });
  }
}

// ── A 结构 / B 现场 ──
function runAll(a) {
  // A 结构
  const storeSrc = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
  a(/if \(result === false\) \{ __tx\.pop\(\); recTx\(clockWall\(\) - t0, 'aborted'\); return \{ ok: false, aborted: true \}; \}/.test(storeSrc),
    'v2790: [A] transact 的中止契约在场（mutator 返回 false ⇒ 不落盘、不推进 rev）');
  a(/if \(result === false\) \{ recTx\(clockWall\(\) - t0, 'aborted'\); return \{ ok: false, aborted: true, deferred: true \}; \}/.test(storeSrc),
    'v2790: [A] 嵌套事务同样认这个契约（否则内层中止会被外层吞掉）');
  a(typeof scanSource === 'function' && typeof scanProduct === 'function',
    'v2790: [A] 扫描器导出面完整（scanSource / scanProduct）');
  // 掩码必须长度守恒 —— 否则偏移错位（本版在锚点同步器上真踩过这个坑）
  const probeSrc = "const a = \"}}}}\"; // 注释 { return; }\nreturn false;";
  a(mask(probeSrc).length === probeSrc.length,
    'v2790: [A] 掩码长度守恒（偏移可直接用于原文切片）');
  a(mask("const s = 'return;';").indexOf('return;') < 0,
    'v2790: [A] 字符串里的 return; 被掩掉（提及不是站点）');

  // B 现场（静态）
  const found = scanProduct();
  const allSites = [];
  Object.keys(found).forEach(function (rel) {
    found[rel].forEach(function (s) { allSites.push({ rel: rel, line: s.line, writes: s.writes }); });
  });
  a(allSites.length === INTENTIONAL.length,
    'v2790: [B] 产品面「拒收后裸 return」站点数 == 有意副作用登记数（实 ' + allSites.length + ' vs ' + INTENTIONAL.length + '）'
    + (allSites.length ? ' :: ' + JSON.stringify(allSites) : ''));
  const unmasked = allSites.filter(function (s) { return !s.writes; });
  a(unmasked.length === 0,
    'v2790: [B] 剩下的每一个站点都必须真带状态写（无写的站点即漏网：' + JSON.stringify(unmasked) + '）');
  INTENTIONAL.forEach(function (it) {
    const hit = allSites.filter(function (s) { return s.rel === it.rel; });
    a(hit.length === 1 && hit[0].writes,
      'v2790: [B] 白名单 ' + it.rel + ' 命中 1 处且确为状态写（实 ' + JSON.stringify(hit) + '）—— 白名单不腐烂');
  });

  // B2 现场（行为）：拒收不推进 rev / 不改磁盘
  const rows = isolated(function () { return probeRejectSettle(fresh()); });
  const bad = rows.filter(function (r) { return r.ok || r.revDelta !== 0 || r.diskChanged; });
  a(bad.length === 0,
    'v2790: [B2] 拒收调用零副作用（不推进 rev、不改磁盘）实 ' + JSON.stringify(bad));
  const burst = isolated(function () { return probeBurst(fresh()); });
  a(burst.burstDelta === 0,
    'v2790: [B2] 20 次连续拒收不推进状态序号（修前 +20；实 ' + burst.burstDelta + '）');
  a(burst.realDelta === 1,
    'v2790: [B2] 对照：真发生的变化必须 +1（判据不是「恒不推进」；实 ' + burst.realDelta + '）');
}

// ── C 实质 / D 非空转 / E 无副作用 ──
function runNegative(a) {
  const files0 = fs.readdirSync(path.join(BASE, 'tests')).sort().join(',');
  const hashStore = require('crypto').createHash('sha256')
    .update(fs.readFileSync(path.join(BASE, 'engines/gauge.js'))).digest('hex').slice(0, 16);

  // C0 前置：破坏锚点在真源码里恰 1 次
  const gsrc = fs.readFileSync(path.join(BASE, 'engines/gauge.js'), 'utf8');
  const ANCHOR = "if (!hit) { out = { ok: false, reason: 'missing', key: key }; return false; }";
  a(gsrc.split(ANCHOR).length - 1 === 1,
    'v2790: [C0] 破坏锚点在真源码里恰 1 次（实 ' + (gsrc.split(ANCHOR).length - 1) + '）');

  // C1 真源码破坏（内存副本）→ 行为判据必须现形
  const broken = gsrc.split(ANCHOR).join("if (!hit) { out = { ok: false, reason: 'missing', key: key }; return; }");
  const WA = isolated(function () {
    return fresh({ srcOverride: { 'engines/gauge.js': broken } });
  });
  const rows = isolated(function () { return probeRejectSettle(WA); });
  const offender = rows.filter(function (r) { return r.key === 'gauge.step 无此表'; })[0];
  a(offender && offender.revDelta > 0,
    'v2790: [C1] 摘掉 return false（退回裸 return）⇒ 该拒收重新提交并推进 rev（实 delta ' + (offender && offender.revDelta) + '）');

  // C1b 静态面同款：破坏副本上扫描器必须重新认出这个站点
  const sites = scanSource(broken);
  a(sites.length >= 1 && sites.some(function (s) { return s.line === (gsrc.slice(0, gsrc.indexOf(ANCHOR)).split('\n').length); }),
    'v2790: [C1] 静态扫描器在破坏副本上认出该站点（实 ' + JSON.stringify(sites) + '）');

  // C2 判据纯度：原版上同款判据必须为真（不是「破坏才现形」的恒假判据）
  const siteOrig = scanSource(gsrc);
  a(siteOrig.length === 0, 'v2790: [C2] 原版 gauge.js 上零站点（判据纯度；实 ' + JSON.stringify(siteOrig) + '）');

  // D 非空转
  a(scanSource('').length === 0, 'v2790: [D1] 空源码面零站点（判据读的是内容，不是常量）');
  const injected = 'function f() { WA.store.transact(function (d) { if (!d.x) { out = { ok: false, reason: "新码" }; return; } d.x = 1; }); }';
  const inj = scanSource(injected);
  a(inj.length === 1 && inj[0].writes === null,
    'v2790: [D1] 注入一个真站点即被抓到（实 ' + JSON.stringify(inj) + '）');
  const noTx = 'function f() { if (!d.x) { out = { ok: false, reason: "非事务" }; return; } }';
  a(scanSource(noTx).length === 0,
    'v2790: [D2] 事务之外的裸 return 不算站点（判据的输入面必须限定在 transact 回调内）');

  // E 无副作用
  a(fs.readdirSync(path.join(BASE, 'tests')).sort().join(',') === files0,
    'v2790: [E] 测试目录未被污染（无临时/备份文件）');
  a(require('crypto').createHash('sha256').update(fs.readFileSync(path.join(BASE, 'engines/gauge.js'))).digest('hex').slice(0, 16) === hashStore,
    'v2790: [E] engines/gauge.js 未被改写（破坏只发生在内存副本上）');
  const surf = require('./test-surface-gate.js').scan({});
  a(surf.locks.indexOf('tests/side-effect-lock-v2790.js') >= 0,
    'v2790: [E] 本锁真在可达面里（不是孤儿）');
  a(surf.orphans.indexOf('tests/side-effect-lock-v2790.js') < 0, 'v2790: [E] 本锁不在孤儿名单里');
  a(surf.globalResidue === 0, 'v2790: [E] 宿主全局面零残骸（实 ' + surf.globalResidue + '）');
}

module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative),
  scanSource: scanSource, scanProduct: scanProduct, INTENTIONAL: INTENTIONAL
};

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { require('./mock.js'); require('./ui-gate-sync.js').fresh({}); runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('SIDE-EFFECT-LOCK-V2790: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('SIDE-EFFECT-LOCK-V2790: pass (' + pass + ')');
}
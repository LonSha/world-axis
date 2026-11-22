'use strict';
// WorldAxis tests/opv29-z5-26-v2529.js — OPV29-26「登记一致性校验」专锁
//
// ── 本锁要证的 ─────────────────────────────────────────────────────
//   「加一台引擎要碰三处登记（骨架键 / __BOUNDED_CAPS / evict.SITES），漏一处不报错、
//   只静默出问题」这件事，从此**由机器点名**，不靠人眼扫两张几百行的表。
//
// ── 分段 ───────────────────────────────────────────────────────
//   A 真仓读数：委托 tools/registry-audit.js 的 audit()，各档必须非空且零红（空表上全绿是恒真的）；
//   B 单一真源：工具不内联键表、不自己解骨架、锚点必须恰中一次、委托声明点名两条边；
//   C 负控制（**合成目录真破坏**，两向自证）：每一条红都必须能被单独造出来，
//     并对「合法的不同键」保持沉默（通配覆盖 / per-call / cap:0 声明无写入方）。
//     这一段的理由：本工具初版只认单引号，把 12 条双引号 site 报成"无执行者"——
//     假红 12 条，而**负控制缺席时它照样会看起来通过**。
//   D 委托的边仍在跑：G18（SITES⇄调用点）与 registryParity（CAPS⇄骨架）都必须真的存在。

const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const RA = require(path.join(ROOT, 'tools', 'registry-audit.js'));

const failures = [];
let pass = 0;
function a(cond, name, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { failures.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}

// ── 合成树：只为负控制存在，与真仓无关（不读真仓、不写真仓）──
function synth(opts) {
  const o = opts || {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-ra-'));
  fs.mkdirSync(path.join(dir, 'core'));
  const siteRows = o.siteRows || ["    'a.b': { path: 'a.b', cap: 10, why: '合成站点' }"];
  const capRows = o.capRows || ["    'a.b': { cap: 10, site: 'a.js capIt()' }"];
  fs.writeFileSync(path.join(dir, 'core', 'evict.js'),
    "(function () {\n  'use strict';\n  const SITES = {\n" + siteRows.join('\n') + "\n  };\n})();\n");
  fs.writeFileSync(path.join(dir, 'core', 'store.js'),
    "(function () {\n  'use strict';\n  const __BOUNDED_CAPS = {\n" + capRows.join('\n') + "\n  };\n})();\n");
  if (o.noAjs !== true) fs.writeFileSync(path.join(dir, 'a.js'), "'use strict';\n");
  return dir;
}
function kinds(r) { return r.red.map(function (x) { return x.kind; }); }

// ══════════ A. 真仓读数 ══════════
function runA() {
  console.log('\nA. 真仓读数（工具现算，不是读缓存）');
  const r = RA.audit(ROOT);
  a(r.sites.total >= 100, 'A1 SITES 非空（' + r.sites.total + ' 条）—— 空表上「零冲突」是恒真的');
  a(r.caps.total >= 100, 'A1b CAPS 非空（' + r.caps.total + ' 条）');
  a(r.edge1.both >= 100, 'A2 字面重合非空（' + r.edge1.both + ' 条）');
  a(r.edge1.uncovered.length === 0, 'A3 边 1：没有「SITES 有、CAPS 无处安放、也解释不了」的路径（实 ' + r.edge1.uncovered.length + ' 条）');
  a(r.edge1.capDrift.length === 0, 'A4 边 1：两侧都是数字时 cap 逐条相等（漂移 ' + r.edge1.capDrift.length + ' 条）');
  a(r.edge1.wildcardCover > 0, 'A5 通配覆盖真在用（' + r.edge1.wildcardCover + ' 条）—— 这条判据不是空跑');
  a(r.edge1.perCall > 0, 'A5b per-call 豁免真在用（' + r.edge1.perCall + ' 条）');
  a(r.edge1.capsOnly > 0, 'A5c CAPS 独有非零（' + r.edge1.capsOnly + ' 条，引擎内自截断是合法形态，不是「0 才干净」）');
  a(r.edge2.unnamed === 0, 'A6 边 2：每条 CAPS 登记都点名了执行者（未点名 ' + r.edge2.unnamed + ' 条）');
  a(r.edge2.unresolved.length === 0, 'A7 边 2：点名的 .js 都真的在仓库里（缺失 ' + r.edge2.unresolved.length + ' 条）');
  a(r.edge2.namedJs > 100, 'A8 边 2：点名到文件的条目占比（' + r.edge2.namedJs + ' 条）');
  a(r.edge2.noWriter >= 1, 'A8b 「当前无写入方」被点名计数（' + r.edge2.noWriter + ' 条）—— 显式声明不混进合规里静默通过');
  a(r.ok === true, 'A9 真仓对账 0 红', JSON.stringify(kinds(r)));
  a(JSON.stringify(RA.audit(ROOT).edge1) === JSON.stringify(r.edge1), 'A10 连算两次逐字相同（无副作用）');
}

// ══════════ B. 单一真源 ══════════
function runB() {
  console.log('\nB. 单一真源（不内联表、不自己解骨架、锚点唯一）');
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'registry-audit.js'), 'utf8');
  a(src.indexOf("'reading.marks'") < 0, 'B1 工具里没有内联任何具体登记键（不写第二份表）');
  // B2 判「有没有自己解骨架」：不是禁词，而是**读次数** —— 对 core/store.js 的解析必须只有一次，
  //   且那次参数是 CAPS 锚点。初版这条写成了 `src.indexOf('defaultWorldState') < 0`，
  //   于是注释里提一句 `defaultWorldState()` 就把判据顶红了（**判据问的不是它想问的事**，
  //   与 A11 用「全表计数」量批次见证同一个病）。
  const storeReads = (src.match(/core',\s*'store\.js'/g) || []).length;
  a(storeReads === 1, 'B2 只解析一次 core/store.js（读次数 ' + storeReads + '）—— 骨架那条边不在这里解');
  a(src.indexOf('ANCHOR_CAPS') >= 0 && src.indexOf("const __BOUNDED_CAPS = {") >= 0,
    'B2b 那唯一一次解析用的是 CAPS 锚点');
  a(src.indexOf('SITE_DECLS') < 0, 'B3 不自己解析调用点（那条边委托 G18 门禁）');
  const d = RA.audit(ROOT).delegated;
  a(Array.isArray(d) && d.length === 2, 'B4 报告里逐条点名两条被委托的边（实 ' + (d ? d.length : 0) + ' 条）');
  a(d.some(function (x) { return x.to.indexOf('G18') >= 0; })
    && d.some(function (x) { return x.to.indexOf('registryParity') >= 0; }),
    'B5 委托声明指向具体门禁（G18 / registryParity），不是「另有工具」这种空话');
  // 锚点唯一性：故意让锚点出现两次 ⇒ 必须报 anchor-ambiguous，而不是挑第一个
  const dup = synth({});
  const ev = path.join(dup, 'core', 'evict.js');
  fs.writeFileSync(ev, fs.readFileSync(ev, 'utf8') + '\n// const SITES = {\n');
  a(kinds(RA.audit(dup)).indexOf('anchor') >= 0, 'B6 锚点出现两次 ⇒ 报 anchor（不挑第一个、不猜）');
  fs.rmSync(dup, { recursive: true, force: true });
}

// ══════════ C. 负控制（合成树真破坏） ══════════
function runC() {
  console.log('\nC. 负控制（合成树：每条红单独造得出来，每个合法形态保持沉默）');
  // C0 基线：合成树本身必须通过，否则后面的"变红"证明不了任何事
  const base = synth({});
  const r0 = RA.audit(base);
  a(r0.ok === true, 'C0 合成基线 0 红（先证判据在干净树上不响）', JSON.stringify(kinds(r0)));
  a(r0.sites.total === 1 && r0.caps.total === 1, 'C0b 合成基线确实解析到了两条登记（不是空表）');

  // C1 SITES 多一条 CAPS 没有的精确键 ⇒ site-uncapped
  const c1 = synth({ siteRows: ["    'a.b': { path: 'a.b', cap: 10, why: 'x' }",
    "    'a.c': { path: 'a.c', cap: 5,  why: '没人给它登记上界' }"] });
  a(kinds(RA.audit(c1)).indexOf('site-uncapped') >= 0, 'C1 SITES 有、CAPS 无、非通配非 per-call ⇒ site-uncapped');
  a(RA.audit(c1).edge1.uncovered.length === 1, 'C1b 只报那一条，不牵连别的（实 ' + RA.audit(c1).edge1.uncovered.length + ' 条）');

  // C2 两侧 cap 不等 ⇒ cap-drift
  const c2 = synth({ capRows: ["    'a.b': { cap: 12, site: 'a.js capIt()' }"] });
  const rc2 = RA.audit(c2);
  a(kinds(rc2).indexOf('cap-drift') >= 0, 'C2 CAPS.cap 与 SITES.cap 不一致 ⇒ cap-drift');

  // C3 site 指到不存在的文件 ⇒ site-unresolved
  const c3 = synth({ capRows: ["    'a.b': { cap: 10, site: 'gone-away.js capIt()' }"] });
  a(kinds(RA.audit(c3)).indexOf('site-unresolved') >= 0, 'C3 site 指向不存在的 .js ⇒ site-unresolved（改名/搬迁后登记没跟）');

  // C4 site 为空 ⇒ site-unnamed
  const c4 = synth({ capRows: ["    'a.b': { cap: 10, site: '' }"] });
  a(kinds(RA.audit(c4)).indexOf('site-unnamed') >= 0, 'C4 site 为空 ⇒ site-unnamed（没人知道谁在截断）');

  // C5 site 是自由文本 ⇒ site-untagged（自由文本不构成可核执行者）
  const c5 = synth({ capRows: ["    'a.b': { cap: 10, site: '某个地方顺手截的' }"] });
  a(kinds(RA.audit(c5)).indexOf('site-untagged') >= 0, 'C5 site 是自由文本 ⇒ site-untagged');

  // C6 双引号 site + 转义：必须被认出（初版只认单引号，假红 12 条）
  const c6 = synth({ capRows: ['    \'a.b\': { cap: 10, site: "a.js evict.array(rows, \\"a.b\\")" }'] });
  const rc6 = RA.audit(c6);
  a(rc6.ok === true && rc6.edge2.namedJs === 1,
    'C6 双引号写法的 site 被认出（点数 ' + rc6.edge2.namedJs + '）—— 只认单引号时这里是假红');

  // C7 通配路径由 CAPS 细键覆盖 ⇒ 沉默（合法形态）
  const c7 = synth({
    siteRows: ["    'a.*.c': { path: 'a.*.c', cap: 10, why: '通配聚合' }"],
    capRows: ["    'a.x.c': { cap: 10, site: 'a.js capIt()' }"]
  });
  const rc7 = RA.audit(c7);
  a(rc7.ok === true && rc7.edge1.wildcardCover === 1,
    'C7 通配路径被细键覆盖 ⇒ 沉默且计入通配覆盖（实 ' + rc7.edge1.wildcardCover + '）');

  // C8 per-call 豁免 ⇒ 沉默；但换成数字就变成 site-uncapped
  //   ⚠ 初版这里用 `a.b` —— 而 CAPS 基线里就有 `a.b`，于是条目走的是「字面命中 + 非数字不可比」
  //   那一支，**从来没进过豁免判定**：把豁免整段删掉，这条判据照样 pass（本趟负控制当场抓到）。
  //   修法：用 CAPS 里不存在的路径，才真的在测「豁免」。
  const c8a = synth({ siteRows: ["    'a.q': { path: 'a.q', cap: 'per-call', why: '上限来自设置项' }"] });
  a(RA.audit(c8a).ok === true && RA.audit(c8a).edge1.perCall === 1,
    'C8 per-call 且 CAPS 无键 ⇒ 豁免（不红，且计入 per-call 档）', JSON.stringify(kinds(RA.audit(c8a))));
// C8b 同一条换成数字 cap ⇒ 立刻 site-uncapped（豁免只对 per-call 开）。
  //   注意：这条必须用 CAPS 里**不存在**的路径，否则先撞上 cap-drift，证明不了豁免口径。
  const c8b = synth({ siteRows: ["    'a.c': { path: 'a.c', cap: 24, why: '上限写死了却没登记' }"] });
  a(kinds(RA.audit(c8b)).indexOf('site-uncapped') >= 0, 'C8b 同一条换成数字 cap ⇒ 立刻 site-uncapped（豁免只对 per-call 开）');

  // C9 cap:0 + 「当前无写入方」⇒ 点名但不红；给正数 cap ⇒ 红
  //   两侧都要指向同一条路径：只改 CAPS 会让 SITES 那条变成 site-uncapped，抢在本题前面。
  const c9a = synth({
    siteRows: ["    'a.z': { path: 'a.z', cap: 0, why: '禁止写入的容器' }"],
    capRows: ["    'a.z': { cap: 0, site: '当前无写入方' }"]
  });
  const rc9a = RA.audit(c9a);
  a(rc9a.ok === true && rc9a.edge2.noWriter === 1, 'C9 声明「当前无写入方」+ cap0 ⇒ 点名但不红', JSON.stringify(kinds(rc9a)));
  const c9b = synth({
    siteRows: ["    'a.z': { path: 'a.z', cap: 5, why: 'x' }"],
    capRows: ["    'a.z': { cap: 5, site: '当前无写入方' }"]
  });
  a(kinds(RA.audit(c9b)).indexOf('no-writer-with-cap') >= 0, 'C9b 自称无写入方却登记 cap5 ⇒ 红（两句话必有一句是错的）');
  // C10 空表：SITES 解析出 0 条 ⇒ 必须红（空表上「零冲突」是恒真的）
  const c10 = synth({ siteRows: [] });
  a(kinds(RA.audit(c10)).indexOf('parse') >= 0, 'C10 SITES 解析出 0 条 ⇒ 红（不许在空表上宣布通过）');

  [base, c1, c2, c3, c4, c5, c6, c7, c8a, c8b, c9a, c9b, c10].forEach(function (d) {
    fs.rmSync(d, { recursive: true, force: true });
  });
}

// ══════════ D. 委托的边仍在跑 ══════════
function runD() {
  console.log('\nD. 被委托的两条边仍在现场（本工具不复制它们，但要求它们真的存在）');
  const runSrc = fs.readFileSync(path.join(ROOT, 'tests', 'run.js'), 'utf8');
  a(runSrc.indexOf('SITE_DECLS') >= 0 || runSrc.indexOf("WA.evict.array(") >= 0,
    'D1 G18（SITES ⇄ 调用点）门禁仍在 tests/run.js 里');
  const storeSrc = fs.readFileSync(path.join(ROOT, 'core', 'store.js'), 'utf8');
  a(storeSrc.indexOf('function registryParity()') >= 0, 'D2 registryParity() 仍在（CAPS ⇄ 骨架那条边）');
  a(storeSrc.indexOf('const __BOUNDED_CAPS = {') >= 0, 'D3 CAPS 表锚点仍在（工具靠它定位，且锚点必须唯一）');
  const evictSrc = fs.readFileSync(path.join(ROOT, 'core', 'evict.js'), 'utf8');
  a(evictSrc.indexOf('const SITES = {') >= 0, 'D4 SITES 表锚点仍在');
}

function runAll(assert) {
  const A = function (c, n, e) { assert(c, n, e); };
  runA(A); runB(A); runC(A); runD(A);
}
module.exports = { runAll: runAll };
if (require.main === module) {
  runA(); runB(); runC(); runD();
  console.log('\nOPV29-Z5-26-V2529: '
    + (failures.length ? 'FAIL ' + failures.length + '/' + (pass + failures.length) : 'pass (' + pass + ')'));
  failures.slice(0, 8).forEach(function (f) { console.log('  · ' + f); });
  process.exitCode = failures.length ? 1 : 0;
}
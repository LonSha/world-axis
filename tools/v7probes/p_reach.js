'use strict';
// 探针：可达性不动点
//   规则：驱动者必须自身可达。若引擎 A 调 B，而 A 自己没人驱动，
//         那 A 不是 B 的驱动者 —— 链条断在 A 身上。
//   起点：三条产品自证面（链 L1 / 路由 L2r / 面板 L2p）
//   扩张：已达可达集的引擎，用「非展示成员」调到的引擎 → 也算可达
//   为什么排除展示成员：buildBlock 的读口性质有实证（render/ 102 次纯渲染读），
//     且 engines/ 内 buildBlock 只有 2 处（0.04%）—— 排除它不会砍掉真实驱动。
const fs = require('fs');
const path = require('path');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);
function read(p) { try { return fs.readFileSync(path.join(BASE, p), 'utf8'); } catch (e) { return ''; } }

const PROD = [];
for (const d of ['ui', 'engines', 'core', 'render', 'actors', 'direction', 'compat', 'design']) {
  (function walk(dir) {
    let ents = [];
    try { ents = fs.readdirSync(path.join(BASE, dir), { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.js')) PROD.push(rel);
    }
  })(d);
}
PROD.push('index.js');
function kebab(ns) { return ns.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(); }

// 展示口：调用它们只产生「念数」行为，不改状态。buildBlock 有 render/ 实证。
const SHOW = { buildBlock: 1, view: 1, getSettings: 1, stat: 1, statView: 1, DEF: 1,
  summaryText: 1, invalidate: 1, why: 1, settings: 1 };

// 建「文件 → 它调了谁（非展示成员）」边表
const EDGE = {};      // srcNs -> { dstNs: [members] }
const FILE_NS = {};   // rel -> ns（引擎文件名 kebab 反推不可逆，改用 WA 树对不上就先按 kebab 猜）
const RE = /WA\.([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;
for (const rel of PROD) {
  const src = read(rel);
  if (!src) continue;
  // 源命名空间：engines/xxx.js → 由 kebab 反推不稳，故用「自身文件排除」逻辑，
  //   源一律取目录级伪 ns（engines/core/ui/...）之外的精确值：只有在 engines/ 时能拿到。
  let srcNs = null;
  const m1 = rel.match(/^engines\/(.+)\.js$/);
  if (m1) srcNs = null; // 反向映射不可靠，先不建「源 ns」，改写另一条路
}

// ── 改走另一条路：直接读 WA 树拿 ns→文件名，再反查文件内容 ─────────────
const vm = require('vm');
require(path.join(BASE, 'tests/mock.js'));
const g = global;
const LOAD = vm.runInNewContext('[' + (read('tests/run.js').match(/const LOAD = \[([\s\S]*?)\];/)[1]) + ']');
const ctx = vm.createContext(g);
for (const rel of LOAD) { try { vm.runInContext(read(rel), ctx, { filename: rel }); } catch (e) {} }
const WA = g.WorldAxis;
// 注：driverLedger 的扫描缓存自带签名（命名空间数/预取条数/装载条数），
//   扫描面一变下次 view() 自己重扫 —— 不需要（也已不再提供）invalidate()。
try { WA.store.init(); } catch (e) {}

const NSFILE = {};
for (const rel of PROD) {
  const m = rel.match(/^engines\/(.+)\.js$/);
  if (!m) continue;
  const stem = m[1].replace(/-([a-z0-9])/g, function (_, c) { return c.toUpperCase(); });
  NSFILE[stem] = rel;   // 粗略反推，仅用于「排除自身文件」
}

// 文件 → 调用的 (ns, mem) 集合
function callsOf(rel) {
  const src = read(rel);
  const out = [];
  if (!src) return out;
  let m;
  RE.lastIndex = 0;
  while ((m = RE.exec(src)) !== null) {
    const ns = m[1], mem = m[2];
    if (NSFILE[ns] === rel) continue;   // 自己调自己
    if (SHOW[mem]) continue;            // 展示口不算驱动
    out.push([ns, mem]);
  }
  return out;
}

// 起点：三条产品自证面
const pf = new Map();
WA.baseUrl = '';
for (const rel of PROD) { const t = read(rel); if (t && t.length >= 16) pf.set(rel, t); }
WA.__prefetch = pf;
WA.__loadOrder = PROD.slice();
const v = WA.driverLedger.view();
const base = new Set([].concat(v.layerNames.L1, v.layerNames.L2r, v.layerNames.L2p));
console.log('三条面起点 = ' + base.size);

// 不动点扩张
const reach = new Set(base);
let round = 0, addedLog = [];
while (round < 6) {
  round++;
  const add = [];
  for (const ns of Array.from(reach)) {
    const rel = NSFILE[ns];
    if (!rel) continue;                 // 非 engines/ 命名空间（core/ui 等）不参与扩张
    for (const e of callsOf(rel)) {
      if (!reach.has(e[0])) add.push([ns + ' → ' + e[0] + '.' + e[1]]);
      reach.add(e[0]);
    }
  }
  if (!add.length) break;
  console.log('第 ' + round + ' 轮 +' + add.length + '：' + add.slice(0, 12).join(', '));
  addedLog = addedLog.concat(add);
}
console.log('扩张总量 = ' + addedLog.length + '，可达集 = ' + reach.size);

// 只看带 buildBlock 的
const buildBlockers = Object.keys(WA).filter(function (k) {
  const o = WA[k];
  return o && typeof o === 'object' && typeof o.buildBlock === 'function';
});
const covered = buildBlockers.filter(function (k) { return reach.has(k); });
const notCovered = buildBlockers.filter(function (k) { return !reach.has(k); });
console.log('\n带 buildBlock 的引擎 ' + buildBlockers.length);
console.log('可达覆盖 ' + covered.length + '，仍不可达 ' + notCovered.length);
console.log('\n仍不可达（这就是真正的「没有驱动入口」）：');
console.log('  ' + notCovered.join(' '));
console.log('\n被引擎互调新增的（原本在 L3a/L3b 里）：');
const newOnes = covered.filter(function (k) { return !base.has(k); });
console.log('  共 ' + newOnes.length + '：' + newOnes.join(' '));
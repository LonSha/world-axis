#!/usr/bin/env node
// WorldAxis tools/new-engine.js (v2.524.0) — OPV29-25 新引擎脚手架（接线七处，少一路即红）
//
// ── 它治什么（缺口，开工前先看现场）──────────────────────────────
//   加一台引擎现在要改七个地方，七处分散在五个文件里，彼此没有交叉校验：
//     四路**接线**：index.js `LOAD_ORDER` / tests/run.js `LOAD` /
//                   engines/tool-diag.js `MODULE_EXPORTS` / engines/action-desk.js `ROUTES`
//     三处**登记**：core/store.js `defaultWorldState()`（骨架出生）/ `__BOUNDED_CAPS`（上界）/
//                   core/evict.js `SITES`（驱逐）
//   漏掉任何一处的表现都**不是报错**，而是「引擎在位、却谁也不认它」：
//     · 漏 LOAD_ORDER/LOAD ⇒ 文件在、从不装载（表现为零引用）；
//     · 漏 MODULE_EXPORTS  ⇒ 自检看不见的黑盒（诊断清单覆盖不到）；
//     · 漏 ROUTES          ⇒ 写口没有名字，只能被别的引擎直调；
//     · 漏骨架出生         ⇒ 首次写就长型（registryParity 记「未在骨架物化」）；
//     · 漏上界/驱逐        ⇒ 无界增长，跑一夜才看得出来。
//   本工具把这七处做成**一次检查、一次写入**：先全部验锚点，任一缺失就整体不写。
//
// ── 用法 ────────────────────────────────────────────────
//   node tools/new-engine.js --name=my-engine --ns=myEngine [--root=.] [--dry-run]
//   node tools/new-engine.js --check --name=my-engine --ns=myEngine [--root=.]
//     --dry-run  只打印将要做的事（不落盘）
//     --check    只验七处锚点是否齐（不要求引擎已存在；给「能不能开工」一个答案）
//
// ── 纪律 ────────────────────────────────────────────────
//   · 幂等靠**拒绝**：同名引擎已存在 / 该 ns 已接线 ⇒ `already-exists`，非零退出，不改盘。
//   · 原子性：七处锚点**先全查**，任一 `anchor-missing` 立即非零退出，一个字节都不写。
//   · 零依赖：只用 node 内置。骨架不含时间读数（不取 Date）。
//   · 生成的骨架是**纯函数 + stat**，不掷骰、不写存档 —— 装载即安全，不会替宿主做决定。

'use strict';

const fs = require('fs');
const path = require('path');

const NM_RE = /^[a-z][a-z0-9-]{1,30}$/;
const NS_RE = /^[a-z][a-zA-Z0-9]{1,30}$/;

function arg(name, def) {
  const hit = process.argv.slice(2).find(function (a) { return a.indexOf('--' + name + '=') === 0; });
  if (hit) return hit.slice(name.length + 3);
  return process.argv.slice(2).indexOf('--' + name) >= 0 ? true : def;
}

// ── 七个插入点：每个都只有「锚点 + 插入文本」两件事，没有第二套逻辑 ──────
//   锚点选的是**结构行**（`const X = {`），不是注释 —— 注释会被人改写口吻，结构行不会。
function sites(name, ns, ver) {
  const file = 'engines/' + name + '.js';
  return [
    {
      id: 'wire:index.js/LOAD_ORDER', file: 'index.js',
      anchor: '  const LOAD_ORDER = [\n',
      insert: "    '" + file + "',   // " + ver + ": OPV29-25 脚手架生成（接线位；依赖只在调用期读）\n",
      must: file
    },
    {
      id: 'wire:tests/run.js/LOAD', file: 'tests/run.js',
      anchor: 'const LOAD = [\n',
      insert: "  '" + file + "',   // " + ver + ": OPV29-25 脚手架生成（与 index.js LOAD_ORDER 同序）\n",
      must: file
    },
    {
      id: 'wire:engines/tool-diag.js/MODULE_EXPORTS', file: 'engines/tool-diag.js',
      anchor: '  const MODULE_EXPORTS = {\n',
      insert: "    '" + file + "': '" + ns + "',   // " + ver + ": OPV29-25 脚手架生成\n",
      must: ns
    },
    {
      id: 'wire:engines/action-desk.js/ROUTES', file: 'engines/action-desk.js',
      anchor: '  const ROUTES = {\n',
      insert: "    '" + ns + ".stat': function () {   // " + ver + ": OPV29-25 脚手架生成（只读路由，无副作用）\n"
        + "      if (WA." + ns + " && typeof WA." + ns + ".stat === 'function') return WA." + ns + ".stat();\n"
        + "      return { ok: false, refusal: '" + name + "-unavailable' };\n"
        + "    },\n",
      must: "'" + ns + ".stat'"
    },
    {
      id: 'reg:core/store.js/defaultWorldState', file: 'core/store.js',
      anchor: '      schemaVersion: SCHEMA_VERSION,\n',
      insert: '      ' + ns + ': { "items": {}, "_stats": { "calls": 0 } },   // ' + ver + ': OPV29-25 脚手架生成（骨架出生在这里）\n',
      must: '      ' + ns + ': {'
    },
    {
      id: 'reg:core/store.js/__BOUNDED_CAPS', file: 'core/store.js',
      anchor: '  const __BOUNDED_CAPS = {\n',
      insert: "    '" + ns + ".items': { cap: 200, kind: 'object', site: '" + name + ".js trim()' },   // " + ver + ": OPV29-25 脚手架生成\n",
      must: "'" + ns + ".items'"
    },
    {
      id: 'reg:core/evict.js/SITES', file: 'core/evict.js',
      anchor: '  const SITES = {\n',
      insert: "    '" + ns + ".items': { path: '" + ns + ".items', cap: 200, kind: 'object', why: '" + name + " 条目容器（OPV29-25 脚手架生成）' },\n",
      must: "'" + ns + ".items'"
    }
  ];
}

function engineSource(name, ns, ver) {
  const Q = JSON.stringify(ns);
  return [
    '/**',
    ' * WorldAxis engines/' + name + '.js (' + ver + ') — OPV29-25 脚手架生成',
    ' *',
    ' * ── 它治什么（缺口，开工前先看现场）──────────────────────────',
    ' *   <一句话写清哪里疼，不要写为了更好>。',
    ' *',
    ' * ── 机制（一句说完）─────────────────────────────────',
    ' *   纯函数：同样的入参永远同样的结果（不掷骰、不读时钟、不写存档）。',
    ' *   唯一的容器 ' + ns + '.items 有上界 200 与驱逐点，见 __BOUNDED_CAPS / evict.SITES。',
    ' *',
    ' * ── 边界（明确不做的事）──────────────────────────────',
    ' *   · 不写档：写入一律走 ActionDesk（ROUTES 里已有 ' + ns + '.stat 只读口）。',
    ' *   · 不掷骰、不取随机：需要随机时走 core/rand.js，不要 Math.random。',
    ' *',
    ' * ── 怎么验（负控制）───────────────────────────────',
    ' *   tests/opv29-z5-v2529.js 对「少一路接线」有双向判据：',
    ' *   删掉任何一处接线/登记，脚手架 --check 必须点名它。',
    ' */',
    '(function () {',
    "  const WA = (typeof window !== 'undefined' ? window.WA : (typeof global !== 'undefined' ? global.WA : null));",
    '  if (!WA) return;',
    '',
    '  const CAP = 200;',
    '',
    '  function keyOk(k) {',
    "    return typeof k === 'string' && k.length > 0 && k.length <= 64;",
    '  }',
    '',
    '  // 有界：条目超 CAP 时最旧优先挤出（与 __BOUNDED_CAPS / evict.SITES 同数）。',
    '  function trim(items) {',
    '    const ks = Object.keys(items || {});',
    '    if (ks.length <= CAP) return 0;',
    '    const sorted = ks.map(function (k) {',
    '      const it = items[k] || {};',
    "      return { k: k, at: (typeof it.at === 'number' ? it.at : 0) };",
    '    }).sort(function (a, b) { return a.at - b.at; });',
    '    const drop = sorted.slice(0, ks.length - CAP);',
    '    for (let i = 0; i < drop.length; i++) delete items[drop[i].k];',
    '    return drop.length;',
    '  }',
    '',
    '  // 纯函数：读一条（没有就回 null，不造数据）。',
    '  function get(state, key) {',
    '    const box = (state && state[' + Q + '] && state[' + Q + '].items) || {};',
    '    return Object.prototype.hasOwnProperty.call(box, key) ? box[key] : null;',
    '  }',
    '',
    '  // 写一条：只在内存态上写，落盘由 ActionDesk 决定。',
    '  function put(state, key, val) {',
    "    if (!state) return { ok: false, refusal: 'no-state' };",
    "    if (!keyOk(key)) return { ok: false, refusal: 'bad-key' };",
    '    if (!state[' + Q + ']) state[' + Q + "] = { items: {}, _stats: { calls: 0 } };",
    '    const box = state[' + Q + '];',
    "    box.items[key] = Object.assign({}, val, { at: (typeof val.at === 'number' ? val.at : 0) });",
    '    box._stats.calls = (box._stats.calls || 0) + 1;',
    '    const dropped = trim(box.items);',
    '    return { ok: true, dropped: dropped };',
    '  }',
    '',
    '  function stat() {',
    "    return { ok: true, ns: " + Q + ', cap: CAP };',
    '  }',
    '',
    '  WA.' + ns + ' = {',
    '    CAP: CAP, trim: trim, get: get, put: put, stat: stat',
    '  };',
    "  if (typeof WA.registerModule === 'function') WA.registerModule('engines/" + name + ".js', { kind: 'engine', ver: '" + ver + "' });",
    "  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/" + name + " 已加载（" + ver + "）');",
    '})();',
    ''
  ].join('\n');
}

function main() {
  const name = arg('name', null);
  const ns = arg('ns', null);
  const root = path.resolve(String(arg('root', '.')));
  const dry = !!arg('dry-run', false);
  const checkOnly = !!arg('check', false);
  const ver = arg('ver', '2.524.0');

  if (!name || name === true || !ns || ns === true) {
    console.error('用法: node tools/new-engine.js --name=<kebab> --ns=<camel> [--root=.] [--dry-run|--check]');
    return 2;
  }
  if (!NM_RE.test(String(name))) { console.error('bad-name: ' + name + '（要求 ^[a-z][a-z0-9-]{1,30}$）'); return 3; }
  if (!NS_RE.test(String(ns))) { console.error('bad-ns: ' + ns + '（要求 ^[a-z][a-zA-Z0-9]{1,30}$）'); return 3; }

  const plan = sites(String(name), String(ns), String(ver));
  const problems = [];

  // ① 目标文件在不在（一个都不许缺）
  const texts = {};
  for (let i = 0; i < plan.length; i++) {
    const s = plan[i];
    const p = path.join(root, s.file);
    if (!fs.existsSync(p)) { problems.push('missing-file: ' + s.file + ' (' + s.id + ')'); continue; }
    texts[s.file] = fs.readFileSync(p, 'utf8');
  }

  // ② 锚点是否唯一命中（重复锚点会让插入落到错的地方 —— 宁可停，不猜）
  for (let i = 0; i < plan.length; i++) {
    const s = plan[i], t = texts[s.file];
    if (typeof t !== 'string') continue;
    const n = t.split(s.anchor).length - 1;
    if (n !== 1) problems.push('anchor-' + (n === 0 ? 'missing' : 'ambiguous') + ': ' + s.id + '（命中 ' + n + ' 次）');
  }

  // ③ 幂等：引擎文件与各处接线已存在即拒绝（不改盘）
  const engPath = path.join(root, 'engines', String(name) + '.js');
  if (fs.existsSync(engPath)) problems.push('already-exists: engines/' + name + '.js');
  for (let i = 0; i < plan.length; i++) {
    const s = plan[i], t = texts[s.file];
    if (typeof t === 'string' && t.indexOf(s.must) >= 0) problems.push('already-exists: ' + s.id);
  }

  if (problems.length) {
    for (let i = 0; i < problems.length; i++) console.error('✗ ' + problems[i]);
    console.error('NEW-ENGINE: ABORT（七处一处不齐就不写盘；实 ' + problems.length + ' 项问题）');
    return 1;
  }

  if (checkOnly) {
    for (let i = 0; i < plan.length; i++) console.log('✓ ' + plan[i].id);
    console.log('NEW-ENGINE: OK（' + plan.length + ' 处锚点齐、唯一命中、无同名冲突）');
    return 0;
  }

  if (dry) {
    for (let i = 0; i < plan.length; i++) console.log('WOULD ' + plan[i].id);
    console.log('WOULD create engines/' + name + '.js（' + engineSource(String(name), String(ns), String(ver)).split('\n').length + ' 行）');
    console.log('NEW-ENGINE: DRY-RUN（未写盘；' + plan.length + ' 处接线 + 1 个骨架文件）');
    return 0;
  }

  // ④ 落盘：先逐处插入（锚点已验），最后建骨架文件
  for (let i = 0; i < plan.length; i++) {
    const s = plan[i];
    texts[s.file] = texts[s.file].replace(s.anchor, s.anchor + s.insert);
  }
  const wrote = [];
  for (let i = 0; i < plan.length; i++) {
    const s = plan[i];
    const p = path.join(root, s.file);
    try {
      fs.writeFileSync(p, texts[s.file], 'utf8');
      wrote.push(s.file);
    } catch (e) {
      console.error('✗ write-failed: ' + s.file + ' :: ' + e.message);
      return 4;
    }
  }
  fs.writeFileSync(engPath, engineSource(String(name), String(ns), String(ver)), 'utf8');

  for (let i = 0; i < plan.length; i++) console.log('WIRED ' + plan[i].id);
  console.log('CREATED engines/' + name + '.js');
  console.log('NEW-ENGINE: DONE（' + plan.length + ' 处接线 + 3 处登记 + 1 个骨架，写文件 ' + wrote.length + ' 个）');
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { sites: sites, engineSource: engineSource };
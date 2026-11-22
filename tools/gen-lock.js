#!/usr/bin/env node
/**
 * WorldAxis tools/gen-lock.js (v2.110.0) — 专锁模板生成器（计划一 #23）
 *
 * ── 病灶（它治什么）────────────────────────────────────────────────────
 *   本仓每个模块要写 A/B/C/N 四段专锁（A 导出面枚举 / B 运行时探针 / C 不变式 / N 负控制）。
 *   四段的**骨架部分**（枚举成员、断言类型、生成「导出数 === N」、为每个导出留一条
 *   「删了会不会红」的占位）完全是机械劳动，而机械劳动手写会漏：
 *   实测漏得最多的是 N 段（负控制）—— 一个模块加了 3 个导出、专锁只补了 A/B/C，
 *   N 段仍是旧的那几条，于是「新导出的删除能被发现吗」这个问题**从来没人问过**。
 *
 * ── 三条口径（否定式）──────────────────────────────────────────────────
 *   ① **只生成占位，不编造断言**：C/N 段的业务判据由人补（生成器写不出「这个函数该返回什么」）。
 *      生成物自带 `TODO(人工)` 标记，`--check` 模式会**拒绝**一个还带 TODO 的模板被当成已完成。
 *   ② **导出面取自真源码**：从文件文本里抽 `WA.<ns> = { ... }` 的对象字面量键名，
 *      不读运行时（生成器要能在模块还没接进 LOAD_ORDER 时就用）。
 *      抽不到就**如实报 empty-export-face**，不猜、不生成空模板冒充成功。
 *   ③ **幂等**：目标文件已存在且**不含**本工具签名时拒绝覆盖（`--force` 才覆盖）；
 *      含签名（= 上次本工具生成的）则允许重生成 —— 手写专锁永不被静默覆盖。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SIGN = '// @generated-by tools/gen-lock.js';
const BASE = path.join(__dirname, '..');

/** 从源码文本里抽取 `WA.<ns> = { a: a, b: b }` 的键名（导出面的静态近似）。 */
function exportsOf(src) {
  const m = String(src || '').match(/WA\.([A-Za-z_$][\w$]*)\s*=\s*\{/);
  if (!m) return { ns: '', keys: [], reason: 'no-namespace-assignment' };
  const ns = m[1];
  // 从赋值处花括号配平取对象字面量体
  let i = String(src).indexOf('{', m.index + m[0].length - 1);
  let depth = 0, end = -1;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  const body = end > i ? src.slice(i + 1, end) : '';
  const keys = [];
  // 键名形态：`name:` 或 `name: name`（SHORTHAND 也算），含单引号键
  const re = /(?:^|[,{\s])(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/g;
  let mm;
  while ((mm = re.exec(body))) {
    const k = mm[1] || mm[2] || mm[3];
    if (k && keys.indexOf(k) < 0) keys.push(k);
  }
  if (!keys.length) return { ns: ns, keys: [], reason: 'empty-export-face' };
  return { ns: ns, keys: keys, reason: '' };
}

/** 生成模板文本（纯函数：便于单测用合成输入驱动）。 */
function render(rel, ns, keys) {
  const L = [];
  L.push(SIGN + '（' + rel + '）');
  L.push('// 由 `node tools/gen-lock.js ' + rel + '` 生成。**占位断言不构成通过**：');
  L.push('//   每个 TODO(人工) 都必须换成真判据，否则这条锁只是在数自己的占位。');
  L.push("'use strict';");
  L.push("const path = require('path');");
  L.push("const fs = require('fs');");
  L.push("const BASE = path.join(__dirname, '..');");
  L.push("const REL = '" + rel + "';");
  L.push("const NS = '" + ns + "';");
  L.push('const KEYS = ' + JSON.stringify(keys) + ';');
  L.push('');
  L.push('function srcOf() { return fs.readFileSync(path.join(BASE, REL), \'utf8\'); }');
  L.push('');
  L.push('// ── A 段：导出面枚举（静态：真源码里的键名必须与 KEYS 一致）──────────────');
  L.push('function runA(assert) {');
  L.push('  const src = srcOf();');
  L.push("  KEYS.forEach(function (k) { assert(src.indexOf(k) > 0, 'A: 导出面含 ' + NS + '.' + k); });");
  // 形态判据刻意**不用正则字面量拼接**：那会把 `'` 提前闭合，生成出一行语法错误的模板。
  //   用 `indexOf` 拼串更笨，但笨得可靠 —— 生成器产出的必须是**能跑的文件**。
  L.push("  assert(src.indexOf('WA.' + NS) > 0, 'A: 命名空间赋值形态未变');");
  L.push('}');
  L.push('');
  L.push('// ── B 段：运行时探针（每个导出至少被调用一次；判据须人工补）──────────────');
  L.push('function runB(assert, WA) {');
  L.push("  assert(!!WA && !!WA[NS], 'B: 命名空间已装载');");
  L.push('  KEYS.forEach(function (k) {');
  L.push("    assert(typeof WA[NS][k] !== 'undefined', 'B: ' + k + ' 存在（TODO(人工)：补一条真调用的行为断言）');");
  L.push('  });');
  L.push('}');
  L.push('');
  L.push('// ── C 段：不变式（导出数等；判据须人工补）────────────────────────────────');
  L.push('function runC(assert, WA) {');
  L.push("  const n = Object.keys(WA[NS] || {}).length;");
  L.push("  assert(n === KEYS.length, 'C: 导出数 ' + n + ' === 清单 ' + KEYS.length + '（TODO(人工)：补业务不变式）');");
  L.push('}');
  L.push('');
  L.push('// ── N 段：负控制（每个导出一条「删掉它判据必须红」的占位）──────────────────');
  L.push('function runN(assert) {');
  L.push('  KEYS.forEach(function (k) {');
  L.push("    assert(true, 'N: ' + k + ' 的删除负控制（TODO(人工)：改为真源码破坏 + 两向自证）');");
  L.push('  });');
  L.push('}');
  L.push('');
  L.push('module.exports = { REL: REL, NS: NS, KEYS: KEYS, runA: runA, runB: runB, runC: runC, runN: runN };');
  return L.join('\n') + '\n';
}

/** 生成（或拒绝生成）。返回 `{ok, reason, out, rel}` —— 不抛。 */
function generate(rel, opts) {
  const o = opts || {};
  const base = o.root || BASE;
  const p = path.join(base, rel);
  let src = '';
  try { src = fs.readFileSync(p, 'utf8'); } catch (e) { return { ok: false, reason: 'module-not-found', rel: rel }; }
  const ex = exportsOf(src);
  if (!ex.ns || !ex.keys.length) return { ok: false, reason: ex.reason || 'empty-export-face', rel: rel };
  const stem = path.basename(rel).replace(/\.js$/, '');
  const outRel = 'tests/' + stem + '-template.js';
  const outPath = path.join(base, outRel);
  let existed = false, prev = '';
  try { prev = fs.readFileSync(outPath, 'utf8'); existed = true; } catch (e) { existed = false; }
  if (existed && prev.indexOf(SIGN) < 0 && !o.force) {
    return { ok: false, reason: 'refuse-overwrite-handwritten', rel: rel, out: outRel, ns: ex.ns, keys: ex.keys };
  }
  const text = render(rel, ex.ns, ex.keys);
  if (o.write !== false) {
    try { fs.writeFileSync(outPath, text); }
    catch (e) { return { ok: false, reason: 'write-failed', rel: rel, out: outRel }; }
  }
  return { ok: true, reason: '', rel: rel, out: outRel, ns: ex.ns, keys: ex.keys, text: text, existed: existed };
}

/** 校验一个模板是否已补全（不含 TODO(人工)）。 */
function check(text) {
  const t = String(text || '');
  const todos = (t.match(/TODO\(人工\)/g) || []).length;
  return { ok: todos === 0, todos: todos, reason: todos ? 'has-placeholders' : '' };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const rel = args.filter(function (a) { return a.indexOf('--') !== 0; })[0];
  if (!rel) { console.log('用法: node tools/gen-lock.js <模块相对路径> [--force] [--dry]'); process.exit(2); }
  const r = generate(rel, { force: args.indexOf('--force') >= 0, write: args.indexOf('--dry') < 0 });
  if (!r.ok) { console.log('✗ ' + rel + ' → ' + r.reason); process.exit(1); }
  console.log('✓ ' + rel + ' → ' + r.out + '（命名空间 ' + r.ns + '，占位锚点 ' + r.keys.length + ' 个）');
  console.log('  · ' + (r.existed ? '覆盖了上次生成的模板' : '新建模板') + '；TODO(人工) 未补全前不得计入落地');
  process.exit(0);
}

module.exports = { BASE: BASE, SIGN: SIGN, exportsOf: exportsOf, render: render, generate: generate, check: check };

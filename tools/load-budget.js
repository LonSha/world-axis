#!/usr/bin/env node
/**
 * WorldAxis tools/load-budget.js (v2.524.0) — OPV29-04 装载边预算（惰性候选）
 *
 * ── 它治什么（本版现场）──────────────────────────────────
 *   `index.js` 的 `LOAD_ORDER` 是首帧前要逐条 fetch + eval 的**装载边**。
 *   现场条数就是首帧要付的代价，而这个数字**从来没有被数过**：
 *   想谈「惰性装载」时，没人能说出「现在多少条、能拿掉哪几条」。
 *
 * ── 它给的是读数，不是改装载次序 ──────────────────────────
 *   本工具**不改** `LOAD_ORDER`、不动装载流程。它只做三件事：
 *     ① 数：`LOAD_ORDER` 现场多少条、按目录分布、重复项、盘上缺项；
 *     ② 找候选：哪个模块的文件名命名空间**在其它装载文件里零静态引用**
 *        （这类模块有可能可以延后到首次使用时再装载）；
 *     ③ 给证据强度：候选标 `evidence:'static-refs'`，并明写「零静态引用不等于零运行期依赖」
 *        —— 动态拼出来的 `WA[ns]`、回调里取用的模块，静态面看不见。故候选**不是批准**，
 *        是把「该验哪几个」从 500 条缩到几张纸。
 *
 * ── 为什么这一半必须停在读数 ────────────────────────────────
 *   真把某条边改成惰性，就要改 `index.js` 的装载次序与失败降级，而那块面只有全套回归能证。
 *   在回归被冻结的窗口里动它 = 拿没验证的行为换一条好看的读数。故本工具把行动作门槛留给回归。
 *
 * ── 用法 ──────────────────────────────────────────────────
 *   node tools/load-budget.js                # 读数 + 候选
 *   node tools/load-budget.js --json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

/** 从 index.js 抽出 LOAD_ORDER 的字面量列表（只认单/双引号字符串项，注释不计）。 */
function loadOrder(text) {
  const src = String(text == null ? '' : text);
  const start = src.indexOf('const LOAD_ORDER = [');
  if (start < 0) return null;
  const end = src.indexOf('];', start);
  if (end < 0) return null;
  const body = src.slice(start + 'const LOAD_ORDER = ['.length, end);
  const out = [];
  const re = /'([^']+)'|"([^"]+)"/g;
  let m;
  while ((m = re.exec(body))) {
    const v = m[1] || m[2];
    // 只收**看起来是文件**的项：区间里还夹着标记值（如 `needs-real-device` 这类非路径字面量），
    //   把它们当装载边会让读数虚高一条、还会在 `missing` 里凭空点名一个根本不是文件的东西。
    if (/\.js$/.test(v)) out.push(v);
  }
  return out;
}

function byDir(rels) {
  const o = {};
  rels.forEach(function (r) { const d = r.indexOf('/') > 0 ? r.split('/')[0] : '(root)'; o[d] = (o[d] || 0) + 1; });
  return o;
}

/** 现场读数：条数 / 分布 / 重复 / 缺项。**不判断好坏**。 */
function edges(opts) {
  const o = opts || {};
  const root = o.root || BASE;
  const list = o.list || loadOrder(o.text !== undefined ? o.text : fs.readFileSync(path.join(root, 'index.js'), 'utf8'));
  if (!list) return { ok: false, why: 'no-load-order' };
  const seen = {}, dup = [];
  list.forEach(function (r) { if (seen[r]) dup.push(r); else seen[r] = 1; });
  const missing = list.filter(function (r) { try { return !fs.statSync(path.join(root, r)).isFile(); } catch (e) { return true; } });
  const firstRender = list.findIndex(function (r) { return /^render\//.test(r); });
  return {
    ok: true, total: list.length, unique: Object.keys(seen).length,
    duplicates: dup, missing: missing,
    byDir: byDir(list),
    preRender: firstRender < 0 ? null : firstRender,
    order: list
  };
}

/** 命名空间静态引用计数：每个装载文件的文件名 → 驼峰命名空间，数其它文件/UI 里提到它的次数。 */
function refs(opts) {
  const o = opts || {};
  const root = o.root || BASE;
  const e = o.edges || edges({ root: root });
  if (!e.ok) return { ok: false, why: e.why };
  const order = e.order;
  const texts = [];
  order.forEach(function (rel) {
    try { texts.push({ rel: rel, text: fs.readFileSync(path.join(root, rel), 'utf8') }); } catch (err) { /* 缺项的已在 missing 里点名 */ }
  });
  let uiNames = [];
  try { uiNames = fs.readdirSync(path.join(root, 'ui')); } catch (err) { uiNames = []; }
  const uiTexts = uiNames.filter(function (f) { return /\.js$/.test(f); }).map(function (f) {
    try { return fs.readFileSync(path.join(root, 'ui', f), 'utf8'); } catch (err) { return ''; }
  }).join('\n');
  const out = {};
  order.forEach(function (rel) {
    const stem = rel.split('/').pop().replace(/\.js$/, '');
    const ns = stem.replace(/-([a-z0-9])/g, function (m, c) { return c.toUpperCase(); });
    const needle = 'WA.' + ns;
    let n = 0;
    texts.forEach(function (t) { if (t.rel !== rel && t.text.indexOf(needle) >= 0) n += 1; });
    out[rel] = { ns: ns, refs: n, inUi: uiTexts.indexOf(needle) >= 0 };
  });
  return { ok: true, ns: out };
}

/** 惰性候选：零静态引用 + 不在 ui 里 ⇒ 「有可能可延后」。**不是批准**。 */
function deferCandidates(opts) {
  const o = opts || {};
  const r = o.refs || refs({ root: o.root });
  if (!r.ok) return { ok: false, why: r.why, candidates: [] };
  const candidates = Object.keys(r.ns).filter(function (rel) { return r.ns[rel].refs === 0 && !r.ns[rel].inUi; });
  return {
    ok: true,
    candidates: candidates,
    count: candidates.length,
    evaluable: Object.keys(r.ns).length,
    evidence: 'static-refs',
    // 必须和候选一起说：静态面看不见动态取用，故候选只能用做「先验哪几个」的排序。
    caveat: '零静态引用 ≠ 零运行期依赖（WA[ns] 动态取用/回调里取用看不见）；候选不是批准'
  };
}

/** 预算判定：边数上限。超了就点名，不静默。 */
function check(opts) {
  const o = opts || {};
  const e = o.edges || edges({ root: o.root });
  if (!e.ok) return { ok: false, why: e.why };
  const budget = Number(o.budget) || 520;
  return {
    ok: true, total: e.total, budget: budget, over: e.total > budget,
    headroom: budget - e.total, duplicates: e.duplicates.length, missing: e.missing.length,
    reading: e.total + ' 条装载边 / 预算 ' + budget
  };
}

function main() {
  const asJson = process.argv.indexOf('--json') >= 0;
  const e = edges({});
  if (!e.ok) { console.error('拒收：' + e.why); process.exitCode = 3; return; }
  const d = deferCandidates({});
  const c = check({ edges: e });
  if (asJson) { console.log(JSON.stringify({ edges: { total: e.total, unique: e.unique, byDir: e.byDir, duplicates: e.duplicates, missing: e.missing, preRender: e.preRender }, candidates: d, check: c }, null, 2)); return; }
  console.log('■ 装载边：' + e.total + ' 条（去重 ' + e.unique + '，重复 ' + e.duplicates.length + '，缺项 ' + e.missing.length + '）');
  console.log('■ 分布：' + Object.keys(e.byDir).sort().map(function (k) { return k + '=' + e.byDir[k]; }).join(' '));
  console.log('■ 首帧前（render/ 之前）的边序：' + (e.preRender === null ? '未有 render/ 项' : e.preRender + ' / ' + e.total));
  if (e.missing.length) console.log('■ 盘上缺项：' + JSON.stringify(e.missing.slice(0, 5)));
  console.log('■ 惰性候选（零静态引用）：' + d.count + ' / ' + d.evaluable + ' —— ' + d.caveat);
  if (d.count) console.log('  ' + d.candidates.slice(0, 10).join(', ') + (d.count > 10 ? ' …' : ''));
  console.log('■ 预算：' + c.reading + (c.over ? '  ⚠ 超' : '  ✓ 未超'));
}

module.exports = { loadOrder: loadOrder, edges: edges, refs: refs, deferCandidates: deferCandidates, check: check };
if (require.main === module) main();

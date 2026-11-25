#!/usr/bin/env node
'use strict';
/**
 * tests/plan-audit-quota-v2578.js
 * 「复验安排 / 依据名额」自证与读数专锁（v2.578.0）
 *
 * 治的缺口：engines/plan-audit.js audit() 的两处静默截断：
 *   ① items.slice(0, cfg.maxItems)：按传入顺序拿前几条，既不稳定，也不说明还有多少安排；
 *   ② hitFacts.slice(0, cfg.evidenceCap)：按证据登记顺序拿前几条，依据面看不出还有多少。
 *   两处都不应改变 stands / needs-adjust / unreadable 判定。
 *
 * 探针（/tmp/probe578.js，改造前 → 改造后）：
 *   · 八条安排、maxItems=3：旧版 i0/i1/i2 且无 hidden；新版按 id 定序仍念 3 条、hidden=5；
 *   · 八条事实、evidenceCap=2：依据仍全用于判定，但返回 2 条 + evidenceMeta 8/2/6/recent-first；
 *   · 倒序输入：旧版结论变，新版不变；maxItems/evidenceCap='x'：旧版 empty-input，新版回落默认；
 *   · 名额够：mode=all-fit；没跑过 block=null，空输入 mode=empty。
 *
 * 判据结构：A 静态 / B 行为 / C 读数 / N 六条负控。
 * 单独跑：node tests/plan-audit-quota-v2578.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const REL = 'engines/plan-audit.js';
let pass = 0, fail = 0;
const fails = [];
function ok(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; fails.push(name + ' :: ' + e.message); console.log('  ✗ ' + name + ' :: ' + e.message); }
}
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function stripComment(line) {
  const t = line.trim();
  if (t.indexOf('/*') === 0 || t.indexOf('*') === 0) return '';
  const i = line.indexOf('//');
  return i < 0 ? line : line.slice(0, i);
}
function codeOnly(text) { return text.split('\n').map(stripComment).join('\n'); }
const SRC = rd(REL);
const CODE = codeOnly(SRC);
const NOW = 1700000000000;
function store(n) {
  const s = { people: { 阿明: { name: '阿明' } }, chronicle: [], worldFacts: [], evolution: { events: [] } };
  for (let i = 0; i < n; i++) s.chronicle.push({ title: '事实' + i, summary: '阿明 事实' + i, at: NOW - i });
  return s;
}
function items(n, rev) {
  const a = [];
  for (let i = 0; i < n; i++) a.push({ id: 'i' + i, title: '阿明 事实' + i, cast: ['阿明'] });
  return rev ? a.reverse() : a;
}
function load(code, st, over) {
  let cfg = Object.assign({ enabled: true, maxItems: 3, evidenceCap: 2 }, over || {});
  const win = {};
  const ctx = { window: win, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array,
    String: String, Number: Number, isFinite: isFinite };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  const WA = win.WorldAxis;
  WA.clock = { now: function () { return NOW; }, wallNow: function () { return NOW; } };
  WA.inputGuard = { text: function (v, m) { return String(v == null ? '' : v).slice(0, m || 240); } };
  WA.store = { get: function () { return st; }, transact: function () { throw new Error('must-not-write'); } };
  WA.settingsBus = { read: function () { return cfg; }, normalize: function (r, v) { return v; },
    saveOrThrow: function (r, v) { cfg = v; return { ok: true }; } };
  return WA;
}
function audit(code, n, over, rev, st) {
  return load(code, st || store(n), over).planAudit.audit(items(n, rev));
}
function ids(r) { return (r.results || []).map(function (x) { return x.id; }).join(','); }
function statAfter(code, st, over, input) {
  const A = load(code, st, over);
  if (input) A.planAudit.audit(input);
  return { A: A, b: A.planAudit.stat().block };
}

console.log('A 静态');
ok('A1 两个名额常量与 quotaOf 在位', function () {
  assert(CODE.indexOf('const ITEM_QUOTA_MAX = 64;') > 0, 'ITEM_QUOTA_MAX 不在');
  assert(CODE.indexOf('const EVIDENCE_QUOTA_MAX = 12;') > 0, 'EVIDENCE_QUOTA_MAX 不在');
  assert(CODE.indexOf('function quotaOf(cfg, key, max, fallback)') > 0, 'quotaOf 不在');
});
ok('A2 两个选取函数在位且旧两刀消失', function () {
  assert(CODE.indexOf('function pickItems(list, quota)') > 0, 'pickItems 不在');
  assert(CODE.indexOf('function pickEvidence(list, quota)') > 0, 'pickEvidence 不在');
  assert(CODE.indexOf('items.slice(0, cfg.maxItems)') < 0, '旧安排截断还在');
  assert(CODE.indexOf('hitFacts.slice(0, cfg.evidenceCap)') < 0, '旧依据截断还在');
});
ok('A3 顶层与逐条自证 / block 五栗在位', function () {
  assert(/candidates: selected\.candidates, picked: results\.length/.test(CODE), '顶层读数不在');
  assert(CODE.indexOf('evidenceMeta: { candidates: ep.candidates') > 0, '逐条 evidenceMeta 不在');
  assert(CODE.indexOf('block: null') > 0 && CODE.indexOf("mode: selected.hidden ? 'ranked-first' : 'all-fit'") > 0, 'block 不完整');
});
ok('A4 stat() 对 block 深拷', function () {
  assert(CODE.indexOf('out.block = stat.block ? JSON.parse(JSON.stringify(stat.block)) : null;') > 0,
    'stat 没深拷 block');
});
ok('A5 文档边界第 9 条在位', function () {
  assert(/9 复验名额只截断不参与判定/.test(SRC), '边界 9 不在');
  assert(/顶层与逐条都要自证/.test(SRC), '边界 9 自证条款不在');
});
console.log('B 行为');
ok('B1 八条安排、名额 3 ⇒ 定序取 3 + hidden 5', function () {
  const r = audit(CODE, 8);
  assert(r.ok && r.total === 3 && r.candidates === 8 && r.picked === 3 && r.hidden === 5,
    JSON.stringify({ total: r.total, c: r.candidates, p: r.picked, h: r.hidden }));
  assert(ids(r) === 'i0,i1,i2', '安排序不对：' + ids(r));
});
ok('B2 倒序输入结论不变（id 字典序可复算）', function () {
  assert(ids(audit(CODE, 8)) === ids(audit(CODE, 8, {}, true)), '倒序后安排结论变了');
});
ok('B3 依据按 at 倒序，且逐条自证 8/2/6', function () {
  const r = audit(CODE, 8);
  const m = r.results[0].evidenceMeta;
  assert(r.results[0].evidence.length === 2, '依据应念 2 条');
  assert(m.candidates === 8 && m.picked === 2 && m.quota === 2 && m.hidden === 6 && m.mode === 'recent-first', JSON.stringify(m));
  // 排序本身要可判：事实 0 的 at 最新（NOW-0），必须排在依据第一条。
  assert(r.results[0].evidence[0].text.indexOf('事实0') >= 0,
    '依据没有按最近排序（首条 ' + (r.results[0].evidence[0] || {}).text + '）');
  assert(r.results[0].state === 'stands', '名额不应改变判定：' + r.results[0].state);
});
ok('B4 坏配置回落默认，不把整面误报成 empty-input', function () {
  const r = audit(CODE, 8, { maxItems: 'x', evidenceCap: 'x' });
  assert(r.ok && r.total === 8 && r.hidden === 0, JSON.stringify(r));
  assert(r.results[0].evidenceMeta.quota === 6, JSON.stringify(r.results[0].evidenceMeta));
});
ok('B5 名额够 ⇒ 无自证 hidden、mode=all-fit', function () {
  const r = audit(CODE, 2, { maxItems: 3, evidenceCap: 5 });
  assert(r.hidden === 0 && r.results[0].evidenceMeta.hidden === 0, JSON.stringify(r));
  assert(r.results[0].evidenceMeta.mode === 'all-fit', JSON.stringify(r.results[0].evidenceMeta));
});
ok('B6 已写安排即使排在名额后也拒收，不能被截断藏掉', function () {
  const a = items(8); a[7].landed = true;
  const A = load(CODE, store(8), { maxItems: 3 });
  const r = A.planAudit.audit(a);
  assert(r.ok === false && r.reason === 'already-written', JSON.stringify(r));
});
console.log('C 读数');
ok('C1 五栗正确（8 / 3 / 3 / 5 / ranked-first）', function () {
  const q = statAfter(CODE, store(8), { maxItems: 3, evidenceCap: 2 }, items(8));
  const b = q.b;
  assert(b && b.candidates === 8 && b.picked === 3 && b.quota === 3 && b.hidden === 5 && b.mode === 'ranked-first', JSON.stringify(b));
});
ok('C2 没跑过 null，空输入 empty', function () {
  const q = statAfter(CODE, store(0), { maxItems: 3 }, []);
  assert(q.A.planAudit.stat().block.mode === 'empty', JSON.stringify(q.b));
  const fresh = load(CODE, store(0));
  assert(fresh.planAudit.stat().block === null, '没跑过应为 null');
});
ok('C3 block 是深拷贝', function () {
  const A = load(CODE, store(8)); A.planAudit.audit(items(8));
  const b = A.planAudit.stat().block; b.picked = 999;
  assert(A.planAudit.stat().block.picked === 3, '外部修改污染 block');
});
ok('C4 名额恒等式 picked + hidden = candidates', function () {
  const b = statAfter(CODE, store(8), {}, items(8)).b;
  assert(b.picked + b.hidden === b.candidates, JSON.stringify(b));
});
ok('C5 判定三态不被依据名额改变', function () {
  const a = audit(CODE, 8, { evidenceCap: 1 });
  const b = audit(CODE, 8, { evidenceCap: 12 });
  assert(a.results.map(function (x) { return x.state; }).join(',') === b.results.map(function (x) { return x.state; }).join(','), '证据名额改变了三态');
});
console.log('N 负控（真源码破坏 ⇒ 同款判据必须红）');
function problems(code) {
  const bad = [];
  const r = audit(code, 8);
  if (!r.ok || r.candidates !== 8 || r.picked !== 3 || r.hidden !== 5) bad.push('B1');
  if (ids(r) !== 'i0,i1,i2') bad.push('B2');
  const m = r.results[0] && r.results[0].evidenceMeta;
  if (!m || m.candidates !== 8 || m.picked !== 2 || m.hidden !== 6) bad.push('B3');
  // 排序也是 B3 的一部分：只判名额、不判顺序，打反时间的负控就会假绿（本轮实证）。
  if (!r.results[0] || !r.results[0].evidence[0]
      || r.results[0].evidence[0].text.indexOf('事实0') < 0) bad.push('B3');
  if (ids(audit(code, 8)) !== ids(audit(code, 8, {}, true))) bad.push('B2');
  const A = load(code, store(8), { maxItems: 3 });
  if (A.planAudit.audit(items(8)).hidden !== 5) bad.push('C1');
  // 坏配置：守卫没了会让 maxItems='x' 变成 NaN ⇒ slice(0,NaN) ⇒ 整面误报 empty-input
  const badCfg = audit(code, 8, { maxItems: 'x', evidenceCap: 'x' });
  if (!badCfg.ok || badCfg.total !== 8) bad.push('B4');
  return bad;
}
ok('N0 真源码零问题（负控前提）', function () { assert(problems(CODE).length === 0, problems(CODE).join(',')); });
ok('N1 直接 slice 安排 ⇒ B2 红（倒序不再稳定）', function () {
  const broken = CODE.replace('const arr = (list || []).filter(function (x) { return !!x; }).slice().sort(itemOrder);',
    'const arr = (list || []).filter(function (x) { return !!x; });');
  assert(broken !== CODE, '破坏未命中'); assert(problems(broken).indexOf('B2') >= 0, 'B2 没红');
});
ok('N2 证据时间比较反向 ⇒ B3 红（判的是排序那一行）', function () {
  const broken = CODE.replace('if (at !== bt) return bt - at;', 'if (at !== bt) return at - bt;');
  assert(broken !== CODE, '破坏未命中');
  assert(problems(broken).indexOf('B3') >= 0, 'B3 没红');
});
ok('N3 去掉名额守卫 ⇒ B4 红（坏配置不再回落默认）', function () {
  const broken = CODE.replace('if (!isFinite(n) || n < 1) return Math.min(max, fallback);', '');
  assert(broken !== CODE, '破坏未命中');
  assert(problems(broken).indexOf('B4') >= 0, 'B4 没红');
});
ok('N4 去掉依据自证元数据 ⇒ B3 红', function () {
  const broken = CODE.replace("evidenceMeta: { candidates: ep.candidates, picked: ep.picked.length, quota: evidenceQuota,\n          hidden: ep.hidden, mode: ep.hidden ? 'recent-first' : (ep.candidates ? 'all-fit' : 'empty') }", '');
  assert(broken !== CODE); assert(problems(broken).indexOf('B3') >= 0, 'B3 没红');
});
ok('N5 忽略 landed（回到先截断后拒收）⇒ B6 红', function () {
  const broken = CODE.replace('const writtenAll = rawList.filter(function (it) { return it && it.landed === true; });',
    'const writtenAll = [];');
  assert(broken !== CODE, '破坏未命中');
  const a = items(8); a[7].landed = true;
  const r = load(broken, store(8), { maxItems: 3 }).planAudit.audit(a);
  assert(r.ok !== false || r.reason !== 'already-written', 'B6 没红（已写安排被 quota 藏掉了）');
});
ok('N6 block 改回浅拷 ⇒ C3 红', function () {
  const broken = CODE.replace('out.block = stat.block ? JSON.parse(JSON.stringify(stat.block)) : null;', 'out.block = stat.block;');
  assert(broken !== CODE);
  const A = load(broken, store(8)); A.planAudit.audit(items(8));
  const b = A.planAudit.stat().block; b.picked = 999;
  assert(A.planAudit.stat().block.picked !== 3, 'C3 没红');
});
console.log('');
if (fail) {
  console.log('PLAN-AUDIT-QUOTA-V2578: FAIL ' + fail + ' / ' + (pass + fail));
  fails.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('PLAN-AUDIT-QUOTA-V2578: pass（' + pass + ' 项）');
#!/usr/bin/env node
'use strict';
/**
 * tests/patch-rehearsal-wire-v2554.js —— 「写前预演」接线专锁（v2.554.0）
 *
 * 治的缺口（本文件存在的唯一理由）：
 *
 *   `engines/write-rehearsal.js`（v2.531.0）的契约是「把结构校验挪到落盘之前」，
 *   而它到 v2.554.0 之前**零产品调用** —— 计数器恒初值，面板上那格「写前预演」
 *   读到的永远是初值（v2.552.0 已把它改成「从未调用」，但「从未调用」本身
 *   就是这条链没人喂的证据）。
 *
 *   本批勘察时量到两件事，缺一不可（这也是为什么不能「顺手接一下」）：
 *     ① `WA.schema.list() === []` —— 全仓没有任何 schema 登记。此时把 rehearse
 *        接上去只有一种结果：整单拒 `no-validator`（等于没接，而且看起来像在拒收）。
 *     ② 反过来，随手塞一个「永远放行」的 validator 会让它 `ok: true`
 *        （实测 accepted = ['people.p1.name']）—— **假接线长得和真接线一样绿**。
 *        这一条在本锁的 N1 段被钉成负控：把 validator 换成恒真之后，
 *        B2 那个「形态漂移被拒」的现场必须消失。
 *
 * 本批做的两件最小的事：
 *   · 落下第一个真 schema（`storePatch`：path 必填且是 a.b 标识符形态、value 任意）；
 *   · 把预演接到**唯一的按路径写口** `store.patch`（11 个产品调用点，路径都是 a.b）。
 *
 * 口径（写在这里，因为它是判据的边界，不是实现细节）：
 *   ① 只拦**容器级形态漂移**（array / object / 标量 互改）；标量↔标量放行 ——
 *      宽松代码里 `''` → 0 到处都是，拦它会立刻引发一片误伤，那是另一件事。
 *   ② 预演不判「值好不好」，只判形态：字段级语义不在这个口。
 *   ③ **缺席要如实标并放行**（fail-open）：引擎没装载 / schema 没装载 / 路径形态不合法 /
 *      预演自己炸了 —— 四种都写进 `skipped`，保持旧行为。`patch` 对坏 path 的旧契约是
 *      「不引入新的抛出路径」，这条就是为了守住它。
 *   ④ 只有 `code === 'type-conflict'` 才拒写；其它拒收不改行为。
 *
 * 判据结构：
 *   A 接线与口径（静态，judge 抽成函数以便 N2 对**同一条**判据做负控）
 *   B 行为（计数 +1 / 拒收 / 缺席放行 / 标量放行 / 返回体四栏）
 *   C 只读不变式（拒收不写盘、拒收之后 store 照常可用）
 *   D 缺席（引擎缺席 / schema 缺席 ⇒ 放行，不假装通过也不假装拒绝）
 *   N 负控（恒真 validator ⇒ B2 现场消失；口径被放宽 ⇒ A3 现形）
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
let pass = 0, fail = 0;
const fails = [];
function ok(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; fails.push(name + ' :: ' + e.message); console.log('  ✗ ' + name + ' :: ' + e.message); }
}
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
/** 去注释（含 JSDoc 块注释行的续行形态）——注释里的提及不是代码。 */
function stripComment(line) {
  const t = line.trim();
  if (t.indexOf('/*') === 0 || t.indexOf('*') === 0) return '';
  const i = line.indexOf('//');
  return i < 0 ? line : line.slice(0, i);
}
function codeOnly(text) { return text.split('\n').map(stripComment).join('\n'); }

// ── 台子 ─────────────────────────────────────────────────────
require('./host-boot.js').boot();
require(path.join(BASE, 'core/store.js'));
require(path.join(BASE, 'core/schema.js'));
require(path.join(BASE, 'engines/write-rehearsal.js'));
const WA = global.WorldAxis;
const KEY = 'worldaxis_state_test_chat_001';
function seed(obj) {
  if (obj === null) { global.localStorage.removeItem(KEY); return; }
  global.localStorage.setItem(KEY, JSON.stringify(obj));
}
function raw() { return global.localStorage.getItem(KEY); }

// ── A 接线与口径 ─────────────────────────────────────────────
const STORE = rd('core/store.js');
const STORE_CODE = codeOnly(STORE);

/**
 * A3 的判据本体（抽成函数是为了让 N2 对**同一条**判据做负控，而不是另写一份近似物）。
 * 判两件事：拒写范围（只认 type-conflict）+ 四种缺席必须各有 skipped 分支。
 */
function refusalScopeProblems(src) {
  const out = [];
  const code = codeOnly(src);
  if (code.indexOf("pr.code === 'type-conflict'") < 0) {
    out.push('拒写条件不是 type-conflict —— 「任何拒收都拒写」会把坏 path 那类旧行为也改成写不了');
  }
  ['engine-absent', 'bad-path', 'schema-absent', 'rehearse-error'].forEach(function (k) {
    if (code.indexOf("'" + k + "'") < 0) out.push('缺 skipped 分支: ' + k + '（缺席/异常不许被当成「判过了」）');
  });
  if (code.indexOf('rehearsePatch(path, value, before)') < 0) {
    out.push('patch 里没有 rehearsePatch(path, value, before) —— 预演必须拿到**写入前**那份节点形态');
  }
  return out;
}

ok('A1 store.js 里恰 1 处 rehearse 调用，schema 是 storePatch，且发生在 transact 之前', function () {
  const calls = STORE_CODE.split('\n').filter(function (l) { return l.indexOf('WR.rehearse(') >= 0; });
  assert.strictEqual(calls.length, 1, '调用应恰 1 处，实 ' + calls.length + ' :: ' + JSON.stringify(calls));
  assert.ok(calls[0].indexOf("schema: 'storePatch'") >= 0, '参数里的 schema 名应是 storePatch');
  // 顺序：拒收必须发生在 transact 之前（进了 transact 就是「写进去再道歉」）
  const iPr = STORE_CODE.indexOf('const pr = rehearsePatch(');
  const iPatchFn = STORE_CODE.indexOf('    patch(path, value) {');
  const iTx = STORE_CODE.indexOf('const r = this.transact(draft => {', iPatchFn);
  assert.ok(iPatchFn > 0 && iPr > iPatchFn, 'rehearsePatch 应挂在 patch() 里（实 ' + iPr + ' vs ' + iPatchFn + '）');
  assert.ok(iTx > iPr, '预演应在 transact 之前（实 ' + iPr + ' vs ' + iTx + '）');
});

ok('A2 第一个真 schema：storePatch 的字段口径（path 必填 + 形态、value 任意、未知字段保留）', function () {
  const i = STORE_CODE.indexOf('const PATCH_SCHEMA = {');
  assert.ok(i > 0, 'PATCH_SCHEMA 应在位');
  const block = STORE_CODE.slice(i, i + 700);
  assert.ok(/path:\s*\{\s*type:\s*'string',\s*required:\s*true,\s*pattern:/.test(block),
    'path 应声明为 required 的 string 且带 pattern');
  assert.ok(/value:\s*\{\s*type:\s*'any'\s*\}/.test(block), 'value 应是 any（本口只判形态，不判值好不好）');
  assert.ok(block.indexOf("unknown: 'keep'") >= 0, '未知字段应保留（本仓纪律：未知字段保留不执行）');
  assert.ok(STORE_CODE.indexOf('S.define(\'storePatch\', PATCH_SCHEMA)') >= 0, 'ensurePatchSchema 应真的把它登记进注册表');
});

ok('A3 拒写范围只认 type-conflict，且四种缺席各有 skipped 分支', function () {
  const bad = refusalScopeProblems(STORE);
  assert.deepStrictEqual(bad, [], '口径不齐: ' + JSON.stringify(bad));
});

ok('A4 形态三分类：absent / array / object / scalar，且标量↔标量显式放行', function () {
  assert.ok(/function patchClassOf\(v\)/.test(STORE_CODE), '应有 patchClassOf');
  ['absent', 'array', 'object', 'scalar'].forEach(function (k) {
    assert.ok(STORE_CODE.indexOf("return '" + k + "'") >= 0, '缺分类 ' + k);
  });
  assert.ok(/was === 'scalar' && now === 'scalar'/.test(STORE_CODE),
    '标量↔标量应显式放行 —— 少了这一句，空串→0 这种到处都有的写法会立刻被误伤');
});

// ── B 行为 ──────────────────────────────────────────────────
seed(null);
WA.store.init();

ok('B1 一次 patch 让 rehearse 的 calls +1（计数器真的被喂了）', function () {
  const before = WA.writeRehearsal.stat().calls;
  WA.store.patch('b1Node', { a: 1 });
  assert.strictEqual(WA.writeRehearsal.stat().calls, before + 1,
    'patch 之后 calls 应 +1，实 ' + WA.writeRehearsal.stat().calls + '（原 ' + before + '）');
});

ok('B2 形态漂移被拒：object → array，且 state 读回仍是 object', function () {
  WA.store.patch('b2Node', { a: 1 });
  const rej0 = WA.writeRehearsal.stat().rejected;
  const r = WA.store.patch('b2Node', []);
  assert.strictEqual(r.ok, false, '应拒收: ' + JSON.stringify(r));
  assert.strictEqual(r.reason, 'type-conflict', '拒收理由应是 type-conflict，实 ' + r.reason);
  assert.strictEqual(Array.isArray(WA.store.get().b2Node), false, 'b2Node 被写成了数组 —— 拒收之后不该落盘');
  assert.strictEqual(WA.writeRehearsal.stat().rejected, rej0 + 1, 'rejected 计数应 +1');
  assert.strictEqual(WA.writeRehearsal.stat().lastCode, 'type-conflict', 'lastCode 应是 type-conflict');
});

ok('B3 缺席 → 任意形态放行（新节点没有形态，不构成冲突）', function () {
  const r = WA.store.patch('b3BrandNew', []);
  assert.strictEqual(r.ok, true, '新节点写数组应放行: ' + JSON.stringify(r.reason));
  assert.ok(Array.isArray(WA.store.get().b3BrandNew), '应真的写进去');
});

ok('B4 标量 ↔ 标量放行（口径①的正面证据）', function () {
  assert.strictEqual(WA.store.patch('b4Scalar', 'a').ok, true, '第一次写字符串应放行');
  const r = WA.store.patch('b4Scalar', 0);
  assert.strictEqual(r.ok, true, '字符串 → 0 应放行（本批不拦标量互换），实 ' + JSON.stringify(r));
  assert.strictEqual(WA.store.get().b4Scalar, 0, '应真的写成 0');
});

ok('B5 拒收返回体四栏齐全（调用方不必猜）', function () {
  WA.store.patch('b5Node', { a: 1 });
  const r = WA.store.patch('b5Node', 'scalar');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'type-conflict');
  assert.strictEqual(r.path, 'b5Node');
  assert.strictEqual(r.expected, 'object');
  assert.strictEqual(r.actual, 'scalar');
  assert.ok(typeof r.ok === 'boolean' && typeof r.reason === 'string', '形状应是对象而不是异常');
});

// ── C 只读不变式 ────────────────────────────────────────────
ok('C1 拒收不写盘：盘上那份逐字不变，saveStat 的时刻也不动', function () {
  WA.store.patch('c1Node', { a: 1 });
  const raw0 = raw();
  const at0 = WA.store.saveStat().at;
  const r = WA.store.patch('c1Node', 'nope');
  assert.strictEqual(r.ok, false, '应拒收');
  assert.strictEqual(raw(), raw0, '拒收却改了盘上的存档 —— 预演必须在写之前拦住');
  assert.strictEqual(WA.store.saveStat().at, at0, '拒收却触发了落盘');
});

ok('C2 拒收之后 store 照常可用（预演不会把写路径弄坏）', function () {
  const r = WA.store.patch('c2Node', { ok: 1 });
  assert.strictEqual(r.ok, true, '拒收一次之后别的节点仍应能写: ' + JSON.stringify(r.reason));
  assert.strictEqual(WA.store.get().c2Node.ok, 1);
});

// ── D 缺席 ──────────────────────────────────────────────────
ok('D1 引擎缺席 ⇒ 放行（fail-open，不把原本能写的变成写不了）', function () {
  WA.store.patch('d1Node', { a: 1 });
  const bak = WA.writeRehearsal;
  try {
    delete WA.writeRehearsal;
    const r = WA.store.patch('d1Node', 'scalar');
    assert.strictEqual(r.ok, true, '引擎缺席时应保持旧行为（放行），实 ' + JSON.stringify(r));
    assert.strictEqual(WA.store.get().d1Node, 'scalar', '旧行为 = 真的写进去');
  } finally { WA.writeRehearsal = bak; }
});

ok('D2 schema 缺席 ⇒ 放行（预演没有判据就不假装判过）', function () {
  WA.store.patch('d2Node', { a: 1 });
  const bak = WA.schema;
  try {
    delete WA.schema;
    const r = WA.store.patch('d2Node', 'scalar');
    assert.strictEqual(r.ok, true, 'schema 缺席时应放行，实 ' + JSON.stringify(r));
  } finally { WA.schema = bak; }
  // 恢复之后，同一现场必须重新被拒 —— 否则 D2 只是在证明「关掉就放行」
  const r2 = WA.store.patch('d2Node', []);
  assert.strictEqual(r2.ok, false, 'schema 恢复之后应重新拒收（实 ' + JSON.stringify(r2) + '）');
});

// ── N 负控 ──────────────────────────────────────────────────
ok('N1 负控：把 validator 换成「永远放行」⇒ 形态漂移就写进去了（B2 不是恒真）', function () {
  WA.store.patch('n1Node', { a: 1 });
  const bak = WA.writeRehearsal.rehearse;
  try {
    WA.writeRehearsal.rehearse = function () {
      return { ok: true, dryRun: true, schema: 'storePatch', ops: 1, accepted: ['n1Node'], rejected: [], problems: [] };
    };
    const r = WA.store.patch('n1Node', 'scalar');
    assert.strictEqual(r.ok, true, '恒真 validator 下应放行 —— 若仍拒收，说明 B2 量的不是 validator 的结论');
    assert.strictEqual(WA.store.get().n1Node, 'scalar', '这正是「假接线」的形态：看起来通过，实际什么都没判');
  } finally { WA.writeRehearsal.rehearse = bak; }
});

ok('N2 负控：把拒写范围放宽成「任何拒收都拒写」⇒ A3 的同一条判据必须现形', function () {
  const poisoned = STORE.replace("pr.ok === false && pr.code === 'type-conflict'", "pr.ok === false");
  assert.notStrictEqual(poisoned, STORE, '负控没改到东西（锚点失配）⇒ 这条负控本身失效');
  assert.ok(refusalScopeProblems(poisoned).length > 0, '放宽拒写范围之后 A3 居然还通过 ⇒ 判据不认这个病灶');
  // 反向：删掉一个 skipped 分支，也必须现形
  const poisoned2 = STORE.replace("rec.skipped = 'schema-absent';", 'rec.skipped = \'\';');
  assert.notStrictEqual(poisoned2, STORE, '第二条负控没改到东西（锚点失配）');
  assert.ok(refusalScopeProblems(poisoned2).length > 0, '去掉 schema-absent 分支之后 A3 居然还通过');
});

// ── 收口 ────────────────────────────────────────────────────
console.log('\n写前预演接线专锁 v2.554.0：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) {
  console.log('失败项：');
  fails.forEach(function (f) { console.log('  · ' + f); });
  process.exit(1);
}
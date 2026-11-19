#!/usr/bin/env node
// WorldAxis tests/opv30-r3-write-rehearsal-v2531.js — 写前预演：结构先过一遍，再决定落不落盘
//
// 这件引擎的病根不是「缺少校验」，而是**校验站在错的位置**：core/schema.js 自 v2.110.0
// 起就能答「这组字段该不该同时在、类型对不对」，但它产品面零读者 —— 校验只发生在测试里，
// 真正的写入口各写一遍 `if (!Array.isArray(x))`，形态互不相同。
// 最容易的假绿是「预演看起来跑过了」：把 validate 抛出的异常吞掉算通过、把拒了却不说
// 原因的项当成没有问题、把超限的 op 静默截断 —— 三种都能让 ok:true 出现在不该出现的时候。
// 所以本锁钉的是否定面：没 validator 不许放行、未知 schema 不许放行、拒了必须带名字、
// 超限整单拒、预演绝不碰存储。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function a(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); return true; }
  fail++;
  console.log('  ✗ ' + name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)));
  return false;
}
const RD = function (rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); };
function mkSandbox() {
  const win = { console: { log: function () {}, warn: function () {}, error: function () {} } };
  const sb = {
    window: win, console: win.console,
    JSON: JSON, Math: Math, Object: Object, Array: Array, String: String,
    Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error, isFinite: isFinite
  };
  win.WorldAxis = { registerModule: function (n, m) { (win.__regs = win.__regs || []).push({ rel: n, meta: m }); } };
  sb.WA = win.WorldAxis;
  return sb;
}
function loadFile(rel, srcOverride) {
  const sb = mkSandbox();
  const ctx = vm.createContext(sb);
  try {
    vm.runInContext(srcOverride === undefined ? RD(rel) : srcOverride, ctx, { filename: rel });
  } catch (e) { return { wa: sb.WA, threw: String(e && e.message) }; }
  return { wa: sb.WA, regs: sb.window.__regs || [], threw: null };
}
function negCtl(rel, from, to, fn) {
  const src = RD(rel);
  if (src.indexOf(from) < 0) { a(false, '负控制锚点存在：' + rel + ' :: ' + from.slice(0, 40)); return; }
  fn(loadFile(rel, src.split(from).join(to)), rel);
}
const ENG = 'engines/write-rehearsal.js';
const m0 = loadFile(ENG);
const WR = m0.wa.writeRehearsal;
const OK = function () { return { ok: true, errors: [] }; };
const NO = function (field) {
  return { ok: false, errors: [{ field: field === undefined ? '' : field, expected: 'string', actual: 'number' }] };
};

console.log('\n── 装载与入参形态 ──');
{
  a(!!WR, 'A1 模块已挂载 WA.writeRehearsal');
  a(m0.regs.length === 1 && m0.regs[0].rel === ENG, 'A2 只注册一次且名对', m0.regs);
  a(m0.threw === null, 'A3 装载不抛', m0.threw);
  const o1 = WR.parseOp({ path: 'a.b', value: 1 });
  a(o1 && o1.path === 'a.b' && o1.value === 1, 'A4 {path,value} 形态');
  const o2 = WR.parseOp(['a.b', 2]);
  a(o2 && o2.path === 'a.b' && o2.value === 2, 'A5 [path,value] 两元数组形态');
  a(WR.parseOp(['a']) === null, 'A6 一元数组是 null（不猜「只有路径」）');
  a(WR.parseOp({ value: 1 }) === null, 'A7 缺 path 是 null（不拿 value 拼路径）');
  a(WR.parseOp('a.b') === null && WR.parseOp(7) === null && WR.parseOp(null) === null,
    'A8 字符串 / 数字 / null 一律 null');
  a(WR.checkPath('a.b.c') === '' && WR.checkPath('state.actors') === '', 'A9 点号标识符路径合格');
  a(WR.checkPath('') === 'bad-path' && WR.checkPath('a b') === 'bad-path', 'A10 空串 / 带空格不合格');
  a(WR.checkPath('a..b') === 'bad-path' && WR.checkPath('1a') === 'bad-path', 'A11 空段 / 数字开头不合格');
  a(WR.checkPath(new Array(120).join('a')) === 'bad-path', 'A12 超长路径不合格');
  a(WR.checkPath('a.b.c.d.e.f.g.h.i') === 'bad-path', 'A13 九段超深不合格');
}

console.log('\n── 整单拒：问题出在这一单本身，不许静默放行 ──');
{
  a(WR.rehearse(null, { validate: OK }).problems[0].code === 'bad-plan', 'B1 非对象 plan → bad-plan');
  a(WR.rehearse({ ops: [] }, { validate: OK }).problems[0].code === 'no-schema', 'B2 无 schema 名 → no-schema');
  a(WR.rehearse({ schema: '   ', ops: [] }, { validate: OK }).problems[0].code === 'no-schema', 'B3 空白 schema 名 → no-schema');
  a(WR.rehearse({ schema: 's' }, { validate: OK }).problems[0].code === 'bad-ops', 'B4 既无 ops 也无 value → bad-ops');
  a(WR.rehearse({ schema: 's', ops: 'x' }, { validate: OK }).problems[0].code === 'bad-ops', 'B5 ops 不是数组 → bad-ops');
  a(WR.rehearse({ schema: 's', ops: [] }, { validate: OK }).problems[0].code === 'no-ops', 'B6 空 ops → no-ops');
  const many = [];
  for (let i = 0; i < 65; i++) many.push({ path: 'a' + i, value: 1 });
  const b7 = WR.rehearse({ schema: 's', ops: many }, { validate: OK });
  a(b7.problems[0].code === 'too-many-ops' && b7.accepted.length === 0,
    'B7 超上限整单拒且不静默截断（accepted 0）', [b7.problems[0].code, b7.accepted.length]);
  const b8 = WR.rehearse({ schema: 's', ops: [{ path: 'a', value: 1 }] }, {});
  a(b8.problems[0].code === 'no-validator' && b8.ok === false, 'B8 没有 validator ⇒ 拒（不许「没校验＝通过」）');
  const b9 = WR.rehearse({ schema: 'nope', ops: [{ path: 'a', value: 1 }] },
    { validate: OK, known: function (n) { return n === 'actor'; } });
  a(b9.problems[0].code === 'unknown-schema', 'B9 未知 schema 名 ⇒ 整单拒（不猜）');
  const b10 = WR.rehearse({ schema: 'actor', ops: [{ path: 'a', value: 1 }] },
    { validate: OK, known: function (n) { return n === 'actor'; } });
  a(b10.ok === true && b10.accepted.length === 1, 'B10 已登记 schema 名照常通过');
  a(b9.problems.length === 1 && b9.problems[0].path === '' && b9.rejected.length === 1,
    'B11 整单拒只有一条问题且 path 为空串（不伪装成某条 op 的问题）', b9.problems);
  const b12 = WR.rehearse({ schema: 's', ops: [{ path: 'a', value: 1 }] }, { validate: OK, maxOps: 0 });
  a(b12.ok === true, 'B12 maxOps 传 0 视为未给（不当成「谁都不许过」）', b12.problems);
}

console.log('\n── 逐条预演：通过的留、拒了的带名字 ──');
{
  const calls = [];
  const rec = function (n, v) { calls.push([n, v]); return OK(); };
  const c1 = WR.rehearse({ schema: 'actor', ops: [{ path: 'z', value: 1 }, { path: 'a', value: 2 }] }, { validate: rec });
  a(c1.ok === true && c1.accepted.join(',') === 'z,a', 'C1 全合法时 accepted 保持入参原序', c1.accepted);
  a(calls.length === 2 && calls[0][0] === 'actor', 'C2 每条 op 各校验一次，且带上 schema 名', calls);
  const c3 = WR.rehearse({ schema: 'actor', value: { n: 1 } }, { validate: rec });
  a(c3.ok === true && c3.accepted[0] === 'actor', 'C3 单条形态缺 path 时路径落成 schema 名', c3.accepted);
  const c4 = WR.rehearse({ schema: 's', ops: [{ path: 'x', value: 1 }] }, { validate: function () { return NO('name'); } });
  a(c4.ok === false && c4.rejected[0].path === 'x.name' && c4.rejected[0].expected === 'string',
    'C4 拒收路径 = op 路径 + 出错字段（带名字，不含糊）', c4.rejected[0]);
  const c5 = WR.rehearse({ schema: 's', ops: [{ path: 'x', value: 1 }] }, { validate: function () { return { ok: false, errors: [] }; } });
  a(c5.rejected[0].code === 'reject-without-name', 'C5 拒了却不说原因 ⇒ 本身算一条问题（拒收要带名字）', c5.rejected[0]);
  const c6 = WR.rehearse({ schema: 's', ops: [{ path: 'x', value: 1 }] }, { validate: function () { throw new Error('boom'); } });
  a(c6.rejected.length === 1 && c6.rejected[0].code === 'validator-threw', 'C6 validator 抛 ⇒ 记 validator-threw，不把整单带崩', c6.rejected);
  const c7 = WR.rehearse({ schema: 's', ops: [{ path: 'x', value: 1 }] }, { validate: function () { return 'yes'; } });
  a(c7.rejected[0].code === 'bad-verdict', 'C7 validator 返回非对象 ⇒ bad-verdict（不把字符串当结论）', c7.rejected);
  const c8 = WR.rehearse({ schema: 's', ops: [{ path: 'x', value: 1 }] }, { validate: function () { return { ok: false, errors: [{ field: '', expected: 'e', actual: 'a' }] }; } });
  a(c8.rejected[0].path === 'x', 'C8 出错字段为空串时路径不加多余的点', c8.rejected[0]);
  const c9 = WR.rehearse({ schema: 's', ops: [7, { path: 'a', value: 1 }] }, { validate: OK });
  a(c9.ok === false && c9.rejected[0].code === 'bad-op' && c9.accepted.join(',') === 'a',
    'C9 坏 op 只废自己，合法的照常进 accepted', [c9.rejected, c9.accepted]);
  const c10 = WR.rehearse({ schema: 's', ops: [{ path: 'a b', value: 1 }] }, { validate: OK });
  a(c10.rejected[0].code === 'bad-path', 'C10 坏路径 ⇒ bad-path', c10.rejected);
  const c11 = WR.rehearse({ schema: 's', ops: [{ path: 'z', value: 1 }, { path: 'a', value: 2 }, { path: 'm', value: 3 }] },
    { validate: function () { return { ok: false, errors: [{ field: '', expected: 'e', actual: 'a' }] }; } });
  a(c11.rejected.map(function (x) { return x.path; }).join(',') === 'a,m,z',
    'C11 rejected 按 path 字典序（同输入同输出 ⇒ 可复算）', c11.rejected.map(function (x) { return x.path; }));
  const c12a = JSON.stringify(WR.rehearse({ schema: 's', ops: [{ path: 'z', value: 1 }, { path: 'a', value: 2 }] },
    { validate: function () { return NO('f'); } }));
  const c12b = JSON.stringify(WR.rehearse({ schema: 's', ops: [{ path: 'z', value: 1 }, { path: 'a', value: 2 }] },
    { validate: function () { return NO('f'); } }));
  a(c12a === c12b, 'C12 同一单跑两遍结果逐字相同（含 sort 后的顺序）');
  const c13 = WR.rehearse({ schema: 's', ops: [{ path: 'z', value: 1 }, { path: 'a', value: 2 }, { path: 'm', value: 3 }] }, { validate: OK });
  a(c13.accepted.join(',') === 'z,a,m', 'C13 accepted 不排序（排序只用于拒收单，别把成功项顺序搞乱）', c13.accepted);
  a(c13.dryRun === true && c13.next === undefined && c13.state === undefined,
    'C14 返回值里没有 next / state 这类「下一版世界」字段（预演不产世界）', Object.keys(c13));
  const c15 = WR.rehearse({ schema: 's', ops: [{ path: 'a', value: 1 }] },
    { validate: function () { return { ok: false, errors: [{ field: 'k', code: 'bad-kind', expected: 'x|y', actual: 'z' }, { field: 'k2' }] }; } });
  a(c15.rejected[0].code === 'bad-kind' && c15.rejected[0].errors.length === 2,
    'C15 校验器自带的 code 被透传，全部错误另附 errors[]（只报第一条会丢信息）', c15.rejected[0]);
}

console.log('\n── 读数与「不碰存储」 ──');
{
  const before = WR.stat();
  WR.rehearse({ schema: 's', ops: [{ path: 'a', value: 1 }] }, { validate: OK });
  WR.rehearse({ schema: 's', ops: [] }, { validate: OK });
  const after = WR.stat();
  a(after.calls === before.calls + 2 && after.ok === before.ok + 1 && after.rejected === before.rejected + 1,
    'D1 计数器随调用走（calls / ok / rejected 各就各位）', [before, after]);
  a(after.maxOps === 64 && after.maxDepth === 8, 'D2 上限读数与常量一致', after);
  const src = RD(ENG);
  a(src.indexOf('WA.store') < 0 && src.indexOf('store.patch') < 0 && src.indexOf('store.transact') < 0,
    'D3 源码零 store 读写（预演不落盘的证据，不是靠公约）');
  a(src.indexOf('localStorage') < 0 && src.indexOf('sessionStorage') < 0, 'D4 源码零本地存储（读数在模块内存里）');
  a(src.split('registerModule').length - 1 === 2, 'D5 尾调 registerModule 恰一处（另一处是 typeof 守卫）');
  a(WR.stat().calls === after.calls, 'D6 stat() 是只读的（再取一次不改计数）');
}

console.log('\n── 负控制：把判据拆掉，上面四组必须现形 ──');
negCtl(ENG, '    rejected.sort(function (x, y) { return x.path < y.path ? -1 : (x.path > y.path ? 1 : 0); });', '    void 0;', function (mm) {
  const r = mm.wa.writeRehearsal.rehearse({ schema: 's', ops: [{ path: 'z', value: 1 }, { path: 'a', value: 2 }, { path: 'm', value: 3 }] },
    { validate: function () { return NO(''); } });
  a(r.rejected.map(function (x) { return x.path; }).join(',') === 'z,a,m',
    'E1 负控制：去掉 sort 后顺序就随入参漂（C11 不是空断言）', r.rejected.map(function (x) { return x.path; }));
});
negCtl(ENG, '      if (!errs.length) {', '      if (false) {', function (mm) {
  const r = mm.wa.writeRehearsal.rehearse({ schema: 's', ops: [{ path: 'x', value: 1 }] }, { validate: function () { return { ok: false, errors: [] }; } });
  a(r.rejected.length === 1 && r.rejected[0].code !== 'reject-without-name',
    'E2 负控制：不登记「无原因拒收」时就落成别的码（C5 不是空断言）', r.rejected);
});
negCtl(ENG, '      if (r && r.__threw) {', '      if (false) {', function (mm) {
  const r = mm.wa.writeRehearsal.rehearse({ schema: 's', ops: [{ path: 'x', value: 1 }] }, { validate: function () { throw new Error('boom'); } });
  a(r.rejected[0].code !== 'validator-threw', 'E3 负控制：不认 __threw 时抛异常会落成别的码（C6 不是空断言）', r.rejected[0]);
});
negCtl(ENG, "    if (known && !known(schema)) return wholeReject('unknown-schema', '已登记的 schema 名', schema);",
  "    if (false && known && !known(schema)) return wholeReject('unknown-schema', '已登记的 schema 名', schema);", function (mm) {
    const r = mm.wa.writeRehearsal.rehearse({ schema: 'nope', ops: [{ path: 'a', value: 1 }] },
      { validate: OK, known: function (n) { return n === 'actor'; } });
    a(r.ok === true, 'E4 负控制：不查登记时未知 schema 被放行（B9 不是空断言）', r.problems);
  });
console.log('\n合计：' + pass + ' / ' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
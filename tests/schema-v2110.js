// WorldAxis tests/schema-v2110.js (v2.110.0) — 结构级输入校验专锁（计划一 #22）
//
// 边界（与既有两道边界锁的分工，不重复）：
//   · tests/input-guard*  —— **值级**：一个字段长什么样（text/num/count/oneOf/list）
//   · 本文件              —— **结构级**：一组字段该不该同时在 / 类型对不对 / 范围越没越界
//   · tests/reject-*      —— **归属级**：拒收码有没有见证人
//   三层即「值 → 结构 → 归属」，本文件只守中间那层。
//
// 本锁要钉住的**否定式**语义（都是「不许悄悄放宽」的形状）：
//   ① `'3'` 不是 `3`、`[]` 不是 `{}` —— 默认**不**做类型放宽（放宽必须由 spec 显式 `coerce:true`）；
//   ② `errors` **恒为数组**（单条错误也走数组 —— 调用方不必写两种取法）；
//   ③ 未注册的 schema 名 ⇒ `unknown-schema`，**不**按空 spec 静默放过；
//   ④ 未知字段默认**保留**（`unknown:'keep'`）而不是拒 —— 与产品「未知字段保留不执行」同口径；
//   ⑤ 校验器自己炸时如实报 `validator-threw`，绝不假装通过。
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const synthHost = require('./synth-host.js');
const BASE = path.join(__dirname, '..');
const REL = 'core/schema.js';
const KEYS = ['validate', 'validateNamed', 'define', 'get', 'list', 'stat', 'reset', 'attach', 'TYPES', 'MAX_ERRORS'];

function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function freshHost() {
  const c = synthHost.negativeContext({});
  vm.runInContext(srcOf(), c, { filename: REL });
  return c;
}
function hostWith(broken) {
  const c = synthHost.negativeContext({});
  vm.runInContext(broken, c, { filename: REL + '#broken' });
  return c;
}
/** 对象字面量花括号配平体（与 fault-context 锁同口径：只认**导出对象体内**的键）。 */
function exportBody(src) {
  const m = /WA\.schema\s*=\s*\{/.exec(src);
  if (!m) return '';
  let i = src.indexOf('{', m.index + m[0].length - 1), depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(i + 1, j); }
  }
  return '';
}

// ── A 段：导出面枚举 ─────────────────────────────────────────────────────
function runA(a) {
  const src = srcOf();
  a(/WA\.schema\s*=\s*\{/.test(src), 'schema/A: 命名空间赋值形态未变');
  const body = exportBody(src);
  a(body.length > 50, 'schema/A: 导出面对象字面量可定位（' + body.length + ' 字符）');
  KEYS.forEach(function (k) {
    a(new RegExp('(^|[\\s,{])' + k + '\\s*:').test(body), 'schema/A: 导出面**对象体内**含 ' + k);
  });
  const keys = (body.match(/(?:^|[\s,{])([A-Za-z_$][\w$]*)\s*:/g) || [])
    .map(function (s) { return s.replace(/[^A-Za-z_$]/g, ''); });
  const uniq = keys.filter(function (k, i) { return keys.indexOf(k) === i && KEYS.indexOf(k) < 0; });
  a(uniq.length === 0, 'schema/A: 导出面无未登记的多余口（实 ' + JSON.stringify(uniq) + '）');
  a(/window\.WorldAxis = window\.WorldAxis \|\| \{\}/.test(src), 'schema/A: 宿主入口沿用 window.WorldAxis');
}

// ── B 段：运行时探针 ────────────────────────────────────────────────────
function runB(a, WA) {
  const S = (WA || global.WorldAxis || {}).schema;
  a(!!S, 'schema/B: 命名空间已装载');
  if (!S) return;
  S.reset();

  // B1. 正常通过：`ok:true` + value 原样带回
  const v1 = S.validate({ type: 'object', fields: { a: { type: 'string', required: true } } }, { a: 'hi' });
  a(v1.ok === true && v1.value && v1.value.a === 'hi' && Array.isArray(v1.errors),
    'schema/B: 合法输入 ok:true 且 value 原样带回（实 ' + JSON.stringify(v1.ok) + '）');

  // B2. 必填缺席
  const v2 = S.validate({ type: 'object', fields: { a: { type: 'string', required: true } } }, {});
  a(v2.ok === false && v2.reason === 'invalid-input' && v2.errors.length === 1,
    'schema/B: 必填缺席 ⇒ ok:false / invalid-input（实 ' + JSON.stringify(v2.reason) + '）');
  a(v2.errors[0].field === 'a' && String(v2.errors[0].expected).indexOf('必填') >= 0,
    'schema/B: 错误条目带 field 与人读的 expected（实 ' + JSON.stringify(v2.errors[0]) + '）');

  // B3. **单条错误也走数组**（调用方不必写两种取法）
  a(Array.isArray(v2.errors) && v2.errors.length === 1 && !!v2.first,
    'schema/B: 单条错误仍是数组，且 first 指向首条');

  // B4. 类型不放宽：'3' 不是 3、[] 不是 {}
  const v4a = S.validate({ type: 'object', fields: { n: { type: 'number' } } }, { n: '3' });
  a(v4a.ok === false, 'schema/B: 默认**不**放宽类型（\'3\' 不是 3）');
  const v4b = S.validate({ type: 'object', fields: { n: { type: 'number', coerce: true } } }, { n: '3' });
  a(v4b.ok === true, 'schema/B: 显式 coerce:true 才放宽（这就是「放宽必须是声明」）');
  const v4c = S.validate({ type: 'object', fields: { o: { type: 'object' } } }, { o: [] });
  a(v4c.ok === false, 'schema/B: [] 不是 {}（数组与对象在结构级是两回事）');
  const v4d = S.validate({ type: 'object', fields: { a: { type: 'array' } } }, { a: {} });
  a(v4d.ok === false, 'schema/B: {} 不是 []（反向同款）');

  // B5. 枚举的 expected 渲染成 a|b|c（与产品拒收码的写法一致）
  const v5 = S.validate({ type: 'object', fields: { k: { type: 'enum', values: ['x', 'y', 'z'] } } }, { k: 'q' });
  a(v5.ok === false && v5.errors[0].expected === 'x|y|z',
    'schema/B: 枚举 expected 渲染为 a|b|c（实 ' + v5.errors[0].expected + '）');
  const v5b = S.validate({ type: 'object', fields: { k: { type: 'enum', values: ['x', 'Y'] } } }, { k: 'y' });
  a(v5b.ok === true, 'schema/B: 枚举比较大小写不敏感（X 与 x 同义）');

  // B6. 范围与数组上限
  a(S.validate({ type: 'object', fields: { n: { type: 'number', min: 0, max: 9 } } }, { n: 10 }).ok === false,
    'schema/B: 超上界被拒');
  a(S.validate({ type: 'object', fields: { n: { type: 'int' } } }, { n: 1.5 }).ok === false,
    'schema/B: int 拒非整数');
  a(S.validate({ type: 'object', fields: { a: { type: 'array', maxItems: 2 } } }, { a: [1, 2, 3] }).ok === false,
    'schema/B: 数组超长被拒');
  const v6 = S.validate({ type: 'object', fields: { a: { type: 'array', itemType: 'number' } } }, { a: [1, 'x'] });
  a(v6.ok === false && v6.errors[0].field === 'a[1]',
    'schema/B: 元素类型错时 field 带下标（实 ' + v6.errors[0].field + '）—— 否则「哪个元素错」不可知');

  // B7. 未知字段：默认**保留**，显式 reject 才拒
  const v7a = S.validate({ type: 'object', fields: { a: { type: 'string' } } }, { a: 'x', extra: 1 });
  a(v7a.ok === true, 'schema/B: 未知字段默认保留（unknown:\'keep\' —— 与产品「未知字段保留不执行」同口径）');
  const v7b = S.validate({ type: 'object', fields: { a: { type: 'string' } }, unknown: 'reject' }, { a: 'x', extra: 1 });
  a(v7b.ok === false && v7b.errors.some(function (e) { return e.field === 'extra'; }),
    'schema/B: 显式 unknown:\'reject\' 才拒多余字段');

  // B8. 跨字段组 requireAny
  const v8 = S.validate({ type: 'object', fields: {}, requireAny: [['p', 'q']] }, {});
  a(v8.ok === false && v8.errors[0].field === 'p|q',
    'schema/B: requireAny 全缺时给出组名（实 ' + v8.errors[0].field + '）');
  a(S.validate({ type: 'object', fields: {}, requireAny: [['p', 'q']] }, { q: 1 }).ok === true,
    'schema/B: requireAny 命中其一即通过');

  // B9. 错误上限（MAX_ERRORS）
  a(S.MAX_ERRORS === 24 && Number.isFinite(S.MAX_ERRORS), 'schema/B: MAX_ERRORS = 24（实 ' + S.MAX_ERRORS + '）');
  const many = {};
  for (let i = 0; i < 60; i++) many['k' + i] = 'str';
  const spec60 = { type: 'object', fields: {} };
  for (let i = 0; i < 60; i++) spec60.fields['k' + i] = { type: 'number' };
  const v9 = S.validate(spec60, many);
  a(v9.ok === false && v9.errors.length <= S.MAX_ERRORS,
    'schema/B: 错误列表受 MAX_ERRORS 夹取（实 ' + v9.errors.length + ' ≤ ' + S.MAX_ERRORS + '）—— 再多只是噪声');

  // B10. TYPES 九种
  a(Array.isArray(S.TYPES) && S.TYPES.length === 9 && S.TYPES.indexOf('enum') >= 0 && S.TYPES.indexOf('any') >= 0,
    'schema/B: TYPES 九种（实 ' + JSON.stringify(S.TYPES) + '）');

  // B11. 具名 schema：注册 / 取回 / 按名校验 / **未注册不放过**
  S.reset();
  a(S.define('t.actor', { type: 'object', fields: { name: { type: 'string', required: true } } }).ok === true,
    'schema/B: define 注册成功');
  a(!!S.get('t.actor') && S.get('t.actor').fields && !!S.get('t.actor').fields.name,
    'schema/B: get 取回同一份 spec');
  a(S.validateNamed('t.actor', { name: '甲' }).ok === true, 'schema/B: validateNamed 命中注册项时真校验');
  a(S.validateNamed('t.actor', {}).ok === false, 'schema/B: validateNamed 对不合规输入同样拒');
  const v11 = S.validateNamed('不存在', { x: 1 });
  a(v11.ok === false && v11.reason === 'unknown-schema' && Array.isArray(v11.errors),
    'schema/B: 未注册名 ⇒ unknown-schema（**不**按空 spec 静默放过，实 ' + v11.reason + '）');
  a(S.define('', {}).ok === false, 'schema/B: 空名不注册（如实报，不静默接受）');
  const li = S.list();
  a(Array.isArray(li) && li.some(function (r) { return r.name === 't.actor' && r.fields === 1; }),
    'schema/B: list 给出 name/fields 两读数（实 ' + JSON.stringify(li) + '）');

  // B12. attach 把校验结果折进调用方返回体
  const merged = S.attach({ ok: true, payload: 1 }, v2);
  a(merged.ok === true && merged.schemaOk === false && Array.isArray(merged.schemaErrors),
    'schema/B: attach 保留原字段并补 schemaOk / schemaErrors（实 ' + JSON.stringify(Object.keys(merged)) + '）');
  a(S.attach(null, { ok: true }).schemaOk === true, 'schema/B: attach(null, …) 不抛');

  // B13. stat 读数
  const st = S.stat();
  a(st.checks > 0 && st.passed > 0 && st.rejected > 0 && st.registered >= 1,
    'schema/B: stat 给出 checks/passed/rejected/registered（实 ' + JSON.stringify(st) + '）');
  S.reset();
}

// ── C 段：不变式 ────────────────────────────────────────────────────────
function runC(a, WA) {
  const S = (WA || global.WorldAxis || {}).schema;
  if (!S) { a(false, 'schema/C: 命名空间缺席，不变式无从判定'); return; }

  // C1. 恒等式：checks = passed + rejected（每一次校验都有唯一去向）
  S.reset();
  S.validate({ type: 'object', fields: { a: { type: 'string' } } }, { a: 'x' });
  S.validate({ type: 'object', fields: { a: { type: 'string' } } }, { a: 1 });
  S.validate({ type: 'object', fields: { a: { type: 'string', required: true } } }, {});
  const s = S.stat();
  a(s.checks === 3, 'schema/C: checks 计数与实际调用次数一致（实 ' + s.checks + '）');
  a(s.passed + s.rejected === s.checks,
    'schema/C: passed + rejected === checks（实 ' + s.passed + '+' + s.rejected + ' vs ' + s.checks + '）');

  // C2. 校验器自身异常 ⇒ validator-threw（绝不假装通过）
  function specWithThrowingGetter() {
    const def = {};
    Object.defineProperty(def, 'type', { get: function () { throw new Error('spec-boom'); }, enumerable: true });
    return { type: 'object', fields: { a: def } };
  }
  const v = S.validate(specWithThrowingGetter(), { a: 'x' });
  a(v.ok === false && v.reason === 'validator-threw',
    'schema/C: spec 取值抛错 ⇒ ok:false / validator-threw（实 ' + v.reason + '）—— **不**假装通过');
  a(S.validate(null, null).ok === true || S.validate(null, null).ok === false,
    'schema/C: validate(null, null) 不抛（任何输入都返回结果对象）');

  // C3. reset 可复位（校验计数不许跨测试污染）
  S.reset();
  const s0 = S.stat();
  a(s0.checks === 0 && s0.passed === 0 && s0.rejected === 0,
    'schema/C: reset 后 checks/passed/rejected 归零');
}

// ── N 段：负控制（真源码破坏 + 真宿主重跑同款判据）────────────────────────
function runNegative(a) {
  const src = srcOf();

  // N1. 破坏「未知字段默认保留」：强行把 unknown 当 reject
  const A1 = "      if (sp.unknown === 'reject' && input && typeof input === 'object' && out.errors.length < MAX_ERRORS) {";
  const n1 = src.split(A1).length - 1;
  a(n1 === 1, 'schema/N1: 破坏锚点（unknown 判定）在真源码中恰 1 处（实 ' + n1 + '）');
  const b1 = src.replace(A1, "      if (true) {");
  a(n1 === 1 && b1 !== src, 'schema/N1: 破坏真的改动了源码文本');
  if (n1 === 1) {
    const S1 = hostWith(b1).WorldAxis.schema;
    const r1 = S1.validate({ type: 'object', fields: { a: { type: 'string' } } }, { a: 'x', extra: 1 });
    a(r1.ok === false, 'schema/N1: 破坏后「未知字段默认保留」判据**现形**（ok 由 true 变 false）');
  }

  // N2. 破坏「默认不放宽类型」：让 coerce 恒生效
  const A2 = "        if (!d.coerce) return { field: path, expected: expectedOf(d), actual: actualOf(v) };";
  const n2 = src.split(A2).length - 1;
  a(n2 === 1, 'schema/N2: 破坏锚点（coerce 判定）在真源码中恰 1 处（实 ' + n2 + '）');
  const b2 = src.replace(A2, "        if (false) return { field: path, expected: expectedOf(d), actual: actualOf(v) };");
  a(n2 === 1 && b2 !== src, 'schema/N2: 破坏真的改动了源码文本');
  if (n2 === 1) {
    const S2 = hostWith(b2).WorldAxis.schema;
    a(S2.validate({ type: 'object', fields: { n: { type: 'number' } } }, { n: '3' }).ok === true,
      'schema/N2: 破坏后「\'3\' 不是 3」判据**现形**（默认放宽 = 静默改语义）');
  }

  // N3. 破坏「未注册名不放过」：把 unknown-schema 早退摘掉
  const A3 = "    if (!REGISTRY[n]) return { ok: false, reason: 'unknown-schema', errors: [{ field: '(schema)', expected: '已注册的 schema 名', actual: n || '(空)' }], checked: 0 };";
  const n3 = src.split(A3).length - 1;
  a(n3 === 1, 'schema/N3: 破坏锚点（unknown-schema 早退）在真源码中恰 1 处（实 ' + n3 + '）');
  const b3 = src.replace(A3, "    if (!REGISTRY[n]) return validate({}, input);");
  a(n3 === 1 && b3 !== src, 'schema/N3: 破坏真的改动了源码文本');
  if (n3 === 1) {
    const S3 = hostWith(b3).WorldAxis.schema;
    const r3 = S3.validateNamed('不存在', { x: 1 });
    a(r3.reason !== 'unknown-schema', 'schema/N3: 破坏后未注册名被静默放过（reason 由 unknown-schema 变成 '
      + r3.reason + '）—— 这就是「没登记的 schema 悄悄通过」的形态');
  }

  // N4. 纯度：原版上同款判据必须为真
  const S0 = freshHost().WorldAxis.schema;
  a(S0.validate({ type: 'object', fields: { a: { type: 'string' } } }, { a: 'x', extra: 1 }).ok === true,
    'schema/N4: （纯度）原版上「未知字段保留」为真');
  a(S0.validate({ type: 'object', fields: { n: { type: 'number' } } }, { n: '3' }).ok === false,
    'schema/N4: （纯度）原版上「不放宽类型」为真');
  a(S0.validateNamed('不存在', { x: 1 }).reason === 'unknown-schema',
    'schema/N4: （纯度）原版上「未注册名不放过」为真');

  // N5. 反空转下限
  a(src.length > 3000, 'schema/N5: 被破坏的源码面非空（' + src.length + ' 字符）');
}

module.exports = { REL: REL, KEYS: KEYS, srcOf: srcOf, exportBody: exportBody,
  runA: runA, runB: runB, runC: runC, runNegative: runNegative };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  const _c = freshHost();
  runA(a); runB(a, _c.WorldAxis); runC(a, _c.WorldAxis); runNegative(a);
  console.log('schema-v2110 ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
}
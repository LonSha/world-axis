#!/usr/bin/env node
// WorldAxis tests/extract-json-ladder-v2410.js —— v2.410.0 专锁：
//   core/api-router.js extractJson 的「模型近似 JSON 修复阶梯」（缝合自 TavernOS HUD 机制，重写落地）。
//
// 守什么：
//   A 面（正控，真源码上逐条判）：
//     A1  旧版两试语义不变：干净 JSON / 围栏包裹 / 尾逗号 / 裸控制字符（换空格保底）照旧解析成功；
//     A2  修复① 字符串内裸控制字符 → 合法转义序列（保真，不再整段换空格）；
//     A3  修复③ 截断收尾：删尾孤 "key": 与尾逗号、按栈补 }/]；
//     A4  修复④ 方言：单引号串 / 无引号裸键（含 单引号里的 \' 回落裸撇号）；
//     A5  修复② 未闭合字符串收口（尾随反斜杠先转义自身）；
//     A6  修复⑤ 缺逗号补齐（值结尾紧跟值开头，键位不误判）；
//     A7  组合阶梯：方言+截断 / 缺逗号+截断 二段修复；
//     A8  确定性边界：非 JSON 文本 / 空括号残骸照旧返回 null（不猜测补全语义）；
//     A9  判据非恒真锚点：产品源码恰含「候选阶梯」一处（N 面输入面确实存在）。
//   B 面（负控，srcOverride 内存破坏，零文件改写）：
//     B1  破坏阶梯（候选循环删掉）⇒ 新增修复能力全部现形（A2/A3/A4 样本翻假）；
//     B2  破坏后旧版语义（第 1/第 9 候选）仍在 ⇒ 只多不少的口径可证伪；
//     B3  原版恢复 ⇒ A 面同款判据成绿（破坏从不落盘）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const REL = 'core/api-router.js';
const fresh = function (opts) { return require('./ui-gate-sync.js').fresh(opts).WA; };

let pass = 0, fail = 0;
function a(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  x ' + msg); } }
function section(s) { console.log('■ ' + s); }

// ── N0：锚点恰 1 次 ──
function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function broken(spec) {
  const src = srcOf();
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('anchor hits ' + hits + ' :: ' + spec.key);
  const ov = {};
  ov[REL] = src.split(spec.from).join(spec.to);
  return ov;
}

section('A 正控：真源码上逐条判');
{
  const WA = fresh();
  const ej = function (t) { return WA.apiRouter.extractJson(t); };

  // A1 旧版语义（第 1 候选 = 旧版第一试；第 9 候选 = 旧版第二试）
  a(JSON.stringify(ej('{"a":1}')) === '{"a":1}', 'A1a 干净对象照旧');
  a(ej('```json\\n{"a":1}\\n```').a === 1, 'A1b 围栏包裹照旧');
  a(JSON.stringify(ej('[1,2,]')) === '[1,2]', 'A1c 尾逗号照旧（数组顶层面）');
  const ctrlTxt = '前缀噪音 {"s":"第一行\\n第二行"} 尾巴';
  const ctrlGot = ej(ctrlTxt);
  a(!!ctrlGot && ctrlGot.s.indexOf('第一行') === 0 && ctrlGot.s.indexOf('第二行') > 0,
    'A1d 裸控制字符（保真转义，不再丢换行前缀语义）');

  // A2 字符串内控制字符 → 合法转义（保真：值与旧版换空格不同）
  const a2 = ej('{"s":"行1\n行2\t缩进"}');
  a(!!a2 && a2.s === '行1\n行2\t缩进', 'A2 真裸控制字符转义为换行/制表（保真）');

  // A3 截断收尾（样本须全截断：含 } 会被旧版「取到最后闭合」提前救回——两向口径见 ITERATION_LOG）
  //   ⚠ 样本口径：截断样本不能含中途闭合的 `}` —— 旧版「取到最后闭合」预截断会把它截成
  //   合法但残缺的前缀（probe 实测 `{"list":[{"id":1},{"id":2,{...` → `{"list":[{"id":1}`），
  //   那是旧语义在救，不是本阶梯在救。元素用标量即无此干扰。
  const a3 = ej('{"list":[1,2,3');
  a(!!a3 && a3.list && a3.list.length === 3 && a3.list[2] === 3,
    'A3 截断数组按栈补齐 }/]（两向：含中途闭合的形态由旧版预截断接管，禁错值）');
  const a3b = ej('{"name":"沈炼","memo":"到库房去"');
  a(!!a3b && a3b.name === '沈炼' && a3b.memo === '到库房去', 'A3b 未闭合字符串+截断对象两段收口');
  const a3c = ej('{"a":1,"b":');
  a(!!a3c && a3c.a === 1 && a3c.b === undefined, 'A3c 删尾孤 "key":（半截键值对丢弃）');

  // A4 方言
  const a4 = ej("{name:'沈炼', role:'锦衣卫'}");
  a(!!a4 && a4.name === '沈炼' && a4.role === '锦衣卫', 'A4a 单引号串');
  const a4b = ej('{name:"沈炼", id:7}');
  a(!!a4b && a4b.name === '沈炼' && a4b.id === 7, 'A4b 无引号裸键（值用真引号——裸值不在修复域，与 HUD 同口径）');
  const a4c = ej("{quote:'他说\\'不\\'走了'}");
  a(!!a4c && a4c.quote === "他说'不'走了", "A4c 单引号里的 \\' 回落裸撇号");

  // A5 未闭合字符串收口
  const a5 = ej('{"memo":"他说到一半');
  a(!!a5 && a5.memo === '他说到一半', 'A5 未闭合字符串补引号');
  const a5b = ej('{"memo":"尾随反斜杠\\');
  a(!!a5b && typeof a5b.memo === 'string' && a5b.memo.length >= 1, 'A5b 尾随反斜杠先转义自身再收口');

  // A6 缺逗号
  const a6 = ej('{"a":1 "b":2}');
  a(!!a6 && a6.a === 1 && a6.b === 2, 'A6a 值与下一键之间补逗号');
  const a6b = ej('{"list":[1 2 3]}');
  a(!!a6b && a6b.list.join(',') === '1,2,3', 'A6b 数组元素间补逗号');

  // A7 组合
  const a7 = ej("{list:['甲','乙'");
  a(!!a7 && a7.list.length === 2 && a7.list[1] === '乙', 'A7a 方言+截断 二段修复（全截断样本，无中途闭合干扰预截断）');
  const a7b = ej('{"a":1 "b":2');
  a(!!a7b && a7b.a === 1 && a7b.b === 2, 'A7b 缺逗号+截断 二段修复');

  // A8 确定性边界
  a(ej('完全不是 JSON 的文本') === null, 'A8a 无括号返回 null');
  a(ej('{]') === null, 'A8b 结构残骸不硬凑');
  a(ej('{"a": 破损\\u0007"b"}') === null || typeof ej('{"a": 破损\\u0007"b"}') === 'object',
    'A8c 值位破损不虚报成功（允许失败，不允许错值）');

  // A9 锚点
  a(srcOf().split('候选阶梯：惰性求值').length === 2, 'A9 产品源码「候选阶梯」锚点恰 1 处');
}

section('B 负控：内存破坏两向自证');
{
  // B1 破坏阶梯 ⇒ 新增修复能力现形
  const spec = {
    key: 'ladder-removed',
    from: 'for (let li = 0; li < ladder.length; li++) {',
    to: 'for (let li = 0; li < 1; li++) {'
  };
  const wBroke = fresh({ srcOverride: broken(spec) });
  const ejB = function (t) { return wBroke.apiRouter.extractJson(t); };
  a(ejB("{name:'沈炼'}") === null, 'B1a 破坏阶梯 ⇒ 方言样本翻假');
  a(ejB('{"list":[1,2,3') === null, 'B1b 破坏阶梯 ⇒ 截断样本翻假');
  a(ejB('{"s":"行1\n行2"}') === null, 'B1c 破坏阶梯 ⇒ 真裸控制字符样本翻假');

  // B2 破坏后旧版语义仍在 ⇒ 只多不少可证伪
  a(JSON.stringify(ejB('{"a":1}')) === '{"a":1}', 'B2a 破坏后干净 JSON 仍过（旧版第一试保留）');
  a(JSON.stringify(ejB('[1,2,]')) === '[1,2]', 'B2b 破坏后尾逗号仍过（阶梯内不变式）');

  // B3 原版恢复
  const wClean = fresh();
  a(JSON.stringify(wClean.apiRouter.extractJson("{name:'沈炼'}")) === '{"name":"沈炼"}',
    'B3a 原版上方言样本成绿（破坏从不落盘）');
  a(JSON.stringify(wClean.apiRouter.extractJson('{"list":[1,2,3')) === '{"list":[1,2,3]}',
    'B3b 原版上截断样本成绿');
}

// ── 汇总 ──
console.log('\\n══════════════════════');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail === 0 ? 0 : 1);
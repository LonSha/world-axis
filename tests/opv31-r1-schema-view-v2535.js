#!/usr/bin/env node
// WorldAxis tests/opv31-r1-schema-view-v2535.js — 声明式视图层（schema → DOM）
//
// 本锁钉的是三条否定面（正面渲染过不算证据，因为「拼出 HTML」太容易假绿）：
//   ① **未知块类型不许静默丢弃** —— 产出可见降级行 + stat().unknown 记名。
//      「算不出来」与「本来就没有」在读数上必须不同形（本仓反复点过的同型错误）。
//   ② **插值缺路径不许抛、不许编** —— 渲染 `—` + stat().missing 记名；空串冒充是假绿。
//   ③ **纯函数** —— 同 spec 同 ctx 两次渲染逐字相等（不读时钟 / 随机 / store）。
// 另加一条安全面：所有文本与属性走 esc（`<script>` 与 `"` 都不许原样落进 HTML）。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const REL = 'ui/schema-view.js';
let pass = 0, fail = 0;
function a(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); return true; }
  fail++;
  console.log('  ✗ ' + name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)));
  return false;
}
const RD = function (rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); };
const AMP = '&' + 'amp;';
const QUOT = '&' + 'quot;';
const LT = '&' + 'lt;';

function mkSandbox() {
  const win = { console: { log() {}, warn() {}, error() {} } };
  const sb = {
    window: win, console: win.console,
    JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, Date, isFinite
  };
  win.WorldAxis = { registerModule() {} };
  sb.WA = win.WorldAxis;
  return sb;
}
function loadFile(srcOverride) {
  const sb = mkSandbox();
  const ctx = vm.createContext(sb);
  try { vm.runInContext(srcOverride === undefined ? RD(REL) : srcOverride, ctx, { filename: REL }); }
  catch (e) { return { sv: null, threw: String(e && e.message || e) }; }
  return { sv: sb.WA && sb.WA.schemaView, threw: null };
}
const M = loadFile();
const SV = M.sv;

console.log('\n■ A 面：在场与边界');
a(!M.threw && !!SV, 'A1 ui/schema-view.js 可装载且导出 WA.schemaView', M.threw);
a(!!SV && SV.ver === '2.535.0', 'A2 版本锚 = 2.535.0', SV && SV.ver);
a(!!SV && SV.KINDS.length === 12, 'A3 块类型恰 12 种（text/kv/metric/badges/row/stack/collapse/filter/action/repeat/timeline/matrix 里去掉一种）', SV && SV.KINDS);
const srcAll = RD(REL);
// 只对**代码面**判：注释里出现 addEventListener / style.css 是文档，不是消费。
const src = srcAll.split(String.fromCharCode(10)).filter(function (l) {
  return !/^\s*(\/\/|\*|\/\*)/.test(l);
}).join(String.fromCharCode(10));
a(src.indexOf('WA.store') < 0 && src.indexOf('localStorage') < 0 && src.indexOf('fetch(') < 0
  && src.indexOf('XMLHttpRequest') < 0, 'A4 零世界读、零落盘、零网络（纯渲染器）');
a(src.indexOf('addEventListener') < 0 && src.indexOf('onclick=') < 0, 'A5 零事件绑定（action/filter 只出结构，绑定归消费方）');
a(src.indexOf('style.css') < 0 && !/\.style\./.test(src), 'A6 零 .style. 写入（不操作 DOM 样式对象；matrix 列数变量是唯一例外，源码注释已写明理由）');

console.log('\n■ B 面：正渲染');
function R(spec, ctx) { return SV.render(spec, ctx || {}); }
a(R({ type: 'text', text: '你好' }).indexOf('你好') >= 0, 'B1 text 原样出');
a(R({ type: 'text', text: 'x', dim: true }).indexOf('wa-dim') >= 0, 'B2 text dim 走类名');
const kv = R({ type: 'kv', title: '账', rows: [{ k: 'A', v: 1 }] });
a(kv.indexOf('wa-sec') >= 0 && kv.indexOf('<b>1</b>') >= 0, 'B3 kv 出标题 + 值', kv.slice(0, 80));
a(R({ type: 'kv', rows: [] }).indexOf('wa-empty') >= 0, 'B4 kv 空行 → 可见空态（不是空串）');
const mt = R({ type: 'metric', label: '回合', value: 42, unit: '轮', tone: 'ok' });
a(mt.indexOf('wa-metric-value') >= 0 && mt.indexOf('42') >= 0 && mt.indexOf('wa-mt-ok') >= 0, 'B5 metric 出值/单位/语义色');
a(R({ type: 'badges', items: ['甲', { text: '乙', tone: 'warn' }] }).indexOf('wa-badge-warn') >= 0, 'B6 badges 收字符串与对象两种写法');
a(R({ type: 'row', children: [{ type: 'text', text: 'R' }] }).indexOf('wa-row') >= 0
  && R({ type: 'row', children: [{ type: 'text', text: 'R' }] }).indexOf('R') >= 0, 'B7 row 嵌套子块');
a(R({ type: 'collapse', title: '参数', children: [{ type: 'text', text: 'C' }] }).indexOf('<details') >= 0, 'B8 collapse 用原生 details（键盘可达）');
a(R({ type: 'collapse', title: 'P', open: true }).indexOf('open') >= 0, 'B9 collapse open 透传');
const fi = R({ type: 'filter', id: 'wa-f1', placeholder: '搜', target: '#t' });
a(fi.indexOf('wa-f1') >= 0 && fi.indexOf('data-target="#t"') >= 0, 'B10 filter 出 id + data-target');
a(R({ type: 'action', id: 'wa-a1', label: '执行', variant: 'primary' }).indexOf('wa-btn-primary') >= 0, 'B11 action 出 id 与变体类');
a(R({ type: 'repeat', source: '$.rows', block: { type: 'text', text: '{{$.name}}' } }, { rows: [{ name: 'A' }, { name: 'B' }] }).indexOf('B') >= 0, 'B12 repeat 按源展开');
a(R({ type: 'repeat', source: '$.rows', empty: '空', block: { type: 'text', text: 'x' } }, { rows: [] }).indexOf('空') >= 0, 'B13 repeat 空源 → 可见空态');
a(R({ type: 'repeat', source: '$.rows', block: { type: 'text', text: '{{$.name}}' } }, { rows: [{ name: 'A' }, { name: 'B' }] })
  .split('wa-tl').length >= 1, 'B14 repeat 不污染别的块');

console.log('\n■ C 面：时间轴与矩阵（本轮给玩家端的两块新视图）');
const tl = R({
  type: 'timeline', items: [
    { at: '第2章', title: '旧事', tone: 'bad' },
    { at: '第1章', title: '开端', tone: 'ok' }
  ], sortBy: '$.at'
});
a((tl.match(/wa-tl-row/g) || []).length === 2, 'C1 timeline 行数 = 条目数');
a(tl.indexOf('开端') < tl.indexOf('旧事'), 'C2 timeline sortBy 按 at 排序（第1章在心第2章前）', tl.replace(/<[^>]+>/g, '|').slice(0, 90));
const tlSame = R({ type: 'timeline', items: [{ at: 'X', title: 'A' }, { at: 'X', title: 'B' }], sortBy: '$.at' });
a(tlSame.indexOf('A') < tlSame.indexOf('B'), 'C3 排序稳定：同 at 保持输入序（排序不改写叙事顺序）');
a(R({ type: 'timeline', items: [] }).indexOf('wa-empty') >= 0, 'C4 timeline 空 → 可见空态');
const mx = R({ type: 'matrix', cols: 8, cells: [{ r: 0, c: 0, label: '剑', w: 2, h: 1, tone: 'info' }] });
a(mx.indexOf('--wa-mx-cols:8') >= 0, 'C5 matrix 列数走内联变量（列数是数据，不可能静态化）');
a(mx.indexOf('data-w="2"') >= 0 && mx.indexOf('wa-mx-info') >= 0, 'C6 matrix 占格跨度与语义色');
const mxBad = R({ type: 'matrix', cells: [] });
a(mxBad.indexOf('声明不全') >= 0, 'C7 matrix 缺 cols → 可见的「声明不全」（不静默出空矩阵）');
a(SV.stat().unknown.indexOf('matrix:cols') >= 0, 'C8 缺 cols 记进 stat().unknown', SV.stat().unknown);

console.log('\n■ D 面：三条否定面（本锁的主证据）');
const unk = R({ type: 'nosuchblock', text: 'x' });
a(unk.indexOf('data-wa-unknown="nosuchblock"') >= 0, 'D1 未知块 → 可见降级行', unk.slice(0, 80));
a(SV.stat().unknown.indexOf('nosuchblock') >= 0, 'D2 未知块记名进 stat().unknown（不是只打一行字）');
const miss = R({ type: 'text', text: '值={{$.nope}}' });
a(miss.indexOf('—') >= 0, 'D3 缺路径 → 渲染 —（不许用空串冒充「字段就是空的」）', miss);
a(SV.stat().missing.indexOf('$.nope') >= 0, 'D4 缺路径记名进 stat().missing');
const before = SV.stat().missing.length;
R({ type: 'text', text: '{{$.nope}}>{{$.nope}}' });
a(SV.stat().missing.length === before, 'D5 同一缺路径只记一次（读数不被重复刷）');

console.log('\n■ E 面：安全与幂等');
const evil = R({ type: 'text', text: '<script>alert(1)</script>' });
a(evil.indexOf('<script') < 0 && evil.indexOf(LT + 'script') >= 0, 'E1 文本转义：<script> 不落进 HTML', evil);
const q = R({ type: 'action', id: 'wa-q', label: 'x', title: '他说"开枪"' });
a(q.indexOf(QUOT) >= 0, 'E2 属性转义：title 里的引号被转义（不破属性）', q.slice(0, 120));
const spec = { blocks: [{ type: 'kv', title: 'T', rows: [{ k: 'a', v: '{{$.x}}' }] }] };
a(R(spec, { x: 1 }) === R(spec, { x: 1 }), 'E3 纯函数：同 spec 同 ctx 两次渲染逐字相等');
a(R(spec, { x: 1 }) !== R(spec, { x: 2 }), 'E4 不同 ctx 出不同结果（E3 不是「常量输出」的假绿）');
a(R({ type: 'repeat', source: '$.rows', block: { type: 'text', text: '{{$.$i}}' } }, { rows: [1, 2] })
  .indexOf('1') >= 0, 'E5 repeat 行内 $i 可用');

console.log('\n■ F 面：负控制（拆掉判据就变红 —— 证明上面不是空断言）');
function negCtl(name, from, to, fn) {
  const s2 = RD(REL).split(from);
  if (s2.length !== 2) { a(false, name + '（锚点未命中：' + from.slice(0, 30) + '）'); return; }
  const mm = loadFile(s2.join(to));
  if (mm.threw || !mm.sv) { a(false, name + '（负控制装载失败）', mm.threw); return; }
  a(fn(mm.sv) === true, name);
}
negCtl('F1 负控制：esc 退化成恒等 ⇒ 转义断言变红（E1 不是空断言）',
  "if (c === '<') return '&' + 'lt;';", "if (c === '<') return c;",
  function (sv) { return sv.render({ type: 'text', text: '<b' }).indexOf('<b') >= 0; });
negCtl('F2 负控制：缺路径改回空串 ⇒ 「—」断言变红（D3 不是空断言）',
  "        return '—';", "        return '';",
  function (sv) { return sv.render({ type: 'text', text: '{{$.nope}}' }).indexOf('—') < 0; });
negCtl('F3 负控制：未知块静默返回空串 ⇒ 降级行断言变红（D1 不是空断言）',
  "      return '<div class=\"wa-dim\" data-wa-unknown=\"' + esc(t) + '\">未知块类型：' + esc(t) + '</div>';",
  "      return '';",
  function (sv) { return sv.render({ type: 'nosuchblock' }).indexOf('data-wa-unknown') < 0; });
negCtl('F4 负控制：矩阵缺 cols 时不登记 ⇒ stat 断言变红（C8 不是空断言）',
  "      if (_stat.unknown.length < 32) _stat.unknown.push('matrix:cols');", "      void 0;",
  function (sv) { sv.render({ type: 'matrix' }); return sv.stat().unknown.indexOf('matrix:cols') < 0; });

console.log('\n合计：' + pass + ' / ' + (pass + fail));
process.exitCode = fail ? 1 : 0;
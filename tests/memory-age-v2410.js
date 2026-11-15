#!/usr/bin/env node
// WorldAxis tests/memory-age-v2410.js —— v2.410.0 专锁：
//   engines/memory.js buildMemoryBlock 的「记忆条目相对时效标注」（缝合自 TavernOS HUD
//   memory-age.js 机制，重写落地）。
//
// 守什么：
//   A 面（正控，真源码上逐条判）：
//     A1  分级措辞：today→[今天] / yesterday→[昨天]（差值 0/1 天）；
//     A2  <14 天逐天：[5 天前]；<60 天取整周：[3 周前]；<365 天取整月：[3 个月前]；≥1 年：[一年前]/[N 年前]；
//     A3  四段全覆盖：facts(at) / l1(t) / l3(t) / 伏笔(at) 都带标注，措辞只进注入块、条目原文不回写；
//     A4  诚实边界（冻结时钟口径）：未来时间戳（负差）不标注；缺时间戳字段不崩也不标注；
//     A5  判据非恒真锚点：memory.js 源码恰含「相对时效标注」一处（N 面输入面确实存在）。
//   B 面（负控，srcOverride 内存破坏，零文件改写）：
//     B1  破坏 ageTag 标注返回 ⇒ 注入块标注全部现形消失；
//     B2  破坏后分段渲染仍在（键值/正文照旧）⇒ 标注是附加元数据不是承载面；
//     B3  原版恢复 ⇒ A 面同款判据成绿（破坏从不落盘）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const REL = 'engines/memory.js';
const DAY = 864e5;
const fresh = function (opts) { return require('./ui-gate-sync.js').fresh(opts).WA; };

let pass = 0, fail = 0;
function a(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  x ' + msg); } }
function section(s) { console.log('■ ' + s); }

function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function broken(spec) {
  const src = srcOf();
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('anchor hits ' + hits + ' :: ' + spec.key);
  const ov = {};
  ov[REL] = src.split(spec.from).join(spec.to);
  return ov;
}

/** 受控铺数：清空 memory 各段后按相对天数写入四段条目，返回 buildMemoryBlock 输出 */
function blockWithAges(WA, ages) {
  const now = Date.now();
  WA.store.transact(d => {
    d.memory.l0 = []; d.memory.l1 = []; d.memory.l2 = []; d.memory.l3 = [];
    d.memory.facts = []; d.memory.foreshadows = [];
    if (ages.fact != null) d.memory.facts.push({ key: '盟主之位', value: '空悬', version: 1, active: true, reason: '', at: now - ages.fact * DAY });
    if (ages.l1 != null) d.memory.l1.push({ t: now - ages.l1 * DAY, s: '沈炼夜探库房', refs: [] });
    if (ages.l3 != null) d.memory.l3.push({ t: now - ages.l3 * DAY, theme: '血刀门东进', worldShift: '', refs: [] });
    if (ages.fs != null) d.memory.foreshadows.push({ id: 'fs_x', content: '蒙面人的令牌', status: 'developing', links: [], at: now - ages.fs * DAY });
  });
  return WA.memory.buildMemoryBlock();
}

section('A 正控：真源码上逐条判');
{
  const WA = fresh();

  // A1 today / yesterday
  const b0 = blockWithAges(WA, { fact: 0 });
  a(b0.indexOf('[今天] 盟主之位=空悬') >= 0, 'A1a 差值 0 天 → [今天]');
  const b1 = blockWithAges(WA, { fact: 1 });
  a(b1.indexOf('[昨天] 盟主之位=空悬') >= 0, 'A1b 差值 1 天 → [昨天]');

  // A2 分级措辞阶梯
  const b5 = blockWithAges(WA, { fact: 5 });
  a(b5.indexOf('[5 天前] 盟主之位=空悬') >= 0, 'A2a 5 天 → [5 天前]');
  const b20 = blockWithAges(WA, { fact: 20 });
  a(b20.indexOf('[3 周前] 盟主之位=空悬') >= 0, 'A2b 20 天 → [3 周前]（取整周）');
  const b100 = blockWithAges(WA, { fact: 100 });
  a(b100.indexOf('[3 个月前] 盟主之位=空悬') >= 0, 'A2c 100 天 → [3 个月前]（取整月）');
  const b400 = blockWithAges(WA, { fact: 400 });
  a(b400.indexOf('[一年前] 盟主之位=空悬') >= 0, 'A2d 400 天 → [一年前]');
  const b900 = blockWithAges(WA, { fact: 900 });
  a(b900.indexOf('[2 年前] 盟主之位=空悬') >= 0, 'A2e 900 天 → [2 年前]');

  // A3 四段全覆盖 + 条目原文不回写
  const ball = blockWithAges(WA, { fact: 5, l1: 1, l3: 100, fs: 20 });
  a(/\[1 天前\]|\[昨天\] 沈炼夜探库房/.test(ball), 'A3a l1（t）带标注');
  a(ball.indexOf('【长线主题】[3 个月前] 血刀门东进') >= 0, 'A3b l3（t）带标注');
  a(ball.indexOf('[20 天前] 蒙面人的令牌') >= 0 || ball.indexOf('[3 周前] 蒙面人的令牌') >= 0, 'A3c 伏笔（at）带标注');
  a(/\[昨天\] 沈炼夜探库房/.test(ball) || ball.indexOf('[1 天前] 沈炼夜探库房') >= 0, 'A3d l1 标注落在昨天/1天档');
  const st = WA.store.get();
  a(st.memory.facts[0].key === '盟主之位' && st.memory.facts[0].value === '空悬',
    'A3e 条目原文不带标注（措辞只进注入块，不回写存档）');
  a(st.memory.foreshadows[0].content === '蒙面人的令牌', 'A3f 伏笔条目原文不带标注');

  // A4 诚实边界：负差与缺字段
  const bfut = blockWithAges(WA, { fact: -3 });
  a(bfut.indexOf('盟主之位=空悬') >= 0 && bfut.indexOf('[今天]') < 0 && bfut.indexOf('天前]') < 0,
    'A4a 未来时间戳（负差）不标注（冻结时钟退化不猜）');
  const bnoT = (function () {
    WA.store.transact(d => {
      d.memory.l0 = []; d.memory.l1 = []; d.memory.l2 = []; d.memory.l3 = [];
      d.memory.facts = []; d.memory.foreshadows = [];
      d.memory.l3.push({ theme: '无时间戳的主题', worldShift: '', refs: [] });
    });
    return WA.memory.buildMemoryBlock();
  })();
  a(bnoT.indexOf('无时间戳的主题') >= 0 && bnoT.indexOf('[') < 0, 'A4b 缺时间戳字段不崩也不标注');

  // A5 锚点
  a(srcOf().split('相对时效标注').length === 2, 'A5 产品源码「相对时效标注」锚点恰 1 处');
}

section('B 负控：内存破坏两向自证');
{
  // B1 破坏 ageTag 标注返回 ⇒ 标注现形消失
  const spec = {
    key: 'age-tag-removed',
    from: "return w ? '[' + w + ']' : '';",
    to: "return '';"
  };
  const wBroke = fresh({ srcOverride: broken(spec) });
  const bBroke = blockWithAges(wBroke, { fact: 5, l1: 1 });
  a(bBroke.indexOf('盟主之位=空悬') >= 0 && bBroke.indexOf('天前]') < 0 && bBroke.indexOf('[昨天]') < 0,
    'B1 破坏 ageTag ⇒ 注入块标注消失、条目正文仍在');

  // B2 破坏后分段渲染仍在 ⇒ 标注是附加元数据
  a(bBroke.indexOf('【长期事实】盟主之位=空悬') >= 0, 'B2a 破坏后 facts 段渲染照旧');
  a(bBroke.indexOf('【阶段回顾】沈炼夜探库房') >= 0, 'B2b 破坏后 l1 段渲染照旧');

  // B3 原版恢复
  const wClean = fresh();
  const bClean = blockWithAges(wClean, { fact: 5 });
  a(bClean.indexOf('[5 天前] 盟主之位=空悬') >= 0, 'B3 原版上标注成绿（破坏从不落盘）');
}

// ── 汇总 ──
console.log('\n══════════════════════');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail === 0 ? 0 : 1);

#!/usr/bin/env node
// WorldAxis tests/opv30-r1-replica-family-v2530.js — 副本族：产名 / 铺开 / 回收
//
// 这件引擎的病根是「把清单当成会自己长对的东西」：后台推演写 `前台角色1..N`，
// 谁来定 N、哪条该删、删的依据是什么 —— 三件事此前都没有出口。于是两种错都安静发生：
//   · 该建的没建（在场角色多了一个，世界书里没有格子，注入侧读不到它）；
//   · 不该留的留着（旧副本永久占注入预算与关键词表，且没人知道它已经死了）。
// 最容易的假绿是「按编号数字比大小裁剪」—— 数字小的先删、或者「不在本次名单里就删」，
// 样本能过，代价是：还没轮上第一次活动的副本被当成死的删掉、乱序输入时删错人。
// 所以本锁钉的同样是否定面：不碰存储、缺证据不判死、同轮重复调用一字不动。
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
  if (src.indexOf(from) < 0) { a(false, '负控制锚点存在：' + rel + ' :: ' + from.slice(0, 30)); return; }
  const m = loadFile(rel, src.split(from).join(to));
  fn(m, rel);
}
const DEEP = function (x) { return JSON.stringify(x); };

const m0 = loadFile('engines/replica-family.js');
const RF = m0.wa.replicaFamily;

// ══════════ 一、装载与规格解析 ══════════
console.log('\n── 规格：`npc@act` 的两种合法形态 ──');
{
  a(!!RF, 'A1 模块已挂载 WA.replicaFamily');
  a(m0.regs.length === 1 && m0.regs[0].rel === 'engines/replica-family.js', 'A2 只注册一次且名对', m0.regs);
  a(m0.threw === null, 'A3 装载不抛（坏环境也不炸页面）', m0.threw);
  const s1 = RF.parseSpec('npc@act');
  a(s1 && s1.tag === 'npc' && s1.attr === 'act', 'A4 tag@attr 拆成两段', s1);
  const s2 = RF.parseSpec('npc');
  a(s2 && s2.tag === 'npc' && s2.attr === '', 'A5 只有 tag 时 attr 是空串（不是 undefined）', s2);
  a(RF.parseSpec('') === null && RF.parseSpec('   ') === null, 'A6 空白串返回 null（不猜族名）');
  a(RF.parseSpec('@act') === null, 'A7 前导 @ 是非法形态（tag 不能为空）', RF.parseSpec('@act'));
  a(RF.parseSpec('npc@') === null, 'A8 尾随 @ 是非法形态（attr 不能为空）', RF.parseSpec('npc@'));
  a(RF.parseSpec(42) === null && RF.parseSpec(null) === null && RF.parseSpec({}) === null, 'A9 非串一律 null');
  a(RF.parseSpec(new Array(80).join('x')) === null, 'A10 超长（>64）返回 null，不截断后当成合法', RF.parseSpec(new Array(80).join('x')));
}

// ══════════ 二、产名 ══════════
console.log('\n── 产名：纯函数、连续、不跳号 ──');
{
  a(RF.nameOf('前台角色', 0) === '前台角色1', 'B1 序号从 1 起（0 起是内部下标，不是展示名）', RF.nameOf('前台角色', 0));
  a(RF.nameOf('前台角色', 4) === '前台角色5', 'B2 第 5 条名字对得上');
  a(RF.nameOf('x', 3.9) === 'x4', 'B3 小数下标向下取整，不产生 x4.9 这种名字', RF.nameOf('x', 3.9));
  a(RF.nameOf('', 0) === '' && RF.nameOf(null, 0) === '', 'B4 基名为空返回空串（不替调用方编一个「undefined1」）');
  a(RF.nameOf('x', -1) === '' && RF.nameOf('x', NaN) === '' && RF.nameOf('x', Infinity) === '', 'B5 非法下标返回空串');
  a(RF.nameOf('x', '2') === 'x3', 'B6 数字串可接受（存档反序列化常见）', RF.nameOf('x', '2'));
  a(RF.nameOf('x', 0) === RF.nameOf('x', 0) && RF.nameOf('x', 7) === RF.nameOf('x', 7), 'B7 纯函数：同参同结果');
  const ns = RF.namesOf('b', 3);
  a(DEEP(ns) === DEEP(['b1', 'b2', 'b3']), 'B8 一族的名单连续不跳号', ns);
  a(RF.namesOf('b', 0).length === 0 && RF.namesOf('b', -5).length === 0, 'B9 非正条数得空名单，不抛');
  a(RF.namesOf('b', '2').length === 2 && RF.namesOf('b', 2.7).length === 2, 'B10 条数容错：字符串与小数都按整数处理', RF.namesOf('b', 2.7));
  a(RF.namesOf('', 2).length === 2 && RF.namesOf('', 2)[0] === '', 'B11 基名为空时名单是空串占位（长度仍忠于条数）', RF.namesOf('', 2));
}

// ══════════ 三、铺开：只出三张单，不碰存储 ══════════
console.log('\n── plan：create / keep / drop 三张单，且不动输入 ──');
{
  const p1 = RF.plan([], { base: 'a', count: 2 });
  a(DEEP(p1.create) === DEEP(['a1', 'a2']) && p1.keep.length === 0 && p1.drop.length === 0, 'C1 空族要建满（create 随条数）', p1);
  const cur2 = ['a1', 'a2'];
  const snap2 = DEEP(cur2);
  const p2 = RF.plan(cur2, { base: 'a', count: 2 });
  a(p2.create.length === 0 && DEEP(p2.keep) === DEEP(['a1', 'a2']) && p2.drop.length === 0, 'C2 刚好够时三张单都不动', p2);
  a(DEEP(cur2) === snap2, 'C3 不碰输入数组（三张单之外零副作用）');
  const p3 = RF.plan(['a1', 'a9', 'b2'], { base: 'a', count: 2 });
  a(DEEP(p3.keep) === DEEP(['a1']) && DEEP(p3.create) === DEEP(['a2']), 'C4 差一条时建那条、留该留的', p3);
  a(DEEP(p3.drop) === DEEP(['a9', 'b2']), 'C5 族外的两条按原顺序进 drop（读数可复算）', p3.drop);
  const p4 = RF.plan(['a1'], { base: 'a', count: 0 });
  a(p4.create.length === 0 && DEEP(p4.drop) === DEEP(['a1']), 'C6 条数归零时整族进 drop（人走了/族名变了）', p4);
  const p5 = RF.plan(['a1', 'a1', '', null, 3], { base: 'a', count: 2 });
  a(DEEP(p5.keep) === DEEP(['a1']), 'C7 重复与非串被过滤，keep 不重复计数', p5.keep);
  a(DEEP(p5.create) === DEEP(['a2']), 'C8 重复项不会把「缺的那条」也吞掉', p5.create);
  a(RF.plan(null, { base: 'a', count: 1 }).create.length === 1, 'C9 current 为 null 时按空族处理，不抛');
  a(RF.plan(undefined, null).create.length === 0, 'C10 want 缺失时什么都不建（不 catch 式兜底）');
  const p7 = RF.plan([], { base: 'a', count: 3 });
  a(DEEP(p7.wanted) === DEEP(RF.namesOf('a', 3)), 'C11 wanted 与 namesOf 同源（面板读数只有一份）', p7.wanted);
  const p8 = RF.plan(['z9'], { base: 'a', count: 1 });
  a(p8.drop.length === 1 && p8.create.length === 1, 'C12 换族名 = 建 1 条 + 删 1 条（不在引擎里偷偷重命名）', p8);
}

// ══════════ 四、回收：缺证据不判死 + 幂等 ══════════
console.log('\n── cleanup：只按活动次数与轮次判，判不出就不动 ──');
{
  const st1 = { lastCleanupRound: 1, roundsSinceCleanup: 0, activity: { a1: 0, a2: 3 } };
  const snap1 = DEEP(st1);
  const r1 = RF.cleanup(st1, 2, { minActivityTries: 1 });
  a(DEEP(r1.drop) === DEEP(['a1']), 'D1 活动次数低于门槛的那条被回收', r1);
  a(r1.why.a1 === 'idle<1', 'D2 回收带原因（不是只给一个名单）', r1.why);
  a(r1.next.activity.a1 === undefined, 'D3 回收后连活动记录一起清（下次不会「记得」一个不存在的副本）', r1.next.activity);
  a(r1.next.activity.a2 === 3, 'D4 留下的那条活动次数原样保留');
  a(DEEP(st1) === snap1, 'D5 不就地改 state（返回 next，调用方决定何时落盘）');
  const st2 = { lastCleanupRound: 0, roundsSinceCleanup: 0, activity: { a1: 'x', a2: 2 } };
  const r2 = RF.cleanup(st2, 1, { minActivityTries: 1 });
  a(r2.drop.length === 0, 'D6 活动记录非数字（脏存档）时不回收', r2);
  a(r2.why.a1 === 'no-activity', 'D7 脏记录记成 no-activity，与「确实零次」区分开', r2.why);
  a(r2.next.activity.a1 === 'x', 'D8 脏记录原样留着（等修，不静默删）', r2.next.activity);
  const st3 = { lastCleanupRound: 5, roundsSinceCleanup: 2, activity: { a1: 0 } };
  const r3 = RF.cleanup(st3, 5, { minActivityTries: 1 });
  a(r3.skipped === 'same-round' && r3.drop.length === 0, 'D9 同一轮重复调用直接跳过（幂等入口）', r3);
  a(DEEP(r3.next) === DEEP(st3), 'D10 跳过时 state 一字不变（不是「重算一遍刚好一样」）', r3.next);
  a(RF.cleanup(r3.next, 5, { minActivityTries: 1 }).skipped === 'same-round', 'D11 幂等可重复：第二次仍跳过');
  const st4 = { lastCleanupRound: 3, roundsSinceCleanup: 1, activity: { a1: 0 } };
  const r4 = RF.cleanup(st4, 4, { mode: 'auto', cycleRounds: 5 });
  a(r4.skipped === 'not-due' && r4.drop.length === 0, 'D12 auto 未到期不动手（按轮次节流）', r4);
  a(r4.next.roundsSinceCleanup === 2, 'D13 未到期只把计数器 +1', r4.next);
  a(r4.next.lastCleanupRound === 3, 'D14 没真清理就不动上一轮标记（否则下次又不到期）', r4.next);
  const st5 = { lastCleanupRound: 3, roundsSinceCleanup: 4, activity: { a1: 0 } };
  const r5 = RF.cleanup(st5, 4, { mode: 'auto', cycleRounds: 5 });
  a(r5.skipped === undefined && DEEP(r5.drop) === DEEP(['a1']), 'D15 auto 到期（since>=cycle）时真清理', r5);
  a(r5.next.roundsSinceCleanup === 0 && r5.next.lastCleanupRound === 4, 'D16 真清理后轮次归零、标记跟到本轮', r5.next);
  const r6 = RF.cleanup({ lastCleanupRound: 0, roundsSinceCleanup: 0, activity: { b: 0, a: 0 } }, 1, {});
  a(DEEP(r6.drop) === DEEP(['a', 'b']), 'D17 drop 排序输出（读数可复算，不靠对象键序）', r6.drop);
  const r7 = RF.cleanup({ activity: { a1: 0 } }, 1, { minActivityTries: 0 });
  a(r7.drop.length === 0, 'D18 门槛为 0 时零次也算够（判据是 hits>=minTry，不是 hits>0）', r7);
  const r8 = RF.cleanup(null, 'x', null);
  a(r8.ok === true && r8.next.lastCleanupRound === 0, 'D19 全空入参不抛：轮次按 0 处理', r8.next);
  a(RF.cleanup(undefined, 2, { mode: 'auto' }).next.roundsSinceCleanup === 1, 'D20 auto 默认周期生效（不因 cfg 缺省而每轮都清）');
}

// ══════════ 五、读数 ══════════
console.log('\n── stat：族有多大、几条真活跃过 ──');
{
  const s1 = RF.stat({ lastCleanupRound: 7, roundsSinceCleanup: 2, activity: { a1: 0, a2: 5, a3: 'x' } });
  a(s1.family === 3, 'E1 family 计数含脏记录（它确实是一格）', s1);
  a(s1.active === 1, 'E2 active 只数「数字且 >0」的条目（脏记录不算活跃）', s1);
  a(s1.lastCleanupRound === 7 && s1.roundsSinceCleanup === 2, 'E3 轮次两个读数原样透出');
  const s2 = RF.stat(null);
  a(s2.family === 0 && s2.active === 0, 'E4 空 state 读数为 0，不抛');
  a(DEEP(RF.DEFAULTS) === DEEP({ mode: 'manual', minActivityTries: 1, cycleRounds: 10 }), 'E5 DEFAULTS 冻结面：manual + 门槛 1 + 周期 10', RF.DEFAULTS);
  RF.DEFAULTS.cycleRounds = 1;
  const after = RF.cleanup({ roundsSinceCleanup: 0, activity: { a1: 0 } }, 1, { mode: 'auto' });
  a(after.skipped === 'not-due', 'E6 改导出面不污染引擎（DEFAULTS 是副本，内部仍按 10 轮节流）', after);
}

// ══════════ 六、负控制 ══════════
console.log('\n── 负控制：把判据改坏，上面的断言必须变红 ──');
negCtl('engines/replica-family.js', "if (typeof hits !== 'number') { why[name] = 'no-activity'; return; }",
  "if (false) { why[name] = 'no-activity'; return; }", function (mm) {
    const bad = mm.wa.replicaFamily.cleanup({ activity: { a1: 'x' } }, 1, { minActivityTries: 1 });
    a(bad.drop.length === 1, 'F1 负控制：不区分「脏记录」时它被当零次删掉（D6 不是空断言）', bad.drop);
  });
negCtl('engines/replica-family.js', 'if (Math.floor(Number(st.lastCleanupRound) || -1) === r) {',
  'if (Math.floor(Number(st.lastCleanupRound) || -1) === -1) {', function (mm) {
    const bad = mm.wa.replicaFamily.cleanup({ lastCleanupRound: 5, activity: { a1: 0 } }, 5, { minActivityTries: 1 });
    a(bad.skipped !== 'same-round', 'F2 负控制：去掉同轮判据后幂等失效（D9 不是空断言）', bad);
  });
negCtl('engines/replica-family.js', 'delete next.activity[name];', '', function (mm) {
    const bad = mm.wa.replicaFamily.cleanup({ activity: { a1: 0 } }, 1, { minActivityTries: 1 });
    a(bad.next.activity.a1 === 0, 'F3 负控制：不删活动记录时下次还会「记得」它（D3 不是空断言）', bad.next.activity);
  });
negCtl('engines/replica-family.js', 'if (!s || s.length > MAX_SPEC_LEN) return null;',
  'if (!s) return null;', function (mm) {
    const bad = mm.wa.replicaFamily.parseSpec(new Array(80).join('x'));
    a(bad !== null, 'F4 负控制：不拦超长时它被当成合法规格（A10 不是空断言）', bad);
  });
negCtl('engines/replica-family.js', "if (at < 0) return { tag: s, attr: '' };",
  'if (at < 0) return null;', function (mm) {
    const bad = mm.wa.replicaFamily.parseSpec('npc');
    a(bad === null, 'F5 负控制：无属性形态被一律回绝（A5 不是空断言）', bad);
  });

console.log('\n合计：' + pass + ' / ' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);

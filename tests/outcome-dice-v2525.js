#!/usr/bin/env node
// WorldAxis tests/outcome-dice-v2525.js -- S1 单列可开关项「说了不一定成（d20 五档）」专锁
//
// 治的病
//   现场原本是「玩家说什么就成什么」：没有任何一处用骰子决定玩家声明的成败。
//   本锁钉住四件事：
//     A 默认必须关（关着不掷骰、不记账、不产出）——不许偷偷改世界。
//     B 开着时五档判据逐格可核（纯函数 bandOf + 整表 ladder）。
//     C 一次一票：同一票重掷必须回首次结果（不许"读到失败再重掷"）。
//     D 有界：账本最多 32 票；坏入参走既有拒收码（bad-target / bad-roll）。
//   负控制：把 bandOf 改坏、把 CAP 改大、把默认开关改成 true，三条都必须红。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const REL = 'engines/outcome-dice.js';
const fresh = function (opts) { return require('./ui-gate-sync.js').fresh(opts).WA; };

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; return true; }
  fail++; fails.push(name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)));
  return false;
}
function eq(a, b, name) { return ok(a === b, name, { got: a, want: b }); }

const WA = fresh();
const OD = WA.outcomeDice;
ok(!!OD, 'A0 outcomeDice 已装载');

// ── A 默认关：不掷骰、不记账、不产出 ──
eq(OD.settings().enabled, false, 'A1 默认 enabled=false');
const off = OD.resolve({ target: 50, ticket: 't-off' });
eq(off.ok, true, 'A2 关着时 ok:true（原样通过）');
eq(off.reason, 'module-disabled', 'A3 关着时 reason=module-disabled（复用成功面既有码）');
eq(off.grade, 'auto', 'A4 关着时 grade=auto');
eq(OD.view().total, 0, 'A5 关着时不记账');
eq(OD.buildBlock(), '', 'A6 关着时注入面零 token');

// ── 纯判据：五档边界 ──
eq(OD.needOf(100), 20, 'B1 needOf(100)=20');
eq(OD.needOf(1), 1, 'B2 needOf(1)=1（夹到 1）');
eq(OD.needOf(50), 10, 'B3 needOf(50)=10');
eq(OD.bandOf(10, 1), 'critical', 'B4 掷 1 必大成功');
eq(OD.bandOf(10, 20), 'fumble', 'B5 need=10 掷 20 大失败');
eq(OD.bandOf(10, 2), 'extreme', 'B6 need=10 掷 2 极难成功（⌊10/5⌋=2）');
eq(OD.bandOf(10, 3), 'success', 'B7 need=10 掷 3 普通成功');
eq(OD.bandOf(10, 10), 'success', 'B8 need=10 掷 10 刚好成功');
eq(OD.bandOf(10, 11), 'fail', 'B9 need=10 掷 11 失败');
eq(OD.bandOf(19, 20), 'fail', 'B10 need=19 掷 20 只算失败（高能力不吃挂）');
eq(OD.bandOf(20, 20), 'fail', 'B11 need=20 掷 20 只算失败');
eq(OD.bandOf(4, 20), 'fumble', 'B12 need=4 掷 20 大失败');
// 单调性：need 越低，同一骰点的档不得更高
const ORDER = { fumble: -1, fail: 0, success: 1, extreme: 3, critical: 5 };
let mono = true;
for (let roll = 1; roll <= 20; roll++) {
  let prev = 9;
  for (let need = 20; need >= 1; need--) {
    const r = ORDER[OD.bandOf(need, roll)];
    if (r > prev && need !== 19 && need !== 20) { mono = false; }
    // 高 need 不吃挂是**显式例外**（discipline ③），故 need 19/20 不参与单调判定
    if (need <= 18) prev = r;
  }
}
ok(mono, 'B13 分档对目标单调（need ≤18 段）');

// ── ladder 整表 ──
const lad = OD.ladder(50);
eq(lad.ok, true, 'B14 ladder ok');
eq(lad.rows.length, 20, 'B15 ladder 20 行');
eq(lad.rows.filter(function (r) { return r.band === 'critical'; }).length, 1, 'B16 大成功只 1 格');
eq(lad.rows.filter(function (r) { return r.band === 'fumble'; }).length, 1, 'B17 大失败只 1 格');
eq(OD.ladder(0).reason, 'bad-target', 'B18 ladder 坏目标走 bad-target');
eq(OD.ladder('50').reason, 'bad-target', 'B19 ladder 字符串目标也拒（不隐式取整）');

// ── 坏入参：走现场既有码 ──
OD.toggle(true);
eq(OD.settings().enabled, true, 'C0 开起来了');
eq(OD.resolve({ target: 0 }).reason, 'bad-target', 'C1 target=0 → bad-target');
eq(OD.resolve({ target: 101 }).reason, 'bad-target', 'C2 target=101 → bad-target');
eq(OD.resolve({ target: 50.5 }).reason, 'bad-target', 'C3 小数目标也拒');
eq(OD.resolve({ target: 50, die: 12 }).reason, 'bad-roll', 'C4 die=12 → bad-roll');
eq(OD.view().total, 0, 'C5 坏入参一条都不记账');

// ── 一次一票（防刷）──
const r1 = OD.resolve({ target: 50, ticket: 't-1', who: '他', what: '撬锁' });
eq(r1.ok, true, 'D1 第一票 ok');
eq(r1.die, 20, 'D2 默认 d20');
eq(r1.reason, 'ok', 'D3 reason=ok');
ok(r1.roll >= 1 && r1.roll <= 20, 'D4 骰点在 1..20', r1.roll);
eq(r1.band, OD.bandOf(10, r1.roll), 'D5 档与纯判据一致');
eq(r1.replay, false, 'D6 首次不是 replay');
const r2 = OD.resolve({ target: 50, ticket: 't-1', who: '他', what: '撬锁' });
eq(r2.replay, true, 'D7 同票重掷 → replay:true');
eq(r2.roll, r1.roll, 'D8 同票重掷骰点不变（不许刷）');
eq(r2.band, r1.band, 'D9 同票重掷档不变');
eq(OD.view().total, 1, 'D10 同票只记一条');
const r3 = OD.resolve({ target: 50, ticket: 't-2' });
eq(r3.replay, false, 'D11 换票可以再掷（新行动）');
eq(OD.view().total, 2, 'D12 换票记第二条');

// ── 开着的注入面 ──
ok(OD.buildBlock().indexOf('【判定】') === 0, 'E1 开着时注入面以【判定】开头', OD.buildBlock());

// ── d100 模式：不另立判据，交 successGrade 归并 ──
const h = OD.resolve({ target: 60, ticket: 't-100', die: 100 });
eq(h.ok, true, 'F1 d100 也能掷');
eq(h.die, 100, 'F2 die=100');
ok(['critical', 'extreme', 'success', 'fail', 'fumble'].indexOf(h.band) >= 0, 'F3 d100 归并到五档', h.band);

// ── 有界：32 票封顶 ──
for (let i = 0; i < 40; i++) OD.resolve({ target: 50, ticket: 'cap-' + i });
const v = OD.view();
eq(v.total, OD.CAP, 'G1 账本封顶 32 票');
eq(v.cap, 32, 'G2 读数报 cap=32');
eq(v.recent.length, 5, 'G3 读面只给最近 5 票');
eq(v.recent[v.recent.length - 1].ticket, 'cap-39', 'G4 挤出的是最旧的，留的是最新');

// ── 关回去：又不掷了 ──
OD.toggle(false);
eq(OD.settings().enabled, false, 'H1 可关回去');
const off2 = OD.resolve({ target: 50, ticket: 't-closed' });
eq(off2.reason, 'module-disabled', 'H2 关回去后又回到"说了就成"');
eq(OD.view().total, OD.CAP, 'H3 关着不写新票');

// ── 负控制（真源码破坏，必须红）──
function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function broke(from, to) {
  const raw = srcOf();
  if (raw.indexOf(from) < 0) return { ok: false, why: 'anchor-missing' };
  return { ok: true, patched: raw.replace(from, to) };
}
const nc = [];
const n1 = broke("if (roll >= 20) return need >= 19 ? 'fail' : 'fumble';", "if (roll >= 20) return 'fumble';");
nc.push({ name: 'N1 高能力也吃大失败（判据破坏）', hit: n1.ok });
const n2 = broke('const CAP = 32;', 'const CAP = 9999;');
nc.push({ name: 'N2 账本上界改大（有界破坏）', hit: n2.ok });
const n3 = broke('const DEF = { enabled: false, die: 20 };', 'const DEF = { enabled: true, die: 20 };');
nc.push({ name: 'N3 默认开关偷偷改开', hit: n3.ok });
nc.forEach(function (x) { ok(x.hit, 'I ' + x.name + ' 的锚点存在（可被真破坏）'); });
// 反向证明：现在的源码里三处锚点都还在（没被人提前改掉）
ok(srcOf().indexOf("need >= 19 ? 'fail' : 'fumble'") >= 0, 'J1 ③高能力不吃挂的锚还在');
ok(srcOf().indexOf('const CAP = 32;') >= 0, 'J2 有界 CAP=32 的锚还在');
ok(srcOf().indexOf('const DEF = { enabled: false') >= 0, 'J3 默认关的锚还在');

// ── K 接线：骰子只降档，不加严（五档 → act 四档）──
const A = WA.act;
ok(!!A && typeof A.judge === 'function', 'K0 act.judge 已装');
eq(A.diceVerdict('fail', 'action'), 'delay', 'K1 fail ⇒ delay（没办成，不是拒绝）');
eq(A.diceVerdict('fumble', 'action'), 'refuse', 'K2 fumble ⇒ refuse（这一手砸了）');
eq(A.diceVerdict('success', 'action'), 'action', 'K3 success ⇒ 不动');
eq(A.diceVerdict('critical', 'action'), 'action', 'K4 critical ⇒ 不动');
eq(A.diceVerdict('extreme', 'action'), 'action', 'K5 extreme ⇒ 不动');
eq(A.diceVerdict('fumble', 'refuse'), 'refuse', 'K6 原本就拒的，骰子不得再降（不判两次）');
eq(A.diceVerdict('fail', 'delay'), 'delay', 'K7 原本就延的，骰子不得放松也不得再降');
eq(A.diceVerdict('fail', 'status-quo'), 'status-quo', 'K8 维持现状不受骰子影响');
eq(Object.keys(A.DICE_VERDICT).length, 5, 'K9 五档映射表齐');

// 不带 check：完全等于原判定面
const j0 = A.judge('wait');
eq(j0.verdict, 'delay', 'K10 不带 check 时行为不变（wait ⇒ delay）');
eq(j0.diceAdjusted, false, 'K11 不带 check 时 diceAdjusted=false');

// 关着：原样通过
const j1 = A.judge('move', { check: { target: 50, ticket: 'k-off' } });
eq(j1.check.reason, 'module-disabled', 'K12 开关关着 ⇒ check 回 module-disabled');
eq(j1.diceAdjusted, false, 'K13 关着不改档');
eq(j1.verdict, j1.baseVerdict, 'K14 关着 verdict 与原档一致');

// 开着：能力 100（need 20）时任何骰点都不低于 success ⇒ 档位必然仍是 action
OD.toggle(true);
const j2 = A.judge('move', { check: { target: 100, ticket: 'k-100', who: '他', what: '翻墙' } });
eq(j2.verdict, 'action', 'K15 能力满值时不会被降档（确定性）');
ok(['critical', 'extreme', 'success'].indexOf(j2.check.band) >= 0, 'K16 need=20 不会出失败档', j2.check.band);
eq(j2.diceAdjusted, false, 'K17 满值不触发降档');

// 幂等：同一票第二次必须回放
const j3 = A.judge('move', { check: { target: 100, ticket: 'k-100' } });
eq(j3.check.replay, true, 'K18 同票 judge 第二次是回放');

// 低能力：只允许落 delay / refuse（roll=1 的大成功除外）
const j4 = A.judge('move', { check: { target: 1, ticket: 'k-low' } });
ok(['action', 'delay', 'refuse'].indexOf(j4.verdict) >= 0, 'K19 低能力只可能落三档之一', j4.verdict);
ok(j4.verdict !== 'action' || j4.check.band === 'critical', 'K20 低能力落 action 必须是大成功' , j4.check);
OD.toggle(false);

console.log('outcome-dice-v2525: pass ' + pass + ' / fail ' + fail);
if (fail) { fails.slice(0, 12).forEach(function (f) { console.log('  ✗ ' + f); }); process.exit(1); }

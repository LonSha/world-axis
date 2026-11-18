#!/usr/bin/env node
// WorldAxis tests/worldbounds-batch6-v2524.js -- V29 批六（EXV29-31～36）专锁
//
// 治的病
//   玩家不在、来得太密、跑得太长，世界都会乱：离线三十天回来一次补一堆事件；回来第一段不交代；
//   想让世界定住却没有开关；同一时刻几件事并列堆砌；长档压缩连因果一起删；一局三百楼没人报长度。
//
// 本锁钉住六段（每段都带负控制）：
//   R 世界不打盹：事件数有上界；超了就报该留几件（读数，不拦）。
//   S 回来的第一句：**只认** worldBrief.oneLine；拿不到就拒，不编空话。
//   T 世界的暂停权：定住期间自转产出恒 0；复原 `makeup:false`（不补涨）。
//   U 同一时刻多事：rank 严格递增；同刻同权按入参顺序（不掷骰）。
//   V 长档取舍：可以压，但被因果/承诺引用的楼层压掉 ⇒ 拒收（不许连根删）。
//   W 一局的长度：给读数与提示，**不阻断**；配合 finale 的 ready 读数。
'use strict';
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
const WO = WA.worldBounds;

// ── R：EXV29-31 世界不打盹 ──
ok(!!WO && typeof WO.away === 'function', 'R0 worldBounds 已装');
eq(WO.away({ days: 3 }).reason, 'missing-fields', 'R1 不说几件 ⇒ 算不出上界');
const r1 = WO.away({ days: 3, events: 3 });
eq(r1.exceed, false, 'R2 三天三件：在界内');
eq(r1.keep, 3, 'R2b 该留几件说得出', r1.keep);
const r2 = WO.away({ days: 1, events: 30 });
eq(r2.exceed, true, 'R3 **一次补一堆必被点名**（负控制）');
eq(r2.keep, 1, 'R3b 一天的界是 1 件', r2.keep);
ok(/世界不会等你回来才动/.test(r2.line), 'R4 一句话说清为什么不补', r2.line);
const r3 = WO.away({ days: 90, events: 90 });
eq(r3.allowed, WO.AWAY_MAX, 'R5 再久也有封顶（AWAY_MAX）', r3.allowed);

// ── S：EXV29-32 回来的第一句 ──
const s0 = WO.returning({ days: 5 });
ok(s0.ok === false, 'S1 自转日志没有可交代的事时**拒收**（不编空话，负控制）', s0.reason);
ok(s0.reason === 'not-happened' || s0.reason === 'module-missing', 'S1b 拒收码在既有分类里', s0.reason);
const origOneLine = WA.worldBrief.oneLine;
WA.worldBrief.oneLine = function () { return { ok: true, line: '你走后第三日，城东水门关了。' }; };
const s1 = WO.returning({ days: 5 });
eq(s1.ok, true, 'S2 有读数就交得出第一句');
eq(s1.from, 'worldBrief.oneLine', 'S3 **只认 worldBrief.oneLine**（来源可查）', s1.from);
ok(/水门/.test(s1.line), 'S4 交出来的是日志里的那一句', s1.line);
WA.worldBrief.oneLine = origOneLine;

// ── T：EXV29-33 世界的暂停权 ──
const t0 = WO.selfTick({ events: 4 });
eq(t0.produced, 4, 'T1 没暂停时自转照常', t0.produced);
eq(WO.resume().reason, 'not-happened', 'T2 没定住过就谈不上复原');
const t1 = WO.pause({ by: '玩家' });
eq(t1.paused, true, 'T3 定住了');
eq(WO.pause({ by: '玩家' }).reason, 'already', 'T3b 重复定住 ⇒ already（负控制）');
const t2 = WO.selfTick({ events: 6 });
eq(t2.produced, 0, 'T4 **定住期间自转产出恒 0**（负控制）', t2.produced);
eq(t2.suppressed, 6, 'T4b 要发生的先压着，如实报数');
ok(/定住/.test(WO.buildBlock()), 'T5 注入面说得出"世界定住了"', WO.buildBlock());
const t3 = WO.resume();
eq(t3.paused, false, 'T6 复原');
eq(t3.makeup, false, 'T6b **复原不补涨**（makeup:false）');
eq(WO.selfTick({ events: 2 }).produced, 2, 'T7 复原后照常（不补之前压着的）');

// ── U：EXV29-34 同一时刻多事排序 ──
eq(WO.order({}).reason, 'missing-fields', 'U1 不给事件 ⇒ missing-fields');
const u1 = WO.order({ events: [
  { id: '丙', causeOrder: 2, weight: 5, visible: true },
  { id: '甲', causeOrder: 1, weight: 1, visible: true },
  { id: '乙', causeOrder: 1, weight: 3, visible: true },
  { id: '暗', causeOrder: 1, weight: 9, visible: false }
] });
eq(u1.ok, true, 'U2 排得出来');
eq(u1.first, '乙', 'U3 因果最先的一组里，分量最大者在前（甲权重 1 让位于乙 3）', u1.first);
const ranks = u1.rows.map(function (r) { return r.rank; });
eq(JSON.stringify(ranks), JSON.stringify([1, 2, 3, 4]), 'U4 **rank 严格递增，不并列**', ranks);
const u2 = WO.order({ events: [
  { id: 'a', causeOrder: 1, weight: 1 },
  { id: 'b', causeOrder: 1, weight: 1 }
] });
eq(u2.first, 'a', 'U5 同刻同权按入参顺序（不掷骰）', u2.first);
ok(u2.rows.every(function (r) { return r.why.length > 0; }), 'U6 每一条都写得清为什么排这儿', u2.rows);
ok(/不并列/.test(u1.note), 'U7 一句话说清主次', u1.note);

// ── V：EXV29-35 长档取舍 ──
const v0 = WO.compress({ total: 300, keep: 100 });
eq(v0.ok, true, 'V1 压缩本身可以');
eq(v0.compressedFrom, 201, 'V2 保留区间说得出', v0.compressedFrom);
const v1 = WO.compress({ total: 300, keep: 100, chainRefs: [150], promises: [280] });
eq(v1.reason, 'bad-scope', 'V3 **被因果链引用的楼层压掉 ⇒ 拒收**（不许连根删，负控制）');
eq(v1.droppedRefs.length, 1, 'V3b 点名是哪一楼被压到了', v1.droppedRefs);
const v2 = WO.compress({ total: 300, keep: 100, chainRefs: [250], promises: [299] });
eq(v2.ok, true, 'V4 引用都在保留区 ⇒ 压得动');
eq(v2.preservedChain, 1, 'V4b 保留的因果条数可查', v2.preservedChain);
ok(/答得出/.test(v2.note), 'V5 一句话说清"为什么"还查得到', v2.note);
eq(WO.compress({ total: 10, keep: 20 }).reason, 'bad-scope', 'V6 keep 超过 total ⇒ bad-scope');

// ── W：EXV29-36 一局的长度 ──
const w0 = WO.length();
eq(w0.ok, true, 'W1 长度读得出来');
eq(w0.threshold, WO.LONG_ROUNDS, 'W2 阈值可查', w0.threshold);
eq(w0.long, false, 'W3 刚开始不算长');
WA.finale.check({ mainlineOpen: 0, debtsOpen: 0, peopleLeft: 1 });
const w1 = WO.length();
eq(w1.finaleReady, true, 'W4 与 finale 的 ready 读数对得上（配合 Y3-13）', w1.finaleReady);
ok(/不阻断/.test(w1.note), 'W5 **只是提示，不阻断玩家继续**', w1.note);
ok(typeof w1.hint === 'string' && w1.hint.length > 0, 'W6 提示不是空话', w1.hint);

if (fail) {
  console.log('FAIL ' + fail + ' / ' + (pass + fail));
  fails.slice(0, 25).forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('PASS ' + pass + '/' + pass + ' (worldbounds-batch6-v2524)');
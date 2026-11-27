#!/usr/bin/env node
// WorldAxis tests/dice-wiring-v2611.js -- R286 DWR-1 专锁：判定票的四个面（v2.611.0）
//
// 治的病：骰子「装好了，但没人用」。量出来的现场是三处断线，一处比一处硬：
//
//   ① **票从来没被递出去**。`act.judge` 在产品侧零调用，而所有真实入口
//      （agency / liaison / story-window / opportunity / rehearsal）都只调
//      `add` + `admit`，没有一个构造 `opts.check` —— 比「没人调 judge」更硬：
//      不是别人不接电话，是电话根本没拨。
//   ② **掷了也不进正文**。`outcomeDice.buildBlock()` 没有任何调用点（不在
//      `render/inject.js` 的 SOURCES 里）—— 模型照旧把「撬开了锁」写下去，
//      而账本里明明躺着一个 fumble。
//   ③ **有账本、没读口**。`outcomeDice` / `diceLog` 在 `tool-diag` 里 grep 零命中，
//      于是「装好了从不拦路」与「根本没装」在维护者面上长得一模一样。
//
// 本锁钉四组：
//   A 静态（四处接线都在、且判据真的读源码）
//   B 写口行为（只在骰子真降档时拦 / 关着逐字不变 / 世界零变化 / 一次一票）
//   C 读数（tool-diag 两栏不混、开关关着说真话、注入面真接上）
//   D 玩家声明面（story-window 递票、换上就换票、wait/defer 不掷）
//   N 负控（真源码破坏 → 同款判据必须红）
//
// 一条重要的反面纪律：**默认关不是缺陷**。`outcomeDice.DEF.enabled === false` 是
//   v2.524.0 立项时的刻意决策，属于「玩家侧能力开关」八台一族，与 v2.412.0 的全开策略
//   并存不矛盾。本锁不要求它改默认为 true —— 只要求「打开后真的通电」。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const codeFace = require('./inventory.js').codeFace;
const freshApi = function (opts) { return require('./ui-gate-sync.js').fresh(opts).WA; };

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; return true; }
  fail++; fails.push(name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)));
  return false;
}
function eq(a, b, name) { return ok(a === b, name, { got: a, want: b }); }
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function face(rel) { return codeFace(src(rel)); }

// ── 夹具：一个人 + 一个 active 目标。刻意不走 life 的写入口（理由同 act-b1 的 seed）──
const TAG = 'dice-wiring';
function seed(WA) {
  WA.store.transact(function (d) {
    d.people = { 'p_测试': { id: 'p_测试', name: '测试', knowledge: {}, resources: {},
      life: { goals: [{ id: 'g_测试', text: '测试目标', status: 'active' }], schedule: [] } } };
    d.acts = { rows: [], res: [] };
    d.diceLog = [];
    d.diceSkills = {};
  }, TAG + ':seed');
  WA.act.setSettings({ enabled: true, maxActs: 24, maxRun: 4, defaultDurationMs: 60000 });
}
// 骰子定死：die=20（需求 = target/5），rand.int 固定成交给的骰点
function diceOn(WA, roll) {
  WA.outcomeDice.saveSettings({ enabled: true, die: 20 });
  WA.rand.int = function () { return roll; };
}
function diceOff(WA) {
  WA.outcomeDice.saveSettings({ enabled: false, die: 100 });
}
const SPEC = { kind: 'work', goalId: 'g_测试', text: '撬锁' };
function specWith(ticket, target) {
  return Object.assign({}, SPEC, { check: { target: target || 50, ticket: ticket, who: '测试', what: '撬锁' } });
}
function rows(WA) {
  const st = WA.store.get() || {};
  return (st.acts && Array.isArray(st.acts.rows)) ? st.acts.rows : [];
}

// ═════════ A 静态：四处接线 ═════════
{
  const A = face('engines/act.js');
  ok(A.indexOf('judge(kind, { check: chk })') >= 0, 'A1 act.add 真的把票交给 judge（真代码面）');
  ok(A.indexOf('jr.diceAdjusted === true && (jr.verdict === ') >= 0,
    'A2 只在骰子真降档时拦（不拿「原本就 refuse/delay 的种类」开刀）');
  ok(A.indexOf('dice: dice') >= 0, 'A3 行上留票字段 dice');
  ok(A.indexOf('diceTickets') >= 0 && A.indexOf('diceRefused') >= 0, 'A4 两栏计数各自成栏');
  ok(A.indexOf('S.diceTickets++') >= 0 && A.indexOf('S.diceRefused++') >= 0, 'A5 两栏都真被累加');
  // 次序：拒收必须在 mutate 之前（世界零变化）
  const Araw = src('engines/act.js');
  const iJudge = A.indexOf('jr.diceAdjusted === true && (jr.verdict === ');
  const iMutate = Araw.indexOf("'act:add'");
  ok(iJudge >= 0 && iMutate > iJudge, 'A6 拒收发生在落盘之前（judge 在 act:add 事务前）');

  const S = face('engines/story-window.js');
  ok(S.indexOf('CHOICE_SKILL') >= 0, 'A7 story-window 有选择→技能映射表（集中一处，不散在分支里）');
  const SrcS = src('engines/story-window.js');
  ok(SrcS.indexOf("find: '\u4fa6\u67e5'") >= 0, 'A8 映射表从 find 开始（四入口逐一给值）');
  ok(S.indexOf('od.check({') >= 0, 'A9 递票走 outcomeDice.check（不自己造骰子）');
  ok(SrcS.indexOf("ticket: 'sw:'") >= 0, 'A10 票号带 sw: 前缀（可反推回窗口与选择）');

  const T = face('engines/tool-diag.js');
  ok(T.indexOf('function secOutcomeDice') >= 0, 'A11 tool-diag 有 secOutcomeDice 节');
  ok(T.indexOf('outcomeDice: secOutcomeDice(),') >= 0, 'A12 该节真接进 collect（不是只定义在文件里）');
  ok(T.indexOf('writeTickets') >= 0 && T.indexOf('writeRefused') >= 0, 'A13 读面两栏不合并');

  const I = src('render/inject.js');
  const a = I.indexOf('const SOURCES = [');
  const b = I.indexOf('];', a);
  const seg = I.slice(a, b);
  ok(seg.indexOf("'outcomeDice'") >= 0, 'A14 判定票在注入源表里（否则掷了也不进正文）');
  ok(I.indexOf('outcomeDice: true }') >= 0, 'A15 注入源默认值同批登记');
  ok(I.indexOf("outcomeDice: '\u5224\u5b9a\u7968'") >= 0, 'A16 SRC_NAME 有中文显示名');
  ok(I.indexOf('if (vis.outcomeDice && WA.outcomeDice)') >= 0, 'A17 注入分支真读可见性开关（不是只判模块在不在）');
  ok(src('ui/panel.js').indexOf("outcomeDice: '\u5224\u5b9a\u7968'") >= 0, 'A18 面板 VIS_NAMES 不裸露英文键');

  // 八台默认关里唯一口径缺失的那一台：character-drive
  const C = src('engines/character-drive.js');
  const CL = C.split('\n');
  const li = CL.findIndex(function (x) { return x.trim().indexOf('const DEF = { enabled: false') === 0; });
  ok(li >= 0, 'A19 character-drive 的 DEF 行在（锚点未改名）');
  const prev = li > 0 ? CL.slice(Math.max(0, li - 3), li).join(' ') : '';
  ok(/\u9ed8\u8ba4\u5173/.test(prev), 'A20 character-drive 补上了默认关口径（八台里唯一没说清的一台）', prev.slice(0, 60));
}

// ═════════ B 写口行为 ═════════
{
  const W = freshApi(); seed(W); diceOff(W);
  const before = W.act.stat().diceTickets;
  const r = W.act.add('测试', specWith('t-off'));
  eq(r.ok, true, 'B1 关着时带票登记照旧成功（不许因票而拒）');
  eq(rows(W)[0].dice, null, 'B2 关着时行上不留票（null，不是空对象）');
  eq(W.act.stat().diceTickets, before, 'B3 关着时票面计数不动');
  eq(W.outcomeDice.view().total, 0, 'B4 关着时 diceLog 一票不记');
}
{
  const W = freshApi(); seed(W); diceOn(W, 10);   // need=10，掷 10 ⇒ success
  const r = W.act.add('测试', specWith('t-ok'));
  eq(r.ok, true, 'B5 掷成（success）照常登记');
  const row = rows(W)[0];
  ok(!!row.dice, 'B6 行上有票（可复查到具体骰点）');
  eq(row.dice && row.dice.band, 'success', 'B7 票上记的是 success');
  eq(row.dice && row.dice.roll, 10, 'B8 票上记的是骰点 10');
  eq(row.dice && row.dice.ticket, 't-ok', 'B9 票号跟着行进台账');
  eq(W.act.stat().diceTickets, 1, 'B10 diceTickets +1');
  eq(W.act.stat().diceRefused, 0, 'B11 diceRefused 不动（掷了、放行 ≠ 掷了、没成）');
}
{
  const W = freshApi(); seed(W); diceOn(W, 11);   // need=10，掷 11 ⇒ fail ⇒ delay
  const n0 = rows(W).length;
  const r = W.act.add('测试', specWith('t-fail'));
  eq(r.ok, false, 'B12 fail 被拦下');
  eq(r.reason, 'dice-delay', 'B13 fail 单向降成 delay（不是 refuse：没办成 ≠ 砸了）');
  eq(r.band, 'fail', 'B14 拒收读数带回原始档位');
  eq(rows(W).length, n0, 'B15 被拦时**世界零变化**（一行都没多）');
  eq(W.act.stat().diceRefused, 1, 'B16 diceRefused +1');
  eq(W.outcomeDice.view().total, 1, 'B17 掷过的那一票留在账本里（掷是不可撤销的事实）');
}
{
  const W = freshApi(); seed(W); diceOn(W, 20);   // need=10，掷 20 ⇒ fumble ⇒ refuse
  const r = W.act.add('测试', specWith('t-fumble'));
  eq(r.ok, false, 'B18 fumble 被拦下');
  eq(r.reason, 'dice-refuse', 'B19 fumble 降成 refuse（办砸了）');
  eq(r.baseVerdict, 'action', 'B20 降档前的原档如实带出');
}
{
  // 一次一票：同一张票读到 fail 也刷不成 success
  const W = freshApi(); seed(W); diceOn(W, 11);
  const r1 = W.act.add('测试', specWith('t-same'));
  eq(r1.reason, 'dice-delay', 'B21 第一次 fail');
  W.rand.int = function () { return 10; };            // 换成 success 的骰点
  const r2 = W.act.add('测试', specWith('t-same'));
  eq(r2.ok, false, 'B22 同一张票重试仍然不成立（骰点不被重掷）');
  eq(r2.reason, 'dice-delay', 'B23 回的是首次结果（fail），不是新的 success');
  eq(W.outcomeDice.view().total, 1, 'B24 同一张票只记一条');
  const r3 = W.act.add('测试', specWith('t-new'));     // 换票
  eq(r3.ok, true, 'B25 换票 = 换行动，可以重新掷');
}
{
  // 原本就不是 action 的种类不许被骰子改严
  const W = freshApi(); seed(W); diceOn(W, 20);
  const r = W.act.add('测试', Object.assign({}, SPEC, { kind: 'wait' },
    { check: { target: 50, ticket: 't-wait', who: '测试', what: '等' } }));
  eq(r.ok, true, 'B26 wait 的基档本来就是 delay，骰子不许把它判成 refuse');
  const wr = rows(W)[0].dice;
  eq(wr && wr.verdict, 'delay', 'B27 wait 的档位仍是 delay（没被改判）');
  eq(wr && wr.adjusted, false, 'B28 票上如实记 adjusted:false（掷了，但没资格改这一档）');
}

// ═════════ C 读数 ═════════
{
  const W = freshApi(); seed(W); diceOn(W, 11);
  W.act.add('测试', specWith('t-diag'));
  const c = W.toolDiag.collect();
  const d = c.outcomeDice;
  ok(!!d && d.loaded === true, 'C1 tool-diag 有判定票节');
  eq(d && d.enabled, true, 'C2 节里报开关状态');
  eq(d && d.writeTickets, W.act.stat().diceTickets, 'C3 writeTickets 与 act 侧同数（不另算一套）');
  eq(d && d.writeRefused, W.act.stat().diceRefused, 'C4 writeRefused 与 act 侧同数');
  eq(d && d.total, 1, 'C5 账本票数');
  eq(d && d.closedLoop, true, 'C6 开关开着且写口收到票 ⇒ closedLoop true');
  ok(Array.isArray(d && d.recent) && d.recent.length === 1 && d.recent[0].band === 'fail',
    'C7 最近票里带档位（复现得到）');
}
{
  const W = freshApi(); seed(W); diceOff(W);
  const c = W.toolDiag.collect().outcomeDice;
  eq(c.enabled, false, 'C8 关着时如实报 false');
  eq(c.closedLoop, false, 'C9 关着时 closedLoop false');
  ok(/\u8bf4\u4e86\u5c31\u6210/.test(c.note || ''), 'C10 关着的 note 说清「回到说了就成」', c.note);
  eq(W.outcomeDice.buildBlock(), '', 'C11 关着时注入面零 token');
}
{
  const W = freshApi(); seed(W); diceOn(W, 10);
  W.act.add('测试', specWith('t-block'));
  const blk = W.outcomeDice.buildBlock();
  ok(blk.indexOf('\u3010\u5224\u5b9a\u3011') === 0, 'C12 开着且有票时注入面以【判定】开头（这一块以前没人取）', blk);
}

// ═════════ D 玩家声明面递票 ═════════
{
  const W = freshApi(); seed(W); diceOn(W, 11);
  const o = W.storyWindow.open({ id: 'w-d1' });
  eq(o.ok, true, 'D1 窗口开得起来');
  const id = o.window.id;
  const r = W.storyWindow.choose(id, 'find', { person: '测试', goalId: 'g_测试' });
  eq(r.ok, false, 'D2 掷成 fail 时 choose 不假装「已安排」');
  eq(r.reason, 'dice-fail', 'D3 拒收码带判定来源（dice-*）');
  eq(r.check && r.check.band, 'fail', 'D4 判据原文带回给调用方');
  eq(W.storyWindow.current().choice && W.storyWindow.current().choice.id, undefined,
    'D5 没写 choice（窗口没被锁死）');
  eq(W.outcomeDice.view().total, 1, 'D6 票进了账本');
  const r2 = W.storyWindow.choose(id, 'find', { person: '测试', goalId: 'g_测试' });
  eq(r2.reason, 'dice-fail', 'D7 同一窗口同一选择重按 → 同一结果（一次一票）');
  eq(W.outcomeDice.view().total, 1, 'D8 不产生第二票');
  // 换选择 = 换票
  const w = W.storyWindow.choose(id, 'wait', { person: '测试', goalId: 'g_测试' });
  eq(w.reason === 'dice-fail' || w.reason === 'dice-fumble', false, 'D9 wait 不掷骰（不是「要不要成」的事）');
  eq(W.outcomeDice.view().total, 1, 'D10 wait 一票不记');
}
{
  const W = freshApi(); seed(W); diceOn(W, 10);
  // 摘掉 storyChoice：让 find 落到 act 写口。本组测的是「掷成之后照常委托」，
  //   不是 storyChoice 的分支选择 —— 不摘掉会测到另一条链（那是别的锁的事）。
  const SC = W.storyChoice; W.storyChoice = null;
  const o = W.storyWindow.open({ id: 'w-d2' });
  const id = o.window.id;
  const r = W.storyWindow.choose(id, 'find', { person: '测试', goalId: 'g_测试' });
  W.storyChoice = SC;
  eq(r.ok, true, 'D11 掷成时照常委托给 owner');
  const ch = W.storyWindow.current().choice;
  ok(!!(ch && ch.dice), 'D12 窗口的 choice 上留下票（可复查）');
  eq(ch && ch.dice && ch.dice.band, 'success', 'D13 票上记 success');
  eq(ch && ch.dice && ch.dice.skill, '\u4fa6\u67e5', 'D14 票上记技能名');
}
{
  const W = freshApi(); seed(W); diceOff(W);
  const o = W.storyWindow.open({ id: 'w-d3' });
  const r = W.storyWindow.choose(o.window.id, 'find', { person: '测试', goalId: 'g_测试' });
  eq(r.reason === 'dice-fail' || r.reason === 'dice-fumble', false, 'D15 关着时 choose 逐字不变（零行为差）');
  const ch = W.storyWindow.current().choice;
  ok(!(ch && ch.dice), 'D16 关着时 choice 上不多出 dice 字段');
}

// ═════════ N 负控：真源码破坏 → 同款判据必须红 ═════════
{
  function broke(rel, from, to) {
    const raw = src(rel);
    if (raw.split(from).length - 1 !== 1) return { ok: false, why: 'anchor-not-unique' };
    return { ok: true, patched: raw.replace(from, to) };
  }
  const nc = [];
  // N1 去掉「只在真降档时拦」的判断 ⇒ A2 判据必须断
  const n1 = broke('engines/act.js', 'jr.diceAdjusted === true && (jr.verdict === ', '(jr.verdict === ');
  if (n1.ok) {
    const f = codeFace(n1.patched);
    nc.push({ name: 'N1 去掉 diceAdjusted 门（会拿 wait/rest 开刀）', hit: f.indexOf('jr.diceAdjusted === true && (jr.verdict === ') < 0 });
  } else nc.push({ name: 'N1 锚点不唯一', hit: false });
  // N2 把注入源拿掉 ⇒ A14 必须断
  const n2 = broke('render/inject.js', "'mixedIndex', 'outcomeDice'];", "'mixedIndex'];");
  if (n2.ok) {
    const a = n2.patched.indexOf('const SOURCES = [');
    const b = n2.patched.indexOf('];', a);
    nc.push({ name: 'N2 源表少了判定票（掷了不进正文）', hit: n2.patched.slice(a, b).indexOf("'outcomeDice'") < 0 });
  } else nc.push({ name: 'N2 锚点不唯一', hit: false });
  // N3 把写口的两栏合并成一栏 ⇒ A13 必须断
  const n3 = broke('engines/tool-diag.js', 'writeTickets: as.diceTickets || 0, writeRefused: as.diceRefused || 0,',
    'writeTickets: (as.diceTickets || 0) + (as.diceRefused || 0),');
  if (n3.ok) nc.push({ name: 'N3 两栏合并（掷了放行与掷了没成混成一个数）', hit: codeFace(n3.patched).indexOf('writeTickets') >= 0 && codeFace(n3.patched).indexOf('writeRefused') < 0 });
  else nc.push({ name: 'N3 锚点不唯一', hit: false });
  // N4 票号不带窗口 ⇒ 一次一票退化成全局一票
  const n4 = broke('engines/story-window.js', "ticket: 'sw:' + clean(windowId, 100) + ':' + choice,", "ticket: 'sw:' + choice,");
  nc.push({ name: 'N4 票号丢掉窗口（不同窗口互相回放）', hit: n4.ok });
  nc.forEach(function (x) { ok(x.hit === true, x.name); });
}

console.log('dice-wiring-v2611: pass ' + pass + ' / fail ' + fail);
if (fail) { fails.slice(0, 16).forEach(function (f) { console.log('  x ' + f); }); process.exit(1); }

#!/usr/bin/env node
// v2.156.0 SP2 专锁：候选草稿结算与提交（life · evolution · world · offline-tick · offline-return）
//   它锁的判据（按「静默失效」代价排序）：
//     ① **只修改所给草稿**：三个草稿体推进一轮时，真世界（store）与模块态读数一律不动 ——
//        丢了它，试演期就已经把世界改了，而读数上看不出「同一段推了两遍」；
//     ② **整批失败无半写**：offlineTick.tick 在副本上逐轮试演，任一轮抛错即整批作废
//        （不提交、不落批、不动基准）—— 丢了它，失败留下的是「推了一半的世界」；
//     ③ **结算袋两端**：life 的 stat 与轮转游标在试演期整体隔离（未 commit 前模块态零残留）；
//     ④ **门逐段对上**：life 的门在草稿体内部，evolution / world 的门在公开入口 ——
//        合成侧（offline-return 的 makeApply）必须逐段补门，否则「关着也推」；
//     ⑤ **成员调用约束**：rollEventsDraft / decayWindsDraft 体内用 this.*，
//        解引用成裸函数在严格模式下当场抛 —— 不是风格问题，是能不能跑的问题。
//   ── 夹具纪律（三条都是被这条线炸出来的）：
//      ① `sync.fresh()` 每次给全新 vm 上下文 ⇒ 模块态读数天然隔离，但 **store 与设置都会
//        从宿主 localStorage 载入上一轮的**，故每例前必须显式重置设置与 offlineTick 桶；
//      ② 断言「live 未变」必须**同批取比较值**（先序列化一次、事后比同一个串）——
//        现取两次会把「两次都变了同样一点」错报成「没变」；
//      ③ 断言「草稿真被改了」也要有：否则「什么都没发生」会同时满足「live 未变」，
//        令判据在真空上恒绿；
//      ④ 打桩的调用计数必须把夹具自身的读取算进去（`stepNow()` 会经 playtime.lastActive()
//         读一次 chatId，故打桩必须在取 `now` 之后）；
//      ⑤ **不得硬编码宿主聊天 id**：全量回归跑到本锁时，宿主 `ctx.chatId` 已被前面
//         章节改过且多处不还原（如 `fr2900()` 把它设成 `v2900_chat`）——硬编码 `test_chat_001`
//         会让「进门读到原聊天」这一前置在真跑环境里根本不成立（`no-baseline` ⇒ first-baseline），
//         判据于是变成对环境的断言。现场取值才与恢复编排读的是**同一个**聊天。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');

const REL_L = 'engines/life.js';
const REL_E = 'engines/evolution.js';
const REL_W = 'engines/world.js';
const REL_T = 'engines/offline-tick.js';
const REL_R = 'engines/offline-return.js';
const SELF_REL = 'tests/sp2-draft-v2156.js';

// 结算袋两端（life）：进袋 / 退袋 / 造袋 / 并回。
const ANCHOR_L1 = '    if (bag) { __bag = bag; stat = bag.stat; _turn = bag.turn; }';
const ANCHOR_L2 = '      if (bag) { __bag = prevBag; stat = prevStat; _turn = prevTurn; }';
const ANCHOR_L3 = '    return { stat: Object.assign({}, stat), fair: _fairRounds.slice(), turn: _turn };';
const ANCHOR_L4 = '    if (Array.isArray(bag.fair)) { _fairRounds.length = 0; bag.fair.forEach(function (id) { _fairRounds.push(id); }); }';
// 真跑路径走「无袋」形态（bag 为 null），与旧版逐字同径。
const ANCHOR_L5 = '      const r = tickDraft(draft, facts, null);';
// 整批试演：副本推演 → 成功后才提交；apply 不得改写结算账。
const ANCHOR_T1 = '      const candidate = copy(draft);';
const ANCHOR_T2 = '      const committed = copy(candidate);';
const ANCHOR_T3 = '        candidate.offlineTick = copy(draft.offlineTick);';
// world 的草稿体：取 now 的形态与外壳同源；门留在公开入口（tick）。
const ANCHOR_W1 = "    const now = isFinite(Number(f.now)) ? Number(f.now) : clockNow('world');";
const ANCHOR_W2 = "    if (!cfg.enabled) { S.lastReason = 'disabled'; return { ok: true, changed: 0, reason: 'disabled' }; }";
// evolution：两个草稿体被公开入口以成员形式调用（this 约束的现场表达）。
const ANCHOR_E1 = "      if (!WA.settingsBus.toBool(st.diceEnabled, true)) return [];";
const ANCHOR_E2 = '        this.rollEventsDraft(draft, results);';
const ANCHOR_E3 = '        this.decayWindsDraft(draft, decayed);';
// 合成侧逐段补门：world 段与 evolution 段。
const ANCHOR_R1 = "      if (worldOn && WA.world && typeof WA.world.tickDraft === 'function') {";
const ANCHOR_R2 = "        ? WA.settingsBus.toBool(WA.world.getSettings().enabled, true) : true;";
const ANCHOR_R3 = "        ? WA.settingsBus.toBool(WA.evolution.getSettings().diceEnabled, true) : true;";
// 第一道票据：进门比 chatId 的现场形态（切聊天 ⇒ 旧候选整批作废）。
const ANCHOR_R4 = '      if (curChatId() !== plan.chatId) {';
const ANCHOR_R5 = "        return { ok: false, reason: 'stale-chat', chatId: plan.chatId, found: curChatId() };"

function countOcc(s, sub) { return s.split(sub).length - 1; }
function fresh(ov) { return sync.fresh(ov ? { srcOverride: ov } : undefined).WA; }
function ov(file, src) { const o = {}; o[file] = src; return o; }
function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function seedPeople(d) {
  d.people = { p1: { id: 'p1', name: '甲', life: { goals: [{ text: '找水', status: 'active' }],
    commitments: [], schedule: [], lastAt: 0 } } };
}
function seedWorld(d) { d.world = { events: [{ id: 'e1', title: '集会', place: '广场', start: 0, end: 1000, status: 'planned' }] }; }
function seedEvo(d) {
  d.evolution = { events: [{ name: '冲突', type: 'conflict', stage: 'opening', stageRound: 1 }],
    winds: [{ topic: 'w1', type: 'rumor', level: 1, quietRounds: 9 }] };
}
/** 起一个干净宿主：引擎开关、时间旋钮、三张账全部**现取重置**（宿主会载入上一轮）。 */
function boot(seed, srcOv) {
  const WA = fresh(srcOv);
  WA.store.init();
  WA.life.setSettings({ enabled: true });
  WA.world.setSettings({ enabled: true });
  WA.evolution.setSettings({ diceEnabled: true });
  WA.offlineTick.setSettings({ enabled: true, stepMs: 60000, minGapMs: 1000 });
  WA.offlineReturn.setSettings({ enabled: true });
  try { WA.mainWin.localStorage.removeItem('worldaxis_playtime_v1'); } catch (e) {}
  WA.store.transact(function (d) {
    d.offlineTick = { anchors: [], batches: [], skips: [], lastSettledAt: null, rounds: 0 };
    d.lastInjection = null;
  }, 'sp2-v2156:reset');
  if (seed) WA.store.transact(seed, 'sp2-v2156:seed');
  try { WA.playtime.touch({ force: true }); } catch (e) {}
  return WA;
}
function stepNow(WA, mult) {
  const st = WA.offlineTick.getSettings();
  return WA.playtime.lastActive().at + st.stepMs * mult;
}
function quietApply(dd, i) {
  dd.world = dd.world || {}; dd.world.marker = 'touched';
  if (i === 1) throw new Error('boom');
  return { ok: true, touched: [] };
}

// ── A 结构面 ──────────────────────────────────────────────────────────
function runA(a) {
  const L = read(REL_L), E = read(REL_E), W = read(REL_W), T = read(REL_T), R = read(REL_R);

  a(countOcc(L, ANCHOR_L1) === 1 && countOcc(L, ANCHOR_L2) === 1,
    'v2156/sp2 A1: 结算袋进/退两锚点各恰中 1 次（进 ' + countOcc(L, ANCHOR_L1) + ' / 退 ' + countOcc(L, ANCHOR_L2) + '）—— 退袋在 finally，故失败也不把模块态留在袋里');
  a(countOcc(L, ANCHOR_L3) === 1 && countOcc(L, ANCHOR_L4) === 1,
    'v2156/sp2 A2: 造袋（stat 浅拷贝 + fair 副本 + 游标）与并回（原地改回，保持 stat 引用同一性）各恰中 1 次');
  a(countOcc(L, ANCHOR_L5) === 1,
    'v2156/sp2 A3: 真跑入口走**无袋**形态（tickDraft(draft, facts, null) 恰中 1 次）—— 真跑与试演共用同一段结算逻辑');
  a(countOcc(L, '    tickDraft: tickDraft, makeBag: makeBag, commitBag: commitBag,') === 1,
    'v2156/sp2 A4: 三件套一并导出（少导一个，离线批就只能另写一套推演）');
  const Lbody = (function () {
    const i = L.indexOf('  function tickDraft(draft, facts, bag) {');
    const j = L.indexOf('\n  function tick(', i);
    return (i < 0 || j < 0) ? null : L.slice(i, j);
  })();
  a(Lbody !== null && countOcc(Lbody, 'if (!cfg.enabled)') === 1,
    'v2156/sp2 A5: life 的门在**草稿体内部**（tickDraft 自己判 disabled 并早退）—— 合成侧无需补，也不得重复补');

  a(countOcc(T, ANCHOR_T1) === 1 && countOcc(T, ANCHOR_T2) === 1,
    'v2156/sp2 A6: 整批试演的两端（candidate 副本 / committed 副本）各恰中 1 次 —— 提交前一切改动都还在副本上');
  a(countOcc(T, ANCHOR_T3) === 1,
    'v2156/sp2 A7: 逐轮结束后把结算账**抄回候选**（apply 不得释放锚或改写批次账）恰中 1 次');

  a(countOcc(W, ANCHOR_W2) === 1,
    'v2156/sp2 A8: world 的门在**公开入口 tick** 里恰中 1 次（关闭时现场早退，不留半推）');
  const Wbody = (function () {
    const i = W.indexOf('  function tickDraft(draft, opts) {');
    const j = W.indexOf('\n  function buildBlock()', i);
    return (i < 0 || j < 0) ? null : W.slice(i, j);
  })();
  a(Wbody !== null && Wbody.indexOf('enabled') < 0 && countOcc(Wbody, ANCHOR_W1) === 1,
    'v2156/sp2 A9: world 的草稿体**不含任何开关判定**（门全在外壳）且取 now 的形态与外壳同源 —— 三段的门三种形状，逐段对上才不会「关着也推」');

  a(countOcc(E, ANCHOR_E1) === 1 && countOcc(E, ANCHOR_E2) === 1 && countOcc(E, ANCHOR_E3) === 1,
    'v2156/sp2 A10: evolution 的骰子门留在公开入口、两个草稿体由入口**以成员形式**调用（各恰中 1 次）');
  a(countOcc(E, 'const evo = WA.evolution') === 0 && countOcc(E, 'const ev = WA.evolution') === 0,
    'v2156/sp2 A11: 防回归 —— 不得把 evolution 解引用成局部别名后调草稿体（丢 this 且成员访问路径从文本上消失）');

  a(countOcc(R, ANCHOR_R1) === 1 && countOcc(R, ANCHOR_R2) === 1 && countOcc(R, ANCHOR_R3) === 1,
    'v2156/sp2 A12: 合成侧给 world 段与 evolution 段**逐段补门**（worldOn / diceOn 各恰中 1 次）—— v2.156.0 收口自纠的那处漏门');
  const Rbody = (function () {
    const i = R.indexOf('  function makeApply(now) {');
    const j = R.indexOf('\n  function settle(', i);
    return (i < 0 || j < 0) ? null : R.slice(i, j);
  })();
  a(Rbody !== null && countOcc(Rbody, 'WA.evolution.rollEventsDraft(draft') === 1
    && countOcc(Rbody, 'WA.evolution.decayWindsDraft(draft') === 1
    && countOcc(Rbody, 'WA.world.tickDraft(draft') === 1,
    'v2156/sp2 A13: 四段推演全部以**命名空间成员**调用（life 一处 + evolution 两处 + world 一处）：既守 this 约束，也不让成员路径消失');

  a(countOcc(R, ANCHOR_R4) === 1 && countOcc(R, ANCHOR_R5) === 1,
    'v2156/sp2 A15: 第一道票据（进门比 chatId）与它的拒收返回各恰中 1 次 —— 切聊天后旧候选必须作废，否则拿旧票据推别人的世界');

  const self = read(SELF_REL);
  a(['ANCHOR_L1', 'ANCHOR_L2', 'ANCHOR_T1', 'ANCHOR_T2', 'ANCHOR_R1', 'ANCHOR_R2', 'ANCHOR_R4'].every(function (k) {
    return countOcc(self, k) >= 2;
  }), 'v2156/sp2 A16: 七个关键锚点常量在本文件里各至少出现 2 次（声明 + 引用）—— 引用了才谈得上核');
}

// ── B 运行时 ──────────────────────────────────────────────────────────
function runB(a) {
  // B1 导出面：三件套在场（缺一个，离线批就只能另写一套推演）
  const WA0 = fresh(); WA0.store.init();
  a(typeof WA0.life.tickDraft === 'function' && typeof WA0.life.makeBag === 'function'
    && typeof WA0.life.commitBag === 'function',
    'v2156/sp2 B1: life 的草稿体三件套（tickDraft / makeBag / commitBag）均在实际装载面在场');

  // B2–B5 结算袋两端：未 commit 模块态零残留，commit 后才并回
  const WA = boot(seedPeople);
  const bag = WA.life.makeBag();
  a(Object.keys(bag).sort().join(',') === 'fair,stat,turn',
    'v2156/sp2 B2: 袋恰接住三样（实 ' + Object.keys(bag).sort().join(',') + '）—— stat 浅拷贝 / fair 窗口副本 / 轮转游标副本');
  const ticks0 = WA.life.stat().ticks;
  const live0 = JSON.stringify(WA.store.get());
  const draft = clone(WA.store.get());
  const lr = WA.life.tickDraft(draft, { now: 1000 }, bag);
  a(lr.ok === true && lr.changed === 1 && bag.stat.ticks === ticks0 + 1 && WA.life.stat().ticks === ticks0,
    'v2156/sp2 B3: 试演期 stat 写进袋（袋 ticks ' + bag.stat.ticks + '）而**模块态不动**（仍 ' + WA.life.stat().ticks + '）');
  a(JSON.stringify(draft) !== live0 && JSON.stringify(WA.store.get()) === live0,
    'v2156/sp2 B4: 游离草稿被改写（草稿变了）而真世界**逐字节未动**（同批取值、比同一串）');
  WA.life.commitBag(bag);
  a(WA.life.stat().ticks === ticks0 + 1,
    'v2156/sp2 B5: commitBag 之后才并回（模块 ticks ' + WA.life.stat().ticks + '）—— 「没提交」与「提交了」可分');

  // B6–B7 world 草稿体：只改草稿、幂等
  const WW = boot(seedWorld);
  const wd = clone(WW.store.get());
  const c1 = WW.world.tickDraft(wd, { now: 300 });
  a(c1 === 1 && wd.world.events[0].status === 'ongoing' && WW.store.get().world.events[0].status === 'planned',
    'v2156/sp2 B6: world 草稿体按 now 把 planned 推成 ongoing（草稿内 ' + wd.world.events[0].status + '），真世界仍是 planned');
  a(WW.world.tickDraft(wd, { now: 300 }) === 0,
    'v2156/sp2 B7: 同一草稿再推一轮 changed=0（幂等）—— 「改了」与「改了但没变化」可分');

  // B8–B10 门逐段对上：三个引擎各自的关闭行为
  const GL = boot(seedPeople);
  GL.life.setSettings({ enabled: false });
  const glDraft = clone(GL.store.get());
  const glr = GL.life.tickDraft(glDraft, { now: 1000 }, null);
  a(glr.reason === 'disabled' && glr.changed === 0 && !glDraft.people.p1.life.lastDecision,
    'v2156/sp2 B8: life 关闭时草稿体当场早退 disabled（草稿里也不得留下决策）—— 门在草稿体内部');
  const GW = boot(seedWorld);
  GW.world.setSettings({ enabled: false });
  a(GW.world.tick({ now: 300 }).reason === 'disabled',
    'v2156/sp2 B9: world 关闭时公开入口拒收 disabled（门在外壳，草稿体本身不判）');
  const GE = boot(seedEvo);
  GE.evolution.setSettings({ diceEnabled: false });
  const gePublic = GE.evolution.rollEvents();
  const geDraft = clone(GE.store.get());
  const geRes = [];
  GE.evolution.rollEventsDraft(geDraft, geRes);
  a(gePublic.length === 0 && geRes.length === 1,
    'v2156/sp2 B10: evolution 关闭时公开入口返回空（' + gePublic.length + '），而草稿体本身**不判门**（直接调仍有 ' + geRes.length + ' 条）—— 这正是合成侧必须自己补门的原因');

  // B11–B12 成员调用约束（不是风格问题）
  const EM = boot(seedEvo);
  const emDraft = clone(EM.store.get());
  const emRes = [];
  EM.evolution.rollEventsDraft(emDraft, emRes);
  let threw = null;
  try { const bare = EM.evolution.rollEventsDraft; bare(clone(EM.store.get()), []); }
  catch (e) { threw = e.message; }
  a(emRes.length === 1 && threw !== null && String(threw).indexOf('getMaxFails') >= 0,
    'v2156/sp2 B11: 成员调用成功（' + emRes.length + ' 条），而**裸函数调用当场抛**（' + String(threw).slice(0, 40) + '）—— this 约束是硬的');
  const dc = [];
  EM.evolution.decayWindsDraft(clone(EM.store.get()), dc);
  a(dc.length === 1, 'v2156/sp2 B12: decayWindsDraft 成员调用让过期风声消散（' + dc.length + ' 条）');

  // B13–B15 整批失败无半写（在真事务里跑；事务会回滚，故另用**游离草稿**证「副本本身也没留下半推」）
  const WT = boot(seedWorld);
  const freeDraft = clone(WT.store.get());
  freeDraft.offlineTick.lastSettledAt = 0;
  const throwOut = WT.offlineTick.tick(freeDraft, { now: 600000, apply: quietApply });
  a(throwOut && throwOut.ok === false && throwOut.reason === 'apply-throw' && throwOut.applied === false
    && throwOut.rounds === 0 && throwOut.attemptedRounds === 2,
    'v2156/sp2 B13: 第二轮抛错 ⇒ 整批如实拒收（apply-throw，rounds=0，试到第 ' + (throwOut && throwOut.attemptedRounds) + ' 轮）');
  a((freeDraft.world || {}).marker === undefined,
    'v2156/sp2 B14: 失败批**零落地**：逐轮试演改的是副本，副本被弃用后连 marker 都没进真世界');
  a(freeDraft.offlineTick.lastSettledAt === 0 && freeDraft.offlineTick.batches.length === 0,
    'v2156/sp2 B15: 失败批不落账、不动基准（基准仍 ' + freeDraft.offlineTick.lastSettledAt + '，批次 ' + freeDraft.offlineTick.batches.length + ' 条）');

  // B16 同一份草稿可反复试演：候选由入参决定，模块无隐藏态
  const WD = boot();
  const hd = clone(WD.store.get());
  hd.offlineTick.lastSettledAt = 0;
  const h1 = WD.offlineTick.tick(hd, { now: 600000, apply: function () { return { ok: true, touched: [] }; } });
  const h2 = WD.offlineTick.tick(hd, { now: 1200000, apply: function () { return { ok: true, touched: [] }; } });
  a(h1.rounds === 10 && h2.rounds === 10 && hd.offlineTick.batches.length === 2 && hd.offlineTick.lastSettledAt === 1200000,
    'v2156/sp2 B16: 同一份草稿连推两次各得一轮批（' + h1.rounds + '/' + h2.rounds + '，批次 ' + hd.offlineTick.batches.length + ' 条）—— 候选完全由入参决定，不藏在模块里');

  // B17 合成侧补门（现场）：世界织体关着时，离线批不得把共同日程推成 done
  const WB = boot(seedWorld);
  WB.world.setSettings({ enabled: false });
  WB.offlineReturn.recover({ now: stepNow(WB, 2) });
  const offRun = WB.offlineReturn.recover({ now: stepNow(WB, 3) });
  a(offRun.ok === true && offRun.applied === true && WB.store.get().world.events[0].status === 'planned',
    'v2156/sp2 B17: 世界织体关着时离线批仍如实结算（rounds ' + offRun.rounds + '）但共同日程**保持在 planned** —— 合成侧的世界门在位（v2.156.0 收口自纠的现场）');

  // B18 切聊天 ⇒ 旧候选整批作废（第一道票据；现场：进门读到原聊天，事务前复核已切换）
  //   夹具纪律（第 4 条）：**打桩的调用计数必须把夹具自身的读取算进去** —— stepNow() 会经
  //   playtime.lastActive() 读一次 chatId；若把它留在打桩之后，「进门那次」就被夹具自己吃掉了
  //   （实测：call#1 归 stepNow、recover 只拿到 other_chat ⇒ 整个 recover 被当成另一聊天的首见）。
  const WC = boot(seedWorld);
  WC.offlineReturn.recover({ now: stepNow(WC, 2) });
  const batches0 = WC.store.get().offlineTick.batches.length;
  const now3 = stepNow(WC, 3);
  const realChatId = WC.store.chatId;
  const own = WC.store.chatId();      // 现场取（见锁头夹具纪律 ⑤）
  let calls = 0;
  WC.store.chatId = function () { calls++; return calls === 1 ? own : 'other_chat'; };
  const staleRun = WC.offlineReturn.recover({ now: now3 });
  WC.store.chatId = realChatId;
  a(staleRun.ok === false && staleRun.reason === 'stale-chat' && WC.offlineReturn.stat().staleTickets >= 1
    && WC.store.get().offlineTick.batches.length === batches0,
    'v2156/sp2 B18: 进门读到原聊天、复核时已切换 ⇒ 如实拒收 stale-chat 且**不落批**（' + batches0 + '→' + WC.store.get().offlineTick.batches.length + '）');
}

// ── 负控制：真源码破坏 → 加载破坏副本 → 在副本上重跑同款判据 ────────────────
function runNegative(a) {
  const srcL = read(REL_L), srcT = read(REL_T), srcR = read(REL_R);

  // N1 去掉退袋（try/finally 里的还原）⇒ 试演期的 stat 直接落进模块态
  a(countOcc(srcL, ANCHOR_L2) === 1, 'v2156/sp2 N1 前提: 退袋锚点恰中 1 次');
  const b1 = srcL.replace(ANCHOR_L2, '      if (false) { __bag = prevBag; stat = prevStat; _turn = prevTurn; }');
  a(b1 !== srcL, 'v2156/sp2 N1a: 破坏副本已生成（内存态，真源码不动）');
  const WA1 = boot(seedPeople, ov(REL_L, b1));
  const t1 = WA1.life.stat().ticks;
  const bag1 = WA1.life.makeBag();
  WA1.life.tickDraft(clone(WA1.store.get()), { now: 1000 }, bag1);
  a(WA1.life.stat().ticks === t1 + 1,
    'v2156/sp2 N1b: 去掉退袋后，**未提交**的试演已把模块读数改了（ticks ' + t1 + '→' + WA1.life.stat().ticks + '）—— 失败批无处丢弃，重试会从一个被污染的世界接着推');

  // N2 把整批试演的候选换成传进来的草稿 ⇒ 半推直接写进调用方的草稿
  a(countOcc(srcT, ANCHOR_T1) === 1, 'v2156/sp2 N2 前提: 候选副本锚点恰中 1 次');
  const b2 = srcT.replace(ANCHOR_T1, '      const candidate = draft;');
  a(b2 !== srcT, 'v2156/sp2 N2a: 破坏副本已生成');
  const WA2 = boot(null, ov(REL_T, b2));
  const d2 = clone(WA2.store.get());
  d2.offlineTick.lastSettledAt = 0;
  const r2 = WA2.offlineTick.tick(d2, { now: 600000, apply: quietApply });
  a(r2.ok === false && r2.reason === 'apply-throw' && (d2.world || {}).marker === 'touched',
    'v2156/sp2 N2b: 没有副本后，失败的批把**半推直接留在了草稿上**（marker=' + (d2.world || {}).marker + '）—— 而返回值仍是「整批未落地」：读数与事实当场分家');

  // N3 拆掉合成侧的 world 门 ⇒ 「关着也推」
  a(countOcc(srcR, ANCHOR_R1) === 1, 'v2156/sp2 N3 前提: world 段门锚点恰中 1 次');
  const b3 = srcR.replace(ANCHOR_R1, "      if (WA.world && typeof WA.world.tickDraft === 'function') {");
  a(b3 !== srcR, 'v2156/sp2 N3a: 破坏副本已生成');
  const WA3 = boot(seedWorld, ov(REL_R, b3));
  WA3.world.setSettings({ enabled: false });
  WA3.offlineReturn.recover({ now: stepNow(WA3, 2) });
  const r3 = WA3.offlineReturn.recover({ now: stepNow(WA3, 3) });
  a(r3.ok === true && r3.applied === true && WA3.store.get().world.events[0].status === 'done',
    'v2156/sp2 N3b: 拆掉门后，世界织体**关着**也把共同日程推成了 ' + WA3.store.get().world.events[0].status + '（读数与正常推进长得一样）—— 用户意图被离线路径静默吞掉');

  // N4 对照：同一判据在原版上必须为真（证明 N1/N2/N3 的破坏真改了行为，不是判据本来就绿）
  const WA4 = boot(seedWorld);
  WA4.world.setSettings({ enabled: false });
  WA4.offlineReturn.recover({ now: stepNow(WA4, 2) });
  const r4 = WA4.offlineReturn.recover({ now: stepNow(WA4, 3) });
  a(r4.applied === true && WA4.store.get().world.events[0].status === 'planned',
    'v2156/sp2 N4: 同款判据在原版上为真（关着就**不推**，日程保持 planned）—— 破坏确实改变了行为');

  // N6 拆掉「切聊天复核」⇒ 旧聊天的候选被拿去推新聊天
  a(countOcc(srcR, ANCHOR_R4) === 1, 'v2156/sp2 N6 前提: 切聊天复核锚点恰中 1 次');
  const b6 = srcR.replace(ANCHOR_R4, '      if (false) {');
  a(b6 !== srcR, 'v2156/sp2 N6a: 破坏副本已生成');
  const WA6 = boot(seedWorld, ov(REL_R, b6));
  WA6.offlineReturn.recover({ now: stepNow(WA6, 2) });
  const b60 = WA6.store.get().offlineTick.batches.length;
  const real6 = WA6.store.chatId;
  const own6 = WA6.store.chatId();     // 现场取（见锁头夹具纪律 ⑤）
  let c6 = 0;
  WA6.store.chatId = function () { c6++; return c6 === 1 ? own6 : 'other_chat'; };
  const r6 = WA6.offlineReturn.recover({ now: stepNow(WA6, 3) });
  WA6.store.chatId = real6;
  a(r6.ok === true && WA6.store.get().offlineTick.batches.length > b60,
    'v2156/sp2 N6b: 拆掉复核后，切聊天也照样推（批次 ' + b60 + '→' + WA6.store.get().offlineTick.batches.length + '）—— 旧聊天的离线段被推到新聊天上，而读数与「新聊天真的离开过」长得一样');

  a(read(REL_L) === srcL && read(REL_T) === srcT && read(REL_R) === srcR,
    'v2156/sp2 N5: 真源码文件逐字未变（破坏只在内存副本与 fresh 的 vm 上下文里）');
}

function runAll(a) { runA(a); runB(a); }
module.exports = { REL_L, REL_E, REL_W, REL_T, REL_R,
  ANCHOR_L1, ANCHOR_L2, ANCHOR_L3, ANCHOR_L4, ANCHOR_L5,
  ANCHOR_T1, ANCHOR_T2, ANCHOR_T3, ANCHOR_W1, ANCHOR_W2,
  ANCHOR_E1, ANCHOR_E2, ANCHOR_E3, ANCHOR_R1, ANCHOR_R2, ANCHOR_R3, ANCHOR_R4, ANCHOR_R5,
  runA, runB, runAll, runNegative };

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };
  try { runAll(a); } catch (e) { fail++; console.log('  ✗ 抛出：' + e.message + '\n' + String(e.stack).split('\n').slice(1, 4).join('\n')); }
  try { runNegative(a); } catch (e) { fail++; console.log('  ✗ 负控制抛出：' + e.message + '\n' + String(e.stack).split('\n').slice(1, 4).join('\n')); }
  console.log('SP2-DRAFT-V2156: pass ' + pass + ' / fail ' + fail);
  process.exit(fail ? 1 : 0);
}

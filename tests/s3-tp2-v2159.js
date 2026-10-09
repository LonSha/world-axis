#!/usr/bin/env node
// v2.159.0 专锁：TP2（异步摘要 / 记忆 / 档案 / 舆情的写回归属）。
//
// ── 本锁治的病（TP2 原文）────────────────────────────────────────────
//   一批引擎在 `await apiRouter.call(...)` **之后**直接对当前 store 开事务：
//     · engines/summarizer.js   makeSmallSummary / makeBigSummary
//     · engines/pmem.js         extractRound
//     · engines/memory.js       digestRound / consolidateL1 / L2 / L3
//     · engines/opinion.js      generate / generateSandbox
//     · actors/profile.js       maintain
//   请求在 A 聊天发出、响应回来时已经是 B —— 迟到结果照写进 B 的世界。
//   缺陷形态与 TP1 同族（模块级现场不绑目标聊天），但**判据不同**：
//   TP1 的是「一次性动作绑票」，TP2 的是「在飞请求的**依赖读面**」——
//   同一聊天里这段原文被删/被编辑/换滑动，结论也已经建立在过期的输入上。
//
// ── 判据分三层（按「静默失效」代价排序）──────────────────────────────
//   ① 归属：跨聊天 / 换纪元 ⇒ 默认拒收（不可能有正当用法）。
//   ② 依赖读面：调用方给的指纹变了 ⇒ 拒收（它比全局 rev 精确 —— 见 store 注释）。
//   ③ 在飞去重：同 key 已有在飞票据 ⇒ 拒收（否则同一段被压两遍，两笔入账都合法）。
//   外加一条读数判据：被拒的写回必须**可见**（此前与「模型没返回」同形）。
//
// ── 负控制纪律（吸收 TP1 的三条实测教训）────────────────────────────
//   · 破坏点被另一条判据顶替 ⇒ 破坏点报绿（TP1 N1）。对策：多判据同破 / 摘掉偶然判据。
//   · 破坏点掉进回落分支 ⇒ 行为没变而判据过了（TP1 N2）。对策：破**函数体**，不破调用点。
//   · 缺陷被偶然判据掩盖 ⇒ 假绿（TP1 N3）。对策：夹具显式构造「只剩这一条判据」的局面。
//   本锁的偶然判据是「通道未配置（no-channel）就早退」——它会在取票**之前**把函数短路。
//   故夹具必须先 setChannel 配好 digest 通道，否则所有行为判据都测的是早退分支。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');

const REL_STORE = 'core/store.js';
const REL_SUM = 'engines/summarizer.js';
const REL_PMEM = 'engines/pmem.js';
const REL_MEM = 'engines/memory.js';
const REL_OPI = 'engines/opinion.js';
const REL_PROF = 'actors/profile.js';

// ── 锚点（每条在真源码里必须恰中 1 次）───────────────────────────────
const ANCHOR_CLAIM_DEP = 'if (c.depFn) {';
const ANCHOR_DEP_CHANGED = "return claimBlock('dep-changed'";
const ANCHOR_DUP_KEY = "return claimBlock('duplicate-inflight'";
const ANCHOR_KEY_REG = 'if (key) __claimKeys[key] = ticket;';
const ANCHOR_KEY_DROP = 'if (c.key && __claimKeys[c.key] === ticket) delete __claimKeys[c.key];';
const ANCHOR_FNV = 'function fnv1a(str) {';
const ANCHOR_RECENT_SIG = 'function recentSig(n) {';
const ANCHOR_FLOOR_SIG = 'function floorSig() {';
const ANCHOR_PEOPLE_SIG = 'function peopleSig() {';

const ANCHOR_SUM_SMALL = "WA.store.claimAsync('summarizer:small'";
const ANCHOR_SUM_BIG = "WA.store.claimAsync('summarizer:big'";
const ANCHOR_PMEM = "WA.store.claimAsync('pmem:extract'";
const ANCHOR_MEM_L0 = "claimOf('memory:digestRound'";
const ANCHOR_MEM_L1 = "claimOf('memory:consolidateL1'";
const ANCHOR_MEM_L2 = "claimOf('memory:consolidateL2'";
const ANCHOR_MEM_L3 = "claimOf('memory:consolidateL3'";
const ANCHOR_OPI_GEN = "claimOf('opinion:generate'";
const ANCHOR_OPI_SB = "claimOf('opinion:sandbox'";
const ANCHOR_PROF = "WA.store.claimAsync('profile:maintain'";

function countOcc(s, sub) { return s.split(sub).length - 1; }
function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function ov(file, src) { const o = {}; o[file] = src; return o; }

let __seq = 0;
/**
 * 起一个干净宿主：**通道配好 + 世界就绪 + 正文在场上**。
 *   为什么通道必须先配：所有消费者的第一句都是
 *   `if (!cfg.baseUrl || !cfg.model) return ...` —— 未配置时在取票之前就早退了。
 *   夹具若不配通道，后面每一条行为判据测的都是早退分支（TP1 的假绿形态：
 *   缺陷被一条偶然判据顶替，破坏点却报绿）。
 */
function boot(srcOv, chatId, chatLen) {
  if (!chatId) chatId = 'tp2_seq_' + (++__seq);
  const WA = sync.fresh(srcOv ? { srcOverride: srcOv } : {}).WA;
  try {
    const c = global.SillyTavern.getContext();
    c.chatId = chatId; c.chatMetadata = {};
    // 正文在场上：摘要/记忆/pmem 都靠它算依赖读面。给足楼层，让 range.text 非空。
    const n = chatLen || 6;
    const chat = [];
    for (let i = 0; i < n; i++) chat.push({ is_user: i % 2 === 0, mes: '第' + i + '楼正文：韩烈与沈青在北境城对饮，谈及南会水师的动向。', swipe_id: 0 });
    c.chat = chat;
  } catch (e) {}
  WA.store.init();
  WA.apiRouter.setChannel('digest', { baseUrl: 'http://tp2.test/v1', model: 'tp2-model' });
  WA.apiRouter.setChannel('observe', { baseUrl: 'http://tp2.test/v1', model: 'tp2-model' });
  return WA;
}

/** 可控 Promise：把「请求在飞」这一段**钉住**，让测试能在返回之前改世界。 */
function gate() {
  let open = null;
  const p = new Promise(function (res) { open = res; });
  return { p: p, open: function (v) { open(v); } };
}
/** 替换通道调用：返回 { calls, release } —— release(值) 放行第 n 个在飞请求。 */
function stubCall(WA, plan) {
  const calls = [];
  const orig = WA.apiRouter.call;
  WA.apiRouter.call = function (channel, msgs, opt) {
    const g = gate();
    calls.push({ channel: channel, msgs: msgs, opt: opt, gate: g });
    return g.p;
  };
  WA.apiRouter.call.__orig = orig;
  WA.apiRouter.call.__restore = function () { WA.apiRouter.call = orig; };
  return calls;
}
function restore(WA) { if (WA.apiRouter.call && WA.apiRouter.call.__restore) WA.apiRouter.call.__restore(); }
function tick(n) { return new Promise(function (r) { setTimeout(r, n || 0); }); }

/** 模拟切聊天：改宿主 chatId 后 store.init()。 */
function switchChat(WA, chatId) {
  const c = global.SillyTavern.getContext();
  c.chatId = chatId; c.chatMetadata = {};
  WA.store.init();
}
/** 世界快照：写回判据看的是「B 的世界有没有被 A 的结果污染」。 */
function snap(WA) {
  const s = WA.store.get();
  return JSON.stringify({
    l0: (s.memory && s.memory.l0 || []).length,
    l1: (s.memory && s.memory.l1 || []).length,
    small: (s.memory && s.memory.smallSummaries || []).length,
    pmem: (s.memory && s.memory.pmem || []).length,
    canon: (s.opinion && s.opinion.canon || []).length,
    sandbox: (s.opinion && s.opinion.sandbox || []).length,
    people: Object.keys(s.people || {}).sort().join(','),
    rev: s.meta && s.meta.stateRev
  });
}
/** 造人物（profile / pmem 的依赖读面要它）。 */
function seedPeople(WA, names) {
  WA.store.transact(function (root) {
    root.people = root.people || {};
    (names || ['韩烈', '沈青']).forEach(function (n, i) {
      root.people['p' + (i + 1)] = { id: 'p' + (i + 1), name: n, profile: { personality: [], worldview: [], family: [], relationships: [], memory: [] } };
    });
    root.evolution = root.evolution || {};
    root.evolution.round = 3;
  }, 'tp2:seedPeople');
}
/** 造 l0 摘要（L1 巩固的输入）。 */
function seedL0(WA, n) {
  WA.store.transact(function (root) {
    root.memory = root.memory || {};
    root.memory.l0 = root.memory.l0 || [];
    for (let i = 0; i < (n || 6); i++) root.memory.l0.push({ t: 'T' + i, s: '第' + i + '段摘要：局势推进。', refs: [] });
  }, 'tp2:seedL0');
}

// ── A 段：结构面 ────────────────────────────────────────────────
function runA(a) {
  const st = read(REL_STORE);
  const items = [
    [st, ANCHOR_CLAIM_DEP, 'A1 store 依赖读面判据锚点恰中 1 次'],
    [st, ANCHOR_DEP_CHANGED, 'A2 dep-changed 拒收码在位（比 rev 精确的那条）'],
    [st, ANCHOR_DUP_KEY, 'A3 在飞去重拒收码 duplicate-inflight 在位'],
    [st, ANCHOR_KEY_REG, 'A4 去重键登记锚点恰中 1 次'],
    [st, ANCHOR_KEY_DROP, 'A5 结算/丢弃回收去重键锚点恰中 1 次'],
    [st, ANCHOR_FNV, 'A6 内容指纹 fnv1a 收口到 store（判据住一处）'],
    [st, ANCHOR_RECENT_SIG, 'A7 近期正文指纹 recentSig 在位'],
    [st, ANCHOR_FLOOR_SIG, 'A8 楼层/滑动指纹 floorSig 在位'],
    [st, ANCHOR_PEOPLE_SIG, 'A9 人物行指纹 peopleSig 在位']
  ];
  items.forEach(function (it) {
    const n = countOcc(it[0], it[1]);
    a(n === 1, 'v2159-tp2 ' + it[2] + '（实 ' + n + '）');
  });
  // 十个消费者：每个都要有取票点（缺一个就是一个仍然裸奔的 await）
  const consumers = [
    [REL_SUM, ANCHOR_SUM_SMALL, 'A10 小纪要取票'],
    [REL_SUM, ANCHOR_SUM_BIG, 'A11 大总述取票'],
    [REL_PMEM, ANCHOR_PMEM, 'A12 主观记忆取票'],
    [REL_MEM, ANCHOR_MEM_L0, 'A13 L0 摘要取票'],
    [REL_MEM, ANCHOR_MEM_L1, 'A14 L1 巩固取票'],
    [REL_MEM, ANCHOR_MEM_L2, 'A15 L2 章节取票'],
    [REL_MEM, ANCHOR_MEM_L3, 'A16 L3 长线取票'],
    [REL_OPI, ANCHOR_OPI_GEN, 'A17 舆情取票'],
    [REL_OPI, ANCHOR_OPI_SB, 'A18 沙盒取票'],
    [REL_PROF, ANCHOR_PROF, 'A19 档案取票']
  ];
  consumers.forEach(function (it) {
    const n = countOcc(read(it[0]), it[1]);
    a(n === 1, 'v2159-tp2 ' + it[2] + '锚点恰中 1 次（实 ' + n + '）');
  });
}

// ── B 段：行为面（全部 async）──────────────────────────────────
async function runB(a) {
  // B1 指纹本身：同长度换内容必须分辨（弱化判据的正面反例）
  {
    const W = boot(null, 'tp2_sig');
    const s0 = W.store.recentSig(6);
    const c = global.SillyTavern.getContext();
    const orig1 = c.chat[1].mes;
    // 等长换内容：只把「韩烈」换成「秦昭」（其余逐字相同）—— 弱化判据（只看长度）在这里必失灵
    const sameLen = orig1.replace('韩烈', '秦昭');
    c.chat[1].mes = sameLen;
    a(sameLen.length === orig1.length && sameLen !== orig1,
      'v2159-tp2 B1a 前提：换的是**等长且不同**的内容（弱化判据在这里会失灵）');
    a(W.store.recentSig(6) !== s0, 'v2159-tp2 B1b 等长换内容 ⇒ 指纹仍变（内容指纹真在算）');
    a(W.store.recentSig(6) === W.store.recentSig(6), 'v2159-tp2 B1c 同内容 ⇒ 指纹稳定（不是每次都变）');
    const f0 = W.store.floorSig();
    c.chat[c.chat.length - 1].swipe_id = 2;
    a(W.store.floorSig() !== f0, 'v2159-tp2 B1d 换滑动 ⇒ 楼层指纹变');
    const ps0 = W.store.peopleSig();
    seedPeople(W, ['韩烈']);
    a(W.store.peopleSig() !== ps0, 'v2159-tp2 B1e 人物行变化 ⇒ 人物指纹变');
  }

  // B2 摘要：同聊天正常路径必须放行（不能把正当用法一起拒掉）
  {
    const W = boot(null, 'tp2_sum_ok');
    seedL0(W, 0);
    const calls = stubCall(W);
    const p = W.summarizer.makeSmallSummary();
    await tick();
    a(calls.length === 1, 'v2159-tp2 B2a 请求已发出（前提：通道配好，没走早退）');
    calls[0].gate.open({ small_summary: '纪要：韩烈与沈青在北境城会面，议定共同防备南会水师。' });
    const r = await p;
    restore(W);
    a(typeof r === 'string' && r.length > 0, 'v2159-tp2 B2b 同聊天写回放行（返回纪要正文）');
    a((W.store.get().memory.smallSummaries || []).length === 1, 'v2159-tp2 B2c 世界真被写入一条纪要');
    const cs = W.store.claimStat();
    a(cs.passed >= 1, 'v2159-tp2 B2d 放行已记账（passed=' + cs.passed + '）');
  }

  // B3 摘要跨聊天：A 发出 → 切到 B → 迟到结果不许写进 B（本轮主判据）
  {
    const W = boot(null, 'tp2_sum_A');
    const calls = stubCall(W);
    const p = W.summarizer.makeSmallSummary();
    await tick();
    a(calls.length === 1, 'v2159-tp2 B3a 请求已在 A 发出');
    switchChat(W, 'tp2_sum_B');
    const before = snap(W);
    calls[0].gate.open({ small_summary: '纪要：A 聊天的一段剧情。' });
    const r = await p;
    restore(W);
    a(r === null, 'v2159-tp2 B3b 跨聊天迟到结果被拒（返回 null，实 ' + JSON.stringify(r) + '）');
    a(snap(W) === before, 'v2159-tp2 B3c B 的世界逐字不变（A 的纪要没落进 B）');
    a((W.store.get().memory.smallSummaries || []).length === 0, 'v2159-tp2 B3d B 没有多出纪要');
    const cs = W.store.claimStat();
    a(cs.blocked >= 1 && cs.byReason['foreign-chat'] >= 1,
      'v2159-tp2 B3e 拒收归因可见（foreign-chat ×' + (cs.byReason['foreign-chat'] || 0) + '）');
  }

  // B4 依赖读面：同聊天但这段原文被改 ⇒ 结论建立在过期输入上，必须拒收
  {
    const W = boot(null, 'tp2_sum_dep');
    const calls = stubCall(W);
    const p = W.summarizer.makeSmallSummary();
    await tick();
    const c = global.SillyTavern.getContext();
    c.chat[c.chat.length - 1].mes = '改过的末楼正文：南会水师夜袭北境城，火光冲天。';
    calls[0].gate.open({ small_summary: '纪要：基于旧正文的结论。' });
    const r = await p;
    restore(W);
    a(r === null, 'v2159-tp2 B4a 依赖读面已变 ⇒ 拒收（实 ' + JSON.stringify(r) + '）');
    a((W.store.get().memory.smallSummaries || []).length === 0, 'v2159-tp2 B4b 过期的纪要没进世界');
    const cs = W.store.claimStat();
    a(cs.byReason['dep-changed'] >= 1, 'v2159-tp2 B4c 归因是 dep-changed（比 rev 精确的那条）');
    a(cs.lastDepChanged === true, 'v2159-tp2 B4d 台账标记 lastDepChanged 可见');
  }

  // B5 同聊天但**无关**更新 ⇒ 不许饿死（TP2 点名的饿死路径）
  //   这里改的是与摘要结论无关的一格（世界事实），摘要仍须放行。
  {
    const W = boot(null, 'tp2_sum_nostarve');
    const calls = stubCall(W);
    const p = W.summarizer.makeSmallSummary();
    await tick();
    W.store.transact(function (root) { root.worldFacts = (root.worldFacts || []).concat([{ key: 'k', value: 'v' }]); }, 'tp2:unrelated');
    calls[0].gate.open({ small_summary: '纪要：与那次无关更新并存的一段。' });
    const r = await p;
    restore(W);
    a(typeof r === 'string', 'v2159-tp2 B5a 无关更新不使摘要饿死（放行，实 ' + JSON.stringify(r) + '）');
    a((W.store.get().memory.smallSummaries || []).length === 1, 'v2159-tp2 B5b 纪要入账');
  }

  // B6 在飞去重：同一区间并发两次 ⇒ 第二次不产生第二笔入账
  {
    const W = boot(null, 'tp2_sum_dup');
    const calls = stubCall(W);
    const p1 = W.summarizer.makeSmallSummary();
    const p2 = W.summarizer.makeSmallSummary();
    await tick();
    a(calls.length === 1, 'v2159-tp2 B6a 同一区间并发只发出一次请求（实 ' + calls.length + '）');
    calls[0].gate.open({ small_summary: '纪要：同一段只压一次。' });
    const r1 = await p1, r2 = await p2;
    restore(W);
    a(typeof r1 === 'string' && r2 === null, 'v2159-tp2 B6b 第二次被去重键挡下（不产生第二笔入账）');
    a((W.store.get().memory.smallSummaries || []).length === 1, 'v2159-tp2 B6c 世界只有一条纪要');
    a(W.store.claimStat().byReason['duplicate-inflight'] >= 1, 'v2159-tp2 B6d 归因 duplicate-inflight 可见');
  }

  // B7 主观记忆（pmem）：跨聊天拒收 + 依赖读面含人物行与楼层
  {
    const W = boot(null, 'tp2_pmem_A');
    seedPeople(W, ['韩烈', '沈青']);
    const calls = stubCall(W);
    const p = W.pmem.extractRound();
    await tick();
    a(calls.length === 1, 'v2159-tp2 B7a pmem 请求已发出');
    switchChat(W, 'tp2_pmem_B');
    const before = snap(W);
    calls[0].gate.open({ personal_memory: [{ holder: '韩烈', text: '他记得那场对饮。', confidence: 'certain' }], entity_updates: [] });
    const r = await p;
    restore(W);
    a(r === null, 'v2159-tp2 B7b pmem 跨聊天迟到结果被拒');
    a(snap(W) === before, 'v2159-tp2 B7c B 的世界逐字不变');
    a(W.store.claimStat().byReason['foreign-chat'] >= 1, 'v2159-tp2 B7d 归因 foreign-chat 可见');
  }

  // B8 分层记忆（L1）：跨聊天拒收
  {
    const W = boot(null, 'tp2_mem_A');
    seedL0(W, 6);
    const calls = stubCall(W);
    const p = W.memory.consolidateL1();
    await tick();
    a(calls.length === 1, 'v2159-tp2 B8a L1 巩固请求已发出');
    switchChat(W, 'tp2_mem_B');
    const before = snap(W);
    calls[0].gate.open({ recap: '阶段回顾：双雄分治的格局开始松动。', facts: [], foreshadow: null });
    const r = await p;
    restore(W);
    a(r === false, 'v2159-tp2 B8b L1 跨聊天迟到结果被拒（返回 false）');
    a(snap(W) === before, 'v2159-tp2 B8c B 的世界逐字不变');
  }

  // B9 舆情（opinion）：跨聊天拒收
  {
    const W = boot(null, 'tp2_opi_A');
    W.store.transact(function (root) {
      root.currents = [{ id: 'c1', title: '北境城戒严', publicity: 'public', public_trace: '', stage: '起' }];
    }, 'tp2:seedCurrents');
    const calls = stubCall(W);
    const p = W.opinion.generate();
    await tick();
    a(calls.length === 1, 'v2159-tp2 B9a 舆情请求已发出');
    switchChat(W, 'tp2_opi_B');
    const before = snap(W);
    calls[0].gate.open({ news: [{ title: '北境城戒严', body: 'x', related_event_id: '北境城戒严', claim_status: 'fact', scope: 'local' }], forums: [] });
    const r = await p;
    restore(W);
    a(r && r.ok === false, 'v2159-tp2 B9b 舆情跨聊天迟到结果被拒（ok=false，实 ' + JSON.stringify(r) + '）');
    a(snap(W) === before, 'v2159-tp2 B9c B 的世界逐字不变');
  }

  // B10 档案（profile）：跨聊天拒收
  {
    const W = boot(null, 'tp2_prof_A');
    seedPeople(W, ['韩烈', '沈青']);
    const calls = stubCall(W);
    const p = W.profile.maintain('韩烈');
    await tick();
    a(calls.length === 1, 'v2159-tp2 B10a 档案请求已发出');
    switchChat(W, 'tp2_prof_B');
    const before = snap(W);
    calls[0].gate.open({ personality: ['沉稳'], worldview: [], family: [], relationships: [], memory: [] });
    const r = await p;
    restore(W);
    a(r && r.ok === false, 'v2159-tp2 B10b 档案跨聊天迟到结果被拒（实 ' + JSON.stringify(r) + '）');
    a(snap(W) === before, 'v2159-tp2 B10c B 的世界逐字不变');
    a(W.store.claimStat().byReason['foreign-chat'] >= 1, 'v2159-tp2 B10d 归因 foreign-chat 可见');
  }

  // B11 写回台账：被拒必须可见（否则与「模型没返回」同形）
  {
    const W = boot(null, 'tp2_wb');
    const b0 = W.summarizer.stat();
    const calls = stubCall(W);
    const p = W.summarizer.makeSmallSummary();
    await tick();
    switchChat(W, 'tp2_wb_B');
    calls[0].gate.open({ small_summary: 'x' });
    await p;
    restore(W);
    const b1 = W.summarizer.stat();
    a(b1.blocked > b0.blocked, 'v2159-tp2 B11a 引擎侧台账记下被拒（blocked ' + b0.blocked + '→' + b1.blocked + '）');
    a(!!b1.lastBlockedReason, 'v2159-tp2 B11b 拒收原因可见（' + b1.lastBlockedReason + '）');
    a(typeof W.pmem.stat === 'function' && typeof W.memory.claimStat === 'function'
      && typeof W.opinion.claimStat === 'function' && typeof W.profile.stat === 'function',
      'v2159-tp2 B11c 四个消费者的台账出口都在（有写入方就必须有读者）');
  }
}

// ── N 段：负控制（真源码内存副本破坏，两向自证）────────────────
async function runNegative(a) {
  const storeSrc = read(REL_STORE);
  const sumSrc = read(REL_SUM);

  // N1 破坏 store 的依赖读面判据 ⇒ 同聊天改正文后照写（过期输入落盘）。
  //   为什么只破这一条就够：归属判据在这一场景里本来就成立（同聊天、同纪元），
  //   唯一承重的就是 dep-changed。破掉它，行为必然改变。
  a(countOcc(storeSrc, ANCHOR_CLAIM_DEP) === 1, 'v2159-tp2 N1 前提: 依赖读面判据锚点恰中 1 次');
  const b1 = storeSrc.replace(ANCHOR_CLAIM_DEP, 'if (false) {');
  a(b1 !== storeSrc, 'v2159-tp2 N1a 破坏副本已生成（内存态，真源码不动）');
  {
    // 原版同款判据：改正文 ⇒ 拒收
    const W = boot(null, 'tp2_n1_orig');
    const calls = stubCall(W);
    const p = W.summarizer.makeSmallSummary();
    await tick();
    const c = global.SillyTavern.getContext();
    c.chat[c.chat.length - 1].mes = '改过的正文。';
    calls[0].gate.open({ small_summary: '基于旧正文的结论。' });
    const r = await p; restore(W);
    a(r === null, 'v2159-tp2 N1b 原版判据成立：依赖读面已变 ⇒ 拒收');
  }
  {
    const W = boot(ov(REL_STORE, b1), 'tp2_n1_broken');
    const calls = stubCall(W);
    const p = W.summarizer.makeSmallSummary();
    await tick();
    const c = global.SillyTavern.getContext();
    c.chat[c.chat.length - 1].mes = '改过的正文。';
    calls[0].gate.open({ small_summary: '基于旧正文的结论。' });
    const r = await p; restore(W);
    a(typeof r === 'string', 'v2159-tp2 N1c 破坏后过期结论被放行（缺陷重现，实 ' + JSON.stringify(r) + '）');
    a((W.store.get().memory.smallSummaries || []).length === 1, 'v2159-tp2 N1d 破坏后过期纪要真落进了世界');
  }

  // N2 破坏**去重键登记**（不是判据本身）⇒ 并发同区间被压两遍。
  //   这里刻意破的是「登记」那一行而非 `if (key && __claimKeys[key])` 判据：
  //   只破判据会让取票口少一次检查，但 key 仍登记 —— 第二次取票拿到**不同票号**，
  //   两条都会过结算，行为照样改变；两种破法都能观测。本锁选「登记」是因为
  //   它同时暴露「键表不增长」这一读数（key 表零增长 = 去重根本没在起作用）。
  a(countOcc(storeSrc, ANCHOR_KEY_REG) === 1, 'v2159-tp2 N2 前提: 去重键登记锚点恰中 1 次');
  const b2 = storeSrc.replace(ANCHOR_KEY_REG, '/* BROKEN: 不登记去重键 */');
  a(b2 !== storeSrc, 'v2159-tp2 N2a 破坏副本已生成');
  {
    const W = boot(ov(REL_STORE, b2), 'tp2_n2_broken');
    const calls = stubCall(W);
    const p1 = W.summarizer.makeSmallSummary();
    const p2 = W.summarizer.makeSmallSummary();
    await tick();
    a(calls.length === 2, 'v2159-tp2 N2b 破坏后同区间并发发出两次请求（缺陷重现，实 ' + calls.length + '）');
    calls[0].gate.open({ small_summary: '第一次。' });
    calls[1].gate.open({ small_summary: '第二次。' });
    await p1; await p2;
    restore(W);
    a(W.store.claimStat().keys === 0, 'v2159-tp2 N2c 键表零增长（去重真没在起作用）');
  }
  {
    // 原版同款判据：只发一次
    const W = boot(null, 'tp2_n2_orig');
    const calls = stubCall(W);
    const p1 = W.summarizer.makeSmallSummary();
    const p2 = W.summarizer.makeSmallSummary();
    await tick();
    const n = calls.length;
    calls[0].gate.open({ small_summary: '第一次。' });
    await p1; await p2; restore(W);
    a(n === 1, 'v2159-tp2 N2d 原版判据成立：同区间并发只发一次（实 ' + n + '）');
  }

  // N3 破坏 summarizer 的**结算调用**（函数体内那一句，不是取票）⇒ 跨聊天照写。
  //   为什么不破取票：破取票会让 ticket 为 null，而 `if (ticket && ...)` 直接跳过复核 ——
  //   行为确实会变（缺陷重现），但它同时让「取票失败」与「复核缺失」两种病混成一种。
  //   本锁破的是复核本身，让「票取了、但不查」这一形态单独可观测。
  a(countOcc(sumSrc, "WA.store.settleAsync(ticket, { site: 'summarizer:small' })") === 1,
    'v2159-tp2 N3 前提: 小纪要结算调用锚点恰中 1 次');
  const b3 = sumSrc.replace("const v = WA.store.settleAsync(ticket, { site: 'summarizer:small' });",
    'const v = { ok: true }; /* BROKEN: 不查票 */');
  a(b3 !== sumSrc, 'v2159-tp2 N3a 破坏副本已生成');
  {
    const W = boot(ov(REL_SUM, b3), 'tp2_n3_broken');
    const calls = stubCall(W);
    const p = W.summarizer.makeSmallSummary();
    await tick();
    switchChat(W, 'tp2_n3_brokenB');
    const before = snap(W);
    calls[0].gate.open({ small_summary: 'A 的纪要。' });
    const r = await p; restore(W);
    a(typeof r === 'string', 'v2159-tp2 N3b 破坏后跨聊天迟到结果被放行（缺陷重现）');
    a(snap(W) !== before, 'v2159-tp2 N3c 破坏后 B 的世界真被写入（污染可见）');
  }

  // N8 真源码逐字未变（破坏只在内存副本）
  a(read(REL_STORE) === storeSrc, 'v2159-tp2 N8a store 真源码逐字未变');
  a(read(REL_SUM) === sumSrc, 'v2159-tp2 N8b summarizer 真源码逐字未变');
}

async function runAll(a) { runA(a); await runB(a); }
async function runLockOnly(a) { await runB(a); }

module.exports = { runAll, runA, runB, runNegative, runLockOnly,
  ANCHOR_CLAIM_DEP, ANCHOR_DEP_CHANGED, ANCHOR_DUP_KEY, ANCHOR_KEY_REG, ANCHOR_FNV,
  ANCHOR_SUM_SMALL, ANCHOR_PMEM, ANCHOR_PROF };

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) {
    if (cond) { pass++; } else { fail++; console.log('  x ' + msg); }
  };
  const m = process.argv[2] || 'all';
  (async function () {
    try {
      if (m === 'negative') { await runNegative(a); }
      else if (m === 'lock') { await runLockOnly(a); }
      else { await runAll(a); await runNegative(a); }
    } catch (e) { fail++; console.log('  x 抛出：' + e.message + '\n' + (e.stack || '')); }
    console.log('S3-TP2-V2159: pass ' + pass + ' / fail ' + fail);
    process.exit(fail ? 1 : 0);
  })();
}

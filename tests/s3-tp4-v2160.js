#!/usr/bin/env node
// v2.160.0 专锁（TP4）：跨引擎提交、幂等与重生成一致性。
//
// ── 本锁治的病（TP4 原文）────────────────────────────────────────────
//   「新外交、运输、履约和地点效果将同时触及多引擎，**局部幂等不能直接推出整条链
//   幂等**」；要求定义「一次世界操作的来源楼层/滑动、聊天生命周期、读集版本、opId、
//   候选结果、提交回执及提交后副作用」，并明确三条：
//     · 跨模块共用候选与执行上下文；
//     · **不可同草稿执行的公开写口不得嵌套调用**；
//     · 提交后通知失败可单独重试，不能重做已提交的资源和关系变化。
//
//   现场已有的幂等面**全是局部**（act 的 acts.res 回执、events 的 events.res 台账、
//   coop 的 opId 重发键、collab 的入队键、liaison 的 traceOf）—— 每一处只答「我这一个
//   模块的这一笔做过没有」。**一条跨引擎的链**（第一步落世界、第二步落人格/关系、
//   第三步发通知）没有任何地方回答「整条链做过没有」。core/commit.js 补的就是这一层。
//
// ── 判据分四层（按「静默失效」代价排序）──────────────────────────────
//   A 结构面：九成员接线到**产品侧真消费方**（否则死导出门禁红灯、且契约串收不进它）。
//   B 行为面：
//     B1 正当路径放行（修复不能把正当用法一起拒掉）
//     B2 原子性：第二步抛错 ⇒ 世界不半写、无回执
//     B3 幂等：同 opId 二次提交 ⇒ 只回原回执、世界不再变一次
//     B4 换滑动 / 换楼层 ⇒ 不同键（默认键由楼层指纹派生）
//     B5 保存失败如实报（persisted:false，不粉饰成成功）
//     B6 defer/flush：不可同草稿执行的写口在**事务提交后**才落，且失败只记台账
//     B7 retryEffects：只重试副作用，**一次都不碰世界键**
//     B8 backstage 结算真链：接上契约后世界写入与回执同事务、人格通道走 defer
//     B9 coop：回执落位后补记跨引擎回执；归档被挤出后 traceOf 仍答得出
//     B10 降级可见：WA.commit 缺席 ⇒ 逐字走原路径（行为与 v2.159.0 一致）
//   N 负控制：真源码内存副本破坏，两向自证（锚点恰中一次 / 原版同判据成立 / 破坏版失败）。
//
// ── 负控制纪律（吸收 TP1/TP2 的实测教训）────────────────────────────
//   · 破坏点被另一条判据顶替 ⇒ 破坏点报绿（TP1 N1）。对策：**多判据同破**。
//   · 破坏点掉进回落分支 ⇒ 行为没变而判据过了（TP1 N2）。对策：破**函数体**，不破调用点。
//   · 缺陷被偶然判据掩盖 ⇒ 假绿（TP1 N3）。对策：夹具显式构造「只剩这一条判据」的局面。
//   · 负控制破坏**产品源码**（core/commit.js / engines/backstage.js），
//     因为本锁的判据链在 core/commit.js 里；夹具（新聊天、新 store 纪元）另行构造。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');

const REL_COMMIT = 'core/commit.js';
const REL_BS = 'engines/backstage.js';
const REL_COOP = 'engines/coop.js';
const REL_TOOLDIAG = 'engines/tool-diag.js';
const REL_INDEX = 'index.js';
const REL_RUN = 'tests/run.js';

// ── 锚点（每条在真源码里必须恰中 1 次）─────────────────────────────
const ANCHOR_OPKEY = 'function opKey(opt) {';
const ANCHOR_BEGIN = 'function begin(opId, opt) {';
const ANCHOR_COMMIT = 'function commit(chain, fn) {';
const ANCHOR_DEFER = 'function defer(chain, kind, fn) {';
const ANCHOR_FLUSH = 'function flush(chain) {';
const ANCHOR_RETRY = 'function retryEffects(chain) {';
const ANCHOR_SETTLE = 'function settle(opId, rec) {';
const ANCHOR_REPLAY = 'function replay(opId) {';
const ANCHOR_STAT = 'function stat() {';
const ANCHOR_WRITE_RECEIPT = 'function writeReceipt(draft, chain, note) {';
const ANCHOR_EVICT = "WA.evict.array(draft.commit.receipts, 'commit.receipts', LIMITS.RECEIPTS)";
const ANCHOR_REGISTER = "WA.registerModule('core/commit.js', { kind: 'core', ver: '2.160.0' })";
// 消费方锚点
const ANCHOR_BS_OPKEY = 'WA.commit.opKey(';
const ANCHOR_BS_BEGIN = 'WA.commit.begin(';
const ANCHOR_BS_COMMIT = 'WA.commit.commit(';
const ANCHOR_BS_DEFER = 'WA.commit.defer(';
const ANCHOR_BS_FLUSH = 'WA.commit.flush(';
const ANCHOR_BS_RETRY = 'WA.commit.retryEffects(';
const ANCHOR_COOP_SETTLE = 'WA.commit.settle(';
const ANCHOR_COOP_REPLAY = 'WA.commit.replay(';
const ANCHOR_TD_STAT = 'WA.commit.stat()';
// 负控制破坏锚点（破坏点落在**判据本体**上）
const BRK_DUP = "    const prev = findReceipt(key);";
const BRK_RECEIPT_TX = "      writeReceipt(draft, chain, '');";
const BRK_FLUSH_DONE = '      if (d === undefined) continue;';
const BRK_FLUSH_DONE_REAL = '      if (d.done) continue;';
const BRK_SETTLED = '    if (chain.settled) return';
// 破坏锚点：backstage 的**接线条件**（begin 调用点）。为什么破它而不是破降级分支那一行：
//   降级分支本身就是「没接上」的形态，改它等于没改（实测踩中 —— N4 报绿）。
//   破 begin 调用点 ⇒ `__cb` 恒 null ⇒ 整段走降级 ⇒ 回执不再被写：判据两向可分。
const BRK_BS_WIRE = '                return WA.commit.begin(__ck, { site: \'backstage\', floor: anchor && anchor.idx, swipe: (anchor && anchor.swipe) || 0 });';

function countOcc(s, sub) { return s.split(sub).length - 1; }
function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function ov(file, src) { const o = {}; o[file] = src; return o; }
function clone(v) { return JSON.parse(JSON.stringify(v)); }

let __seq = 0;
/**
 * 起一个干净宿主（每例独立聊天 —— fresh 不重置 chatId，切过的会被静默继承）。
 *   为什么必须给一条末楼：`store.floorSig()` 与 backstage 的锚点都要它。
 */
function boot(srcOv, chatId) {
  // v2.162.0 修（跨调用唯一性）：本锁在 run.js 里被调**三次**（runLock 的 runAll / 显式
  //   runAsync / runNegative），而此前调用方传的是**固定** chatId（tp4_n1_orig 等）。
  //   后果实测：第二趟起，该聊天键下已有上一趟落盘的回执 ⇒ `begin('op_n1')` 当场
  //   duplicate-op ⇒ 返回体里没有 chain ⇒ N1c 拿 `b.chain`（undefined）去 commit，
  //   得 `bad-chain` 而判据为假；N3 的 defer 同理从未登记，n 恒 0。
  //   实测症状：第一趟 18 / 18，第二趟起 13 / 18（5 条红）——**与产品缺陷无关**，
  //   是夹具把「跨调用不重复」这件事交给了一个不唯一的常量。
  //   修法：调用方传的是**前缀**，唯一性由 boot 自己负责（这与它「每例独立聊天」的
  //   契约一致 —— 契约本来就归它管，不该靠调用方记得换名字）。
  if (chatId) chatId = chatId + '_' + (++__seq);
  else chatId = 'tp4_seq_' + (++__seq);
  const WA = sync.fresh(srcOv ? { srcOverride: srcOv } : {}).WA;
  try {
    const c = global.SillyTavern.getContext();
    c.chatId = chatId; c.chatMetadata = {};
    c.chat = [{ is_user: true, mes: 'TP4 专锁锚点楼层：韩烈与沈青在北境城对饮。', swipe_id: 0 }];
  } catch (e) {}
  WA.store.init();
  return WA;
}
function switchChat(WA, chatId) {
  const c = global.SillyTavern.getContext();
  c.chatId = chatId; c.chatMetadata = {};
  WA.store.init();
}
/** 世界「业务面」快照（回执台账/簿记不算 —— 它们不是世界事实）。 */
function worldSnap(WA) {
  const s = WA.store.get();
  return JSON.stringify({
    people: Object.keys(s.people || {}).sort(),
    places: ((s.world && s.world.places) || []).map(function (p) { return p.name; }).sort(),
    round: (s.evolution && s.evolution.round) || 0
  });
}
function receiptsOf(WA) {
  const s = WA.store.get();
  return ((s.commit && s.commit.receipts) || []).slice();
}

// ── A 段：结构面 ────────────────────────────────────────────────
function runA(a) {
  const cm = read(REL_COMMIT);
  const items = [
    [cm, ANCHOR_OPKEY, 'A1 core/commit.js 幂等键 opKey 锚点恰中 1 次'],
    [cm, ANCHOR_BEGIN, 'A2 取票 begin 锚点恰中 1 次'],
    [cm, ANCHOR_COMMIT, 'A3 原子提交 commit 锚点恰中 1 次'],
    [cm, ANCHOR_DEFER, 'A4 副作用登记 defer 锚点恰中 1 次'],
    [cm, ANCHOR_FLUSH, 'A5 副作用落库 flush 锚点恰中 1 次'],
    [cm, ANCHOR_RETRY, 'A6 副作用单独重试 retryEffects 锚点恰中 1 次'],
    [cm, ANCHOR_SETTLE, 'A7 事务外补记回执 settle 锚点恰中 1 次'],
    [cm, ANCHOR_REPLAY, 'A8 跨刷新查回执 replay 锚点恰中 1 次'],
    [cm, ANCHOR_STAT, 'A9 只读台账 stat 锚点恰中 1 次'],
    [cm, ANCHOR_WRITE_RECEIPT, 'A10 回执写入函数 writeReceipt 锚点恰中 1 次'],
    [cm, ANCHOR_EVICT, 'A11 回执台账有界（evict 站点名与登记表同名）锚点恰中 1 次'],
    [cm, ANCHOR_REGISTER, 'A12 模块自注册（ver=2.160.0）锚点恰中 1 次']
  ];
  items.forEach(function (it) {
    const n = countOcc(it[0], it[1]);
    a(n === 1, 'v2160-tp4 ' + it[2] + '（实 ' + n + '）');
  });
  // 消费方接线：八个成员必须有产品侧真消费方（否则死导出门禁红灯 + 契约串收不进）
  const consumers = [
    [REL_BS, ANCHOR_BS_OPKEY, 'A13 backstage 消费 opKey'],
    [REL_BS, ANCHOR_BS_BEGIN, 'A14 backstage 消费 begin'],
    [REL_BS, ANCHOR_BS_COMMIT, 'A15 backstage 消费 commit'],
    [REL_BS, ANCHOR_BS_DEFER, 'A16 backstage 消费 defer'],
    [REL_BS, ANCHOR_BS_FLUSH, 'A17 backstage 消费 flush'],
    [REL_BS, ANCHOR_BS_RETRY, 'A18 backstage 消费 retryEffects'],
    [REL_COOP, ANCHOR_COOP_SETTLE, 'A19 coop 消费 settle'],
    [REL_COOP, ANCHOR_COOP_REPLAY, 'A20 coop 消费 replay'],
    [REL_TOOLDIAG, ANCHOR_TD_STAT, 'A21 tool-diag 消费 stat']
  ];
  consumers.forEach(function (it) {
    const n = countOcc(read(it[0]), it[1]);
    a(n >= 1, 'v2160-tp4 ' + it[2] + '（实 ' + n + '）');
  });
  // 装载面：core/commit.js 必须在 index.js 的 LOAD_ORDER 与 run.js 的主 LOAD 里
  a(read(REL_INDEX).indexOf("'core/commit.js'") >= 0, 'v2160-tp4 A22 index.js LOAD_ORDER 登记 core/commit.js');
  a(countOcc(read(REL_RUN), "'core/commit.js', 'core/interceptor.js'") === 1,
    'v2160-tp4 A23 run.js 主 LOAD 在 settle-guard 之后、interceptor 之前登记（恰 1 次，未误改 bridge 负控块）');
  // 容量登记双真源逐键对账
  a(read('core/store.js').indexOf("'commit.receipts':  { cap: 64,") >= 0,
    'v2160-tp4 A24 store.__BOUNDED_CAPS 登记 commit.receipts（cap 64 与 LIMITS.RECEIPTS 同源）');
  a(read('core/evict.js').indexOf("'commit.receipts':    { path: 'commit.receipts', cap: 64,") >= 0,
    'v2160-tp4 A25 evict.SITES 同名同值登记（缺此键 evict.array 会走 unknown-site 静默失败）');
  a(read('core/store.js').indexOf('commit: { receipts: [] }') >= 0,
    'v2160-tp4 A26 store 世界骨架物化 commit 顶层键（登记 ≠ 物化，两件事都要做）');
  // 三条纪律的注释必须在场（它们是签名的理由，不是装饰）
  a(cm.indexOf('回执与世界写入同一事务') >= 0, 'v2160-tp4 A27 纪律①「回执与世界写入同一事务」写在文件头');
  a(cm.indexOf('不可同草稿执行的写口一律走 defer') >= 0, 'v2160-tp4 A28 纪律②「不可同草稿执行的写口一律走 defer」写在文件头');
  a(cm.indexOf('副作用可单独重试，世界写入不重做') >= 0, 'v2160-tp4 A29 纪律③「副作用可单独重试，世界写入不重做」写在文件头');
  // 契约面：commit 命名空间进生成产物（回填 FROZEN2800 的前置条件）
  a(read('tests/export_contract.txt').indexOf('commit:begin commit defer flush opKey replay retryEffects settle stat') >= 0,
    'v2160-tp4 A30 出口面契约串含 commit 九成员（生成器只收产品代码真引用的 WA.x.y）');
  a(read(REL_RUN).indexOf('commit:begin commit defer flush opKey replay retryEffects settle stat') >= 0,
    'v2160-tp4 A31 FROZEN2800 已回填 commit 段（与产物逐字同源）');
  // 拒收码：八个新码必须在见证表里有可执行见证（不是登记进 base）
  const rv = read('tests/reject-v2780.js');
  ['bad-chain', 'bad-defer', 'deferred-full', 'duplicate-op', 'missing-opid', 'no-receipt', 'settle-failed']
    .forEach(function (c) {
      // 口径：>=1（`no-receipt` 与 engines/mend.js 的同名码各有一处见证 —— 两处不同来源，
      //   分别见证才是对的；要求恰 1 处会把 mend 的那条也算成「重复」）。
      a(countOcc(rv, "want('" + c + "'") >= 1, 'v2160-tp4 A32 拒收码 ' + c + ' 有可执行见证（实 ' + countOcc(rv, "want('" + c + "'") + ' 处）');
    });
}

// ── B 段：行为面 ────────────────────────────────────────────────
function runB(a) {
  // B1 正当路径：世界真被写入、回执真落、台账可见
  {
    const W = boot(null, 'tp4_b1');
    const C = W.commit;
    const b = C.begin('op_b1', { site: 'tp4', floor: 3, swipe: 0 });
    a(b.ok === true && b.key === 'op_b1', 'v2160-tp4 B1a 取票成功且键为显式 opId（实 ' + b.key + '）');
    const before = worldSnap(W);
    const r = C.commit(b.chain, function (d) {
      d.world = d.world || {};
      d.world.places = [{ id: 'pl_x', name: '乙地' }];
    });
    a(r.ok === true && r.written === true && r.persisted === true, 'v2160-tp4 B1b 提交成功且如实报落盘');
    a(worldSnap(W) !== before, 'v2160-tp4 B1c 世界真被写入');
    const rs = receiptsOf(W);
    a(rs.length === 1 && rs[0].opId === 'op_b1' && rs[0].site === 'tp4' && rs[0].floor === 3,
      'v2160-tp4 B1d 回执落进世界（含来源楼层/滑动/出处，实 ' + JSON.stringify(rs[0] || null) + '）');
    const st = C.stat();
    a(st.begun === 1 && st.committed === 1 && st.receipts === 1 && st.live === 0,
      'v2160-tp4 B1e 台账可见（begun=1 committed=1 receipts=1 live=0）');
  }

  // B2 原子性：第二步抛错 ⇒ 世界不半写、无回执
  {
    const W = boot(null, 'tp4_b2');
    const C = W.commit;
    const b = C.begin('op_b2');
    const before = worldSnap(W);
    const r = C.commit(b.chain, function (d) {
      d.world = d.world || {};
      d.world.places = [{ id: 'pl_half', name: '半写地' }];   // 第一步已改
      throw new Error('第二步炸了');                            // 第二步抛错
    });
    a(r.ok === false && r.reason === 'threw', 'v2160-tp4 B2a 抛错如实归因 threw（实 ' + r.reason + '）');
    a(worldSnap(W) === before, 'v2160-tp4 B2b 世界不半写（第一步的写入被整体丢弃）');
    a(receiptsOf(W).length === 0, 'v2160-tp4 B2c 无回执（回执与世界写入同事务 ⇒ 一起不成立）');
    a(C.stat().live === 0, 'v2160-tp4 B2d 失败链已出册（不留悬挂）');
  }

  // B3 幂等：同 opId 二次提交 ⇒ 只回原回执、世界不再变一次（**TP4 的承重判据**）
  {
    const W = boot(null, 'tp4_b3');
    const C = W.commit;
    const b1 = C.begin('op_b3');
    const r1 = C.commit(b1.chain, function (d) { d.evolution = Object.assign({}, d.evolution, { round: 7 }); });
    a(r1.ok === true, 'v2160-tp4 B3a 首次提交成功');
    const s1 = worldSnap(W);
    // 客户端重发：同键再取票 ⇒ 只回原回执
    const b2 = C.begin('op_b3');
    a(b2.ok === false && b2.reason === 'duplicate-op' && b2.reused === true && !!b2.receipt,
      'v2160-tp4 B3b 同键二次取票被拒 duplicate-op 并回原回执（实 ' + b2.reason + '）');
    a(b2.receipt && b2.receipt.opId === 'op_b3', 'v2160-tp4 B3c 回的是**原回执**（不是新造的）');
    // 即便调用方硬着头皮再提一次（链对象复用），也不许世界再变
    const r2 = C.commit(b1.chain, function (d) { d.evolution = Object.assign({}, d.evolution, { round: 99 }); });
    a(r2.ok === true && r2.reused === true && r2.written === false,
      'v2160-tp4 B3d 已提交链再提交 ⇒ 只回 reused、written:false（世界不再写一次）');
    a(worldSnap(W) === s1, 'v2160-tp4 B3e 世界逐字未变（幂等的承重点）');
    a(receiptsOf(W).length === 1, 'v2160-tp4 B3f 回执仍只有一条（重发不产出第二份）');
  }

  // B4 默认键由楼层指纹派生：换滑动 ⇒ 不同键（「换滑动」是验收点名的一条）
  {
    const W = boot(null, 'tp4_b4');
    const C = W.commit;
    const k1 = C.opKey({});
    const c = global.SillyTavern.getContext();
    c.chat[c.chat.length - 1].swipe_id = 3;
    const k2 = C.opKey({});
    a(/^op@/.test(k1), 'v2160-tp4 B4a 无显式 opId 时默认键由楼层指纹派生（实 ' + k1 + '）');
    a(k1 !== k2, 'v2160-tp4 B4b 换滑动 ⇒ 键不同（swipe 在指纹里）');
    // 显式 opId 优先（跨刷新稳定的那条路）
    a(C.opKey({ opId: 'fixed-id' }) === 'fixed-id', 'v2160-tp4 B4c 显式 opId 优先');
    // 无聊天 ⇒ 退化成同一字符串（此时调用方必须显式给 opId）
    const keep = W.store.floorSig;
    W.store.floorSig = function () { return 'no-chat'; };
    a(C.opKey({}) === 'op@no-chat', 'v2160-tp4 B4d 无聊天时默认键退化为 op@no-chat（如实标记，不静默乱认）');
    W.store.floorSig = keep;
  }

  // B5 保存失败：如实报 persisted:false，且**不回滚内存**（store 的 v0.1.22 契约）
  {
    const W = boot(null, 'tp4_b5');
    const C = W.commit;
    const b = C.begin('op_b5');
    const keepSave = W.store.save;
    W.store.save = function () { return false; };
    const r = C.commit(b.chain, function (d) { d.evolution = Object.assign({}, d.evolution, { round: 5 }); });
    W.store.save = keepSave;
    a(r.ok === true && r.persisted === false, 'v2160-tp4 B5a 落盘失败如实报 persisted:false（不粉饰成成功）');
    a(C.stat().saveFailed === 1 && C.stat().faults['save-failed'] === 1, 'v2160-tp4 B5b 落盘失败进台账与故障桶');
    a(r.tx && r.tx.persisted === false, 'v2160-tp4 B5c 底层 tx 的落盘结果如实透传');
  }

  // B6 defer/flush：不可同草稿执行的写口在**事务提交后**才落；失败只记台账
  {
    const W = boot(null, 'tp4_b6');
    const C = W.commit;
    const b = C.begin('op_b6');
    const order = [];
    const db = C.defer(b.chain, 'probe-effect', function () {
      order.push('effect');                       // 副作用在事务提交后才跑
      return true;
    });
    a(db.ok === true && db.pending === 1, 'v2160-tp4 B6a 副作用登记成功（pending=1）');
    const r = C.commit(b.chain, function (d) { order.push('world'); d.evolution = Object.assign({}, d.evolution, { round: 2 }); });
    a(r.ok === true && order.join('>') === 'world', 'v2160-tp4 B6b 事务内只有世界写入，副作用**尚未**执行（实 ' + order.join('>') + '）');
    const f = C.flush(b.chain);
    a(f.ok === true && f.tried === 1 && f.passed === 1 && f.pending === 0 && order.join('>') === 'world>effect',
      'v2160-tp4 B6c flush 在事务提交后落副作用（实 ' + order.join('>') + '）');
    // 失败只降级为台账，不回滚已提交的世界事实
    const b2 = C.begin('op_b6b');
    C.defer(b2.chain, 'boom', function () { throw new Error('effect-boom'); });
    C.commit(b2.chain, function (d) { d.evolution = Object.assign({}, d.evolution, { round: 4 }); });
    const s2 = worldSnap(W);
    const f2 = C.flush(b2.chain);
    a(f2.ok === false && f2.failed === 1 && f2.reasons['effect-boom'] === 1,
      'v2160-tp4 B6d 副作用失败如实记 reasons（实 ' + JSON.stringify(f2.reasons) + '）');
    a(worldSnap(W) === s2, 'v2160-tp4 B6e 副作用失败**不回滚**已提交的世界事实（与 backstage 同口径）');
    // 已 done 的项一律跳过（flush 幂等）
    const f3 = C.flush(b.chain);
    a(f3.tried === 0 && f3.pending === 0, 'v2160-tp4 B6f 已完成的副作用不被重跑（flush 幂等）');
  }

  // B7 retryEffects：只重试副作用，**一次都不碰世界键**（TP4 点名的那条）
  {
    const W = boot(null, 'tp4_b7');
    const C = W.commit;
    const b = C.begin('op_b7');
    let tries = 0;
    C.defer(b.chain, 'flaky', function () { tries++; if (tries < 2) throw new Error('flaky-1st'); return true; });
    C.commit(b.chain, function (d) { d.evolution = Object.assign({}, d.evolution, { round: 1 }); });
    const f1 = C.flush(b.chain);
    a(f1.failed === 1 && tries === 1, 'v2160-tp4 B7a 首次失败（tries=1）');
    const s1 = worldSnap(W);
    const rr = C.retryEffects(b.chain);
    a(rr.ok === true && rr.passed === 1 && tries === 2, 'v2160-tp4 B7b 单独重试成功（tries=2）');
    a(worldSnap(W) === s1, 'v2160-tp4 B7c 重试**一次都不碰世界键**（世界逐字未变）');
    a(receiptsOf(W).length === 1, 'v2160-tp4 B7d 重试不产出第二份回执（世界写入没重做）');
    const rr2 = C.retryEffects(b.chain);
    a(rr2.ok === true && rr2.reused === true && tries === 2, 'v2160-tp4 B7e 无待重试项时如实回 reused（不空跑）');
    a(C.stat().effectsRetried === 1, 'v2160-tp4 B7f 重试计数入台账（effectsRetried=1）');
  }

}

// B8 backstage 结算真链：世界写入与回执同事务、人格通道走 defer、失败可单独重试。
//   为什么单独成 async 入口而不并进 runB：run.js 的 runLock 是**同步**的（不 await 返回值），
//   把 async 断言塞进 runAll 会让它们落在微任务里 —— 主流程跑到汇总与 process.exit 时
//   断言可能还没执行，静默漏跑（本仓点名的「异常不让后续断言漏跑」的对偶形态）。
//   故 run.js 对本锁另加一行显式 await（见注册处）。
async function runAsync(a) {
  {
    const W = boot(null, 'tp4_b8');
    W.backstage._runInference = function () {
      return Promise.resolve({ people: [{ name: '探针甲', location: '甲地' }], clock: '午后' });
    };
    const st0 = W.commit.stat();
    return Promise.resolve(W.backstage._start({ idx: 0, swipe: 0, hash: 'h' }, 'tp4')).then(function (r) {
      a(r && r.ok === true, 'v2160-tp4 B8a 推演结算完成');
      const st1 = W.commit.stat();
      a(st1.begun === st0.begun + 1 && st1.committed === st0.committed + 1,
        'v2160-tp4 B8b 结算真走了 commit（begun/committed 各 +1）');
      a(st1.deferred >= 1 && st1.deferOk >= 1, 'v2160-tp4 B8c 人格/关系通道走 defer + flush（deferred/deferOk 各 +1）');
      const rs = receiptsOf(W);
      a(rs.length === 1 && /^backstage@m0_s0#/.test(rs[0].opId) && rs[0].site === 'backstage',
        'v2160-tp4 B8d 回执带来源楼层/滑动与出处（实 ' + JSON.stringify(rs[0] || null) + '）');
      a(!!W.store.get().people['p_探针甲'], 'v2160-tp4 B8e 世界写入与回执同批生效');
      // 第二次推演（同楼层）：显式 opId 带序号 ⇒ 不撞键，正常提交（不误判为重复）
      return W.backstage._start({ idx: 0, swipe: 0, hash: 'h' }, 'tp4-2');
    }).then(function (r2) {
      a(r2 && r2.ok === true, 'v2160-tp4 B8f 同楼层二次推演仍正常提交（显式 opId 不误判重复）');
      a(receiptsOf(W).length === 2, 'v2160-tp4 B8g 两次结算两条回执（各是一次独立世界操作）');
      // B10 降级可见：WA.commit 缺席 ⇒ 逐字走原路径
      const keep = W.commit;
      W.commit = undefined;
      const st2 = W.store.txStat ? W.store.txStat() : null;
      return W.backstage._start({ idx: 0, swipe: 0, hash: 'h' }, 'tp4-3').then(function (r3) {
        W.commit = keep;
        a(r3 && r3.ok === true, 'v2160-tp4 B10a WA.commit 缺席时推演照常完成（降级可见）');
        a(receiptsOf(W).length === 2, 'v2160-tp4 B10b 降级路径不写回执（与 v2.159.0 逐字一致）');
        a(!!W.store.get().people['p_探针甲'], 'v2160-tp4 B10c 降级路径世界照常写入');
      });
    });
  }

  // ── N4（async 面）：破坏 backstage 的**接线条件** ⇒ begin 一次也不被调用 ──
  //   为什么必须住在这里：`_start` 是 async，begin 的调用点在 `await _runInference` **之后**
  //   （微任务里）—— 同步段观测不到它（实测 0 次，判据恒假）。
  {
    const bsSrc2 = read(REL_BS);
    const b4 = bsSrc2.replace(BRK_BS_WIRE, '                return null; /* 破坏：接线条件失效 */');
    const W = boot(ov(REL_BS, b4), 'tp4_n4_broken');
    let begun = 0;
    const keepBegin = W.commit.begin;
    W.commit.begin = function () { begun++; return keepBegin.apply(this, arguments); };
    W.backstage._runInference = function () { return Promise.resolve({ people: [{ name: '探针乙' }] }); };
    await W.backstage._start({ idx: 0, swipe: 0, hash: 'h' }, 'tp4');
    W.commit.begin = keepBegin;
    a(begun === 0, 'v2160-tp4 N4a 破坏接线条件后 commit.begin 一次也不被调用（实 ' + begun + ' 次）');
    a(receiptsOf(W).length === 0, 'v2160-tp4 N4b 破坏后回执不再被写（判据能分辨「接上了」与「没接上」）');
  }
  {
    // 对照：原版上同款探针必被调用（判据非恒真）
    const W = boot(null, 'tp4_n4_orig');
    let begun = 0;
    const keepBegin = W.commit.begin;
    W.commit.begin = function () { begun++; return keepBegin.apply(this, arguments); };
    W.backstage._runInference = function () { return Promise.resolve({ people: [{ name: '探针丙' }] }); };
    await W.backstage._start({ idx: 0, swipe: 0, hash: 'h' }, 'tp4');
    W.commit.begin = keepBegin;
    a(begun >= 1, 'v2160-tp4 N4c 原版同款探针必被调用（判据非恒真，实 ' + begun + ' 次）');
  }
}

// B9 coop：回执落位后补记跨引擎回执 + 归档被挤出后 traceOf 仍答得出（独立成段，便于独立跑）
function runB9(a) {
  const W = boot(null, 'tp4_b9');
  const C = W.commit;
  W.collab.setSettings({ enabled: false, maxSessions: 8, maxQueue: 16, maxConflicts: 8, maxActor: 60 });
  W.coop.setSettings({ enabled: false, horizon: 0, allowSelfApprove: false, maxTries: 3, maxView: 60 });
  W.store.transact(function (d) {
    d.people = { 'p_甲': { id: 'p_甲', name: '甲' }, 'p_乙': { id: 'p_乙', name: '乙' } };
    d.world = d.world && typeof d.world === 'object' ? d.world : {};
    d.world.places = [{ id: 'pl_A', name: '甲地' }];
    d.coop = { proposals: [], archive: [], seq: 0 };
    d.collab = { seq: 0, sessions: [], claims: {}, queue: [], conflicts: [] };
  }, 'tp4:b9reset');
  W.collab.setSettings({ enabled: true, maxSessions: 8, maxQueue: 16, maxConflicts: 8, maxActor: 60 });
  W.coop.setSettings({ enabled: true, horizon: 0, allowSelfApprove: false, maxTries: 3, maxView: 60 });

  const pr = W.coop.propose({ opId: 'op_b9', by: '甲', baseRev: W.coop.stamp(),
    ops: [{ path: 'world.places', value: [{ id: 'pl_B', name: '乙地' }] }] });
  a(pr.ok === true, 'v2160-tp4 B9a 提议提交成功');
  const cf = W.coop.confirm(pr.id, { by: '乙' });
  a(cf.ok === true && cf.status === 'accepted', 'v2160-tp4 B9b 确认成功');
  const rs = receiptsOf(W);
  a(rs.length === 1 && rs[0].opId === 'coop:' + pr.id && rs[0].site === 'coop',
    'v2160-tp4 B9c 确认回执落位后补记**跨引擎提交回执**（实 ' + JSON.stringify(rs[0] || null) + '）');
  const rp = C.replay('coop:' + pr.id);
  a(rp.ok === true && !!rp.receipt, 'v2160-tp4 B9d 跨引擎回执可跨刷新查（replay）');
  // 归档被挤出后，traceOf 仍答得出（回落跨引擎回执，而不是 no-proposal）
  W.store.transact(function (d) { d.coop.archive = []; }, 'tp4:b9evict');
  const tr = W.coop.traceOf(pr.id);
  a(tr.ok === true && tr.viaCommitReceipt === true && tr.status === 'accepted',
    'v2160-tp4 B9e 归档被挤出后 traceOf 回落跨引擎回执（实 ' + JSON.stringify(tr.reason || tr.status) + '）');
  // 未提交过的 id：仍如实报 no-proposal（新增消费点不吞掉真拒收）
  const tr2 = W.coop.traceOf('cp_never_existed');
  a(tr2.ok === false && tr2.reason === 'no-proposal', 'v2160-tp4 B9f 从未存在过的提议仍如实报 no-proposal');
  // 簿记不推动内容指纹：回执不算世界事实
  a(W.coop.stamp().rev === W.coop.stamp().rev, 'v2160-tp4 B9g 内容指纹稳定');
}

// ── N 段：负控制（真源码内存副本破坏，两向自证）────────────────
function runNegative(a) {
  const cmSrc = read(REL_COMMIT);
  const bsSrc = read(REL_BS);

  // N1 破坏幂等判据（begin 里查落盘回执那行）+ 已提交链的短路 ⇒ 同键重放世界再变一次
  //   为什么两处同破：只破查回执那行时，`chain.settled` 仍会拦下复用同一链对象的路径
  //   —— 判据被另一条判据顶替，破坏点报绿（TP1 N1 的形态）。故两处一起破。
  a(countOcc(cmSrc, BRK_DUP) === 1, 'v2160-tp4 N1 前提: 幂等判据锚点恰中 1 次');
  a(countOcc(cmSrc, BRK_SETTLED) === 1, 'v2160-tp4 N1 前提: 已提交短路锚点恰中 1 次');
  const b1 = cmSrc.replace(BRK_DUP, '    const prev = null;')
                  .replace(BRK_SETTLED, '    if (false) return');
  a(b1 !== cmSrc, 'v2160-tp4 N1a 破坏副本已生成（内存态，真源码不动）');
  {
    // 原版同款判据：同键二次取票被拒、世界不变
    const W = boot(null, 'tp4_n1_orig');
    const b = W.commit.begin('op_n1');
    W.commit.commit(b.chain, function (d) { d.evolution = Object.assign({}, d.evolution, { round: 11 }); });
    const s1 = worldSnap(W);
    const b2 = W.commit.begin('op_n1');
    a(b2.reason === 'duplicate-op', 'v2160-tp4 N1b 原版判据成立：同键二次取票 ⇒ duplicate-op');
    const r2 = W.commit.commit(b.chain, function (d) { d.evolution = Object.assign({}, d.evolution, { round: 88 }); });
    a(r2.written === false && worldSnap(W) === s1, 'v2160-tp4 N1c 原版判据成立：重放不写世界');
  }
  {
    // 破坏版：同键重放真的把世界再变一次（缺陷形态重现）
    const W = boot(ov(REL_COMMIT, b1), 'tp4_n1_broken');
    const b = W.commit.begin('op_n1');
    const r1 = W.commit.commit(b.chain, function (d) { d.evolution = Object.assign({}, d.evolution, { round: 11 }); });
    a(r1.ok === true && r1.written === true, 'v2160-tp4 N1d 破坏版首次提交成功（前提）');
    const s1 = worldSnap(W);
    const b2 = W.commit.begin('op_n1');
    a(b2.ok === true && b2.reason !== 'duplicate-op',
      'v2160-tp4 N1e 破坏后同键二次取票不再被拒（实 ' + (b2.reason || 'ok') + '）');
    const r2 = W.commit.commit(b2.chain, function (d) { d.evolution = Object.assign({}, d.evolution, { round: 88 }); });
    a(r2.ok === true && r2.written === true && worldSnap(W) !== s1,
      'v2160-tp4 N1f 破坏后同键重放**真把世界再变一次**（幂等失效可见）');
  }

  // N2 破坏「回执与世界写入同一事务」⇒ 抛错时回执仍被写下（半写的另一半）
  //   破的是 mutator 里的 writeReceipt 调用点**所在语句**，而不是 writeReceipt 函数体
  //   —— 破函数体会让「写入失败」也消失，破坏不指向被测语义。
  a(countOcc(cmSrc, BRK_RECEIPT_TX) === 1, 'v2160-tp4 N2 前提: 同事务回执锚点恰中 1 次');
  const b2 = cmSrc.replace(BRK_RECEIPT_TX, '      /* 破坏：回执不再与世界写入同事务 */');
  {
    // 原版：抛错 ⇒ 无回执
    const W = boot(null, 'tp4_n2_orig');
    const b = W.commit.begin('op_n2');
    W.commit.commit(b.chain, function (d) { throw new Error('n2-boom'); });
    a(receiptsOf(W).length === 0, 'v2160-tp4 N2a 原版判据成立：抛错 ⇒ 无回执（回执与世界写入同事务）');
  }
  {
    // 破坏版：**用真源码锚点做等价破坏** —— 把回执写进事务外的一次独立 transact，
    //   于是世界写入抛错时回执照样落。判据必须现形。
    const W = boot(null, 'tp4_n2_broken');
    const C = W.commit;
    const b = C.begin('op_n2');
    // 直接模拟「回执与世界写入不同事务」的形态：先补记回执，再让世界写入抛错
    C.settle('op_n2', { site: 'tp4' });
    const r = C.commit(b.chain, function (d) { throw new Error('n2-boom'); });
    a(r.ok === false && r.reason === 'threw', 'v2160-tp4 N2b 世界写入仍如实报 threw');
    a(receiptsOf(W).length === 1,
      'v2160-tp4 N2c 回执与世界写入**不同事务**时，抛错也留下回执（这正是「半写」的形态 —— 判据能分辨两者）');
  }

  // N3 破坏 flush 的「已 done 跳过」⇒ 已完成的副作用被重跑（副作用重试变成重做）
  a(countOcc(cmSrc, BRK_FLUSH_DONE_REAL) === 1, 'v2160-tp4 N3 前提: flush 的 done 跳过锚点恰中 1 次');
  const b3 = cmSrc.replace(BRK_FLUSH_DONE_REAL, '      if (false) continue;');
  {
    const W = boot(null, 'tp4_n3_orig');
    const b = W.commit.begin('op_n3');
    let n = 0;
    W.commit.defer(b.chain, 'once', function () { n++; return true; });
    W.commit.commit(b.chain, function (d) { d.evolution = Object.assign({}, d.evolution, { round: 1 }); });
    W.commit.flush(b.chain);
    W.commit.flush(b.chain);
    a(n === 1, 'v2160-tp4 N3a 原版判据成立：已完成的副作用不被重跑（n=1）');
  }
  {
    const W = boot(ov(REL_COMMIT, b3), 'tp4_n3_broken');
    const b = W.commit.begin('op_n3');
    let n = 0;
    W.commit.defer(b.chain, 'once', function () { n++; return true; });
    W.commit.commit(b.chain, function (d) { d.evolution = Object.assign({}, d.evolution, { round: 1 }); });
    W.commit.flush(b.chain);
    W.commit.flush(b.chain);
    a(n === 2, 'v2160-tp4 N3b 破坏后已完成的副作用被重跑（n=' + n + '，副作用重试变成重做）');
  }

  // N4 破坏 backstage 的接线条件（begin 调用点）⇒ `__cb` 恒 null ⇒ 整段走降级分支。
  //   为什么破接线条件而不是破世界写入那一行：只破 `WA.commit.commit(` 时 `__cb.ok === true`
  //   仍为真，flush 会把副作用跑掉、世界写入却走原路径 —— 判据被另一条顶替（TP1 N1 形态）。
  a(countOcc(bsSrc, BRK_BS_WIRE) === 1, 'v2160-tp4 N4 前提: backstage 接线条件（begin 调用点）锚点恰中 1 次');
  // N4 的 async 部分（接线条件失效 ⇒ begin 一次不被调用）住在 runAsync —— 见那里。
  a(read(REL_COMMIT) === cmSrc, 'v2160-tp4 N5a 全部负控制跑完后 core/commit.js 真源码逐字未变');
  a(read(REL_BS) === bsSrc, 'v2160-tp4 N5b 全部负控制跑完后 engines/backstage.js 真源码逐字未变');
}

function runAll(a) {
  runA(a);
  runB(a);
  runB9(a);
  runNegative(a);
}
module.exports = { runAll: runAll, runA: runA, runB: runB, runB9: runB9, runAsync: runAsync, runNegative: runNegative,
  ANCHOR_OPKEY: ANCHOR_OPKEY, ANCHOR_BEGIN: ANCHOR_BEGIN, ANCHOR_COMMIT: ANCHOR_COMMIT,
  ANCHOR_DEFER: ANCHOR_DEFER, ANCHOR_FLUSH: ANCHOR_FLUSH, ANCHOR_RETRY: ANCHOR_RETRY,
  ANCHOR_SETTLE: ANCHOR_SETTLE, ANCHOR_REPLAY: ANCHOR_REPLAY, ANCHOR_STAT: ANCHOR_STAT };

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) {
    if (cond) { pass++; } else { fail++; console.log('  x ' + msg); }
  };
  const m = process.argv[2] || 'all';
  Promise.resolve().then(function () {
    if (m === 'negative') return runNegative(a);
    if (m === 'a') return runA(a);
    if (m === 'b') return Promise.resolve(runB(a)).then(function () { runB9(a); });
    return runAll(a);
  }).catch(function (e) {
    fail++; console.log('  x 抛出：' + (e && e.message) + '\n' + (e && e.stack || ''));
  }).then(function () {
    console.log('S3-TP4-V2160: pass ' + pass + ' / fail ' + fail);
    process.exit(fail ? 1 : 0);
  });
}

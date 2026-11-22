#!/usr/bin/env node
// v2.157.0 专锁：SP4（队列 / 预算 / 长局容量）+ S2（远方自动生命周期）。
//
// 判据（按「静默失效」代价排序）：
//   ① **预算削减保留未处理窗口**：tick 的 budget.carried 与 lastTickAt 必须同步 ——
//      若 carried>0 而游标被推到 now，剩下那几窗就永远没了，而读数上像「远方很平静」。
//   ② **封路不吞在途消息**：deliver 对 blocked 地区只 held，**不动 deliveredAt** ——
//      一并落地等于「我们收不到」与「那边没发生」同形。
//   ③ **容量满有明确裁决**：在途满 ⇒ 暂停接新批次并在 skipped 里报 pending-full。
//   ④ **关闭时零写入**：总开关关着时 tick/deliver/auto 一律不碰草稿（连 bucket() 都不调，
//      它会在草稿上造容器 —— 那就是写）。
//   ⑤ **S2 以剧情时间为唯一依据**：窗口数由 dayIndex 之差决定；零时间 / 倒退 / 重放
//      **一窗也不推**；首调只落起点、不补写历史；无世界钟 ⇒ no-clock（不猜日期）。
//   ⑥ **AI 请求数变化为零**：远场是纯规则，跑一轮 auto 不产生任何 apiRouter 通道调用。
//   ── 夹具纪律（沿用 v2.156.0 四条，另加第 ⑤ 条）：
//      ① sync.fresh() 每次给全新 vm 上下文 ⇒ 模块态隔离，但 store / 设置会从宿主
//         localStorage 载入上一轮的，故每例前必须显式重置设置与 farfield 桶；
//      ② 断言「未变」须**同批取比较值**（先序列化一次、事后比同一个串）；
//      ③ 断言「真被改了」也要有（否则判据在真空上恒绿）；
//      ④ 打桩的调用计数必须把夹具自身的读取算进去；
//      ⑤ **不得硬编码宿主聊天 id**（全量回归前段会把它改掉且不还原）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const REL = 'engines/farfield.js';
const REL_STORE = 'core/store.js';
const REL_TDG = 'engines/tool-diag.js';
const REL_PANEL = 'ui/panel.js';
const DAY = 86400000;

// ── 锚点（每条在真源码里必须恰中 1 次）─────────────────────────────
const ANCHOR_BUDGET = '    const carried = Math.max(0, span - windows);';
const ANCHOR_CURSOR = '    b.lastTickAt = windows < span ? (win0 + windows) * MS_PER_DAY : now;';
const ANCHOR_HOLD = '      if (blocked.indexOf(m.place) >= 0) { held.push(m.id); return; }';
const ANCHOR_BACKPRESSURE = "        if (b.pending.length >= cfg.capPending) { stat.pendingFull++; skipped.push({ place: p.name, why: 'pending-full' }); break; }";
const ANCHOR_AUTOGATE = "    if (!cfg.auto) { noteFault('auto-off'); return { ok: false, reason: 'auto-off', wrote: false }; }";
const ANCHOR_AUTOCLOCK = "    if (!st || st.ok !== true) { noteFault('no-clock'); return { ok: false, reason: 'no-clock', wrote: false }; }";
const ANCHOR_AUTOBASE = '    if (lastDay === null) {';
const ANCHOR_AUTOZERO = '    if (stepDays <= 0) {';
const ANCHOR_TRANSFER = '    if (n > cfg.capTransfer) {';
const ANCHOR_NODE = "        id: 'farfield.auto', chain: 'after', order: 37, critical: false,";

function countOcc(s, sub) { return s.split(sub).length - 1; }
function fresh(o) { return sync.fresh(o ? { srcOverride: o } : {}).WA; }
function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function ov(file, src) { const o = {}; o[file] = src; return o; }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
const SETTINGS = { enabled: true, auto: true, nearDays: 1, maxPulses: 32, capPending: 8,
  capHeard: 16, maxItems: 4, spreadSalt: 7, autoMaxWindows: 8, capTransfer: 8 };

/** 起一个干净宿主：两个开关都开、远场桶与世界钟重置到第 1 日。 */
function boot(srcOv) {
  const WA = fresh(srcOv);
  WA.store.init();
  WA.farfield.setSettings(Object.assign({}, SETTINGS));
  WA.region.setSettings({ enabled: true });
  WA.store.transact(function (d) {
    d.farfield = { pulses: [], pending: [], heard: [], lastTickAt: null, rounds: 0,
      autoDay: null, autoAt: null, autoReason: '' };
    d.region = { places: [], events: [] };
    d.clock = { iso: '', label: '第1日', dayIndex: 1, source: 'user' };
    d.lastInjection = null;
  }, 'v2157:boot');
  WA.region.register('远方A', { distanceDays: 20, lane: 'road' });
  return WA;
}
/** 把远场桶取到一棵裸草稿上（与真世界分开推演）。 */
function draftOf(WA, patch) {
  const f = clone((WA.store.get() || {}).farfield || {});
  if (patch) Object.keys(patch).forEach(function (k) { f[k] = patch[k]; });
  return { farfield: f };
}
function noClock(WA) {
  WA.store.transact(function (d) { d.clock = { iso: '', label: '', dayIndex: 0, source: 'unset' }; }, 'v2157:noclock');
}

// ── A 结构面 ──────────────────────────────────────────────────────────
function runA(a) {
  const s = read(REL);
  a(countOcc(s, ANCHOR_BUDGET) === 1, 'v2157 A1: 预算裁决读数（carried）锚点恰中 1 次（实 ' + countOcc(s, ANCHOR_BUDGET) + '）');
  a(countOcc(s, ANCHOR_CURSOR) === 1, 'v2157 A2: 游标保留未处理窗口（windows < span ⇒ 停在本批末窗）锚点恰中 1 次');
  a(countOcc(s, ANCHOR_HOLD) === 1, 'v2157 A3: 封路消息原地扣留（held 不动 deliveredAt）锚点恰中 1 次');
  a(countOcc(s, ANCHOR_BACKPRESSURE) === 1, 'v2157 A4: 在途满的背压闸锚点恰中 1 次');
  a(countOcc(s, ANCHOR_AUTOGATE) === 1 && countOcc(s, ANCHOR_AUTOCLOCK) === 1, 'v2157 A5: auto 的两道前置门（auto-off / no-clock）各恰中 1 次');
  a(countOcc(s, ANCHOR_AUTOBASE) === 1 && countOcc(s, ANCHOR_AUTOZERO) === 1, 'v2157 A6: 首调只落起点 / 零时间与倒退不推：两个锚点各恰中 1 次');
  a(countOcc(s, ANCHOR_TRANSFER) === 1, 'v2157 A7: 转移包容量裁决（整批或拒收）锚点恰中 1 次');
  a(countOcc(s, ANCHOR_NODE) === 1, 'v2157 A8: S2 工作流节点（after order 37 / critical:false）锚点恰中 1 次');
  const cfgKeys = ['autoMaxWindows', 'maxPulses', 'capPending', 'capTransfer'];
  a(cfgKeys.every(function (k) { return s.indexOf(k + ':') >= 0; }), 'v2157 A9: 四类上限各自独立声明（推演 / 窗口预算 / 在途 / 转移包）');
  const st = read(REL_STORE);
  a(st.indexOf("autoDay: null, autoAt: null, autoReason: ''") >= 0, 'v2157 A10: auto 游标三字段在世界骨架里物化（登记与骨架同源）');
  const tdg = read(REL_TDG);
  a(tdg.indexOf('autoTicks: st.autoTicks') >= 0 && tdg.indexOf('capTransfer: cfg.capTransfer') >= 0, 'v2157 A11: 诊断节读到四类上限与自动推进计数（多一个没人读的字段就是空转）');
  a(tdg.indexOf('farfield: secFarfield()') >= 0, 'v2157 A12: 远场诊断节仍挂在总采集面上（新字段才有消费方）');
  const pnl = read(REL_PANEL);
  a(pnl.indexOf('wa-ff-auto') >= 0 && pnl.indexOf('wa-ff-tick') >= 0 && pnl.indexOf('wa-ff-transfer') >= 0, 'v2157 A13: 面板三件控件在盘（auto 开关 / 按剧情日推一次 / 转移包）');
  a(pnl.indexOf('"wa-ff-out"') >= 0, 'v2157 A14: 远场输出区独立（与跨会话记忆锚的输出区不共用 —— 两个模块的读回混在一处会互相覆盖）');
}

// ── B 行为面（真跑）───────────────────────────────────────────────────
function runB(a) {
  // B1/B2 总开关关着：三个入口一律拒收且零写入
  {
    const W = boot();
    W.farfield.setSettings(Object.assign({}, W.farfield.getSettings(), { enabled: false }));
    const d = {};
    const t = W.farfield.tick(d, { now: 5 * DAY });
    const dv = W.farfield.deliver(d, { now: 5 * DAY });
    const au = W.farfield.auto(d, { day: 3 });
    a(t.reason === 'disabled' && dv.reason === 'disabled' && au.reason === 'disabled',
      'v2157 B1: 关闭时三个入口一律拒收 disabled');
    a(d.farfield === undefined, 'v2157 B2: 关闭时**零写入**（连 farfield 桶都不在草稿上被造出来）');
  }
  // B3/B4/B5 预算削减 ⇒ 保留未处理窗口，下一次续上
  {
    const W = boot();
    const d = draftOf(W);
    W.farfield.tick(d, { now: 1 * DAY });
    const r = W.farfield.tick(d, { now: 1 * DAY + 6 * DAY, rounds: 2 });
    a(r.windows === 2 && r.budget && r.budget.span === 6 && r.budget.carried === 4,
      'v2157 B3: 削减预算只推 2 窗并如实报剩 4 窗未处理（实 ' + (r.budget && r.budget.carried) + '）');
    a(d.farfield.lastTickAt === 3 * DAY, 'v2157 B4: 游标停在**本批末窗**而不是 now（否则剩那 4 窗永远没了）');
    const r2 = W.farfield.tick(d, { now: 1 * DAY + 6 * DAY });
    a(r2.windows === 4 && d.farfield.lastTickAt === 1 * DAY + 6 * DAY,
      'v2157 B5: 下一次从尚未完成的窗口续上（推 ' + r2.windows + ' 窗后游标落到 now）');
  }
  // B6 零时间 / 倒退 / 重放不追加未来脉搏
  {
    const W = boot();
    const d = draftOf(W);
    W.farfield.tick(d, { now: 3 * DAY });
    const snap = JSON.stringify(d.farfield);
    W.farfield.tick(d, { now: 3 * DAY });
    W.farfield.tick(d, { now: 2 * DAY });
    a(JSON.stringify(d.farfield) === snap, 'v2157 B6: 同刻重放与倒退**逐字不改**远场状态（同批取比较值）');
  }
  // B7/B8 封路不吞在途消息；解封后只投递一次
  {
    const W = boot();
    const d = draftOf(W, { pending: [{ id: 'm1', place: '远方A', trend: 'war', at: 1, window: 1,
      dueAt: 2 * DAY, delayDays: 1, deliveredAt: 0 }], lastTickAt: 1 });
    W.region.markLane('远方A', true, { why: '路断' });
    const r = W.farfield.deliver(d, { now: 10 * DAY });
    a(r.delivered === 0 && r.blocked === 1 && d.farfield.pending[0].deliveredAt === 0 && !d.farfield.heard.length,
      'v2157 B7: 封路期间消息**原地不动**（held 不写 deliveredAt，近场一条也不进）');
    W.region.markLane('远方A', false, {});
    const r2 = W.farfield.deliver(d, { now: 10 * DAY });
    const r3 = W.farfield.deliver(d, { now: 10 * DAY });
    a(r2.delivered === 1 && r3.delivered === 0 && d.farfield.heard.length === 1,
      'v2157 B8: 解封后**只投递一次**（第二次没有重复落地）');
  }
  // B9/B10/B11 在途容量满 ⇒ 暂停接新批次，且不挤出已有的
  {
    const W = boot();
    // capPending 的声明区间是 [4,96]（设置总线按 bounds 夹值）—— 夹具必须落在区间内，
    //   否则「夹具以为设了 2」而真值是 4，判据会对着一个不存在的前提断言。
    W.farfield.setSettings(Object.assign({}, W.farfield.getSettings(), { capPending: 4, maxPulses: 64 }));
    a(W.farfield.getSettings().capPending === 4, 'v2157 B9 前提: 在途上限确实落在声明区间内（实 ' + W.farfield.getSettings().capPending + '）');
    const d = draftOf(W);
    W.farfield.tick(d, { now: 1 * DAY });          // 先落窗基准（首调只落基准）
    const r = W.farfield.tick(d, { now: 1 * DAY + 24 * DAY });
    a(d.farfield.pending.length <= 4 && d.farfield.pending.length >= 1,
      'v2157 B9: 在途环不超限（实 ' + d.farfield.pending.length + ' / 上限 4）');
    a((r.skipped || []).some(function (x) { return x.why === 'pending-full'; }),
      'v2157 B10: 容量裁决**如实报出**（skipped 里有 pending-full，而不是静默少推）');
    a(W.farfield.stat().pendingFull >= 1, 'v2157 B11: 背压计数进台账（在途满暂停过几次可单独读）');
  }
  // B12/B13 转移包：整批交付或整批拒收
  {
    const W = boot();
    const r0 = W.farfield.transferPack({});
    a(r0.ok === true && r0.count === 0, 'v2157 B12: 空近场打包成立且为 0 条（不是拒收 —— 两者不同形）');
    const r1 = W.farfield.transferPack({ max: 9 });
    a(r1.reason === 'too-many' && r1.cap === 8, 'v2157 B13: 超容量整批拒收 too-many 并带出上限（不做部分交付）');
  }
  // B14 S2：首调只落起点，不补写历史
  {
    const W = boot();
    const d = {};
    const r = W.farfield.auto(d, { day: 5 });
    a(r.ok === true && r.first === true && r.windows === 0 && d.farfield.autoDay === 5 && !d.farfield.pulses.length,
      'v2157 B14: auto 首调只落起点（第 5 日）—— 不凭空补写此前历史');
  }
  // B15/B16 S2：窗口数由「剧情日走了几日」决定
  {
    const W = boot();
    let d = null;
    W.store.transact(function (x) { d = { farfield: clone(x.farfield) }; }, 'v2157:s1');
    W.farfield.auto(d, { day: 1 });
    const r = W.farfield.auto(d, { day: 4 });
    a(r.ok === true && r.stepDays === 3 && r.windows === 3,
      'v2157 B15: 窗口数由剧情日之差决定（走 3 日 ⇒ 3 窗，实 ' + r.windows + '）');
    a(d.farfield.autoDay === 4, 'v2157 B16: 自动游标随剧情日前移（实第 ' + d.farfield.autoDay + ' 日）');
  }
  // B17/B18 S2：零时间 / 倒退一窗也不推
  {
    const W = boot();
    const d = {};
    W.farfield.auto(d, { day: 3 });
    const snap = JSON.stringify(d.farfield);
    const same = W.farfield.auto(d, { day: 3 });
    const back = W.farfield.auto(d, { day: 2 });
    a(same.reason === 'no-elapsed' && same.windows === 0 && back.reason === 'backward' && back.windows === 0,
      'v2157 B17: 同刻 ⇒ no-elapsed、倒退 ⇒ backward，两者分列且都 0 窗');
    a(JSON.stringify(d.farfield) === snap, 'v2157 B18: 两者**逐字不改**远场状态（同批取比较值）');
  }
  // B19 S2：无世界钟 ⇒ 拒算（不猜日期）
  {
    const W = boot();
    noClock(W);
    const d = {};
    const r = W.farfield.auto(d, {});
    a(r.reason === 'no-clock' && r.wrote === false,
      'v2157 B19: 世界钟未设定 ⇒ no-clock 并如实报 wrote:false（不拿真实时间顶替剧情时间）');
  }
  // B20 S2：auto 未开 ⇒ 拒收（两个门分列）
  {
    const W = boot();
    W.farfield.setSettings(Object.assign({}, W.farfield.getSettings(), { auto: false }));
    const r = W.farfield.auto({}, { day: 2 });
    a(r.reason === 'auto-off' && r.wrote === false, 'v2157 B20: auto 未开 ⇒ auto-off（总开关与自动门分列，两者都可归因）');
  }
  // B21 AI 请求数变化为零
  {
    const W = boot();
    W.apiRouter.resetCallStats();
    const n0 = W.apiRouter.callStats(99).tracked;
    const d = {};
    W.farfield.auto(d, { day: 1 });
    W.farfield.auto(d, { day: 6 });
    const n1 = W.apiRouter.callStats(99).tracked;
    a(n0 === 0 && n1 === 0, 'v2157 B21: 跑完一轮自动推进，apiRouter 跟踪的通道数**变化为零**（纯规则，不消耗 AI）');
  }
  // B22/B23 工作流节点在场且紧邻 region.offline 之后
  {
    const W = boot();
    const after = W.workflow.list('after');
    const ff = after.filter(function (n) { return n.id === 'farfield.auto'; })[0];
    const rg = after.filter(function (n) { return n.id === 'region.offline'; })[0];
    a(!!ff && ff.order === 37 && ff.critical === false, 'v2157 B22: farfield.auto 节点在位（after / 37 / critical:false）');
    a(!!rg && ff.order > rg.order, 'v2157 B23: 顺序上**晚于** region.offline（先由 region 记明确事件，再由本模块记大势）');
  }
  // B24 S2 走一次真事务：结果进世界并可从跨会话读回
  {
    const W = boot();
    W.store.transact(function (draft) { W.farfield.auto(draft, { day: 1 }); }, 'v2157:auto-prime');
    let out = null;
    W.store.transact(function (draft) { out = W.farfield.auto(draft, { day: 4 }); }, 'v2157:auto-real');
    const s = W.store.get().farfield;
    a(out && out.windows === 3 && s.autoDay === 4 && s.rounds >= 3 && s.lastTickAt > 1 * DAY,
      'v2157 B24: 真事务里跑一轮并把结果落进世界（窗口 ' + (out && out.windows) + ' / 游标第 ' + s.autoDay + ' 日 / 窗基准已前移 / 脉搏 ' + s.pulses.length + ' 条）');
  }
}

// ── 负控制：真源码破坏 → 加载破坏副本 → 在副本上重跑同款判据 ────────────
function runNegative(a) {
  const src = read(REL);

  a(countOcc(src, ANCHOR_CURSOR) === 1, 'v2157 N1 前提: 游标锚点恰中 1 次');
  const b1 = src.replace(ANCHOR_CURSOR, '    b.lastTickAt = now;');
  a(b1 !== src, 'v2157 N1a: 破坏副本已生成（内存态，真源码不动）');
  {
    const W = boot(ov(REL, b1));
    const d = draftOf(W);
    W.farfield.tick(d, { now: 1 * DAY });
    W.farfield.tick(d, { now: 1 * DAY + 6 * DAY, rounds: 2 });
    a(d.farfield.lastTickAt !== 3 * DAY,
      'v2157 N1b: 破坏后游标被推到 now（未处理窗口静默丢失；实 ' + d.farfield.lastTickAt + '）');
  }
  {
    const W = boot();
    const d = draftOf(W);
    W.farfield.tick(d, { now: 1 * DAY });
    W.farfield.tick(d, { now: 1 * DAY + 6 * DAY, rounds: 2 });
    a(d.farfield.lastTickAt === 3 * DAY, 'v2157 N2: 同款判据在原版上为真（游标停在 3 日）—— 破坏确实改变了行为');
  }

  a(countOcc(src, ANCHOR_HOLD) === 1, 'v2157 N3 前提: 扣留锚点恰中 1 次');
  const b3 = src.replace(ANCHOR_HOLD, '      if (false) { held.push(m.id); return; }');
  a(b3 !== src, 'v2157 N3a: 破坏副本已生成');
  {
    const W = boot(ov(REL, b3));
    W.region.markLane('远方A', true, { why: '路断' });
    const d = draftOf(W, { pending: [{ id: 'm1', place: '远方A', trend: 'war', at: 1, window: 1,
      dueAt: 2 * DAY, delayDays: 1, deliveredAt: 0 }], lastTickAt: 1 });
    const r = W.farfield.deliver(d, { now: 10 * DAY });
    a(r.delivered === 1 && !r.blocked, 'v2157 N3b: 破坏后封路消息被提前落地（「我们收不到」与「那边没发生」同形）');
  }

  a(countOcc(src, ANCHOR_BACKPRESSURE) === 1, 'v2157 N4 前提: 背压闸锚点恰中 1 次');
  const b4 = src.replace(ANCHOR_BACKPRESSURE, "        if (false) { skipped.push({ place: p.name, why: 'pending-full' }); break; }");
  a(b4 !== src, 'v2157 N4a: 破坏副本已生成');
  {
    const W = boot(ov(REL, b4));
    W.farfield.setSettings(Object.assign({}, W.farfield.getSettings(), { capPending: 4, maxPulses: 64 }));
    const d = draftOf(W);
    W.farfield.tick(d, { now: 1 * DAY });
    const r = W.farfield.tick(d, { now: 1 * DAY + 24 * DAY });
    a(!(r.skipped || []).some(function (x) { return x.why === 'pending-full'; }) && W.farfield.stat().pendingFull === 0,
      'v2157 N4b: 破坏后容量裁决不再报出（静默少推 ⇒ 读数上看不见）');
  }

  a(countOcc(src, ANCHOR_AUTOCLOCK) === 1, 'v2157 N5 前提: 世界钟门锚点恰中 1 次');
  const b5 = src.replace(ANCHOR_AUTOCLOCK, "    if (false) { noteFault('no-clock'); return { ok: false, reason: 'no-clock', wrote: false }; }");
  a(b5 !== src, 'v2157 N5a: 破坏副本已生成');
  {
    const W = boot(ov(REL, b5));
    noClock(W);
    const d = {};
    // 显式给 day 也**必须**有一个已设定的世界钟：否则「第 2 日」会被当成真实时刻，
    //   而它其实是「还没定日子」。破坏第一道门后这条绑定就断了。
    a(W.farfield.auto(d, { day: 2 }).reason !== 'no-clock', 'v2157 N5b: 破坏后显式剧情日不再与世界钟绑定（越过「不猜日期」的硬条件）');
  }

  a(countOcc(src, ANCHOR_AUTOZERO) === 1, 'v2157 N6 前提: 零时间闸锚点恰中 1 次');
  const b6 = src.replace(ANCHOR_AUTOZERO, '    if (false) {');
  a(b6 !== src, 'v2157 N6a: 破坏副本已生成');
  {
    const W = boot(ov(REL, b6));
    const d = {};
    W.farfield.auto(d, { day: 3 });
    const t0 = W.farfield.stat().autoTicks;
    W.farfield.auto(d, { day: 3 });           // 同刻重放
    a(W.farfield.stat().autoTicks !== t0,
      'v2157 N6b: 破坏后同刻重放被计入一次真推进（重复楼层被当成新的时间流逝）');
  }

  a(countOcc(src, ANCHOR_AUTOZERO) === 1, 'v2157 N7 前提: 同一锚点仍在（双向自证）');
  {
    const W = boot();
    const d = {};
    W.farfield.auto(d, { day: 3 });
    const t1 = W.farfield.stat().autoTicks;
    W.farfield.auto(d, { day: 3 });
    a(W.farfield.stat().autoTicks === t1, 'v2157 N7: 原版上同款判据仍成立（同刻重放不计入真推进）—— 不是把判据写死');
  }
  a(read(REL) === src, 'v2157 N8: 真源码文件逐字未变（破坏只在内存副本与 fresh 的 vm 上下文里）');
}

function runAll(a) { runA(a); runB(a); }
module.exports = { REL, runA, runB, runAll, runNegative,
  ANCHOR_BUDGET, ANCHOR_CURSOR, ANCHOR_HOLD, ANCHOR_BACKPRESSURE,
  ANCHOR_AUTOGATE, ANCHOR_AUTOCLOCK, ANCHOR_AUTOBASE, ANCHOR_AUTOZERO,
  ANCHOR_TRANSFER, ANCHOR_NODE };

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) { if (cond) { pass++; } else { fail++; console.log('  x ' + msg); } };
  try { runAll(a); } catch (e) { fail++; console.log('  x 抛出：' + e.message); }
  try { runNegative(a); } catch (e) { fail++; console.log('  x 负控制抛出：' + e.message); }
  console.log('SP4-S2-V2157: pass ' + pass + ' / fail ' + fail);
  process.exit(fail ? 1 : 0);
}

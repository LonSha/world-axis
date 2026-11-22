#!/usr/bin/env node
// v2.162.0 专锁（TP7）：容量、存储失败与格式迁移的长局保障。
//
// ── 本锁治的三件事（TP7 原文逐句落地）──────────────────────────────
//   TP7 要求区分「可回收历史」与「不可丢的在途消息、货物、待履约义务、回执去重索引」，
//   容量满采用暂停受理或明确归档；格式迁移采用版本、预检、候选转换与**失败保留原存档**。
//   现场探针（无头）抓到三处缺口，三处都是「静默」而非报错：
//     ① **在途行被环形挤出**：`evict.array` 一律保留尾部 cap 个（最旧优先丢）——
//        而「最旧的」恰恰是「还没到的」：实测 25 批发货，8 批在途货凭空消失，
//        同一份读数与「货已送达」长得一样。
//     ② **写入侧不做容量裁决**：世界满时操作报 ok，用户以为受理了（世界悄悄胀大或丢件）。
//     ③ **未来档被静默降级**：schemaVersion=6 的存档在 SCHEMA_VERSION=1 的代码上载入，
//        既不拒收也不留读数，直接被旧骨架补齐并 save() 写回（实测 3691 → 3730 字节）。
//
// ── 判据分三层（按「静默失效」代价排序）──────────────────────────
//   A 结构面：豁免表覆盖、闸门三处在位、读数分域、迁移两守卫、登记表双真源同值。
//   B 行为面（真 API，不直调内部函数）：
//     B1 第一现场：cap+4 批发货 ⇒ 在途一行不丢（挤出的前提是「有可回收历史」）
//     B2 账目守恒：恰 cap 次 ok / 恰 4 次 in-transit-full，且每次拒收现场在途数=cap
//     B3 到货释放额度 ⇒ 照常受理（修复不得把正当用法一起拒掉）
//     B4 只丢可回收历史：种子 16 已到达 + 16 在途 ⇒ 已到达全清、在途一行不动
//     B5 写入侧如实拒收（`deliverGoods` 返回值，不是内部码）
//     B6 行程（depart）与消息（sendMessage）两个渠道同样有闸
//     B7 在途消息在封路时也不被挤出（同一缺陷在第二个渠道上的形态）
//     B8 读数分域：held/full 可读，且**不**混进 evictFailed / failedBy
//     B9 未来档：逐字节未改 + 拒收读数在册 + 诊断出 error 级议题
//     B10 正当迁移不被拒收误伤（低版本档照常迁移并落盘）
//   N 负控制（**真源码内存副本**破坏，两向自证）：每条先证「原版上同款判据为真」，
//     再证「破坏版上同款判据为假」，最后证「真源文件逐字未变」。
//     N1 拆掉 `liveN > cap` 早退 ⇒ 在途行照旧被丢（缺陷复现）
//     N2 只留守卫、拆掉读数行 ⇒ 拒收发生但**看不见**（静默形态）
//     N3 拆掉写入侧闸 ⇒ 操作报 ok 而世界超 cap 悄悄胀大（缺陷复现）
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');

const REL_EVICT = 'core/evict.js';
const REL_STORE = 'core/store.js';
const REL_WORLD = 'engines/world.js';
const REL_DIAG = 'engines/tool-diag.js';

// ── 锚点（真源码里各恰中 1 次）─────────────────────────────────
const A_LIVE_EARLY = '      if (liveN > cap) {';
const A_ISLIVE = '    const isLive = IN_TRANSIT[site];';
const A_LIVE_EVID = '          inTransit: liveN, cap: cap };';
const A_GUARD_INIT = '      if (__futureV !== null && __futureV > SCHEMA_VERSION) {';
const A_GUARD_READ = '        __loadStat.lastRefused = { from: __futureV, current: SCHEMA_VERSION, at: clockWall() };';
const A_GATE_DEPART = "      if (evJ && evJ.ok === false && evJ.reason === 'in-transit-full') {";
const A_GATE_GOODS = "      if (evS && evS.ok === false && evS.reason === 'in-transit-full') {";
const A_GATE_MSG = "      if (evM && evM.ok === false && evM.reason === 'in-transit-full') {";

function countOcc(s, sub) { return s.split(sub).length - 1; }
function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function ov(file, src) { const o = {}; o[file] = src; return o; }
function merge(o1, o2) { const o = Object.assign({}, o1 || {}); Object.keys(o2 || {}).forEach(function (k) { o[k] = o2[k]; }); return o; }

let __seq = 0;
/** 起一个干净宿主（每例独立聊天 id —— 上一例的世界会黏在 memCache 上）。 */
function boot(srcOv) {
  const chatId = 'tp7_' + (++__seq);
  const WA = sync.fresh(srcOv ? { srcOverride: srcOv } : {}).WA;
  try {
    const c = global.SillyTavern.getContext();
    c.chatId = chatId; c.chatMetadata = {};
    c.chat = [{ is_user: true, mes: 'TP7 专锁锚点楼层：北境城的货栈里堆着三十八包盐。', swipe_id: 0 }];
  } catch (e) {}
  WA.store.init();
  return WA;
}
/** 造一对独立地点 + 一条路（不与别的用例共用路段：共用会让判据测错东西）。 */
function pair(WA, tag, minutes) {
  const a = tag + '甲地', b = tag + '乙地';
  WA.world.addPlace({ name: a, kind: 'market' });
  WA.world.addPlace({ name: b, kind: 'market' });
  const rd = WA.world.addRoad(a, b, minutes || 30);
  return { a: a, b: b, road: rd };
}
/** 把货物/消息/行程三张表清空（容量裁决的现场；其余世界状态一概不动）。 */
function clearTables(WA) {
  WA.store.transact(function (d) {
    d.world = (d.world && typeof d.world === 'object') ? d.world : {};
    d.world.shipments = []; d.world.messages = []; d.world.journeys = [];
  }, 'tp7:clear');
}
function shipRows(WA) {
  const w = ((WA.store.get() || {}).world) || {};
  return Array.isArray(w.shipments) ? w.shipments : [];
}
function liveCount(WA) { return shipRows(WA).filter(function (x) { return x && x.status === 'in-transit'; }).length; }
/** 现场注入 N 行在途货运（**不走 API**：本项要造的是「历史遗留的超限存档」形态）。 */
function seedRows(WA, n, status) {
  WA.store.transact(function (d) {
    d.world = (d.world && typeof d.world === 'object') ? d.world : {};
    d.world.shipments = [];
    for (let i = 0; i < n; i++) {
      d.world.shipments.push({ id: 'seed_' + i, channel: 'goods', from: 'A', to: 'B', item: '盐',
        amount: 1, status: status || 'arrived', at: 1 });
    }
  }, 'tp7:seed');
}

// ── A 结构面 ─────────────────────────────────────────────────
function runA(a) {
  const ev = read(REL_EVICT), st = read(REL_STORE), wd = read(REL_WORLD), dg = read(REL_DIAG);
  const LIVE_KEYS = ['world.shipments', 'world.messages', 'world.journeys', 'farfield.pending', 'collab.queue', 'liaison.deals'];
  const miss = LIVE_KEYS.filter(function (k) { return ev.indexOf("'" + k + "':") < 0; });
  a(miss.length === 0, 'v2162/tp7 A1: 在途豁免表覆盖六处义务容器（缺 ' + (miss.join('、') || '无') + '）');
  a(countOcc(ev, 'status === \'in-transit\'') >= 3 && countOcc(ev, 'deliveredAt == null') === 1
    && countOcc(ev, 'flushedAt == null') === 1 && countOcc(ev, 'status === \'pending\'') === 1,
    'v2162/tp7 A2: 六处各按自己的「未完」口径判定（行程/货/消息看 status，远场看 deliveredAt，协作队列看 flushedAt，约定看 pending|due）');
  a(countOcc(ev, A_LIVE_EARLY) === 1, 'v2162/tp7 A3: 在途自身超 cap 时放弃截断的早退恰 1 处（实 ' + countOcc(ev, A_LIVE_EARLY) + '）');
  a(countOcc(ev, A_LIVE_EVID) === 1, 'v2162/tp7 A4: 拒收时交出证据（inTransit 与 cap）恰 1 处');
  a(ev.indexOf('live: { held: liveStat.held, full: liveStat.full') > 0,
    'v2162/tp7 A5: 读数四键（held/full/lastSite/lastAt）进 evictStat');
  const noteFailBody = (function () {
    const i = ev.indexOf('function noteFail(site, reason) {');
    if (i < 0) return null;
    const j = ev.indexOf('\n  }', i);
    return j < 0 ? null : ev.slice(i, j);
  })();
  a(noteFailBody !== null && noteFailBody.indexOf('liveStat') < 0,
    'v2162/tp7 A6: 容量裁决与实现缺陷分域 —— liveStat 不出现在 noteFail 内（混进去会让「挤出器坏了」与「世界真满了」同形）');
  a([A_GATE_DEPART, A_GATE_GOODS, A_GATE_MSG].every(function (x) { return countOcc(wd, x) === 1; }),
    'v2162/tp7 A7: 三个写入侧入口（行程/货运/消息）各有恰 1 处容量闸');
  a(countOcc(wd, "out = { ok: false, reason: 'in-transit-full'") === 3
    && countOcc(wd, "return { ok: false, reason: 'in-transit-full'") === 0,
    'v2162/tp7 A8: 三处拒收各以**同一形态**经 out 交回调用方（就地 return 会让收尾台账以为这一步压根没跑；实 '
      + countOcc(wd, "out = { ok: false, reason: 'in-transit-full'") + ' 处）');
  a(countOcc(wd, "{ ok: false, reason: 'in-transit-full'") === 3,
    'v2162/tp7 A8b: 全模块恰 3 处同一形态（每个入口一处；多的那处即「第二份裁决」；实 '
      + countOcc(wd, "{ ok: false, reason: 'in-transit-full'") + ' 处）');
  a(countOcc(st, A_GUARD_INIT) === 1 && countOcc(st, "if (fromV > SCHEMA_VERSION && (typeof targetVersion") === 1,
    'v2162/tp7 A9: 未来档守卫两处（init 载入路径 + migrate 内部）各恰 1 处');
  a(countOcc(st, A_GUARD_READ) === 1 && st.indexOf('migrateRefused: 0, lastRefused: null }') > 0,
    'v2162/tp7 A10: 拒收在读数面留痕（计数 + 带 from/current/at 的最近一次）');
  a(st.indexOf('if (__migRep && __migRep.refused) {') > 0,
    'v2162/tp7 A11: init 的迁移分支在拒收时早退不落盘（「迁不动」与「迁失败」不可同形）');
  a(dg.indexOf("mig && mig.refused === 'future-schema'") > 0 && dg.indexOf("level: 'error', key: 'schemaMigrate'") > 0,
    'v2162/tp7 A12: 诊断面对未来档出 **error** 级议题（只记读数不报等于没报）');
  a(dg.indexOf("level: 'info', key: 'schemaMigrate'") > 0,
    'v2162/tp7 A13: 正常迁移仍是 info 级（修复不得把好路径也升成红灯）');
  // 登记表双真源：容量声明（store）与挤出站点（evict）逐键同值
  const WA = boot();
  const caps = WA.store.sizeCaps ? WA.store.sizeCaps() : {};
  const decls = WA.evict.siteDecls ? WA.evict.siteDecls() : {};
  const bad = [];
  ['world.shipments', 'world.messages', 'world.journeys'].forEach(function (k) {
    const c1 = caps[k] && (typeof caps[k] === 'number' ? caps[k] : caps[k].cap);
    const c2 = decls[k] && decls[k].cap;
    if (c1 !== c2) bad.push(k + '(' + c1 + '≠' + c2 + ')');
  });
  a(bad.length === 0, 'v2162/tp7 A14: 三张在途表的 cap 在「登记表」与「挤出站点」里同值（实 ' + (bad.join('、') || '一致') + '）');
}

// ── B 行为面 ─────────────────────────────────────────────────
function runB(a) {
  // B1/B2 第一现场：cap + 4 批发货 ⇒ 在途一行不丢；账目守恒
  const W1 = boot();
  const p1 = pair(W1, 'tp7b1');
  clearTables(W1);
  W1.world.setSettings({ enabled: true });
  const cap = W1.evict.siteDecls()['world.shipments'].cap;
  const codes = [];
  for (let i = 0; i < cap + 4; i++) {
    const r = W1.world.deliverGoods(p1.a, p1.b, '盐', 1, { at: 7000000 });
    codes.push(r && r.ok === false ? r.reason : 'ok');
  }
  const okN = codes.filter(function (c) { return c === 'ok'; }).length;
  const fullN = codes.filter(function (c) { return c === 'in-transit-full'; }).length;
  a(liveCount(W1) === cap && shipRows(W1).length === cap,
    'v2162/tp7 B1（承重）: 在途货一行都没丢（在途 ' + liveCount(W1) + ' / 表长 ' + shipRows(W1).length + ' / cap ' + cap + '）'
      + ' —— 原形态会在第 ' + (cap + 1) + ' 次挤出最旧的那批在途货，而读数与「已送达」同形');
  a(okN === cap && fullN === 4, 'v2162/tp7 B2: 账目守恒：恰 ' + cap + ' 次受理 / 恰 4 次拒收（实 ' + okN + ' / ' + fullN + '）');
  a(codes.indexOf('in-transit-full') >= cap, 'v2162/tp7 B2b: 拒收发生在额度用尽之后（不是一上来就拒）');

  // B3 到货释放额度 => 照常受理（修复不得误伤）
  const freeAt = 7000000 + 60 * 60000;
  W1.world.tickCourier(freeAt);
  const liveAfter = liveCount(W1);
  const r3 = W1.world.deliverGoods(p1.a, p1.b, '盐', 1, { at: freeAt });
  a(liveAfter === 0, 'v2162/tp7 B3a: 到点结算把在途行落成 arrived（实剩在途 ' + liveAfter + '）');
  a(r3 && r3.ok === true, 'v2162/tp7 B3: 额度释放后照常受理（修复不得把正当用法一起拒掉；实 ' + JSON.stringify(r3 && r3.reason || r3 && r3.ok) + '）');

  // B4 只丢可回收历史：16 已到达 + 16 在途 => 已到达全清、在途一行不动
  const W4 = boot();
  W4.store.transact(function (d) {
    d.world = (d.world && typeof d.world === 'object') ? d.world : {};
    d.world.shipments = [];
    for (let i = 0; i < cap; i++) d.world.shipments.push({ id: 'a' + i, status: 'arrived', at: i });
    for (let i = 0; i < cap; i++) d.world.shipments.push({ id: 'l' + i, status: 'in-transit', at: 1000 + i });
  }, 'tp7:b4seed');
  const rB4 = W4.evict.array(shipRows(W4), 'world.shipments');
  const surv = shipRows(W4);
  a(rB4.ok === true && rB4.dropped === cap && rB4.inTransitKept === cap,
    'v2162/tp7 B4: 截断只吃可回收历史（丢 ' + rB4.dropped + ' / 保 ' + rB4.inTransitKept + ' / reason ' + (rB4.reason || 'ok') + '）');
  a(surv.length === cap && surv.every(function (x) { return x.status === 'in-transit'; }),
    'v2162/tp7 B4b: 幸存行**全部**是在途（实 ' + surv.map(function (x) { return x.status; }).join(',') + '）——「环形挤出」的语义只在终态上成立');

  // B5/B8 写入侧拒收 + 读数分域
  const W5 = boot();
  const p5 = pair(W5, 'tp7b5');
  clearTables(W5); W5.world.setSettings({ enabled: true });
  W5.evict.resetEvictStat();
  let last = null;
  for (let i = 0; i < cap + 1; i++) last = W5.world.deliverGoods(p5.a, p5.b, '盐', 1, { at: 7000000 });
  a(last && last.ok === false && last.reason === 'in-transit-full',
    'v2162/tp7 B5: 写入侧如实拒收（返回值 ' + JSON.stringify(last) + '）—— 满员时报 ok 就是「操作成功但世界没变」');
  const es5 = W5.evict.evictStat();
  a(es5.live && es5.live.full >= 1 && es5.live.lastSite === 'world.shipments',
    'v2162/tp7 B8: 容量裁决进自己的读数（live.full ' + (es5.live && es5.live.full) + ' / ' + (es5.live && es5.live.lastSite) + '）');
  a(!es5.failedBy.overflow && !es5.failedBy['in-transit-full'] && es5.evictFailed === 0,
    'v2162/tp7 B8b: **不**混进 failedBy（世界满了不是挤出器坏了；实 failedBy ' + JSON.stringify(es5.failedBy) + '）');

  // B6 行程（depart）渠道同样有闸：
  //   夹具为什么用**现场注入**而不是「连发 N 次出发」：后者的失败原因会被别的东西吃掉
  //   （地点数上限 / 每人的 already-in-transit / 路网容量），于是判据测的就不再是「在途满」。
  //   本项要的现场是「历史遗留的超限存档」形态，注入正是它的诚实造法。
  const W6 = boot();
  const p6 = pair(W6, 'tp7b6');
  clearTables(W6); W6.world.setSettings({ enabled: true });
  const jcap = W6.evict.siteDecls()['world.journeys'].cap;
  W6.world.addPlace({ name: 'tp7b6起点', kind: 'market' });
  W6.world.addRoad('tp7b6起点', p6.b, 30);
  W6.store.transact(function (d) {
    d.world = (d.world && typeof d.world === 'object') ? d.world : {};
    d.world.journeys = [];
    for (let i = 0; i < jcap - 1; i++) {
      d.world.journeys.push({ id: 'jn_seed' + i, person: '占位旅人' + i, from: p6.a, to: p6.b,
        status: 'in-transit', at: 1 });
    }
  }, 'tp7:b6seed');
  const r6a = W6.world.depart('新旅人甲', 'tp7b6起点', p6.b);
  a(r6a && r6a.ok === true,
    'v2162/tp7 B6a: 额度未满时照常受理（实 ' + JSON.stringify(r6a && (r6a.reason || r6a.ok)) + '）—— 闸不能一上来就关');
  const r6b = W6.world.depart('新旅人乙', 'tp7b6起点', p6.b);
  a(r6b && r6b.ok === false && r6b.reason === 'in-transit-full',
    'v2162/tp7 B6（承重）: 行程渠道在途满时如实拒收（实 ' + JSON.stringify(r6b) + '）—— 与货运同一条纪律');
  const jRows = (((W6.store.get() || {}).world) || {}).journeys || [];
  a(jRows.length === jcap && !jRows.some(function (x) { return x && x.person === '新旅人乙'; }),
    'v2162/tp7 B6b: 被拒的行程**不入表**（表长 ' + jRows.length + ' === cap ' + jcap
      + '）—— 「被拒的也留下痕迹」是最难发现的一种');

  // B7 在途消息在封路时也不被挤出
  const W7 = boot();
  const p7 = pair(W7, 'tp7b7');
  clearTables(W7); W7.world.setSettings({ enabled: true });
  const mcap = W7.evict.siteDecls()['world.messages'].cap;
  for (let i = 0; i < mcap; i++) W7.world.sendMessage(p7.a, p7.b, { text: 'm' + i, at: 7000000 });
  const rowsBefore = (((((W7.store.get() || {}).world) || {}).messages) || []).length;
  const rBlk = W7.world.addBlock(p7.a, p7.b, { kinds: ['message'], from: 0, to: 0 });
  void rBlk;
  const r7 = W7.world.sendMessage(p7.a, p7.b, { text: '封路后的一封', at: 7000100 });
  const mRows = (((W7.store.get() || {}).world) || {}).messages || [];
  a(mRows.length === rowsBefore && mRows.filter(function (x) { return x && x.status === 'in-transit'; }).length === mcap,
    'v2162/tp7 B7: 消息渠道同样守住上限（表长 ' + mRows.length + ' / 在途 ' + mcap + '）——在途消息承载「话到哪了」，被挤出会让「在路上」与「没发出」同形');
  a(r7 && (r7.ok === false ? r7.reason === 'in-transit-full' : true),
    'v2162/tp7 B7b: 第 ' + (mcap + 1) + ' 条消息要么如实拒收（' + (r7 && r7.reason) + '），要么在额度内受理');

  // B9 未来档：逐字节未改 + 读数在册 + 诊断 error
  const W9 = boot();
  const key = 'worldaxis_state_' + W9.store.chatId();
  const future = JSON.stringify({ schemaVersion: 6, worldFacts: [{ key: '未来一手', value: '1' }], __zz: { n: 5 } });
  global.localStorage.setItem(key, future);
  const beforeBytes = global.localStorage.getItem(key).length;
  W9.store.init();
  const afterBytes = global.localStorage.getItem(key).length;
  const rawAfter = JSON.parse(global.localStorage.getItem(key));
  a(afterBytes === beforeBytes && rawAfter.schemaVersion === 6 && rawAfter.__zz && rawAfter.__zz.n === 5,
    'v2162/tp7 B9（承重）: 未来档逐字节未改（' + beforeBytes + ' → ' + afterBytes + '，schemaVersion ' + rawAfter.schemaVersion + '）'
      + ' —— 原形态被旧骨架补齐并写回（实测 3691 → 3730）');
  const rep9 = W9.store.migrateReport();
  const ls9 = W9.store.loadStat();
  a(rep9 && rep9.refused === 'future-schema' && rep9.from === 6 && rep9.current === 1,
    'v2162/tp7 B9b: 拒收如实上账（' + JSON.stringify(rep9 && { r: rep9.refused, f: rep9.from, c: rep9.current }) + '）');
  a(ls9.migrateRefused >= 1 && ls9.lastRefused && ls9.lastRefused.from === 6 && ls9.lastRefused.current === 1,
    'v2162/tp7 B9c: 读数面带 from/current/at（最近一次 ' + JSON.stringify(ls9.lastRefused) + '）——只有计数时两次拒收之间无法区分');
  const dg9 = W9.toolDiag.collect();
  const iss9 = ((dg9.verdict || {}).issues || []).filter(function (x) { return x.key === 'schemaMigrate'; })[0];
  a(!!iss9 && iss9.level === 'error' && /拒收不降级/.test(iss9.detail),
    'v2162/tp7 B9d: 诊断出 error 级议题（' + (iss9 && iss9.level) + '）');
  a(W9.store.get() && Array.isArray((W9.store.get().worldFacts || [])),
    'v2162/tp7 B9e: 拒收后内存仍是可用的世界（不是把会话打断）');

  // B10 正当迁移不被误伤：低版本档照常迁移并落盘
  const W10 = boot();
  const key10 = 'worldaxis_state_' + W10.store.chatId();
  global.localStorage.setItem(key10, JSON.stringify({ schemaVersion: 0, worldFacts: [{ key: '旧档一手', value: '1' }], clock: { label: 'L' } }));
  W10.store.init();
  const raw10 = JSON.parse(global.localStorage.getItem(key10));
  a(raw10.schemaVersion === 1, 'v2162/tp7 B10: 低版本档照常迁移到当前版本并落盘（实 ' + raw10.schemaVersion + '）');
  a(W10.store.get().clock && W10.store.get().clock.label === 'L' && (W10.store.get().worldFacts || [])[0].key === '旧档一手',
    'v2162/tp7 B10b: 迁移保留业务数据（既有契约不回退）');
  a(!(W10.store.migrateReport() && W10.store.migrateReport().refused),
    'v2162/tp7 B10c: 正当迁移不带 refused 标签（拒收与迁移在读数上分列）');
}

// ── N 负控制：真源码内存副本破坏，两向自证 ─────────────────────
function runN(a) {
  const cap = (function () { const W = boot(); return W.evict.siteDecls()['world.shipments'].cap; })();
  const ev0 = read(REL_EVICT), st0 = read(REL_STORE), wd0 = read(REL_WORLD);

  a(countOcc(ev0, A_LIVE_EARLY) === 1 && countOcc(st0, A_GUARD_INIT) === 1
    && countOcc(st0, A_GUARD_READ) === 1 && countOcc(wd0, A_GATE_GOODS) === 1,
    'v2162/tp7 N0: 四个破坏锚点在真源码里各恰中 1 次（锚点不存在/不唯一会让破坏落在别处）');

  // ── N1 拆掉全部在途豁免 ⇒ 逐字回到「保留尾部 cap 个」的旧语义，在途货照旧被丢 ──
  //   为什么破 `isLive` 的取值而不是破 `liveN > cap` 那个早退：早退只回答「在途自己超了要不要放弃截断」，
  //   破它之后在途行仍然**全被保住**（豁免主体还在），于是「在途一行不丢」这条判据照样为真
  //   —— 判据不敏感（实测踩中：破坏版报 0 行丢失）。破取值才让缺陷真正复现。
  const A_IS = '    const isLive = IN_TRANSIT[site];';
  a(countOcc(ev0, A_IS) === 1, 'v2162/tp7 N1 前提: 豁免取值锚点恰中 1 次');
  const W1o = boot(); const p1o = pair(W1o, 'tp7n1o');
  clearTables(W1o); W1o.world.setSettings({ enabled: true });
  let okO = 0;
  for (let i = 0; i < cap + 4; i++) {
    const r = W1o.world.deliverGoods(p1o.a, p1o.b, '盐', 1, { at: 7000000 });
    if (r && r.ok === true) okO++;
  }
  a(okO === cap && liveCount(W1o) === cap && okO === liveCount(W1o),
    'v2162/tp7 N1a: 原版判据成立（受理 ' + okO + ' 批 === 存留在途 ' + liveCount(W1o) + ' 批）—— 报几批就是几批');
  const b1 = ev0.replace(A_IS, '    const isLive = null;');
  a(b1 !== ev0, 'v2162/tp7 N1b: 破坏副本已生成（内存态，真源码不动）');
  const W1b = boot(ov(REL_EVICT, b1)); const p1b = pair(W1b, 'tp7n1b');
  clearTables(W1b); W1b.world.setSettings({ enabled: true });
  let okB = 0;
  for (let i = 0; i < cap + 4; i++) {
    const r = W1b.world.deliverGoods(p1b.a, p1b.b, '盐', 1, { at: 7000000 });
    if (r && r.ok === true) okB++;
  }
  const lost = okB - liveCount(W1b);
  a(okB === cap + 4 && lost >= 4,
    'v2162/tp7 N1c（缺陷复现）: 破坏版报受理 ' + okB + ' 批、世界只剩 ' + liveCount(W1b) + ' 行 ⇒ 净丢 ' + lost
      + ' 批在途货，而每一次写入侧都报 ok（「操作成功但世界悄悄丢件」）');
  a(lost >= 4 && liveCount(W1b) === cap,
    'v2162/tp7 N1d: 破坏版让「报几批就是几批」这条判据**为假**（受理 ' + okB + ' ≠ 存留 ' + liveCount(W1b) + '）');

  // ── N2 只拆读数行 ⇒ 拒收发生了，但看不见（静默形态） ──
  const b2 = st0.replace(A_GUARD_READ, '        void 0;');
  a(b2 !== st0, 'v2162/tp7 N2a: 破坏副本已生成');
  const W2b = boot(ov(REL_STORE, b2));
  const k2 = 'worldaxis_state_' + W2b.store.chatId();
  const fut2 = JSON.stringify({ schemaVersion: 6, worldFacts: [{ key: '未来一手', value: '1' }] });
  global.localStorage.setItem(k2, fut2);
  W2b.store.init();
  a(global.localStorage.getItem(k2) === fut2,
    'v2162/tp7 N2b: 破坏版**仍然**拒收（磁盘逐字节未改）—— 这一层判据不敏感，故必须另有一条读数判据');
  const ls2 = W2b.store.loadStat();
  a(ls2.lastRefused === null,
    'v2162/tp7 N2c（静默复现）: 拆掉读数行后，拒收在读数面上**完全不可见**（lastRefused ' + JSON.stringify(ls2.lastRefused) + '）'
      + ' —— 用户看到的是「世界莫名其妙没动」，而账上一切正常');
  const W2o = boot();
  const k2o = 'worldaxis_state_' + W2o.store.chatId();
  global.localStorage.setItem(k2o, fut2);
  W2o.store.init();
  a(W2o.store.loadStat().lastRefused && W2o.store.loadStat().lastRefused.from === 6,
    'v2162/tp7 N2d: 原版上同款读数判据为真（实 ' + JSON.stringify(W2o.store.loadStat().lastRefused) + '）');

  // ── N3 拆掉写入侧闸 ⇒ 操作报 ok 而世界超 cap 悄悄胀大 ──
  const b3 = wd0.replace(A_GATE_GOODS, '      if (false) {');
  a(b3 !== wd0, 'v2162/tp7 N3a: 破坏副本已生成');
  const W3o = boot(); const p3o = pair(W3o, 'tp7n3o');
  clearTables(W3o); W3o.world.setSettings({ enabled: true });
  let lastOk = null;
  for (let i = 0; i < cap + 4; i++) lastOk = W3o.world.deliverGoods(p3o.a, p3o.b, '盐', 1, { at: 7000000 });
  a(lastOk && lastOk.ok === false && lastOk.reason === 'in-transit-full',
    'v2162/tp7 N3b: 原版上第 ' + (cap + 1) + ' 次发货如实拒收（实 ' + JSON.stringify(lastOk && lastOk.reason) + '）');
  const W3b = boot(ov(REL_WORLD, b3)); const p3b = pair(W3b, 'tp7n3b');
  clearTables(W3b); W3b.world.setSettings({ enabled: true });
  let lastBad = null;
  for (let i = 0; i < cap + 4; i++) lastBad = W3b.world.deliverGoods(p3b.a, p3b.b, '盐', 1, { at: 7000000 });
  a(lastBad && lastBad.ok === true,
    'v2162/tp7 N3c（缺陷复现）: 拆掉闸后第 ' + (cap + 1) + ' 次发货报 **ok**（实 ' + JSON.stringify(lastBad && lastBad.reason || lastBad && lastBad.ok) + '）');
  a(shipRows(W3b).length > cap,
    'v2162/tp7 N3d: 世界**超 cap 悄悄胀大**（表长 ' + shipRows(W3b).length + ' > cap ' + cap + '）—— 这正是 TP7 点名的「操作成功但世界悄悄变了」');

  // ── 真源未被污染 ──
  a(read(REL_EVICT) === ev0 && read(REL_STORE) === st0 && read(REL_WORLD) === wd0,
    'v2162/tp7 N4: 全部负控制跑完后三个真源文件逐字未变（破坏只在内存副本）');
}

function runAll(a) { runA(a); runB(a); runN(a); }
module.exports = { runA: runA, runB: runB, runN: runN, runNegative: runN, runAll: runAll,
  A_LIVE_EARLY: A_LIVE_EARLY, A_ISLIVE: A_ISLIVE, A_GUARD_INIT: A_GUARD_INIT, A_GUARD_READ: A_GUARD_READ, A_GATE_GOODS: A_GATE_GOODS };

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) { if (cond) { pass++; } else { fail++; console.log('  x ' + msg); } };
  const m = process.argv[2] || 'all';
  try {
    if (m === 'a') runA(a);
    else if (m === 'b') runB(a);
    else if (m === 'n') runN(a);
    else runAll(a);
  } catch (e) { fail++; console.log('  x 抛出：' + (e && e.message) + '\n' + (e && e.stack || '')); }
  console.log('S3-TP7-V2162: pass ' + pass + ' / fail ' + fail);
  process.exit(fail ? 1 : 0);
}

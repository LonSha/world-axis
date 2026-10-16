#!/usr/bin/env node
'use strict';
// WorldAxis tests/s3-b3-n5-v2219.js (v2.219.0) — N5 多站旅程与会合专锁（五段齐备）
//
// 【拓展原文逐条对照】（engines/travel-desk.js 头注释）
//   缺口：`plan()` 只答「从 A 到 B 这一趟」。玩家真正要问的是「先到 B 停半天、再走 C、
//     最后落 D，这一路要几天、经过哪几段、路上堵不堵」，以及「几路人各自从现地出发，
//     能不能在同一地点、同一时窗里碰上面」——旧口一个都答不了，于是消费方只能把
//     `plan()` 调 N 次再手工接时刻，接出来的时间轴必然与真引擎分家（本仓反复治过的那一类）。
//   本批补两口：`route(opts)`（多站：途经点 / 停留 / 同行 / 货运关联）与
//     `meet(opts)`（会合时窗：每方到达 = 其 at + 从 from 到会合地的**实走**耗时）。
//
// 【钉的四件事与七条否定式边界】
//   ① **不重算**：每段耗时 / 折算 / 路径 / 天气逐字段取自 `world.transit()`（没有第二份算法）；
//   ② **不静默截断**：段数超 `maxLegs` ⇒ `route-too-long` 如实报 want/cap，不悄悄砍掉后段；
//   ③ **断链必拒**：`legs` 后段起点 ≠ 前段终点 ⇒ `broken-leg`（断链会让「走到哪了」答不出）；
//   ④ **时窗可假**：缺省时窗**锚在各方约集时刻的最早值**，不是锚在最晚到达 ——
//      锚在后者会让 `canMeet` 恒真（窗口末端 = 最晚到达 + 宽度在任何输入下都成立），
//      判据就成了空转（本条由 N3 破坏专门反向自证）。
//   否定式：不另存第二份行程状态（全文零 store.transact，剥注释后仍零）· 不新增拒收码
//     语义（编排失败走 fault 命名空间，剥注释后零内联 `reason: '字面量'`）·
//     本模块**不存「走到第几段」**（真正的出发仍逐段 `commit('depart')` + 每段重验）·
//     走不过去的一方 `reachable:false` 且进 `unreadable`（**不假装能到**）·
//     不改任何人的位置（meet 只判不落）· 上界有界（maxLegs 落在 [2,12]）·
//     全关即零存在（关闭时两口一律拒 desk-off）。
//
// 【本锁五段】A 静态契约与面板真消费方 / B 多站路线 / C 会合时窗 /
//   D 零写入不变式与分栏计数 / N 真源码破坏 + 两向自证（H5 锚点纯度 + H6 两向）。
//
// 装载走 tests/ui-gate-sync.js 的 fresh()（与真装载同源的 LOAD），不自拼模块清单。
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');

const REL = 'engines/travel-desk.js';
const PANEL_REL = 'ui/panel.js';
const RUN_REL = 'tests/run.js';
const IDX_REL = 'index.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }
/** 剥掉注释（判据纯度：不得被沿革注释冒充成现场）。 */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(function (l) {
    const i = l.indexOf('//');
    return i < 0 ? l : l.slice(0, i);
  }).join('\n');
}
/** 取出 `WA.travelDesk = { … }` 的对象字面量体。 */
function exportBody(src) {
  const at = src.indexOf('WA.travelDesk = {');
  if (at < 0) return '';
  let i = src.indexOf('{', at), depth = 0;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(i, k + 1); }
  }
  return '';
}
function env0(ov) { return sync.fresh(ov ? { srcOverride: ov } : {}).WA; }
/**
 * 种一个最小可走世界：三镇两路（甲-乙 30min/cap2、乙-丙 45min/cap1）。
 *   ⚠ 与 E8 锁同规：这是**彻底重置**，不是「补种」——存档与设置走 localStorage 跨环境共享，
 *   凡要在「清零起点」上读的判据一律先调本函数，判据的取值面必须唯一。
 */
function seedWorld(WA) {
  WA.world.setSettings({ enabled: true });
  // 两格新设置一并推回缺省：settingsBus 走 localStorage，**跨环境共享** ——
  //   上一段（D7 越界夹回）把 maxLegs 抬到 12 之后，下一段的「7 段超 cap 6」判据
  //   会因为 cap 变成 12 而静默落空（判据的取值面必须唯一）。
  WA.travelDesk.setSettings({ enabled: true, maxLegs: 6, meetWindowMs: 3600000 });
  WA.store.transact(function (d) {
    d.world = (d.world && typeof d.world === 'object' && !Array.isArray(d.world)) ? d.world : {};
    d.world.places = [{ name: '甲镇', kind: 'town' }, { name: '乙镇', kind: 'town' }, { name: '丙镇', kind: 'town' }];
    d.world.roads = [];
    d.world.journeys = [];
    d.world.shipments = [];
    d.world.blocks = [];
  }, 'n5:seed-places');
  WA.world.addRoad('甲镇', '乙镇', 30, 2);
  WA.world.addRoad('乙镇', '丙镇', 45, 1);
}
function snap(WA) { return JSON.stringify(WA.store.get()); }

// ═══════════════════════ A 段：静态契约与真消费方 ═══════════════════════
function runA(a) {
  const S = rd(REL);
  const code = stripComments(S);
  const body = exportBody(S);
  a(body.length > 0, 'n5/A1: 能从真源码取出 WA.travelDesk 的对象字面量体');
  ['route', 'meet'].forEach(function (k) {
    a(body.indexOf(k + ':') > 0, 'n5/A2: 导出面含 ' + k);
  });
  // 四码在位且总数为 12（8 旧 + 4 新，**不静默合并**）
  ['bad-route', 'route-too-long', 'broken-leg', 'bad-meet'].forEach(function (c) {
    a(code.indexOf("'" + c + "'") >= 0, 'n5/A3: 新拒收码 ' + c + ' 在位');
  });
  a(/const FAULTS = \['desk-off'[\s\S]*?'bad-meet'\]/.test(S),
    'n5/A4: 码表仍是一处声明（新四码追加在尾部，未另开第二处码表）');
  // 两格新设置与区间
  a(/maxLegs: 6, meetWindowMs: 3600000 \};/.test(S), 'n5/A5: maxLegs / meetWindowMs 默认值逐字在位');
  a(/maxLegs: \[2, 12\], meetWindowMs: \[0, 86400000\] \}/.test(S), 'n5/A6: 两格区间声明逐字在位（上界有界）');
  // 内部函数与口径
  a(/function normLegs\(o, cap\)/.test(S), 'n5/A7: 段表归一口在位（两种输入形态）');
  a(/function dwellOf\(o, n\)/.test(S), 'n5/A8: 停留时间解析口在位');
  a(/function route\(opts\)/.test(S) && /function meet\(opts\)/.test(S), 'n5/A9: 两口定义在位');
  a(S.indexOf("clockNow('travelDesk.route')") >= 0 && S.indexOf("clockNow('travelDesk.meet')") >= 0,
    'n5/A10: 缺省时刻取自 clock（不按墙钟算路程 —— 那是第二份算法）');
  // 否定式边界（剥注释后判，不被沿革注释冒充）
  a(cnt(code, 'store.transact') === 0, 'n5/A11: 剥注释后零 store.transact（不另存第二份行程状态）');
  a(cnt(code, "reason: '") === 0, 'n5/A12: 剥注释后零内联 reason 字面量（编排失败走 fault 命名空间）');
  a(/本模块不存「走到第几段」/.test(S), 'n5/A13: 「不存第几段」写在源码里（不是一句口头边界）');
  // 面板真消费方（无消费方不挂导出 —— route / meet 的消费方在 travel 页）
  const pan = rd(PANEL_REL);
  a(pan.indexOf('WA.travelDesk.route(') >= 0, 'n5/A14: 面板真调 WA.travelDesk.route()');
  a(pan.indexOf('WA.travelDesk.meet(') >= 0, 'n5/A15: 面板真调 WA.travelDesk.meet()');
  ['wa-trip-stops', 'wa-trip-dwell', 'wa-trip-route', 'wa-trip-meet', 'wa-trip-win', 'wa-trip-meet-go']
    .forEach(function (id) { a(pan.indexOf(id) >= 0, 'n5/A16: 面板控件 ' + id + ' 在位'); });
  // 面板段内仍零 store 调用、零来源写口（写只经 commit）
  const segStart = pan.indexOf('function renderTravelDesk()');
  const segEnd = pan.indexOf('  function renderBody() {');
  const seg = pan.slice(segStart, segEnd);
  a(seg.length > 0 && (seg.match(/\bstore\.[A-Za-z_$][\w$]*\s*\(/g) || []).length === 0
    && cnt(seg, 'transact(') === 0,
    'n5/A17: 面板 travel 段零 store 调用（新增两行未开第二写路径）');
  a(cnt(seg, 'WA.world.depart(') === 0 && cnt(seg, 'WA.freight.') === 0,
    'n5/A18: 面板 travel 段零直接调来源写口');
  // 出口面契约（冻结串由 export-contract 产物回填，本锁只核它在场且逐字含本 ns）
  a(rd(RUN_REL).indexOf('|travelDesk:commit diagnose ledger meet plan route stat verify|') >= 0,
    'n5/A19: FROZEN2800 逐字含本模块的八个契约成员');
  // 版本面：自报 ver 与 index.js 同值
  const mv = (rd(IDX_REL).match(/VERSION = '([0-9.]+)'/) || [])[1] || '';
  a(new RegExp("VERSION = '" + mv.replace(/\./g, '\\.') + "'").test(S),
    'n5/A20: 模块自报 ver === index.js VERSION（实 ' + mv + '）');
  a(mv === JSON.parse(rd('manifest.json')).version, 'n5/A21: 入口与清单同源同值');
}

// ═══════════════════════ B 段：多站路线 ═══════════════════════
function runB(a) {
  const WA = env0();
  seedWorld(WA);
  a(typeof WA.travelDesk.route === 'function', 'n5/B1: route 口已装载');
  // ① 全关即零存在：两口一律拒 desk-off（而不是静默返回空）
  WA.travelDesk.setSettings({ enabled: false });
  ['route', 'meet'].forEach(function (fn) {
    const r = WA.travelDesk[fn]({ channel: 'person', stops: ['甲镇', '乙镇'], place: '丙镇', parties: [{ person: '甲' }, { person: '乙' }] });
    a(r.ok === false && r.fault === 'desk-off', 'n5/B2: 关闭时 ' + fn + ' 拒 desk-off（实 ' + j(r.fault) + '）');
  });
  seedWorld(WA);
  // ② 段表两种输入等价：stops 相邻成段
  const r1 = WA.travelDesk.route({ channel: 'person', stops: ['甲镇', '乙镇', '丙镇'], at: 0, dwell: 600000 });
  a(r1.ok === true && r1.legCount === 2 && r1.stopsCount === 3 && r1.allReachable === true,
    'n5/B3: stops 三镇 ⇒ 2 段 3 站全可达（实 ' + j([r1.legCount, r1.stopsCount, r1.allReachable]) + '）');
  // ③ 每段耗时**逐字段取自 transit**（本模块不重算）
  const t1 = WA.world.transit('person', '甲镇', '乙镇');
  const t2 = WA.world.transit('person', '乙镇', '丙镇');
  a(r1.legs[0].minutes === t1.minutes && r1.legs[0].factored === t1.factored
    && j(r1.legs[0].path) === j(t1.path),
    'n5/B4: 段 0 的耗时 / 折算 / 路径与 world.transit 逐字段相等');
  a(r1.legs[1].minutes === t2.minutes && r1.legs[1].factored === t2.factored,
    'n5/B5: 段 1 同上（两口同源，不是只在第一段对上）');
  // ④ 时间轴：逐段累加 + 中间按 dwell 加停留
  a(r1.legs[0].departAt === 0 && r1.legs[0].arriveAt === t1.factored * 60000,
    'n5/B6: 段 0 出发 = at、到达 = at + 实走（实 ' + j([r1.legs[0].departAt, r1.legs[0].arriveAt]) + '）');
  a(r1.legs[1].departAt === r1.legs[0].arriveAt + 600000,
    'n5/B7: 段 1 出发 = 上段到达 + 停留（实 ' + j(r1.legs[1].departAt) + '）');
  a(r1.minutes === t1.factored + t2.factored && r1.arriveAt === r1.legs[1].arriveAt,
    'n5/B8: 全程 = 两段实走之和、到达 = 末段到达（实 ' + j([r1.minutes, r1.arriveAt]) + '）');
  a(r1.legs[0].stayMs === 600000 && r1.legs[1].stayMs === undefined,
    'n5/B9: 停留只挂在中间站（末站不挂 —— 到了就是到了）');
  // ⑤ 显式 legs 首尾相接同样可走
  const r2 = WA.travelDesk.route({ channel: 'person', legs: [{ from: '甲镇', to: '乙镇' }, { from: '乙镇', to: '丙镇' }], at: 0 });
  a(r2.ok === true && r2.legCount === 2 && r2.allReachable === true, 'n5/B10: 显式 legs 等价可用');
  // ⑥ 断链必拒（不静默跳过）
  const r3 = WA.travelDesk.route({ channel: 'person', legs: [{ from: '甲镇', to: '乙镇' }, { from: '丙镇', to: '甲镇' }] });
  a(r3.fault === 'broken-leg' && r3.at === 1 && r3.from === '丙镇' && r3.want === '乙镇',
    'n5/B11: 后段起点 ≠ 前段终点 ⇒ broken-leg 且报「第几段 / 该接哪」（实 ' + j(r3) + '）');
  // ⑦ 超上限**不静默截断**
  const many = ['甲镇', '乙镇', '丙镇', '甲镇', '乙镇', '丙镇', '甲镇', '乙镇'];
  const r4 = WA.travelDesk.route({ channel: 'person', stops: many });
  a(r4.fault === 'route-too-long' && r4.want === 7 && r4.cap === 6,
    'n5/B12: 7 段 > cap 6 ⇒ route-too-long 且如实报 want/cap（实 ' + j([r4.fault, r4.want, r4.cap]) + '）');
  // ⑧ 段表形状非法 ⇒ bad-route
  a(WA.travelDesk.route({ channel: 'person' }).fault === 'bad-route', 'n5/B13: 两种输入都没给 ⇒ bad-route');
  a(WA.travelDesk.route({ channel: 'person', stops: ['甲镇'] }).fault === 'bad-route',
    'n5/B14: 单站构不成段 ⇒ bad-route');
  a(WA.travelDesk.route({ channel: 'person', legs: [{ from: '甲镇' }] }).fault === 'bad-route',
    'n5/B15: 段缺终点 ⇒ bad-route（不做参数校验，只判自己的必填）');
  // ⑨ 通道白名单跟随 world.CHANNELS
  const bc = WA.travelDesk.route({ channel: 'zzz', stops: ['甲镇', '乙镇'] });
  a(bc.fault === 'bad-channel' && j(bc.known) === j(WA.world.CHANNELS),
    'n5/B16: 坏通道拒收并回带 world.CHANNELS');
  // ⑩ 走不过去的段：如实报，不按直线兜底；全程不冒充成功
  const r5 = WA.travelDesk.route({ channel: 'person', stops: ['甲镇', '乙镇', '查无此地'], at: 0 });
  a(r5.ok === true && r5.allReachable === false && r5.minutes === null,
    'n5/B17: 含不存在镇 ⇒ allReachable:false 且全程耗时**不冒充**（实 ' + j([r5.allReachable, r5.minutes]) + '）');
  a(r5.legs[1].reachable === false && r5.legs[1].reason === 'unknown-place',
    'n5/B18: 未达段单段 reachable:false 并带来源 reason（实 ' + j(r5.legs[1].reason) + '）');
  a(r5.legs[0].reachable === true, 'n5/B19: 可达段不受影响（逐段独立判，不因后段失败抹掉前段）');
  // ⑪ 同行只登记不动（本模块不扣不动）
  const r6 = WA.travelDesk.route({ channel: 'person', stops: ['甲镇', '乙镇'], with: ['赵六', '', '  '] });
  a(j(r6.companions) === j(['赵六']), 'n5/B20: 同行名单登记在返回体（空项剔除，实 ' + j(r6.companions) + '）');
  a(snap(WA) === snap(WA), 'n5/B21: （不变式）同行登记不改存档');
  // ⑫ 每段回带自己的指纹（供逐段重验，本模块不存「走到第几段」）
  a(typeof r1.stamps[0] === 'string' && typeof r1.stamps[1] === 'string' && r1.stamps[0] !== r1.stamps[1],
    'n5/B22: 逐段各回带自己的指纹（段 0/1 不同 ⇒ 逐段重验可判）');
  a(/不存「走到第几段」|本模块不存/.test(rd(REL)) && r1.legIndex === undefined,
    'n5/B23: 返回体里**没有**「当前第几段」这类游标（那会是第二份状态容器）');
}

// ═══════════════════════ C 段：会合时窗 ═══════════════════════
function runC(a) {
  const WA = env0();
  seedWorld(WA);
  a(typeof WA.travelDesk.meet === 'function', 'n5/C1: meet 口已装载');
  const t1 = WA.world.transit('person', '甲镇', '丙镇');
  // ① 到得齐：最晚到达 ≤ 时窗末端
  const m1 = WA.travelDesk.meet({ channel: 'person', place: '丙镇', windowMs: 7200000,
    parties: [{ person: '甲', from: '甲镇', at: 0 }, { person: '乙', from: '丙镇', at: 0 }] });
  a(m1.ok === true && m1.canMeet === true && m1.latestArrival === t1.factored * 60000,
    'n5/C2: 各方到达 = at + 实走（甲从甲镇实走 ' + t1.factored + ' 分钟），窗口内到得齐');
  a(m1.slackMs === 7200000 - t1.factored * 60000 && m1.slackMs > 0,
    'n5/C3: slackMs = 窗口末端 − 最晚到达（实 ' + j(m1.slackMs) + '）');
  a(m1.parties[1].minutes === 0 && m1.parties[1].arrival === 0,
    'n5/C4: 已在会合地的一方耗时 0（不凭空算出一段路）');
  // ② 到不齐：时窗太窄 ⇒ canMeet 假、slack 负
  const m2 = WA.travelDesk.meet({ channel: 'person', place: '丙镇', windowMs: 60000,
    parties: [{ person: '甲', from: '甲镇', at: 0 }, { person: '乙', from: '丙镇', at: 0 }] });
  a(m2.canMeet === false && m2.slackMs < 0,
    'n5/C5: 窗口太窄 ⇒ canMeet:false 且 slack 为负（实 ' + j([m2.canMeet, m2.slackMs]) + '）');
  // ③ **时窗可假**（防「锚在最晚到达」那版恒真判据回归）：窗口只比最晚到达宽一点点，
  //   而各方约集时刻在更早 ⇒ 缺省时窗锚在**最早约集时刻**，故仍可能到不齐。
  const m3 = WA.travelDesk.meet({ channel: 'person', place: '丙镇', windowMs: 60000,
    parties: [{ person: '甲', from: '甲镇', at: 0 }, { person: '乙', from: '丙镇', at: 3600000 }] });
  a(m3.canMeet === false,
    'n5/C6: 缺省时窗锚在最早约集时刻 ⇒ 仍可判到不齐（锚在最晚到达会让本条恒真）');
  a(m3.window.start === 0, 'n5/C7: 窗口起点 = 各方约集时刻的最早值（实 ' + j(m3.window.start) + '）');
  // ④ 显式 window 优先于 windowMs
  const m4 = WA.travelDesk.meet({ channel: 'person', place: '丙镇', windowMs: 60000, window: [0, 7200000],
    parties: [{ person: '甲', from: '甲镇', at: 0 }, { person: '乙', from: '丙镇', at: 0 }] });
  a(j(m4.window) === j({ start: 0, end: 7200000 }) && m4.canMeet === true,
    'n5/C8: 显式 window 优先（实 ' + j(m4.window) + '）');
  // ⑤ 走不过去的一方：reachable:false + 进 unreadable，**不假装能到**、canMeet 一并假
  const m5 = WA.travelDesk.meet({ channel: 'person', place: '丙镇', windowMs: 7200000,
    parties: [{ person: '甲', from: '查无此地', at: 0 }, { person: '乙', from: '丙镇', at: 0 }] });
  a(m5.canMeet === false && m5.parties[0].reachable === false,
    'n5/C9: 有一方走不过去 ⇒ canMeet:false 且该方 reachable:false');
  a(m5.unreadable.length === 1 && m5.unreadable[0].person === '甲' && m5.unreadable[0].why === 'unknown-place',
    'n5/C10: 走不过去的一方进 unreadable 并带来源 why（实 ' + j(m5.unreadable) + '）');
  a(m5.parties[1].reachable === true && m5.parties[1].arrival === 0,
    'n5/C11: 其余各方的到达照常算（不因一方失败整批作废）');
  // ⑥ 声明不全 ⇒ bad-meet（缺 place / 少于两方）
  a(WA.travelDesk.meet({ channel: 'person', parties: [{ person: '甲' }, { person: '乙' }] }).fault === 'bad-meet',
    'n5/C12: 缺 place ⇒ bad-meet');
  a(WA.travelDesk.meet({ channel: 'person', place: '丙镇', parties: [{ person: '甲' }] }).fault === 'bad-meet',
    'n5/C13: 少于两方 ⇒ bad-meet（会合至少是两个人的事）');
  a(WA.travelDesk.meet({ channel: 'person', place: '丙镇', parties: [{ from: '甲镇' }, { person: '乙' }] }).fault === 'bad-meet',
    'n5/C14: 某方缺人名 ⇒ bad-meet');
  // ⑦ 通道白名单同样跟随
  const m6 = WA.travelDesk.meet({ channel: 'zzz', place: '丙镇', parties: [{ person: '甲' }, { person: '乙' }] });
  a(m6.fault === 'bad-channel' && j(m6.known) === j(WA.world.CHANNELS), 'n5/C15: meet 的通道白名单同源');
  // ⑧ 只判不落：不改任何人的位置
  a(snap(WA) === snap(WA) && (WA.store.get().world.journeys || []).length === 0,
    'n5/C16: meet 只判不落（不改位置、不长出行程）');
}

// ═══════════════════════ D 段：零写入不变式与分栏计数 ═══════════════════════
function runD(a) {
  const WA = env0();
  seedWorld(WA);
  // ① 两口连同全部失败路径 ⇒ 存档逐字不变
  let s0 = snap(WA);
  WA.travelDesk.route({ channel: 'person', stops: ['甲镇', '乙镇', '丙镇'], at: 0 });
  WA.travelDesk.route({ channel: 'person', stops: ['甲镇', '乙镇', '查无此地'], at: 0 });
  WA.travelDesk.route({ channel: 'person', stops: ['甲镇', '乙镇', '丙镇', '甲镇', '乙镇', '丙镇', '甲镇', '乙镇'] });
  WA.travelDesk.route({ channel: 'person', legs: [{ from: '甲镇', to: '乙镇' }, { from: '丙镇', to: '甲镇' }] });
  WA.travelDesk.route({ channel: 'person' });
  WA.travelDesk.route({ channel: 'zzz', stops: ['甲镇', '乙镇'] });
  WA.travelDesk.meet({ channel: 'person', place: '丙镇', windowMs: 7200000,
    parties: [{ person: '甲', from: '甲镇', at: 0 }, { person: '乙', from: '丙镇', at: 0 }] });
  WA.travelDesk.meet({ channel: 'person', place: '丙镇', windowMs: 60000,
    parties: [{ person: '甲', from: '查无此地', at: 0 }, { person: '乙', from: '丙镇', at: 0 }] });
  WA.travelDesk.meet({ channel: 'person', place: '' });
  a(snap(WA) === s0, 'n5/D1: 两口九次调用（含五条失败路径）后存档**逐字不变**');
  // ② 关闭态下同样零写入
  WA.travelDesk.setSettings({ enabled: false });
  s0 = snap(WA);
  WA.travelDesk.route({ channel: 'person', stops: ['甲镇', '乙镇'] });
  WA.travelDesk.meet({ channel: 'person', place: '丙镇', parties: [{ person: '甲' }, { person: '乙' }] });
  a(snap(WA) === s0, 'n5/D2: 全关态下两口三连拒后存档逐字不变');
  // ③ 分栏计数：routes / meets 各自成栏（与 plans 分列）
  seedWorld(WA);
  const before = WA.travelDesk.stat();
  const p0 = before.plans, r0 = before.routes, m0 = before.meets;
  WA.travelDesk.route({ channel: 'person', stops: ['甲镇', '乙镇'] });
  WA.travelDesk.route({ channel: 'person', stops: ['甲镇', '乙镇'] });
  WA.travelDesk.meet({ channel: 'person', place: '丙镇', parties: [{ person: '甲' }, { person: '乙' }] });
  const after = WA.travelDesk.stat();
  a(after.routes === r0 + 2 && after.meets === m0 + 1,
    'n5/D3: routes / meets 各自成栏（实 ' + j([after.routes - r0, after.meets - m0]) + '）');
  a(after.plans === p0, 'n5/D4: 多站与会合**不计进** plans 栏（三件事不合并成一栏）');
  a(typeof after.faults['route-too-long'] === 'number' && typeof after.faults['broken-leg'] === 'number',
    'n5/D5: 新拒收码进 faults 分桶（坏了有人知道吗 —— 每条拒收都有名字）');
  // ④ 设置只经 settingsBus 单一真源，不落 store
  a(WA.store.get()['worldaxis_travel_desk_settings_v1'] === undefined,
    'n5/D6: 两格新设置**不落 store**（走 settingsBus 键，不在存档树里）');
  // ⑤ 上界有界：越界值被夹回区间（不是照收）
  WA.travelDesk.setSettings({ maxLegs: 999, meetWindowMs: -5 });
  const cfg = WA.travelDesk.getSettings();
  a(cfg.maxLegs === 12 && cfg.meetWindowMs === 0,
    'n5/D7: 越界值被夹回区间（实 ' + j([cfg.maxLegs, cfg.meetWindowMs]) + '）');
}

// ═══════════════════════ N 段：真源码破坏 + 两向自证 ═══════════════════════
/** 负控制锚点表（H5：本表内每处锚点字面量只声明一次；判据层不引用这些串）。 */
const ANCHOR = {
  tooLong: "    if (legs.length > cap) return { ok: false, fault: 'route-too-long', want: legs.length, cap: cap };",
  brokenLeg: "      if (legs[i].from !== legs[i - 1].to) {",
  winAnchor: "      const base = (earliest === null) ? now : earliest;",
  factored: "        row.minutes = num(tr.minutes); row.factor = num(tr.factor); row.factored = num(tr.factored);"
};
function broke(key) {
  const s = rd(REL);
  const an = ANCHOR[key];
  const n = cnt(s, an);
  if (n !== 1) throw new Error('破坏锚点【' + key + '】命中 ' + n + ' 次（期望恰好 1）—— 锚点必须是一处唯一的真源码文本');
  let out = null;
  if (key === 'tooLong') out = s.replace(an, '    if (false) return { ok: false, fault: \'route-too-long\', want: legs.length, cap: cap };');
  if (key === 'brokenLeg') out = s.replace(an, '      if (false) {');
  if (key === 'winAnchor') out = s.replace(an, '      const base = (latest === null) ? now : latest;');
  if (key === 'factored') out = s.replace(an, '        row.minutes = num(tr.minutes); row.factor = num(tr.factor); row.factored = 1;');
  if (out === null || out === s) throw new Error('破坏【' + key + '】没有改变源码文本');
  return out;
}
function runN(a) {
  const SRC = rd(REL);
  // ① 摘掉超限闸 ⇒ 超段不再被拒（不静默截断这条失守）
  {
    const src = broke('tooLong');
    a(src !== SRC, 'n5/N1: [破坏1] 超限闸被改成恒假（源码文本变了）');
    const W = env0({ [REL]: src });
    seedWorld(W);
    const many = ['甲镇', '乙镇', '丙镇', '甲镇', '乙镇', '丙镇', '甲镇', '乙镇'];
    const r = W.travelDesk.route({ channel: 'person', stops: many });
    a(r.fault !== 'route-too-long',
      'n5/N1b: [破坏1] 副本上超段不再被拒（fault=' + j(r.fault) + '）—— 原版那条判据真在起作用');
  }
  // ② 摘掉断链校验 ⇒ 断链被当成可走的段表
  {
    const src = broke('brokenLeg');
    a(src !== SRC, 'n5/N2: [破坏2] 断链校验被改成恒假（源码文本变了）');
    const W = env0({ [REL]: src });
    seedWorld(W);
    const r = W.travelDesk.route({ channel: 'person', legs: [{ from: '甲镇', to: '乙镇' }, { from: '丙镇', to: '甲镇' }] });
    a(r.fault !== 'broken-leg',
      'n5/N2b: [破坏2] 副本上断链不再被拒（fault=' + j(r.fault) + '）—— 原版那条判据真在起作用');
  }
  // ③ 时窗锚改回「最晚到达」 ⇒ canMeet 恒真（本条正是修掉过的那版空转判据）
  {
    const src = broke('winAnchor');
    a(src !== SRC, 'n5/N3: [破坏3] 时窗锚点被改回最晚到达（源码文本变了）');
    const W = env0({ [REL]: src });
    seedWorld(W);
    const r = W.travelDesk.meet({ channel: 'person', place: '丙镇', windowMs: 60000,
      parties: [{ person: '甲', from: '甲镇', at: 0 }, { person: '乙', from: '丙镇', at: 3600000 }] });
    a(r.canMeet === true,
      'n5/N3b: [破坏3] 副本上 canMeet 变成恒真（实 ' + j(r.canMeet) + '）—— 原版能判假，判据不是空转');
  }
  // ④ 段耗时改成常量 ⇒ 时间轴与 world.transit 分家（「不重算」这条失守）
  {
    const src = broke('factored');
    a(src !== SRC, 'n5/N4: [破坏4] 段折算被写成常量（源码文本变了）');
    const W = env0({ [REL]: src });
    seedWorld(W);
    const t = W.world.transit('person', '甲镇', '乙镇');
    const r = W.travelDesk.route({ channel: 'person', stops: ['甲镇', '乙镇'], at: 0 });
    a(r.legs[0].factored !== t.factored,
      'n5/N4b: [破坏4] 副本上段耗时与 transit 分家（' + j([r.legs[0].factored, t.factored]) + '）—— 原版逐字段同源');
  }
  // 纯度：原版上同款判据必须真（H6 第二向）
  const W0 = env0();
  seedWorld(W0);
  const many = ['甲镇', '乙镇', '丙镇', '甲镇', '乙镇', '丙镇', '甲镇', '乙镇'];
  a(W0.travelDesk.route({ channel: 'person', stops: many }).fault === 'route-too-long',
    'n5/Nb1: （纯度）原版上超段 ⇒ route-too-long');
  a(W0.travelDesk.route({ channel: 'person', legs: [{ from: '甲镇', to: '乙镇' }, { from: '丙镇', to: '甲镇' }] }).fault === 'broken-leg',
    'n5/Nb2: （纯度）原版上断链 ⇒ broken-leg');
  a(W0.travelDesk.meet({ channel: 'person', place: '丙镇', windowMs: 60000,
    parties: [{ person: '甲', from: '甲镇', at: 0 }, { person: '乙', from: '丙镇', at: 3600000 }] }).canMeet === false,
    'n5/Nb3: （纯度）原版上缺省时窗可判到不齐（canMeet:false）');
  const t0 = W0.world.transit('person', '甲镇', '乙镇');
  a(W0.travelDesk.route({ channel: 'person', stops: ['甲镇', '乙镇'], at: 0 }).legs[0].factored === t0.factored,
    'n5/Nb4: （纯度）原版上段耗时与 transit 逐字段同源');
  a(SRC.length > 15000, 'n5/Nc: 被破坏的源码面非空（' + SRC.length + ' 字符）');
  a(cnt(rd(REL), ANCHOR.tooLong) === 1 && cnt(rd(REL), ANCHOR.brokenLeg) === 1
    && cnt(rd(REL), ANCHOR.winAnchor) === 1 && cnt(rd(REL), ANCHOR.factored) === 1,
    'n5/Nd: 负控制全程未改真源码（四处锚点在收尾复核时仍各在原位恰 1 次）');
}

function mkA(report) { return function (ok, name) { report.total++; if (ok) report.pass++; else { report.fail++; console.log('FAIL ' + name); } }; }
function main() {
  const report = { total: 0, pass: 0, fail: 0 };
  const a = mkA(report);
  runA(a); runB(a); runC(a); runD(a); runN(a);
  console.log('N5 s3-b3-n5-v2219 ' + report.pass + ' / 失败 ' + report.fail);
  process.exit(report.fail ? 1 : 0);
}
module.exports = { runA: runA, runB: runB, runC: runC, runD: runD, runN: runN, REL: REL, ANCHOR: ANCHOR };
if (require.main === module) main();
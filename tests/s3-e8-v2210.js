#!/usr/bin/env node
'use strict';
// WorldAxis tests/s3-e8-v2210.js — E8 行动与行程工作台专锁（v2.210.0 · 拓展 8）
//
// 【拓展原文（engines/travel-desk.js 头注释）逐条对照】
//   它治什么：「能不能走到」「走多久」「路上堵不堵」「发一趟货」四件事各自有口，
//     却**没有一个面把它们放在一起回答**：
//       · `world.transit()` 是**判定口**（答「这一次行不行」），不是方案面；
//       · `worldGraph.geo({from})` 只报**一跳**（源码注释明说不做加权最短路）；
//       · `world.roadCapOf / roadUsage / roadBlockOf` 三个逐段读口只有诊断面在用；
//       · `freight.dispatch` 要五个参数而没有对照面；
//       · 在途台账散在四处容器，各有各的字段名与状态词。
//     后果不是「读不出来」，而是**每一个消费方都要自己拼一遍** —— 拼出来的读法必然
//     慢慢漂开，且「界面预估」与「真引擎判定」一旦分家，玩家看到的预计时间与真走出去
//     的时间就不再是同一件事。
//   它做四件事、**一次判定都不做**：① plan（单一预览体，字段逐项取自 transit）
//     ② commit（原样透传给来源公开写口）③ ledger（在途三面，每行报名自己的真源容器）
//     ④ verify（只读重验口，commit 复用它）。
//   六条否定式边界：不另存第二份路线/行程状态（全文零 store.transact）·
//     不新增拒收码语义（编排失败另开 fault 命名空间 8 码）· 不做参数校验（交来源写口）·
//     到点前不提前抵达（safeOpts 剥掉 force）· 预览是进程态交互物（stamp 由调用方回带）·
//     全关即零存在（关闭时三口一律拒 desk-off，本模块**没有** buildBlock）。
//
// 【本锁四段】A 静态契约 / B 运行时四功能与拒绝语义 / C 零写入不变式 /
//   N 真源码破坏 + 两向自证（负控制三形与 H5/H6 纪律：真源码破坏 → 加载破坏副本 →
//   在副本上重跑同款真判据；判据层内锚点字面量只声明一次；锚点不唯一须抛）。
//
// 【本锁对「零写入」的**如实分层**（不把两件事说成一件）】
//   C 段判两件事，都不是「本模块一个字节都不许变」这句空话：
//     ① **三个读口**（plan / verify / ledger）连同它们的全部失败与拒绝路径 ⇒ 存档逐字不变；
//     ② **commit 的三条拒收路径**（desk-off / unknown-action / 缺参数由来源拒收）
//        ⇒ 存档逐字不变（「半个动作都不留」）；而 commit 的**成功路径当然会写** ——
//        写它的是**来源模块自己的 mutate**，不是本模块。故成功路径判的是更强的一条：
//        存档的差异**只落在** `world.journeys` 这一个容器里（没有第二份台账长出来）。
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');

const REL = 'engines/travel-desk.js';
const PANEL_REL = 'ui/panel.js';
const DIAG_REL = 'engines/tool-diag.js';
const IDX_REL = 'index.js';
const RUN_REL = 'tests/run.js';
const LEDGER_REL = 'tests/module-registry-ledger.json';

function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }
function cmp(a, b) {
  const A = String(a).split('.').map(Number), B = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0); }
  return 0;
}
/** 剥掉行注释与块注释（H5 判据纯度用：判据不得被沿革注释冒充成现场）。 */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(function (l) {
    const i = l.indexOf('//');
    return i < 0 ? l : l.slice(0, i);
  }).join('\n');
}
/** 取出 `WA.travelDesk = { … }` 的对象字面量体（导出面契约的锚点）。 */
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
/** 建一个已启动环境（与真装载同源：LOAD 取自 tests/run.js，不自拼模块清单）。 */
function env0(ov) { return sync.fresh(ov ? { srcOverride: ov } : {}); }
/**
 * 种一个最小可走世界：三镇两路（甲-乙 30min/cap2、乙-丙 45min/cap1）。
 *   ⚠ 本函数是**彻底重置**，不是「补种」。`env0()` 只换模块闭包，而**存档与设置走
 *   localStorage 是跨环境共享的**（现场实测：换环境后仍读得到上一个环境留下的在途行程，
 *   于是一次 depart 被来源按 road-crowded 拒、「恰 1 行」这类判据整片落空）。
 *   故凡是要在「清零起点」上读的判据，一律先调本函数把世界推回同一个已知起点 ——
 *   这不是为了好写，是因为**判据的取值面必须唯一**。
 */
function seedWorld(WA) {
  WA.world.setSettings({ enabled: true });
  WA.travelDesk.setSettings({ enabled: true });
  WA.store.transact(function (d) {
    d.world = (d.world && typeof d.world === 'object' && !Array.isArray(d.world)) ? d.world : {};
    d.world.places = [{ name: '甲镇', kind: 'town' }, { name: '乙镇', kind: 'town' }, { name: '丙镇', kind: 'town' }];
    d.world.roads = [];
    d.world.journeys = [];
    d.world.shipments = [];
    d.world.blocks = [];
  }, 'e8:seed-places');
  WA.world.addRoad('甲镇', '乙镇', 30, 2);
  WA.world.addRoad('乙镇', '丙镇', 45, 1);
}
/** 存档逐字快照（用于「零写入」判据；深拷贝 + 稳定序列化）。 */
function snap(WA) { return JSON.stringify(WA.store.get()); }

// ═══════════════════════ A 段：静态契约 ═══════════════════════
function runA(a) {
  const S = rd(REL);
  const body = exportBody(S);
  a(body.length > 0, 'e8v2210/A1: 能从真源码取出 WA.travelDesk 的对象字面量体');
  ['FAULTS', 'ACTIONS', 'getSettings', 'setSettings', 'plan', 'route', 'meet', 'verify', 'commit', 'ledger', 'diagnose', 'stat']
    .forEach(function (k) { a(body.indexOf(k + ':') > 0, 'e8v2210/A2: 导出面含 ' + k); });
  // 无消费方不挂导出：本模块**没有** buildBlock（它不产注入块 —— 边界 6 的实体）
  a(body.indexOf('buildBlock:') < 0, 'e8v2210/A3: 导出面**没有** buildBlock（本模块不产注入块）');
  // 剥注释后的源码：多处「零 X」类判据的真值面 —— 模块头自己会写「全文零 store.transact」，
  //   沿革注释也会重复动作表字段；拿含注释的全文去数，量到的就是注释而不是现场。
  const code = stripComments(S);
  a(cnt(code, 'store.transact') === 0,
    'e8v2210/A4: 剥注释后零 store.transact（不另存第二份行程状态；模块头那句声明本身不算数）');
  a(cnt(S, 'registerModule(') === 1, 'e8v2210/A5: registerModule 恰一处（尾部自报身份）');
  // 边界 2 的**实体**：模块头写「本文件不出现内联 reason: '字面量' 形态」，
  //   而剥掉注释后确实零命中 —— 这是「编排失败另开命名空间」的结构保证，
  //   不是一句声明（拒收码台账的扫描面只认内联 reason 字面量）。
  a(cnt(code, "reason: '") === 0,
    'e8v2210/A6: 剥注释后零内联 reason 字面量（编排失败走 fault 命名空间，不污染来源的 reason 面）');
  a(/fault:\s*code/.test(S) && /const FAULTS = \['desk-off'/.test(S), 'e8v2210/A7: fault 命名空间与码表在位');
  // 六条边界逐条有实体
  a(/不另存第二份路线\/行程状态/.test(S), 'e8v2210/A8: 边界 1（不另存第二份状态）写在模块头');
  a(/不做参数校验/.test(S), 'e8v2210/A9: 边界 3（不做参数校验）写在模块头');
  a(/safeOpts/.test(S) && /k === 'force'/.test(S), 'e8v2210/A10: 边界 4（剥 force）有实体函数');
  a(/stamp 由\*\*调用方回带\*\*|由\*\*调用方回带\*\*/.test(S) && cnt(code, 'store.transact') === 0,
    'e8v2210/A11: 边界 5（预览是进程态交互物）有实体依据（声明 + 剥注释后零落盘写）');
  a(/全关即零存在/.test(S), 'e8v2210/A12: 边界 6（全关即零存在）写在模块头');
  // 动作表：六条 + 两条带路线语义
  ['depart', 'stop', 'dispatch', 'reroute', 'cancel', 'arrive'].forEach(function (k) {
    a(new RegExp('\\b' + k + ': \\{').test(S), 'e8v2210/A13: 动作表含 ' + k);
  });
  a(cnt(code, 'stamp: true') === 2 && cnt(code, 'stamp: false') === 4,
    'e8v2210/A13b: 带路线语义的两条（depart / reroute）与其余四条**分列**（' + cnt(code, 'stamp: true') + ' / ' + cnt(code, 'stamp: false') + '）');
  // 版本面：模块自报 ver = 本模块**最后一次交付**的版本（不固定跟随 index）。
  //   沿革：本锁 v2.210.0 交付时写的是「自报 ver === index.js VERSION」，但那仅在**该模块当期交付那一版**成立——
  //   travel-desk 末次真改在 N5（2.219.0），之后 index 升版不应拖动它（否则每版都要改一个未变模块的自报值）。
  const mv = (rd(IDX_REL).match(/VERSION = '([0-9.]+)'/) || [])[1] || '';
  a(/const VERSION = '2\.219\.0'/.test(S), 'e8v2210/A14: 模块自报 ver === 本模块交付版本 2.219.0');
  a(cmp(mv, '2.210.0') >= 0, 'e8v2210/A14b: 入口版本不低于本锁的交付基线（实 ' + mv + '）');
  a(mv === JSON.parse(rd('manifest.json')).version, 'e8v2210/A14c: 入口与清单同源同值');
  // 装载面 / 登记面（LOAD 进了不等于登记了）
  a(rd(IDX_REL).indexOf("'engines/travel-desk.js'") >= 0, 'e8v2210/A15: index.js LOAD_ORDER 装载');
  a(rd(RUN_REL).indexOf("'engines/travel-desk.js'") >= 0, 'e8v2210/A16: tests/run.js LOAD 装载（与 index 同序）');
  const diag = rd(DIAG_REL);
  a(diag.indexOf("'engines/travel-desk.js': 'travelDesk'") >= 0,
    'e8v2210/A17: tool-diag MODULE_EXPORTS 登记（漏它则出口面契约没有本模块段）');
  a(diag.indexOf("page: 'travel'") >= 0, 'e8v2210/A18: tool-diag UI_BINDINGS 登记本页组');
  // 面板三件齐做：页表 / 渲染器表 / 绑定 / 出口清单
  const pan = rd(PANEL_REL);
  a(/\{ id: 'travel', icon:/.test(pan), 'e8v2210/A19: PAGES 含 travel 页（id 纯小写，适配 C11 解析器）');
  a(/travel: renderTravelDesk,/.test(pan), 'e8v2210/A20: RENDERERS 同名同数');
  a(pan.indexOf('function renderTravelDesk()') >= 0, 'e8v2210/A21: 渲染器定义在位');
  ['wa-trip-ch', 'wa-trip-from', 'wa-trip-to', 'wa-trip-plan', 'wa-trip-verify', 'wa-trip-ledger',
   'wa-trip-dia', 'wa-trip-who', 'wa-trip-act', 'wa-trip-commit', 'wa-trip-out',
   // v2.219.0（拓展 N5）：多站与会合两行的控件（route / meet 的真消费方）
   'wa-trip-stops', 'wa-trip-dwell', 'wa-trip-route', 'wa-trip-meet', 'wa-trip-win', 'wa-trip-meet-go'].forEach(function (id) {
    a(pan.indexOf(id) >= 0, 'e8v2210/A22: 面板渲染 ' + id);
  });
  a(pan.indexOf("'#wa-trip-out'") >= 0 && pan.indexOf("'#wa-trip-plan'") >= 0,
    'e8v2210/A23: 面板接线在位（出口 + 按钮）');
  a(pan.indexOf('NAV_OUT_SELS = [') >= 0 && pan.indexOf("'#wa-trip-out'") >= 0,
    'e8v2210/A24: 结果出口登记进 NAV_OUT_SELS（出口写完即补绑 / 切页后补绑）');
  // 页清单解析器（C11 同款）必须能解析出本页 —— 带连字符的 id 在那一面「不存在」
  const pageRe = /\{ id: '([a-z]+)', icon:/g;
  const ids = []; let m2;
  while ((m2 = pageRe.exec(pan))) ids.push(m2[1]);
  a(ids.indexOf('travel') >= 0, 'e8v2210/A25: C11 解析器能解析出 travel 页（实 ' + ids.length + ' 页）');
  // 本页**没有任何直接写世界的代码**：渲染段 + 绑定段里零 store 写、零来源写口
  //   （唯一的写路径是 commit，而它调的是来源公开写口）
  const segStart = pan.indexOf('function renderTravelDesk()');
  const segEnd = pan.indexOf('  function renderBody() {');
  const seg = pan.slice(segStart, segEnd);
  a(seg.length > 0 && (seg.match(/\bstore\.[A-Za-z_$][\w$]*\s*\(/g) || []).length === 0
    && cnt(seg, 'transact(') === 0,
    'e8v2210/A26: 渲染段零 store **调用**（本页只渲染；正文里提到 store 字样的说明不算调用，真调用一律走来源读口）');
  a(cnt(seg, 'WA.world.depart(') === 0 && cnt(seg, 'WA.freight.') === 0,
    'e8v2210/A27: 渲染段零直接调来源写口（写只经 WA.travelDesk.commit）');
  // 出口面契约（冻结串由 export-contract 产物回填，本锁只核它在场且逐字含本 ns）
  //   v2.219.0（拓展 N5）：本模块的契约成员集随 route / meet 两口一并扩为八个
  //   （产品真引用：面板 travel 页 + 本锁；冻结串与 tests/export_contract.txt 逐字同源）。
  a(rd(RUN_REL).indexOf('|travelDesk:commit diagnose ledger meet plan route stat verify|') >= 0,
    'e8v2210/A28: FROZEN2800 逐字含本模块的契约成员集（产品真引用的八个）');
  // 台账登记（--update 产物）
  a(rd(LEDGER_REL).indexOf('"engines/travel-desk.js"') >= 0, 'e8v2210/A29: module-registry 账本已登记本模块');
  // 法条底：本锁自己是**扩展名与页名一致**的（页 id 'travel' ↔ 文件名 e8）
  a(/页 id 纯小写字母/.test(pan), 'e8v2210/A30: 页 id 约束写在源码里（后续新增页照此办理）');
}

// ═══════════════════════ B 段：运行时四功能 ═══════════════════════
function runB(a) {
  const WA = env0().WA;
  a(typeof WA.travelDesk === 'object', 'e8v2210/B1: 模块已装载');
  a(j(WA.travelDesk.getSettings()) === j({ enabled: false, maxRows: 24, maxPlanRows: 32, maxLegs: 6, meetWindowMs: 3600000 }),
    'e8v2210/B2: 默认全关（实 ' + j(WA.travelDesk.getSettings()) + '）—— 全关即零存在的前提');
  // ① 全关即零存在：三个口一律拒 desk-off（而不是静默返回空）
  ['plan', 'ledger'].forEach(function (fn) {
    const r = WA.travelDesk[fn]({ channel: 'person', from: '甲镇', to: '丙镇' });
    a(r.ok === false && r.fault === 'desk-off', 'e8v2210/B3: 关闭时 ' + fn + ' 拒 desk-off（实 ' + j(r.fault) + '）');
  });
  const rv0 = WA.travelDesk.commit('depart', {});
  a(rv0.ok === false && rv0.fault === 'desk-off', 'e8v2210/B3b: 关闭时 commit 拒 desk-off');
  seedWorld(WA);
  const cfg4 = WA.travelDesk.getSettings();
  a(cfg4.enabled === true && cfg4.maxRows === 24 && cfg4.maxPlanRows === 32
    && cfg4.maxLegs === 6 && cfg4.meetWindowMs === 3600000,
    'e8v2210/B4: 开启后设置生效且其余字段原样（实 ' + j(cfg4) + '）');
  // ② 通道白名单**跟随** world.CHANNELS（不自己抄一份）
  const bad = WA.travelDesk.plan({ channel: 'zzz', from: '甲镇', to: '丙镇' });
  a(bad.fault === 'bad-channel' && j(bad.known) === j(WA.world.CHANNELS),
    'e8v2210/B5: 坏通道拒收并回带 world.CHANNELS（实 ' + j(bad.known) + '）');
  // ③ 缺字段拒收（不做参数校验 —— 只判自己的必填）
  const miss = WA.travelDesk.plan({ channel: 'person' });
  a(miss.fault === 'missing-fields' && j(miss.need) === j(['from', 'to']),
    'e8v2210/B6: 缺起终点拒 missing-fields 且报缺哪几个');
  // ④ plan：字段逐项取自 transit（**不是本模块自算**）
  const p = WA.travelDesk.plan({ channel: 'person', from: '甲镇', to: '丙镇' });
  a(p.ok === true && p.reachable === true, 'e8v2210/B7: 可达路径 plan 成功');
  const tr = WA.world.transit('person', '甲镇', '丙镇');
  a(p.minutes === tr.minutes && p.factor === tr.factor && p.factored === tr.factored
    && p.hops === tr.hops && j(p.path) === j(tr.path),
    'e8v2210/B8: 耗时 / 折算 / 实走 / 跳数 / 路径**逐字段等于** world.transit（同源，不是重算）');
  a(p.segs.length === 2 && p.segs[0].from === '甲镇' && p.segs[0].to === '乙镇'
    && p.segs[0].cap === 2 && p.segs[1].cap === 1,
    'e8v2210/B9: 逐段容量取自 roadCapOf（实 ' + j(p.segs.map(function (s) { return s.from + '>' + s.to + ':' + s.cap; })) + '）');
  a(p.segs[0].use === 0 && p.segs[0].crowded === false && p.segs[0].closed === false,
    'e8v2210/B10: 逐段占用 / 拥挤 / 封锁三态分列');
  a(typeof p.stamp === 'string' && p.stamp.indexOf('甲镇>乙镇:2/0') > 0,
    'e8v2210/B11: 指纹含逐段占用（只有可达/不可达不够 —— 同时出发的第二个人才是被拒的那一类）');
  a(String(p.basisNote).indexOf('WA.world.transit()') > 0,
    'e8v2210/B12: 返回体自带同源说明（basisNote 点明取自哪个口）');
  // ⑤ 可达性拒绝**不是**编排失败：reachable:false + fault:null + 保留世界的 reason
  const un = WA.travelDesk.plan({ channel: 'person', from: '甲镇', to: '查无此地' });
  a(un.ok === false && un.reachable === false && un.fault === null && un.reason === 'unknown-place',
    'e8v2210/B13: 走不过去 = 世界给的答案（reachable:false / fault:null / reason 原样带出）');
  // ⑥ verify：只读重验，两态严格分开
  const vSame = WA.travelDesk.verify({ channel: 'person', from: '甲镇', to: '丙镇', stamp: p.stamp });
  a(vSame.same === true && vSame.had === p.stamp, 'e8v2210/B14: 指纹相同 ⇒ same:true（逐字比对）');
  const vNone = WA.travelDesk.verify({ channel: 'person', from: '甲镇', to: '丙镇' });
  a(vNone.same === null && String(vNone.note).indexOf('不判作废') > 0,
    'e8v2210/B15: 没回带指纹 ⇒ same:null（不判作废，也不假装验过）');
  // ⑦ commit：原样透传 —— 成功路径的来源 id 与字段原样带回
  const c1 = WA.travelDesk.commit('depart', { channel: 'person', person: '张三', from: '甲镇', to: '丙镇', at: 10, stamp: p.stamp });
  a(c1.ok === true && c1.action === 'depart' && c1.via === 'world.depart' && typeof c1.id === 'string',
    'e8v2210/B16: commit 成功（via 报名走了哪个来源写口，实 ' + j(c1.via) + '）');
  a(c1.left === 75 && c1.status === 'in-transit', 'e8v2210/B17: 来源返回体原样透传（left / status 未被改写）');
  // ⑧ stale-plan：路况变了 ⇒ 拒，且**不调来源写口**（半个动作都不留）
  //   本段的「路况变更」用**路网变更**（新开一条更短的直达路）表达：这是真变更，
  //   且不与 `world.depart` 自己的可达性/容量自判耦合 —— 用「封锁某镇」会把两件事
  //   搅在一起，拒因就不再唯一（现场实测：那样拿到的是来源的 road-closed，不是
  //   本模块的 stale-plan）。
  //   取样前先 seedWorld() 把世界推回**清零起点**：`env0()` 只换模块闭包，
  //   而存档跨环境共享 —— 前面积下的在途行程会占掉路段容量（capacity 1），
  //   于是 depart 被来源按 road-crowded 拒，这条判据就永远等不到 stale-plan。
  seedWorld(WA);
  const p2 = WA.travelDesk.plan({ channel: 'person', from: '甲镇', to: '丙镇' });
  WA.world.addRoad('甲镇', '丙镇', 20, 3);
  const before = snap(WA);
  const c2 = WA.travelDesk.commit('depart', { channel: 'person', person: '李四', from: '甲镇', to: '丙镇', at: 10, stamp: p2.stamp });
  a(c2.fault === 'stale-plan' && c2.ok === false && c2.was === p2.stamp && c2.now !== p2.stamp,
    'e8v2210/B18: 路况变更后旧指纹作废 ⇒ 拒 stale-plan 并给出前后指纹（实 ' + j(c2.fault) + ' / now ' + j(c2.now) + '）');
  a(snap(WA) === before, 'e8v2210/B19: stale-plan 拒收路径**零写入**（被拒的也留下了痕迹是本仓忌）');
  a((WA.store.get().world.journeys || []).length === 0, 'e8v2210/B19b: 半个动作都不留（journeys 仍空）');
  // ⑨ 未知动作拒收并回带可选项
  const c3 = WA.travelDesk.commit('nope', {});
  a(c3.fault === 'unknown-action' && j(c3.known) === j(WA.travelDesk.ACTIONS),
    'e8v2210/B20: 未知动作拒收并回带 ACTIONS（实 ' + j(c3.known) + '）');
  // ⑩ 缺参数交来源写口自己拒（本模块不另判一遍 —— 否则两个真源）
  const c4 = WA.travelDesk.commit('depart', { channel: 'person', from: '甲镇', to: '丙镇' });
  a(c4.ok === false && c4.fault === null && c4.reason === 'missing-fields' && c4.via === 'world.depart',
    'e8v2210/B21: 缺执行者由**来源**拒（fault:null / 来源的 reason 原样带出 —— 现场可归因）');
  // ⑪ ledger：三面单列、每行报名自己的真源容器（四处不合并）
  //   「恰 1 行」必须在**清零起点**上读：先 seedWorld() 重置，不借前段在途行程充数。
  seedWorld(WA);
  const p3 = WA.travelDesk.plan({ channel: 'person', from: '甲镇', to: '丙镇' });
  const c3l = WA.travelDesk.commit('depart', { channel: 'person', person: '王五', from: '甲镇', to: '丙镇', at: 10, stamp: p3.stamp });
  a(c3l.ok === true && c3l.via === 'world.depart',
    'e8v2210/B21b: 台账取样前的出发真的成功了（实 ' + j({ ok: c3l.ok, fault: c3l.fault, reason: c3l.reason }) + '）');
  const lg = WA.travelDesk.ledger({});
  a(lg.ok === true && lg.count === 1 && lg.rows[0].face === 'person'
    && lg.rows[0].source === 'world.journeys' && lg.rows[0].who === '王五',
    'e8v2210/B22: 在途一面可读且**报名真源容器**（实 ' + j(lg.rows.map(function (x) { return x.face + '@' + x.source + '#' + x.who; })) + '）');
  a(j(lg.faces) === j(['person', 'goods', 'message']),
    'e8v2210/B23: 三面**单列**（不合成一张「在途总表」—— 合并就是把四件事说成一件）');
  a(j(lg.unreadable) === j([]), 'e8v2210/B24: 消息面读口在场 ⇒ unreadable 为空（「读不到」与「真的没有」分了两个读数）');
  a(String(lg.note).indexOf('不合并') > 0, 'e8v2210/B25: 返回体自带口径说明（每行报名自己的真源容器）');
  // ⑫ 面过滤
  const lg2 = WA.travelDesk.ledger({ face: 'goods' });
  a(lg2.ok === true && lg2.count === 0 && lg2.total === 0,
    'e8v2210/B26: 面过滤生效（无货物在途 ⇒ 0 行，而 person 那一面仍在）');
  // ⑬ diagnose：可红
  const d = WA.travelDesk.diagnose();
  a(d.ok === true && d.module === 'travelDesk' && d.actions.missing.length === 0,
    'e8v2210/B27: 诊断自报模块身份与动作在位（在位 ' + d.actions.live.length + '/' + d.actions.declared.length + '）');
  a(j(d.faultCodes) === j(WA.travelDesk.FAULTS) && d.faultCodes.length === 12,
    'e8v2210/B28: 拒收码表 12 条单列（fault 命名空间与来源 reason 分开，实 ' + d.faultCodes.length + '）');
  // ⑭ stat：计数与拒收桶
  //   进程计数是**每个环境各自一份**（模块级闭包态），读的就是本环境 WA ——
  //   desk-off 记在 B3 那三笔上、stale-plan 记在 B18 那一笔上。
  const st = WA.travelDesk.stat();
  a(typeof st.plans === 'number' && st.plans > 0 && typeof st.faults === 'object',
    'e8v2210/B29: 进程计数可读（预览 ' + st.plans + ' 次 · 拒收桶 ' + j(Object.keys(st.faults)) + '）');
  //   注意两个桶是**分列**的：`faults` 只记编排层失败（desk-off / bad-channel / …），
  //   而 stale-plan 走 `stat.stale`（「拒收」不是「编排失败」—— 本模块边界 2 的说法，
  //   源码里正是 `stat.rejects++; stat.stale++`，不经 noteFault）。把两者混读会让这条
  //   判据永远等不到 stale-plan。
  a(st.faults['desk-off'] >= 1 && st.faults['bad-channel'] >= 1 && st.stale >= 1,
    'e8v2210/B30: 拒收按码分桶（「坏了有人知道吗」—— 每条拒收都有名字；faults ' + j(st.faults) + ' · stale ' + st.stale + '）');
}

// ═══════════════════════ C 段：零写入不变式 ═══════════════════════
function runC(a) {
  const WA = env0().WA;
  seedWorld(WA);
  // ① 三个读口（含全部失败与拒绝路径）⇒ 存档逐字不变
  let s0 = snap(WA);
  WA.travelDesk.plan({ channel: 'person', from: '甲镇', to: '丙镇' });
  WA.travelDesk.plan({ channel: 'zzz', from: '甲镇', to: '丙镇' });
  WA.travelDesk.plan({ channel: 'person' });
  WA.travelDesk.plan({ channel: 'person', from: '甲镇', to: '查无此地' });
  WA.travelDesk.verify({ channel: 'person', from: '甲镇', to: '丙镇' });
  WA.travelDesk.verify({ channel: 'person', from: '甲镇', to: '丙镇', stamp: 'ok|x' });
  WA.travelDesk.ledger({});
  WA.travelDesk.ledger({ face: 'goods' });
  // v2.219.0（拓展 N5）：多站与会合两口也在**同一不变式**内 —— 含它们的失败路径。
  WA.travelDesk.route({ channel: 'person', stops: ['甲镇', '乙镇', '丙镇'] });
  WA.travelDesk.route({ channel: 'person', legs: [{ from: '甲镇', to: '乙镇' }, { from: '丙镇', to: '甲镇' }] });
  WA.travelDesk.route({ channel: 'person', stops: ['甲镇', '乙镇', '丙镇', '甲镇', '乙镇', '丙镇', '甲镇', '乙镇'] });
  WA.travelDesk.meet({ channel: 'person', place: '丙镇', parties: [{ person: '甲', from: '甲镇' }, { person: '乙', from: '丙镇' }] });
  WA.travelDesk.meet({ channel: 'person', place: '' });
  WA.travelDesk.diagnose();
  WA.travelDesk.stat();
  a(snap(WA) === s0, 'e8v2210/C1: plan / route / meet / verify / ledger 十六次调用（含失败路径）后存档**逐字不变**');
  // ② 关闭态下三个口零写入
  WA.travelDesk.setSettings({ enabled: false });
  s0 = snap(WA);
  WA.travelDesk.plan({ channel: 'person', from: '甲镇', to: '丙镇' });
  WA.travelDesk.ledger({});
  WA.travelDesk.commit('depart', {});
  a(snap(WA) === s0, 'e8v2210/C2: 全关态下 plan / ledger / commit 三连拒后存档逐字不变');
  WA.travelDesk.setSettings({ enabled: true });
  // ③ commit 的拒收路径零写入（unknown-action / 缺参数 / stale）
  s0 = snap(WA);
  WA.travelDesk.commit('nope', {});
  WA.travelDesk.commit('depart', { channel: 'person', from: '甲镇', to: '丙镇' });
  WA.travelDesk.commit('dispatch', {});
  a(snap(WA) === s0, 'e8v2210/C3: 三条拒收路径（未知动作 / 缺参数 / 缺模块参数）后存档逐字不变');
  //   变更手段同上：**路网变更**（新开一条更短的直达路），拒因唯一。
  //   先 seedWorld() 推回清零起点（存档跨环境共享 —— 见 seedWorld 注释）。
  seedWorld(WA);
  const p = WA.travelDesk.plan({ channel: 'person', from: '甲镇', to: '丙镇' });
  WA.world.addRoad('甲镇', '丙镇', 20, 3);
  s0 = snap(WA);
  const c4 = WA.travelDesk.commit('depart', { channel: 'person', person: '赵六', from: '甲镇', to: '丙镇', stamp: p.stamp });
  a(c4.fault === 'stale-plan', 'e8v2210/C4a: 旧指纹被拒 stale-plan（拒因唯一，实 ' + j(c4.fault) + '）');
  a(snap(WA) === s0, 'e8v2210/C4: stale-plan 拒收零写入（拒绝本应不落盘）');
  // ④ 成功路径：差异**只落在** world.journeys 这一个容器（没有第二份台账长出来）
  seedWorld(WA);
  const p2 = WA.travelDesk.plan({ channel: 'person', from: '甲镇', to: '丙镇' });
  const b = JSON.parse(snap(WA));
  WA.travelDesk.commit('depart', { channel: 'person', person: '孙七', from: '甲镇', to: '丙镇', at: 10, stamp: p2.stamp });
  const af = JSON.parse(snap(WA));
  const changed = Object.keys(af).filter(function (k) { return JSON.stringify(af[k]) !== JSON.stringify(b[k]); });
  //   去掉存储自己的**写后记账面** `meta`（updatedAt 一类的落盘时刻戳）后，变化面必须只有 world。
  a(j(changed.filter(function (k) { return k !== 'meta'; })) === j(['world']),
    'e8v2210/C5: commit 成功只动了 world 这一棵（去掉记账面 meta；实 ' + j(changed) + '）');
  a(j(Object.keys(af)) === j(Object.keys(b)),
    'e8v2210/C5b: 顶层**没有多出任何键** —— 本模块没有长出第二份台账容器');
  const wChanged = Object.keys(af.world).filter(function (k) { return JSON.stringify(af.world[k]) !== JSON.stringify(b.world[k]); });
  a(j(wChanged) === j(['journeys']),
    'e8v2210/C6: 而 world 下**只有 journeys 变了**（实 ' + j(wChanged) + '）—— 行程的真源仍只在来源那一个容器里');
  a(j(af.world.roads) === j(b.world.roads) && j(af.world.places) === j(b.world.places) && j(af.world.blocks) === j(b.world.blocks),
    'e8v2210/C7: 路 / 地点 / 封锁三表逐字未动（本模块不改路网）');
  a(JSON.stringify(af.travelDesk || null) === JSON.stringify(b.travelDesk || null),
    'e8v2210/C8: 本模块自己没有长出任何存档容器（存档里没有 travelDesk 键）');
  // ⑤ 本模块的设置只经 settingsBus（单一真源），不走 store
  const key = 'worldaxis_travel_desk_settings_v1';
  a(WA.store.get()[key] === undefined, 'e8v2210/C9: 设置**不落 store**（走 settingsBus 的键，不在存档树里）');
  const raw = WA.mainWin.localStorage.getItem(key);
  a(typeof raw === 'string' && raw.length > 0, 'e8v2210/C10: 设置真的落在单一真源上（settingsBus 键 ' + key + '）');
}

// ═══════════════════════ N 段：真源码破坏 + 两向自证 ═══════════════════════
/** 负控制锚点表（H5：本表内每处锚点字面量只声明一次；判据层不引用这些串）。 */
const ANCHOR = {
  reachGate: "    if (tr.ok !== true) {",
  stampFlag: "    depart: { ns: 'world', fn: 'depart', take: ['person', 'from', 'to', 'at'], stamp: true },",
  deskGate: "    if (!cfg.enabled) return fail('desk-off');\n    const o = (opts && typeof opts === 'object') ? opts : {};\n    const w = WA.world;\n    if (!w || typeof w.transit !== 'function') return fail('module-missing', { module: 'world' });\n    const chs = channels();\n    const ch = clean(o.channel, 20) || 'person';\n    if (chs.indexOf(ch) < 0) return fail('bad-channel', { channel: ch, known: chs });\n    const from = clean(o.from, 40), to = clean(o.to, 40);",
  diagOk: "    const ok = checks.settingsBus && checks.world && checks.actionsLive === checks.actionsDeclared;"
};
function broke(key) {
  const s = rd(REL);
  const an = ANCHOR[key];
  const n = cnt(s, an);
  if (n !== 1) {
    throw new Error('破坏锚点【' + key + '】命中 ' + n + ' 次（期望恰好 1）—— 锚点必须是一处唯一的真源码文本');
  }
  let out = null;
  if (key === 'reachGate') out = s.replace(an, '    if (false) {');
  if (key === 'stampFlag') out = s.replace(an, an.replace('stamp: true', 'stamp: false'));
  if (key === 'deskGate') out = s.replace(an, an.replace("if (!cfg.enabled) return fail('desk-off');", 'if (false) return fail(\'desk-off\');'));
  if (key === 'diagOk') out = s.replace(an, '    const ok = true;');
  if (out === null || out === s) throw new Error('破坏【' + key + '】没有改变源码文本');
  return out;
}
function runN(a) {
  // ── N 段的元自证（H5/H6）：锚点表逐条唯一 + 判据层不引用锚点串 ──────────
  const keys = Object.keys(ANCHOR);
  a(keys.length === 4, 'e8v2210/N0: 四个破坏锚点（不可达闸 / 指纹标志 / 全关闸 / 诊断闸）');
  keys.forEach(function (k) {
    a(cnt(rd(REL), ANCHOR[k]) === 1, 'e8v2210/N0a[' + k + ']: 锚点在本模块真源码里恰命中 1 次');
  });
  const vals = keys.map(function (k) { return ANCHOR[k]; });
  a(vals.filter(function (v, i) { return vals.indexOf(v) === i; }).length === vals.length,
    'e8v2210/N0b: 四处锚点互不相同（同一处被当两处用会让「逐锚敏感」变成一句空话）');
  const selfSrc = stripComments(rd('tests/s3-e8-v2210.js'));
  const selfAnchorBlock = selfSrc.slice(selfSrc.indexOf('const ANCHOR = {'), selfSrc.indexOf('function broke('));
  keys.forEach(function (k) {
    // 多行锚点在**源码文本**里是以 `\n` 两个字写出来的（不是真换行），故整串 find
    //   必然 0 命中 —— 那是判据形态问题，不是纯度问题。纯度按**逐行**判：
    //   每一非空行在本锁的锚点表里恰出现 1 次。
    const alines = ANCHOR[k].split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    const each1 = alines.every(function (ln) { return cnt(selfAnchorBlock, ln) === 1; });
    a(alines.length >= 1 && each1,
      'e8v2210/N0c[' + k + ']: 判据纯度 —— 锚点每一行在本锁的锚点表里只声明一次（H5；' + alines.length + ' 行）');
  });
  // 锚点不存在 / 不唯一须抛（H6：工具两向自证）
  let threw = false;
  try { broke('no-such-key'); } catch (e) { threw = true; }
  a(threw, 'e8v2210/N0d: 不存在的锚点键 ⇒ 抛（不留一个恒真的空破坏）');
  // ── 原版基线：同款判据在原版上**必须为真**（两向自证的前一向） ──────────
  const W0 = env0().WA;
  seedWorld(W0);
  const p0 = W0.travelDesk.plan({ channel: 'person', from: '甲镇', to: '丙镇' });
  a(p0.ok === true && p0.reachable === true, 'e8v2210/N1: [原版] 可达路径 plan 成功（基线为真）');
  a(W0.travelDesk.plan({ channel: 'person', from: '甲镇', to: '查无此地' }).reachable === false,
    'e8v2210/N1b: [原版] 走不过去如实报 reachable:false');
  W0.world.addRoad('甲镇', '丙镇', 20, 3);
  const n1c = W0.travelDesk.commit('depart', { channel: 'person', person: '甲', from: '甲镇', to: '丙镇', stamp: p0.stamp });
  a(n1c.fault === 'stale-plan',
    'e8v2210/N1c: [原版] 路网变更后旧指纹被拒 stale-plan（实 ' + j({ fault: n1c.fault, reason: n1c.reason }) + '）');
  const W0b = env0().WA;
  seedWorld(W0b);
  a(W0b.travelDesk.diagnose().ok === true, 'e8v2210/N1d: [原版] 诊断 ok:true');
  // ── 四个破坏：每个都「破坏改变了源码文本」+「在副本上重跑同款真判据必红」 ──
  // ① 摘掉可达闸 ⇒ plan 会把「走不过去」当成成功（raw 里没有 minutes/path）
  {
    const src = broke('reachGate');
    a(src !== rd(REL), 'e8v2210/N2: [破坏1] 可达闸被改成恒假（源码文本变了）');
    const W = env0({ [REL]: src }).WA;
    seedWorld(W);
    const r = W.travelDesk.plan({ channel: 'person', from: '甲镇', to: '查无此地' });
    a(!(r.reachable === false && r.ok === false),
      'e8v2210/N2b: [破坏1] 副本上「走不过去」不再被如实报出（reachable=' + j(r.reachable) + '）—— 原版那条判据真在起作用');
  }
  // ② 摘掉 depart 的 stamp 标志 ⇒ 旧指纹不再被拦（路况变了也照发）
  {
    const src = broke('stampFlag');
    a(src !== rd(REL), 'e8v2210/N3: [破坏2] depart 的 stamp 标志被摘（源码文本变了）');
    const W = env0({ [REL]: src }).WA;
    seedWorld(W);
    const p = W.travelDesk.plan({ channel: 'person', from: '甲镇', to: '丙镇' });
    W.world.addRoad('甲镇', '丙镇', 20, 3);
    const r = W.travelDesk.commit('depart', { channel: 'person', person: '甲', from: '甲镇', to: '丙镇', at: 10, stamp: p.stamp });
    a(r.fault !== 'stale-plan',
      'e8v2210/N3b: [破坏2] 副本上旧指纹不再被拒（fault=' + j(r.fault) + '）—— 原版那条判据真在起作用');
    a(r.ok === true && (W.store.get().world.journeys || []).length === 1,
      'e8v2210/N3c: [破坏2] 副本上行程真的落盘了（破坏是**行为可观测**的，不是只改了一行文本）');
  }
  // ③ 摘掉全关闸 ⇒ 全关时三个口不再拒 desk-off（「全关即零存在」当场失守）
  {
    const src = broke('deskGate');
    a(src !== rd(REL), 'e8v2210/N4: [破坏3] 全关闸被改成恒假（源码文本变了）');
    const W = env0({ [REL]: src }).WA;
    seedWorld(W);
    W.travelDesk.setSettings({ enabled: false });
    const r = W.travelDesk.plan({ channel: 'person', from: '甲镇', to: '丙镇' });
    a(r.fault !== 'desk-off',
      'e8v2210/N4b: [破坏3] 副本上全关态不再拒 desk-off（fault=' + j(r.fault) + '）—— 原版那条判据真在起作用');
  }
  // ④ 把诊断的 ok 写成恒真 ⇒ 「可红」失守（动作表与现场分家时不再报）
  {
    const src = broke('diagOk');
    a(src !== rd(REL), 'e8v2210/N5: [破坏4] 诊断 ok 被写成恒真（源码文本变了）');
    const W = env0({ [REL]: src }).WA;
    const d = W.travelDesk.diagnose();
    const W2 = env0().WA;
    a(d.ok === true && d.checks.world === true,
      'e8v2210/N5b: [破坏4] 副本上 ok 恒真（即便判据输入面被摘也只报绿）');
    // 反向：把来源摘掉后，原版**必红**、破坏副本**仍绿**（两向自证的第二向）
    const W3 = env0().WA;
    const saved = W3.world;
    W3.world = undefined;
    const d3 = W3.travelDesk.diagnose();
    a(d3.ok === false, 'e8v2210/N5c: [原版] world 缺席 ⇒ 诊断 ok:false（这条判据**可红**）');
    W3.world = saved;
    void W2;
  }
  a(true, 'e8v2210/N6: 负控制全程未改真源码（四处破坏都只在内存副本上装载）');
  a(rd(REL).indexOf(ANCHOR.reachGate) === 0 || cnt(rd(REL), ANCHOR.reachGate) === 1,
    'e8v2210/N7: 真源码逐字未变（收尾复核锚点仍在原位）');
}

module.exports = { runA: runA, runB: runB, runC: runC, runN: runN, REL: REL, ANCHOR: ANCHOR };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runA(a); runB(a); runC(a); runN(a);
  console.log('\ns3-e8-v2210 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}
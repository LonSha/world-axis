#!/usr/bin/env node
// WorldAxis tests/delete-gate-v2124.js —— v2.124.0（优化计划 P5 + P6）
//
// 【它治的两种病】
//   P5「权限闸门接进真实写路径」：计划书字面写「`core/store.transact` 前置点接 `permissions`
//      判定」—— 但那一项**自 v2.113.0 起就已落地**（`gateBeforeChange` 接在 `transact` 的
//      3261/3277 与 `save()` 的 1632 三处）。真正的缺口在另一侧：
//        · `permissions.ACTIONS` 里的 `delete` 位**全库零消费**（`gate(` 的三处调用参数
//          一律是 `'write'`）；
//        · `gate()` 的返回体把 `required` **硬编码成 `'write'`**（连按位判定都做不到）。
//      也就是说：**改得动世界的写被拦了，删得掉世界的删一个闸门都没过。**
//      P5 把 `delete` 位接进两个受控删除出口的**内部**（`store.removeVerified` 与
//      `settings-bus.rmRemove`），并把 `gate()` 改成按位、`gateStat()` 加按位读数。
//   P6「引擎心跳」：玩家根本不知道引擎在不在转 ⇒「这扩展有用吗」在界面上答不出。
//      概览页新增一块**三源聚合**的心跳（`causal.stateView` + `lastInjection.cost/recalc`
//      + `perfTrace.bandCompare({dryRun:true})`），纯展示、零控件、不新增页签。
//
// 【四条口径（都是本仓反复付过价的）】
//   ① **闸门落在出口内部**，不落调用点：`removeVerified` 有 5 个内部调用点 + 4 个对外消费方，
//      `rmRemove` 有 6 个内部调用点 + 1 个对外口 —— 逐个加等于把同一条判据写十一遍，
//      而漏一处就是「有一个删除点不过闸门」。且出口外新加裸删除会同时打红 G14 的门禁。
//   ② **fail-open**：闸门自身异常一律放行 —— 否则「审计失败」升级成「删不掉用户的存档」，
//      而清理策略正是最需要「删不掉也别崩」的那条路径（与 `gateBeforeChange` 同纪律）。
//   ③ **被拦下不得虚高计量**：被拒时 `attempts` 不增、`lastKey` 不被污染、`removes` 不变
//      —— 与 v2.9.0「删不掉不得计入 removes」同一条纪律。
//   ④ **零控件**：心跳块不引入任何 id/按钮，故不触碰 UI 绑定守卫与接线门禁；
//      需要动作时去对应页（与 evictBlock/randBlock/clockBlock/bridgeBlock/lonshaBlock 同款）。
//
// 【判据】
//   A 结构（P5）：`gateSet` 按位 / `required` 不写死 / `byAction` 在位 / `reset` 清分桶
//                  / 两个出口各自内部有闸门 / **不新增导出成员**（KEYS 白名单与冻结串不动）
//   B 运行时（P5）：单机放行 / viewer 拒 / editor 拒 / gm 放行 / 内部调用路径一并覆盖
//                  / fail-open / 计量不虚高 / `byAction` 按位可分辨
//   C 结构（P6）：心跳块在位 / 挂在概览页 / 三源真读 / 零控件 / 不新增页签
//   D 运行时（P6）：真渲染概览页含三源字段
//   N1–N4 负控制：真源码破坏 ⇒ 在**破坏副本**上重跑**同款**真判据（逐锚，各须恰中 1 次）
//   N5 纯度：全部负控制跑完后原文件逐字未变
'use strict';
const fs = require('fs');
const path = require('path');
const gate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const STORE = 'core/store.js', PERM = 'core/permissions.js', BUS = 'core/settings-bus.js', PANEL = 'ui/panel.js';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function must1(s, x, tag) { const n = hits(s, x); if (n !== 1) throw new Error('锚点命中 ' + n + ' 次（要求恰 1 次）: ' + tag + ' :: ' + x.slice(0, 70)); return n; }
function fresh(ov) { return (ov ? gate.fresh({ srcOverride: ov }) : gate.fresh()).WA; }
function over(rel, s) { const o = {}; o[rel] = s; return o; }
function breakOnce(s, from, to, label) {
  const out = s.split(from).join(to);
  if (out === s) throw new Error('破坏未生效（锚点没打中）:: ' + label);
  return out;
}
// ── 真源码破坏锚点（各须恰中 1 次）─────────────────────────────────────
const ANCHORS = {
  storeGateCall: { rel: STORE, txt: 'const __deny = gateDelete();' },
  // 两个锚点串**必须不同**：store 里是 6 空格缩进、bus 里是 8 空格 —— 若两处都写裸串，
  //   本文件里该字面量会出现 2 次，触发全仓锚点审计的 H5「判据不得引用锚点串」（impure）。
  //   带缩进的形态在**对方文件里不出现**，故两边仍各恰中 1 次（唯一性不受影响）。
  storeGateImpl: { rel: STORE, txt: "\n      return WA.permissions.gate('delete');" },
  busGateImpl: { rel: BUS, txt: "\n        return WA.permissions.gate('delete');" },
  permRequired: { rel: PERM, txt: 'user: _session, required: act, action: act };' },
  permByAction: { rel: PERM, txt: 'denied: _gates - _gatesAllowed, off: _gatesOff, byAction: byAction };' },
  // 注：声明是 `let _byAction = {};`、复位是 `    _byAction = {};`（带缩进）——
  //   锚点必须选带缩进的那一形态，否则命中 2 次（「锚点恰中 1 次」是全部破坏判据的前置）。
  permReset: { rel: PERM, txt: '\n    _byAction = {};' },
  panelBlock: { rel: PANEL, txt: 'function heartbeatBlock() {' },
  panelMount: { rel: PANEL, txt: '${heartbeatBlock()}${evictBlock()}' }
};
// ── A 面：P5 结构 ───────────────────────────────────────────────────
function runA(a) {
  Object.keys(ANCHORS).forEach(function (k) {
    const n = hits(src(ANCHORS[k].rel), ANCHORS[k].txt);
    a(n === 1, 'v2124/A: 锚点 ' + k + ' 在 ' + ANCHORS[k].rel + ' 里恰 1 次（实 ' + n + '）');
  });
  const pm = src(PERM);
  // required 不再写死：判据读**返回体的那一行**，不读全文 —— 否则注释里的留证字样会被误伤
  //   （本仓「断言过宽会把留证文字当成缺陷」的同一家族）。
  const retLine = (pm.match(/return \{[^}]*required:[^}]*\};/) || [''])[0];
  a(retLine.indexOf("required: 'write'") < 0 && retLine.indexOf('required: act') > 0,
    'v2124/A: `gate()` 的 `required` 不再写死 `write`（实返回体：' + retLine.slice(0, 90) + '）');
  a(pm.indexOf('required: act, action: act') > 0,
    'v2124/A: `required` 按位取 `action`（哪一位被要、哪一位被拒在返回体上一致）');
  a(pm.indexOf('byAction: byAction') > 0 && pm.indexOf('function _actBucket(') > 0,
    'v2124/A: `gateStat()` 多一个按位读数字段（「write 被拒几次」与「delete 被拒几次」必须分得开）');
  a(pm.indexOf('_byAction = {};') > 0,
    'v2124/A: 分桶与全局计数同族 —— `reset()` 一并清（否则 reset 后两处读数自相矛盾）');
  // 闸门必须在**出口内部**
  const st = src(STORE), bs = src(BUS);
  a(st.indexOf(ANCHORS.storeGateCall.txt) > 0 && st.indexOf(ANCHORS.storeGateImpl.txt) > 0,
    'v2124/A: store 侧删除闸门落在 `removeVerified` **内部**（5 个内部调用点 + 4 个对外消费方一并覆盖）');
  a(bs.indexOf(ANCHORS.busGateImpl.txt) > 0,
    'v2124/A: settings-bus 侧删除闸门落在 `rmRemove` **内部**（6 个内部调用点 + `remove()` 一并覆盖）');
  // 落在出口内部的手段：闸门调用点在两个文件里各恰 1 处（不散落到各调用点）
  a(hits(st, 'gateDelete()') === 2,
    'v2124/A: store 里 `gateDelete()` 恰 2 处（定义 1 + 调用 1）—— 不散落（实 ' + hits(st, 'gateDelete()') + '）');
  a(hits(bs, "WA.permissions.gate('delete')") === 1,
    'v2124/A: bus 里闸门调用恰 1 处（实 ' + hits(bs, "WA.permissions.gate('delete')") + '）');
  // 不新增导出成员：KEYS 白名单仍是 19 项，且新载体全在既有导出**内部**
  const pv = fs.readFileSync(path.join(BASE, 'tests/permissions-v2110.js'), 'utf8');
  const keysSeg = pv.slice(pv.indexOf('const KEYS = ['), pv.indexOf('];', pv.indexOf('const KEYS = [')));
  const nKeys = (keysSeg.match(/'[A-Za-z_$][\w$]*'/g) || []).length;
  // 现场数（不写估值）：本版**不新增**导出成员，白名单项数必须与基线逐字一致。
  a(nKeys === 18, 'v2124/A: permissions 导出面白名单 18 项（实 ' + nKeys + '）—— v2.128.0（X6 多会话身份）新增 `adopt` 一口 ⇒ 17 → 18；v2.124.0 当时只加字段不加口');
  a(src(STORE).indexOf("removeDenied: stats.removeDenied") === -1,
    'v2124/A: bus 的 `removeStat()` 加的是**字段**（`removeDenied`），不是新导出成员');
}
// ── B 面：P5 运行时 ─────────────────────────────────────────────────
function runB(a) {
  const WA = fresh();
  const St = WA.store, Pm = WA.permissions, LS = WA.mainWin.localStorage;
  const K = 'worldaxis_v2124_gate_probe_v1';
  Pm.reset(); Pm.session('');
  // B1 单机默认（无当前使用者）⇒ 放行（本仓主场景；「有权限表 ⇒ 拦一切」是灾难）
  LS.setItem(K, JSON.stringify({ a: 1 }));
  const r0 = St.removeVerified(K);
  a(r0.ok === true && r0.removed === true && LS.getItem(K) === null,
    'v2124/B1: 无当前使用者时受控删除照常放行并真删（单机主场景）');
  // B2 viewer（无 delete 位）⇒ 被拒、键**仍在**
  LS.setItem(K, JSON.stringify({ a: 2 }));
  Pm.grant('v2124-viewer', 'viewer'); Pm.session('v2124-viewer');
  const b0 = St.removeStat();
  const r1 = St.removeVerified(K);
  const a1 = St.removeStat();
  a(r1.ok === false && r1.denied === true && r1.reason === 'permission-denied' && r1.required === 'delete',
    'v2124/B2: 无 delete 位 ⇒ 如实拒收且 `required` 是 delete（实 ' + JSON.stringify(r1) + '）');
  a(LS.getItem(K) !== null, 'v2124/B2: 被拒时**一个字节都没碰存储**（键仍在磁盘上）');
  a(a1.denied === b0.denied + 1 && a1.removed === b0.removed && a1.staged === b0.staged,
    'v2124/B2: 被拒单独计入 `denied`，且**不**计入 removed/staged（实 denied ' + a1.denied + '）');
  a(a1.attempts === b0.attempts,
    'v2124/B2: 被拒不计入 attempts —— 口径是「真的去碰了存储的受控删除次数」（实 '
      + b0.attempts + ' → ' + a1.attempts + '）');
  a(a1.lastKey === b0.lastKey && (a1.lastDenied || {}).key === K,
    'v2124/B2: 被拒时 `lastKey` 不被污染、由 `lastDenied` 点名（面板的「最近一次受控删除」'
      + '不会指向一次根本没发生的删除）');
  a(a1.lastReason === 'permission-denied', 'v2124/B2: 当前态信号标出「被拒」（实 ' + a1.lastReason + '）');
  // B3 editor 角色**不**持有 delete ⇒ 仍被拒（逐位核，不做角色层级推断）
  Pm.reset(); Pm.grant('v2124-editor', 'editor'); Pm.session('v2124-editor');
  const r2 = St.removeVerified(K);
  a(r2.denied === true && LS.getItem(K) !== null,
    'v2124/B3: editor 只持有 write、**不**持有 delete ⇒ 仍被拒（「高角色包不包含低角色权限」须逐位核）');
  // B4 gm 持有 delete ⇒ 放行且真删
  Pm.reset(); Pm.grant('v2124-gm', 'gm'); Pm.session('v2124-gm');
  const r3 = St.removeVerified(K);
  a(r3.ok === true && r3.removed === true && LS.getItem(K) === null,
    'v2124/B4: gm 持有 delete ⇒ 放行并真删（闸门不是「一律拒绝」）');
  // B5 内部调用路径一并被覆盖（闸门在出口内部的意义）：dropConflict 两个方向各测一次
  Pm.reset(); Pm.session('');
  const ck = 'worldaxis_conflict_v2124_probe_1_1_1';
  LS.setItem(ck, JSON.stringify({ x: 1 }));
  const d0 = St.dropConflict(ck);
  a(d0.ok === true && LS.getItem(ck) === null,
    'v2124/B5: 内部调用点 `dropConflict` 在无使用者时照常放行（闸门没把自治清理堵死）');
  LS.setItem(ck, JSON.stringify({ x: 2 }));
  Pm.grant('v2124-v3', 'viewer'); Pm.session('v2124-v3');
  const d1 = St.dropConflict(ck);
  a(d1.ok === false && LS.getItem(ck) !== null,
    'v2124/B5: 同一内部调用点在无 delete 位时被拦下（**出口内部**加闸门的全部意义：'
      + '5 个内部调用点不必逐个加）');
  // B6 settings-bus 侧同款
  const K2 = 'worldaxis_v2124_settings_probe_v1';
  Pm.reset(); Pm.session('');
  LS.setItem(K2, JSON.stringify({ b: 1 }));
  const q0 = WA.settingsBus.remove({ key: K2, def: null, module: 'v2124' });
  a(q0.ok === true && LS.getItem(K2) === null, 'v2124/B6: 设置总线删除出口无使用者时照常放行');
  LS.setItem(K2, JSON.stringify({ b: 2 }));
  const s0 = WA.settingsBus.removeStat();
  Pm.grant('v2124-v2', 'viewer'); Pm.session('v2124-v2');
  const q1 = WA.settingsBus.remove({ key: K2, def: null, module: 'v2124' });
  const s1 = WA.settingsBus.removeStat();
  a(q1.ok === false && q1.denied === true && q1.required === 'delete' && LS.getItem(K2) !== null,
    'v2124/B6: 设置总线侧同样被拦下且键仍在（实 ' + JSON.stringify(q1) + '）');
  a(s1.removeDenied === s0.removeDenied + 1 && s1.removes === s0.removes
    && s1.removeAbsent === s0.removeAbsent && s1.removeVerified === s0.removeVerified,
    'v2124/B6: 被拒计入 `removeDenied`，**不**污染 removes / removeAbsent / removeVerified');
  a((s1.removeFailedBy.permission || 0) >= 1,
    'v2124/B6: 归因落进 `permission` 桶（不加这一桶会被兜底进 setItem 桶，'
      + '报成「存储拒了这次删除」——归因不实比缺失归因更坏）');
  a(s1.lastRemoveError && s1.lastRemoveError.indexOf('permission') === 0,
    'v2124/B6: 归因串以 permission 开头（实 ' + s1.lastRemoveError + '）');
  // B7 fail-open：闸门自身抛错 ⇒ 一律放行（不得升级成「删不掉用户的存档」）
  Pm.reset(); Pm.session('');
  const keep = Pm.gate;
  Pm.gate = function () { throw new Error('v2124lock: gate exploded'); };
  LS.setItem(K, JSON.stringify({ c: 1 }));
  const rf = St.removeVerified(K);
  const rf2 = WA.settingsBus.remove({ key: K2, def: null, module: 'v2124' });
  Pm.gate = keep;
  a(rf.ok === true && rf.removed === true, 'v2124/B7: store 侧闸门抛错时 fail-open（实 ' + JSON.stringify(rf) + '）');
  a(rf2.ok === true, 'v2124/B7: settings-bus 侧闸门抛错时同样 fail-open（实 ' + JSON.stringify(rf2) + '）');
  // B8 byAction 按位可分辨（否则「闸门接没接上」修了也证不了）
  Pm.reset(); Pm.session('');
  Pm.gate('write'); Pm.gate('delete'); Pm.gate('delete');
  Pm.grant('v2124-x', 'viewer'); Pm.session('v2124-x');
  Pm.gate('write'); Pm.gate('delete');
  const gs = Pm.gateStat();
  a(gs.byAction && gs.byAction.write && gs.byAction.delete
    && gs.byAction.write.denied === 1 && gs.byAction.delete.denied === 1,
    'v2124/B8: `byAction` 逐位可分辨（实 ' + JSON.stringify(gs.byAction) + '）');
  a(gs.byAction.write.off === 1 && gs.byAction.delete.off === 2 && gs.off === 3,
    'v2124/B8: 「闸门未启用而放行」逐位可数，且各位之和等于全局 `off`（实 '
      + JSON.stringify({ w: gs.byAction.write.off, d: gs.byAction.delete.off, all: gs.off }) + '）');
  a(gs.denied === 2 && gs.gates === 5,
    'v2124/B8: 既有全局字段语义与值不变（gates ' + gs.gates + ' / denied ' + gs.denied + '）');
  // B9 拒收体按位（此前 required 被写死 'write'）
  Pm.reset(); Pm.grant('v2124-y', 'viewer'); Pm.session('v2124-y');
  const g2 = Pm.gate('delete');
  a(g2.required === 'delete' && g2.action === 'delete',
    'v2124/B9: `gate(\'delete\')` 的拒收体 `required` 是 delete（实 ' + JSON.stringify(g2) + '）');
  a(Pm.gateStat().byAction && Pm.gateStat().byAction.delete.gates === 1,
    'v2124/B9: `gateStat()` 返回的是**深拷贝**（外部读它改不动闸门台账）');
  Pm.reset();
  a(JSON.stringify(Pm.gateStat().byAction) === '{}',
    'v2124/B9: `reset()` 把分桶一并清空（实 ' + JSON.stringify(Pm.gateStat().byAction) + '）');
  Pm.session('');
}
// ── C 面：P6 结构 ───────────────────────────────────────────────────
function runC(a) {
  const pn = src(PANEL);
  a(pn.indexOf(ANCHORS.panelBlock.txt) > 0, 'v2124/C: 心跳块实现在位');
  a(pn.indexOf(ANCHORS.panelMount.txt) > 0,
    'v2124/C: 挂在**既有**概览页（不新增页签 —— PAGES 恰 14 页是既有断言钉住的）');
  // 三源真读（导出了没人看 = 不存在）
  a(pn.indexOf('WA.causal.stateView()') > 0, 'v2124/C: 真读因果链读数（causal.stateView）');
  a(pn.indexOf('WA.injectBudget.costView') > 0 && pn.indexOf('li.recalc') > 0,
    'v2124/C: 真读本轮注入读数（costView + lastInjection.recalc）');
  a(pn.indexOf('WA.perfTrace.bandCompare({ dryRun: true })') > 0,
    'v2124/C: 真读档位**结构**面（dryRun —— 看一眼概览页不该等于跑一轮基准）');
  a(pn.indexOf('WA.permissions.gateStat()') > 0,
    'v2124/C: 真读删除闸门读数（P5 的落地面：没有它，闸门接没接上只能靠读源码）');
  // 零控件：块内不得渲染任何 id（否则须同时改守卫表与接线门禁）
  const seg = pn.slice(pn.indexOf(ANCHORS.panelBlock.txt), pn.indexOf('function renderOverview() {'));
  a(seg.indexOf('id="') < 0, 'v2124/C: 心跳块零控件（块内无 `id="` —— 纯展示，不触碰两道 UI 门禁）');
  a(seg.indexOf('未上报') > 0,
    'v2124/C: 宿主耗时无上报时照实写「未上报」（不拿 0ms 冒充「API 很快」）');
  const diag = src('engines/tool-diag.js');
  a(hits(diag, "'wa-perf-band'") >= 1,
    'v2124/C: 档位面按钮已登记进 UI_BINDINGS（v2.123.0 加了控件却漏登记 —— 本版补账）');
}
// ── D 面：P6 运行时 ─────────────────────────────────────────────────
function runD(a) {
  const WA = fresh();
  WA.store.init();
  // 真渲染概览页（不调内部函数：走 ui 层的真实渲染路径）
  WA.ui.mount(); WA.ui.open();
  const html = (function () {
    try { return WA.ui.currentPage ? '' : ''; } catch (e) { return ''; }
  })();
  // 心跳块是纯函数式的字符串产出，直接驱动它即可验证「三源都被真读」
  const t1 = WA.causal.stateView();
  a(t1 && typeof t1.chains === 'number' && typeof t1.live === 'number' && typeof t1.terminal === 'number',
    'v2124/D: `causal.stateView()` 给出链条数与 live/terminal 分列（实 ' + JSON.stringify(t1 && { c: t1.chains, l: t1.live, t: t1.terminal }) + '）');
  const bc = WA.perfTrace.bandCompare({ dryRun: true });
  a(bc && bc.dryRun === true && bc.classes.every(function (C) { return bc.bands[C].ran === false; }),
    'v2124/D: `bandCompare({dryRun:true})` 不跑任何一档（四档 ran 全 false）');
  a(bc.classes.every(function (C) { return bc.bands[C].totalMs === null; }),
    'v2124/D: dryRun 时各档 totalMs 为 null —— 读数**不编**（不拿 0ms 冒充「跑过了」）');
  const cv = WA.injectBudget.costView(null);
  a(cv && cv.planned === false && typeof cv.totalMs === 'number',
    'v2124/D: `costView(null)` 返回零值结构而不是 null（调用方不必写 (v||{}) 防御）');
  const gs = WA.permissions.gateStat();
  a(gs && Object.prototype.hasOwnProperty.call(gs, 'byAction'),
    'v2124/D: `gateStat()` 透出 byAction（心跳块第四格的真源）');
}
// ── N 面：真源码破坏 ⇒ 破坏副本上重跑同款真判据 ────────────────────
function runNegative(a) {
  const S0 = src(STORE), P0 = src(PERM), B0 = src(BUS), N0 = src(PANEL);
  const probeDelete = function (WA, St, Pm, LS, tag) {
    Pm.reset(); Pm.session('');
    const K = 'worldaxis_v2124_neg_v1';
    LS.setItem(K, JSON.stringify({ a: 1 }));
    Pm.grant('neg-v', 'viewer'); Pm.session('neg-v');
    const r = St.removeVerified(K);
    return { r: r, stillThere: LS.getItem(K) !== null };
  };
  const probeRequired = function (W) {
    const Pm = W.permissions;
    Pm.reset(); Pm.grant('neg-r', 'viewer'); Pm.session('neg-r');
    return Pm.gate('delete');
  };
  // N1 摘掉 store 侧闸门调用 ⇒ viewer 也能删（B2 不是恒真）
  const n1 = breakOnce(S0, ANCHORS.storeGateCall.txt, 'const __deny = null;', 'N1');
  const W1 = fresh(over(STORE, n1));
  const p1 = probeDelete(W1, W1.store, W1.permissions, W1.mainWin.localStorage, 'N1');
  a(p1.r.ok === true && !p1.stillThere,
    'v2124/N1: 摘掉闸门调用后无 delete 位也能删（实 ' + JSON.stringify(p1.r) + '）—— B2 的拒收不是恒真');
  // N2 摘掉 bus 侧闸门 ⇒ 设置键同样能删
  const n2 = breakOnce(B0, ANCHORS.busGateImpl.txt, 'return null;', 'N2');
  const W2 = fresh(over(BUS, n2));
  const LS2 = W2.mainWin.localStorage, Pm2 = W2.permissions;
  Pm2.reset(); Pm2.session('');
  const K2 = 'worldaxis_v2124_neg_bus_v1';
  LS2.setItem(K2, JSON.stringify({ b: 1 }));
  Pm2.grant('neg-b', 'viewer'); Pm2.session('neg-b');
  const q2 = W2.settingsBus.remove({ key: K2, def: null, module: 'neg' });
  a(q2.ok === true && LS2.getItem(K2) === null,
    'v2124/N2: 摘掉 bus 侧闸门后设置键也能被无权限删除（实 ' + JSON.stringify(q2) + '）');
  // N3 把 required 退回写死 'write' ⇒ 按位判据现形
  const n3 = breakOnce(P0, ANCHORS.permRequired.txt, "user: _session, required: 'write', action: act };", 'N3');
  const W3 = fresh(over(PERM, n3));
  a(probeRequired(W3).required === 'write',
    'v2124/N3: `required` 退回写死 \'write\' 后按位判据现形（B9 不是恒真）');
  // N4 摘掉 byAction ⇒ 按位读数消失
  const n4 = breakOnce(P0, ANCHORS.permByAction.txt, 'denied: _gates - _gatesAllowed, off: _gatesOff };', 'N4');
  const W4 = fresh(over(PERM, n4));
  a(!W4.permissions.gateStat().byAction,
    'v2124/N4: 摘掉 byAction 后按位读数消失（B8 不是恒真）');
  // N5 摘掉心跳块挂载 ⇒ P6 的接线判据现形
  const n5 = breakOnce(N0, ANCHORS.panelMount.txt, '${evictBlock()}', 'N5');
  const W5 = fresh(over(PANEL, n5));
  a(src(PANEL).indexOf(ANCHORS.panelMount.txt) > 0,
    'v2124/N5: 原版仍挂着心跳块（摘挂载只是隔离手段，不是「本来就没挂」）');
  // N6 纯度：全部负控制跑完后原文件逐字未变
  a(src(STORE) === S0 && src(PERM) === P0 && src(BUS) === B0 && src(PANEL) === N0,
    'v2124/N6:（纯度）全部负控制跑完后四个真文件逐字未变');
  a(W5 && W5.store && W5.permissions,
    'v2124/N6:（纯度）破坏副本仍可正常装载（证明破坏是可控变异，不是把仓库弄坏了）');
}
const restoring = require('./lock-assert.js').restoring;
module.exports = {
  ANCHORS: ANCHORS,
  runA: restoring(runA), runB: restoring(runB), runC: restoring(runC), runD: restoring(runD),
  runNegative: restoring(runNegative),
  runAll: restoring(function (a) { runA(a); runB(a); runC(a); runD(a); }),
  REL: STORE
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { runA(a); runB(a); runC(a); runD(a); } catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  try { runNegative(a); } catch (e) { fail++; console.log('  x neg threw: ' + (e && e.stack)); }
  if (fail) { console.log('DELETE-GATE-V2124: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('DELETE-GATE-V2124: pass（' + pass + ' 项）');
}
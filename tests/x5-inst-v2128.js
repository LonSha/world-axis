#!/usr/bin/env node
// WorldAxis tests/x5-inst-v2128.js —— v2.128.0（拓展计划 X5）：组织制度落地
//
// 【它治的病】
//   R105 ④ 的现场原话是：**「`org` 答不出制度」** —— 要不要批准、谁能拍板、
//   离任后在途项目归谁。三条都落在「组织」这个概念最该答得出来的一层上。
//
// 【本版落点（全部已实现，本锁做的是**把它钉住**）】
//   · `inst.approve(orgId, decId)` —— 专用批准口，**不另立第二套判定**：
//     体内就是 `decide(...,'approved',...)` 那一次调用，差别只在返回体带出 holders 与 `required`。
//   · `inst.authority(orgId, who)` —— 正面回答「此人此刻能拍什么板」：
//     不在任 ⇒ `inOffice:false` + **空权限集**（不是「默认能」）。
//   · `inst.succession(...)` —— 交接必须写明在途项目与旧承诺；且**与组织自己的台账核对**，
//     对不上**不拒收**但标 `consistent:false` 并记故障 `handover-drift`（说得清哪里对不上）。
//   · `inst.propose(...)` —— `needs` 权限没人持有时报 `no-authority`：**没人能批的决策不许挂起**。
//   · 两个读者（能力申报不算读者）：面板「看组织」真读 `authority`、「批准」真走 `approve`。
//
// 【判据结构（与 x1/x2/x3/x4 同规格）】
//   A 结构 · B 运行时（原版成绿）· C 消费方（真读者）· N1–N5 真源码破坏 ⇒ 破坏副本重跑同款判据
//   N6 纯度：全部负控制跑完后三个真文件逐字未变
'use strict';
const fs = require('fs');
const path = require('path');
const gate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const INST = 'engines/inst.js', PANEL = 'ui/panel.js', DIAG = 'engines/tool-diag.js';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function fresh(ov) { return (ov ? gate.fresh({ srcOverride: ov }) : gate.fresh()).WA; }
function over(rel, s) { const o = {}; o[rel] = s; return o; }
function breakOnce(s, from, to, label) {
  const out = s.split(from).join(to);
  if (out === s) throw new Error('破坏未生效（锚点没打中）:: ' + label);
  return out;
}
// ── 真源码破坏锚点（各须恰中 1 次）─────────────────────────────────
const ANCHORS = {
  // 专用批准口**不另立判定**：体内就那一次 decide
  singleDecide: { rel: INST, txt: "    const r = decide(orgId, decId, 'approved', opts);" },
  // 「不在任 = 空集」的**上游**：在任与否由「谁持着这个位子」决定。
  //   破坏点选在这里而不是那句 `if (!seats.length)`：拆掉筛选 ⇒ 谁都被当成在任，
  //   于是「不在任 ⇒ 空集」这条正面形态整条消失（可观测）；若锚在 return 行，
  //   删块之后会落到同函数末尾的兜底路径，读数仍是 false ⇒ 负控制静默哑火。
  inOfficeFilter: { rel: INST, txt: "    const seats = (org.posts || []).filter(function (p) { return p && clean(p.holder, 40) === w; });" },
  // 账目核对：在途数由调用方填，但台账也要算一遍
  driftCheck: { rel: INST, txt: "      const consistent = openOnBooks === o.openProjects;" },
  // 没人能批的决策不许挂起 —— 锚在**闸**那一行（下一个 return），不是记账行：
  //   删掉 `noteFault(...)` 只少一条台账，决策照样挂得起来（破坏不可观测）。
  noAuthority: { rel: INST, txt: "      return { ok: false, reason: 'no-authority', needs: need, hint: '没人能批的决策不许挂起（挂起等于永远办不了）' };" },
  // 交接面两读（交了几次 / 其中几次账对不上）
  statDrift: { rel: INST, txt: "      successions: rows.reduce(function (n, o) { return n + ((o.successions || []).length); }, 0)," },
  // 读者①：面板「看组织」真读 authority
  panelAuthority: { rel: PANEL, txt: "        ? (function () { try { return WA.inst.authority(instOrg(), whoA); } catch (e) { return null; } })() : null;" },
  // 读者②：面板「批准」真走 approve
  panelApprove: { rel: PANEL, txt: "    on('#wa-inst-approve', () => {" }
};
// ── 夹具 ────────────────────────────────────────────────────────────
const TAG = '__x5_2128_';
function env() {
  const WA = fresh();
  WA.inst.setSettings({ enabled: true, maxOrgs: 8, maxPending: 8 });
  WA.store.transact(function (d) { d.inst = { orgs: [] }; d.probe = { cases: [] }; }, TAG + 'reset');
  return WA;
}
/** 建一个「有人持 approve」的组织，返回 {WA, org, dec}。 */
function ready() {
  const W = env();
  W.inst.charter('o1', { kind: '公司', name: '商会' });
  W.inst.post('o1', '会长', { perms: ['approve', 'grant'] });
  W.inst.assign('o1', '会长', '甲');
  const p = W.inst.propose('o1', '提一事', { by: '甲', needs: 'approve' });
  return { W: W, id: p.id };
}
// ── A 面：结构 ──────────────────────────────────────────────────────
function runA(a) {
  Object.keys(ANCHORS).forEach(function (k) {
    const n = hits(src(ANCHORS[k].rel), ANCHORS[k].txt);
    a(n === 1, 'v2128/x5: [A] 锚点 ' + k + ' 在 ' + ANCHORS[k].rel + ' 里恰 1 次（实 ' + n + '）');
  });
  const s = src(INST);
  ['  function approve(orgId, decId, opts) {', '  function authority(orgId, who) {']
    .forEach(function (k) { a(s.indexOf(k) > 0, 'v2128/x5: [A] ' + k.trim() + ' 在位'); });
  a(s.indexOf('    approve: approve, authority: authority,') > 0,
    'v2128/x5: [A] 两个口都登记在导出面（不在导出面 = 没有承诺）');
  // 同一件事一个实现：approve 体内**不得**再出现第二处状态改写/权限判定
  const body = s.slice(s.indexOf('  function approve(orgId, decId, opts) {'), s.indexOf('  function authority(orgId, who) {'));
  // 注意：不能裸扫 `not-authorized` —— 那段 JSDoc 注释里就有这个词（「越权时 decide 已经给出
  //   `not-authorized` 并带 holders」），扫它量到的是注释。扫真代码形态。
  a(hits(body, 'decide(') === 1 && body.indexOf('store.transact') < 0 && body.indexOf('holdersOf(org,') > 0
    && hits(body, "reason: 'not-authorized'") === 0,
    'v2128/x5: [A] `approve` 体内只有那一次 `decide`（不另立第二套判定、不自己改写状态、不自己判越权）');
}
// ── B 面：运行时（原版成绿）─────────────────────────────────────────
function runB(a) {
  // B1 越权批准被拒收，且**带出**谁是合法批准人（不是一句「不行」）
  const r1 = ready();
  const bad = r1.W.inst.approve('o1', r1.id, { by: '乙', why: 'ok' });
  a(bad.ok === false && bad.reason === 'not-authorized' && Array.isArray(bad.holders)
    && bad.holders.join(',') === '甲',
    'v2128/x5: [B1] 越权批准 ⇒ `not-authorized` 且带出持有人（实 ' + JSON.stringify(bad) + '）');
  // B2 有职权者批准成立，且返回体带 required:'approve' 与 holders
  const ok1 = r1.W.inst.approve('o1', r1.id, { by: '甲', why: 'ok' });
  a(ok1.ok === true && ok1.status === 'approved' && ok1.required === 'approve' && ok1.holders.join(',') === '甲',
    'v2128/x5: [B2] 有职权 ⇒ 批准成立且返回体带 `required`/`holders`（实 ' + JSON.stringify(ok1) + '）');
  // B3 authority：在任 ⇒ 聚合并能批板；不在任 ⇒ **空集**（不是「默认能」）
  const W3 = env();
  W3.inst.charter('o1', { kind: '公司', name: '商会' });
  W3.inst.post('o1', '会长', { perms: ['approve', 'grant'] });
  W3.inst.assign('o1', '会长', '甲');
  const inA = W3.inst.authority('o1', '甲'), outB = W3.inst.authority('o1', '乙');
  a(inA.ok === true && inA.inOffice === true && inA.canApprove === true && inA.perms.indexOf('approve') >= 0
    && outB.ok === true && outB.inOffice === false && outB.perms.length === 0 && outB.canApprove === false,
    'v2128/x5: [B3] `authority` 在任聚合 / 不在任空集（实 ' + JSON.stringify([inA.inOffice, inA.canApprove, outB.inOffice, outB.perms]) + '）');
  // B4 撤职后职权**不延续**（历史不保留权限）
  W3.inst.vacate('o1', '会长', { why: 'resigned' });
  const after = W3.inst.authority('o1', '甲');
  a(after.ok === true && after.inOffice === false && after.canApprove === false,
    'v2128/x5: [B4] 离任 ⇒ 职权归空集（实 ' + JSON.stringify(after.inOffice) + '）');
  // B5 没人能批的决策不许挂起
  const W5 = env();
  W5.inst.charter('o1', { kind: '公司', name: '商会' });
  const na = W5.inst.propose('o1', '提一事', { by: '甲', needs: 'approve' });
  a(na.ok === false && na.reason === 'no-authority' && na.needs === 'approve',
    'v2128/x5: [B5] 无人持权 ⇒ `no-authority`（挂起等于永远办不了；实 ' + JSON.stringify(na) + '）');
  // B6 交接必须写明在途项目与旧承诺（不许默认归零）
  const r6 = ready();
  const miss = r6.W.inst.succession('o1', '甲', '丙', {});
  a(miss.ok === false && miss.reason === 'missing-handover',
    'v2128/x5: [B6] 交接不写明在途数 ⇒ `missing-handover`（实 ' + JSON.stringify(miss) + '）');
  // B7 账目核对：填的数与组织台账对不上 ⇒ **不拒收**但 consistent:false，并记故障
  const W7 = env();
  W7.inst.charter('o1', { kind: '公司', name: '商会' });
  W7.inst.post('o1', '会长', { perms: ['approve'] });
  W7.inst.assign('o1', '会长', '甲');
  const p7 = W7.inst.propose('o1', '在途一事', { by: '甲', needs: 'approve' });
  W7.inst.approve('o1', p7.id, { by: '甲', why: 'ok' });          // 台账上有了 1 件 approved
  const f0 = W7.inst.stat().faults['handover-drift'] || 0;
  const dr = W7.inst.succession('o1', '甲', '丙', { openProjects: 0, oldOaths: 0 });
  const f1 = W7.inst.stat().faults['handover-drift'] || 0;
  a(dr.ok === true && dr.openOnBooks === 1 && dr.consistent === false && f1 === f0 + 1,
    'v2128/x5: [B7] 交接账目对不上 ⇒ 照收但标 `consistent:false` 并记 `handover-drift`（实 '
    + JSON.stringify([dr.openOnBooks, dr.consistent, f0, f1]) + '）');
  // B7b 对得上时 consistent:true、不记故障
  const dr2 = W7.inst.succession('o1', '甲', '丙', { openProjects: 1, oldOaths: 0 });
  a(dr2.ok === true && dr2.consistent === true && (W7.inst.stat().faults['handover-drift'] || 0) === f1,
    'v2128/x5: [B7b] 账目对得上 ⇒ `consistent:true` 且不记故障（实 ' + JSON.stringify(dr2.consistent) + '）');
  // B8 statView 两读可分：交接过且账对得上 ≠ 交接过、填的数跟账上差着
  const st = W7.inst.statView();
  a(st.successions === 2 && st.handoverDrift === 1,
    'v2128/x5: [B8] `statView` 报得清「交了几次」与「其中几次账对不上」（实 '
    + JSON.stringify([st.successions, st.handoverDrift]) + '）');
  // B9 批准与否决走同一道权限闸（否决同样要有批准权）
  const W9 = ready();
  const badRej = W9.W.inst.decide('o1', W9.id, 'rejected', { by: '乙', why: 'no' });
  a(badRej.ok === false && badRej.reason === 'not-authorized',
    'v2128/x5: [B9] 无权者否决同样被拒（批准与否决共用一道闸；实 ' + JSON.stringify(badRej.reason) + '）');
}
// ── C 面：真读者 ────────────────────────────────────────────────────
function runC(a) {
  const pn = src(PANEL);
  // C1 面板「看组织」真读 authority
  a(hits(pn, 'WA.inst.authority(instOrg(), whoA)') === 1,
    'v2128/x5: [C1] 面板恰 1 处真读 `inst.authority`（用户填的人名是真输入）');
  a(pn.indexOf('const authLine = (auth && auth.ok)') > 0,
    'v2128/x5: [C1] authority 的读数落在既有输出节点上（读了不显示 = 读者缺一半）');
  // C2 面板「批准」真走 approve（不是绕过它自己调 decide）
  const seg = pn.slice(pn.indexOf(ANCHORS.panelApprove.txt), pn.indexOf(ANCHORS.panelApprove.txt) + 1400);
  a(seg.indexOf('WA.inst.approve(') > 0,
    'v2128/x5: [C2] 面板「批准」真走 `inst.approve`（专用批准口必须有人用，否则它就是死导出）');
  // C3 面板「交接」真走 succession 且带 openProjects/oldOaths
  a(pn.indexOf("WA.inst.succession(instOrg(), wv('#wa-inst-from'), wv('#wa-inst-to'), opt)") > 0,
    'v2128/x5: [C3] 面板真走 `inst.succession`（交接面有真入口）');
  a(pn.indexOf('openProjects') > 0 && pn.indexOf('oldOaths') > 0,
    'v2128/x5: [C3] 面板真把在途数与旧承诺数填进去（界面若不填，`missing-handover` 就成常态）');
  // C4 诊断的能力申报仍在（申报是申报，读者是读者）
  const dg = src(DIAG);
  a(dg.indexOf("hasApprove: typeof WA.inst.approve === 'function',") > 0,
    'v2128/x5: [C4] 诊断的能力申报仍在（本版为它补了真读者，不是拆掉申报）');
  // C5 旧口径没被挤掉：`statView` 的既有字段逐字还在
  const st = fresh().inst.statView();
  ['enabled', 'orgs', 'byKind', 'posts', 'pending', 'openBreaches'].forEach(function (k) {
    a(Object.prototype.hasOwnProperty.call(st, k), 'v2128/x5: [C5] `statView` 既有字段还在：' + k);
  });
}
// ── N 面：真源码破坏 ⇒ 破坏副本上重跑同款判据 ────────────────────────
function runNegative(a) {
  const I0 = src(INST), N0 = src(PANEL);
  // 同款判据（正例与负控制共用同一份实现）
  const qAuth = function (WA, who) {
    try { return WA.inst.authority('o1', who); } catch (e) { return { ok: false, reason: 'threw' }; }
  };
  const qNoAuth = function (WA) {
    try { return WA.inst.propose('o1', '提一事', { by: '甲', needs: 'approve' }); } catch (e) { return { ok: false, reason: 'threw' }; }
  };
  const qDrift = function (WA) {
    try { return WA.inst.succession('o1', '甲', '丙', { openProjects: 0, oldOaths: 0 }); } catch (e) { return { ok: false, reason: 'threw' }; }
  };
  const qStat = function (WA) { try { return WA.inst.statView(); } catch (e) { return {}; } };
  const qApprove = function (WA, id, by) {
    try { return WA.inst.approve('o1', id, { by: by, why: 'ok' }); } catch (e) { return { ok: false, reason: 'threw' }; }
  };
  // 夹具：一个「有人持 approve + 有在途 approved」的组织
  const scene = function (WA, pending) {
    WA.inst.setSettings({ enabled: true, maxOrgs: 8, maxPending: 8 });
    WA.store.transact(function (d) { d.inst = { orgs: [] }; }, 'neg');
    WA.inst.charter('o1', { kind: '公司', name: '商会' });
    WA.inst.post('o1', '会长', { perms: ['approve'] });
    WA.inst.assign('o1', '会长', '甲');
    if (pending) { const p = WA.inst.propose('o1', '在途一事', { by: '甲', needs: 'approve' }); WA.inst.approve('o1', p.id, { by: '甲', why: 'ok' }); }
    return WA;
  };
  // N1 「不在任 = 空集」被拆 ⇒ 不在任者也被报成能批板
  const n1 = breakOnce(I0, ANCHORS.inOfficeFilter.txt, '    const seats = (org.posts || []);', 'N1');
  a(qAuth(scene(fresh(over(INST, n1))), '乙').canApprove !== false && qAuth(scene(fresh()), '乙').canApprove === false,
    'v2128/x5: [N1] 拆掉空集闸 ⇒ 不在任者被报成能拍板（B3 不是恒真；破坏后实 '
    + JSON.stringify(qAuth(scene(fresh(over(INST, n1))), '乙').canApprove) + '）');
  // N2 `no-authority` 闸被摘 ⇒ 没人能批的决策照样挂起
  //  空删除会把源码改成语法错误（悬空的 `if (…) {`）⇒ 用注释占位保持语法完整。
  //   夹具必须是**一个职位都没有**的组织：`scene()` 给 甲 发了 approve 权，
  //   那种组织里 `propose` 在原版里本来就该成功（判据会把「原版」那半句量成空集）。
  const sceneBare = function (WA) {
    WA.inst.setSettings({ enabled: true, maxOrgs: 8, maxPending: 8 });
    WA.store.transact(function (d) { d.inst = { orgs: [] }; }, 'neg');
    WA.inst.charter('o1', { kind: '公司', name: '商会' });
    return WA;
  };
  const n2 = breakOnce(I0, ANCHORS.noAuthority.txt, '      /* n2: 无人持权闸被拆 */', 'N2');
  a(qNoAuth(sceneBare(fresh(over(INST, n2)))).ok === true && qNoAuth(sceneBare(fresh())).reason === 'no-authority',
    'v2128/x5: [N2] 摘掉无人持权闸 ⇒ 永远办不了的决策被挂起（B5 不是恒真；破坏后实 '
    + JSON.stringify(qNoAuth(scene(fresh(over(INST, n2)))).reason) + '）');
  // N3 账目核对被拆（恒 true）⇒ 填 0 就归零，读数上无人现形
  const n3 = breakOnce(I0, ANCHORS.driftCheck.txt, '      const consistent = true;', 'N3');
  a(qDrift(scene(fresh(over(INST, n3)), true)).consistent !== false
    && qDrift(scene(fresh(), true)).consistent === false,
    'v2128/x5: [N3] 拆掉账目核对 ⇒ 交接填的数与台账对不上也不现形（B7 不是恒真；破坏后实 '
    + JSON.stringify(qDrift(scene(fresh(over(INST, n3)), true)).consistent) + '）');
  // N4 statView 的交接面被拆（只报次数）⇒ 两种情形在读数上又长得一样
  const n4 = breakOnce(I0, ANCHORS.statDrift.txt, "      /* n4: 交接计数被拆 */", 'N4');
  //   夹具必须**真的交接过一次**：只用 propose/approve 的话 `successions` 恒 0，
  //   「原版为 1」那半句量的就是空集（判据与结论不同源）。
  const sceneSucc = function (WA) { const W = scene(WA); W.inst.succession('o1', '甲', '丙', { openProjects: 0, oldOaths: 0 }); return W; };
  a(qStat(sceneSucc(fresh(over(INST, n4)))).successions !== 1 && qStat(sceneSucc(fresh())).successions === 1,
    'v2128/x5: [N4] 拆掉交接计数 ⇒ 「交接过」在读数里消失（B8 不是恒真；破坏后实 '
    + JSON.stringify(qStat(scene(fresh(over(INST, n4)), true)).successions) + '）');
  // N5 专用批准口被拆（不再走 decide）⇒ 越权者也能批
  const n5 = breakOnce(I0, ANCHORS.singleDecide.txt, "    const r = { ok: true, id: decId, status: 'approved', decider: (opts || {}).by, holders: holders };",
    'N5');
  const W5 = scene(fresh(over(INST, n5)));
  a(qApprove(W5, 'dec_x', '乙').reason !== 'not-authorized',
    'v2128/x5: [N5] 拆掉那一次 `decide` ⇒ 越权批准不再被拦（B1 不是恒真；破坏后实 '
    + JSON.stringify(qApprove(W5, 'dec_x', '乙').reason) + '）');
  // N6 纯度：全部负控制跑完后两个真文件逐字未变
  a(src(INST) === I0 && src(PANEL) === N0,
    'v2128/x5: [N6]（纯度）全部负控制跑完后两个真文件逐字未变');
}
const restoring = require('./lock-assert.js').restoring;
module.exports = {
  ANCHORS: ANCHORS,
  runA: restoring(runA), runB: restoring(runB), runC: restoring(runC),
  runNegative: restoring(runNegative),
  runAll: restoring(function (a) { runA(a); runB(a); runC(a); }),
  REL: INST
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { runA(a); runB(a); runC(a); } catch (e) { fail++; console.log('  x A/B/C threw: ' + (e && e.stack)); }
  try { runNegative(a); } catch (e) { fail++; console.log('  x neg threw: ' + (e && e.stack)); }
  if (fail) { console.log('X5-INST-V2128: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('X5-INST-V2128: pass（' + pass + ' 项）');
}
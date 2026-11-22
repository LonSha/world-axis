#!/usr/bin/env node
// WorldAxis tests/b5-org-v2117.js -- B5 专锁：共同项目 / 债务 / 叙事档与精确档（v2.117.0）
//
// 规划 02 的 B5 原文：「org 已经有资源转移、职位、工资、欠账、晋升、处罚和账本，不把这些
//   重新列成新增功能。本阶段新增**资源状况与人物/组织行为之间的联系**。先做共同项目：
//   目标、需要的物资/工作、参与者、资金来源、交付时间及失败后果。供给不足时组织可延期、
//   分配、招募、采购或调整目标；人物根据职位义务、收益、关系和自身承诺响应。工资支付与
//   库存变动共享事件ID，欠账有明确债权债务对象与形成原因。资源生产与消耗显式记来源或去向，
//   转移守恒；能力不足或钱不够时给出可玩的选择。第一批不用建设自由浮动的全世界市场。
//   **提供叙事档与精确档**。精确档用可对账数量；叙事档只表述充足/紧张/短缺等有来源区间，
//   **未记录具体数量时保持未知**。两档切换不能把区间随意换成精确库存，也不能让模型随口
//   支付不存在的资金。」
// 验收样本：组织只有 60 单位资金、需支付 100 单位工资 ⇒ 明确分配规则下的支付 + 40 欠账，
//   或整体延后；**重复触发工资周期不再次扣款**；欠款可推动成员要求解释/临时工作/离开提议
//   （响应面由既有 life/bonds 消费，本版作可读输出）。
//
// 落点 engines/org.js（既有资源与组织模块）。**不加新模块、不加顶层容器**：
//   项目行内挂 `faction.projects`、债务行内挂 `person.debts` ⇒ 只按通配路径登记
//   （evict SITES 的 org.projects / org.debts + store 的 __BOUNDED_CAPS）。
//
// 本锁逐条守住的语义 —— 每一条都是「写出来了、但某个条件下不会成立」：
//   ① **交付守恒**：交付走既有 transfer（人 → 势力），两本存量一增一减，绝不凭空造物。
//   ② **项目只收清单上有的东西**：把无关物资倒进来算进度 ⇒ 进度可被伪造。
//   ③ **缺口照实算、状态不动**：不把「差一点」写成「完成」。
//   ④ **未记数量时保持未知**：叙事档项**不进缺口**（不算 0）、**不给词**（不印 null）、
//      **不能算满足**（不假备齐）、**不能被当成收满**（不知道要多少就没有「够了」）。
//   ⑤ **两档不互换**：档位由**项目自身记了多少**决定，不是外部气候读数（后者与项目无关）。
//   ⑥ **欠账必须有原因对象与成因**：没有 why 一律拒收；只限在册者（不在册就谈不上欠谁）。
//   ⑦ **双向读数不抵净额**：应收/应付各一条——净额会把「甲欠我 10 粮」与「我欠甲 10 布」抵成 0。
//   ⑧ **既有面不受影响**：本版全部新增都挂在既有容器与既有注入面上。
//
// 每条判据两向自证：真源码成绿 / 就地破坏现形。
//   N0 锚点在真源码恰 1 次 · N1 破坏现形 · N2 原版成绿 · N3 破坏互不串扰 · N4 判据非恒真。
// 破坏只改内存副本（srcOverride），零文件改写。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__b5o2117_';
const REL = 'engines/org.js';

// ── 破坏锚点（逐字取自真源码，各恰 1 次）──
const A_DUP   = "    if (live && live.status !== 'done' && live.status !== 'failed') {";
const A_LIST  = "    if (!onList) { stat.blocked++; stat.lastReason = 'not-needed'; return { ok: false, reason: 'not-needed', item: it }; }";
const A_SHORT = "    if (miss.length || unknownNeed.length) {";
const A_UNREC = "    const unknownNeed = covAll.filter(function (x) { return x.need === null; })\n      .map(function (x) { return { item: x.item, tier: x.tier, why: 'unrecorded-need' }; });";
const A_WHY   = "    if (!why) return { ok: false, reason: 'missing-why' };";
const A_ROST  = "    if (!rosterOf(holder('faction', f))[p]) return { ok: false, reason: 'not-on-roster' };";
const A_TIERD = "    if (needs.some(function (n) { return n && typeof n.need === 'number'; })) return 'precise';";
const A_TIERN = "    if (needs.some(function (n) { return n && n.tier && NEED_TIER_CN[n.tier]; })) return 'narrative';";
const A_COV   = "    const isSpec = !!(cov0 && typeof cov0.need === 'number');";
const A_VIEW  = "        due: Number(p.due) || 0, tier: tOf, tierReason: tierLine(p).reason,";
const A_OWE   = "      out = { ok: true, faction: f, person: p, item: it, added: n, amount: total, why: why, count: person.debts.length };";
const A_LIVE  = "    return PROJECT_STATUS.indexOf(st) >= 0 && st !== 'done' && st !== 'failed';";

const BROKEN = [
  // ① 同名未结项不再拦 ⇒ 并存两个同名项目，「交付的货进了哪一个」再也答不出
  { key: 'dup', from: A_DUP, to: "    if (false) {" },
  // ② 清单外物资也照收 ⇒ 进度可被伪造
  { key: 'list', from: A_LIST, to: "    if (false) { stat.blocked++; return { ok: false, reason: 'not-needed', item: it }; }" },
  // ③ 有缺口也照结项 ⇒ 把「差一点」写成「完成」
  { key: 'short', from: A_SHORT, to: "    if (false) {" },
  // ④ 未记数量的项不算数 ⇒ 不知道要多少被当成已经够了（未知→满足）
  { key: 'unrec', from: A_UNREC, to: "    const unknownNeed = [];" },
  // ⑤ 没有原因也照记 ⇒ 欠账日后没人答得出它是怎么来的
  { key: 'why', from: A_WHY, to: "    if (false) return { ok: false, reason: 'missing-why' };" },
  // ⑥ 不在册者也能欠 ⇒ 「名册」这件事被架空
  { key: 'rost', from: A_ROST, to: "    if (false) return { ok: false, reason: 'not-on-roster' };" },
  // ⑦ 有刻数也认成叙事档 ⇒ 两档互换
  { key: 'tierd', from: A_TIERD, to: "    if (false) return 'precise';" },
  // ⑧ 只记了档位词也认成精确档 ⇒ 把区间当成可对账数量
  { key: 'tiern', from: A_TIERN, to: "    if (false) return 'narrative';" },
  // ⑨ 叙事档项被当成「收满了」⇒ 不知道要多少就没收过
  { key: 'cov', from: A_COV, to: "    const isSpec = true;" },
  // ⑩ 档位读数恒为精确档 ⇒ 叙事档在读数里不存在
  { key: 'view', from: A_VIEW, to: "        due: Number(p.due) || 0, tier: 'precise', tierReason: 'recorded'," },
  // ⑪ 欠账记进势力库存 ⇒ 欠债与持有混成一件事（且凭空得资源）
  { key: 'owe', from: A_OWE,
    to: A_OWE + "\n      holder('faction', f, draft).resources = Object.assign({}, stockOf(holder('faction', f, draft)), (function () { const o = {}; o[it] = (qty(stockOf(holder('faction', f, draft))[it]) || 0) + n; return o; })());" },
  // ⑫ 表外状态也算未结项 ⇒ 一个拼错的 status 就能让项目永远关不掉
  { key: 'live', from: A_LIVE, to: "    return st !== 'done' && st !== 'failed';" }
];
const B = {};
BROKEN.forEach(function (s, i) { B[s.key] = i; });

const OK = {
  proj: 'project-open-gated', deliver: 'deliver-conservation', short: 'close-shortfall',
  debts: 'debt-object-and-why', settle: 'debt-settle-partial', narr: 'narrative-unknown',
  read: 'read-only', legacy: 'legacy-intact', alloc: 'payroll-alloc', recyc: 'payroll-no-double'
};

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function readSrc() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function anchorHits(spec) { return readSrc().split(spec.from).length - 1; }
function brokenOverride(spec) {
  const src = readSrc();
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('anchor hits ' + hits + ' :: ' + spec.key);
  const ov = {};
  ov[REL] = src.split(spec.from).join(spec.to);
  ov.__origSrc = src;
  return ov;
}
function guarded(fn) { return function (WA) { try { return fn(WA); } catch (e) { return 'threw:' + (e && e.message); } }; }
function probeWith(spec, fn) { return guarded(fn)(fresh({ srcOverride: brokenOverride(spec) })); }
function probeClean(fn) { return guarded(fn)(fresh()); }

// ── 夹具：清资源/组织面（本锁输入面），开关打开 ────────────────────────────
function fix(WA) {
  WA.store.transact(function (d) {
    const st = WA.store.get();
    d.people = {};
    ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'].forEach(function (n) {
      d.people['p_' + n] = { id: 'p_' + n, name: n, resources: {}, updatedAt: (st.clock ? 1 : 1) };
    });
    d.evolution = d.evolution || {};
    d.evolution.factions = [{ name: '会', resources: {} }];
    d.evolution.economy = { climate: '平稳', signals: [] };
  }, TAG + 'seed');
  WA.org.setSettings({ enabled: true });
  return WA;
}
/** 势力行。/ 人 / 库存三处读数（守恒判据全靠它们）。 */
function fac(WA, n) {
  return (((WA.store.get().evolution || {}).factions) || []).filter(function (x) { return x.name === (n || '会'); })[0] || null;
}
function per(WA, n) { return WA.store.get().people['p_' + n] || null; }
function stock(WA, who) { return who === '会' ? (fac(WA).resources || {}) : ((per(WA, who) || {}).resources || {}); }
function total(WA, item) {
  let t = 0;
  t += (fac(WA).resources || {})[item] || 0;
  Object.keys(WA.store.get().people).forEach(function (k) { t += ((WA.store.get().people[k].resources) || {})[item] || 0; });
  return t;
}
/** 只读面指纹：势力（资源/名册/项目）+ 人物（资源/债务）+ 世界其他面 + 台账。 */
function shape(WA) {
  const st = WA.store.get();
  const out = [];
  out.push('fac:' + ((st.evolution || {}).factions || []).map(function (f) {
    const projs = (Array.isArray(f.projects) ? f.projects : []).map(function (p) {
      return [p.what, p.status, JSON.stringify(p.needs || []), JSON.stringify(p.covered || {}), p.by, p.due].join('/');
    }).join(';');
    const rs = f.roster && typeof f.roster === 'object' ? f.roster : {};
    const roster = Object.keys(rs).sort().map(function (k) {
      const r = rs[k] || {};
      return [k, r.role, r.contrib, r.owed, r.owedItem, r.fined].join('/');
    }).join(';');
    return [f.name, JSON.stringify(f.resources || {}), 'roster{' + roster + '}', 'projects[' + projs + ']'].join('|');
  }).join('∥'));
  out.push('people:' + Object.keys(st.people || {}).sort().map(function (k) {
    const p = st.people[k] || {};
    const debs = (Array.isArray(p.debts) ? p.debts : []).map(function (d) {
      return [d.to, d.item, d.amount, d.why].join('/');
    }).join(';');
    return [k, p.name, JSON.stringify(p.resources || {}), 'debts[' + debs + ']'].join('|');
  }).join('∥'));
  out.push('bonds:' + JSON.stringify(st.bonds || null));
  out.push('acts:' + JSON.stringify(st.acts || null));
  out.push('shadow:' + JSON.stringify(st.shadow || null));
  out.push('worldFacts:' + JSON.stringify(st.worldFacts || null));
  return out.join('§');
}
function projOf(WA, what) { return (fac(WA).projects || []).filter(function (p) { return p && p.what === what; }).pop() || null; }
function debOf(WA, who, item) {
  return ((per(WA, who) || {}).debts || []).filter(function (d) { return d && d.item === item; })[0] || null;
}

// ── 探针 ──────────────────────────────────────────────────────────────

// P1 立项目与拒收（同名未结项 / 无清单 / 缺持有者）
function pProj(WA) {
  fix(WA);
  const bad = WA.org.openProject('会', { what: '', needs: '粮1' });
  if (bad.ok !== false || bad.reason !== 'bad-name') return 'badname:' + bad.reason;
  const nf = WA.org.openProject('不存在', { what: '修堤', needs: '粮1' });
  if (nf.ok !== false || nf.reason !== 'missing-holder') return 'nofac:' + nf.reason;
  const nn = WA.org.openProject('会', { what: '修堤', needs: '' });
  if (nn.ok !== false || nn.reason !== 'no-needs') return 'noneeds:' + nn.reason;
  const bn = WA.org.openProject('会', { what: '修堤', needs: '乱写没数' });
  if (bn.ok !== false || bn.reason !== 'bad-needs') return 'badneeds:' + bn.reason;
  const o1 = WA.org.openProject('会', { what: '修堤', needs: '粮100、布20', by: '甲', due: 5000 });
  if (!o1.ok || o1.needs.length !== 2) return 'open:' + JSON.stringify(o1);
  // 同义重复：同名且未结项 ⇒ 拒收（并存两个同名项目，交付的这批货进了哪一个就答不出）
  const s = shape(WA);
  const d1 = WA.org.openProject('会', { what: '修堤', needs: '粮1' });
  if (d1.ok !== false || d1.reason !== 'duplicate-project') return 'dup:' + d1.reason;
  if (shape(WA) !== s) return 'dup-mutated';
  // 结项之后同名可以再立（那是新的一件事，不是重复）
  const cl = WA.org.closeProject('会', '修堤');
  if (cl.ok !== false || cl.reason !== 'shortfall') return 'preclose:' + cl.reason;
  const o2 = WA.org.openProject('会', { what: '筑路', needs: '粮1' });
  if (!o2.ok) return 'open2:' + o2.reason;
  const v = WA.org.projectView('会');
  if (!v.ok || v.count !== 2) return 'view:' + JSON.stringify([v.ok, v.count]);
  return OK.proj;
}

// P2 交付守恒 + 只收清单上有的 + 拒收面
function pDeliver(WA) {
  fix(WA);
  WA.org.openProject('会', { what: '修堤', needs: '粮100、布20', by: '甲' });
  WA.org.grant('person', '甲', '粮', 150);
  const t0 = total(WA, '粮');
  const p0 = stock(WA, '甲').粮;
  const f0 = stock(WA, '会').粮 || 0;
  // 交付 120：只该进 100（缺口 20 停在账上），且这 100 只能来自甲——库存在总量上守恒
  const r = WA.org.deliverToProject('会', '修堤', '甲', '粮', 120);
  if (!r.ok || r.took !== 100 || r.offered !== 120 || r.short !== 20) return 'took:' + JSON.stringify(r);
  if (total(WA, '粮') !== t0) return 'not-conserved:' + total(WA, '粮') + '/' + t0;
  if (stock(WA, '甲').粮 !== p0 - 100) return 'from:' + stock(WA, '甲').粮;
  if ((stock(WA, '会').粮 || 0) !== f0 + 100) return 'to:' + stock(WA, '会').粮;
  if (r.complete !== false) return 'complete:' + r.complete;
  // 已覆盖的项再交付 ⇒ 拒收（不重复计数）
  const dup = WA.org.deliverToProject('会', '修堤', '甲', '粮', 5);
  if (dup.ok !== false || dup.reason !== 'already-covered') return 'dup:' + dup.reason;
  // 清单外物资 ⇒ 拒收（进度不可被伪造）
  const s = shape(WA);
  const nn = WA.org.deliverToProject('会', '修堤', '甲', '铁', 5);
  if (nn.ok !== false || nn.reason !== 'not-needed') return 'notneeded:' + nn.reason;
  if (shape(WA) !== s) return 'notneeded-mutated';
  // 清单上但库存不够 ⇒ insufficient，一字未动
  const ins = WA.org.deliverToProject('会', '修堤', '甲', '布', 5);
  if (ins.ok !== false || ins.reason !== 'insufficient') return 'insufficient:' + ins.reason;
  if (shape(WA) !== s) return 'insufficient-mutated';
  // 没有的项目 ⇒ 拒收
  const np = WA.org.deliverToProject('会', '不存在的项目', '甲', '粮', 1);
  if (np.ok !== false || np.reason !== 'no-such-project') return 'noproj:' + np.reason;
  // 补上布，交付后 status 从 planned → ongoing
  WA.org.grant('person', '甲', '布', 20);
  const r2 = WA.org.deliverToProject('会', '修堤', '甲', '布', 20);
  if (!r2.ok || r2.complete !== true) return 'r2:' + JSON.stringify(r2);
  if (r2.status !== 'ongoing') return 'status:' + r2.status;
  return OK.deliver;
}

// P3 结项缺口：状态不动、缺多少报多少
function pShort(WA) {
  fix(WA);
  WA.org.openProject('会', { what: '修堤', needs: '粮100、布20' });
  const s = shape(WA);
  const c0 = WA.org.closeProject('会', '修堤');
  if (c0.ok !== false || c0.reason !== 'shortfall') return 'c0:' + c0.reason;
  if (!c0.missing || c0.missing.length !== 2) return 'c0miss:' + JSON.stringify(c0.missing);
  if (c0.missing[0].gap !== 100 || c0.missing[0].have !== 0) return 'c0gap:' + JSON.stringify(c0.missing[0]);
  if (shape(WA) !== s) return 'c0-mutated';
  // 部分覆盖：缺口照实变小
  WA.org.grant('person', '甲', '粮', 150);
  WA.org.deliverToProject('会', '修堤', '甲', '粮', 60);
  const c1 = WA.org.closeProject('会', '修堤');
  if (c1.ok !== false || c1.reason !== 'shortfall') return 'c1:' + c1.reason;
  const b = c1.missing.filter(function (x) { return x.item === '布'; })[0];
  if (!b || b.gap !== 20) return 'c1b:' + JSON.stringify(c1.missing);
  if (projOf(WA, '修堤').status === 'done') return 'done-too-early';
  // 备齐后结项成功
  WA.org.grant('person', '甲', '粮', 100);
  WA.org.grant('person', '甲', '布', 20);
  WA.org.deliverToProject('会', '修堤', '甲', '粮', 100);
  WA.org.deliverToProject('会', '修堤', '甲', '布', 20);
  const c2 = WA.org.closeProject('会', '修堤');
  if (!c2.ok || c2.status !== 'done') return 'c2:' + JSON.stringify(c2);
  // 已结项：再交付 / 再结项都拒收（历史不重算）
  const d2 = WA.org.deliverToProject('会', '修堤', '甲', '粮', 1);
  if (d2.ok !== false || d2.reason !== 'project-closed') return 'd2:' + d2.reason;
  const c3 = WA.org.closeProject('会', '修堤');
  if (c3.ok !== false || c3.reason !== 'project-closed') return 'c3:' + c3.reason;
  return OK.short;
}

// P4 债务：对象与成因缺一不可、只限在册者、双向读数不抵净额、分批清偿
function pDebts(WA) {
  fix(WA);
  // 不在册者不能欠（「名册」这件事不能被架空）
  const nr = WA.org.oweTo('会', '乙', { item: '粮', amount: 20, why: '借粮' });
  if (nr.ok !== false || nr.reason !== 'not-on-roster') return 'rost:' + nr.reason;
  WA.org.assignRole('会', '甲', 'member');
  WA.org.assignRole('会', '乙', 'member');
  const s = shape(WA);
  const nw = WA.org.oweTo('会', '甲', { item: '粮', amount: 20 });
  if (nw.ok !== false || nw.reason !== 'missing-why') return 'why:' + nw.reason;
  if (shape(WA) !== s) return 'why-mutated';
  const nf = WA.org.oweTo('不存在', '甲', { item: '粮', amount: 20, why: '借粮' });
  if (nf.ok !== false || nf.reason !== 'missing-holder') return 'nofac:' + nf.reason;
  const ok1 = WA.org.oweTo('会', '甲', { item: '粮', amount: 20, why: '借粮' });
  if (!ok1.ok || ok1.added !== 20 || ok1.amount !== 20 || ok1.why !== '借粮') return 'ok1:' + JSON.stringify(ok1);
  // 欠债**不进势力库存**（欠债与持有是两件事，且不能凭空得资源）
  if ((stock(WA, '会').粮 || 0) !== 0) return 'debt-created-stock:' + JSON.stringify(stock(WA, '会'));
  // 同一对象同一物资累加，不同物资各自成条
  WA.org.oweTo('会', '甲', { item: '粮', amount: 5, why: '再借' });
  WA.org.oweTo('会', '甲', { item: '布', amount: 3, why: '赊布' });
  const dList = per(WA, '甲').debts;
  if (dList.length !== 2) return 'debt-count:' + dList.length;
  const dv = WA.org.debtsView('person', '甲');
  if (!dv.ok || dv.payableTotal !== 28 || dv.receivableTotal !== 0) return 'dv:' + JSON.stringify(dv);
  if (dv.payable.filter(function (x) { return x.item === '粮'; })[0].amount !== 25) return 'dv-lia';
  // 双向读数：势力侧应付 = 28（逐条带对象与原因），应收 = 0
  const fv = WA.org.debtsView('faction', '会');
  if (!fv.ok || fv.payableTotal !== 28 || fv.receivableTotal !== 0) return 'fv:' + JSON.stringify(fv);
  if (fv.payable.filter(function (x) { return x.why === ''; }).length) return 'fv-why-missing';
  // 名册欠薪与人对势的债务**方向相反、互不抵消**：造一笔欠薪后两侧读数各归各的
  WA.org.grant('faction', '会', '粮', 0);
  const pv = WA.org.debtsView('person', '甲');
  if (pv.receivableTotal !== 0) return 'cross-contaminated:' + pv.receivableTotal;
  // 分批清偿：只有 12，欠 25 ⇒ 还 12、留 13
  WA.org.grant('person', '甲', '粮', 12);
  const t0 = total(WA, '粮');
  const s1 = WA.org.settleDebt('会', '甲', { item: '粮' });
  if (!s1.ok || s1.paid !== 12 || s1.left !== 13 || s1.settled !== false) return 's1:' + JSON.stringify(s1);
  if (total(WA, '粮') !== t0) return 'settle-not-conserved';
  if (debOf(WA, '甲', '粮').amount !== 13) return 'left:' + JSON.stringify(debOf(WA, '甲', '粮'));
  if (debOf(WA, '甲', '布').amount !== 3) return 'other-touched';
  // 一分钱都没有 ⇒ insufficient，余额一字不动
  const s2 = WA.org.settleDebt('会', '甲', { item: '粮' });
  if (s2.ok !== false || s2.reason !== 'insufficient') return 's2:' + s2.reason;
  if (debOf(WA, '甲', '粮').amount !== 13) return 's2-mutated';
  // 无债可还 ⇒ no-debt（不是静默成功）
  const s3 = WA.org.settleDebt('会', '甲', { item: '铁' });
  if (s3.ok !== false || s3.reason !== 'no-debt') return 's3:' + s3.reason;
  // 还清后条目消失，再还仍答 no-debt
  WA.org.grant('person', '甲', '粮', 13);
  const s4 = WA.org.settleDebt('会', '甲', { item: '粮' });
  if (!s4.ok || s4.settled !== true || s4.left !== 0) return 's4:' + JSON.stringify(s4);
  if (debOf(WA, '甲', '粮')) return 'lingering';
  const s5 = WA.org.settleDebt('会', '甲', { item: '粮' });
  if (s5.ok !== false || s5.reason !== 'no-debt') return 's5:' + s5.reason;
  return OK.debts;
}

// P5 清偿守恒的另一半：势力侧应收/应付读数与转移一致
function pSettle(WA) {
  fix(WA);
  WA.org.assignRole('会', '甲', 'member');
  WA.org.grant('person', '甲', '粮', 40);
  const t0 = total(WA, '粮');
  WA.org.oweTo('会', '甲', { item: '粮', amount: 30, why: '借粮' });
  if (total(WA, '粮') !== t0) return 'owe-created';
  const f0 = stock(WA, '会').粮 || 0;
  const r = WA.org.settleDebt('会', '甲', { item: '粮' });
  if (!r.ok || r.paid !== 30 || r.settled !== true) return 'r:' + JSON.stringify(r);
  if (total(WA, '粮') !== t0) return 'not-conserved:' + total(WA, '粮') + '/' + t0;
  if ((stock(WA, '会').粮 || 0) !== f0 + 30) return 'to-faction:' + stock(WA, '会').粮;
  if (stock(WA, '甲').粮 !== 10) return 'from-person:' + stock(WA, '甲').粮;
  const fv = WA.org.debtsView('faction', '会');
  if (fv.payableTotal !== 0) return 'fv:' + fv.payableTotal;
  return OK.settle;
}

// P6 叙事档与精确档（本锁的重心：未记数量时保持未知）
function pNarr(WA) {
  fix(WA);
  // 两档同账不同词：同一条需求串里可以既有刻数也有档位词，落盘后两档都还在
  WA.org.openProject('会', { what: '修堤', needs: '粮100、布 紧张' });
  const p = projOf(WA, '修堤');
  if (!p) return 'no-project';
  if (!Array.isArray(p.needs) || p.needs.length !== 2) return 'needs:' + JSON.stringify(p.needs);
  if (p.needs[0].need !== 100 || p.needs[1].need !== null || p.needs[1].tier !== 'tight') {
    return 'parse:' + JSON.stringify(p.needs);
  }
  // 档位词表外的词不猜、当解析失败拒收
  const bad = WA.org.openProject('会', { what: 'X', needs: '布 有点紧' });
  if (bad.ok !== false || bad.reason !== 'bad-needs') return 'bad-tier:' + bad.reason;
  // 档位由**项目自身记了多少**决定：精确档
  const v = WA.org.projectView('会');
  if (!v.ok) return 'v:' + v.reason;
  const row = v.projects[0];
  if (row.tier !== 'precise') return 'precise-tier:' + row.tier;
  // 交付叙事档项：**没有「收满」这回事**——不知道要多少就没有「够了」，照实全收
  WA.org.grant('person', '甲', '布', 8);
  const d1 = WA.org.deliverToProject('会', '修堤', '甲', '布', 5);
  if (!d1.ok || d1.took !== 5) return 'narr-deliver:' + JSON.stringify(d1);
  const d2 = WA.org.deliverToProject('会', '修堤', '甲', '布', 3);
  if (!d2.ok || d2.took !== 3) return 'narr-deliver2:' + JSON.stringify(d2);
  // **未记录数量的项不进缺口**（不知道要多少，就不能说还缺多少）
  const covB = WA.org.projectView('会').projects[0].covered.filter(function (x) { return x.item === '布'; })[0];
  if (!covB || covB.gap !== null || covB.need !== null) return 'narr-gap:' + JSON.stringify(covB);
  if (covB.tierWord !== '紧张') return 'narr-word:' + covB.tierWord;
  // **不能算满足**：只记了词没记刻数的项不得被当成备齐 ⇒ done 决议拿不到依据
  const cl = WA.org.closeProject('会', '修堤');
  if (cl.ok !== false || cl.reason !== 'shortfall') return 'narr-close:' + cl.reason;
  if (!cl.unrecorded || !cl.unrecorded.length) return 'narr-unrecorded:' + JSON.stringify(cl.unrecorded);
  if (cl.unrecorded[0].item !== '布' || cl.unrecorded[0].why !== 'unrecorded-need') return 'narr-why:' + JSON.stringify(cl.unrecorded);
  if (cl.missing.filter(function (x) { return x.item === '布'; }).length) return 'narr-as-gap';
  // canClose / live 与实际一致：还有未记数量的项 ⇒ 不算可结项（但仍是未结项）
  const row2 = WA.org.projectView('会').projects[0];
  if (row2.canClose !== false) return 'canClose:' + row2.canClose;
  if (row2.live !== true) return 'live:' + row2.live;
  // 纯叙事档的项目：档位报 narrative，且**未知档不给词**（不印 null）
  WA.org.openProject('会', { what: '赈济', needs: '粮 充足' });
  const v2 = WA.org.projectView('会');
  const r2 = v2.projects.filter(function (x) { return x.what === '赈济'; })[0];
  if (r2.tier !== 'narrative') return 'narrative-tier:' + r2.tier;
  if (r2.tierWords.join(',') !== '粮 充足') return 'tierWords:' + JSON.stringify(r2.tierWords);
  // 「不给词」不是「印 null」：未知档与精确档的词是**空串**，拼进文本什么也不出现。
  //   （不查整个 JSON——那样会把 `"need":null` 这个**合法**的两档区分标记也算成泄漏。）
  if (r2.tierWords.join(',').indexOf('null') >= 0) return 'tierWords-null';
  if (v2.projects.some(function (x) {
    return x.covered.some(function (y) { return y.tierWord === null || y.tierWord === undefined || String(y.tierWord) === 'null'; });
  })) return 'cover-null-word';
  if (typeof v2.tierReason !== 'string' || !v2.tierReason) return 'no-tierReason';
  // 注入面：两档分述——记了刻数的给「已备/需备」，只记词的给档位词并注明不计缺口
  const blk = String(WA.org.buildBlock());
  if (blk.indexOf('共同项目：') < 0) return 'block-no-project';
  if (blk.indexOf('粮 0/100') < 0) return 'block-no-spec:' + blk;
  if (blk.indexOf('布 紧张') < 0) return 'block-no-narr:' + blk;
  if (blk.indexOf('未记数量，不计缺口') < 0) return 'block-no-note:' + blk;
  if (blk.indexOf('null') >= 0) return 'block-null';
  return OK.narr;
}

// P7 只读面零写副作用
function pRead(WA) {
  fix(WA);
  WA.org.openProject('会', { what: '修堤', needs: '粮100、布 紧张' });
  WA.org.assignRole('会', '甲', 'member');
  WA.org.oweTo('会', '甲', { item: '粮', amount: 5, why: '借粮' });
  const s = shape(WA);
  const miss = WA.org.closeProject('会', '修堤');
  if (miss.ok !== false) return 'close:' + JSON.stringify(miss);
  if (WA.org.projectView('会').ok !== true) return 'pv';
  if (WA.org.projectView('无').ok !== false) return 'pv-bad';
  if (WA.org.debtsView('person', '甲').ok !== true) return 'dv';
  if (WA.org.debtsView('faction', '会').ok !== true) return 'fv';
  if (WA.org.debtsView('person', '不存在的人').ok !== false) return 'dv-bad';
  if (WA.org.debtsView('怪类型', '甲').reason !== 'bad-kind') return 'dv-kind';
  if (WA.org.debtsView('person', '').reason !== 'bad-name') return 'dv-name';
  WA.org.ledgerView();
  WA.org.exportJournal();
  WA.org.buildBlock();
  if (shape(WA) !== s) return 'mutated';
  return OK.read;
}

// P8 既有面不受影响（本版零新顶层容器、零新写通道）
function pLegacy(WA) {
  fix(WA);
  // 既有容器仍在，且本项目**没有**新增顶层容器
  const sd = WA.evict.siteDecls ? WA.evict.siteDecls() : {};
  const own = Object.keys(sd).filter(function (k) { return k.indexOf('org.') === 0; }).sort();
  if (own.join(',') !== 'org.debts,org.projects') return 'sites:' + own.join('/');
  if (sd['org.projects'].cap !== 'per-call' || sd['org.debts'].cap !== 'per-call') return 'cap:' + JSON.stringify([sd['org.projects'].cap, sd['org.debts'].cap]);
  // **表外状态不当成未结项**：一个拼错的 status（如 completed）不许让项目永远关不掉、
  //   也不许让它继续占着注入预算与「未结项」计数。
  WA.org.openProject('会', { what: '坏状态', needs: '粮1' });
  WA.store.transact(function (d) {
    const f = ((d.evolution || {}).factions || []).filter(function (x) { return x.name === '会'; })[0];
    const p = (f.projects || []).filter(function (x) { return x.what === '坏状态'; })[0];
    if (p) p.status = 'completed';
  }, TAG + 'bogus');
  const bv = WA.org.projectView('会').projects.filter(function (x) { return x.what === '坏状态'; })[0];
  if (!bv || bv.live !== false) return 'bogus-live:' + JSON.stringify(bv && bv.live);
  if (String(WA.org.buildBlock()).indexOf('坏状态') >= 0) return 'bogus-injected';
  // 项目环按 cap 挤出（1 + 10 个项目只留 6 个 ⇒ 挤 5 次）
  for (let i = 0; i < 10; i++) WA.org.openProject('会', { what: 'p' + i, needs: '粮1' });
  if ((fac(WA).projects || []).length !== 6) return 'proj-cap:' + (fac(WA).projects || []).length;
  const ev = WA.evict.evictStat().bySite['org.projects'];
  if (!ev || ev.evicts !== 5 || ev.dropped !== 5) return 'evict:' + JSON.stringify(ev);
  // 债务环按 cap 挤出（14 条不同物资只留 12 条）
  WA.org.assignRole('会', '甲', 'member');
  for (let i = 0; i < 14; i++) WA.org.oweTo('会', '甲', { item: 'r' + i, amount: 1, why: 'why' + i });
  if ((per(WA, '甲').debts || []).length !== 12) return 'debt-cap:' + (per(WA, '甲').debts || []).length;
  const ev2 = WA.evict.evictStat().bySite['org.debts'];
  if (!ev2 || ev2.evicts !== 2 || ev2.dropped !== 2) return 'evict2:' + JSON.stringify(ev2);
  // 既有出口一个不少
  ['grant', 'transfer', 'canAfford', 'stockOf', 'buildBlock', 'ledgerView', 'reconcile',
    'exportJournal', 'reconcileWith', 'assignRole', 'creditWork', 'promote', 'rosterView',
    'payroll', 'settleOwed', 'penalize'].forEach(function (k) {
    if (typeof WA.org[k] !== 'function') throw new Error('legacy-missing:' + k);
  });
  // 既有台账语义不受新面影响：发薪走 transfer、库存不足记欠薪而不是静默减半
  WA.org.grant('faction', '会', '粮', 5);
  const pr = WA.org.payroll('会', { item: '粮' });
  if (!pr.ok || pr.paid !== 5 || pr.owedTotal !== 0) return 'payroll:' + JSON.stringify(pr);
  return OK.legacy;
}

// P9 验收样本：钱不够付薪 ⇒ 明确分配规则下的支付 + 欠账（不是静默减半）
function pAlloc(WA) {
  fix(WA);
  // 一桩项目在先：组织的钱要同时供项目与薪俸，而它只够其中一部分——
  //   「钱不够时给出可玩的选择」的读数面即由此产生。
  WA.org.openProject('会', { what: '修堤', needs: '粮100', by: '甲', due: 5000 });
  WA.org.assignRole('会', '甲', 'member');    // 管事 pay 5
  WA.org.assignRole('会', '乙', 'steward');   // 主事 pay 12
  WA.org.assignRole('会', '丙', 'chief');     // 当家 pay 30
  WA.org.grant('faction', '会', '粮', 60);    // 名册整期应付 = 47
  const t0 = total(WA, '粮');
  const r = WA.org.payroll('会', { item: '粮' });
  if (!r.ok) return 'payroll:' + r.reason;
  // 分配规则显式：职阶**从低到高**发（管事 → 主事 → 当家），不按名字字典序
  if (r.paid !== 47) return 'paid:' + r.paid;
  if (r.owedTotal !== 0) return 'unexpected-owed:' + r.owedTotal;
  if (r.settled !== true || r.reason !== '') return 'settled:' + JSON.stringify([r.settled, r.reason]);
  if (total(WA, '粮') !== t0) return 'not-conserved:' + total(WA, '粮') + '/' + t0;
  if ((stock(WA, '甲').粮 || 0) !== 5 || (stock(WA, '乙').粮 || 0) !== 12 || (stock(WA, '丙').粮 || 0) !== 30) return 'who:' + JSON.stringify([stock(WA, '甲'), stock(WA, '乙'), stock(WA, '丙')]);
  if ((stock(WA, '会').粮 || 0) !== 13) return 'left:' + stock(WA, '会').粮;
  return OK.alloc;
}

// P10 钱不够时：支付 + 欠账（照实记欠，不静默减半、不重复扣款）
function pRecycle(WA) {
  fix(WA);
  WA.org.assignRole('会', '甲', 'member');   // pay 5
  WA.org.assignRole('会', '乙', 'steward');  // pay 12
  WA.org.assignRole('会', '丙', 'chief');    // pay 30
  WA.org.grant('faction', '会', '粮', 20);   // 只够前两位（5 + 12 = 17）
  const t0 = total(WA, '粮');
  const r1 = WA.org.payroll('会', { item: '粮' });
  if (!r1.ok) return 'r1:' + r1.reason;
  // 明确规则（从低到高）下的支付与欠账：付 17、欠 30
  if (r1.paid !== 17) return 'paid:' + r1.paid;
  if (r1.owedTotal !== 30) return 'owed:' + r1.owedTotal;
  if (r1.settled !== false || r1.reason !== 'partial') return 'settled:' + JSON.stringify([r1.settled, r1.reason]);
  // **不静默减半**：发得出 5 就发 5，不是发 2（那会让「发过」与「没发」长得一样）
  if ((stock(WA, '甲').粮 || 0) !== 5 || (stock(WA, '乙').粮 || 0) !== 12) return 'halved:' + JSON.stringify([stock(WA, '甲'), stock(WA, '乙')]);
  if ((fac(WA).resources || {}).粮 !== 3) return 'left:' + (fac(WA).resources || {}).粮;
  if (fac(WA).roster['丙'].owed !== 30) return 'roster-owed:' + fac(WA).roster['丙'].owed;
  if (fac(WA).roster['丙'].owedItem !== '粮') return 'owedItem:' + fac(WA).roster['丙'].owedItem;
  if (total(WA, '粮') !== t0) return 'not-conserved:' + total(WA, '粮') + '/' + t0;
  if (stock(WA, '丙').粮) return 'paid-unpaid:' + stock(WA, '丙').粮;
  // 第二期：库存不够再发一份 ⇒ 一位都不该再被扣（不发生重复扣款）
  const r2 = WA.org.payroll('会', { item: '粮' });
  if (!r2.ok) return 'r2ok:' + r2.reason;
  if (r2.paid !== 0) return 'double:' + r2.paid;
  if (total(WA, '粮') !== t0) return 'recycle-not-conserved:' + total(WA, '粮') + '/' + t0;
  // 欠薪可续期累加，但**只在真的又欠一期时**累加（每期一份，不重不漏）
  if (r2.owedTotal !== 47) return 'owed2:' + r2.owedTotal;
  if (fac(WA).roster['丙'].owed !== 60) return 'owed-acc:' + fac(WA).roster['丙'].owed;
  if ((fac(WA).resources || {}).粮 !== 3) return 'negative:' + (fac(WA).resources || {}).粮;
  return OK.recyc;
}

// ── 正向判据 ──────────────────────────────────────────────────────────
function judge(a) {
  const WA = fresh();
  ['openProject', 'deliverToProject', 'projectView', 'closeProject', 'oweTo', 'settleDebt', 'debtsView'].forEach(function (k) {
    a(typeof WA.org[k] === 'function', 'v2117/b5: [1] 出口面含 ' + k);
  });
  a(WA.org.TIERS.join(',') === 'precise,narrative,unknown', 'v2117/b5: [2] 档位表三档就位（精确 / 叙事 / 未知）');
  a(['grant', 'transfer', 'canAfford', 'stockOf', 'ledgerView', 'reconcile', 'exportJournal',
    'reconcileWith', 'assignRole', 'creditWork', 'promote', 'rosterView', 'payroll',
    'settleOwed', 'penalize', 'buildBlock', 'getSettings', 'setSettings', 'stat'].every(function (k) {
    return typeof WA.org[k] === 'function';
  }), 'v2117/b5: [3] 既有出口一个不少');
  {
    const sd = WA.evict.siteDecls ? WA.evict.siteDecls() : {};
    const own = Object.keys(sd).filter(function (k) { return k.indexOf('org.') === 0; }).sort();
    a(own.join(',') === 'org.debts,org.projects',
      'v2117/b5: [4] 新增两站按通配路径登记、无第三个 org 站（实 ' + own.join('/') + '）');
    a(sd['org.projects'] && sd['org.projects'].path === 'evolution.factions.*.projects',
      'v2117/b5: [4] 项目站路径为势力行内挂（evolution.factions.*.projects）');
    a(sd['org.debts'] && sd['org.debts'].path === 'people.*.debts',
      'v2117/b5: [4] 债务站路径为人物行内挂（people.*.debts）');
  }
  a(probeClean(pProj) === OK.proj, 'v2117/b5: [5] 立项目受闸（同名未结项 / 无清单 / 缺持有者各自如实）:: ' + probeClean(pProj));
  a(probeClean(pDeliver) === OK.deliver, 'v2117/b5: [6] 交付守恒 + 只收清单上有的 + 三种拒收面都留痕:: ' + probeClean(pDeliver));
  a(probeClean(pShort) === OK.short, 'v2117/b5: [7] 缺口照实算、状态不动（不把差一点写成完成）:: ' + probeClean(pShort));
  a(probeClean(pDebts) === OK.debts, 'v2117/b5: [8] 债务必须对象+成因+在册，双向读数不抵净额，分批清偿:: ' + probeClean(pDebts));
  a(probeClean(pSettle) === OK.settle, 'v2117/b5: [9] 清偿走同一支笔（人 → 势力），守恒且余额归零:: ' + probeClean(pSettle));
  a(probeClean(pNarr) === OK.narr, 'v2117/b5: [10] 两档：未记数量时保持未知（不进缺口 / 不给词 / 不能算满足）:: ' + probeClean(pNarr));
  a(probeClean(pRead) === OK.read, 'v2117/b5: [11] 只读面零写副作用:: ' + probeClean(pRead));
  a(probeClean(pLegacy) === OK.legacy, 'v2117/b5: [12] 既有面不受影响（零新顶层容器、零新写通道）:: ' + probeClean(pLegacy));
  a(probeClean(pAlloc) === OK.alloc, 'v2117/b5: [13] 验收样本：60 单位付 100 单位薪 ⇒ 明确规则下支付并欠账:: ' + probeClean(pAlloc));
  a(probeClean(pRecycle) === OK.recyc, 'v2117/b5: [14] 重复触发工资周期不重复扣款、不静默减半:: ' + probeClean(pRecycle));

  // 相同物资、不同项目 ⇒ 进度各有各的账（交付不能串项目）
  {
    const w = fresh(); fix(w);
    w.org.openProject('会', { what: '甲工', needs: '粮10' });
    w.org.openProject('会', { what: '乙工', needs: '粮10' });
    w.org.grant('person', '甲', '粮', 20);
    w.org.deliverToProject('会', '甲工', '甲', '粮', 10);
    const v = w.org.projectView('会');
    const a1 = v.projects.filter(function (x) { return x.what === '甲工'; })[0];
    const b1 = v.projects.filter(function (x) { return x.what === '乙工'; })[0];
    a(a1.missing.length === 0 && a1.canClose === true && b1.missing.length === 1 && b1.canClose === false,
      'v2117/b5: [15] 同一物资分属两个项目时进度不串（各记各的账）');
  }
  // 叙事档与精确档**不互换**：档位由项目自身记了多少决定，不看外部气候读数
  {
    const w = fresh(); fix(w);
    w.org.openProject('会', { what: '修堤', needs: '粮100' });
    const before = w.org.projectView('会').projects[0].tier;
    // 外部气候改成富得流油/穷得叮当，均不改项目档位（那是外部的陈述，不是项目的记录）
    w.store.transact(function (d) { d.evolution.economy = { climate: '繁荣', signals: [] }; }, TAG + 'e1');
    const mid = w.org.projectView('会').projects[0].tier;
    w.store.transact(function (d) { d.evolution.economy = { climate: '动荡', signals: [] }; }, TAG + 'e2');
    const after = w.org.projectView('会').projects[0].tier;
    a(before === 'precise' && mid === 'precise' && after === 'precise',
      'v2117/b5: [16] 档位不随外部气候漂移（两档不被互换，实 ' + [before, mid, after].join('/') + '）');
  }
  // 哨兵：夹具不许漏进 localStorage
  {
    let leak = 0;
    for (let i = 0; i < global.localStorage.length; i++) {
      const k = global.localStorage.key(i);
      if (k && String(global.localStorage.getItem(k)).indexOf(TAG) >= 0) leak++;
    }
    a(leak === 0, 'v2117/b5: [17] 哨兵未泄漏（' + leak + '）');
  }
}

// ── 负向自证 ──────────────────────────────────────────────────────────
const N1 = [
  { k: 'dup',    p: pProj,    okk: OK.proj,    note: '同名未结项不再拦 ⇒ 交付的货进了哪一个答不出' },
  { k: 'list',   p: pDeliver, okk: OK.deliver, note: '清单外物资也照收 ⇒ 进度可被伪造' },
  { k: 'short',  p: pShort,   okk: OK.short,   note: '有缺口也照结项 ⇒ 差一点被写成完成' },
  { k: 'unrec',  p: pNarr,    okk: OK.narr,    note: '未记数量的项被算成满足 ⇒ 未知被当成够了' },
  { k: 'why',    p: pDebts,   okk: OK.debts,   note: '没有原因也照记 ⇒ 欠账日后无人答得出成因' },
  { k: 'rost',   p: pDebts,   okk: OK.debts,   note: '不在册者也能欠 ⇒ 名册被架空' },
  { k: 'tierd',  p: pNarr,    okk: OK.narr,    note: '有刻数也认成叙事档 ⇒ 两档互换' },
  { k: 'tiern',  p: pNarr,    okk: OK.narr,    note: '只记了词也认成精确档 ⇒ 区间被当成可对账数量' },
  { k: 'cov',    p: pNarr,    okk: OK.narr,    note: '叙事档项被当成收满了 ⇒ 不知道要多少就没收过' },
  { k: 'view',   p: pNarr,    okk: OK.narr,    note: '档位读数恒为精确档 ⇒ 叙事档在读数里不存在' },
  { k: 'owe',    p: pDebts,   okk: OK.debts,   note: '欠债记进势力库存 ⇒ 欠债与持有混成一件事' },
  { k: 'live',   p: pLegacy,  okk: OK.legacy,  note: '表外状态也算未结项 ⇒ 拼错的 status 让项目永远关不掉' }
];
const N3 = [
  ['dup', pDeliver, OK.deliver, '项目去重破坏不影响交付守恒'],
  ['list', pProj, OK.proj, '清单校验破坏不影响立项闸'],
  ['short', pSettle, OK.settle, '缺口闸破坏不影响清偿守恒'],
  ['unrec', pDeliver, OK.deliver, '未记数量判据破坏不影响精确档交付'],
  ['why', pSettle, OK.settle, '成因闸破坏不影响清偿'],
  ['rost', pProj, OK.proj, '在册校验破坏不影响立项'],
  ['tierd', pDeliver, OK.deliver, '档位判据破坏不影响交付'],
  ['cov', pDeliver, OK.deliver, '收满判据破坏不影响精确档交付'],
  ['view', pRead, OK.read, '读数破坏不影响只读面'],
  ['live', pRead, OK.read, '存活判据破坏不影响只读面']
];
function runNegative(a) {
  BROKEN.forEach(function (s) { a(anchorHits(s) === 1, 'v2117/b5: [N0] 锚点在真源码中恰 1 次 :: ' + s.key); });
  a(BROKEN.length === 12 && new Set(BROKEN.map(function (x) { return x.key; })).size === 12,
    'v2117/b5: [N0] 破坏面覆盖 12 个互异锚点');
  N1.forEach(function (it) {
    a(probeWith(BROKEN[B[it.k]], it.p) !== it.okk, 'v2117/b5: [N1] ' + it.note + '（缺口复现）');
  });
  const OKPROBE = { proj: pProj, deliver: pDeliver, short: pShort, debts: pDebts, settle: pSettle,
    narr: pNarr, read: pRead, legacy: pLegacy, alloc: pAlloc, recyc: pRecycle };
  Object.keys(OK).forEach(function (k) {
    a(probeClean(OKPROBE[k]) === OK[k], 'v2117/b5: [N2] 原版成立 :: ' + k);
  });
  N3.forEach(function (t) {
    a(probeWith(BROKEN[B[t[0]]], t[1]) === t[2], 'v2117/b5: [N3] ' + t[3]);
  });
  a(probeWith(BROKEN[B.list], pSettle) === OK.settle, 'v2117/b5: [N4] 对照：清单校验破坏后清偿守恒仍成立');
  const chg = (function () {
    const w = fresh(); fix(w);
    const b = w.org.projectView('会').count;
    w.org.openProject('会', { what: '修堤', needs: '粮1' });
    return b + '>' + w.org.projectView('会').count;
  })();
  a(chg === '0>1', 'v2117/b5: [N4] 立项真的改变状态（判据非恒真，实 ' + chg + '）');
}
function runAll(a) { judge(a); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('B5-ORG-V2117: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('B5-ORG-V2117: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits };

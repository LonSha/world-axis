#!/usr/bin/env node
// WorldAxis tests/inst-v2119.js -- 拓展计划 ④ 专锁：组织制度、任职权限与权力交接（v2.119.0）
//
// 逐条守住：
//   ① 权限必须落在具名权限表内（自造权限等于自造权力）；
//   ② 无职不任（职位不存在不得直接挂人）；
//   ③ 一职一人，换人必须显式；
//   ④ 离任必须写明在表内的理由；
//   ⑤ 交接必须写明在途与旧承诺（不写明就拒收，不默认归零）；
//   ⑥ 没人能批的决策不许挂起；
//   ⑦ 批准者本人必须持有 approve；已决不得再决；
//   ⑧ 违约必须有罚则、结案必须有据；总开关关闭时零台账。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__inst2119_';
const REL = 'engines/inst.js';
// ── 破坏锚点（逐字取自真源码，各恰 1 次）──
const A_PERMS  = "    if (bad.length) { noteFault('bad-perms'); return { ok: false, reason: 'bad-perms', bad: bad, allowed: PERMS.slice() }; }";
const A_KNOWN  = "    if (!p0) { noteFault('unknown-post'); return { ok: false, reason: 'unknown-post', title: t, known: (org.posts || []).map(function (x) { return x.title; }) }; }";
const A_OCCUP  = "    if (p0.holder && clean(p0.holder, 40) !== who && !o.replace) {";
const A_WHY    = "    if (REASONS.indexOf(why) < 0) { noteFault('bad-reason'); return { ok: false, reason: 'bad-reason', allowed: REASONS.slice() }; }";
const A_HANDOV = "      noteFault('missing-handover');\n      return { ok: false, reason: 'missing-handover', hint: '交接必须写明在途项目数与旧承诺数，不许默认归零' };";
const A_NOAUTH = "    if (!hs.length) {";
const A_AUTH   = "    if (holdersOf(org, 'approve').indexOf(who) < 0) {";
const A_DECID  = "    if (TERMINAL.indexOf(p0.status) >= 0) { noteFault('already-decided'); return { ok: false, reason: 'already-decided', status: p0.status }; }";
const A_PEN    = "    if (!penalty) { noteFault('missing-penalty'); return { ok: false, reason: 'missing-penalty', hint: '罚则必须写明，本模块不自行判罚' };";
const A_EVID   = "    if (!ev) { noteFault('missing-evidence'); return { ok: false, reason: 'missing-evidence', hint: '结案必须有据' }; }";
const A_OFF    = "    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }\n    const o = opts || {};\n    const oid = clean(id, 60), kind = clean(o.kind, 20);";
const BROKEN = [
  { rel: REL, key: 'perms',  from: A_PERMS,  to: "    if (false) { noteFault('bad-perms'); return { ok: false, reason: 'bad-perms' }; }" },
  { rel: REL, key: 'known',  from: A_KNOWN,  to: "    if (false) { noteFault('unknown-post'); return { ok: false, reason: 'unknown-post', title: t }; }" },
  { rel: REL, key: 'occup',  from: A_OCCUP,  to: "    if (false) {" },
  { rel: REL, key: 'why',    from: A_WHY,    to: "    if (false) { noteFault('bad-reason'); return { ok: false, reason: 'bad-reason' }; }" },
  { rel: REL, key: 'handov', from: A_HANDOV, to: "      noteFault('x');" },
  { rel: REL, key: 'noauth', from: A_NOAUTH, to: "    if (false) {" },
  { rel: REL, key: 'auth',   from: A_AUTH,   to: "    if (false) {" },
  { rel: REL, key: 'pen',    from: A_PEN,    to: "    if (false) { noteFault('missing-penalty'); return { ok: false, reason: 'missing-penalty' };" },
  { rel: REL, key: 'evid',   from: A_EVID,   to: "    if (false) { noteFault('missing-evidence'); return { ok: false, reason: 'missing-evidence' }; }" },
  { rel: REL, key: 'off',    from: A_OFF,    to: "    if (false) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }\n    const o = opts || {};\n    const oid = clean(id, 60), kind = clean(o.kind, 20);" }
];
const B = {};
BROKEN.forEach(function (s, i) { B[s.key] = i; });
function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function readSrc(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function anchorHits(spec) { return readSrc(spec.rel).split(spec.from).length - 1; }
function brokenOverride(spec) {
  const src = readSrc(spec.rel);
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('anchor hits ' + hits + ' :: ' + spec.key);
  const ov = {};
  ov[spec.rel] = src.split(spec.from).join(spec.to);
  return ov;
}
function mkW(ov) { return reset(fresh(ov ? { srcOverride: ov } : {})); }
function probeWith(spec, fn) {
  let out;
  try { out = fn({ ov: brokenOverride(spec) }); } catch (e) { out = 'threw:' + (e && e.message); }
  return out;
}
function probeClean(fn) {
  let out;
  try { out = fn({ ov: null }); } catch (e) { out = 'threw:' + (e && e.message); }
  return out;
}
function reset(WA) {
  WA.inst.setSettings({ enabled: false, maxOrgs: 4, maxPending: 6, maxBreaches: 6 });
  WA.store.transact(function (d) { d.inst = { orgs: [] }; }, TAG + 'reset');
  WA.inst.setSettings({ enabled: true, maxOrgs: 4, maxPending: 6, maxBreaches: 6 });
  return WA;
}
function seeded(WA) {
  WA.inst.charter('星河', { kind: '公司', name: '星河' });
  WA.inst.post('星河', '董事长', { perms: ['approve', 'grant'] });
  WA.inst.assign('星河', '董事长', '甲');
  return WA;
}

const PROBES = {
  pGate: function (env) {
    const WA = mkW(env.ov);
    const a = WA.inst.charter('星河', { kind: '门派' });
    const b = WA.inst.charter('星河', { kind: '公司' });
    const c = WA.inst.charter('星河', { kind: '公司' });
    const d = WA.inst.charter('星河', { kind: '帮派' });
    const e = WA.inst.charter('星河', { kind: '帮派', replace: true });
    const n = WA.inst.statView().orgs;
    // kind 是具名表；重复建档必须显式 replace（kind 变更也走同一闸门）。
    return (a.reason === 'bad-kind' && b.ok === true && c.reason === 'exists'
      && d.reason === 'exists' && e.ok === true && n === 1) ? 'charter-gated'
      : 'x:' + [a.reason, b.ok, c.reason, d.reason, e.ok, n].join(',');
  },
  pPerms: function (env) {
    const WA = mkW(env.ov);
    WA.inst.charter('星河', { kind: '公司' });
    const a = WA.inst.post('星河', '董事长', { perms: ['approve', 'kingmaker'] });
    const b = WA.inst.post('星河', '董事长', { perms: ['approve', 'grant'] });
    const v = WA.inst.view('星河');
    // 自造权限等于自造权力：一律拒收，且不落半条职位。
    return (a.reason === 'bad-perms' && a.bad.length === 1 && a.bad[0] === 'kingmaker'
      && b.ok === true && v.posts.length === 1 && v.posts[0].perms.join('/') === 'approve/grant')
      ? 'perms-named' : 'x:' + JSON.stringify([a.reason, a.bad, b.ok, v.posts.length]);
  },
  pUnknown: function (env) {
    const WA = mkW(env.ov);
    WA.inst.charter('星河', { kind: '公司' });
    const a = WA.inst.assign('星河', '财务', '甲');
    const v = WA.inst.view('星河');
    // 无职不任：职位不存在时不得把人挂上去（否则「谁在任」永远答不出）。
    return (a.reason === 'unknown-post' && v.posts.length === 0) ? 'post-first'
      : 'x:' + [a.reason, v.posts.length].join(',');
  },
  pOccupied: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    const a = WA.inst.assign('星河', '董事长', '乙');
    const v1 = WA.inst.view('星河');
    const b = WA.inst.assign('星河', '董事长', '乙', { replace: true });
    const v2 = WA.inst.view('星河');
    // 一职一人：换人必须显式；不显式时在位者不动。
    return (a.reason === 'occupied' && a.holder === '甲' && v1.posts[0].holder === '甲'
      && b.ok === true && b.replaced === true && v2.posts[0].holder === '乙') ? 'one-seat'
      : 'x:' + JSON.stringify([a.reason, a.holder, v1.posts[0].holder, b.ok, v2.posts[0].holder]);
  },
  pReason: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    const a = WA.inst.vacate('星河', '董事长', {});
    const b = WA.inst.vacate('星河', '董事长', { why: '跑了' });
    const v1 = WA.inst.view('星河');
    const c = WA.inst.vacate('星河', '董事长', { why: 'succeeded' });
    const v2 = WA.inst.view('星河');
    // 离任必须有在表内的理由；拒收时在位者不动。
    return (a.reason === 'bad-reason' && b.reason === 'bad-reason' && v1.posts[0].holder === '甲'
      && c.ok === true && c.from === '甲' && v2.posts[0].holder === '') ? 'reason-required'
      : 'x:' + JSON.stringify([a.reason, b.reason, v1.posts[0].holder, c.ok, v2.posts[0].holder]);
  },
  pHandover: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    const a = WA.inst.succession('星河', '甲', '乙', {});
    const b = WA.inst.succession('星河', '甲', '乙', { openProjects: 3 });
    const c = WA.inst.succession('星河', '甲', '乙', { oldOaths: 2 });
    const v1 = WA.inst.view('星河');
    const d = WA.inst.succession('星河', '甲', '乙', { openProjects: 3, oldOaths: 2 });
    const v2 = WA.inst.view('星河');
    // 交接受检：在途与旧承诺缺一不可（不写明就拒收，而不是默认归零）。
    return (a.reason === 'missing-handover' && b.reason === 'missing-handover'
      && c.reason === 'missing-handover' && v1.successions === 0
      && d.ok === true && d.keep === true && v2.successions === 1) ? 'handover-checked'
      : 'x:' + JSON.stringify([a.reason, b.reason, c.reason, v1.successions, d.ok, v2.successions]);
  },
  pNoAuth: function (env) {
    const WA = mkW(env.ov);
    WA.inst.charter('星河', { kind: '公司' });
    WA.inst.post('星河', '监事', { perms: ['grant'] });
    WA.inst.assign('星河', '监事', '甲');
    const a = WA.inst.propose('星河', '裁员', { by: '甲', needs: 'hire' });
    const v1 = WA.inst.view('星河');
    const b = WA.inst.propose('星河', '要人', { by: '甲', needs: 'grant' });
    const v2 = WA.inst.view('星河');
    // 没人能批的决策不许挂起（挂起等于永远办不了）。
    return (a.reason === 'no-authority' && v1.open === 0 && b.ok === true && v2.open === 1)
      ? 'no-dangling-decision' : 'x:' + [a.reason, v1.open, b.ok, v2.open].join(',');
  },
  pAuthz: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    WA.inst.post('星河', '监事', { perms: ['grant'] });
    WA.inst.assign('星河', '监事', '丙');
    const dec = WA.inst.propose('星河', '收购码头', { by: '丙' });
    const a = WA.inst.decide('星河', dec.id, 'approved', { by: '丙' });
    const v1 = WA.inst.view('星河');
    const b = WA.inst.decide('星河', dec.id, 'approved', { by: '甲' });
    const c = WA.inst.decide('星河', dec.id, 'approved', { by: '甲' });
    const v2 = WA.inst.view('星河');
    // 批准者本人必须持有 approve；已决不得再决。
    return (a.reason === 'not-authorized' && v1.open === 1 && b.ok === true
      && c.reason === 'already-decided' && v2.open === 0) ? 'approve-authorized'
      : 'x:' + JSON.stringify([a.reason, v1.open, b.ok, c.reason, v2.open]);
  },
  pBreach: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    const a = WA.inst.breach('星河', '甲', '私自转卖', {});
    const v1 = WA.inst.view('星河');
    const b = WA.inst.breach('星河', '甲', '私自转卖', { penalty: '罚没三成' });
    const c = WA.inst.settle('星河', b.id, {});
    const v2 = WA.inst.view('星河');
    const d = WA.inst.settle('星河', b.id, { evidence: '有转账记录' });
    const v3 = WA.inst.view('星河');
    // 违约必须有罚则、结案必须有据；未结项一直可见。
    return (a.reason === 'missing-penalty' && v1.breaches === 0 && b.ok === true
      && c.reason === 'missing-evidence' && v2.breaches === 1
      && d.ok === true && v3.breaches === 0) ? 'penalty-and-evidence'
      : 'x:' + JSON.stringify([a.reason, v1.breaches, b.ok, c.reason, v2.breaches, d.ok, v3.breaches]);
  },
  pOff: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    WA.inst.setSettings({ enabled: false });
    const a = WA.inst.charter('新星', { kind: '公司' });
    const b = WA.inst.post('星河', '监事', { perms: ['grant'] });
    const c = WA.inst.assign('星河', '董事长', '丁', { replace: true });
    const d = WA.inst.vacate('星河', '董事长', { why: 'succeeded' });
    const e = WA.inst.succession('星河', '甲', '乙', { openProjects: 0, oldOaths: 0 });
    const f = WA.inst.propose('星河', 'x', { by: '甲' });
    const g = WA.inst.breach('星河', '甲', 'x', { penalty: 'y' });
    const n = WA.inst.statView().orgs;
    return ([a.reason, b.reason, c.reason, d.reason, e.reason, f.reason, g.reason]
      .every(function (x) { return x === 'disabled'; }) && n === 1 && WA.inst.buildBlock() === '')
      ? 'off-refused' : 'x:' + [a.reason, b.reason, n].join(',');
  },
  pBound: function (env) {
    const WA = mkW(env.ov);
    let ok = 0;
    for (let i = 0; i < 8; i++) { if (WA.inst.charter('org' + i, { kind: '公司' }).ok) ok++; }
    const n = WA.inst.statView().orgs;
    const cap = WA.store.sizeCaps()['inst.orgs'].cap;
    // 容量有界且挤出有账（上限 = maxOrgs 设置，写入时传入）。
    return (n === 4 && ok === 4 && n <= cap) ? 'orgs-bounded' : 'x:n:' + n + '/ok:' + ok;
  },
  pReadOnly: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    const before = JSON.stringify(WA.store.get().inst);
    WA.inst.view('星河'); WA.inst.statView(); WA.inst.buildBlock();
    return (JSON.stringify(WA.store.get().inst) === before) ? 'read-only' : 'dirty';
  }
};

const N1 = [
  { k: 'perms',  p: PROBES.pPerms,    okk: 'perms-named',            note: '自造权限也能设职' },
  { k: 'known',  p: PROBES.pUnknown,  okk: 'post-first',             note: '无职也能任' },
  { k: 'occup',  p: PROBES.pOccupied, okk: 'one-seat',               note: '一职可以多人（静默覆盖前任）' },
  { k: 'why',    p: PROBES.pReason,   okk: 'reason-required',        note: '离任不要理由' },
  { k: 'handov', p: PROBES.pHandover, okk: 'handover-checked',       note: '交接受检失效（不写明也登记）' },
  { k: 'noauth', p: PROBES.pNoAuth,   okk: 'no-dangling-decision',   note: '没人能批也能挂起' },
  { k: 'auth',   p: PROBES.pAuthz,    okk: 'approve-authorized',     note: '谁都能批准' },
  { k: 'pen',    p: PROBES.pBreach,   okk: 'penalty-and-evidence',   note: '违约不要罚则' },
  { k: 'evid',   p: PROBES.pBreach,   okk: 'penalty-and-evidence',   note: '结案不要依据' },
  { k: 'off',    p: PROBES.pOff,      okk: 'off-refused',            note: '关闭时仍建档' }
];
const BAD_PREFIX = ['x:', 'threw:'];
function isOk(got) {
  return typeof got === 'string' && BAD_PREFIX.every(function (p) { return got.indexOf(p) !== 0; });
}
function judge(a) {
  const ev = readSrc('core/evict.js');
  const st = readSrc('core/store.js');
  const ix = readSrc('index.js');
  const rj = readSrc('tests/run.js');
  const td = readSrc('engines/tool-diag.js');
  const inj = readSrc('render/inject.js');
  const pn = readSrc('ui/panel.js');
  const src = readSrc(REL);
  a(ev.indexOf("'inst.orgs'") >= 0 && ev.indexOf("'inst.pending'") >= 0 && ev.indexOf("'inst.breaches'") >= 0,
    'v2119/inst: [A1] evict.SITES 登记容器');
  a(st.indexOf("'inst.orgs'") >= 0 && st.indexOf('inst: { orgs: [], pending: [], breaches: [], successions: [] }') >= 0,
    'v2119/inst: [A2] store 骨架物化 inst 且 __BOUNDED_CAPS 登记同键');
  a(ix.indexOf("'engines/inst.js'") >= 0 && rj.indexOf("'engines/inst.js'") >= 0,
    'v2119/inst: [A3] index.js / tests/run.js 两处 LOAD 都登记');
  a(td.indexOf("'engines/inst.js': 'inst'") >= 0, 'v2119/inst: [A4] tool-diag MODULE_EXPORTS 登记');
  a(inj.indexOf("'economy', 'inst'") >= 0 && inj.indexOf('vis.inst && WA.inst') >= 0
    && inj.indexOf('组织制度') >= 0, 'v2119/inst: [A5] 注入源表与注入分支同批登记');
  a(pn.indexOf("inst: '组织制度'") >= 0, 'v2119/inst: [A6] 面板显示名登记');
  a(td.indexOf("'wa-inst-charter'") >= 0 && td.indexOf("'wa-inst-out'") >= 0,
    'v2119/inst: [A7] 守卫表登记控件');
  a(src.indexOf('enabled: false, maxOrgs: 8, maxPending: 12, maxBreaches: 12') >= 0,
    'v2119/inst: [A8] 总开关默认关');
  a(src.indexOf("const PERMS = ['approve', 'grant', 'hire', 'punish'];") >= 0,
    'v2119/inst: [A9] 权限是具名表（不成表的权力不许存在）');
  a(src.indexOf("const REASONS = ['resigned', 'dismissed', 'succeeded'];") >= 0,
    'v2119/inst: [A10] 离任理由是具名表');
  a(src.indexOf('WA.registerModule(') >= 0 && src.indexOf('engines/inst.js') >= 0,
    'v2119/inst: [A11] 模块自注册');
  // 批准链与违约各有**两道门**（预检 + 事务内复检）：单独拆预检行为不变
  //   ⇒ 按 B8 [A11] 口径不设假破坏项，改由静态断言钉住「两道都在」。
  // 「已决」与「终态」各有两道门（预检 + 事务内复检）：单独拆预检行为不变
  //   ⇒ 按 B8 [A11] 口径不设假破坏项，改由静态断言钉住「两道都在」。
  a(src.indexOf("TERMINAL.indexOf(p0.status) >= 0") >= 0 && src.indexOf("TERMINAL.indexOf(r.status) >= 0") >= 0,
    'v2119/inst: [A12] 已决/终态两道门同时存在（预检 + 事务内复检）');
  a(src.indexOf('pending-full') >= 0 && src.indexOf('WA.evict.array(og.pending') >= 0,
    'v2119/inst: [A13] 待批容量两道门同时存在');
  a(src.indexOf('breaches-full') >= 0 && src.indexOf('WA.evict.array(og.breaches') >= 0,
    'v2119/inst: [A14] 违约容量两道门同时存在');
  a(src.indexOf('autoApprove') < 0 && src.indexOf('autoSuccession') < 0 && src.indexOf('autoVacate') < 0,
    'v2119/inst: [A15] 无「自动批准 / 自动交接 / 自动离任」路径');
  Object.keys(PROBES).forEach(function (k) {
    const got = probeClean(PROBES[k]);
    a(isOk(got), 'v2119/inst: [B] 原版可用 :: ' + k + '（实 ' + got + '）');
  });
  const W = mkW(null);
  const c = W.inst.charter('星河', { kind: '公司', name: '星河' });
  a(c.ok === true && c.kind === '公司' && c.posts === 0, 'v2119/inst: [C] 建档立行（kind 具名）');
  const po = W.inst.post('星河', '董事长', { perms: ['approve', 'grant'] });
  a(po.ok === true && po.perms.join('/') === 'approve/grant' && po.holder === '',
    'v2119/inst: [C] 设职落权限、初始无人');
  const as1 = W.inst.assign('星河', '董事长', '甲');
  a(as1.ok === true && as1.holder === '甲' && as1.replaced === false, 'v2119/inst: [C] 任职成功');
  const v1 = W.inst.view('星河');
  a(v1.ok === true && v1.posts.length === 1 && v1.posts[0].holder === '甲'
    && v1.canApprove.join('/') === '甲' && v1.open === 0, 'v2119/inst: [C] 读侧带出在任者与可批准者');
  const pr = W.inst.propose('星河', '收购码头', { by: '甲', needs: 'approve' });
  a(pr.ok === true && pr.holders.join('/') === '甲', 'v2119/inst: [C] 待批落库并带出持有者');
  const dc = W.inst.decide('星河', pr.id, 'approved', { by: '甲', why: '值得' });
  a(dc.ok === true && dc.status === 'approved' && dc.decider === '甲', 'v2119/inst: [C] 裁决记名');
  const su = W.inst.succession('星河', '甲', '乙', { openProjects: 2, oldOaths: 1, note: '账目交清' });
  a(su.ok === true && su.keep === true && su.count === 1, 'v2119/inst: [C] 交接留痕且默认保留旧承诺');
  const stv = W.inst.statView();
  a(stv.orgs === 1 && stv.posts === 1 && stv.pending === 0 && stv.byKind['公司'] === 1,
    'v2119/inst: [C] statView 分列读数');
  const caps = W.store.sizeCaps();
  a(caps['inst.orgs'].cap === 8 && caps['inst.pending'].cap === 12 && caps['inst.breaches'].cap === 12,
    'v2119/inst: [C] 容量登记可见');
  const bb = W.inst.buildBlock();
  a(typeof bb === 'string' && bb.indexOf('[组织制度]') >= 0 && bb.indexOf('没有对应权限的人不得批准') >= 0
    && bb.indexOf('旧承诺不因换人而自动作废') >= 0, 'v2119/inst: [C] 注入块说清权限与交接口径');
  const arr = [];
  for (let i = 0; i < 12; i++) arr.push({ i: i });
  const rr = W.evict.array(arr, 'inst.orgs', 8);
  a(rr.ok && rr.dropped === 4 && arr.length === 8, 'v2119/inst: [C] 站点「声明即执行」实测通过');
  const bad = W.inst.decide('星河', pr.id, 'approved', { by: '甲' });
  a(bad.ok === false && bad.reason === 'already-decided', 'v2119/inst: [C] 已决再决照实报 already-decided');
}
function runNegative(a) {
  a(BROKEN.length === 10 && new Set(BROKEN.map(function (x) { return x.key; })).size === 10,
    'v2119/inst: [N0] 破坏面覆盖 10 个互异锚点（实 ' + BROKEN.length + '）');
  BROKEN.forEach(function (s) {
    a(anchorHits(s) === 1, 'v2119/inst: [N0] 锚点在真源码中恰 1 次 :: ' + s.key);
  });
  N1.forEach(function (it) {
    const got = probeWith(BROKEN[B[it.k]], it.p);
    a(got !== it.okk, 'v2119/inst: [N1] ' + it.note + '（缺口复现；实测 ' + got + '）');
  });
  Object.keys(PROBES).forEach(function (k) {
    const got = probeClean(PROBES[k]);
    a(isOk(got), 'v2119/inst: [N2] 原版成立 :: ' + k + '（实 ' + got + '）');
  });
  a(probeWith(BROKEN[B['occup']], PROBES.pReason) === 'reason-required', 'v2119/inst: [N3] 破坏一职一人不影响离任理由');
  a(probeWith(BROKEN[B['why']], PROBES.pOccupied) === 'one-seat', 'v2119/inst: [N3] 破坏离任理由不影响一职一人');
  a(probeWith(BROKEN[B['handov']], PROBES.pBreach) === 'penalty-and-evidence', 'v2119/inst: [N3] 破坏交接受检不影响违约门槛');
  a(probeWith(BROKEN[B['auth']], PROBES.pNoAuth) === 'no-dangling-decision', 'v2119/inst: [N3] 破坏批准权不影响无人可批');
  a(probeWith(BROKEN[B['perms']], PROBES.pUnknown) === 'post-first', 'v2119/inst: [N3] 破坏权限表不影响无职不任');
  const okv = probeClean(PROBES.pHandover);
  const badv = probeWith(BROKEN[B['handov']], PROBES.pHandover);
  a(okv !== badv && okv === 'handover-checked',
    'v2119/inst: [N4] 交接受检判据非恒真（原版 ' + okv + ' / 破坏 ' + badv + '）');
  const ok2 = probeClean(PROBES.pAuthz);
  const bad2 = probeWith(BROKEN[B['auth']], PROBES.pAuthz);
  a(ok2 !== bad2 && ok2 === 'approve-authorized',
    'v2119/inst: [N4] 批准权判据非恒真（原版 ' + ok2 + ' / 破坏 ' + bad2 + '）');
  const ok3 = probeClean(PROBES.pPerms);
  const bad3 = probeWith(BROKEN[B['perms']], PROBES.pPerms);
  a(ok3 !== bad3 && ok3 === 'perms-named',
    'v2119/inst: [N4] 权限具名判据非恒真（原版 ' + ok3 + ' / 破坏 ' + bad3 + '）');
}
function runAll(a) { judge(a); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('INST-V2119: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('INST-V2119: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits,
  PROBES: PROBES, mkW: mkW, probeClean: probeClean, probeWith: probeWith };

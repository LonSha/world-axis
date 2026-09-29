#!/usr/bin/env node
// WorldAxis tests/session-v2119.js -- 拓展计划 ⑧ 专锁：多人连接层（v2.119.0）
//
// 逐条守住：
//   ① 入座必须持票；凭证只存指纹（不落明文）；
//   ② 一个名字一个座；角色独占（接管要显式）；
//   ③ 权限是座位上的具名表；
//   ④ 验票只认凭证；
//   ⑤ 发消息序号必须连续；
//   ⑥ 续传不许假装没漏（越窗要重同步）；
//   ⑦ 视点按权限过滤；卸座不删历史。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__session2119_';
const REL = 'engines/session.js';
const A_TOK = "    if (!token) { noteFault('missing-token'); return { ok: false, reason: 'missing-token', hint: '入座必须持票（本模块只认凭证）' }; }";
const A_NAME = "    if (findSeat(who)) { noteFault('name-taken'); return { ok: false, reason: 'name-taken', name: who }; }\n    const cfg = settings();";
const A_PERM = "    if (bad.length) { noteFault('bad-perms'); return { ok: false, reason: 'bad-perms', bad: bad, allowed: SEAT_PERMS.slice() }; }";
const A_TOKEN = "    if (!fp || fp !== clean(seat.fp, 80)) { noteFault('bad-token'); return { ok: false, reason: 'bad-token', name: who }; }";
const A_ORDER = "    if (no !== null && no !== expect) {";
const A_RSYNC = "    if (from + 1 < oldest) {";
const A_SCOPE = "    const all = perms.indexOf('decide') >= 0;";
const A_OFF = "  function host(name, opts) {\n    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }\n    const o = opts || {};\n    const who = clean(name, 40), role = clean(o.role, 40), token = clean(o.token, 120);";
const BROKEN = [
  { rel: REL, key: 'tok',   from: A_TOK,   to: "    if (false) { noteFault('missing-token'); return { ok: false, reason: 'missing-token' }; }" },
  { rel: REL, key: 'name',  from: A_NAME,  to: "    if (false) { noteFault('name-taken'); return { ok: false, reason: 'name-taken', name: who }; }\n    const cfg = settings();" },
  { rel: REL, key: 'perm',  from: A_PERM,  to: "    if (false) { noteFault('bad-perms'); return { ok: false, reason: 'bad-perms', bad: bad }; }" },
  { rel: REL, key: 'token', from: A_TOKEN, to: "    if (false) { noteFault('bad-token'); return { ok: false, reason: 'bad-token', name: who }; }" },
  { rel: REL, key: 'order', from: A_ORDER, to: "    if (false) {" },
  { rel: REL, key: 'rsync', from: A_RSYNC, to: "    if (from + 1 < 0) {" },
  { rel: REL, key: 'scope', from: A_SCOPE, to: "    const all = true;" },
  { rel: REL, key: 'off',   from: A_OFF,   to: "  function host(name, opts) {\n    if (false) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }\n    const o = opts || {};\n    const who = clean(name, 40), role = clean(o.role, 40), token = clean(o.token, 120);" }
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
  WA.session.setSettings({ enabled: false, maxSeats: 4, maxLog: 16, windowMs: 3600000 });
  WA.store.transact(function (d) { d.session = { seats: [], log: [], seq: 0, rev: 0, host: '' }; }, TAG + 'reset');
  WA.session.setSettings({ enabled: true, maxSeats: 4, maxLog: 16, windowMs: 3600000 });
  return WA;
}
function seeded(WA) {
  WA.session.host('主持人', { role: 'GM', token: 'tok-A' });
  WA.session.join('阿明', { role: '侦探', token: 'tok-M', perms: ['post'] });
  return WA;
}

const PROBES = {
  pTok: function (env) {
    const WA = mkW(env.ov);
    const a = WA.session.host('主持人', { role: 'GM' });
    const b = WA.session.host('主持人', { role: 'GM', token: 'tok-A' });
    const v = WA.session.statView();
    // 入座必须持票；指纹不落明文。
    return (a.reason === 'missing-token' && b.ok === true && v.seats === 1
      && b.perms.length === 4) ? 'token-required'
      : 'x:' + JSON.stringify([a.reason, b.ok, v.seats]);
  },
  pName: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    const a = WA.session.host('主持人', { role: 'GM', token: 'tok-B' });
    const b = WA.session.join('阿明', { role: '助手', token: 'tok-N' });
    const v = WA.session.statView();
    return (a.reason === 'name-taken' && b.reason === 'name-taken' && v.seats === 2) ? 'name-unique'
      : 'x:' + JSON.stringify([a.reason, b.reason, v.seats]);
  },
  pPerm: function (env) {
    const WA = mkW(env.ov);
    WA.session.host('主持人', { role: 'GM', token: 'tok-A' });
    const a = WA.session.join('阿强', { role: '助手', token: 'tok-Q', perms: ['post', 'godmode'] });
    const b = WA.session.join('阿强', { role: '助手', token: 'tok-Q', perms: ['post'] });
    const v = WA.session.view('');
    // 自造权限拒收，正常权限可入座。
    return (a.reason === 'bad-perms' && a.bad[0] === 'godmode' && b.ok === true
      && v.seats.length === 2) ? 'perms-declared'
      : 'x:' + JSON.stringify([a.reason, a.bad, b.ok, v.seats.length]);
  },
  pToken: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    const a = WA.session.auth('阿明', 'wrong');
    const b = WA.session.auth('阿明', 'tok-M');
    const c = WA.session.auth('陌生人', 'tok-Z');
    // 只认凭证，不认「他说他是谁」。
    return (a.reason === 'bad-token' && b.ok === true && b.role === '侦探'
      && c.reason === 'unknown-seat') ? 'token-only'
      : 'x:' + JSON.stringify([a.reason, b.ok, b.role, c.reason]);
  },
  pOrder: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    const a = WA.session.post('主持人', 'tok-A', '开场');
    const b = WA.session.post('主持人', 'tok-A', '跳号', { seq: 99 });
    const v1 = WA.session.statView();
    const c = WA.session.post('主持人', 'tok-A', '按序', { seq: 2 });
    const v2 = WA.session.statView();
    return (a.seq === 1 && b.reason === 'out-of-order' && b.expect === 2 && v1.seq === 1
      && c.ok === true && v2.seq === 2) ? 'order-enforced'
      : 'x:' + JSON.stringify([a.seq, b.reason, b.expect, v1.seq, c.ok, v2.seq]);
  },
  pGap: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    // 填满日志窗口（16 条），使 seq=0 起点落在窗口之外。
    for (let i = 0; i < 20; i++) WA.session.post('主持人', 'tok-A', 'm' + i);
    const a = WA.session.since('阿明', 'tok-M', 0);
    const b = WA.session.since('阿明', 'tok-M', 17);
    const c = WA.session.since('阿明', 'tok-M', 99);
    // 越窗不许假装没漏；在窗内可续传；认的序号超前也拒收。
    return (a.reason === 'need-resync' && a.oldest === 5
      && b.ok === true && b.count === 3 && c.reason === 'ahead-of-head') ? 'no-pretend'
      : 'x:' + JSON.stringify([a.reason, a.oldest, b.ok, b.count, c.reason]);
  },
  pScope: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    WA.session.post('主持人', 'tok-A', '一');
    WA.session.post('阿明', 'tok-M', '二');
    WA.session.post('主持人', 'tok-A', '三');
    const h = WA.session.view('主持人', 'tok-A');
    const p = WA.session.view('阿明', 'tok-M');
    // 主持人看全量，玩家只看自己那条线。
    return (h.scope === 'all' && h.rows.length === 3
      && p.scope === 'own' && p.rows.length === 1 && p.rows[0].seq === 2) ? 'scope-filtered'
      : 'x:' + JSON.stringify([h.scope, h.rows.length, p.scope, p.rows.length]);
  },
  pHist: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    WA.session.post('主持人', 'tok-A', '一');
    WA.session.post('阿明', 'tok-M', '二');
    const lv = WA.session.leave('阿明', 'tok-M');
    const v = WA.session.view('阿明', 'tok-M');
    const s = WA.session.statView();
    // 卸座不删历史：已发出的仍在。
    return (lv.ok === true && lv.kept === 2 && v.reason === 'revoked'
      && s.log === 2 && s.seq === 2) ? 'history-kept'
      : 'x:' + JSON.stringify([lv.ok, lv.kept, v.reason, s.log, s.seq]);
  },
  pOff: function (env) {
    const WA = mkW(env.ov);
    seeded(WA);
    WA.session.setSettings({ enabled: false });
    const a = WA.session.host('丙', { role: 'GM', token: 'tok-C' });
    const b = WA.session.join('丁', { role: '助手', token: 'tok-D' });
    const c = WA.session.auth('主持人', 'tok-A');
    const d = WA.session.post('主持人', 'tok-A', 'x');
    const e = WA.session.leave('主持人', 'tok-A');
    const v = WA.session.statView();
    return ([a.reason, b.reason, c.reason, d.reason, e.reason].every(function (x) { return x === 'disabled'; })
      && v.seats === 2 && WA.session.buildBlock() === '') ? 'off-refused'
      : 'x:' + [a.reason, b.reason, c.reason, d.reason, e.reason].join(',');
  },
  pBound: function (env) {
    const WA = mkW(env.ov);
    let ok = 0;
    for (let i = 0; i < 8; i++) { if (WA.session.host('H' + i, { role: 'GM' + i, token: 't' + i }).ok) ok++; }
    const n = WA.session.statView().seats;
    const cap = WA.store.sizeCaps()['session.seats'].cap;
    // 容量有界且挤出有账。
    return (n === 4 && ok === 4 && n <= cap) ? 'seats-bounded' : 'x:n:' + n + '/ok:' + ok;
  }
};

const N1 = [
  { k: 'tok',   p: PROBES.pTok,  okk: 'token-required', note: '无票也能入座' },
  { k: 'name',  p: PROBES.pName, okk: 'name-unique',    note: '同一名字能坐两次' },
  { k: 'perm',  p: PROBES.pPerm, okk: 'perms-declared', note: '自造权限也能入座' },
  { k: 'token', p: PROBES.pToken, okk: 'token-only',    note: '错票也能通过验证' },
  { k: 'order', p: PROBES.pOrder, okk: 'order-enforced', note: '跳号也能入历史' },
  { k: 'rsync', p: PROBES.pGap,   okk: 'no-pretend',    note: '越窗也假装没漏' },
  { k: 'scope', p: PROBES.pScope, okk: 'scope-filtered', note: '玩家能看全量' },
  { k: 'off',   p: PROBES.pOff,   okk: 'off-refused',   note: '关闭时仍入座' }
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
  a(ev.indexOf("'session.seats'") >= 0 && ev.indexOf("'session.log'") >= 0,
    'v2119/session: [A1] evict.SITES 登记两容器');
  a(st.indexOf("'session.seats'") >= 0 && st.indexOf("session: { seats: [], log: [], seq: 0, rev: 0, host: '' }") >= 0,
    'v2119/session: [A2] store 骨架物化 session 且 __BOUNDED_CAPS 登记同键');
  a(ix.indexOf("'engines/session.js'") >= 0 && rj.indexOf("'engines/session.js'") >= 0,
    'v2119/session: [A3] index.js / tests/run.js 两处 LOAD 都登记');
  a(td.indexOf("'engines/session.js': 'session'") >= 0, 'v2119/session: [A4] tool-diag MODULE_EXPORTS 登记');
  a(inj.indexOf("'stage', 'session'") >= 0 && inj.indexOf('vis.session && WA.session') >= 0
    && inj.indexOf("'多人场'") >= 0, 'v2119/session: [A5] 注入源表与注入分支同批登记');
  a(pn.indexOf("session: '多人场'") >= 0, 'v2119/session: [A6] 面板显示名登记');
  a(src.indexOf('enabled: false, maxSeats: 8, maxLog: 64, windowMs: 3600000') >= 0,
    'v2119/session: [A7] 总开关默认关');
  a(src.indexOf("const SEAT_PERMS = ['post', 'advance', 'decide', 'invite'];") >= 0,
    'v2119/session: [A8] 座位权限具名表');
  a(src.indexOf('WA.registerModule(') >= 0 && src.indexOf('engines/session.js') >= 0,
    'v2119/session: [A9] 模块自注册');
  // 凭证只存指纹：源码里不得出现「把 token 本身写进状态」的赋值。
  a(src.indexOf('fp: fp') >= 0 && src.indexOf('token:') < 0,
    'v2119/session: [A10] 凭证只存指纹（状态里不落明文）');
  // 角色独占在 host 与 join 各有一处同源判据：单独拆任一处行为不变（另一处仍会拒），
  //   ⇒ 按 B8 [A11] 口径不设假破坏项，改由静态断言钉住「两处都在」。
  a((src.match(/reason: 'role-taken'/g) || []).length === 2,
    'v2119/session: [A14] 角色独占两处判据同时存在（主持人与入座）');
  a(src.indexOf("reason: 'out-of-order'") >= 0 && src.indexOf("reason: 'need-resync'") >= 0,
    'v2119/session: [A11] 顺序与补漏两条硬门都在');
  a(src.indexOf("reason: 'bad-token'") >= 0 && src.indexOf("reason: 'revoked'") >= 0,
    'v2119/session: [A12] 错票与停用两种拒收都在');
  a(src.indexOf('autoHost') < 0 && src.indexOf('autoJoin') < 0 && src.indexOf('autoPost') < 0,
    'v2119/session: [A13] 无「自动入座 / 自动发言」路径');
  Object.keys(PROBES).forEach(function (k) {
    const got = probeClean(PROBES[k]);
    a(isOk(got), 'v2119/session: [B] 原版可用 :: ' + k + '（实 ' + got + '）');
  });
  const W = mkW(null);
  const h = W.session.host('主持人', { role: 'GM', token: 'tok-A' });
  a(h.ok === true && h.host === true && h.perms.length === 4 && h.rev === 1, 'v2119/session: [C] 主持人开座（种下第一版）');
  const j = W.session.join('阿明', { role: '侦探', token: 'tok-M', perms: ['post'] });
  a(j.ok === true && j.perms.join('/') === 'post' && j.rev === 2, 'v2119/session: [C] 玩家带权限入座');
  const v1 = W.session.view('');
  a(v1.host === '主持人' && v1.seats.length === 2 && v1.log === 0
    && v1.seats.every(function (s) { return s.fp === undefined; }),
    'v2119/session: [C] 作者面总览不含指纹');
  const p1 = W.session.post('主持人', 'tok-A', '开场');
  const p2 = W.session.post('阿明', 'tok-M', '我在');
  a(p1.seq === 1 && p2.seq === 2, 'v2119/session: [C] 发言按序编号');
  const s1 = W.session.since('阿明', 'tok-M', 1);
  a(s1.ok === true && s1.count === 1 && s1.rows[0].seq === 2, 'v2119/session: [C] 断线按序号续传');
  const rs = W.session.resync('阿明', 'tok-M');
  a(rs.ok === true && rs.watermark === 2 && rs.snapshot.rows.length === 2
    && rs.snapshot.seats.length === 2, 'v2119/session: [C] 重同步给水位与全量快照');
  const sv = W.session.statView();
  a(sv.seats === 2 && sv.active === 2 && sv.seq === 2 && sv.log === 2, 'v2119/session: [C] statView 分列读数');
  const caps = W.store.sizeCaps();
  a(caps['session.seats'].cap === 8 && caps['session.log'].cap === 64, 'v2119/session: [C] 容量登记可见');
  const arr = [];
  for (let i = 0; i < 20; i++) arr.push({ i: i });
  const rr = W.evict.array(arr, 'session.log', 16);
  a(rr.ok && rr.dropped === 4 && arr.length === 16, 'v2119/session: [C] 站点「声明即执行」实测通过');
  const bb = W.session.buildBlock();
  a(typeof bb === 'string' && bb.indexOf('[多人场]') >= 0 && bb.indexOf('主持：主持人') >= 0
    && bb.indexOf('持票') >= 0, 'v2119/session: [C] 注入块说清在场与持票');
  // 指纹是单向的：同样输入得到同样输出，不同输入不同。
  a(W.session.fingerprint('tok-A') === W.session.fingerprint('tok-A')
    && W.session.fingerprint('tok-A') !== W.session.fingerprint('tok-B'),
    'v2119/session: [C] 指纹稳定且可区分');
  const before = JSON.stringify(W.store.get().session);
  W.session.view('主持人', 'tok-A'); W.session.statView(); W.session.since('阿明', 'tok-M', 2);
  a(JSON.stringify(W.store.get().session) === before, 'v2119/session: [C] 读取路径不写盘');
}
function runNegative(a) {
  a(BROKEN.length === 8 && new Set(BROKEN.map(function (x) { return x.key; })).size === 8,
    'v2119/session: [N0] 破坏面覆盖 8 个互异锚点（实 ' + BROKEN.length + '）');
  BROKEN.forEach(function (s) {
    a(anchorHits(s) === 1, 'v2119/session: [N0] 锚点在真源码中恰 1 次 :: ' + s.key);
  });
  N1.forEach(function (it) {
    const got = probeWith(BROKEN[B[it.k]], it.p);
    a(got !== it.okk, 'v2119/session: [N1] ' + it.note + '（缺口复现；实测 ' + got + '）');
  });
  Object.keys(PROBES).forEach(function (k) {
    const got = probeClean(PROBES[k]);
    a(isOk(got), 'v2119/session: [N2] 原版成立 :: ' + k + '（实 ' + got + '）');
  });
  a(probeWith(BROKEN[B['tok']], PROBES.pToken) === 'token-only', 'v2119/session: [N3] 破坏持票要求不影响验票');
  a(probeWith(BROKEN[B['order']], PROBES.pGap) === 'no-pretend', 'v2119/session: [N3] 破坏序号连续不影响补漏');
  a(probeWith(BROKEN[B['perm']], PROBES.pScope) === 'scope-filtered', 'v2119/session: [N3] 破坏权限表不影响视点过滤');
  const okv = probeClean(PROBES.pOrder);
  const badv = probeWith(BROKEN[B['order']], PROBES.pOrder);
  a(okv !== badv && okv === 'order-enforced',
    'v2119/session: [N4] 序号连续判据非恒真（原版 ' + okv + ' / 破坏 ' + badv + '）');
  const ok2 = probeClean(PROBES.pGap);
  const bad2 = probeWith(BROKEN[B['rsync']], PROBES.pGap);
  a(ok2 !== bad2 && ok2 === 'no-pretend',
    'v2119/session: [N4] 不许假装没漏判据非恒真（原版 ' + ok2 + ' / 破坏 ' + bad2 + '）');
  const ok3 = probeClean(PROBES.pScope);
  const bad3 = probeWith(BROKEN[B['scope']], PROBES.pScope);
  a(ok3 !== bad3 && ok3 === 'scope-filtered',
    'v2119/session: [N4] 视点过滤判据非恒真（原版 ' + ok3 + ' / 破坏 ' + bad3 + '）');
}
function runAll(a) { judge(a); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('SESSION-V2119: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('SESSION-V2119: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits,
  PROBES: PROBES, mkW: mkW, probeClean: probeClean, probeWith: probeWith };

#!/usr/bin/env node
// WorldAxis tests/mend-v2119.js -- 拓展计划 ② 专锁：关系修复与破裂（v2.119.0）
//
// 拓展计划 ② 原文要点：被伤害之后要答得出「伤到哪一步才算好、怎么做才算补上了」；
//   四种修复手段各自有硬门槛且**不可互相顶替**；结案改关系必须显式授权且进度达标；
//   失败是一等公民（不删行）；重复结案不产生第二次关系变化。
//
// 逐条守住（每条都是「写出来了、但某个条件下不会成立」）：
//   ① 伤害必须写明（hurt 缺失 ⇒ missing-hurt）；
//   ② 四种手段各占一格、互不顶替（道歉不能代替补偿）；
//   ③ 没有真实转移回执不算补偿；道歉需对方显式接受且写明谁接受；守约要证据；担保要第三方；
//   ④ 进度 = 已满足条件的手段格数（同一格做两次还是那一格），不是好感分；
//   ⑤ 结案 fulfilled 需**进度达标 + 显式授权**两件事同时成立；
//   ⑥ 终态后任何 step 报 already-closed（幂等靠状态机）；
//   ⑦ 关系变化只能落在 fondness 的步进白名单内（自造刻度会被 off-step 拒收 ⇒ 成了却没变）；
//   ⑧ 非当事人不能做修复动作；失败的修复不删行；
//   ⑨ 关闭时拒收（零台账）；容器 mend.threads 有界且挤出有账。
//
// 每条判据两向自证：真源码成绿 / 就地破坏现形（只改内存副本，零文件改写）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__mend2119_';
const REL = 'engines/mend.js';
const FREL = 'engines/fondness.js';

// ── 破坏锚点（逐字取自真源码，各恰 1 次）──
const A_HURT  = "    if (!hurt) { noteFault('missing-hurt'); return { ok: false, reason: 'missing-hurt', hint: '伤害必须写明针对什么' }; }";
const A_ACC   = "      if (o.accepted !== true) return { ok: false, reason: 'not-accepted', hint: '道歉只有对方接受才算一步' };";
const A_ACCBY = "      if (!clean(o.acceptedBy, 40)) return { ok: false, reason: 'missing-accepter', hint: '谁接受了必须写明' };";
const A_RCPT  = "      if (o.receipt !== true) return { ok: false, reason: 'no-receipt', hint: '补偿需要一笔真实转移的回执' };";
const A_KEPT  = "      if (o.kept !== true) return { ok: false, reason: 'not-kept', hint: '守约需要实际守约的证据' };";
const A_GUAR  = "      if (by === clean(row.person, 40) || by === clean(row.with, 40)) {";
const A_PARTY = "    if (clean(person, 40) !== clean(row.person, 40)) {\n      // 只有当事人自己能做修复动作（别人代做不是他在修复）。\n      noteFault('not-a-party');";
const A_PROG  = "      if (prog < cfg.minProgress) {";
const A_AUTH  = "      if (o.applyRelation !== true) {";
const A_TERM  = "    if (TERMINAL.indexOf(row.status) >= 0) { noteFault('already-closed'); return { ok: false, reason: 'already-closed', status: row.status }; }";
const A_TERM2 = "      if (TERMINAL.indexOf(r.status) >= 0) { out = { ok: false, reason: 'already-closed', status: r.status }; return false; }";
const A_CELL  = "    const acts = row && row.acts && typeof row.acts === 'object' ? row.acts : {};";
const A_RELIEF= "  const RELIEF = { 1: 0.1, 2: 0.3, 3: 0.5, 4: 0.8 };";
const A_DELTA = "      const delta = RELIEF[Math.min(prog, 4)] || 0.1;";
const A_OFF   = "    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }\n    const o = opts || {};\n    const who = clean(person, 40), withWhom = clean(o.with, 40), hurt = clean(o.hurt, 80);";
const A_EVICT = "      WA.evict.array(draft.mend.threads, 'mend.threads', cfg.maxRows);";
const A_KEEP  = "      r.status = oc;";
const A_HIST  = "    if (!row && withW) {";

const BROKEN = [
  { rel: REL, key: 'hurt', from: A_HURT, to: "    if (false) { noteFault('missing-hurt'); return { ok: false, reason: 'missing-hurt', hint: '伤害必须写明针对什么' }; }",
    why: '伤害可以不写明 ⇒ 「他伤了我」变成可执行的修复条件' },
  { rel: REL, key: 'acc', from: A_ACC, to: "      if (false) return { ok: false, reason: 'not-accepted', hint: '道歉只有对方接受才算一步' };",
    why: '道歉不要对方接受 ⇒ 一个人自己就能把关系修好' },
  { rel: REL, key: 'accby', from: A_ACCBY, to: "      if (false) return { ok: false, reason: 'missing-accepter', hint: '谁接受了必须写明' };",
    why: '谁接受了不用写明 ⇒ 「对方接受了」无凭据' },
  { rel: REL, key: 'rcpt', from: A_RCPT, to: "      if (false) return { ok: false, reason: 'no-receipt', hint: '补偿需要一笔真实转移的回执' };",
    why: '没有回执也算补偿 ⇒ 「我说我赔了」变成已补偿' },
  { rel: REL, key: 'kept', from: A_KEPT, to: "      if (false) return { ok: false, reason: 'not-kept', hint: '守约需要实际守约的证据' };",
    why: '守约不要证据 ⇒ 承诺本身被当成已履行' },
  { rel: REL, key: 'guar', from: A_GUAR, to: "      if (false) {",
    why: '担保人可以是当事人自己 ⇒ 「第三方担保」变成自证' },
  { rel: REL, key: 'party', from: A_PARTY, to: "    if (false) {\n      // 只有当事人自己能做修复动作（别人代做不是他在修复）。\n      noteFault('not-a-party');",
    why: '别人可以代做修复 ⇒ 不是他在修复却记在他头上' },
  { rel: REL, key: 'prog', from: A_PROG, to: "      if (false) {",
    why: '进度不达标也能结案 ⇒ 「伤到哪一步才算好」没有答案' },
  { rel: REL, key: 'auth', from: A_AUTH, to: "      if (false) {",
    why: '结案自动改关系 ⇒ 显式授权形同虚设' },
  { rel: REL, key: 'cell', from: A_CELL, to: "      const acts = {};",
    why: '手段格不按类型分格 ⇒ 道歉可以顶替补偿（四格退化成一根计数）' },
  { rel: REL, key: 'relief', from: A_RELIEF, to: "  const RELIEF = { 1: 1, 2: 2, 3: 4 };",
    why: '关系步进自造刻度 ⇒ 落在 fondness 白名单之外，结案成了而关系没动（off-step）' },
  { rel: REL, key: 'delta', from: A_DELTA, to: "      const delta = 1;",
    why: '关系步进写死 ⇒ 同样落在白名单之外（成了却没变）' },
  { rel: REL, key: 'off', from: A_OFF, to: "    if (false) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }\n    const o = opts || {};\n    const who = clean(person, 40), withWhom = clean(o.with, 40), hurt = clean(o.hurt, 80);",
    why: '关闭时仍登记 ⇒ 总开关形同虚设' },
  { rel: REL, key: 'keep', from: A_KEEP, to: "      r.status = r.status;",
    why: 'closing does not set the status => no terminal state: one thread can be closed over and over, moving the relation each time' },
  { rel: REL, key: 'hist', from: A_HIST, to: "    if (false) {",
    why: 'terminal rows unreadable => "he asked once and was refused" keeps its row yet is invisible' },
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
  ov.__origSrc = src;
  return ov;
}
// 同时破坏 mend 与 fondness（用于「关系变化确实落了地」的两向自证）
function brokenPair(spec, fspec) {
  const ov = brokenOverride(spec);
  const f = brokenOverride(fspec);
  Object.keys(f).forEach(function (k) { if (k !== '__origSrc') ov[k] = f[k]; });
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
// ── 夹具：甲/乙一对；fondness 与 mend 一并复位（关系真源必须处于已知起点）──
function reset(WA) {
  WA.mend.setSettings({ enabled: false, maxRows: 12, minProgress: 2, maxSteps: 3 });
  WA.fondness.setSettings({ enabled: false });
  WA.store.transact(function (d) { d.mend = { threads: [] }; d.fondness = { rows: [] }; }, TAG + 'reset');
  WA.mend.setSettings({ enabled: true, maxRows: 12, minProgress: 2, maxSteps: 3 });
  WA.fondness.setSettings({ enabled: true });
  return WA;
}
function open1(WA) { return WA.mend.mark('甲', { with: '乙', hurt: '当着人面说重了' }).id; }
function fillTwo(WA) {
  const id = open1(WA);
  WA.mend.step('甲', id, 'apology', { accepted: true, acceptedBy: '乙' });
  WA.mend.step('甲', id, 'restitution', { receipt: true, evidence: '还了钱' });
  return id;
}

const PROBES = {
  pGate: function (env) {
    const WA = mkW(env.ov);
    const a = WA.mend.mark('甲', { with: '乙' });
    const b = WA.mend.mark('甲', { with: '甲', hurt: 'x' });
    const c = WA.mend.mark('', { with: '乙', hurt: 'x' });
    const ok = WA.mend.mark('甲', { with: '乙', hurt: '话说重了' });
    const d = WA.mend.mark('甲', { with: '乙', hurt: '又伤' });
    const n = WA.mend.statView().rows;
    return (a.reason === 'missing-hurt' && b.reason === 'bad-pair' && c.reason === 'missing-fields'
      && ok.ok === true && d.reason === 'exists' && n === 1) ? 'mark-gated'
      : 'x:' + [a.reason, b.reason, c.reason, d.reason, n].join(',');
  },
  pAcc: function (env) {
    const WA = mkW(env.ov);
    const id = open1(WA);
    const a = WA.mend.step('甲', id, 'apology', {});
    const b = WA.mend.step('甲', id, 'apology', { accepted: true });
    const c = WA.mend.step('甲', id, 'apology', { accepted: true, acceptedBy: '乙' });
    return (a.reason === 'not-accepted' && b.reason === 'missing-accepter' && c.ok === true)
      ? 'kinds-gated' : 'x:' + [a.reason, b.reason, c.reason].join(',');
  },
  pRcpt: function (env) {
    const WA = mkW(env.ov);
    const id = open1(WA);
    const a = WA.mend.step('甲', id, 'restitution', {});
    const b = WA.mend.step('甲', id, 'restitution', { receipt: true, evidence: '还了钱' });
    return (a.reason === 'no-receipt' && b.ok === true && b.progress === 1)
      ? 'receipt-required' : 'x:' + [a.reason, b.reason].join(',');
  },
  pKept: function (env) {
    const WA = mkW(env.ov);
    const id = open1(WA);
    const a = WA.mend.step('甲', id, 'keeping', {});
    const b = WA.mend.step('甲', id, 'keeping', { kept: true, evidence: '按时到了' });
    return (a.reason === 'not-kept' && b.ok === true && b.progress === 1)
      ? 'kept-required' : 'x:' + [a.reason, b.reason].join(',');
  },
  pGuar: function (env) {
    const WA = mkW(env.ov);
    const id = open1(WA);
    const a = WA.mend.step('甲', id, 'guarantee', {});
    const b = WA.mend.step('甲', id, 'guarantee', { by: '甲' });
    const c = WA.mend.step('甲', id, 'guarantee', { by: '乙' });
    const d = WA.mend.step('甲', id, 'guarantee', { by: '丙' });
    return (a.reason === 'missing-guarantor' && b.reason === 'bad-guarantor'
      && c.reason === 'bad-guarantor' && d.ok === true && d.progress === 1)
      ? 'third-party-only' : 'x:' + [a.reason, b.reason, c.reason].join(',');
  },
  pCells: function (env) {
    const WA = mkW(env.ov);
    const id = open1(WA);
    const r1 = WA.mend.step('甲', id, 'apology', { accepted: true, acceptedBy: '乙' });
    const r2 = WA.mend.step('甲', id, 'apology', { accepted: true, acceptedBy: '乙' });
    const r3 = WA.mend.step('甲', id, 'restitution', { receipt: true, evidence: '还了钱' });
    const v = WA.mend.view('甲', '乙');
    return (r1.progress === 1 && r2.progress === 1 && r2.repeated === true && r3.progress === 2
      && v.progress === 2 && v.acts[0].count === 2) ? 'cells-bounded'
      : 'x:' + JSON.stringify([r1.progress, r2.progress, r3.progress, v.progress]);
  },
  pParty: function (env) {
    const WA = mkW(env.ov);
    const id = open1(WA);
    const a = WA.mend.step('丙', id, 'apology', { accepted: true, acceptedBy: '乙' });
    const b = WA.mend.close('丙', id, 'failed', {});
    const v = WA.mend.view('甲', '乙');
    return (a.reason === 'not-a-party' && b.reason === 'not-a-party' && v.progress === 0
      && v.status === 'open') ? 'party-only' : 'x:' + [a.reason, b.reason].join(',');
  },
  pProg: function (env) {
    const WA = mkW(env.ov);
    const id = open1(WA);
    const a = WA.mend.close('甲', id, 'fulfilled', { applyRelation: true });
    WA.mend.step('甲', id, 'apology', { accepted: true, acceptedBy: '乙' });
    const c = WA.mend.close('甲', id, 'fulfilled', { applyRelation: true });
    const v = WA.mend.view('甲', '乙');
    return (a.reason === 'insufficient-progress' && c.reason === 'insufficient-progress'
      && v.status === 'open' && v.missing.length === 3) ? 'progress-gated'
      : 'x:' + [a.reason, c.reason, v.status, v.missing.length].join(',');
  },
  pAuth: function (env) {
    const WA = mkW(env.ov);
    const id = fillTwo(WA);
    const a = WA.mend.close('甲', id, 'fulfilled', {});
    const v = WA.mend.view('甲', '乙');
    const f = WA.fondness.read('乙');
    return (a.reason === 'relation-not-authorized' && v.status === 'open' && f.ok === false)
      ? 'relation-authorized-only' : 'x:' + [a.reason, v.status, f.ok].join(',');
  },
  pClose: function (env) {
    const WA = mkW(env.ov);
    const id = fillTwo(WA);
    const r = WA.mend.close('甲', id, 'fulfilled', { applyRelation: true });
    const v = WA.mend.view('甲', '乙');
    const f = WA.fondness.read('乙');
    return (r.ok === true && r.status === 'fulfilled' && r.progress === 2 && r.relation && r.relation.ok === true
      && f.value === 0.3 && v.closed === true) ? 'relief-applied'
      : 'x:' + JSON.stringify([r.ok, r.progress, r.relation, f.value]);
  },
  pTerm: function (env) {
    const WA = mkW(env.ov);
    const id = fillTwo(WA);
    const a = WA.mend.close('甲', id, 'fulfilled', { applyRelation: true });
    const v1 = WA.mend.view('甲', '乙');
    const b = WA.mend.step('甲', id, 'keeping', { kept: true });
    const c = WA.mend.close('甲', id, 'fulfilled', { applyRelation: true });
    const v2 = WA.mend.view('甲', '乙');
    const f = WA.fondness.read('乙');
    return (a.ok === true && v1.progress === 2 && b.reason === 'already-closed' && c.reason === 'already-closed'
      && v2.progress === 2 && f.value === 0.3) ? 'one-shot'
      : 'x:' + [a.ok, b.reason, c.reason, v2.progress, f.value].join(',');
  },
  pIntent: function (env) {
    const WA = mkW(env.ov);
    const id = open1(WA);
    const a = WA.mend.step('甲', id, 'gift', {});
    const b = WA.mend.close('甲', id, 'forgiven', {});
    const c = WA.mend.close('甲', id, 'failed', {});
    const v = WA.mend.view('甲', '乙');
    return (a.reason === 'bad-kind' && b.reason === 'bad-outcome'
      && c.ok === true && c.status === 'failed' && v.status === 'failed'
      && v.acts.every(function (x) { return x.done === false; })) ? 'intent-closed'
      : 'x:' + [a.reason, b.reason, c.reason, v.status].join(',');
  },
  pOff: function (env) {
    const WA = mkW(env.ov);
    const id = open1(WA);
    WA.mend.setSettings({ enabled: false });
    const m = WA.mend.mark('甲', { with: '乙', hurt: 'x' });
    const s = WA.mend.step('甲', id, 'apology', { accepted: true, acceptedBy: '乙' });
    const c = WA.mend.close('甲', id, 'failed', {});
    const n = WA.mend.statView().rows;
    const bb = WA.mend.buildBlock();
    return (m.reason === 'disabled' && s.reason === 'disabled' && c.reason === 'disabled'
      && n === 1 && bb === '') ? 'off-refused' : 'x:' + [m.reason, s.reason, c.reason, n, bb.length].join(',');
  },
  pBounded: function (env) {
    const WA = mkW(env.ov);
    let ok = 0;
    for (let i = 0; i < 14; i++) {
      const r = WA.mend.mark('甲', { with: '乙', hurt: '第' + i + '次' });
      if (r.ok) { ok++; WA.mend.close('甲', r.id, 'dropped', {}); }
    }
    const n = WA.mend.statView().rows;
    const cap = WA.store.sizeCaps()['mend.threads'].cap;
    return (n === 12 && ok === 12 && n <= cap) ? 'threads-bounded' : 'x:n:' + n + '/ok:' + ok;
  },
  pStale: function (env) {
    const WA = mkW(env.ov);
    const id = fillTwo(WA);
    WA.mend.close('甲', id, 'failed', { reason: '对方没接受' });
    let ok2 = false;
    WA.store.transact(function (d) { d.mend.threads = []; }, TAG + 'wipe');
    try { WA.mend.view('甲', '乙'); ok2 = true; } catch (e) { ok2 = false; }
    const v = WA.mend.view('甲', '乙');
    const mm = WA.mend.mark('甲', { with: '乙', hurt: '同一件事仍未了结' });
    return (v.reason === 'missing' && mm.ok === true && ok2 === true) ? 'no-phantom'
      : 'x:' + [v.reason, mm.ok, ok2].join(',');
  }
};

const N1 = [
  { k: 'hurt',  p: PROBES.pGate,   okk: 'mark-gated',             note: '伤害可以不写明' },
  { k: 'acc',   p: PROBES.pAcc,    okk: 'kinds-gated',            note: '道歉不要对方接受' },
  { k: 'accby', p: PROBES.pAcc,    okk: 'kinds-gated',            note: '谁接受了不用写明' },
  { k: 'rcpt',  p: PROBES.pRcpt,   okk: 'receipt-required',       note: '没有回执也算补偿' },
  { k: 'kept',  p: PROBES.pKept,   okk: 'kept-required',          note: '守约不要证据' },
  { k: 'guar',  p: PROBES.pGuar,   okk: 'third-party-only',       note: '担保人可以是当事人自己' },
  { k: 'party', p: PROBES.pParty,  okk: 'party-only',             note: '别人可以代做修复' },
  { k: 'prog',  p: PROBES.pProg,   okk: 'progress-gated',         note: '进度不达标也能结案' },
  { k: 'auth',  p: PROBES.pAuth,   okk: 'relation-authorized-only', note: '结案自动改关系' },
  { k: 'cell',  p: PROBES.pCells,  okk: 'cells-bounded',          note: '手段格不按类型分格（四格退化成一根计数）' },
  { k: 'relief', p: PROBES.pClose, okk: 'relief-applied',         note: '关系步进自造刻度（落在 fondness 白名单之外）' },
  { k: 'delta', p: PROBES.pClose,  okk: 'relief-applied',         note: '关系步进写死（同样落在白名单之外）' },
  { k: 'off',   p: PROBES.pOff,    okk: 'off-refused',            note: '关闭时仍登记' },
  { k: 'keep',  p: PROBES.pTerm,   okk: 'one-shot',               note: '结案不落状态（终态不存在）' },
  { k: 'hist',  p: PROBES.pIntent, okk: 'intent-closed',          note: '终态行不可读（不删行却看不见）' }
];
// 语义常量串：不以上列前缀开头即视为「非原版结论」
const BAD_PREFIX = ['x:', 'threw:'];
function isOk(got) {
  return typeof got === 'string' && BAD_PREFIX.every(function (p) { return got.indexOf(p) !== 0; });
}
function judge(a) {
  // ── A 静态段：登记链与装载面 ──
  const ev = readSrc('core/evict.js');
  const st = readSrc('core/store.js');
  const ix = readSrc('index.js');
  const rj = readSrc('tests/run.js');
  const td = readSrc('engines/tool-diag.js');
  const inj = readSrc('render/inject.js');
  const pn = readSrc('ui/panel.js');
  const fd = readSrc('engines/fondness.js');
  const src = readSrc(REL);
  a(ev.indexOf("'mend.threads'") >= 0, 'v2119/mend: [A1] evict.SITES 登记 mend.threads');
  a(st.indexOf("'mend.threads'") >= 0 && st.indexOf('mend: { threads: [] }') >= 0,
    'v2119/mend: [A2] store 骨架物化 mend 且 __BOUNDED_CAPS 登记同键');
  a(ix.indexOf("'engines/mend.js'") >= 0 && rj.indexOf("'engines/mend.js'") >= 0,
    'v2119/mend: [A3] index.js / tests/run.js 两处 LOAD 都登记');
  a(td.indexOf("'engines/mend.js': 'mend'") >= 0, 'v2119/mend: [A4] tool-diag MODULE_EXPORTS 登记');
  a(inj.indexOf("'plan', 'mend'") >= 0 && inj.indexOf('vis.mend && WA.mend') >= 0
    && inj.indexOf("'关系修复'") >= 0, 'v2119/mend: [A5] 注入源表与注入分支同批登记');
  a(pn.indexOf("mend: '关系修复'") >= 0, 'v2119/mend: [A6] 面板显示名登记');
  a(td.indexOf("'wa-mend-mark'") >= 0 && td.indexOf("'wa-mend-guarantor'") >= 0,
    'v2119/mend: [A7] 守卫表登记控件');
  a(src.indexOf('enabled: false, maxRows: 12, minProgress: 2, maxSteps: 3') >= 0,
    'v2119/mend: [A8] 总开关默认关');
  a(src.indexOf("const ACTS = ['apology', 'restitution', 'keeping', 'guarantee'];\n".trim().replace(/\n\s+/g, ' ')) >= 0 ||
    src.indexOf("const ACTS = ['apology', 'restitution', 'keeping', 'guarantee'];") >= 0,
    'v2119/mend: [A9] 四种手段是具名常量');
  a(src.indexOf("const TERMINAL = ['fulfilled', 'failed', 'dropped'];") >= 0,
    'v2119/mend: [A10] 终态是具名常量');
  a(src.indexOf('WA.registerModule(') >= 0 && src.indexOf('engines/mend.js') >= 0,
    'v2119/mend: [A11] 模块自注册');
  // 关系刻度必须是 fondness 白名单的子集（否则「成了却没变」）：两条真源码一起钉。
  a(fd.indexOf('const STEPS = [0.1, 0.3, 0.5, 0.8];') >= 0
    && src.indexOf('const RELIEF = { 1: 0.1, 2: 0.3, 3: 0.5, 4: 0.8 };') >= 0,
    'v2119/mend: [A12] 关系步进落在 fondness 步进白名单内');
  a(src.indexOf('rows-full') >= 0 && src.indexOf(A_EVICT || 'mend.threads') >= 0
    && src.indexOf('mend.threads') >= 0,
    'v2119/mend: [A13] 容量两道门同时存在（长度预检 + 站点挤出）');
  a(src.indexOf('autoForgive') < 0 && src.indexOf('autoMend') < 0 && src.indexOf('autoClose') < 0,
    'v2119/mend: [A14] 无「自动和好 / 自动结案」路径');
  a(/function close\(person, id, outcome, opts\)/.test(src) && src.indexOf('relation-not-authorized') >= 0,
    'v2119/mend: [A15] 结案改关系是显式授权（拒收码在）');
  // ── B 运行时段 ──
  Object.keys(PROBES).forEach(function (k) {
    const got = probeClean(PROBES[k]);
    a(isOk(got), 'v2119/mend: [B] 原版可用 :: ' + k + '（实 ' + got + '）');
  });
  // ── C 不变式段 ──
  const W = mkW(null);
  const mk = W.mend.mark('甲', { with: '乙', hurt: '在众人面前数落他' });
  a(mk.ok === true && typeof mk.id === 'string', 'v2119/mend: [C] 登记一次伤害得到行 id');
  const v0 = W.mend.view('甲', '乙');
  a(v0.ok === true && v0.status === 'open' && v0.progress === 0 && v0.need === 2
    && v0.missing.length === 4, 'v2119/mend: [C] 「还差什么」当场可答');
  const s1 = W.mend.step('甲', mk.id, 'apology', { accepted: true, acceptedBy: '乙', evidence: '口头上接受了' });
  a(s1.ok === true && s1.progress === 1 && s1.need === 2, 'v2119/mend: [C] 道歉成一步');
  const s2 = W.mend.step('甲', mk.id, 'guarantee', { by: '老王', evidence: '老王背书' });
  a(s2.ok === true && s2.progress === 2, 'v2119/mend: [C] 第三方担保成第二格');
  const v2 = W.mend.view('甲', '乙');
  a(v2.progress === 2 && v2.missing.length === 2 && v2.acts[0].done === true
    && v2.acts[1].done === false && v2.acts[0].evidence === '口头上接受了',
    'v2119/mend: [C] 格与证据逐格分列');
  const cl = W.mend.close('甲', mk.id, 'fulfilled', { applyRelation: true, note: '把事情说开了' });
  a(cl.ok === true && cl.status === 'fulfilled' && cl.relation && cl.relation.ok === true,
    'v2119/mend: [C] 达标且授权才结案并动关系');
  const v3 = W.mend.view('甲', '乙');
  a(v3.status === 'fulfilled' && v3.closed === true && v3.historical === true,
    'v2119/mend: [C] 终态行仍可读（失败/结案都是证据）');
  const f3 = W.fondness.read('乙');
  a(f3.ok === true && f3.value === 0.3, 'v2119/mend: [C] 关系确实变了（且落在白名单刻度上）');
  const m2 = W.mend.mark('甲', { with: '乙', hurt: '又一次' });
  a(m2.ok === true, 'v2119/mend: [C] 结案后可以再开一条（同一对人）');
  W.mend.close('甲', m2.id, 'failed', { reason: '对方不领情' });
  const vf = W.mend.view('甲', '乙');
  a(vf.status === 'failed' && vf.acts.every(function (x) { return x.done === false; }),
    'v2119/mend: [C] 失败的修复如实留痕、不删行');
  const sv = W.mend.statView();
  a(sv.rows === 2 && sv.byStatus.fulfilled === 1 && sv.byStatus.failed === 1 && sv.open === 0,
    'v2119/mend: [C] statView 分列容器读数');
  const caps = W.store.sizeCaps();
  a(caps['mend.threads'] && caps['mend.threads'].cap === 12, 'v2119/mend: [C] 容量登记可见');
  const arr = [];
  for (let i = 0; i < 15; i++) arr.push({ i: i });
  const rr = W.evict.array(arr, 'mend.threads', 12);
  a(rr.ok && rr.dropped === 3 && arr.length === 12, 'v2119/mend: [C] 站点「声明即执行」实测通过');
  const bb = W.mend.buildBlock();
  a(typeof bb === 'string' && bb === '', 'v2119/mend: [C] 没有未了结的伤害时注入块为空');
  const m3 = W.mend.mark('甲', { with: '乙', hurt: '又伤了一回' });
  const bb2 = W.mend.buildBlock();
  a(m3.ok === true && bb2.indexOf('[关系修复]') >= 0 && bb2.indexOf('尚缺：') >= 0
    && bb2.indexOf('修复也可能失败') >= 0, 'v2119/mend: [C] 注入块说清「尚缺什么」与「可能失败」');
  const beforePeople = JSON.stringify(W.store.get().people);
  W.mend.view('甲', '乙'); W.mend.statView(); W.mend.buildBlock();
  a(JSON.stringify(W.store.get().people) === beforePeople, 'v2119/mend: [C] 读取路径不写盘');
}
function runNegative(a) {
  a(BROKEN.length === 15 && new Set(BROKEN.map(function (x) { return x.key; })).size === 15,
    'v2119/mend: [N0] 破坏面覆盖 15 个互异锚点（原版实 ' + BROKEN.length + '）');
  BROKEN.forEach(function (s) {
    a(anchorHits(s) === 1, 'v2119/mend: [N0] 锚点在真源码中恰 1 次 :: ' + s.key);
  });
  N1.forEach(function (it) {
    const got = probeWith(BROKEN[B[it.k]], it.p);
    a(got !== it.okk, 'v2119/mend: [N1] ' + it.note + '（缺口复现；实测 ' + got + '）');
  });
  Object.keys(PROBES).forEach(function (k) {
    const got = probeClean(PROBES[k]);
    a(isOk(got), 'v2119/mend: [N2] 原版成立 :: ' + k + '（实 ' + got + '）');
  });
  a(probeWith(BROKEN[B['guar']], PROBES.pAcc) === 'kinds-gated', 'v2119/mend: [N3] 破坏担保门槛不影响道歉门槛');
  a(probeWith(BROKEN[B['rcpt']], PROBES.pKept) === 'kept-required', 'v2119/mend: [N3] 破坏回执门槛不影响守约门槛');
  a(probeWith(BROKEN[B['cell']], PROBES.pParty) === 'party-only', 'v2119/mend: [N3] 破坏手段分格不影响当事人判定');
  a(probeWith(BROKEN[B['prog']], PROBES.pOff) === 'off-refused', 'v2119/mend: [N3] 破坏进度门不影响总开关');
  a(probeWith(BROKEN[B['hist']], PROBES.pAuth) === 'relation-authorized-only', 'v2119/mend: [N3] 破坏终态可读不影响授权门槛');
  const okv = probeClean(PROBES.pClose);
  const badv = probeWith(BROKEN[B['relief']], PROBES.pClose);
  a(okv !== badv && okv === 'relief-applied',
    'v2119/mend: [N4] 关系落白名单判据非恒真（原版 ' + okv + ' / 破坏 ' + badv + '）');
  const ok2 = probeClean(PROBES.pProg);
  const bad2 = probeWith(BROKEN[B['prog']], PROBES.pProg);
  a(ok2 !== bad2 && ok2 === 'progress-gated',
    'v2119/mend: [N4] 进度门槛判据非恒真（原版 ' + ok2 + ' / 破坏 ' + bad2 + '）');
  const ok3 = probeClean(PROBES.pTerm);
  const bad3 = probeWith(BROKEN[B['keep']], PROBES.pTerm);
  a(ok3 !== bad3 && ok3 === 'one-shot',
    'v2119/mend: [N4] 只结一次判据非恒真（原版 ' + ok3 + ' / 破坏 ' + bad3 + '）');
}
function runAll(a) { judge(a); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('MEND-V2119: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('MEND-V2119: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits,
  PROBES: PROBES, mkW: mkW, probeClean: probeClean, probeWith: probeWith };

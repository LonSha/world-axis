#!/usr/bin/env node
// WorldAxis tests/plan-v2119.js -- 拓展计划 ① 专锁：人物多步计划与受挫重决策（v2.119.0）
//
// 拓展计划 ① 原文要点：目标必须能展开为**有限步数**的计划，每一步答得出「要什么、在谁之后、
//   在哪、卡住了改走哪条」；步数有上限且**不静默截断**；前置防环；「现在做不了」与「这条路走
//   不通」分开；受挫只标记并由调用方**显式改选**；拒收不消耗尝试次数；没有计划的人如实报无。
//
// 逐条守住（每条都是「写出来了、但某个条件下不会成立」）：
//   ① 只为已存在的 active 目标展开；② 步数超上限一律拒收（不静默截断）；③ 前置防环；
//   ④ 资源不足 ⇒ need-unmet 且不改状态；org 缺席 ⇒ org-missing；⑤ 受阻只标记；
//   ⑥ tries-exhausted 可达；⑦ refused 不计 tries；⑧ 无计划报 no-plan、终态不算有计划；
//   ⑨ 关闭时拒收且零台账；容器有界且挤出有账；⑩ advance 只交出当前步、不执行。
//
// 每条判据两向自证：真源码成绿 / 就地破坏现形（只改内存副本，零文件改写）。
//   N0 锚点在真源码恰 1 次 · N1 破坏现形 · N2 原版成绿 · N3 破坏互不串扰 · N4 判据非恒真。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__plan2119_';
const REL = 'engines/plan.js';

// ── 破坏锚点（逐字取自真源码，各恰 1 次）──
const A_MAX   = "    if (list.length > cap) return { ok: false, reason: 'too-many-steps', want: list.length, cap: cap };";
const A_AFTER = "      if (!hit || hit.seq >= norm[i].seq) return { ok: false, at: i, after: a };";
const A_GOAL  = "    if (!goal) { noteFault('unknown-goal'); return { ok: false, reason: 'unknown-goal', goalId: clean(goalId, 60) }; }";
const A_STOCK = "      if (st === null) return { ok: false, reason: 'org-missing', resource: cur.need.resource };";
const A_UNMET = "        return { ok: false, reason: 'need-unmet', resource: cur.need.resource,";
const A_TRIES = "    if ((row.tries || 0) >= cfg.maxTries) {";
const A_LOCK  = "        r.status = 'active'; r.reason = 'retrying';";
const A_REF   = "        s.status = 'pending'; s.at = now; s.reason = clean(o.reason || 'refused', 40);\n        r.reason = s.reason;";
const A_NOPLN = "  function planOf(personName, root) {\n    const who = clean(personName, 60), id = 'p_' + who;\n    return rowsOf(root).filter(function (r) { return r && r.personId === id && FINAL.indexOf(r.status) < 0; })[0] || null;\n  }";
const A_RUN   = "  function rechoose(personName, steps) {\n    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }";
const A_EVICT = "      WA.evict.array(draft.plan.plans, 'plan.plans', cfg.maxPlans);";
const A_OFF   = "    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }\n    const who = clean(personName, 60);\n    if (!who) { noteFault('missing-person'); return { ok: false, reason: 'missing-person' }; }";

const BROKEN = [
  { rel: REL, key: 'max', from: A_MAX, to: "    if (false) return { ok: false, reason: 'too-many-steps', want: list.length, cap: cap };",
    why: '步数不设上限 ⇒ 说好的「有限步数」被静默截断' },
  { rel: REL, key: 'after', from: A_AFTER, to: "      if (!hit) return { ok: false, at: i, after: a };",
    why: '前置不要求更小序号 ⇒ 环形成，「现在该做哪一步」永远答不出' },
  { rel: REL, key: 'goal', from: A_GOAL, to: "    if (false) { noteFault('unknown-goal'); return { ok: false, reason: 'unknown-goal', goalId: clean(goalId, 60) }; }",
    why: '目标不存在也能展开 ⇒ 顺手造出他没有的意图' },
  { rel: REL, key: 'stock', from: A_STOCK, to: "      if (false) return { ok: false, reason: 'org-missing', resource: cur.need.resource };",
    why: '库存真源缺席时当作充足 ⇒ 无据也能开工' },
  { rel: REL, key: 'unmet', from: A_UNMET, to: "        return { ok: true, reason: 'need-unmet', resource: cur.need.resource,",
    why: '资源不足被吞掉 ⇒ 「现在做不了」被当成已开工' },
  { rel: REL, key: 'tries', from: A_TRIES, to: "    if (false) {",
    why: '重试无上限 ⇒ 受挫计划无限重试（tries-exhausted 该报而不报）' },
  { rel: REL, key: 'blk', from: A_LOCK, to: "        out = { ok: false, reason: 'blocked', id: r.id }; return false;",
    why: '受阻变回锁 ⇒ 重试入口消失，tries 永远到不了上限（有上限形同虚设）' },
  { rel: REL, key: 'ref', from: A_REF, to: "        s.status = 'blocked'; s.at = now; s.reason = clean(o.reason || 'refused', 40);\n        r.reason = s.reason;",
    why: '被拒被记成受阻 ⇒ 拒收消耗了他的尝试次数（谁的错分不出来）' },
  { rel: REL, key: 'nopln', from: A_NOPLN, to: "  function planOf(personName, root) {\n    const who = clean(personName, 60), id = 'p_' + who;\n    return rowsOf(root).filter(function (r) { return r && r.personId === id; })[0] || null;\n  }",
    why: '终态计划也算「有」⇒ 已放弃的人被当成还有计划在跑' },
  { rel: REL, key: 'run', from: A_RUN, to: "  function rechoose(personName, steps) {\n    if (false) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }",
    why: '关闭时改选也放行 ⇒ 关掉总开关仍能长出台账' },
  { rel: REL, key: 'off', from: A_OFF, to: "    if (false) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }\n    const who = clean(personName, 60);\n    if (!who) { noteFault('missing-person'); return { ok: false, reason: 'missing-person' }; }",
    why: '关闭时仍展开 ⇒ 总开关形同虚设' }
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

// ── 夹具：甲（有 active 目标 g1 与一个已完成目标 g2、银元 3）/ 乙（无目标）──
const S3 = [
  { kind: 'work', text: '去码头搬货' },
  { kind: 'work', text: '攒够路费', need: { resource: '银元', amount: 3 } },
  { kind: 'move', text: '搭船去乙地', after: '1', fallback: '改走陆路' }
];
function reset(WA) {
  WA.plan.setSettings({ enabled: false, maxSteps: 4, maxPlans: 12, maxTries: 3 });
  WA.store.transact(function (d) {
    d.people = {
      'p_甲': { id: 'p_甲', name: '甲', resources: { '银元': 3 }, updatedAt: 1,
        life: { goals: [{ id: 'g1', text: '攒钱去乙地', status: 'active' },
                        { id: 'g2', text: '旧目标', status: 'done' }], commitments: [], schedule: [] } },
      'p_乙': { id: 'p_乙', name: '乙', resources: {}, updatedAt: 1,
        life: { goals: [], commitments: [], schedule: [] } }
    };
    d.plan = { plans: [] };
  }, TAG + 'reset');
  WA.plan.setSettings({ enabled: true, maxSteps: 4, maxPlans: 12, maxTries: 3 });
  return WA;
}
function stock(WA, who, res, n) {
  WA.store.transact(function (d) {
    d.people['p_' + who].resources = {};
    if (n) d.people['p_' + who].resources[res] = n;
  }, TAG + 'stock');
}
function toStep2(WA) {
  WA.plan.expand('甲', 'g1', S3);
  WA.plan.advance('甲');
  WA.plan.settle('甲', 'done');
}

const PROBES = {
  pGated: function (env) {
    const WA = mkW(env.ov);
    const r1 = WA.plan.expand('甲', 'nope', S3);
    const r2 = WA.plan.expand('甲', 'g2', S3);
    const r3 = WA.plan.expand('丙', 'g1', S3);
    const n = WA.plan.statView().rows;
    return (r1.reason === 'unknown-goal' && r2.reason === 'goal-not-active'
      && r3.reason === 'missing-person' && n === 0) ? 'gate-kept'
      : 'x:' + [r1.reason, r2.reason, r3.reason, n].join(',');
  },
  pMax: function (env) {
    const WA = mkW(env.ov);
    const five = S3.concat([{ kind: 'x', text: '第四步' }, { kind: 'x', text: '第五步' }]);
    const r = WA.plan.expand('甲', 'g1', five);
    return (r.ok === false && r.reason === 'too-many-steps' && r.cap === 4 && r.want === 5
      && WA.plan.statView().rows === 0) ? 'reject-not-truncate' : 'x:' + JSON.stringify(r);
  },
  pAfter: function (env) {
    const WA = mkW(env.ov);
    const cyc = [{ kind: 'a', text: '第一步', after: '1' }, { kind: 'b', text: '第二步', after: '0' }];
    const r = WA.plan.expand('甲', 'g1', cyc);
    return (r.ok === false && r.reason === 'bad-after' && WA.plan.statView().rows === 0)
      ? 'cycle-refused' : 'x:' + JSON.stringify(r);
  },
  pOrgGone: function (env) {
    const WA = mkW(env.ov);
    toStep2(WA);
    WA.store.transact(function (d) { delete d.people['p_甲']; }, TAG + 'gone');
    const r = WA.plan.advance('甲');
    return (r.reason === 'org-missing' && r.resource === '银元') ? 'org-gated' : 'x:' + JSON.stringify(r);
  },
  pUnmet: function (env) {
    const WA = mkW(env.ov);
    toStep2(WA);
    stock(WA, '甲', '银元', 1);
    const r = WA.plan.advance('甲');
    const c = WA.plan.current('甲');
    return (r.ok === false && r.reason === 'need-unmet' && r.have === 1 && r.want === 3
      && c.ok === true && c.seq === 1)
      ? 'need-unmet-no-state' : 'x:' + JSON.stringify(r);
  },
  pTries: function (env) {
    const WA = mkW(env.ov);
    WA.plan.expand('甲', 'g1', S3);
    for (let i = 0; i < 3; i++) {
      WA.plan.advance('甲');
      WA.plan.settle('甲', 'blocked', { reason: '路断' });
    }
    const r = WA.plan.advance('甲');
    return (r.reason === 'tries-exhausted' && r.tries === 3) ? 'tries-capped' : 'x:' + JSON.stringify(r);
  },
  pRetry: function (env) {
    const WA = mkW(env.ov);
    WA.plan.expand('甲', 'g1', S3);
    WA.plan.advance('甲');
    WA.plan.settle('甲', 'blocked', { reason: '路断' });
    const r = WA.plan.advance('甲');
    // 重试成功后受阻被复位成待办、计划回到 active（「受阻是标记不是锁」）。
    const v = WA.plan.view('甲');
    return (r.ok === true && r.seq === 0 && r.tries === 1 && v.status === 'active'
      && v.steps[0].status === 'running')
      ? 'retry-allowed' : 'x:' + JSON.stringify(r) + '/v:' + v.status + '/' + v.steps[0].status;
  },
  pRef: function (env) {
    const WA = mkW(env.ov);
    WA.plan.expand('甲', 'g1', S3);
    WA.plan.advance('甲');
    const r = WA.plan.settle('甲', 'refused', { reason: '被拒' });
    const c = WA.plan.current('甲');
    return (r.ok === true && r.tries === 0 && c.ok === true && c.seq === 0 && c.tries === 0)
      ? 'refused-free' : 'x:' + JSON.stringify(r) + '/c:' + JSON.stringify(c);
  },
  pNoPlan: function (env) {
    const WA = mkW(env.ov);
    const a = WA.plan.current('乙');
    const b = WA.plan.advance('乙');
    const v = WA.plan.view('乙');
    const r = WA.plan.expand('乙', 'g1', S3);
    return (a.reason === 'no-plan' && b.reason === 'no-plan' && v.reason === 'no-plan'
      && r.reason === 'unknown-goal' && WA.plan.statView().rows === 0) ? 'no-plan-honest'
      : 'x:' + [a.reason, b.reason, v.reason, r.reason].join(',');
  },
  pFinal: function (env) {
    const WA = mkW(env.ov);
    WA.plan.expand('甲', 'g1', [{ kind: 'work', text: '单独一步' }]);
    WA.plan.advance('甲');
    const d = WA.plan.settle('甲', 'done');
    const c = WA.plan.current('甲');
    const n = WA.plan.statView().rows;
    return (d.ok === true && d.status === 'done' && c.reason === 'no-plan' && n === 1)
      ? 'final-kept-visible' : 'x:' + JSON.stringify(d) + '/c:' + c.reason + '/n:' + n;
  },
  pOff: function (env) {
    const WA = mkW(env.ov);
    WA.plan.setSettings({ enabled: false });
    const e = WA.plan.expand('甲', 'g1', S3);
    const a = WA.plan.advance('甲');
    const s = WA.plan.settle('甲', 'done');
    return (e.reason === 'disabled' && a.reason === 'disabled' && s.reason === 'disabled'
      && WA.plan.statView().rows === 0) ? 'off-refused'
      : 'x:' + [e.reason, a.reason, s.reason, WA.plan.statView().rows].join(',');
  },
  pRechoose: function (env) {
    const WA = mkW(env.ov);
    WA.plan.expand('甲', 'g1', S3);
    WA.plan.advance('甲');
    WA.plan.settle('甲', 'blocked', { reason: '路断' });
    WA.plan.setSettings({ enabled: false });
    const r = WA.plan.rechoose('甲', S3);
    return (r.reason === 'disabled' && WA.plan.statView().rows === 1) ? 'rechoose-off' : 'x:' + JSON.stringify(r);
  },
  pEvict: function (env) {
    const WA = mkW(env.ov);
    let ok = 0;
    for (let i = 0; i < 15; i++) {
      const r = WA.plan.expand('甲', 'g1', S3);
      if (r.ok) { ok++; WA.plan.abandon('甲', 'x'); }
    }
    const n = WA.plan.statView().rows;
    const cap = WA.store.sizeCaps()['plan.plans'].cap;
    return (n === 12 && ok === 12 && n <= cap) ? 'plans-bounded' : 'x:n:' + n + '/ok:' + ok;
  },
  pNoSide: function (env) {
    const WA = mkW(env.ov);
    const before = JSON.stringify(WA.store.get().people);
    WA.plan.expand('甲', 'g1', S3);
    const cur = WA.plan.current('甲');
    WA.plan.candidates('甲');
    WA.plan.view('甲');
    const after = JSON.stringify(WA.store.get().people);
    return (before === after && cur.ok === true) ? 'read-only-people' : 'dirty';
  }
};

const N1 = [
  { k: 'max',   p: PROBES.pMax,      okk: 'reject-not-truncate', note: '步数不设上限' },
  { k: 'after', p: PROBES.pAfter,    okk: 'cycle-refused',       note: '前置防环失效' },
  { k: 'goal',  p: PROBES.pGated,    okk: 'gate-kept',           note: '目标不存在也能展开' },
  { k: 'stock', p: PROBES.pOrgGone,  okk: 'org-gated',           note: '库存真源缺席时装作充足' },
  { k: 'unmet', p: PROBES.pUnmet,    okk: 'need-unmet-no-state', note: '资源不足被吞掉' },
  { k: 'tries', p: PROBES.pTries,    okk: 'tries-capped',        note: '重试无上限' },
  { k: 'blk',   p: PROBES.pRetry,    okk: 'retry-allowed',       note: '受阻变回锁（重试入口消失）' },
  { k: 'ref',   p: PROBES.pRef,      okk: 'refused-free',        note: '被拒计成受阻' },
  { k: 'nopln', p: PROBES.pFinal,    okk: 'final-kept-visible',  note: '终态计划也算还有计划' },
  { k: 'run',   p: PROBES.pRechoose, okk: 'rechoose-off',        note: '关闭时改选放行' },
  { k: 'off',   p: PROBES.pOff,      okk: 'off-refused',         note: '关闭时仍展开' }
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
  const src = readSrc(REL);
  a(ev.indexOf("'plan.plans'") >= 0, 'v2119/plan: [A1] evict.SITES 登记 plan.plans');
  a(st.indexOf("'plan.plans'") >= 0 && st.indexOf('plan: { plans: [] }') >= 0,
    'v2119/plan: [A2] store 骨架物化 plan 且 __BOUNDED_CAPS 登记同键');
  a(ix.indexOf("'engines/plan.js'") >= 0 && rj.indexOf("'engines/plan.js'") >= 0,
    'v2119/plan: [A3] index.js / tests/run.js 两处 LOAD 都登记');
  a(td.indexOf("'engines/plan.js': 'plan'") >= 0, 'v2119/plan: [A4] tool-diag MODULE_EXPORTS 登记');
  a(inj.indexOf("'plan', 'mend'") >= 0 && inj.indexOf('vis.plan && WA.plan') >= 0,
    'v2119/plan: [A5] 注入源表与注入分支同批登记');
  a(pn.indexOf("plan: '人物计划'") >= 0, 'v2119/plan: [A6] 面板显示名登记');
  a(td.indexOf("'wa-plan-enabled'") >= 0 && td.indexOf("'wa-plan-abandon'") >= 0,
    'v2119/plan: [A7] 守卫表登记控件');
  a(src.indexOf('enabled: false, maxSteps: 4, maxPlans: 12, maxTries: 3') >= 0,
    'v2119/plan: [A8] 总开关默认关');
  a(src.indexOf("const STATUS = ['active', 'blocked', 'done', 'abandoned'];") >= 0
    && src.indexOf("const FINAL = ['done', 'abandoned'];") >= 0,
    'v2119/plan: [A9] 状态与终态是具名常量');
  a(src.indexOf("WA.registerModule('engines/plan.js'") >= 0, 'v2119/plan: [A10] 模块自注册');
  a(/function rechoose\(personName, steps\)/.test(src) && src.indexOf('autoRechoose') < 0,
    'v2119/plan: [A11] 改选只有一个显式入口（无自动挑替代路）');
  // 两道门互为冗余（长度预检 + 挤出调用）：把 plans-full 预检拆掉行为不变，
  //   因为挤出仍在同一上限上生效 —— 留一条永远绿的假破坏项比不设更坏（同 B8 [A11] 口径）。
  a(src.indexOf('plans-full') >= 0 && src.indexOf(A_EVICT) >= 0,
    'v2119/plan: [A12] 容量两道门同时存在（长度预检 + 站点挤出）');
  // ── B 运行时段 ──
  Object.keys(PROBES).forEach(function (k) {
    const got = probeClean(PROBES[k]);
    a(isOk(got), 'v2119/plan: [B] 原版可用 :: ' + k + '（实 ' + got + '）');
  });
  // ── C 不变式段 ──
  const W = mkW(null);
  const e = W.plan.expand('甲', 'g1', S3);
  a(e.ok === true && e.steps === 3, 'v2119/plan: [C] 展开得到 3 步计划');
  const c0 = W.plan.current('甲');
  a(c0.ok === true && c0.seq === 0 && c0.status === 'active', 'v2119/plan: [C] 当前步是第 0 步');
  const ad = W.plan.advance('甲');
  a(ad.ok === true && ad.seq === 0, 'v2119/plan: [C] 交出当前步并标 running');
  const s1 = W.plan.settle('甲', 'done');
  a(s1.ok === true && s1.status === 'active' && s1.next === 1, 'v2119/plan: [C] 完成一步前进，计划仍 active');
  const s2 = W.plan.settle('甲', 'done');
  a(s2.ok === false && s2.reason === 'not-running', 'v2119/plan: [C] 没在跑的步不能结算');
  const ad2 = W.plan.advance('甲');
  a(ad2.ok === true && ad2.seq === 1 && ad2.need && ad2.need.amount === 3, 'v2119/plan: [C] 第 2 步带出资源需求');
  const s3 = W.plan.settle('甲', 'blocked', { reason: '路断' });
  a(s3.ok === true && s3.status === 'blocked' && s3.tries === 1, 'v2119/plan: [C] 受阻计一次尝试');
  const cand = W.plan.candidates('甲');
  a(cand.ok === true && cand.stuck.seq === 1 && cand.exhausted === false
    && cand.hint.indexOf('未声明改选路径') >= 0, 'v2119/plan: [C] 候选只读且如实说「没有改选路径」');
  const rc = W.plan.rechoose('甲', S3);
  a(rc.ok === true && rc.kept === 1 && rc.steps === 3, 'v2119/plan: [C] 改选保留已完成的步');
  const v = W.plan.view('甲');
  a(v.ok === true && v.steps.length === 4 && v.status === 'active' && v.tries === 0,
    'v2119/plan: [C] 改选后尝试次数清零、步数 = 已完成 + 新批');
  W.store.transact(function (d) {
    d.people['p_乙'].life.goals.push({ id: 'g9', text: '乙的事', status: 'active' });
  }, TAG + 'g9');
  const eb = W.plan.expand('乙', 'g9', [{ kind: 'x', text: '乙的第一步' }]);
  const ca = W.plan.current('甲');
  const cb = W.plan.current('乙');
  a(eb.ok === true && ca.ok === true && cb.ok === true && ca.id !== cb.id,
    'v2119/plan: [C] 两个人各有计划且不串人');
  const stv = W.plan.statView();
  a(stv.rows === 2 && typeof stv.byStatus === 'object' && stv.blocked === 0,
    'v2119/plan: [C] statView 分列容器读数');
  const caps = W.store.sizeCaps();
  a(caps['plan.plans'] && caps['plan.plans'].cap === 12, 'v2119/plan: [C] 容量登记可见');
  const arr = [];
  for (let i = 0; i < 15; i++) arr.push({ i: i });
  const rr = W.evict.array(arr, 'plan.plans', 12);
  a(rr.ok && rr.dropped === 3 && arr.length === 12, 'v2119/plan: [C] 站点「声明即执行」实测通过');
  const bb = W.plan.buildBlock();
  a(typeof bb === 'string' && bb.indexOf('[人物计划]') >= 0 && bb.indexOf('受阻不等于放弃') >= 0,
    'v2119/plan: [C] 注入块把受阻与放弃分开说');
}
function runNegative(a) {
  a(BROKEN.length === 11 && new Set(BROKEN.map(function (x) { return x.key; })).size === 11,
    'v2119/plan: [N0] 破坏面覆盖 11 个互异锚点');
  BROKEN.forEach(function (s) {
    a(anchorHits(s) === 1, 'v2119/plan: [N0] 锚点在真源码中恰 1 次 :: ' + s.key);
  });
  N1.forEach(function (it) {
    const got = probeWith(BROKEN[B[it.k]], it.p);
    a(got !== it.okk, 'v2119/plan: [N1] ' + it.note + '（缺口复现；实测 ' + got + '）');
  });
  Object.keys(PROBES).forEach(function (k) {
    const got = probeClean(PROBES[k]);
    a(isOk(got), 'v2119/plan: [N2] 原版成立 :: ' + k + '（实 ' + got + '）');
  });
  a(probeWith(BROKEN[B.goal], PROBES.pAfter) === 'cycle-refused', 'v2119/plan: [N3] 破坏目标准入不影响防环');
  a(probeWith(BROKEN[B.ref], PROBES.pMax) === 'reject-not-truncate', 'v2119/plan: [N3] 破坏被拒口径不影响步数上限');
  a(probeWith(BROKEN[B.run], PROBES.pNoPlan) === 'no-plan-honest', 'v2119/plan: [N3] 破坏改选开关不影响无计划诚实');
  a(probeWith(BROKEN[B.nopln], PROBES.pMax) === 'reject-not-truncate', 'v2119/plan: [N3] 破坏终态过滤不影响步数上限');
  a(probeWith(BROKEN[B.tries], PROBES.pRef) === 'refused-free', 'v2119/plan: [N3] 破坏重试上限不影响被拒免费');
  const okv = probeClean(PROBES.pMax);
  const badv = probeWith(BROKEN[B.max], PROBES.pMax);
  a(okv !== badv && okv === 'reject-not-truncate', 'v2119/plan: [N4] 步数上限判据非恒真（原版 ' + okv + ' / 破坏 ' + badv + '）');
  const ok2 = probeClean(PROBES.pTries);
  const bad2 = probeWith(BROKEN[B.tries], PROBES.pTries);
  a(ok2 !== bad2 && ok2 === 'tries-capped', 'v2119/plan: [N4] 重试上限判据非恒真（原版 ' + ok2 + ' / 破坏 ' + bad2 + '）');
  const ok3 = probeClean(PROBES.pRef);
  const bad3 = probeWith(BROKEN[B.ref], PROBES.pRef);
  a(ok3 !== bad3 && ok3 === 'refused-free', 'v2119/plan: [N4] 被拒不计次判据非恒真（原版 ' + ok3 + ' / 破坏 ' + bad3 + '）');
}
function runAll(a) { judge(a); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('PLAN-V2119: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('PLAN-V2119: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits,
  PROBES: PROBES, mkW: mkW, probeClean: probeClean, probeWith: probeWith };

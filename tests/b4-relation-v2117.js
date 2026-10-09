#!/usr/bin/env node
// WorldAxis tests/b4-relation-v2117.js -- B4 专锁：关系经历与修复（v2.117.0）
//
// 规划 02 的 B4 原文：「复用 bonds/shadow/affect/temperament 及相关竞争模块。新增重点是让已有经历
//   成为后续决策输入……每次重要经历有参与者、各自认知、相关承诺、实际行为及来源：一次迟到可以
//   客观成立，但『故意不来』只是一方判断。把无意失约、隐瞒、主动背弃和不得已中断区分开，
//   关系反应由人物认知解释，后续证据能够更新解释……历史事件保留，当前关系可以恢复，
//   曾经发生过的事不因数值回升消失。重复收到道歉不无限刷关系收益。」
//
// 落点 engines/shadow.js（既有「关系经历与承诺的深化」模块）。**不加新模块、不加新容器**：
//   经历仍落 `shadow.experiences`（cap 20 已登记、注入面 buildBlock 直接可见）。
//
// 本锁逐条守住的语义 —— 每一条都是「写出来了、但某个条件下不会成立」：
//   ① **客观行为与各方认知分开**：同一件事上，客观可以是「无意失约」而某人认定「故意不来」；
//      没给认知的人**不得被推出一份看法**（认知不对称是本质，不是缺省填充）。
//   ② **五型分离**：「不得已中断」与「主动背弃」必须答得出区别——合成一个「没做到」，
//      就再也答不出「他是被拦住了还是压根没打算来」。
//   ③ **只有当事人能有看法**：非当事人既不能持有认知，也不能被投影出判断。
//   ④ **修正必须有来源**（没有来源的「更正」只是另一次传言），同义重复零变化，
//      改动进 history 留痕。
//   ⑤ **补救双向且需前情**：没人提过就没有可接受的；重复同类且未被接受的补救零变化
//      （「重复道歉无限刷」这条纪律在写侧就成立）。
//   ⑥ **历史不可抹**：接受补救只改判断，客观行为一字不改；真正的资源损失单独算，
//      归还被接受之后才从此人视角消失。
//
// 每条判据两向自证：真源码成绿 / 就地破坏现形。
//   N0 锚点在真源码恰 1 次 · N1 破坏现形 · N2 原版成绿 · N3 破坏互不串扰 · N4 判据非恒真。
// 破坏只改内存副本（srcOverride），零文件改写。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__b4r2117_';
const REL = 'engines/shadow.js';

// ── 破坏锚点（逐字取自真源码，各恰 1 次）──
const A_RSTRAY  = "    const stray = vkeys.filter(function (k) { return nm.indexOf(clean(k, 60)) < 0; });";
const A_BEHAV   = "    if (NOTICE.indexOf(behavior) < 0) return { ok: false, reason: 'bad-behavior', notice: NOTICE.slice() };";
const A_NOVIEW  = "    if (!v) return { ok: false, reason: 'no-view', what: row.what, behavior: row.behavior, outcome: row.outcome };";
const A_SRC     = "    if (!source) return { ok: false, reason: 'missing-source' };";
const A_NOC     = "    if (cur && cur.noticed === to) { stat.blocked++; stat.lastReason = 'no-change'; return { ok: false, reason: 'no-change', noticed: to }; }";
const A_DUP     = "    if (dup) { stat.blocked++; stat.lastReason = 'no-new-remedy'; return { ok: false, reason: 'no-new-remedy', kind: kind, by: by }; }";
const A_NVW     = "    if (!liveView(row, who)) return { ok: false, reason: 'no-view', what: row.what };";
const A_ACC     = "    if (!pend) { stat.blocked++; stat.lastReason = 'nothing-to-accept'; return { ok: false, reason: 'nothing-to-accept', what: row.what }; }";
const A_BEHKEEP = "      t.views[who] = { noticed: 'kept', note: r.note, source: 'remedy:' + r.kind, at: clockNow('shadow') };";
const A_LOSS    = "      lossUnsettled: (row.behavior === 'broken' || row.behavior === 'forced') && !paid,";

const BROKEN = [
  // ① 非当事人也能被写进认知（客观面被外人污染）
  { key: 'rstray', from: A_RSTRAY, to: "    const stray = [];" },
  // ② 行为五型不校验 ⇒ 「不得已」与「主动背弃」混成一个值
  { key: 'behav', from: A_BEHAV,
    to: "    if (false) return { ok: false, reason: 'bad-behavior', notice: NOTICE.slice() };\n    if (NOTICE.indexOf(behavior) < 0) notice = behavior;" },
  // ③ 没有认知的人被推出一份（认知对称化）
  { key: 'noview', from: A_NOVIEW,
    to: "    if (!v) { out = null; return { ok: true, what: row.what, behavior: row.behavior, outcome: row.outcome, noticed: row.behavior, note: '', source: '', repaired: row.behavior === 'kept', pendingRemedy: '', lossUnsettled: false, history: [] }; }" },
  // ④ 无来源的「更正」也改判断
  { key: 'src', from: A_SRC, to: "    if (false) return { ok: false, reason: 'missing-source' };" },
  // ⑤ 同义重复也重写（判断可被无意义地刷新）
  { key: 'noc', from: A_NOC, to: "    if (false) { stat.blocked++; return { ok: false, reason: 'no-change', noticed: to }; }" },
  // ⑥ 重复同类补救不再拦 ⇒ 重复道歉可以无限刷
  { key: 'dup', from: A_DUP, to: "    if (false) { stat.blocked++; return { ok: false, reason: 'no-new-remedy', kind: kind, by: by }; }" },
  // ⑦ 没有看法的人也能「接受」补救 ⇒ 没听说过的事也能和解
  { key: 'nvw', from: A_NVW, to: "    if (false) return { ok: false, reason: 'no-view', what: row.what };" },
  // ⑧ 没听说过的人也能把和解写进自己的认知 ⇒ 和解不要求前情
  //   注意：**「能不能接受」这件事不靠这一道闸担着**。拆掉本行之后，事务内的同类复检
  //   仍会拒；两道一起拆则会写 `undefined.accepted` 抛错回滚（实测三层互补）。
  //   也就是说这一行唯一真正承载的契约是**拒绝必须留痕**（被拒的东西写不存档，
  //   「拒过」只能从观测面看见 —— v2.63.0 纪律）。破坏就按它真正承载的那条来定义。
  { key: 'acc', from: A_ACC, to: "    if (!pend) { stat.lastReason = 'nothing-to-accept'; return { ok: false, reason: 'nothing-to-accept', what: row.what }; }" },
  // ⑨ 接受补救顺带把历史行为也改成 kept（经历过的事被抹平）
  { key: 'behkeep', from: A_BEHKEEP,
    to: "      t.behavior = 'kept';\n" + A_BEHKEEP },
  // ⑩ 损失判据恒假 ⇒ 真正的资源损失在视角里凭空消失
  { key: 'loss', from: A_LOSS, to: "      lossUnsettled: false," }
];
const B = {};
BROKEN.forEach(function (s, i) { B[s.key] = i; });

const OK = {
  obj: 'obj-subjective-split', behav: 'notice-five', party: 'parties-only',
  revise: 'revise-gated', remedy: 'remedy-gated', loss: 'history-kept',
  read: 'read-only', legacy: 'legacy-intact'
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

// ── 夹具：只清关系面（这是 B4 的输入面），开关打开 ─────────────────────
function fix(WA) {
  WA.store.transact(function (d) {
    d.shadow = { rows: [], experiences: [] };
    d.people = {};
    d.bonds = { rows: [] };
  }, TAG + 'seed');
  WA.shadow.setSettings({ enabled: true });
  return { t: shape(WA) };
}
function dig(v) {
  if (Array.isArray(v)) return '[' + v.length + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().join(',') + '}';
  return String(v);
}
/** 只读面指纹：关系经历（含各方认知键集）+ 秘密 + 人物行 + 关系六型 + 行动台账。 */
function shape(WA) {
  const st = WA.store.get();
  const out = [];
  const sh = st.shadow || {};
  ['rows', 'experiences'].forEach(function (k) { out.push('shadow.' + k + ':' + dig(sh[k])); });
  out.push('experiences.detail:' + (sh.experiences || []).map(function (x) {
    if (!x) return '-';
    return [x.what, x.behavior, x.outcome, Object.keys(x.views || {}).sort().join('+'),
      Object.keys(x.views || {}).sort().map(function (k) { return (x.views[k] || {}).noticed; }).join('+'),
      (x.remedies || []).map(function (r) { return r.kind + (r.accepted ? '!' : ''); }).join(','),
      (x.history || []).length].join('/');
  }).join(';'));
  out.push('people:' + dig(st.people));
  out.push('bonds:' + dig(st.bonds));
  out.push('acts:' + JSON.stringify(st.acts || null));
  out.push('worldFacts:' + dig(st.worldFacts));
  return out.join('|');
}
function EXP(WA) { return ((WA.store.get().shadow || {}).experiences) || []; }
function expOf(WA, what) { return EXP(WA).filter(function (x) { return x && x.what === what; }).pop() || null; }

// ── 探针 ──────────────────────────────────────────────────────────────

// P1 客观与认知分开
function pObj(WA) {
  fix(WA);
  const r = WA.shadow.recordExperience('甲', '乙', { what: '18点会面', behavior: 'unintended', outcome: 'kept',
    note: '封路', views: { '乙': { noticed: 'broken', note: '他故意不来', source: '亲眼' } } });
  if (!r.ok) return 'record:' + r.reason;
  const b = WA.shadow.stanceOf('乙', '甲', '乙', '18点会面');
  if (!b.ok || b.noticed !== 'broken' || b.behavior !== 'unintended') return 'view:' + JSON.stringify([b.noticed, b.behavior]);
  // 客观已记在案，但**没给认知的人不得被推出看法**
  const a = WA.shadow.stanceOf('甲', '甲', '乙', '18点会面');
  if (a.ok !== false || a.reason !== 'no-view' || a.behavior !== 'unintended') return 'self:' + JSON.stringify(a);
  const p = WA.shadow.stanceOf('丙', '甲', '乙', '18点会面');
  if (p.ok !== false || p.reason !== 'not-a-party') return 'outsider:' + JSON.stringify(p);
  if (Object.keys(expOf(WA, '18点会面').views).join(',') !== '乙') return 'views-keys';
  return OK.obj;
}

// P2 五型分离
function pBehav(WA) {
  fix(WA);
  if (WA.shadow.NOTICE.join(',') !== 'kept,unintended,concealed,broken,forced') return 'notice:' + WA.shadow.NOTICE.join(',');
  const s = shape(WA);
  const bad = WA.shadow.recordExperience('甲', '乙', { what: 'x', behavior: 'nonsense' });
  if (bad.ok !== false || bad.reason !== 'bad-behavior') return 'bad:' + bad.reason;
  if (shape(WA) !== s) return 'bad-mutated';
  const badv = WA.shadow.recordExperience('甲', '乙', { what: 'x', behavior: 'kept', views: { '乙': { noticed: 'nonsense' } } });
  if (badv.ok !== false || badv.reason !== 'bad-behavior') return 'badv:' + badv.reason;
  WA.shadow.recordExperience('甲', '丙', { what: '送药', behavior: 'forced', outcome: 'broken', views: { '丙': { noticed: 'forced', source: '亲眼' } } });
  const st = WA.shadow.stanceOf('丙', '甲', '丙', '送药');
  // 「不得已」不得被读成「主动背弃」——这一格是本探针的全部意义
  if (!st.ok || st.behavior !== 'forced' || st.behavior === 'broken') return 'merged:' + JSON.stringify([st.behavior, st.outcome]);
  const five = WA.shadow.NOTICE.every(function (k) {
    return WA.shadow.recordExperience('丁', '戊', { what: 'e_' + k, behavior: k }).ok === true;
  });
  if (!five) return 'five-not-accepted';
  return OK.behav;
}

// P3 只有当事人能有看法
function pParty(WA) {
  fix(WA);
  const s = shape(WA);
  const r = WA.shadow.recordExperience('甲', '乙', { what: '会面', behavior: 'intended' === 'x' ? 'kept' : 'kept',
    views: { '丙': { noticed: 'kept' } } });
  if (r.ok !== false || r.reason !== 'not-a-party') return 'stray:' + r.reason;
  if (shape(WA) !== s) return 'stray-mutated';
  const u = WA.shadow.stanceOf('甲', '甲', '乙', '没有这件事');
  if (u.ok !== false || u.reason !== 'no-such-experience') return 'unknown:' + JSON.stringify(u);
  WA.shadow.recordExperience('甲', '乙', { what: '会面', behavior: 'kept', outcome: 'kept', views: { '乙': { noticed: 'kept', source: '亲眼' } } });
  const rows = EXP(WA);
  if (rows.length !== 1 || Object.keys(rows[0].views).join(',') !== '乙') return 'rows:' + rows.length;
  const outsider = WA.shadow.stanceOf('丙', '甲', '乙', '会面');
  if (outsider.ok !== false || outsider.reason !== 'not-a-party') return 'outsider:' + JSON.stringify(outsider);
  const self = WA.shadow.stanceOf('甲', '甲', '乙', '会面');
  if (self.ok !== false || self.reason !== 'no-view') return 'self:' + JSON.stringify(self);
  return OK.party;
}

// P4 修正需来源、同义零变化、留痕
function pRevise(WA) {
  fix(WA);
  WA.shadow.recordExperience('甲', '乙', { what: '会面', behavior: 'unintended', outcome: 'kept',
    views: { '乙': { noticed: 'broken', source: '亲眼' } } });
  const s0 = shape(WA);
  const noSrc = WA.shadow.reviseStance('乙', '甲', '乙', '会面', { noticed: 'forced' });
  if (noSrc.ok !== false || noSrc.reason !== 'missing-source') return 'nosrc:' + noSrc.reason;
  if (shape(WA) !== s0) return 'nosrc-mutated';
  const same = WA.shadow.reviseStance('乙', '甲', '乙', '会面', { noticed: 'broken', source: '亲眼' });
  if (same.ok !== false || same.reason !== 'no-change') return 'same:' + same.reason;
  if (shape(WA) !== s0) return 'same-mutated';
  const bad = WA.shadow.reviseStance('乙', '甲', '乙', '会面', { noticed: 'nonsense', source: 's' });
  if (bad.ok !== false || bad.reason !== 'bad-behavior') return 'bad:' + bad.reason;
  const okr = WA.shadow.reviseStance('乙', '甲', '乙', '会面', { noticed: 'forced', source: '封路告示', note: '路真断了' });
  if (!okr.ok || okr.from !== 'broken' || okr.to !== 'forced' || okr.history !== 1) return 'revise:' + JSON.stringify(okr);
  const row = expOf(WA, '会面');
  if (row.behavior !== 'unintended') return 'behavior-changed';   // 判断可以变，发生过的事不行
  const st = WA.shadow.stanceOf('乙', '甲', '乙', '会面');
  if (st.noticed !== 'forced' || st.history.length !== 1 || st.history[0].source !== '封路告示') return 'trace:' + JSON.stringify(st.history);
  const ag = WA.shadow.reviseStance('乙', '甲', '乙', '会面', { noticed: 'forced', source: '封路告示' });
  if (ag.ok !== false || ag.reason !== 'no-change') return 'again:' + ag.reason;
  return OK.revise;
}

// P5 补救双向且有前情
function pRemedy(WA) {
  fix(WA);
  WA.shadow.recordExperience('甲', '乙', { what: '会面', behavior: 'unintended', outcome: 'kept',
    views: { '乙': { noticed: 'broken', source: '亲眼' } } });
  // ① 没人提过 ⇒ 没人可接受。这条拒绝**必须留痕**：被拒的东西当然写不进存档，
  //   于是「拒绝发生过」在状态里只能靠观测面看见（v2.63.0 纪律）。
  const b0 = WA.shadow.stat().blocked;
  const early = WA.shadow.acceptRemedy('乙', '甲', '乙', '会面');
  if (early.ok !== false || early.reason !== 'nothing-to-accept') return 'early:' + early.reason;
  if (WA.shadow.stat().blocked !== b0 + 1) return 'early-invisible:' + WA.shadow.stat().blocked;
  const s0 = shape(WA);
  // ② 本来就没有看法的人不能接受（没听说过这件事，谈不上和解）
  const noOpinion = WA.shadow.acceptRemedy('甲', '甲', '乙', '会面');
  if (noOpinion.ok !== false || noOpinion.reason !== 'no-view') return 'noopinion:' + noOpinion.reason;
  if (shape(WA) !== s0) return 'noopinion-mutated';
  const stray = WA.shadow.offerRemedy('甲', '乙', { by: '丙', kind: 'explain', what: '会面' });
  if (stray.ok !== false || stray.reason !== 'not-a-party') return 'stray:' + stray.reason;
  const badk = WA.shadow.offerRemedy('甲', '乙', { by: '甲', kind: 'bribe', what: '会面' });
  if (badk.ok !== false || badk.reason !== 'bad-kind') return 'badkind:' + badk.reason;
  const o1 = WA.shadow.offerRemedy('甲', '乙', { by: '甲', kind: 'explain', what: '会面', note: '封路' });
  if (!o1.ok || o1.pending !== true) return 'offer:' + JSON.stringify(o1);
  const s1 = shape(WA);
  const o2 = WA.shadow.offerRemedy('甲', '乙', { by: '甲', kind: 'explain', what: '会面' });
  if (o2.ok !== false || o2.reason !== 'no-new-remedy') return 'dup:' + o2.reason;
  if (shape(WA) !== s1) return 'dup-mutated';       // 重复道歉必须零变化
  // ③ 就算对方提了补救，**没听说这件事的人仍然不能接受**：和解必须有前情
  const fromOther = WA.shadow.offerRemedy('甲', '乙', { by: '乙', kind: 'reschedule', what: '会面', note: '我也有错' });
  if (!fromOther.ok) return 'fromother:' + fromOther.reason;
  const s2 = shape(WA);
  const nv = WA.shadow.acceptRemedy('甲', '甲', '乙', '会面');
  if (nv.ok !== false || nv.reason !== 'no-view') return 'nvw:' + nv.reason;
  if (shape(WA) !== s2) return 'nvw-mutated';
  const acc = WA.shadow.acceptRemedy('乙', '甲', '乙', '会面');
  if (!acc.ok || acc.kind !== 'explain' || acc.behavior !== 'unintended') return 'accept:' + JSON.stringify(acc);
  const st = WA.shadow.stanceOf('乙', '甲', '乙', '会面');
  if (st.noticed !== 'kept' || st.pendingRemedy !== '' || st.history.length !== 1) return 'state:' + JSON.stringify(st);
  const again = WA.shadow.acceptRemedy('乙', '甲', '乙', '会面');
  if (again.ok !== false || again.reason !== 'nothing-to-accept') return 'againAccept:' + again.reason;
  // 已接受后允许再提（历史会继续长），但**判断不再被重复刷**——已 kept 就是 kept
  const o3 = WA.shadow.offerRemedy('甲', '乙', { by: '甲', kind: 'explain', what: '会面' });
  const after = WA.shadow.stanceOf('乙', '甲', '乙', '会面');
  if (o3.ok !== true) return 'reoffer:' + o3.reason;
  if (after.noticed !== st.noticed || after.history.length !== st.history.length) return 'refarm:' + JSON.stringify([after.noticed, after.history.length]);
  return OK.remedy;
}

// P6 历史保留 + 损失待补偿
function pLoss(WA) {
  fix(WA);
  WA.shadow.recordExperience('甲', '丁', { what: '借的粮', behavior: 'broken', outcome: 'broken', views: { '丁': { noticed: 'broken', source: '亲眼' } } });
  const a = WA.shadow.stanceOf('丁', '甲', '丁', '借的粮');
  if (a.lossUnsettled !== true) return 'unsettled-false';
  const o = WA.shadow.offerRemedy('甲', '丁', { by: '甲', kind: 'restitution', what: '借的粮' });
  if (!o.ok) return 'offer:' + o.reason;
  const b = WA.shadow.stanceOf('丁', '甲', '丁', '借的粮');
  if (b.pendingRemedy !== 'restitution' || b.lossUnsettled !== true) return 'pending:' + JSON.stringify([b.pendingRemedy, b.lossUnsettled]);
  const acc = WA.shadow.acceptRemedy('丁', '甲', '丁', '借的粮');
  if (!acc.ok || acc.kind !== 'restitution') return 'accept:' + JSON.stringify(acc);
  const c = WA.shadow.stanceOf('丁', '甲', '丁', '借的粮');
  if (c.lossUnsettled !== false) return 'settled:' + c.lossUnsettled;
  if (c.behavior !== 'broken') return 'behavior-rewritten:' + c.behavior;   // 归还了也不改「他当时确实赖了」
  if (c.history.length !== 1) return 'history:' + c.history.length;
  const row = expOf(WA, '借的粮');
  if (row.outcome !== 'broken') return 'outcome-rewritten';
  // 叙事行为（对不涉及资源的那条）不该被算成「未清损失」
  WA.shadow.recordExperience('甲', '丁', { what: '失约', behavior: 'unintended', outcome: 'kept', views: { '丁': { noticed: 'unintended', source: '亲眼' } } });
  const d = WA.shadow.stanceOf('丁', '甲', '丁', '失约');
  if (d.lossUnsettled !== false) return 'unintended-loss';
  return OK.loss;
}

// P7 只读面零写副作用
function pRead(WA) {
  fix(WA);
  WA.shadow.recordExperience('甲', '乙', { what: '会面', behavior: 'kept', outcome: 'kept', views: { '乙': { noticed: 'kept', source: '亲眼' } } });
  const s = shape(WA);
  WA.shadow.stanceOf('乙', '甲', '乙', '会面');
  WA.shadow.stanceOf('甲', '甲', '乙', '会面');
  WA.shadow.stanceOf('丙', '甲', '乙', '会面');
  WA.shadow.experiencesOf('甲', '乙');
  WA.shadow.getShadow('甲', '乙');
  WA.shadow.visibleTo('甲');
  return shape(WA) === s ? OK.read : 'read-mutated';
}

// P8 既有面不受影响（同一容器、同一注入面）
function pLegacy(WA) {
  fix(WA);
  const a = WA.shadow.addExperience('甲', '乙', { what: '替对方顶罪', outcome: 'kept' });
  if (!a.ok) return 'exp:' + a.reason;
  const sh = WA.shadow.addShadow('甲', '乙', { kind: 'crime', stakes: 'high', secret: '谁干的' });
  if (!sh.ok) return 'shadow:' + sh.reason;
  const dp = WA.shadow.deepen('甲', '乙', 2);
  if (!dp.ok) return 'deepen:' + dp.reason;
  // 上面那条 addExperience 已占掉一个 kept；这条刻意记 broken，
    //   好让「新增面写进同一容器、并进入同一条统计」这件事在 kept/broken 两个方向上都被看见。
    WA.shadow.recordExperience('甲', '乙', { what: '18点会面', behavior: 'unintended', outcome: 'broken',
      views: { '乙': { noticed: 'unintended', source: '亲眼' } } });
    const st = WA.shadow.shadowStat();
    if (st.experiences !== 2 || st.kept !== 1 || st.broken !== 1 || st.rows !== 1) return 'stat:' + JSON.stringify(st);
  const blk = WA.shadow.buildBlock();
  if (blk.indexOf('18点会面') < 0) return 'block-missing';   // 同一条注入面必须看得见新经历
  if (WA.shadow.experiencesOf('甲', '乙').length !== 2) return 'readback';
  return OK.legacy;
}

// ── 正向判据 ──────────────────────────────────────────────────────────
function judge(a) {
  const WA = fresh();
  ['recordExperience', 'stanceOf', 'reviseStance', 'offerRemedy', 'acceptRemedy'].forEach(function (k) {
    a(typeof WA.shadow[k] === 'function', 'v2117/b4: [1] 出口面含 ' + k);
  });
  a(WA.shadow.NOTICE.length === 5 && WA.shadow.REMEDY_KINDS.length === 4, 'v2117/b4: [2] 五型行为表与四型补救表就位');
  a(typeof WA.shadow.addExperience === 'function' && typeof WA.shadow.addShadow === 'function'
    && typeof WA.shadow.deepen === 'function' && typeof WA.shadow.brighten === 'function'
    && typeof WA.shadow.getShadow === 'function' && typeof WA.shadow.shadowStat === 'function',
    'v2117/b4: [3] 既有出口（addExperience/addShadow/deepen/brighten/getShadow/shadowStat）仍在');
  {
    const sd = WA.evict.siteDecls ? WA.evict.siteDecls() : {};
    // 前缀过滤必须带点：裸 indexOf('shadow') 会连 `memory.foreshadows` 一起捞进来
    //   （"foreshadows" 里就含 "shadow"）——那会让这条判据在正确代码上报红。
    const keys = Object.keys(sd).filter(function (k) { return k.indexOf('shadow.') === 0; }).sort();
    a(keys.join(',') === 'shadow.experiences,shadow.rows',
      'v2117/b4: [4] 未新增容器（仍只有 shadow.rows / shadow.experiences，实 ' + keys.join('/') + '）');
    a(sd['shadow.experiences'] && sd['shadow.experiences'].cap === 20,
      'v2117/b4: [4] 经历容器容量未改动（cap 20）');
  }

  a(probeClean(pObj) === OK.obj, 'v2117/b4: [5] 客观行为与各方认知分开（没给认知的人不得被推出看法）');
  a(probeClean(pBehav) === OK.behav, 'v2117/b4: [6] 五型分离（不得已 ≠ 主动背弃）+ 非法值整次拒收');
  a(probeClean(pParty) === OK.party, 'v2117/b4: [7] 只有当事人能有看法（非当事人写不进、也投影不出）');
  a(probeClean(pRevise) === OK.revise, 'v2117/b4: [8] 修正需来源、同义零变化、改动留痕');
  a(probeClean(pRemedy) === OK.remedy, 'v2117/b4: [9] 补救双向（一方提、对方接受）+ 重复同类零变化');
  a(probeClean(pLoss) === OK.loss, 'v2117/b4: [10] 历史不可抹（行为不改）+ 资源损失归还后才清');
  a(probeClean(pRead) === OK.read, 'v2117/b4: [11] 只读面零写副作用');
  a(probeClean(pLegacy) === OK.legacy, 'v2117/b4: [12] 既有面不受影响（同一容器、同一注入面）');

  // 相同好感、不同经历 ⇒ 有依据的不同回应（B4 的场景条款）
  {
    const w = fresh(); fix(w);
    w.shadow.recordExperience('甲', '乙', { what: '上次的约定', behavior: 'kept', outcome: 'kept', views: { '乙': { noticed: 'kept', source: '亲眼' } } });
    w.shadow.recordExperience('甲', '丙', { what: '上次的约定', behavior: 'broken', outcome: 'broken', views: { '丙': { noticed: 'broken', source: '亲眼' } } });
    const good = w.shadow.stanceOf('乙', '甲', '乙', '上次的约定');
    const bad = w.shadow.stanceOf('丙', '甲', '丙', '上次的约定');
    a(good.noticed === 'kept' && bad.noticed === 'broken' && good.lossUnsettled === false && bad.lossUnsettled === true,
      'v2117/b4: [13] 同一人、两段相反经历 ⇒ 两人各自的判断有依据地不同');
  }
  // 认知不对称不因台账顺序改变（后写的经历不覆盖先前的判断）
  {
    const w = fresh(); fix(w);
    w.shadow.recordExperience('甲', '乙', { what: '会面', behavior: 'unintended', outcome: 'kept', views: { '乙': { noticed: 'broken', source: '亲眼' } } });
    w.shadow.recordExperience('甲', '乙', { what: '另一件事', behavior: 'kept', outcome: 'kept', views: { '乙': { noticed: 'kept', source: '亲眼' } } });
    const st = w.shadow.stanceOf('乙', '甲', '乙', '会面');
    a(st.ok === true && st.noticed === 'broken', 'v2117/b4: [14] 后来的好事不自动改写先前那条判断');
  }
  // 哨兵：夹具不许漏进 localStorage
  {
    let leak = 0;
    for (let i = 0; i < global.localStorage.length; i++) {
      const k = global.localStorage.key(i);
      if (k && String(global.localStorage.getItem(k)).indexOf(TAG) >= 0) leak++;
    }
    a(leak === 0, 'v2117/b4: [15] 哨兵未泄漏（' + leak + '）');
  }
}

// ── 负向自证 ──────────────────────────────────────────────────────────
const N1 = [
  { k: 'rstray', p: pParty,  okk: OK.party,  note: '非当事人也能被写进认知 ⇒ 客观面被外人污染' },
  { k: 'behav',  p: pBehav,  okk: OK.behav,  note: '行为五型不校验 ⇒ 不得已与主动背弃混成一个值' },
  { k: 'noview', p: pObj,    okk: OK.obj,    note: '没有认知的人被推出一份 ⇒ 认知对称化' },
  { k: 'src',    p: pRevise, okk: OK.revise, note: '无来源的更正也改判断 ⇒ 传言即证据' },
  { k: 'noc',    p: pRevise, okk: OK.revise, note: '同义重复也重写 ⇒ 判断可被无意义刷新' },
  { k: 'dup',    p: pRemedy, okk: OK.remedy, note: '重复同类补救不再拦 ⇒ 重复道歉无限刷' },
  { k: 'nvw',    p: pRemedy, okk: OK.remedy, note: '没听说的人也能接受补救 ⇒ 和解无前情' },
  { k: 'acc',    p: pRemedy, okk: OK.remedy, note: '没人提也能接受 ⇒ 补救不是双向的' },
  { k: 'behkeep',p: pLoss,   okk: OK.loss,   note: '接受补救顺带改写历史行为 ⇒ 发生过的事被抹平' },
  { k: 'loss',   p: pLoss,   okk: OK.loss,   note: '损失判据恒假 ⇒ 真正的资源损失凭消失' }
];
const N3 = [
  ['rstray', pObj, OK.obj, '非当事人校验破坏不影响客观/认知分离'],
  ['behav', pParty, OK.party, '行为表破坏不影响当事人面'],
  ['noview', pLegacy, OK.legacy, '认知缺失破坏不影响既有面'],
  ['src', pRemedy, OK.remedy, '来源校验破坏不影响补救双向'],
  ['dup', pRevise, OK.revise, '防重复破坏不影响修正闸'],
  ['acc', pRead, OK.read, '接受闸破坏不影响只读面'],
  ['behkeep', pRead, OK.read, '历史改写破坏不影响只读面'],
  ['loss', pRevise, OK.revise, '损失判据破坏不影响修正闸']
];
function runNegative(a) {
  BROKEN.forEach(function (s) { a(anchorHits(s) === 1, 'v2117/b4: [N0] 锚点在真源码中恰 1 次 :: ' + s.key); });
  a(BROKEN.length === 10 && new Set(BROKEN.map(function (x) { return x.key; })).size === 10,
    'v2117/b4: [N0] 破坏面覆盖 10 个互异锚点');
  N1.forEach(function (it) {
    a(probeWith(BROKEN[B[it.k]], it.p) !== it.okk, 'v2117/b4: [N1] ' + it.note + '（缺口复现）');
  });
  const OKPROBE = { obj: pObj, behav: pBehav, party: pParty, revise: pRevise, remedy: pRemedy, loss: pLoss, read: pRead, legacy: pLegacy };
  Object.keys(OK).forEach(function (k) {
    a(probeClean(OKPROBE[k]) === OK[k], 'v2117/b4: [N2] 原版成立 :: ' + k);
  });
  N3.forEach(function (t) {
    a(probeWith(BROKEN[B[t[0]]], t[1]) === t[2], 'v2117/b4: [N3] ' + t[3]);
  });
  a(probeWith(BROKEN[B.behav], pLoss) === OK.loss, 'v2117/b4: [N4] 对照：行为表破坏后损失判据仍成立');
  const chg = (function () {
    const w = fresh(); fix(w);
    const b = w.shadow.stanceOf('乙', '甲', '乙', '会面').reason;
    w.shadow.recordExperience('甲', '乙', { what: '会面', behavior: 'kept', outcome: 'kept', views: { '乙': { noticed: 'kept', source: '亲眼' } } });
    return b + '>' + w.shadow.stanceOf('乙', '甲', '乙', '会面').noticed;
  })();
  a(chg === 'no-such-experience>kept', 'v2117/b4: [N4] 入账真的改变状态（判据非恒真，实 ' + chg + '）');
}
function runAll(a) { judge(a); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('B4-RELATION-V2117: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('B4-RELATION-V2117: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits };
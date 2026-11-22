#!/usr/bin/env node
// WorldAxis tests/b3-intel-v2117.js -- B3 专锁：认知层的「知道 / 听说 / 相信 / 真相」四分（v2.117.0）
//
// 规划 02 的 B3 原文：「知道/听说/相信/真相分别处理，视点投影，辟谣只对收到修正者生效」。
// 落点 engines/intel.js（既有模块，**不加新模块、不加新容器**）：认知行仍挂
// `people.<id>.knowledge.intel`，队列仍走 `intel.queue`。
//
// 本锁逐条守住的语义 —— 每一条都是「写出来了、但某个条件下不会成立」或「会悄悄多出一个真源」：
//   ① **真相只读既有事实源**：truthOf 若为了「稳」自己存一份事实（顺手 push 一条），
//      世界里就出现第二份真源，两份分叉时无人知道该信谁；查不到必须报 unknown-subject，
//      **不回落成「没有这件事」**（本仓最贵的一类默认值）。
//   ② **两份事实源的版本语义不同**：`worldFacts` 是就地覆写（一行=当前值），
//      `memory.facts` 是版本化追加（旧行留痕标 `active:false`）。同一套读法会把**已被取代的旧值**
//      当成当前真相——那份旧的 value 恰恰是错的。
//   ③ **资格是等级，不是数量**：传闻（rumor）/呈报（report）堆多少条都不构成「亲见或记档」；
//      否则「十个人都说」会被读成「事实成立」，正是本层要挡的那件事。
//   ④ **相信不改世界事实**；且「核实」不能给从没听说过的人入账——那是把情报从后门塞进空脑子。
//   ⑤ **弱证据零变化**：手上已有 75 分的说法时，55 分的「核实」必须连新行都不写
//      （没带来新信息的账不该留），强证据升格后旧行标 superseded 留痕。
//   ⑥ **辟谣只对收到过这条说法的人生效**：对没听过的人必须报 nothing-to-correct，
//      否则会给他无中生有地写一行「已更正」；更正行本身要有来源、等级为 record。
//   ⑦ **视点投影不是全知通道**：没资格看真相的人拿到 `truth: null` 且 `knows: null`
//      （连「他猜没猜对」都不能泄露，否则换个人投影一次就是绕资格）；`mayAssert` 只在
//      「此人手上确有一条与真相相符的说法」时才为真。
//
// 每条判据两向自证：真源码成绿 / 就地破坏现形。
//   N0 锚点在真源码恰 1 次 · N1 破坏现形 · N2 原版成绿 · N3 破坏互不串扰 · N4 判据非恒真。
// 破坏只改内存副本（srcOverride），零文件改写。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__b3i2117_';
const REL = 'engines/intel.js';

// ── 破坏锚点（逐字取自真源码，各恰 1 次）──
const A_TRUTH   = "    return { ok: false, reason: 'unknown-subject', about: key };";
const A_VER     = "x && x.active !== false && (x.key === key || x.id === key)";
const A_ENT     = "      return x.level === 'witness' || x.level === 'record';";
const A_BELIEF  = "      out = { ok: true, id: row.id, status: row.status, about: about, level: level, confidence: row.confidence };";
const A_WEAK    = "    if (CONF[level] <= best) {";
const A_NOVF    = "    if (!live.length) {";
const A_CORR    = "    if (!hit.length) {";
const A_RTRUTH  = "    const wf = (st.worldFacts || []).filter(";
const A_RROWS   = "    const rows = (p && p.knowledge && Array.isArray(p.knowledge.intel)) ? p.knowledge.intel : [];";
const A_MASSERT = "    const known = live.some(function (x) { return String(x.claim) === String(t.value); });";

const BROKEN = [
  // ① 查不到就现造一条事实并写进世界（第二份真源）⇒ 认知层变成了真源
  { key: 'truth', from: A_TRUTH,
    to: "    (st.worldFacts = st.worldFacts || []).push({ id: 'wf_' + key, key: key, value: key + '（查过）', source: 'intel' });\n    return { ok: true, about: key, value: key + '（查过）', source: 'fact' };" },
  // ② 不筛 active ⇒ 已被取代的旧事实被当成当前真相
  { key: 'ver', from: A_VER, to: "(x.key === key || x.id === key)" },
  // ③ 资格恒真 ⇒ 传闻也算亲见
  { key: 'ent', from: A_ENT, to: "      return true;" },
  // ④ 「相信」顺手把说法写成世界事实
  { key: 'belief', from: A_BELIEF,
    to: "      (draft.worldFacts = draft.worldFacts || []).push({ id: 'wf_' + about, key: about, value: claim, source: 'belief', at: clockNow('intel') });\n" + A_BELIEF },
  // ⑤ 摘掉弱证据闸 ⇒ 更弱的凭据也能改认知
  { key: 'weak', from: A_WEAK, to: "    if (false) {" },
  // ⑥ 「核实」不要求本来有这一说 ⇒ 给空脑子入一条硬凭据
  { key: 'novf', from: A_NOVF, to: "    if (false) {" },
  // ⑦ 辟谣对谁都能生效 ⇒ 给没听过的人写一行「已更正」
  { key: 'corr', from: A_CORR, to: "    if (false) {" },
  // ⑧ 真源回落：查不到就改读「currents 的第一条」⇒ 张冠李戴的真相
  { key: 'rtruth', from: A_RTRUTH,
    to: "    const wf = ((st.currents || [])[0] ? [{ value: ((st.currents || [])[0] || {}).title }] : []).filter(" },
  // ⑨ 「读认知行」顺手补建人物行 ⇒ 只读面有写副作用
  { key: 'rrows', from: A_RROWS,
    to: "    const rows = (p && p.knowledge && Array.isArray(p.knowledge.intel)) ? p.knowledge.intel : (function () { const s = state(); s.people = s.people || {}; s.people['p_' + who] = { id: 'p_' + who, name: who, knowledge: { intel: [] } }; return s.people['p_' + who].knowledge.intel; })();" },
  // ⑩ mayAssert 恒真 ⇒ 说对了但自己不知道也能断言
  { key: 'massert', from: A_MASSERT, to: "    const known = (truth !== null);" }
];
const B = {};
BROKEN.forEach(function (s, i) { B[s.key] = i; });

// ── 探针的成功症状（N2 逐条断言；N1 断言「不等于成功症状」）──
const OK = {
  truth: 'ref-stable', ver: 'active-only', ent: 'tiered', belief: 'belief-isolated',
  weak: 'evidence-ordered', corr: 'scoped', proj: 'viewed', rows: 'read-only'
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

// ── 夹具 ──────────────────────────────────────────────────────────────
// 直接落进 store（不走 backstage/memory 的写入口）：这些是 intel 的**输入**，
//   输入已知才谈得上「只测被测者」。世界事实/暗流/事件三源各放一条，另加一条
//   版本化的 memory.facts（用于②的 active 语义）。
function fix(WA) {
  WA.store.transact(function (d) {
    d.people = {};
    ['甲', '乙', '丙'].forEach(function (n) {
      d.people['p_' + n] = { id: 'p_' + n, name: n, knowledge: {}, updatedAt: 0 };
    });
    d.worldFacts = [{ id: 'wf1', key: '桥', value: '桥在' }];
    d.currents = [{ id: 'cur1', title: '粮价飞涨' }];
    d.evolution = Object.assign({}, d.evolution, { events: [{ id: 'ev1', title: '城门夜里落锁' }] });
    d.memory = d.memory || {};
    d.memory.facts = [];
    d.intelQueue = [];
    d.world = { places: [], roads: [], journeys: [], events: [] };
  }, TAG + 'seed');
  WA.memory.upsertFact(WA.store.get(), '水位', '五尺', '探针');
  return { t: shape(WA) };
}

// ── 只读面指纹：把「有没有写副作用」变成可比较的字符串 ────────────────
//   刻意不做全量 JSON 对比（那样报错信息会长到看不出差别），只取**会被写坏的那几处**：
//   容器长度/键集、人物行的 updatedAt 与认知行数、行动台账全文。
function dig(v) {
  if (Array.isArray(v)) return '[' + v.length + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().join(',') + '}';
  return String(v);
}
function shape(WA) {
  const st = WA.store.get();
  const out = [];
  ['worldFacts', 'currents', 'intelQueue', 'echoes', 'chronicle', 'blocks', 'shipments', 'messages', 'people']
    .forEach(function (k) { out.push(k + ':' + dig(st[k])); });
  out.push('acts:' + JSON.stringify(st.acts || null));
  ['facts', 'l0', 'l1', 'l2', 'l3', 'foreshadows'].forEach(function (k) {
    out.push('memory.' + k + ':' + dig((st.memory || {})[k]));
  });
  out.push('world:' + dig(st.world));
  out.push('evolution:' + dig(st.evolution));
  const ppl = st.people || {};
  out.push('ppl:' + Object.keys(ppl).sort().map(function (id) {
    const p = ppl[id] || {};
    const rows = (p.knowledge && Array.isArray(p.knowledge.intel)) ? p.knowledge.intel.length : -1;
    return id + '@' + p.updatedAt + '#' + rows;
  }).join(','));
  return out.join('|');
}

// ── 探针 ──────────────────────────────────────────────────────────────

// P1 真相只读既有事实源，且查不到不回落
function pTruth(WA) {
  const s = fix(WA);
  const r = WA.intel.truthOf('桥');
  if (!r.ok || r.value !== '桥在' || r.source !== 'fact') return 'fact-miss:' + (r.reason || r.value);
  const cur = WA.intel.truthOf('cur1'), ev = WA.intel.truthOf('ev1');
  if (!cur.ok || cur.source !== 'current') return 'current-miss:' + (cur.reason || cur.source);
  if (!ev.ok || ev.source !== 'event') return 'event-miss:' + (ev.reason || ev.source);
  const miss = WA.intel.truthOf('没有这件事');
  if (miss.ok !== false || miss.reason !== 'unknown-subject') return 'no-fallback:' + JSON.stringify(miss);
  return shape(WA) === s.t ? OK.truth : 'mutated';
}

// P2 两份事实源的版本语义：只认 active
function pVer(WA) {
  fix(WA);
  WA.memory.upsertFact(WA.store.get(), '水位', '八尺', '探针2');
  const r = WA.intel.truthOf('水位');
  const facts = WA.store.get().memory.facts;
  const act = facts.filter(function (x) { return x.active; }).map(function (x) { return x.value; });
  return (r.ok && r.value === '八尺' && facts.length === 2 && act.length === 1 && act[0] === '八尺')
    ? OK.ver : ('got:' + r.value + '/' + facts.length + '/' + act.join(','));
}

// P3 资格是等级不是数量
function pEnt(WA) {
  fix(WA);
  for (let i = 0; i < 3; i++) {
    const r = WA.intel.believe('甲', { claim: '桥垮了' + i, source: '传言' + i, level: 'rumor', about: '桥' });
    if (!r.ok) return 'believe-failed:' + r.reason;
  }
  if (WA.intel.rowsOf('甲', '桥').length !== 3) return 'rows:' + WA.intel.rowsOf('甲', '桥').length;
  if (WA.intel.entitledTo('甲', '桥') !== false) return 'rumor-entitled';
  const pj = WA.intel.project('桥', '甲');
  if (pj.truth !== null || pj.knows !== null || pj.reason !== 'not-entitled') {
    return 'leaked:' + JSON.stringify([pj.truth, pj.knows, pj.reason]);
  }
  const w = WA.intel.believe('甲', { claim: '桥在', source: '亲眼', level: 'witness', about: '桥' });
  if (!w.ok) return 'witness-failed:' + w.reason;
  if (WA.intel.entitledTo('甲', '桥') !== true) return 'not-entitled-after-witness';
  return OK.ent;
}

// P4 相信不改世界事实；核实不给没听说过的人入账
function pBelief(WA) {
  fix(WA);
  const wf = JSON.stringify(WA.store.get().worldFacts);
  const r = WA.intel.believe('甲', { claim: '桥在', source: '路边', level: 'rumor', about: '桥' });
  if (!r.ok || r.status !== 'suspected' || r.confidence !== 25) return 'believe:' + (r.reason || (r.status + '/' + r.confidence));
  if (JSON.stringify(WA.store.get().worldFacts) !== wf) return 'fact-changed';
  const inv = WA.intel.verify('丁', { about: '桥', level: 'record', source: '档册' });
  if (inv.ok !== false || inv.reason !== 'nothing-to-verify') return 'verify-empty:' + inv.reason;
  if (WA.intel.rowsOf('丁', '桥').length !== 0) return 'verify-empty-rows';
  return OK.belief;
}

// P5 弱证据零变化 + 升格留痕（且抬升后才有资格）
function pWeak(WA) {
  fix(WA);
  WA.intel.believe('甲', { claim: '桥垮了', source: '传言', level: 'rumor', about: '桥' });
  const s1 = shape(WA);
  const w = WA.intel.verify('甲', { about: '桥', level: 'rumor', source: '第二手传言', claim: '桥垮了' });
  if (w.ok !== false || w.reason !== 'weak-evidence') return 'weak:' + w.reason;
  if (w.had !== 25 || w.got !== 25) return 'weak-values:' + w.had + '/' + w.got;
  if (shape(WA) !== s1) return 'weak-mutated';
  if (WA.intel.entitledTo('甲', '桥') !== false) return 'weak-entitled';
  const s = WA.intel.verify('甲', { about: '桥', level: 'record', source: '档册', claim: '桥在' });
  if (!s.ok || s.superseded !== 1 || s.confidence !== 90) return 'strong:' + JSON.stringify(s);
  const rows = WA.intel.rowsOf('甲', '桥');
  if (rows.length !== 2 || rows[0].status !== 'superseded' || rows[0].claim !== '桥垮了') return 'no-trace';
  if (rows[1].status !== 'believed' || rows[1].level !== 'record') return 'no-upgrade';
  if (WA.intel.entitledTo('甲', '桥') !== true) return 'not-entitled-after-record';
  return OK.weak;
}

// P6 辟谣只对收到者生效（含重放）
function pCorr(WA) {
  fix(WA);
  const never = WA.intel.correct('丁', { about: '桥', claim: '桥垮了', source: '衙署' });
  if (never.ok !== false || never.reason !== 'nothing-to-correct') return 'never:' + never.reason;
  if (WA.intel.rowsOf('丁', '桥').length !== 0) return 'never-rows';
  if (WA.intel.rowsOf('甲', '桥').length !== 0) return 'cross-write';
  WA.intel.believe('甲', { claim: '桥垮了', source: '传言', level: 'rumor', about: '桥' });
  const wf = JSON.stringify(WA.store.get().worldFacts);
  const ok = WA.intel.correct('甲', { about: '桥', claim: '桥垮了', source: '衙署', right: '桥还在' });
  if (!ok.ok || ok.corrected !== 1) return 'correct:' + JSON.stringify(ok);
  if (JSON.stringify(WA.store.get().worldFacts) !== wf) return 'fact-changed';
  const rows = WA.intel.rowsOf('甲', '桥');
  if (rows[0].status !== 'retracted') return 'not-retracted';
  const nr = rows[1];
  if (!nr || nr.claim !== '桥还在' || nr.level !== 'record' || nr.correctedFrom !== '桥垮了') return 'correct-row';
  if (WA.intel.entitledTo('甲', '桥') !== true) return 'not-entitled';
  const again = WA.intel.correct('甲', { about: '桥', claim: '桥垮了', source: '衙署' });
  if (again.ok !== false || again.reason !== 'nothing-to-correct') return 'replay:' + again.reason;
  return OK.corr;
}

// P7 视点投影
function pProj(WA) {
  fix(WA);
  WA.intel.believe('甲', { claim: '桥垮了', source: '传言', level: 'rumor', about: '桥' });
  const a = WA.intel.project('桥', '甲');
  if (a.ok !== true) return 'proj-failed:' + a.reason;
  if (a.truth !== null || a.knows !== null || a.mayAssert !== false) return 'rumor-leak';
  if (a.reason !== 'not-entitled' || a.withheld !== 1) return 'rumor-reason:' + a.reason + '/' + a.withheld;
  if (a.guessed.length !== 0) return 'rumor-guessed';
  WA.intel.believe('甲', { claim: '桥在', source: '亲眼', level: 'witness', about: '桥' });
  const b = WA.intel.project('桥', '甲');
  if (b.truth !== '桥在' || b.knows !== true || b.mayAssert !== true) return 'entitled:' + JSON.stringify([b.truth, b.knows, b.mayAssert]);
  if (b.guessed.length !== 1 || b.guessed[0] !== '桥垮了') return 'guessed:' + JSON.stringify(b.guessed);
  const c = WA.intel.project('桥', '丁');
  if (c.ok !== true || c.truth !== null || c.knows !== null || c.withheld !== 0 || c.reason !== 'no-knowledge') {
    return 'empty:' + JSON.stringify([c.truth, c.knows, c.reason]);
  }
  const u = WA.intel.project('没有这件事', '甲');
  if (u.ok !== false || u.reason !== 'unknown-subject') return 'unknown:' + JSON.stringify(u);
  return OK.proj;
}

// P8 认知行只读（不补建人物行）
function pRows(WA) {
  fix(WA);
  // ① 读之前先记指纹：读**不得**改变任何一格状态（含补建人物行）。
  const s0 = shape(WA);
  const empty = WA.intel.rowsOf('丁', '桥');
  if (empty.length !== 0) return 'nonempty';
  if (Object.keys(WA.store.get().people).indexOf('p_丁') >= 0) return 'created-person';
  if (shape(WA) !== s0) return 'read-mutated';
  // ② 有行的人：读同样零变化（写只允许经由 believe）
  WA.intel.believe('丙', { claim: '桥在', source: '传言', level: 'rumor', about: '桥' });
  const s1 = shape(WA);
  const one = WA.intel.rowsOf('丙', '桥');
  if (one.length !== 1 || one[0].about !== '桥') return 'read:' + one.length;
  if (WA.intel.rowsOf('丙').length !== 1) return 'unfiltered';
  return shape(WA) === s1 ? OK.rows : 'read-mutated2';
}

// ── 正向判据 ──────────────────────────────────────────────────────────
function judge(a) {
  const WA = fresh();
  // 出口面（新 7 个 + 旧面原样）
  ['truthOf', 'rowsOf', 'entitledTo', 'believe', 'verify', 'correct', 'project'].forEach(function (k) {
    a(typeof WA.intel[k] === 'function', 'v2117/b3: [1] 出口面含 ' + k);
  });
  a(WA.intel.LEVELS.join(',') === 'rumor,report,witness,record' && WA.intel.CONFIDENCE.record === 90,
    'v2117/b3: [2] 旧等级/置信度表未改动');
  a(typeof WA.intel.addIntel === 'function' && typeof WA.intel.releaseDue === 'function' && typeof WA.intel.visibleTo === 'function'
    && typeof WA.intel.addLink === 'function' && typeof WA.intel.explain === 'function' && typeof WA.intel.buildBlock === 'function',
    'v2117/b3: [3] 旧出口（addIntel/releaseDue/visibleTo/addLink/explain/buildBlock）仍在');
  {
    // 容器面：B3 不加容器——intel 前缀的站点仍只有 intel.queue 一处
    const sd = WA.evict.siteDecls ? WA.evict.siteDecls() : {};
    const intelSites = Object.keys(sd).filter(function (k) { return k.indexOf('intel') >= 0; }).sort();
    a(intelSites.length === 1 && intelSites[0] === 'intel.queue',
      'v2117/b3: [4] 未新增容器（intel 站点仍只有 intel.queue，实 ' + intelSites.join('/') + '）');
  }

  a(probeClean(pTruth) === OK.truth, 'v2117/b3: [5] 真相只读既有事实源（三源各认一条、查不到不回落）');
  a(probeClean(pVer) === OK.ver, 'v2117/b3: [6] memory.facts 版本语义：只认 active 的那一条');
  a(probeClean(pEnt) === OK.ent, 'v2117/b3: [7] 资格是等级不是数量（三条传闻 ≠ 一条亲见）');
  a(probeClean(pBelief) === OK.belief, 'v2117/b3: [8] 相信不改世界事实；核实不给没听说过的人入账');
  a(probeClean(pWeak) === OK.weak, 'v2117/b3: [9] 弱证据零变化、强证据升格留痕');
  a(probeClean(pCorr) === OK.corr, 'v2117/b3: [10] 辟谣只对收到者生效（重放报 nothing-to-correct）');
  a(probeClean(pProj) === OK.proj, 'v2117/b3: [11] 视点投影：无资格者 truth/knows 均 null');
  a(probeClean(pRows) === OK.rows, 'v2117/b3: [12] 认知行只读（不补建人物行、不写容器）');

  // 知道 / 听说 分离：未登记路途的情报不得瞬移，也不得回落成「马上知道」
  {
    const w = fresh(); fix(w);
    const r = w.intel.addIntel('甲', { claim: '桥修好了', source: '驿报', level: 'report', about: '桥', from: '甲地', to: '乙地' });
    // 沿途一个地点都没登记 ⇒ 不是「不可达」，是「不知道从哪到哪」：unknown-place。
    //   两种原因都可接受，但**都必须零入账**（不许回落成「马上知道」）。
    a(r.ok === false && r.reason === 'unknown-place' && w.intel.rowsOf('甲', '桥').length === 0,
      'v2117/b3: [13] 路途不可知 ⇒ 听说不瞬移且零入账（实 ' + r.reason + '）');
    const r2 = w.intel.addIntel('甲', { claim: '桥修好了', source: '驿报', level: 'report', about: '桥' });
    a(r2.ok === true && w.intel.rowsOf('甲', '桥').length === 1,
      'v2117/b3: [14] 未给路途仍是即时入账（旧口径未变）');
    a(w.intel.visibleTo('甲', '桥').length === 1, 'v2117/b3: [15] 旧只读面 visibleTo 仍看得见这条');
  }
  // 未收录事由：相信与投影都不许凭空成立
  {
    const w = fresh(); fix(w);
    const s = shape(w);
    const r = w.intel.believe('甲', { claim: 'x', source: 's', level: 'rumor', about: '没有这件事' });
    a(r.ok === false && r.reason === 'unknown-subject' && shape(w) === s,
      'v2117/b3: [16] 未收录事由 ⇒ 相信被拒且零变化');
    a(w.intel.entitledTo('甲', '没有这件事') === false, 'v2117/b3: [17] 未收录事由不产生资格');
  }
  // 错说法与真相并存时：说对了但没资格仍不能断言，说错了也不因数量变成真相
  {
    const w = fresh(); fix(w);
    w.intel.believe('乙', { claim: '桥垮了', source: '传言', level: 'rumor', about: '桥' });
    w.intel.believe('乙', { claim: '桥在', source: '另一路传言', level: 'rumor', about: '桥' });
    const pj = w.intel.project('桥', '乙');
    a(pj.ok === true && pj.truth === null && pj.knows === null && pj.reason === 'not-entitled' && pj.withheld === 2,
      'v2117/b3: [18] 说对了也不算能断言（有相符说法但无资格 ⇒ knows=null）');
  }
  // 认知行有界：slice(-12) 仍生效
  {
    const w = fresh(); fix(w);
    for (let i = 0; i < 16; i++) w.intel.believe('甲', { claim: 'c' + i, source: 's', level: 'rumor', about: '桥' });
    a(w.intel.rowsOf('甲', '桥').length === 12, 'v2117/b3: [19] 认知行仍被 slice(-12) 夹住（实 ' + w.intel.rowsOf('甲', '桥').length + '）');
  }
  // 哨兵：夹具不许漏进 localStorage
  {
    let leak = 0;
    for (let i = 0; i < global.localStorage.length; i++) {
      const k = global.localStorage.key(i);
      if (k && String(global.localStorage.getItem(k)).indexOf(TAG) >= 0) leak++;
    }
    a(leak === 0, 'v2117/b3: [20] 哨兵未泄漏（' + leak + '）');
  }
}

// ── 负向自证 ──────────────────────────────────────────────────────────
const N1 = [
  { k: 'truth',   p: pTruth,   okk: OK.truth,   note: '查不到就现造一条事实 ⇒ 认知层变成第二份真源' },
  { k: 'ver',     p: pVer,     okk: OK.ver,     note: '不筛 active ⇒ 已被取代的旧值被当成当前真相' },
  { k: 'ent',     p: pEnt,     okk: OK.ent,     note: '资格恒真 ⇒ 传闻也算亲见' },
  { k: 'belief',  p: pBelief,  okk: OK.belief,  note: '相信顺手写成世界事实 ⇒ 相信与世界分不开' },
  { k: 'weak',    p: pWeak,    okk: OK.weak,    note: '摘掉弱证据闸 ⇒ 更弱的凭据也能改认知' },
  { k: 'novf',    p: pBelief,  okk: OK.belief,  note: '核实不要求本来有这一说 ⇒ 情报从后门进空脑子' },
  { k: 'corr',    p: pCorr,    okk: OK.corr,    note: '辟谣对谁都能生效 ⇒ 给没听过的人写「已更正」' },
  { k: 'rtruth',  p: pTruth,   okk: OK.truth,   note: '真源回落读第一条暗流 ⇒ 张冠李戴的真相' },
  { k: 'rrows',   p: pRows,    okk: OK.rows,    note: '读认知行顺手补建人物行 ⇒ 只读面有写副作用' },
  { k: 'massert', p: pProj,    okk: OK.proj,    note: 'mayAssert 恒真 ⇒ 说对了但自己不知道也能断言' }
];
const N3 = [
  ['truth', pVer, OK.ver, '真相破坏不影响事实版本语义'],
  ['ver', pTruth, OK.truth, '版本语义破坏不影响只读真相'],
  ['ent', pBelief, OK.belief, '资格破坏不影响「相信不改事实 / 核实需前情」'],
  ['weak', pCorr, OK.corr, '弱证据破坏不影响辟谣生效面'],
  ['novf', pCorr, OK.corr, '核实前提破坏不影响辟谣'],
  ['corr', pProj, OK.proj, '辟谣破坏不影响视点投影'],
  ['rrows', pTruth, OK.truth, '读行副作用破坏不影响只读真相'],
  ['massert', pEnt, OK.ent, 'mayAssert 破坏不影响资格分级']
];
function runNegative(a) {
  BROKEN.forEach(function (s) { a(anchorHits(s) === 1, 'v2117/b3: [N0] 锚点在真源码中恰 1 次 :: ' + s.key); });
  a(BROKEN.length === 10 && new Set(BROKEN.map(function (x) { return x.key; })).size === 10,
    'v2117/b3: [N0] 破坏面覆盖 10 个互异锚点');
  N1.forEach(function (it) {
    a(probeWith(BROKEN[B[it.k]], it.p) !== it.okk,
      'v2117/b3: [N1] ' + it.note + '（缺口复现）');
  });
  // N2 原版成绿：**逐条**跑各自的正向探针（不设回退——回退会把「没测到」写成绿）
  const OKPROBE = { truth: pTruth, ver: pVer, ent: pEnt, belief: pBelief, weak: pWeak, corr: pCorr, proj: pProj, rows: pRows };
  Object.keys(OK).forEach(function (k) {
    a(probeClean(OKPROBE[k]) === OK[k], 'v2117/b3: [N2] 原版成立 :: ' + k);
  });
  N3.forEach(function (t) {
    a(probeWith(BROKEN[B[t[0]]], t[1]) === t[2], 'v2117/b3: [N3] ' + t[3]);
  });
  // N4-a 对照：破坏一个面不得让另一个面失效（证明判据彼此独立、不是恒真恒假）
  a(probeWith(BROKEN[B.ent], pCorr) === OK.corr, 'v2117/b3: [N4] 对照：资格破坏后辟谣生效面仍成立');
  // N4-b 非恒真：真状态确实改变
  const chg = (function () {
    const w = fresh(); fix(w);
    const b = w.intel.rowsOf('甲', '桥').length + '/' + w.intel.entitledTo('甲', '桥');
    w.intel.believe('甲', { claim: '桥在', source: '亲眼', level: 'witness', about: '桥' });
    return b + '>' + w.intel.rowsOf('甲', '桥').length + '/' + w.intel.entitledTo('甲', '桥');
  })();
  a(chg === '0/false>1/true', 'v2117/b3: [N4] 入账真的改变状态（判据非恒真，实 ' + chg + '）');
}
function runAll(a) { judge(a); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('B3-INTEL-V2117: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('B3-INTEL-V2117: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits };
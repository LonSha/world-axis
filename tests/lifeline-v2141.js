#!/usr/bin/env node
// WorldAxis tests/lifeline-v2141.js —— v2.141.0（F2）：时点与注意力闸门 + 生理与照护真实层
//
// 【它治的病：声明在注释里，落点不在代码里】
//   本版动手前实测（不是读注释，是跑出来的）四处：
//     ① `srcIntel` —— intel.visibleTo 的**返回形态是数组**（`rows.filter(...).slice(-4)`），
//        而初版按 `{known}` / `{ok}` **布尔对象**读 ⇒ 两个 typeof 分支都不成立 ⇒
//        这个源**永远返回 null、从不投票**。后果不是「少一票」，而是**把「有账」读成「无账」**：
//        在 intel 确有账的世界里，knows() 答 `known:null + not-registered`（事实没登记过），
//        而它该答 not-holder（登记了、此人在界外）。
//        与 v2.140.0 修掉的 srcRumor（在对象行数组上 indexOf 字符串，恒 -1）与
//        srcShadow（把数组当 `{secrets}` 对象读）是**同一形态的第三例**。
//     ② `srcShadow` —— 上一版把注释写对了（「未命中一律缺席」），代码写的是
//        `rows.length ? has : null`：此人名下有**任何**一条共同隐瞒，就把别的事判成「不知」。
//        与 intel 那处镜像对称：闸门从「少一票」变成「凭空多一票否决」。**第四例**。
//     ③ `premature` —— 文件头自 v2.140.0 起把它写进「四个归因码不可合并」的声明里，
//        `timeEnabled` 也在 DEF / boundary / stat 三处露脸，而**全库零产生方**：
//        knows() 从不读 timeEnabled，docs/ERROR_CODES.md 里连它一行都没有。
//        本仓点名过的「声明了消费口径、却没有产生方」。
//     ④ `perceive` 第二轴 —— 文件头边界 7 写「『他不知道因为他不在场』与
//        『他在场但没注意到』是两回事」，而实现在人**在场**时直接答 present 就返回，
//        那句话于是**只在注释里成立**。
//
// 【判据结构（与 tests/noesis-v2140.js 同规格）】
//   A 结构 · B 运行时（原版成绿）· C 消费方（诊断真读者 + 面板真渲染）
//   N0–N6 真源码破坏 ⇒ 破坏副本上重跑同款真判据；N5 纯度：真文件逐字未变。
//   判据一律**自己造世界**（判据要的场必须自己造；环境的不确定性不是判据的一部分）。
'use strict';
const fs = require('fs');
const path = require('path');
const sync = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const LL = 'engines/lifeline.js', NOE = 'engines/noesis.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js';
const SELF = 'tests/lifeline-v2141.js';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
let fails = 0, checks = 0;
// 宿主断言：run.js 的 runLock 只注入 assert(cond, name)（不注入环境）。
//   故本锁自带 fresh()，并把每条判据上交宿主——否则锁在回归里既不计数、又读 a.product 直接抛。
let HOST = null;
function ok(c, m) {
  checks++;
  if (!c) { fails++; console.log('  ✗ ' + m); }
  else console.log('  ✓ ' + m);
  if (HOST) HOST(!!c, m);
}

let LAST_DOM = null;
function freshWA(ov) {
  const e = sync.fresh(ov ? { srcOverride: ov } : undefined);
  LAST_DOM = e.dom;   // 渲染类判据必须用本 env 的 dom（旧 dom 的按钮绑的是上一版闭包）
  return e.WA;
}
/** 造一个**确定的世界**：清掉别的块留下的账，再按需要登记。 */
function seed(WA, opts) {
  const o = opts || {};
  WA.store.init();
  WA.noesis.setSettings({ enabled: o.enabled !== false, rangeEnabled: o.rangeEnabled !== false, timeEnabled: true });
  if (WA.lifeline && WA.lifeline.setSettings) WA.lifeline.setSettings({ enabled: o.ll !== false });
  if (WA.enigma && WA.enigma.setSettings) WA.enigma.setSettings({ enabled: true });
  // 与 tests/noesis-v2140.js 的 seed 同规：本锁与回归共用同一个 vm 全局与同一份世界存储，
  //   前面几十个块留下的账会让判据读到的不是「只有某一源有账」。
  WA.store.transact(function (d) {
    d.enigma = { rows: [] };
    d.rumor = { chains: [] };
    d.shadow = { rows: [] };
    d.lifeline = { rows: [] };
    d.worldFacts = [];
    d.world = { places: [], roads: [], events: [], journeys: [], blocks: [], shipments: [], messages: [] };
    d.people = d.people || {};
    Object.keys(d.people).forEach(function (k) {
      const p = d.people[k];
      if (p && p.knowledge && Array.isArray(p.knowledge.intel)) p.knowledge.intel = [];
    });
  }, 'lifeline-lock:seed-reset');
  return WA;
}
function renderPeopleHtml(WA) {
  const dom = LAST_DOM;
  if (!dom) throw new Error('mini-DOM 未装');
  const p = dom.getElementById('wa-panel');
  if (!p) throw new Error('面板未注入');
  const tab = p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'people'; })[0];
  if (!tab) throw new Error('找不到人物页签');
  tab.click();
  const body = p.querySelector('.wa-body');
  return body ? String(body.innerHTML || '') : '';
}
function clickLfn(WA, id, fields) {
  renderPeopleHtml(WA);                    // 先渲染，绑定才在树上
  const dom = LAST_DOM;
  Object.keys(fields || {}).forEach(function (k) {
    const el = dom.getElementById(k);
    if (el) el.value = fields[k];
  });
  const btn = dom.getElementById(id);
  if (!btn) throw new Error('找不到 ' + id);
  let threw = null;
  try { if (typeof btn.onclick === 'function') btn.onclick({ target: btn }); } catch (e) { threw = e; }
  const out = dom.getElementById('wa-lfn-out');
  return { text: out ? String(out.textContent || '') : '', threw: threw };
}

// ── 真源码破坏锚点（各须恰中 1 次）────────────────────────────────────
const ANCHORS = {
  // ① lifeline 的程段闸门被去掉 ⇒「昨天病危、今天痊愈」重新合法（跨格不再拒收）
  step: { rel: LL, txt: '    if (ti !== fi && ti !== fi + 1) {',
    to: '    if (false && ti !== fi && ti !== fi + 1) {' },
  // ② lifeline 把「查不到病况」回落成「有读过但无限制」⇒「没病」冒充「查不到」的反面
  unknownCap: { rel: LL, txt: "      return { ok: true, who: who, known: false, band: 'none', limits: {}, rows: [],",
    to: "      return { ok: true, who: who, known: true, band: 'none', limits: {}, rows: []," },
  // ③ noesis 的时点闸门被摘掉 ⇒ premature 重新变成「只声明不产生」
  timeGate: { rel: NOE, txt: '    const tg = timeGate(fid);',
    to: '    const tg = { premature: false };' },
  // ④ noesis 的感知第二轴被摘掉 ⇒ 在场即感知（边界 7 那句话重新只在注释里成立）
  attenuate: { rel: NOE, txt: '      const att = attenuationOf(who);',
    to: '      const att = { impaired: false };' },
  // ⑤ 诊断节不再报 lifeline 读数（作者那面重新变黑）
  diagSec: { rel: DIAG, txt: 'lifeline: secLifeline(), intel: secIntel(),',
    to: 'intel: secIntel(),' },
  // ⑥ 面板不再渲染生理与照护入口
  panel: { rel: PANEL, txt: 'id="wa-lfn-register" title="登记一个病况',
    to: 'id="wa-lfn-register2" title="登记一个病况' }
};
const BROKEN = [
  { key: 'step', spec: ANCHORS.step }, { key: 'unknownCap', spec: ANCHORS.unknownCap },
  { key: 'timeGate', spec: ANCHORS.timeGate }, { key: 'attenuate', spec: ANCHORS.attenuate },
  { key: 'diagSec', spec: ANCHORS.diagSec }, { key: 'panel', spec: ANCHORS.panel }
];
function brokenOverride(spec) {
  const s = src(spec.rel);
  const n = hits(s, spec.txt);
  if (n !== 1) throw new Error('anchor hits ' + n + ' :: ' + spec.key);
  const t = s.split(spec.txt).join(spec.to);
  if (hits(t, spec.to) !== 1) throw new Error('破坏未真的替换掉锚点 :: ' + spec.key);
  const o = {}; o[spec.rel] = t; return o;
}

// ── 判据本体（A 结构 + B 运行时）──────────────────────────────────────
function judge() {
  const WA = freshWA();
  const M = WA.lifeline;
  // A 结构
  ok(!!M && typeof M.register === 'function', 'A1 新模块在场且导出登记口');
  const need = ['register', 'advance', 'capacityOf', 'careGap', 'view', 'boundary', 'buildBlock', 'stat'];
  ok(need.every(function (k) { return typeof M[k] === 'function'; }), 'A2 八口齐备（缺一个就是断链）');
  { const W = seed(freshWA(), { ll: false });
    const g0 = W.lifeline.getSettings();
    ok(g0.enabled === false, 'A3 总开关默认关闭（未开就不干预）');
  }
  // 四张词表齐全（判据口径的可观测面）
  ok(M.KINDS.length >= 4 && M.COURSE.length === 7 && M.LIMITS.length >= 8 && M.STEPS.length === 7,
    'A4 四张具名表齐全（KINDS ' + M.KINDS.length + ' / COURSE ' + M.COURSE.length
    + ' / LIMITS ' + M.LIMITS.length + ' / STEPS ' + M.STEPS.length + '）');

  // B 运行时 · lifeline
  { const W = seed(freshWA(), {});
    const r = W.lifeline.register('甲', '慢性腰痛', { kind: 'chronic', course: 'progress', limits: ['energy', 'sleep'] });
    ok(r.ok === true && r.course === 'progress', 'B1 登记病况（唯一创建口）');
    const dup = W.lifeline.register('甲', '慢性腰痛', { kind: 'chronic', course: 'progress' });
    ok(dup.ok === false && dup.reason === 'exists', 'B2 同名重登记必须显式 replace（不静默覆盖）');
    const bad = W.lifeline.register('甲', '怪症', { kind: '没这个类别' });
    ok(bad.ok === false && bad.reason === 'bad-kind', 'B3 自造类别拒收（自造限制等于自造判定）');
    const bad2 = W.lifeline.register('甲', '怪症', { kind: 'acute', limits: ['我不会累'] });
    ok(bad2.ok === false && bad2.reason === 'bad-value', 'B4 自造限制拒收（不成表的判定，下一手无法接手）');
  }
  // B5 程段不跳：只许前进一格或原地
  { const W = seed(freshWA(), {});
    W.lifeline.register('乙', '创伤后应激', { kind: 'trauma', course: 'onset' });
    const jump = W.lifeline.advance('乙', '创伤后应激', 'recovery');
    ok(jump.ok === false && jump.reason === 'bad-value' && jump.from === 'onset' && jump.to === 'recovery',
      'B5 跨格拒收并带 from/to（「病危→痊愈」不是合法推演）');
    const back = W.lifeline.advance('乙', '创伤后应激', 'onset');
    ok(back.ok === true, 'B6 原地合法（状态维持是一等结果）');
    const fwd = W.lifeline.advance('乙', '创伤后应激', 'progress');
    ok(fwd.ok === true && fwd.from === 'onset' && fwd.to === 'progress', 'B7 前进一格合法');
    const un = W.lifeline.advance('乙', '从没登记过的病', 'progress');
    ok(un.ok === false && un.reason === 'unknown-subject', 'B8 未登记不许推进（本模块零诊断）');
  }
  // B9 容量面：known:false（查不到）与「有读数但无限制」严格分开
  { const W = seed(freshWA(), {});
    const r0 = W.lifeline.capacityOf('丙');
    ok(r0.ok === true && r0.known === false, 'B9 无登记 ⇒ known:false（「查不到」不许冒充「他很健康」）');
    W.lifeline.register('丙', '旧伤', { kind: 'injury', limits: ['mobility'] });
    const r1 = W.lifeline.capacityOf('丙');
    ok(r1.ok === true && r1.known === true && r1.limits.mobility === 1, 'B10 容量面报限制档（哪些活动受限）');
    ok(r1.known !== r0.known, 'B11 known:false 与 known:true 不同形（两态不可分是本仓反复治的病）');
  }
  // B12 照护缺口：只报流程差，不写结果
  { const W = seed(freshWA(), {});
    W.lifeline.register('丁', '待查的肿块', { kind: 'acute', care: ['triage'] });
    const g = W.lifeline.careGap('丁', '待查的肿块');
    ok(g.ok === true && g.done.length === 1 && g.gap.length === 6 && g.complete === false,
      'B12 照护缺口按七步报「哪几步没落账」');
    ok(g.gap.indexOf('access') >= 0, 'B13 可及性单列一步（流程差与门槛是两类事）');
  }
  // B14 注入块：开启才有、且只列程段与限制
  { const W = seed(freshWA(), {});
    W.lifeline.register('戊', '哮喘', { kind: 'chronic', course: 'stable', limits: ['energy', 'sensory'] });
    const bb = W.lifeline.buildBlock();
    ok(bb.indexOf('[生理与照护]') === 0, 'B14 注入块有源名');
    ok(bb.indexOf('stable') > 0 && bb.indexOf('energy') > 0, 'B15 注入块列程段与限制档');
    const W2 = seed(freshWA(), { ll: false });
    ok(W2.lifeline.buildBlock() === '', 'B16 关闭时注入块为空串（零 token 占用）');
  }
  // B17 boundary 零副作用
  { const W = seed(freshWA(), {});
    W.lifeline.register('己', '偏头痛', { kind: 'chronic' });
    const b0 = W.lifeline.stat().regs;
    const b = W.lifeline.boundary();
    ok(b.regs === b0 && Array.isArray(b.COURSE) && b.COURSE.length === 7, 'B17 boundary 只读（不跑登记，读数不涨）');
  }
  // B18 挤出站点真登记（unknown-site 是静默失败，必须当场现形）
  { const W = seed(freshWA(), {});
    const arr = [];
    for (let i = 0; i < 20; i++) arr.push({ who: 'x' + i });
    const e = W.evict.array(arr, 'lifeline.rows');
    ok(e.ok === true && arr.length === 12, 'B18 lifeline.rows 站点已登记（真截断到 12）');
  }
  // ── B19 起：noesis 两处形态修复 + 两个新码 ──
  const Ns = WA.noesis;
  // B19 intel 源真投票：intel 有账 ⇒ 该源不再「无话可说」
  { const W = seed(freshWA(), {});
    if (W.intel && W.intel.setSettings) W.intel.setSettings({ enabled: true });
    if (W.intel && W.intel.addIntel) {
      // `about` 必须先被 knownCause 认得（世界事实 / 事件 / 暗流），否则 addIntel 会以
      //   unknown-subject 拒收 —— 「情报不得凭空挂在一件不存在的事上」是 intel 的既有纪律。
      W.store.transact(function (d) {
        const t0 = W.clock ? W.clock.now('lock:intel') : Date.now();
        d.worldFacts = [
          { id: 'wf_port', key: '码头私货', value: '夜里卸货', at: t0 },
          { id: 'wf_other', key: '别的事', value: '与此事无关', at: t0 }
        ];
      }, 'lock:intel-fact');
      W.intel.addIntel('庚', { claim: '码头夜里卸货', source: '眼见', level: 'witness', about: '码头私货' });
      const r = W.noesis.knows('庚', '码头私货');
      ok(r.ok === true && r.known === true && r.knownBy.indexOf('intel') >= 0,
        'B19 intel 源真投票（修好前该源恒 null，「有账」被读成「无账」）');
      // 辛名下有**别的**账（未命中本事实）⇒ intel 认定不知（一票否决）；
      //   这正是修好前的盲区：那时这一步连“不知”都投不出来（源恒返 null）。
      W.intel.addIntel('辛', { claim: '别的一档事', source: '听说', level: 'rumor', about: '码头私货' });
      W.intel.addIntel('辛', { claim: '与此事无关的另一档', source: '传言', level: 'rumor', about: '别的事' });
      const r2 = W.noesis.knows('辛', '码头私货');
      ok(r2.known === true && r2.reason === 'ok', 'B20 名下有本事的账 ⇒ 该源投知情（命中即知）');
      const r3 = W.noesis.knows('辛', '别的事');
      ok(r3.known === true, 'B20b 命中另一档也能被该源认下（逐条取键，不是整张账当一条）');
    } else { ok(false, 'B19 intel 不可用'); ok(false, 'B20'); }
  }
  // B21 shadow 未命中一律缺席：名下有**别的**共同隐瞒，不得把无关的事判成「不知」
  { const W = seed(freshWA(), {});
    if (W.shadow && W.shadow.setSettings) W.shadow.setSettings({ enabled: true });
    if (W.shadow && W.shadow.addShadow) {
      W.shadow.addShadow('壬', '癸', { kind: 'debt', stakes: 'high' });
      const r = W.noesis.knows('壬', '一件毫无关系的公开事');
      ok(r.known === null && r.reason === 'not-registered',
        'B21 无关的共同隐瞒不得冒充否决（修好前此处答 not-holder：凭空多一票）');
    } else { ok(false, 'B21 shadow 不可用'); }
  }
  // B22 premature：过去的事实不触发，未来的事实触发（且与 not-holder 不同码）
  { const W = seed(freshWA(), {});
    const now = W.clock ? W.clock.now('lock:prem') : Date.now();
    W.store.transact(function (d) {
      d.worldFacts = [
        { id: 'f1', key: '已经发生的事', value: 'x', at: now - 60000 },
        { id: 'f2', key: '尚未发生的事', value: 'y', at: now + 600000 }
      ];
    }, 'lock:prem-set');
    const past = W.noesis.knows('甲', '已经发生的事');
    ok(past.reason !== 'premature', 'B22 已发生的事不触发时点闸门');
    const future = W.noesis.knows('甲', '尚未发生的事');
    ok(future.ok === true && future.known === false && future.reason === 'premature' && future.deniedBy[0] === 'premature',
      'B23 未来的事 ⇒ premature（timeEnabled 由此第一次被真消费）');
    ok(future.reason !== past.reason, 'B24 时辰未到与人在界外不同码（不可合并）');
    ok(W.noesis.stat().premature >= 1, 'B25 premature 计数单列（不与 denies 合并）');
  }
  // B26 timeEnabled 真关 ⇒ 时点闸门不参与（开关是开关，不是装饰）
  { const W = seed(freshWA(), {});
    const now = W.clock ? W.clock.now('lock:prem2') : Date.now();
    W.store.transact(function (d) { d.worldFacts = [{ id: 'f3', key: '未来的事2', value: 'z', at: now + 600000 }]; }, 'lock:prem2');
    W.noesis.setSettings({ timeEnabled: false });
    const r = W.noesis.knows('甲', '未来的事2');
    ok(r.reason !== 'premature', 'B26 timeEnabled 关闭时不报 premature（开关真被读）');
  }
  // B27 感知第二轴：在场 + 容量削弱 ⇒ impaired/attenuated，与「不在场」不同形
  { const W = seed(freshWA(), {});
    const now = W.clock ? W.clock.now('lock:att') : Date.now();
    W.store.transact(function (d) {
      d.world.places = [{ id: 'pl', name: '闸门试场', kind: 'room', open: 0, close: 0, at: now }];
      d.people = d.people || {};
      d.people['p_甲'] = d.people['p_甲'] || { id: 'p_甲', name: '甲' };
      d.people['p_甲'].life = { goals: [], schedule: [] };
    }, 'lock:att-set');
    const clean = W.noesis.perceive('甲', '闸门试场');
    ok(clean.range === 'present', 'B27 无削弱 ⇒ 在场（第一轴成立）');
    W.lifeline.register('甲', '重度认知负荷', { kind: 'mental', limits: ['cognition', 'sensory', 'sleep'] });
    const weak = W.noesis.perceive('甲', '闸门试场');
    ok(weak.ok === true && weak.range === 'impaired' && weak.reason === 'attenuated',
      'B28 在场但容量削弱 ⇒ impaired/attenuated（边界 7 那句话变成可判定的）');
    ok(weak.range !== clean.range, 'B29 impaired 与 present 不同形（「没注意到」不是「在场一切清楚」）');
    const out = W.noesis.perceive('甲', '没登记过的地方');
    ok(out.range !== 'impaired' && out.reason !== 'attenuated', 'B30 不可达不冒充削弱（两种处置：走开 vs 叫他一声）');
  }
  // B31 act.verdict：四档合法结果
  { const W = seed(freshWA(), {});
    const v = W.act.verdict('move');
    ok(v.ok === true && v.verdict === 'action' && v.allowed.length === 4, 'B31 未受阻 ⇒ action，且四档齐带');
    const d2 = W.act.verdict('wait');
    ok(d2.verdict === 'delay', 'B32 等待/休息落 delay（合法地什么都没做）');
    const r2 = W.act.verdict('work', { blockedReason: 'need-unmet' });
    ok(r2.verdict === 'refuse' && r2.blocked === true, 'B33 资源不够 ⇒ refuse（要写代价与替代）');
    const s2 = W.act.verdict('move', { blockedReason: 'busy' });
    ok(s2.verdict === 'status-quo', 'B34 忙着别的 ⇒ status-quo（维持现状是一等结果）');
    const l2 = W.act.verdict('move', { blockedReason: 'closed' });
    ok(l2.verdict === 'delay', 'B35 门关着 ⇒ delay（时辰不对，不是不愿）');
    ok(W.act.verdict('不存在的种类').ok === false, 'B36 自造种类拒收（不成表的判定）');
  }
}

// ── C 消费方：诊断真读者 + 面板真渲染 ─────────────────────────────────
function consumers() {
  const W = seed(freshWA(), {});
  const col = (W.toolDiag && typeof W.toolDiag.collect === 'function') ? W.toolDiag.collect() : null;
  const ld = col && col.lifeline;
  ok(!!ld, 'C0 诊断节 lifeline 可读（collect().lifeline）');
  if (ld) {
    ok(ld.kinds >= 4 && ld.course === 7 && ld.steps === 7, 'C1 诊断面报四张词表规模');
    ok(ld.regs !== undefined && ld.reads !== undefined, 'C2 诊断面报登记数与读数');
  } else { ok(false, 'C1'); ok(false, 'C2'); }
  // noesis 诊断面把两个新读数分开报
  const nd = col && col.noesis;
  if (nd) {
    ok(nd.premature !== undefined, 'C3 诊断面单列 premature（不与 denies 合并）');
    ok(nd.perceiveIn !== undefined && nd.perceiveOut !== undefined, 'C4 诊断面分开报感知三态');
  } else { ok(false, 'C3'); ok(false, 'C4'); }
  // 注入源表三面同批
  const inj = src('render/inject.js');
  ok(hits(inj, "\n    'lifeline',") === 1 && hits(inj, "source: '生理与照护'") === 1
    && hits(inj, 'lifeline: true') === 1 && hits(inj, "lifeline: '生理与照护'") === 1,
    'C5 注入源表四张与注入分支同批增长（单边增长 = 幽灵开关或零效果）');

  const W2 = seed(freshWA(), {});
  let html = '';
  try { html = renderPeopleHtml(W2); } catch (e) { html = 'THREW:' + (e && e.message); }
  ok(hits(html, 'id="wa-lfn-register"') === 1, 'C6 人物页真渲染出登记入口（渲染链路可用）');
  ok(hits(html, 'id="wa-lfn-advance"') === 1 && hits(html, 'id="wa-lfn-capacity"') === 1, 'C7 三枚入口齐备');
  W2.lifeline.setSettings({ enabled: true });
  const c1 = clickLfn(W2, 'wa-lfn-register', { 'wa-lfn-person': '庚', 'wa-lfn-cond': '试登记况', 'wa-lfn-kind': 'acute', 'wa-lfn-limits': 'energy、sleep' });
  ok(c1.threw === null && hits(c1.text, '已登记') === 1, 'C8 点登记后真带结论（用户那面看得见）');
  const c2 = clickLfn(W2, 'wa-lfn-advance', { 'wa-lfn-person': '庚', 'wa-lfn-cond': '试登记况', 'wa-lfn-course': 'progress' });
  ok(hits(c2.text, 'onset') === 1 && hits(c2.text, 'progress') === 1, 'C9 点推进后带 from → to（程段可核）');
  const c3 = clickLfn(W2, 'wa-lfn-capacity', { 'wa-lfn-person': '庚' });
  ok(hits(c3.text, '容量') === 1 && hits(c3.text, '累计') === 1, 'C10 容量读数带累计面（stat 有真读者）');
  const c4 = clickLfn(W2, 'wa-lfn-gap', { 'wa-lfn-person': '庚', 'wa-lfn-cond': '试登记况' });
  ok(hits(c4.text, '照护缺口') === 1, 'C11 照护缺口有读数');
  // 未开开关时必须**显式报出**（不留空面板）
  const offW = seed(freshWA(), { ll: false });
  const c5 = clickLfn(offW, 'wa-lfn-capacity', { 'wa-lfn-person': '庚' });
  ok(hits(c5.text, '未记录') === 1, 'C12 开关未开时如实报出（「没算」与「算出来没限制」不许同形）');
}

// ── 每条破坏在破坏副本上重跑同款真判据 ────────────────────────────────
function mustFail(key, mk) {
  switch (key) {
    case 'step': { const W = mk();
      W.lifeline.register('乙', '创伤后应激', { kind: 'trauma', course: 'onset' });
      return W.lifeline.advance('乙', '创伤后应激', 'recovery').ok === true; }
    case 'unknownCap': { const W = mk();
      return W.lifeline.capacityOf('丙').known === true; }
    case 'timeGate': { const W = mk();
      const now = W.clock ? W.clock.now('neg') : Date.now();
      W.store.transact(function (d) { d.worldFacts = [{ id: 'nf', key: '未来的事', value: 'z', at: now + 600000 }]; }, 'neg:prem');
      const r = W.noesis.knows('甲', '未来的事');
      return r.reason !== 'premature'; }
    case 'attenuate': { const W = mk();
      const now = W.clock ? W.clock.now('neg2') : Date.now();
      W.store.transact(function (d) {
        d.world.places = [{ id: 'pl', name: '闸门试场', kind: 'room', open: 0, close: 0, at: now }];
        d.people = d.people || {};
        d.people['p_甲'] = d.people['p_甲'] || { id: 'p_甲', name: '甲' };
        d.people['p_甲'].life = { goals: [], schedule: [] };
      }, 'neg2:att');
      W.lifeline.register('甲', '重度认知负荷', { kind: 'mental', limits: ['cognition', 'sensory', 'sleep'] });
      return W.noesis.perceive('甲', '闸门试场').range !== 'impaired'; }
    case 'diagSec': { const W = mk();
      const col = (W.toolDiag && W.toolDiag.collect) ? W.toolDiag.collect().lifeline : null;
      return !col || col.kinds === undefined; }
    case 'panel': { const W = mk(); let h = '';
      try { h = renderPeopleHtml(W); } catch (e) { h = 'THREW'; }
      const want = ANCHORS.panel.txt.split(' title')[0];
      return hits(h, want) !== 1; }
    default: return false;
  }
}
function caseSpec(key) {
  switch (key) {
    case 'unknownCap': return { ll: true };
    case 'timeGate': return {};
    default: return {};
  }
}
function runAll(a) {
  HOST = a;
  console.log('== A/B 判据（原版成绿）==');
  judge();
  console.log('== C 消费方（诊断真读者 + 面板真渲染）==');
  consumers();
  console.log('LIFELINE-V2141: ' + (fails ? 'FAIL ' + fails + '/' + checks : 'pass ' + checks + ' 项'));
  return fails;
}
function runNegative(a) {
  HOST = a;
  let nf = 0;
  console.log('== N0 真源码破坏锚点唯一性 ==');
  BROKEN.forEach(function (b) {
    const n = hits(src(b.spec.rel), b.spec.txt);
    checks++; if (n !== 1) { nf++; console.log('  ✗ N0 锚点不唯一：' + b.key + ' hits=' + n); }
    else console.log('  ✓ N0 ' + b.key + ' 锚点恰中 1 次');
  });
  // H5 判据纯度：锚点字面量只准在 ANCHORS 里声明一次，判据层零内联
  const self = src(SELF);
  const anchorsBlock = self.slice(self.indexOf('const ANCHORS'), self.indexOf('function brokenOverride'));
  const judgeBlock = self.slice(self.indexOf('function mustFail'), self.indexOf('function caseSpec'));
  [ANCHORS.step.txt, ANCHORS.unknownCap.txt, ANCHORS.timeGate.txt,
    ANCHORS.attenuate.txt, ANCHORS.diagSec.txt, ANCHORS.panel.txt].forEach(function (lit) {
    const inAnchors = hits(anchorsBlock, lit);
    const inJudge = hits(judgeBlock, lit);
    checks++;
    if (inAnchors !== 1 || inJudge !== 0) { nf++; console.log('  ✗ H5 纯度：' + JSON.stringify(lit.slice(0, 24)) + ' 声明 ' + inAnchors + ' 次 / 判据内 ' + inJudge + ' 次'); }
    else console.log('  ✓ H5 纯度：锚点只声明 1 次且判据不内联 ' + JSON.stringify(lit.slice(0, 20)));
  });
  // 正控制：原版上同款判据必须**全为假**（否则判据恒真、负控无意义）
  BROKEN.forEach(function (b) {
    let truth = null;
    try { truth = mustFail(b.key, function () { return seed(freshWA(), caseSpec(b.key)); }); }
    catch (e) { truth = 'threw:' + (e && e.message); }
    checks++;
    if (truth !== false) { nf++; console.log('  ✗ 正控制失败：' + b.key + ' 在原版上判据竟为真（' + truth + '）⇒ 判据恒真，这条负控制无意义'); }
    else console.log('  ✓ 正控制：' + b.key + ' 同款判据在原版上为假');
  });
  // N1–N6：每条破坏 ⇒ 装载破坏副本 ⇒ 同款判据必须真现形
  BROKEN.forEach(function (b) {
    let bad = null, err = null;
    try { bad = mustFail(b.key, function () { return seed(freshWA(brokenOverride(b.spec)), caseSpec(b.key)); }); }
    catch (e) { err = e; }
    checks++;
    if (err) { nf++; console.log('  ✗ N 装载/判据抛出 ' + b.key + '：' + (err && err.message)); }
    else if (!bad) { nf++; console.log('  ✗ N 破坏未被观测到：' + b.key + '（破坏副本上判据仍绿 ⇒ 判据无效）'); }
    else console.log('  ✓ N 破坏现形：' + b.key);
  });
  // N5 纯度：全部负控制跑完后，四个真文件逐字未变
  const before = { l: src(LL), n: src(NOE), d: src(DIAG), p: src(PANEL) };
  const after = { l: src(LL), n: src(NOE), d: src(DIAG), p: src(PANEL) };
  checks++;
  if (before.l !== after.l || before.n !== after.n || before.d !== after.d || before.p !== after.p) {
    nf++; console.log('  ✗ N5 纯度：负控制期间真文件被改写（破坏只准发生在内存副本上）');
  } else console.log('  ✓ N5 纯度：四个真文件逐字未变（破坏只发生在内存副本上）');
  console.log('NEGATIVE: ' + (nf ? 'FAIL ' + nf + '/' + checks : 'pass ' + checks + ' 项'));
  return nf;
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, ANCHORS: ANCHORS };
if (require.main === module) {
  const env0 = sync.fresh(); LAST_DOM = env0.dom;
  const a = function (c, m) { if (!c) console.log('  ✗ ' + m); };
  let f = 0;
  try { f += (runAll(a) ? 1 : 0); } catch (e) { console.log('  ✗ runAll 抛出：' + (e && e.message)); f = 1; }
  try { f += (runNegative(a) ? 1 : 0); } catch (e) { console.log('  ✗ runNegative 抛出：' + (e && e.message)); f = 1; }
  console.log(f ? 'LIFELINE-V2141: FAIL' : 'LIFELINE-V2141: pass');
  process.exitCode = f ? 1 : 0;
}
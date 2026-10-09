#!/usr/bin/env node
// WorldAxis tests/fidelity-v2144.js —— v2.144.0（F5）：记忆失真面（记着 ≠ 记对）
//
// 【它治的病：账面上早就有读数，裁决面却看不见】
//   `engines/rumor.js` 从 X3 起就记着三个读数 —— `intact` / `tampered` / `drift`，
//   并在边界注释里把这件事说得极清楚（「未声明的改写一律拒收……`intact` 仍是 true，
//   而值已经不一样了」）。但实测它们的**消费方只有作者面**：
//     · `ui/panel.js` 的链详情 / 查链 / 链列表（三处）；
//     · `engines/tool-diag.js` 的 rumor 计数节。
//   而**裁决面（knows / gateScene / buildBlock）完全不知道「他记的是不是原版」** ——
//   一个只听过失真版本的人，`knows` 照样答 `known:true`，注入块照样告诉模型
//   「该角色知道这件事」。这与 F1（防全知）/ F2（时点与注意力）/ F3（视角锁）/
//   F4（在职 ≠ 在岗）是同一形态的第五例：**声明在注释里，落点不在代码里**。
//
// 【本锁刻意守住的三条「不可合并」】
//   ① `distorted`（记岔了）与 `denies`（不该知道）不是一回事：前者该更正记录，
//      后者该拦住发言。塌成一个「有问题」就再也答不出该动哪一手。
//   ② `known:false`（传播面缺席 / 无此链 / 此人不在链上）不许冒充「原版」——
//      「问不出来」与「问出来是原版」是两种事实，合成一个会把「他压根没听过」
//      读成「他记的是对的」。
//   ③ 本闸门**不进 knows() 的一票否决**：人记岔了，不等于他不知道。
//      把 distorted 塞进 knows 的否决面，会把「他手里是失真版本」读成「他不该知道这件事」——
//      那是另一种失真。两个真源不可合并：knows 答「知道吗」，fidelity 答「记的是原版吗」。
//
// 【本版最要紧的技术判断：链级累积值答不了个人版本】
//   `c.intact` 是**累积值**（`c.intact = !!c.intact && h.intact`）——一旦被改写就再也回不来。
//   但「这个人手里是哪一版」要看**他接到的那一跳**的 `intact`。拿链级累积值去答个人版本，
//   会把「改写在传给他之后才发生」误判成「他手里的也变了」——甲如实收到、乙之后才被改写，
//   甲手里的仍是原版。本锁 N4 专门钉住这一条（把 `recv[...]` 换成 `hops[...]` 必须现形）。
//
// 【判据结构（与 noesis-v2140 / duty-v2143 同规格）】
//   A 结构 · B 运行时（原版成绿）· C 消费方（诊断真读者 + 面板真渲染 + 注入块）
//   N0–N8 真源码破坏 ⇒ 破坏副本上重跑同款真判据；H5 纯度 + N 面真文件逐字未变。
//   判据一律**自己造世界**（用 mk 工厂）：每条判据要的场不同（原版 / 失真 / 不在链上 /
//   轴关），靠别的块留下的环境永远造不出确定的场。
'use strict';
const fs = require('fs');
const path = require('path');
const sync = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const NOE = 'engines/noesis.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js';
const SELF = 'tests/fidelity-v2144.js';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
let fails = 0, checks = 0;
// 宿主断言：run.js 的 runLock 只注入 assert(cond, name)（不注入环境）。
//   故本锁自带 fresh()，并把每条判据上交宿主——否则锁在回归里既不计数、
//   又因读 a.product 直接抛 undefined（noesis-v2140 首版实测过这个形态）。
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
/**
 * 造一个确定的世界：init → 开 noesis/rumor/intel → 直写 worldFacts → 起链 → 逐跳。
 *
 *   两条口径与见证段（tests/reject-v2780.js ⑨）同源：
 *   ① 事实真源走 `worldFacts` **直写** —— `rumor.factRow` 的真源之一是 `state().worldFacts`，
 *      而 `memory.upsertFact` 需要 memory 先初始化（见证表实测会抛 `reading 'facts'`）。
 *      造场不该依赖那条前置。
 *   ② 链与跳都由**真接口**建立（startChain / relay），不手搓 `d.rumor.chains` ——
 *      手搓出来的 `intact` 是造场者自己写的，判据就变成「自己证自己」。
 */
function seed(WA, spec) {
  spec = spec || {};
  WA.store.init();
  WA.noesis.setSettings({ enabled: true, fidelityEnabled: true });
  if (WA.rumor && WA.rumor.setSettings) WA.rumor.setSettings({ enabled: true });
  if (WA.intel && WA.intel.setSettings) WA.intel.setSettings({ enabled: true });
  const key = spec.fact || '源事';
  WA.store.transact(function (d) {
    d.worldFacts = [{ key: key, value: spec.value || '甲见过乙', reason: 'witness', active: true }];
    d.rumor = { chains: [] };
  }, 'fid-lock:seed-reset');
  if (spec.noChain) return WA;              // 不起链：本面自然缺席
  const sc = WA.rumor.startChain(key, '见证');
  if (!sc || sc.ok !== true || sc.reason === 'disabled') throw new Error('起链失败：' + JSON.stringify(sc));
  (spec.hops || []).forEach(function (h) {
    const item = { from: h[0], to: h[1], motive: h[2] || 'honest' };
    if (h[3] !== undefined) item.value = h[3];
    const r = WA.rumor.relay('rm_' + key, item);
    if (!r || r.ok !== true) throw new Error('一跳失败：' + JSON.stringify(r) + ' :: ' + JSON.stringify(item));
  });
  return WA;
}
function env(spec) {
  const WA = freshWA();
  spec = spec || {};
  if (spec.raw) { WA.store.init(); WA.noesis.setSettings({ enabled: false }); return WA; }
  return seed(WA, spec);
}
function envBroken(spec, ov) {
  const WA = freshWA(ov);
  spec = spec || {};
  if (spec.raw) { WA.store.init(); WA.noesis.setSettings({ enabled: false }); return WA; }
  return seed(WA, spec);
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
function clickNoe(WA, id, person, fact) {
  renderPeopleHtml(WA);                    // 先渲染，绑定才在树上
  const dom = LAST_DOM;
  if (person !== undefined) { const el = dom.getElementById('wa-noe-person'); if (el) el.value = person; }
  if (fact !== undefined) { const el = dom.getElementById('wa-noe-fact'); if (el) el.value = fact; }
  const btn = dom.getElementById(id);
  if (!btn) throw new Error('找不到 ' + id);
  let threw = null;
  try { if (typeof btn.onclick === 'function') btn.onclick({ target: btn }); } catch (e) { threw = e; }
  const out = dom.getElementById('wa-noe-out');
  return { text: out ? String(out.textContent || '') : '', threw: threw };
}
// ── 真源码破坏锚点（各须恰中 1 次）────────────────────────────────────
const ANCHORS = {
  // ① 总开关闸被摘掉 ⇒ 关闭态下不再拒收 disabled，「没开闸」被当成真有话可说
  master: { rel: NOE, txt: "  function fidelityGate(person, factId) {\n    const cfg = settings();\n    if (!cfg.enabled) return { known: false, reason: 'disabled' };",
    to: "  function fidelityGate(person, factId) {\n    const cfg = settings();\n    if (false && !cfg.enabled) return { known: false, reason: 'disabled' };" },
  // ② 第四轴闸被摘掉 ⇒ 关掉失真面之后照旧给出判决（一轴缺席被冒充成有结论）
  axisOff: { rel: NOE, txt: "    if (!cfg.fidelityEnabled) return { known: false, faithful: null, reason: 'fidelity-off' };",
    to: "    if (false && !cfg.fidelityEnabled) return { known: false, faithful: null, reason: 'fidelity-off' };" },
  // ③ 「此人不在链上」被回落成「原版」⇒ 问不出来与问出来是原版同形（本锁最要紧的那条不可合并）
  onchain: { rel: NOE, txt: "    if (!recv.length) return { known: false, who: who, fact: fid, reason: 'not-on-chain' };",
    to: "    if (!recv.length) return { known: true, faithful: true, reason: 'faithful', who: who, fact: fid };" },
  // ④ 取**全链最后一跳**代替**他接到的那一跳** ⇒ 改写在传给他之后才发生时，他被误判成失真
  lastHop: { rel: NOE, txt: "    const last = recv[recv.length - 1];",
    to: "    const last = hops[hops.length - 1];" },
  // ⑤ 原版判据被翻面 ⇒ 接到原版的人被答成失真
  intact: { rel: NOE, txt: "    if (last.intact === true) {",
    to: "    if (last.intact === false) {" },
  // ⑥ 失真读数不再进位 ⇒ 诊断面「有几处记岔了」恒为零
  counter: { rel: NOE, txt: "    stat.distorted = (stat.distorted || 0) + 1;",
    to: "    stat.distorted = (stat.distorted || 0) + 0;" },
  // ⑦ 注入链的失真纪律段被摘掉 ⇒ 模型那面重新不知道「记着 ≠ 记对」
  block: { rel: NOE, txt: "    if (cfg.fidelityEnabled && stat.distorted > 0) {",
    to: "    if (false && cfg.fidelityEnabled && stat.distorted > 0) {" },
  // ⑧ 诊断面不再报第四轴开关位 ⇒ 「这一轴真关还是真开」在诊断包里无从查
  diag: { rel: DIAG, txt: "        fidelityEnabled: !!b.fidelityEnabled, distorted: b.distorted || 0",
    to: "        fidelityEnabled: undefined, distorted: b.distorted || 0" },
  // ⑨ 面板不再渲染失真核查入口（用户那面重新变黑）
  panel: { rel: PANEL, txt: 'id="wa-noe-fidelity" title="记忆失真核查',
    to: 'id="wa-noe-fidelity2" title="记忆失真核查' }
};
const BROKEN = [
  { key: 'master', spec: ANCHORS.master }, { key: 'axisOff', spec: ANCHORS.axisOff },
  { key: 'onchain', spec: ANCHORS.onchain }, { key: 'lastHop', spec: ANCHORS.lastHop },
  { key: 'intact', spec: ANCHORS.intact }, { key: 'counter', spec: ANCHORS.counter },
  { key: 'block', spec: ANCHORS.block }, { key: 'diag', spec: ANCHORS.diag },
  { key: 'panel', spec: ANCHORS.panel }
];
function brokenOverride(spec) {
  const s = src(spec.rel);
  const n = hits(s, spec.txt);
  if (n !== 1) throw new Error('anchor hits ' + n + ' :: ' + spec.key);
  const t = s.split(spec.txt).join(spec.to);
  if (hits(t, spec.to) !== 1) throw new Error('破坏未真的替换掉锚点 :: ' + spec.key);
  const o = {}; o[spec.rel] = t; return o;
}
// ── 造场素材：一条链的两种场（原版持有者 / 失真持有者）─────────────────
//   场 A：源头 →（honest）甲        ⇒ 甲手里是原版。
//   场 B：源头 →（honest）甲 →（distort）乙 ⇒ 乙手里是失真版本，**而甲手里仍是原版**。
//   场 B 是 B3/N4 的现场：链级 `intact` 此刻已是 false（累积），甲那一跳仍为 true。
const SP_HONEST = { fact: '源事', value: '甲见过乙', hops: [['源头', '甲', 'honest']] };
const SP_MIXED = { fact: '源事', value: '甲见过乙',
  hops: [['源头', '甲', 'honest'], ['甲', '乙', 'distort', '乙听说甲见过丙']] };
// ── 判据本体（A 结构 + B 运行时）──────────────────────────────────────
function judge() {
  const WA = freshWA();
  const M = WA.noesis;
  // A 结构
  ok(typeof M.fidelity === 'function', 'A1 记忆失真面在场且导出（fidelity 是第四轴，不是又一个死导出）');
  ok(M.getSettings().fidelityEnabled === true, 'A2 第四轴默认开启（与空间 / 时点 / 在岗并列，但总开关仍默认关）');
  { const W = env({ raw: true });
    ok(W.noesis.getSettings().enabled === false, 'A3 总开关默认关闭（未开就不干预）');
  }
  { const W = env(SP_HONEST);
    ok(W.noesis.stat().fidelityEnabled === true, 'A4 开关位可从 stat() 复算（「这一轴真开还是真关」可查）');
  }
  // B 运行时：四态严格分开
  { const W = env(SP_HONEST);
    const r = W.noesis.fidelity('甲', '源事');
    ok(r.known === true && r.faithful === true && r.reason === 'faithful', 'B1 接到原版 ⇒ faithful（正常归因，不是拒收码）');
    ok(r.value === '甲见过乙' && r.hops === 1, 'B2 faithful 带值与跳数（结论可复算，不是布尔）');
  }
  { const W = env(SP_MIXED);
    const r = W.noesis.fidelity('乙', '源事');
    ok(r.known === true && r.faithful === false && r.reason === 'distorted', 'B3 接到被改写过的版本 ⇒ distorted（记着 ≠ 记对，本版要治的那句话）');
    ok(!!r.drift && r.drift.from === '甲见过乙' && r.drift.to === '乙听说甲见过丙', 'B4 distorted 带改写前后的值（drift.from → drift.to，作者据此更正）');
    ok(r.via === 'distort', 'B5 distorted 带经手动机（是谁以什么动机改的）');
  }
  // B6 **本版最要紧的技术判断**：链级累积值答不了个人版本
  { const W = env(SP_MIXED);
    const inv = W.rumor.investigate('rm_源事');
    ok(inv.intact === false, 'B6 造场自证：链级 intact 已为假（累积值，一旦被改写就再也回不来）');
    const r = W.noesis.fidelity('甲', '源事');
    ok(r.known === true && r.faithful === true,
      'B7 **改写在传给他之后才发生** ⇒ 甲手里仍是原版（拿链级累积值答个人版本会误判成本条失真）');
    ok(r.hops === 2, 'B8 甲那一跳的跳序仍如实带出（他接到的是第 1 跳，不是全链最后一跳）');
  }
  // B9 缺席三态：不在链上 / 无此链 / 传播面缺席 —— 一律不冒充原版
  { const W = env(SP_HONEST);
    const r = W.noesis.fidelity('壬', '源事');
    ok(r.known === false && r.reason === 'not-on-chain', 'B9 不在该链上 ⇒ not-on-chain（没接到过，谈不上他手里是哪一版）');
    ok(r.faithful !== true, 'B10 缺席不冒充原版（「问不出来」≠「问出来是原版」）');
    const r2 = W.noesis.fidelity('甲', '不存在的事');
    ok(r2.known === false && r2.reason !== 'distorted' && r2.faithful !== true,
      'B11 无此链 ⇒ 缺席（「没这条链」不塌进「失真」也不塌进「原版」）');
    const r3 = env({ noChain: true }).noesis.fidelity('甲', '源事');
    ok(r3.known === false && r3.faithful !== true, 'B12 传播面上一条链都没有 ⇒ 缺席（不猜）');
  }
  // B13 两道前置闸
  { const W = env({ raw: true });
    const r = W.noesis.fidelity('甲', '源事');
    ok(r.known !== true && r.reason === 'disabled', 'B13 总开关关闭 ⇒ disabled（不猜）');
  }
  { const W = env(SP_MIXED);
    W.noesis.setSettings({ fidelityEnabled: false });
    const r = W.noesis.fidelity('乙', '源事');
    ok(r.reason === 'fidelity-off' && r.known === false, 'B14 第四轴单独关闭 ⇒ fidelity-off（如实报这一轴缺席）');
    ok(r.faithful === null, 'B15 轴关时 faithful 为 null —— **不回落成「他记的是原版」**（与 duty-off 同规格）');
  }
  { const W = env(SP_HONEST);
    ok(W.noesis.fidelity('', '源事').reason === 'missing-fields', 'B16 人物缺失 ⇒ missing-fields（不猜）');
    ok(W.noesis.fidelity('甲', '').reason === 'missing-fields', 'B17 事实名缺失 ⇒ missing-fields（不猜）');
  }
  // B18 读数进位由**真调用**驱动；且只对失真进位
  { const W = env(SP_MIXED);
    const b0 = W.noesis.boundary();
    ok(b0.distorted === 0 && b0.fidelityEnabled === true, 'B18 boundary 报第四轴开关位与失真计数（只读现场）');
    W.noesis.fidelity('甲', '源事');                       // 原版：不进位
    ok(W.noesis.boundary().distorted === 0, 'B19 原版核查不进失真账（faithful 不是「记岔了」）');
    W.noesis.fidelity('乙', '源事');                       // 失真：进位
    ok(W.noesis.boundary().distorted === 1, 'B20 失真核查进账一次（读数由真调用驱动，不是空壳常量）');
    W.noesis.fidelity('乙', '源事');                       // 再查一次：仍如实报失真
    ok(W.noesis.fidelity('乙', '源事').reason === 'distorted', 'B21 重复核查不改判（同一场同一人恒答同一码）');
  }
  // B22 boundary 只读：不跑 fidelity、不污染计数
  { const W = env(SP_MIXED);
    W.noesis.fidelity('乙', '源事');
    const n0 = W.noesis.boundary().distorted;
    W.noesis.boundary(); W.noesis.boundary();
    ok(W.noesis.boundary().distorted === n0, 'B22 boundary 是纯读（连查三次读数不变）');
  }
  // B23 「只报不改」：核查不写链、不改值
  { const W = env(SP_MIXED);
    const before = JSON.stringify(W.store.get().rumor);
    W.noesis.fidelity('乙', '源事');
    const after = JSON.stringify(W.store.get().rumor);
    ok(before === after, 'B23 只报不改：核查不写链、不改值（更正记录是叙事决定，不是引擎决定）');
  }
  // B24 本闸门**不进 knows() 的一票否决**：人记岔了，不等于他不知道
  { const W = env(SP_MIXED);
    const f = W.noesis.fidelity('乙', '源事');
    const k = W.noesis.knows('乙', '源事');
    ok(f.reason === 'distorted', 'B24 造场自证：乙手里确实是失真版本（distorted）');
    ok((k.deniedBy || []).indexOf('distorted') < 0, 'B25 distorted 不混进 knows 的 deniedBy（合报即另一种失真）');
    ok(JSON.stringify(k).indexOf('distorted') < 0, 'B26 knows 的返回里没有失真码的任何痕迹（两个真源不可合并）');
    const kA = W.noesis.knows('甲', '源事');
    ok(kA.known === true && W.noesis.fidelity('甲', '源事').faithful === true,
      'B27 知情面与失真面各答各的：甲「知道」（known:true）且「记的是原版」（faithful:true）');
  }
  // B28 失真纪律真进注入块（且有账才提 —— 零 token 占用）
  { const W = env(SP_MIXED);
    ok(W.noesis.buildBlock().indexOf('记着不等于记对') < 0, 'B28 无失真账时注入块不提失真（零账零 token）');
    W.noesis.fidelity('乙', '源事');
    const bb = W.noesis.buildBlock();
    ok(bb.indexOf('记着不等于记对') >= 0, 'B29 有失真账时注入块带失真纪律（模型那面知道「记着 ≠ 记对」）');
    ok(bb.indexOf('源事') < 0 && bb.indexOf('乙') < 0, 'B30 注入块不列事实名/人名（列出即把未揭示的失真写进正文）');
  }
  { const W = env({ raw: true });
    ok(W.noesis.buildBlock() === '', 'B31 关闭时 buildBlock 为空串（零 token）');
  }
}
// ── C 消费方：诊断真读者 + 面板真渲染 ─────────────────────────────────
function consumers() {
  const W = env(SP_MIXED);
  W.noesis.fidelity('乙', '源事');
  const col = (W.toolDiag && typeof W.toolDiag.collect === 'function') ? W.toolDiag.collect() : null;
  const nd = col && col.noesis;
  ok(!!nd, 'C0 诊断节 noesis 可读（collect().noesis）');
  if (nd) {
    ok(nd.fidelityEnabled === true, 'C1 诊断面报第四轴开关位（「这一轴真关还是真开」可查）');
    ok(nd.distorted === 1, 'C2 失真数**单列报**（distorted 1 —— 与 denies 分开，处置不同）');
  } else { ok(false, 'C1 诊断节不可用'); ok(false, 'C2'); }
  const W2 = env(SP_HONEST);
  let html = '';
  try { html = renderPeopleHtml(W2); } catch (e) { html = 'THREW:' + (e && e.message); }
  ok(hits(html, 'id="wa-noe-fidelity"') === 1, 'C3 人物页真渲染出失真核查入口（渲染链路可用）');
  const c1 = clickNoe(W2, 'wa-noe-fidelity', '甲', '源事');
  ok(c1.threw === null, 'C4 点失真核查未抛异常（真绑定可用）');
  ok(hits(c1.text, '原版') === 1, 'C5 原版场真报「原版」（用户那面看得见）');
  const W3 = env(SP_MIXED);
  const c2 = clickNoe(W3, 'wa-noe-fidelity', '乙', '源事');
  ok(hits(c2.text, '已失真') === 1, 'C6 失真场真报「已失真」（两态在用户那面也不同形）');
  ok(hits(c2.text, '乙听说甲见过丙') >= 1, 'C7 面板带出改写后的值（作者据此更正）');
  const c3 = clickNoe(env(SP_HONEST), 'wa-noe-fidelity', '壬', '源事');
  ok(hits(c3.text, '无话可说') === 1, 'C8 不在链上时如实报「无话可说」（问不出来不冒充原版）');
  const W4 = env(SP_MIXED);
  W4.noesis.setSettings({ fidelityEnabled: false });
  const c4 = clickNoe(W4, 'wa-noe-fidelity', '乙', '源事');
  ok(hits(c4.text, '已关') >= 1, 'C9 轴关时如实报「这一轴已关」（不冒充「他记的是原版」）');
}
// ── 每条破坏在破坏副本上重跑同款真判据 ────────────────────────────────
//   mk 由调用方给：正控制传「原版工厂」，负控制传「破坏副本工厂」。判据自己造世界。
function mustFail(key, mk) {
  switch (key) {
    case 'master': { const W = mk();   // 总开关闸被摘 ⇒ 关闭态下不再拒收 disabled
      return W.noesis.fidelity('甲', '源事').reason !== 'disabled'; }
    case 'axisOff': { const W = mk();  // 第四轴闸被摘 ⇒ 关掉该轴后照旧给判决
      W.noesis.setSettings({ fidelityEnabled: false });
      const r = W.noesis.fidelity('甲', '源事');
      return r.reason !== 'fidelity-off'; }
    case 'onchain': { const W = mk();  // 不在链上被回落成原版
      return W.noesis.fidelity('壬', '源事').known === true; }
    case 'lastHop': { const W = mk();  // 取全链最后一跳 ⇒ 甲被误判成失真
      return W.noesis.fidelity('甲', '源事').faithful === false; }
    case 'intact': { const W = mk();   // 原版判据被翻面
      return W.noesis.fidelity('甲', '源事').faithful === false; }
    case 'counter': { const W = mk();  // 失真读数不再进位
      W.noesis.fidelity('乙', '源事');
      return W.noesis.boundary().distorted !== 1; }
    case 'block': { const W = mk();    // 注入链失真纪律被摘
      W.noesis.fidelity('乙', '源事');
      return W.noesis.buildBlock().indexOf('记着不等于记对') < 0; }
    case 'diag': { const W = mk();     // 诊断面不再报第四轴开关位
      const col = (W.toolDiag && W.toolDiag.collect) ? W.toolDiag.collect().noesis : null;
      return !col || col.fidelityEnabled !== true; }
    case 'panel': { const W = mk(); let h = '';
      try { h = renderPeopleHtml(W); } catch (e) { h = 'THREW'; }
      return hits(h, ANCHORS.panel.txt.split(' title')[0]) !== 1; }
    default: return false;
  }
}
// ── 用例世界：每条判据要的场不同（判据自己造，见上）──────────────────
function caseSpec(key) {
  switch (key) {
    case 'master': return { raw: true };
    case 'axisOff': return SP_HONEST;
    case 'onchain': return SP_HONEST;
    case 'lastHop': return SP_MIXED;
    case 'intact': return SP_HONEST;
    case 'counter': return SP_MIXED;
    case 'block': return SP_MIXED;
    case 'diag': return SP_MIXED;
    case 'panel': return SP_HONEST;
    default: return SP_HONEST;
  }
}
function runAll(a) {
  HOST = a;                                  // 判据上交宿主（见文件头「宿主断言」段）
  console.log('== A/B 判据（原版成绿）==');
  judge();
  console.log('== C 消费方（诊断真读者 + 面板真渲染）==');
  consumers();
  console.log('FIDELITY-V2144: ' + (fails ? 'FAIL ' + fails + '/' + checks : 'pass ' + checks + ' 项'));
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
  // H5 判据纯度：判据层不许内联锚点串（锚点字面量只准在 ANCHORS 里声明一次）
  //   比的是**语义串**：锚点 txt 在源码里以 `\n` / `\"` / `\'` 的转义形态出现，
  //   故两侧统一反转义后再计数（否则带换行或双引号的锚点恒为 0 次，纯度检查形同虚设）。
  const unesc = function (x) {
    return String(x).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\'/g, "'");
  };
  const self = unesc(src(SELF));
  const anchorsBlock = self.slice(self.indexOf('const ANCHORS'), self.indexOf('function brokenOverride'));
  const judgeBlock = self.slice(self.indexOf('function mustFail'), self.indexOf('function caseSpec'));
  BROKEN.forEach(function (b) {
    const lit = unesc(b.spec.txt);
    const inAnchors = hits(anchorsBlock, lit);
    const inJudge = hits(judgeBlock, lit);
    checks++;
    if (inAnchors !== 1 || inJudge !== 0) { nf++; console.log('  ✗ H5 纯度：' + b.key + ' 声明 ' + inAnchors + ' 次 / 判据内 ' + inJudge + ' 次'); }
    else console.log('  ✓ H5 纯度：' + b.key + ' 锚点只声明 1 次且判据不内联');
  });
  // 正控制：原版上同款判据必须**全为假**（否则判据恒真、负控无意义）
  BROKEN.forEach(function (b) {
    let truth = null;
    try { truth = mustFail(b.key, function () { return env(caseSpec(b.key)); }); }
    catch (e) { truth = 'threw:' + (e && e.message); }
    checks++;
    if (truth !== false) { nf++; console.log('  ✗ 正控制失败：' + b.key + ' 在原版上判据竟为真（' + truth + '）⇒ 判据恒真，这条负控制无意义'); }
    else console.log('  ✓ 正控制：' + b.key + ' 同款判据在原版上为假');
  });
  // N1–N9：每条破坏 ⇒ 装载破坏副本 ⇒ 同款判据必须真现形
  BROKEN.forEach(function (b) {
    let bad = null, err = null;
    try { bad = mustFail(b.key, function () { return envBroken(caseSpec(b.key), brokenOverride(b.spec)); }); }
    catch (e) { err = e; }
    checks++;
    if (err) { nf++; console.log('  ✗ N 装载/判据抛出 ' + b.key + '：' + (err && err.message)); }
    else if (!bad) { nf++; console.log('  ✗ N 破坏未被观测到：' + b.key + '（破坏副本上判据仍绿 ⇒ 判据无效）'); }
    else console.log('  ✓ N 破坏现形：' + b.key);
  });
  // N 纯度：全部负控制跑完后，三个真文件逐字未变
  const before = { n: src(NOE), d: src(DIAG), p: src(PANEL) };
  const after = { n: src(NOE), d: src(DIAG), p: src(PANEL) };
  checks++;
  if (before.n !== after.n || before.d !== after.d || before.p !== after.p) {
    nf++; console.log('  ✗ N 纯度：负控制期间真文件被改写（破坏只准发生在内存副本上）');
  } else console.log('  ✓ N 纯度：三个真文件逐字未变（破坏只发生在内存副本上）');
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
  console.log(f ? 'FIDELITY-V2144: FAIL' : 'FIDELITY-V2144: pass');
  process.exitCode = f ? 1 : 0;
}

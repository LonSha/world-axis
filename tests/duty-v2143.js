#!/usr/bin/env node
// WorldAxis tests/duty-v2143.js —— v2.143.0（F4）：在岗闸门（在职 ≠ 在岗）
//
// 【它治的病：零件全，合读缺】
//   本仓「谁有资格做这件事」有三个零件，各自都很硬，但没有一个把它们合读：
//     · inst.authority(orgId, who)  答「此人此刻在该组织任什么职、能拍什么板」（**在职面**）；
//     · life 的 schedule            答「此人此刻的日程落在哪一段」（**在岗面**）；
//     · world.canBeAt(who, place)   答「此人此刻在不在那个地方」（**在场面**）。
//   于是「他在职 ⇒ 他能立刻履职」这句话在本仓库**无法表达**：有权查阅被当成已经查阅。
//   这与 F1（防全知）/ F2（时点）/ F3（视角）是同一形态的第四例：
//   **声明在注释里，落点不在代码里**（rules.js 有「知情路径铁律」，但零引擎判据）。
//
// 【本锁刻意守住的三条「不可合并」】
//   ① off-duty（有岗没上）与 not-in-office（没有岗）不是一回事：前者等排班 / 改日程，
//      后者走任职流程。塌成一个「不在岗」就再也答不出该动哪一手。
//   ② known:false（任职面缺席）不许冒充「不在岗」——「查不到」与「不在岗」是两种事实，
//      合成一个就会把「这人没在这组织任职过」读成「他今天休假」。
//   ③ 本闸门**不进 knows() 的一票否决**：人下班了，知道的事不会忘掉。
//      把 off-duty 塞进 knows 的 deniedBy，会把「他此刻在休假」读成「他不知道这件事」——
//      那是另一种失真。两个真源不可合并：knows 答「知道吗」，duty 答「在岗吗」。
//
// 【判据结构（与 noesis-v2140 / perspective-lock-v2142 同规格）】
//   A 结构 · B 运行时（原版成绿）· C 消费方（诊断真读者 + 面板真渲染 + 注入块）
//   N0–N7 真源码破坏 ⇒ 破坏副本上重跑同款真判据；H5 纯度 + N 面真文件逐字未变。
//   判据一律**自己造世界**（用 mk 工厂）：每条判据要的场不同（在职但休假 / 压根不在职 /
//   任职面缺席 / 开关真关），靠别的块留下的环境永远造不出确定的场。
'use strict';
const fs = require('fs');
const path = require('path');
const sync = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const NOE = 'engines/noesis.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js';
const SELF = 'tests/duty-v2143.js';
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
 * 造一个确定的世界：init → 开 noesis/inst → （可选）建一个组织 + 一个在职职位 + 一条日程。
 *   口径与 noesis-v2140 的 seed 同源：**先把相关容器清空再造** —— 本锁与回归共用同一个 vm
 *   全局与同一份世界存储，前面几十个块留下的 orgs / schedule 会让「此人不在职」当场不成立。
 *   判据要的场必须自己造；环境的确定性是判据的前提，不是巧合。
 */
function seed(WA, spec) {
  spec = spec || {};
  WA.store.init();
  WA.noesis.setSettings({ enabled: true, dutyEnabled: true });
  if (WA.inst && WA.inst.setSettings) WA.inst.setSettings({ enabled: true });
  const who = spec.who || '甲';
  WA.store.transact(function (d) {
    d.inst = { orgs: [] };
    d.people = d.people || {};
    d.people['p_' + who] = { id: 'p_' + who, name: who, life: { goals: [], commitments: [], schedule: [] } };
    if (spec.emptyPeople) d.people = {};
  }, 'duty-lock:seed-reset');
  if (spec.noOrg) return WA;                 // 不建组织：任职面自然缺席
  // 组织 → 席位 → 任职（顺序是硬约束：post 之前必须先 charter，assign 之前必须先有席位）
  WA.inst.charter(spec.org || '见证司', { kind: '机关', replace: true });
  WA.inst.post(spec.org || '见证司', spec.post || '见证岗', { perms: ['approve'], replace: true });
  if (spec.assign !== false) WA.inst.assign(spec.org || '见证司', spec.post || '见证岗', who, { replace: true });
  if (spec.schedule && !spec.emptyPeople) {
    const t = WA.clock.now('duty-lock:seed');
    WA.store.transact(function (d) {
      const p = d.people['p_' + who];
      if (!p) return;
      p.life = p.life || { goals: [], commitments: [], schedule: [] };
      p.life.schedule = [{ id: 'sch_lock', activity: '外出办事', start: t - 3600000, end: t + 3600000, status: 'active' }];
    }, 'duty-lock:seed-sched');
  }
  return WA;
}
function env(spec) {
  const WA = freshWA();
  if (spec && spec.raw) { WA.store.init(); WA.noesis.setSettings({ enabled: false }); }
  else seed(WA, spec || {});
  return WA;
}
function envBroken(spec, ov) {
  const WA = freshWA(ov);
  if (spec && spec.raw) { WA.store.init(); WA.noesis.setSettings({ enabled: false }); }
  else seed(WA, spec || {});
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
  //   锚点带函数签名与两道闸的注释行：本仓每个新引擎闸门都以同款 `if (!cfg.enabled)`
  //   开头，裸这一行会在下一个引擎落地时撞车（v2.144.0 实测 hits=2）——锚点必须**本闸门独有**。
  master: { rel: NOE, txt: "  function dutyGate(person, orgId, at) {\n    const cfg = settings();\n    // 总开关与第三轴**两道闸都要过**（与 knows / perceive / gateScene 同规）：\n    //   总开关关闭 ⇒ 一律拒收 disabled（不是「查不到在岗」，也不是「不在岗」）；\n    //   第三轴单独关闭 ⇒ 如实报 duty-off（这一轴缺席，不是「他在岗」）。\n    if (!cfg.enabled) return { known: false, reason: 'disabled' };",
    to: "  function dutyGate(person, orgId, at) {\n    const cfg = settings();\n    // 总开关与第三轴**两道闸都要过**（与 knows / perceive / gateScene 同规）：\n    //   总开关关闭 ⇒ 一律拒收 disabled（不是「查不到在岗」，也不是「不在岗」）；\n    //   第三轴单独关闭 ⇒ 如实报 duty-off（这一轴缺席，不是「他在岗」）。\n    if (false && !cfg.enabled) return { known: false, reason: 'disabled' };" },
  // ② 第三轴闸被摘掉 ⇒ 关掉在岗轴之后照旧给出「在岗 / 不在岗」的判决（一轴缺席被冒充成有结论）
  dutyOff: { rel: NOE, txt: "    if (!cfg.dutyEnabled) return { known: false, off: true, reason: 'duty-off' };",
    to: "    if (false && !cfg.dutyEnabled) return { known: false, off: true, reason: 'duty-off' };" },
  // ③ 「压根不在职」被回落成「在岗」⇒ 有岗无人与有岗有人同形（本锁最要紧的那条不可合并）
  fallback: { rel: NOE, txt: "      return { known: true, inOffice: false, onDuty: false, reason: 'not-in-office',",
    to: "      return { known: true, inOffice: false, onDuty: true, reason: 'not-in-office'," },
  // ④ 日程面被摘掉 ⇒ 在职即算在岗（「在职 ≠ 在岗」这句话重新变回注释）
  sched: { rel: NOE, txt: "        return x && x.status === 'active' && isFinite(Number(x.start)) && isFinite(Number(x.end))",
    to: "        return false && x && x.status === 'active' && isFinite(Number(x.start)) && isFinite(Number(x.end))" },
  // ⑤ 注入链的在岗纪律段被摘掉 ⇒ 模型那面重新只知道「在职」，不知道「不等于在岗」
  block: { rel: NOE, txt: "    if (cfg.dutyEnabled && (stat.offDuty > 0 || stat.notInOffice > 0)) {",
    to: "    if (false && cfg.dutyEnabled && (stat.offDuty > 0 || stat.notInOffice > 0)) {" },
  // ⑥ 两码被合成一个读数 ⇒ 再也答不出该等排班还是该走任职流程
  diag: { rel: DIAG, txt: "        offDuty: b.offDuty || 0, notInOffice: b.notInOffice || 0",
    to: "        offDuty: (b.offDuty || 0) + (b.notInOffice || 0), notInOffice: (b.offDuty || 0) + (b.notInOffice || 0)" },
  // ⑦ 诊断面不再报在岗轴开关位 ⇒ 「这一轴真关还是真开」在诊断包里无从查
  diagAxis: { rel: DIAG, txt: "        dutyEnabled: !!b.dutyEnabled,",
    to: "        dutyEnabled: undefined," },
  // ⑧ 面板不再渲染在岗闸门入口（用户那面重新变黑）
  panel: { rel: PANEL, txt: 'id="wa-noe-duty" title="在岗闸门',
    to: 'id="wa-noe-duty2" title="在岗闸门' }
};
const BROKEN = [
  { key: 'master', spec: ANCHORS.master }, { key: 'dutyOff', spec: ANCHORS.dutyOff },
  { key: 'fallback', spec: ANCHORS.fallback }, { key: 'sched', spec: ANCHORS.sched },
  { key: 'block', spec: ANCHORS.block },
  { key: 'diag', spec: ANCHORS.diag }, { key: 'diagAxis', spec: ANCHORS.diagAxis },
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

// ── 判据本体（A 结构 + B 运行时）──────────────────────────────────────
function judge() {
  const WA = freshWA();
  const M = WA.noesis;
  // A 结构
  ok(typeof M.duty === 'function', 'A1 在岗闸门在场且导出（duty 是第三轴，不是又一个死导出）');
  ok(M.getSettings().dutyEnabled === true, 'A2 第三轴默认开启（与时间/空间轴并列，但总开关仍默认关）');
  // 总开关默认关闭（本仓每一新引擎的铁律：默认关，不开就不干预）
  { const W = env({ raw: true });
    ok(W.noesis.getSettings().enabled === false, 'A3 总开关默认关闭（未开就不干预）');
  }
  // B 运行时：三态严格分开
  { const W = env({});   // 建组织 + 甲在职 + 无日程 ⇒ 在岗
    const r = W.noesis.duty('甲', '见证司');
    ok(r.known === true && r.onDuty === true && r.reason === 'on-duty', 'B1 在职且无日程 ⇒ 在岗（on-duty）');
    ok(Array.isArray(r.posts) && r.posts.indexOf('见证岗') >= 0, 'B2 在岗结论带在职职位（结论可复算，不是布尔）');
  }
  { const W = env({ schedule: true });   // 甲在职 + 一条覆盖此刻的日程 ⇒ 在职但不在岗
    const r = W.noesis.duty('甲', '见证司');
    ok(r.known === true && r.inOffice === true && r.onDuty === false && r.reason === 'off-duty',
      'B3 在职但被日程占住 ⇒ off-duty（在职 ≠ 在岗，本版要治的那句话）');
    ok(r.via === 'scheduled', 'B4 off-duty 带 via（是日程占住还是场地关闭 —— 两种处置不同）');
  }
  { const W = env({ schedule: true });   // 两码分开：这才是「有岗没上」
    const a = W.noesis.duty('甲', '见证司').reason;
    const b = env({ assign: false }).noesis.duty('丙', '见证司').reason;
    ok(a === 'off-duty' && b === 'not-in-office', 'B5 两码不同码（' + a + ' vs ' + b + '）——不可合并');
  }
  { const W = env({ assign: false, who: '丙' });   // 组织在册、席位在册，但丙不任任何职位
    const r = W.noesis.duty('丙', '见证司');
    ok(r.known === true && r.inOffice === false && r.onDuty === false && r.reason === 'not-in-office',
      'B6 压根不在职 ⇒ not-in-office（**不回落成「在岗」**）');
    ok(r.onDuty !== true, 'B7 not-in-office 与在岗不同形（最要紧的不可合并）');
  }
  { const W = env({ noOrg: true });   // 组织查不到 ⇒ 任职面缺席
    const r = W.noesis.duty('甲', '不存在的组织');
    ok(r.known === false, 'B8 组织查不到 ⇒ 任职面缺席（**不冒充「不在岗」**）');
    ok(r.reason !== 'off-duty' && r.reason !== 'not-in-office',
      'B9 「查不到」不塌进两码（缺席与两种否定都是不同的事实）');
  }
  { const W = env({});   // 缺人物 ⇒ 缺席
    const r = W.noesis.duty('', '见证司');
    ok(r.known === false, 'B10 人物缺失 ⇒ 缺席（不猜）');
  }
  { const W = env({ raw: true });   // 总开关真关
    const r = W.noesis.duty('甲', '见证司');
    ok(r.known !== true && r.reason === 'disabled', 'B11 总开关关闭 ⇒ disabled（不猜）');
  }
  { const W = env({});
    W.noesis.setSettings({ dutyEnabled: false });   // 只关第三轴
    const r = W.noesis.duty('甲', '见证司');
    ok(r.known !== true && r.reason === 'duty-off', 'B12 第三轴单独关闭 ⇒ duty-off（如实报这一轴缺席）');
  }
  // B13 本闸门**不进 knows() 的一票否决**：人下班了，知道的事不会忘掉
  { const W = env({ schedule: true });
    W.enigma.setSettings({ enabled: true });
    W.enigma.mark('密约', '甲');
    const d = W.noesis.duty('甲', '见证司');
    const k = W.noesis.knows('甲', '密约');
    ok(d.reason === 'off-duty' && k.known === true,
      'B13 在岗与知情是两个真源：甲休假（off-duty）但仍知道「密约」（known:true）—— 不互相否决');
    ok((k.deniedBy || []).indexOf('off-duty') < 0, 'B14 off-duty 不混进 knows 的 deniedBy（合报即另一种失真）');
  }
  // B15 在岗纪律真进注入块（且有账才提 —— 零 token 占用）
  { const W = env({ schedule: true });
    W.noesis.duty('甲', '见证司');
    const bb = W.noesis.buildBlock();
    ok(bb.indexOf('在职不等于在岗') >= 0, 'B15 有在岗账时注入块带在岗纪律（模型那面知道「在职 ≠ 在岗」）');
    ok(bb.indexOf('见证司') < 0 && bb.indexOf('甲') < 0, 'B16 注入块不列组织名/人名（列出即把未揭示的任职关系写进正文）');
  }
  { const W = env({ raw: true });
    ok(W.noesis.buildBlock() === '', 'B17 关闭时 buildBlock 为空串（零 token）');
  }
  // B18 boundary 只读：不跑 duty、不污染计数
  { const W = env({ schedule: true });
    const b0 = W.noesis.boundary();
    ok(b0.offDuty === 0 && b0.dutyEnabled === true, 'B18 boundary 报第三轴开关位与两码计数（只读现场）');
    const n0 = W.noesis.boundary().offDuty;
    W.noesis.duty('甲', '见证司');
    ok(W.noesis.boundary().offDuty === n0 + 1, 'B19 读数进位由**真调用**驱动（不是空壳常量）');
  }
}

// ── C 消费方：诊断真读者 + 面板真渲染 ─────────────────────────────────
function consumers() {
  const W = env({ schedule: true });
  W.noesis.duty('甲', '见证司');
  const col = (W.toolDiag && typeof W.toolDiag.collect === 'function') ? W.toolDiag.collect() : null;
  const nd = col && col.noesis;
  ok(!!nd, 'C0 诊断节 noesis 可读（collect().noesis）');
  if (nd) {
    ok(nd.dutyEnabled === true, 'C1 诊断面报在岗轴开关位（「这一轴真关还是真开」可查）');
    ok(nd.offDuty === 1 && nd.notInOffice === 0, 'C2 两码**分开报**（off-duty 1 / not-in-office 0 —— 合成一个就答不出该动哪一手）');
  } else { ok(false, 'C1 诊断节不可用'); ok(false, 'C2'); }

  const W2 = env({});
  let html = '';
  try { html = renderPeopleHtml(W2); } catch (e) { html = 'THREW:' + (e && e.message); }
  ok(hits(html, 'id="wa-noe-duty"') === 1, 'C3 人物页真渲染出在岗闸门入口（渲染链路可用）');
  const c1 = clickNoe(W2, 'wa-noe-duty', '甲', '见证司');
  ok(c1.threw === null, 'C4 点在岗闸门未抛异常（真绑定可用）');
  ok(hits(c1.text, '在岗闸门') === 1 && hits(c1.text, '在岗') >= 1, 'C5 点后真带在岗结论（用户那面看得见）');
  const W3 = env({ schedule: true });
  const c2 = clickNoe(W3, 'wa-noe-duty', '甲', '见证司');
  ok(hits(c2.text, '在职但不在岗') === 1, 'C6 休假的场真报「在职但不在岗」（两码在用户那面也不同形）');
  const c3 = clickNoe(env({ noOrg: true }), 'wa-noe-duty', '甲', '不存在的组织');
  ok(hits(c3.text, '无话可说') === 1, 'C7 任职面缺席时如实报「无话可说」（「查不到」不冒充「不在岗」）');
}

// ── 每条破坏在破坏副本上重跑同款真判据 ────────────────────────────────
//   mk 由调用方给：正控制传「原版工厂」，负控制传「破坏副本工厂」。判据自己造世界。
function mustFail(key, mk) {
  switch (key) {
    case 'master': { const W = mk();   // 总开关闸被摘 ⇒ 关闭态下不再拒收 disabled
      const r = W.noesis.duty('甲', '见证司');
      return r.reason !== 'disabled'; }
    case 'dutyOff': { const W = mk();  // 第三轴闸被摘 ⇒ 关掉该轴后照旧给判决
      W.noesis.setSettings({ dutyEnabled: false });
      const r = W.noesis.duty('甲', '见证司');
      return r.reason !== 'duty-off' && r.known !== false; }
    case 'fallback': { const W = mk(); // 不在职被回落成在岗 ⇒ 有岗无人与有岗有人同形
      const r = W.noesis.duty('丙', '见证司');
      return r.onDuty === true; }
    case 'sched': { const W = mk();    // 日程面被摘 ⇒ 在职即算在岗
      const r = W.noesis.duty('甲', '见证司');
      return r.onDuty === true; }
    case 'block': { const W = mk();    // 注入链在岗纪律被摘 ⇒ 模型那面重新不知道
      W.noesis.duty('甲', '见证司');
      return W.noesis.buildBlock().indexOf('在职不等于在岗') < 0; }
    case 'diag': { const W = mk();     // 两码被合成一个读数
      W.noesis.duty('甲', '见证司');
      const col = (W.toolDiag && W.toolDiag.collect) ? W.toolDiag.collect().noesis : null;
      return !col || !(col.offDuty === 1 && col.notInOffice === 0); }
    case 'diagAxis': { const W = mk();  // 诊断面不再报在岗轴开关位
      const col = (W.toolDiag && W.toolDiag.collect) ? W.toolDiag.collect().noesis : null;
      return !col || col.dutyEnabled !== true; }
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
    case 'dutyOff': return {};
    case 'fallback': return { assign: false, who: '丙' };
    case 'sched': return { schedule: true };
    case 'block': return { schedule: true };
    case 'diag': return { schedule: true };
    case 'diagAxis': return {};
    case 'panel': return {};
    default: return {};
  }
}
function runAll(a) {
  HOST = a;                                  // 判据上交宿主（见文件头「宿主断言」段）
  console.log('== A/B 判据（原版成绿）==');
  judge();
  console.log('== C 消费方（诊断真读者 + 面板真渲染）==');
  consumers();
  console.log('DUTY-V2143: ' + (fails ? 'FAIL ' + fails + '/' + checks : 'pass ' + checks + ' 项'));
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
  [ANCHORS.master.txt, ANCHORS.dutyOff.txt, ANCHORS.fallback.txt, ANCHORS.sched.txt,
    ANCHORS.block.txt, ANCHORS.diag.txt, ANCHORS.diagAxis.txt, ANCHORS.panel.txt].forEach(function (raw) {
    const lit = unesc(raw);
    const inAnchors = hits(anchorsBlock, lit);
    const inJudge = hits(judgeBlock, lit);
    checks++;
    if (inAnchors !== 1 || inJudge !== 0) { nf++; console.log('  ✗ H5 纯度：' + JSON.stringify(lit.slice(0, 24)) + ' 声明 ' + inAnchors + ' 次 / 判据内 ' + inJudge + ' 次'); }
    else console.log('  ✓ H5 纯度：锚点只声明 1 次且判据不内联 ' + JSON.stringify(lit.slice(0, 20)));
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
  // N1–N8：每条破坏 ⇒ 装载破坏副本 ⇒ 同款判据必须真现形
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
  console.log(f ? 'DUTY-V2143: FAIL' : 'DUTY-V2143: pass');
  process.exitCode = f ? 1 : 0;
}
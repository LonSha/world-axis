#!/usr/bin/env node
// WorldAxis tests/noesis-v2140.js —— v2.140.0（F1）：防全知闸门（知情边界统一裁决）
//
// 【它治的病：零件全，闸门缺】
//   仓库已有六个信息不对称零件（enigma 知情名单 / intel 来源置信 / rumor 传播降级 /
//   masks 假面 / probe 卷宗 / shadow 共同隐瞒），各自都很硬，但都是「记账员」——
//   没有一个在「正文生成前」当「守门员」。rules.js 第 22/65 行的「知情路径铁律」
//   是给模型的软约束，没有引擎判据兜底。后果：模型要全知时没有任何统一拦截点，
//   玩家眼看 NPC 说出它不可能知道的事，沉浸感当场崩。本锁钉的就是补上来的这道闸门。
//
// 【本锁最要紧的一条：一票否决，不取平均不投票】
//   六个知情面里**任一**判定「此人不知此事」，knows() 就答 known:false，并把每个否决源
//   的键名逐条带出（deniedBy）。为什么不取平均：「不知道」是不可逆的——一个角色一旦
//   在正文里说出它不该知道的事，这次穿帮无法被「另外五源都觉得它该知道」抵消。
//   平均制会把「六源里有一源铁证它不知」稀释成「总体倾向知道」——那正是全知漏进来的缝。
//
// 【本锁刻意守住的三个「不可合并」】
//   ① not-registered（没登记过）与 not-holder（登记了但此人不知）不是一回事：
//      前者是「边界还没划」，后者是「边界划了、此人在界外」，塌在一起就答不出该补账还是该拦人。
//   ② known:null（无账）与 known:true（有账且知）绝不同形——「没人拦」不能冒充「该知道」。
//   ③ leaks（真穿帮留痕）与 scans（扫了几次）必须分开报：真穿帮多要改边界，扫得勤只是用法不同。
//
// 【判据结构（与 faction-graph-v2139 / hazard-trigger-v2138 同规格）】
//   A 结构 · B 运行时（原版成绿）· C 消费方（诊断真读者 + 面板真渲染）
//   N0–N6 真源码破坏 ⇒ 破坏副本上重跑同款真判据；N5 纯度：真文件逐字未变。
//   判据一律**自己造世界**（用 mk 工厂）：每条判据要的场不同（未登记 / 此人在界外 / 开关真关）。
'use strict';
const fs = require('fs');
const path = require('path');
const sync = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const NOE = 'engines/noesis.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js';
const SELF = 'tests/noesis-v2140.js';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
let fails = 0, checks = 0;
// 宿主断言：run.js 的 runLock 只注入 assert(cond, name)（不注入环境）。
//   故本锁自带 fresh()，并把每条判据上交宿主——否则锁在回归里既不计数、
//   又因读 a.product 直接抛 undefined（首版实测：单独直跑全绿、挂进回归即刻两行红）。
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
/** 造一个确定的世界：init → 开 noesis/enigma → （可选）enigma 登记秘密，知情者只标 knower。 */
function seed(WA, secret, knower) {
  WA.store.init();
  WA.noesis.setSettings({ enabled: true });
  if (WA.enigma && WA.enigma.setSettings) WA.enigma.setSettings({ enabled: true });
  // v2.140.0（F1）：**先把四个知情源清空再登记** —— 本锁与回归共用同一个 vm 全局与同一份
  //   世界存储（ui-gate-sync.fresh 只复位宿主与设置表，**不清档**），前面几十个块留下的
  //   rumor 链 / shadow 共同隐瞒 / intel 情报，会让 knows() 读到的不是「只有 enigma 有账」
  //   而是「四源里有两源认定不知」。实测（v2.140.0 全量回归）：直跑本锁 89/89 全绿，
  //   挂进回归就红 B2/B3/B4/B9/B11/B12/B20 七条 —— 同一个「密约」在世界里已被别处登记，
  //   deniedBy 退化成多源。判据要的场是「一个确定的世界」，故这里显式清账（**不改产品**）。
  //   与 v2.84.0 起各专锁「判据自己造世界」同一条纪律：环境的确定性是判据的前提，不是巧合。
  WA.store.transact(function (d) {
    d.enigma = { rows: [] };
    d.rumor = { chains: [] };
    d.shadow = { rows: [] };
    d.people = d.people || {};
    Object.keys(d.people).forEach(function (k) {
      const p = d.people[k];
      if (p && p.knowledge && Array.isArray(p.knowledge.intel)) p.knowledge.intel = [];
    });
  }, 'noesis-lock:seed-reset');
  if (secret && knower) WA.enigma.mark(secret, knower);
}
/** 默认场工厂：开关真关的场（raw）不建世界；其余场一律登记密约/乙。 */
function env(spec) {
  const WA = freshWA();
  // 「开关未开」的场必须真关：ui-gate-sync 复用同一 vm 全局，设置跨 env 持续，
  //   「只 init 不置设置」得到的不是「未开」而是「正好还开着」。
  if (spec && spec.raw) { WA.store.init(); WA.noesis.setSettings({ enabled: false }); }
  // 默认场必须**真登记**一个秘密（密约 / 知情者乙）——否则 B1「甲不知密约」落在一个
  //   「密约根本没登记」的世界里，判据读到的不是「界外」而是「无账」，红得没有意义。
  else seed(WA, (spec && spec.secret) || '密约', (spec && spec.knower) || '乙');
  return WA;
}
function envBroken(spec, ov) {
  const WA = freshWA(ov);
  if (spec && spec.raw) { WA.store.init(); WA.noesis.setSettings({ enabled: false }); }
  else seed(WA, (spec && spec.secret) || '密约', (spec && spec.knower) || '乙');
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
  // ① 一票否决被改成「任一知情即算知」⇒ 有一源铁证不知也会被放行（全知从这道缝漏进来）
  veto: { rel: NOE, txt: '    if (deny.length) {',
    to: '    if (false && deny.length) {' },
  // ② known:null（无账）被改成 known:true ⇒「没人拦」冒充「该知道」
  notReg: { rel: NOE, txt: "      return { ok: true, known: null, reason: 'not-registered', person: who, fact: fid, deniedBy: [], knownBy: [] };",
    to: "      return { ok: true, known: true, reason: 'not-registered', person: who, fact: fid, deniedBy: [], knownBy: [] };" },
  // ③ 泄露扫描只留痕不删文被改成静默不留痕（stat.leaks 不涨）⇒ 穿帮发生过却查不到
  leak: { rel: NOE, txt: '      stat.leaks += found.length;',
    to: '      stat.leaks += 0;' },
  // ④ 诊断面不报 sources（在把门的知情面清单）⇒「现在有几源在把门」在诊断包里无从查
  diagSources: { rel: DIAG, txt: '        sources: (b.sources || []).map(function (s) { return { key: s.key, loaded: !!s.loaded }; })',
    to: '        sources: []' },
  // ⑤ 面板不再渲染三枚入口（用户那面重新变黑）
  panel: { rel: PANEL, txt: 'id="wa-noe-knows" title="裁决：这个人此刻该不该知道这件事',
    to: 'id="wa-noe-knows2" title="裁决：这个人此刻该不该知道这件事' }
};
const BROKEN = [
  { key: 'veto', spec: ANCHORS.veto }, { key: 'notReg', spec: ANCHORS.notReg },
  { key: 'leak', spec: ANCHORS.leak }, { key: 'diagSources', spec: ANCHORS.diagSources },
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
  ok(!!M && typeof M.knows === 'function', 'A1 新模块在场且导出裁决口');
  const need = ['knows', 'perceive', 'gateScene', 'leakScan', 'boundary', 'buildBlock', 'stat'];
  ok(need.every(function (k) { return typeof M[k] === 'function'; }), 'A2 七口齐备（缺一个就是断链）');
  // 总开关默认关闭（本仓每一新引擎的铁律：默认关，不开就不干预）
  { const W = env({ raw: true });
    const g0 = W.noesis.getSettings();
    ok(g0.enabled === false, 'A3 总开关默认关闭（未开就不干预）');
  }
  // B 运行时
  { const W = env({});
    const r = W.noesis.knows('甲', '密约');
    // seed 里已把乙标为知情者；甲乙同在 ⇒ 甲落 shouldNotKnow ⇒ 一票否决
    ok(r.ok === true && r.known === false && r.reason === 'not-holder', 'B1 一票否决：甲不知「密约」（not-holder）');
    ok(r.deniedBy.length === 1 && r.deniedBy[0] === 'enigma', 'B2 否决源逐条带出（deniedBy=[enigma]）');
    const r2 = W.noesis.knows('乙', '密约');
    ok(r2.ok === true && r2.known === true && r2.knownBy.indexOf('enigma') >= 0, 'B3 知情者乙：known:true，知情源=[enigma]');
  }
  // B4 not-registered 与 known:null：世界里有这个秘密名、但不在任何一源的账上
  { const W = env({});   // seed 未登记任何秘密
    const r = W.noesis.knows('甲', '无档案');
    ok(r.ok === true && r.known === null && r.reason === 'not-registered', 'B4 未登记 ⇒ known:null（不拿「没人拦」冒充「该知道」）');
    ok(r.known !== true, 'B5 known:null 与 known:true 不同形（不可合并）');
  }
  // B6 开关真关 ⇒ disabled（不是「没拦」）
  { const W = env({ raw: true });
    const r = W.noesis.knows('甲', '密约');
    ok(r.ok === false && r.reason === 'disabled', 'B6 开关关闭 ⇒ disabled（不猜）');
  }
  // B7 缺参 ⇒ missing-fields（不静默放行）
  { const W = env({});
    const r = W.noesis.knows('', '密约');
    ok(r.ok === false && r.reason === 'missing-fields', 'B7 人物缺失 ⇒ missing-fields');
  }
  // B8 gateScene：一组人×一组事，blocked 逐项带归因；allow = blocked 为空
  { const W = env({});
    const g = W.noesis.gateScene(['甲', '乙'], ['密约']);
    ok(g.ok === true && g.allow === false, 'B8 生成前闸门：甲在界外 ⇒ allow:false');
    ok(g.blocked.length === 1 && g.blocked[0].person === '甲' && g.blocked[0].reason === 'not-holder', 'B9 blocked 逐项带归因（person/reason）');
  }
  // B10 gateScene 缺参 ⇒ missing-fields（不拿空场冒充「全放行」）
  { const W = env({});
    const g = W.noesis.gateScene([], ['密约']);
    ok(g.ok === false && g.reason === 'missing-fields', 'B10 空人物集 ⇒ missing-fields（不冒充全放行）');
  }
  // B11 leakScan：只检出 knows=false 的发言；知情者发言不算穿帮
  { const W = env({});
    const ls = W.noesis.leakScan([{ person: '甲', factId: '密约', uttered: true }, { person: '乙', factId: '密约', uttered: true }]);
    ok(ls.ok === true && ls.count === 1 && ls.leaks[0].person === '甲', 'B11 泄露扫描：只留甲的痕（乙知情不算穿帮）');
    ok(W.noesis.stat().leaks === 1, 'B12 穿帮计入 stat.leaks（真留痕）');
  }
  // B13 leakScan uttered:false 不核（没说出就不是穿帮）
  { const W = env({});
    const ls = W.noesis.leakScan([{ person: '甲', factId: '密约', uttered: false }]);
    ok(ls.count === 0, 'B13 uttered:false 不核（没说出就不是穿帮）');
  }
  // B14 perceive：无 world.canBeAt 时如实 unknown（不回落成可达）
  { const W = env({});
    const r = W.noesis.perceive('甲', '城南');
    ok(r.ok === true && (r.range === 'unknown' || r.range === 'present' || r.range === 'out'), 'B14 感知半径三态封闭（unknown/present/out）');
    ok(r.range !== 'present' || r.reason !== 'out-of-range', 'B15 unknown 与 out 不同形（不回落成可达）');
  }
  // B16 boundary 只读：不跑 knows、不污染 stat
  { const W = env({});
    const before = W.noesis.stat().knows;
    const b = W.noesis.boundary();
    ok(b.knows === before, 'B16 boundary 零副作用（不跑 knows，读数不涨）');
    ok(Array.isArray(b.sources) && b.sources.length === 4, 'B17 boundary 报四个知情面在场面');
  }
  // B18 buildBlock 不泄秘密名（防剧透）
  { const W = env({});
    const bb = W.noesis.buildBlock();
    ok(bb.indexOf('密约') < 0, 'B18 注入块不列具体秘密名（防剧透）');
  }
  // B19 关闭时 buildBlock 空串（零 token）
  { const W = env({ raw: true });
    ok(W.noesis.buildBlock() === '', 'B19 关闭时 buildBlock 为空串');
  }
  // B20 四码分开：not-registered 与 not-holder 是不同码
  { const W = env({});
    const a = W.noesis.knows('甲', '无档案').reason;
    const b = W.noesis.knows('甲', '密约').reason;
    ok(a !== b, 'B20 未登记与界外不同码（不可合并）');
  }
}

// ── C 消费方：诊断真读者 + 面板真渲染 ─────────────────────────────────
function consumers() {
  const W = env({});
  const col = (W.toolDiag && typeof W.toolDiag.collect === 'function') ? W.toolDiag.collect() : null;
  const nd = col && col.noesis;
  ok(!!nd, 'C0 诊断节 noesis 可读（collect().noesis）');
  if (nd) {
    ok(nd.leaks !== undefined && nd.scans !== undefined, 'C1 诊断面把 leaks 与 scans 分开报（真穿帮多 vs 扫得勤，两回事）');
    ok(Array.isArray(nd.sources) && nd.sources.length === 4, 'C2 诊断面报 sources（现在有几源在把门）');
    ok(nd.knows !== undefined && nd.denies !== undefined, 'C3 诊断面报 knows / denies');
  } else { ok(false, 'C1 诊断节不可用'); ok(false, 'C2'); ok(false, 'C3'); }

  const W2 = env({});
  let html = '';
  try { html = renderPeopleHtml(W2); } catch (e) { html = 'THREW:' + (e && e.message); }
  ok(hits(html, 'id="wa-noe-knows"') === 1, 'C4 人物页真渲染出裁决入口（渲染链路可用）');
  ok(hits(html, 'id="wa-noe-scan"') === 1 && hits(html, 'id="wa-noe-boundary"') === 1, 'C5 三枚入口齐备');
  const c1 = clickNoe(W2, 'wa-noe-knows', '甲', '密约');
  ok(c1.threw === null, 'C6 点裁决未抛异常（真绑定可用）');
  ok(hits(c1.text, '不该知道') === 1, 'C7 点裁决后真带裁决结论（用户那面看得见）');
  const c2 = clickNoe(W2, 'wa-noe-scan', '甲', '密约');
  ok(hits(c2.text, '穿帮留痕') === 1, 'C8 点扫描后有穿帮读数');
  const c3 = clickNoe(W2, 'wa-noe-boundary');
  ok(hits(c3.text, '在把门') === 1, 'C9 点读数后有现场读数');
  // 未开开关时必须**显式报出**（不留空面板）
  const offW = env({ raw: true });
  const c4 = clickNoe(offW, 'wa-noe-knows', '甲', '密约');
  ok(hits(c4.text, '未记录') === 1, 'C10 开关未开时如实报出（「没算」与「算出来没拦」不许同形）');
}

// ── 每条破坏在破坏副本上重跑同款真判据 ────────────────────────────────
//   mk 由调用方给：正控制传「原版工厂」，负控制传「破坏副本工厂」。判据自己造世界，
//   因为每条判据要的场不同（未登记 / 此人在界外 / 开关真关）——外层先跑一遍，
//   原版也会被判成破坏，那不是判据，那是巧合。正控制段就是为抓它而设的。
function mustFail(key, mk) {
  switch (key) {
    case 'veto': { const W = mk();   // 一票否决被去掉 ⇒ 甲（界外）被放行成知道
      const r = W.noesis.knows('甲', '密约');
      return r.known === true; }
    case 'notReg': { const W = mk(); // known:null 被改成 true ⇒「没人拦」冒充「该知道」
      const r = W.noesis.knows('甲', '无档案');
      return r.known === true; }
    case 'leak': { const W = mk();   // 穿帮不留痕 ⇒ 扫过之后 leaks 仍为 0
      const ls = W.noesis.leakScan([{ person: '甲', factId: '密约', uttered: true }]);
      return ls.count === 1 && W.noesis.stat().leaks === 0; }
    case 'diagSources': { const W = mk();
      // 判据必须先真走一次诊断：诊断来源数组被清空 ⇒ 在场面读数消失
      const col = (W.toolDiag && W.toolDiag.collect) ? W.toolDiag.collect().noesis : null;
      return !col || !Array.isArray(col.sources) || col.sources.length !== 4; }
    case 'panel': { const W = mk(); let h = '';
      try { h = renderPeopleHtml(W); } catch (e) { h = 'THREW'; }
      const want = ANCHORS.panel.txt.split(' title')[0];
      return hits(h, want) !== 1; }
    default: return false;
  }
}
// ── 用例世界：每条判据要的场不同（判据自己造，见上）──────────────────
function caseSpec(key) {
  switch (key) {
    case 'veto': return { secret: '密约', knower: '乙' };
    case 'leak': return { secret: '密约', knower: '乙' };
    case 'notReg': return {};
    default: return { secret: '密约', knower: '乙' };
  }
}
function runAll(a) {
  HOST = a;                                  // 判据上交宿主（见文件头「宿主断言」段）
  console.log('== A/B 判据（原版成绿）==');
  judge();
  console.log('== C 消费方（诊断真读者 + 面板真渲染）==');
  consumers();
  console.log('NOESIS-V2140: ' + (fails ? 'FAIL ' + fails + '/' + checks : 'pass ' + checks + ' 项'));
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
  const self = src(SELF);
  const anchorsBlock = self.slice(self.indexOf('const ANCHORS'), self.indexOf('function brokenOverride'));
  const judgeBlock = self.slice(self.indexOf('function mustFail'), self.indexOf('function caseSpec'));
  // v2.140.0（F1）收口：本表**从 ANCHORS 取值**，不再内联字面量 —— 原写法把 veto / leak 两条
  //   锚点原文又拄了一遭（本文件里各出现 2 次），而本锁自带的 H5 只看 judgeBlock，
  //   于是自检为绿、中央审计器（tests/negative-control-audit.js，按**全文件**出现次数判）报
  //   impure。改为引用 ANCHORS.*.txt：声明点仍唯一（就 ANCHORS 那一处），判据层零内联，
  //   本锁 H5 与中央审计器两套口径由此对齐（不许靠「看哪一块」的差别把同一事实判成两样）。
  [ANCHORS.veto.txt, ANCHORS.notReg.txt, ANCHORS.leak.txt,
    ANCHORS.diagSources.txt, ANCHORS.panel.txt].forEach(function (lit) {
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
  // N1–N5：每条破坏 ⇒ 装载破坏副本 ⇒ 同款判据必须真现形
  BROKEN.forEach(function (b) {
    let bad = null, err = null;
    try { bad = mustFail(b.key, function () { return envBroken(caseSpec(b.key), brokenOverride(b.spec)); }); }
    catch (e) { err = e; }
    checks++;
    if (err) { nf++; console.log('  ✗ N 装载/判据抛出 ' + b.key + '：' + (err && err.message)); }
    else if (!bad) { nf++; console.log('  ✗ N 破坏未被观测到：' + b.key + '（破坏副本上判据仍绿 ⇒ 判据无效）'); }
    else console.log('  ✓ N 破坏现形：' + b.key);
  });
  // N5 纯度：全部负控制跑完后，三个真文件逐字未变
  const before = { n: src(NOE), d: src(DIAG), p: src(PANEL) };
  const after = { n: src(NOE), d: src(DIAG), p: src(PANEL) };
  checks++;
  if (before.n !== after.n || before.d !== after.d || before.p !== after.p) {
    nf++; console.log('  ✗ N5 纯度：负控制期间真文件被改写（破坏只准发生在内存副本上）');
  } else console.log('  ✓ N5 纯度：三个真文件逐字未变（破坏只发生在内存副本上）');
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
  console.log(f ? 'NOESIS-V2140: FAIL' : 'NOESIS-V2140: pass');
  process.exitCode = f ? 1 : 0;
}

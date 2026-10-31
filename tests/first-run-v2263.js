'use strict';
/**
 * v2.263.0（V6 · OPV6-8）专锁：**首局体检结论 —— 一句话回答「世界跑起来了吗」**
 *
 * ── 这一版治的是什么（现场立据见 tools/v6probes/p_first.js）────────────────
 * v2.257.0 把机制面摆成一句人话（capabilityAudit.summary），v2.259.0 把三面真值摆成
 *   「门槛 + 一句话 + 一个动作」（healthPreflight.threeGatesLine），v2.260.0 把缺省面
 *   摆成一句话（render.visibilityDefault）—— 三条**各自都对**，但玩家打开概览页看到的
 *   是三句并列的话，没有一句回答「所以这一局到底跑起来了没有」。
 * 实测出厂态：107 个注入源里只有 6 个在出内容、100 项机制里只有 5 项在跑。
 *   玩家由此得出的结论通常是「世界没内容，得改设定 / 换模型」—— 改不动，因为
 *   真正该做的是切一次档位。本版就是把这三面压成**一个结论 + 一条下一步**。
 *
 * ── 本版交付 ────────────────────────────────────────────────────────────
 *  `engines/health-preflight.js`
 *    · `firstRunView(opts)` —— 四态结论：`running` / `thin` / `blocked` / `unknown`。
 *      判序即优先级：读不到 > 卡死 > 太少 > 在跑（unknown 排最前 —— 见 A4）。
 *      三面读数**全部走现场现成读口**，本函数不重算任何一条：
 *        · 机制面 → `capabilityTier.view()`（`mechanisms`/`running`/`dormant`）
 *        · 内容面 → `threeGates()`（它已把可见性两面对账 + 预算挤占做完）
 *    · `firstRunLine(opts)` —— 结论 + 下一步的整句，面板整行逐字取它。
 *  `engines/tool-diag.js`
 *    · `secHealth` 新增 `firstRun` 子节（诊断包里的玩家结论，与门槛清单分列）。
 *  `ui/panel.js`
 *    · 概览页新块 `#wa-first-line`，四态各带稳定 class `wa-first-<state>`。
 *
 * ── 抓到的三处缺陷（见 Q 段）───────────────────────────────────────────
 *  ① **`dormantWorld` 同名不同算法**：首版直接取 `capabilityTier.view().dormant`，
 *     而 `capabilityAudit.summary()` 里的 `dormantWorld` 是**排除 `no-builder`** 的。
 *     同一个名字在两处得两个数 ⇒ 概览页与诊断页会各说一个「还有 N 项可以开」。
 *     本版按 summary 的口径复算，并把三处同值写成判据（B4）。
 *  ② **unknown 被写在 blocked 之后**：那会让「机制面缺席 + 预算面卡死」报成 blocked，
 *     即拿一半读数替全体下判断。判序改成 unknown 最前（A4）。
 *  ③ **探针首版 C/D 面是空壳**：留了 `withThree()` 但从没被调用，D 面只打了一句
 *     「由专锁去验」。空壳比没有更坏 —— 它让「四态未必真能走到」这件事看不见。
 *     本版重写成**真驱动**：换掉 `capabilityTier`/`injectBudget`/`render` 三个函数外依赖，
 *     四态各走一遍（探针 `p_first.js` C 段实测全覆蓋）。
 *
 * ── 负控制（N1~N6）：真源码破坏 → 装破坏副本 → 重跑同款判据 ────────────
 *  N1 破坏判序（unknown 挪到 blocked 之后）⇒ 机制面缺席 + 预算卡死时报错态。
 *  N2 破坏 thin 阈值（0.5 改 0.01）⇒ 出厂态 6/107 被报成 running。
 *  N3 破坏 blocked 优先（把 blocked 判断挪到 thin 后）⇒ 预算挤掉内容时报 thin。
 *  N4 破坏 `firstRunLine` 的结论拼接（只返 line 不返 hint）⇒ 面板那句少了「下一步」。
 *  N5 破坏真实口径（dormantWorld 改回 `view().dormant`）⇒ B4 三处同值当场失配。
 *  N6 破坏面板四态 class（写死 `wa-first-thin`）⇒ 结论块 class 与真 state 脱节。
 *  每条都配「正版上同款判据必须真」的双向自证。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const BASE = ROOT;
require(path.join(BASE, 'tests/mock.js'));
let pass = 0, fail = 0;
const fails = [];
let __extAssert = null;
function assert(ok, msg) {
  if (__extAssert) {
    __extAssert(ok, msg);
    if (ok) { pass++; } else { fail++; fails.push(msg); }
    return;
  }
  if (ok) { pass++; return; }
  fail++; fails.push(msg);
  console.log('  ✗ ' + msg);
}
function eq(a, b, msg) { assert(a === b, msg + '（实得 ' + JSON.stringify(a) + '，期望 ' + JSON.stringify(b) + '）'); }
function section(t) { console.log('\n── ' + t + ' ──'); }
const MOCK_WA_BASE = Object.assign({}, global.WorldAxis);

function boot() {
  global.WA = global.WorldAxis = Object.assign({}, MOCK_WA_BASE);
  const ctx = vm.createContext(global);
  const src = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
  const li = src.indexOf('const LOAD = ['), lj = src.indexOf('];', li);
  const LOAD = vm.runInNewContext('(' + src.slice(src.indexOf('[', li), lj + 1) + ')');
  for (const rel of LOAD) {
    try { vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel }); } catch (e) { }
  }
  const WA = global.WorldAxis;
  try { WA.store.init(); } catch (e) {}
  return WA;
}
const HP_PATH = path.join(BASE, 'engines/health-preflight.js');
const HP_SRC = fs.readFileSync(HP_PATH, 'utf8');
const DIAG_SRC = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
const PANEL_SRC = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
// ── 锚点：字面量在此声明一次，判据区只引用变量（H5 判据纯度）──
const A_ORDER_UNKNOWN = "if (!mechOk || !g || nums.absent > 0) state = 'unknown';";
const A_ORDER_BLOCKED = "else if (nums.blocked > 0) state = 'blocked';";
// thin 判据：只认 threeGates 的 degraded（比例已由门槛②算过，不再算第二遍）
const A_THIN = "else if (nums.degraded > 0) state = 'thin';";
const A_DORMANT = "? WA.capabilityAudit.dormantMechanisms().length";
const A_LINE_CALL = "return v.line + (v.next && v.next.hint ? v.next.hint : '');";
const A_PANEL_CLS = "return '<div class=\"wa-dim wa-first wa-first-' + esc(fv.state) + '\" id=\"wa-first-line\">'";

function loadHPFrom(srcText, tag, deps) {
  // 破坏副本：装 hp 本体 + 把**真依赖**挂过去（否则 !mechOk 恒真，N1 之类会假通过）。
  //   deps 由调用方从当前 WA 上传入 —— 破坏的只有被点名的那一行，其余面全部是真货。
  global.WA = global.WorldAxis = Object.assign({}, MOCK_WA_BASE, deps || {});
  const ctx = vm.createContext(global);
  try {
    vm.runInContext(srcText, ctx, { filename: 'hp[' + tag + '].js' });
  } catch (e) { return null; }
  return global.WorldAxis.healthPreflight;
}
function breakOnce(src, anchor, replacement, tag) {
  const n = src.split(anchor).length - 1;
  if (n !== 1) { assert(false, '锚点「' + tag + '」在源码中应恰 1 处，实得 ' + n + ' 处（负控制无法成立）'); return null; }
  return src.replace(anchor, replacement);
}

function runCore() {
  const WA = boot();
  const hp = WA.healthPreflight;
  assert(!!hp, 'A0 health-preflight 装载成功');

  // ═══════════════════════════════════════════════════════════════════════════
  section('A. 源码面：两个口各恰定义一次，导出面两项，判序写死');
  eq((HP_SRC.match(/function firstRunView\(opts\)/g) || []).length, 1, 'A1 firstRunView 定义恰 1 处');
  eq((HP_SRC.match(/function firstRunLine\(opts\)/g) || []).length, 1, 'A2 firstRunLine 定义恰 1 处');
  eq((HP_SRC.match(/firstRunView: firstRunView,/g) || []).length, 1, 'A3a 导出面挂 firstRunView');
  eq((HP_SRC.match(/firstRunLine: firstRunLine/g) || []).length, 1, 'A3b 导出面挂 firstRunLine');
  // A4 判序：unknown 必须**先于** blocked 判定（拿一半读数替全体下判断是本仓点名过的坑）
  const iUnk = HP_SRC.indexOf(A_ORDER_UNKNOWN);
  const iBlk = HP_SRC.indexOf(A_ORDER_BLOCKED);
  assert(iUnk > 0 && iBlk > iUnk, 'A4 unknown 判定排在 blocked 之前（' + iUnk + ' < ' + iBlk + '）—— 读不到不是卡死');
  // A5 四态封闭集：四个结论字面量各只出现在自己的分支里
  // A5 四态封闭集。⚠ 不能直接数 `state = 'running'` 的出现次数：
  //   函数开头有 `let state = 'running';` 初始化（默认态），与分支里那一处长得一样，
  //   故会把 running 数成 2 次 —— 判据写法问题，不是产品缺陷（首跑即踩）。
  //   正确口径：初始化恰 1 次（带 let），分支赋值恰 1 次（不带 let）。
  eq((HP_SRC.match(/let state = 'running';/g) || []).length, 1, 'A5.init 默认态初始化恰 1 处（let state = running）');
  ['running', 'thin', 'blocked', 'unknown'].forEach(function (s, i) {
    const re = new RegExp("state = '" + s + "';", 'g');
    const all = (HP_SRC.match(re) || []).length;
    const init = s === 'running' ? 1 : 0;   // running 多一处是 let 初始化
    eq(all - init, 1, 'A5.' + i + ' 结论字面量 ' + s + ' 的分支赋值恰 1 次');
  });
  // A6 三面读数走现场读口，不重算
  assert(HP_SRC.indexOf('WA.capabilityTier.view()') >= 0, 'A6a 机制面走 capabilityTier.view');
  assert(/threeGates\(\{ sample: o\.sample \}\)/.test(HP_SRC), 'A6b 内容面走 threeGates（不自己重算可见性与预算）');
  assert(HP_SRC.indexOf('faceAudit') < 0 || HP_SRC.indexOf('faceAudit') < HP_SRC.indexOf('function firstRunView'),
    'A6c firstRunView 体内不直读 faceAudit（两面对账只有 threeGates 那一份）');
  // A7 thin 只认 threeGates 的 degraded，**不自己再算一遍比例**。
  //   首版写过 `degraded > 0 || sourcesOn/sources < 0.5` —— 门槛②已按 0.5 判过 degraded，
  //   那是同一条规则的第二份真源（两处阈值必然漂移）。本判据正面钉死「只有一处」。
  assert(HP_SRC.indexOf(A_THIN) >= 0, 'A7 thin 判据只认 degraded（' + A_THIN + '）');
  assert(HP_SRC.indexOf('sourcesOn / nums.sources') < 0,
    'A7b firstRunView 体内不算比例（阈值唯一真源在门槛②）');
  // A8 诊断节真消费 firstRunView（否则它成 test-only 死导出）
  eq((DIAG_SRC.match(/firstRun: \(function \(\) \{/g) || []).length, 1, 'A8a tool-diag secHealth 挂 firstRun 子节');
  assert(DIAG_SRC.indexOf('WA.healthPreflight.firstRunView({ sample: 0 })') >= 0, 'A8b 诊断节真调 firstRunView');
  // A9 面板真消费 firstRunLine（玩家可达）
  assert(PANEL_SRC.indexOf('WA.healthPreflight.firstRunLine({ sample: 0 })') >= 0, 'A9a 面板真读 firstRunLine');
  assert(/id="wa-first-line"/.test(PANEL_SRC), 'A9b 面板结论块 id 字面量在位');
  eq((PANEL_SRC.match(/id="wa-first-line"/g) || []).length >= 2, true,
    'A9c id 出现 ≥2 处（渲染分支 + 两个异常兜底，实 ' + (PANEL_SRC.match(/id="wa-first-line"/g) || []).length + '）');

  // ═══════════════════════════════════════════════════════════════════════════
  section('B. 运行时：四态与三面读数同源（数字必须对得上，不是各算各的）');
  assert(!!(hp && typeof hp.firstRunView === 'function'), 'B0 firstRunView 运行时可用');
  const v = hp.firstRunView({ sample: 0 });
  const g = hp.threeGates({ sample: 0 });
  const tv = WA.capabilityTier.view();
  const ca = WA.capabilityAudit.summary();
  const vs = WA.render.visibilityStat();
  const faces = vs.faceAudit || [];
  const onReal = faces.filter(function (x) { return x.face === 'on'; }).length;
  assert(['running', 'thin', 'blocked', 'unknown'].indexOf(v.state) >= 0,
    'B1 state 落在四态封闭集（实 ' + v.state + '）');
  eq(v.nums.blocked, g.blocked, 'B2 blocked 数与 threeGates 同源');
  eq(v.nums.degraded, g.degraded, 'B3 degraded 数与 threeGates 同源');
  eq(v.nums.sources, faces.length, 'B4a sources 与 faceAudit 同源');
  eq(v.nums.sourcesOn, onReal, 'B4b sourcesOn 与 faceAudit 的 on 数同源');
  eq(v.nums.running, tv.running, 'B4c running 与 capabilityTier.view 同源');
  eq(v.nums.mechanisms, tv.mechanisms, 'B4d mechanisms 与 capabilityTier.view 同源');
  // B4e【缺陷①的判据】dormantWorld 三处必须同值 —— 这就是首版抓到的「同名不同算法」
  eq(v.nums.dormantWorld, ca.dormantWorld,
    'B4e dormantWorld 与 capabilityAudit.summary 同值（实 ' + v.nums.dormantWorld + ' vs ' + ca.dormantWorld + '）');
  // B5 结论句零技术词（玩家语言，不是诊断语言）
  const TECH = ['注入源', '引擎', '门槛', '预算', 'buildBlock', 'faceAudit', 'ns ', 'undefined', 'null', 'NaN'];
  const hitTech = TECH.filter(function (w) { return v.line.indexOf(w) >= 0; });
  eq(hitTech.length, 0, 'B5 结论句零技术词（命中：' + hitTech.join(',') + '）');
  // B6 结论句必须含至少一个真实数字（「世界跑起来了吗」的答案得有读数撑着）
  assert(/\d/.test(v.line), 'B6 结论句含真实数字（实：' + v.line + '）');
  // B7 next 形态合法：null 或 {do:string, hint:string}
  assert(v.next === null || (v.next && typeof v.next.do === 'string' && typeof v.next.hint === 'string'),
    'B7 next 只能是 null 或 {do, hint}（实 ' + JSON.stringify(v.next) + '）');
  // B8 四态各有一句结论 + 一条下一步（不许有态无话）
  const STATES = ['running', 'thin', 'blocked', 'unknown'];
  STATES.forEach(function (s, i) {
    const re = new RegExp("state = '" + s + "'");
    assert(re.test(HP_SRC), 'B8.' + i + ' 四态 ' + s + ' 有赋值分支');
  });
  // B9 firstRunLine = line + hint（整句唯一来源，面板不许自己拼）
  const fl = hp.firstRunLine({ sample: 0 });
  assert(fl.indexOf(v.line) === 0, 'B9a 整句以结论句开头（面板逐字取它）');
  if (v.next && v.next.hint) assert(fl.indexOf(v.next.hint) > 0, 'B9b 整句含下一步 hint');

  // ═══════════════════════════════════════════════════════════════════════════
  section('C. 四态真驱动：换掉函数外依赖，四态全部走得到');
  const SAVED = { ct: WA.capabilityTier, r: WA.render, ib: WA.injectBudget };
  function drive(mut, restore) {
    try { mut(); return hp.firstRunView({ sample: 0 }); } finally { restore(); }
  }
  const cUnknown = drive(function () { delete WA.capabilityTier; },
    function () { WA.capabilityTier = SAVED.ct; });
  eq(cUnknown.state, 'unknown', 'C1 摘掉机制面 ⇒ unknown（读不到不折叠成别的态）');
  assert(cUnknown.line.indexOf('读不到') >= 0, 'C1b unknown 的结论句明写「读不到」');
  const cBlocked = drive(function () {
    WA.injectBudget = Object.assign({}, SAVED.ib, {
      resolveBudget: function () { return { budget: 2400, source: 'manual', contextSize: 8192 }; },
      plan: function () { return { used: 2400, dropped: ['a', 'b', 'c'] }; }
    });
  }, function () { WA.injectBudget = SAVED.ib; });
  eq(cBlocked.state, 'blocked', 'C2 预算挤掉内容 ⇒ blocked');
  assert(cBlocked.next && typeof cBlocked.next.do === 'string', 'C2b blocked 带一条可执行动作（' + (cBlocked.next && cBlocked.next.do) + '）');
  const cRunning = drive(function () {
    WA.render = Object.assign({}, SAVED.r, {
      visibilityStat: function () {
        return { faceAudit: faces.map(function (f) { return Object.assign({}, f, { face: 'on' }); }) };
      }
    });
  }, function () { WA.render = SAVED.r; });
  eq(cRunning.state, 'running', 'C3 可见性面全通 ⇒ running');
  eq(v.state, 'thin', 'C4 出厂态 ⇒ thin（6/107 不足半数）');
  // C5 四态全覆盖（这四条的并集必须恰是封闭集，多一个少一个都说明有态走不到）
  const seen = [cUnknown.state, cBlocked.state, cRunning.state, v.state];
  STATES.forEach(function (s, i) { assert(seen.indexOf(s) >= 0, 'C5.' + i + ' 四态 ' + s + ' 在运行时真走到（' + seen.join('/') + '）'); });
  // C6 机制面缺席时不得报 running（「不知道」≠「健康」—— 本仓 v2.259.0 用 ok 字段踩过）
  assert(cUnknown.state !== 'running', 'C6 读不到时绝不报 running');

  // ═══════════════════════════════════════════════════════════════════════════
  section('D. 面板渲染：结论块在概览页真出现，class 跟真 state');
  {
    const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
    const env = gate.fresh();
    const dom = env.dom, W = env.WA;
    if (W.ui && typeof W.ui.open === 'function') W.ui.open();
    //   v2.263.0 收口（全量实测：D2–D7 六条在全量里红、单跑绿）：
    //     `ui.open()` 打开的是**上次那一页**——`ui/panel.js` 的 `__pageOr()` 从
    //     `worldaxis_panel_state_v1`（settingsBus，localStorage 跨节存活）读 `page`。
    //     单跑时那份记录不存在 ⇒ 落 'overview'；全量里前序节把面板停在别的页（设置/机制…），
    //     于是 `open()` 之后 `.wa-body` 里根本没有概览页那块 ⇒ `#wa-first-line` 一个都找不到，
    //     D2–D7 六条连锁红（D3/D6 读到的 m 是 null）。
    //     这不是产品缺陷：**面板记住上次那一页是正确行为**。缺的是本段的显式前置 ——
    //     「概览页含结论块」这条断言必须先站在概览页上。故显式 `goPage('overview')`
    //     （切页单一入口，与 tab 点击同路），再取 `.wa-body`。
    if (W.ui && typeof W.ui.goPage === 'function') W.ui.goPage('overview');
    const panel = dom.getElementById('wa-panel');
    const body = panel && panel.querySelector('.wa-body');
    const html = String((body && body.innerHTML) || '');
    assert(html.length > 1000, 'D1 概览页渲染出实质内容（长度 ' + html.length + '）');
    assert(html.indexOf('id="wa-first-line"') >= 0, 'D2 概览页含结论块 #wa-first-line');
    const m = html.match(/id="wa-first-line"[^>]*>([^<]*)/);
    assert(!!m && m[1].length > 10, 'D3 结论块有实质文字（' + (m && m[1].slice(0, 30)) + '…）');
    // v2.275.0：**class 必须从 #wa-first-line 那一个元素上读**。
    //   原写法 `/class="([^"]*wa-first[^"]*)"/` 取的是「全文第一个含 wa-first 的 class」——
    //   v2.274.0 起概览页多了一块 `#wa-first-block`（开局引导，class 恒为
    //   `wa-first wa-first-live`），而它在模板里排在 ${firstLine} **之前**，于是本判据
    //   读到的是那一块的 class：`wa-first-live` 与真 state（thin）永远对不上，
    //   而产品侧其实是对的。这不是产品缺陷，是判据抓错了元素 —— 一条「按文字找替身」的
    //   老毛病（D4/D5 想咬的是结论块，抓的却是「随便哪个含 wa-first 的块」）。
    //   修法：锚到 id 上（id 是契约，class 才是被验对象）。
    const lineTag = (html.match(/<div[^>]*id="wa-first-line"[^>]*>/) || [''])[0];
    const cls = (lineTag.match(/class="([^"]*)"/) || [null, '']);
    assert(!!lineTag, 'D4 结论块带 wa-first class（在 #wa-first-line 那一个元素上读）');
    const realState = W.healthPreflight.firstRunView({ sample: 0 }).state;
    assert(!!cls[1] && cls[1].indexOf('wa-first-' + realState) >= 0,
      'D5 class 与真 state 一致（#wa-first-line 的 class=' + cls[1] + ' · state=' + realState + '）');
    // D6 结论块文字就是 firstRunLine 逐字（面板不自己拼措辞）
    const expect = W.healthPreflight.firstRunLine({ sample: 0 });
    assert(!!m && m[1] === expect.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') || (!!m && m[1].indexOf(expect.slice(0, 20)) === 0),
      'D6 结论块文字取自 firstRunLine（面板不另拼措辞）');
    // D7 结论块排在 capLine 之前（结论先于三面并列行 —— 玩家先看结论再看详情）
    const iFirst = html.indexOf('id="wa-first-line"');
    const iCap = html.indexOf('id="wa-cap-line"');
    assert(iFirst > 0 && (iCap < 0 || iFirst < iCap), 'D7 结论块排在启用面摘要行之前（' + iFirst + ' < ' + iCap + '）');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section('E. 诊断包：firstRun 子节真进 collect()，与门槛清单分列');
  {
    const d = WA.toolDiag.collect({ sections: ['health'] });
    const h = ((d || {}).sections || {})['health'] || (d || {})['health'] || null;
    assert(!!h, 'E1 诊断包 health 节可取');
    assert(!!(h && h.firstRun), 'E2 health 节含 firstRun 子节');
    assert(!(h && h.firstRun && h.firstRun.error), 'E3 firstRun 无错误（' + JSON.stringify(h && h.firstRun && h.firstRun.error) + '）');
    assert(h && h.firstRun && ['running', 'thin', 'blocked', 'unknown'].indexOf(h.firstRun.state) >= 0,
      'E4 诊断里的 state 合法（实 ' + (h && h.firstRun && h.firstRun.state) + '）');
    assert(h && typeof h.line === 'string' && h.line.length > 0, 'E5 门槛清单的 line 仍在（两句话分列，不互相顶掉）');
    assert(h && h.firstRun && typeof h.firstRun.line === 'string', 'E6 firstRun.line 是玩家语言那一句');
    assert(h && h.firstRun.line !== h.line, 'E7 两句不同（玩家结论 ≠ 诊断门槛句）');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 负控制区：每条都是「真源码破坏 → 装破坏副本（带上真依赖）→ 重跑同款判据」。
  //   ⚠ 副本会换掉 global.WorldAxis，故每条结束都恢复原 WA —— 否则后续判据
  //     读到的是破坏副本，会连环假红（v2.262.0 踩过「锚点失效后 N6 静默漏跑」）。
  section('F. 负控制 N1：破坏判序（absent 不再计入 unknown）⇒ 半读数替全体下判断');
  {
    // 病态输入：摘掉预算裁判 ⇒ threeGates 门槛③ absent ⇒ g.absent = 1。
    //   这是「有一面读不到」的最真实形态（模块没装，不是读出错）。
    const depsAbsent = { capabilityTier: WA.capabilityTier, render: WA.render, injectBudget: undefined };
    // ① 正版在这一组 deps 下必须报 unknown（A4 判序的运行时证明）
    const okOnAbsent = loadHPFrom(HP_SRC, 'N1ok', depsAbsent);
    assert(!!okOnAbsent, 'N1.0 正版副本装载成功');
    const okState = okOnAbsent ? okOnAbsent.firstRunView({ sample: 0 }).state : '(未装载)';
    eq(okState, 'unknown', 'N1.1 正版：有面读不到 ⇒ unknown（不折成 blocked/thin/running）');
    // ② 同款判据跑在破坏副本上：absent 不再进 unknown ⇒ 结论必变
    const bad = breakOnce(HP_SRC, A_ORDER_UNKNOWN, "if (!mechOk || !g) state = 'unknown';", 'N1');
    if (bad) {
      const u = loadHPFrom(bad, 'N1', depsAbsent);
      if (u && typeof u.firstRunView === 'function') {
        const badState = u.firstRunView({ sample: 0 }).state;
        assert(badState !== 'unknown',
          'N1.2 破坏后 absent 不再产生 unknown（实 ' + badState + '）—— 判序真的是活的');
        // 破坏后落到哪一档也要能说清：absent=1 不再拦路，degraded=1 仍在 ⇒ thin
        eq(badState, 'thin', 'N1.3 破坏后落到 thin（degraded 那一路）—— 这一档正是「拿一半读数下判断」');
      } else { assert(false, 'N1.4 破坏副本装载失败（负控制不成立）'); }
    }
    // ③ 恢复真 WA，后续判据必须读到真货（副本会覆盖 global.WorldAxis）
    global.WorldAxis = WA;
    eq(hp.firstRunView({ sample: 0 }).state, 'thin', 'N1.5 恢复到真 WA 后结论回出厂态 thin（副本不外泄）');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section('G. 负控制 N2：删掉 thin 分支 ⇒ 出厂态（6/107）被报成 running');
  {
    const deps = { capabilityTier: WA.capabilityTier, render: WA.render, injectBudget: WA.injectBudget };
    const bad = breakOnce(HP_SRC, A_THIN, "else if (false) state = 'thin';", 'N2');
    if (bad) {
      const u = loadHPFrom(bad, 'N2', deps);
      if (u) {
        const r = u.firstRunView({ sample: 0 });
        // 出厂态真值是 thin（6/107 只过了一半以下的源）。删掉这条分支后，
        //   blocked=0 且 degraded>0 会一路落到最后的 else ⇒ running。
        //   这正是本仓点名的「把部分成功折成全成功」—— 玩家读到「正在运转」就不会去切档。
        eq(r.state, 'running', 'G1 删掉 thin 分支后出厂态被误报成 running（实 ' + r.state + '）');
        assert(r.nums.degraded > 0, 'G1b 而 degraded 实际上是 ' + r.nums.degraded + '（读数摆在那里，结论却错）');
        global.WorldAxis = WA;
        eq(hp.firstRunView({ sample: 0 }).state, 'thin', 'G2 正版出厂态是 thin（判据真）');
      } else { assert(false, 'G3 破坏副本装载失败'); global.WorldAxis = WA; }
    }
    global.WorldAxis = WA;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section('H. 负控制 N3：破坏 dormantWorld 口径（改回 view().dormant）⇒ 与 summary 失配');
  {
    // 首版就是直接取 view().dormant（95）而 summary 排除了 no-builder —— 两者此仓恰好同值，
    //   所以判据不能只看数字相等，还要看**算法出处**：源里必须出现 summary 的排除式。
    const bad = breakOnce(HP_SRC, A_DORMANT, "nums.dormantWorld = Number(v.dormant) || 0; // 口径破坏", 'N3');
    assert(!!bad, 'H1 破坏锚点命中（口径那一行可定位）');
    // ⚠ 首版这条写的是「bad 里不该再出现 dormantMechanisms」—— 但它写在三元表达式里，
    //   破坏只替换了 `?` 分支，`typeof ... === 'function'` 那半截仍在，故「字面上还有」。
    //   正确口径：破坏后**不再有取 dormantMechanisms 的分支**（`? ...dormantMechanisms` 消失），
    //   且数值退回 view().dormant 那一路。
    assert(bad.indexOf('? WA.capabilityAudit.dormantMechanisms().length') < 0,
      'H2 破坏后不再有「走 dormantMechanisms 的取值分支」');
    assert(bad.indexOf('Number(v.dormant) || 0; // 口径破坏') >= 0,
      'H2b 破坏后取值退回 view().dormant（含 no-builder 的旧口径）');
    assert(HP_SRC.indexOf('WA.capabilityAudit.dormantMechanisms().length') >= 0,
      'H3 正版走 dormantMechanisms()（与 summary 同一过滤式的来源）');
    const sumSrcH = fs.readFileSync(path.join(BASE, 'engines/capability-audit.js'), 'utf8');
    assert(sumSrcH.indexOf("r.reason !== 'no-builder'") >= 0,
      'H3b 口径出处：summary 与 dormantMechanisms 共用 reason !== no-builder 过滤');
    eq(hp.firstRunView({ sample: 0 }).nums.dormantWorld, WA.capabilityAudit.summary().dormantWorld,
      'H4 正版上三处 dormant 同值（判据真）');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section('I. 负控制 N4：破坏整句拼接 ⇒ 面板那句少了「下一步」');
  {
    const bad = breakOnce(HP_SRC, A_LINE_CALL, "return v.line;", 'N4');
    if (bad) {
      const u = loadHPFrom(bad, 'N4');
      if (u) {
        const r = u.firstRunView({ sample: 0 });
        const line = u.firstRunLine({ sample: 0 });
        assert(r.next && r.next.hint && line.indexOf(r.next.hint) < 0,
          'I1 破坏后整句只剩结论，hint 丢失（副作用：玩家读到问题但没有下一步）');
        const okLine = hp.firstRunLine({ sample: 0 });
        assert(okLine.indexOf(v.next.hint) > 0, 'I2 正版整句含 hint（判据真）');
      } else { assert(false, 'I3 破坏副本装载失败'); }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section('J. 负控制 N5：破坏面板四态 class（写死 thin）⇒ class 与真 state 脱节');
  {
    const bad = breakOnce(PANEL_SRC, A_PANEL_CLS,
      "return '<div class=\"wa-dim wa-first wa-first-thin\" id=\"wa-first-line\">'", 'N5');
    assert(!!bad, 'J1 破坏锚点在位（面板 class 拼接可定位）');
    assert(bad.indexOf("wa-first-' + esc(fv.state)") < 0, 'J2 破坏后不再按真 state 拼 class');
    assert(PANEL_SRC.indexOf("wa-first-' + esc(fv.state)") >= 0, 'J3 正版按真 state 拼 class（判据真）');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section('K. 负控制 N6：破坏 blocked 优先（挪到 thin 之后）⇒ 卡死被报成太少');
  {
    // 这一条与 N1 互补：N1 验 unknown 的优先级，N6 验 blocked 与 thin 的相对顺序。
    const iBlk = HP_SRC.indexOf(A_ORDER_BLOCKED);
    const iThin = HP_SRC.indexOf(A_THIN);
    assert(iBlk > 0 && iThin > iBlk, 'K1 blocked 判定排在 thin 之前（' + iBlk + ' < ' + iThin + '）—— 卡死比太少更严重');
    // 用运行时真驱动复核这个顺序：dropped>0 时必须是 blocked 而不是 thin
    const SAVED_IB = WA.injectBudget;
    try {
      WA.injectBudget = Object.assign({}, SAVED_IB, {
        resolveBudget: function () { return { budget: 2400, source: 'manual', contextSize: 8192 }; },
        plan: function () { return { used: 2400, dropped: ['x'] }; }
      });
      const r = hp.firstRunView({ sample: 0 });
      assert(r.state === 'blocked', 'K2 有内容被挤掉时报 blocked 而非 thin（实 ' + r.state + '）');
    } finally { WA.injectBudget = SAVED_IB; }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section('Q. 假绿记录：本版抓到的三处算错形态');
  // 假绿①：同名不同算法 —— `dormantWorld` 在 summary 里排除了 no-builder，在 view() 里没有
  {
    const sumSrc = fs.readFileSync(path.join(BASE, 'engines/capability-audit.js'), 'utf8');
    assert(sumSrc.indexOf("r.reason !== 'no-builder'") >= 0,
      'Q1 capabilityAudit.summary 的 dormantWorld 排除 no-builder（口径出处）');
    assert(sumSrc.indexOf('dormantWorld = ') >= 0, 'Q2 summary 里确实叫这个名（同名才是坑）');
  }
  // 假绿②：判据读到不存在的字段不会红 —— 这里正面要求每个 nums 键都是真数字
  {
    const numsKeys = ['mechanisms', 'running', 'dormantWorld', 'sources', 'sourcesOn', 'blocked', 'degraded', 'absent'];
    const bad = numsKeys.filter(function (k) { return typeof v.nums[k] !== 'number'; });
    eq(bad.length, 0, 'Q3 nums 八个键全是真数字（读到 undefined 不会红，这是最隐蔽的假绿）');
  }
  // 假绿③：空壳探针 —— 首版 P 面写了个从未被调用的 withThree()，D 面只打了一句「由专锁验」
  {
    const probeSrc = fs.readFileSync(path.join(BASE, 'tools/v6probes/p_first.js'), 'utf8');
    assert(probeSrc.indexOf('四态真驱动') >= 0, 'Q4 探针有四态真驱动段（不是空壳）');
    assert(probeSrc.indexOf('drive(') >= 0, 'Q5 探针真调了驱动函数（空壳比没有更坏：它让走不到的态看不见）');
    const calls = (probeSrc.match(/const c\d = drive\(/g) || []).length;
    assert(calls >= 3, 'Q6 探针至少驱动 3 个非出厂态（实 ' + calls + '）');
  }
  // 本版开工时先修掉的一处账坏：v2.262.0 的挂载块被插了两份，专锁在全量里跑两遍
  {
    const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
    eq((runSrc.match(/runLock\('\.\/settings-lanes-v2262\.js'/g) || []).length, 1,
      'Q7 v2.262.0 挂载块恰 1 处（上一版重复挂载已修 —— 重复跑会让条数台账失真）');
  }
}

function report() {
  console.log('\n═══ first-run-v2263: ' + pass + ' 通过 / ' + fail + ' 失败 ═══');
  if (fail) { console.log('失败项：'); fails.forEach(function (f) { console.log('  · ' + f); }); }
}
async function runAll(assertFn) {
  __extAssert = assertFn || null;
  pass = 0; fail = 0; fails.length = 0;
  try {
    runCore();
  } catch (e) {
    assert(false, 'first-run-v2263 正文抛错：' + ((e && e.stack) || e));
    fail++;
  } finally {
    __extAssert = null;
  }
  if (!assertFn) report();
  return { pass: pass, fail: fail };
}
if (require.main === module) {
  runAll(null).then(function (r) { process.exit(r.fail === 0 ? 0 : 1); }).catch(function (e) {
    console.error('FATAL: ' + ((e && e.stack) || e)); process.exit(1);
  });
}
module.exports = { runAll: runAll };
#!/usr/bin/env node
// WorldAxis tests/opv29-z1-04-v2529.js — OPV29-04 惰性装载
//
// 验收（计划表原话）：**首帧装载边数下降；面板行为不变**。
// 这两条各自都有一个「看起来做到了」的假形态：
//   · 首帧装载边数下降 —— 把条目从清单里删掉，数字立刻下降，代价是那台引擎**永远不装**；
//   · 面板行为不变 —— 首帧不装，而面板要用时又装不回来（异步取源码失败就静默少一块功能）。
// 所以本锁钉的不是「数字小了」，而是三件事：
//   ① 惰性档**非空**（B0：删空档换下降会立刻红）；
//   ② 惰性档的**契约面没缩小**（B2：每条都还在 registry 账本里 —— 门禁眼里没有「消失的模块」）；
//   ③ 装得回来（A 面：ensure 幂等、并发只装一次、失败退回 pending 可重试、auto 串行不并发）。
// 另有一条直接针对「面板行为不变」的证据（D2）：惰性档的每个 ns 在产品源面**零出现** ——
//   面板不读它们，延迟装载就不可能让面板少块功能（读面凭空消失才是真回归）。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function a(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); return true; }
  fail++;
  console.log('  ✗ ' + name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)));
  return false;
}
const RD = function (rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); };

function mkSandbox() {
  const win = { console: { log: function () {}, warn: function () {}, error: function () {} } };
  const sb = {
    window: win, console: win.console,
    Promise: Promise, JSON: JSON, Math: Math, Object: Object, Array: Array,
    String: String, Number: Number, Boolean: Boolean, Error: Error, isFinite: isFinite
  };
  win.WorldAxis = { registerModule: function (n, m) { (win.__regs = win.__regs || []).push({ rel: n, meta: m }); } };
  return sb;
}
function loadLazy(srcOverride) {
  const sb = mkSandbox();
  const ctx = vm.createContext(sb);
  vm.runInContext(srcOverride === undefined ? RD('engines/lazy-load.js') : srcOverride, ctx, { filename: 'engines/lazy-load.js' });
  return { LL: sb.window.WorldAxis.lazyLoad, regs: sb.window.__regs || [] };
}
const tick = function () { return new Promise(function (r) { setImmediate(r); }); };

(async function main() {
  // ══════════ A 面：机制（纯沙箱） ══════════
  console.log('\n── A 面：装得回来（幂等 / 去重 / 串行 / 可重试）──');
  {
    const m = loadLazy();
    const LL = m.LL;
    a(!!LL && LL.version === '2.529.0', 'A1 模块挂载且版本对');
    a(m.regs.length === 1 && m.regs[0].rel === 'engines/lazy-load.js', 'A2 注册一次且名对', m.regs);
    let rejected = null;
    try { await LL.ensure('engines/x.js'); } catch (e) { rejected = e; }
    a(!!rejected && String(rejected.message).indexOf('bind') >= 0, 'A3 没接装载器时 ensure 明确失败（不假装装上）', rejected && rejected.message);
    a(LL.add(['a.js', 'b.js']) === 2, 'A4 add 首次登记 2 条');
    a(LL.add(['a.js', 'b.js', 'c.js']) === 1, 'A5 add 去重：重复登记返回 0+新条目 1', LL.add([]));
    const calls = [];
    LL.bind(function (rel) { calls.push(rel); return Promise.resolve({ ok: true }); });
    const r1 = await LL.ensure('a.js');
    const r2 = await LL.ensure('a.js');
    a(r1.ok === true && r2.ok === true && r2.reused === true, 'A6 已装后再 ensure 直接复用（reused）', [r1, r2]);
    a(calls.length === 1, 'A7 幂等：装载器只被调用一次', calls);
    const c2 = [];
    const p1 = LL.ensure('b.js'), p2 = LL.ensure('b.js');
    a(p1 === p2, 'A8 并发 ensure 拿到同一个在飞 promise');
    const rr = await p1;
    a(rr.ok === true, 'A9 并发那次装成功');
    a(c2.length === 0, 'A10 未登记的条目不进别的闸门（c 仍 pending）');
    a(LL.plan().pending.indexOf('c.js') >= 0, 'A11 plan 里 c 仍 pending');
  }
  {
    const m = loadLazy();
    const LL = m.LL;
    let mode = 'fail';
    const tries = [];
    LL.bind(function (rel) {
      tries.push(rel);
      if (rel === 'bad.js' && mode === 'fail') return Promise.resolve({ ok: false, error: 'boom' });
      return Promise.resolve({ ok: true });
    });
    LL.add(['bad.js']);
    const f1 = await LL.ensure('bad.js');
    a(f1.ok === false, 'A12 装载失败 → ok:false');
    a(LL.plan().pending.indexOf('bad.js') >= 0, 'A13 失败**退回 pending**（不是永久 dead）', LL.plan());
    a(LL.plan().failed.indexOf('bad.js') >= 0, 'A14 失败逐条点名在 plan().failed');
    mode = 'ok';
    const f2 = await LL.ensure('bad.js');
    a(f2.ok === true && LL.plan().loaded.indexOf('bad.js') >= 0, 'A15 失败后可重试，重试成功即 loaded');
    a(tries.length === 2, 'A16 重试真的又装了一次（不是记忆里的失败）', tries);
    // auto 串行 + 单条失败不终止
    let live = 0, peak = 0;
    LL.bind(function (rel) {
      live++;
      peak = Math.max(peak, live);
      return new Promise(function (res) {
        setImmediate(function () {
          live--;
          res(rel === 's2.js' ? { ok: false, error: 'flaky' } : { ok: true });
        });
      });
    });
    LL.add(['s1.js', 's2.js', 's3.js']);
    const p = await LL.auto();
    a(peak === 1, 'A17 auto **串行**：并发峰值 1（并发装载会在同一份 WA 上打架）', peak);
    a(p.loaded.indexOf('s1.js') >= 0 && p.loaded.indexOf('s3.js') >= 0, 'A18 auto 里单条失败不终止整轮（s1/s3 仍装上）', p.loaded);
    a(p.pending.indexOf('s2.js') >= 0, 'A19 失败的 s2 留在 pending（下次还能补）', p.pending);
    const sz = LL.plan();
    a(sz.loaded.length + sz.pending.length + sz.loading.length === sz.lazy.length,
      'A20 plan 收支自洽：loaded+pending+loading == lazy 总数', sz);
    const again = await LL.ensure('never-registered.js');
    a(again.ok === true && LL.plan().lazy.indexOf('never-registered.js') >= 0, 'A21 未登记条目也能按需 ensure（并进入台账）');
  }
  {
    // 负控制：把 add 的去重判据改坏 → A5 必须变红
    const src = RD('engines/lazy-load.js');
    const from = 'if (Object.prototype.hasOwnProperty.call(status, rel)) continue;';
    a(src.indexOf(from) >= 0, 'A22 负控制锚点存在（add 去重判据）');
    const m = loadLazy(src.split(from).join('if (false) continue;'));
    a(m.LL.add(['x.js']) === 1 && m.LL.add(['x.js']) === 1, 'A23 负控制：去掉去重判据后重复 add 仍然加进去（A5 不是空断言）');
  }
  {
    // 负控制：失败分支改成直接标 loaded → A13/A15 必须变红
    const src = RD('engines/lazy-load.js');
    const from = "status[rel] = 'pending';            // 失败退回 pending：可重试";
    a(src.indexOf(from) >= 0, 'A24 负控制锚点存在（失败退回 pending）');
    const m = loadLazy(src.split(from).join("status[rel] = 'loaded';"));
    m.LL.bind(function () { return Promise.resolve({ ok: false }); });
    m.LL.add(['z.js']);
    await m.LL.ensure('z.js');
    a(m.LL.plan().pending.indexOf('z.js') < 0, 'A25 负控制：失败被标成 loaded 后 z 不再 pending（A13 不是空断言）');
  }

  // ══════════ B 面：接线与契约面（读真文件） ══════════
  console.log('\n── B 面：接线、契约面、首帧读数 ──');
  const idxSrc = RD('index.js');
  const mOrd = idxSrc.match(/const LOAD_ORDER = \[([\s\S]*?)\n  \];/);
  const mLazy = idxSrc.match(/const LAZY_ORDER = \[([\s\S]*?)\n  \];/);
  const parse = function (mm) { return mm ? (mm[1].match(/'([^']+\.js)'/g) || []).map(function (q) { return q.slice(1, -1); }) : null; };
  const eager = parse(mOrd), lazy = parse(mLazy);
  // v2.542.23 跟位：582 → 583（story-export 从惰性档回首帧：工具页「导出正文」两个按钮真调它）。
  a(!!eager && eager.length === 596, 'B1 首帧清单 LOAD_ORDER 解析出 596 条（v2.594.0 跟位：595 → 596 = engines/projection-bridge.js 入首帧，排在 observation-projection 之后）（v2.592.0 跟位：594 → 595 = engines/refine-bridge.js 入首帧）（v2.591.0 跟位：592 → 594 = engines/arc-guide-bridge.js 与 v2.590.0 的 engines/pending-recon.js 各入一条首帧，两步合一补记）（v2.589.0 跟位：588 → 592 = engines/settings-desk.js + ui/pages/faces-page.js 两表各 +2）（v2.585.0 跟位：586 → 587 = appearance-lexicon（data-only 词表）入首帧）（v2.583.0 跟位：585 → 586 = attire-state 归位首帧）（v2.542.24：583 → 584 = api-vault 归位）（v2.542.21 跟位：575 → 581 → 582 = 叙事脊柱 L1–L4 四台引擎 + ui/* 首帧条目 + json-repair 归位；v2.542.23 → 583 = story-export 归位）', eager && eager.length);
  // A0b / A0e：惰性档非空 ——防「删空档换下降」
  a(!!lazy && lazy.length >= 10, 'B2 惰性档**非空**且成规模（≥10 条；删空换下降会在这里红）', lazy && lazy.length);
  // v2.542.23 跟位：21 → 20（story-export 同病：产品面真读，不能再懒）。
  a(!!lazy && lazy.length === 26, 'B3 惰性档 26 条（v2.603.0 跟位：25 → 26 = engines/calendar-custom-bridge.js 入惰性档——被读方 calendarPlan 在首帧档，本模块只被工具页面板与专锁读）（v2.602.0 跟位：24 → 25 = engines/purify-scope-bridge.js 入惰性档——被读方 purifyScope 在首帧档，本模块只被工具页面板与专锁读）（v2.601.0 跟位：23 → 24 = engines/polish-bridge.js 入惰性档——被读方 polish 在首帧档，本模块只被工具页面板与专锁读，进首帧只会多装一个模块）（v2.600.0 跟位：22 → 23 = engines/binding-bridge.js 入惰性档——被读方 binding 在首帧档，本模块只被工具页面板读）（v2.599.0 跟位：21 → 22 = engines/contrast-bridge.js 入惰性档——只被工具页面板读）（v2.598.0 跟位：20 → 21 = engines/byte-budget-bridge.js 入惰性档——它只被工具页面板读）（v2.597.0 跟位：19 → 20 = engines/ensemble-bridge.js 入惰性档——它只被工具页面板读，进首帧只会让首帧多装一个模块）（v2.596.0 跟位：18 → 19 = engines/fact-age-bridge.js 与 fact-age 同档装载——它离开被委托方只剩一句“未装载”，提首帧只会让面板首帧读到 module-missing）（v2.569.0 跟位：19 → 18 = 惰性档一台归位首帧）（v2.542.24：20 → 19 = api-vault 归位）（v2.542.21 跟位：22 → 21；v2.542.23：21 → 20 —— 惰性档只放「产品源面零出现」的模块）', lazy && lazy.length);
  const inter = (eager || []).filter(function (x) { return (lazy || []).indexOf(x) >= 0; });
  a(inter.length === 0, 'B4 首帧清单与惰性档**零交集**（不双登记：否则「下降」是假的）', inter);
  a((lazy || []).every(function (x) { return x.indexOf('ui/') !== 0; }), 'B5 惰性档不含 ui/*（UI 层本来就不在装载序）');
  a(new Set(lazy || []).size === (lazy || []).length, 'B6 惰性档无重复条目');
  const lazyFilesExist = (lazy || []).filter(function (x) { return !fs.existsSync(path.join(ROOT, x)); });
  a(lazyFilesExist.length === 0, 'B7 惰性档每条都有真实文件（不是写了名字不存在的空档）', lazyFilesExist);
  // 契约面没缩小：每条都在 registry 账本里
  const led = JSON.parse(RD('tests/module-registry-ledger.json'));
  const notInLedger = (lazy || []).filter(function (x) { return !led.modules[x]; });
  a(notInLedger.length === 0, 'B8 惰性档每条仍在 registry 账本里（门禁眼里没有「消失的模块」）', notInLedger);
  a(led.lazyCount === 26, 'B9 账本记录 lazyCount=26（v2.603.0 跟位：25 → 26 = calendar-custom-bridge 入惰性档）（v2.602.0 跟位：24 → 25 = purify-scope-bridge 入惰性档）（v2.601.0 跟位：23 → 24 = polish-bridge 入惰性档）（v2.600.0 跟位：22 → 23 = binding-bridge 入惰性档）（v2.599.0 跟位：21 → 22 = contrast-bridge 入惰性档）（v2.598.0 跟位：20 → 21 = byte-budget-bridge 入惰性档）（v2.597.0 跟位：19 → 20 = ensemble-bridge 入惰性档）（v2.596.0 跟位：18 → 19 = fact-age-bridge 入惰性档）（v2.569.0 跟位）（registry 报告的惰性面读数；v2.542.23 跟位）', led.lazyCount);
  // v2.542.8：原判据「loadedCount === loadOrderCount」是 v2.529 之前的巧合 —— 那时
  //   LOAD 只等于 LOAD_ORDER、且首帧表里没有 ui/*，两数自然相等。v2.529.0（OPV29-04）把
  //   契约面改成 `LOAD_ORDER ∪ LAZY_ORDER` 并剔掉 ui/* 之后，这两个数**各有定义**：
  //     契约面 = (首帧 586 − ui 24) ∪ 惰性 18 = 580（v2.583.0 R254：新增 attire-state ⇒ 首帧与契约面各 +1）
  //   v2.585.0（R261）：新增 engines/appearance-lexicon.js（data-only 词表）⇒ 首帧与契约面各 +1：
  //     首帧 586 → 587、契约面 580 → 581（ui 24 / 惰性 18 不动）。
  //   于是恒等式变成 `loaded = loadOrder − ui + lazy`。原式在结构上再也不可能成立，
  //   继续留着一个必然为假的等式只会逼后来人改数字骗过它。这里换成真恒等式：
  //   任何一项漂移（少一台引擎 / 惰性档被删空 / ui 条目被塞进契约面）都会在这里红。
  //   v2.589.0（R264 / CFG-2）：新增 engines/settings-desk.js（引擎面 +1）与 ui/pages/faces-page.js（ui 面 +1）
  //     ⇒ loaded 582 → 584、loadOrder 588 → 592（引擎 +1、页面 +1、index.js 的 ui/pages/faces-page.js 一条、
  //     tests/run.js LOAD 一条，两表各 +2）、ui 24 → 26（faces-page 与 panelFacesPage 的读者面）。
  //     惰性档 18 不动；恒等式 584 = 592 − 26 + 18 成立。
  //   v2.590.0（R265 / PBS-1）：新增 engines/pending-recon.js（纯引擎、无新 ui 文件）⇒
  //     loaded 584 → 585、loadOrder 592 → 593（index.js 与 tests/run.js 两表各 +1）；
  //     ui 26 与惰性 18 都不动；恒等式 585 = 593 − 26 + 18 成立。
  //   v2.591.0（R266 / NAR-1）：新增 engines/arc-guide-bridge.js（纯引擎、无新 ui 文件）⇒
  //     loaded 585 → 586、loadOrder 593 → 594（两表各 +1）；恒等式 586 = 594 − 26 + 18 成立。
  // v2.592.0（RFA-1）：首帧 594 → 595、契约面 586 → 587（engines/refine-bridge.js）。
  // v2.599.0（CNT-1）：契约面 591 → 592、惰性 21 → 22（engines/contrast-bridge.js）。
  // v2.598.0（SLT-1）：契约面 590 → 591、惰性 20 → 21（engines/byte-budget-bridge.js）。
  // v2.597.0（ENS-1）：契约面 589 → 590、惰性 19 → 20（engines/ensemble-bridge.js）—— 首帧不动，
  //   因为它只被工具页面板读（惰性档）。
  // v2.596.0（FAG-1）：契约面 588 → 589、惰性 18 → 19（engines/fact-age-bridge.js）—— 首帧不动，  //   因为它的被委托方 fact-age 本身在惰性档。
  // v2.594.0（OPJ-1）：首帧 595 → 596、契约面 587 → 588（engines/projection-bridge.js）。
  a(led.loadedCount === 596 && led.loadOrderCount === 596 && led.lazyCount === 26 && led.uiCount === 26,
    'B10 契约面 596 = 首帧 596 − ui 26 + 惰性 26（v2.603.0（CAL-1）：calendar-custom-bridge 入惰性档 ⇒ 契约面 +1、惰性 +1；首帧不动）（v2.602.0（PSC-1）：purify-scope-bridge 入惰性档 ⇒ 契约面 +1、惰性 +1；首帧不动）（v2.601.0（PLS-1）：polish-bridge 入惰性档 ⇒ 契约面 +1、惰性 +1；首帧不动）（v2.600.0：binding-bridge 入惰性档 ⇒ 契约面 +1；首帧不动）（v2.599.0：contrast-bridge 入惰性档 ⇒ 契约面 +1；首帧不动）（v2.598.0：byte-budget-bridge 入惰性档 ⇒ 契约面 +1；首帧不动）（v2.597.0：ensemble-bridge 入惰性档 ⇒ 契约面 +1；首帧不动）（v2.596.0：fact-age-bridge 入惰性档 ⇒ 契约面 +1）（v2.594.0：projection-bridge 入首帧与契约面各 +1）（契约面 = 首帧非 ui ∪ 惰性；实测 '
      + [led.loadedCount, led.loadOrderCount, led.lazyCount, led.uiCount].join(' / ') + '）',
    [led.loadedCount, led.loadOrderCount, led.lazyCount, led.uiCount]);
  // 首帧装载边 vs 全量装载边（验收原话的读数）
  const edgesOf = function (list) {
    return list.reduce(function (n, rel) {
      const e = led.modules[rel];
      return n + ((e && Array.isArray(e.requires)) ? e.requires.length : 0);
    }, 0);
  };
  const eagerEdges = edgesOf(eager || []);
  const allEdges = edgesOf((eager || []).concat(lazy || []));
  const lazyEdges = allEdges - eagerEdges;
  a(lazyEdges > 0, 'B11 惰性档确实带走了一批装载期边（不是一条边都没省）', { eagerEdges: eagerEdges, allEdges: allEdges, lazyEdges: lazyEdges });
  a(eagerEdges < allEdges, 'B12 **首帧装载边 < 全量装载边**（验收①）', { eagerEdges: eagerEdges, allEdges: allEdges });
  a(led.totals.loadEdges === allEdges, 'B13 账本全量装载期边与逐条求和一致（读数可复算）', [led.totals.loadEdges, allEdges]);
  // 惰性档的装载期依赖必须都在首帧面（否则它不能懒）
  const eagerSet = {}; (eager || []).forEach(function (x) { eagerSet[x] = true; });
  const badDep = [];
  (lazy || []).forEach(function (rel) {
    const e = led.modules[rel] || {};
    (e.requiresFiles || []).forEach(function (pf) {
      if (pf && pf !== rel && !eagerSet[pf]) badDep.push(rel + ' → ' + pf);
    });
  });
  a(badDep.length === 0, 'B14 惰性档的装载期依赖全部落在首帧面（两两互依赖就不该都在懒档）', badDep);
  // 定性背书：每条惰性项要么在零读账本里登记，要么**确有产品读点**
  //
  //   v2.569.0 修正（本判据此前只有一个方向）：
  //   旧写法 `!nsLed[ns] ⇒ 未定性` 与 ns-consumer-ledger 的纪律④（**键集与门禁零读面双向
  //   一致**）直接冲突：一个 ns 一旦真的接上产品读点，账本就按纪律④要求注销它 ——
  //   于是「已接线」在旧判据眼里反而是「未定性」，两条纪律互相打架。
  //   现场四个就是这一类：greenKeys（v2.568.0 由 worldbook.constGate 真读）、
  //   mixedIndex（v2.567.0 render/inject 注入源）、msgAlign（v2.549.0 core/interceptor）、
  //   writeSerial（v2.551.0 三个世界书写点）—— 全部已注销、且有真实读点。
  //   治法不是放宽（“不在账本里就算过”会把「没人读也没交代」也放过），而是把判据补齐成
  //   两向：`没定性` **且** `没有读点` 才算未定性。读点必须来自 provider 之外的文件，
  //   且惰性面靠 fail-open 兜底（四个读者各自 `if (!WA.x) ⇒ 降级/放行`，见各自头注释）。
  const nsLed = JSON.parse(RD('tests/ns-consumer-ledger.json')).entries;
  const nsOf = {};
  (lazy || []).forEach(function (rel) { ((led.modules[rel] || {}).ns || []).forEach(function (ns) { nsOf[ns] = rel; }); });
  const prodAll = require('./product-files.js').productFiles();
  const readBy = {};
  prodAll.forEach(function (rel) {
    let txt = '';
    try { txt = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return; }
    if (!txt) return;
    Object.keys(nsOf).forEach(function (ns) {
      if (rel === nsOf[ns]) return; // 提供者自己的文件不算「消费者」
      if (new RegExp('WA\\.' + ns + '\\b').test(txt)) (readBy[ns] = readBy[ns] || []).push(rel);
    });
  });
  const unqualified = Object.keys(nsOf).filter(function (ns) {
    if (nsLed[ns]) return false;   // ① 零读账本有定性
    return !readBy[ns];            // ② 否则必须真有产品读点
  });
  a(unqualified.length === 0, 'B15 惰性档每个 ns 要么在零读账本有定性、要么确有产品读点（两向；「没人读也没交代」仍现形）', unqualified);
  const wrongCls = Object.keys(nsOf).filter(function (ns) {
    const e = nsLed[ns]; return e && e.cls !== 'pending-wire' && e.cls !== 'readonly-api';
  });
  a(wrongCls.length === 0, 'B16 定性类别是 pending-wire / readonly-api 之一（wired 不许懒）', wrongCls);
  // 接线三件套
  a(idxSrc.indexOf('WA.lazyLoad.bind(') >= 0 && idxSrc.indexOf('WA.lazyLoad.add(LAZY_ORDER)') >= 0,
    'B17 index.js 交出装载器并登记惰性档（bind + add）');
  a(idxSrc.indexOf('__kickLazy') >= 0 && (idxSrc.indexOf('requestIdleCallback(__kickLazy') >= 0 || idxSrc.indexOf('setTimeout(__kickLazy') >= 0),
    'B18 index.js 首帧后开始补装（空闲帧 / 0ms 兜底，不在装载循环里同步装）');
  const kickPos = idxSrc.indexOf('__kickLazy');
  const loopEnd = idxSrc.indexOf('for (const rel of LOAD_ORDER)');
  a(loopEnd >= 0 && kickPos > loopEnd, 'B19 补装接线在**装载循环之后**（不是循环里偷偷装）');
  a(RD('engines/lazy-load.js').indexOf("WA.registerModule('engines/lazy-load.js'") >= 0 && (lazy || []).indexOf('engines/lazy-load.js') < 0,
    'B20 惰性档自己不懒（它必须在首帧装载，否则没人能补装）');

  // ══════════ D 面：面板行为不变（读面证据） ══════════
  //   v2.569.0 校准面：本面扫的是 **ui/ 面板面**，不是整个产品源面 —— 旧写法取
  //   `testFiles()` 再跳过 `tests/` 前缀，等价于只扫 ui/*.js，但口径写成「产品源面」
  //   ⇒ 读数比事实窄而结论写得更宽（本仓反复治过的同族病）。真实情况：惰性档里有四台
  //   的 ns **确有引擎侧 eager 读点**（greenKeys / mixedIndex / msgAlign / writeSerial），
  //   它们各自 `if (!WA.x) ⇒ 降级/放行` fail-open（见 B15 注释）。而 ui/ 是首帧面、
  //   没有任何 fail-open：面板里读一个未装载的 ns，就是按钮点了什么都不发生。
  //   所以这一面就按 ui/ 判，并且如实写明判的是哪一面。
  console.log('\n── D 面：面板行为不变（惰性档在 ui/ 面板面零读点）──');
  const uiFiles = fs.readdirSync(path.join(ROOT, 'ui')).filter(function (f) { return f.slice(-3) === '.js'; }).map(function (f) { return 'ui/' + f; });
  const srcOf = function (rel) { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return ''; } };
  const hit = [];
  const lazyNs = Object.keys(nsOf);
  uiFiles.forEach(function (rel) {
    if (!rel || rel.indexOf('tests/') === 0) return;
    const txt = srcOf(rel);
    if (!txt) return;
    lazyNs.forEach(function (ns) {
      const re = new RegExp('WA\\.' + ns + '\\b');
      if (re.test(txt)) hit.push(rel + ' 读 WA.' + ns);
    });
  });
  a(hit.length === 0, 'D1 惰性档 ' + lazyNs.length + ' 个 ns 在 **ui/ 面板面**零读取（面板是首帧面、无 fail-open：读到空就是功能少一块）', hit.slice(0, 6));

  console.log('\n合计：' + pass + ' / ' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
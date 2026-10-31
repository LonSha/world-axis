#!/usr/bin/env node
// WorldAxis tests/opt9-panel-v2231.js (v2.231.0) -- OPT-9 专锁：面板按任务组织、按展开计算
//
// 【它治什么（现场实测，不是阅读推断）】
//   OPT-9 原文要的是「将日常操作组织为『看人物/处理事件/推进剧情』等连续任务，专家区保留下钻；
//   **折叠区按展开惰性求值**，事件绑定按当前页面处理，**保留筛选、滚动和展开位置**。先测实际热点
//   再改，避免大规模只换外观。」开工前逐条复核现场（/tmp/probe_opt9.js + /tmp/probe_opt9b.js），
//   两处都是真的：
//     1 **折叠区仍在提前求值**：收起态下切到工具页，7 个专家段的读数**照读**
//       （worldSeed / worldBlueprint / capacityAudit / perfBaseline / depCheck / rulePack /
//       worldLab 各 1 次、kinds 2 次），读数调用占整页渲染 4.137 ms / 54.608 ms（7.6%）。
//       真因是两处提前求值：`foldSec` 的 body 是**模板字面量参数**（调用前就拼好了）、
//       renderTools 入口那几行 `const xxxOn = …getSettings().enabled` 每次都执行。
//     2 **折叠会把同页别的输入冲掉**：折一个别的段之后，同页输入框的值变成 "" ——
//       折叠走整页重绘（收起态不拼接 body，必须重绘才生效），而重绘换掉整块 body。
//       计划原文的验收条款正是「保留筛选、滚动和展开位置」。
//   顺带修一处实测抓出的真缺陷：`wlKinds` 那一行把 `WA.worldLab.kinds()` **调了两次**
//   （一次判真、一次取值）—— 读数调用不该按次计费两次，且两次返回值未必相同。
//
// 【五条口径（逐条有判据咬）】
//   · **惰性 = 不执行**：收起态的段体**连读数都不执行**（不是「读了但不用」）—— B2 用真计数咬。
//   · **展开态逐字如旧**：展开时读数各 1 次、段体照拼、控件数不变（B3/B4）。
//   · **保留位置**：折叠前后同页输入与滚动位一致；`restore` 对不上的控件**如实报 miss**（B5/B6）。
//   · **抓/放只在一处**：折叠点击处调用（面板里 `panelFold.snapshot` / `.restore` 各恰 1 处），
//     不做成 `renderBody` 的全局默认 —— 那些路径本该用新数据覆盖输入框（D1/D1b）。
//   · **不报测不到的收益**：无头环境测不到真机 p95，本锁只报**同机同环境**的差值，如实标边界（G1）。
//
// 四段结构：A 静态契约 / B 运行时行为 / C 面板面与保留 / D 契约与边界 / N 真源码破坏 + 两向自证。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/opt9-panel-v2231.js';
const FOLD = 'ui/panel-fold.js', PANEL = 'ui/panel.js';
// v2.275.0：capability 段（v2.257.0）的 view() 是全渲染链上**唯一**会遍历全部引擎的读数面。
//   它的重复读缺陷由 B3 的「扫描」那一格咬 —— 故本锁也要能装载它的破坏副本。
const CAPTIER = 'engines/capability-tier.js';
function rd(rel, ov) {
  if (ov && ov[rel] !== undefined) return ov[rel];
  return fs.readFileSync(path.join(BASE, rel), 'utf8');
}
function cnt(s, n) { return s.split(n).length - 1; }
// ── 破坏锚点（各恰 1 次，A6 逐键核）──
const ANCHOR = {
  // ① 惰性形态：段体只在真要拼接时求值
  foldLazy: { rel: PANEL, txt: "    const html = function () { return (typeof body === 'function') ? body() : body; };" },
  // ② 展开分支：非收起态才拼段体
  foldExpand: { rel: PANEL, txt: "    return btn + (col ? '' : '<div class=\"wa-fold-b\" data-foldb=\"' + esc(key) + '\">' + html() + '</div>');" },
  // ③ 读数惰性：专家段读数按需取值一次
  panelLazy: { rel: PANEL, txt: "    const lazy = function (fn) { let done = false, v = null; return function () { if (!done) { done = true; v = fn(); } return v; }; };" },
  // ④ kinds 只调一次（真缺陷修复点）
  panelKinds: { rel: PANEL, txt: "      if (!WA.worldLab || typeof WA.worldLab.kinds !== 'function') return null;" },
  // ⑤ 折叠点击处的抓/放（保留位置）
  panelSnap: { rel: PANEL, txt: "        const __foldSnap = (WA.panelFold && typeof WA.panelFold.snapshot === 'function')" },
  panelRestore: { rel: PANEL, txt: "          WA.panelFold.restore(panelEl.querySelector('.wa-body'), __foldSnap, {});" },
  // ⑥ view() 的「一次快照、多面复用」（v2.275.0 修掉的重复读缺陷点）
  capTierSnap: { rel: CAPTIER,
    txt: "    const rows = allSwitches();\n    const byKey = {};\n    rows.forEach(function (r) { byKey[r.key] = r; });" },
  // ⑦ 折叠模块侧的两个新口
  foldSnapFn: { rel: FOLD, txt: "  function snapshot(body) {" },
  foldRestoreFn: { rel: FOLD, txt: "  function restore(body, snap, opt) {" }
};
const EXPORTS = ['snapshot', 'restore'];
function envWith(ov) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh(ov ? { srcOverride: ov } : {});
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  env.WA.ui.open();
  return env;
}
/** 切到工具页并取回 body（折叠状态由调用方先设好）。 */
function toolsBody(env) {
  const panelEl = env.dom.getElementById('wa-panel');
  const tab = panelEl.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'tools'; })[0];
  if (tab) tab.click();
  return panelEl.querySelector('.wa-body');
}
function ctrls(b) { return b ? b.querySelectorAll('button,input,select,textarea').length : -1; }
/** 把 7 个专家段的读数换成计数桩；返回 {counters, restore}。 */
function spy(WA) {
  // ⚠ 探针**必须包含常驻段**（checkpoints / 存档槽那一段不在折叠表里）：
  //   B2b 要证的正是「不在折叠表里的段照样读」—— 漏了它，那条判据读到的是 undefined。
  const names = ['worldSeed', 'worldBlueprint', 'capacityAudit', 'perfBaseline', 'depCheck', 'rulePack', 'worldLab', 'checkpoints'];
  const counters = {};
  const keep = {};
  // v2.275.0：**按消费方分开记账**。同一个引擎在一次渲染里被读两次是正常的 ——
  //   一次是它自己那一段拼模板，一次是 capability 段（v2.257.0）的 view() 全量快照
  //   （「此刻在跑几台」必须扫过全部引擎）。两件事都是「各读一次」，不是重复读。
  //   把它们混进一个计数器，判据就只能写「恰 1 次」，而那在 14 段时代**必然读错** ——
  //   读出来的 2 会被当成缺陷：改产品改不动，改判据就会放宽阈值把纪律改坏。
  //   故按调用栈归属：栈里出现 capability-tier.js ⇒ 记进 __scan，否则记进 __self。
  names.forEach(function (k) {
    counters[k] = 0;
    counters[k + '__self'] = 0;
    counters[k + '__scan'] = 0;
    const m = WA[k];
    if (!m || typeof m.getSettings !== 'function') return;
    keep[k] = m.getSettings;
    m.getSettings = function () {
      counters[k]++;
      var scan = false;
      try { scan = String(new Error().stack || '').indexOf('capability-tier.js') >= 0; } catch (e) {}
      if (scan) counters[k + '__scan']++; else counters[k + '__self']++;
      return keep[k].apply(this, arguments);
    };
  });
  counters.worldLabKinds = 0;
  let keepKinds = null;
  if (WA.worldLab && typeof WA.worldLab.kinds === 'function') {
    keepKinds = WA.worldLab.kinds;
    WA.worldLab.kinds = function () { counters.worldLabKinds++; return keepKinds.apply(this, arguments); };
  }
  return { counters: counters, restore: function () {
    names.forEach(function (k) { if (keep[k] && WA[k]) WA[k].getSettings = keep[k]; });
    if (keepKinds && WA.worldLab) WA.worldLab.kinds = keepKinds;
  } };
}
async function runAll(a, ov) {
  ov = ov || {};
  /* ============ A 静态契约 ============ */
  a(fs.existsSync(path.join(BASE, FOLD)) && fs.existsSync(path.join(BASE, PANEL)), 'A1: 两个模块都落到仓库里');
  (function () {
    const P = rd(PANEL, ov);
    a(cnt(P, 'const lazy = function (fn)') === 1,
      'A2: 惰性取值器只有一个实现（实 ' + cnt(P, 'const lazy = function (fn)') + ' 处 —— 散落就又是「同一件事两种写法」）');
    a(cnt(P, 'const html = function () { return (typeof body === \'function\') ? body() : body; };') === 1,
      'A2b: 段体惰性求值只有一个实现');
    // 段数不写死：静态面自己数一遍，运行面另有权威（WA.panelFold.SECTIONS.length）。
    //   v2.231.0 当初写的是 13；v2.257.0 折叠表加了第 14 段（capability），
    //   这份锁于是在 6 个判据上一起读错基数 —— 那不是产品坏了，是**判据拿字面量当基数**。
    const callRe = /\$\{foldSec\('tools', '[a-z]+', [^\n`]*, \(\) => `/g;
    const calls = (P.match(callRe) || []).length;
    a(calls > 0, 'A2c: foldSec 段体都传函数形态（模板字面量作为**参数**在调用前就求值完了；实 ' + calls + ' 段）');
    // 静态调用点 ⇄ 折叠表条数必须相等（两处指同一张表，任一处漂移都会被这条抓）
    const tableRows = cnt(rd(FOLD), "{ page: 'tools', id: '");
    a(calls === tableRows, 'A2d: 段体惰性形态的调用点与折叠表条数逐一对齐（调用 ' + calls + ' / 表 ' + tableRows + '）');
  })();
  (function () {
    const F = rd(FOLD, ov);
    a(cnt(F, 'function snapshot(body) {') === 1 && cnt(F, 'function restore(body, snap, opt) {') === 1,
      'A3: 折叠模块的抓 / 放各只一个实现');
    a(cnt(F, 'store.transact') === 0 && cnt(F, 'draft.') === 0, 'A3b: 零世界写（位置保留只碰 DOM）');
    a(F.indexOf('snapshot: snapshot, restore: restore,') > 0, 'A3c: 两个新口在导出面上');
  })();
  (function () {
    const P = rd(PANEL, ov);
    a(cnt(P, 'WA.panelFold.snapshot(') === 1 && cnt(P, 'WA.panelFold.restore(') === 1,
      'A4: 面板里抓 / 放各恰 1 处（实 ' + cnt(P, 'WA.panelFold.snapshot(') + '/'
        + cnt(P, 'WA.panelFold.restore(') + '）—— 抓/放不做成 renderBody 的全局默认');
    // 为什么不做成全局默认：那些「数据变了要重绘」的路径本该用新值覆盖输入框
    a(P.indexOf('把保留做成全局默认') > 0, 'A4b: 这条口径写在源码里（改口径必须可见，不靠口头承诺）');
  })();
  (function () {
    const e0 = envWith(ov);
    const miss = EXPORTS.filter(function (k) { return e0.WA.panelFold[k] === undefined; });
    a(miss.length === 0, 'A5: 折叠模块两个新口在运行时可用（缺 ' + (miss.join(',') || '无') + '）');
  })();
  const badA = Object.keys(ANCHOR).filter(function (k) { return cnt(rd(ANCHOR[k].rel, ov), ANCHOR[k].txt) !== 1; });
  a(badA.length === 0, 'A6: 破坏锚点在目标文件里各恰 1 次（不合：' + badA.join(',') + '）');
  (function () {
    const self = rd(SELF_REL, ov);
    const table = self.slice(self.indexOf('const ANCHOR = {'), self.indexOf('\n};', self.indexOf('const ANCHOR = {')));
    const bad = Object.keys(ANCHOR).filter(function (k) { return cnt(table, k + ': {') !== 1; });
    a(bad.length === 0, 'A7: 锚点逐键在锚表里声明恰 1 处（缺 ' + bad.join(',') + '）');
  })();
  (function () {
    // 折叠表与守卫表的一致性由 q8 锁负责（不在此重写）；这里只钉「本版没有动折叠表」
    const F = rd(FOLD, ov);
    // A8 原意：「本版不动折叠表，只改求值时机」。这句话不能靠写死条数表达 ——
    //   写死会让清单每次合理增减都变成红灯（v2.257.0 加第 14 段就是现场）。
    //   改成形态判据：折叠表条数 == 面板里 foldSec 调用条数（两边指同一张表），
    //   并把**实测条数**打进读数 —— 增减时读数自己会变，判据不因升版变红。
    const rowsA8 = cnt(F, "{ page: 'tools', id: '");
    const callsA8 = (rd(PANEL, ov).match(/\$\{foldSec\('tools'/g) || []).length;
    a(rowsA8 === callsA8 && rowsA8 > 0,
      'A8: 折叠表与面板 foldSec 调用同宽（表 ' + rowsA8 + ' / 调用 ' + callsA8
      + '）—— 只改求值时机、不动清单形态');
  })();

  /* ============ B 运行时：惰性求值 ============ */
  // B1 先确认现场基线：收起态真的更轻（控件数与 HTML 长度）
  (function () {
    const env = envWith(ov), W = env.WA;
    W.panelFold.expandAll('tools');
    let b = toolsBody(env);
    const cExp = ctrls(b), hExp = b.innerHTML.length, fExp = b.querySelectorAll('[data-foldb]').length;
    W.panelFold.collapseAll('tools');
    b = toolsBody(env);
    const cCol = ctrls(b), hCol = b.innerHTML.length, fCol = b.querySelectorAll('[data-foldb]').length;
    const SECTN = W.panelFold.SECTIONS.length;      // 运行期权威：折叠表装载后的条数
    a(cCol < cExp && hCol < hExp && fCol === 0 && fExp === SECTN,
      'B1: 收起态真更轻（控件 ' + cExp + '→' + cCol + ' / HTML ' + hExp + '→' + hCol
        + ' / 段体 ' + fExp + '→' + fCol + '）—— 「收起」不是 display:none');
    W.panelFold.expandAll('tools');
  })();
  // B2 **本项的核心**：收起态下专家段的读数一次都不执行
  (function () {
    const env = envWith(ov), W = env.WA;
    W.panelFold.collapseAll('tools');
    const s = spy(W);
    toolsBody(env);
    const got = s.counters;
    //   ⚠ `checkpoints` 是**常驻段**（存档槽那一段不在折叠表里），它照读是**正确的** ——
    //     故「不该读」的集合 = 折叠表里那 7 段（常驻段单列，由 B2b 咬）。
    const FOLDED = ['worldSeed', 'worldBlueprint', 'capacityAudit', 'perfBaseline', 'depCheck', 'rulePack', 'worldLab', 'worldLabKinds'];
    const dirty = FOLDED.filter(function (k) { return got[k] !== 0; });
    a(dirty.length === 0,
      'B2: 收起态下 7 个专家段的读数**一次都不执行**（不合：'
        + dirty.map(function (k) { return k + '=' + got[k]; }).join(',') + '）—— 这才是「按展开计算」');
    // checkpoints 不在折叠表里 ⇒ 常驻读，**必须**照读（否则就是「看运气」的量）
    a(got.checkpoints === 1,
      'B2b: 不在折叠表里的段（存档槽）照样读（实 ' + got.checkpoints + ' 次）—— 惰性只包折叠表里的段');
    s.restore();
    W.panelFold.expandAll('tools');
  })();
  // B3 展开态：读数各 1 次（不是 0，也不是 2）
  (function () {
    const env = envWith(ov), W = env.WA;
    W.panelFold.expandAll('tools');
    const s = spy(W);
    toolsBody(env);
    const got = s.counters;
    const SPY_KEYS = ['worldSeed', 'worldBlueprint', 'capacityAudit', 'perfBaseline', 'depCheck',
      'rulePack', 'worldLab', 'checkpoints'];
    const bad = SPY_KEYS.filter(function (k) {
      return got[k + '__self'] !== 1 || got[k + '__scan'] !== 1;
    });
    a(bad.length === 0,
      'B3: 展开态下每个专家段读数**每个消费方各恰 1 次**（不合：'
        + bad.map(function (k) { return k + '[自身' + got[k + '__self'] + '/扫描' + got[k + '__scan'] + ']'; }).join(',') + '）'
        + '—— 惰性不是「少读」，是「该读时读一次」；两个消费方各读一次不算重复读');
    s.restore();
  })();
  // B3b 同一次渲染里多处引用同一读数 ⇒ 仍只读一次（memo）
  (function () {
    const env = envWith(ov), W = env.WA;
    W.panelFold.expandAll('tools');
    const s = spy(W);
    toolsBody(env); toolsBody(env); toolsBody(env);
    const got = s.counters;
    a(got.worldSeed__self === 3 && got.worldSeed__scan === 3 && got.worldLabKinds === 3,
      'B3b: 三次重绘 ⇒ 每渲染一次各读一次（自身 ' + got.worldSeed__self + ' / 扫描 '
        + got.worldSeed__scan + ' / kinds ' + got.worldLabKinds + '，各应为 3）');
    s.restore();
  })();
  // B4 真缺陷修复：kinds 一次渲染只调一次（此前一次判真、一次取值）
  (function () {
    const env = envWith(ov), W = env.WA;
    W.panelFold.expandAll('tools');
    const s = spy(W);
    toolsBody(env);
    a(s.counters.worldLabKinds === 1,
      'B4: `worldLab.kinds()` 一次渲染恰调 1 次（实 ' + s.counters.worldLabKinds
        + '）—— 此前写成 `(… && kinds()) ? kinds() : null`，按次计费两次');
    s.restore();
  })();
  // B4b 展开态段体照拼（惰性只推迟时机，不改内容）
  (function () {
    const env = envWith(ov), W = env.WA;
    W.panelFold.expandAll('tools');
    const b = toolsBody(env);
    const nB4b = b.querySelectorAll('[data-foldb]').length, tB4b = b.querySelectorAll('[data-foldt]').length;
    a(nB4b === W.panelFold.SECTIONS.length && tB4b === W.panelFold.SECTIONS.length,
      'B4b: 展开态段体与钮都在（' + nB4b + '/' + tB4b + '，表 ' + W.panelFold.SECTIONS.length
      + '）—— 惰性没有把段体吃掉');
    a(cnt(b.innerHTML, '启用世界种子库') >= 1 && cnt(b.innerHTML, '启用世界实验室') >= 1,
      'B4c: 展开态的段体内容真的渲染出来了（不是空壳）');
  })();

  /* ============ C 面板面：保留位置 ============ */
  // C1 折叠一个段 ⇒ 同页别的输入不丢
  (function () {
    const env = envWith(ov), W = env.WA;
    W.panelFold.expandAll('tools');
    let b = toolsBody(env);
    const probe = b.querySelector('#wa-ws-name');
    a(!!probe, 'C1: 探针控件在位（种子名输入框）');
    if (!probe) return;
    probe.value = '填了一半的种子名';
    const btn = b.querySelectorAll('[data-foldt]').filter(function (x) {
      return x.getAttribute('data-foldt') === 'tools:traces';
    })[0];
    a(!!btn, 'C1b: 折叠钮在位（折的是 traces，与探针同页）');
    if (btn) btn.click();
    const after = env.dom.getElementById('wa-panel').querySelector('.wa-body').querySelector('#wa-ws-name');
    a(!!after && after.value === '填了一半的种子名',
      'C1c: 折叠之后同页输入仍在（实「' + (after ? after.value : '(控件不在)') + '」）—— 计划原文的「保留」条款');
    // 反向：折叠那个段本身确实生效了
    a(W.panelFold.isCollapsed('tools', 'traces').collapsed === true,
      'C1d: 被点的那个段确实收起了（保留位置没有把折叠本身吃掉）');
    W.panelFold.expandAll('tools');
  })();
  // C2 checkbox 的勾选态一并保留
  (function () {
    const env = envWith(ov), W = env.WA;
    W.panelFold.expandAll('tools');
    let b = toolsBody(env);
    const box = b.querySelector('#wa-ws-enabled');
    a(!!box, 'C2: 探针复选框在位');
    if (!box) return;
    box.checked = true;
    const btn = b.querySelectorAll('[data-foldt]').filter(function (x) {
      return x.getAttribute('data-foldt') === 'tools:traces';
    })[0];
    if (btn) btn.click();
    const after = env.dom.getElementById('wa-panel').querySelector('.wa-body').querySelector('#wa-ws-enabled');
    a(!!after && after.checked === true, 'C2b: checkbox 的勾选态也保留（实 ' + (after ? after.checked : '?') + '）');
    W.panelFold.expandAll('tools');
  })();
  // C3 抓 / 放各自的读数（面板模块侧的记账）
  (function () {
    const env = envWith(ov), W = env.WA;
    const before = W.panelFold.stat();
    const b = toolsBody(env);
    const snap = W.panelFold.snapshot(b);
    a(snap.ok === true && snap.count > 0 && typeof snap.scroll !== 'undefined',
      'C3: snapshot 抓到了控件与滚动位（实 ' + snap.count + ' 格 / scroll=' + JSON.stringify(snap.scroll) + '）');
    const r = W.panelFold.restore(b, snap, {});
    a(r.ok === true && r.restored === snap.count && r.missed === 0,
      'C3b: 对同一份 body 放回 ⇒ 全部命中（实 ' + r.restored + '/' + snap.count + '）');
    const st = W.panelFold.stat();
    a(st.snapshots === before.snapshots + 1 && st.restored >= before.restored + snap.count,
      'C3c: 抓/放进台账（snapshots ' + before.snapshots + '→' + st.snapshots + '）');
  })();
  // C4 对不上的控件**如实报 miss**（不假装填上了）
  (function () {
    const env = envWith(ov), W = env.WA;
    W.panelFold.expandAll('tools');
    const b = toolsBody(env);
    const snap = W.panelFold.snapshot(b);
    snap.fields = snap.fields.concat([{ idx: 99999, id: 'wa-does-not-exist', value: 'x', boxed: false }]);
    const r = W.panelFold.restore(b, snap, {});
    a(r.ok === true && r.missed >= 1,
      'C4: 对不上的控件如实记 miss（实 ' + r.missed + '）—— 不假装填上了');
  })();
  // C5 空 / 坏输入如实拒收
  (function () {
    const env = envWith(ov), W = env.WA;
    const b = toolsBody(env);
    a(W.panelFold.snapshot(null).ok === false, 'C5: snapshot(null) 如实拒收（不造一份空档冒充）');
    a(W.panelFold.restore(b, null, {}).reason === 'no-snapshot', 'C5b: restore 无档 ⇒ no-snapshot');
    a(W.panelFold.restore(null, W.panelFold.snapshot(b), {}).reason === 'no-body', 'C5c: restore 无 body ⇒ no-body');
  })();
  // C6 位置保留**零世界写**（它是呈现层的事）
  (function () {
    const env = envWith(ov), W = env.WA;
    W.panelFold.expandAll('tools');
    const b = toolsBody(env);
    const before = JSON.stringify(W.store.get());
    const snap = W.panelFold.snapshot(b);
    W.panelFold.restore(b, snap, {});
    a(JSON.stringify(W.store.get()) === before, 'C6: 抓/放全程世界状态逐字一致（零世界写）');
  })();

  /* ============ D 契约与边界 ============ */
  (function () {
    const self = rd(SELF_REL, ov);
    const reqs = (self.match(/require\(['"]([^'"]+)['"]\)/g) || []).filter(function (x) { return x.indexOf('./') < 0 && x.indexOf('../') < 0; });
    a(reqs.length === 2, 'D1: 本锁只 require Node 内置（fs/path），零第三方（实 ' + reqs.length + '）');
  })();
  (function () {
    // 两个新口不进 FROZEN2800：那是**无头环境不收 UI 层**的口径（panelFold 在 OPTIONAL 名单里）
    const run = rd('tests/run.js', ov);
    const m = run.match(/const FROZEN2800 = '([^']*)'/);
    const frozen = m ? m[1] : '';
    a(frozen.indexOf('panelFold') < 0,
      'D1b: panelFold 不进 FROZEN2800（UI 层在无头环境不装载，冻结串口径与之一致）');
    a(/const UI_NS2800 = \[[^\]]*'panelFold'/.test(run),
      'D1c: panelFold 在 run.js 的 UI_NS2800 名单里（与 export-contract 的 OPTIONAL 成对）');
  })();
  (function () {
    // 如实边界：无头环境测不到真机 p95，本锁只报同机同环境的差值
    const env = envWith(ov), W = env.WA;
    W.panelFold.expandAll('tools');
    toolsBody(env); toolsBody(env);   // 预热
    let t0 = process.hrtime.bigint();
    for (let i = 0; i < 10; i++) toolsBody(env);
    let t1 = process.hrtime.bigint();
    const msExp = Number(t1 - t0) / 1e6 / 10;
    W.panelFold.collapseAll('tools');
    toolsBody(env); toolsBody(env);
    t0 = process.hrtime.bigint();
    for (let i = 0; i < 10; i++) toolsBody(env);
    t1 = process.hrtime.bigint();
    const msCol = Number(t1 - t0) / 1e6 / 10;
    a(msCol < msExp,
      'D2: 收起态渲染更快（同机同环境：展开 ' + msExp.toFixed(2) + ' ms / 收起 ' + msCol.toFixed(2) + ' ms）'
        + ' —— 如实边界：这是无头环境同机差值，**不是**真机 p95（真机采样由 O3 性能基线面留空并列出必测项）');
    W.panelFold.expandAll('tools');
  })();

  console.log('\n\u25a0 N 负控制：真源码破坏 → 装载破坏副本 → 重跑同款判据');
  await runNegative(a, ov);
}

function brk(src, txt, repl) {
  const n = cnt(src, txt);
  if (n !== 1) throw new Error('anchor hits=' + n);
  return src.replace(txt, repl);
}
async function runNegative(a, ov) {
  ov = ov || {};
  const S = rd(PANEL, ov);
  const F = rd(FOLD, ov);
  (function () {
    const self = rd(SELF_REL);
    //   ⚠ 搜的是**转义形态**：本文件是 JS 源码，含引号的锚点在这里存的是 `\"`。
    //     拿内存里的真串去搜源码，恒为 0 ⇒ 那条判据对含引号的锚点永远假红
    //     （首跑实测：foldExpand 恒 0）。对不含引号的锚点，两种形态等价。
    const esc = function (t) { return t.replace(/\n/g, '\\n').replace(/"/g, '\\"'); };
    const bad = Object.keys(ANCHOR).filter(function (k) { return cnt(self, esc(ANCHOR[k].txt)) !== 1; });
    a(bad.length === 0, 'N0: 锚点字面量在本文件恰 1 次（不合 ' + bad.join(',') + '）');
  })();
  // N1 破坏：段体不再惰性（把函数形态拆掉，直接拼接）⇒ 收起态读数又被执行
  (function () {
    //   ⚠ 破坏要打在**语义**上：原版那一行是惰性闭包，把它整句替换成「入口处先求值、
    //     闭包只回缓存值」—— 这才是「提前求值」的真形态（替换串不重抄锚点原文：
    //     锚点字面量在本文件必须恰 1 次，重抄会让 N0 的纯度判据误报）。
    const S1 = brk(S, ANCHOR.foldLazy.txt,
      '    const __pre = (typeof body === \'function\') ? body() : body;\n'
      + '    const html = function () { return __pre; };');
    const ov1 = {}; ov1[PANEL] = S1;
    const env = envWith(ov1), W = env.WA;
    W.panelFold.collapseAll('tools');
    const s = spy(W);
    toolsBody(env);
    const got = s.counters;
    s.restore();
    a(got.worldSeed >= 1,
      'N1: 破坏版上收起态照读（实 worldSeed=' + got.worldSeed + '）⇒ 「按展开计算」当场失效；'
        + '原版为 0（B2）⇒ 两向自证');
    W.panelFold.expandAll('tools');
  })();
  // N1b 反面对照：同一破坏副本上**展开态**仍照读（证明 N1 的红只来自「收起态也读」）
  (function () {
    //   ⚠ 同 N1：破坏要打在「提前求值」上 —— 让 `lazy(fn)` 在**定义时**就执行 fn。
    //     原版是「按需一次」，本破坏是「定义即执行」，正是收起态照读的成因。
    const S1 = brk(S, ANCHOR.panelLazy.txt,
      '    const lazy = function (fn) { const v = fn(); return function () { return v; }; };');
    const ov1 = {}; ov1[PANEL] = S1;
    const env = envWith(ov1), W = env.WA;
    W.panelFold.collapseAll('tools');
    const s = spy(W);
    toolsBody(env);
    const got = s.counters;
    s.restore();
    a(got.worldSeed >= 1,
      'N1b: 破坏「按需取值一次」的 memo（改成每次调用都执行）⇒ 收起态也读（实 ' + got.worldSeed
        + '）—— 证明 B2 的红来自「读数被提前执行」，不是判据恒真');
    W.panelFold.expandAll('tools');
  })();
  // N2 破坏：收起态照样拼接段体（假折叠）⇒ 控件数不变、段体在 DOM
  (function () {
    const S2 = brk(S, ANCHOR.foldExpand.txt,
      "    return btn + '<div class=\"wa-fold-b\" data-foldb=\"' + esc(key) + '\">' + html() + '</div>';");
    const ov2 = {}; ov2[PANEL] = S2;
    const env = envWith(ov2), W = env.WA;
    W.panelFold.expandAll('tools');
    let b = toolsBody(env);
    const cExp = ctrls(b);
    W.panelFold.collapseAll('tools');
    b = toolsBody(env);
    a(ctrls(b) === cExp && b.querySelectorAll('[data-foldb]').length === W.panelFold.SECTIONS.length,
      'N2: 破坏版上收起态控件数**没变**（' + cExp + '→' + ctrls(b) + '）、段体照样在 DOM（实 '
        + b.querySelectorAll('[data-foldb]').length + ' 个）—— 假折叠真的会被抓；原版必变少（B1）⇒ 两向自证');
    W.panelFold.expandAll('tools');
  })();
  // N3 破坏：面板不再保留位置（抓/放摘掉）⇒ 折叠把同页输入冲掉
  (function () {
    const S3 = brk(S, ANCHOR.panelRestore.txt, "          void __foldSnap;");
    const ov3 = {}; ov3[PANEL] = S3;
    const env = envWith(ov3), W = env.WA;
    W.panelFold.expandAll('tools');
    const b = toolsBody(env);
    const probe = b.querySelector('#wa-ws-name');
    if (!probe) { a(false, 'N3: 探针控件不在场'); return; }
    probe.value = '填了一半';
    const btn = b.querySelectorAll('[data-foldt]').filter(function (x) {
      return x.getAttribute('data-foldt') === 'tools:traces';
    })[0];
    if (btn) btn.click();
    const after = env.dom.getElementById('wa-panel').querySelector('.wa-body').querySelector('#wa-ws-name');
    a(!!after && after.value === '',
      'N3: 破坏版上折叠把同页输入冲掉了（实「' + (after ? after.value : '(不在)') + '」）—— 原版保留（C1c）⇒ 两向自证');
    W.panelFold.expandAll('tools');
  })();
  // N4 破坏：折叠模块的放回不再如实报 miss（把对不上的也当成填上了）⇒ 读数谎报
  (function () {
    //   ⚠ 替换串不重抄锚点原文（同 N0 的纯度口径）。
    //   ⚠ 替换串**不得包含锚点原文**（哪怕带转义换行也算一次出现 ⇒ N0 的纯度判据会数到 2）。
    //     故这里用字符串拼接把签名拼出来。
    const F1 = brk(F, ANCHOR.foldRestoreFn.txt,
      '  function ' + 'restore(body, snap, opt) {\n'
      + '    if (!snap || snap.ok !== true) return { ok: false, reason: \'no-snapshot\', restored: 0, missed: 0 };\n'
      + '    return { ok: true, restored: (snap.fields || []).length, missed: 0 };');
    const ov4 = {}; ov4[FOLD] = F1;
    const env = envWith(ov4), W = env.WA;
    const b = toolsBody(env);
    const snap = W.panelFold.snapshot(b);
    snap.fields = snap.fields.concat([{ idx: 99999, id: 'wa-does-not-exist', value: 'x', boxed: false }]);
    const r = W.panelFold.restore(b, snap, {});
    a(r.missed === 0 && r.restored === snap.fields.length,
      'N4: 破坏版上对不上的控件被算成「填上了」（missed=' + r.missed + '）⇒ 读数谎报；原版如实记 miss（C4）⇒ 两向自证');
  })();
  // N5 破坏：kinds 又被调两次（回到旧写法）⇒ B4 的判据现形
  (function () {
    //   ⚠ 替换串不重抄锚点原文（同 N0 的纯度口径）：锚点那句保留、只**追加**一次多余调用。
    const S5 = brk(S, ANCHOR.panelKinds.txt,
      ANCHOR.panelKinds.txt + "\n      if (!WA.worldLab.kinds()) return null;");
    const ov5 = {}; ov5[PANEL] = S5;
    const env = envWith(ov5), W = env.WA;
    W.panelFold.expandAll('tools');
    const s = spy(W);
    toolsBody(env);
    a(s.counters.worldLabKinds === 2,
      'N5: 破坏版上 `kinds()` 又被调两次（实 ' + s.counters.worldLabKinds
        + '）⇒ 按次计费的旧写法会被抓；原版恰 1 次（B4）⇒ 两向自证');
    s.restore();
  })();
  // N9 破坏（v2.275.0）：view() 退回「每处各自 shapeOf()」⇒ 同一引擎在一次渲染里被读多次。
  //   这是 v2.257.0 ~ v2.274.0 的真实形态（现场实测 worldSeed 被读 3 次、checkpoints 4 次），
  //   修法在 view() 里立「一次快照」。破坏只改**取数路径**（快照 → 逐次回源），不动语义。
  (function () {
    const C = rd(CAPTIER, ov);
    const S9 = brk(C, ANCHOR.capTierSnap.txt,
      '    const rows = allSwitches();\n'
      + '    const byKey = {};\n'
      + '    const __unused9 = rows.length;');
    const S9b = brk(S9, '      const s = byKey[k];\n      return s ? s : null;',
      '      return shapeOf(k);            // 破坏：每问一次回源读一次');
    const ov9 = {}; ov9[CAPTIER] = S9b;
    const env = envWith(ov9), W = env.WA;
    W.panelFold.expandAll('tools');
    const s = spy(W);
    toolsBody(env);
    const got = s.counters;
    a(got.checkpoints__scan > 1 || got.worldSeed__scan > 1,
      'N9: 破坏「一次快照」⇒ 扫描面对同一引擎读多次（实 checkpoints='
        + got.checkpoints__scan + ' / worldSeed=' + got.worldSeed__scan
        + '）⇒ B3 的扫描格会现形；原版各恰 1 次 ⇒ 两向自证');
    s.restore();
  })();
  // N6 破坏：抓/放散落到 renderBody（做成全局默认）⇒ A4 的「恰 1 处」判据现形
  (function () {
    const S6 = S.split('WA.panelFold.snapshot(').join('WA.panelFold2.snapshot(');
    a(cnt(S6, 'WA.panelFold.snapshot(') === 0 && cnt(S, 'WA.panelFold.snapshot(') === 1,
      'N6: 把面板里唯一那处抓档换掉 ⇒ A4 的「恰 1 处」判据现形（实 '
        + cnt(S6, 'WA.panelFold.snapshot(') + ' 处，原版 ' + cnt(S, 'WA.panelFold.snapshot(') + ' 处）');
  })();
  // N7 工具两向自证
  let threw = false;
  try { brk(S, 'THIS-DOES-NOT-EXIST-OPT9', 'x'); } catch (e) { threw = e.message === 'anchor hits=0'; }
  a(threw, 'N7: 锚点不存在必须抛（不静默 0 命中）');
  threw = false;
  try { brk(S, 'if (', 'x'); } catch (e) { threw = /anchor hits=\d+/.test(e.message) && e.message !== 'anchor hits=1'; }
  a(threw, 'N7b: 锚点不唯一必须抛');
  // N8 真源码逐字未变
  a(rd(PANEL) === S && rd(FOLD) === F && rd(CAPTIER) === rd(CAPTIER, ov),
    'N8: 被破坏过的真源码逐字未变（破坏只发生在内存副本上）');
}

module.exports = { runAll: runAll, runNegative: runNegative, ANCHOR: ANCHOR };
if (require.main === module) {
  (async function () {
    let pass = 0, fail = 0;
    const a = function (ok, name, extra) {
      if (ok) { pass++; } else { fail++; console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
    };
    try { await runAll(a); } catch (e) { fail++; console.log('  \u2717 判据失效：' + (e && e.stack)); }
    console.log('\nOPT9-V2231: ' + pass + ' / 失败 ' + fail);
    if (fail) process.exitCode = 1;
  })();
}
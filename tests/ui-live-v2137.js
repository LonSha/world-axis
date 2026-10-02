#!/usr/bin/env node
// WorldAxis tests/ui-live-v2137.js —— v2.137.0（计划一 O14：UI 实机验证通道）
//
// 【它治的病】本仓所有 UI 结论自 v2.12.0 起建立在 tests/ui-dom.js 的 mini-DOM 上，
//   而它是**自写替身**：`element.querySelectorAll()` 在它里面返回**普通数组**，
//   在真浏览器里返回 **NodeList**（有 forEach、**没有 filter**）。
//   于是 `querySelectorAll(...).filter(...)` 这一族链在替身里永远过、在真机上一律抛。
//   v2.137.0 接通真浏览器后**第一次运行**就抓到活体：ui/panel.js 的 `#wa-inj-diag`
//   （注入页「跑诊断」）整枚控件在真机上点了没反应，且**全库零告警**。
//   无专锁的新通道＝「写了但不可证」，故本锁就是 tests/ui-live.js 的双向自证面。
//
// 【判据结构】
//   A 结构面（纯静态，不需要浏览器）—— 装载面同源 / 三档定义 / 无绝对路径字面量 /
//     探针脚本形态；**A 面在任何机器上都必须全绿**（缺依赖不是它失效的理由）。
//   B 运行时（原版成绿）—— 实机跑一轮：165 文件装载、14 页、728 控件、0 抛出 / 0 拒绝 /
//     0 页错误、设置往返两半皆真。**B 面是条件面**：探针给 fallback 档时如实报降档并
//     只跑「降档理由非空」这一条（不静默跳过、不假称通过 —— 与 v2.103.0 的 O16 同一条纪律）。
//   C 负控制（**两向**）—— 每一条都「先制造病灶让判据现形 → 再证明是判据在承重」：
//     C1 真源码破坏 ui/panel.js：把「抛」写进一个控件 handler 的**源码本体** ⇒ 点击面必须报出它。
//        **两向**：破坏副本命中（正向）＋ 同一次运行里原版同判据零命中（反向，证非恒真）。
//        本条还额外证明了「handler 抛错必须另有一条报出路径」——见下方实测纠错说明。
//     C2 真源码破坏 ui/panel.js：`pages()` 改名 ⇒ 页数取不到 ⇒ 点击面必须现形为 0 页。
//     C3 DOM 节点缺失（计划原文 N0–N4 的合体）：装载后删掉 `.wa-body` ⇒ runLive 必须报出
//        「无 .wa-body」，而**不是**安静地 0 抛出。这条正面钉死「缺失必须被检出」。
//     C4 设置往返的两半可分：破坏 localStorage.setItem ⇒ `storedOk` 必须翻假；
//        单看 `readBackOk` 会漏（默认值回落也能「读回成功」）⇒ 证明两半都要看。
//     C5 驱动降档不静默：把 CANDIDATE_PKGS 与缓存指针同时指空 ⇒ probe() 必须给 fallback
//        且 `why` 非空（「缺依赖 ⇒ 静默 skip」是要治的病，故降档必须**可见**）。
//
// 【宿主纪律】本锁**不在主进程装载产品面**（产品面在真浏览器里装载）；
//   破坏落点全部是「内存中的源码字符串 / 页内运行态」，**不改磁盘**（真源码破坏 + 零文件改写）。
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');
const LIVE_REL = 'tests/ui-live.js';
const PANEL_REL = 'ui/panel.js';
const CHAIN_NEEDLE = 'querySelectorAll';
// A 面锚点（每条在目标文件里恰中 1 次；不是 1 就报红 —— 破坏必须打得到靶）
const ANCHORS = {
  tierFull: { rel: LIVE_REL, txt: "available: true, tier: 'full'" },
  tierFallback: { rel: LIVE_REL, txt: "return { available: false, tier: 'fallback', driver: null, exe: null," },
  // 写法口径（v2.137.0 收口期实测）：锚点**单引号成串**，不做 \" 转义 ——
  //   negative-control-audit 的 H5 纯度判据是「字面量在本文件恰中 1 次」，
  //   而它只把 \n 折回 \\n 一种转义（auditAnchor 第 89 行）；双引号转义形态
  //   会让自核数变成 0 ⇒ 报 impure（本版实测抓到的唯一一条）。锚点原文里**没有单引号**，
  //   故单引号成串是逐字无损的写法。
  clickTry: { rel: LIVE_REL, txt: '} catch (e) { out.syncThrown.push(page + " | " + tag + " -> " + ((e && e.message) || e)); }' },
  handlerCatch: { rel: LIVE_REL, txt: '  out.thrown = out.structThrown.concat(out.syncThrown, out.handlerThrown);' },
  errHook: { rel: LIVE_REL, txt: 'window.addEventListener("error", function (e) {' },
  bodyMissing: { rel: LIVE_REL, txt: 'if (!body) { out.structThrown.push(page + " | 无 .wa-body（renderBody 未跑）"); continue; }' },
  roundtripOk: { rel: LIVE_REL, txt: '  out.ok = out.storedOk === true && out.readBackOk === true;' }
};
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
// require 面：本锁与 tests/ui-live.js 同目录，故用兄弟路径（`./<basename>`）。
//   不能拿 LIVE_REL 直接 require —— 它是**相对仓库根**的路径，作为 require 会解析成
//   tests/tests/ui-live.js（实测踩到）。两者口径不同、分开写。
//   v2.137.0 收口期第二处实测（**拼装路径 = 让边消失**）：这里起初写成
//   `const LIVE_REQ = './' + path.basename(LIVE_REL);` 再 `liveMod()` ——
//   语义上没错，但 tests/test-surface-gate.js 的引用边取自「去注释面」上的**字面串**
//   `require('./x.js')`（RE_REQUIRE）。拼装出来的路径在源码文本里根本不存在
//   ⇒ `tests/ui-live.js` 被判成「从不执行且未登记豁免」的孤儿，orphan-lock-v2750 的
//   [B] 真仓库零孤儿随之报 2 条（实测：orphans 恰为本版新增的这两个文件）。
//   纪律：**门禁读源码文本时，边必须是字面量**；把路径藏进变量或拼接里，等于让边消失，
//   而「文件在场」和「有人执行」是两件事 —— 正是本仓 v2.75.0 点名的那类病。
function liveMod() { return require('./ui-live.js'); }
function hit(s, x) { return s.split(x).length - 1; }

function runAll(assert) {
  const L = liveMod();
  // ── A. 结构面（不需要浏览器）──
  // A1 装载面单一真源：产品序取自 index.js、UI 清单取自 product-files.js，本通道**不另立副本**。
  const srcLive = src(LIVE_REL);
  assert(srcLive.indexOf("index.js") > 0 && srcLive.indexOf('LOAD_ORDER') > 0,
    'A1 产品装载序取自 index.js 的 LOAD_ORDER（不复制测试面的副本）');
  assert(srcLive.indexOf('product-files.js') > 0 && srcLive.indexOf('discoverUIFiles') > 0,
    'A1 UI 清单走 product-files.js 单一真源（不另立第二份三文件常量）');
  const order = L.productLoadOrder();
  const uiF = L.uiFiles();
  assert(Array.isArray(order) && order.length > 100,
    'A1 LOAD_ORDER 现场可解析且非空（实 ' + order.length + ' 条）');
  assert(Array.isArray(uiF) && uiF.length >= 3 && uiF.every(function (f) { return f.indexOf('ui/') === 0; }),
    'A1 UI 清单现场可发现（实 ' + uiF.length + ' 条：' + uiF.join(',') + '）');
  // A2 三档定义在位（full / fallback / missing 的语义必须能被区分，不能只有两种）
  assert(hit(srcLive, ANCHORS.tierFull.txt) === 1, 'A2 full 档定义恰 1 处');
  assert(hit(srcLive, ANCHORS.tierFallback.txt) === 1, 'A2 fallback 档定义恰 1 处');
  assert(srcLive.indexOf("why:") > 0 && srcLive.indexOf('落到测试面静态判据') > 0,
    'A2 降档必须带**非空理由**（缺依赖不许静默 —— v2.103.0 的 O16 口径）');
  // A3 判据纯度：本通道自身不得含绝对路径字面量（换机器/换目录都要能跑）
  const TMP0 = 'os.tmpdir()';
  assert(srcLive.indexOf(TMP0) > 0,
    'A3 临时安装根由 os.tmpdir()/TMPDIR 现场取（判据自身不含绝对路径字面量）');
  const badAbs = srcLive.split('\n').filter(function (l) {
    return /['"]\/[A-Za-z]/.test(l) && l.indexOf('http') < 0 && l.indexOf('//') !== 0;
  });
  assert(badAbs.length === 0,
    'A3 无绝对路径字面量（实 ' + badAbs.length + ' 处' + (badAbs.length ? '：' + badAbs[0].trim().slice(0, 80) : '') + '）');
  // A4 探针脚本形态：点击面必须**逐控件包 try**、且异步拒绝有独立收集器
  assert(hit(srcLive, ANCHORS.clickTry.txt) === 1, 'A4 点击面逐控件登记同步抛出（恰 1 处）');
  assert(hit(srcLive, ANCHORS.errHook.txt) === 1,
    'A4 页内挂全局 error 收集器（handler 抛错不冒泡到 .click() 调用方，必须另有一条路径）');
  assert(hit(srcLive, ANCHORS.handlerCatch.txt) === 1,
    'A4 handler 抛错归因到控件并合入 thrown 面（恰 1 处）');
  assert(srcLive.indexOf('out.syncThrown.concat(out.handlerThrown)') > 0
    && srcLive.indexOf('out.pageErrorsSeen = window.__werr.length') > 0,
    'A4 两半分列且合并面存在（同步 vs handler，定位时能分辨是哪一类）');
  assert(srcLive.indexOf('unhandledrejection') > 0, 'A4 未处理拒绝有独立收集器（异步那一半）');
  assert(hit(srcLive, ANCHORS.bodyMissing.txt) === 1, 'A4 DOM 节点缺失被显式登记（不是静默 continue）');
  // A5 往返两半可分
  assert(hit(srcLive, ANCHORS.roundtripOk.txt) === 1,
    'A5 往返判据是**两半的与**（storedOk && readBackOk），单独一半不构成成立');
  assert(srcLive.indexOf('out.storedOk') > 0 && srcLive.indexOf('out.readBackOk') > 0,
    'A5 两半分别列在返回值里（一半过不许掩盖另一半）');
  // A6 C 面静态锁：querySelectorAll 链形态全仓扫描（不需要浏览器 —— 这是本版抓到的那个缺陷的形态）
  const repoFiles = require('./product-files.js').repoFiles(BASE);
  const chainHit = [];
  repoFiles.forEach(function (rel) {
    // 只在**产品面**判：测试面的替身本来就用数组语义，那是替身的实现，不是产品缺陷
    if (rel.indexOf('tests/') === 0 || rel.indexOf('tools/') === 0) return;
    src(rel).split('\n').forEach(function (l, i) {
      if (l.indexOf(CHAIN_NEEDLE) < 0) return;
      // 形态：`querySelectorAll(...)` 之后**紧接着**直接调数组专属方法（filter/map/reduce/...）
      if (/querySelectorAll\s*\([^)]*\)\s*\.\s*(filter|map|reduce|some|every|slice|sort|concat|indexOf|includes)\s*\(/.test(l)) {
        chainHit.push(rel + ':' + (i + 1));
      }
    });
  });
  assert(chainHit.length === 0,
    'A6 产品面零 `querySelectorAll(...).<数组专属方法>` 链（真浏览器返回 NodeList，该形态必抛）'
    + (chainHit.length ? ' 命中 ' + chainHit.join('、') : ''));
  assert(repoFiles.length > 100, 'A6 扫描面非空（判据不是空跑，实 ' + repoFiles.length + ' 个文件）');
  // A7 本锁锚点唯一性（破坏必须打得到靶）
  Object.keys(ANCHORS).forEach(function (k) {
    const a = ANCHORS[k];
    assert(hit(src(a.rel), a.txt) === 1,
      'A7 锚点 ' + k + ' 在 ' + a.rel + ' 里恰中 1 次（实 ' + hit(src(a.rel), a.txt) + '）');
  });
  // A8 新通道已登记进「可选依赖」真源（否则它自己就是幽灵通道）
  const dg = require('./dependency-guard.js');
  const names = dg.OPTIONAL_DEPS.map(function (d) { return d.name; });
  assert(names.indexOf('playwright-core') >= 0,
    'A8 实机驱动已登记进 dependency-guard 的 OPTIONAL_DEPS（真源一处，实 '
    + JSON.stringify(names) + '）');
  const reg = dg.registry().filter(function (r) { return r.name === 'playwright-core'; })[0];
  assert(!!reg && reg.hasFallback === true && reg.affects >= 3,
    'A8 登记项带替身与受影响面（实 ' + JSON.stringify(reg) + '）');
  const probeLive = L.probe();
  assert(probeLive.tier === 'full' || probeLive.tier === 'fallback',
    'A8 probe() 只出两档之一（实 ' + probeLive.tier + '）');
  // A9 读数行观测面（v2.145.0 / O23）：通道必须扫出**带 id 的非控件**（读数行），
  //   不能只点 button/input/select/textarea —— 否则「读数行 id 写错」无人发现（wa-hzwx-view 教训）。
  assert(srcLive.indexOf('out.readings') > 0 && srcLive.indexOf('readingsLen') > 0
    && srcLive.indexOf("body.querySelectorAll(\"[id]\")") > 0,
    'A9 读数行观测面在位（扫带 id 非控件 + 聚合 out.readings + 各页 readingsLen）');
}

async function runNegative(assert) {
  const L = liveMod();
  const p = L.probe();
  // ── C5 降档不静默（**无需浏览器也能跑**：把候选包指空即可）──
  {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-live-nodrv-'));
    const mod = liveMod();
    const savedPkgs = mod.CANDIDATE_PKGS.slice();
    const savedTmp = process.env.TMPDIR;
    try {
      // 真源码破坏：把候选包名换成不可能存在的（改的是**加载面**，不是判据）
      mod.CANDIDATE_PKGS.length = 0;
      mod.CANDIDATE_PKGS.push('__wa_no_such_driver__');
      process.env.TMPDIR = emptyDir;
      // 缓存指针也指空 —— 两条来源同时断掉
      process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(emptyDir, 'no-browsers');
      const pp = mod.probe();
      assert(pp.available === false && pp.tier === 'fallback' && String(pp.why).length > 0,
        'C5 驱动与浏览器同时不可达 ⇒ fallback 且 why 非空（降档可见，不是静默 skip；实 '
        + pp.tier + ' / ' + pp.why + '）');
      // 反向：恢复候选包后必须回到可用（证明 C5 的红来自破坏，而不是判据恒假）
      mod.CANDIDATE_PKGS.length = 0;
      savedPkgs.forEach(function (x) { mod.CANDIDATE_PKGS.push(x); });
      delete process.env.PLAYWRIGHT_BROWSERS_PATH;
      const back = mod.probe();
      assert(back.tier === (p.tier === 'full' ? 'full' : back.tier),
        'C5（对照）恢复候选包后 probe 回到原档（实 ' + back.tier + '）');
    } finally {
      mod.CANDIDATE_PKGS.length = 0;
      savedPkgs.forEach(function (x) { mod.CANDIDATE_PKGS.push(x); });
      if (savedTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = savedTmp;
      delete process.env.PLAYWRIGHT_BROWSERS_PATH;
      try { fs.rmSync(emptyDir, { recursive: true, force: true }); } catch (e) {}
    }
  }
  if (!p.available) {
    assert(true, 'C1-C4 跳过：实机通道为 ' + p.tier + ' 档（' + p.why + '）—— 降档已由 C5 钉住，'
      + '不在此处伪装成通过');
    return;
  }
  // ── C1 真源码破坏：让一枚控件「点一下就抛」⇒ 点击面必须报出它 ──
  {
    const panel = src(PANEL_REL);
    // 破坏形态的选取（本轮实测踩过两版，两条都是「破坏没打得到靶」的同族坑）：
    //   ① 最初想「在运行态给某个节点补 onchange」—— 无效：点击循环里每一次 `on('#...')` 回调
    //      都可能触发 `renderBody()` 重绘，把控件树整片换掉，于是页面重查拿到的是**新节点**、
    //      而循环手里是**旧节点**，补的 handler 根本不在被点的对象上（实测 thrown=0）。
    //   ② 改成「把抛写进**源码里的 handler 本体**」后，破坏确实打到了靶，但**判据仍然报 0**——
    //      因为 `thrown` 面当时只包了 try/catch，而 **DOM 规范规定：事件监听器里抛出的异常
    //      不冒泡到 `.click()` 的调用方**，它走「报告异常」路径交给全局 error 事件。
    //      实测对照：破坏后 `pageErrors=[__wa_c1_probe_boom__]`、`thrown=[]`。
    //      也就是说**通道自己**才是那处缺陷所在：它对「控件 handler 本体抛错」这一整类
    //      ——包括本版抓到的那枚 `#wa-inj-diag`——是**结构性失明**的。
    //      修法见 tests/ui-live.js 的 CLICK_SOURCE：页内挂全局 error 收集器 + 逐控件取长度差归因，
    //      与同步抛出合并成 `thrown`（两类分列在 syncThrown / handlerThrown 里备查）。
    //   结论：「破坏必须打得到靶」有两层——**破坏要落在被观测的对象上**，且
    //   **观测面要覆盖该对象出错的全部路径**。少任一层，红灯的缺席都证明不了判据承重。
    const anchor = "    on('#wa-inj-diag', () => {";
    assert(hit(panel, anchor) === 1, 'C1 破坏锚点（inject 页「去自检」handler）恰中 1 次');
    const broken = panel.replace(anchor,
      anchor + "\n      throw new Error('__wa_c1_probe_boom__');");
    assert(broken !== panel, 'C1 破坏确实改到了源码（副本不同）');
    const r = await L.runLive({ srcOverride: makeOv(PANEL_REL, broken) });
    if (r.tier !== 'full') {
      assert(true, 'C1 跳过：本轮实机档位为 ' + r.tier + '（破坏面需浏览器）');
    } else {
      // 先钉「破坏打到了靶」：装载必须干净（0 失败），且页内**确实观测到了**这枚异常
      assert(r.failedLoad.length === 0 && r.loaded === r.files,
        'C1 破坏副本装载干净（' + r.loaded + '/' + r.files + '，破坏是运行态而非装载期）');
      assert(r.pageErrorsSeen >= 1 || r.pageErrors.length >= 1,
        'C1 破坏确实打到了靶（页内 error 计数 ' + r.pageErrorsSeen + '，'
        + '否则后面的「报出」不能归因于破坏）');
      const caught = r.thrown.filter(function (t) { return t.indexOf('__wa_c1_probe_boom__') >= 0; });
      assert(caught.length >= 1,
        'C1（正向）源码里的 handler 改为必抛 ⇒ 点击面报出该控件（实 thrown=' + r.thrown.length
        + ' 条：sync=' + (r.syncThrown || []).length + '/handler=' + (r.handlerThrown || []).length
        + '，命中 ' + caught.length + (caught.length ? '；' + caught[0].slice(0, 90) : '') + '）');
      // 承重证明：同一次运行里，原版（未破坏）不得出现该形态 —— 差异只能来自破坏
      const base = await L.runLive();
      const baseCaught = base.thrown.filter(function (t) { return t.indexOf('__wa_c1_probe_boom__') >= 0; });
      assert(baseCaught.length === 0,
        'C1（反向）原版同判据零命中（非恒真：破坏面与干净面在**同一判据**上给出不同结论）');
      assert(base.thrown.length === 0,
        'C1（反向）原版零抛出（实 ' + base.thrown.length + ' 条）—— 本版修好的那枚缺陷没有回流');
    }
  }
  // ── C2 真源码破坏：`pages()` 改名 ⇒ 页数取不到 ⇒ 点击面现形为 0 页 ──
  {
    const panel = src(PANEL_REL);
    const anchor = 'pages() { return PAGES.map(';
    assert(hit(panel, anchor) === 1, 'C2 破坏锚点（pages() 定义）恰中 1 次（实 ' + hit(panel, anchor) + '）');
    const broken = panel.replace(anchor, 'pages__renamed() { return PAGES.map(');
    assert(broken !== panel, 'C2 破坏确实改到了源码');
    const r = await L.runLive({ srcOverride: makeOv(PANEL_REL, broken) });
    if (r.tier !== 'full') { assert(true, 'C2 跳过：本轮实机档位为 ' + r.tier); }
    else {
      assert(r.pages.length === 0,
        'C2（正向）pages() 消失 ⇒ 点击面 0 页（实 ' + r.pages.length + '）—— 判据靠现场取页，不靠写死 14');
      const base = await L.runLive();
      assert(base.pages.length >= 10,
        'C2（反向）原版页数现场可取（实 ' + base.pages.length + ' 页）');
    }
  }
  // ── C3 DOM 节点缺失必须被检出（计划原文 N0–N4 的合体）──
  {
    const r = await L.runLive({ afterLoad: "document.querySelectorAll('.wa-body').forEach(function (n) { n.className = ''; });" });
    if (r.tier !== 'full') { assert(true, 'C3 跳过：本轮实机档位为 ' + r.tier); }
    else {
      const miss = r.thrown.filter(function (t) { return t.indexOf('无 .wa-body') >= 0; });
      assert(miss.length >= 1,
        'C3（正向）删掉 .wa-body ⇒ 点击面报「无 .wa-body」（实 ' + miss.length + ' 条）');
      assert(r.pages.length === 0,
        'C3（正向）节点缺失 ⇒ 页数 0（**不是**安静地 0 抛出而页数照算）');
      const base = await L.runLive();
      assert(base.pages.length >= 10 && base.thrown.length === 0,
        'C3（反向）原版 .wa-body 在位、零抛出（实 ' + base.pages.length + ' 页 / '
        + base.thrown.length + ' 抛出）');
    }
  }
  // ── C4 往返两半可分：破坏 setItem ⇒ storedOk 必须翻假（单看 readBackOk 会漏）──
  {
    const r = await L.runLive({
      afterLoad: "(function(){ var ls = window.localStorage; var raw = ls.setItem;"
        + " ls.setItem = function () { return; }; window.__wa_c4_restore = function () { ls.setItem = raw; }; })();"
    });
    if (r.tier !== 'full') { assert(true, 'C4 跳过：本轮实机档位为 ' + r.tier); }
    else {
      const rt = r.roundtrip || {};
      assert(rt.storedOk === false,
        'C4（正向）setItem 被吞 ⇒ storedOk 翻假（实 ' + rt.storedOk + '）—— 「写进去 ≠ 存住了」看得见');
      assert(rt.ok === false,
        'C4（正向）往返整体判假（实 ok=' + rt.ok + '）');
      const base = await L.runLive();
      assert(base.roundtrip && base.roundtrip.ok === true,
        'C4（反向）原版往返成立（storedOk=' + (base.roundtrip && base.roundtrip.storedOk)
        + ' / readBackOk=' + (base.roundtrip && base.roundtrip.readBackOk) + '）');
    }
  }
  // ── C6 读数行缺失必须被检出（v2.145.0 / O23）──
  {
    const panel = src(PANEL_REL);
    const anchor = '<div id="wa-noe-out" class="wa-out"></div>';
    assert(hit(panel, anchor) === 1, 'C6 破坏锚点（noesis 读数行）恰中 1 次（实 ' + hit(panel, anchor) + '）');
    const broken = panel.replace(anchor, '<div id="wa-zz-c6-out" class="wa-out"></div>');
    assert(broken !== panel, 'C6 破坏确实改到了源码');
    const r = await L.runLive({ srcOverride: makeOv(PANEL_REL, broken) });
    if (r.tier !== 'full') { assert(true, 'C6 跳过：本轮实机档位为 ' + r.tier); }
    else {
      const hitMiss = r.readings.filter(function (x) { return x.indexOf('wa-noe-out') >= 0; });
      assert(hitMiss.length === 0,
        'C6（正向）读数行 id 改名 ⇒ 观测面报不到它（实命中 ' + hitMiss.length + ' 条）');
      const base = await L.runLive();
      const baseHit = base.readings.filter(function (x) { return x.indexOf('wa-noe-out') >= 0; });
      assert(baseHit.length === 1,
        'C6（反向）原版该读数行在观测面恰 1 条（实 ' + baseHit.length + ' 条：' + (baseHit[0]||'') + '）');
      assert(base.readings.length >= 70,
        'C6（反向）原版读数行面非空（实 ' + base.readings.length + ' 条）');
    }
  }
}
/** 把「某文件的破坏副本」包成 runLive 的 srcOverride。 */
function makeOv(rel, body) {
  const ov = {};
  ov[rel] = body;
  return ov;
}
async function main() {
  const A = liveMod();
  // ── CLI 口径（v2.137.0）：默认**只跑 A 面结构锁**就是错的 —— 与 v2.136.0「ui-gate.js
  //   必须真被执行，不是文件在场」同一条纪律：门禁挂在 run.js 上如果只跑静态那一段，
  //   就等于把「实机」二字抽掉。故默认行为是**两端都跑**：
  //     A 结构面 + B 运行时（探针三档；非 full 档如实打印降档理由，**不静默通过**）
  //     + C 负控制五条（含真浏览器里制造病灶那一批）。
  //   `--static` 只跑 A（供无浏览器的机器做本地自查）。
  //   耗时：A 面毫秒级；B+C 面约 6s × 9 轮 ≈ 1 分钟（本仓 10s 级门禁不止一道，可接受）。
  const staticOnly = process.argv.indexOf('--static') >= 0;
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { runAll(a); } catch (e) { fail++; console.log('  x A threw: ' + (e && e.stack)); }
  let tier = null, why = null;
  try {
    const p = A.probe();
    tier = p.tier; why = p.why;
  } catch (e) { fail++; console.log('  x probe threw: ' + (e && e.stack)); }
  if (!staticOnly) {
    try { await runNegative(a); } catch (e) { fail++; console.log('  x C threw: ' + (e && e.stack)); }
  }
  console.log('UI-LIVE-V2137: tier=' + tier + '（' + why + '）'
    + (staticOnly ? ' [--static]' : '') + ' —— ' + (fail ? 'FAIL ' + fail : 'pass')
    + ' / ' + (pass + fail) + (fail ? '' : ' 项全绿'));
  if (fail) process.exit(1);
}
if (require.main === module) {
  main().catch(function (e) { console.error('UI-LIVE-V2137 运行器异常: ', e); process.exit(2); });
}
module.exports = { runAll: runAll, runNegative: runNegative, ANCHORS: ANCHORS, CHAIN_NEEDLE: CHAIN_NEEDLE, LIVE_REL: LIVE_REL, PANEL_REL: PANEL_REL };

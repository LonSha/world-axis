// WorldAxis tests/ui-gate.js — UI 渲染路径门禁（零依赖）
// 为什么要单独一条：tests/run.js 的 LOAD 刻意不含 ui/*，而它自带的那个轻量 DOM stub 是**纯壳**
//   （querySelector() 每次返回一个新的游离 div、querySelectorAll() 恒返回 []、firstElementChild
//   靠全局钩子回一个写死 id 的 div）。于是：`body.innerHTML = 渲染结果` 确实执行了，但
//   **解析与查询全部虚化**——十个渲染器里只有概览页被执行且产物当即丢弃，其余九个零执行；
//   buildPanel 的 `.wa-tab` 点击绑定、bindBody 的 `[data-*]` 控件绑定、事件页运行态按钮的
//   条件渲染与点击链路、重绘调度…… 在全部自动化里均无执行覆盖。
// 本门禁用 mini-DOM（tests/ui-dom.js，自包含、无外部依赖）把这段补上：
//   装载顺序按 run.js 的 LOAD 取（不复制、不漂移），然后在**每个用例独立的上下文**里
//   真实装载 ui/panel.js，真实点击、真实查询、真实调用。
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
require('./mock.js');                 // 宿主基础桩（localStorage / SillyTavern / WA.log）
const uiDom = require('./ui-dom.js');
const BASE = path.join(__dirname, '..');
// v2.42.0：UI 装载面改为**动态发现**（原为硬编码三文件清单）。
//   为什么：硬编码清单 = 「新增一个 ui 模块，对两道 ui 门禁**同时隐身**」——
//   ui-wire-audit 的「引用面 → 渲染面」接线审计与本文件的真实点击门禁都不会看它，
//   而它们正是 UI 层唯一的自动化覆盖。这与 v2.40.0 修掉的「页面写死 12」是**同一家族**：
//   把一个会长的集合写成常量，于是集合长大了门禁却不知道。
//   discoverUIFiles 参数化导出：回归可在临时目录上做**行为级**负向自证，
//   证明它真的读文件系统，而不是又一个换了写法的常量。
// v2.43.0：实现**收进 tests/product-files.js**（文件面单一真源），此处改为转出（re-export）。
//   为什么还要动一次：v2.42.0 只把这条链上的两份副本改成动态发现，而**同一份三文件清单
//   在仓库里共有四处**（本文件、ui-wire-audit、tests/run.js 的守卫采集面、tests/inventory.js
//   的装载面）。剩下两处的后果是实测过的：副本注入 ui/zb_extra.js 后，run.js 的守卫采集面
//   恒 198 项、动态面 199 项，那个控件在守卫门禁里**永不可见而门禁全绿**。
//   只修「这一处」是治症状；把定义收成一份、其余全部委托，才是断根。
//   导出名与签名保持不变（discoverUIFiles(dir)），v2.42.0 的回归断言与负向自证无需改动。
const { discoverUIFiles } = require('./product-files.js');
const UI_FILES = discoverUIFiles(path.join(__dirname, '..', 'ui'));

function loadOrder() {
  const src = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
  const li = src.indexOf('const LOAD = [');
  const lj = src.indexOf('];', li);
  if (li < 0 || lj < 0) throw new Error('ui-gate: 无法从 tests/run.js 提取 LOAD 清单');
  return vm.runInNewContext('(' + src.slice(src.indexOf('[', li), lj + 1) + ')');
}

// 装一个「已启动」的 UI 环境：产品模块 + mini-DOM + 启动序列 + 面板/设置/助手三件套
function fresh(opts) {
  opts = opts || {};
  const LOAD = loadOrder();
  const ctx = vm.createContext(global);
  // v2.14.0: 重装 LOAD **之前**把宿主窗口复位成真宿主。
  //   本函数与 run.js 复用同一个 vm 上下文 / global，故上一用例 install 出来的壳此刻仍挂在
  //   WA.mainWin 上，而产品模块在求值期就会把它缓存进闭包
  //   （`const mainWin = WA.mainWin || window`）——壳缺 localStorage，于是本用例的落盘能力
  //   从出生起就是断的（setItem 抛错被 try/catch 吞成静默失败）。
  //   顺序不能颠倒：先复位 → 再重装产品模块（绑真宿主）→ 最后 install（把 WA.mainWin 换成
  //   mini-DOM 壳，只供随后求值的 ui/* 使用）。
  try { global.WorldAxis.mainWin = global; global.WorldAxis.mainDoc = global.document; } catch (e) {}
  // v2.83.0: 重装 LOAD **之前**清空设置登记表。
  //   本函数重装产品模块，而每个模块的注册都是无条件追加
  //   （`WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG])`）——表只增不减，
  //   实测每次 fresh() 让登记项翻倍（54 → 109 → 163，54 个键各重复 2/3 次）。
  //   两个后果都是真的：① 「重复登记」在 settingsBus.selfCheck() 里是 error 级阻断项，
  //   于是任何在 fresh() 之后跑自洽判据的块都会读到一个人造的红灯；② 以登记表为真源的
  //   判据（如「设置键归属」）会读到累计的脏数据 —— run.js 各块注入的 `module:'test'`
  //   夹具会一路活到别的块、把「键归属对不上真实命名空间」变成非确定性失败。
  //   清空是安全的：产品模块全部无条件 concat，重装即完整重建（实测回到 54 条）。
  try { if (global.WorldAxis) global.WorldAxis.__settingsRegs = []; } catch (e) {}
  // v2.61.0: 产品模块同样支持源码覆盖（与下方 ui/* 的 opts.srcOverride 同一口径）。
  //   用途：让「修复前形态」在**内存副本**上装载并重跑同款判据（真源码破坏，零文件改写）；
  //   默认路径逐字不变——未传 override 时仍直接读盘。
  const __srcOv = opts.srcOverride || {};
  for (const rel of LOAD) {
    const __src = __srcOv[rel] !== undefined ? __srcOv[rel] : fs.readFileSync(path.join(BASE, rel), 'utf8');
    vm.runInContext(__src, ctx, { filename: rel });
  }
  const WA = global.WorldAxis;
  // 前提：代表「有聊天」。run.js 里靠前的块会把 mockCtx.chat 换成空数组/别的形状且不还原，
  //   而本门禁的推演链路需要一条末楼作为锚点——所以不能假设它恰好还在，
  //   显式复位（否则门禁会因“别的块此刻的环境”而不可复现地失败）。
  try {
    const __st = WA.mainWin && WA.mainWin.SillyTavern;
    const __c = __st && __st.getContext && __st.getContext();
    if (__c && (!__c.chat || !__c.chat.length)) __c.chat = [{ is_user: true, mes: 'ui-gate anchor', swipe_id: 0 }];
  } catch (e) {}
  uiDom.install(WA);                    // 必须在 ui/* 求值前：panel.js 求值时缓存 mainDoc/mainWin
  try { WA.store.init(); } catch (e) {}
  if (WA.interceptor && WA.interceptor.install) WA.interceptor.install();
  if (WA.injectInspector && WA.injectInspector.init) WA.injectInspector.init();
  const files = opts.files || UI_FILES;
  const srcOverride = opts.srcOverride || {};
  for (const rel of files) {
    const src = srcOverride[rel] !== undefined ? srcOverride[rel] : fs.readFileSync(path.join(BASE, rel), 'utf8');
    vm.runInContext(src, ctx, { filename: rel });
  }
  // 复刻 index.js 启动序列的最后一步（否则面板只装载不挂载，等于没渲染过）
  if (WA.ui && typeof WA.ui.mount === 'function') WA.ui.mount();
  return { ctx: ctx, WA: WA, dom: WA.__uiDoc };
}

// 逐页渲染探针（可被主门禁与负向自证复用）：返回 {tested, failures}
// 覆盖面：点 tab 走 buildPanel 真实绑定 → renderBody → RENDERERS[page]() → innerHTML 真实解析 → bindBody
function checkPages(env, countFn) {
  const WA = env.WA, dom = env.dom;
  const out = { tested: 0, failures: [], details: [] };
  const pages = (WA.ui && typeof WA.ui.pages === 'function') ? WA.ui.pages() : [];
  const panel = dom.getElementById('wa-panel');
  if (!panel) { out.failures.push('面板未注入（无法逐页渲染）'); return out; }
  for (const page of pages) {
    out.tested++;
    const tab = panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
    if (!tab) { out.failures.push('找不到 ' + page + ' 的 tab（buildPanel 未渲染该页入口）'); continue; }
    let err = null;
    try { tab.click(); } catch (e) { err = e; }
    if (err) { out.failures.push(page + ' 页切换抛异常：' + (err && err.message)); continue; }
    if (WA.ui.currentPage() !== page) { out.failures.push(page + ' 页切换后 currentPage 未跟随（实 ' + WA.ui.currentPage() + '）'); continue; }
    const body = panel.querySelector('.wa-body');
    const html = body ? body.innerHTML : '';
    if (!html || !html.trim()) { out.failures.push(page + ' 页渲染产物为空'); continue; }
    // 「渲染出来的控件能在树里被找到」——这是纯壳 stub 永远测不到的一段：
    //   innerHTML 里的 button/input 若因未闭合/空容器而没成树，绑定就是空转。
    const inHtml = countFn(html);
    const inTree = body.querySelectorAll('button,input,select,textarea').length;
    out.details.push(page + ':' + html.length + 'B/' + inTree + '控件');
    if (inHtml > inTree) {
      out.failures.push(page + ' 页有 ' + inHtml + ' 个控件写进 HTML、但树里只找得到 ' + inTree + ' 个（渲染产物未成树，绑定会空转）');
    }
  }
  return out;
}
// v2.21.0: 控件可点击探针（逐页渲染后真实点击每个 button/input/select/textarea）
//   为什么需要它：checkPages 只验证「控件**成树**」（HTML 里的 <button> 在树里找得到），
//   不验证「控件**可点**」。而真实缺陷恰好落在这一层：设置页「立即生成舆情」是 async 出口，
//   它在 `await` **之后**才写 `out().textContent`；而 `out()` 每次都重新查询 —— 其间任意状态
//   事件都会触发面板自动重绘，`#wa-set-out` 从树中消失，重查得 null，写 textContent 抛
//   `TypeError: Cannot set properties of null`（用户视角「点了没反应」，日志里一条与页面无关的
//   DOM 报错）。同类还有面板的观测切片 / 选项目 / 弧线生成 / 助手问答 / 剧场生成 / 快照导入，
//   以及三处裸 `prompt(...)`（宿主无 prompt 时 ReferenceError，而它们是**唯一入口**）。
//   本探针把「点一下会不会抛」变成可复现的门禁。
// 口径：同步抛出在点击循环里直接捕获；`await` 之后的写回失败表现为**未处理的 Promise 拒绝**
//   （它不会阻塞点击循环），故本探针自带进程级 unhandledRejection 收集器，点击完等一拍收网。
//   两者合起来才是完整判据——只测同步会漏掉异步那一半（本轮真缺陷恰在异步那一半）。
async function checkClickable(env, opts) {
  opts = opts || {};
  const settleTicks = opts.settleTicks || 3;
  const WA = env.WA, dom = env.dom;
  const out = { tested: 0, controls: 0, thrown: [], rejections: [] };
  const panel = dom.getElementById('wa-panel');
  if (!panel) { out.thrown.push('面板未注入（无法点击控件）'); return out; }
  const seen = [];
  const onRej = function (r) { seen.push(String((r && r.message) || r).slice(0, 200)); };
  process.on('unhandledRejection', onRej);
  try {
    const pages = (WA.ui && typeof WA.ui.pages === 'function') ? WA.ui.pages() : [];
    for (const page of pages) {
      out.tested++;
      const tab = panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
      if (!tab) continue;
      try { tab.click(); } catch (e) { out.thrown.push(page + ' 页签点击抛出：' + (e && e.message)); continue; }
      const body = panel.querySelector('.wa-body');
      if (!body) continue;
      const ctrls = body.querySelectorAll('button,input,select,textarea');
      for (const c of ctrls) {
        out.controls++;
        const tag = '<' + String(c.tagName || '').toLowerCase() + (c.id ? ' id=' + c.id : '') + '>';
        // 前提补齐：真浏览器里 `<input type=file>` 的 `.files` **恒**为 FileList（未选文件时
        //   是空列表），mini-DOM 不提供该属性。不补这一层的话，快照/导入两处 `files[0]`
        //   读的是 `undefined`，探针会把它记成产品缺陷——那是探针前提失真，不是缺陷
        //   （真实用户不选文件时 `files[0]` 是 undefined，被 `if (!f) return;` 正常短路）。
        try { if (String(c.type || '').toLowerCase() === 'file' && !c.files) c.files = []; } catch (e) {}
        try {
          if (typeof c.click === 'function') c.click();
          if (typeof c.oninput === 'function') c.oninput({ target: c });
          if (typeof c.onchange === 'function') c.onchange({ target: c });
        } catch (e) {
          out.thrown.push(page + ' | ' + tag + ' -> ' + (e && e.message));
        }
      }
    }
    for (let i = 0; i < settleTicks; i++) await new Promise(function (r) { setTimeout(r, 20); });
  } finally {
    process.removeListener('unhandledRejection', onRej);
  }
  out.rejections = seen;
  return out;
}
// v2.22.0: 展示映射漂移探针（第十面）。UI 层另有一类**静态**缺陷，运行期探针抓不到：
//   ui/panel.js 里的枚举→徽章/配色映射、桶→中文标签映射，都是「第二份真源」，与引擎侧
//   枚举/桶集各写一遍。引擎新增一个枚举值或一个失败桶时，UI 侧若不同步，映射就**静默回退**
//   （`|| '⚪'` / `|| k`）——用户看到的是错误的徽章色、或裸露的英文桶名。这类缺陷运行期
//   「不抛不报」，G17/G18 全绿也照不出，只能靠「UI 映射键集 ⊇ 引擎真源键集」的源码级比对。
//   同族先例：tool-analyzer v0.9.6 曾因气候枚举未对齐 evolution.ECONOMY_CLIMATE 自纠。
// 口径：引擎真源从源码提取（枚举常量 / 记账桶声明 ∪ 调用点字面量标签）；UI 键集从映射对象
//   字面量提取（纯文本正则，不用 eval——值里可能有模板串/简写属性）。
//   opts.srcOverride 可替换某文件源码，供负向自证（注入一处漂移，判据必须现形）。
function _wdRead(rel, override) {
  if (override && override[rel] !== undefined) return override[rel];
  return fs.readFileSync(path.join(BASE, rel), 'utf8');
}
function _wdObjAt(src, anchor) {
  const t0 = src.indexOf(anchor);
  if (t0 < 0) throw new Error('drift: anchor not found: ' + anchor);
  const s = anchor.indexOf('{') >= 0 ? src.indexOf('{', t0) : src.lastIndexOf('{', t0);
  if (s < 0) throw new Error('drift: no brace for: ' + anchor);
  let d = 0;
  for (let i = s; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(s, i + 1); }
  }
  throw new Error('drift: unbalanced: ' + anchor);
}
function _wdKeysOf(lit) {
  // v2.26.0: 先剥注释再取键。此前是本函数的一个**静默盲点**——键的匹配要求它紧跟在
  //   `,` 或 `{` 之后，而「逗号 + 若干注释行 + 键」这种写法（本仓 SRC_LABEL 的
  //   `readSpotCheck` 正是如此）会让该键**从键集里消失**：门禁不报「缺键」也不报「幽灵键」，
  //   而是把它当作不存在。于是「给一行键补注释」就能让键悄悄退出判据面。
  //   注释剥离只可能让隐藏的键**重新可见**（不可能凭空造键），与判据方向一致。
  const body = lit.slice(1, -1)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  const keys = [];
  const RE = /(?:^|[,{])\s*(?:'([^']*)'|"([^"]*)"|([A-Za-z_$][\w$]*))\s*:/g;
  let m; while ((m = RE.exec(body))) keys.push(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
  return keys;
}
function _wdArr(txt, name) {
  const m = txt.match(new RegExp(name + ' = (\\[[^\\]]*\\])'));
  if (!m) throw new Error('drift: cannot find ' + name);
  return vm.runInNewContext('(' + m[1] + ')');
}
// 返回 {groups:[{name, missing, ghost, ok}], failures:[...]}
function checkSrcMaps(opts) {
  opts = opts || {};
  const ov = opts.srcOverride || {};
  const panel = _wdRead('ui/panel.js', ov);
  const evo = _wdRead('engines/evolution.js', ov);
  const inj = _wdRead('render/inject.js', ov);
  const sb = _wdRead('core/settings-bus.js', ov);
  const st = _wdRead('core/store.js', ov);

  const groups = [];
  function check(name, uiKeys, engKeys) {
    const missing = engKeys.filter(function (k) { return uiKeys.indexOf(k) < 0; });
    const ghost = uiKeys.filter(function (k) { return engKeys.indexOf(k) < 0; });
    groups.push({ name: name, missing: missing, ghost: ghost, ui: uiKeys.length, eng: engKeys.length, ok: !missing.length && !ghost.length });
  }
  // 枚举映射（引擎常量 ↔ UI 键集）
  check('factionBadge', _wdKeysOf(_wdObjAt(panel, "'鼎盛':'")), _wdArr(evo, 'FACTION_STATUS'));
  check('relBadge', _wdKeysOf(_wdObjAt(panel, "'血盟':'")), _wdArr(evo, 'FACTION_RELATION'));
  check('repColor', _wdKeysOf(_wdObjAt(panel, "'万众敬仰':'")), _wdArr(evo, 'REPUTATION_LEVELS'));
  check('ecoColor', _wdKeysOf(_wdObjAt(panel, "'繁荣':'")), _wdArr(evo, 'ECONOMY_CLIMATE'));
  // v2.51.0（第三十六面）: 锚点从「导演页里内联的那份手写表」改为「模块级单一真源 VIS_NAMES」。
  //   本版把同一张中文名表在 panel.js 里被写了两遍的那份（renderInject 的局部 NAMES +
  //   renderDirector 的内联字面量）提升成了一个 VIS_NAMES 常量——两处引用同一份。
  //   若仍按旧锚点取，_wdObjAt 会抛「anchor not found」把整轮回归打断（已实测），
  //   而判据本身并没有失效：它要的正是「UI 侧这份映射的键集 == render.SOURCES」。
  check('renderDirector', _wdKeysOf(_wdObjAt(panel, "clock: '世界时间'")), _wdArr(inj, 'SOURCES'));
  // 记账桶标签映射（声明桶 ∪ 调用点字面量标签 ↔ UI 键集）
  function declKeys(anchor) { return _wdKeysOf(_wdObjAt(sb, anchor)); }
  function callTags(fn) { const s = []; const RX = new RegExp(fn + "\\(\\s*'([^']+)'", 'g'); let mm; while ((mm = RX.exec(sb))) if (s.indexOf(mm[1]) < 0) s.push(mm[1]); return s; }
  function uni(a, b) { return Array.from(new Set(a.concat(b))).sort(); }
  const WB = uni(declKeys('missingKey: 0, stringify: 0'), callTags('noteFail'));
  const RB = uni(declKeys('guarded: 0, missing: 0'), callTags('noteRemoveFail'));
  const sbTags = uni(declKeys('read: 0, parse: 0, migrate: 0, copy: 0'), callTags('noteReadFail'));
  check('WS_LABEL', _wdKeysOf(_wdObjAt(panel, 'missingKey: ')), WB);
  check('rSrcTxt', _wdKeysOf(_wdObjAt(panel, "guarded: '删完仍在'")), RB);
  check('rdSrcTxt', _wdKeysOf(_wdObjAt(panel, "read: '存储层读取'")), sbTags);
  // store 读侧：noteStoreReadFail 字面量 ∪ 各模块 store.reportReadFail 投递点
  const stTags = [];
  { const RX = /noteStoreReadFail\(\s*'([^']+)'/g; let mm; while ((mm = RX.exec(st))) if (stTags.indexOf(mm[1]) < 0) stTags.push(mm[1]); }
  ['index.js', 'core/workflow.js', 'engines/worldbook.js', 'engines/chatcache.js', 'engines/tool-diag.js', 'render/inject.js'].forEach(function (f) {
    const t = _wdRead(f, ov);
    const RX = /report(?:Host)?ReadFail\(\s*'([^']+)'/g; let mm;
    while ((mm = RX.exec(t))) if (stTags.indexOf(mm[1]) < 0) stTags.push(mm[1]);
    const RX3 = /noteRead\(\s*'([^']+)'/g; let m3;
    while ((m3 = RX3.exec(t))) if (stTags.indexOf(m3[1]) < 0) stTags.push(m3[1]);
  });
  check('LAB_P', _wdKeysOf(_wdObjAt(panel, "bytes: '按字节'")), stTags.sort());
  // v2.23.0: core/store.js 内**自己**也有一张 store 读侧标签表 `LAB`（标注 readFailedDetail），
  //   与 ui/panel.js 的 `LAB_P` 是同一份真源的两个消费端。此前它保留了 8 个 settings-bus 域
  //   的幽灵键、又漏了 readSpotCheck——同一条「跨域错放」线索的第二处现场。
  check('store.LAB(读取侧标签)', _wdKeysOf(_wdObjAt(st, 'const LAB = {')), stTags);
  // v2.22.0: 引擎↔引擎的重复真源（同样是「第二份真源」，当前一致但无门禁保护）：
  //   engines/editor-faction.js 的 STATUSES/RELATIONS 与 evolution 的 FACTION_STATUS/
  //   FACTION_RELATION 各写一遍——编辑器接受的状态集与引擎合法状态集必须同源同值，
  //   否则编辑出的势力状态会被引擎当成非法值回退（写进去读出来不一样，且无任何报错）。
  const ef = _wdRead('engines/editor-faction.js', ov);
  check('editorFaction.STATUSES↔FACTION_STATUS', _wdArr(ef, 'STATUSES'), _wdArr(evo, 'FACTION_STATUS'));
  check('editorFaction.RELATIONS↔FACTION_RELATION', _wdArr(ef, 'RELATIONS'), _wdArr(evo, 'FACTION_RELATION'));
  // v2.22.0: 诊断包消费端 engines/tool-diag.js 亦自带标签表（第三/四份真源）——诊断是同族
  //   缺陷的**第二处高发区**：用户导出诊断包排查故障时，桶名若对不上，看到的又是裸桶名。
  const td = _wdRead('engines/tool-diag.js', ov);
  check('toolDiag.WRITE_SRC_LABEL', _wdKeysOf(_wdObjAt(td, 'const WRITE_SRC_LABEL = {')), WB);
  check('toolDiag.removeLabel', _wdKeysOf(_wdObjAt(td, "guarded: '删完仍在', missing: '登记项缺 key', setItem: '删除被拒'")), RB);
  check('toolDiag.readLabel', _wdKeysOf(_wdObjAt(td, "read: '存储层读取', parse: '值解析', migrate: '迁移', copy: '返回值拷贝'")), sbTags);
  // v2.26.0（第十四面）: 同一条「跨域错放」线索的**第三处现场**，此前完全无门禁保护。
  //   engines/tool-diag.js 的 `SRC_LABEL` 是 store 读侧标签的第三份真源（另两份是
  //   core/store.js 的 LAB 与 ui/panel.js 的 LAB_P，均已由本文件覆盖）。它此前同时犯了
  //   两处错放：漏掉 store 域自己的 `readSpotCheck`（诊断包退回裸桶名），又混入 8 个
  //   **settings-bus 域**键（rmExisted/verifyBack/legacyRead/saveInherit/subkeyAudit/
  //   pendingOrphan/verifyDefaults/lsRaw——归 toolDiag.readLabel 管，在这张表里永不被消费）。
  //   注：这三份表的**文案**可以各异（诊断包要比 UI 更详细地说明后果），门禁只钉**键集**。
  check('toolDiag.SRC_LABEL(store 读侧标签)', _wdKeysOf(_wdObjAt(td, 'const SRC_LABEL = {')), stTags);
  // v2.22.0: 事件阶段序列（有序列表）在全库有 4 份副本——`editorEvents.TYPE_STAGES` 是 de-facto
  //   真源（`stagesOf` 是 backstage / inspectorState 都优先调用的公共访问器），但 evolution 的
  //   `STAGE_MAP`、backstage 的「紧急兜底」、inspector-state 的「无 editorEvents 兜底」各写一份。
  //   兜底/副本一旦与规范阶段集脱钩，同一条事件会被写成规范集之外的 stage——它不在任何枚举里，
  //   isTerminal/推进逻辑全都认不出（写进去读出来不一样，还不报错）。
  //   注：`TERMINAL` 各文件语义不一（evolution 视「已爆发」为终态、editorEvents 只认「已消散」、
  //   ledger 取两者并集），属**设计分歧**而非复制漂移，故本判据只收「有序阶段序列」。
  const ee = _wdRead('engines/editor-events.js', ov);
  const bs = _wdRead('engines/backstage.js', ov);
  const evo2 = _wdRead('engines/evolution.js', ov);
  const ins = _wdRead('engines/inspector-state.js', ov);
  function _wdArrLit(lit) { return vm.runInNewContext('(' + lit + ')'); }
  const eeConflict = _wdArrLit(ee.match(/conflict:\s*(\[[^\]]*\])/)[1]);
  const eeProgress = _wdArrLit(ee.match(/progress:\s*(\[[^\]]*\])/)[1]);
  const mbs = bs.match(/type === 'progress' \? (\[[^\]]*\]) : (\[[^\]]*\])/);
  if (!mbs) throw new Error('drift: cannot find backstage event-stage fallback');
  check('backstage.fallback.progress', _wdArrLit(mbs[1]), eeProgress);
  check('backstage.fallback.conflict', _wdArrLit(mbs[2]), eeConflict);
  const msm = evo2.match(/STAGE_MAP = \{ conflict:\s*(\[[^\]]*\]),\s*progress:\s*(\[[^\]]*\])/);
  if (!msm) throw new Error('drift: cannot find evolution.STAGE_MAP');
  check('evolution.STAGE_MAP.conflict', _wdArrLit(msm[1]), eeConflict);
  check('evolution.STAGE_MAP.progress', _wdArrLit(msm[2]), eeProgress);
  const mins = ins.match(/=== 'progress'\s*\?\s*(\[[^\]]*\])\s*:\s*(\[[^\]]*\])/);
  if (!mins) throw new Error('drift: cannot find inspector-state stage fallback');
  check('inspectorState.fallback.progress', _wdArrLit(mins[1]), eeProgress);
  check('inspectorState.fallback.conflict', _wdArrLit(mins[2]), eeConflict);

  const failures = [];
  groups.forEach(function (g) {
    if (!g.ok) failures.push(g.name + (g.missing.length ? ' 缺键[' + g.missing.join('、') + ']' : '') + (g.ghost.length ? ' 幽灵键[' + g.ghost.join('、') + ']' : ''));
  });
  return { groups: groups, failures: failures };
}
module.exports = { fresh: fresh, checkPages: checkPages, checkClickable: checkClickable, checkSrcMaps: checkSrcMaps, BASE: BASE, UI_FILES: UI_FILES, discoverUIFiles: discoverUIFiles };

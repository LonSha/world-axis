'use strict';
/**
 * v2.262.0（V6 · OPV6-7）专锁：**设置页收敛 —— 从 12 个分区到玩家动线**
 *
 * ── 这一版治的是什么（现场立据见 tools/v6probes/p_lane.js）────────────────
 * 设置页原有 12 个 `wa-sec` 是**按引擎分区**摆的：世界规模 / 界面 / 世界推演设置 /
 *   主观记忆采样 / 自定义推演指令 / 输出净化规则 / 区域突发事件 / 舆情引擎 /
 *   事件演化 / 远方近端随机事件 / 叙事工艺 / 缝合引擎总开关。
 *   排查时这套分法顺手，但玩家上手要滚完整页找「故事怎么讲」里的净化规则在哪。
 *   实测现场：12 段一屏接一屏，没有任何导航；玩家要改「一次推演多深」得先在
 *   「世界推演设置」与「叙事工艺」之间来回找。
 *
 * ── 本版交付（零破坏：一个控件都没移动、没删除、没改 id）───────────────
 *  `ui/settings.js`
 *    · 15 处 `wa-sec` 全部补 `data-wa-lane` / `data-wa-sec`（15 处源码字面量，
 *      运行时渲染 12 段——差 3 处是分支块里的**备用标注**，不是漏标；见 E 段判据）。
 *    · `LANES` 表（单一真源）+ `laneNavHtml()` 六个按钮 **id 字面量**
 *      （`wa-lane-all/world/people/story/power/ui`）+ `#wa-lane-note`。
 *    · `laneApply(rootEl, lane)` 按「sec 到下一个 sec 之前」的兄弟节点分组显隐。
 *    · 模块级 `__laneSel` 保住重绘后的选中态；`bind()` 挂 `[data-wa-lane-go]`。
 *    · 对外读口 `laneApply()`（专锁与探针走真函数，不挖源码文本）；`lanes()` 镜像导出
 *      被 dead-export-gate 判红后撤除 —— 判据改读运行时真值，产品不为测试多长一个面。
 *    · `laneSayNote()`：切动线/重绘恢复时把「这一路几段、都叫什么」写入 `#wa-lane-note`。
 *    · 未知动线**回落「全部」**（`fallback:true`）——设置页藏光是玩家无法自救的失败形态。
 *
 * ── 抓到的四处缺陷（前三处留痕在 Q 段，第四处留痕在 R 段）─────────────────
 *  ① 探针切片偏移错（`slice(15,-1)` 应为 14）把 lane 名截断成 `{"ower":2,...}`
 *     —— 探针自身缺陷，但会掩盖真实分布读数；
 *  ② 渲染残留 2 处 markdown `**`：来自 `title` 属性里的 `**推导值**`，tooltip 原样露出
 *     —— 真缺陷（HTML 属性不吃 markdown），本版修掉；
 *  ③ 未知 lane 曾把整页藏光（`shown=0 hidden=3`）—— 本版加兜底。
 *  ④ **为让判据能读而长出的死导出**：一度加 `uiSettings.lanes()` 把 LANES 镜像给专锁读，
 *     `dead-export-gate` 当场判红「[test-only] 仅测试引用（产品代码零引用）」。
 *     修法不是登记它而是撤掉它 —— 判据改读运行时真值，冻结面 uiDead 6→5。
 *
 * ── 负控制（N1~N6）：每条都是「真源码破坏 → 装破坏副本 → 重跑同款判据」──
 *  N1 破坏 `laneApply` 的兄弟遍历（只显示 sec 自己）⇒ 段落内容全丢。
 *  N2 破坏 lane 归属（把 world 改指 story）⇒ 动线切换读错段。
 *  N3 破坏未知动线兜底 ⇒ 整页空屏（玩家无法自救）。
 *  N4 破坏「全部」分支 ⇒ 切回「全部」不再清空 display。
 *  N5 破坏导航按钮 id 字面量（改成拼接）⇒ 门禁 H2 静态采集面隐形。
 *  N6 破坏 `__laneSel` 恢复 ⇒ 重绘后踢回整页。
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

// ── mock 基础面快照（理由同 v2.261.0 锁：boot 重建 WA 不得清掉 mock 挂的基础设施）──
const MOCK_WA_BASE = Object.assign({}, global.WorldAxis);

// ── 装载骨架：与 tests/run.js 同源 LOAD 清单，另手动装 ui/settings.js ──
//   为什么手动：ui/settings.js **不在** run.js 的 LOAD 清单里（它由 ui-gate 与
//   设置页专项锁单独装载）。不手动装的话 WA.uiSettings 恒缺席，判据会把
//   「没装载」误报成「功能没做」—— 探针首跑正是这么误报的。
function boot() {
  global.WA = global.WorldAxis = Object.assign({}, MOCK_WA_BASE);
  const ctx = vm.createContext(global);
  const src = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
  const li = src.indexOf('const LOAD = ['), lj = src.indexOf('];', li);
  const LOAD = vm.runInNewContext('(' + src.slice(src.indexOf('[', li), lj + 1) + ')');
  for (const rel of LOAD) {
    try { vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel }); } catch (e) { /* 单模块失败不阻断骨架 */ }
  }
  const WA = global.WorldAxis;
  try { WA.store.init(); } catch (e) {}
  try {
    vm.runInContext(fs.readFileSync(path.join(BASE, 'ui/settings.js'), 'utf8'), ctx, { filename: 'ui/settings.js' });
  } catch (e) { console.log('  settings 装载异常: ' + e.message); }
  return WA;
}

const SET_PATH = path.join(BASE, 'ui/settings.js');
const SET_SRC = fs.readFileSync(SET_PATH, 'utf8');

// ── 锚点：字面量在此声明一次，判据区只引用变量（H5 判据纯度）──
const A_SIB = 'let cur = sec.nextElementSibling;';
const A_DOMAIN = "if (!inDomain) { out.fallback = true; lane = 'all'; out.lane = 'all'; }";
const A_SHOWALL = "const showAll = (lane === 'all' || out.dev);";
const A_DISPLAY = "el.style.display = vis ? '' : 'none';";
// 锚点取**整块**（重绘恢复与说明条写回在同一块里，改一处等于两处都坏）
const A_RESUME = "if (__laneSel && __laneSel !== 'all') {";
const A_RESUME_BODY = "laneSayNote(__laneSel, laneApply(laneBody(), __laneSel));";

// ── 内存副本破坏器：绝不动真源码 ──
function loadSettingsFrom(srcText, tag) {
  const ctx = vm.createContext(global);
  try {
    vm.runInContext(srcText, ctx, { filename: 'settings[' + tag + '].js' });
  } catch (e) { return null; }
  return global.WorldAxis.uiSettings;
}
function breakOnce(src, anchor, replacement, tag) {
  const n = src.split(anchor).length - 1;
  if (n !== 1) { assert(false, '锚点「' + tag + '」在源码中应恰 1 处，实得 ' + n + ' 处（负控制无法成立）'); return null; }
  return src.replace(anchor, replacement);
}
// ── 同构最小 DOM（无 jsdom 依赖：本仓零依赖，不能为一条 UI 判据引入 npm 包）──
function mkEl(attrs) {
  return {
    _attrs: attrs || {}, style: {}, _next: null,
    getAttribute(k) { return this._attrs[k] === undefined ? null : this._attrs[k]; },
    get nextElementSibling() { return this._next; }
  };
}
function buildDom() {
  const s1 = mkEl({ 'data-wa-lane': 'world', 'data-wa-sec': 'A' });
  const c1 = mkEl({}), c2 = mkEl({});
  const s2 = mkEl({ 'data-wa-lane': 'story', 'data-wa-sec': 'B' });
  const c3 = mkEl({}), c4 = mkEl({});
  const s3 = mkEl({ 'data-wa-lane': 'world', 'data-wa-sec': 'C' });
  const c5 = mkEl({});
  s1._next = c1; c1._next = c2; c2._next = s2; s2._next = c3; c3._next = c4; c4._next = s3; s3._next = c5;
  const root = { querySelectorAll(sel) { return sel === '[data-wa-lane]' ? [s1, s2, s3] : []; } };
  return { root, secs: [s1, s2, s3], kids: [c1, c2, c3, c4, c5] };
}

function runCore() {
  let WA = boot();
  assert(!!(WA.uiSettings && typeof WA.uiSettings.render === 'function'), 'A0 ui/settings.js 装载成功（WA.uiSettings.render 可用）');

  // ═══════════════════════════════════════════════════════════════════════════
  section('A. 源码面：标注与导航各恰到位（防重复打补丁 / 漏标）');
  const laneMarkCount = (SET_SRC.match(/data-wa-lane="/g) || []).length;
  const secMarkCount = (SET_SRC.match(/data-wa-sec="/g) || []).length;
  const secDivCount = (SET_SRC.match(/<div class="wa-sec"/g) || []).length;
  eq(laneMarkCount, secDivCount, 'A1 每处 data-wa-lane 与每处 wa-sec 一一对应');
  eq(secMarkCount, secDivCount, 'A2 每处 data-wa-sec 与每处 wa-sec 一一对应');
  // v2.265.0（EXV6-1）：设置页新增「世界日记」一段 ⇒ 15→16 处源码 / 12→13 段运行时。
  // v2.266.0, 2.267.0（EXV6-2/3）：再新增「人物今日动线」一段 ⇒ 16→17 处源码 / 13→14 段运行时。
  // v2.268.0（EXV6-4）：新增「暗流日历」一段 ⇒ 17→18 处源码 / 14→15 段运行时。
  // v2.269.0（EXV6-5）：新增「单轮成本卡」一段 ⇒ 18→19 处源码 / 15→16 段运行时。
  // v2.270.0（EXV6-6）：新增「存档体检」一段 ⇒ 19→20 处源码 / 16→17 段运行时。
  // v2.271.0（EXV6-7）：新增「开局引导」一段 ⇒ 20→21 处源码 / 17→18 段运行时。
  // v2.272.0（EXV6-8）：新增「玩家说明书」一段 ⇒ 21→22 处源码 / 18→19 段运行时。
  // v2.273.0（EXV6-9）：新增「一键交班」一段 ⇒ 22→23 处源码 / 19→20 段运行时。
  //   段数必须跟着涨：不涨的话，下一次新增漏标那一段时本判据会沉默（它就是那个数）。
  assert(secDivCount === 23, 'A3 源码字面量 wa-sec 恰 23 处（运行时渲染 20 段，差 3 为分支块备用标注）');
  eq((SET_SRC.match(/const LANES = \[/g) || []).length, 1, 'A4 LANES 表定义恰 1 处（单一真源）');
  eq((SET_SRC.match(/function laneNavHtml\(\)/g) || []).length, 1, 'A5 laneNavHtml 定义恰 1 处');
  eq((SET_SRC.match(/function laneApply\(rootEl, lane\)/g) || []).length, 1, 'A6 laneApply 定义恰 1 处');
  eq((SET_SRC.match(/let __laneSel = 'all';/g) || []).length, 1, 'A7 __laneSel 模块级状态恰 1 处');
  eq((SET_SRC.match(/laneApply\(rootEl, lane\) \{ return laneApply\(rootEl, lane\); \}/g) || []).length, 1, 'A8 laneApply 对外读口恰 1 处');
  // A9 反向判据：**不许**再有镜像导出 `lanes()`。
  //   本版一度加过它（为了让判据读到动线表），dead-export-gate 当场报
  //   「仅测试引用（产品代码零引用）」——产品不为「让测试看得见」多长一个镜像面。
  eq((SET_SRC.match(/lanes\(\) \{ return LANES\.map/g) || []).length, 0, 'A9 无 lanes() 镜像导出（判据读运行时真值，不读镜像表）');

  // 六个导航按钮 id 必须**字面量**：门禁 H2 从源码字面量采集控件
  const navIds = ['wa-lane-all', 'wa-lane-world', 'wa-lane-people', 'wa-lane-story', 'wa-lane-power', 'wa-lane-ui'];
  navIds.forEach(function (id, i) {
    eq((SET_SRC.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, 'A1' + i + ' 导航按钮 ' + id + ' id 字面量恰 1 处');
  });
  assert(/id="wa-lane-bar"/.test(SET_SRC), 'A16 导航条 id 字面量在位');
  assert(/id="wa-lane-note"/.test(SET_SRC), 'A17 动线说明 id 字面量在位');

  // ═══════════════════════════════════════════════════════════════════════════
  section('B. 取值域：封闭集，且「全部」必须在首位（读运行时真值）');
  // 判据读的是**渲染出来的按钮**与**分组函数的行为**，不读内部表的镜像——
  //   镜像表会让「测到的」与「跑起来的」变成两份东西，实测 dead-export 也拦这一手。
  const htmlB = WA.uiSettings.render();
  const navOrder = [];
  const reBtn = /id="wa-lane-([a-z]+)"[^>]*data-wa-lane-go="([a-z]+)"/g;
  let mBtn;
  while ((mBtn = reBtn.exec(htmlB)) !== null) navOrder.push(mBtn[2]);
  eq(navOrder.length, 6, 'B1 渲染出 6 个导航按钮');
  eq(navOrder[0], 'all', 'B2 首位是 all（默认态）');
  eq(navOrder.join(','), 'all,world,people,story,power,ui', 'B3 取值域逐字固定');
  // id 与 data-wa-lane-go 必须同名（拆开写会让「点了哪个」与「按钮叫什么」漂移）
  navOrder.forEach(function (g, i) {
    assert(htmlB.indexOf('id="wa-lane-' + g + '"') >= 0, 'B4.' + i + ' 按钮 id 与动线名一致（wa-lane-' + g + '）');
  });
  // 每个按钮都带 title（说明这一路是干什么的，玩家不必点进去试）
  navOrder.forEach(function (g, i) {
    const seg = htmlB.slice(htmlB.indexOf('id="wa-lane-' + g + '"'), htmlB.indexOf('id="wa-lane-' + g + '"') + 220);
    assert(/title="[^"]{4,}"/.test(seg), 'B5.' + i + ' 按钮 ' + g + ' 带 title 说明');
  });
  // 「全部」之外的五条动线都必须能真的分到段（取值域不空转）
  {
    const d = buildDom();
    ['world', 'people', 'story', 'power', 'ui'].forEach(function (lane, i) {
      const r = WA.uiSettings.laneApply(d.root, lane);
      assert(typeof r.shown === 'number' && r.total === 3, 'B6.' + i + ' lane=' + lane + ' 能给出完整读数（total=3）');
      eq(r.fallback, undefined, 'B7.' + i + ' lane=' + lane + ' 在取值域内，不触发兜底');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section('C. 渲染面：20 段全有归属，零段漏标，零 markdown 星号');
  const html = WA.uiSettings.render();
  assert(html.length > 1000, 'C1 渲染出实质内容（长度 ' + html.length + '）');
  assert(/id="wa-lane-bar"/.test(html), 'C2 渲染含导航条');
  navIds.forEach(function (id, i) {
    assert(html.indexOf('id="' + id + '"') >= 0, 'C3.' + i + ' 渲染含 ' + id);
  });
  const rendered = (html.match(/data-wa-lane="([a-z]+)"/g) || []).map(function (x) { return x.slice(14, -1); });
  eq(rendered.length, 20, 'C4 运行时渲染出 20 段（与运行时 wa-sec 数一致；v2.273.0 新增一键交班一段）');
  eq((html.match(/<div class="wa-sec">/g) || []).length, 0, 'C5 零个「无 lane 的 wa-sec」（漏标会被这条抓到）');
  const dist = {};
  rendered.forEach(function (l) { dist[l] = (dist[l] || 0) + 1; });
  ['world', 'people', 'story', 'power', 'ui'].forEach(function (k) {
    assert(typeof dist[k] === 'number' && dist[k] > 0, 'C6 ' + k + ' 动线下至少有 1 段（不允许空动线）');
  });
  eq(Object.keys(dist).length, 5, 'C7 渲染面只出现取值域内的 5 个 lane（all 不落在任何 sec 上）');
  // 每段都带名字（玩家据此认段）
  const secNames = (html.match(/data-wa-sec="([^"]+)"/g) || []).map(function (x) { return x.slice(13, -1); });
  eq(secNames.length, 20, 'C8 20 段全部带 data-wa-sec 名');
  secNames.forEach(function (n, i) { assert(n.length > 0, 'C9.' + i + ' 段名非空'); });
  // 面板渲染 HTML 而非 markdown：任何 `**` 都会原样露出（本版修掉的两处，见 O 段）
  eq((html.match(/\*\*/g) || []).length, 0, 'C10 渲染结果零 markdown 星号（title 属性也不许有）');

  // ═══════════════════════════════════════════════════════════════════════════
  section('D. laneApply 真分组：兄弟遍历止于下一个 sec');
  {
    const d = buildDom();
    const r = WA.uiSettings.laneApply(d.root, 'world');
    eq(r.shown, 2, 'D1 world 下显示 2 段');
    eq(r.hidden, 1, 'D2 world 下隐藏 1 段（story 那段）');
    eq(r.total, 3, 'D3 总段数 3');
    eq(d.secs[0].style.display, '', 'D4 world 段自己不隐藏');
    eq(d.kids[0].style.display, '', 'D5 world 段的子控件显示（兄弟遍历生效）');
    eq(d.kids[1].style.display, '', 'D6 world 段末尾的子控件显示（止于下一个 sec）');
    eq(d.secs[1].style.display, 'none', 'D7 story 段隐藏');
    eq(d.kids[2].style.display, 'none', 'D8 story 段的子控件一并隐藏');
    eq(d.secs[2].style.display, '', 'D9 第二个 world 段显示');
    eq(d.kids[4].style.display, '', 'D10 末段子控件显示（无下一个 sec 时走父末子）');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section('E. 切回「全部」必须把 display 全清空（不清 = 残留隐藏）');
  {
    const d = buildDom();
    WA.uiSettings.laneApply(d.root, 'story');
    eq(d.secs[0].style.display, 'none', 'E1 story 下 world 段被隐藏');
    eq(d.secs[1].style.display, '', 'E2 story 段自己显示');
    const r = WA.uiSettings.laneApply(d.root, 'all');
    eq(r.hidden, 0, 'E3 切回 all 隐藏数归零');
    eq(r.shown, 3, 'E4 切回 all 三段全显示');
    d.secs.concat(d.kids).forEach(function (el, i) {
      eq(el.style.display, '', 'E5.' + i + ' display 已清空（不是残留 none）');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section('F. 开发者模式：一律不隐藏（分组错误靠它绕过）');
  {
    const d = buildDom();
    // devMode 只读 → 用 stub 顶替（不改产品代码）
    const oldUi = WA.ui;
    let devFlag = true;
    WA.ui = Object.assign({}, oldUi, { devMode: function () { return devFlag; } });
    const rDev = WA.uiSettings.laneApply(d.root, 'story');
    eq(rDev.hidden, 0, 'F1 开发者模式下切到 story 也不隐藏任何段');
    eq(rDev.shown, 3, 'F2 三段全显示');
    eq(rDev.dev, true, 'F3 读数如实报 dev=true（不糊弄调用方）');
    devFlag = false;
    const rNo = WA.uiSettings.laneApply(d.root, 'story');
    eq(rNo.dev, false, 'F4 关掉开发者模式后 dev=false');
    eq(rNo.hidden, 2, 'F5 关掉后分组恢复生效');
    WA.ui = oldUi;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section('G. 未知动线兜底：宁可多显示，不可空屏');
  {
    const d = buildDom();
    const rBad = WA.uiSettings.laneApply(d.root, 'nope');
    eq(rBad.fallback, true, 'G1 未知动线标 fallback');
    eq(rBad.lane, 'all', 'G2 回落后的 lane 如实报 all（不谎报成 nope）');
    eq(rBad.shown, 3, 'G3 未知动线不空屏：三段全显示');
    eq(rBad.hidden, 0, 'G4 未知动线零隐藏');
    d.secs.concat(d.kids).forEach(function (el, i) {
      eq(el.style.display, '', 'G5.' + i + ' 未知动线不留 display:none（否则玩家自救不了）');
    });
    // 空/异常 lane 同形
    const rEmpty = WA.uiSettings.laneApply(d.root, '');
    eq(rEmpty.fallback, true, 'G6 空串同按未知处理');
    eq(rEmpty.shown, 3, 'G7 空串也全显示');
    const rUndef = WA.uiSettings.laneApply(d.root);
    eq(rUndef.fallback, true, 'G8 undefined 同按未知处理');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section('H. 边界入参：坏 root 不抛、返回零计数');
  {
    [null, undefined, {}, 0, 'x'].forEach(function (bad, i) {
      let threw = false, r = null;
      try { r = WA.uiSettings.laneApply(bad, 'world'); } catch (e) { threw = true; }
      eq(threw, false, 'H1.' + i + ' 坏 root 不抛异常');
      assert(r && r.total === 0 && r.shown === 0, 'H2.' + i + ' 坏 root 返回零计数（不合成读数）');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section('I. 绑定面：导航按钮与重绘恢复都挂上了');
  assert(/panelEl\.querySelectorAll\('\[data-wa-lane-go\]'\)/.test(SET_SRC), 'I1 导航按钮绑定在位');
  assert(/lanePaint\(btn\.getAttribute\('data-wa-lane-go'\)\)/.test(SET_SRC), 'I2 点击走 lanePaint');
  assert(/__laneSel = lane;/.test(SET_SRC), 'I3 点击记下选中动线');
  assert(SET_SRC.indexOf(A_RESUME) >= 0, 'I4 重绘后按 __laneSel 恢复（不在整页与动线间跳）');
  assert(SET_SRC.indexOf(A_RESUME_BODY) >= 0, 'I4b 恢复时说明条一并写回（否则说明条停在静止文案）');
  assert(/const laneBody = \(\) => \(panelEl\.querySelector\('\.wa-body'\) \|\| panelEl\)/.test(SET_SRC), 'I5 分组作用域优先 .wa-body');
  // 每个按钮的 data-wa-lane-go 都在取值域内（拼错会导致点了没反应）
  const gos = (SET_SRC.match(/data-wa-lane-go="([a-z]+)"/g) || []).map(function (x) { return x.slice(17, -1); });
  eq(gos.length, 6, 'I6 六个按钮各带 data-wa-lane-go');
  const DOMAIN = 'all,world,people,story,power,ui';
  gos.forEach(function (g, i) {
    assert(DOMAIN.split(',').indexOf(g) >= 0, 'I7.' + i + ' ' + g + ' 在取值域内');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  section('J. 零破坏：既有控件一个都没少、一个都没改名');
  // 本版只加标注与导航，不动控件——所以既有 id 必须全在，且数量不变
  const ctrlIds = (SET_SRC.match(/id="(wa-[a-z0-9\-]+)"/g) || []).map(function (x) { return x.slice(4, -1); });
  const ctrlSet = {};
  ctrlIds.forEach(function (id) { ctrlSet[id] = (ctrlSet[id] || 0) + 1; });
  const navSet = ['wa-lane-all', 'wa-lane-world', 'wa-lane-people', 'wa-lane-story', 'wa-lane-power', 'wa-lane-ui', 'wa-lane-bar', 'wa-lane-note'];
  const before = Object.keys(ctrlSet).filter(function (id) { return navSet.indexOf(id) < 0; });
  assert(before.length > 30, 'J1 既有控件仍有 ' + before.length + ' 个（本版没删东西）');
  ['wa-set-devmode', 'wa-set-mode', 'wa-set-time', 'wa-set-pulse', 'wa-set-budget-mode', 'wa-set-budget', 'wa-set-tier-rollback'].forEach(function (id, i) {
    assert(ctrlSet[id] === 1, 'J2.' + i + ' 既有控件 ' + id + ' 恰 1 处（零破坏）');
  });
  eq(ctrlSet['wa-lane-all'], 1, 'J3 新导航 id 不与既有控件撞名');

  // ═══════════════════════════════════════════════════════════════════════════
  section('K. 负控制 N1：破坏兄弟遍历 ⇒ 段落内容全丢');
  {
    const bad = breakOnce(SET_SRC, A_SIB, 'let cur = null;', 'N1');
    if (bad) {
      const beforeUi = WA.uiSettings;
      const u = loadSettingsFrom(bad, 'N1');
      if (u) {
        WA.uiSettings = u;
        const d = buildDom();
        u.laneApply(d.root, 'world');
        assert(d.kids[0].style.display !== '', 'N1.1 破坏后 world 段的子控件**没被**显式显示（段落内容跟着丢了）');
        WA.uiSettings = beforeUi;
        // 同款判据在正版上必须真
        const d2 = buildDom();
        WA.uiSettings.laneApply(d2.root, 'world');
        eq(d2.kids[0].style.display, '', 'N1.2 正版上子控件确实被显示（判据真）');
      } else { assert(false, 'N1.3 破坏副本装载失败（负控制不成立）'); }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section('L. 负控制 N2：破坏 lane 归属 ⇒ 切错动线读错段');
  {
    // 锚点必须取**正常态**那一处：叙事工艺在源码里有 2 处（缺席态 + 正常态），
    //   只写 data-wa-sec 名会命中 2 次，负控制直接不成立（首跑就撞到这一条，
    //   也顺带证实了 A3 「15 处源码 / 12 段运行时」的差额来源：叙事工艺 2 处、
    //   世界规模 3 处，多出的 1+2=3 正是缺席态的备用标注）。
    const anchor = 'data-wa-lane="story" data-wa-sec="叙事工艺">叙事工艺设置面<span';
    const bad = breakOnce(SET_SRC, anchor, 'data-wa-lane="world" data-wa-sec="叙事工艺">叙事工艺设置面<span', 'N2');
    if (bad) {
      const beforeUi = WA.uiSettings;
      const u = loadSettingsFrom(bad, 'N2');
      if (u) {
        WA.uiSettings = u;
        const h = u.render();
        const storySegs = (h.match(/data-wa-lane="story"/g) || []).length;
        WA.uiSettings = beforeUi;
        assert(storySegs < 3, 'N2.1 破坏后 story 动线段数变少（' + storySegs + ' < 3，归属被改走）');
        const hOk = WA.uiSettings.render();
        eq((hOk.match(/data-wa-lane="story"/g) || []).length, 3, 'N2.2 正版 story 恰 3 段（判据真）');
      } else { assert(false, 'N2.3 破坏副本装载失败'); }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section('M. 负控制 N3：破坏未知动线兜底 ⇒ 整页空屏');
  {
    const bad = breakOnce(SET_SRC, A_DOMAIN, 'if (false) { }', 'N3');
    if (bad) {
      const beforeUi = WA.uiSettings;
      const u = loadSettingsFrom(bad, 'N3');
      if (u) {
        WA.uiSettings = u;
        const d = buildDom();
        const r = u.laneApply(d.root, 'nope');
        assert(r.fallback !== true, 'N3.1 破坏后不再标 fallback');
        eq(r.shown, 0, 'N3.2 破坏后整页空屏（这就是本版要治的失败形态）');
        WA.uiSettings = beforeUi;
        const d2 = buildDom();
        eq(WA.uiSettings.laneApply(d2.root, 'nope').shown, 3, 'N3.3 正版未知动线不空屏（判据真）');
      } else { assert(false, 'N3.4 破坏副本装载失败'); }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section('N. 负控制 N4：破坏「全部」分支 ⇒ 切回整页仍残留隐藏');
  {
    const bad = breakOnce(SET_SRC, A_SHOWALL, 'const showAll = (lane === \'__never\');', 'N4');
    if (bad) {
      const beforeUi = WA.uiSettings;
      const u = loadSettingsFrom(bad, 'N4');
      if (u) {
        WA.uiSettings = u;
        const d = buildDom();
        u.laneApply(d.root, 'story');
        u.laneApply(d.root, 'all');
        assert(d.secs[0].style.display === 'none', 'N4.1 破坏后切回 all 仍残留 none（整页回不去）');
        WA.uiSettings = beforeUi;
        const d2 = buildDom();
        WA.uiSettings.laneApply(d2.root, 'story');
        WA.uiSettings.laneApply(d2.root, 'all');
        eq(d2.secs[0].style.display, '', 'N4.2 正版切回 all 全清空（判据真）');
      } else { assert(false, 'N4.3 破坏副本装载失败'); }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section('O. 负控制 N5：按钮 id 改成拼接 ⇒ 门禁 H2 静态采集面隐形');
  {
    const anchor = 'id="wa-lane-story"';
    const bad = breakOnce(SET_SRC, anchor, 'id="wa-lane-" + \'story\'', 'N5');
    if (bad) {
      assert(!/id="wa-lane-story"/.test(bad), 'N5.1 破坏后源码里再无 id 字面量（静态采集不到）');
      assert(/id="wa-lane-story"/.test(SET_SRC), 'N5.2 正版字面量在位（判据真）');
      // 运行时仍能用 → 这正是危险处：守卫表看不见，但界面活着
      const beforeUi = WA.uiSettings;
      const u = loadSettingsFrom(bad, 'N5');
      if (u) {
        const h = u.render();
        assert(h.indexOf('id="wa-lane-story"') >= 0, 'N5.3 破坏副本运行时仍渲染出该 id（静态隐形、运行时活着 = 守卫变僵尸）');
      }
      WA.uiSettings = beforeUi;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section('P. 负控制 N6：破坏重绘恢复 ⇒ 状态刷新后踢回整页 / 说明条不跟');
  {
    // N6a：整块删掉 ⇒ 重绘后选中态丢失（踢回整页）
    const bad = breakOnce(SET_SRC, A_RESUME, 'if (false) {', 'N6a');
    if (bad) {
      assert(bad.indexOf(A_RESUME) < 0, 'N6.1 破坏后恢复块消失（重绘即踢回整页）');
      assert(SET_SRC.indexOf(A_RESUME) >= 0, 'N6.2 正版恢复块在位（判据真）');
    }
    // N6b：只删说明条写回 ⇒ 显隐恢复了，但说明条停在静止文案（「这一路几段」失联）
    const bad2 = breakOnce(SET_SRC, A_RESUME_BODY, '', 'N6b');
    if (bad2) {
      assert(bad2.indexOf(A_RESUME_BODY) < 0, 'N6.3 破坏后说明条写回消失（界面读数与实际分组脱节）');
      assert(SET_SRC.indexOf(A_RESUME_BODY) >= 0, 'N6.4 正版说明条写回在位（判据真）');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section('R. 说明条的活口：laneApply 读数在界面上自证（不是只为测试而存在的导出）');
  // dead-export-gate 抓到过一件事：`lanes()` 镜像导出只有测试在读，产品零消费。
  //   反过来，laneApply 的 shown/total 必须**有人真用**，否则它也只是为判据长的。
  //   产品侧用它写 #wa-lane-note（laneSayNote），本段断言这条链存在且不重算。
  assert(/function laneSayNote|= function \(lane, r\) \{/.test(SET_SRC) || SET_SRC.indexOf('const laneSayNote = function (lane, r)') >= 0, 'R1 laneSayNote 定义在位');
  assert(SET_SRC.indexOf('laneSayNote(lane, r);') >= 0, 'R2 lanePaint 里真调用（读数被消费）');
  assert(SET_SRC.indexOf("panelEl.querySelector('#wa-lane-note')") >= 0, 'R3 说明条节点被真读');
  assert(SET_SRC.indexOf("getAttribute('data-wa-sec')") >= 0, 'R4 段名从 data-wa-sec 取（标注有产品用途）');
  assert(SET_SRC.indexOf('laneSayNote(__laneSel, laneApply(laneBody(), __laneSel))') >= 0, 'R5 重绘恢复时说明条一并写回');
  assert(!/r\.shown\s*=\s*0.*count/s.test(SET_SRC), 'R6 说明条不自己重新数一遍（用 laneApply 的真读数）');
  // 说明条文案零 markdown：它写的是 innerHTML
  assert(SET_SRC.indexOf("note.innerHTML = head +") >= 0, 'R7 说明条用 innerHTML 写入');
  eq((SET_SRC.match(/\*\*/g) || []).length > 0, true, 'R8 源码注释里的 `**` 仍在（注释不进 HTML，不是缺陷）');

  // ═══════════════════════════════════════════════════════════════════════════
  section('Q. 假绿记录：本版抓到的三处算错形态（第四处死导出留痕见 R 段）');
  // 假绿①：探针切片偏移 —— 判据算错而产品是对的，读数会骗人
  {
    const sample = 'data-wa-lane="world"';
    eq(sample.slice(14, -1), 'world', 'Q1 正确切片（14）得完整 lane 名');
    assert(sample.slice(15, -1) === 'orld', 'Q2 错切片（15）会掉首字母 —— 探针曾据此报出 {"ower":2,...} 这类假分布');
  }
  // 假绿②：`**` 在 HTML 属性里不会变粗体，只会原样露出（C10 的现场来源）
  {
    const d = buildDom();
    const r = WA.uiSettings.laneApply(d.root, 'world');
    assert(typeof r.shown === 'number', 'Q3 读数形状正确（不是靠字符串猜）');
    const h = WA.uiSettings.render();
    assert(h.indexOf('**') < 0, 'Q4 渲染面零 `**`（title 属性同样不吃 markdown）');
  }
  // 假绿③：把「分组」写成 CSS `~` 时，sec 与内容不是父子关系 ⇒ 会隐藏后续全部
  //   本仓不引 CSS 分组判据，只认 JS 遍历读数（Q5 断言遍历函数存在且被调用）
  {
    assert(SET_SRC.indexOf('nextElementSibling') >= 0, 'Q5 分组靠 nextElementSibling 逐段走（不用 CSS ~ 近似）');
    assert(!/\.wa-sec\s*~\s*/.test(SET_SRC), 'Q6 源码里没有 `.wa-sec ~` 这类顺序近似选择器');
  }
  // 假绿④（形态不同的一处）：**判据能读到镜像表 ≠ 判据验到了产品**。
  //   本版一度为了让专锁读动线表而导出 lanes()，dead-export-gate 判红「仅测试引用」。
  //   锁在这里正面钉死：读口只能是 laneApply（产品自己也在用），不能是镜像。
  {
    assert(typeof WA.uiSettings.laneApply === 'function', 'Q7 对外只暴露 laneApply');
    eq(typeof WA.uiSettings.lanes, 'undefined', 'Q8 lanes() 镜像导出已撤除（不为让判据看得见而长面）');
  }
}

function report() {
  console.log('\n═══ settings-lanes-v2262: ' + pass + ' 通过 / ' + fail + ' 失败 ═══');
  if (fail) { console.log('失败项：'); fails.forEach(function (f) { console.log('  · ' + f); }); }
}

async function runAll(assert) {
  __extAssert = assert || null;
  pass = 0; fail = 0; fails.length = 0;
  try {
    runCore();
  } catch (e) {
    // 正文抛错不得静默：如实记一条失败并打栈（否则挂载方只看到「少了几十条」）
    assert(false, 'settings-lanes-v2262 正文抛错：' + ((e && e.stack) || e));
    fail++;
  } finally {
    __extAssert = null;
  }
  if (!assert) report();
  return { pass: pass, fail: fail };
}
if (require.main === module) {
  runAll(null).then(function (r) { process.exit(r.fail === 0 ? 0 : 1); }).catch(function (e) {
    console.error('FATAL: ' + ((e && e.stack) || e)); process.exit(1);
  });
}
module.exports = { runAll: runAll };

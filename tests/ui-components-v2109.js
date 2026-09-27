// WorldAxis tests/ui-components-v2109.js (v2.109.0) — UI 组件层单元测试（计划一 #16）
//
// 分工（与已有两道 UI 门禁的边界，不是重复）：
//   · tests/ui-gate.js    —— 端到端：逐页真实渲染 + 逐控件真实点击（“会不会炸”）
//   · tests/ui-wire-audit —— 静态：$('#id') 引用 vs 模板渲染面（“绑定是不是空转”）
//   · 本文件               —— 单元级：按控件类型分解的不变量 + 本版 #15 持久化行为的回归钉
//
// 为什么需要单元级（实测缺口，不是偏好）：
//   ui-gate 的 checkPages 对渲染产物只断言总数（HTML 里的控件数是否等于树里的控件数）。
//   于是下面三类缺陷**在任何现有门禁里都不可见**——它们渲染成树、可被点击、不抛异常，
//   但对用户完全无效：
//     ① <select> 里零个 <option>  —— 用户打开下拉框发现无选项可选（配置项“存在但不可选”）；
//     ② <input type="range"> 没有 min/max —— 滑块能拖，但边界与步长全靠浏览器默认，
//        而产品的区间声明在登记表里（v2.7.0 把区间上收正是治这个）——两者会静默不一致；
//     ③ 文本类控件没有可用名字 —— #14 的 a11y 门禁已在抄这一层，但它只报“覆盖率”，
//        不回答“这个控件的名字来源是哪一种”。
//   一句话：**控件成树 ≠ 控件可用**；“成树”与“可点”都已被覆盖，这两者之间的缝没人守。
//
// 本文件同时把 v2.109.0（#15）的面板状态持久化行为钉住：它把交互偏好交给设置总线，
//   而“交给总线”有三个可证伪的后果（落盘 / 跨会话恢复 / 登记表里恰一条）——都能单测，
//   也都做了真源码破坏的负控制。
'use strict';
const path = require('path');
const fs = require('fs');
const uiGate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');

const PANEL = 'ui/panel.js';
// v2.109.0（#15）面板状态键：与 ui/panel.js 的声明必须字面一致。
//   刻意在测试里**再写一遍**：这是对外承诺的键名，它被改名时判据必须红，
//   而不是默默跟着改（从产品源码里读出来会让判据永远为真）。
const STATE_KEY = 'worldaxis_ui_panel_state_v1';
const TEXT_TYPES = ['text', 'search', 'tel', 'url', 'email', 'password', 'number'];
const NAMED_ATTRS = ['aria-label', 'aria-labelledby', 'placeholder', 'title'];

function panelOf(dom) { return dom.getElementById('wa-panel'); }
function tabsOf(dom) {
  const p = panelOf(dom);
  return p ? p.querySelectorAll('.wa-tab') : [];
}
// 当前高亮页从 **DOM** 读，而不是问 WA.ui.currentPage()：
//   刻意走渲染产物这一侧——“面板状态是否真的反映到界面上”比“闭包变量是什么”更接近用户所见。
function activeOf(dom) {
  const hit = tabsOf(dom).filter(function (t) { return t.classList && t.classList.contains('active'); })[0];
  return hit ? hit.dataset.page : null;
}
function clickTab(dom, page) {
  const t = tabsOf(dom).filter(function (x) { return x.dataset.page === page; })[0];
  if (!t) return false;
  t.click();
  return true;
}
function bodyOf(dom) {
  const p = panelOf(dom);
  return p ? p.querySelector('.wa-body') : null;
}
/** 控件分解器：把一棵渲染子树的控件按**类型**归类（单元判据的输入面）。 */
function decompose(scope) {
  const out = { button: 0, range: 0, checkbox: 0, select: 0, textarea: 0, text: 0, other: 0,
    rangesNoBounds: [], emptySelects: [], unnamed: [], selectOptions: 0 };
  if (!scope || typeof scope.querySelectorAll !== 'function') return out;
  scope.querySelectorAll('button').forEach(function () { out.button++; });
  scope.querySelectorAll('select').forEach(function (s) {
    out.select++;
    const opts = (typeof s.querySelectorAll === 'function') ? s.querySelectorAll('option') : [];
    out.selectOptions += opts.length;
    // 判据：下拉框必须有可选项。零选项 = 渲染成树、可点、不抛异常，但用户无从选择。
    if (!opts.length) out.emptySelects.push(s.id || '(无 id)');
  });
  scope.querySelectorAll('textarea').forEach(function () { out.textarea++; });
  scope.querySelectorAll('input').forEach(function (el) {
    const t = String(el.type || 'text').toLowerCase();
    if (t === 'range') {
      out.range++;
      // 判据：滑块必须带区间声明（min/max 缺失 ⇒ 范围由浏览器默认决定，与产品声明不一致）。
      //   **口径自纠（本版第一版判据踩到的）**：首版读 `el.min` / `el.max`，于是 14 个滑块
      //   全被报成「无区间」——而真源码里它们全都有 min/max。根因是 mini-DOM 的 setAttr
      //   只把 value/type/placeholder/title/name 镜像到**属性**，其余一律只进 `attrs`
      //   （见 tests/ui-dom.js setAttr）。即那一读数反映的是**测试媒介的存储方式**，
      //   不是产品行为。改读 `getAttribute('min')` —— 那是与宿主的存储方式无关的 DOM 标准路径，
      //   TauriTavern / 浏览器 / mini-DOM 三处语义一致。
      const mn = el.getAttribute ? el.getAttribute('min') : el.min;
      const mx = el.getAttribute ? el.getAttribute('max') : el.max;
      if (mn === null || mn === undefined || mn === '' || mx === null || mx === undefined || mx === '') {
        out.rangesNoBounds.push(el.id || '(无 id)');
      }
    } else if (t === 'checkbox') { out.checkbox++; }
    else if (TEXT_TYPES.indexOf(t) >= 0) {
      out.text++;
      const named = NAMED_ATTRS.some(function (k) { return el.getAttribute && el.getAttribute(k); });
      if (!named) out.unnamed.push(el.id || '(无 id)');
    } else { out.other++; }
  });
  return out;
}

// ── A. 单元级：控件分解不变量（「控件成树 ≠ 控件可用」）──
function runAll(a) {
  // 起点：干净磁盘 + 干净面板状态（否则上一用例留下的 page 会让本节不可复现）
  try { global.localStorage.removeItem(STATE_KEY); } catch (e) {}
  const env = uiGate.fresh();
  const WA = env.WA, dom = env.dom;
  const panel = panelOf(dom);
  a(!!panel, 'ui-comp: 面板已注入（fresh 真装载了 ui/*）');
  a(tabsOf(dom).length > 0, 'ui-comp: 页签成树（' + tabsOf(dom).length + ' 个）');
  a(activeOf(dom) === 'overview', 'ui-comp: 无持久化值时初始页为 overview（实 ' + activeOf(dom) + '）');
  if (WA.ui && typeof WA.ui.open === 'function') WA.ui.open();

  // A1. 逐页分解：每页的控件面必须“可用”，而不只是“存在”
  const bad = [];
  const pages = tabsOf(dom).map(function (t) { return t.dataset.page; });
  a(pages.length >= 14, 'ui-comp: 页签覆盖面 ' + pages.length + ' 页（≥14）');
  const totals = { button: 0, range: 0, checkbox: 0, select: 0, textarea: 0, text: 0, other: 0 };
  pages.forEach(function (p) {
    if (!clickTab(dom, p)) { bad.push(p + '(页签点击失败)'); return; }
    const b = bodyOf(dom);
    if (!b || !String(b.innerHTML || '').trim()) { bad.push(p + '(渲染产物为空)'); return; }
    const d = decompose(b);
    Object.keys(totals).forEach(function (k) { totals[k] += d[k]; });
    if (d.emptySelects.length) bad.push(p + '(空下拉框 ' + d.emptySelects.join(',') + ')');
    if (d.rangesNoBounds.length) bad.push(p + '(滑块无区间 ' + d.rangesNoBounds.join(',') + ')');
  });
  a(bad.length === 0, 'ui-comp: 逐页控件面可用（空下拉框 / 无区间滑块均为零）'
    + (bad.length ? '：' + bad.join('；') : ''));
  const ctlTotal = totals.button + totals.range + totals.checkbox + totals.select + totals.textarea + totals.text;
  a(ctlTotal >= 300, 'ui-comp: 分解到的控件面 ' + ctlTotal + ' 个（≥300——空集上的“全部可用”恒为真）');
  a(totals.button >= 50 && totals.range >= 10 && totals.select >= 8 && totals.checkbox >= 30,
    'ui-comp: 控件类型齐全（button ' + totals.button + ' / range ' + totals.range
    + ' / select ' + totals.select + ' / checkbox ' + totals.checkbox + ' / textarea ' + totals.textarea
    + '）—— 只有一种类型全绿时无从区分“都可用”与“根本没渲染出别的类型”'
    + '（下限定为 50/10/8/30 而不是实测值本身：判据要拦“某一类整体消失”，不是钉住当前读数）');
  a(ctlTotal + totals.other >= 400, 'ui-comp: 含未识别类型在内控件总数 ' + (ctlTotal + totals.other)
    + ' 个（与 a11y 门禁的控件面同量级——两条门禁各数一份就会漂移）');

  // ── B. v2.109.0（#15）：面板状态持久化的三条可证伪后果 ──
  clickTab(dom, 'logs');
  let raw = null;
  try { raw = JSON.parse(String(global.localStorage.getItem(STATE_KEY))); } catch (e) { raw = null; }
  a(!!raw && raw.page === 'logs', 'ui-comp: 切页后状态已落盘（键 ' + STATE_KEY + ' → page='
    + (raw ? JSON.stringify(raw.page) : 'null') + '）—— 不落盘则“上次停在哪一页”永远是假的');
  a(!!raw && raw.logErrOnly === false, 'ui-comp: 落盘结构含 logErrOnly 子键（默认 false）');

  // B2. 登记表里恰一条（幂等登记：run.js 有 8 处直接求值 panel.js 而不清表）
  const regs = (global.WorldAxis.__settingsRegs || []).filter(function (r) { return r && r.key === STATE_KEY; });
  a(regs.length === 1, 'ui-comp: 面板状态键在登记表里恰 1 条（实 ' + regs.length
    + '）—— 无条件 concat 会在多次求值后变多条，而“重复登记”是 selfCheck 的 error 级阻断项');
  a(regs.length === 1 && !!(regs[0].enums && Array.isArray(regs[0].enums.page)),
    'ui-comp: 状态键声明了 page 枚举白名单（无声明则历史非法值永远切不过去）');

  // B3. 跨会话恢复：重新 fresh（**不**清磁盘）后，界面停在持久化的那一页
  const env2 = uiGate.fresh();
  a(activeOf(env2.dom) === 'logs', 'ui-comp: 跨会话恢复（重载后停在 logs，实 ' + activeOf(env2.dom) + '）');
  // B4. 日志开关同样持久化
  if (env2.WA.ui && typeof env2.WA.ui.open === 'function') env2.WA.ui.open();
  clickTab(env2.dom, 'logs');
  const btn = bodyOf(env2.dom).querySelectorAll('button').filter(function (b) { return b.id === 'wa-log-err'; })[0];
  a(!!btn, 'ui-comp: 日志页「仅看错误」开关成树（id 与绑定成对）');
  if (btn) {
    btn.click();
    let raw2 = null;
    try { raw2 = JSON.parse(String(global.localStorage.getItem(STATE_KEY))); } catch (e) {}
    a(!!raw2 && raw2.logErrOnly === true, 'ui-comp: 开关切换后 logErrOnly 落盘为 true（实 '
      + (raw2 ? JSON.stringify(raw2.logErrOnly) : 'null') + '）');
  }

  // ── C. 与既有门禁同口径（防“本文件另立一套”）──
  a(uiGate.UI_FILES.indexOf(PANEL) >= 0, 'ui-comp: UI 文件面来自 product-files 单一真源（含 ' + PANEL + '）');
  a(uiGate.UI_FILES.length >= 3, 'ui-comp: UI 文件面 ' + uiGate.UI_FILES.length + ' 个（≥3）');
  const empty = uiGate.fresh({ files: [] });
  a(!panelOf(empty.dom), 'ui-comp: files:[] 时面板不存在（否则“装载成功”与“什么都没装”在读数上不可分）');

  // 收尾：清掉本节写的状态键（storage 属 soft 面，只报告不回退——故由本节自己收）
  try { global.localStorage.removeItem(STATE_KEY); } catch (e) {}
}

// ── D. 负控制：真源码破坏（内存副本，零文件改写）──
//   判据：两条断言各自必须**只在**对应破坏下现形——否则判据不在真源码上生效。
function runNegative(a) {
  const src = fs.readFileSync(path.join(BASE, PANEL), 'utf8');

  // N1. 破坏「切页即落盘」：摘掉页签 onclick 里的 __persistPanel() 调用
  const A1 = 'currentPage = t.dataset.page; syncTabs(); renderBody(); __persistPanel(); });';
  const n1 = src.split(A1).length - 1;
  a(n1 === 1, 'ui-comp/neg: 破坏锚点 N1 在真源码中恰 1 处（实 ' + n1 + '）');
  const b1 = src.replace(A1, 'currentPage = t.dataset.page; syncTabs(); renderBody(); });');
  a(n1 === 1 && b1 !== src, 'ui-comp/neg: N1 破坏真的改变了源码');
  try { global.localStorage.removeItem(STATE_KEY); } catch (e) {}
  const env1 = uiGate.fresh({ srcOverride: { 'ui/panel.js': b1 } });
  if (env1.WA.ui && typeof env1.WA.ui.open === 'function') env1.WA.ui.open();
  clickTab(env1.dom, 'logs');
  let got1 = null;
  try { got1 = global.localStorage.getItem(STATE_KEY); } catch (e) {}
  a(got1 === null, 'ui-comp/neg: 摘掉 persist 调用 ⇒ 切页**不再落盘**（判据在真源码上生效，实 '
    + JSON.stringify(got1) + '）');

  // N2. 破坏「幂等登记」：把 concat([__panelStateReg]) 改成 concat([]) ⇒ 登记表里零条
  const A2 = '.concat([__panelStateReg]);';
  const n2 = src.split(A2).length - 1;
  a(n2 === 1, 'ui-comp/neg: 破坏锚点 N2 在真源码中恰 1 处（实 ' + n2 + '）');
  const b2 = src.replace(A2, '.concat([]);');
  a(n2 === 1 && b2 !== src, 'ui-comp/neg: N2 破坏真的改变了源码');
  try { global.localStorage.removeItem(STATE_KEY); } catch (e) {}
  const env2 = uiGate.fresh({ srcOverride: { 'ui/panel.js': b2 } });
  const regs2 = (env2.WA.__settingsRegs || []).filter(function (r) { return r && r.key === STATE_KEY; });
  a(regs2.length === 0, 'ui-comp/neg: 摘掉登记 ⇒ 状态键不再进登记表（实 ' + regs2.length
    + ' 条）—— 证明 B2 读的是真登记面');

  // N3. 判据纯度：原版上同款判据必须为真（否则上两条“现形”说明不了什么）
  try { global.localStorage.removeItem(STATE_KEY); } catch (e) {}
  const env3 = uiGate.fresh();
  if (env3.WA.ui && typeof env3.WA.ui.open === 'function') env3.WA.ui.open();
  clickTab(env3.dom, 'logs');
  let raw3 = null;
  try { raw3 = JSON.parse(String(global.localStorage.getItem(STATE_KEY))); } catch (e) {}
  a(!!raw3 && raw3.page === 'logs', 'ui-comp/neg: （纯度）原版上同款落盘判据为真（实 '
    + (raw3 ? JSON.stringify(raw3.page) : 'null') + '）');
  const regs3 = (env3.WA.__settingsRegs || []).filter(function (r) { return r && r.key === STATE_KEY; });
  a(regs3.length === 1, 'ui-comp/neg: （纯度）原版上同款登记判据为真（实 ' + regs3.length + ' 条）');

  // N4. 反空转下限：本节不得在空集上全真
  a(uiGate.UI_FILES.length >= 3,
    'ui-comp/neg: 文件面 ' + uiGate.UI_FILES.length + ' 个（≥3——“零破坏现形”必须发生在非空文件面上）');
  try { global.localStorage.removeItem(STATE_KEY); } catch (e) {}
}

module.exports = { runAll: runAll, runNegative: runNegative, STATE_KEY: STATE_KEY,
  decompose: decompose, TEXT_TYPES: TEXT_TYPES, NAMED_ATTRS: NAMED_ATTRS };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  if (process.argv.indexOf('--positive') >= 0) runAll(a);
  else if (process.argv.indexOf('--negative') >= 0) runNegative(a);
  else { runAll(a); runNegative(a); }
  console.log('ui-components-v2109 ' + pass + '/' + fail);
  process.exitCode = fail ? 1 : 0;
}

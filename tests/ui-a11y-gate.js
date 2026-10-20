// WorldAxis tests/ui-a11y-gate.js (v2.109.0) — 插件 UI 可访问性门禁（计划一 #14）
//
// ── 病灶（它治什么）────────────────────────────────────────────────────
//   本仓的 UI 门禁已有两道，但都**不判「控件叫什么」**：
//     · ui-gate-sync.checkPages  —— 判「渲染产物成树」（HTML 里的 button 在树里找得到）
//     · ui-gate-sync.checkClickable —— 判「点一下会不会抛」
//   于是「一个只有 `id="wa-org-qty"`、没有可读名的输入框」在两道门禁下**全绿**：
//   它成树、它可点、不存在抛任何异常。可屏幕阅读器念出来的是「编辑框」——
//   用户根本不知道要填什么。而这不是「少数几个」：实测 453 个控件里 **130 个无可读名**
//   （覆盖率 71.3%），缺口集中在文本输入（104/104 缺）、下拉（8/13 缺）、滑块（13/14 缺）。
//
// ── 判据口径：HTML-AAM 可访问名（accname）的**闭集**子集 ────────────────
//   按 W3C accname 的优先级取第一个非空者：
//     ① aria-labelledby ② aria-label ③ 宿主语言的关联（label[for] / 包裹 label / img[alt] /
//     title / input[type=submit|button|reset][value]）④ 对**文本类控件**的 placeholder
//     ⑤ **内容即名**（仅 button / summary / a 这类元素；`<select>` 的 option 文本是**选项**，
//        不是控件名——把「有 option 文本」当可读名，正是本仓反复治的「读数不实」）
//   明确**不作为**名字的东西（写出来是为了让判据的依据面可核对，不是省略）：
//     · 同父 `<span>` 里的中文提示（`<span>采样上限</span><input type=range>`）——
//       人看得出来，机器读不出。这正是本版要消灭的那一档「看起来有标签」。
//     · 相邻兄弟的纯文本、CSS 伪元素内容、`class` 名。
//
// ── 读数必须打出来（本仓口径）──────────────────────────────────────────
//   「看不见的东西等于不存在」：本门禁的输出是**覆盖率读数**（有名 / 总数）+ **逐条缺口**
//   （页 / 控件类型 / id）。只报一句「覆盖率不足」而不列缺谁，等于让人自己去数。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

/** 文本类 input 的 type 集（placeholder 只对它们算标签）。 */
const TEXT_TYPES = { text: 1, search: 1, tel: 1, url: 1, email: 1, password: 1, number: 1 };
/**
 * v2.109.0（口径自纠）：把控件的 type 归一为**规范语义**。
 *   裸 `<input>`（无 type 属性）在 HTML 里的缺省类型就是 `text` ——
 *   而本仓的 mini-DOM 对裸 input 返回 `el.type === ''`，于是首版判据把它读成
 *   「非文本类控件」⇒ 不给它的 `placeholder` 算名。实测代价：**104 个控件被误判为无能名**，
 *   而它们**全部**带 placeholder（逐个取证：withPh 104 / raw 104）。
 *   被压低的读数与真的缺名在输出上完全同形 —— 这正是本仓反复治的「读数不实」。
 */
const TYPE_ALIAS = { '': 'text', text: 'text', search: 'search', tel: 'tel', url: 'url',
  email: 'email', password: 'password', number: 'number', range: 'range', file: 'file',
  checkbox: 'checkbox', radio: 'radio', submit: 'submit', button: 'button', reset: 'reset',
  hidden: 'hidden', date: 'date', time: 'time', color: 'color' };
/** 归一 type：空串 ⇒ text（规范缺省）；其余小写透传。 */
function normType(el) {
  const raw = String((el && el.type) || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(TYPE_ALIAS, raw) ? TYPE_ALIAS[raw] : raw;
}
/** 「内容即名」的元素（HTML-AAM 里内容会参与名字计算的那几个）。 */
const CONTENT_NAMED = { BUTTON: 1, SUMMARY: 1, A: 1 };
/** 选择器面（与 checkClickable 同宽：判「可交互控件」，不含纯展示节点）。 */
const CONTROL_SEL = 'button,input,select,textarea';
/** 覆盖率下限（写进判据的硬读数，不许被悄悄改小）。 */
const MIN_RATE = 0.85;
/**
 * v2.230.0 收口：折叠钮名里的合成后缀（`ui/panel.js` 一处分词产生）—— **单一常量**，两侧共用。
 *   为什么必须住在文件顶部：`module.exports`（下方）要把本常量导出去，而 `const` 在
 *   求值到它之前处于 TDZ —— 声明写在导出之后会让 `require` 直接抛 ReferenceError
 *   （本版实测踩到）。常量与其导出面同序，就消灭了这一类「位置耦合」。
 */
const FOLD_SUFFIX = ' 折叠或展开';

function attr(el, name) {
  try { return el && el.getAttribute ? el.getAttribute(name) : null; } catch (e) { return null; }
}

/**
 * 取控件的可访问名（按上表口径）。返回 `{ how, name }`；无名为 `{ how: '', name: '' }`。
 *   `how` 是**依据面**：判据报缺口时要能回答「它是靠什么算有名字的」——
 *   只返回布尔值的判据在被推翻时无从复盘（本仓 v2.106.0 的同族教训）。
 */
function accName(el) {
  if (!el) return { how: '', name: '' };
  const lb = attr(el, 'aria-labelledby');
  if (lb && String(lb).trim()) return { how: 'aria-labelledby', name: String(lb).trim() };
  const al = attr(el, 'aria-label');
  if (al && String(al).trim()) return { how: 'aria-label', name: String(al).trim() };
  // 包裹 label（`<label>…<input/>…</label>`）——注意这是**宿主语言**关联，不是同父 span。
  let p = el.parentNode, depth = 0;
  while (p && depth < 12) {
    if (String(p.tagName || '').toLowerCase() === 'label') return { how: 'wrap-label', name: '' };
    p = p.parentNode; depth++;
  }
  const id = el.id;
  if (id && el.ownerDocument && el.ownerDocument.querySelectorAll) {
    let labels = [];
    try { labels = el.ownerDocument.querySelectorAll('label'); } catch (e) { labels = []; }
    for (let i = 0; i < labels.length; i++) {
      if (attr(labels[i], 'for') === id && String(labels[i].textContent || '').trim()) return { how: 'for-label', name: '' };
    }
  }
  const tag = String(el.tagName || '').toUpperCase();
  if (tag === 'IMG') { const a = attr(el, 'alt'); if (a && String(a).trim()) return { how: 'alt', name: String(a).trim() }; }
  const t = attr(el, 'title');
  if (t && String(t).trim()) return { how: 'title', name: String(t).trim() };
  // v2.109.0（口径自纠）：一律走 normType —— `el.type` 在裸 input 上是空串，
  //   直接拿它比 TEXT_TYPES 会把「缺省 text」读成「非文本类」，从而漏掉 placeholder 这条名源。
  const type = normType(el);
  if (tag === 'INPUT' && (type === 'submit' || type === 'button' || type === 'reset')) {
    const v = attr(el, 'value'); if (v && String(v).trim()) return { how: 'value', name: String(v).trim() };
  }
  const ph = attr(el, 'placeholder');
  if (ph && String(ph).trim() && ((tag === 'INPUT' && TEXT_TYPES[type]) || tag === 'TEXTAREA')) {
    return { how: 'placeholder', name: String(ph).trim() };
  }
  if (CONTENT_NAMED[tag] && el.textContent && String(el.textContent).trim()) return { how: 'content', name: String(el.textContent).trim() };
  return { how: '', name: '' };
}

/**
 * v2.230.0 收口：DOM 侧名归类（**与源面同一套归一** —— 两侧各写一遍必然漂移）。
 *   · 合成名（面板折叠钮那一处拼串产生的 `X 折叠或展开`）单独进 `composed`：
 *     它在源面**静态解析不出**，只能作为另一类读（源面合成**站点**数 × DOM 合成**唯一名**数）。
 *   · 其余按归一名进 `names`；同一名字出现多次只算一个（判据要答的是「写没写下」）。
 */
/** 该名是不是折叠钮名（含合成后缀）—— **一处判定**，分桶与计数共用，两处各写一遍必漂。 */
function hasFoldSuffix(raw) { return String(raw == null ? '' : raw).indexOf(FOLD_SUFFIX) >= 0; }
function takeName(name, composed, names) {
  const raw = String(name == null ? '' : name);
  if (hasFoldSuffix(raw)) { composed[normName(raw)] = 1; return; }
  names[normName(raw)] = 1;
}
/**
 * 逐页审计一个已挂载的 UI 环境。
 *   返回 `{ total, named, gaps, rate, byHow, byPage }`。
 *   `env` 来自 `tests/ui-gate-sync.js` 的 `fresh()`（`{ WA, dom }`）。
 *   **纯只读**：只点页签与读 DOM，不写存档、不改设置、不落盘。
 */
/** 被审计模块自己声明的可折叠段数（缺席 ⇒ 0，判据侧据此区分「没登记」与「没渲染」）。 */
function foldSectionCount(WA) {
  try {
    const t = WA && WA.panelFold && WA.panelFold.SECTIONS;
    return Array.isArray(t) ? t.length : 0;
  } catch (e) { return 0; }
}
function audit(env) {
  const WA = env && env.WA, dom = env && env.dom;
  const out = { total: 0, named: 0, gaps: [], byHow: {}, byPage: {}, rate: 0, pages: 0 };
  // v2.230.0 收口：DOM 侧按**归一名**去重（与源面同一套归一，见 normName）。
  //   前一版按「页#id」去重 —— 那个键仍会让**同一个 id 在别的页**重复计入
  //   （实测 189 ≠ 源面 176），且它与源面的计数单位（出现处）本就不同宽。
  //   要立的判据只有一句：「源面写下的名，DOM 上是不是也写下了」⇒ 两侧都按名去重。
  const nameKeys = {};
  const composedKeys = {};
  // v2.230.0 收口：**按出现处**分两个桶。唯一名集合答「写没写下」，出现处数答「写了几处」——
  //   两者不同宽，混着比就是本版那一档「读数不实」。折叠钮每一段渲染一枚，故出现处数
  //   必须与模块自己登记的段数同宽（见 out.foldSections）。
  let staticHits = 0, composedHits = 0;
  if (!WA || !WA.ui || !dom) { out.note = 'UI 未挂载（无法审计）'; return out; }
  const panel = dom.getElementById('wa-panel');
  if (!panel) { out.note = '面板未注入（无法审计）'; return out; }
  const pages = WA.ui.pages();
  out.pages = pages.length;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const tab = panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
    if (!tab) continue;
    tab.click();
    // The persistent header control is outside page bodies; audit it once alongside all page controls.
    if (i === 0) {
      const headControls = panel.querySelectorAll('.wa-head ' + CONTROL_SEL);
      for (let h = 0; h < headControls.length; h++) {
        const c = headControls[h], tag = String(c.tagName || '').toLowerCase();
        const type = normType(c) || tag;
        out.total++;
        const name = accName(c);
        out.byHow[name.how || '(none)'] = (out.byHow[name.how || '(none)'] || 0) + 1;
        if (name.how === 'aria-label') {
          takeName(name.name, composedKeys, nameKeys);
          if (hasFoldSuffix(name.name)) composedHits += 1; else staticHits += 1;
        }
        if (name.how) out.named++;
        else { out.gaps.push({ page: '(面板头部)', kind: tag + '/' + type, id: c.id || '', tag: tag, type: type }); out.byPage['(面板头部)'] = (out.byPage['(面板头部)'] || 0) + 1; }
      }
    }
    const body = panel.querySelector('.wa-body');
    if (!body) continue;
    const ctrls = body.querySelectorAll(CONTROL_SEL);
    for (let j = 0; j < ctrls.length; j++) {
      const c = ctrls[j];
      const tag = String(c.tagName || '').toLowerCase();
      // 归一口径与 accName 内**同一份**（normType）——两处各写一遍 type 语义，
      //   迟早在「裸 input / 未来新增类型」上分叉（本仓的单一真源纪律）。
      const type = normType(c) || tag;
      const kind = tag + '/' + type;
      out.total++;
      const r = accName(c);
      out.byHow[r.how || '(none)'] = (out.byHow[r.how || '(none)'] || 0) + 1;
      if (r.how === 'aria-label') {
        takeName(r.name, composedKeys, nameKeys);
        if (hasFoldSuffix(r.name)) composedHits += 1; else staticHits += 1;
      }
      if (r.how) { out.named++; continue; }
      out.gaps.push({ page: page, kind: kind, id: c.id || '', tag: tag, type: type });
      out.byPage[page] = (out.byPage[page] || 0) + 1;
    }
  }
  out.rate = out.total ? out.named / out.total : 0;
  out.ariaLabelIds = Object.keys(nameKeys).length;          // 静态归一名（唯一）—— 与源面同宽
  out.ariaLabelComposed = Object.keys(composedKeys).length; // 合成归一名（唯一）—— 单独一类
  // v2.230.0 收口：把**名集合本体**一并交出 —— 判据要立的是「两侧是同一批名」，
  //   只给两个计数的话，「两边都数错了」在读数上与「真相等」同形（本仓反复治的那一档）。
  //   集合本体给出后，判据可以逐名对账（多一个/少一个都点得出名字）。
  out.ariaLabelNames = nameKeys;
  out.ariaLabelComposedNames = composedKeys;
  out.ariaLabelStaticHits = staticHits;       // 静态名**出现处**数（与源面 sites-composed 同宽）
  out.ariaLabelComposedHits = composedHits;   // 合成名**出现处**数（每枚折叠钮 1 处）
  // 独立真源：**模块自己登记的**可折叠段数。判据拿它当「该有几枚折叠钮」的事实面 ——
  //   不靠源面文本反推（源面那一处是拼接表达式，静态解析不出段数，只能给出「≥1 处」）。
  out.foldSections = foldSectionCount(WA);
  return out;
}

/** 一次性接线文本（run.js 打印用）。 */
function summary(d) {
  return '可访问性：控件 ' + d.total + ' / 有名 ' + d.named + '（' + (d.rate * 100).toFixed(1) + '%'
    + '，下限 ' + (MIN_RATE * 100) + '%）· 缺口 ' + d.gaps.length
    + (d.gaps.length ? '（' + Object.keys(d.byPage).map(function (p) { return p + '=' + d.byPage[p]; }).join(' ') + '）' : '');
}

module.exports = { accName: accName, audit: audit, summary: summary,
  srcLabelCount: srcLabelCount,
  srcLabelNames: srcLabelNames,
  normName: normName, FOLD_SUFFIX: FOLD_SUFFIX,
  normType: normType, TYPE_ALIAS: TYPE_ALIAS,
  TEXT_TYPES: TEXT_TYPES, CONTENT_NAMED: CONTENT_NAMED, CONTROL_SEL: CONTROL_SEL,
  MIN_RATE: MIN_RATE, BASE: BASE,
  BASIS: 'HTML-AAM accname 闭集：aria-labelledby / aria-label / label[for] / 包裹 label / alt / title / input[value] / placeholder(文本类，裸 input 按规范缺省为 text) / 内容(button,summary,a)' };

/**
 * 源面名源计数：ui 模组源文本里**挂在控件上**的 `aria-label` 出现数。
 *   与 `audit().byHow['aria-label']` 是**两个不同的观察面**（一个数源码文本、一个数渲染后的 DOM），
 *   互为佐证：两处相等，才说明「模板里写了多少」真的到了「树上多少」。
 *   文件面**委托 product-files.uiFiles**（单一真源）—— 本文件不自带第二份 ui 文件清单：
 *   v2.43.0 立过规矩，那份清单每多一份副本，新增 ui/ 模组就在某道门禁里静默不可见。
 *
 *   v2.181.0 收口（输入面必须与结论面同宽）：
 *     原口径数的是**整个源文本**里的 `aria-label`，而 DOM 侧只走 `CONTROL_SEL`
 *     （button/input/select/textarea）—— 于是「把 aria-label 挂在一个非控件容器上」
 *     （v2.181.0 的主题菜单：`role="menu"` 的 div，这是完全合法的 ARIA 用法）
 *     会让源面比 DOM 面多 1，报出的却是「读数自说自话」。
 *     红的是**两个面本来就不同宽**，不是谁读错了。故源面同样只数控件上的名源：
 *     从每个 `aria-label` 出现处向前找最近的 `<`，其标签名在控件集内才计数；
 *     容器/`setAttribute` 形态不计（它们不是控件面，DOM 侧也不数）。
 *     `aria-labelledby` 以 `aria-label` 为前缀，用负向前瞻一次排除，不再做两次 split 相减。
 */
const SRC_CTRL_TAG_RE = /<\s*(button|input|select|textarea)\b/i;
/** 归一名：剥合成后缀 → 反转义 → 截断到 `<` → trim。源面与 DOM 侧**同一套**。 */
function normName(v) {
  let s = String(v == null ? '' : v);
  const i = s.indexOf(FOLD_SUFFIX);
  if (i >= 0) s = s.slice(0, i);
  s = s.split('&lt;').join('<').split(String.fromCharCode(38) + 'quot;').join('"').split('&amp;').join('&');
  s = s.replace(/<.*$/, '');
  return s.trim();
}
/** 该名在源面是**拼接表达式**（静态解析不出）—— 只能作为另一类读。 */
function isComposedLabel(raw) { return /\$\{|' *\+|\+ *'/.test(String(raw == null ? '' : raw)); }
/** 从 `<` 起取**完整标签头**：跳过落在未闭合 `${…}` 里的 `>`（模板表达式里的 `>` 不是标签结束）。 */
function headAt(src, lt, from) {
  for (let k = from; k < src.length && k < from + 600; k++) {
    if (src[k] !== '>') continue;
    const c = src.slice(lt, k);
    if (c.indexOf('<', 1) < 0 && !/\$\{[^}]*$/.test(c)) return c;
  }
  return '';
}
/**
 * 源面名源读数（**归一名集合** —— 与 DOM 侧同宽）：
 *   { sites, names, composed, rawHits }
 *     sites     —— 挂在控件上的 `aria-label` **出现处**数（含合成站点）
 *     names     —— 静态归一名集合（唯一名 → 1）
 *     composed  —— 合成站点数（拼接表达式；它们进不了静态集合，故单独报）
 *     rawHits   —— 原始 `aria-label` 命中数（含挂错元素/容器的，供对账）
 *   文件面**委托 product-files.uiFiles**（单一真源）。
 */
function srcLabelNames(root) {
  const base = root || BASE;
  const out = { sites: 0, names: {}, composed: 0, rawHits: 0 };
  require('./product-files.js').uiFiles(base).forEach(function (rel) {
    let src = '';
    try { src = fs.readFileSync(path.join(base, rel), 'utf8'); } catch (e) { return; }
    const re = /aria-label(?!ledby)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      out.rawHits += 1;
      const lt = src.lastIndexOf('<', m.index);
      if (lt < 0) continue;
      const head = headAt(src, lt, m.index);
      if (!head) continue;                       // 跨标签 / 取不到头 ⇒ 不猜
      if (!SRC_CTRL_TAG_RE.test(head)) continue; // 容器/非控件：DOM 侧也不数
      out.sites += 1;
      const ma = /aria-label="([^"]*)"/.exec(src.slice(m.index, m.index + 300));
      const raw = ma ? ma[1] : '';
      if (isComposedLabel(raw)) out.composed += 1;
      else out.names[normName(raw)] = 1;
    }
  });
  return out;
}
/**
 * 源面名源**出现处**计数（保留：`sites` 答「模板里挂了几处」，与「写下了几个名字」不同）。
 *   v2.230.0 收口沿革：窗口原为「`<` 起 40 字符」，现场有 12 处标签头比它长
 *   （如 `<button class="wa-btn wa-mini" id="wa-fg-tension" aria-label="…">`），
 *   那些名从未进入取值面；又有一处名的标签头里 `>` 落在 `${…}` 内会被**朴素窗口截断**
 *   （实测 /tmp/probe_x16.js：朴素 176 / 模板感知 177）。两处都已按完整标签头订正。
 */
function srcLabelCount(root) {
  return srcLabelNames(root).sites;
}

if (require.main === module) {
  require('./mock.js');
  const gate = require('./ui-gate-sync.js');
  const argv = process.argv.slice(2);
  const d = audit(gate.fresh({}));
  console.log('■ UI 可访问性门禁（HTML-AAM accname 闭集）');
  console.log('  ' + summary(d));
  console.log('  · 命名来源分布：' + Object.keys(d.byHow).sort().map(function (k) { return k + '=' + d.byHow[k]; }).join(' '));
  if (argv.indexOf('--json') >= 0) { console.log(JSON.stringify(d, null, 1)); process.exit(0); }
  if (d.gaps.length) {
    console.log('  ✗ 无可访问名控件（' + d.gaps.length + '）：');
    d.gaps.slice(0, 60).forEach(function (g) {
      console.log('    · ' + g.page + ' ' + g.kind + (g.id ? ' #' + g.id : '（无 id）'));
    });
    if (d.gaps.length > 60) console.log('    …（共 ' + d.gaps.length + '，完整清单用 --json）');
  }
  process.exit(d.rate >= MIN_RATE ? 0 : 1);
}

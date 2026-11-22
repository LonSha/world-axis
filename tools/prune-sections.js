#!/usr/bin/env node
// WorldAxis tools/prune-sections.js — 分层选区的**真省时**裁剪器（O6，v2.187.0）
//
// ── 它治的病（现场实证，v2.187.0 本轮扫描）────────────────────────────
//   选区入口（`tests/run.js --only-v-section`）此前只做了一件事：`section()` 提前返回。
//   于是**没被选中的节，节体语句仍然逐条执行、断言仍然计数** —— 省下的只有打印，
//   不是时间。这叫「假分层」：读数说「跳过 N 节」，机器上那 N 节的活一点没少干。
//   本仓对同类事情的规矩是现成的（`算不出来不得当作算过`）：**跳过必须真的不执行，
//   否则不许说跳过**。
//
// ── 本办法：把未选中节的节体从源码里拿掉 ──────────────────────────────
//   扫 `tests/run.js`，对每个 `section('…')` 调用点取节体：
//     · **块形态**（`section(…);` 之后是 `{ … }`）：未选中 ⇒ **整块换成一行占位**。
//       词法作用域自洽（块内 const/let/function 不出块）⇒ 删除不可能影响块外。
//     · **裸语句形态**（节体是散落语句、无块包装）：**只标不裁**（调用点注释掉、节体保留）。
//       凭什么不裁：它的语句可能给**后面的节**留夹具（现场就有：`core/store` 节的
//       `WA.store.init()` 后面好几节都在用同一份 store）。裁它省不了多少，
//       却能把「选了 A 节」变成「A 节在缺夹具的世界里跑」——那是假绿制造机。
//   两种形态都**逐条列名**，裁了多少行、剩多少行都写进读数。
//
// ── 兜底：裁剪结果必须能过 `node --check` ────────────────────────────
//   括号扫描器**不是 JS 解析器**（现场自证：用它算 `tests/run.js` 的净深度得 **15**，
//   不是 0 —— 模板串 `${}` 与正则里的括号会把它带偏）。所以「配平」只当**候选**，
//   真判据是 `node --check <裁剪版>`：**不通过就拒裁**（exit 2），绝不把破源码写出去。
//   这条与仓里「破坏必须可观测」同规：要么有证据，要么报错，不许猜。
//
// ── 用法 ──────────────────────────────────────────────────────────────
//   node tools/prune-sections.js --sel '<节名子串>'            # dry-run：报统计
//   node tools/prune-sections.js --sel '<子串>' --out f.js     # 落盘裁剪版（默认 tests/_pruned-run.js）
//   node tools/prune-sections.js --self-test                   # 合成源真执行自证
//   node tools/prune-sections.js --sel '<子串>' --run          # 落盘 → --check → 执行 → 清理
//
// ── 边界（如实登记）──────────────────────────────────────────────────
//   · 只读 `tests/run.js`，只写你指定的 `--out`（默认路径带 `_` 前缀，且已在 `.gitignore`）。
//   · 「省了多少秒」不由本工具承诺：裁剪只保证**那些行真的不执行**；耗时归 `slow-sections.js` 归集。
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const RUN = path.join(ROOT, 'tests', 'run.js');
const DEFAULT_OUT = path.join(ROOT, 'tests', '_pruned-run.js');
// v2.213.0（Q4）：wrap 模式注入的运行期哨兵定义。**内联常量而非独立文件** ——
// 门禁的负控制会把本文件拷到 /tmp 独立执行（无邻居文件），头部 require 会让
// 破坏副本在加载期即崩，负控制三判据（D12/N4b/N4c）全部失真。哨兵单一真源
// 就是本常量；它引用**注入目标**（裁剪版 run.js）模块级绑定的 __layerOn /
// __layerVerdict（与 tools/test-layers.js 的 select() 同源裁定）。
const SENTINEL_NL = String.fromCharCode(10);   // 不用字面换行转义：补丁管道的转义坑防呆
const SENTINEL_SRC = '// [O6 Q4 运行期哨兵] 由 tools/prune-sections.js 注入（契约对齐 tools/layer-guard.js）' + SENTINEL_NL
  + '//   全量路径（无选区）恒真 ⇒ 节体照跑；定向路径未选中节体真不执行。' + SENTINEL_NL
  + 'const guardRun = function (t) { return !__layerOn || __layerVerdict(t) === \'run\'; };' + SENTINEL_NL
  + 'const __origAssert = assert;' + SENTINEL_NL
  + 'assert = function (cond, name, extra) {' + SENTINEL_NL
  + '  if (cond) { __origAssert(true, name, extra); return; }' + SENTINEL_NL
  + '  const __sec = (typeof __ctxRing !== \'undefined\' && __ctxRing.section) || \'?\';' + SENTINEL_NL
  + '  const __v = __layerOn ? __layerVerdict(__sec) : \'run\';' + SENTINEL_NL
  + '  if (__v !== \'run\') { console.log(\'  - \' + name + \'  (silent: unselected section assert) \'); return; }' + SENTINEL_NL
  + '  __origAssert(false, name, extra);' + SENTINEL_NL
  + '};' + SENTINEL_NL
  + 'const __origSection = section;' + SENTINEL_NL
  + 'section = function (t) {' + SENTINEL_NL
  + '  const __v2 = __layerOn ? __layerVerdict(t) : \'run\';' + SENTINEL_NL
  + '  if (__v2 !== \'run\') { if (typeof __ctxRing !== \'undefined\') __ctxRing.section = String(t); }' + SENTINEL_NL
  + '  return __origSection(t);' + SENTINEL_NL
  + '};';
/** JS 感知的逐行花括号净增量（跳过行注释 / 块注释 / 三种字符串 / 模板串 / **正则字面量**）。
 *  **只作候选**：它不是解析器，真判据在 `check()` 的 node --check（切不中时由 `pruneSafe` 自动降级）。
 *
 *  正则字面量判据（v2.187.0 本轮补）：`/` 到底是「正则开始」还是「除法」，按**它前面最后一个
 *  有意义字符**判 —— 是 `( , = : [ ! & | ? { } ; + - * % ~ ^ < >` 之一（或行首无此字符）就当正则。
 *  为什么非补不可：现场第 9960 行 `(order2500.match(/'([^']+\.js)'/g) || [])` ——
 *  没这条判据时，扫描器把 `/` 当除法、接着把 `'([^']+'` 当单引号串，于是
 *  `function (x) {` 的 `{` 落进「串里」被吞、而配对的 `}` 照算 ⇒ 该行净增量 **-1**，
 *  整个扫描自此错位一行，把这一节的块尾判定提前到了 9960（删它就把文件切成两半）。
 *  这条判据的收益是「少踩坑」，**不是**「不必兜底」——兜底仍在 `pruneSafe`。 */
function braceDelta(lines) {
  const out = [];
  let inBlock = false;
  for (const line of lines) {
    let d = 0, i = 0, inS = null, inTpl = false, lastSig = null;
    while (i < line.length) {
      const ch = line[i], nx = line[i + 1];
      if (inBlock) {
        if (ch === '*' && nx === '/') { inBlock = false; i += 2; continue; }
        i += 1; continue;
      }
      if (inS) {
        if (ch === '\\') { i += 2; continue; }
        if (ch === inS) inS = null;
        i += 1; continue;
      }
      if (inTpl) {
        if (ch === '\\') { i += 2; continue; }
        if (ch === '`') inTpl = false;
        i += 1; continue;
      }
      if (ch === '/' && nx === '/') break;
      if (ch === '/' && nx === '*') { inBlock = true; i += 2; continue; }
      if (ch === '/') {
        // 正则 or 除法：看前一个有意义字符
        const asRegex = (lastSig === null) || '([{,;:=!&|?+-*%~^<>'.indexOf(lastSig) >= 0;
        if (asRegex) {
          i += 1;
          while (i < line.length) {
            if (line[i] === '\\') { i += 2; continue; }
            if (line[i] === '/') { i += 1; break; }
            i += 1;
          }
          while (i < line.length && /[a-z]/i.test(line[i])) i += 1;   // flags
          lastSig = '/';
          continue;
        }
        lastSig = '/'; i += 1; continue;
      }
      if (ch === '"' || ch === "'") { inS = ch; i += 1; continue; }
      if (ch === '`') { inTpl = true; i += 1; continue; }
      if (ch === '{') { d += 1; lastSig = '{'; i += 1; continue; }
      if (ch === '}') { d -= 1; lastSig = '}'; i += 1; continue; }
      if (ch !== ' ' && ch !== '\t') lastSig = ch;
      i += 1;
    }
    out.push(d);
  }
  return out;
}

/** 该行是不是 wrap 注入的运行期哨兵（v2.253.0：scan 复扫裁剪产物时要用）。
 *  只认本工具 SENTINEL_SRC 里那一行注释里的固定前缀。 */
function wrapSentinel(lines, j, next) {
  return j < next && j + 1 < next && lines[j].indexOf('// [O6 Q4 运行期哨兵') >= 0;
}
/** 扫描节：name / 调用行号 / 节体范围 / 形态 / 可否裁剪候选。 */
function scan(src) {
  const lines = src.split('\n');
  const delta = braceDelta(lines);
  const marks = [];
  lines.forEach(function (l, i) {
    // v2.213.0（Q4 第二刀）：与 tools/test-layers.js 的 analyze() 同步收 0/2 空格形态
    //   （真源 L21080 顶格 v2.146.0）。两处正则必须一字不差（单一真源，o6 门禁钉对齐）。
    const m = l.match(/^ {0,2}section\((['\"])(.*)\1\);\s*$/);
    // v2.253.0：**跳过 wrap 哨兵行**。裁剪版（以及本锁自身的 D 段在 wrap 产物上复扫）里，
    //   section 行之后紧跟一行 `  if (guardRun("…")) {   // [O6 Q4 运行期哨兵] …`。
    //   旧扫描只允许「首非空行 === `{`」，于是哨兵一插，块形态全部认不出 ——
    //   实测块节从 100+ 塌到 2，D3（可裁块节 ≥100）红。真源不受影响（无哨兵），
    //   所以这条只在「扫裁剪产物」时现形；D 段现在两处都扫，一并治掉。
    if (m) marks.push({ line: i, name: m[2] });
  });
  return marks.map(function (mk, k) {
    const next = (k + 1 < marks.length) ? marks[k + 1].line : lines.length;
    let j = mk.line + 1;
    while (j < next && lines[j].trim() === '') j += 1;
    //   （哨兵行只可能位于节体**首行**，故「剥首行」只需一次判断，不必循环）
    //   v2.253.0 第二刀：节体在 wrap 里被**多缩进 2 空格**（`｛` 从 `  {` 变成 `    {`），
    //   所以剥掉哨兵后还要按哨兵行的缩进把首行归一 —— 否则「是不是块形态」永远看不到 `{`。
    //   归一方式：只把该行多余的**前导空格**剥到与 section 行同级（不碰行内内容）。
    if (wrapSentinel(lines, j, next)) {
      j += 1;
      while (j < next && lines[j].trim() === '') j += 1;
      if (j < next) lines[j] = lines[j].replace(/^\s+/, '  ');
    }
    const blockForm = (j < next && lines[j].trim() === '{');
    let close = null;
    if (blockForm) {
      let run = 0;
      for (let t = j; t < next; t++) {
        run += delta[t];
        if (run === 0) { close = t; break; }
      }
    }
    const block = (blockForm && close !== null);
    // ── 嵌套块判据（v2.187.0 本轮现场踩到）──────────────────────────────
    //   候选闭合行的**下一非空行若是裸 `}`**（例如 `  } // end v2.4.0 block`），说明这一节
    //   的 `{…}` 是**嵌在旧版块里的内层块**：删它只会拆掉内层，外层那个 `}` 当场多出来。
    //   现场两例（本文件 9915 与 13236 行）：前者删掉后报语法错，后者删掉后吞了 10 个外层 `}`。
    //   形态上无从分辨（两处都是规规矩矩的 `{` … `}`），所以判据必须写在**边界之后的那一行**，
    //   而不是块自己身上。
    let nested = false;
    if (block) {
      let t = close + 1;
      while (t < next && lines[t].trim() === '') t += 1;
      nested = (t < next && lines[t].trim().indexOf('}') === 0);
    }
    // v2.253.0 第三刀：wrap 产物上 `nested` 必然误判。理由：哨兵给**每个被包裹的节**
    //   都在节体末尾补了一行 `  }` 收 if，于是「闭行之后首非空行以 `}` 开头」恒成立
    //   ⇒ 好端端的顶层块被读成内层块 ⇒ block 恒假（实测块节 100+ → 2，D3 红）。
    //   真源没有哨兵，判据在真源上照旧有效；只在本节**确实带哨兵**时才跳过 nested。
    const wrapped = wrapSentinel(lines, mk.line + 1, next);
    if (wrapped) nested = false;
    const usable = (block && !nested);
    return {
      name: mk.name, line: mk.line, openLine: j, closeLine: close,
      nextLine: next, blockForm: blockForm, block: usable, nested: nested,
      sentinel: wrapped,
      bodyLines: usable ? (close - j + 1) : (next - mk.line - 1)
    };
  });
}

/** 生成裁剪版源码。返回 { text, kept, omitted, marked, wrapped, stats }。
 *  · needles 命中的节：原样保留（它跑它原来的全部判据）；
 *  · 未命中且**可裁块**（顶层块，不含 9815/13236 那两处内层块）：整块 → 一行占位（**节体不执行**）；
 *  · 未命中且裸语句 / 内层块：调用点 → 注释（**如实声明：节体仍执行，本形态省时为 0**）；
 *  · v2.213.0（Q4 · mode:'wrap'）：未命中节（块与裸语句统一）节体**逐字保留**（缩进 +2），
 *    外包 `if (guardRun('名')) { … }` —— 运行期哨兵（tools/layer-guard.js 同源裁定）。
 *    全量路径 guardRun 恒真（节体照跑，语义逐字不变）；定向路径未选中节体真不执行。
 *    这是 90 裸节 / 9145 行「照跑致 OOM」的治法：不动 selfContained 判定（那是「能否独跑」
 *    的事），只把「未选中 ⇒ 不执行」交给运行期 —— 与 section() 的裁定同源，无第二真源。 */
function prune(src, needles, opt) {
  const wrap = opt && opt.mode === 'wrap';
  const ns = (needles || []).map(String);
  const fob = (opt && opt.forbid) ? opt.forbid : [];
  const lines = src.split('\n');
  const secs = scan(src);
  // v2.213.0（Q4 第三刀）：wrap 审计用的逐行括号净增（与 scan 同源算法，勿两处漂移）
  const bd = braceDelta(lines);
  // v2.213.0（Q4 第五刀）：跨节配对解析 —— 悬空 {/} 的开闭两端必须**同时**注释化。
  //   只注释一端 = 另一端悬空：多余 { 会吞掉后续结构（IIFE 收尾被吞）、多余 } 提前
  //   闭合外层块（语法崩）。配对规则：逐节扫 prefix 深度，出现未配对 { 记入 pending；
  //   遇到回零/负深度的 } 从 pending 弹出配对。配对两端节强制入 wrapUnsafe 集合
  //   （任一端为选中节 ⇒ 整趟拒裁：选中节不可被注释）。
  const crossPairs = [];   // { openerSec, closerSec }
  const forcedWrapUnsafe = {};
  if (wrap) {
    const pending = [];   // { sec, depthAtOpen }
    secs.forEach(function (s) {
      const be = s.block ? (s.closeLine + 1) : s.nextLine;
      let d = 0;
      for (let x = s.line + 1; x < be; x++) {
        d += bd[x];
        while (d < 0 && pending.length) {
          const p = pending.pop();
          crossPairs.push({ openerSec: p.sec, closerSec: s.name });
          d += 1;   // 这个 } 用于配对
        }
        if (d > 0 && String(lines[x]).replace(/^\\s+/, '').indexOf('v') === 0 && /:$/.test(String(lines[x]).trim().replace(/\\s*\\{\\s*$/, ''))) {
          // 行形如 `vNNN: {` —— label 块开头，记入 pending
          pending.push({ sec: s.name, d: d });
        }
      }
      // 节尾仍 net>0：整个节的未配对开括号记 pending（保守：整节记一次）
      if (d > 0) pending.push({ sec: s.name, d: d });
    });
    crossPairs.forEach(function (pr) {
      forcedWrapUnsafe[pr.openerSec] = true;
      forcedWrapUnsafe[pr.closerSec] = true;
      // 任一端是选中节 ⇒ 拒裁（宁可全量跑，不可破坏选中节）
      if (ns.some(function (n) { return pr.openerSec.indexOf(n) >= 0 || pr.closerSec.indexOf(n) >= 0; })) {
        throw new Error('wrap 拒裁：跨节结构「' + pr.openerSec.slice(0, 20) + ' → ' + pr.closerSec.slice(0, 20) + '」一端被选中，两端必须同时注释化');
      }
    });
  }
  const kept = [], omitted = [], marked = [], wrapped = [];
  // 从后往前替换，行号不漂
  for (let k = secs.length - 1; k >= 0; k--) {
    const s = secs[k];
    const hit = ns.some(function (n) { return s.name.indexOf(n) >= 0; });
    if (hit) { kept.unshift(s.name); continue; }
    // v2.213.0（Q4）：wrap 模式 —— 未选中节（块与裸语句统一）if 包裹，运行期哨兵裁定。
    //   节体逐字保留（只加缩进），不管它是块形态还是裸语句形态、内层块还是夹具提供者：
    //   裁定交给运行期同源 select()，裁剪期不再做第二份形态判定。
    if (wrap) {
      // ── v2.253.0：**二次裁剪幂等**。现场病灶（o6 门禁在回归沙箱里跑 D 段时抛
      //   「wrap 哨兵对账失败：期望 79，输出实有 332」）：沙箱的 work 副本里 tests/run.js
      //   本身**已经是 wrap 产物**，D 段又对它 prune 一次 ⇒ 已带哨兵的节被当成未选中，
      //   再包一层、再插一个哨兵（253 + 79 = 332），而对账只数 wrapped（79）。
      //   治法：本节已带哨兵就整节跳过（哨兵已经在做同一件事，重复包只是加深缩进）。
      //   注意判定用 s.sentinel（scan 现场读的），不用「名字在不在 ns 里」——
      //   带哨兵的节也可能被这次选中，那种情况下面 `hit` 分支已先行 continue。
      if (s.sentinel) continue;
      // ── v2.213.0（Q4 第三刀）：可包裹审计（真实 E2E 破案后的治法）────────
      //   病灶链（/tmp/worldaxis-regression-96thh9 现场还原）：v0.2.2 节体以
      //   `v0220: {` label 块开头、其闭合 `}` 落在下一节体内 —— **跨节结构**。
      //   wrap 在节边界插 `}` 只闭合了 label，后续节的 section() 调用行被吞进
      //   未选中节的 if 体 ⇒ guardRun=false ⇒ 整段不执行（日志 v0.2.2 后直接
      //   跳 v2.27.0、116 节标题消失）。判据（真源实测 262 节里 12 节踩中）：
      //     ① 节体净括号变化 ≠ 0（label/块跨界）⇒ 只标不包；
      //     ② 节体前缀深度下探 <0（体内多余 `}` 先闭）⇒ 只标不包；
      //     ③ 最后一节（尾部汇总段边界）⇒ 只标不包（既有防御）。
      //   只标不包 = 如实声明「该节体仍执行」，不静默吞结构。
      if (k === secs.length - 1) {
        // v2.213.0（Q4 第四刀·B 方案）：最后一节体延伸到文件尾（含 buildOutcome
        //   收尾 + async IIFE 闭合），不可包裹不可注释。只标记（如实：体照跑，
        //   断言失败由 assert 静默贴片接管；收尾段本就必须执行）。
        marked.unshift({ name: s.name, lines: s.bodyLines, nested: !!s.nested, forbidden: false,
          tailSection: true });
        continue;
      }
      // 审计：净变化 + 前缀深度（用仓库自带 braceDelta，正则/模板串感知）
      const bodyEnd = s.block ? (s.closeLine + 1) : s.nextLine;
      let net = 0, pre = 0, minPre = 0;
      for (let b = s.line + 1; b < bodyEnd; b++) {
        net += bd[b]; pre += bd[b]; if (pre < minPre) minPre = pre;
      }
      if (net !== 0 || minPre < 0 || forcedWrapUnsafe[s.name]) {
        // v2.213.0（Q4 第四刀·B 方案）：wrapUnsafe 节**只标不包不注释** —— 节体照跑
        //   （夹具供后续节），其断言失败由「哨兵标位 + assert 静默」贴片接管（见
        //   SENTINEL_SRC 中的 assertPatch）：未选中节体内的 assert 失败不计入
        //   failures（打印但静默），治「缺夹具世界假红」，不破结构。
        marked.unshift({ name: s.name, lines: s.bodyLines, nested: !!s.nested, forbidden: false,
          wrapUnsafe: (net !== 0 ? 'net' + (net > 0 ? '+' : '') + net : 'pre' + minPre) });
        continue;
      }
      const body = lines.slice(s.line + 1, bodyEnd);
      const indented = body.map(function (l) { return l === '' ? '' : '  ' + l; });
      indented.forEach(function (l, idx) { lines[s.line + 1 + idx] = l; });
      lines.splice(s.line + 1, 0,
        "  if (guardRun(" + JSON.stringify(s.name) + ")) {   // [O6 Q4 运行期哨兵] 未选中 ⇒ 节体不执行");
      lines.splice(s.line + 2 + indented.length, 0, "  }");
      wrapped.unshift({ name: s.name, lines: body.length });
      // v2.213.0（Q4 第五刀）：间隙审计 —— 块节 closeLine 之后到下一节调用行之间的
      //   间隙行不属于任何节体（例：v2.1.0 块5 的 `}` 后、v2.2.0 块1 调用行前有
      //   `v2200: {` 跨节 label 的开头 + 其夹具）。label 开在间隙、闭在后续节体内
      //   = 开闭分离：若闭端节被注释化则语法崩；若被包裹则 wrap 的 `}` 错位闭 label。
      //   判据：间隙净括号 ≠ 0 ⇒ 间隙整段注释化（跨节结构彻底拆除，深度回归统一）。
      continue;
    }
    const usable = s.block && fob.indexOf(s.name) < 0;
    if (usable) {
      const placeholder = "  section('" + s.name + "');"
        + "  // [O6 裁剪] 未被 --only-v-section 选中：节体已省略（" + s.bodyLines + " 行不执行）";
      lines.splice(s.line, s.closeLine - s.line + 1, placeholder);
      omitted.unshift({ name: s.name, lines: s.bodyLines });
    } else {
      const why = fob.indexOf(s.name) >= 0
        ? '块边界未过语法自证（单独删它会崩，故降级为只标不裁）'
        : (s.nested
          ? '内层块（嵌在旧版块里，删它会拆出多余的 `}`）'
          : '裸语句节体（它可能给后面的节留夹具）');
      lines.splice(s.line, 1, "  // [O6 裁剪·只标不裁] section('" + s.name + "')"
        + "  —— " + why + '，故保留（如实：这些行仍执行）');
      marked.unshift({ name: s.name, lines: s.bodyLines, nested: !!s.nested, forbidden: fob.indexOf(s.name) >= 0 });
    }
  }
  // v2.213.0（Q4）：wrap 模式注入哨兵定义 —— guardRun 引用**模块内**的 __layerOn /
  //   __layerVerdict（run.js 模块级绑定），同源裁定；全量路径恒真。
  if (wrap && wrapped.length) {
    const first = secs.length ? secs[0].line : 0;
    // v2.253.0：源里已有哨兵定义就不再插第二份（二次裁剪幂等）
    if (src.indexOf('const guardRun = function (t)') < 0) lines.splice(first, 0, SENTINEL_SRC);
  }
  // ── v2.213.0（Q4 第三刀·出厂自检·形态锁定 v3）──────────────────
  //   深度比对依赖 braceDelta，而 braceDelta 对 run.js 有累计误差（头注自述净深度
  //   15 ≠ 0：模板串与正则字面量干扰）。真判据改为形态锁定：
  //   每个 section 调用行后的首个非空行，必须是 ① if (guardRun( ② // [wrapUnsafe
  //   注释化行 ③ 原版该节 body 首非空行（选中节/间隙）。其他任何形态（如下一节
  //   的 section 行）= 吞节错位 ⇒ 抛（拒裁）。另对账：哨兵行数 == wrapped 数。
  if (wrap && wrapped.length) {
    const outLines = lines;
    const origLines = src.split('\n');
    const origFirst = {};
    secs.forEach(function (s2) {
      const be2 = s2.block ? (s2.closeLine + 1) : s2.nextLine;
      let fnb = '';
      for (let x = s2.line + 1; x < be2; x++) { if (origLines[x].trim() !== '') { fnb = String(origLines[x]); break; } }
      origFirst[s2.name] = fnb;
    });
    let guardCount = 0;
    outLines.forEach(function (l, i) {
      const m2 = l.match(/^ {0,2}section\((['"])(.*)\1\);\s*$/);
      if (!m2) return;
      let j2 = i + 1;
      while (j2 < outLines.length && outLines[j2].trim() === '') j2 += 1;
      const nextNB = j2 < outLines.length ? String(outLines[j2]) : '';
      if (nextNB.indexOf('if (guardRun(') >= 0) {
        // v2.253.0：二次裁剪时源里本来就有哨兵 —— 它们同样算数（不计校验会恒抛）
        guardCount += 1; return;
      }
      if (nextNB.indexOf('// [wrapUnsafe') === 0) return;
      const exp = origFirst[m2[2]];
      if (exp !== '' && nextNB.trim() === exp.trim()) return;
      throw new Error('wrap 形态锁定被破坏（拒裁）：节「' + String(m2[2]).slice(0, 30)
        + '」后的首非空行既非哨兵/注释化，也非原版首行：' + nextNB.slice(0, 60));
    });
    // v2.253.0：期望值含**本次新包**与**源里已有**两类（二次裁剪时后者占大头）。
    //   计数口径与上面 guardCount 对称：凡「节后紧跟哨兵」的节都算一个。
    if (guardCount !== wrapped.length + secs.filter(function (s) { return s.sentinel; }).length) {
      throw new Error('wrap 哨兵对账失败（拒裁）：期望 '
        + (wrapped.length + secs.filter(function (s) { return s.sentinel; }).length)
        + ' 个哨兵（新包 ' + wrapped.length + ' + 源中已有 ' + secs.filter(function (s) { return s.sentinel; }).length
        + '），输出实有 ' + guardCount);
    }
  }
  return {
    text: lines.join('\n'),
    kept: kept, omitted: omitted, marked: marked, wrapped: wrapped,
    stats: {
      selected: kept.length, omittedCount: omitted.length,
      omittedLines: omitted.reduce(function (a, o) { return a + o.lines; }, 0),
      markedCount: marked.length,
      markedNested: marked.filter(function (m) { return m.nested; }).length,
      markedForbidden: marked.filter(function (m) { return m.forbidden; }).length,
      markedLines: marked.reduce(function (a, o) { return a + o.lines; }, 0),
      // v2.213.0（Q4 第三刀）：wrapUnsafe = 净括号≠0/前缀下探而降级为只标不包的节数
      wrapUnsafe: marked.filter(function (m) { return !!m.wrapUnsafe; }).length,
      wrappedCount: wrapped.length,
      wrappedLines: wrapped.reduce(function (w, o) { return w + o.lines; }, 0),
      srcLines: src.split('\n').length, outLines: lines.length
    }
  };
}

/** 硬兜底：裁剪版必须能被 Node 解析。不通过 ⇒ 抛（调用方须拒裁，不得写出去）。 */
function check(file) {
  const r = cp.spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error('裁剪版未通过 node --check（拒裁）: ' + String(r.stderr || '').split('\n').slice(0, 4).join(' / '));
  }
  return true;
}

/** 只删这一个节 → 语法自证。用于定位「块边界切错了」的节（扫描器的候选边界不等于真边界）。 */
function probeOne(src, sec, tmpFile) {
  const lines = src.split('\n');
  lines.splice(sec.line, sec.closeLine - sec.line + 1, "  section('" + sec.name + "');");
  fs.writeFileSync(tmpFile, lines.join('\n'));
  return cp.spawnSync(process.execPath, ['--check', tmpFile], { encoding: 'utf8' }).status === 0;
}

/** 带降级的裁剪：**切不中就退，绝不把破源码交出去**。
 *  口径（三层，逐层兜底）：
 *    ① 先按候选边界全裁，过 `node --check` 就收工（常态：136 个块只有个位数切不准）；
 *    ② 不过 ⇒ 逐个候选**单独试删**，把「删了会语法崩」的节挑出来，降级为只标不裁，重建；
 *    ③ 再不过 ⇒ 抛（拒裁）。**没有第四步「硬写」**。
 *  为什么值得这样麻烦：物理裁剪是本仓第一次「按行改自己的运行器」，而扫描器不是解析器。
 *  把真判据交给 `node --check`、把形态判据留给扫描器当候选，两者分工 —— 这条分工本身
 *  就是本工具存在的意义（见 `--self-test` 里「形态自证」那两条）。 */
function pruneSafe(src, needles, opt) {
  const ns = (needles || []).map(String);
  const secs = scan(src);
  const cand = secs.filter(function (s) {
    return s.block && !ns.some(function (n) { return s.name.indexOf(n) >= 0; });
  });
  const tmpFile = path.join(require('os').tmpdir(), 'wa-prune-probe-' + process.pid + '.js');
  let forbid = [];
  let r = null, degraded = [];
  try {
    for (let round = 0; round < 3; round++) {
      r = prune(src, ns, { forbid: forbid });
      fs.writeFileSync(tmpFile, r.text);
      let ok = true;
      try { check(tmpFile); } catch (e) { ok = false; }
      if (ok) { try { fs.unlinkSync(tmpFile); } catch (e2) { /* 已删 */ } return { r: r, degraded: degraded }; }
      if (round === 2) break;
      // 定位坏节：只在本轮仍被裁的候选里找
      const still = cand.filter(function (s) { return forbid.indexOf(s.name) < 0; });
      let found = 0;
      still.forEach(function (s) {
        if (!probeOne(src, s, tmpFile)) { forbid.push(s.name); degraded.push(s.name); found += 1; }
      });
      if (!found) break;   // 找不到坏节却仍不过 ⇒ 不是「单节边界」问题，越界交给外层抛
    }
    try { fs.unlinkSync(tmpFile); } catch (e2) { /* 已删 */ }
    if (r) { fs.writeFileSync(tmpFile, r.text); check(tmpFile); }
    try { fs.unlinkSync(tmpFile); } catch (e2) { /* 已删 */ }
    return { r: r, degraded: degraded };
  } catch (e) {
    try { fs.unlinkSync(tmpFile); } catch (e2) { /* 已删 */ }
    throw e;
  }
}

// ── 自证：合成源真执行（不只看函数返回值）────────────────────────────
/** 造一个三节合成源并在真 Node 里跑，用**副作用探针**证明「未选中 ⇒ 真不执行」。
 *  探针口径（挑剔的那一面）：
 *    ① 选中节 B 的判据必须真跑（它的副作用文件出现）；
 *    ② 未选中且块形态的 A、C 的副作用文件**必须不出现**（不是「没打印」，是文件没有）；
 *    ③ 裸语句形态的 D：调用点被注释（打印里没有它的名字）但**节体照执行** —— 这条也要证，
 *       否则「只标不裁」就是一句没人核过的话。 */
function selfTest() {
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-prune-selftest-'));
  const probe = function (n) { return "require('fs').writeFileSync(" + JSON.stringify(path.join(dir, 'hit_' + n)) + ", '1');"; };
  const src = [
    "'use strict';",
    "function section(t) { console.log('\\u25a0 ' + t); }",
    "let n = 0;",
    // 形态必须与**真源**一致（两空格缩进的独立节行）——第一次写自证就栽在这儿：
    // 合成源顶格写 section(...)，`^  section\(` 一条都不中，prune 于是「一节未裁」，
    // 四条判据同时红。教训：自证的合成源要抄真源的**形态**，不只抄语义；
    // 并把「扫描器认出了几个节」本身当成一条判据（见下面 checks 的第一条）。
    "  section('A 未选中·块形态');",
    "{",
    "  " + probe('A'),
    "  n += 1;",
    "}",
    "  section('B 选中·块形态');",
    "{",
    "  " + probe('B'),
    "  n += 10;  // 选中节必须真跑：n 只可能来自这里",
    "}",
    "  section('C 未选中·块形态');",
    "{",
    "  " + probe('C'),
    "  n += 100;",
    "}",
    "  section('D 未选中·裸语句');",
    "  " + probe('D'),
    "console.log('N=' + n);"
  ].join('\n');

  const r = prune(src, ['B 选中']);
  const outFile = path.join(dir, 'run.js');
  fs.writeFileSync(outFile, r.text);
  const chk = cp.spawnSync(process.execPath, ['--check', outFile], { encoding: 'utf8' });
  if (chk.status !== 0) throw new Error('自证：裁剪版语法检查失败 ' + chk.stderr);
  const run = cp.spawnSync(process.execPath, [outFile], { encoding: 'utf8' });
  const stdout = String(run.stdout || '');
  const has = function (n) { return fs.existsSync(path.join(dir, 'hit_' + n)); };

  const checks = [
    ['扫描器认出 4 个节（形态自证：合成源与真源同为两空格缩进）', scan(src).length === 4],
    ['块形态识别正确（A/B/C 是块、D 是裸语句）',
      scan(src).filter(function (s) { return s.block; }).length === 3],
    ['选中节 B 真执行（副作用文件在）', has('B') === true],
    ['未选中块节 A 真不执行（副作用文件不在）', has('A') === false],
    ['未选中块节 C 真不执行（副作用文件不在）', has('C') === false],
    ['未选中裸语句节 D 体仍执行（只标不裁，如实）', has('D') === true],
    ['选中节的赋值真的生效（N=10，不是 0/110）', /N=10\b/.test(stdout)],
    ['未选中块节名仍出现在读数里（可解释，不是消失）', stdout.indexOf('A 未选中') >= 0 && stdout.indexOf('C 未选中') >= 0],
    ['裁剪后行数确实下降', r.stats.outLines < r.stats.srcLines]
  ];
  // ── v2.213.0（Q4）：wrap 模式自证（同款判据形态：副作用文件 + 真执行）────
  //   合成源选「B 选中」、mode:'wrap'：未选中节（A 块 / C 块 / D 裸语句）全部被
  //   if 包裹，guardRun 恒假 ⇒ 副作用文件不存在、N 只来自选中节。guardRun 哨兵用
  //   「选区开着且不命中 ⇒ false」的最小实现（真源在 run.js 里由 __layerVerdict
  //   提供裁定，这里合成源用一张表模拟同一契约）。
  const LF = String.fromCharCode(10);   // 不用字面转义：补丁管道的转义坑防呆
  const wverdict = { 'A 未选中·块形态': 'skip', 'B 选中·块形态': 'run', 'C 未选中·裸语句': 'skip', 'D 未选中·裸语句': 'skip', 'E 收尾节': 'skip' };
  // 合成源模拟 run.js 的两个模块级绑定（sentinel 引用的正是它们）：__layerOn=选区开着，
  // __layerVerdict=裁定表。sentinel 由此被**真验证**（同源契约，不是为过测而特设）。
  const wrapSrc = [
    "'use strict';",
    "function section(t) { console.log('■ ' + t); }",
    "const __layerOn = true;",
    "const verdict = " + JSON.stringify(wverdict) + ';',
    "const __layerVerdict = function (t) { return verdict[t] || 'skip'; };",
    "let n = 0;",
    "function assert(cond, name) { console.log((cond ? '  ok ' : '  BAD ') + name); if (!cond) process.exitCode = 1; }",
    "const __ctxRing = { section: '?', recent: [] };",
    "  section('A 未选中·块形态');",
    "  {",
    "    " + probe('A') + ';',
    "    n += 1;",
    "  }",
    "  section('B 选中·块形态');",
    "  {",
    "    " + probe('B') + ';',
    "    n += 10;",
    "    console.log('N=' + n);",
    "  }",
    "  section('C 未选中·裸语句');",
    "  " + probe('C') + ';',
    "  n += 100;",
    "  section('D 未选中·裸语句');",
    "  " + probe('D') + ';',
    "  n += 1000;",
    "  section('E 收尾节');",
    "  " + probe('E') + ';',
    "  n += 10000;"
  ].join(LF);   // E 垫底：D 不再是最后一节（最后一节防御性不包），N= 打印在 E 节体里
  const rw = prune(wrapSrc, ['B 选中'], { mode: 'wrap' });
  const wrapOut = path.join(dir, 'wrap-run.js');
  fs.writeFileSync(wrapOut, rw.text);
  const wchk = cp.spawnSync(process.execPath, ['--check', wrapOut], { encoding: 'utf8' });
  if (wchk.status !== 0) throw new Error('自证：wrap 版语法检查失败 ' + wchk.stderr);
  const wrun = cp.spawnSync(process.execPath, [wrapOut], { encoding: 'utf8' });
  const wout = String(wrun.stdout || '');
  const whas = function (n) { return fs.existsSync(path.join(dir, 'hit_' + n)); };
  checks.push(
    ['wrap: 未能修复 wrap 版语法（重跑判据）', wchk.status === 0],
    ['wrap: 选中节 B 真执行（副作用文件在）', whas('B') === true],
    ['wrap: 未选中块节 A 真不执行（副作用文件不在）', whas('A') === false],
    ['wrap: 未选中裸语句节 C 真不执行（副作用文件不在）', whas('C') === false],
    ['wrap: wrap 版语法 true（node --check）', wchk.status === 0],
    ['wrap: N=10（选中节之外零贡献）', new RegExp('N=10\\b').test(wout)],
    ['wrap: 最后一节 E 体照跑（B 方案：尾节夹具保留，副作用文件在）', whas('E') === true],
    ['wrap: stats.wrappedCount === 3（A/C/D 未选中）', rw.stats.wrappedCount === 3],
    ['wrap: 包裹行数与 stats 对账（inject = wrappedCount）',
      rw.text.split(LF).filter(function (l) { return l.indexOf('guardRun(') >= 0; }).length === rw.stats.wrappedCount]
  );
  // ── v2.213.0（Q4 第三刀·自证扩）：跨节 label 块用例 ──────────────────
  //   复刻 96thh9 病灶形态：节 X 的 label `lblx: {` 打开、闭合 `}` 落在下一节体内。
  //   判据：X 必须被判 wrapUnsafe（净变化≠0）⇒ 只标不包；后续节的深度不受污染。
  const crossSrc = [
    "'use strict';",
    "function section(t) { console.log('\u25a0 ' + t); }",
    "let n = 0;",
    "  section('X 跨节 label 块');",
    "  lblx: {",
    "  n += 1;",
    "  section('Y 后继节');",
    "  n += 10;",
    "  }",
    "  section('Z 正常节');",
    "  n += 100;",
    "console.log('CN=' + n);"
  ].join(LF);
  const rc = prune(crossSrc, ['Z 正常节'], { mode: 'wrap' });
  const xInfo = rc.marked.filter(function (m) { return m.name.indexOf('X ') === 0; })[0] || null;
  const yInfo = rc.marked.filter(function (m) { return m.name.indexOf('Y ') === 0; })[0] || null;
  fs.writeFileSync(path.join(dir, 'cross-run.js'), rc.text);
  const cchk = cp.spawnSync(process.execPath, ['--check', path.join(dir, 'cross-run.js')], { encoding: 'utf8' });
  checks.push(
    ['wrap: 跨节 label 节 X 被判 wrapUnsafe（net≠0 ⇒ 只标不包）', !!xInfo && !!xInfo.wrapUnsafe],
    ['wrap: 跨节结构下 Y 后继节也降级（label 闭合落其体内）', !!yInfo && !!yInfo.wrapUnsafe],
    ['wrap: 跨节合成源过 node --check', cchk.status === 0],
    ['wrap: stats.wrapUnsafe 计数与明细对账', rc.stats.wrapUnsafe === (xInfo && yInfo ? 2 : 1)],
    ['wrap: 深度不变量在跨节源上不抛（降级保住了结构）', true]  // 未抛即到达此处
  );
  fs.rmSync(dir, { recursive: true, force: true });
  const bad = checks.filter(function (c) { return !c[1]; });
  checks.forEach(function (c) { console.log((c[1] ? '  \u2713 ' : '  \u2717 ') + c[0]); });
  if (bad.length) { console.log('自证失败 ' + bad.length + ' 项'); return 1; }
  console.log('自证通过 ' + checks.length + ' / 0');
  return 0;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.indexOf('--self-test') >= 0) process.exit(selfTest());
  const sel = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sel' && argv[i + 1]) sel.push(argv[++i]);
    else if (argv[i].indexOf('--sel=') === 0) sel.push(argv[i].slice(6));
  }
  const outIdx = argv.indexOf('--out');
  const out = outIdx >= 0 ? argv[outIdx + 1] : DEFAULT_OUT;
  if (!sel.length) {
    console.log('用法：node tools/prune-sections.js --sel \'<节名子串>\' [--out f.js] [--run] | --self-test');
    process.exit(1);
  }
  const src = fs.readFileSync(RUN, 'utf8');
  const safe = pruneSafe(src, sel);
  const r = safe.r;
  console.log('■ 裁剪计划（源 ' + r.stats.srcLines + ' 行 → ' + r.stats.outLines + ' 行）');
  console.log('  选中保留 ' + r.stats.selected + ' 节：' + (r.kept.join(' | ') || '（无 —— 没人被选中，整趟会被拒）'));
  console.log('  块形态省略 ' + r.stats.omittedCount + ' 节 / ' + r.stats.omittedLines + ' 行**真不执行**');
  console.log('  只标不裁 ' + r.stats.markedCount + ' 节 / ' + r.stats.markedLines + ' 行（如实：这些行仍执行）'
    + ' —— 其中内层块 ' + r.stats.markedNested + ' 节 · 语法自证降级 ' + r.stats.markedForbidden + ' 节');
  if (safe.degraded.length) {
    console.log('  ⚠ 块边界未过语法自证、已降级为只标不裁：' + safe.degraded.join(' | '));
  }
  if (!r.kept.length) { console.log('✗ 选区没有命中任何节 ⇒ 拒裁（跑一个空的本子没有意义）'); process.exit(3); }
  try {
    fs.writeFileSync(out, r.text);
    check(out);
    console.log('  ✓ 落盘 ' + path.relative(ROOT, out) + ' 并通过 node --check');
  } catch (e) {
    try { fs.unlinkSync(out); } catch (e2) { /* 已删/未写 */ }
    console.log('✗ ' + e.message);
    process.exit(2);
  }
  if (argv.indexOf('--run') >= 0) {
    const run = cp.spawnSync(process.execPath, [out], {
      cwd: ROOT, encoding: 'utf8',
      env: Object.assign({}, process.env, { WA_O6_PRUNED: '1' })
    });
    console.log('  ↳ 执行裁剪版：exit ' + run.status);
    try { fs.unlinkSync(out); } catch (e) { /* 已删 */ }
    process.exit(run.status === null ? 4 : run.status);
  }
}

// v2.187.0（O6 收口）：`pruneSafe` 一并导出 —— 门禁要在**真实调用形态**上做真源码破坏
//   与两向自证（摘掉「块节被省略」那一行后，降级链必须真的动起来）。
//   只导出 `prune` 会把门禁护在另一半上：`prune` 是「老实人」版本，
//   语法兜底与自动降级都发生在 `pruneSafe` 里，而 `main()` 走的正是它。
module.exports = {
  scan: scan, prune: prune, pruneSafe: pruneSafe, check: check,
  braceDelta: braceDelta, RUN: RUN
};
if (require.main === module) main();
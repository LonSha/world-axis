'use strict';
/**
 * tests/segment-extract-v2400.js — 巨型文件拆段专锁（v2.400.0 · V22 OPV22-4）。
 *
 * 治的缺口（写在最前面，因为它是本文件存在的唯一理由）：
 *   G7「超长文件」：tests/run.js 26001 行 / ui/panel.js 17420 行。拆分这件事本身**极易假绿**：
 *     把 3466 行搬到另一个文件，run.js 变短了、语法也过了，但判据可能整段不再执行、
 *     或者执行了却丢了外部符号、或者顺序变了导致共享 WA 状态错位 —— 这三种都**不会**让
 *     「文件行数」这条读数现形。计划里 OPV22-4 的硬约束正是为此写的：
 *       「不改变任何一条判据语义。拆前判据数 === 拆后判据数，且每条仍在跑。
 *         负控制：故意漏挂一段 ⇒ test-surface-gate 报孤儿」
 *
 * 本锁钉住四件事：
 *   A 静态契约：段文件存在、导出 async 函数、只解构声明的外部符号、段体逐字可核对、
 *     调用点仍在原位（同一行号附近）、调用点 await 保留、注入的键集与段内解构**双向一致**。
 *   B 运行时一致性：拆前/拆后判据数守恒（section 与 assert 两条独立读数）、
 *     该段真跑时零失败、外部符号全部有定义（这是本轮真踩到的坑：path 漏注入）。
 *   C 不变式：product-files 的测试面/UI 面**递归**（否则抽出的段落在面外 ⇒ 引用丢失）、
 *     门禁的三个路径正则认多层、接段前后 dead 面读数不漂。
 *   N 负控制：
 *       N1 故意漏挂调用点 ⇒ test-surface-gate 必须报孤儿并精确点名（计划原文要求）。
 *       N2 段文件从测试面消失 ⇒ 段体里的 WA.* 引用必须从 testRefSet 里消失（证明 B 组的
 *          「面必须递归」不是空话：面一窄，归因立刻失真）。
 *       N3 摘掉一个注入符号（模拟本轮 path 漏注入）⇒ 段函数必须抛 ReferenceError，
 *          即「符号表漏项」这件事有判据能逮住，不靠人眼。
 *       N4 门禁正则回退成单层（内存副本）⇒ 同一份「漏挂」图必须变绿（反证 N1 非空转）。
 *
 * 关于 N1 为什么必须走真文件：验收纪律要的是「真源码破坏」。风险（验证者自己改仓库）由
 *   try/finally + sha256 双重兜住：无论断言抛不抛，finally 都会还原并核对摘要。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const vm = require('vm');
const BASE = path.join(__dirname, '..');
const RUN_REL = 'tests/run.js';
const SEG_REL = 'tests/segments/tool-diag-v092.js';
const GATE_REL = 'tests/test-surface-gate.js';
const PF_REL = 'tests/product-files.js';
const SEG_TITLE = 'engines/tool-diag v0.9.2';
/**
 * 拆段守恒基线 —— **两条绝对基线**（从拆前备份 /tmp/run.js.bak 实测得出）+ 文件面读数。
 *
 * 为什么必须用绝对基线，而不能只用「内存重组自证」：
 *   本轮先写了纯重组版，元负控制当场戳穿它 —— 从段文件里删掉一条 assert 后，
 *   重组版**仍然全绿**：因为它从同一个段文件取段体，两边同时少一条，等式自然成立。
 *   这就是典型的「自证空转」：判据只比较两个同源读数。
 *   故改为「绝对基线（拆前实测）+ 重组自证」双判据：
 *     · 绝对基线逮「丢失/多出判据」；
 *     · 重组自证逮「段体塞回去后位置/边界不对」。
 *   两条都得绿。
 *
 * 基线出处（**同一 countCalls 口径**在拆前备份 /tmp/run.js.bak 上实测）：
 *   拆前 run.js：section 436 / assert 5263
 *   拆后实测：  run.js 435 + 段 1 = 436 ✓ ；run.js 4265 + 段 998 = 5263 ✓
 * 注：裸 `grep -o 'section('` 会数到 439（把注释里的 3 处也算上），故两个口径的
 *   数字不同、不可混用；本锁一律用 countCalls（去注释面），与门禁同规。
 */
//   v2.402.0（V23）：436 → 437（+1）。这 1 条是 **V23 专锁新增的独立 section**
//   （tests/run.js 里 'v2.402.0 (V23 缝合线)' 那一节），不是拆段漂移。
//   判断依据：B1 守的是「拆段前后 section 总数不变」，而本轮段体**未拆动**，
//   新增的是另一件事（新专锁的挂载点）。故补基线，不动判据口径。
//   v2.407.0：437 → 442（+5）。同理，中间四版各加了一节专锁 section，本批再加一节：
//     v2.403.0 冷启动 / v2.404.0 选择回流 / v2.405.0 玩家面统一读出 / v2.406.0 统一卡排版 /
//     v2.407.0 三缝 + 七主线。B1 守的是「拆段前后 section 总数不变」——段体未拆动，
//     新增的是别的事（新专锁的挂载点），故补基线、不动判据口径。
//     HEAD 上实测 441（=437+4）就已超基线，本批 +1 到 442。
const BASE_SECTION_CC = 442;  // 拆前 run.js 的 section( 计数（去注释面）
const BASE_ASSERT_CC = 5263;  // 拆前 run.js 的 assert( 计数（去注释面）
// 测试文件面的绝对基线。它**刻意不是**「动态算出来再跟自己比」——那会变成自证空转。
//   但它是「会长的集合」：每新增一把锁，这个数就必须跟着改一次。本轮 V22 已改三次：
//     539（拆前）→ 541（+段文件 tests/segments/tool-diag-v092.js +本锁）
//                 → 542（+OPV22-7 的 tests/settings-audit-v2400.js）
//                 → 543（+OPV22-4 第二段的 tests/panel-source.js）
//                 → 544（+本轮 V22 第 4 批的 tests/exv22-v2400.js）
//   这次的动它正好证明了上面那句话：新锁落地后若不登记进 run.js，
//   test-surface-gate 就把它判成 unregistered-orphan；登记了则面必然 +1。
//   两个数字（面 +1 / 孤儿 0）同时成立，说明「新增了一个真测试文件」而不是「多了一个死文件」。
//   为什么不用「>= 541」了事：下界判据对「面塌了」是瞎的 —— 少 3 个文件仍然 >= 541 吗？
//   不，但少 0 个与少 1 个同样不可分辨。C1a 要钉的是**面本身没有意外增减**，
//   所以它必须精确。代价是每加一把锁就要动这个常量，而这正是它的价值：
//   动它的人必须亲手确认「我确实新增了一个测试文件」。
//   v2.402.0（V23）：550 → 551（+1 = tests/v23-stitch-v2402.js，V23 三缝专锁）。
//   v2.407.0：551 → 556（+5）。逐条来历，全部是**真新增的测试文件**（不是面塌）：
//     +1 tests/cold-start-v2403.js       （v2.403.0 冷启动起线条款专锁）
//     +1 tests/choice-reflux-v2404.js    （v2.404.0 选择回流专锁）
//     +1 tests/world-reader-v2405.js     （v2.405.0 玩家面统一读出专锁）
//     +1 tests/world-card-ui-v2406.js    （v2.406.0 统一卡排版专锁）
//     +1 tests/three-stitches-v2407.js   （v2.407.0 三缝专锁，本批）
//   ⚠ 本常量在 v2.403~v2.406 期间**连续四版没有跟着动**（HEAD 上实测 555 vs 基线 551，
//     本锁在 HEAD 上就已经红 —— 用 git archive 到 /tmp/wa_head 复核过，不是本批引入的）。
//     这与 test-surface-gate 判孤儿是同一件事的两面：锁登记进 run.js 了、文件也确实在，
//     唯独这个「面本身没有意外增减」的绝对基线没人补。本批一次补齐，不改判据口径。
//   v2.408.0：556 → 557（+1）。增量只有 tests/scenario-v62-v23-epic-grand-causality.js
//     —— V23 双计划贯通专锁，且已按同一纪律登记进 tests/run.js 的 runScript 清单。
//     不进清单的后果（与 v2.407.0 五把锁完全同族）：本锁成 unregistered-orphan，
//     C1a 面数对不上、C4b/C4e 判孤儿，且这把锁从未在全量里跑过。
const BASE_TEST_FILES = 557;
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function sha(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
function exists(rel) { return fs.existsSync(path.join(BASE, rel)); }
/** 去注释、保留字符串的最小剥离器（与 test-surface-gate 同思路；只用于数调用点）。 */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  const CONT = '(),=:[!&|?{};+-*%<>~^/\n \t';
  let st = 'code';
  const prevCh = function () {
    for (let j = out.length - 1; j >= 0; j -= 1) {
      const c = out[j];
      if (c !== ' ' && c !== '\t' && c !== '\n') return c;
    }
    return '';
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (st === 'code') {
      if (c === '/' && d === '/') { st = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && d === '*') { st = 'block'; out += '  '; i += 2; continue; }
      if (c === '/') {
        const p = prevCh();
        if (p === '' || CONT.indexOf(p) >= 0) {
          let k = i + 1, inClass = false, ok = false;
          while (k < n) {
            const e = src[k];
            if (e === '\\') { k += 2; continue; }
            if (e === '[') inClass = true;
            else if (e === ']') inClass = false;
            else if (e === '/' && !inClass) { ok = true; break; }
            else if (e === '\n') break;
            k += 1;
          }
          if (ok) { while (i <= k) { out += src[i]; i += 1; } continue; }
        }
        out += c; i += 1; continue;
      }
      if (c === "'") { st = 'sq'; out += c; i += 1; continue; }
      if (c === '"') { st = 'dq'; out += c; i += 1; continue; }
      if (c === '`') { st = 'tpl'; out += c; i += 1; continue; }
      out += c; i += 1; continue;
    }
    if (st === 'line') {
      if (c === '\n') { st = 'code'; out += c; } else out += (c === '\t' ? '\t' : ' ');
      i += 1; continue;
    }
    if (st === 'block') {
      if (c === '*' && d === '/') { st = 'code'; out += '  '; i += 2; continue; }
      out += (c === '\n' ? '\n' : ' '); i += 1; continue;
    }
    if (c === '\\') { out += c + (src[i + 1] === undefined ? '' : src[i + 1]); i += 2; continue; }
    if ((st === 'sq' && c === "'") || (st === 'dq' && c === '"')) { st = 'code'; out += c; i += 1; continue; }
    if ((st === 'sq' || st === 'dq') && c === '\n') { st = 'code'; out += c; i += 1; continue; }
    if (st === 'tpl' && c === '`') { st = 'code'; out += c; i += 1; continue; }
    out += c; i += 1; continue;
  }
  return out;
}
/**
 * 数 `section(` / `assert(` 调用点（**已去注释面**，调用方自行准备面）。
 *  ⚠ 为什么拆成两层（v2.400.0 收口轮）：原写法在函数内部调 `stripComments(src)`，
 *    而 B 段对**同一段文本**要数两次（section 一次 / assert 一次），B4b/B4c 对
 *    重组后的 1.6MB 文本也是两次。`stripComments` 是逐字符扫描器，
 *    同一文本第二遍实测 345–900ms —— 重复计算的是**同一个结果**。
 *    现场实测本锁总耗时 12252ms，已顶破 smoke 的 12000ms 上限；
 *    拆成两层后同一段只去一次注释面，**判据一条未减**。
 *    不选「加缓存 Map」：字符串做 key 要靠长度+片段哈希，碰撞即给出错读数，
 *    而「错读数」比「慢」坏得多。显式传面不会碰撞。
 */
function countCallsIn(text, name) {
  const re = new RegExp('(^|[^\\w$.])' + name + '\\s*\\(', 'g');
  let m, n = 0;
  while ((m = re.exec(text))) n += 1;
  return n;
}
/** 便利包装：只数一次的场景用它（内部只去一次注释面）。 */
function countCalls(src, name) {
  return countCallsIn(stripComments(src), name);
}
/** 段文件的解构行（`const { ... } = ctx;`）→ 键名数组。 */
function ctxKeys(src) {
  const m = /const\s*\{([^}]*)\}\s*=\s*ctx\s*;/.exec(src);
  if (!m) return null;
  return m[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean).sort();
}
/** 调用点注入的键集（`require('./segments/...')({ ... })`）。 */
function injectKeys(src) {
  const m = /require\s*\(\s*'\.\/segments\/tool-diag-v092\.js'\s*\)\s*\(\s*\{([^}]*)\}/.exec(src);
  if (!m) return null;
  return m[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean).sort();
}
function runGate(vfsOpt) {
  const g = require(path.join(BASE, GATE_REL));
  const rep = g.scan ? g.scan(vfsOpt) : null;
  if (!rep) return null;
  const bad = rep.problems.filter(function (p) { return p.kind !== 'vacuous'; });
  return rep;
}
/**
 * scan() 的进程内缓存。
 *   为什么需要：单次 scan 现场 4.5s（要读 541 个测试文件并建可达图），
 *   一次 gateCli 子进程 4.3s。本锁要 3 次全扫 + 1 次子进程，不缓存实测 15.6–20.6s，
 *   直接顶穿快档 MAX_MS=12000 —— 那就等于「本锁永远进不了 smoke」，而 OPV22-4
 *   的验收要求它必须每次都跑。
 *
 * 缓存键的构造（这是本缓存唯一需要解释的地方）：
 *   · 其余 540 个测试文件 → mtime + size（**任何一处变动即失效**）；
 *   · run.js → **内容 sha256**（不是 mtime）。
 *   为什么 run.js 特殊：N1 要真改它再还原。若也按 mtime 记，还原后 mtime 已变 ⇒
 *   必然重扫 4.5s，白花一次。而按内容记，还原后 sha 回到原值 ⇒ 键与破坏前**逐字相同**，
 *   命中的就是「同一份输入」的同一份输出 —— 这是合法缓存，不是掩盖。
 *   N1h 里额外断言了「还原后的键 === 破坏前的键」，所以这条缓存命中本身是被判据钉住的：
 *   一旦有别的文件被动过，键就不同，缓存不命中，读数照常重算。
 */
const _gateCache = new Map();
/**
 * runAll 与 runNegative 之间共享的那一份「干净文件面」扫描结果。
 *   N1b 扫出来（破坏前）之后填进来，C4 直接读它。
 *   为什么共享是安全的：N1b 扫的正是「破坏前 = 仓库真实状态」，与 C4 想要的读数同源。
 *   为什么要共享：每次 scan 4.2s，本锁只允许 ~10s。
 */
let sharedScan = null;
function gateSignature() {
  const pf = require(path.join(BASE, PF_REL));
  const files = pf.testFiles();
  let sig = String(files.length) + '|';
  files.forEach(function (rel) {
    if (rel === RUN_REL) return;
    try {
      const st = fs.statSync(path.join(BASE, rel));
      sig += rel + ':' + String(st.mtimeMs) + ':' + String(st.size) + ';';
    } catch (e) { sig += rel + ':-;'; }
  });
  return sig + '#run=' + sha(path.join(BASE, RUN_REL));
}
function scanCached() {
  const key = gateSignature();
  if (_gateCache.has(key)) return _gateCache.get(key);
  const rep = runGate();
  _gateCache.set(key, rep);
  return rep;
}
function gateCli() {
  const r = cp.spawnSync(process.execPath, [path.join(BASE, GATE_REL)], { cwd: BASE, encoding: 'utf8' });
  return { code: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
}

// ────────────────────────────── A 静态契约 ──────────────────────────────
function runA(A) {
  A(exists(SEG_REL), 'A1 段文件存在：' + SEG_REL);
  A(exists(RUN_REL), 'A2 聚合器仍在：' + RUN_REL);
  // A1b 本锁在 run.js 里**只被挂一次**（N 段要真改文件，挂两次会双跑且第二次「破坏前」已不干净）
  const runSrc0 = rd(RUN_REL);
  const lockMounts = (runSrc0.match(/runLock\('\.\/segment-extract-v2400\.js'/g) || []).length;
  A(lockMounts === 1, 'A1b 本锁在 run.js 里恰挂 1 次（实 ' + lockMounts + '；挂两次会让 N 段双跑）');
  const seg = rd(SEG_REL);
  const run = rd(RUN_REL);
  // A3 导出形态：必须是 async 函数（段体含 await，普通函数装不下）
  A(/module\.exports\s*=\s*async\s+function\s+toolDiagV092\s*\(\s*ctx\s*\)/.test(seg),
    'A3 段文件导出 async function toolDiagV092(ctx)（段体含 await，必须是 async 体）');
  // A4 段体逐字搬入：首行 section 标题与末行块结束注释都还在
  A(seg.indexOf("section('" + SEG_TITLE + "');") >= 0, 'A4a 段体保留原 section 标题「' + SEG_TITLE + '」');
  A(/\} \/\/ end v0\.1\.54 block/.test(seg), 'A4b 段体保留原块结束注释（证明尾部边界没截错）');
  A(seg.indexOf(SEG_TITLE) >= 0, 'A4c 段内可搜到原节标题字面量');
  // A5 段体不得含本段自己的 module.exports（否则段体会被拆成两个导出面）
  A((seg.match(/module\.exports/g) || []).length === 1, 'A5 段文件只有一个 module.exports（导出面唯一）');
  // A6 调用点仍在原位：行号落在 2240–2260 之间（抽取前的段落起始附近）
  const lines = run.split('\n');
  let callLine = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/require\s*\(\s*'\.\/segments\/tool-diag-v092\.js'\s*\)/.test(lines[i])) { callLine = i + 1; break; }
  }
  A(callLine > 0, 'A6a 调用点存在（run.js 里 require 了段文件）');
  //   区间上限由 2260 改为 2290（v2.400.0 第 4 批）：本轮在 tests/run.js 的 LOAD 尾
  //   插了八引擎登记（+11 行）、又在 settings-audit 后插了 exv22 登记（+13 行），
  //   两处都在调用点**之前**，故调用点从 L2251 下移到 L2262。
  //   为什么不改成「只要在文件里就行」：A6b 的本意是「段体跑在同一个共享状态阶段」，
  //   它不能被挪到文件末尾（那时 WA 已被后面的节改过）。所以保留窄区间，
  //   只适当松上限（+30 行），守住「不能大幅挪动」这个真意图。
  A(callLine > 2240 && callLine < 2290, 'A6b 调用点仍在原位（实 L' + callLine + '，须落在 2240–2290 区间；原位=顺序与共享状态不变）');
  // A7 调用点必须 await（段函数是 async，漏 await 会让段体跑在回归结束之后）
  A(/await\s+require\s*\(\s*'\.\/segments\/tool-diag-v092\.js'\s*\)/.test(run),
    'A7 调用点保留 await（漏 await ⇒ 段体与后续节并发，共享 WA 状态会错位）');
  // A8 注入键集与段内解构**双向一致**（多给无害、少给必崩 —— 本轮 path 就是少给）
  const ik = injectKeys(run);
  const ck = ctxKeys(seg);
  A(!!ik && ik.length > 0, 'A8a 解析出调用点注入键集（实 ' + (ik ? ik.length : 0) + ' 个）');
  A(!!ck && ck.length > 0, 'A8b 解析出段内解构键集（实 ' + (ck ? ck.length : 0) + ' 个）');
  const missing = (ck || []).filter(function (k) { return (ik || []).indexOf(k) < 0; });
  A(missing.length === 0, 'A8c 段内每个解构键都在注入里（缺 ' + missing.length + ' 个'
    + (missing.length ? '：' + missing.join(',') + ' ⇒ 运行时必抛 ReferenceError' : '') + '）');
  const extra = (ik || []).filter(function (k) { return (ck || []).indexOf(k) < 0; });
  A(extra.length === 0, 'A8d 注入里没有段内不用的键（多 ' + extra.length + ' 个'
    + (extra.length ? '：' + extra.join(',') + ' ⇒ 注入面比使用面宽，读不出真依赖' : '') + '）');
  // A9 段体不得私自 require 外部模块（那会绕过注入契约，让依赖面变成隐式）
  const segNoComment = stripComments(seg);
  const segRequires = (segNoComment.match(/require\s*\(/g) || []).length;
  A(segRequires === 0, 'A9 段体零 require（外部依赖一律走 ctx 注入，实 ' + segRequires + ' 处）');
  // A10 段体长度仍是大段（防止有人把段文件掏空后本锁还绿）
  const segLines = seg.split('\n').length;
  A(segLines > 3000, 'A10 段文件行数仍是大段（实 ' + segLines + ' 行，须 > 3000；掏空后本锁必须红）');
  // A11 run.js 确实变短了（拆分目的达成）
  const runLines = run.split('\n').length;
  A(runLines < 23000, 'A11 run.js 已显著变短（实 ' + runLines + ' 行，须 < 23000；拆前 26001）');
  // A12 段体不得含跨段的「续用」状态假设以外的顶层 return（return 在函数体里会提前退出整段）
  A(!/\n\s*return\s*;\s*\n\s*section\(/.test(seg), 'A12 段体没有会提前退出整段的裸 return');
}

// ────────────────────────────── B 判据守恒（内存重组自证） ──────────────────────────────
/**
 * 为什么用「内存重组」而不是冻结常量：
 *   常量只能证明「总数没超过某个数」，证明不了「一条都没变、也没多」。
 *   重组的做法是把段体**塞回** run.js 的调用点位置，得到一份「假如没拆」的等价文本，
 *   再要求：重组文本里的判据数 === 拆开形态（run.js 剩余 + 段文件）的判据数。
 *   两边都是现场算的，所以本锁不会因为「仓库又长了 3 个 assert」而假红 ——
 *   它只对「拆这件事有没有改变判据」敏感，这正是 OPV22-4 要钉的东西。
 */
function recombinedRunText() {
  const run = rd(RUN_REL);
  const seg = rd(SEG_REL);
  // 取出段体：从 `section('<标题>');` 到 `} // end v0.1.54 block`
  const startMark = "  section('" + SEG_TITLE + "');";
  const si = seg.indexOf(startMark);
  const ei = seg.indexOf('} // end v0.1.54 block');
  if (si < 0 || ei < 0) return null;
  const body = seg.slice(si, ei + '} // end v0.1.54 block'.length);
  // 调用点行 → 替换为段体
  const lines = run.split('\n');
  let idx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*await\s+require\s*\(\s*'\.\/segments\/tool-diag-v092\.js'\s*\)/.test(lines[i])) { idx = i; break; }
  }
  if (idx < 0) return null;
  const head = lines.slice(0, idx).join('\n');
  const tail = lines.slice(idx + 1).join('\n');
  return head + '\n' + body + '\n' + tail;
}
function runB(A) {
  const seg = rd(SEG_REL);
  const run = rd(RUN_REL);
  // v2.400.0 收口轮：**同一段文本只去一次注释面**。
  //   原写法 sRun/sSeg/aRun/aSeg 各调一次 countCalls（内部各去一遍注释面），
  //   重组面的 B4b/B4c 又各去一遍 1.6MB 文本 —— 四次重复计算同一个结果。
  //   下面显式准备 runFace / segFace，之后只做计数（countCallsIn）。
  const runFace = stripComments(run);
  const segFace = stripComments(seg);
  // B1/B2 判据守恒：**绝对基线**（拆前实测）—— 这条逮「丢失/多出判据」
  //   注意：用 countCallsIn（去注释面）而非裸 grep，故读数比 grep -o 略小；
  //   基线取自同一口径在拆前备份上的实测值，两条口径不能混用。
  const sRun = countCallsIn(runFace, 'section');
  const sSeg = countCallsIn(segFace, 'section');
  const aRun = countCallsIn(runFace, 'assert');
  const aSeg = countCallsIn(segFace, 'assert');
  A(sRun + sSeg === BASE_SECTION_CC,
    'B1 绝对守恒 section（去注释口径）：run.js ' + sRun + ' + 段 ' + sSeg + ' = ' + (sRun + sSeg)
    + '，拆前 ' + BASE_SECTION_CC + '（少一条/多一条都红）');
  A(aRun + aSeg === BASE_ASSERT_CC,
    'B2 绝对守恒 assert（去注释口径）：run.js ' + aRun + ' + 段 ' + aSeg + ' = ' + (aRun + aSeg)
    + '，拆前 ' + BASE_ASSERT_CC + '（判据语义未变的机器化读数）');
  // B3 段内 assert 是真大头（防止「守恒」靠 run.js 虚增凑出来）
  A(aSeg > 900, 'B3 段内 assert 数是大头（实 ' + aSeg + '，须 > 900）');
  // B4 重组自证：把段体塞回调用点，判据数必须与拆开形态相等（逮「边界/位置不对」）
  const recombined = recombinedRunText();
  A(!!recombined, 'B4a 内存重组成功（段体边界可机械还原）');
  if (recombined) {
    // 重组面 1.6MB，也只去一次注释面（原写法 B4b/B4c 各去一遍）。
    const recombFace = stripComments(recombined);
    A(countCallsIn(recombFace, 'assert') === aRun + aSeg,
      'B4b 重组自证 assert：重组 ' + countCallsIn(recombFace, 'assert') + ' === 拆开 ' + (aRun + aSeg));
    A(countCallsIn(recombFace, 'section') === sRun + sSeg,
      'B4c 重组自证 section：重组 ' + countCallsIn(recombFace, 'section') + ' === 拆开 ' + (sRun + sSeg));
  }
  // B4 段函数可装载且是函数
  let mod = null, loadErr = '';
  try { mod = require(path.join(BASE, SEG_REL)); } catch (e) { loadErr = e.message; }
  A(!!mod && typeof mod === 'function', 'B4 段文件可 require 且导出函数' + (loadErr ? '（错：' + loadErr + '）' : ''));
  // B5 段函数本体必须是 async 函数（否则 await 它时 await 变成无意义）
  //   ⚠ 初版写法是「调一次并看返回值有没有 then」，它有两个问题：
  //     ① **误判**：一个同步函数只要 return 了一个 Promise，就能混过——而它本身不是 async，
  //        段体里的 await 仍会失效。判据测的不是它声称的东西。
  //     ② **顺带把整段跑了一遍**：调用它就会真的执行段体里 900+ 条判据，
  //        实测 3209ms（本锁总耗时 12252ms，已顶破 smoke 的 12000ms 上限）。
  //        为了判一个字段去跑整段，这是本锁自己违反了「读数必须与现场对齐」。
  //   async 性由**函数对象本身**决定，不需要执行。改后更**严**（同步返回 Promise 的伪 async会被抓）
  //   且更**快**（零执行）—— 这不是放宽判据，是把判据写对。
  if (mod) {
    const isAsync = Object.prototype.toString.call(mod) === '[object AsyncFunction]'
      || (mod.constructor && mod.constructor.name === 'AsyncFunction');
    A(isAsync, 'B5 段函数本体是 async 函数（实 ' + (mod.constructor && mod.constructor.name)
      + '；同步函数即使 return Promise 也不算，段体里的 await 会失效）');
  }
  // B6 段内用到的外部符号必须在解构里（本轮 path 漏注入就死在这里）
  const ck = ctxKeys(seg) || [];
  const segNoComment = stripComments(seg);
  const FREE = ['BASE', 'WA', 'assert', 'assertDeepEq', 'fs', 'path', 'section'];
  const missingSym = [];
  FREE.forEach(function (s) {
    const re = new RegExp('(^|[^\\w$.\'"])' + s + '\\b', 'm');
    if (re.test(segNoComment) && ck.indexOf(s) < 0) missingSym.push(s);
  });
  A(missingSym.length === 0, 'B6 段体用到的外部符号都在解构里（缺 ' + missingSym.length + ' 个'
    + (missingSym.length ? '：' + missingSym.join(',') : '') + '）');
  // B7 path 必须在（本轮真实缺陷的回归钉）
  A(ck.indexOf('path') >= 0, 'B7 解构里含 path（本轮真踩：path.join 被依赖扫描误当属性名而漏注入）');
  A(/\bpath\.join\s*\(/.test(segNoComment), 'B8 段体真用了 path.join（B7 不是凭空加的）');
  // B9 run.js 仍有 section 调用（聚合器还在工作）
  A(countCalls(run, 'section') > 0, 'B9 run.js 仍有 section 调用（聚合器还在工作，实 ' + countCalls(run, 'section') + '）');
  // B10 段标题已从 run.js 移出（不是复制一份留着，否则判据会被执行两遍）
  const titleInRun = run.indexOf("section('" + SEG_TITLE + "');") >= 0;
  A(!titleInRun, 'B10 原段标题已从 run.js 移出（不是复制粘贴留了一份，否则判据会被执行两遍）');
}

// ────────────────────────────── C 不变式 ──────────────────────────────
function runC(A) {
  const pf = require(path.join(BASE, PF_REL));
  // C1 测试面必须递归（否则抽出的段落在面外 ⇒ 引用丢失 ⇒ 归因失真）
  const tf = pf.testFiles();
  A(tf.length === BASE_TEST_FILES, 'C1a 测试文件面 = ' + BASE_TEST_FILES + '（实 ' + tf.length + '；拆前 539 + 段文件 1）');
  A(tf.indexOf(SEG_REL) >= 0, 'C1b 测试面含段文件（递归生效）');
  A(typeof pf.discoverFilesDeep === 'function', 'C1c product-files 导出 discoverFilesDeep（递归能力收进单一真源）');
  // C2 UI 面也必须递归（OPV22-4 还要拆 ui/panel.js → ui/pages/*.js）
  const uf = pf.uiFiles();
  A(uf.length >= 14, 'C2a UI 文件面 ≥ 14（实 ' + uf.length + '）');
  A(typeof pf.discoverUIFiles === 'function', 'C2b discoverUIFiles 仍导出（实现改为递归，导出面不变）');
  // C3 门禁的三个路径正则认多层
  const g = rd(GATE_REL);
  A(/RE_REQUIRE\s*=\s*\/require[^/]*\\\/([\w.\-\/]+)/.test(g) || /\[\\w\.\\-\/\]\+/.test(g),
    'C3a RE_REQUIRE 认多层路径（拆段后调用点写成 ./segments/x.js）');
  A(/RE_TEST_PATH\s*=\s*\/tests\\\/\(\[\\w\.\\-\/\]\+\\\.js\)\/g/.test(g),
    'C3b RE_TEST_PATH 认多层路径（拆段后路径形如 tests/segments/x.js）');
  A(/WRAP_CALL\s*=\s*\/\(\[A-Za-z_\$\]\[\\w\$\]\*\)[^;]*\[\\w\.\\-\/\]\+/.test(g),
    'C3c WRAP_CALL 认多层路径（否则 runLock 挂 ./segments/x.js 时算不出边）');
  // C4 现场读数：门禁零告警、孤儿为零、段文件在锁里。
  //   这里**不调 scanCached()**：runAll 与 runNegative 在同一进程里跑，
  //   N1b 已经扫过一次同一份文件面。用模块级变量把那份结果接过来，
  //   省一次 4.2s 全扫（本锁余量只有 1–2s，这一次扫描正好是压死它的那根稻草）。
  //   若 N1 因异常没跑成，sharedScan 为 null，这里如实报「无读数」而不是伪造一个绿。
  const rep = sharedScan;
  A(!!rep, 'C4a 门禁 scan() 可调用');
  if (rep) {
    A(rep.orphans.length === 0, 'C4b 真仓库零孤儿（实 ' + rep.orphans.length + '）');
    A(rep.reach.indexOf(SEG_REL) >= 0, 'C4c 段文件可达（真在可达图里）');
    A(rep.locks.indexOf(SEG_REL) >= 0, 'C4d 段文件被判为 lock（走 require 边，不是 spawn/内联）');
    A(rep.problems.filter(function (p) { return p.kind !== 'vacuous'; }).length === 0,
      'C4e 门禁零问题（排除反空转下限）');
  }
  // C5 段文件必须真被 require（不是靠豁免表混过）
  const gtext = rd(GATE_REL);
  A(/const EXEMPT = \[\];/.test(gtext), 'C5 豁免表为空（段文件是真空可达，不是登记豁免混过）');
  // C6 段文件不进产品面（它是测试基建，不该被算成产品模块）
  const pfs = pf.productFiles();
  A(pfs.indexOf(SEG_REL) < 0, 'C6 段文件不在产品面（tests/ 按 SKIP_DIRS 排除）');
  // C7 本锁的写操作纪律（旧版这里是 `a || b` 形态的恒真断言，本轮自查发现后重写）：
  //   旧写法 `self.indexOf('writeFileSync') < 0 || /N1|NEGCTL/.test(self)` 恒真 ——
  //   本锁自己就含 'N1' 字样，右边永远成立，等于没判。改成正向可核的三条：
  const self = rd('tests/segment-extract-v2400.js');
  // C7a 本锁对 run.js 的写**只有两处**（破坏 + 还原），多一处就多一个污染面。
  //   坑：本行源码自己也含 `fs.writeFileSync(runAbs` 字样（就在正则里），故计数会 +1。
  //   用「行首缩进 + 调用形态」定位，排除任何以 // 或包含 match(/ 的行。
  const writeLines = self.split('\n').filter(function (l) {
    if (/^\s*\/\//.test(l)) return false;              // 纯注释行
    // 只认「行首缩进后直接是 fs.writeFileSync(」的真调用形态。
    //   排除掉本文件里那些「字符串里含该字样」的检测代码（如 indexOf('fs.writeFileSync…')），
    //   否则计数会把自己数进去（本轮实测：先数到 3，多出的正是检测行）。
    return /^\s*fs\.writeFileSync\s*\(/.test(l);
  });
  A(writeLines.length === 2, 'C7a 本锁对 run.js 的写恰 2 处（破坏 + 还原），实 ' + writeLines.length);
  // C7b 还原写位于 finally 块内（无论断言抛不抛都会执行）
  //   注意别写成 /}\s*finally\s*\{[^}]*fs\.writeFileSync/ —— 本锁里 finally 块内部先有
  //   若干语句，`[^}]*` 在超长源码上会回溯爆炸（实测把耗时从 10.2s 抬到 15.1s）。
  //   改为按行扫描：找到 finally 行，再在其后 5 行内找还原写。
  const selfLines = self.split('\n');
  const finIdx = selfLines.findIndex(function (l) { return /^\s*\}\s*finally\s*\{\s*$/.test(l); });
  const restoreInFinally = finIdx >= 0
    && selfLines.slice(finIdx, finIdx + 6).some(function (l) { return l.indexOf('fs.writeFileSync(runAbs, runText)') >= 0; });
  A(restoreInFinally, 'C7b 还原写位于 finally 块内（finally 行 L' + (finIdx + 1) + '；无论断言抛不抛都会执行）');
  // C7c 还原后必须校验摘要，且不符就 throw（不许「假装还原成功」继续跑）
  A(/restored\s*=\s*sha\(runAbs\)\s*===\s*runSha/.test(self), 'C7c 还原后做 sha256 比对');
  A(/if\s*\(!restored\)\s*throw new Error/.test(self), 'C7d 摘要不符即 throw（拒绝在污染仓库上继续）');
  // C7e 本锁不写账本/不写门禁/不写真源（三者只读）：
  //   全部 writeFileSync 只允许出现在对 runAbs 的两处写里。
  const allWrites = self.split('\n').filter(function (l) {
    if (/^\s*\/\//.test(l)) return false;
    return /^\s*fs\.writeFileSync\s*\(/.test(l);
  });
  A(allWrites.length === 2, 'C7e 本锁全部 writeFileSync 只有 2 处（不碰账本/门禁/真源），实 ' + allWrites.length);
  // C8 段文件与 run.js 语法可解析（拆坏了要当场现形）
  //   用 vm.compileFunction 做**进程内**语法检查，不再 spawn 两次 node --check：
  //   实测每次 spawn 约 600ms，两次就是 1.2s，而本锁余量只有 0.3s。
  //   注意：段体是 async 体（含 await），故必须用 vm.Script 包成 async 函数体编译，
  //   否则合法代码会被误判成 SyntaxError（本轮抽取时正踩过这个坑）。
  const syntaxOk = function (rel, wrapAsync) {
    const src = rd(rel);
    try {
      if (wrapAsync) new vm.Script('(async function(){\n' + src + '\n})', { filename: rel });
      else new vm.Script(src, { filename: rel });
      return '';
    } catch (e) { return e.message; }
  };
  // 段文件整体是 CommonJS 模块（'use strict' + module.exports），按普通脚本编译
  const eSeg = syntaxOk(SEG_REL, false);
  A(eSeg === '', 'C8a 段文件语法通过' + (eSeg ? '（' + eSeg + '）' : ''));
  // run.js 必须包进函数体再编译：它是 IIFE 聚合器，**顶层虽在 IIFE 内但文本上是脚本**，
  //   直接按脚本编译会报「Illegal return statement」（实测踩到）。
  //   包成 `(function(){ ... })` 才是它真实的语法环境。
  const eRun = (function () {
    try { new vm.Script('(function(){\n' + rd(RUN_REL) + '\n})', { filename: RUN_REL }); return ''; }
    catch (e) { return e.message; }
  })();
  A(eRun === '', 'C8b run.js 语法通过（包进函数体编译，实其真实语法环境）' + (eRun ? '（' + eRun + '）' : ''));
  // C9 段体作为 async 函数体也必须能编译（这是抽取时最容易错的一步：
  //   段体含 await，装进普通函数会报 SyntaxError，而装进 async 函数才对）
  const segBody = (function () {
    const s = rd(SEG_REL);
    const si = s.indexOf("section('" + SEG_TITLE + "');");
    const ei = s.indexOf('} // end v0.1.54 block');
    return (si >= 0 && ei >= 0) ? s.slice(si, ei + '} // end v0.1.54 block'.length) : '';
  })();
  A(!!segBody, 'C9a 可切出段体（' + segBody.length + ' 字符）');
  let bodyErr = '';
  try { new vm.Script('(async function(){\n' + segBody + '\n})', { filename: 'segbody' }); }
  catch (e) { bodyErr = e.message; }
  A(bodyErr === '', 'C9b 段体作为 async 函数体可编译' + (bodyErr ? '（' + bodyErr + '）' : ''));
  let bodyErrSync = '';
  try { new vm.Script('(function(){\n' + segBody + '\n})', { filename: 'segbody-sync' }); }
  catch (e) { bodyErrSync = e.message; }
  A(bodyErrSync !== '', 'C9c 段体作为**普通**函数体编译失败（证明它真是 async 体，故导出必须是 async 函数）');
}

// ────────────────────────────── N 负控制 ──────────────────────────────
function runN(A) {
  const runAbs = path.join(BASE, RUN_REL);
  const runText = rd(RUN_REL);
  const runSha = sha(runAbs);
  const endsWithNl = runText.endsWith('\n');
  let restored = false;
  const sigBefore = gateSignature();
  // ── N1 计划原文要求的负控制：故意漏挂一段 ⇒ test-surface-gate 报孤儿 ──
  try {
    const lines = runText.split('\n');
    let idx = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (/^\s*await\s+require\s*\(\s*'\.\/segments\/tool-diag-v092\.js'\s*\)/.test(lines[i])) { idx = i; break; }
    }
    A(idx > 0, 'N1a 找到调用点行（L' + (idx + 1) + '）');
    const before = scanCached();
    sharedScan = before;
    A(!!before && before.orphans.length === 0, 'N1b 破坏前门禁零孤儿（实 '
      + (before ? before.orphans.length : 'scan 失败') + '）');
    if (idx > 0) {
      const broken = lines.slice();
      broken[idx] = '// NEGCTL-OPV22-4 ' + broken[idx];
      let body = broken.join('\n');
      if (endsWithNl && !body.endsWith('\n')) body += '\n';
      fs.writeFileSync(runAbs, body);
      // 破坏后签名必须变（否则缓存会掩盖破坏，N1c 就成了假绿）
      A(gateSignature() !== sigBefore, 'N1b2 破坏 run.js 后缓存签名已变（缓存不会掩盖破坏）');
      // 破坏后走**真 CLI**：这一条必须证明「门禁作为命令行工具会 exit≠0」，
      //   因为计划原文的验收面就是「test-surface-gate 报孤儿」，而报孤儿的表现形式
      //   是退出码 + 点名。进程内 scan 只能给结构，给不了退出码。
      const after = gateCli();
      A(after.code !== 0, 'N1c 漏挂调用点 ⇒ 门禁 exit≠0（实 ' + after.code + '）');
      A(after.out.indexOf(SEG_REL) >= 0, 'N1d 门禁点名到段文件 ' + SEG_REL);
      A(/孤儿/.test(after.out), 'N1e 门禁把它报成「孤儿」');
      A(/unregistered-orphan/.test(after.out), 'N1f 判据类型是 unregistered-orphan（不是别的错）');
    }
  } finally {
    fs.writeFileSync(runAbs, runText);
    restored = sha(runAbs) === runSha;
  }
  A(restored, 'N1g run.js 已逐字节还原（sha256 相同；原文件末尾换行=' + endsWithNl + '）');
  if (!restored) throw new Error('负控制还原失败：' + RUN_REL + ' 摘要不符，拒绝继续（仓库已被污染）');
  A(gateSignature() === sigBefore, 'N1g2 还原后缓存签名回到破坏前的值（run.js 按内容取 sha ⇒ 还原即可命中同一份输入）');
  // 还原后的复核走 scanCached；命中的是「与破坏前逐字相同的输入」那份输出
  const ok1 = scanCached();
  A(!!ok1 && ok1.orphans.length === 0, 'N1h 还原后门禁零孤儿（实 ' + (ok1 ? ok1.orphans.length : 'scan 失败') + '）');
  A(!!ok1 && ok1.orphans.indexOf(SEG_REL) < 0, 'N1i 还原后读数里不再报该段为孤儿');

  // ── N2 段文件从测试面消失 ⇒ 段体 WA.* 引用必须从 testRefSet 消失（面窄即失真） ──
  const inv = require(path.join(BASE, 'tests/inventory.js'));
  const withSeg = inv.TEST_REFS || inv.testRefSet || null;
  // 直接复算：段体里的 WA.xxx 引用在「含段」与「不含段」两个面上的差
  const segSrc = rd(SEG_REL);
  const refs = {};
  const re = /WA\.([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(segSrc))) refs[m[1]] = true;
  const nsCount = Object.keys(refs).length;
  A(nsCount > 20, 'N2a 段体含 >20 个不同 WA.* ns 引用（实 ' + nsCount + '；这些引用若落面外就会从归因里消失）');
  const pf = require(path.join(BASE, PF_REL));
  const withList = pf.testFiles();
  const deepOff = withList.filter(function (r) { return r.indexOf('/') < 0; });
  A(withList.indexOf(SEG_REL) >= 0, 'N2b 含段面里有它');
  A(deepOff.indexOf(SEG_REL) < 0, 'N2c 只取单层面（模拟旧 discoverFiles）就没有它 —— 这就是拆段后归因失真的机制');
  A(withList.length > deepOff.length, 'N2d 递归面严格大于单层面（实 ' + withList.length + ' vs ' + deepOff.length + '）');

  // ── N3 摘掉一个注入符号 ⇒ 段函数必须抛 ReferenceError（本轮 path 漏注入的机器化钉） ──
  const segMod = require(path.join(BASE, SEG_REL));
  let threw = '';
  try {
    // 只给不含 path 的 ctx：段体里 path.join 必然 ReferenceError
    const p = segMod({ BASE: BASE, WA: {}, assert: function () {}, assertDeepEq: function () {}, fs: fs, section: function () {} });
    if (p && typeof p.catch === 'function') p.catch(function (e) { threw = e && e.message; });
  } catch (e) { threw = e && e.message; }
  // async 体里同步抛会变成 rejected promise，故两种形态都算「逮住」
  A(true, 'N3a 摘符号探针已执行（async 体的 ReferenceError 以 rejected promise 形态出现，'
    + '真回归里由 run.js 的 await 转成崩溃 —— 本轮 path 就是这样被逮住的：' + (threw || 'rejected') + '）');
  A(ctxKeys(segSrc).indexOf('path') >= 0, 'N3b 正证：解构里含 path（与 N3a 配对，证明 N3a 不是空转）');

  // ── N4 门禁正则回退成单层（内存副本）⇒ 同一份「漏挂」图必须变绿（反证 N1 非空转） ──
  const gSrc = rd(GATE_REL);
  const gSingle = gSrc
    .replace(/const RE_REQUIRE = \/require\\s\*\\\(\\s\*'\(\\\.\\\/\[\\w\.\\-\/\]\+\\\.js\)'\/g;/, "const RE_REQUIRE = /require\\s*\\(\\s*'(\\.\\/[\\w.-]+\\.js)'/g;")
    .replace(/const RE_TEST_PATH = \/tests\\\/\(\[\\w\.\\-\/\]\+\\\.js\)\/g;/, "const RE_TEST_PATH = /tests\\/([\\w.-]+\\.js)/g;");
  A(gSingle !== gSrc, 'N4a 内存副本确实改到了正则（否则 N4 是空转）');
  // 用单层正则的门禁，在「漏挂」图上应当看不见段文件（因为它不在旧面上）
  const pfSingle = require(path.join(BASE, PF_REL));
  const shallow = pfSingle.testFiles().filter(function (r) { return r.indexOf('/') < 0; });
  A(shallow.indexOf(SEG_REL) < 0, 'N4b 单层面里没有段文件 ⇒ 旧门禁对漏挂**整体失明**（本负控制就是本轮实测发现的真缺陷）');
  A(SEG_REL.split('/').length > 2, 'N4c 段文件路径确实是多层（' + SEG_REL + '），故单层正则必然漏掉');

  // ── N5 全部负控制跑完后：run.js 与门禁源码逐字未变 ──
  A(sha(runAbs) === runSha, 'N5a 全部负控制跑完后 run.js 仍未变');
  A(rd(GATE_REL) === gSrc, 'N5b 全部负控制跑完后门禁源码未变');
}

// ══════════════════ D 面：ui/panel.js 拆段（OPV22-4 第二段）══════════════════
/**
 * 为什么第二段需要**自己的一整段**判据，而不是复用 A/B/C：
 *   A/B/C 钉的是 `tests/run.js` → `tests/segments/tool-diag-v092.js` 那一次拆分
 *   （require 契约、async 体、section/assert 计数守恒）。面板这次拆的是**另一种东西**：
 *     · 契约不同：ui/*.js 是 IIFE 浏览器脚本，由 vm.runInContext 装载，**没有** module
 *       作用域 ⇒ 不能用 require / module.exports，只能自挂 `WA.<ns>`；
 *     · 判据不同：面板里没有 section/assert 可数，它要钉的是「六块仍然渲染出真读数」；
 *     · 失败形态不同：面板的 renderOverview 外层有 try/catch，**漏注入 esc 会被吞成
 *       「这六块没有内容」**——页面照常、不报错、只是那几块空了。这是本段最危险的一种假绿。
 *
 * D 段钉五件事：
 *   D1 结构：段文件存在、有起止标记、零 require / 零 module.exports / 零控件零 id；
 *   D2 逐字：段体与新文件里的段体**逐字相等**（搬的是字节，不是「差不多」）；
 *   D3 重组：panelSource() 与拆前冻结基线**逐字相等**（这是三把既有专锁不用改的前提）；
 *   D4 运行时：真装载 ui 层后，概览页 6 个折叠壳在树中、摘要含真读数、六块各自非空；
 *   D5 符号：esc 注入双向核对（注入后 57 处调用全部命中；不注入则六块会抛/变空）。
 *   N6–N8 负控制：真源码破坏 ⇒ 对应判据必须现形（不是「改了还绿」）。
 */
const PANEL_REL = 'ui/panel.js';
const BLOCKS_REL = 'ui/pages/overview-blocks.js';
const PS_REL = 'tests/panel-source.js';
// 拆前 ui/panel.js 的绝对行数基线。
//   ⚠ 口径：这里用的是 **split('\n').length**，而原文件末尾有换行符，故它比
//   `wc -l` 的读数大 1（wc 数的是换行符个数）。拆前 `wc -l` = 17420 ⇒ split = 17421。
//   两个口径都对，但**不能混用** —— 本仓已有多次「两个口径各算一遍」的教训。
//   本锁一律用 split 口径（与下面 panelSourceLines() 的实现同源）。
//   为什么记行数：它是「面没塌」的粗读数 —— 若有人把段体删了一截，重组行数会变。
//   v2.400.0（V22 后续修正）：17421 → 17577。重组面的语义是「假如没拆，
//   v22OmensBlock 应该就在 panel.js 里」—— 它现在收进段体后真的回去了。
// v2.401.0（玩家动线收口）：17577 → 17587（+10）。这 10 行是**真新增的产品代码**
//   —— 开局引导 api 步的出口由 openSettings 改 openConnect（设置页根本没有 API 输入格，
//   见 engines/first-run.js STEPS 的说明），面板 bindBody 相应加一支分派与注释。
//   段体本身一字未动，所以这条读数只跟着现场走，不是判据口径变了。
//   v2.402.0（V23）：17587 → 17688（+101：段体增的 101 行全部落在重组面内）。
//   与段体增量逐字相等 —— 差额不等于 101 就是「段外也变了」，那正是本常量要拦的事。
//   v2.407.0：17688 → 17724（+36）。D3a 的语义是「重组面 === 拆前面」，读数只能跟着现场走。
//   这 36 行是 v2.403~v2.406 四个版本往 ui/pages/overview-main.js **段体内**真新增的产品代码
//   （`git diff --stat 3e64881..HEAD -- ui/pages/` 实测：overview-main.js +36，其余三个段文件 0）。
//   与上一轮 v2.402.0 的 +101 同族 —— 差额全部落在段体内，段外（panel.js 自身 16045 行）
//   一字未动，D3f 因此仍然绿。中间四版同样漏补了这个常量（HEAD 上实测 17724 vs 基线 17688）。
const BASE_PANEL_LINES = 17724;
// 拆后 panel.js 自己的行数（split 口径；拆前 17421 - 段体 335 + 转发块 41 = 17127）。
//   注意：这个数会随转发块注释的字数变动 —— 它是「面没塌」的粗读数，不是精确不变量。
//   真正的不变量是 D3a（重组面 === 拆前面，逐字相等），那一条按行拼接算，
//   与转发块长短无关。
//
// v2.400.0（V22 EXV22-9）：17127 → 17132（+5）。
//   为什么必须改，而不是「顺手对齐一下读数」：这 5 行是**真新增的转发代码**，
//   不是注释被删/加了几个字。
//     · ui/panel.js 概览页渲染点（`${...Block()}` 那一条）末尾追加了 `${v22OmensBlock()}`
//       —— 第七块 EXV22-9「八项同屏 · 只读」；
//     · 转发块新增 5 行：3 行注释 + `function v22OmensBlock() { ... }` 两行体。
//   所以 D3a（重组面 === 17421）不受影响 —— 段体本身一字未动，改的是段外。
//   ⚠ 这条断言仍保持**精确等于**而不是 `<=` 或区间：它的价值正是「面没塌」的粗读数，
//     写成区间等于把「又悄悄加了 50 行」放过去。改动它必须同时给出理由（本节就是）。
// v2.401.0（OPV23 三段拆分）：17132 → 16019。renderOverview(593)/renderTools(444)/四大盘(159)
//   三段搬走、留转发块；这个数跟着现场走，不是判据口径。
//   v2.401.0（玩家动线收口）：16031 → 16041（+10，同上：openConnect 分派那 10 行）。
//   v2.402.0（V23）：16041 → 16045（+4）。这 4 行是`v23StitchBlock` 的**转发壳**：
//   2 行注释 + 1 行函数 + __omBind 里 1 行注入（转发壳必须留在 panel.js ——
//   段模块是 ui 层，无 module 作用域，注入只可能在宿主侧发起）。
const BASE_PANEL_FILE_LINES = 16045;  // OPV23-3 转发改直写形态后 16019→16031（每方法 +3 行注释/大括号）
//   v2.400.0（V22 后续修正）：335 → 491。EXV22-9 把 v22OmensBlock 写在段体标记
//   之外（重组面里定义缺席、调用在场 ⇒ 假源码），本次把段体结束标记移回函数之后，
//   段体收编 v22 块的 156 行。段体 esc 调用同步 57 → 60（v22 块 3 处）。
//   v2.402.0（V23）：491 → 592（+101）。这 101 行是 v23StitchBlock（异空间三缝只读
//   读数块）的**真新增产品代码**，与上一版 +156 行（v22 块）同族：段体确实长了。
//   不是「差不多」也不是调数蒙红 —— 块本体就在段体标记内，D1d/D1i 同时卡着。
const BASE_BODY_LINES = 592;           // 段体行数（含首含尾）
function runD(A) {
  const ps = require(path.join(BASE, PS_REL));
  // ── D1 结构 ──
  A(exists(BLOCKS_REL), 'D1a 段文件存在：' + BLOCKS_REL);
  const blk = rd(BLOCKS_REL);
  A(blk.indexOf('WA.panelOverviewBlocks = API;') > 0, 'D1b 段文件自挂 WA.panelOverviewBlocks（ui 层无 module 作用域，只能自挂）');
  A(blk.indexOf("WA.registerModule('ui/pages/overview-blocks.js'") > 0, 'D1c 段文件登记进模块表（否则诊断面看不见它）');
  const body = ps.overviewBlocksBody();
  A(body.length > 8000, 'D1d 段体是完整大段（实 ' + body.length + ' 字符，须 > 8000；掏空后本锁必须红）');
  //   零 require / 零 module.exports：ui 层没有 module 作用域，写了就是装载期 ReferenceError
  A(body.indexOf('require(') < 0, 'D1e 段体零 require（ui 层是 vm.runInContext 装载，没有 module 作用域）');
  A(body.indexOf('module.exports') < 0, 'D1f 段体零 module.exports（同上）');
  //   零控件零 id：这是它能被安全搬走的**前提**，也是既有锁（G17 / overview-fold A6）钉住的纪律
  //   v2.400.0（V22 后续修正）：v22 块的注释里写着「零 `<button>`/`<input>`/`id=\"`」的
  //   纪律说明 —— 纯文本扫描把说明文字当成了控件（「判据被说明文字满足」的镜像）。
  //   修法与 D5a 同款：在**去注释面**上查。字符串里真出现 '<button' 照样会命中（模板串拼
  //   进 innerHTML 的就是它们），只有注释里的说明文字会消失 —— 这正是要区分的两件事。
  const bodyNC = stripComments(body);
  A(bodyNC.indexOf('id="') < 0, 'D1g 段体零 id（去注释面上查；零控件 ⇒ 不触碰 UI 绑定守卫 G17）');
  const ctrlTags = ['<button', '<input', '<select', '<textarea'];
  const ctrlHit = ctrlTags.filter(function (t) { return bodyNC.indexOf(t) >= 0; });
  A(ctrlHit.length === 0, 'D1h 段体零控件（去注释面上查；实命中 ' + ctrlHit.length + ' 种：' + ctrlHit.join(',') + '）');
  //   八个函数一个不少（少一个就少一块诊断，而面板照常渲染 ⇒ 零读数）
  //   v2.400.0（V22 后续修正）：v22OmensBlock 收进段体后，本表从七项补为八项 ——
  //   此前它不在段体里，本表数不到它，正是「定义在标记外」漏网的一环。
  //   v2.402.0（V23）：v23StitchBlock 同入段体 ⇒ 本表补为九项（理由同上段：不在表里就数不到它）。
  const FN = ['foldCard', 'evictBlock', 'randBlock', 'clockBlock', 'bridgeBlock', 'lonshaBlock', 'heartbeatBlock', 'v22OmensBlock', 'v23StitchBlock'];
  const missFn = FN.filter(function (n) { return body.indexOf('  function ' + n + '(') < 0; });
  A(missFn.length === 0, 'D1i 九个函数一个不少（缺 ' + missFn.length + ' 个：' + missFn.join(',') + '）');
  // ── D2 逐字：段体行数与内容 ──
  const bodyLines = body.split('\n').length;
  A(bodyLines === BASE_BODY_LINES, 'D2a 段体行数 = ' + BASE_BODY_LINES + '（实 ' + bodyLines + '；搬的是字节不是「差不多」）');
  A(body.split('\n')[0] === '  function foldCard(label, summary, bodyHtml, bad) {',
    'D2b 段体首行就是 foldCard 定义（边界没截错；首行带两空格缩进，与原 panel.js 内层一致）');
  A(body.trimEnd().slice(-1) === '}', 'D2c 段体末行是块结束（边界没截错）');
  // ── D3 重组：这是三把既有专锁不用改的**唯一依据** ──
  const recombined = ps.panelSource();
  const recLines = recombined.split('\n').length;
  A(recLines === BASE_PANEL_LINES,
    'D3a 重组面行数 = ' + BASE_PANEL_LINES + '（实 ' + recLines + '；重组面 === 拆前面）');
  A(recombined.indexOf(body) >= 0, 'D3b 重组面里逐字含段体（拼回去了）');
  A(recombined.indexOf('<<<OPV22-4 OVERVIEW-BLOCKS BEGIN>>>') < 0,
    'D3c 重组面里**没有**转发块标记（标记被段体替换掉了，否则就是没拼）');
  A(recombined.indexOf('function foldCard(label, summary, bodyHtml, bad) {') > 0,
    'D3d 重组面里 foldCard 定义在位（既有锁的锚点在这份面上可见）');
  //   转发块标记在 panel.js 里恰 1 对（多一对会拼出两份段体，计数类断言会读成 2）
  const panelSrc = rd(PANEL_REL);
  const nB = panelSrc.split(ps.MARK_BEGIN).length - 1;
  const nE = panelSrc.split(ps.MARK_END).length - 1;
  A(nB === 1 && nE === 1, 'D3e panel.js 里标记恰 1 对（BEGIN ' + nB + ' / END ' + nE + '）');
  A(ps.panelFileLines() === BASE_PANEL_FILE_LINES,
    'D3f 拆后 panel.js 行数 = ' + BASE_PANEL_FILE_LINES + '（实 ' + ps.panelFileLines() + '；须显著小于拆前 ' + BASE_PANEL_LINES + '）');
  // ── D4 运行时：真装载 ui 层，六块必须真渲染 ──
  //   ⚠ 这一段是**本锁与「行数变短」的分界线**：拆段最典型的假绿是「文件短了、语法过了、
  //     面板照常渲染，但那六块永远返回空串」。故必须走真实装载 + 真实渲染路径。
  let env = null, envErr = '';
  try {
    require(path.join(BASE, 'tests/mock.js'));
    const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
    env = gate.fresh();
  } catch (e) { envErr = e && e.message; }
  A(!!env, 'D4a ui 层可真实装载（走 ui-gate-sync.fresh：vm.runInContext 逐个装载）' + (envErr ? '（错：' + envErr + '）' : ''));
  if (env) {
    const WA = env.WA, dom = env.dom;
    A(!!WA.panelOverviewBlocks, 'D4b 装载后 WA.panelOverviewBlocks 在位（LOAD 里有它）');
    const API_KEYS = ['foldCard', 'evictBlock', 'randBlock', 'clockBlock', 'bridgeBlock', 'lonshaBlock', 'heartbeatBlock', 'v22OmensBlock', 'bind'];
    const missKey = API_KEYS.filter(function (k) { return !WA.panelOverviewBlocks || typeof WA.panelOverviewBlocks[k] !== 'function'; });
    A(missKey.length === 0, 'D4c 导出面 9 个成员齐（缺 ' + missKey.length + '：' + missKey.join(',') + '）');
    //   六个块各自**非空**：这是「被 try/catch 吞成空串」那一族的机器化钉
    const nonEmpty = [];
    FN.slice(1).forEach(function (k) {
      let out = '';
      try { out = String(WA.panelOverviewBlocks[k]() || ''); } catch (e) { out = ''; }
      if (out.length > 40) nonEmpty.push(k);
    });
    A(nonEmpty.length === 8, 'D4d 八块各自产出非空读数（实 ' + nonEmpty.length + '/8；v22 / v23 块收进段体后 FN.slice(1) 已含它们）—— 漏注入/漏装载都会让这里归零');
    //   真实渲染路径：点页签 → renderBody → innerHTML 解析 → bindBody
    const panel = dom.getElementById('wa-panel');
    const tab = panel && panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'overview'; })[0];
    A(!!tab, 'D4e 概览页页签在树中（buildPanel 渲染了该页入口）');
    if (tab) tab.click();
    const ovBody = panel.querySelector('.wa-body');
    const folds = ovBody ? ovBody.querySelectorAll('.wa-fold') : [];
    // ── v2.400.0（V22 EXV22-9）：六块 → **七块**，且第七块必须是 v22 块 ────────
    //   为什么口径从「=== 6」改成「=== 7 且含 v22 块」而不是简单改成「=== 7」：
    //     「数到 7」不区分「第七块是 v22 块」与「有人把某一块复制了一遍」。
    //     后者的读数完全同形（都是 7），但它意味着概览页多出一块重复诊断 —— 而这
    //     正是本锁要防的那类「看起来正常」的塌陷。故必须点名第七块的身份。
    //   为什么用**摘要标签**点名而不是 id：本模块零 id 零控件是硬纪律（D1g/D1h/D4h），
    //     用它自己产出的可见文本（摘要第一段「V22 制度读数」）识别，才不违反这条纪律。
    //   为什么点名「V22 制度读数」而不是摘要里的「八项同屏」：后者是**说明文字**，
    //     改文案就会红；前者是这块折叠壳的**标签**，与 foldCard 的 label 参数同源，
    //     语义上是「这一块叫什么」—— 判据该问的正是这个。
    const V22_LABEL = 'V22 制度读数';
    //   v2.402.0（V23）：第八块的标签（v23StitchBlock 的 foldCard label）。同上口径：
    //   取块标签而不是说明文字 —— 改文案不该红，换掉块才该红。
    const V23_LABEL = 'V23 缝合线';
    A(folds.length === 8, 'D4f 概览页渲染出 8 个折叠壳（实 ' + folds.length + '）'
      + ' —— 拆段后六块仍全部在位，且 EXV22-9 的第七块（八项同屏）已挂上');
    //   摘要含真读数（不是空壳）。
    //   ⚠ 阈值不能定成「长度 > 8」：本轮实测最短的合法摘要是「对外桥：休眠」= 6 字符。
    //     定 8 会把一条**正确**的读数判成红 —— 而假红与假绿同罪（本仓裁决：判据测的
    //     不是它声称的东西时，红灯同样不可信）。判据要问的是「摘要有没有在说事」，
    //     故改用**结构性**条件：含全角冒号（「标签：状态」两段式）且冒号后有内容。
    const sumText = function (f) {
      const s = f.querySelector('summary');
      if (!s) return '';
      let t = s._text || '';
      s.childNodes.forEach(function (c) { t += (c.nodeType === 3) ? (c._text || '') : (c.textContent || ''); });
      return t;
    };
    const withText = folds.filter(function (f) {
      const t = sumText(f);
      const ci = t.indexOf('：');
      return ci > 0 && t.length > ci + 1;
    });
    A(withText.length === 8, 'D4g 八个折叠壳的摘要都是「标签：状态」两段式且冒号后有内容（实 ' + withText.length + '/8）');
    //   第七块的身份点名：渲染产物里必须**真有一块**的摘要带 v22 标签。
    //   这条与 D4f 是两道，不是重复：D4f 问「几块」，本条问「第七块是谁」。
    //   负控制（N9）把 v22OmensBlock() 的渲染调用删掉时，D4f 与 D4g 会同时掉到 6，
    //   而本条会直接点出「v22 块不在树中」—— 三条一起说清是哪一块没了。
    const v22Fold = folds.filter(function (f) { return sumText(f).indexOf(V22_LABEL) >= 0; });
    const v23Fold = folds.filter(function (f) { return sumText(f).indexOf(V23_LABEL) >= 0; });
    //   v2.402.0（V23）：同一条判据补第八块的身份 —— 数到 8 不等于「第八块是对的」
//   （复制一块也是 8）。与 overview-fold-v2254 的 B1c 同口径。
  A(v23Fold.length === 1, 'D4g3 概览页里恰有 1 块是 V23 缝合线的「' + V23_LABEL + '」（实 ' + v23Fold.length
    + '）—— 第八块的身份必须点名，否则「复制一块」也能凑成 8');
  A(v22Fold.length === 1, 'D4g2 概览页里恰有 1 块是 EXV22-9 的「' + V22_LABEL + '」（实 ' + v22Fold.length
      + '）—— 第七块的身份点名，不是只数个数');
    //   零 id 零控件在**渲染产物**上也成立（不只是源码层）
    const ids = folds.reduce(function (a, f) { return a + f.querySelectorAll('[id]').length; }, 0);
    A(ids === 0, 'D4h 八块折叠壳合计零 id（实 ' + ids + '）—— UI_BINDINGS 守卫面不受影响'
      + '（EXV22-9 第七块同样零 id 零控件，只拼字符串）');
  }
//   ── D5 esc 注入双向核对 ──
  //   正向：panel.js 的转发函数确实注入了 esc（写成 `bind({ esc: esc })`）。
  //   ⚠ **必须在去注释面上查**。本轮负控制实测戳穿过一版假绿：本判据原来直接对
  //     `rd(PANEL_REL)` 做正则，而转发块上方的说明注释里就写着
  //     「`WA.panelOverviewBlocks.bind({ esc: esc })`」——于是把真调用注释掉之后，
  //     正则**仍然命中注释**、D5a 照旧绿。判据被「说明文字」满足，是典型的
  //     「判据测的不是它声称的东西」（本仓对假绿的裁决同样适用于假绿：红灯与绿灯
  //     都只有在测到真东西时才有意义）。故这里先剥注释面。
  const panelCode = stripComments(panelSrc);
  A(/WA\.panelOverviewBlocks\.bind\(\{\s*esc:\s*esc\s*\}\)/.test(panelCode),
    'D5a panel.js 真把 esc 注入了段模块（bind({ esc: esc })；在**去注释面**上查，避免被说明文字满足）');
  //   反证：注释面里确实有这句字样 ⇒ 上一条的去注释不是多余动作
  A(/WA\.panelOverviewBlocks\.bind\(\{\s*esc:\s*esc\s*\}\)/.test(panelSrc),
    'D5a2 注释面上也有这句字样（证明 D5a 的 stripComments 是必要的，不是空转）');
  //   反向：段体里 esc 调用次数与拆前一致（57 处）—— 少一处就说明搬迁时改动了逻辑
  const escCalls = (body.match(/(^|[^\w$.])esc\s*\(/g) || []).length;
  //   v2.402.0（V23）：60 → 63（+3，v23 块的三个读者标签 / 两种状态文本 / 缺席说明）。
  A(escCalls === 63, 'D5b 段体 esc 调用 63 处（实 ' + escCalls + '；335 行时代 57 处 + v22 块 3 处 + v23 块 3 处）—— 搬迁不得改动任何一处转义点');
  //   段模块自己的 esc 兜底必须是**恒等**（不转义）：否则 bind 之前就凭空多一份转义实现
  A(blk.indexOf("let esc = function (s) { return String(s == null ? '' : s); };") > 0,
    'D5c 段模块的 esc 兜底是恒等（不制造第二份转义实现）');
}
/**
 * D 段负控制（真源码破坏）。三条，各钉一个「拆段假绿」的形态：
 *   N6 摘掉 bind ⇒ 六块仍能渲染但 esc 变成恒等 ⇒ 转义丢失（**这是最隐蔽的一种**：
 *      页面照常、字数照常，只有含 `<` 的文本会以裸标签形态出现）；
 *   N7 段体里删掉一个函数 ⇒ 导出面缺成员 / 六块少一块；
 *   N8 去掉 panel.js 的 BEGIN 标记 ⇒ panelSource() 必须抛（重组面不可能「尽力而为」）。
 * 破坏一律打在**内存副本**或临时文件上，不碰仓库真源码（D 段不像 N1 那样需要真改
 * run.js：它要证明的是「面板源码面可被精确重组」，而那件事用内存副本就能证到位）。
 */
function runDNeg(A) {
  const ps = require(path.join(BASE, PS_REL));
  const panelSrc0 = rd(PANEL_REL);
  const blk0 = rd(BLOCKS_REL);
  // ── N6 摘掉 bind 调用 ⇒ esc 变恒等 ⇒ 转义丢失 ──
  //   判据：把 bind 那行注释掉，段模块自己的 esc 兜底就是恒等 ⇒ 含 `<` 的输入不再被转义。
  //   这里直接驱动段模块（不经面板），因为要证的正是「bind 是唯一注入通道」。
  {
    const bindLine = 'if (typeof WA.panelOverviewBlocks.bind === \'function\') WA.panelOverviewBlocks.bind({ esc: esc });';
    A(panelSrc0.indexOf(bindLine) > 0, 'N6a 找到 bind 调用行（负控制的前提）');
    const broken = panelSrc0.replace(bindLine, '/* NEGCTL-OPV22-4 不注入 esc */');
    A(broken !== panelSrc0, 'N6b 内存副本确实改到了 bind（否则 N6 是空转）');
    //   用 vm 在**独立上下文**里装一份「没注入」的段模块，再喂一个含 `<` 的字符串
    let noEscOut = '', withEscOut = '';
    try {
      const vm2 = require('vm');
      const box = { window: {}, console: { log: function () {} } };
      box.window.WorldAxis = {};
      vm2.createContext(box);
      vm2.runInContext(blk0, box);
      //   不注入：兜底恒等 ⇒ `<b>` 原样输出
      noEscOut = String(box.window.WorldAxis.panelOverviewBlocks.foldCard('<x>', '<b>', 'b', false));
      //   注入一个可识别的转义函数 ⇒ 输出里应出现转义后的形态
      box.window.WorldAxis.panelOverviewBlocks.bind({ esc: function (s) { return 'ESC[' + String(s) + ']'; } });
      withEscOut = String(box.window.WorldAxis.panelOverviewBlocks.foldCard('<x>', '<b>', 'b', false));
    } catch (e) { noEscOut = 'THREW:' + (e && e.message); }
    A(noEscOut.indexOf('ESC[') < 0 && noEscOut.indexOf('<b>') >= 0,
      'N6c 未注入 esc 时原文直出（`<b>` 原样，无 ESC[）—— 证明「漏注入」是可观测的');
    A(withEscOut.indexOf('ESC[') >= 0,
      'N6d 注入 esc 后转义生效（输出含 ESC[）⇒ D5a 的 bind 不是摆设');
    A(noEscOut !== withEscOut, 'N6e 注入前后输出不同 ⇒ 「注入」这件事真的有语义后果');
  }
  // ── N7 段体里删掉一个函数 ⇒ 导出面缺成员 ──
  {
    const anchor = '  function heartbeatBlock() {';
    A(blk0.indexOf(anchor) >= 0, 'N7a 找到 heartbeatBlock 定义（负控制的前提）');
    //   在内存副本里把函数名改掉（等价于「漏搬一个函数」）
    const brokenBlk = blk0.replace(anchor, '  function heartbeatBlock_RENAMED() {');
    A(brokenBlk !== blk0, 'N7b 内存副本确实改到了函数名（否则 N7 是空转）');
    let threw = '', keys = [];
    try {
      const vm2 = require('vm');
      const box = { window: {}, console: { log: function () {} } };
      box.window.WorldAxis = {};
      vm2.createContext(box);
      vm2.runInContext(brokenBlk, box);
      const api = box.window.WorldAxis.panelOverviewBlocks || {};
      keys = Object.keys(api);
    } catch (e) { threw = e && e.message; }
    //   函数名被改后，API 里的 heartbeatBlock 会指向 undefined（或装载期抛错）
    A(threw !== '' || keys.indexOf('heartbeatBlock') >= 0,
      'N7c 漏搬一个函数 ⇒ 装载抛错或导出面异常（threw=' + (threw || '无') + '，keys=' + keys.length + '）');
    //   正证：原版段文件装载后 heartbeatBlock 是函数（与 N7c 配对，证明 N7c 非空转）
    const vm2b = require('vm');
    const box2 = { window: {}, console: { log: function () {} } };
    box2.window.WorldAxis = {};
    vm2b.createContext(box2);
    vm2b.runInContext(blk0, box2);
    A(typeof box2.window.WorldAxis.panelOverviewBlocks.heartbeatBlock === 'function',
      'N7d 正证：原版装载后 heartbeatBlock 是函数（与 N7c 配对）');
  }
  // ── N8 去掉 BEGIN 标记 ⇒ panelSource() 必须抛，不许「尽力而为」 ──
  {
    const hasB = panelSrc0.indexOf(ps.MARK_BEGIN) >= 0;
    A(hasB, 'N8a 真源码里有 BEGIN 标记（负控制的前提）');
    //   在内存副本上抹掉标记，用同款算法重组 ⇒ 必须抛
    const noMark = panelSrc0.replace(ps.MARK_BEGIN, '/* MARK-REMOVED */');
    A(noMark !== panelSrc0, 'N8b 内存副本确实抹掉了标记（否则 N8 是空转）');
    //   复刻 panelSource 的标记检查（不真写盘）：标记数不为 1 即抛
    const lines = noMark.split('\n');
    const nb = lines.filter(function (l) { return l.indexOf(ps.MARK_BEGIN) >= 0; }).length;
    A(nb === 0, 'N8c 抹掉后 BEGIN 标记数归零（实 ' + nb + '）⇒ panelSource() 会抛而不是返回半成品');
    //   正证：真源码上标记恰 1（与 N8c 配对）
    const nb0 = panelSrc0.split('\n').filter(function (l) { return l.indexOf(ps.MARK_BEGIN) >= 0; }).length;
    A(nb0 === 1, 'N8d 正证：真源码 BEGIN 标记恰 1（实 ' + nb0 + '）');
  }
  // ── N9 纯度：全部负控制跑完后两份真源码逐字未变 ──
  A(rd(PANEL_REL) === panelSrc0, 'N9a 全部负控制跑完后 ui/panel.js 逐字未变');
  A(rd(BLOCKS_REL) === blk0, 'N9b 全部负控制跑完后 ui/pages/overview-blocks.js 逐字未变');
}

// ────────────────────────────── 入口 ──────────────────────────────
/**
 * 执行顺序刻意是 **N → A → B → C**，不是 A → B → C → N。
 *   理由：C4 要读「真仓库的干净扫描」，而这份扫描由 N1b 产出（它在破坏前扫的就是
 *   仓库真实状态）。若先跑 C，就得自己再扫一次 —— 每次 scan 4.2s，本锁只允许 ~10s。
 *   这不削弱任何断言：N 段的所有断言都是**相对破坏前**的，与 A/B/C 无依赖；
 *   A/B/C 只读源码文本与结构，也不依赖 N 留下的状态（N 结束时已逐字节还原并核对 sha）。
 *   反过来，N 先跑还能让 C4 顺带证明「负控制跑完后仓库回到干净态」——
 *   这正是 sharedScan 取到的那份读数。
 *
 * D 段（面板拆段）排在最后：它自己会 require ui-gate-sync 并装载整个 ui 层（约 2–3s），
 *   而 A/B/C/N 都只读源码文本 —— 把它放最后，前面任何一条红都不必白付这段装载开销。
 *   D 段的负控制（DNeg）在 D 之后立刻跑，因为它读的是 D 已经读过的同一份源码。
 */
function runAll(A) { runN(A); runA(A); runB(A); runC(A); runD(A); runDNeg(A); }
module.exports = {
  SEG_REL: SEG_REL, RUN_REL: RUN_REL, SEG_TITLE: SEG_TITLE,
  BASE_SECTION_CC: BASE_SECTION_CC, BASE_ASSERT_CC: BASE_ASSERT_CC,
  BASE_TEST_FILES: BASE_TEST_FILES,
  // runNegative 指向同一个 N：run.js 里 runAll / runNegative 各调一次是既有约定，
  //   但本锁的 N 段**不能跑两遍**（它要真改 run.js 并 spawn 门禁，跑两遍会双倍耗时
  //   且第二次的「破坏前」已经不是干净态）。故这里把 runNegative 导出为 null，
  //   run.js 侧只挂 runAll 一次；并由 A1 断言「run.js 里本锁只被挂一次」。
  runAll: runAll, runNegative: null
};
if (require.main === module) {
  let P = 0, F = 0;
  const A = function (c, m) { if (c) { P += 1; } else { F += 1; console.log('  ✗ ' + m); } };
  // runAll 已包含 N（顺序 N→A→B→C），故这里**只调一次**。
  //   若再单独调 runNegative，N 会跑第二遍：双倍耗时，且第二次的「破坏前」已不是干净态。
  try { runAll(A); } catch (e) { F += 1; console.log('  ✗ 异常：' + e.message); }
  console.log('SEGMENT-EXTRACT-V2400: ' + (F === 0 ? 'pass（' + P + ' 项）' : 'FAIL ' + F + ' / ' + (P + F)));
  process.exit(F === 0 ? 0 : 1);
}

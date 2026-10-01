#!/usr/bin/env node
// WorldAxis tools/anchor-scan.js —— v2.126.0（优化计划 P8）
//
// 【它治的病】
//   `tests/negative-control-audit.js`（v2.104.0）只覆盖「导出 `ANCHORS` 且形态统一（`{rel, txt}`）」
//   的锁 —— 实测 20/103。其余 82 把锁的锚点**无人核**：它们里的锚点漂了（从源码里消失、或
//   在本文件里出现多次），没有任何读数会说话，而每一把这样的锁的负控制都会**静默哑火**
//   （锚点没打中 ⇒ 破坏副本等于原版 ⇒ 负控制恒绿）。
//
// 【本办法】
//   在**不改变既有统一档判据**的前提下，把覆盖面推到非统一形态：按一组**具名形态模式**
//   在锁源码里认出「锚点原文」与「目标文件」，逐条核两件事 ——
//     ① 唯一性：锚点原文在目标文件里恰中 1 次（0 次 = 漂了；≥2 次 = 判据分不清打在哪）；
//     ② 纯度：锚点原文在**本文件**（锁自己）里恰出现 1 次（判据不得抄锚点串 —— H5）。
//
// 【诚实边界（P8 计划原文：形态不一的如实归 unidentified，只报不红）】
//   · 认不出形态的锁如实进 `unidentified`，**不假装已覆盖**（列表逐条列出，可人工排查）。
//   · 认得出形态的进 `scanned`，其问题写进 `issues` —— **本版只报不红**：
//     判据（红/绿）仍由 `tests/negative-control-audit-v2104.js` 对**统一档**把住，
//     本工具的价值是「让 82 把锁的锚点第一次有了读数」。这是刻意的分步：
//     先让不可见的可见，再谈把哪一档升格成门禁。
//   · 启发式必然有假阳/假阴：所有判定都带 `pattern`（哪条模式认出来的）与 `evidence`，
//     读的人可以对着证据复核，而不是只看一个数字。
//
// 用法：node tools/anchor-scan.js [--json]
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const TESTS = path.join(BASE, 'tests');
const AUDIT = require(path.join(TESTS, 'negative-control-audit.js'));

/** 形态模式：每条给出「怎么认锚点原文 / 怎么认目标文件」。全部**只读文本**，不 require 被测锁。 */
const PATTERNS = [
  // ── 锚点原文 ────────────────────────────────────────────────
  // v2.131.0（O18）：**前缀面收窄是 v2.126.0 覆盖率只有 39.81% 的唯一主因**。
  //   现场实测（/tmp/unid.txt 的 62 把未识别锁）：里的长字符串常量前缀分布是
  //     A_ 352 · （无下划线）20 · B_ 15 · NEW_ 2 · M_ 2 · DEF_ 1 · CHAT_ 1 · OLD_ 1
  //   而原模式只认 `ANCHOR*` ⇒ **352 个锚点一条都认不出**，58 把锁因此整体进 unidentified。
  //   修正为「具名锚点常量」形态：全大写/蛇形命名、且**不以 `REL|FILE|PATH|MOD` 等文件常量名开头**
  //   （那些归 target 面），值必须是**长字符串**（≥8 字，与既有噪声门同宽）。
  //   前缀不加限制会误收 `const TAG = '...'` 这类短测试标记——由长度门挡住（TAG 一般 <8 或非锚点语义）。
  { id: 'anchor-const', what: 'const <NAME> = "…"（具名锚点常量：ANCHOR_* / A_* / B_* / NEW_* / M_* 等）',
    re: /\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*(['"`])([\s\S]*?)\2\s*;/g,
    kind: 'anchor', group: 3,
    // v2.131.0（O18）修订二：窄门=**值拒收表**（见 `VALUE_DENY` 与 extract 内的取值）。
    //   现场证伪（/tmp/wa_o18_diag3.js，全仓 82 把非统一档锁实测）：
    //     · 旧判据「引用纯度」（值以 `from: NAME` 被引用）会**误杀 134 条真锚点**
    //       —— `ANCHOR_ROWS`（audit-vol）、`A_RUN`（b7-rehearsal）等真锚点并不用 `from:` 引用；
    //     · 噪声共 53 条，其值 100% 是**非代码片段**：`TAG = '__b2v2117_'`、
    //       `LS_KEY = 'worldaxis_parallel_settings_v1'`、`causal.chains`、`README.md`。
    //   故唯一分界是**值的形态**，判据落在 `VALUE_DENY` 一处（单一真源）。
    //   修订五（自证驱动）：原 `valueForm: /[^\w$]/` 经 `--self-test` 实测**零贡献**
    //     —— 它挡的全被 `VALUE_DENY`（更宽：含 `.` `/` `\` `-`）挡住，属冗余判据，已删除。
    // 反向排除：文件常量（相对路径形态）归 target 面，不当锚点。
    exclude: function (name, val) {
      return /^(REL|FILE|PATH|MOD|SRC|TARGET)[A-Z0-9_]*$/.test(name)
        || /^[a-z][\w.-]*\/[\w.-]+\.js$/.test(val)
        // v2.133.0（O18 第二刀）：**声明串**（`const A = 'x', B = 'y';`）不是锚点原文。
        //   现场取证（/tmp/wa_o18g.js，全仓非统一档锁实测）：`anchor-const` 的 5 条假锚点
        //   100% 是声明串 —— journal-v2940（`ORG` / `STORE` / `DIAG` / `PANEL` 一条串）、
        //   perf-recalc-v2123（两条）、life-turn-v2132、rumor-e3-v2115
        //   （`PLAIN = '甲', EYE = '乙', FAR = '丙'`，短名测试常量）。
        //   共同形态：值里出现「逗号 + `NAME = '…'`」= 一条串装了**多个常量**。
        //   这类是 `file-const-multi` 的猎物（归 target 面），不是锚点原文。
        //   不误杀真锚点：真锚点（`A_*` / `ANCHOR_*` / `B_*`）的值里没有次级声明。
        || /,\s*[A-Z][A-Z0-9_]*\s*=\s*['"`]/.test(val);
    } },
  // v2.133.0（O18 第二刀）**翻案**：v2.131.0 曾以「`--self-test` 实测零贡献」为由删掉本模式。
  //   现场证伪（/tmp/wa_o18j.js 变体对照 + /tmp/wa_txt2.js 全仓取证）：那条结论是**判据范围**造成的假象 ——
  //   v2.131.0 的自证口径是「**已识别锁**的锚点总量」（`ex.anchors.length && ex.targets.length`），
  //   而 `txt:` 字段在非统一档锁里**只存在于 journal-v2940.js 一把**，它当时因目标面认不出
  //   （声明串形态）整体落在 `unidentified` ⇒ 它那 6 条 txt 锚点**从不进入统计** ⇒ 「零贡献」。
  //   实测：修好目标面（`file-const-multi`）后，journal-v2940 的锚点 1 条 → **7 条**（+6 条全是 txt）。
  //   这是本仓「代理判据」教训的又一例：判据范围（只统计已识别锁）与被测对象（识别能力）不是同一件事。
  //   故本模式**恢复**，并把自证范围一并改成「全部锚点总量」（见 `totalAnchors` 的口径注释）。
  { id: 'txt-field', what: 'txt: "…"（破坏锚点的 txt 字段，ANCHORS 表形态）',
    re: /\btxt\s*:\s*(['"`])([\s\S]*?)\1/g,
    kind: 'anchor', group: 2 },
  { id: 'from-field', what: 'from: "…"（破坏锚点的 from 字段）',
    re: /from\s*:\s*(['"`])([\s\S]*?)\1/g,
    kind: 'anchor', group: 2, requireEnd: true },
  // ── 目标文件 ────────────────────────────────────────────────
  // v2.133.0（O18 第二刀）：**`const` 声明串**——一条 `const` 语句里可能装多个文件常量。
  //   形态一（单条）：`const REL = 'engines/x.js';`
  //   形态二（声明串）：`const ORG = 'engines/org.js', STORE = 'core/store.js', DIAG = '…';`
  //   为什么合并成一条而不是留两条：本仓「零消费能力当场删」纪律 —— 摘除自证实测
  //   （/tmp/wa_abl.js）单条版 `file-const` 摘掉后 **anchors / targets / locks 三项零变化**
  //   （它的猎物全被本模式的 `each` 一并收走）⇒ 留着它就是一条不参与判定的死判据。
  //   合并后外层 re 用 `[^;]*?`（**允许跨行**），把单条版原本独占的「跨行声明」形态也吃进来，
  //   能力只增不减。each 要求 `NAME = 'dir/name.js'`（全大写常量 + `=`），
  //   故对象字段（`rel: 'x/y.js'`）不会被误收 —— 小写 key 不匹配。
  //   现场形态（三把锁实测）：journal-v2940（`ORG` / `STORE` / `DIAG` / `PANEL` 一条串）、
  //   perf-recalc-v2123（`BUDGET` / `INJECT` / `PERF` / `DIAG` / `PANEL`）、
  //   life-turn-v2132（`LIFE` / `DIAG` / `PANEL`）。它们此前全部落在「认不出目标文件」。
  //   为什么值得宽化而不是「让作者改写法」：这是**本仓自己的惯用写法**（一行钉住本锁
  //   关心的全部目标文件），要求作者拆成多行等于「为了迁就扫描器而改源码形态」——
  //   扫描器该适配真实写法，不是反过来。
  //   边界（如实登记）：只吃「声明串里**字面量**形式的 `NAME = 'dir/name.js'`」；
  //   `const A = 'x', B = path.join(...)` 这种混合形态的第二项仍认不出（如实登记，
  //   不为它写更宽的正则——那会把 `foo: 'a/b.js'` 这类对象字段也吞进来）。
  { id: 'file-const-multi', what: "const A = 'engines/x.js'; / const A = 'x', B = 'engines/y.js';（声明串里的文件常量）",
    re: /\bconst\s+([^;]*?)\s*;/g,
    kind: 'target', group: 0,
    each: /\b([A-Z][A-Z0-9_]*)\s*=\s*(['"`])([a-z][\w.-]*\/[\w.-]+\.js)\2/g },
  { id: 'path-join', what: 'path.join(BASE, "rel")',
    re: /path\.join\(\s*BASE\s*,\s*(['"])([a-z][\w.-]*\/[\w.-]+\.js)\1\s*\)/g,
    kind: 'target', group: 2 },
  { id: 'src-override', what: "{ 'rel': … }（srcOverride 的键）",
    re: /srcOverride\s*:\s*\{\s*(['"])([a-z][\w.-]*\/[\w.-]+\.js)\1/g,
    kind: 'target', group: 2 },
  // v2.131.0（O18）：**目标面第二档**——原先 4 把锁卡在「认不出目标文件」。
  //   现场形态是 `const REL = 'engines/x.js'` 之外的三种：数组元素、对象值、模板拼接。
  { id: 'rel-array', what: "['engines/x.js'] / [ 'rel' ]（数组里的相对路径）",
    re: /\[\s*(['"])([a-z][\w.-]*\/[\w.-]+\.js)\1\s*\]/g,
    kind: 'target', group: 2 },
  { id: 'rel-plain-value', what: "rel: 'engines/x.js'（对象字段里的相对路径）",
    re: /(?:\brel|\bpath|\bfile)\s*:\s*(['"])([a-z][\w.-]*\/[\w.-]+\.js)\1/g,
    kind: 'target', group: 2 },
  // ── v2.134.0（O18 第三刀）：**站点表记录形态**（配对核验） ─────────────
  //   现场形态（8 把未识别锁里占 5 把，/tmp/wa_o18_3detail.js 逐条取证）：
  //     · input-guard-v2840：`{ name: 'hazard.bump', rel: 'engines/hazard.js', anchor: "…" }`
  //     · orphan-lock-v2750：`{ rel: 'tests/…', engine: 'engines/intel.js', tag: '…', anchor: "…" }`
  //     · reference-isolation-lock-v2790：`{ rel: 'engines/…', api: '…', copyAnchor: 'const c = {};', breakInto: '…' }`
  //     · evict-meta-v2610：`{ name: 'backstage.people', file: 'engines/backstage.js', neu: '…', old: '…' }`
  //     · rel-contract-v2600：`{ name: 'people', neu: '…', old: '…' }`
  //   为什么单列一种 kind：**一条记录一对（目标 ↔ 锚点）**，而扫描器的既有模型是
  //   「锚点全集 × 目标全集」的笛卡尔积 —— 于是「同一段锚点原文出现在两条不同记录的
  //   各自目标里」会被报成 `ambiguous-target`（归属不明），可它其实**归属明确**。
  //   配对后：锚点只对它**自己那条记录**里的目标核（见 `own` 与 `scanLock`）。
  { id: 'record-site', what: "{ rel|file|engine: '…', anchor|copyAnchor|neu: '…' }（站点表记录：锚点与目标同记录）",
    //   外层为什么要 `(?:\{[^{}]*\}[^{}]*)*` 而不是裸 `[^{}]*`：锚点**值里本身带大括号**——
    //   现场（/tmp/o18_3cli.log 第一版读数）：`copyAnchor: 'const c = {};'`（reference-isolation）
    //   与 `neu: '…"resources":{},'`（rel-contract）两把锁**整体认不出**，正是因为裸 `[^{}]*`
    //   在值的 `{}` 处提前收尾，记录被截断成不含完整锚点值的半截。
    //   允许**一层**嵌套后两把锁均认得出（实测：未识别 2 → 0）；再深的嵌套不在现场，
    //   不为它写更宽的正则（那会把函数体等大块代码当成记录吞进来）。
    re: /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g,
    kind: 'pair',
    tgt: /\b(?:rel|file|engine|path)\s*:\s*(['"])([a-z][\w.-]*\/[\w.-]+\.js)\1/g,
    anc: /\b(?:anchor|copyAnchor|neu)\s*:\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g },
  // ── 自由锚点形态（非记录） ──────────────────────────────────────────
  //   · style-craft-v2510：`const anchor = 'const PERSP_TEXT = {';`（局部锚点常量）
  //   · tools-v2110：`wreck(src23, '  if (existed && prev.indexOf(SIGN) < 0 …', …)`（破坏调用第 2 实参）
  { id: 'local-anchor-const', what: "const anchor = '…'（局部锚点常量）",
    re: /\bconst\s+anchor\s*=\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g,
    kind: 'anchor', group: 2 },
  { id: 'wreck-arg', what: "wreck(src, '…', …)（破坏调用的第 2 实参）",
    re: /\bwreck\(\s*[^,]+,\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g,
    kind: 'anchor', group: 2 },
  //   · docs-archive-gate-v2120：`{ rel: README_REL, text: '## 版本历史' }` —— `rel` 是**标识符**
  //     （不是字面量），故它不进配对面；锚点是**文档标题 / 段落片段**，同样是真破坏锚点
  //     （该锁的 `breakOnce` 要求它在目标文档里恰 1 次），单列一条字段形态认它。
  { id: 'text-field', what: "text: '…'（文档标题 / 段落片段型锚点字段）",
    re: /\btext\s*:\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g,
    kind: 'anchor', group: 2 },
  // ── 目标面补形态 ──────────────────────────────────────────────────
  //   · orphan-lock-v2750 的 `engine: 'engines/intel.js'` **不单列形态**：它的猎物
  //     已被 `record-site` 的 `tgt` 子模式（含 `engine`）一并收走 —— 现场摘除实测
  //     （/tmp/o18_3abl.js）单列版摘掉后 **锚点/目标/锁/配对四项零变化**，即死判据，
  //     按本仓「零消费能力当场删」纪律删除。
  //   · tools-v2110：`const src23 = srcOf('tools/gen-lock.js');`（取源码文件的调用）
  { id: 'srcOf-call', what: "srcOf('tools/x.js')（取源码文件的调用）",
    re: /\bsrcOf\(\s*(['"])([a-z][\w.-]*\/[\w.-]+\.js)\1\s*\)/g,
    kind: 'target', group: 2 },
  //   · docs-archive-gate-v2120：`const README_REL = 'README.md';`（**文档**文件常量；
  //     既有 `file-const-multi` 只收 `…/….js`，文档门的目标文件因此认不出）
  { id: 'file-const-doc', what: "const NAME = 'README.md'（文档文件常量）",
    re: /\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*(['"])([\w.-]+\.md)\2/g,
    kind: 'target', group: 3 }
];
/** 自引用排除：本工具与统一档审计器本身不是被测锁。 */
const SELF = ['anchor-scan.js'];
/**
 * v2.131.0（O18）：**值拒收表**（对所有锚点模式生效）。
 *   值形态门只管「像不像代码片段」；本表管「是代码片段、但确定不是锚点原文」的形态：
 *     · 点分路径 / 相对路径：`causal.chains`、`README.md`、`engines/world.js`
 *       （含 `.` 或 `/` 却**不含空白**——真代码片段里 `foo.bar` 后面必跟空格或括号）；
 *     · 数据/文档文件名：`README.md`、`ITERATION_LOG.md`。
 *   现场证据：这些值带来 6 条 ambiguous-target 假阳性，且它们恒为**单行无空白**形态。
 */
const VALUE_DENY = /^[\w.$/\\-]+$/;
function hits(s, x) { return x ? s.split(x).length - 1 : 0; }
function isLock(src) { return AUDIT.isLock(src); }

/**
 * v2.131.0（O18）：锚点原文形态归一的**唯一入口**。
 *   现场证伪（/tmp/wa_o18_diag.js）：`A_DELIV` 等真锚点的常量值里写的是**转义序列**
 *   `\\n`（源码里两个字符：反斜杠 + n），而它在目标文件里出现在**多行**位置——
 *   被直接 `split` 去找必然 0 命中（实测 9 条 not-found 里 8 条是这个成因）。
 *   故比对前把锚点原文里的 `\\n|\\t|\\r` 还原成真实控制字符，并把两种形态都试一遍：
 *   命中任一形态即算命中（消除「同一个锚点因写法不同而结论不同」的抖动）。
 */
function forms(v) {
  const un = v.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')
    .replace(/\\'/g, "'").replace(/\\"/g, '"');
  return un === v ? [v] : [v, un];
}
function hitsAny(src, v) {
  const f = forms(v);
  for (let i = 0; i < f.length; i++) if (hits(src, f[i]) > 0) return hits(src, f[i]);
  return 0;
}
function uniqHits(src, v) {
  // v2.131.0（O18）修正：**未命中返回 0**（不是 -1）。初版用 -1 表示「一个形态都没命中」，
  //   结果 `n !== 1` 的分支把它归成 `not-unique`（多命中）——而 -1 与「≥2 次」是两回事。
  //   现场由 `--self-test`/锁 v2126 的破坏自证抓出（破坏副本上应报 not-found 却报了 not-unique）。
  const f = forms(v);
  for (let i = 0; i < f.length; i++) { const c = hits(src, f[i]); if (c > 0) return c; }
  return 0;
}

/** 从锁源码里抽出「锚点原文」与「目标文件」（去重、保序）。 */
function extract(src, pats, deny) {
  const anchors = [], targets = [];
  const seenA = {}, seenT = {};
  const USE = pats || PATTERNS;      // v2.131.0（O18）：注入面——`--self-test` 用破坏版形态表复跑
  const DENY = deny || VALUE_DENY;   // 同上：值拒收表也要可注入（否则自证③无法验它真在参与判定）
  USE.forEach(function (P) {
    P.re.lastIndex = 0;
    let m;
    while ((m = P.re.exec(src))) {
      // v2.134.0（O18 第三刀）：**配对记录**（`kind: 'pair'`）——一条记录里同时取
      //   「目标文件」与「锚点原文」，并让锚点带上 `own`（它自己那条记录的目标集合）。
      //   为什么不走下面的通用路径：通用路径把锚点与目标都丢进两个全集，
      //   归属信息（谁属于谁）**在这一步就丢了**，后面补不回来。
      if (P.kind === 'pair') {
        const own = [];
        let mm;
        P.tgt.lastIndex = 0;
        while ((mm = P.tgt.exec(m[0]))) {
          const tv = mm[2];
          if (tv && tv.length >= 8) { if (!seenT[tv]) { seenT[tv] = 1; targets.push(tv); } own.push(tv); }
        }
        P.anc.lastIndex = 0;
        while ((mm = P.anc.exec(m[0]))) {
          const v = mm[2];
          if (!v || v.length < 8) continue;              // 太短的一律不算锚点（与通用路径同门）
          if (DENY.test(v)) continue;                     // 值拒收表（单一真源，同门）
          const prev = seenA[v];
          if (prev) {
            // 同一段锚点原文出现在多条记录里 ⇒ 归属取**并集**（如实登记，不丢记录）
            own.forEach(function (t) { if (prev.own.indexOf(t) < 0) prev.own.push(t); });
            continue;
          }
          const rec = { txt: v, pattern: P.id, own: P.noOwn ? [] : own.slice() };
          seenA[v] = rec;
          anchors.push(rec);
        }
        continue;
      }
      // v2.133.0（O18 第二刀）：**子模式**（`each`）——外层模式负责切出「一条声明串」，
      //   内层模式在串内逐个取目标。为什么要这层：逗号分隔的声明串里可能同时有多个文件常量
      //   （`const ORG = 'engines/org.js', STORE = 'core/store.js', DIAG = …, PANEL = …;`），
      //   而 `group` 只取得到一个捕获组 —— 单靠分组取不到「一条串里的全部目标」。
      //   只对 `kind === 'target'` 生效（锚点面没有多值形态，不为它加抽象）。
      if (P.each && P.kind === 'target') {
        P.each.lastIndex = 0;
        let e;
        while ((e = P.each.exec(m[0]))) {
          const ev = e[3];
          if (!ev || ev.length < 8) continue;
          if (!seenT[ev]) { seenT[ev] = 1; targets.push(ev); }
        }
        continue;
      }
      const v = m[P.group];
      if (!v || v.length < 8) continue;                      // 太短的一律不算锚点（噪声）
      // v2.131.0（O18）：`exclude(name, val)` 钩子——锚点面要能与目标面**互斥**：
      //   宽化 `anchor-const` 到「任意全大写常量」后，`const REL = 'engines/x.js'` 也会被它先收走，
      //   于是目标面反而落空（现场会看到「认不出目标文件」变多）。钩子把文件常量推回 target 面。
      if (typeof P.exclude === 'function' && P.exclude(m[1], v)) continue;
      // v2.131.0（O18）：**值拒收表门**（`VALUE_DENY`，单一真源）。
      //   现场证据：测试标记（`const TAG = '__b2v2117_'`）与真锚点（`const A_DELIV = "…"`）
      //   行形态一致，差别在**值本身**：锚点是代码片段（含空格/括号/运算符等非词字符），
      //   而 `TAG` / `LS_KEY` / `causal.chains` / `README.md` 这类标量不是锚点
      //   （全仓 53 条噪声 100% 落在 `^[\w.$/\\-]+$`）。此判据不误杀真锚点
      //   （旧的「引用纯度」判据实测误杀 134 条）。
      if (P.kind === 'anchor' && DENY.test(v)) continue;
      // v2.131.0（O18）：**字段形收尾门**（`requireEnd`）。`from:` 字段在破坏表里恒以
      //   `from: "…",` 收尾；但在**注释行**里 `// from: "…"` 也会被裸正则命中。
      //   收尾字符因此是「真 from 字段」与「注释里的散文」的分界（现场实测拒收 8 条）。
      //   锚点常量形态（`const … ;`）自带收尾，不设此门。
      if (P.kind === 'anchor' && P.requireEnd && !/^[,;}\])]?$/.test(src.slice(m.index + m[0].length, m.index + m[0].length + 1))) continue;
      if (P.kind === 'anchor') { if (!seenA[v]) { seenA[v] = 1; anchors.push({ txt: v, pattern: P.id }); } }
      else { if (!seenT[v]) { seenT[v] = 1; targets.push(v); } }
    }
  });
  return { anchors: anchors, targets: targets };
}
/** 单把锁：分类 + 逐锚点核。返回 {file, kind, anchors, targets, problems, unidentified} */
function scanLock(file, readCache) {
  const selfSrc = fs.readFileSync(path.join(TESTS, file), 'utf8');
  const ex = extract(selfSrc);
  const out = { file: file, anchors: ex.anchors.length, targets: ex.targets.length, problems: [] };
  if (!ex.anchors.length || !ex.targets.length) {
    out.kind = 'unidentified';
    out.why = !ex.anchors.length ? '认不出锚点原文（无具名常量 / 无 txt|from 字段）' : '认不出目标文件（无文件常量 / 无 path.join / 无 srcOverride 键）';
    return out;
  }
  out.kind = 'scanned';
  const only = ex.targets.length === 1 ? ex.targets[0] : null;
  ex.anchors.forEach(function (a) {
    // 目标：唯一文件常量时用它；多文件时要求锚点原文至少命中其中一个（否则无从归属）
    let tgt = only, n = -1;
    if (a.own && a.own.length) {
      // v2.134.0（O18 第三刀）：**记录内配对**——锚点只对它自己那条记录里的目标核。
      //   现场取证（/tmp/wa_o18_3detail.js）：不配对时 8 把新识别锁刷出 7 条 `ambiguous-target`
      //   （`orphan-lock` 4 条：锚点同时命中同记录里 `rel` 的测试文件与 `engine` 的产品文件），
      //   而它们**归属明确** —— 配对后按「谁真含锚点原文」定归属。
      let found = null, cnt = 0;
      a.own.forEach(function (t) {
        const c = uniqHits(readCache(t).src, a.txt);
        if (c > 0) { cnt++; found = t; n = c; }
      });
      tgt = cnt === 1 ? found : null;
      if (cnt !== 1) n = -1;
    } else if (tgt) n = uniqHits(readCache(tgt).src, a.txt);
    else {
      let found = null, cnt = 0;
      ex.targets.forEach(function (t) {
        const c = uniqHits(readCache(t).src, a.txt);
        if (c > 0) { cnt++; found = t; n = c; }
      });
      tgt = cnt === 1 ? found : null;
      if (cnt !== 1) n = -1;   // 多处命中或一处未中 ⇒ 统一走「归属不明」归因
    }
    if (n !== 1) {
      // 两种情形分开报：**确定的问题**（单一目标里 0 次或多次）与**归属不明**
      //   （多目标都命中 ⇒ 认不出这锚点属于谁）。混为一谈会让「只报不红」的面刷出一堆
      //   无法行动的条目（本仓纪律：报出来的每一条都要有人能做点什么）。
      out.problems.push({ file: file, pattern: a.pattern,
        kind: (n === 0 && tgt) ? 'not-found' : (tgt ? 'not-unique' : 'ambiguous-target'),
        target: tgt || '(未知)',
        detail: '在 ' + (tgt || '（多个目标）') + ' 命中 ' + (n < 0 ? '?' : n) + ' 次（要求恰 1）',
        evidence: a.txt.slice(0, 70) });
    }
    // 纯度：锚点原文在本文件里恰 1 次（判据不得抄锚点串）
    //   v2.131.0（O18）：两种形态都要核——**任一形态出现 ≥2 次即不纯**（取各形态计数最大值），
    //   否则「转义写法」与「真实换行写法」会给出互相矛盾的两个纯度结论。
    //   附**命中行类别**（本次把「只报不红」的条目变可行动的第三件）：实测 18 条 impure 里
    //     · 多数第一种出现落在 `// 注释`（锁在注释里抄了锚点原文）或落在**目标文件路径常量**里；
    //     · 其余是**两把锚点共用同一片段**（A_WSINK 与 A_MUT 同为 `c.writes = …`）。
    //   两者处置完全不同，故逐条给出「第 1 次命中在注释里 / 第 1 次命中在代码里」。
    const selfN = forms(a.txt).reduce(function (mx, f) { return Math.max(mx, hits(selfSrc, f)); }, 0);
    const f0 = forms(a.txt)[0];
    const fp = selfSrc.indexOf(f0);
    const lineOf = fp < 0 ? 0 : selfSrc.slice(0, fp).split('\n').length;
    const lineStart = fp < 0 ? 0 : selfSrc.lastIndexOf('\n', fp) + 1;
    const lineText = fp < 0 ? '' : selfSrc.slice(lineStart, selfSrc.indexOf('\n', fp));
    const inComment = /^\s*(\/\/|\*|\/\*)/.test(lineText);
    const inlineCmt = lineText.indexOf('//') >= 0 && lineText.indexOf('//') < (fp - lineStart);
    if (selfN !== 1) {
      out.problems.push({ file: file, pattern: a.pattern, kind: 'impure',
        detail: '字面量在本文件出现 ' + selfN + ' 次（要求 1；判据不得引用锚点串）'
          + '［第 1 次在第 ' + lineOf + ' 行' + (inComment || inlineCmt ? '·注释内' : '·代码区') + '］'
          + (selfN > 1 ? '｜若多次均为真锚点声明 ⇒ 锚点共用同一片段（合并或改名）；若含注释 ⇒ 注释抄了锚点原文' : ''),
        evidence: a.txt.slice(0, 70) });
    }
  });
  return out;
}
function scan(opts) {
  const o = opts || {};
  const readCache = (function () {
    const c = Object.create(null);
    return function (rel) {
      if (c[rel]) return c[rel];
      let src = '';
      try { src = fs.readFileSync(path.join(BASE, rel), 'utf8'); } catch (e) { src = ''; }
      c[rel] = { src: src };
      return c[rel];
    };
  })();
  // ① 统一档：**委托**既有审计器（不另写一份判定）
  const uni = AUDIT.audit();
  const uniformFiles = uni.locks.filter(function (l) { return l.kind === AUDIT.KINDS.UNIFORM; })
    .map(function (l) { return l.file; });
  const nonUniformFiles = uni.locks.filter(function (l) { return l.kind === AUDIT.KINDS.NON_UNIFORM; })
    .map(function (l) { return l.file; });
  // ② 非统一档：本工具的启发式面
  const scanned = [], unidentified = [];
  nonUniformFiles.forEach(function (f) {
    if (SELF.indexOf(f) >= 0) return;
    const r = scanLock(f, readCache);
    (r.kind === 'scanned' ? scanned : unidentified).push(r);
  });
  const issues = [];
  scanned.forEach(function (r) { r.problems.forEach(function (p) { issues.push(p); }); });
  return {
    uniform: { locks: uniformFiles.length, anchors: uni.summary.anchors, problems: uni.summary.problems },
    nonUniform: {
      total: nonUniformFiles.length,
      scanned: scanned.length,
      unidentified: unidentified.length,
      anchors: scanned.reduce(function (a, r) { return a + r.anchors; }, 0),
      issues: issues.length
    },
    scanned: scanned,
    unidentified: unidentified.map(function (r) { return { file: r.file, why: r.why }; }),
    issues: issues,
    summary: {
      locksTotal: uni.summary.locks,
      reach: uniformFiles.length + scanned.length,
      reachRate: uni.summary.locks ? Math.round((uniformFiles.length + scanned.length) / uni.summary.locks * 10000) / 100 : 0,
      problems: uni.summary.problems + issues.length,
      gateProblems: uni.summary.problems          // 只把统一档算进门禁（非统一档本版只报）
    }
  };
}
module.exports = { PATTERNS: PATTERNS, extract: extract, scanLock: scanLock, scan: scan, BASE: BASE };

/**
 * v2.131.0（O18）：**`--self-test`（H6 两向自证）**。
 *   为什么必须有：本工具改了形态判据后「覆盖率上升」这件事**无法自证**——
 *   一个只会报绿的判据与一个真在检查的判据，输出一样。故必须证明两件事：
 *     ① 覆盖自证：当前形态表能在**真锁**上认出锚点（≥1 条，且目标文件认得出来）；
 *     ② 破坏可观测：把形态表的模式**逐个摘掉**后，**全仓识别总量**必须改变
 *        （若无变化 ⇒ 该模式不参与任何判定 ⇒ 死判据 ⇒ 当场失败）。
 *   破坏在**副本**上做（真源码形态表不动），符合本仓「破坏可观测」纪律。
 *   判据范围教训一（v2.131.0 现场）：初版自证只拿**单把探针锁**比 —— 在 `b2-travel-v2117.js` 上
 *     `txt-field` / `from-field` / 值门都「无变化」，但它们在**别的锁**上真在贡献锚点
 *     （如 `from-field` 在 `b5-org-v2117.js`）。单锁范围会把真判据误报成死判据，
 *     故范围为**全部非统一档锁**。
 *   判据范围教训二（v2.133.0 现场，**同一类错再犯一次**）：上一版口径是
 *     「**已识别锁**的锚点总量」（`if (ex.anchors.length && ex.targets.length)`），
 *     于是 `txt-field` 被判「零贡献」而遭删除 —— 但真相是 `txt:` 字段只存在于
 *     `journal-v2940.js`，它当时因目标面（声明串）认不出而整体落在 `unidentified`，
 *     那 6 条锚点**从不进入统计**。判据范围（只统计已识别锁）与被测对象（识别能力）
 *     不是同一件事 ⇒ 这就是一条**代理判据**。
 *     本版改为**三个分量分别统计、分别判变化**：`anchors`（全部锁的锚点，含未识别锁）·
 *     `targets`（全部锁的目标，含未识别锁）· `locks`（两面都认得出的锁）。
 *     破坏可观测 = **任一分量变化**即算（锚点模式动 `anchors`，目标模式动 `targets`）。
 */
function totalAnchors(pats, deny) {
  const uni = AUDIT.audit();
  let anchors = 0, targets = 0, locks = 0, owned = 0;
  uni.locks.forEach(function (l) {
    if (l.kind !== AUDIT.KINDS.NON_UNIFORM) return;
    if (SELF.indexOf(l.file) >= 0) return;
    let src = '';
    try { src = fs.readFileSync(path.join(TESTS, l.file), 'utf8'); } catch (e) { return; }
    const ex = extract(src, pats, deny);
    anchors += ex.anchors.length;          // v2.133.0：**不再以「已识别」为门**（教训二）
    targets += ex.targets.length;
    if (ex.anchors.length && ex.targets.length) locks++;
    // v2.134.0（O18 第三刀）：**配对锚点数**（`own` 非空）——配对机制本身也要可观测
    ex.anchors.forEach(function (a) { if (a.own && a.own.length) owned++; });
  });
  return { anchors: anchors, targets: targets, locks: locks, owned: owned };
}
/** 破坏可观测的判据：任一分量变化即算参与判定（否则该模式是死判据）。 */
function observable(full, got) {
  const d = [];
  if (got.anchors !== full.anchors) d.push('锚点 ' + (got.anchors - full.anchors));
  if (got.targets !== full.targets) d.push('目标 ' + (got.targets - full.targets));
  if (got.locks !== full.locks) d.push('已识别锁 ' + (got.locks - full.locks));
  if (got.owned !== full.owned) d.push('配对锚点 ' + (got.owned - full.owned));
  return d;
}
function selfTest() {
  const fails = [];
  const probe = 'b2-travel-v2117.js';
  const src = fs.readFileSync(path.join(TESTS, probe), 'utf8');
  const base = extract(src);
  if (!base.anchors.length) fails.push('覆盖自证失败：' + probe + ' 认不出任何锚点');
  if (!base.targets.length) fails.push('覆盖自证失败：' + probe + ' 认不出目标文件');
  console.log('  ① 覆盖自证：' + probe + ' → 锚点 ' + base.anchors.length + ' 条 / 目标 ' + base.targets.length + ' 个');
  const full = totalAnchors(PATTERNS);
  console.log('  ② 全仓面基线：锚点 ' + full.anchors + ' 条 · 目标 ' + full.targets
    + ' 个 · 两面都认得出的锁 ' + full.locks + ' 把 · 其中配对锚点 ' + full.owned + ' 条');
  // ② 逐个摘掉：**全部模式**（含 target 面）——目标面模式同样必须证明自己在参与判定
  PATTERNS.forEach(function (p) {
    const got = totalAnchors(PATTERNS.filter(function (q) { return q !== p; }));
    const d = observable(full, got);
    console.log('     摘掉 ' + p.id.padEnd(17) + '[' + p.kind + '] ⇒ '
      + (d.length ? '破坏可观测 ✓  ' + d.join(' / ') : '**无变化 ⇒ 死判据** ✗'));
    if (!d.length) fails.push('破坏不可观测：摘掉 ' + p.id + ' 后全仓识别总量不变（死判据）');
  });
  // ③ 值拒收表自证：把 `VALUE_DENY` 放宽到「永不拒收」，全仓锚点总量必须变化（否则它是摆设）
  const withNone = totalAnchors(PATTERNS, /(?:)/);
  const denyChanged = withNone.anchors !== full.anchors;
  console.log('     值拒收表放宽到「永不拒收」 ⇒ 锚点 ' + withNone.anchors + ' 条'
    + (denyChanged ? ' · 可观测 ✓' : ' · **无变化 ⇒ 值拒收表未参与判定** ✗'));
  if (!denyChanged) fails.push('破坏不可观测：值拒收表放宽后全仓识别总量不变');
  // ④ 收尾门自证：把 `requireEnd` 全部摘掉，全仓锚点总量必须变化
  const noEnd = PATTERNS.map(function (p) {
    return p.requireEnd ? Object.assign({}, p, { requireEnd: false }) : p;
  });
  const withEnd = totalAnchors(noEnd);
  const endChanged = withEnd.anchors !== full.anchors;
  console.log('     摘掉 from-field 收尾门 ⇒ 锚点 ' + withEnd.anchors + ' 条'
    + (endChanged ? ' · 破坏可观测 ✓' : ' · **无变化 ⇒ 收尾门未参与判定** ✗'));
  if (!endChanged) fails.push('破坏不可观测：摘掉收尾门后全仓识别总量不变');
  // ⑤ v2.133.0：**`exclude` 钩子自证**。锚点面的 `exclude` 是判据的一部分（把文件常量与
  //   声明串推回目标面），但它不是一条 PATTERN ⇒ 上面的「逐个摘掉」摸不到它。
  //   做法：把 `anchor-const` 的 exclude 换回**基础版**（只挡文件常量名与相对路径值），
  //   全仓锚点总量必须变化（声明串与文件常量会被误收成锚点）。
  const noDecl = PATTERNS.map(function (p) {
    if (p.id !== 'anchor-const' || typeof p.exclude !== 'function') return p;
    const o = Object.assign({}, p);
    o.exclude = function (name, val) {
      return /^(REL|FILE|PATH|MOD|SRC|TARGET)[A-Z0-9_]*$/.test(name)
        || /^[a-z][\w.-]*\/[\w.-]+\.js$/.test(val);
    };
    return o;
  });
  const withDecl = totalAnchors(noDecl);
  const declChanged = withDecl.anchors !== full.anchors;
  console.log('     摘掉 exclude 的声明串门 ⇒ 锚点 ' + withDecl.anchors + ' 条'
    + (declChanged ? ' · 破坏可观测 ✓' : ' · **无变化 ⇒ 该门未参与判定** ✗'));
  if (!declChanged) fails.push('破坏不可观测：摘掉 exclude 声明串门后全仓识别总量不变');
  // ⑥ v2.134.0（O18 第三刀）：**记录内配对自证**。`own` 是判据的一部分（锚点只对它自己
  //   那条记录的目标核），但它不是一个 PATTERN ⇒ 上面的「逐个摘掉」摸不到它。
  //   做法：给配对模式注入 `noOwn`（照旧取锚点与目标，但**丢掉归属**），全仓配对锚点数
  //   必须从 >0 变成 0（即：归属信息真在参与判定，不是装饰）。
  const noOwn = PATTERNS.map(function (p) {
    return p.kind === 'pair' ? Object.assign({}, p, { noOwn: true }) : p;
  });
  const withNoOwn = totalAnchors(noOwn);
  const ownChanged = withNoOwn.owned !== full.owned;
  console.log('     丢掉记录内配对（noOwn） ⇒ 配对锚点 ' + withNoOwn.owned + ' 条（原 ' + full.owned + ' 条）'
    + (ownChanged && full.owned > 0 ? ' · 破坏可观测 ✓' : ' · **无变化 ⇒ 配对未参与判定** ✗'));
  if (!(ownChanged && full.owned > 0)) fails.push('破坏不可观测：丢掉记录内配对后全仓配对锚点数不变');
  if (fails.length) { console.log('  ✗ 自证失败：'); fails.forEach(function (f) { console.log('     · ' + f); }); return 1; }
  console.log('  ✓ 自证通过（覆盖 + 形态表 ' + PATTERNS.length
    + ' 项全摘一遍 + 值拒收表 + 收尾门 + exclude 声明串门 + 记录内配对，全部破坏可观测）');
  return 0;
}
if (require.main === module) {
  if (process.argv.indexOf('--self-test') >= 0) {
    console.log('■ anchor-scan 自证（H6 两向）');
    process.exit(selfTest());
  }
  const r = scan({});
  if (process.argv.indexOf('--json') >= 0) { console.log(JSON.stringify(r, null, 1)); process.exit(0); }
  console.log('■ 锚点扫描器（统一档委托审计器 + 非统一档启发式）');
  console.log('  锁总数 ' + r.summary.locksTotal + ' · 覆盖 ' + r.summary.reach
    + '（' + r.summary.reachRate + '%）＝ 统一档 ' + r.uniform.locks + ' + 非统一档已识别 ' + r.nonUniform.scanned);
  console.log('  统一档：' + r.uniform.anchors + ' 条锚点 · 问题 ' + r.uniform.problems + '（**门禁面**）');
  console.log('  非统一档：' + r.nonUniform.total + ' 把 · 已识别 ' + r.nonUniform.scanned
    + '（' + r.nonUniform.anchors + ' 条锚点）· 未识别 ' + r.nonUniform.unidentified
    + ' · 问题 ' + r.nonUniform.issues + '（只报不红）');
  if (r.issues.length) {
    console.log('  ── 非统一档问题（**只报不红**；逐条附形态与证据，可人工复核）──');
    r.issues.slice(0, 40).forEach(function (p) {
      console.log('    · ' + p.file + ' [' + p.pattern + '] ' + p.kind + '：' + p.detail);
      if (p.evidence) console.log('        证据：' + p.evidence);
    });
    if (r.issues.length > 40) console.log('    …另 ' + (r.issues.length - 40) + ' 条');
  }
  if (r.unidentified.length) {
    console.log('  ── 未识别（如实登记，不假装已覆盖）──');
    r.unidentified.slice(0, 25).forEach(function (u) { console.log('    · ' + u.file + '：' + u.why); });
    if (r.unidentified.length > 25) console.log('    …另 ' + (r.unidentified.length - 25) + ' 把');
  }
  process.exit(r.summary.gateProblems === 0 ? 0 : 1);
}
// WorldAxis tests/toolchain-gate.js (v2.136.0) — 工具链门禁（计划一 O16 收尾面：维护工具运行质量）
//
// 【它治的病】README 的「tools/ 的取舍」里写着一句判据：
//   「**只有被可执行代码引用（或被门禁链引用）的工具才入库**（N 个，`git ls-files tools/ | wc -l` 为准）」
//   —— 而**没有任何一道门禁看过 tools/**：tests/product-files.js 的 SKIP_DIRS 把 tools/ 整个排掉，
//   export-contract / inventory / module-registry / dead-export 四面全部只扫产品面。
//   于是那句判据是**一句没人执行的规则**：某次迭代里把一个零引用脚本加进 tools/ 并跟踪，
//   或让某个工具失去全部引用，读数不会有任何变化、门禁照样全绿。
//   同族第二半：工具是「下一次改动会不会踩坑」的判官（v2.110.0 专锁自述：「一个
//   tools/patch-idempotency.js 判错了一次，代价是整个仓库被重复插入两次代码块」），
//   但它自己**没有入口**时也不会有任何东西告诉你 —— 本仓对门禁/专锁的统一口径是
//   「双向自证」，而 tools/ 从未被要求过。
//
// 【本门禁判什么】三档，全部以**现场读数**为准，**零命中不算通过**
//   ① 在册集合：`git ls-files tools/` 与 README 自述名单**逐字同源**（两份真源当场现形；
//      名单真源只有一处 = README，本文件不另立第二份常量）；
//   ② 引用可达：每个在册工具的**代码行引用**（wired）或注释/文档引用（documented）；
//      两者皆无（orphan）⇒ 报红 —— 那正是 README 那句判据被违反的形态；
//   ③ 入口存在：`--self-test`（selfTest）/ `require.main` 守卫（cli）/
//      纯脚本体（script：无 module.exports 且零绝对路径字面量）三档之一；
//      三者皆无（bare）⇒ 报红。
//      「零绝对路径」这一条是运行质量的实义面：候选树是 isolated-runner 造的临时副本，
//      脚本里写死绝对路径 ⇒ 它 require 的是**别的仓库**（测错对象）。
//
// 【单一真源】入口判据（ENTRY_SELFTEST / ENTRY_CLI）、引用判据（CODE_KINDS）、
//   名单解析（README_SECTION）只在本文件定义一次；专锁与 run.js 一律从这里取。
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const BASE = path.join(__dirname, '..');
const README_SECTION = '### tools/ 的取舍';
const ENTRY_SELFTEST = '--self-test';
const ENTRY_CLI = 'require.main';
const ENTRY_EXPORTS = 'module.exports';
/** 绝对路径字面量：以引号包住的 /tmp、/home、/Users 开头串（含盘符）。 */
const ABS_LITERAL = /['"]\/(?:tmp|home|Users|var|srv)\//;
/** 注释行判定：与 tests/ui-wire-audit.js 同口径（行首空白后 // * /* ），python 用 #。 */
function isCommentLine(ln, ext) {
  const t = ln.replace(/^\s+/, '');
  if (ext === '.py') return t.indexOf('#') === 0;
  return t.indexOf('//') === 0 || t.indexOf('*') === 0 || t.indexOf('/*') === 0;
}
/** git 索引里的路径（真源是索引，不是磁盘 —— 磁盘上的一次性脚本不该被要求）。 */
function trackedPaths(root, prefix) {
  const r = cp.spawnSync('git', ['-C', root || BASE, 'ls-files', prefix], { encoding: 'utf8' });
  if (r.error || r.status !== 0) throw new Error('无法读 git 索引：' + String((r.error && r.error.message) || r.stderr));
  return String(r.stdout).split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
}
/** 在册工具：`git ls-files tools/`。 */
function trackedTools(root) { return trackedPaths(root, 'tools/'); }
/** 已跟踪的测试文件（v2.136.0 补）：dead-ref 判据的分母 —— 只看**索引里**的测试文件。 */
function trackedTests(root) {
  return trackedPaths(root, 'tests/').filter(function (x) { return /\.js$/.test(x); });
}
/** README 自述名单（单一真源）。解析不到 ⇒ 返回 []，由调用方报红（不许静默）。 */
function readmeClaim(root) {
  const p = path.join(root || BASE, 'README.md');
  if (!fs.existsSync(p)) return { names: [], count: null, line: 0 };
  const L = fs.readFileSync(p, 'utf8').split('\n');
  const at = L.findIndex(function (x) { return x.indexOf(README_SECTION) === 0; });
  if (at < 0) return { names: [], count: null, line: 0 };
  const names = [];
  let count = null;
  // 名单句的范围（v2.136.0 实测抓出的第四条自身缺陷）：**不能扫整段**。
  //   现场形态：修 README 同一轮里，我在同段「其余一次性脚本与补丁」下面补了一句
  //   「实测补一处漏网：`patch_o17_v2104` 自 2.104.0 起一直在索引里…」—— 那句是**解释**，
  //   不是名单，但它符合工具名形态门，于是被判成「在名单却不在索引」的假红。
  //   这又是「解释病灶的文字被当成病灶」（本仓 v2.131.0 O16 / v2.133.0 O18 同族）。
  //   名单句的真实形态：以「（N 个，`git ls-files tools/ | wc -l` 为准：」起、以「）。」收尾的
  //   那个括号句。收尾行之后一律不扫。
  let start = -1;
  for (let i = at + 1; i < L.length && i < at + 16; i++) {
    if (L[i].indexOf('git ls-files tools/ | wc -l') >= 0) { start = i; break; }
  }
  if (start < 0) return { names: [], count: null, line: at + 1 };
  for (let i = start; i < L.length && i < start + 12; i++) {
    const ln = L[i];
    if (/^##\s/.test(ln)) break;
    const cm = ln.match(/\uFF08(\d+)\s*\u4E2A/);
    if (cm && count === null) count = Number(cm[1]);
    const re = /`([A-Za-z0-9_.\-]+)`/g;
    let m;
    while ((m = re.exec(ln)) !== null) {
      if (m[1].indexOf('tools/') === 0 || m[1] === 'git ls-files tools/ | wc -l') continue;
      if (/\.(js|py|md|json)$/.test(m[1])) continue;   // 带扩展名的例句不算名单
      // 形态门（v2.136.0 收口期实测）：同段里还有两句**举例说明** —— 「其余一次性脚本与补丁
      //   （`patch_*` / `bump_*` / …）」与「`.gitignore` 已按此口径落规则」，它们也带反引号。
      //   不收形态门就会把 `.gitignore` 收成「在册工具」，于是门禁在正确仓库上报一条假红。
      //   工具名的真实形态：小写字母开头的 kebab/snake 串，**不含通配符、不以点开头**。
      if (!/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(m[1])) continue;
      if (names.indexOf(m[1]) < 0) names.push(m[1]);
    }
    if (/\uFF09\u3002\s*$/.test(ln)) break;   // 括号句收尾 ⇒ 名单结束（后面的解释段不扫）
  }
  return { names: names, count: count, line: at + 1 };
}
/** 仓库内全部可读文本候选（.js/.py/.json/.md），排除 .git 与 node_modules。 */
function textFiles(root) {
  const out = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      if (e.name === '.git' || e.name === 'node_modules') return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      if (/\.(js|py|json|md)$/.test(e.name)) out.push(p);
    });
  })(root || BASE);
  return out.sort();
}
/**
 * 单个工具的现场读数：三档入口 + 引用分布 + 引用样本。
 * 引用面**逐行判**，注释行与 .md 归 documented，其余归 wired（与 ui-wire-audit 同口径）。
 */
function scanTool(rel, opt) {
  const root = (opt && opt.root) || BASE;
  const files = (opt && opt.files) || textFiles(root);
  const name = rel.replace(/^tools\//, '');
  const base = name.replace(/\.[a-z]+$/, '');
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  const ext = path.extname(rel);
  const hits = { wired: [], documented: [] };
  files.forEach(function (f) {
    if (path.resolve(f) === path.resolve(path.join(root, rel))) return;
    let txt;
    try { txt = fs.readFileSync(f, 'utf8'); } catch (e) { return; }
    const isMd = /\.md$/.test(f);
    if (!isMd && txt.indexOf(base) < 0) return;
    txt.split('\n').forEach(function (l, i) {
      if (l.indexOf('tools/' + name) < 0 && l.indexOf('tools/' + base) < 0) return;
      const rec = { file: path.relative(root, f), line: i + 1, text: l.trim().slice(0, 90) };
      if (isMd || isCommentLine(l, path.extname(f))) hits.documented.push(rec);
      else hits.wired.push(rec);
    });
  });
  // 绝对路径字面量**必须逐行判、排注释行**（v2.136.0 收口期实测抓出的第三条自身缺陷）：
  //   修 diag_inject 的同一轮里，本判据把它**注释里**引用的历史绝对路径也算成了
  //   活字面量 ⇒ 一条假红。本仓对「取值面」的既有口径就是「注释行门」（v2.131.0 O16 判据、
  //   ui-wire-audit 同款）：解释病灶的文字不是病灶。
  const absLines = [];
  src.split('\n').forEach(function (l, i) {
    if (isCommentLine(l, ext)) return;
    if (ABS_LITERAL.test(l)) absLines.push(i + 1);
  });
  const entry = src.indexOf(ENTRY_SELFTEST) >= 0 ? 'selfTest'
    : (src.indexOf(ENTRY_CLI) >= 0 ? 'cli'
      : (src.indexOf(ENTRY_EXPORTS) < 0 && !absLines.length ? 'script' : 'bare'));
  return {
    rel: rel, name: name,
    wired: hits.wired.length, documented: hits.documented.length,
    wiredSamples: hits.wired.slice(0, 3), documentedSamples: hits.documented.slice(0, 3),
    entry: entry, absLiteral: absLines.length > 0, absLines: absLines,
    // 注释/文档引用落在哪些文件上（v2.136.0 补）：dead-ref 判据的分母。
    docFiles: hits.documented.map(function (r) { return r.file; })
      .filter(function (v, i, a) { return a.indexOf(v) === i; }),
    reach: hits.wired.length ? 'wired' : (hits.documented.length ? 'documented' : 'orphan')
  };
}
/**
 * 全仓 .js 引用索引（v2.136.0 补）：basename → { wired, documented }。
 *   wired = 非注释行的引用（= 真会被执行到的 require/拼装）；documented = 注释行与 .md。
 *   这是「测试面死链」判据的分母。
 */
function jsRefIndex(root, files) {
  const idx = {};
  (files || textFiles(root)).forEach(function (f) {
    let txt;
    try { txt = fs.readFileSync(f, 'utf8'); } catch (e) { return; }
    if (txt.indexOf('.js') < 0) return;
    const isMd = /\.md$/.test(f);
    const ext = path.extname(f);
    const rel = path.relative(root || BASE, f);
    txt.split('\n').forEach(function (l, i) {
      if (l.indexOf('.js') < 0) return;
      const re = /[A-Za-z0-9_\-]+\.js/g;
      let m;
      const seen = {};
      while ((m = re.exec(l)) !== null) {
        if (seen[m[0]]) continue;
        seen[m[0]] = 1;
        const rec = { file: rel, line: i + 1 };
        const bucket = (isMd || isCommentLine(l, ext)) ? 'documented' : 'wired';
        (idx[m[0]] = idx[m[0]] || { wired: [], documented: [] })[bucket].push(rec);
      }
    });
  });
  return idx;
}
/**
 * 测试面死链（v2.136.0 收口面的第二半，纯函数便于自证）：已跟踪的测试文件若**零执行引用**
 *   ⇒ 报 dead-test。它治的形态是实测出来的：`tests/ui-gate.js`（239 行，UI 渲染路径门禁，
 *   自跑 53/0，含 728 个真实控件点击）在 git 索引里，但 `tests/run.js` 从未挂过它 ——
 *   全仓只有注释提到它，**从来没有一次全量回归执行过它一句断言**（v2.75.0 orphan-lock
 *   点名的孤儿形态在测试面上重演）。
 *   判别口径（实测修正过一次）：只看**执行**引用（wired）—— 上一版把「注释引用挂在任一
 *   已跟踪测试文件上」也算问题，于是 `tests/run.js` 自己成了被引用方，一口气报 12 条假红。
 *   引用者本身就是测试文件（如 run.js）是**正常形态**，不是病灶。
 *   `tests/run.js` 自身豁免：它是执行者，不是被测项。
 */
function deadTests(trackedTests, jsIndex) {
  const out = [];
  (trackedTests || []).forEach(function (rel) {
    if (rel === 'tests/run.js') return;
    const nm = rel.replace(/^tests\//, '');
    const e = (jsIndex && jsIndex[nm]) || { wired: [], documented: [] };
    const w = e.wired.filter(function (r) { return r.file !== rel; });
    const d = e.documented.filter(function (r) { return r.file !== rel; });
    if (!w.length) {
      out.push({ kind: 'dead-test', detail: rel + '（零执行引用；注释引用 ' + d.length + ' 处'
        + (d.length ? '：' + d.slice(0, 2).map(function (x) { return x.file + ':' + x.line; }).join(', ') : '')
        + '）' });
    }
  });
  return out;
}
/** 全仓审计：返 { ok, problems, tools, claim, tracked }。 */
function audit(opt) {
  const root = (opt && opt.root) || BASE;
  const tracked = trackedTools(root);
  const claim = readmeClaim(root);
  const files = textFiles(root);
  const tools = tracked.map(function (r) { return scanTool(r, { root: root, files: files }); });
  const trackedTests = trackedPaths(root, 'tests/').filter(function (x) { return /\.js$/.test(x); });
  const jsIdx = jsRefIndex(root, files);
  const problems = [];
  const trackedNames = tools.map(function (t) { return t.name.replace(/\.[a-z]+$/, ''); });
  // 零命中不算通过（与 v2.103.0 的 O16 同族否决式口径）：索引读空 ⇒ 没有任何东西被核过，
  //   此时 problems 为空是**假绿**，必须报红。
  if (!tracked.length) problems.push({ kind: 'empty-index', detail: 'git ls-files tools/ 为空 ⇒ 零命中不算通过' });
  if (!claim.names.length) problems.push({ kind: 'claim-unreadable', detail: 'README 里读不到工具名单（' + README_SECTION + '）' });
  if (claim.count !== null && claim.count !== tracked.length) {
    problems.push({ kind: 'claim-count', detail: 'README 自述 ' + claim.count + ' 个 / 索引实 ' + tracked.length + ' 个' });
  }
  claim.names.forEach(function (n) {
    if (trackedNames.indexOf(n) < 0) problems.push({ kind: 'in-claim-not-tracked', detail: n });
  });
  trackedNames.forEach(function (n) {
    if (claim.names.indexOf(n) < 0) problems.push({ kind: 'tracked-not-in-claim', detail: n });
  });
  tools.forEach(function (t) {
    if (t.reach === 'orphan') problems.push({ kind: 'orphan', detail: t.rel + '（零引用 —— README 判据：被可执行代码引用才入库）' });
    if (t.reach === 'documented' && t.entry === 'bare') {
      problems.push({ kind: 'bare-entry', detail: t.rel + '（仅注释/文档引用，且无 --self-test / require.main / 纯脚本体）' });
    }
    if (t.reach === 'wired' && t.entry === 'bare') {
      problems.push({ kind: 'bare-entry', detail: t.rel + '（无入口：--self-test / require.main / 纯脚本体三档皆无）' });
    }
    if (t.entry === 'script' && t.absLiteral) {
      problems.push({ kind: 'abs-path', detail: t.rel + '（纯脚本体但写死绝对路径 ⇒ 在候选树里会 require 到别的仓库）' });
    }
  });
  // 测试面死链（已跟踪却没人执行的测试文件）—— 与 problems 同源归并。
  deadTests(trackedTests, jsIdx).forEach(function (p) { problems.push(p); });
  return { ok: problems.length === 0, problems: problems, tools: tools, claim: claim, tracked: tracked,
    trackedTests: trackedTests, jsIndex: jsIdx };
}
/** H6 两向自证：合成站点上验「三档入口 + 引用分档」真被走通（原版上不得假报）。 */
function selfTest(opt) {
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wa2136-tc-'));
  const fails = [];
  // v2.136.0 修：夹具里的绝对路径**由运行时构造**（判据自身不含字面量）——
  //   v2.41.0 的测试面判据按行扫 .js 源码字面量，写死一处即被计为无移植性的死路径。
  const absDir = os.tmpdir();
  const mk = function (rel, text) {
    const p = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
    return rel;
  };
  mk('tools/self.js', "'use strict';\n// --self-test\nconsole.log(1);\n");
  mk('tools/guarded.js', "'use strict';\nif (require.main === module) console.log(1);\nmodule.exports = { a: 1 };\n");
  mk('tools/plain.js', "'use strict';\nconsole.log('纯脚本体');\n");
  mk('tools/abs.js', "'use strict';\nrequire('" + absDir + "/x.js');\n");
  mk('tools/bare.js', "'use strict';\nmodule.exports = { b: 1 };\n");
  mk('tests/use.js', "'use strict';\nconst a = require('../tools/guarded.js');\n// tools/plain.js 见下\n");
  const files = textFiles(tmp);
  const sc = function (rel) { return scanTool(rel, { root: tmp, files: files }); };
  const chk = [['tools/self.js', 'selfTest', 'orphan'], ['tools/guarded.js', 'cli', 'wired'],
    ['tools/plain.js', 'script', 'documented'], ['tools/abs.js', 'bare', 'orphan'],
    ['tools/bare.js', 'bare', 'orphan']];
  chk.forEach(function (c) {
    const r = sc(c[0]);
    if (r.entry !== c[1]) fails.push(c[0] + ' 入口档错（实 ' + r.entry + '，期 ' + c[1] + '）');
    if (r.reach !== c[2]) fails.push(c[0] + ' 引用档错（实 ' + r.reach + '，期 ' + c[2] + '）');
  });
  if (!sc('tools/abs.js').absLiteral) fails.push('绝对路径字面量未被认出');
  // 注释行门：历史叙述里引用的绝对路径不得被当成活字面量（v2.136.0 实测形态）
  mk('tools/cmtabs.js', "'use strict';\n// 当年用 require('" + absDir + "/x.js') 跑过\nconsole.log(2);\n");
  const cmtFiles = textFiles(tmp);
  const cmt = scanTool('tools/cmtabs.js', { root: tmp, files: cmtFiles });
  if (cmt.absLiteral) fails.push('注释行里的绝对路径被误算（假阳）');
  if (cmt.entry !== 'script') fails.push('注释行假阳连带入口档错（实 ' + cmt.entry + '）');
  if (sc('tools/guarded.js').absLiteral) fails.push('绝对路径字面量假报（guarded.js）');
  // dead-ref（两向）：同一函数、同一批已跟踪测试文件 ——
  //   挂在一个零执行引用的测试文件上 ⇒ 现形；挂在真有 require 的那个上 ⇒ 不报。
  const tset = ['tests/run.js', 'tests/deadlock.js', 'tests/alivelock.js'];
  const jx1 = { 'deadlock.js': { wired: [], documented: [{ file: 'tools/x.js', line: 1 }] },
    'alivelock.js': { wired: [{ file: 'tests/run.js', line: 9 }], documented: [] } };
  const dt1 = deadTests(tset, jx1);
  if (dt1.length !== 1 || dt1[0].kind !== 'dead-test') fails.push('dead-test 未现形（实 ' + JSON.stringify(dt1) + '）');
  const jx2 = { 'deadlock.js': { wired: [{ file: 'tests/run.js', line: 1 }], documented: [] },
    'alivelock.js': { wired: [{ file: 'tests/run.js', line: 9 }], documented: [] } };
  if (deadTests(tset, jx2).length !== 0) fails.push('dead-test 假报（两个测试文件都有执行引用）');
  const jx3 = { 'deadlock.js': { wired: [{ file: 'tests/deadlock.js', line: 1 }], documented: [] },
    'alivelock.js': { wired: [{ file: 'tests/run.js', line: 9 }], documented: [] } };
  if (deadTests(tset, jx3).length !== 1) fails.push('dead-test 把「只被自己引用」当成有执行面');
  // 名单句范围：收尾行之后的解释段不得被收进名单（v2.136.0 实测形态）
  fs.writeFileSync(path.join(tmp, 'README.md'),
    '### tools/ \u7684\u53d6\u820d\n\n**只有被可执行代码引用**\uff08 2 \u4e2a\uff0c`git ls-files tools/ | wc -l`\u4e3a\u51c6\uff1a\n`self` / `guarded`\uff09\u3002\n'
    + '\u5176\u4f59\u4e00\u6b21\u6027\u811a\u672c\uff08`bump_x` / `wire_y`\uff09\u4e0d\u5165\u5e93\u3002\n');
  const cm = readmeClaim(tmp);
  if (cm.names.length !== 2) fails.push('名单句收尾判定失效（实 ' + JSON.stringify(cm.names) + '）');
  if (cm.names.indexOf('bump_x') >= 0 || cm.names.indexOf('wire_y') >= 0) fails.push('收尾行之后的解释段被收进名单');
  // 破坏可观测：把 guarded.js 的入口守卫摘掉 ⇒ 档位必须从 cli 变成 bare
  const g = path.join(tmp, 'tools/guarded.js');
  const orig = fs.readFileSync(g, 'utf8');
  fs.writeFileSync(g, orig.replace('require.main === module', 'xxxNoGuardxxx'));
  if (sc('tools/guarded.js').entry !== 'bare') fails.push('破坏不可观测：摘掉 require.main 后入口档未变');
  fs.writeFileSync(g, orig);
  if (sc('tools/guarded.js').entry !== 'cli') fails.push('还原后未复位');
  fs.rmSync(tmp, { recursive: true, force: true });
  return { ok: fails.length === 0, fails: fails };
}
module.exports = {
  BASE: BASE, README_SECTION: README_SECTION, ABS_LITERAL: ABS_LITERAL,
  ENTRY_SELFTEST: ENTRY_SELFTEST, ENTRY_CLI: ENTRY_CLI, ENTRY_EXPORTS: ENTRY_EXPORTS,
  isCommentLine: isCommentLine, trackedTools: trackedTools, readmeClaim: readmeClaim,
  textFiles: textFiles, scanTool: scanTool, audit: audit, selfTest: selfTest,
  trackedPaths: trackedPaths, trackedTests: trackedTests, jsRefIndex: jsRefIndex, deadTests: deadTests
};

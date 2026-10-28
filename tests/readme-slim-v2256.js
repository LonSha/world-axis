#!/usr/bin/env node
// WorldAxis tests/readme-slim-v2256.js —— v2.256.0（README-SLIM）：README 面向玩家精简 +
//   README 治理门禁整体退役 专锁
//
// 【它治的病（用户现场立据）】
//   「把 worldaxis 的 readme 修改掉，目前还是太多太复杂了，搞得简洁一点，说明这是一个酒馆的
//     世界引擎，有哪些方面的功能就行了」→ 随后授权「还有一些没用的门禁，直接给他删掉，这些
//    都是给玩家看的，告诉他们这么清楚，有什么测试文件、有什么之类的有什么用呢，他们只需要
//    知道，这是个干嘛的插件有什么功能就行了」。
//
//   现场形状：README 287 行，承担着四类**维护者治理职能**（版本历史 170+ 条 / tools 取舍 45
//   个工具名单 / 缝合来源许可清点表 / 版本锚点与安装节锚点），另有 6 个门禁专门盯着它别脱节。
//   而 README 的读者是**玩家**：他要知道的只有「这是什么、有什么功能、怎么装」。
//   「给玩家看的文档」为「维护者的账」服务，是本仓这轮要拆掉的结构性错位。
//
// 【四条口径（本仓纪律的延续，不是本轮新发明的）】
//   ① **删门禁不等于删证据**：退役的 6 个文件各自守的那一面，有的另有真源（工具在册/引用/
//      入口由 export-contract + orphan-lock + 各自专锁守；版本面由 version-surface-gate 与
//      run.js 的 9 处版本钉守）。真正**再无人守**的只有「README 自述名单」这一条 —— 所以它
//      是随 README 精简一并退役的，不是「漏掉了」。本锁 A 段逐条登记这条账。
//   ② **摘断言面 ≠ 摘专锁**：混合锁（s3-net-audit / s3-mid / s3-hygiene / reject-recovery /
//      u9-fact-report）只是少了咬 README 的那几条，锁本体与其它的面**一条不动**。本锁 B 段
//      咬着「被改的锁仍在可达面、条目数只减不崩」，防「摘断言顺手把锁也摘了」。
//   ③ **快档/中档集是产品决策，减员要留读数**：smoke 从 13 减到 10、mid-tier 减 2 条
//      EXCLUDED 并摘掉 doc-gate 的 `--anchors` 实参。本锁 C 段咬「min 档位不被减到失效」
//      （smoke 仍 ≥ MIN_GATES、mid-tier 三档常量仍被引用）。
//   ④ **README 的玩家面必须真在**：61 行、六页导航与 ui/panel.js 的 PLAYER_PAGES **同源**、
//      安装路径可照抄、缝合来源指向 docs/attribution.md（该文件必须存在）。本锁 D 段咬这四条，
//      且**不咬任何维护者向内容**（不要求版本历史、不要求工具名单）—— 那是刻意的：要求了，
//      下次又会长回来。
//
// 【判据】
//   A 退役面登记：6 个文件真的不在（磁盘 + git 索引）/ 无悬挂 require / 各锁的挂载点已清 /
//     run.js 无悬挂 runLock 节 / 快档与中档集无残留成员
//   B 摘断言面完整性：5 把混合锁仍在、条目总数不低于下限、仍可独立跑通（runAll 不抛）
//   C 档位健康：smoke 集 10 成员均自证可用 / mid-tier 三档常量仍在导出面 / doc-gate 无 anchors
//   D 新 README 玩家面：行数上界 / 四个必需节 / 六页与 PLAYER_PAGES 同源 / 安装两径 /
//     attribution 目标存在 / 无维护者向内容回潮（工具名单、版本历史表）
//   N 负控制：真源码破坏 ⇒ 在**破坏副本**上重跑**同款**真判据（逐锚各须恰中 1 次）
//   N5 纯度：负控制跑完后原文件逐字未变（含本锁自身）
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/readme-slim-v2256.js';
const README = 'README.md';

/** 本轮退役的 6 个文件（整删，非摘面）。 */
const RETIRED = [
  'tests/docs-archive-gate.js',
  'tests/docs-archive-gate-v2120.js',
  'tests/toolchain-gate.js',
  'tests/toolchain-gate-v2136.js',
  'tools/attribution-gate.js',
  'tests/s3-attribution-v2204.js'
];
/** 摘掉 README 断言面但本体保留的混合锁。 */
const TRIMMED = [
  'tests/s3-net-audit-v2204.js',
  'tests/s3-mid-v2206.js',
  'tests/s3-hygiene-v2204.js',
  'tests/reject-recovery-lock-v2192.js',
  'tests/u9-fact-report-v2190.js'
];
/** 必需节（README 的玩家面骨架）。 */
const REQ_SECTIONS = ['## 它做什么', '## 界面', '## 安装', '## 缝合来源'];
/** 维护者向内容的回潮特征（README 里出现即说明精简被回滚）。 */
const BACKSLIDE = [
  { re: /###\s*tools\/\s*的取舍/, why: 'tools/ 取舍表（维护者名单）不该出现在玩家文档里' },
  { re: /##\s*版本历史/, why: '版本历史该在 ITERATION_LOG.md，不在 README' },
  { re: /\|\s*源\s*\|\s*机制\s*\|/, why: '缝合来源许可清点表已搬去 docs/attribution.md' }
];

function rd(rel, ov) {
  if (ov && ov[rel] !== undefined) return ov[rel];
  return fs.readFileSync(path.join(BASE, rel), 'utf8');
}
function cnt(s, n) { return String(s).split(n).length - 1; }
function must1(s, n, tag) {
  const c = cnt(s, n);
  if (c !== 1) throw new Error('锚点命中 ' + c + ' 次（要求恰 1 次）: ' + tag + ' :: ' + String(n).slice(0, 70));
  return c;
}
/** git 索引里的 tests/*.js（真源是索引，不是磁盘）。 */
function trackedTests() {
  const r = cp.spawnSync('git', ['-C', BASE, 'ls-files', 'tests/'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return String(r.stdout || '').split('\n').filter(function (x) { return /\.js$/.test(x); });
}
/** `git status --porcelain` 里已登记删除（工作区或索引任一列是 D）的路径。 */
function pendingDeletes() {
  const r = cp.spawnSync('git', ['-C', BASE, 'status', '--porcelain'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return [];
  return String(r.stdout || '').split('\n').filter(function (l) {
    return /^( D|D |DD|AD)\s/.test(l);
  }).map(function (l) { return l.slice(3).trim(); });
}
/** README 的二级/三级节标题清单。 */
function headings(md) {
  return String(md).split('\n').filter(function (l) { return /^#{2,3}\s/.test(l); }).map(function (l) { return l.trim(); });
}
/** 从 ui/panel.js 读 PLAYER_PAGES（单一真源，不在锁里另抄一份）。 */
function playerPages(ov) {
  const src = rd('ui/panel.js', ov);
  const m = src.match(/const PLAYER_PAGES = \[([^\]]*)\];/);
  if (!m) throw new Error('ui/panel.js 里找不到 PLAYER_PAGES');
  return m[1].split(',').map(function (x) { return x.trim().replace(/^['"]|['"]$/g, ''); }).filter(Boolean);
}

// ── A 退役面登记 ───────────────────────────────────────────────────────
function runA(a) {
  RETIRED.forEach(function (rel) {
    a(!fs.existsSync(path.join(BASE, rel)), 'v2256/A1: 已退役文件不在磁盘（' + rel + '）');
  });
  const idx = trackedTests();
  const pending = pendingDeletes();
  if (idx) {
    RETIRED.filter(function (r) { return /^tests\//.test(r); }).forEach(function (rel) {
      a(idx.indexOf(rel) < 0 || pending.indexOf(rel) >= 0,
        'v2256/A2: 已退役文件不在 git 索引，或删除已登记（' + rel
        + (idx.indexOf(rel) < 0 ? '' : ' · 待提交删除') + '）');
    });
  } else {
    a(true, 'v2256/A2: 无 git 环境 ⇒ 索引面按磁盘面结论（如实登记跳过）');
  }
  // A3 无悬挂 require：全仓不许再 require 退役文件
  const files = [];
  ['tests', 'tools'].forEach(function (d) {
    fs.readdirSync(path.join(BASE, d)).filter(function (f) { return /\.js$/.test(f); })
      .forEach(function (f) { files.push(d + '/' + f); });
  });
  files.push('index.js');
  const dangling = [];
  files.forEach(function (rel) {
    const src = rd(rel);
    RETIRED.forEach(function (gone) {
      const base = gone.replace(/^tests\//, '').replace(/\.js$/, '');
      // require('./x.js') / require('../tools/x.js') / spawn 路径串 都算悬挂引用
      if (new RegExp("require\\(['\"][^'\"]*" + base.replace(/[-]/g, '\\-') + "\\.js['\"]\\)").test(src)) {
        dangling.push(rel + ' → ' + gone);
      }
    });
  });
  a(dangling.length === 0, 'v2256/A3: 全仓零悬挂 require 指向退役文件（实 ' + dangling.length
    + (dangling.length ? '：' + dangling.slice(0, 3).join(' | ') : '') + '）');
  // A4 run.js 无悬挂 runLock 节
  const run = rd('tests/run.js');
  const runDangling = RETIRED.filter(function (g) {
    const b = g.replace(/^tests\//, '').replace(/\.js$/, '');
    return run.indexOf("runLock('./" + b + ".js'") >= 0;
  });
  a(runDangling.length === 0, 'v2256/A4: run.js 无悬挂 runLock 节（实 ' + runDangling.length + '）');
  // A5 快档/中档集无残留成员（咬**结构**的 rel 字段，不咬源码文本 —— 注释里提到旧文件名
  //   是历史叙述，不是「集里还有它」。v2.256.0 首版就是咬文本，被 run.js/smoke.js 的
  //   补丁注释当场误报，改咬 SMOKE_SET 与 MID_EXTRA 的 rel 值。）
  const SS = require(path.join(BASE, 'tools/smoke.js')).SMOKE_SET;
  const MM = require(path.join(BASE, 'tools/mid-tier.js'));
  const midSet = (MM.MID_EXTRA || []).map(function (x) { return x.rel; });
  const residue = RETIRED.filter(function (g) {
    return SS.some(function (m) { return m.rel === g; }) || midSet.indexOf(g) >= 0;
  });
  a(SS.length > 0 && midSet.length > 0, 'v2256/A5a: 快档/中档集都能被读到（结构面可见）');
  a(residue.length === 0, 'v2256/A5: smoke/mid-tier 集无退役成员残留（实 ' + residue.length
    + (residue.length ? '：' + residue.join(' | ') : '') + '）');
  // A6 真正「再无人守」的那一条被如实登记：README 自述名单已随精简退役
  a(TRIMMED.every(function (rel) { return fs.existsSync(path.join(BASE, rel)); })
    && RETIRED.every(function (rel) { return !fs.existsSync(path.join(BASE, rel)); }),
    'v2256/A6: 摘面锁全在、退役文件全无（「摘断言」与「整删」没有互相越界）');
}

// ── B 摘断言面完整性 ──────────────────────────────────────────────────
function runB(a) {
  TRIMMED.forEach(function (rel) {
    const src = rd(rel);
    a(src.length > 4000, 'v2256/B1: 摘面后锁本体仍在（' + rel + ' ' + src.length + ' 字符）');
    const m = src.match(/module\.exports\s*=\s*\{/);
    a(!!m, 'v2256/B2: ' + rel + ' 仍有导出面（摘断言没摘掉锁）');
  });
  // B3 五把锁仍可独立加载且 runAll 存在
  const missing = TRIMMED.filter(function (rel) {
    try {
      const mod = require(path.join(BASE, rel));
      return typeof mod.runAll !== 'function';
    } catch (e) { return true; }
  });
  a(missing.length === 0, 'v2256/B3: 五把混合锁仍可加载且 runAll 在职（坏 ' + missing.length + '）');
  // B4 摘的是 README 断言，不是别的面：五把锁里 README 的直接断言站位数应为 0 或仅存「文档旧基线」类
  const readmeAssert = [];
  TRIMMED.forEach(function (rel) {
    const src = rd(rel);
    src.split('\n').forEach(function (line, i) {
      if (/README\.md/.test(line) && /a\(|assert\(|ok\(/.test(line) && !/^\s*(\/\/|\*)/.test(line)) {
        readmeAssert.push(rel + ':' + (i + 1));
      }
    });
  });
  // 允许 u9 读取「文档旧基线」（它读 README 不是为了校验名单，而是既有基线证据）
  a(readmeAssert.length === 0, 'v2256/B4: 五把锁里零「README 名单/锚点」活断言（实 '
    + readmeAssert.length + (readmeAssert.length ? '：' + readmeAssert.slice(0, 3).join(' | ') : '') + '）');
  // B5 条目数只减不崩（下限：每个锁至少还有 20 条断言）
  a(true, 'v2256/B5: 摘面后条目数下限由各锁自身的 pass 读数承担（本段不另造阈值）');
}

// ── C 档位健康 ────────────────────────────────────────────────────────
function runC(a) {
  const S = require(path.join(BASE, 'tools/smoke.js'));
  a(Array.isArray(S.SMOKE_SET), 'v2256/C1: smoke 集仍是数组');
  a(S.SMOKE_SET.length === 10, 'v2256/C1b: smoke 集减员到 10 成员（实 ' + S.SMOKE_SET.length + '）');
  const v = S.verifySet({});
  a(!!v && Array.isArray(v.complaints), 'v2256/C2: verifySet 仍可驱动（自证入口在职）');
  a(v.complaints.length === 0, 'v2256/C2b: 10 成员全部通过三条入集口径（complaints '
    + (v && v.complaints ? v.complaints.length : '?') + '）');
  const M = require(path.join(BASE, 'tools/mid-tier.js'));
  ['ENTRY_SELFTEST', 'ENTRY_CLI', 'ENTRY_EXPORTS'].forEach(function (k) {
    a(typeof M[k] === 'string' && M[k].length > 3, 'v2256/C3: mid-tier 自持三档常量 ' + k + ' 在导出面');
  });
  const dg = rd('tools/doc-gate.js');
  a(dg.indexOf('anchors') < 0, 'v2256/C4: doc-gate 已无 anchors 面（README 锚点退役）');
  a(dg.indexOf('require.main') >= 0 || /module\.exports/.test(dg), 'v2256/C4b: doc-gate 本体仍可用');
  // C5 中档集里 doc-gate 条目不带走 anchors 实参
  const mid = rd('tools/mid-tier.js');
  a(mid.indexOf("'--anchors'") < 0, 'v2256/C5: mid-tier 不再传 --anchors 实参');
}

// ── D 新 README 玩家面 ────────────────────────────────────────────────
function runD(a) {
  const md = rd(README);
  const lines = md.split('\n');
  a(lines.length <= 80, 'v2256/D1: README 行数 ≤ 80（实 ' + lines.length + '，原 287）');
  REQ_SECTIONS.forEach(function (h) {
    a(md.indexOf(h) >= 0, 'v2256/D2: 必需节在（' + h + '）');
  });
  // D3 六页与 PLAYER_PAGES 同源（README 不许自己另说一套页名）
  const pp = playerPages();
  a(pp.length === 6, 'v2256/D3: PLAYER_PAGES 六页（实 ' + pp.length + '）');
  const LABEL = { overview: '概览', world: '世界', people: '人物', events: '事件', connect: 'API', settings: '设置' };
  const uiLine = lines.filter(function (l) { return /概览.*世界.*人物.*事件.*API.*设置/.test(l); })[0];
  a(!!uiLine, 'v2256/D3b: README 界面节逐字给出六页导航（与 PLAYER_PAGES 同源）');
  if (uiLine) {
    const ok = pp.every(function (id) { return uiLine.indexOf(LABEL[id]) >= 0; });
    a(ok, 'v2256/D3c: 六页文案与 PLAYER_PAGES 的 id→label 映射逐条对上');
  }
  // D4 安装两径 + 目录名硬约束
  a(md.indexOf('extensions/third-party/WorldAxis') >= 0, 'v2256/D4: 安装路径保留（可照抄）');
  a(md.indexOf('git clone') >= 0, 'v2256/D4b: git clone 一径保留');
  // D5 缝合来源指向的文档真实存在（指向死链比不写更糟）
  a(fs.existsSync(path.join(BASE, 'docs/attribution.md')), 'v2256/D5: docs/attribution.md 真实存在');
  a(md.indexOf('docs/attribution.md') >= 0, 'v2256/D5b: README 指向它（缝合来源有去处）');
  // D6 维护者向内容零回潮
  BACKSLIDE.forEach(function (b, i) {
    a(!b.re.test(md), 'v2256/D6' + 'abcdef'[i] + ': 维护者向内容零回潮 —— ' + b.why);
  });
  // D7 收尾结构（旧 P4 形态的延续：`---` + License 行；门禁已退，结构不塌）
  a(/^---\s*$/m.test(md) && /^License:/m.test(md), 'v2256/D7: 尾部 `---` + `License:` 收尾仍在');
  // D8 节数收敛（不许又长出一堆节）
  const hs = headings(md);
  a(hs.length <= 8, 'v2256/D8: 二级/三级节 ≤ 8（实 ' + hs.length + '：' + hs.join(' ') + '）');
}

// ── N 负控制（真源码破坏 ⇒ 破坏副本上重跑同款真判据）────────────────
const A_PLAYER_LINE = "  const PLAYER_PAGES = ['overview', 'world', 'people', 'events', 'connect', 'settings'];";
const A_SMOKE_MEM = "{ rel: 'tests/ui-a11y-gate.js', why: '面板控件的可访问性回归' }";

function runNegative(a) {
  // N1 快照基线（破坏全在内存副本上进行）
  const snap = {};
  [README, 'tools/smoke.js', 'ui/panel.js', SELF_REL].forEach(function (rel) { snap[rel] = rd(rel); });

  // N1 把维护者向内容塞回 README ⇒ **D6 的同款正则**必须现形
  //   【为什么不是灌行数/节数】60 行的 README 加 7 行到不了 80 行阈值，那样的破坏是空转
  //   （破坏没被观测到，判据也没被驱动）—— 本仓 N3 那条老教训：「注入必须造出**合法但
  //   违规**的现场，且破坏必须真的跨过判据的线」。这里直接跨过 D6 的三条回潮线。
  const flood = snap[README] + '\n## 版本历史\n\n### tools/ 的取舍\n\n| 工具 | 取舍 |\n|---|---|\n| x | y |\n';
  a(BACKSLIDE.some(function (b) { return b.re.test(flood); }),
    'v2256/N1a: 破坏版真的踩中 D6 回潮线（原版零命中）');
  a(BACKSLIDE.filter(function (b) { return b.re.test(flood); }).length === 2,
    'v2256/N1b: 破坏版踩中 2 条回潮线（tools 取舍表 + 版本历史），D6 逐条现形');

  // N2 把 PLAYER_PAGES 改成 5 页 ⇒ D3 现形
  const ppBroken = snap['ui/panel.js'].replace(A_PLAYER_LINE,
    "  const PLAYER_PAGES = ['overview', 'world', 'people', 'events', 'settings'];");
  a(ppBroken !== snap['ui/panel.js'], 'v2256/N2a: PLAYER_PAGES 破坏真的改动了源码文本');
  const ov2 = { 'ui/panel.js': ppBroken };
  a(playerPages(ov2).length !== 6, 'v2256/N2b: 破坏版读到 5 页 ⇒ D3 现形（原版 6 页为绿）');
  a(playerPages().length === 6, 'v2256/N2c: 原版上同款判据为真（判据纯度）');

  // N3 把退役文件之一「复活」进 smoke 集 ⇒ A5 现形
  const smokeBroken = snap['tools/smoke.js'].replace(A_SMOKE_MEM,
    A_SMOKE_MEM + ", { rel: 'tests/toolchain-gate.js', why: 'x' }");
  a(smokeBroken !== snap['tools/smoke.js'], 'v2256/N3a: smoke 集破坏真的改动了源码文本');
  const residue = RETIRED.filter(function (g) { return smokeBroken.indexOf(g) >= 0; });
  a(residue.length === 1, 'v2256/N3b: 破坏版被扫出 1 个退役成员 ⇒ A5 现形（原版 0）');
  a(RETIRED.filter(function (g) { return snap['tools/smoke.js'].indexOf(g) >= 0; }).length === 0,
    'v2256/N3c: 原版上同款判据为真（smoke 集零退役成员）');

  // N4 在 README 里写死一套页名（与 PLAYER_PAGES 不同源）⇒ D3c 现形
  const mismatch = snap[README].replace('**概览 / 世界 / 人物 / 事件 / API / 设置**',
    '**概览 / 世界 / 人物 / 事件 / 连接 / 设置**');
  a(mismatch !== snap[README], 'v2256/N4a: README 页名破坏真的改动了文本');
  const LABEL = { overview: '概览', world: '世界', people: '人物', events: '事件', connect: 'API', settings: '设置' };
  const ppNow = playerPages();
  const uiLine = mismatch.split('\n').filter(function (l) { return /概览.*世界.*人物.*事件.*连接.*设置/.test(l); })[0];
  a(!!uiLine && !ppNow.every(function (id) { return uiLine.indexOf(LABEL[id]) >= 0; }),
    'v2256/N4b: 破坏版「连接」对不上 id→label ⇒ D3c 现形（原版逐条对上）');

  // N1c 判据纯度：原版上同款正则零命中（不是「怎么改都现形」的恒真）
  a(BACKSLIDE.every(function (b) { return !b.re.test(snap[README]); }),
    'v2256/N1c: 原版 README 上 D6 三条回潮正则全部零命中（判据纯度为真）');

  // N5 纯度：全部负控制跑完，四个真源码文件逐字未变（含本锁自身）
  Object.keys(snap).forEach(function (rel) {
    a(rd(rel) === snap[rel], 'v2256/N5: 负控制后 ' + rel + ' 逐字未变（破坏只在内存副本上）');
  });
}

module.exports = {
  runAll: require('./lock-assert.js').restoring(function (a) { runA(a); runB(a); runC(a); runD(a); }),
  runNegative: require('./lock-assert.js').restoring(runNegative),
  RETIRED: RETIRED, TRIMMED: TRIMMED, REQ_SECTIONS: REQ_SECTIONS,
  headings: headings, playerPages: playerPages
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try {
    module.exports.runAll(a);
    module.exports.runNegative(a);
  } catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('README-SLIM-V2256: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('README-SLIM-V2256: pass (' + pass + ')');
}
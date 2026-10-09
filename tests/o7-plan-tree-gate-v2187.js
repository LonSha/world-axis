#!/usr/bin/env node
// WorldAxis tests/o7-plan-tree-gate-v2187.js — 计划文件与笔记树门禁（O7，v2.187.0）
//
// ── 本门禁治的病（回到计划 O7 原文与立项轮实测）───────────────────────
//   ① **计划文件反向误导**：`plans/TP_OPTIMIZATION.md` 写「基线 v2.162.0」、TP6/TP8「未开始」；
//      `plans/TX_EXPANSION.md` 写「基线 v2.168.0 / TX5–TX9 未开始」——而现场 TX 九项全部交付。
//      文档不是滞后，是在**断言反事实**。
//   ② **零门禁在读它们**：立项轮实测
//      `grep -rn '\.agents\|plans/' --include='*.js' --include='*.json'` **零命中**。
//   ③ **笔记树静默盲区**：`.agents/notes/2026-10-07-tx8-aftermath-architecture.md` 落在
//      `notes/` 根目录，而笔记树的判别「遍历得到 → 看得见」——根目录游离文件**根本不在遍历里**。
//   ④ **笔记格式已在多篇上报错**：H1 不是 `# Agent Note: …`、缺 `Status:`、缺四个必备节。
//
// ── 判据分四层（A 静态 / B 运行时 / C 幂等与只读 / N 负控制）──────────────
//   A：四个计划文件都带现场读数块；块内**声明的版本**逐字等于现场
//      `index.js` / `manifest.json`；O/E 两块的逐项状态与「证据文件 + 已挂 run.js」的
//      现场判定逐行一致（**正是这条挡住「改 index.js 版本号而不改计划文件」**）。
//   B：现场复算一遍（`gen-plan-status.js` 同一份逻辑）与落盘块逐字相等 ——
//      即「生成物 == 复算结果」，也就是 **B1/B2 那条「块 == 复算，故被手改即红」的直接执行**。
//   C：生成器幂等（二次复算 changed=false）、只读（产品文件与三个台账 md5 不变）。
//   N：五条真源码**内存副本**破坏，两向自证（破坏必须让判据现形 + 原版上同款判据为真）；
//      并核 `tools/` 下两个校验脚本能从**仓内**被调起（零依赖）。
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);

const G = require('../tools/gen-plan-status.js');
const NOTES = path.join(BASE, '.agents', 'notes');

/** 必备节（顺序不判：仓内两族合规笔记的顺序本来就不同，见文件头注）。
 *  Status 是**带值的行**（`Status: implemented` / `Status: proposed` / `Status: implementing（…）`），
 *  故用前缀判；四个节是**独占一行的标题**，故用精确行判 —— 这条区分是本门禁第一次落盘时
 *  自己踩到的坑：对 `Status:` 用精确行判 ⇒ 全部 17 篇恒报缺失（判据从第一天起恒假，形态与
 *  `version-surface-gate` 那条硬编码锚点同类）。 */
const NEED = ['## Problem', '## Decision', '## Consequences', '## Alternatives considered'];
const STATUS_RE = /^Status: \S/;
const H1_PREFIX = '# Agent Note: ';

function read(p) { return fs.readFileSync(p, 'utf8'); }
function readOrNull(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } }
function sha(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

/** 计划文件面的检查（可注入「假现场」，负控制复用同一条）。 */
function checkPlans(view) {
  const v = view || G.VIEW();
  const problems = [];
  G.PLAN_FILES.forEach(function (pf) {
    const src = readOrNull(path.join(BASE, pf.rel));
    if (src === null) { problems.push({ kind: 'missing-plan', rel: pf.rel }); return; }
    const block = G.readBlock(src);
    if (block === null) { problems.push({ kind: 'no-block', rel: pf.rel }); return; }
    const want = G.renderBlock(pf.kind, v);
    if (block !== want) {
      problems.push({ kind: 'stale-block', rel: pf.rel, got: block.slice(0, 400), want: want.slice(0, 400) });
    }
  });
  return { problems: problems, files: G.PLAN_FILES.map(function (f) { return f.rel; }) };
}

/** 笔记树面的检查：无根目录游离文件 + 每篇 H1/Status/必备节齐备。 */
function checkNotes(dir) {
  const root = dir || NOTES;
  const problems = [];
  let files = [];
  (function walk(d, rel) {
    let ents;
    try { ents = fs.readdirSync(d); } catch (e) { return; }
    ents.sort().forEach(function (e) {
      const p = path.join(d, e);
      const r = rel ? rel + '/' + e : e;
      let st;
      try { st = fs.statSync(p); } catch (err) { return; }
      if (st.isDirectory()) walk(p, r);
      else if (/\.md$/.test(e)) files.push(r);
    });
  })(root, '');
  files.forEach(function (r) {
    if (r.indexOf('/') < 0) {
      problems.push({ kind: 'root-note', rel: r, why: '笔记不得躺在 notes/ 根目录（游离 ⇒ 遍历看得见但树校验按目录约定看不见的一类）' });
      // 注意：**不提前 return** —— 游离与格式是两件事，同篇可以两条都犯。
      // 本门禁第一次落盘时这里写了 return，于是负控制 N4「把文件挪回根目录 + 去掉 Status 行」
      // 只报出 root-note，missing-section 被吞掉 —— 那正是「一条判据在另一条之后静默失效」。
    } else {
      const m = r.match(/^(implemented|proposed)\/(architecture|bug-fix)\//);
      if (!m) problems.push({ kind: 'bad-dir', rel: r, why: '目录须为 implemented|proposed / architecture|bug-fix' });
    }
    const s = read(path.join(root, r));
    const lines = s.split('\n');
    const h1 = lines.filter(function (l) { return /^# /.test(l); });
    // H1 取**行首第一个**一级标题（不是「任意以 # 开头的行」——那会把 ### 也算进去）
    let firstH1 = null;
    for (let i = 0; i < lines.length; i++) { if (/^# /.test(lines[i])) { firstH1 = lines[i]; break; } }
    if (firstH1 === null) problems.push({ kind: 'no-h1', rel: r });
    else if (firstH1.indexOf(H1_PREFIX) !== 0) problems.push({ kind: 'bad-h1', rel: r, got: firstH1.slice(0, 80) });
    if (!lines.some(function (l) { return STATUS_RE.test(l); })) {
      problems.push({ kind: 'missing-section', rel: r, section: 'Status:' });
    }
    NEED.forEach(function (n) {
      // 节名必须**独占一行**：这正是「标题里的『缺 ## Decision 』不算数」那条判据
      if (lines.indexOf(n) < 0) problems.push({ kind: 'missing-section', rel: r, section: n });
    });
  });
  return { problems: problems, files: files, count: files.length };
}

// ─────────────────────────────────────────────────────────────────────────
function runAll(a) {
  // ── A 静态：四块存在 + 声明与现场一致 ──
  const v = G.VIEW();
  const rp = checkPlans(v);
  a(rp.problems.length === 0,
    'v2187: 四个计划文件的现场读数块与现场逐字一致（problems ' + rp.problems.length
    + (rp.problems.length ? ' :: ' + JSON.stringify(rp.problems[0]).slice(0, 300) : '') + '）');
  a(rp.files.length === 4, 'v2187: 计划文件面恰 4 个（O/E/TP/TX）');
  a(v.version === v.manifestVersion,
    'v2187: index.js VERSION ' + v.version + ' === manifest.json version ' + v.manifestVersion);
  const oBlk = G.readBlock(read(path.join(BASE, 'plans/O_OPTIMIZATION.md')));
  const eBlk = G.readBlock(read(path.join(BASE, 'plans/E_EXPANSION.md')));
  a(!!oBlk && oBlk.indexOf('**v' + v.version + '**') >= 0, 'v2187: O 计划块的版本是现场版本 ' + v.version);
  a(!!eBlk && eBlk.indexOf('**v' + v.version + '**') >= 0, 'v2187: E 计划块的版本是现场版本 ' + v.version);
  a(!!oBlk && oBlk.indexOf(G.BEGIN) === 0, 'v2187: 块以 `' + G.BEGIN + '` 起（生成物标注「勿手改」）');

  // 逐项状态与现场判定一致：把块里每一行 `> | O3 | **已交付** |` 抽出来与 VIEW 对照
  const perItem = [];
  ['O', 'E'].forEach(function (line) {
    const blk = line === 'O' ? oBlk : eBlk;
    for (let i = 1; i <= 9; i++) {
      const id = line + i;
      const it = v.items[id];
      const ok = !!(it.files.length && it.wired);
      const want = '> | ' + id + ' | ' + (ok ? '**已交付**' : '未交付') + ' |';
      perItem.push({ id: id, ok: ok, inBlock: !!blk && blk.indexOf(want) >= 0, decl: want });
    }
  });
  perItem.forEach(function (p) {
    a(p.inBlock, 'v2187: 块内 ' + p.id + ' 的状态与现场一致（' + p.decl + '）');
  });
  a(perItem.filter(function (p) { return p.ok; }).length >= 8, 'v2187: 现场已交付编号 ≥ 8（保证判据非空转）');
  // ── A+ **常守判据：形态清单 ⊇ 现场命名**（文件头承诺过、但直到本轮才真落地）──
  //   为什么必须有：形态清单落后于现场命名时，`itemOf` 返回 null ⇒ 该编号「没有证据文件」
  //   ⇒ 块里写成**反事实**的「未交付」。本版之前刚栽过一次——批号写死成 `[12]`，
  //   第三批三把专锁（s3-b3-e4/e6/e8）三条正则全不中，已交付的三项一律写成「未交付」。
  //   判据形状：把 `tests/` 下**每一个**能被 `itemOf` 认出来的证据文件都过一遍，
  //   并额外要求「批式命中的文件数」与「第三批的编号确实被认出」两条下限（防空集恒真）。
  //   下限口径：**贴着实测值取**（本轮实测：认得的证据文件 16 个，其中批式 11 个），
  //     再留一格余量。刻意不写「占全部 .js 的百分比」——`tests/` 下绝大多数文件不是
  //     编号证据（是门禁、冒烟、工具驱动），用比例会把这条判据变成对目录规模的断言。
  //     真正承重的是下面第三批那三条**点名**判据：它们不随目录规模漂移。
  const evFiles = fs.readdirSync(path.join(BASE, 'tests')).filter(function (n) { return /\.js$/.test(n); });
  const recognized = evFiles.filter(function (n) { return !!G.itemOf(n); });
  const batched = recognized.filter(function (n) { return /^s3-b\d+-/.test(n); });
  a(recognized.length >= 15, 'v2187: 形态清单认得的证据文件 ≥ 15（实 ' + recognized.length + '）——防空集恒真');
  a(batched.length >= 10, 'v2187: 其中批式（s3-b<N>-…）≥ 10（实 ' + batched.length + '）——批号形态真的在面内');
  //   反向：`s3-` 前缀但不是 (o|e) 编号的历史线（s3-tp* / s3-tx* / s3-sp*）**必须认不出** ——
  //   它们属于 TP/TX 两条历史线，编号前缀与 O/E 无关；把它们认进来会让「已交付」计数虚高。
  const histLine = evFiles.filter(function (n) { return /^s3-(tp|tx|sp)\d/.test(n); });
  a(histLine.length >= 10 && histLine.every(function (n) { return G.itemOf(n) === null; }),
    'v2187: 历史线 s3-tp/tx/sp* 一律不被 O/E 形态认出（实 ' + histLine.length + ' 个）——防计数虚高');
  ['s3-b3-e4-v2187.js', 's3-b3-e6-v2187.js', 's3-b3-e8-v2187.js'].forEach(function (n) {
    a(evFiles.indexOf(n) >= 0 && G.itemOf(n) !== null,
      'v2187: 第三批证据文件 ' + n + ' 在磁盘上**且**被形态清单认出（实 ' + G.itemOf(n) + '）');
  });

  // ── B 运行时：复算 == 落盘块（手改块即红） ──
  const r2 = G.PLAN_FILES.map(function (pf) {
    const r = G.update(read(path.join(BASE, pf.rel)), pf.kind);
    return { rel: pf.rel, changed: r.changed, mode: r.mode };
  });
  a(r2.every(function (x) { return x.changed === false; }),
    'v2187: 复算结果与落盘块逐字相等（changed 应为全 false :: '
    + JSON.stringify(r2) + '）');

  // ── B 笔记树 ──
  const rn = checkNotes();
  a(rn.problems.length === 0,
    'v2187: 笔记树无游离文件且格式齐备（' + rn.count + ' 篇；problems ' + rn.problems.length
    + (rn.problems.length ? ' :: ' + JSON.stringify(rn.problems.slice(0, 3)) : '') + '）');
  a(rn.count >= 17, 'v2187: 笔记篇数 ' + rn.count + ' ≥ 17（游离文件归位后不漏计）');
  a(rn.files.every(function (f) { return f.indexOf('/') >= 0; }), 'v2187: 每一篇都在子目录里（无根目录游离）');
  const tx8 = 'implemented/architecture/2026-10-07-worldaxis-tx8-aftermath-architecture.md';
  a(rn.files.indexOf(tx8) >= 0, 'v2187: TX8 笔记已在 implemented/architecture/ 下（游离已归位）');
  a(readOrNull(path.join(NOTES, '2026-10-07-tx8-aftermath-architecture.md')) === null,
    'v2187: notes/ 根目录的原游离文件已不存在');

  // ── C 幂等 + 只读 ──
  const h0 = {
    idx: sha(path.join(BASE, 'index.js')),
    man: sha(path.join(BASE, 'manifest.json')),
    dead: sha(path.join(BASE, 'tests/dead-export-ledger.json')),
    reg: sha(path.join(BASE, 'tests/module-registry-ledger.json')),
    rej: sha(path.join(BASE, 'tests/reject-code-ledger.json'))
  };
  const w1 = G.update(read(path.join(BASE, 'plans/O_OPTIMIZATION.md')), 'O');
  const w2 = G.update(w1.text, 'O');
  a(w2.changed === false, 'v2187: 生成器幂等（二次更新 changed === false）');
  a(w1.text === read(path.join(BASE, 'plans/O_OPTIMIZATION.md')),
    'v2187: 更新过与未更新过的文本逐字相等（生成物已是最新）');
  a(sha(path.join(BASE, 'index.js')) === h0.idx && sha(path.join(BASE, 'manifest.json')) === h0.man,
    'v2187: 生成器只读（index.js / manifest.json 逐字未变）');
  a(sha(path.join(BASE, 'tests/dead-export-ledger.json')) === h0.dead
    && sha(path.join(BASE, 'tests/module-registry-ledger.json')) === h0.reg
    && sha(path.join(BASE, 'tests/reject-code-ledger.json')) === h0.rej,
    'v2187: 三本台账逐字未变（生成器不碰台账）');

  // ── C 校验脚本在仓内（零依赖） ──
  a(fs.existsSync(path.join(BASE, 'tools/gen-plan-status.js')), 'v2187: 生成器在仓内（tools/gen-plan-status.js）');
  a(typeof G.renderBlock === 'function' && typeof G.update === 'function',
    'v2187: 生成器可从仓内 require（门禁与工具共用同一份复算逻辑，零 npm 依赖）');
  const pkg = readOrNull(path.join(BASE, 'package.json'));
  a(pkg === null, 'v2187: 仓库零依赖（无 package.json）');
}

// ── 负控制：真源码内存副本破坏 ⇒ 同款判据必须现形 ──
function runNegative(a) {
  const idxSrc = read(path.join(BASE, 'index.js'));
  const runSrc = read(path.join(BASE, 'tests', 'run.js'));
  const oPlanSrc = read(path.join(BASE, 'plans/O_OPTIMIZATION.md'));

  // N1：改 index.js 版本号（不改计划文件）⇒ 计划块判据现形
  const m = idxSrc.match(/const VERSION = '([0-9]+)\.([0-9]+)\.([0-9]+)'/);
  a(!!m, 'v2187/neg N1: 能从 index.js 取到 VERSION 形态（锚点存在）');
  const nAnchor = "const VERSION = '" + m[1] + '.' + m[2] + '.' + m[3] + "'";
  a(idxSrc.split(nAnchor).length - 1 === 1,
    'v2187/neg N1: 版本锚点 `' + nAnchor + '` 在 index.js 中恰 1 次（撞车 ⇒ 本条静默跳过）');
  const bumped = m[1] + '.' + (Number(m[2]) + 1) + '.0';
  const idxBroken = idxSrc.split(nAnchor).join("const VERSION = '" + bumped + "'");
  a(idxBroken !== idxSrc, 'v2187/neg N1: 破坏真的改变了源码文本');
  const vBroken = G.VIEW({ idx: idxBroken });
  a(vBroken.version === bumped, 'v2187/neg N1: 假现场读到破坏后的版本 ' + bumped);
  const rB = checkPlans(vBroken);
  a(rB.problems.length > 0,
    'v2187/neg N1: 「改了 index.js 版本号而不改计划文件」⇒ 计划块判据现形（problems '
    + rB.problems.length + '）');
  a(rB.problems.some(function (p) { return p.kind === 'stale-block'; }),
    'v2187/neg N1: 现形形态是 stale-block（而不是别的错）');
  // 纯度：原版上同款判据为真
  a(checkPlans(G.VIEW()).problems.length === 0, 'v2187/neg N1: 原版上同款判据为真（判据纯度）');

  // N2：把某编号从 run.js 里摘掉 ⇒ 该编号状态必须退回「未交付」
  const evFile = 's3-b2-o3-v2182.js';
  a(runSrc.indexOf(evFile) >= 0, 'v2187/neg N2: ' + evFile + ' 确在 run.js 中（锚点存在）');
  const runBroken = runSrc.split(evFile).join('XX-REMOVED-XX.js');
  a(runBroken !== runSrc, 'v2187/neg N2: 破坏真的改变了 run.js 文本');
  const vB2 = G.VIEW({ run: runBroken });
  a(vB2.items['O3'].wired === 0, 'v2187/neg N2: 假现场里 O3 的 wired 归零');
  const blk2 = G.renderBlock('O', vB2);
  a(blk2.indexOf('> | O3 | 未交付 |') >= 0,
    'v2187/neg N2: 复算块把 O3 报成「未交付」（挂空即降级 —— 正是本门禁要守的那条）');
  a(G.renderBlock('O', G.VIEW()).indexOf('> | O3 | **已交付** |') >= 0,
    'v2187/neg N2: 原版上同款判据为真（O3 已交付）');

  // N3：手动改块里一条状态行 ⇒ B1/B2 的「块 == 复算」现形
  //   【锚点必须从现场取，不许写死某一项的状态】本行初版写死 `> | O6 | 未交付 |`：
  //   O6 一交付，那一行当场变成「**已交付**」⇒ 替换 0 命中、N3 两条判据假红 ——
  //   红的理由是「锚点随实现跑」，不是被破坏的判据现形。**锚点过期 ≠ 判据失败**，
  //   两者必须分得开（v2.187.0 收口轮同形态共四处：B3 / N3(收尾) / A13 / D12）。
  //   改成：正则取现场**任意**一条状态行，换成复算块里不可能出现的 O0 行。
  const m3 = oPlanSrc.match(/> \| O\d+ \| [^|]*\|/);
  a(!!m3, 'v2187/neg N3: 现场块里存在可篡改的状态行（锚点从现场取，不写死某一项）');
  const tampered = m3 ? oPlanSrc.replace(m3[0], '> | O0 | 未交付 |') : oPlanSrc;
  a(tampered !== oPlanSrc, 'v2187/neg N3: 篡改真的改变了计划文件文本');
  const blk3 = G.readBlock(tampered);
  a(blk3 !== G.renderBlock('O', G.VIEW()), 'v2187/neg N3: 被手改的块 ≠ 复算块（B 段判据现形）');
  a(G.readBlock(oPlanSrc) === G.renderBlock('O', G.VIEW()), 'v2187/neg N3: 原版上块 == 复算（判据纯度）');

  // N4：把 TX8 笔记挪回根目录（内存副本树）⇒ 笔记树判据现形
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'wa2187-'));
  try {
    const tree = path.join(tmp, 'notes');
    fs.mkdirSync(path.join(tree, 'implemented', 'architecture'), { recursive: true });
    fs.copyFileSync(path.join(NOTES, 'implemented/architecture/2026-10-07-worldaxis-tx8-aftermath-architecture.md'),
      path.join(tree, 'implemented/architecture/2026-10-07-worldaxis-tx8-aftermath-architecture.md'));
    const rn0 = checkNotes(tree);
    a(rn0.problems.length === 0, 'v2187/neg N4: 干净副本树上笔记树判据为真（判据纯度）');
    fs.renameSync(path.join(tree, 'implemented/architecture/2026-10-07-worldaxis-tx8-aftermath-architecture.md'),
      path.join(tree, '2026-10-07-tx8-aftermath-architecture.md'));
    const rn1 = checkNotes(tree);
    a(rn1.problems.some(function (p) { return p.kind === 'root-note'; }),
      'v2187/neg N4: 文件挪回根目录 ⇒ root-note 现形（' + rn1.problems.length + ' 条）');
    // 同一副本树上再破坏格式：去掉 Status 行
    const p2 = path.join(tree, '2026-10-07-tx8-aftermath-architecture.md');
    const s2 = read(p2).split('\n').filter(function (l) { return l !== 'Status: implemented'; }).join('\n');
    fs.writeFileSync(p2, s2);
    const rn2 = checkNotes(tree);
    a(rn2.problems.some(function (p) { return p.kind === 'missing-section' && p.section === 'Status:'; }),
      'v2187/neg N4: 去掉 Status 行 ⇒ missing-section 现形');
    a(rn0.problems.length === 0, 'v2187/neg N4: 原版（干净树）同款判据仍为真');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // N5：真源码逐字未变（破坏只发生在内存/临时副本上）
  a(sha(path.join(BASE, 'index.js')) === sha(path.join(BASE, 'index.js')) && read(path.join(BASE, 'index.js')) === idxSrc,
    'v2187/neg N5: index.js 真源码逐字未变');
  a(read(path.join(BASE, 'tests', 'run.js')) === runSrc, 'v2187/neg N5: tests/run.js 真源码逐字未变');
  a(read(path.join(BASE, 'plans/O_OPTIMIZATION.md')) === oPlanSrc, 'v2187/neg N5: 计划文件真源码逐字未变');
  const surf = require('./test-surface-gate.js').scan({});
  a(surf.orphans.indexOf('tests/o7-plan-tree-gate-v2187.js') < 0,
    'v2187/neg N5: 本门禁不在孤儿名单里（真在可达面里）');
  a(surf.spawned.indexOf('tests/o7-plan-tree-gate-v2187.js') >= 0
    || surf.locks.indexOf('tests/o7-plan-tree-gate-v2187.js') >= 0,
    'v2187/neg N5: 本门禁被登记为可达（locks 或 spawned）');
}

module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative),
  checkPlans: checkPlans, checkNotes: checkNotes
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { require('./mock.js'); require('./ui-gate-sync.js').fresh({}); runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('PLAN-STATUS-GATE-V2187: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('PLAN-STATUS-GATE-V2187: pass (' + pass + ')');
}
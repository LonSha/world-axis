#!/usr/bin/env node
// WorldAxis tests/s3-hygiene-v2204.js — v2.204.0（第三批）专锁：
//   仓库卫生读数与门禁（tools/repo-hygiene.js）的**自证 + 两向**
//
// ── 它治的病（克隆成本这一面：有界的地方被数着，没界的地方没人看）──────────
//   `.git` 是**本地状态**：`git status` 干净、全量回归全绿、每一项都「通过」，
//   于是**没有任何判据看过它**。而现场实测 `.git` 16M，其中 5.38 MiB / 499 个是
//   `.l2s.tmp_obj_*` 残骸（文件系统层留下的半成品对象）—— **`git gc` 也删除掉**（它们
//   不是 git 对象）。本仓对「没人看的量」的既有裁决是「给它判据」；本批照做，
//   并在同一批里**当场逮住自己的第一版缺陷**（见下）。
//
// ── 本批自己踩的真缺陷（判据第一版就错，且错得最难看）────────────────────
//   ① **单位表不认 `bytes`**：松散对象为 0 时 git 输出的是 `size: 0 bytes`（**不是** `0 B`），
//      而「0 个松散对象」恰是**最健康**的状态 ⇒ 第一版把它读成 `null`（=「量不到」），
//      CLI 当场 TypeError 崩、退出码 1。**门禁把最好的状态报成崩溃** —— 这是「读数塌了
//      却以最刺眼的方式现形」，也是「负控制原料要与真原料同形」这条纪律的又一次实证
//      （若自证原料只喂 `MiB`，这条缺陷会带着绿灯出厂）。
//   ② 打印面对 `null` 无保护（与 ① 独立：将来 git 换版本不给某字段同样崩）。
//   ③ **修法不分病灶**：`.l2s.tmp_obj_*` 残骸 `git gc` **删不掉**，而第一版对所有红灯
//      一律喊 `git gc --prune=now` —— 脚本自己写着「不给修法的红灯等于噪声」，
//      给一条**无效**修法比不给更糟。
//   三条已修，且各自配了**同形的负控制原料**（`0 bytes` / 缺格 / 超限）—— 见 N 段。
//
// ── 四段结构（与本仓既有专锁同规格）──────────────────────────────────
//   A 段 静态契约：真判据三点（CLI / 导出 / 自证）· 只读无 --fix · `--gc` 是显式动作 ·
//        反空转下限 · 本锁恰挂 1 处
//   B 段 运行时：真跑自证与三类原料（健康 / 超限 / 塌陷），并与 README 的名单面交叉核对
//   C 段 只读不变式：连调不变量 + 连调后真源码逐字未动
//   N 段 真源码破坏 + 两向自证（四组；破坏一律落在**磁盘上的源码副本**上，
//        原版上同款判据必须仍真 —— 这是本仓 H6 口径）
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/s3-hygiene-v2204.js';
const GATE_REL = 'tools/repo-hygiene.js';
const README_REL = 'README.md';
const RUN_REL = 'tests/run.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, sub) { return String(s).split(sub).length - 1; }
function j(v) { return JSON.stringify(v); }
/**
 * 负控制锚点表（H5 口径）：每条字面量在本文件**只声明一次**，N 段一律引用这里的条目 ——
 *   在 N 段里再抄一遍字面量，N0 的纯度判据当场就会报双重声明。
 */
const ANCHOR = {
  units: "{ bytes: 1 / 1048576, B: 1 / 1048576, KiB: 1 / 1024, MiB: 1, GiB: 1024 }",
  unitsRe: '(bytes|B|KiB|MiB|GiB)',
  fixBranch: "find .git/objects -name '.l2s.tmp_obj_*' -delete",
  packFloor: 'const MIN_PACK_MB = 1;',
  packKind: "kind: 'pack-face-collapsed'",
  looseMax: 'const MAX_LOOSE_MB = 25;'
};
/** 现场原料（三类；与真原料同形 —— 「0 bytes」不是异常，是常态）。 */
const RAW_OK = 'count: 0\nsize: 0 bytes\nin-pack: 5625\npacks: 1\nsize-pack: 7.79 MiB\nprune-packable: 0\ngarbage: 1\nsize-garbage: 0.01 MiB\n';
const RAW_BAD = 'count: 9\nsize: 90.00 MiB\nin-pack: 5\npacks: 1\nsize-pack: 8.00 MiB\ngarbage: 900\nsize-garbage: 900.00 MiB\n';
const RAW_TINY = 'count: 0\nsize: 0 bytes\nin-pack: 5\npacks: 1\nsize-pack: 0.10 MiB\ngarbage: 0\n';
/**
 * 造一份**磁盘上的源码副本**并加载它（真源码破坏的落点）。
 *   产物落在 os.tmpdir() 下的临时目录里，绝不碰真仓库；`broken(src)` 返回改后的源码。
 *   副本自足（本工具只 require fs / path / child_process），故可独立加载。
 */
function loadBroken(broken, tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa2204-hyg-' + tag + '-'));
  const p = path.join(dir, 'repo-hygiene.js');
  fs.writeFileSync(p, broken(rd(GATE_REL)));
  delete require.cache[p];
  const mod = require(p);
  return { mod: mod, path: p, dir: dir };
}
function runAll(a) {
  const A = require(path.join(BASE, GATE_REL));
  const GATE = rd(GATE_REL), README = rd(README_REL), RUN = rd(RUN_REL), SELF = rd(SELF_REL);

  // ════ A 段：静态契约 ══════════════════════════════════════════════
  (function () {
    // ① 真判据三点：能在命令行跑 / 能被 require / **有自证面**（本仓对判据的统一口径）
    a(GATE.indexOf('module.exports') > 0 && GATE.indexOf('require.main === module') > 0,
      'v2204C/A1: repo-hygiene 既能命令行跑、也能被 require（门禁复用同一份复算，不是第二套算法）');
    a(typeof A.audit === 'function' && typeof A.parse === 'function' && typeof A.selfTest === 'function',
      'v2204C/A1b: audit / parse / selfTest 三个导出面都在场（自证不是装饰）');
    a(GATE.indexOf('--self-test') >= 0 && A.selfTest({}).ok === true,
      'v2204C/A1c: `--self-test` 与 `selfTest()` 同源，且现场真绿');
    // ② 单位表必须认 `bytes`（本批的真缺陷就在这里）
    a(GATE.indexOf(ANCHOR.units) >= 0,
      'v2204C/A2: 单位表认 `bytes`（`size: 0 bytes` 是最健康的状态，读成 null 就是把「没有」报成「量不到」）');
    // ③ 只读：零写盘、无 --fix（它读的是本地状态，改不改是人的决定）
    const code = GATE.replace(/^\s*\/\/.*$/gm, '');
    a(code.indexOf('writeFileSync') < 0 && code.indexOf('appendFileSync') < 0 && code.indexOf('--fix') < 0,
      'v2204C/A3: 执行面上零写盘、无 --fix');
    // ④ `--gc` 是**显式动作**：require.main 分支之前不得有真调用（只有函数定义，没有调用点）
    const beforeMain = code.split('if (require.main === module)')[0];
    a(beforeMain.indexOf('collect(BASE)') < 0 && beforeMain.indexOf('function collect(') >= 0,
      'v2204C/A4: 被 require 时不动开发环境（collect 只有定义，调用只在显式 --gc 分支里）');
    // ⑤ 反空转下限在位（读数整体塌掉时，「没有垃圾」必须是假绿）
    a(GATE.indexOf(ANCHOR.packFloor) >= 0 && GATE.indexOf(ANCHOR.packKind) >= 0,
      'v2204C/A5: 反空转下限在位（pack 面读不出来 ⇒ 报红，而不是「无超限」）');
    // ⑥ 修法必须对得上病灶（gc 收不掉 l2s 残骸；filter-repo 是破坏性操作，永不出现在修法里）
    a(GATE.indexOf(ANCHOR.fixBranch) >= 0 && GATE.indexOf('filter-repo') >= 0,
      'v2204C/A6: 修法面分病灶（残骸给删除命令；filter-repo 在**否定式**一侧被点名禁止）');
    // ⑦ README 名单里点到它（名单与索引同值由 toolchain-gate 当场核，此处只判接线）
    a(README.indexOf('`repo-hygiene`') > 0, 'v2204C/A7: README 的 tools/ 名单里点到了 repo-hygiene');
    // ⑧ 本锁恰挂 1 处（orphan-lock 的 A 段要求）
    a(cnt(RUN, "runLock('./s3-hygiene-v2204.js')") === 1,
      'v2204C/A8: 本锁在 tests/run.js 上恰挂 1 处（实 ' + cnt(RUN, "runLock('./s3-hygiene-v2204.js')") + '）');
  })();

  // ════ N0：锚点纯度（H5）—— 锚点字面量只准声明一次，判据不得引用锚点串 ══
  (function () {
    Object.keys(ANCHOR).forEach(function (k) {
      a(cnt(SELF, ANCHOR[k]) === 1,
        'v2204C/N0: 锚点「' + k + '」在锁体里恰声明 1 次（实 ' + cnt(SELF, ANCHOR[k]) + '）');
    });
    ['units', 'fixBranch', 'packFloor', 'packKind', 'looseMax'].forEach(function (k) {
      const stripped = SELF.split("const ANCHOR = {")[1].split('};')[0];
      a(stripped.indexOf(ANCHOR[k]) >= 0, 'v2204C/N0b: 锚点「' + k + '」住在 ANCHOR 表里（不是散在判据里）');
    });
  })();

  // ════ B 段：运行时读数（真跑三类原料 + 与 README 交叉核对）═════════
  (function () {
    const ok = A.audit({ raw: RAW_OK });
    a(ok.ok === true, 'v2204C/B1: 健康原料上判据为真（实 ' + j(ok.problems.map(function (p) { return p.kind; })) + '）');
    a(ok.facts.sizeMB === 0 && ok.facts.count === 0,
      'v2204C/B1b: 「size: 0 bytes」读成 0（不是 null —— 这正是本批的真缺陷，实 ' + j(ok.facts.sizeMB) + '）');
    const bad = A.audit({ raw: RAW_BAD });
    const kinds = bad.problems.map(function (p) { return p.kind; });
    a(bad.ok === false && kinds.indexOf('garbage-over-limit') >= 0 && kinds.indexOf('loose-over-limit') >= 0,
      'v2204C/B2: 两处超限按面分档报出（实 ' + j(kinds) + '）');
    a(bad.fix.indexOf('.l2s.tmp_obj_') >= 0 && bad.fix.indexOf('git gc') >= 0 && bad.fix.indexOf('filter-repo') < 0,
      'v2204C/B2b: 修法对上任一病灶、且不含破坏性操作（实 ' + j(bad.fix) + '）');
    const tiny = A.audit({ raw: RAW_TINY });
    a(tiny.problems.map(function (p) { return p.kind; }).indexOf('pack-face-collapsed') >= 0,
      'v2204C/B3: pack 面塌陷 ⇒ 反空转下限现形（「没有垃圾」不在空集上恒真）');
    const miss = A.audit({ raw: 'count: 0\nsize: 0 bytes\n' });
    a(miss.problems.map(function (p) { return p.kind; }).indexOf('unreadable-fields') >= 0,
      'v2204C/B3b: 读数缺格 ⇒ 「量不到」如实现形，不被静默当成 0');
    a(A.selfTest({}).ok === true, 'v2204C/B4: 自证现场全绿');
    // 与 README 的**同源面**交叉核对：名单里点到它，且名单句的计数与索引同值（后者由 toolchain-gate 核）
    const claim = require(path.join(BASE, 'tests/toolchain-gate.js')).readmeClaim(BASE);
    a(claim.names.indexOf('repo-hygiene') >= 0,
      'v2204C/B5: README 名单解析结果里含 repo-hygiene（与 toolchain-gate 同一份解析，不是各读各的）');
  })();

  // ════ C 段：只读不变式（连调不变量 + 真源码逐字未动）══════════════
  (function () {
    const a1 = A.audit({ raw: RAW_BAD }), a2 = A.audit({ raw: RAW_BAD });
    a(j(a1) === j(a2), 'v2204C/C1: 同原料连调两次读数逐字一致（无隐藏状态）');
    a(rd(GATE_REL) === GATE, 'v2204C/C2: 连调后工具源码逐字未动（只读口径）');
  })();

  // ════ N 段：真源码破坏 + 两向自证（四组；破坏落在磁盘副本上）═════════
  const made = [];
  const mk = function (broken, tag) { const r = loadBroken(broken, tag); made.push(r.dir); return r.mod; };
  // N1：把 `bytes` 从单位表里摘掉 ⇒ 副本上「0 bytes」必须读成 null（缺陷可观测）；
  //     原版上同款判据必须仍真（= 0）—— 两向。
  (function () {
    const m = mk(function (s) {
      return s.replace(ANCHOR.unitsRe, '(B|KiB|MiB|GiB)')
        .replace(ANCHOR.units, '{ B: 1 / 1048576, KiB: 1 / 1024, MiB: 1, GiB: 1024 }');
    }, 'n1');
    a(m.parse('count: 0\nsize: 0 bytes\n').sizeMB === null,
      'v2204C/N1a: （两向）单位表摘掉 bytes ⇒ 副本把最健康的状态读成 null（破坏可观测）');
    a(A.parse('count: 0\nsize: 0 bytes\n').sizeMB === 0,
      'v2204C/N1b: （两向）原版上同款原料仍读成 0（判据在真源码上真、在破坏副本上假）');
  })();
  // N2：把修法分支改回「一律 git gc」⇒ 副本在残骸超限时给出**无效**修法；
  //     原版上必须给出删除命令 —— 两向。
  (function () {
    const m = mk(function (s) {
      return s.replace(ANCHOR.fixBranch, "'git gc --prune=now'");
    }, 'n2');
    a(m.audit({ raw: RAW_BAD }).fix.indexOf('.l2s.tmp_obj_') < 0,
      'v2204C/N2a: （两向）修法分支退化成单一 gc ⇒ 副本对残骸给出无效修法（破坏可观测）');
    a(A.audit({ raw: RAW_BAD }).fix.indexOf('.l2s.tmp_obj_') >= 0,
      'v2204C/N2b: （两向）原版上同一原料仍给出删除残骸的修法');
  })();
  // N3：摘掉 pack 面下限判据 ⇒ 副本上「读数塌了」被当成绿（假绿现形）；原版上必须报红。
  (function () {
    const m = mk(function (s) {
      return s.replace(ANCHOR.packKind, "kind: 'none'").replace(ANCHOR.packFloor, 'const MIN_PACK_MB = 0;');
    }, 'n3');
    a(m.audit({ raw: RAW_TINY }).problems.map(function (p) { return p.kind; }).indexOf('pack-face-collapsed') < 0,
      'v2204C/N3a: （两向）摘掉下限判据 ⇒ 副本在读数塌陷时判绿（反空转下限不是装饰）');
    a(A.audit({ raw: RAW_TINY }).problems.map(function (p) { return p.kind; }).indexOf('pack-face-collapsed') >= 0,
      'v2204C/N3b: （两向）原版上同一原料报红');
  })();
  // N4：把松散对象上限放宽到 1000 MiB ⇒ 副本上超限不再现形（阈值真被用）；原版上必须现形。
  (function () {
    const m = mk(function (s) { return s.replace(ANCHOR.looseMax, 'const MAX_LOOSE_MB = 1000;'); }, 'n4');
    a(m.audit({ raw: RAW_BAD }).problems.map(function (p) { return p.kind; }).indexOf('loose-over-limit') < 0,
      'v2204C/N4a: （两向）上限放宽 ⇒ 副本上该面不再现形（阈值真被用，不是摆设）');
    a(A.audit({ raw: RAW_BAD }).problems.map(function (p) { return p.kind; }).indexOf('loose-over-limit') >= 0,
      'v2204C/N4b: （两向）原版上同一原料现形');
  })();
  // N5：负控制全程未改真源码（破坏只活在临时副本里）
  (function () {
    [GATE_REL, README_REL, SELF_REL].forEach(function (rel) {
      a(rd(rel) === (rel === GATE_REL ? GATE : (rel === README_REL ? README : SELF)),
        'v2204C/N5: ' + rel + ' 在负控制之后**仍是原版**（重读逐字一致）');
    });
    a(A.audit({ raw: RAW_OK }).ok === true && A.selfTest({}).ok === true && A.audit({ raw: RAW_BAD }).ok === false,
      'v2204C/N5b: 负控制之后真源码上判据仍两向（好原料真、坏原料假）');
    made.forEach(function (d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* 临时目录清不掉不影响判据 */ } });
  })();
}
module.exports = { runAll: require(path.join(BASE, 'tests/lock-assert.js')).restoring(runAll) };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runAll(a);
  console.log('\ns3-hygiene-v2204 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}

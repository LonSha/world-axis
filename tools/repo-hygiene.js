#!/usr/bin/env node
// WorldAxis tools/repo-hygiene.js (v2.204.0) — 仓库卫生读数与门禁（克隆成本这一面）
//
// ── 它治的病（本仓从没量过的一件事）────────────────────────────────────
//   本仓是**零依赖**的（无 package.json、无 node_modules），产品面全是文本 ——
//   按理克隆应该很便宜。而现场实测（2026-10-11 复测，`.git` 16M）：
//     · garbage（`.l2s.tmp_obj_*` 之类的半成品对象残骸，由文件系统层留下的）
//         **5.38 MiB / 499 个** —— 这部分 `git gc` **也回收不掉**（它们不是 git 对象），
//         故判据不能只喊「跑 gc」，必须给独立上限 + 对得上的修法
//     · 未打包的松散对象（loose）**0 个**（曾达 47.7 MiB / 1403 个，已回收进 pack）
//     · 真正在 pack 里的 **7.79 MiB / 5625 个**
//   ⇒ 体积的大头**不在历史里**（pack 只 7.79 MiB，用 filter-repo 换不来）。而这件事**没有任何判据在看**：
//   `.git` 是本地状态，`git status` 干净、全量回归全绿 —— 每一项都「通过」，
//   唯一的表现是「克隆下来 16M，其中三分之一是收不掉的残骸」。
//
// ── 它判什么（两条，机械可核）──────────────────────────────────────────
//   ① **体积上限**：`garbage` 与 `loose` 各自的独立上限（`MAX_GARBAGE_MB` /
//      `MAX_LOOSE_MB`）。超限即红 —— 并**给出确切修复命令**（不给修法的红灯等于噪声）。
//   ② **对象面量得到 + 自洽**（第三轮实测修正）：`in-pack` / `count` / `packs` 三路
//      信号**都必须是数**（`null` = 量不到 ≠ 是 0）；且不许出现「报了 pack 却一个对象都
//      没读出来」的自相矛盾读数。
//   ⚠ **不许拿「pack 面 > 0」当反空转下限**：对象全在**松散**面时
//      `packs: 0 / in-pack: 0 / size-pack: 0 bytes` 是**新鲜仓与隔离候选树的常态**
//      （实测原料 `count: 3 / size: 12.00 KiB`）—— 拿它当「塌了」会让主回归一路假红。
//      本判据在空仓形态（四路皆零）上如实报 `empty` 并**不报红**（无对象可判）。
//
// ── 口径（否定式）──────────────────────────────────────────────────────
//   · **只读**（默认）：不跑 gc、不改仓库。`--gc` 是**显式动作**，不是默认行为 ——
//     工具不该在被 require 时改开发环境（与 `tools/hooks.js` 的「不自动安装」同规）。
//   · **不用 `git filter-repo`**：那会重写历史（所有 commit hash 变），是**破坏性**操作，
//     而本仓的病灶**不在历史里**（pack 只有 7.79 MiB）⇒ 用 `git gc --prune=now` 就够。
//     判据的这一条写死在这里：发现问题时给出的修复命令**必须是非破坏性的**。
//   · **读数取自 git 自己**（`git count-objects -v`），不自己遍历 `.git/objects`
//     —— 那是第二份读数实现，必然与 git 的算法漂移。
//
// ── 用法 ──────────────────────────────────────────────────────────────
//   node tools/repo-hygiene.js              # 读数 + 结论（超限即 exit 1）
//   node tools/repo-hygiene.js --json       # 机器可读
//   node tools/repo-hygiene.js --gc         # **显式**回收（git gc --prune=now，非破坏性）
//   node tools/repo-hygiene.js --self-test  # 自证（含负控制：一对能分清的原料 + 一条反例）
//   const H = require('../tools/repo-hygiene.js'); H.audit({raw})   # 门禁复用同一份复算
//
// ── 自证（本仓统一口径：判据必须能自证，「双向」指正反两侧都跑到）────────────
//   它自己准不准，此前无人核（它不是产品模块，`module-registry` 看不见它）。
//   `--self-test` 判四件：
//     · **报出来的就是活读数**：现场 `git count-objects -vH` 的 `size` 行必须被认出来
//       （若那条是 `0 bytes` 而被读成 `null`，这里立刻红 —— 本工具的真缺陷就在这条上）。
//     · 合成原料分档：`size: 0 bytes` ⇒ 0（不是 null）；`size: 12 KiB` ⇒ 0.0117 MiB。
//     · 反例：garbage 超限 ⇒ `garbage-over-limit`；pack 面塌 ⇒ `pack-face-collapsed`。
//     · 修法对得上病灶：garbage 类红灯给的命令**必须**是删残骸的那条（`git gc` 收不掉它），
//       且任何修法都**不得**指向 `git filter-repo`（重写历史换不来体积）。
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const BASE = path.join(__dirname, '..');
/** garbage（对象残骸）独立上限。现场实测 5.38 MiB / 499 个（曾达 101.5 MiB）⇒ 设 40 MiB。gc 收不掉这部分。 */
const MAX_GARBAGE_MB = 40;
/** 松散对象独立上限。现场实测 0 个（曾达 47.7 MiB / 1403 个）⇒ 设 25 MiB（回收后应落在 pack 里）。 */
const MAX_LOOSE_MB = 25;
/** 体积读数的人读形态。`null` = **量不到**（与 0 是两件事，故不冒充 0）。 */
function j(v) { return JSON.stringify(v); }
function fmtMB(v) {
  return (v === null || v === undefined) ? '(不可量)' : v.toFixed(2) + ' MiB';
}
/**
 * 解析 `git count-objects -vH` 输出。
 * 形态（每行 `key: value unit`）：
 *   count: 0 / size: 0 bytes / in-pack: 5625 / packs: 1 / size-pack: 7.79 MiB
 *   prune-packable: 0 / garbage: 499 / size-garbage: 5.38 MiB
 * 三处**实测踩过的坑**，全部机械化：
 *   · 值为 0 时 git 给的是 `0 bytes`（**不是** `0 B`）—— 单位表必须认 `bytes`，
 *     否则「松散对象 0 个」这个最健康的状态会被读成 `null`（= 量不到）并当场崩。
 *   · **size-garbage 这一行在部分 git 版本里缺**（老版本只给 garbage 计数）——
 *     缺了不许当成 0（「量不到」与「是 0」是两件事），故如实记 `null`。
 *   · 数值不带单位的形态（`-v` 而非 `-vH`）在这里是**读不到**，不许猜单位。
 */
/**
 * **对象面**的形态判定（显式词表；audit 与 selfTest 共用一处口径）。
 *   · `present`    —— 对象面**量得到且有对象**（`in-pack` / 松散计数 / `packs` 任一 > 0）
 *   · `empty`      —— 四路信号全为零：**空仓形态**（`git init` 后无提交）—— 合法状态，
 *                     如实报出，**不报红**
 *   · `unreadable` —— 任一路是 `null`（量不到）⇒ 读数本身塌了，报红
 * ⚠ **不要用「pack 面」当判据面**（第三轮实测的教训）：对象全在**松散**面时
 *   `packs: 0 / in-pack: 0 / size-pack: 0 bytes` —— 这是**新鲜仓与隔离候选树的常态**
 *   （实测：`count: 3 / size: 12.00 KiB / in-pack: 0 / packs: 0`），不是「塌了」。
 *   拿「按米」的下限去卡它，会让主回归与干净克隆一路假红。
 */
function objectFaceState(f) {
  const vals = [f.inPack, f.count, f.packs];
  if (vals.indexOf(null) >= 0) return 'unreadable';
  if ((f.inPack || 0) > 0 || (f.count || 0) > 0 || (f.packs || 0) > 0) return 'present';
  if ((f.sizePackMB || 0) > 0 || (f.sizeMB || 0) > 0) return 'present';
  return 'empty';
}
function parse(raw) {
  const out = { count: null, sizeMB: null, inPack: null, packs: null, sizePackMB: null,
    prunePackable: null, garbage: null, sizeGarbageMB: null, missing: [] };
  const want = { 'size': 'sizeMB', 'size-pack': 'sizePackMB', 'size-garbage': 'sizeGarbageMB' };
  String(raw || '').split('\n').forEach(function (l) {
    const m = l.match(/^([a-z-]+):\s*(.+)$/);
    if (!m) return;
    const k = m[1], v = m[2].trim();
    if (want[k]) {
      const n = v.match(/^([\d.]+)\s*(bytes|B|KiB|MiB|GiB)$/);
      if (n) {
        // `bytes` **必须认**：值为 0 时 git 输出 `size: 0 bytes`，而「松散对象 0 个」
        //   恰是本仓最健康的状态 —— 认不出来就会把「没有松散对象」读成「量不到」。
        const f = { bytes: 1 / 1048576, B: 1 / 1048576, KiB: 1 / 1024, MiB: 1, GiB: 1024 }[n[2]];
        out[want[k]] = Number(n[1]) * f;
      }
      return;
    }
    const map = { 'count': 'count', 'in-pack': 'inPack', 'packs': 'packs', 'prune-packable': 'prunePackable', 'garbage': 'garbage' };
    if (map[k]) out[map[k]] = Number(v) || 0;
  });
  ['count', 'sizeMB', 'inPack', 'packs', 'sizePackMB'].forEach(function (k) {
    if (out[k] === null) out.missing.push(k);
  });
  return out;
}
function readRaw(root) {
  // stderr 必须吞：这个文件系统会给 `.git/objects/**` 里的残骸打一片 `garbage found` 警告
  //   （实测上千行），不吞就会把读数的输出淹掉。
  return cp.execSync('git -C ' + JSON.stringify(root) + ' count-objects -vH',
    { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] });
}
/**
 * 现场核对。opt.raw 可注入（负控制据此在**内存字符串**上做真破坏后重跑同款判据）。
 * 返回 `{ok, facts, problems, limits, fix}`，不抛（读不出来除外 —— 那由调用方接）。
 */
function audit(opt) {
  const o = opt || {};
  const root = o.root || BASE;
  const raw = (o.raw !== undefined) ? o.raw : readRaw(root);
  const f = parse(raw);
  const problems = [];
  if (f.missing.length) problems.push({ kind: 'unreadable-fields', fields: f.missing });
  if (f.sizeGarbageMB === null) {
    // 「量不到」如实登记，但**不当作 0**：按 garbage 计数（个）作保守判据。
    if ((f.garbage || 0) > 0) problems.push({ kind: 'garbage-present', count: f.garbage, sizeMB: null });
  } else if (f.sizeGarbageMB > MAX_GARBAGE_MB) {
    problems.push({ kind: 'garbage-over-limit', sizeMB: Math.round(f.sizeGarbageMB * 100) / 100, limitMB: MAX_GARBAGE_MB });
  }
  if (f.sizeMB !== null && f.sizeMB > MAX_LOOSE_MB) {
    problems.push({ kind: 'loose-over-limit', sizeMB: Math.round(f.sizeMB * 100) / 100, limitMB: MAX_LOOSE_MB, count: f.count });
  }
  // ① 对象面**量得到**（「量不到」≠「是 0」；后者里还含合法的空仓形态）
  const objState = objectFaceState(f);
  if (objState === 'unreadable') problems.push({ kind: 'object-face-unreadable' });
  // ② **自洽**：报了 pack、却一个对象都没读出来（三路信号同时为零）⇒ 读数自相矛盾。
  //    实测：新鲜仓（`packs: 0`）与隔离候选树（`count: 587`）**都不命中**。
  if ((f.packs || 0) > 0 && (f.inPack || 0) === 0 && (f.sizePackMB || 0) === 0 && (f.count || 0) === 0) {
    problems.push({ kind: 'pack-empty-despite-present', packs: f.packs });
  }
  // 修法**必须对得上病灶**：`.l2s.tmp_obj_*` 不是 git 对象，`git gc` 收不掉它。
  //   「不给修法的红灯等于噪声」，给一条**无效**修法比不给更糟。
  const kinds = problems.map(function (p) { return p.kind; });
  const fix = [];
  if (kinds.indexOf('loose-over-limit') >= 0) fix.push('git gc --prune=now');
  if (kinds.indexOf('object-face-unreadable') >= 0) fix.push('检查 `git count-objects -vH` 能否输出完整的对象面读数');
  if (kinds.indexOf('garbage-over-limit') >= 0 || kinds.indexOf('garbage-present') >= 0) {
    fix.push("find .git/objects -name '.l2s.tmp_obj_*' -delete（gc 收不掉：它们不是 git 对象）");
  }
  if (!fix.length) fix.push('git gc --prune=now');
  if (objState === 'empty') f.objectFace = 'empty'; else f.objectFace = objState;
  return { ok: problems.length === 0, facts: f, problems: problems,
    limits: { garbageMB: MAX_GARBAGE_MB, looseMB: MAX_LOOSE_MB },
    fix: fix.join('；或 ') };
}
/** 显式回收（**非破坏性**：不重写历史、所有 commit hash 不变）。 */
function collect(root) {
  const r = (root || BASE);
  const out = cp.execSync('git -C ' + JSON.stringify(r) + ' gc --prune=now',
    { encoding: 'utf8', timeout: 600000, stdio: ['ignore', 'pipe', 'ignore'] });
  return { ok: true, out: String(out).split('\n').slice(-5).join(' | ') };
}
/**
 * 自证：返回 `{ok, fails}`（不抛）。负控制发生在**合成原料**上（不动真仓库）。
 * `raw` 可注入，便于测试面在内存字符串上重跑同款判据。
 */
function selfTest(opt) {
  const o = opt || {};
  const fails = [];
  const chk = function (cond, msg) { if (!cond) fails.push(msg); };
  // ① 活读数：**命名空间面**（count / size / in-pack / packs / size-pack）必须全部读出来。
  //   这里**不断言 pack 体积 > 0** —— 全量回归实测：隔离候选树的 `.git` 是临时造的
  //   （`in-pack: 0`、`size-pack: 0 bytes`），「pack 面按米为零」在那种树上**本来就不成立**，
  //   与「读数塌了」是两件事。故只断言「量得到」+「三态判定自洽」。
  const live = parse(o.raw !== undefined ? o.raw : readRaw(BASE));
  chk(live.sizeMB !== null, '活的 `size` 行没被认出来（sizeMB=' + j(live.sizeMB) + '）—— 「0 bytes」必须认');
  chk(live.sizePackMB !== null && live.inPack !== null && live.packs !== null,
    '活的对象面读数没被认出来（实 ' + j([live.sizePackMB, live.inPack, live.packs]) + '）');
  chk(objectFaceState(live) !== 'unreadable',
    '活树上对象面被判成「量不到」（实 ' + objectFaceState(live) + '）');
  // 三态词表两向（**与真原料同形**：新鲜仓/候选树把对象全放松散面）：
  //   · 松散面有对象 ⇒ present（实测原料：count 3 / size 12 KiB / in-pack 0 / packs 0）
  //   · 四路皆零     ⇒ empty（空仓是合法状态，不报红）
  //   · 任一路 null  ⇒ unreadable（量不到）
  chk(objectFaceState(parse('count: 3\nsize: 12.00 KiB\nin-pack: 0\npacks: 0\nsize-pack: 0 bytes\n')) === 'present',
    '松散面有对象时未判 present（「pack 面为空」是新鲜仓常态，不是塌陷）');
  chk(objectFaceState(parse('count: 0\nsize: 0 bytes\nin-pack: 0\npacks: 0\nsize-pack: 0 bytes\n')) === 'empty',
    '四路皆零时未判空仓形态（空仓是合法状态，如实报出）');
  chk(objectFaceState(parse('count: 0\nsize: 0 bytes\n')) === 'unreadable',
    '量不到时未判 unreadable（「量不到」不许当成「是 0」）');
  // 自洽两向：报了 pack 却一个对象都没读出来 ⇒ 现形；新鲜仓/候选树**不许**命中
  chk(audit({ raw: 'count: 0\nsize: 0 bytes\nin-pack: 0\npacks: 1\nsize-pack: 0 bytes\n' })
    .problems.map(function (p) { return p.kind; }).indexOf('pack-empty-despite-present') >= 0,
    '「报了 pack 却零对象」没现形（读数自相矛盾）');
  chk(audit({ raw: 'count: 587\nsize: 7.73 MiB\nin-pack: 0\npacks: 1\nsize-pack: 0 bytes\ngarbage: 1174\nsize-garbage: 13.12 MiB\n' })
    .problems.map(function (p) { return p.kind; }).indexOf('pack-empty-despite-present') < 0,
    '隔离候选树形态被自洽判据误报（假红：它的对象在松散面）');
  // ② 合成原料分档（一对能分清的原料：0 与 非 0 不许读成同一个值）
  const z = parse('count: 0\nsize: 0 bytes\nin-pack: 5\npacks: 1\nsize-pack: 2.00 MiB\ngarbage: 0\n');
  chk(z.sizeMB === 0 && z.count === 0, '「size: 0 bytes」未读成 0（实 ' + j(z.sizeMB) + '）');
  const k = parse('count: 3\nsize: 12 KiB\nin-pack: 5\npacks: 1\nsize-pack: 2.00 MiB\n');
  chk(k.sizeMB !== null && Math.abs(k.sizeMB - 0.01171875) < 1e-9, '「12 KiB」换算错（实 ' + j(k.sizeMB) + '）');
  // ③ 反例：两份坏原料必须被**分档报出**，且判据不许在合成原料上恒真
  const bad = parse('count: 9\nsize: 90.00 MiB\nin-pack: 5\npacks: 1\nsize-pack: 8.00 MiB\ngarbage: 900\nsize-garbage: 900.00 MiB\n');
  const rb = audit({ raw: 'count: 9\nsize: 90.00 MiB\nin-pack: 5\npacks: 1\nsize-pack: 8.00 MiB\ngarbage: 900\nsize-garbage: 900.00 MiB\n' });
  const kinds = rb.problems.map(function (p) { return p.kind; });
  chk(rb.ok === false, '两处超限的原料上判据仍是 ok');
  chk(kinds.indexOf('garbage-over-limit') >= 0 && kinds.indexOf('loose-over-limit') >= 0,
    '超限未按面分档（实 ' + j(kinds) + '）');
  chk(rb.fix.indexOf('.l2s.tmp_obj_') >= 0 && rb.fix.indexOf('git gc') >= 0,
    '修法没对上任一病灶（实 ' + j(rb.fix) + '）');
  chk(rb.fix.indexOf('filter-repo') < 0, '修法指向了破坏性的 filter-repo');
  const rcd = audit({ raw: 'count: 7\nsize: 7.73 MiB\nin-pack: 0\npacks: 1\nsize-pack: 0 bytes\ngarbage: 1174\nsize-garbage: 13.12 MiB\n' });
  chk(rcd.ok === true && rcd.problems.length === 0,
    '隔离候选树形态未被判绿（实 ' + j(rcd.problems.map(function (p) { return p.kind; })) + '）—— 干净克隆与隔离回归不许假红');
  const remp = audit({ raw: 'count: 0\nsize: 0 bytes\nin-pack: 0\npacks: 0\nsize-pack: 0 bytes\n' });
  chk(remp.ok === true && remp.facts.objectFace === 'empty',
    '空仓形态未如实报出（实 ' + j([remp.facts.objectFace, remp.problems.map(function (p) { return p.kind; })]) + '）');
  const rd_ = audit({ raw: 'count: 0\nsize: 0 bytes\n' });
  chk(rd_.problems.map(function (p) { return p.kind; }).indexOf('unreadable-fields') >= 0,
    '读数缺格却没现形（「量不到」被静默吞掉）');
  // ④ 健康的合成原料上判据必须为真（两向：坏原料红 ≠ 好原料也红）
  const good = audit({ raw: 'count: 0\nsize: 0 bytes\nin-pack: 5625\npacks: 1\nsize-pack: 7.79 MiB\nprune-packable: 0\ngarbage: 1\nsize-garbage: 0.01 MiB\n' });
  chk(good.ok === true, '健康原料上判据为红（实 ' + j(good.problems.map(function (p) { return p.kind; })) + '）');
  return { ok: fails.length === 0, fails: fails };
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.indexOf('--self-test') >= 0) {
    const st = selfTest({});
    if (st.ok) { console.log('repo-hygiene 自证通过（活读数 / 分档 / 反例 / 修法对得上病灶）'); process.exit(0); }
    st.fails.forEach(function (f) { console.log('  ✗ ' + f); });
    process.exit(1);
  }
  if (args.indexOf('--gc') >= 0) {
    console.log('■ 显式回收：git gc --prune=now（非破坏性 —— 不重写历史、commit hash 不变）');
    collect(BASE);
    const after = audit({});
    console.log('  回收后：garbage ' + fmtMB(after.facts.sizeGarbageMB)
      + ' · loose ' + fmtMB(after.facts.sizeMB) + ' / ' + after.facts.count + ' 个'
      + ' · pack ' + fmtMB(after.facts.sizePackMB));
    process.exit(after.ok ? 0 : 1);
  }
  let r;
  try { r = audit({}); }
  catch (e) { console.log('■ 仓库卫生读数'); console.log('  ⚠ 读不了：' + (e && e.message)); process.exit(2); }
  if (args.indexOf('--json') >= 0) { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); }
  console.log('■ 仓库卫生读数（克隆成本这一面）');
  console.log('  garbage ' + fmtMB(r.facts.sizeGarbageMB)
    + (r.facts.sizeGarbageMB === null ? '（本 git 版本不给 size-garbage）' : '')
    + ' / ' + r.facts.garbage + ' 个（上限 ' + r.limits.garbageMB + ' MiB）');
  console.log('  loose   ' + fmtMB(r.facts.sizeMB) + ' / ' + r.facts.count + ' 个（上限 ' + r.limits.looseMB + ' MiB）');
  console.log('  pack    ' + fmtMB(r.facts.sizePackMB) + ' / ' + r.facts.packs + ' 个（in-pack ' + r.facts.inPack
    + ' 个 —— 对象面 ' + r.facts.objectFace + '）');
  console.log('  可修剪 ' + r.facts.prunePackable + ' 个（in-pack ' + r.facts.inPack + '）'
    + (r.facts.objectFace === 'empty' ? ' · ⚠ 空仓形态：本判据在此形态上给不出结论（无对象可判）' : ''));
  if (r.problems.length) {
    r.problems.forEach(function (p) {
      console.log('  ✗ ' + p.kind + (p.sizeMB !== null && p.sizeMB !== undefined ? '：' + p.sizeMB + ' MiB' : '')
        + (p.limitMB ? '（上限 ' + p.limitMB + ' MiB）' : '')
        + (p.count !== undefined && p.count !== null ? '（' + p.count + ' 个）' : ''));
    });
    console.log('  修法（**非破坏性**）：' + r.fix + ' —— 或直接 `node tools/repo-hygiene.js --gc`');
    console.log('  ⚠ 不要用 git filter-repo：本仓的病灶**不在历史里**（pack 只 '
      + fmtMB(r.facts.sizePackMB) + '），重写历史换不来体积，只会让所有 commit hash 变。');
    process.exit(1);
  }
  console.log('  ✓ 无超限残骸、松散对象在限内、对象面量得到（读数不在空集上恒真）');
  process.exit(0);
}
module.exports = { BASE: BASE, MAX_GARBAGE_MB: MAX_GARBAGE_MB, MAX_LOOSE_MB: MAX_LOOSE_MB,
  parse: parse, readRaw: readRaw, fmtMB: fmtMB, objectFaceState: objectFaceState,
  audit: audit, collect: collect, selfTest: selfTest };
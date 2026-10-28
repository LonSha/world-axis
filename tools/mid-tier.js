#!/usr/bin/env node
// WorldAxis tools/mid-tier.js (v2.206.0) — 两档回归的**中档**（mid）入口与单一真源
//
// ── 它治的病（本仓自己记过的一条盲区）──────────────────────────────────
//   `tools/smoke.js`（v2.204.0）把「动了就会炸的那几面」压进 15 秒，全量约 29 分钟 ——
//   两档之间的空档，恰好是**跨文件同值判据与生成物**这一类。R183 那批红就是三组：
//     ① `tests/run.js` 6 处版本断言的消息文本停在旧版；
//     ② `plans/` 四份计划文件的「现场读数块」停在旧版（O7 门禁的口径）；
//     ③ README 版本锚点（`tools/doc-gate.js --anchors` 的口径）。
//   三处的共同形态：**判据存在、也在全量里跑，但只在全量里跑** ⇒ 发现时间 = 29 分钟。
//   本工具把这一类收成一档：覆盖「快档 ∪ 跨文件一致性面」。
//
// ── 三档的关系（单一真源，不重列）──────────────────────────────────────
//   快档：`tools/smoke.js` 的 `SMOKE_SET` —— 本档**包含**它，不另抄一份；
//   中档：`SMOKE_SET` + `MID_EXTRA`（本文件**唯一**新增的那张表）；
//   全量：`node tests/run.js` —— **仍是收口门槛**，中档不是替代品。
//   关系是「快 ⊂ 中 ⊂ 全」，由 `tests/s3-mid-v2206.js` 钉住：把快档成员从本档里摘掉
//   （而不是只加）时，门禁当场报红。
//
// ── 收录口径（与快档同规，只是「秒级」放宽到「分钟级」）───────────────────
//   ① 可独立运行（有 CLI 入口）；② 现场实测 < `MAX_MS_MID`；③ 退出码即结论。
//   ④ **模块冒烟面整类收入**：`tools/*_smoke.js` 那 14 个的唯一现形通道是 `tests/run.js`
//      的挂载点（29 分钟那一趟），实测每个 110–539ms，故整类收进本档；真源不搬家，
//      由 `tests/s3-mid-v2206.js` 的 A14/A15 钉住（见 MID_EXTRA 里那一节）。
//   耗时**一律当场实测**，不抄常量 —— 写死一个「它很快」的假设，正是本仓治过的
//   「读数与现场脱钩」。不收录的成员**必须留下实测数字与理由**（见 `EXCLUDED`）。
//
// ── 边界（如实登记）────────────────────────────────────────────────────
//   · 本档**不承诺**省时百分比，也不替代全量：它只把「发现时间」从 29 分钟压到 1 分钟。
//   · 子进程输出**落盘**，不走 PIPE —— 本仓实测过输出远超 64KB 时父进程 wait、
//     子进程阻塞在写 stdout 的**父子互等死锁**。
//   · 只读：不改产品、不改测试、不动版本。
//
// 用法：
//   node tools/mid-tier.js              # 跑中档（全绿 exit 0；任一红 exit 1）
//   node tools/mid-tier.js --list       # 只列成员与现场耗时
//   node tools/mid-tier.js --json       # 机器可读
//   node tools/mid-tier.js --self-test  # 集自证 + 与快档的包含关系
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const BASE = path.join(__dirname, '..');
const SMOKE = require('./smoke.js');
/**
 * 入口档位（三档口径本档自持；v2.256.0 起原委托对象 tests/toolchain-gate.js 已退役）。
 *   selfTest：含 `--self-test`；cli：含 `require.main` 守卫；
 *   script：无 `module.exports` 且零绝对路径字面量（纯脚本体）；
 *   其余（有 exports 却没守卫、或写死绝对路径）= bare ⇒ 报红。
 *   注：`script` 档为什么合法见 entryKind 的第三条分支 —— 它不是「豁免」，
 *   是一条**有判据的档位**（零绝对路径这一条是运行质量的实义面）。
 */
const ENTRY_SELFTEST = '--self-test';
const ENTRY_CLI = 'require.main';
const ENTRY_EXPORTS = 'module.exports';
const ABS_LITERAL = /['"]\/(?:tmp|home|Users|var|srv)\//;
function entryKind(src) {
  const abs = ABS_LITERAL.test(src);
  if (src.indexOf(ENTRY_SELFTEST) >= 0) return 'selfTest';
  if (src.indexOf(ENTRY_CLI) >= 0) return 'cli';
  return (src.indexOf(ENTRY_EXPORTS) < 0 && !abs) ? 'script' : 'bare';
}
/** 中档单成员实测上限（快档是 12000ms）。 */
const MAX_MS_MID = 30000;
/**
 * 中档**新增**的那一层（快档之上）。`args` 缺省即不带参数跑。
 *   ⚠ 每条的 `why` 写「它挡住什么」，不写「它是什么」—— 名字本身已经说了后者。
 */
const MID_EXTRA = [
  { rel: 'tools/doc-gate.js',
    why: '文档注释面读数（anchors 子面已随 v2.256.0 README 精简退役）' },
  { rel: 'tools/loose-readings.js',
    why: '散装读数与探针脱钩（U3：本该「分钟级现形」的那一类）' },
  { rel: 'tests/o7-plan-tree-gate-v2187.js',
    why: 'plans/ 四份计划文件的现场读数块过期（生成物只在全量里被对过）' },
  { rel: 'tests/o6-layer-gate-v2187.js',
    why: '分层入口三态与裁剪器（分层本身的判据，坏了会让「省时」变成「漏跑」）' },
  { rel: 'tests/test-surface-gate.js',
    why: '测试面归属：孤儿专锁与形式挂载（锁存在 ≠ 锁被跑）' },
  { rel: 'tests/orphan-lock-v2750.js',
    why: '孤儿专锁（有文件、没入口）' },
  { rel: 'tests/gate-timeout-v2105.js',
    why: '门禁超时熔断的调用点武装（卡死面）' },
  { rel: 'tests/u4-export-lifecycle-v2191.js',
    why: '导出面去向与复查期（有登记 ≠ 有去向）' },
  { rel: 'tests/o8-consumer-gate-v2187.js',
    why: '导出面的消费者归属（新导出无消费者而无人知）' },
  { rel: 'tests/ev1-evidence-qa-v2208.js',
    why: 'E1 证据问答：引用号由代码核对（越界号拒收）、零命中要与「没查全」分列、玩家视角在检索前收窄面 —— 这三条任一坏了，问答就会开始「看着有据其实没有」' },
  { rel: 'tools/pending_center_smoke.js', ms: 391,
    why: '本模块（pending-center）自己的冒烟 —— **改了哪个模块就该跑那个模块的冒烟**：它此前只在全量里跑（run.js 以 spawnSync 调它），而首跑中档当场逮到它带着两处过时断言（S22 旧自述 / S29 旧版本号）与一句已变假的声明（「导出面没有任何写口」而本版新增了 act）—— 实测 391ms，远低于 MAX_MS_MID' },
  // ── 模块冒烟面（整类收入 —— 本档的第二条收成员口径）──────────────────────
  //   口径：**改了哪个模块，就该跑那个模块的冒烟**。`tools/*_smoke.js` 这一类（14 个）
  //   的**唯一现形通道**是 `tests/run.js` 以 `spawnSync` 调它们 —— 而 run.js 是 29 分钟
  //   那一趟。现场实测每个 110–539ms（合计约 4.4s），与 R183 那批红逐字同源：
  //   「判据存在、也在全量里跑，但**只在全量里跑**」⇒ 发现时间 = 29 分钟。
  //   ⚠ 本表**不派生**：派生要扫 run.js 的调用点形态，**漏匹配会静默少收成员** ——
  //   少收是最难发现的一类失效（档照绿、覆盖面悄悄变窄）。真源留在 run.js，
  //   判据交给 `tests/s3-mid-v2206.js`：A14 判「run.js 挂的冒烟**全部**在本档内」、
  //   A15 配反空转下限 `SMOKE_FACE_MIN`、N7 走两向（含「摘掉 run.js 的挂载点 ⇒ 判据
  //   不响」，如实说明方向是「run.js ⊆ 本档」而不是反过来）。
  { rel: 'tools/agenda_smoke.js', ms: 457,
    why: 'E2 世界日程：逐源「读不出来」与「这类条目真的没有」在真装载面下必须可分（v2.205.0 优化 2 的守卫面）' },
  { rel: 'tools/capacity_audit_smoke.js', ms: 367,
    why: 'O4 存储压力 / 义务清点 / 迁移预检：容量面只报不判，读数不许被自报值带偏' },
  { rel: 'tools/chronicle_view_smoke.js', ms: 357,
    why: 'E5 世界纪事：视图面在真装载面下成立（空与有事可分）' },
  { rel: 'tools/perf_baseline_smoke.js', ms: 539,
    why: 'O3 性能基线：无头下实机读数**必须为空且给得理由**（把「没测」写成「没问题」是同一族病）' },
  { rel: 'tools/world_health_smoke.js', ms: 464,
    why: 'O5 世界健康：empty 与 allClear 不可压成一个绿点（压掉就是「点了没反应」的另一种写法）' },
  { rel: 'tools/tx1_smoke.js', ms: 110,
    why: 'TX1 接线：diplomacy 与注入链在最小装载序下成立（专锁判契约，它判接线真接上了）' },
  { rel: 'tools/tx2_smoke.js', ms: 110,
    why: 'TX2 接线：agency 与注入链在最小装载序下成立' },
  { rel: 'tools/tx3_smoke.js', ms: 367,
    why: 'TX3 接线：freight 与守恒运输链在最小装载序下成立' },
  { rel: 'tools/tx4_smoke.js', ms: 333,
    why: 'TX4 接线：storyChoice 十导出与选择链在真装载面下成立' },
  { rel: 'tools/tx6_smoke.js', ms: 372,
    why: 'TX6 接线：多阶段委托、交付核验与资源履约（commission）' },
  { rel: 'tools/tx7_smoke.js', ms: 339,
    why: 'TX7 接线：investigation 的调查链与默认关' },
  { rel: 'tools/tx8_smoke.js', ms: 355,
    why: 'TX8 接线：aftermath 与 region 的善后链' },
  { rel: 'tools/tx9_smoke.js', ms: 340,
    why: 'TX9 接线：operations 与 inst 的机构链' },
  { rel: 'tests/s3-b1-e1c-v2207.js', ms: 700,
    why: '本模块（pending-center）v2.208.0 新增面的专锁 —— 与 pending_center_smoke 同规：**改了哪个模块就该跑那个模块的专锁**。它钉的是「并集不是交集」与「absent ≠ 无期限」（子因四分 + 日程面不可用单列）' },
  { rel: 'tests/version-surface-gate-v2185.js',
    why: '版本白名单形态面（升版时名单只改一处的那种漂移）' },
  { rel: 'tests/ev6-panel-nav-v2209.js',
    why: '优化 6 面板导航协议与精确定位（v2.209.0）：三处现场点下去要**真停在那一行**、切页不重复绑定、且带 10 个真源码破坏用例。它自己的红有两类最刺眼 —— ①「按钮照在、点了没反应」（绑定器追不上出口）②「页到了、那条不在」（归属当落点）。两者在界面上都表现为「点了没反应」，只有跑到这一层才看得见' }
];
/** 不收录的成员：**必须**留下实测数字与理由（「太慢」两个字不算理由）。 */
const EXCLUDED = [
  { rel: 'tests/readings-v2106.js', ms: 115456,
    why: '它是「一轮一次」那一档（实测 115.5s）：判据本身没错，频率不对 —— 塞进中档会把中档拖成两分钟，然后中档也会被绕过（绕过的通道必须稀缺）' },
  { rel: 'tests/o9-outlet-gate-v2186.js', ms: 55805,
    why: '实测 55.8s（全知出口闸 × 宿主矩阵）：单独跑已接近中档全档预算的一半，按「预算分摊」留在一轮一次那一档' }
];
/** 中档成员集：快档原样 + 本档新增（**不重列**快档成员）。 */
function members() {
  const fast = SMOKE.SMOKE_SET.map(function (m) {
    return { rel: m.rel, args: [], why: '（快档成员）' + m.why, from: 'smoke' };
  });
  const extra = MID_EXTRA.map(function (m) {
    return { rel: m.rel, args: (m.args || []).slice(), why: m.why, from: 'mid' };
  });
  return fast.concat(extra);
}
/**
 * 现场跑一个成员：**输出落盘**，返回 `{rel, ms, rc, tail}`。不抛（子进程失败如实返回）。
 *   opt.dir 可注入落盘目录（专锁在副本树上跑时用得到一个沙箱目录）。
 */
function runOne(m, opt) {
  const o = opt || {};
  const root = o.root || BASE;
  const dir = o.dir || os.tmpdir();
  const log = path.join(dir, 'worldaxis-mid-' + path.basename(m.rel) + '-' + Date.now() + '.log');
  const fd = fs.openSync(log, 'w');
  const t0 = Date.now();
  let r = null;
  try {
    r = cp.spawnSync(process.execPath, [path.join(root, m.rel)].concat(m.args || []),
      { cwd: root, stdio: ['ignore', fd, fd], timeout: o.ms || 180000 });
  } finally { try { fs.closeSync(fd); } catch (e) {} }
  const ms = Date.now() - t0;
  let tail = '';
  try { tail = String(fs.readFileSync(log, 'utf8')).split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 200); } catch (e) { tail = '(日志读不到)'; }
  try { fs.unlinkSync(log); } catch (e) {}
  return { rel: m.rel, args: (m.args || []).slice(), ms: ms,
    rc: (r && r.status === null) ? -1 : (r ? r.status : -1), tail: tail, log: log };
}
/**
 * 集自证：成员存在 + 有 CLI 入口 + 与快档的**包含关系**（快 ⊆ 中）。
 *   opt.set / opt.root / opt.smokeSet 可注入（专锁据此在**破坏副本**上驱动同一份判据 ——
 *   不对判据自己的实现断言，而是对真源码的破坏副本断言）。
 */
function verifySet(opt) {
  const o = opt || {};
  const root = o.root || BASE;
  const set = o.set || members();
  const fast = o.smokeSet || SMOKE.SMOKE_SET;
  const complaints = [];
  const rows = [];
  set.forEach(function (m) {
    let src = '';
    try { src = fs.readFileSync(path.join(root, m.rel), 'utf8'); } catch (e) { complaints.push({ rel: m.rel, why: 'missing' }); return; }
    // 入口判据：三档口径（selfTest / cli / script / bare）在本文件内自持。
    //   v2.256.0 起 tests/toolchain-gate.js（原委托对象）随 README 精简退役，
    //   故本档的 entryKind 成为该口径的单一真源 —— 判据仍在 A6 与 N4 上被两向驱动。
    const entry = entryKind(src);
    if (entry === 'bare') complaints.push({ rel: m.rel, why: 'no-entry' });
    rows.push({ rel: m.rel, entry: entry, from: m.from || null });
  });
  // 包含关系：快档每个成员必须在本集内（快 ⊆ 中）。**反方向不要求**（本档故意大于快档）。
  const rels = set.map(function (m) { return m.rel; });
  const missing = fast.map(function (m) { return m.rel; }).filter(function (r) { return rels.indexOf(r) < 0; });
  missing.forEach(function (r) { complaints.push({ rel: r, why: 'smoke-member-not-in-mid' }); });
  // 反空转下限：快档若成空表，上面那条「全部在集内」在空集上恒真。
  const MIN_SMOKE = 10;
  if (fast.length < MIN_SMOKE) complaints.push({ rel: 'tools/smoke.js', why: 'smoke-set-too-small', got: fast.length, min: MIN_SMOKE });
  return { ok: complaints.length === 0, complaints: complaints, rows: rows,
    midSize: rels.length, smokeSize: fast.length, missing: missing };
}
function main() {
  const args = process.argv.slice(2);
  if (args.indexOf('--self-test') >= 0) {
    const v = verifySet({});
    if (!v.ok) {
      v.complaints.forEach(function (c) { console.log('  x ' + c.rel + '：' + c.why); });
      process.exit(2);
    }
    const byEntry = {};
    v.rows.forEach(function (r) { byEntry[r.entry] = (byEntry[r.entry] || 0) + 1; });
    console.log('■ mid 集自证：' + v.midSize + ' 个成员全部存在且入口档位合法'
      + '（' + Object.keys(byEntry).sort().map(function (k) { return k + ' ' + byEntry[k]; }).join(' / ')
      + ' —— 三档口径由本档自持，不另立豁免名单）');
    console.log('■ 三档关系：快档 ' + v.smokeSize + ' 个成员**全部**在本档内（快 ⊆ 中；反方向不要求）');
    process.exit(0);
  }
  const set = members();
  const listOnly = args.indexOf('--list') >= 0;
  console.log('■ 中档回归（mid）· ' + set.length + ' 个成员 · 单成员上限 ' + MAX_MS_MID + 'ms');
  const rows = [];
  let bad = 0;
  set.forEach(function (m) {
    if (listOnly) { rows.push({ rel: m.rel, args: m.args, ms: -1, rc: 0 }); return; }
    const r = runOne(m);
    rows.push(r);
    const slow = r.ms > MAX_MS_MID;
    const mark = r.rc === 0 && !slow ? 'v' : (r.rc === 0 ? '!' : 'x');
    if (r.rc !== 0) bad++;
    console.log('  ' + mark + ' ' + r.rel + (r.args.length ? ' ' + r.args.join(' ') : '') + '  ' + r.ms + 'ms'
      + (r.rc !== 0 ? '  rc=' + r.rc + '  ' + r.tail : (slow ? '  <- 超上限，应移出中档' : '')));
  });
  if (args.indexOf('--json') >= 0) { console.log(JSON.stringify({ set: set, rows: rows, bad: bad, excluded: EXCLUDED }, null, 2)); }
  if (listOnly) { console.log('  （--list：只列成员，未重跑）'); process.exit(0); }
  const total = rows.reduce(function (s, r) { return s + Math.max(0, r.ms); }, 0);
  console.log('  合计 ' + (total / 1000).toFixed(1) + 's · 通过 ' + (set.length - bad) + ' / 失败 ' + bad);
  if (bad) { console.log('  x 中档有红：这一档存在的理由就是「在 29 分钟之前先知道」'); process.exit(1); }
  console.log('  v 中档全绿（这不是「可以发布」，是「可以往下走」——全量仍是收口门槛）');
  process.exit(0);
}
if (require.main === module) main();
/**
 * 模块冒烟面（**真源是 `tests/run.js` 的挂载点**，本表不派生）。
 *   返回 run.js 里以 `spawnSync(process.execPath, [path.join(BASE, 'tools/*_smoke.js')])`
 *   形态挂载的全部冒烟相对路径 —— 专锁 A14 用它判「run.js 挂了而本档没收」。
 *   为什么本档不直接派生：派生要扫调用点形态，**漏匹配会静默少收成员**（少收是
 *   最难发现的一类失效：档照绿、覆盖面悄悄变窄）。故真源留在 run.js，判据在专锁。
 */
const RUN_REL = 'tests/run.js';
const SMOKE_FACE_MIN = 10;
const SMOKE_FACE_RE = /spawnSync\(process\.execPath,\s*\[path\.join\(BASE,\s*'(tools\/[A-Za-z0-9_]+_smoke\.js)'\)\]/g;
function smokeFaceRels(opt) {
  const o = opt || {};
  // opt.src 可注入 run.js 文本（专锁在**破坏副本**上驱动同一份判据用）；
  //   opt.root 可注入仓库根（副本树）。两者都缺省时读本仓真源码。
  const src = (typeof o.src === 'string')
    ? o.src
    : fs.readFileSync(path.join(o.root || BASE, RUN_REL), 'utf8');
  const out = [];
  let m;
  SMOKE_FACE_RE.lastIndex = 0;
  while ((m = SMOKE_FACE_RE.exec(src)) !== null) {
    if (out.indexOf(m[1]) < 0) out.push(m[1]);
  }
  return out;
}
module.exports = { BASE: BASE, MAX_MS_MID: MAX_MS_MID, MID_EXTRA: MID_EXTRA, EXCLUDED: EXCLUDED,
  members: members, runOne: runOne, verifySet: verifySet,
  ENTRY_SELFTEST: ENTRY_SELFTEST, ENTRY_CLI: ENTRY_CLI, ENTRY_EXPORTS: ENTRY_EXPORTS,
  SMOKE_FACE_MIN: SMOKE_FACE_MIN, smokeFaceRels: smokeFaceRels };

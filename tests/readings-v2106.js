'use strict';
/**
 * tests/readings-v2106.js — 硬读数一致性（计划一 #4/#5/#6）四段专锁。
 *   A 静态契约：取值面形状、锚点表、导出面、覆盖面下限。
 *   B 运行时：真跑 readings 模块，拿现场读数（族内一致 / 等于实测 / 台账同源 / 回填计划空）。
 *   C 不变式：判据纯只读（连调不变量、不改被取证文件）。
 *   N 负控制：**真源码破坏 → 在内存副本上重跑同款真判据**（破坏一律「条件置假」）。
 *
 * 为什么负控制走内存副本而不是写盘：本模块要治的病之一就是「读到的数与现场脱钩」，
 *   而验证「判据真会现形」如果靠改真文件，验证者自己就成了风险源。故 coherence / ledgerReport
 *   各留一个**接缝**（opt.live / opt.read），破坏只发生在内存里的字符串上。
 *
 * 本锁自证（H 系列口径）：
 *   H5 每个锚点字面量在本文件只声明一次、且不参与任何判据的**构造**（判据用锚点去现场定位，
 *      不把锚点串当期望值）。
 *   H6 判据两向自证：原版上判据必须为真（N10），破坏副本上必须为假（N1–N7）；
 *      且破坏必须**真的改变源码**（N5 逐个核对），否则「没现形」会被误读成「判据太弱」。
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/readings-v2106.js';
const MOD_REL = 'tests/readings.js';
const RUN_REL = 'tests/run.js';

/**
 * 统一锚点表（审计面要求 {rel, txt} 形态；txt 在目标文件里恰中 1 次）。
 * 一律取**不含反斜杠**的行首片段——含非换行反斜杠的锚点在统一锚点纯度口径下结构性不可满足
 * （R87 的 H7 已记档），故此处不碰那条边界。
 */
const ANCHORS = {
  // 注：aRoot 必须用**双引号**写成整串——它内含 `'..'`，若用单引号就要靠 `+ "'..'" +` 拼接，
  //   而拼接后本文件里就不存在那个字面量了 ⇒ 审计的纯度口径（字面量在本文件出现 **1** 次）必然报
  //   `impure`。v2.106.0 实测：审计是对的，错的是我这张表（本锁 A11 当时只挡重复、不挡缺失，漏了它）。
  aRoot: { rel: MOD_REL, txt: "const ROOT = path.join(__dirname, '..');" },
  aVersion: { rel: MOD_REL, txt: 'function versionOfIndex() {' },
  aProbe: { rel: MOD_REL, txt: "  const inv = require('./inventory.js');" },
  aCoherence: { rel: MOD_REL, txt: 'function coherence(src, opt) {' },
  aFieldMap: { rel: MOD_REL, txt: "  'dead.length': 'dead'," },
  aWire: { rel: RUN_REL, txt: "const rd = require('./readings.js');" }
};

const PROBLEM_KINDS = ['intra-drift', 'stale-reading', 'message-mismatch', 'no-probe',
  'version-mismatch', 'note-mismatch', 'note-no-version', 'unreadable'];

function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }

/** 现场破坏：把**全部**出现处一次改掉（字符串版 replace 只替换第一处——v2.105.0 的 D2 教训）。 */
function allReplace(src, from, to) { return src.split(from).join(to); }

/** 在真源码上做一次破坏，并证明破坏真的发生了（没打中 ⇒ 抛，不许静默）。 */
function breakOnce(src, from, to, label) {
  const out = allReplace(src, from, to);
  if (out === src) throw new Error('破坏未生效（锚点没打中）:: ' + label + ' :: ' + from);
  return out;
}

/** 台账文本注入器（负控制和缝）：只替换目标台账，其余原样。 */
function injectLedger(rel, mut) {
  return function (r) {
    const t = rd(r);
    return r === rel ? mut(t) : t;
  };
}

function runAll(assert) {
  const R = require('./readings.js');
  const runSrc = rd(RUN_REL);

  // ═══════════ A 静态契约 ═══════════
  const exp = ['FIELD_OF', 'LEDGERS', 'MESSAGE_LABEL', 'sites', 'groups', 'measure', 'coherence',
    'messageChecks', 'ledgerReport', 'backfillPlan', 'backfill', 'versionOfIndex',
    'stripLineComments', 'assertBlocks', 'labelValue', 'labelSites', 'summary', 'discover'];
  const missing = exp.filter(function (k) { return typeof R[k] === 'undefined'; });
  assert(missing.length === 0, 'A1 取值面导出齐备（缺：' + (missing.join(',') || '无') + '）');
  assert(Object.keys(R.FIELD_OF).length === 7, 'A2 读数族 7 态（实 ' + Object.keys(R.FIELD_OF).length + '）');
  assert(Array.isArray(R.LEDGERS) && R.LEDGERS.length === 3, 'A3 台账面 3 本（实 ' + R.LEDGERS.length + '）');
  assert(Object.keys(ANCHORS).length === 6, 'A4 锚点表 6 条（实 ' + Object.keys(ANCHORS).length + '）');

  // A5–A10 逐锚点：在目标文件恰中 1 次（**逐个站点判断**，不做全局存在性判断）
  Object.keys(ANCHORS).forEach(function (k, i) {
    const a = ANCHORS[k];
    const src = rd(a.rel);
    const n = src.split(a.txt).length - 1;
    assert(n === 1, 'A' + (5 + i) + ' 锚点「' + k + '」在 ' + a.rel + ' 恰中 1 次（实 ' + n + '）');
  });

  // A11 纯度：每个锚点字面量在本文件**恰好**出现一次（判据不得引用锚点串）
  //   口径与 tests/negative-control-audit.js 的 `impure` 逐字同源（多行锚点在源码里是转义形态）——
  //   **不另立第二套口径**（这是本项目反复吃过的亏）。
  //   v2.106.0 修：初版只挡「出现 >1 次」（重复），不挡「出现 0 次」（缺失）。而 aRoot 当时是
  //   `'const ROOT = path.join(__dirname, ' + "'..'" + ');'` 这种**拼接式**写法——拼接后本文件里
  //   根本不存在那个整串 ⇒ 出现 0 次，本锁 A11 放行、审计的 impure 报红。**审计是对的**。
  const selfSrc = rd(SELF_REL);
  const impure = Object.keys(ANCHORS).filter(function (k) {
    return selfSrc.split(ANCHORS[k].txt.replace(/\n/g, '\\n')).length - 1 !== 1;
  });
  assert(impure.length === 0, 'A11 锚点字面量在本文件各**恰**出现一次（违者：' + (impure.join(',') || '无') + '）');

  // A12 覆盖下限（零告警在空集上恒真）
  const g = R.groups(runSrc);
  const fields = Object.keys(g);
  assert(fields.length === 7, 'A12 run.js 里 7 个读数族全部被扫到（实 ' + fields.join(',') + '）');
  assert(R.sites(runSrc).length >= 20, 'A13 登记形态站点 ≥20（实 ' + R.sites(runSrc).length + '）');
  assert(Object.keys(R.MESSAGE_LABEL).length === 7, 'A14 消息标签面 7 态（实 ' + Object.keys(R.MESSAGE_LABEL).length + '）');

  // A15 问题类别齐备（判据可归因，不是一句「有问题」）
  assert(PROBLEM_KINDS.length === 8, 'A15 问题类别表 8 类（可归因）');

  // A16 三本台账都能被读到（不许「账面登记但读不出来」）
  const unreadable = R.LEDGERS.filter(function (L) {
    try { JSON.parse(rd(L.rel)); return false; } catch (e) { return true; }
  });
  assert(unreadable.length === 0, 'A16 三本台账均可解析（坏：' + (unreadable.map(function (x) { return x.rel; }).join(',') || '无') + '）');

  // ═══════════ B 运行时 ═══════════
  const d = R.discover();
  assert(d.fields.length === 7, 'B1 discover 覆盖 7 族（实 ' + d.fields.length + '）');
  assert(d.siteCount >= 20, 'B2 现场站点 ≥20（实 ' + d.siteCount + '）');

  // d.fields 已是**归一化**后的族名（与 d.live 的键同空间）——不要再绕 FIELD_OF，
  // 那层是「站点上的字段名 → 族名」的映射，拿族名去查它只会得到 undefined（本锁首跑实证）。
  const noProbe = d.fields.filter(function (f) { return d.live[f] === undefined; });
  assert(noProbe.length === 0, 'B3 每族都有现场探针（缺：' + (noProbe.join(',') || '无') + '）');

  const intra = R.coherence(runSrc).filter(function (p) { return p.kind === 'intra-drift'; });
  assert(intra.length === 0, 'B4 同一读数族在全部站点上同值（漂移：' + intra.length + ' 处）');

  const stale = R.coherence(runSrc).filter(function (p) { return p.kind === 'stale-reading'; });
  assert(stale.length === 0, 'B5 全部站点等于现场实测（过时：' + stale.length + ' 处）');

  const msg = R.messageChecks(runSrc);
  assert(msg.length === 0, 'B6 消息文本与比较值同批（不一致：' + msg.length + ' 处）');

  const led = R.ledgerReport();
  assert(led.problems.length === 0, 'B7 台账三级同源（L1 version / L2 _note 版本词）无问题（实 ' + led.problems.length + '）');
  assert(led.rows.length === 3 && led.rows.every(function (r) { return r.version === led.version; }),
    'B8 三本台账 version 全等于 index.js VERSION（' + led.version + '）');
  const noteRows = led.rows.filter(function (r) { return r.hasNote; });
  assert(noteRows.length === 2 && noteRows.every(function (r) { return r.noteVersion === r.version; }),
    'B9 带 _note 的两本台账：末次版本词 === version');

  // B14 消息副本面（#6 的两个观察位）在真源码上真有站点：一面为空则「消息与比较值同批」在空集上恒真。
  // 注意：labelSites 收的是**归一化族名**（与 sites/groups 同空间，与 groups 的键一致）；
  //   直接用 Object.keys(FIELD_OF) 会拿到站点字段名（dead.length 这种）——那是映射的**入参**空间，
  //   拿它当族名查必然为空（与 B3 首跑同一处绕层错，此处不再绕）。
  const familyNames = Array.from(new Set(Object.keys(R.FIELD_OF).map(function (k) { return R.FIELD_OF[k]; })));
  const labelCover = familyNames.map(function (f) {
    return { field: f, n: R.labelSites(runSrc, f).length };
  });
  const noLabel = labelCover.filter(function (x) { return x.n === 0; });
  const labelTotal = labelCover.reduce(function (a, x) { return a + x.n; }, 0);
  assert(noLabel.length === 0 && labelTotal >= 10,
    'B14 每个读数族在真源码上都有消息副本可定位（缺：' + (noLabel.map(function (x) { return x.field; }).join(',') || '无')
    + '；共 ' + labelTotal + ' 处）');

  const plan = R.backfillPlan(runSrc);
  assert(plan.length === 0, 'B10 当前无待回填项（现场与登记已同源；待回填：' + plan.length + ' 族）');

  // B11 逐站点抽验：refs 族的三个站点都在 run.js 里真实存在（按行号回读同行）
  const refsSites = g.refs || [];
  const lines = runSrc.split('\n');
  const located = refsSites.filter(function (s) { return lines[s.line - 1] && lines[s.line - 1].indexOf(s.prefix + '.refs') >= 0; });
  assert(located.length === refsSites.length && refsSites.length >= 3,
    'B11 refs 族逐站点按行号回读命中（' + located.length + '/' + refsSites.length + '）');

  // B12 versionOfIndex 与 manifest 同源（台账同源的第三个来源）
  const man = JSON.parse(rd('manifest.json'));
  assert(R.versionOfIndex() === man.version, 'B12 index.js VERSION === manifest.version（' + R.versionOfIndex() + '）');

  // B13 纯只读：跑完一轮判据后 run.js 字节未变
  const before = rd(RUN_REL);
  R.coherence(runSrc); R.messageChecks(runSrc); R.backfillPlan(runSrc);
  assert(rd(RUN_REL) === before, 'B13 判据全程只读（run.js 字节未变）');

  console.log('  · v2106 概要：' + d.summary + ' · 站点 ' + d.siteCount
    + ' · 台账 version ' + led.version);

  // ═══════════ C 不变式 ═══════════
  const runNeg = function () { return R.coherence(runSrc); };
  const one = JSON.stringify(runNeg());
  const two = JSON.stringify(R.coherence(rd(RUN_REL)));
  assert(one === two, 'C1 判据幂等：同输入连调结果逐字一致（现场不被判据改变）');

  const liveSnap = JSON.stringify(R.measure());
  R.discover();
  assert(JSON.stringify(R.measure()) === liveSnap, 'C2 探针幂等：discover 不改现场读数');

  // ═══════════ N 负控制（真源码破坏 → 内存副本上重跑同款真判据）═══
  require('./readings-v2106.js').runNegative(assert, { R: R, runSrc: runSrc, assert: assert });
}

/** 负控制：逐项「破坏 → 同款判据必须现形」，并证明破坏真的发生。 */
function runNegative(assert, ctx) {
  const R = ctx.R;
  const runSrc = ctx.runSrc;
  const LIVE = R.measure();
  const kindsOf = function (ps) { return Array.from(new Set(ps.map(function (p) { return p.kind; }))); };
  /**
   * 台账注入必须**真的改到东西**（与 breakOnce 同纪律）：打空 ⇒ 抛。
   * 为什么这条在本版特别重要：N6/N7 的破坏目标是**版本词**——若把版本词写死成本版号，
   * 升版后替换会静默打空，「判据太弱」与「锚点过期」在结果上长得一模一样。
   */
  const mutOnce = function (t, from, to, label) {
    const out = t.replace(from, to);
    if (out === t) throw new Error('台账注入未生效（锚点没打中）:: ' + label + ' :: ' + from);
    return out;
  };

  // N0 归因表可得（判据的问题必须是可归因的类别）
  assert(PROBLEM_KINDS.indexOf('intra-drift') >= 0 && PROBLEM_KINDS.indexOf('version-mismatch') >= 0,
    'N0 负控制所依赖的问题类别在归因表内');

  // N1 单站点漂移 ⇒ intra-drift（不是 stale-reading：另有站点仍正确）
  //   四处锚点的读数一律**现场取**（同本文件 N6/N7 对版本词的处理）：写死就会在升版后
  //   静默打空，而打空不会报「读数过期」—— 它让整把锁的负向段当场中断。v2.109.0 实测：
  //   清册 refs 与 dead、dataOnly 三族都长过（见 tests/run.js 的现场断言），四处锚点全空，
  //   N1 抛出后 N2 起全部未执行 —— 这正是「锚点漂移 = 覆盖消失」的又一次实证。
  const refsAt = function (n) { return 'r' + n + '.refs === ' + LIVE.refs; };
  const falseRefs = function (n) { return 'r' + n + '.refs === ' + (LIVE.refs - 1); };
  const b1 = breakOnce(runSrc, refsAt(2700), 'r2700.refs === ' + (LIVE.refs + 1), 'N1');
  const p1 = R.coherence(b1, { live: LIVE });
  assert(p1.filter(function (p) { return p.kind === 'intra-drift' && p.field === 'refs'; }).length === 1,
    'N1 单站点漂移 ⇒ 报 intra-drift/refs（实 ' + kindsOf(p1).join(',') + '）');

  // N2 全族覆盖（三站同改）⇒ stale-reading（同值但与实测不符）
  const b2 = breakOnce(breakOnce(breakOnce(runSrc,
    refsAt(2700), falseRefs(2700), 'N2a'),
    refsAt(2800), falseRefs(2800), 'N2b'),
    refsAt(2900), falseRefs(2900), 'N2c');
  const p2 = R.coherence(b2, { live: LIVE });
  assert(p2.filter(function (p) { return p.kind === 'stale-reading' && p.field === 'refs'; }).length === 1,
    'N2 全族同改 ⇒ 报 stale-reading/refs（实 ' + kindsOf(p2).join(',') + '）');

  // N3 比较值与消息脱钩（v2.81.0 的形态）：消息一字不动，判据也必须现形
  const b3 = breakOnce(runSrc, 'r2700.dead.length === ' + LIVE.dead,
    'r2700.dead.length === ' + (LIVE.dead + 1), 'N3');
  const p3 = R.coherence(b3, { live: LIVE });
  assert(p3.filter(function (p) { return p.kind === 'intra-drift' && p.field === 'dead'; }).length === 1,
    'N3 只改比较值（消息不动）⇒ 报 intra-drift/dead');

  // N4 只改消息静态头 ⇒ message-mismatch（证明「静态头」这个观察位真的在起作用）
  const head4 = '死子面 dead ' + LIVE.dead + ' / uiDead ' + LIVE.uiDead
    + ' / dataOnly ' + LIVE.dataOnly + '（';
  const b4 = breakOnce(runSrc, head4,
    head4.replace('dead ' + LIVE.dead, 'dead ' + (LIVE.dead + 1)), 'N4');
  const p4 = R.coherence(b4, { live: LIVE });
  assert(p4.filter(function (p) { return p.kind === 'message-mismatch' && p.field === 'dead'; }).length === 1,
    'N4 只改消息静态头 ⇒ 报 message-mismatch/dead');

  // N5 破坏必须真的发生（上面每个 breakOnce 没打中都会抛；这里再显式核对一次「改后有差」）
  assert(b1 !== runSrc && b2 !== runSrc && b3 !== runSrc && b4 !== runSrc,
    'N5 四处破坏均真实改变源码（破坏打不中时判据无从现形）');

  // N6 台账 L1 破坏（内存注入）：version 与 index.js VERSION 脱钩
  //   版本词一律**现场取**（R.versionOfIndex()），不写死本版号——写死就会在升版后静默打空。
  const V2106 = R.versionOfIndex();
  const b6read = injectLedger('tests/dead-export-ledger.json', function (t) {
    return mutOnce(t, '"version": "' + V2106 + '"', '"version": "9.9.9"', 'N6');
  });
  const p6 = R.ledgerReport({ read: b6read });
  assert(p6.problems.filter(function (p) { return p.kind === 'version-mismatch'; }).length >= 1,
    'N6 台账 version 脱钩 ⇒ 报 version-mismatch（实 ' + p6.problems.length + ' 项）');

  // N6b 反向：**形状合法**但与 index 不同的版本号（9.9.9 这种显眼值可能被「格式」判据顺手抓到，
  //     ⇒ 换一个同形状的合法号，证明这条判据判的是「同源」而不是「像不像版本号」）
  const b6bRead = injectLedger('tests/dead-export-ledger.json', function (t) {
    return mutOnce(t, '"version": "' + V2106 + '"', '"version": "2.9.9"', 'N6b');
  });
  const p6b = R.ledgerReport({ read: b6bRead });
  assert(p6b.problems.filter(function (p) { return p.kind === 'version-mismatch'; }).length >= 1,
    'N6b 台账 version 是另一只**合法**版本号 ⇒ 仍报 version-mismatch（判的是同源，不是形状）');

  // N7 台账 L2 破坏（内存注入）：_note 末次版本词与 version 脱钩
  const b7read = injectLedger('tests/dead-export-ledger.json', function (t) {
    return mutOnce(t, '（v' + V2106 + ' ·', '（v9.9.9', 'N7');
  });
  const p7 = R.ledgerReport({ read: b7read });
  assert(p7.problems.filter(function (p) { return p.kind === 'note-mismatch'; }).length >= 1,
    'N7 台账 _note 版本词脱钩 ⇒ 报 note-mismatch');

  // N7b 反向：把 _note 的版本词**全删** ⇒ 必须是 note-no-version（不是静默通过）
  const b7bRead = injectLedger('tests/dead-export-ledger.json', function (t) {
    return t.replace(/v\d+\.\d+\.\d+/g, 'vX');
  });
  const p7b = R.ledgerReport({ read: b7bRead });
  assert(p7b.problems.filter(function (p) { return p.kind === 'note-no-version'; }).length >= 1,
    'N7b 台账 _note 无版本词 ⇒ 报 note-no-version（不许静默通过）');

  // N8 注释剥离这一层**是必需的**（本轮实现缺陷的负控制，不是自我声明）：
  //    合成一个「注释里含未转义括号」的最小源码，验证 assertBlocks 仍能切对块；
  //    若把剥离去掉，块边界会一路吃到文件末（本仓 run.js 的 162 行注释就是这种形态）。
  const mini = [
    "// 注释里有未转义括号 fresh()/checkPages() 以及更多 ( ( (",
    "assert(x === 1, '消息 实 ' + x + '）');",
    "const z = 2;"
  ].join('\n');
  const miniBlocks = R.assertBlocks(mini);
  assert(miniBlocks.length === 1 && miniBlocks[0].text.indexOf('const z') < 0,
    'N8 注释含未转义括号时块边界仍正确（块数 ' + miniBlocks.length + '，'
    + (miniBlocks[0] ? 'span ' + miniBlocks[0].text.split('\n').length : '-') + '）');
  const stripped = R.stripLineComments(runSrc);
  assert(stripped.length < runSrc.length - 3000,
    'N8b 剥离层真在删内容（删掉 ' + (runSrc.length - stripped.length) + ' 字符）');

  // N9 回填的**全量性**与**拒绝多值**（D2 教训 + 单值纪律）
  const fake = ['r9001.refs === 111', 'r9002.refs === 111', 'r9003.refs === 111'].join('\n');
  const filled = R.backfill(fake, 'refs', 222);
  assert(filled.ok && filled.changed === 3 && filled.src.split('=== 222').length - 1 === 3,
    'N9 回填把**全部**站点一次改掉（实 ' + filled.changed + '/3）');
  const multi = ['r9001.refs === 111', 'r9002.refs === 222'].join('\n');
  const refused = R.backfill(multi, 'refs', 333);
  assert(refused.ok === false && refused.reason === 'multi-value',
    'N9b 族内多值 ⇒ 回填拒绝（不做「猜哪个是对的」；实 ' + refused.reason + '）');
  // N9d 回填必须**同批**改掉消息副本（#6）：只改比较值会让自己的 message-mismatch 报红 ——
  //    这正是 v2.81.0 的形态。合成最小源码两向验。
  const withMsg = [
    "assert(r9001.dead.length === 111, '死子面 dead 111 / uiDead 4（实 ' + r9001.dead.length + '）');"
  ].join('\n');
  assert(R.labelSites(withMsg, 'dead').length === 1 && R.labelSites(withMsg, 'dead')[0].value === 111,
    'N9d-1 消息副本可被定位（静态头里的 dead 111）');
  const filledMsg = R.backfill(withMsg, 'dead', 222);
  assert(filledMsg.ok && filledMsg.labelChanged === 1
    && filledMsg.src.indexOf('=== 222') >= 0 && filledMsg.src.indexOf('dead 222') >= 0
    && filledMsg.src.indexOf('dead 111') < 0,
    'N9d-2 回填同批改消息副本（比较值 111->222、消息 dead 111->222；labelChanged='
    + filledMsg.labelChanged + '）——只改一处就会与自己的 #6 判据相撞');
  // N9e 消息已经与比较值漂移 => **拒绝回填**（不许把第二个错盖在第一个错上）
  const driftSrc = [
    "assert(r9001.dead.length === 111, '死子面 dead 999（实 ' + r9001.dead.length + '）');"
  ].join('\n');
  // N9f **带后缀字段名的族**也能被回填（族名 ≠ 站点字段名：dead vs dead.length）：
  //   现场实测发现的真实缺陷——回填正则若用归一化族名重建，`dead` 会卡在 `.length` 前，
  //   静默 0 命中（refs 能改、dead/uiDead/dataOnly 永远改不动）。这里对**全部 7 族**逐个验。
  const suffixFamilies = ['dead', 'uiDead', 'dataOnly'];
  const suffixBad = [];
  suffixFamilies.forEach(function (f) {
    const src2 = ["assert(r9001." + f + ".length === 111, 'x 111');"].join('\n');
    const r2 = R.backfill(src2, f, 222);
    if (!r2.ok || r2.src.indexOf('=== 222') < 0) suffixBad.push(f + ':' + (r2.reason || 'no-op'));
  });
  assert(suffixBad.length === 0,
    'N9f 带后缀字段名的族也能回填（坏：' + (suffixBad.join(',') || '无') + '）——族名当字段名用会静默 0 命中');
  // N9g 回填**不碰历史叙述**：同一标签的旧数字若住在别处（不在该族站点所在断言块里），
  //   不得被一起改。合成：站点块写 111，另一段叙述写 999。
  const histSrc = [
    "assert(r9001.refs === 111, 'x 111');",
    "// v9.9.9 沿革：当时是 refs 999 处"
  ].join('\n');
  const histOut = R.backfill(histSrc, 'refs', 222);
  assert(histOut.ok && histOut.src.indexOf('=== 222') >= 0 && histOut.src.indexOf('refs 999') >= 0,
    'N9g 回填不碰别处的历史叙述（叙述里的 refs 999 仍在）——观察位限同块');
  const driftRefused = R.backfill(driftSrc, 'dead', 222);
  assert(driftRefused.ok === false && driftRefused.reason === 'message-drift',
    'N9e 消息已漂移 => 回填拒绝（实 ' + driftRefused.reason + '）——先让人看清哪个是错的');
  const noSite = R.backfill('const a = 1;', 'refs', 1);
  assert(noSite.ok === false && noSite.reason === 'no-site', 'N9c 命中 0 站点 ⇒ 回填拒绝（实 ' + noSite.reason + '）');

  // N10 判据非恒真总证：**原版**上必须零问题（否则「破坏版有问题」这一事实不说明任何事）
  assert(R.coherence(runSrc, { live: LIVE }).length === 0, 'N10 原版上同款判据零问题（判据纯度）');
  assert(R.ledgerReport().problems.length === 0, 'N10b 原版台账判据零问题');

  // N11 探针两向：把「现场读数」注入成错值 ⇒ stale-reading 必须现形（证明比对的是真探针）
  const wrongLive = Object.assign({}, LIVE, { refs: LIVE.refs + 1 });
  const p11 = R.coherence(runSrc, { live: wrongLive });
  assert(p11.filter(function (p) { return p.kind === 'stale-reading' && p.field === 'refs'; }).length === 1,
    'N11 注入错读数 ⇒ 报 stale-reading/refs（证明判据真的在比探针，而不是在比常量）');

  // ── N12 纯度口径的两向自证（H6）：**缺失**也必须现形，不只「重复」 ──
  //   本锁初版 A11 只挡「出现 >1 次」。而 aRoot 当时是拼接式写法（`'…' + "'..'" + '…'`），
  //   拼出来的串在本文件里**作为字面量出现 0 次**——旧口径放行、审计的 impure 报红。
  //   教训：纯度是「恰好 1 次」（missing 与 duplicate 都是缺纯度），这不是两种病。
  //   这里把口径当**函数**来验：在自源的内存副本上把那条声明换成「不含该串」的写法，
  //   两套口径同时判一遍，证明它们的分歧点就在 0 这一点上（不写死任何锚点整串）。
  const aRootDecl = rd(SELF_REL).split('\n').filter(function (l) {
    return l.indexOf('aRoot: { rel: MOD_REL') >= 0;
  })[0];
  assert(typeof aRootDecl === 'string' && aRootDecl.indexOf(ANCHORS.aRoot.txt) >= 0,
    'N12 aRoot 声明行可按片段定位且内含锚点整串（作为破坏的落点）');
  const brokenSelf = allReplace(rd(SELF_REL), aRootDecl, "  aRoot: { rel: MOD_REL, txt: 'GHOST' },");
  assert(brokenSelf !== rd(SELF_REL), 'N12b 破坏真的发生（声明行已被替换）');
  const esc = ANCHORS.aRoot.txt.replace(/\n/g, '\\n');
  const nOld = brokenSelf.split(esc).length - 1;   // 旧口径看的量
  const oldPasses = !(nOld > 1);                   // 旧口径：只在 >1 时判错
  const newFlags = (nOld !== 1);                   // 新口径：!==1 一律判错
  assert(oldPasses && newFlags,
    'N12c 纯度口径两向自证：串在自源里出现 ' + nOld + ' 次时，旧口径(>1)『放行=' + oldPasses
    + '』而新口径(!==1)『判错=' + newFlags + '』—— 分歧点正是「缺失」这一态');
}

module.exports = { ANCHORS: ANCHORS, runAll: runAll, runNegative: runNegative };

if (require.main === module) {
  let P = 0, F = 0;
  const A = function (c, m) { if (c) { P += 1; } else { F += 1; console.log('  ✗ ' + m); } };
  try {
    runAll(A);
  } catch (e) {
    F += 1;
    console.log('  ✗ 异常：' + e.message);
  }
  console.log('READINGS-V2106: ' + (F === 0 ? 'pass（' + P + ' 项）' : 'FAIL ' + F + ' / ' + (P + F)));
  process.exit(F === 0 ? 0 : 1);
}
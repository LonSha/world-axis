'use strict';
/**
 * tests/stitch-ledger-truthfulness-v2552.js — 缝合件台账「读数真实性」专锁（v2.552.0）
 *
 * 治的缺口（写在最前面，因为它是本文件存在的唯一理由）：
 *
 *   `ui/settings.js` 的「缝合件台账」行有五台读数，v2.533.0 的头注释写的是
 *   「**本行就是接线点**：面板如实显示它们各自算出来的数」，并据此让
 *   副本族 / 上下文边界 / 写前预演 三台按纪律④**注销出表**（零读账本里不再登记它们）。
 *
 *   本批实测那句话不成立。这行是**读数面**，不是**消费面**：
 *     ① 两台传**常量空参数**：`ctxBoundary.stat([])` / `arcGuide.stat([])`
 *        —— 读数恒 0（空数组算出来的数，不是现场）；
 *     ② 后两台读的是真计数器（`writeRehearsal.stat()` / `saveAudit.stat()`），
 *        但 `rehearse()` / `audit()` 的**产品调用点为 0** ⇒ 计数器恒初值；
 *     ③ 四台的核心函数（plan / scrub / rehearse / audit）产品调用点**全是 0**。
 *
 *   于是「0 条 / 0 通过 / 0 次」在面板上读起来都像「一切正常」，实际含义是
 *   「这条链没人喂」。而更坏的一层是：这些 ns 在 module-cycle-gate 里被计成
 *   「有调用期引用」⇒ 连零读清单都进不去 ⇒ **任何账本都不必提它们**。
 *   靠「引用」续命比靠改 evidence 文字续命更彻底 —— 后者至少还要动一次账本。
 *
 * 本锁钉住四件事：
 *   A 假读数已消失：`ui/settings.js` 里不再有 `stat([])`；四台读数改成直说
 *     （「无数据源」×2 / 「从未调用」×2）。
 *   B 四台核心调用点的**可复算计数**（0 / 0 / 0 / 0），并钉住计数口径
 *     （排除注释、排除自身文件）—— 判据要能被后来者按同一口径复算。
 *   C 判据边界（这一条是本批最要紧的）：`module-cycle-gate` 的 deadNs
 *     **含** arcGuide / ctxBoundary、**不含** writeRehearsal / saveAudit ——
 *     证明「ns 级零读判据」对「stat 被读但核心零调用」这一类无感。
 *     账本侧同一口径（前两条已登记、后两条不登记）。
 *   D 读数为什么该被判定成不实的**现场证据**：DEFAULTS 里没有规则、
 *     arcs 没有产品级提供者、运行时 `stat([])` 确实是 0。
 *   N 真源码破坏：把一处改回 `stat([])` ⇒ A 必须红；try/finally 逐字节还原 + sha256。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const BASE = path.join(__dirname, '..');
const SET_REL = 'ui/settings.js';
const SRC_DIRS = ['engines', 'core', 'render', 'ui', 'actors', 'direction'];

let pass = 0, fail = 0;
const fails = [];
function ok(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; fails.push(name + ' :: ' + e.message); console.log('  ✗ ' + name + ' :: ' + e.message); }
}
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function sha(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
/**
 * 去掉注释（本仓锁的既有口径：注释里的提及不是调用）。
 *
 * v2.552.0 补：原版只切 `//`，于是 **JSDoc 块注释行**（`*` 开头）被当成了代码。
 *   本批 B1 就是这么红的：`engines/arc-phase.js` 的文档里写着「② **不接 `arcGuide.plan()`**」——
 *   那是「明确声明不接」，却被数成「已经有调用点」。错的是计数口径（读到了注释），不是现场。
 *   这类假红比漏红更危险：它逼人放宽判据，而放宽后真正该红的又不红了。
 */
function stripComment(line) {
  const t = line.trim();
  // 块注释的三种行形态：开（`/*`）、续（`*`）、闭（`*/`）——整行都不是代码。
  if (t.indexOf('/*') === 0 || t.indexOf('*') === 0) return '';
  const i = line.indexOf('//');
  return i < 0 ? line : line.slice(0, i);
}
/** 全仓产品源码（按 SRC_DIRS + index.js），返回 [{rel, text}]。 */
function productFiles() {
  const out = [];
  SRC_DIRS.forEach(function (d) {
    const abs = path.join(BASE, d);
    if (!fs.existsSync(abs)) return;
    fs.readdirSync(abs).forEach(function (f) {
      if (!/\.js$/.test(f)) return;
      out.push({ rel: d + '/' + f, text: fs.readFileSync(path.join(abs, f), 'utf8') });
    });
  });
  const idx = path.join(BASE, 'index.js');
  if (fs.existsSync(idx)) out.push({ rel: 'index.js', text: fs.readFileSync(idx, 'utf8') });
  return out;
}
/**
 * 数一个「ns.method」在产品源面（去掉注释）的调用点。
 *   exclude: 提供它的那个文件（自身实现不算消费方）。
 */
function countCalls(expr, excludeRel) {
  const files = productFiles();
  const hits = [];
  files.forEach(function (f) {
    if (f.rel === excludeRel) return;
    f.text.split('\n').forEach(function (l, i) {
      const code = stripComment(l);
      if (code.indexOf(expr) < 0) return;
      hits.push({ rel: f.rel, line: i + 1, text: code.trim() });
    });
  });
  return hits;
}

// ── A 假读数已消失 ────────────────────────────────────────────
const SET = rd(SET_REL);

ok('A1 ui/settings.js 里不再有 stat([])（传常量空数组的读法）', function () {
  const bad = [];
  SET.split('\n').forEach(function (l, i) {
    const code = stripComment(l);
    if (/\.stat\(\s*\[\s*\]\s*\)/.test(code)) bad.push({ line: i + 1, text: code.trim() });
  });
  assert.deepStrictEqual(bad, [],
    '还有「传常量空数组」的 stat 读数（读数恒 0，却看起来像现场）: ' + JSON.stringify(bad));
});

ok('A2 两台的 stat 在 settings.js 里零引用（它们因此如实回到零读面）', function () {
  ['WA.arcGuide.stat', 'WA.ctxBoundary.stat'].forEach(function (e) {
    const hit = SET.split('\n').filter(function (l) { return stripComment(l).indexOf(e) >= 0; });
    assert.deepStrictEqual(hit, [], '仍引用 ' + e + '（会让本 ns 永远进不了零读清单）');
  });
});

/** 取出某一格读数的正文（从 `one(...)` 到该格的 `})` 收口）。找不到返回 null。 */
function cellOf(text, rel, ns) {
  const key = "one('" + rel + "', '" + ns + "'";
  const i = text.indexOf(key);
  if (i < 0) return null;
  // 收口锚点是 `\n          })`，**不带逗号**：数组最后一个元素（本文件里就是 saveAudit）没有尾逗号。
  //   第一版写死了 `}),`，于是 saveAudit 那格永远取不到 —— 判据报「找不到这一格」，
  //   看起来像现场被改了，其实是判据自己漏了一种正当写法。
  const tail = text.indexOf('\n          })', i);
  if (tail < 0) return null;
  return text.slice(i, tail);
}
/**
 * A3 的判据本体（抽成函数是为了让 N3 对**同一条**判据做负控，而不是另写一份近似物）。
 *
 * 口径难点：v2.552.0 这里数的是三元式 `? '从未调用'` —— 数的是**写法**，不是**事实**。
 *   v2.553.0 的 saveAudit 那格因为要分「引擎缺席 / 体检出错 / N 项问题」三种情形，
 *   三元式写不下，改成 `if (s.calls === 0) return '从未调用';` —— 语义一字未变，判据却报红。
 *   这是本仓反复踩的那一类错：判据一旦钉在形式上，现场每次正当的改写都会把它撞红，
 *   而撞红的噪声会让后来者去改判据而不是看现场。故改成按格取正文、查语义：
 *   每格必须 ① 有 `calls === 0` 守卫（不许把「没调用过」与「算出来是 0」混成一句）；
 *   ② 守卫里直说「从未调用」（不许把初值渲染成一个看起来正常的读数）。
 */
function unsafeReadoutCells(text) {
  const out = [];
  [['engines/write-rehearsal.js', 'writeRehearsal'],
    ['engines/save-audit.js', 'saveAudit']].forEach(function (p) {
    const cell = cellOf(text, p[0], p[1]);
    if (cell === null) { out.push(p[1] + ': 找不到这一格（读数面被改名/拆掉 ⇒ 判据需要随现场更新）'); return; }
    if (!/calls\s*===\s*0/.test(cell)) out.push(p[1] + ': 缺 calls === 0 守卫（「没调用过」与「算出来是 0」又混了）');
    if (cell.indexOf("'从未调用'") < 0) out.push(p[1] + ': calls === 0 时没有直说「从未调用」');
  });
  return out;
}
ok('A3 读数改成直说：「无数据源」×2 / 两格都「没调用过就直说」', function () {
  const cnt = function (s) { return SET.split(s).length - 1; };
  assert.strictEqual(cnt("return '无数据源';"), 2,
    '应有 2 处「无数据源」（ctxBoundary / arcGuide）');
  const bad = unsafeReadoutCells(SET);
  assert.deepStrictEqual(bad, [], '读数格没做到「没调用过就直说」: ' + JSON.stringify(bad));
  // 收尾断言原来写的是「全仓不许出现 `s.ok + '通过/'`」—— 写宽了：writeRehearsal 那格里它是**正当**的
  //   （calls > 0 表示真的预演过，那时「N 通过 / N 拒」就是现场）。判据一旦钉在形式而不是语义上，
  //   就会把兄弟格子的正当写法一起判死。故改为只钉 saveAudit 那格的**语义**：
  //   它报的是「问题」不是「通过/拒」，所以必须给出体检结论，且三种非正常情形不许并成一个 0。
  const cellSA = cellOf(SET, 'engines/save-audit.js', 'saveAudit') || '';
  assert.ok(cellSA.indexOf('problemCount') >= 0,
    'saveAudit 那格没有报体检结论（problemCount）—— 只报「N 次」不回答「这份存档有没有问题」');
  assert.ok(cellSA.indexOf('engine-absent') >= 0 && cellSA.indexOf('audit-error') >= 0,
    'saveAudit 那格没有把「引擎缺席 / 体检本身出错」与「0 项问题」分开（三种情形不许合并成一个看起来正常的 0）');
});

/**
 * A4 的判据本体（抽成函数是为了让 N2 对**同一条**判据做负控，而不是另写一份近似物）。
 *
 * 口径难点：纠正一段错注释时，必须把那句话**引出来**说明它错在哪；而「引出」在字面上
 *   和「仍在这样断言」长得一样。区分办法只有上下文：允许出现，但同一行必须带纠正标记
 *   （此前 / 不成立 / 错 / 改成 / 不再）。不带标记的命中一律算「仍在断言」。
 */
const CLAIM = '本行就是接线点';
const CLAIM_MARK = ['此前', '不成立', '错', '改成', '不再'];
function unsafeClaimLines(text) {
  const out = [];
  text.split('\n').forEach(function (l, i) {
    if (l.indexOf(CLAIM) < 0) return;
    const marked = CLAIM_MARK.some(function (m) { return l.indexOf(m) >= 0; });
    if (!marked) out.push((i + 1) + ': ' + l.trim());
  });
  return out;
}
ok('A4 头注释不再断言「本行就是接线点」（它允许被引用，不允许被继续当作事实）', function () {
  const bad = unsafeClaimLines(SET);
  assert.equal(bad.length, 0, '有断言式命中（该行没有纠正标记）: ' + JSON.stringify(bad));
  // 原文的断言句式是「**本行就是接线点**：面板如实显示…」——冒号后直接展开论证，最容易被照抄。
  assert.ok(!/\*\*本行就是接线点\*\*\s*[：:]/.test(SET), '仍有「**本行就是接线点**：」这种断言句式');
  assert.ok(SET.indexOf('读数面') >= 0 && SET.indexOf('消费面') >= 0,
    '应写明「读数面 ≠ 消费面」这一区分');
  // 只写「措辞改了」不够，必须连同代价一起落在注释里，否则后来者读到的是一次无因改写。
  assert.ok(SET.indexOf('零读面') >= 0, '应记下代价：两台的 stat 引用消失 ⇒ 回到零读面');
  assert.ok(/ns-consumer-ledger/.test(SET), '应指向重新登记的去处（ns-consumer-ledger）');
});

// ── B 四台核心调用点计数 ──────────────────────────────────────
const CORES = [
  { expr: 'arcGuide.plan', excl: 'engines/arc-guide.js', what: '引导弧 plan', expect: 0 },
  { expr: 'ctxBoundary.scrub', excl: 'engines/ctx-boundary.js', what: '上下文边界 scrub', expect: 0 },
  { expr: 'writeRehearsal.rehearse', excl: 'engines/write-rehearsal.js', what: '写前预演 rehearse', expect: 0 },
  // v2.553.0：`saveAudit.audit` 在 `core/store.js` 的载入点接了线，期望值 0 → 1。
  //   **这是精确值，不是放宽**：写成「至少 1」就再也发现不了它又被摘掉；
  //   多一处、少一处都必须红。表里记的是「这一刻有几处产品调用点」，不是「允许有几处」。
  { expr: 'saveAudit.audit', excl: 'engines/save-audit.js', what: '存档体检 audit', expect: 1,
    why: 'v2.553.0 接在 store.init() 的 migrate 之前（见 tests/load-audit-wire-v2553.js）' }
];
CORES.forEach(function (c, i) {
  ok('B' + (i + 1) + ' ' + c.what + ' 的产品调用点 = ' + c.expect + '（去注释、排除自身文件）', function () {
    const hits = countCalls(c.expr, c.excl);
    assert.strictEqual(hits.length, c.expect,
      c.what + ' 的产品调用点数变了 ⇒ 本条读数应更新（现场变了，不是判据放宽）: 期望 '
      + c.expect + '，实 ' + hits.length + ' ' + JSON.stringify(hits));
    if (c.expect === 0) {
      // 0 的场合顺带把「确实一处都没有」也钉住：strictEqual 已经保证，这里留显式断言是为了
      //   报错时能直接看到命中的几行，省去二次排查。
      assert.deepStrictEqual(hits, [], c.what + ' 仍有产品调用点: ' + JSON.stringify(hits));
    }
  });
});

ok('B5 计数口径自证：同一函数在自身文件里能数到（口径不是「永远数到 0」）', function () {
  const self = rd('engines/arc-guide.js');
  const inSelf = self.split('\n').filter(function (l) { return stripComment(l).indexOf('plan') >= 0; }).length;
  assert.ok(inSelf > 0, '自身文件里应能数到 plan —— 否则 B1 的 0 是口径造成的假 0');
  // 反向：随便挑一个**确实有产品调用**的表达式，计数必须 > 0
  const live = countCalls('WA.writeSerial.serial', 'engines/write-serial.js');
  assert.ok(live.length > 0,
    '对照组（writeSerial.serial，v2.551.0 刚接的三处）应 > 0 —— 否则说明整条计数链是空转');
});

// ── C 判据边界（本批最要紧的一条）─────────────────────────────
const LEDGER = JSON.parse(rd('tests/ns-consumer-ledger.json'));

ok('C1 账本口径（v2.613.0 跟位）：ctxBoundary 在册 readonly-api；arcGuide 已毕业，账本里不该有它', function () {
  // v2.613.0（R288）跟位：本条立起时钉的是「arcGuide / ctxBoundary 两条都在册」。
  //   现场已经分成两半：ctxBoundary 仍零读（本仓注入不写 chat 正文，无可剥对象 ⇒ readonly-api）；
  //   arcGuide 在 v2.591.0（R266）被 arc-guide-bridge 读活，按纪律④**销行出表**。
  //   这正是本锁 D2 当初写下的「改判触发器」：真出现产品级调用方，arcGuide 就不再是零读。
  //   所以不是把条目塞回账本，而是把判据改成毕业后的真形态。
  assert.ok(LEDGER.entries['ctxBoundary'], '账本缺 ctxBoundary 条');
  assert.strictEqual(LEDGER.entries['ctxBoundary'].cls, 'readonly-api',
    'ctxBoundary 的定性应是 readonly-api（实 ' + LEDGER.entries['ctxBoundary'].cls + '）');
  assert.ok(String(LEDGER.entries['ctxBoundary'].evidence || '').length > 80,
    'ctxBoundary 的 evidence 太短（要写清「谁会在什么时候读它」）');
  assert.ok(!LEDGER.entries['arcGuide'],
    'arcGuide 回到零读账本了 —— 它在 v2.591.0 已有产品读者（arc-guide-bridge），回来就是过期登记');
  const bridge = rd('engines/arc-guide-bridge.js');
  assert.ok(bridge.indexOf('WA.arcGuide') >= 0,
    'arc-guide-bridge.js 里读不到 WA.arcGuide —— 那 arcGuide 出表就没依据了（本条判据需重判）');
});

ok('C2 判据边界的正面证据：writeRehearsal 仍零调用、saveAudit 已毕业，两台都不在账本里', function () {
  // 这一条不是在夸账本，是在钉住判据的边界：ns 级零读判据对
  //   「stat 被读、核心零调用」这一类**无感**。所以它们既不在零读清单里，
  //   也不在账本里 —— 两个读数都看不见它们。本锁是唯一提这件事的地方。
  //
  // v2.553.0 之后这一条分成两半，因为现场分成两半：
  //   ① writeRehearsal 仍是「stat 被读、核心零调用」⇒ 原来的判据原样保留；
  //   ② saveAudit 已经毕业（store 载入点接上 1 处调用）—— 但接线**不蕴含**「账本该登记它」：
  //      账本登记的是**零读 ns**，而 saveAudit 的 stat 一直有 ui/settings.js 那行读面，
  //      它本来就不该进账本。把「有调用点」与「在零读账本里」钉成互不蕴含，是这一条的新职责。
  assert.ok(!LEDGER.entries['writeRehearsal'],
    'writeRehearsal 出现在零读账本里了 —— 那说明 stat 的引用被去掉了（现场变了，本条判据需要更新）');
  assert.ok(!LEDGER.entries['saveAudit'],
    'saveAudit 出现在零读账本里了 —— 它的 stat 有读面，登记进去是记账错误');
  const r1 = countCalls('writeRehearsal.rehearse', 'engines/write-rehearsal.js');
  assert.strictEqual(r1.length, 0,
    'writeRehearsal 仍应零调用（否则「账本看不见它」这件事就不再是问题）: ' + JSON.stringify(r1));
  const r2 = countCalls('saveAudit.audit', 'engines/save-audit.js');
  assert.strictEqual(r2.length, 1,
    'saveAudit.audit 应恰有 1 处产品调用（v2.553.0 的 store 载入点）: ' + JSON.stringify(r2));
});

ok('C3 deadNs 与账本双向一致（arcGuide / ctxBoundary 在，另两台不在）', function () {
  // 用门禁自身的 audit 取现场读数，不另建第二份真源
  const out = cp.execFileSync(process.execPath,
    ['-e', [
      "const g=require('" + path.join(BASE, 'tests/module-cycle-gate.js').replace(/\\/g, '/') + "');",
      'const r=g.audit({});',
      'const names=(r.deadNs||[]).map(d=>typeof d==="string"?d:(d.ns||d.name));',
      'console.log(JSON.stringify(names));'
    ].join('')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const line = out.trim().split('\n').filter(function (l) { return l.trim().charAt(0) === '['; }).pop();
  const names = JSON.parse(line);
  // v2.613.0：arcGuide 已毕业（v2.591.0 的 arc-guide-bridge 读活了它）⇒ deadNs 不该再含它。
  //   原来这条断言写的是「应含」，方向反了也不报警 —— 因为它是 `ok(...)` 里的一个 assert，
  //   现场一变就只是红一条，而不是崩；现在改成两向都钉：ctxBoundary 必须在，arcGuide 必须不在。
  assert.ok(names.indexOf('arcGuide') < 0,
    'deadNs 仍含 arcGuide —— 但它已有产品读者（arc-guide-bridge），说明门禁的口径又落后了');
  assert.ok(names.indexOf('ctxBoundary') >= 0, 'deadNs 应含 ctxBoundary');
  assert.ok(names.indexOf('writeRehearsal') < 0, 'deadNs 不该含 writeRehearsal（stat 仍在引用面）');
  assert.ok(names.indexOf('saveAudit') < 0, 'deadNs 不该含 saveAudit');
  assert.ok(names.indexOf('writeSerial') < 0, 'deadNs 不该含 writeSerial（v2.551.0 已真接）');
});

// ── D 为什么该判定成「读数不实」的现场证据 ────────────────────
ok('D1 ctxBoundary.DEFAULTS 里只有 maxMarkLen、没有任何规则', function () {
  const src = rd('engines/ctx-boundary.js');
  assert.ok(/const DEFAULTS = \{ maxMarkLen: MAX_MARK_LEN \};/.test(src),
    'DEFAULTS 形态变了 —— 若它开始带默认规则，ctxBoundary 就有了「不接也能剥」的能力，本条判据需更新');
  assert.ok(src.indexOf('DEFAULTS') >= 0, 'DEFAULTS 不在');
});

ok('D2 arcGuide 的 arcs 现在**有**产品级提供者（v2.591.0 起），arc-phase 仍明写不接它自己那条路', function () {
  // 本条立起时钉的是「arc-phase.js 里写着『全仓没有产品级调用方』」—— 那句话在 v2.591.0 之后
  //   就成了不成立的话。本批把 arc-phase.js 的注释按现场改过（它仍不接，但理由换成了
  //   『相位判据与弧窗口不同源』），于是这里同步改成钉**新的事实**：
  //   ① 提供者在 arc-guide-bridge 里（存弧 + 调 plan）；② arc-phase 仍有「继续不接」的口径。
  const bridge = rd('engines/arc-guide-bridge.js');
  assert.ok(bridge.indexOf('WA.arcGuide') >= 0 && bridge.indexOf('arcGuideBridge') >= 0,
    'arc-guide-bridge.js 不再是 arcGuide 的产品级提供者/读者 —— 本条判据需重判');
  const src = rd('engines/arc-phase.js');
  assert.ok(src.indexOf('本文件仍然不读它') >= 0,
    'arc-phase.js 的「继续不接」口径不见了 —— 若它真接了弧窗口，这里是第二份判据，需重判');
});

ok('D3 运行时复算：传空数组时两台读数确实是 0（所以「0 条」不是现场）', function () {
  const env = require('./ui-gate-sync.js').fresh();
  const W = env.WA;
  assert.ok(W.ctxBoundary && typeof W.ctxBoundary.stat === 'function', 'ctxBoundary.stat 缺席');
  assert.ok(W.arcGuide && typeof W.arcGuide.stat === 'function', 'arcGuide.stat 缺席');
  assert.strictEqual(W.ctxBoundary.stat([]).count, 0, 'stat([]).count 应为 0（空数组）');
  assert.strictEqual(W.arcGuide.stat([]).arcs, 0, 'stat([]).arcs 应为 0（空数组）');
  // 自证：给一条合法规则后 count 会变 —— 说明它确实在读参数，而不是永远 0
  const one = W.ctxBoundary.stat(['x|<<<|>>>']);
  assert.strictEqual(one.count, 1, '给一条合法规则后 count 应为 1（证明判据不是恒 0）');
});

// ── N 真源码破坏 ──────────────────────────────────────────────
ok('N1 真改 ui/settings.js：把一处改回 stat([]) ⇒ A1 必须现形（随后逐字节还原）', function () {
  const P = path.join(BASE, SET_REL);
  const bak = fs.readFileSync(P);
  const sha0 = sha(P);
  const NEED = "return '无数据源';";
  const src0 = bak.toString('utf8');
  assert.strictEqual(src0.split(NEED).length - 1, 2,
    '破坏锚点应恰 2 次（两台），实 ' + (src0.split(NEED).length - 1));
  let red = false, restored = false;
  try {
    // 破坏：把第一处改回「读常量空数组」——这正是 v2.551.0 及之前那个形态
    fs.writeFileSync(P, src0.replace(NEED, 'return WA.ctxBoundary.stat([]).count + \'条\';'));
    const broken = rd(SET_REL);
    const bad = broken.split('\n').filter(function (l) {
      return /\.stat\(\s*\[\s*\]\s*\)/.test(stripComment(l));
    });
    if (bad.length > 0) red = true;
  } finally {
    fs.writeFileSync(P, bak);
    restored = sha(P) === sha0;
  }
  assert.ok(restored, '还原失败：ui/settings.js 的 sha256 与破坏前不一致 —— 本锁自己抛，不掩盖');
  assert.ok(red, 'N1 失效：改回 stat([]) 后 A1 的判据没现形 ⇒ 判据空转');
});

/**
 * N2 —— A4 判据的负控。
 *
 * 为什么需要它：A4 刚刚**放宽**过（从「这句话不许出现」改成「不许以断言形式出现」）。
 *   放宽判据如果不同时负控，就等于把一条会红的锁改成永远绿的锁，而且没人看得出来——
 *   本批 B1 的假红正是「判据本身错」造成的，A4 只是同一类错误的另一种形态。
 *   做法：把纠正标记从原句里摘掉，让它**字面上回到断言**，A4 的判据必须当场现形。
 */
ok('N2 真改 ui/settings.js：摘掉纠正标记 ⇒ A4 必须现形（随后逐字节还原）', function () {
  const P = path.join(BASE, SET_REL);
  const src0 = rd(SET_REL);
  const sha0 = sha(P);
  const bak = src0;
  const NEED = '这行此前被写成';   // 这句带着「此前」= 纠正标记，是唯一合法的引用形态
  assert.equal(src0.split(NEED).length - 1, 1,
    '纠正性引用应恰 1 处（改措辞后本锁要跟着改，不许静默失效），实 ' +
    (src0.split(NEED).length - 1));
  // 自证：此刻判据是绿的
  assert.equal(unsafeClaimLines(src0).length, 0, 'N2 前置：改动前 A4 判据应无命中');
  let red = false, restored = false;
  try {
    // 破坏：把这半句换回 v2.551.0 及之前那句断言的原话（剥掉纠正标记）
    fs.writeFileSync(P, src0.replace(NEED, '本行就是接线点'));
    red = unsafeClaimLines(rd(SET_REL)).length > 0;
  } finally {
    fs.writeFileSync(P, bak);
    restored = sha(P) === sha0;
  }
  assert.ok(restored, '还原失败：ui/settings.js 的 sha256 与破坏前不一致 —— 本锁自己抛，不掩盖');
  assert.ok(red, 'N2 失效：摘掉纠正标记后 A4 没现形 ⇒ 这次放宽把判据放宽成了恒真');
});
/**
 * E1 —— 同族病灶的第二个现场：账本**历史**被工具静默抹掉。
 *
 * 为什么它属于本文件（而不是另开一把锁）：本批的主题是「读数不实」。
 *   `dead-export-gate --update` 每次都按模板常量整段重建 `_note`，于是每登记一次就把
 *   历代批次说明压成同一句话 —— v2.551.0 提交时 `_note` 787 字，本批首跑 `--update`
 *   之后只剩 197 字模板原文。**账本越用越薄**，而且读它的人会以为历次登记都只是「同值」。
 *   这和「stat([]) 读出一个看起来很正常的 0」是同一件事：仪表盘给了个不反胃的数。
 *
 * 判据分两层：口径（carryNote 的行为）+ 接线（refresh 真的调它，且写盘前 fail-closed）。
 */
ok('N3 负控：把「从未调用」换回「0 通过 / 0 拒」⇒ A3 的同一条判据必须现形', function () {
  // 负控**不写盘**（纯函数喂投毒文本）：A3 的判据是 `unsafeReadoutCells(text)`，
  //   所以这里改的是喂给它的东西，测的仍是 A3 用的那一条判据，不是另写一份近似物。
  const poisoned = SET.replace(
    "if (s.calls === 0) return '从未调用';",
    "if (s.calls === 0) return (s.ok + '通过/' + s.rejected + '拒');");
  assert.notStrictEqual(poisoned, SET, '负控没改到东西（锚点失配）⇒ 这条负控本身失效');
  assert.ok(unsafeReadoutCells(poisoned).length > 0,
    '把「从未调用」换回「0 通过 / 0 拒」之后 A3 居然还通过 ⇒ 判据不认这个病灶');
  // 反向：只删守卫、保留「从未调用」，也必须现形（那会把「算出来是 0」当读数）
  const poisoned2 = SET.replace("if (s.calls === 0) return '从未调用';", "if (false) return '从未调用';");
  assert.notStrictEqual(poisoned2, SET, '第二条负控没改到东西（锚点失配）');
  assert.ok(unsafeReadoutCells(poisoned2).length > 0, '去掉 calls === 0 守卫之后 A3 居然还通过');
});

ok('E1 dead-export-gate 的 --update 不再抹掉 _note 历史（口径 + 接线 + 负控）', function () {
  const G = require(path.join(BASE, 'tests', 'dead-export-gate.js'));
  assert.equal(typeof G.carryNote, 'function', 'carryNote 应被导出（否则本锁无法对口径做行为测试）');
  const MARK = G.NOTE_TAIL_MARK;
  assert.ok(typeof MARK === 'string' && MARK.length > 10, 'NOTE_TAIL_MARK 应是明确的长句锚点');
  // 构造一次空 collect 结果：refresh 只要求各 kind 是数组。
  const empty = {};
  G.FROZEN_KINDS.forEach(function (k) { empty[k] = []; });
  G.ADVISORY_KINDS.forEach(function (k) { empty[k] = []; });
  // ① 自证：build 出来的模板 note **不含**任何历史（所以「历史能留下」只可能来自 carry）
  const tpl = G.build(empty, '9.9.9');
  assert.ok(tpl._note.indexOf(MARK) > 0, '模板 note 应自带 NOTE_TAIL_MARK');
  assert.equal(tpl._note.slice(tpl._note.indexOf(MARK) + MARK.length), '',
    '模板 note 在 MARK 之后应当是空的 —— 否则本段判据测不到 carry');
  // ② 口径：旧 note 的历史尾巴必须整段接回
  const HIST = ' v9.9.8：某次登记的历史说明，随便写点什么但它必须原样留下。';
  const next = G.refresh(empty, { _note: '任意旧模板（v9.9.8）' + MARK + HIST, dead: {}, uiDead: {} }, '9.9.9');
  assert.ok(next._note.slice(-HIST.length) === HIST, 'refresh 丢了历史尾巴：' + JSON.stringify(next._note.slice(-40)));
  assert.ok(next._note.indexOf(MARK + HIST) > 0, '历史应紧接在 MARK 之后（顺序不许乱）');
  // ③ 负控：没有 MARK 的旧 note（不认识的形态）不许假装接上，也不许抛
  const raw = G.refresh(empty, { _note: '自由格式的旧说明', dead: {}, uiDead: {} }, '9.9.9');
  assert.equal(raw._note.slice(raw._note.indexOf(MARK) + MARK.length), '',
    '旧 note 无 MARK 时不应凭空拼历史（fail-closed 的另一半：不认识就别猜）');
  // ④ 接线：refresh 里真的调了 carryNote，且写盘前有 fail-closed 断言
  const SRC = rd('tests/dead-export-gate.js');
  assert.ok(/carryNote\(next, ledger\);/.test(SRC), 'refresh 里应有 carryNote(next, ledger) 这一步');
  assert.ok(SRC.indexOf('_note 历史丢失') >= 0, '写盘前应有 fail-closed 断言（历史丢了就拒绝写盘）');
  assert.ok(/module\.exports[\s\S]{0,400}carryNote: carryNote/.test(SRC), 'carryNote 应在导出面上（本锁要能测它）');
});
// ── 收口 ─────────────────────────────────────────────────────
console.log('\n缝合件台账读数真实性专锁 v2.552.0：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) {
  console.log('失败项：');
  fails.forEach(function (f) { console.log('  · ' + f); });
  process.exit(1);
}
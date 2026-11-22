// WorldAxis tests/negative-control-audit-v2104.js (v2.104.0, 计划一 #2) — 负控制审计专锁
//
// 四段结构（与仓库既有专锁同规）：
//   A 静态面：模块形状、口径表非空、判据是真谓词（对已知锁为真、对非锁为假）
//   B 运行时：全仓审计读数自洽（四档相加 = 锁数、逐锁问题与汇总同源、装载态如实分档）
//   C 不变式：连跑两次结论一致（观测不改变被观测对象）、不写盘、只读
//   N 负控制：真源码破坏 → 装载破坏副本 → 在副本上重跑**同款**真判据
//
// 【本锁自测期连撞的三处「自己身上的」缺陷——全是它要治的那族病】
//   D1 require 环：本锁作入口 → 审计模块装载中 → audit() require 回本锁（in-flight）
//      ⇒ 读到尚未完成的 exports（ANCHORS 为 undefined）⇒ 本锁被**静默归进「非统一」档**、
//      Node 打 circular 警告，且归类结果**取决于谁先装载**（自己跑算非统一，被 run.js 跑算统一）。
//      处置：审计侧加第四档 pending（tools/patch_o17_v2104.py），本锁用 B11/N8 把它钉死。
//   D2 锚点形态：初版把 ANCHORS 导出成**纯字符串**，而仓库统一口径是 { rel, txt }。
//      若真被归入统一档，审计会如实报 3 条 shape —— 那不是误报，审计是对的（A10 钉住这一点）。
//   D3 纯度口径的结构性边界（H7）：含**非换行反斜杠**的锚点做不了统一锚点——源码里必须写成两个
//      反斜杠才不丢字符，而纯度判据只把真换行还原成转义形态，不还原前者 ⇒ 必然 0 命中 ⇒ impure。
//      故 ISLOCK_TXT / PURE_TXT 这类锚点只能作内部破坏常量，用 String.fromCharCode(92) 现场拼接。
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/negative-control-audit-v2104.js';
const AUDIT_REL = 'tests/negative-control-audit.js';
const SELF_ABS = path.join(BASE, SELF_REL);
const AUDIT_ABS = path.join(BASE, AUDIT_REL);
const auditMod = require('./negative-control-audit.js');

const BS = String.fromCharCode(92);

function selfSrc() { return fs.readFileSync(SELF_ABS, 'utf8'); }
function srcOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }

/** 按行前缀抓取一条锚点原文：不手拼字面量 ⇒ 本文件里根本不存在整体形态 ⇒ 纯度天然满足（H7 的正解） */
function lineWith(src, needle, tag) {
  const hit = src.split('\n').filter(function (l) { return l.indexOf(needle) >= 0; });
  if (hit.length !== 1) throw new Error('anchor line not unique (' + hit.length + ') :: ' + tag);
  return hit[0];
}

/** 装载破坏副本：同一份源码、同一入口，只换 __dirname（N4/N7 需要） */
function loadBroken(src, dirname) {
  const mod = { exports: {} };
  const sandbox = {
    module: mod, exports: mod.exports, require: require, console: console,
    __dirname: dirname || __dirname, __filename: 'broken-audit.js',
    process: process, Buffer: Buffer
  };
  vm.runInNewContext(src, sandbox, { filename: 'broken-audit.js' });
  return mod.exports;
}

/** 恰中 1 次的替换工具（锚点不唯一即抛，禁止「改到别处」） */
function must1(s, x, tag) {
  const n = s.split(x).length - 1;
  if (n !== 1) throw new Error('anchor hits != 1 (' + n + ') :: ' + tag);
  return n;
}

// ── 统一形态锚点（不含换行以外的反斜杠——见头注释 D3）──
const ORDER_TXT = '    .sort();';
const UNIQ_TXT = "  if (n !== 1) push('not-unique', '在 ' + a.rel + ' 命中 ' + n + ' 次（要求恰好 1）');";
const EMPTY_TXT = "  if (!keys.length) problems.push({ file: file, key: '-', kind: 'empty-anchors', detail: '导出了 ANCHORS 但一条锚点都没有（空表上的审计恒真）' });";
const ANCHORS = {
  ORDER: { rel: AUDIT_REL, txt: ORDER_TXT },
  UNIQ: { rel: AUDIT_REL, txt: UNIQ_TXT },
  EMPTY: { rel: AUDIT_REL, txt: EMPTY_TXT }
};

// ── 破坏串（一律「条件置假」；且不得包含锚点原文，否则纯度会自己变成 2）──
const BREAK = {
  ORDER: '    .reverse();',
  UNIQ: "  if (n < 1) push('not-unique', '在 ' + a.rel + ' 命中 ' + n + ' 次（要求恰好 1）');",
  EMPTY: "  if (keys.length === -1) problems.push({ file: file, key: '-', kind: 'empty-anchors', detail: '（破坏副本：空表不再报）' });"
};

function breakOne(key) {
  const A = ANCHORS[key];
  const s = srcOf(A.rel);
  must1(s, A.txt, key);
  const bad = s.replace(A.txt, BREAK[key]);
  if (bad === s) throw new Error('break no-op :: ' + key);
  return { rel: A.rel, src: bad };
}

// ── 含非换行反斜杠的锚点：按行前缀现场抓取（不手拼 ⇒ 本文件无整体形态 ⇒ 纯度天然满足）──
const ISLOCK_TXT = lineWith(srcOf(AUDIT_REL), 'function isLock(src) {', 'isLock');
const PURE_TXT = lineWith(srcOf(AUDIT_REL), 'const selfN = hits(selfSrc,', 'pure');
const GUARD_TXT = lineWith(srcOf(AUDIT_REL), 'if (cached && cached.loaded !== true)', 'guard');
const BREAK_ISLOCK = 'function isLock(src) { return false; }';
const BREAK_PURE = '  const selfN = hits(selfSrc, a.txt);';

// ── 跨段共享的假替身：一次只变一维，免得两维互相干扰 ──
const multi = 'line1\nline2';
const escaped = multi.replace(/\n/g, BS + 'n');
const fakeReadOk = function () { return { ok: true, src: 'AAA' + multi + 'BBB' }; };
const fakeSelf = 'X = "' + escaped + '";';
const dupRead = function () { return { ok: true, src: 'AAA' + multi + 'BBB' + multi + 'CCC' }; };
const zeroRead = function () { return { ok: true, src: 'AAA' }; };
const realRead = function (rel) {
  try { return { ok: true, src: srcOf(rel) }; }
  catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
};

function runAll(a) {
  // ══════════ A. 静态面 ══════════
  const api = ['KINDS', 'PROBLEM_KINDS', 'hits', 'isLock', 'listTestFiles', 'auditAnchor', 'auditLock', 'audit', 'discover'];
  const missing = api.filter(function (k) { return auditMod[k] === undefined; });
  a(missing.length === 0, 'A1 模块导出齐备（缺的：' + (missing.join(',') || '无') + '）');
  a(Object.keys(auditMod.KINDS).length === 4 && auditMod.KINDS.PENDING === 'pending',
    'A2 四档形态封闭（uniform / non-uniform / unloadable / pending）——「正在装载中」必须是可读的一档，不许静默跳过');
  a(Array.isArray(auditMod.PROBLEM_KINDS) && auditMod.PROBLEM_KINDS.length >= 5,
    'A3 问题类别非空（实 ' + (auditMod.PROBLEM_KINDS || []).length + ' 类）——空类别表上的归因恒真');
  const files = auditMod.listTestFiles();
  a(Array.isArray(files) && files.length > 50, 'A4 测试文件面非空（实 ' + files.length + ' 个）');
  a(files.indexOf('negative-control-audit.js') < 0, 'A5 审计不把自己（被审计的模块）算进被审计面');
  a(files.indexOf('negative-control-audit-v2104.js') >= 0, 'A5b 审计面包含本锁（它登记统一锚点，属于被审计对象）');

  a(auditMod.isLock(srcOf('tests/interop-v2101.js')) === true, 'A6 isLock 对已知含负控制的锁为真');
  a(auditMod.isLock(srcOf('tests/mock.js')) === false, 'A7 isLock 对非锁文件为假（不是恒真）');
  a(auditMod.hits('a.b.c', '.') === 2 && auditMod.hits('aaa', 'b') === 0,
    'A8 hits 计数正确（分段计数，非布尔）');

  const keys = Object.keys(ANCHORS);
  a(keys.length === 3, 'A9 本锁登记 3 条统一锚点（实 ' + keys.length + '）');
  a(keys.every(function (k) {
    const v = ANCHORS[k];
    return !!v && typeof v === 'object' && !Array.isArray(v) &&
      typeof v.rel === 'string' && !!v.rel && typeof v.txt === 'string' && !!v.txt;
  }), 'A10 锚点是仓库统一形态 { rel, txt }（纯字符串会被审计如实报 shape）');
  a(keys.every(function (k) { return ANCHORS[k].txt.split(BS + 'n').join('').indexOf(BS) < 0; }),
    'A11 统一锚点不含换行以外的反斜杠（含则结构性必被判 impure——H7，故 ISLOCK/PURE 只作内部常量）');
  a(keys.every(function (k) { return must1(srcOf(ANCHORS[k].rel), ANCHORS[k].txt, k) === 1; }),
    'A12 三条锚点在真源码各恰中 1 次（唯一性在开工前就成立）');
  a(srcOf(AUDIT_REL).indexOf(ISLOCK_TXT) >= 0 && srcOf(AUDIT_REL).indexOf(PURE_TXT) >= 0 &&
    srcOf(AUDIT_REL).indexOf(GUARD_TXT) >= 0 && selfSrc().indexOf(ISLOCK_TXT) < 0 &&
    selfSrc().indexOf(GUARD_TXT) < 0 && selfSrc().indexOf(PURE_TXT) < 0,
    'A13 反斜杠锚点在目标文件成立、且三条都不以整体形态出现在本文件（不手拼字面量——H7 的正解）');

  // ══════════ B. 运行时 ══════════
  const r = auditMod.audit();
  const s = r.summary;
  const isEntry = require.main === module;
  a(Array.isArray(r.locks) && r.locks.length === s.locks, 'B1 逐锁记录数与汇总一致（' + r.locks.length + '）');
  a(s.uniform + s.nonUniform + s.unloadable + s.pending === s.locks,
    'B2 四档相加 = 锁总数（' + s.uniform + '+' + s.nonUniform + '+' + s.unloadable + '+' + s.pending + '=' + s.locks + '）——不许有落不进档的锁');
  a(s.uniform >= 10, 'B3 统一形态的锁 ≥10（实 ' + s.uniform + '）——本判据要求审计面非空');
  a(s.anchors >= 100, 'B4 被审计锚点总数 ≥100（实 ' + s.anchors + '）');
  a(s.problems === 0, 'B5 全仓负控制锚点健康（问题 ' + s.problems + ' 条）');
  a(r.problems.length === s.problems, 'B6 汇总问题数与逐条列表同源（两处不许各算一份）');
  const uniformLocks = r.locks.filter(function (l) { return l.kind === auditMod.KINDS.UNIFORM; });
  a(uniformLocks.every(function (l) { return l.anchors > 0; }),
    'B7 统一形态的锁都报了锚点数（无「导出了空表」的）');
  const d = auditMod.discover();
  a(d.locks === s.locks && d.anchors === s.anchors && d.problems === s.problems,
    'B8 discover 与 audit 同源（不另写扫描面）');
  a(Object.keys(auditMod.KINDS).length === 4 && d.pending === s.pending &&
    d.problemKinds.length === auditMod.PROBLEM_KINDS.length,
    'B9 discover 带全四档与类别表');
  a(d.unloadable === 0, 'B10 零个「装载不了」的锁（实 ' + d.unloadable + '）——装载失败不得静默跳过');
  // D1 的钉死：入口运行时本锁 in-flight ⇒ pending 恰 1；被 run.js require 完再跑 ⇒ pending 恰 0。
  // 两种运行态都断言，才叫「归类不依赖运行顺序」。
  a(s.pending === (isEntry ? 1 : 0),
    'B11 装载态如实分档（入口 pending=1 / 被 require pending=0；实 ' + s.pending + '，入口=' + isEntry + '）——归类不依赖运行顺序');
  const mine = r.locks.filter(function (l) { return l.file === 'negative-control-audit-v2104.js'; })[0];
  a(!!mine && (mine.kind === auditMod.KINDS.PENDING || mine.kind === auditMod.KINDS.UNIFORM) &&
    mine.anchors === (mine.kind === auditMod.KINDS.UNIFORM ? 3 : 0),
    'B12 本锁必落在「统一」或「pending」两档之一（实 ' + (mine && mine.kind) + ' / ' + (mine && mine.anchors) + ' 锚点）——不存在第三态');
  // B13 自审：入口模式下本锁落 pending 档，audit() 不会审到它自己的锚点 ⇒ 这里显式补审，不留覆盖空洞
  const selfProblems = [];
  keys.forEach(function (k) {
    auditMod.auditAnchor(SELF_REL, k, ANCHORS[k], selfSrc(), realRead)
      .forEach(function (p) { selfProblems.push(p); });
  });
  a(selfProblems.length === 0,
    'B13 本锁三条锚点在全真读取下自身干净（实 ' + JSON.stringify(selfProblems.map(function (p) { return p.kind; })) + '）——补上入口模式的覆盖空洞');

  // ══════════ C. 不变式 ══════════
  const before = selfSrc();
  const r2 = auditMod.audit();
  a(JSON.stringify(r2.summary) === JSON.stringify(s), 'C1 连跑两次结论一致（观测不改变被观测对象）');
  a(selfSrc() === before, 'C2 审计不改动自身源码（只读）');
  const mt = fs.statSync(AUDIT_ABS).mtimeMs;
  auditMod.audit();
  a(fs.statSync(AUDIT_ABS).mtimeMs === mt, 'C3 审计不写盘（mtime 不变）');

  runNegative(a, r, isEntry);
}

/** 负控制：真源码破坏 → 装载破坏副本 → 在副本上重跑**同款**真判据 */
function runNegative(a, originalResult, isEntry) {
  const asrc = srcOf(AUDIT_REL);
  const origFiles = auditMod.listTestFiles();

  // N0 锚点工具两向自证：不存在 / 不唯一都必须抛
  let threw = 0;
  try { must1(asrc, '锚点根本不在源码里__v2104', 'self'); } catch (e) { threw++; }
  try { must1(asrc + UNIQ_TXT, UNIQ_TXT, 'self'); } catch (e) { threw++; }
  a(threw === 2, 'N0 锚点工具两向自证：不存在 / 不唯一都必须抛（实抛 ' + threw + '/2）');

  // N1 锁的发现是真谓词：拆掉 isLock ⇒ 审计看不出一把锁（原版 60 把以上）
  must1(asrc, ISLOCK_TXT, 'isLock');
  const b1 = asrc.replace(ISLOCK_TXT, BREAK_ISLOCK);
  a(b1 !== asrc, 'N1 破坏锚点（isLock）恰中 1 次');
  const r1 = loadBroken(b1).audit();
  a(r1.summary.locks === 0 && originalResult.summary.locks > 50,
    'N1 拆掉锁的判定 ⇒ 审计看不出一把锁（实 ' + r1.summary.locks + '，原版 ' + originalResult.summary.locks + '）——判据非恒真');
  a(r1.summary.problems === 0,
    'N1 旁证：锁数归零时问题数也归零（「看不见」与「都健康」在此同形，故 B3/B4 的存在量下限是必要的）');

  // N2 确定性文件序是真谓词：sort ⇒ reverse（集合不变、顺序变）
  const order = breakOne('ORDER');
  const f2 = loadBroken(order.src).listTestFiles();
  a(f2.join('|') !== origFiles.join('|') && f2.slice().sort().join('|') === origFiles.join('|'),
    'N2 拆掉确定性排序 ⇒ 文件序变更（原版首元素 ' + origFiles[0] + '，破坏版首元素 ' + f2[0] + '）——读数可复现不是白来的');

  // N3 唯一性上报是真谓词：把「≠1 才算问题」放宽成「<1 才算问题」⇒ 命中两次的锚点不再报
  const origD = auditMod.auditAnchor('self.js', 'K', { rel: 'x.js', txt: multi }, fakeSelf, dupRead);
  const brkD = loadBroken(breakOne('UNIQ').src).auditAnchor('self.js', 'K', { rel: 'x.js', txt: multi }, fakeSelf, dupRead);
  a(origD.some(function (p) { return p.kind === 'not-unique'; }),
    'N3 对照——原版对命中两次的锚点报 not-unique（实 ' + JSON.stringify(origD.map(function (p) { return p.kind; })) + '）');
  a(!brkD.some(function (p) { return p.kind === 'not-unique'; }),
    'N3 放宽成「只报零命中」⇒ 不唯一的锚点被放过（实 ' + JSON.stringify(brkD.map(function (p) { return p.kind; })) + '）');

  // N4/N5/N7 在一个临时目录里做：对照与破坏用**同一份源码**，唯一差别只有被破坏的那一行
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'neg-audit-'));
  try {
    fs.writeFileSync(path.join(tmp, 'fake-lock.js'),
      'function runNegative(a) {}\nmodule.exports = { ANCHORS: {} };\n');
    const noRead = function () { return { ok: false, error: '不可读' }; };
    const mOrig = loadBroken(asrc, tmp);
    const oneOrig = mOrig.auditLock('fake-lock.js', noRead);
    a(oneOrig.anchors === 0 && oneOrig.problems.some(function (p) { return p.kind === 'empty-anchors'; }),
      'N4 对照——原版对「导出了空 ANCHORS 的锁」现形（空表上的审计恒真）');
    const brkOne = loadBroken(breakOne('EMPTY').src, tmp).auditLock('fake-lock.js', noRead);
    a(!brkOne.problems.some(function (p) { return p.kind === 'empty-anchors'; }),
      'N4 拆掉空表上报 ⇒ 假锁蒙混过关（实 ' + JSON.stringify(brkOne.problems.map(function (p) { return p.kind; })) + '）');

    // N5 零命中否决：锚点找不到是**缺陷**，不是「没什么可查」；零命中时纯度那维也会一起报，
    //    故按 kind 断言，而不是假定「只报一条」。
    const origZ = auditMod.auditAnchor('self.js', 'K', { rel: 'x.js', txt: multi }, fakeSelf, zeroRead);
    const zk = origZ.filter(function (p) { return p.kind === 'not-unique'; })[0];
    a(!!zk && zk.detail.indexOf('0 次') >= 0,
      'N5 零命中如实报缺陷（不是静默通过，实 ' + JSON.stringify(origZ.map(function (p) { return p.kind; })) + '）');

    // N6 纯度转义口径是真谓词：拆掉转义替换 ⇒ 多行锚点被误报 impure（误报会被读成「锁坏了」）
    must1(asrc, PURE_TXT, 'pure');
    const b6 = asrc.replace(PURE_TXT, BREAK_PURE);
    a(b6 !== asrc, 'N6 破坏锚点（纯度转义口径）恰中 1 次');
    const origP = auditMod.auditAnchor('self.js', 'K', { rel: 'x.js', txt: multi }, fakeSelf, fakeReadOk);
    const brkP = loadBroken(b6).auditAnchor('self.js', 'K', { rel: 'x.js', txt: multi }, fakeSelf, fakeReadOk);
    a(origP.length === 0, 'N6 对照——原版同判据为真（多行锚点按转义形态找得到，0 问题）');
    a(brkP.some(function (p) { return p.kind === 'impure'; }),
      'N6 拆掉转义口径 ⇒ 多行锚点被误报 impure（实 ' + JSON.stringify(brkP.map(function (p) { return p.kind; })) + '）');

    // N7 换 __dirname 的副本只扫该目录 ⇒ 证明装载装置本身是真的（不是拿原目录的读数冒充）
    const two = loadBroken(breakOne('EMPTY').src, tmp).audit();
    a(two.summary.locks === 1,
      'N7 副本换了 __dirname 后只扫到该目录（实 ' + two.summary.locks + ' 锁 / ' + two.summary.problems + ' 问题）——装载装置本身是真的');

    // N8 pending 档是真谓词。做法**与运行模式无关**：直接往 require.cache 里塞一个 loaded=false
    //    的"正在装载中"条目，再跑同款 auditLock —— 这样不必依赖"本锁恰好是入口"。
    fs.writeFileSync(path.join(tmp, 'pending-lock.js'),
      'function runNegative(a) {}\nmodule.exports = { ANCHORS: { A: { rel: "x.js", txt: "yy" } } };\n');
    const pabs = path.join(tmp, 'pending-lock.js');
    const inflight = { id: pabs, filename: pabs, loaded: false, exports: {}, children: [], paths: [] };
    const mOrig2 = loadBroken(asrc, tmp);
    require.cache[pabs] = inflight;
    const pend = mOrig2.auditLock('pending-lock.js', noRead);
    a(pend.kind === mOrig2.KINDS.PENDING && pend.problems.length === 0,
      'N8a 正在装载中的文件如实记为 pending（实 ' + pend.kind + '）——不被静默当成「没有锚点」');
    const okRead = function () { return { ok: true, src: 'yy' }; };
    delete require.cache[pabs];
    const done = mOrig2.auditLock('pending-lock.js', okRead);
    a(done.kind === mOrig2.KINDS.UNIFORM && done.anchors === 1 && done.problems.length === 0,
      'N8a 对照——装载完成后同一把锁归「统一」档且 1 条锚点干净（实 ' + done.kind + ' / ' + done.anchors
      + ' / ' + done.problems.length + ' 问题），差别只在 loaded');
    must1(asrc, GUARD_TXT, 'guard');
    const b8 = asrc.replace(GUARD_TXT, '  if (false) {');
    a(b8 !== asrc, 'N8 破坏锚点（in-flight 守卫）恰中 1 次');
    // N8 旁证：没有守卫时会**真去 require** 一个 in-flight 模块 ⇒ Node 报 circular 警告。
    //   把警告当被观测现象收起来断言：既不泄漏到回归输出，也证明守卫不是摆设。
    const warnSeen = [];
    const oldEmit = process.emitWarning;
    let pendB = null;
    process.emitWarning = function (w) { warnSeen.push(String((w && w.message) || w)); };
    try {
      require.cache[pabs] = inflight;
      pendB = loadBroken(b8, tmp).auditLock('pending-lock.js', noRead);
    } finally {
      process.emitWarning = oldEmit;
      delete require.cache[pabs];
    }
    a(pendB.kind === loadBroken(asrc, tmp).KINDS.NON_UNIFORM && pendB.problems.length === 0,
      'N8 拆掉 in-flight 守卫 ⇒ 正在装载的文件被静默编进「非统一」（实 ' + pendB.kind + ' / ' + pendB.problems.length
      + ' 问题）——这正是 D1 的现场：分类错了，却没有任何一条读数说它错了');
    a(warnSeen.some(function (w) { return w.indexOf('circular dependency') >= 0; }),
      'N8 旁证：破坏版真的去 require 了 in-flight 模块（Node 报 circular 警告 ' + warnSeen.length + ' 条）——守卫确实拦下了一次真读取');
  } finally {
    try { delete require.cache[path.join(tmp, 'pending-lock.js')]; } catch (e) { /* 清理 */ }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* 清理失败不影响判据 */ }
  }

  console.log('  · v2104 概要：' + JSON.stringify({
    locks: originalResult.summary.locks, uniform: originalResult.summary.uniform,
    nonUniform: originalResult.summary.nonUniform, pending: originalResult.summary.pending,
    anchors: originalResult.summary.anchors, problems: originalResult.summary.problems
  }));
}

if (require.main === module) {
  let PASS = 0, FAIL = 0;
  const a = function (cond, name) {
    if (cond) { PASS++; console.log('  ✓ ' + name); }
    else { FAIL++; console.log('  ✗ ' + name); }
  };
  try { runAll(a); }
  catch (e) { FAIL++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (FAIL) { console.log('NEGATIVE-CONTROL-AUDIT-V2104: FAIL ' + FAIL + ' / ' + (PASS + FAIL)); process.exit(1); }
  console.log('NEGATIVE-CONTROL-AUDIT-V2104: pass（' + PASS + ' 项）');
}

module.exports = {
  runAll: runAll, runNegative: runNegative, ANCHORS: ANCHORS
};

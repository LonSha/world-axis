#!/usr/bin/env node
'use strict';
/**
 * tests/load-audit-wire-v2553.js — 「载入体检」接线专锁（v2.553.0）
 *
 * 治的缺口（本文件存在的唯一理由）：
 *
 *   `engines/save-audit.js`（v2.533.0）是一个**只说话不动手**的存档体检，头注释自己写着
 *   「一个既负责诊断又负责治疗的器官，等于没有诊断」。而 `core/store.js` 的 init() 正是
 *   那样一个器官：
 *       load → migrate（第一句 `Object.assign(defaultWorldState(), state)`，缺键当场补完）
 *            → ensureShape（面对已补齐的对象，filled 恒 0）→ save
 *   实测（本锁 B1 的样本）：一份缺 235 个键、含 1 处类型错、版本号 0 的旧档，载入之后
 *       lastFix.filled=0 / missingTotal=0 / shapeConflicts=1
 *   —— 「这份档缺了 235 个键」**一个字都没有留下**。治过之后再量，量到的永远是「健康」。
 *
 * 本批做的事（一句话）：把体检挪到治疗**之前**，并把结论落进 store.loadStat().lastAudit。
 *   它不是「给引擎找了个调用点」，是修一处**顺序**：同一份数据，先量还是后量，答案不同。
 *
 * 为什么这件事的风险不是「多跑一次函数」：
 *   ① init 是主路径（每次切聊天都跑）⇒ 体检必须只读、不阻断、不写盘、不刷屏；
 *   ② 体检的结论会被面板与诊断面当读数用 ⇒ 归因必须**全量**，不能只覆盖被截断的前 N 条
 *      （引擎 MAX_PROBLEMS=64 且 missing 先入栈，于是 bad-type / unknown-version 会被整段挤出，
 *        读数变成「237 项问题，全都是缺键」——一个看起来很确定的错答案）。
 *
 * 判据结构：
 *   A 接线与顺序（静态）· B 行为（坏档 / 恒等式 / 顺序证据 / 干净档 / 节流）
 *   C 只读不变式 · D 缺席与异常 · E 结论有读面（诊断包 / 迁移预检 / 面板）
 *   N 真源码负控（顺序错位、归因退回截断口径）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
let pass = 0, fail = 0;
const fails = [];
function ok(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; fails.push(name + ' :: ' + e.message); console.log('  ✗ ' + name + ' :: ' + e.message); }
}
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function sha(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
/** 去注释（含 JSDoc 块注释行的续行形态）——注释里的提及不是调用。 */
function stripComment(line) {
  const t = line.trim();
  if (t.indexOf('/*') === 0 || t.indexOf('*') === 0) return '';
  const i = line.indexOf('//');
  return i < 0 ? line : line.slice(0, i);
}
function codeLines(text) {
  return text.split('\n').filter(function (l) { return stripComment(l).trim().length > 0; });
}
function lineOf(text, needle) {
  const ls = text.split('\n');
  for (let i = 0; i < ls.length; i++) if (stripComment(ls[i]).indexOf(needle) >= 0) return i + 1;
  return -1;
}

// ── 台子：真宿主桩 + 真产品模块（不 mock store / save-audit）──────
require('./host-boot.js').boot();
const STORE_REL = 'core/store.js';
const AUDIT_REL = 'engines/save-audit.js';
function loadProducts() {
  delete require.cache[require.resolve(path.join(BASE, STORE_REL))];
  delete require.cache[require.resolve(path.join(BASE, AUDIT_REL))];
  require(path.join(BASE, STORE_REL));
  require(path.join(BASE, AUDIT_REL));
  return global.WorldAxis;
}
let WA = loadProducts();
const KEY = 'worldaxis_state_test_chat_001';

/** 一份「人写得出来」的旧档：缺一大片键 + 1 处类型错 + 版本号 0。 */
function brokenSave() {
  return { schemaVersion: 0, people: { p1: { name: '沈砚' } }, worldFacts: 'not-an-object', evolution: { round: 7 } };
}
function seed(obj) {
  if (obj === null) { global.localStorage.removeItem(KEY); return; }
  global.localStorage.setItem(KEY, JSON.stringify(obj));
}
function rawKey() { return global.localStorage.getItem(KEY); }

// ── A 接线与顺序 ─────────────────────────────────────────────
const STORE = rd(STORE_REL);
ok('A1 store.js 里恰有 1 处非注释的载入体检调用（且传的是盘上那份）', function () {
  const hits = codeLines(STORE).filter(function (l) { return l.indexOf('auditLoadedArchive(') >= 0; });
  // 允许两处：函数定义行 + 调用行。定义行的形态是 `function auditLoadedArchive(payload) {`
  const defs = hits.filter(function (l) { return /function\s+auditLoadedArchive\s*\(/.test(l); });
  const calls = hits.filter(function (l) { return /auditLoadedArchive\s*\(\s*__loadedFromDisk\s*\)/.test(l); });
  assert.equal(defs.length, 1, '定义应恰 1 处，实 ' + defs.length);
  assert.equal(calls.length, 1, '调用应恰 1 处且形参是 __loadedFromDisk，实 ' + calls.length + ' :: ' + JSON.stringify(calls));
});
ok('A2 体检量的是**载入时那份原始 payload**，不是治疗后的 memCache', function () {
  // 本段第一版写的是「顺序即语义：体检必须在 migrate 之前」，跑完 N1 才看清：
  //   真正让读数成立的是**传了谁**，不是**排在哪**。把调用整段挪到 ensureShape 之后、
  //   但仍然传 __loadedFromDisk 时，缺键归因**照旧还在**（migrate 的 Object.assign 产生的是
  //   新对象，原始那份没被就地改动）—— 于是「顺序」单独一条测不出东西。
  //   真实的不变式两条：① 参数必须是载入那一刻的对象；② 位置在 migrate 之前（否则
  //   最自然的写法就是顺手传 memCache，而那正是本批要防的错）。
  assert.ok(!/auditLoadedArchive\s*\(\s*memCache/.test(STORE), '绝不允许把 memCache（治疗后的对象）喂给体检');
  assert.ok(/auditLoadedArchive\s*\(\s*__loadedFromDisk\s*\)/.test(STORE), '参数必须是 __loadedFromDisk');
  const auditLine = lineOf(STORE, 'auditLoadedArchive(__loadedFromDisk)');
  const migLine = lineOf(STORE, 'memCache = this.migrate(memCache);');
  const assignLine = lineOf(STORE, 'const out = Object.assign(defaultWorldState(), state);');
  assert.ok(auditLine > 0 && migLine > 0 && assignLine > 0, '三个锚点都要在位: ' + [auditLine, migLine, assignLine]);
  assert.ok(auditLine < migLine, '体检应在 migrate 之前（实 ' + auditLine + ' vs ' + migLine + '）');
  assert.ok(assignLine > auditLine, 'migrate 里补骨架那行应在体检之后: ' + assignLine);
});
ok('A3 只对「从盘上读出来的那份」体检（新建聊天不体检）', function () {
  assert.ok(codeLines(STORE).some(function (l) { return l.indexOf('const __loadedFromDisk = this.load();') >= 0; }),
    '应留下 __loadedFromDisk');
  assert.ok(codeLines(STORE).some(function (l) { return l.indexOf('memCache = __loadedFromDisk || defaultWorldState();') >= 0; }),
    'memCache 应从同一份赋值（否则「读出来的」与「用的」可能不是同一份）');
  assert.ok(codeLines(STORE).some(function (l) { return l.indexOf('if (__loadedFromDisk)') >= 0; }),
    '体检应被 __loadedFromDisk 守住');
});
ok('A4 loadStat 投影含 lastAudit，且是**拷贝**（诊断面拿到的东西不许能改账本）', function () {
  assert.ok(codeLines(STORE).some(function (l) { return l.indexOf('lastAudit: __loadStat.lastAudit ? {') >= 0; }),
    '投影里应有 lastAudit');
  assert.ok(codeLines(STORE).some(function (l) { return l.indexOf('Object.assign({}, __loadStat.lastAudit.codes') >= 0; }),
    'codes 应被拷贝出来');
  assert.ok(codeLines(STORE).some(function (l) { return l.indexOf('(__loadStat.lastAudit.problems || []).map(') >= 0; }),
    'problems 应逐条重建（不是把内部对象递出去）');
});

// ── B 行为 ───────────────────────────────────────────────────
ok('B1 坏档：三项归因齐全（缺键 / 类型错 / 版本未知），且 ok=false', function () {
  WA = loadProducts();
  seed(brokenSave());
  WA.store.init();
  const la = WA.store.loadStat().lastAudit;
  assert.ok(la, 'lastAudit 应存在');
  assert.equal(la.ok, false, '坏档不该被读成健康');
  assert.equal(la.source, 'save-audit', '应来自 save-audit 引擎，实 ' + la.source);
  assert.ok(la.codes.missing > 0, '应报缺键，实 ' + JSON.stringify(la.codes));
  assert.equal(la.codes['bad-type'], 1, 'worldFacts 由对象变字符串应报 1 处类型错，实 ' + JSON.stringify(la.codes));
  assert.equal(la.codes['unknown-version'], 1, 'schemaVersion=0 不在已知列表应报 1 处，实 ' + JSON.stringify(la.codes));
  assert.ok(la.problemCount > 64, '样本应超过明细上限（这样才能证归因没被截断），实 ' + la.problemCount);
  assert.equal(la.truncated, true, '明细应标记截断');
  assert.equal(la.codesCapped, false, '归因不该走截断口径');
  assert.ok(la.problems.length <= 12, '明细只留前 12 条，实 ' + la.problems.length);
});
ok('B2 归因恒等式：各码计数之和 === problemCount（明细可截断，统计不可截断）', function () {
  const la = WA.store.loadStat().lastAudit;
  const sum = Object.keys(la.codes).reduce(function (n, c) { return n + la.codes[c]; }, 0);
  assert.equal(sum, la.problemCount, '各码之和 ' + sum + ' 应等于 problemCount ' + la.problemCount);
  // 反证：若按被截断的明细去数，和会明显小于 problemCount —— 那正是本批修掉的口径
  const cappedSum = la.problems.length;
  assert.ok(cappedSum < la.problemCount, '明细条数应小于总数（否则样本测不到截断）: ' + cappedSum);
});
ok('B3 顺序证据：同一份 payload，**先治疗后量**就量不到（这是 A2 的行为版）', function () {
  const payload = brokenSave();
  const before = WA.saveAudit.audit(payload, { require: Object.keys(payload), types: { worldFacts: 'object' }, versionKey: 'schemaVersion', knownVersions: [1] });
  // 模拟 init 里的「治疗」：把缺的面补上（migrate 的 Object.assign 就是这件事）
  const healed = JSON.parse(JSON.stringify(WA.store.load() || payload));
  const after = WA.saveAudit.audit(healed, { require: Object.keys(healed), types: { worldFacts: 'object' }, versionKey: 'schemaVersion', knownVersions: [1] });
  assert.ok(before.problemCount >= 1, '治疗前应能量到问题，实 ' + before.problemCount);
  assert.ok(after.problemCount < before.problemCount,
    '治疗后的问题数必须更少（否则「顺序」这件事不成立）: ' + after.problemCount + ' vs ' + before.problemCount);
});
ok('B4 干净档：ok=true、problemCount=0（不是恒报红）', function () {
  WA = loadProducts();
  seed(null);
  WA.store.init();                       // 新聊天 ⇒ 内存里是完整骨架
  const clean = JSON.parse(JSON.stringify(WA.store.get()));
  seed(clean);                           // 直接把「完整档」放上盘（不依赖 save：本台子 save 会失败）
  WA.store.init();
  const la = WA.store.loadStat().lastAudit;
  assert.ok(la, '干净档也要有体检记录（否则「没体检」与「体检通过」同形）');
  assert.equal(la.ok, true, '干净档应通过，实 codes=' + JSON.stringify(la.codes) + ' version=' + la.version);
  assert.equal(la.problemCount, 0, '干净档问题数应为 0，实 ' + la.problemCount);
  assert.deepEqual(la.codes, {}, '干净档不该有任何归因');
});
ok('B5 告警节流：跑两遍、只说一遍（且两次都真跑了）', function () {
  WA = loadProducts();
  seed(brokenSave());
  const cnt = function () {
    // mock 的 WA.log 写的是 eventLog（{\t, level, msg}），不是 errorLog —— 第一版找错面了
    return (WA.eventLog || []).concat(WA.errorLog || [])
      .filter(function (r) { return String((r && r.msg) || '').indexOf('载入体检发现') >= 0; }).length;
  };
  // 注意：eventLog 是**整个文件累计**的，前面的用例已经报过同一条告警。
  //   所以这里只能取增量 —— 第一版直接读总数，得到「第一次就报了 2 条」这种假红。
  const base = cnt();
  const c0 = WA.saveAudit.stat().calls;
  WA.store.init();
  const warns1 = cnt() - base;
  // 第二次前把盘上那份**原样放回去**：init 会顺手把治好的档落盘，若不管它，
  //   第二次读到的是「另一份数据」（版本已归一、缺键已补），结论不同 ⇒ 再报一条是**对的**，
  //   拿它去测「同一结论只报一次」等于测了个错误前提（第一版就这么误判成红）。
  seed(brokenSave());
  WA.store.init();
  const warns2 = cnt() - base;
  assert.equal(WA.saveAudit.stat().calls - c0, 2, '两次 init 应真跑两次体检，实 +' + (WA.saveAudit.stat().calls - c0));
  assert.equal(warns1, 1, '第一次应报 1 条，实 ' + warns1);
  assert.equal(warns2, 1, '第二次同一结论不该再报（告警疲劳），实 ' + warns2);
  // 面板那一行从此读的是真数：saveAudit.stat().calls > 0 ⇒ 不再停在「从未调用」
  const SET = rd('ui/settings.js');
  assert.ok(SET.indexOf("s.calls === 0 ? '从未调用'") >= 0, '面板那一行的两态表达式应仍在位');
  assert.ok(WA.saveAudit.stat().calls > 0, '体检调用数应 > 0（面板据此离开「从未调用」）');
});

// ── C 只读不变式 ─────────────────────────────────────────────
ok('C1 体检不写盘：干净档载入前后，存档键逐字不变且没有新的落盘', function () {
  WA = loadProducts();
  WA.store.init(); WA.store.save();
  const clean = rawKey();
  const saveBefore = WA.store.saveStat();
  seed(JSON.parse(clean));
  const c0 = WA.saveAudit.stat().calls;
  WA.store.init();
  assert.equal(rawKey(), clean, '存档键被改写了 —— 体检越界到了写入面');
  assert.equal(WA.saveAudit.stat().calls - c0, 1, '体检应真跑了一次');
  assert.equal(WA.store.saveStat().at, saveBefore.at, '体检不该触发任何落盘（saveStat.at 变了）');
});
ok('C2 体检不阻断载入：坏档仍然载入成功（memCache 不是默认骨架的空壳）', function () {
  WA = loadProducts();
  seed(brokenSave());
  WA.store.init();
  const st = WA.store.get();
  assert.ok(st && typeof st === 'object', '载入应返回状态对象');
  assert.ok(WA.store.loadStat().lastAudit.problemCount > 0, '同时体检结论在（两件事不互相顶替）');
});
ok('C3 新聊天（盘上无档）⇒ lastAudit === null（不把「新建」读成「体检通过」）', function () {
  WA = loadProducts();
  seed(null);
  WA.store.init();
  assert.strictEqual(WA.store.loadStat().lastAudit, null,
    '新建聊天不该留下体检记录，实 ' + JSON.stringify(WA.store.loadStat().lastAudit));
});

// ── D 缺席与异常（两种「没有结论」必须可分）────────────────────
ok('D1 引擎缺席 ⇒ source=engine-absent 且 ok=null（**不是** true）', function () {
  WA = loadProducts();
  const keep = WA.saveAudit;
  try {
    delete WA.saveAudit;
    seed(brokenSave());
    WA.store.init();
    const la = WA.store.loadStat().lastAudit;
    assert.equal(la.source, 'engine-absent', '应明说引擎缺席，实 ' + la.source);
    assert.strictEqual(la.ok, null, '「没体检」不许写成「通过」');
    assert.equal(la.problemCount, 0, '缺席时没有结论，计数应为 0');
  } finally { WA.saveAudit = keep; }
});
ok('D2 体检自身抛错 ⇒ source=audit-error 且载入照旧（主路径不被观测拖死）', function () {
  WA = loadProducts();
  const keep = WA.saveAudit;
  try {
    WA.saveAudit = { audit: function () { throw new Error('boom'); }, stat: keep.stat };
    seed(brokenSave());
    WA.store.init();
    const la = WA.store.loadStat().lastAudit;
    assert.equal(la.source, 'audit-error', '应明说体检自身异常，实 ' + la.source);
    assert.strictEqual(la.ok, null, '异常时不许写 ok=true');
    assert.ok(/boom/.test(String(la.error)), '应带上错因，实 ' + la.error);
    assert.ok(WA.store.get() && typeof WA.store.get() === 'object', '载入必须照旧成功');
  } finally { WA.saveAudit = keep; }
});

// ── N 真源码负控 ─────────────────────────────────────────────
const P = path.join(BASE, STORE_REL);
ok('N1 改成「治完再量」（挪到 ensureShape 之后 + 传 memCache）⇒ 缺键归因消失', function () {
  const src0 = rd(STORE_REL);
  const sha0 = sha(P);
  const bak = src0;
  const head = '      // v2.553.0：**诊断先于治疗**';
  const tailMark = "} catch (eAL2) { try { WA.log('error', 'store.init：载入体检调用点异常（不阻断载入）', eAL2); } catch (e3) {} }";
  const i0 = src0.indexOf(head);
  const i1 = src0.indexOf(tailMark, i0);
  assert.ok(i0 > 0 && i1 > i0, '体检调用点锚点应各恰 1 处: ' + [i0, i1]);
  const block = src0.slice(i0, i1 + tailMark.length);
  const shapeAnchor = '      const shapeFix = ensureShape(memCache, defaultWorldState(), __shapeSink);';
  assert.equal(src0.split(shapeAnchor).length - 1, 1, 'ensureShape 锚点应恰 1 处');
  let red = false, restored = false;
  try {
    // 破坏两件事：① 挪到 ensureShape 之后；② 参数改成 memCache。
    //   只做①会得到假绿（第一版就这么写，N1 当场报失效）：Object.assign 产生的是**新对象**，
    //   __loadedFromDisk 那份没被就地改动，于是「先量后量」读数一模一样。
    //   真正的病灶写法是「顺手拿当前内存那份量」—— 那才是治完之后量到「健康」的形态。
    const movedBlock = block.replace('auditLoadedArchive(__loadedFromDisk)', 'auditLoadedArchive(memCache)');
    const cut = src0.slice(0, i0) + src0.slice(i0 + block.length);
    const at = cut.indexOf(shapeAnchor);
    const moved = cut.slice(0, at + shapeAnchor.length) + '\n' + movedBlock + cut.slice(at + shapeAnchor.length);
    fs.writeFileSync(P, moved);
    WA = loadProducts();
    seed(brokenSave());
    WA.store.init();
    const la = WA.store.loadStat().lastAudit;
    // 治完之后：缺键已被补完、版本被归一 ⇒ 这两个归因必须消失
    red = !!(la && la.codes.missing === undefined && la.codes['unknown-version'] === undefined);
  } finally {
    fs.writeFileSync(P, bak);
    restored = sha(P) === sha0;
    WA = loadProducts();
  }
  assert.ok(restored, '还原失败：core/store.js 的 sha256 与破坏前不一致 —— 本锁自己抛，不掩盖');
  assert.ok(red, 'N1 失效：治完再量之后缺键/版本归因居然还在 ⇒ 说明体检量的不是载入那一刻');
});
ok('N2 归因退回「按截断明细数」⇒ B2 恒等式必须现形', function () {
  const src0 = rd(STORE_REL);
  const sha0 = sha(P);
  const bak = src0;
  const NEED = 'const __cc = (r.codeCounts && typeof r.codeCounts === \'object\') ? r.codeCounts : null;';
  assert.equal(src0.split(NEED).length - 1, 1, '锚点应恰 1 处');
  let red = false, restored = false;
  try {
    // 破坏：装作老引擎（拿不到 codeCounts）⇒ 只能按被截断的明细数
    fs.writeFileSync(P, src0.replace(NEED, 'const __cc = null;'));
    WA = loadProducts();
    seed(brokenSave());
    WA.store.init();
    const la = WA.store.loadStat().lastAudit;
    const sum = Object.keys(la.codes).reduce(function (n, c) { return n + la.codes[c]; }, 0);
    red = (la.codesCapped === true) && (sum !== la.problemCount);
  } finally {
    fs.writeFileSync(P, bak);
    restored = sha(P) === sha0;
    WA = loadProducts();
  }
  assert.ok(restored, '还原失败：core/store.js 的 sha256 与破坏前不一致 —— 本锁自己抛，不掩盖');
  assert.ok(red, 'N2 失效：退回截断口径后恒等式居然还成立 ⇒ 说明 B2 量的不是「全量归因」');
});

// ── E 结论要有人读（否则本批只是「接上线但没人读」）──────────────
// 现场：v2.553.0 首版只把结论塞进 `loadStat().lastAudit`，**零读面**。
//   这恰恰是本仓反复治的那种病：一条结论存下来、有形状、有测试，却没有任何人看它 ——
//   于是「存档缺 235 键」这件事对玩家仍然是不可见的。E 段钉的就是三个读面。
ok('E1 三个读面都读「治疗前那份」，且都没有把「没有读数」说成「没问题」', function () {
  const DIAG = rd('engines/tool-diag.js');
  // ① 诊断包：shape 块必须读 lastAudit
  assert.ok(codeLines(DIAG).some(function (l) { return l.indexOf('ls.lastAudit') >= 0; }),
    'tool-diag 的 shape 读数没有读 lastAudit ⇒ 诊断包里仍然只有「治疗后」那个恒 0 的数');
  // 那句假话必须消失：治疗跑在体检之前时，它是「永远为真」的断言。
  const fake = codeLines(DIAG).filter(function (l) { return l.indexOf('本次载入骨架完整') >= 0; });
  assert.deepStrictEqual(fake, [],
    '诊断包还在说「本次载入骨架完整」—— 那是治疗之后才成立的话，拿它当载入结论就是假读数: ' + JSON.stringify(fake));
  assert.ok(codeLines(DIAG).some(function (l) { return l.indexOf('补齐之前') >= 0; }),
    '诊断包应把「补齐之前」与「补齐之后」两个读数分开说');
  // ② 迁移预检：loadAudit 与 shapeFix 并列（一个说治疗前，一个说治疗后）
  const CAP = rd('engines/capacity-audit.js');
  assert.ok(codeLines(CAP).some(function (l) { return l.indexOf('loadAudit: loadStat ? (loadStat.lastAudit || null)') >= 0; }),
    'capacity-audit.migrationCheck 没有并列给出 loadAudit（只有 shapeFix 就永远答不出「坏了还是只是旧」）');
  // ③ 面板：存档体检格必须报结论，且三种非正常情形分列
  const SET = rd('ui/settings.js');
  assert.ok(codeLines(SET).some(function (l) { return l.indexOf("la.source === 'engine-absent'") >= 0; }),
    '面板没有把「体检引擎缺席」与「0 项问题」分开（会读成「一切都好」）');
  assert.ok(codeLines(SET).some(function (l) { return l.indexOf("la.source === 'audit-error'") >= 0; }),
    '面板没有把「体检本身出错」与「0 项问题」分开');
  assert.ok(codeLines(SET).some(function (l) { return l.indexOf('la.problemCount') >= 0; }),
    '面板没有报体检结论（只报「N 次」不回答「这份存档有没有问题」）');
});
ok('E2 行为：同一时刻 shapeFix 说 0、loadAudit 说 237（两个读数不许互相顶替）', function () {
  // 这一条是本批的**核心证据**：不是「多了一个字段」，是「同一个瞬间两个数不一样，
  //   而旧的那个永远是 0」。行为面走 capacityAudit.migrationCheck（可达、无额外依赖）。
  seed(brokenSave());
  WA.store.init();
  // 注意：capacity-audit 的导出挂在 `WA.capacityAudit` 上（require 的返回值不是它）；
  //   N1/N2 重载过 store，故这里取 `global.WorldAxis` 而不是闭包里那个旧引用。
  require(path.join(BASE, 'engines/capacity-audit.js'));
  const cap = global.WorldAxis.capacityAudit;
  assert.ok(cap && typeof cap.migrationCheck === 'function', 'capacityAudit.migrationCheck 应可用');
  const mc = cap.migrationCheck();
  assert.ok(mc && mc.ok !== false, 'migrationCheck 应可用: ' + JSON.stringify(mc && mc.reason));
  assert.ok(mc.loadAudit, 'migrationCheck 没带出 loadAudit');
  assert.ok(mc.loadAudit.problemCount > 0,
    '坏档的载入体检应是「有问题」，实 ' + mc.loadAudit.problemCount);
  assert.ok(mc.loadAudit.codes && mc.loadAudit.codes.missing > 0, '归因里应含 missing');
  assert.ok(mc.loadAudit.codes['bad-type'] > 0,
    '归因里应含 bad-type —— 它排在 missing 之后，若归因被截断就会消失');
  // 治疗后的那个读数（shapeFix）：migrate 已把缺键补齐 ⇒ filled 恒 0
  assert.strictEqual(mc.shapeFix && mc.shapeFix.filled, 0,
    'shapeFix.filled 应为 0（正是它掩盖了缺键现场的证明）');
});

// ── 收口 ─────────────────────────────────────────────────────
console.log('\n载入体检接线专锁 v2.553.0：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) {
  console.log('失败项：');
  fails.forEach(function (f) { console.log('  · ' + f); });
  process.exit(1);
}
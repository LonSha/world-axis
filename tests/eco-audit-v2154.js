#!/usr/bin/env node
// v2.154.0 RX7 专锁：世界生态自洽审计 —— 四类跨模块一致性、**只报不改**（零 store.transact）、
//   未扫过与扫过干净必须分得开（never-swept）、一类没做成不许冒充「这一类没问题」（section-failed）、
//   审计器自身耗时进 perf-ledger。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const REL = 'engines/eco-audit.js';
const SELF_REL = 'tests/eco-audit-v2154.js';

// 锚点一取「只在链已降到传闻层时才判认知矛盾」这一行：它是**误报闸门** ——
//   链停在事实层时，本人是否亲历不在链上表达；丢了它，正常局面会被当成矛盾天天红。
const ANCHOR = "      if (layer === 'hearsay' || layer === 'rumor') degradedLayer[c.factKey] = layer;";
// 锚点二取空间面的**区间相交**判据。它反了比丢了更坏：
//   恒真 ⇒ 每个人的每条日程都报「同时出现在两处」，自洽审计变成一个只会喊狼来了的表。
const ANCHOR2 = "          if (!(a.start < b.end && b.start < a.end)) continue;";
// 锚点三取 `never-swept` 这一条：「还没扫过」与「扫过是干净的」是两件事 ——
//   丢了它，面板与常规巡视会把一个从未扫过的世界读成「四类都对得上」。
const ANCHOR3 = "    if (!lastRow) return { ok: false, reason: 'never-swept' };";

function countOcc(s, sub) { return s.split(sub).length - 1; }
function fresh(ov) { return sync.fresh(ov ? { srcOverride: ov } : undefined).WA; }

function on(WA) {
  WA.store.init();
  WA.ecoAudit.setSettings({ enabled: true, timelineEnabled: true, spaceEnabled: true,
    cognitionEnabled: true, causalEnabled: true, maxIssues: 40, maxPeople: 60 });
}

/** 造一个四类各自有毛病的世界。返真前先清干净（每轮判据自己造场）。 */
function world(WA) {
  on(WA);
  WA.store.transact(function (d) {
    d.causal = { chains: [
      // 已结算的链，其「原因」是一条**在它之后**才成立的编年史条目 ⇒ link-after
      { id: 'cA', status: 'settled', at: 100, cause: 'entryFuture' },
      // 延迟后果到期早于链建立 ⇒ clock-backward
      { id: 'cB', status: 'open', at: 200, delayed: [{ id: 'dB', dueAt: 50 }] },
      // 原因在世界里查不到 ⇒ cause-broken
      { id: 'cC', status: 'open', at: 300, cause: 'noSuchThing' }
    ], settled: [] };
    d.chronicle = [{ id: 'entryFuture', kind: 'war', title: '未来之战', at: 500 }];
    d.chrono = { entries: [
      { id: 'e1', kind: 'event', at: 900, base: 'e2' },   // 派生条目早于父条目 ⇒ link-after
      { id: 'e2', kind: 'event', at: 100 }
    ] };
    d.people = {
      'p_甲': { id: 'p_甲', name: '甲', life: { schedule: [
        { id: 's1', status: 'active', activity: '议事', location: '衙署', start: 10, end: 50 },
        { id: 's2', status: 'active', activity: '赴宴', location: '东市', start: 40, end: 90 },
        { id: 's3', status: 'done', activity: '旧事', location: '家', start: 10, end: 60 }
      ] },
      // 他记着「事实」，而传播链已降到传闻层且从没让他拿到公开层 ⇒ knowledge-beyond
      knowledge: { 'factX': { route: 'fact' } } }
    };
    d.rumor = { chains: [{ id: 'rm_factX', factKey: 'factX', layer: 'hearsay', hops: [], factValue: 'v' }] };
    d.echoes = [{ id: 'echo1', refCurrent: 'goneCurrent' }];   // 果悬空 ⇒ orphan-effect
  }, 'eco-audit-v2154:world');
}

function codes(r) { return (r.issues || []).map(function (i) { return i.code; }); }

// ── A 结构面 ──────────────────────────────────────────────────────────
function runA(a) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  a(countOcc(src, ANCHOR) === 1, 'v2154/ec A1: 「只在降到传闻层时才判认知」锚点恰中 1 次（实 ' + countOcc(src, ANCHOR) + '）');
  a(countOcc(src, ANCHOR2) === 1, 'v2154/ec A2: 空间相交判据锚点恰中 1 次（实 ' + countOcc(src, ANCHOR2) + '）');
  a(countOcc(src, ANCHOR3) === 1, 'v2154/ec A3: never-swept 判据锚点恰中 1 次（实 ' + countOcc(src, ANCHOR3) + '）');
  a(src.indexOf("WA.registerModule('engines/eco-audit.js'") >= 0, 'v2154/ec A4: 模块自报登记');
  a(src.indexOf('__settingsRegs = (WA.__settingsRegs || []).concat([__REG])') >= 0, 'v2154/ec A5: 设置键走 __settingsRegs 登记');
  // 本模块最贵的边界：**只报不改**。零 store.transact 是它可被安全地放进常规巡视的前提 ——
  //   一个会改世界的「审计器」把「世界为何自洽」本身架空了。
  // 只数**调用点**（注释里的 `store.transact` 是文档，不是写动作；本仓口径「注释不是码」）。
  a(countOcc(src, 'WA.store.transact(') === 0 && countOcc(src, '.transact(') === 0,
    'v2154/ec A6: 零 transact 调用点（只报不改是结构事实，不是承诺）');
  a(src.indexOf("const PERF_SOURCE = '世界自洽审计'") >= 0 && src.indexOf('perfLedger.ingest(') >= 0,
    'v2154/ec A7: 审计器自身耗时进性能台账（源名是显式常量）');
  a(src.indexOf("if (issues.length >= cap) { truncated++; return; }") >= 0,
    'v2154/ec A8: 超上限的行如实记 truncated（不静默丢）');
  const self = fs.readFileSync(path.join(BASE, SELF_REL), 'utf8');
  a(countOcc(self, ANCHOR) >= 1 && countOcc(self, ANCHOR2) >= 1 && countOcc(self, ANCHOR3) >= 1,
    'v2154/ec A9: 三个锚点在本文件里至少各引用 1 次');
}

// ── B 运行时 ──────────────────────────────────────────────────────────
function runB(a) {
  const WA = fresh();
  on(WA);
  const EC = WA.ecoAudit;
  a(!!EC && typeof EC.sweep === 'function' && typeof EC.lastSweep === 'function'
    && typeof EC.stat === 'function' && EC.CATS.length === 4 && Object.keys(EC.LEVEL_OF).length >= 7,
    'v2154/ec B1: sweep / lastSweep / stat 三出口 + 四类闭集 + 级别表在场');

  // B2 从未扫过 ⇒ never-swept（不拿 0 条冒充「干净」）
  a(EC.lastSweep().reason === 'never-swept', 'v2154/ec B2: 从未扫过 ⇒ never-swept（「没扫过」与「扫过是干净的」必须分得开）');

  // B3 关闭态
  EC.setSettings({ enabled: false });
  a(EC.sweep().reason === 'disabled', 'v2154/ec B3: 关闭后拒收（disabled）');
  EC.setSettings({ enabled: true });

  // B4 干净世界：0 条、四类都扫过、且**一个字都没写进存档**
  WA.store.init();
  const snap = JSON.stringify(WA.store.get());
  const clean = EC.sweep();
  a(clean.ok === true && clean.total === 0 && clean.failedSections === 0,
    'v2154/ec B4: 干净世界扫出 0 条（不是扫不动）');
  a(clean.sources.timeline === 'state' && clean.sources.causal === 'causal.knownCause' && clean.sources.cognition === 'none',
    'v2154/ec B4b: 判据来源**随读数一起给出**（谁判的与判了什么同等重要）');
  a(JSON.stringify(WA.store.get()) === snap, 'v2154/ec B5: 全链路不写存档（审计器零副作用是它能进常规巡视的前提）');
  a(clean.rules.timeline === true && clean.rules.space === true && clean.rules.cognition === true && clean.rules.causal === true,
    'v2154/ec B5b: 读数里带出本轮四类开关的真状态');

  // B6 自身耗时进 perf-ledger（需求原话）
  const perf = WA.perfLedger.trend();
  a(perf.rows.some(function (x) { return x.source === EC.PERF_SOURCE; }),
    'v2154/ec B6: 审计器自身耗时进性能台账（源名 ' + EC.PERF_SOURCE + '）');
  a(EC.stat().perfSource === EC.PERF_SOURCE, 'v2154/ec B6b: 台账源名同时向诊断面露出（面板与诊断两处可核对）');

  // B7 四类各自有毛病的世界：六个码全部现形
  world(WA);
  const r = EC.sweep();
  const cs = codes(r);
  a(cs.indexOf('link-after') >= 0, 'v2154/ec B7: 时间线 —— 链引用了它之后才成立的原因 ⇒ link-after');
  a(cs.indexOf('clock-backward') >= 0, 'v2154/ec B7b: 时间线 —— 排期倒挂（到期早于建立）⇒ clock-backward');
  a(cs.indexOf('schedule-overlap') >= 0, 'v2154/ec B8: 空间 —— 同一人的两条活跃日程区间相交 ⇒ schedule-overlap');
  a(cs.filter(function (c) { return c === 'schedule-overlap'; }).length === 1,
    'v2154/ec B8b: 已结束（done）的日程不参与相交（「此刻在两处」才是矛盾）');
  a(cs.indexOf('knowledge-beyond') >= 0, 'v2154/ec B9: 认知 —— 记为「事实」而传播账从没让他拿到公开层 ⇒ knowledge-beyond');
  a(cs.indexOf('cause-broken') >= 0, 'v2154/ec B10: 因果 —— 链声称的原因在世界里查不到了 ⇒ cause-broken');
  a(cs.indexOf('orphan-effect') >= 0, 'v2154/ec B10b: 因果 —— 回声挂在已不在账的暗流上 ⇒ orphan-effect');
  a(r.byCat.timeline >= 2 && r.byCat.space === 1 && r.byCat.cognition === 1 && r.byCat.causal >= 3,
    'v2154/ec B11: 四类各自分账（byCat 与 byCode 两面都随读数给出）');
  a(r.errors >= 3 && r.warns >= 3, 'v2154/ec B11b: 级别不是一律 warn：error 与 warn 真分账（' + r.errors + '/' + r.warns + '）');
  a(r.issues.every(function (i) { return i.code && i.cat && i.level && typeof i.detail === 'string' && i.detail; }),
    'v2154/ec B12: 每条问题自带码/类别/级别/人话明细（只给码的读数没法处理）');
  a(r.issues.every(function (i) { return i.level === (WA.ecoAudit.LEVEL_OF[i.code] || 'warn'); }),
    'v2154/ec B12b: 级别表是单一真源（改级别必须是有意动作）');
  a(EC.lastSweep().ok === true && EC.lastSweep().total === r.total,
    'v2154/ec B13: lastSweep 读的就是上一次那份读数（**不重扫**：常规巡视不该因为看自洽而变重）');

  // B14 截断：超上限的行如实报数
  EC.setSettings({ maxIssues: 4 });
  const t = EC.sweep();
  a(t.total === 4 && t.truncated > 0 && t.issues.length === 4,
    'v2154/ec B14: 超上限的行如实记 truncated（实 ' + t.total + '+' + t.truncated + '）');
  EC.setSettings({ maxIssues: 40 });

  // B15 四类开关：关掉的那一类不进本轮，读数里如实标 off
  EC.setSettings({ timelineEnabled: false, spaceEnabled: false, cognitionEnabled: false, causalEnabled: false });
  const offr = EC.sweep();
  a(offr.rules.timeline === false && offr.sources.timeline === 'off'
    && offr.sources.cognition === 'off' && offr.sources.causal === 'off',
    'v2154/ec B15: 关掉的类如实标 off（不拿「没扫」冒充「没问题」）');
  EC.setSettings({ timelineEnabled: true, spaceEnabled: true, cognitionEnabled: true, causalEnabled: true });

  // B16 一类没做成 ⇒ section-failed + degraded 分账（归零的读数不能冒充「这一类没问题」）
  const keepGet = WA.store.get;
  try {
    WA.store.get = function () {
      const o = {};
      Object.defineProperty(o, 'causal', { get: function () { throw new Error('v2154-probe-boom'); } });
      return o;
    };
    const f = EC.sweep();
    const fc = codes(f);
    a(fc.indexOf('section-failed') >= 0 && f.failedSections >= 1,
      'v2154/ec B16: 某一类抛错 ⇒ section-failed 现形（实 failedSections ' + f.failedSections + '）');
    a(!!EC.stat().degraded.causal, 'v2154/ec B16b: 降级小节按名分账（「哪一类没做成」可归因）');
    a(f.issues.filter(function (i) { return i.code === 'section-failed'; })[0].detail.indexOf('不可信') >= 0,
      'v2154/ec B16c: 该条的明细点名「本类读数不可信」——归零与「没问题」不许长成一样');
  } finally { WA.store.get = keepGet; }

  // B17 bounds
  EC.setSettings({ maxIssues: 9999, maxPeople: 1 });
  const g = EC.getSettings();
  a(g.maxIssues <= 200 && g.maxIssues >= 4, 'v2154/ec B17: maxIssues 越界被收进界内（实 ' + g.maxIssues + '）');
  a(g.maxPeople <= 400 && g.maxPeople >= 4, 'v2154/ec B17b: maxPeople 越界被收进界内（实 ' + g.maxPeople + '）');
  EC.setSettings({ maxIssues: 40, maxPeople: 60 });

  // B18 写口以**运行时现值**为底（两次独立写动作不得互相抹掉）
  EC.setSettings({ enabled: true, causalEnabled: false });
  const keep = EC.getSettings();
  EC.setSettings({ maxIssues: 12 });
  a(EC.getSettings().enabled === true && EC.getSettings().causalEnabled === false,
    'v2154/ec B18: 改一个键不得把另一个独立写动作摸回默认（实 enabled ' + EC.getSettings().enabled + ' / causal ' + EC.getSettings().causalEnabled + '）');
  EC.setSettings({ enabled: keep.enabled, causalEnabled: keep.causalEnabled, maxIssues: keep.maxIssues });

  // B19 拒收进 faults 分桶
  a(WA.ecoAudit.stat().faults['disabled'] >= 1, 'v2154/ec B19: 拒收进 faults 分桶（可归因）');
  a(WA.ecoAudit.stat().sweeps >= 5, 'v2154/ec B19b: 扫描次数累计（台账可对账）');
}

// ── N 负控制（真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据）──
function runNegative(a) {
  const orig = fs.readFileSync(path.join(BASE, REL), 'utf8');

  if (countOcc(orig, ANCHOR) !== 1) throw new Error('N0 锚点未恰中 1 次：' + countOcc(orig, ANCHOR));
  if (countOcc(orig, ANCHOR2) !== 1) throw new Error('N0b 锚点二未恰中 1 次：' + countOcc(orig, ANCHOR2));
  if (countOcc(orig, ANCHOR3) !== 1) throw new Error('N0c 锚点三未恰中 1 次：' + countOcc(orig, ANCHOR3));

  // N1 摘掉「只在降到传闻层时才判」⇒ 认知面必须开始误报（这就是本版点名要防的假阳性）
  const b1 = orig.replace(ANCHOR, "      if (true) degradedLayer[c.factKey] = txt(c.layer, 20) || 'rumor';");
  if (b1 === orig) throw new Error('N1 破坏没有改变源码');
  const WA1 = fresh((function () { const o = {}; o[REL] = b1; return o; })());
  on(WA1);
  WA1.store.transact(function (d) {
    d.people = { 'p_甲': { id: 'p_甲', name: '甲', knowledge: { 'factY': { route: 'fact' } } } };
    // 链停在**事实层**：正常情况下不该判（本人是否亲历根本不在链上表达）
    d.rumor = { chains: [{ id: 'rm_factY', factKey: 'factY', layer: 'fact', hops: [], factValue: 'v' }] };
  }, 'eco-audit-v2154:n1');
  const r1 = WA1.ecoAudit.sweep();
  a(codes(r1).indexOf('knowledge-beyond') >= 0,
    'v2154/ec N1: 摘掉误报闸门后事实层也被判成矛盾（实 ' + JSON.stringify(codes(r1)) + '）—— 判据对破坏敏感');

  // N2 把空间相交判据反成恒真 ⇒ 同人同一条日程也报重叠（假阳性现形）
  const b2 = orig.replace(ANCHOR2, "          if (false) continue;");
  if (b2 === orig) throw new Error('N2 破坏没有改变源码');
  const WA2 = fresh((function () { const o = {}; o[REL] = b2; return o; })());
  on(WA2);
  WA2.store.transact(function (d) {
    // 两条**不相交**的活跃日程：正常世界里它们不该报；判据反成恒真后它们会现形。
    //   注意不能只放一条 —— 单条日程连「一对」都构不成，破坏后也报不出来（首版即本例的假绿）。
    d.people = { 'p_乙': { id: 'p_乙', name: '乙', life: { schedule: [
      { id: 't1', status: 'active', activity: '甲事', location: '甲地', start: 10, end: 50 },
      { id: 't2', status: 'active', activity: '乙事', location: '乙地', start: 60, end: 90 }
    ] } } };
  }, 'eco-audit-v2154:n2');
  const r2 = WA2.ecoAudit.sweep();
  a(codes(r2).filter(function (c) { return c === 'schedule-overlap'; }).length === 1,
    'v2154/ec N2: 相交判据反成恒真后，两条**不重叠**的日程也被报成冲突（实 ' + JSON.stringify(codes(r2)) + '）—— 假阳性现形');

  // N3 摘掉 never-swept ⇒ 未扫过会被读成「干净」（本版点名要防的第二类伪装）
  const b3 = orig.replace(ANCHOR3, "    if (!lastRow) return { ok: true, total: 0, errors: 0, warns: 0, issues: [], sources: {} };");
  if (b3 === orig) throw new Error('N3 破坏没有改变源码');
  const WA3 = fresh((function () { const o = {}; o[REL] = b3; return o; })());
  on(WA3);
  const r3 = WA3.ecoAudit.lastSweep();
  a(r3.ok === true && r3.reason === undefined,
    'v2154/ec N3: 摘掉 never-swept 后未扫过被读成「扫过且干净」（ok ' + r3.ok + '）—— 「没扫」与「干净」真被这条分开');

  // N4 真文件逐字未变
  a(fs.readFileSync(path.join(BASE, REL), 'utf8') === orig, 'v2154/ec N4: 真源码文件逐字未变（破坏只在内存副本）');
}

function runAll(a) { runA(a); runB(a); }
module.exports = { REL, ANCHOR, ANCHOR2, ANCHOR3, runA, runB, runAll, runNegative };

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };
  try { runAll(a); } catch (e) { fail++; console.log('  ✗ 抛出：' + e.message); }
  try { runNegative(a); } catch (e) { fail++; console.log('  ✗ 负控制抛出：' + e.message); }
  console.log('ECO-AUDIT-V2154: pass ' + pass + ' / fail ' + fail);
  process.exit(fail ? 1 : 0);
}

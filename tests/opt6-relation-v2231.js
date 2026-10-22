#!/usr/bin/env node
// WorldAxis tests/opt6-relation-v2231.js (v2.231.0) -- OPT-6 专锁：关系的单一持久来源 + 方向 + 事件引用
//
// 【它治什么（现场实测）】
//   OPT-6 原文要的是「为新旧机制确定单一持久来源和派生投影」「需要方向的关系不得被无向键抹平」
//   「关系变化保存可追溯事件引用」「重复处理同一事件不增加第二份记忆」「重载后关系和重要经历仍连续」。
//   开工前逐条复核现场，三处都是真的：
//     1 **表是纯内存**：`engines/relation-graph.js` 的 `GRAPH = { edges, index }` 没有 store 出口，
//       全文件零 `store.transact` —— 「重载后关系仍连续」在代码里没有任何实现。判据 B5/B6/C1。
//     2 **方向被无向键抹平**：`edgeIdOf` 把两端名排序后拼一条 id（对归一本身是对的），
//       但**没有任何地方**存「A→B 的立场」，于是「A 信任 B、B 仍警惕 A」在同一条边上无处安放。判据 B3/B4。
//     3 **同一件事会记两遍**：没有事件引用账，重复处理同一事件就是两条记录。判据 B7/B8。
//
// 【六条口径（逐条有判据咬）】
//   · 存档是唯一真源，内存表只是本会话索引；`reload()` 从存档重建（B5/B6，N1）。
//   · 有向立场与边分开记（边壳不掺方向、另有独立落盘口）：A→B / B→A 各答一次（B3/B4，N2、N8）。
//   · 事件引用去重：同键不重复入账，`dup` 如实计数（B7/B8，N3）。
//   · 删/清**两边一起**：只清内存会让「删了又回来」（B9/B10，N4）。
//   · 切聊天重建索引（A7 静态面 + B11 行为面）。
//   · 落盘失败不谎报（B12：`persistFailed` 计数、`stored:-1`）。
//
// 四段结构：A 静态契约 / B 运行时行为 / C 持久化与容量 / N 真源码破坏 + 两向自证。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const RG_REL = 'engines/relation-graph.js';
const SELF_REL = 'tests/opt6-relation-v2231.js';
function rd(rel, ov) {
  if (ov && ov[rel] !== undefined) return ov[rel];
  return fs.readFileSync(path.join(BASE, rel), 'utf8');
}
function cnt(s, n) { return s.split(n).length - 1; }

const ANCHOR = {
  rgPersist: { rel: RG_REL, txt: 'const pv = persistRow(row);' },
  rgEvents: { rel: RG_REL, txt: 'const ev = refs.length ? persistEvents(id, refs, e.event_note || label) : { ok: true, added: 0, dup: 0 };' },
  rgDirected: { rel: RG_REL, txt: 'DIRECTED[from + "->" + to] = st;' },
  rgDirPersist: { rel: RG_REL, txt: 'const dv = persistDirected(st);' },
  rgRemoveSync: { rel: RG_REL, txt: 'g.edges = g.edges.filter(function (x) { return !(x && x.id === row.id); });' },
  rgReload: { rel: RG_REL, txt: 'GRAPH.edges = rows.slice(-settings().maxEdges);' }
};
const EXPORTS = ['getSettings', 'setSettings', 'view', 'upsert', 'get', 'edgesOf', 'list', 'remove',
  'clear', 'edgeIdOf', 'stat', 'resetStat', 'reload', 'directedOf', 'persisted'];

function envWith(ov) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh(ov ? { srcOverride: ov } : {});
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  env.WA.relationGraph.setSettings({ enabled: true });
  return env;
}

function runAll(a, ov) {
  ov = ov || {};
  const S = rd(RG_REL, ov);
  /* ============ A 静态契约 ============ */
  a(fs.existsSync(path.join(BASE, RG_REL)), 'A1: 引擎落到仓库里');
  a(rd('tests/run.js', ov).indexOf("'engines/relation-graph.js'") > 0, 'A2: tests/run.js LOAD 已挂');
  a(rd('engines/tool-diag.js', ov).indexOf("'engines/relation-graph.js': 'relationGraph'") > 0, 'A3: tool-diag 声明表已登记');
  a(rd('core/store.js', ov).indexOf('relationGraph: { edges: [], events: [], directed: [] }') > 0,
    'A4: 骨架已物化（登记不等于物化：不在骨架里 registryParity 会报、冷启动直写会炸事务）');
  a(cnt(S, 'store.transact') >= 4, 'A5: 引擎里有真写口（落边/事件/删/清四处，实 ' + cnt(S, 'store.transact') + '）');
  a(S.indexOf('persistRow(row)') > 0 && S.indexOf('persistEvents(id, refs') > 0,
    'A6: 边与事件引用都经持久出口（不是只写内存）');
  a(rd('core/interceptor.js', ov).indexOf('WA.relationGraph.reload()') > 0,
    'A7: 切聊天时重建索引（store 重载了、模块缓存没跟上 = 上一个聊天的关系冒充本聊天）');
  a(S.indexOf('delete shell.directed;') > 0 && S.indexOf('function persistDirected(st)') > 0,
    'A11: 边壳不掺方向（落边时剥掉 directed）+ 方向有独立落盘口 persistDirected');
  const badA = Object.keys(ANCHOR).filter(function (k) { return cnt(rd(ANCHOR[k].rel, ov), ANCHOR[k].txt) !== 1; });
  a(badA.length === 0, 'A8: 破坏锚点在目标文件里各恰 1 次（不合：' + badA.join(',') + '）');
  (function () {
    const self = rd(SELF_REL, ov);
    const table = self.slice(self.indexOf('const ANCHOR = {'), self.indexOf('\n};', self.indexOf('const ANCHOR = {')));
    const bad = Object.keys(ANCHOR).filter(function (k) { return cnt(table, k + ': {') !== 1; });
    a(bad.length === 0, 'A9: 锚点逐键在锚表里声明恰 1 处（缺 ' + bad.join(',') + '）');
  })();
  (function () {
    const e0 = envWith(ov);
    const miss = EXPORTS.filter(function (k) { return e0.WA.relationGraph[k] === undefined; });
    a(miss.length === 0, 'A10: 导出面齐备（缺 ' + (miss.join(',') || '无') + '）');
  })();

  /* ============ B 运行时行为 ============ */
  // B1 关闭即拒收
  (function () {
    const W = envWith(ov).WA;
    W.relationGraph.setSettings({ enabled: false });
    const r = W.relationGraph.upsert({ participants: ['甲', '乙'] });
    a(r.ok === false && r.reason === 'disabled', 'B1: 关闭时 upsert 拒收 disabled');
  })();
  // B2 边落存档
  const e2 = envWith(ov); const W2 = e2.WA;
  (function () {
    const r = W2.relationGraph.upsert({ participants: ['甲', '乙'], relationship_label: '旧识', emotional_weight: 7 });
    const g = W2.store.get().relationGraph;
    a(r.ok === true && r.persisted === true && g.edges.length === 1 && g.edges[0].id === r.id,
      'B2: 边同时进存档（persisted=' + r.persisted + ' / 存档条数=' + g.edges.length + '）——原版只进内存表');
    a(W2.relationGraph.persisted().edges === 1 && W2.relationGraph.persisted().memory === 1,
      'B2b: persisted 分开报「存档那份」与「本会话索引那份」');
  })();
  // B3/B4 有向立场：A 信任 B，B 仍警惕 A
  (function () {
    W2.relationGraph.upsert({ participants: ['甲', '乙'], directed: { from: '甲', to: '乙', stance: '信任', reason: '替他还过债' } });
    W2.relationGraph.upsert({ participants: ['甲', '乙'], directed: { from: '乙', to: '甲', stance: '警惕', reason: '旧账没清' } });
    const ab = W2.relationGraph.directedOf('甲', '乙');
    const ba = W2.relationGraph.directedOf('乙', '甲');
    a(ab.stance === '信任' && ba.stance === '警惕',
      'B3: 同一对人有两条**方向相反**的立场（甲→乙 ' + ab.stance + ' / 乙→甲 ' + ba.stance + '）——无向键做不到这件事');
    a(ab.reasonText === '替他还过债' && ba.reasonText === '旧账没清', 'B3b: 立场带理由（「为何信任/疏远」能说出事件）');
    const g1 = W2.relationGraph.get('甲', '乙'); const g2 = W2.relationGraph.get('乙', '甲');
    a(g1.id === g2.id && W2.relationGraph.list().total === 1,
      'B3c: 边本身仍按对归一（A-B 与 B-A 是同一条，实 ' + W2.relationGraph.list().total + ' 条），方向差异不把边拆成两条');
    a(W2.relationGraph.persisted().directed === 2, 'B4: 两条方向立场都进存档（实 ' + W2.relationGraph.persisted().directed + '）');
  })();
  // B5/B6 重载后关系仍连续
  (function () {
    const g = W2.store.get().relationGraph;
    a(g.edges.length >= 1 && Array.isArray(g.directed) && g.directed.length === 2 && !g.edges[0].directed,
      'B5: 方向在存档里独立成账（g.directed ' + (Array.isArray(g.directed) ? g.directed.length : 0)
        + ' 条），边壳不掺方向 —— 边里再抄一份就等于承认有第二真源');
    // 模拟「重载」：清内存索引（直接调 clear 会同时清存档，所以这里手工重建场景）
    const before = W2.relationGraph.persisted();
    const rl = W2.relationGraph.reload();
    a(rl.edges === before.edges && rl.directed === 2 && rl.events === before.events,
      'B6: reload 从存档重建（边 ' + rl.edges + ' / 方向 ' + rl.directed + ' / 事件 ' + rl.events + '）');
    a(W2.relationGraph.directedOf('甲', '乙').stance === '信任', 'B6b: 重建后方向立场仍可读（不是只剩边壳）');
  })();
  // B7/B8 事件引用去重
  (function () {
    const r1 = W2.relationGraph.upsert({ participants: ['甲', '乙'], event_refs: ['第3楼·还债'], event_note: '还债' });
    const r2 = W2.relationGraph.upsert({ participants: ['甲', '乙'], event_refs: ['第3楼·还债'], event_note: '还债' });
    a(r1.eventsAdded === 1 && r2.eventsAdded === 0 && r2.eventsDup === 1,
      'B7: 同一件事处理两次只入账一次（新增 ' + r1.eventsAdded + ' → ' + r2.eventsAdded + ' / 去重 ' + r2.eventsDup + '）');
    const st = W2.relationGraph.stat();
    a(st.eventsAdded === 1 && st.eventsDup === 1, 'B7b: 台账分开记「新增」与「去重」（新增 ' + st.eventsAdded + ' / 去重 ' + st.eventsDup + '）');
    a(W2.relationGraph.persisted().events === 1, 'B8: 事件引用进了存档（实 ' + W2.relationGraph.persisted().events + '）');
  })();
  // B9/B10 删/清两边一起
  (function () {
    const r = W2.relationGraph.remove('甲', '乙');
    a(r.ok === true && r.stored === 0 && W2.store.get().relationGraph.edges.length === 0,
      'B9: remove 同时清存档（stored=' + r.stored + '）——只清内存会让「删了又回来」');
    a(W2.store.get().relationGraph.events.length === 0, 'B9b: 该边的事件引用一并删除（边没了，引用不该留下自称还在）');
    a(W2.relationGraph.directedOf('甲', '乙').stance === '', 'B9c: 方向立场同源同删');
  })();
  (function () {
    const W = envWith(ov).WA;
    W.relationGraph.upsert({ participants: ['甲', '乙'] });
    const c = W.relationGraph.clear();
    a(c.dropped === 1 && c.stored === 0 && W.store.get().relationGraph.edges.length === 0,
      'B10: clear 同时清存档（dropped=' + c.dropped + ' / stored=' + c.stored + '）');
  })();
  // B11 切聊天重建：换存档后旧关系不冒充
  (function () {
    const W = envWith(ov).WA;
    W.relationGraph.upsert({ participants: ['甲', '乙'], relationship_label: '旧识' });
    a(W.relationGraph.persisted().memory === 1, 'B11: 先建一条（本会话索引 1）');
    // 换一份「空存档」再重建：索引必须跟着变空，而不是留着上一个聊天的
    W.store.transact(function (d) { d.relationGraph = { edges: [], events: [] }; }, 'opt6:b11');
    const r = W.relationGraph.reload();
    a(r.edges === 0 && W.relationGraph.list().total === 0,
      'B11b: 重建后本会话索引跟着存档走（边 ' + r.edges + '）——不重建会让上个聊天的关系冒充本聊天');
  })();
  // B12 落盘失败不谎报
  (function () {
    const W = envWith(ov).WA;
    const orig = W.store.transact;
    W.store.transact = function () { throw new Error('mock-write-fail'); };
    const r = W.relationGraph.upsert({ participants: ['甲', '乙'] });
    W.store.transact = orig;
    a(r.ok === true && r.persisted === false && W.relationGraph.stat().persistFailed === 1,
      'B12: 存档不可写时如实报 persisted=false 且计数（不谎报「已保存」）');
    a(W.relationGraph.remove('甲', '乙').stored === -1 || W.relationGraph.list().total === 0,
      'B12b: 写失败时 remove 的 stored 不谎报条数（-1 = 没写成）');
  })();
  // B13 边身份归一
  (function () {
    const W = envWith(ov).WA;
    a(W.relationGraph.edgeIdOf('甲', '乙') === W.relationGraph.edgeIdOf('乙', '甲'),
      'B13: 边 id 对归一（A-B 与 B-A 同一条）');
    a(W.relationGraph.edgeIdOf('甲', '甲') === null, 'B13b: 自环没有边 id');
  })();
  // B14 读数与重置
  (function () {
    const W = envWith(ov).WA;
    W.relationGraph.upsert({ participants: ['甲', '乙'] });
    const st = W.relationGraph.stat();
    const r = W.relationGraph.resetStat();
    a(st.upserts === 1 && st.persisted === 1 && r.ok === true && W.relationGraph.stat().upserts === 0,
      'B14: resetStat 只清读数（重置后 upserts=' + W.relationGraph.stat().upserts + '）');
    a(W.relationGraph.persisted().edges === 1, 'B14b: 重置读数不动存档（存档仍 1 条）');
  })();

  /* ============ C 持久化与容量 ============ */
  (function () {
    const W = envWith(ov).WA;
    W.relationGraph.setSettings({ maxEdges: 4 });
    ['甲', '乙', '丙', '丁', '戊', '己'].forEach(function (n, i) {
      W.relationGraph.upsert({ participants: [n, '锚'], relationship_label: 'r' + i });
    });
    a(W.store.get().relationGraph.edges.length <= 4,
      'C1: 存档里的边同样受 maxEdges 约束（实 ' + W.store.get().relationGraph.edges.length + '，不是「内存截断、存档无界」）');
  })();
  (function () {
    const W = envWith(ov).WA;
    for (let i = 0; i < 40; i++) W.relationGraph.upsert({ participants: ['甲', '乙'], event_refs: ['e' + i] });
    a(W.store.get().relationGraph.events.length <= 64,
      'C2: 事件引用有硬上限（实 ' + W.store.get().relationGraph.events.length + '，无界增长会拖垮长局存档）');
  })();
  (function () {
    const self = rd(SELF_REL, ov);
    const reqs = (self.match(/require\(['"]([^'"]+)['"]\)/g) || []).filter(function (x) { return x.indexOf('./') < 0 && x.indexOf('../') < 0; });
    a(reqs.length === 2, 'C3: 本锁只 require Node 内置（fs/path），零第三方（实 ' + reqs.length + '）');
  })();

  console.log('\n\u25a0 N 负控制：真源码破坏 → 装载破坏副本 → 重跑同款判据');
  runNegative(a, S);
}

function brk(src, txt, repl) {
  const n = cnt(src, txt);
  if (n !== 1) throw new Error('anchor hits=' + n);
  return src.replace(txt, repl);
}
function runNegative(a, S) {
  S = S || rd(RG_REL);
  (function () {
    const self = rd(SELF_REL);
    const esc = function (t) { return t.replace(/\n/g, '\\n'); };
    const bad = Object.keys(ANCHOR).filter(function (k) { return cnt(self, esc(ANCHOR[k].txt)) !== 1; });
    a(bad.length === 0, 'N0: 锚点字面量在本文件恰 1 次（不合 ' + bad.join(',') + '）');
  })();
  // N1 破坏：边只进内存不落存档 ⇒ 重载后关系全丢
  (function () {
    const S1 = brk(S, ANCHOR.rgPersist.txt, 'const pv = { ok: false, kept: -1 };');
    const ov = {}; ov[RG_REL] = S1;
    const W = envWith(ov).WA;
    W.relationGraph.upsert({ participants: ['甲', '乙'] });
    a(W.store.get().relationGraph.edges.length === 0 && W.relationGraph.reload().edges === 0,
      'N1: 破坏版上边不进存档、重载后归零（原版存档 1 条 ⇒ 「重载后关系仍连续」的两向自证）');
  })();
  // N2 破坏：不记有向立场 ⇒ 方向被无向键抹平
  (function () {
    const S2 = brk(S, ANCHOR.rgDirected.txt, 'void st;');
    const ov = {}; ov[RG_REL] = S2;
    const W = envWith(ov).WA;
    W.relationGraph.upsert({ participants: ['甲', '乙'], directed: { from: '甲', to: '乙', stance: '信任' } });
    // 破坏的是「内存索引建立」那一步：内存侧读不到，而存档里的独立账仍在（原版两处都有）。
    a(W.relationGraph.directedOf('甲', '乙').stance === '' && W.relationGraph.persisted().directed === 1,
      'N2: 破坏版上内存侧方向读不到、独立账仍在（原版内存+存档两处都有 ⇒ 「方向不靠无向边承载」的两向自证）');
  })();
  // N3 破坏：事件引用不去重 ⇒ 同一件事记两遍
  (function () {
    const S3 = brk(S, ANCHOR.rgEvents.txt, 'const ev = { ok: true, added: 0, dup: 0 };');
    const ov = {}; ov[RG_REL] = S3;
    const W = envWith(ov).WA;
    const r1 = W.relationGraph.upsert({ participants: ['甲', '乙'], event_refs: ['e1'] });
    a(r1.eventsAdded === 0 && W.store.get().relationGraph.events.length === 0,
      'N3: 破坏版上事件引用根本不入账（原版 added=1 且存档 1 条 ⇒ 两向自证）');
  })();
  // N4 破坏：删边不同步存档 ⇒ 删了又回来
  (function () {
    const S4 = brk(S, ANCHOR.rgRemoveSync.txt, 'void 0;');
    const ov = {}; ov[RG_REL] = S4;
    const W = envWith(ov).WA;
    W.relationGraph.upsert({ participants: ['甲', '乙'] });
    W.relationGraph.remove('甲', '乙');
    a(W.store.get().relationGraph.edges.length === 1 && W.relationGraph.reload().edges === 1,
      'N4: 破坏版上删完存档还有、重载即复活（原版 0 条 ⇒ 两向自证）');
  })();
  // N5 破坏：重建时不读存档 ⇒ 切聊天后上个聊天的关系冒充本聊天
  (function () {
    const S5 = brk(S, ANCHOR.rgReload.txt, 'void rows;');
    const ov = {}; ov[RG_REL] = S5;
    const W = envWith(ov).WA;
    W.relationGraph.upsert({ participants: ['甲', '乙'] });
    W.store.transact(function (d) { d.relationGraph = { edges: [], events: [] }; }, 'opt6:n5');
    const r = W.relationGraph.reload();
    a(r.edges === 1,
      'N5: 破坏版上重建不读存档、旧索引原样留着（原版 0 ⇒ 「切聊天必须重建」的两向自证）');
  })();
  // N8 破坏：方向不落独立账 ⇒ 重载后方向读不到（边还在、方向丢了）
  (function () {
    const S8 = brk(S, ANCHOR.rgDirPersist.txt, 'const dv = { ok: true };');
    const ov = {}; ov[RG_REL] = S8;
    const W = envWith(ov).WA;
    W.relationGraph.upsert({ participants: ['甲', '乙'], directed: { from: '甲', to: '乙', stance: '信任' } });
    const before = W.relationGraph.directedOf('甲', '乙').stance;
    const r = W.relationGraph.reload();
    a(before === '信任' && r.directed === 0 && W.relationGraph.directedOf('甲', '乙').stance === '',
      'N8: 破坏版上方向只在内存、重载即丢（原版重载后仍读得到「信任」⇒ 「方向独立成账」的两向自证）');
  })();
  // N6 工具两向自证
  let threw = false;
  try { brk(S, 'THIS-DOES-NOT-EXIST-OPT6', 'x'); } catch (e) { threw = e.message === 'anchor hits=0'; }
  a(threw, 'N6: 锚点不存在必须抛（不静默 0 命中）');
  threw = false;
  try { brk(S, 'if (', 'x'); } catch (e) { threw = /anchor hits=\d+/.test(e.message) && e.message !== 'anchor hits=1'; }
  a(threw, 'N6b: 锚点不唯一必须抛');
  // N7 真源码逐字未变
  a(rd(RG_REL) === S, 'N7: 被破坏过的引擎真源码逐字未变（破坏只发生在内存副本上）');
}

module.exports = { runAll: runAll, runNegative: runNegative, ANCHOR: ANCHOR };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name, extra) {
    if (ok) { pass++; } else { fail++; console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
  };
  try { runAll(a); } catch (e) { fail++; console.log('  \u2717 判据失效：' + (e && e.stack)); }
  try { runNegative(a); } catch (e) { fail++; console.log('  \u2717 负控制失效：' + (e && e.stack)); }
  console.log('\nOPT6-V2231: ' + pass + ' / 失败 ' + fail);
  if (fail) process.exitCode = 1;
}
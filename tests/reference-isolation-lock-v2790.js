#!/usr/bin/env node
// WorldAxis tests/reference-isolation-lock-v2790.js — 读面活引用隔离锁（v2.79.0 第十三面续）
//
// 治的病（与 v2.79.0 主面同族，方向在读侧）
//   写路径都有准入：declare 查 bad-weight、retire 查存在性、setProfileSafe 有分节剪裁与
//   关系硬边界。但这些准入**只对走写路径的人有效**。一旦某个「只读」接口把 store 内部的
//   对象/数组**原样交出去**，任何消费方顺手写一下返回值就等于直接改持久态 —— 世界变了、
//   却没有经过任何一道校验，也没有留下任何一次事务记录（txStat 不计、stateRev 不推进，
//   于是「改过了」这件事在诊断面上完全不可见，下次读盘/冲突检测还会认为一切正常）。
//
//   这类缺陷的共同形状不是「函数忘了 clon」，而是「这个接口的返回面被当成只读面在用，
//   而它实际上是一条**没上锁的写通道**」。本锁把 5 个已知站点逐一点名并钉住：
//     engines/editor-events.js    WA.editorEvents.list()
//     engines/editor-faction.js   WA.editorFaction.list()
//     engines/rivalry.js          WA.rivalry.read(target).rivalries
//     actors/registry.js          WA.registry.getProfile(name)
//     engines/parallel-world.js   WA.parallelWorld.state() 的 npcs/relations/modules
//
// 本锁两个方向都证明：
//   A 结构：五处返回面都在场，且五处都含元素级拷贝的**实测特征**（不是注释里提过）。
//   B 现场：逐站点行为实测 —— 改返回值不得改持久态（播种后写，再逐字回读 store 比对）。
//   C 实质：真源码破坏（把拷贝退化为直接引用）⇒ 行为判据必须现形。
//   D 非空转：空容器上不许「恒不泄露」地假绿（判据必须在有内容的种子上跑）。
//   E 无副作用：不污染真源码、不留临时文件、宿主全局零残骸。
'use strict';

const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const crypto = require('crypto');

// ── 站点登记：rel + 拷贝特征锚点（破坏时把它退化成直接引用） ──
const SITES = [
  { rel: 'engines/editor-events.js', api: 'editorEvents.list',
    copyAnchor: 'const c = {};', breakInto: 'const c = e;' },
  { rel: 'engines/editor-faction.js', api: 'editorFaction.list',
    copyAnchor: 'const c = {};', breakInto: 'const c = f;' },
  { rel: 'engines/rivalry.js', api: 'rivalry.read',
    copyAnchor: 'const c = {};', breakInto: 'const c = r;' },
  { rel: 'actors/registry.js', api: 'registry.getProfile',
    copyAnchor: 'const out = {};', breakInto: 'const out = src;' },
  { rel: 'engines/parallel-world.js', api: 'parallelWorld.state',
    copyAnchor: 'const copyArr = function (a) {', breakInto: 'const copyArr = function (a) { return a;' }
];

/** store 上的目标子树摘要（只看被读面暴露的那部分，避免无关字段噪音）。 */
function persist() {
  const s = WAstore();
  return JSON.stringify({
    ev: (s.evolution && s.evolution.events) || null,
    fa: (s.evolution && s.evolution.factions) || null,
    rv: (s.rivalry && s.rivalry.rows) || null,
    pf: s.people || null,
    pw: (s.parallelWorld && { npcs: s.parallelWorld.npcs, relations: s.parallelWorld.relations, modules: s.parallelWorld.modules }) || null
  });
}
function WAstore() { return global.WorldAxis.store.get(); }

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts || {}).WA; }

function isolated(fn) {
  const LS = global.localStorage;
  const snap = [];
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null) { snap.push([k, LS.getItem(k)]); } }
  const WA0 = global.WorldAxis;
  const origLog = WA0 && WA0.log;
  if (WA0) { WA0.log = function () {}; }
  try { return fn(); }
  finally {
    if (WA0 && origLog) { WA0.log = origLog; }
    const drop = [];
    for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null && !snap.some(function (x) { return x[0] === k; })) { drop.push(k); } }
    drop.forEach(function (k) { try { LS.removeItem(k); } catch (e) {} });
    snap.forEach(function (x) { try { LS.setItem(x[0], x[1]); } catch (e) {} });
  }
}

// ── 播种：每个站点都必须有「真内容」的种子，否则空容器上判据恒真（假绿）──
function seed(WA) {
  WA.editorEvents.setEditingId(null);
  // 注：editor-events / editor-faction 的 add 是 (state, input) 双参签名，
  //   必须走事务拿 draft（与 run.js 的既有用法一致），否则第一参被当 state。
  const e1 = WA.store.transact(function (d) { return WA.editorEvents.add(d, { type: 'conflict', name: '甲事件', desc: '种' }); });
  const e2 = WA.store.transact(function (d) { return WA.editorEvents.add(d, { type: 'progress', name: '乙事件', desc: '种' }); });
  const f1 = WA.store.transact(function (d) { return WA.editorFaction.add(d, { name: '甲势力', scope: 'S', currentGoal: '种目标', powerPillars: ['支柱甲'], core_person: '阿甲' }); });
  WA.rivalry.setSettings({ enabled: true });
  WA.rivalry.declare('阿甲', '阿乙', '焦点壹', 40);
  if (WA.registry && WA.registry.register) { WA.registry.register('阿甲'); }
  if (WA.registry && WA.registry.setProfileSafe) {
    WA.registry.setProfileSafe('阿甲', { personality: ['沉默寡言'], worldview: ['看惯了人来人往'] });
  }
  WA.parallelWorld.setSettings({ enabled: true });
  let npc = null;
  try { npc = WA.parallelWorld.addNpc({ name: '平行者甲', note: '种' }); } catch (err) { npc = null; }
  return { e1: e1, e2: e2, f1: f1, npc: npc };
}

// ── 逐站点行为探针：读 → 改返回值 → 回读持久态，返回是否泄露 ──
/**
 * 每个 case 返回 { name, seeded, mutated, leaked, seededCount }。
 *   leaked === true  ⇒ 读面把持久态交出去了（缺陷现形）。
 *   seededCount === 0 ⇒ 该 case 没播到种，判据在空容器上跑（假绿风险，必须红灯）。
 */
function probeLeaks(WA) {
  const rows = [];
  const s0 = seed(WA);

  // ① editorEvents.list()
  (function () {
    const list = WA.editorEvents.list();
    const before = persist();
    let mutated = false;
    if (list.length && list[0] && typeof list[0] === 'object') {
      list[0].name = '被改过的名字';
      list[0].desc = '被改过的描述';
      if (Array.isArray(list[0].stageLog)) { list[0].stageLog.push({ stage: 'x' }); }
      mutated = true;
    }
    rows.push({ name: 'editorEvents.list', seededCount: list.length, mutated: mutated,
                leaked: mutated && persist() !== before });
  }());

  // ② editorFaction.list()
  (function () {
    const list = WA.editorFaction.list();
    const before = persist();
    let mutated = false;
    if (list.length && list[0] && typeof list[0] === 'object') {
      list[0].currentGoal = '被改过的目标';
      if (Array.isArray(list[0].powerPillars)) { list[0].powerPillars.push('被塞进去的支柱'); }
      mutated = true;
    }
    rows.push({ name: 'editorFaction.list', seededCount: list.length, mutated: mutated,
                leaked: mutated && persist() !== before });
  }());

  // ③ rivalry.read(target).rivalries
  (function () {
    const r = WA.rivalry.read('焦点壹');
    const arr = (r && r.rivalries) || [];
    const before = persist();
    let mutated = false;
    if (arr.length && arr[0] && typeof arr[0] === 'object') {
      arr[0].weight = 99;
      mutated = true;
    }
    rows.push({ name: 'rivalry.read', seededCount: arr.length, mutated: mutated,
                leaked: mutated && persist() !== before });
  }());

  // ④ registry.getProfile(name)
  (function () {
    const p = WA.registry.getProfile('阿甲');
    const before = persist();
    let mutated = false;
    const n = (p && Array.isArray(p.personality)) ? p.personality.length : 0;
    if (n) {
      p.personality.push({ text: '被塞进来的性格', at: 1 });
      if (p.personality[0] && typeof p.personality[0] === 'object') { p.personality[0].text = '被改过的性格'; }
      if (p.persona && typeof p.persona === 'object') { p.persona.locked = true; }
      mutated = true;
    }
    rows.push({ name: 'registry.getProfile', seededCount: n, mutated: mutated,
                leaked: mutated && persist() !== before });
  }());

  // ⑤ parallelWorld.state()
  (function () {
    const st = WA.parallelWorld.state();
    const arr = (st && st.npcs) || [];
    const before = persist();
    let mutated = false;
    if (arr.length && arr[0] && typeof arr[0] === 'object') {
      arr[0].name = '被改过的平行者';
      mutated = true;
    }
    rows.push({ name: 'parallelWorld.state', seededCount: arr.length, mutated: mutated,
                leaked: mutated && persist() !== before });
  }());

  return rows;
}

/** 同一数组引用判据：读面回来的数组不得与 store 内数组同一身份。 */
function probeIdentity(WA) {
  seed(WA);
  const s = WAstore();
  const out = {};
  out.editorEvents = (function () {
    const a = WA.editorEvents.list();
    const b = (s.evolution && s.evolution.events) || [];
    return { same: a === b, anyElemShared: a.length > 0 && b.length > 0 && a[0] === b[0] };
  }());
  out.editorFaction = (function () {
    const a = WA.editorFaction.list();
    const b = (s.evolution && s.evolution.factions) || [];
    return { same: a === b, anyElemShared: a.length > 0 && b.length > 0 && a[0] === b[0] };
  }());
  out.rivalry = (function () {
    const a = (WA.rivalry.read('焦点壹') || {}).rivalries || [];
    const b = (s.rivalry && s.rivalry.rows) || [];
    const hit = b.filter(function (x) { return x && x.target === '焦点壹'; })[0];
    return { same: a === b, anyElemShared: !!hit && a[0] === hit };
  }());
  out.getProfile = (function () {
    const a = WA.registry.getProfile('阿甲');
    const b = (s.people && s.people['p_阿甲'] && s.people['p_阿甲'].profile) || null;
    return { same: a === b, anyElemShared: !!(b && a && a.personality === b.personality) };
  }());
  out.pwState = (function () {
    const a = WA.parallelWorld.state() || {};
    const b = (s.parallelWorld && s.parallelWorld.npcs) || [];
    return { same: a.npcs === b, anyElemShared: a.npcs && a.npcs.length > 0 && b.length > 0 && a.npcs[0] === b[0] };
  }());
  return out;
}

// ── 结构面：五处返回面都在场 ──
function surface() {
  const r = { present: [], missing: [], anchors: [] };
  SITES.forEach(function (s) {
    const src = fs.readFileSync(path.join(BASE, s.rel), 'utf8');
    if (fs.existsSync(path.join(BASE, s.rel))) { r.present.push(s.rel + ' :: ' + s.api); } else { r.missing.push(s.rel); }
    const n = src.split(s.copyAnchor).length - 1;
    r.anchors.push({ rel: s.rel, anchor: s.copyAnchor, hits: n });
  });
  return r;
}

// ── A 结构 / B 现场 ──
function runAll(a) {
  // A 结构
  const surf = surface();
  a(surf.missing.length === 0, 'v2790: [A] 五个读面站点文件都在场（缺 ' + JSON.stringify(surf.missing) + '）');
  surf.anchors.forEach(function (x) {
    a(x.hits >= 1, 'v2790: [A] ' + x.rel + ' 含元素级拷贝特征「' + x.anchor + '」（实 ' + x.hits + ' 次；拷贝必须在场，不能只写在注释里）');
  });
  a(typeof probeLeaks === 'function' && typeof probeIdentity === 'function',
    'v2790: [A] 探针导出面完整（probeLeaks / probeIdentity）');

  // B 现场（行为）：改返回值不得改持久态
  const rows = isolated(function () { return probeLeaks(fresh()); });
  const noSeed = rows.filter(function (r) { return r.seededCount === 0; });
  a(noSeed.length === 0,
    'v2790: [B] 每个站点都被播到种（空容器上「不泄露」恒真 = 假绿；未播种：' + JSON.stringify(noSeed.map(function (r) { return r.name; })) + '）');
  const unmutated = rows.filter(function (r) { return !r.mutated; });
  a(unmutated.length === 0,
    'v2790: [B] 每个站点都真动了返回值（没动 = 判据没执行；未动：' + JSON.stringify(unmutated.map(function (r) { return r.name; })) + '）');
  const leaked = rows.filter(function (r) { return r.leaked; });
  a(leaked.length === 0,
    'v2790: [B] 改读面返回值不得改持久态（实泄露：' + JSON.stringify(leaked.map(function (r) { return r.name; })) + '）');

  // B2 身份判据：返回值不得与 store 内同一身份
  const id = isolated(function () { return probeIdentity(fresh()); });
  const shared = Object.keys(id).filter(function (k) { return id[k].same || id[k].anyElemShared; });
  a(shared.length === 0, 'v2790: [B2] 读面不交回 store 内部身份（同数组或同元素；实：' + JSON.stringify(shared) + '）');
}

// ── C 实质 / D 非空转 / E 无副作用 ──
function runNegative(a) {
  const files0 = fs.readdirSync(path.join(BASE, 'tests')).sort().join(',');
  const hashes0 = {};
  SITES.forEach(function (s) {
    hashes0[s.rel] = crypto.createHash('sha256').update(fs.readFileSync(path.join(BASE, s.rel))).digest('hex').slice(0, 16);
  });

  // C0 前置：每个破坏锚点在真源码里恰 1 次（否则破坏会打偏）
  SITES.forEach(function (s) {
    const src = fs.readFileSync(path.join(BASE, s.rel), 'utf8');
    const n = src.split(s.copyAnchor).length - 1;
    a(n === 1, 'v2790: [C0] 破坏锚点在 ' + s.rel + ' 里恰 1 次（实 ' + n + '）——打偏的破坏等于没破坏');
  });

  // C1 真源码破坏（内存副本）⇒ 行为判据必须现形
  SITES.forEach(function (s) {
    const src = fs.readFileSync(path.join(BASE, s.rel), 'utf8');
    const broken = src.split(s.copyAnchor).join(s.breakInto);
    a(broken !== src, 'v2790: [C1] ' + s.rel + ' 的破坏副本确实与原文不同（锚点真命中）');
    const WA = isolated(function () { return fresh({ srcOverride: {} }); });
    const WA2 = isolated(function () {
      const ov = {}; ov[s.rel] = broken;
      return fresh({ srcOverride: ov });
    });
    const rows = isolated(function () { return probeLeaks(WA2); });
    const hit = rows.filter(function (r) { return r.name === s.api; })[0];
    a(hit && hit.leaked === true,
      'v2790: [C1] 摘掉 ' + s.rel + ' 的元素级拷贝 ⇒ 该读面重新泄露持久态（实 ' + JSON.stringify(hit) + '）');
    a(WA && WA2, 'v2790: [C1] 原版与破坏副本都能装载（对比基准在场）');
  });

  // C2 判据纯度：原版上同款行为判据必须为「不泄露」（不是恒假/恒真）
  const okRows = isolated(function () { return probeLeaks(fresh()); });
  a(okRows.every(function (r) { return r.leaked === false; }),
    'v2790: [C2] 原版上零泄露（判据纯度；实 ' + JSON.stringify(okRows.map(function (r) { return r.name + ':' + r.leaked; })) + '）');

  // D 非空转
  a(surface().anchors.every(function (x) { return x.hits >= 1; }),
    'v2790: [D1] 结构判据读的是真源码内容（锚点命中 ≥1，不是常量）');
  const empty = isolated(function () {
    const WA = fresh();
    const rows = probeLeaks(WA);
    return rows.map(function (r) { return r.seededCount; });
  });
  a(empty.every(function (n) { return n > 0; }),
    'v2790: [D1] 即使新实例上播种也必须生效（实播种数 ' + JSON.stringify(empty) + '）——播种逻辑不空转');

  // E 无副作用
  a(fs.readdirSync(path.join(BASE, 'tests')).sort().join(',') === files0,
    'v2790: [E] 测试目录未被污染（无临时/备份文件）');
  SITES.forEach(function (s) {
    const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(BASE, s.rel))).digest('hex').slice(0, 16);
    a(h === hashes0[s.rel], 'v2790: [E] ' + s.rel + ' 未被改写（破坏只发生在内存副本上）');
  });
  const surf = require('./test-surface-gate.js').scan({});
  a(surf.locks.indexOf('tests/reference-isolation-lock-v2790.js') >= 0,
    'v2790: [E] 本锁真在可达面里（不是孤儿）');
  a(surf.orphans.indexOf('tests/reference-isolation-lock-v2790.js') < 0, 'v2790: [E] 本锁不在孤儿名单里');
  a(surf.globalResidue === 0, 'v2790: [E] 宿主全局面零残骸（实 ' + surf.globalResidue + '）');
}

module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative),
  SITES: SITES, probeLeaks: probeLeaks, probeIdentity: probeIdentity, surface: surface
};

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { require('./mock.js'); require('./ui-gate-sync.js').fresh({}); runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('REFERENCE-ISOLATION-LOCK-V2790: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('REFERENCE-ISOLATION-LOCK-V2790: pass (' + pass + ')');
}

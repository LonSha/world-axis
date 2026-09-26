#!/usr/bin/env node
// WorldAxis tests/reject-lock-v2780.js -- 拒收码可达性专锁（v2.78.0 第十二面）
//
// 治的病（回）
//   v2.77.0 学到的口径是「码存在 ≠ 码可达」。本版把它工业化为**带可执行见证**的门禁：
//   产品源码里的每一个内联 `reason: '<code>'`，必须落入三者之一——
//     ① witnessed：有可执行见证（runWitness 用真 API 把它真跑出来，见 reject-v2780.js）；
//     ② dead：已证不可达，且带着**可复算的锚点**（锚点在源码里消失 ⇒ 该码可能复活 ⇒ 红灯）；
//     ③ base：本盘点的存量未分类集合，冻结在 reject-code-ledger.json。
//   三者之外出现新码 ⇒ 红灯；台账里的码被接上见证或已从源码消失 ⇒ 台账冗余，同样红灯。
//   ——两向都要红：只判一头的台账会慢慢变成一份没人读的名单（或者悄悄比现实胖）。
//
// 判断即证据（本版抓到的三类真缺陷，全部由探针坐实）：
//   · 非法数守卫失效：`typeof x === 'number'` 对 NaN/±Infinity **恒真** ⇒ NaN 落盘并进注入段
//     （实测修前 gauge 注入 `NaN%`、rivalry 注入 `烈度: NaN`；配额存龄 NaN 更让记录**永不过期**）。
//   · 读面回传活引用：`editorEvents.list()` 返回的就是 store 里那个数组 ⇒ 改返回值即改持久态，
//     绕过 add 的全部校验（上限/查重/字段）。修前 `list() === store.evolution.events` 为真。
//   · 不可达/不可分码：`bad-operator` 词法层永远到不了；`bad-weight` 对非数输入被静默降级 50；
//     `gauge.step` 把「delta 不是数」并进 missing-fields（两个根因在诊断面不可分）。
//
// 本锁做的是**证明门禁有两个方向、且判据不是恒真**：
//   A 结构：门禁/见证表/台账的导出面与三名词表都在场。
//   B 现场：真仓库上面 audit 绿，且 52 + 1 + 211 = 264 与扫描面严丝合缝。
//   C 实质：每条判据都做真源码破坏（内存副本）→ 必须现形；且锚点恰中 1 次。
//   D 非空转：空面/无见证/去注释面三处不恒真。
//   E 无副作用：不污染真源码、不留临时文件、不动宿主全局。
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BASE = path.join(__dirname, '..');
const gate = require('./reject-code-gate.js');
const witness = require('./reject-v2780.js');
const LEDGER_PATH = path.join(__dirname, 'reject-code-ledger.json');

function sha(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16); }
function loadLedger() { return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')); }
function ledgerMap(led) { const m = {}; (led.base || []).forEach(function (c) { m[c] = true; }); return m; }

/** 内存覆盖读：在真源码上做定点破坏，判据在副本上重跑（真破坏，零文件改写）。 */
function withOver(rel, from, to) {
  const raw = fs.readFileSync(path.join(BASE, rel), 'utf8');
  if (raw.split(from).length - 1 !== 1) throw new Error('anchor hits != 1 :: ' + rel + ' :: ' + from.slice(0, 60));
  const broken = raw.split(from).join(to);
  return function (r) { return r === rel ? broken : fs.readFileSync(path.join(BASE, r), 'utf8'); };
}
// ── 破坏表（每条锚点取自产品源码，各恰 1 次）──
const BROKEN = [
  // ① 非法数守卫族：把 isFinite 摘掉 = 退回修前的「typeof number 即合法」形态
  { key: 'gauge-nan', rel: 'engines/gauge.js',
    from: "if (!isFinite(delta)) return { ok: false, reason: 'bad-delta', got: delta };",
    to: "if (false) return { ok: false, reason: 'bad-delta', got: delta };",
    why: '摘掉 gauge.step 的有限数守卫 ⇒ NaN 重新落盘并进注入段（`NaN%`）' },
  { key: 'rivalry-nan', rel: 'engines/rivalry.js',
    from: "if (typeof w !== 'number' || !isFinite(w) || w < 0 || w > 100) return { ok: false, reason: 'bad-weight', got: weight };",
    to: "if (w < 0 || w > 100) return { ok: false, reason: 'bad-weight', got: weight };",
    why: '退回修前形态：非数 weight 落进 NaN 比较（两条都要假）⇒ 静默放行，NaN 入账' },
  { key: 'quota-nan', rel: 'engines/quota.js',
    from: "r.age = ((typeof r.age === 'number' && isFinite(r.age)) ? r.age : 0) + 1;",
    to: "r.age = (typeof r.age === 'number' ? r.age : 0) + 1;",
    why: '退回修前形态：存量 age 是 NaN 时 age>=limit 恒假 ⇒ 该记录**永不过期**' },
  // ② 读面活引用族：把拷贝摘掉 = 读面重新返回 store 内部**元素对象**
  //   v2.79.0 口径升级：v2.78.0 锚的是 `return state ? arr : arr.slice(); }`（防的是改数组结构），
  //   本版读面已改为逐元素浅拷贝，那条锚点自然消失。新锚点锚「拷贝动作本身」——
  //   摘掉它，元素级别名通道重新打开（`list()[0].name = 'x'` 即改持久态）。
  { key: 'ee-alias', rel: 'engines/editor-events.js',
    from: "      const c = {};",
    to: "      const c = e;",
    why: 'editorEvents.list() 逐元素拷贝被摘成引用直传 ⇒ 元素级活引用重新打开（改返回值即改持久态）' },
  { key: 'ef-alias', rel: 'engines/editor-faction.js',
    from: "      const c = {};",
    to: "      const c = f;",
    why: 'editorFaction.list() 同款：元素级拷贝被摘，且 powerPillars 的再拷一层随之失效' },
  // ③ 死表锚点：不可达码的「为何不可达」被改掉 ⇒ 它可能在别处复活而无人知
  { key: 'dead-anchor', rel: 'engines/kaleidoscope.js',
    from: "else return { ok: false, reason: 'bad-operator', detail: v };",
    to: "else return { ok: false, reason: 'no-such-operator', detail: v };",
    why: '不可达锚点被改名 ⇒ deadLeak 必须报警（码或锚点消失都要可见）' }
];

// ── 探针（返回判据的**症状值**，便于双向对照）──
function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function freshOver(rel, from, to) { return fresh({ srcOverride: (function () { const ov = {}; ov[rel] = fs.readFileSync(path.join(BASE, rel), 'utf8').split(from).join(to); return ov; })() }); }
function nonFiniteIn(o, depth) {
  const out = [];
  (function walk(x, p, d) {
    if (d > 8) return;
    if (typeof x === 'number') { if (!isFinite(x)) out.push(p + '=' + String(x)); return; }
    if (x && typeof x === 'object') { Object.keys(x).forEach(function (k) { try { walk(x[k], p + '.' + k, d + 1); } catch (e) {} }); }
  })(o, 'store', 0);
  return out;
}
// 症状 A：gauge 把 NaN 当合法步长 ⇒ 落盘并进注入段
function probeGaugeNaN(WA) {
  WA.gauge.setSettings({ enabled: true });
  WA.gauge.create('p');
  const r = WA.gauge.step('p', NaN, 'ev');
  const blk = WA.gauge.buildBlock();
  return { reason: r.reason, val: String(WA.gauge.read('p').val), injectsNaN: /NaN/.test(blk), nf: nonFiniteIn(WA.store.get(), 0) };
}
// 症状 B：rivalry 对非数 weight 静默放行（NaN 入账）
function probeRivalryNaN(WA) {
  WA.rivalry.setSettings({ enabled: true });
  const r = WA.rivalry.declare('na', 'nb', 'nt', NaN);
  const blk = WA.rivalry.buildBlock();
  return { reason: r.reason, ok: r.ok, injectsNaN: /NaN/.test(blk), nf: nonFiniteIn(WA.store.get(), 0) };
}
// 症状 C：配额存龄 NaN ⇒ 永不过期（推 30 轮仍 active）
function probeQuotaNaN(WA) {
  WA.quota.setSettings({ enabled: true, shortAge: 2 });
  WA.quota.add('short', '存龄探针');
  WA.store.transact(function (d) { (d.quota.rows || []).forEach(function (r) { r.age = NaN; }); }, 'lock:nan-seed');
  let expired = 0;
  for (let i = 0; i < 30; i++) { const t = WA.quota.tick(); if (t && t.expired) expired += t.expired; }
  const row = (WA.store.get().quota.rows || []).filter(function (r) { return r.text === '存龄探针'; })[0];
  return { expired: expired, status: row ? String(row.status) : 'gone', age: row ? String(row.age) : 'none' };
}
// 症状 D：读面是否回传 store 内部**元素对象**（改返回值 = 改持久态）
//   v2.79.0 口径升级：v2.78.0 只探「回传的是不是同一个数组」（改数组结构即入账），
//   本版探**元素级**——`list()[0] === store.evolution.events[0]`。
//   为什么必须升级探针：只探数组身份的探针，在「独立数组 + 共享元素」的实现上恒绿（假绿），
//   而那条通路恰恰绕过 update 的全部准入（枚举/上限/长度/非空）。
function probeAlias(WA, which) {
  // 元素级判据要求容器里**至少有一条**——空容器上「元素级泄露」恒为 undefined，
  // 那是判据的输入面太窄（假绿），不是产品没问题。故先播种一条再探。
  const seedEvent = { id: 'al_seed', type: 'conflict', name: '播种事件', level: 1, stage: '筹备', stageRound: 1, desc: '' };
  const seedFaction = { id: 'al_seed', name: '播种势力', scope: '城', status: '稳固', relation: '中立', currentGoal: '摸底', core_person: '某人', powerPillars: ['军'] };
  WA.store.transact(function (d) {
    if (!d.evolution) d.evolution = {};
    if (!Array.isArray(d.evolution.events)) d.evolution.events = [];
    if (!Array.isArray(d.evolution.factions)) d.evolution.factions = [];
    if (which === 'events' && !d.evolution.events.some(function (x) { return x && x.id === 'al_seed'; })) d.evolution.events.push(Object.assign({}, seedEvent));
    if (which === 'factions' && !d.evolution.factions.some(function (x) { return x && x.id === 'al_seed'; })) d.evolution.factions.push(Object.assign({}, seedFaction));
  }, 'lock:alias-seed');
  const st = WA.store.get();
  const arr = which === 'events' ? (st.evolution && st.evolution.events) : (st.evolution && st.evolution.factions);
  const got = which === 'events' ? WA.editorEvents.list() : WA.editorFaction.list();
  if (!arr || !arr.length) return { aliased: null, why: '播种后仍无容器' };
  if (!got || !got.length) return { aliased: null, why: '读面为空' };
  const sameArray = got === arr;
  // 元素级别名：改返回值里的条目，看持久态是否跟着变
  const target = which === 'events' ? 'name' : 'currentGoal';
  const before = arr[0][target];
  const probe = '__alias__' + target;
  try { got[0][target] = probe; } catch (e) {}
  const leakedField = arr[0][target] === probe;
  if (leakedField) arr[0][target] = before;   // 还原，别把探针的写入留在 store 里
  // 结构级别名：push 会不会进 store 容器
  const lenBefore = arr.length;
  try { got.push({ __alias__: true }); } catch (e) {}
  const grew = arr.length !== lenBefore;
  return { aliased: leakedField || grew, elementLeak: leakedField, storeGrew: grew, sameArray: sameArray };
}
// 症状 E：死表锚点在场性（不可达码的「为何不可达」是否还在）
function probeDeadAnchor(read) {
  const a = witness.DEAD['bad-operator'].anchor;
  return read('engines/kaleidoscope.js').indexOf(a) >= 0;
}

// ── runAll：A 结构 / B 现场（真源码上必须为真）──
function runAll(a) {
  // A 结构
  a(typeof gate.scan === 'function' && typeof gate.audit === 'function' && typeof gate.productFiles === 'function',
    'v2780: [A] 门禁导出 scan()/audit()/productFiles()');
  a(typeof witness.runWitness === 'function' && witness.DEAD && typeof witness.DEAD === 'object',
    'v2780: [A] 见证表导出 runWitness() 与非空 DEAD 表');
  a(gate.FACE.indexOf('strip-comments') >= 0,
    'v2780: [A] 扫描面自称「去注释」（判据的输入面与结论面同宽）');
  const led = loadLedger();
  a(Array.isArray(led.base) && led.base.length > 100 && typeof led._note === 'string' && led.version === '2.97.0',
    'v2780: [A] 台账形状（base ' + led.base.length + ' 条 / version ' + led.version + ' / 带 _note）');
  a(led._note.indexOf('两向') >= 0 && led._note.indexOf('去注释') >= 0,
    'v2780: [A] 台账自称两向判据 + 去注释扫描面（把口径写进台账，防后人换口径）');

  // B 现场
  const sc = gate.scan();
  const codes = Object.keys(sc.hits).sort();
  const w = witness.runWitness(global.WorldAxis);
  const base = ledgerMap(led);
  const r = gate.audit({ witnessed: w.expect, dead: witness.DEAD, base: base });
  a(r.files === sc.files.length && r.files >= 100, 'v2780: [B] 产品面够大（' + r.files + ' 文件）');
  a(codes.length >= 200, 'v2780: [B] 内联拒收码面够大（' + codes.length + ' 个）');
  a(w.missing.length === 0, 'v2780: [B] 见证零缺失（实 ' + JSON.stringify(w.missing) + '）——有见证却说跑不出的码即红灯');
  a(w.unexpected.length === 0, 'v2780: [B] 见证零意外（实 ' + JSON.stringify(w.unexpected) + '）——冒出来的新码必须显式归类');
  a(r.unclassified.length === 0 && r.deadMissing.length === 0 && r.deadLeak.length === 0,
    'v2780: [B] 现场零回车面（未分类 ' + r.unclassified.length + ' / 死表消失 ' + r.deadMissing.length + ' / 锚点漂移 ' + r.deadLeak.length + '）');
  a(r.baseStale.length === 0, 'v2780: [B] 台账不冗余（实 ' + r.baseStale.length + '）——防台账永久比现实胖');
  a(r.witnessed + r.dead + r.base === r.total,
    'v2780: [B] 三集合划分穷尽且互斥（' + r.witnessed + '+' + r.dead + '+' + r.base + '=' + r.total + '）');
  a(codes.indexOf('bad-operator') >= 0, 'v2780: [B] 不可达码仍在源码里（不删，只登记）');
  const deadSet = Object.keys(witness.DEAD);
  a(deadSet.every(function (c) { return codes.indexOf(c) >= 0; }), 'v2780: [B] 死表每一项都真在源码里（不是幽灵条目）');
  a(deadSet.every(function (c) { return !(c in w.expect); }), 'v2780: [B] 死表与见证表不相交（同一个码不能既可达又不可达）');
  a(codes.every(function (c) { return (c in w.expect) || deadSet.indexOf(c) >= 0 || (c in base); }),
    'v2780: [B] 每个码都落在三类之一（没有第三个归宿）');

  // B2 判据实质：探针在真源码上必须是「已修好」的症状
  const g = isolated(function () { return probeGaugeNaN(fresh()); });
  a(g.reason === 'bad-delta' && g.val === '0' && g.injectsNaN === false && g.nf.length === 0,
    'v2780: [B2] gauge 拒收 NaN（reason ' + g.reason + ' / 值 ' + g.val + ' / 注入含 NaN ' + g.injectsNaN + ' / 落盘非有限 ' + g.nf.length + '）');
  const rv = isolated(function () { return probeRivalryNaN(fresh()); });
  a(rv.reason === 'bad-weight' && rv.injectsNaN === false && rv.nf.length === 0,
    'v2780: [B2] rivalry 拒收 NaN 烈度（reason ' + rv.reason + ' / 注入含 NaN ' + rv.injectsNaN + '）');
  const qt = isolated(function () { return probeQuotaNaN(fresh()); });
  a(qt.expired > 0 && qt.status === 'expired', 'v2780: [B2] 配额存龄可正常过期（NaN 归零后 age 推进；expired ' + qt.expired + ' / status ' + qt.status + '）');
  const ea = isolated(function () { return probeAlias(fresh(), 'events'); });
  const fa = isolated(function () { return probeAlias(fresh(), 'factions'); });
  a(ea.aliased === false && ea.storeGrew === false, 'v2780: [B2] editorEvents.list() 读面不回传内部数组（alias ' + ea.aliased + ' / 入账 ' + ea.storeGrew + '）');
  a(fa.aliased === false && fa.storeGrew === false, 'v2780: [B2] editorFaction.list() 同款（alias ' + fa.aliased + ' / 入账 ' + fa.storeGrew + '）');
  a(probeDeadAnchor(function (rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }) === true,
    'v2780: [B2] 不可达码的锚点仍在源码里（不可达结论可复算，不是凭记忆）');
}

// ── runNegative：C 实质 / D 非空转 / E 无副作用 ──
function runNegative(a) {
  const files0 = fs.readdirSync(path.join(BASE, 'tests')).sort().join(',');
  const hashes0 = {};
  ['tests/reject-lock-v2780.js', 'tests/reject-code-gate.js', 'tests/reject-v2780.js', 'tests/reject-code-ledger.json'].forEach(function (rel) { hashes0[rel] = sha(path.join(BASE, rel)); });

  // C0 前置：锚点在真源码里各恰 1 次（否则破坏没落在热路径上，后面全是假绿）
  BROKEN.forEach(function (s) {
    const hits = fs.readFileSync(path.join(BASE, s.rel), 'utf8').split(s.from).length - 1;
    a(hits === 1, 'v2780: [C0] 锚点恰 1 次 :: ' + s.key + '（实 ' + hits + '）');
  });

  // C1 逐条现形：破坏后同一份判据必须变红
  const gB = BROKEN[0], rvB = BROKEN[1], qtB = BROKEN[2], eeB = BROKEN[3], efB = BROKEN[4], daB = BROKEN[5];
  const gBad = isolated(function () { return probeGaugeNaN(freshOver(gB.rel, gB.from, gB.to)); });
  a(gBad.reason !== 'bad-delta' && gBad.injectsNaN === true && gBad.nf.length > 0,
    'v2780: [C1] 摘掉有限数守卫 ⇒ gauge 把 NaN 当合法步长（reason ' + gBad.reason + ' / 注入含 NaN ' + gBad.injectsNaN + ' / 落盘非有限 ' + gBad.nf.length + '）');
  const rvBad = isolated(function () { return probeRivalryNaN(freshOver(rvB.rel, rvB.from, rvB.to)); });
  a(rvBad.reason !== 'bad-weight' && rvBad.nf.length > 0,
    'v2780: [C1] 退回修前形态 ⇒ rivalry 放行 NaN 烈度并入库（reason ' + rvBad.reason + ' / 落盘非有限 ' + rvBad.nf.length + '）');
  const qtBad = isolated(function () { return probeQuotaNaN(freshOver(qtB.rel, qtB.from, qtB.to)); });
  a(qtBad.expired === 0 && qtBad.status === 'active',
    'v2780: [C1] 退回修前形态 ⇒ 存龄 NaN 使记录永不过期（expired ' + qtBad.expired + ' / status ' + qtBad.status + '）');
  const eBad = isolated(function () { return probeAlias(freshOver(eeB.rel, eeB.from, eeB.to), 'events'); });
  a(eBad.elementLeak === true, 'v2780: [C1] 摘掉逐元素拷贝 ⇒ editorEvents 读面回传内部元素（元素级泄露 ' + eBad.elementLeak + ' / 数组同身份 ' + eBad.sameArray + '）');
  const fBad = isolated(function () { return probeAlias(freshOver(efB.rel, efB.from, efB.to), 'factions'); });
  a(fBad.elementLeak === true, 'v2780: [C1] editorFaction 同款（元素级泄露 ' + fBad.elementLeak + ' / 数组同身份 ' + fBad.sameArray + '）');

  // C2 死表锚点漂移 ⇒ 判据必须点名（用内存覆盖读跑同一份 audit）
  const readOv = withOver(daB.rel, daB.from, daB.to);
  a(probeDeadAnchor(readOv) === false, 'v2780: [C2] 前置：覆盖读下锚点确实不在（实 ' + probeDeadAnchor(readOv) + '）');
  const scOv = gate.scan({ read: readOv });
  a(scOv.hits['bad-operator'] === undefined, 'v2780: [C2] 改名后 bad-operator 已不在扫描面');
  const w = witness.runWitness(global.WorldAxis);
  const rOv = gate.audit({ read: readOv, witnessed: w.expect, dead: witness.DEAD, base: ledgerMap(loadLedger()) });
  a(rOv.deadMissing.indexOf('bad-operator') >= 0, 'v2780: [C2] 死表码从源码消失 ⇒ 点名（实 ' + JSON.stringify(rOv.deadMissing) + '）');
  a(rOv.ok === false, 'v2780: [C2] 且总判据转红（judge 不是「只看 unclassified」）');

  // D 非空转
  const rEmpty = gate.audit({ read: function () { return ''; }, witnessed: {}, dead: {}, base: {} });
  a(rEmpty.total === 0 && rEmpty.files === gate.productFiles().length,
    'v2780: [D1] 空源码面上 total=0 而文件数照旧（判据读的是内容，不是文件名）');
  const readD2 = withOver('engines/gauge.js', 'const MILESTONES = [25, 50, 75, 100];', "const MILESTONES = [25, 50, 75, 100]; if (false) return { ok: false, reason: 'brand-new-code' };");
  const rNew = gate.audit({ read: readD2, witnessed: w.expect, dead: witness.DEAD, base: ledgerMap(loadLedger()) });
  a(rNew.unclassified.indexOf('brand-new-code') >= 0, 'v2780: [D2] 新增未分类码即红灯并点名（实 ' + JSON.stringify(rNew.unclassified) + '）');
  const led = loadLedger();
  const witnessPlus = Object.assign({}, w.expect);
  witnessPlus[led.base[0]] = '本版新接上的见证';
  const rStale = gate.audit({ witnessed: witnessPlus, dead: witness.DEAD, base: ledgerMap(led) });
  a(rStale.baseStale.indexOf(led.base[0]) >= 0, 'v2780: [D3] 台账里的码一旦被见证 ⇒ 报台账冗余并点名（实 ' + JSON.stringify(rStale.baseStale) + '）');
  const readD4 = withOver('engines/gauge.js', 'const MILESTONES = [25, 50, 75, 100];', "const MILESTONES = [25, 50, 75, 100];  // 示例：reason: 'comment-only-code'");
  const scD4 = gate.scan({ read: readD4 });
  a(scD4.hits['comment-only-code'] === undefined, 'v2780: [D4] 注释里写的 reason 不算码（提及不是引用）');
  a(gate.scan().hits['pull'] === undefined, 'v2780: [D4] 真仓库上 bridge.js 的调用示例也不再被算成码（初审 265 里 1 条是注释）');

  // E 无副作用
  const files1 = fs.readdirSync(path.join(BASE, 'tests')).sort().join(',');
  a(files0 === files1, 'v2780: [E] 测试目录未被污染（无临时/备份文件）');
  Object.keys(hashes0).forEach(function (rel) {
    a(sha(path.join(BASE, rel)) === hashes0[rel], 'v2780: [E] ' + rel + ' 内容未被改写（破坏只发生在内存副本上）');
  });
  // [E] 挂载面：本锁必须真在可达面里（不是「文件在、从不执行」的孤儿），也不在豁免名单上。
  //   为什么不用 globalResidueProbe 单独探本锁：那个探针在**裸 mock 环境**里 require 并跑 runAll，
  //   而本锁（如 v2.70.0 起的各锁）需要已装载的产品面才跑得动 —— 裸环境里抛异常会被记成「残骸」，
  //   那是探针的输入面太窄，不是本锁的问题（同类锁全部不在该探针名单里，口径一致）。
  const surf = require('./test-surface-gate.js').scan({});
  a(surf.locks.indexOf('tests/reject-lock-v2780.js') >= 0, 'v2780: [E] 本锁真在可达面里（不是孤儿：' + (surf.locks.indexOf('tests/reject-lock-v2780.js') >= 0) + '）');
  a(surf.orphans.indexOf('tests/reject-lock-v2780.js') < 0, 'v2780: [E] 本锁不在孤儿名单里');
  a(surf.globalResidue === 0, 'v2780: [E] 宿主全局面零残骸（既有四锁探针实 ' + surf.globalResidue + '）');
}

/** 隔离：每个探针用自己的 localStorage 快照与环境，互不污染（与 v2.70.0 同款）。 */
function isolated(fn) {
  const LS = global.localStorage;
  const snap = {};
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null) snap[k] = LS.getItem(k); }
  const WA0 = global.WorldAxis;
  const origLog = WA0 && WA0.log;
  if (WA0) WA0.log = function () {};
  try { return fn(); }
  finally {
    if (WA0 && origLog) WA0.log = origLog;
    const drop = [];
    for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null && !(k in snap)) drop.push(k); }
    drop.forEach(function (k) { try { LS.removeItem(k); } catch (e) {} });
    Object.keys(snap).forEach(function (k) { try { LS.setItem(k, snap[k]); } catch (e) {} });
  }
}

// v2.75.0 纪律：锁必须经 restoring 包装——宿主全局（global.window 等）不靠顺序活着。
module.exports = { runAll: require('./lock-assert.js').restoring(runAll), runNegative: require('./lock-assert.js').restoring(runNegative), BROKEN: BROKEN };

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { require('./mock.js'); require('./ui-gate-sync.js').fresh({}); runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('REJECT-LOCK-V2780: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('REJECT-LOCK-V2780: pass (' + pass + ')');
}

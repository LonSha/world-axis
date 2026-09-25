#!/usr/bin/env node
// WorldAxis tests/identity-v2860.js —— v2.86.0（A3 事实唯一写者）
//
// 【它治的病：同一条事实有五个写者，谁写的看不出来】
//   「人物条目」（store.people[id]）此前有 **五个** 创建点：
//     engines/life.js 的 person()、engines/intel.js 的 releaseDue 与 addIntel、
//     engines/backstage.js 的人物合并与认知边界入账、actors/registry.js 的 setProfileSafe。
//   五处各写各的 `draft.people[id] = { id, name, knowledge: {} }` —— 结构逐字相同，
//   于是「这个条目是谁建出来的」在运行时**完全不可见**：
//     · 是推演结算建的，还是生活引擎自己造的？答不出；
//     · 有没有人又加第六个创建点、绕开统一口径？也答不出。
//
//   本版口径（治理「发散」，不治理「创建」）：
//     · 创建只此一处 —— actors/registry.js 的 ensurePerson(draft, id, name, via)；
//     · 每次**新建**都打来源标签 createdVia / createdAt；
//     · 五个调用点全部改为委托（自动建人的行为一个字都没收紧）；
//     · 无 registry 的合成宿主桩仍能自建，但标签带 ':fallback' 后缀 ——
//       于是「产品运行时到底走没走唯一写者」这件事本身可被断言。
//   曾试过更硬的一版（写路径不得凭空造人，未知 id 直接拒收），实测撞 24 条既有契约
//   （life-v2520 / settle-v2650 / evict-meta-v2610 / registry-identity-v2620），已回滚：
//   **把「创建」判成病是错的，把「看不见谁创建的」判成病才对。**
//
// 【判据】（A 静态 / B 运行时 / C 兜底 / N 负控制）
//   A1 唯一写者：registry 真源码里「往 people 表落新行」恰 1 次。
//   A2 残点清点：产品面「直接建人」的字面残点恰 4 处（三处 fallback 兜底 + 1 处注释）。
//   A3 残点性质：每一处代码残点都**打 fallback 标签**（不是裸建）。
//   A4 调用点形态：每个 ensurePerson 调用都在能力探测守卫内（缺 registry 时降级，不抛）。
//   A5 观测出口有真消费方：tool-diag 的模块节读 personOriginStat。
//   A6 付了接口面的价：两个新成员都在接口冻结串里登记。
//   B1 新建语义；B2 幂等且不覆盖；B3 拒收不落行；B4 五个调用点各归其位；
//   B5 读数与事实同源；B6 未标注行可见；B7 两处出口同一读数。
//   C1–C3 无 registry 的合成宿主桩：三条兜底路径都带 :fallback。
//   N0 五个破坏锚点在真源码各恰 1 次；N1 破坏 ⇒ 对应判据现形且只它现形；
//      N2 原版同款判据仍绿；N3 破坏幂等 ⇒ B2 运行时现形；N4 非恒真。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const gate = require('./ui-gate-sync.js');
const inv = require('./inventory.js');

const REG = path.join(BASE, 'actors/registry.js');
const EC = path.join(BASE, 'tests/export_contract.txt');
/** 真源码面（逐字） */
function regSrc() { return fs.readFileSync(REG, 'utf8'); }
function fileSrc(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function countIn(s, x) { return s.split(x).length - 1; }

// ── 破坏锚点（工具两向自证：各须在真源码恰中 1 次）──
const ANCHOR_ROW = 'draft.people[key] = p;';
const ANCHOR_TAG = "p.createdVia = String(via || 'unknown').slice(0, 40);";
const ANCHOR_IDEM = "if (row && typeof row === 'object') return { ok: true, isNew: false, row: row };";
const ANCHOR_NAME = "if (!key || key === 'p_') return { ok: false, reason: 'missing-name' };";
const ANCHOR_DRAFT = "if (!draft || typeof draft !== 'object') return { ok: false, reason: 'bad-draft' };";

/** 判据（可复用：真源码与破坏副本上跑的是**同一份**函数） */
function judgeSingleWriter(src) { return countIn(src, ANCHOR_ROW) === 1; }
function judgeLabeled(src) { return countIn(src, ANCHOR_TAG) === 1; }
function judgeIdempotent(WA) {
  const d = { people: {} };
  const r1 = WA.registry.ensurePerson(d, 'p_丙', '丙', 'probe');
  const r2 = WA.registry.ensurePerson(d, 'p_丙', '丙改名', 'probe2');
  return !!(r1 && r1.isNew === true && r2 && r2.isNew === false
    && d.people['p_丙'].name === '丙' && d.people['p_丙'].createdVia === 'probe');
}
function judgeLabelAtRuntime(WA) {
  const d = { people: {} };
  WA.registry.ensurePerson(d, 'p_丁', '丁', 'probe');
  return d.people['p_丁'].createdVia === 'probe';
}
/** 产品面「直接往 people 表塞新行」的字面残点（跳过注释行） */
function directCreates() {
  const RE = /\.people\[[^\]]+\]\s*=\s*\{/;
  const hits = [];
  inv.PRODUCT_FILES.forEach(function (rel) {
    fileSrc(rel).split('\n').forEach(function (l, i) {
      const t = l.trim();
      if (t.indexOf('*') === 0 || t.indexOf('//') === 0) return;
      if (RE.test(l)) hits.push({ rel: rel, line: i + 1, text: t });
    });
  });
  return hits;
}
function peopleCount(WA) { return Object.keys(WA.store.get().people || {}).length; }

function runAll(a) {
  // ───────────────────────── A 面：静态 ─────────────────────────
  {
    const s = regSrc();
    a(judgeSingleWriter(s), 'v2860/id: [A1] 唯一写者：registry 真源码里落新行恰 1 次（实 '
      + countIn(s, ANCHOR_ROW) + '）');
    a(judgeLabeled(s), 'v2860/id: [A1] 新建必打来源标签（实 ' + countIn(s, ANCHOR_TAG) + ' 次）');
    const dc = directCreates();
    a(dc.length === 4, 'v2860/id: [A2] 产品面「直接建人」残点恰 4 处（实 ' + dc.length + '：'
      + dc.map(function (h) { return h.rel + ':' + h.line; }).join('、') + '）');
    const unlabeled = dc.filter(function (h) { return h.text.indexOf('fallback') < 0; });
    a(unlabeled.length === 0, 'v2860/id: [A3] 每处残点都打 fallback 标签，不是裸建（裸: '
      + (unlabeled.map(function (h) { return h.rel + ':' + h.line; }).join('、') || '无') + '）');
    const guards = [
      { rel: 'engines/life.js', needle: "typeof reg.ensurePerson === 'function'" },
      { rel: 'engines/intel.js', needle: "typeof reg.ensurePerson === 'function'" },
      { rel: 'engines/backstage.js', needle: 'WA.registry && WA.registry.ensurePerson' }
    ];
    const noguard = guards.filter(function (g) { return fileSrc(g.rel).indexOf(g.needle) < 0; });
    a(noguard.length === 0, 'v2860/id: [A4] 三个引擎的调用点都在能力探测守卫内（缺: '
      + (noguard.map(function (g) { return g.rel; }).join('、') || '无') + '）');
    a(fileSrc('engines/tool-diag.js').indexOf('personOriginStat') > 0,
      'v2860/id: [A5] tool-diag 模块节读 personOriginStat（观测出口没人读就是死导出）');
    const ec = fs.readFileSync(EC, 'utf8');
    a(ec.indexOf('ensurePerson') > 0 && ec.indexOf('personOriginStat') > 0,
      'v2860/id: [A6] 两个新成员都在接口冻结串里登记（不登记 = 偷偷扩面）');
  }
  // ───────────────────────── B 面：运行时语义 ─────────────────────────
  {
    const WA = gate.fresh({}).WA;
    a(typeof WA.registry.ensurePerson === 'function' && typeof WA.registry.personOriginStat === 'function',
      'v2860/id: [B1] 唯一写者与观测出口都在接口面上');
    const d = { people: {} };
    const r1 = WA.registry.ensurePerson(d, 'p_甲', '甲', 'probe');
    a(r1 && r1.ok === true && r1.isNew === true && r1.row === d.people['p_甲'],
      'v2860/id: [B1] 新建：ok/isNew=true 且返回的就是落进去的那一行');
    a(d.people['p_甲'].createdVia === 'probe' && d.people['p_甲'].createdAt > 0,
      'v2860/id: [B1] 新建：来源与时间都留痕（via=' + d.people['p_甲'].createdVia
      + ' at=' + d.people['p_甲'].createdAt + '）');
    a(judgeIdempotent(WA), 'v2860/id: [B2] 幂等：已存在则原样返回，name/标签一字不改');
    const n0 = Object.keys(d.people).length;
    const bad = WA.registry.ensurePerson(null, 'p_甲', '甲', 'probe');
    const miss = WA.registry.ensurePerson(d, 'p_', '甲', 'probe');
    a(bad.ok === false && bad.reason === 'bad-draft' && miss.ok === false && miss.reason === 'missing-name',
      'v2860/id: [B3] 拒收码归位（bad-draft / missing-name）');
    a(Object.keys(d.people).length === n0,
      'v2860/id: [B3] 拒收时**不落行**（实 ' + Object.keys(d.people).length + ' vs ' + n0 + '）');
  }
  {
    const WA = gate.fresh({}).WA;
    // 显式复位：fresh() 复用同一个 global.WorldAxis，store 可能带着前面用例的遗留行
    WA.store.transact(function (d) { d.people = {}; }, 'v2860id:init');
    const g = WA.life.addGoal('戊', { text: '试试' });
    const it = WA.intel.addIntel('己', { claim: '听说', source: '路人', level: 'rumor' });
    WA.store.transact(function (dr) {
      dr.intelQueue = [{ id: 'iq1', person: '庚', claim: 'c', source: 's', level: 'rumor',
        confidence: 40, status: 'suspected', due: 1, at: 1 }];
    }, 'v2860id:q');
    const rel = WA.intel.releaseDue(9999999999999);
    WA.store.transact(function (dr) {
      WA.backstage.applyResult(dr, {
        people: [{ name: '辛', location: '家' }],
        knowledge_updates: [{ person: '壬', about: '某件事', status: 'fact' }]
      }, null);
    }, 'v2860id:bs');
    const st = WA.store.get();
    const want = { 'p_戊': 'life', 'p_己': 'intel:add', 'p_庚': 'intel:release',
      'p_辛': 'backstage', 'p_壬': 'backstage' };
    const wrong = Object.keys(want).filter(function (k) {
      return !st.people[k] || st.people[k].createdVia !== want[k];
    });
    a(g.ok === true && it.ok === true && rel.ok === true && rel.released === 1,
      'v2860/id: [B4] 五条路径本身都跑通（life=' + g.ok + ' intel=' + it.ok
      + ' release=' + rel.released + '）');
    a(wrong.length === 0, 'v2860/id: [B4] 五个调用点都走唯一写者且各归其位（不符: '
      + (wrong.map(function (k) { return k + '=' + ((st.people[k] || {}).createdVia || '缺失'); }).join('、') || '无') + '）');
    const o = WA.registry.personOriginStat();
    const sum = Object.keys(o.byVia).reduce(function (n, k) { return n + o.byVia[k]; }, 0);
    a(o.rows === Object.keys(st.people).length && sum === o.rows,
      'v2860/id: [B5] 读数与事实同源（rows=' + o.rows + ' 实存=' + Object.keys(st.people).length
      + ' byVia 合计=' + sum + '）');
    a(o.unlabeledCount === 0, 'v2860/id: [B5] 五条路径建出的行**无一未标注**（实 '
      + o.unlabeledCount + '）——这就是「没人绕开写者」的现场证据');
    a(Object.keys(o.createdThisRun).length > 0, 'v2860/id: [B5] 本次进程新建计数非空（'
      + Object.keys(o.createdThisRun).join('、') + '）');
    const sm = WA.toolDiag.secModules();
    a(sm && sm.personOrigin && sm.personOrigin.rows === o.rows
      && sm.personOrigin.unlabeledCount === o.unlabeledCount,
      'v2860/id: [B7] registry 与 tool-diag 读到的是同一份读数（不各算一份）');
  }
  {
    const WA = gate.fresh({}).WA;
    WA.store.transact(function (d) { d.people = { p_旧: { id: 'p_旧', name: '旧', knowledge: {} } }; }, 'v2860id:old');
    const o = WA.registry.personOriginStat();
    a(o.unlabeledCount === 1 && o.unlabeled.indexOf('p_旧') >= 0,
      'v2860/id: [B6] 旧存档条目（无标签）被点名（unlabeled=' + o.unlabeled.join(',') + '）');
    a(o.byVia['(未标注)'] === 1, 'v2860/id: [B6] 未标注行在分组里单列，不被算进任何来源');
  }
  // ───────────────────────── C 面：合成宿主桩兜底 ─────────────────────────
  {
    const WA = gate.fresh({}).WA;
    WA.store.transact(function () { }, 'v2860id:fb');
    const keep = WA.registry;
    WA.registry = undefined;
    const g = WA.life.addGoal('癸', { text: 't' });
    const it = WA.intel.addIntel('子', { claim: 'c', source: 's', level: 'rumor' });
    WA.store.transact(function (dr) { WA.backstage.applyResult(dr, { people: [{ name: '丑' }] }, null); }, 'v2860id:fb2');
    const st = WA.store.get();
    WA.registry = keep;
    a(g.ok === true && it.ok === true, 'v2860/id: [C1] 缺 registry 时降级不抛（life=' + g.ok + ' intel=' + it.ok + '）');
    const via = function (k) { return st.people[k] && st.people[k].createdVia; };
    a(via('p_癸') === 'life:fallback', 'v2860/id: [C1] life 兜底标签（实 ' + via('p_癸') + '）');
    a(via('p_子') === 'intel:add:fallback', 'v2860/id: [C2] intel 兜底标签（实 ' + via('p_子') + '）');
    a(via('p_丑') === 'backstage:fallback', 'v2860/id: [C3] backstage 兜底标签（实 ' + via('p_丑') + '）');
    a(String(via('p_癸')).indexOf(':fallback') > 0 && String(via('p_子')).indexOf(':fallback') > 0
      && String(via('p_丑')).indexOf(':fallback') > 0,
      'v2860/id: [C3] 三条兜底路径**都可从标签分辨**（产品运行时走没走唯一写者是可断言的）');
  }
}
/** 负控制：真源码破坏 → 在破坏副本上重跑**同款**判据 */
function runNegative(a) {
  const s = regSrc();
  const anchors = [
    { name: '落行', x: ANCHOR_ROW }, { name: '标签', x: ANCHOR_TAG },
    { name: '幂等早退', x: ANCHOR_IDEM }, { name: '缺名', x: ANCHOR_NAME },
    { name: '坏草稿', x: ANCHOR_DRAFT }
  ];
  const notOne = anchors.filter(function (h) { return countIn(s, h.x) !== 1; });
  a(notOne.length === 0, 'v2860/id: [N0] 五个破坏锚点在真源码各恰中 1 次（异常: '
    + (notOne.map(function (h) { return h.name + '=' + countIn(s, h.x); }).join('、') || '无') + '）');
  a(judgeSingleWriter(s) && judgeLabeled(s), 'v2860/id: [N2] 原版上同款判据为真（判据纯度）');
  const bTag = s.replace(ANCHOR_TAG, "p.createdVia = '';");
  a(bTag !== s, 'v2860/id: [N1] 破坏确实改写了源码（新建不再打标签）');
  a(judgeLabeled(bTag) === false, 'v2860/id: [N1] 破坏后「新建必打标签」现形');
  a(judgeSingleWriter(bTag) === true, 'v2860/id: [N1] 该破坏不牵连「唯一写者」那条判据（逐锚敏感）');
  {
    // 顺序要紧：fresh() 复用同一个 global.WorldAxis，后一次装载会覆盖前一个 WA 的模块引用。
    //   故原版侧必须在建破坏副本**之前**把读数算完（否则读到的也是破坏行为）。
    const WAo = gate.fresh({}).WA;
    WAo.store.transact(function (d) { d.people = {}; }, 'v2860id:n4o');
    WAo.life.addGoal('寅', { text: 't' });
    const okUn = WAo.registry.personOriginStat().unlabeledCount;
    const okLabeled = judgeLabelAtRuntime(WAo);
    const WAb = gate.fresh({ srcOverride: { 'actors/registry.js': bTag } }).WA;
    WAb.store.transact(function (d) { d.people = {}; }, 'v2860id:n4b');
    WAb.life.addGoal('寅', { text: 't' });
    const badUn = WAb.registry.personOriginStat().unlabeledCount;
    a(okUn === 0 && badUn === 1,
      'v2860/id: [N4] 非恒真：原版未标注 ' + okUn + ' / 破坏后 ' + badUn + '（读数确实随事实变化）');
    a(okLabeled === true && judgeLabelAtRuntime(WAb) === false,
      'v2860/id: [N1] 运行时判据两向自证：原版打标签 / 破坏副本不打（不只静态面）');
  }
  const bIdem = s.replace(ANCHOR_IDEM, '// v2860id N3: 幂等早退被移除');
  a(bIdem !== s, 'v2860/id: [N3] 幂等锚点破坏确实改写了源码');
  {
    const WAo = gate.fresh({}).WA;
    const okIdem = judgeIdempotent(WAo);   // 先算后建：避免被下一次装载覆盖
    const WAb = gate.fresh({ srcOverride: { 'actors/registry.js': bIdem } }).WA;
    a(okIdem === true && judgeIdempotent(WAb) === false,
      'v2860/id: [N3] 幂等判据两向自证（原版真 / 破坏副本假）——不是靠原版活着');
  }
  const bRow = s.replace(ANCHOR_ROW, 'draft.people[key] = Object.assign(p, {});');
  a(bRow !== s && judgeSingleWriter(bRow) === false && judgeSingleWriter(s) === true,
    'v2860/id: [N1] 「唯一写者」判据逐锚敏感（破坏落行锚 ⇒ 现形）');
}
module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative)
};

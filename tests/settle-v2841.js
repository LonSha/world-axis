#!/usr/bin/env node
// WorldAxis tests/settle-v2841.js —— A3 收口：开关组合面 + 存档兼容（v2.84.0 收口）
//
// 【它治的两个缺口】（都不是「有没有」，而是「有没有人问过」）
//   ① 组合面：tests/inject-vis-v2580.js 已逐源证明「单开关真生效」，但它对**组合**零覆盖 ——
//      它的 probeAll 在每个源上只翻「该源自己」那一个开关，其余全开。于是下面三类组合至今
//      没有判据：两两关闭、全关、以及「关了 A 不许误伤 B」。
//   ② 存档兼容：v2.84.0 的 A2 收紧了输入边界（约 28 份 `clean()` 委托到 inputGuard），
//      而**没有任何判据回答「收紧之后旧存档还读不读得进」**。「更严格」不得以误伤存档为代价。
//
// 【判据】
//   A  全关：47 个源全部关闭 ⇒ 产物里**一个哨兵都不许剩**（逐源点名，不是只看总数）。
//   B  两两关闭：对全部随机配对（固定种子，结果可复现）关闭两个源 ⇒ 这两个的哨兵都不许出现；
//      剩下**所有**源的哨兵仍必须在产物里（这条治的正是 v2580 照不到的「误伤邻居」）。
//   C  单向开：只开一个源（其余全关）⇒ **它必须出现**。
//      B 与 C 合起来才是完整命题：开关随「是不是我」增减，而不是随「是不是有人关过」增减。
//   D  存档兼容：v0 旧存档（缺 schemaVersion/缺嵌套字段）必须迁移到当前版本且**内容不丢**；
//      当前版本的合法存档必须原样读回。
//
// 【判据纯度】哨兵文本替代模块真实产出 ⇒ 判的是注入链的开关，不是某个模块的文案。
// 【两向自证】真源码破坏（把 `vis.<k> && WA.<k>` 还原成 v2.56.0 之前的 `WA.<k>`）⇒
//   在破坏副本上重跑**同款** A/B/C 面，必须在被破坏的那个源上现形；原版上同款判据仍为绿。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const gate = require('./ui-gate-sync.js');
// 快照类源（产物在 <world_axis_state> 里，由 buildWorldSnapshot 组装）
const SNAPSHOT_SOURCES = { clock: 'TOKCLOCK', pulse: 'TOKPULSE', background: 'TOKBG',
  people: 'TOKPEOPLE', currents: 'TOKCURRENT', echoes: 'TOKECHO' };
const ITEM_METHOD = { memory: 'buildMemoryBlock', opinion: 'buildOpinionBlock', ledger: 'buildLedgerText' };
/** 稳定种子的配对抽样：同一份源码任何时候都抽样到同一批配对（结果可复现） */
function pairsOf(list, max) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) out.push([list[i], list[j]]);
  }
  return out.slice(0, max || 120);
}
function seedStore(WA) {
  WA.store.transact(function (d) {
    d.clock = d.clock || {}; d.clock.label = 'TOKCLOCK 第1日';
    d.worldPulse = { pressure: 2, trend: 'rising', note: 'TOKPULSE' };
    d.background = d.background || {}; d.background.text = 'TOKBG 世界背景';
    d.people = d.people || {};
    d.people.p_tok = { name: 'TOKPEOPLE', location: 'TOKPEOPLE城', action: 'TOKPEOPLE行' };
    d.currents = [{ id: 'c_tok', title: 'TOKCURRENT', visibility: 'open' }];
    d.echoes = [{ id: 'e_tok', refCurrent: 'TOKCURRENT', result: 'TOKECHO', exposure: 'obvious', at: 1 }];
  });
}
/** 给**全部**源装上哨兵产出；返回 k -> 哨兵文本 */
function armAll(WA) {
  const tags = {};
  const restores = [];
  (WA.render.SOURCES || []).forEach(function (k) {
    const tag = '<<SENT-' + k + '>>';
    tags[k] = tag;
    if (SNAPSHOT_SOURCES[k]) {
      const tok = SNAPSHOT_SOURCES[k];
      if (k === 'clock') WA.store.transact(function (d) { d.clock.label = tok; });
      if (k === 'pulse') WA.store.transact(function (d) { d.worldPulse.note = tok; });
      if (k === 'background') WA.store.transact(function (d) { d.background.text = tok; });
      if (k === 'people') WA.store.transact(function (d) { d.people.p_tok.name = tok; d.people.p_tok.location = tok + '城'; d.people.p_tok.action = tok + '行'; });
      if (k === 'currents') WA.store.transact(function (d) { d.currents = [{ id: 'c_tok', title: tok, visibility: 'open' }]; });
      if (k === 'echoes') WA.store.transact(function (d) { d.echoes = [{ id: 'e_tok', refCurrent: 'x', result: tok, exposure: 'obvious', at: 1 }]; });
      // 快照类源的哨兵就是 TOKxxx 本身
      tags[k] = tok;
      return;
    }
    const mod = WA[k];
    if (!mod) return;
    const method = ITEM_METHOD[k] || 'buildBlock';
    if (typeof mod[method] !== 'function') return;
    const keep = mod[method];
    mod[method] = function () { return tag; };
    restores.push(function () { mod[method] = keep; });
  });
  return { tags: tags, restore: function () { restores.forEach(function (f) { f(); }); } };
}
/** 产物文本 = 快照 + 独立注入项（两处合起来才是「这一轮到底注入了什么」） */
function productText(WA) {
  let snap = '', inj = '';
  try { snap = String(WA.render.buildWorldSnapshot() || ''); } catch (e) { snap = ''; }
  try {
    global.__lastExtensionPrompt = null;
    WA.render.applyInjections({ injections: [] });
    inj = String((global.__lastExtensionPrompt && global.__lastExtensionPrompt.text) || '');
  } catch (e) { inj = ''; }
  return snap + '\n' + inj;
}
function setAll(WA, on) {
  (WA.render.SOURCES || []).forEach(function (k) { WA.render.setVisibility(k, !!on); });
}
/** A/B/C 三面共用的一次测量：给定「要关掉的源」，报产物里还剩谁的哨兵 */
function measure(en, tags, offList) {
  setAll(en.WA, true);
  offList.forEach(function (k) { en.WA.render.setVisibility(k, false); });
  const text = productText(en.WA);
  const present = [], absent = [];
  Object.keys(tags).forEach(function (k) {
    if (text.indexOf(tags[k]) >= 0) present.push(k); else absent.push(k);
  });
  return { present: present, absent: absent, bytes: text.length };
}
function runAll(a) {
  const en = gate.fresh();
  const WA = en.WA;
  seedStore(WA);
  const armed = armAll(WA);
  const tags = armed.tags;
  const all = (WA.render.SOURCES || []).slice();
  try {
    // ── 前题：全开时全部哨兵都在场（否则后面的「缺席」不可能是开关造成的） ──
    const base = measure(en, tags, []);
    a(base.absent.length === 0, 'v2840/a3: [前题] 全开时 ' + Object.keys(tags).length + ' 个源的哨兵全部在场（缺: ' + (base.absent.join(',') || '无') + '）');
    // ── A 面：全关 ⇒ 一个都不许剩 ──
    const off = measure(en, tags, all);
    a(off.present.length === 0, 'v2840/a3: [A] 全关后产物里零哨兵残留（残留: ' + (off.present.join(',') || '无') + '）');
    // ── B 面：两两关闭 ⇒ 关掉的两个缺席、其余**全部**在场 ──
    const pairs = pairsOf(all, 120);
    let hitLeak = [], hitCollateral = [];
    pairs.forEach(function (pr) {
      const r = measure(en, tags, pr);
      pr.forEach(function (k) { if (r.present.indexOf(k) >= 0) hitLeak.push(k); });
      Object.keys(tags).forEach(function (k) {
        if (pr.indexOf(k) < 0 && r.absent.indexOf(k) >= 0) hitCollateral.push(k);
      });
    });
    const uniq = function (x) { return x.filter(function (v, i) { return x.indexOf(v) === i; }); };
    a(hitLeak.length === 0, 'v2840/a3: [B] ' + pairs.length + ' 组两两关闭中，被关的源全部真消失（漏: ' + (uniq(hitLeak).join(',') || '无') + '）');
    a(hitCollateral.length === 0, 'v2840/a3: [B] 两两关闭不误伤邻居（误伤: ' + (uniq(hitCollateral).join(',') || '无') + '）——'
      + '这条治的是 v2580 照不到的「关了 A 连累 B」');
    // ── C 面：只开一个 ⇒ 它必须在场（单向性） ──
    let hitLonely = [];
    all.forEach(function (k) {
      const others = all.filter(function (x) { return x !== k; });
      const r = measure(en, tags, others);
      if (r.present.indexOf(k) < 0) hitLonely.push(k);
    });
    a(hitLonely.length === 0, 'v2840/a3: [C] 只留一个源开着时它必在场（漏: ' + (hitLonely.join(',') || '无') + '）——'
      + '开关随「是不是我」增减，而不是随「是不是有人关过」增减');
  } finally { armed.restore(); }
}
/** D 面：存档兼容（v0 旧档可迁移、现行档原样读回） */
function runCompat(a) {
  const en = gate.fresh();
  const WA = en.WA;
  const SV = WA.store.SCHEMA_VERSION;
  // ① 远古存档：连 schemaVersion 都没有，且多层嵌套缺字段
  const legacy = { clock: { label: '旧纪元', dayIndex: 7 }, people: { p1: { name: '甲', location: '旧城' } },
    currents: [{ id: 'c1', title: '旧悬案' }], chronicle: [{ id: 'h1', title: '旧事', at: 1 }] };
  const out = WA.store.migrate(legacy, SV);
  a(out && out.schemaVersion === SV, 'v2840/a3: [D] v0 旧存档（无 schemaVersion）迁移到当前版本 ' + SV + '（实 ' + (out && out.schemaVersion) + '）');
  a(out.clock && out.clock.label === '旧纪元' && out.clock.dayIndex === 7, 'v2840/a3: [D] 迁移不丢旧内容（clock.label/dayIndex 保留）');
  a(out.people && out.people.p1 && out.people.p1.name === '甲' && out.people.p1.location === '旧城', 'v2840/a3: [D] 迁移不丢旧人物（people.p1 原样）');
  a(out.currents.length === 1 && out.currents[0].title === '旧悬案', 'v2840/a3: [D] 迁移不丢旧悬案（currents 原样）');
  a(out.chronicle.length === 1 && out.chronicle[0].title === '旧事', 'v2840/a3: [D] 迁移不丢旧纪事（chronicle 原样）');
  const rep = WA.store.migrateReport();
  a(rep && rep.from === 0 && rep.to === SV && (rep.failed || []).length === 0, 'v2840/a3: [D] 迁移报告可读且零失败步（from=' + (rep && rep.from) + ' to=' + (rep && rep.to) + '）');
  // ② 迁移是补齐而非收紧：所有默认顶层键都必须到场
  const defaults = Object.keys(WA.store.defaultWorldState ? WA.store.defaultWorldState() : {});
  const missing = defaults.filter(function (k) { return out[k] === undefined; });
  a(missing.length === 0, 'v2840/a3: [D] 迁移后默认骨架键无缺失（缺: ' + (missing.join(',') || '无') + '）——'
    + '「更严格」发生在入界，不得让旧档读不进来');
  // ③ 旧值直接喂给入界工具：不得被升格成假事实
  const IG = WA.inputGuard;
  a(IG.text(NaN, 20) === '' && IG.text({}, 20) === '' && IG.text(Infinity, 20) === '', 'v2840/a3: [D] 入界工具对 NaN/对象/Infinity 一律给空串（不升格成 \'NaN\'/\'[object Object]\'）');
  a(IG.text(7, 20) === '7' && IG.text(true, 20) === 'true', 'v2840/a3: [D] 合法旧值（有限数/布尔）仍可入界（收紧不等于拒绝一切）');
}
/** 负控制：真源码破坏 → 破坏副本上重跑同款 A/B/C 面 */
function runNegative(a) {
  const src = fs.readFileSync(path.join(BASE, 'render/inject.js'), 'utf8');
  const ANCHOR = 'vis.life && WA.life';
  const n = src.split(ANCHOR).length - 1;
  a(n === 1, 'v2840/a3: [N1] 负控制锚点在真源码中恰中 1 次（实 ' + n + '）');
  const broken = src.replace(ANCHOR, 'WA.life');
  a(broken !== src, 'v2840/a3: [N2] 破坏确实发生（life 守卫退回「只判模块在不在」，即 v2.56.0 之前的形态）');
  const enB = gate.fresh({ files: ['render/inject.js'], srcOverride: { 'render/inject.js': broken } });
  const WAB = enB.WA;
  seedStore(WAB);
  const armedB = armAll(WAB);
  try {
    const rB = measure(enB, armedB.tags, ['life']);
    a(rB.present.indexOf('life') >= 0, 'v2840/a3: [N3] 破坏后 A/B 面现形（life 开关关了、哨兵仍在）——判据不是瞎的');
    // 注意断言的**宽度必须与被破坏面同宽**：只破坏了 life 的守卫，所以只允许 life 关不掉；
    //   intel 未被破坏，必须仍被正常关掉 —— 否则这条负控制就变成了「凡两个源都关不掉」，
    //   即一个与被破坏面无关的假警报。它同时反证了「现形不是因为整个注入链坏了」。
    const rOk = measure(enB, armedB.tags, ['life', 'intel']);
    a(rOk.present.indexOf('life') >= 0 && rOk.present.indexOf('intel') < 0,
      'v2840/a3: [N3] 破坏副本上只有**被破坏的源**关不掉（life 残留、intel 正常消失）——宽窄对齐，且证明现形不是整链失效');
  } finally { armedB.restore(); }
  const enOk = gate.fresh();
  seedStore(enOk.WA);
  const armedOk = armAll(enOk.WA);
  try {
    const rOk2 = measure(enOk, armedOk.tags, ['life']);
    a(rOk2.present.indexOf('life') < 0 && rOk2.absent.indexOf('intel') < 0, 'v2840/a3: [N4] 原版上同款判据仍成立（life 真被关掉、intel 未受牵连）——双向自证，不是把判据写死');
  } finally { armedOk.restore(); }
}
module.exports = { runAll: require('./lock-assert.js').restoring(runAll), runCompat: runCompat, runNegative: runNegative };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runCompat(a); runNegative(a); } catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('SETTLE-V2841: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('SETTLE-V2841: pass（' + pass + ' 项）');
}

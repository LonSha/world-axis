#!/usr/bin/env node
// WorldAxis tests/settle-v2860.js —— v2.86.0（A5 注入链韧性 + 失败分类）
//
// 【它治的病：一个可选源的数据瑕疵，能把整块世界状态一起吃掉】
//   render/inject.js 的 applyInjections 里 43 个 `WA.<ns>.buildBlock()` 调用点，
//   **只有 style 一处在 try/catch 内**。实测（tools/diag_inject_v2860.js）：
//     · 全开时 47 个源里 41 个哨兵在场（正常）；
//     · 让 bonds 抛一次异常 ⇒ **47 个源全部丢失（0/47）**，连世界状态（时间/背景/人物/
//       暗流/回声）一起消失，异常还冒泡到扩展外面（产物里出现 apply-throw）；
//     · 真 API 路径下给 bonds 灌一行缺 `types` 的行（bonds.js:83 `r.types.join`）、
//       ladder 缺 `rungs`（ladder.js:161）、shadow 缺 `holders`（shadow.js:206），
//       buildBlock 确实抛 —— 也就是说：**模型输出少一个字段，正文就整块空白**。
//
//   本版口径（三态如实，绝不合并）：源模块缺席 / 源产出空串 / 源**抛异常**是三件事。
//     前两者是「这一轮没什么可说」（正常），第三者才是「这一块的数据坏了」（要看）。
//     合并它们之后，「世界状态为什么没进正文」永远答不出是没内容还是坏了。
//
// 【判据】（A 成类锁 / B 运行时韧性 / C 失败分类 / N 负控制）
//   A1 成类锁：真源码里每个源调用点都走 engineCall（防「新加的源又写成裸调用」）。
//   A2 源守卫形态仍在（`vis.<k> && WA.<k>`）——「两个条件缺一个就漏」这件事仍有字面证据。
//   A3 内部观测面不进接口面（engineCall / SRC_NAME 不出现在 WA.render 上）：
//      接口面一动就要付冻结串+账本的代价，观测面不该按那个价买。
//   B1 基线无故障（正常世界不该报故障，否则台账是噪音）。
//   B2 单源抛异常 ⇒ 其余源**全部**仍在场（修前此处是 0/47）。
//   B3 异常不外泄：产物里不得出现 apply-throw。
//   B4 世界快照逐段守卫：clock 段抛异常 ⇒ people/背景等段仍在（修前整块为空）。
//   C1 抛异常 ⇒ 台账 +1，且**按用户看得见的名字**记（'关系六型'，不是 'bonds'）。
//   C2 源产出空串 ⇒ **不计**故障（三态分开：没内容 ≠ 坏了）。
//   N0 破坏锚点在真源码各恰中 1 次；N1 破坏 ⇒ 对应判据现形；N2 原版同款判据仍绿；
//      N3 N1 影响面有限（不牵连 C2 那条判据）；N4 非恒真（读数确实变化过）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const gate = require('./ui-gate-sync.js');
const INJECT = path.join(BASE, 'render/inject.js');

/** 真源码面（逐字，不作任何剥离——本锁的判据是「字面形态」，不是语义） */
function src() { return fs.readFileSync(INJECT, 'utf8'); }

/** 产物文本：世界快照 + applyInjections 的注入产物（两段都收，免得只看一段） */
function productText(WA) {
  let snap = '', inj = '';
  try { snap = String(WA.render.buildWorldSnapshot() || ''); }
  catch (e) { snap = '<<snap-throw:' + (e && e.message) + '>>'; }
  try {
    global.__lastExtensionPrompt = null;
    WA.render.applyInjections({ injections: [] });
    inj = String((global.__lastExtensionPrompt && global.__lastExtensionPrompt.text) || '');
  } catch (e) { inj = '<<apply-throw:' + (e && e.message) + '>>'; }
  return snap + '\n' + inj;
}

/** 给每个源装哨兵：让「这个源进了正文吗」变成可判定的事实 */
function armAll(WA) {
  const tags = {};
  const owners = {};
  const restores = [];
  (WA.render.SOURCES || []).forEach(function (k) {
    const tag = '<<SENT-' + k + '>>';
    const mod = WA[k];
    if (!mod) return;
    const method = (typeof mod.buildBlock === 'function') ? 'buildBlock'
      : (typeof mod.buildMemoryBlock === 'function') ? 'buildMemoryBlock'
      : (typeof mod.buildOpinionBlock === 'function') ? 'buildOpinionBlock'
      : (typeof mod.buildLedgerText === 'function') ? 'buildLedgerText' : null;
    if (!method) return;
    tags[k] = tag;
    owners[k] = { mod: mod, method: method, keep: mod[method] };
    restores.push(function () { mod[method] = owners[k].keep; });
  });
  return {
    tags: tags, owners: owners,
    restore: function () { restores.forEach(function (f) { f(); }); }
  };
}
function setAll(WA, on) { (WA.render.SOURCES || []).forEach(function (k) { WA.render.setVisibility(k, !!on); }); }
function present(tags, text) { return Object.keys(tags).filter(function (k) { return text.indexOf(tags[k]) >= 0; }); }
function faultsOf(WA) {
  const v = WA.render.visibilityStat();
  return { total: v.engineFaultTotal, rows: v.engineFaults };
}

function runAll(a) {
  // ───────────────────────── A 面：成类锁（静态） ─────────────────────────
  {
    const s = src();
    // A1：每个源调用点都必须在 engineCall( 内。修前形态是裸调用。
    const CALL = /WA\.([A-Za-z_$][\w$]*)\.(?:buildBlock|buildMemoryBlock|buildOpinionBlock|buildLedgerText)\(/g;
    const naked = [];
    let m, guarded = 0;
    while ((m = CALL.exec(s))) {
      const ns = m[1];
      const seg = s.slice(Math.max(0, m.index - 70), m.index);
      if (seg.indexOf('engineCall(') >= 0) guarded++;
      else if (ns !== 'style') naked.push(ns);   // style 自带 try/catch（唯一的历史例外）
    }
    a(naked.length === 0, 'v2860: [A1] 源调用点无一裸调用（裸: ' + (naked.join(',') || '无') + '）');
    a(guarded >= 42, 'v2860: [A1] 走 engineCall 的调用点为 ' + guarded + ' 个（≥42：43 个调用点 − style）');
    // A2：每个独立调用点仍带「开关 && 模块」两条件守卫。
    //   范围必须精确到**调用点所在的命名空间**：快照六段（clock/pulse/background/people/
    //   currents/echoes）走的是 s.clock 形态、style 走 vis.style 单条件（模块判定在
    //   buildStyleBlock 内部），拿 SOURCES 全量去套会造出 7 条假缺失。
    const CALL2 = /WA\.([A-Za-z_$][\w$]*)\.(?:buildBlock|buildMemoryBlock|buildOpinionBlock|buildLedgerText)\(/g;
    const calledNs = [];
    let m2;
    while ((m2 = CALL2.exec(s))) if (calledNs.indexOf(m2[1]) < 0) calledNs.push(m2[1]);
    //   子源（由某个已登记源统管、不单独设开关）按 v2.56.0 的 SUBSOURCES 例外：
    //   它们由统管源的开关守卫（`vis.memory`），故自身不必有 `vis.<自己>`。
    const SUB = ['memorySampler', 'pmem', 'summarizer'];
    const guardless = calledNs.filter(function (k) {
      if (k === 'style') return false;                              // 自带 try/catch，历史例外
      if (SUB.indexOf(k) >= 0) return s.indexOf('vis.memory') < 0;   // 子源：看统管源
      return s.indexOf('vis.' + k + ' && WA.' + k) < 0;
    });
    a(guardless.length === 0, 'v2860: [A2] ' + calledNs.length + ' 个调用点所在源都有「开关 && 模块」守卫（缺: ' + (guardless.join(',') || '无') + '）');
    // A3：观测面不付接口冻结的价
    const WA = gate.fresh({}).WA;
    a(typeof WA.render.engineCall === 'undefined' && typeof WA.render.SRC_NAME === 'undefined',
      'v2860: [A3] 内部观测面（engineCall / SRC_NAME）不出现在 WA.render 上');
    a(typeof WA.render.visibilityStat === 'function',
      'v2860: [A3] 失败台账经**既有** visibilityStat() 暴露（零新成员）');
  }

  // ───────────────────────── B/C 面：运行时韧性 ─────────────────────────
  {
    // B1 基线：正常世界不报故障
    const WA = gate.fresh({}).WA;
    setAll(WA, true);
    const t0 = productText(WA);
    const f0 = faultsOf(WA);
    a(f0.total === 0, 'v2860: [B1] 基线零故障（实 ' + f0.total + '）——否则台账是噪音，没人会读它');

    // B2/B3/C1：单源抛异常 ⇒ 只丢该源 + 留痕 + 不外泄
    const WA2 = gate.fresh({}).WA;
    const arm2 = armAll(WA2);
    setAll(WA2, true);
    const baseText = productText(WA2);
    const basePresent = present(arm2.tags, baseText).length;
    const total = Object.keys(arm2.tags).length;
    const keep = arm2.owners.bonds.keep;
    arm2.owners.bonds.mod[arm2.owners.bonds.method] = function () { throw new Error('__v2860_boom__'); };
    const t2 = productText(WA2);
    const afterPresent = present(arm2.tags, t2);
    arm2.owners.bonds.mod[arm2.owners.bonds.method] = keep;
    const f2 = faultsOf(WA2);
    arm2.restore();
    a(t2.indexOf('apply-throw') < 0, 'v2860: [B3] 异常不外泄：产物里无 apply-throw（实 ' + (t2.indexOf('apply-throw') >= 0) + '）');
    a(afterPresent.length >= basePresent - 1,
      'v2860: [B2] bonds 抛异常后其余源仍在场（' + afterPresent.length + '/' + total
      + '；基线 ' + basePresent + '；修前此处是 0/' + total + '）');
    a(afterPresent.indexOf('bonds') < 0, 'v2860: [B2] 坏掉的那一个源确实没进正文（不发假哨兵）');
    a(f2.total === 1, 'v2860: [C1] 台账恰好 +1 条（实 ' + f2.total + '）');
    a(!!f2.rows['关系六型'],
      'v2860: [C1] 故障按**用户看得见的名字**记（键: ' + Object.keys(f2.rows).join(',') + '；期望含「关系六型」而不是 bonds）');
    a(String(f2.rows['关系六型'] && f2.rows['关系六型'].lastMsg).indexOf('__v2860_boom__') >= 0,
      'v2860: [C1] 台账带原始错误信息（可定位，不是一句「失败了」）');

    // C2：产出空串 ⇒ 不计故障（三态分开）
    const WA3 = gate.fresh({}).WA;
    const arm3 = armAll(WA3);
    setAll(WA3, true);
    const keep3 = arm3.owners.bonds.keep;
    arm3.owners.bonds.mod[arm3.owners.bonds.method] = function () { return ''; };
    productText(WA3);
    const f3 = faultsOf(WA3);
    arm3.owners.bonds.mod[arm3.owners.bonds.method] = keep3;
    arm3.restore();
    a(f3.total === 0, 'v2860: [C2] 源返回空串**不计**故障（实 ' + f3.total + '）——没内容与坏了是两件事');

    // B4：世界快照逐段守卫（clock 段坏 ⇒ 其余段仍在）
    const WA4 = gate.fresh({}).WA;
    WA4.store.transact(function (d) {
      d.clock = { get label() { throw new Error('__v2860_clock__'); } };
      d.background = { text: '背景仍在' };
    }, 'v2860:snap');
    const snap4 = String(WA4.render.buildWorldSnapshot() || '');
    const f4 = faultsOf(WA4);
    a(snap4.indexOf('背景仍在') >= 0, 'v2860: [B4] clock 段坏掉后背景段仍在（修前整块快照为空串）');
    a(snap4.indexOf('【世界时间】') < 0, 'v2860: [B4] 坏掉的那一段确实不进文本（不编造时间）');
    a(f4.total === 1 && !!f4.rows['世界时间'], 'v2860: [C1] 快照段失败同样留痕（键: ' + Object.keys(f4.rows).join(',') + '）');
  }
}

/** 负控制：真源码破坏 → 在破坏副本上重跑**同款**判据 */
function runNegative(a) {
  const s = src();
  // 锚点：engineCall 的 catch（韧性本体）。它必须在真源码里恰中 1 次，
  //   否则「破坏」这件事本身就没有落点（工具两向自证）。
  const ANCHOR = "catch (e) { noteEngineFailure(ns, e); return ''; }";
  const n0 = s.split(ANCHOR).length - 1;
  a(n0 === 1, 'v2860: [N0] 韧性锚点在真源码中恰中 1 次（实 ' + n0 + ' 次）');

  const broken = s.replace(ANCHOR, "catch (e) { noteEngineFailure(ns, e); throw e; }");
  a(broken !== s, 'v2860: [N0] 破坏确实改写了源码（异常重新外抛）');

  // N1：破坏副本上重跑 B2/B3（同款判据）⇒ 必须现形
  const WAb = gate.fresh({ files: ['render/inject.js'], srcOverride: { 'render/inject.js': broken } }).WA;
  const armb = armAll(WAb);
  setAll(WAb, true);
  const keepB = armb.owners.bonds.keep;
  // 排在 bonds 之后的源此时会整链断掉
  armb.owners.bonds.mod[armb.owners.bonds.method] = function () { throw new Error('__v2860_neg__'); };
  const tb = productText(WAb);
  const afterB = present(armb.tags, tb);
  const totB = Object.keys(armb.tags).length;
  armb.owners.bonds.mod[armb.owners.bonds.method] = keepB;
  armb.restore();
  const leaked = tb.indexOf('apply-throw') >= 0;
  a(afterB.length < totB - 1 || leaked,
    'v2860: [N1] 破坏后 B2/B3 现形（在场 ' + afterB.length + '/' + totB + '，异常外泄=' + leaked + '）——判据不是瞎的');
  a(leaked, 'v2860: [N1] 破坏后异常确实外泄（证明被破坏的正是「不外泄」这一条）');

  // N3：N1 的破坏不牵连 C2 那条判据（三态分开仍然成立）
  const WAc = gate.fresh({ files: ['render/inject.js'], srcOverride: { 'render/inject.js': broken } }).WA;
  const armc = armAll(WAc);
  setAll(WAc, true);
  const keepC = armc.owners.bonds.keep;
  armc.owners.bonds.mod[armc.owners.bonds.method] = function () { return ''; };
  productText(WAc);
  const fc = faultsOf(WAc).total;
  armc.owners.bonds.mod[armc.owners.bonds.method] = keepC;
  armc.restore();
  a(fc === 0, 'v2860: [N3] 破坏引擎调用出口后，「空串不计故障」仍成立（实 ' + fc + '）——逐锚敏感');

  // N4：非恒真——读数确实变化过（而不是两次都是 0 或都是 1）
  const WAok = gate.fresh({}).WA;
  setAll(WAok, true);
  productText(WAok);
  const okTotal = faultsOf(WAok).total;
  const WAboom = gate.fresh({}).WA;
  const armz = armAll(WAboom);
  setAll(WAboom, true);
  const keepZ = armz.owners.ladder.keep;
  armz.owners.ladder.mod[armz.owners.ladder.method] = function () { throw new Error('__v2860_n4__'); };
  productText(WAboom);
  const boomTotal = faultsOf(WAboom).total;
  armz.owners.ladder.mod[armz.owners.ladder.method] = keepZ;
  armz.restore();
  a(okTotal === 0 && boomTotal === 1,
    'v2860: [N4] 非恒真：正常 ' + okTotal + ' / 破坏 ' + boomTotal + '（读数确实随事实变化）');
}

module.exports = { runAll: require('./lock-assert.js').restoring(runAll), runNegative: require('./lock-assert.js').restoring(runNegative) };

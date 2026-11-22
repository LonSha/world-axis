#!/usr/bin/env node
// v2.156.0 SP3 专锁：摘要与注入生命周期（offline-tick 的账/摘/注入三口 × 合成侧消费）
//   它锁的判据（按「静默失效」代价排序）：
//     ① **无实际推进不报推进成功**：`no-apply` 的批次必须如实写进摘要行（
//        「没接入推演」与「推了一轮但没事发生」不是一件事）；
//     ② **受保护改动不写成已发生**：锚上的行被还原后，摘要要点名它被跳过，
//        而不是把它当成已经发生的事实念给玩家；
//     ③ **摘要展示与注入共用同一段内容**：注入块逐行来自 `summary().lines` ——
//        两口各拼一段，文本迟早漂移，而注入的正是进入正文的那段；
//     ④ **消费标记是唯一的生命周期开关**：无批次 ⇒ no-batch；重复消费幂等；
//        消费后 `buildBlock()` 归空（未消费的批次会每轮重念同一段旧离线）；
//     ⑤ `consumedAt: null` 与 `consumedAt: 0` 必须可分（`Number(null) === 0` 是本仓
//        实测过的坑，写错一次就是「未消费被读成已消费」）。
//   边界（与本仓 SP3 验收条件的对应）：
//     · 「生成取消或失败保留摘要」：offlineTick.tick 失败时不落批次（SP2 锁已逐条钉住），
//       而已落批次在未被消费前**一直可读** —— 本锁 B9 逐位复核这条。
//     · 消费的**唯一现场证据**是 `store.lastInjection.sources`，那个接缝由
//       tests/offline-consume-v2156.js 把住；本锁只负责「账户侧的三口读数跟着一起动」。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const REL = 'engines/offline-tick.js';
const SELF_REL = 'tests/sp3-lifecycle-v2156.js';

// 账口：未消费判据（显式不等于 null 是唯一正确写法）。
const ANCHOR_T1 = '      if (num(last.consumedAt) !== null) { out = { ok: true, already: true, at: num(last.consumedAt) }; return false; }';
// 摘口：无批次如实报 no-batch，不编一段「什么都没发生」。
const ANCHOR_T2 = "    if (!list.length) return { ok: false, reason: 'no-batch', lines: [], rows: [] };";
// 摘口：受保护改动要点名（摘要不得把被跳过的改动写成已发生）。
const ANCHOR_T3 = "      lines.push('其中 ' + rows.length + ' 处改动因落在你的记忆锚上而被跳过：'";
// 摘口：未接入推演也要如实说。
const ANCHOR_T4 = "    if (!last.applied) lines.push('本次未接入推演（只落了批次账）。');";
// 摘口读数：consumed 与 consumedAt 是同一判据的两个面。
const ANCHOR_T5 = '      consumed: num(last.consumedAt) !== null, consumedAt: num(last.consumedAt),';
// 注入口：先取一次 summary()，块体逐行来自它（同一份内容，不是第二份口径）。
const ANCHOR_T6 = '    const s = summary();';
const ANCHOR_T7 = "    return '[你不在时]' + String.fromCharCode(10)";
// 注入口：已消费则不再注入。
const ANCHOR_T8 = "    if (Array.isArray(lb) && lb.length && num(lb[lb.length - 1].consumedAt) !== null) return '';";
// 未消费批次数：消费面断裂时它恒 > 0，而 batches/rounds 都是正常的。
const ANCHOR_T9 = '      pending: (Array.isArray(b.batches) ? b.batches : []).filter(function (x) { return x && num(x.consumedAt) === null; }).length,';
// 展示面（面板）读的就是这两口，不得自己拼。
const ANCHOR_P1 = '      const r = WA.offlineTick.summary();';
const ANCHOR_P2 = '      const t = WA.offlineTick.buildBlock();';

function countOcc(s, sub) { return s.split(sub).length - 1; }
function fresh(ov) { return sync.fresh(ov ? { srcOverride: ov } : undefined).WA; }
function ov(file, src) { const o = {}; o[file] = src; return o; }
function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function boot(srcOv) {
  const WA = fresh(srcOv);
  WA.store.init();
  WA.offlineTick.setSettings({ enabled: true, stepMs: 60000, minGapMs: 1000, maxItems: 5 });
  try { WA.mainWin.localStorage.removeItem('worldaxis_playtime_v1'); } catch (e) {}
  WA.store.transact(function (d) {
    d.offlineTick = { anchors: [], batches: [], skips: [], lastSettledAt: null, rounds: 0 };
    d.lastInjection = null;
  }, 'sp3-v2156:reset');
  return WA;
}
/** 在游离草稿上推一批，成功后提交回真世界（便于断言三口读数）。 */
function settleBatch(WA, nowMs, applyFn) {
  const d = clone(WA.store.get());
  d.offlineTick.lastSettledAt = 0;
  const r = WA.offlineTick.tick(d, { now: nowMs, apply: applyFn || function () { return { ok: true, touched: [] }; } });
  WA.store.transact(function (dd) { dd.offlineTick = d.offlineTick; }, 'sp3-v2156:commit');
  return r;
}

// ── A 结构面 ──────────────────────────────────────────────────────────
function runA(a) {
  const T = read(REL), P = read('ui/panel.js');
  const body = function (start, end) {
    const i = T.indexOf(start), j = T.indexOf(end, i);
    return (i < 0 || j < 0) ? null : T.slice(i, j);
  };
  const sumBody = body('  function summary() {', '\n  function describeElapsed(');
  const blkBody = body('  function buildBlock() {', '\n  function statOf()');

  a(countOcc(T, ANCHOR_T1) === 1, 'v2156/sp3 A1: 账口的「未消费」判据锚点恰中 1 次（显式 !== null）');
  a(countOcc(T, ANCHOR_T2) === 1 && countOcc(T, ANCHOR_T3) === 1 && countOcc(T, ANCHOR_T4) === 1,
    'v2156/sp3 A2: 摘要三行口径各恰中 1 次 —— 无批次不编内容 / 受保护改动点名 / 未接入推演如实说');
  a(countOcc(T, ANCHOR_T5) === 1, 'v2156/sp3 A3: summary 的 consumed 与 consumedAt 同源同判据（一处改口径两处不影响）');
  a(sumBody !== null && countOcc(sumBody, 'transact') === 0 && countOcc(sumBody, 'state()') === 1,
    'v2156/sp3 A4: summary 是**纯读面**（不开事务、只取一次 state 快照）—— 读数不该顺手改世界');
  a(countOcc(T, ANCHOR_T6) === 1 && countOcc(T, ANCHOR_T7) === 1,
    'v2156/sp3 A5: 注入块先取 summary()、块体逐行由它拼出（展示与注入共用同一段内容）');
  a(blkBody !== null && countOcc(blkBody, 'summary()') === 1 && countOcc(blkBody, 'lines.push') === 0,
    'v2156/sp3 A6: buildBlock 段里**没有任何自造句行的语句**（它只包壳，内容全来自 summary）');
  a(countOcc(T, ANCHOR_T8) === 1, 'v2156/sp3 A7: 已消费批次不再注入的闸门恰中 1 次');
  a(countOcc(T, ANCHOR_T9) === 1, 'v2156/sp3 A8: 未消费批次数是独立读数（消费面断裂时它恒 >0，而 batches/rounds 都正常）');
  a(countOcc(P, ANCHOR_P1) === 1 && countOcc(P, ANCHOR_P2) === 1,
    'v2156/sp3 A9: 面板展示面读的就是这两口（summary / buildBlock），不自己拼摘要');
  const self = read(SELF_REL);
  a(['ANCHOR_T1', 'ANCHOR_T2', 'ANCHOR_T3', 'ANCHOR_T4', 'ANCHOR_T5', 'ANCHOR_T6',
    'ANCHOR_T7', 'ANCHOR_T8', 'ANCHOR_T9'].every(function (k) { return countOcc(self, k) >= 2; }),
    'v2156/sp3 A10: 九个账/摘/注入锚点在本文件里各至少出现 2 次（声明 + 引用）');
}

// ── B 运行时 ──────────────────────────────────────────────────────────
function runB(a) {
  const T0 = fresh(); T0.store.init(); T0.offlineTick.setSettings({ enabled: true });
  a(Object.keys(T0.offlineTick).sort().join(',') === 'KINDS,KIND_LABEL,anchor,anchorPaths,buildBlock,getSettings,markConsumed,release,setSettings,stat,summary,tick',
    'v2156/sp3 B1: 导出面完整（实 ' + Object.keys(T0.offlineTick).sort().join(',') + '）');

  // B2 无批次 ⇒ 三口一致拒收 / 空块（不编一段「什么都没发生」）
  const W0 = boot();
  a(W0.offlineTick.summary().reason === 'no-batch' && W0.offlineTick.buildBlock() === '',
    'v2156/sp3 B2: 无批次时摘要如实报 no-batch 且注入块为空 —— 空壳不是摘要');

  // B3–B5 未消费：三口读数一致为「还没进正文」
  const W1 = boot();
  const r1 = settleBatch(W1, 600000);
  const s1 = W1.offlineTick.summary();
  const b1 = W1.offlineTick.buildBlock();
  a(r1.ok === true && r1.applied === true && r1.rounds === 10,
    'v2156/sp3 B3: 一批已结算（rounds ' + r1.rounds + '，applied ' + r1.applied + '）');
  a(s1.ok === true && s1.consumed === false && s1.consumedAt === null && W1.offlineTick.stat().pending === 1,
    'v2156/sp3 B4: 未消费时 summary.consumed=false / consumedAt=null / pending=1 三处一致');
  a(b1.length > 0 && b1.indexOf('[你不在时]') === 0 && b1.indexOf(s1.lines[0]) >= 0,
    'v2156/sp3 B5: 注入块非空且**逐字含摘要首行**（展示与注入共用同一段内容）');
  a(s1.lines.every(function (l) { return b1.indexOf('- ' + l) >= 0; }),
    'v2156/sp3 B6: 摘要每一条都在注入块里逐字出现（不是「大意相同」）');

  // B7–B9 消费：账动、三口同时翻转、幂等
  const c1 = W1.offlineTick.markConsumed({ now: 999999 });
  a(c1.ok === true && c1.already === false && c1.at === 999999, 'v2156/sp3 B7: 首次消费落账（already=false，时刻取自入参）');
  a(W1.offlineTick.summary().consumed === true && W1.offlineTick.summary().consumedAt === 999999
    && W1.offlineTick.stat().pending === 0 && W1.offlineTick.buildBlock() === '',
    'v2156/sp3 B8: 消费后四处读数同时翻转（consumed=true / consumedAt 落值 / pending=0 / 块归空）');
  const c2 = W1.offlineTick.markConsumed({ now: 1000000 });
  a(c2.ok === true && c2.already === true && c2.at === 999999 && W1.offlineTick.stat().consumed === 1,
    'v2156/sp3 B9: 重复消费幂等（already=true，at 保持首次时刻，consumed 计数不双计）');

  // B10 摘要仍可读（消费不等于摘要消失：「生成成功后的消费」不是「删掉痕迹」）
  a(W1.offlineTick.summary().ok === true && W1.offlineTick.summary().lines.length >= 1,
    'v2156/sp3 B10: 消费后摘要**仍可读**（痕迹不因消费而消失，只是不再反复注入）');

  // B11–B13 两批：只压最新一批，旧批保持未消费
  const W2 = boot();
  settleBatch(W2, 600000);
  settleBatch(W2, 1200000);
  let bs = W2.store.get().offlineTick.batches;
  a(bs.length === 2 && bs[0].consumedAt === null && bs[1].consumedAt === null && W2.offlineTick.stat().pending === 2,
    'v2156/sp3 B11: 两批各带独立消费留痕（pending=2）—— 批次账是逐批的，不是一个大开关');
  W2.offlineTick.markConsumed({ now: 7 });
  bs = W2.store.get().offlineTick.batches;
  a(bs[0].consumedAt === null && bs[1].consumedAt === 7 && W2.offlineTick.stat().pending === 1,
    'v2156/sp3 B12: 消费只压**最新一批**（旧批保持未消费，pending 2→1）');
  a(W2.offlineTick.buildBlock() === '' && W2.offlineTick.summary().consumed === true,
    'v2156/sp3 B13: 注入面看的是最新一批（已消费 ⇒ 归空），而旧批的存在由 pending 如实报告');

  // B14 consumedAt 的两种「有值」形态必须与「没值」可分
  const W3 = boot();
  W3.store.transact(function (d) {
    d.offlineTick.batches = [
      { from: 0, to: 1, elapsedMs: 1, rounds: 0, requestedRounds: 0, capped: false, protectedRows: 0, applied: false, at: 1, consumedAt: null },
      { from: 0, to: 1, elapsedMs: 1, rounds: 1, requestedRounds: 1, capped: false, protectedRows: 0, applied: true, at: 2, consumedAt: 0 }
    ];
  }, 'sp3-v2156:zero');
  const s3 = W3.offlineTick.summary();
  a(s3.consumed === true && s3.consumedAt === 0 && W3.offlineTick.stat().pending === 1 && W3.offlineTick.buildBlock() === '',
    'v2156/sp3 B14: consumedAt=0 被读成**已消费**（Unix 纪元是合法时刻），而未消费那条仍计入 pending —— Number(null)===0 的坑反向也守住');

  // B15 无实际推进不报推进成功（no-apply）
  const W4 = boot();
  const d4 = clone(W4.store.get());
  d4.offlineTick.lastSettledAt = 0;
  const r4 = W4.offlineTick.tick(d4, { now: 600000 });
  W4.store.transact(function (dd) { dd.offlineTick = d4.offlineTick; }, 'sp3-v2156:noapply');
  const s4 = W4.offlineTick.summary();
  a(r4.ok === true && r4.applied === false && r4.rounds === 0 && r4.reason === 'no-apply',
    'v2156/sp3 B15: 无 apply 回调 ⇒ 如实报 no-apply / rounds=0（「没推」与「推了但没事发生」可分）');
  a(s4.lines.join('').indexOf('本次未接入推演') >= 0,
    'v2156/sp3 B16: 摘要行明写「本次未接入推演」—— 不把零轮写成「世界推进了 0 轮」就完事');

  // B17–B19 受保护改动的摘要口径
  const W5 = boot();
  W5.store.transact(function (d) {
    d.people = { p1: { id: 'p1', life: { goals: [{ text: 'g', status: 'active' }], commitments: [] } } };
  }, 'sp3-v2156:people');
  W5.offlineTick.anchor('people.p1.life', { kind: 'task', text: '找他' });
  const d5 = clone(W5.store.get());
  d5.offlineTick.lastSettledAt = 0;
  const r5 = W5.offlineTick.tick(d5, { now: 60000, apply: function (dd) {
    dd.people.p1.life.goals[0].status = 'done';
    dd.people.p1.life.other = 1;
    return { ok: true, touched: ['people.p1.life'] };
  } });
  W5.store.transact(function (dd) { dd.offlineTick = d5.offlineTick; }, 'sp3-v2156:prot');
  const s5 = W5.offlineTick.summary();
  a(r5.protectedRows >= 1 && d5.people.p1.life.goals[0].status === 'active' && d5.people.p1.life.other === undefined,
    'v2156/sp3 B17: 锚上的改动被还原（status 仍 active、新键也没落地）—— 保护是还原，不是标记');
  a(s5.protectedRows === r5.protectedRows && s5.rows.length >= 1
    && s5.rows.every(function (x) { return x.path === 'people.p1.life'; })
    && s5.lines.join(' ').indexOf('people.p1.life') >= 0,
    'v2156/sp3 B18: 摘要**点名**被跳过的路径（受保护改动不写成已发生）');
  a((W5.offlineTick.buildBlock() || '').indexOf('被跳过') >= 0,
    'v2156/sp3 B19: 注入块也带上这条（玩家读到的正是「哪些没许动」）');

  // B20 关闭时注入块归空（不给老用户凭空多出约束）
  W5.offlineTick.setSettings({ enabled: false });
  a(W5.offlineTick.buildBlock() === '',
    'v2156/sp3 B20: 总开关关闭时注入块归空（关掉就等于不进正文）');
}

// ── 负控制：真源码破坏 → 加载破坏副本 → 在副本上重跑同款判据 ────────────────
function runNegative(a) {
  const src = read(REL);

  // N1 拆掉「已消费不再注入」闸门 ⇒ 一段早就发生过的离线被每轮重念
  a(countOcc(src, ANCHOR_T8) === 1, 'v2156/sp3 N1 前提: 注入闸门锚点恰中 1 次');
  const b1 = src.replace(ANCHOR_T8, "    if (false) return '';");
  a(b1 !== src, 'v2156/sp3 N1a: 破坏副本已生成');
  const W1 = boot(ov(REL, b1));
  settleBatch(W1, 600000);
  W1.offlineTick.markConsumed({ now: 5 });
  a(W1.offlineTick.summary().consumed === true && (W1.offlineTick.buildBlock() || '').length > 0,
    'v2156/sp3 N1b: 拆掉闸门后，**已消费**的摘要仍在注入（块长 ' + (W1.offlineTick.buildBlock() || '').length + '，而 summary.consumed=true）—— 玩家每轮都读到一段早就发生过的「你不在时」');

  // N2 把「未消费」判据写成 isFinite 形态 ⇒ Number(null)===0 让未消费被读成已消费
  a(countOcc(src, ANCHOR_T1) === 1, 'v2156/sp3 N2 前提: 账口判据锚点恰中 1 次');
  const b2 = src.replace(ANCHOR_T1,
    '      if (isFinite(Number(last.consumedAt))) { out = { ok: true, already: true, at: last.consumedAt }; return false; }');
  a(b2 !== src, 'v2156/sp3 N2a: 破坏副本已生成');
  const W2 = boot(ov(REL, b2));
  settleBatch(W2, 600000);
  const cx = W2.offlineTick.markConsumed({ now: 5 });
  a(cx.already === true && W2.offlineTick.summary().consumed === false && W2.offlineTick.stat().pending === 1,
    'v2156/sp3 N2b: 改用 isFinite 后，**未消费**的批次被判成已消费（账口答 already，而 summary 仍答 consumed=false）—— 两处读数当场打架，那段摘要永远记不上消费');

  // N3 让注入块自造句行（不再取 summary）⇒ 展示面与注入面分家
  a(countOcc(src, ANCHOR_T6) === 1, 'v2156/sp3 N3 前提: 注入块取 summary 的锚点恰中 1 次');
  const b3 = src.replace(ANCHOR_T6, '    const s = { ok: true, lines: [\'世界推进了若干轮。\'] };');
  a(b3 !== src, 'v2156/sp3 N3a: 破坏副本已生成');
  const W3 = boot(ov(REL, b3));
  settleBatch(W3, 600000);
  const s3 = W3.offlineTick.summary();
  const blk3 = W3.offlineTick.buildBlock();
  a(blk3.indexOf(s3.lines[0]) < 0 && blk3.indexOf('世界推进了若干轮。') >= 0,
    'v2156/sp3 N3b: 注入块不再来自摘要（摘要首行「' + s3.lines[0].slice(0, 14) + '…」不在块里，块里是自己编的那句）—— 展示面与注入面从此漂移');

  // N4 对照：同一判据在原版上为真（证明 N1/N2/N3 的破坏真改了行为）
  const W4 = boot();
  settleBatch(W4, 600000);
  const s4 = W4.offlineTick.summary();
  const blk4 = W4.offlineTick.buildBlock();
  W4.offlineTick.markConsumed({ now: 5 });
  a(s4.consumed === false && blk4.indexOf('- ' + s4.lines[0]) >= 0 && W4.offlineTick.buildBlock() === '',
    'v2156/sp3 N4: 同款判据在原版上为真（未消费时块逐字含摘要行；消费后块归空）');

  a(read(REL) === src, 'v2156/sp3 N5: 真源码文件逐字未变（破坏只在内存副本与 fresh 的 vm 上下文里）');
}

function runAll(a) { runA(a); runB(a); }
module.exports = { REL, ANCHOR_T1, ANCHOR_T2, ANCHOR_T3, ANCHOR_T4, ANCHOR_T5,
  ANCHOR_T6, ANCHOR_T7, ANCHOR_T8, ANCHOR_T9, ANCHOR_P1, ANCHOR_P2,
  runA, runB, runAll, runNegative };

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };
  try { runAll(a); } catch (e) { fail++; console.log('  ✗ 抛出：' + e.message + '\n' + String(e.stack).split('\n').slice(1, 4).join('\n')); }
  try { runNegative(a); } catch (e) { fail++; console.log('  ✗ 负控制抛出：' + e.message + '\n' + String(e.stack).split('\n').slice(1, 4).join('\n')); }
  console.log('SP3-LIFECYCLE-V2156: pass ' + pass + ' / fail ' + fail);
  process.exit(fail ? 1 : 0);
}

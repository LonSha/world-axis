#!/usr/bin/env node
// WorldAxis tests/v11-pending-state.js —— unifiedPending 三态可分辨锁（v2.298.0 · V11 OPV11-7）
//
// 【它治什么】
//   立项实测：空世界 `WA.unifiedPending.collect()` 返回 `total=0 / highCount=0 / items=0`。
//   而三件完全不同的事在读数上完全同形：
//     ① 世界确实没事可做（empty：模块都在、都正常读回，只是都没产出）
//     ② 聚合器没接上模块（skipped：`WA.<mod>` 不存在，或没有约定入口函数）
//     ③ 接了模块但调用报错（fault：`pending()` 抛异常，被 `catch (e) {}` 吃掉）
//   修前 `core/unified-pending.js` 七个分支全是 `catch (e) {}` —— 异常静默消失，
//   读面永远看到「没事」。这不是「有没有数据」的问题，是「读不出来时读面知不知道」。
//   与 OPV11-1（快照真空态）同属一族，只是发生在待办层。
//
// 【判据】
//   P1  空世界（模块都在且正常、零产出）⇒ state==='empty'，且 hands 非空
//   P2  删掉一个模块 ⇒ skipped 含它、reason==='absent'、detail 可读
//   P3  一个模块抛异常 ⇒ state==='fault'，faults 含它且带原始错误文本
//   P4  fault 优先级：既有正常产出又有模块抛异常 ⇒ 仍报 'fault'
//   P5  三张名单在任何态都全量给出（hands / skipped / faults 都是数组）
//   P6  diagnose() 与 collect() 同源（state / 三张名单 / 计数逐字一致）
//   P7  summary 随态变化（empty 与 fault 不同句）
//   P8  stat() 也透出 state 与三张名单长度
//   P9  纯只读：调 collect / diagnose / stat 前后 store 深比较相等
//
// 【两向自证】N1 摘掉 fault 判定 ⇒ fault 不可达；N2 退回静默 catch ⇒ 故障消失；
//   N3 摘掉缺席登记 ⇒ skipped 空；N4 原版上同款判据仍成立。
'use strict';

const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const TARGET = 'core/unified-pending.js';
const ALL_MODS = ['storyChoice', 'commission', 'investigation', 'aftermath', 'operations', 'farfield', 'diplomacy'];

function stubModules(WA, opts) {
  const o = opts || {};
  const saved = {};
  ALL_MODS.forEach(function (mod) {
    if (o.omit && o.omit.indexOf(mod) >= 0) return;
    saved[mod] = WA[mod];
    if (mod === 'diplomacy') {
      WA[mod] = { stat: function () { return { live: { open: 0 } }; }, view: function () { return { proposals: [] }; } };
      return;
    }
    if (o.throwOn && o.throwOn === mod) {
      WA[mod] = { pending: function () { throw new Error('__v11pending_boom__'); } };
    } else {
      WA[mod] = { pending: function () { return { ok: true, items: [], points: [], rows: [] }; } };
    }
  });
  return function restore() {
    ALL_MODS.forEach(function (mod) {
      if (Object.prototype.hasOwnProperty.call(saved, mod)) WA[mod] = saved[mod];
    });
  };
}
function freshEnv(opts) {
  const env = opts ? sync.fresh(opts) : sync.fresh();
  try { global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  return env.WA;
}

function runAll(a) {
  // P1 空世界：empty 且 hands 非空
  {
    const WA = freshEnv();
    const un = stubModules(WA, {});
    const r = WA.unifiedPending.collect();
    a(typeof r.state === 'string', 'v11pending: [P1a] collect() 返回 state 字段（实 ' + JSON.stringify(r.state) + '）');
    a(r.total === 0, 'v11pending: [P1b] 空世界零待办（实 ' + r.total + '）');
    a(r.hands.length > 0, 'v11pending: [P1c] 零待办时 hands 非空（实 ' + JSON.stringify(r.hands) + '）——“没产出”与“没接上”的分界线');
    a(r.state === 'empty', 'v11pending: [P1d] 无故障无产出 ⇒ state===empty（实 ' + r.state + '）');
    a(r.faults.length === 0, 'v11pending: [P1e] 空世界零故障（实 ' + JSON.stringify(r.faults) + '）');
    un();
  }
  // P2 缺席模块
  {
    const WA = freshEnv();
    const keep = WA.commission;
    const un = stubModules(WA, { omit: ['commission'] });
    try { WA.commission = undefined; } catch (e) {}
    const r = WA.unifiedPending.collect();
    const hit = r.skipped.filter(function (x) { return x.module === 'commission'; });
    a(hit.length === 1, 'v11pending: [P2a] 缺席模块进入 skipped（实 ' + JSON.stringify(r.skipped.map(function (x) { return x.module; })) + '）');
    a(hit.length ? hit[0].reason === 'absent' : false, 'v11pending: [P2b] 缺席原因记为 absent（实 ' + (hit.length ? hit[0].reason : 'N/A') + '）');
    a(hit.length ? String(hit[0].detail || '').length > 0 : false, 'v11pending: [P2c] skipped 带可读 detail（实 ' + JSON.stringify(hit.length ? hit[0].detail : null) + '）');
    un();
    WA.commission = keep;
  }
  // P3 抛异常
  {
    const WA = freshEnv();
    const un = stubModules(WA, { throwOn: 'commission' });
    const r = WA.unifiedPending.collect();
    a(r.state === 'fault', 'v11pending: [P3a] 有模块抛异常 ⇒ state===fault（实 ' + r.state + '）——修前这里是 empty，把故障读成真空');
    const hit = r.faults.filter(function (x) { return x.module === 'commission'; });
    a(hit.length === 1, 'v11pending: [P3b] faults 含坏掉的模块名（实 ' + JSON.stringify(r.faults.map(function (x) { return x.module; })) + '）');
    a(hit.length ? String(hit[0].msg).indexOf('__v11pending_boom__') >= 0 : false, 'v11pending: [P3c] faults 带原始错误文本（实 ' + JSON.stringify(hit.length ? hit[0].msg : null) + '）');
    un();
  }
  // P4 fault 优先
  {
    const WA = freshEnv();
    const un = stubModules(WA, { throwOn: 'commission' });
    WA.storyChoice = { pending: function () { return { ok: true, points: [{ id: 'p1', title: '抉择' }] }; } };
    const r = WA.unifiedPending.collect();
    a(r.total > 0, 'v11pending: [P4a] 前置：本轮确实有产出（实 total=' + r.total + '）');
    a(r.state === 'fault', 'v11pending: [P4b] 有产出但仍有模块报错 ⇒ 报 fault 而不是 ok（实 ' + r.state + '）');
    a(r.faults.length === 1, 'v11pending: [P4c] 坏掉的那一台仍在 faults 里（实 ' + r.faults.length + '）');
    un();
  }
  // P5 三张名单恒在
  {
    const WA = freshEnv();
    const un = stubModules(WA, { throwOn: 'farfield' });
    const seen = [];
    WA.unifiedPending.collect();
    const r0 = WA.unifiedPending.collect();
    seen.push(r0);
    WA.storyChoice = { pending: function () { return { ok: true, points: [{ id: 'x', title: 't' }] }; } };
    seen.push(WA.unifiedPending.collect());
    const bad = seen.filter(function (x) { return !Array.isArray(x.hands) || !Array.isArray(x.skipped) || !Array.isArray(x.faults); });
    a(bad.length === 0, 'v11pending: [P5] 三张名单在任何态都是数组（不合格 ' + bad.length + ' 个）');
    un();
  }
  // P6 diagnose 同源
  {
    const WA = freshEnv();
    const un = stubModules(WA, { throwOn: 'investigation' });
    const c = WA.unifiedPending.collect();
    const d = WA.unifiedPending.diagnose();
    a(d.state === c.state, 'v11pending: [P6a] diagnose().state === collect().state（' + d.state + ' vs ' + c.state + '）');
    a(JSON.stringify(d.hands) === JSON.stringify(c.hands), 'v11pending: [P6b] hands 逐字一致');
    a(JSON.stringify(d.skipped) === JSON.stringify(c.skipped), 'v11pending: [P6c] skipped 逐字一致');
    a(JSON.stringify(d.faults) === JSON.stringify(c.faults), 'v11pending: [P6d] faults 逐字一致');
    a(d.pendingCount === c.total && d.highUrgency === c.highCount, 'v11pending: [P6e] 计数同源');
    un();
  }
  // P7 summary 随态变化
  {
    const WA = freshEnv();
    const un = stubModules(WA, {});
    const sEmpty = WA.unifiedPending.diagnose().summary;
    un();
    const WA2 = freshEnv();
    const un2 = stubModules(WA2, { throwOn: 'aftermath' });
    const sFault = WA2.unifiedPending.diagnose().summary;
    un2();
    a(sEmpty !== sFault, 'v11pending: [P7a] empty 与 fault 的 summary 不同');
    a(sEmpty.indexOf('没产出') >= 0 || sEmpty.indexOf('没有待办') >= 0, 'v11pending: [P7b] empty 的 summary 说清“不是没接上，是真没事”（实 ' + JSON.stringify(sEmpty.slice(0, 60)) + '）');
    a(sFault.indexOf('故障') >= 0, 'v11pending: [P7c] fault 的 summary 明确报故障（实 ' + JSON.stringify(sFault.slice(0, 60)) + '）');
  }
  // P8 stat 透出 state
  {
    const WA = freshEnv();
    const un = stubModules(WA, { throwOn: 'operations' });
    const s = WA.unifiedPending.stat();
    a(s.state === 'fault', 'v11pending: [P8a] stat().state 反映真实态（实 ' + JSON.stringify(s.state) + '）');
    a(typeof s.hands === 'number' && typeof s.skipped === 'number' && typeof s.faults === 'number', 'v11pending: [P8b] stat 同时给三张名单长度（实 ' + JSON.stringify(s) + '）');
    un();
  }
  // P9 纯只读
  {
    const WA = freshEnv();
    const un = stubModules(WA, {});
    const before = JSON.stringify(WA.store.get());
    WA.unifiedPending.collect();
    WA.unifiedPending.diagnose();
    WA.unifiedPending.stat();
    const after = JSON.stringify(WA.store.get());
    a(before === after, 'v11pending: [P9] collect/diagnose/stat 纯只读（store 深比较相等）');
    un();
  }
}

function runNegative(a) {
  const src = fs.readFileSync(path.join(BASE, TARGET), 'utf8');
  const A_FAULT = "const state = faults.length ? 'fault' : (list.length ? 'ok' : 'empty');";
  const A_CATCH = "} catch (e) { markFault('commission', e); }";
  const nF = src.split(A_FAULT).length - 1;
  const nC = src.split(A_CATCH).length - 1;
  a(nF === 1, 'v11pending: [N0a] 三态判定锚点在真源码中恰中 1 次（实 ' + nF + '）');
  a(nC === 1, 'v11pending: [N0b] 故障采集锚点在真源码中恰中 1 次（实 ' + nC + '）');
  {
    const broken = src.replace(A_FAULT, "const state = list.length ? 'ok' : 'empty';");
    a(broken !== src, 'v11pending: [N1a] 破坏确实发生（fault 判定被摘掉）');
    const env = sync.fresh({ files: [TARGET], srcOverride: { [TARGET]: broken } });
    env.WA.store.init();
    const WA = env.WA;
    const un = stubModules(WA, { throwOn: 'commission' });
    const r = WA.unifiedPending.collect();
    a(r.state !== 'fault', 'v11pending: [N1b] 破坏后 fault 态不可达（实 ' + r.state + '）⇒ P3a 不是恒真判据');
    un();
  }
  {
    const broken = src.replace(A_CATCH, '} catch (e) {}');
    const env = sync.fresh({ files: [TARGET], srcOverride: { [TARGET]: broken } });
    env.WA.store.init();
    const WA = env.WA;
    const un = stubModules(WA, { throwOn: 'commission' });
    const r = WA.unifiedPending.collect();
    a(r.faults.length === 0 && r.state !== 'fault', 'v11pending: [N2] 退回静默 catch 后故障在读数里完全消失（faults=' + r.faults.length + ' state=' + r.state + '）');
    un();
  }
  {
    const anchor = "skipped.push({ module: mod, reason: 'absent', detail: 'WA.' + mod + ' 不存在' });";
    const n3 = src.split(anchor).length - 1;
    a(n3 === 1, 'v11pending: [N3a] 缺席登记锚点在真源码中恰中 1 次（实 ' + n3 + '）');
  }
  {
    const env = sync.fresh();
    env.WA.store.init();
    const WA = env.WA;
    const un = stubModules(WA, { throwOn: 'commission' });
    const r = WA.unifiedPending.collect();
    a(r.state === 'fault' && r.faults.length === 1, 'v11pending: [N4] 原版上同款判据仍成立（state=' + r.state + '）');
    un();
  }
}

module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative)
};

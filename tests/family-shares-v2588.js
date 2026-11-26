#!/usr/bin/env node
// WorldAxis tests/family-shares-v2588.js (v2.588.0) — EXP-9b 专锁：继承的自定义比例分配
//
// 【它治什么】
//   `engines/family.js` 的 `inherit()` 此前只有**均分**一条路（`total / heirNames.length`）。
//   验收原文写的是「按**本世界规则**分配已有资产」——「规则」在真实世界里不是均分：
//   长子多分、配偶优先、被照顾者多留。均分是「没有规则时的兜底」，不是规则本身。
//   本轮补上第五参数 `shares`（权重表），并把它钉在四条边界上：
//
//   · **不传 = 均分**：旧行为必须逐字不变（本锁 B1 与既有 exp9 锁同批绿才算）。
//   · **拒收在写事务之前**：比例非法时**一个字节都不许写**（D1 用文档指纹逐字比对）。
//   · **写错名字不许静默少分**：`shares` 里出现非继承人名字 ⇒ `invalid-shares`，
//     并把那个名字报回来（C1）——「张三」写成「张叁」而钱照样分完，是这里最贵的错。
//   · **零权重如实报 `excluded`**：被排除的人不是「不存在」，是「这一份不给他」（B3/D2）。
//
// 【四段结构】A 静态契约 / B 分配语义 / C 拒收面 / D 零污染与可核性
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const PR = 'engines/family.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }

// 本锁自用的人物名（带 fs 前缀，避免与共享 store 里的同名人物互相污染）
const A = 'fs甲', B = 'fs乙', C = 'fs丙';

function withStore(fn) {
  const WA = (typeof global !== 'undefined' && global.WorldAxis) || (global.window && global.window.WorldAxis);
  if (!WA || !WA.store || !WA.family) throw new Error('需要真产品环境（global.WorldAxis.store / .family）');
  // 备份 → 建人 → 跑 → 还原（还原在 finally 里，断言抛异常也不留脏档）
  const before = JSON.parse(JSON.stringify(WA.store.get() || {}));
  try {
    WA.store.transact(function (d) {
      d.people = d.people || {};
      d.people['p_' + A] = { id: 'p_' + A, name: A, resources: { '金币': 100, '粮食': 20 }, updatedAt: 1 };
      d.people['p_' + B] = { id: 'p_' + B, name: B, resources: {}, updatedAt: 1 };
      d.people['p_' + C] = { id: 'p_' + C, name: C, resources: {}, updatedAt: 1 };
      return true;
    }, 'fshares:seed');
    const u = WA.family.createUnit({ name: '分配测试单位', type: '合伙', by: A });
    WA.family.addMember(u.id, B, '成员');
    WA.family.addMember(u.id, C, '成员');
    return fn(WA, u.id);
  } finally {
    try {
      WA.store.transact(function (d) {
        ['p_' + A, 'p_' + B, 'p_' + C].forEach(function (k) { if (d.people) delete d.people[k]; });
        if (d.family && Array.isArray(d.family.units)) {
          d.family.units = d.family.units.filter(function (x) { return x.name !== '分配测试单位'; });
        }
        return true;
      }, 'fshares:restore');
    } catch (e) { /* 还原失败不许掩盖真判据 */ }
  }
}

/** 存档指纹：只取本锁碰得着的两面（人物资源 + 家庭账），逐字比对。 */
function fp(WA) {
  const s = WA.store.get() || {};
  const people = {};
  ['p_' + A, 'p_' + B, 'p_' + C].forEach(function (k) {
    const p = s.people && s.people[k];
    people[k] = p ? (p.resources || null) : null;
  });
  return JSON.stringify({ people: people, family: s.family || null });
}

function runAll(a) {
  /* ============ A 静态契约 ============ */
  const S = rd(PR);
  a(S.indexOf('function normalizeShares(heirNames, shares)') >= 0,
    'A1: 比例归一化是一个单独的函数（不是塞在 inherit 里的十几行局部逻辑）');
  a(S.indexOf('function inherit(unitId, deceased, heirs, event, shares)') >= 0,
    'A2: inherit 第五参数就是 shares（旧四参调用不受影响）');
  const iFn = S.indexOf('function inherit(unitId, deceased, heirs, event, shares) {');
  const iEnd = S.indexOf('function list()', iFn);
  const body = S.slice(iFn, iEnd > iFn ? iEnd : S.length);
  const iPlan = body.indexOf('const plan = normalizeShares(heirNames, shares);');
  const iTx = body.indexOf('WA.store.transact(');
  a(iFn > 0 && iPlan > 0 && iTx > 0 && iPlan < iTx,
    'A3: 比例校验在 inherit 的写事务**之前**（非法比例不许进事务；位置 ' + iPlan + ' vs ' + iTx + '）');
  a(cnt(S, 'invalid-shares') >= 4,
    'A4: 拒收码 invalid-shares 在四处以上出现（类型/名字/值/全零各一处）');
  a(S.indexOf("mode: plan.mode") >= 0, 'A5: 账里记 mode（均分与按比例事后可分辨）');
  a(S.indexOf("excluded: plan.excluded.slice()") >= 0, 'A6: 账里记 excluded（被排除的人不在账上消失）');

  /* ============ B 分配语义 ============ */
  // B1 不传 shares ⇒ 均分（旧行为逐字不变）
  withStore(function (WA, uid) {
    const r = WA.family.inherit(uid, A, [B, C], '均分事件');
    a(r.ok === true, 'B1a: 不传 shares 仍然成功（旧调用形态不受影响）');
    a(r.mode === 'even', 'B1b: mode 报 even（实 ' + r.mode + '）');
    a(r.weights === null, 'B1c: 均分时 weights 为 null（不编一份「每人 0.5」的假比例）');
    a(r.excluded.length === 0, 'B1d: 均分时无人被排除');
    const s = WA.store.get();
    a(s.people['p_' + B].resources['金币'] === 50 && s.people['p_' + C].resources['金币'] === 50,
      'B1e: 金币 100 → 50/50（实 ' + s.people['p_' + B].resources['金币'] + '/'
      + s.people['p_' + C].resources['金币'] + '）');
    a(s.people['p_' + A].resources['金币'] === 0, 'B1f: 被继承者扣到 0（不凭空复制）');
  });

  // B2 3:2 ⇒ 60/40（权重内部归一）
  withStore(function (WA, uid) {
    const sh = {}; sh[B] = 3; sh[C] = 2;
    const r = WA.family.inherit(uid, A, [B, C], '按比例事件', sh);
    a(r.ok === true, 'B2a: 比例分配成功');
    a(r.mode === 'weighted', 'B2b: mode 报 weighted');
    a(Math.abs(r.weights[0] + r.weights[1] - 1) < 1e-12, 'B2c: 归一后权重和为 1（实 '
      + (r.weights[0] + r.weights[1]) + '）');
    const s = WA.store.get();
    a(s.people['p_' + B].resources['金币'] === 60, 'B2d: 3/5 ⇒ 60（实 ' + s.people['p_' + B].resources['金币'] + '）');
    a(s.people['p_' + C].resources['金币'] === 40, 'B2e: 2/5 ⇒ 40（实 ' + s.people['p_' + C].resources['金币'] + '）');
  });

  // B3 零权重 ⇒ excluded 报出、该人一分不得
  withStore(function (WA, uid) {
    const sh = {}; sh[B] = 1; sh[C] = 0;
    const r = WA.family.inherit(uid, A, [B, C], '排除事件', sh);
    a(r.ok === true, 'B3a: 有人 0 权重仍然成功（不是拒收）');
    a(r.excluded.length === 1 && r.excluded[0] === C, 'B3b: excluded 报出「' + C + '」（实 '
      + JSON.stringify(r.excluded) + '）');
    const s = WA.store.get();
    a(s.people['p_' + B].resources['金币'] === 100, 'B3c: 独家继承者拿全部 100');
    a(!s.people['p_' + C].resources['金币'], 'B3d: 被排除者账上没有这一笔（不是 0 元入账）');
  });

  // B4 守恒：三份 1:1:1 分 7 枚金币，余量不丢
  withStore(function (WA, uid) {
    WA.store.transact(function (d) { d.people['p_' + A].resources['金币'] = 7; return true; }, 'fshares:b4');
    const sh = {}; sh[B] = 1; sh[C] = 1;
    const r = WA.family.inherit(uid, A, [B, C], '守恒事件', sh);
    const sum = (r.distributed['金币'] || 0);
    a(Math.abs(sum - 7) < 1e-12, 'B4a: distributed 合计 === 7（实 ' + sum + '）—— 余量不许销毁');
    const s = WA.store.get();
    const got = s.people['p_' + B].resources['金币'] + s.people['p_' + C].resources['金币'];
    a(Math.abs(got - 7) < 1e-12, 'B4b: 两人到手合计 === 7（实 ' + got + '）—— 也不许多出来');
  });

  /* ============ C 拒收面（全部 invalid-shares，且都要报出是谁） ============ */
  function refuseCase(label, shares, expectWho, name) {
    withStore(function (WA, uid) {
      const before = fp(WA);
      const r = WA.family.inherit(uid, A, [B, C], '拒收事件', shares);
      a(r.ok === false && r.reason === 'invalid-shares', name + 'a: ' + label + ' ⇒ invalid-shares（实 '
        + r.ok + '/' + r.reason + '）');
      if (expectWho !== null) {
        a(r.who === expectWho, name + 'b: 报出问题项「' + expectWho + '」（实 ' + JSON.stringify(r.who) + '）');
      }
      a(fp(WA) === before, name + 'c: 拒收后存档逐字未变（零污染）');
    });
  }
  function sh1(v1, key2, v2) { const o = {}; o[B] = v1; o[key2] = v2; return o; }
  refuseCase('非继承人名字', sh1(1, '不存在的人', 1), '不存在的人', 'C1');
  refuseCase('负权重', sh1(1, C, -1), C, 'C2');
  refuseCase('非数值权重', sh1(1, C, '四成'), C, 'C3');
  refuseCase('全零权重', sh1(0, C, 0), null, 'C4');
  refuseCase('空权重表', {}, null, 'C5');
  withStore(function (WA, uid) {
    const before = fp(WA);
    const r = WA.family.inherit(uid, A, [B, C], '拒收事件', [1, 1]);
    a(r.ok === false && r.reason === 'invalid-shares', 'C6a: 传数组 ⇒ invalid-shares（实 ' + r.reason + '）');
    a(fp(WA) === before, 'C6b: 拒收后存档逐字未变');
  });
  // 名字带空格：洗过之后是同一人，不许因此少分
  withStore(function (WA, uid) {
    const sh = {}; sh[' ' + B] = 1; sh[C] = 1;
    const r = WA.family.inherit(uid, A, [B, C], '空格名字事件', sh);
    a(r.ok === true, 'C7a: 名字带前导空格仍认得出是同一人（不拒收，实 ' + r.reason + '）');
    const s = WA.store.get();
    a(s.people['p_' + B].resources['金币'] === 50, 'C7b: 该人照常分到 50（实 '
      + s.people['p_' + B].resources['金币'] + '）');
  });

  /* ============ D 可核性 ============ */
  withStore(function (WA, uid) {
    const sh = {}; sh[B] = 3; sh[C] = 0;
    WA.family.inherit(uid, A, [B, C], '可核事件', sh);
    const v = WA.family.view(uid);
    a(v.ok === true && v.id === uid, 'D0: view(uid) 取到本单位（实 ' + v.ok + '/' + v.reason + '）');
    const row = (v.inheritances || [])[0];
    a(row && row.mode === 'weighted', 'D1: view 的继承记录带 mode（实 ' + (row && row.mode) + '）');
    a(row && row.excluded && row.excluded[0] === C, 'D2: view 的继承记录带 excluded');
    const blk = WA.family.buildBlock();
    a(typeof blk === 'string' && blk.indexOf('已完成财产交接') >= 0,
      'D3: buildBlock 仍报出交接行（读数面不因新增参数而空白）');
  });

  /* ============ E 两向自证：均分口径未被悄悄改掉 ============ */
  a(S.indexOf('const rate = plan.mode === \'even\' ? (1 / slots.length) : plan.weights[index];') >= 0,
    'E1: 均分分支仍走 1/n（不是被比例分支顶掉）');
  a(S.indexOf('const give = (k === slots.length - 1) ? remaining : Math.min(total * rate, remaining);') >= 0,
    'E2: 最后一名拿余量这一行仍在（守恒的唯一来源）');

  return { ok: true };
}

module.exports = { runAll: runAll };

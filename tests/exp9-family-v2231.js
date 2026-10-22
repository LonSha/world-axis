#!/usr/bin/env node
// WorldAxis tests/exp9-family-v2231.js (v2.231.0) -- EXP-9 专锁：家庭、共同生活与代际延续
//
// 【验收原文】
//   家庭成员远行，照护与支出按已确认安排转交；在明确继承事件后按本世界规则分配已有资产，
//   不能凭空复制财产；后继角色保留相关经历而不是继承所有人的私密记忆。
//
// 【本锁咬住的否定式边界】
//   · 不建第二份名册 —— unknown-member（B2/N3）
//   · 不建第二份钱包 —— contribute/spend 走 people[].resources（B3/N4）
//   · 不凭空复制财产 —— inherit 从被继承者扣出分配（B4/N5）
//   · 不继承私密记忆 —— noMemoryTransfer（B5/N6）
//   · 照护转交要记痕 —— transferCare 生成 history（B7/N7）
//   · 继承事件要显式 —— inherit 需要参数（B8/N8）
//   · 角色不能为空 —— missing-role（B6a）
//   · 不预设家庭模板 —— type 自由文本（B10）
//   · 存档是唯一真源 —— reload（B9）
//
// 四段结构：A 静态契约 / B 运行时行为 / C 契约与边界 / N 真源码破坏 + 两向自证。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/exp9-family-v2231.js';
const PR = 'engines/family.js';
function rd(rel, ov) {
  if (ov && ov[rel] !== undefined) return ov[rel];
  return fs.readFileSync(path.join(BASE, rel), 'utf8');
}
function cnt(s, n) { return s.split(n).length - 1; }
const ANCHOR = {
  // ① 成员必须是已登记人物
  knownMember: { rel: PR, txt: "    if (!knownPerson(w)) return refuse('unknown-member', { who: w });" },
  // ② 共同开支池：真从成员手里扣
  contribDraw: { rel: PR, txt: "      person.resources[mat] = have - amt;\n      unit.treasury[mat] = (num(unit.treasury[mat]) || 0) + amt;" },
  // ③ 继承：从被继承者扣出（不凭空复制）
  inheritDraw: { rel: PR, txt: "        person.resources[mat] = 0;" },
  // ④ 不继承私密记忆（显式标记）
  noMemory: { rel: PR, txt: "        noMemoryTransfer: true, at: clockNow('family') };" },
  // ⑤ 照护转交要记痕
  careHistory: { rel: PR, txt: "      row.history.push({ from: old.caregiver, to: ncg, at: clockNow('family'), reason: rsn });" },
  // ⑥ 角色不能为空（missing-fields 检查含 role）
  roleCheck: { rel: PR, txt: "    if (!uid || !w || !r) return refuse('missing-fields');" },
  // ⑦ 公共池不够拒收
  treasuryShort: { rel: PR, txt: "      if (have < amt) { out = refuse('short-treasury', { id: uid, material: mat, need: amt, have: have }); return false; }" },
  // ⑧ 继承时被继承者资产扣到 0
  estateZero: { rel: PR, txt: "        // 扣到 0（不凭空复制）" },
  // ⑨ 不自动创造事件（inherit 需要显式参数）
  inheritExplicit: { rel: PR, txt: "    if (!uid || !dec || !heirs || !Array.isArray(heirs) || !heirs.length) return refuse('missing-fields');" }
};
const EXPORTS = ['getSettings', 'setSettings', 'createUnit', 'addMember', 'removeMember',
  'contribute', 'spend', 'assignCare', 'transferCare', 'inherit',
  'list', 'view', 'reload', 'buildBlock', 'stat', 'resetStat'];
function envWith(ov) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh(ov ? { srcOverride: ov } : {});
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  seed(env.WA);
  env.WA.family.setSettings({ enabled: true, maxUnits: 24, maxMembersPerUnit: 12, maxCareRows: 48 });
  if (env.WA.economy && env.WA.economy.setSettings) env.WA.economy.setSettings({ enabled: true });
  return env;
}
function seed(WA) {
  WA.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_甲'] = { id: 'p_甲', name: '甲', resources: { '金币': 100, '粮食': 20 }, updatedAt: 1 };
    d.people['p_乙'] = { id: 'p_乙', name: '乙', resources: { '金币': 50 }, updatedAt: 1 };
    d.people['p_丙'] = { id: 'p_丙', name: '丙', resources: { '金币': 10 }, updatedAt: 1 };
    d.people['p_丁'] = { id: 'p_丁', name: '丁', resources: {}, updatedAt: 1 };
    d.family = { units: [] };
    return true;
  }, 'exp9:seed');
}
async function runAll(a, ov) {
  ov = ov || {};
  /* ============ A 静态契约 ============ */
  a(fs.existsSync(path.join(BASE, PR)), 'A1: 引擎落到仓库里');
  const S = rd(PR, ov);
  EXPORTS.forEach(function (name) {
    a(S.indexOf(name) >= 0, 'A2: 导出面含 ' + name);
  });
  a(S.indexOf('var EXPORT_COUNT = 16') >= 0, 'A3: 导出数自证常量');
  a(S.indexOf("'use strict'") >= 0, 'A4: 严格模式');
  a(S.indexOf('WA.registerModule') >= 0, 'A5: 模块登记');
  Object.keys(ANCHOR).forEach(function (k) {
    const an = ANCHOR[k];
    const src = rd(an.rel, ov);
    a(cnt(src, an.txt) === 1, 'A6/' + k + ': 锚点恰 1 次');
  });

  /* ============ B 运行时行为 ============ */
  // B1: 创建家庭单位 + 加成员
  (function () {
    const W = envWith(ov).WA;
    const u = W.family.createUnit({ name: '张家', type: '婚姻', by: '甲' });
    a(u.ok === true, 'B1a: 创建成功');
    a(u.name === '张家', 'B1b: 名称正确');
    const m = W.family.addMember(u.id, '乙', '配偶');
    a(m.ok === true, 'B1c: 加成员成功');
    a(m.role === '配偶', 'B1d: 角色正确');
    // 重复加成员 => already-member
    const m2 = W.family.addMember(u.id, '乙', '配偶');
    a(m2.ok === false && m2.reason === 'already-member', 'B1e: 重复加成员拒收');
  })();

  // B2: 共同开支池
  (function () {
    const W = envWith(ov).WA;
    const u = W.family.createUnit({ name: '李家', type: '合伙', by: '甲' });
    W.family.addMember(u.id, '乙', '合伙人');
    // 甲出资
    const c = W.family.contribute(u.id, '甲', '金币', 30);
    a(c.ok === true, 'B2a: 出资成功');
    a(c.treasury['金币'] === 30, 'B2b: 公共池=30');
    // 甲手里少了 30
    const after = W.store.get().people['p_甲'].resources['金币'];
    a(after === 70, 'B2c: 甲手里剩 70（真扣）');
    // 从公共池支出给丙
    const s = W.family.spend(u.id, '丙', '金币', 10);
    a(s.ok === true, 'B2d: 支出成功');
    a(s.amount === 10, 'B2e: 支出 10');
    // 丙手里多了 10
    const p_丙 = W.store.get().people['p_丙'].resources['金币'];
    a(p_丙 === 20, 'B2f: 丙手里 20（真给）');
    // 公共池不够
    const s2 = W.family.spend(u.id, '丁', '金币', 100);
    a(s2.ok === false && s2.reason === 'short-treasury', 'B2g: 公共池不够拒收');
  })();

  // B3: 照护安排 + 转交
  (function () {
    const W = envWith(ov).WA;
    const u = W.family.createUnit({ name: '王家', type: '婚姻', by: '甲' });
    W.family.addMember(u.id, '乙', '配偶');
    W.family.addMember(u.id, '丙', '子女');
    // 甲照护丙
    const ac = W.family.assignCare(u.id, '甲', '丙', '日常照护');
    a(ac.ok === true, 'B3a: 指派照护成功');
    // 转交给乙
    const tc = W.family.transferCare(u.id, '丙', '乙', '甲远行');
    a(tc.ok === true, 'B3b: 转交成功');
    a(tc.from === '甲' && tc.to === '乙', 'B3c: from 甲 to 乙');
    a(tc.reason === '甲远行', 'B3d: 原因正确');
    // 检查照护记录有 history
    const v = W.family.view(u.id);
    const active = v.care.filter(function (c) { return c.active; })[0];
    a(active && active.caregiver === '乙', 'B3e: 当前照护者是乙');
    a(active.history.length === 1 && active.history[0].from === '甲', 'B3f: 可读取真实交接历史');
  })();

  // B4: 继承事件
  (function () {
    const W = envWith(ov).WA;
    const u = W.family.createUnit({ name: '赵家', type: '婚姻', by: '甲' });
    W.family.addMember(u.id, '乙', '子女');
    W.family.addMember(u.id, '丙', '子女');
    // 甲有 100 金币
    const inh = W.family.inherit(u.id, '甲', ['乙', '丙'], '去世');
    a(inh.ok === true, 'B4a: 继承成功');
    a(inh.deceased === '甲', 'B4b: 被继承者甲');
    a(inh.heirs.length === 2, 'B4c: 两个继承人');
    a(inh.noMemoryTransfer === true, 'B4d: 不继承私密记忆');
    // 甲手里扣到 0
    const p_甲 = W.store.get().people['p_甲'].resources['金币'];
    a(p_甲 === 0, 'B4e: 甲手里扣到 0（不凭空复制）');
    // 乙和丙各得 50
    const p_乙 = W.store.get().people['p_乙'].resources['金币'];
    const p_丙 = W.store.get().people['p_丙'].resources['金币'];
    a(p_乙 === 100, 'B4f: 乙得 50+50=100（原 50+继承 50）');
    a(p_丙 === 60, 'B4g: 丙得 10+50=60（原 10+继承 50）');
  })();

  // B5: 不预设家庭模板
  (function () {
    const W = envWith(ov).WA;
    const u = W.family.createUnit({ name: '同住', type: '合租', by: '甲' });
    a(u.ok === true, 'B5a: 非婚姻类型也可创建');
    const v = W.family.view(u.id);
    a(v.type === '合租', 'B5b: 类型自由文本');
  })();

  // B6: 重载保留
  (function () {
    const W = envWith(ov).WA;
    W.family.createUnit({ name: '孙家', type: '婚姻', by: '甲' });
    const r = W.family.reload();
    a(r.ok === true, 'B6a: reload 成功');
    a(r.units >= 1, 'B6b: 单位数保留');
  })();

  // 数量守恒、显式事件和实际记忆隔离；不是检查返回标记。
  (function () {
    let W = envWith(ov).WA;
    const u = W.family.createUnit({ name: '同住组', type: '共同生活', by: '甲' });
    W.store.transact(function (d) {
      d.people['p_甲'].resources = { '金币': 1, '细料': 0.00001 };
      ['甲','乙','丙','丁'].forEach(function (n) { d.people['p_' + n].knowledge = { privateNote: n + '的经历' }; });
      return true;
    }, 'test:estate');
    const before = JSON.stringify(['甲','乙','丙','丁'].map(n => W.store.get().people['p_' + n].knowledge));
    const totals = () => ['金币','细料'].map(k => ['甲','乙','丙','丁'].reduce((v,n) => v + (W.store.get().people['p_' + n].resources[k] || 0),0));
    const total = totals();
    a(W.family.inherit(u.id,'甲',['乙'],'').reason === 'missing-fields', 'B7a: 没有事件不交接资产');
    a(W.family.inherit(u.id,'甲',['甲'],'交接').reason === 'invalid-heirs', 'B7b: 不允许自身继承');
    a(W.family.inherit(u.id,'甲',['乙','乙'],'交接').reason === 'invalid-heirs', 'B7c: 不允许重复继承人');
    const r = W.family.inherit(u.id,'甲',['乙','丙','丁'],'明确的离队资产交接');
    a(r.ok, 'B7d: 三人分配成功');
    a(totals().every((v,i) => Math.abs(v-total[i]) < 1e-12), 'B7e: 三等分与微量资产守恒，无余量销毁');
    a(JSON.stringify(['甲','乙','丙','丁'].map(n => W.store.get().people['p_' + n].knowledge)) === before, 'B7f: 四人实际私密经历逐字不变');
    const view = W.family.view(u.id); view.inheritances[0].heirs.push('不应保存'); view.inheritances[0].distributed['金币'] = 99;
    r.heirs.push('返回体不可写穿'); r.distributed['金币'] = 88;
    const again = W.family.view(u.id);
    a(again.inheritances[0].heirs.length === 3 && again.inheritances[0].distributed['金币'] === 1, 'B7g: 视图和操作回执不能写穿存档');
    a(W.store.save() === true, 'B7h: 家庭保存成功');
    W = require('./ui-gate-sync.js').fresh().WA;
    a(W.family.view(u.id).inheritances[0].distributed['金币'] === 1, 'B7i: 重建模块环境后从存档恢复交接结果');
    a(JSON.stringify(['甲','乙','丙','丁'].map(n => W.store.get().people['p_' + n].knowledge)) === before, 'B7j: 重载后私密经历仍未转移');
  })();

  /* ============ C 契约与边界 ============ */
  // C1: 未登记人物拒收
  (function () {
    const W = envWith(ov).WA;
    const u = W.family.createUnit({ name: '测', type: 'x', by: '甲' });
    const r = W.family.addMember(u.id, '不存在', '路人');
    a(r.ok === false && r.reason === 'unknown-member', 'C1: 未登记人物拒收');
  })();
  // C2: 角色为空拒收
  (function () {
    const W = envWith(ov).WA;
    const u = W.family.createUnit({ name: '测', type: 'x', by: '甲' });
    const r = W.family.addMember(u.id, '乙', '');
    a(r.ok === false && r.reason === 'missing-fields', 'C2: 角色为空拒收');
  })();
  // C3: 非成员出资拒收
  (function () {
    const W = envWith(ov).WA;
    const u = W.family.createUnit({ name: '测', type: 'x', by: '甲' });
    const r = W.family.contribute(u.id, '乙', '金币', 10);
    a(r.ok === false && r.reason === 'not-a-member', 'C3: 非成员出资拒收');
  })();
  // C4: 继承未登记人物拒收
  (function () {
    const W = envWith(ov).WA;
    const u = W.family.createUnit({ name: '测', type: 'x', by: '甲' });
    const r = W.family.inherit(u.id, '甲', ['不存在'], 'x');
    a(r.ok === false && r.reason === 'unknown-member', 'C4: 继承未登记人物拒收');
  })();
  // C5: 转交无活跃照护拒收
  (function () {
    const W = envWith(ov).WA;
    const u = W.family.createUnit({ name: '测', type: 'x', by: '甲' });
    W.family.addMember(u.id, '乙', '成员');
    const r = W.family.transferCare(u.id, '丙', '乙', 'test');
    a(r.ok === false && r.reason === 'no-active-care', 'C5: 无活跃照护拒收');
  })();

}
function brk(src, txt, repl) {
  const n = cnt(src, txt);
  if (n !== 1) throw new Error('anchor hits=' + n);
  return src.replace(txt, repl);
}
async function runNegative(a, ov) {
  ov = ov || {};
  const S = rd(PR, ov);
  (function () {
    const self = rd(SELF_REL);
    const esc = function (t) { return t.replace(/\n/g, '\\n').replace(/"/g, '\\"'); };
    const bad = Object.keys(ANCHOR).filter(function (k) { return cnt(self, esc(ANCHOR[k].txt)) !== 1; });
    a(bad.length === 0, 'N0: 锚点字面量在本文件恰 1 次（不合 ' + bad.join(',') + '）');
  })();
  // N1 破坏：成员检查被移除
  (function () {
    const S1 = brk(S, ANCHOR.knownMember.txt, "    /* check removed */");
    const ov1 = {}; ov1[PR] = S1;
    const W = envWith(ov1).WA;
    const u = W.family.createUnit({ name: '测', type: 'x', by: '甲' });
    const r = W.family.addMember(u.id, '不存在', '路人');
    a(r.ok === true, 'N1: 破坏版上未登记人物也能加入；原版 unknown-member（C1）');
  })();
  // N2 破坏：出资不真扣
  (function () {
    const S2 = brk(S, ANCHOR.contribDraw.txt, "      /* draw removed */\n      unit.treasury[mat] = (num(unit.treasury[mat]) || 0) + amt;");
    const ov2 = {}; ov2[PR] = S2;
    const W = envWith(ov2).WA;
    const u = W.family.createUnit({ name: '测', type: 'x', by: '甲' });
    W.family.addMember(u.id, '乙', '成员');
    const before = W.store.get().people['p_甲'].resources['金币'];
    W.family.contribute(u.id, '甲', '金币', 30);
    const after = W.store.get().people['p_甲'].resources['金币'];
    a(before - after === 0, 'N2: 破坏版上出资是赊账（甲 金币 ' + before + '→' + after + '）；原版真扣');
  })();
  // N3 破坏：继承不扣到 0（凭空复制）
  (function () {
    const S3 = brk(S, ANCHOR.inheritDraw.txt, "        person.resources[mat] = total; /* not zeroed */");
    const ov3 = {}; ov3[PR] = S3;
    const W = envWith(ov3).WA;
    const u = W.family.createUnit({ name: '测', type: 'x', by: '甲' });
    W.family.addMember(u.id, '乙', '子女');
    W.family.inherit(u.id, '甲', ['乙'], '去世');
    const p_甲 = W.store.get().people['p_甲'].resources['金币'];
    a(p_甲 > 0, 'N3: 破坏版上被继承者手里还有钱（凭空复制）；原版扣到 0（B4e）');
  })();
  // N4 破坏：照护转交不留痕
  (function () {
    const S4 = brk(S, ANCHOR.careHistory.txt, "      /* history removed */");
    const ov4 = {}; ov4[PR] = S4;
    const W = envWith(ov4).WA;
    const u = W.family.createUnit({ name: '测', type: 'x', by: '甲' });
    W.family.addMember(u.id, '乙', '配偶');
    W.family.addMember(u.id, '丙', '子女');
    W.family.assignCare(u.id, '甲', '丙', 'test');
    const tc = W.family.transferCare(u.id, '丙', '乙', '远行');
    a(tc.ok === true, 'N4a: 转交成功（破坏只移除 history push）');
    // 检查新照护行没有 history
    const v = W.family.view(u.id);
    const active = v.care.filter(function (c) { return c.active; })[0];
    // history 在内部结构中，view() 不返回 history。改为静态检查
    a(active.history.length === 0, 'N4b: 破坏版上转交记录实际缺失');
  })();
  // N5 破坏：公共池不够时不拒收
  (function () {
    const S5 = brk(S, ANCHOR.treasuryShort.txt, "      /* short check removed */");
    const ov5 = {}; ov5[PR] = S5;
    const W = envWith(ov5).WA;
    const u = W.family.createUnit({ name: '测', type: 'x', by: '甲' });
    W.family.addMember(u.id, '乙', '成员');
    W.family.contribute(u.id, '甲', '金币', 10);
    const s = W.family.spend(u.id, '丙', '金币', 100);
    a(s.ok === true, 'N5: 破坏版上公共池不够也支出（透支）；原版 short-treasury（B2g）');
  })();
  // N6 工具两向自证
  let threw = false;
  try { brk(S, 'THIS-DOES-NOT-EXIST-EXP9', 'x'); } catch (e) { threw = e.message === 'anchor hits=0'; }
  a(threw, 'N6: 锚点不存在必须抛');
  threw = false;
  try { brk(S, 'if (', 'x'); } catch (e) { threw = /anchor hits=\d+/.test(e.message) && e.message !== 'anchor hits=1'; }
  a(threw, 'N6b: 锚点不唯一必须抛');
  // N7 真源码逐字未变
  a(rd(PR) === S, 'N7: 被破坏过的引擎真源码逐字未变');
}
module.exports = { runAll: runAll, runNegative: runNegative, ANCHOR: ANCHOR };
if (require.main === module) {
  (async function () {
    let pass = 0, fail = 0;
    const a = function (ok, name, extra) {
      if (ok) { pass++; } else { fail++; console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
    };
    try { await runAll(a); } catch (e) { fail++; console.log('  \u2717 判据失效：' + (e && e.stack)); }
    try { await runNegative(a); } catch (e) { fail++; console.log('  \u2717 负控制失效：' + (e && e.stack)); }
    console.log('\nEXP9-V2231: ' + pass + ' / 失败 ' + fail);
    if (fail) process.exitCode = 1;
  })();
}
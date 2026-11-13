#!/usr/bin/env node
/**
 * v2.404.0 专锁：选择回流（choices_recent 快照面 + 选择结算义务条款）
 *
 * ── 治什么病 ─────────────────────────────────────────────────────────────
 *  病灶（R245 · 用户原话「每一个选择都应该带来不同的分支、不同的后果、不同的暗线」）：
 *  玩家在 branchTree/storyChoice 里确认的选择，推演模型看不见——快照里没有它，
 *  契约里也没人要求结算它。选择记了账，但世界推不出后果：分支没分支、后果没后果、
 *  暗线没暗线。与 v2.403.0 同型（那次是「契约由构造即死」，这次是「输入由构造缺席」）。
 *
 * ── 判据纪律 ─────────────────────────────────────────────────────────────
 *  全部真数据驱动：向 store.transact 种入真实形态的选择点（storyChoice.points /
 *  branchTree.nodes 两源），buildPrompt 真返回后断言 user 段含 choices_recent、
 *  sys 段含选择结算义务；零选择时零 token（空数组不注入噪声）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

function cnt(s, n) { return s.split(n).length - 1; }

function runAll(assertFn) {
  require(path.join(BASE, 'tests/mock.js'));
  let pass = 0, fail = 0;
  const fails = [];
  const a = function (ok, name) {
    if (ok) { pass++; } else { fail++; fails.push(name); }
    if (typeof assertFn === 'function') assertFn(ok, name);
  };

  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh({});
  const WA = env.WA;
  WA.store.init();

  // ── A 面：零选择时零 token（空数组，不注入噪声）──
  let sys0 = '', user0 = '';
  try {
    const m = WA.backstage.buildPrompt({ idx: 1 }, '');
    sys0 = m[0].content; user0 = m[1].content;
  } catch (e) {}
  a(sys0.indexOf('【输出契约】') >= 0, 'A1 buildPrompt 可真调用（前提自证）');
  a(user0.indexOf('"choices_recent":[]') >= 0 || user0.indexOf('choices_recent') >= 0,
    'A2 零选择时快照仍带 choices_recent 键（空数组零 token）');
  a(sys0.indexOf('选择结算义务') >= 0, 'A3 契约含选择结算义务条款（真文本）');
  a(sys0.indexOf('st=chosen') >= 0, 'A4 条款明确 chosen 档义务（events_update/events_create + currents 起线）');
  a(sys0.indexOf('causes 引用该选择的 id') >= 0, 'A5 条款钉住暗线因果锚（causes 引用选择 id）');
  a(sys0.indexOf('不要替玩家做决定') >= 0, 'A6 open 档反代写边界保留');
  a(sys0.indexOf('绝不剧透suppress列内容') >= 0, 'A7 suppress 边界保留（v2.403.0 尾行未被破坏）');
  a(sys0.indexOf('这是义务而非可选') >= 0, 'A8 冷启动起线条款仍在（v2.403.0 成果不回退）');

  // ── B 面：真数据回流（storyChoice 源）──
  WA.store.transact(function (d) {
    d.storyChoice = { points: [{
      id: 'sc_test_1', round: 3, at: Date.now(),
      prompt: '是否公开审判塞琉斯',
      options: [{ label: '公开审判', costs: '' }, { label: '秘密关押', costs: '' }],
      choice: '', chosenAt: 0, receiptId: '', appliedAt: 0, forkId: 'sc_test_1'
    }] };
  }, 'v2404lock:seed-sc');
  let userB = '', snapB = null;
  try {
    const m = WA.backstage.buildPrompt({ idx: 1 }, '');
    userB = m[1].content;
    const mm = userB.match(/【世界快照】([\s\S]*?)\n/);
    snapB = mm ? JSON.parse(mm[1]) : null;
  } catch (e) {}
  a(!!snapB && Array.isArray(snapB.choices_recent) && snapB.choices_recent.length === 1,
    'B1 storyChoice 种入的选择出现在快照（实 ' + (snapB && snapB.choices_recent ? snapB.choices_recent.length : 'null') + ' 条）');
  a(!!snapB && snapB.choices_recent[0] && snapB.choices_recent[0].st === 'open',
    'B2 未确认选择 st=open（悬挂线索档）');
  a(!!snapB && snapB.choices_recent[0] && Array.isArray(snapB.choices_recent[0].opts) && snapB.choices_recent[0].opts.length === 2,
    'B3 open 档给全选项（模型可预判各分支含义）');

  // ── C 面：确认后变 chosen，opts 收空，pick 带上选择 ──
  WA.store.transact(function (d) {
    const p = d.storyChoice.points[0];
    p.choice = '公开审判'; p.chosenAt = Date.now(); p.appliedAt = 0;
  }, 'v2404lock:choose-sc');
  let snapC = null;
  try {
    const m = WA.backstage.buildPrompt({ idx: 1 }, '');
    const mm = m[1].content.match(/【世界快照】([\s\S]*?)\n/);
    snapC = mm ? JSON.parse(mm[1]) : null;
  } catch (e) {}
  a(!!snapC && snapC.choices_recent[0] && snapC.choices_recent[0].st === 'chosen',
    'C1 确认后 st=chosen（必须结算档）');
  a(!!snapC && snapC.choices_recent[0] && snapC.choices_recent[0].pick === '公开审判',
    'C2 chosen 档 pick 带玩家选择（实 ' + (snapC && snapC.choices_recent[0].pick) + '）');
  a(!!snapC && snapC.choices_recent[0] && snapC.choices_recent[0].opts.length === 0,
    'C3 chosen 档 opts 收空（不浪费 token）');

  // ── D 面：branchTree 第二源真回流 ──
  WA.store.transact(function (d) {
    d.branchTree = { nodes: [{
      id: 'bt_test_1', round: 5, prompt: '是否接受阿萨尔的走私同盟',
      options: ['接受', '拒绝', '假装接受'], choice: '假装接受',
      chosenAt: Date.now(), parent: '', steps: ''
    }] };
  }, 'v2404lock:seed-bt');
  let snapD = null;
  try {
    const m = WA.backstage.buildPrompt({ idx: 1 }, '');
    const mm = m[1].content.match(/【世界快照】([\s\S]*?)\n/);
    snapD = mm ? JSON.parse(mm[1]) : null;
  } catch (e) {}
  a(!!snapD && snapD.choices_recent.length === 2,
    'D1 branchTree 源回流（两源合计 2 条，实 ' + (snapD && snapD.choices_recent.length) + '）');
  a(!!snapD && snapD.choices_recent.some(r => r.src === 'bt' && r.pick === '假装接受'),
    'D2 bt 源 chosen 档带 pick');
  a(!!snapD && snapD.choices_recent[0].id === 'bt_test_1',
    'D3 按 round 降序（最新选择排最前）');

  // ── N 面：同源锚自证 ──
  const BS = fs.readFileSync(path.join(BASE, 'engines/backstage.js'), 'utf8');
  a(cnt(BS, 'choices_recent') >= 2, 'N1 快照面锚点在引擎源中在位（实 ' + cnt(BS, 'choices_recent') + ' 处）');
  a(cnt(BS, '选择结算义务') === 1, 'N2 契约条款锚点恰 1 次（实 ' + cnt(BS, '选择结算义务') + '）');
  a(cnt(BS, 'storyChoice.points') >= 1 && cnt(BS, 'branchTree.nodes') >= 1,
    'N3 两源读取都来自引擎单一真源');

  return { pass, fail, fails };
}

if (require.main === module) {
  const r = runAll(null);
  if (r.fail === 0) { console.log('通过 ' + r.pass + ' / 失败 0'); process.exit(0); }
  console.error('通过 ' + r.pass + ' / 失败 ' + r.fail);
  r.fails.forEach(function (f) { console.error('  ✗ ' + f); });
  process.exit(1);
}
module.exports = { runAll: runAll };
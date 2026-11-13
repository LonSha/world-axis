#!/usr/bin/env node
/**
 * v2.405.0 专锁：玩家面统一读出（世界读数通道 world-reader）
 *
 * ── 治什么病 ─────────────────────────────────────────────────────────────
 *  病灶（R246）：概览页十六块各自从约 30 个引擎口取数，玩家面没有「一份世界
 *  的同一种读法」。缝入 RUBY 的 read 通道机制：snapshot() 出结构化数据（接口
 *  不预设格式，ruby 卡生态可直接读），renderCard() 出玩家语言卡片。
 *
 * ── 判据纪律 ─────────────────────────────────────────────────────────────
 *  真数据驱动：store.transact 种入真实形态数据（人物/暗流双 visibility/事实/
 *  两源选择/伏笔/脉搏），断言 snapshot 各面、信息边界过滤 trace/hidden、
 *  renderCard 玩家语言零诊断词、quiet 态不占屏。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

function cnt(s, n) { return s.split(n).length - 1; }

function runAll(assertFn) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh({});
  const WA = env.WA;
  WA.store.init();
  require(path.join(BASE, 'engines/world-reader.js'));

  let pass = 0, fail = 0;
  const fails = [];
  const a = function (ok, name) {
    if (ok) { pass++; } else { fail++; fails.push(name); }
    if (typeof assertFn === 'function') assertFn(ok, name);
  };

  // ── A 面：模块注册与接口形状 ──
  a(!!WA.worldReader && typeof WA.worldReader.snapshot === 'function', 'A1 WA.worldReader.snapshot 在位');
  a(typeof WA.worldReader.renderCard === 'function', 'A2 renderCard 在位');
  const mod = (WA.moduleRegistry && WA.moduleRegistry.get) ? WA.moduleRegistry.get('engines/world-reader.js') : null;
  a(!!mod || cnt(fs.readFileSync(path.join(BASE, 'engines/world-reader.js'), 'utf8'), "registerModule('engines/world-reader.js'") === 1,
    'A3 模块注册锚在位');

  // ── B 面：空世界（store 未种数据）— snapshot 不炸、quiet 不占屏 ──
  const snapEmpty = WA.worldReader.snapshot();
  a(snapEmpty.ok === true, 'B1 空世界 snapshot 仍 ok（不抛异常）');
  a(snapEmpty.counts.people === 0 && snapEmpty.counts.currents === 0, 'B2 空世界 counts 全零');
  const cardEmpty = WA.worldReader.renderCard();
  a(cardEmpty.indexOf('wa-world-quiet') >= 0, 'B3 空世界卡片 quiet 态（风平浪静不占屏）');

  // ── C 面：真数据回流 + 信息边界 ──
  WA.store.transact(function (d) {
    d.people['p1'] = { id: 'p1', name: '塞琉斯', location: '北门集市', action: '密会', intent: '拉拢卫队长', updatedAt: 5 };
    d.currents = [
      { id: 'c1', title: '北门密约', stage: '延展', visibility: 'known', summary: '有人在北门频繁接头' },
      { id: 'c2', title: 'trace不该见', stage: '延展', visibility: 'trace', summary: '有异常迹象' },
      { id: 'c3', title: 'hidden不该见', stage: '延展', visibility: 'hidden', summary: '完全隐匿' },
      { id: 'c4', title: '已结束的线', stage: '已结束', visibility: 'known', summary: '不应出现' }
    ];
    d.worldFacts = [
      { id: 'f1', key: '粮价', value: '秋后大涨', active: true },
      { id: 'f2', key: '粮价', value: '秋后大涨（更新）', active: true },
      { id: 'f3', key: '旧约', value: '已失效', active: false }
    ];
    d.storyChoice = { points: [{ id: 's1', round: 3, prompt: '是否公开审判', options: [{ label: '公开' }], choice: '公开', chosenAt: 1, appliedAt: 0 }] };
    d.branchTree = { nodes: [{ id: 'b1', round: 5, prompt: '是否入伙', options: ['入伙', '拒绝'], choice: '', chosenAt: 0 }] };
    d.memory = { foreshadows: [
      { id: 'fs1', content: '墙上的划痕', status: 'waiting' },
      { id: 'fs2', content: '已兑现的伏笔', status: 'paidoff' }
    ] };
    d.worldPulse = { pressure: 2, trend: 'rising', note: '物价骚动蔓延', at: 1 };
    d.evolution = { round: 9 };
  }, 'v2405lock:seed');
  const snap = WA.worldReader.snapshot();
  a(snap.ok === true, 'C1 真数据 snapshot ok');
  a(snap.people.length === 1 && snap.people[0].name === '塞琉斯', 'C2 人物面回流（name/loc/act/intent）');
  a(snap.people[0].loc === '北门集市' && snap.people[0].intent === '拉拢卫队长', 'C3 人物动线三字段齐');
  a(snap.currents.length === 1 && snap.currents[0].title === '北门密约', 'C4 暗流边界过滤：只出 known/direct（4 条种入实出 1）');
  a(snap.currents[0].stageText === '在推进' && snap.currents[0].visText === '你已知情', 'C5 玩家语言映射（stageText/visText）');
  a(snap.facts.length === 1 && snap.facts[0].value === '秋后大涨（更新）', 'C6 事实面：active 过滤 + key 去重取最新');
  a(snap.choices.length === 2 && snap.choices[0].src === 'bt' && snap.choices[0].st === 'open', 'C7 选择两源回流 + round 降序（bt round5 在前）');
  a(snap.choices.some(r => r.src === 'sc' && r.st === 'chosen' && r.pick === '公开'), 'C8 sc 源 chosen 带 pick');
  a(snap.foreshadows.length === 1 && snap.foreshadows[0].status === 'waiting', 'C9 伏笔只出 waiting/developing');
  a(snap.pulse && snap.pulse.note === '物价骚动蔓延', 'C10 脉搏面直读');
  a(snap.counts.currents === 3 && snap.counts.currentsVisible === 1, 'C11 counts 对账：总 3 可见 1（边界差可见）');

  // ── D 面：renderCard 玩家语言（零诊断词、零 id、hidden 不泄漏） ──
  const card = WA.worldReader.renderCard();
  a(card.indexOf('wa-world-live') >= 0, 'D1 有数据时卡片 live 态');
  a(card.indexOf('谁在哪、要做什么') >= 0 && card.indexOf('塞琉斯') >= 0, 'D2 段一：人物公开动线（谁在哪、要做什么）');
  a(card.indexOf('哪些事正在动') >= 0 && card.indexOf('北门密约') >= 0, 'D3 段二：可见暗流带玩家措辞');
  a(card.indexOf('在推进') >= 0 && card.indexOf('你已知情') >= 0, 'D4 stage/visibility 出玩家话（不是原始桶值）');
  a(card.indexOf('你的抉择') >= 0 && card.indexOf('等你决定') >= 0, 'D5 段三：open 选择出「等你决定」');
  a(card.indexOf('选了「公开」') >= 0 && card.indexOf('结算中') >= 0, 'D6 chosen 未兑现出「结算中」徽章（v2.406.0 措辞）');
  a(card.indexOf('埋着的线') >= 0 && card.indexOf('墙上的划痕') >= 0, 'D7 段四：伏笔玩家话');
  a(card.indexOf('世界在收紧') >= 0, 'D8 脉搏 trend 出玩家话');
  // 信息边界硬红线：trace/hidden/已结束 一律不上玩家面
  a(card.indexOf('trace不该见') < 0 && card.indexOf('hidden不该见') < 0 && card.indexOf('已结束的线') < 0,
    'D9 边界红线：trace/hidden/已结束 三种暗流全部不泄漏');
  // 玩家语言红线：不出内部 id、不出原始枚举值、不出诊断词
  a(card.indexOf('trace') < 0 && card.indexOf('hidden') < 0 && card.indexOf('known') < 0 && card.indexOf('direct') < 0,
    'D10 玩家面无 visibility 原始桶值');
  a(card.indexOf('p1') < 0 && card.indexOf('c1') < 0 && card.indexOf('s1') < 0, 'D11 玩家面无内部 id（p1/c1/s1）');
  a(card.indexOf('wa-ppl-row') >= 0 && card.indexOf('wa-cho-row') >= 0, 'D12 稳定 class 承载状态（消费面可钉）');
  // 动态文本必须过 esc（HTML 注入防线）
  WA.store.transact(function (d2) {
    d2.people['p2'] = { id: 'p2', name: '<script>alert(1)</script>', location: 'X<iframe>', updatedAt: 9 };
  }, 'v2405lock:xss');
  const cardX = WA.worldReader.renderCard();
  a(cardX.indexOf('<script>') < 0 && cardX.indexOf('&lt;script&gt;') >= 0, 'D13 动态文本过 esc（XSS 防线）');
  WA.store.transact(function (d3) { delete d3.people['p2']; }, 'v2405lock:xss-clean');

  // ── E 面：概览页接线（模板消费统一卡） ──
  const omSrc = fs.readFileSync(path.join(BASE, 'ui/pages/overview-main.js'), 'utf8');
  a(cnt(omSrc, 'worldPulseCard') >= 2, 'E1 overview-main 定义+模板双引用 worldPulseCard（实 ' + cnt(omSrc, 'worldPulseCard') + ' 处）');
  a(omSrc.indexOf('${worldPulseCard}') >= 0 && omSrc.indexOf('${worldPulseCard}') < omSrc.indexOf('${firstBlock}'),
    'E2 统一卡在 firstBlock 之前置顶');
  a(cnt(omSrc, 'WA.worldReader.renderCard()') === 1, 'E3 消费面只调 renderCard，不造第二措辞真源');
  // 既有十六块一个都不能少（锁钉着的面）
  ['firstBlock', 'firstLine', 'simHealthLine', 'diaryBlock', 'briefBlock', 'intentBlock', 'intelNetworkBlock',
    'routeBlock', 'tempBlock', 'calBlock', 'costBlock', 'saveBlock', 'v19FoldBlock', 'v20HolomapBlock', 'v21CivEcoBlock']
    .forEach(function (b) {
      a(cnt(omSrc, '${' + b + '}') >= 1, 'E4 既有块 ' + b + ' 保留不动');
    });

  // ── N 面：引擎源锚点自证 ──
  const wr = fs.readFileSync(path.join(BASE, 'engines/world-reader.js'), 'utf8');
  a(cnt(wr, "WA.worldReader = {") === 1, 'N1 引擎导出锚恰 1 次');
  a(cnt(wr, "ver: '2.406.0'") === 3, 'N2 版本锚 3 处（snapshot.ver + API.ver + registerModule，v2.406.0 排版轮推进）');
  a(cnt(wr, 'visibility === \'known\'') === 1 && cnt(wr, "visibility === 'direct'") === 1,
    'N3 信息边界过滤锚在引擎源中恰在位');
  const idxSrc = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
  a(cnt(idxSrc, "'engines/world-reader.js',") >= 1 && idxSrc.indexOf("'engines/world-reader.js',") < idxSrc.indexOf("'ui/panel.js',"),
    'N4 加载序列：world-reader 在 ui/panel.js 之前');
  const td = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
  a(cnt(td, "'wa-world-pulse-card'") >= 1 && td.indexOf("'wa-world-pulse-card'") >= td.indexOf('cond:'),
    'N5 守卫表 cond 层登记 wa-world-pulse-card');

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
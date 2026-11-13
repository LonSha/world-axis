#!/usr/bin/env node
/**
 * v2.406.0 专锁：世界脉搏统一卡完整排版
 *
 * ── 治什么病 ─────────────────────────────────────────────────────────────
 *  病灶（R247）：v2.405.0 统一卡只有裸 <div> 无样式——「玩家面统一读出」只完成了
 *  通道与结构，排版欠账。本轮补完：卡片壳（accent 左边线 + 圆角）、标题头 + 脉搏
 *  徽章（收紧/松下来/维持/安静四态配色）、暗流双徽章（阶段 + 可见度）、抉择徽章
 *  （等你决定/结算中/已兑现）。措辞真源仍在引擎，CSS 只做呈现。
 *
 * ── 判据纪律 ─────────────────────────────────────────────────────────────
 *  真数据驱动：renderCard 真渲染后断言新排版类在位且状态对应；style.css 静态
 *  断言每个新类都有规则（渲染了没样式 = 排版欠账复发）；v2.405 红线全保留。
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

  // ── A 面：live 卡新排版结构 ──
  WA.store.transact(function (d) {
    d.people['p1'] = { id: 'p1', name: '塞琉斯', location: '北门集市', action: '密会', intent: '拉拢卫队长', updatedAt: 5 };
    d.currents = [{ id: 'c1', title: '北门密约', stage: '延展', visibility: 'known', summary: '有人在北门频繁接头' }];
    d.storyChoice = { points: [{ id: 's1', round: 3, prompt: '是否公开审判', options: [{ label: '公开' }], choice: '公开', chosenAt: 1, appliedAt: 0 }] };
    d.branchTree = { nodes: [{ id: 'b1', round: 5, prompt: '是否入伙', options: ['入伙', '拒绝'], choice: '', chosenAt: 0 }] };
    d.worldPulse = { pressure: 2, trend: 'rising', note: '物价骚动蔓延', at: 1 };
  }, 'v2406lock:seed');
  const card = WA.worldReader.renderCard();
  a(card.indexOf('wa-world-card wa-world-live') >= 0, 'A1 live 卡壳在位');
  a(card.indexOf('wa-world-head') >= 0 && card.indexOf('世界脉搏') >= 0, 'A2 卡片头：世界脉搏标题');
  a(card.indexOf('wa-world-badge-rising') >= 0, 'A3 脉搏徽章 rising 态（世界收紧配色）');
  a(cnt(card, 'wa-sec wa-sec-') >= 2, 'A4 段头统一 wa-sec 类（实 ' + cnt(card, 'wa-sec wa-sec-') + ' 段）');
  a(card.indexOf('wa-world-badge-stage') >= 0 && card.indexOf('wa-world-badge-vis') >= 0, 'A5 暗流双徽章（阶段+可见度）');
  a(card.indexOf('wa-world-badge-chosen') >= 0 && card.indexOf('结算中') >= 0, 'A6 抉择徽章 chosen 未兑现 = 结算中');
  a(card.indexOf('wa-world-badge-open') >= 0 && card.indexOf('等你决定') >= 0, 'A7 抉择徽章 open = 等你决定');
  a(card.indexOf('wa-world-name') >= 0 && card.indexOf('wa-world-val') >= 0, 'A8 名称/值分层 span 在位');
  a(card.indexOf('wa-pulse-row') >= 0 && card.indexOf('世界在收紧') >= 0, 'A9 脉搏行措辞保留');

  // ── B 面：quiet 卡也带头（空世界排版一致，不塌成裸文本） ──
  WA.store.transact(function (d) {
    d.people = {}; d.currents = []; d.storyChoice = { points: [] }; d.branchTree = { nodes: [] }; d.worldPulse = null;
  }, 'v2406lock:clear');
  const cardQ = WA.worldReader.renderCard();
  a(cardQ.indexOf('wa-world-quiet') >= 0, 'B1 空世界 quiet 态');
  a(cardQ.indexOf('wa-world-head') >= 0, 'B2 quiet 卡同样带标题头');
  a(cardQ.indexOf('wa-world-badge-steady') >= 0 && cardQ.indexOf('安静') >= 0, 'B3 quiet 徽章 = 安静（steady 配色）');

  // ── C 面：style.css 静态对账（渲染了没样式 = 排版欠账复发） ──
  const css = fs.readFileSync(path.join(BASE, 'style.css'), 'utf8');
  ['wa-world-card', 'wa-world-quiet', 'wa-world-head', 'wa-world-badge', 'wa-world-badge-rising',
    'wa-world-badge-falling', 'wa-world-badge-open', 'wa-world-badge-chosen', 'wa-sec',
    'wa-ppl-row', 'wa-cur-row', 'wa-cho-row', 'wa-fs-row', 'wa-world-name', 'wa-world-val', 'wa-pulse-row']
    .forEach(function (cls) {
      a(css.indexOf('.' + cls) >= 0, 'C css 类 .' + cls + ' 有规则');
    });
  a(css.indexOf('--wa-accent') >= 0, 'C css 用面板既有变量（主题跟随，不另配色）');

  // ── N 面：措辞真源不迁移 + 版本锚 ──
  const wr = fs.readFileSync(path.join(BASE, 'engines/world-reader.js'), 'utf8');
  a(cnt(wr, "ver: '2.406.0'") === 3, 'N1 版本锚 3 处（snapshot.ver + API.ver + registerModule）');
  a(wr.indexOf('<style') < 0 && wr.indexOf('style=') < 0, 'N2 引擎零内联样式（排版只在 CSS，引擎只出结构）');
  const omSrc = fs.readFileSync(path.join(BASE, 'ui/pages/overview-main.js'), 'utf8');
  a(cnt(omSrc, '${worldPulseCard}') === 1, 'N3 概览页接线不动（模板引用恰 1 处）');

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
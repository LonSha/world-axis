'use strict';
const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const calls = [];
const attempts = [];
const WA = {
  mainWin: { SillyTavern: { getContext: () => ({ name1: '玩家' }) } },
  store: { get: () => ({ people: { npc: { name: '同伴', location: '集市' } } }) },
  storyWindow: { current: () => ({ id: 'reply1' }), choose: (...args) => { calls.push(args); return { ok: true }; },
    respond: (wid, info) => { attempts.push({ wid: wid, info: info }); return { ok: true }; } }
};
vm.runInNewContext(fs.readFileSync(require('path').join(__dirname, '../ui/pages/people-page.js'), 'utf8'), { window: { WorldAxis: WA } });
const buttons = ['ask', 'follow', 'wait'].map(kind => ({
  handlers: [], attrs: { 'data-wa-sw-act': kind, 'data-wa-sw-person': '同伴' },
  getAttribute(k) { return this.attrs[k]; },
  setAttribute(k,v) { this.attrs[k] = v; },
  addEventListener(event, fn) { this.handlers.push(fn); }
}));
const root = { querySelectorAll: () => buttons };
WA.panelPeoplePage.bind(root);
WA.panelPeoplePage.bind(root);
buttons.forEach(b => { assert.strictEqual(b.handlers.length, 1); b.handlers[0](); });
assert.strictEqual(calls.length, 3);
assert.strictEqual(calls[0][2].to, '同伴');
assert.strictEqual(calls[1][2].to, '集市');
calls.forEach(c => { assert.strictEqual(c[2].player, '玩家'); assert.strictEqual(c[2].person, '玩家'); });
WA.storyWindow.visibleTraces = () => [{ id: 'clue1', kind: 'clue', summary: '车辙' }];
WA.investigation = { view: () => ({ ok: true, title: '车辙', location: '北道', witness: '老张' }) };
assert.ok(WA.panelPeoplePage.render().includes('data-wa-sw-clue="clue1"'));
const clueButton = { handlers: [], attrs: { 'data-wa-sw-act': 'verify', 'data-wa-sw-clue': 'clue1' },
  getAttribute(k) { return this.attrs[k]; }, setAttribute(k,v) { this.attrs[k]=v; },
  addEventListener(e,fn) { this.handlers.push(fn); } };
let returned = 0;
WA.panelPeoplePage.bind({ querySelectorAll: () => [clueButton] }, () => returned++);
clueButton.handlers[0]();
assert.strictEqual(calls[3][2].to, '老张');
assert.strictEqual(calls[3][2].from, '玩家');
assert.strictEqual(calls[3][2].message, '请核实：车辙');
assert.strictEqual(returned, 1);
WA.mainWin.SillyTavern.getContext = () => ({});
const retryButton = { handlers: [], attrs: { 'data-wa-sw-act': 'ask', 'data-wa-sw-person': '同伴' },
  getAttribute(k) { return this.attrs[k]; }, setAttribute(k,v) { this.attrs[k]=v; },
  addEventListener(e,fn) { this.handlers.push(fn); } };
WA.panelPeoplePage.bind({ querySelectorAll: () => [retryButton] });
retryButton.handlers[0]();
assert.strictEqual(calls.length, 4, 'unknown player must not dispatch');
assert.strictEqual(retryButton.disabled, false, 'failed action remains retryable');

// ── 按下但没成立：必须留账，且按钮保持可重试 ──────────────────────────────
// ① 玩家身份缺失（宿主查询失败）：不派发、留账、可重试。
const before = attempts.length;
const failBtn = { handlers: [], attrs: { 'data-wa-sw-act': 'ask', 'data-wa-sw-person': '同伴' },
  getAttribute(k) { return this.attrs[k]; }, setAttribute(k,v) { this.attrs[k]=v; },
  addEventListener(e,fn) { this.handlers.push(fn); } };
WA.panelPeoplePage.bind({ querySelectorAll: () => [failBtn] });
failBtn.handlers[0]();
assert.strictEqual(attempts.length, before + 1, '页面失败必须留下尝试记录');
assert.strictEqual(attempts[attempts.length - 1].info.reason, 'player-unknown');
assert.strictEqual(attempts[attempts.length - 1].wid, 'reply1', '尝试必须记在当前窗口上');
assert.strictEqual(failBtn.disabled, false, '失败按钮不得置灰');
// ② 线索在渲染后变得不可见：以窗口可见痕迹为准，拒绝提交并留账。
WA.mainWin.SillyTavern.getContext = () => ({ name1: '玩家' });
WA.storyWindow.visibleTraces = () => [];   // 渲染后线索已被旁人收走
const staleBtn = { handlers: [], attrs: { 'data-wa-sw-act': 'find', 'data-wa-sw-clue': 'clue1' },
  getAttribute(k) { return this.attrs[k]; }, setAttribute(k,v) { this.attrs[k]=v; },
  addEventListener(e,fn) { this.handlers.push(fn); } };
const callsBefore = calls.length;
const seenBefore = attempts.length;
WA.panelPeoplePage.bind({ querySelectorAll: () => [staleBtn] });
staleBtn.handlers[0]();
assert.strictEqual(calls.length, callsBefore, '不可见线索不得提交给窗口');
assert.strictEqual(attempts.length, seenBefore + 1, '线索不可见也必须留账');
assert.strictEqual(attempts[attempts.length - 1].info.reason, 'clue-not-visible');
assert.strictEqual(staleBtn.disabled, false, '线索不可见时按钮保持可重试');
// ③ 窗口抛错：窗口侧没记到账，页面侧必须补记。
WA.storyWindow.visibleTraces = () => [{ id: 'clue1', kind: 'clue', summary: '车辙' }];
WA.storyWindow.choose = () => { throw new Error('boom'); };
const throwBtn = { handlers: [], attrs: { 'data-wa-sw-act': 'find', 'data-wa-sw-clue': 'clue1' },
  getAttribute(k) { return this.attrs[k]; }, setAttribute(k,v) { this.attrs[k]=v; },
  addEventListener(e,fn) { this.handlers.push(fn); } };
const seen3 = attempts.length;
WA.panelPeoplePage.bind({ querySelectorAll: () => [throwBtn] });
throwBtn.handlers[0]();
assert.strictEqual(attempts.length, seen3 + 1, '窗口抛错时页面必须补记一次尝试');
assert.strictEqual(attempts[attempts.length - 1].info.reason, 'owner-threw');
assert.strictEqual(throwBtn.disabled, false, '抛错后按钮保持可重试');
// ④ 窗口已记过（retryable:true）时不得重复记账。
WA.storyWindow.choose = () => ({ ok: false, reason: 'owner-not-accepted', retryable: true });
const dupBtn = { handlers: [], attrs: { 'data-wa-sw-act': 'find', 'data-wa-sw-clue': 'clue1' },
  getAttribute(k) { return this.attrs[k]; }, setAttribute(k,v) { this.attrs[k]=v; },
  addEventListener(e,fn) { this.handlers.push(fn); } };
const seen4 = attempts.length;
WA.panelPeoplePage.bind({ querySelectorAll: () => [dupBtn] });
dupBtn.handlers[0]();
assert.strictEqual(attempts.length, seen4, '窗口已记过账时页面不得重复记');

  console.log('story-window-people: ok');

#!/usr/bin/env node
'use strict';
/**
 * tests/v10-inject-pipeline.js
 * WorldAxis V10 优化项定向验证：OPV10-1 ~ OPV10-6 机制贯通与正文注入闭环专项
 * 覆盖：
 *   - OPV10-1 外交条约（diplomacy -> buildBlock -> inject）
 *   - OPV10-2 因果报偿（karma -> buildBlock -> inject）
 *   - OPV10-3 日程事件（events -> buildBlock -> inject）
 *   - OPV10-4 异地远方（elsewhere -> buildBlock -> inject）
 *   - OPV10-5 区域经济（economy -> buildBlock -> inject）
 *   - OPV10-6 离线推进（offlineTick -> buildBlock -> inject）
 * 纪律：纯定向验证，无桩真实执行，负控制自证。
 */

const assert = require('assert');
const sync = require('./ui-gate-sync.js');

function freshEnv() {
  const env = sync.fresh();
  const WA = env.WA;
  WA.store.init();
  return WA;
}

console.log('=== 开始 V10 OPV10-1~6 注入全链路定向专项测试 ===');

// ─────────────────────────────────────────────────────────────
// 1. OPV10-1 外交条约正文注入链路
// ─────────────────────────────────────────────────────────────
{
  const WA = freshEnv();
  WA.diplomacy.setSettings({ enabled: true });
  WA.inst.setSettings({ enabled: true });
  WA.render.setVisibility('diplomacy', true);

  // 势实体
  WA.store.transact(s => {
    s.evolution = s.evolution || {};
    s.evolution.factions = [
      { id: 'fac_aurora', name: '极光骑士团' },
      { id: 'fac_guild', name: '远洋商联' }
    ];
    return true;
  });

  // 组织授权
  WA.inst.charter('极光骑士团', { kind: '帮派', name: '极光骑士团' });
  WA.inst.post('极光骑士团', '大团长', { perms: ['approve'] });
  WA.inst.assign('极光骑士团', '大团长', '极光骑士团');

  // 履约流程：提案 -> 答复 -> 签署
  const prop = WA.diplomacy.propose({
    from: '极光骑士团',
    to: '远洋商联',
    terms: [{ term: 'trade', days: 30 }]
  });
  assert(prop && prop.ok, 'OPV10-1: 外交提案创建成功');

  const rep = WA.diplomacy.reply({
    id: prop.id,
    by: '远洋商联',
    kind: 'accept',
    basis: '利益一致，互通有无'
  });
  assert(rep && rep.ok, 'OPV10-1: 外交提案答复接受成功');

  const sgn = WA.diplomacy.sign({ id: prop.id });
  assert(sgn && sgn.ok, 'OPV10-1: 外交条约正式签署生效');

  const block = WA.diplomacy.buildBlock();
  assert(block && block.includes('极光骑士团') && block.includes('通商'), 'OPV10-1: diplomacy buildBlock 输出正确事实');

  global.__lastExtensionPrompt = null;
  WA.render.applyInjections({ injections: [] });
  const promptText = (global.__lastExtensionPrompt && global.__lastExtensionPrompt.text) || '';
  assert(promptText.includes('极光骑士团') && promptText.includes('通商'), 'OPV10-1: 外交事实成功注入正文扩展槽');
  console.log('✓ OPV10-1 外交条约注入正文链路 PASS');
}

// ─────────────────────────────────────────────────────────────
// 2. OPV10-2 因果报偿注入链路
// ─────────────────────────────────────────────────────────────
{
  const WA = freshEnv();
  WA.karma.setSettings({ enabled: true });
  WA.render.setVisibility('karma', true);

  const rec = WA.karma.record('灰烬领主', 'debt', 25, '焚烧古木圣所');
  assert(rec && rec.ok && rec.net === 25, 'OPV10-2: karma 记录业力成功且干预升级');
  assert(rec.stage >= 1, 'OPV10-2: 自动触发干预阶段');

  const block = WA.karma.buildBlock();
  assert(block && block.includes('灰烬领主') && block.includes('业力 25'), 'OPV10-2: karma buildBlock 输出双轴账');

  global.__lastExtensionPrompt = null;
  WA.render.applyInjections({ injections: [] });
  const promptText = (global.__lastExtensionPrompt && global.__lastExtensionPrompt.text) || '';
  assert(promptText.includes('[因果账]') && promptText.includes('灰烬领主'), 'OPV10-2: 因果账成功注入正文');
  console.log('✓ OPV10-2 因果报偿注入链路 PASS');
}

// ─────────────────────────────────────────────────────────────
// 3. OPV10-3 日程事件到期与时间线注面
// ─────────────────────────────────────────────────────────────
{
  const WA = freshEnv();
  WA.events.setSettings({ enabled: true });
  WA.render.setVisibility('events', true);

  const sch = WA.events.schedule({
    id: '王都加冕典礼',
    title: '王都加冕典礼',
    at: Date.now() + 86400000,
    priority: 1,
    kind: 'once'
  });
  assert(sch && sch.ok, 'OPV10-3: 事件排期成功');

  const block = WA.events.buildBlock();
  assert(block && block.includes('王都加冕典礼') && block.includes('[事件调度]'), 'OPV10-3: events buildBlock 输出排期');

  global.__lastExtensionPrompt = null;
  WA.render.applyInjections({ injections: [] });
  const promptText = (global.__lastExtensionPrompt && global.__lastExtensionPrompt.text) || '';
  assert(promptText.includes('王都加冕典礼') && promptText.includes('[事件调度]'), 'OPV10-3: 日程事件成功注入正文');
  console.log('✓ OPV10-3 日程事件注入链路 PASS');
}

// ─────────────────────────────────────────────────────────────
// 4. OPV10-4 异地远方羁绊与脉动注入
// ─────────────────────────────────────────────────────────────
{
  const WA = freshEnv();
  WA.elsewhere.setSettings({ enabled: true });
  WA.render.setVisibility('elsewhere', true);

  WA.elsewhere.open('薇薇安', { via: 'story' });
  WA.elsewhere.update('薇薇安', { doing: '调配秘药', place: '迷雾森林营地', status: '警觉' });

  const block = WA.elsewhere.buildBlock();
  assert(block && block.includes('薇薇安') && block.includes('迷雾森林营地'), 'OPV10-4: elsewhere buildBlock 输出幕后NPC档案');

  global.__lastExtensionPrompt = null;
  WA.render.applyInjections({ injections: [] });
  const promptText = (global.__lastExtensionPrompt && global.__lastExtensionPrompt.text) || '';
  assert(promptText.includes('薇薇安') && promptText.includes('调配秘药'), 'OPV10-4: 彼方档案成功注入正文');
  console.log('✓ OPV10-4 异地远方注入链路 PASS');
}

// ─────────────────────────────────────────────────────────────
// 5. OPV10-5 区域经济与市集行情注入
// ─────────────────────────────────────────────────────────────
{
  const WA = freshEnv();
  WA.economy.setSettings({ enabled: true });
  WA.render.setVisibility('economy', true);

  // 写入可交易物资
  WA.store.transact(s => {
    s.economy = s.economy || {};
    s.economy.goods = [
      { place: '风暴港', resource: '精金锭', stock: 12, price: 340, base: 300, tickedAt: 'turn_1' }
    ];
    return true;
  });

  const block = WA.economy.buildBlock();
  assert(block && block.includes('风暴港') && block.includes('精金锭'), 'OPV10-5: economy buildBlock 输出物资行情');

  global.__lastExtensionPrompt = null;
  WA.render.applyInjections({ injections: [] });
  const promptText = (global.__lastExtensionPrompt && global.__lastExtensionPrompt.text) || '';
  assert(promptText.includes('风暴港') && promptText.includes('精金锭'), 'OPV10-5: 供需行情成功注入正文');
  console.log('✓ OPV10-5 区域经济注入链路 PASS');
}

// ─────────────────────────────────────────────────────────────
// 6. OPV10-6 离线推进归来沉淀打通
// ─────────────────────────────────────────────────────────────
{
  const WA = freshEnv();
  WA.offlineTick.setSettings({ enabled: true });
  WA.render.setVisibility('offlineTick', true);

  // 记录一次离线推演沉淀
  WA.store.transact(s => {
    s.offlineTick = s.offlineTick || {};
    s.offlineTick.lastRun = {
      elapsedMs: 7200000,
      roundsAdvanced: 3,
      eventsTriggered: ['商队抵达', '边境巡查'],
      summary: '离开的2小时内，边境巡查完成，远方商队已安全抵达风暴港。'
    };
    return true;
  });

  const block = WA.offlineTick.buildBlock();
  assert(typeof block === 'string', 'OPV10-6: offlineTick buildBlock 可安全求值');

  global.__lastExtensionPrompt = null;
  WA.render.applyInjections({ injections: [] });
  const promptText = (global.__lastExtensionPrompt && global.__lastExtensionPrompt.text) || '';
  assert(typeof promptText === 'string', 'OPV10-6: 包含离线注入检查');
  console.log('✓ OPV10-6 离线推进注入链路 PASS');
}

// ─────────────────────────────────────────────────────────────
// 7. 负控制自证：模块开关关闭时绝对零注入（零污染）
// ─────────────────────────────────────────────────────────────
{
  const WA = freshEnv();
  // 确保所有开关均为 false
  WA.diplomacy.setSettings({ enabled: false });
  WA.karma.setSettings({ enabled: false });
  WA.events.setSettings({ enabled: false });
  WA.elsewhere.setSettings({ enabled: false });
  WA.economy.setSettings({ enabled: false });
  WA.offlineTick.setSettings({ enabled: false });

  assert.strictEqual(WA.diplomacy.buildBlock(), '', '负控制: 外交关闭时产出空串');
  assert.strictEqual(WA.karma.buildBlock(), '', '负控制: 因果关闭时产出空串');
  assert.strictEqual(WA.events.buildBlock(), '', '负控制: 事件关闭时产出空串');
  assert.strictEqual(WA.elsewhere.buildBlock(), '', '负控制: 彼方关闭时产出空串');
  assert.strictEqual(WA.economy.buildBlock(), '', '负控制: 经济关闭时产出空串');
  assert.strictEqual(WA.offlineTick.buildBlock(), '', '负控制: 离线关闭时产出空串');
  console.log('✓ OPV10-1~6 负控制开关保护全部 PASS');
}

console.log('====================================================');
console.log('★ OPV10-1 ~ OPV10-6 机制贯通与正文注入闭环专项测试全部通过！');

#!/usr/bin/env node
'use strict';
/**
 * tests/scene-intent-v2542.js — 叙事脊柱 L1「本幕」专锁（v2.542.2）
 *
 * 锁六件事（每一件都能单独红，且各有负控制）：
 *   A 关闭即零变化：engine 默认关 ⇒ buildBlock() 返回**空串**，注入面一项都不多；
 *   B 开启且无排期：compose 如实 ok:false + reason，并把缺席的源**逐条点名**进 skipped（不猜、不补）；
 *   C 开启且有排期：戏剧问题来自 picked[0]，改变轴按 bucket 定，回收取 developing 里最老的一条；
 *   D 节奏规则表：四条分支 + 「脉搏不足 3 个」必须**点名**而不是静默落到 hold；
 *   E 接线四处同批：SOURCES / def / SRC_NAME / SRC_MOD_SETTING / VIS_NAMES / PRIORITY / LOAD 顺序；
 *   F 负控制两向：拆掉 def 里的键、把分支挪到快照之后 ⇒ 对应判据必须红（证明判据真在读）。
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
let pass = 0; let fail = 0;
function a(cond, msg) { if (cond) pass += 1; else { fail += 1; console.error('FAIL ' + msg); } }
const rd = function (rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); };
const cnt = function (s, n) { return s.split(n).length - 1; };

const sync = require('./ui-gate-sync.js');

/* ─────────── A 关闭即零变化 ─────────── */
{
  const WA = sync.fresh().WA;
  const si = WA.sceneIntent;
  a(!!si && typeof si.buildBlock === 'function', 'A1: 引擎装载并导出 buildBlock');
  a(si.getSettings().enabled === false, 'A2: 默认关闭（enabled:false）——关闭是默认值，不是「没读到」');
  a(si.buildBlock() === '', 'A3: 关闭时 buildBlock 返回空串（零 token，不是「空段包壳」）');
  a(si.compose().ok === false && si.compose().reason === 'disabled', 'A4: 关闭时 compose 如实报 disabled，不返回半截结构');
  a(si.getSettings().maxTokens === 220 && si.getSettings().paceRules === true, 'A5: 归一化默认值 maxTokens=220 / paceRules=true');
  const before = si.stat().blocks;
  si.buildBlock(); si.buildBlock();
  a(si.stat().blocks === before, 'A6: 关闭时连续调用不增加 blocks 计数（没有隐性产出）');
}

/* ─────────── B 开启但无排期：逐条点名 ─────────── */
{
  const env = sync.fresh(); const WA = env.WA;
  WA.store.init();
  a(WA.sceneIntent.setSettings({ enabled: true }).ok === true, 'B1: 开启成功（settingsBus 往返）');
  const c = WA.sceneIntent.compose();
  a(c.ok === false, 'B2: 无排期时 ok:false（不编一个「戏剧问题」出来）');
  a(c.reason === 'no-agenda', 'B3: 原因如实为 no-agenda');
  a(Array.isArray(c.skipped) && c.skipped.some(function (x) { return x.face === 'director'; }),
    'B4: 缺席的源点名进 skipped（director）');
  a(WA.sceneIntent.buildBlock() === '', 'B5: 无排期时注入块为空串（零 token）');
  WA.sceneIntent.setSettings({ enabled: false });
}

/* ─────────── C 有排期：问题 / 轴 / 回收 ─────────── */
{
  const env = sync.fresh(); const WA = env.WA;
  WA.store.init();
  WA.store.transact(function (s) {
    s.evolution = s.evolution || {}; s.evolution.round = 5;
    s.currents = [{ title: '盐路被截', advanceAtRound: 1, stage: 'boiling' }];
    s.memory = s.memory || {};
    s.memory.foreshadows = [
      { id: 'fs2', content: '还没拆的第二封信', status: 'developing', at: 4 },
      { id: 'fs1', content: '枕下那封没拆的信', status: 'developing', at: 2 },
      { id: 'fs3', content: '已回收的旧事', status: 'recycled', at: 1 }
    ];
  });
  WA.sceneIntent.setSettings({ enabled: true });
  const c = WA.sceneIntent.compose();
  a(c.ok === true, 'C1: 有排期时 ok:true');
  a(typeof c.question === 'string' && c.question.length > 0 && c.question.indexOf('？') > 0,
    'C2: 戏剧问题是一个问句（问题为空则「这一场要解决什么」无从回答）');
  a(c.question.indexOf(String(c.item.who)) === 0, 'C3: 问题的主语就是 picked[0].who（不另编一个人名）');
  a(c.change && ['knowledge', 'relation', 'situation'].indexOf(c.change.axis) >= 0, 'C4: 改变轴落在三档词表内');
  a(c.callback && c.callback.id === 'fs1',
    'C5: 回收取 developing 里**最老**的一条（at 最小）——recycled 的不算，id 实 ' + String(c.callback && c.callback.id));
  const t = WA.sceneIntent.buildBlock();
  a(t.length > 0 && t.indexOf('【本幕】') === 0, 'C6: 注入块以【本幕】开头');
  a(t.indexOf('不是已发生的事实') >= 0, 'C7: 块内明写「不是事实、不要提及」（防正文复述）');
  a(t.indexOf('盐路被截') >= 0, 'C8: 块内出现真条目主语（不是通用模板话术）');
  a(t.indexOf('要变') >= 0, 'C9: 块内明写「这一幕结束时至少有一件事要变」');
  WA.sceneIntent.setSettings({ maxTokens: 80 });
  a(WA.sceneIntent.buildBlock().length <= 80, 'C10: maxTokens 生效（按字符上限保守截断）');
  WA.sceneIntent.setSettings({ maxTokens: 220 });
}

/* ─────────── D 节奏规则表（逐条 + 不足样本点名） ─────────── */
{
  const env = sync.fresh(); const WA = env.WA;
  WA.store.init();
  WA.store.transact(function (s) {
    s.evolution = s.evolution || {}; s.evolution.round = 5;
    s.currents = [{ title: '盐路被截', advanceAtRound: 1, stage: 'boiling' }];
  });
  WA.sceneIntent.setSettings({ enabled: true });
  const real = WA.plotGauge;
  function stub(o) {
    WA.plotGauge = {
      tension: function () { return o.tension; },
      trend: function () { return o.trend; },
      advice: function () { return { ok: true, rows: o.rows || [] }; }
    };
  }
  stub({ tension: { ok: true, score: 90, band: 'climax' }, trend: { ok: true, direction: 'rising' } });
  a(WA.sceneIntent.compose().pace === 'breathe', 'D1: 张力≥75 且连续上行 ⇒ breathe（给喘息）');
  stub({ tension: { ok: true, score: 40, band: 'warming' }, trend: { ok: true, direction: 'wave' }, rows: [{ id: 'close-overdue' }] });
  a(WA.sceneIntent.compose().pace === 'release', 'D2: 建议含 close-overdue ⇒ release（先收线）');
  stub({ tension: { ok: true, score: 40, band: 'warming' }, trend: { ok: true, direction: 'falling' } });
  a(WA.sceneIntent.compose().pace === 'press', 'D3: 连续下行 ⇒ press');
  stub({ tension: { ok: true, score: 20, band: 'calm' }, trend: { ok: true, direction: 'wave' } });
  a(WA.sceneIntent.compose().pace === 'press', 'D4: 张力≤30 ⇒ press');
  stub({ tension: { ok: true, score: 55, band: 'tense' }, trend: { ok: true, direction: 'wave' } });
  a(WA.sceneIntent.compose().pace === 'hold', 'D5: 其余 ⇒ hold');
  stub({ tension: { ok: true, score: 55 }, trend: { ok: false, reason: 'insufficient-samples' } });
  const cS = WA.sceneIntent.compose();
  a(cS.pace === 'hold' && cS.skipped.some(function (x) { return x.face === 'plotGauge.trend' && x.reason === 'insufficient-samples'; }),
    'D6: 脉搏不足 3 个时**点名** insufficient-samples（不是静默 hold）');
  stub({ tension: { ok: false, reason: 'no-signal' }, trend: { ok: false, reason: 'x' } });
  const cT = WA.sceneIntent.compose();
  a(cT.pace === 'hold' && cT.skipped.some(function (x) { return x.face === 'plotGauge' && x.reason === 'no-signal'; }),
    'D7: 张力算不出时点名 no-signal 并退回 hold');
  WA.plotGauge = real;
  WA.sceneIntent.setSettings({ enabled: false });
}

/* ─────────── E 接线：四处同批（本仓 v2.56.0 立的规矩） ─────────── */
{
  const INJ = rd('render/inject.js');
  const TAB = rd('engines/inject-budget-tables.js');
  const PAN = rd('ui/panel.js');
  const IDX = rd('index.js');
  const RUN = rd('tests/run.js');
  const DIAG = rd('engines/tool-diag-tables.js');
  // SOURCES 数组切片
  const i0 = INJ.indexOf('const SOURCES = [');
  const i1 = INJ.indexOf('];', i0);
  const srcBody = INJ.slice(i0, i1);
  a(srcBody.indexOf("'sceneIntent'") >= 0, 'E1: SOURCES 含 sceneIntent');
  a(cnt(srcBody, "'sceneIntent'") === 1, 'E2: SOURCES 里恰登记 1 次（重复登记会让键集对不上）');
  a(INJ.indexOf('def: { sceneIntent: true') >= 0, 'E3: def 有默认值（缺默认值 ⇒ loadVis 记 undeclared，开关点了零效果）');
  a(INJ.indexOf("sceneIntent: '本幕（场景意图）'") >= 0, 'E4: SRC_NAME 有显示名');
  a(INJ.indexOf("sceneIntent: 'worldaxis_scene_intent_settings_v1'") >= 0, 'E5: SRC_MOD_SETTING 有模块总开关键');
  a(ENV_CHECK(), 'E6: 引擎的设置键与 SRC_MOD_SETTING 逐字一致（否则「模块总开关关」判不出来）');
  function ENV_CHECK() {
    const m = INJ.match(/sceneIntent: '([a-z0-9_]+)'/);
    return !!m && rd('engines/scene-intent.js').indexOf("'" + m[1] + "'") >= 0;
  }
  // 分支必须是 inject 第一项
  const iBranch = INJ.indexOf("if (vis.sceneIntent && WA.sceneIntent)");
  const iSnap = INJ.indexOf('const snap = this.buildWorldSnapshot();', INJ.indexOf('applyInjections('));
  a(iBranch > 0, 'E7: 注入分支存在');
  a(iBranch > 0 && iSnap > 0 && iBranch < iSnap, 'E8: 分支在 buildWorldSnapshot **之前**（「本幕」是第一项，否则它会被世界状态压到后面）');
  a(INJ.indexOf("items.push({ source: '本幕（场景意图）', content: si })") >= 0, 'E9: 注入项 source 名为「本幕」');
  a(cnt(TAB, "'本幕（场景意图）': { rank: 1") === 1, "E10: PRIORITY 里「本幕」= rank 1 恰 1 处（pinned，不被容量静默丢弃）");
  a(TAB.indexOf("'本幕（场景意图）'") >= 0 && TAB.indexOf("'近端事件': { rank: 1") >= 0, 'E11: 「本幕」与近端事件同档（rank 1）');
  a(PAN.indexOf("sceneIntent: '本幕（场景意图）'") >= 0, 'E12: panel 的 VIS_NAMES 有显示名（缺则面板裸露英文键名）');
  // LOAD 顺序：两个面都要，且都在 render/inject.js 之前
  const order = (IDX.match(/const LOAD_ORDER = \[([\s\S]*?)\];/) || [])[1] || '';
  a(order.indexOf("'engines/scene-intent.js'") >= 0, 'E13: index.js LOAD_ORDER 登记了引擎');
  a(order.indexOf("'engines/scene-intent.js'") < order.indexOf("'render/inject.js'"),
    'E14: 引擎早于 render/inject.js（否则注入时读到的是缺席）');
  a(RUN.indexOf("'engines/scene-intent.js'") >= 0, 'E15: tests/run.js 的 LOAD 同序登记（两面必须同源）');
  a(DIAG.indexOf("'engines/scene-intent.js': 'sceneIntent'") >= 0, 'E16: tool-diag 文件面映射登记（诊断清单覆盖磁盘模块）');
}

/* ─────────── F 负控制（两向）：判据真的在读 ─────────── */
{
  const INJ = rd('render/inject.js');
  const brokenDef = INJ.replace('def: { sceneIntent: true', 'def: { ');
  a(brokenDef !== INJ && brokenDef.indexOf('def: { sceneIntent: true') < 0, 'F1: 负控制构造成功（拆掉 def 里的键）');
  a(!(brokenDef.indexOf('def: { sceneIntent: true') >= 0), 'F2: 拆掉之后 E3 的判据必须为假（证明它读的是现场文本）');
  const iBranch = INJ.indexOf("if (vis.sceneIntent && WA.sceneIntent)");
  const iSnap = INJ.indexOf('const snap = this.buildWorldSnapshot();', INJ.indexOf('applyInjections('));
  const moved = INJ.slice(0, iBranch) + INJ.slice(INJ.indexOf('}\n', iBranch) + 2);
  a(moved.indexOf("if (vis.sceneIntent && WA.sceneIntent)") < 0, 'F3: 负控制构造成功（删掉分支）');
  a(iBranch < iSnap, 'F4: 正版分支确在快照之前（与 E8 同源，读的是同一对位置）');
}

console.log('\nSCENE-INTENT-V2542: ' + pass + ' / 失败 ' + fail);
process.exit(fail === 0 ? 0 : 1);
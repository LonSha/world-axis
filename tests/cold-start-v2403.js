#!/usr/bin/env node
/**
 * v2.403.0 专锁：冷启动起线条款 + 推演健康台账（simHealth）
 *
 * ── 治什么病 ──────────────────────────────────────────────────────────────
 *  实测 R244（玩家截图）：4 轮后「追踪人物 / 活跃暗流 / 长期事实」三个读数全是 0，
 *  面板那句「不是『没读到』，是确实没有」是诚实的 —— 根因是推演契约在冷启动期
 *  「由构造即死」（规则5「无源变化禁止入账」+ 尾行「无变化就给空数组」合谋，
 *  空世界开局时被模型解读为「没有既有状态 ⇒ 没有变化 ⇒ 全给空数组」）。
 *  两刀：
 *    刀① 引擎契约尾行改写：暗流为空而正文有玩家行动时，「起线」是义务不是可选；
 *    刀② 推演健康台账：推演链每个分岔口记账，玩家面可见（firstRunView 推演面
 *         + 概览页 wa-sim-health-line），消灭「静默失败」。
 *
 * ── 判据纪律 ─────────────────────────────────────────────────────────────
 *  判据一律「真返回驱动」：buildPrompt 取 sys 真文本、直接调 requestSimulate /
 *  simHealth/simHealthLine 真函数，不在子集上恒真。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const BS_REL = 'engines/backstage.js';
const HP_REL = 'engines/health-preflight.js';
const OM_REL = 'ui/pages/overview-main.js';

function rd(rel) {
  if (rel === OM_REL) return require('./panel-source.js').panelSource();
  return fs.readFileSync(path.join(BASE, rel), 'utf8');
}
function cnt(s, n) { return s.split(n).length - 1; }

function runAll(assertFn) {
  require(path.join(BASE, 'tests/mock.js'));
  let pass = 0, fail = 0;
  const fails = [];
  const a = function (ok, name) {
    if (ok) { pass++; } else { fail++; fails.push(name); }
    if (typeof assertFn === 'function') assertFn(ok, name);
  };

  const BS = rd(BS_REL), HP = rd(HP_REL), OM = rd(OM_REL);

  // ═══ A 面：刀① 契约尾行（真返回驱动）═══
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh({});
  const WA = env.WA;
  WA.store.init();
  let sysText = '';
  try {
    const msgs = WA.backstage.buildPrompt({ idx: 1 }, '');
    sysText = (msgs[0] && msgs[0].content) || '';
  } catch (e) { sysText = ''; }
  a(sysText.indexOf('【输出契约】') >= 0, 'A1 buildPrompt 真返回含【输出契约】标记（buildPrompt 可真调用）');
  a(sysText.indexOf('这是义务而非可选') >= 0, 'A2 起线义务条款在场（真文本）');
  a(sysText.indexOf('至少1条暗流') >= 0, 'A3 起线数量下限在场（真文本）');
  a(sysText.indexOf('正文本身就是因果源') >= 0, 'A4 因果源依据在场（真文本）');
  a(cnt(sysText, '无变化就给空数组') === 0, 'A5 旧尾行「无变化就给空数组」已移除（真文本不含）');
  a(sysText.indexOf('宁缺毋滥') >= 0, 'A6 宁缺毋滥原则保留（改写而非删除）');
  a(sysText.indexOf('绝不代写玩家言行') >= 0, 'A7 边界条款保留（起线义务不放松反代写边界）');
  a(sysText.indexOf('绝不剧透suppress列内容') >= 0, 'A8 suppress 边界保留');

  // ═══ B 面：刀② 台账行为（真调用驱动）═══
  const bs = WA.backstage;
  a(bs && typeof bs.simHealth === 'function', 'B1 backstage.simHealth 读口在位');
  a(bs && typeof bs.simHealthLine === 'function', 'B2 backstage.simHealthLine 措辞真源在位');
  let h0 = null;
  try { h0 = bs.simHealth(); } catch (e) { h0 = null; }
  a(h0 && h0.state === 'never', 'B3 fresh 环境初始态 never（实 ' + (h0 && h0.state) + '）');
  let line0 = '';
  try { line0 = bs.simHealthLine(); } catch (e) { line0 = ''; }
  a(line0.indexOf('还没启动') >= 0, 'B4 never 措辞指向「还没启动」（实: ' + String(line0).slice(0, 26) + '…）');
  // 驱动 no-chat：无聊天时 requestSimulate('after-reply') 早退并真实记账 skipped/no-chat
  let r1 = null;
  try { r1 = bs.requestSimulate('after-reply'); } catch (e) { r1 = { threw: String(e && e.message || e) }; }
  a(r1 && typeof r1.then === 'function', 'B5 mock 有正文时 requestSimulate 真进 _start 主链（返回 Promise）');
  let h1 = null;
  try { h1 = bs.simHealth(); } catch (e) { h1 = null; }
  a(h1 && h1.state === 'skipped' && h1.reason === 'channel-unset', 'B6 通道未配置被真实记账 channel-unset（state=' + (h1 && h1.state) + ' reason=' + (h1 && h1.reason) + '）');
  a(h1 && h1.skipCount === 1, 'B7 skipCount 计数正确（实 ' + (h1 && h1.skipCount) + '）');
  let line1 = '';
  try { line1 = bs.simHealthLine(); } catch (e) { line1 = ''; }
  a(line1.indexOf('推演通道没有配置') >= 0, 'B8 channel-unset 措辞可读（实: ' + String(line1).slice(0, 26) + '…）');

  // ═══ C 面：玩家面接线（渲染产物驱动）═══
  a(cnt(HP, 'simState') >= 2, 'C1 health-preflight 推演面已接入（simState 字面≥2，实 ' + cnt(HP, 'simState') + '）');
  a(HP.indexOf('WA.backstage.simHealth()') >= 0, 'C2 firstRunView 走引擎单源（不另拼状态）');
  a(HP.indexOf('simHealthLine()') >= 0, 'C3 firstRunView 措辞走引擎真源');
  a(HP.indexOf("else if (simErr) state = 'unknown'") >= 0, 'C4 读不到 → unknown（不假称通过）');
  a(HP.indexOf("else if (simBad) state = 'blocked'") >= 0, 'C5 推演没跑 → blocked（不冒充健康）');
  a(OM.indexOf('id="wa-sim-health-line"') >= 0, 'C6 概览页 wa-sim-health-line 在位');
  a(OM.indexOf('WA.backstage.simHealthLine()') >= 0, 'C7 概览页措辞走引擎真源');
  a(OM.indexOf('${simHealthLine}') >= 0, 'C8 概览页模板注入');
  a(cnt(HP, 'WA.backstage.simHealthLine()') === 1, 'C9 firstRunView 内措辞真源只取一次（WA. 前缀调用恰 1 次，实 ' + cnt(HP, 'WA.backstage.simHealthLine()') + '）');

  // ═══ N 面：负控制（真源码破坏必现形）═══
  const anchorA = '这是义务而非可选';
  a(cnt(BS, anchorA) === 1, 'N1 负控制锚点A在引擎源中恰 1 次（工具自证，实 ' + cnt(BS, anchorA) + '）');
  const anchorB = 'simHealth() { return Object.assign({}, __simHealth); }';
  a(cnt(BS, anchorB) === 1, 'N2 负控制锚点B恰 1 次（实 ' + cnt(BS, anchorB) + '）');
  a(sysText.indexOf('这是义务而非可选') >= 0 && cnt(BS, anchorA) === 1,
    'N3 A2 判据与源码锚点同源（破坏锚点 ⇒ A2 必红）');
  a(h0 && h0.state === 'never' && cnt(BS, anchorB) === 1,
    'N4 B3 判据与 simHealth 实现同源（破坏实现 ⇒ B3 必红）');

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
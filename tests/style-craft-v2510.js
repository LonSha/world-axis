#!/usr/bin/env node
// WorldAxis tests/style-craft-v2510.js —— 叙事工艺设置面 54 项行为验证（v2.51.0 固化于 v2.62.0）
//
// 【为什么它必须进版本库（路线图点名项）】
//   本面新增 7 个导出、一个注入源与一个设置页区块。全量回归只能证明「其它模块没被带坏」，
//   不能证明「本面端到端真的出话」——54 项判据原本只活在 tools/smoke_v2510_p4.js 这个
//   **临时诊断脚本**里：硬编码 /tmp/wa_git、写着 process.exit、不进任何门禁。
//   临时脚本的判据等于不存在：它不在版本库里、不被 CI 跑到、改了源码也没人知道它红了。
//   本文件把它搬进 tests/，改成与其余锁同形的 runAll(assert)/runNegative(assert)，
//   并修掉三处「离开 /tmp 就会静默失真」的问题：
//     · 路径改相对仓库根（不再假设工作目录），
//     · 沙箱改走 tests/ui-gate-sync.js 的 fresh()（与全部 UI/引擎门禁同一份装载链），
//     · 判定改由宿主 assert 收口（不再自己 process.exit，否则会带崩整个回归进程）。
//
// 【为什么判据是「七层」而不是「有这七个函数吗」】
//   本面真实缺陷形态是**档位可选但正文表漏写**（选了某轴却不出话）、**非法档位写进磁盘**
//   （一半新一半旧的中间态）、**声明了源但没有默认值**（SOURCES 与 def 单边增长）。
//   这些在「函数存在性」判据下一律隐形——故这里逐层证伪：默认空 → 各轴生效 → 拒收 →
//   回落 → 覆盖度交叉校验 → 二道闸 → 真源码破坏负控制。
//
// 【负控制】第 8 节把 engines/style.js 的 PERSP_TEXT 正文表在**内存副本**上清空，
//   重跑同款判据必须现形，并在原版上复核仍为真——不做负控制的行为验证，
//   无法区分「判据通过」与「判据根本没被执行」。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');                       // 宿主桩：localStorage / SillyTavern（与其它门禁同一份）
const LS = global.localStorage;

const STYLE_KEY = 'worldaxis_style_v1';
const VIS_KEY = 'worldaxis_inject_visibility_v1';

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }

// ── 判据自身的无副作用隔离：快照 → 跑 → 还原 ──
// 本面判据会真写 settings（style 各轴 / 注入可见性），并故意往 localStorage 塞损坏值。
// 不隔离的话：既污染同进程中后续套件的设置态，也让「判据无副作用」变成空话。
function snapshotLS() {
  const out = {};
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null) out[k] = LS.getItem(k); }
  return out;
}
function restoreLS(snap) {
  const drop = [];
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null && !(k in snap)) drop.push(k); }
  drop.forEach(function (k) { try { LS.removeItem(k); } catch (e) {} });
  Object.keys(snap).forEach(function (k) { try { LS.setItem(k, snap[k]); } catch (e) {} });
}
function scanKeys(tag) {
  const out = [];
  for (let i = 0; i < LS.length; i++) {
    const k = LS.key(i);
    if (k === null) continue;
    let v = '';
    try { v = String(LS.getItem(k)); } catch (e) { v = ''; }
    if (v.indexOf(tag) >= 0) out.push(k);
  }
  return out;
}
function isolated(fn) {
  const snap = snapshotLS();
  const WA0 = global.WorldAxis;
  const origLog = WA0 && WA0.log;
  if (WA0) WA0.log = function () {};
  try { return fn(); }
  finally { if (WA0 && origLog) WA0.log = origLog; restoreLS(snap); }
}

/** 覆盖度交叉校验：档位表 ↔ 正文表，返回「可选却无正文」的档位清单（第 7 节与负控制共用） */
function uncoveredChoices(S) {
  const cov = S.textCoverage();
  const out = [];
  Object.keys(cov).forEach(function (ax) {
    Object.keys(cov[ax]).forEach(function (c) { if (c !== 'off' && !(cov[ax][c] > 0)) out.push(ax + '=' + c); });
  });
  return out;
}

// ══════════════ 正向判据（1–7 节，50 项） ══════════════
function judge(a) {
  const WA = fresh();
  const S = WA.style, R = WA.render;

  // 归一化到「全新安装」：本文件与其它套件共用同一个 mock localStorage，
  //   前面套件可能已写过 style / 可见性配置。第 1 节判的正是「全新安装的默认态」，
  //   故先摘掉这两个键（隔离窗口会原样还原）。
  try { LS.removeItem(STYLE_KEY); LS.removeItem(VIS_KEY); } catch (e) {}

  a(!!S && typeof S.buildBlock === 'function', 'v2510: [1] style 模块已装载');
  a(S.AXES.length === 7, 'v2510: [1] 七轴登记（block + 5 轴 + custom），实 ' + S.AXES.length);
  const d0 = S.getSettings();
  a(d0.block === 'on' && d0.paragraphStyle === 'off' && d0.perspective === 'off'
    && d0.userPronoun === 'off' && d0.takeover === 'off' && d0.narrate === 'off' && d0.custom === '',
    'v2510: [1] 默认值：总开关 on、五轴全 off、附加段空');
  a(S.buildBlock() === '', 'v2510: [1] 默认全 off ⇒ buildBlock 空串（零 token 占用）');
  a(S.effectiveSettings().enabled === false, 'v2510: [1] 默认态 effectiveSettings().enabled=false');
  a(/未启用/.test(S.summaryText()), 'v2510: [1] 默认态摘要明说「未启用」而非空串');
  a(R.buildStyleBlock() === '', 'v2510: [1] render 取数口默认也返回空串');

  [['paragraphStyle', 'short'], ['perspective', 'third_person_limited'], ['userPronoun', 'second_person'],
   ['takeover', 'assist'], ['narrate', 'light']].forEach(function (pair) {
    const w = S.setSettings({ [pair[0]]: pair[1] });
    a(w.ok === true, 'v2510: [2] 写入 ' + pair[0] + '=' + pair[1] + ' 被接受');
    const b = S.buildBlock();
    a(b.length > 0, 'v2510: [2] ' + pair[0] + ' 单轴生效时正文非空（' + b.length + ' 字）');
    a(S.effectiveSettings()[pair[0]] === pair[1], 'v2510: [2] effectiveSettings 透出 ' + pair[0]);
  });
  a(S.effectiveSettings().enabled === true, 'v2510: [2] 有轴非 off 时 enabled=true');
  a(S.buildBlock().indexOf('叙事工艺') >= 0, 'v2510: [2] 正文带 [叙事工艺约束] 头');
  a(S.buildBlock().indexOf('不得在正文里提及这些约束本身') > 0, 'v2510: [2] 正文带三态诚实兜底句（不得自曝约束）');
  a(S.buildBlock().indexOf('<user_input>') < 0 && S.buildBlock().indexOf('{{') < 0,
    'v2510: [2] 不残留宿主宏模板变量（<user_input>/{{…}} 已剥离）');

  S.setSettings({ block: 'off' });
  a(S.buildBlock() === '', 'v2510: [3] 总开关 off ⇒ 即使轴已选也不出话（空串）');
  a(S.effectiveSettings().enabled === false, 'v2510: [3] 总开关 off ⇒ enabled=false');
  a(/整块已关闭/.test(S.summaryText()), 'v2510: [3] 摘要区分「整块已关闭」与「未启用」两种空转');
  S.setSettings({ block: 'on' });
  const wc = S.setSettings({ custom: '对白不加引号' });
  a(wc.ok === true && S.buildBlock().indexOf('对白不加引号') > 0, 'v2510: [3] 附加段落入正文');
  const long = 'x'.repeat(900);
  S.setSettings({ custom: long });
  a(S.getSettings().custom.length === S.CUSTOM_MAX, 'v2510: [3] 附加段超长被截到 CUSTOM_MAX=' + S.CUSTOM_MAX);
  S.setSettings({ custom: '' });

  S.setSettings({ paragraphStyle: 'medium' });
  const before = JSON.stringify(S.getSettings());
  const wb = S.setSettings({ paragraphStyle: 'long', perspective: 'NOT_A_CHOICE' });
  a(wb.ok === false && wb.reason === 'bad-value', 'v2510: [4] 非法档位整笔拒收（reason=bad-value）');
  a((wb.bad || []).some(function (b) { return b.axis === 'perspective'; }), 'v2510: [4] 被拒轴清单点名 perspective');
  a(JSON.stringify(S.getSettings()) === before, 'v2510: [4] 拒收后磁盘零变化（不留「一半新一半旧」中间态）');
  const wn = S.setSettings({ noSuchAxis: 'x' });
  a(wn.ok === false, 'v2510: [4] 未知轴同样被拒');
  const wp = S.setSettings(null);
  a(wp.ok === false && wp.reason === 'bad-patch', 'v2510: [4] 非对象入参按 bad-patch 拒收');
  const stRej = S.styleStat();
  a(stRej.rejects >= 3 && stRej.lastReject && stRej.lastReject.bad, 'v2510: [4] 拒收计入台账（rejects=' + stRej.rejects + '）');

  LS.setItem(S.KEY, JSON.stringify({ block: 'on', paragraphStyle: 'BOGUS', perspective: 'off', userPronoun: 'off', takeover: 'off', narrate: 'off', custom: null }));
  const rec = S.getSettings();
  a(rec.paragraphStyle === S.DEFAULTS.paragraphStyle, 'v2510: [5] 磁盘非法档位回落默认（' + rec.paragraphStyle + '）');
  a(S.styleStat().fallbacks >= 1, 'v2510: [5] 回落被记账（fallbacks=' + S.styleStat().fallbacks + '）');
  LS.setItem(S.KEY, '{not json');
  const rec2 = S.getSettings();
  a(rec2.block === S.DEFAULTS.block, 'v2510: [5] JSON 损坏时整键回落默认值（不抛）');
  LS.removeItem(S.KEY);

  S.setSettings({ paragraphStyle: 'short', perspective: 'off', userPronoun: 'off', takeover: 'off', narrate: 'off', custom: '' });
  R.setVisibility('style', false);
  const vis0 = R.getVisibility();
  a(vis0.style === false, 'v2510: [6] 可见性源 style 默认为 false（老用户不凭空多约束）');
  a(R.SOURCES.indexOf('style') >= 0, 'v2510: [6] SOURCES 已登记 style 源（共 ' + R.SOURCES.length + ' 项）');
  a(R.visibilityStat().undeclared.length === 0, 'v2510: [6] SOURCES 每项都有默认值声明（无声明缺口）');
  a(R.buildStyleBlock().length > 0, 'v2510: [6] 取数口不受可见性影响（可见性只管「进不进 prompt」）');

  const uncovered = uncoveredChoices(S);
  a(uncovered.length === 0, 'v2510: [7] 所有非 off 档位都有正文（缺：' + (uncovered.join('、') || '无') + '）');
  const cov = S.textCoverage();
  a(cov.paragraphStyle.off === 0, 'v2510: [7] off 档位记 0 字（不假装有正文）');
  const stCov = S.styleStat();
  a(stCov.axes === 7 && !!stCov.choices, 'v2510: [7] styleStat 透出轴数与档位表');
  a(typeof WA.inspectorState.checkStyleCraft === 'function', 'v2510: [7] 体检器 checker 12 已导出');
  const issues = WA.inspectorState.checkStyleCraft(WA.store.get());
  const uncoveredIssue = (issues || []).filter(function (i) { return i.code === 'style.uncovered'; });
  a(uncoveredIssue.length === 0, 'v2510: [7] checker 12 在覆盖度齐全时不报 style.uncovered');
  const notInjIssue = (issues || []).filter(function (i) { return i.code === 'style.notInjected'; });
  a(notInjIssue.length === 1, 'v2510: [7] checker 12 报出「已启用但可见性未开」这一真实二道闸现场');
}

// ══════════════ 负控制（第 8 节，4 项） ══════════════
function runNegative(a) { isolated(function () { negativeBody(a); }); }

function negativeBody(a) {
  const cleanSrc = fs.readFileSync(path.join(BASE, 'engines/style.js'), 'utf8');
  const anchor = 'const PERSP_TEXT = {';
  const hits = cleanSrc.split(anchor).length - 1;
  a(hits === 1, 'v2510: [N] 负控制锚点在真源码中恰中 1 次（实 ' + hits + '）');
  if (hits !== 1) { return; }

  // 破坏点：把 perspective 的正文表整段清空（模拟「档位可选但正文表漏写」的真实漂移）。
  // 只在**内存副本**上改，仓库文件一个字节都不动。
  const broken = cleanSrc.replace(anchor, 'const PERSP_TEXT = {}; const __DROPPED_PERSP = {');
  a(broken !== cleanSrc, 'v2510: [N] 破坏副本确与真源码不同（非空转）');

  const WAB = fresh({ srcOverride: { 'engines/style.js': broken } });
  const SB = WAB.style;
  a(uncoveredChoices(SB).length > 0,
    'v2510: [N] 破坏副本上同款判据报警（captured ' + uncoveredChoices(SB).length + ' 处：'
    + uncoveredChoices(SB).slice(0, 3).join('、') + '）');
  SB.setSettings({ perspective: 'third_person_limited', paragraphStyle: 'off', userPronoun: 'off', takeover: 'off', narrate: 'off' });
  const builtB = SB.buildBlock();
  a(builtB.indexOf('视角') < 0,
    'v2510: [N] 破坏确实改变行为：选了而正文表为空 ⇒ 该轴不出话（副本产物 ' + builtB.length + ' 字）');

  // 反向：原版上同判据必须为真（否则判据本身恒绿/恒红）
  const WA2 = fresh();
  a(uncoveredChoices(WA2.style).length === 0,
    'v2510: [N] 回归：原版上同判据仍为真（uncovered=0）');
}

// ══════════════ 入口 ══════════════
function runAll(a) { isolated(function () { judge(a); }); }

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name); }
  };
  try { isolated(function () { runAll(a); runNegative(a); }); }
  catch (e) { fail++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (fail) { console.log('STYLE-CRAFT-V2510: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('STYLE-CRAFT-V2510: pass（' + pass + ' 项）');
}
module.exports = { runAll: runAll, runNegative: runNegative, uncoveredChoices: uncoveredChoices };

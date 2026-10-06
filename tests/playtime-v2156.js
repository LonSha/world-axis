#!/usr/bin/env node
// v2.156.0 SP1 专锁：时间来源与游玩生命周期（engines/playtime.js）
//   它锁的判据：
//     ① **读不到 ≠ 没有基准**（no-baseline 与存储故障分报，不是一个 ok:false 了事）；
//     ② 读基准**不改基准**（lastActive 是纯读 —— 恢复编排靠这条才能算出「离开了多久」）；
//     ③ 节流是**有界频率**（紧接的第二次 touch 不推进，force 才绕过）；
//     ④ 剧情时间缺失即**拒算**（no-clock；不拿真实时间顶替「大概是今天」）；
//     ⑤ **零世界写入**（全模块 .transact( 恰 0 处 —— 「不进世界存档」是结构事实，不是承诺）；
//     ⑥ 每聊天**各记一份**（别的 chatId 不串）。
//   ── 夹具纪律（本文件实测自纠）：`fresh()` 在本套件里是**同一进程内的多次装载**，
//      而活动基准键落在宿主的 localStorage 上 —— 它**跨 fresh 存活**。故每个负控制
//      用例都必须先 resetHost() 把「三件事」摆回前置条件（键、世界钟、chat 上下文）；
//      否则上一次用例的残留会先于破坏生效，把「破坏没被观测到」伪装成「破坏无害」。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const REL = 'engines/playtime.js';
const SELF_REL = 'tests/playtime-v2156.js';

// 锚点一取「读不到基准」的早退行：它是本模块存在的理由 —— 丢了它，
//   「不知道你走了多久」就与「你走了零秒」在线上一模一样。
const ANCHOR = '    if (!row || !isFinite(row.lastActiveAt)) {';
// 锚点二取节流判据行：它是「有界频率」的全部实现（`!o.force` 是唯一绕过口）。
const ANCHOR2 = '    if (!o.force && prev && isFinite(prev.lastActiveAt) && (now - prev.lastActiveAt) < cfg.updateMinMs) {';
// 锚点三取剧情时间的拒算行：缺世界钟时**不猜日期**（同「无距离不传播」）。
const ANCHOR3 = "      noteFault('no-clock');";
// 锚点四取读回点（解析失败那一支）的归因投递：读失败必须留痕，否则与「正常开局」同形。
const ANCHOR4 = "      try { if (WA.store && typeof WA.store.reportReadFail === 'function') WA.store.reportReadFail('playtime', DATA_KEY, eP); } catch (e3) {}";

function countOcc(s, sub) { return s.split(sub).length - 1; }
function fresh(ov) { return sync.fresh(ov ? { srcOverride: ov } : undefined).WA; }
function on(WA) { WA.store.init(); }

/** 前置条件复位：本键**跨 fresh 存活**（在宿主 localStorage 上），故显式清。 */
function resetHost(WA) {
  try { WA.mainWin.localStorage.removeItem('worldaxis_playtime_v1'); } catch (e) {}
  try { WA.store.transact(function (d) { d.clock.label = ''; d.clock.dayIndex = null; d.clock.source = ''; }, 'playtime-v2156:reset'); } catch (e) {}
}

// ── A 结构面 ──────────────────────────────────────────────────────────
function runA(a) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  a(countOcc(src, ANCHOR) === 1, 'v2156/pt A1: no-baseline 早退锚点恰中 1 次（实 ' + countOcc(src, ANCHOR) + '）');
  a(countOcc(src, ANCHOR2) === 1, 'v2156/pt A2: 节流判据锚点恰中 1 次（实 ' + countOcc(src, ANCHOR2) + '）');
  a(countOcc(src, ANCHOR3) === 1, 'v2156/pt A3: no-clock 拒算锚点恰中 1 次（实 ' + countOcc(src, ANCHOR3) + '）');
  a(countOcc(src, ANCHOR4) === 1, 'v2156/pt A4: 读失败归因锚点恰中 1 次（实 ' + countOcc(src, ANCHOR4) + '）');
  a(src.indexOf("WA.registerModule('engines/playtime.js'") >= 0, 'v2156/pt A5: 模块自报登记');
  a(src.indexOf('__settingsRegs = (WA.__settingsRegs || []).concat([__REG])') >= 0,
    'v2156/pt A6: 设置键走 __settingsRegs 登记（自检可见，不是黑盒）');
  // 边界 2 的**结构事实**：本模块一个事务都不开，故「不进世界存档」不靠自律。
  a(countOcc(src, '.transact(') === 0,
    'v2156/pt A7: 全模块零事务（实 ' + countOcc(src, '.transact(') + '）—— 「活动基准不进世界存档」是结构事实');
  a(countOcc(src, 'w.localStorage.getItem(DATA_KEY)') === 1 && countOcc(src, 'w.localStorage.setItem(DATA_KEY') === 1,
    'v2156/pt A8: 本键的读回点与写点各恰 1 处（实 ' + countOcc(src, 'w.localStorage.getItem(DATA_KEY)') + '/' + countOcc(src, 'w.localStorage.setItem(DATA_KEY') + '）—— 一对进出口');
  a(src.indexOf("'worldaxis_playtime_v1'") >= 0 && src.indexOf('SOURCE_NAMES') >= 0,
    'v2156/pt A9: 数据键与四时间源名册在场（取用表是本模块的拟交付物之一）');
  const self = fs.readFileSync(path.join(BASE, SELF_REL), 'utf8');
  a(countOcc(self, ANCHOR) >= 1 && countOcc(self, ANCHOR2) >= 1 && countOcc(self, ANCHOR3) >= 1 && countOcc(self, ANCHOR4) >= 1,
    'v2156/pt A10: 四个锚点在本文件里至少各引用 1 次');
  // 接线契约（跨文件）：store 必须把这个键归到**独立家族**，否则它要么落进
  //   settingsUnregistered（把进程侧记忆报成用户配置）、要么被当成存档本体。
  const store = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
  a(store.indexOf('playtime: /^worldaxis_playtime_v1$/') >= 0
    && store.indexOf("return { family: 'playtime', chat: null };") >= 0,
    'v2156/pt A11: core/store.js 已把活动基准键归入独立家族（settingsUnregistered 不被悄悄加一）');
  // G16 冻结清单：本模块的裸读点**必须**在册（它是「读失败与结论同形」的温床）。
  const run = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
  a(run.indexOf("'engines/playtime.js': 1,") >= 0 && run.indexOf('G16 裸读点总数为 47') >= 0,
    'v2156/pt A12: G16 冻结清单已收录本模块（1 处）且总数文案同步为 47');
}

// ── B 运行时 ──────────────────────────────────────────────────────────
function runB(a) {
  const WA = fresh();
  on(WA);
  const P = WA.playtime;
  a(!!P && typeof P.touch === 'function' && typeof P.lastActive === 'function' && typeof P.story === 'function'
    && typeof P.sources === 'function' && typeof P.stat === 'function'
    && P.SOURCE_NAMES.length === 4 && P.DATA_KEY === 'worldaxis_playtime_v1',
    'v2156/pt B1: touch/lastActive/story/sources/stat 五出口 + 四源名册 + 数据键在场');

  // B2 总开关：关闭后一并拒收（不是「touch 到空的」）
  P.setSettings({ enabled: false });
  a(P.touch({ force: true }).reason === 'disabled', 'v2156/pt B2: 关闭后 touch 拒收（disabled）—— 「关掉了」与「没更新」必须分得开');
  P.setSettings({ enabled: true });

  // B3 无基准：如实报 no-baseline（不是 ok:true + at:0）
  const la0 = P.lastActive();
  a(la0.ok === false && la0.reason === 'no-baseline',
    'v2156/pt B3: 从没记过 ⇒ no-baseline（「没记过」不等于「你走了零秒」）');

  // B4 写入后读回同一时刻
  const t1 = P.touch({ force: true });
  a(t1.ok === true && t1.updated === true && t1.updates === 1, 'v2156/pt B4: 首次 touch 落基准（updates 1）');
  const la1 = P.lastActive();
  a(la1.ok === true && la1.at === t1.at, 'v2156/pt B5: lastActive 读回同一时刻（' + la1.at + '）');
  const la2 = P.lastActive();
  a(la2.at === la1.at && la2.updates === la1.updates, 'v2156/pt B6: **读基准不改基准**（两次读回逐字相同）');

  // B7 节流：有界频率（紧接的第二次不推进）
  const t2 = P.touch({});
  a(t2.ok === true && t2.updated === false && t2.throttled === true && t2.at === t1.at,
    'v2156/pt B7: 节流内第二次 touch 不推进（throttled 且 at 不动）—— 本键的写成本可预算');
  const t3 = P.touch({ force: true });
  a(t3.updated === true && t3.updates === 2, 'v2156/pt B8: force 绕过节流（显式动作才写盘）');

  // B9 每聊天各记一份（不串）
  a(P.lastActive('other_chat').reason === 'no-baseline', 'v2156/pt B9: 别的 chatId 不被本聊天的基准顶替（各记一份）');

  // B10 剧情时间：缺失即拒算，有钟才答
  a(P.story().reason === 'no-clock', 'v2156/pt B10: 世界钟未设定 ⇒ no-clock（不猜日期）');
  WA.store.transact(function (d) { d.clock.label = '第三日·清晨'; d.clock.dayIndex = 3; d.clock.source = 'user'; }, 'playtime-v2156:clock');
  const sc = P.story();
  a(sc.ok === true && sc.label === '第三日·清晨' && sc.dayIndex === 3, 'v2156/pt B11: 有钟时如实回传 label/dayIndex（不加工）');

  // B12 取用表：四行且 activity 是**唯一**写盘的那一行
  const srcs = P.sources();
  a(srcs.length === 4 && srcs.filter(function (r) { return r.writes === true; }).length === 1
    && srcs.filter(function (r) { return r.writes === true; })[0].name === 'activity',
    'v2156/pt B12: 取用表四行、且只有 activity 一行写盘（谁写盘是这张表要回答的事）');
}

// ── 负控制：真源码破坏 → 内存副本 → 同款判据必须现形 ──────────────────────
function runNegative(a) {
  const orig = fs.readFileSync(path.join(BASE, REL), 'utf8');

  // N1 把「读不到基准」写成「读到了 0 秒的基准」⇒ 「你一周没来」被结算成「你刚走」
  const N1FIND = [
    "    if (!row || !isFinite(row.lastActiveAt)) {",
    "      stat.lastReason = 'no-baseline';",
    "      return { ok: false, reason: 'no-baseline', chatId: cid };",
    "    }"
  ].join(List_nl());
  a(countOcc(orig, N1FIND) === 1, 'v2156/pt N1 前提：早退块恰中 1 次');
  const b1 = orig.replace(N1FIND, [
    "    if (!row || !isFinite(row.lastActiveAt)) {",
    "      stat.lastReason = 'ok';",
    "      return { ok: true, chatId: cid, at: 0, ageMs: 0, updates: 0, firstAt: 0 };",
    "    }"
  ].join(List_nl()));
  if (b1 === orig) throw new Error('N1 破坏没有改变源码');
  const WA1 = fresh((function () { const o = {}; o[REL] = b1; return o; })());
  on(WA1); resetHost(WA1);
  const r1 = WA1.playtime.lastActive();
  a(r1.ok === true && r1.at === 0,
    'v2156/pt N1: 破坏后「从没记过」答成 ok:true/at:0（实 ' + JSON.stringify(r1) + '）—— 「不知道走了多久」与「走了零秒」不再可分');

  // N2 拿掉 force 判定 ⇒ 节流消失，每次调用都写盘
  a(countOcc(orig, ANCHOR2) === 1, 'v2156/pt N2 前提：节流行恰中 1 次');
  const b2 = orig.replace(ANCHOR2, '    if (false) {');
  if (b2 === orig) throw new Error('N2 破坏没有改变源码');
  const WA2 = fresh((function () { const o = {}; o[REL] = b2; return o; })());
  on(WA2); resetHost(WA2);
  WA2.playtime.touch({ force: true });
  const r2 = WA2.playtime.touch({});
  a(r2.updated === true && r2.updates === 2,
    'v2156/pt N2: 破坏后紧接的第二次 touch 也推进（updates ' + r2.updates + '）—— 有界频率失守');

  // N3 世界钟缺失时拿真实时间顶替 ⇒ 「不猜日期」失守
  const N3FIND = [
    "      noteFault('no-clock');",
    "      return { ok: false, reason: 'no-clock', note: '世界钟未设定：剧情时间缺失时拒算，不猜日期' };"
  ].join(List_nl());
  a(countOcc(orig, N3FIND) === 1, 'v2156/pt N3 前提：拒算块恰中 1 次');
  const b3 = orig.replace(N3FIND, "      return { ok: true, label: '推测：今日', dayIndex: null, source: 'guess' };");
  if (b3 === orig) throw new Error('N3 破坏没有改变源码');
  const WA3 = fresh((function () { const o = {}; o[REL] = b3; return o; })());
  on(WA3); resetHost(WA3);
  const r3 = WA3.playtime.story();
  a(r3.ok === true && r3.source === 'guess',
    'v2156/pt N3: 破坏后无钟也答 ok:true（实 ' + JSON.stringify(r3) + '）—— 「猜日期」与「读日期」不再可分');

  // N4 真文件逐字未变
  a(fs.readFileSync(path.join(BASE, REL), 'utf8') === orig, 'v2156/pt N4: 真源码文件逐字未变（破坏只在内存副本）');
}

function List_nl() { return String.fromCharCode(10); }

function runAll(a) { runA(a); runB(a); }
module.exports = { REL, ANCHOR, ANCHOR2, ANCHOR3, ANCHOR4, runA, runB, runAll, runNegative };

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) { if (cond) { pass++; } else { fail++; console.log('  \u2717 ' + msg); } };
  try { runAll(a); } catch (e) { fail++; console.log('  \u2717 抛出：' + e.message); }
  try { runNegative(a); } catch (e) { fail++; console.log('  \u2717 负控制抛出：' + e.message); }
  console.log('PLAYTIME-V2156: pass ' + pass + ' / fail ' + fail);
  process.exit(fail ? 1 : 0);
}

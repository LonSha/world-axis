'use strict';
/**
 * v2.265.0（V6 · EXV6-1）专锁：**世界日记 —— 你看不见的地方发生了什么**
 *
 * ── 这一版治的是什么 ─────────────────────────────────────────────────────
 * 幕后真相分散在三个既有容器里（`livingWorld` 的四条数组 / `elsewhere` 的 card.recent /
 *   `offlineTick.summary()`），每一处都只在各自的页里出现，玩家要「知道世界在动」得逛三处。
 * 本版不新开容器，只做一件事：**把这四处现成事实压成一到三句人话**。
 *
 * ── 两条最容易写成假绿的判据（本锁重点钉的就是这两条）─────────────────────
 *  ① **「没有地名」≠「地名被隐去」**：首版把两者压成同一个 `hidden:!pv.ok`，
 *     于是 `hidden` 在多数行上恒真 —— 那样它就不再是判据（与「全都可见」一样是假绿）。
 *     本版三态输出：点名 / 有地名但隐去（hidden:true）/ 本来没地名（hidden:false）。A3/B6 钉住。
 *  ② **「判不了」≠「看不见」**：`noesis.perceive` 在未启用时返回 `ok:false reason:'disabled'`。
 *     把 `ok:false` 读成「玩家看不见」= 拿读不到当读到了，并且方向还是**更保守的那一边**
 *     —— 于是永远不会有人发现。B5/B7 把这条分开。
 *   实现在 v2.265.0 内实测被这一条抓到过一次（首版就是这么写的），修后才绿。
 *
 * ── 段结构 ──────────────────────────────────────────────────────────────
 *  A 静态契约（锚点各恰 1 次 / 位置 / 零写面 / 导出面 / 面板入口）
 *  B 运行时（空态 / 四源合流 / 语料去重 / 三句上限 / 三态地点 / 判不了 vs 看不见）
 *  C 零写盘不变式（世界摘要、设置族、偏好键逐字不变）
 *  N 真源码破坏 + 两向自证（N1~N6）
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const ENG_REL = 'engines/world-diary.js';
const PANEL_REL = 'ui/panel.js';
const IDX_REL = 'index.js';
const RUN_REL = 'tests/run.js';
const SELF_REL = 'tests/world-diary-v2265.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }
function stripLineComments(s) {
  return s.split('\n').map(function (l) {
    const i = l.indexOf('//');
    return i < 0 ? l : l.slice(0, i);
  }).join('\n');
}
/** 破坏锚点：逐字取自产品源码，各恰 1 次（A1 验）。**只许在这里写一次**（A1f 验）。 */
const ANCHOR = {
  // 三态输出的三支（本版最核心的判据）
  triNoPlace: "if (!p) return { ok: false, place: '', hidden: false, why: 'no-place' };",
  triUnreadable: "if (!r || r.ok !== true) return { ok: false, place: '', hidden: false, why: 'perceive-' + ((r && r.reason) || 'failed') };",
  triOut: "return { ok: false, place: '', hidden: true, why: String(r.range || r.reason || 'unknown') };",
  // 三句上限
  capLine: 'const cap = Math.max(1, Math.min(6, num(o.maxLines) || cfg.maxLines));',
  // 去重
  dedupe: 'items.forEach(function (it) { if (!seen[it.text]) { seen[it.text] = 1; uniq.push(it); } });',
  // 空态如实
  quiet: "__stat.emptyBuilds++; __stat.lastReason = 'quiet';",
  // 溢出不静默
  dropSay: 'truncated: dropped > 0, dropped: dropped, quiet: false, boundary: b, cap: cap,',
  // 四源读口
  srcLiving: 'const st = WA.store && typeof WA.store.get === \'function\' ? WA.store.get() : null;',
  srcOffline: 'if (!cfg.includeOffline) return [];',
  srcElsewhere: 'const names = safe(function () { return WA.elsewhere && typeof WA.elsewhere.list === \'function\' ? WA.elsewhere.list() : []; }, []);',
  // 边界两向
  bndPerceive: 'const perceiveOk = !!(n && typeof n.perceive === \'function\');',
  bndPlayer: 'return wk && wk.player;',
  // 导出面
  exportsFace: 'build: build, stat: stat, reset: reset,'
};
const TGT = {
  triNoPlace: ENG_REL, triUnreadable: ENG_REL, triOut: ENG_REL, capLine: ENG_REL,
  dedupe: ENG_REL, quiet: ENG_REL, dropSay: ENG_REL, srcLiving: ENG_REL,
  srcOffline: ENG_REL, srcElsewhere: ENG_REL, bndPerceive: ENG_REL, bndPlayer: ENG_REL,
  exportsFace: ENG_REL
};
const LSKEY_WD = 'worldaxis_world_diary_settings_v1';

function runAll(assertFn) {
  require(path.join(BASE, 'tests/mock.js'));
  let pass = 0, fail = 0;
  const fails = [];
  const a = function (ok, name) {
    if (ok) { pass++; } else { fail++; fails.push(name); }
    if (typeof assertFn === 'function') assertFn(ok, name);
  };
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const E = rd(ENG_REL), SELF = rd(SELF_REL), P = rd(PANEL_REL), IX = rd(IDX_REL), RUN = rd(RUN_REL);
  const Ec = stripLineComments(E);
  function env0(ov) { return gate.fresh(ov ? { srcOverride: ov } : {}); }
  function mkEnv(ov) {
    const env = env0(ov || null);
    const WA = env.WA;
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    WA.store.init();
    WA.store.transact(function (d) { d.people = { A: { name: '老周' } }; }, 'v2265:seed');
    return env;
  }
  /** 造一批幕后事实（四条数组各一条，都落在 tick 窗口内）。 */
  function seedFacts(WA, tick) {
    WA.store.transact(function (d) {
      const b = d.livingWorld = d.livingWorld || { tick: 0, intersections: [], vignettes: [], ripples: [], livingTraces: [], characterStates: {} };
      b.tick = tick || 5;
      b.intersections.push({ id: 'i1', place: '集市', participants: ['老周', '阿绫'], summary: '碰头', tick: b.tick });
      b.vignettes.push({ name: '老周', place: '集市', detail: '数着零钱犹豫要不要典当', tick: b.tick });
      b.ripples.push({ id: 'r1', source: '老周', place: '渡口', cause: 'c', impactType: 'crisis', affectedPeers: ['阿绫'], tick: b.tick });
      b.livingTraces.push({ who: '阿绫', place: '茶馆', detail: '留了一盏凉茶', atTick: b.tick });
    }, 'v2265:facts');
  }
  // ════ A 段：静态契约 ══════════════════════════════════════
  Object.keys(ANCHOR).forEach(function (k) {
    a(cnt(rd(TGT[k]), ANCHOR[k]) === 1,
      'v2265/A1: 锚点 ' + k + ' 在 ' + TGT[k] + ' 里恰中 1 次（实 ' + cnt(rd(TGT[k]), ANCHOR[k]) + '）');
  });
  {
    const vals = Object.keys(ANCHOR).map(function (k) { return ANCHOR[k]; });
    const uniq = vals.filter(function (v, i) { return vals.indexOf(v) === i; });
    a(uniq.length === vals.length, 'v2265/A1b: 锚点值互不相同（' + uniq.length + ' / ' + vals.length + '）');
    a(cnt(SELF, ':') >= 14, 'v2265/A1c: ANCHOR 表切片有效（实 ' + cnt(SELF, ':') + ' 个冒号）');
    const dup = Object.keys(ANCHOR).filter(function (k) { return cnt(SELF, ANCHOR[k]) > 1; });
    a(dup.length === 0, 'v2265/A1f: 破坏锚点字面量在 SELF 里只出现 1 次（越界的：' + j(dup) + '）—— H5 判据纯度');
  }
  // A2 三态三分：no-place / unreadable / out 三支各自 hidden 取值不同，缺一支就退化成两态
  a(Ec.indexOf(ANCHOR.triNoPlace) > 0, 'v2265/A2: 「没有地名」这支存在（否则 hidden 恒真）');
  a(Ec.indexOf(ANCHOR.triUnreadable) > 0, 'v2265/A2b: 「判不了」这支存在（否则拿读不到当看不见）');
  a(Ec.indexOf(ANCHOR.triOut) > 0, 'v2265/A2c: 「真看不见」这支存在（唯一给 hidden:true 的地方）');
  {
    const iNo = Ec.indexOf(ANCHOR.triNoPlace), iUn = Ec.indexOf(ANCHOR.triUnreadable), iOut = Ec.indexOf(ANCHOR.triOut);
    a(iNo > 0 && iUn > iNo && iOut > iUn, 'v2265/A2d: 三支按 no-place → unreadable → out 排（实 ' + iNo + '/' + iUn + '/' + iOut + '）');
    a(cnt(Ec, "hidden: true") === 1,
      'v2265/A2e: 全程只有 1 处 hidden:true（**唯一**给它的地方是真看不见）—— 实 ' + cnt(Ec, 'hidden: true'));
  }
  // A3 上限与溢出如实
  a(Ec.indexOf(ANCHOR.capLine) > 0, 'v2265/A3: 三句上限是**硬夹取**（1..6），不是「建议」');
  a(Ec.indexOf(ANCHOR.dropSay) > 0, 'v2265/A3b: 溢出如实报 truncated + dropped（悄悄丢掉 = 玩家以为就这么多）');
  a(Ec.indexOf(ANCHOR.dedupe) > 0, 'v2265/A3c: 跨来源撞车去重（重复比缺失更难看）');
  a(Ec.indexOf(ANCHOR.quiet) > 0, 'v2265/A3d: 空态走 quiet 分支（不编一段「世界在悄悄运转」）');
  // A4 四源读口都在场，且**没有**新容器写入
  a(Ec.indexOf(ANCHOR.srcLiving) > 0, 'v2265/A4: 读 livingWorld 走 store.get()（既有容器）');
  a(Ec.indexOf(ANCHOR.srcOffline) > 0, 'v2265/A4b: 「你不在时」走开关（includeOffline 真被消费，不是死设置）');
  a(Ec.indexOf(ANCHOR.srcElsewhere) > 0, 'v2265/A4c: 读 elsewhere 走 list()（既有读口）');
  a(Ec.indexOf('store.transact(') < 0, 'v2265/A4d: 引擎内零 store.transact（纯读聚合，零新容器）');
  a(Ec.indexOf('localStorage.setItem(') < 0 && Ec.indexOf('localStorage.removeItem(') < 0,
    'v2265/A4e: 引擎内零 localStorage 直写（凭据走 settingsBus）');
  // A5 边界两向
  a(Ec.indexOf(ANCHOR.bndPerceive) > 0, 'v2265/A5: 边界口走 noesis.perceive（既有空间轴，不新造地点查询）');
  a(Ec.indexOf(ANCHOR.bndPlayer) > 0, 'v2265/A5b: 玩家名走 worldBridge.worldKey（本仓唯一权威身份）');
  a(Ec.indexOf('epistemicView.perceive') < 0 && Ec.indexOf('epistemicView.visibleAt') < 0,
    'v2265/A5c: 不拿信念面（epistemicView）判可见性 —— 那是类型错配');
  a(Ec.indexOf('visibleAt') < 0, 'v2265/A5d: 不引用不存在的 visibleAt（首版照计划原文写成这样，实测该口根本不存在）');
  // A6 设置族与登记
  a(Ec.indexOf('WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);') > 0,
    'v2265/A6: 设置键无条件登记（档位审计能看见它）');
  a(Ec.indexOf("maxLines: [1, 6]") > 0, 'v2265/A6b: maxLines 边界声明与实际夹取一致（[1,6]）');
  // A7 装载面
  a(cnt(IX, "'engines/world-diary.js'") === 1, 'v2265/A7: index.js LOAD_ORDER 登记恰 1 处');
  a(cnt(RUN, "'engines/world-diary.js'") === 1, 'v2265/A7b: tests/run.js LOAD 登记恰 1 处');
  {
    const iWd = IX.indexOf("'engines/world-diary.js'"), iTier = IX.indexOf("'engines/capability-tier.js'");
    const rWd = RUN.indexOf("'engines/world-diary.js'"), rTier = RUN.indexOf("'engines/capability-tier.js'");
    a(iWd > 0 && iTier > iWd && rWd > 0 && rTier > rWd,
      'v2265/A7c: 两处都在 capability-tier **之前**（audit 首盘才看得见它的键；实 idx ' + iWd + '<' + iTier + ' / run ' + rWd + '<' + rTier + '）');
  }
  // A8 导出面
  a(Ec.indexOf(ANCHOR.exportsFace) > 0, 'v2265/A8: 导出面七口齐全（build/stat/reset/getSettings/setSettings/boundary —— line 是 build() 的返回字段，不另立导出）');
  a(Ec.indexOf("registerModule('engines/world-diary.js'") > 0, 'v2265/A8b: registerModule 登记（模块注册面认得出它）');
  // B 段：运行时
  {
    const env = mkEnv(); const WA = env.WA, D = WA.worldDiary;
    a(!!D, 'v2265/B1: worldDiary 已装载（没有它则下面全部判据在空集上恒真）');
    if (D) {
      ['build', 'stat', 'reset', 'getSettings', 'setSettings', 'boundary'].forEach(function (k) {
        a(typeof D[k] === 'function', 'v2265/B1b: 导出面有 ' + k);
      });
      a(typeof D.build().line === 'string' && D.build().line.length > 0,
        'v2265/B1e: 人话一行由 build() 直接给出（不在导出面另立 line 口 —— 两份措辞真源比没有更坏）');
      a(D.getSettings().enabled === true, 'v2265/B1c: 出厂即启用（默认 true —— 默认关的功能玩家永远不知道它在）');
      a(D.getSettings().maxLines === 3, 'v2265/B1d: 出厂三句（实 ' + D.getSettings().maxLines + '）');
    }
  }
  // B2 空态
  {
    const env = mkEnv(); const D = env.WA.worldDiary;
    const r = D.build();
    a(r.ok === true, 'v2265/B2: 空态 build 仍 ok:true（「没事发生」不是错误）');
    a(r.quiet === true && r.lines.length === 0, 'v2265/B2b: 空态 quiet:true + 零行（实 ' + j({ quiet: r.quiet, n: r.lines.length }) + '）');
    a(String(r.hint || '').indexOf('确实没有') >= 0, 'v2265/B2c: 空态说得出「是确实没有，不是没读到」');
    a(!!r.line && r.line.indexOf('无事') >= 0, 'v2265/B2d: 一行式在空态给「无事」而不是空串（实 ' + j(r.line) + '）');
    D.build();   // 第二次空态：本行让「空态记笔数」成为可数判据（B2d 已改成读 r.line，不再顺带多 build 一次）
    a(D.stat().emptyBuilds === 2, 'v2265/B2e: 两次空态恰好记两笔（不是恒 0、也不是漏记；实 ' + D.stat().emptyBuilds + '）');
  }
  // B3 四源合流 + 三句上限 + 溢出如实
  {
    const env = mkEnv(); const WA = env.WA, D = WA.worldDiary;
    seedFacts(WA, 5);
    const r = D.build({ maxLines: 6 });
    a(r.ok === true && r.lines.length >= 3, 'v2265/B3: 四条幕后事实压成多行（实 ' + r.lines.length + '）');
    a(r.lines.every(function (l) { return typeof l === 'string' && l.length > 0; }),
      'v2265/B3b: 每行都是非空字符串');
    a(r.lines.join('').indexOf('i1') < 0 && r.lines.join('').indexOf('r1') < 0 && r.lines.join('').indexOf('tick') < 0,
      'v2265/B3c: 句子里没有内部 id / 技术词（实 ' + j(r.lines.join('|')) + '）');
    const r3 = D.build();
    a(r3.lines.length === 3, 'v2265/B3d: 默认三句上限生效（实 ' + r3.lines.length + '）');
    a(r3.truncated === true && r3.dropped >= 1,
      'v2265/B3e: 超出时 truncated:true + dropped 计数（实 ' + j({ t: r3.truncated, d: r3.dropped }) + '）');
    a(r3.dropped === (r3.total - r3.lines.length), 'v2265/B3f: dropped 与 total-lines 自洽（' + r3.dropped + ' vs ' + (r3.total - r3.lines.length) + '）');
    const r1 = D.build({ maxLines: 1 });
    a(r1.lines.length === 1, 'v2265/B3g: maxLines=1 真夹到一句（实 ' + r1.lines.length + '）');
    const r9 = D.build({ maxLines: 99 });
    a(r9.lines.length <= 6, 'v2265/B3h: 越界请求被夹到 6 上限（实 ' + r9.lines.length + '）');
  }
  // B4 去重：同一句话不出现两次
  {
    const env = mkEnv(); const WA = env.WA, D = WA.worldDiary;
    WA.store.transact(function (d) {
      const b = d.livingWorld = d.livingWorld || { tick: 0, intersections: [], vignettes: [], ripples: [], livingTraces: [], characterStates: {} };
      b.tick = 3;
      // 两条完全相同的事实（真实场景：同一轮被上游重复记一次）
      b.vignettes.push({ name: '老周', place: '集市', detail: '在摊前讨价还价', tick: 3 });
      b.vignettes.push({ name: '老周', place: '集市', detail: '在摊前讨价还价', tick: 3 });
    }, 'v2265:dup');
    const r = D.build({ maxLines: 6 });
    const uniq = r.lines.filter(function (l, i) { return r.lines.indexOf(l) === i; });
    a(uniq.length === r.lines.length, 'v2265/B4: 重复事实只出现一次（实 ' + j(r.lines) + '）');
  }
  // B5 三态地点：判不了 → hidden:false（不是 hidden:true）
  {
    const env = mkEnv(); const WA = env.WA, D = WA.worldDiary;
    seedFacts(WA, 5);
    const b = D.boundary();
    a(b.available === false, 'v2265/B5: 未配玩家名 ⇒ boundary.available:false（实 ' + j(b) + '）');
    a(String(b.why || '').length > 0, 'v2265/B5b: 判不了时 why 说得出缺哪一半（实 ' + j(b.why) + '）');
    const r = D.build({ maxLines: 6 });
    const withPlace = r.items.filter(function (i) { return i.hidden === true; });
    a(withPlace.length === 0,
      'v2265/B5c: 边界判不了时**不**把条目标成 hidden（否则 hidden 恒真、不再是判据；实 ' + withPlace.length + ' 条）');
    a(r.lines.every(function (l) { return l.indexOf('集市') < 0 && l.indexOf('渡口') < 0 && l.indexOf('茶馆') < 0; }),
      'v2265/B5d: 判不了就不点名（实 ' + j(r.lines) + '）');
    a(r.lines.join('').indexOf('你看不见的地方') >= 0, 'v2265/B5e: 涟漪句有兜底宾语（不留「老周遇到变故」这种半句）');
  }
  // B6 边界可用：present → 点名；不在场 → hidden:true 且不点名
  {
    const env = mkEnv(); const WA = env.WA, D = WA.worldDiary;
    WA.worldBridge.setSettings({ worldTitle: '临水镇', playerName: '沈砚' });
    WA.noesis.setSettings({ enabled: true, rangeEnabled: true });
    WA.world.addPlace({ name: '集市' });
    const b = D.boundary();
    a(b.available === true && b.player === '沈砚', 'v2265/B6: 配齐身份后边界可用（实 ' + j(b) + '）');
    WA.store.transact(function (d) {
      const lw = d.livingWorld = d.livingWorld || { tick: 0, intersections: [], vignettes: [], ripples: [], livingTraces: [], characterStates: {} };
      lw.tick = 2;
      lw.vignettes.push({ name: '老周', place: '集市', detail: '在摊前讨价还价', tick: 2 });
      lw.vignettes.push({ name: '阿绫', place: '鬼市', detail: '不知去向', tick: 2 });
    }, 'v2265:place');
    const pv = WA.noesis.perceive('沈砚', '集市');
    a(pv.ok === true && pv.range === 'present', 'v2265/B6b: （前置）集市对玩家 present（实 ' + j(pv) + '）');
    const r = D.build({ maxLines: 6 });
    const atJi = r.items.filter(function (i) { return i.kind === 'vignette' && String(i.text).indexOf('老周') >= 0; })[0];
    const atGui = r.items.filter(function (i) { return i.kind === 'vignette' && String(i.text).indexOf('阿绫') >= 0; })[0];
    a(!!atJi && atJi.hidden === false && atJi.place === '集市',
      'v2265/B6c: 看得见的地点被点名（实 ' + j(atJi && { h: atJi.hidden, p: atJi.place }) + '）');
    a(!!atGui && atGui.hidden === true && atGui.place === '',
      'v2265/B6d: 看不见的地点被隐去且 hidden:true（实 ' + j(atGui && { h: atGui.hidden, p: atGui.place }) + '）');
    a(String(atGui && atGui.text).indexOf('鬼市') < 0, 'v2265/B6e: 隐去的地名确实没出现在句子里（实 ' + j(atGui && atGui.text) + '）');
    a(String(atJi && atJi.text).indexOf('集市') >= 0, 'v2265/B6f: 看得见的地名确实出现在句子里（实 ' + j(atJi && atJi.text) + '）');
  }
  // B7 「判不了」与「看不见」分开：noesis 未启用时不能报 hidden
  {
    const env = mkEnv(); const WA = env.WA, D = WA.worldDiary;
    WA.worldBridge.setSettings({ worldTitle: '临水镇', playerName: '沈砚' });
    WA.noesis.setSettings({ enabled: false });
    WA.world.addPlace({ name: '集市' });
    const pv = WA.noesis.perceive('沈砚', '集市');
    a(pv.ok === false && pv.reason === 'disabled', 'v2265/B7: （前置）未启用时 perceive 返回 ok:false（实 ' + j(pv) + '）');
    WA.store.transact(function (d) {
      const lw = d.livingWorld = d.livingWorld || { tick: 0, intersections: [], vignettes: [], ripples: [], livingTraces: [], characterStates: {} };
      lw.tick = 1;
      lw.vignettes.push({ name: '老周', place: '集市', detail: '在摊前讨价还价', tick: 1 });
    }, 'v2265:disabled');
    const r = D.build({ maxLines: 6 });
    const row = r.items.filter(function (i) { return i.kind === 'vignette'; })[0];
    a(!!row && row.hidden === false,
      'v2265/B7b: 读不到 ⇒ hidden:false（**不是**「玩家看不见」；实 ' + j(row && row.hidden) + '）');
  }
  // B8 窗口：过老的事实（超过 3 tick）不进日记
  {
    const env = mkEnv(); const WA = env.WA, D = WA.worldDiary;
    WA.store.transact(function (d) {
      const lw = d.livingWorld = d.livingWorld || { tick: 0, intersections: [], vignettes: [], ripples: [], livingTraces: [], characterStates: {} };
      lw.tick = 20;
      lw.vignettes.push({ name: '老周', place: '集市', detail: '很久以前的事', tick: 1 });
    }, 'v2265:old');
    const r = D.build({ maxLines: 6 });
    a(r.quiet === true, 'v2265/B8: 超过 3 tick 的旧事实不进日记（实 ' + j({ q: r.quiet, lines: r.lines }) + '）');
  }
  // C 段：零写盘不变式
  {
    const env = mkEnv(); const WA = env.WA, D = WA.worldDiary;
    seedFacts(WA, 4);
    const world0 = j(WA.store.get());
    const cfg0 = j(D.getSettings());
    const ls0 = global.localStorage ? global.localStorage.getItem(LSKEY_WD) : null;
    D.build(); D.build(); D.build().line; D.stat();
    a(j(WA.store.get()) === world0, 'v2265/C1: 四次调用后世界摘要逐字不变（纯读聚合）');
    a(j(D.getSettings()) === cfg0, 'v2265/C1b: 设置族逐字不变（读路径不写盘）');
    a((global.localStorage ? global.localStorage.getItem(LSKEY_WD) : null) === ls0,
      'v2265/C1c: 偏好键原文逐字不变（不是「值等价」—— 是同一个串）');
  }
  runN(a, { env0: env0, mkEnv: mkEnv, ENG_REL: ENG_REL, ANCHOR: ANCHOR, seedFacts: seedFacts });
  return { pass: pass, fail: fail, fails: fails };
}
// ════ N 段：真源码破坏 + 两向自证 ═══════════════════════════
function runN(a, C) {
  const ANCHOR = C.ANCHOR, ENG_REL = C.ENG_REL;
  function breakOnce(src, anchor, replacement, tag) {
    const n = cnt(src, anchor);
    if (n !== 1) throw new Error(tag + ': 锚点须恰中 1 次（实 ' + n + '）—— 工具自证');
    return src.split(anchor).join(replacement);
  }
  function withBroken(anchor, replacement, fn) {
    let threw = null, out = null;
    try {
      try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
      const src = breakOnce(rd(ENG_REL), anchor, replacement, 'break');
      const env = C.env0({ [ENG_REL]: src });
      const WA = env.WA;
      WA.store.init();
      out = fn(env, WA);
    } catch (e) { threw = String((e && e.message) || e); }
    return { threw: threw, out: out };
  }
  function withGood(fn) {
    let threw = null, out = null;
    try { const env = C.mkEnv(); out = fn(env, env.WA); } catch (e) { threw = String((e && e.message) || e); }
    return { threw: threw, out: out };
  }
  // 工具自证
  {
    let threw0 = null;
    try { breakOnce('abc', 'zzz', 'y', 'n0'); } catch (e) { threw0 = String(e.message); }
    a(threw0 !== null, 'v2265/N0: （工具自证）锚点不存在必须抛（实 ' + j(threw0) + '）');
    let threw1 = null;
    try { breakOnce('xyxy', 'xy', 'z', 'n0b'); } catch (e) { threw1 = String(e.message); }
    a(threw1 !== null, 'v2265/N0b: （工具自证）锚点不唯一必须抛（实 ' + j(threw1) + '）');
  }
  // N1 破坏「没有地名」这支 ⇒ hidden 恒真，判据 B5c 现形
  {
    const bad = withBroken(ANCHOR.triNoPlace,
      "if (!p) return { ok: false, place: '', hidden: true, why: 'no-place' };",
      function (env, WA) {
        const D = WA.worldDiary;
        WA.store.transact(function (d) {
          const lw = d.livingWorld = d.livingWorld || { tick: 0, intersections: [], vignettes: [], ripples: [], livingTraces: [], characterStates: {} };
          lw.tick = 1;
          lw.livingTraces.push({ who: '阿绫', place: '', detail: '留下了一盏凉茶', atTick: 1 });
        }, 'n1');
        const r = D.build({ maxLines: 6 });
        return { hiddenRows: r.items.filter(function (i) { return i.hidden === true; }).length };
      });
    a(bad.threw === null, 'v2265/N1a: 破坏版不抛到探针外（实 ' + j(bad.threw) + '）');
    a(bad.out && bad.out.hiddenRows > 0,
      'v2265/N1b: （两向）「没地名」被写成 hidden ⇒ 无地名条目被标成隐去（实 ' + j(bad.out && bad.out.hiddenRows) + '）');
    const good = withGood(function (env, WA) {
      const D = WA.worldDiary;
      WA.store.transact(function (d) {
        const lw = d.livingWorld = d.livingWorld || { tick: 0, intersections: [], vignettes: [], ripples: [], livingTraces: [], characterStates: {} };
        lw.tick = 1;
        lw.livingTraces.push({ who: '阿绫', place: '', detail: '留下了一盏凉茶', atTick: 1 });
      }, 'n1g');
      const r = D.build({ maxLines: 6 });
      return { hiddenRows: r.items.filter(function (i) { return i.hidden === true; }).length };
    });
    a(good.out && good.out.hiddenRows === 0, 'v2265/N1c: 原版上同判据为真（无地名不标 hidden；实 ' + j(good.out && good.out.hiddenRows) + '）');
  }
  // N2 破坏「判不了」这支 ⇒ 读不到被写成「看不见」
  {
    const bad = withBroken(ANCHOR.triUnreadable,
      "if (!r || r.ok !== true) return { ok: false, place: '', hidden: true, why: 'perceive-failed' };",
      function (env, WA) {
        const D = WA.worldDiary;
        WA.worldBridge.setSettings({ worldTitle: '临水镇', playerName: '沈砚' });
        WA.noesis.setSettings({ enabled: false });
        WA.world.addPlace({ name: '集市' });
        WA.store.transact(function (d) {
          const lw = d.livingWorld = d.livingWorld || { tick: 0, intersections: [], vignettes: [], ripples: [], livingTraces: [], characterStates: {} };
          lw.tick = 1;
          lw.vignettes.push({ name: '老周', place: '集市', detail: '在摊前讨价还价', tick: 1 });
        }, 'n2');
        const r = D.build({ maxLines: 6 });
        const row = r.items.filter(function (i) { return i.kind === 'vignette'; })[0];
        return { hidden: row ? row.hidden : null };
      });
    a(bad.threw === null, 'v2265/N2a: 破坏版不抛（实 ' + j(bad.threw) + '）');
    a(bad.out && bad.out.hidden === true,
      'v2265/N2b: （两向）读不到被写成看不见 ⇒ 条目被标 hidden（实 ' + j(bad.out && bad.out.hidden) + '）');
    const good = withGood(function (env, WA) {
      const D = WA.worldDiary;
      WA.worldBridge.setSettings({ worldTitle: '临水镇', playerName: '沈砚' });
      WA.noesis.setSettings({ enabled: false });
      WA.world.addPlace({ name: '集市' });
      WA.store.transact(function (d) {
        const lw = d.livingWorld = d.livingWorld || { tick: 0, intersections: [], vignettes: [], ripples: [], livingTraces: [], characterStates: {} };
        lw.tick = 1;
        lw.vignettes.push({ name: '老周', place: '集市', detail: '在摊前讨价还价', tick: 1 });
      }, 'n2g');
      const r = D.build({ maxLines: 6 });
      const row = r.items.filter(function (i) { return i.kind === 'vignette'; })[0];
      return { hidden: row ? row.hidden : null };
    });
    a(good.out && good.out.hidden === false, 'v2265/N2c: 原版上同判据为真（读不到不标 hidden；实 ' + j(good.out && good.out.hidden) + '）');
  }
  // N3 破坏三句上限 ⇒ 日记变长文
  {
    const bad = withBroken(ANCHOR.capLine,
      'const cap = 99;',
      function (env, WA) {
        C.seedFacts(WA, 5);
        const r = WA.worldDiary.build();
        return { n: r.lines.length };
      });
    a(bad.threw === null, 'v2265/N3a: 破坏版不抛（实 ' + j(bad.threw) + '）');
    a(bad.out && bad.out.n > 3, 'v2265/N3b: （两向）上限被摘后行数超过三句（实 ' + j(bad.out && bad.out.n) + '）');
    const good = withGood(function (env, WA) {
      C.seedFacts(WA, 5);
      const r = WA.worldDiary.build();
      return { n: r.lines.length };
    });
    a(good.out && good.out.n <= 3, 'v2265/N3c: 原版上同判据为真（≤3；实 ' + j(good.out && good.out.n) + '）');
  }
  // N4 破坏去重 ⇒ 同一句重复出现
  {
    const bad = withBroken(ANCHOR.dedupe,
      'items.forEach(function (it) { uniq.push(it); });',
      function (env, WA) {
        WA.store.transact(function (d) {
          const lw = d.livingWorld = d.livingWorld || { tick: 0, intersections: [], vignettes: [], ripples: [], livingTraces: [], characterStates: {} };
          lw.tick = 3;
          lw.vignettes.push({ name: '老周', place: '集市', detail: '在摊前讨价还价', tick: 3 });
          lw.vignettes.push({ name: '老周', place: '集市', detail: '在摊前讨价还价', tick: 3 });
        }, 'n4');
        const r = WA.worldDiary.build({ maxLines: 6 });
        return { n: r.lines.length, uniq: r.lines.filter(function (l, i) { return r.lines.indexOf(l) === i; }).length };
      });
    a(bad.threw === null, 'v2265/N4a: 破坏版不抛（实 ' + j(bad.threw) + '）');
    a(bad.out && bad.out.n > bad.out.uniq,
      'v2265/N4b: （两向）去重被摘后同一句出现两次（实 ' + j(bad.out) + '）');
    const good = withGood(function (env, WA) {
      WA.store.transact(function (d) {
        const lw = d.livingWorld = d.livingWorld || { tick: 0, intersections: [], vignettes: [], ripples: [], livingTraces: [], characterStates: {} };
        lw.tick = 3;
        lw.vignettes.push({ name: '老周', place: '集市', detail: '在摊前讨价还价', tick: 3 });
        lw.vignettes.push({ name: '老周', place: '集市', detail: '在摊前讨价还价', tick: 3 });
      }, 'n4g');
      const r = WA.worldDiary.build({ maxLines: 6 });
      return { n: r.lines.length, uniq: r.lines.filter(function (l, i) { return r.lines.indexOf(l) === i; }).length };
    });
    a(good.out && good.out.n === good.out.uniq, 'v2265/N4c: 原版上同判据为真（去重生效；实 ' + j(good.out) + '）');
  }
  // N5 破坏「空态如实」⇒ 空态被报成 built
  {
    const bad = withBroken(ANCHOR.quiet,
      "__stat.lastReason = 'built';",
      function (env, WA) {
        const r = WA.worldDiary.build();
        return { quiet: r.quiet, lastReason: WA.worldDiary.stat().lastReason, lines: r.lines.length };
      });
    a(bad.threw === null, 'v2265/N5a: 破坏版不抛（实 ' + j(bad.threw) + '）');
    a(bad.out && bad.out.lines === 0 && bad.out.lastReason === 'built',
      'v2265/N5b: （两向）空态被记成 built ⇒ 台账与实况脱节（实 ' + j(bad.out) + '）');
    const good = withGood(function (env, WA) {
      const r = WA.worldDiary.build();
      return { quiet: r.quiet, lastReason: WA.worldDiary.stat().lastReason };
    });
    a(good.out && good.out.lastReason === 'quiet', 'v2265/N5c: 原版上同判据为真（空态记 quiet；实 ' + j(good.out) + '）');
  }
  // N6 破坏玩家名取法 ⇒ 边界永久不可用（判不了也不报）
  {
    const bad = withBroken(ANCHOR.bndPlayer,
      'return "";',
      function (env, WA) {
        WA.worldBridge.setSettings({ worldTitle: '临水镇', playerName: '沈砚' });
        WA.noesis.setSettings({ enabled: true, rangeEnabled: true });
        WA.world.addPlace({ name: '集市' });
        const b = WA.worldDiary.boundary();
        return { available: b.available, player: b.player, why: b.why };
      });
    a(bad.threw === null, 'v2265/N6a: 破坏版不抛（实 ' + j(bad.threw) + '）');
    a(bad.out && bad.out.available === false && bad.out.player === '',
      'v2265/N6b: （两向）玩家名取不到 ⇒ 边界永久不可用（实 ' + j(bad.out) + '）');
    const good = withGood(function (env, WA) {
      WA.worldBridge.setSettings({ worldTitle: '临水镇', playerName: '沈砚' });
      WA.noesis.setSettings({ enabled: true, rangeEnabled: true });
      WA.world.addPlace({ name: '集市' });
      const b = WA.worldDiary.boundary();
      return { available: b.available, player: b.player };
    });
    a(good.out && good.out.available === true && good.out.player === '沈砚',
      'v2265/N6c: 原版上同判据为真（边界可用；实 ' + j(good.out) + '）');
  }
}

module.exports = { runAll: runAll };
if (require.main === module) {
  const r = runAll(null);
  (r.fails || []).forEach(function (m) { console.log('FAIL ' + m); });
  console.log('EXV6-1 world-diary-v2265 ' + r.pass + ' / 失败 ' + r.fail);
  process.exit(r.fail > 0 ? 1 : 0);
}
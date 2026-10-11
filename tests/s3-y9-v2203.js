#!/usr/bin/env node
// WorldAxis tests/s3-y9-v2203.js — Y9 世界实验室扩展（沙盒推进 / 结果报告 / 选择性采纳 / 拍引擎联动）专锁（v2.203.0 第四批）
//
// 【计划原文（plans/Y_EXPANSION.md §Y9）逐条对照】
// 要解决的玩家问题：世界实验室此前只答「A / B / 什么都不做**各跑一步**会怎样」，
//   而真开局要的是「连着往前走几轮会怎样、每一处为什么变了、我想只落实其中**一条**该怎么办」。
// 新功能四条：
//   ① **沙盒推进**：在同一份隔离副本上**累积**推进 N 轮（第 3 轮看到的是第 1、2 轮改过的那份世界）；
//   ② **结果报告**：每处变化拆成一条带来源的原因；无变化的轮如实记 `no-change`（不编原因）；
//   ③ **选择性采纳**：把报告里**某一条**落成真世界事件，走 U2 统一提交 —— 这是全模块唯一的写世界路径；
//   ④ **拍引擎联动**：跑拍引擎的推演而**不落拍**（拍账摘要前后逐字一致是实测的）。
//
// 四条边界（计划原文逐条）：
//   ①推演**绝不写 live**：全部落在一份隔离副本上（`ex.cloneState` + `ex.sandStore`），
//     跑前跑后各取一次 live 摘要自证零写入；②报告**不许编原因**：原因逐字取自副本上的实测差，
//     无变化就给 `no-change`；③采纳是**唯一**写世界通道，且必须走 `WA.commit.chain`（U2）——
//     它缺席时**不退回自己开事务**，而是如实拒收 `commit-absent`；④采纳只落**一条**世界事实，
//     来源与批准点写在那一条事实**自己身上**（不另开账本 ⇒ 不产生第二条世界变化），
//     且**不碰拍账**（拍号不因采纳而推进）。
//
// 四条验收（计划原文）：①`simulate` 的 `liveUnchanged` 是**实测差**不是声明；
//   ②`report` 的每条 `cause` 都带 `src`；③`adopt` 重复采纳同一条 ⇒ 整链中止（**不许**落成两条）；
//   ④`beats` 的 `ledger.unchanged` 是实测差，且模式如实（今天只有 projection 这一条走得通）。
//
// 两条如实偏离（写锁时实测，不当成「通过」遮掩）：
//   · 「同一个函数」验不了：本锁对「真跑与试演同一路径」只判**可观测两向** ——
//     把 `ex.withContext(...tick...)` 摘掉（N4），`liveUnchanged` 与 live 真摘要**同时**翻转；
//     这证明那条路径确实是「写往隔离副本」的唯一分岔点，但不证明它与别的调用共用同一个函数体。
//   · 「零写入」判两处：引擎侧（`store.transact` 出现在读口里）与面板侧（绑定段零写口）各判一次 ——
//     只判一处时，另一处加了写口也过。
//
// 四段结构（与 Y7/Y8 同规格）：
//   A 段 静态契约（段切片 / 控件三件齐 / 锚点纯度 / 单一真源 / 导出面 / 跨文件见证）
//   B 段 运行时与四功能（B1 导出面 ~ B12 面板端到端）
//   C 段 零写入不变式（模拟 / 报告 / 拍投影全不写世界；采纳只加一条）
//   N 段 真源码破坏 + 两向自证（含 N0 静态面）
//
// N 段额外职责（把本版探针揪出的**真缺陷**固化成判据）：
//   N1 钉住「轮号必须打在快照上」——没打标时 `simDiff` 的 `round` 是 undefined，
//      报告一轮都分不出来、每轮都被记成 `no-change`（**跑得通、答的是空话**）。
//   N2 钉住「空轮不在可采纳之列」——采纳池不筛 `key` 时，`no-change` 也能被采纳，
//      于是「凭空造一件事」在界面上长得像正常采纳。
//   N3 钉住「过期判定」——摘掉 `stale` 后，世界变过了仍报「未过期」，
//      而 `adopt` 内部自己还拦着（两条判据分家 ⇒ 面板说可以、写口说不行）。
//   N4 钉住「推演落在隔离副本上」——这条一破，`simulate` 就把推演**悄悄写进正史**，
//      且它自报的 `liveUnchanged` 同时由 true 翻 false（这是本模块立身之本）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const PANEL_REL = 'ui/panel.js';
const DIAG_REL = 'engines/tool-diag.js';
const ENG_REL = 'engines/world-lab.js';
const SELF_REL = 'tests/s3-y9-v2203.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }
/** 把「设置态」按各引擎**自己的**默认值显式写回（装置件、模块级 —— 理由与 Y6/Y7/Y8 同）。 */
function resetSettings(WA) {
  // 先清偏好键：`gate.fresh()` 只复位宿主窗口与设置登记表，**不清 localStorage** ——
  //   不清的话 N 段前一脚（破坏版）写下的东西会漏进后一脚（原版）。
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  try { if (WA.rulePack) WA.rulePack.setSettings({ enabled: false }); } catch (e) {}
  try { if (WA.recipe) WA.recipe.setSettings({ enabled: false }); } catch (e) {}
  try { if (WA.worldLab) WA.worldLab.setSettings({ enabled: false }); } catch (e) {}
}
/** 破坏锚点：逐字取自产品源码，各恰 1 次（A8 逐键核）。 */
const ANCHOR = {
  simCap: 'const MAX_ROUNDS = 12;',
  simDefault: 'const DEF_SIM_ROUNDS = 3;',
  simRoundMs: 'const SIM_ROUND_MS = 60000;',
  maxAhead: 'const MAX_AHEAD = 12;',
  simRoundOf: 'function simRoundOf(v) {',
  roundTag: '      now.n = i + 1;',
  simulate: 'function simulate(spec) {',
  report: 'function report(opt) {',
  adopt: 'function adopt(spec) {',
  beats: 'function beats(spec) {',
  chainCall: 'const ch = WA.commit.chain({',
  pushFact: 'draft.worldFacts.push({',
  adoptPool: 'const pool = rep.causes.filter(function (c) { return !!c.key; });',
  staleFlag: 'const stale = !!(cur.ok && _sim.before.ok && cur.digest !== _sim.before.digest);',
  withCtx: '      try { cz = ex.withContext(ctx, function () { return WA.causal.tick({ now: at }); }); }',
  simFace: 'simCap: MAX_ROUNDS, simDefault: DEF_SIM_ROUNDS,',
  writesSingle: "writesSingle: 'adopt',",
  lskey: "const LS_KEY = 'worldaxis_world_lab_settings_v1';",
  def: "const DEF = { enabled: false, maxSteps: 6, armA: '', armB: '' };",
  statFace: 'hasSim: !!_sim, simRows: _sim ? _sim.rows.length : 0,',
  exportsFace: 'diagnose: diagnose, stat: statOf',
  note: '       <div class="wa-dim">v2.203.0（Y9）四件事：',
  out: '       <div id="wa-wl-out" class="wa-out"></div>'
};
const TGT = { simCap: ENG_REL, simDefault: ENG_REL, simRoundMs: ENG_REL, maxAhead: ENG_REL,
  simRoundOf: ENG_REL, roundTag: ENG_REL, simulate: ENG_REL, report: ENG_REL, adopt: ENG_REL,
  beats: ENG_REL, chainCall: ENG_REL, pushFact: ENG_REL, adoptPool: ENG_REL, staleFlag: ENG_REL,
  withCtx: ENG_REL, simFace: ENG_REL, writesSingle: ENG_REL, lskey: ENG_REL, def: ENG_REL,
  statFace: ENG_REL, exportsFace: ENG_REL, note: PANEL_REL, out: PANEL_REL };
/** 本模块偏好键**键名**（⚠ ANCHOR.lskey 是源码声明行、不是键名）。 */
const LSKEY = 'worldaxis_world_lab_settings_v1';
const SEG_RENDER_START = '       <div class="wa-dim">v2.203.0（Y9）四件事：';
const SEG_RENDER_END = '      <div class="wa-sec">存储压力面与义务清点</div>';
const SEG_BIND_START = '    // ── v2.203.0（Y9）四件事：沙盒推进 / 结果报告 / 选择性采纳 / 拍引擎联动 ────';
const SEG_END = "    on('#wa-life-goal', () => {";
/** Y9 新增 6 枚（渲染段与守卫表口径一致；rounds / index 是输入框，无 onclick）。 */
const NEW_IDS = ['wa-wl-rounds', 'wa-wl-sim', 'wa-wl-report', 'wa-wl-index', 'wa-wl-adopt', 'wa-wl-beats'];
const BTN_IDS = ['wa-wl-sim', 'wa-wl-report', 'wa-wl-adopt', 'wa-wl-beats'];
const OTHER_PREFIX = ['wa-rp-', 'wa-wg-', 'wa-hs-', 'wa-cap-'];
function stripLineComments(s) {
  return s.split('\n').map(function (l) {
    const i = l.indexOf('//');
    return i < 0 ? l : l.slice(0, i);
  }).join('\n');
}
function runAll(a) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const LS = global.localStorage;
  const P = rd(PANEL_REL), D = rd(DIAG_REL), E = rd(ENG_REL), SELF = rd(SELF_REL);
  function env0(ov) { return gate.fresh(ov ? { srcOverride: ov } : {}); }
  function seed(WA) {
    WA.store.init();
    return WA.store.transact(function (d) {
      d.people = { A: { name: '老周' } };
      d.worldFacts = [{ id: 'wf_seed', key: 'seed', value: '起点' }];
      // 一条「可推进、且推进后立即产生世界事实」的链：真源是 causal.POLICIES 无关的既有形状。
      d.causal = { chains: [{ id: 'cs_1', cause: 'seed', condition: '', action: '去码头',
        immediate: '货到了', delayed: [], status: 'open', stage: 'open', at: 1, updatedAt: 1 }] };
    }, 'y9:seed');
  }
  function gotoPage(env, page) {
    const dom = env.dom, p = dom.getElementById('wa-panel');
    if (!p) throw new Error('面板未注入');
    const tab = p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
    if (!tab) throw new Error('找不到 ' + page + ' 页签');
    tab.click();
    return dom;
  }
  function clickOut(dom, id) {
    const b = dom.getElementById(id);
    if (!b) return null;
    if (typeof b.onclick !== 'function') return null;
    b.onclick({ target: b });
    // 产品侧 `setOut` 写的是 **textContent**（不是 innerHTML）—— 读数面按它读。
    const o = dom.getElementById('wa-wl-out');
    return String(o ? (o.textContent || '') : '');
  }
  // ════ A 段：静态契约 ══════════════════════════════════════
  const segR = P.slice(P.indexOf(SEG_RENDER_START), P.indexOf(SEG_RENDER_END));
  const segB = P.slice(P.indexOf(SEG_BIND_START), P.indexOf(SEG_END));
  a(P.indexOf(SEG_RENDER_START) >= 0 && P.indexOf(SEG_BIND_START) >= 0 && P.indexOf(SEG_END) > 0,
    'y9v2203/A1: 两段段首与段尾锚点都在位（切片有效）');
  a(segR.length > 300 && segB.length > 1000,
    'y9v2203/A1b: 两段切片非空（实渲染段 ' + segR.length + ' / 绑定段 ' + segB.length + ' 字符）—— 切片失效会让下面的扫描在空集上恒真');
  (function () {
    const segRc = stripLineComments(segR), segBc = stripLineComments(segB);
    const leak = [];
    OTHER_PREFIX.forEach(function (p) {
      if (cnt(segRc, p) > 0) leak.push('渲染段 ' + p + cnt(segRc, p));
      if (cnt(segBc, p) > 0) leak.push('绑定段 ' + p + cnt(segBc, p));
    });
    a(leak.length === 0, 'y9v2203/A1c: 两段切片未蔓延（无它页前缀：' + (leak.join('、') || '无声') + '）');
  })();
  NEW_IDS.forEach(function (id) {
    a(cnt(segR, 'id="' + id + '"') === 1, 'y9v2203/A2: ' + id + ' 在渲染段恰渲染 1 次（实 ' + cnt(segR, 'id="' + id + '"') + '）');
    a(cnt(D, "'" + id + "'") === 1, 'y9v2203/A2b: ' + id + ' 在守卫表里恰登记 1 次（实 ' + cnt(D, "'" + id + "'") + '）');
  });
  BTN_IDS.forEach(function (id) {
    a(cnt(segB, "on('#" + id + "', () => {") === 1, 'y9v2203/A3: ' + id + ' 的 onclick 绑定恰 1 处（实 ' + cnt(segB, "on('#" + id + "', () => {") + '）');
  });
  // `wa-wl-out` 是 E9 时代就有的**既有**读数口：Y9 四枚 handler 一律回写它 —— 不新开读数区。
  a(cnt(D, "dynamic: ['wa-wl-out']") === 1, 'y9v2203/A4: 读数出口 wa-wl-out 在守卫表 dynamic 层恰 1 处（既有出口复写）');
  a(cnt(segR, 'id="wa-wl-out"') === 1, 'y9v2203/A4b: 输出容器在 Y9 渲染段在场恰 1 次（否则四枚 handler 写进空气）');
  a((segR.match(/wa-[a-z]+-out/g) || []).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).join() === 'wa-wl-out',
    'y9v2203/A4d: Y9 渲染段只含 wa-wl-out 这一个读数口（防与它页串切）');
  const codeSeg = stripLineComments(segR) + '\n' + stripLineComments(segB);
  a(codeSeg.indexOf('store.transact(') < 0,
    'y9v2203/A5: 两段零 store.transact 调用（推演与采纳都不在面板上开事务 —— 边界③）');
  a(codeSeg.indexOf('localStorage.setItem(') < 0 && codeSeg.indexOf('localStorage.getItem(') < 0,
    'y9v2203/A5b: 两段零 localStorage 直接读写（偏好键的唯一读写面在引擎里）');
  a(codeSeg.indexOf('WA.worldLab.simulate(') >= 0 && codeSeg.indexOf('WA.worldLab.report(') >= 0
    && codeSeg.indexOf('WA.worldLab.adopt(') >= 0 && codeSeg.indexOf('WA.worldLab.beats(') >= 0,
    'y9v2203/A5c: 去注释后四口真读口**带括号**在场（防自我指涉：判据不许把自己删掉）');
  a(E.indexOf(ANCHOR.simCap) > 0 && E.indexOf(ANCHOR.simDefault) > 0,
    'y9v2203/A6: 轮数上限与默认轮数是**内部常量**（不进 bounds —— bounds 管设置键，它管入参夹取）');
  a(E.indexOf(ANCHOR.simRoundMs) > 0 && E.indexOf(ANCHOR.maxAhead) > 0,
    'y9v2203/A6b: 每轮拨多久 / 最多投影几拍也是内部常量（两处都不冒充设置）');
  a(E.indexOf(ANCHOR.simRoundOf) > 0 && E.indexOf('Math.max(1, Math.min(MAX_ROUNDS, Math.floor(n)))') > 0,
    'y9v2203/A6c: 夹取集中在**一个** simRoundOf（不在三处各写一遍上下限）');
  a(E.indexOf(ANCHOR.roundTag) > 0,
    'y9v2203/A6d: 轮号打在快照上（`now.n = i + 1`）—— 报告按轮分组全靠它');
  // 边界④：采纳只走 U2，且事实只落一条
  a(E.indexOf(ANCHOR.chainCall) > 0, 'y9v2203/A7: 采纳走 WA.commit.chain（U2 统一提交 —— 边界③）');
  // 本模块的注释与产物文案里逐字写着「零 store.transact」「直调 store.transact」（说的是别人），
  //   故这里认的是**调用形态**（带开括号）零命中 —— 与 Y7/Y8 锁的 A5 同一口径。
  a(cnt(stripLineComments(E), 'store.transact(') === 0,
    'y9v2203/A7b: 引擎**代码面**零 store.transact 调用（写世界只有 commit.chain 一条路；注释里那句声明不算）');
  a(cnt(stripLineComments(E), 'WA.draft') === 0 && !/[^.\w]draft\s*=(?!=)/.test(stripLineComments(E)),
    'y9v2203/A7c: 零自造 draft（入参 `draft` 来自 U2 回调，本模块不自己造一份）');
  a(E.indexOf(ANCHOR.pushFact) > 0 && E.indexOf("chain.abortWhy = 'already-adopted'; return false;") > 0,
    'y9v2203/A7d: 重复采纳**整链中止**（不许落成两条 —— 验收③）');
  a(E.indexOf(ANCHOR.adoptPool) > 0,
    'y9v2203/A8: 可采纳池按是否有 `key` 筛（空轮不在其列 —— 采纳它等于凭空造一件事）');
  a(E.indexOf(ANCHOR.staleFlag) > 0, 'y9v2203/A8b: 报告的过期判定与起点指纹比（世界变了这份结论就不是当前的）');
  a(E.indexOf(ANCHOR.withCtx) > 0,
    'y9v2203/A8c: 每一轮的推进都在**隔离上下文**里跑（ex.withContext —— 真跑与试演同一路径）');
  a(E.indexOf(ANCHOR.simFace) > 0 && E.indexOf(ANCHOR.writesSingle) > 0,
    'y9v2203/A9: 口径回带四栏（simCap / simDefault / beatAheadCap / writesSingle）');
  a(E.indexOf(ANCHOR.lskey) >= 0, 'y9v2203/A9b: 偏好键是单一真源');
  a(E.indexOf(ANCHOR.statFace) > 0, 'y9v2203/A9c: stat 面回带 sim 三栏（hasSim / simRows / hasReport）—— 诊断面读它');
  a(E.indexOf(ANCHOR.exportsFace) > 0, 'y9v2203/A9d: 导出面以 diagnose / stat 收口（页面真走的口）');
  a(P.indexOf(SEG_RENDER_START) > 0 && P.indexOf('启用世界实验室') > 0,
    'y9v2203/A10: 设置面总开关在位（setSettings 的真消费方）');
  a(cnt(D, "'wa-wl-enabled'") >= 1, 'y9v2203/A10b: 该开关已进守卫表（渲染了不登记 ⇒ 守卫永远查不到 —— H2 双红）');
  // 跨文件：两条边界分别在别的文件里也有判据（此处只声明**同一口径**在场）
  a(cnt(rd(DIAG_REL), 'simRows') >= 1 && cnt(rd(DIAG_REL), 'writesSingle') >= 1,
    'y9v2203/A11: 诊断面（tool-diag secWorldLab）确实回带 sim 三栏与唯一写口（同一个真源，不是各算各的）');
  a(cnt(rd('tools/reject-recovery.js'), 'REJECT_FACE') >= 1,
    'y9v2203/A11b: 工具确实**读**产品那份拒收表（单一真源在产品；就地不自带第二份）');
  // 锚点纯度 + 唯一性
  const anchorDecl = SELF.slice(SELF.indexOf('const ANCHOR = {'), SELF.indexOf('\n};', SELF.indexOf('const ANCHOR = {')));
  Object.keys(ANCHOR).forEach(function (k) {
    a(cnt(rd(TGT[k]), ANCHOR[k]) === 1, 'y9v2203/A12: 锚点 ' + k + ' 在目标文件里恰中 1 次（实 ' + cnt(rd(TGT[k]), ANCHOR[k]) + '）');
    a(cnt(anchorDecl, '\n  ' + k + ': ') === 1, 'y9v2203/A12b: 锚点 ' + k + ' 在 ANCHOR 表里恰声明 1 次（实 ' + cnt(anchorDecl, '\n  ' + k + ': ') + '）');
  });
  // 切片有效性不用魔数阈值判（阈值低了切错也过、高了正常也红）：改判三件结构事实 ——
  //   ①切在表头 ②未越过表尾 `\n};` ③行首缩进声明数 = ANCHOR 实有键数。
  //   置空 / 删掉一个键会同时改第③处，故这是**活的**探测而非恒真。
  (function () {
    const declN = (anchorDecl.match(/^  [A-Za-z_$][\w$]*: /gm) || []).length;
    const nKeys = Object.keys(ANCHOR).length;
    const nColon = cnt(anchorDecl, ':');
    a(anchorDecl.indexOf('const ANCHOR = {') === 0 && anchorDecl.indexOf('\n};') < 0
      && declN === nKeys && nColon >= nKeys && nColon <= nKeys * 3,
      'y9v2203/A12c: ANCHOR 表切片有效（表头在位 / 未越表尾 / 行首声明 ' + declN
      + ' = 键数 ' + nKeys + ' / 冒号 ' + nColon + '）');
  })();
  (function () {
    const vals = Object.keys(ANCHOR).map(function (k) { return ANCHOR[k]; });
    const uniq = vals.filter(function (v, i) { return vals.indexOf(v) === i; });
    a(uniq.length === vals.length, 'y9v2203/A12d: 锚点值互不相同（' + uniq.length + ' / ' + vals.length + '）');
  })();
  return runRest(a, { gate: gate, LS: LS, env0: env0, seed: seed,
    gotoPageF: gotoPage, clickOutF: clickOut,
    P: P, D: D, E: E, segR: segR, segB: segB,
    ANCHOR: ANCHOR, TGT: TGT, PANEL_REL: PANEL_REL, DIAG_REL: DIAG_REL, ENG_REL: ENG_REL });
}
// ════ B 段：运行时与四功能 ═════════════════════════════════
function runRest(a, C) {
  const gate = C.gate, env0 = C.env0;
  const gotoPage = C.gotoPageF, clickOut = C.clickOutF;
  function mkEnv(o) {
    const env = env0();
    const WA = env.WA;
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    resetSettings(WA);
    if (WA.causal) { try { WA.causal.setSettings({ enabled: true }); } catch (e) {} }
    if (WA.worldLab) WA.worldLab.setSettings({ enabled: true });
    if (o && o.recipe === false && WA.recipe) WA.recipe.setSettings({ enabled: false });
    C.seed(WA);
    return env;
  }
  // ① 四功能在场
  {
    const env = mkEnv(); const L = env.WA.worldLab;
    ['simulate', 'report', 'adopt', 'beats', 'run', 'arms', 'diff', 'discard', 'exportAs',
      'catalog', 'diagnose', 'stat', 'getSettings', 'setSettings'].forEach(function (k) {
      a(typeof L[k] === 'function', 'y9v2203/B1: 导出面有 ' + k + '（函数）');
    });
  }
  // ② 功能①：沙盒推进 N 轮 —— 同一份副本上**累积**
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    const sim = L.simulate({ rounds: 3 });
    a(sim.ok === true, 'y9v2203/B2: simulate 跑通（实 ' + j(sim.ok) + '）');
    a(sim.rounds === 3, 'y9v2203/B2b: 推了 3 轮（实 ' + sim.rounds + '）—— 与入参一致');
    a(sim.rows.length === 3 && sim.rows.map(function (x) { return x.n; }).join() === '1,2,3',
      'y9v2203/B2c: 逐轮读数三行、轮号 1/2/3（实 ' + j(sim.rows.map(function (x) { return x.n; })) + '）');
    a(sim.changedTotal >= 1, 'y9v2203/B2d: 真的推出来了变化（实 ' + sim.changedTotal + ' 处）—— 下面几条不是空转');
    a(sim.liveUnchanged === true, 'y9v2203/B2e: live 前后摘要一致（**实测**，实 ' + j(sim.liveUnchanged) + '）—— 边界①');
    // 夹取如实回带
    const big = L.simulate({ rounds: 99 });
    a(big.rounds === 12 && big.clamped === true && big.askedRounds === 99,
      'y9v2203/B2f: 超限夹到上限**并如实回带** asked/clamped（实 ' + j([big.askedRounds, big.rounds, big.clamped]) + '）');
  }
  // ③ 功能②：报告 —— 每条原因带来源；无变化的轮如实记 no-change
  {
    const env = mkEnv(); const L = env.WA.worldLab;
    L.simulate({ rounds: 6 });
    const rep = L.report({});
    a(rep.ok === true, 'y9v2203/B3: report 跑通（实 ' + j(rep.ok) + '）');
    a(rep.causeTotal >= 1 && rep.causes.every(function (c) { return typeof c.src === 'string' && c.src.length > 0; }),
      'y9v2203/B3b: 每条原因都带 `src`（不出现不可追溯的来源 —— 验收②，实 ' + rep.causeTotal + ' 条）');
    a(rep.causes.every(function (c) { return typeof c.round === 'number' && c.round >= 1 && c.round <= 6; }),
      'y9v2203/B3c: 每条原因都带**轮号**（实 ' + j(rep.causes.map(function (c) { return c.round; })) + '）—— 没打标时这里全是 undefined');
    a(rep.causes.every(function (c) { return c.kind !== 'no-change' || c.key === ''; }),
      'y9v2203/B3d: 无变化的轮**不编原因**（kind=no-change 且没有可落的事实键）—— 边界②');
    a(rep.adoptable.every(function (x) { return !!x.key; }) && rep.adoptable.length === rep.causes.filter(function (c) { return !!c.key; }).length,
      'y9v2203/B3e: 可采纳池 == 带 key 的那几条（实 ' + rep.adoptable.length + ' 条）');
    a(rep.stale === false, 'y9v2203/B3f: 世界没动 ⇒ 报告不过期（实 ' + j(rep.stale) + '）');
  }
  // ④ 功能②的真缺陷固化：轮号缺失 ⇒ 每轮都被记成 no-change
  {
    const env = mkEnv(); const L = env.WA.worldLab;
    L.simulate({ rounds: 6 });
    const rep = L.report({});
    const keyed = rep.causes.filter(function (c) { return !!c.key; }).length;
    a(keyed >= 1, 'y9v2203/B4: 6 轮里至少有一轮推得出可采纳的变化（实 ' + keyed + ' 条）—— 若为 0，说明轮号与分组这条链断了');
    a(rep.causeCounts['no-change'] < 6,
      'y9v2203/B4b: 不是**所有**轮都被记成 no-change（实 no-change ' + j(rep.causeCounts['no-change']) + ' / 共 ' + rep.rounds + ' 轮）');
  }
  // ⑤ 功能③：选择性采纳 —— 唯一写世界通道，落一条、带来源与批准点
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    L.simulate({ rounds: 4 });
    const before = ((WA.store.get() || {}).worldFacts || []).length;
    const ad = L.adopt({ index: 0 });
    const after = ((WA.store.get() || {}).worldFacts || []).length;
    a(ad.ok === true, 'y9v2203/B5: adopt 落成（实 ' + j(ad.reason || 'ok') + '）');
    a(after === before + 1, 'y9v2203/B5b: 世界事实**只多一条**（实 ' + before + ' → ' + after + '）—— 边界④');
    a(typeof ad.opId === 'string' && ad.opId.length > 0, 'y9v2203/B5c: 回执带 opId（走 U2 提交的凭证，实 ' + j(ad.opId) + '）');
    a(typeof ad.approvedBy === 'string' && ad.approvedBy.length > 0 && typeof ad.approvedAt === 'number',
      'y9v2203/B5d: 批准人 / 批准点写在那一条事实**自己身上**（实 ' + j([ad.approvedBy, ad.approvedAt]) + '）');
    a(typeof ad.src === 'string' && ad.src.length > 0, 'y9v2203/B5e: 来源写在它自己身上（实 ' + j(ad.src) + '）');
    const wf = ((WA.store.get() || {}).worldFacts || []).slice(-1)[0];
    a(wf && typeof wf.key === 'string' && wf.key.indexOf('worldLab:') === 0,
      'y9v2203/B5f: 落下的那条事实带 `worldLab:` 前缀的真源键（实 ' + j(wf && wf.key) + '）');
  }
  // ⑥ 验收③：重复采纳同一条 ⇒ 整链中止，不许落成两条
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    L.simulate({ rounds: 4 });
    L.adopt({ index: 0 });
    const n1 = ((WA.store.get() || {}).worldFacts || []).length;
    const ad2 = L.adopt({ index: 0 });
    const n2 = ((WA.store.get() || {}).worldFacts || []).length;
    a(ad2.ok === false, 'y9v2203/B6: 同一条再采纳被拒（实 ' + j(ad2.reason || ad2.ok) + '）');
    a(n2 === n1, 'y9v2203/B6b: 被拒后世界事实条数未变（实 ' + n1 + ' → ' + n2 + '）—— 不是「拒了但已经写了」');
  }
  // ⑦ 功能③的真缺陷固化：空轮不可采纳
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    L.simulate({ rounds: 6 });
    const rep = L.report({});
    const nocIdx = rep.causes.findIndex(function (c) { return !c.key; });
    if (nocIdx < 0) {
      a(true, 'y9v2203/B7: （前置）本次 6 轮全有变化，没有空轮可试 —— 本条跳过');
    } else {
      const before = ((WA.store.get() || {}).worldFacts || []).length;
      const r = L.adopt({ index: nocIdx });
      const after = ((WA.store.get() || {}).worldFacts || []).length;
      a(r.ok === false && r.reason === 'unknown-cause',
        'y9v2203/B7: 空轮（no-change）**不可采纳** —— 拒收 unknown-cause（实 ' + j(r.reason) + '）');
      a(after === before, 'y9v2203/B7b: 被拒后世界一格未动（实 ' + before + ' → ' + after + '）');
    }
  }
  // ⑧ 边界③：采纳必须走 U2 —— commit 缺席时**如实拒收**，不退回自己开事务
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    L.simulate({ rounds: 4 });
    const keep = WA.commit;
    WA.commit = null;
    const r = L.adopt({ index: 0 });
    a(r.ok === false && r.reason === 'commit-absent',
      'y9v2203/B8: commit 缺席 ⇒ 拒收 commit-absent（实 ' + j(r.reason) + '）—— 不退回自己开事务');
    WA.commit = keep;
  }
  // ⑨ 边界①：世界实验室关闭时四口一并拒收（读数一直空 ≠ 还没跑过）
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    const keep = WA.worldLab;
    L.setSettings({ enabled: false });
    ['simulate', 'adopt', 'beats'].forEach(function (k) {
      const r = L[k]({});
      a(r.ok === false && r.reason === 'disabled', 'y9v2203/B9: 关闭时 ' + k + ' 拒收 disabled（实 ' + j(r.reason) + '）');
    });
    a(typeof L.report({}).ok === 'boolean', 'y9v2203/B9b: report 在关闭时仍可读（它只读一份内存态，不碰设置）');
    WA.worldLab = keep;
  }
  // ⑩ 功能④：拍引擎联动 —— 只投影、不落拍
  {
    const env = mkEnv(); const L = env.WA.worldLab;
    const bt = L.beats({ ahead: 4 });
    a(bt.ok === true, 'y9v2203/B10: beats 跑通（实 ' + j(bt.ok) + '）');
    a(bt.mode === 'projection' || bt.mode === 'sandbox',
      'y9v2203/B10b: 模式如实（实 ' + j(bt.mode) + '）—— 隔离口缺席时不冒充 sandbox');
    a(bt.ledger && bt.ledger.unchanged === true,
      'y9v2203/B10c: 拍账摘要前后逐字一致（**实测**，实 ' + j(bt.ledger && bt.ledger.unchanged) + '）—— 不落拍');
    a(bt.rows.every(function (x) { return x.status === 'projected'; }),
      'y9v2203/B10d: 投影出来的每一拍都标 projected（不是 landed —— 不是真落拍）');
    a(typeof bt.ledger.digestBefore === 'string' && bt.ledger.digestBefore === bt.ledger.digestAfter,
      'y9v2203/B10e: 拍账指纹前后逐字相同（实 ' + j(bt.ledger.digestBefore) + '）');
  }
  // ⑪ 口径面：四栏逐字在位
  {
    const env = mkEnv(); const L = env.WA.worldLab;
    const cat = L.catalog();
    a(cat.simCap === 12 && cat.simDefault === 3, 'y9v2203/B11: catalog 回带轮数上限与默认（实 ' + j([cat.simCap, cat.simDefault]) + '）');
    a(cat.beatAheadCap === 12 && Array.isArray(cat.beatFamily) && cat.beatFamily.length >= 1,
      'y9v2203/B11b: catalog 回带拍投影上限与家族名单（实 ' + j([cat.beatAheadCap, cat.beatFamily]) + '）');
    a(cat.writesSingle === 'adopt', 'y9v2203/B11c: catalog 回带**唯一写世界口**（实 ' + j(cat.writesSingle) + '）—— 边界④的可读形式');
    a(cat.consume && cat.consume.simulate && cat.consume.report && cat.consume.adopt && cat.consume.beats,
      'y9v2203/B11d: 四功能各自写明消费方（实 ' + j(Object.keys(cat.consume || {})) + '）');
  }
  // ⑫ 面板：四枚钮真出读数（端到端）
  {
    const env = mkEnv(); const WA = env.WA;
    const dom = gotoPage(env, 'tools');
    const t1 = String(clickOut(dom, 'wa-wl-sim') || '');
    a(t1.length > 0, 'y9v2203/B12: 「沙盒推进」钮在面板上真出读数（实 ' + t1.length + ' 字符）');
    const t2 = String(clickOut(dom, 'wa-wl-report') || '');
    a(t2.length > 0, 'y9v2203/B12b: 「结果报告」钮真出读数（实 ' + t2.length + ' 字符）');
    const t3 = String(clickOut(dom, 'wa-wl-adopt') || '');
    a(t3.length > 0, 'y9v2203/B12c: 「采纳这一条」钮真出读数（实 ' + t3.length + ' 字符）');
    const t4 = String(clickOut(dom, 'wa-wl-beats') || '');
    a(t4.length > 0, 'y9v2203/B12d: 「拍引擎推演」钮真出读数（实 ' + t4.length + ' 字符）');
  }
  // ════ C 段：零写入不变式 ═════════════════════════════════
  {
    const env = mkEnv(); const WA = env.WA, L = WA.worldLab;
    const before = JSON.stringify(WA.store.get());
    const sim = L.simulate({ rounds: 4 });
    L.report({}); L.catalog(); L.diagnose(); L.stat(); L.beats({ ahead: 4 }); L.arms(); L.diff();
    const after = JSON.stringify(WA.store.get());
    a(before === after, 'y9v2203/C1: 推演 / 报告 / 口径 / 诊断 / 拍投影全**不写世界**（store 摘要逐字一致）');
    a(sim.liveUnchanged === true, 'y9v2203/C1b: 推演自报的 live 未变与上面那条一致（不是恒 true）');
    // 采纳是唯一写口：只加一条，且不改别的面
    const b2 = (WA.store.get() || {}).worldFacts.length;
    const ad = L.adopt({ index: 0 });
    const a2 = (WA.store.get() || {}).worldFacts.length;
    a(ad.ok === true && a2 === b2 + 1, 'y9v2203/C2: 采纳只加**一条**世界事实（实 ' + b2 + ' → ' + a2 + '）');
    const keysBefore = Object.keys(WA.store.get() || {}).sort().join();
    a(keysBefore.indexOf('causal') >= 0, 'y9v2203/C2b: 存档顶层键面在场（实 ' + j(keysBefore) + '）—— 上面那条不是在空存档上比的');
    // 只读出口不碰偏好键
    const lsk = C.LS ? C.LS.getItem(LSKEY) : null;
    const dom = gotoPage(env, 'tools');
    clickOut(dom, 'wa-wl-report'); clickOut(dom, 'wa-wl-beats');
    const lsk2 = C.LS ? C.LS.getItem(LSKEY) : null;
    a(lsk === lsk2, 'y9v2203/C3: 两枚只读钮不碰偏好键（读口不留痕）');
  }
  // ════ N 段：真源码破坏 + 两向自证 ═══════════════════════
  // 计数不可能为负，`< 0` 是恒假式；本模块正文不提 eval（已核 0 次），故不必剥注释。
  a(cnt(rd(ENG_REL), 'eval(') === 0 && cnt(rd(ENG_REL), 'new Function') === 0,
    'y9v2203/N0: 世界实验室不引入可执行脚本（代码面零 eval / 零 new Function；实 '
    + cnt(rd(ENG_REL), 'eval(') + ' / ' + cnt(rd(ENG_REL), 'new Function') + '）');
  return runN(a, C);
}
function runN(a, C) {
  const cnt = function (s, n) { return s.split(n).length - 1; };
  const j = JSON.stringify;
  const rd = function (rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); };
  function mkRun(ov, fn) {
    const env = C.env0(ov || null);
    const WA = env.WA;
    // `gate.fresh()` 只复位宿主窗口与设置登记表，**不复位 localStorage**。N 段两向是
    //   「同一段代码在两个进程态里各跑一遍」，故每一脚都必须从**同一块空盘**起步。
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    resetSettings(WA);
    if (WA.causal) { try { WA.causal.setSettings({ enabled: true }); } catch (e) {} }
    if (WA.worldLab) WA.worldLab.setSettings({ enabled: true });
    C.seed(WA);
    return fn(env, WA);
  }
  const SIM6 = function (WA) { WA.worldLab.simulate({ rounds: 6 }); };
  // N1：轮号未打在快照上 ⇒ 报告一轮都分不出来（两向）
  (function () {
    const S = rd(C.ENG_REL);
    const from = "      now.n = i + 1;";
    if (cnt(S, from) !== 1) { a(false, 'y9v2203/N1a: 轮号锚点恰中 1 次（前置失效，实 ' + cnt(S, from) + '）'); return; }
    const broken = S.split(from).join('      /* n 未打标 */');
    const ov = {}; ov[C.ENG_REL] = broken;
    function runOnce(ovv) {
      return mkRun(ovv, function (env, WA) {
        SIM6(WA);
        const rep = WA.worldLab.report({});
        return { keyed: (rep.causes || []).filter(function (c) { return !!c.key; }).length,
          noc: (rep.causes || []).filter(function (c) { return c.kind === 'no-change'; }).length,
          rounds: (rep.causes || []).map(function (c) { return c.round; }).join(',') };
      });
    }
    let bad = null, good = null, threw = null;
    try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y9v2203/N1b: 两版都不抛（实 ' + j(threw) + '）');
    a(bad && bad.keyed === 0 && bad.noc === bad.rounds.split(',').length,
      'y9v2203/N1c: （两向）没打标后**每一轮**都被记成 no-change、可采纳 0 条（实 ' + j([bad && bad.keyed, bad && bad.noc]) + '）—— 跑得通、答的是空话');
    a(good && good.keyed >= 1, 'y9v2203/N1d: （两向）原版上至少有可采纳的变化（实 ' + j(good && good.keyed) + '）—— 两向区分得开');
  })();
  // N2：可采纳池不筛 key ⇒ 空轮也能被采纳（两向）
  (function () {
    const S = rd(C.ENG_REL);
    const from = C.ANCHOR.adoptPool;
    if (cnt(S, from) !== 1) { a(false, 'y9v2203/N2a: 采纳池锚点恰中 1 次（前置失效）'); return; }
    const broken = S.split(from).join('    const pool = rep.causes;');
    const ov = {}; ov[C.ENG_REL] = broken;
    function runOnce(ovv) {
      return mkRun(ovv, function (env, WA) {
        SIM6(WA);
        const rep = WA.worldLab.report({});
        const nocIdx = rep.causes.findIndex(function (c) { return !c.key; });
        const before = ((WA.store.get() || {}).worldFacts || []).length;
        const r = WA.worldLab.adopt({ index: nocIdx < 0 ? 0 : nocIdx });
        const after = ((WA.store.get() || {}).worldFacts || []).length;
        return { nocIdx: nocIdx, ok: r.ok, reason: String(r.reason), wf: before + '→' + after,
          changed: after - before };
      });
    }
    let bad = null, good = null, threw = null;
    try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y9v2203/N2b: 两版都不抛（实 ' + j(threw) + '）');
    if (bad && bad.nocIdx < 0) { a(true, 'y9v2203/N2c: （前置）本次没有空轮可试 —— 本条跳过'); return; }
    a(bad && bad.ok === true && bad.changed === 1,
      'y9v2203/N2c: （两向）不筛之后**空轮也被采纳**、真写了一格（实 ' + j([bad.ok, bad.wf]) + '）—— 凭空造一件事');
    a(good && good.ok === false && good.reason === 'unknown-cause' && good.changed === 0,
      'y9v2203/N2d: （两向）原版上同一条被判「没有可落的事实」、世界一格未动（实 ' + j([good.reason, good.wf]) + '）');
  })();
  // N3：报告的过期判定被摘掉 ⇒ 面板说「未过期」（而 adopt 内部还拦着）
  (function () {
    const S = rd(C.ENG_REL);
    const from = C.ANCHOR.staleFlag;
    if (cnt(S, from) !== 1) { a(false, 'y9v2203/N3a: 过期判定锚点恰中 1 次（前置失效）'); return; }
    const broken = S.split(from).join('    const stale = false;');
    const ov = {}; ov[C.ENG_REL] = broken;
    function runOnce(ovv) {
      return mkRun(ovv, function (env, WA) {
        WA.worldLab.simulate({ rounds: 3 });
        WA.store.transact(function (d) { d.__moved = 1; }, 'y9:n3-move');   // 世界动了
        const rep = WA.worldLab.report({});
        const ad = WA.worldLab.adopt({ index: 0 });
        return { stale: rep.stale, reason: String(rep.staleReason), adoptOk: ad.ok, adoptReason: String(ad.reason) };
      });
    }
    let bad = null, good = null, threw = null;
    try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y9v2203/N3b: 两版都不抛（实 ' + j(threw) + '）');
    a(bad && bad.stale === false, 'y9v2203/N3c: （两向）判定被摘后**世界变过了仍报未过期**（实 ' + j(bad && bad.stale) + '）');
    a(bad && bad.adoptOk === false && bad.adoptReason === 'stale-report',
      'y9v2203/N3d: （两向）而写口那一道还在拦（实 ' + j(bad && bad.adoptReason) + '）—— 两条判据分家 ⇒ 面板说可以、写口说不行');
    a(good && good.stale === true && good.reason === 'stale-report',
      'y9v2203/N3e: （两向）原版上面板与写口**一致**地报过期（实 ' + j([good.stale, good.reason]) + '）—— 两向区分得开');
  })();
  // N4：推演不走隔离上下文 ⇒ **悄悄写进正史**（本模块立身之本，两向）
  (function () {
    const S = rd(C.ENG_REL);
    const from = C.ANCHOR.withCtx;
    if (cnt(S, from) !== 1) { a(false, 'y9v2203/N4a: 隔离上下文锚点恰中 1 次（前置失效）'); return; }
    const broken = S.split(from).join('      try { cz = WA.causal.tick({ now: at }); }');
    const ov = {}; ov[C.ENG_REL] = broken;
    function runOnce(ovv) {
      return mkRun(ovv, function (env, WA) {
        const b = JSON.stringify(WA.store.get());
        const sim = WA.worldLab.simulate({ rounds: 3 });
        const a2 = JSON.stringify(WA.store.get());
        const live = WA.store.get() || {};
        return { reported: sim.liveUnchanged, reallySame: b === a2,
          liveStatus: ((live.causal || {}).chains || []).map(function (x) { return x.status; }).join(),
          liveWF: (live.worldFacts || []).length };
      });
    }
    let bad = null, good = null, threw = null;
    try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y9v2203/N4b: 两版都不抛（实 ' + j(threw) + '）');
    a(bad && bad.reallySame === false && bad.reported === false,
      'y9v2203/N4c: （两向）不走隔离上下文 ⇒ live **真被改动了**、且它自报的 liveUnchanged 同时翻 false（实 ' + j(bad && bad.reallySame) + '）');
    a(bad && bad.liveWF >= 2 && bad.liveStatus !== 'open',
      'y9v2203/N4d: （两向）正史里的链被推着走了、世界事实多出来了（实 ' + j([bad && bad.liveStatus, bad && bad.liveWF]) + '）—— 推演悄悄写进正史');
    a(good && good.reallySame === true && good.reported === true && good.liveStatus === 'open' && good.liveWF === 1,
      'y9v2203/N4e: （两向）原版上 live 一格未动、链仍是起点态（实 ' + j([good.liveStatus, good.liveWF]) + '）—— 两向区分得开');
  })();
}
module.exports = { runAll: require(path.join(BASE, 'tests/lock-assert.js')).restoring(runAll) };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runAll(a);
  console.log('\nY9 s3-y9-v2203 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}
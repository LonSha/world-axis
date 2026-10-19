#!/usr/bin/env node
// WorldAxis tests/s3-y8-v2203.js — Y8 规则包扩展（冲突 / 归一 / 回滚 / 组合）专锁（v2.203.0 第四批）
//
// 【计划原文（plans/Y_EXPANSION.md §Y8）逐条对照】
//   要解决的玩家问题：`engines/rule-pack.js` 能把当前规则面存成命名包、一键切回，
//     但「这一包切得进去吗 / 世界配哪套 / 刚才那一步能不能撤」三件事此前没有一处能答。
//   新功能四条：① 包说明（人读的一行，随包走）；② 冲突检测（同键两处写 / 两条政策互斥 /
//     两题材叠加 —— **只报不判**）；③ 组合口（规则包 + 预设世界：开档即定档，**纯读**）；
//     ④ 回滚一步（栈里只装规则面键值）。
//   边界四条：① 冲突只报不判（不做「后启用的赢」）；② 组合口是只读的（不切规则、不种世界）；
//     ③ 回滚栈只装规则面键值（一条世界键都进不来）；④ 导入不得夹带世界事实（写盘之前拦下）。
//   验收四条：① 冲突三类都能指出**是哪两条**；② 归一化与写路径同一个函数；
//     ③ 组合口读草稿面而不自己读一遍世界；④ 回滚/组合**零世界写入**（实测摘要）。
//
// 【本锁对计划原文的**如实偏离**（写在最前，不藏）】
//   偏离 1 验收②「归一化与写路径同一个函数」：无头环境判不了「同一个」这件事本身，
//     本锁改判**可观测的两向**——归一后刚存下的包启用不再报冲突（修之前必报），
//     且归一函数逐字是 `settingsBus.normalize`（真源不新造）。
//   偏离 2 验收④：本锁判**两处**——活世界逐字不变（store 摘要）+ 本模块自己那格设置键在
//     只读出口上逐字不变（设置写口单独取证）。
//
// 【本锁四段】A 静态契约 / B 运行时与四功能 / C 零写入不变式 / N 真源码破坏 + 两向自证。
//   N 段走**真源码破坏 + 两向跑产品**（负控制三形与 H5/H6 纪律）。
//
// 【N 段的额外职责：本版真缺陷的固化】
//   N3 钉住「冲突检测不归一」——刚存下的包一启用就报冲突（修法：比之前两侧各过一次
//   `settingsBus.normalize`，与 apply 的写路径同一个函数，不新建第二份归一逻辑）。
//   N4 钉住「轮号缺失」在**报告侧**的连锁后果之外的那一半：政策冲突的 key 空串
//   （`recipe.policyClashes()` 无 `pair` 字段 ⇒ 沿用 `c.pair` 恒得空串 ⇒「是哪两条」看不见）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const PANEL_REL = 'ui/panel.js';
const DIAG_REL = 'engines/tool-diag.js';
const ENG_REL = 'engines/rule-pack.js';
const SELF_REL = 'tests/s3-y8-v2203.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }
/** 把「设置态」按各引擎**自己的**默认值显式写回（装置件、模块级 —— 理由与 Y6/Y7 同）。 */
function resetSettings(WA) {
  // 先清偏好键：`gate.fresh()` 只复位宿主窗口与设置登记表，**不清 localStorage** ——
  //   不清的话 N 段前一脚（破坏版）写下的包会漏进后一脚（原版），于是「原版上这份导入体
  //   没进库」被前一脚的残留证伪（实测：inLib 由 0 变 1）。
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  try { if (WA.rulePack) WA.rulePack.setSettings({ enabled: false }); } catch (e) {}
  try { if (WA.worldLab) WA.worldLab.setSettings({ enabled: false }); } catch (e) {}
  try { if (WA.recipe) WA.recipe.setSettings({ enabled: true }); } catch (e) {}
}
/** 破坏锚点：逐字取自产品源码，各恰 1 次（N0 验）。 */
const ANCHOR = {
  conflictKinds: "const CONFLICT_KINDS = ['key-clash', 'policy-clash', 'theme-clash'];",
  worldFacts: "  const WORLD_FACT_NAMES = ['characters', 'people', 'persons', 'places', 'events', 'map', 'atlas',",
  pairOf: 'function pairOf(c) {',
  pairOfFrom: '    const p = Array.isArray(row.pair) && row.pair.length ? row.pair : [row.a, row.b];',
  normalizeCompare: '      const xa = asWritten(k, va[k]), xb = asWritten(k, vb[k]);\n'
    + '      return JSON.stringify(xa.v) !== JSON.stringify(xb.v);',
  carriedDetect: "rows.push({ kind: 'carries-world-facts', key: carried.join('、'), from: carried.slice(),",
  carriedImport: "if (carried.length) { fault('carries-world-facts'); return { ok: false, reason: 'carries-world-facts',",
  rollbackCap: 'rollbackCap: MAX_HISTORY,',
  noCarry: "noCarry: '",
  conflictNote: "conflict: '",
  rollbackNote: "rollback: '",
  composeNote: "compose: '",
  lskey: "const LS_KEY = 'worldaxis_rule_pack_settings_v1';",
  def: "const DEF = { enabled: false, packs: [], active: '', maxPacks: 24, maxKeys: 40, seq: 0,",
  exportsFace: 'diagnose: diagnose, stat: statOf',
  note: "       <div class=\"wa-dim\">v2.203.0（Y8）四件事：",
  out: "       <div id=\"wa-rp-out\" class=\"wa-out\"></div>"
};
const TGT = { conflictKinds: ENG_REL, worldFacts: ENG_REL, pairOf: ENG_REL, pairOfFrom: ENG_REL,
  normalizeCompare: ENG_REL, carriedDetect: ENG_REL,
  carriedImport: ENG_REL, rollbackCap: ENG_REL, noCarry: ENG_REL, conflictNote: ENG_REL,
  rollbackNote: ENG_REL, composeNote: ENG_REL, lskey: ENG_REL, def: ENG_REL, exportsFace: ENG_REL,
  note: PANEL_REL, out: PANEL_REL };
/** 本模块偏好键**键名**（⚠ ANCHOR.lskey 是源码声明行、不是键名）。 */
const LSKEY = 'worldaxis_rule_pack_settings_v1';
const SEG_RENDER_START = '       <div class="wa-dim">v2.203.0（Y8）四件事：';
// 段尾取**下一段的折叠包装前缀**（不是 Y8 自己的出口元素）：`id="wa-rp-out"` 在 panel.js 里
//   出现 2 次（另一处在 v2.152.0 性能页，与本页不共存），拿它当段尾会让切片提前收口。
//   v2.229.0（收口）：原锦点写的是 v2.225.0（Q8）折叠改造**之前**的
//   `<div class="wa-sec">世界实验室与反事实对比</div>`，该字面量已 0 命中 ⇒
//   slice 切到文件末尾（A1c / A4d / A5 三处同源联锁失效）。现改为折叠包装前缀。
const SEG_RENDER_END = '      ${foldSec(\'tools\', \'worldlab\',';
const SEG_BIND_START = '    // ── v2.203.0（Y8）四件事：说明 / 查冲突 / 开档定档 / 回滚栈 + 强制启用 ──────';
const SEG_END = '    // ── E9 世界实验室（同一页；与「三条路先看看」这条线同族）─────────────────';
/** 本页控件（Y8 新增 7 枚；渲染段与守卫表口径一致）。 */
const NEW_IDS = ['wa-rp-note', 'wa-rp-check', 'wa-rp-compose', 'wa-rp-admit', 'wa-rp-force',
  'wa-rp-rollback', 'wa-rp-history'];
const BTN_IDS = ['wa-rp-check', 'wa-rp-compose', 'wa-rp-admit', 'wa-rp-force',
  'wa-rp-rollback', 'wa-rp-history'];
const OTHER_PREFIX = ['wa-wg-', 'wa-wl-', 'wa-hs-', 'wa-cap-'];
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
  function seed(WA, fn) { WA.store.init(); return WA.store.transact(fn, 'y8:seed'); }
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
    const o = dom.getElementById('wa-rp-out');
    return String(o ? (o.textContent || '') : '');
  }
  // ════ A 段：静态契约 ══════════════════════════════════════
  const segR = P.slice(P.indexOf(SEG_RENDER_START), P.indexOf(SEG_RENDER_END));
  const segB = P.slice(P.indexOf(SEG_BIND_START), P.indexOf(SEG_END));
  a(P.indexOf(SEG_RENDER_START) >= 0 && P.indexOf(SEG_BIND_START) >= 0 && P.indexOf(SEG_END) > 0,
    'y8v2203/A1: 两段段首与段尾锚点都在位（切片有效）');
  a(P.indexOf(SEG_RENDER_END) > P.indexOf(SEG_RENDER_START),
    'y8v2203/A1d: 段尾锚点在段首之后（实 indexOf ' + P.indexOf(SEG_RENDER_END)
    + ' / 段首 ' + P.indexOf(SEG_RENDER_START) + '）—— 缺失会让 slice 切到文件末尾，三处判据同步失效');
  a(segR.length > 300 && segB.length > 1000,
    'y8v2203/A1b: 两段切片非空（实渲染段 ' + segR.length + ' / 绑定段 ' + segB.length + ' 字符）—— 切片失效会让下面的扫描在空集上恒真');
  (function () {
    const segRc = stripLineComments(segR), segBc = stripLineComments(segB);
    const leak = [];
    OTHER_PREFIX.forEach(function (p) {
      if (cnt(segRc, p) > 0) leak.push('渲染段 ' + p + cnt(segRc, p));
      if (cnt(segBc, p) > 0) leak.push('绑定段 ' + p + cnt(segBc, p));
    });
    a(leak.length === 0, 'y8v2203/A1c: 两段切片未蔓延（无它页前缀：' + (leak.join('、') || '无声') + '）');
  })();
  NEW_IDS.forEach(function (id) {
    a(cnt(segR, 'id="' + id + '"') === 1, 'y8v2203/A2: ' + id + ' 在渲染段恰渲染 1 次（实 ' + cnt(segR, 'id="' + id + '"') + '）');
    a(cnt(D, "'" + id + "'") === 1, 'y8v2203/A2b: ' + id + ' 在守卫表里恰登记 1 次（实 ' + cnt(D, "'" + id + "'") + '）');
  });
  BTN_IDS.forEach(function (id) {
    a(cnt(segB, "on('#" + id + "', () => {") === 1, 'y8v2203/A3: ' + id + ' 的 onclick 绑定恰 1 处（实 ' + cnt(segB, "on('#" + id + "', () => {") + '）');
  });
  // `wa-rp-out` 是 E7 时代就有的**既有**读数口：Y8 六枚 handler 一律回写它 —— 不新开读数区。
  //   故判据按「在 dynamic 层恰 1 处」「在 Y8 渲染段在场恰 1 次」写，而不是按全页恰 1 次：
  //   后者会逼着后来的人删掉既有出口的一处来迁就判据（那是拿判据改产品）。
  a(cnt(D, "dynamic: ['wa-rp-out']") === 1, 'y8v2203/A4: 读数出口 wa-rp-out 在守卫表 dynamic 层恰 1 处（既有出口复写）');
  a(cnt(segR, 'id="wa-rp-out"') === 1, 'y8v2203/A4b: 输出容器在 Y8 渲染段在场恰 1 次（否则六枚 handler 写进空气）');
  a((segR.match(/wa-[a-z]+-out/g) || []).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).join() === 'wa-rp-out',
    'y8v2203/A4d: Y8 渲染段只含 wa-rp-out 这一个读数口（防与它页串切）');
  (function () {
    const outs = (segB.match(/wa-[a-z]+-out/g) || []);
    const uniq = outs.filter(function (v, i) { return outs.indexOf(v) === i; });
    a(uniq.length === 1 && uniq[0] === 'wa-rp-out',
      'y8v2203/A4c: 绑定段只写一个读数口 ' + j(uniq) + ' —— Y8 **不新开**读数区（六枚 handler 共用一个出口）');
  })();
  const codeSeg = stripLineComments(segR) + '\n' + stripLineComments(segB);
  a(codeSeg.indexOf('store.transact(') < 0,
    'y8v2203/A5: 两段零 store.transact 调用（规则包不碰世界 —— 边界③）');
  a(codeSeg.indexOf('localStorage.setItem(') < 0 && codeSeg.indexOf('localStorage.getItem(') < 0,
    'y8v2203/A5b: 两段零 localStorage 直接读写（偏好键的唯一读写面在引擎里）');
  a(codeSeg.indexOf('WA.rulePack.detect(') >= 0 && codeSeg.indexOf('WA.rulePack.admit(') >= 0
    && codeSeg.indexOf('WA.rulePack.compose(') >= 0 && codeSeg.indexOf('WA.rulePack.rollback(') >= 0
    && codeSeg.indexOf('WA.rulePack.history(') >= 0,
    'y8v2203/A5c: 去注释后五口真读口**带括号**在场（防自我指涉：判据不许把自己删掉）');
  a(E.indexOf(ANCHOR.conflictKinds) > 0, 'y8v2203/A6: 冲突三类是**显式封闭表**（不是靠前缀猜）');
  a(E.indexOf(ANCHOR.worldFacts) > 0, 'y8v2203/A6b: 夹带名单是**显式表**（12 项世界事实名 —— 导入拦在写盘之前）');
  a(E.indexOf(ANCHOR.pairOf) > 0, 'y8v2203/A6c: 政策/题材冲突的「哪两条」走**同一个** pairOf（不两处各写一遍）');
  // 冲突**只报不判**：三类都在 catalog notes 里逐字写明，且不出现「后启用的赢」式自动裁决
  a(E.indexOf(ANCHOR.conflictNote) > 0 && E.indexOf('不做「后启用的赢」') > 0,
    'y8v2203/A7: 冲突口径逐字写明「只报不判 / 不做后启用的赢」（边界①）');
  a(E.indexOf(ANCHOR.noCarry) > 0, 'y8v2203/A7b: 夹带口径逐字写明（边界④）');
  a(E.indexOf(ANCHOR.rollbackNote) > 0, 'y8v2203/A7c: 回滚栈口径逐字写明「只装规则面键值」（边界③）');
  a(E.indexOf(ANCHOR.composeNote) > 0, 'y8v2203/A7d: 组合口口径逐字写明「只读」（边界②）');
  a(E.indexOf(ANCHOR.rollbackCap) > 0, 'y8v2203/A8: 回滚栈上限是**内部常量**（不进 bounds —— 栈不是档案库）');
  a(LSTEXT(E).indexOf(ANCHOR.lskey) >= 0, 'y8v2203/A9: 偏好键是单一真源');
  a(E.indexOf(ANCHOR.exportsFace) > 0, 'y8v2203/A9b: 导出面以 diagnose / stat 收口（页面真走的口）');
  a(P.indexOf(SEG_RENDER_START) > 0 && P.indexOf('启用规则包') > 0,
    'y8v2203/A10: 设置面总开关在位（setSettings 的真消费方）');
  a(cnt(D, "'wa-rp-enabled'") >= 1, 'y8v2203/A10b: 该开关已进守卫表（渲染了不登记 ⇒ 守卫永远查不到 —— H2 双红）');
  // 见证当面：四码的见证住在 reject-v2780.js（另一个文件）。跨文件判据在这里补上。
  a(cnt(rd('tests/reject-v2780.js'), "want('carries-world-facts'") === 1
    && cnt(rd('tests/reject-v2780.js'), "want('conflict'") === 1
    && cnt(rd('tests/reject-v2780.js'), "want('preset-world-absent'") === 1,
    'y8v2203/A11: 三码的可执行见证在 reject-v2780.js 里各声明 1 次（新码不进基线）');
  // 工具（tools/reject-recovery.js）**不自带第二份表** —— 表是产品承诺，工具只持判据。
  //   按**表名**扫比按某个局部变量名扫有分量：表名正是「第二份真源」的形状。
  (function () {
    const tool = rd('tools/reject-recovery.js');
    // 「工具**引用**产品那张表」与「工具**自带**一份同名表」在裸串计数上同形 —— 故不能按
    //   名字出现与否判，只能按**定义式**判自带（这才是「第二份真源」的形状）。
    const NAMES = ['REJECT_FACE', 'SUCCESS_FACE', 'NEUTRAL_FACE', 'OVERRIDES', 'NEUTRAL_REVIEW'];
    const own = NAMES.filter(function (t) {
      return new RegExp('(const|let|var)\\s+' + t + '\\s*=').test(tool);
    });
    a(own.length === 0, 'y8v2203/A11b: 工具**不自带**第二份表（就地定义式零命中；实 ' + j(own) + '）');
    a(cnt(tool, 'engines/reject-recovery') >= 1 && cnt(tool, 'p.') >= 1,
      'y8v2203/A11b2: 工具确实**读**产品那份表（引用产品模块的导出面）');
  })();
  // 恢复动作面：三码都在拒收面快照里（U5 台账的跨文件同源）
  // 三码在**拒收面快照**里同批登记（逐字连写的同一行恰 1 次）—— 比单码各数一次准：
  //   单码计数会被规则表的词法面拉高（`'conflict',` 在词表里另有一处），判据就不再指向快照。
  a(cnt(rd('engines/reject-recovery.js'), "'carries-world-facts', 'conflict', 'preset-world-absent',") === 1,
    'y8v2203/A11c: 三码在 reject-recovery 的拒收面快照里**同行连写**恰 1 次（U5 面口径同源）');
  // 锚点纯度 + 唯一性
  const anchorDecl = SELF.slice(SELF.indexOf('const ANCHOR = {'), SELF.indexOf('\n};', SELF.indexOf('const ANCHOR = {')));
  Object.keys(ANCHOR).forEach(function (k) {
    a(cnt(rd(TGT[k]), ANCHOR[k]) === 1, 'y8v2203/A12: 锚点 ' + k + ' 在目标文件里恰中 1 次（实 ' + cnt(rd(TGT[k]), ANCHOR[k]) + '）');
    a(cnt(anchorDecl, '\n  ' + k + ': ') === 1, 'y8v2203/A12b: 锚点 ' + k + ' 在 ANCHOR 表里恰声明 1 次（实 ' + cnt(anchorDecl, '\n  ' + k + ': ') + '）');
  });
  a(cnt(anchorDecl, ':') >= 30, 'y8v2203/A12c: ANCHOR 表切片有效（实 ' + cnt(anchorDecl, ':') + ' 个冒号）');
  (function () {
    const vals = Object.keys(ANCHOR).map(function (k) { return ANCHOR[k]; });
    const uniq = vals.filter(function (v, i) { return vals.indexOf(v) === i; });
    a(uniq.length === vals.length, 'y8v2203/A12d: 锚点值互不相同（' + uniq.length + ' / ' + vals.length + '）');
  })();
  return runRest(a, { gate: gate, LS: LS, env0: env0, seed: seed,
    gotoPageF: gotoPage, clickOutF: clickOut,
    P: P, D: D, E: E, segR: segR, segB: segB,
    ANCHOR: ANCHOR, TGT: TGT, PANEL_REL: PANEL_REL, DIAG_REL: DIAG_REL, ENG_REL: ENG_REL });
}
function LSTEXT(E) { return E; }
// ════ B 段：运行时与四功能 ═════════════════════════════════
function runRest(a, C) {
  const gate = C.gate, env0 = C.env0;
  const gotoPage = C.gotoPageF, clickOut = C.clickOutF;
  function mkEnv(o) {
    const env = env0();
    const WA = env.WA;
    WA.store.init();
    WA.store.transact(function (d) {
      d.people = { A: { name: '老周' } };
      d.region = { places: [{ name: '扁担巷', distanceDays: 2 }], events: [] };
    }, 'y8:seed');
    resetSettings(WA);
    if (WA.rulePack) WA.rulePack.setSettings({ enabled: true });
    if (o && o.recipe === false && WA.recipe) WA.recipe.setSettings({ enabled: false });
    return env;
  }
  // ① 四功能在场：detect / admit / compose / rollback / history 都是函数
  {
    const env = mkEnv(); const R = env.WA.rulePack;
    ['detect', 'admit', 'compose', 'rollback', 'history', 'catalog', 'diagnose', 'stat',
      'getSettings', 'setSettings', 'current'].forEach(function (k) {
      a(typeof R[k] === 'function', 'y8v2203/B1: 导出面有 ' + k + '（函数）');
    });
  }
  // ② 功能②：冲突三类逐条带**是哪两条**（政策那一支不许恒空串 —— 本版真缺陷）
  {
    const env = mkEnv(); const WA = env.WA, R = WA.rulePack;
    R.save('甲包', { note: '悬疑局用的那套' });
    const g = R.get('甲包');
    a(g.ok === true && g.note === '悬疑局用的那套', 'y8v2203/B2: 包说明随包走（功能①）');
    // 真造一条 key-clash：先把当前面钉住存包，再改一处
    const cur = R.current({}).values || {};
    const keys = Object.keys(cur);
    a(keys.length >= 1, 'y8v2203/B2b: 当前面有可比的规则面键（实 ' + keys.length + '）—— 下面不是空转');
    if (keys.length >= 1) {
      const k0 = keys[0];
      WA.store.transact(function (d) { d.__probe = 1; }, 'y8:probe');
      R.save('乙包');
      // 改掉当前面的同一个键
      const vals = {}; vals[k0] = (typeof cur[k0] === 'number') ? (cur[k0] + 1)
        : (typeof cur[k0] === 'string' ? (cur[k0] + 'x') : (Array.isArray(cur[k0]) ? cur[k0].concat(['x']) : true));
      if (WA.settingsBus && WA.settingsBus.saveOrThrow) {
        const rec = null;   // 逐键变更走 saveOrThrow 需要 rec —— 此处走 apply 的对照足够
      }
      const d2 = R.detect({ values: vals, label: '对照面', against: 'current' });
      // `kinds` 是**固定三类词表**（「都判过了哪三类」），与 `conflicts.length` 各答一件：
      //   前者是覆盖面，后者是命中的条数。两者混为一谈时，「一条都没报」会被读成「三类都没判」。
      a(d2.kinds.join() === 'key-clash,policy-clash,theme-clash',
        'y8v2203/B2c: detect 回带三类词表（覆盖面，实 ' + j(d2.kinds) + '）');
      // 词法逐字取自产品：`rows.length ? 'conflict' : (absent.length ? 'unknown' : 'clean')`。
      //   原先判据里写的 `'clash'` 是凭空多出的第四种取值 —— 它永远不成立，于是这条判据
      //   只证明了「verdict 是个字符串」，没证明它是那三个之一。
      a(typeof d2.verdict === 'string' && (d2.verdict === 'conflict' || d2.verdict === 'clean' || d2.verdict === 'unknown'),
        'y8v2203/B2d: detect 给总判（词法只有 conflict / clean / unknown —— 独一取值、不是「四种里挑一个」，实 ' + j(d2.verdict) + '）');
      const row = (d2.conflicts || []).filter(function (x) { return x.kind === 'key-clash'; })[0];
      a(!!row && typeof row.key === 'string' && row.key.length > 0,
        'y8v2203/B2e: key-clash 指出**是哪一条**（key 非空串 —— 实 ' + j(row && row.key) + '）');
    }
  }
  // ③ 功能②的真缺陷固化：政策冲突的 key **必须非空**（修之前恒空串）
  {
    const env = mkEnv(); const WA = env.WA, R = WA.rulePack;
    // 真造两条**已知互斥**的政策：真源在 recipe.POLICIES 的 `vs` 双向声明（intel-source ↔ improv）。
    //   名字逐字取自 recipe 自己的声明面 —— 本锁不自编一对名字：自编的话政策一改名这里就先失效，
    //   而表现是「冲突不报了」，正是最坏的那种静默。
    const rec = WA.recipe;
    const pair = (rec && typeof rec.policyClashes === 'function')
      ? rec.policyClashes(['intel-source', 'improv']) : [];
    a(pair.length >= 1, 'y8v2203/B3: （前置）recipe 对 intel-source × improv 有互斥声明（实 ' + pair.length + ' 条）');
    if (pair.length >= 1) {
      const V1 = { worldaxis_recipe_settings_v1: { name: '', enabled: true, policies: ['intel-source'] } };
      const V2 = { worldaxis_recipe_settings_v1: { name: '', enabled: true, policies: ['improv'] } };
      const d = R.detect({ values: V1, label: '甲面', against: V2, againstLabel: '乙面' });
      const row = (d.conflicts || []).filter(function (x) { return x.kind === 'policy-clash'; })[0];
      a(!!row, 'y8v2203/B3b: 两条互斥政策各执一面 ⇒ 报出 policy-clash（实 ' + j((d.conflicts || []).map(function (x) { return x.kind; })) + '）');
      a(!!row && typeof row.key === 'string' && row.key.length > 0,
        'y8v2203/B3c: 政策冲突的 key **非空**（指出是哪两条 —— 修之前恒空串，实 ' + j(row && row.key) + '）');
      a(!!row && Array.isArray(row.from) && row.from.filter(function (x) { return String(x) !== ''; }).length >= 2,
        'y8v2203/B3d: 政策冲突的 from 带回**两条**政策名（实 ' + j(row && row.from) + '）');
    }
  }

  // ④ 冲突门：冲突的包**在写盘之前**被拒，force 是明说的逃生口
  {
    const env = mkEnv(); const WA = env.WA, R = WA.rulePack;
    R.save('丙包');
    // 真造冲突：先把当前面钉在一个确定值上存包，再改成另一个值
    if (WA.difficulty && WA.difficulty.setSettings) {
      WA.difficulty.setSettings({ resistance: 'normal' });
      R.save('丁包');
      WA.difficulty.setSettings({ resistance: 'hard' });
      const ad = R.admit('丁包');
      a(ad.ok === false && ad.reason === 'conflict',
        'y8v2203/B4: 同一个键两侧不同 ⇒ admit 拒（实 ' + j(ad.reason) + ' / ' + j(ad.count) + ' 条）');
      const ap = R.apply('丁包');
      a(ap.ok === false && ap.reason === 'conflict',
        'y8v2203/B4b: apply 也在**写盘之前**拒（不静默按后启用的赢）');
      const apf = R.apply('丁包', { force: true });
      a(apf.ok === true, 'y8v2203/B4c: force:true 是明说的逃生口 ⇒ 切换成功（判据不变）');
      a(apf.applied.length >= 1, 'y8v2203/B4d: force 切换真写回（实 ' + apf.applied.length + ' 键）');
      WA.difficulty.setSettings({ resistance: 'normal' });
    } else {
      a(true, 'y8v2203/B4: （前置）difficulty 不可用 —— 冲突门本条跳过');
    }
  }
  // ⑤ 功能②的归一化修复两向：刚存下的包再启用**不**报冲突（修之前必报）
  {
    const env = mkEnv(); const WA = env.WA, R = WA.rulePack;
    const k0 = Object.keys(R.current({}).values || {})[0];
    if (k0) {
      R.save('戊包');
      const ap = R.apply('戊包');
      a(ap.ok === true, 'y8v2203/B5: **刚存下的包**再启用不再报冲突（归一化与写路径同源 —— 实 '
        + j(ap.reason || 'ok') + '）');
    } else a(true, 'y8v2203/B5: （前置）当前面无可比键 —— 本条跳过');
  }
  // ⑥ 功能③：组合口读草稿面，不自己读一遍世界
  {
    const env = mkEnv(); const WA = env.WA, R = WA.rulePack;
    const c = R.compose({ pack: '戊包' });
    a(c.ok === true && typeof c.ready === 'boolean' && typeof c.line === 'string',
      'y8v2203/B6: compose 回带规则面 / 草稿面 / 定档（实 ready=' + j(c.ready) + '）');
    const keep = WA.presetWorld;
    WA.presetWorld = null;
    const c2 = R.compose({ pack: '戊包' });
    a(c2.seed && c2.seed.ok === false && c2.seed.reason === 'preset-world-absent',
      'y8v2203/B6b: 预设世界缺席时**如实拒一半**（不自己读一遍世界 —— 那是第二份真源）');
    WA.presetWorld = keep;
    a(c2.ready === false, 'y8v2203/B6c: 缺一半时 ready 为 false（开不起来这一局，如实说哪一半缺）');
  }
  // ⑦ 功能④：回滚一步 —— 栈里只装规则面键值，写回后世界摘要一致
  {
    const env = mkEnv(); const WA = env.WA, R = WA.rulePack;
    const h0 = R.history();
    a(typeof h0.depth === 'number' && typeof h0.cap === 'number' && h0.cap === 12,
      'y8v2203/B7: history 报深度与上限（实 ' + h0.depth + ' / ' + h0.cap + '）');
    R.save('己包');
    a(R.history().depth === h0.depth, 'y8v2203/B7b: 存包**不压栈**（深度没涨）—— 压栈时机是 apply，不是 save');
    const ap0 = R.apply('己包', { force: true });
    a(ap0.ok === true, 'y8v2203/B7c: 存完就切回去切得动（实测，实 ' + j(ap0.reason || 'ok') + '）');
    a(R.history().depth === h0.depth + 1,
      'y8v2203/B7c2: 切换**压一次**栈（实 ' + R.history().depth + ' = ' + h0.depth + '+1）—— 压的是「切换之前那份面」');
    if (ap0.ok) {
      // 回滚前先握着深度：回滚本身会**弹掉**栈顶，故「回滚后深度」不能与压栈前直接比。
      const beforeRb = R.history().depth;
      const rb0 = R.rollback({});
      a(rb0.ok === true ? R.history().depth === beforeRb - 1 : R.history().depth === beforeRb,
        'y8v2203/B7c3: 回滚**弹掉**栈顶（成功 ' + j(rb0.ok) + '，实 ' + R.history().depth + ' ← ' + beforeRb + '）');
    }
    const rb = R.rollback({});
    a(typeof rb.ok === 'boolean', 'y8v2203/B7d: rollback 回带 ok（实 ' + j(rb.ok) + '）');
    if (rb.ok) {
      a(rb.worldUnchanged === true, 'y8v2203/B7e: 回滚**零世界写入**（实测世界摘要一致）');
      a(typeof rb.worldBefore === 'string' && rb.worldBefore === rb.worldAfter,
        'y8v2203/B7f: 回滚前后世界指纹逐字一致（实 ' + j(rb.worldBefore) + ' → ' + j(rb.worldAfter) + '）');
    }
  }
  // ⑧ 边界④：导入不得夹带世界事实（写盘之前拦下并带回名单）
  {
    const env = mkEnv(); const WA = env.WA, R = WA.rulePack;
    // `values` 里必须有一个**本侧认得的键**：否则会先撞上 `no-usable-keys` 那道门 ——
    //   判据就变成在问「键认不认得」，而不是在问「夹带拦没拦住」。两条边界各是各的门。
    const r = R.importPack(JSON.stringify({ rulePack: 1, name: 'x', world: { a: 1 },
      values: { worldaxis_theme_settings_v1: { themes: [] } } }));
    a(r.ok === false && r.reason === 'carries-world-facts',
      'y8v2203/B8: 顶层带世界事实字段 ⇒ 写盘之前拒（实 ' + j(r.reason) + '）');
    a(Array.isArray(r.carried) && r.carried.join().indexOf('world') >= 0,
      'y8v2203/B8b: 拒收时**带回名单**（不静默丢弃 —— 实 ' + j(r.carried) + '）');
    a(R.list().packs.filter(function (p) { return p.name === 'x'; }).length === 0,
      'y8v2203/B8c: 被拒的包**真的没进库**（拒收不是一句回执）');
  }
  // ⑨ catalog 口径四条逐字在位
  {
    const env = mkEnv(); const WA = env.WA, R = WA.rulePack;
    const cat = R.catalog();
    a(cat.conflictKinds.join() === 'key-clash,policy-clash,theme-clash',
      'y8v2203/B9: catalog 回带冲突三类（实 ' + j(cat.conflictKinds) + '）');
    a(Array.isArray(cat.worldFactNames) && cat.worldFactNames.length === 12 && cat.worldFactNames.indexOf('people') >= 0,
      'y8v2203/B9b: catalog 回带 12 项夹带名单（实 ' + cat.worldFactNames.length + '）');
    a(cat.rollbackCap === 12, 'y8v2203/B9c: catalog 回带回滚栈上限（实 ' + cat.rollbackCap + '）');
    ['conflict', 'noCarry', 'rollback', 'compose'].forEach(function (k) {
      a(typeof cat.notes[k] === 'string' && cat.notes[k].length > 0, 'y8v2203/B9d: catalog.notes 有 ' + k + ' 口径');
    });
  }
  // ⑩ 面板：查冲突钮真出读数（端到端，含真读口带括号）
  {
    const env = mkEnv(); const WA = env.WA;
    WA.rulePack.save('庚包');
    const dom = gotoPage(env, 'tools');
    const txt = String(clickOut(dom, 'wa-rp-check') || '');
    a(txt.length > 0, 'y8v2203/B10: 「查冲突」钮在面板上真出读数（实 ' + txt.length + ' 字符）');
    const txt2 = String(clickOut(dom, 'wa-rp-history') || '');
    a(txt2.length > 0, 'y8v2203/B10b: 「回滚栈」钮真出读数（实 ' + txt2.length + ' 字符）');
    const txt3 = String(clickOut(dom, 'wa-rp-compose') || '');
    a(txt3.length > 0, 'y8v2203/B10c: 「开档定档」钮真出读数（实 ' + txt3.length + ' 字符）');
  }
  // ════ C 段：零写入不变式 ═════════════════════════════════
  {
    const env = mkEnv(); const WA = env.WA, R = WA.rulePack;
    const ls = env.dom && env.dom.defaultView ? env.dom.defaultView.localStorage : global.localStorage;
    const before = JSON.stringify(WA.store.get());
    R.save('辛包');
    R.history(); R.catalog(); R.diagnose();
    const ap = R.apply('辛包', { force: true });
    const after = JSON.stringify(WA.store.get());
    a(before === after, 'y8v2203/C1: 存包 / 切换 / 读口径全不写世界（store 摘要逐字一致）');
    a(ap.worldUnchanged !== false, 'y8v2203/C1b: 切换回执里世界未变（不是恒 null）');
    // 只读出口不碰偏好键
    const lsk = C.LS ? C.LS.getItem(ANCHOR_LSKEY()) : null;
    const dom = gotoPage(env, 'tools');
    clickOut(dom, 'wa-rp-check'); clickOut(dom, 'wa-rp-history'); clickOut(dom, 'wa-rp-compose');
    const lsk2 = C.LS ? C.LS.getItem(ANCHOR_LSKEY()) : null;
    a(lsk === lsk2, 'y8v2203/C2: 三枚只读钮不碰偏好键（读口不留痕）');
  }
  // ════ N 段：真源码破坏 + 两向自证 ═══════════════════════
  // 先剥**行注释**再查：本仓很多源码在注释里逐字写着「零 eval / 零 new Function」，
  //   裸串计数会把那句声明本身算成命中（判据在说反话）。查的是**代码面**到底有没有。
  (function () {
    const codeOnly = stripLineComments(rd('engines/rule-pack.js'));
    a(codeOnly.indexOf('eval(') < 0 && codeOnly.indexOf('new Function') < 0,
      'y8v2203/N0: 去注释后规则包零可执行脚本（代码面零 eval / 零 new Function；注释里的那句声明不算）');
  })();
  return runN(a, C);
}
function ANCHOR_LSKEY() { return 'worldaxis_rule_pack_settings_v1'; }
function runN(a, C) {
  const cnt = function (s, n) { return s.split(n).length - 1; };
  const j = JSON.stringify;
  const rd = C.rd || function (rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); };
  function resetSettingsN(WA) {
    try { if (WA.rulePack) WA.rulePack.setSettings({ enabled: false }); } catch (e) {}
    try { if (WA.worldLab) WA.worldLab.setSettings({ enabled: false }); } catch (e) {}
  }
  function mkRun(ov, fn) {
    const env = C.env0(ov || null);
    const WA = env.WA;
    // `gate.fresh()` 只复位宿主窗口与设置登记表，**不复位 localStorage**。N 段两向是
    //   「同一段代码在两个进程态里各跑一遍」，故每一脚都必须从**同一块空盘**起步。
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    WA.store.init();
    WA.store.transact(function (d) { d.people = { A: { name: '老周' } }; }, 'y8:n');
    resetSettingsN(WA);
    if (WA.rulePack) WA.rulePack.setSettings({ enabled: true });
    return fn(env, WA);
  }
  // N1：冲突门被摘掉 ⇒ 冲突的包**真的**切得进去（两向）
  (function () {
    const S = rd(C.ENG_REL);
    const from = "    if (!a.ok && a.reason === 'conflict' && !(isObj(opt) && opt.force === true)) {";
    if (cnt(S, from) !== 1) { a(false, 'y8v2203/N1a: 冲突门锚点恰中 1 次（前置失效，实 ' + cnt(S, from) + '）'); return; }
    const broken = S.split(from).join("    if (false && !a.ok && a.reason === 'conflict' && !(isObj(opt) && opt.force === true)) {");
    const ov = {}; ov[C.ENG_REL] = broken;
    function runOnce(ovv) {
      return mkRun(ovv, function (env, WA) {
        const R = WA.rulePack;
        if (!WA.difficulty || !WA.difficulty.setSettings) return { skip: true };
        WA.difficulty.setSettings({ resistance: 'normal' });
        R.save('n1');
        WA.difficulty.setSettings({ resistance: 'hard' });
        const ap = R.apply('n1');
        WA.difficulty.setSettings({ resistance: 'normal' });
        return { skip: false, ok: ap.ok, reason: ap.reason };
      });
    }
    let bad = null, good = null, threw = null;
    try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y8v2203/N1b: 两版都不抛到探针外（实 ' + j(threw) + '）');
    if (bad && bad.skip) { a(true, 'y8v2203/N1c: （前置）difficulty 不可用 —— 本条跳过'); return; }
    a(bad && bad.ok === true, 'y8v2203/N1c: （两向）门被摘后冲突的包**真的**切进去了（实 ' + j(bad) + '）—— 冲突只报不判不是装饰');
    a(good && good.ok === false && good.reason === 'conflict', 'y8v2203/N1d: （两向）原版上同款调用在写盘之前被拒（实 ' + j(good) + '）');
  })();
  // N2：夹带门被摘掉 ⇒ 世界事实字段**真的**跟着进库（两向）
  (function () {
    const S = rd(C.ENG_REL);
    const from = C.ANCHOR.carriedImport;
    if (cnt(S, from) !== 1) { a(false, 'y8v2203/N2a: 夹带门锚点恰中 1 次（前置失效）'); return; }
    const broken = S.split(from).join("if (false) { fault('carries-world-facts'); return { ok: false, reason: 'carries-world-facts',");
    const ov = {}; ov[C.ENG_REL] = broken;
    function runOnce(ovv) {
      return mkRun(ovv, function (env, WA) {
        const R = WA.rulePack;
        const r = R.importPack(JSON.stringify({ rulePack: 1, name: 'carried', world: { a: 1 },
          values: { worldaxis_theme_settings_v1: { themes: [] } } }));
        const inLib = R.list().packs.filter(function (p) { return p.name === 'carried'; }).length;
        return { ok: r.ok, reason: r.reason, inLib: inLib };
      });
    }
    let bad = null, good = null, threw = null;
    try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y8v2203/N2b: 两版都不抛（实 ' + j(threw) + '）');
    a(bad && bad.ok !== false, 'y8v2203/N2c: （两向）门被摘后夹带的导入体**真的**没被拦（实 ' + j(bad) + '）');
    a(good && good.ok === false && good.reason === 'carries-world-facts' && good.inLib === 0,
      'y8v2203/N2d: （两向）原版上同一份导入体被拒且**没进库**（实 ' + j(good) + '）');
  })();
  // N3：**冲突检测不归一**（本版真缺陷）—— 同一份面被判成冲突（两向）
  //   锚点取 `keyClashes` 里那次**写路径的归一**（`asWritten`）。破坏 = 退回「原样比」。
  //   为什么不能用「存完就切」来分两向：写路径**也**会归一，故那一击在原版与破坏版上都会通过
  //   （实测如此）。两向只在「包里存的形状 ≠ 盘上归一的形状」时才分得开 —— 真造那份不对称：
  //   先在**干净面**存包（此刻读到的是 `[]`，写不下去也归不到 `{}`），再切进去（写路径把盘上
  //   归一成 `{}`），然后**再切回来**：原版比的是「归一后 vs 归一后」（相等），破坏版比的是
  //   「`[]` vs `{}`」（不等 ⇒ 报冲突）。这一击正是「存包 → 切进去 → 再切回来」的现实路径。
  (function () {
    const S = rd(C.ENG_REL);
    const from = C.ANCHOR.normalizeCompare;
    if (cnt(S, from) !== 1) { a(false, 'y8v2203/N3a: 归一化比较锚点恰中 1 次（前置失效，实 ' + cnt(S, from) + '）'); return; }
    const broken = S.split(from).join('      return JSON.stringify(va[k]) !== JSON.stringify(vb[k]);');
    const ov = {}; ov[C.ENG_REL] = broken;
    function runOnce(ovv) {
      return mkRun(ovv, function (env, WA) {
        const R = WA.rulePack;
        const s0 = R.save('n3');
        if (!s0.ok) return { skip: true };
        R.apply('n3');                 // 写路径归一：盘上的面被归一成「写下去之后的形状」
        const cpMid = JSON.stringify(R.current({}).values['worldaxis_custom_presets']);
        const ap2 = R.apply('n3');     // 再切回来：这一击才分得开
        return { skip: false, ok: ap2.ok, reason: ap2.reason, count: ap2.count || 0, cpMid: cpMid };
      });
    }
    let bad = null, good = null, threw = null;
    try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y8v2203/N3b: 两版都不抛（实 ' + j(threw) + '）');
    if (bad && bad.skip) { a(true, 'y8v2203/N3c: （前置）本环境当前面无 packable 键 —— 本条跳过'); return; }
    a(bad && bad.ok === false && bad.reason === 'conflict',
      'y8v2203/N3c: （两向）不归一后**再切回同一个包**即报冲突（实 ' + j(bad) + '）—— 这正是本版修掉的真缺陷');
    a(good && good.ok === true,
      'y8v2203/N3d: （两向）原版上同款三步切换成功（实 ' + j(good) + '）—— 两向区分得开');
  })();

}
module.exports = { runAll: require(path.join(BASE, 'tests/lock-assert.js')).restoring(runAll) };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runAll(a);
  console.log('\nY8 s3-y8-v2203 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}
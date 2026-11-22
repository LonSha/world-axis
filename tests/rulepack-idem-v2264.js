#!/usr/bin/env node
// WorldAxis tests/rulepack-idem-v2264.js — OPV6-9「重复切同档零写盘」幂等闸专锁（v2.264.0）
//
// 【要解决的玩家问题（一句话）】
//   同一个规则包连点两次「切到这个包」：结果一个字都没变，代价却照付 ——
//   回滚栈被无意义条目挤占（`MAX_HISTORY = 12`，塞满之后真要回的那一步会被丢最旧）、
//   `applies` 台账虚高、每键都重写一遍。本版在 `apply()` 的**冲突门之后、压栈之前**
//   加一道幂等闸：判据成立就**零写盘**跳过，并把这件事记成可数的一栏。
//
// 【判据是**两向**的，缺一条就会变成两种不同的坏事（本锁重点钉的就是这两条）】
//   · 只看名字（`cfg.active === p.name`）：用户手改过某个键之后，再点同一个包会被
//     **误跳过** —— 手改被静默吞掉，界面上与「切成功了」完全同形。这是本仓点名的
//     「最坏的一种静默」。N2 专门把这一形造出来（破坏版上可观测）。
//   · 只看值（`keyClashes(...).length === 0`）：「切走到 B，再切回 A」那一轮里，
//     标记还停在 B，而值恰好与 A 一致 ⇒ 会被**误判成幂等** —— 活跃标记永远跟不上，
//     `active` 变成一句空话。N3 专门钉这一形。
//   两向都成立才跳过；跳过时**不压栈、不写键、不动标记、applies 不涨**，只 `idemSkips++`。
//
// 【口径不许另造第二把尺】
//   值比较**复用** `keyClashes` / `asWritten`（与冲突检测同一个函数、同一次写路径归一）。
//   这里另写一份 `JSON.stringify` 比较会立刻分叉：归一规则一改，两处判据对同一份面给出
//   不同答案，而分叉的表现是「幂等偶尔不生效」—— 又是静默失效。A3 静态钉住这件事。
//
// 【本锁四段】A 静态契约 / B 运行时与两向判据 / C 零写盘不变式 / N 真源码破坏 + 两向自证。
//   N 段纪律（本仓 H5/H6）：负控制走**真源码破坏**（锚点恰中 1 次）→ 在**破坏副本**上
//   重跑**同款真判据** → 原版上同判据必须真（否则「两向」只是单方面的一厢情愿）；
//   破坏锚点字面量在 SELF 里只准出现一次（只许写在 ANCHOR 声明处）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const ENG_REL = 'engines/rule-pack.js';
const PANEL_REL = 'ui/panel.js';
const SELF_REL = 'tests/rulepack-idem-v2264.js';
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
  // 闸门：两向判据的外层（名字这一向）
  gateOpen: "if ((cfg.active || '') === p.name) {",
  // 值这一向：复用 keyClashes（同一把尺）
  idemDiff: "const idemDiff = keyClashes(p.values, (snapNow && snapNow.values) || {}, '包', '当前面');",
  // 跳过分支（零写盘回执）
  idemSkip: "if (!idemDiff.length) {",
  idemReturn: "return { ok: true, name: p.name, idempotent: true, applied: [], failed: [],",
  idemNote: "note: '幂等跳过：当前面已与这一包逐键一致",
  // 台账
  statField: 'idemSkips: 0,',
  statInc: '_stat.idemSkips++;',
  // 位置判据：闸必须在压栈**之前**、冲突门**之后**
  pushed: "const pushed = pushHistory('apply', cfg);",
  admitBlock: "if (!a.ok && a.reason === 'conflict' && !(isObj(opt) && opt.force === true)) {",
  // 口径面
  catNote: "idempotent: '重复切同档是**零写盘**的幂等跳过（不压栈、applies 不涨）",
  exportsFace: 'diagnose: diagnose, stat: statOf',
  // 面板回执分支
  panelRep: 'if (r.idempotent) return rpkOut(',
  // 闸门的注脚：这一句把「两向缺一不可」的理由写在源码里（口径与判据同处）
  rationale: '只看名字，用户手改过键会被误跳过'
};
const TGT = { gateOpen: ENG_REL, idemDiff: ENG_REL, idemSkip: ENG_REL, idemReturn: ENG_REL,
  idemNote: ENG_REL, statField: ENG_REL, statInc: ENG_REL, pushed: ENG_REL, admitBlock: ENG_REL,
  catNote: ENG_REL, exportsFace: ENG_REL, panelRep: PANEL_REL, rationale: ENG_REL };
const LSKEY = 'worldaxis_rule_pack_settings_v1';
const CP = 'worldaxis_custom_presets';
const DIFF = 'worldaxis_difficulty_settings_v1';

function runAll(assertFn) {
  require(path.join(BASE, 'tests/mock.js'));
  // 断言适配（与 tests/first-run-v2263.js 同规）：外部注入聚合器时**同时**自计数，
  //   两处读数必须一致 —— 这是 tools/smoke_mounted_2264.js 判「挂载漏跑」的唯一依据。
  //   为什么必须自计数：v2.263.0 踩过「独立绿、挂载漏」——某个分支提前 return 后，
  //   后半段判据静默不跑，而外部只看得到 rc=0。
  let pass = 0, fail = 0;
  const fails = [];
  const a = function (ok, name) {
    if (ok) { pass++; } else { fail++; fails.push(name); }
    if (typeof assertFn === 'function') assertFn(ok, name);
  };
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const P = rd(PANEL_REL), E = rd(ENG_REL), SELF = rd(SELF_REL);
  const Ec = stripLineComments(E), Pc = stripLineComments(P);
  function env0(ov) { return gate.fresh(ov ? { srcOverride: ov } : {}); }
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
    if (!b || typeof b.onclick !== 'function') return null;
    b.onclick({ target: b });
    // 产品侧 `setOut` 写的是 **textContent**（不是 innerHTML）—— 读数面按它读。
    const o = dom.getElementById('wa-rp-out');
    return String(o ? (o.textContent || '') : '');
  }
  // ════ A 段：静态契约 ══════════════════════════════════════
  Object.keys(ANCHOR).forEach(function (k) {
    a(cnt(rd(TGT[k]), ANCHOR[k]) === 1,
      'v2264/A1: 锚点 ' + k + ' 在 ' + TGT[k] + ' 里恰中 1 次（实 ' + cnt(rd(TGT[k]), ANCHOR[k]) + '）');
  });
  (function () {
    const vals = Object.keys(ANCHOR).map(function (k) { return ANCHOR[k]; });
    const uniq = vals.filter(function (v, i) { return vals.indexOf(v) === i; });
    a(uniq.length === vals.length, 'v2264/A1b: 锚点值互不相同（' + uniq.length + ' / ' + vals.length + '）');
    const decl = SELF.slice(SELF.indexOf('const ANCHOR = {'), SELF.indexOf('\n};', SELF.indexOf('const ANCHOR = {')));
    a(cnt(decl, ':') >= 20, 'v2264/A1c: ANCHOR 表切片有效（实 ' + cnt(decl, ':') + ' 个冒号）');
    // H5 判据纯度：破坏锚点的字面量只准出现在声明处一次 —— N 段必须走 C.ANCHOR 取，
    //   不许把串再抄一遍（抄一遍之后「破坏的是不是判据所指那一处」就没人保证了）。
    const dup = Object.keys(ANCHOR).filter(function (k) { return cnt(SELF, ANCHOR[k]) !== 1; });
    a(dup.length === 0, 'v2264/A1f: 破坏锚点字面量在 SELF 里只出现 1 次（越界的：' + j(dup) + '）—— H5 判据纯度');
  })();
  // 位置：冲突门 → 幂等闸 → 压栈。顺序错了整件事就不成立（闸在冲突门之前会让冲突包静默跳过）。
  (function () {
    const iAdmit = E.indexOf(ANCHOR.admitBlock), iGate = E.indexOf(ANCHOR.gateOpen), iPushed = E.indexOf(ANCHOR.pushed);
    a(iAdmit > 0 && iGate > iAdmit, 'v2264/A2: 幂等闸在**冲突门之后**（实 ' + iAdmit + ' < ' + iGate + '）—— 否则冲突包会被静默跳过而不是被拒');
    a(iGate > 0 && iPushed > iGate, 'v2264/A2b: 幂等闸在**压栈之前**（实 ' + iGate + ' < ' + iPushed + '）—— 否则栈已占位，跳过就白跳了');
  })();
  // 同一把尺：闸里的值比较必须调 keyClashes（不得自造第二份比较逻辑）
  (function () {
    const seg = E.slice(E.indexOf(ANCHOR.gateOpen), E.indexOf(ANCHOR.pushed));
    a(seg.indexOf('keyClashes(') >= 0, 'v2264/A3: 闸内的值比较走 keyClashes（与冲突检测同一把尺，不另造第二份归一）');
    const segc = stripLineComments(seg);
    a(segc.indexOf('JSON.stringify') < 0, 'v2264/A3b: 去注释后闸内零 JSON.stringify 自造比较（否则归一规则一改就与冲突检测分叉）');
    a(segc.indexOf('asWritten(') < 0, 'v2264/A3c: 闸内不直接调 asWritten（归一留给 keyClashes 一处，闸只消费结论）');
  })();
  // 零写盘回执的形状：applied/failed 必须是**空数组**，marker 必须为真（跳过 ≠ 标记没动）。
  (function () {
    const seg = E.slice(E.indexOf(ANCHOR.idemReturn), E.indexOf(ANCHOR.idemNote));
    a(seg.indexOf('applied: []') >= 0 && seg.indexOf('failed: []') >= 0,
      'v2264/A4: 幂等回执的 applied / failed 是**空数组**（谎报写了几键是最糟的那种回执）');
    a(seg.indexOf('marker: true') >= 0, 'v2264/A4b: 幂等回执 marker:true（标记本来就在，不是「没写进去」）');
    a(seg.indexOf('idempotent: true') >= 0, 'v2264/A4c: 幂等回执带 idempotent:true（调用方看得出这次什么都没做）');
    const segFull = E.slice(E.indexOf(ANCHOR.gateOpen), E.indexOf(ANCHOR.pushed));
    a(segFull.indexOf('pushHistory(') < 0, 'v2264/A4d: 闸块内零 pushHistory 调用（跳过时栈一个字都不占）');
    a(segFull.indexOf('saveOrThrow(') < 0, 'v2264/A4e: 闸块内零 saveOrThrow（跳过时盘上一个字节都不写）');
    a(segFull.indexOf('saveSettings(') < 0, 'v2264/A4f: 闸块内零 saveSettings（活跃标记也不动 —— 它本来就指向这一包）');
    a(segFull.indexOf('_stat.applies++') < 0, 'v2264/A4g: 闸块内没有 applies++（台账不许虚高）');
  })();
  // 台账：可数。「不可数等于没发生」—— 与 detects/rolls 同一条纪律。
  a(cnt(E, ANCHOR.statField) === 1, 'v2264/A5: idemSkips 在 _stat 里声明恰 1 次');
  a(cnt(E, ANCHOR.statInc) === 1, 'v2264/A5b: idemSkips 在闸内自增恰 1 次');
  a(E.indexOf('Object.assign({}, _stat') > 0 && E.indexOf(ANCHOR.exportsFace) > 0,
    'v2264/A5c: idemSkips 经 statOf() 的 Object.assign 透出，且 stat 在导出面上（面板与专锁读同一栏）');
  // 口径：写在 catalog.notes 里，与 rollback 并列（同一份「本模块怎么保证」的清单）
  a(E.indexOf(ANCHOR.catNote) > 0, 'v2264/A6: catalog.notes.idempotent 口径逐字在位（回执与账面的说法同源）');
  a(E.indexOf(ANCHOR.rationale) > 0, 'v2264/A6b: 「只看名字会误跳过」这条理由写进源码（口径与判据同处，不靠回忆）');
  // 面板：幂等回执是**独立分支**，且排在「写回 N 键」之前（否则会报「已切到 X：写回 0 键」）
  (function () {
    const iRep = P.indexOf(ANCHOR.panelRep);
    const iApplied = P.indexOf('：写回 ' + "' + r.applied.length + ' 键");
    a(iRep > 0, 'v2264/A7: 面板有幂等回执分支');
    a(iApplied > iRep && iRep > 0, 'v2264/A7b: 幂等回执排在「写回 N 键」之前（实 ' + iRep + ' < ' + iApplied + '）');
    const iNotOk = P.indexOf("if (!r.ok) return rpkOut('未切换：' + r.reason, true);");
    a(iNotOk > 0 && iRep > iNotOk, 'v2264/A7c: 幂等回执在「未切换」之后（跳过不是拒收，但也不能反过来吞掉拒收）');
    const seg = P.slice(iRep, iApplied);
    a(seg.indexOf('幂等') >= 0 && seg.indexOf('未写盘') >= 0, 'v2264/A7d: 回执文案说得出「幂等 / 未写盘」（用户不该看到「写回 0 键」这种话）');
    a(Pc.indexOf(ANCHOR.panelRep) >= 0, 'v2264/A7e: 回执分支不是注释里的假声明（去注释后仍在）');
  })();
  // 去注释后的「零碰世界」纪律：闸块里不许出现 store / localStorage
  (function () {
    const segc = stripLineComments(E.slice(E.indexOf(ANCHOR.gateOpen), E.indexOf(ANCHOR.pushed)));
    a(segc.indexOf('store.transact(') < 0 && segc.indexOf('localStorage.setItem(') < 0,
      'v2264/A9: 闸块零世界写入、零 localStorage 直写（跳过就是跳过，不留痕）');
    a(segc.indexOf('idemSkips++') >= 0, 'v2264/A9b: 去注释后 idemSkips 自增仍在场（防自我指涉：判据不许把自己删掉）');
  })();
  // 执行面在场：apply / stat / history 三口（B 段全靠它们）
  a(Ec.indexOf('function apply(name, opt)') > 0 && Ec.indexOf('function statOf()') > 0,
    'v2264/A10: 去注释后 apply / statOf 仍在场');
  a(cnt(P, "on('#wa-rp-apply', () => {") === 1, 'v2264/A10b: 面板「切到这个包」绑定恰 1 处（回执挂在真入口上）');
  runRest(a, { env0: env0, gotoPage: gotoPage, clickOut: clickOut,
    P: P, E: E, ANCHOR: ANCHOR, TGT: TGT, ENG_REL: ENG_REL, PANEL_REL: PANEL_REL });
  return { pass: pass, fail: fail, fails: fails.slice() };
}
// ════ B 段：运行时与两向判据 ═════════════════════════════════
function runRest(a, C) {
  const env0 = C.env0, gotoPage = C.gotoPage, clickOut = C.clickOut;
  /**
   * 装一个「同一块空盘」起手的运行面。
   *   `gate.fresh()` 只复位宿主窗口与设置登记表，**不清 localStorage** ——
   *   不清的话上一条用例留下的包会漏进下一条，判据就被前一脚的残留证伪。
   */
  function mkEnv(ov) {
    const env = env0(ov || null);
    const WA = env.WA;
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    try { if (WA.rulePack) WA.rulePack.setSettings({ enabled: false }); } catch (e) {}
    WA.store.init();
    WA.store.transact(function (d) { d.people = { A: { name: '老周' } }; }, 'v2264:seed');
    if (WA.rulePack) WA.rulePack.setSettings({ enabled: true });
    return env;
  }
  // ① 导出面：判据要用的那一排都在
  {
    const env = mkEnv(); const R = env.WA.rulePack;
    ['apply', 'save', 'get', 'current', 'history', 'stat', 'getSettings', 'setSettings'].forEach(function (k) {
      a(typeof R[k] === 'function', 'v2264/B1: 导出面有 ' + k + '（函数）');
    });
    a(typeof R.stat().idemSkips === 'number', 'v2264/B1b: stat().idemSkips 是可数的数（实 ' + j(R.stat().idemSkips) + '）');
  }
  // ② 主判据：连切同档第二次**零写盘**跳过
  {
    const env = mkEnv(); const WA = env.WA, R = WA.rulePack;
    const s0 = R.save('甲包');
    a(s0.ok === true, 'v2264/B2: 存包成立（实 ' + j(s0.reason) + '）');
    const ap1 = R.apply('甲包');
    a(ap1.ok === true && ap1.idempotent !== true, 'v2264/B2b: 第一次切换**真的**写了（实 ' + j({ ok: ap1.ok, idem: ap1.idempotent }) + '）');
    const appliedN = (ap1.applied || []).length;
    const applies0 = R.stat().applies, depth0 = R.history().depth;
    a(appliedN > 0 && applies0 === 1 && depth0 === 1,
      'v2264/B2c: 第一次切换的代价如实记下（写 ' + appliedN + ' 键 / applies ' + applies0 + ' / 栈深 ' + depth0 + '）');
    const skips0 = R.stat().idemSkips;
    const ap2 = R.apply('甲包');
    a(ap2.ok === true && ap2.idempotent === true, 'v2264/B3: 第二次切换走幂等跳过（实 ' + j({ ok: ap2.ok, idem: ap2.idempotent }) + '）');
    a((ap2.applied || []).length === 0 && (ap2.failed || []).length === 0,
      'v2264/B3b: 跳过时 applied / failed 都是空（实 ' + j([(ap2.applied || []).length, (ap2.failed || []).length]) + '）');
    a(R.stat().applies === applies0, 'v2264/B3c: **applies 不涨**（实 ' + R.stat().applies + '，跳之前 ' + applies0 + '）');
    a(R.history().depth === depth0, 'v2264/B3d: **栈不占位**（实深 ' + R.history().depth + '，跳之前 ' + depth0 + '）—— 这才是这道闸存在的理由');
    a(R.stat().idemSkips === skips0 + 1, 'v2264/B3e: idemSkips 记了一笔（实 ' + R.stat().idemSkips + '）—— 不可数等于没发生');
    a(R.stat().lastReason === 'idempotent', 'v2264/B3f: lastReason 落到 idempotent（实 ' + j(R.stat().lastReason) + '）');
    a(String(ap2.note || '').indexOf('未压栈') >= 0 && String(ap2.note || '').indexOf('applies 不涨') >= 0,
      'v2264/B3g: 回执 note 说得出「未压栈 / applies 不涨」（实 ' + j(ap2.note) + '）');
    // 第三次、第四次同样跳过（不是「第二次恰好」）
    const ap3 = R.apply('甲包'), ap4 = R.apply('甲包');
    a(ap3.idempotent === true && ap4.idempotent === true && R.stat().applies === applies0
      && R.history().depth === depth0 && R.stat().idemSkips === skips0 + 3,
      'v2264/B3h: 连点四下：后三次全跳过、applies 与栈深一动不动（实 ' + j({ idem: [ap2, ap3, ap4].map(function (x) { return !!x.idempotent; }),
        applies: R.stat().applies, depth: R.history().depth, skips: R.stat().idemSkips }) + '）');
  }
  // ③ 反向一：名字同、值不同（用户手改过）⇒ **不许**跳过，必须如实拒 / 如实写
  {
    const env = mkEnv(); const WA = env.WA, R = WA.rulePack;
    const s0 = R.save('乙包');
    if (!s0.ok || !(WA.difficulty && WA.difficulty.setSettings)) {
      a(true, 'v2264/B4: （前置）本环境拿不到可漂移的键 —— 本条跳过（实 ' + j(s0.ok) + '）');
    } else {
      R.apply('乙包');
      const packed = R.get('乙包').values[DIFF];
      const cur = packed && packed.resistance;
      WA.difficulty.setSettings({ resistance: cur === 'hard' ? 'normal' : 'hard' });
      const ap = R.apply('乙包');
      a(ap.idempotent !== true,
        'v2264/B4: 手改过键之后再切同一个包 **不许**跳过（实 ' + j({ idem: ap.idempotent, reason: ap.reason }) + '）—— 否则手改被静默吞掉');
      a(ap.ok === false && ap.reason === 'conflict' && (ap.conflicts || []).length > 0,
        'v2264/B4b: 原版上这一击被冲突门明说拒收（实 ' + j({ ok: ap.ok, reason: ap.reason }) + '）');
      const apF = R.apply('乙包', { force: true });
      a(apF.ok === true && apF.idempotent !== true && (apF.applied || []).length > 0,
        'v2264/B4c: 带 force 时**真的**写回（实 applied ' + ((apF.applied || []).length) + '）—— 跳过与写回这两条路都还在');
      const back = R.current({}).values[DIFF];
      a(j(back) === j(packed), 'v2264/B4d: force 之后盘上回到包里的值（实 ' + j(back) + '）');
    }
  }
  // ④ 反向二：值同、名字不同（切走又切回）⇒ **不许**跳过，标记必须跟上
  {
    const env = mkEnv(); const WA = env.WA, R = WA.rulePack;
    R.save('丙包');
    R.apply('丙包');
    R.save('丁包');            // 同一份面，另起一个名字
    const apB = R.apply('丁包');
    a(apB.ok === true && apB.idempotent !== true && R.getSettings().active === '丁包',
      'v2264/B5: 切到同值的另一个包**真的**走了写路径（实 active ' + j(R.getSettings().active) + '）—— 值一样不等于幂等');
    const skips0 = R.stat().idemSkips;
    const apA = R.apply('丙包');
    a(apA.idempotent !== true, 'v2264/B5b: 再切回丙包**不许**跳过（实 ' + j({ idem: apA.idempotent, reason: apA.reason }) + '）—— 标记还停在丁包');
    a(R.getSettings().active === '丙包', 'v2264/B5c: 活跃标记跟上了（实 ' + j(R.getSettings().active) + '）—— 只看值会把它永远留在旧名字上');
    a(R.stat().idemSkips === skips0, 'v2264/B5d: 这两次都没有被记成「跳过」（实 ' + R.stat().idemSkips + '）');
  }
  // ⑤ 端到端：面板上连点两次「切到这个包」，回执第二次说「幂等跳过」
  {
    const env = mkEnv(); const WA = env.WA, R = WA.rulePack;
    R.save('戊包');
    const dom = gotoPage(env, 'tools');
    const el = dom.getElementById('wa-rp-name');
    a(!!el, 'v2264/B6: 面板上有包名输入框（没有它则下一条判据在空集上恒真）');
    if (el) {
      el.value = '戊包';
      const t1 = String(clickOut(dom, 'wa-rp-apply') || '');
      a(t1.length > 0 && t1.indexOf('写回') >= 0, 'v2264/B6b: 第一次点击的回执是「写回 N 键」（实 ' + j(t1.slice(0, 40)) + '）');
      const t2 = String(clickOut(dom, 'wa-rp-apply') || '');
      a(t2.indexOf('幂等') >= 0, 'v2264/B6c: 第二次点击的回执说「幂等跳过」（实 ' + j(t2.slice(0, 60)) + '）');
      a(t2.indexOf('写回') < 0, 'v2264/B6d: 第二次**不再**说「写回 N 键」（否则用户会以为又写了一遍）');
      a(String(dom.getElementById('wa-rp-out').textContent || '').indexOf('未切换') < 0,
        'v2264/B6e: 跳过不是拒收（回执里没有「未切换」）');
    }
  }
  // ⑤b 端到端：幂等闸**不许把回滚语义弄坏**（OPV6-9 计划原文两条要求必须同时成立）
  //   计划原文：「切档前自动存『切换前启用面』，一键回上档；重复切同档幂等」
  //   闸在压栈之前 return，于是「跳过一次之后按回滚」回的是哪一格必须现场验，
  //   不能靠推理 —— 若跳过偷偷占了栈位，回上档就会回到「什么都没变」的那一格。
  {
    const env = mkEnv(); const WA = env.WA, R = WA.rulePack;
    R.save('甲档');                       // 面 = 默认
    WA.difficulty.setSettings({ resistance: 'hard' });
    R.save('乙档');                       // 面 = hard
    WA.difficulty.setSettings({ resistance: 'normal' });   // 面回默认（= 甲档）
    const faceOf = function () { return j(R.current({}).values[DIFF]); };
    const faceA = faceOf(), faceB = j(R.get('乙档').values[DIFF]);

    const apA = R.apply('甲档');
    a(apA.ok === true && apA.idempotent !== true, 'v2264/B7a: （前置）切甲档真写一次（实 ' + j({ ok: apA.ok, idem: apA.idempotent }) + '）');
    a(R.current({}).active === '甲档', 'v2264/B7b: 活跃标记跟到甲档（实 ' + j(R.current({}).active) + '）');
    const apB = R.apply('乙档', { force: true });
    a(apB.ok === true && apB.idempotent !== true, 'v2264/B7c: 切乙档真写（实 ' + j({ ok: apB.ok, idem: apB.idempotent }) + '）');
    a(faceOf() === faceB, 'v2264/B7d: 盘上到乙档面（实 ' + faceOf() + '）');

    const depthBeforeRb = R.history().depth;
    const rb1 = R.rollback();
    a(rb1.ok === true && rb1.depthAfter === depthBeforeRb - 1,
      'v2264/B7e: 一键回上档退一格（实 ' + depthBeforeRb + ' → ' + j(rb1.depthAfter) + '）');
    a(faceOf() === faceA, 'v2264/B7f: 回上档回到切档前的面（实 ' + faceOf() + '，期望 ' + faceA + '）');
    a(R.current({}).active === '甲档', 'v2264/B7g: 回上档把活跃标记一起还原（实 ' + j(R.current({}).active) + '）—— 标记不跟着还原的话下一次切档判据就错');

    // 关键：重复切甲档 ⇒ 跳过，且**不占栈位**
    const depth0 = R.history().depth;
    const ap2 = R.apply('甲档');
    a(ap2.idempotent === true, 'v2264/B7h: （前置）这一击是幂等跳过（实 ' + j(ap2.idempotent) + '）');
    a(R.history().depth === depth0, 'v2264/B7i: 跳过不占栈位（实 ' + depth0 + ' → ' + R.history().depth + '）');
    // 跳过后再回滚：退的必须是**切乙档之前压的那一格**，而不是被跳过那格
    const rb2 = R.rollback();
    a(rb2.ok === true || rb2.reason === 'no-history',
      'v2264/B7j: 跳过后回滚不崩（实 ' + j({ ok: rb2.ok, reason: rb2.reason }) + '）');
    if (rb2.ok === true) {
      a(rb2.depthAfter === depth0 - 1, 'v2264/B7k: 跳过后回滚仍只退一格（实 ' + rb2.depthAfter + '，期望 ' + (depth0 - 1) + '）');
    } else {
      a(true, 'v2264/B7k: （栈已空，跳过不占位的另一种表现）');
    }
    // 连点五次：skip 涨 5，栈一格不涨（「塞满 12 格把真要回的那步挤掉」这条必须真的不发生）
    //   注意：上面那次 rollback 可能已把活跃标记还原成别的名字，所以先切一次让状态**稳定**
    //   （这一下可能真写，逐次计数会把它算进去 —— 判据只认「稳定之后连点五次」的增量）。
    R.apply('甲档');
    const ap0 = R.apply('甲档');
    a(ap0.idempotent === true, 'v2264/B7l0: （前置）稳定后切甲档是幂等（实 ' + j(ap0.idempotent) + '）');
    const d5 = R.history().depth, s5 = R.stat().idemSkips;
    for (let i = 0; i < 5; i++) R.apply('甲档');
    a(R.history().depth === d5 && R.stat().idemSkips === s5 + 5,
      'v2264/B7l: 连点五次只涨台账不涨栈（深 ' + d5 + '→' + R.history().depth + ' / skip ' + s5 + '→' + R.stat().idemSkips + '）');
  }
  // ⑥ C 段：零写盘不变式 —— 偏好键逐字不变、世界摘要逐字不变
  {
    const env = mkEnv(); const WA = env.WA, R = WA.rulePack;
    R.save('己包');
    R.apply('己包');
    const cfg0 = j(R.getSettings());
    const world0 = j(WA.store.get());
    const ls0 = global.localStorage ? global.localStorage.getItem(LSKEY) : null;
    const ap = R.apply('己包');
    a(ap.idempotent === true, 'v2264/C1: （前置）这一击确实是幂等跳过（实 ' + j(ap.idempotent) + '）');
    a(j(R.getSettings()) === cfg0, 'v2264/C1b: 设置族逐字不变（实测：跳过时一个字节都没写）');
    a((global.localStorage ? global.localStorage.getItem(LSKEY) : null) === ls0,
      'v2264/C1c: 偏好键原文逐字不变（不是「值等价」—— 是同一个串）');
    a(j(WA.store.get()) === world0, 'v2264/C1d: 世界摘要逐字不变（规则包本来就不碰世界，跳过更不碰）');
  }
  runN(a, { env0: env0, mkEnv: mkEnv, ENG_REL: C.ENG_REL, ANCHOR: C.ANCHOR, DIFF: DIFF });
}
// ════ N 段：真源码破坏 + 两向自证 ═══════════════════════════
function runN(a, C) {
  const ANCHOR = C.ANCHOR, ENG_REL = C.ENG_REL;
  /** 破坏一次：锚点必须**恰中 1 次**（H6 工具两向自证：不存在 / 不唯一都必须抛）。 */
  function breakOnce(src, anchor, replacement, tag) {
    const n = cnt(src, anchor);
    if (n !== 1) throw new Error(tag + ': 锚点须恰中 1 次（实 ' + n + '）—— 工具自证');
    return src.split(anchor).join(replacement);
  }
  function mkRun(ov, fn) {
    const env = C.mkEnv(ov);
    const WA = env.WA;
    return fn(env, WA);
  }
  /** 两向跑：破坏版 / 原版各跑一遍，**都包 catch**（负向探针不许异常逃逸成「后面全漏跑」）。 */
  function twoWay(ov, fn, tag) {
    let bad = null, good = null, threw = null;
    try { bad = mkRun(ov, fn); good = mkRun(null, fn); } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'v2264/' + tag + 'a: 两版都不抛到探针外（实 ' + j(threw) + '）');
    return { bad: bad, good: good };
  }
  // H6 工具自证（先证工具会拒，再拿它去拒别人）
  (function () {
    const S = rd(ENG_REL);
    let threw0 = null, threw1 = null;
    try { breakOnce(S, 'ZQ_NOT_IN_SOURCE_' + 'V2264', 'x', 'n0a'); } catch (e) { threw0 = String((e && e.message) || e); }
    try { breakOnce(S, 'function ', 'x', 'n0b'); } catch (e) { threw1 = String((e && e.message) || e); }
    a(threw0 !== null, 'v2264/N0: （工具自证）锚点不存在必须抛（实 ' + j(threw0) + '）—— 否则「破坏成功」是它自己说的');
    a(threw1 !== null, 'v2264/N0b: （工具自证）锚点不唯一必须抛（实 ' + j(threw1) + '）');
    a(breakOnce(S, ANCHOR.statInc, ANCHOR.statInc, 'n0c') === S,
      'v2264/N0c: （工具自证）等值替换不改源码 —— 破坏必须可观测地改行为，不能是空动作');
  })();
  // N1：闸门被摘 ⇒ 重复切同一包**真的**又写一遍（两向：原版跳过 / 破坏版不跳）
  (function () {
    const S = rd(ENG_REL);
    let broken = null;
    try { broken = breakOnce(S, ANCHOR.gateOpen, "if (false && (cfg.active || '') === p.name) {", 'n1'); }
    catch (e) { a(false, 'v2264/N1a: ' + String((e && e.message) || e)); return; }
    const ov = {}; ov[ENG_REL] = broken;
    const r = twoWay(ov, function (env, WA) {
      const R = WA.rulePack;
      R.save('n1');
      R.apply('n1');
      const a0 = R.stat().applies, d0 = R.history().depth;
      const ap = R.apply('n1');
      return { idem: ap.idempotent === true, applied: (ap.applied || []).length,
        appliesDelta: R.stat().applies - a0, depthDelta: R.history().depth - d0 };
    }, 'N1');
    a(r.bad && r.bad.idem === false && r.bad.applied > 0 && r.bad.appliesDelta === 1 && r.bad.depthDelta === 1,
      'v2264/N1b: （两向）闸被摘后重复切**真的**又写一遍并占一格栈（实 ' + j(r.bad) + '）');
    a(r.good && r.good.idem === true && r.good.applied === 0 && r.good.appliesDelta === 0 && r.good.depthDelta === 0,
      'v2264/N1c: （两向）原版上同款第二击零写盘、栈不变（实 ' + j(r.good) + '）—— 两向区分得开');
  })();
  // N2：值这一向被削掉（只看名字）⇒ **假幂等**：用户手改被静默吞掉
  //   破坏 = 把 `idemDiff` 恒置空数组（「名字对上就算幂等」）。这一形是本仓点名的
  //   「最坏的一种静默」：界面上与「切成功了」完全同形。
  //   ⚠ 这一击必须带 `force:true`：不带时冲突门（在本闸**之前**）会先把它明说拒收，
  //      于是「假幂等」根本走不到 —— 那证明的是 A2 的位置纪律，不是本闸的判据（实测如此）。
  //      手改过键 = 必然一条 key-clash，故 force 是这一形唯一能露头的入口。
  (function () {
    const S = rd(ENG_REL);
    let broken = null;
    try { broken = breakOnce(S, ANCHOR.idemDiff, 'const idemDiff = [];', 'n2'); }
    catch (e) { a(false, 'v2264/N2a: ' + String((e && e.message) || e)); return; }
    const ov = {}; ov[ENG_REL] = broken;
    const r = twoWay(ov, function (env, WA) {
      const R = WA.rulePack;
      if (!WA.difficulty || !WA.difficulty.setSettings) return { skip: true };
      const s0 = R.save('n2');
      if (!s0.ok) return { skip: true };
      R.apply('n2');
      const packed = R.get('n2').values[C.DIFF];
      const cur = packed && packed.resistance;
      WA.difficulty.setSettings({ resistance: cur === 'hard' ? 'normal' : 'hard' });
      const ap = R.apply('n2', { force: true });
      const now = R.current({}).values[C.DIFF];
      return { skip: false, idem: ap.idempotent === true, ok: ap.ok, reason: ap.reason,
        // 手改**还在盘上**（= 被跳过、没写回）：这就是「被吞掉」的可观测形态
        driftKept: j(now) !== j(packed), applied: (ap.applied || []).length };
    }, 'N2');
    if (r.bad && r.bad.skip) { a(true, 'v2264/N2b: （前置）本环境无漂移键 —— 本条跳过'); return; }
    a(r.bad && r.bad.idem === true && r.bad.driftKept === true && r.bad.applied === 0,
      'v2264/N2b: （两向）只看名字时 force 也被吞掉：手改之后**照样跳过**，盘上还是手改值（实 ' + j(r.bad) + '）—— 假幂等');
    a(r.good && r.good.idem === false && r.good.applied > 0 && r.good.driftKept === false,
      'v2264/N2c: （两向）原版上同一击**真的**写回、盘上回到包里的值（实 ' + j(r.good) + '）—— 静默 vs 真写，两向分得开');
  })();
  // N3：名字这一向被削掉（只看值）⇒「切走又切回」被误判成幂等，活跃标记永远跟不上
  //   破坏 = 把闸门条件写成恒真。可观测缺陷：**连第一次切换都被跳过**（包本来就是从当前面存的），
  //   于是活跃标记从头到尾是空串 —— `active` 这句声明在闸下退化成一句空话。
  (function () {
    const S = rd(ENG_REL);
    let broken = null;
    try { broken = breakOnce(S, ANCHOR.gateOpen, 'if (true) {', 'n3'); }
    catch (e) { a(false, 'v2264/N3a: ' + String((e && e.message) || e)); return; }
    const ov = {}; ov[ENG_REL] = broken;
    const r = twoWay(ov, function (env, WA) {
      const R = WA.rulePack;
      R.save('na');
      const first = R.apply('na');
      R.save('nb');                 // 同一份面，另一个名字
      R.apply('nb');
      const ap = R.apply('na');     // 切回来：值一致、标记本该是 nb
      return { idem: ap.idempotent === true, firstSkipped: first.idempotent === true,
        active: R.getSettings().active, ok: ap.ok };
    }, 'N3');
    a(r.bad && r.bad.firstSkipped === true && r.bad.idem === true && r.bad.active === '',
      'v2264/N3b: （两向）只看值时**连第一次切换**都被跳过 —— 活跃标记从头到尾是空的（实 ' + j(r.bad) + '）');
    a(r.good && r.good.firstSkipped === false && r.good.idem === false && r.good.active === 'na',
      'v2264/N3c: （两向）原版上第一次真写、切回来也真写、标记跟上（实 ' + j(r.good) + '）');
  })();
}
// 导出面：**先装宿主桩，再捕获 global.window**。
//   为什么不能直接 `restoring(runAll)`：`restoring` 在**调用前**捕获 `global.window` 并
//   在 finally 写回。而本锁的 `mock.js` 是在 `runAll` 体内才 require 的（直跑时它先设
//   `global.window = global`）—— 于是「独立跑第二次」（tools/smoke_mounted_2264.js 的两向
//   比对）会捕获到 `undefined` 再把它写回去，第三次调用 `core/clock.js` 就死在
//   `window.WorldAxis` 上（实测：Cannot read properties of undefined）。
//   解法：包一层，**先把 mock 装上**（幂等，require 走缓存）再捕获/还原 —— 与 run.js
//   「开头就 require ./mock.js」同序，宿主全局仍不靠顺序活着。
function safeRunAll(a) {
  try { require(path.join(BASE, 'tests/mock.js')); } catch (e) {}
  const win = global.window;
  try { return runAll(a); } finally { global.window = win; }
}
module.exports = { runAll: safeRunAll };
if (require.main === module) {
  // 直跑（`node tests/rulepack-idem-v2264.js`）：外部聚合器只负责**打印失败的**，
  //   计数一律以 runAll 的自计数为准 —— 两处读数不一致就直接判红（挂载漏跑的形态）。
  let ext = 0;
  const r = runAll(function (ok, name) { ext++; if (!ok) console.log('FAIL ' + name); });
  if (ext !== r.pass + r.fail) {
    console.log('FAIL 计数不一致：外部 ' + ext + ' / 自计数 ' + (r.pass + r.fail));
    process.exit(1);
  }
  console.log('\nOPV6-9 rulepack-idem-v2264 ' + r.pass + ' / 失败 ' + r.fail);
  process.exit(r.fail > 0 ? 1 : 0);
}
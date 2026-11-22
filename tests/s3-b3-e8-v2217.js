'use strict';
// WorldAxis tests/s3-b3-e8-v2217.js (v2.217.0) — N6 持久条件自动化（schedule.*）专锁
//
// 钉的是否定式核心（与 E7 同族，但调度面是**新面**，不许与 template.* 混收）：
//   ① **落盘**：调度台账挂在 settingsBus 数据键 `worldaxis_rule_pack_schedule_v1`
//      （optional:true，与 gen-gate __DATA 同规），used/lastRound/lastAt 跨刷新保留；
//   ② **按轮次**：`round % every === 0` 才到期；`lastRound === round` 同轮不重跑
//      （already-ran 如实记，不静默丢）；轮次读不到 ⇒ no-round，**绝不退回墙上时间**；
//   ③ **只读动作**：仍走 ACTIONS 封闭词表（零 eval/Function/require）；本面零 store 写；
//   ④ **未到期不执行**：due()/run() 都如实给 not-due，不把没到期的当作跑过；
//   ⑤ **预算跨刷新**：budget 用尽 ⇒ budget-exhausted（读的是落盘游标，不是内存清零）；
//   ⑥ **坏形状拒收**：set 整批判（有一条不合法整批拒），run 在无行时报 no-templates；
//   ⑦ **默认关**：enabled:false 时 set/run/reset 全拒 disabled（与 template 面同纪律）。
//
// 与 E7 锁的关系：E7 钉 template.*（内存态），本锁钉 schedule.*（落盘态）——
//   两条路并存、不许互相替代，也都不新增第二套世界写入路径。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const synthHost = require('./synth-host.js');
const REL = 'engines/rule-pack.js';
const SCHED_KEY = 'worldaxis_rule_pack_schedule_v1';

function readOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function srcOf() { return readOf(REL); }

function fakeLS() {
  const m = Object.create(null);
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    _dump: function () { return m; }
  };
}
/** 与 E7 同规格合成宿主：真 settingsBus / store / inputGuard + 真引擎读口桩。 */
function hostWith(src, extra, opts) {
  const o = opts || {};
  const c = synthHost.negativeContext({});
  const __ls = fakeLS();
  c.window.localStorage = __ls;
  vm.runInContext(readOf('core/settings-bus.js'), c, { filename: 'core/settings-bus.js' });
  vm.runInContext(readOf('core/store.js'), c, { filename: 'core/store.js' });
  vm.runInContext(readOf('core/input-guard.js'), c, { filename: 'core/input-guard.js' });
  vm.runInContext(src, c, { filename: REL });
  const WA = c.window.WorldAxis;
  try { WA.store.init(); } catch (e) { /* 已初始化 */ }
  if (o.regs !== false) {
    WA.__settingsRegs = (WA.__settingsRegs || []).concat([
      { key: 'worldaxis_theme_settings_v1', def: { themes: [] }, module: 'theme' },
      { key: 'worldaxis_rules_settings_v1', def: { strict: false }, module: 'rules' },
      { key: 'worldaxis_orphan_settings_v1', def: { x: 1 }, module: 'notInWhitelist' }
    ]);
  }
  if (extra) extra(WA);
  WA.mainWin = c.window;
  WA.mainDoc = c.window.document;
  return WA;
}
/** 真引擎读口桩：动作词表逐字对齐。 */
function ENGINES(WA) {
  WA.rehearsal = { preview: function () { return { ok: true, id: 'pv_1' }; } };
  WA.pendingCenter = { items: function () { return { ok: true, items: [] }; } };
  WA.worldHealth = { summary: function () { return { ok: true, score: 88 }; } };
  WA.perfBaseline = { bands: function () { return { ok: true, bands: [] }; } };
  WA.atlas = { view: function () { return { ok: true, places: [] }; } };
}
/** 轮次真源桩：evolution.roundOf 读 store 里的 meta.round。 */
function ROUND(WA, r) {
  if (!WA.evolution) WA.evolution = {};
  WA.evolution.roundOf = function () { return r; };
}

let passed = 0, failed = 0;
function a(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.log('  ✗ ' + msg); }
}
function run() {
  // ── A 段：导出面与数据键 ──
  const WA = hostWith(srcOf(), ENGINES);
  a(WA.rulePack && typeof WA.rulePack.schedule === 'object', 'A1: schedule.* 已导出为对象');
  const S = WA.rulePack.schedule;
  a(['list', 'set', 'due', 'run', 'reset', 'stat', 'scopeKey'].every(function (k) { return typeof S[k] === 'function'; }),
    'A2: schedule 七个口齐（list/set/due/run/reset/stat/scopeKey）');
  const reg = (WA.__settingsRegs || []).find(function (r) { return r.key === SCHED_KEY; });
  a(!!reg, 'A3: 数据键 worldaxis_rule_pack_schedule_v1 已登记');
  a(reg && reg.optional === true, 'A4: 数据键 optional:true（缺席是正常态，不是幽灵键）');
  a(reg && reg.def === null, 'A5: 数据键 def:null（与 gen-gate __DATA 同规）');

  // ── B 段：默认关 ──
  const WA2 = hostWith(srcOf(), ENGINES);
  WA2.rulePack.setSettings({ enabled: false });
  const S2 = WA2.rulePack.schedule;
  const b1 = S2.set([{ id: 'x', action: 'atlas.view', every: 1, budget: 1 }]).reason;
  const b2 = S2.run({ round: 1 }).reason;
  const b3 = S2.reset().reason;
  a(b1 === 'disabled' && b2 === 'disabled' && b3 === 'disabled',
    'B1: enabled:false 时 set/run/reset 全拒 disabled（实: ' + [b1, b2, b3].join(',') + '）');

  // ── C 段：登记与清单（落盘）+ 整批判 ──
  const WA3 = hostWith(srcOf(), ENGINES);
  WA3.rulePack.setSettings({ enabled: true });
  const S3 = WA3.rulePack.schedule;
  const set1 = S3.set([
    { id: 's-a', action: 'atlas.view', every: 1, budget: 2 },
    { id: 's-b', action: 'pending.sweep', every: 3, budget: 1 }
  ]);
  a(set1.ok === true && set1.accepted === 2, 'C1: 两行合法登记 accepted=2');
  const list1 = S3.list();
  a(list1.ok && list1.rows.length === 2 && list1.rows[0].id === 's-a' && list1.rows[1].id === 's-b',
    'C2: list 按登记序回两行');
  const bad = S3.set([
    { id: 's-ok', action: 'atlas.view', every: 1, budget: 1 },
    { id: 's-bad', action: 'nope', every: 1, budget: 1 }
  ]);
  a(bad.ok === false && bad.reason === 'unknown-action', 'C3: 有一条非法 ⇒ 整批拒 unknown-action（半套不落地）');
  const list1b = S3.list();
  a(list1b.rows.length === 2, 'C4: 整批拒后原两行仍在（拒收不改设置）');
  // 落盘证据：settingsBus 数据键有值（跨刷新保留的载体）
  const raw = WA3.settingsBus.read({ key: SCHED_KEY, module: 'rulePack', optional: true, def: null });
  a(raw && Array.isArray(raw.rows) && raw.rows.length === 2 && typeof raw.rows[0].used === 'number',
    'C5: 台账真落盘（settingsBus 读回 rows[].used 已初始化为数）');

  // ── D 段：按轮次 + 同轮去重 + 预算 ──
  const WA4 = hostWith(srcOf(), ENGINES);
  ROUND(WA4, 1);
  WA4.rulePack.setSettings({ enabled: true });
  const S4 = WA4.rulePack.schedule;
  S4.set([{ id: 'd-a', action: 'atlas.view', every: 2, budget: 3 }]);
  ROUND(WA4, 2);   // 2 % 2 === 0 ⇒ 到期
  const r1 = S4.run({});
  a(r1.ok === true && r1.ran === 1 && r1.alreadyRan === 0 &&
    r1.trace[0] && r1.trace[0].ok === true && r1.trace[0].used === 1,
    'D1: round=2（every=2 到期）跑 1 次，trace used=1（实 ran=' + r1.ran + ' already=' + r1.alreadyRan + '）');
  const r1b = S4.run({});   // 同轮再跑 ⇒ already-ran
  a(r1b.ok === true && r1b.ran === 0 && r1b.alreadyRan === 1 && r1b.trace[0] && r1b.trace[0].reason === 'already-ran',
    'D2: 同轮重复调用 ⇒ already-ran（lastRound 落盘去重，做过就是做过）');
  ROUND(WA4, 3);   // 3 % 2 !== 0 ⇒ not-due
  const r2 = S4.run({});
  a(r2.ok === true && r2.ran === 0 && r2.notDue === 1 && r2.trace[0] && r2.trace[0].reason === 'not-due',
    'D3: round=3（every=2 未到期）⇒ not-due，不执行（实 ran=' + r2.ran + ' notDue=' + r2.notDue + '）');
  // 跨轮推进：3 不是 2 的倍数，4 是
  ROUND(WA4, 4);
  const r3 = S4.run({});
  a(r3.ok === true && r3.ran === 1 && r3.trace[0].used === 2, 'D4: round=4 再跑一次（used 累计到 2，预算跨轮保留）');
  ROUND(WA4, 6);
  const r4 = S4.run({});
  a(r4.ok === true && r4.ran === 1 && r4.trace[0].used === 3, 'D5: round=6 跑满预算（used=3=budget）');
  ROUND(WA4, 8);
  const r5 = S4.run({});
  a(r5.trace[0] && r5.trace[0].reason === 'budget-exhausted',
    'D6: 预算用尽 ⇒ budget-exhausted（如实记，不是静默跳过）');
  a(r4.persisted === true && (r4.writeReason === null || r4.writeReason === undefined),
    'D7: run 回执带 persisted:true / writeReason 空（落盘没失败）');

  // ── E 段：no-round 与 scope ──
  const WA5 = hostWith(srcOf(), ENGINES);
  ROUND(WA5, undefined);   // roundOf 返回 undefined ⇒ 拒 no-round
  WA5.rulePack.setSettings({ enabled: true });
  const S5 = WA5.rulePack.schedule;
  S5.set([{ id: 'e-a', action: 'atlas.view', every: 1, budget: 1 }]);
  const e1 = S5.due({}).reason;
  const e2 = S5.run({}).reason;
  a(e1 === 'no-round' && e2 === 'no-round',
    'E1: 轮次读不到 ⇒ due/run 全拒 no-round（绝不拿墙钟冒充轮次）（实: ' + e1 + ',' + e2 + '）');
  const s1 = S5.scopeKey();
  a(typeof s1 === 'string' && s1.length > 0, 'E2: scopeKey 返回非空字符串');

  // ── F 段：零世界写入（调度面只调读口；store 零 transact）──
  const WA6 = hostWith(srcOf(), ENGINES, { regs: false });
  ROUND(WA6, 2);
  WA6.rulePack.setSettings({ enabled: true });
  const S6 = WA6.rulePack.schedule;
  S6.set([{ id: 'f-a', action: 'worldHealth.check', every: 2, budget: 1 }]);
  const txBefore = WA6.store.txStat ? WA6.store.txStat().committed : null;
  const f1 = S6.run({});
  a(f1.ok === true && f1.ran === 1, 'F1: 调度 run 正常执行只读动作');
  const txAfter = WA6.store.txStat ? WA6.store.txStat().committed : null;
  a(txBefore !== null && txAfter === txBefore,
    'F2: 调度 run 全程零 store transact（只读观测，不写世界状态）（committed: ' + txBefore + ' → ' + txAfter + '）');

  // ── 负向段：真源码破坏 + 两向自证 ──
  const SRC = srcOf();
  const CASES = [
    // N1: 删掉「轮次读不到拒收」⇒ 轮次未知时不再 no-round
    { n: 1, why: 'N1: 轮次读不到 ⇒ 不再拒收（改成拿默认值）⇒ no-round 边界消失',
      from: "    if (n === null) return { ok: false, reason: 'no-round' };\n    const g = schedRead();",
      to: "    if (false) return { ok: false, reason: 'no-round' };\n    const g = schedRead();",
      probe: function (__src) {
        const W = hostWith(__src, ENGINES);
        W.rulePack.setSettings({ enabled: true });
        return W.rulePack.schedule.due('不是数').reason;
      },
      want: 'no-round' },
    // N2: 删掉同轮去重 ⇒ 同轮再跑真的执行
    { n: 2, why: 'N2: 同轮去重被删 ⇒ 同轮重复事件又执行一遍（改为不判 lastRound）',
      from: "      if (t.lastRound === n) {\n        already++;\n        trace.push({ id: t.id, action: t.action, ok: false, reason: 'already-ran', round: n });\n        continue;\n      }",
      to: "      if (false) {\n        already++;\n        trace.push({ id: t.id, action: t.action, ok: false, reason: 'already-ran', round: n });\n        continue;\n      }",
      probe: function (__src) {
        const W = hostWith(__src, ENGINES);
        ROUND(W, 2);
        W.rulePack.setSettings({ enabled: true });
        const S = W.rulePack.schedule;
        S.set([{ id: 'n2', action: 'atlas.view', every: 1, budget: 3 }]);
        S.run({});
        const second = S.run({});
        return second.trace[0] && second.trace[0].reason;
      },
      want: 'already-ran' },
    // N3: 未到期判据被折成「恒到期」⇒ not-due 消失
    { n: 3, why: 'N3: `round % every` 被改成恒 0 ⇒ 未到期也照跑（not-due 边界消失）',
      from: "      if (n % t.every !== 0) {\n        notDue++;\n        trace.push({ id: t.id, action: t.action, ok: false, reason: 'not-due', round: n, every: t.every });\n        continue;\n      }",
      to: "      if (false) {\n        notDue++;\n        trace.push({ id: t.id, action: t.action, ok: false, reason: 'not-due', round: n, every: t.every });\n        continue;\n      }",
      probe: function (__src) {
        const W = hostWith(__src, ENGINES);
        ROUND(W, 3);
        W.rulePack.setSettings({ enabled: true });
        const S = W.rulePack.schedule;
        S.set([{ id: 'n3', action: 'atlas.view', every: 2, budget: 3 }]);
        const r = S.run({});
        return r.trace[0] && r.trace[0].reason;
      },
      want: 'not-due' }
  ];
  CASES.forEach(function (cs) {
    const hits = SRC.split(cs.from).length - 1;
    a(hits === 1, 'e8/N0(' + cs.n + '): 破坏锚点恰中 1 次（实 ' + hits + '）');
    if (hits !== 1) return;
    const broken = SRC.split(cs.from).join(cs.to);
    a(broken !== SRC, 'e8/Na(' + cs.n + '): 破坏真的改动了源码文本');
    const same = function (x, y) { return JSON.stringify(x) === JSON.stringify(y); };
    let got = null;
    try { got = cs.probe(broken); } catch (e) { got = 'THREW ' + e.message; }
    a(!same(got, cs.want), 'e8/Nb(' + cs.n + '): 破坏可观测地改动了行为（实 ' + JSON.stringify(got) + '）');
    let okSet = null;
    try { okSet = cs.probe(SRC); } catch (e) { okSet = 'THREW ' + e.message; }
    a(same(okSet, cs.want), 'e8/Nc(' + cs.n + '): 原版上同款判据为真（实 ' + JSON.stringify(okSet) + '）');
  });

  console.log('E8 s3-b3-e8-v2217 ' + passed + ' / 失败 ' + failed);
  process.exitCode = failed ? 1 : 0;
}
run();
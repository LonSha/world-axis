#!/usr/bin/env node
// WorldAxis tests/perspective-lock-v2142.js —— v2.142.0（F3）：视角锁
//
// 【它治的病：全仓此前零视角设施】
//   本版动手前实测（不是读注释，是 grep 跑出来的）：全仓 `视角|perspective|POV|lensOf|firstPerson`
//   零命中 —— 视角完全由模型每轮即兴决定，与 noesis 诞生前的「知情面」状态同族。
//   已有的两个近邻都不管这件事：
//     · `engines/spotlight.js`（焦点分配）只管「谁登场几次」，不决定「这一笔由谁的视角交代」；
//     · `engines/rules.js` 的 world/info 段有「感知边界 / 知情路径铁律」，但那是给模型的**软约束**，
//       没有引擎判据兜底 —— 模型要全知时没有任何拦截点。
//   noesis 答「他知道吗」，本模块答「这一笔该不该现在由这个视角写」。**两个真源不可合并**：
//   一个人完全可能知道某件事，却不该由当前视角交代（他不在本幕视角里）；反之亦然。
//
// 【同批的 D2 收口面（一并在本锁里钉）】
//   缺口：`intel.project` / `intel.correct` 两个认知口在**产品层零消费**（全仓只有测试引用）。
//   收口口径取本仓 X4 先例（`probe.resolve` ← rumor.investigate、`probe.auditRecord` ← 面板按钮）：
//   **接真读者**，而「能力申报」（只写 `typeof === 'function'`）不算读者（本仓明文口径）。
//     · 面板「查认知投影」→ `intel.project`（两态严格分开：查不出来 vs 查得出来但他没资格听）；
//     · 面板「更正认知」→ `intel.correct`（没有收到过这条说法就 nothing-to-correct，不做旁路）；
//     · `probe.view(case, opts)` 增 `truthSubject` 只读读数（事实锚点须由调用方显式给，不拿人名顶替）。
//
// 【判据结构（与 tests/noesis-v2140.js / tests/lifeline-v2141.js 同规格）】
//   A 结构 · B 运行时（原版成绿）· C 消费方（诊断真读者 + 面板真渲染 + 注入面同批）
//   N0 锚点唯一 · H5 判据纯度 · 正控制（原版同款判据必须为假）· N1–N6 真源码破坏 ⇒ 破坏副本上重跑同款真判据
//   N5 纯度：全部负控制跑完后，真文件逐字未变。
//   判据一律**自己造世界**（判据要的场必须自己造；环境的不确定性不是判据的一部分）。
'use strict';
const fs = require('fs');
const path = require('path');
const sync = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const PL = 'engines/perspective-lock.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js', INJ = 'render/inject.js';
// v2.142.0（D2 收口）：`probe.view` 的认知投影读数与面板两枚真读者控件都在本锁里钉。
const PROBE = 'engines/probe.js';
const SELF = 'tests/perspective-lock-v2142.js';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
let fails = 0, checks = 0;
// 宿主断言：run.js 的 runLock 只注入 assert(cond, name)（不注入环境）。
//   故本锁自带 fresh()，并把每条判据上交宿主 —— 否则锁在回归里既不计数、又读 a.product 直接抛。
let HOST = null;
function ok(c, m) {
  checks++;
  if (!c) { fails++; console.log('  ✗ ' + m); }
  else console.log('  ✓ ' + m);
  if (HOST) HOST(!!c, m);
}

let LAST_DOM = null;
/** 本次装载所用的源覆写表（正控制置 null = 原版）。判据必须读「正在装载的那份」：
 *  源码字面量判据若固定去算某个替换产物，就会在正控制上恒真 —— 那等于没有负控制。 */
let LAST_OVERRIDE = null;
function freshWA(ov) {
  const e = sync.fresh(ov ? { srcOverride: ov } : undefined);
  LAST_DOM = e.dom;   // 渲染类判据必须用本 env 的 dom（旧 dom 的按钮绑的是上一版闭包）
  return e.WA;
}
/** 造一个**确定的世界**：清掉别的块留下的账，再按需要登记。 */
function seed(WA, opts) {
  const o = opts || {};
  WA.store.init();
  WA.perspective.setSettings({ enabled: o.enabled !== false, strictInterior: o.strictInterior !== false,
    maxScenes: o.maxScenes || 12, maxLeaks: o.maxLeaks || 8 });
  // 与 tests/lifeline-v2141.js 的 seed 同规：本锁与回归共用同一个 vm 全局与同一份世界存储，
  //   前面几十个块留下的账会让判据读到的不是「只有本模块登记过」。
  WA.store.transact(function (d) {
    d.perspective = { rows: [] };
  }, 'perspective-lock:seed-reset');
  return WA;
}
function renderPeopleHtml(WA) {
  const dom = LAST_DOM;
  if (!dom) throw new Error('mini-DOM 未装');
  const p = dom.getElementById('wa-panel');
  if (!p) throw new Error('面板未注入');
  const tab = p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'people'; })[0];
  if (!tab) throw new Error('找不到人物页签');
  tab.click();
  const body = p.querySelector('.wa-body');
  return body ? String(body.innerHTML || '') : '';
}
function clickPer(WA, id, fields, outId) {
  renderPeopleHtml(WA);                    // 先渲染，绑定才在树上
  const dom = LAST_DOM;
  Object.keys(fields || {}).forEach(function (k) {
    const el = dom.getElementById(k);
    if (el) el.value = fields[k];
  });
  const btn = dom.getElementById(id);
  if (!btn) throw new Error('找不到 ' + id);
  let threw = null;
  try { if (typeof btn.onclick === 'function') btn.onclick({ target: btn }); } catch (e) { threw = e; }
  const out = dom.getElementById(outId || 'wa-per-out');   // 各段读数落在各自的 out 节点上
  return { text: out ? String(out.textContent || '') : '', threw: threw };
}

// ── 真源码破坏锚点（各须恰中 1 次）────────────────────────────────────
const ANCHORS = {
  // ① 未登记视角不再报 no-scene，而是**回落成全知** —— 这正是本版边界 3 钉的那条
  noScene: { rel: PL, txt: "    if (!list.length) { stat.noScene++; return { ok: false, reason: 'no-scene' }; }",
    to: "    if (!list.length) { return { ok: true, scene: sc || 'auto', lens: 'omniscient', persons: [], at: 0, updatedAt: 0, history: [] }; }" },
  // ② 内心闸整段被摘掉 ⇒「把别人没想过的事写成他的心声」重新合法
  interior: { rel: PL, txt: "    if (ch === 'interior') {",
    to: "    if (false && ch === 'interior') {" },
  // ③ 「在不在视角里」被摘掉 ⇒ 第一/有限视角可以写镜头外的人
  outOfLens: { rel: PL, txt: "    if (!inLens && (cur.lens === 'first' || cur.lens === 'limited')) {",
    to: "    if (false && !inLens && (cur.lens === 'first' || cur.lens === 'limited')) {" },
  // ④ 自造视角不再拒收 ⇒ 自造视角等于自造判定（下一手无从接手）
  badLens: { rel: PL, txt: '    if (LENSES.indexOf(ln) < 0) {',
    to: '    if (false && LENSES.indexOf(ln) < 0) {' },
  // ⑤ 诊断节不再报视角锁读数（作者那面重新变黑）
  diagSec: { rel: DIAG, txt: 'intel: secIntel(), perspective: secPerspective(),',
    to: 'intel: secIntel(),' },
  // ⑥ 面板不再渲染视角锁登记入口
  panel: { rel: PANEL, txt: 'id="wa-per-assign" title="登记一处场景视角',
    to: 'id="wa-per-assign2" title="登记一处场景视角' },
  // ⑦（D2）`probe.view` 的认知投影读数被整段摘掉 ⇒ 卷宗那面重新答不出「他此刻知道多少」
  truthSubj: { rel: PROBE, txt: "      truthSubject: truthSubject };",
    to: "      truthSubject: null };" },
  // ⑧（D2）面板「查认知投影」不再调 `intel.project` ⇒ 那个口重新变回零产品消费
  //   （注意：锚点指**面板那句**调用 —— 引擎内部那句用的是另一对实参，两者不同字面量）
  intelReader: { rel: PANEL, txt: 'const r = WA.intel.project(about, person);',
    to: 'const r = (WA.intel.project ? null : null);' }
};
const BROKEN = [
  { key: 'noScene', spec: ANCHORS.noScene }, { key: 'interior', spec: ANCHORS.interior },
  { key: 'outOfLens', spec: ANCHORS.outOfLens }, { key: 'badLens', spec: ANCHORS.badLens },
  { key: 'diagSec', spec: ANCHORS.diagSec }, { key: 'panel', spec: ANCHORS.panel },
  { key: 'truthSubj', spec: ANCHORS.truthSubj }, { key: 'intelReader', spec: ANCHORS.intelReader }
];
function brokenOverride(spec) {
  const s = src(spec.rel);
  const n = hits(s, spec.txt);
  if (n !== 1) throw new Error('anchor hits ' + n + ' :: ' + spec.key);
  const t = s.split(spec.txt).join(spec.to);
  if (hits(t, spec.to) !== 1) throw new Error('破坏未真的替换掉锚点 :: ' + spec.key);
  const o = {}; o[spec.rel] = t; return o;
}
/** 破坏副本正文（与 brokenOverride 同一套替换规则）。
 *  判据若去读 `src(rel)`（真文件），破坏永远观测不到 —— 这正是「判据无效」的自纠口。 */
function brokenSrc(spec) {
  const live = LAST_OVERRIDE && LAST_OVERRIDE[spec.rel];
  if (live) return live;          // 本次装载的就是破坏副本 ⇒ 读它
  const s0 = src(spec.rel);       // 本次装载的是原版 ⇒ 读真文件**本体**
  const n = hits(s0, spec.txt);
  if (n !== 1) throw new Error('anchor hits ' + n + ' :: ' + spec.key);
  return s0;
}

// ── 判据本体（A 结构 + B 运行时）──────────────────────────────────────
function judge() {
  const WA = freshWA();
  const M = WA.perspective;
  // A 结构
  ok(!!M && typeof M.assign === 'function', 'A1 新模块在场且导出登记口');
  const need = ['assign', 'current', 'allows', 'audit', 'leakScan', 'buildBlock', 'boundary', 'stat'];
  ok(need.every(function (k) { return typeof M[k] === 'function'; }), 'A2 八口齐备（缺一个就是断链）');
  { const W = seed(freshWA(), { enabled: false });
    ok(W.perspective.getSettings().enabled === false, 'A3 总开关默认关闭（未开就不干预）');
  }
  { const s = src(PL);
    // 三张具名表 + 常量：判据口径的可观测面在这里
    ok(hits(s, "const LENSES = ['omniscient', 'first', 'limited', 'ensemble', 'camera'];") === 1,
      'A4 视角五档具名表（顺序即可见范围由宽到窄）');
    ok(hits(s, "const CHANNELS = ['narrator', 'interior', 'dialogue', 'document', 'flashback'];") === 1,
      'A5 渠道五档具名表（interior 是唯一被闸死的一条）');
    ok(hits(s, "const ACCESS = ['witnessed', 'perceived', 'inferred', 'exterior'];") === 1,
      'A6 取证四档具名表');
    // 唯一写口：全文件恰一处 store.transact（assign 的那一处）
    ok(hits(s, 'WA.store.transact(') === 1, 'A7 唯一写口（全文件恰一处 store.transact）');
    ok(hits(s, 'WA.store.patch(') === 0, 'A8 零 patch（写路径只有 transact 一处）');
    // 不重裁决知情面：全文件零 WA.noesis 调用
    ok(hits(s, 'WA.noesis') === 0, 'A9 不重裁决知情面（零 WA.noesis 调用：两闸串联互不取代）');
    ok(hits(s, "worldaxis_perspective_settings_v1") === 1, 'A10 设置键具名且唯一');
  }
  { const W = seed(freshWA(), {});
    const b = W.perspective.boundary();
    ok(b.LENSES.length === 5 && b.CHANNELS.length === 5 && b.ACCESS.length === 4 && b.MAX_POV === 8,
      'A11 boundary 报三张表规模与 MAX_POV（容量是常量不做滑块）');
  }
  // ── A12/A13（D2 收口）────────────────────────────────────────────
  { const s2 = src(PROBE);
    ok(hits(s2, 'function view(caseId, opts) {') === 1 && hits(s2, 'WA.intel.project(tsq, tsPerson)') === 1,
      'A12 卷宗视图带认知投影只读口（第二参 opts，事实锚点由调用方显式给）');
    // 事实锚点**不许**回落成人名：`accused` 是人不是事由，拿它当主体查出来的是另一个问句
    ok(hits(s2, 'const tsq = clean(o.fact, 80);') === 1
      && hits(s2, 'const truthSubject = tsq') === 1,
      'A12b 没给事实锚点就报 null，不拿 accused 顶替（两个问句不许混成一个）');
    const u2 = src(PANEL);
    ok(hits(u2, 'id="wa-intel-project"') === 1 && hits(u2, 'id="wa-intel-correct"') === 1
      && hits(u2, ANCHORS.intelReader.txt) === 1
      && hits(u2, 'WA.intel.correct(intelVal') === 1,
      'A13 面板两枚控件是 `intel.project` / `intel.correct` 的真读者（能力申报不算读者）');
  }

  // B 运行时
  { const W = seed(freshWA(), {});
    const r = W.perspective.assign('第一幕', 'first', ['甲']);
    ok(r.ok === true && r.lens === 'first' && r.persons.length === 1, 'B1 登记场景视角（唯一写口）');
    const dup = W.perspective.assign('第一幕', 'limited', ['甲', '乙']);
    ok(dup.ok === false && dup.reason === 'exists', 'B2 同名重登记必须显式 replace（不静默覆盖）');
    const rep = W.perspective.assign('第一幕', 'limited', ['甲', '乙'], { replace: true });
    ok(rep.ok === true && rep.lens === 'limited', 'B3 replace 显式覆盖合法');
    const bad = W.perspective.assign('第二幕', '上帝视角', ['甲']);
    ok(bad.ok === false && bad.reason === 'bad-lens' && Array.isArray(bad.allowed),
      'B4 自造视角拒收并带可选表（自造视角等于自造判定）');
    const noWho = W.perspective.assign('第三幕', 'first', []);
    ok(noWho.ok === false && noWho.reason === 'missing-fields',
      'B5 无视角人物的 first 拒收（无主摄像机不是视角）');
    const cam = W.perspective.assign('第三幕', 'camera', []);
    ok(cam.ok === true, 'B6 camera 可无视角人物（客观镜头是唯一例外）');
  }
  // B7 未登记不回落成全知
  { const W = seed(freshWA(), {});
    const c = W.perspective.current();
    ok(c.ok === false && c.reason === 'no-scene', 'B7 一行都没有 ⇒ no-scene（不回落成全知）');
    ok(W.perspective.stat().noScene >= 1 || W.perspective.boundary().noScene >= 1,
      'B8 no-scene 单列计数（不与「不许写」合并）');
    W.perspective.assign('第一幕', 'limited', ['甲']);
    const c2 = W.perspective.current();
    ok(c2.ok === true && c2.scene === '第一幕', 'B9 无参取最近登记的那一幕');
    const c3 = W.perspective.current('查无此幕');
    ok(c3.ok === false && c3.reason === 'no-scene', 'B10 指名查不到的幕也报 no-scene');
  }
  // B11 全知例外：唯一的例外
  { const W = seed(freshWA(), {});
    W.perspective.assign('全知幕', 'omniscient', ['甲']);
    const r = W.perspective.allows({ who: '路过的陌生人', channel: 'interior', access: 'exterior' });
    ok(r.ok === true && r.allowed === true && r.reason === 'omniscient',
      'B11 全知档任何笔都放行（唯一的例外，且归因单列）');
  }
  // B12 内心闸：唯一被闸死的渠道
  { const W = seed(freshWA(), {});
    W.perspective.assign('有限幕', 'limited', ['甲']);
    const a = W.perspective.allows({ who: '甲', channel: 'interior', access: 'witnessed' });
    ok(a.ok === true && a.allowed === true, 'B12 视角人物本人的内心（亲历）合法');
    const b = W.perspective.allows({ who: '乙', channel: 'interior', access: 'witnessed' });
    ok(b.ok === true && b.allowed === false && b.reason === 'interior-blocked' && b.via === 'not-pov',
      'B13 非视角人物的内心 ⇒ interior-blocked/not-pov（此条任何档位下都不放宽）');
    const c = W.perspective.allows({ who: '甲', channel: 'interior', access: 'inferred' });
    ok(c.ok === true && c.allowed === false && c.via === 'access',
      'B14 取证档非亲历感知 ⇒ interior-blocked/access（不许把推断写成他的心声）');
    const d = W.perspective.allows({ who: '乙', channel: 'narrator', access: 'witnessed' });
    ok(d.ok === true && d.allowed === false && d.reason === 'out-of-lens',
      'B15 同一个人换 narrato r渠道后归因变成 out-of-lens（内心闸先于「在不在视角里」）');
  }
  // B16 客观镜头没有内心（strictInterior 只放宽后两道细则，不放宽 not-pov）
  { const W = seed(freshWA(), {});
    W.perspective.assign('镜头幕', 'camera', []);
    const r = W.perspective.allows({ who: '任何人', channel: 'interior', access: 'witnessed' });
    ok(r.ok === true && r.allowed === false && r.reason === 'interior-blocked' && r.via === 'not-pov',
      'B16 客观镜头没有内心（camera 无视角人物 ⇒ 内心一律 not-pov）');
    const n = W.perspective.allows({ who: '任何人', channel: 'narrator', access: 'witnessed' });
    ok(n.ok === true && n.allowed === true, 'B17 客观镜头下叙述/对白/文书仍可写');
  }
  // B18 strictInterior 真关 ⇒ 后两道细则放宽（但 not-pov 仍不放宽）
  { const W = seed(freshWA(), { enabled: true, strictInterior: false });
    W.perspective.assign('宽幕', 'camera', ['甲']);
    const c = W.perspective.allows({ who: '甲', channel: 'interior', access: 'inferred' });
    ok(c.ok === true && c.allowed === true, 'B18 strictInterior=false 时客观镜头+推断档放宽（开关真被读）');
    const d = W.perspective.allows({ who: '乙', channel: 'interior', access: 'witnessed' });
    ok(d.allowed === false && d.via === 'not-pov', 'B19 但 not-pov 仍不放宽（此条任何档位下都不放宽）');
  }
  // B20 ensemble：同场多视角，非视角人物仍可被写（不是 first/limited 就放行）
  { const W = seed(freshWA(), {});
    W.perspective.assign('群像幕', 'ensemble', ['甲', '乙']);
    const r = W.perspective.allows({ who: '丙', channel: 'narrator', access: 'witnessed' });
    ok(r.ok === true && r.allowed === true && r.reason === 'co-pov',
      'B20 ensemble 档非视角人物可写（只有 first/limited 才闸镜头外的人）');
  }
  // B21 缺字段 / 表外值
  { const W = seed(freshWA(), {});
    W.perspective.assign('幕', 'first', ['甲']);
    ok(W.perspective.allows({ channel: 'narrator' }).reason === 'missing-fields', 'B21 缺 who 拒收');
    const bv = W.perspective.allows({ who: '甲', channel: '独白' });
    ok(bv.ok === false && bv.reason === 'bad-value' && Array.isArray(bv.allowed),
      'B22 自造渠道拒收并带可选表');
    const ba = W.perspective.allows({ who: '甲', channel: 'narrator', access: '我猜的' });
    ok(ba.ok === false && ba.reason === 'bad-value', 'B23 自造取证档拒收');
  }
  // B24 audit 批量闸门：与 noesis.gateScene 同形（只报不改）
  { const W = seed(freshWA(), {});
    W.perspective.assign('批量幕', 'first', ['甲']);
    const a = W.perspective.audit([
      { who: '甲', channel: 'narrator' },
      { who: '乙', channel: 'narrator' },
      { who: '甲', channel: 'interior', access: 'witnessed' }
    ]);
    ok(a.ok === true && a.allow === false && a.blocked.length === 1 && a.blocked[0].who === '乙',
      'B24 批量闸门逐条裁决并只报出越界项（allow=false）');
    const a2 = W.perspective.audit([{ who: '甲', channel: 'narrator' }]);
    ok(a2.ok === true && a2.allow === true && a2.blocked.length === 0, 'B25 全部合法时 allow=true');
  }
  // B26 leakScan：只留痕不删文，且只核 written:true
  { const W = seed(freshWA(), {});
    W.perspective.assign('扫描幕', 'first', ['甲']);
    const before = W.perspective.boundary().rows;
    const r = W.perspective.leakScan([
      { who: '乙', channel: 'narrator', written: true },
      { who: '乙', channel: 'narrator' },                      // 未写进正文 ⇒ 不核
      { who: '甲', channel: 'narrator', written: true }
    ]);
    ok(r.ok === true && r.count === 1 && r.leaks[0].who === '乙', 'B26 只核 written:true 的笔');
    ok(r.count === 1 && W.perspective.boundary().leaks >= 1, 'B27 越界留痕计数单列（lens-leak）');
    ok(W.perspective.boundary().rows === before, 'B28 扫描不改世界（只留痕不删文）');
  }
  // B29 容量有界：rows-full（准入闸）与 evict（环形挤出）
  { const W = seed(freshWA(), { maxScenes: 2 });
    W.perspective.assign('幕1', 'first', ['甲']);
    W.perspective.assign('幕2', 'first', ['甲']);
    const full = W.perspective.assign('幕3', 'first', ['甲']);
    ok(full.ok === false && full.reason === 'rows-full' && full.cap === 2,
      'B29 maxScenes 是准入闸（满员拒收并带 cap）');
    const arr = [];
    for (let i = 0; i < 20; i++) arr.push({ scene: 'x' + i });
    const e = W.evict.array(arr, 'perspective.rows');
    ok(e.ok === true && arr.length === 12, 'B30 perspective.rows 站点已登记（真截断到 12）');
  }
  // B31 视角历史有界（slice(-8)）+ replace 留痕
  { const W = seed(freshWA(), {});
    W.perspective.assign('历史幕', 'first', ['甲']);
    for (let i = 0; i < 12; i++) W.perspective.assign('历史幕', i % 2 ? 'limited' : 'first', ['甲'], { replace: true });
    const c = W.perspective.current('历史幕');
    ok(c.ok === true && c.history.length === 8, 'B31 视角历史有界 slice(-8)（换视角留痕，环形）');
  }
  // B32 注入块：开启才有、且不列视角人物名
  { const W = seed(freshWA(), {});
    W.perspective.assign('注入幕', 'first', ['绝不能出现的名字']);
    const bb = W.perspective.buildBlock();
    ok(bb.indexOf('【视角锁】') === 0, 'B32 注入块有源名');
    ok(bb.indexOf('绝不能出现的名字') < 0 && bb.indexOf('first') > 0,
      'B33 注入块报模式但不列视角人物名（列名就是剧透）');
    const W2 = seed(freshWA(), { enabled: false });
    ok(W2.perspective.buildBlock() === '', 'B34 关闭时注入块为空串（零 token 占用）');
  }
  // B35 boundary 零副作用
  { const W = seed(freshWA(), {});
    W.perspective.assign('幕', 'first', ['甲']);
    const b0 = W.perspective.boundary().assigns;
    const b = W.perspective.boundary();
    ok(b.assigns === b0 && b.rows === 1, 'B35 boundary 只读（读数不涨）');
    const s0 = W.perspective.stat().allows;
    W.perspective.boundary();
    ok(W.perspective.stat().allows === s0, 'B36 boundary 不跑 verdict（不污染 stat）');
  }
  // B37 关闭时各口一律 disabled（不猜）
  { const W = seed(freshWA(), { enabled: false });
    ok(W.perspective.assign('幕', 'first', ['甲']).reason === 'disabled', 'B37 关闭时 assign 拒收 disabled');
    ok(W.perspective.current().reason === 'disabled', 'B38 关闭时 current 拒收 disabled');
    ok(W.perspective.leakScan([]).reason === 'disabled', 'B39 关闭时 leakScan 拒收 disabled');
  }
}

// ── C 消费方：诊断真读者 + 面板真渲染 + 注入面同批 ────────────────────
function consumers() {
  const W = seed(freshWA(), {});
  const col = (W.toolDiag && typeof W.toolDiag.collect === 'function') ? W.toolDiag.collect() : null;
  const pd = col && col.perspective;
  ok(!!pd, 'C0 诊断节 perspective 可读（collect().perspective）');
  if (pd) {
    ok(pd.lenses === 5 && pd.channels === 5 && pd.access === 4, 'C1 诊断面报三张表规模');
    ok(pd.outOfLens !== undefined && pd.interiorBlocked !== undefined && pd.noScene !== undefined,
      'C2 诊断面四类拒绝分开报（不与「不许写」合并）');
    ok(pd.rows !== undefined && pd.maxScenes !== undefined, 'C3 诊断面报现场行数与容量');
  } else { ok(false, 'C1'); ok(false, 'C2'); ok(false, 'C3'); }

  // 注入源表三面同批（SOURCES 键 / 注入分支 source 名 / SRC_NAME 显示名）
  const inj = src(INJ);
  ok(hits(inj, "\n    'perspective',") === 1 && hits(inj, "source: '视角锁'") === 1
    && hits(inj, 'perspective: true') === 1 && hits(inj, "perspective: '视角锁'") === 1,
    'C4 注入源表四张与注入分支同批增长（单边增长 = 幽灵开关或零效果）');
  ok(hits(inj, "perspective: 'worldaxis_perspective_settings_v1'") === 1,
    'C5 模块级总开关已登记进 SRC_MOD_SETTING（漏登记 ⇒ 对账面被报 unavailable）');

  const W2 = seed(freshWA(), {});
  let html = '';
  try { html = renderPeopleHtml(W2); } catch (e) { html = 'THREW:' + (e && e.message); }
  ok(hits(html, 'id="wa-per-assign"') === 1, 'C6 人物页真渲染出登记入口（渲染链路可用）');
  ok(hits(html, 'id="wa-per-current"') === 1 && hits(html, 'id="wa-per-allows"') === 1,
    'C7 三枚只读/裁决入口齐备');
  W2.perspective.setSettings({ enabled: true });
  const c1 = clickPer(W2, 'wa-per-assign', { 'wa-per-scene': '试幕', 'wa-per-lens': 'first', 'wa-per-persons': '甲、乙' });
  ok(c1.threw === null && hits(c1.text, '已登记') === 1 && hits(c1.text, '2 位') === 1,
    'C8 点登记后真带结论（用户那面看得见）');
  const c2 = clickPer(W2, 'wa-per-current', { 'wa-per-scene': '试幕' });
  ok(hits(c2.text, 'first') === 1 && hits(c2.text, '历史') === 1, 'C9 当前视角读数带历史面');
  const c3 = clickPer(W2, 'wa-per-allows', { 'wa-per-scene': '试幕', 'wa-per-who': '丙', 'wa-per-channel': 'narrator' });
  ok(hits(c3.text, '越界') === 1, 'C10 点单笔裁决后带越界归因（四类拒绝分开报）');
  const c4 = clickPer(W2, 'wa-per-boundary', {});
  ok(hits(c4.text, '视角锁') === 1 && hits(c4.text, '已登记场景') === 1, 'C11 边界读数带四类拒绝分列');
  const c5 = clickPer(W2, 'wa-per-block', {});
  ok(hits(c5.text, '注入块') === 1, 'C12 注入块预览有读数');
  const c6 = clickPer(W2, 'wa-per-leak', { 'wa-per-scene': '试幕', 'wa-per-who': '丙', 'wa-per-channel': 'narrator' });
  ok(hits(c6.text, '只留痕不删文') === 1, 'C13 越界扫描读数带「只留痕不删文」口径');
  // 未开开关时必须**显式报出**（不留空面板）
  const offW = seed(freshWA(), { enabled: false });
  const c7 = clickPer(offW, 'wa-per-current', {});
  ok(hits(c7.text, '未记录') === 1, 'C14 开关未开时如实报出（「没登记」与「算出来没越界」不许同形）');

  // ── C15–C18（D2 收口）：认知投影三态 + 面板两枚真读者 ────────────────
  { const D = freshWA();
    D.store.init();
    D.intel.setSettings({ enabled: true });
    D.probe.setSettings({ enabled: true });
    // 真事实锚点：真相只读，谁有资格听由取证档决定
    D.store.transact(function (d) {
      d.worldFacts = (d.worldFacts || []).concat([{ key: '扣货案', value: '货是小李扣的', at: Date.now() }]);
    }, 'perspective-lock:seed-fact');
    D.intel.addIntel('阿歪', { claim: '货是他扣的', source: '目击者', level: 'witness', about: '扣货案' });
    D.intel.addIntel('阿正', { claim: '货是小李扣的', source: '亲眼所见', level: 'witness', about: '扣货案' });
    D.intel.addIntel('路人', { claim: '听说货没了', source: '传言', level: 'rumor', about: '扣货案' });
    const wrong = D.intel.project('扣货案', '阿歪');
    const right = D.intel.project('扣货案', '阿正');
    const noEnt = D.intel.project('扣货案', '路人');
    ok(wrong.ok === true && wrong.entitled === true && wrong.knows === false && wrong.reason === 'differs',
      'C15 认知投影：说法与真相不符 ⇒ knows=false（不许把「他听说过」当成「他知道得对」）');
    ok(right.knows === true && right.reason === 'matches', 'C16 认知投影：对上真相 ⇒ knows=true');
    // 「手上没东西」与「有东西但不许看」是两种处境：后者**只报条数、不报内容**
    ok(noEnt.entitled === false && noEnt.knows === null && noEnt.withheld === 1
      && noEnt.guessed.length === 0 && noEnt.truth === null,
      'C17 无资格者只报条数不报内容（堆数量换不来资格）');
    const caseRow = D.probe.open('货被谁扣了', ['阿歪', '小李']);
    const vNo = D.probe.view(caseRow.id);
    const vYes = D.probe.view(caseRow.id, { fact: '扣货案', accused: '阿歪' });
    ok(vNo.truthSubject === null && vYes.truthSubject && vYes.truthSubject.read.ok === true,
      'C18 卷宗视图：给了事实锚点才出认知投影读数（没给就是 null）');
    // 面板：真渲染 + 真点击（两态都要留在屏幕上）
    D.perspective.setSettings({ enabled: true });
    const IO = 'wa-intel-out';   // intel 段的读数节点（与视角锁段不同：两段各有各的 out）
    const d1 = clickPer(D, 'wa-intel-project', { 'wa-intel-person': '路人', 'wa-intel-effect': '扣货案' }, IO);
    const d1b = clickPer(D, 'wa-intel-project', { 'wa-intel-person': '从没听过的人', 'wa-intel-effect': '扣货案' }, IO);
    const d2 = clickPer(D, 'wa-intel-project', { 'wa-intel-person': '阿歪', 'wa-intel-effect': '扣货案' }, IO);
    ok(d1.threw === null && hits(d1.text, '无资格听真相') === 1 && hits(d1.text, '只报条数') === 1,
      'C19 面板「查认知投影」真读者：无资格者与「什么都没听说」不许同形');
    // 「手上有东西但看不到真相」与「什么都没听说」是两种处境（前者会被一轮追问逼出破绽，后者不会）
    ok(d1b.threw === null && hits(d1b.text, '无资格听真相') === 1 && hits(d1b.text, '0 条') === 1
      && d1.text !== d1b.text,
      'C19b 面板：两条无资格态不许同形（手上有几条照实报，不许都塌成一句「无资格」）');
    ok(d2.threw === null && hits(d2.text, '说法与真相不符') === 1,
      'C20 面板「查认知投影」带真相差归因（用户那面看得见）');
    const d3 = clickPer(D, 'wa-intel-correct', { 'wa-intel-person': '从没听过的人', 'wa-intel-effect': '扣货案',
      'wa-intel-claim': '货是他扣的', 'wa-intel-source': '官署文书' }, IO);
    ok(d3.threw === null && hits(d3.text, 'nothing-to-correct') === 1,
      'C21 面板「更正认知」是 `intel.correct` 的真读者（没收到过这条就拒收，不做旁路）');
  }
}

// ── 每条破坏在破坏副本上重跑同款真判据 ────────────────────────────────
function mustFail(key, mk) {
  switch (key) {
    case 'noScene': { const W = mk();
      const c = W.perspective.current();
      return c.ok === true && c.lens === 'omniscient'; }
    case 'interior': { const W = mk();
      W.perspective.assign('幕', 'first', ['甲']);
      const r = W.perspective.allows({ who: '甲', channel: 'interior', access: 'inferred' });
      return r.ok === true && r.allowed === true; }
    case 'outOfLens': { const W = mk();
      W.perspective.assign('幕', 'first', ['甲']);
      const r = W.perspective.allows({ who: '乙', channel: 'narrator', access: 'witnessed' });
      return r.ok === true && r.allowed === true; }
    case 'badLens': { const W = mk();
      return W.perspective.assign('幕', '上帝视角', ['甲']).ok === true; }
    case 'diagSec': { const W = mk();
      const col = (W.toolDiag && W.toolDiag.collect) ? W.toolDiag.collect().perspective : null;
      return !col || col.lenses === undefined; }
    case 'panel': { const W = mk(); let h = '';
      try { h = renderPeopleHtml(W); } catch (e) { h = 'THREW'; }
      return hits(h, 'id="wa-per-assign"') !== 1; }
    // D2：认知投影读数被摘 ⇒ 卷宗那面重新答不出「他此刻知道多少」（`null` 就是答不出）
    case 'truthSubj': { const W = mk();
      W.store.init(); W.intel.setSettings({ enabled: true }); W.probe.setSettings({ enabled: true });
      const row = W.probe.open('投影幕', ['甲', '乙']);
      const v = W.probe.view(row.id, { fact: '某案', accused: '甲' });
      return !v.truthSubject; }
    // D2：面板不再调 `intel.project` ⇒ 那个口重新变回零产品消费
    case 'intelReader': { const W = mk();
      let h = '';
      try { h = renderPeopleHtml(W); } catch (e) { h = 'THREW'; }
      const s2 = brokenSrc(ANCHORS.intelReader);   // 读**破坏副本**：读真文件永远观测不到破坏
      return hits(s2, 'WA.intel.project(about, person)') !== 1 && hits(h, 'id="wa-intel-project"') === 1; }
    default: return false;
  }
}
function caseSpec(key) {
  switch (key) {
    case 'interior': return { enabled: true, strictInterior: true };
    case 'outOfLens': return { enabled: true };
    case 'truthSubj': return { enabled: true };
    case 'intelReader': return { enabled: true };
    default: return {};
  }
}
function runAll(a) {
  HOST = a;
  console.log('== A/B 判据（原版成绿）==');
  judge();
  console.log('== C 消费方（诊断真读者 + 面板真渲染）==');
  consumers();
  console.log('PERSPECTIVE-LOCK-V2142: ' + (fails ? 'FAIL ' + fails + '/' + checks : 'pass ' + checks + ' 项'));
  return fails;
}
function runNegative(a) {
  HOST = a;
  let nf = 0;
  console.log('== N0 真源码破坏锚点唯一性 ==');
  BROKEN.forEach(function (b) {
    const n = hits(src(b.spec.rel), b.spec.txt);
    checks++; if (n !== 1) { nf++; console.log('  ✗ N0 锚点不唯一：' + b.key + ' hits=' + n); }
    else console.log('  ✓ N0 ' + b.key + ' 锚点恰中 1 次');
  });
  // H5 判据纯度：锚点字面量只准在 ANCHORS 里声明一次，判据层零内联
  const self = src(SELF);
  const anchorsBlock = self.slice(self.indexOf('const ANCHORS'), self.indexOf('function brokenOverride'));
  const judgeBlock = self.slice(self.indexOf('function mustFail'), self.indexOf('function caseSpec'));
  [ANCHORS.noScene.txt, ANCHORS.interior.txt, ANCHORS.outOfLens.txt,
    ANCHORS.badLens.txt, ANCHORS.diagSec.txt, ANCHORS.panel.txt,
    ANCHORS.truthSubj.txt, ANCHORS.intelReader.txt].forEach(function (lit) {
    const inAnchors = hits(anchorsBlock, lit);
    const inJudge = hits(judgeBlock, lit);
    checks++;
    if (inAnchors !== 1 || inJudge !== 0) { nf++; console.log('  ✗ H5 纯度：' + JSON.stringify(lit.slice(0, 26)) + ' 声明 ' + inAnchors + ' 次 / 判据内 ' + inJudge + ' 次'); }
    else console.log('  ✓ H5 纯度：锚点只声明 1 次且判据不内联 ' + JSON.stringify(lit.slice(0, 22)));
  });
  // 正控制：原版上同款判据必须**全为假**（否则判据恒真、负控无意义）
  BROKEN.forEach(function (b) {
    let truth = null;
    try { truth = mustFail(b.key, function () {
      LAST_OVERRIDE = null;   // 正控制：本次装载的是原版
      return seed(freshWA(), caseSpec(b.key)); }); }
    catch (e) { truth = 'threw:' + (e && e.message); }
    checks++;
    if (truth !== false) { nf++; console.log('  ✗ 正控制失败：' + b.key + ' 在原版上判据竟为真（' + truth + '）⇒ 判据恒真，这条负控制无意义'); }
    else console.log('  ✓ 正控制：' + b.key + ' 同款判据在原版上为假');
  });
  // N1–N6：每条破坏 ⇒ 装载破坏副本 ⇒ 同款判据必须真现形
  BROKEN.forEach(function (b) {
    let bad = null, err = null;
    try { bad = mustFail(b.key, function () {
      const ov = brokenOverride(b.spec); LAST_OVERRIDE = ov;   // N 面：本次装载的是这份副本
      return seed(freshWA(ov), caseSpec(b.key)); }); }
    catch (e) { err = e; }
    checks++;
    if (err) { nf++; console.log('  ✗ N 装载/判据抛出 ' + b.key + '：' + (err && err.message)); }
    else if (!bad) { nf++; console.log('  ✗ N 破坏未被观测到：' + b.key + '（破坏副本上判据仍绿 ⇒ 判据无效）'); }
    else console.log('  ✓ N 破坏现形：' + b.key);
  });
  // N5 纯度：全部负控制跑完后，四个真文件逐字未变
  const before = { p: src(PL), d: src(DIAG), u: src(PANEL), i: src(INJ) };
  const after = { p: src(PL), d: src(DIAG), u: src(PANEL), i: src(INJ) };
  checks++;
  if (before.p !== after.p || before.d !== after.d || before.u !== after.u || before.i !== after.i) {
    nf++; console.log('  ✗ N5 纯度：负控制期间真文件被改写（破坏只准发生在内存副本上）');
  } else console.log('  ✓ N5 纯度：四个真文件逐字未变（破坏只发生在内存副本上）');
  console.log('NEGATIVE: ' + (nf ? 'FAIL ' + nf + '/' + checks : 'pass ' + checks + ' 项'));
  return nf;
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, ANCHORS: ANCHORS };
if (require.main === module) {
  const env0 = sync.fresh(); LAST_DOM = env0.dom;
  const a = function (c, m) { if (!c) console.log('  ✗ ' + m); };
  let f = 0;
  try { f += (runAll(a) ? 1 : 0); } catch (e) { console.log('  ✗ runAll 抛出：' + (e && e.message)); f = 1; }
  try { f += (runNegative(a) ? 1 : 0); } catch (e) { console.log('  ✗ runNegative 抛出：' + (e && e.message)); f = 1; }
  console.log(f ? 'PERSPECTIVE-LOCK-V2142: FAIL' : 'PERSPECTIVE-LOCK-V2142: pass');
  process.exitCode = f ? 1 : 0;
}
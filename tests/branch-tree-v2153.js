#!/usr/bin/env node
// v2.153.0 RX6 专锁：多结局分支树 —— 分叉点账、悬空边拒收、可选走法至少两条、
//   预览**真交给 rehearsal**（不自己另立沙箱）、登记完立刻可回放、真改世界后如实不可回放、
//   两节点对比里「缺指纹 = unknown 而不是 diff」。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const REL = 'engines/branch-tree.js';
const SELF_REL = 'tests/branch-tree-v2153.js';

// 锚点一取「回放判据必须落在 match 上」：checkPreview 在世界已变时给的是
//   `{ ok:true, match:false }` —— 只看 `ok` 会把「预览已过期」读成「可以回放」。
const ANCHOR = "    if (!r || r.ok !== true || r.match !== true) {";
// 锚点二取「预览 id 的字段名」：rehearsal.preview 成功时给的是 `previewId`（不是 `id`）。
//   读错字段的后果不是「取不到值」，而是**登记了一个空 id 的预览** ——
//   replay 永远报 not-comparable，而树看上去一切正常（v2.153.0 实测到的形态）。
const ANCHOR2 = "        const pid = (r && (r.previewId || r.id)) || '';";

function countOcc(s, sub) { return s.split(sub).length - 1; }
function fresh(ov) { return sync.fresh(ov ? { srcOverride: ov } : undefined).WA; }
function ovOf(rel, src) { const o = {}; o[rel] = src; return o; }

function reset(WA) {
  WA.store.init();
  const st = WA.store.get();
  st.branchTree = { nodes: [] };
  st.meta = st.meta || {};
  st.meta.round = 1;
  if (WA.branchTree && WA.branchTree.reset) WA.branchTree.reset();
  WA.branchTree.setSettings({ enabled: true, maxNodes: 40, maxOptions: 6 });
  if (WA.rehearsal && WA.rehearsal.setSettings) WA.rehearsal.setSettings({ enabled: true });
}

const STEPS = [{ kind: 'wait', who: '甲', ms: 1000 }];

// ── A 结构面 ──────────────────────────────────────────────────────────
function runA(a) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  a(countOcc(src, ANCHOR) === 1, 'v2153/bt A1: 「回放判据落在 match」锚点恰中 1 次（实 ' + countOcc(src, ANCHOR) + '）');
  a(countOcc(src, ANCHOR2) === 1, 'v2153/bt A2: 「预览 id 取 previewId」锚点恰中 1 次（实 ' + countOcc(src, ANCHOR2) + '）');
  a(src.indexOf("WA.registerModule('engines/branch-tree.js'") >= 0, 'v2153/bt A3: 模块自报登记');
  a(src.indexOf('__settingsRegs = (WA.__settingsRegs || []).concat([__REG])') >= 0, 'v2153/bt A4: 设置键走 __settingsRegs 登记');
  // 预演必须真交给 rehearsal：自己另立沙箱 = 把「同一套准入」换成一句声明。
  a(src.indexOf('WA.rehearsal.preview(') >= 0 && src.indexOf('WA.rehearsal.checkPreview(') >= 0,
    'v2153/bt A5: 预演与回放检查都真交给 rehearsal');
  a(src.indexOf("reason: 'unknown-parent'") >= 0 && src.indexOf("reason: 'no-options'") >= 0,
    'v2153/bt A6: 悬空边与「一条走法」都在写账前拒收');
  const self = fs.readFileSync(path.join(BASE, SELF_REL), 'utf8');
  a(countOcc(self, ANCHOR) >= 1 && countOcc(self, ANCHOR2) >= 1, 'v2153/bt A7: 两个锚点在本文件里各至少引用 1 次');
  // A8–A12（v2.154.0 收口期补）：**写口的接线面**。v2.153.0 落地时只落了读口
  //   （tree/stat/compare），而 fork/choose/replay 在产品面**零调用点** —— 面板「分支树」页
  //   于是恒为空树，而全库所有门禁都是绿的（死子面把它归为 self-only，看着像「内部自用」）。
  //   判据只问「产品面有没有调用点」与「守卫表收没收」，不绑变量名、不绑实现形态。
  const panel = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
  const diag = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
  const Q = String.fromCharCode(34);
  a(panel.indexOf('WA.branchTree.fork(') >= 0, 'v2153/bt A8: 产品面有 fork 调用点（写口接线，v2.154.0 补）');
  a(panel.indexOf('WA.branchTree.choose(') >= 0, 'v2153/bt A9: 产品面有 choose 调用点（写口接线，v2.154.0 补）');
  a(panel.indexOf('WA.branchTree.replay(') >= 0, 'v2153/bt A10: 产品面有 replay 调用点（写口接线，v2.154.0 补）');
  ['wa-bt-fork', 'wa-bt-choose', 'wa-bt-replay'].forEach(function (id) {
    a(panel.indexOf('id=' + Q + id) >= 0, 'v2153/bt A11: 面板渲染了 ' + id);
    a(diag.indexOf(id) >= 0, 'v2153/bt A12: 守卫表登记了 ' + id);
  });
}

// ── B 运行时 ──────────────────────────────────────────────────────────
function runB(a) {
  const WA = fresh();
  reset(WA);
  const BT = WA.branchTree;
  a(!!BT && typeof BT.fork === 'function' && typeof BT.choose === 'function' && typeof BT.tree === 'function'
    && typeof BT.compare === 'function' && typeof BT.replay === 'function' && typeof BT.stat === 'function'
    && typeof BT.reset === 'function',
    'v2153/bt B1: 七个真出口在场');

  // B2 一条走法不叫分叉（那是流水账；deg=1 在本仓是「终点」的语义）
  const r0 = BT.fork({ round: 2, prompt: '只有一个走法', options: ['唯一'] });
  a(r0.ok === false && r0.reason === 'no-options' && r0.need === 2,
    'v2153/bt B2: 可选走法不足两条 ⇒ no-options（不登记度数为 1 的假节点）');
  a(BT.stat().faults['no-options'] === 1, 'v2153/bt B3: 拒收进 faults 分桶（可归因）');
  a(BT.stat().nodes === 0, 'v2153/bt B4: 拒收的那次没有留下节点（拒收是拒收，不是降级登记）');

  // B5 prompt 缺失 ⇒ missing-fields
  const r1 = BT.fork({ round: 2, options: ['左', '右'] });
  a(r1.ok === false && r1.reason === 'missing-fields' && r1.field === 'prompt',
    'v2153/bt B5: 无题面 ⇒ missing-fields（不说「不知道在选什么」也能登记）');

  // B6 父节点不存在 ⇒ 拒收（宁可拒收也不留一条悬空边）
  const r2 = BT.fork({ round: 2, prompt: '迷路的岔路', options: ['左', '右'], parent: '__不存在__' });
  a(r2.ok === false && r2.reason === 'unknown-parent', 'v2153/bt B6: 父节点不存在 ⇒ unknown-parent（不留悬空边）');

  // B7 正常登记 + 真预览
  const f1 = BT.fork({ round: 3, prompt: '要不要拦下那封信', options: ['拦', '放'], steps: STEPS });
  a(f1.ok === true && !!f1.id, 'v2153/bt B7: 分叉点登记成功（带 id）');
  a(!!(f1.preview && f1.preview.ok) && typeof f1.preview.id === 'string' && f1.preview.id.length > 0,
    'v2153/bt B8: 预演真跑并与节点绑定（预览 id 非空，实 ' + ((f1.preview && f1.preview.id) || '') + '）');
  a(!!f1.comparable && typeof f1.comparable.keys === 'number' && typeof f1.comparable.chars === 'number',
    'v2153/bt B9: 可比性摘要落账（keys/chars 是「同一份世界」的读数）');

  // B10 **登记完那一刻必须可回放**（v2.153.0 实测缺口：记账面没进指纹排除清单时恒 stale）
  const rp1 = BT.replay(f1.id);
  a(rp1.ok === true && rp1.previewId === f1.preview.id,
    'v2153/bt B10: 登记后立刻可回放（记账动作自己不算「世界变了」，实 ' + (rp1.ok ? 'ok' : rp1.reason + '/' + rp1.why) + '）');

  // B11 反向：真改世界之后必须**如实**不可回放（证明 B10 不是恒真）
  WA.store.transact(function (d) {
    d.worldFacts = d.worldFacts || [];
    d.worldFacts.push({ id: 'wf_bt1', key: 'k1', value: '真改了世界', scope: 'world', source: 'lock', at: 1 });
  }, 'v2153/bt:bump');
  const rp2 = BT.replay(f1.id);
  a(rp2.ok === false && rp2.reason === 'not-comparable' && rp2.why === 'stale-preview',
    'v2153/bt B11: 真改世界后回放如实拒收（why=stale-preview，实 ' + (rp2.why || rp2.reason) + '）');
  a(BT.stat().faults['not-comparable'] >= 1, 'v2153/bt B12: 不可回放进 faults 分桶');

  // B13 子节点：parent 命中 ⇒ 真出边
  const f2 = BT.fork({ round: 4, prompt: '接下来往哪走', options: ['东', '西'], parent: f1.id });
  a(f2.ok === true && f2.parent === f1.id, 'v2153/bt B13: 有父节点的分叉点登记成功');
  const t1 = BT.tree();
  a(t1.ok === true && t1.nodes.length === 2 && t1.edges.length === 1 && t1.roots === 1 && t1.dangling === 0,
    'v2153/bt B14: 树是 2 节点 / 1 边 / 1 根 / 0 悬空（实 ' + t1.nodes.length + '/' + t1.edges.length + '/' + t1.roots + '/' + t1.dangling + '）');

  // B15 记录实际选择 ⇒ 边带上「走的哪一条」
  const c1 = BT.choose(f1.id, '拦');
  a(c1.ok === true && c1.choice === '拦', 'v2153/bt B15: 实际选择落账');
  const t2 = BT.tree();
  a(t2.edges[0].via === '拦', 'v2153/bt B16: 边带出实际选择（via，实 ' + t2.edges[0].via + '）');

  // B17 选择不在登记表内 ⇒ 拒收且带出允许集（**不悄悄追加**：那会让「登记三条、实际走第四条」长得像正常分支）
  const c2 = BT.choose(f1.id, '第三条路');
  a(c2.ok === false && c2.reason === 'bad-value' && Array.isArray(c2.allowed) && c2.allowed.length === 2,
    'v2153/bt B17: 未登记的选择 ⇒ bad-value 且带出允许集');
  a(BT.tree().nodes.filter(function (n) { return n.id === f1.id; })[0].choice === '拦',
    'v2153/bt B18: 被拒的选择没有改写已登记的选择');

  // B19 不存在的节点
  const c3 = BT.choose('__没有这个点__', '左');
  a(c3.ok === false && c3.reason === 'not-found', 'v2153/bt B19: 选择落点不存在 ⇒ not-found');

  // B20 对比：同一节点 ⇒ 全 same（可比）
  const cmp1 = BT.compare(f1.id, f1.id);
  a(cmp1.ok === true && cmp1.rows.every(function (r) { return r.state === 'same'; }) && cmp1.differing === 0,
    'v2153/bt B20: 同一节点自比 ⇒ 三项全 same（可比，且没有差异）');

  // B21 对比：一边没有预览 ⇒ **unknown 而不是 diff**（没得比 ≠ 不一样）
  const cmp2 = BT.compare(f2.id, f1.id);
  a(cmp2.ok === false && cmp2.reason === 'not-comparable' && cmp2.rows.every(function (r) { return r.state === 'unknown'; }),
    'v2153/bt B21: 一侧无指纹 ⇒ not-comparable + 三项全 unknown（不报「全 same」冒充一模一样）');

  // B22 对比：不存在的节点 ⇒ not-found 且带出缺的那一侧
  const cmp3 = BT.compare('__无__', f1.id);
  a(cmp3.ok === false && cmp3.reason === 'not-found' && cmp3.missing.indexOf('__无__') >= 0,
    'v2153/bt B22: 对比对象不存在 ⇒ not-found 且指名缺哪一侧');

  // B23 无预览的节点回放 ⇒ not-comparable 且带你为什么没有预览
  const rp3 = BT.replay(f2.id);
  a(rp3.ok === false && rp3.reason === 'not-comparable' && typeof rp3.why === 'string' && rp3.why.length > 0,
    'v2153/bt B23: 没预演过的节点回放 ⇒ not-comparable（并说明 why）');

  // B24 rehearsal 缺席 ⇒ 预演登记如实标 absent（不假装预演过）
  {
    const keep = WA.rehearsal;
    try {
      WA.rehearsal = null;
      const r = BT.fork({ round: 5, prompt: '预演层缺席时的岔路', options: ['A', 'B'], steps: STEPS });
      a(r.ok === true && r.preview && r.preview.ok === false && r.preview.reason === 'rehearsal-absent',
        'v2153/bt B24: rehearsal 缺席 ⇒ 节点照登记但预览如实标 rehearsal-absent');
      const rp = BT.replay(r.id);
      a(rp.ok === false && rp.why === 'rehearsal-absent', 'v2153/bt B25: 该节点回放如实报 rehearsal-absent');
    } finally { WA.rehearsal = keep; }
  }

  // B26 容量：maxNodes 到顶即拒收（长局不许无界膨胀）
  reset(WA);
  BT.setSettings({ maxNodes: 2 });
  const x1 = BT.fork({ round: 1, prompt: '一', options: ['a', 'b'] });
  const x2 = BT.fork({ round: 2, prompt: '二', options: ['a', 'b'] });
  const x3 = BT.fork({ round: 3, prompt: '三', options: ['a', 'b'] });
  a(x1.ok === true && x2.ok === true && x3.ok === false && x3.reason === 'branches-full' && x3.cap === 2,
    'v2153/bt B26: 节点数到顶 ⇒ branches-full（带出 cap）');
  a(BT.stat().nodes === 2, 'v2153/bt B27: 被拒的第三条没有进账（实 ' + BT.stat().nodes + '）');

  // B28 选项数按 maxOptions 截断
  reset(WA);
  BT.setSettings({ maxOptions: 2 });
  const y1 = BT.fork({ round: 1, prompt: '四个走法', options: ['一', '二', '三', '四'] });
  a(y1.ok === true && y1.options === 2, 'v2153/bt B28: 走法数按 maxOptions 截断（实 ' + y1.options + '）');

  // B29 关闭态：五个面都拒收
  reset(WA);
  BT.setSettings({ enabled: false });
  const d1 = BT.fork({ round: 1, prompt: 'p', options: ['a', 'b'] });
  const d2 = BT.choose('x', 'a');
  const d3 = BT.tree();
  const d4 = BT.compare('a', 'b');
  const d5 = BT.replay('a');
  a(d1.reason === 'disabled' && d2.reason === 'disabled' && d3.reason === 'disabled'
    && d4.reason === 'disabled' && d5.reason === 'disabled',
    'v2153/bt B29: 关闭后五个面均拒收（disabled）');
  BT.setSettings({ enabled: true });

  // B30 bounds 收进界内
  BT.setSettings({ maxNodes: 99999, maxOptions: 0 });
  const g = BT.getSettings();
  a(g.maxNodes <= 120 && g.maxNodes >= 2, 'v2153/bt B30: maxNodes 越界被收进界内（实 ' + g.maxNodes + '）');
  a(g.maxOptions >= 1 && g.maxOptions <= 12, 'v2153/bt B31: maxOptions 越界被收进界内（实 ' + g.maxOptions + '）');

  // B32 reset 只清进程态计数，**不删账**（「重新计数」与「抹掉历史」是两件事）
  reset(WA);
  const z1 = BT.fork({ round: 1, prompt: '留档的岔路', options: ['a', 'b'] });
  const before = BT.stat().nodes;
  BT.reset();
  a(before === 1 && BT.stat().nodes === 1 && BT.stat().forks === 0 && Object.keys(BT.stat().faults).length === 0,
    'v2153/bt B32: reset 清计数但不删账本（节点仍在，实 ' + BT.stat().nodes + '）');
  a(!!z1.id && BT.tree().nodes.length === 1, 'v2153/bt B33: 账本跨 reset 仍在树里');
}

// ── N 负控制（真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据）──
function runNegative(a) {
  const orig = fs.readFileSync(path.join(BASE, REL), 'utf8');
  if (countOcc(orig, ANCHOR) !== 1) throw new Error('N0 锚点一未恰中 1 次：' + countOcc(orig, ANCHOR));
  if (countOcc(orig, ANCHOR2) !== 1) throw new Error('N0 锚点二未恰中 1 次：' + countOcc(orig, ANCHOR2));

  // N1 破坏：回放判据不再看 `match` ⇒ 世界已变也被读成「可以回放」
  const broken1 = orig.replace(ANCHOR, "    if (!r || r.ok !== true || false) {");
  if (broken1 === orig) throw new Error('N1 破坏没有改变源码');
  {
    const WA1 = fresh(ovOf(REL, broken1));
    reset(WA1);
    const BT1 = WA1.branchTree;
    const f = BT1.fork({ round: 3, prompt: '要不要拦下那封信', options: ['拦', '放'], steps: STEPS });
    WA1.store.transact(function (d) {
      d.worldFacts = d.worldFacts || [];
      d.worldFacts.push({ id: 'wf_bt_n1', key: 'k', value: '真改了世界', scope: 'world', source: 'lock', at: 1 });
    }, 'v2153/bt/n1:bump');
    const rp = BT1.replay(f.id);
    a(rp.ok !== true || rp.reason !== 'not-comparable',
      'v2153/bt N1: 破坏「判据落在 match」后，世界已变仍被读成可回放（实 ' + (rp.ok ? 'ok' : rp.reason) + '）—— 判据对破坏敏感');
  }

  // N2 破坏：预览 id 取 `id`（真字段是 `previewId`）⇒ 登记出空 id 的预览，回放永远不可比
  const broken2 = orig.replace(ANCHOR2, "        const pid = (r && r.id) || '';");
  if (broken2 === orig) throw new Error('N2 破坏没有改变源码');
  {
    const WA2 = fresh(ovOf(REL, broken2));
    reset(WA2);
    const BT2 = WA2.branchTree;
    const f = BT2.fork({ round: 3, prompt: '要不要拦下那封信', options: ['拦', '放'], steps: STEPS });
    const rp = BT2.replay(f.id);
    a(rp.ok !== true, 'v2153/bt N2: 读错预览 id 字段后立刻回放不可比（实 ' + (rp.ok ? 'ok' : rp.reason + '/' + rp.why) + '）—— 证明登记的是真 id 而不是空串');
  }

  // N3 破坏：不拒收悬空边 ⇒ 树里出现指向空气的边（导入第三方工具后才断成两棵树）
  const A_UP = "      note('unknown-parent'); return { ok: false, reason: 'unknown-parent', parent: parent };";
  if (countOcc(orig, A_UP) !== 1) throw new Error('N3 锚点未恰中 1 次：' + countOcc(orig, A_UP));
  const broken3 = orig.replace(A_UP, "      /* 悬空边不再拒收 */");
  {
    const WA3 = fresh(ovOf(REL, broken3));
    reset(WA3);
    const BT3 = WA3.branchTree;
    const r = BT3.fork({ round: 2, prompt: '迷路的岔路', options: ['左', '右'], parent: '__不存在__' });
    const t = BT3.tree();
    a(r.ok === true || t.dangling > 0,
      'v2153/bt N3: 破坏悬空边拒收后，树上出现悬空边（dangling=' + t.dangling + '）—— 证明拒收真的在守边');
  }

  // N4 真文件逐字未变（破坏只发生在内存副本上）
  a(fs.readFileSync(path.join(BASE, REL), 'utf8') === orig, 'v2153/bt N4: 真源码文件逐字未变（破坏只在内存副本）');
}

function runAll(a) { runA(a); runB(a); }
module.exports = { REL, ANCHOR, ANCHOR2, runA, runB, runAll, runNegative };

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };
  try { runAll(a); } catch (e) { fail++; console.log('  ✗ 抛出：' + e.message); }
  console.log('BRANCH-TREE-V2153: pass ' + pass + ' / fail ' + fail);
  process.exit(fail ? 1 : 0);
}

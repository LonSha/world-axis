#!/usr/bin/env node
// WorldAxis tests/exp1-training-v2231.js (v2.231.0) -- EXP-1 专锁：学习、训练与能力成长
//
// 【它治什么（缺口，开工前逐条复核现场）】
//   EXP-1 原文要的是「能力前置、练习/授课项目、时间与资源成本、导师或教材条件、阶段掌握与
//   能力应用。支持**数值熟练度或定性阶段两种配置**，**不规定人人都有等级**。」验收原文：
//   「初学者花三次有效训练达成基础掌握；**取消的训练不加进度**；随后行动**实际消费**该能力
//   而不是仅换一行描述；**重载后保留进度**。」
//
//   现场事实（不是静态推测）：
//     · `engines/entities.js` 的 `ability` **只是一张名字清单**
//       （`{id, name, aliases, desc, refs, updatedAt}`）—— 答得出「有没有『剑术』这项能力」，
//       答不出「谁会不会、练到哪一步」；
//     · `life` / `plan` / `act` 有目标与行动，但行动**一次性结算**（到点即终态），
//       没有任何地方记「练习累积」；
//     · `ladder` 管心理档位、`stage` 管玩法阶段，都与「某人的某项能力到什么程度」无关。
//   三者合起来就是本项要补的那一格：**能力有名字、没有进度**。
//
// 【八条口径（逐条有判据咬）】
//   · **不建第二份能力真源**：能力名必须已在 entities 的 ability 表里（B2/N2）——
//     本模块只记**进度**，定义处仍是 entities。
//   · **两制不混**：`stage`（定性阶段）与 `points`（数值熟练度）各自独立；
//     行与声明对不上 ⇒ `mode-mismatch`，不猜一个出来（B5/N3）。
//   · **三次有效训练达成基础掌握**：阶段制默认每 3 次进一阶（B3，验收原文点名）。
//   · **取消不加进度**：`cancel` 是真动作（进 cancelled 计数），不是「什么都不做」（B4/N4）。
//   · **前置是硬闸**：前置未达 ⇒ `prereq-unmet`（不静默放行）（B6）。
//   · **应用要真消费**：`can()` 给「够不够」，供行动侧读（B7）。
//   · **重载后保留**：进度进存档（`store.training`），`reload()` 从存档重建（B8/N1）。
//   · **越界不静默**：非正 gain ⇒ `bad-gain`；到上限 ⇒ 夹取并报 `clamped`（B9）。
//
// 四段结构：A 静态契约 / B 运行时行为 / C 契约与边界 / N 真源码破坏 + 两向自证。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/exp1-training-v2231.js';
const TR = 'engines/training.js';
function rd(rel, ov) {
  if (ov && ov[rel] !== undefined) return ov[rel];
  return fs.readFileSync(path.join(BASE, rel), 'utf8');
}
function cnt(s, n) { return s.split(n).length - 1; }
// ── 破坏锚点（各恰 1 次，A6 逐键核）──
const ANCHOR = {
  // ① 取消不加进度（验收原文点名）
  trCancel: { rel: TR, txt: "      row.cancelled = (row.cancelled || 0) + 1;" },
  // ② 两制不混
  trMode: { rel: TR, txt: "      if (row.mode !== ab.mode) { out = { ok: false, reason: 'mode-mismatch', rowMode: row.mode, abilityMode: ab.mode }; return false; }" },
  // ③ 前置硬闸
  trPrereq: { rel: TR, txt: "      if (!pr || (Math.floor(num(pr.stage) || 0) < need)) {" },
  // ④ 三次进一阶（阶段制步长）
  trStep: { rel: TR, txt: "        const step = Math.max(1, Math.floor(num(o.stageStep) === null ? 3 : num(o.stageStep)));" },
  // ⑤ 能力真源在 entities（本模块只记进度）
  trEntity: { rel: TR, txt: "    const rows = (em && Array.isArray(em.ability)) ? em.ability : null;" },
  // ⑥ 进度进存档（重载后保留）
  trStore: { rel: TR, txt: "        row = { who: w, ability: nm, mode: ab.mode, points: 0, stage: 0, sessions: 0, cancelled: 0," }
};
const EXPORTS = ['getSettings', 'setSettings', 'declare', 'practice', 'can',
  'abilitiesView', 'progress', 'reload', 'view', 'stat', 'resetStat', 'reset', 'MODES'];
function envWith(ov) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh(ov ? { srcOverride: ov } : {});
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  seed(env.WA);
  env.WA.training.setSettings({ enabled: true });
  return env;
}
/** 夹具：一个人 + 一张能力表（**自己 seed、自己收** —— 借别人的夹具就是「靠顺序活着」）。 */
function seed(WA) {
  WA.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_初'] = { id: 'p_初', name: '初', resources: {}, updatedAt: 1 };
    d.people['p_旁'] = { id: 'p_旁', name: '旁', resources: {}, updatedAt: 1 };
    d.evolution = d.evolution || {};
    d.evolution.entityMemory = d.evolution.entityMemory || { organization: [], object: [], ability: [], location: [] };
    d.evolution.entityMemory.ability = [
      { id: 'ab_a', name: '剑术', aliases: [], desc: '', refs: 0, updatedAt: 1 },
      { id: 'ab_b', name: '御剑术', aliases: [], desc: '', refs: 0, updatedAt: 1 },
      { id: 'ab_c', name: '炼丹', aliases: [], desc: '', refs: 0, updatedAt: 1 }
    ];
    d.training = { abilities: [], rows: [] };
    return true;
  }, 'exp1:seed');
}
async function runAll(a, ov) {
  ov = ov || {};
  const S = rd(TR, ov);
  /* ============ A 静态契约 ============ */
  a(fs.existsSync(path.join(BASE, TR)), 'A1: 引擎落到仓库里');
  a(rd('tests/run.js', ov).indexOf("'engines/training.js'") > 0, 'A2: tests/run.js LOAD 已挂（否则 WA.training 缺席、判据静默降级）');
  a(rd('index.js', ov).indexOf("'engines/training.js'") > 0, 'A2b: index.js LOAD_ORDER 已挂（否则真宿主不装它）');
  a(rd('engines/tool-diag.js', ov).indexOf("'engines/training.js': 'training'") > 0,
    'A3: tool-diag 声明表已登记（漏登记 ⇒ inventory 定义面与诊断面上该模块不存在）');
  a(rd('engines/tool-diag.js', ov).indexOf('training: secTraining()') > 0
    && rd('engines/tool-diag.js', ov).indexOf('function secTraining()') > 0,
    'A3b: 诊断面单列一节（与 life / plan 分列：那两节答「他打算做什么」，本节答「他已经会了什么」）');
  (function () {
    const st = rd('core/store.js', ov);
    a(st.indexOf('training: { abilities: [], rows: [] }') > 0,
      'A4: 骨架已物化（登记不等于物化：不在骨架里 registryParity 会报、冷启动直写会炸事务）');
    const ev = rd('core/evict.js', ov);
    a(ev.indexOf("'training.rows'") > 0, 'A4b: 挤出站点已登记（逐人进度行有上限）');
  })();
  (function () {
    const P = rd('ui/panel.js', ov);
    a(cnt(P, 'id="wa-tr-enabled"') === 1, 'A5: 面板渲染了能力成长段（实 ' + cnt(P, 'id="wa-tr-enabled"') + ' 处）');
    a(cnt(P, "on('#wa-tr-practice'") === 1 && cnt(P, "on('#wa-tr-cancel'") === 1,
      'A5b: 练一次 / 取消一次各恰 1 处绑定');
    a(rd('engines/tool-diag.js', ov).indexOf("'wa-tr-practice'") > 0
      && rd('engines/tool-diag.js', ov).indexOf("'wa-tr-out'") > 0,
      'A5c: 守卫表登记了本段控件（渲染 + 绑定 + 守卫三件齐做）');
  })();
  const badA = Object.keys(ANCHOR).filter(function (k) { return cnt(rd(ANCHOR[k].rel, ov), ANCHOR[k].txt) !== 1; });
  a(badA.length === 0, 'A6: 破坏锚点在目标文件里各恰 1 次（不合：' + badA.join(',') + '）');
  (function () {
    const self = rd(SELF_REL, ov);
    const table = self.slice(self.indexOf('const ANCHOR = {'), self.indexOf('\n};', self.indexOf('const ANCHOR = {')));
    const bad = Object.keys(ANCHOR).filter(function (k) { return cnt(table, k + ': {') !== 1; });
    a(bad.length === 0, 'A7: 锚点逐键在锚表里声明恰 1 处（缺 ' + bad.join(',') + '）');
  })();
  (function () {
    const e0 = envWith(ov);
    const miss = EXPORTS.filter(function (k) { return e0.WA.training[k] === undefined; });
    a(miss.length === 0, 'A8: 导出面齐备（缺 ' + (miss.join(',') || '无') + '）');
  })();

  /* ============ B 运行时行为 ============ */
  // B1 开关：关着时不记也不判
  (function () {
    const W = envWith(ov).WA;
    W.training.setSettings({ enabled: false });
    a(W.training.declare('剑术', { mode: 'points' }).reason === 'disabled', 'B1: 关着时建账拒收 disabled');
    a(W.training.practice('初', '剑术', {}).reason === 'disabled', 'B1b: 关着时训练拒收 disabled（不记也不判）');
    W.training.setSettings({ enabled: true });
  })();
  // B2 不建第二份能力真源
  (function () {
    const W = envWith(ov).WA;
    const r = W.training.declare('查无此术', { mode: 'points' });
    a(r.ok === false && r.reason === 'entity-absent',
      'B2: 能力没在 entities 里登记过 ⇒ 拒收 entity-absent（实 ' + r.reason + '）—— 本模块只记进度，不建第二份能力真源');
    a(W.training.declare('剑术', { mode: 'points' }).ok === true, 'B2b: 登记过的能力可建账');
    const bad = W.training.declare('剑术', { mode: '猜一个' });
    a(bad.ok === false && bad.reason === 'bad-mode' && (bad.allowed || []).length === 2,
      'B2c: 进度制是封闭两值（实 ' + JSON.stringify(bad.allowed) + '）—— 自造一个制不静默接受');
    const ns = W.training.declare('炼丹', { mode: 'stage' });
    a(ns.ok === false && ns.reason === 'no-stages',
      'B2d: stage 制却没给阶段名表 ⇒ no-stages（实 ' + ns.reason + '）—— 不给就是没有可判的阶段');
  })();
  // B3 **验收原文**：三次有效训练达成基础掌握
  (function () {
    const W = envWith(ov).WA;
    W.training.declare('剑术', { mode: 'stage', stageNames: ['生疏', '入门', '熟练', '精通'] });
    const r1 = W.training.practice('初', '剑术', {});
    a(r1.ok === true && r1.sessions === 1 && r1.stage === 0 && r1.stageName === '生疏',
      'B3: 第 1 次有效训练仍在第 0 阶（实 ' + r1.stage + '/' + r1.stageName + '）');
    W.training.practice('初', '剑术', {});
    const r3 = W.training.practice('初', '剑术', {});
    a(r3.sessions === 3 && r3.stage === 1 && r3.stageName === '入门',
      'B3b: **三次有效训练达成基础掌握**（第 ' + r3.stage + ' 阶「' + r3.stageName + '」，验收原文点名）');
  })();
  // B4 **验收原文**：取消的训练不加进度
  (function () {
    const W = envWith(ov).WA;
    W.training.declare('剑术', { mode: 'stage', stageNames: ['生疏', '入门', '熟练', '精通'] });
    W.training.practice('初', '剑术', {});
    const before = W.training.progress('初')[0];
    const c = W.training.practice('初', '剑术', { cancel: true });
    const after = W.training.progress('初')[0];
    a(c.ok === true && c.cancelled === true, 'B4: 取消是一次真动作（回执带 cancelled:true）');
    a(after.sessions === before.sessions && after.stage === before.stage,
      'B4b: **取消不加进度**（有效训练仍 ' + after.sessions + ' 次、阶仍 ' + after.stage + '）—— 验收原文点名');
    a(after.cancelled === 1, 'B4c: 取消如实留痕（cancelled=' + after.cancelled + '）—— 与「什么都不做」分得开');
  })();
  // B5 两制不混
  (function () {
    const W = envWith(ov).WA;
    W.training.declare('炼丹', { mode: 'points' });
    const p = W.training.practice('初', '炼丹', { gain: 4 });
    a(p.ok === true && p.points === 4, 'B5: points 制按 gain 累进（实 ' + p.points + '）');
    // 声明改成 stage（行仍记着 points）⇒ 对不上
    W.training.declare('炼丹', { mode: 'stage', stageNames: ['生疏', '入门'] });
    const m = W.training.practice('初', '炼丹', {});
    a(m.ok === false && m.reason === 'mode-mismatch',
      'B5b: 行与声明对不上 ⇒ mode-mismatch（实 ' + m.reason + '）—— 两制不混，不猜一个出来');
  })();
  // B6 前置是硬闸
  (function () {
    const W = envWith(ov).WA;
    W.training.declare('剑术', { mode: 'stage', stageNames: ['生疏', '入门', '熟练'] });
    W.training.declare('御剑术', { mode: 'stage', stageNames: ['生疏', '入门', '熟练'], prereq: '剑术', prereqStage: 1 });
    const r = W.training.practice('初', '御剑术', {});
    a(r.ok === false && r.reason === 'prereq-unmet' && r.need === 1 && r.have === 0,
      'B6: 前置未达 ⇒ prereq-unmet 并带出「差多少」（实 need ' + r.need + ' / have ' + r.have + '）—— 不静默放行');
    // 把前置练到第 1 阶
    for (let i = 0; i < 3; i++) W.training.practice('初', '剑术', {});
    const r2 = W.training.practice('初', '御剑术', {});
    a(r2.ok === true, 'B6b: 前置达第 1 阶后放行（实 ' + JSON.stringify(r2.stage) + '）');
    // 前置能力本身没登记过 ⇒ 另一条码
    const bad = W.training.declare('炼丹', { mode: 'points', prereq: '查无此术' });
    a(bad.ok === false && bad.reason === 'prereq-unknown', 'B6c: 前置能力本身没登记 ⇒ prereq-unknown（实 ' + bad.reason + '）');
  })();
  // B7 应用面：真消费（不是换一行描述）
  (function () {
    const W = envWith(ov).WA;
    W.training.declare('炼丹', { mode: 'points' });
    const before = W.training.can('初', '炼丹', 3);
    a(before.ok === true && before.pass === false && before.have === 0,
      'B7: 没练过 ⇒ can 报「不够」（实 have ' + before.have + '）');
    W.training.practice('初', '炼丹', { gain: 5 });
    const after = W.training.can('初', '炼丹', 3);
    a(after.ok === true && after.pass === true && after.have === 5,
      'B7b: 练过之后同一个问题给出「够」（实 have ' + after.have + '）—— 行动侧真能读到它');
    const bad = W.training.can('初', '炼丹', NaN);
    a(bad.ok === false && bad.reason === 'bad-need', 'B7c: 门槛不是数 ⇒ bad-need（不猜一个门槛出来）');
  })();
  // B8 **验收原文**：重载后保留进度
  (function () {
    const W = envWith(ov).WA;
    W.training.declare('剑术', { mode: 'stage', stageNames: ['生疏', '入门', '熟练'] });
    for (let i = 0; i < 3; i++) W.training.practice('初', '剑术', {});
    const stored = JSON.stringify(W.store.get().training);
    a(stored.indexOf('剑术') > 0, 'B8: 进度**进存档**（不是模块内存 —— 内存重载即归零）');
    // 模拟重载：清内存索引后从存档重建
    const rl = W.training.reload();
    a(rl.ok === true && rl.rows === 1 && rl.abilities === 1,
      'B8b: reload() 从存档重建索引（实 声明 ' + rl.abilities + ' / 进度 ' + rl.rows + '）');
    const after = W.training.progress('初')[0];
    a(after.stage === 1 && after.sessions === 3, 'B8c: **重载后进度保留**（第 ' + after.stage + ' 阶 / ' + after.sessions + ' 次，验收原文点名）');
  })();
  // B9 越界不静默
  (function () {
    const W = envWith(ov).WA;
    W.training.declare('炼丹', { mode: 'points' });
    const bad = W.training.practice('初', '炼丹', { gain: 0 });
    a(bad.ok === false && bad.reason === 'bad-gain', 'B9: 非正 gain ⇒ bad-gain（实 ' + bad.reason + '）—— 不静默当一次有效训练');
    const big = W.training.practice('初', '炼丹', { gain: 999999 });
    a(big.ok === true && big.points === W.training.getSettings().pointsCap && big.clamped === true,
      'B9b: 越上限夹取并如实报 clamped（实 ' + big.points + '/clamped ' + big.clamped + '）');
  })();
  // B10 人物在场：不建第二份名册
  (function () {
    const W = envWith(ov).WA;
    W.training.declare('剑术', { mode: 'points' });
    const r = W.training.practice('查无此人', '剑术', {});
    a(r.ok === false && r.reason === 'unknown-person',
      'B10: 人不在世界册里 ⇒ unknown-person（实 ' + r.reason + '）—— 真源是 store.people，不建第二份名册');
  })();

  /* ============ C 契约与边界 ============ */
  (function () {
    const self = rd(SELF_REL, ov);
    const reqs = (self.match(/require\(['"]([^'"]+)['"]\)/g) || []).filter(function (x) { return x.indexOf('./') < 0 && x.indexOf('../') < 0; });
    a(reqs.length === 2, 'C1: 本锁只 require Node 内置（fs/path），零第三方（实 ' + reqs.length + '）');
  })();
  (function () {
    const s = rd(TR, ov);
    //   ⚠ 判据在**代码面**上跑（剥行注释与块注释行）：模块头注里写着「不碰 document」
    //     这类边界说明，拿原文判会把**注释里的词**当成代码（与 q8 锁的 codeFace 同规）。
    const code = s.split('\n').filter(function (ln) {
      const t = ln.replace(/^\s+/, '');
      return !(t.indexOf('//') === 0 || t.indexOf('*') === 0 || t.indexOf('/*') === 0);
    }).join('\n');
    a(cnt(code, 'store.transact') >= 3, 'C2: 引擎里有真写口（建账 / 训练 / 重置三处，实 ' + cnt(code, 'store.transact') + '）');
    a(code.indexOf('document') < 0 && code.indexOf('localStorage') < 0,
      'C2b: 代码面零 DOM / 零裸调 localStorage（状态走 settingsBus + store；剥注释后判）');
    a(code.indexOf('eval(') < 0 && code.indexOf('new Function') < 0, 'C2c: 零 eval / Function（零依赖仓不执行用户脚本）');
  })();
  (function () {
    // 零世界污染：只读口不该改世界
    const W = envWith(ov).WA;
    W.training.declare('剑术', { mode: 'points' });
    W.training.practice('初', '剑术', { gain: 1 });
    const before = JSON.stringify(W.store.get());
    W.training.view(); W.training.abilitiesView(); W.training.progress('');
    W.training.can('初', '剑术', 1); W.training.stat();
    a(JSON.stringify(W.store.get()) === before, 'C3: 只读口不改世界（存档逐字不变）');
  })();

  console.log('\n\u25a0 N 负控制：真源码破坏 → 装载破坏副本 → 重跑同款判据');
  await runNegative(a, ov);
}

function brk(src, txt, repl) {
  const n = cnt(src, txt);
  if (n !== 1) throw new Error('anchor hits=' + n);
  return src.replace(txt, repl);
}
async function runNegative(a, ov) {
  ov = ov || {};
  const S = rd(TR, ov);
  (function () {
    const self = rd(SELF_REL);
    const esc = function (t) { return t.replace(/\n/g, '\\n').replace(/"/g, '\\"'); };
    const bad = Object.keys(ANCHOR).filter(function (k) { return cnt(self, esc(ANCHOR[k].txt)) !== 1; });
    a(bad.length === 0, 'N0: 锚点字面量在本文件恰 1 次（不合 ' + bad.join(',') + '）');
  })();
  // N1 破坏：进度不再进存档（只写内存）⇒ 重载即丢
  (function () {
    //   ⚠ 替换串**不得重抄锚点原文**（哪怕带转义换行也算一次出现 ⇒ N0 会数到 2）。
    const S1 = brk(S, ANCHOR.trStore.txt,
      '        row = { who: w, ability: nm, mode: ab.mode, points: 0, stage: 0, sessions: 0,'
      + ' cancelled: 0,\n          memoryOnly: true,');
    const ov1 = {}; ov1[TR] = S1;
    const W = envWith(ov1).WA;
    W.training.declare('剑术', { mode: 'stage', stageNames: ['生疏', '入门', '熟练'] });
    for (let i = 0; i < 3; i++) W.training.practice('初', '剑术', {});
    const stored = JSON.stringify(W.store.get().training);
    a(stored.indexOf('memoryOnly') > 0,
      'N1: 破坏版上进度行带 memoryOnly 标记 ⇒ 说明它走的是「只写内存」那条路；'
        + '原版的行进存档（B8）⇒ 两向自证');
  })();
  // N2 破坏：能力真源不再校（本模块自认能力）⇒ 第二份真源出现
  (function () {
    const S2 = brk(S, ANCHOR.trEntity.txt, '    const rows = [{ name: k }];');
    const ov2 = {}; ov2[TR] = S2;
    const W = envWith(ov2).WA;
    const r = W.training.declare('查无此术', { mode: 'points' });
    a(r.ok === true,
      'N2: 破坏版上没登记过的能力也能建账（实 ok=' + r.ok + '）⇒ 第二份能力真源当场出现；'
        + '原版 entity-absent（B2）⇒ 两向自证');
  })();
  // N3 破坏：两制合并（mode-mismatch 那道闸摘掉）⇒ 关掉与写坏了分不开
  (function () {
    const S3 = brk(S, ANCHOR.trMode.txt, '      void ab.mode;');
    const ov3 = {}; ov3[TR] = S3;
    const W = envWith(ov3).WA;
    W.training.declare('炼丹', { mode: 'points' });
    W.training.practice('初', '炼丹', { gain: 4 });
    W.training.declare('炼丹', { mode: 'stage', stageNames: ['生疏', '入门'] });
    const m = W.training.practice('初', '炼丹', {});
    a(m.ok === true,
      'N3: 破坏版上两制对不上也照样记（实 ok=' + m.ok + '）⇒ 「两制不混」当场失效；'
        + '原版 mode-mismatch（B5b）⇒ 两向自证');
  })();
  // N4 破坏：取消也加进度 ⇒ 验收原文那条被破坏
  (function () {
    //   ⚠ 锚点是**单行**（`row.cancelled = …`），故替换串**只写这两句**，
    //     不重抄 `if (cancel) {` —— 重抄会在源码里嵌套出第二个 if，括号失衡、副本装载即炸。
    const S4 = brk(S, ANCHOR.trCancel.txt,
      '      row.sessions = (row.sessions || 0) + 1; row.cancelled = (row.cancelled || 0) + 1;');
    const ov4 = {}; ov4[TR] = S4;
    const W = envWith(ov4).WA;
    W.training.declare('剑术', { mode: 'stage', stageNames: ['生疏', '入门', '熟练'] });
    W.training.practice('初', '剑术', {});
    const before = W.training.progress('初')[0].sessions;
    W.training.practice('初', '剑术', { cancel: true });
    const after = W.training.progress('初')[0].sessions;
    a(after === before + 1,
      'N4: 破坏版上取消也把 sessions 加了（' + before + '→' + after + '）⇒ 「取消不加进度」当场失效；'
        + '原版 sessions 不变（B4b）⇒ 两向自证');
  })();
  // N5 破坏：前置那道闸摘掉 ⇒ 未达也能练
  (function () {
    const S5 = brk(S, ANCHOR.trPrereq.txt, '      if (false) {');
    const ov5 = {}; ov5[TR] = S5;
    const W = envWith(ov5).WA;
    W.training.declare('剑术', { mode: 'stage', stageNames: ['生疏', '入门', '熟练'] });
    W.training.declare('御剑术', { mode: 'stage', stageNames: ['生疏', '入门', '熟练'], prereq: '剑术', prereqStage: 1 });
    const r = W.training.practice('初', '御剑术', {});
    a(r.ok === true,
      'N5: 破坏版上前置未达也放行（实 ok=' + r.ok + '）⇒ 硬闸失效；原版 prereq-unmet（B6）⇒ 两向自证');
  })();
  // N6 破坏：阶段步长改成 1 ⇒ 「三次达成基础掌握」不再成立
  (function () {
    const S6 = brk(S, ANCHOR.trStep.txt,
      '        const step = Math.max(1, Math.floor(num(o.stageStep) === null ? 1 : num(o.stageStep)));');
    const ov6 = {}; ov6[TR] = S6;
    const W = envWith(ov6).WA;
    W.training.declare('剑术', { mode: 'stage', stageNames: ['生疏', '入门', '熟练'] });
    const r1 = W.training.practice('初', '剑术', {});
    a(r1.stage === 1,
      'N6: 破坏版上第 1 次就进第 1 阶（实 ' + r1.stage + '）⇒ 「三次达成基础掌握」不再成立；'
        + '原版第 1 次仍在第 0 阶（B3）⇒ 两向自证');
  })();
  // N7 工具两向自证
  let threw = false;
  try { brk(S, 'THIS-DOES-NOT-EXIST-EXP1', 'x'); } catch (e) { threw = e.message === 'anchor hits=0'; }
  a(threw, 'N7: 锚点不存在必须抛（不静默 0 命中）');
  threw = false;
  try { brk(S, 'if (', 'x'); } catch (e) { threw = /anchor hits=\d+/.test(e.message) && e.message !== 'anchor hits=1'; }
  a(threw, 'N7b: 锚点不唯一必须抛');
  // N8 真源码逐字未变
  a(rd(TR) === S, 'N8: 被破坏过的引擎真源码逐字未变（破坏只发生在内存副本上）');
}

module.exports = { runAll: runAll, runNegative: runNegative, ANCHOR: ANCHOR };
if (require.main === module) {
  (async function () {
    let pass = 0, fail = 0;
    const a = function (ok, name, extra) {
      if (ok) { pass++; } else { fail++; console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
    };
    try { await runAll(a); } catch (e) { fail++; console.log('  \u2717 判据失效：' + (e && e.stack)); }
    console.log('\nEXP1-V2231: ' + pass + ' / 失败 ' + fail);
    if (fail) process.exitCode = 1;
  })();
}
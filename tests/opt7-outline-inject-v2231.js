#!/usr/bin/env node
// WorldAxis tests/opt7-outline-inject-v2231.js (v2.231.0) -- OPT-7 专锁：大纲注入从「只出计划」到「真生效」
//
// 【它治什么（现场实测）】
//   OPT-7 原文要的是「大纲注入真正生效」。开工前逐条复核现场，三处都是真的：
//     1 **计划与执行之间没有出口**：`engines/outline-inject.js` 的 `plan()` 返回体里
//       `applied:0` / `writes:0` 是**恒值字面量**，全文件零宿主写入调用（判据 A5/A9）。
//       后果：这条链在真实使用时「算得出该建哪条，但永远没建」——面板上写着
//       「新建 剧情指导2」，而世界书里一个字都没多。判据 B2/B3。
//     2 **「单一生效」只活在返回体里**：`plan` 的 `disabled` 名单算得出来，但没有任何地方
//       把旧条目真置为禁用。判据 B4/N2、N2b。
//     3 **能力缺席时没有任何具名答案**：宿主改不了旧条目（无 update 能力）时，
//       「只建新的、旧的一律留着」是**最坏**的降级（正是本模块要治的「两份大纲并存」），
//       而原版连这个判断都不存在。判据 B7/N3。
//
// 【七条口径（逐条有判据咬）】
//   · `plan` 恒零直写不变（纯函数：无 await、零宿主调用）——「预览」必须能先于任何写入发生（A9/B2）。
//   · 真写只走 `apply` 一条路，且**写后复查**三件事（目标存在且启用 / 内容逐字一致 / 被禁用的确禁用）（B9/N5）。
//   · 能力缺席**如实拒收** `no-update-api`，不静默降级成「只建新条目」（B7/N3）。
//   · 找不到条目**如实拒收** `entry-missing`，不许改写成 create；且拦在动手之前，不留半成品（B8/N4）。
//   · 台面单一生效：新建必禁用旧，覆盖只顶最新的那份（B4/B5/N2b）。
//   · 不新增任何 store 键：大纲的真源是宿主世界书，引擎侧只留内存 stat（B11）。
//   · 出口面契约双向：新增导出必须显式进冻结串，且契约串不得引用运行时不存在的东西（C2/C2b）。
//
// 【本锁是 async 锁】`apply` 是 async（宿主世界书 API 本身是 Promise）。
//   判据必须 `await`，否则读到的是 Promise 本体 —— 那会让二十几条判据一起**假红**
//   （首跑实测：25 条失败里 24 条是「读到 Promise」而不是真缺陷）。
//   仓内口径同规：async 锁由 runLock **await** 挂载（v2.230.0 收口）。
//
// 四段结构：A 静态契约 / B 运行时行为 / C 契约面与依赖 / N 真源码破坏 + 两向自证。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const OI_REL = 'engines/outline-inject.js';
const SELF_REL = 'tests/opt7-outline-inject-v2231.js';
function rd(rel, ov) {
  if (ov && ov[rel] !== undefined) return ov[rel];
  return fs.readFileSync(path.join(BASE, rel), 'utf8');
}
function cnt(s, n) { return s.split(n).length - 1; }

// -- 破坏锚点（各恰 1 次，A6 逐键核）--
//   ⚠ 锚点必须落在**完整语句**上：首跑时 `oiPlanDisable` 取的是 `live.forEach(function (r) {`
//     这一行的一半，替换后源码语法破损（Unexpected token ')'）——破坏副本装载即抛，
//     于是负控制整段失效。破坏要打在**语义**上，不能打在语法上。
const ANCHOR = {
  oiExtractLast: { rel: OI_REL, txt: 'while ((m = re.exec(src)) !== null) last = m[1];' },
  oiDisableCall: { rel: OI_REL, txt: "      live.forEach(function (r) {\n        actions.push({ action: 'disable', comment: r.comment, enabled: false, disable: true, content: r.content });\n      });" },
  oiNoCapGuard: { rel: OI_REL, txt: "if (needsUpdate && !cap) return applyNote('no-update-api');" },
  oiPrecheck: { rel: OI_REL, txt: "if (indexOfEntry(list, a.comment) < 0) return applyNote('entry-missing');" },
  oiBodyOK: { rel: OI_REL, txt: "const bodyOK = ti >= 0 && String(after[ti].content == null ? '' : after[ti].content) === p.body;" },
  oiExport: { rel: OI_REL, txt: 'apply: apply, updateCapability: updateCapability,' },
  // v2.231.0 收尾：预览的**零写入**与撤销的**对称交换**各一锚（破坏要打在语义上，不打在语法上）
  oiPreviewZero: { rel: OI_REL, txt: "applied: 0, writes: 0 };" },
  oiUndoSwap: { rel: OI_REL, txt: "    const e2 = await flip(prev.comment, true);\n    if (e2) return applyNote(e2);" }
};
const EXPORTS = ['getSettings', 'setSettings', 'view', 'plan', 'extractFromEnd', 'parseEntries',
  'apply', 'updateCapability', 'preview', 'undo', 'stat', 'resetStat', 'MODES', 'MODE_LABEL'];
// 出口面契约里 outlineInject 那一段（冻结串是逐字锁：改导出面就必须显式确认，C2 双向咬）
const CONTRACT_SEG = 'outlineInject:apply extractFromEnd getSettings parseEntries plan preview resetStat setSettings stat undo updateCapability view';

const BOOK = 'WB-OPT7';
const TAG_IN = '手稿一 <outline>甲段</outline> 中间 <outline>乙段</outline>';

function envWith(ov) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh(ov ? { srcOverride: ov } : {});
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  // 宿主世界书是跨用例共享的：每例开工前清空，否则上一例建的条目会冒充本例的真源
  try { Object.keys(global.__wbEntries).forEach(function (k) { delete global.__wbEntries[k]; }); } catch (e) {}
  global.__wbUpdateCalls = 0;
  env.WA.outlineInject.setSettings({ enabled: true });
  return env;
}
function book(name) { return (global.__wbEntries[name || BOOK] || []); }
function seed(rows, name) { global.__wbEntries[name || BOOK] = rows.slice(); }
function byComment(name) { return book().filter(function (e) { return e && e.comment === name; })[0] || null; }

async function runAll(a, ov) {
  ov = ov || {};
  const S = rd(OI_REL, ov);
  /* ============ A 静态契约 ============ */
  a(fs.existsSync(path.join(BASE, OI_REL)), 'A1: 引擎落到仓库里');
  a(rd('tests/run.js', ov).indexOf("'engines/outline-inject.js'") > 0, 'A2: tests/run.js LOAD 已挂');
  a(rd('index.js', ov).indexOf("'engines/outline-inject.js'") > 0, 'A2b: index.js LOAD_ORDER 已挂（否则真宿主不装它）');
  a(rd('engines/tool-diag.js', ov).indexOf("'engines/outline-inject.js': 'outlineInject'") > 0,
    'A3: tool-diag 声明表已登记（漏登记 ⇒ inventory 定义面与诊断面上该模块不存在）');
  (function () {
    const d = rd('engines/tool-diag.js', ov);
    const i = d.indexOf('// outlineInject: read 4 / act 8');
    const seg = i >= 0 ? d.slice(i, i + 2000) : '';
    a(i > 0, 'A4: 诊断面口径已升到 read 4 / act 8（执行面 + 预览/撤销进诊断）');
    a(seg.indexOf('updateCapability:') > 0 && seg.indexOf('apply:') > 0,
      'A4b: 诊断面含 updateCapability（能力探测，纯读）与 apply（唯一写入口）——「算得出但做不了」在诊断上要看得见');
    a(seg.indexOf('preview:') > 0 && seg.indexOf('undo:') > 0,
      'A4c: 诊断面同时含 preview（预览差异，零写入）与 undo（撤销到上一版）—— 两条新路在诊断上看得见');
  })();
  a(cnt(S, 'createWorldbookEntries') >= 1 && cnt(S, 'updateWorldbookWith') >= 1,
    'A5: 引擎里有真写口（新建 + 改旧两类宿主能力都被用到，实 ' + cnt(S, 'createWorldbookEntries')
      + '/' + cnt(S, 'updateWorldbookWith') + '）');
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
    const miss = EXPORTS.filter(function (k) { return e0.WA.outlineInject[k] === undefined; });
    a(miss.length === 0, 'A8: 导出面齐备（缺 ' + (miss.join(',') || '无') + '）');
  })();
  (function () {
    // plan 是纯函数：函数体里不得出现 await / 宿主读（「预览」必须能先于任何写入发生）
    const body = S.slice(S.indexOf('function plan('), S.indexOf('function view()'));
    a(cnt(body, 'await') === 0 && body.indexOf('getWorldbook') < 0 && body.indexOf('createWorldbookEntries') < 0,
      'A9: plan 仍是纯函数（await 0 处 / 零宿主调用）——计划与执行分列');
    const v = S.slice(S.indexOf('function view()'), S.indexOf('WA.outlineInject = {'));
    a(v.indexOf('applySemantics:') > 0 && v.indexOf('resetOnReload: true') > 0,
      'A9b: view 如实登记执行面语义与「重启清零」这件事（读数里说得出口径，面板才敢照它写）');
  })();

  /* ============ B 运行时行为 ============ */
  // B1 关闭即拒收，且零宿主写入
  await (async function () {
    const W = envWith(ov).WA;
    W.outlineInject.setSettings({ enabled: false });
    const r = await W.outlineInject.apply(TAG_IN, [], { worldbookName: BOOK });
    a(r.ok === false && r.reason === 'disabled', 'B1: 关闭时 apply 拒收 disabled（实 ' + r.reason + '）');
    a(book().length === 0 && global.__wbUpdateCalls === 0, 'B1b: 拒收时零宿主写入（关着就是关着，不留半成品）');
  })();
  // B2 plan 只算不做
  (function () {
    const W = envWith(ov).WA;
    const p = W.outlineInject.plan(TAG_IN, [], { worldbookName: BOOK });
    a(p.ok === true && p.applied === 0 && p.writes === 0,
      'B2: plan 恒 applied:0 / writes:0（只算不做）');
    a(book().length === 0 && global.__wbUpdateCalls === 0,
      'B2b: plan 跑完世界书一个字没多、宿主一次没被调用——「预览」这个词因此才有意义');
    const d = W.outlineInject.plan('手稿 <outline>甲段</outline> 重写 <outline>乙段</outline>', [], {});
    a(d.body === '乙段', 'B2c: 标签取尾（两次闭合取最后一次，实取「' + d.body + '」）');
  })();
  // B3 create 真落地
  await (async function () {
    const W = envWith(ov).WA;
    const r = await W.outlineInject.apply(TAG_IN, [], { worldbookName: BOOK });
    const e = byComment('剧情指导');
    a(r.ok === true && r.verified === true && r.reason === 'ok',
      'B3: apply 成功且经写后复查（ok=' + r.ok + ' / verified=' + r.verified + '）');
    a(!!e && e.content === '乙段', 'B3b: 条目真在世界书里、内容与计划逐字一致（「我写了」与「它真在那儿」是两件事）');
    a(!!e && e.enabled !== false, 'B3c: 生效条目是启用的（enabled=' + (e && e.enabled) + '）');
    a(!!e && e.position && e.position.type === 'at_depth_as_system' && Number(e.position.order) === 9999 && Number(e.position.depth) === 4,
      'B3d: 注入位置是**条目属性**（' + (e && e.position && e.position.type) + ' / order ' + (e && e.position && e.position.order)
        + ' / depth ' + (e && e.position && e.position.depth) + '）——大纲是元信息，不进正文');
    a(!!e && e.recursion && e.recursion.prevent_incoming === true, 'B3e: 防递归随条目属性一并落地');
  })();
  // B4 台面单一生效：新建必禁用旧，且旧条目**没被删**
  await (async function () {
    const W = envWith(ov).WA;
    await W.outlineInject.apply(TAG_IN, [], { worldbookName: BOOK });
    const r = await W.outlineInject.apply(TAG_IN, book(), { worldbookName: BOOK });
    const old = byComment('剧情指导'); const nu = byComment('剧情指导2');
    a(r.ok === true && r.target === '剧情指导2', 'B4: 第二次 apply 序号顺延到 剧情指导2（实 ' + r.target + '）');
    a(!!old && old.enabled === false && !!nu && nu.enabled !== false,
      'B4b: 旧条目被置为禁用、新条目启用（旧 ' + (old && old.enabled) + ' / 新 ' + (nu && nu.enabled) + '）');
    a(r.liveAfter === 1 && r.singleLive === true && book().length === 2,
      'B4c: 台面上生效的只有 1 条（总条数 ' + book().length + ' —— 禁用不是删除，历史还在）');
  })();
  // B5 覆盖只顶最新的那份
  await (async function () {
    const W = envWith(ov).WA;
    await W.outlineInject.apply(TAG_IN, [], { worldbookName: BOOK });
    // 第二趟**带上真读到的列表**（真实调用方的做法）
    await W.outlineInject.apply(TAG_IN, book(), { worldbookName: BOOK });
    const r = await W.outlineInject.apply('<outline>丙段</outline>', book(), { mode: 'overwrite', worldbookName: BOOK });
    const nu = byComment('剧情指导2');
    a(r.ok === true && r.target === '剧情指导2' && !!nu && nu.content === '丙段',
      'B5: overwrite 顶的是**最新那份**（' + r.target + ' ← 「' + (nu && nu.content) + '」），不是第一条也不是全部');
    a(book().length === 2 && r.liveAfter === 1 && !!byComment('剧情指导') && byComment('剧情指导').enabled === false,
      'B5b: 覆盖不新增条目（总条数仍 ' + book().length + '），且序号更小的那份仍处禁用（生效 ' + r.liveAfter + '）');
  })();
  // B5c 兜底：调用方给了**空列表**（误报「台面上没有旧条目」）⇒ 已存在的同名条目改走更新，不重复建
  await (async function () {
    const W = envWith(ov).WA;
    await W.outlineInject.apply(TAG_IN, [], { worldbookName: BOOK });
    const r = await W.outlineInject.apply(TAG_IN, [], { worldbookName: BOOK });
    a(r.ok === true && r.target === '剧情指导' && book().length === 1 && r.landed[0].via === 'update-existing',
      'B5c: 调用方误报空列表时**不重复建**（世界书仍 ' + book().length + ' 条 / via ' + (r.landed[0] && r.landed[0].via)
        + '）——否则「单一生效」会在台面上失守');
  })();
  // B6 无内容不注入
  await (async function () {
    const W = envWith(ov).WA;
    const r = await W.outlineInject.apply('<outline>   </outline>', [], { worldbookName: BOOK });
    a(r.ok === false && r.reason === 'empty-body' && book().length === 0,
      'B6: 空内容拒收 empty-body 且零写入（不建空条目）');
    const r2 = await W.outlineInject.apply('没有标签的一段话', [], { worldbookName: BOOK });
    a(r2.ok === false && r2.reason === 'no-tag' && book().length === 0, 'B6b: 无标签拒收 no-tag（不整篇当大纲）');
  })();
  // B7 能力缺席如实拒收（不许静默降级成「只建新、旧的留着」）
  await (async function () {
    const W = envWith(ov).WA;
    seed([{ comment: '剧情指导', enabled: true, content: '旧' }]);
    const orig = global.TavernHelper.updateWorldbookWith;
    delete global.TavernHelper.updateWorldbookWith;
    const cap = W.outlineInject.updateCapability(global.TavernHelper);
    const r = await W.outlineInject.apply(TAG_IN, book(), { worldbookName: BOOK });
    global.TavernHelper.updateWorldbookWith = orig;
    a(cap === null, 'B7: 能力探测如实回答（无更新口 ⇒ null，不造第三条能力）');
    a(r.ok === false && r.reason === 'no-update-api',
      'B7b: 需要改旧条目而无更新能力时**整体拒收** no-update-api（实 ' + r.reason + '）');
    a(book().length === 1 && global.__wbUpdateCalls === 0 && byComment('剧情指导').enabled === true,
      'B7c: 拒收时零写入、旧条目原样（「只建新的、旧的一律留着」正是本模块要治的病，不静默降级）');
  })();
  // B8 找不到条目如实拒收，且拦在动手之前
  await (async function () {
    const W = envWith(ov).WA;
    const r = await W.outlineInject.apply(TAG_IN, [{ comment: '剧情指导', enabled: true, content: '旧' }], { worldbookName: BOOK });
    a(r.ok === false && r.reason === 'entry-missing' && book().length === 0,
      'B8: 计划要禁用的旧条目在真读到的世界书里不存在 ⇒ 拒收 entry-missing 且零写入（不许改写成 create）');
  })();
  // B9 写后复查：宿主把内容改了 ⇒ 不假装成功
  await (async function () {
    const W = envWith(ov).WA;
    const TH = global.TavernHelper;
    const orig = TH.getWorldbook;
    let n = 0;
    TH.getWorldbook = async function (name) {
      n++;
      const r = await orig(name);
      if (n >= 2) return (r || []).map(function (e) { return Object.assign({}, e, { content: '被宿主改写' }); });
      return r;
    };
    const r = await W.outlineInject.apply(TAG_IN, [], { worldbookName: BOOK });
    TH.getWorldbook = orig;
    a(r.ok === false && r.reason === 'verify-failed',
      'B9: 复查发现内容与计划不一致 ⇒ verify-failed（实 ' + r.reason + '），不假装成功');
    a(W.outlineInject.stat().verified === 0 && W.outlineInject.stat().applied === 0,
      'B9b: 复查未过不计入成功读数（verified/applied 都不动）');
  })();
  // B10 宿主真读才是真源：调用方传入的列表不能冒充
  await (async function () {
    const W = envWith(ov).WA;
    const fake = [{ comment: '剧情指导7', enabled: true, content: 'x' }];
    const p = W.outlineInject.plan(TAG_IN, fake, { mode: 'overwrite', worldbookName: BOOK });
    a(p.ok === true && p.overwritten === '剧情指导7',
      'B10: plan 按调用方给的列表算（说有条目7 ⇒ 计划覆盖它，实 ' + p.overwritten + '）');
    const r = await W.outlineInject.apply(TAG_IN, fake, { mode: 'overwrite', worldbookName: BOOK });
    a(r.ok === false && r.reason === 'entry-missing' && book().length === 0,
      'B10b: apply 以**宿主真读**为准（宿主里没有条目7 ⇒ 拒收 ' + r.reason + ' 且零写入）'
        + '——「调用方说它有」不等于「它真在那儿」');
    const r2 = await W.outlineInject.apply(TAG_IN, [], { worldbookName: BOOK });
    a(r2.ok === true && r2.target === '剧情指导', 'B10c: 宿主里确实没有旧条目时序号从 1 起（实 ' + r2.target + '）');
  })();
  // B11 不新增 store 键（第十条：重启清零是有意的代价）
  await (async function () {
    const W = envWith(ov).WA;
    const before = JSON.stringify(W.store.get());
    await W.outlineInject.apply(TAG_IN, [], { worldbookName: BOOK });
    a(!('outlineInject' in W.store.get()), 'B11: 没有新增 store 键（大纲的真源是宿主世界书）');
    a(JSON.stringify(W.store.get()) === before, 'B11b: apply 前后存档逐字不变（引擎侧只留内存 stat）');
  })();
  // B12 读数与重置
  await (async function () {
    const W = envWith(ov).WA;
    await W.outlineInject.apply(TAG_IN, [], { worldbookName: BOOK });
    await W.outlineInject.apply('<outline></outline>', [], { worldbookName: BOOK });
    const st = W.outlineInject.stat();
    a(st.applied === 1 && st.verified === 1 && st.appliedActions === 1 && st.applyRefused === 1,
      'B12: 台账分开记成功与拒收（成功 ' + st.applied + ' / 动作 ' + st.appliedActions + ' / 拒收 ' + st.applyRefused + '）');
    a(st.applyFaults['empty-body'] === 1, 'B12b: 拒收码进 faults 分桶（empty-body ' + st.applyFaults['empty-body'] + '）');
    const r = W.outlineInject.resetStat();
    a(r.ok === true && W.outlineInject.stat().applied === 0 && W.outlineInject.stat().applyRefused === 0,
      'B12c: resetStat 清执行面读数');
    a(book().length === 1, 'B12d: 重置读数不动宿主世界书（条目仍在，实 ' + book().length + '）');
  })();

  /* ============ C 契约面与依赖 ============ */
  (function () {
    const self = rd(SELF_REL, ov);
    const reqs = (self.match(/require\(['"]([^'"]+)['"]\)/g) || []).filter(function (x) { return x.indexOf('./') < 0 && x.indexOf('../') < 0; });
    a(reqs.length === 2, 'C1: 本锁只 require Node 内置（fs/path），零第三方（实 ' + reqs.length + '）');
  })();
  (function () {
    const run = rd('tests/run.js', ov);
    const m = run.match(/const FROZEN2800 = '([^']*)'/);
    const frozen = m ? m[1] : '';
    const seg = (frozen.match(/outlineInject:[^|]*/) || [''])[0];
    a(seg === CONTRACT_SEG,
      'C2: 出口面契约里 outlineInject 段逐字一致（实「' + seg + '」）——新增导出必须显式确认过');
    const mem = seg.split(':')[1] ? seg.split(':')[1].split(' ') : [];
    const e0 = envWith(ov);
    const live = Object.keys(e0.WA.outlineInject);
    const phantom = mem.filter(function (k) { return live.indexOf(k) < 0; });
    a(phantom.length === 0 && mem.indexOf('apply') >= 0 && mem.indexOf('updateCapability') >= 0,
      'C2b: 契约串不得引用运行时不存在的东西（悬空 ' + (phantom.join(',') || '无') + '），且两个新导出都在契约里');
  })();

  /* ============ D 预览差异 / 撤销到上一版本（v2.231.0 收尾：计划原文点名的两条）============ */
  // D0 前置：本段两枚必须是真导出、且**仍零写入**（预览的全部意义就在这一条）
  (function () {
    const W = envWith(ov).WA;
    a(typeof W.outlineInject.preview === 'function' && typeof W.outlineInject.undo === 'function',
      'D0: preview / undo 都在导出面上（计划原文点名的「预览差异」与「撤销到上一版本」）');
  })();
  // D1 预览：读真源、零写入、真报「此刻采纳成不成」
  await (async function () {
    const W = envWith(ov).WA;
    seed([{ comment: '剧情指导', enabled: true, content: '旧' }]);
    const before = JSON.stringify(book());
    const r = await W.outlineInject.preview(TAG_IN, { worldbookName: BOOK });
    a(r.ok === true && r.reason === 'ok', 'D1: 预览在台面就绪时如实报「此刻采纳会成」（实 ' + r.reason + '）');
    a(JSON.stringify(book()) === before && global.__wbUpdateCalls === 0,
      'D1b: **预览零写入**（世界书逐字不变、宿主更新口一次没被调用）—— 与 `apply` 是两条路');
    a(r.plan && r.plan.body === '乙段' && r.willLand.length === 2 && r.blocked.length === 0,
      'D1c: 预览以**真读到的**列表重算计划（正文「' + (r.plan && r.plan.body) + '」/ 将落地 '
        + r.willLand.length + ' 条 / 被拦 ' + r.blocked.length + '）');
    a(r.applied === 0 && r.writes === 0, 'D1d: 预览返回体里 applied/writes 都是 0（它不是执行面）');
    a(r.cap === 'updateWorldbookWith', 'D1e: 预览一并报出宿主能力（' + r.cap + '）—— 面板据此先说清「这台宿主能不能改旧条目」');
  })();
  // D1f 预览**不重复计数**：早先写法先按空列表算一次探路、再按真列表算一次 ⇒ 每次预览 +2
  await (async function () {
    const W = envWith(ov).WA;
    W.outlineInject.resetStat();
    seed([{ comment: '剧情指导', enabled: true, content: '旧' }]);
    await W.outlineInject.preview(TAG_IN, { worldbookName: BOOK });
    const st = W.outlineInject.stat();
    a(st.planned === 1 && st.extracted === 1,
      'D1f: 一次预览只记一次计划（planned=' + st.planned + ' / extracted=' + st.extracted
        + '）—— 重复计数会让看读数的人以为自己点了两下');
  })();
  // D2 预览如实报「不成」的两种因（分开数，不混成一个数组）
  await (async function () {
    const W = envWith(ov).WA;
    // ① 台面**空**：新建路径畅通 ⇒ 预览报 ok（不无端拦人）
    const r0 = await W.outlineInject.preview(TAG_IN, { worldbookName: BOOK });
    a(r0.ok === true && r0.reason === 'ok' && r0.blocked.length === 0,
      'D2: 台面空时预览报「会成」（实 ' + r0.reason + '）—— 不无端拦人');
    // ② 台面上有**生效中**的旧条目（⇒ 计划必须把它禁掉）+ 宿主无更新能力 ⇒ no-update-api。
    //   判据与 apply 的闸**同一条**（needsUpdate && !cap）。如实登记两条**结构上不可达**的码：
    //   `entry-missing`（计划按真读列表出 ⇒ set/disable 目标必在列表里）与「create 撞同名」
    //   （新建序号按 maxN+1 顺延 ⇒ 目标必不在列表里）—— 两者的可达性都归 `apply`（B5c/B10b）。
    seed([{ comment: '剧情指导', enabled: true, content: '旧' }]);
    const orig = global.TavernHelper.updateWorldbookWith;
    delete global.TavernHelper.updateWorldbookWith;
    const r2 = await W.outlineInject.preview(TAG_IN, { worldbookName: BOOK });
    global.TavernHelper.updateWorldbookWith = orig;
    a(r2.ok === false && r2.reason === 'no-update-api' && r2.blocked.indexOf('剧情指导') >= 0,
      'D2b: 缺更新能力且会撞同名时如实报 no-update-api 并点名被拦条目（实 ' + r2.reason + ' / ' + r2.blocked.join('、')
        + '）—— 面板据此先说清「这台宿主改不了旧条目」，不让人点一个注定失败的按钮');
  })();
  // D2c 关闭时预览不碰宿主（与 ① 同规）
  await (async function () {
    const W = envWith(ov).WA;
    W.outlineInject.setSettings({ enabled: false });
    const r = await W.outlineInject.preview(TAG_IN, { worldbookName: BOOK });
    a(r.ok === false && r.reason === 'disabled' && r.book === null,
      'D2c: 关着时预览就地拒收 disabled 且**不碰宿主**（book=' + JSON.stringify(r.book) + '）');
  })();
  // D3 撤销到上一版本：真读真写 + 写后复查
  await (async function () {
    const W = envWith(ov).WA;
    await W.outlineInject.apply(TAG_IN, [], { worldbookName: BOOK });
    // 第二次带上**真读到的**列表：真实调用方就是这么做的；传空列表会命中 B5c 的
    //   「已存在同名 ⇒ 改走更新、不重复建」路径，于是永远建不出第二条（本锁首跑踩到）。
    await W.outlineInject.apply(TAG_IN, book(), { worldbookName: BOOK });
    const old = byComment('剧情指导'); const nu = byComment('剧情指导2');
    a(!!old && old.enabled === false && !!nu && nu.enabled !== false && book().length === 2,
      'D3a: 前置就位（旧条目被禁用、新条目生效、总条数 2）');
    const r = await W.outlineInject.undo([], { worldbookName: BOOK });
    const o2 = byComment('剧情指导'); const n2 = byComment('剧情指导2');
    a(r.ok === true && r.reason === 'ok' && r.mode === 'undo' && r.restored === '剧情指导',
      'D3: 撤销把**上一版本**恢复生效（restored=' + r.restored + '）');
    a(!!o2 && o2.enabled !== false && !!n2 && n2.enabled === false && r.liveAfter === 1 && r.singleLive === true,
      'D3b: 对称交换真发生（旧启用 ' + (o2 && o2.enabled) + ' / 新禁用 ' + (n2 && n2.enabled)
        + ' / 台面生效 ' + r.liveAfter + ' 条）—— 写后复查三件同 apply');
    a(o2 && o2.content === '乙段' && book().length === 2,
      'D3c: 恢复的那条内容原样（禁用不是删除 ⇒ 历史真的在世界书里，总条数仍 ' + book().length + '）');
    a(W.outlineInject.stat().undone === 1 && W.outlineInject.stat().verified === 3,
      'D3d: 撤销计入独立读数 undone（实 ' + W.outlineInject.stat().undone + '；两次 apply + 一次撤销 ⇒ 复查通过 ' + W.outlineInject.stat().verified + '）—— 撤销也是一次真写入，与 apply 的成功分开记');
    const r2 = W.outlineInject.resetStat();
    a(r2.ok === true && W.outlineInject.stat().undone === 0,
      'D3e: resetStat 把 undone 一并清零（漏清零会让「本次进程撤销了几次」长期虚高）');
  })();
  // D4 撤销的两种如实拒收
  await (async function () {
    const W = envWith(ov).WA;
    // ① 世界书里没有被禁用的旧条目 ⇒ no-previous（**真的没有上一版本**，不是「撤销失败」）
    seed([{ comment: '剧情指导', enabled: true, content: '只有一条' }]);
    const r1 = await W.outlineInject.undo([], { worldbookName: BOOK });
    a(r1.ok === false && r1.reason === 'no-previous' && byComment('剧情指导').enabled !== false,
      'D4: 没有上一版本时如实报 no-previous（实 ' + r1.reason + '）且零写入 —— 不伪造一个「上一版」出来');
    // ② 无更新能力 ⇒ no-update-api（不做「建一条新的冒充回退」）
    seed([{ comment: '剧情指导', enabled: true, content: '新' },
      { comment: '剧情指导2', enabled: false, content: '旧' }]);
    const orig = global.TavernHelper.updateWorldbookWith;
    delete global.TavernHelper.updateWorldbookWith;
    const r2 = await W.outlineInject.undo([], { worldbookName: BOOK });
    global.TavernHelper.updateWorldbookWith = orig;
    a(r2.ok === false && r2.reason === 'no-update-api' && global.__wbUpdateCalls === 0
      && byComment('剧情指导').enabled !== false && byComment('剧情指导2').enabled === false,
      'D4b: 缺更新能力时整体拒收 no-update-api（实 ' + r2.reason + '）且零写入（两半都没动）—— 不做假的回退');
  })();
  // D5 撤销不动世界状态（不新增存档键 —— 第十条）
  await (async function () {
    const W = envWith(ov).WA;
    await W.outlineInject.apply(TAG_IN, [], { worldbookName: BOOK });
    await W.outlineInject.apply(TAG_IN, book(), { worldbookName: BOOK });
    const before = JSON.stringify(W.store.get());
    await W.outlineInject.undo([], { worldbookName: BOOK });
    a(!('outlineInject' in W.store.get()), 'D5: 撤销没有新增 store 键（上一版本住在世界书里，不需要第二真源）');
    a(JSON.stringify(W.store.get()) === before, 'D5b: 撤销前后存档逐字不变');
  })();
/* ============ E 面板面（计划原文：「在既有章节工作台提供…路径」）============ */
  //   为什么必须判「渲染 + 绑定 + 守卫登记」三件：本仓点过名的病是「控件渲染了但绑定的
  //   id 写错」—— 只有登记进 UI_BINDINGS 的控件才会被守卫发现（tool-diag 的 secUi）。
  //   本段同时咬一条**边界**：四枚里**有且只有一个写口**（采纳注入），预览必须零写口。
  (function () {
    const P = rd('ui/panel.js', ov);
    const D = rd('engines/tool-diag.js', ov);
    const IDS = ['wa-oi-text', 'wa-oi-mode', 'wa-oi-view', 'wa-oi-preview', 'wa-oi-apply', 'wa-oi-undo'];
    const badR = IDS.filter(function (id) { return cnt(P, 'id="' + id + '"') !== 1; });
    a(badR.length === 0, 'E1: 六枚控件在渲染段各恰 1 次（不合：' + (badR.join(',') || '无') + '）');
    const badB = ['wa-oi-view', 'wa-oi-preview', 'wa-oi-apply', 'wa-oi-undo']
      .filter(function (id) { return cnt(P, "on('#" + id + "'") !== 1; });
    a(badB.length === 0, 'E1b: 四枚按钮各有 onclick 绑定恰 1 处（不合：' + (badB.join(',') || '无') + '）—— '
      + '「渲染了但绑定写错 id」正是本仓反复治的断裂');
    const badG = IDS.concat(['wa-oi-out']).filter(function (id) { return cnt(D, "'" + id + "'") !== 1; });
    a(badG.length === 0, 'E1c: 六枚 + 读数出口在 tool-diag 守卫表里各登记恰 1 次（不合：' + (badG.join(',') || '无') + '）');
    a(cnt(D, "{ page: 'chapter', ids:") === 1, 'E1d: 守卫表 chapter 页分组仍是唯一一处（没有另起一个同页分组）');
    // 唯一写口：先**剥行注释**再数 —— 注释里的 `WA.outlineInject.apply()` 是文档不是调用
    //   （本仓口径：「提及不是引用」；这条在 Y2 首跑时已被实测踩过一次）。
    const Pc = P.split('\n').map(function (l) {
      const i = l.indexOf('//');
      return i < 0 ? l : l.slice(0, i);
    }).join('\n');
    a(cnt(Pc, 'WA.outlineInject.apply(') === 1, 'E2: 面板里 `WA.outlineInject.apply(` 恰 1 处（实 '
      + cnt(Pc, 'WA.outlineInject.apply(') + '，去注释后）—— 采纳是**唯一**写口，别处不得顺手写');
    a(cnt(Pc, 'WA.outlineInject.preview(') === 1 && cnt(Pc, 'WA.outlineInject.undo(') === 1
      && cnt(Pc, 'WA.outlineInject.view(') === 1,
      'E2b: 看口径 / 预览 / 撤销各有唯一调用点（实 ' + cnt(Pc, 'WA.outlineInject.preview(') + '/'
        + cnt(Pc, 'WA.outlineInject.undo(') + '/' + cnt(Pc, 'WA.outlineInject.view(') + '）');
    // 与 Y2「只读」口径的关系必须**写在代码里**（不靠口头承诺）：本页自述里要有这条差异
    a(P.indexOf('本页<b>只读</b>') >= 0 && P.indexOf('不同规') >= 0,
      'E3: 页面把「六枚只读 / 本段不同规」两件事同时写明（改口径必须可见，不许偷改）');
    a(P.indexOf('零 store.transact') >= 0 || P.indexOf('不写任何 store 键') >= 0,
      'E3b: 本段明写不动世界状态（store）—— Y2 的 C2「活世界逐字不变」因此在拼接后仍成立');
  })();
  console.log('\n\u25a0 N 负控制：真源码破坏 → 装载破坏副本 → 重跑同款判据');
  await runNegative(a, S);
}

function brk(src, txt, repl) {
  const n = cnt(src, txt);
  if (n !== 1) throw new Error('anchor hits=' + n);
  return src.replace(txt, repl);
}
async function runNegative(a, S) {
  S = S || rd(OI_REL);
  (function () {
    const self = rd(SELF_REL);
    const esc = function (t) { return t.replace(/\n/g, '\\n'); };
    const bad = Object.keys(ANCHOR).filter(function (k) { return cnt(self, esc(ANCHOR[k].txt)) !== 1; });
    a(bad.length === 0, 'N0: 锚点字面量在本文件恰 1 次（不合 ' + bad.join(',') + '）');
  })();
  // N1 破坏：取标签时不再记「最后一次」⇒ 退化成「取不到」
  (function () {
    const S1 = brk(S, ANCHOR.oiExtractLast.txt, 'void m;');
    const ov = {}; ov[OI_REL] = S1;
    const W = envWith(ov).WA;
    const p = W.outlineInject.plan(TAG_IN, [], { worldbookName: BOOK });
    a(p.ok === false && p.reason === 'no-open' && book().length === 0,
      'N1: 破坏版上两次闭合取不到内容、整段拒收（原版 ok 且取到「乙段」⇒ 「标签取尾」的两向自证）');
  })();
  // N2 破坏：新建时不再禁用旧条目 ⇒ 台面上真出现两份生效大纲
  await (async function () {
    const S2 = brk(S, ANCHOR.oiDisableCall.txt, 'void 0;');
    const ov = {}; ov[OI_REL] = S2;
    const W = envWith(ov).WA;
    await W.outlineInject.apply(TAG_IN, [], { worldbookName: BOOK });
    const r = await W.outlineInject.apply(TAG_IN, book(), { worldbookName: BOOK });
    a(r.ok === false && r.reason === 'verify-failed' && book().filter(function (e) { return e.enabled !== false; }).length === 2,
      'N2: 破坏版上写完后台面躺着 2 条生效大纲 ⇒ 复查拦下 verify-failed（reason=' + r.reason
        + ' / 生效 ' + book().filter(function (e) { return e.enabled !== false; }).length
        + ' 条）——原版 ok 且生效 1 条 ⇒ 「台面单一生效」的两向自证');
    // 反面对照（同一副本、去掉「旧条目」这个前提）：证明上面那条红只由「旧条目没被禁用」引起
    seed([]);
    const r2 = await W.outlineInject.apply(TAG_IN, [], { worldbookName: BOOK });
    a(r2.ok === true && r2.landed.length === 1 && r2.verified === true && book().length === 1,
      'N2c: 反面对照：同一破坏副本上没有旧条目时写入路径完全正常（landed ' + (r2.landed && r2.landed.length)
        + ' / 世界书 ' + book().length + ' 条）——N2 的红不是破坏把整条链打死了');
  })();
  await (async function () {
    const S2b = brk(S, ANCHOR.oiPrecheck.txt, 'void 0;');
    const ov = {}; ov[OI_REL] = S2b;
    const W = envWith(ov).WA;
    const r = await W.outlineInject.apply(TAG_IN, [{ comment: '剧情指导', enabled: true, content: '旧' }], { worldbookName: BOOK });
    a(r.ok === false && r.reason === 'entry-missing' && book().length === 1,
      'N2b: 破坏版上先建了新条目、才在禁用旧条目时拒收（世界书 ' + book().length + ' 条，半成品留在台面）'
        + '——原版零写入 ⇒ 「拦在动手之前」的两向自证');
  })();
  // N3 破坏：拿掉「无更新能力」那道闸 ⇒ 新条目已落盘才炸
  await (async function () {
    const S3 = brk(S, ANCHOR.oiNoCapGuard.txt, 'void 0;');
    const ov = {}; ov[OI_REL] = S3;
    const W = envWith(ov).WA;
    seed([{ comment: '剧情指导', enabled: true, content: '旧' }]);
    const orig = global.TavernHelper.updateWorldbookWith;
    delete global.TavernHelper.updateWorldbookWith;
    const r = await W.outlineInject.apply(TAG_IN, book(), { worldbookName: BOOK });
    global.TavernHelper.updateWorldbookWith = orig;
    a(r.reason === 'update-failed' && book().length === 2 && byComment('剧情指导').enabled === true,
      'N3: 破坏版上没有那道闸，新条目已落盘才在改旧条目时炸（reason=' + r.reason + ' / 世界书 ' + book().length
        + ' 条，旧条目仍生效）——原版零写入且 reason=no-update-api ⇒ 两向自证');
  })();
  // N4 破坏：跳过内容逐字核对 ⇒ 谎报成功
  await (async function () {
    const S4 = brk(S, ANCHOR.oiBodyOK.txt, 'const bodyOK = true;');
    const ov = {}; ov[OI_REL] = S4;
    const W = envWith(ov).WA;
    const TH = global.TavernHelper;
    const orig = TH.getWorldbook;
    let n = 0;
    TH.getWorldbook = async function (name) {
      n++;
      const r = await orig(name);
      if (n >= 2) return (r || []).map(function (e) { return Object.assign({}, e, { content: '被宿主改写' }); });
      return r;
    };
    const r = await W.outlineInject.apply(TAG_IN, [], { worldbookName: BOOK });
    TH.getWorldbook = orig;
    a(r.ok === true && r.verified === true,
      'N4: 破坏版上内容与计划不一致却报成功（reason=' + r.reason + '）——原版 verify-failed ⇒ 「不假装成功」的两向自证');
  })();
  // N5 破坏：新增导出不登记进导出面（出口面契约是双向的）
  (function () {
    const S5 = brk(S, ANCHOR.oiExport.txt, 'apply: apply,');
    const ov = {}; ov[OI_REL] = S5;
    const e0 = envWith(ov);
    const live = Object.keys(e0.WA.outlineInject);
    a(live.indexOf('updateCapability') < 0 && live.indexOf('apply') >= 0,
      'N5: 破坏版上 updateCapability 根本不在导出面上（实 ' + live.indexOf('updateCapability')
        + '）——而契约串仍写着它 ⇒ C2b 的悬空判据会红（能力没进导出面 = 专锁测不到、诊断包不住）');
  })();
  // N6 工具两向自证
  let threw = false;
  try { brk(S, 'THIS-DOES-NOT-EXIST-OPT7', 'x'); } catch (e) { threw = e.message === 'anchor hits=0'; }
  a(threw, 'N6: 锚点不存在必须抛（不静默 0 命中）');
  threw = false;
  try { brk(S, 'if (', 'x'); } catch (e) { threw = /anchor hits=\d+/.test(e.message) && e.message !== 'anchor hits=1'; }
  a(threw, 'N6b: 锚点不唯一必须抛');
  // N8 破坏：预览不再零写入（把「它不是执行面」这条抹掉 ⇒ 读数开始谎报）
  await (async function () {
    const S8 = brk(S, ANCHOR.oiPreviewZero.txt, 'applied: 1, writes: 1 };');
    const ov8 = {}; ov8[OI_REL] = S8;
    const W = envWith(ov8).WA;
    const r = await W.outlineInject.preview(TAG_IN, { worldbookName: BOOK });
    a(r.applied === 1 && r.writes === 1,
      'N8: 破坏版上预览谎报成执行面（applied=' + r.applied + ' / writes=' + r.writes
        + '）—— 原版两者都是 0（D1d）⇒ 「预览不是执行面」的两向自证');
  })();
  // N8b 正控（同一判据、原版源码）：必须报 0
  await (async function () {
    const W = envWith().WA;
    const r = await W.outlineInject.preview(TAG_IN, { worldbookName: BOOK });
    a(r.applied === 0 && r.writes === 0 && typeof r.then === 'undefined',
      'N8b: 正控 —— 原版预览报 applied/writes 都是 0（实 ' + r.applied + '/' + r.writes
        + '）⇒ N8 的红来自破坏，不是判据恒真');
  })();
  // N9 破坏：撤销不再做对称交换（把「启用上一版」这一半去掉）⇒ 台面上一条都不生效
  await (async function () {
    const S9 = brk(S, ANCHOR.oiUndoSwap.txt, '    // （破坏：撤销不再启用上一版本）');
    const ov = {}; ov[OI_REL] = S9;
    const W = envWith(ov).WA;
    await W.outlineInject.apply(TAG_IN, [], { worldbookName: BOOK });
    await W.outlineInject.apply(TAG_IN, book(), { worldbookName: BOOK });
    const r = await W.outlineInject.undo([], { worldbookName: BOOK });
    const liveN = book().filter(function (e) { return e && e.enabled !== false; }).length;
    a(r.ok === false && r.reason === 'verify-failed' && liveN === 0,
      'N9: 破坏版上「启用上一版」被抹掉 ⇒ 台面 0 条生效、复查拦下 verify-failed（reason=' + r.reason
        + ' / 生效 ' + liveN + ' 条）—— 原版 ok 且生效 1 条 ⇒ 「对称交换」的两向自证');
  })();
  // N10 破坏：面板把「采纳」也走成只读（写口被摘掉）⇒ E2 的判据必须现形
  (function () {
    const P = rd('ui/panel.js');
    const S10 = P.split('WA.outlineInject.apply(').join('WA.outlineInject.view(');
    //   与 E2 同一口径（**去注释**后数）：注释里的提及不是调用
    const stripC = function (src) {
      return src.split('\n').map(function (l) { const i = l.indexOf('//'); return i < 0 ? l : l.slice(0, i); }).join('\n');
    };
    a(cnt(stripC(S10), 'WA.outlineInject.apply(') === 0 && cnt(stripC(P), 'WA.outlineInject.apply(') === 1,
      'N10: 把面板里唯一的 apply 调用点换成 view ⇒ E2 的「恰 1 处」判据现形（实 '
        + cnt(stripC(S10), 'WA.outlineInject.apply(') + ' 处，原版 ' + cnt(stripC(P), 'WA.outlineInject.apply(')
        + ' 处）—— 唯一写口被摘掉必须被看见');
  })();
  // N7 真源码逐字未变
  a(rd(OI_REL) === S, 'N7: 被破坏过的引擎真源码逐字未变（破坏只发生在内存副本上）');
}

module.exports = { runAll: runAll, runNegative: runNegative, ANCHOR: ANCHOR };
if (require.main === module) {
  (async function () {
    let pass = 0, fail = 0;
    const a = function (ok, name, extra) {
      if (ok) { pass++; } else { fail++; console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
    };
    try { await runAll(a); } catch (e) { fail++; console.log('  \u2717 判据失效：' + (e && e.stack)); }
    console.log('\nOPT7-V2231: ' + pass + ' / 失败 ' + fail);
    if (fail) process.exitCode = 1;
  })();
}
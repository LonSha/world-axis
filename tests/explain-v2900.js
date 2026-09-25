#!/usr/bin/env node
// WorldAxis tests/explain-v2900.js —— v2.90.0（O3 每轮执行解释 / 玩家·全知诊断分离）
//
// 【它治的病：一轮执行完，「为什么是这样」没有任何可读的答案】
//   `applyInjections` 逐段写的是 `if (vis.xx && WA.xx)`：判不过就跳过。于是四种**截然不同**
//   的局面在存档上长得一模一样（都是「这个源没出现在正文里」）：
//     · 用户把可见性关了（正常，是他自己关的）；
//     · 模块没加载 / 被禁用（装配问题）；
//     · 本轮确实没内容（世界没这块数据，正常）；
//     · 构建抛异常（**坏**，v2.86.0 才有台账）。
//   缺了分列，「世界状态为什么没进正文」只能靠人肉比对可见性配置。本版把事后归因钉上：
//   源表 47 项逐项给状态码，玩家面与全知面**分开**报。
//
// 【判据】（A 成类锁 / B 运行时 / C 缺陷锁 / N 负控制）
//   A1 explain 是 WA.render 的导出，且有**真消费方**（诊断 + 面板各自读它）。
//   A2 归因码是封闭集合，且 sourceDecisions 逐项覆盖 SOURCES（不多不少）。
//   A3 玩家面键集封闭（既不写进去、也不留在里面），且**值**里不出现归因码、不出现未落地源名。
//   A4 全知面逐源结构 = {key,name,state}，name 一律走显示名（不得裸露英文键名）。
//   A5 轮次真源只有一个（evolution.roundOf），applyInjections 不自己数轮次。
//   A6 纯读：explain 不改 store（取证不得改变被取证对象，与 O2 同一条纪律）。
//   B1 快照类源归 landed-in-state、非快照源真落地归 landed、玩家面落下「世界状态」。
//   B2 关掉**原本会落地**的源 ⇒ 该源归 visibility-off，且玩家面「未进项」+1（不谎报进了正文）。
//   B3 模块缺席 ⇒ 该源归 module-absent（与 visibility-off 分开）。
//      v2.91.0 起另有一档 module-off（模块装载了、但总开关关着）——缺席与被关是两件事。
//   B4 引擎抛异常 ⇒ 该源归 failed（与 no-content 分开：坏 ≠ 没内容）。
//   B5 无内容 ⇒ no-content（正常态，不等于坏）。
//   B6 未注入过 ⇒ ok:false / no-rotation（照实拒答，不编一份空解释）。
//   B7 轮次不符 ⇒ ok:false / round-not-recorded，并把 want/have 双双报出。
//   B8 轮次相符 ⇒ ok:true 且 round === 请求轮次。
//   B9 落盘：lastInjection.round 与 decisions 真写入（解释面才有东西可解释）。
//   B10 诊断面真消费：inject.explain 在场且计数与 explain 一致。
//   B11 面板面真消费：两枚按钮在场、绑定在场、且两枚各报一面（不合并）。
//   C1 源表每一项都有显示名（SRC_NAME 缺项会让解释面裸露英文键名）。
//   C2 两级守恒式各自闭合：全知面（源级）落地+未落地 = 源数；玩家面（块级）块数 = 快照 1 块 + 真落地源数。
//   N0 三个锚点在真源码各恰中 1 次；N1a/N1b/N1c 破坏 ⇒ B2/B4/B1 各自现形；
//      N2 影响面有限；N3 非恒真；N4 锚点工具两向自证（不存在/不唯一都必须抛）。
//
// 【首跑五处失败的教训（判据自己写错，不是实现错）】
//   ① 判「玩家面是否剧透」不能拿**整段 JSON** 去判：`player` 有个键就叫 `landed`，
//      序列化后必然命中状态码 `'landed'`——输入面选错会把正确实现判成缺陷。该判「键集 + 值」。
//   ② 判「关掉一个源 ⇒ 未进项 +1」必须关**原本会落地**的源：关一个本来 no-content 的源
//      只是换了归因码，计数当然不动（读数随事实变化，不是随配置变化）。
//   ③ 「未注入过」不能依赖环境恰好干净：共享 localStorage 里留着前一个用例的落盘，
//      必须显式把 lastInjection 置 null。
//   ④ 守恒式要挑对层级：`player.landed` 是**块级**（6 个快照源合记 1 项「世界状态」），
//      拿它与源数对账必然对不上；源级守恒属全知面，块级守恒写「快照 1 块 + 真落地源数」。
//   ⑤ 负控制破坏**不能删行**：链首 `if` 删掉会留下悬空 `else` ⇒ 破坏副本语法错误，
//      「装不起来」证明不了判据敏感。统一改**条件置假**（`if(false && …)`）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const gate = require('./ui-gate-sync.js');
const INJECT = path.join(BASE, 'render/inject.js');
const DIAG = path.join(BASE, 'engines/tool-diag.js');
const PANEL = path.join(BASE, 'ui/panel.js');
function src(p) { return fs.readFileSync(p, 'utf8'); }
/** v2.91.0：源键 → 模块 settings 键（与产品源码**同源**解析——抄一份副本
 *   就是「第二份实现」，产品改了表名它不再同步） */
const SRC_MOD_SETTING_OF = (function () {
  const t = fs.readFileSync(INJECT, 'utf8');
  const a = t.indexOf('const SRC_MOD_SETTING = {');
  if (a < 0) return {};
  const b = t.indexOf('};', a);
  const seg = t.slice(a, b), out = {}, re = /([A-Za-z_$][\w$]*)\s*:\s*'([^']+)'/g;
  let m; while ((m = re.exec(seg)) !== null) out[m[1]] = m[2];
  return out;
})();
// ── 三个真源码破坏锚点（各恰中 1 次才动刀）──
const ANCHOR_VIS = "else if (vis && vis[k] === false) st = 'visibility-off';";
const ANCHOR_FAIL = "else if (fails[name]) st = 'failed';";
const ANCHOR_LAND = "if (!isSnap && landedSet.indexOf(name) >= 0) st = 'landed';";
// 破坏形态：条件置假（删行会留下悬空 else ⇒ 破坏副本语法错误，等于什么都没证明）
const BREAK_VIS = "else if (false && vis && vis[k] === false) st = 'visibility-off';";
const BREAK_FAIL = "else if (false && fails[name]) st = 'failed';";
const BREAK_LAND = "if (false && !isSnap && landedSet.indexOf(name) >= 0) st = 'landed';";
// 归因码封闭集合（新增态必须在源码与本表同批增长）
// v2.91.0（O4）：新增 module-off（可见性勾着、模块级总开关关着）——封闭集合必须在
//   源码与判据**同批**增长，否则这份表就是一份陈旧常量：它会把正确的新实现判成「越界」。
const STATES = ['landed', 'landed-in-state', 'visibility-off', 'module-absent', 'module-off', 'failed', 'no-content'];
// 让一个**非快照**源真落地的哨兵：否则「落地/未落地」判据只在子集上恒真
const PAT = { longline: '<<TOK-LONGLINE>>' };
function hits(s, anchor) {
  const n = s.split(anchor).length - 1;
  if (n !== 1) throw new Error('锚点命中 ' + n + ' 次（要求恰 1 次）: ' + anchor.slice(0, 50));
  return n;
}
function fresh(ov) { return (ov ? gate.fresh({ srcOverride: ov }) : gate.fresh()).WA; }
function seed(WA) {
  WA.store.init();
  WA.store.transact(function (d) {
    // 显式复位：run.js 里本锁与前序用例共享 localStorage（v2.80.0 的故障台账事件即出在此），
    //   不重置就会读到上一个用例留下的存档——首跑曾因此把「未注入过」判成「有记录」。
    d.clock = { iso: '', label: '第1日', dayIndex: 0, source: 'unset' };
    d.background = { text: 'BG', updatedAt: 0 };
    d.people = {};
    d.people.p1 = { id: 'p1', name: '甲', location: 'A', action: '走' };
    d.evolution = d.evolution || {};
    d.evolution.round = 3;
    d.lastInjection = null;
    // v2.91.0：模块级总开关也**显式置定**。先前这里只设可见性，而本版起
    //   `module-off` 进归因链 ⇒ 前序用例关过哪个模块，本锁的读数就跟着变
    //   （首跑实测：org 因为被别处显式关掉，不再报 no-content）。
    WA.render.SOURCES.forEach(function (key) {
      const sk = SRC_MOD_SETTING_OF[key];
      if (!sk) return;
      const rg = (WA.__settingsRegs || []).filter(function (x) { return x && x.key === sk; })[0];
      if (!rg) return;
      const cur = WA.settingsBus.read(rg) || {};
      cur.enabled = true;                 // 全开：本锁治的是可见性与失败归因，不是模块开关
      WA.settingsBus.save(rg, cur);
    });
    // 长线伏笔：已过承诺时刻 ⇒ buildBlock 出内容 ⇒ longline 真落地（非快照源的正样本）
    d.memory = d.memory || {};
    d.memory.foreshadows = [{ id: 'f-' + PAT.longline, content: PAT.longline, status: 'waiting', dueAt: 1 }];
  }, 'explain-v2900:seed');
  WA.longline.setSettings({ enabled: true, graceMs: 0 });   // 与上面显式置定同向（冗余但不冲突）
  WA.render.SOURCES.forEach(function (k) { WA.render.setVisibility(k, true); });
}
function inject(WA) { WA.render.applyInjections({ injections: [] }); return WA.store.get().lastInjection; }
function stateOf(ex, key) {
  return (ex.omniscient.decisions.filter(function (x) { return x.key === key; })[0] || {}).state;
}
function runAll(a) {
  const W = fresh();
  seed(W);
  inject(W);
  const ex = W.render.explain();
  const sources = W.render.SOURCES;
  // ── A 面 ──
  a(typeof W.render.explain === 'function', 'v2900: [A1] render.explain 在场（每轮执行解释的取数口）');
  const diagSrc = src(DIAG), panSrc = src(PANEL);
  a(/WA\.render\.explain\(\)/.test(diagSrc), 'v2900: [A1] 诊断面是 explain 的**真消费方**（不是只导出没人读）');
  a(/WA\.render\.explain\(\)/.test(panSrc) && panSrc.indexOf('wa-inj-explain') > 0, 'v2900: [A1] 面板面是 explain 的真消费方（按钮 + 读取）');
  a(ex.ok === true && ex.round === 3, 'v2900: [A1] 轮次取自 evolution.roundOf（实 ' + ex.round + '）');
  const injSrc = src(INJECT);
  const set = STATES.filter(function (s) { return injSrc.indexOf("'" + s + "'") < 0; });
  a(set.length === 0, 'v2900: [A2] 七个归因码全部落在源码里（缺: ' + (set.join(',') || '无') + '）——v2.91.0 起含 module-off');
  const decKeys = ex.omniscient.decisions.map(function (x) { return x.key; });
  a(decKeys.length === sources.length && sources.every(function (k) { return decKeys.indexOf(k) >= 0; }),
    'v2900: [A2] sourceDecisions 逐项覆盖 SOURCES（' + decKeys.length + '/' + sources.length + '，不多不少）');
  const badState = ex.omniscient.decisions.filter(function (x) { return STATES.indexOf(x.state) < 0; });
  a(badState.length === 0, 'v2900: [A2] 归因码取封闭集合（越界: ' + (badState.map(function (x) { return x.key + '=' + x.state; }).join(',') || '无') + '）');
  // 判「值」而不是判整段 JSON：player 有个键就叫 landed，判 JSON 会自我命中
  const pKeys = Object.keys(ex.player).sort().join(',');
  a(pKeys === 'landed,missedCount,note,summary', 'v2900: [A3] 玩家面键集封闭（既不写进去也不留在里面，实 ' + pKeys + '）');
  const pVals = Object.keys(ex.player).map(function (k) { return ex.player[k]; })
    .filter(function (v) { return typeof v === 'string'; });
  const pj = pVals.join(' | ');
  a(STATES.every(function (s) { return pj.indexOf(s) < 0; }), 'v2900: [A3] 玩家面字符串值不含任何归因码（剧透守卫）');
  a(pj.indexOf('decisions') < 0, 'v2900: [A3] 玩家面不含逐源明细（结构上就不给它）');
  a(typeof ex.player.missedCount === 'number' && ex.player.missedCount > 0, 'v2900: [A3] 玩家面只给「还有几项没进」（实 ' + ex.player.missedCount + '）');
  const missNames = ex.omniscient.decisions.filter(function (x) { return x.state === 'no-content' || x.state === 'module-absent'; })
    .map(function (x) { return x.name; });
  const leaked = missNames.filter(function (n) { return pj.indexOf(n) >= 0; });
  a(leaked.length === 0, 'v2900: [A3] 玩家面不含未落地源的名字（漏: ' + (leaked.join('、') || '无') + '）');
  const badShape = ex.omniscient.decisions.filter(function (x) { return typeof x.key !== 'string' || typeof x.name !== 'string' || typeof x.state !== 'string'; });
  a(badShape.length === 0, 'v2900: [A4] 全知面逐源结构 = {key,name,state}');
  const bare = ex.omniscient.decisions.filter(function (x) { return x.name === x.key; });
  a(bare.length === 0, 'v2900: [A4] 显示名一律到位、不裸露英文键名（裸露: ' + (bare.map(function (x) { return x.key; }).join(',') || '无') + '）');
  a(/WA\.evolution\.roundOf\(\)/.test(injSrc) && injSrc.indexOf('roundNow') > 0, 'v2900: [A5] 轮次真源只有一个（跟 evolution.roundOf 走，不自己数）');
  const before = JSON.stringify(W.store.get().lastInjection);
  W.render.explain(); W.render.explain(3);
  a(JSON.stringify(W.store.get().lastInjection) === before, 'v2900: [A6] 纯读：explain 不改 store（取证不得改变被取证对象）');
  // ── B 面 ──
  a(stateOf(ex, 'clock') === 'landed-in-state' && stateOf(ex, 'people') === 'landed-in-state',
    'v2900: [B1] 有内容时快照类源归 landed-in-state（实 clock=' + stateOf(ex, 'clock') + '）');
  a(stateOf(ex, 'longline') === 'landed', 'v2900: [B1] 非快照源真落地归 landed（实 ' + stateOf(ex, 'longline') + '；否则本判据只在子集上恒真）');
  a(ex.player.landed.indexOf('世界状态') >= 0, 'v2900: [B1] 玩家面落下「世界状态」');
  // 关掉一个**原本会落地**的源：计数必须跟着事实走
  const W2 = fresh(); seed(W2);
  W2.render.setVisibility('longline', false);
  inject(W2);
  const ex2 = W2.render.explain();
  a(stateOf(ex2, 'longline') === 'visibility-off', 'v2900: [B2] 关掉的源归 visibility-off（实 ' + stateOf(ex2, 'longline') + '）');
  a(ex2.player.missedCount === ex.player.missedCount + 1,
    'v2900: [B2] 关掉原本会落地的源 ⇒「未进项」+1（' + ex.player.missedCount + ' → ' + ex2.player.missedCount + '），不谎报进了正文');
  a(ex2.player.landed.indexOf('长线伏笔') < 0, 'v2900: [B2] 关掉后玩家面不再列它（报「进了什么」必须真进过）');
  const W3 = fresh(); seed(W3);
  const keepIntel = W3.intel;
  try {
    delete W3.intel;   // 模块缺席（不是用户关的，也不是没内容）
    inject(W3);
    const ex3 = W3.render.explain();
    a(stateOf(ex3, 'intel') === 'module-absent', 'v2900: [B3] 模块缺席归 module-absent（实 ' + stateOf(ex3, 'intel') + '）');
  } finally { W3.intel = keepIntel; }
  // 先取「无内容」局面的读数，再取「坏了」的：两个 ex 都是 explain 的**返回值对象**（快照），
  //   故后续 fresh 重装模块不影响比较；反过来拿旧变量 `W4.render.explain()` 去比就会读到新环境
  //   （fresh 重装模块、WA 是同一个对象 ⇒ 旧变量指向新 store）——首跑第二处失败正是这么来的。
  const W5 = fresh(); seed(W5);
  inject(W5);
  const ex5 = W5.render.explain();
  a(stateOf(ex5, 'life') === 'no-content', 'v2900: [B5] 无内容归 no-content（正常态，实 ' + stateOf(ex5, 'life') + '）');
  const W4 = fresh(); seed(W4);
  const keepLife = W4.life;
  W4.life = { buildBlock: function () { throw new Error('boom'); } };
  let ex4 = null;
  try {
    inject(W4);
    ex4 = W4.render.explain();
    a(stateOf(ex4, 'life') === 'failed', 'v2900: [B4] 构建抛异常归 failed（实 ' + stateOf(ex4, 'life') + '）');
    a(stateOf(ex4, 'org') === 'no-content', 'v2900: [B4] failed 与 no-content 互不混淆（坏 ≠ 没内容）');
  } finally { W4.life = keepLife; }
  a(!!ex4 && stateOf(ex4, 'life') !== stateOf(ex5, 'life'),
    'v2900: [B5] 同一个源在「没内容」与「坏了」两种局面上归因不同（' + stateOf(ex5, 'life') + ' vs ' + (ex4 && stateOf(ex4, 'life')) + '）——分列才有意义');
  const W6 = fresh();
  W6.store.transact(function (d) { d.lastInjection = null; }, 'explain-v2900:clear');  // 显式清，不赌环境干净
  const ex6 = W6.render.explain();
  a(ex6.ok === false && ex6.reason === 'no-rotation', 'v2900: [B6] 未注入过 ⇒ 照实拒答 no-rotation（不编空解释）');
  // 轮次三态另起一个局部环境：老变量 W 在 fresh 之后看到的是新 store（同一个 WA 对象），
  //   复用它等于拿被后续用例清过的存档去判「这一轮」，首跑第三处失败就是这么来的。
  const W8 = fresh(); seed(W8); inject(W8);
  const ex7 = W8.render.explain(99);
  a(ex7.ok === false && ex7.reason === 'round-not-recorded' && ex7.want === 99 && ex7.have === 3,
    'v2900: [B7] 轮次不符 ⇒ 拒答并把 want/have 双双报出（实 ' + ex7.reason + ' ' + ex7.want + '/' + ex7.have + '）');
  const ex8 = W8.render.explain(3);
  a(ex8.ok === true && ex8.round === 3, 'v2900: [B8] 轮次相符 ⇒ 正常作答');
  const li = W8.store.get().lastInjection;
  a(li && li.round === 3 && Array.isArray(li.decisions) && li.decisions.length === sources.length,
    'v2900: [B9] lastInjection 真落盘 round 与 decisions（实 round=' + (li && li.round) + ' / ' + ((li && li.decisions) || []).length + ' 条）');
  const W7 = fresh(); seed(W7); inject(W7);
  const d7 = W7.toolDiag.collect();
  a(!!(d7.inject && d7.inject.explain && d7.inject.explain.round === 3),
    'v2900: [B10] 诊断面真消费：inject.explain 在场且轮次一致');
  a(d7.inject.explain.candidates === W7.render.explain().omniscient.candidates,
    'v2900: [B10] 诊断读数与 explain 一致（同源，不是第二份实现）');
  const btn = panSrc.indexOf('id="wa-inj-explain"') > 0 && panSrc.indexOf('id="wa-inj-explain-all"') > 0;
  const bind = panSrc.indexOf("on('#wa-inj-explain'") > 0 && panSrc.indexOf("on('#wa-inj-explain-all'") > 0;
  a(btn && bind, 'v2900: [B11] 面板两枚按钮渲染 + 绑定都在场');
  // 判据按**真源码实况**写：面板取值是 `const p = ex.player` 后 `p.summary`（不是 `ex.player.summary`），
  //   照假设写会把正确实现判成缺陷（本版第三次踩「按假设写判据」的坑，前两次是缩进空格数与判整段 JSON）。
  a(panSrc.indexOf('const p = ex.player') > 0 && panSrc.indexOf('p.summary') > 0
    && panSrc.indexOf('om.decisions.forEach') > 0,
    'v2900: [B11] 两枚按钮各报一面：玩家面只报摘要句、全知面才逐源列名（不合并成一个输出框）');
  // 变量名不是无关细节：面板里那个「全知面」局部变量若叫 `o`，就会被 v2.39.0 的
  //   顶层 `.round` 幽灵扫描命中（标识符集含 `o`）——而它读的是 explain 的返回值，不是世界状态。
  //   此处正面钉住该命名约束，免得后来者「顺手改回短名」再触发那道门禁。
  a(panSrc.indexOf('const o = ex.omniscient') < 0,
    'v2900: [B11] 全知面局部变量不叫 `o`（否则被顶层 .round 幽灵扫描误判为读世界状态）');
  // ── C 面 ──
  const nameMap = (function () {
    const s = injSrc;
    const i = s.indexOf('const SRC_NAME = {');
    const j = s.indexOf('\n  };', i);
    const seg = s.slice(i, j), out = {}, re = /([A-Za-z_$][\w$]*)\s*:\s*'/g;
    let m; while ((m = re.exec(seg)) !== null) out[m[1]] = true;
    return out;
  })();
  const noName = sources.filter(function (k) { return !nameMap[k]; });
  a(noName.length === 0, 'v2900: [C1] 源表每一项都有显示名（缺: ' + (noName.join(',') || '无') + '）');
  // 守恒式要挑对层级：全知面是源级，玩家面是块级
  a(ex.omniscient.landedCount + ex.omniscient.missedCount === sources.length,
    'v2900: [C2] 全知面源级守恒：落地 ' + ex.omniscient.landedCount + ' + 未落地 ' + ex.omniscient.missedCount + ' = 源面 ' + sources.length);
  const snapN = 6, landedN = ex.omniscient.landedCount - snapN;
  a(ex.player.landed.length === 1 + landedN,
    'v2900: [C2] 玩家面块级守恒：' + ex.player.landed.length + ' 块 = 世界状态 1 块 + 真落地源 ' + landedN + ' 个（块级不是源级）');
  a(Array.isArray(ex.player.landed) && typeof ex.player.missedCount === 'number' && typeof ex.omniscient.decisions[0].key === 'string',
    'v2900: [C2] 玩家面给「进了什么」（可数），全知面给「为什么」（逐项）——两面不是同一份数据');
  // ── N 面 ──
  a(hits(injSrc, ANCHOR_VIS) === 1 && hits(injSrc, ANCHOR_FAIL) === 1 && hits(injSrc, ANCHOR_LAND) === 1,
    'v2900: [N0] 三个归因锚点在真源码各恰中 1 次');
  let threw = 0;
  try { hits(injSrc, '锚点根本不在源码里__xyz'); } catch (e) { threw++; }
  try { hits(injSrc + ANCHOR_VIS, ANCHOR_VIS); } catch (e) { threw++; }
  a(threw === 2, 'v2900: [N4] 锚点工具两向自证：不存在 / 不唯一都必须抛（实抛 ' + threw + '/2）');
}
/** 负控制：真源码破坏 → **装上破坏副本** → 在副本上重跑与正面判据**同款**的断言 */
function runNegative(a) {
  const s = src(INJECT);
  hits(s, ANCHOR_VIS); hits(s, ANCHOR_FAIL); hits(s, ANCHOR_LAND);
  const okEx = (function () { const W = fresh(); seed(W); inject(W); return W.render.explain(); })();
  // 不硬编码绝对计数：run.js 里本锁与前序 section 共享宿主面，别的 section 留下的世界内容
  //   会让额外几个源真出内容（直跑 40 / 全量 37，差 3 全是外部残留）。判据只钉**相对事实**：
  //   落地源真落地 + 两个计数与源面守恒。硬编码容易漂的读数＝陈旧常量，本仓库明令禁止。
  a(stateOf(okEx, 'longline') === 'landed' && okEx.player.landed.indexOf('长线伏笔') >= 0,
    'v2900: [N3] 原版上落地源真落地（longline=' + stateOf(okEx, 'longline') + '）——判据不是瞎报');
  a(okEx.omniscient.landedCount + okEx.omniscient.missedCount === okEx.omniscient.candidates && okEx.player.missedCount > 0,
    'v2900: [N3] 原版读数自洽且非零：落地 ' + okEx.omniscient.landedCount + ' + 未落地 ' + okEx.omniscient.missedCount
      + ' = 候选 ' + okEx.omniscient.candidates + '（玩家面未进 ' + okEx.player.missedCount + '）');
  // N1a：把「可见性关」那条归因置假 ⇒ 关掉的源应被错报成 no-content（B2 现形）
  const b1 = s.replace(ANCHOR_VIS, BREAK_VIS);
  a(b1 !== s, 'v2900: [N1a] 破坏确实改写了源码（置假 visibility-off 归因）');
  const Wa = fresh({ 'render/inject.js': b1 }); seed(Wa);
  Wa.render.setVisibility('longline', false);
  inject(Wa);
  const ea = Wa.render.explain();
  a(stateOf(ea, 'longline') === 'no-content',
    'v2900: [N1a] 破坏后 B2 现形：关掉的源被错报成 ' + stateOf(ea, 'longline') + '（判据不是瞎的）');
  // 对照面：原版**同样关掉这个源**时的读数（不是全开的读数——关一个落地源本来就会让未进项 +1，
  //   破坏只该错归因码、不该错计数）。首跑第四处失败用的是全开读数，等于拿两件不同的事对账。
  const okOff = (function () { const W = fresh(); seed(W); W.render.setVisibility('longline', false); inject(W); return W.render.explain(); })();
  a(ea.player.missedCount === okOff.player.missedCount,
    'v2900: [N2] 影响面有限：归因码错、计数不错（破坏 ' + ea.player.missedCount + ' vs 原版关源 ' + okOff.player.missedCount + '）');
  // N1b：把「构建失败」那条归因置假 ⇒ 抛异常的源应被错报成 no-content（B4 现形）
  const b2 = s.replace(ANCHOR_FAIL, BREAK_FAIL);
  a(b2 !== s, 'v2900: [N1b] 破坏确实改写了源码（置假 failed 归因）');
  const Wb = fresh({ 'render/inject.js': b2 }); seed(Wb);
  const keep = Wb.life;
  Wb.life = { buildBlock: function () { throw new Error('boom'); } };
  try {
    inject(Wb);
    const eb = Wb.render.explain();
    a(stateOf(eb, 'life') === 'no-content',
      'v2900: [N1b] 破坏后 B4 现形：坏源被错报成 ' + stateOf(eb, 'life') + '（坏 ≠ 没内容）');
  } finally { Wb.life = keep; }
  // N1c：把「真落地」那条归因置假 ⇒ 真落地的源应被错报成未落地（B1 现形）
  const b3 = s.replace(ANCHOR_LAND, BREAK_LAND);
  a(b3 !== s, 'v2900: [N1c] 破坏确实改写了源码（置假 landed 归因）');
  const Wc = fresh({ 'render/inject.js': b3 }); seed(Wc);
  inject(Wc);
  const ec = Wc.render.explain();
  a(stateOf(ec, 'longline') === 'no-content' && ec.omniscient.landedCount === 6,
    'v2900: [N1c] 破坏后 B1 现形：真落地的源被错报成未落地（实 landedCount=' + ec.omniscient.landedCount + ' / longline=' + stateOf(ec, 'longline') + '）');
  a(ec.player.landed.length === 1, 'v2900: [N1c] 玩家面也不再列它（实列 ' + ec.player.landed.length + ' 块）');
  // N3：非恒真——读数确实随事实变化
  const Wd = fresh(); seed(Wd); inject(Wd);
  const okMiss = Wd.render.explain().player.missedCount;
  Wd.render.setVisibility('longline', false); Wd.render.setVisibility('org', false);
  inject(Wd);
  const offMiss = Wd.render.explain().player.missedCount;
  a(offMiss === okMiss + 1, 'v2900: [N3] 非恒真：全开未进 ' + okMiss + ' / 关掉落地源后 ' + offMiss + '（读数随事实变化；关 no-content 源不计数）');
}
module.exports = { runAll: require('./lock-assert.js').restoring(runAll), runNegative: require('./lock-assert.js').restoring(runNegative) };
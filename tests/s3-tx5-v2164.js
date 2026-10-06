#!/usr/bin/env node
// v2.164.0 专锁（TX5）：版本化完整世界蓝图（engines/world-blueprint.js）。
//
// ── 本锁治的三件事（TX5 原文逐句落地）──────────────────────────────
//   TX5 要求「导出一份能**原样搬走**的世界」：稳定 ID、别名映射、方向化关系、道路端点、
//   日历起点、可选场景模板、默认清零。它与 v2.155.0 的种子库是**同一族问题的两个档位**：
//     种子（有损）：只有显示名 —— 两个同名人物在种子里长得一模一样（导入后合并成一个）；
//     蓝图（无损）：每个实体一个由「类别+名字+同名序号」决定的 key —— 同名不合并、按 key 引用。
//   本锁锁的就是这条分水岭，以及它带来的三处**静默失效**风险：
//     ① **同名被静默合并**：稳定 key 若不把「同名序号」计入输入面，两个「张三」拿到同一个 key，
//        导入时后一个覆盖前一个 —— 而这与「世界上只有一个张三」在读数上完全同形。
//     ② **版本猜着收**：bpVer 对不上却按 v1 收下，静默污染目标存档（「包是好的只是旧」
//        与「包是坏的」在处置上是两件事）。
//     ③ **非空目标被覆盖**：安装只该作用于空新局；判据若只看 round，一个装了人却没推进轮次
//        的世界会被当成空局而**被覆盖** —— 那正是玩家最贵的一类损失。
//
// ── 判据分三层（按「静默失效」代价排序）──────────────────────────
//   A 结构面：白名单、稳定 key、方向化、端点复原、场景默认、容量 per-call、六处登记同值。
//   B 行为面（真 API，不直调内部函数）：
//     B1 往返可复现：同输入两次导出得到同一组 key（key 由内容决定，不由随机 id 决定）
//     B2 同名不合并：两个同名人物各自拿到不同 key
//     B3 引用完整：道路端点按 key 复原（**这是蓝图对种子的净增量**）+ 关系方向化
//     B4 白名单：memory / relationships / persona 三节都不得进蓝图，而静态人设**必须在**
//     B5 写口只写自己那一格（只动 blueprint.library，不碰人物表）
//     B6 导入预览不写世界（预览前后世界逐字节相同；预览一次映射即定格）
//     B7 导入确认：空新局装完结构 + 写 blueprint.installed + 进度归零 + 关系按 key 复原
//     B8 非空目标拒收（不覆盖既有存档）
//     B9 未知版本拒收（不按 v1 猜着收）
//     B10 库满拒收（不静默挤掉旧蓝图）
//   N 负控制（**真源码内存副本**破坏，两向自证）：每条先证「原版上同款判据为真」，
//     再证「破坏版上同款判据为假」，最后证「真源文件逐字未变」。
//     N0 前置：造局与导出本身成功（否则后面每一条负控制都可能是「坏在别处」）
//     N1 稳定 key 丢掉同名序号 ⇒ 两个同名人物撞成同一 key（缺陷复现）
//     N2 版本门改成「一律放行」⇒ 未来版本的蓝图被静默收下（缺陷复现）
//     N3 事务内非空复核拆掉 ⇒ **嵌套事务**里刚写脏的 draft 被覆盖（缺陷复现）
//
//   N3 为什么走**嵌套事务**：事务外预检读的是 `memCache`（提交态），事务内复核读的是
//   **本批的 draft**。单机顺序调用里两者恒同 —— 于是那道事务内复核看上去「永不生效」。
//   它真正生效的唯一入口是**引擎组合**：别的引擎在自己的 `transact` 里调 `importBlueprint`，
//   此时外层 mutator 已经往 draft 写过东西，而 `memCache` 仍是空的 —— 事务外预检放行、
//   事务内复核拦住。这正是「事务外预检可以被过时现场骗过，事务内那道是最后一道」的字面含义，
//   也是本项负控制必须走嵌套路径、而不能走「先预览再把世界写脏」的原因（后者拦在预检上，
//   破坏事务内那道也照样被拦 —— 那样测出来的是预检，不是最后一道）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');

const REL = 'engines/world-blueprint.js';
const REL_STORE = 'core/store.js';
const REL_EVICT = 'core/evict.js';
const REL_DIAG = 'engines/tool-diag.js';
const REL_INDEX = 'index.js';
const REL_RUN = 'tests/run.js';
const REL_PANEL = 'ui/panel.js';

// ── 锚点（真源码里各恰中 1 次）─────────────────────────────────
// 锚点一取**稳定 key 的输入面**：它少了「同名序号」两个同名人物就撞成一个 key，
//   少了「类别」则人物与地点同名时互撞 —— 两种都在读数上与「世界本来就这样」同形。
const A_KEY = "    return 'bk_' + kind.slice(0, 2) + '_' + sig(kind + '|' + name + '|' + idx) + '_' + idx;";
// 锚点二取**版本门**：它是「未知版本明确拒收」这条纪律的唯一实现处。
const A_VER = '    if (num(bp.bpVer) !== BP_VER) {';
// 锚点三取**事务内非空复核**：事务外那道预检可以过时（预览与确认之间世界可能被写过），
//   事务内这道是**最后一道**——拆了它，非空 draft 会被覆盖而事务照样提交。
const A_INNER = '      const ecIn = targetEmpty(root);';
// 锚点四取**安装留痕**：它是「这个世界从哪张蓝图来」的持久真源（跨会话要留下）。
const A_STAMP = '      root.blueprint.installed = { bpVer: t.bpVer, bpSig: t.bpSig, worldKey: plan.worldKey,';
// 锚点五取**人设白名单**：memory / relationships / relations / persona 一律不进蓝图。
const A_SECS = "  const PROFILE_SECS = ['personality', 'worldview', 'family'];";
// 锚点六取**场景默认清零**：清零是**默认**，不是副作用。
const A_SCENE = "    return { id: id, enabled: enabled, zeroed: true,";
// 锚点七取**容量 per-call**：上限 = libCap 设置（静态登记而设置另有一套 = 点了没效果的开关）。
const A_CAP = "      if (WA.evict && typeof WA.evict.array === 'function') WA.evict.array(b.library, 'blueprint.library', cfg.libCap);";

function countOcc(s, sub) { return s.split(sub).length - 1; }
function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function ov(file, src) { const o = {}; o[file] = src; return o; }

let __seq = 0;
/** 起一个干净宿主（每例独立聊天 id —— 上一例的世界会黏在 memCache 上）。 */
function boot(srcOv) {
  const chatId = 'tx5_' + (++__seq);
  const WA = sync.fresh(srcOv ? { srcOverride: srcOv } : {}).WA;
  try {
    const c = global.SillyTavern.getContext();
    c.chatId = chatId; c.chatMetadata = {};
    c.chat = [{ is_user: true, mes: 'TX5 专锁锚点楼层：三足鼎立的格局里，两份同名册子摆在案上。', swipe_id: 0 }];
  } catch (e) {}
  WA.store.init();
  return WA;
}
/** 一个空新局宿主（蓝图安装的**唯一**合法目标）。 */
function emptyHost(srcOv) {
  const WA = boot(srcOv);
  WA.worldBlueprint.setSettings({ enabled: true, libCap: 8 });
  return WA;
}
/**
 * 造一个**非空的结构局面**（人物含同名对 + 关系 + 势力 + 地点 + 道路）。
 *   人设分节一律写**裸字符串**：`rosterOf` 走 `clean(x, 120)`，而 `clean` 对对象取
 *   `String(x)` ⇒ 写成 `{text:'谨慎'}` 会被串成 `[object Object]`，于是「人设没进蓝图」
 *   与「人设进了但被串化」在断言上同形 —— 夹具必须写成引擎真正支持的那一形态。
 */
function bones(WA, tag) {
  WA.store.transact(function (d) {
    d.blueprint = { library: [], seq: 0, installed: null };
    d.people = {};
    d.world = Object.assign({}, d.world, { places: [], roads: [] });
    d.evolution = Object.assign({}, d.evolution, { factions: [], round: 0 });
    d.chronicle = []; d.currents = []; d.echoes = []; d.worldFacts = [];
    d.meta = Object.assign({}, d.meta, { initFrom: null });
    if (d.economy) d.economy.goods = [];
  }, 'tx5:reset');
  // 人物必须经**唯一写者**（registry.ensurePerson）落进真实 draft。
  WA.store.transact(function (d) {
    WA.registry.ensurePerson(d, 'np_' + tag + 'a', tag + '张三', 'tx5');
    WA.registry.ensurePerson(d, 'np_' + tag + 'b', tag + '张三', 'tx5');   // **同名**（不同 id）
    WA.registry.ensurePerson(d, 'np_' + tag + 'c', tag + '李四', 'tx5');
    // 关系（方向化）：李四 → 张三甲
    d.people['np_' + tag + 'c'].profile = { relations: [{ target: 'np_' + tag + 'a', intimacy: 80 }] };
    // 静态人设三节（进蓝图）+ 私密三面（不进蓝图）
    d.people['np_' + tag + 'a'].profile = Object.assign(d.people['np_' + tag + 'a'].profile || {}, {
      personality: ['谨慎'], worldview: ['天命难违'], family: ['独子'],
      memory: ['这是私密记忆，绝不能进蓝图'],
      relationships: ['这是关系量值，绝不能进蓝图'],
      persona: { locked: true, note: '这是运行时人格骰面，绝不能进蓝图' }
    });
  }, 'tx5:people');
  WA.world.addPlace({ name: tag + '甲城', kind: 'home' });
  WA.world.addPlace({ name: tag + '乙城', kind: 'market' });
  WA.world.addRoad(tag + '甲城', tag + '乙城', 30);
  WA.store.transact(function (d) {
    d.evolution = Object.assign({}, d.evolution, { factions: [{ id: 'fa_' + tag, name: tag + '甲势力', power: 40 }] });
  }, 'tx5:fa');
  return { a: tag + '甲城', b: tag + '乙城' };
}
function worldSnap(WA) { return JSON.stringify(WA.store.get() || {}); }

// ── A 结构面 ─────────────────────────────────────────────────
function runA(a) {
  const src = read(REL), st = read(REL_STORE), ev = read(REL_EVICT), dg = read(REL_DIAG),
        ix = read(REL_INDEX), rn = read(REL_RUN), pn = read(REL_PANEL);
  a(countOcc(src, A_KEY) === 1, 'v2164/tx5 A1: 稳定 key 输入面锚点恰中 1 次（实 ' + countOcc(src, A_KEY) + '）');
  a(countOcc(src, A_VER) === 1, 'v2164/tx5 A2: 版本门锚点恰中 1 次（实 ' + countOcc(src, A_VER) + '）');
  a(countOcc(src, A_INNER) === 1, 'v2164/tx5 A3: 事务内非空复核锚点恰中 1 次（实 ' + countOcc(src, A_INNER) + '）');
  a(countOcc(src, A_STAMP) === 1, 'v2164/tx5 A4: 安装留痕锚点恰中 1 次（实 ' + countOcc(src, A_STAMP) + '）');
  a(countOcc(src, A_SECS) === 1, 'v2164/tx5 A5: 人设分节白名单锚点恰中 1 次（实 ' + countOcc(src, A_SECS) + '）');
  a(countOcc(src, A_SCENE) === 1, 'v2164/tx5 A6: 场景默认清零锚点恰中 1 次（实 ' + countOcc(src, A_SCENE) + '）');
  a(countOcc(src, A_CAP) === 1, 'v2164/tx5 A7: 环上限走 evict 单一出口且把 libCap **per-call 传进去**恰 1 次');
  // 白名单三节之外**不得**出现在 PROFILE_SECS 里（黑名单过滤不是白名单提取）
  a(src.indexOf("'memory'") >= 0 && src.indexOf("PROFILE_SECS = ['personality', 'worldview', 'family']") >= 0
    && src.indexOf("'memory', 'chronicle'") >= 0,
    'v2164/tx5 A8: 私密面（memory / chronicle）只在 excluded 申明里露面，不在 PROFILE_SECS 里');
  a(src.indexOf("WA.registerModule('engines/world-blueprint.js'") >= 0, 'v2164/tx5 A9: 模块自报登记');
  a(src.indexOf('__settingsRegs = (WA.__settingsRegs || []).concat([__REG])') >= 0,
    'v2164/tx5 A10: 设置键走 __settingsRegs 登记（自检可见，不是黑盒）');
  // 写口结构事实：库写口恰一处 + 导入确认恰一处（事务名互不复用）
  a(countOcc(src, "}, 'worldBlueprint:library');") === 1 && countOcc(src, "}, 'worldBlueprint:import');") === 1,
    'v2164/tx5 A11: 两个事务各有**显式事务名**且互不复用（实 '
      + countOcc(src, "}, 'worldBlueprint:library');") + '/' + countOcc(src, "}, 'worldBlueprint:import');") + '）');
  a(countOcc(src, 'WA.store.transact(') === 2 && countOcc(src, '.transact(') === 2,
    'v2164/tx5 A12: 全模块恰两处 transact 调用点（蓝图库写口 + 导入确认；实 ' + countOcc(src, '.transact(')
      + '）—— 新增第三处写面必须显式改本判据，不许静默长出');
  // 六处登记面（少一处即静默降级）
  a(ix.indexOf("'engines/world-blueprint.js',") >= 0, 'v2164/tx5 A13: index.js LOAD_ORDER 已登记');
  a(rn.indexOf("'engines/world-blueprint.js',") >= 0, 'v2164/tx5 A14: tests/run.js LOAD 已登记（与 index 同序）');
  a(dg.indexOf("'engines/world-blueprint.js': 'worldBlueprint'") >= 0 && dg.indexOf('secWorldBlueprint()') >= 0
    && dg.indexOf('worldBlueprint: secWorldBlueprint()') >= 0,
    'v2164/tx5 A15: tool-diag 三件齐做（MODULE_EXPORTS + 诊断节 + collect 汇总行）');
  a(st.indexOf('blueprint: { library: [], seq: 0, installed: null },') >= 0,
    'v2164/tx5 A16: store 骨架**物化** blueprint 容器（登记了却不在骨架里，registryParity 会报未物化）');
  a(st.indexOf("'blueprint.library':") >= 0 && ev.indexOf("'blueprint.library':") >= 0,
    'v2164/tx5 A17: 容量登记与挤出站点两处同名登记');
  a(pn.indexOf('id="wa-bp-import"') >= 0 && pn.indexOf("'#wa-bp-import'") >= 0,
    'v2164/tx5 A18: 面板有产品消费方（渲染 + 绑定）—— 死导出门禁的另一半');
  a(dg.indexOf("'wa-bp-import'") >= 0, 'v2164/tx5 A19: 面板控件登记进 UI_BINDINGS 守卫表');
  const self = read('tests/s3-tx5-v2164.js');
  a(countOcc(self, A_KEY) >= 1 && countOcc(self, A_VER) >= 1 && countOcc(self, A_INNER) >= 1
    && countOcc(self, A_STAMP) >= 1 && countOcc(self, A_SECS) >= 1 && countOcc(self, A_SCENE) >= 1
    && countOcc(self, A_CAP) >= 1,
    'v2164/tx5 A20: 七个锚点在本文件里至少各引用 1 次');
  // 两处登记逐键同值（cap 与 kind 都要对得上）
  const WA = boot();
  const caps = WA.store.sizeCaps ? WA.store.sizeCaps() : {};
  const decls = WA.evict.siteDecls ? WA.evict.siteDecls() : {};
  a(!!caps['blueprint.library'] && !!decls['blueprint.library']
    && caps['blueprint.library'].cap === 8 && decls['blueprint.library'].cap === 'per-call',
    'v2164/tx5 A21: 两处登记同键（store cap=8 / evict per-call；实 '
      + JSON.stringify(caps['blueprint.library'] && caps['blueprint.library'].cap) + '/'
      + JSON.stringify(decls['blueprint.library'] && decls['blueprint.library'].cap) + '）');
}

// ── B 行为面 ─────────────────────────────────────────────────
function runB(a) {
  const WA = boot();
  WA.worldBlueprint.setSettings({ enabled: true, libCap: 8 });
  const tag = 'tx5b';
  bones(WA, tag);
  const Bp = WA.worldBlueprint;

  // B1 往返可复现：同输入两次导出得到同一组 key
  const e1 = Bp.exportBlueprint();
  const e2 = Bp.exportBlueprint();
  a(e1.ok === true && e2.ok === true, 'v2164/tx5 B1: 两次导出都成功（实 ' + e1.reason + '/' + e2.reason + '）');
  const keys1 = e1.blueprint.ids.people.map(function (r) { return r.key; }).join(',');
  const keys2 = e2.blueprint.ids.people.map(function (r) { return r.key; }).join(',');
  a(keys1 === keys2 && keys1.length > 0,
    'v2164/tx5 B1b: 同一份世界两次导出得到**同一组 key**（key 由内容决定，不由随机 id 决定；实 '
      + keys1 + ' vs ' + keys2 + '）');

  // B2 同名不合并：两个「张三」各自拿到不同 key
  const people = e1.blueprint.ids.people;
  const zhangs = people.filter(function (r) { return r.name === tag + '张三'; });
  a(zhangs.length === 2, 'v2164/tx5 B2: 两个同名人物**都**进了蓝图（不合并；实 ' + zhangs.length + '）');
  a(zhangs.length === 2 && zhangs[0].key !== zhangs[1].key,
    'v2164/tx5 B2b: 两个同名人物拿到**不同**稳定 key（' + (zhangs[0] && zhangs[0].key) + ' vs '
      + (zhangs[1] && zhangs[1].key) + '）—— 同名被静默合并正是本模块存在的理由');

  // B3 引用完整：道路端点按 key 复原
  a(e1.blueprint.roads.length === 1
    && e1.blueprint.roads[0].a.indexOf('bk_pl_') === 0 && e1.blueprint.roads[0].b.indexOf('bk_pl_') === 0,
    'v2164/tx5 B3: 道路端点按**地点 key** 引用（实 ' + JSON.stringify(e1.blueprint.roads[0]) + '）—— 端点复原是蓝图对种子的净增量');
  a(e1.blueprint.relations.length === 1 && e1.blueprint.relations[0].dir === '->',
    'v2164/tx5 B3b: 关系**方向化**（from → to，带 dir；实 ' + JSON.stringify(e1.blueprint.relations[0]) + '）');

  // B4 白名单：私密三节都不得进蓝图；静态人设必须在
  const flat = JSON.stringify(e1.blueprint.roster);
  a(flat.indexOf('私密记忆') < 0 && flat.indexOf('关系量值') < 0 && flat.indexOf('人格骰面') < 0,
    'v2164/tx5 B4: memory / relationships / persona 三节**都**没进蓝图（白名单提取，不是黑名单过滤）');
  a(flat.indexOf('谨慎') >= 0 && flat.indexOf('天命难违') >= 0,
    'v2164/tx5 B4b: 受支持的静态人设（personality / worldview）**在**蓝图里（不得把好的一起滤掉）');
  a(e1.excluded.indexOf('memory') >= 0 && e1.excluded.indexOf('chronicle') >= 0,
    'v2164/tx5 B4c: 导出体如实申明**不含**哪些面（读的人不必去猜边界在哪）');

  // B5 写口只写自己那一格
  const sv = Bp.save('tx5蓝图', 'other');
  a(sv.ok === true && sv.total === 1, 'v2164/tx5 B5: 保存成功且库内 1 张（实 ' + sv.reason + '/' + sv.total + '）');
  const after = WA.store.get();
  a(after.blueprint && after.blueprint.library.length === 1 && (after.blueprint.seq || 0) === 1,
    'v2164/tx5 B5b: 写口只动 blueprint.library（seq 如实 +1；实 ' + JSON.stringify(after.blueprint && after.blueprint.seq) + '）');
  a(Object.keys(after.people || {}).length === 3,
    'v2164/tx5 B5c: 保存蓝图**不碰人物表**（实 ' + Object.keys(after.people || {}).length + ' 人）');

  // B6 预览不写世界（**必须**在空新局上预览：非空目标预览本就拒 not-empty，
  //   那是 B8 的判据，不能拿来当 B6 的现场 —— 否则「预览没写世界」会因为「预览根本没跑」而假绿）
  const WA6 = emptyHost();
  const before6 = worldSnap(WA6);
  const pv = WA6.worldBlueprint.previewImport(e1.blueprint);
  a(pv.ok === true, 'v2164/tx5 B6: 空新局上预览成功（实 ' + pv.reason + '）');
  a(worldSnap(WA6) === before6, 'v2164/tx5 B6b: 预览前后世界**逐字节相同**（预览不写世界 —— 一个会自己改世界的预览就是「确认」）');
  a(!!pv.plan && pv.plan._fixed === true && !!pv.scene && pv.scene.zeroed === true,
    'v2164/tx5 B6c: 预览一次映射即定格（_fixed）且场景默认清零（zeroed）');

  // B8 非空目标拒收（不覆盖既有存档）：预览后目标被写脏 ⇒ 确认必须拦住
  WA6.store.transact(function (d) { WA6.registry.ensurePerson(d, 'np_b8', 'B8路人', 'tx5'); }, 'tx5:b8-dirty');
  const imp8 = WA6.worldBlueprint.importBlueprint();
  a(imp8.ok === false && imp8.reason === 'not-empty',
    'v2164/tx5 B8: 预览之后目标变脏 ⇒ 拒收 not-empty（实 ' + imp8.reason + '）—— 不覆盖既有存档');

  // B7 空新局装完结构 + 写 installed + 进度归零
  const WA7 = emptyHost();
  const pv7 = WA7.worldBlueprint.previewImport(e1.blueprint);
  a(pv7.ok === true, 'v2164/tx5 B7-pre: 空新局预览成功（实 ' + pv7.reason + '）');
  const imp7 = WA7.worldBlueprint.importBlueprint();
  a(imp7.ok === true && imp7.installed && imp7.installed.people === 3,
    'v2164/tx5 B7: 空新局装完（人物 ' + (imp7.installed && imp7.installed.people) + ' · 地点 '
      + (imp7.installed && imp7.installed.places) + ' · 道路 ' + (imp7.installed && imp7.installed.roads) + '）');
  const w7 = WA7.store.get();
  a(w7.blueprint && w7.blueprint.installed && w7.blueprint.installed.bpSig === e1.bpSig,
    'v2164/tx5 B7b: 安装留痕写进 blueprint.installed（跨会话知道这个世界从哪张蓝图来）');
  a(w7.world.roads.length === 1 && w7.world.roads[0].a === tag + '甲城' && w7.world.roads[0].b === tag + '乙城',
    'v2164/tx5 B7c: 道路**端点如实复原**（实 ' + JSON.stringify(w7.world.roads[0] && [w7.world.roads[0].a, w7.world.roads[0].b]) + '）');
  a((w7.evolution.round || 0) === 0 && (w7.chronicle || []).length === 0 && (w7.echoes || []).length === 0,
    'v2164/tx5 B7d: 进度面**显式清零**（round ' + (w7.evolution.round || 0) + ' / 编年史 '
      + (w7.chronicle || []).length + ' / 回声 ' + (w7.echoes || []).length + '）');
  // 关系按 key 复原（方向保留）
  const idA = Object.keys(w7.people).filter(function (k) { return w7.people[k].name === tag + '李四'; })[0];
  const rels = idA ? (w7.people[idA].profile && w7.people[idA].profile.relations) || [] : [];
  a(rels.length === 1 && rels[0].intimacy === 60,
    'v2164/tx5 B7e: 关系按 key 复原且方向保留（李四 → 张三，near 档 intimacy 60；实 ' + JSON.stringify(rels[0] || null) + '）');
  // 重复安装：先查持久真源 installed（不误报 no-preview）
  const imp7b = WA7.worldBlueprint.importBlueprint();
  a(imp7b.ok === true && imp7b.reason === 'already',
    'v2164/tx5 B7f: 重复安装报 already（查持久真源 blueprint.installed，不误报 no-preview；实 ' + imp7b.reason + '）');

  // B9 未知版本拒收
  const WA9 = emptyHost();
  const bad9 = JSON.parse(JSON.stringify(e1.blueprint)); bad9.bpVer = 999;
  const r9 = WA9.worldBlueprint.previewImport(bad9);
  a(r9.ok === false && r9.reason === 'bad-bp-ver' && r9.got === 999 && r9.supported === 1,
    'v2164/tx5 B9: 未知版本拒收 bad-bp-ver 且交出 got/supported（实 ' + r9.reason + '）—— 不按 v1 猜着收');

  // B10 库满拒收
  //   两张蓝图必须**内容不同**（bpSig 不同）：save 默认取内存态 _last，同一份连存两次
  //   会先撞 duplicate-blueprint 而测不到 library-full —— 那是另一个码，判据会串味。
  const WA10 = boot();
  WA10.worldBlueprint.setSettings({ enabled: true, libCap: 1 });
  bones(WA10, 'tx5c');
  const e10 = WA10.worldBlueprint.exportBlueprint();
  const WA10b = boot();
  WA10b.worldBlueprint.setSettings({ enabled: true, libCap: 1 });
  bones(WA10b, 'tx5d');
  const e10b = WA10b.worldBlueprint.exportBlueprint();
  a(e10.ok === true && e10b.ok === true && e10.blueprint.bpSig !== e10b.blueprint.bpSig,
    'v2164/tx5 B10-pre: 两份内容不同的蓝图各导出成功且 bpSig 不同（避免撞 duplicate-blueprint）');
  const s10a = WA10.worldBlueprint.save('满1', 'other', { blueprint: e10.blueprint });
  const s10b = WA10.worldBlueprint.save('满2', 'other', { blueprint: e10b.blueprint });
  a(s10a.ok === true && s10b.ok === false && s10b.reason === 'library-full' && s10b.cap === 1,
    'v2164/tx5 B10: 库满拒收 library-full 并交出 cap（实 ' + s10b.reason + '/' + s10b.cap + '）—— 不静默挤掉旧蓝图');
  a(WA10.worldBlueprint.list().rows.length === 1,
    'v2164/tx5 B10b: 拒收后库内仍是 1 张（旧蓝图没被挤掉）');
  a(e10.ok === true, 'v2164/tx5 B10c: 造局与导出本身成功（前置条件成立）');
}

// ── N 负控制：真源码内存副本破坏，两向自证 ──────────────────
function runNegative(a) {
  const orig = read(REL);

  // N0 前置：造局与导出本身成功 —— 否则后面每条「破坏版行为变了」都可能是坏在别处
  const WAsrc = boot();
  WAsrc.worldBlueprint.setSettings({ enabled: true, libCap: 8 });
  bones(WAsrc, 'tx5ns');
  const esrc = WAsrc.worldBlueprint.exportBlueprint();
  a(esrc.ok === true, 'v2164/tx5 N0: 造局与导出本身成功（负控制的前置真判据；实 ' + esrc.reason + '）');
  const goodBp = esrc.blueprint;

  // ── N1 稳定 key 丢掉同名序号 ⇒ 两个同名人物撞成同一 key ──
  //   前置真判据：原版上两个同名人物拿到不同 key。
  const WAo1 = boot();
  WAo1.worldBlueprint.setSettings({ enabled: true, libCap: 8 });
  bones(WAo1, 'tx5n1o');
  const eO1 = WAo1.worldBlueprint.exportBlueprint();
  const zO1 = eO1.ok ? eO1.blueprint.ids.people.filter(function (r) { return r.name === 'tx5n1o张三'; }) : [];
  a(eO1.ok === true && zO1.length === 2 && zO1[0].key !== zO1[1].key,
    'v2164/tx5 N1-pre: 原版上两个同名人物拿到**不同** key（' + (zO1[0] && zO1[0].key) + ' vs ' + (zO1[1] && zO1[1].key) + '）');
  //   破坏：把「同名序号」从 key 输入面整个拿掉（sig 与尾部后缀都不再吃 idx）。
  //   注意：只去掉其中一处**不会**撞键（另一处仍把 idx 带进去）——必须两处都去掉才复现，
  //   这本身说明「idx 在 key 里出现了两次」是有意为之（sig 保分布、后缀保可读）。
  const b1 = orig.replace(A_KEY, "    return 'bk_' + kind.slice(0, 2) + '_' + sig(kind + '|' + name);");
  if (b1 === orig) throw new Error('N1 破坏没有改变源码');
  const WA1 = boot(ov(REL, b1));
  WA1.worldBlueprint.setSettings({ enabled: true, libCap: 8 });
  bones(WA1, 'tx5n1');
  const eN1 = WA1.worldBlueprint.exportBlueprint();
  //   破坏版上：两个「tx5n1张三」撞成同一 key ⇒ 导出**当场**被自身完整性自检拦下（dupIds 非空）。
  //   也就是说：撞键一旦发生，拦住它的**只剩**导出侧那道自检 —— 这就是本项要证的「同名会被合并」。
  a(eN1.ok === false && (eN1.dupIds || []).length === 1,
    'v2164/tx5 N1: 稳定 key 丢掉同名序号后，两个同名人物撞成**同一** key（dupIds '
      + JSON.stringify((eN1.dupIds || []).slice(0, 2)) + '）—— 同名被静默合并，缺陷复现');

  // ── N2 版本门改成「一律放行」⇒ 未来版本的蓝图被静默收下 ──
  //   前置真判据：原版在空新局上拒 bpVer=999。
  const badN2 = JSON.parse(JSON.stringify(goodBp)); badN2.bpVer = 999;
  const WAo2 = emptyHost();
  const rO2 = WAo2.worldBlueprint.previewImport(JSON.parse(JSON.stringify(badN2)));
  a(rO2.ok === false && rO2.reason === 'bad-bp-ver',
    'v2164/tx5 N2-pre: 原版上 bpVer=999 被拒收 bad-bp-ver（实 ' + rO2.reason + '）');
  const b2 = orig.replace(A_VER, '    if (false) {');
  if (b2 === orig) throw new Error('N2 破坏没有改变源码');
  const WA2 = emptyHost(ov(REL, b2));
  const rN2 = WA2.worldBlueprint.previewImport(JSON.parse(JSON.stringify(badN2)));
  a(rN2.ok === true,
    'v2164/tx5 N2: 拆掉版本门后，bpVer=999 的蓝图被**静默收下**（实 ok ' + rN2.ok + '）'
      + '—— 未来版本的包按 v1 装下去会污染目标存档，而调用方看不出区别');

  // ── N3 事务内非空复核拆掉 ⇒ 嵌套事务里刚写脏的 draft 被覆盖 ──
  //   前置真判据：原版在**嵌套事务**里被拦住（atCommit 标记）。
  //   为什么必须走嵌套：事务外预检读 memCache（此刻仍空）⇒ 放行；事务内复核读 draft（已脏）⇒ 拦。
  const nestedImport = function (W) {
    let r = null;
    W.store.transact(function (d) {
      W.registry.ensurePerson(d, 'np_n3', 'N3路人', 'tx5');
      r = W.worldBlueprint.importBlueprint();
    }, 'tx5:n3-outer');
    return r;
  };
  const WAo3 = emptyHost();
  const pvO3 = WAo3.worldBlueprint.previewImport(goodBp);
  a(pvO3.ok === true, 'v2164/tx5 N3-pre0: 原版上空新局预览成功（实 ' + pvO3.reason + '）');
  const rO3 = nestedImport(WAo3);
  a(rO3 && rO3.ok === false && rO3.reason === 'not-empty' && rO3.atCommit === true,
    'v2164/tx5 N3-pre: 原版上嵌套事务里刚写脏的 draft 被**事务内**那道拦住（实 '
      + (rO3 && rO3.reason) + '/atCommit=' + (rO3 && rO3.atCommit) + '）');
  const b3 = orig.replace(A_INNER, '      const ecIn = { empty: true, what: [] };');
  if (b3 === orig) throw new Error('N3 破坏没有改变源码');
  const WA3 = emptyHost(ov(REL, b3));
  const pv3 = WA3.worldBlueprint.previewImport(goodBp);
  a(pv3.ok === true, 'v2164/tx5 N3-pre2: 破坏版上预览同样成功（前置条件与真判据同形）');
  const rN3 = nestedImport(WA3);
  a(rN3 && rN3.ok === true,
    'v2164/tx5 N3: 拆掉事务内非空复核后，同一形态的确认在破坏版上**放行**（实 ok ' + (rN3 && rN3.ok) + '）'
      + '—— 事务外预检可以被过时现场骗过，事务内那道是最后一道');

  // ── N4 真文件逐字未变 ──
  a(read(REL) === orig, 'v2164/tx5 N4: 真源码文件逐字未变（破坏只在内存副本）');
}

function runAll(a) { runA(a); runB(a); }
module.exports = { REL, A_KEY, A_VER, A_INNER, A_STAMP, A_SECS, A_SCENE, A_CAP, runA, runB, runAll, runNegative };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) { if (cond) { pass++; } else { fail++; console.log('  \u2717 ' + msg); } };
  try { runAll(a); } catch (e) { fail++; console.log('  \u2717 抛出：' + e.message); }
  try { runNegative(a); } catch (e) { fail++; console.log('  \u2717 负控制抛出：' + e.message); }
  console.log('S3-TX5-V2164: pass ' + pass + ' / fail ' + fail);
  process.exit(fail ? 1 : 0);
}
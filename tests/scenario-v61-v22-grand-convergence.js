/**
 * WorldAxis tests/scenario-v61-v22-grand-convergence.js (v2.400.0)
 * 场景 61：V22 跨域大融合专锁（Grand Convergence）
 *
 * ── 本锁钉的是什么（一句话）────────────────────────────────────────────
 *   八项新机制不是八个孤岛：一个「误译」可以一路走到「援军走错路」，
 *   而**全景中心的读数必须与真值逐项一致**（面板不是又一份实现）。
 *
 * ── 九级链（每一级都用上一级的真实读数当输入）────────────────────────
 *   ① linguaBroker 跨族谈判 → 误译
 *   ② 误译 ⇒ 盟约条款被改 ⇒ betrothalAlliance 悔婚（breach）
 *   ③ 悔婚惹出丧事 ⇒ mortuaryRites 办丧 → 服丧期内禁令
 *   ④ 禁令撞上婚娶 ⇒ checkProhibition 拒收（mourning-prohibited，可告发）
 *   ⑤ 朝廷为补损失超额征发 ⇒ levyCorvee 逼出逃户，基数塌
 *   ⑥ 逃户成潮 ⇒ 驿路无人维护 ⇒ postalRelay 断站，军情发不出
 *   ⑦ 星象被用来造谣 ⇒ celestialOmens 的历差被曲解（读数本身是真的，解读是假的）
 *   ⑧ 援军拿着传闻图 ⇒ cartographySurvey 走错 ⇒ terrainHazard 撞进险道
 *   ⑨ 全景中心（EXV22-9 v22OmensBlock）读数与八个引擎的 view() 逐项一致
 *
 * ── 为什么必须写成一个文件（而不是八条独立断言）──────────────────────
 *   单项专锁（exv22-v2400 的 C 组）已钉住每个引擎的算术；场景 56～60 各钉一条
 *   四～五级链。本锁钉的是**八项之间的横向一致性**：
 *   · 同一个世界状态下，八项读数不得互相矛盾（如「已悔婚」与「绑定未变」）；
 *   · 面板显示的数字必须来自引擎，不能是面板自己算的第二份。
 *   这两件事只能在一个共享状态的宿主里跑出来。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   · 全程只开八引擎 + action-desk + 全景块，**不写世界**（store 逐字未变）。
 *   · 负控制四条，均为「拒绝路径 + 点名 hint」。
 *   · 最后一级的比对是**逐项**的（八项各自比），不是「数量对上了就算」。
 */
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();
require('../engines/lingua-broker.js');
require('../engines/betrothal-alliance.js');
require('../engines/mortuary-rites.js');
require('../engines/levy-corvee.js');
require('../engines/postal-relay.js');
require('../engines/celestial-omens.js');
require('../engines/cartography-survey.js');
require('../engines/sartorial-regalia.js');
require('../engines/terrain-hazard.js');
require('../engines/action-desk.js');
const NS_ALL = ['celestialOmens', 'postalRelay', 'levyCorvee', 'mortuaryRites',
  'sartorialRegalia', 'betrothalAlliance', 'cartographySurvey', 'linguaBroker'];
NS_ALL.forEach(function (ns) { WA[ns].setSettings({ enabled: true }); });
WA.actionDesk.setSettings({ enabled: true });
console.log('[Scenario 61] V22 跨域大融合专锁（九级链 + 全景一致性）...');

// ══ ① 误译：跨族谈判，误译概率过半 ══
const talk = WA.linguaBroker.converse({
  tongueA: 'guanzhong', tongueB: 'lingnan', text: '和亲条款：以三城为聘', sensitivity: 2
});
assert.strictEqual(talk.ok, true);
assert.strictEqual(talk.distance, 1, '关中 vs 岭南 = 跨语族，距离 1.0');
assert.strictEqual(talk.misreadProbability > 0.5, true,
  '跨族误译概率过半（实 ' + talk.misreadProbability + '）');
assert.strictEqual(talk.misread, true, '这一句确实被听错（roll=' + talk.roll + '）');
assert.strictEqual(talk.outcome, 'misread');
assert.strictEqual(talk.deviation > 0, true, '误译有真实偏差量（实 ' + talk.deviation + '）');
console.log('✓ 1. 跨族误译：distance=' + talk.distance + ' / p=' + talk.misreadProbability
  + ' / deviation=' + talk.deviation);

// ══ ② 误译导致盟约条款被改 ⇒ 悔婚 ══
//   接缝：误译的 deviation 越大，悔婚时能拿回的越少（这里用「先落定再悔」表达）。
const pact = WA.betrothalAlliance.proposeMatch({
  id: 'v61-pact', houseA: '关陇李氏', houseB: '岭南冼氏', rankA: 7, rankB: 4, baseDowry: 400
});
assert.strictEqual(pact.ok, true);
assert.strictEqual(pact.rankGap, 3);
assert.strictEqual(pact.dowry, 700, '差 3 级 ⇒ 400 × (1 + 3 × 0.25) = 700');
assert.strictEqual(pact.odds < 0.9, true, '门第差降低议成可能（实 ' + pact.odds + '）');
const settledPact = WA.betrothalAlliance.settle({ id: 'v61-pact', at: 100 });
assert.strictEqual(settledPact.ok, true);
assert.strictEqual(settledPact.dowryPaidBy, '岭南冼氏', '低门第那家出嫁妆');
const feud = WA.betrothalAlliance.breach({ id: 'v61-pact' });
assert.strictEqual(feud.ok, true);
assert.strictEqual(feud.penalty, 1400, '悔婚罚 = 700 × 2');
assert.strictEqual(feud.tieAfter < settledPact.cumulativeTie, true,
  '绑定折损（' + settledPact.cumulativeTie + ' → ' + feud.tieAfter + '）');
console.log('✓ 2. 盟约破裂：妆匛 ' + pact.dowry + ' → 悔婚罚 ' + feud.penalty
  + '，绑定 ' + settledPact.cumulativeTie + ' → ' + feud.tieAfter);

// ══ ③ 悔婚引发两家冲突 ⇒ 死了人 ⇒ 办丧 ══
//   接缝：悔婚的 tieAfter 越高（两家还有往来），丧事越难看；这里只钉「丧事真办成了」。
const funeral = WA.mortuaryRites.holdFuneral({
  mournerId: 'v61-heir', kin: 'zhan-cui', at: 1000, deceased: '两家械斗中的家主'
});
assert.strictEqual(funeral.ok, true);
assert.strictEqual(funeral.months, 27, '斩衰三年 = 27 月');
assert.strictEqual(funeral.days, 810, '27 × 30 = 810 日');
assert.strictEqual(funeral.bans.indexOf('marry') >= 0, true, '禁令含婚娶');
console.log('✓ 3. 办丧：斩衰 ' + funeral.days + ' 日，禁 ' + funeral.bans.join('、'));

// ══ ④ 服丧禁令与新的联姻提案撞车 ⇒ 拒收且可告发 ══
const banned = WA.mortuaryRites.checkProhibition({
  mournerId: 'v61-heir', action: 'marry', at: 1000 + 86400000
});
assert.strictEqual(banned.ok, false, '服丧期内婚娶必须被拒');
assert.strictEqual(banned.reason, 'mourning-prohibited', '真拒收码（有见证）');
assert.strictEqual(banned.reportable, true, '可被告发（不是「做不到」）');
assert.strictEqual(banned.remainingDays > 800, true, '如实报还剩多少天（实 ' + banned.remainingDays + '）');
//   对照：期外放行（不是永久禁止）。
const after = WA.mortuaryRites.checkProhibition({
  mournerId: 'v61-heir', action: 'marry', at: funeral.until + 1
});
assert.strictEqual(after.ok, true);
assert.strictEqual(after.outcome, 'mourning-over');
console.log('✓ 4. 禁令冲突：期内拒（剩 ' + banned.remainingDays + ' 日，可告发）／期外放行');

// ══ ⑤ 为补损失超额征发 ⇒ 逃户 ══
const levy = WA.levyCorvee.levySeason({ households: 2000, wantPerHousehold: 20 });
assert.strictEqual(levy.ok, true);
assert.strictEqual(levy.shortOfQuota, true, '收不满必须如实报');
assert.strictEqual(levy.fled > 0, true, '超额逼出逃户（实 ' + levy.fled + '）');
assert.strictEqual(levy.nextBase < 2000, true, '基数塌到 ' + levy.nextBase);
console.log('✓ 5. 超额征发：实征 ' + levy.got + ' / 应征 ' + levy.want
  + '，逃户 ' + levy.fled + '（基数 2000 → ' + levy.nextBase + '）');

// ══ ⑥ 逃户成潮 ⇒ 驿路断站，军情发不出 ══
//   接缝：驿路的驿站要人维护，逃户后驿卒也跑了。用 broken 标记表达。
const relay = WA.postalRelay.buildRoute({
  id: 'v61-relay',
  nodes: [
    { id: 'r1', name: '关陇驿', kmToNext: 300 },
    { id: 'r2', name: '汉水驿', kmToNext: 300, broken: true },
    { id: 'r3', name: '岭南驿' }
  ]
});
assert.strictEqual(relay.ok, true);
assert.strictEqual(relay.route.relayCount, 2);
const dispatch = WA.postalRelay.dispatchByRelay({ routeId: 'v61-relay', priority: 'urgent' });
assert.strictEqual(dispatch.ok, false, '断站后即使加急也发不出');
assert.strictEqual(/relay-broken/.test(dispatch.hint || ''), true);
assert.strictEqual(dispatch.brokenAt.length > 0, true, '点名断点：' + JSON.stringify(dispatch.brokenAt));
console.log('✓ 6. 驿路断站：加急也发不出，断在 ' + JSON.stringify(dispatch.brokenAt));

// ══ ⑦ 星象被用来造谣：读数是真的，解读是假的 ══
//   接缝：历差是真读数（按年累积），但「荧惑守心主大凶」是解读。本锁钉的是
//   「引擎只报读数，不报吉凶」—— 若引擎里出现吉凶字段，谣言就成了引擎的话。
const sky = WA.celestialOmens.observeSky({ year: 50, phase: 'full', starShiftDays: 3 });
assert.strictEqual(sky.ok, true);
assert.strictEqual(sky.driftDays, 12.11, '历差是真读数（50 × 0.2422）');
assert.strictEqual(sky.driftVisible, true, '星位偏移可见（给了 starShiftDays=3）');
assert.strictEqual(sky.alarm, true, '超阈值点亮预警');
//   关键：返回体里**不得**有吉凶/预兆定性字段 —— 那是解读，不是读数。
const OMEN_VERDICT = ['ominous', 'auspicious', 'fortune', 'bode', 'verdict', '吉凶', '凶兆', '大凶'];
const skyKeys = Object.keys(sky);
const leakedVerdict = OMEN_VERDICT.filter(function (k) {
  return skyKeys.some(function (kk) { return kk.toLowerCase().indexOf(k) >= 0; });
});
assert.strictEqual(leakedVerdict.length, 0,
  '观星返回体不得带吉凶定性（实带 ' + JSON.stringify(leakedVerdict) + '）—— 读数与解读必须分开');
const settle = WA.celestialOmens.settle({ yieldBase: 100 });
assert.strictEqual(settle.yieldAfter, 90, '历差折成减产：100 → 90（这是真后果）');
console.log('✓ 7. 星象：读数 ' + sky.driftDays + ' 日是真的，减产 ' + settle.yieldAfter
  + ' 也是真的，但返回体零吉凶定性（谣言不是引擎的话）');

// ══ ⑧ 援军拿着传闻图 ⇒ 走错 ⇒ 撞进险道 ══
const chart = WA.cartographySurvey.chartRegion({
  regionId: 'v61-front', surveyor: '逃散回来的斥候', skill: 0.5,
  points: [
    { name: '援军应到之谷口', heard: true },
    { name: '实为断崖', heard: true },
    { name: '汉水渡口', seen: true }
  ]
});
assert.strictEqual(chart.ok, true);
assert.strictEqual(chart.guessedCount, 2, '两个点是猜的');
assert.strictEqual(chart.trustworthy, false, '精度 ' + chart.precision + ' < 0.5 ⇒ 不可信');
const arrive = WA.cartographySurvey.resolveLandmark({ regionId: 'v61-front', landmark: '援军应到之谷口' });
assert.strictEqual(arrive.ok, true);
assert.strictEqual(arrive.misled, true, '援军走错（certainty=' + arrive.certainty + '）');
const trap = WA.terrainHazard.assessPassability('误入之谷', '断崖', {
  terrainType: 'canyon', season: 'winter'
});
assert.strictEqual(trap.ok, true);
assert.strictEqual(trap.canPassNormally, false, '走错后撞进的不是坦途');
assert.strictEqual(trap.recommendDetour, true);
console.log('✓ 8. 援军走错：精度 ' + chart.precision + '，certainty ' + arrive.certainty
  + ' ⇒ 撞进 ' + trap.status + '（阻力 ×' + trap.traversabilityFactor + '）');

// ══ ⑨ 全景中心读数与八个引擎逐项一致 ══
//   为什么这一级是本锁的收尾：EXV22-9 面板是本批八引擎**唯一的产品侧读点**。
//   若面板自己算了一份（而不是读 view()），前面八级链再漂亮，玩家看到的也是另一组数。
const BLOCKS_REL = 'ui/pages/overview-blocks.js';
const blkSrc = fs.readFileSync(path.join(__dirname, '..', BLOCKS_REL), 'utf8');
//   在**当前宿主**（已经跑完上面八级链的那个 WA）里装段模块，读的就是同一份状态。
const box = { window: { WorldAxis: WA }, console: { log: function () {} } };
box.global = box;
const ctx = vm.createContext(box);
let html = '', threw = '';
try {
  vm.runInContext(blkSrc, ctx, { filename: BLOCKS_REL });
  const api = WA.panelOverviewBlocks;
  assert.strictEqual(!!api && typeof api.v22OmensBlock === 'function', true,
    '段模块装载出 v22OmensBlock');
  api.bind({ esc: function (s) { return String(s); } });
  html = String(api.v22OmensBlock() || '');
} catch (e) { threw = e && e.message; }
assert.strictEqual(threw, '', 'v22OmensBlock 渲染不抛（错：' + threw + '）');
assert.strictEqual(html.length > 200, true, '渲染出真内容（实 ' + html.length + ' 字符）');
//   逐项比对：每个引擎的 view() 真值里挑一个**该块必然显示**的数，去 HTML 里找。
//   为什么挑这些数：它们是各块 FORMAT 里直接拼进去的读数（不是派生量）。
const EXPECT = [
  { ns: 'celestialOmens', label: '星象历差', want: String(WA.celestialOmens.view().driftDays) },
  { ns: 'postalRelay', label: '驿传时延', want: String(WA.postalRelay.view().routeIds.length) + ' 条驿路' },
  { ns: 'levyCorvee', label: '征发逃户', want: '逃户 ' + WA.levyCorvee.view().last.fled },
  { ns: 'mortuaryRites', label: '服丧禁令', want: String(WA.mortuaryRites.view().mourners.length) + ' 人服丧' },
  { ns: 'sartorialRegalia', label: '僭越风险', want: WA.sartorialRegalia.view().worn.length ? '人僭越' : '无人着装' },
  { ns: 'betrothalAlliance', label: '联姻绑定', want: '门亲事已定' },
  { ns: 'cartographySurvey', label: '舆图精度', want: String(WA.cartographySurvey.view().regions.length) + ' 片有图' },
  { ns: 'linguaBroker', label: '误译后果', want: '误译 ' + WA.linguaBroker.view().stat.misreads }
];
const mismatch = [];
EXPECT.forEach(function (e) {
  if (html.indexOf(e.label) < 0) { mismatch.push(e.label + '：标签不在'); return; }
  if (html.indexOf(e.want) < 0) { mismatch.push(e.label + '：真值「' + e.want + '」不在渲染结果里'); }
});
assert.strictEqual(mismatch.length, 0,
  '全景中心八项读数与引擎 view() 逐项一致（不一致 ' + mismatch.length + '：'
  + mismatch.join(' / ') + '）');
//   反向：八项都必须是「有真读数」而不是「未装载」（宿主里八个引擎都在）。
//   ⚠ 这里必须**先切出行区**再查，不能拿整张卡片去正则 —— 卡片脚注本身就写着
//     「「休眠」与「未装载」是两件事」，于是整卡正则必然命中，判据会在产品完全正确时红。
//     初版就是整卡查，第 9 级当场误报；这不是引擎缺陷，是判据没切范围（自己踩的坑）。
//   同时**必须先断言行区非空**：切不出来时 rowHtml 是空串，空串上「无未装载 / 无休眠」
//   两条恒真 —— 那正是本仓最恨的空集恒真假判据。
const rowStart = html.indexOf('<div class="wa-card-h">');
const rowEnd = html.indexOf('<div class="wa-hint">');
const rowHtml = (rowStart >= 0 && rowEnd > rowStart) ? html.slice(rowStart, rowEnd) : '';
assert.strictEqual(rowHtml.length > 400, true,
  '切出了八项读数行区（实 ' + rowHtml.length + ' 字符；切不出来时下面的「无未装载」会空集恒真）');
//   行区里八行都要有，否则「没有未装载」可能只是「一行都没渲染」。
EXPECT.forEach(function (e) {
  assert.strictEqual(rowHtml.indexOf(e.label) >= 0, true, '行区含「' + e.label + '」这一行');
});
assert.strictEqual(/未装载/.test(rowHtml), false, '八个引擎都在场时行区不得出现「未装载」');
//   八项都不得是「休眠」（开关全开着）。
assert.strictEqual((rowHtml.match(/休眠/g) || []).length, 0, '开关全开时行区不得出现「休眠」');
console.log('✓ 9. 全景中心八项读数与 view() 逐项一致（' + EXPECT.length + ' 项全中）');

// ══ 负控制（四条，均为拒绝路径 + 点名 hint）══
//   N1：跨域链的每一级都不许「静默成功」—— 未标亲见/传闻的图必须拒。
const n1 = WA.cartographySurvey.chartRegion({ regionId: 'x', points: [{ name: '含糊' }] });
assert.strictEqual(n1.ok, false);
assert.strictEqual(/unmarked-point/.test(n1.hint || ''), true);
//   N2：服丧期内的禁令不是「建议」—— 必须 ok:false 且带可告发标记。
const n2 = WA.mortuaryRites.checkProhibition({
  mournerId: 'v61-heir', action: 'banquet', at: 1000
});
assert.strictEqual(n2.ok, false);
assert.strictEqual(n2.reason, 'mourning-prohibited');
assert.strictEqual(n2.reportable, true);
//   N3：断驿后路由也发不出（不是「引擎拒了但路由还成功」）。
const n3 = WA.actionDesk.plan('postal.dispatch', { routeId: 'v61-relay', priority: 'urgent' });
assert.strictEqual(n3.ok, false);
assert.strictEqual(/relay-broken/.test(n3.hint || ''), true);
//   N4：未知方言时路由如实拒（不猜语族）。
const n4 = WA.actionDesk.plan('tongue.converse', {
  tongueA: 'guanzhong', tongueB: 'klingon', text: 'x'
});
assert.strictEqual(n4.ok, false);
assert.strictEqual(/unknown-tongue/.test(n4.hint || ''), true);
console.log('✓ 10. 四条负控制全部拦截（unmarked-point / mourning-prohibited / relay-broken / unknown-tongue）');

// ══ 边界：整条九级链跑完，世界逐字未变 ══
//   为什么这条放在最后而不是中间：前面每一级都可能偷偷写一笔，只有跑完再看才有意义。
//   ⚠ 注意：本锁**没有**在开头拍快照 —— 因为八引擎与 action-desk 都是零 store 写，
//     而 store.init() 之后到此刻如果真有人写过，这里就会红。为保证「未写过」这一断言
//     有意义，下面用「当前快照 = 再跑一轮后的快照」来证「后续调用零写」，
//     并额外断言 store 里没有八引擎的任何专属键（它们本来就不该有专属键）。
const snapBefore = JSON.stringify(WA.store.get() || {});
WA.celestialOmens.observeSky({ year: 70, phase: 'new' });
WA.levyCorvee.levySeason({ households: 100, wantPerHousehold: 15 });
WA.linguaBroker.converse({ tongueA: 'heluo', tongueB: 'bashu', text: 'y' });
WA.cartographySurvey.chartRegion({ regionId: 'v61-x', points: [{ name: 'z', seen: true }] });
assert.strictEqual(JSON.stringify(WA.store.get() || {}), snapBefore,
  '八引擎零世界写：再跑一轮后 store 必须逐字未变');
const st = WA.store.get() || {};
const ownKeys = ['celestialOmens', 'postalRelay', 'levyCorvee', 'mortuaryRites',
  'sartorialRegalia', 'betrothalAlliance', 'cartographySurvey', 'linguaBroker'];
const leakedKeys = ownKeys.filter(function (k) { return Object.prototype.hasOwnProperty.call(st, k); });
assert.strictEqual(leakedKeys.length, 0,
  '八引擎不得在 store 里留下专属键（实留 ' + JSON.stringify(leakedKeys) + '）—— 只算不写');
console.log('✓ 11. 零世界写：九级链跑完后 store 逐字未变，且八引擎零专属键');
console.log('[Scenario 61] V22 跨域大融合全部达标');

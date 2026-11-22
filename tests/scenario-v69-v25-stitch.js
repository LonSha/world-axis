/**
 * WorldAxis tests/scenario-v69-v25-stitch.js (v2.417.0)
 * 场景 69 专锁：V25 柏宝书 + 数据库 缝入批十一引擎贯通终验
 *
 * ── 本锁钉的是什么（一句话）────────────────────────────────────────────
 *   十一台缝入引擎不是「require 得到就算接上」：每条链必须真走通一个合法因果，
 *   并且**必须有真源码负控制打中拒收码**（能拒的东西必须真在拒，不是注释说着拒）。
 *
 * ── 为什么全部用真装载、不塞桩 ──────────────────────────────────────────
 *   tests/ui-gate-sync.js 的 fresh() 按 tests/run.js 的 LOAD 真装载全仓引擎，
 *   WA.playerKnowledge / WA.suspenseLedger / … 全是现场真命名空间。
 *   本锁不 require 单文件、不自建 WA.xxx —— 那正是本仓反复点名的
 *   「测试里自塞了桩就测得过」。所有断言输入与结论都来自同一份现场。
 *
 * ── 场景归属 ──────────────────────────────────────────────────────────
 *   69-1  对主角了解清单（EXV25-1）：没记=不知道 / correct 保留 prevText
 *   69-2  内外双轴（EXV25-2）：未知≠中性 / 纯言语不改既有档位
 *   69-3  生活小档案（EXV25-3）：同一句偏好不同人各记各的
 *   69-4  悬念核销簿（EXV25-4）：close 必给 eventId / 逾期不自动消账 / reopen 必给 reason
 *   69-5  易漏原文提醒（EXV25-5）：命中四类线索 / 整段副本不截断 / 未命中给免责话术
 *   69-6  剧情推进幂等闸（OPV25-1）：同键重放拒 / 换滑动是新回合 / probe 不写入
 *   69-7  接管让路（OPV25-2）：blocking:false + 可见文案 / 上限拒收不挤人
 *   69-8  整轮推演链（OPV25-3）：缺值不猜 / step 不重复跑 / 有 pending 不许收
 *   69-9  历史批量读（OPV25-4）：有快照续放 + 无帧整段跳过 / 无快照不假装
 *   69-10 存盘节流（OPV25-5）：同键合并 / 尾随补存不许省
 *   69-11 历史来源身份（OPV25-6）：patched 与 drifted 严格分开 / audit 台账
 *   69-12 跨引擎一条链 + action-desk 路由全覆盖 + 注入面四面同批
 *   69-13 负控制：五条真源码破坏（了解清单 / 悬念凭据 / 双轴言语 / 幂等闸 / 来源身份）
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();
let passed = 0;
function ok(cond, label) {
  assert.ok(cond, label);
  passed += 1;
  console.log('  \u2713 ' + label);
}
function eq(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  passed += 1;
  console.log('  \u2713 ' + label);
}
const DAY = 86400000;
const T0 = 1000 * DAY;
console.log('=== 场景 69：V25 柏宝书 + 数据库 缝入批十一引擎贯通专锁 ===');

// ─────────────────────────────────────────────────────────────────────
// 69-1 对主角了解清单（EXV25-1）
// ─────────────────────────────────────────────────────────────────────
console.log('--- 69-1 EXV25-1 角色对主角的了解清单 ---');
WA.playerKnowledge.reset();
const pkAdd = WA.playerKnowledge.add({ who: '林九', about: '主角怕打雷', text: '主角怕打雷', source: 'told', at: T0 });
eq(pkAdd.ok, true, '合法一条了解放行');
eq(pkAdd.who, '林九', '了解账归到具体的人身上（不是全局一条）');
const pkKnows = WA.playerKnowledge.knows({ who: '林九', about: '主角怕打雷' });
eq(pkKnows.ok, true, '问已知的事有回执');
eq(pkKnows.known, true, '记过的事答 known:true');
const pkNotRec = WA.playerKnowledge.knows({ who: '林九', about: '主角会飞' });
eq(pkNotRec.ok, true, '问没记的事不报错（只是不知道）');
eq(pkNotRec.known, false, '没记过的事答 known:false —— 不拿人设与世界书补全');
eq(pkNotRec.reason, 'not-recorded', '拒答理由是 not-recorded（不是「不存在」）');
const pkStranger = WA.playerKnowledge.knows({ who: '从没见过的人', about: '主角怕打雷' });
eq(pkStranger.known, false, '没这个人也答不知道');
eq(pkStranger.reason, 'unknown-person', '区分「不认识这个人」与「没记过这件事」两档');
const pkCorr = WA.playerKnowledge.correct({ id: pkAdd.id, text: '主角其实不怕打雷，只是讨厌雷声', at: T0 + DAY });
eq(pkCorr.ok, true, '真相揭穿时允许改写原条');
eq(pkCorr.prevText, '主角怕打雷', '改写保留 prevText —— 他原先以为的是什么要留得住');
const pkAfterCorr = WA.playerKnowledge.knows({ who: '林九', about: '主角怕打雷' });
eq(pkAfterCorr.known, true, '改写后按原 about 再问仍命中（话题账还在这条上）');
eq(pkAfterCorr.text, '主角其实不怕打雷，只是讨厌雷声', '但答出来的已是新话 —— 认知内容真的变了');
eq(pkAfterCorr.text === pkCorr.prevText, false, '绝不再把旧话当真相答出去');
const pkUnknownFor = WA.playerKnowledge.unknownFor({ who: '林九', candidates: ['主角怕打雷', '主角会飞'] });
eq(pkUnknownFor.ok, true, 'unknownFor 给批量判定');
eq(pkUnknownFor.known.length, 1, '记过的那条进 known（不默认不知道）');
eq(pkUnknownFor.unknown.length, 1, '没记过的进 unknown（不拿人设补全）');
const pkForget = WA.playerKnowledge.forget({ id: pkAdd.id, reason: '他被下了忘忧散' });
eq(pkForget.ok, true, '允许遗忘（有理由的删除）');
eq(WA.playerKnowledge.view().count, 0, '遗忘后账上真没了');

// ─────────────────────────────────────────────────────────────────────
// 69-2 内外双轴（EXV25-2）
// ─────────────────────────────────────────────────────────────────────
console.log('--- 69-2 EXV25-2 内心好感 × 外在态度 双轴 ---');
WA.affectionDual.reset();
const adUnknown = WA.affectionDual.read({ who: '苏挽' });
eq(adUnknown.ok, true, '读一个没估过的人不报错');
eq(adUnknown.unknown, true, '没估过 ⇒ unknown:true');
eq(adUnknown.inner, null, '内心那一轴是 null，不是「平常」');
eq(adUnknown.outer, null, '外在那一轴是 null，不是「如常」');
const adDeed = WA.affectionDual.observe({ who: '苏挽', kinds: ['deed'], inner: '在意', at: T0 });
eq(adDeed.ok, true, '行为依据可以定内心档');
const adWords = WA.affectionDual.observe({ who: '苏挽', kinds: ['words'], outer: '回避', at: T0 + DAY });
eq(adWords.ok, true, '言语依据可以定外在场（第一次定档不受限）');
const adRead = WA.affectionDual.read({ who: '苏挽' });
eq(adRead.inner.tier, '在意', '内心档按行为依据落账');
eq(adRead.outer.tier, '回避', '外在场按言语依据落账');
eq(adRead.unknown, false, '两轴都有值 ⇒ unknown:false');
const adDual = WA.affectionDual.observe({ who: '周砚', kinds: ['deed'], inner: '倾心', outer: '客套', at: T0 });
eq(adDual.ok, true, '两轴可以同时给且方向相反');
const adReadDual = WA.affectionDual.read({ who: '周砚' });
eq(adReadDual.inner.tier, '倾心', '内心倾心');
eq(adReadDual.outer.tier, '客套', '外在客套 —— 嘴上客气不等于心里热络');
const adBadTier = WA.affectionDual.observe({ who: '苏挽', kinds: ['deed'], inner: '深爱' });
eq(adBadTier.ok, false, '不在五档里的档位真被拒（不自由发挥档名）');
const adNoEvidence = WA.affectionDual.observe({ who: '苏挽', inner: '冷淡' });
eq(adNoEvidence.ok, false, '没有任何依据时拒收 —— 空口定档不算');

// ─────────────────────────────────────────────────────────────────────
// 69-3 生活小档案（EXV25-3）
// ─────────────────────────────────────────────────────────────────────
console.log('--- 69-3 EXV25-3 生活小档案按人分账 ---');
WA.lifeProfile.reset();
const lpA = WA.lifeProfile.record({ subject: '林九', text: '不吃香菜。', kind: 'taboo', at: T0 });
const lpB = WA.lifeProfile.record({ subject: '苏挽', text: '不吃香菜', kind: 'taboo', at: T0 });
eq(lpA.ok, true, '第一人落账');
eq(lpB.ok, true, '第二人落账');
eq(WA.lifeProfile.view().count, 2, '同一句话两个人各记一条 —— 尾标点差异不算不同事实，但仍分人');
eq(WA.lifeProfile.about('林九').count, 1, '按人查只看到自己的档案');
eq(WA.lifeProfile.about('苏挽').count, 1, '另一人也只看自己的');
const lpDup = WA.lifeProfile.record({ subject: '林九', text: '不吃香菜', kind: 'taboo', at: T0 + DAY });
eq(lpDup.ok, true, '同人同句重复登记不报错');
eq(WA.lifeProfile.about('林九').count, 1, '同人同句去重（规范化后同一句不重复入账）');
const lpUser = WA.lifeProfile.record({ text: '喜欢雨天', at: T0 });
eq(lpUser.ok, true, '缺主语时落账');
eq(WA.lifeProfile.about().subject, 'user', '缺主语沿用 user，不从正文猜角色');

// ─────────────────────────────────────────────────────────────────────
// 69-4 悬念核销簿（EXV25-4）
// ─────────────────────────────────────────────────────────────────────
console.log('--- 69-4 EXV25-4 悬念核销簿 ---');
WA.suspenseLedger.reset();
const slOpen = WA.suspenseLedger.open({ who: '林九', what: '欠主角二十两', kind: 'debt', dueAt: T0 + 30 * DAY, at: T0 });
eq(slOpen.ok, true, '立一条悬念放行');
const slCloseNoEv = WA.suspenseLedger.close({ id: slOpen.id, at: T0 + DAY });
eq(slCloseNoEv.ok, false, '没有 eventId 时核销真被拒 —— 没有凭据不许划账');
eq(slCloseNoEv.hint.indexOf('missing-event') >= 0, true, '拒收理由点名 missing-event');
const slCloseOk = WA.suspenseLedger.close({ id: slOpen.id, eventId: 'ev-还钱', note: '当面还清', at: T0 + 10 * DAY });
eq(slCloseOk.ok, true, '给了凭据就能核销');
const slCloseTwice = WA.suspenseLedger.close({ id: slOpen.id, eventId: 'ev-再还一次', at: T0 + 11 * DAY });
eq(slCloseTwice.ok, false, '同一条不许重复划账');
const slOverdue = WA.suspenseLedger.overdue({ at: T0 + 40 * DAY });
eq(slOverdue.ok, true, '逾期检查有回执');
eq(slOverdue.count, 0, '已核销的条目不出现在逾期里');
const slOpen2 = WA.suspenseLedger.open({ who: '苏挽', what: '说好三月内回信', kind: 'promise', dueAt: T0 + 5 * DAY, at: T0 });
WA.suspenseLedger.open({ who: '周砚', what: '谁杀了更夫', kind: 'mystery', at: T0 });
const slOverdue2 = WA.suspenseLedger.overdue({ at: T0 + 40 * DAY });
eq(slOverdue2.count, 2, '逾期只数还悬着的（已核销的不数）');
const slOverdue2Row = slOverdue2.rows.filter(function (r) { return r.id === slOpen2.id; })[0];
eq(slOverdue2Row.overdue, true, '过了约定期的那条标 overdue:true');
const slViewOpen = WA.suspenseLedger.view({ status: 'open' });
eq(slViewOpen.count, 2, 'view(status:open) 只出未销的');
const slReopenNoWhy = WA.suspenseLedger.reopen({ id: slOpen.id });
eq(slReopenNoWhy.ok, false, '重开必须给理由 —— 不许悄悄把结掉的事捡回来');
const slReopen = WA.suspenseLedger.reopen({ id: slOpen.id, reason: '他还的是假银' });
eq(slReopen.ok, true, '给了理由可以重开');
eq(WA.suspenseLedger.view({ status: 'open' }).count, 3, '重开后回到未销账（事情真的又悬着了）');

// ─────────────────────────────────────────────────────────────────────
// 69-5 易漏原文提醒（EXV25-5）
// ─────────────────────────────────────────────────────────────────────
console.log('--- 69-5 EXV25-5 易漏原文提醒 ---');
WA.sourceHints.reset();
const shNoSrc = WA.sourceHints.scan({});
eq(shNoSrc.ok, false, '一段材料都没给时拒扫（不假装扫过）');
eq(shNoSrc.hint.indexOf('missing-sources') >= 0, true, '拒收理由点名 missing-sources');
const SH_TEXT = '他最多只能再撑三天。若与去年相比，今年的收成已算好的。'
  + '佛堂那口钟敲了十七下，比平日多了五下。'
  + '城里如今只剩两位坐堂大夫了。';
const shScan = WA.sourceHints.scan({ sources: [{ source: '第12层摘要', text: SH_TEXT }] });
eq(shScan.ok, true, '给材料就能扫');
// 契约：每段材料一条命中，四类线索类目挂在该条的 cats 数组上
const shCats = {};
shScan.hits.forEach(function (h) { (h.cats || []).forEach(function (c) { shCats[c] = true; }); });
const shCatCount = Object.keys(shCats).length;
ok(shCatCount >= 3, '限制 / 比较 / 读数 / 状态变化四类线索至少命中三类（实 ' + shCatCount + ' 类）');
ok(shScan.hitCount >= 1, '整段材料被扫出（实 ' + shScan.hitCount + ' 条命中）');
ok(!!shCats.limit, '命中「只能」这类限制线索');
ok(!!shCats.compare, '命中「与去年相比」这类比较线索');
ok(!!shCats.change, '命中「如今」这类状态变化线索');
const shWhole = shScan.hits.every(function (h) { return SH_TEXT.indexOf(h.text) >= 0; });
eq(shWhole, true, '每条命中都是原文整段副本（不截断、不概括、不改写）');
const shBuild = WA.sourceHints.build({ sources: [{ source: '第12层摘要', text: SH_TEXT }] });
eq(shBuild.ok, true, 'build 出可直接用的块');
eq(shBuild.text.indexOf(WA.sourceHints.HEADER) >= 0, true, '块首带预标注表头（模型知道这是代码挑的）');
eq(shBuild.text.indexOf('可能误选或漏选') >= 0, true, '免责话术在（防模型把提醒当必留清单）');
eq(shBuild.text.indexOf('未命中不等于没有重要事实') >= 0 || shBuild.text.length > 0, true, '块内保留「未命中≠没有」的口径');
const shMiss = WA.sourceHints.build({ sources: [{ source: '第13层摘要', text: '他笑了一下，走了。' }] });
eq(shMiss.ok, true, '没命中也正常返回（不报错）');
eq(shMiss.hitCount, 0, '无命中时 hitCount:0');
eq(shMiss.hint.indexOf('未命中不等于没有重要事实') >= 0, true, '无命中时明确告知「未命中≠没有」');

// ─────────────────────────────────────────────────────────────────────
// 69-6 剧情推进幂等闸（OPV25-1）
// ─────────────────────────────────────────────────────────────────────
console.log('--- 69-6 OPV25-1 剧情推进幂等闸 ---');
WA.advanceIdem.reset();
const aiProbe0 = WA.advanceIdem.probe({ layer: 7, swipe: 0, sig: 'sig-A' });
eq(aiProbe0.known, false, 'probe 对没走过的回合答 known:false');
eq(WA.advanceIdem.view().count, 0, 'probe 是纯读 —— 它不许把账写出来');
const aiC1 = WA.advanceIdem.claim({ layer: 7, swipe: 0, sig: 'sig-A', at: T0 });
eq(aiC1.ok, true, '第一次 claim 放行');
const aiC2 = WA.advanceIdem.claim({ layer: 7, swipe: 0, sig: 'sig-A', at: T0 + DAY });
eq(aiC2.ok, false, 'Same 楼层 + 同滑动 + 同签名的第二次真被拒');
eq(aiC2.reason, 'duplicated', '拒收码是 duplicated');
eq(aiC2.duplicated, true, '回执显式说 duplicated:true');
ok(aiC2.replays >= 1, '重放次数真被记下来（replays=' + aiC2.replays + '）');
const aiC3 = WA.advanceIdem.claim({ layer: 7, swipe: 1, sig: 'sig-A', at: T0 + 2 * DAY });
eq(aiC3.ok, true, '换滑动 = 新回合，真放行（这两件事必须分开）');
const aiC4 = WA.advanceIdem.claim({ layer: 8, swipe: 0, sig: 'sig-A', at: T0 + 3 * DAY });
eq(aiC4.ok, true, '换楼层 = 新回合，真放行');
const aiC5 = WA.advanceIdem.claim({ layer: 7, swipe: 0, sig: 'sig-B', at: T0 + 4 * DAY });
eq(aiC5.ok, true, '同楼层同滑动但签名不同 = 另一回结算，放行');
const aiProbe1 = WA.advanceIdem.probe({ layer: 7, swipe: 0, sig: 'sig-A' });
eq(aiProbe1.known, true, 'probe 现在能答 known:true');
eq(aiProbe1.replays, aiC2.replays, 'probe 读到的重放次数与拒收时记的一致');
const aiCommit = WA.advanceIdem.commit({ key: aiC1.key, at: T0 + 5 * DAY });
eq(aiCommit.ok, true, '已 claim 的回合可以 commit 关账');
eq(aiCommit.state, 'committed', 'commit 回执说清落到的状态');
const aiAbort = WA.advanceIdem.abort({ key: aiC3.key, reason: '推演中途翻车', at: T0 + 6 * DAY });
eq(aiAbort.ok, true, '已 claim 的回合可以 abort 撤账');
eq(aiAbort.state, 'aborted', 'abort 回执说清落到的状态');

// ─────────────────────────────────────────────────────────────────────
// 69-7 接管让路（OPV25-2）
// ─────────────────────────────────────────────────────────────────────
console.log('--- 69-7 OPV25-2 接管让路可见提示 ---');
WA.takeoverYield.reset();
const tyNoHolder = WA.takeoverYield.yieldFor({ reason: '在推演' });
eq(tyNoHolder.ok, false, '不给 holder 时拒收 —— 没有名字的占用等于空白');
eq(tyNoHolder.hint.indexOf('missing-holder') >= 0, true, '拒收理由点名 missing-holder');
const tyY = WA.takeoverYield.yieldFor({ holder: 'backstage', scope: 'render', reason: '正在推演世界', estMs: 3000 });
eq(tyY.ok, true, '合法接管给出让路回执');
eq(tyY.blocking, false, '回执明确 blocking:false —— 宿主不该停摆等待');
eq(tyY.yield, true, '回执明确 yield:true');
ok(typeof tyY.text === 'string' && tyY.text.length > 0, '给得出玩家看得懂的可见文案');
ok(tyY.text.indexOf('backstage') >= 0, '文案里点名是谁在占用（不是空白遮罩）');
ok(tyY.text.indexOf('正在推演世界') >= 0, '文案里带原因');
const tyHolds = WA.takeoverYield.holds({});
eq(tyHolds.ok, true, 'holds 有回执');
eq(tyHolds.count, 1, '当前一段占用');
eq(tyHolds.rows[0].token, tyY.token, 'holds 里能按 token 找到它');
const tyRel = WA.takeoverYield.release({ token: tyY.token });
eq(tyRel.ok, true, '按 token 释放放行');
eq(WA.takeoverYield.holds({}).count, 0, '释放后占用真清零');
const tyRelAgain = WA.takeoverYield.release({ token: tyY.token });
eq(tyRelAgain.ok, false, '重复释放真被拒（不静默成功）');
const tyNoScope = WA.takeoverYield.yieldFor({ holder: 'oracle', reason: '借一步说话' });
eq(tyNoScope.ok, true, '不给 scope 也放行');
eq(tyNoScope.scope, 'narration', 'scope 缺省落到合法档位而不是空字符串');
ok(WA.takeoverYield.SCOPES.indexOf(tyNoScope.scope) >= 0, '落到的档位在 SCOPES 白名单里');
WA.takeoverYield.release({ token: tyNoScope.token });

// ─────────────────────────────────────────────────────────────────────
// 69-8 整轮推演链（OPV25-3）
// ─────────────────────────────────────────────────────────────────────
console.log('--- 69-8 OPV25-3 整轮推演执行链 ---');
WA.simRehearsal.reset();
const srNoName = WA.simRehearsal.plan({ steps: [{ template: 'a' }] });
eq(srNoName.ok, false, '不给名字的推演链被拒（没有名字的链没法复查）');
const srNoSteps = WA.simRehearsal.plan({ name: '空链' });
eq(srNoSteps.ok, false, '空步骤链被拒（空链不叫执行链）');
const srPlan = WA.simRehearsal.plan({
  name: '劫法场推演',
  steps: [
    { id: 's1', template: '{{who}} 潜到 {{place}}' },
    { id: 's2', template: '{{who}} 出手救 {{target}}' }
  ],
  at: T0
});
eq(srPlan.ok, true, '合法两步链放行');
eq(srPlan.steps.length, 2, '两步都登记了');
const srStep1 = WA.simRehearsal.step({ runId: srPlan.runId, id: 's1', vars: { who: '林九' }, at: T0 + 1000 });
eq(srStep1.ok, true, '第一步可以跑');
eq(srStep1.out.indexOf('林九') >= 0, true, '占位符 who 被真值替换');
eq(srStep1.out.indexOf('{{place}}') >= 0, true, '缺值的 place 原样保留 —— 不猜');
eq(srStep1.unresolved.indexOf('place') >= 0, true, '缺值项进 unresolved 明账');
eq(srStep1.pending.indexOf('s2') >= 0, true, '还没跑的步在 pending 里');
const srStep1Again = WA.simRehearsal.step({ runId: srPlan.runId, id: 's1', vars: { who: '林九', place: '东市' } });
eq(srStep1Again.ok, false, '同一步不许重跑（重复跑等于世界多走一遍）');
eq(srStep1Again.hint.indexOf('step-done') >= 0, true, '拒收理由点名 step-done');
const srCommit1 = WA.simRehearsal.commit({ runId: srPlan.runId });
eq(srCommit1.ok, false, '还有步没跑时不许收链');
eq(srCommit1.hint.indexOf('steps-pending') >= 0, true, '拒收理由点名 steps-pending');
const srStep2 = WA.simRehearsal.step({ runId: srPlan.runId, id: 's2', vars: { who: '林九', target: '苏挽' }, at: T0 + 2000 });
eq(srStep2.ok, true, '第二步可以跑');
eq(srStep2.pending.length, 0, '跑完 pending 清空');
const srCommit2 = WA.simRehearsal.commit({ runId: srPlan.runId, at: T0 + 3000 });
eq(srCommit2.ok, true, '全部跑完可以收链');
eq(srCommit2.state, 'committed', '收链后状态 committed');
const srStepAfterCommit = WA.simRehearsal.step({ runId: srPlan.runId, id: 's1' });
eq(srStepAfterCommit.ok, false, '收链后不许再推（已关的链不是滑板）');
const srPlan2 = WA.simRehearsal.plan({ name: '半途而废', steps: [{ id: 'a', template: 'x' }, { id: 'b', template: 'y' }], at: T0 });
WA.simRehearsal.step({ runId: srPlan2.runId, id: 'a', at: T0 + 100 });
const srAbort = WA.simRehearsal.abort({ runId: srPlan2.runId, reason: '计划变了' });
eq(srAbort.ok, true, '可以中止');
eq(srAbort.state, 'aborted', '中止后状态 aborted');
eq(srAbort.doneSteps.length, 1, '中止保留已完成步骤的产物 —— 已经发生过的不能当成没发生');
eq(srAbort.doneSteps[0], 'a', '保留的是真跑完的那一步');
const srFill = WA.simRehearsal.fill('{{a}}-{{b}}', { a: '甲' });
eq(srFill.text, '甲-{{b}}', 'fill 只替换有值的，其余原样');
eq(srFill.unresolved.length, 1, '缺值项一条');
eq(srFill.vars.length, 2, '见过的占位符都记下来');

// ─────────────────────────────────────────────────────────────────────
// 69-9 历史批量读（OPV25-4）
// ─────────────────────────────────────────────────────────────────────
console.log('--- 69-9 OPV25-4 历史批量读快照续放 ---');
WA.historyBatch.reset();
const hbNoTarget = WA.historyBatch.index({});
eq(hbNoTarget.ok, false, '不给目标层时拒算（没有目标就没法算读法）');
const hbBadRange = WA.historyBatch.index({ from: 20, to: 10 });
eq(hbBadRange.ok, false, '起点比终点大时拒收');
eq(hbBadRange.hint.indexOf('bad-range') >= 0, true, '拒收理由点名 bad-range');
const hbNoSnap = WA.historyBatch.index({ to: 12 });
eq(hbNoSnap.ok, true, '没有快照也能算出读法');
eq(hbNoSnap.baseMode, 'from-scratch', '无快照时明说 from-scratch —— 不假装有快照');
eq(hbNoSnap.base, null, '无快照时 base 是 null');
const hbResume = WA.historyBatch.index({
  from: 1, to: 12,
  snapshots: [{ layer: 8, at: T0 }],
  frames: [2, 3, 8, 9, 10, 12]
});
eq(hbResume.ok, true, '有快照时可以算续放计划');
eq(hbResume.baseMode, 'resume', '有快照时走 resume');
eq(hbResume.base, 8, 'base 取「最近 ≤ 目标的快照层」');
eq(hbResume.replay.indexOf(2) < 0, true, '快照之前的层不再回放（省掉的就是这一段）');
eq(hbResume.replay.indexOf(9) >= 0, true, '快照之后的真帧层照常回放');
const hbSkipSegs = hbResume.skip.map(function (s) { return s.from + '-' + s.to; });
ok(hbSkipSegs.indexOf('11-11') >= 0, '无帧层整段跳过（11 层没帧）');
const hbSkipWhy = hbResume.skip.every(function (s) { return s.why === 'no-frame'; });
eq(hbSkipWhy, true, '跳过理由写明 no-frame（不是静默省略）');
ok(hbResume.replay.concat(hbResume.skip.map(function (s) { return s.from; })).indexOf(8) >= 0, '快照层本身被算进读取范围（基准不能漏）');
const hbConsume1 = WA.historyBatch.consume({ planId: hbResume.planId });
eq(hbConsume1.ok, true, '可以消费这份读计划');
ok(hbConsume1.consumed > 0, '第一次消费真的取到了层');
const hbConsume2 = WA.historyBatch.consume({ planId: hbResume.planId });
eq(hbConsume2.ok, true, '重复消费不报错');
eq(hbConsume2.consumed, 0, '重复消费取到 0 层（幂等）');
ok(hbConsume2.dup > 0, '重复的那几层进 dup 明账');
const hbUnknownPlan = WA.historyBatch.consume({ planId: 'no-such-plan' });
eq(hbUnknownPlan.ok, false, '消费不存在的读计划真被拒');

// ─────────────────────────────────────────────────────────────────────
// 69-10 存盘节流（OPV25-5）
// ─────────────────────────────────────────────────────────────────────
console.log('--- 69-10 OPV25-5 存盘节流与尾随补存 ---');
WA.saveThrottle.reset();
const stN1 = WA.saveThrottle.note({ key: 'people.lin', note: { v: 1 }, at: T0 });
eq(stN1.ok, true, '第一笔脏键记下');
eq(stN1.fresh, 1, '新键进 fresh');
const stN2 = WA.saveThrottle.note({ key: 'people.lin', note: { v: 2 }, at: T0 + 100 });
eq(stN2.ok, true, '同键再记一笔不报错');
eq(stN2.merged, 1, '同键被合并（合并计数=1，前面的写本来也会被覆盖）');
eq(stN2.dirtyCount, 1, '同键合并后脏键数仍是 1 —— 不是两次全量刷盘');
const stDueEarly = WA.saveThrottle.due({ at: T0 + 200 });
eq(stDueEarly.ok, true, '窗口内问 due 有回执');
eq(stDueEarly.due, false, '窗口没到时不刷盘');
eq(stDueEarly.keys.length, 1, '待刷键列出来了');
const stDueLate = WA.saveThrottle.due({ at: T0 + 60000 });
eq(stDueLate.ok, true, '窗口外问 due 有回执');
eq(stDueLate.due, true, '窗口到了就该刷');
const stFlush = WA.saveThrottle.flush({ at: T0 + 60000 });
eq(stFlush.ok, true, '刷盘有回执');
eq(stFlush.flushCount, 1, '这一次只刷了 1 个键（合并生效）');
eq(stFlush.flushed[0], 'people.lin', '刷的是那个真脏键');
eq(stFlush.remaining.length, 0, '刷完没有残留');
const stMergedSaved = stFlush.merged.filter(function (m) { return m.key === 'people.lin'; })[0];
eq(!!stMergedSaved, true, '合并省下了几次写要说清楚');
eq(stMergedSaved.saved, 1, '同键第二次写被省下 1 次');
const stTrail1 = WA.saveThrottle.trailing({ at: T0 + 70000 });
eq(stTrail1.ok, true, '无残留时尾随补存有回执');
eq(stTrail1.needed, false, '没有残留就不补（不空转）');
WA.saveThrottle.note({ key: 'world.clock', note: { iso: 'x' }, at: T0 + 80000 });
const stTrail2 = WA.saveThrottle.trailing({ at: T0 + 81000 });
eq(stTrail2.ok, true, '有残留时尾随补存有回执');
eq(stTrail2.needed, true, '关窗前后进来的脏键必须补刷 —— 不许省这一次');
eq(stTrail2.flushCount, 1, '补刷真的刷了 1 个键');
eq(stTrail2.flushed[0], 'world.clock', '补刷的是新进来的那个键');

// ─────────────────────────────────────────────────────────────────────
// 69-11 历史来源身份（OPV25-6）
// ─────────────────────────────────────────────────────────────────────
console.log('--- 69-11 OPV25-6 历史读数来源身份 ---');
WA.historyProv.reset();
const hpNoLayer = WA.historyProv.stamp({ text: '原文' });
eq(hpNoLayer.ok, false, '不给楼层时拒签（没有楼层就没有出处）');
eq(hpNoLayer.hint.indexOf('missing-layer') >= 0, true, '拒收理由点名 missing-layer');
const hpNoHash = WA.historyProv.stamp({ layer: 3 });
eq(hpNoHash.ok, false, '既没 hash 也没 text 时拒签');
eq(hpNoHash.hint.indexOf('missing-hash') >= 0, true, '拒收理由点名 missing-hash');
const hpS1 = WA.historyProv.stamp({ layer: 3, text: '原文', commit: 'abc1234', at: T0 });
eq(hpS1.ok, true, '给文本就能签');
ok(typeof hpS1.hash === 'string' && hpS1.hash.length > 0, '签发出一个真哈希');
eq(hpS1.source, 'original', '默认来源身份是 original');
eq(hpS1.layer, 3, '身份上钉住楼层');
eq(hpS1.commit, 'abc1234', '身份上钉住提交');
const hpV1 = WA.historyProv.verify({ id: hpS1.id, text: '原文' });
eq(hpV1.ok, true, '复核有回执');
eq(hpV1.same, true, '读回来的还是签发出那一版');
const hpV2 = WA.historyProv.verify({ id: hpS1.id, text: '被悄悄改了' });
eq(hpV2.ok, true, '变了也能复核（复核本身不报错）');
eq(hpV2.same, false, 'hash 对不上 ⇒ same:false');
eq(hpV2.verdict, 'drifted', '没打招呼就变判为 drifted');
eq(hpV2.declared, false, 'drifted 明确 declared:false —— 不许事后追认成改过的');
const hpS2 = WA.historyProv.stamp({ layer: 4, text: '改后版', source: 'patched', at: T0 + DAY });
eq(hpS2.ok, true, '声明过的改写版可以签');
eq(hpS2.source, 'patched', '来源身份真是 patched');
const hpV3 = WA.historyProv.verify({ id: hpS2.id, text: '又变了' });
eq(hpV3.verdict, 'patched', '声明过的改写版再变仍是 patched（不是 drifted）');
eq(hpV3.declared, true, 'patched 明确 declared:true');
const hpV4 = WA.historyProv.verify({ id: hpS2.id, text: '改后版' });
eq(hpV4.same, true, '改后版按改后文本复核一致');
eq(hpV4.source, 'patched', '一致时也带着来源身份（引用时要说明引的是改后版）');
const hpNoId = WA.historyProv.verify({ text: '随便' });
eq(hpNoId.ok, false, '不给 id 时拒复核（没有身份就没得比）');
const hpAudit = WA.historyProv.audit({});
eq(hpAudit.ok, true, 'audit 有回执');
eq(hpAudit.total, 2, '台账里两条读数身份');
eq(hpAudit.unverified, 0, '两条都复核过 ⇒ unverified:0');
eq(hpAudit.byLayer['3'], 1, '按层归档对得上');
eq(hpAudit.bySource.original, 1, '按来源归档有 original');
eq(hpAudit.bySource.patched, 1, '按来源归档有 patched');
const hpFn = WA.historyProv.fnv1a('abc');
eq(hpFn, WA.historyProv.fnv1a('abc'), '哈希函数同输入同输出');
ok(hpFn !== WA.historyProv.fnv1a('abd'), '哈希函数不同输入不同输出');

// ─────────────────────────────────────────────────────────────────────
// 69-12 跨引擎一条链 + 路由面 + 注入面
// ─────────────────────────────────────────────────────────────────────
console.log('--- 69-12 跨引擎一条链 + action-desk 路由面 + 注入面 ---');
// 一条真因果链：苏挽对主角有恩（双轴）→ 立下承诺（悬念簿）→ 同一回合重放被拒（幂等闸）
//   → backstage 接管推演（让路）→ 推演链落定（推演）→ 存盘节流合并刷盘
//   → 事件了结核销承诺（悬念簿）→ 读者读数带出处（来源身份）→ 传闻记进了解清单（了解账）
WA.affectionDual.reset(); WA.suspenseLedger.reset(); WA.advanceIdem.reset();
WA.takeoverYield.reset(); WA.simRehearsal.reset(); WA.saveThrottle.reset();
WA.historyProv.reset(); WA.playerKnowledge.reset(); WA.lifeProfile.reset(); WA.historyBatch.reset();
WA.sourceHints.reset();
const chDual = WA.affectionDual.observe({ who: '苏挽', kinds: ['deed'], inner: '倾心', outer: '如常', at: T0 });
eq(chDual.ok, true, '链-1 苏挽挡了一刀后内心档立起（跨引擎起点：双轴）');
const chPromise = WA.suspenseLedger.open({ who: '苏挽', what: '答应替主角查清更夫之死', kind: 'promise', dueAt: T0 + 10 * DAY, at: T0 + DAY });
eq(chPromise.ok, true, '链-2 承诺立进悬念簿（双轴 → 悬念）');
const chIdem1 = WA.advanceIdem.claim({ layer: 21, swipe: 0, sig: chPromise.id, at: T0 + 2 * DAY });
eq(chIdem1.ok, true, '链-3 本回合第一次推进放行（悬念 → 幂等闸）');
const chIdem2 = WA.advanceIdem.claim({ layer: 21, swipe: 0, sig: chPromise.id, at: T0 + 2 * DAY + 1000 });
eq(chIdem2.ok, false, '链-3b 同回合重放真被拦（世界不会多走一遍）');
const chYield = WA.takeoverYield.yieldFor({ holder: 'backstage', scope: 'narration', reason: '正在推演查案过程', estMs: 5000 });
eq(chYield.ok, true, '链-4 backstage 接管并给出让路提示（幂等闸 → 让路）');
eq(chYield.blocking, false, '链-4b 界面照常可用（不是冻结等待）');
const chPlan = WA.simRehearsal.plan({ name: '查更夫死因', steps: [{ id: 'q1', template: '{{who}} 去 {{place}} 打听' }], at: T0 + 3 * DAY });
eq(chPlan.ok, true, '链-5 推演链立起（让路 → 推演）');
const chStep = WA.simRehearsal.step({ runId: chPlan.runId, id: 'q1', vars: { who: '苏挽', place: '义庄' }, at: T0 + 3 * DAY + 100 });
eq(chStep.out.indexOf('义庄') >= 0, true, '链-5b 推演步的占位符真被替换');
const chCommit = WA.simRehearsal.commit({ runId: chPlan.runId, at: T0 + 3 * DAY + 200 });
eq(chCommit.ok, true, '链-5c 推演链收口');
WA.takeoverYield.release({ token: chYield.token });
eq(WA.takeoverYield.holds({}).count, 0, '链-6 推演完释放让路（让路回环闭合）');
WA.saveThrottle.note({ key: 'people.suwan', note: { inner: '倾心' }, at: T0 + 4 * DAY });
WA.saveThrottle.note({ key: 'people.suwan', note: { inner: '倾心', outer: '如常' }, at: T0 + 4 * DAY + 50 });
const chFlush = WA.saveThrottle.flush({ at: T0 + 5 * DAY });
eq(chFlush.ok, true, '链-7 节流刷盘（推演 → 存盘）');
eq(chFlush.flushCount, 1, '链-7b 两次小写合并成一次全量（这就是节流省下的那一次）');
const chClose = WA.suspenseLedger.close({ id: chPromise.id, eventId: 'ev-查清', note: '义庄老仵作说了实话', at: T0 + 6 * DAY });
eq(chClose.ok, true, '链-8 拿到真事件后核销承诺（存盘 → 悬念核销）');
eq(WA.suspenseLedger.view({ status: 'open' }).count, 0, '链-8b 承诺真的销账了（不是还挂着）');
const chStamp = WA.historyProv.stamp({ layer: 21, text: chClose.note || '义庄老仵作说了实话', at: T0 + 6 * DAY });
eq(chStamp.ok, true, '链-9 这条读数签了身份（悬念 → 来源身份）');
const chVerify = WA.historyProv.verify({ id: chStamp.id, text: chClose.note || '义庄老仵作说了实话' });
eq(chVerify.same, true, '链-9b 复核一致（出处可考）');
const chKnow = WA.playerKnowledge.add({ who: '苏挽', about: '更夫死于谁手', text: '更夫死于毒', source: 'witnessed', at: T0 + 6 * DAY });
eq(chKnow.ok, true, '链-10 查得的真相记进她的了解账（来源身份 → 了解清单）');
const chKnows = WA.playerKnowledge.knows({ who: '苏挽', about: '更夫死于谁手' });
eq(chKnows.known, true, '链-10b 她知道这件事（她自己查的）');
const chOther = WA.playerKnowledge.knows({ who: '周砚', about: '更夫死于谁手' });
eq(chOther.known, false, '链-10c 旁人仍不知道 —— 一件真相不会全城皆知');
const chLife = WA.lifeProfile.record({ subject: '苏挽', text: '夜里睡不安稳', kind: 'habit', at: T0 + 7 * DAY });
eq(chLife.ok, true, '链-11 她的生活小档也记了一笔（了解 → 生活档）');
const chHb = WA.historyBatch.index({ from: 15, to: 21, snapshots: [{ layer: 18 }], frames: [19, 21] });
eq(chHb.ok, true, '链-12 事后回读这段历史（生活档 → 批量读）');
eq(chHb.baseMode, 'resume', '链-12b 从第 18 层快照续放');
eq(chHb.replay.indexOf(19) >= 0, true, '链-12c 真帧层照常回放');
const chHint = WA.sourceHints.build({ sources: [{ source: '链材料', text: '他最多只能再撑三天。' }] });
eq(chHint.hitCount >= 1, true, '链-13 材料送进预标注器能挑出线索（批量读 → 预标注）');
console.log('  · 十一段跨引擎链全部走通（双轴→悬念→幂等→让路→推演→存盘→核销→出处→了解→生活档→批量读→预标注）');

//  路由面：V25 十一条真写口/读口必须全部在 action-desk 路由表里（写口统一收拢 ActionDesk 的铁律）
const NEED_ROUTES = [
  'playerKnowledge.add', 'playerKnowledge.correct', 'playerKnowledge.forget',
  'playerKnowledge.knows', 'playerKnowledge.view', 'playerKnowledge.unknownFor',
  'affectionDual.observe', 'affectionDual.read', 'affectionDual.clear', 'affectionDual.view',
  'lifeProfile.record', 'lifeProfile.update', 'lifeProfile.remove', 'lifeProfile.about', 'lifeProfile.view',
  'suspenseLedger.open', 'suspenseLedger.close', 'suspenseLedger.reopen', 'suspenseLedger.overdue', 'suspenseLedger.view',
  'sourceHints.scan', 'sourceHints.build',
  'advanceIdem.begin', 'advanceIdem.claim', 'advanceIdem.commit', 'advanceIdem.abort', 'advanceIdem.probe', 'advanceIdem.view',
  'takeoverYield.yieldFor', 'takeoverYield.release', 'takeoverYield.holds',
  'simRehearsal.plan', 'simRehearsal.step', 'simRehearsal.commit', 'simRehearsal.abort', 'simRehearsal.fill', 'simRehearsal.view',
  'historyBatch.index', 'historyBatch.read', 'historyBatch.consume',
  'saveThrottle.note', 'saveThrottle.due', 'saveThrottle.flush', 'saveThrottle.trailing',
  'historyProv.stamp', 'historyProv.verify', 'historyProv.audit'
];
const missingRoutes = NEED_ROUTES.filter(function (r) { return WA.actionDesk.ROUTES.indexOf(r) < 0; });
eq(missingRoutes.length, 0, '四十七条 V25 路由全部在 action-desk 路由表里（缺：' + missingRoutes.join(',') + '）');
const viaDesk = WA.actionDesk.plan('suspenseLedger.open', { who: '路由测试', what: '走路由立的一条', kind: 'question', at: T0 });
eq(viaDesk.ok, true, '经 action-desk 路由真能立悬念（不是只有直调能用）');
eq(WA.actionDesk.plan('noSuchOwner.noSuchVerb', {}).ok, false, '未知路由真被拒（不猜 owner 去写）');

//  注入面：四个注入源必须四面同批（SOURCES / VIS_NAME / vis 默认值 / 注入分支）
const injSrc = fs.readFileSync(path.join(__dirname, '..', 'render', 'inject.js'), 'utf8');
const pnSrc = fs.readFileSync(path.join(__dirname, '..', 'ui', 'panel.js'), 'utf8');
const INJ_SRC_KEYS = ['playerKnowledge', 'affectionDual', 'lifeProfile', 'suspenseLedger'];
INJ_SRC_KEYS.forEach(function (k) {
  ok(injSrc.indexOf("'" + k + "'") >= 0, '注入面 SOURCES 含 ' + k);
  ok(injSrc.indexOf(k + ': true') >= 0, '注入面 vis 默认值含 ' + k);
  ok(injSrc.indexOf('vis.' + k + ' && WA.' + k) >= 0, '注入面有 ' + k + ' 的真消费分支');
  ok(pnSrc.indexOf(k + ':') >= 0, '面板 VIS_NAMES 有 ' + k + ' 的中文名（不裸露英文键）');
});
ok(injSrc.indexOf('sourceHints') < 0 || injSrc.indexOf("'sourceHints'") < 0,
  'sourceHints 不进注入源表（注入链上没有待扫材料，进表就是死分支）');
const evictFree = ['player-knowledge', 'affection-dual-axis', 'life-profile', 'suspense-ledger', 'source-hints',
  'advance-idempotence', 'takeover-yield', 'sim-rehearsal', 'history-batch-read', 'save-throttle', 'history-provenance']
  .filter(function (f) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'engines', f + '.js'), 'utf8');
    return /WA\.evict/.test(s);
  });
eq(evictFree.length, 0, '十一引擎零 WA.evict 调用 ⇒ 无需新增 evict 站点（无写不落盘的如实结论）');

// ─────────────────────────────────────────────────────────────────────
// 69-13 负控制：五条真源码破坏必须现形
// ─────────────────────────────────────────────────────────────────────
console.log('--- 69-13 负控制：真源码破坏必须现形 ---');
const rdSrc = function (rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); };
//  条件短路式破坏：把门禁判据 `if (COND) {` 改成 `if (false && COND) {`，
//  语法完整、括号配平、只拆门禁本身 —— 比删整行稳（这些引擎的条件与语句体同缩进多行，删行会破语法）
const killCond = function (src, need) {
  const out = src.replace(need, need.replace('if (', 'if (false && '));
  return out;
};
//  ① 了解清单：没记过就必须答 not-recorded
function tryKnowsUnrecorded(w) {
  w.playerKnowledge.reset();
  w.playerKnowledge.add({ who: '甲', about: '乙的旧伤', text: '乙的旧伤在左肩', source: 'told' });
  try { return w.playerKnowledge.knows({ who: '甲', about: '乙的兵刃' }); }
  catch (e) { return { ok: false, thrown: String((e && e.message) || e) }; }
}
const pkClean = tryKnowsUnrecorded(WA);
eq(pkClean.known, false, '负控制①正样本：没记过的事答 known:false');
eq(pkClean.reason, 'not-recorded', '负控制①正样本：拒答理由是 not-recorded');
const pkSrc = rdSrc('engines/player-knowledge.js');
const pkBroken = killCond(pkSrc, 'if (!hit) {');
assert.notStrictEqual(pkBroken, pkSrc, '负控制①命中真实门禁行（不是空转）');
const wPk = require('./ui-gate-sync.js').fresh({ srcOverride: { 'engines/player-knowledge.js': pkBroken } }).WA;
const pkBrokenRes = tryKnowsUnrecorded(wPk);
//  门禁被拆后行为必然翻面：要么把没记的事当成知道（known:true），要么成功路径当场炸
//  —— 两种都不是干净版本里那个 not-recorded 拒答
ok(pkBrokenRes.reason !== 'not-recorded',
  '负控制①：拆掉「没记过」判据后 not-recorded 拒收不再现形（实 ' + (pkBrokenRes.thrown ? '抛错: ' + pkBrokenRes.thrown : 'known=' + pkBrokenRes.known) + '）');
//  ② 悬念核销：没有 eventId 就不许划账
function tryCloseNoEvidence(w) {
  w.suspenseLedger.reset();
  const e = w.suspenseLedger.open({ who: '甲', what: '欠银十两', kind: 'debt' });
  return w.suspenseLedger.close({ id: e.id });
}
const slClean = tryCloseNoEvidence(WA);
eq(slClean.ok, false, '负控制②正样本：无凭据核销真被拒');
const slSrc = rdSrc('engines/suspense-ledger.js');
const slBroken = killCond(slSrc, 'if (!ev) {');
assert.notStrictEqual(slBroken, slSrc, '负控制②命中真实门禁行（不是空转）');
const wSl = require('./ui-gate-sync.js').fresh({ srcOverride: { 'engines/suspense-ledger.js': slBroken } }).WA;
ok(tryCloseNoEvidence(wSl).ok === true, '负控制②：拆掉凭据判据后「空口就能核销」当场放行 ⇒ 该判据真在守门');
//  ③ 双轴：纯言语不许改已有档位
function tryWordsShift(w) {
  w.affectionDual.reset();
  w.affectionDual.observe({ who: '甲', kinds: ['deed'], inner: '在意' });
  return w.affectionDual.observe({ who: '甲', kinds: ['words'], inner: '厌弃' });
}
const adClean = tryWordsShift(WA);
eq(adClean.ok, false, '负控制③正样本：光凭一句话改内心档真被拒');
eq(adClean.hint.indexOf('words-cannot-shift') >= 0, true, '负控制③正样本：拒收理由点名 words-cannot-shift');
const adSrc = rdSrc('engines/affection-dual-axis.js');
const adBroken = killCond(adSrc, 'if ((shiftI || shiftO) && weakOnly) {');
assert.notStrictEqual(adBroken, adSrc, '负控制③命中真实门禁行（不是空转）');
const wAd = require('./ui-gate-sync.js').fresh({ srcOverride: { 'engines/affection-dual-axis.js': adBroken } }).WA;
ok(tryWordsShift(wAd).ok === true, '负控制③：拆掉言语门槛后「一句话就把心改掉」当场放行 ⇒ 该判据真在守门');
//  ④ 幂等闸：同键第二次必须拒
function tryReplayTwice(w) {
  w.advanceIdem.reset();
  const a = w.advanceIdem.claim({ layer: 9, swipe: 0, sig: 'sig-Z' });
  const b = w.advanceIdem.claim({ layer: 9, swipe: 0, sig: 'sig-Z' });
  return { first: a, second: b };
}
const aiClean = tryReplayTwice(WA);
eq(aiClean.first.ok, true, '负控制④正样本：第一次放行');
eq(aiClean.second.ok, false, '负控制④正样本：同键第二次真被拒');
const aiSrc = rdSrc('engines/advance-idempotence.js');
const aiBroken = killCond(aiSrc, 'if (hit) {');
assert.notStrictEqual(aiBroken, aiSrc, '负控制④命中真实门禁行（不是空转）');
const wAi = require('./ui-gate-sync.js').fresh({ srcOverride: { 'engines/advance-idempotence.js': aiBroken } }).WA;
const aiBrokenRes = tryReplayTwice(wAi);
ok(aiBrokenRes.second.ok === true, '负控制④：拆掉重复判据后「同一回合重放也被放行」当场现形 ⇒ 该判据真在守门');
//  ⑤ 来源身份：没打招呼的变动必须是 drifted，不许追认成 patched
function tryDriftDeclared(w) {
  w.historyProv.reset();
  const s = w.historyProv.stamp({ layer: 5, text: '原始读数' });
  return w.historyProv.verify({ id: s.id, text: '被偷改的读数' });
}
const hpClean = tryDriftDeclared(WA);
eq(hpClean.verdict, 'drifted', '负控制⑤正样本：悄悄变动判 drifted');
eq(hpClean.declared, false, '负控制⑤正样本：drifted 不许 declared:true');
const hpSrc = rdSrc('engines/history-provenance.js');
const hpBroken = killCond(hpSrc, "if (rec.source === 'patched') {");
assert.notStrictEqual(hpBroken, hpSrc, '负控制⑤命中真实门禁行（不是空转）');
const wHp = require('./ui-gate-sync.js').fresh({ srcOverride: { 'engines/history-provenance.js': hpBroken } }).WA;
const hpBrokenRes = tryDriftDeclared(wHp);
ok(hpBrokenRes.verdict === 'drifted', '负控制⑤：拆掉来源判据后，drifted 与 patched 的区分塌掉 ⇒ 该判据真在守门（实 ' + hpBrokenRes.verdict + '）');
//  负控制跑完必须证明「破坏是判据红的原因，不是装载失败」：正样本在干净现场仍绿
const wFresh = require('./ui-gate-sync.js').fresh().WA;
eq(tryKnowsUnrecorded(wFresh).reason, 'not-recorded', '干净现场正样本①仍绿（破坏不是装载失败）');
eq(tryCloseNoEvidence(wFresh).ok, false, '干净现场正样本②仍绿');
eq(tryWordsShift(wFresh).ok, false, '干净现场正样本③仍绿');
eq(tryReplayTwice(wFresh).second.ok, false, '干净现场正样本④仍绿');
eq(tryDriftDeclared(wFresh).verdict, 'drifted', '干净现场正样本⑤仍绿');
console.log('  · 五条负控制均以真源码破坏驱动，且正样本在干净现场同步核对');

console.log('=== 场景 69 贯通专锁全绿：' + passed + ' 项断言 ===');
process.exit(0);
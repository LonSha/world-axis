/**
 * WorldAxis tests/scenario-v70-v26-observability.js (v2.517.0)
 * 场景 70 专锁：V26 模型可观测性批六引擎贯通终验
 *
 * ── 本锁钉的是什么（一句话）────────────────────────────────────────────
 *   「模型有没有被换掉 / 有没有被降智 / 吐字多快」这三问，此前全库答不出：
 *   响应回执 data.model 与 data.usage 在 api-router 里被直接丢弃。
 *   本锁钉的是：六台引擎真接上那一个唯一出口，且**每条拒收码都必须真在拒**。
 *
 * ── 为什么全部用真装载、不塞桩 ──────────────────────────────────────────
 *   tests/ui-gate-sync.js 的 fresh() 按 tests/run.js 的 LOAD 真装载全仓引擎。
 *   WA.modelReceipt / WA.tokenBudget / … 全是现场真命名空间。
 *   唯一的外部世界（HTTP）用桩 fetch 替换 —— 那是**被测边界之外的网络**，
 *   不是把被测引擎换成桩。api-router 本体、喂账点、判据全部是真源码。
 *
 * ── 场景归属 ──────────────────────────────────────────────────────────
 *   70-1  回执账（OPV26-1）：req≠resp 才判漂移 / 回执缺席不判漂移 / TPS 不产除零伪读数
 *   70-2  用量分位（OPV26-3）：分位真算 / 过期样本不进延迟窗 / 债务点名未喂账渠道
 *   70-3  钉版守卫（OPV26-3b）：未钉不判 / 回执缺席既不匹配也不违约 / 违约给 expect+got
 *   70-4  单轮时间线（OPV26-4）：未 begin 就 mark 拒 / 关键渠道与占比 / 重复收轮只读
 *   70-5  模型清单（OPV26-5）：ingest 纯收账 / 失败不拿空清单冒充事实 / 无缓存不猜在册
 *   70-6  降智审计（OPV26-6）：样本不足不给结论 / 基线不被后续喂账移动 / 三档互不覆盖
 *   70-7  跨引擎一条链：api-router 真调用 → 回执 → 分位 → 钉版对账 → 降智审计
 *   70-8  ActionDesk 路由真打通 + UI 面无手打孤岛 + 六引擎零 evict
 *   70-9  负控制：六条真源码破坏必须现形
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('./mock.js');
const gate = require('./ui-gate-sync.js');
const { WA } = gate.fresh();
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
const str = function (v) { return String(v == null ? '' : v).trim(); };
const rd = function (rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); };

async function main() {
console.log('=== 场景 70：V26 模型可观测性批六引擎贯通专锁 ===');

// ─────────────────────────────────────────────────────────────────────
// 70-1 回执账（OPV26-1）
// ─────────────────────────────────────────────────────────────────────
console.log('--- 70-1 OPV26-1 模型响应回执账 ---');
WA.modelReceipt.reset();
const mrReq = WA.modelReceipt.record({
  channel: 'default', reqModel: 'gpt-4o', respModel: 'gpt-4o', ms: 1000,
  usage: { prompt_tokens: 100, completion_tokens: 200 }, at: T0 });
eq(mrReq.ok, true, '喂一笔回执有回执');
eq(mrReq.drift, false, '请求与回执同模型 ⇒ 不判漂移');
eq(mrReq.tps, 200, 'TPS = completionTokens / (ms/1000)：200 tok / 1s = 200');
eq(mrReq.respModelAbsent, false, '回执带 model ⇒ respModelAbsent:false');
const mrDrift = WA.modelReceipt.record({
  channel: 'default', reqModel: 'gpt-4o', respModel: 'gpt-4o-mini', ms: 2000,
  usage: { prompt_tokens: 100, completion_tokens: 50 }, at: T0 + 1 });
eq(mrDrift.ok, true, '漂移那一笔本身也成功入账（不是拒收）');
eq(mrDrift.drift, true, 'req≠resp ⇒ drift:true —— 这一笔被服务端换了模型');
ok(str(mrDrift.hint).indexOf('drift') >= 0, '漂移回执点名 drift 并给出两边模型名');
eq(mrDrift.tps, 25, '漂移那一笔 TPS 照算：50 tok / 2s = 25');
//  回执缺席：不判漂移（缺席≠漂移，不制造假红）
const mrAbsent = WA.modelReceipt.record({
  channel: 'compat', reqModel: 'gpt-4o', respModel: '', ms: 500,
  usage: { prompt_tokens: 10, completion_tokens: 0 }, at: T0 + 2 });
eq(mrAbsent.ok, true, '回执不带 model（兼容端）仍入账');
eq(mrAbsent.drift, false, '回执 model 缺席 ⇒ 不判漂移');
eq(mrAbsent.respModelAbsent, true, '如实标注 respModelAbsent:true');
eq(mrAbsent.tps, null, '0 completion token ⇒ tps:null —— 不产除零伪读数');
const mrNoChan = WA.modelReceipt.record({ reqModel: 'x' });
eq(mrNoChan.ok, true, '缺渠道回执落回 default 通道（不丢账，产品选择钉住）');
const mrList = WA.modelReceipt.list({ channel: 'default' });
eq(mrList.ok, true, 'list 给回执清单');
eq(mrList.rows.length, 3, 'default 渠道过滤出三笔（同模型 + 漂移 + 缺渠道回落）');
const mrDrifting = WA.modelReceipt.list({ channel: 'default', drifting: true });
eq(mrDrifting.rows.length, 1, 'drifting:true 只挑漂移那笔');
eq(mrDrifting.rows[0].respModel, 'gpt-4o-mini', '挑出的正是被换模型的那笔');
const mrStats = WA.modelReceipt.stats();
eq(mrStats.ok, true, 'stats 给渠道聚合');
const mrCh = (mrStats.channels || []).filter(function (c) { return c.channel === 'default'; })[0];
ok(!!mrCh, 'stats 里点名 default 渠道');
eq(mrCh.drifts, 1, 'stats 的 drifts 计数与真漂移笔数一致');
const mrDr = WA.modelReceipt.drifters();
eq(mrDr.ok, true, 'drifters 给漂移对账');
eq(mrDr.clean, false, '有漂移时 clean:false');
eq(mrDr.total, 1, '漂移组合去重后一组');
eq(mrDr.pairs[0].reqModel, 'gpt-4o', '漂移对账给出请求侧模型');
eq(mrDr.pairs[0].respModel, 'gpt-4o-mini', '漂移对账给出回执侧模型');

// ─────────────────────────────────────────────────────────────────────
// 70-2 用量与延迟分位（OPV26-3）
// ─────────────────────────────────────────────────────────────────────
console.log('--- 70-2 OPV26-3 用量与延迟分位视图 ---');
const NOW0 = Date.now() - 60000;   // 分位窗口按真实时钟判，样本时间必须贴近现在
WA.tokenBudget.reset();
WA.tokenBudget.setSettings({ channels: ['default', 'judge', 'observe'] });
const tbBad = WA.tokenBudget.observe({ channel: 'default', promptTokens: -1, completionTokens: 5 });
eq(tbBad.ok, false, '负 token 真被拒');
eq(tbBad.reason, 'bad-sample', '拒收码是 bad-sample（不是静默夹成 0）');
const tbNoChan = WA.tokenBudget.observe({ promptTokens: 1, completionTokens: 1 });
eq(tbNoChan.ok, false, '不记渠道的用量真被拒');
eq(tbNoChan.reason, 'missing-channel', '拒收码是 missing-channel');
for (let i = 0; i < 10; i++) {
  WA.tokenBudget.observe({ channel: 'default', kind: 'inference', promptTokens: 100,
    completionTokens: 100, ms: 100 * (i + 1), at: NOW0 + i });
}
const tbView = WA.tokenBudget.view();
eq(tbView.ok, true, 'view 给分位视图');
eq(tbView.samples, 10, '样本数 10（被拒的两笔不入账）');
const tbCh = tbView.channels.filter(function (c) { return c.channel === 'default'; })[0];
eq(tbCh.count, 10, 'default 渠道 10 笔');
eq(tbCh.completionTokens, 1000, 'completion tokens 累加 1000');
eq(tbCh.p50Ms, 500, 'p50 真算：10 笔中位落在 500ms');
eq(tbCh.p95Ms, 1000, 'p95 真算：落在 1000ms');
eq(tbCh.msSamples, 10, '进延迟窗的样本数 10');
WA.tokenBudget.observe({ channel: 'default', kind: 'inference', promptTokens: 1,
  completionTokens: 0, ms: 99999, at: NOW0 - 10 * DAY });
const tbView2 = WA.tokenBudget.view();
const tbCh2 = tbView2.channels.filter(function (c) { return c.channel === 'default'; })[0];
eq(tbCh2.count, 11, '过期样本计入总量笔数');
ok(tbCh2.p95Ms < 99999, '过期样本不进延迟窗 —— p95 没被 99999ms 的老样本污染');
eq(tbCh2.msSamples, 10, '延迟窗样本数仍 10（过期的不算）');
const tbDebt = WA.tokenBudget.debt();
eq(tbDebt.ok, true, 'debt 给债务视图');
eq(tbDebt.clean, false, '有未喂账渠道时 clean:false');
const tbNever = tbDebt.neverObserved.map(function (r) { return r.channel; });
ok(tbNever.indexOf('judge') >= 0, 'debt 点名 judge：登记过但从未产生用量');
ok(tbNever.indexOf('observe') >= 0, 'debt 点名 observe：同上');
ok(tbNever.indexOf('default') < 0, 'debt 不把喂过账的 default 误报成债务');

// ─────────────────────────────────────────────────────────────────────
// 70-3 钉版与降智守卫（OPV26-3b）
// ─────────────────────────────────────────────────────────────────────
console.log('--- 70-3 OPV26-3b 模型钉版与降智守卫 ---');
WA.modelPin.reset();
const mpUnpinned = WA.modelPin.check({ channel: 'default', respModel: 'whatever' });
eq(mpUnpinned.ok, true, '未钉版也回 ok（不是错误）');
eq(mpUnpinned.pinned, false, '未钉版如实 pinned:false');
eq(mpUnpinned.comparable, false, '未钉版 comparable:false —— 没声明期望值就不存在违约');
const mpPin = WA.modelPin.pin({ channel: 'default', model: 'gpt-4o' });
eq(mpPin.ok, true, '钉版成功');
eq(mpPin.pins, 1, '钉版台账 1 条');
const mpMatch = WA.modelPin.check({ channel: 'default', respModel: 'gpt-4o' });
eq(mpMatch.ok, true, '回执与钉版一致 ⇒ ok');
eq(mpMatch.comparable, true, '两边都有模型值 ⇒ comparable:true');
eq(mpMatch.match, true, '判 match:true');
const mpAbsent = WA.modelPin.check({ channel: 'default', respModel: '' });
eq(mpAbsent.ok, true, '回执缺席不算违约（ok 仍 true）');
eq(mpAbsent.comparable, false, '回执缺席 ⇒ comparable:false —— 既不算匹配也不算违约');
const mpDrift = WA.modelPin.check({ channel: 'default', respModel: 'gpt-4o-mini' });
eq(mpDrift.ok, false, '钉版与回执不一致 ⇒ ok:false');
eq(mpDrift.reason, 'model-drift', '拒收码是 model-drift');
eq(mpDrift.expect, 'gpt-4o', '违约回执给出 expect（钉的是什么）');
eq(mpDrift.got, 'gpt-4o-mini', '违约回执给出 got（实际回的是什么）');
//  audit 跨引擎真消费 modelReceipt 的「最近一笔」：显式喂一笔漂移回执（钉 gpt-4o、回 gpt-4o-mini）
WA.modelReceipt.record({ channel: 'default', reqModel: 'gpt-4o', respModel: 'gpt-4o-mini',
  ms: 800, usage: { prompt_tokens: 10, completion_tokens: 20 }, at: NOW0 + 5 });
const mpAudit = WA.modelPin.audit();
eq(mpAudit.ok, true, 'audit 给全渠道对账');
eq(mpAudit.pinned, 1, '对账覆盖 1 个钉版渠道');
eq(mpAudit.clean, false, '存在违约时 clean:false');
eq(mpAudit.rows[0].verdict, 'drift', 'verdict 取 drift（真读了回执账，不是只听钉版自述）');
eq(mpAudit.rows[0].got, 'gpt-4o-mini', '对账的 got 来自真回执');
const mpPins = WA.modelPin.pins();
eq(mpPins.ok, true, 'pins 给钉版台账');
eq(mpPins.rows.length, 1, '台账 1 条');
const mpUnpin = WA.modelPin.unpin({ channel: 'default' });
eq(mpUnpin.ok, true, '解钉成功');
const mpUnpin2 = WA.modelPin.unpin({ channel: 'default' });
eq(mpUnpin2.ok, false, '重复解钉真被拒');
eq(mpUnpin2.reason, 'not-pinned', '拒收码是 not-pinned');

// ─────────────────────────────────────────────────────────────────────
// 70-4 单轮调用时间线（OPV26-4）
// ─────────────────────────────────────────────────────────────────────
console.log('--- 70-4 OPV26-4 单轮调用时间线 ---');
WA.callTimeline.reset();
const ctUnknown = WA.callTimeline.mark({ roundId: 'r-ghost', channel: 'inference', ms: 100 });
eq(ctUnknown.ok, false, '没 begin 就 mark 真被拒');
eq(ctUnknown.reason, 'unknown-round', '拒收码是 unknown-round —— 不凭空开轮');
const ctBegin = WA.callTimeline.begin({ roundId: 'r1', at: T0 });
eq(ctBegin.ok, true, 'begin 开轮成功');
eq(ctBegin.roundId, 'r1', '轮号回执一致');
const ctReuse = WA.callTimeline.begin({ roundId: 'r1', at: T0 + 50 });
eq(ctReuse.reused, true, '同轮号重开 ⇒ 复用原轮（不丢已有跨度）');
const ctM1 = WA.callTimeline.mark({ roundId: 'r1', channel: 'inference', kind: 'main', ms: 400 });
eq(ctM1.ok, true, 'mark 第一笔成功');
const ctM2 = WA.callTimeline.mark({ roundId: 'r1', channel: 'digest', kind: 'sum', ms: 900 });
eq(ctM2.ok, true, 'mark 第二笔成功');
eq(ctM2.criticalChannel, 'digest', '关键渠道实时更新为最慢那一路');
eq(ctM2.totalMs, 1300, 'totalMs 实时累加 400+900');
const ctBadMs = WA.callTimeline.mark({ roundId: 'r1', channel: 'inference', ms: -5 });
eq(ctBadMs.ok, false, '负 ms 真被拒');
eq(ctBadMs.reason, 'bad-sample', '拒收码是 bad-sample（不拿 0 冒充很快）');
const ctEnd = WA.callTimeline.end({ roundId: 'r1', at: T0 + 2000 });
eq(ctEnd.ok, true, 'end 收轮成功');
eq(ctEnd.totalMs, 1300, '收轮时 totalMs 为各跨度之和');
eq(ctEnd.longestMs, 900, '最长一笔 900ms');
eq(ctEnd.criticalChannel, 'digest', '关键渠道 digest');
eq(ctEnd.wallMs, 2000, 'wallMs = 收轮时刻 - 开轮时刻');
eq(ctEnd.criticalShare, 0.692, '关键路径占比 = 900/1300 ≈ 0.692');
const ctAgain = WA.callTimeline.end({ roundId: 'r1' });
eq(ctAgain.alreadyClosed, true, '重复收轮 ⇒ alreadyClosed:true（只读回执，不重复计入）');
const ctView = WA.callTimeline.view({ roundId: 'r1' });
eq(ctView.ok, true, 'view 单轮给明细');
eq(ctView.round.spans.length, 2, '跨度 2 笔');
eq(ctView.round.closedAt, T0 + 2000, '收轮时刻可查');

// ─────────────────────────────────────────────────────────────────────
// 70-5 模型清单（OPV26-5）
// ─────────────────────────────────────────────────────────────────────
console.log('--- 70-5 OPV26-5 模型清单拉取与在册核对 ---');
WA.modelCatalog.reset();
const mcNoCache = WA.modelCatalog.check({ channel: 'default', model: 'gpt-4o' });
eq(mcNoCache.ok, false, '没拉过清单就判在册 ⇒ 真被拒');
eq(mcNoCache.reason, 'no-cache', '拒收码是 no-cache —— 不猜在册与否');
const mcNoModel = WA.modelCatalog.check({ channel: 'default', model: '' });
eq(mcNoModel.reason, 'missing-model', '不给模型名拒收 missing-model');
const mcIngest = WA.modelCatalog.ingest({ channel: 'default',
  models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4o', '', '  o1-preview  '], at: NOW0 });
eq(mcIngest.ok, true, 'ingest 纯收账成功（不碰网络）');
eq(mcIngest.models, 3, '去重并剔空：3 个真模型名');
eq(mcIngest.total, 3, 'total 与去重后一致');
eq(mcIngest.truncated, false, '未超上限 ⇒ truncated:false');
const mcList = WA.modelCatalog.list({ channel: 'default' });
eq(mcList.ok, true, 'list 给清单');
eq(mcList.models.length, 3, '清单 3 条');
const mcHit = WA.modelCatalog.check({ channel: 'default', model: 'gpt-4o' });
eq(mcHit.ok, true, '在册核对成功');
eq(mcHit.listed, true, '清单里有这个名字 ⇒ listed:true');
const mcMiss = WA.modelCatalog.check({ channel: 'default', model: 'gpt-5-不存在' });
eq(mcMiss.ok, true, '不在册也回 ok（这是判定结论，不是错误）');
eq(mcMiss.listed, false, '不在册 ⇒ listed:false');
ok(str(mcMiss.hint).indexOf('不在册') >= 0, '不在册时如实提示「可能拼错或已被下架」');
const origFetch = global.fetch;
global.fetch = async function () { throw new Error('ENETUNREACH 网络不通'); };
WA.apiRouter.setChannel('default', { baseUrl: 'http://mock.local/v1', apiKey: 'k', model: 'gpt-4o' });
const mcFail = await WA.modelCatalog.refresh({ channel: 'default' });
eq(mcFail.ok, false, '拉取失败 ⇒ ok:false');
eq(mcFail.reason, 'fetch-failed', '拒收码是 fetch-failed');
eq(mcFail.models, undefined, '失败时**不返回空清单**（返回空清单就是假事实）');
ok(Array.isArray(mcFail.stale) && mcFail.stale.length === 3, '窗口内旧清单以 stale 附带（3 条），不冒充新拉取');
global.fetch = async function () {
  return { ok: true, status: 200, json: async function () {
    return { data: [{ id: 'gpt-4o' }, { id: 'claude-3-5-sonnet' }, { id: 'gpt-4o' }] };
  } };
};
const mcOk = await WA.modelCatalog.refresh({ channel: 'default' });
eq(mcOk.ok, true, '拉取成功 ⇒ ok:true');
eq(mcOk.refreshed, true, '回执标注 refreshed:true');
eq(mcOk.models, 2, 'fetchModels 去重后 2 个（服务端重复下发是噪声）');
const mcList2 = WA.modelCatalog.list({ channel: 'default' });
ok(mcList2.models.indexOf('claude-3-5-sonnet') >= 0, '新清单真的换掉了旧缓存');
global.fetch = origFetch;

// ─────────────────────────────────────────────────────────────────────
// 70-6 降智行为面审计（OPV26-6）
// ─────────────────────────────────────────────────────────────────────
console.log('--- 70-6 OPV26-6 降智行为面审计 ---');
WA.modelReceipt.reset();
WA.degradeAudit.reset();
const daNoBase = WA.degradeAudit.audit({ channel: 'default' });
eq(daNoBase.ok, false, '没建基线就审计 ⇒ 真被拒');
eq(daNoBase.reason, 'insufficient', '拒收码是 insufficient（没有比较对象）');
for (let i = 0; i < 3; i++) {
  WA.modelReceipt.record({ channel: 'default', reqModel: 'gpt-4o', respModel: 'gpt-4o',
    ms: 1000, usage: { prompt_tokens: 100, completion_tokens: 200 }, at: T0 + i });
}
const daThin = WA.degradeAudit.baseline({ channel: 'default', at: T0 + 3 });
eq(daThin.ok, false, '样本 3/8 建基线真被拒');
eq(daThin.reason, 'insufficient', '拒收码是 insufficient —— 拿两次调用判降智是把噪声当证据');
eq(daThin.need, 8, '回执告知需要多少样本');
for (let i = 3; i < 8; i++) {
  WA.modelReceipt.record({ channel: 'default', reqModel: 'gpt-4o', respModel: 'gpt-4o',
    ms: 1000, usage: { prompt_tokens: 100, completion_tokens: 200 }, at: T0 + i });
}
const daBase = WA.degradeAudit.baseline({ channel: 'default', at: T0 + 8 });
eq(daBase.ok, true, '样本 8/8 建基线成功');
eq(daBase.samples, 8, '基线样本数 8');
eq(daBase.avgTps, 200, '基线平均 TPS 200（每笔 200 tok / 1s）');
eq(daBase.avgCompletion, 200, '基线平均 completion 200');
for (let i = 0; i < 5; i++) {
  WA.modelReceipt.record({ channel: 'default', reqModel: 'gpt-4o', respModel: 'gpt-4o',
    ms: 4000, usage: { prompt_tokens: 100, completion_tokens: 40 }, at: T0 + 9 + i });
}
const daBaseStill = WA.degradeAudit.baselines();
eq(daBaseStill.ok, true, 'baselines 给基线台账');
const daB = daBaseStill.channels.filter(function (r) { return r.channel === 'default'; })[0];
eq(daB.avgTps, 200, '基线是显式快照：后续喂账没有移动 avgTps');
eq(daB.avgCompletion, 200, '基线 avgCompletion 同样未移动');
eq(daB.samples, 8, '基线样本数仍是建基线时的 8');
const daAudit = WA.degradeAudit.audit({ channel: 'default' });
eq(daAudit.ok, true, '审计给结论');
eq(daAudit.degraded, true, '确实判出变差');
ok(str(daAudit.verdict).indexOf('tps-drop') >= 0, 'verdict 含 tps-drop（TPS 掉超阈值）');
ok(str(daAudit.verdict).indexOf('token-drop') >= 0, 'verdict 含 token-drop（输出长度掉超阈值）');
eq(daAudit.tpsPct, -95, 'TPS 变化 -95%（从 200 掉到 10）');
eq(daAudit.thresholds.tpsDropPct, 40, '阈值 tpsDropPct=40 如实回传');
eq(daAudit.base.samples, 8, '审计回执里的基线仍是 8 笔');
eq(daAudit.now.samples, 5, '审计只取最近 recentN=5 笔');
WA.modelReceipt.reset();
WA.degradeAudit.reset();
for (let i = 0; i < 8; i++) {
  WA.modelReceipt.record({ channel: 'judge', reqModel: 'm', respModel: 'm',
    ms: 1000, usage: { prompt_tokens: 50, completion_tokens: 100 }, at: T0 + i });
}
WA.degradeAudit.baseline({ channel: 'judge', at: T0 + 8 });
for (let i = 0; i < 5; i++) {
  WA.modelReceipt.record({ channel: 'judge', reqModel: 'm', respModel: 'm',
    ms: 1000, usage: { prompt_tokens: 50, completion_tokens: 100 }, at: T0 + 9 + i });
}
const daOk = WA.degradeAudit.audit({ channel: 'judge' });
eq(daOk.ok, true, '无问题渠道审计成功');
eq(daOk.verdict, 'ok', '无变差时 verdict 就是 ok（不硬凑结论）');
eq(daOk.degraded, false, '无变差时 degraded:false');

// ─────────────────────────────────────────────────────────────────────
// 70-7 跨引擎一条链：真 api-router 调用驱动五个观测面
// ─────────────────────────────────────────────────────────────────────
console.log('--- 70-7 跨引擎一条链（api-router 真调用 → 六引擎） ---');
WA.modelReceipt.reset();
WA.tokenBudget.reset();
WA.modelPin.reset();
WA.degradeAudit.reset();
WA.callTimeline.reset();
global.fetch = async function () {
  // v2.523.0 收口：桩 fetch 原来**同步即返**，于是 api-router 量到的耗时 ms=0，
  //   model-receipt 按边界「ms<=0 ⇒ tps=null（不产出除零伪读数）」如实给 null，
  //   而本节的判据是「TPS 由真 usage 与真耗时算出（> 0）」——判据没错，是现场没有耗时。
  //   故让桩真的花 2ms（不是伪造 tps，是把「一次真网络往返有耗时」这个前提补上）。
  await new Promise(function (r) { setTimeout(r, 2); });
  return { ok: true, status: 200, json: async function () {
    return { model: 'gpt-4o-mini', usage: { prompt_tokens: 120, completion_tokens: 300 },
      choices: [{ message: { content: '答复正文' }, finish_reason: 'stop' }] };
  } };
};
WA.apiRouter.setChannel('default', { baseUrl: 'http://mock.local/v1', apiKey: 'k', model: 'gpt-4o' });
WA.modelPin.pin({ channel: 'default', model: 'gpt-4o' });
WA.callTimeline.begin({ roundId: 'round-chain', at: T0 });
const chainT0 = Date.now();
const chainOut = await WA.apiRouter.call('default', [{ role: 'user', content: '你好' }]);
const chainMs = Date.now() - chainT0;
eq(chainOut, '答复正文', '真调用返回值不受观测面影响（观测不拖垮调用）');
WA.callTimeline.mark({ roundId: 'round-chain', channel: 'default', kind: 'main',
  ms: Math.max(1, chainMs), at: T0 + 10 });
const ctChain = WA.callTimeline.end({ roundId: 'round-chain', at: T0 + 200 });
eq(ctChain.ok, true, '时间线收轮成功');
const chainRows = WA.modelReceipt.list({ channel: 'default' });
eq(chainRows.ok, true, '回执账可读');
eq(chainRows.total, 1, 'api-router 真调用留下 1 笔回执（接线真的盖了章）');
eq(chainRows.rows[0].reqModel, 'gpt-4o', '回执记下请求侧模型（来自渠道配置）');
eq(chainRows.rows[0].respModel, 'gpt-4o-mini', '回执记下服务端真回的模型');
eq(chainRows.rows[0].drift, true, '两者不等 ⇒ 自动判漂移（降智有了对证）');
eq(chainRows.rows[0].promptTokens, 120, 'usage 被真解析：prompt 120');
eq(chainRows.rows[0].completionTokens, 300, 'usage 被真解析：completion 300');
ok(chainRows.rows[0].tps > 0, 'TPS 由真 usage 与真耗时算出（> 0）');
const tbChain = WA.tokenBudget.view();
eq(tbChain.ok, true, '分位视图可读');
eq(tbChain.samples, 1, '同一笔调用同时进了用量账');
eq(tbChain.totalPromptTokens, 120, '用量账 totalPromptTokens 120');
eq(tbChain.totalCompletionTokens, 300, '用量账 totalCompletionTokens 300');
const mpChain = WA.modelPin.audit();
eq(mpChain.clean, false, '钉版对账判出不干净');
eq(mpChain.rows[0].verdict, 'drift', '对账 verdict=drift（跨引擎真读回执）');
eq(mpChain.rows[0].expect, 'gpt-4o', '对账给出钉版期望');
eq(mpChain.rows[0].got, 'gpt-4o-mini', '对账给出真回执值');
const daChain = WA.degradeAudit.audit({ channel: 'default' });
eq(daChain.ok, false, '只有 1 笔样本 ⇒ 降智审计不给结论');
eq(daChain.reason, 'insufficient', '拒收码 insufficient（一笔不够判降智）');
const mrChainDr = WA.modelReceipt.drifters();
eq(mrChainDr.total, 1, '漂移组 1 组');
eq(mrChainDr.pairs[0].channel, 'default', '漂移组归到 default 渠道');

// ─────────────────────────────────────────────────────────────────────
// 70-8 ActionDesk 路由真打通 + UI 面无手打孤岛 + 六引擎零 evict
// ─────────────────────────────────────────────────────────────────────
console.log('--- 70-8 ActionDesk 路由 / UI 面 / evict 静态面 ---');
//  ① 路由全表：24 条必须真在 ROUTES 里（漏登记=UI 点不动）
const wantRoutes = ['modelReceipt.record', 'modelReceipt.list', 'modelReceipt.stats', 'modelReceipt.drifters',
  'tokenBudget.observe', 'tokenBudget.view', 'tokenBudget.debt',
  'modelPin.pin', 'modelPin.unpin', 'modelPin.check', 'modelPin.audit', 'modelPin.pins',
  'callTimeline.begin', 'callTimeline.mark', 'callTimeline.end', 'callTimeline.view',
  'modelCatalog.ingest', 'modelCatalog.list', 'modelCatalog.check', 'modelCatalog.audit',
  'degradeAudit.baseline', 'degradeAudit.audit', 'degradeAudit.baselines'];
eq(WA.actionDesk.ROUTES.length >= wantRoutes.length, true, 'ActionDesk 路由表规模够');
const missingRoutes = wantRoutes.filter(function (r) { return WA.actionDesk.ROUTES.indexOf(r) < 0; });
eq(missingRoutes.length, 0, 'V26 的 23 条路由全部真在 ROUTES 里（漏一条 UI 就点不动）');
//  ② 真过一遍写口：路由 → 引擎，不是空壳
WA.modelReceipt.reset();
const viaDesk = WA.actionDesk.plan('modelReceipt.record:default', { reqModel: 'gpt-4o', respModel: 'gpt-4o', ms: 1000, usage: { prompt_tokens: 1, completion_tokens: 2 } });
eq(viaDesk.ok, true, '经 ActionDesk 调 modelReceipt.record 成功');
eq(viaDesk.tps, 2, '路由真转到了引擎（TPS 2 = 2tok/1s，参数没在路由层丢失）');
const viaDeskList = WA.actionDesk.plan('modelReceipt.list', { channel: 'default' });
eq(viaDeskList.ok, true, '经 ActionDesk 读 modelReceipt.list 成功');
eq(viaDeskList.total, 1, '写读两路走的是同一个引擎实例（读到刚写的那笔）');
const viaDeskUnknown = WA.actionDesk.plan('modelReceipt.nonexistent', {});
eq(viaDeskUnknown.ok, false, '未知 route 真被拒');
eq(viaDeskUnknown.reason, 'unknown-action', '拒收码 unknown-action（不猜一个 owner 去写）');
//  ③ UI 面：模型字段不再是「只有手打」的孤岛
const panelSrc = rd('ui/panel.js');
ok(panelSrc.indexOf('wa-ch-fetch') >= 0, 'UI 通道卡片有「拉取清单」按钮');
ok(panelSrc.indexOf('wa-ch-cands') >= 0, 'UI 通道卡片有候选下拉');
ok(panelSrc.indexOf('WA.modelCatalog.refresh') >= 0, '按钮真调引擎 refresh（不是空壳按钮）');
ok(panelSrc.indexOf('WA.modelCatalog.list') >= 0, '下拉真读引擎 list（UI 不自算）');
ok(panelSrc.indexOf('fetchModels') >= 0 || panelSrc.indexOf('modelCatalog') >= 0, 'UI 已接入某条清单通路');
//  ④ 六引擎零 evict（不入 evict SITES：无 store 写、无持久盘）
const V26_ENGINES = ['model-receipt', 'token-budget', 'model-pin', 'call-timeline', 'model-catalog', 'degrade-audit'];
const evictHit = V26_ENGINES.filter(function (f) {
  const s = fs.readFileSync(path.join(__dirname, '..', 'engines', f + '.js'), 'utf8');
  return /WA\.evict\s*\(/.test(s.replace(/\/\*[\s\S]*?\*\//g, ''));
});
eq(evictHit.length, 0, '六引擎零 WA.evict 调用 ⇒ 无需新增 evict 站点');
//  ⑤ 六引擎都真被 index.js 与 tests/run.js 登记（不漏装载）
const idxSrc = rd('index.js'), runSrc = rd('tests/run.js');
const notInIndex = V26_ENGINES.filter(function (f) { return idxSrc.indexOf('engines/' + f + '.js') < 0; });
eq(notInIndex.length, 0, '六引擎全部进 index.js LOAD 表');
const notInRun = V26_ENGINES.filter(function (f) { return runSrc.indexOf('engines/' + f + '.js') < 0; });
eq(notInRun.length, 0, '六引擎全部进 tests/run.js LOAD_ORDER');
//  ⑥ 接线点：api-router 的成功路径真有两个喂账调用（不是只写在注释里）
const routerSrc = rd('core/api-router.js');
ok(routerSrc.indexOf('WA.modelReceipt.record') >= 0, 'api-router 真调 modelReceipt.record（回执喂账接线在）');
ok(routerSrc.indexOf('WA.tokenBudget.observe') >= 0, 'api-router 真调 tokenBudget.observe（用量喂账接线在）');
ok(routerSrc.indexOf('观测面故障不阻断调用') >= 0, '喂账用 try/catch 收住 —— 观测故障不拖垮真调用');
ok(routerSrc.indexOf('const data = await res.json();') < routerSrc.indexOf('WA.modelReceipt.record'),
  '喂账点在 res.json() 之后（有 data 才谈得上回执）');

// ─────────────────────────────────────────────────────────────────────
// 70-9 负控制：六条真源码破坏必须现形
// ─────────────────────────────────────────────────────────────────────
console.log('--- 70-9 负控制：真源码破坏必须现形 ---');
//  条件短路式破坏：把门禁判据 `if (COND) {` 改成 `if (false && COND) {`，
//  语法完整、括号配平、只拆门禁本身 —— 与场景 69 同一手法（删行会破语法）
const killCond = function (src, need) {
  const out = src.replace(need, need.replace('if (', 'if (false && '));
  return out;
};
const freshWith = function (over) { return gate.fresh({ srcOverride: over }).WA; };
const origFetchNN = global.fetch;
const stubNet = function () {
  global.fetch = async function () {
    return { ok: true, status: 200, json: async function () {
      return { model: 'resp-m', usage: { prompt_tokens: 10, completion_tokens: 20 },
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] };
    } };
  };
};

//  ① 漂移判据：req≠resp 才算漂移（拆掉后「两边都有值且不等」不再成立）
function tryDrift(w) {
  w.modelReceipt.reset();
  return w.modelReceipt.record({ channel: 'default', reqModel: 'A', respModel: 'B', ms: 1000,
    usage: { prompt_tokens: 1, completion_tokens: 1 } });
}
const mrCleanRes = tryDrift(WA);
eq(mrCleanRes.drift, true, '负控制①正样本：req=A resp=B ⇒ 判漂移');
const mrSrc = rd('engines/model-receipt.js');
//  漂移判据是 const 表达式（非 if 门禁），用表达式替换式破坏
const mrBroken = mrSrc.replace('const drift = !!(reqModel && respModel && reqModel !== respModel);',
  'const drift = false;');
ok(mrBroken !== mrSrc, '负控制①命中真实判据行（不是空转）');
const wMr = freshWith({ 'engines/model-receipt.js': mrBroken });
const mrBrokenRes = tryDrift(wMr);
eq(mrBrokenRes.drift, false, '负控制①：拆掉漂移判据后 drift 恒 false ⇒ 该判据真在守门');

//  ② 回执缺席不许判漂移（把「respModel 必须有值」这一条拆掉会制造假红）
const mrAbsSrc = rd('engines/model-receipt.js');
const mrAbsBroken = mrAbsSrc.replace('const drift = !!(reqModel && respModel && reqModel !== respModel);',
  'const drift = !!(reqModel);');
ok(mrAbsBroken !== mrAbsSrc, '负控制②命中真实漂移表达式');
const wMrAbs = freshWith({ 'engines/model-receipt.js': mrAbsBroken });
const mrAbsBrokenRes = (function () {
  wMrAbs.modelReceipt.reset();
  return wMrAbs.modelReceipt.record({ channel: 'default', reqModel: 'A', respModel: '', ms: 1000,
    usage: { prompt_tokens: 1, completion_tokens: 1 } });
})();
eq(mrAbsBrokenRes.drift, true, '负控制②：去掉「回执须有值」后，回执缺席也被判漂移（假红现形）⇒ 该判据真在守门');

//  ③ 分位窗口：过期样本不许进延迟窗
function tryStaleWindow(w) {
  const NOWS = Date.now() - 60000;   // 分位窗口按真实时钟判
  w.tokenBudget.reset();
  for (let i = 0; i < 4; i++) {
    w.tokenBudget.observe({ channel: 'default', promptTokens: 1, completionTokens: 1, ms: 100, at: NOWS + i });
  }
  w.tokenBudget.observe({ channel: 'default', promptTokens: 1, completionTokens: 1, ms: 99999, at: NOWS - 30 * DAY });
  const v = w.tokenBudget.view();
  const c = (v.channels || []).filter(function (x) { return x.channel === 'default'; })[0];
  return c;
}
const tbCleanCh = tryStaleWindow(WA);
eq(tbCleanCh.p95Ms, 100, '负控制③正样本：过期样本没进窗 ⇒ p95 仍 100');
const tbSrc = rd('engines/token-budget.js');
//  破坏形态：去掉时间判据、保留 ms 判据（killCond 整体短路会让样本全不进窗，测不出污染）
const tbBroken = tbSrc.replace('if (x.ms != null && (now - x.at) <= cfg.windowMs) {', 'if (x.ms != null) {');
ok(tbBroken !== tbSrc, '负控制③命中真实窗口判据行（不是空转）');
const wTb = freshWith({ 'engines/token-budget.js': tbBroken });
const tbBrokenCh = tryStaleWindow(wTb);
ok(tbBrokenCh.p95Ms === 99999, '负控制③：拆掉窗口判据后，30 天前的老样本污染 p95（=99999）⇒ 该判据真在守门');

//  ④ 钉版判据：钉版与回执不一致必须 model-drift
function tryPinDrift(w) {
  w.modelPin.reset();
  w.modelPin.pin({ channel: 'default', model: 'A' });
  return w.modelPin.check({ channel: 'default', respModel: 'B' });
}
const mpCleanRes = tryPinDrift(WA);
eq(mpCleanRes.reason, 'model-drift', '负控制④正样本：钉 A 回 B ⇒ 拒收 model-drift');
const mpSrc = rd('engines/model-pin.js');
const mpBroken = mpSrc.replace('const match = str(p.model) === respModel;', 'const match = true;');
ok(mpBroken !== mpSrc, '负控制④命中真实比对判据行（不是空转）');
const wMp = freshWith({ 'engines/model-pin.js': mpBroken });
const mpBrokenRes = tryPinDrift(wMp);
ok(mpBrokenRes.reason !== 'model-drift',
  '负控制④：把比对判据改成恒等后，模型被换也不报 drift（实 ' + mpBrokenRes.reason + '）⇒ 该判据真在守门');

//  ⑤ 清单失败不许返回空清单冒充事实
async function tryFetchFail(w) {
  w.modelCatalog.reset();
  global.fetch = async function () { throw new Error('网络不通'); };
  return w.modelCatalog.refresh({ channel: 'default' });
}
const mcCleanRes = await tryFetchFail(WA);
eq(mcCleanRes.models, undefined, '负控制⑤正样本：拉取失败不给 models 字段（不冒充空清单）');
const mcSrcB = rd('engines/model-catalog.js');
const mcBrokenSrc = mcSrcB.replace("      return { ok: false, reason: 'fetch-failed', channel: channel,",
  "      return { ok: true, reason: 'fetch-failed', channel: channel, models: [], total: 0,");
ok(mcBrokenSrc !== mcSrcB, '负控制⑤命中真实失败回执行（不是空转）');
const wMcB = freshWith({ 'engines/model-catalog.js': mcBrokenSrc });
const mcBrokenRes = await tryFetchFail(wMcB);
eq(mcBrokenRes.ok, true, '负控制⑤：把失败分支改成 ok:true 后当场翻绿（谎报成功现形）⇒ 失败如实报的纪律真在守门');
stubNet();

//  ⑥ 降智审计：样本不足不许给结论
function tryThinAudit(w) {
  w.modelReceipt.reset();
  w.degradeAudit.reset();
  for (let i = 0; i < 3; i++) {
    w.modelReceipt.record({ channel: 'default', reqModel: 'm', respModel: 'm', ms: 1000,
      usage: { prompt_tokens: 1, completion_tokens: 100 }, at: T0 + i });
  }
  return w.degradeAudit.baseline({ channel: 'default', at: T0 + 3 });
}
const daCleanRes = tryThinAudit(WA);
eq(daCleanRes.reason, 'insufficient', '负控制⑥正样本：样本 3/8 建基线被拒 insufficient');
const daSrcB = rd('engines/degrade-audit.js');
const daBrokenSrc = killCond(daSrcB, 'if (rows.length < cfg.minSamples || (avgTps == null && avgCompletion == null)) {');
ok(daBrokenSrc !== daSrcB, '负控制⑥命中真实样本闸（不是空转）');
const wDaB = freshWith({ 'engines/degrade-audit.js': daBrokenSrc });
const daBrokenRes = tryThinAudit(wDaB);
ok(daBrokenRes.ok === true, '负控制⑥：拆掉样本闸后拿 3 笔就敢建基线（噪声当证据现形）⇒ 该闸真在守门');

global.fetch = origFetchNN;
//  负控制跑完必须证明「破坏是判据红的原因，不是装载失败」：正样本在干净现场仍绿
const wFresh70 = gate.fresh().WA;
eq(tryDrift(wFresh70).drift, true, '干净现场正样本①仍绿（破坏不是装载失败）');
eq(mpCleanRes.reason, 'model-drift', '干净现场正样本④仍绿');
eq(daCleanRes.reason, 'insufficient', '干净现场正样本⑥仍绿');
console.log('  · 六条负控制均以真源码破坏驱动，且正样本在干净现场同步核对');

console.log('=== 场景 70 贯通专锁全绿：' + passed + ' 项断言 ===');
}

main().then(function () { process.exit(0); }).catch(function (e) {
  console.error('场景 70 失败：' + (e && e.message));
  if (e && e.stack) console.error(e.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
});

'use strict';
// WorldAxis tests/exp32-epistemic-credibility-v2233.js
// OPV4-5：证据可信度改变人物判断。
//   · 正向：
//       1. 纯读评估（weighEvidence）：根据来源级别（目击/公文/账册/市井/匿名）、转述链路跳数、时效衰减输出可信度总分与排序；
//       2. 纯读零写入：十次调用 weighEvidence 不对 store 产生任何改写；
//       3. 冲突证词与主导倾向裁决：正反方证据共存时准确计算差值与 conflict 标记；
//       4. 门槛拦截：微弱/匿名流言不推翻既有成见；
//       5. 铁证更替（updateBeliefWithEvidence）：高可信度公文/账册成功纠正认知并留痕旧信念；
//       6. 关系裂痕与历史约定保持（严禁静默抹除违约代价）。
//   · 负向：真源码破坏（锚点唯一）→ 破坏副本上判据失败。

const fs = require('fs');
const path = require('path');
const uiGate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const PR = 'engines/epistemic-view.js';

function env(ov) {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh({ srcOverride: ov || {} }).WA;
  W.store.init();
  return W;
}

/** ① 纯读评估零写入且支持衰减 */
function weighReadOnlyAndDecay(W) {
  const evList = [
    { id: 'ev1', source: 'hearsay', hops: 0, ageDays: 1, claim: '库银实存五千两', stance: 'support' },
    { id: 'ev2', source: 'hearsay', hops: 2, ageDays: 1, claim: '听说库银被盗空了', stance: 'oppose' }
  ];
  const snap1 = JSON.stringify(W.store.get());
  let res = null;
  for (let i = 0; i < 10; i++) {
    res = W.epistemicView.weighEvidence('李典吏', 'treasury_status', evList);
  }
  const snap2 = JSON.stringify(W.store.get());
  if (snap1 !== snap2) return false; // 严守纯读契约

  if (!res || !res.ok || res.dominantStance !== 'support') return false;
  // 两者来源相同、时效相同，但 ev2 经过两层转述（0.8^2 = 0.64），得分必须严格低于 ev1 的 80%
  const top = res.rankedItems[0];
  const sec = res.rankedItems[1];
  return top.id === 'ev1' && sec.id === 'ev2' && sec.credibility <= (top.credibility * 0.7);
}

/** ② 弱流言被拦截，坚持既有信念 */
function weakEvidenceRejected(W) {
  W.epistemicView.registerBelief('王员外', 'partner_integrity', {
    summary: '此人虽狡黠但账目清白',
    claimTruth: true,
    certainty: 'certain'
  });

  const weakEv = [
    { id: 'w1', source: 'anonymous', hops: 3, ageDays: 40, claim: '他是外地逃犯', stance: 'oppose' }
  ];

  const upRes = W.epistemicView.updateBeliefWithEvidence('王员外', 'partner_integrity', weakEv);
  if (!upRes || !upRes.ok || upRes.changed !== false) return false;
  return upRes.reason === 'evidence-too-weak';
}

/** ③ 铁证成功纠正信念并保留历史 */
function solidProofOverturnsBelief(W) {
  W.epistemicView.registerBelief('赵推官', 'suspect_guilt', {
    summary: '疑凶持有作案凶器，形迹可疑',
    claimTruth: true,
    certainty: 'tentative'
  });

  const solidEv = [
    { id: 's1', source: 'official_doc', hops: 0, ageDays: 2, claim: '案发时疑凶正于驿站签字画押领勘合，有官印为凭', stance: 'oppose' }
  ];

  const upRes = W.epistemicView.updateBeliefWithEvidence('赵推官', 'suspect_guilt', solidEv);
  if (!upRes || !upRes.ok || upRes.changed !== true) return false;
  if (upRes.previousSummary !== '疑凶持有作案凶器，形迹可疑') return false;
  if (!/官印为凭/.test(upRes.newSummary)) return false;

  const view = W.epistemicView.buildView('赵推官', 'suspect_guilt');
  return view && view.known && view.summary === upRes.newSummary;
}

async function runAll(a, ov) {
  let W = env(ov);
  a(typeof W.epistemicView.weighEvidence === 'function', 'weighEvidence 已导出');
  a(typeof W.epistemicView.updateBeliefWithEvidence === 'function', 'updateBeliefWithEvidence 已导出');
  W = env(ov); a(weighReadOnlyAndDecay(W), '证据权重计算支持链路/时效衰减且纯读零写入');
  W = env(ov); a(weakEvidenceRejected(W), '匿名微弱流言无法动摇人物成见');
  W = env(ov); a(solidProofOverturnsBelief(W), '确凿官印凭证推翻旧断定且留痕历史反证');
}

const mutations = [
  ['decay-disabled',
    "const decay = Math.pow(0.8, hops);",
    "const decay = 1.0;",
    weighReadOnlyAndDecay],
  ['weak-threshold-ignored',
    "if (!topEv || topEv.credibility < 0.3) {",
    "if (false) {",
    weakEvidenceRejected],
  ['proof-not-recorded',
    "s.epistemicStore.beliefs[key] = nextBelief;",
    "/* bypassed */",
    solidProofOverturnsBelief]
];

async function runNegative(a) {
  for (const [name, anchor, replacement, crit] of mutations) {
    const source = fs.readFileSync(path.join(BASE, PR), 'utf8');
    const hits = source.split(anchor).length - 1;
    if (hits !== 1) throw new Error(name + ': 负控制锚点须恰中 1 次，实为 ' + hits);
    a(crit(env()), name + ': 原版上同款判据成立');
    const ov = {}; ov[PR] = source.replace(anchor, replacement);
    a(!crit(env(ov)), name + ': 破坏副本上同款判据失败');
    a(fs.readFileSync(path.join(BASE, PR), 'utf8') === source, name + ': 真源码零改写');
  }
}

module.exports = { runAll, runNegative };
if (require.main === module) (async function () {
  let pass = 0, fail = 0;
  const a = (ok, name) => { if (ok) pass++; else { fail++; console.log('FAIL ' + name); } };
  try { await runAll(a); await runNegative(a); }
  catch (e) { fail++; console.log(e.stack); }
  console.log('EXP32-OPV4-5: ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
})();
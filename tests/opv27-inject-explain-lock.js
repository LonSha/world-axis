/**
 * WorldAxis tests/opv27-inject-explain-lock.js (v2.523.0)
 * OPV27-4 专锁：注入被裁清单的「可替代性档位」与「一句话解释」
 *
 * ── 本锁钉的是什么 ────────────────────────────────────────────────────
 *   R4 的现场事实是「预算裁决只打一行 `注入 500/2400t`」：玩家问「这轮关系块为什么没进来」，
 *   账上只有 `no_budget` 三个字母。本版给每条被裁项贴**可替代性档位**（unique / redundant /
 *   optional）与 `savedTokens`，并给出 `explain()` 的人话。三条硬要求：
 *     ① 档位只用**本轮已落地**的事实推，不重新裁决、不改裁决结果；
 *     ② 「冗余」必须排除**自己**（一条被折叠保住的项不能因为「它自己还在」就自称冗余）；
 *     ③ 查无此源时如实说「本轮没有这个源」，**不许编一个被裁理由**。
 *
 * ── 真源码负控制 ──────────────────────────────────────────────────────
 *   把「排除自己」那一行去掉 ⇒ 折叠项当场自称 redundant（判据现形）。
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('./mock.js');
const sync = require('./ui-gate-sync.js');

let passed = 0;
function ok(cond, label) { assert.ok(cond, label); passed += 1; console.log('  \u2713 ' + label); }
function eq(actual, want, label) {
  assert.strictEqual(actual, want, label + '（实 ' + actual + ' / 期 ' + want + '）');
  passed += 1; console.log('  \u2713 ' + label);
}
function rd(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

const { WA } = sync.fresh({});
const ib = WA.injectBudget;

console.log('\n【OPV27-4】被裁清单的档位与解释');
ok(!!ib && typeof ib.explain === 'function', 'injectBudget.explain 已导出');
ok(typeof ib.plan === 'function', 'injectBudget.plan 仍在');

// ── 1. 计划本身：档位与省下的额度 ──────────────────────────────────────
{
  const items = [
    { source: '世界状态', content: '乙'.repeat(200) },
    { source: '没有这个科目', content: '丙'.repeat(200) }
  ];
  const p = ib.plan(items, { budget: 60 });
  eq(p.dropped.length, 1, '预算 60t 下恰好丢 1 项');
  const d = p.dropped[0];
  eq(d.source, '没有这个科目', '被丢的是低优先级那项');
  ok(typeof d.tier === 'string', '被裁项带 tier 档位');
  eq(d.tier, 'optional', '未归类源档位如实为 optional（说不清可替代性）');
  eq(d.savedTokens, d.tokens, 'savedTokens = 该项原本体量');
  eq(p.droppedTokens, d.tokens, 'plan 汇总 droppedTokens 与逐项一致');
  ok(p.kept.length >= 1, '至少有一项落地（否则本用例无意义）');

  // 纯观测：档位不改变裁决结果（把 tier 相关字段抹掉后重算，kept/dropped/used 必须逐字相同）
  const strip = JSON.stringify({ k: p.kept, f: p.folded, d: p.dropped.map(x => ({ s: x.source, r: x.reason, t: x.tokens })), u: p.used });
  const p2 = ib.plan(items, { budget: 60 });
  const strip2 = JSON.stringify({ k: p2.kept, f: p2.folded, d: p2.dropped.map(x => ({ s: x.source, r: x.reason, t: x.tokens })), u: p2.used });
  eq(strip, strip2, '同输入两次裁决逐字相同（档位是纯观测，不影响结果）');
}

// ── 2. explain：四种结果各说人话 ───────────────────────────────────────
{
  const items = [
    { source: '世界状态', content: '乙'.repeat(200) },
    { source: '关系块', content: '甲'.repeat(200) }
  ];
  const p = ib.plan(items, { budget: 60 });
  const keptSrc = p.kept[0].source;
  const exKept = ib.explain(p, keptSrc);
  ok(exKept.ok, '落地的源 explain 返回 ok');
  ok(exKept.text.indexOf('进了正文') > 0, '落地项说「进了正文」（实 ' + exKept.text + '）');

  const foldedArr = p.folded || [];
  if (foldedArr.length) {
    const fx = ib.explain(p, foldedArr[0].source);
    ok(fx.text.indexOf('被折叠') >= 0, '折叠项说清「被折叠」');
    ok(fx.text.indexOf('省 ') >= 0, '折叠项说清省了多少 token');
  } else {
    ok(true, '本轮无折叠项（跳过折叠话术断言）');
    ok(true, '（同上）');
  }

  const droppedArr = p.dropped || [];
  if (droppedArr.length) {
    const dx = ib.explain(p, droppedArr[0].source);
    eq(dx.ok, true, '被裁项 explain 返回 ok');
    ok(dx.text.indexOf('没进正文') > 0, '被裁项说清「没进正文」');
    ok(dx.text.indexOf('原本 ') > 0, '说清它原本多大');
    ok(dx.text.indexOf('裁决时余量') > 0, '说清裁决当时的余量（事后推不出来的事实）');
    ok(dx.hits[0].tier === droppedArr[0].tier, 'hits 里带档位');
  } else {
    ok(true, '本轮无被裁项（跳过）');
    ok(true, '（同上）');
    ok(true, '（同上）');
    ok(true, '（同上）');
  }

  const absent = ib.explain(p, '根本没有的源');
  eq(absent.ok, false, '查无此源 ok:false');
  ok(absent.text.indexOf('没有「根本没有的源」这个源') > 0, '查无此源如实报「本轮没有这个源」');
  ok(absent.text.indexOf('额度') < 0, '**不编**「额度不够」这种被裁理由');
}

// ── 3. 冗余档位必须排除自己 ────────────────────────────────────────────
{
  // 只放一个源，且它被折叠保住：这时「同一科还有谁在说」的答案是「没有」
  //   ⇒ 档位必须是 unique（或 optional），**不能**因为「它自己在正文里」就自称 redundant。
  const only = [{ source: '记忆', content: '甲'.repeat(400) }];
  const p = ib.plan(only, { budget: 80 });
  const self = (p.folded || [])[0] || null;
  if (self) {
    ok(self.tier !== 'redundant', '唯一源被折叠时档位不是 redundant（实 ' + self.tier + '）');
  } else {
    ok(true, '该输入未被折叠（跳过排除自己的断言）');
  }
  // 双源同科目：一条落地、另一条被折/丢 ⇒ 后者的冗余档位才有依据
  //   注意「关系块 / 世界状态」这类名在 PRIORITY/ACCOUNTS 里**未必有科目**（那是注入侧的用户可见名），
  //   故这里用**已在 ACCOUNTS 里登记过科目**的源名（否则测的其实还是 optional）。
  const two = [{ source: '记忆', content: '甲'.repeat(200) }, { source: '记忆', content: '乙'.repeat(200) }];
  const p2 = ib.plan(two, { budget: 60 });
  const others = (p2.folded || []).concat(p2.dropped || []);
  if (others.length) {
    ok(others.some(x => x.tier === 'redundant'), '同科目有第二个源落地时，另一条可判 redundant');
  } else {
    ok(true, '两条都落地（跳过）');
  }
}

// ── 4. 接线面：planInfo 与诊断节真消费 ─────────────────────────────────
{
  const inj = rd('render/inject.js');
  ok(inj.indexOf('tier: x.tier || null') > 0, 'render/inject.js 把 tier 写进 planInfo.dropped');
  ok(inj.indexOf('droppedTokens: planInfo.droppedTokens') > 0, 'planInfo 带 droppedTokens 汇总');
  const diag = rd('engines/tool-diag.js');
  ok(diag.indexOf('WA.injectBudget.explain(') > 0, 'tool-diag 真调 explain（否则导出了没人读）');
  ok(diag.indexOf('droppedForced') > 0, '诊断节给出「同科目只有它」的强制被裁清单');
}

// ── 5. 负控制：拆掉「排除自己」⇒ 折叠项自称冗余 ────────────────────────
{
  const src = rd('engines/inject-budget.js');
  const broken = src.replace(
    'const others = (landedAccounts[acc] || 0) - (selfLanded[row.id] ? 1 : 0);',
    'const others = (landedAccounts[acc] || 0);');
  ok(broken !== src, '负控制锚点真命中（排除自己的那一行被替换）');

  const b = sync.fresh({ srcOverride: { 'engines/inject-budget.js': broken } });
  const p = b.WA.injectBudget.plan([{ source: '记忆', content: '甲'.repeat(400) }], { budget: 80 });
  const self = (p.folded || [])[0] || null;
  ok(!!self, '破坏版仍会折叠（否则负控制无对照）');
  eq(self.tier, 'redundant', '拆掉「排除自己」⇒ 唯一源被折叠却自称 redundant（判据现形）');
}

console.log('\n=== OPV27-4 专锁全绿：' + passed + ' 项断言 ===');
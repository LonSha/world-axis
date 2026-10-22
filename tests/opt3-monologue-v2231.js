#!/usr/bin/env node
// WorldAxis tests/opt3-monologue-v2231.js (v2.231.0) -- OPT-3 专锁：NPC 推演按需调用 + 允许不行动
//
// 【它治什么（现场实测）】
//   OPT-3 原文要的是「按在场/相关目标/已知变化挑人」「未变化的人复用仍有效结果」
//   「合法结果包含等待、拒绝、维持现状」。开工前逐条复核现场，两处都是真的：
//     1 **提示词与产品意图相反**：ROLEPLAY_SYS 写着「使当前局面的性质发生明显变化」
//       「禁止『静观其变』类废戏」——而 `engines/act.js` 一直支持拒绝/延迟/维持现状。
//       于是所有人被改写成「每轮必须变卦」，谨慎者与急迫者在注入层长得一模一样。判据 A4/A5。
//     2 **挑人只看名单**：每轮把 `registry.list()` 全量交给预筛模型，安静交谈也要
//       为所有离场 NPC 各发一次请求；「复用」在代码里没有任何实现。判据 B3/B4/B7/B8。
//
// 【九条口径（逐条有判据咬）】
//   · 先本地收窄再调模型（B3/B5）；无人需要 ⇒ 零请求零注入（B4）。
//   · 缓存按档案指纹复用，复用轮次受 reuseTtl 限制（B7/B8/B9）；档案一变即失效（B10）。
//   · 关闭即零请求（B11）；通道未配置零开销放行（B12）。
//   · 并发数按设置分批（B13）；通道按设置走 observe（B16）。
//   · 观望者打 hold 标（B14/B15）——下游据此知道「这人本轮不动」。
//   · 旧 JSON 形态独白仍可解析（B19）；force 可显式全量（B20）。
//
// 四段结构：A 静态契约 / B 运行时行为 / C 卫生与副作用 / N 真源码破坏 + 两向自证。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const MO_REL = 'actors/monologue.js';
const SELF_REL = 'tests/opt3-monologue-v2231.js';
function rd(rel, ov) {
  if (ov && ov[rel] !== undefined) return ov[rel];
  return fs.readFileSync(path.join(BASE, rel), 'utf8');
}
function cnt(s, n) { return s.split(n).length - 1; }

// -- 破坏锚点（各恰 1 次，A6 逐键核）--
const ANCHOR = {
  moPrompt: { rel: MO_REL, txt: '合法的结果包含行动，也包含等待、拒绝与维持现状' },
  moNarrow: { rel: MO_REL, txt: "if (!m && !mentioned && !opts.force) { skipped.push({ name: nm, why: 'no-mention' }); return; }" },
  moReuse: { rel: MO_REL, txt: "if (fresh && st.reuseSame && !mentioned && (m.uses || 0) < st.reuseTtl) {" },
  moEnabled: { rel: MO_REL, txt: "if (!st.enabled) return; // ⑦ 关闭：零请求、零注入" },
  moHold: { rel: MO_REL, txt: "const holds = lines.filter(l => l.stance === 'hold').map(l => l.character);" },
  moChunk: { rel: MO_REL, txt: "const batches = chunk(picked, st.maxParallel); // ⑥ 并发数按设置" }
};
const EXPORTS = ['getSettings', 'setSettings', 'plan', 'stat', 'resetStat',
  'resetMemo', 'prescreen', 'roleplayOne'];

function envWith(ov) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh(ov ? { srcOverride: ov } : {});
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  return env;
}
function ctx() { return global.SillyTavern.getContext(); }
function setChat(texts) {
  const c = ctx(); c.chat.length = 0;
  (texts || []).forEach(function (t) { c.chat.push({ is_user: false, name: '旁白', mes: t, swipe_id: 0 }); });
  return c.chat.length;
}
function node(W) { return W.workflow.list('before').filter(function (n) { return n.id === 'actors.monologue'; })[0]; }
async function runNode(W) { const n = node(W); const cx = { injections: [] }; await n.run(cx); return cx; }

// 可控的 API 桩：只替换 call/getChannel 两个出口，其余 apiRouter 契约保持不变。
function mockApi(W, o) {
  o = o || {};
  const st = { calls: [], pre: 0, rp: 0, inflight: 0, peak: 0, channels: [] };
  W.apiRouter.getChannel = function () {
    if (o.noChannel) return { baseUrl: '', model: '' };
    return { baseUrl: 'http://mock', model: 'm', apiKey: 'k', temperature: 0.7, maxTokens: 800 };
  };
  W.apiRouter.call = async function (channel, messages) {
    st.calls.push(channel); st.channels.push(channel);
    const sys = (messages && messages[0] && messages[0].content) || '';
    if (/角色预筛/.test(sys)) {
      st.pre++;
      const body = String((messages[1] && messages[1].content) || '');
      const block = (body.split('<Registered_Characters>\n')[1] || '').split('\n')[0];
      const names = block.split('、').filter(Boolean);
      const pick = o.pick ? names.filter(function (n) { return o.pick.indexOf(n) >= 0; }) : names;
      return { characters: pick.slice(0, 6) };
    }
    st.rp++; st.inflight++; st.peak = Math.max(st.peak, st.inflight);
    await new Promise(function (r) { setTimeout(r, o.delay || 3); });
    st.inflight--;
    const nm = String(((messages[1].content.match(/角色名：(.*)$/m) || [])[1] || '?')).trim();
    if (o.json) return JSON.stringify({ monologue: '【' + nm + '】我不急着出手，再看看。' });
    return (o.texts && o.texts[nm]) || '我站在门边没动，先看他要说什么。';
  };
  return st;
}

async function runAll(a, ov) {
  ov = ov || {};
  const S = rd(MO_REL, ov);
  /* ============ A 静态契约 ============ */
  a(fs.existsSync(path.join(BASE, MO_REL)), 'A1: 模块落在仓库里');
  a(rd('tests/run.js', ov).indexOf("'actors/monologue.js'") > 0, 'A2: tests/run.js LOAD 已挂（否则整套回归根本不装它）');
  a(rd('engines/tool-diag.js', ov).indexOf("'actors/monologue.js': 'monologue'") > 0,
    'A3: tool-diag 声明表已登记（漏登记 ⇒ 诊断面上该模块不存在）');
  const rpLine = S.split('\n').filter(function (l) { return l.indexOf('const ROLEPLAY_SYS') === 0; })[0] || '';
  a(rpLine.indexOf('禁止「静观其变」') < 0 && rpLine.indexOf('发生明显变化') < 0,
    'A4: ROLEPLAY_SYS 那一行不再要求「必须改变局面 / 禁止静观其变」（头注里的病灶描述不算）');
  a(S.indexOf('等待、拒绝与维持现状') > 0 && S.indexOf('不要为了「有戏」强行变卦') > 0,
    'A5: 提示词显式允许等待/拒绝/维持现状，并点明不为了有戏而变卦');
  const badA = Object.keys(ANCHOR).filter(function (k) { return cnt(rd(ANCHOR[k].rel, ov), ANCHOR[k].txt) !== 1; });
  a(badA.length === 0, 'A6: 破坏锚点在目标文件里各恰 1 次（不合：' + badA.join(',') + '）');
  await (function () {
    const self = rd(SELF_REL, ov);
    const table = self.slice(self.indexOf('const ANCHOR = {'), self.indexOf('\n};', self.indexOf('const ANCHOR = {')));
    const bad = Object.keys(ANCHOR).filter(function (k) { return cnt(table, k + ': {') !== 1; });
    a(bad.length === 0, 'A7: 锚点逐键在锚表里声明恰 1 处（缺 ' + bad.join(',') + '）');
  })();
  await (function () {
    const e0 = envWith(ov); const miss = EXPORTS.filter(function (k) { return e0.WA.monologue[k] === undefined; });
    a(miss.length === 0, 'A8: 导出面齐备（缺 ' + (miss.join(',') || '无') + '）');
  })();

  /* ============ B 运行时行为 ============ */
  // B1 默认设置
  await (function () {
    const W = envWith(ov).WA;
    const st = W.monologue.getSettings();
    a(st.enabled === true && st.maxParallel === 6 && st.reuseTtl === 2 && st.useObserve === false,
      'B1: 默认设置（enabled/maxParallel6/reuseTtl2/useObserve false，实 ' + JSON.stringify(st) + '）');
  })();
  // B2 越界夹回
  await (function () {
    const W = envWith(ov).WA;
    W.monologue.setSettings({ maxParallel: 99 });
    a(W.monologue.getSettings().maxParallel === 8, 'B2: 越界设置被 bounds 夹回上限（99 → ' + W.monologue.getSettings().maxParallel + '）');
  })();
  // B3/B4 静场：谁都没被提到 ⇒ 既不进预筛也不推演
  await (function () {
    const W = envWith(ov).WA;
    const api = mockApi(W);
    W.registry.register('甲');
    W.registry.register('乙');
    setChat(['天色暗下来了。']);
    const pl = W.monologue.plan(W.registry.list());
    a(pl.need.length === 0 && pl.skipped.length === 2 && pl.skipped[0].why === 'no-mention',
      'B3: 无人被提到 ⇒ need 0 / skipped 2（no-mention，实 ' + pl.need.length + '/' + pl.skipped.length + '）');
    return runNode(W).then(function (cx) {
      a(api.calls.length === 0 && cx.injections.length === 0,
        'B4: 静场一轮零 API 调用、零注入（旧形态会为每个注册 NPC 各发一次请求，实 ' + api.calls.length + '）');
    });
  })();
  // B5/B6 提到一人 ⇒ 只有他进 need，且只推演他
  const e5 = envWith(ov); const W5 = e5.WA; const api5 = mockApi(W5);
  W5.registry.register('甲'); W5.registry.register('乙');
  setChat(['甲推门进来，说镇北出了事。']);
  await (function () {
    const pl = W5.monologue.plan(W5.registry.list());
    a(pl.need.length === 1 && pl.need[0] === '甲' && pl.skipped.length === 1 && pl.skipped[0].name === '乙',
      'B5: 只把被点名的人送进预筛（need=' + pl.need.join(',') + ' / skipped=' + pl.skipped.map(function (x) { return x.name; }).join(',') + '）');
  })();
  const cx5 = await runNode(W5);
  await (function () {
    a(api5.pre === 1 && api5.rp === 1, 'B6: 一轮只 1 次预筛 + 1 次独白（实 pre=' + api5.pre + ' rp=' + api5.rp + '）');
    a(cx5.injections.length === 1 && /NPC独白（1人/.test(cx5.injections[0].source),
      'B6b: 注入恰好一条且注明人数（源=' + (cx5.injections[0] && cx5.injections[0].source) + '）');
    a(cx5.injections[0].content.indexOf('<npc_inner_voices') === 0, 'B6c: 注入块是可解析的独立标签块');
  })();
  // B7/B8 复用：换个不相干的消息，甲没被提到且档案没动 ⇒ 复用上一轮独白，不再请求
  await (function () {
    setChat(['屋里只剩灯芯噼啪响。']);
    const pl = W5.monologue.plan(W5.registry.list());
    a(pl.reuse.length === 1 && pl.reuse[0].character === '甲' && pl.need.length === 0,
      'B7: 未点名 + 档案未变 ⇒ 复用（reuse=' + pl.reuse.map(function (x) { return x.character; }).join(',') + ' / need=' + pl.need.length + '）');
    return runNode(W5).then(function (cx) {
      a(api5.rp === 1 && /复用1/.test(cx.injections[0].source),
        'B8: 复用轮零新增独白请求、注入源注明复用（rp=' + api5.rp + ' / 源=' + cx.injections[0].source + '）');
    });
  })();
  // B9 复用轮次受 reuseTtl 限制（不无限复读同一句话）
  await (function () {
    W5.monologue.resetMemo();
    // 先手工把甲塞回缓存（模拟上一轮真推演过）
    return W5.monologue.roleplayOne('甲', new AbortController().signal).then(function () {
      setChat(['灯芯又爆了一下。']);
      const p1 = W5.monologue.plan(['甲']);   // uses 0 -> 1
      const p2 = W5.monologue.plan(['甲']);   // uses 1 -> 2
      const p3 = W5.monologue.plan(['甲']);   // uses 2 == ttl -> need
      a(p1.reuse.length === 1 && p2.reuse.length === 1 && p3.need.length === 1,
        'B9: reuseTtl=2 时前两轮复用、第三轮重推（' + p1.reuse.length + '/' + p2.reuse.length + '/' + p3.need.length + '）');
    });
  })();
  // B10 档案一变，缓存立即失效
  await (function () {
    const W = envWith(ov).WA; const api = mockApi(W);
    W.registry.register('丙');
    setChat(['丙在院里喂马。']);
    return W.monologue.roleplayOne('丙', new AbortController().signal).then(function () {
      setChat(['院里安静下来。']);
      const before = W.monologue.plan(['丙']);
      W.registry.setProfileSafe('丙', { personality: ['多疑', '记仇'] });
      const after = W.monologue.plan(['丙']);
      a(before.reuse.length === 1 && after.need.length === 1,
        'B10: 档案没动则复用、档案一改立刻重推（' + before.reuse.length + '→' + after.need.length + '）');
      void api;
    });
  })();
  // B11 关闭 ⇒ 零请求零注入
  await (function () {
    const W = envWith(ov).WA; const api = mockApi(W);
    W.registry.register('丁');
    setChat(['丁走进来。']);
    W.monologue.setSettings({ enabled: false });
    return runNode(W).then(function (cx) {
      a(api.calls.length === 0 && cx.injections.length === 0,
        'B11: 关闭后零请求零注入（实 ' + api.calls.length + ' 次调用）');
    });
  })();
  // B12 通道未配置 ⇒ 零开销放行
  await (function () {
    const W = envWith(ov).WA; const api = mockApi(W, { noChannel: true });
    W.registry.register('戊');
    setChat(['戊来了。']);
    return runNode(W).then(function (cx) {
      a(api.calls.length === 0 && cx.injections.length === 0, 'B12: 通道未配置 ⇒ 零请求零注入');
    });
  })();
  // B13 并发数按设置分批
  await (function () {
    const W = envWith(ov).WA; const api = mockApi(W, { delay: 6 });
    ['甲', '乙', '丙'].forEach(function (n) { W.registry.register(n); });
    setChat(['甲乙丙三人都在场。']);
    W.monologue.setSettings({ maxParallel: 1 });
    return runNode(W).then(function () {
      a(api.peak === 1 && api.rp === 3,
        'B13: maxParallel=1 时并发峰值为 1 且三人全部推演（peak=' + api.peak + ' rp=' + api.rp + '）');
    });
  })();
  // B14/B15 观望打标
  await (function () {
    const W = envWith(ov).WA; const api = mockApi(W, { texts: { '甲': '我按住刀柄，暂且观望，先看他怎么走。', '乙': '我拔刀就冲上去。' } });
    W.registry.register('甲'); W.registry.register('乙');
    setChat(['甲乙对峙。']);
    // 走真实路径：stance 由 roleplayOne 返回，不是直接调内部判定函数（导出面已收窄）。
    return W.monologue.roleplayOne('甲', new AbortController().signal).then(function (rA) {
      return W.monologue.roleplayOne('乙', new AbortController().signal).then(function (rB) {
        a(rA && rA.stance === 'hold' && rB && rB.stance === 'act',
          'B14: 观望者标 hold、出手者标 act（实 ' + (rA && rA.stance) + '/' + (rB && rB.stance) + '）');
      });
    }).then(function () {
      return runNode(W).then(function (cx) {
      const c = cx.injections[0].content;
      a(c.indexOf('hold="甲"') > 0 && c.indexOf('【甲·内心｜观望】') > 0 && c.indexOf('【乙·内心】我拔刀') > 0,
        'B15: 观望者在注入块里被单独标出（hold 属性 + ｜观望），行动者不标');
      void api;
      });
    });
  })();
  // B16 useObserve 走 observe 通道
  await (function () {
    const W = envWith(ov).WA; const api = mockApi(W);
    W.registry.register('己');
    setChat(['己推门进来。']);
    W.monologue.setSettings({ useObserve: true });
    return runNode(W).then(function () {
      // 预筛固定在 inference（挑人只要名单与最近消息，不涉及人格扮演）；受设置影响的是**独白**。
      a(api.channels.filter(function (c) { return c === 'observe'; }).length === api.rp && api.rp === 1,
        'B16: useObserve 时独白走 observe 通道（预筛仍 inference，实 ' + api.channels.join('/') + '）');
    });
  })();
  // B17 读数与重置
  await (function () {
    const W = envWith(ov).WA; const api = mockApi(W);
    W.registry.register('庚');
    setChat(['庚喊了一嗓子。']);
    return runNode(W).then(function () {
      const st = W.monologue.stat();
      a(st.prescreenCalls === 1 && st.roleplayCalls === 1 && st.injectedRounds === 1 && st.memo === 1,
        'B17: 读数如实记录（pre=' + st.prescreenCalls + ' rp=' + st.roleplayCalls + ' 轮=' + st.injectedRounds + ' memo=' + st.memo + '）');
      const r = W.monologue.resetStat();
      const st2 = W.monologue.stat();
      a(r.ok === true && st2.prescreenCalls === 0 && st2.memo === 1,
        'B17b: resetStat 只清读数、不清缓存（memo 仍 ' + st2.memo + '）');
      void api;
    });
  })();
  // B18 resetMemo 后不再复用
  await (function () {
    const W = envWith(ov).WA; mockApi(W);
    W.registry.register('辛');
    setChat(['辛在旁边。']);
    return W.monologue.roleplayOne('辛', new AbortController().signal).then(function () {
      setChat(['火苗矮下去。']);
      const before = W.monologue.plan(['辛']);
      const dropped = W.monologue.resetMemo();
      const after = W.monologue.plan(['辛'], { force: true });
      a(before.reuse.length === 1 && dropped.dropped === 1 && after.need.length === 1,
        'B18: resetMemo 清掉 ' + dropped.dropped + ' 条缓存后不再复用（need=' + after.need.length + '）');
    });
  })();
  // B19 旧 JSON 形态仍可解析
  await (function () {
    const W = envWith(ov).WA; mockApi(W, { json: true });
    W.registry.register('壬');
    setChat(['壬抬头。']);
    return W.monologue.roleplayOne('壬', new AbortController().signal).then(function (r) {
      a(r && r.monologue.indexOf('【壬】') === 0 && r.monologue.indexOf('{') < 0,
        'B19: {"monologue":...} 旧形态仍被解析成纯文本（实 ' + (r && r.monologue.slice(0, 20)) + '）');
    });
  })();
  // B20 force 显式全量
  await (function () {
    const W = envWith(ov).WA; mockApi(W);
    W.registry.register('癸');
    setChat(['没有人提到他。']);
    const lazy = W.monologue.plan(['癸']);
    const forced = W.monologue.plan(['癸'], { force: true });
    a(lazy.need.length === 0 && lazy.skipped.length === 1 && forced.need.length === 1,
      'B20: 默认跳过未提及者，force 时显式纳入（' + lazy.skipped.length + '→' + forced.need.length + '）');
  })();

  /* ============ C 卫生与副作用 ============ */
  await (function () {
    const self = rd(SELF_REL, ov);
    const reqs = (self.match(/require\(['"]([^'"]+)['"]\)/g) || []).filter(function (x) { return x.indexOf('./') < 0 && x.indexOf('../') < 0; });
    a(reqs.length === 2, 'C1: 本锁只 require Node 内置（fs/path），零第三方（实 ' + reqs.length + '）');
  })();
  await (function () {
    const W = envWith(ov).WA; mockApi(W);
    W.registry.register('子');
    setChat(['子咳嗽了一声。']);
    const before = JSON.stringify(W.store.get());
    return runNode(W).then(function () {
      a(JSON.stringify(W.store.get()) === before, 'C2: 一轮推演不动世界状态（独白只进注入面，不写 store）');
    });
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
  S = S || rd(MO_REL);
  await (function () {
    const self = rd(SELF_REL);
    const esc = function (t) { return t.replace(/\n/g, '\\n'); };
    const bad = Object.keys(ANCHOR).filter(function (k) { return cnt(self, esc(ANCHOR[k].txt)) !== 1; });
    a(bad.length === 0, 'N0: 锚点字面量在本文件恰 1 次（不合 ' + bad.join(',') + '）');
  })();

  // N1 破坏：提示词回填旧口径 ⇒ A4/A5 必须红
  await (function () {
    const S1 = brk(S, ANCHOR.moPrompt.txt, '行动必须能改变剧情状态，禁止「静观其变」类废戏');
    const ov = {}; ov[MO_REL] = S1;
    const broken = rd(MO_REL, ov);
    a(broken.indexOf('禁止「静观其变」') > 0 && broken.indexOf('等待、拒绝与维持现状') < 0,
      'N1: 破坏版上提示词回到「必须改变局面」（原版两条都反过来 ⇒ A4/A5 的两向自证）');
  })();

  // N2 破坏：拆掉本地收窄 ⇒ 静场也对全体各发请求
  await (function () {
    const S2 = brk(S, ANCHOR.moNarrow.txt, 'void 0;');
    const ov = {}; ov[MO_REL] = S2;
    const W = envWith(ov).WA; const api = mockApi(W);
    W.registry.register('甲'); W.registry.register('乙');
    setChat(['天色暗下来了。']);
    return runNode(W).then(function () {
      a(api.calls.length > 0,
        'N2: 破坏版上静场也发起请求（实 ' + api.calls.length + ' 次 ⇒ 原版零请求的两向自证）');
    });
  })();

  // N3 破坏：拆掉复用分支 ⇒ 每轮都重推
  await (function () {
    const S3 = brk(S, ANCHOR.moReuse.txt, 'if (false) {');
    const ov = {}; ov[MO_REL] = S3;
    const W = envWith(ov).WA; mockApi(W);
    W.registry.register('甲');
    setChat(['甲在旁边。']);
    return W.monologue.roleplayOne('甲', new AbortController().signal).then(function () {
      setChat(['火苗矮下去。']);
      const pl = W.monologue.plan(['甲']);
      a(pl.reuse.length === 0 && pl.need.length === 1,
        'N3: 破坏版上缓存永不复用（reuse=0 / need=1 ⇒ 原版复用 1 的两向自证）');
    });
  })();

  // N4 破坏：拆掉开关 ⇒ 关闭也照样请求
  await (function () {
    const S4 = brk(S, ANCHOR.moEnabled.txt, 'void 0;');
    const ov = {}; ov[MO_REL] = S4;
    const W = envWith(ov).WA; const api = mockApi(W);
    W.registry.register('丁');
    setChat(['丁走进来。']);
    W.monologue.setSettings({ enabled: false });
    return runNode(W).then(function () {
      a(api.calls.length > 0, 'N4: 破坏版上关闭后仍发起请求（实 ' + api.calls.length + ' 次 ⇒ 原版零请求的两向自证）');
    });
  })();

  // N5 破坏：拆掉观望打标 ⇒ 注入块分不出「等」与「出手」
  await (function () {
    const S5 = brk(S, ANCHOR.moHold.txt, 'const holds = [];');
    const ov = {}; ov[MO_REL] = S5;
    const W = envWith(ov).WA; mockApi(W, { texts: { '甲': '我按住刀柄，暂且观望，先看他怎么走。' } });
    W.registry.register('甲');
    setChat(['甲在场。']);
    return runNode(W).then(function (cx) {
      const c = cx.injections[0].content;
      a(c.indexOf('hold="') < 0 && c.indexOf('【甲·内心｜观望】') > 0,
        'N5: 破坏版上 hold 属性丢失（原版 holds 属性在 ⇒ 两向自证；行内标记不受影响，说明两个标记各管一段）');
    });
  })();

  // N6 破坏：拆掉分批 ⇒ 并发数不再受设置约束
  await (function () {
    const S6 = brk(S, ANCHOR.moChunk.txt, 'const batches = [picked];');
    const ov = {}; ov[MO_REL] = S6;
    const W = envWith(ov).WA; const api = mockApi(W, { delay: 6 });
    ['甲', '乙', '丙'].forEach(function (n) { W.registry.register(n); });
    setChat(['甲乙丙三人都在场。']);
    W.monologue.setSettings({ maxParallel: 1 });
    return runNode(W).then(function () {
      a(api.peak > 1, 'N6: 破坏版上 maxParallel=1 仍并发 3（peak=' + api.peak + ' ⇒ 原版 peak=1 的两向自证）');
    });
  })();

  // N7 工具两向自证
  let threw = false;
  try { brk(S, 'THIS-DOES-NOT-EXIST-OPT3', 'x'); } catch (e) { threw = e.message === 'anchor hits=0'; }
  a(threw, 'N7: 锚点不存在必须抛（不静默 0 命中）');
  threw = false;
  try { brk(S, 'if (', 'x'); } catch (e) { threw = /anchor hits=\d+/.test(e.message) && e.message !== 'anchor hits=1'; }
  a(threw, 'N7b: 锚点不唯一必须抛');

  // N8 真源码逐字未变
  a(rd(MO_REL) === S, 'N8: 被破坏过的模块真源码逐字未变（破坏只发生在内存副本上）');
}

module.exports = { runAll: runAll, runNegative: runNegative, ANCHOR: ANCHOR };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name, extra) {
    if (ok) { pass++; } else { fail++; console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
  };
  (async function () {
    try { await runAll(a); } catch (e) { fail++; console.log('  \u2717 判据失效：' + (e && e.stack)); }
    try { await runNegative(a); } catch (e) { fail++; console.log('  \u2717 负控制失效：' + (e && e.stack)); }
    console.log('\nOPT3-V2231: ' + pass + ' / 失败 ' + fail);
    if (fail) process.exitCode = 1;
  })();
}
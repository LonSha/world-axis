#!/usr/bin/env node
// WorldAxis tests/ensemble-v2138.js — 多模型并发推演与结果仲裁（E5）专锁
//
// 它治什么（与 engines/ensemble.js 头部同一件事）：
//   推演链路自 v0.1.x 起就是**单模型单次**：六条通道能各配不同模型，但没有任何一处回答
//   「两个模型对同一个世界给出不同解读时，谁说了算」。本锁钉四问：
//     ① 「关闭时零调用」——不是「发了但丢弃」（那会白花 token）；
//     ② 「分歧不自动合并」——只有 blend 且 confirm:true 才合并，缺确认必须把 N 份原文逐字带出；
//     ③ 「仲裁失败可见降级」——blend 失败回落 first 并带 fellback/fallbackReason，全失败如实 all-failed；
//     ④ 「只读」——源码面零 WA.store 写入口（本锁 N 面钉这条）。
//
// 两向取证（本仓纪律，不是自述）：
//   正向 —— 全部真 API 走一遍，含「同一模型答两遍不能伪装成两个模型一致」的去重算式自证；
//   逆向 —— 真源码破坏（锚点恰中 1 次）→ 装载破坏副本 → **在副本上重跑同款真判据**，
//          证明判据真的会因破坏而变红（H6：破坏可观测），且不得出现
//          「对原文件断言」「破坏写死成模拟常量」「破坏把判据自己删掉」三种假绿。
//
// H5 判据纯度：本文件内锚点字面量**只准在 ANCHORS 里声明一次**，
//   破坏与正控都引用 ANCHORS.x.txt，不在别处再写一遍。
'use strict';

/** 锚点表（单一真源；判据别处只引用，不再写字面量）。 */
const ANCHORS = {
  // ① 「默认关闭」：总开关 false（无宿主设置面时读的就是它）
  gate: { rel: 'engines/ensemble.js', txt: "enabled: false, strategy: 'first', maxModels: 3, blendChannel: 'judge', timeoutMs: 60000" },
  // ② 「关闭时零调用」：闸门在分发之前
  gateCall: { rel: 'engines/ensemble.js', txt: "if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }" },
  // ③ 通道名去重（同通道同模型只调一次）
  dedup: { rel: 'engines/ensemble.js', txt: "const k = m.channel + '@@' + (m.model || '(default)');" },
  // ④ 成员数上限（maxModels 硬约束，超出者点名不进本次调用）
  cap: { rel: 'engines/ensemble.js', txt: "const cap = Math.max(2, cfg.maxModels);" },
  // ⑤ 并列即冲突（含全不同）——**不许**按出现顺序抽一个当多数
  conflict: { rel: 'engines/ensemble.js', txt: "const conflict = !!top && (topN === second || (buckets.length === okRows.length && okRows.length > 1));" },
  // ⑥ 全失败如实报（不编一个答案）
  allFail: { rel: 'engines/ensemble.js', txt: "out.ok = false; out.reason = 'all-failed';" },
  // ⑦ blend 必须显式确认（缺确认 ⇒ need-confirm + N 份原文）
  confirm: { rel: 'engines/ensemble.js', txt: "if (o.confirm !== true) {" },
  // ⑧ 已一致不调合并（白花 token）
  blendCons: { rel: 'engines/ensemble.js', txt: "    if (ag.consistent) {" },
  // ⑨ 可见降级：回落 first 必须带理由
  fallback: { rel: 'engines/ensemble.js', txt: "out.fellback = true; out.fallbackReason = br.reason || 'blend-failed';" },
  // ⑩ 并发闸的单一真源：读 router（本模块不建第二套并发上限）
  conc: { rel: 'engines/ensemble.js', txt: "try { return Number(r.getConcurrency()) || 0; } catch (e) { return 0; }" },
  // ⑪ vote 命中：带票数与投票者名单
  votePick: { rel: 'engines/ensemble.js', txt: "out.chosen = ag.top.key; out.chosenBy = 'vote'; out.votes = ag.topN; out.voters = ag.top.channels.slice();" },
  // ⑫ 空消息拒收（复用扫描面既有码 bad-value）
  noMsg: { rel: 'engines/ensemble.js', txt: "if (!msgArr.length) { noteFault('bad-value'); return { ok: false, reason: 'bad-value' }; }" },
  // ⑬ 「只读」的源码级证据：这一行是边界 2 的声明，破坏它 ⇒ 该声明失真
  readOnly: { rel: 'engines/ensemble.js', txt: "本文件**零 `WA.store.transact` / 零 `WA.store.patch`**" },
  // ⑭ 规范化只拉平空白（不删标点、不小写化）
  norm: { rel: 'engines/ensemble.js', txt: "return String(text == null ? '' : text).replace(/\\s+/g, ' ').trim();" },
  // ⑮ 真并发（不是串行等回来）
  parallel: { rel: 'engines/ensemble.js', txt: "const members = await Promise.all(picked.map(function (m) { return callMember(m, msgArr, callOpts); }));" },
  // ⑯ 合并通道未配置 ⇒ 可见降级（理由 missing-key）
  blendUncfg: { rel: 'engines/ensemble.js', txt: "if (!gc || !gc.baseUrl || !gc.model) return { ok: false, reason: 'missing-key' };" },
  // ⑰ 通道名单空 ⇒ no-channel
  noChannel: { rel: 'engines/ensemble.js', txt: "if (!wanted.length) { noteFault('no-channel'); return { ok: false, reason: 'no-channel' }; }" },
  // ⑱ apiRouter 缺席 ⇒ 成员归因 module-absent（不是「跑了 0ms」）
  routerAbsent: { rel: 'engines/ensemble.js', txt: "row.error = 'apiRouter 不可用'; row.kind = 'module-absent'; row.ms = clockWall() - t0;" },
  // ⑲ 名单既能给字符串也能给 {channel,model}
  arrPick: { rel: 'engines/ensemble.js', txt: "const arr = Array.isArray(channels) ? channels : (channels ? [channels] : []);" },
  // ⑳ 合并回收空 ⇒ empty-response
  emptyResp: { rel: 'engines/ensemble.js', txt: "if (!norm) return { ok: false, reason: 'empty-response' };" }
};

async function runAll(a) {
  const assert = require('./lock-assert.js').from(a);
  const fs = require('fs');
  const vm = require('vm');
  const path = require('path');
  const BASE = path.join(__dirname, '..');
  const REL = ANCHORS.gate.rel;
  const ABS = path.join(BASE, REL);
  const src = fs.readFileSync(ABS, 'utf8');
  const srcBefore = fs.readFileSync(ABS, 'utf8');

  // ── H5 判据纯度：锚点字面量在本文件内只出现一次（在 ANCHORS 里） ──
  Object.keys(ANCHORS).forEach(function (k) {
    const t = ANCHORS[k].txt;
    const n = src.split(t).length - 1;
    assert.ok(n === 1, 'H5 锚点「' + k + '」在源文件内恰中 1 次（实 ' + n + '）');
  });
  assert.ok(src.indexOf('WorldAxis engines/ensemble.js') >= 0, '源文件头在场（装载面可信）');
  // 「只读」的**代码面**自证：剥掉注释后全文件不得出现任何 store 写入口
  const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  assert.ok(codeOnly.indexOf('WA.store') < 0, '只读（代码面）：全文件不出现 WA.store（注释里那句边界声明不算——判据看的是代码）');

  // ── 装载器：真源码 or 破坏副本（同一台装载机）──
  let T = 1000;             // 计数器时钟：每次读推进 7ms ⇒ 成员耗时非零且可分辨（worstMs 才有读数）
  function makeHost(o) {
    o = o || {};
    let cfg = { enabled: false, strategy: 'first', maxModels: 3, blendChannel: 'judge', timeoutMs: 60000 };
    const calls = o.calls || [];
    const WA = {
      clock: { wallNow() { T += 7; return T; } },
      store: {
        get() { return {}; },
        transact() { throw new Error('ENSEMBLE 不许写世界（只读）'); },
        patch() { throw new Error('ENSEMBLE 不许写世界（只读）'); }
      },
      registerModule() {}
    };
    if (!o.noBus) {
      WA.settingsBus = {
        read() { return cfg; },
        normalize(r, v) { return v; },
        saveOrThrow(r, v) { cfg = v; return { ok: true }; }
      };
    }
    if (!o.noRouter) {
      WA.apiRouter = {
        _c: 3,
        getConcurrency() { return this._c; },
        getChannel(n) {
          // 「unset*」= 未配置通道（宿主照实答「这条通道没配」——本仓 getChannel 的缺省语义）
          if (String(n).indexOf('unset') === 0) return null;
          return o.chan ? o.chan(n) : { baseUrl: 'http://x', model: 'm-' + n, apiKey: 'k' };
        },
        call(ch, msgs, opts) {
          calls.push({ ch: ch, msgs: msgs, opts: opts });
          return o.reply(ch, msgs, opts);
        }
      };
    }
    require('./synth-host.js').hostStub(WA);
    const win = { WorldAxis: WA };
    vm.runInNewContext(o.code || src, {
      window: win, Date: Date, Number: Number, String: String, Array: Array, Object: Object, isFinite: isFinite,
      Math: Math, JSON: JSON, Promise: Promise, Error: Error, RegExp: RegExp, console: console,
      parseInt: parseInt, parseFloat: parseFloat
    }, { filename: REL });
    return { WA: win.WorldAxis, api: win.WorldAxis.ensemble, calls: calls };
  }
  /** 破坏副本：锚点恰中 1 次才允许替换（H6 工具两向自证）。 */
  function wreck(key, to) {
    const t = ANCHORS[key].txt;
    const n = src.split(t).length - 1;
    if (n !== 1) throw new Error('wreck 锚点不唯一：' + key + ' 命中 ' + n);
    return src.replace(t, to);
  }
  // 默认应答：a/b → 甲，c → 乙，d → 丙，judge → 合并后，bad* → 抛 http
  function defReply(ch) {
    if (String(ch).indexOf('bad') === 0) { const e = new Error('boom'); e.kind = 'http'; return Promise.reject(e); }
    if (ch === 'judge') return Promise.resolve('合并后：ok');
    if (ch === 'a' || ch === 'b') return Promise.resolve('甲');
    if (ch === 'c') return Promise.resolve('乙');
    if (ch === 'd') return Promise.resolve('丙');
    if (ch === 'empty') return Promise.resolve('   ');
    return Promise.resolve('x');
  }
  const Q = [{ role: 'user', content: 'q' }];

  // ══════════════ 正向：真 API 全走一遍 ══════════════
  const H = makeHost({ reply: defReply });
  const E = H.api;
  assert.ok(!!E, '命名空间在场（ensemble）');
  assert.ok(JSON.stringify(E.STRATEGIES) === JSON.stringify(['first', 'vote', 'blend']),
    '三档封闭集合（实 ' + JSON.stringify(E.STRATEGIES) + '）');

  // 1 默认关闭：拒收 + **零通道调用**（不是「发了但丢弃」）
  assert.ok(E.getSettings().enabled === false, '默认关闭');
  assert.ok(E.getSettings().maxModels === 3, '默认成员上限 3');
  const rOff = await E.run(['a', 'b'], Q);
  assert.ok(rOff.ok === false && rOff.reason === 'disabled', '关闭时拒收 disabled 实 ' + rOff.reason);
  assert.ok(H.calls.length === 0, '关闭时**零通道调用**（实 ' + H.calls.length + ' 次——发了再丢弃会白花 token）');
  assert.ok(E.stat().blocked >= 1 && E.stat().faults.disabled >= 1, '关闭归因进 faults（异常面）');

  // 2 打开后 first：取**首个成功**成员（不是「首个返回」——先到的不一定是先给的）
  E.setSettings({ enabled: true });
  H.calls.length = 0;
  const r1 = await E.run(['a', 'b'], Q, { strategy: 'first' });
  assert.ok(r1.ok === true && r1.chosen === '甲' && r1.chosenBy === 'first', 'first 取首个成功成员（实 ' + r1.chosen + '/' + r1.chosenBy + '）');
  assert.ok(r1.count === 2 && r1.members.length === 2, '两成员各留一条行（实 ' + r1.count + '）');
  assert.ok(H.calls.length === 2, '两成员各调一次（实 ' + H.calls.length + '）');
  assert.ok(r1.answered === 2 && r1.failed === 0, '成功/失败计数自证（实 ' + r1.answered + '/' + r1.failed + '）');
  assert.ok(r1.members[0].index === 0 && r1.members[1].index === 1, '成员按名单序编号');
  assert.ok(r1.ms > 0, '耗时读数非零（时钟推进，实 ' + r1.ms + '）');

  // 2a first 档仍要报一致性（它只是「不管分歧」，不是「不看分歧」）
  assert.ok(r1.consistency === 1 && r1.agreed === true, 'first 档也记一致性（实 ' + r1.consistency + '）');
  // 2b 首个成功：名单首个失败时取下一个（不是「名单第一个」）
  H.calls.length = 0;
  const r1b = await E.run(['bad', 'a'], Q, { strategy: 'first' });
  assert.ok(r1b.chosen === '甲' && r1b.answered === 1 && r1b.failed === 1, '首个成功者跳过失败成员（实 ' + r1b.chosen + '）');
  assert.ok(r1b.members[0].ok === false && r1b.members[0].kind === 'http', '失败成员带 kind 归因（实 ' + r1b.members[0].kind + '）');

  // 3 vote 一致：consistency=1
  H.calls.length = 0;
  const r2 = await E.run(['a', 'b'], Q, { strategy: 'vote' });
  assert.ok(r2.conflict === false && r2.chosen === '甲' && r2.votes === 2, 'vote 一致：两票（实 ' + r2.votes + '）');
  assert.ok(r2.consistency === 1, '一致性 1（实 ' + r2.consistency + '）');
  assert.ok(JSON.stringify(r2.voters) === JSON.stringify(['a', 'b']), '投票者名单逐字（实 ' + JSON.stringify(r2.voters) + '）');

  // 4 vote 2:1：多数即答案
  H.calls.length = 0;
  const r3 = await E.run(['a', 'b', 'c'], Q, { strategy: 'vote' });
  assert.ok(r3.conflict === false && r3.chosen === '甲' && r3.votes === 2, 'vote 2:1 取多数（实 ' + r3.votes + '）');
  assert.ok(r3.consistency === 2 / 3, '一致性 = 最高票/作答数（实 ' + r3.consistency + '）');
  assert.ok(r3.answers.length === 2, '两种答案分桶（实 ' + r3.answers.length + '）');

  // 5 vote 1:1：并列 ⇒ 冲突，**不替调用方选**
  H.calls.length = 0;
  const r4 = await E.run(['a', 'c'], Q, { strategy: 'vote' });
  assert.ok(r4.conflict === true && r4.reason === 'conflict' && r4.chosen === null, 'vote 1:1 判冲突且不选（实 ' + r4.reason + '）');
  assert.ok(r4.answers.length === 2 && r4.answers[0].text === '甲' && r4.answers[1].text === '乙', '交回 N 份原文（实 ' + JSON.stringify(r4.answers.map(function (x) { return x.text; })) + '）');

  // 6 全不同也判冲突（「没有多数」不等于「第一个就是多数」）
  H.calls.length = 0;
  const r5 = await E.run(['a', 'c', 'd'], Q, { strategy: 'vote' });
  assert.ok(r5.conflict === true && r5.chosen === null && r5.answers.length === 3, '三份全不同 ⇒ 判冲突（实 ' + r5.answers.length + ' 桶）');

  // 7 一致判定是**保守**的：规范化只拉平空白
  assert.ok(E.normalize('甲  乙') === '甲 乙', '连续空白折一个（实 ' + JSON.stringify(E.normalize('甲  乙')) + '）');
  assert.ok(E.normalize('  甲\n乙  ') === '甲 乙', '折行与首尾空白拉平（实 ' + JSON.stringify(E.normalize('  甲\n乙  ')) + '）');
  assert.ok(E.normalize('甲！') !== E.normalize('甲'), '不删标点（「甲」与「甲！」不是同一个答案）');
  assert.ok(E.normalize('A') !== E.normalize('a'), '不小写化（认不出一致就报不一致）');
  H.calls.length = 0;
  const r5b = await E.run([{ channel: 'a' }, { channel: 'c' }], Q, { strategy: 'vote' });
  assert.ok(r5b.conflict === true, '「甲」vs「乙」判冲突（不靠语义猜）');

  // 8 blend 缺确认：need-confirm + N 份原文（不合并、不改写）
  H.calls.length = 0;
  const r6 = await E.run(['a', 'c'], Q, { strategy: 'blend' });
  assert.ok(r6.ok === true && r6.reason === 'need-confirm' && r6.chosen === null, 'blend 缺确认 ⇒ need-confirm（实 ' + r6.reason + '）');
  assert.ok(r6.answers.length === 2, '缺确认时也把 N 份原文带出（实 ' + r6.answers.length + '）');
  assert.ok(H.calls.filter(function (c) { return c.ch === 'judge'; }).length === 0, '缺确认时**不调合并通道**（实 ' + H.calls.length + ' 次调用）');

  // 9 blend 真合并：合并器收到各答案的**通道标签**（否则事后无法复盘哪个说法出自谁）
  H.calls.length = 0;
  const r7 = await E.run(['a', 'c'], Q, { strategy: 'blend', confirm: true });
  assert.ok(r7.chosenBy === 'blend' && /合并后/.test(r7.chosen || ''), 'blend 真合并（实 ' + r7.chosenBy + '）');
  assert.ok(r7.blendChannel === 'judge', '合并通道留痕（实 ' + r7.blendChannel + '）');
  const jc = H.calls.filter(function (c) { return c.ch === 'judge'; })[0];
  assert.ok(!!jc && jc.msgs.length === 2 && jc.msgs[0].role === 'system', '合并调用带固定提示词（system + user）');
  assert.ok(jc.msgs[1].content.indexOf('来自 a') > 0 && jc.msgs[1].content.indexOf('来自 c') > 0, '合并提示词带各答案的通道标签（复盘可查）');
  assert.ok(r7.count === 2, '合并不把合并通道算进成员（实 ' + r7.count + '）');

  // 10 blend 已一致：**不调合并**（多一次调用不会让同一个答案更一致）
  H.calls.length = 0;
  const r8 = await E.run(['a', 'b'], Q, { strategy: 'blend', confirm: true });
  assert.ok(r8.chosenBy === 'blend-consistent' && r8.chosen === '甲', '已一致走 blend-consistent（实 ' + r8.chosenBy + '）');
  assert.ok(H.calls.length === 2, '已一致时只调 2 次（成员各一次，合并通道零调用，实 ' + H.calls.length + '）');

  // 11 可见降级三形态：合并通道未配置 / 合并抛错 / 合并回收空
  H.calls.length = 0;
  const r9 = await E.run(['a', 'c'], Q, { strategy: 'blend', confirm: true, blendChannel: 'unset' });
  assert.ok(r9.fellback === true && r9.chosenBy === 'first' && r9.fallbackReason === 'missing-key',
    '合并通道未配置 ⇒ 回落 first 并带理由（实 ' + r9.fallbackReason + '）');
  assert.ok(r9.chosen === '甲', '回落取首个成功成员（实 ' + r9.chosen + '）');
  H.calls.length = 0;
  const r9b = await E.run(['a', 'c'], Q, { strategy: 'blend', confirm: true, blendChannel: 'bad' });
  assert.ok(r9b.fellback === true && r9b.fallbackReason === 'blend-error:http', '合并抛错 ⇒ 带 err.kind 的理由（实 ' + r9b.fallbackReason + '）');
  H.calls.length = 0;
  const r9c = await E.run(['a', 'c'], Q, { strategy: 'blend', confirm: true, blendChannel: 'empty' });
  assert.ok(r9c.fellback === true && r9c.fallbackReason === 'empty-response', '合并回收空 ⇒ 不把空当答案（实 ' + r9c.fallbackReason + '）');
  assert.ok(E.stat().fellback >= 3, '三次降级全部记账（实 ' + E.stat().fellback + '）');

  // 12 全失败：如实 all-failed，带逐成员原因，**不编答案**
  H.calls.length = 0;
  const r10 = await E.run(['bad', 'bad2'], Q);
  assert.ok(r10.ok === false && r10.reason === 'all-failed', '全失败报 all-failed（实 ' + r10.reason + '）');
  assert.ok(r10.chosen === null && r10.chosenBy === 'first', '全失败不编答案（chosen 为空）');
  assert.ok(r10.detail === 'bad:http,bad2:http', '逐成员失败原因点名（实 ' + r10.detail + '）');
  assert.ok(E.stat().allFailed >= 1, 'allFailed 记账（实 ' + E.stat().allFailed + '）');
  // 12a 全失败也留行：调用方可看见「是谁坏了」
  assert.ok(r10.members.length === 2 && r10.members.every(function (m) { return m.ok === false && m.ms > 0; }), '全失败仍逐成员留行（含耗时）');

  // 13 去重：同通道同模型给两次**只调一次**（否则同一模型答两遍能伪装成两个模型一致）
  H.calls.length = 0;
  const r11 = await E.run(['a', 'a'], Q, { strategy: 'vote' });
  assert.ok(r11.count === 1 && r11.duplicates.length === 1 && r11.duplicates[0] === 'a', '重复通道去重并点名（实 ' + JSON.stringify(r11.duplicates) + '）');
  assert.ok(H.calls.length === 1, '去重后只调 1 次（实 ' + H.calls.length + '）');
  assert.ok(r11.agreed !== true, '去重后单成员不算「一致」（一个人同意自己不是一致）');
  // 13a 同通道**不同模型**是两个合法成员（不是重复）
  H.calls.length = 0;
  const r11b = await E.run([{ channel: 'a', model: 'm1' }, { channel: 'a', model: 'm2' }], Q, { strategy: 'vote' });
  assert.ok(r11b.count === 2 && r11b.duplicates.length === 0, '同通道不同模型是两个成员（实 ' + r11b.count + '）');

  // 14 成员上限：超出者**不进本次调用**并被点名（不静默截断）
  H.calls.length = 0;
  const r12 = await E.run(['a', 'b', 'c', 'd'], Q, { strategy: 'vote' });
  assert.ok(r12.count === 3 && r12.overMax === 1, 'maxModels 3 硬约束（实 count=' + r12.count + ' over=' + r12.overMax + '）');
  assert.ok(JSON.stringify(r12.skipped) === JSON.stringify(['d']), '越限通道点名（实 ' + JSON.stringify(r12.skipped) + '）');
  assert.ok(H.calls.length === 3, '越限成员一次都不发（实 ' + H.calls.length + '）');
  // 14a 名单既能给字符串也能给对象
  H.calls.length = 0;
  const r12b = await E.run({ channel: 'a' }, Q, { strategy: 'first' });
  assert.ok(r12b.count === 1 && r12b.chosen === '甲', '单条非数组名单也受理（实 ' + r12b.count + '）');

  // 15 拒收面：空名单 / 空消息 / apiRouter 缺席
  const r13 = await E.run([], Q);
  assert.ok(r13.reason === 'no-channel', '空名单拒收 no-channel（实 ' + r13.reason + '）');
  const r13b = await E.run([{}, ''], Q);
  assert.ok(r13b.reason === 'no-channel', '空通道名一律滤掉（实 ' + r13b.reason + '）');
  const r13c = await E.run(['a'], []);
  assert.ok(r13c.reason === 'bad-value', '空消息拒收 bad-value（实 ' + r13c.reason + '）');
  const HN = makeHost({ reply: defReply, noRouter: true });
  HN.api.setSettings({ enabled: true });
  const r13d = await HN.api.run(['a'], Q);
  assert.ok(r13d.reason === 'all-failed' && HN.api.stat().faults.disabled === undefined, 'router 缺席 ⇒ 走 all-failed 而非 disabled（实 ' + r13d.reason + '）');
  assert.ok(r13d.members[0].kind === 'module-absent', 'router 缺席的成员归因 module-absent（不是「跑了 0ms」，实 ' + r13d.members[0].kind + '）');

  // 16 只读：本锁的宿主把 store 写入口做成**抛错**，全程跑完零抛出
  assert.ok(E.stat().runs >= 12, 'runs 累计（实 ' + E.stat().runs + '）');
  assert.ok(E.stat().members >= 24, 'members 累计（实 ' + E.stat().members + '）');
  assert.ok(E.stat().duplicates >= 1 && E.stat().conflicted >= 3 && E.stat().agreed >= 2, '各档归因计数（冲突 ' + E.stat().conflicted + ' / 一致 ' + E.stat().agreed + '）');
  assert.ok(E.stat().lastMs > 0 && E.stat().worstMs > 0 && E.stat().worstChannel.length > 0,
    '耗时读数（lastMs=' + E.stat().lastMs + ' worstMs=' + E.stat().worstMs + '@' + E.stat().worstChannel + '）');
  assert.ok(E.stat().lastConsistency !== undefined, '最近一致性读数在场（实 ' + E.stat().lastConsistency + '）');

  // 17 并发闸的单一真源：读数取自 router，本模块不建第二套上限
  assert.ok(E.concurrency() === 3, '并发读数取自 apiRouter.getConcurrency（实 ' + E.concurrency() + '）');
  H.WA.apiRouter._c = 5;
  assert.ok(E.concurrency() === 5, 'router 改值后随动（说明不是本模块自持常量，实 ' + E.concurrency() + '）');
  assert.ok(E.stat().concurrency === 5, 'stat 里也带并发读数（实 ' + E.stat().concurrency + '）');
  H.WA.apiRouter._c = 3;
  // 17a 无 router 时并发读数如实落 0（不编一个默认上限）
  assert.ok(HN.api.concurrency() === 0, '无 router ⇒ 并发读数 0（实 ' + HN.api.concurrency() + '）');

  // 18 设置面：bounds 由设置总线提供（maxModels [2,6] / timeoutMs [5000,300000]）
  const regs = (H.WA.__settingsRegs || []).filter(function (r) { return r && r.module === 'ensemble'; });
  assert.ok(regs.length === 1, '本模块向设置总线登记恰一次（实 ' + regs.length + '）');
  assert.ok(regs[0].bounds.maxModels[0] === 2 && regs[0].bounds.maxModels[1] === 6, 'maxModels 上下界 [2,6]（实 ' + JSON.stringify(regs[0].bounds.maxModels) + '）');
  assert.ok(regs[0].key === 'worldaxis_ensemble_settings_v1', '设置键留痕（实 ' + regs[0].key + '）');
  // 18a 无宿主设置面时读的是模块自己的 DEF（默认关闭的真实测试路径）
  const HB = makeHost({ reply: defReply, noBus: true });
  assert.ok(HB.api.getSettings().enabled === false, '无设置面时默认关闭（读 DEF）');

  // ══════════════ 逆向：真源码破坏 → 装载副本 → 副本上重跑同款真判据 ══════════════
  // N1 破坏「默认关闭」：DEF.enabled 置真 ⇒ **无宿主设置面**时默认为开启（可观测）
  {
    const code = wreck('gate', "enabled: true, strategy: 'first', maxModels: 3, blendChannel: 'judge', timeoutMs: 60000");
    const h = makeHost({ reply: defReply, noBus: true, code: code });
    assert.ok(h.api.getSettings().enabled === true, 'N1 破坏可观测：无设置面时默认为开启（实 ' + h.api.getSettings().enabled + '）');
    // 且「关着就零调用」随之失效 —— 真行为变化，不是换了个读数的名字
    const rr = await h.api.run(['a', 'b'], Q);
    assert.ok(rr.ok === true && h.calls.length === 2, 'N1 破坏可观测：关闭门失效（默认态就发调用，实 ' + h.calls.length + ' 次）');
  }
  // N1 正控：**原版**在同路径下必须仍零调用（证明该判据未破坏时是绿的，不是恒绿）
  {
    const h = makeHost({ reply: defReply, noBus: true });
    const rr = await h.api.run(['a', 'b'], Q);
    assert.ok(rr.reason === 'disabled' && h.calls.length === 0, 'N1 正控：原版无设置面时零调用（实 ' + h.calls.length + '）');
  }

  // N2 破坏「关闭时零调用」：闸门条件置假（关闭态照常往下走）⇒ 零调用判据必红
  //   破坏形态是**条件置假**，不删行 —— `if (false) {...}` 之后流程照常，于是关闭态也发调用。
  {
    const code = wreck('gateCall', "if (false) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }");
    const h = makeHost({ reply: defReply, code: code });
    const rr = await h.api.run(['a', 'b'], Q);
    assert.ok(rr.ok === true, 'N2 破坏可观测：关闭态被当成开启（实 ok=' + rr.ok + '）');
    assert.ok(h.calls.length === 2, 'N2 破坏可观测：关闭态也发了调用（实 ' + h.calls.length + ' 次，本框正是要治的「发了再丢弃」）');
  }

  // N3 破坏「并列即冲突」：去掉并列判据 ⇒ conflict 判据必红
  {
    const code = wreck('conflict', "const conflict = false;");
    const h = makeHost({ reply: defReply, code: code });
    h.api.setSettings({ enabled: true });
    const rr = await h.api.run(['a', 'c'], Q, { strategy: 'vote' });
    assert.ok(rr.conflict === false && rr.chosen !== null, 'N3 破坏可观测：1:1 并列被当多数（实 chosen=' + rr.chosen + '，并列即冲突已失效）');
    // 破坏是「条件置假」而不是「删行」：代码行仍在，只是判据不生效
    assert.ok(h.api.stat().conflicted === 0, 'N3 破坏可观测：conflict 归因随之不再产生（实 ' + h.api.stat().conflicted + '）');
  }

  // N4 破坏「去重」：键里去掉模型维度 ⇒ 同通道不同模型也被判重复（可观测）
  {
    const code = wreck('dedup', "const k = m.channel;");
    const h = makeHost({ reply: defReply, code: code });
    h.api.setSettings({ enabled: true });
    const rr = await h.api.run([{ channel: 'a', model: 'm1' }, { channel: 'a', model: 'm2' }], Q, { strategy: 'vote' });
    assert.ok(rr.count === 1 && rr.duplicates.length === 1, 'N4 破坏可观测：不同模型被误判为重复（实 count=' + rr.count + '）');
    assert.ok(h.calls.length === 1, 'N4 破坏可观测：第二个模型一次都没发（实 ' + h.calls.length + '）');
  }

  // N5 破坏「成员上限」：cap 改成名单长度 ⇒ 越限通道不再点名（可观测）
  {
    const code = wreck('cap', "const cap = uniq.length;");
    const h = makeHost({ reply: defReply, code: code });
    h.api.setSettings({ enabled: true });
    const rr = await h.api.run(['a', 'b', 'c', 'd'], Q, { strategy: 'vote' });
    assert.ok(rr.count === 4 && rr.overMax === 0 && rr.skipped.length === 0, 'N5 破坏可观测：maxModels 约束失效（实 count=' + rr.count + '）');
    assert.ok(h.calls.length === 4, 'N5 破坏可观测：越限成员也发了调用（实 ' + h.calls.length + '）');
  }

  // N6 破坏「blend 必须确认」：确认门去掉 ⇒ need-confirm 判据必红
  {
    const code = wreck('confirm', "if (false) {");
    const h = makeHost({ reply: defReply, code: code });
    h.api.setSettings({ enabled: true });
    const rr = await h.api.run(['a', 'c'], Q, { strategy: 'blend' });
    assert.ok(rr.reason !== 'need-confirm' && rr.chosenBy === 'blend', 'N6 破坏可观测：缺确认也直接合并（实 ' + rr.chosenBy + '，本仓要治的「不打招呼就替你合并」）');
    assert.ok(h.calls.filter(function (c) { return c.ch === 'judge'; }).length === 1, 'N6 破坏可观测：合并通道真被调了（实 ' + h.calls.length + ' 次调用）');
  }

  // N7 破坏「可见降级」：回落不写 fellback ⇒ 降级变成静默（可观测）
  {
    const code = wreck('fallback', "out.chosenBy = 'first';");
    const h = makeHost({ reply: defReply, code: code });
    h.api.setSettings({ enabled: true });
    const rr = await h.api.run(['a', 'c'], Q, { strategy: 'blend', confirm: true, blendChannel: 'unset' });
    assert.ok(rr.chosenBy === 'first' && rr.fellback === false, 'N7 破坏可观测：降级发生了但不再可见（实 fellback=' + rr.fellback + '）');
    assert.ok(rr.fallbackReason === '', 'N7 破坏可观测：理由也随之丢失（实 ' + JSON.stringify(rr.fallbackReason) + '）');
  }

  // N8 破坏「全失败如实报」：去掉 all-failed 分支 ⇒ 该判据必红
  {
    const code = wreck('allFail', "out.ok = true; out.reason = '';");
    const h = makeHost({ reply: defReply, code: code });
    h.api.setSettings({ enabled: true });
    const rr = await h.api.run(['bad', 'bad2'], Q);
    assert.ok(rr.ok === true && rr.reason === '', 'N8 破坏可观测：全失败被当成成功（实 ok=' + rr.ok + '，本版要治的「编一个答案」）');
    assert.ok(rr.chosen === null && h.calls.length === 2, 'N8 破坏可观测：两成员确实都失败了（调用 ' + h.calls.length + ' 次，chosen 仍空）');
  }

  // N9 破坏「合并回收空」：空答案当成功 ⇒ empty-response 判据必红
  {
    const code = wreck('emptyResp', "if (false) return { ok: false, reason: 'empty-response' };");
    const h = makeHost({ reply: defReply, code: code });
    h.api.setSettings({ enabled: true });
    const rr = await h.api.run(['a', 'c'], Q, { strategy: 'blend', confirm: true, blendChannel: 'empty' });
    assert.ok(rr.chosenBy === 'blend' && rr.fellback === false, 'N9 破坏可观测：空答案被当合并结果（实 chosen=' + JSON.stringify(rr.chosen) + '）');
  }

  // N10 破坏「只读边界声明」：把边界 2 那句改掉 ⇒ **声明面**判据必红
  //   为什么值得单列：读面判据（代码面零 WA.store）与声明面判据是两件事——
  //   代码没写 store，不代表头部还承诺「只读」。H5 锚点核对正是靠这一行。
  {
    const code = wreck('readOnly', "本文件可写 WA.store（失真的边界声明）");
    const n = code.split(ANCHORS.readOnly.txt).length - 1;
    assert.ok(n === 0, 'N10 破坏可观测：声明面锚点已不在破坏副本里（实 ' + n + ' 次）');
    const nOrig = src.split(ANCHORS.readOnly.txt).length - 1;
    assert.ok(nOrig === 1, 'N10 正控：**原版**源文件里该声明恰中 1 次（实 ' + nOrig + '）');
  }

  // ══════════════ 收尾门：原文件逐字未变（破坏只发生在内存副本上） ══════════════
  assert.ok(fs.readFileSync(ABS, 'utf8') === srcBefore, '收尾门：原文件逐字未变（破坏只在内存副本）');
}

module.exports = { runAll: require('./lock-assert.js').restoring(runAll) };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name); } };
  Promise.resolve().then(function () { return module.exports.runAll(a); }).then(function () {
    if (fail) { console.log('ENSEMBLE-V2138: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
    console.log('ENSEMBLE-V2138: pass（' + pass + ' 项）');
  }, function (e) { console.log('  ✗ 判据失效：' + (e && e.stack)); process.exit(2); });
}

'use strict';
/**
 * tests/narrative-depth-wire-v2547.js — 引擎深度第三批：msg-align 接轮次签名/对齐读数，
 *   ephemeral-scrub 接「注入登记 → 正文洗除」。
 *
 * 锁什么（每条都是正反判据，不是「跑过就算」）：
 *   A 同一楼重复调用 ⇒ 去重（before 链只跑一次）
 *   B 等长、内容不同的最后一楼 ⇒ **不许**去重（旧签名只比长度，这里会静默跳过整条 before 链）
 *   C 标签/空白差异 ⇒ 仍判同一楼（loose 归一化的真实能力，不夸大）
 *   D alignRound：同引用⇒无漂移；等长改一条⇒漂移且 mismatch=1；长短不一⇒漂移且两端条数如实
 *   E scrubReply：命中⇒采用且正文不含该块；未命中⇒**正文逐字节不变**（scrub 内部会 tidy，
 *     没删却采用了就是「观测污染被观测者」）；多处命中⇒不洗；引擎缺席⇒absent 且正文不变
 *   F 产品路径登记：真走 render.applyInjections ⇒ 结构性块进台账；叙事句不进
 *   G ephemeralScrub 缺席 ⇒ 装配不崩、scrubReply 如实 absent
 *
 * 为什么这样接（而不是「让 scrub 洗整份历史」）：本仓注入走 setExtensionPrompt 槽位，
 *   不写 chat 数组 —— 所以「注入块留在历史里」的正身是**模型把注入块复述进正文**。
 *   洗的对象因此是「新生成的那一楼」，不是「整份历史」。
 */
const assert = require('assert');
const env = require('./ui-gate-sync.js').fresh();
const W = env.WA;
const host = global.SillyTavern.getContext();
const go = function (chat) { return global.worldAxisGenerateInterceptor(chat, 4096, null, 'normal'); };

// 日志捕获（interceptor 每处都是取 WA.log，故换属性就能截）
const logs = [];
const origLog = W.log;
W.log = function (lvl, msg) {
  logs.push({ lvl: lvl, msg: String(msg == null ? '' : msg) });
  try { return origLog.apply(W, arguments); } catch (e) { return undefined; }
};
const dedupCount = function () { return logs.filter(function (x) { return x.msg.indexOf('拦截器去重') >= 0; }).length; };

let pass = 0;
function ok(name, fn) {
  fn(); pass++; console.log('  ✓ ' + name);
}

(async function () {
  ok('A0 前置：msgAlign / ephemeralScrub / interceptor 三口都在场', function () {
    assert.ok(W.msgAlign && typeof W.msgAlign.align === 'function' && typeof W.msgAlign.loose === 'function');
    assert.ok(W.ephemeralScrub && typeof W.ephemeralScrub.register === 'function' && typeof W.ephemeralScrub.scrub === 'function');
    assert.ok(W.interceptor && typeof W.interceptor.alignRound === 'function' && typeof W.interceptor.scrubReply === 'function');
  });

  const BASE = '酒保抬起头，烛火摇曳，角落里那个蒙面人一直盯着你手里的刀';
  const HALF = Math.floor(BASE.length / 2);
  const ALT = BASE.slice(HALF) + BASE.slice(0, HALF);   // 等长、内容不同
  const chat = [{ is_user: true, mes: '我走进酒馆。', swipe_id: 0 }, { is_user: false, mes: BASE, swipe_id: 0 }];
  host.chat = chat;

  await go(chat);
  const d1 = dedupCount();
  await go(chat);
  const d2 = dedupCount();
  ok('A1 同一楼重复调用 ⇒ 去重（before 链只跑一次）', function () {
    assert.strictEqual(d2, d1 + 1, '同楼第二次没被去重：' + d1 + ' -> ' + d2);
  });

  ok('B 等长且内容不同的最后一楼 ⇒ 不许去重', function () {
    assert.strictEqual(BASE.length, ALT.length, '测试前提：两段必须等长');
    assert.notStrictEqual(BASE, ALT);
  });

  chat[1].mes = ALT;
  await go(chat);
  const d3 = dedupCount();
  ok('B1 等长换文后必须判为新的一楼（旧签名会在此静默跳过整条 before 链）', function () {
    assert.strictEqual(d3, d2, '等长不同文被当成同一楼（去重命中）：' + d2 + ' -> ' + d3);
  });

  chat[1].mes = '<b>' + ALT + '</b>';
  await go(chat);
  const d4 = dedupCount();
  ok('C 标签/空白差异 ⇒ 仍判同一楼（loose 归一化）', function () {
    assert.strictEqual(d4, d3 + 1, '标签差异被当成新楼：' + d3 + ' -> ' + d4);
  });

  chat[1].mes = ALT.replace(/，/g, '，  ');
  await go(chat);
  const d5 = dedupCount();
  ok('C2 空白差异 ⇒ 仍判同一楼', function () {
    assert.strictEqual(d5, d4 + 1, '空白差异被当成新楼：' + d4 + ' -> ' + d5);
  });

  ok('D alignRound：同引用 ⇒ 无漂移且满覆盖', function () {
    const same = [{ mes: BASE }, { mes: ALT }];
    host.chat = same;
    const al = W.interceptor.alignRound(same);
    assert.strictEqual(al.available, true, '不可用：' + al.reason);
    assert.strictEqual(al.drift, false, '同引用却报漂移：' + JSON.stringify(al));
    assert.strictEqual(al.mismatch, 0);
    assert.strictEqual(al.coverage, 1);
    assert.strictEqual(al.sentLen, 2);
    assert.strictEqual(al.hostLen, 2);
  });

  ok('D2 alignRound：等长但改了一条 ⇒ 漂移且 mismatch=1', function () {
    const sent = [{ mes: BASE }, { mes: '换成了完全另一段话，字数也差不多' }];
    const al = W.interceptor.alignRound(sent);
    assert.strictEqual(al.drift, true, '等长错位没被识别：' + JSON.stringify(al));
    assert.strictEqual(al.mismatch, 1, '实 ' + al.mismatch);
    assert.strictEqual(al.sentLen, 2);
    assert.strictEqual(al.hostLen, 2);
  });

  ok('D3 alignRound：发送面比存档面多一条 ⇒ 漂移且两端条数如实', function () {
    const sent = [{ mes: BASE }, { mes: ALT }, { mes: '多出来的一条' }];
    const al = W.interceptor.alignRound(sent);
    assert.strictEqual(al.drift, true);
    assert.strictEqual(al.sentLen, 3);
    assert.strictEqual(al.hostLen, 2);
    assert.strictEqual(al.unknown, 1, '多出来那条应报 unknown，实 ' + al.unknown);
  });

  const BLOCK = '<world_axis_state>\n人物：甲0 正在南码头装车，货单三张，押运两人\n</world_axis_state>';

  ok('E scrubReply：命中时采用且正文不含该块', function () {
    W.ephemeralScrub.clear();
    const reg = W.ephemeralScrub.register(BLOCK, { tag: '世界状态' });
    assert.strictEqual(reg.ok, true, JSON.stringify(reg));
    const reply = '他把车绳收紧，回头看了一眼。\n\n' + BLOCK + '\n\n然后转身走了。';
    const r = W.interceptor.scrubReply(reply);
    assert.strictEqual(r.adopted, true, '没采用：' + JSON.stringify(r));
    assert.strictEqual(r.reason, 'scrubbed');
    assert.strictEqual(r.removed, 1);
    assert.strictEqual(r.text.indexOf(BLOCK), -1, '洗完后正文里还有注入块');
    assert.ok(r.text.indexOf('他把车绳收紧') === 0);
  });

  ok('E2 scrubReply：未命中 ⇒ 正文逐字节不变（不许被 tidy 顺手改）', function () {
    const plain = '第一段文字  \n\n\n第二段文字  ';   // 行尾空白 + 三连换行：scrub 内部会 tidy
    const r = W.interceptor.scrubReply(plain);
    assert.strictEqual(r.adopted, false, '没命中却采用了：' + JSON.stringify(r));
    assert.strictEqual(r.reason, 'no-hit');
    assert.strictEqual(r.text, plain, '没命中却改了正文（tidy 泄漏）');
  });

  ok('E3 scrubReply：同一块在正文里多处命中 ⇒ 不洗（宁可不洗，不许误删）', function () {
    const dup = BLOCK + '\n中间一段正文\n' + BLOCK;
    const r = W.interceptor.scrubReply(dup);
    assert.strictEqual(r.adopted, false, '多处命中也洗了：' + JSON.stringify(r));
    assert.strictEqual(r.reason, 'over-match');
    assert.strictEqual(r.overMatch, 1, '实 ' + r.overMatch);
    assert.strictEqual(r.text, dup, '多处命中却改了正文');
  });

  ok('F 产品路径登记：结构块进台账、叙事句不进', function () {
    W.ephemeralScrub.clear();
    const STRUCT = '<测试剧情>\n这是本轮要确保送到的剧情约束，长度足够长，足以通过登记侧的四十字门槛。\n</测试剧情>';
    W.render.applyInjections({ injections: [{ source: '测试剧情约束', position: 'in_chat', depth: 4, content: STRUCT }] });
    const v1 = W.ephemeralScrub.view();
    assert.ok(v1.size >= 1, '真产品路径没登记：size=' + v1.size);
    assert.ok(v1.tags.indexOf('测试剧情约束') >= 0, '标签不对：' + JSON.stringify(v1.tags));
    const n1 = v1.size;
    const NARR = '她终于问出了那句话，屋子里安静了很久很久，久到窗外的雨都停了、灻火也燃到了尾巴，也没有人开口。';
    assert.ok(NARR.length >= 40, '测试前提：叙事句要过长度门槛');
    assert.strictEqual(/[<【]/.test(NARR), false, '测试前提：叙事句不含结构标记');
    W.render.applyInjections({ injections: [{ source: '本幕', content: NARR }] });
    assert.strictEqual(W.ephemeralScrub.view().size, n1, '叙事句被登记进台账（会误删正文的风险）');
  });

  ok('G ephemeralScrub 缺席 ⇒ 装配不崩、scrubReply 如实 absent', function () {
    const orig = W.ephemeralScrub;
    delete W.ephemeralScrub;
    try {
      W.render.applyInjections({ injections: [{ source: '测试剧情约束', content: BLOCK }] });
      const r = W.interceptor.scrubReply('一段普通正文');
      assert.strictEqual(r.adopted, false);
      assert.strictEqual(r.reason, 'absent');
      assert.strictEqual(r.text, '一段普通正文');
    } finally {
      W.ephemeralScrub = orig;
    }
  });

  ok('G2 msgAlign 缺席 ⇒ alignRound 如实 absent，不当成「对齐成功」', function () {
    const orig = W.msgAlign;
    delete W.msgAlign;
    try {
      const al = W.interceptor.alignRound([{ mes: 'x' }]);
      assert.strictEqual(al.available, false);
      assert.strictEqual(al.reason, 'absent');
    } finally {
      W.msgAlign = orig;
    }
  });

  console.log('interceptor-wire-v2547: pass (' + pass + ')');
})().catch(function (e) { console.error(e && e.stack || e); process.exitCode = 1; });

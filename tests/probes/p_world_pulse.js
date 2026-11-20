'use strict';
// 探针 OPV24-1：世界脉搏块 无头验证（vm 装载真实 ui 文件，不 mock 内部实现）
// [P1] 缺席场景：全部引擎缺席 → worldPulseBlock() === ''（缺席好于假值）
// [P2] 在场场景：注入 mock 读口 → 各段人话成立、计数正确、无 undefined、零控件
// [P3] esc 注入：bind({esc}) 后 < 被转义
// [P4] 抛错隔离：单段抛错不拖垮整块，坏段给可见降级行
const fs = require('fs');
const vm = require('vm');
const path = '/home/user/wa_opt1/ui/pages/overview-world-pulse.js';
let pass = 0, fail = 0;
function T(id, ok, note) { if (ok) { pass++; console.log('PASS ' + id + (note ? ' :: ' + note : '')); } else { fail++; console.log('FAIL ' + id + (note ? ' :: ' + note : '')); } }
function load(ctx) { vm.createContext(ctx); vm.runInContext(fs.readFileSync(path, 'utf8'), ctx, { filename: 'overview-world-pulse.js' }); return ctx.window.WorldAxis.panelWorldPulse; }

// [P1] 缺席
{
  const api = load({ window: {} });
  const html = api.worldPulseBlock();
  T('P1', html === '', '缺席时返回空串，len=' + html.length);
}

// [P2] 在场
{
  const eng = {
    foreshadow: { ACTIVE: ['planted', 'developing'], list: function () { return [{ title: '井底的钥匙', status: 'planted', updatedAt: 20 }, { title: '她没说完的话', status: 'developing', updatedAt: 10 }, { title: '<script>x</script>', status: 'planted', updatedAt: 30 }]; }, stat: function () { return { total: 7, active: 3, triggered: 2, closed: 1, stale: 1 }; }, check: function () { return { ok: true, count: 2, thresholdMs: 3600000, rows: [{ content: '井底的钥匙早该有下文' }, { content: '她没说完的话' }] }; } },
    threads: { threadStat: function () { return { cases: 4, open: 2, stalled: 1, resolved: 1, abandoned: 0, leads: 9 }; }, list: function () { return [{ status: 'open', question: '谁在夜里搬空了粮仓？', leads: [{ claim: '车辙印朝北门', source: '守夜人', reliability: 'witness' }, { claim: '粮仓钥匙少了一把', source: '账房', reliability: 'hearsay' }] }, { status: 'stalled', question: '断桥下的火光', leads: [] }]; } },
    enigma: { stat: function () { return { total: 2, outsiders: 1 }; } },
    stagePresence: { stat: function () { return { onstageCount: 3, offstageTicks: 12, reunionsAwakened: 1 }; } },
    offstageLife: { roster: function () { return [{ name: '守墓人', place: '北坡墓地', doing: '给新坟除草', roundsAway: 4 }, { name: '老周', place: '渡口', doing: '修船', roundsAway: 2 }]; } },
    //  v2.541.2：这份 mock 原来是 `{ id:'op1', title:'码头的旧友', stage:'open' }`——
    //  **引擎从来不返回 title**（rowView 只有 id/key/source/sourceLabel/from/actors/
    //  severity/stage/active/...），而面板那段读 `v.title || v.text || v.name || v.summary || v.id`，
    //  于是探针喂假字段、面板印真句柄、断言比『码头的旧友』在场 —— 三方一起绿，
    //  只有玩家看见的是 `op:promise:xxx`。判据的输入面窄于事实，就是这样漏掉的。
    //  现在 mock 按真 rowView 形状给（4 条，用于验计数不截断）。
    opportunity: { CHOICES: ['take', 'decline', 'defer'], list: function () {
      return [
        { id: 'op:promise:1', key: 'promise:1', source: 'promise', sourceLabel: '承诺逾期', from: '伏笔 井底的钥匙 已过承诺回收时刻 30 分钟仍未收束', actors: ['老周'], severity: 'normal', stage: 'open', active: true },
        { id: 'op:intel:2', key: 'intel:2', source: 'intel', sourceLabel: '情报未核实', from: '', actors: [], severity: 'normal', stage: 'deferred', active: true },
        { id: 'op:debt:3', key: 'debt:3', source: 'debt', sourceLabel: '欠账未清', from: '账房 名册内有 2 人被欠着（合计 40）', actors: ['账房'], severity: 'normal', stage: 'open', active: true },
        { id: 'op:causal:4', key: 'causal:4', source: 'causal', sourceLabel: '因果后果到期', from: '因果链 C7 的延迟后果已到期 1 条（首条：桥塌）', actors: [], severity: 'normal', stage: 'open', active: true }
      ];
    }, respond: function (id, ch) { return { ok: true, id: id, choice: ch, source: 'rumor' }; } },
    storyChoice: { pending: function () { return { ok: true, points: [{ id: 'sc1', prompt: '追上去问个明白？' }] }; }, review: function () { return { ok: true, options: [{ label: '追上去', allowed: true, costs: '时间' }, { label: '烧了信', allowed: false, preview: { ok: false, reason: 'preview-rejected' }, costs: '信用' }, { label: '留在原地', allowed: true }] }; }, confirm: function (id, opt) { return { ok: true, id: id, option: opt, applied: true, receipt: 'r77' }; } },
    branchTree: { stat: function () { return { nodes: 6, withChoice: 3, roots: 1 }; } },
    longline: { stat: function () { return { active: 2, overdue: 1 }; } },
    causal: { stateView: function () { return { active: 5, settled: 3 }; } },
    injectBudget: { volumeView: function () { return { planned: 14, folded: 2, dropped: 0, kept: 12, tokens: 3800, poolRemain: 1200, rows: [{ source: '伏笔块', tokens: 1600 }, { source: '暗线块', tokens: 900 }] }; } }
  };
  const api = load({ window: { WorldAxis: Object.assign({ WorldAxis: {} }, eng) } });
  const WA = api && null;
  const html = api.worldPulseBlock();
  T('P2a', html.indexOf('世界脉搏') >= 0, '块头成立');
  //  v2.541.2：原断言还比了 `井底的钥匙` / `她没说完的话`——那是 mock 里编的 list，
  //  引擎真身**没有 list 导出**（本文件注释写了两遍），逐案明细早已按「零消费能力当场删」删掉。
  //  于是这条断言在没人跑的日子里一直红着：探针被 test-surface 豁免成「手动入口」，
  //  断言腐烂了没人知道。现在反过来锁：**mock 故意提供 list，输出仍不许出现它的标题**。
  //  负控选 `她没说完的话`（只存在于 list）而不是 `井底的钥匙`：后者会**合法地**出现在
//  `check()` 的回收时机行（`最久「井底的钥匙早该有下文」`），拿它当负控等于把两条读口混成一条。
  T('P2b', html.indexOf('伏笔：在途 <b>3</b> / 累计 7') >= 0 && html.indexOf('她没说完的话') < 0,
    '伏笔段只报聚合：mock 给了 list，输出仍不列明细（引擎无 list 读口，不猜）');
  T('P2c', html.indexOf('悬案 <b>2</b>') >= 0 && html.indexOf('知情隔离') >= 0, '暗线段+enigma 附行');
  T('P2d', html.indexOf('在场 3 人，退场推进 12 轮次，重逢唤醒 1 次') >= 0, '幕后生活段');
  //  v2.541.2：这组断言整体重写——原断言比的是 `html.indexOf('码头的旧友')`，
  //  而那个字段是 mock 自己编的。现在比的是**真字段拼出的句子**，并额外锁三条负向：
  //  ① 正文里不许出现 `op:` 账本句柄（只许活在 data-op-id 属性里）；
  //  ② from 缺席时必须说「没留下描述」而不是把整条静默吞掉；
  //  ③ 「在途 N 条」的 N 必须是全量 4，不是截断后的 3。
  T('P2e', html.indexOf('<b>承诺逾期</b>：伏笔 井底的钥匙 已过承诺回收时刻') >= 0
    && html.indexOf('<b>欠账未清</b>：账房 名册内有 2 人被欠着') >= 0
    && html.indexOf('data-op-act="defer"') >= 0 && html.indexOf('data-op-act="decline"') >= 0,
    '机会段：真字段（sourceLabel+from）成句 + 缓办/放弃键');
  T('P2e-narrow', html.indexOf('在途 <b>4</b> 条') >= 0 && html.indexOf('（下面只列最近 3 条）') >= 0,
    '计数用全量 4（不许拿 slice(0,3) 后的长度冒充在途数）');
  //  v2.541.2：`P2e-nohandle` 第一版写成 `indexOf('op:') < 0`，当场被 `style="opacity:0.75"` 命中——
  //  负控打在字面上而不是打在语义上。句柄形态固定是 `op:<source>:`，source 只有这六个，
  //  所以负控按**来源名**打，不放宽也不用 `op:` 这种会被 CSS 属性撞上的子串。
  T('P2e-nohandle', !/op:(promise|pressure|conflict|intel|debt|causal)/.test(html.replace(/data-op-id="[^"]*"/g, '')),
    '正文不出现 op:<source>: 账本句柄（id 只作 data-op-id 回传，不当标题印）');
  T('P2e-emptyfrom', html.indexOf('（这一条没留下描述）') >= 0,
    'from 缺席写「没留下描述」，不静默吞行（本来就没有 ≠ 算不出来）');
  T('P2e-stage', html.indexOf('（等你回应·老周）') >= 0 && html.indexOf('（已缓办·未记录涉及者）') >= 0,
    '阶段说中文 + 涉及者未记录时说未记录（不猜人名）');
  T('P2e2', html.indexOf('接下请在正文里回应') >= 0 && html.indexOf('data-op-act="take"') < 0, '无 take 键 + 引导语在场');
  T('P2e3', html.indexOf('故事分支：待决') >= 0 && html.indexOf('data-sc-id="sc1"') >= 0 && html.indexOf('追上去') >= 0 && html.indexOf('（时间）') >= 0, '故事分支段：待决点+选项键+费用');
  //  v2.541.2：这条原来比「展开逐案明细」「粮仓钥匙少了一把（账房／hearsay）」「尚无线索」——
  //  那套逐案明细在旧版里就已按「引擎零 list 导出 ⇒ 零消费能力当场删」摘掉了，
  //  断言没跟上，于是长期红着。现在反过来锁「不许列明细」。
  T('P2e4', html.indexOf('展开逐案明细') < 0 && html.indexOf('粮仓钥匙少了一把') < 0,
    '暗线不列逐案明细（引擎无 list 读口，明细能力已按纪律删除；原断言比的是已删能力，过期）');
  T('P2e5', html.indexOf('id="wa-pulse-res"') >= 0, '结果回显容器常在场');
  T('P2f', html.indexOf('进行中 <b>2</b> 条，逾期 1') >= 0 && html.indexOf('活动 <b>5</b> 条') >= 0, '长线+因果段');
  T('P2g', html.indexOf('计划 14·折叠 2·保留 12') >= 0, '注入裁决段（零计数不显示，是真设计）');
  T('P2h', html.indexOf('undefined') < 0 && html.indexOf('[object') < 0, '无漏值');
  T('P2i', html.indexOf('<input') < 0 && html.indexOf('onclick=') < 0 && html.indexOf('onchange=') < 0, '零内联绑定零input（按钮为纯标记，事件由 panel 委托；id 仅 wa-pulse-res 且已登记 UI_BINDINGS）');
  T('P2j', html.indexOf('回收时机：2 条超 1小时 未推进，最久「井底的钥匙早该有下文') >= 0, '回收时机提示：逾期计数+阈值人话+最久一条（OPV25-T2-1）');
  T('P2k', html.indexOf('烧了信') >= 0 && html.indexOf('〔预演未过，走不通〕') >= 0 && html.indexOf('data-sc-opt="烧了信"') < 0, '预演未过选项：可见但不可点（OPV25-T2-2a）');
  T('P2l', html.indexOf('分支树：6 个节点（已决 3·根 1）') >= 0, '分支树计数行（OPV25-T2-2b）');
  T('P2m', html.indexOf('守墓人：北坡墓地，给新坟除草（离场 4 轮）') >= 0 && html.indexOf('老周：渡口，修船（离场 2 轮）') >= 0, '退场落点名册：谁·在哪·做什么·离场几轮（OPV25 续）');
  T('P2n', html.indexOf('共 3800 token（池余 1200），大头：伏笔块 1600t') >= 0, 'token 一眼读数：总量+池余+最大源（OPV26-O1）');
}

// [P3] esc 注入
// v2.541.2：原 mock 只给 `foreshadow.list`，而本段早已不从 list 渲染（无该读口），
  //  于是这条「转义」断言比的是一个不可能出现在 html 里的字段——空转通过/空转失败都无所谓了。
  //  改成给**真正会渲染**的字段：check().rows[0].content（回收时机行）。
{
  const eng = { foreshadow: { stat: function () { return { total: 1, active: 1 }; }, check: function () { return { ok: true, count: 1, thresholdMs: 3600000, rows: [{ content: '<b>注入测试</b>' }] }; } } };
  const api = load({ window: { WorldAxis: Object.assign({ WorldAxis: {} }, eng) } });
  api.bind({ esc: function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); } });
  const html = api.worldPulseBlock();
  T('P3', html.indexOf('&lt;b&gt;注入测试&lt;/b&gt;') >= 0, 'esc 注入后 < 被转义');
}

// [P4] 抛错隔离
{
  const eng = {
    foreshadow: { stat: function () { return { total: 5, active: 2 }; } },
    threads: { threadStat: function () { throw new Error('boom'); } }
  };
  const api = load({ window: { WorldAxis: Object.assign({ WorldAxis: {} }, eng) } });
  const html = api.worldPulseBlock();
  T('P4a', html.indexOf('伏笔：在途 <b>2</b> / 累计 5') >= 0, '好段不受坏段影响');
  T('P4b', html.indexOf('一段读数失败') >= 0 && html.indexOf('boom') >= 0, '坏段给可见降级行');
}
console.log('=== PULSE PROBE: ' + pass + ' pass / ' + fail + ' fail ===');
process.exit(fail ? 1 : 0);
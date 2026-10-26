#!/usr/bin/env node
'use strict';
// WorldAxis tests/s3-b4-n11-v2229.js (v2.229.0) — N11 四项缝各自落位专锁(四段齐备)
//
// 【四个内容点(各自有独立真缺陷,不是「加个开关」)】
//   E 判定档位占比制(choice v1.9.0)  → engines/gauge.js  `bandOf(diff, need)`
//     缺口原句:量规只有**固定断点** MILESTONES=[25,50,75,100] 的绝对值。进度 30% 就是 30%,
//     与「这一轮目标是攒够 40 还是攒够 4000」无关 ⇒ 同一个 30 在两种目标下被读成同一档。
//     现场要的是「**已达成占需要的几成**」这一比值(20/40/60/80 四断)。
//   B 推理不冒充产出(SevenDaysCal 3.9.0) → engines/reasoning.js `officialOnly(text)`
//     缺口原句:`<reasoning>…</reasoning>` 的字符被 checkBody 与 word-budget.count **当正文数**,
//     于是「一段纯思考 + 空正文」能通过两道字数闸门落地。
//   C 保存三态可见(SevenDaysCal 3.9.0) → core/store.js `saveStat().face`
//     缺口原句:save() 的**配额救援成功**路径把 ok 置 true 并返回 true,而那次落盘是**有损**的
//     (为腾空间删掉了若干可回收键)。读数面只有一个布尔 ⇒ 「干净落盘」与「丢了东西才落盘」同形。
//   D 计划不冒充事实(SevenDaysCal 3.9.2) → engines/plan.js `review(personName)`
//     缺口原句:plan 面只有「第几步、什么状态」的逐条读数(view()),没有任何一处把
//     「**已结算的事实**」与「**还没发生的拟稿**」分开摆出来。buildBlock 那段进正文提示词的话里,
//     「他打算做这一步」与「他做完了这一步」挤在同一个列表,只靠状态词区分。
//
// 【本轮实测到的**一处真缺陷**(写锁之前修掉,写进判据当基线)】
//   D3 **动态拼正则静默失效**:首版 officialOnly 用 `new RegExp('<' + tag + '(?:\\s[^>]*)?>…')`
//     动态拼正则。**语法完全合法、node --check 全过**,但拼接漏了一层转义
//     (源码里写 '\s' 而非 '\\s')⇒ 元字符静默退化成字面字符 `s`,
//     正则仍能构造成功、只是**一条也匹配不上** ⇒ `stripped` **恒为 0**
//     —— 剥思考段静默失效,推理重新冒充产出(实测:officialOnly('<reasoning>abc</reasoning>正文')
//     返回 stripped:0 / body 仍是原文)。
//     修法:改**RegExp 字面量表** THINK_TAG_RE——元字符直接书写、不经字符串转义,
//     这一类漏层在类型上就不可能发生。
//     教训:「语法过」不等于「行为对」—— 转义漏层不报错、不抛异常,
//     只静默失效。判据 N2 用「拆成动态拼 + 漏一层转义」两向自证。
//
// 【结构说明】
//   四个内容点落在四个不同文件,故 A 段按文件分组(每文件都有「导出面 / 锚点纯度」),
//   B 段按语义分组(每条语义都在**运行时**验,不是只数源码字面)。
//   N 段对四个文件各做一次真源码破坏(砍 BAND_BREAKS 一断 / 拆 officialOnly 正则为动态形 /
//     把 face 判等改成只读 ok / 把 draft 栏判空),并断言原版与破坏版行为不同(两向自证)。
//
// 四段结构(与 N3/N5/N7/N8/N9/N10 同规格):
//   A 静态契约(四处落点各自:导出面 / 无未定义引用 / 段切片 / 锚点纯度 / 装载次序)
//   B 运行时(占比五档 / reasoning-only 三态 / 保存四态 / 拟稿两栏 + asFact:false)
//   C 零泄漏 / 零写侧(四模块本轮都不写世界 —— 逐条实测)
//   N 负控制(四处真源码破坏 + 工具两向自证)
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const GAUGE_REL = 'engines/gauge.js';
const REASON_REL = 'engines/reasoning.js';
const PLAN_REL = 'engines/plan.js';
const STORE_REL = 'core/store.js';
const WORD_REL = 'engines/word-budget.js';
const PANEL_REL = 'ui/panel.js';
const DIAG_REL = 'engines/tool-diag.js';
const IDX_REL = 'index.js';
const SELF_REL = 'tests/s3-b4-n11-v2229.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }
// ── 破坏锚点(各恰 1 次;A9 逐键核)──
const ANCHOR = {
  bandDecl: "\n  const BAND_BREAKS = [20, 40, 60, 80];",
  bandExport: "    bandOf: bandOf",
  thinkRe: "\n  const THINK_TAG_RE = [\n"
    + "    /<reasoning(?:\\s[^>]*)?>[\\s\\S]*?<\\/reasoning>/i,\n"
    + "    /<thought(?:\\s[^>]*)?>[\\s\\S]*?<\\/thought>/i,\n"
    + "    /<thinking(?:\\s[^>]*)?>[\\s\\S]*?<\\/thinking>/i\n  ];",
  offExport: "    officialOnly: officialOnly,",
  faceDecl: "  const __saveStat = { at: 0, ok: null, bytes: 0, reason: null, failCount: 0, face: 'unknown' };",
  faceSaved: "        __saveStat.face = 'saved';",
  faceRead: "      face: __saveStat.face, faceNote:",
  reviewFn: "\n  function review(personName) {",
  reviewExport: "    review: review,",
  pReviewBtn: 'id="wa-plan-review"',
  pReviewBind: "\n    on('#wa-plan-review', () => {",
  diagFace: "              face: stat.face || 'unknown', faceNote: stat.faceNote || '' },",
};
const TGT = {};
Object.keys(ANCHOR).forEach(function (k) { TGT[k] = GAUGE_REL; });
['bandDecl', 'bandExport'].forEach(function (k) { TGT[k] = GAUGE_REL; });
['thinkRe', 'offExport'].forEach(function (k) { TGT[k] = REASON_REL; });
['faceDecl', 'faceSaved', 'faceRead'].forEach(function (k) { TGT[k] = STORE_REL; });
['reviewFn', 'reviewExport'].forEach(function (k) { TGT[k] = PLAN_REL; });
['pReviewBtn', 'pReviewBind'].forEach(function (k) { TGT[k] = PANEL_REL; });
['diagFace'].forEach(function (k) { TGT[k] = DIAG_REL; });
/** 占比断点(封闭集合)。 */
const BANDS = [20, 40, 60, 80];
/** 保存四态(封闭集合;unknown 是「未保存过」,不是失败)。 */
const FACES = ['saved', 'partial', 'unconfirmed', 'failed'];
/** 三个思考段标签(封闭集合)。 */
const TAGS = ['reasoning', 'thought', 'thinking'];
/* ══════════════════ 工具 ══════════════════ */
function sliceFn(src, start, end) {
  const i = src.indexOf(start); if (i < 0) return '';
  const jj = src.indexOf(end, i + start.length);
  return jj < 0 ? src.slice(i) : src.slice(i, jj);
}
function resetSettings(WA) {
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  try { if (WA.gauge) WA.gauge.setSettings({ enabled: false }); } catch (e) {}
  try { if (WA.reasoning) WA.reasoning.setSettings({ enabled: false, effort: 'low', minBodyChars: 120 }); } catch (e) {}
  try { if (WA.plan) WA.plan.setSettings({ enabled: false }); } catch (e) {}
  try { if (WA.wordBudget) WA.wordBudget.setSettings({ enabled: false }); } catch (e) {}
}
function runAll(a) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const G = rd(GAUGE_REL), R = rd(REASON_REL), PL = rd(PLAN_REL), ST = rd(STORE_REL),
    WB = rd(WORD_REL), P = rd(PANEL_REL), D = rd(DIAG_REL), I = rd(IDX_REL), SELF = rd(SELF_REL);
  function env0() { return gate.fresh({}); }
  /* ══════════════════ A 静态契约 ══════════════════ */
  console.log('\n\u25a0 A 静态契约:四处落点各自的导出面 / 无未定义引用 / 锚点纯度 / 装载次序');
  // A1 四文件都在
  a(fs.existsSync(path.join(BASE, GAUGE_REL)) && fs.existsSync(path.join(BASE, REASON_REL))
    && fs.existsSync(path.join(BASE, PLAN_REL)) && fs.existsSync(path.join(BASE, STORE_REL)),
    'A1: 四个落点文件都在仓库里');
  // A2 E:占比断点是封闭常量 + 断点含等号口径
  a(G.indexOf("const BAND_BREAKS = [20, 40, 60, 80];") >= 0, 'A2: BAND_BREAKS 是封闭常量(20/40/60/80)');
  a(G.indexOf('if (pct >= BAND_BREAKS[i]) band = i + 1;') >= 0,
    'A2b: 断点**含等号**(pct >= break ⇒ 落该档;与 gauge.step 的 MILESTONES 判据同口径)');
  a(G.indexOf('const MILESTONES = [25, 50, 75, 100];') >= 0,
    'A2c: MILESTONES 原样保留(占比制是**新增读数**,不替换既有固定断点)');
  // A3 E:bandOf 不猜分母
  a(G.indexOf("if (!isFinite(n) || n <= 0) return { ok: false, reason: 'bad-need', got: need };") >= 0
    && G.indexOf("if (!isFinite(d)) return { ok: false, reason: 'bad-diff', got: diff };") >= 0,
    'A3: bandOf 零写侧且不猜分母(need<=0 ⇒ bad-need;diff 非有限 ⇒ bad-diff)');
  const bandSeg = G.slice(G.indexOf('function bandOf(diff, need) {'), G.indexOf('function rows()'));
  a(bandSeg.length > 0 && bandSeg.indexOf('store.transact') < 0,
    'A3b: bandOf 段零 store.transact(占比制是读数不是推进;整文件的 create/step 各有一处,不归本口管)');
  // A4 B:officialOnly 导出 + 剥法是字面量表(D3 修法的静态面)
  a(R.indexOf('officialOnly: officialOnly,') >= 0, 'A4: reasoning 导出 officialOnly');
  const Rcode = R.split('\n').filter(function (l) { return l.trim().indexOf('//') !== 0; }).join('\n');
  a(R.indexOf('const THINK_TAG_RE = [') >= 0 && Rcode.indexOf('new RegExp(') < 0,
    'A4b: 剥法是 RegExp **字面量表**(真代码面零 new RegExp —— D3 静默失效的静态面;注释里写着旧写法原文不算)');
  a(cnt(R, '/<reasoning(?:\\s[^>]*)?>[\\s\\S]*?<\\/reasoning>/i') === 1
    && cnt(R, '/<thought(?:\\s[^>]*)?>[\\s\\S]*?<\\/thought>/i') === 1
    && cnt(R, '/<thinking(?:\\s[^>]*)?>[\\s\\S]*?<\\/thinking>/i') === 1,
    'A4c: 三个思考段标签各一条字面量(封闭集合,不散落)');
  // A5 B:两处字数面共用同一真源(word-budget 调 officialOnly,不再各剥一套)
  a(WB.indexOf('WA.reasoning.officialOnly(text)') >= 0,
    'A5: word-budget.count 走 reasoning.officialOnly(单一真源,不再两套剥法)');
  a(WB.indexOf("stat.faults['reasoning-only']") >= 0,
    'A5b: word-budget 如实记 reasoning-only(不静默按 0 字放行)');
  a(WB.indexOf("stat.faults['official-only-absent']") >= 0,
    'A5c: 真源缺席如实记一笔(退化为旧口径但不假装剥过)');
  // A6 C:四态常量 + 七处路径各记 face
  a(ST.indexOf("const SAVE_FACES = ['saved', 'partial', 'unconfirmed', 'failed'];") >= 0,
    'A6: SAVE_FACES 封闭常量(四态)');
  const faceHits = ST.split('\n').filter(function (l) { return l.indexOf('__saveStat.face =') >= 0; }).length;
  a(faceHits === 7, 'A6b: save() 七条路径各自记 face(实 ' + faceHits + ' 处 —— 少一处就有路径不落态)');
  a(ST.indexOf("__saveStat.face = 'unconfirmed';") >= 0,
    'A6c: verify 失败 ⇒ unconfirmed(**不**读成成功也不读成失败)');
  a(ST.indexOf("__saveStat.face = 'partial';") >= 0,
    'A6d: 配额救援成功 ⇒ partial(「丢了东西才落盘」不许显示成干净成功)');
  a(ST.indexOf('face: __saveStat.face, faceNote: SAVE_FACE_NOTE[__saveStat.face]') >= 0,
    'A6e: saveStat() 读口带出 face + faceNote(可见面)');
  // A7 C:tool-diag 把 face 带进诊断包
  a(D.indexOf("face: stat.face || 'unknown', faceNote: stat.faceNote || ''") >= 0,
    'A7: tool-diag lastSave 带出 face(诊断包可见)');
  // A8 D:review 导出 + asFact 恒 false
  a(PL.indexOf('function review(personName) {') >= 0 && PL.indexOf('review: review,') >= 0,
    'A8: plan 导出 review');
  a(PL.indexOf('asFact: false,') >= 0, 'A8b: review 恒带 asFact:false(拟稿栏不是事实)');
  a(PL.indexOf("if (s.status === 'done' || s.status === 'blocked' || s.status === 'refused') settled.push(item);") >= 0
    && PL.indexOf('else draft.push(item);') >= 0,
    'A8c: 两栏判据是**已结算三态**(done/blocked/refused)对**未结算**(pending/running)');
  // A8d buildBlock / chainBlock 尾注都写明拟稿
  a(PL.indexOf('以上是**拟稿**（未结算的步骤还没发生），不是已发生的事实：') >= 0,
    'A8d: buildBlock 尾注明写「拟稿 ≠ 事实」');
  a(PL.indexOf('未结算的步骤是**拟稿**、不是事实') >= 0,
    'A8e: chainBlock 尾注同口径(推演引擎也不得把拟稿当已发生)');
  // A8f 面板按钮 + 处理器成对
  a(cnt(P, "id=\"wa-plan-review\"") === 1, 'A8f: 面板「复核拟稿」按钮恰 1 处');
  a(cnt(P, ANCHOR.pReviewBind) === 1, 'A8g: 按钮 on() 绑定恰 1 处(渲染与绑定成对)');
  // A9 锚点纯度
  const badA = Object.keys(ANCHOR).filter(function (k) { return cnt(rd(TGT[k]), ANCHOR[k]) !== 1; });
  a(badA.length === 0, 'A9: 破坏锚点在各自目标文件里恰中 1 次(不合 ' + badA.length + ' 个:' + badA.join(',') + ')');
  // A10 装载次序:reasoning 早于 word-budget(word-budget 运行期调 officialOnly;
  //   两者都是运行期调用,装载序不影响正确性 —— 如实记账,不假称已解)
  const LO = (function () {
    const i = I.indexOf('const LOAD_ORDER = [');
    const j2 = I.indexOf('];', i);
    return (i >= 0 && j2 > i) ? (I.slice(i, j2).match(/'engines\/[A-Za-z0-9_\-]+\.js'/g) || []) : [];
  })();
  const posOf = function (rel) { return LO.indexOf("'" + rel + "'"); };
  const iRE = posOf('engines/reasoning.js'), iWB = posOf('engines/word-budget.js');
  a(LO.length > 180 && iRE > 0 && iWB > 0, 'A10a: LOAD_ORDER 切片有效(reasoning #' + iRE + ' / word-budget #' + iWB + ')');
  a(iRE < iWB,
    'A10: reasoning #' + iRE + ' 早于 word-budget #' + iWB + '(消费方晚于真源,装载序自洽)');
  // A11 版本号双落
  a(/const VERSION = '2\.(229|230|231|232|233|234|235|236|237|238|239|240|241|242|243|244|245|246|247|248|249|250|251|252)\.0'/.test(I), 'A11: index.js VERSION 跟上本版（2.229.0 交付基线或更高）');
  a(/ver: '2\.(229|230|231|232|233|234|235|236|237|238|239|240|241|242|243|244|245|246|247|248|249|250|251|252)\.0'/.test(R) && /ver: '2\.(229|230|231|232|233|234|235|236|237|238|239|240|241|242|243|244|245|246|247|248|249|250|251|252)\.0'/.test(PL)
    && /ver: '2\.(229|230|231|232|233|234|235|236|237|238|239|240|241|242|243|244|245|246|247|248|249|250|251|252)\.0'/.test(WB), 'A11b: reasoning / plan / word-budget 的 registerModule 版本跟上');
  /* ══════════════════ B 运行时 ══════════════════ */
  console.log('\n\u25a0 B 运行时:占比五档 / reasoning-only 三态 / 保存四态 / 拟稿两栏');
  (function () {
    const env = env0(); const WA = env.WA; resetSettings(WA);
    // ── E 占比五档 ──
    a(WA.gauge.BAND_BREAKS.join(',') === '20,40,60,80', 'B1: BAND_BREAKS 运行期实为 20/40/60/80');
    const b = function (d, n) { return WA.gauge.bandOf(d, n); };
    const r0 = b(0, 40), r1 = b(8, 40), r2 = b(8.001, 40), r4 = b(32, 40), r5 = b(40, 40);
    a(r0.ok && r0.band === 0 && r0.percent === 0, 'B1b: 0/40 ⇒ 第 0 档(占比 0%)');
    const r19 = b(7.96, 40);
    a(r19.ok && r19.band === 0 && r19.percent === 19.9,
      'B1c: 19.9% 落第 0 档(未到 20% 断点;含等号口径下恰 20% 才落第 1 档)');
    a(r1.band === 1, 'B1d: 恰 20% 落第 1 档(含等号,不落第 0 档)');
    a(r2.ok && r2.band === 1, 'B1e: 20.0025% 仍第 1 档(未到 40%)');
    a(r4.ok && r4.band === 4 && r4.percent === 80, 'B1f: 32/40=80% ⇒ 第 4 档(80 恰在断点上,含等号)');
    a(r5.ok && r5.band === 4 && r5.met === true, 'B1g: 40/40=100% ⇒ 第 4 档且 met(已达)');
    a(b(40, 0).reason === 'bad-need', 'B1h: need=0 ⇒ bad-need(不猜分母 ⇒ 不会恒得 Infinity 档)');
    a(b(NaN, 40).reason === 'bad-diff', 'B1i: diff=NaN ⇒ bad-diff');
    a(b(-5, 40).ok && b(-5, 40).band === 0,
      'B1j: 负 diff 合法且如实落第 0 档(欠账也是读数)');
    a(b(10, 40).ratio === 0.25, 'B1k: ratio 三位小数(0.25,不带浮点尾)');
    // ── B 推理不冒充产出 ──
    const off = WA.reasoning.officialOnly;
    a(off('<reasoning>abc</reasoning>正文').body === '正文', 'B2: 剥掉成对思考标签,只留正文');
    a(off('<reasoning>abc</reasoning>正文').stripped === 26, 'B2b: stripped 如实记被剥掉的字符数');
    a(off('<REASONING>x</REASONING>正文').body === '正文', 'B2c: 大小写不敏感');
    a(off('<reasoning data-x="1">x</reasoning>正文').body === '正文', 'B2d: 允许属性');
    a(off('<thought>x</thought><thinking>y</thinking>正文').body === '正文', 'B2e: 三个标签都剥');
    const ro = off('<reasoning>' + 'x'.repeat(300) + '</reasoning>');
    a(ro.ok === false && ro.reason === 'reasoning-only' && ro.stripped > 0,
      'B2f: 剥完为空 ⇒ reasoning-only(**不**当空串放行)');
    a(off('   ').reason === 'empty-text',
      'B2g: 什么都没剥且本来为空 ⇒ empty-text(与 reasoning-only 分开:没写 vs 只写了思考)');
    a(off(123).reason === 'bad-type', 'B2h: 非字符串 ⇒ bad-type');
    // B3 沙箱装载路径实测(D3 的运行时面):本锁自己就跑在 vm 沙箱里
    a(off('<reasoning>' + 'x'.repeat(500) + '</reasoning>').reason === 'reasoning-only',
      'B3: 沙箱装载路径下剥法仍生效(stripped>0;首版 D3 在此恒 0)');
    // B3b 长度闸门三态
    WA.reasoning.setSettings({ enabled: true, minBodyChars: 120 });
    const cb = function (t) { return WA.reasoning.checkBody(t); };
    a(cb('<reasoning>' + 'x'.repeat(500) + '</reasoning>').reason === 'reasoning-only',
      'B3b: checkBody 对纯思考段报 reasoning-only(此前会按字数放行)');
    a(cb('正文' + '字'.repeat(400)) === null, 'B3c: 正常正文放行(返回 null)');
    a(cb('').reason === 'empty-text', 'B3d: 空正文报 empty-text');
    a(cb('短').reason === 'shortfall', 'B3e: 短正文报 shortfall(与「空」分开)');
    // B3f word-budget 与 reasoning 同一判据
    a(WA.wordBudget.count('<reasoning>' + 'x'.repeat(500) + '</reasoning>').total === 0,
      'B3f: word-budget.count 对纯思考段记 0 字(此前记 523 —— 推理冒充产出)');
    a(WA.wordBudget.count('正文' + '字'.repeat(400)).total === 402,
      'B3g: word-budget.count 对正常正文正常计数(2 + 400 = 402)');
    // ── C 保存四态 ──
    const sv = WA.store.saveStat();
    a(FACES.indexOf(sv.face) >= 0 || sv.face === 'unknown',
      'B4: saveStat().face 落在四态内(或 unknown=未保存过);实 ' + sv.face);
    a(sv.faces.join(',') === 'saved,partial,unconfirmed,failed', 'B4b: faces 四态齐带(读数面自带全集)');
    a(sv.face === 'unknown' || FACES.indexOf(sv.face) >= 0,
      'B4c: 未保存过报 unknown(与 failed 分开 —— 「还没存」不是「存失败」)');
    // 干净落盘实测
    WA.store.transact(function (d) { d.memory = d.memory || {}; }, 'n11:probe');
    const sv2 = WA.store.saveStat();
    a(sv2.face === 'saved' && sv2.ok === true,
      'B4d: 正常保存 ⇒ face=saved(实测 ' + sv2.face + ')');
    a(sv2.faceNote.length > 0, 'B4e: faceNote 非空(四态各自有人话说明)');
    // 配额救援路径:把 setItem 打成配额错误,救援成功 ⇒ 必须 partial
    (function () {
      const ls = global.localStorage;
      // 夹具: 先造可回收键(过期诊断 + 孤儿恢复点)——否则 sweepStaleKeys 无可回收键,
      //   __rescueQuota 必然走 if (!removed) return false,救援失败 ⇒ face 停在 failed(与产品行为无关,是用例没给现场)。
      ls.setItem('worldaxis_event_log_cold300', 'x'.repeat(3000));
      ls.setItem('worldaxis_recovery_dead300', '[]');
      const orig = ls.setItem;
      let first = true;
      ls.setItem = function (k, v) {
        if (first && String(k).indexOf('worldaxis_state') >= 0) { first = false; const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
        return orig.apply(ls, arguments);
      };
      WA.store.transact(function (d) { d.memory = d.memory || {}; d.memory.facts = []; }, 'n11:quota');
      const sv3 = WA.store.saveStat();
      ls.setItem = orig;
      a(sv3.face === 'partial',
        'B4f: 配额救援成功 ⇒ face=partial(「丢了东西才落盘」不再显示成干净成功;实 ' + sv3.face + ')');
      a(sv3.ok === true, 'B4g: 救援成功仍返回 true(partial 是**落盘质量**读数,不是把成功改判成失败)');
    })();
    // 写后读回校验失败 ⇒ unconfirmed
    (function () {
      const ls = global.localStorage;
      const origGet = ls.getItem;
      ls.getItem = function (k) {
        const v = origGet.apply(ls, arguments);
        if (String(k).indexOf('worldaxis_state') >= 0 && v && v.length > 10) return v.slice(0, Math.floor(v.length / 2));
        return v;
      };
      WA.store.transact(function (d) { d.memory = d.memory || {}; }, 'n11:verify');
      const sv4 = WA.store.saveStat();
      ls.getItem = origGet;
      a(sv4.face === 'unconfirmed',
        'B4h: 写后读回校验失败 ⇒ face=unconfirmed(**不**读成成功,也不读成失败;实 ' + sv4.face + ')');
    })();
    // ── D 计划不冒充事实 ──
    a(WA.plan.review(' nobody ').reason === 'no-plan', 'B5: 无计划 ⇒ no-plan(不造一条空计划)');
    WA.plan.setSettings({ enabled: true });
    WA.store.transact(function (d) {
      d.people = d.people || {};
      d.people['p_测试人'] = { id: 'p_测试人', name: '测试人' };
      d.people['p_测试人'].life = { goals: [{ id: 'g1', text: '攒路费', status: 'active', next: '' }] };
    }, 'n11:person');
    const ex = WA.plan.expand('测试人', 'g1', [
      { kind: 'work', text: '去码头搬货' },
      { kind: 'work', text: '攒够路费', after: '0' },
      { kind: 'move', text: '搭船走', after: '1' }
    ]);
    a(ex.ok === true, 'B5b: 计划展开成功(三步)');
    const rv0 = WA.plan.review('测试人');
    a(rv0.ok && rv0.asFact === false, 'B5c: review 恒带 asFact:false');
    a(rv0.draft.length === 3 && rv0.settled.length === 0,
      'B5d: 三步全是拟稿、零事实(刚展开,一步都没结算)');
    WA.plan.advance('测试人');
    WA.plan.settle('测试人', 'done', { reason: '' });
    const rv1 = WA.plan.review('测试人');
    a(rv1.settled.length === 1 && rv1.settled[0].seq === 0, 'B5e: 结算一步后,settled 栏只收那一步');
    a(rv1.draft.length === 2, 'B5f: 其余两步仍是拟稿(不得因为结算了一步就把整条计划当事实)');
    WA.plan.advance('测试人');   // settle 只结算 running 那一步;不 advance 则落 not-running
    WA.plan.settle('测试人', 'blocked', { reason: '下雨' });
    const rv2 = WA.plan.review('测试人');
    a(rv2.settled.length === 2 && rv2.settled[1].reason === '下雨',
      'B5g: blocked 也是已结算(事实栏),且原因照实带出');
    // 面板复核按钮端到端
    (function () {
      const env2 = gate.fresh({});
      const dom = env2.dom, WA2 = env2.WA;
      // 计划 UI 实渲染在 people 页(与 tool-diag 的 UI_BINDINGS 同源:计划系列登记在 page: 'people')。
      WA2.plan.setSettings({ enabled: true });
      WA2.store.transact(function (d) {
        d.people = d.people || {};
        d.people['p_复核人'] = { id: 'p_复核人', name: '复核人' };
        d.people['p_复核人'].life = { goals: [{ id: 'g1', text: '攒路费', status: 'active', next: '' }] };
      }, 'n11:b6');
      WA2.plan.expand('复核人', 'g1', [{ kind: 'work', text: '去码头搬货' }]);
      const el = dom.getElementById('wa-panel');
      const tab = el.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'people'; })[0];
      tab.click();
      const whoEl = dom.getElementById('wa-plan-person'); if (whoEl) whoEl.value = '复核人';
      const b = dom.getElementById('wa-plan-review');
      a(!!b && typeof b.onclick === 'function', 'B6: 面板「复核拟稿」按钮在场且可点');
      b.onclick({ target: b });
      const o = dom.getElementById('wa-plan-out');
      const txt = String(o ? (o.innerHTML || o.textContent || '') : '');
      a(txt.indexOf('事实') >= 0 && txt.indexOf('拟稿') >= 0, 'B6b: 按钮输出把「事实」与「拟稿」两栏都摆出来');
      a(txt.indexOf('asFact=false') >= 0, 'B6c: 输出带 asFact=false(拟稿非事实)');
    })();
  })();
  /* ══════════════════ C 零泄漏 ══════════════════ */
  console.log('\n\u25a0 C 零泄漏:本轮四模块都不新增世界状态');
  (function () {
    const env = env0(); const WA = env.WA; resetSettings(WA);
    const before = Object.keys(WA.store.get()).sort().join(',');
    WA.gauge.bandOf(10, 40);
    WA.reasoning.officialOnly('<reasoning>x</reasoning>y');
    WA.plan.review('不存在的人');
    WA.store.saveStat();
    const after = Object.keys(WA.store.get()).sort().join(',');
    a(before === after, 'C1: 四个只读面都不新增世界顶层键(实 ' + after + ')');
    a(WA.reasoning.stat().directives === 0, 'C2: 关开关时 directive 不产约束(零 token 占用)');
  })();
  /* ══════════════════ N 负控制 ══════════════════ */
  console.log('\n\u25a0 N 负控制:四处真源码破坏 → 装载破坏副本 → 重跑同款判据');
  runNeg(a, G, R, PL, ST, SELF);
}
/** 把破坏后的源码装进 srcOverride 的 env。 */
function negEnv(ov) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh({ srcOverride: ov });
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  resetSettings(env.WA);
  env.WA.store.init();
  return env;
}
function runNeg(a, G, R, PL, ST, SELF) {
  function brk(src, anchor) {
    const n = cnt(src, anchor);
    if (n !== 1) throw new Error('anchor hits=' + n);
    return src.replace(anchor, '>> CUT <<');
  }
  const ANCH = {
    bandDecl: "\n  const BAND_BREAKS = [20, 40, 60, 80];",
    thinkRe: "\n  const THINK_TAG_RE = [\n"
    + "    /<reasoning(?:\\s[^>]*)?>[\\s\\S]*?<\\/reasoning>/i,\n"
    + "    /<thought(?:\\s[^>]*)?>[\\s\\S]*?<\\/thought>/i,\n"
    + "    /<thinking(?:\\s[^>]*)?>[\\s\\S]*?<\\/thinking>/i\n  ];",
    faceSaved: "        __saveStat.face = 'saved';",
    reviewFn: "\n  function review(personName) {",
  };
  // N0 锚点纯度
  a(cnt(G, ANCH.bandDecl) === 1 && cnt(R, ANCH.thinkRe) === 1
    && cnt(ST, ANCH.faceSaved) === 1 && cnt(PL, ANCH.reviewFn) === 1,
    'N0: 四处破坏锚点各恰 1 次(纯度)');
  // N1 E:砍掉一个断点 ⇒ 占比档位必变
  (function () {
    const G2 = G.replace(ANCH.bandDecl, "\n  const BAND_BREAKS = [20, 40, 80];");
    a(G2 !== G, 'N1a: 破坏可落地');
    const WA = negEnv({ 'engines/gauge.js': G2 }).WA;
    resetSettings(WA);
    const r = WA.gauge.bandOf(32, 40);
    a(r.band !== 4,
      'N1b: 砍掉 60 断点后 80% 落不到第 4 档(原版为 4 ⇒ 两向自证「断点真的在判」)');
  })();
  // N2 B:把字面量表拆成动态拼接、且元字符**漏一层转义** ⇒ 剥法必失效(D3 原形)
  (function () {
    const R2 = R.replace(ANCH.thinkRe,
      // 元字符只写一层反斜杠('\\s' 而非 '\\\\s'):编译期不报错,但正则里变成字面 's' ⇒ 一条不匹配。
      "\n  const THINK_TAG_RE = ['reasoning', 'thought', 'thinking'].map(function (t) { return new RegExp('<' + t + '(?:\\s[^>]*)?>[\\s\\S]*?</' + t + '>', 'gi'); });");
    a(R2 !== R && R2.indexOf('new RegExp(') >= 0, 'N2a: 破坏可落地(拆成动态构造)');
    const WA = negEnv({ 'engines/reasoning.js': R2 }).WA;
    resetSettings(WA);
    const r = WA.reasoning.officialOnly('<reasoning>abc</reasoning>正文');
    a(r.stripped === 0,
      'N2b: 破坏版上 stripped 恒 0(D3 原形复现 ⇒ 两向自证「字面量表」真的必要)');
    a(r.body.indexOf('<reasoning>') >= 0, 'N2c: 破坏版上思考段没被剥掉(推理冒充产出)');
  })();
  // N3 C:把 face 判等改成只读 ok ⇒ 有损落盘必被显示成干净成功
  (function () {
    const ST2 = ST.replace(ANCH.faceSaved, "        __saveStat.face = 'saved'; /* N3 破坏:不再区分 partial */");
    a(ST2 !== ST, 'N3a: 破坏可落地');
    const WA = negEnv({ 'core/store.js': ST2 }).WA;
    resetSettings(WA);
    const ls = global.localStorage; const orig = ls.setItem; let first = true;
    ls.setItem = function (k, v) {
      if (first && String(k).indexOf('worldaxis_state') >= 0) { first = false; const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      return orig.apply(ls, arguments);
    };
    WA.store.transact(function (d) { d.memory = d.memory || {}; d.memory.facts = []; }, 'n11:neg3');
    const sv = WA.store.saveStat();
    ls.setItem = orig;
    a(sv.face !== 'partial',
      'N3b: 破坏版上有损落盘读不出 partial(原版能 ⇒ 两向自证「四态」真的在判)');
  })();
  // N4 D:把 draft 栏判空 ⇒ 拟稿不再被分开摆
  (function () {
    const PL2 = PL.replace(ANCH.reviewFn,
      "\n  function review(personName) {\n    return { ok: false, reason: 'no-plan' };   // N4 破坏:读数面恒 no-plan");
    a(PL2 !== PL, 'N4a: 破坏可落地');
    const WA = negEnv({ 'engines/plan.js': PL2 }).WA;
    resetSettings(WA);
    WA.plan.setSettings({ enabled: true });
    WA.store.transact(function (d) {
      d.people = d.people || {};
      d.people['p_破坏人'] = { id: 'p_破坏人', name: '破坏人' };
      d.people['p_破坏人'].life = { goals: [{ id: 'g1', text: '攒路费', status: 'active', next: '' }] };
    }, 'n11:neg4p');
    const ex = WA.plan.expand('破坏人', 'g1', [{ kind: 'work', text: '搬货' }, { kind: 'work', text: '攒钱', after: '0' }]);
    a(ex.ok === true, 'N4b: 破坏版上计划仍能展开(只坏读数面)');
    const rv = WA.plan.review('破坏人');
    a(rv.ok === false,
      'N4c: 破坏版上 review 恒 no-plan(原版给出 settled/draft 两栏 ⇒ 两向自证)');
  })();
  // N5 工具两向自证
  let threw = false;
  try { brk(G, 'THIS-DOES-NOT-EXIST-N11'); } catch (e) { threw = e.message === 'anchor hits=0'; }
  a(threw, 'N5: 锚点不存在必须抛(不静默 0 命中)');
  threw = false;
  try { brk(G, 'const '); } catch (e) { threw = /anchor hits=\d+/.test(e.message) && e.message !== 'anchor hits=1'; }
  a(threw, 'N5b: 锚点不唯一必须抛');
  // N6 真源码逐字未变
  a(rd(GAUGE_REL) === G && rd(REASON_REL) === R && rd(PLAN_REL) === PL && rd(STORE_REL) === ST,
    'N6: 被破坏过的四个文件真源码逐字未变');
  a(G.indexOf('>> CUT <<') < 0 && R.indexOf('>> CUT <<') < 0
    && PL.indexOf('>> CUT <<') < 0 && ST.indexOf('>> CUT <<') < 0,
    'N6b: 四个真源码里都没有 CUT 标记');
}
function runAllCli(a) { runAll(a); }
module.exports = { runAll: runAll };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name, extra) {
    if (ok) { pass++; }
    else { fail++; console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
  };
  try { runAll(a); } catch (e) { fail++; console.log('  \u2717 判据失效:' + (e && e.stack)); }
  console.log('\nS3-B4-N11-V2229: ' + pass + ' / 失败 ' + fail);
process.exit(fail > 0 ? 1 : 0);
}

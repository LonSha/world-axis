#!/usr/bin/env node
/**
 * v2.568.0 专锁：超期 pending-wire 的「不接」裁决（第一批 4 台 + 第二批 13 台，共 17 条）
 *
 * ── 治什么病 ───────────────────────────────────────────────────────
 *  tests/ns-consumer-ledger.json 的纪律⑤：「pending-wire 是**有时限**的定性。若某条超过一个
 *  版本周期仍无人读，必须改判 stale（进 dead-export-ledger）或补消费点，不许靠改 evidence 续命。」
 *  这四条长期停在 pending-wire：既不能接（没有上游契约），也不是 stale（tests 在读）。
 *  但「为什么不接」当时只写在 evidence 文字里 —— 文字不是判据：下一个人改一行代码就能把
 *  「结构上不可接」变成「已接」，而账本照样看着一致。本锁把四条理由钉成可复算读数。
 *
 * ── 判据纪律 ───────────────────────────────────────────────────────
 *  A 账本面：四条均在账本、cls 已改判 readonly-api、evidence 是实质理由且写明「改判触发器」。
 *  B 零读事实：产品源面（engines/render/core/ui/index.js）除自身 provider 文件外零引用；
 *               且 tests 面至少有一处消费（有 tests 消费 ⇒ 不是 stale）。
 *  C 结构理由可复算：四条「为什么不可接」各自一条真源码判据（plan 无上游 / 无起止标记 /
 *               无宏替换点 / 世界书全 constant）。这四条是**接线的阻断条件本身**，
 *               任何一条被解开，本锁立刻红，逼着改账本而不是悄悄多一个读点。
 *  D 负控：拿账本文本的**内存副本**制造破坏（cls 回改 pending-wire / evidence 截短 ⇒
 *               A 面判据必须各自点名），证明 A 面不是空转。
 *  E 触发器可执行：每条 recompute 是真命令且其引用的文件/路径存在。
 *
 * ── 第二批（同版本、同为清账） ────────────────────────────────────────
 *  剩余 13 条 pending-wire 一并改判 readonly-api，pending-wire 归零：
 *  cardFile / chatGuard / contrast / factAge / floorCensus / floorFavorites / floorHide /
 *  floorScrub / saveMigrate / setupPlan / slotFormat / storeMerge / streamGate。
 *  这 13 条**不是同一句话的复制**：每台的结构阻断形态不同，判据也不同——
 *  cardFile 没有 FileReader/arrayBuffer（拿不到 Blob）；chatGuard 零 loadChat（拿不到磁盘那份）；
 *  contrast 主题色是字面常量（无运行时配色输入，且 render/inject.js 里的 contrast( 全是
 *  WA.theme.contrast，属命名撞车）；factAge 要的 f.lastTurn 全库无人写（upsertFact 只写 at）；
 *  floorCensus 零 sentFloors；floorFavorites 零 getChatMessages（拿不到整份楼层数组）；
 *  floorHide 零处写 is_hidden；floorScrub 进不了 story-export；saveMigrate 与 store.js 载入期
 *  migrate 双写；setupPlan 零卡切换钩子；slotFormat 零处用存档位命名；storeMerge 的七分区
 *  本仓不持有（且 store.js 已有 storage 钩子）；streamGate 产品面零 fetch 覆写。
 *  对应判据在 C5~C17，逐台一条。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

const LEDGER = 'tests/ns-consumer-ledger.json';
const CASES = [
  // v2.613.0（R288）：arcGuide 已从本表**出表** —— 它不再是零读 ns。
  //   v2.591.0（R266 / NAR-1）的引导弧落地把它接活了：`engines/arc-guide-bridge.js` 里
  //   `const G = WA.arcGuide;` 之后真调 plan / keysOf / windowOf，产品面第一次有读者，
  //   按纪律④从 ns-consumer-ledger 销行。本锁当时的判据（C1a「产品面无 arcGuide.plan 调用点」）
  //   因此变成恒假 —— 而它又拿账本条目做 A/D 段取样，于是整把锁在 `entries.arcGuide` 上崩掉
  //   （v2.611.0 前就崩，读数上「崩掉」与「绿」一样不用人看）。治法不是把它塞回账本，
  //   而是把 C1 改成守住**毕业后的形态**（见 C1a/C1b）。
  { ns: 'ctxBoundary', prov: 'engines/ctx-boundary.js' },
  { ns: 'macroGuard', prov: 'engines/macro-guard.js' }
];

/** 第二批 13 条：产品源面除自身零读 + tests 有消费 + 上游结构缺失。contrast 的 allowProd 是命名撞车豁免。 */
const CASES2 = [
  { ns: 'cardFile', prov: 'engines/card-file.js' },
  { ns: 'chatGuard', prov: 'engines/chat-guard.js' },
  { ns: 'floorCensus', prov: 'engines/floor-census.js' },
  { ns: 'floorFavorites', prov: 'engines/floor-favorites.js' },
  { ns: 'floorHide', prov: 'engines/floor-hide.js' },
  { ns: 'floorScrub', prov: 'engines/floor-scrub.js' },
  { ns: 'saveMigrate', prov: 'engines/save-migrate.js' },
  { ns: 'setupPlan', prov: 'engines/setup-plan.js' },
  { ns: 'storeMerge', prov: 'engines/store-merge.js' },
  { ns: 'streamGate', prov: 'engines/stream-gate.js' }
];
// v2.613.0（R288）：三条已毕业 —— 桥落地后按纪律④从零读账本出表，本表不再把它们当零读项。
//   同 C1a/C1b 的道理：销行是账本的正确状态，锁不能拿一条已不存在的登记当取样点（那会崩或假红）。
//   但毕业也要有判据：读点真的在桥上、账本里真的没有它们。
const GRADUATED = [
  { ns: 'contrast', reader: 'engines/contrast-bridge.js', why: 'v2.599.0 / R274 CNT-1：按 CSS 变量对算 WCAG' },
  { ns: 'factAge', reader: 'engines/fact-age-bridge.js', why: 'v2.596.0 / R269 FAG-1：事龄读数面成产品' },
  { ns: 'slotFormat', reader: 'engines/byte-budget-bridge.js', why: 'v2.598.0 / R273 SLT-1：字节预算真的用它的常量' }
];
const CASES_ALL = CASES.concat(CASES2);

function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function exists(rel) { try { return fs.existsSync(path.join(BASE, rel)); } catch (e) { return false; } }

/** 产品源面（与 module-cycle-gate 同口径：core/engines/ui/render + 入口）。 */
function productFiles() {
  const out = [];
  ['engines', 'render', 'core', 'ui'].forEach(function (sub) {
    const d = path.join(BASE, sub);
    if (!fs.existsSync(d)) return;
    fs.readdirSync(d).forEach(function (f) { if (/\.js$/.test(f)) out.push(sub + '/' + f); });
  });
  out.push('index.js');
  return out;
}
function testFiles() {
  const d = path.join(BASE, 'tests');
  return fs.readdirSync(d).filter(function (f) { return /\.js$/.test(f); }).map(function (f) { return 'tests/' + f; });
}
/** 引用形态：WA.<ns> / G.<ns> / mm.wa.<ns> / mm.WA.<ns> / 点号成员调用。 */
function nsRe(ns) {
  return new RegExp('\\b(?:WA|G|mm\\.wa|mm\\.WA)\\.' + ns + '\\b|\\.' + ns + '\\s*\\(');
}
/** 剥注释（块 + 行）：只为让「{{ 只出现在 JSDoc」这类判断不被注释噪音误导。 */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function runAll(assertFn) {
  let pass = 0, fail = 0;
  const fails = [];
  const a = function (ok, name) {
    if (ok) pass++; else { fail++; fails.push(name); }
    if (typeof assertFn === 'function') assertFn(ok, name);
  };

  // ── A 账本面 ──
  const ledger = JSON.parse(rd(LEDGER));
  const E = ledger.entries || {};
  CASES_ALL.forEach(function (c) {
    const e = E[c.ns];
    a(!!e, 'A1 ' + c.ns + ' 在账本里（缺失=未定性）');
    if (!e) return;
    a(e.cls === 'readonly-api', 'A2 ' + c.ns + ' cls 已改判 readonly-api（实 ' + e.cls + '）');
    a((e.evidence || '').length >= 200, 'A3 ' + c.ns + ' evidence 是实质理由（>=200 字，实 ' + (e.evidence || '').length + '）');
    a(/改判触发器/.test(e.evidence || ''), 'A4 ' + c.ns + ' evidence 写明改判触发器（不是一句「待接」）');
    a(/^(grep|node|sed|ls|cat)\b/.test(e.recompute || ''), 'A5 ' + c.ns + ' recompute 是可执行命令');
    a((e.recompute || '').indexOf(c.prov) >= 0, 'A6 ' + c.ns + ' recompute 指向自身 provider（可复算到源头）');
  });

  // ── B 零读事实 ──
  const prod = productFiles();
  const tsts = testFiles();
  CASES_ALL.forEach(function (c) {
    const rx = nsRe(c.ns);
    const prodHit = prod.filter(function (rel) {
      if (rel === c.prov) return false;
      if ((c.allowProd || []).indexOf(rel) >= 0) return false;
      return rx.test(rd(rel));
    });
    a(prodHit.length === 0, 'B1 ' + c.ns + ' 产品源面零读（除自身外命中：' + (prodHit.join(',') || '无') + '）');
    const testHit = tsts.filter(function (rel) { return rx.test(rd(rel)); });
    a(testHit.length >= 1, 'B2 ' + c.ns + ' tests 面有消费（' + testHit.length + ' 处）⇒ 不是 stale（stale 要求连 tests 都零读）');
  });

  // ── C 结构理由可复算 ──
  // C1 arcGuide：无产品级 plan 调用点；且 arc-phase.js 明文写着拒接。
  //   口径：注释里写着「不接 arcGuide.plan()」**不算调用点**，故先剥注释再判（这是本锁第一版
  //   踩过的坑：不剥注释时 arc-phase.js 的拒接理由本身把判据打红）。
  const prodNoSelf = prod.filter(function (r) { return r !== 'engines/arc-guide.js'; })
    .map(function (r) { return stripComments(rd(r)); }).join('\n');
  a(/\bWA\.arcGuide\b/.test(prodNoSelf),
    'C1a arcGuide 已有真产品面读者（arc-guide-bridge 读 WA.arcGuide）—— 本锁立起时的「无上游」前提已解除');
  a(!E.arcGuide,
    'C1b 账本里**没有** arcGuide 条（按纪律④已出表；它再以零读身份回去就是本锁要报的病）');
  // C2 ctxBoundary：注入面不往正文写带起止标记的块；DEFAULTS 无规则。
  const inj = rd('render/inject.js');
  a(inj.indexOf('<!-- wa') < 0 && inj.indexOf('【幕后】') < 0,
    'C2a render/inject.js 无【幕后】/<!-- wa 之类起止标记（无物可剥）');
  //   口径：只判 DEFAULTS 对象字面量里没有 rules 键（第一版用 /rules\s*:\s*\[/ 会命中
  //   `rules === undefined ? [] : [...]` 这种三元表达式 —— 那是运行时取值，不是内置规则）。
  const cbDef = (rd('engines/ctx-boundary.js').match(/const DEFAULTS = \{([^}]*)\}/) || [])[1] || '';
  a(cbDef.length > 0 && cbDef.indexOf('rules') < 0,
    'C2b ctx-boundary 的 DEFAULTS 里没有任何内置规则（规则必须由调用方给）');
  // C3 macroGuard：产品源面**没有宏值替换实现**（宿主替换发生在本仓之外）。
  //   口径：不是「零 {{」。本仓确实在不只一处文本里**提到** {{char}} / {{user}}（例如
  //   health-preflight 的拦截提示词、proactive 的强制指令台词），那是提示词内容，不是替换代码。
  //   真正要判的是「有没有把 {{x}} 换成值的实现」，形态即 `.replace(` 的参数里含 {{。
  const macroHits = prod.filter(function (rel) {
    if (rel === 'engines/macro-guard.js') return false;
    return /\.replace\([^)]{0,60}\{\{/.test(stripComments(rd(rel)));
  });
  a(macroHits.length === 0, 'C3 产品源面无 {{ 值替换实现（命中：' + (macroHits.join(',') || '无') + '）');
  // C4 greenKeys：两处世界书写点全 constant；全仓零 selective。
  a(/type:\s*'constant'/.test(rd('engines/wb-inject.js')) && /keys:\s*\[\]/.test(rd('engines/wb-inject.js')),
    'C4a wb-inject 写条目用 constant + keys:[]（恒常驻，不靠关键词激活）');
  a(/type:\s*'constant'/.test(rd('engines/outline-inject.js')) && /keys:\s*\[\]/.test(rd('engines/outline-inject.js')),
    'C4b outline-inject 同上（两处写点同策略）');
  const selHits = prod.filter(function (rel) { return /type:\s*'selective'/.test(rd(rel)); });
  a(selHits.length === 0, 'C4c 宿主条目策略面：全仓无 type:selective（本仓从不写内容条目，只写变量镜像槽；命中：' + (selHits.join(',') || '无') + '）');
  //   C4d（v2.568.0 第二主线）：greenKeys **已出表** —— 它现在有真的产品消费点
  //   （engines/worldbook.js 的 constGate 用它给常驻条目派生短键）。账本里再留着它就是过期登记。
  a(!E.greenKeys, 'C4d greenKeys 已从账本注销（账本说零读、现场已读，留着就是过期登记）');
  a(rd('engines/worldbook.js').indexOf('deriveGreenKeys') >= 0,
    'C4e greenKeys 的消费点真在产品面（worldbook.constGate 调 deriveGreenKeys，不是只写在注释里）');

  // ── C' 第二批 13 条：每台一条真源码判据（阻断条件本身，解开即红） ──
  // 口径：z(re, ex) = 「产品源面除 ex 外零命中」。ex 只放本台自身 provider
  //   与已证实的命名撞车位置（contrast 用 render/inject.js 里的 WA.theme.contrast）。
  const noHit = function (re, ex) {
    return prod.filter(function (rel) {
      if ((ex || []).indexOf(rel) >= 0) return false;
      return re.test(rd(rel));
    });
  };
  const z = function (re, ex) { return noHit(re, ex).length === 0; };
  a(z(/FileReader|arrayBuffer/, ['engines/card-file.js']),
    'C5 cardFile：产品面无文件读取原语 ⇒ 拿不到 Blob/字节（导入由宿主完成）');
  a(z(/loadChat/, ['engines/chat-guard.js']),
    'C6 chatGuard：产品面零 loadChat ⇒ 拿不到磁盘那份的条数/内容，硬接只能靠猜');
  const th = rd('ui/cyberpunk-theme.js');
  a(th.indexOf('#0f1419') >= 0 && th.indexOf('#e2e8f0') >= 0,
    'C7a contrast：主题色是 cyberpunk-theme 里的字面常量 ⇒ 无运行时配色输入');
  const injTxt = rd('render/inject.js');
  const cAll = (injTxt.match(/contrast\s*\(/g) || []).length;
  const cTheme = (injTxt.match(/theme\.contrast\s*\(/g) || []).length;
  a(cAll > 0 && cAll === cTheme,
    'C7b render/inject.js 里的 contrast( 全是 WA.theme.contrast（命名撞车，不是本引擎读点）：' + cTheme + '/' + cAll);
  const upBody = (rd('engines/memory.js').match(/facts\.push\(\{[^}]*\}\)/g) || []).join('');
  a(upBody.length > 0 && upBody.indexOf('lastTurn') < 0,
    'C8 factAge：memory.upsertFact 写入的字段里没有 lastTurn（只有 at）⇒ 「上次引用第几轮」无人生产');
  a(z(/sentFloors/, ['engines/floor-census.js']),
    'C9 floorCensus：产品面零 sentFloors ⇒ 「哪些楼层发出去过」在宿主 picker 里');
  a(z(/getChatMessages|getChat\(\)/, ['engines/floor-favorites.js']),
    'C10 floorFavorites：本仓零处取整份楼层数组（楼层只在回调里以单条 mes 到来）⇒ 收藏无处锚定');
  a(z(/is_hidden\s*=[^=]/, ['engines/floor-hide.js']),
    'C11 floorHide：本仓零处写 is_hidden ⇒ 隐藏标记只能宿主改，本仓只能出计划');
  a(rd('engines/story-export.js').indexOf('floorScrub') < 0,
    'C12 floorScrub：story-export 不经楼层清洗面 ⇒ 规则与落笔都在调用方');
  a(rd('core/store.js').indexOf('migrate') >= 0 && z(/WA\.saveMigrate/, ['engines/save-migrate.js']),
    'C13 saveMigrate：core/store.js 载入期自带 migrate ⇒ 外挂迁移器会双写');
  a(z(/CARD_SWITCH|cardSwitch|onCardSwitch/),
    'C14 setupPlan：产品面零卡切换钩子（CHAT_CHANGED 是聊天切换，不是进卡/离卡）');
  a(z(/【WA存档·/, ['engines/slot-format.js']),
    'C15 slotFormat：本仓零处使用存档位命名 ⇒ 没有「第 N 檔」这个实体');
  a(z(/regexOwners|presetInfo|pluginInfo|worldSources/, ['engines/store-merge.js']),
    'C16a storeMerge：那七个 settings.json 分区只有它自己在念（本仓不持有）');
  a(/addEventListener\(\s*['"]storage/.test(rd('core/store.js')),
    'C16b 跨标签页冲突已由 core/store.js 的 storage 钩子处理 ⇒ 不在合并器这层');
  a(z(/(?:window|globalThis|self)\.fetch\s*=/),
    'C17 streamGate：产品面零 fetch 覆写 ⇒ 流中无本仓入口（净化在流后）');

  // ── D 负控（账本文本的内存副本破坏） ──
  const good = rd(LEDGER);
  //   v2.613.0：取样键从 arcGuide 换成 ctxBoundary —— 前者已出表（见 C1b），负控不能拿一条
  //   账本里不存在的条目做破坏；ctxBoundary 仍在册、cls=readonly-api，形态不变。
  const bad1 = good.replace(/("ctxBoundary"\s*:\s*\{[^{}]{0,80}?"cls"\s*:\s*)"readonly-api"/, '$1"pending-wire"');
  //   v2.569.0 修正：这里原先钉的是**带缩进的字面串**（`"arcGuide": {\n   "cls": …` 三个空格），
  //   本批账本经手改判后格式统一成了两空格缩进，于是「破坏」当场落空 ⇒ D1 红。
  //   这正是判据自己写在下面的那条纪律（「不依赖文本缩进形态，避免缩进一变负控就假绿」）
  //   被违反 —— 现在改成缩进无关的正则：只要求 arcGuide 块内**第一个** cls 字段。
  a(bad1 !== good, 'D1 负控自证：副本破坏确实改到了文本（否则 D2 恒真）');
  const Lbad = JSON.parse(bad1);
  a(Lbad.entries.ctxBoundary.cls === 'pending-wire', 'D2 负控：cls 回改成 pending-wire ⇒ A2 判据必须现形');
  //   负控 D2：cls 回改成 pending-wire ⇒ A2（cls === 'readonly-api'）必须现形。
  //   负控 D3：evidence 截短 ⇒ A3（>=200 字）必须现形。
  //   两处都走**对象副本**：D1 已单独证明文本副本能被改到，这里只需证明「判据表达式在坏数据
  //   上返 false」——即判据不是恒真装饰。不依赖文本缩进形态，避免缩进一变负控就假绿。
  const o2 = JSON.parse(good);
  o2.entries.macroGuard.evidence = '待接';
  a(!((o2.entries.macroGuard.evidence || '').length >= 200),
    'D3 负控：evidence 截短 ⇒ A3（>=200 字）判据必须现形');
  //   D4~D6：C' 面三条主判据拿「真有」的样本自证不是恒假。
  a(/FileReader/.test('var r = new FileReader();'),
    'D4 负控自证：C5 判据对「真有 FileReader」的样本返 true（非恒假）');
  a(/(?:window|globalThis|self)\.fetch\s*=/.test('window.fetch = wrap;'),
    'D5 负控自证：C17 判据对「真覆写 fetch」的样本返 true');
  a(/is_hidden\s*=[^=]/.test('m.is_hidden = true;'),
    'D6 负控自证：C11 判据对「真写 is_hidden」的样本返 true');
  const o3 = JSON.parse(good);
  o3.entries.streamGate.cls = 'pending-wire';
  a(!(o3.entries.streamGate.cls === 'readonly-api'),
    'D7 负控：13 条里任一台（streamGate）cls 回改 ⇒ A2 判据必须现形');

  // ── E 触发器可执行 ──
  CASES_ALL.forEach(function (c) {
    const e = E[c.ns];
    const files = ((e && e.recompute) || '').match(/(?:engines|tests|render|core|ui)\/[\w./-]+\.js/g) || [];
    a(files.length >= 1 && files.every(exists),
      'E1 ' + c.ns + ' recompute 里引用的路径全部存在（' + (files.join(' ') || '无') + '）');
  });

  // ── F 清账面 ──
  const pend = Object.keys(E).filter(function (k) { return E[k].cls === 'pending-wire'; });
  a(pend.length === 0, 'F1 账本里 pending-wire 已归零（实 ' + pend.length + ' 条：' + pend.join(',') + '）');
  a(CASES2.every(function (c) { return (E[c.ns] || {}).cls === 'readonly-api'; }),
    'F2 13 条 cls 全为 readonly-api');
  a(CASES2.every(function (c) { return exists(c.prov); }), 'F3 13 条 provider 文件都存在');
  a(CASES2.length === 10, 'F4 第二批 10 条在册（13 − 3 已毕业：contrast / factAge / slotFormat）');
  GRADUATED.forEach(function (g) {
    a(!E[g.ns], 'F5 ' + g.ns + ' 已从零读账本出表（毕业：' + g.why + '）');
    a(fs.readFileSync(path.join(BASE, g.reader), 'utf8').indexOf('WA.' + g.ns) >= 0,
      'F6 ' + g.ns + ' 的毕业读点真在 ' + g.reader + ' 里（销行是真接线，不是销账）');
  });

  return { pass: pass, fail: fail, fails: fails };
}

if (require.main === module) {
  const r = runAll(null);
  if (r.fail === 0) { console.log('NS-ADJUDICATION-V2568: pass（' + r.pass + ' 项）'); process.exit(0); }
  console.error('NS-ADJUDICATION-V2568: 通过 ' + r.pass + ' / 失败 ' + r.fail);
  r.fails.forEach(function (f) { console.error('  x ' + f); });
  process.exit(1);
}
module.exports = { runAll: runAll, CASES: CASES, CASES2: CASES2 };

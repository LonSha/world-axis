#!/usr/bin/env node
// WorldAxis tests/stitch-nekotools-v2529.js — nekotools 缝合批专锁（10 件）
//
// 治的病：本批从 Catguantou/nekotools（v2.0.8，ESM，无单测）缝入 10 件——
//   7 件 A 级（真功能面）：api-vault / floor-favorites / story-export / floor-scrub /
//                          mixed-index / floor-hide / stream-gate
//   3 件 B 级（只借纪律）：slot-format / green-keys / write-serial
//   缝合前全仓清点确认这些面**一个都没有**（楼层收藏 0 命中、纯正文导出 0 命中、
//   楼层文本清洗 0 命中、写回串行 0 命中），所以生病的是「缺面」本身：
//   病一旦落地就会被当成正常行为，事后没人分得清这是缺陷还是设计。
//
// 本锁钉住「缝进来的东西真的按它自己写的判据在动」：
//   A 现场：装载面（10 件都能装、都登记、双登记进两张表、都进零读定性账本）
//           + 每件 2 条行为判据（接口真的做它说的事）。
//   B 负控制：每件一处**真破坏现场取值**（改源码常量/分支，同一套断言必须翻红）。
//             破坏锚点未命中同样记红 —— 否则「负控制跑过了」是假读数。
//   C 真跑：三件跨函数协同（parseRules→apply 直通、slotName→parseSlotName→isSlotOf、
//           serial 队列失败不卡死）。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function a(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); return true; }
  fail++;
  console.log('  ✗ ' + name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)));
  return false;
}
const RD = function (rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); };

const FILES = ['api-vault', 'floor-favorites', 'story-export', 'floor-scrub', 'mixed-index',
  'floor-hide', 'stream-gate', 'slot-format', 'green-keys', 'write-serial'];

// 沙箱：window 就是「浏览器窗口」那一层（引擎里 win() = WA.mainWin || window）
function mkWin() {
  const w = {
    console: { log: function () {}, warn: function () {}, error: function () {} },
    indexedDB: null, isSecureContext: false, crypto: { subtle: {} }
  };
  return w;
}
function mkSandbox() {
  const win = mkWin();
  const sb = {
    window: win,
    console: win.console,
    Promise: Promise, Date: Date, JSON: JSON, Math: Math, Object: Object, Array: Array,
    String: String, Number: Number, Boolean: Boolean, Set: Set, Map: Map, RegExp: RegExp,
    Error: Error, TypeError: TypeError, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat,
    setTimeout: setTimeout, TextEncoder: TextEncoder, TextDecoder: TextDecoder
  };
  win.WorldAxis = { registerModule: function (n, m) { (win.__regs = win.__regs || []).push({ rel: n, meta: m }); } };
  return sb;
}
function loadAll() {
  const sb = mkSandbox();
  const ctx = vm.createContext(sb);
  for (const f of FILES) vm.runInContext(RD('engines/' + f + '.js'), ctx, { filename: 'engines/' + f + '.js' });
  const wa = sb.window.WorldAxis;
  // registerModule 的记录落在 win.__regs 上；把它挂到命名空间上给断言用
  wa.__regs = sb.window.__regs || [];
  return wa;
}
// 负控制：同一套代码，只换一处源码；返回 {WA, miss}
function broken(rel, from, to) {
  const src = RD(rel);
  if (src.indexOf(from) < 0) return { WA: null, miss: true };
  const sb = mkSandbox();
  const ctx = vm.createContext(sb);
  try { vm.runInContext(src.split(from).join(to), ctx, { filename: rel }); }
  catch (e) { return { WA: sb.window.WorldAxis, err: String(e && e.message) }; }
  return { WA: sb.window.WorldAxis, miss: false };
}
const WA = loadAll();

// ── A0 装载面 ───────────────────────────────────────────
let nsCount = 0;
for (const f of FILES) {
  const ns = { 'api-vault': 'apiVault', 'floor-favorites': 'floorFavorites', 'story-export': 'storyExport',
    'floor-scrub': 'floorScrub', 'mixed-index': 'mixedIndex', 'floor-hide': 'floorHide',
    'stream-gate': 'streamGate', 'slot-format': 'slotFormat', 'green-keys': 'greenKeys',
    'write-serial': 'writeSerial' }[f];
  if (WA[ns]) nsCount++;
}
a(nsCount === 10, 'A0a 10 件都能装载并各自提供命名空间（实 ' + nsCount + '）', nsCount);
const regs = WA.__regs || [];
a(regs.length === 10, 'A0b 10 件都尾调 registerModule（实 ' + regs.length + '）', regs.map(function (r) { return r.rel; }));
// v2.569.0 修正（原判据钉死单一 `2.529.0`，我第一版跟位时改成钉一组已知值 —— 那是把
//   病灶从「过期」换成「白名单」：每入库一台就得人肉加一项，且这一组字面量反过来被
//   v2.185/vs 版本面门禁判成「跟随型版本面没跟上当前版本」（本趟全量回归当场逮住）。
//   现场事实先说清，判据才写得对：本仓的「文件头版本」与「registerModule 的 ver」
//   **是两个不同的印章** ——
//     · 文件头 `WorldAxis engines/x.js (vA)` 是**入库批次**印章，入库后不再改
//       （metabolism-clock 头停 v2.329.0，worldbook 头停 v0.8，本轮改写大改也没动）；
//     · `ver` 是**该模块最近一次语义变更/真接线**的版本（write-serial 在 v2.551.0
//       才把三处写回整段接进按书串行队列，ver 因此抬到 2.551.0，头仍是 2.529.0）。
//   两处语义不同 ⇒ 不能要求「相等」，更不能要求「∈ 某个已知列表」。改为三条不变量
//   （现场可复算、不含任何版本字面量、也不存在需要维护的名单）：
//     ① kind 统一 engine；
//     ② ver 是合法 semver；
//     ③ 文件头印章 ≤ ver ≤ 当前 VERSION —— 登记版本不可能比文件入库更早，
//        也不可能超前于当前版本（这两头任一被跨过，就是有人手改了元信息而没说）。
const CUR_V = (RD('index.js').match(/const VERSION = '(\d+\.\d+\.\d+)'/) || [])[1];
function vnum(v) {
  const p = String(v).split('.').map(Number);
  return (p[0] || 0) * 1e6 + (p[1] || 0) * 1e3 + (p[2] || 0);
}
const badKind = regs.filter(function (r) { return !r.meta || r.meta.kind !== 'engine'; });
const badVer = regs.filter(function (r) {
  const v = r.meta && r.meta.ver;
  if (!/^\d+\.\d+\.\d+$/.test(String(v))) return true;
  const src = RD(String(r.rel));
  const head = (src.match(/WorldAxis engines\/[^\s]+\.js \(v(\d+\.\d+\.\d+)\)/) || [])[1];
  if (!head) return true;   // 头里没有自述版本 ⇒ 「印章」这一栏不存在，不能默认它自洽
  return vnum(v) < vnum(head) || (!!CUR_V && vnum(v) > vnum(CUR_V));
});
a(badKind.length === 0 && badVer.length === 0,
  'A0c 登记元信息自洽（kind 全 engine；文件头印章 ≤ ver ≤ 当前 ' + CUR_V + '；失配 ' + badVer.length + ' 条）',
  regs.map(function (r) { return String(r.rel) + ' ' + JSON.stringify(r.meta); }));

const IDX = RD('index.js'), RUN = RD('tests/run.js');
const missIdx = FILES.filter(function (f) { return IDX.indexOf("'engines/" + f + ".js'") < 0; });
const missRun = FILES.filter(function (f) { return RUN.indexOf("'engines/" + f + ".js'") < 0; });
a(missIdx.length === 0 && missRun.length === 0, 'A0d 双登记齐全（index.js LOAD_ORDER / tests/run.js LOAD）',
  { missIdx: missIdx, missRun: missRun });
const nsLed = JSON.parse(RD('tests/ns-consumer-ledger.json'));
const missLed = ['apiVault', 'floorFavorites', 'storyExport', 'floorScrub', 'mixedIndex', 'floorHide',
  'streamGate', 'slotFormat', 'greenKeys', 'writeSerial'].filter(function (n) { return !nsLed.entries[n]; });
// v2.569.0 修正（原判据只有一个方向）：这 10 台里已有多台按账本纪律④**注销**
//   （mixedIndex / greenKeys / writeSerial / storyExport / apiVault 都有了真实产品读点
//   或被改判 readonly-api），账本里本就不该再有它们 —— 旧写法「不在账本 ⇒ 逃账」
//   于是把「已接线」判成「逃账」，与纪律④直接打架。改为两向：
//   在账本里 ⇒ 必须定性为 pending-wire / readonly-api；不在账本里 ⇒ _note 必须有注销理由。
const OK_CLS2 = ['pending-wire', 'readonly-api'];
const wrongCls2 = missLed.filter(function (n) { return nsLed.entries[n] && OK_CLS2.indexOf(nsLed.entries[n].cls) < 0; });
const unexplained2 = missLed.filter(function (n) { return String(nsLed._note || '').indexOf(n) < 0; });
a(unexplained2.length === 0 && wrongCls2.length === 0, 'A0e 10 个零读 ns 要么在定性账本里（cls 属于 {pending-wire, readonly-api}）、要么 _note 有注销理由', { miss: unexplained2, wrongCls: wrongCls2 });

// ── 1 api-vault ──────────────────────────────────────
const AV = WA.apiVault;
a(AV.available() === false, 'A1a 非安全上下文明说不可用（不会假装能用）', AV.available());
let threw = false, thrownMsg = '', ps = null;
try { ps = AV.save('openai', 'sk-1'); } catch (e) { threw = true; thrownMsg = String(e && e.message); }
// save 是 async：异常以 reject 形式出现，同步入口不该抛 —— 同时必须挂 catch：
// 这个 reject 是**预期的**（非安全上下文拒绝保存），不 catch 会变成 unhandled rejection，
// 在 Node 里默认直接打死进程（本锁首版就是在 B10 段之后整进程退出）。
if (ps && typeof ps.catch === 'function') ps.catch(function () {});
a(threw === false && !!ps && typeof ps.then === 'function',
  'A1b save 是异步入口（同步不抛、返回 promise，不是阻塞调用）', [threw, thrownMsg]);
const st0 = AV.stat();
const keys = Object.keys(st0).sort().join(',');
a(keys === 'available,cached,decryptFail,dels,lastError,primes,reads,saves,unavailable',
  'A1c stat 给出完整读数面（9 个字段，读/写/删/解密失败/不可用各有计数）', keys);
a(AV.peek('openai') === '', 'A1d 不可用时 peek 返回空串（绝不把明文当缓存值）', AV.peek('openai'));

// ── 2 floor-favorites ────────────────────────────────
const FF = WA.floorFavorites;
const chatF = [{ mes: 'a' }, { mes: 'b', extra: {} }, { mes: 'c', extra: {} }];
FF.toggle(chatF, 1);
a(FF.isFav(chatF, 1) === true && FF.count(chatF) === 1, 'A2a toggle 后 isFav 为真、count=1', [FF.isFav(chatF, 1), FF.count(chatF)]);
FF.setRange(chatF, 1, 2, true);
a(FF.count(chatF) === 2, 'A2b setRange(1..2) 后 count=2（闭区间）', FF.count(chatF));
a(FF.KEY === 'waxFavorite' && chatF[1].mes === 'b' && chatF[1].extra[FF.KEY] === true,
  'A2c 只写 extra[waxFavorite]，不动 mes（不污染正文）', Object.keys(chatF[1]));
const listF = FF.list(chatF);
a(listF.length === 2 && listF[0].index === 1, 'A2d list 给出 {index,name,preview}（面板要的直接数据）', listF);
// B 负控制：setRange 的闭区间改成开区间 ⇒ A2b 的 count 变 1
const bf1 = broken('engines/floor-favorites.js', 'for (let i = a; i <= b; i++)', 'for (let i = a; i < b; i++)');
if (bf1.miss) a(false, 'B2 负控制锚点未命中（setRange 循环头已被改）');
else {
  const c2 = [{ mes: 'a' }, { mes: 'b', extra: {} }, { mes: 'c', extra: {} }];
  bf1.WA.floorFavorites.setRange(c2, 1, 2, true);
  a(bf1.WA.floorFavorites.count(c2) !== 2, 'B2 负控制：setRange 改开区间 ⇒ count≠2（判据翻红）', bf1.WA.floorFavorites.count(c2));
}

// ── 3 story-export ───────────────────────────────────
const SE = WA.storyExport;
const stripOut = SE.strip('正文<em>斜</em>[[NT_STATUS]]尾巴');
a(stripOut === '正文斜', 'A3a strip 剥 HTML 与 [[NT_STATUS]] 状态块（实 "' + stripOut + '"）', stripOut);
const built = SE.build([{ mes: '第一层' }, { mes: '第二层', is_system: true }, { mes: '第三层' }]);
a(built && typeof built.text === 'string' && built.floors >= 1 && built.skipped >= 1,
  'A3b build 给 {text,floors,skipped}：系统消息不进正文但计 skipped', built);
a(built.text.indexOf('<') < 0 && built.text.indexOf('[[') < 0, 'A3c 导出的正文里没有标签与块标记', built.text);
const bf3 = broken('engines/story-export.js', "[[NT_STATUS]]", "___NEVER_MATCH___");
if (bf3.miss) a(false, 'B3 负控制锚点未命中（[[NT_STATUS]] 的剥离规则已变）');
else a(bf3.WA.storyExport.strip('a[[NT_STATUS]]b') !== 'ab', 'B3 负控制：去掉 [[NT_STATUS]] 剥离 ⇒ 标记残留（判据翻红）',
  bf3.WA.storyExport.strip('a[[NT_STATUS]]b'));

// ── 4 floor-scrub ────────────────────────────────────
const FS = WA.floorScrub;
const parsed = FS.parseRules('/(\\d+)/g => [$1]\n旧=>新\n坏[/');
a(parsed && Array.isArray(parsed.rules) && parsed.rules.length === 3, 'A4a 三形态规则都解析出来（正则 / 旧=>新 / 裸词）', parsed);
const applied = FS.apply('旧 123', parsed);
a(applied.hits >= 1 && applied.text.indexOf('新') >= 0, 'A4b parseRules 的返回值能直接喂 apply（直通，不用再拆）', applied);
const appliedArr = FS.apply('旧 123', parsed.rules);
a(appliedArr.hits === applied.hits, 'A4c apply 同时接受数组与 {rules}（两种入参同结果）', [applied.hits, appliedArr.hits]);
// B 负控制：rulesOf 不认 {rules} ⇒ A4b 的直通断掉（hits 变 0）
const bf4 = broken('engines/floor-scrub.js', 'if (rules && Array.isArray(rules.rules)) return rules.rules;', 'if (false) return [];');
if (bf4.miss) a(false, 'B4 负控制锚点未命中（rulesOf 已被改）');
else a(bf4.WA.floorScrub.apply('旧 123', parsed).hits === 0, 'B4 负控制：rulesOf 不认 {rules} ⇒ 直通断掉（判据翻红）',
  bf4.WA.floorScrub.apply('旧 123', parsed).hits);

// ── 5 mixed-index ────────────────────────────────────
const MI = WA.mixedIndex;
const idxOut = MI.build([
  { comment: '角色A', content: '角色A是个铁匠，四十岁，独眼，说话粗，手上总有一层洗不掉的黑灰，见谁都不抬眼，据说是那场大火里活下来的三个人之一', constant: true },
  { comment: '角色B', content: '角色B的正文。', constant: true }
]);
a(idxOut && typeof idxOut.text === 'string' && idxOut.text.indexOf('角色A') >= 0, 'A5a 常驻条目进简报', idxOut.text);
const rowA = (idxOut.sections[0] || { rows: [] }).rows[0] || {};
// 上限是 40 字 + 截断补的一个省略号 = 41；样本正文 50 字以上，截不住就会明显超长
a(String(rowA.brief || '').length > 0 && String(rowA.brief || '').length <= 41,
  'A5b 简报截到 40 字以内（常驻只给身份，不搬正文）', String(rowA.brief || '').length);
a(MI.SEC_ORDER.join(',') === '角色,道具,伏笔,计划,地点', 'A5c 分区次序固定（角色在前，地点在后）', MI.SEC_ORDER);
// B 负控制：简报上限放大 ⇒ A5b 翻红
const bf5 = broken('engines/mixed-index.js', 'function brief(text, max) {', 'function brief(text, max) { max = 400;');
if (bf5.miss) a(false, 'B5 负控制锚点未命中（brief 已改）');
else {
  const o2 = bf5.WA.mixedIndex.build([{ comment: '角色A', content: '角色A是个铁匠，四十岁，独眼，说话粗，手上总有一层洗不掉的黑灰，见谁都不抬眼，据说是那场大火里活下来的三个人之一', constant: true }]);
  const r2 = (o2.sections[0] || { rows: [] }).rows[0] || {};
  a(String(r2.brief || '').length > 41, 'B5 负控制：简报上限放大 ⇒ 长度超 41（判据翻红）', String(r2.brief || '').length);
}

// ── 6 floor-hide ─────────────────────────────────────
const FH = WA.floorHide;
const floors = [];
for (let i = 0; i < 10; i++) floors.push({ mes: 'm' + i, is_user: i % 2 === 0, extra: {} });
const cut = FH.cutoffIndexForKeep(floors, 3);
a(cut > 0 && cut < 10, 'A6a cutoffIndexForKeep(10 楼, keep 3) 给出切点（实 ' + cut + '）', cut);
// 10 楼里只有 5 条 AI 楼层（0/2/4/6/8 是玩家楼，cutoffIndexForKeep 逐条跳过）：
//   dataKeep=2 ⇒ 切点 6（前 6 行数据层隐藏）；visualKeep=4 ⇒ 切点 2。
// 两个切点必须分开 —— 这才是「视觉层保留比数据层多」的可取证形态。
// （visualHidden 只数「只视觉隐藏」的行，视觉保留更多时它必然是 0，不能拿它当分开的判据。）
const planD = FH.plan(floors, { dataKeep: 2, visualKeep: 4 });
a(planD.dataCut === 6 && planD.visualCut === 2 && planD.dataHidden === 6 && planD.visualHidden === 0 && planD.clamped === false,
  'A6b 数据层/视觉层各按自己的 keep 算 ⇒ dataCut 6 ≠ visualCut 2（两层分开算）',
  [planD.dataCut, planD.visualCut, planD.dataHidden, planD.visualHidden, planD.clamped]);
a(planD.floors === 10 && Array.isArray(planD.rows), 'A6c plan 报总楼层数并给逐行补丁（不是只有汇总）', planD.floors);
// B 负控制：视觉层直接抄数据层 ⇒ A6b 翻红
// 破坏：把「只在被夹紧时拉平」改成「无条件拉平」⇒ 视觉层总是抄数据层，两个切点合流
const bf6 = broken('engines/floor-hide.js', 'if (clamped) visualKeep = dataKeep;', 'visualKeep = dataKeep;');
if (bf6.miss) a(false, 'B6 负控制锚点未命中（visualKeep 夹紧行已改）');
else {
  const p2 = bf6.WA.floorHide.plan(floors, { dataKeep: 2, visualKeep: 4 });
  a(!(p2.dataCut === 6 && p2.visualCut === 2),
    'B6 负控制：视觉层抄数据层 ⇒ 两个切点合一（判据翻红）',
    [p2.dataCut, p2.visualCut, p2.clamped]);
}

// ── 7 stream-gate ────────────────────────────────────
const SG = WA.streamGate;
const gate = SG.create(['think'], {});
const parts = [gate.feed('<thin'), gate.feed('king>秘密</thi'), gate.feed('nking>正文'), gate.flush()];
const joined = parts.join('');
a(joined.indexOf('<thinking>') === 0 && joined.indexOf('秘密') >= 0 && joined.indexOf('</thinking>') > 0,
  'A7a 流中逐块拼出完整思考块（半截标签不许提前吐）', parts);
a(joined.indexOf('正文') > joined.indexOf('</thinking>'), 'A7b 正文在思考块之后（顺序不乱）', joined);
const lineNoGate = SG.sseLine('data: {"choices":[{"delta":{"content":"你好"}}]}', null);
a(lineNoGate.indexOf('"你好"') >= 0, 'A7c sseLine 没给闸门时不崩、原样返回（流式回调里崩=整条流断）', lineNoGate);
const g2 = SG.create(['think'], {});
const lineGate = SG.sseLine('data: {"choices":[{"delta":{"content":"<thinking>x</thinking>你好"}}]}', g2);
a(lineGate !== 'data: {"choices":[{"delta":{"content":"<thinking>x</thinking>你好"}}]}', 'A7d 带闸门的 sseLine 真的改写了内容', lineGate);
// B 负控制：去掉「没闸门就原样返回」 ⇒ A7c 变崩（异常）
const bf7 = broken('engines/stream-gate.js', "if (!gate || typeof gate.feed !== 'function') return src;", '');
if (bf7.miss) a(false, 'B7 负控制锚点未命中（sseLine 的闸门守卫已改）');
else {
  let crashed = false;
  try { bf7.WA.streamGate.sseLine('data: {"choices":[{"delta":{"content":"x"}}]}', null); }
  catch (e) { crashed = true; }
  a(crashed, 'B7 负控制：去掉闸门守卫 ⇒ 无闸门调用直接崩（判据翻红）');
}

// ── 8 slot-format ────────────────────────────────────
const SF = WA.slotFormat;
a(SF.slotName('角色', 1) === '【WA存档·角色】' && SF.slotName('角色', 2) === '【WA存档·角色·2】',
  'A8a 第 1 档无后缀、第 N 档带 ·N', [SF.slotName('角色', 1), SF.slotName('角色', 2)]);
const parsedSlot = SF.parseSlotName(SF.slotName('角色', 12));
a(parsedSlot && parsedSlot.charName === '角色' && parsedSlot.slot === 12, 'A8b 解析只认结尾 ·数字，角色名原样还原', parsedSlot);
const longSlot = SF.slotName('很长'.repeat(80), 1);
a(SF.byteLength(longSlot) <= SF.MAX_NAME_BYTES && SF.byteLength(longSlot) > 100,
  'A8c 超长角色名按 UTF-8 字节截断（≤ ' + SF.MAX_NAME_BYTES + ' 字节，实 ' + SF.byteLength(longSlot) + '）',
  SF.byteLength(longSlot));
a(SF.isSlotOf(SF.slotName('角色', 2), '角色') === true && SF.isSlotOf(SF.slotName('别人', 2), '角色') === false,
  'A8d isSlotOf 按基础名前缀认档（不误认别人的档）');
// B 负控制：字节预算放大 ⇒ A8c 翻红
const bf8 = broken('engines/slot-format.js', 'const MAX_NAME_BYTES = 220;', 'const MAX_NAME_BYTES = 600;');
if (bf8.miss) a(false, 'B8 负控制锚点未命中（MAX_NAME_BYTES 已改）');
else {
  const s2 = bf8.WA.slotFormat.slotName('很长'.repeat(80), 1);
  a(bf8.WA.slotFormat.byteLength(s2) > 220, 'B8 负控制：预算放大 ⇒ 超 220 字节（判据翻红）', bf8.WA.slotFormat.byteLength(s2));
}

// ── 9 green-keys ─────────────────────────────────────
const GK = WA.greenKeys;
a(GK.isValidKey('王都') === true, 'A9a 真专名放行（王都）');
a(GK.isValidKey('计划') === false && GK.isValidKey('与商会谈判') === false && GK.isValidKey('去酒馆') === false,
  'A9b 分类名 / 句子碎片 / 动词开头一律拒（计划 / 与商会谈判 / 去酒馆）');
const gk = GK.deriveGreenKeys(['北辰商会', '暗流疑云', '王都']);
a(gk.indexOf('暗流') < 0 && gk.indexOf('王都') >= 0, 'A9c 抽象名不进绿灯，真专名进（' + JSON.stringify(gk) + '）', gk);
// B 负控制：抽象名黑名单清空 ⇒ A9c 翻红
const bf9 = broken('engines/green-keys.js',
  'const ABSTRACT_NAME = /(疑云|寻踪|谜团|秘影|暗流|回响|序曲|终章|秘闻|传说|风云|往事|余波|征兆|真相|阴谋|计划|序章|终局)/;',
  'const ABSTRACT_NAME = /___NEVER___/;');
if (bf9.miss) a(false, 'B9 负控制锚点未命中（ABSTRACT_NAME 已改）');
else {
  const g2b = bf9.WA.greenKeys.deriveGreenKeys(['暗流疑云']);
  a(g2b.length > 0, 'B9 负控制：抽象名黑名单清空 ⇒ 抽象名被当绿灯（判据翻红）', g2b);
}

// ── 10 write-serial（含 C 真跑）────────────────────────
const WS = WA.writeSerial;
const serial = WS.createSerial('reg');
a(typeof serial.run === 'function' && typeof serial.stat === 'function' && typeof serial.idle === 'function',
  'A10a 队列给 run/stat/idle 三口');
a(WS.configEntry('世界配置', '{}').disable === true && WS.configEntry('x', 'y').constant === undefined,
  'A10b 配置条目带 disable:true 且**不带** constant（不带才是纪律）');
const audit = WS.auditBook({ entries: {
  a: { comment: '配置', disable: true, constant: true, content: '{}' },
  b: { comment: '', disable: true, content: '{}' },
  c: { comment: '大', disable: true, content: 'x'.repeat(5000) }
} });
const codes = audit.map(function (x) { return x.code; }).sort().join(',');
a(codes === 'CONFIG_INJECTED,CONFIG_TOO_BIG,CONFIG_UNNAMED', 'A10c auditBook 三类问题都点出来', codes);
// B 负控制：catch 里改成 rethrow ⇒ 队列卡死（C 真跑必须翻红）
const bf10 = broken('engines/write-serial.js', '        return undefined;', '        throw e;');
if (bf10.miss) a(false, 'B10 负控制锚点未命中（队列 catch 已改）');
else {
  const s2 = bf10.WA.writeSerial.createSerial('dead');
  let done2 = false;
  // 这一项的 run 在破坏后必然 reject（rethrow），必须接住 —— 判据看的是「后续项还跑不跑」，
  // 不是「这个 promise 有没有炸」，让它野着只会把测量本身打掉。
  s2.run(function () { throw new Error('boom'); }).catch(function () {});
  s2.run(function () { done2 = true; }).catch(function () {});
  a(done2 === false, 'B10 负控制：失败改成 rethrow ⇒ 队列卡死、后续项不执行（判据翻红）', done2);
}

// ── C 真跑（跨函数协同）────────────────────────────────
const order = [];
const s3 = WA.writeSerial.createSerial('c');
// 队列自己的 catch 会吞掉失败并记账；但 run 返回的 promise 仍是 rejected，
// 这里统一接住，避免「测队列不卡死」的测量自己被 unhandled rejection 打断。
const K = function (p) { if (p && typeof p.catch === 'function') p.catch(function () {}); return p; };
K(s3.run(function () { order.push(1); return new Promise(function (r) { setTimeout(r, 5); }); }));
K(s3.run(function () { order.push(2); throw new Error('第二项失败'); }));
K(s3.run(function () { order.push(3); }));
setTimeout(function () {
  const st = s3.stat();
  a(order.join(',') === '1,2,3', 'C1 串行队列三项按序执行，中间一项抛错不影响第三项', order);
  a(st.failed === 1 && !!st.lastError && st.pending === 0, 'C2 失败被记进 lastError 且 pending 归零（不会静默吞掉）', st);

  // 楼层清洗 + 收藏协同：清洗后的文本仍保留收藏标记（两个面互不踩）
  const chatC = [{ mes: '旧稿<em>x</em>', extra: {} }];
  WA.floorFavorites.toggle(chatC, 0);
  const scrubbed = WA.floorScrub.plan(chatC, { rulesText: '旧 => 新' });
  // plan 给的是 patches（逐行补丁），不是 rows；同时确认补丁真换了字、收藏位没被顺手抹掉
  a(scrubbed && Array.isArray(scrubbed.patches) && scrubbed.patches.length === 1
    && scrubbed.patches[0].mes.indexOf('新稿') === 0 && scrubbed.totalHits === 1
    && WA.floorFavorites.isFav(chatC, 0) === true,
    'C3 清洗出补丁时不动收藏标记（收藏在 extra，清洗只碰正文）',
    [scrubbed && scrubbed.patches && scrubbed.patches.length, scrubbed && scrubbed.patches && scrubbed.patches[0] && scrubbed.patches[0].mes,
     WA.floorFavorites.isFav(chatC, 0)]);

  // 存档位命名 → 解析 → 认档 三段闭环
  const nm = WA.slotFormat.slotName('长夜将至', 3);
  const pb = WA.slotFormat.parseSlotName(nm);
  a(pb && pb.charName === '长夜将至' && pb.slot === 3 && WA.slotFormat.isSlotOf(nm, '长夜将至'),
    'C4 slotName → parseSlotName → isSlotOf 三段闭环一致', [nm, pb]);
  a(WA.slotFormat.slotsOf([WA.slotFormat.slotName('长夜将至', 1), nm, WA.slotFormat.slotName('别人', 2)], '长夜将至').join(',') === '1,3',
    'C5 slotsOf 只收本角色的档号（1,3），不串别人的档');

  console.log('');
  console.log('STITCH-NEKOTOOLS-V2529: ' + (fail === 0 ? 'pass' : 'FAIL') + ' ' + pass + ' / ' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
}, 60);
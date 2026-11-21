#!/usr/bin/env node
// WorldAxis tests/stitch-redbird-v2529.js — RedBird-Tools 缝合批专锁（9 件）
//
// 治的病：本批从 SillyTavern-RedBird-Tools（TypeScript，13 个模块带 vitest）缝入 9 件——
//   6 件 A 级（真功能面）：store-merge / contrast / card-file / setup-plan /
//                          floor-census / import-kind
//   3 件 B 级（借纪律 + 一个真守卫）：chat-guard / macro-guard / msg-align
//   缝合前清点确认这些面本仓一个都没有（存档合并 0 命中、WCAG 对比度 0 命中、
//   PNG 卡直读 0 命中、进卡/离卡设置台账 0 命中、漏发普查 0 命中、导入类型识别 0 命中、
//   存档防覆盖 0 命中、副作用宏守卫 0 命中、messages 对齐 0 命中）。
//
// 本锁钉住「缝进来的东西真的按它自己写的判据在动」：
//   A 现场：装载面（9 件都能装、都登记、双登记进两张表、都进零读定性账本）
//           + 每件 2–6 条行为判据（接口真的做它说的事）。
//   B 负控制：每件一处**真破坏现场取值**（改源码分支/常量，同一套断言必须翻红）。
//             破坏锚点未命中同样记红 —— 否则「负控制跑过了」是假读数。
//   C 真跑：跨函数协同（删除→合并挡住复活、压暗量取到最小值、卡文件→摘要→指纹比对、
//           导入判型→摘要、对齐→读数）。这些不是单函数能证明的。
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
const FILES = ['store-merge', 'contrast', 'card-file', 'setup-plan', 'floor-census',
  'import-kind', 'chat-guard', 'macro-guard', 'msg-align'];
const NS = {
  'store-merge': 'storeMerge', contrast: 'contrast', 'card-file': 'cardFile',
  'setup-plan': 'setupPlan', 'floor-census': 'floorCensus', 'import-kind': 'importKind',
  'chat-guard': 'chatGuard', 'macro-guard': 'macroGuard', 'msg-align': 'msgAlign'
};
// 沙箱：window 是「浏览器窗口」那一层（引擎里 win() = WA.mainWin || window）
function mkSandbox() {
  const win = {
    console: { log: function () {}, warn: function () {}, error: function () {} },
    indexedDB: null, isSecureContext: false, crypto: { subtle: {} }
  };
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
  // registerModule 的记录落在 win.__regs 上；挂到命名空间上给断言用
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
const NOW = Date.parse('2026-03-01T00:00:00.000Z');

// ── A0 装载面 ───────────────────────────────────────────
let nsCount = 0;
for (const f of FILES) if (WA[NS[f]]) nsCount++;
a(nsCount === 9, 'A0a 9 件都能装载并各自提供命名空间（实 ' + nsCount + '）', nsCount);
const regs = WA.__regs || [];
a(regs.length === 9, 'A0b 9 件都尾调 registerModule（实 ' + regs.length + '）', regs.map(function (r) { return r.rel; }));
a(regs.every(function (r) { return r.meta && r.meta.kind === 'engine' && r.meta.ver === '2.529.0'; }),
  'A0c 登记元信息统一（kind=engine / ver=2.529.0）', regs.map(function (r) { return r.meta; }));
const IDX = RD('index.js'), RUN = RD('tests/run.js');
const missIdx = FILES.filter(function (f) { return IDX.indexOf("'engines/" + f + ".js'") < 0; });
const missRun = FILES.filter(function (f) { return RUN.indexOf("'engines/" + f + ".js'") < 0; });
a(missIdx.length === 0 && missRun.length === 0, 'A0d 双登记齐全（index.js LOAD_ORDER / tests/run.js LOAD）',
  { missIdx: missIdx, missRun: missRun });
const nsLed = JSON.parse(RD('tests/ns-consumer-ledger.json'));
const nineNs = FILES.map(function (f) { return NS[f]; });
const missLed = nineNs.filter(function (n) { return !nsLed.entries[n]; });
// v2.547.0：把「接线成功」与「逃账」区开。原判据要求 9 件的 ns 全部在账本里，
//   但账本条目会因为「接到了真读点」而注销（v2.544.0 注销 importKind：账本说零读、
//   现场已有真读点，理由写在 _note 里）。于是原判据把「已接线」判成「逃账」——
//   正是本仓最忌讳的那种同形。判据升级：在账本里 ⇒ 必须是 pending-wire；
//   不在账本里 ⇒ 必须在 _note 里找得到注销理由（找不到 = 逃账，仍然红）。
const wiredOut = missLed.slice();
const unexplained = wiredOut.filter(function (n) { return String(nsLed._note || '').indexOf(n) < 0; });
const wrongCls = nineNs.filter(function (n) { return nsLed.entries[n] && nsLed.entries[n].cls !== 'pending-wire'; });
a(unexplained.length === 0 && wrongCls.length === 0, 'A0e 9 个零读 ns 都在定性账本里（cls=pending-wire；已接线的须有注销理由）',
  { miss: unexplained, wrongCls: wrongCls, wiredOut: wiredOut });

// ── 1 store-merge ────────────────────────────────────
const SM = WA.storeMerge;
const local1 = { data: { cards: {
  a: { updatedAt: '2026-01-01T00:00:00.000Z', v: 1 },
  b: { updatedAt: '2026-02-20T00:00:00.000Z', v: 2 }
} }, deleted: {} };
const remote1 = { data: { cards: {
  a: { updatedAt: '2026-02-01T00:00:00.000Z', v: 9 },
  c: { updatedAt: '2026-02-02T00:00:00.000Z', v: 3 }
} }, deleted: {} };
const m1 = SM.mergeStores(local1, remote1, NOW);
a(m1.data.cards.a.v === 9 && m1.data.cards.b.v === 2 && m1.data.cards.c.v === 3,
  'A1a 逐条比时间戳：新的赢、两边独有都留（a=9 / b=2 / c=3）',
  { a: m1.data.cards.a.v, b: m1.data.cards.b.v, c: m1.data.cards.c && m1.data.cards.c.v });
a(local1.data.cards.a.v === 1 && remote1.data.cards.a.v === 9, 'A1b 合并不改入参（两份快照原样还在）');
const mTie = SM.mergeStores(
  { data: { cards: { a: { updatedAt: '2026-01-01T00:00:00.000Z', who: 'local' } } } },
  { data: { cards: { a: { updatedAt: '2026-01-01T00:00:00.000Z', who: 'remote' } } } }, NOW);
a(mTie.data.cards.a.who === 'local', 'A1c 时间戳相同保留 local（不猜，宁可不动手里这份）', mTie.data.cards.a.who);
// 墓碑：删除时间晚于记录的最后修改 ⇒ 不复活
const mTomb = SM.mergeStores(
  { data: {}, deleted: { cards: { a: '2026-02-10T00:00:00.000Z' } } },
  { data: { cards: { a: { updatedAt: '2026-02-01T00:00:00.000Z', v: 7 } } }, deleted: {} }, NOW);
a(!('a' in mTomb.data.cards), 'A1d 墓碑晚于记录的最后修改 ⇒ 这条算删掉，不复活（纯数据里删除无法表达，只能靠墓碑）',
  mTomb.data.cards);
// 墓碑老化：超过 30 天且两边都没这条才清
const oldDel = '2026-01-01T00:00:00.000Z';
const mAge = SM.mergeStores({ data: {}, deleted: { cards: { gone: oldDel } } }, { data: {}, deleted: {} }, NOW);
a(!('gone' in (mAge.deleted.cards || {})), 'A1e 超过 TOMBSTONE_DAYS 且两边都没有这条 ⇒ 墓碑老化清掉', mAge.deleted.cards);
// SECTIONS 是白名单：不在表里的分区被静默丢弃（所以加分区必须同时加表）
const mSec = SM.mergeStores({ data: { foo: { x: { updatedAt: '2026-01-01T00:00:00.000Z' } } } }, { data: {} }, NOW);
a(!('foo' in mSec.data), 'A1f SECTIONS 白名单：表外分区被丢弃（加分区必须同时加表）', Object.keys(mSec.data));
const snap1 = { data: { cards: { a: { updatedAt: 'x' }, b: { updatedAt: 'y' } } }, deleted: {} };
const nd = SM.markDeleted(snap1, 'cards', 'a', '2026-03-01T00:00:00.000Z');
a(Object.keys(snap1.data.cards).length === 2 && !('a' in nd.data.cards)
  && nd.deleted.cards.a === '2026-03-01T00:00:00.000Z',
  'A1g markDeleted 记墓碑并从数据面摘掉这条，且不改入参');
// B 负控制：新的赢改成永远留 local ⇒ A1a 翻红
const bf1 = broken('engines/store-merge.js',
  'else pick = stampOf(sec, rb) > stampOf(sec, ra) ? rb : ra;', 'else pick = ra;');
if (bf1.miss) a(false, 'B1 负控制锚点未命中（逐条选新分支已改）');
else {
  const m2 = bf1.WA.storeMerge.mergeStores(local1, remote1, NOW);
  a(!(m2.data.cards.a.v === 9), 'B1 负控制：永远留 local ⇒ 新的没压过旧的（判据翻红）', m2.data.cards.a.v);
}

// ── 2 contrast ───────────────────────────────────────
const C = WA.contrast;
const bw = C.contrast('#000000', '#ffffff');
a(bw > 20.9 && bw < 21.1, 'A2a 黑白对比度 ≈ 21:1（WCAG 公式给得出量级）', Math.round(bw * 100) / 100);
const short = C.hexRgb('#abc');
a(short && short.join(',') === '170,187,204', 'A2b 三位缩写色值能展开（#abc → 170,187,204）', short);
a(C.contrast('not-a-color', '#ffffff') === 0,
  'A2c 认不出的颜色返 0（当作不可读，倒逼调用方给合法色值；不当成黑）', C.contrast('not-a-color', '#fff'));
a(C.shadeFor(null) === C.SHADE_UNKNOWN && C.shadeFor(undefined) === 0.4,
  'A2d 图读不到用 0.40 兜底（不许当成纯白去算）', C.shadeFor(null));
// 「第一个满足的压暗量」：取到的 k 必须达标，而 k-0.01 必须不达标
const ratioAt = function (k) {
  const v = 255 * (1 - k);
  return C.contrast(C.ON_IMAGE_TEXT, [v, v, v]);
};
const kWhite = C.shadeFor([255, 255, 255]);
a(kWhite >= C.SHADE_MIN && kWhite <= C.SHADE_MAX,
  'A2e 纯白底图给出压暗量 k（实 ' + kWhite + '，落在 0.30–0.70）', kWhite);
a(ratioAt(kWhite) >= C.MIN_RATIO && ratioAt(kWhite - 0.01) < C.MIN_RATIO,
  'A2f k 是「第一个满足」的值：k 达标而 k-0.01 不达标（不是随便取个上限）',
  [Math.round(ratioAt(kWhite) * 100) / 100, Math.round(ratioAt(kWhite - 0.01) * 100) / 100]);
const badRows = C.auditPalette([
  { id: 't', dark: '#000000', light: '#000000', warm: '#000000' },
  { id: 'ok', dark: '#ececf1', light: '#111111', warm: '#111111' }
]);
a(badRows.some(function (b) { return b.id === 't' && b.look === 'dark'; })
  && !badRows.some(function (b) { return b.id === 'ok'; }),
  'A2g auditPalette 只挑不合格项（黑底黑字被点名，合格行不误报）', badRows);
// B 负控制：去掉「达标就返回」⇒ 永远返回上限 0.70 ⇒ A2f 的「第一个」翻红
const bf2 = broken('engines/contrast.js', 'if (ok) return k;', 'if (false) return k;');
if (bf2.miss) a(false, 'B2 负控制锚点未命中（shadeFor 达标返回已改）');
else {
  const k2 = bf2.WA.contrast.shadeFor([255, 255, 255]);
  a(!(ratioAt(k2) >= C.MIN_RATIO && ratioAt(k2 - 0.01) < C.MIN_RATIO),
    'B2 负控制：不再逐级取第一个 ⇒ 直接顶到 0.70（判据翻红）', k2);
}

// ── 3 card-file ──────────────────────────────────────
const CF = WA.cardFile;
a(CF.isPng([137, 80, 78, 71, 13, 10, 26, 10]) === true && CF.isPng([1, 2, 3]) === false,
  'A3a 只认真 PNG 签名（8 字节）');
const notPng = CF.pngTextChunks([1, 2, 3, 4, 5, 6, 7, 8, 9]);
a(notPng && Object.keys(notPng).length === 0, 'A3b 不是 PNG 返回空表、不抛错（调用方按「读不出」处理）', notPng);
// 自造最小 PNG：sig + IHDR + tEXt* + IEND（引擎不校验 CRC）
function chunk(type, data) {
  const n = data.length;
  const out = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  for (let i = 0; i < 4; i++) out.push(type.charCodeAt(i));
  for (let i = 0; i < data.length; i++) out.push(data[i]);
  out.push(0, 0, 0, 0);
  return out;
}
function pngWith(kv) {
  const b = [137, 80, 78, 71, 13, 10, 26, 10];
  chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]).forEach(function (x) { b.push(x); });
  Object.keys(kv).forEach(function (k) {
    const pay = [];
    for (let i = 0; i < k.length; i++) pay.push(k.charCodeAt(i) & 255);
    pay.push(0);
    const t = kv[k];
    for (let i = 0; i < t.length; i++) pay.push(t.charCodeAt(i) & 255);
    chunk('tEXt', pay).forEach(function (x) { b.push(x); });
  });
  chunk('IEND', []).forEach(function (x) { b.push(x); });
  return b;
}
const b64 = function (o) { return Buffer.from(JSON.stringify(o), 'utf8').toString('base64'); };
const cardV2 = { data: { name: '旧版卡', first_mes: '嗨' } };
const cardV3 = { data: { name: '新版卡', first_mes: '嗨' } };
const pngBoth = pngWith({ chara: b64(cardV2), ccv3: b64(cardV3) });
const got3 = CF.cardFromPng(pngBoth);
a(got3 && got3.data && got3.data.name === '新版卡', 'A3c v3(ccv3) 优先于 v2(chara)', got3 && got3.data && got3.data.name);
const pngOnly2 = pngWith({ chara: b64(cardV2) });
const got2 = CF.cardFromPng(pngOnly2);
a(got2 && got2.data && got2.data.name === '旧版卡', 'A3d 只有 v2(chara) 时读它（解码失败才试下一个，不认半个卡）', got2 && got2.data && got2.data.name);
// 坏文件：块长度越界 ⇒ 停，不抛、不猜
const brokenPng = [137, 80, 78, 71, 13, 10, 26, 10, 255, 255, 255, 240, 116, 69, 88, 116, 1, 2];
let badThrew = false;
let badOut = null;
try { badOut = CF.pngTextChunks(brokenPng); } catch (e) { badThrew = true; }
a(badThrew === false && badOut && Object.keys(badOut).length === 0,
  'A3e 块长度越界即停：坏文件不许把循环拖成死循环，也不抛错', [badThrew, badOut]);
const emojiBytes = [0xE4, 0xB8, 0xAD, 0xF0, 0x9F, 0x98, 0x80, 0x41];
a(CF.utf8Decode(emojiBytes) === '中😀A', 'A3f 自实现 UTF-8 解码能过中文与 4 字节字符（不依赖 TextDecoder）',
  CF.utf8Decode(emojiBytes));
const sum = CF.summarizeCard({ data: { name: '卡', character_book: { name: '书', entries: [{ comment: '条目A', keys: ['甲'] }, { comment: '条目B', key: '乙' }] } } });
a(sum && sum.name === '卡' && sum.bookName === '书' && sum.bookEntries === 2 && sum.bookPrints.length === 2,
  'A3g summarizeCard 给名字/书名/条数与条目指纹', sum);
a(CF.summarizeCard({ data: {} }) === null, 'A3h 没有名字就不是卡 ⇒ null（不编一个空卡）');
a(CF.autoSourceUrl({ chub: { full_path: 'a/b' } }) === 'https://chub.ai/characters/a/b'
  && CF.autoSourceUrl({}) === '', 'A3i 从扩展字段反推来源链接，读不到给空串（不猜）');
// B 负控制：键序反转 ⇒ A3c 翻红（v2 压过 v3）
const bf3 = broken('engines/card-file.js', "const CARD_KEYS = ['ccv3', 'chara'];", "const CARD_KEYS = ['chara', 'ccv3'];");
if (bf3.miss) a(false, 'B3 负控制锚点未命中（CARD_KEYS 已改）');
else {
  const g3 = bf3.WA.cardFile.cardFromPng(pngBoth);
  a(!(g3 && g3.data && g3.data.name === '新版卡'), 'B3 负控制：键序反转 ⇒ v2 压过 v3（判据翻红）',
    g3 && g3.data && g3.data.name);
}

// ── 4 setup-plan ─────────────────────────────────────
const SP = WA.setupPlan;
a(SP.unnamedRegex('') === '(未命名正则)' && SP.unnamedRegex('  ').length > 0
  && SP.unnamedRegex('有名') === '有名', 'A4a 空名字给占位名（重名判断要有个可比的键）');
a(SP.isLegacyProfile({ savedAt: 1 }) === true && SP.isLegacyProfile({ globalWorlds: [] }) === true
  && SP.isLegacyProfile({ worlds: {} }) === false, 'A4b 旧格式三类字段都认（globalWorlds / globalRegexEnabled / savedAt）');
const mig = SP.migrateProfile({ globalWorlds: ['甲'], globalRegexEnabled: [] },
  { worldsOn: ['甲', '乙'], regex: [] });
a(mig.worlds && mig.worlds['甲'] === true && mig.worlds['乙'] === false
  && mig.globalWorlds === undefined && mig.savedAt === undefined,
  'A4c 旧格式迁移：清单里的开、现在开着但不在清单的关，旧字段删掉', mig);
const live4 = { v1: 1, v2: 'changed', v3: 8 }; // v1 未动（=after）/ v2 动过且专用 / v3 动过但不专用
const items4 = { v1: { before: 0, after: 1 }, v2: { before: 'a', after: 'b' }, v3: { before: 5, after: 6 } };
const lp = SP.leavePlan(items4, live4, ['v2']);
a(lp.restore.v1 === 0 && !('v1' in lp.save), 'A4d leavePlan ①：玩家没动过 ⇒ 换回进卡前的值', lp);
a(lp.restore.v2 === 'a' && lp.save.v2 === 'changed',
  'A4e leavePlan ②：动过且是本卡专用 ⇒ 记进这张卡，同时换回', lp);
a(!('v3' in lp.restore) && !('v3' in lp.save),
  'A4f leavePlan ③：动过但不是本卡专用 ⇒ 两个都不动（不许悄悄吃掉玩家的全局改动）', lp);
const sz = SP.planSize(lp);
a(sz.restore === 2 && sz.save === 1, 'A4g planSize 给出「离卡会改动几项」（界面提示用）', sz);
a(SP.worldDefault('甲', { global: new Set(['甲']) }) === true
  && SP.worldDefault('乙', { global: new Set(['甲', '乙']), others: new Set(['乙']), mine: new Set() }) === false,
  'A4h worldDefault：全局的书默认开，别的卡的书进卡时自动停用');
const mw = SP.migrateWorlds({ 甲: true, 乙: true, 丙: true },
  { global: new Set(['甲']), mine: new Set(), others: new Set() }, new Set(['甲', '乙', '丙']));
a(Object.keys(mw.worlds).length === 0 && mw.attach.indexOf('乙') >= 0 && mw.attach.indexOf('丙') >= 0,
  'A4i migrateWorlds：与默认一致的记录删掉，非全局书挂成附加（attach）', mw);
// B 负控制：「本卡专用」分支改成恒真 ⇒ A4f 的第三支路被误判进 save
const bf4 = broken('engines/setup-plan.js', '} else if (ov.has(key)) {', '} else if (true) {');
if (bf4.miss) a(false, 'B4 负控制锚点未命中（leavePlan 专用键分支已改）');
else {
  const lp2 = bf4.WA.setupPlan.leavePlan(items4, live4, ['v2']);
  a(!(!('v3' in lp2.restore) && !('v3' in lp2.save)),
    'B4 负控制：专用键判定恒真 ⇒ 全局改动被当成本卡专用吞掉（判据翻红）', lp2);
}

// ── 5 floor-census ───────────────────────────────────
const FC = WA.floorCensus;
const cen = FC.unsentFloors([3, 4, 7], [1], 0);
a(cen.end === 3 && cen.hidden.join(',') === '1' && cen.other.join(',') === '2',
  'A5a 分界点取最小发出楼号；隐藏归 hidden、没隐藏归 other，第 0 楼不进 other',
  { end: cen.end, hidden: cen.hidden, other: cen.other });
const cen0 = FC.unsentFloors([], [], 5);
a(cen0.end === 5 && cen0.other.join(',') === '1,2,3,4' && cen0.hidden.length === 0,
  'A5b 一楼都没发 ⇒ 用调用方给的 before 当分界点', cen0);
const cenH = FC.unsentFloors([3], [0, 1, 2], 0);
a(cenH.hidden.join(',') === '0,1,2' && cenH.other.length === 0,
  'A5c 全程隐藏的楼只算 hidden，不算漏发（这条读数才不会天天报警）', cenH);
a(FC.floorsText([1, 2, 3, 5, 8, 9]) === '第 1–3、5、8–9 楼',
  'A5d 连续段合并成区间（1,2,3 → 1–3）', FC.floorsText([1, 2, 3, 5, 8, 9]));
a(FC.floorsText([1, 2, 3, 5, 8, 9], 2) === '第 1–3、5 楼等',
  'A5e 段数超上限只写前几段并加「等」（一条读数不许上千字）', FC.floorsText([1, 2, 3, 5, 8, 9], 2));
const bf5a = FC.brief([3, 4, 7], [1], 0);
a(bf5a.leaked === 1 && bf5a.hidden === 1 && bf5a.text.indexOf('没隐藏却没发') > 0,
  'A5f brief 把「没隐藏却没发」单独点名（这才是问题），隐藏楼只报数', bf5a);
// B 负控制：第 0 楼也进 other ⇒ A5a 翻红（开场白被当成漏发）
const bf5 = broken('engines/floor-census.js', 'else if (i > 0) out.other.push(i);', 'else out.other.push(i);');
if (bf5.miss) a(false, 'B5 负控制锚点未命中（other 推入已改）');
else {
  const c2 = bf5.WA.floorCensus.unsentFloors([3, 4, 7], [1], 0);
  a(!(c2.other.join(',') === '2'), 'B5 负控制：第 0 楼进 other ⇒ 开场白被当成漏发（判据翻红）', c2.other);
}

// ── 6 import-kind ────────────────────────────────────
const IK = WA.importKind;
a(IK.detectJson({ findRegex: [] }) === 'regex' && IK.detectJson([{ findRegex: '/a/' }]) === 'regex',
  'A6a 正则：有 findRegex（对象、数组都算）');
a(IK.detectJson({ type: 'script', content: 'x' }) === 'script'
  && IK.detectJson({ name: 's', content: 'x', buttons: [] }) === 'script',
  'A6b 脚本：新格式 type:script，旧格式 name+content+buttons');
a(IK.detectJson({ name: 'x', first_mes: 'hi', entries: { a: 1 } }) === 'character',
  'A6c 判型顺序即判据：同时有 first_mes 和 entries ⇒ 判角色卡（不是世界书）');
a(IK.detectJson({ spec: 'chara_card_v3', data: {} }) === 'character',
  'A6d spec 以 chara_card 开头即卡');
a(IK.detectJson({ entries: { a: { comment: 'x' } } }) === 'world', 'A6e 世界书：有 entries 对象');
a(IK.detectJson({ name: 't', custom_css: 'x' }) === 'theme'
  && IK.detectJson({ name: 't' }) === 'unknown',
  'A6f 美化要有名字**且**有主题色/custom_css；只有名字给 unknown（不猜）');
a(IK.detectJson({ prompts: [] }) === 'preset' && IK.detectJson({ openai_max_tokens: 1 }) === 'preset',
  'A6g 预设：prompts / openai_max_tokens');
a(IK.detectText('{坏 json') === 'unknown' && IK.detectText('') === 'unknown',
  'A6h 文本解析失败一律 unknown，不抛错');
a(IK.describe('unknown').indexOf('认不出') >= 0 && IK.describe('world').indexOf('世界书') >= 0,
  'A6i unknown 也要说清楚（别让用户以为认出来了）', [IK.describe('unknown'), IK.describe('world')]);
a(IK.scriptWaitsForTheme("el.style.getPropertyValue('--myTheme')", '--myTheme: red;') === true
  && IK.scriptWaitsForTheme("el.style.getPropertyValue('--SmartThemeBodyColor')", '--SmartThemeBodyColor: red;') === false,
  'A6j 脚本等的美化变量：--SmartTheme* 是酒馆自带，不算配对信号', 
  [IK.scriptWaitsForTheme("el.style.getPropertyValue('--myTheme')", '--myTheme: red;')]);
// B 负控制：去掉 first_mes 判卡 ⇒ A6c 掉到 entries 分支变 world
const bf6 = broken('engines/import-kind.js', "if ('first_mes' in j) return 'character';", 'if (false) return \'character\';');
if (bf6.miss) a(false, 'B6 负控制锚点未命中（first_mes 判卡已改）');
else {
  const k2 = bf6.WA.importKind.detectJson({ name: 'x', first_mes: 'hi', entries: { a: 1 } });
  a(k2 !== 'character', 'B6 负控制：少了 first_mes 判卡 ⇒ 卡被认成世界书（判据翻红）', k2);
}

// ── 7 chat-guard ─────────────────────────────────────
const CG = WA.chatGuard;
const d1 = CG.describeSave([{ chat_metadata: {} }, { mes: 'a' }, { mes: 'b' }]);
a(d1.messages === 2 && d1.hasIntegrity === false, 'A7a describeSave 去掉文件头算条数（chat[0] 是 chat_metadata）', d1);
const d2 = CG.describeSave([{ chat_metadata: { integrity: 'k' } }, { mes: 'a' }]);
a(d2.messages === 1 && d2.hasIntegrity === true, 'A7b 认得防覆盖校验码（有 integrity 就不轻易拦）', d2);
a(CG.readOk([]) === true && CG.readOk({}) === true && CG.readOk(null) === false && CG.readOk('x') === false,
  'A7c 空对象 {} 算读成功（= 0 条）；null/字符串算失败');
a(CG.messagesIn([{ chat_metadata: {} }]) === 0 && CG.messagesIn(null) === null && CG.messagesIn([{ mes: 'a' }]) === 1,
  'A7d 读不懂返回 null（null 要当「更长」处理），不是 0', [CG.messagesIn([{ chat_metadata: {} }]), CG.messagesIn(null)]);
const saving7 = [{ chat_metadata: {} }, { mes: 'a', send_date: 'D1', name: 'N' }, { mes: 'b', send_date: 'D2', name: 'N' }];
const disk7 = [{ chat_metadata: {} }, { mes: 'a', send_date: 'D1', name: 'N' }, { mes: 'b', send_date: 'D2', name: 'N' }];
a(CG.sameChat(saving7, disk7) === true
  && CG.sameChat(saving7, [{ chat_metadata: {} }, { mes: 'z', send_date: 'D9', name: 'N' }]) === false,
  'A7e sameChat 靠 send_date|name 认「接着聊下来的」；没有发送时间的老存档证明不了（不算）');
a(CG.worthChecking({ chat: [{ chat_metadata: {} }, { mes: 'a' }, { mes: 'b' }] }) === false
  && CG.worthChecking({ loadFailed: true }) === true,
  'A7f worthChecking：有 2 条以上且没校验码就不值得去磁盘核对（别多发请求）；读失败过必须核');
a(CG.shouldBlockSave({ loadFailed: true, chat: saving7 },
  [{ chat_metadata: {} }, { mes: 'x', send_date: 'E1' }, { mes: 'y', send_date: 'E2' }]) === true,
  'A7g 读失败过 + 磁盘那份更长 + 证明不了接得上 ⇒ 拦（这条就是那个「整档只剩开场白」的路径）');
a(CG.shouldBlockSave({ loadFailed: true, chat: saving7 }, disk7) === false,
  'A7h 读失败过但确实是接着磁盘那份聊的 ⇒ 放行（不能一律拦死）');
a(CG.shouldBlockSave({ loadFailed: false, chat: [{ chat_metadata: {} }, { mes: 'only' }] },
  [{ chat_metadata: {} }, { mes: 'a' }, { mes: 'b' }]) === true,
  'A7i 没记到读失败，但要存的只有开场白且没有校验码、磁盘更长 ⇒ 也拦（②）');
a(CG.shouldBlockSave({ loadFailed: true, chat: saving7 }, null) === true,
  'A7j 读不到磁盘条数 ⇒ 按「更长」处理（③，不赌）');
a(CG.shouldBlockGroupSave(true, saving7,
  [{ chat_metadata: {} }, { mes: 'x', send_date: 'E1' }, { mes: 'y', send_date: 'E2' }]) === true
  && CG.shouldBlockGroupSave(false, saving7, null) === false,
  'A7k 群聊口径更粗：读失败过且证明不了就拦；没读失败就不拦');
// B 负控制：读不到磁盘时不再按更长处理 ⇒ A7j 翻红
const bf7 = broken('engines/chat-guard.js', 'if (onDisk === null) return true;', 'if (onDisk === null) return false;');
if (bf7.miss) a(false, 'B7 负控制锚点未命中（null 当更长分支已改）');
else {
  const b7 = bf7.WA.chatGuard.shouldBlockSave({ loadFailed: true, chat: saving7 }, null);
  a(b7 !== true, 'B7 负控制：读不到磁盘就不拦 ⇒ 空壳把整档钉死（判据翻红）', b7);
}

// ── 8 macro-guard ────────────────────────────────────
const MG = WA.macroGuard;
a(MG.hasSideEffect('{{setvar::a::1}}') === true && MG.hasSideEffect('{{random::1::9}}') === true
  && MG.hasSideEffect('{{char}} 你好') === false,
  'A8a 认得出有副作用的宏（set/add/inc/dec/random/roll/pick），普通宏不算');
a(MG.macros('{{char}} 与 {{random::1::3}}').join(',') === 'char,random',
  'A8b 抓宏名去重（只报名字，不报值 —— 值可能是变量内容）', MG.macros('{{char}} 与 {{random::1::3}}'));
const aud = MG.audit('{{char}} 和 {{setvar::k::1}} 和 {{random::1::3}}');
a(aud.keepsRaw.join(',') === 'setvar,random' && aud.substitutes.join(',') === 'char',
  'A8c audit 把宏分成「可替换」与「原样保留」两堆', { keepsRaw: aud.keepsRaw, substitutes: aud.substitutes });
const out8 = MG.safeSubstitute('{{char}} 与 {{random::1::3}}', function (whole) {
  return whole === '{{char}}' ? '小明' : 'XXXX';
});
a(out8 === '小明 与 {{random::1::3}}',
  'A8d 安全替换分段冻结：有副作用的那段原样留着，其余照替换（一条提示词里两者并存时只冻前者）', out8);
a(MG.safeSubstitute('{{char}}', null) === '{{char}}', 'A8e 没给 subst 就原样返回（不猜、不吞）');
// B 负控制：不再冻结有副作用的段 ⇒ A8d 翻红（random 被执行第二遍）
const bf8 = broken('engines/macro-guard.js', 'if (SIDE_EFFECT.test(whole)) return whole;', 'if (false) return whole;');
if (bf8.miss) a(false, 'B8 负控制锚点未命中（冻结分支已改）');
else {
  const o8 = bf8.WA.macroGuard.safeSubstitute('{{char}} 与 {{random::1::3}}', function (whole) {
    return whole === '{{char}}' ? '小明' : 'XXXX';
  });
  a(o8 !== '小明 与 {{random::1::3}}', 'B8 负控制：不冻结副作用段 ⇒ random 被替换（判据翻红）', o8);
}

// ── 9 msg-align ──────────────────────────────────────
const MA = WA.msgAlign;
const al1 = MA.align([{ content: 'A' }, { content: 'B' }],
  [{ identifier: 'x', content: 'A' }, { identifier: 'y', content: 'B' }]);
a(al1.join(',') === 'x,y', 'A9a 同长按位对齐', al1);
const al2 = MA.align([{ content: 'A' }, { content: '插进来的' }, { content: 'B' }],
  [{ identifier: 'x', content: 'A' }, { identifier: 'y', content: 'B' }]);
a(al2[0] === 'x' && al2[1] === undefined && al2[2] === 'y',
  'A9b 不同长则贪心顺序匹配，认不出的留 undefined（宁可不认一条，也不许错配）', al2);
const al3 = MA.align([{ content: 'A' }], []);
a(al3.length === 1 && al3[0] === undefined, 'A9c 结构化列表为空时逐条留空（不抛）', al3);
a(MA.textOf([{ text: '甲' }, '乙']) === '甲\n乙' && MA.loose('<b>甲</b> {{m}} ') === '甲',
  'A9d textOf 拼多段内容；loose 去标签/去宏/去空白并小写', [MA.textOf([{ text: '甲' }, '乙']), MA.loose('<b>甲</b> {{m}} ')]);
const st = MA.stat(['x', undefined, undefined], [{}, {}, {}]);
a(st.total === 3 && st.known === 1 && st.unknown === 2 && st.coverage === 0.333,
  'A9e stat 给对齐质量读数（认几条、几条空、覆盖率）', st);
// B 负控制：认不出时不留空、硬塞一个 ⇒ 「不错配」这条被破
const bf9 = broken('engines/msg-align.js', 'else out.push(undefined);', 'else out.push(null);');
if (bf9.miss) a(false, 'B9 负控制锚点未命中（认不出留空分支已改）');
else {
  const a9 = bf9.WA.msgAlign.align([{ content: 'A' }, { content: '插进来的' }, { content: 'B' }],
    [{ identifier: 'x', content: 'A' }, { identifier: 'y', content: 'B' }]);
  a(!(a9[1] === undefined), 'B9 负控制：认不出不留 undefined ⇒ 调用方拿不到「这条没认出来」（判据翻红）', a9);
}

// ── C 真跑（跨函数协同）────────────────────────────────
// C1 删除 → 合并：删除的条目在另一份副本里不许复活
const delSnap = SM.markDeleted({ data: { cards: { k: { updatedAt: '2026-02-01T00:00:00.000Z' } } }, deleted: {} },
  'cards', 'k', '2026-02-20T00:00:00.000Z');
const otherCopy = { data: { cards: { k: { updatedAt: '2026-02-01T00:00:00.000Z' } } }, deleted: {} };
const merged = SM.mergeStores(delSnap, otherCopy, NOW);
const mergedAgain = SM.mergeStores(merged, otherCopy, NOW);
a(!('k' in merged.data.cards) && merged.deleted.cards.k === '2026-02-20T00:00:00.000Z'
  && SM.sameStore(merged, mergedAgain) === true && SM.sameStore(merged, otherCopy) === false,
  'C1 删除→合并闭环：删过的条目被另一份旧副本挡住；再合一次数据面不变（幂等），与含该条目的副本判不同',
  { cards: Object.keys(merged.data.cards), again: SM.sameStore(merged, mergedAgain), vsOld: SM.sameStore(merged, otherCopy) });
// C2 压暗量 → 自检：取到的值必须让所有要用的字色都达标
// 压暗是单向的：深色字配更暗的底只会更糊（那是另一条路：换字色，不是加压暗）。
// 所以这里验的是「图上要用到的浅色字」全部达标。
const kk = C.shadeFor([200, 180, 160], [C.ON_IMAGE_TEXT, '#ffffff']);
const bg2 = [200, 180, 160].map(function (v) { return v * (1 - kk); });
const r1 = C.contrast(C.ON_IMAGE_TEXT, bg2);
const r2 = C.contrast('#ffffff', bg2);
a(kk >= C.SHADE_MIN && kk <= C.SHADE_MAX && r1 >= C.MIN_RATIO && r2 >= C.MIN_RATIO,
  'C2 shadeFor→contrast 闭环：给出的压暗量让这组图上的所有字色都 ≥ 4.5:1（实 ' + kk + '）',
  [kk, Math.round(r1 * 100) / 100, Math.round(r2 * 100) / 100]);
// C3 导入判型 → 卡摘要：同一个 JSON 两处口径一致
const cardJson = { spec: 'chara_card_v3', data: { name: '长夜将至', first_mes: '嗨', character_book: { name: '书', entries: [{ comment: '甲', keys: ['a'] }] } } };
const s3 = CF.summarizeCard(cardJson);
a(IK.detectJson(cardJson) === 'character' && s3 && s3.name === '长夜将至' && s3.bookEntries === 1,
  'C3 importKind→cardFile 闭环：判成角色卡的那份 JSON 能被摘要成同一张卡', [IK.detectJson(cardJson), s3 && s3.name]);
// C4 文件 → 卡 → 指纹比对：卡自带的世界书是不是这本
const bk = { entries: [{ comment: '甲', keys: ['a'] }, { comment: '乙', keys: ['b'] }] };
const cardWithBook = { data: { name: '卡', character_book: { name: '书', entries: bk.entries } } };
const pngCard = pngWith({ ccv3: b64(cardWithBook) });
const parsedCard = CF.cardFromPng(pngCard);
const smy = CF.summarizeCard(parsedCard);
const cmp = CF.comparePrints(smy.bookPrints, CF.entryPrints(bk.entries));
a(cmp.identical === true && cmp.same === 2 && cmp.onlyCard === 0 && cmp.onlyBook === 0,
  'C4 PNG→卡→指纹闭环：卡自带世界书与外部世界书判为同一本（零副作用，不用先导入）', cmp);
const cmp2 = CF.comparePrints(smy.bookPrints, CF.entryPrints([{ comment: '甲', keys: ['a'] }]));
a(cmp2.identical === false && cmp2.onlyCard === 1, 'C5 缺一条就不同（只报条数不报内容，避免剧透）', cmp2);
// C6 对齐 → 读数：插入一条后覆盖率下降但已知项仍然对齐
const chat6 = [{ content: 'A' }, { content: '多出来的一条' }, { content: 'B' }];
const ids6 = MA.align(chat6, [{ identifier: 'x', content: 'A' }, { identifier: 'y', content: 'B' }]);
const stat6 = MA.stat(ids6, chat6);
a(stat6.known === 2 && stat6.coverage === 0.667 && ids6[0] === 'x' && ids6[2] === 'y',
  'C6 align→stat 闭环：中间插一条后已知两条仍对齐、覆盖率 2/3', stat6);

setTimeout(function () {
  console.log('');
  console.log('STITCH-REDBIRD-V2529: ' + (fail === 0 ? 'pass' : 'FAIL') + ' ' + pass + ' / ' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
}, 60);
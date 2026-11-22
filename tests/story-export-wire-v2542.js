'use strict';
/**
 * tests/story-export-wire-v2542.js — 「导出正文」接线专锁（v2.542.23）。
 *
 * 病：`engines/story-export.js` 自 v2.529.0 入库起，产品面**零读**（登记在
 *   tests/ns-consumer-ledger.json 的 pending-wire 类，evidence 原文：「消费方应是导出按钮与
 *   「复制正文」，还没接」）。它的两个出口（build 组纯正文 / strip 剥结构化块）没有按钮叫得到，
 *   于是「把自己这局的故事拿出来」这件事全仓没有路。
 *
 * 本锁只钉四件事：
 *   ① 正控：strip 真剥掉 ws_* / nekotools / [[NT_STATUS]] / HTML；build 真跳过系统消息、
 *      真按 from/to 与收藏过滤。
 *   ② 端到端：一段同时带 ws_ 块、NT_STATUS、HTML 与 〔WA-LENS〕镜片块的正文，经
 *      build → lensStrip 后**一个内部标记都不剩**。少任一半都会漏（storyExport 不知道
 *      〔WA-LENS〕的格式，narrative-lens 不知道 ws_* 的格式——两个引擎各管一半）。
 *   ③ 接线自证：panel 的两个按钮真调 storyExport.build、真拼 lensStrip、真过 outletGate，
 *      且 HTML 段在 `data-omniscient` **之外**（正文不是全知数据，玩家视角下不能被 DOM 摘掉）。
 *   ④ 前提钉住：story-export.js 的**数据源只有 chat[].mes** —— 它不读 store、不读世界状态。
 *      将来若有人让它顺手导一份全知数据，M1 先红，而不是等着出口闸被人绕过。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');
let pass = 0, fail = 0;
function a(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } }
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }

// ── 0. 两个引擎各装一份到同一个 sandbox（不在本文件重写第二份口径）──
const SE_REL = 'engines/story-export.js';
const NL_REL = 'engines/narrative-lens.js';
const sandbox = { window: {}, console: { log: function () {}, warn: function () {}, error: function () {} } };
vm.createContext(sandbox);
try {
  vm.runInContext(rd(SE_REL), sandbox, { filename: SE_REL });
  vm.runInContext(rd(NL_REL), sandbox, { filename: NL_REL });
} catch (e) { a(false, '0a 两个引擎能装进 sandbox：' + (e && e.message)); }
const WA = sandbox.window.WorldAxis || {};
const SE = WA.storyExport, NL = WA.narrativeLens;
a(!!SE && typeof SE.strip === 'function' && typeof SE.build === 'function', '0b storyExport 两个出口都在');
a(!!NL && typeof NL.lensStrip === 'function' && typeof NL.OPEN === 'string', '0c narrativeLens.lensStrip 与块边界常量都在');
if (!SE || !NL) { console.log('STORY-EXPORT-WIRE-V2542: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }

// ── 1. 正控：strip 的四种剥离 ──
const t1 = SE.strip('<ws_stage>内部舞台</ws_stage>正文甲');
a(t1 === '正文甲', '1a strip 整段剥掉 ws_* 块（实 ' + JSON.stringify(t1) + '）');
const t2 = SE.strip('正文乙\n[[NT_STATUS]] 状态一堆字\n下一行');
a(t2.indexOf('NT_STATUS') < 0 && t2.indexOf('状态一堆字') < 0, '1b strip 整行剥掉 [[NT_STATUS]]');
const t3 = SE.strip('正文<b>丙</b>');
a(t3 === '正文丙', '1c strip 剥掉 HTML 标签（实 ' + JSON.stringify(t3) + '）');
const t4 = SE.strip('<nekotools:probe>内部</nekotools:probe>正文丁');
a(t4 === '正文丁', '1d strip 整段剥掉 nekotools:* 块');

// ── 2. 正控：build 的三条过滤（数据全在本文件，不碰宿主）──
const CHAT = [
  { is_user: true, name: 'User', mes: '甲' },
  { is_system: true, name: 'SYS', mes: '系统提示' },
  { name: 'AI', mes: '<b>乙</b>' },
  { name: 'AI', mes: '隐藏的一楼', extra: { hidden: true } },
  { name: 'AI', mes: '收藏的一楼', extra: { waxFavorite: true } }
];
const b1 = SE.build(CHAT, {});
// 5 楼里：user 甲 + AI 乙 + 隐藏楼 + 收藏楼（skipHidden 默认 false ⇒ 隐藏楼照常导出，
//   这是引擎刻意的：被为省 token 隐藏的楼层仍是剧情）
a(b1.floors === 4 && b1.text.indexOf('系统提示') < 0, '2a build 跳过系统消息、其余 4 层入文（实 ' + b1.floors + '）');
a(b1.text.indexOf('乙') >= 0 && b1.text.indexOf('<b>') < 0, '2b build 里每层都过了 strip（标签不进正文）');
const b2 = SE.build(CHAT, { skipHidden: true });
a(b2.floors === 3 && b2.text.indexOf('隐藏的一楼') < 0, '2c skipHidden=true 时隐藏楼层出文（实 ' + b2.floors + '）');
const b3 = SE.build(CHAT, { favoritesOnly: true });
a(b3.floors === 1 && b3.text.indexOf('收藏的一楼') >= 0, '2d favoritesOnly 只导收藏楼层（实 ' + b3.floors + '）');
const b4 = SE.build(CHAT, { from: 2, to: 2 });
a(b4.floors === 1 && b4.text.indexOf('乙') >= 0, '2e from/to 是闭区间（只留第 2 楼）');
const b5 = SE.build(CHAT, { includeNames: false });
a(b5.text.indexOf('AI：') < 0 && b5.text.indexOf('User：') < 0, '2f includeNames=false 不带说话人前缀');

// ── 3. 负控：没有楼层就不谎报导出 ──
const n1 = SE.build([], {});
a(n1.floors === 0 && n1.text === '', '3a 空聊天 ⇒ floors 0 且正文为空串（不编造）');
const n2 = SE.build([{ mes: '' }], {});
a(n2.floors === 0 && n2.skipped === 1, '3b 空正文楼层计进 skipped，不算导出成功');

// ── 4. 端到端：两个引擎拼成一条链，内部标记一个不剩 ──
const lensOpen = NL.OPEN, lensClose = NL.CLOSE;
const dirty = '他推开门。\n<ws_stage>舞台</ws_stage>\n[[NT_STATUS]] 血条一堆\n'
  + lensOpen + '\n镜片内部纪律不许外泄\n' + lensClose + '\n<b>雨下了一夜</b>';
const e2e = SE.build([{ name: 'AI', mes: dirty }], {});
const leakOf = function (s) {
  const marks = ['<ws_', '</ws_', 'NT_STATUS', '镜片内部纪律', lensOpen, lensClose, '<b>', '</b>'];
  return marks.filter(function (m) { return s.indexOf(m) >= 0; });
};
const onlyBuild = leakOf(e2e.text);
a(onlyBuild.indexOf(lensOpen) >= 0, '4a 只走 build 时 〔WA-LENS〕块**还在**（这是 narrative-lens 的格式，storyExport 不该知道）');
const chained = NL.lensStrip(e2e.text);
const left = leakOf(chained);
a(left.length === 0, '4b build → lensStrip 后一个内部标记都不剩（残留 ' + JSON.stringify(left) + '）');
a(chained.indexOf('雨下了一夜') >= 0 && chained.indexOf('他推开门') >= 0, '4c 剥干净之后正文本身一个字不少');
const twice = NL.lensStrip(chained);
a(twice === chained, '4d lensStrip 在剥过的文本上幂等（N 次 = 1 次）');

// ── 5. 接线自证：产品面真调了这两个出口，且顺序是先 build 再 lensStrip ──
const panel = rd('ui/panel.js');
const storySeg0 = panel.indexOf('storyPick = function');
const storySeg1 = panel.indexOf('const dl = $(', storySeg0);
const storySeg = (storySeg0 > 0 && storySeg1 > storySeg0) ? panel.slice(storySeg0, storySeg1) : '';
a(storySeg.length > 0, '5a 能从 panel.js 切出「导出正文」那段绑定');
const iBuild = storySeg.indexOf('WA.storyExport.build(');
const iLens = storySeg.indexOf('WA.narrativeLens.lensStrip(');
a(iBuild > 0 && iLens > iBuild, '5b 先 storyExport.build 再 narrativeLens.lensStrip（顺序即分工）');
a(storySeg.indexOf('storyExport.build') > 0 && storySeg.indexOf('engine-missing') > 0,
  '5c 引擎缺席时如实报 engine-missing（不假装导出了）');
const dlSeg0 = panel.indexOf("const storyDl = $('#wa-story-dl');");
const cpSeg0 = panel.indexOf("const storyCopy = $('#wa-story-copy');");
const dlSeg = (dlSeg0 > 0 && cpSeg0 > dlSeg0) ? panel.slice(dlSeg0, cpSeg0) : '';
const cpSeg = cpSeg0 > 0 ? panel.slice(cpSeg0, cpSeg0 + 1600) : '';
a(dlSeg.indexOf("outletGate('export-file')") > 0, '5d 导出 .txt 过 outletGate(export-file)');
a(cpSeg.indexOf("outletGate('clipboard')") > 0, '5e 复制正文过 outletGate(clipboard)');
const tools = rd('ui/pages/tools-page.js');
const iDl = tools.indexOf('id="wa-story-dl"');
const iCp = tools.indexOf('id="wa-story-copy"');
const iOmni = tools.indexOf('<div data-omniscient>');
a(iDl > 0 && iCp > iDl, '5f 工具页有导出 .txt 与复制正文两个按钮');
a(iDl > 0 && iOmni > iDl, '5g 两个按钮在 data-omniscient **之外**（正文不是全知数据，玩家视角下不该被 DOM 摘掉）');

// ── 6. 前提钉住：数据源只有 chat[].mes ──
const seSrc = rd(SE_REL);
const body = seSrc.slice(seSrc.indexOf('function build('), seSrc.indexOf('WA.storyExport ='));
a(body.indexOf('m.mes') > 0, '6a build 的正文源是 m.mes');
a(body.indexOf('store') < 0 && body.indexOf('WA.') < 0,
  '6b build/strip 不读 store、不读任何 WA.<ns> —— 「导出正文」不是第二条全知出口');

// ── 7. 读数面：零读账本已按纪律④出表 ──
const ledger = JSON.parse(rd('tests/ns-consumer-ledger.json'));
const E = ledger.entries || {};
a(!E.storyExport, '7a 账本里已无 storyExport（接线完成即删行，不靠改 evidence 续命）');
a(Array.isArray(ledger._discipline) && ledger._discipline.some(function (s) { return /双向一致/.test(s); }),
  '7b 纪律④「账本键集与门禁 deadNs 双向一致」仍在（删除是把账销掉，不是把判据改弱）');
a(!!(E.streamGate && E.streamGate.cls === 'pending-wire'), '7c 邻居 streamGate 仍在表内（证明删的是这一条，没误伤整表）');

console.log('STORY-EXPORT-WIRE-V2542: ' + (fail ? 'FAIL ' : 'pass（') + pass + (fail ? ' / ' + (pass + fail) : ' 项）'));
process.exit(fail ? 1 : 0);

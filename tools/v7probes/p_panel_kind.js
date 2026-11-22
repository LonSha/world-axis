'use strict';
// 探针：面板调用里，有多少是「展示读取」而非「玩家可操作」？
//
//   裁定依据（不靠命名猜测）：buildBlock 的读口性质**已被实证** ——
//   render/（4 文件）调 buildBlock 102 次，实测属纯注入装配（p_readports.js）。
//   故「面板调 buildBlock」与「render 调 buildBlock」同性质：都是在读内容，不是喂。
//   面板要展示内容就得调 buildBlock，这是它的展示职责，不构成驱动。
//
//   要看的第二个问题是 genGate 这一类：只被调 getSettings()/view()。
//   getSettings 是设置读数，view 是本节自己的读数口 —— 全是展示。
//
//   本探针只做度量，不下结论；结论要看规模再定。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);
function read(p) { try { return fs.readFileSync(path.join(BASE, p), 'utf8'); } catch (e) { return ''; } }

require(path.join(BASE, 'tests/mock.js'));
const g = global;
const LOAD = vm.runInNewContext('[' + (read('tests/run.js').match(/const LOAD = \[([\s\S]*?)\];/)[1]) + ']');
const ctx = vm.createContext(g);
for (const rel of LOAD) { try { vm.runInContext(read(rel), ctx, { filename: rel }); } catch (e) {} }
const WA = g.WorldAxis;
// 注：driverLedger 的扫描缓存自带签名（命名空间数/预取条数/装载条数），
//   扫描面一变下次 view() 自己重扫 —— 不需要（也已不再提供）invalidate()。
try { WA.store.init(); } catch (e) {}

const PROD = [];
for (const d of ['ui', 'engines', 'core', 'render', 'actors', 'direction', 'compat', 'design']) {
  (function walk(dir) {
    let ents = [];
    try { ents = fs.readdirSync(path.join(BASE, dir), { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.js')) PROD.push(rel);
    }
  })(d);
}
PROD.push('index.js');
const pf = new Map();
WA.baseUrl = '';
for (const rel of PROD) { const t = read(rel); if (t && t.length >= 16) pf.set(rel, t); }
WA.__prefetch = pf;
WA.__loadOrder = PROD.slice();

const v = WA.driverLedger.view();

// 展示口径：这些成员被面板调用只说明「面板在念数」，不说明「玩家能操作」
//   buildBlock 的读口性质有实证（render/ 102 次读）；view/getSettings/stat 是本仓
//   统一的读数口命名，且 actionDesk/workflow 从不登记它们（产品自证）。
const SHOW = { buildBlock: 1, view: 1, getSettings: 1, stat: 1, statView: 1, DEF: 1,
  summaryText: 1, invalidate: 1, why: 1, settings: 1, diagnose: 1 };

const operable = [], showOnly = [];
for (const ns of v.layerNames.L2p) {
  const w = WA.driverLedger.why(ns);
  const act = w.panelMembers.filter(function (m) { return !SHOW[m]; });
  if (act.length) operable.push({ ns: ns, act: act });
  else showOnly.push({ ns: ns, show: w.panelMembers });
}
console.log('L2p 合计 ' + v.layerNames.L2p.length);
console.log('【面板有可操作成员】' + operable.length);
console.log('【面板只做展示】' + showOnly.length);
showOnly.forEach(function (r) { console.log('   ' + r.ns + ' -> ' + r.show.join('、')); });

// 每个 L2p 引擎的完整成员表（用于人工判断口径是否合适）
console.log('\n=== L2p 成员全表 ===');
operable.forEach(function (r) {
  console.log('  ' + r.ns + ' │ 可操作: ' + r.act.join(' ') );
});

// genGate 之后是否还有别的引擎只被 diagnose 调？（diagnose 也是读口）
console.log('\n=== L2p 中被调成员含 diagnose 的引擎（diagnose 是诊断读口）===');
for (const ns of v.layerNames.L2p) {
  const w = WA.driverLedger.why(ns);
  if (w.panelMembers.indexOf('diagnose') >= 0) {
    const act = w.panelMembers.filter(function (m) { return !SHOW[m]; });
    console.log('  ' + ns + ' │ 全部=' + w.panelMembers.join(' ') + (act.length ? '' : '   ← 只读'));
  }
}
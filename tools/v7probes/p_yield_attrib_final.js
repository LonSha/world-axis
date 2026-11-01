'use strict';
/* p_yield_attrib_final.js —— OPV7-7 交付期验收探针（定版判据）
 *
 * 纪律 13（判据不许恒真）：每条判据都必须有一个「该变」和一个「不该变」的对照。
 * 纪律 14（红灯原因要对）：每条红/绿都要能指认是哪台引擎、哪一面读数。
 *
 * 定版四态：fault（构建抛异常）/ yield（有产出）/ off（开关关着）/ no-data（开着没内容）
 * 加两条单列名单：suspicious（有真实调用面却空，嫌疑）/ weakRows（容器有记录但没产出）。
 * *** stat 计数不进判定 *** —— 六版探针已证其在键名上做启发式必然误判。
 */
const fs = require('fs');
const path = require('path');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);
require(path.join(BASE, 'tests/mock.js'));
const vm = require('vm');
const rsrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const li = rsrc.indexOf('const LOAD = [');
const lj = rsrc.indexOf('];', li);
const LOAD = vm.runInNewContext('(' + rsrc.slice(rsrc.indexOf('[', li), lj + 1) + ')');
const ctx = vm.createContext(global);
const _log = console.log;
console.log = function () {};
for (const rel of LOAD) { try { vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel }); } catch (e) {} }
console.log = _log;

const WA = global.WorldAxis;
try { WA.store.init(); } catch (e) {}
WA.capabilityTier.applyTier('full');

let pass = 0, fail = 0;
function ck(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name + (extra ? ' :: ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function row(r, key) { return (r.rows || []).filter(function (x) { return x.key === key; })[0]; }

console.log('=== 判据 0：口在位 ===');
ck('yieldAttrib 是函数', typeof WA.healthPreflight.yieldAttrib === 'function');
ck('yieldAttribLine 是函数', typeof WA.healthPreflight.yieldAttribLine === 'function');

console.log('\n=== 判据 1：空世界 baseline（不该有 fault）===');
const r0 = WA.healthPreflight.yieldAttrib({ limit: 100 });
console.log('  ' + JSON.stringify({ total: r0.total, yield: r0.yield, off: r0.off, fault: r0.fault, noData: r0.noData }));
console.log('  line: ' + r0.line);
ck('ok=true', r0.ok === true);
ck('空世界 fault === 0（无引擎抛异常）', r0.fault === 0, 'fault=' + r0.fault);
ck('五态之和 === total', r0.yield + r0.off + r0.fault + r0.noData === r0.total,
  r0.yield + '+' + r0.off + '+' + r0.fault + '+' + r0.noData + ' = ' + r0.total);
ck('空世界 suspicious 为空（容器空 ⇒ 无嫌疑）', (r0.suspicious || []).length === 0,
  JSON.stringify((r0.suspicious || []).map(function (x) { return x.key; })));

console.log('\n=== 判据 2：蓝图装进世界后（region 不该被判缺陷）===');
// noSeed:true 是**故意的**：OPV7-6「开局即喂」之后，installSample 默认会把 life/bonds/org
// 一起播起来；而判据 3 要测的是「开着但没内容 → 喂一条 → yield」这一态。不显式关掉播种，
// 判据 3 的前提就被上一版的新功能悄悄吃掉了（before 直接是 yield，非恒真判据当场报红）。
// 判据 2 要的只是「蓝图装进世界了」——region 的 4 条记录来自装蓝图，与播种无关。
try { WA.playableBlueprint.installSample('town-workshop', { force: true, noSeed: true }); } catch (e) { console.log('install ERR', e.message); }
const r1 = WA.healthPreflight.yieldAttrib({ limit: 100 });
console.log('  ' + JSON.stringify({ total: r1.total, yield: r1.yield, off: r1.off, fault: r1.fault, noData: r1.noData }));
ck('播种后 fault 仍为 0', r1.fault === 0, 'fault=' + r1.fault);
ck('播种后产出面上升', r1.yield >= r0.yield, r0.yield + ' -> ' + r1.yield);
ck('region 不在 fault 名单', !(r1.faults || []).some(function (x) { return x.key === 'region'; }));
const rg = row(r1, 'region');
console.log('  region => ' + JSON.stringify(rg ? { state: rg.state, len: rg.len, records: rg.signals.records, injected: rg.signals.injected } : null));
ck('region 的容器记录被如实报出（records=4）', rg && rg.signals.records === 4, 'records=' + (rg ? rg.signals.records : '?'));

console.log('\n=== 判据 3（活性）：喂 life 数据后从 no-data 变 yield ===');
const before = row(r1, 'life');
const pid = Object.keys((WA.store.get() || {}).people || {})[0];
const g = WA.life.addGoal(pid, { text: '修好水车' });
console.log('  life.addGoal =>', JSON.stringify(g));
const r2 = WA.healthPreflight.yieldAttrib({ limit: 100 });
const after = row(r2, 'life');
console.log('  life: ' + (before ? before.state : '?') + ' -> ' + (after ? after.state : '?') + ' (len=' + (after ? after.len : '?') + ')');
ck('life 喂后 yield', after && after.state === 'yield');
ck('life 状态确实变了（判据非恒真）',
  before && before.state === 'no-data' && after && after.state === 'yield',
  (before ? before.state : '?') + ' -> ' + (after ? after.state : '?'));

console.log('\n=== 判据 4（fault 唯一定义）：抛异常 => fault，且原因写明 ===');
const realLife = WA.life.buildBlock;
WA.life.buildBlock = function () { throw new Error('injected-77'); };
const r3 = WA.healthPreflight.yieldAttrib({ limit: 100 });
WA.life.buildBlock = realLife;
const lifeF = (r3.faults || []).filter(function (x) { return x.key === 'life'; })[0];
console.log('  ' + JSON.stringify(lifeF));
ck('life 收进 fault', !!lifeF);
ck('原因写明抛异常', lifeF && /抛异常/.test(lifeF.why), lifeF ? lifeF.why : '');
ck('fault 计数 +1', r3.fault === r2.fault + 1, r2.fault + ' -> ' + r3.fault);

console.log('\n=== 判据 5（反假阳性 A）：有数据+开着+压空但没抛 => 不是 fault，是 no-data + weak ===');
WA.life.buildBlock = function () { return ''; };
const r4 = WA.healthPreflight.yieldAttrib({ limit: 100 });
WA.life.buildBlock = realLife;
const lifeN = row(r4, 'life');
const lifeW = (r4.weakRows || []).filter(function (x) { return x.key === 'life'; })[0];
console.log('  life => ' + JSON.stringify(lifeN ? { state: lifeN.state, records: lifeN.signals.records } : null));
ck('压空不抛 => no-data（不冒充缺陷）', lifeN && lifeN.state === 'no-data', lifeN ? lifeN.state : '');
ck('life 进 weakRows（容器有记录如实报）', !!lifeW, lifeW ? JSON.stringify(lifeW.mounts) : '');
ck('压空不抛时不进 fault', !(r4.faults || []).some(function (x) { return x.key === 'life'; }));

console.log('\n=== 判据 6（反假阳性 B）：stat 里有非零计数不能变成 fault ===');
// 这正是 chrono/retrieval 在旧判据下被误判的形态：stat 非零但 buildBlock 空且没抛
const realChronoStat = WA.chrono && WA.chrono.stat;
const r5 = WA.healthPreflight.yieldAttrib({ limit: 100 });
const chronoRow = row(r5, 'chrono');
console.log('  chrono => ' + JSON.stringify(chronoRow ? { state: chronoRow.state, activity: chronoRow.signals.activity } : null));
ck('chrono 不在 fault（stat 计数不进判定）', !(r5.faults || []).some(function (x) { return x.key === 'chrono'; }));
ck('chrono 的 activity 仍如实报出', chronoRow && typeof chronoRow.signals.activity === 'number');
const retRow = row(r5, 'retrieval');
ck('retrieval 不在 fault', !(r5.faults || []).some(function (x) { return x.key === 'retrieval'; }));

console.log('\n=== 判据 7（off）：开关关着 => off，且给动作不给「修」 ===');
const lifeOff = row(r5, 'life');
const origSet = WA.life.getSettings();
WA.life.setSettings({ enabled: false });
const r6 = WA.healthPreflight.yieldAttrib({ limit: 100 });
WA.life.setSettings({ enabled: origSet.enabled });
const offRow = (r6.offRows || []).filter(function (x) { return x.key === 'life'; })[0];
console.log('  关掉后 life => ' + (row(r6, 'life') ? row(r6, 'life').state : '?') + ' offRow=' + JSON.stringify(offRow));
ck('life 关掉后 off', row(r6, 'life') && row(r6, 'life').state === 'off');
ck('offRows 给出「打开它」的动作', offRow && /打开/.test(offRow.action));
ck('关掉后不进 fault', !(r6.faults || []).some(function (x) { return x.key === 'life'; }));

console.log('\n=== 判据 8（只读性）：调用前后世界规模不变 ===');
const lenBefore = JSON.stringify(WA.store.get()).length;
WA.healthPreflight.yieldAttrib({ limit: 5 });
const lenAfter = JSON.stringify(WA.store.get()).length;
ck('世界未被归因写动', lenBefore === lenAfter, lenBefore + ' vs ' + lenAfter);

console.log('\n=== 判据 9：人话（诊断面逐字取）===');
const lineTxt = WA.healthPreflight.yieldAttribLine({});
console.log('  ' + lineTxt);
ck('line 非空且不含 undefined', typeof lineTxt === 'string' && lineTxt.length > 10 && lineTxt.indexOf('undefined') < 0);
ck('line 三面都有说法', /开关关着/.test(lineTxt) && /抛异常/.test(lineTxt) && /没内容/.test(lineTxt));

console.log('\n=== 判据 10：调用面读数结构（借 render 现成读数）===');
console.log('  callFace = ' + JSON.stringify(r2.callFace));
ck('callFace 结构完整', r2.callFace && typeof r2.callFace.available === 'boolean');
ck('每行都带 injected 字段（null 表示调用面不可用/不在源表）', (r2.rows || []).every(function (x) { return x.signals && ('injected' in x.signals); }));

console.log('\n========== 汇总：' + pass + ' passed, ' + fail + ' failed ==========');
process.exit(fail === 0 ? 0 : 1);
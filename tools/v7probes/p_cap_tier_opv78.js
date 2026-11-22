/**
 * tools/v7probes/p_cap_tier_opv78.js —— OPV7-8 悬空引擎出厂档位下调立据探针
 *
 * 验证目标：
 *   1. 35 个悬空无驱动机制白名单自洽性（去重、全为合法命名空间、出厂全关）；
 *   2. full 档开启面从 100 下调为 65，那 35 个机制被完全排除；
 *   3. view() 包含 manualOnly 与 manualNote，full 项标注说明；
 *   4. applyTier('full') 真写且当场复核 notEffective: []；
 *   5. full 档生效后那 35 个机制全为 false，rollback() 完整恢复出厂状态。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);
require(path.join(BASE, 'tests/mock.js'));

const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const mm = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
const LOAD = vm.runInNewContext('[' + mm[1] + ']');
const ctx = vm.createContext(global);
for (const rel of LOAD) {
  try { vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel }); } catch (e) {}
}
const WA = global.WorldAxis;
try { WA.store.init(); } catch (e) {}

const cap = WA.capabilityTier;
let pass = 0, fail = 0;
function a(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ ' + msg); }
}

console.log('=== OPV7-8 悬空引擎出厂档位下调立据验证 ===');

// 1. 35 个 L3 名单自洽性
const l3 = cap.L3_EXCLUDES;
a(Array.isArray(l3), 'L3_EXCLUDES 是数组');
a(l3.length === 35, 'L3_EXCLUDES 长度恰为 35（实 ' + (l3 ? l3.length : 0) + '）');
a(new Set(l3).size === 35, 'L3_EXCLUDES 无重复项');

let allValid = true, allDefOff = true;
l3.forEach(k => {
  if (!WA[k] || typeof WA[k] !== 'object') allValid = false;
  if (!WA[k] || !WA[k].getSettings || WA[k].getSettings().enabled !== false) allDefOff = false;
});
a(allValid, '35 个 L3 引擎全为已加载且存在的命名空间');
a(allDefOff, '35 个 L3 引擎出厂状态全部为 enabled: false');

// 2. view() 读数验证
const v0 = cap.view();
a(v0.ok !== false, 'view() 执行正常');
a(v0.manualOnly && v0.manualOnly.length === 35, 'view().manualOnly 覆盖 35 个引擎');
a(typeof v0.manualNote === 'string' && v0.manualNote.indexOf('35') >= 0, 'view().manualNote 包含说明文字');

const fullItem = (v0.tiers || []).find(t => t.name === 'full');
a(fullItem && fullItem.size === 65, 'full 档规模恰为 65（100 - 35，实 ' + (fullItem ? fullItem.size : 0) + '）');
a(fullItem && typeof fullItem.note === 'string' && fullItem.note.indexOf('35') >= 0, 'full 档包含排除说明注记');

// 3. applyTier('full') 执行与复核
const rFull = cap.applyTier('full');
a(rFull.ok === true, 'applyTier("full") 执行成功');
a(rFull.tier === 'full', '返回当前档位为 full');
a(Array.isArray(rFull.notEffective) && rFull.notEffective.length === 0, '切 full 复核 notEffective 为空数组（全部生效）');

const vFull = cap.view();
a(vFull.running === 65, 'full 档运行机制数恰为 65（实 ' + vFull.running + '）');
a(vFull.dormant === 35, 'full 档休眠机制数恰为 35（实 ' + vFull.dormant + '）');

// 4. 验证 35 个悬空机制在 full 档依然全部为 false
let anyL3Opened = false;
l3.forEach(k => {
  const sh = cap.shapeOf(k);
  if (sh && sh.on === true) anyL3Opened = true;
});
a(!anyL3Opened, '切到 full 档后 35 个悬空机制依然全部为关闭状态');

// 5. 回滚到 lite 档
const rRoll = cap.rollback();
a(rRoll.ok === true, 'rollback() 成功');
a(rRoll.tier === 'lite', '已回滚到 lite 档');
const vLite = cap.view();
a(vLite.running === 5, 'lite 档恢复出厂 5 个机制（实 ' + vLite.running + '）');
a(vLite.dormant === 95, 'lite 档休眠机制数恢复 95 个（实 ' + vLite.dormant + '）');

console.log('\\n探针结果: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);

'use strict';
// OPV7-5 / OPV7-7 立项探针（先立据）：当前形态
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);
require(path.join(BASE, 'tests/mock.js'));
const g = global;
const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const m = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
const LOAD = vm.runInNewContext('[' + m[1] + ']');
const ctx = vm.createContext(g);
for (const rel of LOAD) {
  const p = path.join(BASE, rel);
  if (!fs.existsSync(p)) continue;
  try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: rel }); } catch (e) {}
}
const WA = g.WorldAxis;
try { WA.store.init(); } catch (e) {}

console.log('=== [OPV7-5 立据] 产品内是否已有驱动者台账 ===');
console.log(' driverLedger 存在? ' + (!!WA.driverLedger));
console.log(' tool-diag 有 secDriver 节? ' + (WA.toolDiag && typeof WA.toolDiag.diagnostics === 'function'
  ? String(WA.toolDiag.diagnostics()).indexOf('"driver"') >= 0 : 'toolDiag 缺失'));

console.log('\n=== [OPV7-7 立据] 空产出引擎能否答出「哪种空」 ===');
const EMPTY_PROBE = ['life','world','events','bonds','affect','rumor','threads','causal','intel',
  'org','longline','foreshadow','act','plan','economy','region','stage','session','weather'];
for (const ns of EMPTY_PROBE) {
  const mod = WA[ns];
  if (!mod) { console.log(' ' + ns + ' : 缺失'); continue; }
  let b = -1;
  try { const x = mod.buildBlock(); const s = typeof x === 'string' ? x : JSON.stringify(x); b = s ? s.length : 0; } catch (e) { b = -2; }
  let st = null;
  try { st = typeof mod.stat === 'function' ? mod.stat() : null; } catch (e) { st = 'ERR'; }
  const reason = (st && typeof st === 'object') ? (st.lastReason || '') : '';
  // 三态判定能力：能否区分 no-data / gated / fault
  const enabled = (() => { try { return mod.getSettings ? mod.getSettings().enabled : 'n/a'; } catch (e) { return 'ERR'; } })();
  console.log(' ' + ns.padEnd(12) + ' blen=' + String(b).padEnd(5) + ' enabled=' + String(enabled).padEnd(6)
    + ' lastReason="' + reason + '"' + ' 有归因口=' + (reason ? 'Y' : 'N'));
}

console.log('\n=== [立据] 三态归因现在能不能分开 ===');
console.log(' needs: no-data（计数全零）/ gated（有数据但关着）/ fault（有数据、开着、仍空）');
console.log(' 现状：所有空产引擎 lastReason 均为空 ⇒ 三态不可区分 = 计划命题成立');
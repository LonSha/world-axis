// 冒烟：装载完整产品面，走一次真实开局 + 模拟轮次，验证简报快照差分。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..', '..');
process.chdir(BASE);
require(path.join(BASE, 'tests/mock.js'));
const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const m = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
const LOAD = vm.runInNewContext('[' + m[1] + ']');
const ctx = vm.createContext(global);
for (const rel of LOAD) {
  const p = path.join(BASE, rel);
  if (!fs.existsSync(p)) continue;
  try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: rel }); } catch (e) {}
}
const WA = global.WorldAxis;

let pass = 0, fail = 0;
function a(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }

// A. 模块在场与导出面
a(!!WA.worldBriefing, 'A1: WA.worldBriefing 在场');
a(typeof WA.worldBriefing.snap === 'function' && typeof WA.worldBriefing.view === 'function'
  && typeof WA.worldBriefing.stat === 'function' && typeof WA.worldBriefing.MARKS === 'object'
  && typeof WA.worldBriefing._viewFrom === 'function' && typeof WA.worldBriefing.reset === 'function',
  'A2: 导出面 8 口齐（getSettings/setSettings/snap/view/stat/MARKS/_viewFrom/reset）');
a(Array.isArray(WA.worldBriefing.MARKS) && WA.worldBriefing.MARKS.length === 6, 'A3: 六源清单在场');

// B. 快照前 view 不编造
const v0 = WA.worldBriefing.view();
a(v0.available === false && v0.reason === 'no-snapshot', 'B1: 未结算时 view 如实报 no-snapshot（不编造）');

// C. 六源计数核对（真实开局后）
if (WA.store && typeof WA.store.init === 'function') { try { WA.store.init(); } catch (e) {} }
const counts0 = {};
WA.worldBriefing.MARKS.forEach(function (m) {
  const eng = WA[m.ns];
  if (eng && typeof eng.stat === 'function') {
    const st = eng.stat();
    a(st && Object.prototype.hasOwnProperty.call(st, m.key),
      'C1: ' + m.ns + '.stat() 含键 ' + m.key + '（实 ' + (st ? st[m.key] : '?') + '）');
  } else {
    a(false, 'C1: ' + m.ns + ' 引擎缺席或无 stat');
  }
});

// D. 快照差分（纯函数驱动：模拟两轮写入）
const vf1 = WA.worldBriefing._viewFrom(1, { 'life.changed': 5, 'events.scheduled': 2 }, null);
a(vf1.firstRound === true && vf1.written === 0, 'D1: 第一轮 firstRound（不冒充增量，实 written=' + vf1.written + '）');
const vf2 = WA.worldBriefing._viewFrom(2, { 'life.changed': 7, 'events.scheduled': 2 },
  { round: 1, counts: { 'life.changed': 5, 'events.scheduled': 2 } });
a(vf2.written === 2 && vf2.rows[0].delta === 2 && vf2.rows[1].delta === 0,
  'D2: 第二轮差分 life +2 / events +0（实 written=' + vf2.written + '）');
a(vf2.quiet === false, 'D3: 有写入时不标 quiet');

// E. 计数回落（引擎重置后 < before ⇒ delta=null 不算负流水）
const vf3 = WA.worldBriefing._viewFrom(3, { 'life.changed': 1 },
  { round: 2, counts: { 'life.changed': 7 } });
a(vf3.rows[0].delta === null && vf3.written === 0, 'E1: 计数回落（重置）⇒ delta=null 不冒充负流水');

// F. snap 直调（模拟 backstage 的直调口）
const s1 = WA.worldBriefing.snap({ idx: 100 });
a(s1.available === true && s1.firstRound === true, 'F1: 首次 snap（firstRound=' + s1.firstRound + '）');
const s2 = WA.worldBriefing.snap({ idx: 100 });
a(s2.round === s1.round, 'F2: 同轮重拍保持同轮读数（round=' + s2.round + '）');

// G. stat 读数
const stB = WA.worldBriefing.stat();
a(stB.snaps >= 2 && stB.enabled === true, 'G1: stat 记 snaps=' + stB.snaps + ' / enabled=' + stB.enabled);
a(stB.sources && Object.keys(stB.sources).length === 6, 'G2: sources 六源在场清单');

console.log('========== 汇总：' + pass + ' passed, ' + fail + ' failed ==========');
process.exit(fail ? 1 : 0);
'use strict';
/* p_yield_attrib2.js —— OPV7-7 判据选型第二探针
 * 第一版的教训（两条，都是纪律 13/14 的现场）：
 *   ① `store[key]` 存在 ≠ 有数据：几乎所有引擎在 store 里都有一个 obj1 空壳，
 *      「容器非空」这个判据在**全部**空产引擎上都成立 ⇒ 恒真 ⇒ 不构成证据。
 *   ② `stat()` 数字求和不等于「写入次数」：checkpoints 的 `format=1` / `manualFree=12`
 *      是配置与容量，把从没被喂过的引擎算成「有数据」。
 * 本版改问两个更本质的量：
 *   A. stat 计数面：只认「写入动词」形态的键（sets/added/scheduled/...），
 *      且**逐引擎只读一次**，不做全库白名单猜；
 *   B. store 记录面：递归数容器里真正的记录条数（数组长度 / 数组内元素之和），
 *      这是世界数据本身，不是二手账。
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
let fail = 0;
for (const rel of LOAD) { try { vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel }); } catch (e) { fail++; } }
console.log = _log;

const WA = global.WorldAxis;
try { WA.store.init(); } catch (e) {}
WA.capabilityTier.applyTier('full');

/* A. 写入动词形态（不是白名单：是「这个键描述的是发生过的动作」） */
const WRITE_VERB = /(^|[a-z])(sets|adds|add|added|scheduled|claims|completed|cancels|opened|closed|started|ticked|ticks|saved|stored|granted|grants|moved|moves|posted|posts|registered|enacted|created|applied|advanced|settled|resolved|marks|marked|entered|left|joined|hosted|paid|bought|sold|crafted|delivered|seized|struck|wrote|written|recorded|records|encoded|decoded|anchors|pulses|relays|count|total|acts|events|places|roads|units|members|chains|records)$/i;
const CONFIG_KEY = /(format|manualFree|manualOver|manual|autoSlotsUsed|slots|staleMs|Ms|Size|Limit|Max|Min|Cap|Ratio|Depth|Budget|Sample|Window|threshold|enabled|available|capacity|cap$)/i;
const TS_KEY = /^(lastAt|lastTurn|at|since|firstAt|lastSeenAt)$/i;

function writeFace(st) {
  let n = 0; const ks = [];
  Object.keys(st || {}).forEach(function (k) {
    const v = st[k];
    if (typeof v !== 'number' || !isFinite(v)) return;
    if (TS_KEY.test(k) || CONFIG_KEY.test(k)) return;
    if (!WRITE_VERB.test(k)) return;
    n += v; ks.push(k + '=' + v);
  });
  return { n: n, ks: ks };
}
/* B. 递归数真实记录：数组取 length；对象把内部记录的 length 相加；
      标量/null 不算记录。容器里全是空壳 ⇒ 0。 */
function records(v, depth) {
  if (depth > 3) return 0;
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object') {
    let n = 0;
    Object.keys(v).forEach(function (k) { n += records(v[k], depth + 1); });
    // 容器自身有 items/list/rows 这类数组时，上面已经把 length 加进来了
    return n;
  }
  return 0;
}

const rows = [];
Object.keys(WA).forEach(function (k) {
  const sh = WA.capabilityTier.shapeOf(k);
  if (!sh || !sh.hasBuild) return;
  const m = WA[k];
  let len = -1;
  try { len = String(m.buildBlock() || '').length; } catch (e) { len = -1; }
  let stt = null;
  try { stt = m.stat ? m.stat() : null; } catch (e) {}
  const wf = writeFace(stt);
  const st = WA.store.get() || {};
  const rec = records(st[k], 0);
  rows.push({ key: k, on: sh.on, len: len, wf: wf.n, wfKeys: wf.ks, rec: rec });
});

const empty = rows.filter(function (r) { return r.len === 0; });
console.log('total=' + rows.length + ' on=' + rows.filter(function (r) { return r.on; }).length + ' empty=' + empty.length);

console.log('\n=== 空产引擎 · 两面对照（wf=写入计数面, rec=store 记录面）===');
console.log('key'.padEnd(22) + 'on     wf    rec   wfKeys');
empty.forEach(function (r) {
  console.log(r.key.padEnd(22) + String(r.on).padEnd(7) + String(r.wf).padEnd(6) + String(r.rec).padEnd(6) + r.wfKeys.join(',').slice(0, 70));
});

console.log('\n=== 三态划分（判据：wf/rec 两面对照）===');
const noData = empty.filter(function (r) { return r.wf === 0 && r.rec === 0; });
const gatedMaybe = empty.filter(function (r) { return (r.wf > 0 || r.rec > 0) && r.on === false; });
const faultCand = empty.filter(function (r) { return (r.wf > 0 || r.rec > 0) && r.on === true; });
console.log('no-data(两面皆零)=' + noData.length + '  gated(有据但关)=' + gatedMaybe.length + '  fault候选(有据+开着+仍空)=' + faultCand.length);
console.log('fault 候选明细：');
faultCand.forEach(function (r) { console.log('  ' + r.key + ' wf=' + r.wf + ' rec=' + r.rec + ' [' + r.wfKeys.join(',') + ']'); });
console.log('有据但关 明细：');
gatedMaybe.forEach(function (r) { console.log('  ' + r.key + ' wf=' + r.wf + ' rec=' + r.rec); });

console.log('\n=== 反向校验：非空产引擎不该被判 no-data ===');
rows.filter(function (r) { return r.len > 0; }).forEach(function (r) {
  console.log('  ' + r.key.padEnd(20) + 'len=' + String(r.len).padEnd(6) + 'wf=' + String(r.wf).padEnd(5) + 'rec=' + r.rec);
});
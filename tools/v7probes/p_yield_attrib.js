'use strict';
/* p_yield_attrib.js —— OPV7-7 立项探针：空产出归因三态的判据可行性
 * 问题：「无数据所以空」与「有数据但构建失败」在读数上同形（都返回空串）。
 * 本探针要回答：能否用「stat() 写入计数 + store 同名容器」两面，把这两种空分开？
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

/* 配置/时间戳类键：不是「发生过多少次」的计数，必须排除，否则 staleMs=3600000
   会让一个从没被喂过的引擎看起来「有数据」——那正是「拿一个恒真的量当判据」。 */
const CONFIG_KEY = /(Ms|Size|Limit|Max|Min|Cap|Cap$|Ratio|Ratio$|threshold|Depth|Budget|Sample|Window|staleMs)/i;
const TS_KEY = /^(lastAt|lastTurn|at|since|firstAt|lastReplayAt|turnRestored|turnPersisted)$/i;

function writeCounts(st) {
  const ks = [];
  let sum = 0;
  Object.keys(st || {}).forEach(function (k) {
    const v = st[k];
    if (typeof v !== 'number' || !isFinite(v)) return;
    if (TS_KEY.test(k)) return;
    if (CONFIG_KEY.test(k)) return;      // 阈值/配置不是计数
    if (v >= 10000) return;              // 明显是毫秒/容量
    sum += Math.abs(v);
    ks.push(k + '=' + v);
  });
  return { sum: sum, ks: ks };
}
function storeShape(key) {
  const st = WA.store.get() || {};
  const v = st[key];
  if (v === undefined) return null;
  if (Array.isArray(v)) return { kind: 'arr', n: v.length };
  if (v && typeof v === 'object') {
    let n = Object.keys(v).length;
    return { kind: 'obj', n: n };
  }
  return { kind: typeof v, n: v ? 1 : 0 };
}

const rows = [];
Object.keys(WA).forEach(function (k) {
  const sh = WA.capabilityTier.shapeOf(k);
  if (!sh || !sh.hasBuild) return;
  const m = WA[k];
  let len = -1, threw = null;
  try { len = String(m.buildBlock() || '').length; } catch (e) { threw = String(e.message).slice(0, 50); }
  let stt = null;
  try { stt = m.stat ? m.stat() : null; } catch (e) {}
  const wc = writeCounts(stt);
  const ss = storeShape(k);
  rows.push({ key: k, on: sh.on, len: len, threw: threw, wc: wc.sum, wcKeys: wc.ks, store: ss });
});

const empty = rows.filter(function (r) { return r.len === 0; });
console.log('=== 有 buildBlock 的引擎 ===');
console.log('total=' + rows.length + '  on=' + rows.filter(function (r) { return r.on; }).length + '  empty=' + empty.length);

console.log('\n=== 空产引擎 × 两面判据 ===');
console.log('key'.padEnd(22) + 'on    wcSum  wcKeys                                                     store');
empty.forEach(function (r) {
  console.log(r.key.padEnd(22) + String(r.on).padEnd(6) + String(r.wc).padEnd(7) +
    (r.wcKeys.join(',').slice(0, 58)).padEnd(60) +
    (r.store ? r.store.kind + r.store.n : '-'));
});

console.log('\n=== 汇总：零数据的空产引擎里有几个「两面都为零」 ===');
const bothZero = empty.filter(function (r) { return r.wc === 0 && (!r.store || r.store.n === 0); });
const dirty = empty.filter(function (r) { return !(r.wc === 0 && (!r.store || r.store.n === 0)); });
console.log('bothZero=' + bothZero.length + '  dirty=' + dirty.length);
console.log('dirty 明细：');
dirty.forEach(function (r) {
  console.log('  ' + r.key + ' wcSum=' + r.wc + ' keys=' + r.wcKeys.join(',') + ' store=' + JSON.stringify(r.store));
});

console.log('\n=== 非空产引擎的 wc 分布（判据反向校验：有内容者不该被判 no-data）===');
const nonEmpty = rows.filter(function (r) { return r.len > 0; });
console.log('nonEmpty=' + nonEmpty.length);
nonEmpty.slice(0, 25).forEach(function (r) {
  console.log('  ' + r.key.padEnd(22) + 'len=' + String(r.len).padEnd(6) + 'wcSum=' + r.wc);
});
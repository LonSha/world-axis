'use strict';
/* p_yield_attrib5.js —— OPV7-7 判据第五探针：多挂载点扫描
 *
 * 第四版钉出的事实（三条都已在现场的读数里）：
 *   ① `life.addGoal` 返回 {ok:true} 且 life 随后能出块（len=62），但
 *      `stat()` 的写入计数 Δstat=**0** —— 引擎的写口**不记账**。
 *      ⇒ 「stat 计数全零 ⇒ no-data」会把装着数据的引擎判成没数据。
 *   ② 同一份数据挂在 `people[p_大师傅].life.goals`，而 `store.life` 是 undefined。
 *      ⇒ 「store 同名容器为空 ⇒ no-data」同样会误判。
 *   ③ 所以判据必须扫**全部硬挂载点**：store[key] / store.people[*][key] /
 *      store.world[key] / store.evolution[key]。
 *
 * 本探针验：这套多挂载点扫描，在「空世界 / 播种后 / 喂真数据后」三个现场上
 * 是否给出一致的答案（判据不能恒真，也不能误报）。
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

/* 递归数记录：数组取 length；对象把内部记录的 length 相加 */
function records(v, depth) {
  if (depth > 4) return 0;
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object') {
    let n = 0;
    Object.keys(v).forEach(function (k) { n += records(v[k], depth + 1); });
    return n;
  }
  return 0;
}
/* 多挂载点：把同一引擎可能挂的几处都数出来，逐处报（不合并成一个数就丢掉来源） */
function mounts(key) {
  const st = WA.store.get() || {};
  const out = [];
  if (st[key] !== undefined) out.push(['store.' + key, records(st[key], 0)]);
  const ppl = st.people || {};
  let pplN = 0;
  Object.keys(ppl).forEach(function (id) { if (ppl[id] && ppl[id][key] !== undefined) pplN += records(ppl[id][key], 0); });
  if (pplN) out.push(['people[*].' + key, pplN]);
  if (st.world && st.world[key] !== undefined) out.push(['world.' + key, records(st.world[key], 0)]);
  if (st.evolution && st.evolution[key] !== undefined) out.push(['evolution.' + key, records(st.evolution[key], 0)]);
  const total = out.reduce(function (a, b) { return a + b[1]; }, 0);
  return { mounts: out, total: total };
}

function scanAll(tag) {
  const keys = Object.keys(WA).filter(function (k) {
    const sh = WA.capabilityTier.shapeOf(k);
    return sh && sh.hasBuild;
  });
  const rows = keys.map(function (k) {
    const m = WA[k];
    let len = -1, threw = null;
    try { len = String(m.buildBlock() || '').length; } catch (e) { threw = String(e.message || e).slice(0, 40); len = -1; }
    const mo = mounts(k);
    return { key: k, len: len, threw: threw, m: mo.mounts, total: mo.total };
  });
  const emptyRows = rows.filter(function (r) { return r.len === 0; });
  const withData = emptyRows.filter(function (r) { return r.total > 0; });
  console.log('[' + tag + '] 引擎=' + rows.length + ' 空产=' + emptyRows.length +
    ' 空产里有数据=' + withData.length);
  withData.forEach(function (r) {
    console.log('   ' + r.key.padEnd(16) + 'len=0 挂载点=' + JSON.stringify(r.m));
  });
  return rows;
}

console.log('=== 1) 空世界 ===');
scanAll('空世界');

console.log('\n=== 2) 播种后 ===');
try { WA.playableBlueprint.installSample('town-workshop', { force: true }); } catch (e) { console.log('install ERR', e.message); }
const r2 = scanAll('播种后');

console.log('\n=== 3) 喂真数据后（life.addGoal 已知成功但不记账）===');
const pid = Object.keys((WA.store.get() || {}).people || {})[0];
try {
  const g = WA.life.addGoal(pid, { text: '修好水车', why: '灌溉停了' });
  console.log('life.addGoal =>', JSON.stringify(g));
} catch (e) { console.log('addGoal ERR', e.message); }
console.log('life 挂载点 =>', JSON.stringify(mounts('life')));
let lifeLen = -1; try { lifeLen = String(WA.life.buildBlock() || '').length; } catch (e) {}
console.log('life 产出 len =', lifeLen);

console.log('\n=== 4) 关键校验：life 若被判空产，多挂载点能否识破「其实有数据」 ===');
// 人为让 life 出不了块（模拟"有数据但构建失败"）
const realLife = WA.life.buildBlock;
WA.life.buildBlock = function () { return ''; };
const after = (function () {
  const mo = mounts('life');
  return { total: mo.total, mounts: mo.mounts };
})();
WA.life.buildBlock = realLife;
console.log('人为压空 life 后：多挂载点 total =', after.total, JSON.stringify(after.mounts));
console.log('判据结论：' + (after.total > 0 ? '有数据 ⇒ 该判 fault（真缺陷），不是 no-data' : '无数据 ⇒ no-data'));

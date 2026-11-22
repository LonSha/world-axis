'use strict';
// 查看器实际源码片段的受控输入测试；不代替真实宿主验收。
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../ui/panel.js'), 'utf8');
function check(src) {
  const start = src.indexOf('        const rawSnap =');
  const end = src.indexOf('        const b = li.budget;', start);
  if (start < 0 || end < start) throw Error('viewer source boundary missing');
  const render = new Function('WA', 'esc', 'li', 'dual', src.slice(start, end));
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (const raw of ['', '<world_axis_state>' + 'x'.repeat(5000) + '</world_axis_state>']) {
    const h = render({ render: { buildWorldSnapshot: () => raw } }, esc, {}, 'DUAL');
    if (typeof h !== 'string' || !h.includes('<pre') || !h.includes(esc(raw)) || h.includes('快照读不出')) throw Error('snapshot omitted or altered');
    if (h.includes('<world_axis_state>')) throw Error('snapshot not escaped');
  }
  for (const WA of [{}, { render: { buildWorldSnapshot() { throw Error('read failed'); } } }]) {
    const h = render(WA, esc, {}, 'DUAL');
    if (!h.includes('快照读不出')) throw Error('read failure hidden');
  }
}
function runAll(a) {
  let error = null;
  try { check(source); } catch (e) { error = e; }
  a(!error, 'viewer: long/empty/no-budget/escaped/fault (' + (error ? error.message : 'pass') + ')');
}
function runNegative(a) {
  const broken = source.replace('esc(String(rawSnap))', 'esc(String(rawSnap).slice(0, 3000))');
  let rejected = false;
  try { check(broken); } catch (e) { rejected = true; }
  a(broken !== source && rejected, 'viewer N1: truncation mutation rejected');
}
module.exports = { runAll, runNegative };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = (ok, msg) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + msg); };
  runAll(a); runNegative(a);
  console.log('v11-snapshot-viewer: ' + pass + ' pass / ' + fail + ' fail');
  process.exitCode = fail ? 1 : 0;
}

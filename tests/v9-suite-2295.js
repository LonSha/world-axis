'use strict';
// V9 scripts own isolated VMs and exit codes; execute them, never require for an empty green.
const cp = require('child_process');
const path = require('path');

function verdict(result, expected) {
  const text = String(result.stdout || '') + String(result.stderr || '');
  const reports = [...text.matchAll(/(?:^|\n)v9[^\n]*?\s(\d+)\s*\/\s*失败\s+(\d+)/g)];
  const last = reports[reports.length - 1];
  return !result.error && result.status === 0 && !!last && Number(last[1]) === expected && Number(last[2]) === 0;
}
async function runAll(assert) {
  function runChild(file, expected) {
    const r = cp.spawnSync(process.execPath, [path.join(__dirname, file)], {
      cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 300000, maxBuffer: 16 * 1024 * 1024
    });
    const ok = verdict(r, expected);
    if (!ok) console.error(file, r.error || '', String(r.stdout || '').slice(-4000), String(r.stderr || '').slice(-4000));
    assert(ok, 'V9 ' + file + ': executed ' + expected + ' assertions, zero failures, exit 0');
  }
  runChild('./v9-inject-newline-2295.js', 11);
  runChild('./v9-owner-inject-2295.js', 59);
  runChild('./v9-storyline-advance-2295.js', 32);
  runChild('./v9-backstage-chain-2295.js', 7);
  runChild('./v9-selection-changes-2295.js', 20);
  runChild('./v9-continuation-2295.js', 24);
  runChild('./v9-reject-witness-2295.js', 20);
  runChild('./v9-volume-2295.js', 6);
  runChild('./v9-browser-2295.js', 4);
  runChild('./v9-settings-browser-2295.js', 1);
  runChild('./v9-b5b6-browser-2295.js', 1);
  const green = {status: 0, stdout: 'v9 probe: 7 / 失败 0\n'};
  assert(verdict(green, 7), 'suite report parser accepts actual summary');
  assert(!verdict({status: 0, stdout: ''}, 7), 'suite rejects empty exit-zero');
  assert(!verdict({status: 0, stdout: green.stdout}, 8), 'suite rejects missing assertions');
  assert(!verdict({status: 1, stdout: green.stdout}, 7), 'suite rejects red process with green text');
  assert(!verdict({status: 0, stdout: 'v9 probe: 7 / 失败 1\n'}, 7), 'suite rejects failed summary');
}
module.exports = {runAll};
if (require.main === module) {
  let pass = 0, fail = 0;
  runAll((ok, msg) => { if (ok) pass++; else { fail++; console.error('FAIL ' + msg); } })
    .then(() => { console.log('v9 suite: ' + pass + ' / 失败 ' + fail); process.exitCode = fail ? 1 : 0; })
    .catch(e => { console.error(e.stack); process.exitCode = 1; });
}

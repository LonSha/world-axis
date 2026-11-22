#!/usr/bin/env node
'use strict';
// WorldAxis tools/shard-locks.js (v2.529.0) — OPV29-01 锁级分片并行（带逐条判据回灌）
//
// ── 病 ────────────────────────────────────────────────────────────
// `tests/run.js` 的 `v2.82.0 checkpoints …` 一节把 38 把锁**顺序**挂载，
// 实测 792.2s，占整趟回归（1780.7s）的 44.5% —— 单节就是最大一块时间。
// 而其中 36 把彼此无共享状态（v2.274.0 起 runLock 默认「锁跑完就还原世界」），
// 完全可以并行；只有 2 把是真依赖：
//   · tests/b6-b7-v2870.js  独立跑 ⇒ FAIL 1/38（`[B7-F] 清空题材连自己开的机制一并收回（实收回 0 个）`）
//     —— 它依赖前序节**先把机制开起来**，这就是「靠顺序活着」；
//   · tests/state-repair-v2108.js  独立跑 ⇒ 崩（`Cannot read properties of undefined (reading 'store')`）
//     —— 它读的全局 store 由共享宿主提供。
//   实测：36 把可真并行，8 路墙钟 244s（对照 792.2s）。
//
// ── 三条不许的假绿（本工具全部踩过一遍）──────────────────────────
//   ① **rc=0 不等于判了**：38 把里有 11 把没有 `require.main` 块，
//      `node tests/x.js` 会装载引擎、零判据、返回 0。故本工具**只**经由
//      `tools/lock-child.js` 起子进程，并强制要求子进程给出 `pass (N)` / `FAIL a/b`，
//      拿不到就报 `no-criteria`（红），不当成通过。
//   ② **并行不许缩小被测面**：子进程的逐条 `✓/✗` 必须**回灌**给宿主的 assert，
//      否则宿主只记一条「36 把锁并行通过」，判据数从 2843 塌成几十条 —— 看着更快，实则少了判据。
//      回灌条数与子进程自报的 N 不等 ⇒ 直接红（`回灌不完整`）。
//   ③ **崩溃与判据红分开**：rc=2（锁体抛异常）与 rc=1（判据失败）是两种病，读数里分开记。
//
// ── 用法 ──────────────────────────────────────────────────────────
//   node tools/shard-locks.js --list            # 看清单账本（哪些可独立 / 哪些必须串行）
//   node tools/shard-locks.js --run             # 真并行跑（8 路）并打印逐锁读数
//   node tools/shard-locks.js --run --jobs=4
//   node tools/shard-locks.js --check           # 只校验账本与现场（不跑锁）
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const CHILD = path.join(ROOT, 'tools', 'lock-child.js');
const LEDGER = path.join(ROOT, 'tests', 'shard-locks-v2529.json');
const DEFAULT_JOBS = 8;

function loadLedger(root) {
  try {
    const o = JSON.parse(fs.readFileSync(path.join(root || ROOT, 'tests/shard-locks-v2529.json'), 'utf8'));
    return o && typeof o === 'object' && o.groups ? o : null;
  } catch (e) { return null; }
}

/** 解析一个 lock-child 子进程的输出：逐条判据 + 自报总数 + 病名。 */
function parseChild(out, rc) {
  const lines = String(out || '').split('\n');
  const rows = [];
  let reported = null, failReported = null, kind = 'ok';
  lines.forEach(function (l) {
    let m = l.match(/^\s*✓ (.+?)\s*$/);
    if (m) { rows.push({ ok: true, name: m[1] }); return; }
    m = l.match(/^\s*✗ (.+?)(?:\s+—\s+(.*))?$/);
    if (m) { rows.push({ ok: false, name: m[1], extra: m[2] || '' }); return; }
  });
  let m = String(out).match(/LOCK-CHILD .*?: pass \((\d+)\)/);
  if (m) reported = Number(m[1]);
  m = String(out).match(/LOCK-CHILD .*?: FAIL (\d+)\/(\d+)/);
  if (m) { failReported = Number(m[1]); reported = Number(m[2]); }
  if (/no-criteria/.test(out)) kind = 'no-criteria';
  else if (/LOCK-CHILD crashed/.test(out)) kind = 'crashed';
  else if (/missing-method/.test(out)) kind = 'missing-method';
  else if (rc === 2) kind = 'crashed';
  else if (rc === 3) kind = 'no-criteria';
  return { rows: rows, reported: reported, failReported: failReported, kind: kind, rc: rc };
}

/** 跑一把锁（子进程），返回解析结果与耗时。 */
function runOne(file, opts) {
  const t0 = Date.now();
  const r = cp.spawnSync(process.execPath, [CHILD, file], {
    cwd: ROOT, encoding: 'utf8', timeout: (opts && opts.timeoutMs) || 900000
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const p = parseChild(out, r.status === null ? -1 : r.status);
  p.file = file;
  p.ms = Date.now() - t0;
  return p;
}

/**
 * 并行跑一组锁，并把每把锁的逐条判据**回灌**给宿主 assert。
 * 回灌不完整（条数 ≠ 子进程自报 N）⇒ 红；崩溃/空转/缺方法 ⇒ 红（各带病名）。
 */
function runParallel(assert, files, opts) {
  const o = opts || {};
  const jobs = Math.max(1, Number(o.jobs) || DEFAULT_JOBS);
  const results = [];
  return new Promise(function (resolve) {
    let idx = 0, live = 0;
    function pump() {
      while (live < jobs && idx < files.length) {
        const file = files[idx++];
        live += 1;
        const t0 = Date.now();
        const ch = cp.spawn(process.execPath, [CHILD, file], { cwd: ROOT });
        let buf = '';
        ch.stdout.on('data', function (d) { buf += d; });
        ch.stderr.on('data', function (d) { buf += d; });
        ch.on('close', function (code) {
          live -= 1;
          const p = parseChild(buf, code === null ? -1 : code);
          p.file = file; p.ms = Date.now() - t0;
          results.push(p);
          pump();
        });
      }
      if (live === 0 && idx >= files.length) {
        // 回灌（按清单顺序，保证输出稳定可 diff）
        results.slice().sort(function (a, b) { return files.indexOf(a.file) - files.indexOf(b.file); })
          .forEach(function (p) {
            const tag = '（' + p.file + '）';
            if (p.kind === 'crashed') { assert(false, 'SHARD 锁体崩溃' + tag, 'rc=2'); return; }
            if (p.kind === 'no-criteria') { assert(false, 'SHARD 锁零判据（空转，不算通过）' + tag, 'rc=3'); return; }
            if (p.kind === 'missing-method') { assert(false, 'SHARD 缺方法' + tag); return; }
            p.rows.forEach(function (r) { assert(r.ok, r.name + tag, r.extra); });
            if (p.reported === null) {
              assert(false, 'SHARD 子进程未自报判据数' + tag);
            } else if (p.rows.length < p.reported) {
              // 回灌**少于** assert 计数 ⇒ 真的丢了判据（这是要抓的方向）
              assert(false, 'SHARD 判据回灌不完整' + tag,
                '回灌 ' + p.rows.length + ' < 子进程自报 ' + p.reported);
            } else if (p.rows.length > p.reported) {
              // 回灌**多于** assert 计数：本仓有一批锁自己 console.log('✓ …') 一遍，
              //   再经宿主 assert 打一遍（双重打印，实测 10 把）。这不是丢判据，
              //   但必须**看得见**——否则「判据数为何比账本多」又变成一笔糊涂账。
              assert(true, 'SHARD 自打判据额外 ' + (p.rows.length - p.reported) + ' 行' + tag,
                '（锁内自打 ✓ + 经 assert 各一遍，非丢判据）');
            }
          });
        resolve(results);
      }
    }
    if (!files.length) { resolve(results); return; }
    pump();
  });
}

/** 只测每把锁的耗时（串行，供账本更新；很慢，别在门禁里调）。 */
function measure(files, opts) {
  return files.map(function (f) { return runOne(f, opts); });
}

function main() {
  const argv = process.argv.slice(2);
  const mode = argv.indexOf('--run') >= 0 ? 'run' : (argv.indexOf('--check') >= 0 ? 'check' : 'list');
  let jobs = DEFAULT_JOBS;
  argv.forEach(function (a) { if (a.indexOf('--jobs=') === 0) jobs = Number(a.slice(7)); });
  const led = loadLedger(ROOT);
  if (!led) { console.error('缺账本 tests/shard-locks-v2529.json'); process.exitCode = 3; return; }
  const groups = Object.keys(led.groups);
  if (mode === 'list' || mode === 'check') {
    groups.forEach(function (g) {
      const it = led.groups[g];
      console.log('■ ' + g + '：可并行 ' + it.parallel.length + ' 把 · 必须串行 ' + it.serial.length + ' 把'
        + (it.sharedMs ? ' · 共享世界实测 ' + (it.sharedMs / 1000).toFixed(1) + 's' : ''));
      it.serial.forEach(function (s) { console.log('   [串行] ' + s.file + ' — ' + s.why); });
    });
    if (mode === 'check') {
      let bad = 0;
      groups.forEach(function (g) {
        led.groups[g].parallel.concat(led.groups[g].serial).forEach(function (x) {
          if (!fs.existsSync(path.join(ROOT, 'tests', x.file))) { console.log('✗ 账本里的锁不存在：' + x.file); bad += 1; }
        });
      });
      console.log(bad ? '✗ 账本与现场不符 ' + bad + ' 处' : '✓ 账本与现场一致');
      if (bad) process.exitCode = 1;
    }
    return;
  }
  // run：逐组并行跑（只跑 parallel 段；serial 段由宿主 run.js 继续顺序挂载）
  let pass = 0, fail = 0;
  function assert(cond, name, extra) {
    if (cond) { pass += 1; console.log('  ✓ ' + name); }
    else { fail += 1; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
  }
  const g = groups[0];
  const files = led.groups[g].parallel.map(function (x) { return x.file; });
  const t0 = Date.now();
  runParallel(assert, files, { jobs: jobs }).then(function (res) {
    const ms = Date.now() - t0;
    console.log('\n■ 并行完成：' + files.length + ' 把 · 墙钟 ' + (ms / 1000).toFixed(1) + 's · 判据 ' + (pass + fail)
      + '（红 ' + fail + '）');
    const bad = res.filter(function (r) { return r.kind !== 'ok'; });
    console.log(bad.length ? '✗ 异常锁 ' + bad.length + '：' + bad.map(function (r) { return r.file + '/' + r.kind; }).join(',') : '✓ 无非预期异常');
    if (fail || bad.length) process.exitCode = 1;
  });
}

module.exports = {
  loadLedger: loadLedger, parseChild: parseChild, runOne: runOne,
  runParallel: runParallel, measure: measure, LEDGER: LEDGER, DEFAULT_JOBS: DEFAULT_JOBS
};
if (require.main === module) main();
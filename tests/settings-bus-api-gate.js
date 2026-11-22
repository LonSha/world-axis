/**
 * WorldAxis tests/settings-bus-api-gate.js (v2.381.0)
 *
 * 「调用了不存在的 settingsBus 成员」门禁。
 *
 * 由来（真实缺陷，非假想）：
 *   v2.380.0 时全仓有 2 处 `WA.settingsBus.write(...)` —— engines/court-intrigue.js 与
 *   engines/idiosyncrasy.js。settingsBus 的导出面（34 个成员）里**从来没有 `write`**，
 *   只有 save / saveOrThrow。这类缺陷的特征是**静默**：
 *     · 写口抛 TypeError，若被外层 catch 吞掉 ⇒ 表现为「设置改了不生效」；
 *     · 静态语法检查（node --check）全过 —— 因为语法完全合法；
 *     · 现有门禁全绿 —— 因为没有一条门禁把「调用名」与「真实导出面」对齐比对。
 *
 * 判据：真源不是源码文本正则，而是**真的把 core/settings-bus.js 跑起来**，
 *   `Object.keys(WA.settingsBus)` 就是唯一权威导出面。扫描侧也做真实词法剥离
 *   （注释 / 字符串 / 模板串），只统计 `settingsBus.X(` 形态的**直接调用**，
 *   避免 `key: 'settingsBus.write'` 这类观测点字面量、以及 `writeStat()` 之类前缀误判。
 *
 * 用法：
 *   node tests/settings-bus-api-gate.js          # 校验
 *   node tests/settings-bus-api-gate.js --json   # 机器可读
 *   node tests/settings-bus-api-gate.js --list   # 只打印真实导出面
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

// ── 1. 取得权威导出面：真跑 settings-bus.js ─────────────────────────────────
function loadSurface() {
  const prev = { window: global.window, WorldAxis: global.WorldAxis, localStorage: global.localStorage };
  global.window = global;
  global.WorldAxis = {};
  const _d = {};
  global.localStorage = {
    getItem: (k) => (k in _d ? _d[k] : null),
    setItem: (k, v) => { _d[k] = String(v); },
    removeItem: (k) => { delete _d[k]; },
  };
  const WA = global.WorldAxis;
  WA.log = function () { };
  WA.clock = { now: () => Date.now(), wallNow: () => Date.now(), label: () => 't' };
  WA.store = { chatId: 'gate', classifyKey: () => 'settings' };
  WA.permissions = { gate: () => ({ ok: true }) };
  WA.mainWin = { get: () => null };
  WA.version = 'gate';
  try {
    vm.runInThisContext(
      fs.readFileSync(path.join(ROOT, 'core/settings-bus.js'), 'utf8'),
      { filename: 'core/settings-bus.js' }
    );
  } finally {
    // 立刻还原宿主，别让本门禁污染后续 require
    global.window = prev.window;
    global.WorldAxis = prev.WorldAxis;
    global.localStorage = prev.localStorage;
  }
  if (!WA.settingsBus) throw new Error('core/settings-bus.js 未导出 WA.settingsBus');
  return Object.keys(WA.settingsBus).sort();
}

// ── 2. 词法剥离：注释 / 普通串 / 模板串 ─────────────────────────────────────
// 目的不是完美词法器，而是把「看起来像调用但其实是注释或字符串」的假阳性清零。
function strip(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  let st = null;
  let esc = false;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (st) {
      if (esc) { esc = false; i++; continue; }
      if (c === '\\') { esc = true; i++; continue; }
      if (c === st) { st = null; }
      out.push(c === '\n' ? '\n' : ' ');
      i++;
      continue;
    }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out.push(' '); i++; } continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out.push(src[i] === '\n' ? '\n' : ' '); i++; }
      out.push('  '); i += 2; continue;
    }
    if (c === '"' || c === "'" || c === '`') { st = c; out.push(' '); i++; continue; }
    out.push(c); i++;
  }
  return out.join('');
}

// ── 3. 全仓收集 .js（跳过 node_modules / .git）──────────────────────────────
function collect(dir, acc) {
  fs.readdirSync(dir).forEach((name) => {
    if (name === 'node_modules' || name === '.git') return;
    const p = path.join(dir, name);
    let st;
    try { st = fs.statSync(p); } catch (e) { return; }
    if (st.isDirectory()) collect(p, acc);
    else if (name.slice(-3) === '.js') acc.push(p);
  });
  return acc;
}

// ── 4. 扫描 ────────────────────────────────────────────────────────────────
function audit() {
  const surface = loadSurface();
  const files = collect(ROOT, []);
  const hits = {};      // name -> [{file,line}]
  const callKinds = {}; // 全部直接调用名

  files.forEach((f) => {
    let raw;
    try { raw = fs.readFileSync(f, 'utf8'); } catch (e) { return; }
    if (raw.indexOf('settingsBus') < 0) return;
    const src = strip(raw);
    const lines = src.split('\n');
    lines.forEach((ln, idx) => {
      const re = /settingsBus\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;
      let m;
      while ((m = re.exec(ln)) !== null) {
        const name = m[1];
        callKinds[name] = (callKinds[name] || 0) + 1;
        (hits[name] = hits[name] || []).push({
          file: path.relative(ROOT, f),
          line: idx + 1,
        });
      }
    });
  });

  const missing = Object.keys(hits).sort().filter((n) => surface.indexOf(n) < 0)
    .map((n) => ({ name: n, sites: hits[n] }));

  return { surface, files: files.length, callKinds, missing };
}

// ── 5. 出口 ────────────────────────────────────────────────────────────────
function main() {
  const argv = process.argv.slice(2);
  let r;
  try {
    r = audit();
  } catch (e) {
    console.log('[settings-bus-api-gate] ERROR: ' + e.message);
    process.exit(1);
  }

  if (argv.indexOf('--list') >= 0) {
    console.log('WA.settingsBus 真实导出面（' + r.surface.length + '）：');
    r.surface.forEach((n) => console.log('  ' + n));
    return;
  }

  if (argv.indexOf('--json') >= 0) {
    console.log(JSON.stringify({
      ok: r.missing.length === 0,
      files: r.files,
      surfaceCount: r.surface.length,
      callKinds: r.callKinds,
      missing: r.missing,
    }, null, 2));
    process.exit(r.missing.length === 0 ? 0 : 1);
    return;
  }

  console.log('═══ settings-bus-api-gate ═══');
  console.log('扫描文件: ' + r.files + '    真实导出面成员: ' + r.surface.length
    + '    被调用的成员种类: ' + Object.keys(r.callKinds).length);

  if (!r.missing.length) {
    console.log('✓ 全部直接调用都落在真实导出面内');
    return;
  }

  console.log('✗ 发现调用了不存在的成员（' + r.missing.length + ' 种）：');
  r.missing.forEach((t) => {
    console.log('  · settingsBus.' + t.name + '  (' + t.sites.length + ' 处)');
    t.sites.forEach((s) => console.log('      ' + s.file + ':' + s.line));
  });
  console.log('');
  console.log('修法：settingsBus 的写口是 save / saveOrThrow（原本就没有 write）。');
  process.exit(1);
}

if (require.main === module) main();

module.exports = { audit, loadSurface };

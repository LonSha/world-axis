#!/usr/bin/env node
/**
 * WorldAxis tools/secret-scan.js (v2.529.0) — OPV29-33 密钥扫描扩面
 *
 * ── 它治什么（本版现场）─────────────────────────────────────────────
 *   设置面回填 apiKey 时有人盯着（`ui/panel.js` 的通道输入框），但**仓库本身**没人盯：
 *   手写脚本里的调试串、跑出来的日志、临时目录里的 json —— 这三处最容易把一次真调用的
 *   key 粘进去，而它们都不在任何「设置面」里。最贵的形态不是「key 写在代码里」，
 *   而是「key 写在一次调试的临时文件里，然后被 commit 进去」。
 *
 * ── 口径（先说不做什么）─────────────────────────────────────────────
 *   ① **不做「见 sk- 就报」**。本仓测试里有一批**自证样本**（形如 `sk-` + 英文命名短语，
 *      如 `sk-` 接「pooling-mutual-aid-v2233」），它们是判据的素材，不是泄漏。分辨靠两条**可复算**的机械特征：
 *      · 含占位词（xxx / your / example / demo / sample / mock / changeme / secret /
 *        token / dummy / fake / test / placeholder / redacted）；
 *      · 或形态是「连字符分段、每段都是纯字母单词」——那种带 `-` 的英文短语是**命名**，
 *        真 key 不长这样（真 key 是同一段高熵随机串）。
 *      再加一条低熵护栏：字符种数 < 10 一律算占位。
 *   ② **「猜不出来」不当成「干净」**。真正的判定只有两种结果：`real`（红）或 `placeholder`
 *      （点名但不红）。第三条路「拿不准所以跳过」不存在 —— 那等于把不确定性藏起来。
 *   ③ **扫描面必须能扩**。默认扫仓库内文本文件，`--dir=` 可追加任意目录（日志 / 临时文件 /
 *      下载目录）——「扩面」是这个工具存在的理由，不是可选项。
 *   ④ **不打印密文本体**。报告里只给「文件:行 + 前 6 位 + 长度」，避免扫描报告自己变成泄漏源。
 *
 * ── 用法 ──────────────────────────────────────────────────────
 *   node tools/secret-scan.js                        # 仓库面，红则 exit 1
 *   node tools/secret-scan.js --dir=/tmp --json      # 扩到临时目录
 *   node tools/secret-scan.js --root=<树> --quiet    # 负控制 / 合成树
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const TEXT_EXT = ['.js', '.json', '.md', '.txt', '.html', '.css', '.yml', '.yaml', '.log', '.sh', '.env'];
/** 占位词：命中即为「样本 / 示例 / 占位」，不是泄漏。 */
const PLACE_WORDS = ['xxx', 'your', 'example', 'demo', 'sample', 'mock', 'changeme',
  'secret', 'token', 'dummy', 'fake', 'test', 'placeholder', 'redacted', 'placeholder'];
/** 候选形态：只在「键名像凭证」处取候选，不做全文乱扫。 */
const PATTERNS = [
  { name: 'sk-', re: /\bsk-[A-Za-z0-9_-]{16,}/g },
  { name: 'ghp_', re: /\bghp_[A-Za-z0-9]{20,}/g },
  { name: 'aws-akia', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'bearer', re: /\bBearer\s+([A-Za-z0-9._-]{20,})/g },
  { name: 'apiKey', re: /["']apiKey["']\s*:\s*["']([^"']{12,})["']/g }
];

/** 高熵判据（可复算，三条机械规则）。 */
function looksReal(v) {
  if (typeof v !== 'string' || v.length < 24) return false;
  if (/^(.)\1+$/.test(v)) return false;
  const lower = v.toLowerCase();
  for (let i = 0; i < PLACE_WORDS.length; i += 1) {
    if (lower.indexOf(PLACE_WORDS[i]) >= 0) return false;
  }
  const hasNum = /\d/.test(v);
  const hasAlpha = /[A-Za-z]/.test(v);
  if (!hasNum || !hasAlpha) return false;
  if (v.indexOf('-') >= 0) {
    const segs = v.split('-').filter(Boolean);
    // 「命名」的形态是**每段都是短英文词**（pooling / mutual / aid / v2233）。
    //   初版漏了长度条件，于是 `sk-<32 位随机串>` 这种「两段」形态被判成命名 ——
    //   而这正是真 key 最常见的写法：一跑判据，C1/C1c/C3/D1 全红（假阴性）。
    //   修法：段长 > 16 一律不算命名（命名不会那么长）。
    const allShortWordy = segs.every(function (s) {
      return s.length <= 16 && /^[A-Za-z][A-Za-z0-9]*$/.test(s);
    });
    if (allShortWordy && segs.length >= 2) return false;
  }
  const uniq = {};
  for (let i = 0; i < v.length; i += 1) uniq[v[i]] = 1;
  if (Object.keys(uniq).length < 10) return false;    // 字符种数太少 ⇒ 低熵
  return true;
}

function mask(v) {
  const s = String(v);
  return s.slice(0, 6) + '…(' + s.length + ')';
}

function collect(dir, out, opts) {
  let ents = [];
  try { ents = fs.readdirSync(dir); } catch (e) { return; }
  ents.forEach(function (n) {
    if (n === '.git' || n === 'node_modules') return;
    const p = path.join(dir, n);
    let st;
    try { st = fs.statSync(p); } catch (e) { return; }
    if (st.isDirectory()) { collect(p, out, opts); return; }
    if (!st.isFile()) return;
    if (TEXT_EXT.indexOf(path.extname(n).toLowerCase()) < 0) return;
    if (opts && opts.maxBytes && st.size > opts.maxBytes) return;
    out.push(p);
  });
}

function scanText(text, rel) {
  const real = [], placeholder = [];
  PATTERNS.forEach(function (pt) {
    pt.re.lastIndex = 0;
    let m;
    while ((m = pt.re.exec(text)) !== null) {
      const raw = m[1] !== undefined ? m[1] : m[0];
      const line = text.slice(0, m.index).split('\n').length;
      const hit = { file: rel, line: line, kind: pt.name, masked: mask(raw) };
      if (looksReal(raw)) real.push(hit); else placeholder.push(hit);
    }
  });
  return { real: real, placeholder: placeholder };
}

function scan(opts) {
  const o = opts || {};
  const root = o.root ? path.resolve(o.root) : ROOT;
  const extra = o.dirs || [];
  const files = [];
  collect(root, files, o);
  extra.forEach(function (d) {
    const p = path.resolve(d);
    if (p === root) return;
    collect(p, files, o);
  });
  const real = [], placeholder = [], parseErrors = [];
  files.forEach(function (f) {
    let t;
    try { t = fs.readFileSync(f, 'utf8'); } catch (e) { parseErrors.push(f); return; }
    const r = scanText(t, path.relative(root, f) || f);
    r.real.forEach(function (x) { real.push(x); });
    r.placeholder.forEach(function (x) { placeholder.push(x); });
  });
  return {
    root: root,
    extraDirs: extra,
    scanned: files.length,
    real: real,
    placeholder: placeholder,
    unreadable: parseErrors.length,
    ok: real.length === 0
  };
}

function report(r) {
  const L = [];
  L.push('■ 密钥扫描（OPV29-33）  root=' + r.root + (r.extraDirs.length ? '  +dir=' + r.extraDirs.join(',') : ''));
  L.push('  扫了 ' + r.scanned + ' 个文本文件（读不动 ' + r.unreadable + ' 个）');
  L.push('  真密钥 ' + r.real.length + ' · 占位/样本 ' + r.placeholder.length);
  if (r.placeholder.length) {
    L.push('  ── 占位/样本（点名，不红）──');
    r.placeholder.slice(0, 10).forEach(function (x) {
      L.push('    · ' + x.file + ':' + x.line + '  [' + x.kind + '] ' + x.masked);
    });
    if (r.placeholder.length > 10) L.push('    …另有 ' + (r.placeholder.length - 10) + ' 处');
  }
  if (r.ok) L.push('  结论：通过（0 条真密钥）');
  else {
    L.push('  结论：不通过（' + r.real.length + ' 条真密钥）—— 报告只给前 6 位与长度，不打印本体');
    r.real.slice(0, 10).forEach(function (x) {
      L.push('    ✗ ' + x.file + ':' + x.line + '  [' + x.kind + '] ' + x.masked);
    });
  }
  return L.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  let root = ROOT, asJson = false, dirs = [], quiet = false, maxBytes = 0;
  argv.forEach(function (a) {
    if (a.indexOf('--root=') === 0) root = path.resolve(a.slice(7));
    else if (a.indexOf('--dir=') === 0) dirs.push(path.resolve(a.slice(6)));
    else if (a === '--json') asJson = true;
    else if (a === '--quiet') quiet = true;
    else if (a.indexOf('--max-bytes=') === 0) maxBytes = Number(a.slice(12)) || 0;
    else { console.error('未知参数：' + a); process.exitCode = 3; }
  });
  const r = scan({ root: root, dirs: dirs, maxBytes: maxBytes });
  if (asJson) console.log(JSON.stringify(r, null, 2));
  else if (!quiet || !r.ok) console.log(report(r));
  process.exitCode = r.ok ? 0 : 1;
}

module.exports = { scan: scan, looksReal: looksReal, report: report, PATTERNS: PATTERNS, PLACE_WORDS: PLACE_WORDS };
if (require.main === module) main();
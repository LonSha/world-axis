'use strict';
// WorldAxis tests/opv29-z6-13-v2529.js — OPV29-13 拒收码话术覆盖率（读数 + 负控制）
//
// ── 病 ────────────────────────────────────────────────────────────
// `engines/reject-phrase.js` 早就有话术面（五簇 + phraseOf），但**覆盖率从来没人量化**。
// 没有读数就回答不了两个具体问题：玩家现在会撞到多少个裸码？新加一个码时谁提醒我它没话术？
// 立项时我写的第一版 `tools/phrase-coverage.js` 自己就有这个病：它把
// `reject-code-ledger.json` 的 `base` 当成「码 → 说明」的对象去 `Object.keys` ——
// 而 `base` 是**字符串数组**，于是拿到的是 "0","1","2"… 下标，覆盖率恒为 0%。
// 更糟的是同一份文件里还钉着一条**凭空编的** `BASELINE_PERCENT = 63.0`。
// 两个错凑在一起，读数看起来「有数字、有达标线、有结论」，但两个数字没有一个来自现场。
//
// ── 本锁守什么 ────────────────────────────────────────────────────
// A 真实读数：1853 / 1905 / 52 / 937 / 45.2% —— 每个都来自现场命令。
// B 两源互认：文档头部三档计数、死表键数、台账 deadCount、扫描面，四者必须互相承认；
//   它们不一致时覆盖率是「算给旧世界的」，不算通过。
// C 负控制（在仓库副本里**真破坏**，不是改字符串看文本变了）：五组。
// D 防复发：旧解析面形态不许回来；基线数字必须等于实测百分比（防「先填后量」）。
//
// ── 三条不许的假绿 ────────────────────────────────────────────────
// ① 只报百分比不点名裸码 —— 玩家看不到「哪几个码还在甩裸码」就没法修。
// ② 读不到引擎/台账当成「没问题」—— 不知道 ≠ 没问题。
// ③ 负控制只改文本再比对文本 —— 那不是破坏，是自述。
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TOOL_REL = 'tools/phrase-coverage.js';
let pass = 0;
const fails = [];
function a(cond, name, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { fails.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}
function runJson(dir) {
  const r = cp.spawnSync(process.execPath, [TOOL_REL, '--json'], { cwd: dir, encoding: 'utf8', timeout: 180000 });
  let j = null;
  try { j = JSON.parse(r.stdout); } catch (e) { j = null; }
  return { rc: r.status, json: j, out: String(r.stdout || '') + String(r.stderr || '') };
}
function runCheck(dir) {
  const r = cp.spawnSync(process.execPath, [TOOL_REL, '--check'], { cwd: dir, encoding: 'utf8', timeout: 180000 });
  return { rc: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
}
// 副本：只搬本锁要用的面（产品七目录给扫描器 + tests/docs/tools + index.js）
const COPY_DIRS = ['core', 'engines', 'actors', 'direction', 'render', 'compat', 'ui', 'tests', 'docs', 'tools'];
const copies = [];
function makeCopy(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-pc13-' + tag + '-'));
  COPY_DIRS.forEach(function (d) {
    const s = path.join(ROOT, d);
    if (!fs.existsSync(s)) return;
    fs.cpSync(s, path.join(dir, d), { recursive: true });
  });
  fs.copyFileSync(path.join(ROOT, 'index.js'), path.join(dir, 'index.js'));
  copies.push(dir);
  return dir;
}
function edit(dir, rel, fn) {
  const p = path.join(dir, rel);
  const before = fs.readFileSync(p, 'utf8');
  const after = fn(before);
  if (after === before) return false;
  fs.writeFileSync(p, after);
  return true;
}
// JSON 结构化破坏：改字段本身，不靠文本锚猜。
//   （第一版 C2 用 `/"deadCount":\s*52/` 替换 —— 它命中的是 `history` 里的历史条目，
//     真字段一动没动，于是「破坏了」但红不出来，正是负控制自己假绿的形态。）
function editJson(dir, rel, fn) {
  const p = path.join(dir, rel);
  const o = JSON.parse(fs.readFileSync(p, 'utf8'));
  const before = JSON.stringify(o);
  fn(o);
  fs.writeFileSync(p, JSON.stringify(o, null, 1) + '\n');
  return JSON.stringify(o) !== before;
}
// 把「缺少信息」那一簇的正则换成永不匹配 —— 真破坏：分类器少了一整个语义簇
function breakMissingCluster(dir) {
  return edit(dir, 'engines/reject-phrase.js', function (src) {
    const at = src.indexOf("id: 'missing'");
    if (at < 0) return src;
    const tail = src.slice(at);
    const mm = tail.match(/re:\s*\/[^\n]*?\/i,/);
    if (!mm) return src;
    return src.slice(0, at) + tail.replace(mm[0], 're: /zzz-no-code-matches-this-zzz/,');
  });
}

// ══════════════════════ A. 真实读数 ══════════════════════
function runA() {
  console.log('A. OPV29-13 覆盖率真实读数（命令：node tools/phrase-coverage.js --json）');
  const base = runJson(ROOT);
  a(base.json && base.json.ok === true, 'A1 工具在真仓自洽通过（ok:true）', base.json ? JSON.stringify(base.json.why) : base.out.slice(0, 120));
  if (!base.json || !base.json.ok) return null;
  //   这些数字的来源：
  //     扫描面 = reject-code-gate.scan() 命中 1905；死表 = reject-v2780.DEAD 52；在用 = 1853
  //     覆盖率 = rejectPhrase.coverage(在用码) ⇒ 837 / 1853 = 45.2%
  a(base.json.scanned === 1905, 'A2 扫描面 = 1905（reject-code-gate.scan 命中数）', String(base.json.scanned));
  a(base.json.dead === 52, 'A3 死表 = 52（reject-v2780.DEAD 键数）', String(base.json.dead));
  a(base.json.total === 1853, 'A4 在用码 = 1853 = 扫描面 − 死表', String(base.json.total));
  a(base.json.base === 937, 'A5 基线表 = 937 条（ledger.base 数组长度）', String(base.json.base));
  a(base.json.covered === 837, 'A6 有玩家话 = 837 条', String(base.json.covered));
  a(base.json.uncovered === 1016, 'A7 裸码 = 1016 条（必须点名，不许只报百分比）', String(base.json.uncovered));
  a(base.json.percent === 45.2, 'A8 覆盖率 = 45.2%', String(base.json.percent));
  a(base.json.baselinePercent === base.json.percent, 'A9 达标线 ≡ 实测覆盖率（冻结基线与现场同值）',
    String(base.json.baselinePercent) + ' vs ' + String(base.json.percent));
  a(Array.isArray(base.json.crossBad) && base.json.crossBad.length === 0, 'A10 交叉核对零失配', JSON.stringify(base.json.crossBad));
  a(Array.isArray(base.json.missing) && base.json.missing.length > 0, 'A11 裸码清单非空（有名字可点）', String(base.json.missing && base.json.missing.length));
  const ck = runCheck(ROOT);
  a(ck.rc === 0, 'A12 --check 在真仓 rc=0', 'rc=' + ck.rc);
  return base.json;
}

// ══════════════════════ B. 两源互认 ══════════════════════
function runB(readings) {
  console.log('B. 两源互认（文档 / 死表 / 台账 / 扫描面 必须互相承认）');
  const wit = require(path.join(ROOT, 'tests/reject-v2780.js'));
  const led = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/reject-code-ledger.json'), 'utf8'));
  const doc = fs.readFileSync(path.join(ROOT, 'docs/ERROR_CODES.md'), 'utf8');
  const m = doc.match(/见证\s*(\d+)\s*\/\s*死表\s*(\d+)\s*\/\s*基线\s*(\d+)/);
  a(!!m, 'B1 文档头部三档计数可读（读不到就不算核对过）', m ? 'ok' : 'NONE');
  if (!m) return;
  const docWit = Number(m[1]), docDead = Number(m[2]), docBase = Number(m[3]);
  a(docDead === Object.keys(wit.DEAD).length, 'B2 文档死表数 ≡ reject-v2780.DEAD 键数',
    docDead + ' vs ' + Object.keys(wit.DEAD).length);
  a(docWit + docBase === (readings ? readings.total : -1), 'B3 文档「见证 + 基线」≡ 在用码数',
    (docWit + docBase) + ' vs ' + (readings ? readings.total : '?'));
  a(led.deadCount === Object.keys(wit.DEAD).length, 'B4 台账 deadCount ≡ 死表键数',
    led.deadCount + ' vs ' + Object.keys(wit.DEAD).length);
  a(Array.isArray(led.base) && led.base.length === docBase, 'B5 台账 base 长度 ≡ 文档基线数',
    (Array.isArray(led.base) ? led.base.length : 'not-array') + ' vs ' + docBase);
}

// ══════════════════════ C. 负控制 ══════════════════════
function runC() {
  console.log('C. 负控制（在仓库副本里真破坏，逐组期望红）');

  // C1 破坏分类器：少一整个「缺少信息」簇 ⇒ 覆盖率跌破达标线，--check 必须 rc≠0
  const c1 = makeCopy('c1');
  const okBreak = breakMissingCluster(c1);
  a(okBreak, 'C1a 破坏已落盘（把 missing 簇的正则换成永不匹配）', okBreak ? 'ok' : 'anchor-miss');
  const c1j = runJson(c1);
  const c1c = runCheck(c1);
  a(c1j.json && c1j.json.percent < 45.2, 'C1b 破坏后覆盖率真跌（< 45.2%）',
    c1j.json ? String(c1j.json.percent) : c1j.out.slice(0, 100));
  a(c1c.rc !== 0, 'C1c 破坏后 --check rc≠0（判据看得见腐烂）', 'rc=' + c1c.rc);

  // C2 台账 deadCount 与死表不一致 ⇒ 交叉核对失配（读数算给旧世界）
  const c2 = makeCopy('c2');
  const okC2 = editJson(c2, 'tests/reject-code-ledger.json', function (o) { o.deadCount = 51; });
  a(okC2, 'C2a 破坏已落盘（ledger.deadCount 52→51）', okC2 ? 'ok' : 'anchor-miss');
  const c2j = runJson(c2);
  const c2c = runCheck(c2);
  a(!!(c2j.json && Array.isArray(c2j.json.crossBad) && c2j.json.crossBad.some(function (x) { return x.indexOf('deadCount') >= 0; })),
    'C2b 报出 deadCount 失配（点名到字段）',
    c2j.json ? JSON.stringify(c2j.json.crossBad) : c2j.out.slice(0, 100));
  a(c2c.rc !== 0, 'C2c 失配后 --check rc≠0', 'rc=' + c2c.rc);

  // C3 台账里混进一个产品面已经没有的码 ⇒ base-stale（台账跟不上扫描面）
  const c3 = makeCopy('c3');
  const okC3 = editJson(c3, 'tests/reject-code-ledger.json', function (o) { o.base.unshift('ghost-code-not-in-product'); });
  a(okC3, 'C3a 破坏已落盘（base 首项塞入幽灵码）', okC3 ? 'ok' : 'anchor-miss');
  const c3j = runJson(c3);
  const c3c = runCheck(c3);
  a(!!(c3j.json && Array.isArray(c3j.json.crossBad) && c3j.json.crossBad.some(function (x) { return x.indexOf('base-stale') >= 0; })),
    'C3b 报出 base-stale（点名到条数）',
    c3j.json ? JSON.stringify(c3j.json.crossBad) : c3j.out.slice(0, 100));
  a(c3c.rc !== 0, 'C3c stale 后台账 --check rc≠0', 'rc=' + c3c.rc);

  // C4 文档计数与现场不符（改了码表没重生成文档）⇒ doc-drift
  const c4 = makeCopy('c4');
  const okC4 = edit(c4, 'docs/ERROR_CODES.md', function (s) {
    return s.replace(/基线\s*937/, '基线 936');
  });
  a(okC4, 'C4a 破坏已落盘（文档基线 937→936）', okC4 ? 'ok' : 'anchor-miss');
  const c4j = runJson(c4);
  const c4c = runCheck(c4);
  a(!!(c4j.json && Array.isArray(c4j.json.crossBad) && c4j.json.crossBad.some(function (x) { return x.indexOf('doc-live') >= 0; })),
    'C4b 报出 doc-live 失配（第二份真源造反）',
    c4j.json ? JSON.stringify(c4j.json.crossBad) : c4j.out.slice(0, 100));
  a(c4c.rc !== 0, 'C4c 文档漂移后 --check rc≠0', 'rc=' + c4c.rc);

  // C5 引擎读不到 ⇒ 报 unreadable，且**不是崩栈**（崩栈会把「读不到」伪装成「不达标」）
  const c5 = makeCopy('c5');
  fs.unlinkSync(path.join(c5, 'engines/reject-phrase.js'));
  const c5j = runJson(c5);
  const c5c = runCheck(c5);
  a(!!(c5j.json && c5j.json.ok === false && c5j.json.why === 'engine-unreadable'),
    'C5a 引擎缺失 ⇒ ok:false / engine-unreadable（不是抛栈）',
    c5j.json ? JSON.stringify(c5j.json.why) : c5j.out.slice(0, 120));
  a(c5j.out.indexOf('at loadPhrase') < 0 && c5c.rc !== 0,
    'C5b 没有崩栈痕迹，且 --check rc≠0（读不到 ≠ 通过）', 'rc=' + c5c.rc);
}

// ══════════════════════ D. 防复发 ══════════════════════
function runD(readings) {
  console.log('D. 防复发（旧解析面 / 先填后量）');
  const src = fs.readFileSync(path.join(ROOT, TOOL_REL), 'utf8');
  a(src.indexOf('gate.scan()') >= 0, 'D1 解析面走扫描器（gate.scan()）', 'missing');
  a(src.indexOf('led.value.witnessed') < 0, 'D2 不再假想 ledger 里存在 witnessed 字段', 'found');
  const bp = src.match(/const BASELINE_PERCENT = ([\d.]+);/);
  a(!!(bp && readings && Number(bp[1]) === readings.percent),
    'D3 源码里的达标线 ≡ 实测覆盖率（防「先填一个看着舒服的数」）',
    bp ? bp[1] + ' vs ' + (readings ? readings.percent : '?') : 'NONE');
  // --ledger 落盘的读数必须与现场一致（台账不是手抄的）
  const d = makeCopy('d');
  const r = cp.spawnSync(process.execPath, [TOOL_REL, '--ledger'], { cwd: d, encoding: 'utf8', timeout: 180000 });
  let out = null;
  try { out = JSON.parse(fs.readFileSync(path.join(d, 'tests/phrase-coverage-ledger.json'), 'utf8')); }
  catch (e) { out = null; }
  a(!!(out && out.total === (readings ? readings.total : -1) && out.percent === (readings ? readings.percent : -2)),
    'D4 --ledger 落盘的 total/percent 与现场一致',
    out ? (out.total + '/' + out.percent) : ('rc=' + r.status));
}
const readings = runA();
runB(readings);
runC();
runD(readings);
copies.forEach(function (d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} });
console.log('\nOPV29-Z6-13-V2529: ' + (fails.length ? 'FAIL ' + fails.length + '/' + (pass + fails.length) : 'pass (' + pass + ')'));
if (fails.length) { fails.forEach(function (f) { console.log('  · ' + f); }); process.exitCode = 1; }

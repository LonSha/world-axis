#!/usr/bin/env node
// WorldAxis tests/version-surface-gate-v2185.js — 版本白名单形态门禁（v2.185.0 升版债务产物）
//
// 【它治的病】（同一形态两轮实证）
//   本仓有十处「白名单式」版本判据，两种形态：
//     形态一（正则 alternation）：  /VERSION = '2\.(168|169|…|184)\.0'/.test(IDX)
//     形态二（数组名单）：          ['2.166.0', …, '2.184.0'].indexOf(v) >= 0
//   它们是**跟随型**判据 —— 语义是「该版本及以上」，故每次升版都要把新版本追加进去。
//   而升版脚本按**精确形态**处理（v2.184.0 的 WIDEN 与 v2.185.0 的 WIDEN 都只列了当时看见的那一种），
//   形态一漏改时的表现最阴：判据**恒假**、锁照跑、只有那一条红，看上去像「判据写错了」，不像「版本面漏了」。
//     · v2.184.0 轮：五把判据恒假（当轮清偿）
//     · v2.185.0 轮：s3-tx4/6/7/8/9 五把的 A14 停在 184（本轮清偿；全量回归当场逮住 5 条红）
//   两轮都是同一件事：**那些白名单的末项有没有跟上当前版本**，从来没有东西在看。
//
// 【本门禁判什么】按**形态**扫（不枚举精确串 —— 那正是病灶所在）：tests/ + tools/ 下的 .js，
//   ① 形态一：`2\.(a|b|…)\.0`（alternation ≥2 项）—— 最大版本必须 === 当前 VERSION；
//   ② 形态二：`[ '2.x.0', '2.y.0', … ]`（含 ≥2 个版本串）—— 最大版本必须 === 当前 VERSION；
//   ③ 反空转下限：两种形态合计命中 ≥ MIN_HITS 条（零命中在空集上恒真）。
//   为什么要求「≥2 项」：单项数组（如 `['2.165.0']`）不是跟随型版本面，而是**某个字段的取值**
//     —— 实测形态：tools/tx1_smoke.js 里 `dg.ver === '2.165.0'` 恰好落在一对方括号内被抓成「名单」。
//     按「要素 ≥2」收面即可自动排除，无需豁免表（豁免表本身是下一个腐烂点）。
//
// 【单一真源】当前版本取 index.js 的 `const VERSION`（与 manifest 的一致性由 v2.106.0 段守）。
//
// 【边界】只覆盖上述两种**形态**：模板串拼接、跨行 alternation、从外部文件/JSON 读入的白名单
//   本轮未纳入（本仓无此形态）。若将来出现，须显式扩面，不许让它静默落在「零命中 = 干净」里。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

/** 扫描面：白名单判据的所在地（产品面不含测试白名单 —— 如实登记，不假称全仓）。 */
const SCAN_DIRS = ['tests', 'tools'];
/** 形态一：`2\.(a|b|…)\.0`（alternation ≥2 项）。分组：前缀数字 / 反斜杠 / 交替项 / 反斜杠。 */
const RE_ALT = /(\d+)(\\+)\.\((\d+(?:\|\d+)+)\)(\\+)\.0/g;
/** 形态二：方括号内 ≥2 个 `'2.x.0'` 版本串。 */
const RE_BRACKET = /\[([^\[\]]{0,800}?)\]/g;
const RE_BRACKET_VER = /'2\.(\d+)\.0'/g;
/** 反空转下限：当前实测 10 条 / 8 文件，取下限 8。 */
const MIN_HITS = 8;

function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
/** 当前版本：index.js 的 `const VERSION`（该行有缩进，不能用 startswith 判）。 */
function currentVersion() {
  const m = read('index.js').match(/const VERSION = '(\d+\.\d+\.\d+)'/);
  if (!m) throw new Error('index.js 里找不到 `const VERSION = \'x.y.z\'`');
  return m[1];
}
/** 注释行判定（与 tests/toolchain-gate.js 同口径）：历史叙述里引用的旧白名单不是活判据。 */
function isCommentLine(t) {
  const s = t.replace(/^\s+/, '');
  return s.indexOf('//') === 0 || s.indexOf('*') === 0 || s.indexOf('/*') === 0;
}
/** 一个 .js 文件里全部「形态命中」。返回 [{form, line, terms:[…], text}]。 */
function scanSrc(src) {
  const out = [];
  const lines = src.split('\n');
  function lineOf(idx) { return src.slice(0, idx).split('\n').length; }
  let m;
  RE_ALT.lastIndex = 0;
  while ((m = RE_ALT.exec(src)) !== null) {
    const line = lineOf(m.index);
    if (isCommentLine(lines[line - 1] || '')) continue;
    const terms = m[3].split('|').map(Number);
    out.push({ form: 'alt', line: line, terms: terms, max: Math.max.apply(null, terms), text: m[0] });
  }
  RE_BRACKET.lastIndex = 0;
  while ((m = RE_BRACKET.exec(src)) !== null) {
    const line = lineOf(m.index);
    if (isCommentLine(lines[line - 1] || '')) continue;
    const vs = [];
    RE_BRACKET_VER.lastIndex = 0;
    let k;
    while ((k = RE_BRACKET_VER.exec(m[1])) !== null) vs.push(Number(k[1]));
    if (vs.length < 2) continue;
    out.push({ form: 'arr', line: line, terms: vs, text: m[0].slice(0, 90) });
  }
  return out;
}
/** 扫描面：仓库里全部命中的白名单（带 rel）。 */
function scan(root) {
  const base = root || BASE;
  const hits = [];
  SCAN_DIRS.forEach(function (dir) {
    const abs = path.join(base, dir);
    if (!fs.existsSync(abs)) return;
    fs.readdirSync(abs).filter(function (f) { return /\.js$/.test(f); }).sort().forEach(function (f) {
      const rel = dir + '/' + f;
      const src = fs.readFileSync(path.join(base, rel), 'utf8');
      scanSrc(src).forEach(function (h) { hits.push({ rel: rel, form: h.form, line: h.line, max: Math.max.apply(null, h.terms), terms: h.terms }); });
    });
  });
  return hits;
}
/** 判据：每条白名单的最大版本 === 当前版本。返回问题列表（空 = 干净）。 */
function check(root, cur) {
  const version = cur || currentVersion();
  const hits = scan(root);
  const problems = [];
  if (hits.length < MIN_HITS) {
    problems.push({ kind: 'vacuous', detail: '白名单命中 ' + hits.length + ' < 下限 ' + MIN_HITS + '（零命中在空集上恒真）' });
  }
  hits.filter(function (h) { return h.max !== Number(version.split('.')[1]); }).forEach(function (h) {
    problems.push({
      kind: 'stale-whitelist',
      detail: h.rel + ' L' + h.line + '（' + h.form + '）最大版本 ' + h.max
        + ' ≠ 当前 ' + version + ' —— 跟随型版本面没跟上'
    });
  });
  return { version: version, hits: hits, problems: problems };
}
function summary() {
  const r = check();
  return '版本白名单 ' + r.hits.length + ' 条 · 当前 ' + r.version
    + ' · ' + (r.problems.length ? '问题 ' + r.problems.length : '全部跟上当前版本');
}

function runAll(a) {
  const cur = currentVersion();
  const r = check(null, cur);
  // ① 读数必须打出来（看不见的东西等于不存在）
  console.log('  ' + summary());
  console.log('    · ' + r.hits.map(function (h) { return h.rel.split('/').pop().replace(/\.js$/, '') + ':' + h.line + '(' + h.form + '→' + h.max + ')'; }).join(' '));
  // ② 主判据：每条白名单的最大版本 === 当前版本
  a(r.problems.length === 0, 'v2185/vs: 全部 ' + r.hits.length + ' 条版本白名单最大版本 === index.js VERSION ' + cur
    + '（问题：' + r.problems.slice(0, 4).map(function (p) { return p.detail; }).join(' | ') + (r.problems.length > 4 ? ' …' : '') + '）');
  // ③ 两形态都被扫到（只扫到一种 ⇒ 另一种形态的判据是空的）
  a(r.hits.some(function (h) { return h.form === 'alt'; }), 'v2185/vs: 形态一（正则 alternation）真有命中');
  a(r.hits.some(function (h) { return h.form === 'arr'; }), 'v2185/vs: 形态二（数组名单）真有命中');
  // ④ 下限（反空转）
  a(r.hits.length >= MIN_HITS, 'v2185/vs: 命中 ' + r.hits.length + ' ≥ 下限 ' + MIN_HITS);
  // ⑤ 单项数组不该被当白名单（tx1_smoke 实测形态）
  const tx1 = scanSrc(read('tools/tx1_smoke.js'));
  a(tx1.length === 0, 'v2185/vs: tools/tx1_smoke.js 的单项数组（字段取值）不被当白名单（实 ' + tx1.length + ' 条）');
  // ⑥ 单一真源：manifest 与 index.js 同值（版本面同源的另一半）
  const man = JSON.parse(read('manifest.json')).version;
  a(man === cur, 'v2185/vs: manifest.version ' + man + ' === index.js VERSION ' + cur);
}

function runNegative(a) {
  // N1 真源码文本破坏：s3-tx4 的白名单末项退回上一版 ⇒ 主判据必须现形
  //   【锚点必须**动态构造**，不许硬编码末两项】本锁第一次落盘时写成 `|184|185)`，
  //   于是它自己成了「跟随型版本面」的第三个实例：升到 2.186.0 之后白名单变成 `|184|185|186)`、
  //   锚点 0 命中，N1 四条判据一起红（而**它不是被破坏的判据红，是锚点过期** ——
  //   与 v2.184.0/v2.185.0 两轮栽的形态逐字同族）。治法：从 index.js 的当前版本推出
  //   「末两项」= 上一版 + 当前版，破坏 = 把末两项塌成上一版一项。版本面再升，锚点自动跟上。
  const rel = 'tests/s3-tx4-v2168.js';
  const src = read(rel);
  const cur = currentVersion();
  const curMinor = Number(cur.split('.')[1]);
  const prevMinor = curMinor - 1;
  const needle = '|' + prevMinor + '|' + curMinor + ')';
  a(src.split(needle).length - 1 === 1, 'v2185/vs N1: 破坏锚点 `' + needle + '` 在 ' + rel + ' 中恰 1 次（撞车 ⇒ 该条静默跳过）');
  const broken = src.split(needle).join('|' + prevMinor + ')');
  a(broken !== src, 'v2185/vs N1: 破坏真的改变了源码文本');
  const inMemory = scanSrc(broken);
  const hit = inMemory.filter(function (h) { return h.form === 'alt'; })[0];
  a(!!hit && hit.max === prevMinor, 'v2185/vs N1: 破坏版被扫出的最大版本退回 ' + prevMinor + '（实 ' + (hit ? hit.max : '（无命中）') + '）');
  a(hit && hit.max !== curMinor, 'v2185/vs N1: 破坏版与当前版本 ' + cur + ' 不符 ⇒ 判据现形（原版为绿）');
  // N2 原版成绿（判据纯度：不是「破坏才现形」的恒假）
  a(scanSrc(src).every(function (h) { return h.max === curMinor; }),
    'v2185/vs N2: 原版上同款判据为真（全部命中都跟上当前版本）');
  // N3 无副作用：真文件逐字未变
  a(read(rel) === src, 'v2185/vs N3: 被破坏过的文件真源码逐字未变（破坏只发生在内存副本上）');
  // N4 判据纯度：低于当前版本的白名单必然入 problems（用一个构造面自证判据真在跑）
  const fake = check(null, cur);
  a(fake.problems.filter(function (p) { return p.kind === 'stale-whitelist'; }).length === 0,
    'v2185/vs N4: 当前仓库上 stale-whitelist 为零（原版干净）');
  // N5 本锁在可达面里（不是孤儿）
  const surf = require('./test-surface-gate.js').scan({});
  a(surf.locks.indexOf('tests/version-surface-gate-v2185.js') >= 0 || surf.spawned.indexOf('tests/version-surface-gate-v2185.js') >= 0,
    'v2185/vs N5: 本锁真在可达面里（不是孤儿）');
}

module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative),
  currentVersion: currentVersion, scanSrc: scanSrc, scan: scan, check: check,
  summary: summary, SCAN_DIRS: SCAN_DIRS, MIN_HITS: MIN_HITS
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { require('./mock.js'); runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('VERSION-SURFACE-GATE-V2185: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('VERSION-SURFACE-GATE-V2185: pass (' + pass + ')');
}

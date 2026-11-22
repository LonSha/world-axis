#!/usr/bin/env node
// WorldAxis tests/opv29-z5-v2529.js (v2.524.0) — OPV29-25 新引擎脚手架判据（接线七处，少一路即红）
//
// ── 这份判据在证什么 ─────────────────────────────────
//   A 真仓只读面：`--check` 七处锚点全中（真仓在这些位置能不能开工）
//   B dry-run 不落盘：--dry-run 之后真仓工作树不变（一个字节都不写）
//   C 沙箱真接线：对**仓库副本**跑一次真写入，七处逐处断言（不是「输出说 WIRED」就算）
//   D 骨架可用：node --check 过、桩装载后 registerModule 被点名、put/get/trim/stat 行为对
//   E 少一路即红（负控制）：删锚点 / 锚点歧义 / 重复执行 —— 三种都必须非零退出并点名
//   F 原子性：一处缺就整体不写（含「缺文件」这一路），失败后目标文件 md5 不变
//
// ── 为什么不许在真仓跑真写入 ───────────────────────────
//   它要改的六个文件里有 index.js / tests/run.js —— 全量回归正在跑，改它们等于污染现场。
//   所以真写入一律 `--root=<仓库副本>`；真仓只跑 --check / --dry-run（纯读）。
//
// ── 复算 ────────────────────────────────────────
//   node tests/opv29-z5-v2529.js     ⇒ pass（37 项）

'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const BASE = path.resolve(__dirname, '..');
const TOOL = path.join(BASE, 'tools', 'new-engine.js');
const TMPROOT = path.join(require('os').tmpdir(), 'wa-ne-' + process.pid);

let pass = 0, fail = 0;
function a(cond, title) {
  if (cond) { pass += 1; console.log('  ✓ ' + title); }
  else { fail += 1; console.log('  ✗ ' + title); }
}
function run(args, opts) {
  return cp.spawnSync(process.execPath, [TOOL].concat(args), {
    encoding: 'utf8',
    cwd: (opts && opts.cwd) || BASE,
    timeout: 120000
  });
}
function md5(p) { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex'); }

// 仓库副本：只带脚手架会碰的文件（+目录骨架）
// v2.542.8 跟位：两个接线位锚点所在文件已是「表本体」——MODULE_EXPORTS 在
//   engines/tool-diag-tables.js、ROUTES 在 engines/action-desk-routes.js。副本必须带上
//   这两个文件，否则 apply 在副本里根本读不到锚点（ENOENT），C 段十条会全部连坐变红。
const FILES = ['index.js', 'tests/run.js', 'engines/tool-diag.js', 'engines/tool-diag-tables.js',
  'engines/action-desk.js', 'engines/action-desk-routes.js', 'core/store.js', 'core/evict.js'];
let seq = 0;
function sandbox() {
  seq += 1;
  const dir = path.join(TMPROOT, 'sb' + seq);
  for (let i = 0; i < FILES.length; i++) {
    const src = path.join(BASE, FILES[i]);
    const dst = path.join(dir, FILES[i]);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
  fs.mkdirSync(path.join(dir, 'engines'), { recursive: true });
  return dir;
}
function read(dir, rel) { return fs.readFileSync(path.join(dir, rel), 'utf8'); }
function has(dir, rel, needle) { return read(dir, rel).indexOf(needle) >= 0; }

const NAME = 'probe-engine';
const NS = 'probeEngine';

try {
  fs.mkdirSync(TMPROOT, { recursive: true });

  // ── A 真仓只读面 ─────────────────────────────────
  console.log('A 真仓 read-only：--check');
  const rCheck = run(['--check', '--name=' + NAME, '--ns=' + NS]);
  a(rCheck.status === 0, 'A1: --check 退出 0（实 ' + rCheck.status + '）');
  // v2.542.8 跟位：MODULE_EXPORTS 的**表本体**已搬到 engines/tool-diag-tables.js、
  //   ROUTES 的本体已搬到 engines/action-desk-routes.js（tool-diag.js / action-desk.js 只剩
  //   别名投影）。脚手架要插的是「表里的一行」，锚点必须钉在表本体上，否则 --check
  //   永远报 anchor-missing（命中 0 次）。这里跟着改 id 字面量，判据本身（点名七处）未动。
  const IDS = [
    'wire:index.js/LOAD_ORDER', 'wire:tests/run.js/LOAD', 'wire:engines/tool-diag-tables.js/MODULE_EXPORTS',
    'wire:engines/action-desk-routes.js/ROUTES', 'reg:core/store.js/defaultWorldState',
    'reg:core/store.js/__BOUNDED_CAPS', 'reg:core/evict.js/SITES'
  ];
  for (let i = 0; i < IDS.length; i++) {
    a(String(rCheck.stdout || '').indexOf(IDS[i]) >= 0, 'A2.' + (i + 1) + ': 点名 ' + IDS[i]);
  }

  // ── B dry-run 不落盘 ───────────────────────────────
  console.log('B 真仓 dry-run：不写盘');
  const before = md5(path.join(BASE, 'index.js')) + '|' + md5(path.join(BASE, 'core/store.js'));
  const rDry = run(['--dry-run', '--name=' + NAME, '--ns=' + NS]);
  const after = md5(path.join(BASE, 'index.js')) + '|' + md5(path.join(BASE, 'core/store.js'));
  a(rDry.status === 0, 'B1: --dry-run 退出 0（实 ' + rDry.status + '）');
  a(before === after, 'B2: dry-run 后真仓 index.js/store.js 逐字节不变');
  a(!fs.existsSync(path.join(BASE, 'engines', NAME + '.js')), 'B3: dry-run 未创建引擎文件');
  a(String(rDry.stdout || '').indexOf('DRY-RUN') >= 0, 'B4: 输出明确标注 DRY-RUN');

  // ── C 沙箱真接线：七处逐处断言 ─────────────────────────
  console.log('C 沙箱真写入：七处接线/登记逐处核对');
  const sb = sandbox();
  const rApply = run(['--root=' + sb, '--name=' + NAME, '--ns=' + NS]);
  a(rApply.status === 0, 'C1: apply 退出 0（实 ' + rApply.status + '）');
  a(has(sb, 'index.js', "'engines/" + NAME + ".js',"), 'C2: index.js LOAD_ORDER 出现该引擎');
  a(has(sb, 'tests/run.js', "'engines/" + NAME + ".js',"), 'C3: tests/run.js LOAD 出现该引擎');
  a(has(sb, 'engines/tool-diag-tables.js', "'engines/" + NAME + ".js': '" + NS + "'"), 'C4: MODULE_EXPORTS 文件→命名空间（表本体在 tool-diag-tables.js）');
  a(has(sb, 'engines/action-desk-routes.js', "'" + NS + ".stat'"), 'C5: action-desk ROUTES 有只读口（表本体在 action-desk-routes.js）');
  a(has(sb, 'core/store.js', '      ' + NS + ': {'), 'C6: defaultWorldState 骨架出生');
  a(has(sb, 'core/store.js', "'" + NS + ".items'"), 'C7: __BOUNDED_CAPS 上界登记');
  a(has(sb, 'core/evict.js', "'" + NS + ".items'"), 'C8: evict.SITES 驱逐登记');
  a(fs.existsSync(path.join(sb, 'engines', NAME + '.js')), 'C9: 引擎文件已生成');
  // 插入位置：必须紧跟结构行（不是插到文件尾或某段注释后）
  const idxTxt = read(sb, 'index.js');
  const atLO = idxTxt.indexOf('  const LOAD_ORDER = [\n');
  a(atLO >= 0 && idxTxt.slice(atLO, atLO + 200).indexOf("'engines/" + NAME + ".js'") >= 0,
    'C10: 插入落点在 LOAD_ORDER 结构行之后（不是文件尾）');
  // 全链路：改过的 JS 仍可解析（不是把文件切坏了）
  // v2.542.8 跟位：被改的六个文件现在是「表本体」那两个（tool-diag-tables / action-desk-routes），
  //   不是只留别名的 tool-diag.js / action-desk.js。判据（六个都 node --check 过）未动。
  const okParse = ['index.js', 'tests/run.js', 'core/store.js', 'core/evict.js', 'engines/tool-diag-tables.js', 'engines/action-desk-routes.js']
    .every(function (f) { return cp.spawnSync(process.execPath, ['--check', path.join(sb, f)], { encoding: 'utf8' }).status === 0; });
  a(okParse, 'C11: 六个被改文件全部 node --check 通过（没切坏）');

  // ── D 骨架可用：桩装载 + 行为 ──────────────────────────
  console.log('D 骨架可用：桩装载与行为');
  const engPath = path.join(sb, 'engines', NAME + '.js');
  a(cp.spawnSync(process.execPath, ['--check', engPath], { encoding: 'utf8' }).status === 0, 'D1: 生成物 node --check 通过');
  const stubPath = path.join(sb, '__stub.js');
  fs.writeFileSync(stubPath, [
    'const reg = [];',
    'global.WA = { registerModule: function (f, m) { reg.push([f, m]); } };',
    'require(' + JSON.stringify(engPath) + ');',
    'const E = global.WA.' + NS + ';',
    'const out = { reg: reg, hasNs: !!E, cap: E && E.CAP };',
    'if (E) {',
    '  const st = { ' + JSON.stringify(NS) + ': { items: {}, _stats: { calls: 0 } } };',
    "  out.badKey = E.put(st, '', 1);",
    "  out.put1 = E.put(st, 'k1', { v: 1, at: 1 });",
    "  out.get1 = E.get(st, 'k1');",
    "  out.stat1 = E.stat(); out.stat2 = E.stat();",
    '  for (let i = 0; i < 205; i++) E.put(st, "k" + (1000 + i), { v: i, at: 1000 + i });',
    '  out.len = Object.keys(st[' + JSON.stringify(NS) + '].items).length;',
    "  out.oldestGone = (E.get(st, 'k1') === null);",
    "  out.newestKept = !!E.get(st, 'k1204');",
    '  out.calls = st[' + JSON.stringify(NS) + ']._stats.calls;',
    '}',
    'console.log(JSON.stringify(out));'
  ].join('\n'), 'utf8');
  const rStub = cp.spawnSync(process.execPath, [stubPath], { encoding: 'utf8', cwd: sb });
  let ob = null;
  try { ob = JSON.parse(String(rStub.stdout || '').trim().split('\n').pop()); } catch (e) { ob = null; }
  a(!!ob, 'D2: 桩装载产出可解析读数（stdout=' + String(rStub.stdout || '').trim().slice(-60)
    + ' / stderr=' + String(rStub.stderr || '').trim().slice(0, 700) + '）');
  if (ob) {
    a(ob.reg.length === 1 && ob.reg[0][0] === 'engines/' + NAME + '.js', 'D3: registerModule 被点名（见证块在）');
    a(ob.hasNs === true && ob.cap === 200, 'D4: WA.' + NS + ' 在位且 CAP=200（与两处登记同数）');
    a(ob.badKey && ob.badKey.ok === false && ob.badKey.refusal === 'bad-key', 'D5: 空 key 拒收 bad-key');
    a(ob.put1 && ob.put1.ok === true && ob.get1 && ob.get1.v === 1, 'D6: put→get 往返一致');
    a(ob.stat1 && ob.stat1.ok === true && ob.stat1.ns === NS && JSON.stringify(ob.stat1) === JSON.stringify(ob.stat2),
      'D7: stat 只读且两次同值（纯函数）');
    a(ob.len === 200, 'D8: 超 CAP 后容器收在 200（实 ' + ob.len + '）');
    a(ob.oldestGone === true && ob.newestKept === true, 'D9: 挤出的是最旧那条，最新那条还在');
    a(ob.calls >= 206, 'D10: _stats.calls 真在计数（实 ' + ob.calls + '）');
  } else {
    for (let i = 3; i <= 10; i++) a(false, 'D' + i + ': （桩装载失败，无法判定）');
  }

  // ── E 少一路即红（负控制）─────────────────────────────
  console.log('E 负控制：少一路/歧义/重复都必须红');
  const sbNoRoute = sandbox();
  // v2.542.8 跟位：ROUTES 本体在 engines/action-desk-routes.js，破坏点必须落在那儿，
  //   否则「删掉锚点」这一步根本没删到什么，E1 会退化成恒真绿。
  const adTxt = read(sbNoRoute, 'engines/action-desk-routes.js');
  fs.writeFileSync(path.join(sbNoRoute, 'engines/action-desk-routes.js'), adTxt.replace('  const ROUTES = {\n', '  const ROUTES_X = {\n'), 'utf8');
  const rNoRoute = run(['--root=' + sbNoRoute, '--name=' + NAME, '--ns=' + NS]);
  a(rNoRoute.status !== 0, 'E1: 删掉 ROUTES 锚点 ⇒ 非零退出（实 ' + rNoRoute.status + '）');
  a(String(rNoRoute.stderr || '').indexOf('wire:engines/action-desk-routes.js/ROUTES') >= 0, 'E2: 并点名缺的是哪一路');
  a(!fs.existsSync(path.join(sbNoRoute, 'engines', NAME + '.js')), 'E3: 失败时未留下半个引擎文件');

  const sbAmb = sandbox();
  // v2.542.8 跟位：MODULE_EXPORTS 本体在 engines/tool-diag-tables.js，同上——
  //   歧义必须注入到锚点真正所在的文件里，判据才不是恒真。
  const tdiag = read(sbAmb, 'engines/tool-diag-tables.js');
  fs.writeFileSync(path.join(sbAmb, 'engines/tool-diag-tables.js'),
    tdiag.replace('  const MODULE_EXPORTS = {\n', '  const MODULE_EXPORTS = {\n  };\n  const MODULE_EXPORTS = {\n'), 'utf8');
  const rAmb = run(['--root=' + sbAmb, '--name=' + NAME, '--ns=' + NS]);
  a(rAmb.status !== 0, 'E4: 锚点命中两处（歧义）⇒ 非零退出（实 ' + rAmb.status + '）');
  a(String(rAmb.stderr || '').indexOf('anchor-ambiguous') >= 0, 'E5: 错因点名 anchor-ambiguous（不靠猜插入位置）');

  const md5Idx1 = md5(path.join(sb, 'index.js'));
  const md5Store1 = md5(path.join(sb, 'core/store.js'));
  const rAgain = run(['--root=' + sb, '--name=' + NAME, '--ns=' + NS]);
  a(rAgain.status !== 0, 'E6: 同一沙箱再跑一次 ⇒ 非零退出（实 ' + rAgain.status + '）');
  a(String(rAgain.stderr || '').indexOf('already-exists') >= 0, 'E7: 错因点名 already-exists（幂等靠拒绝）');
  a(md5(path.join(sb, 'index.js')) === md5Idx1 && md5(path.join(sb, 'core/store.js')) === md5Store1,
    'E8: 重复执行不改盘（两文件逐字节不变）');

  // E9：**只**有引擎文件已存在、接线还没做 —— 这一路只有「文件存在即拒」打得中。
  //   （不加这条，「接线重复」那道守会把结论兜住：真关掉文件守仍是 pass，判据就瞎了。）
  const sbDup = sandbox();
  fs.writeFileSync(path.join(sbDup, 'engines', NAME + '.js'), '// 占位：模拟半成品同名引擎\n', 'utf8');
  const dupIdx = md5(path.join(sbDup, 'index.js'));
  const rDup = run(['--root=' + sbDup, '--name=' + NAME, '--ns=' + NS]);
  a(rDup.status !== 0, 'E9: 仅引擎文件已存在（接线未做）⇒ 非零退出（实 ' + rDup.status + '）');
  a(String(rDup.stderr || '').indexOf('already-exists: engines/' + NAME + '.js') >= 0,
    'E10: 错因点名是引擎文件冲突（不是接线冲突）');
  a(md5(path.join(sbDup, 'index.js')) === dupIdx && read(sbDup, 'engines/' + NAME + '.js').indexOf('占位') >= 0,
    'E11: 拒绝时既有占位文件与接线均未被改写');

  // ── F 原子性：一处不齐就整体不写 ───────────────────────
  console.log('F 原子性：缺文件 + 缺锚点 ⇒ 一个字节都不写');
  const sbAtom = sandbox();
  fs.unlinkSync(path.join(sbAtom, 'core/evict.js'));
  const beforeIdx = md5(path.join(sbAtom, 'index.js'));
  const beforeStore = md5(path.join(sbAtom, 'core/store.js'));
  const rAtom = run(['--root=' + sbAtom, '--name=' + NAME, '--ns=' + NS]);
  a(rAtom.status !== 0, 'F1: 缺 core/evict.js ⇒ 非零退出（实 ' + rAtom.status + '）');
  a(String(rAtom.stderr || '').indexOf('missing-file: core/evict.js') >= 0, 'F2: 错因点名缺哪个文件');
  a(md5(path.join(sbAtom, 'index.js')) === beforeIdx && md5(path.join(sbAtom, 'core/store.js')) === beforeStore,
    'F3: 失败后 index.js / store.js 逐字节不变（原子性成立）');
  a(String(rAtom.stderr || '').indexOf('ABORT') >= 0, 'F4: 输出明确标注 ABORT（不是静默半成品）');
} finally {
  try { fs.rmSync(TMPROOT, { recursive: true, force: true }); } catch (e) { /* 清不掉不掩盖结论 */ }
}

console.log('\nOPV29-Z5-V2529: ' + (fail === 0 ? 'pass' : 'FAIL ' + fail + ' / ' + (pass + fail)) + '（' + (pass + fail) + ' 项）');
process.exit(fail === 0 ? 0 : 1);
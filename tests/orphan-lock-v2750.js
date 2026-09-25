#!/usr/bin/env node
// WorldAxis tests/orphan-lock-v2750.js -- 测试文件面可达性专锁（v2.75.0）
//
// 治的病（回）
//   tests/intel-v2530.js / life-v2520.js / longline-v2550.js / org-v2540.js
//   四个 v2.52–v2.55 交付的专锁，自交付起就是「裸脚本 + 末尾 console.log('XXX: pass')」形态：
//   既无 module.exports、也不在 run.js 的 spawn 清单、也不被内联。它们**独立 node 能跑通**，
//   但**全量回归从未执行过一句断言**。而 v2.73.0 起测试引用面已覆盖全部 tests/*.js，
//   这些「从不执行的文件」的引用却成了账本归因的依据 ——「归因建立在不执行的文件上」。
//
// 本版两件事：
//   1) 四个文件改造为 runAll(a) 专锁（断言实现逐字保留，只把 assert 改为注入），
//      挂进 run.js —— 它们第一次真的进入全量回归。
//   2) 新增 tests/test-surface-gate.js：把「每个测试文件都有可判定的执行入口」变成常驻判据，
//      防同类再生（下一条无人挂载的孤儿不会再静静躺上一个大版本）。
//
// 本锁的任务不是重复门禁，而是**证明门禁有两个方向**：
//   A 结构：四个文件确实是锁形态（可 require、assert 由外部注入、不是自持常量）。
//   B 现场：门禁在真仓库上零告警（可达/锁/孤儿三项都在预期上），且四个文件都在锁里。
//   C 实质：四条断言真的会跑、且真的验住了各自引擎的行为（每条一条真源码破坏，必须变红）。
//   D 非空转：门禁在空图/去注释/误用输入面上不恒真。
//   E 无副作用：不污染真源码、不留临时文件。
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BASE = path.join(__dirname, '..');
const gate = require('./test-surface-gate.js');
const { testFiles } = require('./product-files.js');

// ── 四个已修复的孤儿：文件 ⇄ 引擎 ⇄ 破坏锚点（锚点在真源码里必须恰 1 次）──
//   每条的 replacement 都必须是可解析的 JS，且破坏的行为必须能被该文件里**原有**的断言逮住 ——
//   否则就是「破坏根本没发生，判据当然没现形」（v2.74.0 踩过的假绿）。
const REPAIRED = [
  { rel: 'tests/intel-v2530.js', engine: 'engines/intel.js', tag: '因果链未登记因不得入账',
    anchor: "if (!knownCause(cause)) return { ok: false, reason: 'unknown-cause' };",
    replacement: "if (false) return { ok: false, reason: 'unknown-cause' };" },
  { rel: 'tests/life-v2520.js', engine: 'engines/life.js', tag: '高警戒时人物选隐藏而不选发问',
    anchor: "if (vigilance !== null && vigilance >= 70) return { action: 'hide', reason: 'high-vigilance' };",
    replacement: "if (false) return { action: 'hide', reason: 'high-vigilance' };" },
  { rel: 'tests/longline-v2550.js', engine: 'engines/longline.js', tag: '越过宽限期才算逆期',
    anchor: 'return isOpen(f) && f.dueAt && t > (f.dueAt + cfg.graceMs);',
    replacement: 'return false;' },
  { rel: 'tests/org-v2540.js', engine: 'engines/org.js', tag: '划转必须双向记账（转入方入库）',
    anchor: 'a.resources[resource] = fromBefore - n; b.resources[resource] = toBefore + n;',
    replacement: 'a.resources[resource] = fromBefore - n;' }
];
const SELF_REL = 'tests/orphan-lock-v2750.js';
const GATE_REL = 'tests/test-surface-gate.js';

function sha(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16); }
function vfsReal() {
  const v = {};
  testFiles(BASE).forEach(function (rel) { v[rel] = fs.readFileSync(path.join(BASE, rel), 'utf8'); });
  return v;
}
function vfsWith(rel, text) { const v = vfsReal(); v[rel] = text; return v; }
function kindsOf(rep) { return rep.problems.map(function (p) { return p.kind; }); }

function runAll(a) {
  const assert = require('./lock-assert.js').from(a);
  const files0 = testFiles(BASE);
  const hashes0 = {};
  [SELF_REL, GATE_REL].forEach(function (rel) { hashes0[rel] = sha(path.join(BASE, rel)); });

  // ════ A 结构：四个文件是锁形态，assert 由外部注入（不是自持常量）════
  REPAIRED.forEach(function (t) {
    const src = fs.readFileSync(path.join(BASE, t.rel), 'utf8');
    assert.ok(src.indexOf('function runAll(a)') > 0 && src.indexOf("require('./lock-assert.js').from(a)") > 0,
      'v2750: [A] ' + t.rel + ' 已改造为 runAll(a) 锁（assert 经适配器由外部注入）');
    const nReq = src.split("require('assert')").length - 1;
    assert.strictEqual(nReq, 1,
      'v2750: [A] ' + t.rel + ' 只在直跑入口持有 assert（实 ' + nReq + ' 处）');
    const lastLine = src.trim().split('\n').pop();
    assert.ok(lastLine.indexOf("runAll(require('assert'))") > 0,
      'v2750: [A] ' + t.rel + ' 直跑入口在最后一行（require.main 守卫）');
    assert.ok(src.indexOf("require('./lock-assert.js').restoring(runAll)") > 0,
      'v2750: [A] ' + t.rel + ' 的导出经 restoring 包裹（宿主全局还原，不靠顺序活着）');
    const mod = require(path.join(BASE, t.rel));
    assert.strictEqual(typeof mod.runAll, 'function', 'v2750: [A] ' + t.rel + ' 导出 runAll');
    assert.strictEqual(typeof mod.runNegative, 'undefined', 'v2750: [A] ' + t.rel + ' 未凭空添导出面');
  });
  const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
  REPAIRED.forEach(function (t) {
    const needle = "require('./" + t.rel.replace('tests/', '') + "').runAll(assert);";
    assert.strictEqual(runSrc.split(needle).length - 1, 1,
      'v2750: [A] run.js 挂起 ' + t.rel + '（恰 1 处，且走 runAll(assert)）');
  });

  // ════ B 现场：门禁在真仓库上零告警，且四个文件确实在可达面里 ════
  const rep = gate.scan({});
  assert.strictEqual(rep.orphans.length, 0,
    'v2750: [B] 真仓库零孤儿（实 ' + rep.orphans.length + '：' + rep.orphans.join('、') + '）');
  assert.strictEqual(rep.problems.length, 0,
    'v2750: [B] 门禁零告警（实 ' + rep.problems.length + '：' + kindsOf(rep).join('、') + '）');
  assert.ok(rep.files >= 40 && rep.locks.length >= 30 && rep.reach.length >= 35,
    'v2750: [B] 面够大（文件 ' + rep.files + ' / 锁 ' + rep.locks.length + ' / 可达 ' + rep.reach.length + '）');
  assert.ok(rep.spawned.length >= 2 && rep.inline.length >= 2 && rep.spawnLines >= 6,
    'v2750: [B] 非 require 的两个入口面都非空（spawn ' + rep.spawned.length + ' / 内联 ' + rep.inline.length + ' / spawn 行 ' + rep.spawnLines + '）');
  REPAIRED.forEach(function (t) {
    assert.ok(rep.locks.indexOf(t.rel) >= 0,
      'v2750: [B] ' + t.rel + ' 已在可达面里（不再是从不执行的成员）');
  });
  assert.ok(rep.locks.indexOf(GATE_REL) >= 0 && rep.locks.indexOf(SELF_REL) >= 0,
    'v2750: [B] 门禁与专锁自身也在可达面里');
  assert.strictEqual(rep.globalResidue, 0,
    'v2750: [B] 锁在宿主全局上零残骸（实 ' + rep.globalResidue + ' 处）');
  assert.ok(rep.problems.some(function (p) { return p.kind === 'global-residue'; }) === false,
    'v2750: [B] 无 global-residue 告警');
}

function runNegative(a) {
  const assert = require('./lock-assert.js').from(a);
  const files0 = testFiles(BASE);
  const hashes0 = {};
  [SELF_REL, GATE_REL].forEach(function (rel) { hashes0[rel] = sha(path.join(BASE, rel)); });

  // ════ C 实质：每条断言真的验住了各自引擎的行为（真源码破坏 → 重跑同款断言必须变红）════
  //   与前文四个修复文件是同一份断言，只把它们的输入（引擎源码）换掉。
  REPAIRED.forEach(function (t) {
    const abs = path.join(BASE, t.engine);
    const raw = fs.readFileSync(abs, 'utf8');
    // 前置：锚点必须恰中 1 次（否则是假破坏：改的不是热路径，或不止改一处）
    assert.strictEqual(raw.split(t.anchor).length - 1, 1,
      'v2750: [C][前置] 锚点在 ' + t.engine + ' 里恰 1 次（' + t.tag + '）');
    const broken = raw.replace(t.anchor, t.replacement);
    assert.notStrictEqual(broken, raw, 'v2750: [C][前置] 破坏确实改动了字节（' + t.engine + '）');
    const lockPath = path.join(BASE, t.rel);
    const load = function () { delete require.cache[require.resolve(lockPath)]; return require(lockPath); };
    const count = function () { const c = { n: 0 }; return { c: c, a: function (cond) { if (!cond) c.n += 1; } }; };
    // C0 基线：未破坏时同款断言零失败（判据两侧自证，不是只认「变红」）
    const base = count();
    let loadErr = null;
    try { load().runAll(base.a); } catch (e) { loadErr = e; }
    assert.strictEqual(loadErr, null, 'v2750: [C0] ' + t.rel + ' 在未破坏的引擎上可跑通'
      + (loadErr ? '：' + loadErr.message : ''));
    assert.strictEqual(base.c.n, 0,
      'v2750: [C0] 未破坏时同款断言零失败（实 ' + base.c.n + ' —— 非零说明基线本身是红的）');
    // C1 破坏后：同一份断言必须现形（记录失败或以异常逃出，都算逮住）
    const shot = count();
    let runErr = null;
    try {
      fs.writeFileSync(abs, broken);
      load().runAll(shot.a);
    } catch (e) { runErr = e; } finally {
      fs.writeFileSync(abs, raw);
      assert.strictEqual(fs.readFileSync(abs, 'utf8'), raw,
        'v2750: [C][还原] ' + t.engine + ' 逐字还原（不污染真源码）');
      delete require.cache[require.resolve(lockPath)];
    }
    const caught = (runErr !== null) || (shot.c.n > 0);
    assert.ok(caught,
      'v2750: [C1] ' + t.rel + ' 在「' + t.tag + '」被破坏后必须现形'
      + '（实：断言失败 ' + shot.c.n + ' 条 / 异常 ' + (runErr ? runErr.message.slice(0, 60) : '无') + '）'
      + (caught ? '' : ' —— 仍绿：说明这条断言根本没盖到那个行为（假绿）'));
  });

  // ════ D 非空转 ════
  //   D1 前置：“去注释副本”与原件不同（下一行不是恒真）
  const gateSrc = fs.readFileSync(path.join(BASE, GATE_REL), 'utf8');
  const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
  assert.ok(gateSrc.length > 3000 && runSrc.length > 100000, 'v2750: [D1] 语料非空');
  assert.notStrictEqual(gate.stripComments(gateSrc), gateSrc,
    'v2750: [D1] 去注释副本确实不等于原件（副本不是纯拷）');
  //   D2 提及 ≠ 引用：把一条挂载行注释掉、并在注释里写出同样的路径 —— 该文件必须重新变成孤儿
  const target = REPAIRED[0];
  const mount = "require('./" + target.rel.replace('tests/', '') + "').runAll(assert);";
  assert.strictEqual(runSrc.split(mount).length - 1, 1, 'v2750: [D2][前置] 挂载行可定位且唯一');
  const mentioned = runSrc.replace(mount, '// 曾经挂过 ' + target.rel + '（此处只是提及，不是引用）');
  const repM = gate.scan({ vfs: vfsWith('tests/run.js', mentioned) });
  assert.ok(repM.orphans.indexOf(target.rel) >= 0,
    'v2750: [D2] 注释里提及 ' + target.rel + ' 不构成引用边（该文件重新变为孤儿：提及不是引用）');
  assert.ok(repM.problems.some(function (p) { return p.kind === 'unregistered-orphan'; }),
    'v2750: [D2] 且被判据报出来（unregistered-orphan）');
  //   D3 输入面：同一份 run.js，若引用面取在“抹掉字符串”的面上则边全消
  const codeFace = require('./inventory.js').codeFace;
  const refsRaw = gate.refsOf(runSrc).length;
  const refsFace = gate.refsOf(codeFace(runSrc)).length;
  assert.ok(refsRaw >= 30, 'v2750: [D3] 原文面上取到 ' + refsRaw + ' 条引用边');
  assert.strictEqual(refsFace, 0,
    'v2750: [D3] 「抹字符串」的面上引用边归零（实 ' + refsFace + '）—— 引用面必须在去注释但保留字面量的面上取');
  //   D4 空图不恒真
  const repE = gate.scan({ vfs: {} });
  assert.ok(repE.problems.length >= 2 && repE.problems.some(function (p) { return p.kind === 'vacuous'; }),
    'v2750: [D4] 空图上不恒真（零告警必须被反空转下限拦住，实 ' + repE.problems.length + ' 项）');
  //   D7 宿主全局探针两侧自证（干净零告警 / 污染必现形）—— 污点在子进程里造，测试完删除
  const probeTmp = path.join(BASE, 'tests', '__tmp_polluter.js');
  fs.writeFileSync(probeTmp, 'module.exports = { runAll: function () { global.window = { WorldAxis: {} }; } };\n');
  try {
    const polluted = gate.globalResidueProbe(['__tmp_polluter.js']);
    assert.ok(polluted.ok && polluted.dirty.length > 0,
      'v2750: [D7] 污染锁必被探针逮住（实 ' + JSON.stringify(polluted.dirty) + '）');
    const clean = gate.globalResidueProbe();
    assert.ok(clean.ok && clean.dirty.length === 0,
      'v2750: [D7] 干净面零告警（实 ' + JSON.stringify(clean.dirty) + '）');
  } finally { try { fs.unlinkSync(probeTmp); } catch (e) {} }
  assert.ok(!fs.existsSync(probeTmp), 'v2750: [D7] 污点测试文件已删除（无副作用）');
  //   D8 restoring 是包装而不是常量：撤掉它，同一个锁必须立刻变成被逮住的
  const rawOrg = fs.readFileSync(path.join(BASE, 'tests/org-v2540.js'), 'utf8');
  const wrappedExport = "module.exports = { runAll: require('./lock-assert.js').restoring(runAll) };";
  assert.strictEqual(rawOrg.split(wrappedExport).length - 1, 1, 'v2750: [D8][前置] 还原包装可定位且唯一');
  const unwrapped = rawOrg.replace(wrappedExport, 'module.exports = { runAll: runAll };');
  const tmpLock = path.join(BASE, 'tests', '__tmp_unwrapped.js');
  fs.writeFileSync(tmpLock, unwrapped);
  try {
    const r = gate.globalResidueProbe(['__tmp_unwrapped.js']);
    assert.ok(r.ok && r.dirty.length > 0,
      'v2750: [D8] 撤掉 restoring 包装后必被逮住（实 ' + JSON.stringify(r.dirty) + '）');
  } finally { try { fs.unlinkSync(tmpLock); } catch (e) {} }
  assert.ok(!fs.existsSync(tmpLock), 'v2750: [D8] 撤包装测试文件已删除（无副作用）');
  //   D6 适配器不得吞失败
  const adapter = require('./lock-assert.js').from;
  const rec = [];
  const probe = adapter(function (cond) { rec.push(!!cond); });
  probe.ok(true, 'x'); probe.strictEqual(1, 1, 'y');
  assert.strictEqual(rec.length, 2, 'v2750: [D6] 适配器把每次调用都落到注入的断言上（实 ' + rec.length + '）');
  assert.ok(rec[0] === true && rec[1] === true, 'v2750: [D6] 真命题被记为真');
  let falses = 0;
  const probe2 = adapter(function (cond) { if (!cond) falses += 1; });
  probe2.ok(false, 'a'); probe2.strictEqual(1, 2, 'b'); probe2.notStrictEqual(1, 1, 'c');
  assert.strictEqual(falses, 3, 'v2750: [D6] 假命题三条都被记为假（适配器不吞失败，实 ' + falses + '）');
  //   D5 豁免表不得是白名单垃圾桶
  assert.strictEqual(gate.EXEMPT.length, 0,
    'v2750: [D5] 豁免表为空 —— 两个不可达者的入口都是自解释的（spawn / 内联），不是人工白名单');

  // ════ E 无副作用 ════
  const files1 = testFiles(BASE);
  assert.strictEqual(files1.length, files0.length,
    'v2750: [E] 测试文件面未被污染（' + files0.length + ' → ' + files1.length + '）');
  assert.strictEqual(files1.filter(function (f) { return f.indexOf('__tmp') >= 0 || f.indexOf('.bak') >= 0; }).length, 0,
    'v2750: [E] 未留下临时/备份文件');
  [SELF_REL, GATE_REL].forEach(function (rel) {
    assert.strictEqual(sha(path.join(BASE, rel)), hashes0[rel], 'v2750: [E] ' + rel + ' 内容未被改写');
  });
}

module.exports = { runAll: runAll, runNegative: runNegative };

if (require.main === module) { runAll(require('assert')); runNegative(require('assert')); console.log('ORPHAN-V2750: pass'); }

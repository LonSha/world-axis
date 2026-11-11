/**
 * WorldAxis tests/gates-doc-gen-v2400.js (v2.400.0) — OPV22-8 专锁
 *
 * 它治的病（G8）：docs/gates.md 的「现在读什么」一列曾是**手写快照**。
 *   表头停在 v2.134.0，而现场已到 v2.380.0：
 *     · dead-export-gate：文档写 dead 751，现场 1437（差 686）
 *     · inventory：文档写产品文件 162，现场 441（差 279）
 *     · test-surface-gate：文档写测试面 154，现场 537（差 383）
 *   **它不是「有点旧」，它是一份看起来权威的第二真源。**
 *   更糟的是它还在描述一个 v2.256.0 就整体退役的文件（docs-archive-gate.js）。
 *   本仓对同型病下过药（docs/ERROR_CODES.md 已改成 tools/gen-error-codes.js 生成）。
 *
 * 修法：只把**会过期的那一段**变成生成物。正文里那些口径说明与踩坑记录是
 *   人手写的判据解释，不是读数，保持逐字不动。
 *
 * 本锁五档（关键在 C/D：证明 --check 两个方向都会响）：
 *   A 契约面：生成器/标记/正文说明都在位，且文档不再自称旧版本
 *   B 现场面：真跑 --check，退出码 0、输出带「一致」与门禁道数
 *   C 文档被改 ⇒ --check 必须 exit 1（判「过期」这一面不许恒绿）
 *   D 产品面被改 ⇒ --check 必须 exit 1 且点名读数（判「现场变了」这一面）
 *   N 纯度：负控制跑完后文档与产品面逐字未变
 *
 * 口径纪律（本仓反复踩过的三条）：
 *   ① 耗时列**不参与比对** —— 它是墙钟噪声（1225ms/1229ms），纳入比对会让判据
 *      恒红，于是人就会把它摘掉。要盯性能是 perf-regression-gate 的活。
 *   ② 慢门禁**不参与快 check** —— readings-v2106 实测 117s，它进 check 就等于
 *      把门禁变成两分钟。它只由 --write 重算。
 *   ③ 读不出就不许回填 —— --write 遇到抽不出读数的门禁时 exit 1，
 *      不许把「读不出」写进文档（那等于把第二真源换成一张空表）。
 */
'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools/gen-gates-doc.js');
const DOC = path.join(ROOT, 'docs/gates.md');
const IDX = path.join(ROOT, 'index.js');
let passed = 0; let failed = 0;
function a(cond, desc, detail) {
  if (cond) { passed++; console.log('  ✓ ' + desc); }
  else { failed++; console.error('  ✗ ' + desc + (detail ? ' — ' + detail : '')); }
}
const NL = String.fromCharCode(10);

// ── A 契约面 ──────────────────────────────────────────────────────────
a(fs.existsSync(TOOL), 'A1: tools/gen-gates-doc.js 在位（唯一的读数真源）');
const toolSrc = fs.readFileSync(TOOL, 'utf8');
const docSrc = fs.readFileSync(DOC, 'utf8');
// 把文档里的 ``` 代码块单独收集：好几条判据要区分「正文叙述」与「可照抄的命令」。
//   「提到某个已退役文件」是允许的（退役登记必须能说清它是什么），
//   「把已退役文件写成一条可跑命令」才是病。
const codeBlocks = [];
docSrc.replace(/```[\s\S]*?```/g, function (m) { codeBlocks.push(m); return m; });
const CODE_ALL = codeBlocks.join(NL);
a(docSrc.indexOf('<!-- GATES-READINGS:BEGIN') >= 0 && docSrc.indexOf('<!-- GATES-READINGS:END -->') >= 0,
  'A2: docs/gates.md 带着成对生成标记（缺标记则 --write/--check 都无处落脚）');
a(/--write/.test(toolSrc) && /--check/.test(toolSrc),
  'A3: 生成器同时有 --write（回填）与 --check（判过期）两档');
a(/扣不出|读不出/.test(toolSrc) || /unread\.length/.test(toolSrc),
  'A4: --write 遇到抽不出读数的门禁会拒绝回填（不许把空表写进文档）');
// 文档不许再自称旧版本（这一条是 G8 的原症状：表头停在 v2.134.0，开头自称 v2.123.0）
a(docSrc.indexOf('**v2.134.0**') < 0, 'A5: 文档里不再出现「当前时点 **v2.134.0**」这种会过期的自称');
a(docSrc.indexOf('本文写作时（v2.123.0）') < 0,
  'A5b: 开头也不再出现「本文写作时（v2.123.0）」这种刻进去的旧自称');
a(codeBlocks.join(NL).indexOf('通过 11858') < 0,
  'A5c: 代码块里不再把某一次全量读数（通过 11858）刻成事实（叙述里引用它是允许的）');
// 文档不许再把已退役的文件当成现存门禁（它在 v2.256.0 就整体退役了）。
a(CODE_ALL.indexOf('node tests/docs-archive-gate.js') < 0,
  'A6: 文档没有把已退役的 docs-archive-gate 写成可跑命令（叙述里提到它是允许的）');
a(docSrc.indexOf('已于 v2.256.0 退役') >= 0 || docSrc.indexOf('v2.256.0 退役') >= 0,
  'A6b: 文档如实登记了它的退役时点（不假装它从不存在）');
a(!fs.existsSync(path.join(ROOT, 'tests/docs-archive-gate.js')),
  'A7: 该文件确实不在磁盘上（与 A6 互证：文档与现实一致）');
// 正文口径说明必须仍在（不许「整篇生成」把人写的判据解释冲掉）
a(docSrc.indexOf('门禁是**判据**，不是报告器') >= 0,
  'A8: 人手写的口径说明仍在（只生成读数段，正文逐字不动）');
// 生成器不许把耗时写死进比对
a(/blankMs/.test(toolSrc), 'A9: 比对前抹掉耗时列（噪声不参与判据）');
a(/slow\s*:\s*true/.test(toolSrc) && /GATES_ALLOW_SLOW/.test(toolSrc),
  'A10: 慢门禁被显式标记且可由环境变量跳过（--check 强制跳过）');
a(/const isCheck = argv\.indexOf\('--check'\) >= 0;/.test(toolSrc) &&
  /!isCheck && process\.env\.GATES_ALLOW_SLOW/.test(toolSrc),
  'A11: --check 强制跳慢门禁（不依赖人记得设环境变量）');

// ── B 现场面 ──────────────────────────────────────────────────────────
const idxSrc = fs.readFileSync(IDX, 'utf8');
const vm = /VERSION\s*=\s*'([\d.]+)'/.exec(idxSrc);
a(!!vm, 'B0: index.js VERSION 可读（回填时点版本的前提）');

function runCheck() {
  const r = cp.spawnSync(process.execPath, [TOOL, '--check'],
    { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
  return { rc: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const r0 = runCheck();
a(r0.rc === 0, 'B1: 原版上 --check 退出码 0（实 ' + r0.rc + '）' + (r0.rc === 0 ? '' : NL + r0.out.slice(-600)));
a(/✓/.test(r0.out), 'B2: 一致时输出 ✓ 标记（不是静默通过）');
a(/快门禁\s*(\d+)\s*道/.test(r0.out), 'B3: 输出带上参与比对的门禁道数（读者能核对覆盖面）');
const mB3 = /快门禁\s*(\d+)\s*道/.exec(r0.out);
a(!!mB3 && Number(mB3[1]) >= 5,
  'B4: 参与比对的门禁不少于 5 道（太少则「一致」没有说服力，实 ' + (mB3 ? mB3[1] : '?') + '）');
a(/慢门禁不参与/.test(r0.out), 'B5: 明确登记哪道慢门禁未参与（不假装全覆盖）');
a(r0.out.indexOf(idxSrc) < 0, 'B6: 输出里不带 index.js 全文（防日志被整篇灌入）');

// ── C 文档被改 ⇒ 必须 exit 1 ──────────────────────────────────────────
const docOrig = docSrc;
const rowRe = /\| `node tests\/[a-z-]+\.js` \| \d [✓✗] \| \d+ms \| `([0-9]+ \/ [0-9]+)` \|/;
const rowM = rowRe.exec(docOrig);
a(!!rowM, 'C0: 文档里能找到一行「多读数」形态的表格行（破坏锚点的前提）');
if (rowM) {
  const bumped = String(Number(rowM[1].split(' / ')[1]) + 4321);
  const brokenRow = rowM[0].replace(rowM[1], rowM[1].split(' / ')[0] + ' / ' + bumped);
  const brokenDoc = docOrig.replace(rowM[0], brokenRow);
  a(brokenDoc !== docOrig, 'C0b: 破坏锚点恰命中（不靠碰运气）');
  try {
    fs.writeFileSync(DOC, brokenDoc, 'utf8');
    const r1 = runCheck();
    a(r1.rc !== 0, 'C1: 文档读数被人改过 ⇒ --check 必须 exit 非 0（实 ' + r1.rc + '）—— 证明他不是恒绿');
    a(/过期|差异/.test(r1.out), 'C2: 红的时候说清是「过期」并给差异行（不是只说一句失败）');
    a(r1.out.indexOf(bumped) >= 0 || r1.out.indexOf('文档：') >= 0,
      'C3: 差异行里能看见被改坏的那个数（读者一眼知道改哪儿了）');
  } finally {
    fs.writeFileSync(DOC, docOrig, 'utf8');
  }
}

// ── D 产品面被改 ⇒ 必须 exit 1 且点名读数 ────────────────────────────
//   这一面比 C 重要：C 只证明「有人手改文档会被抓」，D 证明「改了源码而忘了回填
//   文档，判据会自己发现」—— 那才是 G8 的复发路径。
const probe = path.join(ROOT, 'engines/zz-gatesdoc-probe.js');
a(!fs.existsSync(probe), 'D0: 探针文件事先不存在（否则基线与破坏无法区分）');
try {
  fs.writeFileSync(probe,
    '// 临时探针：本文件只为验证「产品面变了，--check 会不会响」，跑完即删。' + NL +
    'module.exports = { ZZ_GATESDOC_PROBE: true };' + NL, 'utf8');
  const r2 = runCheck();
  a(r2.rc !== 0, 'D1: 新增一个产品文件 ⇒ --check 必须 exit 非 0（实 ' + r2.rc + '）—— 证明它读的是现场');
  a(/过期|差异/.test(r2.out), 'D2: 红的时候说清是「过期」并给差异行');
  a(r2.out.indexOf('现场：') >= 0, 'D3: 差异里同时给出「现场」值（能看出变的是哪个读数）');
} finally {
  if (fs.existsSync(probe)) fs.unlinkSync(probe);
}

// ── N 纯度：负控制跑完后一切逐字复原 ─────────────────────────────────
a(fs.readFileSync(DOC, 'utf8') === docOrig, 'N1: 负控制跑完后 docs/gates.md 逐字未变');
a(!fs.existsSync(probe), 'N2: 探针文件已被删除（不留残骸）');
const r3 = runCheck();
a(r3.rc === 0, 'N3: 全部复原后 --check 回到 0（不是恒红）');
a(docOrig.indexOf('GATES-READINGS:BEGIN') >= 0, 'N4: 生成标记仍在（负控制没把落脚点拆掉）');

// ── 版本面 ────────────────────────────────────────────────────────────
a(/生成器版本：2\.400\.0/.test(docOrig) || /gen-gates-doc\.js/.test(docOrig),
  'N5: 文档里登记了生成器出处（读者知道这不是手写的）');

console.log('');
if (failed) { console.error('GATES-DOC-GEN-V2400: FAIL ' + failed + ' / ' + (passed + failed)); process.exit(1); }
console.log('GATES-DOC-GEN-V2400: pass（' + passed + ' 项）');

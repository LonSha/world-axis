'use strict';
// WorldAxis tests/opv29-z1-02-v2529.js — OPV29-02 增量回归（改了什么 ⇒ 只跑哪些锁）
//
// ── 病 ────────────────────────────────────────────────────────────
// 全量回归 ≈29 分钟。太贵的直接后果不是「慢」，是**没人真跑**：红了先记下来，然后忘了。
// 增量回归要治的就是这个。但它比全量危险：**漏跑**相关的锁 = 假绿，而假绿比慢可怕得多。
//
// ── 本锁守什么 ────────────────────────────────────────────────────
// A 索引与语义：引擎改动必须命中「直接读它的那把锁」；没人引用的文档 ⇒ 0 相关（结论）。
// B 保守性（本锁的重点）：**反查不到就退回全量**。`0 把锁` 只有在「确认没有锁提到它」
//   时才允许出现；不认识的路径必须 `fullRequired:true`。混合改动里一个未知就得全量。
// C 防复发：把 unknown 分支改掉后，B 组必须真红（负控制，由外部单跑量 FAIL）。
//
// ── 三条不许的假绿 ────────────────────────────────────────────────
// ① 用「0 个相关测试」当「不需要跑」——「没查到」与「查到了没有」必须分开。
// ② 只按目录前缀推断（改 engines/ 就跑 engines 的锁）——引用关系不是目录关系。
// ③ 负控制只删一个文件看红 ——那是缩面，不是破坏判据。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IMP = require(path.join(ROOT, 'tools/impact.js'));
let pass = 0;
const fails = [];
function a(cond, name, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { fails.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}
const idx = IMP.index();
const run = function (files) { return IMP.impact({ files: files, idx: idx }); };

// ══════════════════════ A. 索引与语义 ══════════════════════
function runA() {
  console.log('A. 索引与语义（命令：node tools/impact.js --check）');
  const c = IMP.check();
  a(c.ok, 'A1 --check 自洽通过（无 dangling / 无塌口径）', JSON.stringify(c.probs.slice(0, 3)));
  a(idx.files.length > 1000, 'A2 索引覆盖整棵树', String(idx.files.length));
  // 锁的面数必须与 tests/*.js 现场一致（否则索引是旧世界的）
  const live = fs.readdirSync(path.join(ROOT, 'tests')).filter(function (f) { return /\.js$/.test(f); }).length;
  a(idx.tests.length === live, 'A3 索引里的锁数 ≡ tests/*.js 现场', idx.tests.length + ' vs ' + live);
  // 语义锚点：`engines/reject-phrase.js` 是被 OPV29-13 的锁**直接读**的（readFileSync），
  //   改它就必须把那一把锁带上 —— 这是「引用关系」而不是「目录关系」的证明。
  const r = run(['engines/reject-phrase.js']);
  const direct = r.rows[0] || {};
  a(direct.why === 'direct', 'A4 引擎改动走 direct 档（源码里真有该路径）', String(direct.why));
  a((direct.tests || []).indexOf('tests/opv29-z6-13-v2529.js') >= 0,
    'A5 改 reject-phrase 必须带上读它的那把锁（OPV29-13）',
    (direct.tests || []).slice(0, 6).join(','));
  a(r.fullRequired === false, 'A6 已知文件的改动不需要退回全量', String(r.fullRequired));
  // 没人引用的文档 ⇒ 0 相关（这是结论）。动态找一个，避免写死一个会被谁引用的文件名。
  const docs = idx.known ? Object.keys(idx.known).filter(function (k) { return /^docs\/.+\.md$/.test(k) && !idx.map[k]; }) : [];
  a(docs.length > 0, 'A7 存在「无任何锁引用」的文档（否则这一档没法验）', String(docs.length));
  if (docs.length) {
    const d = run([docs[0]]);
    a(d.rows[0].why === 'doc-unreferenced' && d.affected.length === 0 && d.fullRequired === false,
      'A8 无人引用的文档 ⇒ 0 相关，且不误判成「未知」',
      docs[0] + ' [' + d.rows[0].why + '] ' + d.affected.length);
  }
}

// ══════════════════════ B. 保守性 ══════════════════════
function runB() {
  console.log('B. 保守性（不知道 ⇒ 全量，绝不输出空的「0 相关」当通过）');
  const u = run(['zz/never-existed.js']);
  a(u.fullRequired === true, 'B1 未知路径 ⇒ fullRequired:true', String(u.fullRequired));
  a(u.rows[0].why === 'unresolved', 'B2 未知路径被点名（不是静默过滤）', String(u.rows[0].why));
  // 混合：一个已知引擎 + 一个未知 ⇒ 未知不能被已知掩盖
  const mix = run(['engines/reject-phrase.js', 'zz/never-existed.js']);
  a(mix.fullRequired === true && mix.affected.length > 0,
    'B3 已知 + 未知混合 ⇒ 仍然必须退回全量（未知不被掩盖）',
    'full=' + mix.fullRequired + ' affected=' + mix.affected.length);
  // 纯已知改动 ⇒ 不需要全量（否则增量永远退化成全量，等于没做）
  const known = run(['engines/reject-phrase.js', 'core/store.js']);
  a(known.fullRequired === false && known.affected.length > 0,
    'B4 纯已知改动 ⇒ 不全量，且确实有锁要跑',
    'full=' + known.fullRequired + ' affected=' + known.affected.length);
  // 改锁自己 ⇒ 命中自己
  const self = run(['tests/opv29-z6-13-v2529.js']);
  a(self.rows[0].why === 'is-test' && self.affected.indexOf('tests/opv29-z6-13-v2529.js') >= 0,
    'B5 改某把锁 ⇒ 至少跑它自己', String(self.rows[0].why));
  // 并集去重
  const both = run(['engines/reject-phrase.js', 'engines/reject-phrase.js']);
  const dup = both.affected.filter(function (t, i, arr) { return arr.indexOf(t) !== i; });
  a(dup.length === 0, 'B6 同一文件重复出现不会让锁重复进清单', String(dup.length));
  // 「0 把锁」必须能区分两种来源
  const reasons = {};
  run(['zz/never-existed.js']).rows.concat(run(['docs/architecture.md']).rows).forEach(function (row) { reasons[row.why] = 1; });
  a(reasons.unresolved === 1, 'B7 两种「0 相关」被分开标注（unresolved vs doc-unreferenced）',
    Object.keys(reasons).join(','));
}

// ══════════════════════ C. 防复发 ══════════════════════
function runC() {
  console.log('C. 防复发（口径不许被悄悄改窄）');
  const src = fs.readFileSync(path.join(ROOT, 'tools/impact.js'), 'utf8');
  a(src.indexOf('fullRequired') >= 0, 'C1 工具仍带着「必须退回全量」这一档', 'missing');
  a(src.indexOf('doc-unreferenced') >= 0, 'C2 文档档有独立结论名（不被并进 unresolved）', 'missing');
  a(src.indexOf('unresolved') >= 0, 'C3 未知档有独立名字（不被并进文档档）', 'missing');
  // 反向：工具不许把 affected.length===0 直接当通过 —— 只许在 fullRequired 为假时才算「0」
  a(src.indexOf('affected.length') < 0 || src.indexOf('affected.length === 0') < 0,
    'C4 工具里没有「affected 为 0 就算通过」的判据形态', 'found');
  const j = JSON.parse(JSON.stringify(run(['engines/reject-phrase.js'])));
  a(j.index && typeof j.index.tests === 'number' && j.index.tests === idx.tests.length,
    'C5 读数里的面数与索引一致（可复算）', String(j.index && j.index.tests));
}
runA();
runB();
runC();
console.log('\nOPV29-Z1-02-V2529: ' + (fails.length ? 'FAIL ' + fails.length + '/' + (pass + fails.length) : 'pass (' + pass + ')'));
if (fails.length) { fails.forEach(function (f) { console.log('  · ' + f); }); process.exitCode = 1; }
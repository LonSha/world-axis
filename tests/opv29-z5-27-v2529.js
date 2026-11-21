'use strict';
// WorldAxis tests/opv29-z5-27-v2529.js — OPV29-27 版本面跟位 + OPV29-35 发布清单化 专锁
//
// ── 现场读数（可复算：`node tools/release-manifest.js`）──────────────────
// 版本面 **9** 个载体（1 真源 + 8 必须跟位的副本），当前全部同号，不同值 1 种；
// BUILD_ID = 2fd1cb069d4495d5829bdee09d752c1fa94649d3；发布必检 4 项全 ✓。
// 题外读数：全仓 **164** 个文件提到 2.524.0，其中绝大多数是历史注释 —— 这正是本项
// 不扫「全仓字符串」而扫「有名字的版本面」的理由（扫全仓会逼人改注释）。
//
// ── 三条不许的假绿 ────────────────────────────────────────────────
// ① 读不到当成通过：载体文件缺失 ⇒ 必须 ok:false，不许 `version=null` 还判一致。
// ② 只比"有两个相同"：不同值 1 种才是唯一版本；2 个载体同为旧版也不算跟位。
// ③ 只核版本不核其余：缺 BUILD_ID / 缺 manifest.js / 缺人读台账都要红 —— 那些
//    同样是"装上了但出事"的形态。

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const RM = require(path.join(ROOT, 'tools/release-manifest.js'));

// 叉号用运行时拼接：本文件会被 tools/anchor-audit.js 扫描，写字面量会把自己扫出来
//（先例：OPV29-29 dep-audit 的自证样本同样处理）。
const CROSS = String.fromCharCode(10007);
let pass = 0;
const fails = [];
function a(cond, name, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { fails.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}

function runA() {
  console.log('\nA. OPV29-27 版本面跟位（唯一真源 + 8 个副本）');
  const res = RM.audit(ROOT);

  a(res.surface.length === 9, 'A1 版本面登记 9 个载体', String(res.surface.length));
  a(res.unreadable.length === 0, 'A2 九个载体全部读得到（读不到不许当通过）',
    JSON.stringify(res.unreadable.map(function (x) { return x.id + ':' + x.why; })));
  // 不再钉死具体号：真源随版本面推进，钉死会让每次升版都红一次（v2.542.26 起）
  a(/^\d+\.\d+\.\d+$/.test(String(res.canonical || '')), 'A3 真源 index.js:VERSION 可读且是语义化版本', String(res.canonical));
  a(res.drift.length === 0, 'A4 无载体与真源不一致（跟位）',
    JSON.stringify(res.drift.map(function (x) { return x.id + '=' + x.version; })));
  a(res.distinct.length === 1, 'A5 全版本面只有一种值（不是"两个相同就算跟位"）',
    JSON.stringify(res.distinct));
  a(res.buildId.ok && /^[0-9a-f]{40}$/.test(res.buildId.value),
    'A6 BUILD_ID 是 40 位提交（回退源可用）', String(res.buildId.value));

  // 真源必须是"改版发起处"，不是任意一个副本 —— 否则改副本也能"全仓跟"。
  const src = res.surface.filter(function (x) { return x.kind === 'source'; });
  a(src.length === 1 && src[0].id === 'index.js:VERSION',
    'A7 真源唯一且是 index.js:VERSION', JSON.stringify(src.map(function (x) { return x.id; })));
  // 副本必须占多数：如果哪天把真源与副本写反，这条会红。
  a(res.surface.length - src.length === 8, 'A8 副本 8 项（真源 + 副本 = 9）',
    String(res.surface.length - src.length));
}

// 造一个「只坏一处」的样本目录：版本面与发布必检涉及的文件全部搬齐，
// 再按 mutate(fileId) 逐条破坏。搬不齐就会造出假绿 —— 缺一个发布必检项，
// ok:false 就不是被版本不一致触发的了，drift 判据删掉也照样红。
function makeSample(prefix, mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const files = [];
  RM.VERSION_SURFACE.forEach(function (e) { files.push(e.file); });
  RM.RELEASE_ITEMS.forEach(function (e) { if (files.indexOf(e.file) < 0) files.push(e.file); });
  files.forEach(function (rel) {
    const dst = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  });
  if (mutate) mutate(dir, files);
  return dir;
}

function runB() {
  console.log('\nB. OPV29-35 发布清单化（缺一项即不许发）');
  const res = RM.audit(ROOT);
  a(res.release.length === 4, 'B1 发布必检 4 项', String(res.release.length));
  a(res.missingRelease.length === 0, 'B2 当前 4 项全齐',
    JSON.stringify(res.missingRelease.map(function (x) { return x.id; })));
  a(res.ok === true, 'B3 当前可以发（ok:true）', String(res.ok));

  // 用临时空目录做负样本：全部载体读不到 ⇒ 必须 ok:false。
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-rm-'));
  const bad = RM.audit(empty);
  a(bad.ok === false, 'B4 空目录（全部读不到）⇒ ok:false，不是"零问题"', String(bad.ok));
  a(bad.unreadable.length === 9, 'B5 空目录 ⇒ 9 个载体全记 unreadable', String(bad.unreadable.length));
  a(bad.canonical === null, 'B6 读不到真源 ⇒ canonical 为 null（不是猜一个）', String(bad.canonical));

  // 部分损坏：只坏一个副本，仍必须红 —— 这条防"大部分对就算过"。
  const partial = makeSample('wa-rm2-', function (dir, files) {
    files.forEach(function (rel) {
      if (rel !== 'manifest.json') return;
      const p = path.join(dir, rel);
      const cur = RM.audit(ROOT).canonical;
      fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('"version": "' + cur + '"', '"version": "0.0.1"'));
    });
  });
  const pm = RM.audit(partial);
  a(pm.missingRelease.length === 0, 'B7a 样本的发布清单本身是齐的（否则 B7 的红是假的）',
    JSON.stringify(pm.missingRelease.map(function (x) { return x.id; })));
  a(pm.ok === false, 'B7 只有 manifest 落后一版 ⇒ 仍 ok:false（不是大部分对就算过）', String(pm.ok));
  a(pm.drift.length === 1 && pm.drift[0].id === 'manifest.json:version',
    'B8 漂移被精确点名到 manifest.json:version',
    JSON.stringify(pm.drift.map(function (x) { return x.id + '=' + x.version; })));
  a(pm.distinct.length === 2, 'B9 两种版本值 ⇒ distinct=2（能看出是"分叉"不是"一致"）',
    JSON.stringify(pm.distinct));

  // 文件在、但版本行被删（pattern-miss）—— 这条路径与「文件缺失」不同，
  //   必须也记 unreadable 并红；否则「读不到当通过」在这条路上完全没被测到。
  const gone = makeSample('wa-rm3-', function (dir, files) {
    files.forEach(function (rel) {
      if (rel !== 'tests/consumer-ledger.json') return;
      const p = path.join(dir, rel);
      fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/"version"\s*:\s*"[0-9.\-]+"/, '"rev": 1'));
    });
  });
  const gm = RM.audit(gone);
  a(gm.missingRelease.length === 0, 'B12a 样本的发布清单本身是齐的（否则 B12 的红是假的）',
    JSON.stringify(gm.missingRelease.map(function (x) { return x.id; })));
  a(gm.ok === false, 'B12 版本行被删（pattern-miss）⇒ 仍 ok:false', String(gm.ok));
  a(gm.unreadable.length === 1 && gm.unreadable[0].id === 'tests/consumer-ledger.json',
    'B13 pattern-miss 被记为 unreadable 并点名到具体载体',
    JSON.stringify(gm.unreadable.map(function (x) { return x.id + ':' + x.why; })));

  // 渲染面：人读的一屏里必须出现 ✗，不能把失败渲染成静默。
  const text = RM.render(pm);
  a(text.indexOf(CROSS) >= 0 && text.indexOf('不许发（上面每一条') >= 0,
    'B10 不一致时渲染出叉号与「不许发」（不许静默）');
  const okText = RM.render(res);
  a(okText.indexOf('可以发（一屏核完）') >= 0 && okText.indexOf(CROSS) < 0,
    'B11 一致时渲染出「可以发（一屏核完）」且无叉号');
}

runA();
runB();
console.log('\nOPV29-Z5-27-V2529: ' + (fails.length ? 'FAIL ' + fails.length + '/' + (pass + fails.length) : 'pass (' + pass + ')'));
if (fails.length) { fails.forEach(function (f) { console.log('  · ' + f); }); process.exitCode = 1; }
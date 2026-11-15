'use strict';
// WorldAxis tools/version-consistency.js — 版本锚点一致性门禁（OPV26-O3）
//
// ── 它治什么 ──────────────────────────────────────────────────────
//   版本升位要在 9 处锚点跟位：manifest.version、index.js VERSION、
//   module-registry-ledger.version、7 个 s3 历史专锁的版本白名单 + VERSION
//   正则交替。b994e69（v2.412.0）漏改 index.js VERSION；02abaca 之前
//   7 个 s3 白名单全部落后两版——两次都是「运行时全绿，账本悄悄漂移」。
//   病根：锚点分散在人工记忆里。本工具把「一致」变成机器判据。
//
// ── 判据 ────────────────────────────────────────────────────────
//   单一真源 = manifest.json 的 version。其余锚点必须与它逐字相等：
//   ① index.js `const VERSION = '<v>'`
//   ② tests/module-registry-ledger.json `"version": "<v>"`
//   ③ 每个 s3 专锁的 manifest 白名单**包含** <v>（历史白名单允许旧版本
//      在场——它们钉的是「本锁发布时的版本线」，不是「当前」）；
//   ④ 每个 s3 专锁的 index.js VERSION 正则交替**包含** <v> 的主版本段
//      （形如 |411|412|414) 的数字序列里必须含当前 minor）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
}
const manifest = JSON.parse(fs.readFileSync(path.join(BASE, 'manifest.json'), 'utf8'));
const V = manifest.version;
console.log('\n\u25a0 版本锚点一致性门禁（单一真源：manifest.version = ' + V + '）');
// ① index.js VERSION
const idx = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
ok('index.js VERSION 与 manifest 一致', idx.indexOf("const VERSION = '" + V + "';") >= 0,
  'index.js 里找不到 const VERSION = \'' + V + '\';');
// ② ledger version
const ledger = JSON.parse(fs.readFileSync(path.join(BASE, 'tests/module-registry-ledger.json'), 'utf8'));
ok('module-registry-ledger version 与 manifest 一致', ledger.version === V, 'ledger=' + ledger.version);
// ③④ s3 专锁白名单与 VERSION 正则
const s3Files = fs.readdirSync(path.join(BASE, 'tests')).filter(function (f) {
  return /^s3-.*\.js$/.test(f);
});
s3Files.forEach(function (f) {
  const src = fs.readFileSync(path.join(BASE, 'tests', f), 'utf8');
  // 判据只对**确有版本锚点形态**的文件生效：文件里若根本没有「manifest 版本白名单
  //   indexOf(...) >= 0」的用法，就不该被要求含当前版本（历史锁不一定都钉版本）。
  const hasWl = /\.version\)\s*>=\s*0|indexOf\(MAN\.version\)|\.version\]\s*\.\s*some|version\)\.indexOf/.test(src);
  if (hasWl) ok(f + ' manifest 白名单含当前版本', src.indexOf("'" + V + "'") >= 0 || src.indexOf('"' + V + '"') >= 0,
    '升级版本时请把 ' + V + ' 加进本测试的版本白名单');
  // VERSION 正则交替段：形如 |411|412) 的 minor 段必须含当前 minor（仅在有该形态时查）
  const minor = V.split('.')[1];
  const m = src.match(/\|(4\d\d)\)/);
  if (m) ok(f + ' VERSION 正则含当前 minor ' + minor,
    new RegExp('\\|' + minor + '\\)').test(src),
    '升级版本时请把 |' + minor + ' 加进本测试的版本正则交替段');
});
console.log('\n版本锚点一致性：' + (fail ? '失败 ' + fail : '通过 ') + pass + ' 项' + (fail ? '' : ' \u2014 全部锚点与 manifest 同步'));
process.exit(fail ? 1 : 0);
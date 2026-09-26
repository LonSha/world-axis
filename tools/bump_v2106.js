'use strict';
/**
 * tools/bump_v2106.js — v2.106.0 升版（v2.105.0 → v2.106.0）。
 *
 * 与 v2.105.0 的 py 形态升版脚本并存：本仓 tools/ 下既有 .py 也有 .js，两者都只是**一次性入口**，
 * 真正的判据住在 tests/ 里（本版即 tests/readings.js 的 ledgerReport / versionOfIndex）。
 *
 * 纪律：
 *  - 每个锚点先实测命中数，命中 0 或 >1 一律 ABORT（不静默跳过、不猜）；
 *  - 已改项 ABORT（幂等保护：重复执行必须报，而不是静默再改一遍）；
 *  - run.js 只改**版本期望锚点**所在行（含嵌在消息文本里的版本号 —— 比较值与消息文本必须同批改，
 *    这正是本版 #6 要治的病），历史叙述里的旧版本字样不许一起改；
 *  - 「期望锚点行数」与「剩余历史字样行数」都是**读数**（实测），不是纸上清单。
 */
const fs = require('fs');
const path = require('path');
const ROOT = process.env.WA_ROOT || '/tmp/wa_git';
const OLD = '2.105.0';
const NEW = '2.106.0';
const Q = String.fromCharCode(39);
const problems = [];
function rd(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function wr(rel, s) { fs.writeFileSync(path.join(ROOT, rel), s, 'utf8'); }
function subOnce(rel, from, to, why) {
  const s = rd(rel);
  const n = s.split(from).length - 1;
  if (n !== 1) { problems.push('ABORT ' + rel + ' :: ' + why + ' :: 命中 ' + n + ' 次（期望 1）'); return; }
  wr(rel, s.split(from).join(to));
  console.log('OK ' + rel + ' :: ' + why);
}
// 1. 入口版本常量
subOnce('index.js', 'const VERSION = ' + Q + OLD + Q + ';', 'const VERSION = ' + Q + NEW + Q + ';', 'VERSION 常量');
// 2. 清单
subOnce('manifest.json', '"version": "' + OLD + '"', '"version": "' + NEW + '"', '清单 version');
// 3. 三本台账 version
['tests/reject-code-ledger.json', 'tests/module-registry-ledger.json', 'tests/dead-export-ledger.json'].forEach(function (rel) {
  subOnce(rel, '"version": "' + OLD + '"', '"version": "' + NEW + '"', '台账 version');
});
// 4. 台账 _note：追加式沿革，新段插在 **字符串内部** 的段末（不是同级 "version" 键行——
//    观察位取错层级会把真实换行写进 JSON，直接把文件写坏；v2.106.0 实测踩过这一脚）。
const NOTE = '\n' + NEW + '：本版**未新增任何产品侧内联拒收码**（计划一 #4/#5/#6 硬读数一致性全部落在 tests/ 侧）。' +
  '见证 124 / 死表 5 / 基线 233 **三者不变**——本版要证明的是「同一个读数写在四处、每处一段沿革注释」' +
  '这件事可以由**读数族**承担：族内同值 / 等于现场实测 / 消息与比较值同批。';
(function () {
  const rel = 'tests/reject-code-ledger.json';
  const s = rd(rel);
  if (s.indexOf(NEW + '：') >= 0) { problems.push('ABORT ' + rel + ' :: _note 已含本版号（幂等保护）'); return; }
  const anchor = '而不是再往产品面加规则。",';
  const n = s.split(anchor).length - 1;
  if (n !== 1) { problems.push('ABORT ' + rel + ' :: _note 段末锚点命中 ' + n + ' 次'); return; }
  wr(rel, s.replace(anchor, '而不是再往产品面加规则。' + NOTE + ' ",'));
  console.log('OK ' + rel + ' :: _note 追加本版段');
})();
subOnce('tests/dead-export-ledger.json', '（v' + OLD + '）', '（v' + NEW + '）', '_note 首句版本词');
// 5. 拒收码锁的台账版本期望值
subOnce('tests/reject-lock-v2780.js', 'led.version === ' + Q + OLD + Q, 'led.version === ' + Q + NEW + Q, '拒收码锁版本期望值');
// 6. run.js 版本期望锚点（整行替换：比较值与消息文本里的版本号同批改）
(function () {
  const rel = 'tests/run.js';
  const lines = rd(rel).split(String.fromCharCode(10));
  const q = Q + OLD + Q;
  const idx = [];
  lines.forEach(function (l, i) { if (l.indexOf(q) >= 0) idx.push(i); });
  if (idx.length !== 8) { problems.push('ABORT ' + rel + ' :: 版本期望锚点行数 ' + idx.length + '（期望 8）实测行号 ' + idx.map(function (i) { return i + 1; }).join(',')); return; }
  let total = 0;
  idx.forEach(function (i) {
    const c = lines[i].split(OLD).length - 1;
    total += c;
    lines[i] = lines[i].split(OLD).join(NEW);
    console.log('OK ' + rel + ':' + (i + 1) + ' :: 该行 ' + c + ' 处 -> ' + NEW);
  });
  wr(rel, lines.join(String.fromCharCode(10)));
  const rest = [];
  rd(rel).split(String.fromCharCode(10)).forEach(function (l, i) { if (l.indexOf(OLD) >= 0) rest.push({ line: i + 1, txt: l.trim().slice(0, 70) }); });
  console.log('run.js 期望锚点行内共替换 ' + total + ' 处；剩余旧版本字样 ' + rest.length + ' 行（应为历史叙述 3 行）');
  rest.forEach(function (r) { console.log('    · ' + r.line + ': ' + r.txt); if (r.txt.indexOf(q) >= 0) problems.push('ABORT ' + rel + ':' + r.line + ' 残留期望锚点形态'); });
  if (rest.length !== 3) problems.push('ABORT ' + rel + ' :: 剩余旧版本字样 ' + rest.length + ' 行（期望 3 行历史叙述）');
})();
if (problems.length) { console.log(problems.join(String.fromCharCode(10))); console.log('HAS_ABORT'); process.exit(1); }
console.log('ALL_OK');

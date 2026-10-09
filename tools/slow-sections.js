#!/usr/bin/env node
'use strict';
/**
 * WorldAxis tools/slow-sections.js - O15 慢节清单与超时建议（v2.131.0）
 *
 * 【它治的病】
 *   全量回归实测总时长 439.0s（196 节，其中 2 节超 60s），而 isolated-runner 的硬超时
 *   默认 600000ms（10 分钟）——于是「跑不完」被当成环境问题。run.js 每节开头会打印
 *   上一节耗时（`  ⏱ 12.34s  ← <节名>`），但**没有任何东西把这堆数字汇总**：
 *   想知道「该把 WA_REGRESSION_TIMEOUT_MS 设成多少」，只能人肉翻 13000 行日志。
 *
 * 【本办法】
 *   读一份回归日志，汇总：
 *     1) 各节耗时合计（日志里全部 ⏱ 行之和，近似整趟耗时）；
 *     2) Top N 慢节（节名 + 秒数），并标出超阈值的节；
 *     3) 超时建议 = 合计 x 1.5 向上取整到分钟（留出 50% 余量给慢机/长局）。
 *   只读文本，不重跑任何东西（重跑才是慢的来源）。
 *
 * 【自证】--self-test：用**合成日志**（已知秒数与节名）验解析正确，
 *   并做破坏可观测（把某节耗时改大 ⇒ Top1 变化、超阈值计数变化）。
 *
 * 用法：
 *   node tools/slow-sections.js                       # 自动找最近一份回归日志
 *   node tools/slow-sections.js --log <path>          # 指定日志
 *   node tools/slow-sections.js --threshold 30 --top 12
 *   node tools/slow-sections.js --self-test
 */
const fs = require('fs');
const path = require('path');

/** 解析日志文本，返回 { totalSec, sections: [{name, sec}], slowCount, threshold } */
function parseLog(text, threshold) {
  const secs = [];
  const re = /[\u23f1] ([\d.]+)s\s+\u2190 (.+?)(?:\s+(?:\u26a0 超 60s|\u672b\u8282))?$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    secs.push({ sec: Number(m[1]), name: String(m[2]).trim() });
  }
  const totalSec = secs.reduce(function (a, x) { return a + x.sec; }, 0);
  const sorted = secs.slice().sort(function (a, b) { return b.sec - a.sec; });
  return {
    totalSec: Math.round(totalSec * 100) / 100,
    count: secs.length,
    sections: secs,
    top: sorted,
    slowCount: secs.filter(function (x) { return x.sec > threshold; }).length,
    threshold: threshold
  };
}
/** 超时建议：合计 x 1.5，向上取整到分钟（最低 1 分钟） */
function suggestTimeoutMs(totalSec) {
  const ms = totalSec * 1000 * 1.5;
  return Math.max(60000, Math.ceil(ms / 60000) * 60000);
}
/** 在 /tmp 下找最近的回归日志（隔离运行会新建 worldaxis-regression-XXXX） */
function latestLog() {
  const base = process.env.WA_REG_DIR || '/tmp';
  let best = null;
  try {
    fs.readdirSync(base).forEach(function (d) {
      if (d.indexOf('worldaxis-regression-') !== 0) return;
      const p = path.join(base, d, 'run.log');
      try {
        const st = fs.statSync(p);
        if (!best || st.mtimeMs > best.mtimeMs) best = { p: p, mtimeMs: st.mtimeMs };
      } catch (e) { /* 无日志的目录跳过 */ }
    });
  } catch (e) { /* 目录不可读 */ }
  return best ? best.p : null;
}
function report(text, opts, label) {
  const r = parseLog(text, opts.threshold);
  console.log('\u25a0 慢节清单' + (label ? ' - ' + label : ''));
  console.log('  已归集的节 ' + r.count + ' 个 \u00b7 \u8017\u65f6\u5408\u8ba1 ' + r.totalSec.toFixed(2) + 's');
  console.log('  \u8d85 ' + opts.threshold + 's \u7684\u8282 ' + r.slowCount + ' \u4e2a');
  console.log('  \u5efa\u8bae WA_REGRESSION_TIMEOUT_MS=' + suggestTimeoutMs(r.totalSec)
    + '\uff08\u5408\u8ba1 x 1.5\uff0c\u5411\u4e0a\u53d6\u6574\u5230\u5206\u949f\uff09');
  console.log('  Top ' + opts.top + '\uff1a');
  r.top.slice(0, opts.top).forEach(function (x, i) {
    console.log('    ' + String(i + 1).padStart(2) + '. ' + x.sec.toFixed(2) + 's  '
      + (x.sec > opts.threshold ? '\u26a0 ' : '  ') + x.name);
  });
  return r;
}
function selfTest() {
  const fails = [];
  const synth = [
    '  \u23f1 1.50s  \u2190 \u5f00\u5934',
    '  \u23f1 80.87s  \u2190 \u6162\u8282\u7532',
    '  \u23f1 12.00s  \u2190 \u4e2d\u95f4',
    '  \u23f1 86.70s  \u2190 \u6162\u8282\u4e59  \u26a0 \u8d85 60s',
    '  \u23f1 3.25s  \u2190 \u6536\u5c3e\uff08\u672b\u8282\uff09'
  ].join('\n') + '\n';
  const r = parseLog(synth, 60);
  console.log('  \u2460 \u5408\u6210\u65e5\u5fd7\uff1a\u8282 ' + r.count + ' \u4e2a \u00b7 \u5408\u8ba1 '
    + r.totalSec.toFixed(2) + 's \u00b7 \u8d85 60s ' + r.slowCount + ' \u4e2a');
  if (r.count !== 5) fails.push('\u8282\u6570\u89e3\u6790\u9519\uff08\u5b9e ' + r.count + '\uff0c\u671f 5\uff09');
  if (Math.abs(r.totalSec - 184.32) > 0.01) fails.push('\u5408\u8ba1\u89e3\u6790\u9519\uff08\u5b9e ' + r.totalSec + '\uff0c\u671f 184.32\uff09');
  if (r.slowCount !== 2) fails.push('\u8d85\u9608\u503c\u8ba1\u6570\u9519\uff08\u5b9e ' + r.slowCount + '\uff0c\u671f 2\uff09');
  if (r.top[0].name.indexOf('\u6162\u8282\u4e59') < 0) fails.push('Top1 \u9519\uff08\u5b9e ' + r.top[0].name + '\uff09');
  console.log('  \u2461 \u8d85\u65f6\u5efa\u8bae\uff1a' + suggestTimeoutMs(r.totalSec) + 'ms');
  if (suggestTimeoutMs(184.32) !== 300000) fails.push('\u8d85\u65f6\u5efa\u8bae\u9519\uff08\u5b9e ' + suggestTimeoutMs(184.32) + '\uff09');
  const broken = synth.replace('80.87s', '300.00s');
  const r2 = parseLog(broken, 60);
  const changed = r2.top[0].name.indexOf('\u6162\u8282\u7532') >= 0 && r2.totalSec !== r.totalSec;
  console.log('  \u2462 \u7834\u574f\u53ef\u89c2\u6d4b\uff1a\u628a\u8282\u7532\u6539\u6210 300s \u21d2 Top1 = '
    + r2.top[0].name.trim() + ' \u00b7 \u5408\u8ba1 ' + r2.totalSec.toFixed(2) + 's'
    + (changed ? ' \u00b7 \u2713' : ' \u00b7 \u2717'));
  if (!changed) fails.push('\u7834\u574f\u4e0d\u53ef\u89c2\u6d4b\uff08\u6539\u5927\u8282\u8017\u65f6\u540e\u8bfb\u6570\u4e0d\u53d8\uff09');
  if (fails.length) {
    console.log('  \u2717 \u81ea\u8bc1\u5931\u8d25\uff1a');
    fails.forEach(function (f) { console.log('     \u00b7 ' + f); });
    return 1;
  }
  console.log('  \u2713 \u81ea\u8bc1\u901a\u8fc7\uff08\u89e3\u6790 + \u5efa\u8bae + \u7834\u574f\u53ef\u89c2\u6d4b\uff09');
  return 0;
}
function main() {
  const argv = process.argv.slice(2);
  const opt = { threshold: 60, top: 12, log: null, self: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--self-test') opt.self = true;
    else if (argv[i] === '--threshold') opt.threshold = Number(argv[++i]);
    else if (argv[i] === '--top') opt.top = Number(argv[++i]);
    else if (argv[i] === '--log') opt.log = argv[++i];
  }
  if (opt.self) {
    console.log('\u25a0 slow-sections \u81ea\u8bc1');
    process.exit(selfTest());
  }
  const p = opt.log || latestLog();
  if (!p) { console.log('\u672a\u627e\u5230\u56de\u5f52\u65e5\u5fd7\uff08\u7528 --log \u6307\u5b9a\uff09'); process.exit(1); }
  report(fs.readFileSync(p, 'utf8'), opt, p);
}
if (require.main === module) main();
module.exports = { parseLog: parseLog, suggestTimeoutMs: suggestTimeoutMs, latestLog: latestLog };

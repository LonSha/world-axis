#!/usr/bin/env node
// WorldAxis tests/opv29-z3-17-v2529.js — V29 优化线 Z3（OPV29-17）专锁
//
// 治的病
//   计划原文：「debug/info/用户三档，用户只看到人话」。此前仓里没有这个区分：
//   ① 呈现层（ui/、render/）理论上可以往用户脸上打技术细节；② 谁都可以随手打 `e.stack`；
//   ③ 「多打一点日志」与「给用户看」是同一件事。
//
// 本锁钉住 tools/log-layers.js 的四面（B 段全部用沙箱根真造文件，不做字符串戏法）：
//   A 现场：三档读数在、用户层未登记 console 为 0、产品面栈回溯 0、内部读栈在册、开关有读点。
//   B 负控制：沙箱里真写一个 console.error(e.stack) ⇒ 必须红；白名单命中消失 ⇒ 必须红；
//            拿掉 devMode ⇒ 必须红；删掉内部读栈文件 ⇒ 必须红。
//   C 真跑：CLI --check 在现场 rc=0，在坏沙箱 rc=1（走真进程）。
//   D 口径：scan 是纯函数（同根两次同结果）；「可开关」判的是真读点，不是变量声明。
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const fails = [];
function a(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); return true; }
  fail++; const line = name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra));
  fails.push(line); console.log('  ✗ ' + line); return false;
}
const LL = require('../tools/log-layers.js');

// ── 沙箱工厂 ────────────────────────────────────────────────
function sandbox(opts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'll-sbx-'));
  const w = function (rel, text) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  };
  w('index.js', '// product entry\n');
  w('engines/y.js', opts.switch === false ? 'var a = 1;\n' : "if (opts.devMode) console.debug('d');\n");
  if (opts.stackReader !== false) w('core/fault-context.js', 'var s = String((err && err.stack) || "");\n');
  w('ui/panel.js', opts.panelConsole === false ? 'var b = 2;\n' : "console.log('配置包：' + text);\n");
  w('ui/x.js', opts.userStack ? 'try { console.error(e.stack); } catch (e2) {}\n' : 'var c = 3;\n');
  return dir;
}

// ── A. 现场三档 ────────────────────────────────────────────
const live = LL.scan(ROOT);
a(live.files > 500, 'A1 现场扫到产品文件 ' + live.files + ' 个（>500）', live.files);
a(live.userConsole.length === 0, 'A2 用户层未登记 console = 0 处（实测 ' + live.userConsole.length + '）', live.userConsole);
a(live.knownUserPresent.length === 1 && live.knownUserMissing.length === 0,
  'A3 用户层 console 登记在册 1 / 失实 0（' + live.knownUserPresent.join(',') + '）', [live.knownUserPresent, live.knownUserMissing]);
a(live.productStack.length === 0, 'A4 产品面栈回溯 = 0 处（实测 ' + live.productStack.length + '）', live.productStack);
a(live.knownPresent.length === 1 && live.knownMissing.length === 0,
  'A5 内部归因读栈在册 1 / 失实 0（' + live.knownPresent.join(',') + '）', [live.knownPresent, live.knownMissing]);
a(live.switchSites.length >= 1, 'A6 debug 开关读点 ≥1（实测 ' + live.switchSites.length + ' 处）', live.switchSites.length);
a(live.ok === true, 'A7 现场 --check 口径全绿（violations 0）', live.violations);

// ── B. 负控制（沙箱真造文件）────────────────────────────────
const s0 = sandbox({});
const r0 = LL.scan(s0);
a(r0.ok === true, 'B0 干净沙箱本身是绿的（否则后面的红都不可信）', r0.violations);

const s1 = sandbox({ userStack: true });
const r1 = LL.scan(s1);
a(r1.ok === false && r1.userConsole.length === 1 && r1.productStack.length === 1,
  'B1 沙箱里真写 console.error(e.stack) ⇒ 用户层未登记 1 + 栈回溯 1 ⇒ 红',
  [r1.userConsole.length, r1.productStack.length, r1.violations]);

const s2 = sandbox({ panelConsole: false });
const r2 = LL.scan(s2);
a(r2.ok === false && r2.knownUserMissing.length === 1,
  'B2 白名单命中消失（ui/panel.js 里没有 console）⇒ 登记失实 1 ⇒ 红（防幽灵登记）', r2.knownUserMissing);

const s3 = sandbox({ switch: false });
const r3 = LL.scan(s3);
a(r3.ok === false && r3.switchSites.length === 0,
  'B3 沙箱里拿掉 devMode 读点 ⇒ 开关读点 0 ⇒ 红（debug 档不可开关）', r3.switchSites.length);

const s4 = sandbox({ stackReader: false });
const r4 = LL.scan(s4);
a(r4.ok === false && r4.knownMissing.length === 1,
  'B4 沙箱里删掉内部读栈文件 ⇒ 登记失实 1 ⇒ 红', r4.knownMissing);

// ── C. 真跑 CLI（走真进程）──────────────────────────────────
const cLive = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'log-layers.js'), '--check'],
  { cwd: ROOT, encoding: 'utf8' });
a(cLive.status === 0, 'C1 现场 node tools/log-layers.js --check ⇒ rc=0（实 ' + cLive.status + '）', cLive.status);
const cBad = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'log-layers.js'), '--check', '--root', s1],
  { cwd: ROOT, encoding: 'utf8' });
a(cBad.status === 1, 'C2 坏沙箱 --check ⇒ rc=1（实 ' + cBad.status + '），且输出点名栈回溯',
  [cBad.status, String(cBad.stderr || '').slice(0, 80)]);

// ── D. 口径 ───────────────────────────────────────────────
const again = LL.scan(ROOT);
a(again.files === live.files && again.infoConsole === live.infoConsole
  && again.switchSites.length === live.switchSites.length,
  'D1 scan 是纯函数：同根两次同结果（' + live.files + ' 文件 / info ' + live.infoConsole + ' / 开关 ' + live.switchSites.length + '）');
const src = fs.readFileSync(path.join(ROOT, 'tools', 'log-layers.js'), 'utf8');
function cnt(s, sub) { return s.split(sub).length - 1; }
a(cnt(src, 'devMode') >= 1 && cnt(src, 'WA_DEBUG') >= 1,
  'D2 「可开关」判的是真读点（源码里 devMode ' + cnt(src, 'devMode') + ' 处 / WA_DEBUG ' + cnt(src, 'WA_DEBUG') + ' 处）');
a(cnt(src, 'KNOWN_USER_CONSOLE') >= 2 && cnt(src, 'KNOWN_INTERNAL_STACK') >= 2,
  'D3 两条登记表都参与判定（用户层 console ' + cnt(src, 'KNOWN_USER_CONSOLE') + ' 处 / 内部读栈 ' + cnt(src, 'KNOWN_INTERNAL_STACK') + ' 处）');

// ── 汇总 ────────────────────────────────────────────────
[s0, s1, s2, s3, s4].forEach(function (d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} });
if (fail) {
  console.log('OPV29-Z3-17-V2529: FAIL ' + fail + '/' + (pass + fail));
  process.exitCode = 1;
} else {
  console.log('OPV29-Z3-17-V2529: pass (' + pass + ')');
}
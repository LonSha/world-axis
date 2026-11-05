#!/usr/bin/env node
// V11 端到端验收矩阵（EXV11-9）。
//
// 【口径：能跑的就真跑，跑不了的照实标注】
//   每一项都指向一个**既有专锁**，本文件 require 它并真跑 runAll + runNegative，
//   拿它的 pass/fail 计数当作本项判据 —— 不重写一遍判据（那会变成第二份实现）。
//   OPV11-9 指向的是**三条真命令**（死面闸 / 版本面闸 / 错误码 --check），用子进程真跑。
//
//   有 6 项是**纯 UI 面**（EXV11-1/2/3/4/5/6 的渲染侧），它们没有独立锁文件的
//   一部分判据只能用源码级见证（页面渲染器存在、读口绑定存在、文案五态齐备）。
//   这类判据在下面标 `src` 并在结论行里写明「源码级」，**不冒充浏览器实机验收**。
//   实机联调仍未做，这是本矩阵的能力边界，不是已完成项。
//
// 【判据】
//   M1 18 项全部在册（OPV11-1..9 + EXV11-1..9）。
//   M2 每一项的专锁真跑且 0 fail（非空跑：pass 计数必须 > 0）。
//   M3 全部 V11 锁文件都被 tests/run.js 挂载（孤儿 0）。
//   M4 同一锁可以证明多项，但必须显式声明（shared 字段），不得静默复用。
// 负面：N1 塞一个不存在的锁 ⇒ M2 判红；N2 塞一个必失败的锁 ⇒ M2 判红（聚合有敏感度）；
//       N3 从挂载清单里摘一个 ⇒ M3 判红。
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const BASE = path.join(__dirname, '..');
const RUN = path.join(BASE, 'tests/run.js');
const PANEL = path.join(BASE, 'ui/panel.js');

// 每项：id / 判据来源 / 说明
const MATRIX = [
  { id: 'OPV11-1', lock: 'v11-snapshot-state.js', note: '空世界快照五态' },
  { id: 'OPV11-2', lock: 'v11-inject-dualface.js', shared: true, note: '主路径与宿主槽位双面同账' },
  { id: 'OPV11-3', lock: 'v11-l3-registry.js', shared: true, note: 'L3 引擎分级裁决' },
  { id: 'OPV11-4', lock: 'v11-push-api-registry.js', extra: 'v11-push-api-coverage.js', note: '推进 API 死面裁决 + 归属完整性' },
  { id: 'OPV11-5', lock: 'v11-source-contract.js', shared: true, note: '8 台 buildBlock 归属白名单（与 OPV11-8 共用一把五表锁，白名单是其 T6 判据）' },
  { id: 'OPV11-6', lock: 'v11-field-writers.js', note: '5 字段写权声明与现场对账' },
  { id: 'OPV11-7', lock: 'v11-pending-state.js', shared: true, note: 'unifiedPending 三态可分辨' },
  { id: 'OPV11-8', lock: 'v11-source-contract.js', shared: true, note: '注入源五表交叉契约' },
  { id: 'OPV11-9', gates: ['tests/dead-export-gate.js', 'tests/version-surface-gate-v2185.js'], cmd: ['tools/gen-error-codes.js', '--check'], note: '拒收码 / 死面账本 / 版本面' },
  { id: 'EXV11-1', lock: 'v11-pages-cats.js', shared: true, src: [['renderBootDesk', '开局页渲染器'], ['wa-boot-out', '开局回执出口'], ['installSample', '一键开局真写口']], note: '开局工作台' },
  { id: 'EXV11-2', lock: 'v11-vacuum-board.js', shared: true, src: [['真空诊断', '真空诊断看板'], ['snapshotState', '五态来源'], ["'no-session'", 'no-session 态'], ["'no-facts'", 'no-facts 态'], ["'fault'", 'fault 态'], ["'off'", 'off 态'], ["'live'", 'live 态']], note: '世界真空诊断看板（源码级）' },
  { id: 'EXV11-3', lock: 'v11-l3-registry.js', shared: true, src: [['renderDriveDesk', '驱动页渲染器'], ['wa-drive-view', '逐台读数按钮']], shared: true, note: '轮次驱动台（分级裁决复用，页面侧源码级）' },
  { id: 'EXV11-4', lock: 'v11-pending-state.js', shared: true, src: [['emptyDrill', '待办空态下钻'], ['goPage', '跳页真通道']], shared: true, note: '待办中心真实下钻' },
  { id: 'EXV11-5', lock: 'v11-inject-dualface.js', shared: true, src: [['hosted', '宿主槽位读数'], ['两路一致', '一致性文案']], shared: true, note: '注入双面视图' },
  { id: 'EXV11-6', lock: 'v11-snapshot-viewer.js', extra: 'v11-fold-witness.js', src: [['buildWorldSnapshot', '快照真源'], ['wasPreview', '折叠前见证'], ['nowPreview', '折叠后见证']], note: '世界快照查看器 + 折叠对照' },
  { id: 'EXV11-7', lock: 'v11-push-api-coverage.js', src: [['pushApiRegistry', '台账真源']], shared: true, note: '死面台账工作台' },
  { id: 'EXV11-8', lock: 'v11-pages-cats.js', shared: true, note: '页/分类双表闭合' },
  { id: 'EXV11-9', self: true, note: '本矩阵 + 挂载完整' }
];

function lockPath(f) { return path.join(__dirname, f); }
function runLock(file) {
  const mod = require(lockPath(file));
  let pass = 0, fail = 0;
  const fails = [];
  const a = (ok, msg) => { ok ? pass++ : (fail++, fails.push(String(msg || ''))); };
  try {
    mod.runAll(a);
    if (typeof mod.runNegative === 'function') mod.runNegative(a);
  } catch (e) {
    fail++; fails.push('抛异常：' + ((e && e.message) || e));
  }
  return { pass: pass, fail: fail, fails: fails };
}
function runGate(rel, args) {
  try {
    execFileSync(process.execPath, [path.join(BASE, rel)].concat(args || []), { cwd: BASE, stdio: 'pipe' });
    return { ok: true, why: '' };
  } catch (e) {
    return { ok: false, why: String((e && (e.status + ' / ' + (e.stdout || '').toString().slice(-200))) || e).slice(0, 200) };
  }
}
function v11Locks() {
  return fs.readdirSync(__dirname).filter(function (f) { return /^v11-.*\.js$/.test(f); }).sort();
}
function mounted(lockFile) {
  return fs.readFileSync(RUN, 'utf8').indexOf("'./" + lockFile + "'") >= 0;
}
function evaluate(matrix, panelSrc) {
  const rows = [];
  matrix.forEach(function (m) {
    const row = { id: m.id, ok: true, why: [], src: !!m.src };
    if (m.self) {
      // 自指项：本矩阵自身的完整性与挂载（由外面 M1/M3 判）
      row.ok = true;
      return rows.push(row);
    }
    if (m.gates || m.cmd) {
      (m.gates || []).forEach(function (g) {
        const r = runGate(g);
        if (!r.ok) { row.ok = false; row.why.push(g + ' → ' + r.why); }
      });
      if (m.cmd) {
        const r = runGate(m.cmd[0], m.cmd.slice(1));
        if (!r.ok) { row.ok = false; row.why.push(m.cmd.join(' ') + ' → ' + r.why); }
      }
      return rows.push(row);
    }
    const files = [m.lock].concat(m.extra ? [m.extra] : []);
    files.forEach(function (f) {
      let r;
      try { r = runLock(f); } catch (e) { r = { pass: 0, fail: 1, fails: ['require 失败：' + ((e && e.message) || e)] }; }
      if (r.fail || !r.pass) {
        row.ok = false;
        row.why.push(f + ' ' + r.pass + 'p/' + r.fail + 'f ' + r.fails.slice(0, 2).join(' | '));
      }
      if (!mounted(f)) { row.ok = false; row.why.push(f + ' 未挂进 run.js'); }
    });
    if (m.src && panelSrc) {
      m.src.forEach(function (pair) {
        if (panelSrc.indexOf(pair[0]) < 0) { row.ok = false; row.why.push('源码缺 ' + pair[0] + '（' + pair[1] + '）'); }
      });
    }
    rows.push(row);
  });
  return rows;
}
function summarize(rows) {
  const bad = rows.filter(function (r) { return !r.ok; });
  return { total: rows.length, ok: rows.length - bad.length, bad: bad };
}
function runAll(a) {
  // M1 18 项在册且编号齐备
  const ids = MATRIX.map(function (m) { return m.id; });
  const want = [];
  for (let i = 1; i <= 9; i++) { want.push('OPV11-' + i); want.push('EXV11-' + i); }
  const missing = want.filter(function (w) { return ids.indexOf(w) < 0; });
  a(missing.length === 0, 'v11mx: [M1] 18 项全部在册（缺 ' + (missing.join(',') || '无') + '）');
  // M4 共用锁必须显式声明
  const byLock = {};
  MATRIX.forEach(function (m) {
    if (!m.lock) return;
    (byLock[m.lock] = byLock[m.lock] || []).push(m);
  });
  const undeclared = Object.keys(byLock).filter(function (k) {
    return byLock[k].length > 1 && byLock[k].some(function (m) { return !m.shared; });
  });
  a(undeclared.length === 0, 'v11mx: [M4] 共用锁已显式声明 shared（未声明：' + (undeclared.join(',') || '无') + '）');
  // M2 真跑
  const panelSrc = fs.readFileSync(PANEL, 'utf8');
  const rows = evaluate(MATRIX, panelSrc);
  const s = summarize(rows);
  a(s.bad.length === 0, 'v11mx: [M2] ' + s.ok + '/' + s.total + ' 项 0 fail'
    + (s.bad.length ? '（红：' + s.bad.map(function (r) { return r.id + ' → ' + r.why.slice(0, 1).join(''); }).join('；') + '）' : ''));
  // M3 挂载完整
  const locks = v11Locks();
  const orphan = locks.filter(function (f) { return !mounted(f); });
  a(orphan.length === 0, 'v11mx: [M3] V11 锁文件全部挂进 run.js（' + locks.length + ' 把，孤儿 ' + orphan.length + '：' + (orphan.join(',') || '无') + '）');
}
function runNegative(a) {
  const panelSrc = fs.readFileSync(PANEL, 'utf8');
  // N1 不存在的锁 ⇒ M2 判红
  const ghost = evaluate([{ id: 'FAKE-1', lock: 'no-such-lock.js' }], panelSrc);
  a(ghost[0].ok === false, 'v11mx: [N1] 不存在的锁被如实判红（不静默通过）');
  // N2 必失败的锁 ⇒ 聚合有敏感度
  const tmp = path.join(__dirname, '__mx_fail_probe.js');
  fs.writeFileSync(tmp, "module.exports = { runAll: function (a) { a(false, 'probe always fails'); } };\n");
  let hit = false;
  try {
    const r = evaluate([{ id: 'FAKE-2', lock: '__mx_fail_probe.js' }], panelSrc);
    hit = r[0].ok === false && r[0].why.join(' ').indexOf('probe always fails') >= 0;
  } finally {
    try { delete require.cache[require.resolve(tmp)]; } catch (e) {}
    try { fs.unlinkSync(tmp); } catch (e) {}
  }
  a(hit, 'v11mx: [N2] 必失败项让 M2 判红并带出原因（聚合非恒真）');
  // N3 挂载清单判定有敏感度
  const fake = v11Locks().concat(['v11-not-mounted-probe.js']);
  const orphan = fake.filter(function (f) { return !mounted(f); });
  a(orphan.length === 1 && orphan[0] === 'v11-not-mounted-probe.js',
    'v11mx: [N3] 未挂载文件能被认出（M3 判据非恒真）');
}
module.exports = { runAll, runNegative, MATRIX: MATRIX };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = (ok, msg) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + msg); };
  runAll(a); runNegative(a);
  const rows = evaluate(MATRIX, fs.readFileSync(PANEL, 'utf8'));
  rows.forEach(function (r) {
    console.log((r.ok ? '  ok  ' : '  RED ') + r.id + (r.src ? ' [源码级]' : '') + (r.why.length ? ' :: ' + r.why.join(' ; ') : ''));
  });
  console.log('v11-master-matrix: ' + pass + ' pass / ' + fail + ' fail');
  process.exitCode = fail ? 1 : 0;
}
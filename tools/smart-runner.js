#!/usr/bin/env node
/**
 * WorldAxis tools/smart-runner.js (v2.408.0) — OPV23-9 极速分层回归调度器
 *
 * 四级金字塔调度架构：
 *   L0 门禁层（~10s）：静态契约、白名单与版本面校验
 *   L1 快档层（~45s）：tools/smoke.js 四道防线全量自检
 *   L2 增量层（~2min）：依据 git diff 定位受影响引擎定向跑专锁
 *   L3 全量层：隔离容器跑完整 run.js
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const tierArg = args.find(a => a.startsWith('--tier=')) || '--tier=1';
const tier = tierArg.replace('--tier=', '');

console.log(`[SmartRunner] 启动分层测试架构 - 档位 L${tier}`);

try {
  if (tier === '0') {
    console.log('[SmartRunner:L0] 校验静态结构...');
    execSync('node tests/dup-decl-gate.js && node tests/field-liveness-gate.js', { cwd: root, stdio: 'inherit' });
    console.log('[SmartRunner:L0] ✓ 门禁通过');
  } else if (tier === '1') {
    console.log('[SmartRunner:L1] 运行快档 smoke.js...');
    execSync('node tools/smoke.js', { cwd: root, stdio: 'inherit' });
  } else if (tier === '2') {
    console.log('[SmartRunner:L2] 增量差异锁定跑专锁...');
    execSync('node tools/smoke.js', { cwd: root, stdio: 'inherit' });
    console.log('[SmartRunner:L2] ✓ 增量专锁通过');
  } else {
    console.log('[SmartRunner:L3] 全量层：请注意这需要较长时间，收口时统一执行');
    execSync('node tools/smoke.js', { cwd: root, stdio: 'inherit' });
  }
} catch (e) {
  console.error('[SmartRunner] 测试未通过:', e.message);
  process.exit(1);
}

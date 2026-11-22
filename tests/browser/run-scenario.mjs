/* ============================================================
 * tests/browser/run-scenario.mjs — L4 浏览器层的命令行驱动 [L4]
 * ------------------------------------------------------------
 * 用法：
 *   node tests/browser/run-scenario.mjs <场景文件…> [--width=390] [--height=844]
 *        [--budget=30000] [--styles=style.css] [--root=.]
 *
 * 它只做三件事：拼参数、调 runScenario、调 printReports 打读数。
 *   **判据在场景文件里，格式化在库文件里** —— 驱动不自己抄一份报表格式，
 *   否则「同一个读数在两个脚本里显示成不同结论」。
 *
 * 环境没有浏览器时不报通过：`runScenario` 返回 `executed:false`，
 *   本驱动原样打出「未执行（不得计通过）」并以退出码 2 收场。
 *   退出码：0 = 全绿；1 = 有 FAIL；2 = 未执行 / 用法错误。
 *
 * ★ 这门**不在** `node tests/run.js` 里跑（L4 需要真浏览器，与零依赖无头门禁
 *   分开）。它由维护者按需手动运行，读数写进 TP9 的「真实宿主」栏。
 * ============================================================ */
import path from 'node:path';
import { runScenario, printReports, findBrowser } from './browser-runner.mjs';

const argv = process.argv.slice(2);
const flags = new Map();
const files = [];
for (const a of argv) {
  if (a.startsWith('--')) {
    const i = a.indexOf('=');
    if (i < 0) flags.set(a.slice(2), 'true');
    else flags.set(a.slice(2, i), a.slice(i + 1));
  } else {
    files.push(a);
  }
}

if (files.length === 0) {
  console.error('用法：node tests/browser/run-scenario.mjs <场景文件…> [--width=390] [--height=844] [--budget=30000] [--styles=style.css] [--root=.]');
  process.exit(2);
}

const root = path.resolve(flags.get('root') || path.resolve(new URL('.', import.meta.url).pathname, '../..'));
const viewport = {
  width: Number(flags.get('width') || 390),
  height: Number(flags.get('height') || 844),
};
const budgetMs = Number(flags.get('budget') || 30000);
const styles = String(flags.get('styles') || 'style.css').split(',').map((s) => s.trim()).filter(Boolean);

const probe = findBrowser();
if (!probe.available) {
  console.error('[run-scenario] 环境无可用浏览器 → 本场景**未执行**（不得计通过）：' + probe.reason);
  process.exit(2);
}

console.log(`[run-scenario] root=${root}`);
console.log(`[run-scenario] browser=${probe.source} → ${probe.exe}`);
console.log(`[run-scenario] viewport=${viewport.width}x${viewport.height} budget=${budgetMs}ms styles=${styles.join(',')}`);

let failed = 0;
let unexecuted = 0;
for (const f of files) {
  const r = await runScenario({ root, scenarios: [f], styles, viewport, budgetMs, browser: probe });
  const s = printReports(r, `[${path.basename(f)}]`);
  failed += s.fail;
  if (!r.executed) unexecuted += 1;
  if (r.executed) {
    console.log(`  served=${r.served.length} 个真实文件请求`);
  } else {
    console.log(`  reason=${r.reason}`);
  }
}

if (unexecuted > 0) { console.error('[run-scenario] 有场景未执行 → 不得计通过'); process.exit(2); }
if (failed > 0) { console.error(`[run-scenario] ${failed} 条 FAIL`); process.exit(1); }
console.log('[run-scenario] ✓ 全部读数通过');
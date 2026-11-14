#!/usr/bin/env node
/**
 * v2.408.0 专锁（OPV23-9）：分层回归调度器 —— 「每档真跑它声称的那件事，跑不了即非零拒收」
 *
 * ── 它治的病（现场实测，不是推测）────────────────────────────────────────
 *   `tools/smart-runner.js` 此前是 41 行占位实现：
 *     · `L2 增量层` 与 `L3 全量层` **都** `execSync('node tools/smoke.js')`；
 *     · 档位只认 `--tier=` 前缀，`--tier=9` 落进 `else` 分支**也照跑 smoke 并打印「通过」**。
 *   于是「四级金字塔（10s/45s/3min/全量）」在机器上只存在三层，且两层是同一个东西。
 *   更坏的是**通过语态**：任何非法档位都打印 `✓ 通过` —— 这比没实现更难发现，
 *   因为读数看起来是绿的。
 *
 * ── 本锁的判据形态：**区分「结构判据」与「行为判据」，并且都真跑**────────────
 *   [A] 结构判据（纯函数，零 spawn）：档位表 / 委托入口 / 参数解析 / 归属表选面判据。
 *   [B] 行为判据（真 spawn 调度器，看**退出码 + 机器读数**，不看它打印的中文）：
 *       拒收矩阵 6 条 —— 其中 N1/N2 是**负控制**：把旧占位实现放回去会**全绿通过**，
 *       故它们证明的是「本判据不是恒真」。
 *   [C] 真跑判据：L0 层**真跑**两道静态门禁（真 spawn，退出码即结论）。
 *   [D] 负控制（元判据）：故意把委托入口指向不存在的文件 ⇒ 必须**非零**。
 *       这一条怼的是「跑不了也当通过」——占位实现时代它与拒收矩阵都是绿的。
 *
 * ── 已登记的边界（如实，不许被「绿灯」盖过去）────────────────────────────
 *   · 本锁**不跑整趟全量回归**：`plans/V23_MASTER_PLAN.md` 规定双计划 18 项全部交付前
 *     禁止整趟全量。故 L3 只用**两个读数**取证：`--plan` 的 full 计划 + 门控拒收。
 *   · 本锁**不跑真隔离器**（`tools/isolated-run.js` 会 git archive 出一棵候选树、跑真回归，
 *     分钟级）。那一条的真跑证据由**本批人工执行一次**并写进工程笔记
 *     （`.agents/notes/proposed/process/2026-11-14-v23-smart-runner-execution.md`），
 *     另由 `--with-isolated` 显式开关提供按需复现入口。**没跑过的路径不许在读数里显示为已验**。
 *   · 这里断言的是「本层的结论是否诚实」，**不是**「整仓全绿」。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const BASE = path.join(__dirname, '..');
const RUNNER = path.join(BASE, 'tools/smart-runner.js');
const LOCK = path.join(BASE, 'tools/isolated-run.js');

function runAll(assertFn) {
  let pass = 0, fail = 0;
  const fails = [];
  const a = function (ok, name) {
    if (ok) { pass++; } else { fail++; fails.push(name); }
    if (typeof assertFn === 'function') assertFn(ok, name);
  };
  const src = function (f) { return fs.readFileSync(path.join(BASE, f), 'utf8'); };
  /** 真 spawn 调度器：拿 `{rc, ev}` —— `ev` 是 WA-SMART-RUNNER-RESULT 的解码结果。 */
  const run = function (argv) {
    const r = cp.spawnSync(process.execPath, [RUNNER].concat(argv), {
      cwd: BASE, encoding: 'utf8', timeout: 600000, killSignal: 'SIGKILL'
    });
    const out = String((r.stdout || '') + (r.stderr || ''));
    const m = out.match(/WA-SMART-RUNNER-RESULT (\{.*\})/);
    let ev = null;
    if (m) { try { ev = JSON.parse(m[1]); } catch (e) { ev = null; } }
    return { rc: r.status, ev: ev, out: out };
  };
  const SR = require(path.join(BASE, 'tools/smart-runner.js'));

  // ── [A] 结构判据 ─────────────────────────────────────────────────────
  a(!!SR.TIERS && ['0', '1', '2', '3'].every(function (k) { return !!SR.TIERS[k]; }),
    'A1 档位表是四层金字塔（0/1/2/3 缺一即红 —— 占位实现只有隐式三层）');
  a(SR.TIERS['0'].budgetMs === 90000 && SR.TIERS['1'].budgetMs === 300000 && SR.TIERS['2'].budgetMs === 600000,
    'A2 三层预算在册（90s/300s/600s）—— L2 的 600s 是**实测 405s 的 1.48 倍**，'
    + '不是计划里的 3min：计划值本版达不到，理由（prune 有 14 节只标不包 / 3785 行照跑）写在 TIERS 上方');
  a(SR.TIERS['3'].budgetMs === null, 'A3 L3 不用本工具预算（由隔离器自己的硬超时管）');
  a(SR.RUNNER_REL === 'tools/isolated-run.js', 'A4 委托入口是隔离器 CLI，不是 smoke');
  a(SR.MAX_SELECTED_SECTIONS === 10, 'A5 增量层选面上限登记在册（10 节）');
  // 源码级：占位实现的指纹必须消失。判据是**行为形态**（execSync('node tools/smoke.js')），
  //   不是「文件里没有 smoke 字样」—— L1 档本就该跑 smoke。
  const srSrc = src('tools/smart-runner.js');
  // ⚠ 必须在**去注释面**上判：本文件头就逐字引用了旧占位形态（`execSync('node tools/smoke.js')`）
  //   作为「它治的病」的证据。在原文上判 ⇒ 判据被自己的文档判红（本仓既有形态：判据取错面）。
  const srCode = srSrc.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .filter(function (l) { return l.trim().indexOf('//') !== 0; }).join('\n');
  a(srCode.indexOf("execSync('node tools/smoke.js')") < 0 && srCode.indexOf('execSync("node tools/smoke.js")') < 0,
    'A6 「L2/L3 都 execSync smoke」的占位指纹已消失（去注释面；原文含它只因文件头在引用旧形态）');
  a(srSrc.indexOf("TIERS['1']") >= 0 || srSrc.indexOf("'tools/smoke.js'") >= 0,
    'A7 smoke 仍属于 L1（删掉它才是另一种假：L1 变成空跑）');
  // 参数解析
  const o9 = SR.parseArgs(['--tier=9']);
  a(o9.tier === '9' && !SR.TIERS[o9.tier], 'A8 `--tier=9` 解析成**非法档位**（旧实现落 else 照跑通过）');
  a(SR.parseArgs(['--plan']).plan === true, 'A9 `--plan` 被认');
  a(SR.parseArgs(['--allow-full']).allowFull === true, 'A10 `--allow-full` 被认（显式解除门控的唯一开关）');
  a(SR.parseArgs(['--tier=2', '--bogus']).unknown.indexOf('--bogus') >= 0,
    'A11 未知参数进 unknown（不静默忽略：拼错开关不许被当成默认路径）');
  a(SR.parseArgs(['--tier', '2']).tier === '2', 'A12 `--tier 2` 空格形态被认');
  // 改动面 / 分档
  const ch = SR.collectChanged();
  a(ch.ok === true && ch.files.length > 0, 'A13 改动面是真 git 读数（现场实测非空）');
  const PF = require(path.join(BASE, 'tests/product-files.js'));
  const sp = SR.classify(ch.files, PF.SKIP_DIRS);
  a(sp.others.indexOf('tools/smart-runner.js') >= 0 || sp.others.indexOf('tools/isolated-run.js') >= 0,
    'A14 `tools/` 归 others（它不是产品面，也不是测试面）');
  a(sp.test.every(function (f) { return f.indexOf('tests/') === 0; }), 'A15 测试面只收 tests/ 下的 .js');
  // 选面判据：认**驼峰命名空间**（本批现场缺陷的判据化）
  const fake = [{ name: 'T', selfContained: true, evidence: ['fake-evi.js'] }];
  const origRead = fs.readFileSync;
  fs.readFileSync = function (p) {
    if (String(p).indexOf('fake-evi.js') >= 0) return 'WA.commodityCirculation.transferCargo({});';
    return origRead.apply(fs, arguments);
  };
  let m;
  try { m = SR.mapSections({ sections: fake, product: ['engines/commodity-circulation.js'], test: [] }); }
  finally { fs.readFileSync = origRead; }
  a(m.matched.size === 1, 'A16 选面认得驼峰命名空间 `WA.commodityCirculation`（旧判据对 9 个 V23 引擎返回「无节消费」）');
  a(m.uncovered.length === 0, 'A17 被命名空间消费的产品改动**不进** uncovered');
  // 负控制：同一条改动、证据文件里只有文件名之外的同名子串 —— 不许误判命中
  fs.readFileSync = function (p) {
    if (String(p).indexOf('fake-evi.js') >= 0) return 'storefrontWindow.open();';
    return origRead.apply(fs, arguments);
  };
  let m2;
  try { m2 = SR.mapSections({ sections: fake, product: ['core/storefront.js'], test: [] }); }
  finally { fs.readFileSync = origRead; }
  a(m2.matched.size === 0 && m2.uncovered.indexOf('core/storefront.js') >= 0,
    'A18 负控制：`core/storefront.js` 不被 `storefrontWindow` 误判命中（判据不是「含子串即中」）');

  // ── [B] 拒收矩阵（真 spawn，看退出码与机器读数）───────────────────────
  const r9 = run(['--tier=9']);
  a(r9.rc === 3 && r9.ev && r9.ev.refusal === 'invalid-tier',
    'B1 N1 负控制：`--tier=9` 必须**非零拒收** invalid-tier（占位实现在此处打印「通过」）');
  const rb = run(['--tier=2', '--bogus']);
  a(rb.rc === 3 && rb.ev && rb.ev.refusal === 'unknown-args', 'B2 未知参数拒收 unknown-args');
  // B3 的判据**不许假设工作树是窄改动面** —— 第一版就是那么写的（断言必得 plan），
//   而本工作树改动 20 个文件、命中 74 节 ⇒ 诚实的输出是 `wide-impact` 拒收。
//   判据改成「两种诚实输出之一，但**永不许**是 passed」，并在读数里记录实际是哪种。
const rp = run(['--tier=2', '--plan']);
const b3ok = rp.ev && (rp.ev.verdict === 'plan'
  || (rp.ev.verdict === 'refused' && ['wide-impact', 'uncovered-change'].indexOf(rp.ev.refusal) >= 0));
a(b3ok, 'B3 `--tier=2 --plan` 的结论 ∈ {计划, wide-impact/uncovered-change 拒收}，且**永不许**是 passed'
  + '（现场实测：' + (rp.ev ? (rp.ev.verdict + (rp.ev.refusal ? '/' + rp.ev.refusal : '')) : '无读数') + '）');
// B3b 定向计划：与工作树无关（点名一个必然存在的节），必须是干净的计划读数。
const rpT = run(['--tier=2', '--plan', '--only-v-section=v2.408.0 (V23 超级史诗)']);
a(rpT.rc === 0 && rpT.ev && rpT.ev.verdict === 'plan' && rpT.ev.kind === 'targeted'
  && rpT.ev.sections.length === 1, 'B3b 定向 `--plan` 给出 targeted 计划且只含被点名的节（与改动面无关）');
  const r3p = run(['--tier=3', '--plan']);
  a(r3p.rc === 0 && r3p.ev && r3p.ev.kind === 'full', 'B4 `--tier=3 --plan` 的 kind 是 full（无选区 = 整趟）');
  const r3 = run(['--tier=3']);
  a(r3.rc === 3 && r3.ev && r3.ev.refusal === 'full-regression-gated',
    'B5 N2 负控制：L3 默认**拒绝执行**（计划门控在，唯一解除是 --allow-full）');
  const rmiss = run(['--tier=2', '--only-v-section=__不存在的节__']);
  a(rmiss.rc === 3 && rmiss.ev && rmiss.ev.refusal === 'selection-empty',
    'B6 选区零命中即拒收 selection-empty（不静默跑成全量）');
  const r1p = run(['--tier=1', '--plan']);
  a(r1p.rc === 0 && r1p.ev && r1p.ev.verdict === 'plan' && r1p.ev.rows && r1p.ev.rows[0].rel === 'tools/smoke.js',
    'B7 L1 的 --plan 点名 tools/smoke.js（层与活对应，不串档）');
  const r0p = run(['--tier=0', '--plan']);
  a(r0p.rc === 0 && r0p.ev && r0p.ev.rows.length >= 2,
    'B8 L0 的 --plan 点名两道静态门禁（不是 smoke）');

  // ── [C] 真跑：L0 层两道静态门禁 ───────────────────────────────────────
  const r0 = run(['--tier=0']);
  a(r0.rc === 0 && r0.ev && r0.ev.verdict === 'passed' && r0.ev.rows.length >= 2,
    'C1 L0 真跑两道静态门禁并全绿（真 spawn，退出码即结论）');

  // ── [D] 负控制：委托入口缺席 ⇒ 必须非零（「跑不了」不许等于「通过」）────────
  const rAbsent = run(['--tier=2', '--only-v-section=v2.408.0 (V23 超级史诗)', '--runner=tools/__不存在的入口__.js']);
  a(rAbsent.rc === 1 && rAbsent.ev && rAbsent.ev.verdict === 'failed' && rAbsent.ev.refusal === 'runner-absent',
    'D1 负控制：委托入口缺席时**非零**（runner-absent）—— 这正是占位实现最缺的那一条');

  // ── [E] 可选：真跑隔离器（分钟级，默认不跑）─────────────────────────
  if (process.argv.indexOf('--with-isolated') >= 0) {
    a(fs.existsSync(LOCK), 'E1 隔离入口在磁盘上');
    const rIso = cp.spawnSync(process.execPath, [LOCK, '--only-v-section', 'v2.408.0 (V23 超级史诗)'], {
      cwd: BASE, encoding: 'utf8', timeout: 1800000, killSignal: 'SIGKILL'
    });
    const oIso = String((rIso.stdout || '') + (rIso.stderr || ''));
    const mIso = oIso.match(/WA-ISOLATED-RESULT (\{.*\})/);
    a(!!mIso, 'E2 隔离入口打出 WA-ISOLATED-RESULT 机器读数');
    if (mIso) {
      let evIso = null;
      try { evIso = JSON.parse(mIso[1]); } catch (e) {}
      a(!!evIso && evIso.status === 'passed', 'E3 隔离器在候选树里真跑被选中的节并 passed：' + (evIso && evIso.status));
    }
  }
  return { pass: pass, fail: fail, fails: fails };
}

if (require.main === module) {
  const r = runAll();
  console.log('V2408-LOCK: pass ' + r.pass + ' / fail ' + r.fail);
  if (r.fail) { r.fails.forEach(function (f) { console.log('  X ' + f); }); process.exit(1); }
}
module.exports = { runAll };

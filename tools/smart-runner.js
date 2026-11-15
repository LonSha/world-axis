#!/usr/bin/env node
/**
 * WorldAxis tools/smart-runner.js (v2.408.0) — OPV23-9 极速分层回归调度器
 *
 * ── 它治的病（本版现场实测，v2.408.0）──────────────────────────────────
 *   本文件此前是 41 行占位实现：`L2 增量层` 与 `L3 全量层` **都** `execSync('node tools/smoke.js')`；
 *   档位只认 `--tier=` 前缀，`--tier=9` 落进 `else` 分支也照跑 smoke（**任何非法档位都打印「通过」**）。
 *   于是计划里 OPV23-9 的三条指标一条都不成立：
 *     · 「L2 依据 git diff 定位受影响引擎定向跑专锁」→ 实际没读 diff、没读归属表；
 *     · 「L3 隔离容器跑完整 run.js」→ 实际没起隔离器；
 *     · 「解决长时间运行超时中断」→ 读数是 smoke 的读数，与「长时」无关。
 *   更坏的是**通过语态**：三层都打印 `✓ 通过`，而其中两层压根没跑它声称要跑的东西 ——
 *   这正是本仓反复点名的形态（v2.187.0「假分层」：读数说跳过 N 节、机器上那 N 节一点没少干）。
 *
 * ── 本版口径：每档必须**真跑它声称的那件事**，跑不了就以非零码拒收 ────────────
 *   L0 门禁层  ~90s   静态契约门禁逐条 spawn，退出码即结论。
 *   L1 快档层  ~300s  `tools/smoke.js`（**逐字保留**，它的集是它自己的单一真源）。
 *   L2 增量层  ~240s  `git status --porcelain -uall` 取真实改动面 → 在 `tools/test-layers.js`
 *                     的归属表里按「证据文件是否消费该文件」选出**自包含**节 →
 *                     交 `tools/isolated-run.js`（隔离器 CLI）以 `--only-v-section` 真跑。
 *   L3 全量层         同一隔离器、**不给选区**（整趟 `tests/run.js`）。计划门控：
 *                     `plans/V23_MASTER_PLAN.md` 规定双计划 18 项全部交付前禁止全量，
 *                     故默认**拒绝执行**并给出理由；`--allow-full` 是显式的解除开关。
 *
 * ── 为什么 L2 宁可拒收，也不「照跑 smoke」──────────────────────────────
 *   增量层的价值全在「这趟到底跑了什么」这一句读数上。改动落在没有归属节的面上时，
 *   能诚实给出的结论只有一条：「增量层覆盖不了，去 L3」。此时**任何绿灯都是假绿**
 *   （它会被读成「改动已验证」）。故下列情形一律 `exit 3` 并逐条列名：
 *     · 非法档位 / 未知参数（防 `--tier=9` 那类静默落 else）；
 *     · 改动了可执行面、却没有任何自包含节消费它（`uncovered-change`）；
 *     · 选中的节数超过 `MAX_SELECTED_SECTIONS`（影响面过宽 —— 例如改 `core/store.js` 会牵动
 *       数百个节的证据面；此时「定向」既不省时也不可信，如实劝退去 L3）；
 *     · 隔离器缺席 / 没产出隔离读数 / 子进程非零 / 读数非 `passed`。
 *
 * ── 边界（如实登记，不许拿读数当承诺）────────────────────────────────
 *   · `budgetMs` 是**上限**，不是「实测耗时」；超了就是超预算中断（`budget-exceeded`），
 *     不是「跑完了」—— 未跑完的整趟不产生任何结论。
 *   · L2 是**有界增量证据**，永远不能替代收口时的全量：它的判据是「被选中的节全绿」，
 *     不是「整仓全绿」。`--only-v-section` 是**显式声明**的定向子集，同样不证明改动面已全覆盖。
 *   · 静态依赖匹配读的是证据文件的**文本消费**，证明不了动态消费（运行时拼出的模块名、
 *     经 `WA.*` 转手的分派）。这类漏网由 L3 承担，不由本工具假装覆盖。
 *   · `--runner=` 是给门禁做**行为级负控制**用的委托缝（默认值即真隔离器，由
 *     `tests/smart-runner-v2408.js` 逐字钉住）；它不改变判据 —— 通过仍要子进程自己
 *     打印 `WA-ISOLATED-RESULT` 且 `status === 'passed'`。
 *
 * 用法：
 *   node tools/smart-runner.js                    # 默认 L1
 *   node tools/smart-runner.js --tier=0|1|2|3
 *   node tools/smart-runner.js --tier=2 --plan    # 只报「会跑哪些节」，不执行（零 spawn）
 *   node tools/smart-runner.js --tier=2 --only-v-section '<节名子串>'   # 显式定向
 *   node tools/smart-runner.js --tier=3 --allow-full                    # 解除计划门控（收口用）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
/** 真正执行回归的委托入口（隔离器 CLI）。默认值由门禁逐字钉住，防「静默换成 smoke」。*/
const RUNNER_REL = 'tools/isolated-run.js';
/**
 * 四级金字塔：档位 / 声称要跑的活 / 时间上限。`budgetMs: null` = 不用本工具预算（由隔离器自己的硬超时管）。
 * ⚠ 预算口径（v2.408.0，现场实测，不是照抄计划）：
 *   计划 OPV23-9 写的是「10s / 45s / 3min / 全量」。L2 的 240s（≈3min）**本版达不到**，
 *   实测数据在册、不许糊过去：隔离器即便对候选树做了 wrap 裁剪（选中 1 节、包裹 409 节），
 *   单节定向仍实测 **405s**（任务 /tmp/worldaxis-regression-2aQ5RA）。
 *   根因已定位到工具自己：`tools/prune-sections.js` 有 14 节因**净括号不平衡**降级为
 *   「只标不包」（`wrapUnsafe: 14` / `markedLines: 3785`）—— 那 3785 行**照跑**，
 *   其中包含「75 个孤儿资产」批次（一条节里 75 次 spawn）。故 L2 的成本地板由这 14 节决定，
 *   **与选区大小几乎无关**。把 240s 写在这里 = 一跑就 SIGKILL，读数永远只有 budget-exceeded。
 *   本版取值 **600000ms**（实测 405s 的 1.48 倍），并把它明确登记为**上限**而非耗时承诺。
 */
const TIERS = {
'0': { name: 'L0 门禁层', budgetMs: 90000, what: '静态契约门禁（逐条 spawn，退出码即结论）',
gates: ['tests/dup-decl-gate.js', 'tests/field-liveness-gate.js', 'tools/version-consistency.js'] },
'1': { name: 'L1 快档层', budgetMs: 300000, what: 'tools/smoke.js 快档集（单一真源在它自己内部）' },
'2': { name: 'L2 增量层', budgetMs: 600000, what: 'git 改动面 → 归属表自包含节 → 隔离器定向真跑' },
'3': { name: 'L3 全量层', budgetMs: null, what: '隔离器整趟 tests/run.js（计划门控，默认拒绝）' }
};
/** 增量层选中的节数上限。超此值即判「影响面过宽」，不做定向（见文件头）。*/
const MAX_SELECTED_SECTIONS = 10;
/**
 * 宿主 / 聚合器：它们**提及**某产品文件，不构成「某节验过它」的证据。
 *   判据为什么要排除它们（v2.408.0 现场实测，非推测）：
 *     · `tests/run.js` 被 17 个节的 `evidence` 认领（因为每个 spawn 节的行文里都出现 `run.js`）；
 *       而它自己第 409 起有一份 `const LOAD = [...]` 清单，**每个产品文件都在里面出现一次**
 *       （`engines/artifice-degradation.js` 在 L1088、`engines/world-singularity.js` 在 L1091）。
 *       把装载当消费 ⇒ 9 个 V23 引擎的**唯一**命中全部来自这一份清单，
 *       而真正逐条验它们的 `scenario-v62-v23-epic-grand-causality.js` 反而算不出来。
 *       这正是本仓点名过的形态：读数说「已覆盖」，机器上其实只证明了「文件被 require 进 LOAD」。
 *     · `inventory.js` / `product-files.js` / `mock.js` / `ui-gate-sync.js` / `export-contract.js` /
 *       `dead-export-gate.js` 同类：它们是**面自身的宿主**（清点、文件面、桩、门禁），
 *       源码里必然出现大量文件名，但那是「被清点」不是「被验证」。
 *   例外只认**这张精确表**，不做模式匹配 —— 放宽成 `tests/*.js` 等于取消判据。
 */
const ORCHESTRATORS = ['run.js', 'inventory.js', 'product-files.js', 'mock.js', 'ui-gate-sync.js',
  'export-contract.js', 'dead-export-gate.js'];
/**
 * 调度器自举面：分层入口 / 隔离入口 / 编排器自身的改动。
 *   归属表**不消费自己** —— 它消费的是「产品面被哪个节验」。若把这几条判成 `uncovered`，
 *   则 OPV23-9 永远无法在 L2 上验证自己：本工作树里 `tests/run.js` 与 `tests/isolated-runner.js`
 *   必然在改动面上，而 L3 又被计划门控拒绝 ⇒ 增量层对本任务**恒不可用**。
 *   故显式登记（精确文件，不做通配），并在读数里如实打印 `selfFace`，
 *   说明「这几条的验证面是 L0 门禁与调度器专锁，不是归属表」——登记，不是静默放行。
 */
const SELF_FACE = ['tools/smart-runner.js', 'tools/isolated-run.js', 'tests/isolated-runner.js', 'tests/run.js',
  'tests/smart-runner-v2408.js'];
/**
 * L1 快档覆盖面：**从 `tools/smoke.js` 自己派生**，不在这里硬编码第二份清单。
 *   理由（本批现场实测）：`tests/segment-extract-v2400.js` 的 ownership 节是 `runLock` 共享节
 *   （`selfContained=false` ⇒ 选区永远征不动它），它的**真验证面是 L1 快档**（smoke 的 `rel:` 清单里有它）。
 *   若把它判成 `uncovered`，L2 就永远拒收「改了段提取基线」这类改动 —— 而那是最常见的改动之一。
 *   派生的口径是「读 smoke 的清单」，不是「宽免某类文件」：smoke 里没有的，仍然进 uncovered。
 */
function fastFace(root) {
  try {
    const t = fs.readFileSync(path.join(root, 'tools/smoke.js'), 'utf8');
    const out = [];
    const re = /rel:\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(t)) !== null) out.push(m[1]);
    return out;
  } catch (e) { return []; }
}
function parseArgs(argv) {
  const o = { tier: '1', tierSource: 'default', plan: false, allowFull: false, only: [], runner: RUNNER_REL, unknown: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.indexOf('--tier=') === 0) { o.tier = a.slice(7); o.tierSource = 'argv'; continue; }
    if (a === '--tier' && argv[i + 1]) { o.tier = argv[++i]; o.tierSource = 'argv'; continue; }
    if (a === '--plan') { o.plan = true; continue; }
    if (a === '--allow-full') { o.allowFull = true; continue; }
    if (a.indexOf('--only-v-section=') === 0) { o.only.push(a.slice('--only-v-section='.length)); continue; }
    if (a === '--only-v-section' && argv[i + 1]) { o.only.push(argv[++i]); continue; }
    if (a.indexOf('--runner=') === 0) { o.runner = a.slice('--runner='.length); continue; }
    o.unknown.push(a);
  }
  return o;
}
/** 真实改动面：`git status --porcelain -uall`。含未跟踪文件 —— 「未跟踪」不等于「不在改动面」。*/
function collectChanged() {
  const r = cp.spawnSync('git', ['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '--untracked-files=all'],
    { cwd: ROOT, encoding: 'utf8' });
  if (r.error || r.status !== 0) return { ok: false, why: 'git-status-failed:' + (r.error ? r.error.code : r.status), files: [] };
  const files = [];
  String(r.stdout || '').split('\n').filter(Boolean).forEach(function (line) {
    const code = line.slice(0, 2);
    let p = line.slice(3);
    const arrow = p.indexOf(' -> ');            // 重命名：只取新路径（旧路径已不存在）
    if (arrow >= 0) p = p.slice(arrow + 4);
    files.push({ path: p.replace(/^"|"$/g, ''), code: code });
  });
  return { ok: true, files: files };
}
/** 改动面分档。`product` / `test` 是**可执行面**（必须被归属表消费），其余只作读数报告。*/
function classify(changed, skipDirs) {
  const product = [], test = [], others = [];
  changed.forEach(function (f) {
    const top = f.path.split('/')[0];
    if (f.path.slice(-3) !== '.js') { others.push(f.path); return; }
    if (top === 'tests') { test.push(f.path); return; }
    if (skipDirs.indexOf(top) >= 0) { others.push(f.path); return; }
    product.push(f.path);
  });
  return { product: product, test: test, others: others };
}
/**
 * 选面：把「改动面」映射成「归属表里的自包含节」（三条判据都可复算）。
 *   ① **消费证据**：某自包含节的证据文件（**排除宿主/聚合器**，见 ORCHESTRATORS）文本里
 *      出现该改动文件的相对路径，或其**真消费名**：
 *        · 命名空间形态 `WA.commodityCirculation`（文件名 `commodity-circulation.js` → 驼峰）；
 *        · 无连字符时退化为整词匹配（**只在两者同形时**才允许 —— 否则 `store` 会命中 `storefront`）。
 *      为什么必须认驼峰：现场实测 `scenario-v62-v23-epic-grand-causality.js` 全篇用
 *      `WA.commodityCirculation` / `WA.somaticTrauma` / … 逐条真调引擎 API（真消费），
 *      但整篇**一次也没出现文件名 `commodity-circulation`**；旧判据（只认文件名）因此
 *      对 9 个 V23 引擎返回「无节消费」，同时把 `run.js` 的 LOAD 清单当成命中。
 *      输入面窄于事实、反面又宽于事实，是同一个判据的两半。
 *   ② **本节证据被改**：改动落在 `tests/x.js` 且 x 正是某节的证据文件。
 *   ③ **调度器自举面**（SELF_FACE）：显式登记，读数里如实列出（见其定义处的理由）。
 *   落不进 ①②③ 的可执行改动进 `uncovered`（拒收依据：不猜、不降级、不静默当全量）。
 */
function mapSections(ctx) {
  const sel = ctx.sections.filter(function (s) { return s.selfContained; });
  const cache = new Map();
  function textOf(rel) {
    if (!cache.has(rel)) { try { cache.set(rel, fs.readFileSync(path.join(ROOT, 'tests', rel), 'utf8')); } catch (e) { cache.set(rel, null); } }
    return cache.get(rel);
  }
  const byEvidence = new Map();
  sel.forEach(function (s) {
    s.evidence.forEach(function (e) {
      if (!byEvidence.has(e)) byEvidence.set(e, []);
      byEvidence.get(e).push(s.name);
    });
  });
  const matched = new Map();       // 节名 → 命中理由（逐条可读）
  const uncovered = [];
  const selfFace = [];
  const fast = fastFace(ROOT);
  function add(name, why) {
    if (!matched.has(name)) matched.set(name, []);
    if (matched.get(name).indexOf(why) < 0) matched.get(name).push(why);
  }
  ctx.product.forEach(function (f) {
    if (SELF_FACE.indexOf(f) >= 0) { selfFace.push(f); return; }
    const stem = path.basename(f, '.js');
    const camel = stem.replace(/-([a-z0-9])/g, function (m, c) { return c.toUpperCase(); });
    const esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    // 命名空间形态：`WA.commodityCirculation` / `WA.store`。
    //   ⚠ 前界**必须容许 `.`**：真消费点写的是 `WA.commodityCirculation.transferCargo(...)`，
    //     属性名前面就是点。第一版写成 `[^\w.$]`（把点也排除）⇒ 判据对**全部** `WA.<ns>` 调用
    //     一律失明（现场实测：9 个 V23 引擎仍然 0 命中）。点排除的理由本是「防 `a.store` 之类」，
    //     但真消费点恰恰是 `a.store` 形态 —— 那条理由与事实相反，删掉。
    //     防误判改由**后缀**承担：后面不许接 word 字符（`storefrontWindow` 不命中 `store`）。
    const reNs = new RegExp('(^|[^\\w$])' + esc(camel) + '([^\\w$]|$)');
    // 整词形态：**仅当 stem === camel**（无连字符）时才与命名空间判据等价；否则 `store`-类
    //   常见词会把半仓历史锁卷进来（现场实测：只用整词 ⇒ 单文件命中 53 节，误判 wide-impact）。
    const reWord = (stem === camel) ? reNs : null;
    let hits = 0;
    sel.forEach(function (s) {
      let tap = null;
      for (let i = 0; i < s.evidence.length; i++) {
        const e = s.evidence[i];
        if (ORCHESTRATORS.indexOf(e) >= 0) continue;      // 宿主/聚合器：提及不算消费
        const t = textOf(e);
        if (t === null) continue;
        if (t.indexOf(f) >= 0) { tap = e + ' 直引 ' + f; break; }
        if (reNs.test(t)) { tap = e + ' 命名空间 ' + camel; break; }
        if (reWord && reWord.test(t)) { tap = e + ' 词 ' + stem; break; }
      }
      if (tap) { add(s.name, tap); hits++; }
    });
    if (!hits) uncovered.push(f);
  });
  ctx.test.forEach(function (rel) {
    if (SELF_FACE.indexOf(rel) >= 0) { selfFace.push(rel); return; }
    // ⚠ 归属表的 `evidence` 是**裸文件名**（`scenario-v62-....js`），而改动面来的是 `tests/...`。
    //   第一版直接 `byEvidence.get(rel)` ⇒ 键永不相等 ⇒ 判据②「本节证据被改」**从未命中过**
    //   （改一把锁的证据文件，读数仍然说它不被任何节覆盖）。本批现场实测逮到：
    //   `tests/scenario-v62-v23-epic-grand-causality.js` 明明是新拆出的 V23 节的唯一证据，
    //   却仍在 uncovered 里。故按 basename 归一（与 `byEvidence` 的构造面同源）。
    const arr = byEvidence.get(path.basename(rel));
    if (!arr || !arr.length) {
      // 归属表征不动它、但它**真在 L1 快档里跑**（清单从 smoke 派生）⇒ 验证面是 L1，如实登记。
      if (fast.indexOf(rel) >= 0) { selfFace.push(rel + '（L1 快档成员，归属节为共享上下文）'); return; }
      uncovered.push(rel); return;   // 归属表外的测试文件，且连快档也不跑它：不假装认识它
    }
    arr.forEach(function (n) { add(n, rel + ' 是本节的证据文件'); });
  });
  return { matched: matched, uncovered: uncovered, selfFace: selfFace, selectable: sel.length };
}
/** 委托隔离器真跑。`ok` 要求**子进程读到自身的通过读数** —— 不看退出码就当通过。*/
function delegate(selects, budgetMs, runnerRel) {
  const runnerAbs = path.resolve(ROOT, runnerRel);
  if (!fs.existsSync(runnerAbs)) return { ok: false, kind: 'runner-absent', runner: runnerRel, rc: null, ms: 0, tail: '' };
  const argv = [runnerAbs].concat(selects.reduce(function (a, s) { return a.concat(['--only-v-section', s]); }, []));
  // `WA_ONLY_SECTION` 必须剥掉：它会被隔离器转发给 worker（见 tests/isolated-runner.js 的转发段），
  // 于是 L3「不给选区 = 整趟」在**继承了环境变量**的调用方下会静默变成一次定向 —— 那正是本仓
  // 点名过的「人以为自己跑了全量，实际跑的是子集：两者在输出里长得一样」。
  const env = Object.assign({}, process.env);
  delete env.WA_ONLY_SECTION;
  const t0 = Date.now();
  const r = cp.spawnSync(process.execPath, argv, {
    cwd: ROOT, encoding: 'utf8', env: env, maxBuffer: 64 * 1024 * 1024,
    timeout: budgetMs || undefined, killSignal: 'SIGKILL'
  });
  const ms = Date.now() - t0;
  const out = String((r.stdout || '') + (r.stderr || ''));
  const m = out.match(/WA-ISOLATED-RESULT (\{.*\})/);
  let iso = null;
  if (m) { try { iso = JSON.parse(m[1]); } catch (e) { iso = null; } }
  const timedOut = r.signal === 'SIGKILL' || !!(r.error && /ETIMEDOUT/.test(String(r.error.code)));
  const rc = r.status === null ? null : r.status;
  return {
    ok: rc === 0 && !!iso && iso.status === 'passed',
    kind: iso ? (iso.status === 'passed' ? 'passed' : 'isolated-' + iso.status) : 'no-isolated-reading',
    runner: runnerRel, rc: rc, signal: r.signal || null, timedOut: timedOut, ms: ms,
    isolated: iso, tail: out.split('\n').filter(Boolean).slice(-6).join(' | ').slice(0, 600)
  };
}
/** L2 的完整判定（`--plan` 与真跑共用同一份输入与拒收条件 —— 计划与执行不许各判一次）。*/
function planTier2(ctx) {
  const changed = collectChanged();
  if (!changed.ok) return { unreadable: { kind: 'git-unavailable', why: changed.why } };
  const split = classify(changed.files, ctx.skipDirs);
  const out = { changed: split, matched: [], uncovered: [], refusal: null, kind: 'incremental' };
  // 显式定向：不证明改动面覆盖，只跑点名的节（读数里如实标注 kind='targeted'）。
  if (ctx.only.length) {
    const miss = ctx.only.filter(function (n) { return !ctx.sections.some(function (s) { return s.selfContained && s.name.indexOf(n) >= 0; }); });
    if (miss.length) return { refusal: { kind: 'selection-empty', why: '选区未命中任何可独立运行的节', names: miss } };
    out.matched = ctx.sections.filter(function (s) { return s.selfContained && ctx.only.some(function (n) { return s.name.indexOf(n) >= 0; }); })
      .map(function (s) { return { name: s.name, why: ['--only-v-section 显式点名'] }; });
    out.kind = 'targeted';
    return out;
  }
  if (!split.product.length && !split.test.length) { out.kind = 'no-executable-change'; return out; }
  const mapped = mapSections(Object.assign({ sections: ctx.sections }, split));
  out.matched = Array.from(mapped.matched.entries()).map(function (e) { return { name: e[0], why: e[1] }; });
  out.uncovered = mapped.uncovered;
  out.selfFace = mapped.selfFace;
  if (out.uncovered.length) return { refusal: { kind: 'uncovered-change', why: '改动了可执行面，但没有自包含节消费它', files: out.uncovered }, partial: out };
  if (out.matched.length > MAX_SELECTED_SECTIONS) {
    return { refusal: { kind: 'wide-impact', why: '选中节数 ' + out.matched.length + ' 超过上限 ' + MAX_SELECTED_SECTIONS + '（影响面过宽，定向既慢也不可信）' }, partial: out };
  }
  return out;
}
/** 统一收尾：人读行 + 一行机器读数 + 退出码。**拒收不是失败**，但两者都不许以 0 收尾。*/
function finish(ev, lines) {
  lines.forEach(function (l) { console.log(l); });
  console.log('WA-SMART-RUNNER-RESULT ' + JSON.stringify(ev));
  process.exit(ev.exit);
}
function main() {
  const o = parseArgs(process.argv.slice(2));
  const lines = ['[SmartRunner] ' + (TIERS[o.tier] ? TIERS[o.tier].name : '未知档位') + ' · tier=' + o.tier + '（来源 ' + o.tierSource + '）'
    + (o.plan ? ' · --plan（只报计划，不执行）' : '')];
  const refusal = function (kind, why, extra) {
    finish(Object.assign({ tier: o.tier, exit: 3, verdict: 'refused', refusal: kind, why: why, planOnly: o.plan }, extra || {}),
      lines.concat('[SmartRunner] ✗ 拒收（' + kind + '）：' + why));
  };
  if (!TIERS[o.tier]) return refusal('invalid-tier', '未知档位 ' + JSON.stringify(o.tier) + '，合法值 ' + Object.keys(TIERS).join('/'));
  if (o.unknown.length) return refusal('unknown-args', '未知参数 ' + JSON.stringify(o.unknown) + '（不静默忽略：拼错的开关若被当成默认路径，读数就与意图不符）');
  const budgetMs = TIERS[o.tier].budgetMs;
  // ── L0 / L1：既有入口，逐条 spawn、退出码即结论 ──
  if (o.tier === '0' || o.tier === '1') {
    const specs = o.tier === '0' ? TIERS['0'].gates : ['tools/smoke.js'];
    const rows = [];
    for (const rel of specs) {
      const t0 = Date.now();
      const r = o.plan ? null : cp.spawnSync(process.execPath, [path.join(ROOT, rel)], { cwd: ROOT, encoding: 'utf8', timeout: budgetMs, killSignal: 'SIGKILL' });
      const ms = o.plan ? 0 : Date.now() - t0;
      rows.push({ rel: rel, rc: o.plan ? null : r.status, ms: ms });
      lines.push('  ' + (o.plan ? '·' : (r.status === 0 ? '✓' : '✗')) + ' ' + rel + (o.plan ? '（计划：将执行）' : '  rc=' + r.status + ' · ' + (ms / 1000).toFixed(2) + 's'));
      if (!o.plan && r.status !== 0) return finish({ tier: o.tier, exit: 1, verdict: 'failed', what: TIERS[o.tier].what, budgetMs: budgetMs, rows: rows },
        lines.concat('[SmartRunner] ✗ ' + rel + ' 非零退出 —— 本层结论为「不通过」'));
    }
    return finish({ tier: o.tier, exit: 0, verdict: o.plan ? 'plan' : 'passed', what: TIERS[o.tier].what, budgetMs: budgetMs, rows: rows },
      lines.concat('[SmartRunner] ' + (o.plan ? '· 以上为计划（未执行）' : '✓ ' + TIERS[o.tier].name + ' 通过（本层判据见 what；它不证明其它层）')));
  }
  // ── L2 / L3：归属表 + 隔离器 ──
  let layers, productFiles;
  try { layers = require(path.join(ROOT, 'tools/test-layers.js')).analyze(); }
  catch (e) { return refusal('layers-unavailable', '归属表不可读：' + e.message); }
  try { productFiles = require(path.join(ROOT, 'tests/product-files.js')); }
  catch (e) { return refusal('product-files-unavailable', '文件面单一真源不可读：' + e.message); }
  const ctx = { sections: layers.sections, skipDirs: productFiles.SKIP_DIRS, only: o.only };
  const plan = planTier2(ctx);
  lines.push('  归属表 ' + layers.sectionCount + ' 节 · 可独跑 ' + layers.selectable.length + ' 节 · 单趟上限 ' + MAX_SELECTED_SECTIONS + ' 节');
  const showPlan = function (p) {
    if (p.changed) {
      lines.push('  改动面：产品 ' + p.changed.product.length + ' · 测试 ' + p.changed.test.length + ' · 其它 ' + p.changed.others.length);
      ['product', 'test', 'others'].forEach(function (k) {
        p.changed[k].slice(0, 20).forEach(function (f) { lines.push('    · ' + k + '：' + f); });
      });
    }
    (p.matched || []).forEach(function (m) { lines.push('    → 选中节：' + m.name + '（' + m.why.slice(0, 2).join('；') + '）'); });
    (p.selfFace || []).forEach(function (f) { lines.push('    ◦ 自举面/快档面（验证面是 L0 门禁、L1 快档或调度器专锁，不由归属表消费）：' + f); });
    (p.uncovered || []).forEach(function (f) { lines.push('    ✗ 未被任何自包含节覆盖：' + f); });
  };
  if (plan.unreadable) return refusal(plan.unreadable.kind, plan.unreadable.why);
  // 「整趟」的定义就是**无选区**：此时选面（覆盖面 / 影响面）不是判据 —— 选区为空是它的定义，
  //   不是缺陷。第一版把 L3 也过了一遍选面拒收 ⇒ `--tier=3` 报的是 `uncovered-change`
  //   （读数说「改动没被覆盖」，而它本来就要跑全部），门控那条 `full-regression-gated` 反而
  //   永远不可达 —— 拒收码在册、现场不可达，是同一族病（读数与事实不符）。
  const fullRun = (o.tier === '3' && !o.only.length);
  if (!fullRun && plan.refusal) {
    if (plan.partial) showPlan(plan.partial);
    return refusal(plan.refusal.kind, plan.refusal.why, {
      files: plan.refusal.files || null, names: plan.refusal.names || null,
      selected: ((plan.partial && plan.partial.matched) || []).map(function (m) { return m.name; })
    });
  }
  if (o.tier === '2' && plan.kind === 'no-executable-change') {
    showPlan(plan);
    return finish({ tier: '2', exit: 0, verdict: 'no-executable-change', what: TIERS['2'].what, changed: plan.changed, sectionsRun: 0 },
      lines.concat('[SmartRunner] 改动不含可执行面（产品/测试 .js）⇒ 本层零节执行；**这不是「已验证」**，收口仍以 L3 为准'));
  }
  // 计划门控：它管的是**执行**，不管「报计划」—— `--plan` 零 spawn、不消耗那 85 分钟。
  //   故 `--tier=3 --plan` 可用（拿得到 full 计划），真跑才要 `--allow-full`。
  if (fullRun && !o.allowFull && !o.plan) {
    return refusal('full-regression-gated', 'plans/V23_MASTER_PLAN.md 规定双计划 18 项全部交付前禁止整趟全量；'
      + '机制收口后以 --allow-full 显式解除', { what: TIERS['3'].what });
  }
  const selects = o.only.length ? o.only.slice() : (fullRun ? [] : plan.matched.map(function (m) { return m.name; }));
  showPlan(plan);
  if (o.plan) {
    lines.push('  将委托：' + o.runner + (selects.length ? ' --only-v-section ' + selects.join(' --only-v-section ') : '（无选区 = 整趟）'));
    return finish({ tier: o.tier, exit: 0, verdict: 'plan', what: TIERS[o.tier].what, planOnly: true,
      kind: o.only.length ? 'targeted' : (o.tier === '3' ? 'full' : plan.kind), sections: selects, budgetMs: budgetMs, runner: o.runner }, lines);
  }
  const iso = delegate(selects, budgetMs, o.runner);
  lines.push('  隔离器读数：' + JSON.stringify({ kind: iso.kind, rc: iso.rc, signal: iso.signal, timedOut: iso.timedOut, ms: iso.ms, isolated: iso.isolated }));
  if (iso.tail) lines.push('  末行：' + iso.tail);
  const meta = { tier: o.tier, what: TIERS[o.tier].what, kind: o.only.length ? 'targeted' : (o.tier === '3' ? 'full' : plan.kind),
    sections: selects, budgetMs: budgetMs, runner: o.runner,
    isolated: iso.isolated ? { status: iso.isolated.status, summary: iso.isolated.summary, task: iso.isolated.task } : null,
    ms: iso.ms, timedOut: iso.timedOut };
  if (iso.timedOut) return finish(Object.assign(meta, { exit: 3, verdict: 'refused', refusal: 'budget-exceeded', why: '超过本层上限 ' + budgetMs + 'ms 被 SIGKILL —— 未跑完的整趟不产生任何结论' }),
    lines.concat('[SmartRunner] ✗ 超预算中断（' + (budgetMs / 1000) + 's）：增量层跑不动这类改动，请走 L3'));
  if (!iso.ok) return finish(Object.assign(meta, { exit: 1, verdict: 'failed', refusal: iso.kind }), lines.concat('[SmartRunner] ✗ ' + iso.kind + '：本层结论为「不通过」'));
  return finish(Object.assign(meta, { exit: 0, verdict: 'passed', sectionsRun: selects.length }),
    lines.concat('[SmartRunner] ✓ ' + TIERS[o.tier].name + ' 通过：' + (selects.length ? '实跑 ' + selects.length + ' 节' : '整趟（无选区）')));
}
if (require.main === module) main();
module.exports = { TIERS: TIERS, MAX_SELECTED_SECTIONS: MAX_SELECTED_SECTIONS, RUNNER_REL: RUNNER_REL,
  parseArgs: parseArgs, collectChanged: collectChanged, classify: classify, mapSections: mapSections, delegate: delegate };
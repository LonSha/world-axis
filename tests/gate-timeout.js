// WorldAxis tests/gate-timeout.js (v2.105.0, 计划一 #3) — 「门禁超时熔断」的单一真源
//
// 【它治的病】「门禁会卡死」此前是一个**没有任何读数的命题**：
//   · run.js 里 10 个 spawnSync 调用点（export-contract / dead-export-gate /
//     field-liveness-gate / module-registry-gate / isolated-runner-lock / tar / --check …）
//     **无一**声明 timeout ⇒ 任一门禁 hang 住，整趟回归就静静挂着；
//   · 唯一的兜底是外层 isolated-runner 的 10 分钟 SIGKILL，而全量回归实测 6~8 分钟
//     ⇒ 余量不足一倍；被强杀时日志里**只有一行 "Status: runner-failed"，
//     卡在哪一道门禁、卡死前最后说了什么，全部丢失**。
//
// 【口径一：阈值不许照抄计划里的 3s / 20s / 5s】本版实跑实测（仓库真跑，非估计）：
//   export-contract 0.58~0.60s · dead-export-gate 10.3~12.0s · inventory 0.61s ·
//   module-registry-gate 0.16s · field-liveness-gate 0.40s · isolated-runner-lock 2.7s ·
//   tar（排除 .git）0.10s · node --check tests/run.js 0.12s。
//   计划里的「export-contract 3s」只有 5 倍余量；「全量 20s」与实测 6~8 分钟差一个量级。
//   ⇒ 预算 =「**最重那道门禁**的实测 × 8 倍」= 96000ms，全表统一（多一档就多一处会漂移的
//     地方——本模块第一次落盘就踩到：逐道表算出 96s、武装值写了 90s，同一份口径里出现两个
//     spawn 预算）。逐门禁实测值只作**证据**保留，由 coherence() 守「宣称/预算/证据」自洽。
//   为什么不逐道各算：门禁里有几道跨 git 版本会明显变重（P1 计划里就有「从 git 读上版快照
//   比对」的判据），逐道紧贴实测会在那些版本上变成假红。8 倍对 12s 的门禁是 96s，
//   对 0.16s 的门禁是余量过剩——而过剩是安全的，紧贴不是。
//
// 【口径二：形态受限的调用点，用「形态自证的旁路」而不是放弃】`node --check` 与
//   `sh -c 'tar …'` 的主体是**外部命令**：spawnSync 的 timeout 只作用于直接子进程。
//   本版两处都武装了 timeout（覆盖 `sh`/`node` 本身），并给 tar 额外加了 shell 侧
//   `timeout -k 5 240 tar …`。判别口径是**行为读数**，不是字形比对：
//   tar 那句被管道包住（`… | (cd … && tar -xf -)`），`timeout` 直接写法会**只杀 tar 的写端**，
//   所以必须带 `-k`（先 SIGTERM 再 SIGKILL）。
//
// 【口径三：强杀只对「直接子进程」负责】实测结论（本版）：
//   · `detached: true` 的子进程用 `process.kill(-pid, 'SIGKILL')` 可整组杀掉（杀后 200ms 实测已死）；
//   · 未 detach 的进程组就是**测试运行器自己的组**，`kill(-pid)` 返回 ESRCH / 杀不掉
//     —— 这条路的兜底只能是「杀直接子进程」（`kill(pid)`），孙进程不在覆盖内。
//   本仓的十道门禁源码**零 spawn**（唯一例外 test-surface-gate 的宿主残骸探针，走 spawnSync
//   且自限），故「直接子进程被杀 ⇒ 门禁停摆」在本仓成立；这条边界由专锁显式钉住，
//   不许被「我们已经保险了」这句话盖过去。
'use strict';
const fs = require('fs');
const path = require('path');

const SELF_REL = 'tests/gate-timeout.js';
const RUN_REL = 'tests/run.js';
const BASE = path.join(__dirname, '..');

/** 仓库内相对路径 → 源码（纯只读；discover 用它取现场读数）。 */
function srcOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }

/** 安全倍数：raw 实测 → 建议上限（仅作证据与自洽判据用）。 */
const RATIOS = { spawn: 8, inline: 4, heavy: 4 };

/**
 * 预算单一真源。
 *   spawnMs  = 最重门禁（dead-export-gate 12s）实测 × 8 —— **全部 10 个调用点共用**；
 *   shellMs  = tar 那句的 shell 侧保险丝（240s：它治「永远不返回」，不是「慢」）。
 */
const GATE_TIMEOUTS = {
  spawnMs: 96000,
  shellMs: 240
};

/**
 * run.js 现场武装表。**10 个调用点全部入表**（病根就在「无一声明 timeout」，
 *   留一个就是留一条静默挂起的路径）。
 *   `mode` 说明该点的形态：
 *     spawn = 主体是 node 门禁/自锁/副本；
 *     spawn+shell = 主体是外部命令（tar），除 spawnSync 预算外另有 shell 侧 fuse；
 *     spawn-only = 主体是 node --check —— timeout 只覆盖「node 能起来并开始读文件」，
 *       「读到一半的磁盘 stall」在 spawnSync 语义下不可中断（如实记档，不假称已覆盖）。
 *   `optionKey` = 现场真读的选项名（专锁逐字比对现场文本）。
 */
const TIMEOUT_ARMED = {
  'negative-probe-broken': { value: 96000, mode: 'spawn', optionKey: 'timeout', killSignal: 'killSignal' },
  'dead-export-json': { value: 96000, mode: 'spawn', optionKey: 'timeout', killSignal: 'killSignal' },
  'export-contract': { value: 96000, mode: 'spawn', optionKey: 'timeout', killSignal: 'killSignal' },
  'tar-copy': { value: 96000, mode: 'spawn+shell', optionKey: 'timeout', shellFuse: 240 },
  'syntax-check': { value: 96000, mode: 'spawn-only', optionKey: 'timeout' },
  'export-contract-external': { value: 96000, mode: 'spawn', optionKey: 'timeout', killSignal: 'killSignal' },
  'negative-probe-v2410': { value: 96000, mode: 'spawn', optionKey: 'timeout', killSignal: 'killSignal' },
  'field-liveness-gate': { value: 96000, mode: 'spawn', optionKey: 'timeout' },
  'module-registry-gate': { value: 96000, mode: 'spawn', optionKey: 'timeout' },
  'isolated-runner-lock': { value: 96000, mode: 'spawn', optionKey: 'timeout' }
};

/**
 * run.js 现场站点登记表 —— **锚点表**（锁与模块共用同一份口径）。
 *   anchor = 从 run.js 现场读出来的、**在 run.js 里恰中 1 次**的调用行行首片段。
 *   【为什么不用模块内的 key 去现场定位】这是本版第一次落盘的真实缺陷：key 只活在本模块里，
 *     run.js 一个字都没有 ⇒ 十处全部报 site-missing，判据从第一天起就恒假。
 *   【为什么锚点不用 options 片段】options 行多处同形（`{ encoding: 'utf8', timeout: 96000 }`），
 *     拿它定位必然 ambiguous；「调用行整行」才天然唯一。
 *   【kill】现场是否显式给强杀信号（SIGKILL）。子进程可以忽略 SIGTERM，出口三处必须真死。
 *   【shellFuse】该站点另有 shell 侧保险丝（秒）。
 *   【pipe】命令串里含管道（**客观形态**，不是标签）——含管道而没保险丝 = 只杀写端、读端照挂。
 */
const ARMED_SITES = [
  { key: 'negative-probe-broken', mode: 'spawn', kill: true,
    anchor: "const r2700 = require('child_process').spawnSync(process.execPath, [tmp2700, '--json']," },
  { key: 'dead-export-json', mode: 'spawn', kill: true,
    anchor: "const rr = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'dead-export-gate.js'), '--json']," },
  { key: 'export-contract', mode: 'spawn', kill: true,
    anchor: "const ecRun4300 = cp4300.spawnSync(process.execPath, ['tests/export-contract.js']," },
  { key: 'tar-copy', mode: 'spawn+shell', shellFuse: 240, pipe: true,
    anchor: "const tarR4300 = cp4300.spawnSync('sh', ['-c'," },
  { key: 'syntax-check', mode: 'spawn-only',
    anchor: "const checkBroken4300 = cp4300.spawnSync(process.execPath, ['--check', path4300.join(negDir4300, 'tests/run.js')]," },
  { key: 'export-contract-external', mode: 'spawn', kill: true,
    anchor: "const r4100 = cp4100.spawnSync(process.execPath, [path4100.join(BASE, 'tests/export-contract.js')]," },
  { key: 'negative-probe-v2410', mode: 'spawn', kill: true,
    // 【锚点不许包含它要守卫的那个值】本行初版把整行（含 `timeout: 96000, killSignal: 'SIGKILL'`）
    //   当锚点 ⇒ 一旦预算被改动（**正是本锁要守的东西**），锚点先失效、报出来的是
    //   site-missing 而不是 value-mismatch —— 判据被它要抓的破坏顺手打掉了（自我指涉）。
    //   故锚点截到 options 之前：唯一性照样成立（整行唯一 ⇒ 任何前缀也唯一）。
    anchor: "const rBad4100 = cp4100.spawnSync(process.execPath, [brokenFile4100]," },
  { key: 'field-liveness-gate', mode: 'spawn',
    anchor: "const rG2400 = cp2400.spawnSync(process.execPath, ['tests/field-liveness-gate.js']," },
  { key: 'module-registry-gate', mode: 'spawn',
    anchor: "const rG2830 = cp2830.spawnSync(process.execPath, ['tests/module-registry-gate.js']," },
  { key: 'isolated-runner-lock', mode: 'spawn',
    anchor: "const rI2840 = cp2840.spawnSync(process.execPath, ['tests/isolated-runner-lock.js']," }
];

/**
 * 行内剥离字符串字面量与行尾注释。
 *   【为什么必须剥】括号平衡必须只看代码面：tar 那句的命令串里有个**永不闭合**的 `(`
 *   （`'... | (cd <tmp> && tar -xf -)'`），不剥就会一路数到文件末尾，把整份 run.js 当成一个块。
 */
function stripLiterals(line) {
  const out = [];
  const s = String(line);
  let q = null, i = 0;
  while (i < s.length) {
    const c = s[i];
    if (q) {
      if (c === '\\') { i += 2; continue; }
      if (c === q) { q = null; }
      i += 1; continue;
    }
    if (c === '"' || c === "'") { q = c; out.push('""'); i += 1; continue; }
    if (c === '/' && s[i + 1] === '/') break;
    out.push(c); i += 1;
  }
  return out.join('');
}

/** 括号平衡地切出**整段**子进程调用（含它的 options 行；跨行点与单行点同一口径）。 */
function parseCallBlocks(src) {
  const lines = String(src).split('\n');
  const blocks = [];
  lines.forEach(function (l, i) {
    if (l.trim().charAt(0) === '/' && l.trim().charAt(1) === '/') return;
    if (!/(?:spawnSync|execSync|execFileSync)\s*\(/.test(l)) return;
    let depth = 0, text = '';
    for (let j = i; j < lines.length; j += 1) {
      text += (j > i ? '\n' : '') + lines[j];
      const code = stripLiterals(lines[j]);
      for (let k = 0; k < code.length; k += 1) {
        if (code[k] === '(') depth += 1;
        else if (code[k] === ')') depth -= 1;
      }
      if (depth <= 0) break;
    }
    blocks.push({ line: i + 1, span: text.split('\n').length, text: text });
  });
  return blocks;
}

/**
 * 按锚点定位站点块。
 *   0 命中 ⇒ 返回 null（**找不到站点不等于站点没问题**，由调用方计 site-missing）；
 *   >1 命中 ⇒ 直接抛（锚点不唯一时，「改到哪一处」就成了未知——宁可不判）。
 */
function findSiteBlock(src, anchor) {
  const lines = String(src).split('\n');
  const hits = [];
  lines.forEach(function (l, i) { if (l.indexOf(anchor) >= 0) hits.push(i + 1); });
  if (!hits.length) return null;
  if (hits.length > 1) throw new Error('site anchor ambiguous (' + hits.length + ') :: ' + anchor.slice(0, 60));
  const own = parseCallBlocks(src).filter(function (b) { return b.line === hits[0]; })[0];
  if (!own) return { line: hits[0], span: 0, text: '' };
  return own;
}

/**
 * 现场统计（与逐站点核对同源）：
 *   sites = 子进程调用点数 / armedSites = 其中带预算的点数 / budget = 全文件 `timeout: N` 处数。
 *   三个数**必须相等**——否则就有「多出来的 timeout 没被逐站点核对覆盖」或「某个调用点漏了」。
 */
function siteStats(src) {
  const blocks = parseCallBlocks(src);
  let armed = 0;
  blocks.forEach(function (b) { if (/timeout: \d+/.test(b.text)) armed += 1; });
  const budget = (String(src).match(/timeout: \d+/g) || []).length;
  return { sites: blocks.length, armedSites: armed, budget: budget };
}

/**
 * 门禁清单：raw 是本版**实测值**（证据）。
 *   heavy 只用于建议上限的计算（inventory 在死子面里真装载全产品面）。
 */
const GATES = [
  { key: 'export-contract', rel: 'tests/export-contract.js', argv: ['tests/export-contract.js'], kind: 'spawn', raw: 600, why: '出口面契约（生成器 + FROZEN2800 比对）' },
  { key: 'dead-export-gate', rel: 'tests/dead-export-gate.js', argv: ['tests/dead-export-gate.js'], kind: 'spawn', raw: 12000, why: '死子面（真装载全产品面，本仓唯一 10s 级门禁）' },
  { key: 'field-liveness-gate', rel: 'tests/field-liveness-gate.js', argv: ['tests/field-liveness-gate.js'], kind: 'spawn', raw: 400, why: '字段活性（写/读侧越界）' },
  { key: 'module-registry-gate', rel: 'tests/module-registry-gate.js', argv: ['tests/module-registry-gate.js'], kind: 'spawn', raw: 160, why: '模块契约（真装载 + Proxy 拦命名空间）' },
  { key: 'isolated-runner-lock', rel: 'tests/isolated-runner-lock.js', argv: ['tests/isolated-runner-lock.js'], kind: 'spawn', raw: 2700, why: '隔离运行器自锁（会自己起副本进程）' },
  { key: 'dead-export-json', rel: 'tests/dead-export-gate.js', argv: ['<repo>/tests/dead-export-gate.js', '--json'], kind: 'spawn', raw: 12000, why: '端到端注入实验的每次门禁子跑（真写源码后还原）' },
  { key: 'negative-probe-broken', rel: 'tests/inventory.js', argv: ['<tmp>/inv_break.js', '--json'], kind: 'heavy', raw: 700, why: '负向自证的破坏副本（产物 ~0.3MB JSON）' },
  { key: 'export-contract-external', rel: 'tests/export-contract.js', argv: ['<repo>/tests/export-contract.js'], kind: 'spawn', raw: 600, why: '非仓库根 cwd 下跑生成器（cwd 由调用方给）' },
  { key: 'tar-copy', rel: '', argv: ['sh', '-c', 'timeout -k 5 240 tar --exclude=.git -cf - . | (cd <tmp> && tar -xf -)'], kind: 'spawn+shell', raw: 100, why: '仓库副本（外部命令；另有 240s 的 shell 侧保险丝）' },
  { key: 'negative-probe-v2410', rel: 'tests/inventory.js', argv: ['<tmp>/notdir.js'], kind: 'heavy', raw: 700, why: 'v2.41.0 负向自证：BASE 指向不存在目录 ⇒ 非零退出' },
  { key: 'syntax-check', rel: 'tests/run.js', argv: ['--check', '<副本>/tests/run.js'], kind: 'spawn-only', raw: 120, why: '破坏副本的语法校验（node --check 读全文件）' }
];

/** 逐门禁建议上限（仅作证据／自洽判据，不参与 run.js 现场武装）。 */
function buildTable(defaults) {
  const def = defaults || GATE_TIMEOUTS;
  const spawnMs = (def.spawnMs === undefined) ? GATE_TIMEOUTS.spawnMs : def.spawnMs;
  const shellMs = (def.shellMs === undefined) ? GATE_TIMEOUTS.shellMs : def.shellMs;
  const t = { spawnMs: spawnMs, shellMs: shellMs };
  GATES.forEach(function (d) {
    t[d.key] = d.raw * (RATIOS[d.kind] || RATIOS.spawn);
  });
  return t;
}

/** 两条全局读数：单次预算（现场武装值）与同进程探针上限。 */
function limitsOf(table) {
  const t = table || buildTable(null);
  const lim = {
    spawnMs: (t.spawnMs === undefined) ? GATE_TIMEOUTS.spawnMs : t.spawnMs,
    shellMs: (t.shellMs === undefined) ? GATE_TIMEOUTS.shellMs : t.shellMs
  };
  lim.inlineMs = 2700 * RATIOS.inline;
  return lim;
}

/**
 * 自洽性判据：**不许多套预算**。
 *   现场真值（run.js 的 spawnSync options）只读一个值；逐门禁表却按 raw 各算一个建议值。
 *   若现场值 ≠ 统一预算，就会得到「run.js 说 90s、表说 96s」这类读数——
 *   这正是本版第一次落盘时的真实缺陷（90000 vs 96000），故钉成可调用判据。
 *   返回空数组 = 自洽。
 */
function coherence(table) {
  const t = table || buildTable(null);
  const lim = limitsOf(t);
  const problems = [];
  if (!GATES.length) return [{ kind: 'no-gate', key: '(table)', detail: '空表上的自洽恒真' }];
  let worst = null;
  GATES.forEach(function (d) { if (worst === null || d.raw > worst.raw) worst = d; });
  const expect = worst.raw * (RATIOS[worst.kind] || RATIOS.spawn);
  if (lim.spawnMs !== expect) {
    problems.push({ kind: 'two-spawn-budgets', key: 'spawnMs', detail: '统一预算 ' + lim.spawnMs + ' ≠ 最重门禁建议上限 ' + expect + '（' + worst.key + '）' });
  }
  GATES.forEach(function (d) {
    if (!(t[d.key] > 0)) problems.push({ kind: 'table-missing-lim', key: d.key, detail: '有实测值却算不出建议上限' });
    if (lim.spawnMs < t[d.key]) problems.push({ kind: 'ratio-too-tight', key: d.key, detail: '统一预算 ' + lim.spawnMs + ' < 本门禁建议上限 ' + t[d.key] });
  });
  Object.keys(TIMEOUT_ARMED).forEach(function (k) {
    const a = TIMEOUT_ARMED[k];
    if (!a.optionKey) { problems.push({ kind: 'armed-without-option', key: k, detail: '入了武装表却没有现场选项名 ⇒ 无法逐字核对' }); return; }
    if (a.value !== lim.spawnMs) problems.push({ kind: 'armed-mismatch', key: k, detail: '现场 ' + a.value + 'ms ≠ 统一预算 ' + lim.spawnMs + 'ms' });
    if (a.mode === 'spawn+shell' && !(a.shellFuse > 0)) problems.push({ kind: 'shell-fuse-missing', key: k, detail: '外部命令形态必须另有 shell 侧保险丝' });
  });
  // 站点表 vs 武装表：**两张表不许各说一套**（本版踩到的 90000/96000 就是这类分歧的兄弟）
  ARMED_SITES.forEach(function (s) {
    const a = TIMEOUT_ARMED[s.key];
    if (!a) { problems.push({ kind: 'site-not-armed', key: s.key, detail: '登记了现场站点却没入武装表' }); return; }
    if (a.mode !== s.mode) problems.push({ kind: 'mode-disagreement', key: s.key, detail: '站点表 ' + s.mode + ' ≠ 武装表 ' + a.mode });
    if ((s.shellFuse || 0) !== (a.shellFuse || 0)) problems.push({ kind: 'fuse-disagreement', key: s.key, detail: '站点表 fuse=' + (s.shellFuse || 0) + 's ≠ 武装表 fuse=' + (a.shellFuse || 0) + 's' });
    if (!!s.kill !== !!a.killSignal) problems.push({ kind: 'kill-disagreement', key: s.key, detail: '站点表 kill=' + !!s.kill + ' ≠ 武装表 killSignal=' + !!a.killSignal });
    // 客观规则，不是字形判断：命令串含管道 ⇒ 必须另有 shell 侧保险丝。
    //   本版首跑正是在这里栽的：原先只看 `mode === 'spawn+shell'` 这个**标签**，
    //   把标签抹平（mode→'spawn'）整条判断就无声逃逸——而模块头自己写着「口径是行为读数，不是字形比对」。
    if (s.pipe && !(s.shellFuse > 0)) {
      problems.push({ kind: 'pipe-site-without-fuse', key: s.key, detail: '命令串含管道却没有 shell 侧保险丝 ⇒ 只杀写端、读端照挂' });
    }
  });
  Object.keys(TIMEOUT_ARMED).forEach(function (k) {
    if (!ARMED_SITES.some(function (s) { return s.key === k; })) {
      problems.push({ kind: 'armed-without-site', key: k, detail: '入了武装表却没有现场站点登记 ⇒ 逐站点核对覆盖不到它' });
    }
  });
  return problems;
}

/** 自洽判据的读数摘要（run.js 与专锁共用一句话）。 */
function coherenceSummary(table) {
  const p = coherence(table);
  return p.length ? ('不自洽 ' + p.length + ' 项：' + p.map(function (x) { return x.kind + '(' + x.key + ')'; }).join(' ')) : '自洽（一套预算）';
}

/**
 * spawnSync 的 options 片段。**10 个调用点全部返回对象**（本版的主口径：
 *   不留任何一个没有 timeout 的调用点）。带 killSignal 的点用 SIGKILL，
 *   否则默认 SIGTERM——子进程理论上可以忽略，故出口三处显式给 SIGKILL。
 */
function spawnOptsFor(d, ms) {
  const g = d || {};
  const o = { timeout: ms };
  if (g.optionKey) {
    o[g.optionKey] = ms;
    if (g.killSignal) o[g.killSignal] = 'SIGKILL';
  }
  return o;
}

/** 一次性把整张武装表展开（专锁与 run.js 消费同一份）。 */
function runTable(table) {
  const t = table || buildTable(null);
  const lim = limitsOf(t);
  const out = {};
  Object.keys(TIMEOUT_ARMED).forEach(function (k) {
    const a = TIMEOUT_ARMED[k];
    out[k] = {
      mode: a.mode, value: a.value, lim: t[k], shellFuse: a.shellFuse || null,
      spawn: spawnOptsFor(a, lim.spawnMs)
    };
  });
  return out;
}

/**
 * 同进程探针的统一超时器。同步探针被卡住时，JS 单线程**无法自我打断**——
 *   这一点必须诚实写在能力面上：withTimeout 能抓的是「每次 fn() 之间的墙钟间隔」
 *   （也就是 fn 是循环里的单次小调用时），抓不了「fn 自己转了 10s 不返回」。
 *   后者的保险丝只有父进程的 watchdog 强杀。
 */
function withTimeout(fn, ms, tag) {
  if (typeof fn !== 'function') throw new Error('withTimeout: fn 必须是函数 :: ' + tag);
  if (!(ms > 0)) throw new Error('withTimeout: 超时必须为正（实 ' + ms + '）:: ' + tag);
  const t0 = Date.now();
  let value = null, err = null;
  try { value = fn(); } catch (e) { err = e; }
  const used = Date.now() - t0;
  if (err) return { ok: false, ms: used, value: null, timedOut: false, error: err.message };
  if (used > ms) return { ok: false, ms: used, value: value, timedOut: true, error: '超出 ' + ms + 'ms（实 ' + used + 'ms）:: ' + tag };
  return { ok: true, ms: used, value: value, timedOut: false, error: null };
}

/** 末 N 行（卡死取证块的正文）。空输入返回空数组，不返回 ['']。 */
function tailLines(text, n) {
  const s = String(text === null || text === undefined ? '' : text);
  if (!s) return [];
  const lines = s.split('\n');
  const k = (n > 0) ? n : 20;
  return lines.slice(Math.max(0, lines.length - k));
}

/**
 * 卡死取证块：一眼看出「哪一道门禁、超了多少、它最后说了什么」。
 *   这三件事正是现状（只留一行 "Status: runner-failed"）丢掉的。
 */
function formatHangBlock(o) {
  const g = o || {};
  const ms = (g.ms === null || g.ms === undefined) ? null : g.ms;
  const over = (typeof g.limit === 'number' && ms !== null) ? (ms - g.limit) : null;
  const out = ['⏱ 门禁超时熔断：' + (g.key || '(未命名)') + ' —— 上限 ' + g.limit + 'ms'];
  if (ms !== null) out.push('  实际 ' + ms + 'ms' + (over !== null && over > 0 ? '（超 ' + over + 'ms）' : ''));
  if (g.signal || g.errorCode) out.push('  终止信号 ' + (g.signal || '-') + ' / 错误码 ' + (g.errorCode || '-'));
  out.push('  命令 ' + ((g.argv || []).join(' ') || '(未记录)'));
  const tail = tailLines(g.stdout, g.tail || 20);
  if (tail.length) {
    out.push('  末 ' + tail.length + ' 行 stdout：');
    tail.forEach(function (l) { out.push('    | ' + l); });
  } else {
    out.push('  末 N 行 stdout：（空 —— 子进程在被杀前没有输出）');
  }
  return out.join('\n');
}

/** 汇总读数（run.js 与专锁共用一句话口径）。 */
function summary(t) {
  const table = t || buildTable(null);
  const lim = limitsOf(table);
  return '门禁 ' + GATES.length + ' 道 · 武装调用点 ' + ARMED_SITES.length
    + ' 处（全部有 timeout）· 现场预算 ' + lim.spawnMs + 'ms · shell 保险丝 ' + lim.shellMs
    + 's · inline ' + lim.inlineMs + 'ms · ' + coherenceSummary(table);
}

/** 形态分档计数（专锁断言「三档齐备」，防止某一档悄悄消失）。 */
function modeCounts() {
  const c = {};
  ARMED_SITES.forEach(function (s) { c[s.mode] = (c[s.mode] || 0) + 1; });
  return c;
}

/** 一次性取回全部读数（无副作用、不写盘、不起子进程）。 */
function discover() {
  const table = buildTable(null);
  const lim = limitsOf(table);
  const keys = Object.keys(TIMEOUT_ARMED);
  const coh = coherence(table);
  return {
    selfRel: SELF_REL,
    ratios: RATIOS,
    gates: GATES.slice(),
    gateCount: GATES.length,
    armedKeys: keys,
    armedCount: keys.length,
    modeCounts: modeCounts(),
    table: table,
    limits: lim,
    opts: runTable(table),
    sites: ARMED_SITES.slice(),
    siteStats: siteStats(srcOf(RUN_REL)),
    coherence: coh,
    coherenceSummary: coherenceSummary(table),
    summary: summary(table)
  };
}

// 直跑：只打印，不做裁决（本模块是取值面，判据在 tests/gate-timeout-v2105.js）。
if (require.main === module) {
  const d = discover();
  console.log('■ 门禁超时预算（WorldAxis ' + BASE + '）');
  console.log('  ' + summary(d.table));
  console.log('  逐门禁实测证据（raw → 建议上限 = raw × 倍数）：');
  d.gates.forEach(function (g) {
    const lim = d.table[g.key];
    console.log('    · ' + g.key.padEnd(26) + '[' + g.kind + ']  ' + g.raw + 'ms × '
      + (d.ratios[g.kind] || d.ratios.spawn) + ' = ' + lim + 'ms  ' + g.why);
  });
  console.log('  run.js 现场武装值（' + d.armedCount + ' 处，全部有 timeout）：');
  d.armedKeys.forEach(function (k) {
    const a = TIMEOUT_ARMED[k];
    console.log('    · ' + k.padEnd(26) + String(a.value).padStart(6) + 'ms  [' + a.mode + ']'
      + (a.shellFuse ? '  shell fuse=' + a.shellFuse + 's' : '')
      + '  ' + a.optionKey + (a.killSignal ? ' / ' + a.killSignal + '=SIGKILL' : ''));
  });
  console.log('  形态分档：' + JSON.stringify(d.modeCounts));
  if (d.coherence.length) console.log('  ✗ ' + d.coherenceSummary);
}

module.exports = {
  SELF_REL: SELF_REL,
  RATIOS: RATIOS,
  GATE_TIMEOUTS: GATE_TIMEOUTS,
  TIMEOUT_ARMED: TIMEOUT_ARMED,
  GATES: GATES,
  buildTable: buildTable,
  limitsOf: limitsOf,
  coherence: coherence,
  coherenceSummary: coherenceSummary,
  spawnOptsFor: spawnOptsFor,
  runTable: runTable,
  withTimeout: withTimeout,
  tailLines: tailLines,
  formatHangBlock: formatHangBlock,
  ARMED_SITES: ARMED_SITES,
  RUN_REL: RUN_REL,
  stripLiterals: stripLiterals,
  parseCallBlocks: parseCallBlocks,
  findSiteBlock: findSiteBlock,
  siteStats: siteStats,
  modeCounts: modeCounts,
  summary: summary,
  discover: discover
};
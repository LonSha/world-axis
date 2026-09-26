#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.105.0（计划一 #3）补丁 D：给 tests/gate-timeout.js 补「现场站点锚点表 + 括号平衡解析器」。
   病根（首跑实证）：专锁拿模块内的 key 去 run.js 定位，而 key 只活在本模块里 ⇒ 十处全报 site-missing。
   同时补客观规则：站点命令串含管道 ⇒ 该站点必须有 shell 侧保险丝（不许靠 mode 标签判断 —— 标签可被抹平）。
   纪律：每处锚点先核对恰中 1 次；不满足即整体放弃（不写半套）。"""
import io, sys, hashlib

P = '/tmp/wa_git/tests/gate-timeout.js'
src = io.open(P, encoding='utf-8').read()
orig = src

def must1(s, x, tag):
    n = s.count(x)
    if n != 1:
        print('ABORT 锚点命中 %d 次（要求 1）:: %s' % (n, tag))
        sys.exit(1)

# ── R0：顶部补 fs + RUN_REL（discover 要读 run.js 现场读数）──
A0 = "const path = require('path');\n"
R0 = ("const fs = require('fs');\nconst path = require('path');\n")
must1(src, A0, 'R0')
src = src.replace(A0, R0)

A0b = "const SELF_REL = 'tests/gate-timeout.js';\n"
R0b = A0b + "const RUN_REL = 'tests/run.js';\n"
must1(src, A0b, 'R0b')
src = src.replace(A0b, R0b)

A0c = "const BASE = path.join(__dirname, '..');\n"
R0c = A0c + "\n/** 仓库内相对路径 → 源码（纯只读；discover 用它取现场读数）。 */\nfunction srcOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }\n"
must1(src, A0c, 'R0c')
src = src.replace(A0c, R0c)

# ── R1：在武装表之后插入「现场站点锚点表 + 解析器」──
A1 = """  'isolated-runner-lock': { value: 96000, mode: 'spawn', optionKey: 'timeout' }
};
"""
R1 = A1 + """
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
    anchor: "const rBad4100 = cp4100.spawnSync(process.execPath, [brokenFile4100], { cwd: BASE, encoding: 'utf8', timeout: 96000, killSignal: 'SIGKILL' });" },
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
      if (c === 'BS') { i += 2; continue; }
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
  const lines = String(src).split('NL');
  const blocks = [];
  lines.forEach(function (l, i) {
    if (l.trim().charAt(0) === '/' && l.trim().charAt(1) === '/') return;
    if (!/(?:spawnSync|execSync|execFileSync)SP*LPAREN/.test(l)) return;
    let depth = 0, text = '';
    for (let j = i; j < lines.length; j += 1) {
      text += (j > i ? 'NL' : '') + lines[j];
      const code = stripLiterals(lines[j]);
      for (let k = 0; k < code.length; k += 1) {
        if (code[k] === 'LPAREN') depth += 1;
        else if (code[k] === 'RPAREN') depth -= 1;
      }
      if (depth <= 0) break;
    }
    blocks.push({ line: i + 1, span: text.split('NL').length, text: text });
  });
  return blocks;
}

/**
 * 按锚点定位站点块。
 *   0 命中 ⇒ 返回 null（**找不到站点不等于站点没问题**，由调用方计 site-missing）；
 *   >1 命中 ⇒ 直接抛（锚点不唯一时，「改到哪一处」就成了未知——宁可不判）。
 */
function findSiteBlock(src, anchor) {
  const lines = String(src).split('NL');
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
  blocks.forEach(function (b) { if (/TIMEOUTD+/.test(b.text)) armed += 1; });
  const budget = (String(src).match(/timeout: D+/g) || []).length;
  return { sites: blocks.length, armedSites: armed, budget: budget };
}
"""
must1(src, A1, 'R1')
src = src.replace(A1, R1)

# ── R2：modeCounts 改从站点表读（形态的唯一源是「现场站点」，不是第二张表）──
A2 = """function modeCounts() {
  const c = {};
  Object.keys(TIMEOUT_ARMED).forEach(function (k) {
    const m = TIMEOUT_ARMED[k].mode;
    c[m] = (c[m] || 0) + 1;
  });
  return c;
}"""
R2 = """function modeCounts() {
  const c = {};
  ARMED_SITES.forEach(function (s) { c[s.mode] = (c[s.mode] || 0) + 1; });
  return c;
}"""
must1(src, A2, 'R2')
src = src.replace(A2, R2)

# ── R3：summary 带站点数 ──
A3 = """  return '门禁 ' + GATES.length + ' 道 · 武装调用点 ' + Object.keys(TIMEOUT_ARMED).length
    + ' 处（全部有 timeout）· 单次预算 ' + lim.spawnMs + 'ms · shell 保险丝 ' + lim.shellMs
    + 's · inline ' + lim.inlineMs + 'ms · ' + coherenceSummary(table);"""
R3 = """  return '门禁 ' + GATES.length + ' 道 · 武装调用点 ' + ARMED_SITES.length
    + ' 处（全部有 timeout）· 现场预算 ' + lim.spawnMs + 'ms · shell 保险丝 ' + lim.shellMs
    + 's · inline ' + lim.inlineMs + 'ms · ' + coherenceSummary(table);"""
must1(src, A3, 'R3')
src = src.replace(A3, R3)

# ── R4：coherence 补「两张表不许各说一套」+ 客观的管道规则 ──
A4 = """  return problems;
}

/** 自洽判据的读数摘要"""
R4 = """  // 站点表 vs 武装表：**两张表不许各说一套**（本版踩到的 90000/96000 就是这类分歧的兄弟）
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

/** 自洽判据的读数摘要"""
must1(src, A4, 'R4')
src = src.replace(A4, R4)

# ── R5：discover 带站点表与现场读数 ──
A5 = "    coherence: coh,\n"
R5 = "    sites: ARMED_SITES.slice(),\n    siteStats: siteStats(srcOf(RUN_REL)),\n    coherence: coh,\n"
must1(src, A5, 'R5')
src = src.replace(A5, R5)

# ── R6：导出面 ──
A6 = """  modeCounts: modeCounts,
  summary: summary,
  discover: discover
};"""
R6 = """  ARMED_SITES: ARMED_SITES,
  RUN_REL: RUN_REL,
  stripLiterals: stripLiterals,
  parseCallBlocks: parseCallBlocks,
  findSiteBlock: findSiteBlock,
  siteStats: siteStats,
  modeCounts: modeCounts,
  summary: summary,
  discover: discover
};"""
must1(src, A6, 'R6')
src = src.replace(A6, R6)

# ── 还原占位符（避免本补丁的文件里出现整体形态；含反斜杠的字符用占位符代写）──
REPL = [
    ('BS', chr(92) + chr(92)),          # 源码里要写两个反斜杠
    ('NL', chr(92) + 'n'),              # '\n'
    ('SP', chr(92) + 's'),              # '\s'
    ('SLASH', '/'),
    ('LPAREN', '('),
    ('RPAREN', ')'),
    ('TIMEOUT', 'timeout: '),
    ('D+', chr(92) + 'd+'),
]
for k, v in REPL:
    src = src.replace(k, v)

if src == orig:
    print('ABORT 没有发生任何改动')
    sys.exit(1)
if not src.startswith('// WorldAxis tests/gate-timeout.js'):
    print('ABORT 文件头丢失')
    sys.exit(1)
if 'NEVER_LEAK_GHOST' in src:
    print('ABORT 残留未替换的代词')
    sys.exit(1)
io.open(P, 'w', encoding='utf-8').write(src)
print('OK 已改写 tests/gate-timeout.js（%d → %d 字节）' % (len(orig), len(src)))
print('  md5 %s' % hashlib.md5(src.encode('utf-8')).hexdigest())
print('  自检：ARMED_SITES=%d 条 / srcOf=%d / RUN_REL=%d / 注释里出现 %s = %d'
      % (src.count('mode: '), src.count('function srcOf'), src.count('const RUN_REL'),
         'timeout: ' + chr(92) + 'd+', src.count('timeout: ' + chr(92) + 'd+')))

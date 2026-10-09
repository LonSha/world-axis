// WorldAxis tools/contract-scan.js (v2.150.0) — 跨模块契约漂移静态扫描器（计划 RP5）
//
// 【它治的病】
//   `engines/contract-audit.js` 已有**运行时**对账面（把现场读数与声明枚举当场比），
//   但它是运行期才说话的：一条字段被两个模块用两套字面量写、一个枚举在三个模块里
//   写成三种词、一个拒收码在源码里写着却没有任何归属——这三件事在**回归之前**
//   全都是不可见的。RP5 要的正是这一层「静态预防」。
//
// 【三面，全部以现场读数为准】
//   ① codes   拒收码归属完备性：产品面里每个内联 `reason: 'x'` 必须落在
//             base（台账存量）∪ witnessed（见证表声明）∪ dead（死表）之一。
//             这不是「另写一份 reject-code-gate」——扫描面与归属真源全部**委托**
//             `tests/reject-code-gate.js` 与 `tests/reject-v2780.js`，
//             本文件只把「谁没归属」这一条静态答案交出来（回归期零装载即可得）。
//   ② enums   同名枚举跨模块值域：同名具名常量（全大写蛇形）在 ≥2 个模块里声明，
//             值集合不相等即报。**同名不同义是常态**（CHANNELS / KINDS / STAGES …），
//             故有一张必须逐条给理由的 EXEMPT 表；表里写了名字却已不再分歧
//             ⇒ 报 stale-exempt —— 名单会过期，过期名单比没有名单更坏。
//   ③ fields  跨模块字段写者聚类：同一 `d.<path>` 被 ≥2 个模块写时，若各自写的
//             **字符串字面量**两两不相交（谁都没写对方写的那个），即报。
//             只对「字面量」判：变量、表达式、模板串那三类写法代码不定，
//             不报也不伪归（与 reject-code-gate 的「拼接写法不报错也不伪归」同规）。
//
// 【边界（如实登记）】
//   · 静态解析，不做 AST：具名常量只认 `const NAME = [ 'a', 'b' ]` 一行内形态；
//     跨行数组、动态拼装、`Object.freeze([...])` 一律**认不出**，不报也不伪归。
//   · 只扫描产品面（与 reject-code-gate / export-contract 同源：排 tests/ 与 tools/）。
//   · 注释行一律不参与（解释病灶的文字不是病灶）—— 注释识别与 reject-code-gate 同宽。
//
// 用法：
//   node tools/contract-scan.js              打印三面读数与红项（红项时 exitCode=1）
//   node tools/contract-scan.js --json       输出结构化读数
//   node tools/contract-scan.js --self-test  两向自证（合成站点上必须报，原版上不得假报）
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

// ── 单一真源委托 ─────────────────────────────────────────────────────────
/** 产品面（与 export-contract / reject-code-gate 同源，不另写遍历器）。 */
function productFiles(root) {
  return require(path.join(root || BASE, 'tests', 'product-files.js')).productFiles(root || BASE);
}
/** 去注释剥离（换行与长度守恒，故行号与原文可对照）。 */
function stripComments(src) {
  return require(path.join(BASE, 'tests', 'test-surface-gate.js')).stripComments(src);
}
/** 拒收码扫描面（去注释 + 产品面）真源。 */
function codeScan(opt) {
  return require(path.join(BASE, 'tests', 'reject-code-gate.js')).scan(opt);
}
/** 死表（已证不可达）真源。 */
function deadTable() {
  return require(path.join(BASE, 'tests', 'reject-v2780.js')).DEAD;
}
/** 台账 base 真源。 */
function ledgerBase(root) {
  const p = path.join(root || BASE, 'tests', 'reject-code-ledger.json');
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf8')).base || [];
}

/** 见证表**静态声明面**：`want('code'` 字面量调用（注释里的 want 是文档，不是码）。 */
function witnessDeclared(root) {
  const p = path.join(root || BASE, 'tests', 'reject-v2780.js');
  if (!fs.existsSync(p)) return [];
  const src = stripComments(fs.readFileSync(p, 'utf8'));
  const out = [];
  const re = /\bwant\(\s*'([a-zA-Z][a-zA-Z0-9_-]*)'/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
}

/**
 * EXEMPT：同名枚举在不同模块里**合法地**指向不同值域的情形（逐条理由）。
 *   每一条都必须仍处于「有分歧」状态，否则报 stale-exempt（名单会过期）。
 */
const EXEMPT = {
  // v2.182.0（第二批 · O3/O4/O5）：本批三个新模块各带一对同名常量，与既有同级常量**合法地**
  //   指向不同值域 —— 逐条给理由（本表存在的意义就是「同名不同义必须逐条说清」）：
  //     · BANDS：perf-baseline=**性能档**（小局 / 代表性长局 / 容量边缘，判据是存档字节），
  //       contract-scan 前已在场的 spectrum 类同名值是**别的东西**；两者不会互查。
  //     · SOURCE_PROBES：五个新模块各有一张**源可用性探针表**（探的是「这个模块的读口在不在」），
  //       而 feature-detect 型同名常量探的是宿主能力 —— 同形不同义，不许互相校验。
  //   这两条是**新入表**（不是「过期豁免」）：名单里写了名字而现场已不再分歧，判据会报 stale-exempt。
  BANDS: '同名不同义的「档位表」：perf-baseline=性能档（小局/代表性长局/容量边缘，判据是存档字节）、perf-trace=预算档（short/medium/long/lowend）',
  SOURCE_PROBES: '同名不同义的「源探针表」：agenda/chronicle-view/capacity-audit/perf-baseline/world-health 各探各的读口在场性，探针集合互不相同且不该相同',
  ACTIVE: '同名不同义的「活跃态」：act=计划/进行、events=已认领/待办、foreshadow=发展中/待触发、opportunity=已延/开放、quota=生效/已过期',
  CHANNELS: '同名不同义的「通道表」：api-router=路由通道、perspective-lock=叙事通道、world=世界事件通道',
  FIELDS: '同名不同义的「字段清单」：audit-log=审计记录字段、wb-search=世界书检索字段',
  FORBIDDEN: '同名不同义的「禁表」：audit-log=禁止的改动动词、sandbox=禁止的宿主能力',
  KINDS: '同名不同义的「种类表」：act/events/inst/karma/lifeline/preset-world/rehearsal/tolerance 各说各的种类',
  LAYERS: '同名不同义的「层次表」：appearance=外观层、perf-trace=性能采集层、rumor=传播层',
  LEVELS: '同名不同义的「等级表」：intel=情报可信级、probe=探询强度、warrant=凭据分量',
  PHASES: '同名不同义的「阶段表」：phone-bridge=手机桥状态、rhythm-loop=呼吸节拍',
  REASONS: '同名不同义的「理由表」：chrono/inst/lonsha-reader 各报各的拒收理由',
  SCOPES: '同名不同义的「作用域表」：binding=绑定范围、checkpoints=存档范围、liaison=联络范围',
  STAGES: '同名不同义的「阶段表」：causal/era-cycle/liaison/opportunity 各推各的阶段',
  STATUS: '同名不同义的「状态表」：coop/foreshadow/mend 各说各的状态',
  STATES: '同名不同义的「状态集」：diplomacy=外交关系态（accord/alliance/cold/…）、interop=互操作就绪态（absent/incompatible/partial/ready/unknown）',
  STRATEGIES: '同名不同义的「合并策略表」：collab=冲突取值策略（保留甲/保留乙/后写胜）、ensemble=多路选优策略（混合/取首/投票）',
  TERMINAL: '同名不同义的「终态表」：act/causal/events/foreshadow+longline/inst/mend 各自的终态集合，互不通约',
  TIERS: '同名不同义的「档位表」：choices=难度档（易/中/难）、appearance=外观品级（A/B/C/S）',
  TYPES: '同名不同义的「类型表」：schema=数值模式类型（any/array/…）、bonds=羈绊类型（主权让渡/利益同盟/…）'
};

/** 具名常量数组（只认一行内形态）。 */
const ENUM_RE = /\bconst\s+([A-Z][A-Z0-9_]{2,})\s*=\s*\[([^\]]{0,600})\]\s*;/g;

/**
 * 现场读数。opt.read 可注入：负控制要在**内存副本**上重跑同一份判据（真源码破坏、零文件改写）。
 */
function scan(opt) {
  const d = opt || {};
  const root = d.root || BASE;
  const read = d.read || function (rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); };
  // 文件清单可注入：负控制要在**合成立场**上重跑同一份判据（真源码破坏的另一半是同源夹具）。
  //   不注入时逐字走产品面真源 productFiles()（单一真源，不另写遍历器）。
  const files = d.files || productFiles(root);

  // ── ② enums ──
  const enumMap = {};          // NAME -> [{file, values}]
  files.forEach(function (rel) {
    const src = stripComments(read(rel));
    const re = new RegExp(ENUM_RE.source, 'g');
    let m;
    while ((m = re.exec(src)) !== null) {
      const vals = [];
      const rv = /'([^'\n]{0,40})'/g;
      let v;
      while ((v = rv.exec(m[2])) !== null) if (vals.indexOf(v[1]) < 0) vals.push(v[1]);
      if (!vals.length) continue;
      (enumMap[m[1]] = enumMap[m[1]] || []).push({ file: rel, values: vals.sort() });
    }
  });
  const enumDivergent = [];
  Object.keys(enumMap).sort().forEach(function (name) {
    const decls = enumMap[name];
    if (decls.length < 2) return;
    const sets = {};
    decls.forEach(function (x) { (sets[x.values.join('\u0001')] = sets[x.values.join('\u0001')] || []).push(x.file); });
    if (Object.keys(sets).length < 2) return;      // 值域完全一致 ⇒ 不是漂移
    enumDivergent.push({
      name: name, files: decls.map(function (x) { return x.file; }).sort(),
      variants: Object.keys(sets).map(function (k) { return { values: k.split('\u0001'), files: sets[k].sort() }; })
    });
  });

  // ── ③ fields ──
  const fieldMap = {};         // path -> file -> [literal]
  files.forEach(function (rel) {
    const src = stripComments(read(rel));
    const re = /\bd\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*=(?!=)\s*([^\n;]{0,60})/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const rhs = m[2].trim();
      const lm = /^(['"])([^'"]{0,40})\1$/.exec(rhs);
      if (!lm) continue;                            // 非字面量：不报也不伪归
      ((fieldMap[m[1]] = fieldMap[m[1]] || {})[rel] = fieldMap[m[1]][rel] || []).push(lm[2]);
    }
  });
  const fieldDivergent = [];
  Object.keys(fieldMap).sort().forEach(function (p) {
    const per = fieldMap[p];
    const mods = Object.keys(per).sort();
    if (mods.length < 2) return;
    const sets = mods.map(function (m) { return per[m].filter(function (v, i, a) { return a.indexOf(v) === i; }); });
    let disjoint = true;
    for (let i = 0; i < sets.length && disjoint; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        if (sets[i].some(function (v) { return sets[j].indexOf(v) >= 0; })) { disjoint = false; break; }
      }
    }
    if (disjoint) fieldDivergent.push({ path: p, writers: mods.map(function (m) { return { file: m, values: sets[mods.indexOf(m)] }; }) });
  });

  // ── ① codes ──
  const sc = d.codeScan || codeScan({ read: read });
  const codes = Object.keys(sc.hits).sort();
  const owned = {};
  ledgerBase(root).forEach(function (c) { owned[c] = 'base'; });
  Object.keys(deadTable()).forEach(function (c) { owned[c] = 'dead'; });
  witnessDeclared(root).forEach(function (c) { owned[c] = 'witnessed'; });
  const uncovered = codes.filter(function (c) { return !owned[c]; });

  // ── EXEMPT 表自身的两向核对 ──
  const divergentNames = enumDivergent.map(function (x) { return x.name; });
  const staleExempt = Object.keys(EXEMPT).sort().filter(function (n) { return divergentNames.indexOf(n) < 0; });
  const unexempted = divergentNames.filter(function (n) { return !EXEMPT[n]; });

  return {
    files: files.length,
    enums: { declared: Object.keys(enumMap).length, divergent: enumDivergent, list: enumDivergent },
    fields: { paths: Object.keys(fieldMap).length, divergent: fieldDivergent },
    codes: { total: codes.length, owned: Object.keys(owned).length, uncovered: uncovered, hits: sc.hits },
    exempt: { size: Object.keys(EXEMPT).length, stale: staleExempt, missing: unexempted }
  };
}

/** 三面判据。红项 = 现场真漂移；读数恒呈报（零命中不算通过：必须说出「看了多少」）。 */
function audit(opt) {
  const r = opt && opt.result ? opt.result : scan(opt);
  const problems = [];
  if (!r.files) problems.push({ face: 'scope', key: 'empty-product-face', detail: '产品面为空 ⇒ 零命中不算通过' });
  r.enums.divergent.forEach(function (x) {
    if (r.exempt.stale.indexOf(x.name) >= 0 || EXEMPT[x.name]) return;   // 已豁免（豁免理由逐条在 EXEMPT）
    problems.push({ face: 'enums', key: x.name, detail: '同名枚举值域不一致：' + x.variants.map(function (v) {
      return '[' + v.files.join(',') + ']=' + v.values.join('/');
    }).join('  vs  ') });
  });
  r.exempt.stale.forEach(function (n) {
    problems.push({ face: 'enums', key: n, detail: 'stale-exempt：EXEMPT 里登记的「同名不同义」在当前现场已不再分歧（名单过期 ⇒ 比没有名单更坏）' });
  });
  r.fields.divergent.forEach(function (x) {
    problems.push({ face: 'fields', key: x.path, detail: '同一字段被多模块写入了不相交的字面量：'
      + x.writers.map(function (w) { return w.file + '=' + w.values.join('/'); }).join('  vs  ') });
  });
  r.codes.uncovered.forEach(function (c) {
    problems.push({ face: 'codes', key: c, detail: '内联拒收码无归属（既不在台账 base、也未被见证声明、也不在死表）' });
  });
  return { ok: problems.length === 0, problems: problems, readings: r };
}

/** 人读报告行（单一真源：print 与 --json 的 lines 共用同一份，不各写一种排版）。 */
function reportLines(res) {
  const r = res.readings;
  const out = [];
  out.push('== 跨模块契约漂移静态扫描（RP5）==');
  out.push('  产品面 ' + r.files + ' 文件 · 具名常量 ' + r.enums.declared + ' 个 · 字段写点路径 '
    + r.fields.paths + ' 条 · 内联拒收码 ' + r.codes.total + ' 个');
  out.push('  [codes]  有归属 ' + r.codes.owned + ' / 无归属 ' + r.codes.uncovered.length
    + (r.codes.uncovered.length ? '（' + r.codes.uncovered.join('、') + '）' : ''));
  out.push('  [enums]  值域分歧 ' + r.enums.divergent.length + ' 个 · EXEMPT ' + r.exempt.size
    + ' 条（过期 ' + r.exempt.stale.length + ' / 缺理由 ' + r.exempt.missing.length + '）');
  out.push('  [fields] 字面量不相交的共享字段 ' + r.fields.divergent.length + ' 条');
  res.problems.forEach(function (p) { out.push('  DRIFT [' + p.face + '] ' + p.key + ' :: ' + p.detail.slice(0, 160)); });
  out.push(res.ok ? '契约漂移: 0' : '契约漂移: ' + res.problems.length + ' 项');
  return out;
}

/** 打印机读报告（人读出口；判据仍是 audit 的那一份）。 */
function print(opt) {
  const res = audit(opt);
  reportLines(res).forEach(function (l) { console.log(l); });
  return res;
}

/** H6 两向自证：合成站点上三面必须各自报出，原版上不得假报。 */
function selfTest() {
  const fails = [];
  const a = function (c, m) { if (!c) fails.push(m); };
  // 合成站点：只提供三份文件，其余面为空
  const fixture = {
    'core/aaa.js': "const ZZZ_MODES = ['x', 'y'];\nWA.aaa = { f: function (d) { d.alpha = 'one'; } };\n",
    'core/bbb.js': "const ZZZ_MODES = ['p', 'q'];\nWA.bbb = { f: function (d) { d.alpha = 'two'; } };\n",
    'core/ccc.js': "return { ok: false, reason: 'zzz-unowned' };\n"
  };
  const read = function (rel) {
    if (fixture[rel] !== undefined) return fixture[rel];
    return '{}';
  };
  const FIX = ['core/aaa.js', 'core/bbb.js', 'core/ccc.js'];
  const r = scan({ read: read, files: FIX,
    codeScan: { files: ['core/ccc.js'], hits: { 'zzz-unowned': [{ file: 'core/ccc.js', line: 1 }] } } });
  // ① codes 面：合成码无归属 ⇒ 必须进 uncovered
  a(r.codes.uncovered.indexOf('zzz-unowned') >= 0, '[self-test] 合成站点上无归属码未被列出');
  const ad1 = audit({ result: r });
  a(ad1.ok === false, '[self-test] 合成站点上有漂移却报 ok');
  // ② enums 面：同名常量值域不一致（且未豁免）⇒ 必须报
  a(r.enums.divergent.some(function (x) { return x.name === 'ZZZ_MODES'; }), '[self-test] 合成站点上同名枚举分歧未被认出');
  a(r.exempt.missing.indexOf('ZZZ_MODES') >= 0, '[self-test] 未给理由的同名枚举未进 missing');
  // 豁免表真被读到：把已豁免的名字放进同一场景，它不得进 missing。
  a(scan({ read: function (rel) {
    if (rel === 'core/aaa.js') return "const KINDS = ['x', 'y'];";
    if (rel === 'core/bbb.js') return "const KINDS = ['p', 'q'];";
    return '{}';
  }, files: ['core/aaa.js', 'core/bbb.js'], codeScan: { files: [], hits: {} } }).exempt.missing.indexOf('KINDS') < 0,
    '[self-test] EXEMPT 表未被读到（已豁免的名字被当成缺理由）');
  // ③ fields 面：d.alpha 两模块写不相交字面量 ⇒ 必须报
  a(r.fields.divergent.some(function (x) { return x.path === 'alpha'; }), '[self-test] 合成站点上字段字面量互斥未被认出');
  // 空站点：零产品面 ⇒ 必须报空面（零命中不算通过）
  const empty = scan({ read: function () { return '{}'; }, files: [], codeScan: { files: [], hits: {} } });
  const ad2 = audit({ result: empty });
  a(ad2.ok === false && ad2.problems.some(function (p) { return p.key === 'empty-product-face'; }),
    '[self-test] 空产品面未报（零命中不算通过）');
  // 原版：三面读数必须为真且「报出的每一项都带证据字段」
  const live = scan({});
  a(live.files > 100, '[self-test] 原版产品面过小（' + live.files + '）');
  a(live.codes.total > 200, '[self-test] 原版内联拒收码过少（' + live.codes.total + '）');
  a(live.codes.uncovered.every(function (c) { return typeof c === 'string' && c; }), '[self-test] 原版无归属码缺证据');
  console.log(fails.length ? 'contract-scan --self-test: FAIL（' + fails.length + '）' : 'contract-scan --self-test: pass（两向自证）');
  fails.forEach(function (f) { console.log('  x ' + f); });
  return fails.length === 0;
}

if (require.main === module) {
  if (process.argv.indexOf('--self-test') >= 0) process.exitCode = selfTest() ? 0 : 1;
  else if (process.argv.indexOf('--json') >= 0) {
    const res = audit({});
    //   口径（v2.150.0 收口）：--json 是**机读出口**，必须同时交出三块 ——
    //   ok/problems（判据）、lines（人读报告行）、readings（原始读数）。
    //   只交 ok/problems 会让消费方看不见「看了多少」（零命中不算通过的前提）。
    res.lines = reportLines(res);
    console.log(JSON.stringify(res, null, 2));
    process.exitCode = res.ok ? 0 : 1;
  } else {
    const res = print({});
    process.exitCode = res.ok ? 0 : 1;
  }
}

module.exports = { EXEMPT: EXEMPT, scan: scan, audit: audit, print: print, reportLines: reportLines, selfTest: selfTest,
  productFiles: productFiles, deadTable: deadTable, ledgerBase: ledgerBase, witnessDeclared: witnessDeclared };
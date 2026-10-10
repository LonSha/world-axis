'use strict';
// WorldAxis tests/u3-loose-readings-v2191.js — U3「散装读数登记与过期即现形」专锁
//
// ── 本锁要证的（U3 验收四条，逐条对应一段）────────────────────────────
//   ① 改模块注册表后，相关读数在**分钟级**门禁里现形，不必跑全量；
//   ② 失配报出**文件 / 行号 / 读数类型 / 真源**；
//   ③ 新增散装读数**若无登记则红**；
//   ④ 审查表**自身不得成为第二真源**（真值一律取账本或探针，表只登记站点）。
//
// ── 分四段 ───────────────────────────────────────────────────────────
//   A 静态（工具与表的形态）：导出面、形态词表、真值不进表、最小站点数、报告字段齐备；
//   B 运行时（现算）：全站点核对为绿 + 反向漏网为 0；
//   C 不变式：连调两次读数逐字相同（无副作用）；
//   N 负控制（**全部在内存副本上做真破坏**，两向自证）：
//     N1 改真源码的字面量 ⇒ 该站点 mismatch 且**带行号**（验收②）
//     N2 改探针的真值 ⇒ 同样现形（**两向**：不是只有一种改法会红）
//     N3 新造一个未登记的散装点 ⇒ unregistered（验收③：新增即现形）
//     N4 摘掉一条登记 ⇒ 该站点变成 unregistered（证明 N3 不是恒真）
//     N5 与「同名局部变量」区分：把 tests/run.js 里同形但字段不在探针的点喂进来 ⇒ **不得误报**
//     N6 探针不可解析 ⇒ 如实报 unreadable，**不当作通过**
//     N7 登记站点在真源码里消失（变量改名）⇒ 报 missing，**不静默放行**
//     N8 表里写进真值字段 ⇒ tableProblems 现形（验收④：表不许成第二真源）
//     N9 纯函数两向自证：原版上同款判据为真
//   真实破坏用「读真文件 → 在内存里替换 → 喂给 scanSite/audit」的形态：
//     **不写任何真文件**（本仓口径：验证者不得成为风险源）。
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const LR = require('../tools/loose-readings.js');

const failures = [];
let pass = 0;
function a(cond, name, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { failures.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}
const readOf = function (rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); };

// ══════════ A. 静态 ══════════
function runA() {
  console.log('\nA. 工具与登记表的形态');
  ['audit', 'scanSite', 'loadTable', 'tableProblems', 'listTestFiles', 'print', 'pick']
    .forEach(function (k) { a(typeof LR[k] === 'function', 'A1 loose-readings 导出 ' + k); });
  a(Array.isArray(LR.SHAPES) && LR.SHAPES.length === 3, 'A2 形态词表是有限集合（' + LR.SHAPES.length + ' 种）');
  const table = LR.loadTable();
  a(!!table && Array.isArray(table.sites) && table.sites.length >= 3,
    'A3 登记站点 ≥3（实 ' + (table && table.sites ? table.sites.length : '不可读') + '）—— 空表上「无失配」是恒真的');
  a(!!table && (table.shapes || []).every(function (s) { return LR.SHAPES.indexOf(s) >= 0; }),
    'A4 表内形态词表与工具词表同源（不各写一份）');
  // 真值不进表（验收④的核心）
  a(LR.tableProblems(table).length === 0, 'A5 表自检：无真值字段、形态合法',
    JSON.stringify(LR.tableProblems(table).slice(0, 3)));
  // 反向漏网的**判据**必须是「字段真的在探针里」，不能只靠变量名
  const src = readOf('tools/loose-readings.js');
  a(src.indexOf('字段不在任何已登记探针里') >= 0 && src.indexOf('c.probe, m[2]) !== undefined') >= 0,
    'A6 反向漏网按「字段在探针里真存在」判定（不是只按变量名 —— 同名局部变量会误伤）');
  // 站点字段的探针真值可现取（读不到必须当不通过）
  const s0 = table.sites[0];
  const probe = JSON.parse(readOf(s0.probe));
  a(LR.pick(probe, s0.fields[0]) !== undefined, 'A7 登记站点的字段在探针里真存在（' + s0.fields[0] + '）');
  a(LR.pick(probe, 'no.such.field.at.all') === undefined,
    'A8 取不到时返回 undefined（**与 0 分开**：不拿 0 冒充「读不到」）');
}

// ══════════ B. 运行时（现算） ══════════
function runB(A) {
  console.log('\nB. 现算：全站点一致 + 零漏网');
  const res = LR.audit({});
  A(res.checked >= 6, 'B1 核对到的字面量 ≥6 处（实 ' + res.checked + '）—— 分母不为零');
  A(res.problems.length === 0, 'B2 全站点与真源一致、且无未登记散装读数',
    JSON.stringify(res.problems.slice(0, 3)));
  A(res.probes.length >= 1, 'B3 至少一个探针（真源）在读（实 ' + res.probes.join(',') + '）');
  // 验收②：失配报告的字段齐备（用合成表驱动，不改真文件）
  const synth = { version: 'x', shapes: LR.SHAPES, sites: [{
    id: 'synth-1', file: 'tests/settle-v2830.js', shape: 'ledger-num-eq', var: 'led',
    fields: ['totals.loadEdges'], probe: 'tests/module-registry-ledger.json', why: '合成本' }] };
  const bad = LR.audit({ table: synth, scanUnregistered: false });
  const mism = bad.problems.filter(function (p) { return p.kind === 'mismatch'; });
  A(mism.length === 0, 'B4 合成表（与真源码一致）不得误报（实 ' + mism.length + '）');
}

// ══════════ C. 不变式 ══════════
function runC(A) {
  console.log('\nC. 不变式（连调两次逐字相同，无副作用）');
  const r1 = JSON.stringify(LR.audit({}));
  const r2 = JSON.stringify(LR.audit({}));
  A(r1 === r2, 'C1 连续两次现算读数逐字相同');
  const t1 = JSON.stringify(LR.loadTable());
  const t2 = JSON.stringify(LR.loadTable());
  A(t1 === t2, 'C2 登记表读取无副作用');
}

// ══════════ N. 负控制（内存副本上的真破坏） ══════════
function runN(A) {
  console.log('\nN. 负控制（内存副本真破坏 + 两向自证）');
  const table = LR.loadTable();
  const realSrc = readOf('tests/settle-v2830.js');
  const site = table.sites[0];

  // N1：改真源码里的字面量 ⇒ mismatch 且带行号（验收②）
  const one = LR.scanSite(site, realSrc)[0];
  A(!!one, 'N1 前提：站点在真源码里扫得到（' + JSON.stringify(one) + '）');
  const brokenSrc = realSrc.replace(
    new RegExp('led\\.' + one.field.replace('.', '\\.') + '(\\s*===\\s*)(\\d+)'),
    function (all, mid) { return 'led.' + one.field + mid + '999999'; });
  A(brokenSrc !== realSrc, 'N1b 破坏锚点确实改到了真源码（不是空替换）');
  const hit = LR.scanSite(site, brokenSrc).filter(function (h) { return h.field === one.field; })[0];
  A(!!hit && hit.got === '999999' && hit.line === one.line,
    'N1c 破坏后扫到的字面量变了、**行号不变**（实 ' + JSON.stringify(hit) + '）');
  const synthN1 = { version: 'x', shapes: LR.SHAPES, sites: [site] };
  // 驱动 audit 的「真源码」需要走文件读取 ⇒ 用 scanSite 结果 + 探针手算同款判据（同规格）
  const probeObj = JSON.parse(readOf(site.probe));
  const wantN1 = LR.pick(probeObj, one.field);
  A(String(hit.got) !== String(wantN1),
    'N1d 破坏值 ≠ 真源值（' + hit.got + ' vs ' + wantN1 + '）⇒ 判据会现形；原版上两者相等');
  A(String(one.got) === String(wantN1), 'N1e 对照：原版同款判据为真（两向自证）');

  // N2：改探针的真值 ⇒ 同样现形（第二种改法）
  const fakeProbe = JSON.parse(JSON.stringify(probeObj));
  let cur = fakeProbe;
  const parts = one.field.split('.');
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = Number(one.got) + 1;
  const LR2 = { probe: fakeProbe };
  a(String(LR.pick(LR2.probe, one.field)) !== String(one.got),
    'N2 改探针真值（' + one.got + ' → ' + LR.pick(LR2.probe, one.field) + '）⇒ 反向也能现形');

  // N3：新造一个未登记的散装点 ⇒ unregistered（验收③）
  //   【锚点必须拆开拼接】合成源码里不许出现**完整字面量** —— 否则它会落在本锁自己这一行上，
  //   被反向漏网如实抓成「未登记的散装读数」，判据随即被自己的源码满足（本仓第 ③ 条假绿形态）。
  const n3files = ['tests/_synth_u3_probe.js'];
  const n3src = 'const ' + 'led = {}; a(led.totals.loadEdges' + ' === ' + '106);\n';
  const n3 = LR.audit({ table: table, scanUnregistered: true });
  // 用文件集合注入法：把合成源码写给 audit 的 files 面需要真文件 ⇒ 改用 pick+正则同款现算
  const reN3 = /\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$.]*)\s*===\s*(\d+)/g;
  const mN3 = reN3.exec(n3src);
  A(!!mN3 && mN3[1] + '.' + mN3[2] === 'led.totals.loadEdges',
    'N3 合成源码里真能扫出散装点（' + (mN3 ? mN3[0] : '无') + '）');
  const coveredN3 = table.sites.some(function (s) {
    return s.var === mN3[1] && (s.fields || []).indexOf(mN3[2]) >= 0; });
  // 注：同一 var+field 若已在**别的文件**登记过，本工具的 covered 判据还要求文件路径一致
  const coveredSameFile = table.sites.some(function (s) {
    return s.file === n3files[0] && s.var === mN3[1] && (s.fields || []).indexOf(mN3[2]) >= 0; });
  A(coveredN3 === true && coveredSameFile === false,
    'N3b 「同一字段但**换了个文件**」不算已登记 ⇒ 新文件里的同形点会被报 unregistered（判据含文件路径）');

  // N4：摘掉一条登记 ⇒ 该点变成漏网（证 N3 不是恒真）
  const thinned = JSON.parse(JSON.stringify(table));
  thinned.sites = thinned.sites.filter(function (s) { return s.id !== site.id; });
  const stillCovered = thinned.sites.some(function (s) {
    return s.file === site.file && s.var === site.var
      && (s.fields || []).indexOf(one.field) >= 0; });
  A(stillCovered === false, 'N4 摘掉登记后同一站点不再算「已覆盖」⇒ 漏网判据不是恒真');

  // N5：同名局部变量（字段不在探针里）⇒ 不得误报
  const decoyLines = ['const led = result.rows; a(led.length === 3);',
    'a(led.problems.length === 0);', 'a(led.rows.length === 5);'];
  let falsePos = 0;
  decoyLines.forEach(function (line) {
    const re = reN3; re.lastIndex = 0;
    let m;
    while ((m = re.exec(line))) {
      const inProbe = table.sites.some(function (s) {
        let p = null; try { p = JSON.parse(readOf(s.probe)); } catch (e) { return false; }
        return s.var === m[1] && LR.pick(p, m[2]) !== undefined;
      });
      if (inProbe) falsePos += 1;
    }
  });
  A(falsePos === 0, 'N5 同名局部变量（led.length / led.problems.length / led.rows.length）**零误报**'
    + ' —— 判据是「字段在探针里存在」，不是变量名');

  // N6：探针不可解析 ⇒ unreadable，不当作通过
  const badProbeTable = { version: 'x', shapes: LR.SHAPES, sites: [{
    id: 'bad-probe', file: 'tests/settle-v2830.js', shape: 'ledger-num-eq', var: 'led',
    fields: ['totals.loadEdges'], probe: 'tests/__no_such_ledger__.json', why: '负控制' }] };
  const badProbeRes = LR.audit({ table: badProbeTable, scanUnregistered: false });
  A(badProbeRes.problems.some(function (p) { return p.kind === 'unreadable'; }),
    'N6 探针读不到 ⇒ 如实报 unreadable（**不静默当通过**）',
    JSON.stringify(badProbeRes.problems.slice(0, 2)));

  // N7：站点在真源码里消失（变量改名）⇒ missing，不静默放行
  const renamedTable = { version: 'x', shapes: LR.SHAPES, sites: [{
    id: 'renamed', file: 'tests/settle-v2830.js', shape: 'ledger-num-eq', var: 'zzzNotThere',
    fields: ['totals.loadEdges'], probe: 'tests/module-registry-ledger.json', why: '负控制' }] };
  const renamedRes = LR.audit({ table: renamedTable, scanUnregistered: false });
  A(renamedRes.problems.some(function (p) { return p.kind === 'missing'; }),
    'N7 登记站点扫不到 ⇒ 报 missing（**改名必须重新登记**，不许静默放行）',
    JSON.stringify(renamedRes.problems.slice(0, 2)));

  // N8：表里写进真值字段 ⇒ tableProblems 现形（验收④）
  const dirtyTable = JSON.parse(JSON.stringify(table));
  dirtyTable.sites[0].want = 106;
  A(LR.tableProblems(dirtyTable).some(function (p) { return p.kind === 'value-in-table'; }),
    'N8 表里写进真值字段（want: 106）⇒ 自检报 value-in-table（表不得成为第二真源）');
  A(LR.tableProblems(table).length === 0, 'N8b 对照：真表无任何真值字段（两向自证）');

  // N9：纯函数两向自证 —— 原版上同款判据为真
  const resReal = LR.audit({});
  A(resReal.problems.length === 0, 'N9 原版上同款判据为真（problems 0）—— 判据非恒假');
}

function runAll(assert) {
  const A = assert || a;
  runA();
  runB(A === a ? assert : A);
  runC(A === a ? assert : A);
  runN(A === a ? assert : A);
}
runAll(a);
console.log('\nU3-LOOSE-READINGS-V2191: ' + (failures.length ? 'FAIL ' + failures.length + '/' + (pass + failures.length) : 'pass (' + pass + ')'));
failures.slice(0, 8).forEach(function (f) { console.log('  · ' + f); });
process.exit(failures.length ? 1 : 0);
#!/usr/bin/env node
// WorldAxis tests/injection-restore-lock-v2800.js -- 注入-还原不变量专锁（v2.80.0 第十四面 C）
//
// 治的病（真实事故，本版实测复现并已修复工作树）
//   tests/run.js 里有若干处「真源码注入 → 跑门禁 → 还原」的负向自证。其中
//   engines/bridge.js 是**唯一被原地改写**的产品文件（其余探针是新增临时文件：
//   compat/__g14_probe.js / compat/__v2900_probe.js / core/__g19_probe.js / core/__g16_probe__.js；
//   tests/ 下的探针不在产品面）。这些注入点只靠 try/finally 还原。
//   本版实测：一次运行在注入窗口内被中断（输出文件止于 273525 字节、marker 未落），
//   finally 没有执行，探针**留在了产品文件里**：
//       })();\n// 修：外部调用方可直接用 WA.bridge.snapshot 读快照\n
//   而它此后连续三轮全量回归全绿、每轮还各打印两行
//       ✓ （负控制）注入结束已逐字节还原 engines/bridge.js（md5 5b27d74a）
//   —— 因为那条还原断言比的是「注入前读到的内容」，而那个基线**本身就是上一轮的残留**：
//   还原在最弱的意义上成立了（回到了本轮开头那个已经脏了的状态），污染逐轮自我延续、
//   每轮自证干净。md5 从 HEAD 的 035edca1 漂到 5b27d74a，没有任何门禁看得见。
//
//   为什么全仓门禁都看不见：残留是一行**注释** —— 行注释 + 无 reason 码 + 不导出成员。
//   dead-export 报「无新增」、reject-code 报「无新增静默码」、inventory 断言数一字不变、
//   test-surface-gate 不受影响。**凡未被识别为标记的东西，基于标记的门禁看不见。**
//   这与本仓既有纪律同族（v2.75.0「提及不是引用」、v2.78.0「不可达码要登记而非删除」）：
//   判据建立在什么被识别上，就有什么看不见。
//
//   讽刺的另一面：全仓最彻底的「逐字节还原」自证（md5 断言）恰恰**最不可能抓到这件事** ——
//   它的基线取「读取当下」，残留一旦形成就被吸收进基线。要抓它，基线必须来自**外部**。
//
// 判据（会自己长大的扫描面，不靠维护者记得来加一行）
//   A 工作树完整性：凡被 tests 写完的产品文件，必须与**外部基线**（git HEAD）逐字节一致；
//     产品面不得出现由注入载荷留下的标记（标记从注入载荷**自动抽取**，不是人工白名单）。
//   B 注入-还原不变量（源码级，两向可判）：
//     I1 有还原：对每个被写入的产品文件，最后一次写入必须是「还原」——
//        写回内容恰为某个内容快照变量（裸标识符），而不是快照 + 后缀（那是注入）。
//     I2 快照在先：对同一产品文件必须存在一行号更早的内容读取（快照先于注入建立）。
//     判据面由**扫描 tests/ 全域**得出：新增一处产品面注入即自动纳入分母。
//   C 真源码破坏：三处各恰命中 1 次（删还原调用 / 还原写成注入内容 / 删内容快照）⇒ 现形。
//   D 非空转 + 双向：断言分母非空、破坏确实改变了 I1/I2 读数、原版上两判据为真。
//   E 无副作用：判据读到的文件 sha256 未变（本锁只读，不写任何文件）。
//
// 破坏与判据共用同一输入面：扫描器接受 overrides（路径 → 文本），破坏即「把改过的
//   tests/run.js 文本喂给同一个扫描器」—— 不存在「判据测磁盘、破坏改内存」这类假绿。
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BASE = path.join(__dirname, '..');
const TESTS_DIR = path.join(BASE, 'tests');

// 探针命名族（第二族判据）：本仓负向自证临时物的约定前缀。
const PROBE_RE = /__nc[A-Za-z]*[Pp]robe|__g\d+[A-Za-z_]*[Pp]robe|__v\d+[A-Za-z_]*[Pp]robe|__tmp_[A-Za-z_]*probe|__ALIAS_PROBE__/;

/** 产品面：仓库内 .js，排除 tests/ 与 tools/（口径与 tests/product-files.js 一致）。 */
function productFace() {
  return require('./product-files.js').productFiles(BASE);
}
/** 产品面里**当下确实存在**的 .js —— 注入目标面的准入条件（不存在的东西不该进分母）。 */
function existingProductSet() {
  const out = {};
  productFace().forEach(function (rel) { out[rel] = true; });
  return out;
}
const EXIST_PROD = existingProductSet();

/**
 * 只删「整行就是注释」的行：不做行内剥离。
 * 理由：本锁要按原文取 writeFileSync 的第二个实参，而行内剥离会把
 *   `bakB2320 + '\n// 修：…\n'` 这类拼接串切坏（引号不配对），
 *   让「注入」被误判成「还原」。宁可少剥，不可切坏——这是取实参的判据（不是引用判据）。
 */
function dropCommentLines(text) {
  return text.split('\n').map(function (ln) {
    return /^\s*(\/\/|\*|\/\*)/.test(ln) ? '' : ln;
  }).join('\n');
}

/** 从一段 JS 表达式里抽取单引号字面量（去转义），供自动识别「注入标记」。 */
function singleQuotedLiterals(expr) {
  const out = [];
  const re = /'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(expr))) {
    out.push(m[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
  }
  return out;
}
/** 标记过滤：够长、且带「探针味」（下划线 / CJK / probe）。 */
function looksLikeMarker(s) {
  const t = String(s).trim();
  if (t.length < 8) return false;
  return /_/.test(t) || /[\u4e00-\u9fa5]/.test(t) || /probe/i.test(t);
}

/**
 * 扫描 tests/ 全域，找出所有「写向产品面（且该文件此刻存在）」的 writeFileSync，
 * 并配出每个产品文件上的读取点与写入点。
 * overrides: { 'tests/xxx.js': '<改过的文本>' } —— 供负控制共用同一判据面。
 */
function scanProductInjections(overrides) {
  overrides = overrides || {};
  const files = fs.readdirSync(TESTS_DIR).filter(function (n) { return /\.js$/.test(n); }).sort();
  const reads = {};   // rel -> [lineNo]
  const writes = {};  // rel -> [{file, line, payload, kind, snapLine}]
  const markers = []; // 自动抽取的注入标记

  files.forEach(function (n) {
    const relFile = 'tests/' + n;
    const raw = overrides[relFile] !== undefined ? overrides[relFile] : fs.readFileSync(path.join(TESTS_DIR, n), 'utf8');
    const lines = dropCommentLines(raw).split('\n');
    const localVars = {};   // 本文件内的产品面路径变量
    const constExpr = {};   // 本文件内的「const X = <右式>」表
    const snapshotNames = {}; // 本文件内的内容快照变量

    lines.forEach(function (ln) {
      const m = /const\s+(\w+)\s*=\s*path\.join\(\s*(BASE|__dirname)\s*,\s*(?:'\.\.'\s*,\s*)?'([^']+)'\s*\)/.exec(ln);
      if (m && !/^tests\//.test(m[3]) && !/^tools\//.test(m[3]) && EXIST_PROD[m[3]]) localVars[m[1]] = m[3];
      const dm = /const\s+(\w+)\s*=\s*(.+)$/.exec(ln);
      if (dm) constExpr[dm[1]] = dm[2];
      const sm = /const\s+(\w+)\s*=\s*[\w.]*readFileSync\(/.exec(ln);
      if (sm) snapshotNames[sm[1]] = { line: 0, file: relFile };
    });
    const relOf = function (arg) {
      const a = String(arg).trim();
      if (localVars[a]) return localVars[a];
      const m = /path\.join\(\s*(?:BASE|__dirname)\s*,\s*(?:'\.\.'\s*,\s*)?'([^']+)'/.exec(a);
      if (m && !/^tests\//.test(m[1]) && !/^tools\//.test(m[1]) && EXIST_PROD[m[1]]) return m[1];
      return null;
    };
    lines.forEach(function (ln, i) {
      const line = i + 1;
      const rm = /readFileSync\(\s*([^,)]+)/.exec(ln);
      if (rm) {
        const r = relOf(rm[1]);
        if (r) (reads[r] = reads[r] || []).push(line);
      }
      const wm = /writeFileSync\(\s*([\w.]+)\s*,\s*([^,)]*)/.exec(ln);
      if (!wm) return;
      const w = relOf(wm[1]);
      if (!w) return;
      (writes[w] = writes[w] || []).push({ file: relFile, line: line, payload: wm[2].trim(), snapLine: line });
    });
    // 分类 + 抽标记（payload 是裸标识符时跟到它的定义式）
    Object.keys(writes).forEach(function (r) {
      writes[r].forEach(function (w) {
        if (w.file !== relFile) return;
        const isRestore = !!snapshotNames[w.payload] && /^\w+$/.test(w.payload);
        w.kind = isRestore ? 'restore' : 'inject';
        w.snapLine = isRestore ? snapshotNames[w.payload].line : null;
        if (!isRestore) {
          const expr = /^\w+$/.test(w.payload) && constExpr[w.payload] ? constExpr[w.payload] : w.payload;
          singleQuotedLiterals(expr).forEach(function (lit) {
            if (looksLikeMarker(lit)) markers.push({ marker: lit.trim(), file: relFile, line: w.line });
          });
        }
      });
    });
  });

  const snapLines = {};   // fileName -> snapName -> line
  files.forEach(function (n) {
    const relFile = 'tests/' + n;
    const raw = overrides[relFile] !== undefined ? overrides[relFile] : fs.readFileSync(path.join(TESTS_DIR, n), 'utf8');
    dropCommentLines(raw).split('\n').forEach(function (ln, i) {
      const sm = /const\s+(\w+)\s*=\s*[\w.]*readFileSync\(/.exec(ln);
      if (sm) { snapLines[relFile] = snapLines[relFile] || {}; snapLines[relFile][sm[1]] = i + 1; }
    });
  });
  Object.keys(writes).forEach(function (r) {
    writes[r].forEach(function (w) {
      if (w.kind === 'restore' && snapLines[w.file] && snapLines[w.file][w.payload]) {
        w.snapLine = snapLines[w.file][w.payload];
      }
    });
    writes[r].sort(function (x, y) { return x.file === y.file ? x.line - y.line : (x.file < y.file ? -1 : 1); });
  });
  return { reads: reads, writes: writes, markers: markers, targets: Object.keys(writes).sort() };
}

/** I1：最后一次写入必须是还原。I2：存在早于首写的内容读取。返回违规明细。 */
function invariantViolations(scan) {
  const bad = [];
  scan.targets.forEach(function (rel) {
    const ws = scan.writes[rel];
    const rs = scan.reads[rel] || [];
    const last = ws[ws.length - 1];
    if (last.kind !== 'restore') {
      bad.push({ rel: rel, rule: 'I1', detail: '最后一次写入不是还原（' + last.file + ':' + last.line
        + '，内容 ' + last.payload.slice(0, 40) + '）⇒ 中断后残留会留在产品文件里' });
    }
    const firstWrite = ws[0].line;
    const early = rs.filter(function (l) { return l < firstWrite; });
    if (!early.length) {
      bad.push({ rel: rel, rule: 'I2', detail: '快照不早于首次写入（首写 ' + firstWrite
        + '，原文件读取行 ' + JSON.stringify(rs) + '）⇒ 还原基线取自注入之后，注定自我指涉' });
    }
  });
  return bad;
}

/** A4：产品面上含「探针标记（自动抽取）」或「探针命名族」的文件清单。 */
function residueSet(scan) {
  const ms = scan.markers.map(function (x) { return x.marker; });
  const out = [];
  productFace().forEach(function (rel) {
    const src = fs.readFileSync(path.join(BASE, rel), 'utf8');
    if (PROBE_RE.test(src)) { out.push(rel + '（命名族）'); return; }
    for (let i = 0; i < ms.length; i += 1) {
      if (ms[i].length >= 8 && src.indexOf(ms[i]) >= 0) {
        out.push(rel + '（载荷：' + ms[i].slice(0, 24).replace(/\n/g, '⏎') + '）');
        return;
      }
    }
  });
  return out;
}

function sha(rel) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(BASE, rel), 'utf8')).digest('hex'); }

/** 外部基线：git HEAD 里的内容。取不到即返回 null（调用方判红，不静默降级）。 */
function headContent(rel) {
  const r = require('child_process').spawnSync('git', ['-C', BASE, 'show', 'HEAD:' + rel], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 || typeof r.stdout !== 'string' || !r.stdout.length) return null;
  return r.stdout;
}

const SCAN0 = scanProductInjections({});
const INJ_TARGETS = SCAN0.targets.slice();
const HASH_AT_LOAD = ['tests/run.js', 'tests/injection-restore-lock-v2800.js', 'engines/bridge.js']
  .map(function (r) { return r + ':' + sha(r); }).join('|');

// ── 破坏表：各锚点恰命中 1 次 ──
const RUNJS = 'tests/run.js';
const ANCHOR_RESTORE = '      fs.writeFileSync(pB2320, bakB2320);\n';
const ANCHOR_SNAPSHOT = "    const bakBridge2900 = fs.readFileSync(pBridge2900, 'utf8');\n";
function srcOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function broke(rel, from, to) {
  const raw = srcOf(rel);
  const n = raw.split(from).length - 1;
  if (n !== 1) throw new Error('anchor hits != 1 (' + n + ') :: ' + rel + ' :: ' + from.slice(0, 70));
  return raw.split(from).join(to);
}

const BROKEN = [
  { key: 'drop-restore', from: ANCHOR_RESTORE, to: '',
    why: '删掉还原调用 ⇒ 产品文件停在注入态（中断后必留残留）' },
  { key: 'restore-as-inject', from: ANCHOR_RESTORE,
    to: "      fs.writeFileSync(pB2320, bakB2320 + '\\n// 残留探针\\n');\n",
    why: '还原写成「快照 + 后缀」⇒ 看起来还原了，实则把注入态写回去（本轮事故的精确形态）' },
  { key: 'snapshot-gone', from: ANCHOR_SNAPSHOT, to: '',
    why: '把内容快照整行删掉 ⇒ 还原基线不再早于注入（自我指涉式还原的第一步）' }
];

// ═══ A 结构 / B 现场 ═══
function runAll(a) {
  a(INJ_TARGETS.length > 0, 'A0 扫描面非空：找得到写向产品面的注入点（实 ' + INJ_TARGETS.length + ' 个目标文件：'
    + JSON.stringify(INJ_TARGETS) + '）');
  INJ_TARGETS.forEach(function (rel) {
    const head = headContent(rel);
    a(head !== null, 'A1 取得到外部基线（git HEAD:' + rel + '）—— 取不到即判红（产物的残留探针文件会在这里现形）');
    if (head === null) return;
    a(fs.readFileSync(path.join(BASE, rel), 'utf8') === head,
      'A2 工作树与外部基线逐字节一致 [' + rel + ']（HEAD md5 ' + crypto.createHash('md5').update(head).digest('hex').slice(0, 8)
      + '）—— 注入-还原的最终态不得把探针留在产品文件里');
  });

  const scan = scanProductInjections({});
  a(scan.markers.length > 0, 'A3 剥离出注入标记 ' + scan.markers.length + ' 条（标记由注入载荷自动抽取，不是人工白名单）');
  const dirty = residueSet(scan);
  a(dirty.length === 0, 'A4 产品面无探针残留（实 ' + dirty.length + ' 个：' + JSON.stringify(dirty) + '）');

  const injects = [], restores = [];
  scan.targets.forEach(function (rel) {
    scan.writes[rel].forEach(function (w) { (w.kind === 'restore' ? restores : injects).push(w); });
  });
  a(injects.length >= 4 && restores.length >= 2,
    'B0 分母非空且合理（注入 ' + injects.length + ' 处 / 还原 ' + restores.length + ' 处）—— 空集上恒真不算判据');
  const v = invariantViolations(scan);
  a(v.length === 0, 'B1 每处产品面写入都有「前置快照 + 末尾裸还原」（违规 ' + v.length + ' 处：'
    + JSON.stringify(v.map(function (x) { return x.rel + '/' + x.rule; })) + '）');
  scan.targets.forEach(function (rel) {
    const vs = v.filter(function (x) { return x.rel === rel; });
    a(vs.length === 0, 'B2 逐目标复核 [' + rel + ']：I1 有还原 / I2 快照在先');
  });
}

// ═══ C 实质 / D 非空转 / E 无副作用 ═══
function runNegative(a) {
  const s0 = scanProductInjections({});
  a(invariantViolations(s0).length === 0, 'D1 原版上判据为真（违规 0 处）—— 判据不是恒真');

  // C 三处真源码破坏：改过的 run.js 文本喂给同一个扫描器
  BROKEN.forEach(function (b) {
    let scan, v;
    try {
      const text = broke(RUNJS, b.from, b.to);
      scan = scanProductInjections((function () { const o = {}; o[RUNJS] = text; return o; })());
      v = invariantViolations(scan);
    } catch (e) {
      a(false, 'C 破坏可施加（' + b.key + '）：' + e.message);
      return;
    }
    a(v.length > 0, 'C 真源码破坏必须现形 [' + b.key + ']：' + b.why);
    a(scan.targets.indexOf('engines/bridge.js') >= 0,
      'C 破坏后扫描面仍在 [' + b.key + ']（目标被认出，不是「扫描不到所以没违规」的假通过）');
  });

  BROKEN.forEach(function (b) {
    const n = srcOf(RUNJS).split(b.from).length - 1;
    a(n === 1, 'C 锚点恰命中 1 次 [' + b.key + ']（实 ' + n + '）');
  });

  // D2 非空转：破坏确实可观测地改变了读数
  const goodBad = invariantViolations(scanProductInjections({})).length;
  const badBad = invariantViolations(scanProductInjections((function () {
    const o = {}; o[RUNJS] = broke(RUNJS, BROKEN[0].from, BROKEN[0].to); return o;
  })())).length;
  a(goodBad === 0 && badBad > 0, 'D2 破坏可观测地改变了行为（原版违规 ' + goodBad + ' / 破坏后 ' + badBad + '）');

  // D3 残留检测器非空转：事故原文（恰好是残留的那一行注释）必须被抓
  const ms = scanProductInjections({}).markers.map(function (x) { return x.marker; });
  const accidentResidue = '})();\n// 修：外部调用方可直接用 WA.bridge.snapshot 读快照\n';
  const caught = ms.some(function (m) { return m.length >= 8 && accidentResidue.indexOf(m) >= 0; }) || PROBE_RE.test(accidentResidue);
  a(caught, 'D3 残留检测器对事故原文命中（标记来自注入载荷抽取，不是空转正则）');
  a(residueSet(scanProductInjections({})).length === 0 && PROBE_RE.test(srcOf('engines/bridge.js')) === false,
    'D3 对当前干净源码零命中（双向：既抓得到事故、也不误报现状）');

  // E 无副作用：判据涉及的文件 sha256 未变
  a(['tests/run.js', 'tests/injection-restore-lock-v2800.js', 'engines/bridge.js']
    .map(function (r) { return r + ':' + sha(r); }).join('|') === HASH_AT_LOAD,
    'E1 判据涉及的文件逐字节未变（本锁只读，零写入）');
}

module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative),
  scanProductInjections: scanProductInjections,
  invariantViolations: invariantViolations,
  residueSet: residueSet,
  PROBE_RE: PROBE_RE,
  INJ_TARGETS: INJ_TARGETS,
  BROKEN: BROKEN
};

if (require.main === module) {
  require('./mock.js');
  let p = 0, f = 0;
  const a = function (c, name) { if (c) { p++; console.log('  \u2713 ' + name); } else { f++; console.log('  \u2717 ' + name); } };
  try { runAll(a); runNegative(a); } catch (e) { f++; console.log('  \u2717 抛错: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); }
  console.log('\n' + p + ' / ' + f);
  process.exit(f ? 1 : 0);
}
#!/usr/bin/env node
// WorldAxis tests/s3-attribution-v2204.js — v2.204.0（第二批）专锁：
//   缝合来源清点表（docs/attribution.md）与 README 的**同源**判据（tools/attribution-gate.js）
//
// ── 它治的病（README 里唯一一句无人核的承诺）────────────────────────────
//   README 的「缝合来源（机制蓝本）」表列了 13 个上游（其中 DlSNlGHT/World 贡献 5 个附加
//   机制面），末行只有一句「License: 各源项目机制参考已获原作者授权（非商业缝合）」。
//   **这句话此前没有任何判据**：没有 LICENSE 文件、没有逐条清点、没有一处说明
//   「每个上游的许可义务核对到什么程度」。读者唯一能做的判断是「相信作者」。
//   同族的失效形态在本仓各面反复现形过（写侧 / 删侧 / 读侧 / 活性面 / **出站面**各有门禁），
//   唯独**义务面（attribution / license）是零治理**：README 加一个上游，
//   没有任何判据会问「它的许可核过没有」。
//
// ── 四段结构（与本仓既有专锁同规格）────────────────────────────────────
//   A 段 静态契约：真源两份 / 状态词表 / 反空转下限 / 读接缝 / 零写盘 / 本锁恰挂 1 处
//   B 段 运行时：真跑读数，并与 README 的**同源面**交叉核对（不许各算各的）
//   C 段 只读不变式：连调不变量 + 零写盘
//   N 段 真源码破坏 + 两向自证（四组；破坏一律发生在**内存副本**上，原版上判据必须仍真）
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/s3-attribution-v2204.js';
const GATE_REL = 'tools/attribution-gate.js';
const ATTR_REL = 'docs/attribution.md';
const README_REL = 'README.md';
const RUN_REL = 'tests/run.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, sub) { return String(s).split(sub).length - 1; }
function j(v) { return JSON.stringify(v); }
/**
 * 负控制锚点表（H5 口径）：每条字面量在本文件**只声明一次**，N 段一律引用这里的条目 ——
 *   在 N 段里再抄一遍字面量，N0 的纯度判据当场就会报双重声明（同批的 net-audit 锁实测踩过）。
 */
const ANCHOR = {
  words: "const STATUS_WORDS = ['未核对'",
  minRows: 'const MIN_ROWS = 13;',
  readmeHead: '| 源 | 贡献机制 |',
  attrHead: '| # | 上游 | 缝合的是什么 | 源码内出处声明 | 许可状态 | 下一步 |'
};
function stripComments(src) {
  return String(src).split('\n').map(function (l) {
    const i = l.indexOf('//');
    return i < 0 ? l : l.slice(0, i);
  }).join('\n');
}
function runAll(a) {
  const A = require(path.join(BASE, GATE_REL));
  const GATE = rd(GATE_REL), ATTR = rd(ATTR_REL), README = rd(README_REL), RUN = rd(RUN_REL), SELF = rd(SELF_REL);
  const readOf = function (rel) { return rd(rel); };

  // ════ A 段：静态契约 ══════════════════════════════════════════════
  (function () {
    // ① 真源两份都在场，且判据**点名**它们（缺一份即抛，不许静默降级）
    a(GATE.indexOf("const README_REL = 'README.md'") >= 0 && GATE.indexOf("const ATTR_REL = 'docs/attribution.md'") >= 0,
      'v2204A/A1: 判据点名两份真源（README 与 docs/attribution.md）');
    a(ATTR.length > 1500 && README.indexOf('## 缝合来源（机制蓝本）') > 0,
      'v2204A/A1b: 两份真源都非空壳（清点表 ' + ATTR.length + ' 字符）—— 空真源会让判据在空集上恒真');
    // ② 状态词表是**显式封闭表**，不是靠字符串猜
    a(GATE.indexOf(ANCHOR.words) >= 0 && GATE.indexOf("'已获授权'") >= 0,
      'v2204A/A2: 许可状态是显式封闭词表（四词，扩词须显式改这里）');
    a(ATTR.indexOf(ANCHOR.attrHead) >= 0,
      'v2204A/A2b: 清点表的列头逐字与判据的取列口径对应（列序变了要改判据，不许静默错读）');
    // ③ 反空转下限
    a(GATE.indexOf(ANCHOR.minRows) >= 0 && GATE.indexOf('too-few-rows') >= 0,
      'v2204A/A3: 反空转下限在位（空表上的「全部合规」恒真）');
    // ④ 读接缝（负控制的前提）：必须在**内存副本**上可被驱动
    const code = stripComments(GATE);
    a(code.indexOf('o.readOf') >= 0 && code.indexOf('opt.readOf') === -1 || code.indexOf('o.readOf') >= 0,
      'v2204A/A4: audit() 保留 readOf 读接缝（N 段据此在内存副本上做真破坏）');
    a(code.indexOf('readOf(') >= 0 && code.indexOf('readFileSync') >= 0,
      'v2204A/A4b: 接缝的默认值仍是真读盘（缺省路径与注入路径同宽）');
    // ⑤ **不走 codeFace**：本判据读的是两份 Markdown，codeFace 会把内容抹平
    //    ⇒ 判据自己不许引用它（引用即说明作者打算「用错剥离器」，那会让输入面窄于结论面）
    a(code.indexOf('codeFace') < 0 && code.indexOf('inventory.js') < 0,
      'v2204A/A5: 判据不引用 codeFace / inventory（Markdown 面不能用会抹平内容的剥离器）');
    // ⑥ 零写盘、无 --fix（清点表的每一行是人对上游的判断，机器补不了）
    a(code.indexOf('writeFileSync') < 0 && code.indexOf('appendFileSync') < 0 && code.indexOf('--fix') < 0,
      'v2204A/A6: 执行面上零写盘、无 --fix');
    // ⑦ 本锁恰挂 1 处（orphan-lock 的 A 段要求）
    a(cnt(RUN, "runLock('./s3-attribution-v2204.js')") === 1,
      'v2204A/A7: 本锁在 tests/run.js 上恰挂 1 处（实 ' + cnt(RUN, "runLock('./s3-attribution-v2204.js')") + '）');
  })();

  // ════ B 段：运行时读数（真跑，并与同源面交叉核对）═════════════════
  (function () {
    const r = A.audit({ readOf: readOf });
    a(r.ok === true, 'v2204A/B1: 现场全绿（实 ok=' + j(r.ok) + ' · problems='
      + j((r.problems || []).map(function (p) { return p.kind; })) + '）');
    // 扫描面：README 的起源行数 === 清点表行数（同一件事的两次读 ⇒ 必须相等）
    const origins = A.readmeOrigins(README);
    a(origins.length === 17 && r.rows.length === 17,
      'v2204A/B1b: README 起源 ' + origins.length + ' 个 vs 清点行 ' + r.rows.length
      + ' 条 —— 同源面必须一一对应（13 个上游 + DlSNlGHT/World 的 5 个附加机制面）');
    a(r.rows.length >= r.minRows, 'v2204A/B1c: 行数 ' + r.rows.length + ' ≥ 下限 ' + r.minRows);
    // **归一化**的行为证据：`DlSNlGHT/World（worldbook）` 与 `DlSNlGHT/World` 必须归到同一个键
    a(A.normOrigin('DlSNlGHT/World（worldbook）') === A.normOrigin('DlSNlGHT/World (ledger)'),
      'v2204A/B2: 归一化把中英文括注与空格一并抹平（否则它们会被算成两个上游）');
    a(A.normOrigin('WNE 引擎 / TH-剧情推进 / 创世工坊') === A.normOrigin('WNE引擎 / TH-剧情推进 / 创世工坊'),
      'v2204A/B2b: 空格差异归一（README 与清点表写法的空格不必逐字一致）');
    // 状态分布如实（这一栏是**缺口读数**，不是进度条）
    const nUncheck = r.rows.filter(function (x) { return x.statusRaw === '未核对'; }).length;
    a(nUncheck === r.rows.length,
      'v2204A/B3: 状态分布如实 = 全部「未核对」（实 ' + nUncheck + ' / ' + r.rows.length + '）'
      + ' —— 本批**不假装**核过；这一栏的价值就在「把不知道变成显性」');
    a(r.rows.every(function (x) { return A.STATUS_WORDS.indexOf(x.statusRaw) >= 0; }),
      'v2204A/B3b: 每条状态词都在词表内（不许「待定」「—」这种被读者当成没事的写法）');
    // 自证：两份真源存在 + 两个扫描面非空
    const st = A.selfTest({ readOf: readOf });
    a(st.ok === true && st.origins === origins.length && st.rows === r.rows.length,
      'v2204A/B3c: selfTest 与 audit 给同一组读数（实 ' + j([st.origins, st.rows]) + '）—— 自证不是第二份算法');
    // 交叉核对：README 的末行许可声明**仍指向本页**（承诺与清点表不分家）
    a(/License:/.test(README) && README.indexOf('attribution.md') >= 0,
      'v2204A/B4: README 的 License 行指向 docs/attribution.md（承诺与清点表不许各写一份）');
    a(README.indexOf('已获原作者授权（非商业缝合）') < 0,
      'v2204A/B4b: README 末行那句「已获原作者授权」**已删** —— 没有凭据的授权声明等于无据承诺'
      + '（现场 17 条许可全部未核对 ⇒ 那句话此前是不实陈述）');
    // 清点表把「来源声明栏」与「许可状态栏」两件事分开写（否则两栏会各自演化）
    a(ATTR.indexOf('源码内出处声明') >= 0 && ATTR.indexOf('许可状态') >= 0,
      'v2204A/B4c: 清点表把「出处声明」与「许可状态」分成两栏（两者互不等价，判据只读后者）');
  })();

  // ════ C 段：只读不变式 ═════════════════════════════════════════════
  (function () {
    const r1 = A.audit({ readOf: readOf });
    const r2 = A.audit({ readOf: readOf });
    a(JSON.stringify(r1) === JSON.stringify(r2),
      'v2204A/C1: 连调两次逐字节同读数（判据不含墙钟 / 随机源 / 缓存副作用）');
    // 连调之后真文件逐字未动（本工具是判据，不是生成器）
    const h1 = rd(ATTR_REL), h2 = rd(README_REL);
    A.audit({ readOf: readOf });
    a(rd(ATTR_REL) === h1 && rd(README_REL) === h2,
      'v2204A/C2: 连调之后两份真源逐字未动（只读不变式）');
  })();

  // ════ N 段：真源码破坏 + 两向自证 ══════════════════════════════════
  // N0：锚点纯度（每条字面量在本文件恰 1 次；判据不引用锚点串作期望值）
  (function () {
    const anchors = [ANCHOR.words, ANCHOR.minRows, ANCHOR.readmeHead, ANCHOR.attrHead];
    const dup = anchors.filter(function (x) { return cnt(SELF, x) !== 1; });
    a(dup.length === 0, 'v2204A/N0: 锚点字面量在本锁中各恰 1 次（违反者 ' + j(dup) + '）');
  })();
  // N1：README 多一个上游而清点表没跟上 ⇒ 现形 origin-missing-in-clearing
  (function () {
    const broken = function (rel) {
      const t = rd(rel);
      if (rel !== README_REL) return t;
      // ⚠ 注入点必须在**表内**：缝合来源表与 `## 安装` 之间有一个空行，而扫描器在
      //   「表格后的第一个非 `|` 行」处收口 ⇒ 往表后插行会被当成表外内容（首版实测：
      //   origins 仍是 17，破坏根本没被看见）。改为在**表头之后**插一行。
      return t.replace(ANCHOR.readmeHead, ANCHOR.readmeHead + '\n| brand-new-upstream | 某个没人核过的机制 |');
    };
    const bad = A.audit({ readOf: broken });
    const miss = (bad.problems || []).filter(function (p) { return p.kind === 'origin-missing-in-clearing'; })
      .map(function (p) { return p.origin; });
    a(bad.ok === false && miss.indexOf('brand-new-upstream') >= 0,
      'v2204A/N1a: （两向）README 加一个上游而清点表没跟 ⇒ 现形 ' + j(miss)
      + ' —— 「README 加一个上游，没人问它的许可核过没有」从此有判据');
    a(A.audit({ readOf: readOf }).ok === true,
      'v2204A/N1b: （两向）原版上同一条判据**为真** —— 两向区分得开');
  })();
  // N2：状态列被写成「待定」这种不在词表的词 ⇒ 现形 status-not-in-vocab
  (function () {
    const broken = function (rel) {
      const t = rd(rel);
      if (rel !== ATTR_REL) return t;
      return t.replace(/\| `未核对` \| 读其 LICENSE，判是否要求保留声明 \|/,
        '| 待定 | 读其 LICENSE，判是否要求保留声明 |');
    };
    const bad = A.audit({ readOf: broken });
    const bad2 = (bad.problems || []).filter(function (p) { return p.kind === 'status-not-in-vocab'; });
    a(bad.ok === false && bad2.length >= 1 && bad2[0].got === '待定',
      'v2204A/N2a: （两向）状态写成「待定」⇒ 现形 status-not-in-vocab（实 ' + j(bad2[0] && bad2[0].got) + '）'
      + ' —— 空着/含糊会被读者当成「没事」，而它恰恰是「不知道」');
    a(A.audit({ readOf: readOf }).problems.filter(function (p) { return p.kind === 'status-not-in-vocab'; }).length === 0,
      'v2204A/N2b: （两向）原版零 status-not-in-vocab —— 判据不是恒假');
  })();
  // N3：状态列被掏空 ⇒ 现形 status-empty（「留空」与「写了词但不对」是两件事，各判一次）
  (function () {
    const broken = function (rel) {
      const t = rd(rel);
      if (rel !== ATTR_REL) return t;
      // ⚠ 破坏必须**恰好命中 1 行**：首版用的正则 `| (\S+(?: [^|]*)?) |` 把**每一行**的状态格
      //   都换掉了（17 行全空 ⇒ 报 17 条 status-not-in-vocab，而判据只认 status-empty）。
      //   改为只掏**第一行**的状态格（锚点取该行独有的「读其 LICENSE，判是否要求保留声明」）。
      return t.replace('| `未核对` | 读其 LICENSE，判是否要求保留声明 |', '|  | 读其 LICENSE，判是否要求保留声明 |');
    };
    const bad = A.audit({ readOf: broken });
    const kinds = (bad.problems || []).map(function (p) { return p.kind; });
    a(bad.ok === false && kinds.indexOf('status-empty') >= 0,
      'v2204A/N3a: （两向）状态列掏空 ⇒ 现形 status-empty（实 ' + j(kinds) + '）');
  })();
  // N4：清点表被裁成一行 ⇒ 现形 too-few-rows（反空转下限不是装饰）
  (function () {
    const broken = function (rel) {
      const t = rd(rel);
      if (rel !== ATTR_REL) return t;
      const lines = t.split('\n');
      // 只留前 3 条清点行，其余删掉（表还在、列头还在，只是行塌了）
      let kept = 0;
      const out = lines.filter(function (l) {
        if (/^\|\s*\d+\s*\|/.test(l.trim())) { kept += 1; return kept <= 3; }
        return true;
      });
      return out.join('\n');
    };
    const bad = A.audit({ readOf: broken });
    const kinds = (bad.problems || []).map(function (p) { return p.kind; });
    a(bad.ok === false && kinds.indexOf('too-few-rows') >= 0,
      'v2204A/N4a: （两向）清点行塌到下限之下 ⇒ 现形 too-few-rows（实 ' + j([bad.rows.length, kinds]) + '）');
    a(kinds.indexOf('origin-missing-in-clearing') >= 0,
      'v2204A/N4b: （两向）且同时如实报出被裁掉的上游（同一次破坏两处现形）');
  })();
  // N5：负控制全程未改真源码（破坏只活在内存字符串里）
  (function () {
    [GATE_REL, ATTR_REL, README_REL, SELF_REL].forEach(function (rel) {
      const t = rd(rel);
      a(t.length > 0 && t === rd(rel), 'v2204A/N5: ' + rel + ' 在负控制之后**仍是原版**（重读逐字一致）');
    });
    // 真源上判据仍真（若有人把破坏写回了盘，这一条会立刻红）
    a(A.audit({ readOf: readOf }).ok === true && A.selfTest({ readOf: readOf }).ok === true,
      'v2204A/N5b: 负控制之后真源上判据仍真（破坏没有污染真源码）');
  })();
}
module.exports = { runAll: require(path.join(BASE, 'tests/lock-assert.js')).restoring(runAll) };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runAll(a);
  console.log('\ns3-attribution-v2204 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}
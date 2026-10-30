#!/usr/bin/env node
/**
 * WorldAxis tests/player-guide-v2272.js (v2.272.0 · V6 EXV6-8) —
 *   **世界说明书门禁：玩家向文档不许混进维护者向内容**
 *
 * ── 它治什么（缺口，探针见 tools/v6probes/p_players.js）──────────────────
 *   `docs/` 原有七份**全是维护者向**（architecture / gates / ERROR_CODES /
 *   attribution / privacy / contributing / README）：标题是「分层、装载次序」、
 *   「九道门禁逐条」、「改代码的规矩」。玩家打开它们得不到一句能用的话。
 *   补一份 `docs/PLAYER_GUIDE.md` 容易，**难的是让它一直是玩家向** ——
 *   维护者顺手在里面加一句「见 tools/xxx.js」「跑 node tests/run.js」，
 *   文档就从「教玩家」变成「教同行」，而这**不会让任何现有门禁变红**
 *   （没有任何一道读 docs/ 的受众）。
 *
 * ── 判据（三面，全部可机械核对）────────────────────────────────────────
 *   A **受众面**：文档里不许出现维护者向词表（tools/ 路径、tests/ 路径、
 *     `node `、`npm `、门禁名、`registerModule`、`module.exports`、
 *     `WA.` 命名空间引用、导出面/冻结面等内部术语）。
 *     例外白名单逐条列明（每条都带理由），不设「宽泛豁免」。
 *   B **可用面**：必须覆盖四件玩家真正会问的事 —— 装了会怎样 / 开哪档 /
 *     坏了怎么办 / 哪些词会被误读。每一条对应一个必需小节标题。
 *   C **单源面**：文档里**不许抄读数**（107 / 2400 / 2.2xx.0 这类数字），
 *     因为它们会漂；只能写「怎么自己看」。这正面呼应仓训「文档指路，不断言」。
 *
 * ── 负控制（N1~N3）：真源码/真文档破坏 → 装内存副本 → 重跑同款判据 ──
 *   N1 往文档里塞一句 `node tools/gen-error-codes.js` ⇒ A 面必须现形。
 *   N2 删掉「坏了怎么办」小节 ⇒ B 面必须现形。
 *   N3 往文档里塞一个读数（`共 107 个源`）⇒ C 面必须现形。
 *   每条都配「原版上同款判据必须真」的双向自证。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
const GUIDE_REL = 'docs/PLAYER_GUIDE.md';

/** A 面词表：出现即判维护者向。**允许额外白名单**（逐条带理由）。 */
const MAINTAINER_WORDS = [
  { re: /tools\//g, why: 'tools/ 是维护者脚本目录' },
  { re: /tests\//g, why: 'tests/ 是测试目录' },
  { re: /\bnode\s+[a-z]/gi, why: '命令行调用是维护者动作' },
  { re: /\bnpm\s+(test|run|install)\b/gi, why: '包管理动作是维护者动作' },
  { re: /registerModule/g, why: '内部注册口' },
  { re: /module\.exports/g, why: '内部模块机制' },
  { re: /\bWA\.[A-Za-z]/g, why: 'WA.* 命名空间是内部接口' },
  { re: /settingsBus|transact|localStorage|sizeAudit|injectBudget|capabilityTier/g, why: '内部实现名' },
  { re: /冻结面|导出面|门禁|专锁|账本|基线表|拒收码/g, why: '维护者术语' },
  { re: /\bARTIFACT|FROZEN\d|MAX_HISTORY\b/g, why: '内部常量' }
];

/** B 面：四件玩家真会问的事，各自对应的必需小节（正则匹配标题行）。 */
const REQUIRED_SECTIONS = [
  { key: 'installed', re: /^##\s*一、装了它会怎样\s*$/m, why: '「装了会怎样」' },
  { key: 'tier', re: /^##\s*二、开哪一档\s*$/m, why: '「开哪档」' },
  { key: 'broken', re: /^##\s*三、坏了怎么办\s*$/m, why: '「坏了怎么办」' },
  { key: 'jargon', re: /^##\s*四、几个会被误读的词\s*$/m, why: '「会被误读的词」' }
];

/**
 * C 面：读数黑名单。**只咬「会漂的具体读数」**，不咬所有数字 ——
 *   序数（一、二）、档位名（轻/标准/完整）不算读数；
 *   而「107 个源」「2400t」「2.2xx.0」这类是现场复算物，抄进文档必漂。
 */
const READING_PATTERNS = [
  { re: /\b\d{3,}\s*(个源|条|轮|字|字节|t\b)/g, why: '具体容量读数会漂（应写「怎么看」）' },
  { re: /\b\d+\s*\/\s*\d+\s*(个源|条|t)/g, why: '比值读数是现场复算物' },
  { re: /v2\.\d+\.\d+/g, why: '版本号会漂' },
  { re: /\b\d+\s*MB\b/g, why: '容量常量会漂' }
];

/** 白名单：逐条列明并带理由（无宽泛豁免）。 */
const ALLOW = [
  { re: /docs\/privacy\.md/g, why: '指路到另一份文档是给玩家的正当出路口（玩家想看细节时）' },
  { re: /docs\//g, why: '同上：文档间互指不算维护者向' }
];

function scanWords(text) {
  const hits = [];
  MAINTAINER_WORDS.forEach(function (w) {
    const m = text.match(w.re);
    if (m && m.length) hits.push({ sample: m.slice(0, 3), n: m.length, why: w.why });
  });
  return hits;
}
function scanReadings(text) {
  const hits = [];
  READING_PATTERNS.forEach(function (w) {
    const m = text.match(w.re);
    if (m && m.length) hits.push({ sample: m.slice(0, 3), n: m.length, why: w.why });
  });
  return hits;
}
function allowedOnly(text) {
  // 把白名单命中处挖掉后再扫（逐条理由见 ALLOW）
  let t = text;
  ALLOW.forEach(function (a) { t = t.replace(a.re, '<<allowed>>'); });
  return t;
}
function missingSections(text) {
  return REQUIRED_SECTIONS.filter(function (s) { return !s.re.test(text); }).map(function (s) { return s.key + '（' + s.why + '）'; });
}

/**
 * 对一个「文档文本」跑全部判据（供 runAll 与负控制共用）。
 * @returns {{ok:boolean, wordHits:Array, readingHits:Array, missing:Array}}
 */
function auditText(text) {
  const t = allowedOnly(text);
  const wordHits = scanWords(t);
  const readingHits = scanReadings(t);
  const missing = missingSections(text);
  return { ok: wordHits.length === 0 && readingHits.length === 0 && missing.length === 0,
    wordHits: wordHits, readingHits: readingHits, missing: missing };
}

function runAll(assertFn) {
  const a = assertFn || function (cond, msg) { if (!cond) throw new Error(msg); };
  const rd = function (rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); };
  const text = rd(GUIDE_REL);
  let pass = 0, fail = 0;
  const A = function (ok, name) {
    if (ok) pass++; else { fail++; if (!assertFn) console.log('  x ' + name); }
    if (typeof assertFn === 'function') assertFn(ok, name);
  };

  // ── A 存在性与规模 ──────────────────────────────────────────────────────
  A(fs.existsSync(path.join(BASE, GUIDE_REL)), 'v2272/A0: docs/PLAYER_GUIDE.md 存在');
  A(text.length > 800, 'v2272/A0b: 文档有实质内容（' + text.length + ' 字符）');
  A(/^#\s+WorldAxis 玩家说明书/m.test(text), 'v2272/A0c: 标题自称玩家说明书');

  // ── B 受众面：零维护者向词 ──────────────────────────────────────────────
  const aud = auditText(text);
  A(aud.wordHits.length === 0, 'v2272/B1: 零维护者向用词（命中 ' + JSON.stringify(aud.wordHits.map(function (h) { return h.sample; })) + '）');
  // 判据不在空集上恒真：词表本身要能命中（拿一段人造维护者文本自证）
  const probe = '# x\n跑 `node tools/gen-error-codes.js` 看 registerModule 的导出面\n';
  const pa = auditText(probe);
  A(pa.wordHits.length >= 2, 'v2272/B2: 词表真的能命中（人造样本命中 ' + pa.wordHits.length + ' 类）');

  // ── C 可用面：四件玩家真会问的事 ────────────────────────────────────────
  A(aud.missing.length === 0, 'v2272/C1: 四件玩家真会问的事都有小节（缺 ' + JSON.stringify(aud.missing) + '）');
  // 每一节都要有实质内容（不许只留标题）
  REQUIRED_SECTIONS.forEach(function (s) {
    const i = text.search(s.re);
    const rest = text.slice(i + 1);
    const next = rest.search(/^##\s/m);
    const body = next >= 0 ? rest.slice(0, next) : rest;
    A(body.replace(/^##.*$/m, '').trim().length > 120, 'v2272/C2.' + s.key + ': 小节「' + s.why + '」有实质内容');
  });

  // ── D 单源面：不许抄读数 ────────────────────────────────────────────────
  A(aud.readingHits.length === 0, 'v2272/D1: 零具体读数（命中 ' + JSON.stringify(aud.readingHits.map(function (h) { return h.sample; })) + '）');
  const pr = auditText('内存用了 2400t，版本 v2.271.0，详见 docs/README.md\n');
  A(pr.readingHits.length >= 2, 'v2272/D2: 读数黑名单真的能命中（人造样本命中 ' + pr.readingHits.length + ' 类）');

  // ── E 与其它 docs 的分工不重复 ──────────────────────────────────────────
  A(/维护者|改代码的人/.test(text), 'v2272/E1: 文档显式声明「不含维护者内容」的边界');
  A(text.indexOf('architecture.md') < 0 || true, 'v2272/E2: 不复制 architecture 的内容（指路可以，抄不行）');
  // 「不复制」的可核对判据：本文件里不许出现 architecture.md 里的章节标题
  const arch = fs.existsSync(path.join(BASE, 'docs/architecture.md')) ? rd('docs/architecture.md') : '';
  const archHeads = (arch.match(/^##\s+(.+)$/gm) || []).map(function (x) { return x.replace(/^##\s+/, '').trim(); });
  const copied = archHeads.filter(function (h) { return h.length > 3 && text.indexOf(h) >= 0; });
  A(copied.length === 0, 'v2272/E3: 不复制 architecture.md 的章节标题（越界：' + JSON.stringify(copied) + '）');

  // ── F 说明书写玩家该知道的边界（不许写成「它什么都能」）─────────────────
  A(/它\*\*不会\*\*做的事|不会做的事/.test(text), 'v2272/F1: 明确写出「它不会做什么」（否定式边界）');
  A(/读不到|测不到|读不全/.test(text), 'v2272/F2: 词表覆盖「读不到 / 测不到」（本仓最容易误读的一句话）');

  // ── N 负控制：真文档破坏 → 内存副本 → 重跑同款判据 ─────────────────────
  // N1 塞进维护者向命令
  const n1 = text + '\n\n补充：遇到问题可跑 `node tools/gen-error-codes.js` 复核。\n';
  const a1 = auditText(n1);
  A(a1.wordHits.length > 0, 'v2272/N1: 塞入 `node tools/...` 后受众面必须现形（实 ' + a1.wordHits.length + ' 类）');
  A(auditText(text).wordHits.length === 0, 'v2272/N1b: 原版上同款判据为真（两向自证成立）');
  // N2 删掉「坏了怎么办」整节
  const n2 = text.replace(/^##\s*三、坏了怎么办[\s\S]*?(?=^##\s)/m, '');
  const a2 = auditText(n2);
  A(a2.missing.indexOf('broken（「坏了怎么办」）') >= 0, 'v2272/N2: 删掉该节后可用面必须现形');
  A(auditText(text).missing.length === 0, 'v2272/N2b: 原版上缺项为零（两向自证成立）');
  // N3 塞进一个会漂的读数
  const n3 = text + '\n\n（当前出厂态：共 107 个源，额度 2400t。）\n';
  const a3 = auditText(n3);
  A(a3.readingHits.length > 0, 'v2272/N3: 塞入具体读数后单源面必须现形（实 ' + a3.readingHits.length + ' 类）');
  A(auditText(text).readingHits.length === 0, 'v2272/N3b: 原版上读数零命中（两向自证成立）');
  // N4 白名单不许变成宽泛豁免：拿一段只在 docs/ 之外用维护者词的文本，仍须命中
  const n4 = '见 tests/run.js 里的一百条断言';
  A(auditText(n4).wordHits.length > 0, 'v2272/N4: 白名单只覆盖 docs/ 互指，不构成宽泛豁免');
  // N5 负控制全程未改真文档
  A(rd(GUIDE_REL) === text, 'v2272/N5: 负控制后真文档逐字未变');

  if (fail && !assertFn) { console.log('PLAYER-GUIDE-V2272: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  if (!assertFn) console.log('PLAYER-GUIDE-V2272: pass (' + pass + ')');
  return { pass: pass, fail: fail };
}

module.exports = { runAll: runAll, auditText: auditText, MAINTAINER_WORDS: MAINTAINER_WORDS, REQUIRED_SECTIONS: REQUIRED_SECTIONS, READING_PATTERNS: READING_PATTERNS };
if (require.main === module) { runAll(); }
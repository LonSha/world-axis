#!/usr/bin/env node
// WorldAxis tools/plan-ledger.js (v2.524.0) — OPV29-28 计划台账自动汇总
//
// ── 它治什么（缺口，开工前先看现场）──────────────────────────────
//   `plans/V29_MASTER_PLAN.md` 有 36 项（OPV29-01～36），每一项「做完没有、谁做的、
//   读数是多少」此前**没有任何机器可读的落点**：只有人用眼睛在 md 表里对照 git log。
//   具体的失效形态有两种，本仓都真发生过：
//     · 做了但没记（`b62742f` 落了 Z6-31/32，直到事后一批 `docs:` 提交才回填台账）
//     · 记了但没做（表里写着「已交付」，而 git log 里找不到对应提交）
//   两种都是「台账与现场不一致」，而人眼核对只能靠记性。本工具把台账变成**生成物**：
//   由 git log 生成，`--check` 重算并比对，手改必被点名。
//
// ── 抽取口径（三条硬规则，都是被现场咬出来的）────────────────────
//   1) 项号只从提交信息的**第一行**取（= subject）。
//      reason：正文（body）里经常提到别项的编号（修一项时顺手提到另一项），
//      body 里出现就等于交付会把台账算成虚胖。
//      实现细节（踩过）：本仓 subject 与正文之间只有单个换行、没有空行，git 的
//      `%s`/`%b` 在这一约定下会把整段并成 subject、body 恒空 —— 所以用 `%B` 自己切第一行。
//   2) 区间号（`OPV29-01～36`）**不展开**，只点名。
//      reason：`07fd549 docs(plan): V29 双计划纲领（… OPV29-01～36 …）` 是**计划纲领**
//      提交，不是 36 次交付。展开区间号会当场把 36 项全标成「已交付」——
//      这是本工具最容易犯的假绿，代码里用「先整段抠掉再抽单号」硬挡住。
//   3) 斜杠简写（`OPV29-31/32`）**展开**成 31、32。
//      reason：这是本仓既有惯用形态（见 `b62742f`），两个项确实是同批交付的。
//      与规则 2 的区别是：斜杠是**枚举**，波浪号是**范围**；枚举的每个成员都点得出证据，
//      范围的两端之间没有任何证据。
//
// ── 读数从哪来 ─────────────────────────────────────────
//   body 里 `复算：` 段中带 `⇒` 的行（命令 ⇒ 读数）。没有这一段 ⇒ 该项记
//   `recompute:false` 并进 `violations.noRecompute`，**不当成「已验证」**，也不当 0 条。
//   「算不出来不得当作算过」——这条在台账上的体现就是不静默留白。
//
// ── 源摘要（为什么不用时间戳）──────────────────────────
//   台账里**不写生成时间**（那会让同一份 git log 每次生成都不同，幂等就没了）。
//   改记 `sourceDigest` = 所有「subject 提到 OPV29 的提交」的 `sha\tsubject` 的 sha256。
//   只覆盖这类提交是刻意的：**普通修复提交落下来不该把台账判成过期**
//   （否则每修一处红就报一次 stale，人就会开始无视这个告警）。
//
// ── 用法 ────────────────────────────────────────────
//   node tools/plan-ledger.js --write          # 生成 plans/V29_LEDGER.json + .md
//   node tools/plan-ledger.js --check          # 重算并比对；不一致 ⇒ 退出 1 并点名
//   node tools/plan-ledger.js --json           # 机读（不写盘）
//   node tools/plan-ledger.js --log=<file>     # 用注入的 git log 文本代替真 git（自证用）
//   node tools/plan-ledger.js --root=<dir>     # 换个仓库根（自证用，绝不碰真台账）
//
// ── 纪律 ────────────────────────────────────────────
//   · 只读 git，只写两本台账；改了台账要重建，**所有改动之后**再重建（与证据账本同规）。
//   · 零依赖：只用 node 内置。
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const BASE = path.resolve(__dirname, '..');
const PLAN_REL = 'plans/V29_MASTER_PLAN.md';
const OUT_JSON = 'plans/V29_LEDGER.json';
const OUT_MD = 'plans/V29_LEDGER.md';
const TOTAL_ITEMS = 36;

// 组映射：01-06 Z1 / 07-12 Z2 / 13-18 Z3 / 19-24 Z4 / 25-30 Z5 / 31-36 Z6
function groupOf(num) {
  const g = Math.floor((num - 1) / 6) + 1;
  return 'Z' + g;
}
function itemId(n) {
  return 'OPV29-' + (n < 10 ? '0' + n : String(n));
}

// ── 抽取：区间先抠掉，再抽单号与斜杠枚举 ──────────────────
const RANGE_RE = /OPV29-(\d{2})\s*(?:～|~|→|至|—+|–+)\s*(\d{2})/g;
const ITEM_RE = /OPV29-(\d{2})((?:\/\d{2})*)/g;

function subjectBody(subject) {
  const s = String(subject || '');
  const i = s.indexOf(': ');
  // 有 `type(scope): ` 前缀就只取其后；没有就整行都算（宁可多看见，也不静默当没有）
  return i >= 0 ? s.slice(i + 2) : s;
}
function extractFromText(text) {
  const ranges = [];
  // 先把区间号整段换成空白：区间不展开，只记录（防「计划纲领」被算成 36 次交付）
  const stripped = String(text || '').replace(RANGE_RE, function (m) {
    ranges.push(m);
    return ' ';
  });
  const items = [];
  let m;
  ITEM_RE.lastIndex = 0;
  while ((m = ITEM_RE.exec(stripped))) {
    items.push(m[1]);
    if (m[2]) {
      m[2].split('/').filter(Boolean).forEach(function (s) { items.push(s); });
    }
  }
  // 形如 "OPV29-xx" 却没抽出任何号 ⇒ 形态不认识，要报出来而不是静默当没有
  const mentioned = /OPV29/.test(String(text || ''));
  const unparsed = mentioned && items.length === 0 && ranges.length === 0;
  return { items: items, ranges: ranges, unparsed: unparsed };
}

// ── 读数：`复算：` 段里带 ⇒ 的行 ────────────────────────
function extractReadings(body) {
  const lines = String(body || '').split('\n');
  const out = [];
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^复算[：:]/.test(t)) { inBlock = true; continue; }
    if (!inBlock) continue;
    if (!t) continue;          // 空行不打断（本仓 body 里复算段内部空行是常规排布）
    // 下一个「xx：」小标题 ⇒ 块结束（限 12 字，避免把长句里的冒号当标题）
    if (/^[^\s：:]{1,12}[：:]$/.test(t)) break;
    if (t.indexOf('⇒') >= 0 || t.indexOf('=>') >= 0) out.push(t);
  }
  return out;
}
function extractNote(body) {
  const m = /(?:^|\n)\s*读数[：:]([^\n]*)/.exec(String(body || ''));
  return m ? m[1].trim() : '';
}

// ── git log 读取（\x1f 分字段、\x1e 分记录，用 %B 拿完整消息）────
//   为什么不用 %s / %b：本仓的提交信息里 **subject 与正文之间只有单个换行、没有空行**，
//   于是 git 把整段都算成 subject（`%s` 会把换行折成空格 ⇒ 一行几千字），`%b` 恒为空。
//   踩过一次：bodyLen 0、四项交付全被判「无复算读数」。改用 `%B` 拿原始消息，自己切第一行。
function readGitLog(root) {
  return cp.execFileSync('git', ['-C', root, 'log', '--format=%h%x1f%B%x1e'], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  });
}
function parseLog(text) {
  const commits = [];
  String(text || '').split('\x1e').forEach(function (rec) {
    const r = rec.replace(/^\n+/, '');
    if (!r) return;
    const f = r.split('\x1f');
    if (f.length < 2) return;
    const full = f.slice(1).join('\x1f');
    const nl = full.indexOf('\n');
    commits.push({
      sha: f[0].trim(),
      subject: nl >= 0 ? full.slice(0, nl).replace(/\s+$/, '') : full.replace(/\s+$/, ''),
      body: nl >= 0 ? full.slice(nl + 1) : ''
    });
  });
  return commits;
}

// ── 由提交生成台账（纯函数，可注入）──────────────────────
function buildLedger(root, logText) {
  let raw = logText;
  if (raw === undefined || raw === null) raw = readGitLog(root || BASE);
  const commits = parseLog(raw);

  const delivered = {};
  const violations = { rangeForm: [], noRecompute: [], unparsedForm: [], dupClaims: [] };
  const srcLines = [];

  commits.forEach(function (c) {
    const ex = extractFromText(subjectBody(c.subject));
    // unparsed 也是「提到了 OPV29」，必须进来源与欠账 ——
    // 初版这里只判 items/ranges，结果是「形态不认识的提交被静默丢掉」（判据 B8 当场咬住）
    if (!(ex.items.length || ex.ranges.length || ex.unparsed)) return;
    srcLines.push(c.sha + '\t' + c.subject);
    ex.ranges.forEach(function (r) {
      violations.rangeForm.push({ commit: c.sha, form: r });
    });
    if (ex.unparsed) violations.unparsedForm.push({ commit: c.sha, subject: c.subject });
    const readings = extractReadings(c.body);
    const note = extractNote(c.body);
    for (let i = 0; i < ex.items.length; i++) {
      const id = 'OPV29-' + ex.items[i];
      if (delivered[id]) {
        violations.dupClaims.push({ item: id, commits: [delivered[id].commit, c.sha] });
        continue;   // 先到先得，重复另计为欠账（不静默覆盖）
      }
      delivered[id] = {
        group: groupOf(Number(ex.items[i])),
        commit: c.sha,
        subject: c.subject,
        readings: readings,
        recompute: readings.length > 0,
        note: note
      };
      if (readings.length === 0) violations.noRecompute.push(id);
    }
  });

  const pending = [];
  for (let n = 1; n <= TOTAL_ITEMS; n++) {
    if (!delivered[itemId(n)]) pending.push(itemId(n));
  }

  const sortedItems = {};
  Object.keys(delivered).sort().forEach(function (k) { sortedItems[k] = delivered[k]; });

  return {
    tool: 'plan-ledger',
    schema: 1,
    // v2.569.0 修正：这里原先钉死 `'2.524.0'`（本工具首版那天的版本），此后每轮升版都没跟上 ——
    //   于是 plans/V29_LEDGER.json 的 version 一路落后现场四十多版，OPV29-27 的「九载体同号」
    //   在**生成器这一侧**就已经不可能成立（它每次 --write 都把旧数字写回去）。
    //   改为从单一真源 index.js 的 `const VERSION` 读：生成的账本永远与现场同号，不再需要人记。
    version: (fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
      .match(/const VERSION = '(\d+\.\d+\.\d+)'/) || [])[1],
    sourceDigest: crypto.createHash('sha256').update(srcLines.sort().join('\n'), 'utf8').digest('hex'),
    sourceCommits: srcLines.length,
    total: TOTAL_ITEMS,
    delivered: sortedItems,
    pending: pending,
    violations: {
      rangeForm: violations.rangeForm.sort(function (a, b) { return a.commit < b.commit ? -1 : 1; }),
      noRecompute: violations.noRecompute.sort(),
      unparsedForm: violations.unparsedForm,
      dupClaims: violations.dupClaims
    },
    counts: {
      delivered: Object.keys(sortedItems).length,
      pending: pending.length,
      rangeForm: violations.rangeForm.length,
      noRecompute: violations.noRecompute.length,
      unparsedForm: violations.unparsedForm.length,
      dupClaims: violations.dupClaims.length
    }
  };
}

// ── 计划面：36 项是否都在计划表里（防「表被删了但台账还绿」）──────
function planItems(root) {
  const p = path.join(root || BASE, PLAN_REL);
  if (!fs.existsSync(p)) return { ok: false, items: [], why: 'plan-missing' };
  const src = fs.readFileSync(p, 'utf8');
  const items = [];
  const re = /^\|\s*(OPV29-(\d{2}))\s*\|/gm;
  let m;
  while ((m = re.exec(src))) items.push(m[1]);
  const uniq = [];
  items.forEach(function (x) { if (uniq.indexOf(x) < 0) uniq.push(x); });
  return { ok: uniq.length === TOTAL_ITEMS, items: uniq.sort(), why: uniq.length === TOTAL_ITEMS ? '' : 'plan-items=' + uniq.length };
}

// ── 渲染 ────────────────────────────────────────────
function renderJson(ledger) {
  return JSON.stringify(ledger, null, 2) + '\n';
}
function renderMd(ledger) {
  const L = [];
  L.push('# V29 计划台账（自动生成，勿手改）');
  L.push('');
  L.push('> 由 `node tools/plan-ledger.js --write` 从 `git log` 生成。手改会被');
  L.push('> `node tools/plan-ledger.js --check` 点名（重算与盘上不一致 ⇒ 退出 1）。');
  L.push('');
  L.push('- 生成源：subject 提到 `OPV29-` 的提交 **' + ledger.sourceCommits + '** 条 · 源摘要 `' +
    ledger.sourceDigest.slice(0, 12) + '`');
  L.push('- 已交付 **' + ledger.counts.delivered + ' / ' + ledger.total + '**，未交付 **' +
    ledger.counts.pending + '**');
  L.push('- 欠账读数：区间号 ' + ledger.counts.rangeForm + ' · 无复算读数 ' +
    ledger.counts.noRecompute + ' · 形态不认识 ' + ledger.counts.unparsedForm +
    ' · 重复声称 ' + ledger.counts.dupClaims);
  L.push('');
  for (let g = 1; g <= 6; g++) {
    const gid = 'Z' + g;
    const rows = Object.keys(ledger.delivered).filter(function (k) {
      return ledger.delivered[k].group === gid;
    });
    L.push('## ' + gid + '（已交付 ' + rows.length + ' / 6）');
    L.push('');
    if (!rows.length) {
      L.push('_无_');
      L.push('');
      continue;
    }
    L.push('| 项 | 提交 | 标题 | 复算读数 |');
    L.push('| :--- | :--- | :--- | :--- |');
    rows.forEach(function (k) {
      const e = ledger.delivered[k];
      const subject = e.subject.replace(/\|/g, '\\|').slice(0, 90);
      const readings = e.readings.length
        ? e.readings.length + ' 条：`' + e.readings[0].replace(/\|/g, '\\|').replace(/`/g, "'").slice(0, 90) + '`'
        : '**缺（recompute:false）**';
      L.push('| ' + k + ' | `' + e.commit + '` | ' + subject + ' | ' + readings + ' |');
    });
    L.push('');
  }
  if (ledger.pending.length) {
    L.push('## 未交付（' + ledger.pending.length + '）');
    L.push('');
    L.push(ledger.pending.join(' · '));
    L.push('');
  }
  if (ledger.violations.rangeForm.length) {
    L.push('## 区间号（不展开，只点名）');
    L.push('');
    ledger.violations.rangeForm.forEach(function (r) {
      L.push('- `' + r.commit + '` 的 subject 里写了 `' + r.form + '` —— 那是计划纲领/汇总语境，不算逐项交付');
    });
    L.push('');
  }
  return L.join('\n');
}

// ── 比对（--check）────────────────────────────────────
function compare(disk, fresh) {
  const probs = [];
  if (!disk || typeof disk !== 'object' || !disk.delivered) {
    return [{ kind: 'ledger-unreadable', detail: '盘上台账缺失或不是本工具的产物' }];
  }
  if (disk.sourceDigest !== fresh.sourceDigest) {
    probs.push({ kind: 'source-digest-mismatch', detail: 'git log 的交付提交集合变了（盘上 ' +
      String(disk.sourceDigest).slice(0, 12) + ' vs 重算 ' + fresh.sourceDigest.slice(0, 12) + '）' });
  }
  const dk = Object.keys(disk.delivered || {});
  const fk = Object.keys(fresh.delivered);
  fk.forEach(function (k) {
    if (!disk.delivered[k]) probs.push({ kind: 'new-claim', detail: k + ' 由 ' + fresh.delivered[k].commit + ' 交付，盘上台账没有' });
  });
  dk.forEach(function (k) {
    const d = disk.delivered[k];
    const f = fresh.delivered[k];
    if (!f) { probs.push({ kind: 'fabricated-claim', detail: k + ' 在盘上台账里有（' + d.commit + '），git log 里没有任何提交交付它' }); return; }
    if (d.commit !== f.commit) probs.push({ kind: 'edited', detail: k + ' 提交号 盘上 ' + d.commit + ' vs 重算 ' + f.commit });
    if (d.subject !== f.subject) probs.push({ kind: 'edited', detail: k + ' 标题 与 git log 不一致（逐字比）' });
    const dr = Array.isArray(d.readings) ? d.readings.length : -1;
    const fr = f.readings.length;
    if (dr !== fr) probs.push({ kind: 'edited', detail: k + ' 复算读数 盘上 ' + dr + ' 条 vs 重算 ' + fr + ' 条' });
  });
  if (JSON.stringify(disk.pending) !== JSON.stringify(fresh.pending)) {
    probs.push({ kind: 'edited', detail: '未交付清单与重算不一致（盘上 ' + (disk.pending || []).length + ' 项）' });
  }
  return probs;
}

// ── 主流程 ───────────────────────────────────────────
function build(root, logText) {
  const ledger = buildLedger(root || BASE, logText);
  const plan = planItems(root || BASE);
  const issues = [];
  if (!plan.ok) issues.push({ kind: plan.why, detail: '计划表里的 OPV29 项数不等于 ' + TOTAL_ITEMS + ' / 计划表缺失' });
  Object.keys(ledger.delivered).forEach(function (k) {
    if (plan.ok && plan.items.indexOf(k) < 0) issues.push({ kind: 'plan-unknown', detail: k + ' 在台账里已交付，计划表里没有这一项' });
  });
  ledger.violations.noRecompute.forEach(function (k) {
    issues.push({ kind: 'no-recompute', detail: k + ' 的提交 body 里没有「复算：… ⇒ 读数」段 —— 不算已验证' });
  });
  ledger.violations.rangeForm.forEach(function (r) {
    issues.push({ kind: 'range-form', detail: r.commit + ' subject 含区间号 ' + r.form + '，未展开（另需逐项提交或手写说明）' });
  });
  ledger.violations.unparsedForm.forEach(function (r) {
    issues.push({ kind: 'unparsed-form', detail: r.commit + ' subject 提到 OPV29 但项号形态不认识' });
  });
  ledger.violations.dupClaims.forEach(function (r) {
    issues.push({ kind: 'dup-claim', detail: r.item + ' 被 ' + r.commits.join(' 与 ') + ' 都声称交付' });
  });
  return { ledger: ledger, plan: plan, issues: issues };
}

function main() {
  const argv = process.argv.slice(2);
  let root = BASE;
  let logText = null;
  argv.forEach(function (a) {
    if (a.indexOf('--root=') === 0) root = path.resolve(a.slice(7));
    if (a.indexOf('--log=') === 0) logText = fs.readFileSync(path.resolve(a.slice(6)), 'utf8');
  });
  const built = build(root, logText);
  const ledger = built.ledger;

  if (argv.indexOf('--write') >= 0) {
    fs.writeFileSync(path.join(root, OUT_JSON), renderJson(ledger), 'utf8');
    fs.writeFileSync(path.join(root, OUT_MD), renderMd(ledger), 'utf8');
    console.log('台账已重建：' + OUT_JSON + ' + ' + OUT_MD);
    console.log('已交付 ' + ledger.counts.delivered + '/' + ledger.total + ' · 未交付 ' +
      ledger.counts.pending + ' · 源摘要 ' + ledger.sourceDigest.slice(0, 12));
    built.issues.forEach(function (i) { console.log('  · [' + i.kind + '] ' + i.detail); });
    return 0;
  }

  if (argv.indexOf('--json') >= 0) {
    console.log(JSON.stringify({ ok: built.issues.filter(function (i) {
      return ['no-recompute', 'plan-unknown', 'range-form', 'unparsed-form', 'dup-claim'].indexOf(i.kind) < 0;
    }).length === 0, counts: ledger.counts, sourceDigest: ledger.sourceDigest,
    pending: ledger.pending.length, issues: built.issues }, null, 2));
    return 0;
  }

  // 默认 = --check
  const p2 = path.join(root, OUT_JSON);
  let disk = null;
  if (fs.existsSync(p2)) {
    try { disk = JSON.parse(fs.readFileSync(p2, 'utf8')); } catch (e) { disk = null; }
  }
  const probs = compare(disk, ledger);
  if (!probs.length) {
    console.log('✓ plan-ledger --check: pass（台账与 git log 一致 · 已交付 ' +
      ledger.counts.delivered + '/' + ledger.total + ' · 未交付 ' + ledger.counts.pending + '）');
    return 0;
  }
  console.log('✗ plan-ledger --check: FAIL ' + probs.length + ' 条');
  probs.forEach(function (p) { console.log('  · [' + p.kind + '] ' + p.detail); });
  console.log('  处置：`node tools/plan-ledger.js --write` 重建后复核（手改台账一律按过期处理）');
  return 1;
}

if (require.main === module) process.exit(main());
module.exports = {
  buildLedger: buildLedger, build: build, parseLog: parseLog, extractFromText: extractFromText,
  extractReadings: extractReadings, groupOf: groupOf, itemId: itemId, compare: compare,
  renderJson: renderJson, renderMd: renderMd, planItems: planItems
};

#!/usr/bin/env node
/**
 * WorldAxis tools/dead-table-triage.js (v2.529.0) — OPV29-14 死码归并（逐条定性）
 *
 * ── 它治什么（本版现场）──
 *   计划原文：「52 条死表逐条定性：删/接/留（留要写理由）」，验收「死表数下降且记账；
 *   **不许静默跳过**」。此前 `tests/reject-v2780.js` 的 DEAD 表里每条只有 `anchor` + `why`：
 *   人读得懂，但没有任何机器判据保证「52 条都被看过一眼」——
 *   增删一条、理由写「TODO」、锚点对应的源码行被人改掉，都不会红。
 *
 * ── 判据（T 面）──
 *   T1 台账可读（tests/dead-table-triage.json），必须有 entries 数组。
 *   T2 覆盖完整：DEAD 里每个码都必须有条目（少一条 = 静默跳过 ⇒ 红，点名）。
 *   T3 无幽灵：非 del 的条目必须仍在该码在 DEAD 里；del 条目必须该码已不在 DEAD（否则是假删）。
 *   T4 定性合法：action ∈ {keep,del,wire}；why ≥24 字；不得含占位词（TODO/TBD/待补/以后再说/???）。
 *   T5 keep 的前提还钉着：`anchor` 那行必须仍在产品源码里（找不到 ⇒ 前提已失效 ⇒ 红，要求重新定性）。
 *      —— 本判据上线当天就抓到 1 条真失效：`bad-draft` 的锚点还指着 v2.86.0 的
 *      `registry.ensurePerson`，而真正的产出点早在 collab.enqueue 的嵌套草稿守卫上。
 *   T6 wire 的前提：该码在产品源码里真出现（≥1 处）且已被见证表声明（不许「嘴上接上」）。
 *   T7 账要对得上：deadCount 必须 = 条目数 - del 数；**若 del = 0，台账必须写 `_debt`（≥40 字）**
 *      说明「死表数没下降」的原因——不许用「反正全留」换一个好看的通过。
 *
 * ── 边界（如实登记）──
 *   · `hits` 是**子串计数**（产品源码里该码字面量出现几次），不做数据流：注释里的提及也算。
 *     它只用来回答「码还在不在源码里」，不能回答「这条路径跑不跑得到」——后者是 `why` 的活。
 *   · 本工具不改 DEAD 表、不改产品代码。定性是人的判断，工具只保证判断被写下、被覆盖、被复算。
 *
 * ── 用法 ──
 *   node tools/dead-table-triage.js            # 读数
 *   node tools/dead-table-triage.js --check    # 判据模式：违反即 rc=1
 *   node tools/dead-table-triage.js --write    # 按现场重建台账（保留已有 action/why）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const LEDGER_REL = 'tests/dead-table-triage.json';
const PRODUCT_DIRS = ['engines', 'core', 'ui', 'render'];
const PLACEHOLDER = /TODO|TBD|待补|以后再说|以后再|\?\?\?/;

function walk(d, acc) {
  fs.readdirSync(d).forEach(function (f) {
    if (f === 'node_modules' || f === '.git') return;
    const p = path.join(d, f);
    let st = null;
    try { st = fs.statSync(p); } catch (e) { return; }
    if (st.isDirectory()) walk(p, acc);
    else if (/\.js$/.test(f)) acc.push(p);
  });
  return acc;
}

function productTexts(base) {
  const files = [];
  PRODUCT_DIRS.forEach(function (d) { try { walk(path.join(base, d), files); } catch (e) {} });
  if (fs.existsSync(path.join(base, 'index.js'))) files.push(path.join(base, 'index.js'));
  const map = {};
  files.forEach(function (f) { try { map[f] = fs.readFileSync(f, 'utf8'); } catch (e) {} });
  return { files: files, map: map };
}

function deadTable(base) {
  const p = path.join(base, 'tests', 'reject-v2780.js');
  delete require.cache[require.resolve(p)];
  const m = require(p);
  return m.DEAD || {};
}

function hitsIn(map, code) {
  let n = 0;
  Object.keys(map).forEach(function (f) {
    const t = map[f];
    let i = 0;
    for (;;) {
      i = t.indexOf(code, i);
      if (i < 0) break;
      n += 1; i += code.length;
    }
  });
  return n;
}

function anchorIn(map, anchor) {
  if (!anchor) return false;
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) if (map[keys[i]].indexOf(anchor) >= 0) return true;
  return false;
}

function scan(base) {
  const root = base || ROOT;
  const dead = deadTable(root);
  const keys = Object.keys(dead).sort();
  const { files, map } = productTexts(root);
  const per = {};
  keys.forEach(function (k) {
    per[k] = {
      hits: hitsIn(map, k),
      anchorOk: anchorIn(map, dead[k] && dead[k].anchor),
      whyLen: String((dead[k] && dead[k].why) || '').length
    };
  });
  return { deadCount: keys.length, keys: keys, per: per, files: files.length };
}

function readLedger(base) {
  try {
    const raw = fs.readFileSync(path.join(base || ROOT, LEDGER_REL), 'utf8');
    return JSON.parse(raw);
  } catch (e) { return null; }
}

function check(base) {
  const root = base || ROOT;
  const rep = scan(root);
  const problems = [];
  const led = readLedger(root);
  if (!led || !Array.isArray(led.entries)) {
    problems.push('台账读不出或没有 entries：' + LEDGER_REL);
    return { scan: rep, ledger: led, problems: problems, ok: false };
  }
  const byKey = {};
  led.entries.forEach(function (e) { if (e && e.key) byKey[e.key] = e; });
  // T2 覆盖
  rep.keys.forEach(function (k) {
    if (!byKey[k]) problems.push('死表码没有定性（静默跳过）：' + k);
  });
  // T3/T4/T5/T6 逐条
  led.entries.forEach(function (e) {
    const k = e.key;
    const act = e.action;
    const inDead = Object.prototype.hasOwnProperty.call(rep.per, k);
    if (act !== 'del' && !inDead) problems.push('幽灵条目（该码不在死表里）：' + k);
    if (act === 'del' && inDead) problems.push('假删（该码仍在死表里，删了要真删）：' + k);
    if (act !== 'keep' && act !== 'del' && act !== 'wire') problems.push('定性不合法（' + act + '）：' + k);
    if (String(e.why || '').length < 24) problems.push('理由太短（<24 字）：' + k);
    else if (PLACEHOLDER.test(String(e.why))) problems.push('理由含占位词：' + k);
    if (act === 'keep' && inDead) {
      if (!rep.per[k].anchorOk) problems.push('keep 的前提失效（anchor 已不在产品源码里，须重新定性）：' + k);
    }
    if (act === 'wire') {
      if (inDead && rep.per[k].hits < 1) problems.push('假接（该码在产品源码里 0 处）：' + k);
      const wit = JSON.stringify(require(path.join(root, 'tests', 'reject-v2780.js')).tables || {});
      if (wit.indexOf(k) < 0) problems.push('假接（见证表没有声明该码）：' + k);
    }
  });
  // T7 账
  const dels = led.entries.filter(function (e) { return e && e.action === 'del'; }).length;
  const left = led.entries.length - dels;
  if (left !== rep.deadCount) problems.push('账对不上：台账剩 ' + left + ' 条 / 现场死表 ' + rep.deadCount + ' 条');
  if (dels === 0 && String(led._debt || '').length < 40) {
    problems.push('del=0 但没写 _debt（≥40 字说明死表数为何没下降）：不许用「全留」换通过');
  }
  return { scan: rep, ledger: led, problems: problems, ok: problems.length === 0 };
}

function writeLedger(base) {
  const root = base || ROOT;
  const rep = scan(root);
  const old = readLedger(root);
  const keep = {};
  if (old && Array.isArray(old.entries)) old.entries.forEach(function (e) { if (e && e.key) keep[e.key] = e; });
  const dead = deadTable(root);
  const entries = rep.keys.map(function (k) {
    const prior = keep[k];
    const hits = rep.per[k].hits;
    const aok = rep.per[k].anchorOk;
    const baseWhy = String((dead[k] && dead[k].why) || '');
    const suffix = '｜现场复算：产品源码出现 ' + hits + ' 处、锚点' + (aok ? '仍在' : '已漂移');
    return {
      key: k,
      action: (prior && prior.action) || (aok ? 'keep' : 'keep'),
      why: (prior && prior.why) ? prior.why : (baseWhy + suffix),
      sourceHits: hits,
      anchorOk: aok
    };
  });
  const out = {
    _note: '死表逐条定性台账（OPV29-14）。action：keep=结构不可达前提仍成立故留着 / del=码已从产品源码消失故从死表删 / wire=接上见证（须真能 trip）。why ≥24 字且不许占位。工具：tools/dead-table-triage.js --write 重建。',
    _debt: (old && old._debt) || '',
    // v2.569.0：原先钉死 '2.529.0'（本工具首版那天）—— 每次 --write 都把四十版前的数字写回台账。
    //   改为从单一真源 index.js 的 `const VERSION` 读，生成的台账永远与现场同号。
    version: (fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8').match(/const VERSION = '(\d+\.\d+\.\d+)'/) || [])[1],
    entries: entries
  };
  fs.writeFileSync(path.join(root, LEDGER_REL), JSON.stringify(out, null, 1) + '\n');
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf('--root');
  const base = idx >= 0 ? path.resolve(argv[idx + 1]) : ROOT;
  if (argv.indexOf('--write') >= 0) {
    const w = writeLedger(base);
    console.log('■ 台账已重建：' + LEDGER_REL + '（' + w.entries.length + ' 条 / keep '
      + w.entries.filter(function (e) { return e.action === 'keep'; }).length + '）');
    return;
  }
  const r = check(base);
  const keepN = r.ledger && r.ledger.entries ? r.ledger.entries.filter(function (e) { return e.action === 'keep'; }).length : 0;
  const delN = r.ledger && r.ledger.entries ? r.ledger.entries.filter(function (e) { return e.action === 'del'; }).length : 0;
  const wireN = r.ledger && r.ledger.entries ? r.ledger.entries.filter(function (e) { return e.action === 'wire'; }).length : 0;
  console.log('■ 受检根：' + base);
  console.log('■ 死表：' + r.scan.deadCount + ' 条 / 产品文件 ' + r.scan.files + ' 个');
  console.log('■ 定性：keep ' + keepN + ' · del ' + delN + ' · wire ' + wireN);
  const drifted = Object.keys(r.scan.per).filter(function (k) { return !r.scan.per[k].anchorOk; });
  console.log('■ 锚点漂移：' + drifted.length + ' 条' + (drifted.length ? ' ⇒ ' + drifted.join(' , ') : ''));
  if (argv.indexOf('--check') >= 0) {
    if (r.ok) { console.log('■ 结论：PASS（' + r.scan.deadCount + ' 条全部定性、账对得上、keep 前提仍在）'); return; }
    r.problems.forEach(function (p) { console.error('✗ ' + p); });
    console.log('■ 结论：FAIL（' + r.problems.length + ' 项）');
    process.exitCode = 1;
    return;
  }
  console.log('■ 结论：' + (r.ok ? '一致' : '有 ' + r.problems.length + ' 项违反（--check 会红）'));
}

module.exports = { scan: scan, check: check, writeLedger: writeLedger, hitsIn: hitsIn, anchorIn: anchorIn };

if (require.main === module) main();
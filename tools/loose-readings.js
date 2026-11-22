#!/usr/bin/env node
// WorldAxis tools/loose-readings.js — 「散装读数」的登记与过期即现形（U3，v2.191.0）
//
// ── 它治的病（计划 U3 现状原文）──────────────────────────────────────────
//   「v2.189.0 收口轮的 **17 处红没有一处是新代码写错**，全是『新代码进来后没人通知的旧读数』。
//    `tests/settle-v2830.js` 三处最典型：写死的、不在 `tests/readings.js` 族扫描面内、
//    无任何判据盯着的数字，于是从 v2.185.0 一路红到全量回归才现形（发现通道 = 跑一次 17 分钟）。」
//   一句话：**「没人盯」这件事本身没有判据** —— 族外的数字要等一趟全量回归才现形。
//
// ── 本办法：登记**站点**，真值一律现取 ─────────────────────────────────
//   ① 真源：每站点声明一个 `probe`（账本文件）。真值**只从探针现取**，
//      表里**不写任何真值** ⇒ 本表在结构上不可能成为第二真源（U3 验收 ④）。
//   ② 站点形态：`shapes` 是有限词表，每条登记必须落在表内（扩形态是显式改动）。
//      · `ledger-num-eq`             —— `<var>.<field> === <n>`（可多字段串在同一断言里）
//      · `ledger-num-lt`             —— `<var>.<field> < <var>.<field>`（两面互比，不取值）
//      · `ledger-object-keys-len-eq` —— `Object.keys(<var>.<face>).length === <n>`
//   ③ 核对：按登记在真源码里**逐站点**扫出字面量，与探针现取的真值比。
//      失配即报 `{id, file, line, field, type, got, want, probe}` —— 报出文件 / 行号 /
//      读数类型 / 真源（U3 验收 ②）。
//   ④ 反向漏网（U3 验收 ③）：把 `tests/` 下所有 `<var>.<field> === <n>` 形态的散装点扫出来，
//      凡**不在登记表内**的即为新增散装读数 ⇒ 由门禁报红。这条是本项的要害：
//      它把「新数字悄悄进来」从「等一趟全量回归」变成**分钟级现形**（U3 验收 ①）。
//
// ── 与既有机制的关系（扩面，不重写）────────────────────────────────────
//   `tests/readings.js`  + `tools/sync-hardcoded.js` / `tools/sync-e2e-readings.js`：
//      管**族内**站点（`r<四位>.<字段>` / `led<四位>` 两种形态），自动回填。
//   `tools/fact-report.js`（U9）：管**发布前**的一次性事实面（文档里的旧基线等）。
//   本工具：管**族外散装**站点 —— 三者互补，不重叠，也不各写一份真源。
//
// ── 边界（如实登记）──────────────────────────────────────────────────
//   · 只认登记表里声明的 `var` 前缀：**本地变量改名 ⇒ 站点即"消失"**（工具会报 missing，
//     不是静默放行 —— 见下一条）。这是保守的错，宁可要求重新登记，不可谎报已覆盖。
//   · 反向漏网只认已登记过的 `var` 前缀（扫描面 = 登记表的 `var` 集合 ∪ 账本字段名单），
//     不做「任意变量名 + 任意字段名」的宽泛正则 —— 宽泛正则误伤沿革叙述（U3 边界 ②）。
//   · 只做**只读**判定，不含自动改写。改字面量仍由人决定（回填面在 sync-* 两具上）。
//
// 用法：
//   node tools/loose-readings.js              # 全站点核对 + 反向漏网
//   node tools/loose-readings.js --json       # 机器可读
//   node tools/loose-readings.js --sites      # 只看登记站点清单
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TABLE_P = path.join(ROOT, 'tests', 'loose-readings.json');

/** 有限形态词表（扩形态 = 显式改动；门禁按它校验登记表）。 */
const SHAPES = ['ledger-num-eq', 'ledger-num-lt', 'ledger-object-keys-len-eq'];

function readText(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function readJsonOrNull(rel) {
  try { return JSON.parse(readText(rel)); } catch (e) { return null; }
}
function loadTable() { return readJsonOrNull('tests/loose-readings.json') || null; }

/** 按 `a.b.c` 取值；取不到返回 `undefined`（**与 0 分开**，不拿 0 冒充「读不到」）。 */
function pick(obj, dotted) {
  let cur = obj;
  const parts = String(dotted).split('.');
  for (let i = 0; i < parts.length; i++) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** 逐站点扫真源码，返回 `{field, line, got}` 列表（`got` 为文本）。 */
function scanSite(site, text) {
  const lines = text.split('\n');
  const out = [];
  const v = escapeRe(site.var);
  site.fields.forEach(function (field) {
    let re = null;
    if (site.shape === 'ledger-num-eq') {
      re = new RegExp('\\b' + v + '\\.' + escapeRe(field) + '\\s*===\\s*(\\d+)', 'g');
    } else if (site.shape === 'ledger-object-keys-len-eq') {
      re = new RegExp('Object\\.keys\\(\\s*' + v + '\\.' + escapeRe(field) + '\\s*\\)\\.length\\s*===\\s*(\\d+)', 'g');
    } else if (site.shape === 'ledger-num-lt') {
      // 互比形态没有字面量：只登记「它被这样用过」，不取值。
      re = new RegExp('\\b' + v + '\\.' + escapeRe(field) + '\\s*<\\s*' + v + '\\.', 'g');
    } else {
      return;
    }
    for (let i = 0; i < lines.length; i++) {
      re.lastIndex = 0;
      let m = re.exec(lines[i]);
      if (m) out.push({ field: field, line: i + 1, got: m[1] === undefined ? null : m[1] });
    }
  });
  return out;
}

/**
 * 核对一张表。返回 `{ problems, checked, sites, probes }`。
 *   `problems[].kind` 取值（有限词表）：
 *     · `table-missing`     表不存在 / 不可解析
 *     · `bad-shape`         登记形态不在词表内
 *     · `missing`           登记站点在真源码里**一个都扫不到**（改名 / 被删 ⇒ 必须重新登记）
 *     · `mismatch`          字面量与探针现取的真值不一致（**本项的要害**）
 *     · `unreadable`        探针文件不存在 / 不可解析 / 字段取不到（**不当作通过**）
 *     · `unregistered`      反向漏网：真源码里存在的散装点未进登记表
 *     · `stale-site`        登记站点缺 `id` / `file` / `probe` / `why` 中任一项
 */
function audit(opts) {
  const o = opts || {};
  const table = o.table || loadTable();
  const problems = [];
  if (!table || !Array.isArray(table.sites)) {
    return { problems: [{ kind: 'table-missing', detail: 'tests/loose-readings.json 缺失或不可解析' }],
      checked: 0, sites: [], probes: [] };
  }
  (table.sites || []).forEach(function (s) {
    ['id', 'file', 'probe', 'why'].forEach(function (k) {
      if (!s[k]) problems.push({ kind: 'stale-site', id: s.id || '(无 id)', detail: '缺字段 ' + k });
    });
    if (SHAPES.indexOf(s.shape) < 0) {
      problems.push({ kind: 'bad-shape', id: s.id, detail: '形态 ' + s.shape + ' 不在词表 [' + SHAPES.join('/') + ']' });
    }
  });
  let text = '';
  try { text = readText(table.sites[0] ? table.sites[0].file : 'index.js'); } catch (e) { text = ''; }
  const byFile = {};
  (table.sites || []).forEach(function (s) {
    if (typeof byFile[s.file] !== 'string') {
      try { byFile[s.file] = readText(s.file); }
      catch (e) { byFile[s.file] = null; }
    }
  });
  const probes = [];
  const probeCache = {};
  let checked = 0;

  (table.sites || []).forEach(function (s) {
    const src = byFile[s.file];
    if (typeof src !== 'string') {
      problems.push({ kind: 'unreadable', id: s.id, detail: '站点文件读不到 ' + s.file });
      return;
    }
    if (typeof probeCache[s.probe] === 'undefined') probeCache[s.probe] = readJsonOrNull(s.probe);
    const probe = probeCache[s.probe];
    if (!probe) {
      problems.push({ kind: 'unreadable', id: s.id, detail: '探针读不到 ' + s.probe });
      return;
    }
    if (probes.indexOf(s.probe) < 0) probes.push(s.probe);
    const hits = scanSite(s, src);
    if (!hits.length) {
      problems.push({ kind: 'missing', id: s.id, file: s.file,
        detail: '登记站点一个字面量都扫不到（本地变量改名或被删 ⇒ 必须重新登记）' });
      return;
    }
    hits.forEach(function (h) {
      checked += 1;
      if (h.got === null) return;            // 互比形态：无字面量可比
      let want = pick(probe, h.field);
      // `ledger-object-keys-len-eq` 的真值口径**必须与站点同形**：站点读的是
      //   `Object.keys(x).length`，真源若直接取对象本身就是 `[object Object]`
      //   —— 那是「口径不同」，不是「值不同」。这一条是现场实测踩出来的。
      if (s.shape === 'ledger-object-keys-len-eq' && want && typeof want === 'object') {
        want = Object.keys(want).length;
      }
      if (want === undefined) {
        problems.push({ kind: 'unreadable', id: s.id, file: s.file, line: h.line, field: h.field,
          type: s.shape, probe: s.probe, detail: '探针里取不到字段 ' + h.field + '（读不到 ≠ 通过）' });
        return;
      }
      if (String(want) !== String(h.got)) {
        problems.push({ kind: 'mismatch', id: s.id, file: s.file, line: h.line,
          field: h.field, type: s.shape, probe: s.probe, got: h.got, want: want,
          detail: s.file + ':' + h.line + ' 读 ' + h.field + ' = ' + h.got + '，真源 ' + s.probe + ' 是 ' + want });
      }
    });
  });

  // ── 反向漏网：真源码里的散装点是否都在登记表内 ───────────────────────
  //   识别判据**两条同时成立**才收（现场实测踩过第一条的坑）：
  //     ① 变量名与某个登记站点相同 —— 这是线索，**不是判据**；
  //        本仓 tests/run.js 与 tests/readings-v2106.js 里都有同名的局部 `led`。
  //     ② 该 `字段` 在**该站点声明的探针里真的存在**，且**站点文件路径也一致**
  //        —— 只有这条才说明「这个点读的是那份账本」。同名局部变量读的是别的对象，
  //        其字段（`problems.length` / `rows.length` / 数字下标）在账本里根本不存在。
  if (o.scanUnregistered !== false) {
    const owned = (table.sites || []).map(function (s) {
      let probe = null;
      try { probe = JSON.parse(readText(s.probe)); } catch (e) { probe = null; }
      return { file: s.file, var: s.var, probe: probe };
    });
    const files = o.files || listTestFiles();
    files.forEach(function (rel) {
      let src = null;
      try { src = readText(rel); } catch (e) { return; }
      const lines = src.split('\n');
      lines.forEach(function (line, i) {
        const re = /\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$.]*)\s*===\s*(\d+)/g;
        let m;
        while ((m = re.exec(line))) {
          const key = m[1] + '.' + m[2];
          // 已被登记（同一站点文件内）⇒ 不算漏网
          const covered = owned.some(function (c) {
            return c.file === rel && c.var === m[1]
              && (table.sites || []).some(function (s) {
                return s.file === rel && s.var === m[1] && (s.fields || []).indexOf(m[2]) >= 0;
              });
          });
          if (covered) continue;
          const hit = owned.filter(function (c) { return c.var === m[1] && c.probe; })
            .some(function (c) { return pick(c.probe, m[2]) !== undefined; });
          if (!hit) continue;             // 字段不在任何已登记探针里 ⇒ 不是「读账本的点」
          problems.push({ kind: 'unregistered', file: rel, line: i + 1, field: key,
            detail: rel + ':' + (i + 1) + ' 出现未登记的散装读数 ' + key + '（新增读数必须进 tests/loose-readings.json）' });
        }
      });
    });
  }
  return { problems: problems, checked: checked, sites: (table.sites || []).map(function (s) { return s.id; }), probes: probes };
}

/** tests/ 下的测试文件面（按 `tests/test-surface-gate.js` 同口径取 .js；不含本工具自己的表）。 */
function listTestFiles() {
  const dir = path.join(ROOT, 'tests');
  return fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); })
    .map(function (f) { return 'tests/' + f; });
}

/** 登记表自身的结构自检（不依赖任何站点 ⇒ 门禁可用它做两向自证）。 */
function tableProblems(table) {
  const out = [];
  if (!table || !Array.isArray(table.sites)) return [{ kind: 'table-missing' }];
  if (!(table.shapes || []).every(function (s) { return SHAPES.indexOf(s) >= 0; })) {
    out.push({ kind: 'bad-shape-table' });
  }
  // 真值不得进表：站点对象里不许有 got / want / value 这类字段
  (table.sites || []).forEach(function (s) {
    ['got', 'want', 'value', 'expected'].forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(s, k)) {
        out.push({ kind: 'value-in-table', id: s.id, detail: '登记表里写了真值字段 ' + k + '（本表只登记站点）' });
      }
    });
  });
  return out;
}

function print(res) {
  const lines = [];
  lines.push('散装读数核对（U3 · ' + res.sites.length + ' 个登记站点 · 核对 ' + res.checked + ' 处字面量）');
  res.probes.forEach(function (p) { lines.push('  探针（真源）：' + p); });
  if (!res.problems.length) lines.push('  ✓ 全部站点与真源一致，且无未登记的新增散装读数');
  else res.problems.slice(0, 12).forEach(function (x) {
    lines.push('  ✗ [' + x.kind + '] ' + (x.id ? x.id + ' ' : '') + (x.detail || ''));
  });
  return lines.join('\n');
}

module.exports = { audit: audit, scanSite: scanSite, loadTable: loadTable, tableProblems: tableProblems,
  listTestFiles: listTestFiles, SHAPES: SHAPES, print: print, pick: pick };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const table = loadTable();
  if (argv.indexOf('--sites') >= 0) {
    console.log(JSON.stringify(table ? table.sites.map(function (s) { return s.id; }) : null));
  } else {
    const res = audit({});
    const tp = tableProblems(table);
    if (argv.indexOf('--json') >= 0) console.log(JSON.stringify({ audit: res, table: tp }, null, 2));
    else {
      console.log(print(res));
      if (tp.length) console.log('  表自检问题：' + JSON.stringify(tp));
      console.log(res.problems.length || tp.length ? '-> 有失配（exit 1）' : '-> 全绿（exit 0）');
    }
    process.exit(res.problems.length || tp.length ? 1 : 0);
  }
}

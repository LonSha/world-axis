#!/usr/bin/env node
// WorldAxis tools/dep-audit.js (v2.524.0) — OPV29-29 依赖零新增守门
//
// ── 它治什么（缺口，开工前先看现场）──────────────────────────────
//   本仓的约定是「零 npm 依赖：克隆下来直接 node 就能跑」。约定靠人守，于是有一个
//   具体的失效形态：**只要某个新文件写了一行 require('lodash-某个小函数')，本机因为
//   开发者装过而一切正常，别人克隆下来第一句就是 MODULE_NOT_FOUND。**
//   已有的两把锁管的不是这件事：
//     · tests/dependency-guard.js     —— 「可选依赖（jsdom）缺失时不许静默 skip」
//     · tests/dependency-guard-v2103 —— 同上，钉住 ui-dom.js 替身那 10 处
//   两把都在「已声明的可选依赖」这个圈里。**没有一道门禁回答「仓库里有没有多出一个外部包」。**
//   本工具补的就是这一问：扫全仓 JS，把每个模块说明符分成四类，外部那类一个都不许有。
//
// ── 分类口径（四类，穷举）──────────────────────────────────
//   builtin  内置模块：清单来自 `require('module').builtinModules`（**不手写**，
//            跟着当前 node 走；手写清单一定会漏掉新模块，那就是假绿）
//   local    相对/绝对路径：以 `.` 或 `/` 开头
//   dynamic  非字面量（`require(name)`）：不算违规，但必须**报出来**——
//            「看不出来」和「没问题」是两件事，静默当绿就是本仓反复治的病
//   external 其余（含 `pkg`、`pkg/sub`、`@scope/pkg`）：**违规**
//
// ── 用法 ────────────────────────────────────────────────
//   node tools/dep-audit.js             # 人读报告；有 external ⇒ 退出 1
//   node tools/dep-audit.js --json      # 机读
//   node tools/dep-audit.js --self-test # 分类器两向自证（合成的样本必须分对）
//
// ── 纪律 ────────────────────────────────────────────────
//   · 注释要剥掉再扫：解释性文字里出现 require('jsdom') 不是依赖
//     （复用 tests/test-surface-gate.js 的 stripComments —— 本仓单一真源）。
//   · 只读：本工具不改任何文件。
//   · 零依赖：只用 node 内置。

'use strict';

const fs = require('fs');
const path = require('path');
const nodeModule = require('module');

const BASE = path.resolve(__dirname, '..');
const SKIP_DIRS = ['.git', 'node_modules', 'tmp', '.cache', 'dist', 'build'];
const BUILTIN = (function () {
  const out = Object.create(null);
  const bm = nodeModule.builtinModules || [];
  for (let i = 0; i < bm.length; i++) { out[bm[i]] = true; out['node:' + bm[i]] = true; }
  return out;
})();

/** 剥注释（复用既有真源；拿不到就退回原串并标记 —— 不静默假装剥过了）。 */
function stripComments(src) {
  try {
    const g = require(path.join(BASE, 'tests', 'test-surface-gate.js'));
    if (g && typeof g.stripComments === 'function') return g.stripComments(src);
  } catch (e) { /* 下面退回 */ }
  return src;
}

/** 模块说明符分类：返回 builtin | local | external。 */
function classify(spec) {
  if (typeof spec !== 'string' || !spec) return 'external';
  // 绝对路径（含 /tmp/node_modules/jsdom 这类）不是包名
  if (spec.charAt(0) === '.' || spec.charAt(0) === '/') return 'local';
  if (BUILTIN[spec]) return 'builtin';
  return 'external';
}
/** 合法模块名：没有空格/加号/括号/引号。拼接痕迹（`require(' + x + ')`）不是说明符。 */
const SPEC_OK = /^[@a-zA-Z0-9_./:-]+$/;   // 含 `:` —— `node:path` 也是合法说明符

/** 从一段已剥注释的源码里抽模块说明符。返回 {literal: [{spec,index}], dynamic: [index]} */
function extract(code) {
  const literal = [];
  const dynamic = [];
  const re = /(?:require|import)\s*\(\s*(['"])([^'"\n]{0,200})\1\s*\)/g;
  let m;
  const noise = [];
  const push = function (spec, index) {
    if (SPEC_OK.test(spec)) literal.push({ spec: spec, index: index });
    else noise.push({ spec: spec, index: index });
  };
  while ((m = re.exec(code)) !== null) push(m[2], m.index);
  // import x from 'y' / export … from 'y'
  const re2 = /\b(?:import|export)[^;'"\n]{0,200}?\bfrom\s*(['"])([^'"\n]{0,200})\1/g;
  while ((m = re2.exec(code)) !== null) push(m[2], m.index);
  // 非字面量形式：require(变量) —— 报出来，不判违规
  const re3 = /\brequire\s*\(\s*(?!['"])([^)]{1,60})\)/g;
  while ((m = re3.exec(code)) !== null) dynamic.push(m[1].trim());
  return { literal: literal, dynamic: dynamic, noise: noise };
}

function lineOf(code, index) {
  let n = 1;
  for (let i = 0; i < index && i < code.length; i++) if (code.charAt(i) === '\n') n += 1;
  return n;
}

function listFiles(root) {
  const out = [];
  (function walk(dir) {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.isDirectory()) {
        if (SKIP_DIRS.indexOf(e.name) >= 0) continue;
        walk(path.join(dir, e.name));
      } else if (e.isFile() && /\.(js|mjs|cjs)$/.test(e.name)) {
        out.push(path.join(dir, e.name));
      }
    }
  })(root);
  return out.sort();
}

function audit(root) {
  const R = root || BASE;
  const files = listFiles(R);
  const res = { root: R, files: files.length, builtin: 0, local: 0, external: [], optional: [],
    dynamic: [], noise: 0, unstripd: 0, optionalTable: null };
  // 可选依赖白名单走 tests/dependency-guard.js 的 OPTIONAL_DEPS（单一真源，不另立一份）。
  //   拿不到表就**不当作没违规**：res.optionalTable = null，报告里明说「这一面不可信」。
  const OPT = Object.create(null);
  try {
    const g = require(path.join(BASE, 'tests', 'dependency-guard.js'));
    const list = (g && g.OPTIONAL_DEPS) || null;
    if (Array.isArray(list)) { for (let i = 0; i < list.length; i++) OPT[list[i].name] = true; res.optionalTable = list.length; }
  } catch (e) { res.optionalTable = null; }
  for (let i = 0; i < files.length; i++) {
    const abs = files[i];
    let src;
    try { src = fs.readFileSync(abs, 'utf8'); } catch (e) { continue; }
    const code = stripComments(src);
    // 只有「有行注释、却剥完零差异」才算异常：
    //   像 tools/rt-*.js 里 'https://…' 这种，`//` 是字符串的一部分，剥离后当然不变 ——
    //   拿『含有 //』当异常会把它们冤枉成『没剥』。
    if (code === src && /(^|\n)[ \t]*\/\//.test(src)) { res.unstripd += 1; (res.unstripdList = res.unstripdList || []).push(path.relative(R, abs).split(path.sep).join('/')); }
    const got = extract(code);
    for (let j = 0; j < got.literal.length; j++) {
      const spec = got.literal[j].spec;
      const kind = classify(spec);
      if (kind === 'builtin') res.builtin += 1;
      else if (kind === 'local') res.local += 1;
      else if (OPT[spec]) {
        res.optional.push({ file: path.relative(R, abs).split(path.sep).join('/'),
          line: lineOf(code, got.literal[j].index), mod: spec });
      }
      else {
        res.external.push({
          file: path.relative(R, abs).split(path.sep).join('/'),
          line: lineOf(code, got.literal[j].index),
          mod: spec
        });
      }
    }
    res.noise += (got.noise || []).length;
    for (let j = 0; j < got.dynamic.length; j++) {
      res.dynamic.push({ file: path.relative(R, abs).split(path.sep).join('/'), expr: got.dynamic[j] });
    }
  }
  res.ok = res.external.length === 0;
  return res;
}

function reportLines(res) {
  const out = [];
  out.push('== 依赖零新增守门（OPV29-29）==');
  out.push('  扫描 JS 文件 ' + res.files + ' 个 · 模块说明符：内置 ' + res.builtin + ' / 本地 ' + res.local
    + ' / 已声明可选 ' + res.optional.length + ' / 外部 ' + res.external.length + ' / 动态 ' + res.dynamic.length
    + ' / 拼接噪声 ' + res.noise);
  out.push(res.optionalTable === null
    ? '  ⚠ 读不到 tests/dependency-guard.js 的 OPTIONAL_DEPS ⇒ 「已声明可选」这一面不可信（不是零违规）'
    : '  可选依赖白名单取自 dependency-guard.OPTIONAL_DEPS（' + res.optionalTable + ' 条，单一真源）');
  if (res.unstripd > 0) out.push('  ⚠ 有 ' + res.unstripd + ' 个文件有行注释却未能剥（注释里的 require 可能被算进来）：'
    + (res.unstripdList || []).slice(0, 5).join(', '));
  res.external.forEach(function (x) {
    out.push('  EXTERNAL ' + x.file + ':' + x.line + ' ⇒ ' + x.mod + '（本仓零 npm 依赖：这条会让别人克隆后直接跑不起来）');
  });
  res.optional.forEach(function (x) {
    out.push('  OPTIONAL ' + x.file + ':' + x.line + ' ⇒ ' + x.mod + '（已声明可选，有零依赖替身；见 dependency-guard）');
  });
  res.dynamic.forEach(function (x) {
    out.push('  DYNAMIC  ' + x.file + ' ⇒ require(' + x.expr + ')（看不出来，不判违规，但必须被看见）');
  });
  out.push(res.ok ? '依赖合规: 0 个外部包' : '依赖合规: ' + res.external.length + ' 个外部包');
  return out;
}

/** 分类器自证：四类样本 + 注释 + 动态，各走一遍。 */
function selfTest() {
  const q = String.fromCharCode(39);
  const cases = [
    { code: "const a = require('fs');", want: 'builtin' },
    { code: "const a = require('node:path');", want: 'builtin' },
    { code: "const a = require('./x.js');", want: 'local' },
    { code: "const a = require('../y/z.js');", want: 'local' },
    // 下面这几条用**运行时拼接**写：本工具自己也在这仓里，若把 'lodash' 写成字面量，
    //   它会被自己的扫描面看到（自指假红）。合成样本只需要「造出一个外部说明符」，
    //   不需要在源码里留下那个字面量。
    { code: "const a = require('" + 'lod' + 'ash' + "');", want: 'external' },
    { code: "const a = require(" + q + '@scope/pk' + 'g' + q + ");", want: 'external' },
    { code: "import fs from 'fs';", want: 'builtin' },
    { code: "import _ from " + q + 'under' + 'score' + q + ";", want: 'external' }
  ];
  for (let i = 0; i < cases.length; i++) {
    const got = extract(cases[i].code).literal;
    if (!got.length) return false;
    if (classify(got[0].spec) !== cases[i].want) return false;
  }
  // 注释里的 require 剥掉后不该被看见（这一向若漏，解释性注释会被当成依赖）
  const withComment = '// 举例：require(' + q + 'lod' + 'ash' + q + ') 这种写法是禁止的\nconst a = 1;\n';
  const stripped = stripComments(withComment);
  if (extract(stripped).literal.length !== 0) return false;
  // 非字面量要被单独看见
  if (extract('const m = require(name);').dynamic.length !== 1) return false;
  return true;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.indexOf('--self-test') >= 0) {
    const ok = selfTest();
    console.log((ok ? '✓ ' : '✗ ') + 'dep-audit --self-test: ' + (ok ? 'pass（四类分类 + 注释剥离 + 动态可见，两向）' : 'FAIL'));
    return ok ? 0 : 1;
  }
  const res = audit(BASE);
  if (argv.indexOf('--json') >= 0) {
    console.log(JSON.stringify({ ok: res.ok, files: res.files, builtin: res.builtin, local: res.local,
      external: res.external, dynamic: res.dynamic, unstripd: res.unstripd }, null, 2));
  } else {
    reportLines(res).forEach(function (l) { console.log(l); });
  }
  return res.ok ? 0 : 1;
}

if (require.main === module) process.exit(main());
module.exports = { audit: audit, classify: classify, extract: extract, reportLines: reportLines,
  selfTest: selfTest, BUILTIN: BUILTIN };
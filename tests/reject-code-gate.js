#!/usr/bin/env node
// WorldAxis tests/reject-code-gate.js — \u62d2\u6536\u7801\u53ef\u8fbe\u6027\u95e8\u7981\uff08v2.78.0 \u7b2c\u5341\u4e8c\u9762\uff09
//
// \u7f3a\u53e3\uff08\u5b83\u6cbb\u4ec0\u4e48\uff09\uff1a
//   \u4ed3\u5e93\u91cc\u6bcf\u4e2a\u5f15\u64ce\u90fd\u7528 `reason: '<code>'` \u544a\u8bc9\u8c03\u7528\u65b9\u300c\u4e3a\u4f55\u62d2\u6536\u300d\uff0c\u4f46\u300c\u7801\u5199\u5728\u6e90\u7801\u91cc\u300d
//   \u4e0d\u7b49\u4e8e\u300c\u7801\u8dd1\u5f97\u5230\u300d\u3002v2.77.0 \u5df2\u5b9e\u8bc1\u8fc7\u4e24\u79cd\u53d8\u4f53\uff1a
//     \u00b7 **\u4e0d\u53ef\u8fbe**\uff1a\u5206\u652f\u5199\u5728\u90a3\u91cc\uff0c\u4f46\u8bed\u6cd5/\u524d\u7f6e\u5df2\u628a\u5b83\u6c38\u8fdc\u6321\u5728\u5916\u9762\uff08\u5b88\u536b\u4e0d\u53ef\u8fbe\uff09\uff1b
//     \u00b7 **\u4ee3\u7801\u53ef\u8fbe\u4f46\u73b0\u573a\u6c38\u8fdc\u4e0d\u4f1a\u8fbe**\uff1a\u524d\u7f6e\u5df2\u5728\u5199\u5165\u9762\u628a\u975e\u6cd5\u503c\u6316\u6389\uff0c\u6df1\u5c42\u6821\u9a8c\u53ea\u80fd\u9760\u76f4\u63a5\u8c03\u5185\u90e8\u51fd\u6570\u89e6\u53d1\u3002
//   \u4e24\u8005\u90fd\u662f\u300c\u5b58\u5728\u4f46\u4e0d\u53ef\u8bc1\u300d\u7684\u7801\u2014\u2014\u800c\u4e00\u4e2a\u4ece\u672a\u88ab\u89c2\u5bdf\u8fc7\u7684\u7801\uff0c\u4e0b\u4e00\u6b21\u88ab\u6539\u6210
//   \u522b\u7684\u610f\u601d\u4e5f\u6ca1\u4eba\u77e5\u9053\u3002\u672c\u9762\u628a\u5b83\u53d8\u6210\u300c\u4e0d\u5f97\u9759\u9ed8\u300d\uff1a\u6bcf\u4e2a\u7801\u5fc5\u987b\u4e8c\u9009\u4e00\u5f52\u4f4d\u3002
//
// \u5224\u636e\uff1a\u4ea7\u54c1\u6e90\u7801\u91cc\u7684**\u6bcf\u4e00\u4e2a**\u62d2\u6536\u7801\uff0c\u5fc5\u987b\u843d\u5728\u4e0b\u5217\u4e24\u4e2a\u96c6\u5408\u4e4b\u4e00\uff1a
//     ① WITNESSED\uff1a\u6709\u53ef\u6267\u884c\u89c1\u8bc1\u2014\u2014\u7528\u771f API \u8c03\u7528\u628a\u5b83\u771f\u8dd1\u51fa\u6765\uff08\u89c1 reject-v2780.js \u7684\u89c1\u8bc1\u8868\uff09\uff1b
//     ② DEAD\uff1a\u5df2\u8bc1**\u4e0d\u53ef\u8fbe**\uff0c\u5e76\u5e26\u7740\u53ef\u590d\u7b97\u7684\u4e0d\u53ef\u8fbe\u4f9d\u636e\uff08\u9501\u5728\u6e90\u7801\u91cc\u7684\u951a\u70b9\u5b57\u9762\u91cf\uff09\u3002
//   \u4e24\u8005\u4e4b\u5916\u7684\u7801\uff08\u542b\u65b0\u589e\u7684\uff09\u4e00\u5f8b\u7ea2\u706f\u2014\u2014\u300c\u672a\u5206\u7c7b\u62d2\u6536\u7801\u300d\u3002\n//
// \u4e3a\u4f55\u4e0d\u628a DEAD \u76f4\u63a5\u5220\u6389\uff1a\u5220\u4e86\u5c31\u6ca1\u4eba\u77e5\u9053\u300c\u8fd9\u91cc\u539f\u672c\u6709\u4e00\u9053\u9632\u5fa1\u300d\u3002depth-in-depth \u5b88\u536b\u5728\u4e0a\u5c42\u5951\u7ea6\u53d8\u52a8\u65f6\n//   \u4f1a\u91cd\u65b0\u53d8\u5f97\u53ef\u8fbe\uff08\u4f8b\uff1a\u82e5 setDerive \u653e\u5bbd\u4e86 path \u6821\u9a8c\uff0cbad-path \u7acb\u523b\u590d\u6d3b\uff09\uff0c\u6240\u4ee5\u6b63\u786e\u7684\u5904\u7f6e\n//   \u662f**\u767b\u8bb0\u4e3a\u4e0d\u53ef\u8fbe + \u9489\u4f4f\u90a3\u4e2a\u524d\u63d0**\uff0c\u800c\u4e0d\u662f\u628a\u5b83\u62b9\u6389\u3002
'use strict';
const fs = require('fs');
// v2.78.0: 扫描面必须与「真会被执行的代码」同宽 —— 复用 v2.75.0 已落地的去注释剥离器
//   （长度与行号守恒，故命中行号仍可与原文对照）。为什么不可省：初版按原文扫，于是
//   bridge.js 文档注释里那句 `reason: 'pull'`（实际写的是**调用示例**）被当成一个真拒收码
//   进了盘点——265 里有 1 个是注释。这正是 v2.75.0 [D2] 治过的「提及不是引用」：
//   判据的输入面错一格，账本里就会永久多一条不存在的债。
const { stripComments } = require('./test-surface-gate.js');
const path = require('path');
const BASE = path.join(__dirname, '..');

// \u4ea7\u54c1\u6e90\u7801\u8303\u56f4\uff08\u4e0e tests/inventory.js \u7684\u4ea7\u54c1\u9762\u540c\u6e90\uff1a\u6392\u9664 tests/ \u4e0e tools/\uff09
const DIRS = ['core', 'engines', 'actors', 'direction', 'render', 'compat', 'ui'];
function productFiles() {
  const out = ['index.js'];
  DIRS.forEach(function (d) {
    const abs = path.join(BASE, d);
    if (!fs.existsSync(abs)) return;
    fs.readdirSync(abs).sort().forEach(function (f) { if (f.endsWith('.js')) out.push(d + '/' + f); });
  });
  return out;
}
// \u8bcd\u6cd5\u718a\u5ea6\u5c40\u9650\uff1a\u53ea\u8ba4**\u5185\u8054\u5b57\u9762\u91cf** `reason: 'x'`\u3002\u62fc\u63a5\u5199\u6cd5\uff08`reason: 'already-' + st`\uff09\u4ee3\u7801\u4e0d\u5b9a\uff0c
//   \u6545\u4e0d\u62a5\u9519\u4e5f\u4e0d\u4f2a\u5f52\u4e00\uff1b\u5b83\u4eec\u7684\u7a33\u5b9a\u6027\u7531\u5404\u81ea\u5f15\u64ce\u7684\u4e13\u9501\u8d1f\u8d23\u3002
const CODE_RE = /reason\s*:\s*'([a-zA-Z][a-zA-Z0-9_-]*)'/g;
const CODE_RE_G = function () { return new RegExp(CODE_RE.source, 'g'); };

function scan(deps) {
  const d = deps || {};
  // read 可注入：负向自证要在**内存副本**上重跑同一份判据（真源码破坏、零文件改写）。
  const read = d.read || function (rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); };
  const files = productFiles();
  const hits = {};   // code -> [{file, line}]
  files.forEach(function (rel) {
    const src = stripComments(read(rel));
    let m;
    const re = CODE_RE_G();
    while ((m = re.exec(src)) !== null) {
      const code = m[1];
      const line = src.slice(0, m.index).split('\n').length;
      (hits[code] = hits[code] || []).push({ file: rel, line: line });
    }
  });
  return { files: files, hits: hits };
}

/**
 * \u5ba1\u8ba1\uff1a\u4e09\u4e2a\u56de\u8f66\u9762
 *   \u2460 unclassified\uff1a\u65e2\u65e0\u89c1\u8bc1\u3001\u53c8\u672a\u5217\u6b7b\u8868 \u2192 \u7ea2\u706f\uff1b
 *   \u2461 deadMissing\uff1a\u6b7b\u8868\u7801\u5728\u6e90\u7801\u91cc\u627e\u4e0d\u5230\u4e86\uff08\u88ab\u9759\u9ed8\u5220\u6389\uff09\u2192 \u7ea2\u706f\uff1b
 *   \u2462 deadLeak\uff1a\u6b7b\u8868\u7801\u7684\u4e0d\u53ef\u8fbe\u951a\u70b9\u4e0d\u5728\u4e86\uff08\u524d\u63d0\u5df2\u53d8\uff0c\u5b83\u53ef\u80fd\u590d\u6d3b\uff09\u2192 \u7ea2\u706f\u3002
 */
function audit(deps) {
  const d = deps || {};
  const witnessed = d.witnessed || {};        // code -> \u89c1\u8bc1\u63cf\u8ff0
  const dead = d.dead || {};                  // code -> { anchor, why }（已证不可达）
  const base = d.base || {};            // code -> true（存量未分类，见 reject-code-ledger.json）
  const sc = scan(deps);
  const codes = Object.keys(sc.hits).sort();
  const unclassified = [];
  const deadMissing = [];
  const deadLeak = [];
  codes.forEach(function (c) {
    if (Object.prototype.hasOwnProperty.call(witnessed, c)) return;
    if (Object.prototype.hasOwnProperty.call(dead, c)) return;
    if (Object.prototype.hasOwnProperty.call(base, c)) { return; }
    unclassified.push(c);
  });
  // 基线冗余：台账里记着的码，如今已被见证或已从源码消失 ⇒ 应回收到 witnessed/dead，
  //   台账不得永久比现实胖（否则它慢慢变成一份没人读的名单）。
  const baseStale = Object.keys(base).filter(function (c) { return !!witnessed[c] || !sc.hits[c]; });
  Object.keys(dead).forEach(function (c) {
    if (!sc.hits[c]) { deadMissing.push(c); return; }
    const anchor = dead[c].anchor;
    if (anchor) {
      const present = sc.hits[c].some(function (h) {
        // 锚点检查走**原文**：锚点是源码字面量（可能紧邻注释），不能剥掉再找。
        const raw = d.read ? d.read(h.file) : fs.readFileSync(path.join(BASE, h.file), 'utf8');
        return raw.indexOf(anchor) >= 0;
      });
      if (!present) deadLeak.push(c);
    }
  });
  return { files: sc.files.length, total: codes.length, codes: codes,
    witnessed: Object.keys(witnessed).length, dead: Object.keys(dead).length,
    unclassified: unclassified, deadMissing: deadMissing, deadLeak: deadLeak,
    baseStale: baseStale, base: Object.keys(base).length,
    ok: !unclassified.length && !deadMissing.length && !deadLeak.length };
}

module.exports = { scan: scan, audit: audit, productFiles: productFiles, CODE_RE: CODE_RE,
  FACE: 'strip-comments（去注释，保留字符串字面量；长度与行号守恒）' };

// CLI：单独跑时先装载产品面，再用见证表驱动分类（单一真源：见证结果由真跑得出）
if (require.main === module) {
  require('./mock.js');
  const vm = require('vm');
  const ctx = vm.createContext(global);
  const runSrc = fs.readFileSync(path.join(__dirname, 'run.js'), 'utf8');
  const mm = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
  const LOAD = mm[1].match(/'([^']+)'/g).map(function (x) { return x.slice(1, -1); });
  LOAD.forEach(function (rel) {
    vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel });
  });
  const witness = require('./reject-v2780.js');
  const ledger = JSON.parse(fs.readFileSync(path.join(__dirname, 'reject-code-ledger.json'), 'utf8'));
  const base = {};
  (ledger.base || []).forEach(function (c) { base[c] = true; });
  const w = witness.runWitness(global.WorldAxis);
  const r = audit({ witnessed: w.expect, dead: witness.DEAD, base: base });
  console.log('■ 拒收码可达性门禁（第十二面）');
  console.log('  产品文件 ' + r.files + ' 个，内联拒收码 ' + r.total + ' 个（见证 ' + r.witnessed + ' / 死表 ' + r.dead + ' / 基线 ' + r.base + '）');
  if (r.baseStale.length) console.log('  ✗ 台账冗余（已被见证或已消失，应回收）: ' + r.baseStale.slice(0, 12).join(', ') + (r.baseStale.length > 12 ? ' …（共 ' + r.baseStale.length + '）' : ''));
  if (w.missing.length) console.log('  ✗ 见证缺失（触发路径在、码跑不出）: ' + w.missing.join(', '));
  if (r.unclassified.length) console.log('  ✗ 未分类（既无见证也未列死）: ' + r.unclassified.join(', '));
  if (r.deadMissing.length) console.log('  ✗ 死表码在源码里已不存在: ' + r.deadMissing.join(', '));
  if (r.deadLeak.length) console.log('  ✗ 死表码的不可达锚点已消失（可能复活）: ' + r.deadLeak.join(', '));
  const ok = r.ok && !w.missing.length && !w.unexpected.length && !r.baseStale.length;
  if (ok) console.log('  ✓ 每个码都有归属（见证可跑 / 死表有据 / 基线在账），无新增静默码');
  process.exit(ok ? 0 : 1);
}

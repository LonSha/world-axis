#!/usr/bin/env node
// WorldAxis tools/net-audit.js (v2.204.0) — 网络外呼点位清单与门禁
//
// ── 它治的病（README 之外的第一处信任缺口）────────────────────────────
//   本仓对 SillyTavern 用户承诺「世界状态全部落本机」。但**这句话此前没有任何判据**：
//   全库唯一能回答「这个扩展会不会往外发东西」的地方，是 `core/api-router.js` 里那两行
//   `fetch` —— 而 Reader 要发现它们，只能把整个 `core/` 读完。
//   同族的失效形态已经在本仓各面现形过（写侧 / 删侧 / 读侧 / 活性面各有门禁），
//   唯独**出站面（egress）是零治理**：新加一行 `fetch` / `new WebSocket` / `EventSource`，
//   八道门禁一条都不会响，而它在用户那里的含义是「聊天内容可能被发到别处」。
//
// ── 口径（否定式，四条）────────────────────────────────────────────────
//   ① **只在真代码面上扫**（`tests/inventory.js` 的 `codeFace`，与清册同源）：
//      注释与**字符串字面量**里的 `fetch` 不算外呼 —— `core/sandbox.js` 的
//      `FORBIDDEN = ['fetch', ...]`（黑名单声明）与 `core/fault-context.js` 的
//      `/network|fetch|…/`（错误归类正则）都是**提及**，不是引用。
//      这条口径与 v2.29.0 立的「提及不是引用」逐字同规；不剥字符串就会把它们报成外呼点，
//      而**假警报会让整套门禁被当成噪声**（本仓 v2.105.0 的假红教训）。
//   ② **白名单是显式清单**：每个豁免点都要写明「允许哪几种形态 + 为什么」。
//      白名单不是「豁免表」，是**承诺书**：新增一个外呼点必须先改这张表 ——
//      改表这个动作本身就会被 review 看见。
//   ③ **零命中不算通过**：外呼点数 < MIN_SITES 时报红（空集上的「全部合规」恒真）。
//   ④ **只读、不给自动修**：`--fix` 不存在。这张清单的终态由人决定（发出去的东西
//      是产品决策，不是门禁能替你做的）。
//
// ── 与隐私文档的关系（为什么两者同批落地）────────────────────────────
//   门禁管「代码里没有计划外的外呼」，`docs/privacy.md` 管「用户读到的承诺」。
//   两者必须**同一批**改：只加门禁，用户看不到；只加文档，承诺无人执行
//   （这正是 README 的「tools/ 取舍」被判为「一句没人执行的规则」的同型病）。
//
// ── 用法 ──────────────────────────────────────────────────────────────
//   node tools/net-audit.js              # 清单 + 结论（有不合法点则 exit 1）
//   node tools/net-audit.js --json       # 机器可读
//   node tools/net-audit.js --self-test  # 真源存在性自证（缺一个即抛）
//   const N = require('../tools/net-audit.js'); N.audit({faceOf})   # 门禁复用同一份复算
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
/** 出站形态（真外呼）：字面量在**真代码面**上找（字符串/注释已被抹平）。 */
const PROBES = ['fetch(', 'XMLHttpRequest', 'EventSource', 'WebSocket', 'sendBeacon'];
/**
 * 动态 `import()`：**单独一档**，因为它有两种语义，混为一谈会造出假红。
 *   · `import('https://…')` / `import('//…')` ⇒ **真外呼**（跨源拉一段脚本），必须登记；
 *   · `import('/scripts/world-info.js')` ⇒ **宿主同源模块加载**（SillyTavern 自己的文件，
 *     不离开本机）—— 现场形态见 `engines/worldbook.js:98`。
 *   前一版把 `import(` 直接并进 PROBES，于是 worldbook 那处被报成「未登记外呼」而现红 ——
 *   病灶不在产品里，在**判据的输入面比结论面宽**（本仓 2026-10 点名的同族教训）。
 *   故这里按**参数是不是外部 URL**分流：外部 URL 进 egress，同源路径如实列进 hostImports
 *   （可见、可复算、但不冒充外呼）。
 */
const EXT_IMPORT_RE = /import\s*\(\s*['"`](\/\/|https?:\/\/)[^'"`]*['"`]/g;
const ANY_IMPORT_RE = /import\s*\(\s*['"`]([^'"`]+)['"`]/g;
/** 白名单：文件 → `{forms, why}`。forms 为 `'*'` 表示该文件允许全部形态。 */
const WHITELIST = {
  'core/api-router.js': { forms: ['fetch('], why: '唯一出站出口：LLM API 通道调用 + 模型列表拉取（用户自己在「连接」页配的 baseUrl / apiKey；发的是该通道的 messages + model 参数）' }
};
/** 反空转下限：现场实测 2 处（api-router 的两次 fetch）。 */
const MIN_SITES = 2;
/** 产品文件面：委托 `tests/product-files.js`（本仓「产品文件有哪些」的单一真源）。 */
function productFiles(root) {
  return require(path.join(root, 'tests', 'product-files.js')).productFiles(root);
}
/** 真代码面：委托 `tests/inventory.js` 的 codeFace（与清册同源，不另写剥离器）。 */
function codeFace(root, src) {
  return require(path.join(root, 'tests', 'inventory.js')).codeFace(src);
}
/**
 * 现场扫描。opt.srcOf / opt.faceOf 可注入 —— 负控制据此在**内存副本**上做真破坏
 * 再重跑同款判据（与 `tools/fact-report.js` 的 `opt.read` 同规格）。
 * 返回 `{ok, sites, files, problems, whitelist, minSites}`，不抛。
 */
function audit(opt) {
  const o = opt || {};
  const root = o.root || BASE;
  const srcOf = o.srcOf || function (rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); };
  const faceOf = o.faceOf || function (rel) { return codeFace(root, srcOf(rel)); };
  let files = [];
  try { files = productFiles(root); }
  catch (e) { return { ok: false, reason: 'product-files-unreadable', sites: [], files: 0, problems: [], whitelist: WHITELIST, minSites: MIN_SITES }; }
  const sites = [];
  const hostImports = [];
  files.forEach(function (rel) {
    const face = faceOf(rel);
    PROBES.forEach(function (form) {
      const n = face.split(form).length - 1;
      for (let i = 0; i < n; i++) sites.push({ rel: rel, form: form });
    });
    // 动态 import：外部 URL ⇒ egress；同源/相对路径 ⇒ hostImports（如实登记，不报红）
    const src = srcOf(rel);
    let m;
    EXT_IMPORT_RE.lastIndex = 0;
    while ((m = EXT_IMPORT_RE.exec(src)) !== null) sites.push({ rel: rel, form: 'import(external)' });
    ANY_IMPORT_RE.lastIndex = 0;
    while ((m = ANY_IMPORT_RE.exec(src)) !== null) {
      if (!/^(\/\/|https?:\/\/)/.test(m[1])) hostImports.push({ rel: rel, spec: m[1] });
    }
  });
  const problems = [];
  // ① 逐站点白名单核对
  sites.forEach(function (s) {
    const w = WHITELIST[s.rel];
    if (!w) { problems.push({ kind: 'unlisted', rel: s.rel, form: s.form }); return; }
    if (w.forms !== '*' && w.forms.indexOf(s.form) < 0) problems.push({ kind: 'form-not-allowed', rel: s.rel, form: s.form });
  });
  // ② 白名单腐烂：登记了却现场零命中 ⇒ 要么它已改名、要么外呼已挪走（两种都得让人看见）
  Object.keys(WHITELIST).forEach(function (rel) {
    if (!sites.some(function (s) { return s.rel === rel; })) problems.push({ kind: 'stale-whitelist', rel: rel });
  });
  // ③ 反空转下限
  if (sites.length < MIN_SITES) problems.push({ kind: 'too-few-sites', got: sites.length, min: MIN_SITES });
  return { ok: problems.length === 0, sites: sites, hostImports: hostImports, files: files.length,
    problems: problems, whitelist: WHITELIST, minSites: MIN_SITES };
}
/** 自证：真源存在且可读（缺一个即抛——「算不出来不得当作算过」）。 */
function selfTest(opt) {
  const root = (opt && opt.root) || BASE;
  ['tests/product-files.js', 'tests/inventory.js', 'docs/privacy.md'].forEach(function (rel) {
    if (!fs.existsSync(path.join(root, rel))) throw new Error('真源缺失：' + rel);
  });
  const r = audit(opt);
  if (!r.files) throw new Error('产品文件面为空（扫描面塌了，本门禁会在空集上恒真）');
  return { ok: true, files: r.files, sites: r.sites.length };
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.indexOf('--self-test') >= 0) {
    const s = selfTest({});
    console.log('■ net-audit 自证：产品文件 ' + s.files + ' 个 · 外呼点 ' + s.sites + ' 处');
    process.exit(0);
  }
  const r = audit({});
  if (args.indexOf('--json') >= 0) { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); }
  console.log('■ 网络外呼点位门禁（真代码面口径：注释与字符串里的提及不算）');
  console.log('  产品文件 ' + r.files + ' 个 · 出站点 ' + r.sites.length + ' 处（下限 ' + r.minSites + '）');
  r.sites.forEach(function (s) { console.log('    · ' + s.rel + '  [' + s.form + ']'); });
  console.log('  宿主同源动态 import ' + (r.hostImports || []).length + ' 处（不离开本机，单独一档 —— 不冒充外呼、也不消失）：');
  (r.hostImports || []).forEach(function (h) { console.log('    · ' + h.rel + '  →  ' + h.spec); });
  console.log('  白名单 ' + Object.keys(r.whitelist).length + ' 条（每条须写明允许的形态与理由）：');
  Object.keys(r.whitelist).forEach(function (rel) {
    const w = r.whitelist[rel];
    console.log('    · ' + rel + '  ' + (w.forms === '*' ? '（全部形态）' : w.forms.join(',')) + ' —— ' + w.why);
  });
  if (r.problems.length) {
    r.problems.forEach(function (p) { console.log('  ✗ ' + p.kind + '：' + p.rel + (p.form ? ' [' + p.form + ']' : '')); });
    process.exit(1);
  }
  console.log('  ✓ 每个外呼点都在白名单内、每条白名单都在现场命中，无计划外外呼');
  process.exit(0);
}
module.exports = { BASE: BASE, PROBES: PROBES, WHITELIST: WHITELIST, MIN_SITES: MIN_SITES,
  productFiles: productFiles, codeFace: codeFace, audit: audit, selfTest: selfTest };

#!/usr/bin/env node
/**
 * WorldAxis tools/registry-audit.js (v2.529.0) — OPV29-26 登记一致性校验（三处自动对账）
 *
 * ── 它治什么（本版现场）─────────────────────────────────────────────
 *   「加一台引擎」要碰三处登记：`defaultWorldState()` 的骨架键、`core/store.js` 的
 *   `__BOUNDED_CAPS`（上界声明）、`core/evict.js` 的 `SITES`（挤出执行点）。三处漏一处
 *   都**不会报错**，只会静默出问题：漏 SITES ⇒ 容器能无限长且没人记账；漏 CAPS ⇒
 *   没人知道它有界、容量体检看不见它；漏骨架 ⇒ 上界登记在一个永远不存在的容器上。
 *   此前只能靠人眼扫两张几百行的表 —— 而人眼扫一遍的结论**不可复算**。
 *
 * ── 口径（先说不做什么）─────────────────────────────────────────────
 *   ① **不重复实现已有的边**（同一件事两处判据必然漂移，v2.187.0 吃过这个亏）：
 *      · 「SITES 站点 ⇄ 产品代码调用点」由 `tests/run.js` 的 G18 门禁钉（v2.13.0，双向）；
 *      · 「CAPS 键 ⇄ 骨架物化（含通配跳过 / 类型错配）」由 `core/store.js` 的
 *        `registryParity()` 在运行时做。
 *      本工具只补**第四边 SITES ⇄ CAPS**，并把上面两条边的入口在报告里点名，不复制其判据。
 *   ② **「不同键」不是缺陷，「无人能解释的不同键」才是**。SITES 的 path 可以含通配
 *      （`people.*.profile.*`），CAPS 侧按细粒度逐键展开；SITES 的 cap 可以是
 *      `'per-call'`（上界来自运行时设置项，写不成数字）。于是 SITES 独有分三档：
 *      字面命中 / 通配段位命中 / per-call 豁免；三档**分别计数**，不合成一个「一致」。
 *   ③ **两侧都是纯数字才比对 cap**。任一侧是函数体或 `'per-call'` 就计入 non-numeric ——
 *      不当成 0，也不当成相等（「算不出来不得当作算过」）。
 *   ④ **解析必须同时认单引号与双引号**。本工具初版只判 `site: '…'`，于是把 `core/store.js`
 *      里 12 条双引号写法的 site（`site: "vitals.js evict.array(rows, \"vitals.rows\")"`）
 *      报成「无执行者」—— 假红 12 条。同一形态的坑本仓已踩过四次（dep-audit 的跨行正则、
 *      拼接串、自指样本、`//` 属字符串）：**解析器的字面面永远比代码事实窄**。
 *   ⑤ **`cap: 0` + `site: '当前无写入方'` 是显式声明**，不是缺陷：把不该被写入的容器登记成
 *      cap 0，任何写入都会被容量体检当场抓到。但它必须**被点名**，不许混进「合规」里静默通过。
 *   ⑥ **未登记的结构化标签一律红**。site 若不是 `xxx.js` 也不是已知结构化标签，
 *      就等于「一段自由文本」，那正是本表在 v2.234.0 之前的老毛病（代码改了 cap 没人知道，
 *      登记表还继续自称权威）。
 *
 * ── 用法 ──────────────────────────────────────────────────────
 *   node tools/registry-audit.js                 # 人读报告，红则 exit 1
 *   node tools/registry-audit.js --json          # 机器可读（判据用）
 *   node tools/registry-audit.js --root=<仓库根>  # 对账另一棵树（负控制用）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const ANCHOR_SITES = 'const SITES = {';
const ANCHOR_CAPS = 'const __BOUNDED_CAPS = {';
/** 结构化执行者标签：不是某个 .js 里的函数，而是「由某个机制统一执行」的可核声明。 */
const STRUCT_TAGS = [
  'store.withOwnerState write capacity',
  'liaison.sceneOpen explicit capacity refusal'
];
const NO_WRITER = '当前无写入方';

const ENTRY_RE = /^\s{4}(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*\{(.*)$/;
const SITE_RE = /site:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/;
const PATH_RE = /path:\s*'([^']+)'/;
const CAP_RE = /cap:\s*([^,]+)/;

/** 取一张静态表的文本块。锚点必须**恰中一次**：0 次 anchor-missing，2 次 anchor-ambiguous。 */
function readBlock(root, rel, anchor) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return { ok: false, why: 'file-missing:' + rel, text: '' };
  const t = fs.readFileSync(p, 'utf8');
  const hits = t.split(anchor).length - 1;
  if (hits === 0) return { ok: false, why: 'anchor-missing:' + rel, text: '' };
  if (hits > 1) return { ok: false, why: 'anchor-ambiguous(' + hits + '):' + rel, text: '' };
  const i = t.indexOf(anchor);
  const j = t.indexOf('\n  };', i);
  return { ok: true, why: '', text: t.slice(i, j < 0 ? t.length : j) };
}

/** `core/evict.js` 的 SITES：站点名 → { path, cap, kind }。 */
function parseSites(text) {
  const rows = [];
  text.split('\n').forEach(function (l) {
    const m = ENTRY_RE.exec(l);
    if (!m) return;
    const body = m[3];
    const pm = PATH_RE.exec(body);
    if (!pm) return;
    const cm = CAP_RE.exec(body);
    const capRaw = cm ? cm[1].trim() : '';
    rows.push({
      site: m[1] || m[2],
      path: pm[1],
      capRaw: capRaw,
      wildcard: pm[1].indexOf('*') >= 0,
      perCall: capRaw === "'per-call'"
    });
  });
  return rows;
}

/** `core/store.js` 的 __BOUNDED_CAPS：键 → { cap, site, wildcard }。 */
function parseCaps(text) {
  const rows = [];
  text.split('\n').forEach(function (l) {
    const m = ENTRY_RE.exec(l);
    if (!m) return;
    const body = m[3];
    const sm = SITE_RE.exec(body);
    const site = sm ? (sm[1] !== undefined ? sm[1] : sm[2]) : null;
    const cm = CAP_RE.exec(body);
    rows.push({
      key: m[1] || m[2],
      capRaw: cm ? cm[1].trim() : '',
      site: site,
      hasSite: site !== null,
      wildcard: /wildcard:\s*true/.test(body)
    });
  });
  return rows;
}

/** 段位通配匹配：`*` 匹配**任意一段**；段数必须相同（跨层级不算覆盖）。 */
function segMatch(pat, key) {
  const a = String(pat).split('.');
  const b = String(key).split('.');
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== '*' && a[i] !== b[i]) return false;
  }
  return true;
}

/** 仓库里所有 .js 的文件名集合（只判「文件在不在」，不判它在哪个目录）。 */
function jsFileNames(root) {
  const out = {};
  (function walk(d) {
    let ents;
    try { ents = fs.readdirSync(d); } catch (e) { return; }
    ents.forEach(function (n) {
      if (n === '.git' || n === 'node_modules') return;
      const p = path.join(d, n);
      let st;
      try { st = fs.statSync(p); } catch (e) { return; }
      if (st.isDirectory()) walk(p);
      else if (n.slice(-3) === '.js') out[n] = 1;
    });
  })(root);
  return out;
}

function audit(root) {
  const R = root || ROOT;
  const sitesBlk = readBlock(R, path.join('core', 'evict.js'), ANCHOR_SITES);
  const capsBlk = readBlock(R, path.join('core', 'store.js'), ANCHOR_CAPS);
  const red = [];
  if (!sitesBlk.ok) red.push({ kind: 'anchor', detail: sitesBlk.why });
  if (!capsBlk.ok) red.push({ kind: 'anchor', detail: capsBlk.why });
  const sites = sitesBlk.ok ? parseSites(sitesBlk.text) : [];
  const caps = capsBlk.ok ? parseCaps(capsBlk.text) : [];
  if (sitesBlk.ok && sites.length === 0) red.push({ kind: 'parse', detail: 'SITES 解析出 0 条（空表上「零冲突」是恒真的）' });
  if (capsBlk.ok && caps.length === 0) red.push({ kind: 'parse', detail: 'CAPS 解析出 0 条（空表上「零冲突」是恒真的）' });

  const capsByKey = {};
  caps.forEach(function (c) { capsByKey[c.key] = c; });
  const sitePaths = {};
  sites.forEach(function (s) { sitePaths[s.path] = s; });

  // ── 边 1a：SITES 的每个 path 必须被 CAPS 覆盖（字面 / 通配段位 / per-call 豁免）──
  const edge1 = { both: [], wildcardCover: [], perCall: [], uncovered: [], capDrift: [], nonNumeric: 0 };
  sites.forEach(function (s) {
    if (Object.prototype.hasOwnProperty.call(capsByKey, s.path)) {
      edge1.both.push(s.path);
      const sc = s.capRaw, cc = capsByKey[s.path].capRaw;
      const scNum = /^\d+$/.test(sc), ccNum = /^\d+$/.test(cc);
      if (scNum && ccNum) {
        if (Number(sc) !== Number(cc)) edge1.capDrift.push({ path: s.path, sites: sc, caps: cc });
      } else {
        edge1.nonNumeric += 1;
      }
      return;
    }
    if (s.wildcard) {
      const hit = caps.filter(function (c) { return segMatch(s.path, c.key) || segMatch(c.key, s.path); });
      if (hit.length) { edge1.wildcardCover.push({ path: s.path, site: s.site, covered: hit.length }); return; }
    }
    if (s.perCall) { edge1.perCall.push({ path: s.path, site: s.site }); return; }
    edge1.uncovered.push({ path: s.path, site: s.site, cap: s.capRaw, wildcard: s.wildcard });
  });
  edge1.uncovered.forEach(function (u) {
    red.push({ kind: 'site-uncapped', detail: u.site + ' 的 path「' + u.path + '」在 CAPS 里既无字面键、也无法被通配覆盖，且不是 per-call（cap=' + u.cap + '）' });
  });
  edge1.capDrift.forEach(function (d) {
    red.push({ kind: 'cap-drift', detail: '「' + d.path + '」SITES.cap=' + d.sites + ' 与 CAPS.cap=' + d.caps + ' 不一致（真执行与声明分了家）' });
  });

  // ── 边 1b：CAPS 独有（引擎内自截断）——点名计数，不当成缺陷 ──
  const capsOnly = caps.filter(function (c) { return !Object.prototype.hasOwnProperty.call(sitePaths, c.key); });

  // ── 边 2：CAPS 的每条登记必须点名一个可核的执行者 ──
  const files = jsFileNames(R);
  const edge2 = { namedJs: 0, structural: [], noWriter: [], unresolved: [], unnamed: 0 };
  caps.forEach(function (c) {
    if (!c.hasSite || String(c.site).trim() === '') {
      edge2.unnamed += 1;
      red.push({ kind: 'site-unnamed', detail: '「' + c.key + '」登记了上界 cap=' + c.capRaw + '，但 site 为空 —— 没人知道谁在截断' });
      return;
    }
    const mm = c.site.match(/[A-Za-z0-9_-]+\.js/g);
    if (mm) {
      const bad = mm.filter(function (f) { return !files[f]; });
      if (bad.length) {
        edge2.unresolved.push({ key: c.key, site: c.site, missing: bad });
        red.push({ kind: 'site-unresolved', detail: '「' + c.key + '」的 site 指到不存在的文件：' + bad.join(',') + '（引擎改名/搬迁后登记没跟）' });
      } else {
        edge2.namedJs += 1;
      }
      return;
    }
    if (STRUCT_TAGS.indexOf(c.site) >= 0) { edge2.structural.push({ key: c.key, tag: c.site }); return; }
    if (c.site === NO_WRITER) {
      edge2.noWriter.push({ key: c.key, cap: c.capRaw });
      // cap 必须是 0：声明「没有写入方」却给了正数上界，两者必有一个是错的
      if (!/^0$/.test(c.capRaw)) {
        red.push({ kind: 'no-writer-with-cap', detail: '「' + c.key + '」自称「当前无写入方」却登记 cap=' + c.capRaw });
      }
      return;
    }
    edge2.unnamed += 1;
    red.push({ kind: 'site-untagged', detail: '「' + c.key + '」的 site「' + c.site + '」既不是 .js 也不是已知结构化标签 —— 自由文本不构成可核的执行者' });
  });

  return {
    root: R,
    sites: { total: sites.length, wildcard: sites.filter(function (s) { return s.wildcard; }).length, perCall: sites.filter(function (s) { return s.perCall; }).length },
    caps: { total: caps.length, wildcard: caps.filter(function (c) { return c.wildcard; }).length },
    edge1: {
      both: edge1.both.length, wildcardCover: edge1.wildcardCover.length,
      perCall: edge1.perCall.length, uncovered: edge1.uncovered,
      capDrift: edge1.capDrift, nonNumeric: edge1.nonNumeric, capsOnly: capsOnly.length
    },
    edge2: {
      namedJs: edge2.namedJs, structural: edge2.structural.length,
      noWriter: edge2.noWriter.length, unresolved: edge2.unresolved, unnamed: edge2.unnamed
    },
    delegated: [
      { edge: 'SITES ⇄ 调用点', to: 'tests/run.js G18 门禁（双向：声明有调用点 / 调用点有声明）' },
      { edge: 'CAPS ⇄ 骨架物化', to: 'core/store.js registryParity()（运行时，含通配跳过与类型错配）' }
    ],
    red: red,
    ok: red.length === 0
  };
}

function report(r) {
  const L = [];
  L.push('■ 登记一致性对账（OPV29-26）  root=' + r.root);
  L.push('  SITES ' + r.sites.total + ' 条（通配路径 ' + r.sites.wildcard + ' · per-call ' + r.sites.perCall + '）'
    + ' · CAPS ' + r.caps.total + ' 条（通配键 ' + r.caps.wildcard + '）');
  L.push('  ── 边 1：SITES ⇄ CAPS ──');
  L.push('    字面重合 ' + r.edge1.both + ' · 通配覆盖 ' + r.edge1.wildcardCover + ' · per-call 豁免 ' + r.edge1.perCall
    + ' · 无人解释 ' + r.edge1.uncovered.length);
  L.push('    cap 对账：数字可比 ' + (r.edge1.both - r.edge1.nonNumeric) + ' · 漂移 ' + r.edge1.capDrift.length
    + ' · 非数字不可比 ' + r.edge1.nonNumeric + '（函数 / per-call，不当成相等）');
  L.push('    CAPS 独有 ' + r.edge1.capsOnly + '（引擎内自截断，不是缺陷；执行者由边 2 点名）');
  L.push('  ── 边 2：CAPS 登记的执行者可核 ──');
  L.push('    点名到文件 ' + r.edge2.namedJs + ' · 结构化标签 ' + r.edge2.structural
    + ' · 声明无写入方 ' + r.edge2.noWriter + ' · 文件缺失 ' + r.edge2.unresolved.length + ' · 未点名 ' + r.edge2.unnamed);
  L.push('  ── 委托（不在此重复实现）──');
  r.delegated.forEach(function (d) { L.push('    ' + d.edge + ' → ' + d.to); });
  if (r.ok) L.push('  结论：通过（0 条红）');
  else {
    L.push('  结论：不通过（' + r.red.length + ' 条红）');
    r.red.slice(0, 12).forEach(function (x) { L.push('    ✗ [' + x.kind + '] ' + x.detail); });
    if (r.red.length > 12) L.push('    …另有 ' + (r.red.length - 12) + ' 条');
  }
  return L.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  let root = ROOT, asJson = false;
  argv.forEach(function (a) {
    if (a.indexOf('--root=') === 0) root = path.resolve(a.slice(7));
    else if (a === '--json') asJson = true;
    else { console.error('未知参数：' + a); process.exitCode = 3; }
  });
  const r = audit(root);
  if (asJson) console.log(JSON.stringify(r, null, 2));
  else console.log(report(r));
  process.exitCode = r.ok ? 0 : 1;
}

module.exports = { audit: audit, segMatch: segMatch, parseSites: parseSites, parseCaps: parseCaps, report: report, STRUCT_TAGS: STRUCT_TAGS, NO_WRITER: NO_WRITER };
if (require.main === module) main();

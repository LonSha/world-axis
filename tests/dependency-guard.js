// WorldAxis tests/dependency-guard.js (v2.103.0, A3 = O16) — 可选依赖可见性治理（单一真源）
//
// 【它治的病】「缺依赖 ⇒ 静默 skip ⇒ 门禁全绿」。
//   本仓零 npm 依赖（README 的零依赖约定），但历史上 10 处端到端块的写法是
//     try { require('jsdom').JSDOM } catch { null }
//     → if (!JSDOM) { console.log('  ⚠ jsdom 不可用，跳过端到端断言'); } else { ... }
//   后果不是「少覆盖一块」，而是**门禁结论与覆盖范围脱钩**：
//     缺依赖时那些块一条都不跑，回归照样打印「全部测试通过 ✓」，且 pass 计数**更低**——
//     没有任何一处会告诉你「本次绿灯比上一次少跑了 N 条断言」。
//   与本仓 v2.75.0 test-surface-gate 治的「归因建立在不执行的文件上」同族：
//     **判据的绿，建立在自己没跑这件事上**。
//
// 【做法】把「可选依赖」收敛成一个显式登记表（本文件），回归里落三档可见性：
//   ✓ full     —— 依赖到位，端到端真跑；
//   ⚠ fallback —— 依赖缺失但**自带零依赖替身**已顶上（不是失败，但必须被看见）；
//   ✗ missing  —— 既无依赖也无替身 ⇒ 该块**必须报红**，不许静默放行。
//
// 【本版的关键事实】替身一直就在仓库里：tests/ui-dom.js（零依赖 mini-DOM）。
//   ui-gate-sync.fresh() 自 v2.12.0 起就用它真装载 ui/panel.js 并真点击。v2.103.0 补了与
//   jsdom **同形**的 `JSDOMShim` 构造器，于是 10 处块从「静默跳过」变成「真跑」。
//   故正确处置不是「让 jsdom 成为必需」，而是「让这 10 处改走零依赖替身」——
//   依赖从「可选且静默」变成「可选且可见」。
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const BASE = path.join(__dirname, '..');

const TIERS = { FULL: 'full', FALLBACK: 'fallback', MISSING: 'missing' };

// ── 可选依赖登记表（单一真源）────────────────────────────────────────────
//   name / reason  : 包名 / 为什么它可以缺
//   fallback       : 零依赖替身（本仓自带）+ 可装载的证明点
//   affects        : 受影响的面（给人读）
//   siteNeedle     : 源码里「回退写法」的定位串（成类静态锁用；不含具体行号）
const OPTIONAL_DEPS = [
  {
    name: 'jsdom',
    reason: '真浏览器 DOM。本仓零依赖，它在开发机上是临时安装（/tmp/node_modules），'
      + '在别人机器上不存在 —— 若门禁依赖它，维护者机器上会静默跳过。',
    fallback: 'tests/ui-dom.js 的 JSDOMShim（与 jsdom 同形：new JSDOM(html,{url}) → {window:{document,Node}}）',
    fallbackProof: 'ui-gate-sync.fresh() 自 v2.12.0 起用 mini-DOM 真装载 panel+settings 并真点击',
    affects: ['v2.2.0 块3/4/5/6/8 端到端', 'v2.3.0 块3 泳道区端到端', 'v2.5.0 块5 面板端到端',
      'v2.6.0 块5/块7 设置键页端到端'],
    siteNeedle: "require('jsdom')"
  }
];

/**
 * 解析一个包是否可达：先走可移植路径，再走临时安装回退。
 * 纯只读（不动全局、不写盘）——它本身是观测面，不是门禁。
 */
function resolve(pkg) {
  try {
    require(pkg);
    return { ok: true, how: 'require' };
  } catch (e) { /* 继续 */ }
  try {
    // 临时安装回退：用 os.tmpdir() 取根，**不写字面路径** —— 本仓 v2.41.0 的成类静态锁
    //   （v2.2.0 段 D）禁止测试面出现裸 `/tmp`（唯一豁免是「守卫式本地安装回退」那类拼接写法）。
    //   这里干脆不含该字面量：语义等价、且不触发那条锁的豁免机制。
    const tmp = process.env.TMPDIR || os.tmpdir();
    require(path.join(tmp, 'node_modules', pkg));
    return { ok: true, how: 'tmp-fallback' };
  } catch (e2) {
    return { ok: false, how: 'absent', err: String((e2 && e2.code) || e2) };
  }
}

/**
 * 探测全部可选依赖，给出三档结论。**不抛异常**（观测面）。
 * 返回 { deps: [...], summary: {full, fallback, missing} }
 */
function probe() {
  const deps = OPTIONAL_DEPS.map(function (d) {
    const r = resolve(d.name);
    const tier = r.ok ? TIERS.FULL : (d.fallback ? TIERS.FALLBACK : TIERS.MISSING);
    return {
      name: d.name, present: r.ok, how: r.how, tier: tier,
      reason: d.reason, fallback: d.fallback, fallbackProof: d.fallbackProof, affects: d.affects
    };
  });
  const summary = { full: 0, fallback: 0, missing: 0 };
  deps.forEach(function (d) { summary[d.tier] += 1; });
  return { deps: deps, summary: summary };
}

/** 台账登记项（供专锁断言「登记表本身活着」，防它被写成没人读的常量）。 */
function registry() {
  return OPTIONAL_DEPS.map(function (d) {
    return { name: d.name, hasFallback: !!d.fallback, affects: d.affects.length, needle: d.siteNeedle };
  });
}

/**
 * 成类静态锁：扫一段源码里的「可选依赖回退站点」。
 * 返回 { sites: [{line, text}], count }。
 * 判据口径**不是**「有没有 require(pkg)」——依赖到位时那样的行**应当**存在（先试真货）；
 * 而是「有没有**只有 try** 而没有**替身分支**的裸回退」。故：
 *   bareIfNoShim === true 且站点数 > 0 且源码不含替身标记 ⇒ 判为裸回退（真缺陷）。
 */
function scanFallbackSites(src, pkg) {
  pkg = pkg || 'jsdom';
  const lines = String(src).split('\n');
  const sites = [];
  const re = new RegExp('require\\(\\s*[\'"]' + pkg + '[\'"]\\s*\\)');
  lines.forEach(function (ln, i) {
    if (re.test(ln)) sites.push({ line: i + 1, text: ln.trim() });
  });
  return { sites: sites, count: sites.length };
}

/**
 * 判定「回退是否为裸回退」：站点存在 + 源码无替身接入 ⇒ 裸（缺依赖即静默少跑）。
 * shimMarker 由调用方给（本仓为 ui-dom 的 JSDOMShim 接入标记），避免判据自持常量。
 */
function isBareFallback(src, pkg, shimMarker) {
  const sc = scanFallbackSites(src, pkg);
  const hasShim = String(src).indexOf(shimMarker) >= 0;
  return { bare: sc.count > 0 && !hasShim, sites: sc.count, hasShim: hasShim };
}

module.exports = {
  BASE: BASE,
  OPTIONAL_DEPS: OPTIONAL_DEPS,
  TIERS: TIERS,
  resolve: resolve,
  probe: probe,
  registry: registry,
  scanFallbackSites: scanFallbackSites,
  isBareFallback: isBareFallback
};
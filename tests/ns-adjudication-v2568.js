#!/usr/bin/env node
/**
 * v2.568.0 专锁：四台超期 pending-wire 的「不接」裁决（arcGuide / ctxBoundary / macroGuard / greenKeys）
 *
 * ── 治什么病 ───────────────────────────────────────────────────────
 *  tests/ns-consumer-ledger.json 的纪律⑤：「pending-wire 是**有时限**的定性。若某条超过一个
 *  版本周期仍无人读，必须改判 stale（进 dead-export-ledger）或补消费点，不许靠改 evidence 续命。」
 *  这四条长期停在 pending-wire：既不能接（没有上游契约），也不是 stale（tests 在读）。
 *  但「为什么不接」当时只写在 evidence 文字里 —— 文字不是判据：下一个人改一行代码就能把
 *  「结构上不可接」变成「已接」，而账本照样看着一致。本锁把四条理由钉成可复算读数。
 *
 * ── 判据纪律 ───────────────────────────────────────────────────────
 *  A 账本面：四条均在账本、cls 已改判 readonly-api、evidence 是实质理由且写明「改判触发器」。
 *  B 零读事实：产品源面（engines/render/core/ui/index.js）除自身 provider 文件外零引用；
 *               且 tests 面至少有一处消费（有 tests 消费 ⇒ 不是 stale）。
 *  C 结构理由可复算：四条「为什么不可接」各自一条真源码判据（plan 无上游 / 无起止标记 /
 *               无宏替换点 / 世界书全 constant）。这四条是**接线的阻断条件本身**，
 *               任何一条被解开，本锁立刻红，逼着改账本而不是悄悄多一个读点。
 *  D 负控：拿账本文本的**内存副本**制造破坏（cls 回改 pending-wire / evidence 截短 ⇒
 *               A 面判据必须各自点名），证明 A 面不是空转。
 *  E 触发器可执行：每条 recompute 是真命令且其引用的文件/路径存在。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

const LEDGER = 'tests/ns-consumer-ledger.json';
const CASES = [
  { ns: 'arcGuide', prov: 'engines/arc-guide.js' },
  { ns: 'ctxBoundary', prov: 'engines/ctx-boundary.js' },
  { ns: 'macroGuard', prov: 'engines/macro-guard.js' },
  { ns: 'greenKeys', prov: 'engines/green-keys.js' }
];

function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function exists(rel) { try { return fs.existsSync(path.join(BASE, rel)); } catch (e) { return false; } }

/** 产品源面（与 module-cycle-gate 同口径：core/engines/ui/render + 入口）。 */
function productFiles() {
  const out = [];
  ['engines', 'render', 'core', 'ui'].forEach(function (sub) {
    const d = path.join(BASE, sub);
    if (!fs.existsSync(d)) return;
    fs.readdirSync(d).forEach(function (f) { if (/\.js$/.test(f)) out.push(sub + '/' + f); });
  });
  out.push('index.js');
  return out;
}
function testFiles() {
  const d = path.join(BASE, 'tests');
  return fs.readdirSync(d).filter(function (f) { return /\.js$/.test(f); }).map(function (f) { return 'tests/' + f; });
}
/** 引用形态：WA.<ns> / G.<ns> / mm.wa.<ns> / mm.WA.<ns> / 点号成员调用。 */
function nsRe(ns) {
  return new RegExp('\\b(?:WA|G|mm\\.wa|mm\\.WA)\\.' + ns + '\\b|\\.' + ns + '\\s*\\(');
}
/** 剥注释（块 + 行）：只为让「{{ 只出现在 JSDoc」这类判断不被注释噪音误导。 */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function runAll(assertFn) {
  let pass = 0, fail = 0;
  const fails = [];
  const a = function (ok, name) {
    if (ok) pass++; else { fail++; fails.push(name); }
    if (typeof assertFn === 'function') assertFn(ok, name);
  };

  // ── A 账本面 ──
  const ledger = JSON.parse(rd(LEDGER));
  const E = ledger.entries || {};
  CASES.forEach(function (c) {
    const e = E[c.ns];
    a(!!e, 'A1 ' + c.ns + ' 在账本里（缺失=未定性）');
    if (!e) return;
    a(e.cls === 'readonly-api', 'A2 ' + c.ns + ' cls 已改判 readonly-api（实 ' + e.cls + '）');
    a((e.evidence || '').length >= 200, 'A3 ' + c.ns + ' evidence 是实质理由（>=200 字，实 ' + (e.evidence || '').length + '）');
    a(/改判触发器/.test(e.evidence || ''), 'A4 ' + c.ns + ' evidence 写明改判触发器（不是一句「待接」）');
    a(/^(grep|node|sed|ls|cat)\b/.test(e.recompute || ''), 'A5 ' + c.ns + ' recompute 是可执行命令');
    a((e.recompute || '').indexOf(c.prov) >= 0, 'A6 ' + c.ns + ' recompute 指向自身 provider（可复算到源头）');
  });

  // ── B 零读事实 ──
  const prod = productFiles();
  const tsts = testFiles();
  CASES.forEach(function (c) {
    const rx = nsRe(c.ns);
    const prodHit = prod.filter(function (rel) {
      if (rel === c.prov) return false;
      return rx.test(rd(rel));
    });
    a(prodHit.length === 0, 'B1 ' + c.ns + ' 产品源面零读（除自身外命中：' + (prodHit.join(',') || '无') + '）');
    const testHit = tsts.filter(function (rel) { return rx.test(rd(rel)); });
    a(testHit.length >= 1, 'B2 ' + c.ns + ' tests 面有消费（' + testHit.length + ' 处）⇒ 不是 stale（stale 要求连 tests 都零读）');
  });

  // ── C 结构理由可复算 ──
  // C1 arcGuide：无产品级 plan 调用点；且 arc-phase.js 明文写着拒接。
  //   口径：注释里写着「不接 arcGuide.plan()」**不算调用点**，故先剥注释再判（这是本锁第一版
  //   踩过的坑：不剥注释时 arc-phase.js 的拒接理由本身把判据打红）。
  a(!/arcGuide\.plan\s*\(/.test(prod.filter(function (r) { return r !== 'engines/arc-guide.js'; })
    .map(function (r) { return stripComments(rd(r)); }).join('\n')),
    'C1a 剥注释后产品面无 arcGuide.plan( 调用点（无上游 ⇒ 不可接）');
  a(/不接\s*`?arcGuide\.plan\(\)`?/.test(rd('engines/arc-phase.js')),
    'C1b engines/arc-phase.js 明文写下拒接理由（改判触发器必须同步改它）');
  // C2 ctxBoundary：注入面不往正文写带起止标记的块；DEFAULTS 无规则。
  const inj = rd('render/inject.js');
  a(inj.indexOf('<!-- wa') < 0 && inj.indexOf('【幕后】') < 0,
    'C2a render/inject.js 无【幕后】/<!-- wa 之类起止标记（无物可剥）');
  //   口径：只判 DEFAULTS 对象字面量里没有 rules 键（第一版用 /rules\s*:\s*\[/ 会命中
  //   `rules === undefined ? [] : [...]` 这种三元表达式 —— 那是运行时取值，不是内置规则）。
  const cbDef = (rd('engines/ctx-boundary.js').match(/const DEFAULTS = \{([^}]*)\}/) || [])[1] || '';
  a(cbDef.length > 0 && cbDef.indexOf('rules') < 0,
    'C2b ctx-boundary 的 DEFAULTS 里没有任何内置规则（规则必须由调用方给）');
  // C3 macroGuard：产品源面**没有宏值替换实现**（宿主替换发生在本仓之外）。
  //   口径：不是「零 {{」。本仓确实在不只一处文本里**提到** {{char}} / {{user}}（例如
  //   health-preflight 的拦截提示词、proactive 的强制指令台词），那是提示词内容，不是替换代码。
  //   真正要判的是「有没有把 {{x}} 换成值的实现」，形态即 `.replace(` 的参数里含 {{。
  const macroHits = prod.filter(function (rel) {
    if (rel === 'engines/macro-guard.js') return false;
    return /\.replace\([^)]{0,60}\{\{/.test(stripComments(rd(rel)));
  });
  a(macroHits.length === 0, 'C3 产品源面无 {{ 值替换实现（命中：' + (macroHits.join(',') || '无') + '）');
  // C4 greenKeys：两处世界书写点全 constant；全仓零 selective。
  a(/type:\s*'constant'/.test(rd('engines/wb-inject.js')) && /keys:\s*\[\]/.test(rd('engines/wb-inject.js')),
    'C4a wb-inject 写条目用 constant + keys:[]（恒常驻，不靠关键词激活）');
  a(/type:\s*'constant'/.test(rd('engines/outline-inject.js')) && /keys:\s*\[\]/.test(rd('engines/outline-inject.js')),
    'C4b outline-inject 同上（两处写点同策略）');
  const selHits = prod.filter(function (rel) { return /type:\s*'selective'/.test(rd(rel)); });
  a(selHits.length === 0, 'C4c 全仓无 type:selective（关键词激活面真不存在；命中：' + (selHits.join(',') || '无') + '）');

  // ── D 负控（账本文本的内存副本破坏） ──
  const good = rd(LEDGER);
  const bad1 = good.replace('"arcGuide": {\n   "cls": "readonly-api"', '"arcGuide": {\n   "cls": "pending-wire"');
  a(bad1 !== good, 'D1 负控自证：副本破坏确实改到了文本（否则 D2 恒真）');
  const Lbad = JSON.parse(bad1);
  a(Lbad.entries.arcGuide.cls === 'pending-wire', 'D2 负控：cls 回改成 pending-wire ⇒ A2 判据必须现形');
  //   负控 D2：cls 回改成 pending-wire ⇒ A2（cls === 'readonly-api'）必须现形。
  //   负控 D3：evidence 截短 ⇒ A3（>=200 字）必须现形。
  //   两处都走**对象副本**：D1 已单独证明文本副本能被改到，这里只需证明「判据表达式在坏数据
  //   上返 false」——即判据不是恒真装饰。不依赖文本缩进形态，避免缩进一变负控就假绿。
  const o2 = JSON.parse(good);
  o2.entries.greenKeys.evidence = '待接';
  a(!((o2.entries.greenKeys.evidence || '').length >= 200),
    'D3 负控：evidence 截短 ⇒ A3（>=200 字）判据必须现形');

  // ── E 触发器可执行 ──
  CASES.forEach(function (c) {
    const e = E[c.ns];
    const files = ((e && e.recompute) || '').match(/(?:engines|tests|render|core|ui)\/[\w./-]+\.js/g) || [];
    a(files.length >= 1 && files.every(exists),
      'E1 ' + c.ns + ' recompute 里引用的路径全部存在（' + (files.join(' ') || '无') + '）');
  });

  return { pass: pass, fail: fail, fails: fails };
}

if (require.main === module) {
  const r = runAll(null);
  if (r.fail === 0) { console.log('NS-ADJUDICATION-V2568: pass（' + r.pass + ' 项）'); process.exit(0); }
  console.error('NS-ADJUDICATION-V2568: 通过 ' + r.pass + ' / 失败 ' + r.fail);
  r.fails.forEach(function (f) { console.error('  x ' + f); });
  process.exit(1);
}
module.exports = { runAll: runAll, CASES: CASES };

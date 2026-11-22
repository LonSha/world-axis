// WorldAxis tests/sanitize-v2111.js (v2.111.0) — 输入消毒单一真源专锁（计划二 #69）
//
// 四段：A 导出面枚举 / B 运行时探针 / C 不变式 / N 负控制（真源码破坏）。
'use strict';
const path = require("path");
const fs = require("fs");
const vm = require("vm");
const synthHost = require("./synth-host.js");
const BASE = path.join(__dirname, "..");
const REL = "core/sanitize.js";
const KEYS = ["text", "html", "attr", "tpl", "needsEscape", "ESCAPED", "CODES"];
const NFORBID = ["escape", "strip", "clean", "purifyTags", "sanitizeHtml"];
const AMP = 38, LT = 60, GT = 62, QUOT = 34, APOS = 39;
function chr(n) { return String.fromCharCode(n); }
function srcOf() { return fs.readFileSync(path.join(BASE, REL), "utf8"); }
function freshHost() {
  const c = synthHost.negativeContext({});
  vm.runInContext(srcOf(), c, { filename: REL });
  return c;
}
function hostWith(broken) {
  const c = synthHost.negativeContext({});
  vm.runInContext(broken, c, { filename: REL + "#broken" });
  return c;
}
function exportBody(src) {
  const at = src.indexOf("WA.sanitize");
  if (at < 0) return "";
  let i = src.indexOf("{", at), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return "";
}

function runA(a) {
  const body = exportBody(srcOf());
  a(body.length > 0, "A1: 能从真源码取出 WA.sanitize 的对象字面量体（不是只 grep 关键词）");
  KEYS.forEach(function (k) {
    a(body.indexOf(k + ":") > 0, "A2: 导出面含 " + k);
  });
}

function runB(a) {
  const S = freshHost().WorldAxis.sanitize;
  a(!!S, "B0: 模块挂上了 WA.sanitize");
  a(S.html(chr(LT) + "b" + chr(GT)) === chr(AMP) + "lt;b" + chr(AMP) + "gt;", "B1: 尖括号转成实体");
  a(S.html(chr(QUOT)) === chr(AMP) + "quot;", "B2: 双引号被真转义（历史缺陷：旧 esc 在这一格是恒等映射）");
  a(S.html(chr(APOS)) === chr(AMP) + "#39;", "B3: 单引号被真转义");
  a(S.html(chr(AMP)) === chr(AMP) + "amp;", "B4: 与号被真转义");
  a(S.html(chr(AMP) + chr(LT)) === chr(AMP) + "amp;" + chr(AMP) + "lt;", "B5: 混合输入逐字符映射（不是整体替换）");
  a(S.text(null) === "" && S.text(undefined) === "" && S.text({}) === "", "B6: 非字符串落空串（不编字符串 null）");
  a(S.text(0) === "0" && S.text(false) === "false", "B7: 数字与布尔不是空串（0 是 0）");
  a(S.html(undefined) === "" && S.html(null) === "", "B8: html 对空值恒给空串（从不抛）");
  a(S.attr(chr(LT)) === S.html(chr(LT)), "B9: attr 与 html 同实现（分开导出是为让调用点意图可被静态看见）");
  a(S.tpl("<b>${0}</b>", chr(LT)) === chr(60) + "b" + chr(GT) + chr(AMP) + "lt;" + chr(60) + "/b" + chr(GT), "B10: tpl 只转义插槽、模板标签保留");
  a(S.needsEscape("abc") === false && S.needsEscape(chr(LT)) === true, "B11: needsEscape 是只读诊断（不做事后改写）");
  NFORBID.forEach(function (k) {
    a(typeof S[k] === "undefined", "B12: 不导出 " + k + "（名字不许比能力大：本模块不做标签过滤/白名单）");
  });
}

function runC(a) {
  const S = freshHost().WorldAxis.sanitize;
  a(JSON.stringify(S.ESCAPED) === JSON.stringify([QUOT, AMP, APOS, LT, GT]), "C1: 被转义码位清单恰这五个（读数组，不看文档）");
  a(S.CODES.AMP === AMP && S.CODES.LT === LT && S.CODES.GT === GT && S.CODES.QUOT === QUOT && S.CODES.APOS === APOS, "C2: CODES 与码位常量同源");
  S.ESCAPED.forEach(function (n) {
    const out = S.html(chr(n));
    a(out !== chr(n) && out.indexOf(chr(AMP)) === 0, "C3: 码位 " + n + " 确实被换成实体（转义表逐项可达）");
  });
  a(S.html(S.html(chr(LT))) !== S.html(chr(LT)), "C4: 不声称幂等（二次转义再转一层）——单向转义器，不是消毒器");
  a(S.html(chr(LT)) === S.html(chr(LT)) && typeof S.stat === "undefined", "C5: 纯函数且无状态面（不导出 stat：没有可漂的计数）");
}

function runN(a) {
  const SRC = srcOf();
  const CASES = [
    { n: 1, why: "N1: 摘下双引号那一格 ⇒ 该码位不再被转义（历史缺陷就是这一格）",
      from: "ENT[QUOT] = " + chr(39) + chr(AMP) + "quot;" + chr(39) + ";", to: "ENT[QUOT] = String.fromCharCode(" + QUOT + ");",
      probe: function (S) { return S.html(chr(QUOT)); }, want: chr(AMP) + "quot;" },
    { n: 2, why: "N2: 把数字布尔归一改成落空串 ⇒ 7 不再得到 7（0 与空串不可混）",
      from: "return String(s);", to: "return " + chr(34) + chr(34) + ";",
      probe: function (S) { return S.text(7); }, want: "7" },
    { n: 3, why: "N3: 把未转义字符改成丢弃 ⇒ 普通文本被吃掉（只转义不管普通字符）",
      from: "out += (ENT[c] !== undefined) ? ENT[c] : t.charAt(i);", to: "out += (ENT[c] !== undefined) ? ENT[c] : " + chr(34) + chr(34) + ";",
      probe: function (S) { return S.html("a" + chr(LT)); }, want: "a" + chr(AMP) + "lt;" },
    { n: 4, why: "N4: 去掉 needsEscape 的扫描循环 ⇒ 有实体字符也报 false",
      from: "if (ENT[t.charCodeAt(i)] !== undefined) return true;", to: "return false;",
      probe: function (S) { return S.needsEscape(chr(LT)); }, want: true }
  ];
  CASES.forEach(function (cs) {
    const hits = SRC.split(cs.from).length - 1;
    a(hits === 1, "N0(" + cs.n + "): 破坏锚点恰中 1 次（实 " + hits + "）——否则跳过该条而不是假绿");
    if (hits !== 1) return;
    const broken = SRC.split(cs.from).join(cs.to);
    let got = null;
    try { got = cs.probe(hostWith(broken).WorldAxis.sanitize); } catch (e) { got = "#threw#"; }
    a(got !== cs.want, cs.why + "（破坏后实得 " + JSON.stringify(got) + "）");
  });
}

module.exports = { KEYS: KEYS, REL: REL, runA: runA, runB: runB, runC: runC, runN: runN, srcOf: srcOf };
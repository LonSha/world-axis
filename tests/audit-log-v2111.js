// WorldAxis tests/audit-log-v2111.js (v2.111.0) — 写操作审计日志专锁（计划二 #67）
//
// 四段：A 导出面枚举 / B 运行时探针 / C 不变式 / N 负控制（真源码破坏）。
//
// 本锁最贵的一条是否定面：审计必须**只能追加**。判据因此不是「有 remove 吗」而是
//   「这几个名字在导出面上必须是 undefined」，且 `FORBIDDEN` 自己也必须可被读。
'use strict';
const path = require("path");
const fs = require("fs");
const vm = require("vm");
const synthHost = require("./synth-host.js");
const BASE = path.join(__dirname, "..");
const REL = "core/audit-log.js";
const KEYS = ["record", "recent", "byAction", "count", "stat", "reset", "CAP", "PARAM_CAP", "FIELDS", "FORBIDDEN"];
const MUST_BE_ABSENT = ["remove", "clear", "delete", "splice", "drop", "purge"];
const FIELDS = ["seq", "at", "user", "action", "surface", "params", "paramsTruncated", "result", "ip"];
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
  const at = src.indexOf("WA.auditLog");
  if (at < 0) return "";
  let i = src.indexOf("{", at), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return "";
}
function attempt(fn) { try { return { threw: false, value: fn() }; } catch (e) { return { threw: true, error: e }; } }

function runA(a) {
  const body = exportBody(srcOf());
  a(body.length > 0, "A1: 能从真源码取出 WA.auditLog 的对象字面量体");
  KEYS.forEach(function (k) {
    a(body.indexOf(k + ":") > 0, "A2: 导出面含 " + k);
  });
  MUST_BE_ABSENT.forEach(function (k) {
    a(body.indexOf(k + ":") < 0, "A3: 导出体里没有 " + k + "（只能追加：不是「少用」，是「不存在」）");
  });
}

function runB(a) {
  const WA = freshHost().WorldAxis;
  const L = WA.auditLog;
  a(!!L && L.CAP === 256, "B0: 模块挂上且环容量为 256（上限是确定量，必须可被读到）");
  const r1 = attempt(function () { return L.record("store.save", { bytes: 12 }); });
  a(r1.threw === false && r1.value.ok === true && r1.value.seq === 1, "B1: 一条记录成功且序号从 1 起");
  a(L.count() === 1, "B2: count 与写入同向");
  const row = L.recent(1)[0];
  a(FIELDS.every(function (f) { return f in row; }), "B3: 每行九个固定字段齐备（缺字段会让「读不出来」与「没发生过」混在一起）");
  a(row.action === "store.save" && row.surface === null && row.result === null, "B4: 未给的字段如实 null（不是空串、不是 unknown）");
  a(row.ip === null, "B5: ip 恒 null（本扩展没有网络身份：不许编一个 127.0.0.1）");
  a(typeof row.at === "number" && row.at > 0, "B6: at 是墙钟数字（与仓库其余时钟守卫同形）");
  const bad = attempt(function () { return L.record(""); });
  a(bad.value.ok === false && bad.value.reason === "bad-action", "B7: 空动作名如实拒收（不静默记一条无名事实）");
  a(L.count() === 1, "B8: 拒收**不**进环（拒收与事实必须分开）");
  a(L.stat().badAction === 1, "B9: 拒收计数单列（badAction）");
  const cyc = { a: 1 }; cyc.self = cyc;
  const rc = attempt(function () { return L.record("cyc", cyc); });
  a(rc.threw === false && rc.value.ok === true, "B10: 循环引用的 params 不炸（审计不许把调用方搞挂）");
  const big = "x".repeat(4096);
  L.record("big", { s: big });
  const rb = L.recent(1)[0];
  a(rb.paramsTruncated === true && rb.params.length === 512, "B11: 超长 params 截断到 512 且**打标**（不静默截）");
  a(L.stat().truncated === 1, "B12: 截断计数单列");
  a(L.byAction("store.save").length === 1 && L.byAction("nope").length === 0, "B13: byAction 只读筛选（不存在的动作为空数组，不是 null）");
  const copy = L.recent();
  copy[0].action = "TAMPERED";
  a(L.recent()[0].action !== "TAMPERED", "B14: recent 返回副本（外部改不动环：事实不可被事后改写）");
  MUST_BE_ABSENT.forEach(function (k) {
    a(typeof L[k] === "undefined", "B15: 运行时确实没有 " + k + "（静态面与运行面两读）");
  });
}

function runC(a) {
  const L = freshHost().WorldAxis.auditLog;
  for (let i = 1; i <= 300; i++) L.record("fill", { i: i });
  a(L.count() === 256, "C1: 环到上限即停（300 条入，256 条在）");
  const rows = L.recent();
  a(rows[0].seq === 45 && rows[255].seq === 300, "C2: 挤出的是最旧的（首条序号 45 = 300-256+1）");
  a(L.stat().dropped === 44, "C3: 挤出计数单列（丢了多少必须说得清）");
  a(L.recent(99999).length === 256 && L.recent(-5).length === 0, "C4: recent 越界自动夹取（不改环）");
  a(JSON.stringify(L.FORBIDDEN) === JSON.stringify(MUST_BE_ABSENT), "C5: FORBIDDEN 与判据同源（清单可被读，不是文档里的一句话）");
  a(JSON.stringify(L.FIELDS) === JSON.stringify(FIELDS), "C6: FIELDS 是单一真源（行字段顺序即输出顺序）");
  const before = L.count();
  L.reset();
  a(L.count() === 0 && before === 256, "C7: reset 是唯一清空入口且只清环");
  a(L.stat().resets === 1, "C8: 清空这件事自己也留痕（resets 计数）");
}

function runN(a) {
  const SRC = srcOf();
  const CASES = [
    { n: 1, why: "N1: 去掉「环满即挤出」⇒ 环无上限（有界的地方变没人管）",
      from: "if (_ring.length > CAP) { _ring.shift(); _stat.dropped++; }", to: "_stat.dropped += 0;",
      probe: function (L) { for (let i = 0; i < 300; i++) L.record("x", { i: i }); return L.count(); }, want: 256 },
    { n: 2, why: "N2: 去掉参数截断 ⇒ 超长参数整段进环",
      from: "if (ser !== null && ser.length > PARAM_CAP)", to: "if (false && ser !== null && ser.length > PARAM_CAP)",
      probe: function (L) { L.record("b", { s: "y".repeat(4096) }); return L.recent(1)[0].params.length > 512; }, want: false },
    { n: 3, why: "N3: 把 ip 从如实 null 变成编造值 ⇒ 编事实",
      from: "ip: null", to: "ip: " + chr(34) + "127.0.0.1" + chr(34),
      probe: function (L) { L.record("a"); return L.recent(1)[0].ip; }, want: null },
    { n: 4, why: "N4: 去掉「环满挤出」以外的有序截断 ⇒ recent 不再是副本方向（用原行返回）",
      from: "      const o = {};", to: "      const o = r; return r;",
      probe: function (L) { L.record("t"); const c = L.recent(); c[0].action = "TAMPERED"; return L.recent()[0].action; }, want: "t" }
  ];
  CASES.forEach(function (cs) {
    const hits = SRC.split(cs.from).length - 1;
    a(hits === 1, "N0(" + cs.n + "): 破坏锚点恰中 1 次（实 " + hits + "）——否则跳过该条而不是假绿");
    if (hits !== 1) return;
    const broken = SRC.split(cs.from).join(cs.to);
    let got = null;
    try { got = cs.probe(hostWith(broken).WorldAxis.auditLog); } catch (e) { got = "#threw#"; }
    a(got !== cs.want, cs.why + "（破坏后实得 " + JSON.stringify(got) + "）");
  });
}

module.exports = { KEYS: KEYS, REL: REL, runA: runA, runB: runB, runC: runC, runN: runN, srcOf: srcOf };
function chr(n) { return String.fromCharCode(n); }
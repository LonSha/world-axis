// WorldAxis tests/lock-assert.js (v2.75.0) — 断言适配器（单一真源）
//
// 为什么要有它：run.js 注入给各专锁的不是 Node 的 assert 模块，而是它自己的
//   `assert(cond, name, extra)`（累计 pass/fail、最后统一汇总）。而 v2.52–v2.55 的四个锁
//   原本是裸脚本，锁体写的是 Node 风格的 `assert.strictEqual/ok`。
//   本适配器把 Node 风格调用**接到注入的断言函数上** —— 锁体逐字保留，探针仍由聚合器持有
//   （不是自持常量），且把实际值附进失败文案。
//   同时兼容直跑：`runAll(require('assert'))` 也成立（Node assert 同样接受 (value, message) 形式）。
'use strict';

function from(a) {
  const name0 = function (msg) { return String(msg === undefined ? '' : msg); };
  return {
    ok: function (v, msg) { a(!!v, name0(msg)); },
    strictEqual: function (x, y, msg) {
      a(x === y, name0(msg) + (x === y ? '' : ' —— 实 ' + JSON.stringify(x) + ' vs ' + JSON.stringify(y)));
    },
    notStrictEqual: function (x, y, msg) {
      a(x !== y, name0(msg) + (x !== y ? '' : ' —— 实 ' + JSON.stringify(x)));
    }
  };
}

module.exports = { from: from };

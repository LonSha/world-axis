const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'engines/longline.js'), 'utf8');
const store = {
  memory: {
    foreshadows: [
      { id: 'fs1', content: '\u8499\u9762\u4eba\u8eab\u4efd\u6210\u8c1c', status: 'waiting' },
      { id: 'fs2', content: '\u5df2\u6536\u56de', status: 'recycled' }
    ]
  }
};
let cfg = { enabled: false, graceMs: 600000, maxItems: 4 };
let NOW = 1000000;
const WA = {
  clock: { now() { return NOW; } },
  settingsBus: {
    read() { return cfg; },
    normalize(r, v) { return v; },
    saveOrThrow(r, v) { cfg = v; return { ok: true }; }
  },
  store: { get() { return store; }, transact(fn) { fn(store); } }
};
global.window = { WorldAxis: WA };
vm.runInNewContext(src, { window: global.window, Date, Number, String, Array, Object, isFinite, Math }, { filename: 'engines/longline.js' });
const L = WA.longline;
// 1 默认关闭：零注入
assert.strictEqual(L.buildBlock(), '', 'disabled empty');
// 2 非法承诺时刻拒收
assert.strictEqual(L.promise('fs1', 0).reason, 'bad-due');
// 3 不存在的伏笔不得新建
assert.strictEqual(L.promise('\u4e0d\u5b58\u5728', 5).reason, 'missing-foreshadow');
assert.strictEqual(store.memory.foreshadows.length, 2, 'no create');
// 4 终态伏笔不得再承诺（已收/已弃不再算欠账）
assert.strictEqual(L.promise('fs2', 5).reason, 'already-terminal');
// 5 正常承诺
assert.strictEqual(L.promise('fs1', 500000).ok, true);
assert.strictEqual(store.memory.foreshadows[0].dueAt, 500000);
assert.strictEqual(store.memory.foreshadows[0].status, 'waiting', 'status untouched');
// 6 宽限期内不算逾期
assert.strictEqual(L.overdue(1000000).length, 0, 'inside grace');
// 7 超过宽限期才算逾期，且只报不改
const rows = L.overdue(2000000);
assert.strictEqual(rows.length, 1);
assert.strictEqual(rows[0].id, 'fs1');
assert.strictEqual(rows[0].lateBy, 1500000);
// 8 逾期不修改伏笔本体（只度量）
assert.strictEqual(store.memory.foreshadows[0].status, 'waiting', 'overdue does not recycle');
assert.ok(!('recycledAt' in store.memory.foreshadows[0]), 'no side effect');
// 9 压力分级
const p1 = L.pressure(2000000);
assert.strictEqual(p1.count, 1);
assert.strictEqual(p1.level, 'light');
assert.strictEqual(L.pressure(5000000).level, 'heavy');
assert.strictEqual(L.pressure(1000000).level, 'clear');
// 10 扫描计量
const sw = L.sweep(2000000);
assert.strictEqual(sw.count, 1);
assert.strictEqual(L.stat().overdue, 1);
assert.strictEqual(L.stat().lastReason, 'overdue');
// 11 开启后注入欠账；时钟未到期时为（不误报）
L.setSettings({ enabled: true });
assert.strictEqual(L.buildBlock(), '', 'not due yet -> no block');
NOW = 2000000;
const block = L.buildBlock();
assert.ok(block.indexOf('fs1') >= 0, 'block lists overdue id');
assert.ok(block.indexOf('\u8499\u9762\u4eba\u8eab\u4efd\u6210\u8c1c') >= 0, 'block lists content');
assert.ok(block.indexOf('\u4e0d\u81ea\u52a8\u56de\u6536') >= 0, 'block states no auto-recycle');
assert.ok(block.indexOf('fs2') < 0, 'terminal not listed');
// 12 计量账
const st = L.stat();
assert.strictEqual(st.promises, 1);
assert.ok(st.blocked >= 3);
assert.strictEqual(L.TERMINAL.join(','), 'recycled,dropped,triggered', 'terminal set (cross-realm safe)');
console.log('LONGLINE-V2550: pass');

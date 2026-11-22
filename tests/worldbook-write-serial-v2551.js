'use strict';
/**
 * tests/worldbook-write-serial-v2551.js — 世界书写回收口专锁（v2.551.0）
 *
 * 治的缺口（写在最前面，因为它是本文件存在的唯一理由）：
 *
 *   `engines/write-serial.js` 从 v2.529.0 入库起就是**零读**。零读账本给它的定性是
 *   `pending-wire`，evidence 原文：「消费方应是世界书写回点（现在没有统一写回点）」。
 *
 *   本批实测把这个「没有」量清楚了 —— 不是没有写回点，而是**有三个**，且互不知情：
 *     ① `outline-inject.apply`  —— 面板「采纳」与 AI 工具都走它
 *     ② `outline-inject.undo`   —— 撤销（内部 `flip` 直接调 `cap.fn`，绕过 apply）
 *     ③ `wb-inject.ensureEntry` —— before 链 order 17 每轮可能触发
 *
 *   写回形态是「读整本 → 改一条 → 写整本」。三处各自读各自的快照，谁先读到旧整本，
 *   谁就在写回时把别人刚建的条目覆盖掉。**每一步都「调用成功」**，读数上看不出丢了东西
 *   —— 这正是本仓反复治的「我写了 ≠ 它真在那儿」。
 *
 * 本锁钉住五件事：
 *   A 静态契约：`serial(name)` 按名幂等（同 key 同一实例）、`runStrict` 在实例上、
 *     `serials()` 只读、空参归一。
 *   B 真接线（源码级）：三个写入口的「读-改-写」整段都在 `withBook` 里；两处用**同一条**
 *     key（`wb:<书名>`）；每一次宿主写调用都落在包裹区间内（没有绕道的写点）。
 *   C 行为实测（核心，带延迟的假宿主）：
 *       C1 并发 apply ⇒ 两次都 ok 且台上**恰 1 条**（不串行时两次都读到空 ⇒ 建出 2 条同名条目）
 *       C2 并发 ensure 同 order ⇒ 恰 1 条（不串行时各建一条，变量镜像被注入两遍）
 *       C3 并发 ensure 不同 order ⇒ 2 条（队列没把「不同目标」串成同一个）
 *       C4 同队列 FIFO（后者不早于前者）
 *       C5 跨书不互斥（A 书慢任务不阻塞 B 书）
 *       C6 `runStrict` 异常穿透且队列不断；C7 `run` 对照（吞错）—— 两者语义确实不同
 *   D 运行时负控（只改内存，不改文件）：
 *       N1 把 `serial` 换成「每次新建」⇒ C1/C2 必须现形
 *       N2 把 `serial` 摘成 undefined（走降级直跑）⇒ C1 必须现形
 *   E 真源码破坏（改文件系统）：
 *       把 `wb-inject` 的 `withBook(wbName, ...)` 拆成裸 IIFE ⇒ 并发 ensure 必须建出 2 条；
 *       结束时 try/finally 逐字节还原 + sha256 校验（还原失败即本锁自己抛）。
 *
 * 为什么 C 组要用**带延迟**的假宿主：同步 mock 下「两次读都读到空」这件事不会发生
 *   —— 第一个 await 还没让出控制权，第二个 apply 就已经看到结果了。不给延迟，
 *   本锁会全绿而病灶原样存在（负控 N1 就是为了证明这一点不是空话）。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BASE = path.join(__dirname, '..');
const OI_REL = 'engines/outline-inject.js';
const WB_REL = 'engines/wb-inject.js';
const WS_REL = 'engines/write-serial.js';

let pass = 0, fail = 0;
const fails = [];
async function ok(name, fn) {
  try { await fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; fails.push(name + ' :: ' + e.message); console.log('  ✗ ' + name + ' :: ' + e.message); }
}
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function sha(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }
function clone(e) { return JSON.parse(JSON.stringify(e)); }

/** 世界书假宿主：带真延迟，`getWorldbook` 返回**深拷贝**（真宿主也不会把内部数组借给你）。 */
function makeHost(book, opt) {
  const o = opt || {};
  const readDelay = o.readDelay == null ? 6 : o.readDelay;
  const writeDelay = o.writeDelay == null ? 6 : o.writeDelay;
  const H = {
    __calls: { get: 0, create: 0, replace: 0, update: 0 },
    baseUrl: '', // 部分模块会探这个字段
    async getWorldbook(name) {
      H.__calls.get++;
      await tick(readDelay);
      return (book[name] || []).map(clone);
    },
    async createWorldbookEntries(name, list) {
      H.__calls.create++;
      await tick(writeDelay);
      const cur = book[name] = book[name] || [];
      (list || []).forEach(function (e) { cur.push(clone(e)); });
      return list;
    },
    // 刻意**不**提供 updateWorldbookWith：让 outline-inject 走「整表回写」那条路
    //   （cap.kind==='replaceWorldbook'）。那正是本锁要复现的丢数据路径。
    async replaceWorldbook(name, list) {
      H.__calls.replace++;
      await tick(writeDelay);
      book[name] = (list || []).map(clone);
      return true;
    }
  };
  return H;
}

const BOOK_OI = 'WB-WS-OI';
const BOOK_WB = 'WorldAxis-WS-Test';
const TAG1 = '手稿 <outline>甲段落正文</outline>';
const TAG2 = '手稿 <outline>甲乙两段落正文</outline>';

(async function main() {
  const env = require('./ui-gate-sync.js').fresh();
  const W = env.WA;
  try { W.store.init(); } catch (e) {}
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}

  // ── A 静态契约 ──────────────────────────────────────────────
  await ok('A1 serial / serials 是函数，createSerial 建的实例带 runStrict', function () {
    assert.ok(W.writeSerial, 'WA.writeSerial 缺席');
    assert.strictEqual(typeof W.writeSerial.serial, 'function', 'serial 缺席');
    assert.strictEqual(typeof W.writeSerial.serials, 'function', 'serials 缺席');
    const q = W.writeSerial.createSerial('probe');
    assert.strictEqual(typeof q.runStrict, 'function', 'createSerial 的实例没有 runStrict');
  });

  await ok('A2 serial(name) 按名幂等：同 key 同一实例、不同 key 不同实例', function () {
    const a = W.writeSerial.serial('wb:k1');
    const b = W.writeSerial.serial('wb:k1');
    const c = W.writeSerial.serial('wb:k2');
    assert.strictEqual(a, b, '同 key 必须是**同一个**队列对象（否则串行行为上不生效）');
    assert.notStrictEqual(a, c, '不同书必须分开排队');
    // 反向自证：createSerial 每次都是新对象 —— 这正是 serial() 存在的理由
    const x = W.writeSerial.createSerial('wb:k1');
    const y = W.writeSerial.createSerial('wb:k1');
    assert.notStrictEqual(x, y, 'createSerial 每次新建（这是它的语义；serial 才是共享入口）');
  });

  await ok('A3 空参归一：serial() / serial("") / serial("default") 是同一实例', function () {
    const a = W.writeSerial.serial();
    const b = W.writeSerial.serial('');
    const c = W.writeSerial.serial('default');
    assert.strictEqual(a, b, '空参必须归一到同一个 key');
    assert.strictEqual(a, c, "空参归一到 'default'");
  });

  await ok('A4 serials() 只读：连调两次不改变读数，且每项四字段齐备', function () {
    W.writeSerial.serial('wb:probeA');
    const s1 = JSON.stringify(W.writeSerial.serials());
    const s2 = JSON.stringify(W.writeSerial.serials());
    assert.strictEqual(s1, s2, 'serials() 不许有副作用（连调必须同值）');
    const arr = W.writeSerial.serials();
    assert.ok(arr.length >= 1, '至少应有 wb:probeA 一项');
    arr.forEach(function (it) {
      assert.strictEqual(typeof it.name, 'string', 'stat 缺 name');
      assert.strictEqual(typeof it.pending, 'number', 'stat 缺 pending');
      assert.strictEqual(typeof it.done, 'number', 'stat 缺 done');
      assert.strictEqual(typeof it.failed, 'number', 'stat 缺 failed');
      assert.ok('lastError' in it, 'stat 缺 lastError');
    });
  });

  // ── B 真接线（源码级）───────────────────────────────────────
  const OI = rd(OI_REL);
  const WB = rd(WB_REL);
  const WSS = rd(WS_REL);

  await ok('B1 三个写入口整段进队列：outline-inject 两处（apply / undo）+ wb-inject 一处', function () {
    const cnt = function (src, pat) { return src.split(pat).length - 1; };
    assert.strictEqual(cnt(OI, 'return withBook(wbName, async function () {'), 2,
      'outline-inject 应有 2 处队列包裹（apply 与 undo 各一）');
    assert.strictEqual(cnt(WB, 'return withBook(wbName, async function () {'), 1,
      'wb-inject 应有 1 处队列包裹（ensureEntry）');
    assert.strictEqual(cnt(WB, 'async function ensureEntry'), 1, 'ensureEntry 签名应恰一处');
  });

  await ok('B2 两处用同一条 key 形态（wb:<书名>）—— 同一本书必须排同一条队', function () {
    const need = "serial('wb:' + String(name))";
    assert.ok(OI.indexOf(need) >= 0, 'outline-inject 的 withBook 没用 wb: 前缀');
    assert.ok(WB.indexOf(need) >= 0, 'wb-inject 的 withBook 没用 wb: 前缀');
    // 各自只有一处取队列 —— 两个取用点必然对不上，这是单点纪律
    assert.strictEqual(OI.split("serial('wb:' + String(name))").length - 1, 1,
      'outline-inject 里取队列应恰一处');
    assert.strictEqual(WB.split("serial('wb:' + String(name))").length - 1, 1,
      'wb-inject 里取队列应恰一处');
  });

  /** 找 `return withBook(...)` 到它的闭合 `});` 的行号区间（1 起，含端点）。 */
  function wrapRange(src, marker) {
    const lines = src.split('\n');
    const start = lines.findIndex(function (l) { return l.indexOf(marker) >= 0; });
    assert.ok(start >= 0, '找不到包裹起点: ' + marker);
    // 从起点往下找缩进为 4 空格的 `});`
    for (let i = start + 1; i < lines.length; i++) {
      if (/^    \}\);$/.test(lines[i])) return { start: start + 1, end: i + 1 };
    }
    assert.fail('找不到包裹终点');
  }

  await ok('B3 没有绕道的**写点**：createWorldbookEntries / cap.fn 全部落在包裹区间内', function () {
    // 判据只盯**写**，不盯读：
    //   · `TH.getWorldbook` 是读，读本身不会丢数据 —— preview 就是「真读、零写入」，
    //     把它也塞进队列只会让预览白等。真正必须串行的是「读-改-写」这个整体，
    //     而它的排他性由「写落在区间内」体现。
    //   · 能力探测行（`typeof TH.getWorldbook !== 'function'`）不是调用，带左括号的才算。
    const WRITES = ['TH.createWorldbookEntries(', 'cap.fn('];
    const lines = OI.split('\n');
    const starts = [];
    lines.forEach(function (l, i) { if (l.indexOf('return withBook(wbName, async function () {') >= 0) starts.push(i); });
    assert.strictEqual(starts.length, 2, 'outline-inject 应有两处包裹起点');
    const ranges = starts.map(function (s) {
      for (let i = s + 1; i < lines.length; i++) {
        if (/^    \}\);$/.test(lines[i])) return { start: s + 1, end: i + 1 };
      }
      assert.fail('找不到包裹终点（起点行 ' + (s + 1) + '）');
    });
    const outside = [];
    lines.forEach(function (l, i) {
      const n = i + 1;
      if (l.trim().indexOf('//') === 0) return;      // 注释不算调用
      if (l.indexOf('typeof ') >= 0) return;         // 能力探测不算调用
      WRITES.forEach(function (w) {
        if (l.indexOf(w) < 0) return;
        const inside = ranges.some(function (r) { return n >= r.start && n <= r.end; });
        if (!inside) outside.push({ line: n, call: w, text: l.trim() });
      });
    });
    assert.deepStrictEqual(outside, [],
      '有**写**调用落在队列之外（会绕过串行）: ' + JSON.stringify(outside));
    // wb-inject 侧同一口径：把整份文件的**写点**收出来，逐个核对是否落在包裹区间内
    //   （「起点之后就算」是错的判法 —— 起点之后还有函数的收尾与别的函数）
    const wl = WB.split('\n');
    const wStart = wl.findIndex(function (l) { return l.indexOf('return withBook(wbName, async function () {') >= 0; });
    assert.ok(wStart >= 0, 'wb-inject 缺包裹起点');
    let wEnd = -1;
    for (let i = wStart + 1; i < wl.length; i++) { if (/^    \}\);$/.test(wl[i])) { wEnd = i + 1; break; } }
    assert.ok(wEnd > 0, 'wb-inject 缺包裹终点');
    const wAll = [];
    wl.forEach(function (l, i) {
      const n = i + 1;
      if (l.trim().indexOf('//') === 0) return;
      if (l.indexOf('typeof ') >= 0) return;
      WRITES.forEach(function (w) {
        if (l.indexOf(w) < 0) return;
        wAll.push({ line: n, call: w });
      });
    });
    assert.ok(wAll.length >= 1, 'wb-inject 里应至少有 1 处写点（否则判据空转）');
    const wBad = wAll.filter(function (o) { return !(o.line >= wStart + 1 && o.line <= wEnd); });
    assert.deepStrictEqual(wBad, [],
      'wb-inject 有写点落在队列之外: ' + JSON.stringify(wBad));
  });

  await ok('B4 队列引擎侧：serial 走 Map 缓存（不是每次新建），runStrict 与 run 分开导出', function () {
    assert.ok(/const SERIALS = new Map\(\);/.test(WSS), '缺少 SERIALS 缓存');
    assert.ok(/function serial\(name\)/.test(WSS), '缺少 serial 函数');
    assert.ok(/if \(!s\) \{ s = createSerial\(key\); SERIALS\.set\(key, s\); \}/.test(WSS),
      'serial 必须「没有才建」，不能无条件新建');
    assert.ok(/return \{ run: run, runStrict: runStrict, stat: stat, idle: idle \};/.test(WSS),
      '实例必须同时导出 run 与 runStrict');
  });

  await ok('B5 诊断面真读 serials（不是「只有专锁读」，也不是注释里提一句）', function () {
    // 为什么这一条必须单独钉：引擎的 `serial` 有产品读点（withBook 每次调用即读），
    //   `serials` 却只被诊断面读 —— 如果诊断面这一处被删掉，`serials` 立刻回到零读，
    //   而「writeSerial 有产品读点」这个结论仍然成立（ns 级判据不细到成员）。
    //   那就成了一条「靠 ns 级判据蒙过去」的零读成员。这里把它摁在明面上。
    const TD = rd('engines/tool-diag.js');
    const lines = TD.split('\n');
    const hits = [];
    lines.forEach(function (l, i) {
      if (l.trim().indexOf('//') === 0) return;      // 注释不算
      if (l.indexOf('WA.writeSerial.serials') >= 0) hits.push(i + 1);
    });
    assert.ok(hits.length >= 1, 'tool-diag 里没有真读 WA.writeSerial.serials（只写注释不算）');
    // 读点必须被汇总面调用到（写在函数里但没人调 = 死代码，读数上完全一样）
    assert.ok(/writeSerial:\s*secWriteSerial\(\)/.test(TD),
      'secWriteSerial() 没被诊断汇总调用 ⇒ 这个读点永远不会执行');
  });


  await ok('C1 并发 apply 同一本书 ⇒ 两次都 ok、台上恰 1 条（不串行会建出 2 条同名条目）',
    async function () {
      const book = {};
      const host = makeHost(book, { readDelay: 6, writeDelay: 6 });
      global.TavernHelper = host;
      const q = W.writeSerial.serial('wb:' + BOOK_OI);
      const r = await Promise.all([
        W.outlineInject.apply(TAG1, [], { worldbookName: BOOK_OI }),
        W.outlineInject.apply(TAG1, [], { worldbookName: BOOK_OI })
      ]);
      await q.idle();
      const all = book[BOOK_OI] || [];
      assert.ok(r[0].ok === true && r[1].ok === true,
        '两次都该成功（第二次应走「已存在 ⇒ 更新」）：' + JSON.stringify([r[0].reason, r[1].reason]));
      assert.strictEqual(all.length, 1, '台上必须恰 1 条，实 ' + all.length + ' 条');
      assert.strictEqual(all[0].enabled !== false, true, '那一条应是启用的');
      // 一次 create + 一次 replace（更新走整表回写）
      assert.ok(host.__calls.create === 1, 'create 应恰 1 次，实 ' + host.__calls.create);
    });

  await ok('C2 并发 ensure 同一 order ⇒ 恰 1 条（不串行会各建一条，镜像注入两遍）', async function () {
    const book = {};
    const host = makeHost(book, { readDelay: 6, writeDelay: 6 });
    global.TavernHelper = host;
    global.SillyTavern = { getContext: function () { return { worldInfoSettings: { world_names: [BOOK_WB] } }; } };
    const q = W.writeSerial.serial('wb:' + BOOK_WB);
    const r = await Promise.all([
      W.wbInject.ensureEntry(100),
      W.wbInject.ensureEntry(100)
    ]);
    await q.idle();
    const all = book[BOOK_WB] || [];
    assert.ok(r[0].ok === true && r[1].ok === true, '两次都应 ok：' + JSON.stringify([r[0].reason, r[1].reason]));
    assert.strictEqual(all.length, 1, '同 order 必须恰 1 条，实 ' + all.length + ' 条');
    assert.strictEqual(host.__calls.create, 1, 'create 应恰 1 次（第二次走 exists 短路），实 ' + host.__calls.create);
  });

  await ok('C3 并发 ensure 不同 order ⇒ 2 条（队列没把「不同目标」串成一个）', async function () {
    const book = {};
    const host = makeHost(book, { readDelay: 6, writeDelay: 6 });
    global.TavernHelper = host;
    global.SillyTavern = { getContext: function () { return { worldInfoSettings: { world_names: [BOOK_WB] } }; } };
    const q = W.writeSerial.serial('wb:' + BOOK_WB);
    const r = await Promise.all([
      W.wbInject.ensureEntry(101),
      W.wbInject.ensureEntry(202)
    ]);
    await q.idle();
    const all = book[BOOK_WB] || [];
    assert.ok(r[0].ok === true && r[1].ok === true, '两次都应 ok');
    assert.strictEqual(all.length, 2, '不同 order 必须各 1 条，实 ' + all.length + ' 条');
  });

  await ok('C4 同队列 FIFO：后入者的任务不早于先入者开始', async function () {
    const q = W.writeSerial.serial('wb:k-order');
    const seq = [];
    await Promise.all([
      q.runStrict(async function () { await tick(25); seq.push('a'); }),
      q.runStrict(async function () { seq.push('b'); })
    ]);
    assert.deepStrictEqual(seq, ['a', 'b'], '必须先 a 后 b（并行时会是 b,a）');
  });

  await ok('C5 跨书不互斥：A 书的慢任务不阻塞 B 书', async function () {
    const qa = W.writeSerial.serial('wb:BK-A');
    const qb = W.writeSerial.serial('wb:BK-B');
    const t0 = Date.now();
    let tA = -1, tB = -1;
    await Promise.all([
      qa.runStrict(async function () { await tick(80); tA = Date.now() - t0; }),
      qb.runStrict(async function () { tB = Date.now() - t0; })
    ]);
    assert.ok(tB < 40, 'B 书不该等 A 书（实测 B 完成于 ' + tB + 'ms）');
    assert.ok(tA >= 70, 'A 书本该慢（实测 ' + tA + 'ms）');
  });

  await ok('C6 runStrict 异常穿透给调用方，且队列不断、lastError 有账', async function () {
    const q = W.writeSerial.serial('wb:k-strict');
    let threw = false, msg = '';
    try { await q.runStrict(async function () { throw new Error('boom-strict'); }); }
    catch (e) { threw = true; msg = String(e && e.message); }
    assert.ok(threw, 'runStrict 必须把异常抛给调用方（否则「静默什么都没做」）');
    assert.ok(msg.indexOf('boom-strict') >= 0, '抛出的应是原来那个错：' + msg);
    const s1 = q.stat();
    assert.strictEqual(s1.failed, 1, 'failed 应记 1，实 ' + s1.failed);
    assert.ok(s1.lastError && /boom-strict/.test(s1.lastError.message), 'lastError 应记下这条');
    const v = await q.runStrict(async function () { return 'after-error'; });
    assert.strictEqual(v, 'after-error', '队列必须继续（前一项失败不卡后一项）');
  });

  await ok('C7 run 对照：同一异常在 run 上是**吞掉**（证明两者语义真的不同）', async function () {
    const q = W.writeSerial.serial('wb:k-run');
    const v = await q.run(async function () { throw new Error('boom-run'); });
    assert.strictEqual(v, undefined, 'run 必须吞成 undefined（队列纪律）');
    const s = q.stat();
    assert.strictEqual(s.failed, 1, 'run 也要记账，实 ' + s.failed);
    assert.ok(s.lastError && /boom-run/.test(s.lastError.message), 'run 也必须记 lastError');
  });

  // ── D 运行时负控（只改内存）───────────────────────────────────
  await ok('N1 负控：把 serial 换成「每次新建」⇒ 并发 apply 必须现形（建出 2 条 / 有 verify-failed）',
    async function () {
      const keepSerial = W.writeSerial.serial;
      const keepCreate = W.writeSerial.createSerial;
      W.writeSerial.serial = function (n) { return keepCreate(n); };  // 破坏：丢掉共享
      let red = false, detail = '';
      try {
        const book = {};
        const host = makeHost(book, { readDelay: 6, writeDelay: 6 });
        global.TavernHelper = host;
        const r = await Promise.all([
          W.outlineInject.apply(TAG1, [], { worldbookName: BOOK_OI }),
          W.outlineInject.apply(TAG1, [], { worldbookName: BOOK_OI })
        ]);
        const all = book[BOOK_OI] || [];
        detail = 'n=' + all.length + ' reasons=' + JSON.stringify([r[0].reason, r[1].reason]);
        if (!(all.length === 1 && r[0].ok && r[1].ok)) red = true;
      } finally {
        W.writeSerial.serial = keepSerial;
      }
      assert.ok(red, 'N1 失效：去掉共享队列后 C1 仍然全绿 ⇒ 判据是空转（' + detail + '）');
    });

  await ok('N2 负控：把 serial 摘成 undefined（走降级直跑）⇒ 并发 apply 必须现形', async function () {
    const keepSerial = W.writeSerial.serial;
    W.writeSerial.serial = undefined;
    let red = false, detail = '';
    try {
      const book = {};
      const host = makeHost(book, { readDelay: 6, writeDelay: 6 });
      global.TavernHelper = host;
      const r = await Promise.all([
        W.outlineInject.apply(TAG1, [], { worldbookName: BOOK_OI }),
        W.outlineInject.apply(TAG1, [], { worldbookName: BOOK_OI })
      ]);
      const all = book[BOOK_OI] || [];
      detail = 'n=' + all.length + ' reasons=' + JSON.stringify([r[0].reason, r[1].reason]);
      if (!(all.length === 1 && r[0].ok && r[1].ok)) red = true;
    } finally {
      W.writeSerial.serial = keepSerial;
    }
    assert.ok(red, 'N2 失效：降级直跑后 C1 仍全绿 ⇒ 说明延迟不够大或判据空转（' + detail + '）');
  });

  // ── E 真源码破坏 ────────────────────────────────────────────
  await ok('E1 真改 wb-inject：把 withBook 的「走队列」拆成「直跑」⇒ 并发 ensure 必须建出 2 条（随后逐字节还原）',
    async function () {
      const P = path.join(BASE, WB_REL);
      const bak = fs.readFileSync(P);
      const sha0 = sha(P);
      // 破坏点选在 withBook 内部的一行：`return q.runStrict(fn);` ⇒ `return fn();`
      //   这样 ensureEntry 的调用形态完全不变，只是「没有排队」—— 正是要复现的病灶。
      //   （早先试过把 `withBook(wbName, async function () {` 拆成裸函数表达式，
      //    结果 `ensureEntry` 返回的是一个函数对象而不是结果：破坏没打在「排队」上，
      //    打在了「返回类型」上，负控因此假绿。这里记下来，避免后来者重踩。）
      const NEED = 'return q.runStrict(fn);';
      const src0 = bak.toString('utf8');
      assert.strictEqual(src0.split(NEED).length - 1, 1,
        '破坏锚点在 wb-inject 里应恰 1 次，实 ' + (src0.split(NEED).length - 1));
      let red = false, detail = '', restored = false;
      try {
        fs.writeFileSync(P, src0.replace(NEED, 'return fn();'));
        const env2 = require('./ui-gate-sync.js').fresh();
        const W2 = env2.WA;
        const book = {};
        const host = makeHost(book, { readDelay: 6, writeDelay: 6 });
        global.TavernHelper = host;
        global.SillyTavern = { getContext: function () { return { worldInfoSettings: { world_names: [BOOK_WB] } }; } };
        const r = await Promise.all([
          W2.wbInject.ensureEntry(303),
          W2.wbInject.ensureEntry(303)
        ]);
        const all = book[BOOK_WB] || [];
        detail = 'n=' + all.length + ' reasons=' + JSON.stringify([r[0] && r[0].reason, r[1] && r[1].reason]);
        if (all.length === 2) red = true;
      } finally {
        fs.writeFileSync(P, bak);
        restored = sha(P) === sha0;
      }
      assert.ok(restored, '还原失败：wb-inject.js 的 sha256 与破坏前不一致 —— 本锁自己抛，不掩盖');
      assert.ok(red, 'E1 失效：去掉队列后并发 ensure 没建出 2 条 ⇒ 病灶在真源码上没现形（' + detail + '）');
    });

  // ── 收口 ───────────────────────────────────────────────────
  console.log('\n世界书写回收口专锁 v2.551.0：' + pass + ' 通过 / ' + fail + ' 失败');
  if (fail) {
    console.log('失败项：');
    fails.forEach(function (f) { console.log('  · ' + f); });
    process.exit(1);
  }
})().catch(function (e) {
  console.log('本锁自身抛出：' + (e && e.stack ? e.stack : e));
  process.exit(1);
});

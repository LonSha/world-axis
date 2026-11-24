#!/usr/bin/env node
/**
 * v2.568.0 专锁（引擎深度第二主线）：常驻条目的**关键词闸**（greenKeys 真正的消费点）
 *
 * ── 治什么病 ───────────────────────────────────────────────────────
 *  `constant` 条目恒常占上下文预算，与「本轮聊到没聊到它」无关。本仓原来只有**事后**读数
 *  （engines/inject-value.js 算采纳率）—— 能事后追责，不能事前止损：当轮已经注进去了。
 *  本闸把 greenKeys（v2.529.0 入库、一直零消费）接到 activationOf 这个**唯一**的激活判决点上。
 *
 * ── 四条边界，每条一条断言（缺一条就会静默丢内容） ───────────────────
 *  ① 默认关闭：关闭时 activationOf 行为逐字不变（reason 仍是「强制常驻(覆写)」）；
 *  ② 派生不出键就放行（fail-open）：「没键」不等于「不相关」；
 *  ③ 本轮无可扫文本时放行：没文本不能判「没命中」；
 *  ④ 只作用于常驻面：本来就走关键词的条目不受影响。
 *  另：触发关闭的全量注入模式下本闸不参与（那是用户显式要的全量）。
 */
'use strict';
const assert = require('assert');

let WA = null;
let lsStore = {};

function mount() {
  global.window = global;
  lsStore = {};
  WA = global.WorldAxis = global.WorldAxis || {};
  WA.log = function () {};
  WA.clock = { now: function () { return 1700000000000; }, wallNow: function () { return 1700000000000; } };
  WA.mainWin = global;
  global.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(lsStore, k) ? lsStore[k] : null; },
    setItem: function (k, v) { lsStore[k] = String(v); },
    removeItem: function (k) { delete lsStore[k]; }
  };
  WA.store = { currentBranchId: function () { return 'b1'; }, get: function () { return {}; } };
  WA.backstage = { getSettings: function () { return { worldbookTrigger: true }; } };
  ['green-keys', 'worldbook'].forEach(function (n) {
    const p = require.resolve('../engines/' + n + '.js');
    delete require.cache[p];
    require(p);
  });
  return WA;
}

const ENTRIES = [
  { id: 'w::1', world: 'W', uid: 1, comment: '灰港议会', content: '灰港议会控制着北岸的码头。', constant: true, keys: [], disabled: false },
  { id: 'w::2', world: 'W', uid: 2, comment: '第七码头', content: '第七码头夜里有灯火。', constant: true, keys: [], disabled: false },
  { id: 'w::3', world: 'W', uid: 3, comment: '疑云', content: '', constant: true, keys: [], disabled: false },
  { id: 'w::4', world: 'W', uid: 4, comment: '旧钥匙', content: '灰港的旧钥匙能吃开三道门。', constant: false, keys: ['灰港'], disabled: false }
];

function boot() {
  const A = mount();
  A.worldbook.seedEntries(ENTRIES.map(function (e) { return Object.assign({}, e); }));
  A.worldbook.saveSelectedIds(ENTRIES.map(function (e) { return e.id; }));
  return A;
}
const byId = function (A, id) { return A.worldbook.peekEntries().filter(function (e) { return e.id === id; })[0]; };

async function main() {
  // ── A 默认关闭：行为逐字不变 ──
  let A = boot();
  assert.equal(A.worldbook.getAutoGreen(), false, 'A1 默认关闭（自动绿灯是 opt-in）');
  const off = A.worldbook.activationOf(byId(A, 'w::1'), '完全无关的一段正文', 'auto');
  assert.equal(off.active, true, 'A2 关闭时常驻条目照旧注入');
  assert.equal(off.reason, '🔵常驻', 'A3 关闭时 reason 逐字不变（不是换了个说法）');
  const offC = A.worldbook.activationOf(byId(A, 'w::1'), '完全无关的一段正文', 'const');
  assert.equal(offC.reason, '强制常驻(覆写)', 'A4 强制常驻覆写的 reason 也不变');

  // ── B 开启後：无命中 ⇒ 本轮不注入 ──
  assert.equal(A.worldbook.setAutoGreen(true).ok, true, 'B1 开关可写');
  assert.equal(A.worldbook.getAutoGreen(), true, 'B2 写入后读回一致');
  const miss = A.worldbook.activationOf(byId(A, 'w::1'), '完全无关的一段正文', 'auto');
  assert.equal(miss.active, false, 'B3 开启+本轮无命中 ⇒ 常驻条目本轮不注入');
  assert.ok(String(miss.reason).indexOf('绿灯闸') >= 0, 'B4 拒注要带具名原因（不静默消失）');
  assert.ok(Array.isArray(miss.keys) && miss.keys.length > 0, 'B5 拒注时附带派生的键（可复算）');
  const hit = A.worldbook.activationOf(byId(A, 'w::1'), '灰港议会的人来收税了', 'auto');
  assert.equal(hit.active, true, 'B6 命中就照旧注入');
  assert.ok(String(hit.reason).indexOf('绿灯命中') >= 0, 'B7 命中也要标明是绿灯判的');
  const missConst = A.worldbook.activationOf(byId(A, 'w::1'), '无关', 'const');
  assert.equal(missConst.active, false, 'B8 强制常驻覆写同样受闸（否则“常驻”就是绕道）');

  // ── C 三条放行边界 ──
  const noKeys = A.worldbook.activationOf(byId(A, 'w::3'), '完全无关的一段正文', 'auto');
  assert.equal(noKeys.active, true, 'C1 派生不出键 ⇒ 放行（fail-open，不误杀短条目）');
  assert.ok(String(noKeys.reason).indexOf('no-green-keys') >= 0, 'C2 放行也带理由');
  const noText = A.worldbook.activationOf(byId(A, 'w::1'), '', 'auto');
  assert.equal(noText.active, true, 'C3 本轮无可扫文本 ⇒ 放行（没文本不能判“没命中”）');
  const keyed = A.worldbook.activationOf(byId(A, 'w::4'), '完全无关的一段正文', 'auto');
  assert.equal(keyed.active, false, 'C4 走关键词的条目本来就不命中（不受本闸影响：它自己就是按需的）');
  //   C5 走**公开面**验边界④：把非常驻条目强行覆写成「常驻」，闸也必须放行
  //   （直接调 constGate 是白盒——判据要能在用户真走得到的那条路上成立）。
  const forced = A.worldbook.activationOf(byId(A, 'w::4'), '无关', 'const');
  assert.equal(forced.active, true, 'C5 本闸不碰非常驻条目（覆写成常驻也放行）');

  // ── D 真实组装面 ──
  //   边界（如实说）：buildPromptSection 的首要入口是宿主的 getSortedEntries，
  //   无头环境拿不到那个模块（会如实抛错并返回空串）。所以这里分两层：
  //   ① 判决面用 previewActivation（与组装面**同一个** activationOf）真跑；
  //   ② 组装面用**源码判据**确认它确实调的是 activationOf，而不是自己另算一套。
  const prev = A.worldbook.previewActivation('完全无关的一段正文');
  const p1 = prev.filter(function (x) { return x.id === 'w::1'; })[0];
  assert.equal(p1.active, false, 'D1 预览面与真实组装面同一判决（两处不能各算一套）');
  const prev2 = A.worldbook.previewActivation('第七码头今天很热闹');
  const p2 = prev2.filter(function (x) { return x.id === 'w::1'; })[0];
  const p3 = prev2.filter(function (x) { return x.id === 'w::2'; })[0];
  assert.equal(p2.active, false, 'D2 无命中的常驻条目在预览里被拒');
  assert.equal(p3.active, true, 'D3 命中的常驻条目在预览里放行');
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'engines/worldbook.js'), 'utf8');
  assert.ok(/const r = activationOf\(entry, text, overrides\[entry\.id\]\)/.test(src),
    'D4 组装面真的走 activationOf（源码判据：闸被绕过即红）');
  const sec = await A.worldbook.buildPromptSection('第七码头今天很热闹');
  assert.strictEqual(sec, '', 'D5 无头环境拿不到宿主模块 ⇒ 返回空串（不泄漏、也不假装注入了）');
  A.worldbook.setAutoGreen(false);
  const offAgain = A.worldbook.activationOf(byId(A, 'w::1'), '完全无关的一段正文', 'auto');
  assert.equal(offAgain.active, true, 'D6 两向自证：同一输入关掉开关就注回来（判据不是恒真）');
  A.worldbook.setAutoGreen(true);

  // ── E 选择存盘不得静默清掉开关位 ──
  A.worldbook.setAutoGreen(true);
  A.worldbook.saveSelectedIds(['w::1', 'w::2']);
  assert.equal(A.worldbook.getAutoGreen(), true, 'E1 保存选择后 autoGreen 仍在（存盘要带上开关位）');

  // ── F 依赖真存在：greenKeys 不在就是「闸恒放行」，必须单独说 ──
  assert.equal(typeof WA.greenKeys.deriveGreenKeys, 'function', 'F1 greenKeys.deriveGreenKeys 真的存在');
  //   F2/F3 也走公开面：greenKeys.deriveGreenKeys 是派生面的真源，闸只是它的调用方。
  //   白盒直调 worldbook.greenKeysOf 会把「内部判据」升成对外承诺（门禁判它过导出）。
  const ks = WA.greenKeys.deriveGreenKeys(['灰港议会', '灰港议会控制着北岸的码头。'], { max: 12 });
  assert.ok(ks.length > 0 && ks.indexOf('灰港议会') >= 0, 'F2 派生面可复算（含「灰港议会」）');
  assert.ok(ks.every(function (k) { return k.length >= 2 && k.length <= 6; }), 'F3 派生出的键全是 2–6 字（长句进不去）');
}

main().then(function () {
  console.log('WB-GREENGATE-V2568: pass（断言 ' + 27 + ' 条）');
  process.exit(0);
}).catch(function (e) {
  console.error('WB-GREENGATE-V2568: 失败 :: ' + (e && e.message));
  process.exit(1);
});

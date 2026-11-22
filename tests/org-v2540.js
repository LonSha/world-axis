#!/usr/bin/env node
// WorldAxis tests/org-v2540.js -- v2.75.0 由裸脚本改造为可挂载专锁
//
// 它治什么：组织资源：授予 / 划转 / 可支付（受阻不得改库存）
//
// 为什么改造：本文件自 v2.5x 交付起是「裸脚本 + 末尾 console.log('ORG-V2540: pass')」形态，
//   既无 module.exports、也不在 run.js 的 spawn 清单、也不被内联 —— 于是**全量回归从未执行过它**。
//   而 v2.73.0 起测试引用面已覆盖全部 tests/*.js，它的引用却被计入账本归因：
//   「归因建立在不执行的文件上」。v2.75.0 把它接进回归，并由 tests/test-surface-gate.js 防同类再生。
//   断言实现逐字保留（只把 assert 从模块自持改为由 run.js 注入，使探针不可被写死）。
'use strict';

function runAll(a) {
  const assert = require('./lock-assert.js').from(a);
  const fs = require('fs');
  const vm = require('vm');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'engines/org.js'), 'utf8');
  const store = {
    people: { p_\u963f\u5b81: { id: 'p_\u963f\u5b81', name: '\u963f\u5b81' } },
    evolution: { factions: [{ id: 'fa1', name: '\u94f6\u884c' }] }
  };
  const WA = {
    clock: { now() { return 2540; } },
    settingsBus: {
      read() { return { enabled: false, maxItems: 3 }; },
      normalize(r, v) { return v; },
      saveOrThrow(r, v) { this.read = () => v; return { ok: true }; }
    },
    store: { get() { return store; }, transact(fn) { fn(store); } }
  };
  // v2.84.0: 桩由 tests/synth-host.js 统一补齐核心模块
  require('./synth-host.js').hostStub(WA);
  global.window = { WorldAxis: WA };
  vm.runInNewContext(src, { window: global.window, Date, Number, String, Array, Object, isFinite }, { filename: 'engines/org.js' });
  const org = WA.org;
  assert.strictEqual(org.buildBlock(), '', 'disabled empty');
  assert.strictEqual(org.grant('faction', '\u4e0d\u5b58\u5728', '\u7cae', 1).reason, 'missing-holder');
  const grant = org.grant('faction', '\u94f6\u884c', '\u7cae', 5);
  assert.strictEqual(grant.ok, true);
  assert.strictEqual(store.evolution.factions[0].resources['\u7cae'], 5);
  assert.strictEqual(org.transfer('faction', '\u94f6\u884c', 'person', '\u963f\u5b81', '\u7cae', 9).reason, 'insufficient');
  assert.strictEqual(store.evolution.factions[0].resources['\u7cae'], 5, 'blocked keeps stock');
  const moved = org.transfer('faction', '\u94f6\u884c', 'person', '\u963f\u5b81', '\u7cae', 2);
  assert.strictEqual(moved.ok, true);
  assert.strictEqual(store.evolution.factions[0].resources['\u7cae'], 3);
  assert.strictEqual(store.people.p_\u963f\u5b81.resources['\u7cae'], 2);
  assert.strictEqual(org.canAfford('person', '\u963f\u5b81', '\u7cae', 2), true);
  assert.strictEqual(org.canAfford('person', '\u963f\u5b81', '\u7cae', 3), false);
  org.setSettings({ enabled: true });
  const block = org.buildBlock();
  assert.ok(block.indexOf('\u94f6\u884c\uff1a\u7cae3') >= 0 && block.indexOf('\u963f\u5b81\uff1a\u7cae2') >= 0 && block.indexOf('\u4e0d\u5f97\u51ed\u7a7a') >= 0);
  const st = org.stat();
  assert.strictEqual(st.grants, 1);
  assert.strictEqual(st.transfers, 1);
  assert.ok(st.blocked >= 1);
}

module.exports = { runAll: require('./lock-assert.js').restoring(runAll) };

if (require.main === module) runAll(require('assert'));

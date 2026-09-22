const assert = require('assert');
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
console.log('ORG-V2540: pass');

'use strict';
const assert = require('assert');
const gate = require('./field-liveness-gate.js');
const W = gate.loadWA();
W.store.init();
const fresh = JSON.parse(JSON.stringify(W.store.get()));
const ownership = gate.scanOwnership(gate.productFaces(), Object.keys(fresh));
for (const side of ['write', 'read']) {
  for (const [file, keys] of Object.entries(ownership[side])) {
    for (const [key, n] of Object.entries(keys)) {
      assert(n <= (gate.OWNED_TOP_KEYS[file + '::' + key] || 0), file + '::' + key);
    }
  }
}
// Simulate a pre-materialization save while preserving real user content.
const old = JSON.parse(JSON.stringify(fresh));
const keys = ['actors','actionCostLogs','toxicologyLedger','autobiography','blackmarketAccounts','cityFolklore','civilizationRelic','forgedIntelLogs','collateralRecords','socialBlacklist','guarantorDebts','contraband','counterfactualSandbox','courierQueue','inboxes','courtIntrigue','covenantLedger','covertSpies','covertDispatches','pacts','routineDisruptions','epidemicOutbreaks','factionChronicle','factions','schismLogs','foreshadowTree','activeCrises','regionalInstitutions','institutionalReforms','legacyOaths','maritimeVessels','socialIdeology','sanctuaries','sanctuaryLogs','sanctuaryOccupants','stagePresence','stealthTactics','supplyChokes','cityMarkets','cityPanics','rumors','surgicalPatients','terrainHazard'];
for (const key of keys) delete old[key];
old.people.kept = { id: 'kept', name: 'existing person' };
old.blackmarketAccounts = { laundered: [{ amount: 123 }], loans: [], auctions: [] };
const storageKey = 'worldaxis_state_' + W.store.chatId();
window.localStorage.setItem(storageKey, JSON.stringify(old));
W.store.init();
for (const key of keys) assert.notStrictEqual(W.store.get()[key], undefined, 'missing ' + key);
assert.strictEqual(W.store.get().people.kept.name, 'existing person');
assert.strictEqual(W.store.get().blackmarketAccounts.laundered[0].amount, 123);
assert.strictEqual(W.store.verifyState(null, { deep: true }).missingFields, 0);
// Reinitialization must allocate independent defaults, not leak previous chat data.
W.store.transact(function (d) { d.stagePresence.activeCast.push('first'); return true; }, 'materialization-probe');
window.localStorage.removeItem(storageKey);
W.store.init();
assert.strictEqual(W.store.get().stagePresence.activeCast.length, 0);
console.log('world state materialization: PASS (' + keys.length + ' containers, old-save healing, data preservation, fresh allocation)');

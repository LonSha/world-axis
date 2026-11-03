'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { load, must1, BASE } = require('./v8-harness.js');
const REL = 'engines/inject-collector.js';
function fixture(W) {
  const on = () => ({ enabled: true });
  W.store.transact(d => { W.registry.ensurePerson(d, '阿澄'); });
  W.life = { getSettings: on, buildBlock: () => '', commitmentsView: () => ({ ok: true, rows: [] }) };
  W.plan = { getSettings: on, chain: () => ({ ok: true, id: 'p1', status: 'blocked', goalText: '修好水车',
    step: { text: '领取木料' }, blockedBy: [{ kind: 'need', detail: '木料×2' }], rest: [{ text: '不应泄漏的未来步骤' }] }) };
  W.events = { getSettings: on, timelineView: () => ({ ok: true, rows: [
    { id: 'e1', title: '到期检修', due: true, canAct: true, at: 10 },
    { id: 'e2', title: '未来集市', due: false, canAct: true, at: 9000 }] }) };
  W.intel = { getSettings: on, network: () => ({ ok: true, rows: [
    { id: 'i1', person: '阿澄', claim: '已收到信', state: 'held', status: 'known', source: '来信', confidence: 'high' },
    { id: 'i2', person: '阿澄', claim: '绝密在途内容', state: 'in-transit', status: 'known' }] }) };
  W.bonds = { getSettings: on, network: () => ({ ok: true, rows: [
    { key: '甲×乙', a: '甲', b: '乙', types: ['平行共存'], at: 100 },
    { key: '阿澄×友人', a: '阿澄', b: '友人', types: ['利益同盟'], at: 1 }] }) };
}
function runAll(assertFn) {
  let pass = 0, fail = 0;
  const a = (v, m) => { if (v) pass++; else { fail++; console.error('FAIL ' + m); } if (assertFn) assertFn(!!v, m); };
  const W = load(); fixture(W);
  const ic = W.injectCollector;
  a(ic.buildBlock() === '', 'default off');
  ic.setSettings({ enabled: true });
  const before = JSON.stringify(W.store.get());
  const block = ic.buildBlock();
  a(block.includes('木料×2') && block.includes('当前拟稿'), 'chain blockers + draft boundary');
  a(!block.includes('不应泄漏的未来步骤'), 'future itinerary stays backstage');
  a(block.includes('到期检修') && !block.includes('未来集市'), 'due only');
  a(block.includes('已收到信') && !block.includes('绝密在途内容'), 'held only, in-transit never leaks');
  a(JSON.stringify(W.store.get()) === before, 'projection never changes world');
  a(ic.stat().chars === block.length, 'real char count');
  a(ic.buildBlock({ visibility: { plan: false } }).indexOf('木料×2') < 0, 'owner visibility cannot be bypassed');
  ic.setSettings({ maxItems: 1, maxChars: 400 });
  const sc = ic.buildBlock({ people: ['阿澄'] });
  a(sc.length <= 400 && ic.stat().folded > 0, 'hard size cap + folded counter');
  ic.setSettings({ maxChars: 12000 });
  ic.buildBlock({ people: ['阿澄'] });
  a(ic.stat().rows.filter(r => r.owner === 'bonds')[0].id === '阿澄×友人', 'scene relevance outranks old unrelated row');
  ic.buildBlock({ people: ['甲'] });
  a(ic.stat().rows.filter(r => r.owner === 'bonds')[0].id === '甲×乙', 'scene change changes material');
  W.life.buildBlock = () => { throw Error('broken life'); };
  const survived = ic.buildBlock();
  a(survived.includes('木料×2') && ic.stat().faults.some(r => r.owner === 'life'), 'one failed owner does not kill other material');
  // True source mutation; execute changed product and repeat the same semantic predicate.
  const source = fs.readFileSync(path.join(BASE, REL), 'utf8');
  const heldOnly = model => { fixture(model); model.injectCollector.setSettings({ enabled: true });
    return !model.injectCollector.buildBlock().includes('绝密在途内容'); };
  a(heldOnly(load()), 'negative baseline predicate true');
  const mutant = must1(source, "return r.state === 'held' &&", 'return true &&');
  a(!heldOnly(load({ [REL]: mutant })), 'mutated product fails same held-only predicate');
  let caught = 0;
  try { must1(source, 'impossible anchor', 'x'); } catch (_) { caught++; }
  try { must1('xx', 'x', 'y'); } catch (_) { caught++; }
  a(caught === 2, 'mutation utility rejects missing and ambiguous anchors');
  // Real seed and real render (not fixture projection).
  const R = load();
  R.capabilityTier.applyTier('full');
  R.populate.setSettings({ enabled: true });
  const seeded = R.populate.seed({ people: 8 });
  R.injectCollector.setSettings({ enabled: true });
  const real = R.injectCollector.buildBlock();
  a(seeded.ok && real.length > 0, 'real seeded world yields structured text');
  R.backstage.setSettings({ injectBudget: 0 });
  const slots = {};
  const context = R.mainWin.SillyTavern.getContext();
  const oldHost = context.setExtensionPrompt;
  context.setExtensionPrompt = (key, text) => { slots[key] = text; };
  try {
    R.render.applyInjections({ injections: [] });
    a(JSON.stringify(slots).includes('[结构汇流]'), 'real render deposits collector block');
    R.injectCollector.setSettings({ enabled: false });
    R.render.applyInjections({ injections: [] });
    const closed = JSON.stringify(slots);
    const renderSource = fs.readFileSync(path.join(BASE, 'render/inject.js'), 'utf8');
    const prior = must1(renderSource, 'if (vis.injectCollector && WA.injectCollector) {', 'if (false) {');
    vm.runInContext(prior, R.__testContext);
    R.render.applyInjections({ injections: [] });
    a(JSON.stringify(slots) === closed, 'off output byte-equal to pre-branch product');
  } finally { context.setExtensionPrompt = oldHost; }
  console.log('v8 collector: ' + pass + ' pass / ' + fail + ' fail');
  return { pass, fail };
}
module.exports = { runAll };
if (require.main === module) process.exitCode = runAll().fail ? 1 : 0;
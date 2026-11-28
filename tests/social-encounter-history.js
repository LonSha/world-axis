'use strict';
const assert = require('node:assert/strict');
const W = require('./ui-gate-sync').fresh().WA;
const E = W.socialEncounter;
const p = {actorId:'player'}, who = {actorId:'zhou',name:'阿舟'};
function meet(a,b,density=50,place='东市') { return E.evaluateEncounter(place,a,b,{crowdDensity:density}); }
function round(n) { assert.ok(W.store.transact(d=>{d.evolution.round=n;}).ok); }
round(4);
assert.ok(E.resetAll().ok);
assert.equal(meet({...p,stealth:99},{...who,stealth:99}).encountered,false);
assert.equal(E.getRecentEncounters().length,0);
assert.equal(meet({...p,stealth:99},who).interactionType,'avoidance');
assert.equal(meet(p,{...who,stealth:99}).interactionType,'avoidance');
assert.equal(meet({actorId:'a'},who).interactionType,'gaze_lock');
assert.equal(E.getRecentEncounters().length,3);
assert.equal(E.buildBlock(),'');
assert.ok(meet(who,p,85).ok);
assert.equal(E.buildBlock(),'【亲历偶遇】你曾在东市与阿舟擦肩而过。');
assert.ok(meet(p,who).ok);
round(5);
assert.equal(E.buildBlock(),'【亲历偶遇】你曾在东市与阿舟目光相遇。');
round(6);
assert.equal(E.buildBlock(),'');
assert.equal(E.getRecentEncounters().length,5);
assert.ok(E.resetAll().ok);
for (let i=0;i<41;i++) assert.ok(meet(p,who,50,'p'+i).ok);
assert.deepEqual(W.store.get().socialEncounter.rows.map(r=>r.placeId),Array.from({length:40},(_,i)=>'p'+(i+1)));
const rows=E.getRecentEncounters(40);
assert.equal(rows[0].placeId,'p40'); rows[0].placeId='other';
assert.equal(E.getRecentEncounters(1)[0].placeId,'p40');
const store=W.store;
try { W.store=null; assert.equal(meet(p,who).ok,false); } finally { W.store=store; }
assert.ok(E.resetAll().ok);
assert.equal(E.diagnose().recentEncounterCount,0);
for (const type of ['regenerate','swipe']) {
  const F=W.floorSettle;
  assert.ok(F.beginRound('normal').ok);
  assert.ok(meet(p,who).ok);
  assert.ok(F.endRound().ok);
  assert.equal(F.beginRound('normal').reconciled,null);
  assert.equal(E.getRecentEncounters().length,1);
  assert.equal(F.beginRound(type).reconciled.state,'rolled-back');
  assert.equal(E.getRecentEncounters().length,0);
}
console.log('PASS encounter perspective, expiry, FIFO, read isolation, store failure, reset');

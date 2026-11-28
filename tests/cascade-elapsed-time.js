'use strict';
const assert = require('node:assert/strict');
const W = require('./ui-gate-sync').fresh().WA;
const hazard = W.engines.environmentalHazard;
const metabolic = W.toxicMetabolism;
const fort = W.siegeAttrition;
const bus = W.workflow.list('after').find(n => n.id === 'cascadeBus.advanceTick');
const pulse = delta => W.cascadeBus.dispatchTick({currentZones:['Town'], activeActors:['player'], ...delta});
const read = () => [hazard.getActorExposureStatus('player').activeHazards[0]?.accumulatedErosion || 0,
  metabolic.getActorToxinStatus('player').toxins[0].concentration, fort.getFortress('Town').rationDays];
async function main() {
  W.world.setSettings({enabled:true});
  for (const name of ['Origin','Town']) assert.ok(W.world.addPlace({name}).ok);
  assert.ok(W.world.addRoad('Origin','Town',1).ok);
  assert.ok(W.world.depart('你','Origin','Town').ok);
  assert.ok(W.world.advance(1).ok);
  assert.ok(hazard.registerZoneHazard('Town','cold',2).ok);
  assert.ok(metabolic.applyToxin('player','hallucinogen',80).ok);
  assert.ok(fort.registerFortress('Town',{rationDays:20,blockadeTightness:80}).ok);
  await bus.run({});
  assert.deepEqual(read(),[0,80,20]);
  for (const delta of [{elapsedDays:0.5},{elapsedDays:61},{elapsedMinutes:-1},{elapsedMinutes:NaN},{elapsedMinutes:'10'}]) {
    assert.equal(pulse(delta).reason,'invalid-elapsed-time');
    assert.deepEqual(read(),[0,80,20]);
  }
  assert.ok(pulse({elapsedMinutes:10}).ok);
  assert.deepEqual(read(),[3.2,63.5,20]);
  assert.equal(pulse({elapsedDays:2}).cascadeReport.tactical.fortressesAdvanced,1);
  assert.deepEqual(read(),[3.2,63.5,18]);
  await bus.run({});
  assert.deepEqual(read(),[3.2,63.5,18]);
  console.log('PASS cascade elapsed time');
}
main().catch(err => {console.error(err); process.exitCode = 1;});

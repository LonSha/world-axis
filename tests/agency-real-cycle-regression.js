'use strict';
const assert=require('assert');require('./mock.js');
const W=require('./ui-gate-sync.js').fresh().WA;W.store.init();
for(const key of ['agency','plan','act','life']) W[key].setSettings({enabled:true});
(async()=>{
 const goal=W.life.addGoal('甲',{text:'等待约定窗口'});assert(goal.ok);
 const plan=W.plan.expand('甲',goal.id,[{kind:'wait',text:'等候',costMs:90000}]);assert(plan.ok,JSON.stringify(plan));
 const admitted=W.agency.schedule('甲',W.clock.now('test'));assert(admitted.ok,JSON.stringify(admitted));
 const start=W.store.get().acts.rows.find(r=>r.id===admitted.actId);
 assert(start,JSON.stringify(admitted));
 assert.strictEqual(start.duration,90000,'plan costMs must reach action duration');
 const advanced=W.act.advance(start.dueAt+1,{max:2});
 const feedback=W.agency.processReceipts(W.clock.now('test')+3000);
 assert(feedback.ok,JSON.stringify(feedback));
 assert(feedback.processed>0,JSON.stringify({advanced,feedback,acts:W.store.get().acts}));
 const repeated=W.agency.processReceipts(W.clock.now('test')+4000);
 assert.strictEqual(repeated.processed,0,JSON.stringify(repeated));
 console.log('agency real cycle regression: PASS (real goal/plan/admission/advance/receipt/idempotency)');
})().catch(e=>{console.error(e);process.exitCode=1;});
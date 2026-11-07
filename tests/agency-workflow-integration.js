'use strict';
const assert=require('assert');
require('./mock.js');
const W=require('./ui-gate-sync.js').fresh().WA;
W.store.init();
(async function(){
 const nodes=W.workflow.list('after');
 const schedule=nodes.find(n=>n.id==='agency.schedule');
 const receipts=nodes.find(n=>n.id==='agency.receipts');
 const advance=nodes.find(n=>n.id==='act.advance');
 assert(schedule&&receipts&&advance);
 assert(schedule.order<advance.order&&advance.order<receipts.order);
 const simulate=nodes.find(n=>n.id==='backstage.simulate');
 assert(simulate && receipts.order<simulate.order);
 assert.strictEqual((await schedule.run()).reason,'disabled');
 W.agency.setSettings({enabled:true,maxSchedulePerTurn:1});
 W.store.transact(d=>{d.people.a={name:'甲',life:{goals:[{status:'active'}]}};d.people.b={name:'乙',life:{goals:[{status:'active'}]}};});
 const calls=[]; const original=W.agency.schedule;
 W.agency.schedule=(name,at)=>{assert(Number.isFinite(at));calls.push(name);return {ok:true};};
 const result=await schedule.run();
 assert.strictEqual(calls.length,1);assert.strictEqual(result.deferred,1);
 await schedule.run();
 assert.strictEqual(calls.length,2);assert.notStrictEqual(calls[0],calls[1]);
 W.agency.schedule=()=>{throw new Error('one actor failure');};
 assert.strictEqual((await schedule.run()).results[0].reason,'schedule-threw');
 W.agency.schedule=original;
 const process=W.agency.processReceipts;
 let consumed=0;W.agency.processReceipts=()=>{consumed++;return {ok:true};};
 await receipts.run();assert.strictEqual(consumed,1);W.agency.processReceipts=process;
 const backstage=W.backstage;
 W.backstage={isRunning:()=>true};
 const busyState=JSON.stringify(W.store.get());
 for(const node of [schedule,advance,receipts]) {
   const busy=await node.run();assert.strictEqual(busy.reason,'backstage-running');assert.strictEqual(busy.deferred,true);
 }
 assert.strictEqual(JSON.stringify(W.store.get()),busyState);
 W.backstage=backstage;
 console.log('agency workflow integration: PASS (registration, order, gates, bounded dispatch; not live host acceptance)');
})().catch(e=>{console.error(e);process.exitCode=1;});
'use strict';
const {load,must1,BASE}=require('./v8-harness.js');
const fs=require('fs'),path=require('path');
function runAll(assertFn){
 let pass=0,fail=0;const a=(v,m)=>{v?pass++:fail++;if(!v)console.error('FAIL '+m);if(assertFn)assertFn(!!v,m);};
 function setup(W){W.events.setSettings({enabled:true,autoFulfill:true});return W;}
 const W=setup(load()),E=W.events;
 a(E.schedule({id:'due',title:'开门检修',at:0}).ok,'schedule real due row');
 a(E.schedule({id:'later',title:'未来集市',at:9000000000000000}).ok,'schedule real future row');
 a(E.schedule({id:'conditional',title:'条件会议',kind:'conditional',condition:'公示完成',at:0}).ok,'schedule explicit condition');
 const before=JSON.stringify(W.store.get());
 E.setSettings({autoFulfill:false});a(!E.fulfillDue().ok&&JSON.stringify(W.store.get())===before,'disabled bridge does not mutate world');E.setSettings({autoFulfill:true});
 const r=E.fulfillDue();a(r.ok&&r.count===1,'exactly the due unconditional event fulfills');
 const hist=W.store.get().chronicle;
 a(hist.length===1&&hist[0].title==='开门检修'&&hist[0].summary===''&&hist[0].eventId==='due','archive copies declared title only with source id');
 a(E.buildBlock().includes('[排期事件·已兑现]')&&W.chrono.chronicle().rows.some(x=>x.title==='开门检修'),'fulfilled fact reaches actual event and chronicle injection readers');
 a(E.active().some(x=>x.id==='later')&&E.active().some(x=>x.id==='conditional'),'future and unmet condition remain pending');
 a(E.fulfillDue().count===0&&W.store.get().chronicle.length===1,'repeated bridge run creates no duplicate fact');
 const op=hist[0].eventOpId;a(E.complete('due',{ok:true,opId:op,archiveScheduled:true}).reason==='duplicate-receipt','replayed receipt rejected');
 a(E.fulfillDue({metConditions:['公示完成']}).count===1,'condition passes only with explicit witness');
 const row=E.active().find(x=>x.id==='later');a(row&&row.runs===0,'future never completed');
 const M=setup(load());M.events.schedule({id:'crash',title:'坏桥重试',at:0});
 const original=M.backstage.archiveScheduled;M.backstage.archiveScheduled=()=>{throw Error('disk-sim');};
 const failed=M.events.fulfillDue();a(!failed.ok&&M.store.get().chronicle.length===0,'archive failure cannot half-commit historical fact');
 M.backstage.archiveScheduled=original;
 a(M.events.fulfillDue().count===1&&M.store.get().chronicle.length===1,'owned claimed row resumes after failed archive');
 const file='engines/events.js',src=fs.readFileSync(path.join(BASE,file),'utf8');
 const once=model=>{setup(model);model.events.schedule({id:'e',title:'唯一档案',at:0});model.events.fulfillDue();return model.store.get().chronicle.some(x=>x.title==='唯一档案');};
 a(once(load()),'real archive behavior predicate positive');
 const changed=must1(src,'WA.backstage.archiveScheduled(draft, x.title, x.id, key);','void 0;');
 let mutantResult=false;try{mutantResult=once(load({[file]:changed}));}catch(e){mutantResult=false;}
 a(!mutantResult,'true source removal fails the same archive behavior predicate');
 const N=setup(load());N.events.schedule({id:'foreign',title:'别的执行器',at:0});N.events.claim(undefined,{owner:'other'});const snapshot=JSON.stringify(N.store.get());
 a(N.events.fulfillDue().reason==='foreign-owner'&&JSON.stringify(N.store.get())===snapshot,'foreign execution ownership preserved');
 const nodes=N.workflow.list('before');a(nodes.some(x=>x.id==='events.fulfill'&&x.order===7),'before-chain fulfillment registered before injection');
 console.log('v8 event bridge: '+pass+' pass / '+fail+' fail');return{pass,fail};
}
module.exports={runAll};if(require.main===module)process.exitCode=runAll().fail?1:0;

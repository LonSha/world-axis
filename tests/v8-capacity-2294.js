'use strict';
const fs=require('fs'),path=require('path');
const {load,must1,BASE}=require('./v8-harness');
function runAll(assertFn){let pass=0,fail=0;const a=(v,m)=>{v?pass++:fail++;if(!v)console.error('FAIL '+m);if(assertFn)assertFn(!!v,m);};
 const W=load();W.life.setSettings({enabled:true});
 for(let i=0;i<20;i++){
  W.life.addGoal('容量探针',{text:'目标'+i});
  W.life.addCommitment('容量探针',{target:'见证人',text:'承诺'+i,kind:'boundary'});
  W.life.addSchedule('容量探针',{activity:'日程'+i,start:i*10+1,end:i*10+2});
 }
 const person=Object.values(W.store.get().people).find(x=>x.name==='容量探针');
 for(const [key,n] of [['goals',8],['commitments',12],['schedule',12]]){
  const meta=W.store.capsFor('people.p_容量探针.life.'+key);
  a(meta&&meta.cap===n,'registered real life '+key+' cap');
  a(person.life[key].length===n,'real owner evicts '+key+' at declared cap');
 }
 const audit=W.store.sizeAuditFull({minBytes:0,topN:1000,maxDepth:12});
 a(audit.complete&&audit.unbounded.length===0&&audit.drifted.length===0,'all three populated person life paths pass deep capacity audit');
 const pred=model=>{model.life.addGoal('容量探针',{text:'真实目标'});return model.store.sizeAuditFull({minBytes:0,topN:1000,maxDepth:12}).unbounded.length===0;};
 a(pred(load()),'capacity predicate passes original');
 const rel='core/store.js',src=fs.readFileSync(path.join(BASE,rel),'utf8');
 const broken=must1(src,"'people.*.life.goals': { cap: 8, wildcard: true, site: 'life.js addGoal concat/slice(-8)' },",'');
 let accepted=false;try{accepted=pred(load({[rel]:broken}));}catch(e){accepted=false;}a(!accepted,'removing real capacity registration makes the same audit red');
 const v=W.capabilityTier.view(),cat=W.writeDesk.catalog().rows;
 a(v.dispositions.length===35&&v.dispositions.every(x=>x.decision!=='unresolved'&&x.reason&&x.route),'every historical exclusion has an explicit disposition');
 a(v.dispositions.filter(x=>x.decision==='manual').every(x=>(x.route==='beatFacade:report' ? W.beatFacade.OPS.includes('report') : cat.some(r=>x.route==='writeDesk:'+r.ns||x.route==='writeDesk:'+r.ns+'.'+r.method))),'manual dispositions reference actual desk ports');
 console.log('v8 capacity/disposition: '+pass+' pass / '+fail+' fail');return {pass,fail};
}
module.exports={runAll};if(require.main===module)process.exit(runAll().fail?1:0);

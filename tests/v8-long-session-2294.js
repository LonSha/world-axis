'use strict';
const fs=require('fs'),path=require('path');const {load,BASE}=require('./v8-harness.js');
const {prefetch}=require('./v8-panel-activity-2294.js');
function snapshot(W){
 const rows=[],faults=[];Object.keys(W).forEach(key=>{const m=W[key];if(!m||typeof m.buildBlock!=='function')return;
 try{const text=m.buildBlock();if(typeof text==='string'&&text.trim())rows.push({key,chars:text.length});}catch(e){faults.push({key,error:String(e.message||e)});}});
 return {nonempty:rows.length,rows,faults};
}
function scenario(overrides){
 const W=prefetch(load(overrides));W.capabilityTier.applyTier('full');W.populate.setSettings({enabled:true});
 const empty=snapshot(W),seed=W.populate.seed({people:8}),seeded=snapshot(W);
 for(const key of ['life','temperament','enigma','events','memoryTiers'])W[key].setSettings({enabled:true});
 W.intake.setSettings({enabled:true});W.roundDrivers.setSettings({enabled:true});W.injectCollector.setSettings({enabled:true});W.events.setSettings({autoFulfill:true});W.backstage.setSettings({injectBudget:0});
 const names=Object.values(W.store.get().people).map(x=>x.name).filter(Boolean);if(!names.length)throw Error('seed produced no named people');
 const curve=[{round:0,...snapshot(W)}],receipts=[];
 // Declared exogenous fixture stream, not fabricated product inference. No claim of autonomous story growth.
 for(let i=1;i<=50;i++){
  W.evolution.tick();
  const name=names[(i-1)%names.length];
  const payload={people:[{name,intent:'整理第'+i+'批档案',personalityAnchor:'谨慎',speakingStyle:'直说'}],events_create:[{title:'第'+i+'批档案交接'}],blackbox:{secretActions:[{action:'保存第'+i+'份私密备忘',witnesses:name}]}};
  const r=W.intake.run(payload,{idx:i});W.roundDrivers.tickAll();W.events.fulfillDue();W.render.applyInjections({injections:[]});receipts.push({round:i,written:r.written});
  const snap=snapshot(W);curve.push({round:i,...snap,volume:W.store.get().lastInjection.volume});
 }
 const capacity=W.store.sizeAuditFull({minBytes:0,topN:1000,maxDepth:12});
 return {version:'2.294.0',scenario:'seed+declared-facts+real-owner-dispatch',empty,seedOK:seed.ok,seeded,curve,receipts,capacity,ledger:W.driverLedger.view()};
}
function runAll(assertFn){let pass=0,fail=0;const a=(v,m)=>{v?pass++:fail++;if(!v)console.error('FAIL '+m);if(assertFn)assertFn(!!v,m);};const r=scenario();
 a(r.seedOK&&r.seeded.nonempty>r.empty.nonempty,'real seed grows the empty yield face');
 a(r.curve.length===51&&r.curve[50].round===50,'50 real evolution ticks with per-round readback');
 a(r.curve.every((x,i)=>!i||x.nonempty>=r.curve[i-1].nonempty),'yield curve monotonically nondecreasing');
 a(r.curve[25].nonempty>r.curve[0].nonempty&&r.curve[50].nonempty>=r.curve[25].nonempty,'measurable engine growth by round25, no loss by50');
 a(r.curve.every(x=>x.faults.length===0),'no builder exceptions hidden by curve');
 a(r.receipts.every(x=>x.written>0),'every round dispatches declared fixture facts through real owner writes');
 a(r.curve[50].volume.rows.some(x=>x.source==='结构汇流'&&x.chars>0),'grown structured material really reaches render volume');
 a(r.capacity.complete && r.capacity.unbounded.length===0 && r.capacity.drifted.length===0,'complete capacity inventory has zero unresolved gaps');
 const active=new Set(r.curve[50].rows.map(x=>x.key));
 r.plateau={fromRound:r.curve.find(x=>x.nonempty===r.curve[50].nonempty).round,kind:'fixture-source-coverage-exhausted',explanation:'The declared input stream only targets people intent/temperament, scheduled events and secret actions. Repetition adds records/chars but does not activate unrelated mechanics. Not a claim of autonomous plot generation.',active:Array.from(active),lifeCap:8};
 console.log('v8 long-session: '+pass+' pass / '+fail+' fail');return {pass,fail,report:r};}
module.exports={scenario,snapshot,runAll};if(require.main===module){const r=runAll();const dest=process.argv[2];if(dest)fs.writeFileSync(path.resolve(dest),JSON.stringify(r.report,null,2)+'\n');console.log(JSON.stringify({empty:r.report.empty.nonempty,seeded:r.report.seeded.nonempty,curve:r.report.curve.filter(x=>[0,1,5,25,50].includes(x.round)).map(x=>({round:x.round,nonempty:x.nonempty,chars:x.volume&&x.volume.chars})),unbounded:r.report.capacity.unbounded,drifted:r.report.capacity.drifted}));process.exit(r.fail?1:0);}
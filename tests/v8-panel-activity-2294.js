'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const {load,must1,BASE}=require('./v8-harness.js');
function prefetch(W,overrides){
 const {discoverUIFiles}=require('./product-files.js');
 const run=fs.readFileSync(path.join(BASE,'tests/run.js'),'utf8');const m=run.match(/const LOAD = \[([\s\S]*?)\];/);
 const files=Array.from(new Set(vm.runInNewContext('['+m[1]+']').concat(discoverUIFiles(path.join(BASE,'ui')))));
 W.__loadOrder=files;W.__prefetch=new Map(files.map(f=>[f,overrides&&overrides[f]!==undefined?overrides[f]:fs.readFileSync(path.join(BASE,f),'utf8')]));return W;
}
function runAll(assertFn){
 let pass=0,fail=0;const a=(v,m)=>{v?pass++:fail++;if(!v)console.error('FAIL '+m);if(assertFn)assertFn(!!v,m);};
 const W=prefetch(load()),d=W.toolDiag.secPanelYield(),ledger=W.driverLedger.view();
 a(d.ok&&d.total===ledger.counts.L2p&&d.total>50,'complete real panel inventory including dynamic desk routes');
 a(d.yield+d.off+d.fault+d.noData===d.total,'four-state partition exactly equals inventory');
 a(d.fault===0,'empty world is not missing builder failure or truncated inventory');
 a(d.rows.some(r=>r.key==='karma'),'computed writeDesk call is recognized by real driver ledger');
 a(d.rows.some(r=>r.key==='geoTracker'&&r.state!=='fault'),'non-switch builders are sampled instead of false faults');
 W.karma.setSettings({enabled:true});const r=W.writeDesk.call('karma','record',['甲','debt',2,'借出粮食']);
 const receipt=W.writeDesk.stat().activity.karma;
 a(receipt.calls===1&&receipt.written===(r&&r.ok?1:0)&&receipt.rejected===(r&&r.ok?0:1),'receipt counts only true write results');
 W.writeDesk.call('karma','record',['甲','invalid',2,'bad']);
 a(W.writeDesk.stat().activity.karma.rejected>=1&&W.writeDesk.stat().rejected>=1,'rejections accounted, never passed as writes');
 const before=JSON.stringify(W.store.get());W.toolDiag.secPanelYield();a(JSON.stringify(W.store.get())===before,'panel audit does not mutate world');
 W.toolDiag.secControlUsage();a(W.toolDiag.secControlUsage().reason==='ui-not-loaded','headless host does not pretend captured UI usage');
 W.ui={usageStat:()=>({events:3,controls:{'wa-par-export':3}})};const use=W.toolDiag.secControlUsage();
 a(use.ok&&use.rows.some(r=>r.id==='wa-par-export'&&r.calls===3)&&use.zero.length>0,'usage reads observed counts and reports zero-use layered inventory');
 // Controlled owner fixture: successful write + known same-name container + empty builder.
 W.karma.buildBlock=()=>'';W.store.transact(s=>{s.karma=[{fact:'declared'}];});
 W.karma.record=()=>({ok:true});W.writeDesk.call('karma','record',[]);
 a(W.toolDiag.secPanelYield().rows.find(r=>r.key==='karma').why==='written-container-without-yield','successful receipt plus populated container detects detached renderer');
 const rel='engines/tool-diag.js',src=fs.readFileSync(path.join(BASE,rel),'utf8');
 const broken=must1(src,"state = 'fault'; why = 'written-container-without-yield';","state = 'no-data'; why = 'missed';");
 const predicate=model=>{prefetch(model);model.karma.setSettings({enabled:true});model.karma.buildBlock=()=>'';model.karma.record=()=>({ok:true});model.store.transact(s=>{s.karma=[{fact:'declared'}];});model.writeDesk.call('karma','record',[]);return model.toolDiag.secPanelYield().rows.find(r=>r.key==='karma').state==='fault';};
 a(predicate(load()),'same detached-renderer predicate passes on original');
 let mutant=false;try{mutant=predicate(load({[rel]:broken}));}catch(e){mutant=false;}
 a(!mutant,'source-mutated classifier fails the same predicate');
 // A table alone cannot wash L3 green: remove the real panel call, retain catalog.
 const panel=fs.readFileSync(path.join(BASE,'ui/panel.js'),'utf8');
 const noConsumer=panel.replace(/WA\.writeDesk\.call\(/g,'WA.writeDesk.removedCall(');
 const N=prefetch(load(),{'ui/panel.js':noConsumer});
 a(!N.driverLedger.view().layerNames.L2p.includes('karma'),'catalog without executable panel call cannot prove reachability');
 const volume=W.injectBudget.volumeView([{source:'one',content:'a'.repeat(500)}],null,{totalCap:1});
 a(!volume.ok&&volume.witnesses.some(r=>r.source==='*shared*')&&volume.poolRemain===0,'shared-budget excess has real used/cap witness');
 const unlimited=W.injectBudget.volumeView([{source:'one',content:'a'}],null,{totalCap:0});
 a(unlimited.totalCap===null&&unlimited.rows[0].cap===null,'unlimited shared mode does not fabricate per-source capacity');
 const E=load();E.events.setSettings({enabled:true,autoFulfill:true,maxClaims:1});
 E.events.schedule({id:'a',title:'待重试',at:0});const original=E.backstage.archiveScheduled;E.backstage.archiveScheduled=()=>{throw Error('fault');};E.events.fulfillDue();
 E.events.schedule({id:'b',title:'新到期',at:0});E.backstage.archiveScheduled=original;
 a(E.events.fulfillDue().count===1&&E.events.active().some(x=>x.id==='b'),'retry consumes shared per-turn claim allowance');
 a(E.events.fulfillDue().count===1,'deferred event progresses on next call');
 console.log('v8 panel/activity: '+pass+' pass / '+fail+' fail');return {pass,fail};
}
module.exports={runAll,prefetch};if(require.main===module){try{process.exit(runAll().fail?1:0);}catch(e){console.error(e.stack);process.exit(1);}}

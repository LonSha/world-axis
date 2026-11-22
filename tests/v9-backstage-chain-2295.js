'use strict';
const {load,must1,BASE}=require('./v8-harness'),fs=require('fs'),path=require('path');
(async()=>{let pass=0,fail=0;const a=(v,m)=>{v?pass++:fail++;if(!v)console.error('FAIL '+m);};
 async function scenario(overrides,advance,payload){const W=load(overrides);W.__testContext.AbortController=AbortController;
 W.store.transact(d=>{d.evolution.round=0;d.currents=[{id:'c',title:'整链修堤',stage:'起线',visibility:'known',summary:'保留原文'}];});
 W.storylineAdvance.setSettings({enabled:true,turnsPerStage:1});W.backstage.setCurrentAdvance('c',true);
 // forceSimulate is not a new reply: only evolution's registered after node advances rounds.
 if(advance)await W.workflow.list('after').find(n=>n.id==='evolution.tick').run({});
 W.backstage._runInference=async()=>payload||{};
 const result=await W.backstage.forceSimulate();return {W,result,current:W.store.get().currents[0]};}
 try{const zero=await scenario(null,false);a(zero.result.ok&&zero.W.evolution.roundOf()===0&&zero.current.stage==='起线','manual inference does not invent a reply round');
 const p=await scenario(null,true);a(p.result&&p.result.ok,'real backstage success commits');a(p.W.evolution.roundOf()===1&&p.current.stage==='延展','registered evolution lifecycle then successful inference drives one stage');a(p.current.summary==='保留原文','summary unchanged');
 await p.W.backstage.forceSimulate();a(p.W.store.get().currents[0].stage==='延展','manual same-round retry cannot advance twice');
 const rel='engines/backstage.js',src=fs.readFileSync(path.join(BASE,rel),'utf8'),anchor="if (WA.storylineAdvance && typeof WA.storylineAdvance.tick === 'function') WA.storylineAdvance.tick();";
 const n=await scenario({[rel]:must1(src,anchor,'void 0;')},true);a(n.result.ok&&n.current.stage!=='延展','same successful commit predicate rejects disconnected scheduler');
 // Preserve the actual after-node ordering: inference starts at 20 and resolves after evolution at 30.
 const Q=load();Q.__testContext.AbortController=AbortController;Q.store.transact(d=>{d.currents=[{id:'q',title:'异步整链',stage:'起线',visibility:'known'}];});Q.storylineAdvance.setSettings({enabled:true,turnsPerStage:1});Q.backstage.setCurrentAdvance('q',true);
 let release;const inference=new Promise(r=>release=r);Q.backstage._runInference=()=>inference;
 const sim=Q.workflow.list('after').find(n=>n.id==='backstage.simulate'),evo=Q.workflow.list('after').find(n=>n.id==='evolution.tick');
 // Auto mode must be enabled for the actual registered caller.
 const cfg=Q.backstage.getSettings();Q.backstage.setSettings(Object.assign({},cfg,{autoSimulate:true,simulationMode:'auto'}));
 let settled=false;Q.on('backstage:settled',()=>{settled=true;});await sim.run({});await evo.run({});release({});
 for(let i=0;i<100&&!settled;i++)await new Promise(r=>setTimeout(r,5));
 a(settled&&Q.evolution.roundOf()===1&&Q.store.get().currents[0].stage==='延展','real order20 async inference/order30 evolution/settled consumer');
 }catch(e){fail++;console.error(e.stack);}console.log('v9 backstage chain: '+pass+' / 失败 '+fail);process.exitCode=fail?1:0;
})();

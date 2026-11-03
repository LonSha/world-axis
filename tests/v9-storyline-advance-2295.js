'use strict';
const fs=require('fs'),path=require('path'),{load,must1,BASE}=require('./v8-harness');let pass=0,fail=0;
function a(v,m){if(v)pass++;else{fail++;console.error('FAIL '+m);}}
function seed(W){W.store.transact(d=>{d.evolution.round=0;d.currents=[
 {id:'public',title:'河堤修缮',stage:'起线',summary:'原文不可重写',visibility:'known'},
 {id:'hidden',title:'隐藏密谋不得泄漏',stage:'起线',summary:'秘密正文',visibility:'hidden'},
 {id:'manual',title:'未托管暗流',stage:'起线',visibility:'known'},
 {id:'legacy',title:'旧阶段暗流',stage:'发展',visibility:'known'}];});}
function round(W,n){W.store.transact(d=>{d.evolution.round=n;});}
function stages(W){return W.store.get().currents.map(c=>c.stage);}
function clockMapping(W){W.store.transact(d=>{d.currents=['起线','延展','成形','收束','淡出'].map((stage,i)=>({id:'m'+i,title:stage,stage,visibility:'known'}));});
 const view=W.undercurrentCalendar.build({horizonDays:7,maxItems:15}),expected=[7,4,2,1,0];
 return ['起线','延展','成形','收束','淡出'].every((k,i)=>{const r=view.items.find(x=>x.title===k);return r&&r.etaDays===expected[i]&&r.windowText===W.undercurrentCalendar.STAGE_WINDOWS[k].windowText;});}
try{
 const W=load();seed(W);a(W.storylineAdvance.tick().reason==='disabled','default off');
 W.storylineAdvance.setSettings({enabled:true,turnsPerStage:1});
 a(W.backstage.setCurrentAdvance('public',true).ok,'explicit enroll public');a(W.backstage.setCurrentAdvance('hidden',true).ok,'explicit enroll hidden');
 a(!W.backstage.setCurrentAdvance('legacy',true).ok,'no guessing legacy stages');
 a(!W.backstage.setCurrentAdvance('public','yes').ok,'boolean only');
 a(W.storylineAdvance.tick().moved===0,'same enrollment round no advance');
 for(let n=1;n<=5;n++){round(W,n);const r=W.storylineAdvance.tick();a(r.ok&&r.moved===(n<5?2:0),'round '+n+' one step per managed current');a(stages(W)[0]===['起线','延展','成形','收束','淡出','淡出'][n],'monotonic round '+n);a(W.storylineAdvance.tick().moved===0,'duplicate round '+n+' no second write');}
 a(stages(W)[2]==='起线'&&stages(W)[3]==='发展','unmanaged/legacy never advance');
 a(W.store.get().currents[0].summary==='原文不可重写','summary never rewritten');
 round(W,0);a(W.storylineAdvance.tick().moved===0,'clock rewind cannot advance');
 a(W.backstage.advanceManagedCurrents({round:-1}).reason==='bad-round','bad round rejects');
 const P=load();seed(P);P.storylineAdvance.setSettings({enabled:true,turnsPerStage:1});P.backstage.setCurrentAdvance('public',true);P.backstage.setCurrentAdvance('hidden',true);round(P,1);P.storylineAdvance.tick();
 const block=P.storylineAdvance.buildBlock();a(block.includes('河堤修缮')&&block.includes('起线→延展')&&!block.includes('隐藏密谋')&&!block.includes('秘密正文'),'public transition only; hidden content absent');
 Object.keys(P.render.getVisibility()).forEach(k=>P.render.setVisibility(k,false));P.render.setVisibility('storylineAdvance',true);
 const h=P.mainWin.SillyTavern.getContext(),calls=[];h.setExtensionPrompt=(key,text)=>calls.push({key,text});P.render.applyInjections({injections:[]});
 a(calls.some(x=>x.key==='WorldAxis'&&x.text.includes('河堤修缮')&&!x.text.includes('隐藏密谋')),'transition reaches real host prompt');
 P.render.setVisibility('storylineAdvance',false);calls.length=0;P.render.applyInjections({injections:[]});a(calls.every(x=>!x.text.includes('河堤修缮')),'source switch suppresses transition');
 const E=load();E.storylineAdvance.setSettings({enabled:true});a(E.storylineAdvance.tick().moved===0,'empty world no progress');
 a(clockMapping(load()),'five stages map exactly to distinct windows in actual calendar projection');
 const rel='engines/undercurrent-calendar.js',src=fs.readFileSync(path.join(BASE,rel),'utf8');
 const neg=must1(src,'if (k.toLowerCase() === raw) {',"if (['起线','延展','成形','收束','淡出'].indexOf(k)<0 && k.toLowerCase() === raw) {");
 a(!clockMapping(load({[rel]:neg})),'same projection predicate detects removal of five exact matches');
 const bRel='engines/backstage.js',bs=fs.readFileSync(path.join(BASE,bRel),'utf8'),broken=must1(bs,'c.stage=steps[ix+1];','c.stage=steps[Math.min(ix+2,steps.length-1)];'),N=load({[bRel]:broken});seed(N);N.storylineAdvance.setSettings({enabled:true,turnsPerStage:1});N.backstage.setCurrentAdvance('public',true);round(N,1);N.storylineAdvance.tick();a(stages(N)[0]!=='延展','real two-stage mutant fails one-step predicate');
}catch(e){fail++;console.error(e.stack);}
console.log('v9 storyline/calendar: '+pass+' / 失败 '+fail);process.exitCode=fail?1:0;

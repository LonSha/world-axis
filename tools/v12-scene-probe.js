#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const run=fs.readFileSync(path.join(root,'tests/run.js'),'utf8');
const body=run.slice(run.indexOf('const LOAD = ['),run.indexOf('];',run.indexOf('const LOAD = ['))+2);
const LOAD=Function('return '+body.replace(/^const LOAD = /,''))();
const stop=LOAD.indexOf('engines/liaison.js');
if(stop<0)throw new Error('liaison missing from LOAD');
const selected=LOAD.slice(0,stop+1);
const ctx={console, setTimeout, clearTimeout, Date, Math, JSON, Promise};ctx.window=ctx;ctx.log=function(){};ctx.global=ctx;ctx.globalThis=ctx;ctx.localStorage={_:{},setItem(k,v){this._[k]=String(v)},getItem(k){return this._[k]||null},removeItem(k){delete this._[k]}};ctx.document={};ctx.WorldAxis={log:function(){}};
vm.createContext(ctx);
for(const rel of selected){try{vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),ctx,{filename:rel})}catch(e){throw new Error('load '+rel+': '+e.message)}}
const WA=ctx.WorldAxis;
function ok(v,n){if(!v||v.ok!==true)throw new Error(n+': '+JSON.stringify(v));}
if(!WA.store||!WA.liaison)throw new Error('required modules missing');
WA.store.init();
WA.store.transact(d=>{d.people={p_a:{id:'p_a',name:'甲',life:{goals:[{id:'g1',status:'active'}]}},p_b:{id:'p_b',name:'乙',life:{goals:[{id:'g2',status:'active'}]}}}},'v12:seed');
WA.liaison.setSettings({enabled:false});if(WA.liaison.getSettings().enabled!==false)throw new Error('settings disable');
let r=WA.liaison.sceneOpen({opId:'probe-off',people:['甲'],intent:'不应写入'});if(r.reason!=='disabled')throw new Error('disabled guard');
WA.liaison.setSettings({enabled:true});
r=WA.liaison.sceneOpen({opId:'scene-1',kind:'promise',people:['甲','乙'],place:'集市',time:'午后',intent:'确认交付承诺',options:['履约','谈判']});ok(r,'scene open');const id=r.sceneId;
const dup=WA.liaison.sceneOpen({opId:'scene-1',people:['甲'],intent:'不同文本'});if(!dup.reused||dup.sceneId!==id)throw new Error('scene idempotence');
let q=WA.liaison.sceneResolve(id,{ref:'deal:1'});if(q.ok)throw new Error('fabricated receipt accepted');
WA.store.transact(d=>{d.liaison.deals.push({id:'1',status:'pending'})},'probe:pending');
if(WA.liaison.sceneResolve(id,{ref:'deal:1'}).ok)throw new Error('pending receipt accepted');
WA.store.transact(d=>{d.liaison.deals.find(x=>x.id==='1').status='failed'},'probe:terminal');
q=WA.liaison.sceneResolve(id,{ref:'deal:1',status:'done',sceneStatus:'invented'});ok(q,'scene resolve');
if(WA.liaison.sceneView(id).scene.receipts[0].status!=='failed')throw new Error('caller overrides truth');
const detached=WA.liaison.sceneView(id);detached.scene.people.push('伪造');detached.scene.receipts[0].status='done';
if(WA.liaison.sceneView(id).scene.people.length!==2||WA.liaison.sceneView(id).scene.receipts[0].status!=='failed')throw new Error('view alias');
WA.liaison.setSettings({enabled:false});if(WA.liaison.sceneResolve(id,{ref:'deal:1'}).reason!=='disabled')throw new Error('resolve disabled');WA.liaison.setSettings({enabled:true});
const transact=WA.store.transact;WA.store.transact=function(fn){const draft=JSON.parse(JSON.stringify(WA.store.get()));fn(draft);return {ok:false,reason:'probe-reject'}};
if(WA.liaison.sceneOpen({opId:'rejected',people:['甲'],intent:'失败事务'}).ok)throw new Error('transaction rejection ignored');WA.store.transact=transact;
q=WA.liaison.sceneResolve(id,{ref:'deal:1',source:'other'});if(!q.reused)throw new Error('receipt idempotence');
const view=WA.liaison.sceneView(id);ok(view,'scene view');if(view.scene.receipts.length!==1||view.scene.status!=='resolved')throw new Error('scene receipt state');
console.log(JSON.stringify({ok:true,loadedThrough:'engines/liaison.js',sceneId:id,receipts:view.scene.receipts.length,people:view.scene.people,status:view.scene.status}));
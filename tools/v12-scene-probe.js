#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const run=fs.readFileSync(path.join(root,'tests/run.js'),'utf8');
const body=run.slice(run.indexOf('const LOAD = ['),run.indexOf('];',run.indexOf('const LOAD = ['))+2);
const LOAD=Function('return '+body.replace(/^const LOAD = /,''))();
const stop=LOAD.indexOf('engines/liaison.js');
const selected=LOAD.slice(0,stop+1).filter(x=>fs.existsSync(path.join(root,x)));
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
let q=WA.liaison.sceneResolve(id,{ref:'deal:1',source:'act',type:'promise',status:'recorded'});ok(q,'scene resolve');
q=WA.liaison.sceneResolve(id,{ref:'deal:1',source:'other'});if(!q.reused)throw new Error('receipt idempotence');
const view=WA.liaison.sceneView(id);ok(view,'scene view');if(view.scene.receipts.length!==1||view.scene.status!=='resolved')throw new Error('scene receipt state');
console.log(JSON.stringify({ok:true,loadedThrough:'engines/liaison.js',sceneId:id,receipts:view.scene.receipts.length,people:view.scene.people,status:view.scene.status}));
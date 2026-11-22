'use strict';
const fs=require('fs');const path=require('path');
const BASE='/home/user/wa_opt1';process.chdir(BASE);
require(path.join(BASE,'tests/mock.js'));
const vm=require('vm');
const rsrc=fs.readFileSync(path.join(BASE,'tests/run.js'),'utf8');
const li=rsrc.indexOf('const LOAD = [');const lj=rsrc.indexOf('];',li);
const LOAD=vm.runInNewContext('('+rsrc.slice(rsrc.indexOf('[',li),lj+1)+')');
const ctx=vm.createContext(global);
for(const rel of LOAD){try{vm.runInContext(fs.readFileSync(path.join(BASE,rel),'utf8'),ctx,{filename:rel});}catch(e){}}
const WA=global.WorldAxis;
try{WA.store.init();}catch(e){}
WA.capabilityTier.applyTier('full');
console.log('=== 装开局蓝图 ===');
const PB=WA.playableBlueprint;
console.log('samples:',JSON.stringify(PB.listSamples()).slice(0,400));
for(const id of ['town-workshop','settlement-exploration','sci-fi-station']){
  try{const r=PB.installSample(id,{force:true});console.log(id+' =>',JSON.stringify(r).slice(0,220));}catch(e){console.log(id+' ERR '+e.message.slice(0,120));}
}
console.log('=== 开局后 world 结构 ===');
const d=WA.store.get();
console.log('people',Object.keys(d.people||{}).length,'places',Object.keys((d.world||{}).places||{}).length);
console.log('=== 开局后非空 buildBlock ===');
const keys=Object.keys(WA).filter(function(k){return WA[k]&&typeof WA[k]==='object';});
let ne=[],em=0;
for(const k of keys){const m=WA[k];if(!m||typeof m.buildBlock!=='function')continue;
  try{const b=m.buildBlock();const s=typeof b==='string'?b:JSON.stringify(b);
    if(s&&s.length>2&&s.replace(/[\s{}\[\]"\,:0-9a-zA-Z_]/g,'')!=='')ne.push(k+'('+s.length+')');else em++;}catch(e){}}
console.log('nonempty='+ne.length);
console.log(ne.join(' '));

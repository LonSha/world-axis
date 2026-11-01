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
try{WA.store.init();}catch(e){console.log('init err',e.message);}
const CT=WA.capabilityTier;
console.log('tier exports:',CT?Object.keys(CT).join(','):'NONE');
console.log('--- 切档位前 ---');
try{console.log('view:',JSON.stringify(CT.view()).slice(0,400));}catch(e){console.log('view err',e.message);}
for(const t of ['lite','standard','full']){
  try{
    const r=CT.applyTier?CT.applyTier(t):CT.setTier?CT.setTier(t):null;
    console.log('applyTier('+t+') =>',JSON.stringify(r).slice(0,300));
  }catch(e){console.log('applyTier('+t+') ERR',e.message);}
  // 量源面
  try{
    const face=WA.injectInspector&&WA.injectInspector.faceAudit?WA.injectInspector.faceAudit():null;
    if(face)console.log('  face:',JSON.stringify(face.counts||face).slice(0,300));
  }catch(e){console.log('  face err',e.message.slice(0,80));}
}

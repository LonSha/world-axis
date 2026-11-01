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
function bbCount(label){
  const keys=Object.keys(WA).filter(function(k){return WA[k]&&typeof WA[k]==='object';});
  let ne=[],em=0,tw=0;
  for(const k of keys){const m=WA[k];if(!m||typeof m.buildBlock!=='function')continue;
    try{const b=m.buildBlock();const s=typeof b==='string'?b:JSON.stringify(b);
      if(s&&s.length>2&&s.replace(/[\s{}\[\]"\,:0-9a-zA-Z_]/g,'')!=='')ne.push(k+'('+s.length+')');else em++;}
    catch(e){tw++;}}
  console.log(label+' nonempty='+ne.length+' empty='+em+' threw='+tw);
  console.log('   '+ne.join(' '));
}
console.log('=== 出厂 lite 档 ===');
try{console.log('view.tier='+WA.capabilityTier.view().tier);}catch(e){}
bbCount('[lite]');
console.log('=== 切 standard ===');
try{const r=WA.capabilityTier.applyTier('standard');console.log(' ok='+r.ok+' partial='+r.partial+' notEffective='+JSON.stringify(r.notEffective));}catch(e){console.log(' ERR '+e.message);}
bbCount('[standard]');
console.log('=== 切 full ===');
try{const r=WA.capabilityTier.applyTier('full');console.log(' ok='+r.ok+' partial='+r.partial+' notEffective='+JSON.stringify(r.notEffective));}catch(e){console.log(' ERR '+e.message);}
bbCount('[full]');
console.log('=== full 下源可见性面 ===');
try{
  const v=WA.injectInspector.faceAudit?WA.injectInspector.faceAudit():null;
  console.log(' faceAudit='+JSON.stringify(v&&(v.counts||v)).slice(0,500));
}catch(e){console.log(' face err '+e.message.slice(0,100));}
try{
  const h=WA.healthPreflight.threeGates?WA.healthPreflight.threeGates():null;
  console.log(' threeGates='+JSON.stringify(h).slice(0,600));
}catch(e){console.log(' gates err '+e.message.slice(0,100));}

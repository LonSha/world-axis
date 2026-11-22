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
// 引擎清单：有 buildBlock 的命名空间
const nsAll=Object.keys(WA).filter(function(k){return WA[k]&&typeof WA[k]==='object'&&typeof WA[k].buildBlock==='function';});
// 被 workflow 链引用的命名空间
const refNs=new Set();
for(const chain of ['before','after']){
  for(const s of WA.workflow.list(chain)){
    const head=s.id.split('.')[0];
    refNs.add(head);
  }
}
console.log('workflow 引用命名空间数',refNs.size);
console.log(Array.from(refNs).sort().join(','));
console.log('---');
console.log('有 buildBlock 的命名空间',nsAll.length);
// 归一化：workflow id 用短名（livingWorld/offlineReturn/farfield 等），引擎键也大多同名
const norm=function(x){return String(x).toLowerCase().replace(/[-_]/g,'');};
const refNorm=new Set(Array.from(refNs).map(norm));
const driven=[],undriven=[];
for(const k of nsAll){if(refNorm.has(norm(k)))driven.push(k);else undriven.push(k);}
console.log('=== 被 after/before 链驱动 ===');
console.log(driven.length+': '+driven.join(' '));
console.log('=== 未被链路驱动 ===');
console.log(undriven.length);

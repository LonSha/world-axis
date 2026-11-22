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
// 逐个看 full 档下开着但空产的引擎，问它为什么空
const SAMPLE=['life','world','events','bonds','affect','rumor','threads','causal','intel','org','longline','foreshadow','act','plan','economy','region','stage','session','atlas','weather'];
console.log('=== full 档下空产引擎的 buildBlock 返回形态 ===');
for(const k of SAMPLE){
  const m=WA[k]; if(!m||typeof m.buildBlock!=='function'){console.log(k+' : no buildBlock');continue;}
  let s;
  try{s=m.buildBlock();}catch(e){console.log(k+' : THREW '+e.message.slice(0,60));continue;}
  const t=typeof s;
  let desc;
  if(s===null)desc='null';
  else if(s===undefined)desc='undefined';
  else if(t==='string')desc='str('+s.length+')'+(s.length?'':' EMPTY');
  else desc='obj '+JSON.stringify(s).slice(0,90);
  // 问 stat/diagnose 有沒有 reason
  let reason='';try{if(m.stat){const st=m.stat();reason='stat='+JSON.stringify(st).slice(0,120);}}catch(e){}
  console.log(k.padEnd(12)+' : '+desc+'  '+reason);
}

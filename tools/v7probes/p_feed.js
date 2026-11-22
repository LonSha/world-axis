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
WA.playableBlueprint.installSample('town-workshop',{force:true});
const pid=Object.keys(WA.store.get().people)[0];
console.log('pid',pid);
function tryCall(label,fn){try{const r=fn();console.log('  '+label+' => '+JSON.stringify(r).slice(0,180));return r;}catch(e){console.log('  '+label+' ERR '+e.message.slice(0,120));}}
console.log('=== 用引擎真写口灌 life ===');
tryCall('addGoal',function(){return WA.life.addGoal(pid,{text:'把店开起来'});});
tryCall('addCommitment',function(){return WA.life.addCommitment(pid,{kind:'答应',text:'照顾妹妹'});});
tryCall('life.buildBlock',function(){return WA.life.buildBlock();});
console.log('=== bonds/affect ===');
tryCall('bonds.set',function(){return WA.bonds.set&&WA.bonds.set(pid,'p2',{intimacy:60});});
tryCall('bonds.buildBlock',function(){return WA.bonds.buildBlock();});
console.log('=== rumor ===');
tryCall('rumor.start',function(){return WA.rumor.start&&WA.rumor.start({title:'小镇传闻',text:'镇东失火'});});
tryCall('rumor.buildBlock',function(){return WA.rumor.buildBlock();});
console.log('=== causal ===');
tryCall('causal exports',function(){return Object.keys(WA.causal).slice(0,20);});
console.log('=== 各引擎写口导出名清单（抽样）===');
for(const k of ['bonds','affect','rumor','threads','causal','economy','world','events']){console.log(k+': '+Object.keys(WA[k]||{}).join(','));}

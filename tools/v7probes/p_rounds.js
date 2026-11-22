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
// 模拟多轮：每轮推进时钟 + 引擎 tick
const ROUNDS=['worldClock','offlineTick','life','world','events','bonds','affect','rumor','threads','causal','org','intel','longline','foreshadow','act','plan','economy','region','stage','session','weather','chrono','coop','collab','liaison','rehearsal','opportunity','probe','survey','contest','ruling','activity','research','family','genTiming','oneShotMod','moodGlide','stall','genGate','beatFacade','beatReport','beatLedger','storyLoop','motif','tempo','quota','spotlight','karma','hazard','marginal','tolerance','appearance','ladder','sceneSlice','gauge','rivalry','enigma','masks','temporalLock','parallelEvents','eraCycle','survival','warrant','beastBond','canon','difficulty','reasoning','noesis','perspective','sediment','lifeline','retrieval','farfield','worldBridge','offlineReturn','diplomacy','agency','freight','storyChoice','commission','investigation','aftermath','operations','elsewhere','vitals','coordinate','backstageTone','dream','floorSnapshot','memoryTiers','lingqi'];
for(let r=0;r<5;r++){
  for(const k of ROUNDS){const m=WA[k];if(!m||typeof m!=='object')continue;
    for(const fn of ['tick','step','advance','process','settle']){if(typeof m[fn]==='function'){try{m[fn]();}catch(e){}break;}}}
}
console.log('=== 5 轮推进后 ===');
const keys=Object.keys(WA).filter(function(k){return WA[k]&&typeof WA[k]==='object';});
let ne=[],em=0;
for(const k of keys){const m=WA[k];if(!m||typeof m.buildBlock!=='function')continue;
  try{const b=m.buildBlock();const s=typeof b==='string'?b:JSON.stringify(b);
    if(s&&s.length>2&&s.replace(/[\s{}\[\]"\,:0-9a-zA-Z_]/g,'')!=='')ne.push(k+'('+s.length+')');else em++;}catch(e){}}
console.log('nonempty='+ne.length+' empty='+em);
console.log(ne.join(' '));

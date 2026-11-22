'use strict';
const fs=require('fs');const path=require('path');
const BASE='/home/user/wa_opt1';process.chdir(BASE);
require(path.join(BASE,'tests/mock.js'));
const vm=require('vm');
const rsrc=fs.readFileSync(path.join(BASE,'tests/run.js'),'utf8');
const li=rsrc.indexOf('const LOAD = [');const lj=rsrc.indexOf('];',li);
const LOAD=vm.runInNewContext('('+rsrc.slice(rsrc.indexOf('[',li),lj+1)+')');
const ctx=vm.createContext(global);let fail=0;
for(const rel of LOAD){try{vm.runInContext(fs.readFileSync(path.join(BASE,rel),'utf8'),ctx,{filename:rel});}catch(e){fail++;}}
console.log('LOAD',LOAD.length,'fail',fail);
const WA=global.WorldAxis;
const keys=Object.keys(WA).filter(k=>WA[k]&&typeof WA[k]==='object');
console.log('namespaces',keys.length);
// 统计 buildBlock 面
let bb=[];for(const k of keys){const m=WA[k];if(m&&typeof m.buildBlock==='function')bb.push(k);}
console.log('with buildBlock',bb.length);
let nonempty=[],empty=[],threw=[];
for(const k of bb){try{const b=WA[k].buildBlock();const s=typeof b==='string'?b:JSON.stringify(b);if(s&&s.length>2&&s.replace(/[\s{}\[\]"\,:0-9a-zA-Z_]/g,'x')!==s){nonempty.push(k+'('+s.length+')');}else{empty.push(k);}}catch(e){threw.push(k+':'+e.message.slice(0,40));}}
console.log('EMPTY-WORLD nonempty',nonempty.length,nonempty.join(' '));
console.log('EMPTY-WORLD empty',empty.length);
console.log('threw',threw.length,threw.join(' '));

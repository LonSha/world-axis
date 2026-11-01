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
const WF=WA.workflow;
console.log('workflow exports:',Object.keys(WF).join(','));
const stages=WF.stages?WF.stages():null;
console.log('stages:',JSON.stringify(stages).slice(0,600));
for(const st of ['before','after']){try{console.log(st+' steps:',JSON.stringify(WF.list?WF.list(st):WF.stats&&WF.stats(st)).slice(0,1500));}catch(e){console.log(st+' ERR '+e.message.slice(0,80));}}

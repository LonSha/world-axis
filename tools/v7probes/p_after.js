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
const after=WA.workflow.list('after');
const before=WA.workflow.list('before');
console.log('before='+before.length+' after='+after.length);
console.log('AFTER >> '+after.map(function(s){return s.order+':'+s.id;}).join(' | '));

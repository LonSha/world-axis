'use strict';
// Independent VM per probe: never replace process-global WorldAxis/localStorage or execute main regression.
const fs=require('fs'),path=require('path'),vm=require('vm'),{createRequire}=require('module');
const BASE=path.resolve(__dirname,'..');
function load(overrides){
 const sandbox={console,process,Buffer,URL,URLSearchParams,TextEncoder,TextDecoder,setTimeout,clearTimeout,setInterval,clearInterval,
  require:createRequire(path.join(BASE,'tests/mock.js')),module:{exports:{}},__dirname:path.join(BASE,'tests'),__filename:path.join(BASE,'tests/mock.js')};
 sandbox.global=sandbox;const ctx=vm.createContext(sandbox);
 vm.runInContext(fs.readFileSync(path.join(BASE,'tests/mock.js'),'utf8'),ctx,{filename:'tests/mock.js'});
 const src=fs.readFileSync(path.join(BASE,'tests/run.js'),'utf8'),start=src.indexOf('const LOAD = ['),end=src.indexOf('];',start);
 if(start<0||end<0)throw Error('missing main LOAD declaration');
 const files=vm.runInNewContext('('+src.slice(src.indexOf('[',start),end+1)+')');
 for(const rel of files)vm.runInContext(overrides&&overrides[rel]!==undefined?overrides[rel]:fs.readFileSync(path.join(BASE,rel),'utf8'),ctx,{filename:rel});
 const W=sandbox.WorldAxis;W.store.init();Object.defineProperty(W,'__testContext',{value:ctx,enumerable:false});return W;
}
function must1(src,anchor,replacement){if(src.split(anchor).length!==2)throw Error('mutation anchor must match exactly once');return src.replace(anchor,replacement);}
module.exports={load,must1,BASE};
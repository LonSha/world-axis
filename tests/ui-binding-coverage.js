'use strict';
const fs=require('fs'),path=require('path');
const {BASE,load}=require('./v8-harness');
const {uiFiles,auditWire}=require('./ui-wire-audit');
// A conservative reverse inventory: every literal id reference is checked, not only inputs.
// Dynamic selectors are separately listed; they must not disappear as a fake 100% literal score.
function audit(options){
 const o=options||{},groups=o.groups||load().toolDiag.UI_BINDINGS,registered=new Set();
 for(const g of groups)for(const layer of ['ids','cond','dynamic'])for(const e of g[layer]||[])registered.add(typeof e==='string'?e:e.id);
 const references=[];const selectors=[];
 for(const f of uiFiles()){
  const src=o.sources&&o.sources[f.rel]!==undefined?o.sources[f.rel]:f.src;
  const wire=auditWire(src);
  for(const id of Object.keys(wire.referenced))references.push({file:f.rel,id,lines:wire.referenced[id]});
  src.split('\n').forEach((line,i)=>{if(/^\s*(\/\/|\*|\/\*)/.test(line))return;
   if(/querySelector(?:All)?\([^)]*\[data-/.test(line))selectors.push({file:f.rel,line:i+1,text:line.trim()});});
 }
 const missing=references.filter(x=>!registered.has(x.id));
 return {version:'2.294.0',ok:missing.length===0,references:references.length,registered:registered.size,covered:references.length-missing.length,percent:references.length?100*(references.length-missing.length)/references.length:0,missing,dynamicSelectors:selectors};
}
module.exports={audit};if(require.main===module){const r=audit();console.log(JSON.stringify(r,null,2));process.exit(r.ok?0:1);}

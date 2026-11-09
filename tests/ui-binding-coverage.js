'use strict';
const fs=require('fs'),path=require('path');
const {BASE,load}=require('./v8-harness');
const {uiFiles,auditWire}=require('./ui-wire-audit');
// A conservative reverse inventory: every literal id reference is checked, not only inputs.
// Dynamic selectors are separately listed; they must not disappear as a fake 100% literal score.
// v2.382.0：两层口径补正（此前本门禁恒红 3 项 —— 见下）。
//   ① `player` 层：v2.381.0 给 UI_BINDINGS 开了第四层，专收「只在玩家分支渲染」的控件
//      （wa-set-devmode / wa-set-simple-mode / wa-set-simple-save）。本循环当时只认三层，
//      于是这三枚「已登记」的控件被判成未登记。口径与 tests/run.js 的 H2 同源 ——
//      那一侧已改成 `!gIds&&!gCond&&!gDyn&&!gPlayer`，本侧漏改 ⇒ 同一条语义长出了两个答案。
//      教训：**加了一层登记，必须把「遍历登记表的每一处」一起改**；漏的那几处全在前端/门禁侧，
//      平时不报错，只在被遍历到的那条判据上假红。
//   ② `skeleton` 豁免：wa-panel / wa-orb / wa-search-bar 是面板骨架，由 mount 模板拼出、
//      不属于任何 page 组（塞进某页 ids 会在别的页被判缺失 —— 判据方向反了）。
//      H2 侧早就有 EXEMPT_H 豁免它们，本侧没有 ⇒ 同样是一件语义两个答案。
//      豁免表**只收骨架**，且必须与 tests/run.js 的 EXEMPT_H 逐字同集（下条断言钉住）。
const SKELETON_IDS = ['wa-panel', 'wa-orb', 'wa-search-bar'];
function audit(options){
 const o=options||{},groups=o.groups||load().toolDiag.UI_BINDINGS,registered=new Set();
 for(const g of groups)for(const layer of ['ids','cond','dynamic','player'])for(const e of g[layer]||[])registered.add(typeof e==='string'?e:e.id);
 for(const id of SKELETON_IDS)registered.add(id);
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
module.exports={audit,SKELETON_IDS};if(require.main===module){const r=audit();console.log(JSON.stringify(r,null,2));process.exit(r.ok?0:1);}

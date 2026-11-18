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
const SKELETON_IDS = ['wa-panel', 'wa-orb', 'wa-search-bar', 'wa-overview-absent', 'wa-tools-absent'];
// v2.524.0 收口：**宿主元素**白名单（与 SKELETON_IDS 同规格：列名字、不列豁免条件）。
//   治的病：本工具把「ui/*.js 里出现的每个字面量 #id」都当成「我们的控件必须登记」，
//   而 `#send_textarea` 是 **SillyTavern 宿主的消息输入框**：ui/panel.js 在「回到对话」
//   里只 `focus()` 它 —— 我们既不渲染它、也不拥有它，永远不会在 UI_BINDINGS 里登记。
//   把它硬塞进任何一层都会说假话（ids=我们静态渲染 / dynamic=我们异步渲染 /
//   player=玩家分支渲染），而「往表里塞一条读不出来的登记」正是本仓点名的
//   「让判据闭嘴」。故开一张显式白名单：宿主元素**单独计数**（hostRefs），
//   不进 registered、也不进 covered —— 覆盖率分母同步扣掉它们，
//   于是 100% 的含义仍然是「我们自己的引用全部登记」，没有被宿主元素冲淡。
const HOST_IDS = ['send_textarea'];
//   v2.410.0 收口：与 tests/run.js 的 EXEMPT_H（v2.380.0 起 wa-search-bar、
//   v2.401.0 OPV23 起 wa-overview-absent / wa-tools-absent，共五员）逐字同批——
//   此前 H2 侧两次扩员本侧都没跟，被 v8-desk-ui-2294 的 H2/coverage 同集判据当场抓出。
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
 // v2.524.0：宿主元素单列 —— 它们不参与「我们漏登记」的判定，也不进覆盖率分母。
 const hostRefs=references.filter(x=>HOST_IDS.indexOf(x.id)>=0);
 const ours=references.filter(x=>HOST_IDS.indexOf(x.id)<0);
 const missing=ours.filter(x=>!registered.has(x.id));
 return {version:'2.524.0',ok:missing.length===0,references:references.length,hostRefs:hostRefs.length,registered:registered.size,covered:ours.length-missing.length,percent:ours.length?100*(ours.length-missing.length)/ours.length:0,missing,hostList:hostRefs,dynamicSelectors:selectors};
}
module.exports={audit,SKELETON_IDS,HOST_IDS};if(require.main===module){const r=audit();console.log(JSON.stringify(r,null,2));process.exit(r.ok?0:1);}

/** V9: fixed-size, public-only change projection at successful inference boundaries. */
(function(){
 'use strict';
 const WA=window.WorldAxis=window.WorldAxis||{};
 const REG={key:'worldaxis_world_changes_settings_v1',module:'worldChanges',def:{enabled:false}};
 WA.__settingsRegs=(WA.__settingsRegs||[]).concat([REG]);
 function settings(){return WA.settingsBus.normalize(REG,Object.assign({},REG.def,WA.settingsBus.read(REG)||{}));}
 let last=null;
 function hash(value){const s=JSON.stringify(value);let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;}
 // Fixed five aggregates, no growing shadow table/history. Hashes are observation fingerprints, not facts.
 function capture(){
  if(!settings().enabled)return null;
  const s=WA.store.get(),publicCurrent=(s.currents||[]).filter(c=>['known','direct','public'].indexOf(c.visibility)>=0);
  const units=s.family&&s.family.units||[],projects=(s.research&&s.research.projects||[]).filter(p=>p.scope==='public');
  const ev=s.events&&s.events.rows||[];
  function mark(count,value){return {count:count,hash:hash(value)};}
  return {chatId:WA.store.chatId(),round:WA.evolution.roundOf(s),marks:{
   evolution:mark((s.evolution&&s.evolution.factions||[]).length,{factions:(s.evolution&&s.evolution.factions||[]).map(f=>[f.name,f.relation,f.status]),economy:s.evolution&&s.evolution.economy&&s.evolution.economy.climate}),
   currents:mark(publicCurrent.length,publicCurrent.map(c=>[c.id,c.stage,c.summary])),
   events:mark(ev.length,ev.map(e=>[e.id,e.status])),
   family:mark(units.length,units.map(u=>[u.id,(u.members||[]).length,(u.care||[]).filter(c=>c.active).length,u.treasury,(u.inheritances||[]).length])),
   research:mark(projects.length,projects.map(p=>[p.id,p.status,p.phase]))
  }};
 }
 const labels={evolution:'演化格局',currents:'公开暗流',events:'事件排期登记',family:'共同生活登记',research:'公开研究进程'};
 function settle(before){
  const now=capture();if(!now||!before)return {ok:false,reason:'no-baseline'};
  if(before.chatId!==now.chatId)return {ok:false,reason:'chat-changed'};
  if(now.round<before.round)return {ok:false,reason:'round-rewound'};
  const lines=[];Object.keys(labels).forEach(k=>{const a=before.marks[k],b=now.marks[k];if(a.hash!==b.hash){const delta=b.count-a.count;lines.push(labels[k]+'：'+(delta>0?'新增 '+delta+' 项':delta<0?'减少 '+(-delta)+' 项':'登记内容有更新')+'（现有 '+b.count+' 项）');}});
  last={chatId:now.chatId,round:now.round,fromRound:before.round,lines:lines};
  return {ok:true,changed:lines.length};
 }
 function view(){
  if(!settings().enabled)return {status:'disabled',text:'世界变化摘要已关闭'};
  if(!last||last.chatId!==WA.store.chatId()||last.round!==WA.evolution.roundOf())return {status:'not-settled',text:'本轮尚无成功推演的变化快照，不等于无变化'};
  const text=last.lines.length?last.lines.join('；'):'本轮无变化（本次成功推演区间，限公开投影）';
  return {status:'settled',round:last.round,fromRound:last.fromRound,text:text,lines:last.lines.slice()};
 }
 function buildBlock(){const v=view();return v.status==='settled'?'[本轮世界变化]\n'+v.text+'\n仅登记增量；排期不等于事件发生，数量变化不等于人物获知。':'';}
 WA.worldChanges={getSettings:settings,setSettings:p=>WA.settingsBus.saveOrThrow(REG,WA.settingsBus.normalize(REG,Object.assign({},settings(),p||{}))),capture,settle,view,buildBlock};
 if(WA.registerModule)WA.registerModule('engines/world-changes.js',{kind:'engine',ver:'2.295.0'});
})();
/** V8 player exports: projections are snapshots, never a second world fact source. */
(function () {
 'use strict';
 const WA=window.WorldAxis=window.WorldAxis||{};
 const LS_KEY='worldaxis_player_archive_settings_v1';
 const DEF={enabled:false,every:5,maxWorks:12};
 const __REG={key:LS_KEY,module:'playerArchive',def:DEF,bounds:{every:[1,50],maxWorks:[1,24]}};
 WA.__settingsRegs=(WA.__settingsRegs||[]).filter(r=>r&&r.key!==__REG.key).concat([__REG]);
 function settings(){return WA.settingsBus.normalize(__REG,Object.assign({},__REG.def,WA.settingsBus.read(__REG)||{}));}
 function setSettings(p){return WA.settingsBus.saveOrThrow(__REG,WA.settingsBus.normalize(__REG,Object.assign({},settings(),p||{})));}
 function chat(){return String(WA.store.chatId()||'wa_default');}
 function key(){return 'worldaxis_player_works_v1_'+encodeURIComponent(chat());}
 function copy(v){return JSON.parse(JSON.stringify(v));}
 // v2.294.0（V8 收口）：裸读点必须投递读侧归因（G16 口径）。
 //   读不到与「本来就是空」在诊断上必须分得开：不投递的话，localStorage 被拒
 //   （配额满 / 隐私模式）与「玩家还没归档过」会一起显示成空清单。
 function noteRead(k,err){try{if(WA.store&&typeof WA.store.reportReadFail==='function')WA.store.reportReadFail('playerArchive',k,err);}catch(e){}}
 function works(){const k=key();try{const r=JSON.parse(window.localStorage.getItem(k)||'[]');return Array.isArray(r)?r.slice(-24):[];}catch(e){noteRead(k,e);return [];}}
 function roundNow(){const s=WA.store.get()||{};const n=WA.evolution.roundOf(s);return typeof n==='number'&&isFinite(n)?n:0;}
  function tailState(){
    const s=WA.store.get();
    const raw={version:1,people:Object.keys(s.people||{}).map(id=>{const p=s.people[id];return {id:id,name:p.name,relations:copy(p.profile&&p.profile.relations||[])};}),
      currents:(s.currents||[]).map(c=>({id:c.id,title:c.title,stage:c.stage,summary:c.summary||'',visibility:c.visibility||'hidden'}))};
    return WA.worldSeed.validateContinuation(raw);
  }
  function byteSize(s){return new TextEncoder().encode(s).length;}
  let pendingTail=null;
  function project(){
  const data={},faults=[];
  function take(k,fn){try{data[k]=copy(fn());}catch(e){data[k]=null;faults.push({source:k,error:String(e&&e.message||e).slice(0,120)});}}
   take('continuation',()=>{const r=tailState();if(!r.ok)throw Error(r.reason);return r.tail;});
   take('briefing',()=>WA.worldBriefing.view());
  take('intent',()=>WA.intentBoard.view());
  take('bonds',()=>WA.bonds.network());
  take('intel',()=>WA.intel.network());
  take('events',()=>WA.events.timelineView({includeTerminal:true}));
  take('commitments',()=>WA.life.commitmentsView());
  take('autobiography',()=>WA.worldAutobiography.exportText());
  take('chronicle',()=>WA.chrono.chronicle({limit:256}));
  take('injection',()=>((WA.store.get()||{}).lastInjection||null));
  return {ok:faults.length===0,format:'worldaxis-player-projections',version:1,chatId:chat(),round:roundNow(),data:data,faults:faults,
   audience:'author-private',note:'作者侧本地归档，可能含秘密与情报持有人；不要公开分发。投影不导入为事实。'};
 }
 function exportJSON(){const p=project();return {ok:p.ok,package:p,json:JSON.stringify(p,null,2)};}
 function checkpoint(){
  const cfg=settings();if(!cfg.enabled)return {ok:false,reason:'disabled'};
  const round=roundNow();
  if(round<=0||round%cfg.every!==0)return {ok:true,captured:false,status:'not-cycle',round:round};
  const list=works();if(list.some(x=>x.round===round))return {ok:true,captured:false,status:'already-captured',round:round};
  const p=project();if(!p.ok)return {ok:false,reason:'projection-failed',faults:p.faults};
  const next=list.concat([p]).slice(-cfg.maxWorks),json=JSON.stringify(next);
  if(byteSize(json)>524288)return {ok:false,reason:'archive-too-big',bytes:byteSize(json),chars:json.length,cap:524288};
  try{window.localStorage.setItem(key(),json);}catch(e){return {ok:false,reason:'archive-write-failed',error:String(e&&e.message||e).slice(0,120)};}
  return {ok:true,captured:true,round:round,count:next.length};
 }
  function continuationPack(name,opt){
    const chosen=opt&&opt.round,work=works().find(x=>x.round===chosen);
    if(!work||!work.data||!work.data.continuation)return {ok:false,reason:'archive-tail-unavailable'};
    const valid=WA.worldSeed.validateContinuation(work.data.continuation);if(!valid.ok)return valid;
    const tail=valid.tail,nodes=tail.people.map(p=>p.name);
    if(!nodes.length)return {ok:false,reason:'nothing-to-continue'};
    // Structural seed is only a preview carrier; exact relations/currents are installed by the same owner transaction.
    const text=JSON.stringify(tail);let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);
    const seed={ver:WA.worldSeed.SEED_VER,sig:('00000000'+(h>>>0).toString(16)).slice(-8),at:work.round,powers:[],network:{nodes:nodes,edges:[]},geo:{places:[],roads:0},era:{title:'归档末态续接',label:'',note:''}};
    const pack={packVer:1,name:name||'归档末态续接',chatId:chat(),seed:seed};
    const envelope={format:'worldaxis-continuation',version:1,audience:'author-private',seedPack:pack,tail:tail,source:{chatId:chat(),round:work.round},retainNote:'只续人物身份/已登记关系/暗流阶段与原文；重置轮数与托管；不恢复纪事、记忆、知情、排期、照护、研究。空新聊天导入→预览→确认。'};
    const json=JSON.stringify(envelope,null,2);if(byteSize(json)>524288)return {ok:false,reason:'archive-too-big',bytes:byteSize(json),cap:524288};
    return {ok:true,package:envelope,json:json};
  }
  function seedPack(name,opt){
   if(opt&&opt.mode==='continuation')return continuationPack(name,opt);
  const ext=WA.worldSeed.extract();if(!ext.ok)return ext;
  const text=WA.worldAutobiography.exportText();if(!text.ok)return text;
  const saved=WA.worldSeed.save(name||'自传格局新局',[],{seed:ext.seed});
  if(!saved.ok&&saved.reason!=='duplicate-seed')return saved;
  const pack=WA.worldSeed.transferPack(saved.id||saved.existing);if(!pack.ok)return pack;
  const envelope={format:'worldaxis-autobiography-seed',version:1,seedPack:pack.pack,autobiography:text,
   retainNote:'只初始化格局；自传是来源附件，不移植为目标局已发生历史。请在空新聊天导入→预览→确认。'};
  return {ok:true,package:envelope,json:JSON.stringify(envelope,null,2)};
 }
 function importSeedPack(raw){
  let p;try{p=typeof raw==='string'?JSON.parse(raw):raw;}catch(e){return {ok:false,reason:'bad-pack'};}
   if(p&&p.format==='worldaxis-continuation'){
     if(p.version!==1||!p.seedPack||!p.source||p.source.chatId===chat()||byteSize(JSON.stringify(p))>524288)return {ok:false,reason:'bad-continuation-pack'};
     const v=WA.worldSeed.validateContinuation(p.tail);if(!v.ok)return v;
     const nodes=p.seedPack.seed&&p.seedPack.seed.network&&p.seedPack.seed.network.nodes;
     if(JSON.stringify(nodes)!==JSON.stringify(v.tail.people.map(x=>x.name)))return {ok:false,reason:'continuation-seed-mismatch'};
     const r=WA.worldSeed.importPack(p.seedPack,{continuationRequired:true});if(!r.ok&&r.reason!=='duplicate-seed')return r;
     const id=r.id||r.existing;if(!r.ok){const mark=WA.worldSeed.requireContinuation(id);if(!mark.ok)return mark;}pendingTail={id:id,chatId:chat(),epoch:WA.store.epoch(),tail:v.tail};
     return {ok:true,id:id,mode:'continuation',note:p.retainNote};
   }
   if(!p||p.format!=='worldaxis-autobiography-seed'||p.version!==1||!p.seedPack||!p.autobiography||typeof p.autobiography.markdown!=='string')return {ok:false,reason:'bad-pack'};
  // Delegate validation and atomic acceptance to the seed owner. The story is an attachment, not target-world history.
  return WA.worldSeed.importPack(p.seedPack);
 }
  function previewSeed(id,variance){
    if(pendingTail&&pendingTail.id===id){
      if(pendingTail.chatId!==chat()||pendingTail.epoch!==WA.store.epoch()){pendingTail=null;return {ok:false,reason:'stale-continuation'};}
      return WA.worldSeed.initPreview(id,variance,{continuation:pendingTail.tail});
    }
    return WA.worldSeed.initPreview(id,variance);
  }
  function view(){return {settings:settings(),chatId:chat(),works:works(),note:'本机按聊天隔离，最多24份周期作品；非跨设备备份。作者侧含私密信息。'};}
 WA.playerArchive={getSettings:settings,setSettings:setSettings,exportJSON:exportJSON,checkpoint:checkpoint,seedPack:seedPack,previewSeed:previewSeed,importSeedPack:importSeedPack,view:view};
 if(WA.registerModule)WA.registerModule('engines/player-archive.js',{kind:'engine',ver:'2.294.0'});
})();
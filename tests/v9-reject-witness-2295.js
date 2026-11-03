'use strict';
// Actual rejection witnesses, independent of the large historical witness world's accumulated fixtures.
const {load} = require('./v8-harness');
const EXPECTED = ['archive-tail-unavailable','bad-continuation','bad-continuation-current','bad-continuation-pack','bad-continuation-person','bad-continuation-relation','bad-enabled','chat-changed','continuation-seed-mismatch','continuation-tail-required','current-missing','dangling-continuation-relation','nothing-to-continue','owner-missing','round-rewound','stale-continuation','transaction-failed','unsupported-stage','archive-write-failed','archive-too-big'];
function collect() {
 const W=load(),out={};
 const take=(code,fn)=>{try{const r=fn();out[code]=r&&r.reason||r||'';}catch(e){out[code]='witness-threw: '+e.message;}};
 const good=()=>({version:1,people:[{id:'a',name:'甲',relations:[]},{id:'b',name:'乙',relations:[]}],currents:[]});
 take('bad-continuation',()=>W.worldSeed.validateContinuation({}));
 take('bad-continuation-person',()=>{const t=good();t.people[0].id='__proto__';return W.worldSeed.validateContinuation(t);});
 take('dangling-continuation-relation',()=>{const t=good();t.people[0].relations=[{target:'absent'}];return W.worldSeed.validateContinuation(t);});
 take('bad-continuation-relation',()=>{const t=good();t.people[0].relations=[{target:'b',trust:101}];return W.worldSeed.validateContinuation(t);});
 take('bad-continuation-current',()=>{const t=good();t.currents=[{id:'c',title:'线',stage:'起线',summary:'',visibility:'invalid'}];return W.worldSeed.validateContinuation(t);});
 take('bad-enabled',()=>W.backstage.setCurrentAdvance('x',1));
 take('current-missing',()=>W.backstage.setCurrentAdvance('absent',true));
 W.store.transact(d=>{d.currents=[{id:'c',title:'线',stage:'未知段',summary:'',visibility:'known'}];});
 take('unsupported-stage',()=>W.backstage.setCurrentAdvance('c',true));
 W.store.transact(d=>{d.currents[0].stage='起线';d.currents[0].autoAdvance=true;d.currents[0].advanceAtRound=0;});
 const tx=W.store.transact;try {W.store.transact=()=>({ok:false});take('transaction-failed',()=>W.backstage.advanceManagedCurrents({round:1,turnsPerStage:1}));}finally{W.store.transact=tx;}
 W.storylineAdvance.setSettings({enabled:true});const owner=W.backstage;try{W.backstage=undefined;take('owner-missing',()=>W.storylineAdvance.tick());}finally{W.backstage=owner;}
 W.worldChanges.setSettings({enabled:true});W.store.transact(d=>{d.evolution.round=5;});const before=W.worldChanges.capture();W.store.transact(d=>{d.evolution.round=0;});take('round-rewound',()=>W.worldChanges.settle(before));
 const ctx=W.mainWin.SillyTavern.getContext();ctx.chatId='v9-reject-other';ctx.chatMetadata={};W.store.init();take('chat-changed',()=>W.worldChanges.settle(before));
 take('archive-tail-unavailable',()=>W.playerArchive.seedPack('none',{mode:'continuation',round:999}));
 take('bad-continuation-pack',()=>W.playerArchive.importSeedPack({format:'worldaxis-continuation',version:2,source:{chatId:'different'}}));
 W.playerArchive.setSettings({enabled:true,every:1,maxWorks:24});W.store.transact(d=>{d.evolution.round=1;});const empty=W.playerArchive.checkpoint();if(!empty.captured)throw Error('empty fixture checkpoint failed: '+JSON.stringify(empty));
 take('nothing-to-continue',()=>W.playerArchive.seedPack('empty',{mode:'continuation',round:1}));
 W.worldSeed.setSettings({enabled:true});W.store.transact(d=>{W.registry.ensurePerson(d,'a','甲');W.registry.ensurePerson(d,'b','乙');d.evolution.round=2;});
 const cp=W.playerArchive.checkpoint();if(!cp.captured)throw Error('source fixture checkpoint failed');const p=W.playerArchive.seedPack('续接',{mode:'continuation',round:2});if(!p.ok)throw Error(JSON.stringify(p));
 ctx.chatId='v9-reject-target';ctx.chatMetadata={};W.store.init();
 take('continuation-seed-mismatch',()=>{const q=JSON.parse(p.json);q.seedPack.seed.network.nodes=['别人'];return W.playerArchive.importSeedPack(q);});
 const imp=W.playerArchive.importSeedPack(p.json);if(!imp.ok)throw Error(JSON.stringify(imp));W.store.init();
 take('stale-continuation',()=>W.playerArchive.previewSeed(imp.id,0));
 take('continuation-tail-required',()=>W.worldSeed.initPreview(imp.id,0));
 const A=load();A.playerArchive.setSettings({enabled:true,every:1,maxWorks:24});A.store.transact(d=>{d.evolution.round=1;});
 const ls=A.__testContext.localStorage,save=ls.setItem;try{ls.setItem=function(k,v){if(k.startsWith('worldaxis_player_works_v1_'))throw Error('quota');return save.call(this,k,v);};take('archive-write-failed',()=>A.playerArchive.checkpoint());}finally{ls.setItem=save;}
 A.store.transact(d=>{d.chronicle=[];for(let i=0;i<200;i++)d.chronicle.push({at:1000+i,kind:'event',title:'交接'+i+'事'.repeat(77),summary:'录'.repeat(117),refs:['a','b'],visibility:'public'});});
 take('archive-too-big',()=>{for(let r=1;r<=24;r++){A.store.transact(d=>{d.evolution.round=r;});const x=A.playerArchive.checkpoint();if(x.reason==='archive-too-big')return x;}return '';});
 return out;
}
function runAll(assert){const out=collect();for(const code of EXPECTED)assert(out[code]===code,'V9 real reject witness '+code+' (got '+out[code]+')');}
module.exports={collect,runAll};
if(require.main===module){let pass=0,fail=0;try{runAll((ok,msg)=>{ok?pass++:fail++;if(!ok)console.error('FAIL '+msg);});}catch(e){fail++;console.error(e.stack);}console.log('v9 reject witnesses: '+pass+' / 失败 '+fail);process.exitCode=fail?1:0;}
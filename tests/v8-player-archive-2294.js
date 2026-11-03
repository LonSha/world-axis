'use strict';
const {load,must1,BASE}=require('./v8-harness.js'),fs=require('fs'),path=require('path');
function runAll(assertFn){let pass=0,fail=0;const a=(v,m)=>{v?pass++:fail++;if(!v)console.error('FAIL '+m);if(assertFn)assertFn(!!v,m);};
 const W=load();W.capabilityTier.applyTier('full');W.populate.setSettings({enabled:true});W.populate.seed({people:8});
 W.store.transact(d=>{W.backstage.archiveScheduled(d,'当期登记事实','source','source#1');d.evolution.round=5;});
 const before=JSON.stringify(W.store.get()),r=W.playerArchive.exportJSON();
 a(r.ok&&r.package.format==='worldaxis-player-projections','real projection export succeeds');
 a(JSON.stringify(r.package.data.briefing)===JSON.stringify(W.worldBriefing.view()),'briefing export equals panel owner reading byte-for-byte');
 a(JSON.stringify(r.package.data.bonds)===JSON.stringify(W.bonds.network()),'relationship export equals panel reading');
 a(JSON.stringify(W.store.get())===before,'export never writes world');
 a(r.package.data.autobiography.markdown.includes('当期登记事实')&&r.package.audience==='author-private','fact provenance and private audience explicit');
 W.playerArchive.setSettings({enabled:true,every:5,maxWorks:2});
 a(W.playerArchive.checkpoint().captured,'cycle checkpoint uses actual evolution round');
 a(!W.playerArchive.checkpoint().captured,'duplicate cycle not archived twice');
 W.store.transact(d=>{d.evolution.round=6;});a(!W.playerArchive.checkpoint().captured,'noncycle creates no work');
 for(const round of [10,15]){W.store.transact(d=>{d.evolution.round=round;});W.playerArchive.checkpoint();}
 a(JSON.stringify(W.playerArchive.view().works.map(x=>x.round))==='[10,15]','work history bounded by configured cap');
 const worldBeforeSeed=JSON.stringify(W.store.get()),pack=W.playerArchive.seedPack('来源自传');
 a(pack.ok&&pack.package.autobiography.markdown.includes('当期登记事实'),'source saves autobiography plus owner-generated seed pack');
 const savedSource=JSON.stringify(W.store.get()),sourceKey='worldaxis_state_'+W.store.chatId(),sourceDisk=W.mainWin.localStorage.getItem(sourceKey);
 a(savedSource!==worldBeforeSeed,'source save is explicit seed-library write');
 const ctx=W.mainWin.SillyTavern.getContext();ctx.chatId='v8-target';ctx.chatMetadata={};W.store.init();
 a(W.playerArchive.view().works.length===0,'works isolated by actual target chat');
 const targetBefore=JSON.stringify(W.store.get());
 a(!W.playerArchive.importSeedPack('{bad').ok&&JSON.stringify(W.store.get())===targetBefore,'malformed package rejects without half write');
 const imported=W.playerArchive.importSeedPack(pack.json);a(imported.ok,'target imports source structural seed');
 const preview=W.worldSeed.initPreview(imported.id,0);a(preview.ok,'target preview succeeds');
 const confirm=W.worldSeed.initConfirm();a(confirm.ok&&Object.keys(W.store.get().people).length>0,'explicit confirmation initializes new world');
 a(W.store.get().chronicle.length===0,'source autobiography never becomes target past facts');
 a(W.mainWin.localStorage.getItem(sourceKey)===sourceDisk,'source chat persisted bytes unchanged by target operations');
 const already=JSON.stringify(W.store.get());a(!W.worldSeed.initPreview(imported.id,0).ok&&JSON.stringify(W.store.get())===already,'nonempty target refuses preview without changes');
 const file='engines/player-archive.js',src=fs.readFileSync(path.join(BASE,file),'utf8');
 const captures=M=>{M.playerArchive.setSettings({enabled:true});M.store.transact(d=>{d.evolution.round=5;});M.playerArchive.checkpoint();return M.playerArchive.view().works.length===1;};
 a(captures(load()),'checkpoint behavior positive');
 let changed=false;try{changed=captures(load({[file]:must1(src,'window.localStorage.setItem(key(),json);','void 0;')}));}catch(e){}
 a(!changed,'true persistence-source removal fails same checkpoint behavior');
 console.log('v8 player archive: '+pass+' pass / '+fail+' fail');return{pass,fail};}
module.exports={runAll};if(require.main===module)process.exitCode=runAll().fail?1:0;
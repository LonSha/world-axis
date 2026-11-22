'use strict';
const fs=require('fs'),path=require('path');
const {load,must1,BASE}=require('./v8-harness');
let pass=0,fail=0;
function a(v,m){if(v)pass++;else{fail++;console.error('FAIL '+m);}}
function ok(r,m){a(!!r&&r.ok===true,m);return r;}
function seed(W){
 W.store.transact(d=>{['阿澄','林溪','长者'].forEach(name=>{
  const r=W.registry.ensurePerson(d,'p_'+name,name,'v9-fixture');
  if(!r||!r.row)throw Error('registry fixture failed');r.row.resources={铜:30,木:12};
 });});
}
function fixture(overrides){
 const W=load(overrides);seed(W);
 ['family','research','opportunity','beatLedger'].forEach(k=>W[k].setSettings({enabled:true}));
 const u=ok(W.family.createUnit({name:'溪畔合居',by:'阿澄',type:'合居'}),'real family create');
 ok(W.family.addMember(u.id,'林溪','成员'),'real family add');
 ok(W.family.assignCare(u.id,'阿澄','长者','晚间照护'),'real care assignment');
 ok(W.family.transferCare(u.id,'长者','林溪','阿澄远行'),'real care transfer');
 ok(W.family.contribute(u.id,'阿澄','铜',10),'real treasury contribution');
 const p=ok(W.research.open({hypothesis:'验证水车轴承',by:'阿澄',result:'轴承图纸',resultKind:'tool',materials:{木:4},phases:2}),'real research open');
 ok(W.research.supply(p.id,'阿澄','木',4),'real material supply');
 ok(W.research.advance(p.id),'real research advance');
 ok(W.beatLedger.plan(['修水车','未来秘密拍不得泄漏']),'real beat plan');
 // Known stored owner format, covers all expired/read states without faking render.
 W.store.transact(d=>{d.opportunity={openings:[
  {id:'v9-expired',source:'life',sourceLabel:'承诺',from:'失约邀约',actors:['阿澄'],stage:'lapsed',windowBasis:'recorded',deadlineAt:1,firstAt:1,lastAt:1,windowMs:1,lapsedAt:2},
  {id:'v9-pending',source:'life',sourceLabel:'承诺',from:'等待作答的邀约',actors:['林溪'],stage:'open',windowBasis:'recorded',deadlineAt:9007199254740000,firstAt:1,lastAt:1,windowMs:9007199254740000}
 ]};});
 Object.keys(W.render.getVisibility()).forEach(k=>W.render.setVisibility(k,false));
 ['family','research','opportunity','beatLedger'].forEach(k=>W.render.setVisibility(k,true));
 return {W,u,p};
}
function render(W){
 const host=W.mainWin.SillyTavern.getContext(),calls=[],old=host.setExtensionPrompt;
 host.setExtensionPrompt=(key,text)=>calls.push({key,text});
 try{W.render.applyInjections({injections:[]});}finally{host.setExtensionPrompt=old;}
 const snap=W.store.get().lastInjection||{},main=calls.find(x=>x.key==='WorldAxis');
 return (snap.sources||[]).map(source=>({source,content:main?main.text:''}));
}
function world(W){const d=JSON.parse(JSON.stringify(W.store.get()));
 // Explicit diagnostic writes are allowed; no blanket stripping of other world fields.
 ['lastInjection'].forEach(k=>delete d[k]);
 ['updatedAt','stateRev','writer','writeSeq'].forEach(k=>{if(d.meta)delete d.meta[k];});return d;
}
function content(rows,label){return rows.filter(x=>x.source===label).map(x=>x.content).join('\n');}
try{
 const {W,u,p}=fixture();const before=world(W);
 const rows=render(W);
 const labels={family:'共同生活',research:'研究进程',opportunity:'机会窗口',beatLedger:'当前拍账'};
 Object.keys(labels).forEach(ns=>a(!!content(rows,labels[ns]),ns+' reaches real applyInjections'));
 const f=content(rows,labels.family),r=content(rows,labels.research),o=content(rows,labels.opportunity),b=content(rows,labels.beatLedger);
 a(f.includes('公共池余额：铜×10')&&f.includes('林溪→长者')&&f.includes('阿澄→林溪'),'family balance, active care and transfer grounded in owner');
 a(f.includes('期限未登记'),'no invented care expiry');
 a(r.includes('实验结果：未定')&&!r.includes('轴承图纸')&&!r.includes('验证水车轴承')&&!r.includes('已耗资源：木'),'private project details are excluded rather than relying on a disclaimer');
 a(b.includes('修水车')&&!b.includes('未来秘密拍不得泄漏'),'only current beat, no future titles');
 a(o.includes('失约邀约')&&o.includes('已错过（不可再参与')&&o.includes('可作答窗口（尚未接受）'),'expired window distinct from pending consent');
 const after=world(W),changed=Object.keys({...before,...after}).filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k]));console.log('WORLD_DIFF '+JSON.stringify(changed));a(!changed.length,'owner projections do not mutate world: '+changed.join(','));
 for(const ns of Object.keys(labels)){
  W.render.setVisibility(ns,false);a(!content(render(W),labels[ns]),ns+' source switch really suppresses block');W.render.setVisibility(ns,true);
  W[ns].setSettings({enabled:false});a(!content(render(W),labels[ns]),ns+' owner switch really suppresses block');W[ns].setSettings({enabled:true});
 }
 ok(W.beatLedger.land({}),'real land current beat');a(W.beatLedger.buildBlock().includes('未来秘密拍不得泄漏'),'next title appears only after engine lands current');
 const claim=W.beatLedger.claim(99);a(claim.ok===false&&claim.reason==='beat-order-locked','claim cannot advance beat');
 ok(W.research.advance(p.id),'real research completes');a(W.research.buildBlock().includes('已确认（内容受限）'),'confirmed private result stays private');
 a(!W.research.canUse('林溪','轴承图纸').ok,'outsider cannot use secret result');
 ok(W.research.disseminate(p.id,'public'),'real public dissemination');
 const pub=content(render(W),'研究进程');a(pub.includes('实验结果：已确认 轴承图纸')&&pub.includes('已耗资源：木×4'),'public confirmed research and real spent materials reach host prompt');
 ok(W.family.inherit(u.id,'长者',['林溪'],'明确交接事件'),'real inheritance');a(W.family.buildBlock().includes('已完成财产交接：长者→林溪'),'inheritance comes from recorded event');
 const old=W.family.buildBlock;W.family.buildBlock=()=>{throw Error('owner fault');};
 const survived=render(W);a(!content(survived,'共同生活')&&!!content(survived,'研究进程'),'one owner throwing does not kill other sources');W.family.buildBlock=old;
 const rel='render/inject.js',src=fs.readFileSync(path.join(BASE,rel),'utf8');
 const anchor="return WA.family.buildBlock();";
 const noFamily=must1(src,anchor,"return '';"),M=fixture({[rel]:noFamily}).W;
 a(!content(render(M),'共同生活'),'real source removal fails same nonempty render predicate');
 const beatRel='engines/beat-ledger.js',beat=fs.readFileSync(path.join(BASE,beatRel),'utf8');
 const filter="(v.rows || []).filter(function (r) { return r.status === 'landed' || r.no === cur.no; }).slice(-16)";
 const broken=must1(beat,filter,'(v.rows || []).slice(-16)'),N=fixture({[beatRel]:broken}).W;
 a(N.beatLedger.buildBlock().includes('未来秘密拍不得泄漏'),'real mutant fails same future-title protection');
 let caught=0;try{must1(src,'absent-v9','x');}catch(_){caught++;}try{must1('aa','a','b');}catch(_){caught++;}a(caught===2,'mutation anchors missing/ambiguous reject');
}catch(e){fail++;console.error(e.stack);}
console.log('v9 owner injection: '+pass+' / 失败 '+fail);process.exitCode=fail?1:0;
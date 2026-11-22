'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(require('path').join(__dirname,'../engines/periodicals.js'),'utf8');
let pass=0;
function rig() {
 let chat='test-chat',calls=0,reply=async()=>'<script>alert(1)</script>刊物';
 const state={clock:{iso:'2024-03-01'},periodicals:{defs:[],issues:[]}};
 let epoch=0,seq=0;const tickets=new Map();
 const WA={store:{get:()=>state,chatId:()=>chat,claimAsync:(site,opt)=>{const ticket=String(++seq);tickets.set(ticket,{chat,epoch,dep:opt.dep(),fn:opt.dep});return {ok:true,ticket};},settleAsync:t=>{const c=tickets.get(t);tickets.delete(t);return {ok:!!c && c.chat===chat && c.epoch===epoch && c.dep===c.fn()};},dropAsync:t=>tickets.delete(t),transact:fn=>{const d=JSON.parse(JSON.stringify(state));if(fn(d)===false)return {ok:false};Object.assign(state,d);return {ok:true};}},clock:{now:()=>123},evict:{array:a=>{if(a.length>48)a.splice(0,a.length-48);}},apiRouter:{call:async(...args)=>{calls++;return reply(...args);}},log:()=>{}};
 vm.runInNewContext(src,{window:{WorldAxis:WA},Date,Set,JSON});
 return {WA,state,setChat:x=>{chat=x;epoch++;},setReply:x=>reply=x,calls:()=>calls};
}
function check(name,x){assert.ok(x,name);pass++;}
(async()=>{
 let r=rig(),p=r.WA.periodicals;
 check('invalid-id',!p.configure({id:'__proto__.bad',days:[1],name:'x'}).ok);
 check('invalid-days',!p.configure({id:'x',days:[0,32],name:'x'}).ok);
 p.configure({id:'x',days:[1],name:'<日报>'});await p.checkAndPublish();check('default-off',r.calls()===0);
 p.configure({id:'x',days:[1],name:'<日报>',enabled:true});
 const result=await p.checkAndPublish();check('publishes',result.published===1);
 check('noncanonical',r.state.periodicals.issues[0].canon===false);
 check('html-escaped',!p.render().includes('<script>') && p.render().includes('&lt;script&gt;'));
 await p.checkAndPublish();check('dedup',r.calls()===1);
 r=rig();p=r.WA.periodicals;p.configure({id:'x',days:[31],name:'x',enabled:true});
 await p.checkAndPublish();check('short-month-skips',r.state.periodicals.issues[0].date==='2024-01-31');
 r=rig();p=r.WA.periodicals;p.configure({id:'x',days:[1],name:'x',enabled:true});
 let resolve;r.setReply(()=>new Promise(x=>resolve=x));const first=p.checkAndPublish();await p.checkAndPublish();check('inflight-dedup',r.calls()===1);r.setChat('other');resolve('text');await first;check('chat-switch-discard',r.state.periodicals.issues.length===0);
 r=rig();p=r.WA.periodicals;p.configure({id:'x',days:[1],name:'x',enabled:true});r.setReply(async()=>{throw Error('fail');});await p.checkAndPublish();check('failure-no-write',r.state.periodicals.issues.length===0);r.setReply(async()=>'retry');await p.checkAndPublish();check('retry-after-failure',r.state.periodicals.issues.length===1);
 r=rig();p=r.WA.periodicals;r.state.clock.iso='2024-02-30';p.configure({id:'x',days:[1],name:'x',enabled:true});check('invalid-clock',!(await p.checkAndPublish()).ok && r.calls()===0);
 for(let i=0;i<8;i++)p.configure({id:'n'+i,days:[1],name:'x'});check('definition-cap',!p.configure({id:'overflow',days:[1],name:'x'}).ok);
 r=rig();p=r.WA.periodicals;p.configure({id:'x',days:[1],name:'x',enabled:true});
 r.state.worldFacts=[{scope:'public',storyDate:'2024-02-29',value:'PUBLIC'},{scope:'personal',storyDate:'2024-02-29',value:'SECRET'},{scope:'public',storyDate:'2024-03-02',value:'FUTURE'},{scope:'public',value:'UNDATED'}];
 let payload;r.setReply(async(c,m)=>{payload=JSON.stringify(m);return 'ok';});await p.checkAndPublish();check('public-material',payload.includes('PUBLIC') && !payload.includes('SECRET') && !payload.includes('FUTURE') && !payload.includes('UNDATED'));
 r=rig();p=r.WA.periodicals;p.configure({id:'x',days:[1],name:'x',enabled:true});r.setReply(()=>new Promise(x=>resolve=x));const returning=p.checkAndPublish();r.setChat('other');r.setChat('test-chat');resolve('late');await returning;check('returning-chat-epoch',r.state.periodicals.issues.length===0);
 console.log('periodicals-v2303: pass='+pass+' fail=0');
})().catch(e=>{console.error(e);process.exitCode=1;});

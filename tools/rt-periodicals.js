'use strict';
// Real host UI + real async ownership tickets; controlled store/API ports.
// Does not claim real chat persistence or provider generation.
const {chromium}=require('/home/user/pwlib/node_modules/playwright-core');
(async()=>{
 const b=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',args:['--no-sandbox']});
 try {
  const p=await b.newPage();await p.goto(process.env.ST_BASE || 'http://127.0.0.1:8000');
  await p.waitForFunction(()=>window.WorldAxis && WorldAxis.periodicals && WorldAxis.ui,null,{timeout:60000});
  const results=await p.evaluate(async()=>{
   const W=WorldAxis, original={get:W.store.get,chatId:W.store.chatId,transact:W.store.transact,call:W.apiRouter.call};
   const s={clock:{iso:'2024-03-01'},periodicals:{defs:[],issues:[]}};let calls=0;
   try {
    W.store.get=()=>s;W.store.chatId=()=> 'rt-periodicals';
    W.store.transact=fn=>{const d=structuredClone(s);if(fn(d)===false)return {ok:false};Object.assign(s,d);return {ok:true};};
    W.apiRouter.call=async()=>{calls++;return '<script>window.__periodicalXss=true</script>runtime issue';};
    const config=W.periodicals.configure({id:'rt',name:'Runtime',days:[1],enabled:true});
    const result=await W.periodicals.checkAndPublish();await W.periodicals.checkAndPublish();
    W.ui.goPage('health');W.ui.mount();W.ui.open();
    document.querySelector('#wa-periodical-read').click();
    const readClicked=document.querySelector('#wa-periodical-out').textContent.includes('runtime issue');
    document.querySelector('#wa-periodical-name').value='表单保存';
    document.querySelector('#wa-periodical-config').click();
    const saved=s.periodicals.defs.some(x=>x.name==='表单保存');
    return {readClicked,saved,config:config.ok,published:result.published,dedup:calls===1,renderSafe:!W.periodicals.render().includes('<script>'),entry:!!document.querySelector('#wa-periodical-read'),issues:s.periodicals.issues};
   } finally {W.store.get=original.get;W.store.chatId=original.chatId;W.store.transact=original.transact;W.apiRouter.call=original.call;}
  });
  if (!results.readClicked || !results.saved || !results.config || results.published!==1 || !results.dedup || !results.renderSafe || !results.entry) throw Error(JSON.stringify(results));
  console.log('rt-periodicals: 7/7 passed (controlled write/API ports; real host UI and ownership tickets)');
 } finally {await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
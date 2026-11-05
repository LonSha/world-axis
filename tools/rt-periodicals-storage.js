'use strict';
// Isolated synthetic host context, real WorldAxis store/transactions/localStorage.
// API response is controlled. This is not a native ST chat-file acceptance test.
const {chromium}=require('/home/user/pwlib/node_modules/playwright-core');
(async()=>{
 const b=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',args:['--no-sandbox']});
 try {
  const p=await b.newPage();p.setDefaultTimeout(20000);
  await p.goto('http://127.0.0.1:8000');
  await p.waitForFunction(()=>window.WorldAxis && WorldAxis.apiRouter && WorldAxis.periodicals,null,{timeout:60000});
  const out=await Promise.race([p.evaluate(async()=>{
   const W=WorldAxis, host=W.mainWin || window, old=host.SillyTavern.getContext, call=W.apiRouter.call;
   const id='wa-periodical-isolated-'+Date.now(),meta={file_name:id};
   const context={...old(),chatId:id,chatMetadata:meta,chat:[{is_user:false,mes:'isolated periodical test'}]};
   try {
    host.SillyTavern.getContext=()=>context;
    W.store.init();
    const setup=W.store.transact(d=>{d.clock.iso='2024-03-01';});
    if (!setup.ok) return {stage:'setup',ok:false,reason:setup.reason};
    const configured=W.periodicals.configure({id:'isolated',name:'隔离联调刊',days:[1],enabled:true});
    W.apiRouter.call=async()=> '真实存储链验收正文';
    const generated=await W.periodicals.checkAndPublish();
    W.store.init();
    const rows=W.store.get().periodicals.issues;
    return {ok:configured.ok && generated.published===1 && rows.length===1 && rows[0].text==='真实存储链验收正文',stage:'reload',count:rows.length};
   } finally {
    W.apiRouter.call=call;host.SillyTavern.getContext=old;
    for (const key of Object.keys(localStorage)) if (key.includes(id)) localStorage.removeItem(key);
   }
  }),new Promise((_,reject)=>setTimeout(()=>reject(Error('real store probe exceeded 25s')),25000))]);
  console.log(JSON.stringify(out));if (!out.ok) process.exitCode=1;
 } finally {await b.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

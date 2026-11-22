'use strict';
// Real Chromium page rendering evidence, no world writes.
const {chromium}=require('/home/user/pwlib/node_modules/playwright-core');
(async()=>{const b=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',args:['--no-sandbox']});try{
 const p=await b.newPage();await p.goto('http://127.0.0.1:8000');await p.waitForFunction(()=>window.WorldAxis && WorldAxis.ui && WorldAxis.apiRouter,null,{timeout:60000});
 const results=await p.evaluate(()=>{const W=WorldAxis;W.store.init();W.ui.goPage('health');W.ui.mount();const rows=[];for(const id of ['boot','health','drive','todo','inject','tools']){try{const r=W.ui.goPage(id);W.ui.open();const panel=document.querySelector('#wa-panel');rows.push({id,ok:r.ok && !!panel && panel.textContent.trim().length>0,chars:panel?panel.textContent.length:0});}catch(e){rows.push({id,ok:false,error:e.message});}}return rows;});
 console.log(JSON.stringify({scope:'real browser rendering only, not business interaction acceptance',results},null,2));if(results.some(x=>!x.ok))process.exitCode=1;
}finally{await b.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
'use strict';
const assert=require('assert');
const {chromium}=require('/home/user/pwlib/node_modules/playwright-core');
(async()=>{const b=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',args:['--no-sandbox']});try{
 const p=await b.newPage({viewport:{width:1280,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:8000');await p.waitForFunction(()=>window.WorldAxis&&WorldAxis.ui&&WorldAxis.periodicals);
 await p.keyboard.press("Escape");
 await p.evaluate(()=>{WorldAxis.store.init();WorldAxis.ui.mount();WorldAxis.ui.open();});
 const rows=[];const go=async id=>p.evaluate(id=>WorldAxis.ui.goPage(id),id);
 await go('boot');const btn=p.locator('[data-boot-sample]').first();assert(await btn.count(),'boot candidates');await btn.click({timeout:5000});await p.waitForFunction(()=>{const e=document.querySelector('#wa-boot-out');return e&&/拒收|installSample ok/.test(e.textContent);});rows.push({id:'boot',receipt:await p.locator('#wa-boot-out').innerText()});
 await go('health');assert((await p.locator('#wa-panel').innerText()).length>100);rows.push({id:'health',ok:true});
 await go('todo');assert((await p.locator('#wa-panel').innerText()).includes('读得到'));rows.push({id:'todo',ok:true});
 await go('drive');await p.locator('#wa-drive-view').click();assert((await p.locator('#wa-drive-out').innerText()).includes('累计轮次'));assert((await p.locator('#wa-panel').innerText()).includes('死面台账'));rows.push({id:'drive-ledger',ok:true});
 await go('inject');await p.locator('#wa-inj-face').click();assert((await p.locator('#wa-inj-out').innerText()).length>0);rows.push({id:'inject',ok:true});
 await p.setViewportSize({width:390,height:844});const layout=await p.locator('#wa-panel').evaluate(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};});assert(layout.left>=0&&layout.right<=391,'panel viewport');
 assert.equal(await p.locator('#wa-panel').count(),1);assert.equal(errors.length,0,errors.join('\n'));console.log(JSON.stringify({rows,layout,pageErrors:errors,scope:'real pointer controls; default no-chat boot receipt; no external model generation'}));
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

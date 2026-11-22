'use strict';
const fs=require('fs'),path=require('path');
const live=require('./ui-live'),{BASE,must1}=require('./v8-harness');
const PROBE=`(function(){
 const W=window.WorldAxis,p=document.getElementById('wa-panel');W.ui.open();
 Array.from(p.querySelectorAll('.wa-tab')).find(x=>x.dataset.page==='desk').click();
 W.karma.setSettings({enabled:true});document.getElementById('wa-wdesk-ns').value='karma';
 const before=W.ui.usageStat();document.getElementById('wa-wdesk-load').click();
 const b=Array.from(p.querySelectorAll('[data-wdcall]')).find(x=>x.dataset.wdcall==='karma|record');
 if(!b)return {ok:false,why:'call-button-not-in-DOM'};
 b.click();const values=['实点人物','debt','2','手工登记'];
 p.querySelectorAll('[data-wdarg]').forEach((x,i)=>{x.value=values[i]||'';});p.querySelector('[data-wdgo]').click();
 const receipt=W.writeDesk.stat().activity.karma,use=W.ui.usageStat();
 return {ok:!!(receipt&&receipt.written===1&&use.controls['wa-wdesk-load']>0),receipt,usage:use,usageBefore:before,
  output:document.getElementById('wa-wdesk-out').textContent,host:'stub-real-chromium'};
})()`;
async function runAll(assertFn){let pass=0,fail=0;const a=(v,m)=>{v?pass++:fail++;if(!v)console.error('FAIL '+m);if(assertFn)assertFn(!!v,m);};
 const r=await live.runLive({skipClick:true,probeSource:PROBE});a(r.tier==='full','actual Chromium channel available');
 a(r.probe&&r.probe.ok,'real browser desk click writes owner and root capture records control usage');
 a(!r.probeError&&r.pageErrors.length===0&&r.failedLoad.length===0,'targeted browser interaction has no hidden load/runtime exception');
 const rel='ui/panel.js',src=fs.readFileSync(path.join(BASE,rel),'utf8');
 const broken=must1(src,"const wdPortsOut = function (html) { const el = $('#wa-wdesk-ports'); if (el) el.innerHTML = html; };","const wdPortsOut = function (html) { const el = $('#wa-wdesk-ports'); if (el) el.textContent = html; };");
 const n=await live.runLive({skipClick:true,probeSource:PROBE,srcOverride:{[rel]:broken}});
 a(n.tier==='full'&&n.probe&&!n.probe.ok,'real browser same click predicate detects reverted product markup');
 console.log('v8 browser target: '+pass+' pass / '+fail+' fail');return {pass,fail,original:r,negative:n};
}
module.exports={runAll};if(require.main===module){runAll().then(r=>{fs.writeFileSync(path.join(require('os').tmpdir(),'v8-browser-report.json'),JSON.stringify(r,null,2));process.exit(r.fail?1:0);}).catch(e=>{console.error(e.stack);process.exit(1);});}
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const {load,must1,BASE}=require('./v8-harness');
const {discoverUIFiles}=require('./product-files');
function boot(overrides){
 const W=load(overrides);
 const uiDom=vm.runInContext('(function(){const module={exports:{}};'+fs.readFileSync(path.join(BASE,'tests/ui-dom.js'),'utf8')+';return module.exports;})()',W.__testContext);uiDom.install(W);
 for(const rel of discoverUIFiles(path.join(BASE,'ui')))vm.runInContext(overrides&&overrides[rel]!==undefined?overrides[rel]:fs.readFileSync(path.join(BASE,rel),'utf8'),W.__testContext,{filename:rel});
 W.ui.mount();W.ui.open();const dom=W.__uiDoc,panel=dom.getElementById('wa-panel');
 const tab=Array.from(panel.querySelectorAll('.wa-tab')).find(x=>x.dataset.page==='desk');
 if(!tab)throw Error('missing writedesk tab');tab.click();return {W,dom,panel};
}
function executeDesk(overrides){
 const {W,dom,panel}=boot(overrides);W.karma.setSettings({enabled:true});
 const sel=dom.getElementById('wa-wdesk-ns');sel.value='karma';dom.getElementById('wa-wdesk-load').click();
 const call=Array.from(panel.querySelectorAll('[data-wdcall]')).find(x=>x.dataset.wdcall==='karma|record');
 if(!call)return {ok:false,why:'button-not-in-tree'};call.click();
 const args=panel.querySelectorAll('[data-wdarg]');
 const values=['登记人','debt','2','显式借贷'];args.forEach((x,i)=>{x.value=values[i]||'';});
 const go=panel.querySelector('[data-wdgo]');if(!go)return {ok:false,why:'no-execute-button'};go.click();
 const receipt=W.writeDesk.stat().activity.karma;
 return {ok:!!(receipt&&receipt.calls===1&&receipt.written===1),receipt,text:dom.getElementById('wa-wdesk-out').textContent};
}
function runAll(assertFn){let pass=0,fail=0;const a=(v,m)=>{v?pass++:fail++;if(!v)console.error('FAIL '+m);if(assertFn)assertFn(!!v,m);};
 const r=executeDesk();a(r.ok,'real mini-DOM list -> parameter form -> execute -> owner success receipt');
 a(r.text&&r.text.includes('karma.record'),'receipt visible in the rendered output');
 const rel='ui/panel.js',src=fs.readFileSync(path.join(BASE,rel),'utf8');
 const bad=must1(src,"const wdPortsOut = function (html) { const el = $('#wa-wdesk-ports'); if (el) el.innerHTML = html; };","const wdPortsOut = function (html) { const el = $('#wa-wdesk-ports'); if (el) el.textContent = html; };");
 let green=false;try{green=executeDesk({[rel]:bad}).ok;}catch(e){green=false;}a(!green,'same real-click predicate detects product markup regression');
 const coverage=require('./ui-binding-coverage');const good=coverage.audit();a(good.ok&&good.percent===100,'all literal UI id references are registered in three-layer guard');
 const W=load(),groups=JSON.parse(JSON.stringify(W.toolDiag.UI_BINDINGS));
 // v2.382.0：剥离面也要遍历四层。此前只剥三层，`player` 层整层不在剥离范围内 ——
 //   本条负控制只剥了 wa-wdesk-load（在 ids），仍能过；但「player 层被漏遍历」这件事
 //   恰恰就是本轮三条假红的成因，负控制自己不该再用同一个漏法。
 for(const g of groups)for(const layer of ['ids','cond','dynamic','player'])g[layer]=(g[layer]||[]).filter(x=>x!=='wa-wdesk-load');
 const lost=coverage.audit({groups});a(!lost.ok&&lost.missing.some(x=>x.id==='wa-wdesk-load'),'reverse inventory detects removed actual guard registration');
 // v2.382.0：两侧豁免清单必须逐字同集。H2（tests/run.js 的 EXEMPT_H）与本门禁的
 //   SKELETON_IDS 是同一份语义的两处字面；本轮的红就是「H2 加了 wa-search-bar 豁免、
 //   本侧没加」长出来的。此处直接读 tests/run.js 的文本比对，不许再各写一份。
 const runSrc=fs.readFileSync(path.join(BASE,'tests/run.js'),'utf8');
 const ex=runSrc.match(/const EXEMPT_H = \[([\s\S]*?)\];/);
 const exIds=ex?[...ex[1].matchAll(/'([^']+)'/g)].map(x=>x[1]):null;
 a(exIds&&JSON.stringify(exIds)===JSON.stringify(coverage.SKELETON_IDS),'skeleton exemptions stay verbatim-identical across H2 and coverage');
 console.log('v8 desk UI/coverage: '+pass+' pass / '+fail+' fail');return {pass,fail};
}
module.exports={runAll,executeDesk};if(require.main===module){try{process.exit(runAll().fail?1:0);}catch(e){console.error(e.stack);process.exit(1);}}
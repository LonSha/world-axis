'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),{spawnSync}=require('child_process');
const BASE=path.resolve(__dirname,'..');
function child(args){const t=Date.now();const p=spawnSync(process.execPath,args,{cwd:BASE,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024});return {status:p.status,durationMs:Date.now()-t,stdout:p.stdout||'',stderr:p.stderr||'',error:p.error?String(p.error.message):null};}
function audit(){
 const rows=[];
 function add(name,files,run,interpret){const p=child(run);let detail={};try{detail=interpret?interpret(p):{};}catch(e){detail={ok:false,reason:String(e.message)};}
  const ok=p.status===0&&!p.error&&detail.ok!==false;
  rows.push({name,ok,status:ok?'current':'stale-or-failed',durationMs:p.durationMs,exit:p.status,error:p.error,
   files:files.map(rel=>({rel,exists:fs.existsSync(path.join(BASE,rel)),ageSeconds:fs.existsSync(path.join(BASE,rel))?Math.max(0,Math.floor((Date.now()-fs.statSync(path.join(BASE,rel)).mtimeMs)/1000)):null})),detail,output:p.stdout.slice(-5000),stderr:p.stderr.slice(-1000)});
 }
 add('module-registry',['tests/module-registry-ledger.json'],['tests/module-registry-gate.js']);
 add('module-cycle',['tests/module-cycle-gate-v2107.js'],['-e',"const r=require('./tests/module-cycle-gate').audit();console.log(JSON.stringify({ok:r.ok,files:r.files,edges:r.edgesAll,ledgerMissing:r.runtimeMissing,problems:r.problems}));process.exit(r.ok?0:1);"],p=>JSON.parse(p.stdout.trim()));
 add('sync-hardcoded',['tests/run.js','tests/dead-export-ledger.json','tests/reject-code-ledger.json','tests/evidence-ledger.json'],['-e',"const fs=require('fs'),r=require('./tests/readings');const c=r.coherence(fs.readFileSync('tests/run.js','utf8')),l=r.ledgerReport();console.log('LEDGER_RESULT='+JSON.stringify({ok:c.length===0&&l.problems.length===0,readingsDrift:c,ledgerDrift:l.problems}));process.exit(c.length||l.problems.length?1:0);"],p=>JSON.parse(p.stdout.slice(p.stdout.lastIndexOf('LEDGER_RESULT=')+14).trim()));
 add('export-contract',['tests/run.js'],['tests/export-contract.js'],p=>{
  const generated=fs.readFileSync(path.join(BASE,'tests/export_contract.txt'),'utf8').trim();
  const s=fs.readFileSync(path.join(BASE,'tests/run.js'),'utf8'),m=s.match(/^    const FROZEN2800 = (.+);$/m);
  if(!m)throw Error('missing frozen contract');const frozen=vm.runInNewContext(m[1]);return {ok:generated===frozen,chars:generated.length,frozenChars:frozen.length,drift:generated===frozen?0:1};
 });
 add('UI_BINDINGS',['engines/tool-diag.js','ui/panel.js'],['-e',"const r=require('./tests/ui-binding-coverage').audit();console.log('LEDGER_RESULT='+JSON.stringify(r));process.exit(r.ok?0:1);"],p=>JSON.parse(p.stdout.slice(p.stdout.lastIndexOf('LEDGER_RESULT=')+14).trim()));
 return {version:'2.294.0',ok:rows.every(x=>x.ok),checkedAt:new Date().toISOString(),stale:rows.filter(x=>!x.ok).map(x=>x.name),rows,note:'Age is time since file modification, not proof of freshness. current requires recomputed semantic parity. No auto-update and no main regression invoked.'};
}
module.exports={audit};if(require.main===module){const r=audit();if(process.argv.includes('--json'))console.log(JSON.stringify(r,null,2));else{for(const x of r.rows)console.log((x.ok?'PASS ':'FAIL ')+x.name+' '+x.durationMs+'ms '+JSON.stringify(x.detail));console.log('ledger-audit: '+(r.ok?'all current':'stale: '+r.stale.join(', ')));}process.exit(r.ok?0:1);}
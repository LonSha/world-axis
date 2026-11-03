'use strict';
const fs=require('fs'),path=require('path');
const {scenario}=require('./v8-long-session-2294');
const {BASE,must1}=require('./v8-harness');
// Reviewed floor, not overwritten by the running measurement. Growth is allowed.
// v2.295.0 (V9): collector collapse line simplified to a plain count ("其余折叠：N 条"),
// shrinking each round by ~13-15 chars vs the V8 floor — re-reviewed, not loosened blindly.
const BASELINE={version:'2.295.0',scenario:'seed+declared-facts+real-owner-dispatch',empty:8,seeded:15,
 rounds:[{round:1,yield:20,chars:2390},{round:5,yield:20,chars:2738},{round:25,yield:20,chars:3524},{round:50,yield:20,chars:3532}]};
function compare(r){return r.seedOK&&r.empty.nonempty>=BASELINE.empty&&r.seeded.nonempty>=BASELINE.seeded&&BASELINE.rounds.every(b=>{
 const x=r.curve[b.round];return x&&x.nonempty>=b.yield&&x.volume&&x.volume.chars>=b.chars&&x.volume.rows.some(v=>v.source==='结构汇流'&&v.chars>0&&v.items>0);
});}
function runAll(assertFn){let pass=0,fail=0;const a=(v,m)=>{v?pass++:fail++;if(!v)console.error('FAIL '+m);if(assertFn)assertFn(!!v,m);};
 const original=scenario();a(compare(original),'typical 1/5/25/50-round injection chars/items and yield never fall below reviewed floor');
 a(original.curve.every(x=>x.faults.length===0),'no builder fault hidden by aggregate baseline');
 const rel='render/inject.js',src=fs.readFileSync(path.join(BASE,rel),'utf8');
 const broken=must1(src,"if (vis.injectCollector && WA.injectCollector) {","if (false && vis.injectCollector && WA.injectCollector) {");
 let green=false;try{green=compare(scenario({[rel]:broken}));}catch(e){green=false;}
 a(!green,'real render source removal fails the same growth/volume predicate');
 console.log('v8 injection volume baseline: '+pass+' pass / '+fail+' fail');return {pass,fail};
}
module.exports={BASELINE,compare,runAll};if(require.main===module){try{process.exit(runAll().fail?1:0);}catch(e){console.error(e.stack);process.exit(1);}}
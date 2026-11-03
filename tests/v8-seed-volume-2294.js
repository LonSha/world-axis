'use strict';
const fs = require('fs'), path = require('path');
const {load,must1,BASE} = require('./v8-harness.js');
function runAll(assertFn) {
  let pass=0,fail=0;
  const a=(v,m)=>{v?pass++:fail++;if(!v)console.error('FAIL '+m);if(assertFn)assertFn(!!v,m);};
  function seedCheck(W) {
    W.capabilityTier.applyTier('full'); W.populate.setSettings({enabled:true});
    const r=W.populate.seed({people:8}); return {W,r,v:r.yieldVerification};
  }
  const {W,r,v}=seedCheck(load());
  a(r.ok && v && v.ok,'seed carries automatic verified yield');
  a(v.after.count > v.before.count && v.after.count >= 15,'empty world seed measurably increases yield');
  a(v.lost.length===0 && v.errors===0,'no lost owner and no silent builder exception');
  a(JSON.stringify(W.populate.view().yieldVerification)===JSON.stringify(v),'view uses same receipt');
  const noRegression=model=>{const x=seedCheck(model);return !!(x.v&&x.v.ok&&x.v.nondecreasing);};
  a(noRegression(load()),'seed positive predicate');
  const file='engines/populate.js',src=fs.readFileSync(path.join(BASE,file),'utf8');
  const mutant=must1(src,'nondecreasing: yieldAfter.count >= yieldBefore.count,','nondecreasing: yieldAfter.count < yieldBefore.count,');
  a(!noRegression(load({[file]:mutant})),'true source mutant fails same seed predicate');
  const items=[{source:'人物生活',content:'甲乙A🙂'},{source:'人物生活',content:'另一笔'},{source:'世界状态',content:'世界'}];
  const landed=[items[0],items[2]];
  const measured=W.injectBudget.volumeView(items,landed);
  a(measured.items===2 && measured.inputItems===3,'duplicate source item counts remain real');
  a(measured.chars===7 && measured.bytes===17,'Unicode UTF-8 bytes and JS character counts');
  const row=measured.rows.find(x=>x.source==='人物生活');
  a(row.inputItems===2 && row.items===1 && row.remain===null,'same-source aggregation and unknown cap');
  const over=W.injectBudget.volumeView(items,landed,{limits:{人物生活:0}});
  a(!over.ok && over.reason==='budget-exceeded' && over.witnesses[0].excess>0,'limit rejection includes exact witness');
  const lone=W.injectBudget.volumeView([{source:'x',content:String.fromCharCode(0xD800)}]);
  a(lone.bytes===3,'unpaired surrogate is measured without escaping exception');
  const volumeOK=model=>{const q=model.injectBudget.volumeView(items,landed);return q.chars===7&&q.items===2;};
  a(volumeOK(load()),'volume positive predicate');
  const vf='engines/inject-budget.js',vs=fs.readFileSync(path.join(BASE,vf),'utf8');
  a(!volumeOK(load({[vf]:must1(vs,'r.chars += text.length;','r.chars += 0;')})),'true measurement source mutation changes predicate');
  console.log('v8 seed/volume: '+pass+' pass / '+fail+' fail');return {pass,fail};
}
module.exports={runAll};if(require.main===module)process.exitCode=runAll().fail?1:0;
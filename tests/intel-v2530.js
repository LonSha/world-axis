#!/usr/bin/env node
// WorldAxis tests/intel-v2530.js -- v2.75.0 由裸脚本改造为可挂载专锁
//
// 它治什么：认知面：谁知道什么 / 置信多少 / 可以错
//
// 为什么改造：本文件自 v2.5x 交付起是「裸脚本 + 末尾 console.log('INTEL-V2530: pass')」形态，
//   既无 module.exports、也不在 run.js 的 spawn 清单、也不被内联 —— 于是**全量回归从未执行过它**。
//   而 v2.73.0 起测试引用面已覆盖全部 tests/*.js，它的引用却被计入账本归因：
//   「归因建立在不执行的文件上」。v2.75.0 把它接进回归，并由 tests/test-surface-gate.js 防同类再生。
//   断言实现逐字保留（只把 assert 从模块自持改为由 run.js 注入，使探针不可被写死）。
'use strict';

function runAll(a) {
  const assert = require('./lock-assert.js').from(a);
  const fs=require('fs'); const vm=require('vm'); const path=require('path');
  const src=fs.readFileSync(path.join(__dirname,'..','engines/intel.js'),'utf8');
  const store={worldFacts:[{id:'fact_fee',key:'fact_fee'}],currents:[],people:{},memory:{facts:[]},evolution:{events:[]}};
  const WA={settingsBus:{read(){return {enabled:false,maxLinks:4,maxItems:2};},normalize(r,v){return v;},saveOrThrow(r,v){this.read=()=>v;return {ok:true};}},store:{get(){return store;},transact(fn){fn(store);}}};
  // v2.84.0: 桩由 tests/synth-host.js 统一补齐核心模块（手写桩与引擎依赖面之间此前无门禁）
  require('./synth-host.js').hostStub(WA);
  global.window={WorldAxis:WA}; vm.runInNewContext(src,{window:global.window,Date,Number,String,Array,Object,isFinite}, {filename:'engines/intel.js'});
  const intel=WA.intel;
  assert.strictEqual(intel.buildBlock(),'','disabled empty');
  assert.strictEqual(intel.addLink({cause:'missing',effect:'debt'}).reason,'unknown-cause');
  const link=intel.addLink({cause:'fact_fee',effect:'debt'}); assert.strictEqual(link.ok,true);
  assert.strictEqual(intel.explain('debt').causes.join(','),'fact_fee');
  intel.setSettings({enabled:true});
  const rumor=intel.addIntel('\u963f\u5b81',{claim:'\u8def\u8d39\u88ab\u622a\u7559',source:'\u9152\u9986\u95f2\u8bdd',level:'rumor',about:'debt'});
  assert.strictEqual(rumor.ok,true); assert.strictEqual(store.people.p_\u963f\u5b81.knowledge.intel[0].status,'suspected');
  const record=intel.addIntel('\u963f\u5b81',{claim:'\u8d26\u518c\u8bb0\u6709\u622a\u7559',source:'\u94f6\u884c\u8d26\u518c',level:'record',about:'debt'});
  assert.strictEqual(record.ok,true); assert.strictEqual(store.people.p_\u963f\u5b81.knowledge.intel[1].status,'believed');
  assert.strictEqual(intel.visibleTo('\u522b\u4eba','debt').length,0);
  const block=intel.buildBlock();
  assert.ok(block.includes('fact_fee') && block.includes('\u6000\u7591') && block.includes('\u94f6\u884c\u8d26\u518c'));
}

module.exports = { runAll: require('./lock-assert.js').restoring(runAll) };

if (require.main === module) runAll(require('assert'));

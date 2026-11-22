#!/usr/bin/env node
// WorldAxis tests/life-v2520.js -- v2.75.0 由裸脚本改造为可挂载专锁
//
// 它治什么：人物生活：目标 / 承诺 / 日程 / 当场选择
//
// 为什么改造：本文件自 v2.5x 交付起是「裸脚本 + 末尾 console.log('LIFE-V2520: pass')」形态，
//   既无 module.exports、也不在 run.js 的 spawn 清单、也不被内联 —— 于是**全量回归从未执行过它**。
//   而 v2.73.0 起测试引用面已覆盖全部 tests/*.js，它的引用却被计入账本归因：
//   「归因建立在不执行的文件上」。v2.75.0 把它接进回归，并由 tests/test-surface-gate.js 防同类再生。
//   断言实现逐字保留（只把 assert 从模块自持改为由 run.js 注入，使探针不可被写死）。
'use strict';

function runAll(a) {
  const assert = require('./lock-assert.js').from(a);
  const fs=require('fs'); const vm=require('vm'); const path=require('path');
  const src=fs.readFileSync(path.join(__dirname,'..','engines/life.js'),'utf8');
  const store={people:{}};
  const WA={settingsBus:{read(){return {enabled:false,maxPeople:4,maxItems:2};},normalize(r,v){return v;},saveOrThrow(r,v){this.value=v; this.read=()=>v; return {ok:true};}},store:{get(){return store;},transact(fn){fn(store);}}};
  // v2.84.0: 同上——桩缺核心模块时该引擎从出生起就是残的
  require('./synth-host.js').hostStub(WA);
  global.window={WorldAxis:WA}; vm.runInNewContext(src,{window:global.window,Date,Number,String,Array,Object,isFinite,Math}, {filename:'engines/life.js'});
  const life=WA.life;
  assert.strictEqual(life.buildBlock(),'','disabled injection empty');
  assert.strictEqual(life.tick({now:1}).reason,'disabled');
  life.setSettings({enabled:true});
  const goal=life.addGoal('阿宁',{text:'离开家族',prerequisite:'路费',next:''});
  assert.strictEqual(goal.ok,true);
  store.people.p_阿宁.profile={relations:[{target:'玩家',trust:80,vigilance:10}]};
  assert.strictEqual(life.tick({now:2,with:'玩家'}).changed,1);
  assert.strictEqual(store.people.p_阿宁.life.lastDecision.action,'ask');
  store.people.p_阿宁.profile.relations[0].vigilance=90;
  life.tick({now:3,with:'玩家'});
  assert.strictEqual(store.people.p_阿宁.life.lastDecision.action,'hide');
  const first=life.addSchedule('阿宁',{activity:'值铺',start:10,end:12});
  const clash=life.addSchedule('阿宁',{activity:'赴约',start:11,end:13});
  assert.strictEqual(first.ok,true); assert.strictEqual(clash.reason,'time-conflict');
  const c=life.addCommitment('阿宁',{kind:'promise',target:'玩家',text:'三日后归还路费',due:5});
  assert.strictEqual(c.ok,true);
  life.tick({now:6,fulfilledIds:[c.id]});
  assert.strictEqual(store.people.p_阿宁.life.commitments[0].status,'kept');
  const block=life.buildBlock();
  assert.ok(block.includes('离开家族') && block.includes('当前选择=keep'));
}

module.exports = { runAll: require('./lock-assert.js').restoring(runAll) };

if (require.main === module) runAll(require('assert'));

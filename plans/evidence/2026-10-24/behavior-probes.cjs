'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
// Baseline observation probe, not a product pass/fail gate.
// Run from any cwd; optional argv[2] writes a fresh observation JSON.
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../../..');
require(ROOT + '/tests/mock.js');
const fresh = require(ROOT + '/tests/ui-gate-sync.js').fresh;
const report = [];
function env() { if (global.localStorage) global.localStorage.clear(); const W = fresh().WA; W.store.init(); return W; }
function probe(name, fn) { try { report.push({ name, status: 'observed', ...fn() }); } catch (e) { report.push({ name, status: 'probe-error', error: String(e.stack) }); process.exitCode = 1; } }
probe('repair-unknown-effect', () => {
  const W = env(); W.aftermath.setSettings({enabled:true});
  const r = W.aftermathImpact.commissionRepair('never-created-effect', {who:'甲'});
  assert.equal(r.ok, true); assert.equal(r.repaired, true); assert.equal(r.aftermathResult.ok, false);
  return {observed:r, interpretation:'外层报已修复，实际 owner 拒收；不是成功修复'};
});
probe('scene-observer-and-place', () => {
  const W = env();
  W.store.transact(d => { d.people={p_甲:{name:'甲',place:'home'},p_乙:{name:'乙',place:'remote'}}; d.region=d.region||{}; d.region.currentPlace='home'; d.chronicle=[{id:'distant-note',horizon:true,visibility:'public',title:'远地刚发生的停工',summary:'未给甲设置获知记录'}]; return true; }, 'planning:fixture');
  const scene=W.sceneNarrative.currentScene({who:'甲',place:'home'});
  const horizon=W.sceneNarrative.perceivedHorizon('甲');
  assert(scene.present.includes('乙')); assert(horizon.horizonEvents.some(e=>e.ref==='distant-note'));
  return {scene, horizon, interpretation:'场景人物未按传入地点过滤；远方公开条目未核对该观察者获知'};
});
probe('blueprint-ready-with-disabled-owner', () => {
  const W=env(); W.training.setSettings({enabled:false});
  const dep=W.playableBlueprint.checkDependencies('town-workshop');
  const defs=W.playableBlueprint.exportPlayDefs('town-workshop');
  assert.equal(dep.canStart,true); assert.equal(W.training.getSettings().enabled,false);
  return {dep,trainingEnabled:W.training.getSettings().enabled,exportKeys:Object.keys(defs),interpretation:'canStart 是对象存在性检查，不是样例已安装可玩'};
});
probe('labor-clock-is-separate', () => {
  const W=env(); W.laborSchedule.setSettings({enabled:true});
  W.store.transact(d=>{ d.clock={label:'第七日',dayIndex:7,source:'author'}; return true; },'planning:fixture');
  const before=W.playtime.story(); const r=W.laborSchedule.advanceDay(); const after=W.playtime.story();
  assert(r.ok); assert.equal(JSON.stringify(before),JSON.stringify(after));
  return {labor:r,storyBefore:before,storyAfter:after,interpretation:'推进预约日不推进剧情日；须制定统一结算语义'};
});
probe('method-accepts-missing-target-and-recharges', () => {
  const W=env(); W.training.setSettings({enabled:true}); W.gear.setSettings({enabled:true}); W.actionMethods.setSettings({enabled:true});
  W.store.transact(d=>{d.people={p_甲:{id:'p_甲',name:'甲',resources:{合金:10}}};d.evolution=d.evolution||{};d.evolution.entityMemory=d.evolution.entityMemory||{};d.evolution.entityMemory.ability=[{id:'ab_repair',name:'修理',mode:'stage',stageNames:['初学','入门','熟练']}];d.evolution.entityMemory.object=[{id:'obj_wrench',name:'扳手',kind:'工具'}];return true;},'planning:fixture');
  assert(W.training.declare('修理',{mode:'stage',stageNames:['初学','入门','熟练']}).ok);
  const tool=W.gear.make('扳手',{holder:'甲',durability:10}); assert(tool.ok);
  const opts={gearId:tool.id,target:'nonexistent-machine',opId:'same-intention'};
  const a=W.actionMethods.execute('task:repair','甲','novice_tool',opts);
  const b=W.actionMethods.execute('task:repair','甲','novice_tool',opts);
  assert(a.ok && b.ok); assert.equal(a.gearRemaining,8); assert.equal(b.gearRemaining,6);
  return {first:a,second:b,interpretation:'方法接口可无目标成立并重复扣工具；尚无目标兑现/操作身份语义，不代表已有幂等契约被违反'};
});
if (process.argv[2]) fs.writeFileSync(path.resolve(process.argv[2]), JSON.stringify(report,null,2)+'\n');
console.log('PLANNING_PROBES', JSON.stringify(report));

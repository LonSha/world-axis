'use strict';
// EXP-8: public behavior and real economy/production integration; no mocked recipe lookup.
const fs = require('fs');
const path = require('path');
const PR = 'engines/research.js', BASE = path.join(__dirname, '..');
function env(ov) {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = require('./ui-gate-sync.js').fresh({ srcOverride: ov || {} }).WA;
  W.store.init(); W.recipe.apply('scifi');
  W.economy.setSettings({ enabled: true }); W.production.setSettings({ enabled: true }); W.research.setSettings({ enabled: true });
  W.store.transact(function (d) {
    d.research = { projects: [], discoveries: [] }; d.production = { jobs: [], facilities: [] };
    ['甲','乙','丙','丁'].forEach(function (name) {
      d.people['p_' + name] = { id: 'p_' + name, name: name, resources: { '合金': 100, '元件': 100 }, knowledge: { privateNote: name } };
    });
    d.evolution.factions = [{ name: '研究组', roster: { '甲': {role:'成员'}, '丁': {role:'成员'} } }];
    return true;
  }, 'exp8:seed');
  return W;
}
function project(W, extra) {
  return W.research.open(Object.assign({ by:'甲', hypothesis:'组件工艺', result:'组件', phases:2, materials:{'合金':4} }, extra || {}));
}
function complete(W, p, who) {
  W.research.supply(p.id, who || '甲', '合金', 4); W.research.advance(p.id); return W.research.advance(p.id);
}
function firstPhase(W) {
  const p = project(W); W.research.supply(p.id, '甲', '合金', 4); W.research.advance(p.id);
  const v = W.research.view(p.id);
  return v.phase === 1 && v.status === 'experimenting' && v.reserve['合金'] === 2 && v.consumed['合金'] === 2;
}
function failedClue(W) {
  const p = project(W, {prerequisites:['校准记录']}); complete(W,p);
  const v = W.research.view(p.id);
  return v.status === 'failed' && v.clues.length > 0 && v.clues[0].missing[0] === '校准记录';
}
function withheld(W) {
  const p = project(W); complete(W,p);
  return !W.economy.craft('工坊','组件',{by:'乙'}).ok && !W.production.open({by:'乙',recipe:'组件'}).ok;
}
async function runAll(a, ov) {
  let W = env(ov);
  a(Object.keys(W.research).length === 16, 'API loaded');
  a(firstPhase(W), 'first phase consumes materials');
  W = env(ov); const p = project(W);
  a(!W.economy.craft('工坊','组件',{by:'甲'}).ok, 'craft unavailable before discovery');
  a(!W.production.open({by:'甲',recipe:'组件'}).ok, 'production unavailable before discovery');
  a(W.research.supply(p.id,'甲','合金',1).ok, 'supply accepts available material');
  a(W.store.get().people['p_甲'].resources['合金'] === 99, 'supply really transfers resources');
  a(W.research.advance(p.id).reason === 'short-input', 'first phase refuses shortage');
  a(W.research.view(p.id).phase === 0, 'shortage does not advance');
  W.research.supply(p.id,'甲','合金',1);
  a(W.research.advance(p.id).phase === 1, 'resupply progresses phase one');
  a(W.research.advance(p.id).reason === 'short-input', 'half total cannot finish project');
  W.research.supply(p.id,'甲','合金',2);
  a(W.research.advance(p.id).status === 'confirmed', 'second paid phase confirms');
  const done = W.research.view(p.id);
  a(done.consumed['合金'] === 4 && done.reserve['合金'] === 0, 'whole cost consumed exactly');
  a(W.research.advance(p.id).reason === 'project-finished', 'no repeated consumption');
  a(W.economy.craft('工坊','组件',{by:'甲'}).ok, 'real craft unlocks for inventor');
  a(W.production.open({by:'甲',recipe:'组件'}).ok, 'real production order unlocks');
  a(W.research.canUse('丁','组件').ok, 'faction roster grants same-organization knowledge');
  a(!W.research.canUse('乙','组件').ok, 'unrelated organization cannot use discovery');
  a(!W.economy.craft('工坊','组件',{by:'乙'}).ok, 'craft consumes research authorization');
  a(!W.production.open({by:'乙',recipe:'组件'}).ok, 'production consumes research authorization');
  W.research.disseminate(p.id,'transferred','乙');
  a(W.economy.craft('工坊','组件',{by:'乙'}).ok, 'recipient really manufactures');
  a(!W.research.canUse('甲','组件').ok, 'exclusive transfer removes inventor access');
  W.research.disseminate(p.id,'public');
  a(W.production.open({by:'丙',recipe:'组件'}).ok, 'public discovery enables other organizations');
  a(W.research.disseminate(p.id,'invalid').reason === 'bad-scope', 'invalid scope refused');
  a(W.research.abandon(p.id).reason === 'already-confirmed', 'cannot undo confirmed discovery');
  const p2 = project(W,{by:'乙'}); complete(W,p2,'乙'); W.research.disseminate(p.id,'secret');
  a(W.research.canUse('乙','组件').ok, 'independent discovery not shadowed by first one');
  W = env(ov); a(failedClue(W), 'normal API reaches failure with useful clue');
  const old = W.research.list()[0];
  a(W.research.view(old.id).reserve['合金'] === 0, 'failure does not refund consumed resources');
  const next = project(W,{fromClues:old.id,prerequisites:['校准记录']});
  a(next.inheritedClues === 1 && W.research.view(next.id).phase === 0, 'clues transfer without progress');
  W.research.supply(next.id,'甲','合金',4); W.research.advance(next.id,{evidence:['校准记录']});
  a(W.research.advance(next.id).status === 'confirmed', 'explicit evidence permits successful retry');
  a(W.research.canUse('甲','组件').ok, 'failure does not shadow later success');
  const snapshot = W.research.view(next.id); snapshot.clues[0].missing.push('not persisted');
  a(W.research.view(next.id).clues[0].missing.length === 1, 'view clues detached');
  a(W.store.save() === true, 'research state saved');
  W = require('./ui-gate-sync.js').fresh().WA;
  a(W.research.view(next.id).status === 'confirmed', 'module re-evaluation restores persisted project');
  a(W.research.canUse('甲','组件').ok, 'restored discovery controls access');
  W = env(ov); const fraction = project(W,{phases:3,materials:{'合金':1}});
  W.research.supply(fraction.id,'甲','合金',1);
  for(let i=0;i<3;i++) W.research.advance(fraction.id);
  const fv = W.research.view(fraction.id);
  a(fv.status === 'confirmed' && Math.abs(fv.reserve['合金']) < 1e-12 && fv.consumed['合金'] === 1, 'fractional phases conserve total');
  const ab = project(W,{result:'叙事方法',resultKind:'method',materials:{}}); W.research.abandon(ab.id);
  a(!W.research.canUse('甲','叙事方法').ok, 'abandon creates no discovery');
  a(W.research.open().reason === 'missing-fields', 'empty input handled');
  a(project(W,{by:'不存在'}).reason === 'unknown-researcher', 'unknown inventor refused');
  a(project(W,{result:'不存在'}).reason === 'unknown-recipe', 'unknown recipe refused');
  W.research.setSettings({enabled:false});
  a(project(W).reason === 'disabled', 'disabled module refuses writes');
  a(W.economy.craft('工坊','组件',{by:'乙'}).ok, 'disabled research preserves legacy craft');
}
const mutations = [
  ['phase-cost', 'const per = Math.max(0, target - spent);', 'const per = 0;', firstPhase],
  ['failure-clue', "            proj.clues.push({ kind: 'prerequisite-missing', detail: '前置条件未满足', missing: proj.prerequisites.filter(function (p) { return proj.evidence.indexOf(p) < 0; }), phase: proj.phase, at: clockNow('research') });", '            /* removed */', failedClue],
  ['research-access', 'if (!access.ok) return access;', '/* removed */', withheld, 'engines/economy.js']
];
async function runNegative(a) {
  for(const [name, anchor, replacement, criterion, rel0] of mutations) {
    const rel=rel0 || PR, source=fs.readFileSync(path.join(BASE,rel),'utf8');
    a(criterion(env()),name + ': same criterion passes original');
    if(source.split(anchor).length !== 2) throw new Error(name + ': nonunique mutation anchor');
    const ov={}; ov[rel]=source.replace(anchor,replacement);
    a(!criterion(env(ov)),name + ': mutated module fails same criterion');
    a(fs.readFileSync(path.join(BASE,rel),'utf8') === source,name + ': source unchanged');
  }
}
module.exports={runAll,runNegative};
if(require.main===module) (async function(){
  let pass=0,fail=0; const a=(ok,name)=>{if(ok)pass++;else{fail++;console.log('FAIL '+name);}};
  try{await runAll(a);await runNegative(a);}catch(e){fail++;console.log(e.stack);}
  console.log('EXP8-V2231: '+pass+' / 失败 '+fail); process.exitCode=fail?1:0;
})();
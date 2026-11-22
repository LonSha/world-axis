'use strict';
// V7 决定性探针 B：引擎联动链（plan.expand -> agency.schedule）+ 正确枚举值探测
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);
require(path.join(BASE, 'tests/mock.js'));
const g = global;
const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const m = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
const LOAD = vm.runInNewContext('[' + m[1] + ']');
const ctx = vm.createContext(g);
for (const rel of LOAD) {
  const p = path.join(BASE, rel);
  if (!fs.existsSync(p)) continue;
  try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: rel }); } catch (e) {}
}
const WA = g.WorldAxis;
WA.store.init();
WA.capabilityTier.applyTier('full');
const ins = WA.playableBlueprint.installSample('town-workshop', { force: true });
const P0 = '大师傅', P1 = '青年学徒';

// 开全部相关引擎
const ALL = ['life','events','intel','threads','org','sediment','plan','agency','bonds','masks','temperament','shadow','fondness','rivalry','karma','chrono','gauge','quota','spotlight','beastBond','appearance','lingqi','canon','stall','contest','survey','floorSnapshot','probe','diplomacy','aftermath','inst','moodGlide','tempo','difficulty','sceneSlice','parallelEvents','genGate','beatMask','oneShotMod','economy','temporalLock','ladder','enigma','warrant','rumor','affect','causal','weather','freight','investigation','operations','activity','research','family','retrieval'];
for (const ns of ALL) { try { if (WA[ns] && WA[ns].setSettings) WA[ns].setSettings({ enabled: true }); } catch (e) {} }

function t(label, fn) {
  try { const r = fn(); console.log('OK    ' + label + ' => ' + JSON.stringify(r).slice(0, 160)); return r; }
  catch (e) { console.log('THROW ' + label + ' => ' + String(e.message).slice(0, 120)); return null; }
}

console.log('=== 枚举面探测 ===');
t('org.RESOURCES?', function () { return WA.org.RESOURCES || WA.org.KINDS || Object.keys(WA.org); });
t('events.KINDS', function () { return WA.events.KINDS; });
t('bonds.TYPES', function () { return WA.bonds.TYPES; });
t('sediment keys', function () { return Object.keys(WA.sediment); });
t('intel keys', function () { return Object.keys(WA.intel); });
t('masks keys', function () { return Object.keys(WA.masks); });
t('temperament keys', function () { return Object.keys(WA.temperament); });

console.log('\n=== 联动链：plan.expand -> agency.schedule ===');
t('life.addGoal', function () { return WA.life.addGoal(P0, { text: '把手艺学到家', motive: '出师', obstacle: '师傅藏私', next: '多守炉', prerequisite: '听话' }); });
let goodGoals = []; 
try { const s = WA.store.get(); const p = (s.people||{})[P0]; if (p && p.life && p.life.goals) goodGoals = p.life.goals.map(function(x){return x.id;}); } catch(e){}
console.log('  goals = ' + JSON.stringify(goodGoals));
t('plan.expand', function () { return WA.plan.expand ? WA.plan.expand(P0) : WA.plan.expandGoal ? WA.plan.expandGoal(P0) : Object.keys(WA.plan); });
t('plan.advance', function () { return WA.plan.advance(P0); });
t('agency.schedule', function () { return WA.agency.schedule(P0, 2); });

const beforeAll = {};
const keysAll = Object.keys(WA);
for (const k of keysAll) { const mm = WA[k]; if (mm && typeof mm === 'object' && typeof mm.buildBlock === 'function') { try { const b = mm.buildBlock(); const s = typeof b==='string'?b:JSON.stringify(b); beforeAll[k]=s.length; } catch(e){ beforeAll[k]=-1; } } }

console.log('\n=== 其余写口按真枚举重试 ===');
t('events.schedule(text)', function () { return WA.events.schedule({ text: '东市失火', kind: 'accident', at: 5, place: 'market', who: P0 }); });
t('intel.addIntel', function () { return WA.intel.addIntel(P0, { text: '夜里有人搬箱子', confidence: 0.6, source: P1 }); });
t('bonds.setBond(3参)', function () { return WA.bonds.setBond(P0, P1, { type: 'work', strength: 0.5, note: '师徒' }); });
t('masks.setMask(2参)', function () { return WA.masks.setMask(P0, { mask: 'calm', real: 'uneasy', why: '护短' }); });
t('temperament.set', function () { return WA.temperament.setTemperament(P0, { temper: 'stoic', why: '常年炉火' }); });
t('sediment.settle(key)', function () { return WA.sediment.settle('market', { key: 'fire', text: '东市失火', at: 5 }); });
t('org.grant(res)', function () { return WA.org.grant('credit', '工匠协会', { text: '学徒信任' }, 1); });

console.log('\n=== 最终非空 buildBlock 增长 ===');
const grew = [];
for (const k of keysAll) {
  const mm = WA[k];
  if (!mm || typeof mm !== 'object' || typeof mm.buildBlock !== 'function') continue;
  let n = -1;
  try { const b = mm.buildBlock(); const s = typeof b==='string'?b:JSON.stringify(b); n = s.length; } catch(e){ n = -1; }
  const pre = beforeAll[k];
  if (n > 0 && (pre === undefined || pre <= 0)) grew.push(k + '(' + n + ')');
}
console.log('新增非空 = ' + grew.length + ' : ' + grew.join(' '));
const allNE = [];
for (const k of keysAll) {
  const mm = WA[k];
  if (!mm || typeof mm !== 'object' || typeof mm.buildBlock !== 'function') continue;
  let n = -1;
  try { const b = mm.buildBlock(); const s = typeof b==='string'?b:JSON.stringify(b); n = s.length; } catch(e){ n = -1; }
  if (n > 0) allNE.push(k + '(' + n + ')');
}
console.log('总非空 = ' + allNE.length + ' : ' + allNE.join(' '));
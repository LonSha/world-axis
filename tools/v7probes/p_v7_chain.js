'use strict';
// V7 决定性探针：真实开局拿真实 id → 开引擎 → 按真签名喂写口 → 看 buildBlock 是否长出内容
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

function blen(ns) {
  const mod = WA[ns];
  if (!mod || typeof mod.buildBlock !== 'function') return -2;
  try {
    const b = mod.buildBlock();
    const s = typeof b === 'string' ? b : (b && typeof b === 'object' ? JSON.stringify(b) : String(b == null ? '' : b));
    return s.length;
  } catch (e) { return -1; }
}

// 0. store 必须先 init（否则开局装不进去，写口全部 missing-person）
try { WA.store.init(); } catch (e) { console.log('store.init ERR ' + e.message); }
try { WA.capabilityTier.applyTier('full'); } catch (e) { console.log('applyTier ERR ' + e.message); }

// 1. 真实开局
let seed = null;
try { seed = WA.playableBlueprint.installSample('town-workshop', { force: true }); } catch (e) { seed = { ok: false, err: e.message }; }
console.log('=== installSample: ' + JSON.stringify(seed).slice(0, 200) + ' ===');

// 2. 取真实人物 id 与地点 id
let people = [], places = [];
try {
  const st = WA.store.get() || {};
  function dig(obj, depth) {
    if (!obj || depth > 3) return;
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (v && typeof v === 'object') {
        if (v.name && (v.id || k)) people.push({ id: v.id || k, name: v.name });
        dig(v, depth + 1);
      }
    }
  }
  dig(st, 0);
} catch (e) {}
const uniqP = {};
for (const p of people) uniqP[p.name] = p.id;
const pNames = Object.keys(uniqP);
console.log('=== 载入人物 ' + pNames.length + ' : ' + pNames.slice(0, 10).join(',') + ' ===');

let placeList = [];
try {
  const pv = WA.world && WA.world.stat ? WA.world.stat() : null;
  console.log('=== world.stat: ' + JSON.stringify(pv).slice(0, 300) + ' ===');
} catch (e) {}

const P0 = pNames[0];
const P1 = pNames[1] || pNames[0];
console.log('=== 使用人物: ' + P0 + ' / ' + P1 + ' ===');

// 3. 开引擎
const ENABLE = ['life', 'events', 'intel', 'threads', 'org', 'sediment', 'plan', 'agency', 'bonds', 'masks', 'temperament', 'shadow', 'fondness', 'rivalry', 'karma', 'chrono', 'gauge', 'quota', 'spotlight', 'beastBond', 'appearance', 'lingqi', 'canon', 'stall', 'contest', 'survey', 'floorSnapshot', 'probe', 'diplomacy', 'aftermath', 'inst', 'moodGlide', 'tempo', 'difficulty', 'sceneSlice', 'parallelEvents', 'genGate', 'beatMask', 'oneShotMod', 'economy', 'temporalLock', 'ladder', 'enigma', 'warrant'];
const enabled = [];
for (const ns of ENABLE) {
  const mod = WA[ns];
  if (!mod) continue;
  let r = null;
  try {
    if (typeof mod.setSettings === 'function') r = mod.setSettings({ enabled: true });
    else if (typeof mod.settings === 'function') r = mod.settings({ enabled: true });
  } catch (e) { r = 'ERR ' + e.message; }
  enabled.push(ns + (r && r.ok === false ? '(fail)' : '(' + (WA[ns].getSettings && WA[ns].getSettings().enabled !== false ? 'on' : '??') + ')'));
}
console.log('=== 已开引擎 ' + enabled.length + ' ===');
console.log(' ' + enabled.join(' '));

const before = {};
for (const ns of ENABLE) before[ns] = blen(ns);

// 4. 按真签名喂
const log = [];
function t(label, fn) {
  try { const r = fn(); log.push('OK   ' + label + ' ' + JSON.stringify(r).slice(0, 100)); }
  catch (e) { log.push('THROW ' + label + ' ' + String(e.message).slice(0, 90)); }
}

t('life.addGoal', function () { return WA.life.addGoal(P0, { text: '凑齐母亲的药钱', motive: '亲情', obstacle: '没门路', next: '去东市问价', prerequisite: '本钱' }); });
t('life.addCommitment', function () { return WA.life.addCommitment(P0, { kind: 'promise', target: P1, text: '替铁匠守三日炉', due: 5 }); });
t('life.addSchedule', function () { return WA.life.addSchedule(P0, { activity: '守炉', location: '东市', start: 1, end: 3 }); });
t('events.schedule', function () { return WA.events.schedule({ text: '东市失火', at: 4, kind: 'disaster' }); });
t('intel.addIntel', function () { return WA.intel.addIntel(P0, { text: '夜里有人搬箱子', confidence: 0.6, source: '听说' }); });
t('plan.advance', function () { return WA.plan.advance(P0); });
t('agency.schedule', function () { return WA.agency.schedule(P0, 2); });
t('sediment.settle', function () { return WA.sediment.settle('market', { kind: 'fire', text: '东市失火' }); });
t('org.grant', function () { return WA.org.grant('favor', 'guild', { text: '学徒名额' }, 1); });
t('bonds.setBond', function () { return WA.bonds.setBond(P0, P1, { kind: 'trade', strength: 0.5 }); });
t('masks.setMask', function () { return WA.masks.setMask(P0, { face: 'calm', real: 'uneasy' }); });
t('temperament.setTemperament', function () { return WA.temperament.setTemperament(P0, { tone: 'stoic' }); });

console.log('\n=== 写口结果 ===');
for (const l of log) console.log(' ' + l);

const after = {};
const grew = [];
for (const ns of ENABLE) {
  after[ns] = blen(ns);
  if (after[ns] > 0 && before[ns] <= 0) grew.push(ns + '(' + after[ns] + ')');
}
console.log('\n=== 灌后 buildBlock 非空（新增）: ' + grew.length + ' ===');
console.log(' ' + grew.join(' '));
console.log('\n=== 逐项前后 ===');
for (const ns of ENABLE) if (after[ns] !== before[ns] || after[ns] > 0) console.log(' ' + ns + ' : ' + before[ns] + ' -> ' + after[ns]);

// 5. 注入面
try {
  const srcs = WA.inject && WA.inject.SOURCES ? WA.inject.SOURCES() : null;
  if (srcs && srcs.length) {
    let ne = 0;
    for (const s of srcs) {
      try { const b = s.build(); const str = typeof b === 'string' ? b : JSON.stringify(b); if (str && str.length > 4) ne++; } catch (e) {}
    }
    console.log('\n=== 注入源 ' + srcs.length + ' / 非空 ' + ne + ' ===');
  }
} catch (e) { console.log('inject SOURCES err ' + e.message); }
'use strict';
/**
 * tools/v7probes/p_seed_gap.js — OPV7-6 立据探针：开局装的是「人是谁、地方在哪」，
 * 没装「人在追什么、他们在图什么」。
 *
 * 它答四问（全部现场实测，不推断）：
 *   ① 装完蓝图后，结构化引擎（life/plan/bonds/org/events/intel）各自的容器是不是空的？
 *   ② 蓝图写的势力落在哪个键上？那个键有没有真消费者？
 *      （计划原文说「开局后 people 6 / places 12，life/plan/events/intel/bonds/org 全零」，
 *        本探针把「势力到底写进 world.factions 还是 evolution.factions」也一并量出来 ——
 *        写进没人读的键，在读数上跟「没写」长得一样。）
 *   ③ 三个引擎的开关状态：播种若不先把写口打开，会被各引擎回 `disabled` 而不是写进去。
 *   ④ 各写口的真实形状（life.addGoal / life.addSchedule / bonds.setBond / org.assignRole）
 *      今天能不能一次调通 —— 这里只立据，不改任何东西。
 *
 * 用法：node tools/v7probes/p_seed_gap.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.join(__dirname, '..', '..');
process.chdir(BASE);
require(path.join(BASE, 'tests/mock.js'));
const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const m = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
const LOAD = vm.runInNewContext('[' + m[1] + ']');

function loadAll() {
  const ctx = vm.createContext(global);
  for (const rel of LOAD) {
    const p = path.join(BASE, rel);
    if (!fs.existsSync(p)) continue;
    try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: rel }); } catch (e) {}
  }
  const WA = global.WorldAxis;
  try { WA.store.init(); } catch (e) {}
  return WA;
}

const WA = loadAll();
const out = [];
function P(k, v) { out.push(k + ' = ' + JSON.stringify(v)); }

try { WA.capabilityTier.applyTier('full'); } catch (e) { P('applyTier', 'threw:' + e.message); }

// ── ① 装蓝图前的基线 ───────────────────────────────────────────────
function counts(tag) {
  const d = WA.store.get() || {};
  const people = d.people || {};
  const ids = Object.keys(people);
  let goals = 0, sched = 0, cmts = 0;
  ids.forEach(function (id) {
    const L = people[id] && people[id].life;
    if (!L) return;
    goals += (L.goals || []).length;
    sched += (L.schedule || []).length;
    cmts += (L.commitments || []).length;
  });
  return {
    tag: tag,
    people: ids.length,
    places: ((d.world || {}).places || []).length,
    worldFactions: ((d.world || {}).factions || []).length,
    evoFactions: ((d.evolution || {}).factions || []).length,
    lifeGoals: goals, lifeSchedule: sched, lifeCommitments: cmts,
    plans: (((d.plan || {}).plans) || []).length,
    bondsRows: (((d.bonds || {}).rows) || []).length,
    eventRows: (((d.events || {}).rows) || []).length,
    intelQueue: ((d.intelQueue) || []).length,
    rostered: ((((d.evolution || {}).factions) || []).reduce(function (a, f) {
      return a + Object.keys((f && f.roster) || {}).length;
    }, 0))
  };
}

P('BEFORE', counts('before'));

// ── ② 装三份样例蓝图（安装后马上量）──────────────────────────────
['town-workshop', 'settlement-exploration', 'sci-fi-station'].forEach(function (id) {
  let r = null;
  try { r = WA.playableBlueprint.installSample(id, { force: true }); } catch (e) { r = { ok: false, err: e.message }; }
  P('install:' + id, r && { ok: r.ok, reason: r.reason || null });
});
P('AFTER_INSTALL', counts('after'));

// ── ③ 三个写口的开关面（播种会被它们挡在哪）────────────────────────
['life', 'bonds', 'org', 'events', 'plan', 'intel', 'agency'].forEach(function (k) {
  const eng = WA[k];
  if (!eng) return P('switch:' + k, 'engine-missing');
  let cfg = null;
  try { cfg = (typeof eng.getSettings === 'function') ? eng.getSettings() : null; } catch (e) { cfg = 'threw'; }
  P('switch:' + k, cfg && cfg.enabled === true ? 'on' : (cfg && cfg.enabled === false ? 'off' : 'no-enabled'));
});

// ── ④ 四个写口能不能一次调通（真调，看返回值）────────────────────
const d0 = WA.store.get() || {};
const everyone = Object.keys(d0.people || {}).map(function (id) { return (d0.people[id] || {}).name; }).filter(Boolean);
P('names', everyone.slice(0, 8));
const who = everyone[0];

function tryPort(tag, fn) {
  let r = null;
  try { r = fn(); } catch (e) { return P(tag, 'threw:' + e.message); }
  P(tag, r);
}
const CLOCK = (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('probe.seedgap') : Date.now();
if (who) {
  tryPort('port:life.addGoal', function () { return WA.life.addGoal(who, { text: '把作坊的学徒带出来' }); });
  tryPort('port:life.addSchedule', function () {
    return WA.life.addSchedule(who, { activity: '在作坊开工', location: '', start: CLOCK, end: CLOCK + 3600000 });
  });
  if (everyone[1]) tryPort('port:bonds.setBond', function () { return WA.bonds.setBond(who, everyone[1], ['利益同盟']); });
  const fac = ((((d0.evolution || {}).factions) || [])[0] || {}).name;
  P('firstEvoFaction', fac || null);
  if (fac) tryPort('port:org.assignRole', function () { return WA.org.assignRole(fac, who, 'novice'); });
  else P('port:org.assignRole', 'skipped:no-evolution-faction');
}
P('AFTER_PORTS', counts('after-ports'));

console.log(out.join('\n'));

// ── 判据：立据探针不做断言，只报读数（避免把「现状就是缺口」写成红点）──

'use strict';
// EXP-10 / OP-1: 场景行动桌 —— 只读聚合 + 路由执行。真 owner 写口，无 mock。
const fs = require('fs');
const path = require('path');
const PR = 'engines/action-desk.js', BASE = path.join(__dirname, '..');
function env(ov) {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = require('./ui-gate-sync.js').fresh({ srcOverride: ov || {} }).WA;
  W.store.init(); W.recipe.apply('scifi');
  W.economy.setSettings({ enabled: true });
  W.production.setSettings({ enabled: true });
  W.research.setSettings({ enabled: true });
  W.family.setSettings({ enabled: true });
  W.training.setSettings({ enabled: true });
  W.gear.setSettings({ enabled: true });
  W.actionDesk.setSettings({ enabled: true });
  W.store.transact(function (d) {
    d.research = { projects: [], discoveries: [] };
    d.family = { units: [] };
    d.production = { jobs: [], facilities: [] };
    ['甲', '乙', '丙'].forEach(function (name) {
      d.people['p_' + name] = { id: 'p_' + name, name: name, resources: { '合金': 100, '元件': 100 } };
    });
    d.evolution.factions = [{ name: '研究组', roster: { '甲': { role: '成员' }, '丙': { role: '成员' } } }];
    return true;
  }, 'exp10:seed');
  return W;
}
/** 一个「有立项但缺料」的现场：行动桌应把它摆成 prepare，并列出所缺。 */
function shortScene(W) {
  const p = W.research.open({ by: '甲', hypothesis: '组件工艺', result: '组件', phases: 2, materials: { '合金': 4 } });
  W.research.supply(p.id, '甲', '合金', 1);
  return { W: W, id: p.id };
}
function groupOf(b, kind) {
  return (b.groups || []).filter(function (g) { return g.kind === kind; })[0] || null;
}
function rowOf(b, prefix) {
  return (b.rows || []).filter(function (r) { return String(r.id).indexOf(prefix) === 0; })[0] || null;
}
/** 判据①：缺料被摆成 prepare 且真的列出所缺（不是「不可用」三个字）。 */
function shortageShown(W) {
  const s = shortScene(W);
  const b = W.actionDesk.board({ person: '甲' });
  if (!b.ok) return false;
  const r = rowOf(b, 'research.supply:');
  return !!(r && r.state === 'prepare' && r.need && r.need.length === 1
    && r.need[0].material === '合金' && r.need[0].have === 1);
}
/** 判据②：行动桌是只读的 —— 前后存档逐字不变。 */
function readOnly(W) {
  const s = shortScene(W);
  const before = JSON.stringify(W.store.get());
  W.actionDesk.board({ person: '甲' });
  W.actionDesk.board({ person: '甲', place: '工坊' });
  return JSON.stringify(W.store.get()) === before;
}
/** 判据③：路由真执行 —— 供料真的动了资源面与池。 */
function routeSupplies(W) {
  const s = shortScene(W);
  const r = W.actionDesk.plan('research.supply:' + s.id, { who: '甲', material: '合金', amount: 3 });
  if (!r.ok) return false;
  const v = W.research.view(s.id);
  return v.reserve['合金'] === 4 && W.store.get().people['p_甲'].resources['合金'] === 96;
}
/** 判据④：未知前缀一律拒收，不猜一个 owner 去写。 */
function unknownRefused(W) {
  const r = W.actionDesk.plan('world.setEverything', {});
  return r.ok === false && r.reason === 'unknown-action';
}
/** 判据⑤：owner 关闭时该组不出现残影，且不阻断其它组。 */
function noResidue(W) {
  shortScene(W);
  W.research.setSettings({ enabled: false });
  const b = W.actionDesk.board({ person: '甲' });
  if (!b.ok) return false;
  const g = groupOf(b, 'research');
  const rests = (b.rows || []).filter(function (r) { return r.kind === 'research'; });
  return !!(g && g.on === false && g.rows.length === 0 && rests.length === 0
    && groupOf(b, 'family') && groupOf(b, 'family').on === true);
}
/** 判据⑥：照护交接经行动桌真的换了负责人。 */
function careTransfer(W) {
  const u = W.family.createUnit({ name: '同住', by: '甲' });
  W.family.addMember(u.id, '乙', '成员');
  W.family.assignCare(u.id, '甲', '乙', '日常');
  const b = W.actionDesk.board({ person: '甲' });
  const r = rowOf(b, 'family.transferCare:');
  if (!r) return false;
  const out = W.actionDesk.plan('family.transferCare:' + u.id + ':' + '乙', { who: '甲', unitId: u.id, ward: '乙', reason: '远行' });
  if (!out.ok) return false;
  const v = W.family.view(u.id);
  const active = (v.care || []).filter(function (c) { return c.active; })[0];
  return !!(active && active.caregiver === '甲' && r.state === 'ready');
}

async function runAll(a, ov) {
  let W = env(ov);
  a(Object.keys(W.actionDesk).length === 10, 'API loaded');
  a(W.actionDesk.getSettings().enabled === true, 'settings roundtrip');
  a(!W.actionDesk.board({}).ok, 'missing person refused');
  a(W.actionDesk.board({ person: '不存在' }).reason === 'unknown-person', 'unknown person refused (no person created)');
  a(!W.store.get().people['p_不存在'], 'refusal did not fabricate a person');

  W = env(ov); a(shortageShown(W), 'shortage shown as prepare with real need list');
  W = env(ov); a(readOnly(W), 'board writes nothing (store byte-identical)');
  W = env(ov); a(routeSupplies(W), 'route really moves resources through owner');
  W = env(ov); a(unknownRefused(W), 'unknown action prefix refused');
  W = env(ov); a(noResidue(W), 'disabled owner leaves no residue and blocks nothing');
  W = env(ov); a(careTransfer(W), 'care transfer through desk changes caregiver');

  // 完整玩家路径：缺料→供料→推进→成果→制造授权（全程只经行动桌与 owner 读口）
  W = env(ov);
  const p = W.research.open({ by: '甲', hypothesis: '组件工艺', result: '组件', phases: 2, materials: { '合金': 4 } });
  a(W.actionDesk.plan('research.supply:' + p.id, { who: '甲', material: '合金', amount: 4 }).ok, 'desk supplies full amount');
  let b = W.actionDesk.board({ person: '甲' });
  a(!!rowOf(b, 'research.advance:'), 'phase becomes advanceable after supply');
  a(W.actionDesk.plan('research.advance:' + p.id, {}).ok, 'desk advances phase one');
  a(W.actionDesk.plan('research.advance:' + p.id, {}).status === 'confirmed', 'desk confirms discovery');
  a(W.research.canUse('甲', '组件').ok, 'discovery controls access');
  a(W.actionDesk.plan('production.open', { who: '甲', recipe: '组件', qty: 1, days: 1 }).ok, 'desk opens real production order');

  // 源在场性如实报（缺席不当空）
  const src = W.actionDesk.sources();
  a(src.length === 6 && src.every(function (s) { return typeof s.ok === 'boolean'; }), 'sources report availability');
  // 关闭总闸后不写、不聚合
  W.actionDesk.setSettings({ enabled: false });
  a(W.actionDesk.board({ person: '甲' }).reason === 'disabled', 'disabled desk refuses');
  a(W.actionDesk.plan('research.supply:x', {}).reason === 'disabled', 'disabled desk refuses plan');
}

const mutations = [
  ['shortage-hidden', 'if (have < per) short.push({ material: k, need: per, have: have });',
    'if (false) short.push({ material: k, need: per, have: have });', shortageShown],
  ['board-writes', 'const place = clean(o.place, 40);',
    'const place = clean(o.place, 40); if (WA.store && WA.store.transact && who !== "__never__") { WA.store.transact(function (d) { d.__deskProbe = (d.__deskProbe || 0) + 1; return true; }, "desk:probe"); }', readOnly],
  ['route-swapped', "'research.supply': function (o) { return WA.research.supply(o.projectId, o.who, o.material, o.amount); },",
    "'research.supply': function (o) { return WA.research.supply(o.projectId, o.who, o.amount, o.material); },", routeSupplies],
  ['guard-removed', "if (!fn) { noteFault('unknown-action'); return { ok: false, reason: 'unknown-action', action: key, known: Object.keys(ROUTES) }; }",
    'if (false) { noteFault(\'unknown-action\'); return { ok: false, reason: \'unknown-action\', action: key, known: Object.keys(ROUTES) }; }', unknownRefused],
  ['residue-leak', 'out.on = !!(cfg && cfg.enabled);', 'out.on = true;', noResidue]
];
async function runNegative(a) {
  for (const [name, anchor, replacement, criterion] of mutations) {
    const source = fs.readFileSync(path.join(BASE, PR), 'utf8');
    a(criterion(env()), name + ': same criterion passes original');
    if (source.split(anchor).length !== 2) throw new Error(name + ': nonunique mutation anchor');
    const ov = {}; ov[PR] = source.replace(anchor, replacement);
    a(!criterion(env(ov)), name + ': mutated module fails same criterion');
    a(fs.readFileSync(path.join(BASE, PR), 'utf8') === source, name + ': source unchanged');
  }
}
module.exports = { runAll, runNegative };
if (require.main === module) (async function () {
  let pass = 0, fail = 0; const a = (ok, name) => { if (ok) pass++; else { fail++; console.log('FAIL ' + name); } };
  try { await runAll(a); await runNegative(a); } catch (e) { fail++; console.log(e.stack); }
  console.log('EXP10-OPT1: ' + pass + ' / 失败 ' + fail); process.exitCode = fail ? 1 : 0;
})();
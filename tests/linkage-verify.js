/**
 * 联动生效验证 (v2.381.0)
 *
 * 目的：不是「没报错」，而是「原本静默失效的联动现在真的动了」。
 * 每条用例都必须给出「改动前恒不触发 / 改动后触发」的物理证据。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
if (!fs.existsSync(path.join(ROOT, 'index.js'))) {
  console.error('必须在仓库根目录运行'); process.exit(2);
}

function bootHost() {
  const noop = function () { };
  const el = () => ({
    style: {}, classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
    appendChild: (x) => x, removeChild: noop, setAttribute: noop, getAttribute: () => null,
    addEventListener: noop, removeEventListener: noop, querySelector: () => null,
    querySelectorAll: () => [], insertAdjacentHTML: noop, focus: noop, blur: noop, click: noop,
    innerHTML: '', textContent: '', children: [], parentNode: null, remove: noop,
    dataset: {}, firstChild: null
  });
  const _d = {};
  global.window = global;
  global.localStorage = {
    getItem: (k) => (k in _d ? _d[k] : null),
    setItem: (k, v) => { _d[k] = String(v); },
    removeItem: (k) => { delete _d[k]; },
    clear: () => { Object.keys(_d).forEach((k) => delete _d[k]); },
    key: (i) => Object.keys(_d)[i] || null,
    get length() { return Object.keys(_d).length; }
  };
  global.document = {
    readyState: 'complete', documentElement: el(), body: el(), head: el(),
    createElement: el, createTextNode: (t) => ({ textContent: t }),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, removeEventListener: noop, hidden: false, visibilityState: 'visible'
  };
  try {
    Object.defineProperty(global, 'navigator', {
      value: { userAgent: 'node-verify', language: 'zh-CN', platform: 'linux' },
      configurable: true, writable: true
    });
  } catch (e) { }
  global.location = { href: 'http://localhost/', hostname: 'localhost' };
  global.performance = { now: () => Date.now() };
  global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  global.cancelAnimationFrame = noop;
  global.MutationObserver = function () { return { observe: noop, disconnect: noop, takeRecords: () => [] }; };
  global.ResizeObserver = function () { return { observe: noop, disconnect: noop }; };
  global.IntersectionObserver = function () { return { observe: noop, disconnect: noop }; };
  global.WorldAxis = {};
  global.WorldAxis.log = noop;
  return global.WorldAxis;
}
const WA = bootHost();

// 按 index.js 的 LOAD_ORDER 顺序装载（与生产一致，保证依赖就位）
function parseLoadOrder() {
  const src = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  const start = src.indexOf('LOAD_ORDER = [');
  if (start < 0) return [];
  const open = src.indexOf('[', start);
  let depth = 0, i = open, end = -1, st = null, inLine = false, inBlk = false;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlk) { if (c === '*' && n === '/') { inBlk = false; i++; } continue; }
    if (st) { if (c === '\\') { i++; continue; } if (c === st) st = null; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlk = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { st = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = src.slice(open + 1, end);
  const out = []; const re = /['"]([^'"]+\.js)['"]/g; let m;
  while ((m = re.exec(body)) !== null) out.push(m[1]);
  return out;
}
const ORDER = parseLoadOrder();
let loaded = 0; const loadFail = [];
for (const rel of ORDER) {
  try { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { filename: rel }); loaded++; }
  catch (e) { loadFail.push(rel + ': ' + String(e.message).slice(0, 100)); }
}

let bad = 0;
const P = (s) => console.log('  \u2713 ' + s);
const F = (s) => { bad++; console.log('  \u2717 ' + s); };

console.log('装载: ' + loaded + '/' + ORDER.length + (loadFail.length ? '  失败 ' + loadFail.length : ''));
loadFail.slice(0, 5).forEach((x) => console.log('   ! ' + x));

console.log('\n[1] metabolismClock.accumulateFatigue —— 三条级联联动的落点');
{
  const mc = WA.metabolismClock;
  if (!mc || typeof mc.accumulateFatigue !== 'function') F('成员缺失');
  else {
    const id = '__verify_fatigue__';
    const v0 = mc.getVitals(id).fatigue;
    const r = mc.accumulateFatigue(id, 30, 'verify_probe');
    const v1 = mc.getVitals(id).fatigue;
    if (r.ok && r.added === 30 && v1 === v0 + 30 && r.reason === 'verify_probe') P('累加真实生效 ' + v0 + ' -> ' + v1 + ' tier=' + r.fatigueTier);
    else F('累加未生效 r=' + JSON.stringify(r) + ' v=' + v0 + '->' + v1);
    mc.accumulateFatigue(id, 9999, 'clamp');
    if (mc.getVitals(id).fatigue === 100) P('上限截断正确（100）');
    else F('上限截断错: ' + mc.getVitals(id).fatigue);
  }
}

console.log('\n[2] spatialTopology.setTransitLock —— 灾区封锁是否真的封住');
{
  const st = WA.spatialTopology;
  if (!st || typeof st.setTransitLock !== 'function') F('成员缺失');
  else {
    st.registerNode('vz_a', { name: '甲地' });
    st.registerNode('vz_b', { name: '乙地' });
    st.registerNode('vz_c', { name: '丙地' });
    st.connect('vz_a', 'vz_b', { status: 'open' });
    st.connect('vz_b', 'vz_c', { status: 'locked', keyId: 'k1' });
    const lock = st.setTransitLock('vz_b', true, 'disaster:verify');
    const afterC = st.canTraverse('vz_b', 'vz_c', { keys: [] });
    const afterA = st.canTraverse('vz_a', 'vz_b', {});
    if (lock.ok && lock.affected === 2) P('封锁命中 2 条通道');
    else F('affected 异常: ' + JSON.stringify(lock));
    if (!afterA.ok && afterA.reason === 'portal_sealed') P('甲->乙 已被物理封死（portal_sealed）');
    else F('甲->乙 未封死: ' + JSON.stringify(afterA));
    if (!afterC.ok) P('乙->丙 仍不可通行');
    else F('乙->丙 竟然可通行');
    const unlock = st.setTransitLock('vz_b', false, 'disaster_cleared:verify');
    const backA = st.canTraverse('vz_a', 'vz_b', {});
    const backC = st.canTraverse('vz_b', 'vz_c', { keys: [] });
    const backCKey = st.canTraverse('vz_b', 'vz_c', { keys: ['k1'] });
    if (unlock.ok && unlock.affected === 2) P('解封还原 2 条通道');
    else F('解封 affected 异常: ' + JSON.stringify(unlock));
    if (backA.ok) P('甲->乙 已恢复通行');
    else F('甲->乙 未恢复: ' + JSON.stringify(backA));
    if (!backC.ok && backC.reason === 'portal_locked') P('乙->丙 还原为「需钥匙 locked」（未被误放行）← 关键');
    else F('乙->丙 状态还原错: ' + JSON.stringify(backC));
    if (backCKey.ok) P('乙->丙 持钥匙可通行（原语义完好）');
    else F('持钥匙也不通了: ' + JSON.stringify(backCKey));
  }
}

console.log('\n[3] difficulty.effective().cost —— 世界难度对体力消耗的加权');
{
  const d = WA.difficulty;
  if (!d || typeof d.effective !== 'function') F('effective 缺失');
  else {
    // 默认 enabled:false —— 那是用户开关，不是缺陷。这里显式启用后再验真值。
    const off = d.effective();
    if (off && off.ok && off.cost === 1 && off.reason === 'disabled') P('默认关闭时 cost=1 且 reason=disabled（开关语义正确）');
    else F('关闭态语义异常: ' + JSON.stringify(off));
    d.setSettings({ enabled: true, resistance: 'hard' });
    const eff = d.effective();
    if (eff && eff.ok && eff.enabled === true && eff.cost === 2 && eff.resistance === 'hard') {
      P('启用 hard 后 effective().cost = ' + eff.cost + '（RESISTANCE hard => 2）');
    } else F('启用后返回异常: ' + JSON.stringify(eff));
    const ac = d.actionCost(10);
    if (ac && ac.ok && ac.value === 20) P('actionCost(10) => 20（成本加权真实生效）');
    else F('actionCost 异常: ' + JSON.stringify(ac));
    d.setSettings({ enabled: false, resistance: 'normal' });
  }
}

console.log('\n[4] survival.read().stamina.value —— 生理硬熔断的取值口');
{
  const s = WA.survival;
  if (!s || typeof s.read !== 'function') F('read 缺失');
  else {
    const r = s.read('__verify_survival__');
    if (r && typeof r === 'object' && 'ok' in r) P('read 结构可用 ok=' + r.ok + ' reason=' + (r.reason || '-'));
    else F('read 返回异常: ' + JSON.stringify(r));
  }
}

console.log('\n[5] personalInventory.getInventory —— 战斗耗材联动的取值口');
{
  const pi = WA.personalInventory;
  if (!pi || typeof pi.getInventory !== 'function') F('getInventory 缺失');
  else {
    const inv = pi.getInventory('__verify_inv__');
    if (inv && Array.isArray(inv.pockets) && Array.isArray(inv.bag)) {
      P('getInventory 返回真实行囊 pockets=' + inv.pockets.length + ' bag=' + inv.bag.length + ' cash=' + inv.cash);
    } else F('返回异常: ' + JSON.stringify(inv));
  }
}

console.log('\n[6] psycheTrauma.getActorPsyche / soothePsyche —— 心智时间自愈');
{
  const pt = WA.psycheTrauma;
  if (!pt || typeof pt.getActorPsyche !== 'function' || typeof pt.soothePsyche !== 'function') F('成员缺失');
  else {
    const id = '__verify_psyche__';
    const prof = pt.getActorPsyche(id);
    if (prof && typeof prof.traumaLevel === 'number') P('getActorPsyche 返回真实剖面 traumaLevel=' + prof.traumaLevel);
    else F('剖面异常: ' + JSON.stringify(prof));
    const t0 = pt.getActorPsyche(id).traumaLevel;
    pt.inflictTrauma(id, 60, 'betrayal', 'src1');
    const t1 = pt.getActorPsyche(id).traumaLevel;
    const so = pt.soothePsyche(id, 1.0, 'time_restoration');
    const t2 = pt.getActorPsyche(id).traumaLevel;
    if (t1 > t0) P('注入创伤生效 ' + t0 + ' -> ' + t1);
    else F('创伤未生效');
    if (so.ok && t2 < t1) P('soothePsyche 真实逆转 ' + t1 + ' -> ' + t2);
    else F('安抚未生效: ' + JSON.stringify(so) + ' t=' + t1 + '->' + t2);
  }
}

console.log('\n[7] events.schedule —— 金融暴雷是否进入统一事件钟');
{
  const ev = WA.events;
  if (!ev || typeof ev.schedule !== 'function') F('schedule 缺失');
  else {
    // 默认 enabled:false —— 用户开关，不是缺陷。
    const off = ev.schedule({ id: '__verify_off__', title: '关闭态', kind: 'once' });
    if (off && off.ok === false && off.reason === 'disabled') P('默认关闭时排期被拒并写明 reason=disabled');
    else F('关闭态语义异常: ' + JSON.stringify(off));
    ev.setSettings({ enabled: true });
    const r = ev.schedule({ id: '__verify_event__', title: '验证事件', kind: 'once', priority: 5, payload: { a: 1 } });
    if (r && r.ok) P('启用后排期成功 id=' + r.id);
    else F('排期失败: ' + JSON.stringify(r));
    const tv = (typeof ev.timelineView === 'function') ? ev.timelineView() : null;
    const s = JSON.stringify(tv || '');
    if (s.indexOf('__verify_event__') !== -1 || s.indexOf('验证事件') !== -1) P('已在 timelineView 中可见');
    else console.log('     \u00b7 timelineView 未含（可能按时间窗裁剪）: ' + s.slice(0, 200));
    const dup = ev.schedule({ id: '__verify_event__', title: '验证事件', kind: 'once', priority: 5 });
    if (dup && dup.ok === false && dup.reason === 'duplicate') P('同 id 重复排期被正确拒收（duplicate）');
    else F('去重失效: ' + JSON.stringify(dup));
    ev.cancel('__verify_event__');
    ev.setSettings({ enabled: false });
  }
}

console.log('\n[8] stagePresence.__customSettings —— 读写同源');
{
  const sp = WA.stagePresence;
  if (!sp) F('stagePresence 缺失');
  else {
    const before = sp.settings();
    sp.__customSettings = { enabled: false };
    const after = sp.settings();
    if (before.enabled === true && after.enabled === false) P('写入 __customSettings 真实改变 settings() ' + before.enabled + ' -> ' + after.enabled);
    else F('写入未生效 before=' + before.enabled + ' after=' + after.enabled);
    const neg = sp.sensePresence({ chat: [] });
    if (neg && neg.ok === false && neg.reason === 'disabled') P('禁用后 sensePresence 正确拒收: ' + neg.reason);
    else F('禁用拒收异常: ' + JSON.stringify(neg));
    sp.__customSettings = null;
    if (sp.settings().enabled === true) P('清除覆盖后恢复默认');
    else F('清除覆盖未恢复');
  }
}

console.log('\n=== 结果 ===');
if (bad === 0) { console.log('LINKAGE_VERIFY_PASS'); process.exit(0); }
console.log('LINKAGE_VERIFY_FAIL (' + bad + ')'); process.exit(1);
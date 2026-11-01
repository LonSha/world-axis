// EXV7-2 验收探针：装载完整产品面，真写口造计划，验证人物意图看板端到端。
//   「先立据后动手」：本探针答「本次改动对不对」；专锁答「以后会不会退回去」。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..', '..');
process.chdir(BASE);
require(path.join(BASE, 'tests/mock.js'));
const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const m = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
const LOAD = vm.runInNewContext('[' + m[1] + ']');
const ctx = vm.createContext(global);
for (const rel of LOAD) {
  const p = path.join(BASE, rel);
  if (!fs.existsSync(p)) continue;
  try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: rel }); } catch (e) {}
}
const WA = global.WorldAxis;

let pass = 0, fail = 0;
function a(c, msg) { if (c) { pass++; console.log('  ok ' + msg); } else { fail++; console.log('  XX ' + msg); } }
function J(x) { return JSON.stringify(x); }

// A 导出面
{
  a(!!WA.intentBoard, 'A1: WA.intentBoard 在场');
  var api = ['getSettings','setSettings','board','buildBlock','view','stat','reset','_blockedText'];
  var miss = api.filter(function (k) { return typeof (WA.intentBoard || {})[k] !== 'function'; });
  a(miss.length === 0, 'A2: 导出面 8 口齐（缺 ' + J(miss) + '）');
  a(typeof WA.registerModule === 'function', 'A3: registerModule 在场（模块自注册链可用）');
}
// B 默认设置
{
  var cfg = WA.intentBoard.getSettings();
  a(cfg.enabled === true && cfg.maxRows === 8 && cfg.maxRest === 3,
    'B1: 默认设置 {enabled:true,maxRows:8,maxRest:3}（实 ' + J(cfg) + '）');
}
// C 纯函数（卡点两类不合并）
{
  var t1 = WA.intentBoard._blockedText([{ kind: 'need', detail: '银元×3' }]);
  a(t1.length === 1 && t1[0] === '缺 银元×3', 'C1: need 类译成人话（实 ' + J(t1) + '）');
  var t2 = WA.intentBoard._blockedText([{ kind: 'after', seq: 1, text: '攒够路费', waitingOn: 'running' }]);
  a(t2.length === 1 && t2[0].indexOf('正在做') > 0, 'C2: after 类带出等待方状态（实 ' + J(t2) + '）');
  var t3 = WA.intentBoard._blockedText([null, undefined, {}]);
  a(t3.length === 0, 'C3: 空与脏项不造文案（实 ' + J(t3) + '）');
  var t4 = WA.intentBoard._blockedText('not-array');
  a(t4.length === 0, 'C4: 非数组入参不抛、返回空（实 ' + J(t4) + '）');
}
// D plan 缺席：如实报（不是「没人有计划」）
{
  var keepP = WA.plan;
  try { delete WA.plan; } catch (e) {}
  var b0 = WA.intentBoard.board();
  a(b0.ok === false && b0.reason === 'no-plan-engine', 'D1: plan 缺席报 no-plan-engine（实 ' + J(b0.reason) + '）');
  a(typeof b0.note === 'string' && b0.note.indexOf('不是') > 0, 'D2: 缺席时 note 说清「不是没人有计划」（实 ' + J(b0.note) + '）');
  WA.plan = keepP;
}
// E 真写口造计划 → 看板出行
if (WA.store && typeof WA.store.init === 'function') { try { WA.store.init(); } catch (e) {} }
var STEPS = [{ kind: 'work', text: '去码头搬货' },
             { kind: 'work', text: '攒够路费', need: { resource: '银元', amount: 3 } }];
function seed() {
  WA.store.transact(function (d) {
    d.people = {
      'p_甲': { id: 'p_甲', name: '甲', resources: { '银元': 1 }, updatedAt: 1,
        life: { goals: [{ id: 'g1', text: '攒钱去乙地', status: 'active' }], commitments: [], schedule: [] } },
      'p_乙': { id: 'p_乙', name: '乙', resources: {}, updatedAt: 1,
        life: { goals: [], commitments: [], schedule: [] } }
    };
    d.plan = { plans: [] };
  }, 'probe:intent:seed');
}
WA.plan.setSettings({ enabled: true, maxSteps: 4 });
seed();
var e1 = WA.plan.expand('甲', 'g1', STEPS);
a(e1.ok === true, 'E1: （前置）真写口 expand 成功（实 ' + J(e1) + '）');
var b1 = WA.intentBoard.board();
a(b1.ok === true, 'E2: 看板 ok（实 ' + J(b1.reason) + '）');
a(b1.rows.length === 1 && b1.rows[0].name === '甲', 'E3: 只出有链的人一行（实 ' + J((b1.rows || []).map(function (r) { return r.name; })) + '）');
a(b1.checked === 2 && b1.skipped === 1, 'E4: 查 2 人 / 跳 1 人（无链的不进看板，不造空行；实 ' + b1.checked + '/' + b1.skipped + '）');
a(b1.rows[0].step && b1.rows[0].step.text === '去码头搬货' && b1.rows[0].step.asFact === false,
  'E5: 当前步是拟稿（asFact:false，不冒充已发生；实 ' + J(b1.rows[0].step) + '）');
a(b1.rows[0].total === 2 && b1.rows[0].done === 0, 'E6: 总步数 2 / 已完成 0（实 ' + b1.rows[0].total + '/' + b1.rows[0].done + '）');
// F 卡点：资源不够（走真写口 advance）
var a1 = WA.plan.advance('甲');
var s1 = WA.plan.settle('甲', 'done');
a(a1.ok === true && s1.ok === true, 'F1: （前置）第 0 步走完（实 ' + J(a1.reason) + '/' + J(s1.reason) + '）');
var a2 = WA.plan.advance('甲');
a(a2.ok === false && a2.reason === 'need-unmet', 'F2: （前置）第 1 步资源不足被拒（实 ' + J(a2.reason) + '）');
var b2 = WA.intentBoard.board();
var row2 = (b2.rows || [])[0] || {};
a(row2.isBlocked === true, 'F3: 该行标受阻（实 ' + J(row2.isBlocked) + '）');
a((row2.blocked || []).length === 1 && String(row2.blocked[0]).indexOf('缺 ') === 0,
  'F4: 卡点逐字取 chain.blockedBy 并译成人话（实 ' + J(row2.blocked) + '）');
a(row2.step && row2.step.seq === 1 && row2.step.text === '攒够路费', 'F5: 当前步是第 1 步（实 ' + J(row2.step) + '）');
// G maxRest 生效
{
  var before = row2.rest.length;
  WA.intentBoard.setSettings({ maxRest: 0 });
  var b3 = WA.intentBoard.board();
  a((b3.rows[0] || {}).rest.length === 0,
    'G1: maxRest=0 时不再列后续步（实 ' + before + ' -> ' + (b3.rows[0] || {}).rest.length + '）');
  a((b3.rows[0] || {}).restTotal === row2.restTotal, 'G2: 被压掉的步数仍如实报 restTotal（实 ' + (b3.rows[0] || {}).restTotal + '）');
  WA.intentBoard.setSettings({ maxRest: 3 });
}
// H buildBlock 只列受阻者
{
  var bb = WA.intentBoard.buildBlock();
  a(typeof bb === 'string' && bb.indexOf('甲') >= 0 && bb.indexOf('缺 ') > 0,
    'H1: 注入块只列受阻者并带卡点（实 ' + J(String(bb).slice(0, 60)) + '）');
}
// I 关闭态与 stat
{
  WA.intentBoard.setSettings({ enabled: false });
  var b4 = WA.intentBoard.board();
  a(b4.ok === false && b4.reason === 'disabled', 'I1: 关着时 board 报 disabled（实 ' + J(b4.reason) + '）');
  a(WA.intentBoard.buildBlock() === '', 'I2: 关着时注入块是空串（零 token）');
  var st0 = WA.intentBoard.stat();
  a(st0.enabled === false && st0.planAvailable === true, 'I3: stat 分开报「关着」与「plan 在场」（实 ' + J({ e: st0.enabled, p: st0.planAvailable }) + '）');
  WA.intentBoard.setSettings({ enabled: true });
}
// J 只读：不看板不改世界
{
  var before = JSON.stringify(WA.store.get().people) + '|' + JSON.stringify(WA.store.get().plan);
  WA.intentBoard.board(); WA.intentBoard.view(); WA.intentBoard.stat(); WA.intentBoard.buildBlock();
  var after = JSON.stringify(WA.store.get().people) + '|' + JSON.stringify(WA.store.get().plan);
  a(before === after, 'J1: 看板是只读的（世界存档逐字未变）');
  var st = WA.intentBoard.stat();
  a(st.boards >= 1 && st.rows === 1, 'J2: stat 记到看板次数与出行人数（实 ' + J({ b: st.boards, r: st.rows }) + '）');
}
// K 诊断节
{
  a(!!WA.toolDiag && typeof WA.toolDiag.collect === 'function', 'K1: toolDiag.collect 可用');
  var rep = null;
  try { rep = WA.toolDiag.collect(); } catch (e) { rep = { error: String((e && e.message) || e) }; }
  var ib = rep && rep.intentBoard;
  a(!!ib, 'K2: 诊断包里有 intentBoard 节');
  a(!!ib && !ib.error, 'K3: 该节不是缺席降级（实 ' + J(ib && ib.error) + '）');
  a(!!ib && ib.planAvailable === true && typeof ib.boards === 'number',
    'K4: 该节分开报 plan 在场与看板计数（实 ' + J(ib && { p: ib.planAvailable, b: ib.boards }) + '）');
}
// L 面板渲染（用仓库标准装载器建 DOM 壳）
{
  var gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  var env = gate.fresh({});
  var WA2 = env.WA, dom2 = env.dom;
  try { WA2.store.init(); } catch (e) {}
  WA2.plan.setSettings({ enabled: true, maxSteps: 4 });
  WA2.store.transact(function (d) {
    d.people = {
      'p_甲': { id: 'p_甲', name: '甲', resources: { '银元': 1 }, updatedAt: 1,
        life: { goals: [{ id: 'g1', text: '攒钱去乙地', status: 'active' }], commitments: [], schedule: [] } },
      'p_乙': { id: 'p_乙', name: '乙', resources: {}, updatedAt: 1,
        life: { goals: [], commitments: [], schedule: [] } }
    };
    d.plan = { plans: [] };
  }, 'probe:intent:seed2');
  var ex = WA2.plan.expand('甲', 'g1', STEPS);
  a(ex.ok === true, 'L0: （前置）DOM 壳内真写口 expand 成功（实 ' + J(ex.reason) + '）');
  var panel = dom2.getElementById('wa-panel');
  a(!!panel, 'L1: 面板在场（可读渲染产物）');
  if (WA2.ui && typeof WA2.ui.open === 'function') WA2.ui.open();
  if (WA2.ui && typeof WA2.ui.goPage === 'function') WA2.ui.goPage('overview');
  var body = panel && panel.querySelector ? panel.querySelector('.wa-body') : null;
  var html = String((body && body.innerHTML) || '');
  a(html.indexOf('id="wa-intent-block"') >= 0, 'L2: 概览页渲染出看板块 #wa-intent-block');
  a(html.indexOf('人物意图看板读数不可用') < 0, 'L3: 不是「引擎缺席」降级态');
  a(html.indexOf('甲') >= 0 && html.indexOf('攒钱去乙地') >= 0, 'L4: 看板里有真人与真目标');
  a(html.indexOf('打算') >= 0, 'L5: 未结算步标「打算」（不冒充已发生）');
  // 看板块真在 DOM 树内
  var el = dom2.getElementById('wa-intent-block');
  a(!!el, 'L6: 看板块在 DOM 树内（不是游离字符串）');
  a(!!el && String(el.className || '').indexOf('wa-intent') >= 0, 'L7: 类名是契约（wa-intent）');
  // 卡点进面板
  WA2.plan.advance('甲'); WA2.plan.settle('甲', 'done'); WA2.plan.advance('甲');
  if (WA2.ui && typeof WA2.ui.goPage === 'function') WA2.ui.goPage('world');
  if (WA2.ui && typeof WA2.ui.goPage === 'function') WA2.ui.goPage('overview');
  var el2 = dom2.getElementById('wa-intent-block');
  var txt2 = el2 ? String(el2.textContent || '') : '';
  a(txt2.indexOf('卡在') >= 0, 'L8: 卡点单独成行进面板（实 ' + J(txt2.slice(0, 80)) + '）');
  // 关掉后整块不渲染
  WA2.intentBoard.setSettings({ enabled: false });
  if (WA2.ui && typeof WA2.ui.goPage === 'function') WA2.ui.goPage('world');
  if (WA2.ui && typeof WA2.ui.goPage === 'function') WA2.ui.goPage('overview');
  var html3 = String((dom2.getElementById('wa-panel').querySelector('.wa-body') || {}).innerHTML || '');
  a(html3.indexOf('id="wa-intent-block"') < 0, 'L9: 关着时整块不渲染（不占屏）');
  // 设置页控件
  if (WA2.ui && typeof WA2.ui.goPage === 'function') WA2.ui.goPage('settings');
  var html4 = String((dom2.getElementById('wa-panel').querySelector('.wa-body') || {}).innerHTML || '');
  var IDS = ['wa-ib-enable', 'wa-ib-maxrows', 'wa-ib-maxrowsv', 'wa-ib-maxrest', 'wa-ib-maxrestv', 'wa-ib-save', 'wa-ib-out'];
  var miss4 = IDS.filter(function (id) { return html4.indexOf('id="' + id + '"') < 0; });
  a(miss4.length === 0, 'L10: 设置页七枚控件全渲染（缺 ' + J(miss4) + '）');
  var domMiss = IDS.filter(function (id) { return !dom2.getElementById(id); });
  a(domMiss.length === 0, 'L11: 七枚都在 DOM 树内、可点到（缺 ' + J(domMiss) + '）');
  // 点保存 → 引擎设置真变（入口真通）
  var en = dom2.getElementById('wa-ib-enable');
  if (en) en.checked = true;
  var mr = dom2.getElementById('wa-ib-maxrows');
  if (mr) { mr.value = '5'; mr.oninput && mr.oninput(); }
  var mrv = dom2.getElementById('wa-ib-maxrowsv');
  a(!!mrv && String(mrv.textContent || '').trim() === '5', 'L12: 滑块拖动读数即时跟随（实 ' + J(mrv && mrv.textContent) + '）');
  var sv = dom2.getElementById('wa-ib-save');
  if (sv) sv.click();
  var now = WA2.intentBoard.getSettings();
  a(now.maxRows === 5 && now.enabled === true, 'L13: 点保存后引擎设置真变（实 ' + J({ m: now.maxRows, e: now.enabled }) + '）');
  var outEl = dom2.getElementById('wa-ib-out');
  a(!!outEl && String(outEl.textContent || '').indexOf('5') >= 0,
    'L14: 结果出口回显真实生效值（实 ' + J(outEl && outEl.textContent) + '）');
}

console.log('========== EXV7-2 探针汇总：' + pass + ' passed, ' + fail + ' failed ==========');
process.exit(fail ? 1 : 0);

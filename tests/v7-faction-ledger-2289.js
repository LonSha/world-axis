#!/usr/bin/env node
'use strict';
/** EXV7-5 专锁：势力账本的 owner 聚合、证据边界、容量和零写盘。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');
const ORG = 'engines/org.js';
const DIAG = 'engines/tool-diag.js';
const PANEL = 'ui/panel.js';
const RUN = 'tests/run.js';
const ORG_SRC = fs.readFileSync(path.join(BASE, ORG), 'utf8');
const DIAG_SRC = fs.readFileSync(path.join(BASE, DIAG), 'utf8');
const PANEL_SRC = fs.readFileSync(path.join(BASE, PANEL), 'utf8');
const RUN_SRC = fs.readFileSync(path.join(BASE, RUN), 'utf8');
let pass = 0, fail = 0;
function a(ok, msg) { if (ok) pass++; else { fail++; console.log('  x ' + msg); } }
function must1(s, x, tag) { const n = s.split(x).length - 1; if (n !== 1) throw new Error(tag + ' anchor count ' + n); }
function load(override) {
  Object.keys(require.cache).forEach(function (k) {
    if (k.indexOf(path.join(BASE, 'tests')) === 0 || k.indexOf(path.join(BASE, 'engines')) === 0) delete require.cache[k];
  });
  require(path.join(BASE, 'tests/mock.js'));
  try { global.localStorage.clear(); } catch (e) {}
  const m = RUN_SRC.match(/const LOAD = \[([\s\S]*?)\];/);
  const list = vm.runInNewContext('[' + m[1] + ']');
  const ctx = vm.createContext(global);
  for (const rel of list) {
    const p = path.join(BASE, rel);
    if (!fs.existsSync(p)) continue;
    try { vm.runInContext(override && override[rel] !== undefined ? override[rel] : fs.readFileSync(p, 'utf8'), ctx, { filename: rel }); } catch (e) {}
  }
  const WA = global.WorldAxis;
  WA.store.init();
  return WA;
}
function seed(WA, count) {
  WA.store.transact(function (d) {
    d.people = {};
    d.evolution = d.evolution || {};
    d.evolution.economy = { climate: '平稳', signals: [] };
    d.evolution.factions = [];
    const n = count || 1;
    for (let i = 0; i < n; i++) d.evolution.factions.push({ name: '势力' + String.fromCharCode(甲(i)), resources: { 粮: 100 + i }, roster: {}, projects: [] });
    d.people.p_甲 = { id: 'p_甲', name: '甲', resources: {} };
    d.people.p_乙 = { id: 'p_乙', name: '乙', resources: { 铁: 3 }, debts: [{ to: '势力A', item: '粮', amount: 7, why: '借粮' }] };
    const f = d.evolution.factions[0]; f.name = '势力A'; f.resources = { 粮: 12, 木: 4 };
    f.roster = { 甲: { role: 'member', contrib: 2, owed: 5, owedItem: '粮' } };
    f.projects = [{ what: '修堤', status: 'ongoing', needs: [{ item: '粮', need: 20 }], covered: { 粮: 8 }, by: '甲' }];
  }, 'lock:exv75:seed');
  WA.org.setSettings({ enabled: true });
}
function 甲(i) { return i === 0 ? 65 : 65 + i; }
function runAll(assertFn) {
  const WA = load();
  const aa = function (ok, msg) { a(ok, msg); if (assertFn) assertFn(ok, msg); };
  aa(typeof WA.org.ledgerView === 'function', 'A0 ledgerView export');
  // v2.293.0（v2133 清偿）：锚点面从 `indexOf >= 0` 在场断言升级为 must1 恰 1 断言
  //   （五个字面量在各自目标实测恰 1 次，升级不改变真值；must1 是本仓 EXV7-4 起的
  //   锚点断言惯用写法，锚点扫描器按 must1-arg 形态识别——此前本锁整体落「未识别」。
  //   顺带消灭死辅助函数：must1 从「定义了从不调用」变为真消费）。
  must1(ORG_SRC, 'function factionAccounts(', 'A1 factionAccounts implementation');
  must1(ORG_SRC, 'accounts: factionAccounts(opts)', 'A2 ledgerView consumes accounts');
  must1(DIAG_SRC, 'accounts: led && led.accounts', 'A3 diagnostic consumes ledgerView accounts');
  must1(PANEL_SRC, '势力账本', 'A4a panel renders account summary');
  must1(PANEL_SRC, 'ac.rows', 'A4b panel renders ac.rows');
  seed(WA, 1);
  const empty = WA.org.ledgerView().accounts;
  aa(empty.ok === true && empty.total === 1 && empty.rows.length === 1, 'B1 faction row and explicit bounds');
  const row = empty.rows[0];
  aa(row.faction === '势力A' && row.resources.some(x => x.item === '粮' && x.amount === 12), 'B2 resources from faction owner');
  aa(row.memberCount === 1 && row.payrollDue === 5 && row.owedPayroll === 5, 'B3 roster/payroll owner');
  aa(row.receivable === 5 && row.payable === 7 && row.debts.receivable[0].why === '薪俸未清' && row.debts.payable[0].why === '借粮', 'B4 bidirectional debt evidence');
  aa(row.projectCount === 1 && row.projectMissing === 12 && row.projects[0].missing[0].item === '粮', 'B5 project gap owner');
  const lv = WA.org.ledgerView();
  aa(lv.accounts && JSON.stringify(lv.accounts) === JSON.stringify(empty), 'B6 ledgerView and direct aggregate same read');
  const before = JSON.stringify(WA.store.get());
  const s0 = JSON.stringify(WA.org.stat());
  WA.org.ledgerView(); WA.org.ledgerView();
  aa(before === JSON.stringify(WA.store.get()) && s0 === JSON.stringify(WA.org.stat()), 'C1 aggregate is zero-write');
  const many = load(); seed(many, 10);
  const cap = many.org.ledgerView({ maxRows: 2, maxItems: 1, maxProjects: 1 }).accounts;
  aa(cap.rows.length === 2 && cap.total === 10 && cap.truncated === true && cap.dropped === 8 && cap.limits.items === 1, 'C2 explicit bounded truncation');
  const lvCap = many.org.ledgerView({ maxRows: 2 });
  aa(lvCap.accounts && lvCap.accounts.cap === 2 && lvCap.accounts.rows.length === 2, 'C3 ledgerView forwards account bounds');
  const badOrg = ORG_SRC.replace('accounts: factionAccounts(opts),', 'accounts: null,');
  const broken = load({ [ORG]: badOrg });
  aa(broken.org.ledgerView().accounts === null, 'N1 true-source aggregation break is visible');
  aa(ORG_SRC === fs.readFileSync(path.join(BASE, ORG), 'utf8'), 'N2 negative control leaves source intact');
  return true;
}
function runNegative(assertFn) {
  const aa = function (ok, msg) { a(ok, msg); if (assertFn) assertFn(ok, msg); };
  const bad = ORG_SRC.replace('accounts: factionAccounts(opts),', 'accounts: null,');
  const WA = load({ [ORG]: bad });
  seed(WA);
  const v = WA.org.ledgerView();
  aa(v.accounts === null, 'N3 true aggregation consumer break is observable');
}
module.exports = { runAll, runNegative };
if (require.main === module) {
  try { runAll(); runNegative(); } catch (e) { fail++; console.log('  x threw: ' + e.stack); }
  console.log('EXV7-5 FACTION LEDGER LOCK: ' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'pass (' + pass + ')'));
  if (fail) process.exit(1);
}

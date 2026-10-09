"use strict";
// WorldAxis tools/agenda_smoke.js — E2 世界日程冒烟（零依赖，走 ui-gate-sync 的真实装载面）
const path = require("path");
process.chdir(path.resolve(__dirname, ".."));
const sync = require("../tests/ui-gate-sync.js");
const boot = sync.fresh({});
const WA = boot.WA;
var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log("FAIL: " + name); } }

ok("S1: agenda loaded", typeof WA.agenda === "object");
ok("S2: 9 exports", ["getSettings", "setSettings", "upcoming", "soon", "overdueList", "sources", "diagnose", "stat", "reset"]
  .every(function (k) { return typeof WA.agenda[k] === "function"; }));
ok("S3: default off", WA.agenda.getSettings().enabled === false);

// 关闭时拒算
var d0 = WA.agenda.upcoming();
ok("S4: disabled reject", d0.ok === false && d0.reason === "disabled");

WA.agenda.setSettings({ enabled: true });
ok("S5: enabled true", WA.agenda.getSettings().enabled === true);

// 无剧情钟 ⇒ 整表拒算（边界 5）
var d1 = WA.agenda.upcoming();
ok("S6: no-story-clock reject", d1.ok === false && d1.reason === "no-story-clock");

// 设世界钟
WA.calendar.setClock("第1日", { source: "user", dayIndex: 1 });
var d2 = WA.agenda.upcoming();
ok("S7: upcoming ok with clock", d2.ok === true && typeof d2.storyDay === "number");
ok("S8: empty table honest", d2.count === 0 && d2.note.indexOf("不等于不会发生") >= 0);

// 委托阶段 ⇒ 进入日程（create 需要 principal/agent，现场签名实测）
WA.commission.setSettings({ enabled: true });
var c1 = WA.commission.create({ title: "护送商队", principal: "商会", agent: "护卫",
  stages: [{ label: "接洽", deadline: 0 }, { label: "启程", deadline: 0 }] });
ok("S9: commission created", c1.ok === true);
var d3 = WA.agenda.upcoming();
ok("S10: commission appears", d3.rows.some(function (r) { return r.source === "commission"; }));

// 货运 ⇒ 进入日程（dispatch(routeId, from, resource, qty, opts)；路线直接建，与 tx3_smoke 同法）
WA.freight.setSettings({ enabled: true });
WA.economy.setSettings({ enabled: true });
WA.store.transact(function (d) {
  d.economy = d.economy || { goods: [], orders: [], routes: [] };
  d.economy.routes = d.economy.routes || [];
  d.economy.goods = d.economy.goods || [];
  d.economy.routes.push({ id: "r1", lane: "road", from: "甲城", to: "乙城", cost: 5, status: "open", reason: "", at: 1000, updatedAt: 1000 });
  d.economy.goods.push({ place: "甲城", resource: "粮", base: 10, stock: 50, price: 10, demand: 0, consumed: 0, tickedAt: "", at: 1000, updatedAt: 1000 });
}, "smoke:setup");
var f1 = WA.freight.dispatch("r1", "甲城", "粮", 10, { transitDays: 3, base: 10 });
ok("S11: freight dispatched", f1.ok === true);
var d4 = WA.agenda.upcoming();
ok("S12: freight appears", d4.rows.some(function (r) { return r.source === "freight"; }));

// 只读不变式：连读三次，存档字节级不变
var s1 = JSON.stringify(WA.store.get());
WA.agenda.upcoming(); WA.agenda.soon(3); WA.agenda.overdueList(); WA.agenda.sources();
var s2 = JSON.stringify(WA.store.get());
ok("S13: read-only (store unchanged)", s1 === s2);

// sources 如实报可用性
var srcs = WA.agenda.sources();
ok("S14: sources list 5", Array.isArray(srcs) && srcs.length === 5);
ok("S15: sources has names", srcs.every(function (s) { return typeof s.name === "string" && s.name; }));

// 关闭时整面拒算（无注入段：本模块按「无消费方不挂导出」裁掉了 buildBlock）
WA.agenda.setSettings({ enabled: false });
var d5 = WA.agenda.upcoming();
ok("S16: disabled reject again", d5.ok === false && d5.reason === "disabled");
WA.agenda.setSettings({ enabled: true });

var dg = WA.agenda.diagnose();
ok("S17: diagnose closedLoop", dg.closedLoop === true);
ok("S18: diagnose checks store", dg.checks.store === true);

var st = WA.agenda.stat();
ok("S19: stat reads counted", typeof st.reads === "number" && st.reads >= 1);
ok("S20: stat bySource present", typeof st.bySource === "object");

WA.agenda.reset();
ok("S21: reset clears", WA.agenda.stat().reads === 0);

console.log(String.fromCharCode(10, 69, 50, 32, 97, 103, 101, 110, 100, 97, 32, 115, 109, 111, 107, 101, 58, 32) + pass + " / " + fail);
process.exit(fail > 0 ? 1 : 0);

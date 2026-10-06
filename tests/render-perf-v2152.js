#!/usr/bin/env node
// v2.152.0 RP6 专锁：面板渲染性能观测 —— 页白名单、拒收归因、有界环与三基准趋势。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const REL = 'ui/render-perf.js';
// 锚点取「页白名单」这一条守卫的判据本体：它一旦失效，表外页会被静默收下——
// 观测面收进一个没人声明的页，读数里就会出现一个永远不该出现的名字。
const ANCHOR = "if (pagesKnown().indexOf(p) < 0) { note('unknown-page'); return { ok: false, reason: 'unknown-page', page: p, allowed: pagesKnown() }; }";

function fresh(ov) { return sync.fresh(ov ? { srcOverride: ov } : undefined).WA; }

function reset(WA) {
  WA.store.init();
  if (WA.renderPerf && WA.renderPerf.reset) WA.renderPerf.reset();
}

function runAll(a) {
  const WA = fresh();
  reset(WA);
  const RP = WA.renderPerf;
  const pages = WA.ui.pages();
  a(!!RP && typeof RP.observe === 'function' && typeof RP.renderStat === 'function'
    && typeof RP.renderTrend === 'function' && typeof RP.reset === 'function'
    && typeof RP.getSettings === 'function' && typeof RP.setSettings === 'function',
    'v2152/rp: 六个真出口在场（观测开关的读与写都有真消费方）');
  a(pages.length > 0, 'v2152/rp: 页白名单非空（PAGES 是白名单唯一真源）');

  // ── 正控：白名单内入账 ──
  const p0 = pages[0];
  const r0 = RP.observe(p0, 12, 40);
  a(r0.ok === true && r0.count === 1, 'v2152/rp: 白名单内一次渲染被收下');
  RP.observe(p0, 18, 44);
  const st = RP.renderStat();
  a(st.observed === 2 && st.pages === 1 && st.rows.length === 1, 'v2152/rp: 逐页读数聚合到同一条');
  a(st.rows[0].renders === 2 && st.rows[0].avgMs === 15 && st.rows[0].maxMs === 18 && st.rows[0].lastMs === 18,
    'v2152/rp: 次数/均值/最大值/最近值四项口径正确');
  a(st.rows[0].avgNodes === 42, 'v2152/rp: 平均节点数按已量样本取整');

  // ── 拒收面：每一类都必须**分桶归因**，且总数与分桶之和恒等（两处口径不许打架）──
  const rUnknown = RP.observe('page.that.does.not.exist', 5, 1);
  a(rUnknown.ok === false && rUnknown.reason === 'unknown-page', 'v2152/rp: 表外页拒收（unknown-page）');
  a(Array.isArray(rUnknown.allowed) && rUnknown.allowed.join(',') === pages.join(','),
    'v2152/rp: 拒收时把白名单原样回报（按值比，不按引用——pages() 每次给的是新数组）');
  a(RP.observe('', 5).reason === 'missing-fields', 'v2152/rp: 缺页名拒收（missing-fields）');
  a(RP.observe(p0, NaN).reason === 'bad-value', 'v2152/rp: 非有限耗时拒收（bad-value）');
  a(RP.observe(p0, -1).reason === 'bad-value', 'v2152/rp: 负耗时拒收（bad-value）');
  const st1 = RP.renderStat();
  const bucketSum = Object.keys(st1.faults).reduce(function (m, k) { return m + st1.faults[k]; }, 0);
  a(st1.rejected === bucketSum && st1.rejected === 4,
    'v2152/rp: 拒收总数与分桶之和恒等（实 ' + st1.rejected + ' vs ' + bucketSum + '）');
  a(st1.faults['unknown-page'] === 1 && st1.faults['missing-fields'] === 1 && st1.faults['bad-value'] === 2,
    'v2152/rp: 三类拒收各自进分桶（可归因，不是静默忽略）');
  a(st1.observed === 2, 'v2152/rp: 拒收不计入 observe 数（宁可少收也不污染均值）');
  a(st1.lastReason === 'bad-value', 'v2152/rp: 最近一次归因留痕');

  // ── 有界：逐页环 cap 生效，且**不丢最近的那一条** ──
  for (let i = 0; i < 80; i++) RP.observe(p0, i, 10);
  const st2 = RP.renderStat();
  a(st2.cap === 60 && st2.rows[0].renders === 60, 'v2152/rp: 每页环上限 60（观测自身不许撑爆内存）');
  a(st2.rows[0].lastMs === 79, 'v2152/rp: 截断丢最旧、留最新（最近一次必须是刚发生的那次）');


  // ── 三基准趋势：short/mid/full 三段都要有值，且口径写在读数本体里 ──
  const tr = RP.renderTrend();
  a(tr.ok === true && tr.rows.length === 1, 'v2152/rp: 趋势逐页成行');
  a(typeof tr.rows[0].short === 'number' && typeof tr.rows[0].mid === 'number' && typeof tr.rows[0].full === 'number',
    'v2152/rp: 近10/近50/全窗三基准都给出数值');
  a(tr.basis.indexOf('均值口径') >= 0, 'v2152/rp: 口径说明随读数返回（读数自解释）');

  // ── 总开关：关掉即拒收并归因，且**不动已入账的读数** ──
  RP.reset();
  a(RP.getSettings().enabled === true, 'v2152/rp: 默认开着（面板观测默认可用）');
  RP.setSettings({ enabled: false });
  a(RP.getSettings().enabled === false, 'v2152/rp: 开关写口真落设置（不是只读摆设）');
  RP.observe(p0, 5, 1);
  a(RP.renderStat().faults['disabled'] === 1, 'v2152/rp: 关掉后每次重绘被拒收并归因 disabled');
  const held = RP.renderStat().observed;
  RP.setSettings({ enabled: true });
  RP.observe(p0, 5, 1);
  a(RP.renderStat().observed === held + 1, 'v2152/rp: 重新打开后恢复入账（关掉不改历史读数）');
  a(RP.renderStat().observed === 1 && RP.renderStat().pages === 1,
    'v2152/rp: 计数与页数同步恢复（两处口径不许各说一套）');
  RP.reset();
  a(RP.renderStat().observed === 0 && RP.renderStat().pages === 0 && RP.renderStat().rejected === 0
    && Object.keys(RP.renderStat().faults).length === 0, 'v2152/rp: reset 清空观测环、计量与归因分桶');

  // ── 页数上限：真源页表用不满 CAP_PAGES=24，故「到顶」这一格**只能靠页源打桩现形**。
  //   打桩是正当的：白名单本来就是运行时依赖 WA.ui.pages()（本仓口径是「读运行时真源、不存副本」），
  //   从接口外部把页表换大正是真实局面（宿主页表比面板自己认得的多）。不做这一步，
  //   pages-full 就成了一条没有任何断言见过的守卫 —— 它被删掉也没有人红。
  //   反过来说，这一格**恰恰只能这样验**：真源 16 条页表结构上到不了顶。
  const realPagesFn = WA.ui.pages;
  const fakePages = [];
  for (let i = 0; i < 30; i++) fakePages.push('page.stub.' + i);
  WA.ui.pages = function () { return fakePages.slice(); };
  RP.reset();
  const keptPages = [], refusedPages = [];
  for (const fp of fakePages) { (RP.observe(fp, 1, 1).ok ? keptPages : refusedPages).push(fp); }
  WA.ui.pages = realPagesFn;
  a(keptPages.length === 24 && refusedPages.length === 6 && refusedPages[0] === 'page.stub.24',
    'v2152/rp: 页数到顶后新页被拒 pages-full（实收 ' + keptPages.length + ' / 拒 ' + refusedPages.length + '）');
  a(keptPages.indexOf('page.stub.23') >= 0 && refusedPages.indexOf('page.stub.23') < 0,
    'v2152/rp: 第 24 页仍收得下 —— 界是 24 不是 23（差一格就是差一格）');
  a(RP.renderStat().faults['pages-full'] === 6, 'v2152/rp: pages-full 单独进分桶（可归因，不是静默丢）');
  a(RP.renderStat().observed === 24 && RP.renderStat().rejected === 6,
    'v2152/rp: 打桩态下两处口径仍恒等（observed 24 / rejected 6）');
  a(WA.ui.pages === realPagesFn && WA.ui.pages().length < 30,
    'v2152/rp: 打桩后页源已还原（专锁不给后续断言留副作用）');
  RP.reset();

  // ── 观测面不许写存档：采样前后 draft 逐字节一致 ──
  const snap = JSON.stringify(WA.store.get());
  RP.observe(pages[0], 3, 7); RP.renderStat(); RP.renderTrend(); RP.reset();
  a(JSON.stringify(WA.store.get()) === snap, 'v2152/rp: 观测全链路不写存档（只读观测面）');

  // ── 源码面：登记三件事（settingsRegs / registerModule / evict 无关内存环） ──
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  a(src.indexOf("__settingsRegs = (WA.__settingsRegs || []).concat([__REG])") >= 0,
    'v2152/rp: 设置键走 __settingsRegs 登记（自检可见，不是黑盒）');
  a(src.indexOf("WA.registerModule('ui/render-perf.js'") >= 0, 'v2152/rp: 模块自报登记');
  a(src.indexOf('store.transact') < 0, 'v2152/rp: 零 store.transact（进程态内存环，不落盘）');
}

function runNegative(a) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  const n = src.split(ANCHOR).length - 1;
  a(n === 1, 'v2152/rp/N0: 页白名单守卫唯一锚定（' + n + '）');
  if (n !== 1) return;
  const broken = src.replace(ANCHOR, "if (false) { note('unknown-page'); return { ok: false, reason: 'unknown-page', page: p, allowed: pagesKnown() }; }");
  a(broken !== src, 'v2152/rp/N0b: 破坏改动了内存副本');
  const ov = {}; ov[REL] = broken;
  const WA = fresh(ov); reset(WA);
  // 白名单失效后：表外页会被静默收下 —— 行为必须可观测地反转
  const bad = WA.renderPerf.observe('page.that.does.not.exist', 5, 1);
  a(bad.ok === true, 'v2152/rp/N1: 破坏后表外页真的被收下（判据非空转）');
  a(WA.renderPerf.renderStat().faults['unknown-page'] === undefined, 'v2152/rp/N1b: 破坏后该类拒收归因消失');
  const clean = fresh(); reset(clean);
  const good = clean.renderPerf.observe('page.that.does.not.exist', 5, 1);
  a(good.ok === false && good.reason === 'unknown-page', 'v2152/rp/N2: 同款判据在原源码上通过');
  a(fs.readFileSync(path.join(BASE, REL), 'utf8') === src, 'v2152/rp/N3: 负向探针不改产品源码');
}

module.exports = { runAll: runAll, runNegative: runNegative };

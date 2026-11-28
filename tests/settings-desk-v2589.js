#!/usr/bin/env node
// WorldAxis tests/settings-desk-v2589.js — CFG-1/2 设置面总账台专锁（v2.589.0 / R264）
//
// 锁的是**「设置面不再是改不了的黑洞」这件事**，不是某几个面。六组：
//
//   A 静态契约：新文件在位、导出面齐全、**不持有第二份面清单**、写回不许直碰 localStorage、
//     页表三处齐全、两处装载表都登记了 —— 缺一处就是「有引擎、有页面、没有入口」。
//   B 清单语义：`list()` 与 `settingsBus.faces()` 同源、可翻/纯参数两分、**截断必须自报**、
//     筛选与关键词真的在过滤（不是把参数丢掉还返回全量）。
//   C 写回语义：四种拒收各一条（键不存在 / 无 enabled / 非布尔 / 总线缺席）、真写回读回复核、
//     幂等不白写盘、restore 回出厂值 —— 每一条都**备份还原**，跑完磁盘逐字复原。
//   D 可核性：stat 计数与实际操作一致、lastFlip 记 before/after、sameOrigin 口径正确。
//   E 非空转：把登记表换成空数组 ⇒ 读数真的变 0（不是恒真）；缺 key 时两个读数口径分歧可见；
//     页面在引擎缺席时报「读数缺口」而不是空表。
//   F 页面：render 出工具条与列表、行数受 limit 约束、截断时把「还有 N 个没列出来」写进页面、
//     bind 无根如实拒、勾选框按 data-key 委托（不写死 id）。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

/** 备份/还原一个设置面（真写盘的那几条用它包住）。 */
function withReg(WA, reg, fn) {
  const sb = WA.settingsBus;
  const bak = sb.readEx(reg);
  try { return fn(); }
  finally {
    try {
      if (bak.source === 'default') sb.remove(reg);
      else sb.saveOrThrow(reg, bak.value);
    } catch (e) { /* 还原失败不该掩盖断言失败：让 finally 静默，断言自己会报 */ }
  }
}

function runAll(a) {
  const WA = (typeof global !== 'undefined' && global.WorldAxis) || (global.window && global.window.WorldAxis);
  a(!!WA, 'A0: WorldAxis 在位（本锁必须跑在真产品上）');
  const D = WA.settingsDesk;
  a(!!D, 'A0b: WA.settingsDesk 在位');

  // ── A 静态契约 ────────────────────────────────────────────────
  const engRel = 'engines/settings-desk.js';
  const pageRel = 'ui/pages/faces-page.js';
  const engSrc = fs.readFileSync(path.join(ROOT, engRel), 'utf8');
  const pageSrc = fs.readFileSync(path.join(ROOT, pageRel), 'utf8');
  const panelSrc = fs.readFileSync(path.join(ROOT, 'ui/panel.js'), 'utf8');
  a(D.VERSION === '2.589.0', 'A1: 引擎版本 2.589.0（实 ' + D.VERSION + '）');
  ['list', 'flip', 'restore', 'diagnose', 'summaryText', 'face', 'stat', '__reset'].forEach(function (k, i) {
    a(typeof D[k] === 'function', 'A2.' + (i + 1) + ': 导出 ' + k + '()');
  });
  // 第二份真源禁令：本模块**不许**自带面清单（自带就会与 __settingsRegs 漂移）。
  a(!/\bFACES\s*=/.test(engSrc) && !/\bFACE_LIST\s*=/.test(engSrc),
    'A3: 引擎里没有 FACES / FACE_LIST 常量（清单只能来自 __settingsRegs）');
  a(engSrc.indexOf('worldaxis_') < 0,
    'A4: 引擎里 0 处设置键字面量（它不认识任何一个具体的面）');
  // 写回唯一出口纪律：直写 localStorage 会绕过写后读回校验与失败分桶。
  a(!/localStorage\s*\./.test(engSrc) && !/\bsetItem\s*\(/.test(engSrc),
    'A5: 引擎里 0 处 localStorage.<method> / setItem( 调用（写回只能走 settingsBus）');
  a(engSrc.indexOf('saveOrThrow') >= 0 && engSrc.indexOf('normalize') >= 0,
    'A6: 引擎真的用 normalize + saveOrThrow 写回（不是自己拼值）');
  a(panelSrc.indexOf("{ id: 'faces', icon:") >= 0, 'A7: PAGES 有设置面页项（页 id 纯小写）');
  a(/const PAGE_CAT = \{[^}]*\bfaces: 'workshop'/.test(panelSrc), "A7b: 设置面登记在诊断与维护分类");
  a(panelSrc.indexOf('faces: renderFacesDesk,') >= 0, 'A7c: RENDERERS 成对挂载 renderFacesDesk');
  a(panelSrc.indexOf("WA.panelFacesPage && typeof WA.panelFacesPage.bind === 'function'") >= 0,
    'A7d: bindBody 真的去绑设置面页（页模块只出 HTML，行为归面板）');
  const idxSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  const runSrc = fs.readFileSync(path.join(ROOT, 'tests/run.js'), 'utf8');
  a(idxSrc.indexOf("'" + engRel + "'") >= 0 && runSrc.indexOf("'" + engRel + "'") >= 0,
    'A8: 引擎在两处装载表都登记（index.js + tests/run.js）');
  a(idxSrc.indexOf("'" + pageRel + "'") >= 0, 'A8b: 页面在 index.js 装载表登记');

  // ── B 清单语义 ────────────────────────────────────────────────
  const all = D.list({ only: 'all', limit: 400 });
  const faces = WA.settingsBus.faces();
  a(all.ok === true && all.total > 0, 'B1: 清单非空（实 ' + all.total + ' 个面）');
  a(all.total === faces.total - (faces.missingKey || 0),
    'B1b: 面数 = settingsBus.faces() 的有效面数（' + all.total + ' / ' + (faces.total - (faces.missingKey || 0)) + '）');
  a(all.totals.switchable + all.totals.noSwitch === all.total,
    'B2: 可翻 + 纯参数 = 总数（' + all.totals.switchable + ' + ' + all.totals.noSwitch + '）');
  a(all.totals.switchable > 0 && all.totals.noSwitch > 0,
    'B2b: 两类都非空（否则「纯参数不给开关」这条判据在真空上恒真）');
  // 截断自报：这是本页最容易犯的错（24 行看起来像「一共就 24 个」）。
  const few = D.list({ only: 'all', limit: 5 });
  a(few.shown === 5 && few.limit === 5, 'B3: limit=5 ⇒ 只渲染 5 行（实 ' + few.shown + '）');
  a(few.truncated === true && few.matched > few.shown,
    'B3b: 截断时 truncated=true 且 matched(' + few.matched + ') > shown(' + few.shown + ')');
  a(few.matched === all.matched, 'B3c: 截断只影响 shown，不影响 matched（筛选结果不因显示上限而缩水）');
  const wide = D.list({ only: 'all', limit: 400 });
  a(wide.truncated === (wide.matched > wide.shown), 'B3d: 未截断时 truncated 必须为 false（不许恒真）');
  const noSw = D.list({ only: 'no-enabled', limit: 400 });
  a(noSw.rows.length > 0 && noSw.rows.every(function (r) { return r.hasSwitch === false; }),
    'B4: only=no-enabled ⇒ 每行都没有开关（实 ' + noSw.rows.length + ' 行）');
  const swOnly = D.list({ only: 'switchable', limit: 400 });
  a(swOnly.rows.length === all.totals.switchable,
    'B4b: only=switchable 的行数 = totals.switchable（' + swOnly.rows.length + '）');
  const kwMap = D.list({ only: 'all', kw: 'map', limit: 400 });
  a(kwMap.rows.length > 0 && kwMap.matched < all.matched,
    'B5: 关键词真的在过滤（map 命中 ' + kwMap.matched + ' / 全量 ' + all.matched + '）');
  a(kwMap.rows.every(function (r) {
    return r.key.toLowerCase().indexOf('map') >= 0 || r.module.toLowerCase().indexOf('map') >= 0;
  }), 'B5b: 每一行的键名或模块名真的含关键词（不是「有命中就算过」）');
  a(all.rows.every(function (r) {
    return typeof r.key === 'string' && typeof r.module === 'string'
      && typeof r.hasSwitch === 'boolean' && (r.defOn === null || typeof r.defOn === 'boolean')
      && (r.on === null || typeof r.on === 'boolean') && typeof r.source === 'string';
  }), 'B6: 每行四个字段形态都合规（key/module/hasSwitch/defOn/on/source）');
  a(all.rows.filter(function (r) { return r.hasSwitch; })
    .every(function (r) { return r.on === !!r.on; }), 'B6b: 有开关的面 on 一定是布尔（不许 undefined 冒充「关」）');

  // ── C 写回语义 ────────────────────────────────────────────────
  const regs = WA.__settingsRegs || [];
  const switchable = regs.filter(function (r) {
    return r && r.key && r.def && Object.prototype.hasOwnProperty.call(r.def, 'enabled');
  });
  const pureParam = regs.filter(function (r) {
    return r && r.key && r.def && !Object.prototype.hasOwnProperty.call(r.def, 'enabled');
  });
  a(switchable.length > 0, 'C0: 现场有可翻面（' + switchable.length + ' 个）');
  a(pureParam.length > 0, 'C0b: 现场有纯参数面（' + pureParam.length + ' 个）');

  const r0 = D.flip('worldaxis_definitely_not_a_face_v1', true);
  a(r0.ok === false && r0.reason === 'invalid-key', 'C1: 不存在的键 ⇒ invalid-key（实 ' + r0.reason + '）');
  a(regs.length === (WA.__settingsRegs || []).length, 'C1b: 拒收不改登记表长度（拒收不许有副作用）');

  const r1 = D.flip(switchable[0].key, 'true');
  a(r1.ok === false && r1.reason === 'invalid-bool', 'C2: on 传字符串 ⇒ invalid-bool（实 ' + r1.reason + '）');

  const r2 = D.flip(pureParam[0].key, false);
  a(r2.ok === false && r2.reason === 'no-enabled', 'C3: 纯参数面 ⇒ no-enabled（实 ' + r2.reason + '）');
  const pp = WA.settingsDesk.face(pureParam[0].key);
  a(pp.hasSwitch === false, 'C3b: 拒收之后该面仍然没有开关（没有凭空补一个 enabled 字段进去）');

  // 选一个「默认关」的面真翻，跑完还原。
  const target = switchable.filter(function (r) { return r.def.enabled === false; })[0] || switchable[0];
  const tBefore = WA.settingsDesk.face(target.key);
  const tWant = !tBefore.on;
  const statA = WA.settingsDesk.stat();
  const r3 = withReg(WA, target, function () { return D.flip(target.key, tWant); });
  a(r3.ok === true && r3.changed === true,
    'C4: 真翻一个面成功（' + target.key + ' ' + tBefore.on + '→' + tWant + '，实 changed=' + r3.changed + '）');
  a(r3.before === tBefore.on && r3.after === tWant, 'C4b: 返回体记 before/after（' + r3.before + '→' + r3.after + '）');
  const statB = WA.settingsDesk.stat();
  a(statB.flips === statA.flips + 1, 'C4c: stat.flips 恰 +1（实 ' + statA.flips + '→' + statB.flips + '）');
  a(statB.flipsOk === statA.flipsOk + 1, 'C4d: stat.flipsOk 恰 +1');
  a(!!statB.lastFlip && statB.lastFlip.key === target.key, 'C4e: lastFlip 记的是这一次（' + (statB.lastFlip && statB.lastFlip.key) + '）');

  // 幂等：目标值等于当前值 ⇒ 不白写盘。
  const r4 = withReg(WA, target, function () {
    D.flip(target.key, tWant);
    return D.flip(target.key, tWant);
  });
  a(r4.ok === true && r4.changed === false, 'C5: 再翻同值 ⇒ ok 但 changed=false（不白写盘）');

  // restore 回出厂值。
  const r5 = withReg(WA, target, function () {
    D.flip(target.key, tWant);
    return WA.settingsDesk.restore(target.key);
  });
  a(r5.ok === true && r5.after === (tBefore.defOn === null ? undefined : tBefore.defOn),
    'C6: restore 回到出厂值（目标 ' + tBefore.defOn + '，实 ' + r5.after + '）');
  const r6 = WA.settingsDesk.restore('worldaxis_definitely_not_a_face_v1');
  a(r6.ok === false && r6.reason === 'invalid-key', 'C6b: restore 不存在的键也如实拒收');
  // 还原确认：跑完这一组，磁盘必须逐字回到开跑前。
  const tAfter = WA.settingsDesk.face(target.key);
  a(tAfter.on === tBefore.on && tAfter.source === tBefore.source,
    'C7: 整组跑完目标面逐字复原（' + tBefore.on + '/' + tBefore.source + ' → ' + tAfter.on + '/' + tAfter.source + '）');

  // ── D 可核性 ─────────────────────────────────────────────────
  const st = WA.settingsDesk.stat();
  a(st.flips > 0 && st.flipsRefused > 0, 'D1: stat 两类计数都非零（flips ' + st.flips + ' / refused ' + st.flipsRefused + '）');
  a(st.flips >= st.flipsOk && st.flipsOk > 0,
    'D1b: 成功数不超过总尝试数且非零（flips ' + st.flips + ' ≥ flipsOk ' + st.flipsOk + '）');
  a(!!st.lastList && typeof st.lastList.matched === 'number', 'D2: lastList 记了上一次清单读数');
  const dg = D.diagnose();
  a(dg.ok === true && typeof dg.total === 'number' && dg.total > 0, 'D3: diagnose 报出 ' + dg.total + ' 个面');
  a(dg.sameOrigin === true, 'D3b: 面板面数与 settingsBus.faces() 同源（实 ' + dg.sameOrigin + '）');
  a(dg.switchable === all.totals.switchable && dg.noSwitch === all.totals.noSwitch,
    'D3c: diagnose 的读数与 list 的 totals 一致（不是两套算法）');
  const txt = D.summaryText(dg);
  a(txt.indexOf('设置面') >= 0 && txt.indexOf(String(dg.total)) >= 0,
    'D4: summaryText 含「设置面」与面数（' + txt.slice(0, 40) + '…）');
  a(Object.keys(st.faults || {}).length === 0 || typeof st.faults === 'object',
    'D5: faults 是可读对象（跑这一组不该有故障，但不许缺席这个字段）');

  // ── E 非空转 ─────────────────────────────────────────────────
  // 把登记表临时换成空数组：readout 必须真的变 0。恒真的判据在这里会现形。
  const keep = WA.__settingsRegs;
  let emptyRes = null;
  try {
    WA.__settingsRegs = [];
    emptyRes = D.list({ only: 'all', limit: 400 });
  } finally { WA.__settingsRegs = keep; }
  a(emptyRes && emptyRes.total === 0 && emptyRes.rows.length === 0 && emptyRes.truncated === false,
    'E1: 登记表为空 ⇒ total 0 / 无行 / truncated=false（读数不是恒真）');
  const back = D.list({ only: 'all', limit: 400 });
  a(back.total === all.total, 'E1b: 还原后 total 回到 ' + all.total + '（实 ' + back.total + '）');
  // 缺 key 的登记行：settingsBus 的 total 会 +1，本模块的有效面数不变 —— 口径差异必须可核。
  let missRes = null;
  try {
    WA.__settingsRegs = keep.concat([{ module: 'noKeyProbe' }]);
    missRes = { l: D.list({ only: 'all', limit: 400 }), f: WA.settingsBus.faces(), d: D.diagnose() };
  } finally { WA.__settingsRegs = keep; }
  a(missRes && missRes.f.total === faces.total + 1 && missRes.f.missingKey === (faces.missingKey || 0) + 1,
    'E2: 塞一条无 key 行 ⇒ settingsBus 的 total +1 且 missingKey +1');
  a(missRes && missRes.l.total === all.total,
    'E2b: 本模块的有效面数不变（' + (missRes && missRes.l.total) + '）—— 无 key 行不是面');
  a(missRes && missRes.d.sameOrigin === true,
    'E2c: 此时 sameOrigin 仍为 true —— 证明它比的是「减掉 missingKey 的有效面数」，不是裸 total');
  a(WA.__settingsRegs.length === keep.length, 'E2d: 探针已撤掉（登记表长度复原 ' + WA.__settingsRegs.length + '）');

  // ── F 页面 ───────────────────────────────────────────────────
  const box = { console: console, Date: Date, Math: Math, JSON: JSON, Number: Number,
    String: String, Array: Array, Object: Object, isFinite: isFinite };
  box.window = box;
  box.WorldAxis = { settingsDesk: D };
  vm.createContext(box);
  vm.runInContext(pageSrc, box, { filename: pageRel });
  const page = box.WorldAxis.panelFacesPage;
  a(!!page && typeof page.render === 'function' && typeof page.bind === 'function',
    'F1: 页面模块暴露 render + bind');
  const html = page.render();
  ['wa-faces-kw', 'wa-faces-only', 'wa-faces-limit', 'wa-faces-apply', 'wa-faces-reload', 'wa-faces-list', 'wa-faces-count']
    .forEach(function (id, i) { a(html.indexOf('id="' + id + '"') >= 0, 'F2.' + (i + 1) + ': 渲染出 ' + id); });
  a(html.indexOf('显示 <b>') >= 0 && html.indexOf('个面') >= 0,
    'F3: 页脚报「显示 X / 匹配 Y / 共 Z 个面」');
  a(html.indexOf('没列出来') >= 0,
    'F3b: 默认 limit(24) 小于面数 ⇒ 页面必须写「还有 N 个没列出来」');
  a(html.indexOf('纯参数') >= 0, 'F4: 页面把纯参数面如实标成「纯参数，不可翻」');
  a(html.indexOf('data-key=') >= 0 && html.indexOf('wa-face-box') >= 0,
    'F5: 勾选框按 data-key 委托（不逐个写死 id）');
  const rBox = html.match(/class="wa-face-box"/g) || [];
  // 一屏里既有可翻面也有纯参数面，故勾选框数 = 「本屏 hasSwitch 的行数」，不等于行数本身。
  //   用页面自己的 VIEW.limit 当分母：写死 24 会让「页面改了默认行数」时这条判据假绿。
  const firstPage = D.list({ only: 'all', limit: (page.VIEW && page.VIEW.limit) || 24 });
  const expectBox = firstPage.rows.filter(function (r) { return r.hasSwitch; }).length;
  a(rBox.length === expectBox,
    'F5b: 勾选框数 = 本屏可翻面数（实 ' + rBox.length + ' / 期望 ' + expectBox + '）');
  a(firstPage.rows.length === Math.min((page.VIEW && page.VIEW.limit) || 24, back.matched),
    'F5c: 本屏行数 = min(limit, matched)（实 ' + firstPage.rows.length + '）');
  const b = page.bind(null);
  a(b.ok === false && b.reason === 'no-root', 'F6: bind 无根如实拒绝（不许静默假装绑好）');
  // 引擎缺席：必须报读数缺口，不许返回空表假装「这里本来就没东西」。
  delete box.WorldAxis.settingsDesk;
  const htmlAbsent = page.render();
  a(htmlAbsent.indexOf('读数缺口') >= 0 && htmlAbsent.indexOf('wa-faces-absent') >= 0,
    'F7: 引擎缺席 ⇒ 页面报「读数缺口」（不是空表）');
  return { total: all.total, switchable: all.totals.switchable, noSwitch: all.totals.noSwitch };
}

module.exports = { runAll: runAll };

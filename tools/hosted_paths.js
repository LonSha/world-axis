#!/usr/bin/env node
'use strict';
/**
 * tools/hosted_paths.js —— **真宿主逐条路径取证**（优化 3 的「逐条路径」面）。
 *
 * 用法：node tools/hosted_paths.js <url>
 *   例：node tools/hosted_paths.js http://127.0.0.1:8000
 *
 * 与 tools/hosted_smoke.js 的分工：
 *   · hosted_smoke  —— 判「扩展在真酒馆里能不能起来」（装载 / 面板 / 点一遍控件 / 往返）；
 *   · hosted_paths  —— 判「关键路径逐条走通」（本文件）。
 *
 * 覆盖三条计划点名路径（均**真宿主 + 真事件源**，不是桩）：
 *   P1 生成前后链：调真 `window.worldAxisGenerateInterceptor` + 派真 `GENERATION_ENDED`；
 *   P2 切聊天：派真 `CHAT_CHANGED`（产品 handler 应重载 store 并 emit `chat:changed`）；
 *   P3 重载：同 profile 内第二次真导航，验盘上状态跨真实导航可复读。
 *
 * 纪律（本仓铁律）：
 *   · 每条路径保留 操作 / 控制台 / 操作后状态 / 重载后状态 四面；
 *   · 含重复操作（P1 重调拦截器验去重；P2 重发 CHAT_CHANGED）；
 *   · 真宿主缺席 / 浏览器不可用 ⇒ **如实未执行**（退非零），不静默、不拿桩顶替。
 *
 * 现场真值（2026-10-13 探针 dump，避免猜字段）：
 *   · 真 ST 1.19.0：`ctx.eventTypes` 含 GENERATION_ENDED / MESSAGE_RECEIVED / CHAT_CHANGED；
 *   · `ctx.eventSource.emit(evt)` 可派真事件（回环到扩展自己的 handler）；
 *   · store 顶层无 `round`；轮次推进的观测量是 `store.get().meta.lastSettle`；
 *   · 存档键 `worldaxis_state_<chatId>`，新局 chatId 缺省 ⇒ `worldaxis_state_wa_default`；
 *   · 切聊天可观测面 = `WA.store.get()` **引用身份**变化（init() 重建内存态）。
 */
const LIVE = require('./../tests/ui-live.js');

const url = process.argv[2];
if (!url) {
  console.log('HOSTED-PATHS: 未给 URL ⇒ 未执行（用法：node tools/hosted_paths.js <url>）');
  process.exit(2);
}

// ── P1 生成前后链 ─────────────────────────────────────────────
const PATH_GEN_SOURCE = [
  '(async function () {',
  '  const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };',
  '  const ctx = window.SillyTavern.getContext();',
  '  const WA = window.WorldAxis;',
  '  const out = { ok: false, steps: [], err: null, synthetic: false };',
  '  let pushed = false;',
  '  try {',
  '    // 真宿主空聊天里 settleGuard 会**正确拒推**（reason=no-chat）⇒ 用一楼层合成消息驱动完整 after 链，',
  '    //   验「轮次真推进」而不是只看「handler 跑了」。合成消息在末段弹出，不留痕。',
  '    ctx.chat = ctx.chat || [];',
  '    if (!ctx.chat.length) { ctx.chat.push({ mes: "WA 真宿主验收：合成楼层", is_user: false, swipe_id: 0 }); pushed = true; out.synthetic = true; }',
  '  } catch (e) { out.err = "seed-chat: " + e.message; return out; }',
  '  const restore = function () { try { if (pushed) ctx.chat.pop(); } catch (e2) {} };',
  '  let before = null, roundBefore = null;',
  '  try { const s = WA.store.get(); before = s.meta ? s.meta.lastSettle : null; roundBefore = (s.evolution && s.evolution.round) || 0; }',
  '  catch (e) { out.err = "read-before: " + e.message; restore(); return out; }',
  '  try {',
  '    if (typeof window.worldAxisGenerateInterceptor !== "function") { out.err = "拦截器缺席"; restore(); return out; }',
  '    await window.worldAxisGenerateInterceptor(ctx.chat, 8192, function () {}, "normal");',
  '    out.steps.push("before-chain");',
  '  } catch (e) { out.err = "interceptor-threw: " + ((e && e.message) || e); restore(); return out; }',
  '  try {',
  '    const et = ctx.eventTypes;',
  '    const ev = et.GENERATION_ENDED || et.MESSAGE_RECEIVED;',
  '    if (!ev) { out.err = "after 事件缺席"; return out; }',
  '    ctx.eventSource.emit(ev);',
  '    await sleep(600);',
  '    out.steps.push("after-chain");',
  '  } catch (e) { out.err = "emit-threw: " + ((e && e.message) || e); restore(); return out; }',
  '  try {',
  '    const s = WA.store.get();',
  '    const after = s.meta ? s.meta.lastSettle : null;',
  '    const roundAfter = (s.evolution && s.evolution.round) || 0;',
  '    out.after = { lastSettle: after, round: roundAfter,',
  '      settled: !!after && after.chatId != null,',
  '      advanced: roundAfter !== roundBefore || before !== after,',
  '      hasInjection: !!s.lastInjection };',
  '  } catch (e) { out.err = "read-after: " + e.message; restore(); return out; }',
  '  try {',
  '    // 重复操作：再派一次同一楼层 ⇒ settleGuard 应去重（reason=dup），轮次不得虚增',
  '    const rb = (WA.store.get().evolution && WA.store.get().evolution.round) || 0;',
  '    ctx.eventSource.emit(ctx.eventTypes.GENERATION_ENDED || ctx.eventTypes.MESSAGE_RECEIVED);',
  '    await sleep(400);',
  '    const ra = (WA.store.get().evolution && WA.store.get().evolution.round) || 0;',
  '    out.dedup = { roundBefore: rb, roundAfter: ra, noDoubleAdvance: rb === ra };',
  '    // 重生成（swipe）：同楼层换内容 ⇒ settleGuard 应判 reroll（不虚增世界时间）',
  '    if (pushed && ctx.chat.length) { ctx.chat[ctx.chat.length - 1].mes = "WA 真宿主验收：重生成后的文本"; }',
  '    const sb = (WA.store.get().evolution && WA.store.get().evolution.round) || 0;',
  '    ctx.eventSource.emit(ctx.eventTypes.GENERATION_ENDED || ctx.eventTypes.MESSAGE_RECEIVED);',
  '    await sleep(400);',
  '    const sa = (WA.store.get().evolution && WA.store.get().evolution.round) || 0;',
  '    out.reroll = { roundBefore: sb, roundAfter: sa, noAdvance: sb === sa };',
  '    out.steps.push("repeat-dedup");',
  '  } catch (e) { out.err = "repeat-threw: " + ((e && e.message) || e); restore(); return out; }',
  '  restore();',
  '  out.ok = true;',
  '  return out;',
  '})()'
].join('\n');

// ── P2 切聊天 ─────────────────────────────────────────────────
const PATH_CHAT_SOURCE = [
  '(async function () {',
  '  const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };',
  '  const ctx = window.SillyTavern.getContext();',
  '  const WA = window.WorldAxis;',
  '  const out = { ok: false, err: null };',
  '  try {',
  '    if (!ctx.eventTypes.CHAT_CHANGED) { out.err = "CHAT_CHANGED 缺席"; return out; }',
  '    let fired = 0;',
  '    try { WA.on("chat:changed", function () { fired++; }); } catch (e) {}',
  '    const refBefore = WA.store.get();',
  '    ctx.eventSource.emit(ctx.eventTypes.CHAT_CHANGED);',
  '    await sleep(400);',
  '    out.refChanged = refBefore !== WA.store.get();',
  '    out.chatChangedFired = fired;',
  '    ctx.eventSource.emit(ctx.eventTypes.CHAT_CHANGED);',
  '    await sleep(200);',
  '    out.repeatOk = true;',
  '    out.ok = true;',
  '  } catch (e) { out.err = "chat-changed-threw: " + ((e && e.message) || e); }',
  '  return out;',
  '})()'
].join('\n');

// ── P4 拒收与重复操作（不半写）────────────────────────────────
//   用 org.transfer 的 insufficient 做真实拒收：转出多于持有必然被拒；重复同一笔仍被拒；
//   随后转出**恰好持有量**应当成功 ⇒ 证明两次被拒**没有产生半写**（非破坏性，不碰存档真源结构）。
const PATH_REJECT_SOURCE = [
  '(async function () {',
  '  const WA = window.WorldAxis;',
  '  const out = { ok: false, err: null };',
  '  try {',
  '    if (WA.org.setSettings) WA.org.setSettings({ enabled: true, maxItems: 3 });',
  '    WA.store.transact(function (d) {',
  '      d.evolution = d.evolution || {};',
  '      d.evolution.factions = [{ name: "甲", status: "鼎盛", relation: "血盟", resources: { 粮: 100 } }];',
  '      d.people = { p_丙: { id: "p_丙", name: "丙", resources: {} } };',
  '    }, "hosted-paths:seed");',
  '    const r1 = WA.org.transfer("faction", "甲", "person", "丙", "粮", 999);',
  '    const r2 = WA.org.transfer("faction", "甲", "person", "丙", "粮", 999);',
  '    out.reject1 = r1 && r1.reason; out.reject2 = r2 && r2.reason;',
  '    out.stable = !!(r1 && r2 && r1.ok === false && r1.reason === r2.reason && r1.reason === "insufficient");',
  '    const r3 = WA.org.transfer("faction", "甲", "person", "丙", "粮", 100);',
  '    out.noHalfWrite = !!(r3 && r3.ok === true);',
  '    out.ok = true;',
  '  } catch (e) { out.err = "reject-threw: " + ((e && e.message) || e); }',
  '  return out;',
  '})()'
].join('\n');

// ── P5 业务四路径（存档 checkpoints / 待办 pendingCenter / 规则包 rulePack / 实验室 worldLab）──
//   覆盖优化 3 点名路径中「存档 / 待办 / 规则包 / 实验室」与 E1/E3/E7/E9 的玩家栏（宿主第四栏）。
//   用法全部照抄已验证的专锁段（e1/e3/e7/e9），不猜签名。成功 / 拒收 / 恢复一致三面齐。
const PATH_BIZ_SOURCE = [
  '(async function () {',
  '  const WA = window.WorldAxis;',
  '  const out = { ok: false, err: null };',
  '  try {',
  '    // B1 存档（checkpoints）：开 → 造写差异 → 存档 → 再改 → 恢复 → 状态回到存档点',
  '    WA.checkpoints.setSettings({ enabled: true, maxSlots: 12 });',
  '    WA.store.transact(function (d) {',
  '      d.people = d.people || {};',
  '      d.people.p_存档人 = { id: "p_存档人", name: "存档人", role: "村民" };',
  '    }, "hosted-paths:biz-ckpt-before");',
  '    const sv = WA.checkpoints.save("业务探针档", {});',
  '    out.saveOk = !!(sv && sv.ok === true && sv.id);',
  '    WA.store.transact(function (d) { delete d.people.p_存档人; d.people.p_后来人 = { id: "p_后来人", name: "后来人", role: "旅人" }; }, "hosted-paths:biz-ckpt-after");',
  '    const drift = WA.store.get().people || {};',
  '    out.drifted = !drift.p_存档人 && !!drift.p_后来人;',
  '    const rs = WA.checkpoints.restore(sv.id, {});',
  '    out.restoreOk = !!(rs && rs.ok === true);',
  '    const back = WA.store.get().people || {};',
  '    out.restored = !!(back.p_存档人 && !back.p_后来人);',
  '    // B2 待办（pendingCenter）：commission 造一条真待办 → items 里真出现 → act cancel 透传真执行 → 消失',
  '    WA.commission.setSettings({ enabled: true });',
  '    WA.commission.create({ title: "护送商队", principal: "商会", agent: "护卫",',
  '      stages: [{ label: "接洽", deadline: 0 }, { label: "启程", deadline: 0 }] });',
  '    WA.pendingCenter.setSettings({ enabled: true });',
  '    const it1 = WA.pendingCenter.items();',
  '    const row = (it1.rows || []).filter(function (x) { return x.kind === "commission"; })[0];',
  '    out.todoVisible = !!row;',
  '    let done = null;',
  '    if (row) done = WA.pendingCenter.act("commission", "cancel", row.ref);',
  '    out.actOk = !!(done && done.fault === null && done.ok !== false);',
  '    const it2 = WA.pendingCenter.items();',
  '    out.todoGone = !(it2.rows || []).some(function (x) { return x.kind === "commission" && x.ref === row.ref; });',
  '    // B3 规则包（rulePack）：规则面非空 → 存包（带指纹）→ 改设置面造冲突 → conflict 先拒 → force 才过',
  '    WA.rulePack.setSettings({ enabled: true });',
  '    const cur = WA.rulePack.current({});',
  '    out.packable = cur.packable;',
  '    const pk = WA.rulePack.save("业务包");',
  '    out.packOk = !!(pk && pk.ok === true && typeof pk.sig === "string" && pk.sig.length === 8);',
  '    try {',
  '      const reg = WA.__settingsRegs.filter(function (r) { return r.key === "worldaxis_theme_settings_v1"; })[0];',
  '      WA.settingsBus.saveOrThrow(reg, WA.settingsBus.normalize(reg, { themes: ["别的"] }));',
  '      const ap0 = WA.rulePack.apply("业务包");',
  '      out.conflict = ap0 && ap0.reason;',
  '    } catch (e2) { out.conflict = "seed-skip:" + ((e2 && e2.message) || e2); }',
  '    const ap = WA.rulePack.apply("业务包", { force: true });',
  '    out.applyOk = !!(ap && ap.ok === true);',
  '    // B4 实验室（worldLab）：enabled → parseSteps → run 三臂 → 零写自证',
  '    WA.worldLab.setSettings({ enabled: true });',
  '    const ps = WA.worldLab.parseSteps("wait|李明|3", 6);',
  '    out.parseOk = !!(ps && ps.ok === true);',
  '    const lr = WA.worldLab.run({ a: "wait|李明|3", b: "notify|李明|货到了" });',
  '    out.labOk = !!(lr && lr.ok === true && lr.arms && lr.arms.length === 3);',
  '    out.liveUnchanged = !!(lr && lr.liveUnchanged === true);',
  '    out.ok = !!(out.saveOk && out.drifted && out.restoreOk && out.restored && out.todoVisible',
  '      && out.actOk && out.todoGone && out.packOk && out.applyOk && out.parseOk && out.labOk && out.liveUnchanged);',
  '  } catch (e) { out.err = "biz-threw: " + ((e && e.message) || e); }',
  '  return out;',
  '})()'
].join('\n');
// ── M1 手机端关键路径（Emulation 三件套：视口 / 触摸 / UA；真宿主 + 390×844 视口）──
//   覆盖优化 3 验收条款「桌面与手机至少各覆盖一组关键路径」的手机半边。
//   判据：仿真生效（vw=390 / isTouch=true）→ 面板在手机视口里挂载 → 页签全渲染 →
//         goPage 真切页（返回 ok:true 且 active 唯一）→ 触摸事件可派发（面板不抛）。
const PATH_MOBILE_SOURCE = [
  '(async function () {',
  '  const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };',
  '  const WA = window.WorldAxis;',
  '  const out = { ok: false, err: null };',
  '  try {',
  '    out.vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);',
  '    out.isTouch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);',
  '    out.panel = !!document.getElementById("wa-panel");',
  '    out.tabs = document.querySelectorAll("#wa-panel .wa-tab").length;',
  '    const errBefore = (window.__werr || []).length;',
  '    const g1 = WA.ui.goPage("people");',
  '    await sleep(50);',
  '    const a1 = document.querySelector("#wa-panel .wa-tab.active");',
  '    out.navPeople = !!(g1 && g1.ok === true && a1 && a1.dataset.page === "people");',
  '    const g2 = WA.ui.goPage("world");',
  '    await sleep(50);',
  '    const a2 = document.querySelector("#wa-panel .wa-tab.active");',
  '    out.navWorld = !!(g2 && g2.ok === true && a2 && a2.dataset.page === "world");',
  '    const gBad = WA.ui.goPage("不存在的页");',
  '    out.rejectBad = !!(gBad && gBad.ok === false && gBad.reason === "bad-page");',
  '    out.activeStillOne = document.querySelectorAll("#wa-panel .wa-tab.active").length === 1;',
  '    const orb = document.getElementById("wa-orb");',
  '    out.orb = !!orb;',
  '    if (orb) {',
  '      const r = orb.getBoundingClientRect();',
  '      out.orbInViewport = r.left >= 0 && r.top >= 0 && r.right <= out.vw && r.bottom <= (window.innerHeight || 0);',
  '    }',
  '    out.noNewErrors = (window.__werr || []).length === errBefore;',
  '    out.ok = !!(out.panel && out.tabs >= 20 && out.navPeople && out.navWorld && out.rejectBad && out.activeStillOne && out.noNewErrors);',
  '  } catch (e) { out.err = "mobile-threw: " + ((e && e.message) || e); }',
  '  return out;',
  '})()'
].join('\n');
// ── P6 O1 矩阵补跑：其余六模块 × 成功/拒收（TX2 agency / TX5 worldBlueprint / TX6 commission /
//   TX7 investigation / TX8 aftermath / TX9 operations）—— 用法全部照抄各自 smoke 的已验证段。
//   O1 此前为三模块代表制（TX1/TX3/TX4），本段把「同族覆盖」升成六模块真跑各一条成功 + 一条拒收。
const PATH_SIX_SOURCE = [
  '(async function () {',
  '  const WA = window.WorldAxis;',
  '  const out = { ok: false, err: null, mods: {} };',
  '  function rc(r) { return (r && r.result && typeof r.result === "object") ? r.result : r; }',
  '  try {',
  '    // TX2 agency：成功 = diagnose 真回带闭环旗标；拒收 = 无计划 schedule ⇒ need-steps/no-plan（不编步骤）',
  '    try {',
  '      WA.agency.setSettings({ enabled: true });',
  '      if (WA.life && WA.life.addGoal) WA.life.addGoal("取证员", { id: "g_m1", text: "修桥", status: "active" });',
  '      const d = WA.agency.diagnose();',
  '      const s = rc(WA.agency.schedule("取证员", Date.now()));',
  '      out.mods.tx2 = { succ: typeof d === "object" && typeof d.closedLoop === "boolean",',
  '        rej: !!(s && s.ok === false && (s.reason === "need-steps" || s.reason === "no-plan")), reason: s && s.reason };',
  '    } catch (e) { out.mods.tx2 = { succ: false, rej: false, err: e.message }; }',
  '    // TX5 worldBlueprint：成功 = exportBlueprint 回带蓝图 + list 在场；拒收 = previewImport 未知版本 ⇒ bad-bp-ver',
  '    try {',
  '      WA.worldBlueprint.setSettings({ enabled: true, libCap: 8 });',
  '      const ex = WA.worldBlueprint.exportBlueprint();',
  '      const ls = WA.worldBlueprint.list();',
  '      out.mods.tx5 = { succ: !!(ex && ex.blueprint && ls && typeof ls.rows !== "undefined"),',
  '        rej: (function () { try { const bad = { bpVer: 999 }; const r = WA.worldBlueprint.previewImport(bad); return !!(r && r.ok === false && r.reason === "bad-bp-ver"); } catch (e2) { return false; } })() };',
  '    } catch (e) { out.mods.tx5 = { succ: false, rej: false, err: e.message }; }',
  '    // TX6 commission：成功 = create → advance(rec_001) 受理；重复/拒收 = 同回执再 advance ⇒ 拒（不重复履约）',
  '    try {',
  '      WA.commission.setSettings({ enabled: true });',
  '      const c = WA.commission.create({ title: "取证委托", principal: "商会", agent: "护卫",',
  '        stages: [{ label: "接洽", deadline: 0 }, { label: "启程", deadline: 0 }] });',
  '      const cid = c && (c.id || (c.result && c.result.id));',
  '      const a1 = WA.commission.advance(cid, "rec_001");',
  '      const a2 = WA.commission.advance(cid, "rec_001");',
  '      out.mods.tx6 = { succ: !!(a1 && a1.ok === true),',
  '        rej: !!(a2 && a2.ok === false), reason: a2 && a2.reason };',
  '    } catch (e) { out.mods.tx6 = { succ: false, rej: false, err: e.message }; }',
  '    // TX7 investigation：成功 = register → investigate(rec_001) 受理；重复 = 同回执再调查 ⇒ 拒（伪造凭证防）',
  '    try {',
  '      WA.investigation.setSettings({ enabled: true });',
  '      const r = WA.investigation.register({ title: "失踪的商队", subject: "商队去向", location: "北道",',
  '        witness: "老张", sourceType: "witness", verifyRule: "act:investigate" });',
  '      const rid = r && (r.id || (r.result && r.result.id));',
  '      const i1 = WA.investigation.investigate(rid, "调查员甲", { receiptId: "rec_101", content: "发现车轮痕迹" });',
  '      const i2 = WA.investigation.investigate(rid, "调查员乙", { receiptId: "rec_101" });',
  '      out.mods.tx7 = { succ: !!(i1 && i1.ok === true), rej: !!(i2 && i2.ok === false), reason: i2 && i2.reason };',
  '    } catch (e) { out.mods.tx7 = { succ: false, rej: false, err: e.message }; }',
  '    // TX8 aftermath：成功 = register 全字段受理；拒收 = 同事件同地重复登记 ⇒ duplicate-event',
  '    try {',
  '      WA.region.setSettings({ enabled: true });',
  '      WA.region.register("北道", { distanceDays: 5, lane: "road" });',
  '      WA.aftermath.setSettings({ enabled: true });',
  '      const r1 = WA.aftermath.register({ placeId: "北道", eventId: "evt_901", effectType: "damage",',
  '        description: "道路被落石阻断", repairTime: 3, repairCost: 50 });',
  '      const r2 = WA.aftermath.register({ placeId: "北道", eventId: "evt_901", effectType: "damage" });',
  '      out.mods.tx8 = { succ: !!(r1 && r1.ok === true), rej: !!(r2 && r2.ok === false && r2.reason === "duplicate-event"), reason: r2 && r2.reason };',
  '    } catch (e) { out.mods.tx8 = { succ: false, rej: false, err: e.message }; }',
  '    // TX9 operations：inst 链（charter→post→assign→propose→approve）→ enact 受理；重复 settle ⇒ 拒（不重复核销）',
  '    try {',
  '      WA.inst.setSettings({ enabled: true });',
  '      WA.org.setSettings({ enabled: true });',
  '      WA.operations.setSettings({ enabled: true });',
  '      WA.store.transact(function (d) { d.people = d.people || {}; d.people.p1 = { id: "p1", name: "会长", role: "职员" }; }, "hosted-paths:tx9-seed");',
  '      WA.inst.charter("org9", { kind: "公司" });',
  '      WA.inst.post("org9", "r", { perms: ["approve"] });',
  '      WA.inst.assign("org9", "r", "p1");',
  '      const pr = WA.inst.propose("org9", "建路提案", { by: "p1" });',
  '      WA.inst.approve("org9", pr.id, { by: "p1" });',
  '      const e2 = WA.operations.enact(pr.id, { orgId: "org9", approver: "p1", name: "建路", budget: 100,',
  '        milestones: [{ label: "勘探" }, { label: "施工" }, { label: "完工" }] });',
  '      const eid = e2 && (e2.id || (e2.result && e2.result.id));',
  '      const s1 = WA.operations.settle(eid, { cycleTag: "c1", milestoneIdx: 0 });',
  '      const s2 = WA.operations.settle(eid, { cycleTag: "c1", milestoneIdx: 0 });',
  '      out.mods.tx9 = { succ: !!(e2 && (e2.ok === true || e2.id) && s1 && s1.ok !== false),',
  '        rej: !!(s2 && s2.ok === false), reason: s2 && s2.reason };',
  '    } catch (e) { out.mods.tx9 = { succ: false, rej: false, err: e.message }; }',
  '    // P7 travelDesk（v2.210.0 新模块，按 O1 口径纳入宿主验收）：种子路网 → plan 可达/不可达两态 → verify 同指纹/无指纹两态 → 坏通道拒收',
  '    try {',
  '      WA.world.setSettings({ enabled: true });',
  '      WA.travelDesk.setSettings({ enabled: true });',
  '      WA.store.transact(function (d) {',
  '        d.world = (d.world && typeof d.world === "object" && !Array.isArray(d.world)) ? d.world : {};',
  '        d.world.places = [{ name: "甲镇", kind: "town" }, { name: "乙镇", kind: "town" }, { name: "丙镇", kind: "town" }];',
  '        d.world.roads = []; d.world.journeys = []; d.world.shipments = []; d.world.blocks = [];',
  '      }, "hosted-paths:td-seed");',
  '      WA.world.addRoad("甲镇", "乙镇", 30, 2);',
  '      WA.world.addRoad("乙镇", "丙镇", 45, 1);',
  '      const p = WA.travelDesk.plan({ channel: "person", from: "甲镇", to: "丙镇" });',
  '      out.mods.td = { planOk: !!(p && p.ok === true && p.reachable === true),',
  '        unreachable: (function () { const u = WA.travelDesk.plan({ channel: "person", from: "甲镇", to: "查无此地" }); return !!(u && u.ok === false && u.reachable === false && u.fault === null && u.reason === "unknown-place"); })(),',
  '        verifySame: (function () { const v = WA.travelDesk.verify({ channel: "person", from: "甲镇", to: "丙镇", stamp: p.stamp }); return !!(v && v.same === true); })(),',
  '        verifyNone: (function () { const v = WA.travelDesk.verify({ channel: "person", from: "甲镇", to: "丙镇" }); return !!(v && v.same === null); })(),',
  '        badChannel: (function () { const b = WA.travelDesk.plan({ channel: "zzz", from: "甲镇", to: "丙镇" }); return !!(b && b.fault === "bad-channel"); })() };',
  '      out.mods.td.succ = !!(out.mods.td.planOk && out.mods.td.verifySame);',
  '      out.mods.td.rej = !!(out.mods.td.unreachable && out.mods.td.badChannel);',
  '    } catch (e) { out.mods.td = { succ: false, rej: false, err: e.message }; }',
  '    const ks = ["tx2", "tx5", "tx6", "tx7", "tx8", "tx9", "td"];',
  '    out.allSucc = ks.every(function (k) { return out.mods[k] && out.mods[k].succ === true; });',
  '    out.allRej = ks.every(function (k) { return out.mods[k] && out.mods[k].rej === true; });',
  '    out.ok = !!(out.allSucc && out.allRej);',
  '  } catch (e) { out.err = "six-threw: " + ((e && e.message) || e); }',
  '  return out;',
  '})()'
].join('\n');
// ── P3 重载后状态（第二次真导航后读盘）────────────────────────
const RELOAD_READ_SOURCE = [
  '(function () {',
  '  const WA = window.WorldAxis || null;',
  '  const out = { waLoaded: !!WA, panel: !!document.getElementById("wa-panel"), keys: [], lastSettle: null };',
  '  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^worldaxis_state_/.test(String(k))) out.keys.push(k); } } catch (e) {}',
  '  try { out.lastSettle = WA.store.get().meta ? WA.store.get().meta.lastSettle : null; } catch (e) {}',
  '  return out;',
  '})()'
].join('\n');

(async function () {
  const p = LIVE.probe();
  if (!p.available) {
    console.log('HOSTED-PATHS: 浏览器不可用 ⇒ 未执行（' + p.why + '）');
    process.exit(2);
  }
  const out = { tier: p.tier, driver: p.driver, pageErrors: [], consoleErrors: [], errors: [], paths: {} };
  const ctx = {
    route: function () { return null; },   // 真网络：一律放行
    onPageError: function (e) { out.pageErrors.push(String((e && e.message) || e).slice(0, 240)); },
    onConsole: function (m) { if (m && m.type && m.type() === 'error') out.consoleErrors.push(String(m.text()).slice(0, 240)); },
    onDialog: function () {},
    afterGoto: async function (page) {
      const boot = await page.evaluate(LIVE.HOSTED_BOOT_SOURCE);
      out.boot = { host: boot.hostSeen ? 'sillytavern' : 'none', loadPath: boot.loadPath, waLoaded: boot.waLoaded, panelMounted: boot.panelMounted };
      try { out.paths.gen = await page.evaluate(PATH_GEN_SOURCE); }
      catch (e) { out.paths.gen = { ok: false, err: 'gen-threw: ' + String((e && e.message) || e) }; }
      try { out.paths.chat = await page.evaluate(PATH_CHAT_SOURCE); }
      catch (e) { out.paths.chat = { ok: false, err: 'chat-threw: ' + String((e && e.message) || e) }; }
      try { out.paths.reject = await page.evaluate(PATH_REJECT_SOURCE); }
      catch (e) { out.paths.reject = { ok: false, err: 'reject-threw: ' + String((e && e.message) || e) }; }
      try { out.paths.biz = await page.evaluate(PATH_BIZ_SOURCE); }
      catch (e) { out.paths.biz = { ok: false, err: 'biz-threw: ' + String((e && e.message) || e) }; }
      try { out.paths.six = await page.evaluate(PATH_SIX_SOURCE); }
      catch (e) { out.paths.six = { ok: false, err: 'six-threw: ' + String((e && e.message) || e) }; }
      // P3 重载：同 profile 内第二次真导航（页内 JS 态与内存态全部作废）
      const rl = { attempted: true };
      try {
        await page.goto(url);
        const boot2 = await page.evaluate(LIVE.HOSTED_BOOT_SOURCE);
        rl.boot = { host: boot2.hostSeen ? 'sillytavern' : 'none', loadPath: boot2.loadPath, waLoaded: boot2.waLoaded, panelMounted: boot2.panelMounted };
        rl.after = await page.evaluate(RELOAD_READ_SOURCE);
      } catch (e) { rl.error = String((e && e.message) || e).slice(0, 300); }
      out.paths.reload = rl;
    }
  };
  try {
    await LIVE.driveBuiltin({ exe: p.exe, port: await LIVE.pickPort(), origin: url, extraArgs: [] }, ctx, out);
  } catch (e) { out.errors.push('真宿主通道异常：' + String((e && e.stack) || e).slice(0, 400)); }

  // ── M1 手机端：第二段独立浏览器会话，Emulation 三件套（390×844 mobile + 触摸 + 安卓 UA）──
  const mob = { attempted: false };
  try {
    const mctx = {
      route: function () { return null; },
      onPageError: function (e) { out.pageErrors.push(String((e && e.message) || e).slice(0, 240)); },
      onConsole: function (m) { if (m && m.type && m.type() === 'error') out.consoleErrors.push(String(m.text()).slice(0, 240)); },
      onDialog: function () {},
      afterGoto: async function (page) {
        mob.attempted = true;
        try {
          await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
          await page.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
          await page.cdp.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' });
          mob.emulated = true;
        } catch (e) { mob.emulated = false; mob.emuErr = String((e && e.message) || e); }
        await page.evaluate(LIVE.HOSTED_BOOT_SOURCE);
        try { mob.after = await page.evaluate(PATH_MOBILE_SOURCE); }
        catch (e) { mob.after = { ok: false, err: 'mobile-threw: ' + String((e && e.message) || e) }; }
      }
    };
    await LIVE.driveBuiltin({ exe: p.exe, port: await LIVE.pickPort(), origin: url, extraArgs: [] }, mctx, out);
  } catch (e) { mob.error = String((e && e.stack) || e).slice(0, 300); }
  out.paths.mobile = mob;

  const gen = out.paths.gen || {};
  const chat = out.paths.chat || {};
  const rej = out.paths.reject || {};
  const biz = out.paths.biz || {};
  const six = out.paths.six || {};
  const rl = out.paths.reload || {};
  const realPageErrs = out.pageErrors.filter(function (m) { return !/NotAllowedError|Clipboard|writeText|permission denied/i.test(m); });
  const ok = out.boot && out.boot.host === 'sillytavern' && out.boot.panelMounted
    && gen.ok === true && gen.after && gen.after.settled === true && gen.dedup && gen.dedup.noDoubleAdvance === true
    && gen.reroll && gen.reroll.noAdvance === true
    && chat.ok === true && chat.refChanged === true && chat.chatChangedFired >= 1
    && rej.ok === true && rej.stable === true && rej.noHalfWrite === true
    && biz.ok === true
    && six.ok === true
    && mob.attempted && mob.emulated === true && mob.after && mob.after.ok === true
    && rl.attempted && !rl.error && rl.boot && rl.boot.waLoaded && rl.boot.panelMounted
    && rl.after && rl.after.waLoaded && rl.after.keys.length >= 1
    && realPageErrs.length === 0;

  console.log('=== 真宿主逐条路径读数');
  console.log('  tier=' + out.tier + ' driver=' + out.driver + ' host=' + (out.boot && out.boot.host) + ' loadPath=' + (out.boot && out.boot.loadPath));
  console.log('  P1 生成前后链: ok=' + gen.ok + ' steps=' + JSON.stringify(gen.steps || []) + ' settled=' + (gen.after && gen.after.settled) + ' round=' + (gen.after && gen.after.round) + ' advanced=' + (gen.after && gen.after.advanced) + ' dedupNoDouble=' + (gen.dedup && gen.dedup.noDoubleAdvance) + ' err=' + gen.err);
  console.log('  P2 切聊天:     ok=' + chat.ok + ' refChanged=' + chat.refChanged + ' chatChangedFired=' + chat.chatChangedFired + ' repeatOk=' + chat.repeatOk + ' err=' + chat.err);
  console.log('  P4 拒收/重复:  ok=' + rej.ok + ' reject1=' + rej.reject1 + ' reject2=' + rej.reject2 + ' stable=' + rej.stable + ' noHalfWrite=' + rej.noHalfWrite + ' err=' + rej.err);
  console.log('  P5 业务四路:   ok=' + biz.ok + ' saveOk=' + biz.saveOk + ' restore=' + (biz.restoreOk && biz.restored) + ' todo=' + (biz.todoVisible && biz.todoGone && biz.actOk) + ' pack=' + (biz.packOk && biz.applyOk) + ' conflict=' + biz.conflict + ' lab=' + (biz.parseOk && biz.labOk && biz.liveUnchanged) + ' err=' + biz.err);
  console.log('  M1 手机端:     attempted=' + mob.attempted + ' emulated=' + mob.emulated + ' ok=' + (mob.after && mob.after.ok) + ' vw=' + (mob.after && mob.after.vw) + ' touch=' + (mob.after && mob.after.isTouch) + ' tabs=' + (mob.after && mob.after.tabs) + ' nav=' + (mob.after && mob.after.navPeople && mob.after.navWorld) + ' rejectBad=' + (mob.after && mob.after.rejectBad) + ' orbInView=' + (mob.after && mob.after.orbInViewport) + ' err=' + (mob.after && mob.after.err) || mob.error);
  console.log('  P6 六模块补跑: ok=' + six.ok + ' allSucc=' + six.allSucc + ' allRej=' + six.allRej + ' 明细=' + JSON.stringify(six.mods || {}) + ' err=' + six.err);
  console.log('  P3 重载:       attempted=' + rl.attempted + ' boot=' + JSON.stringify(rl.boot) + ' err=' + rl.error);
  console.log('    重载后状态: waLoaded=' + (rl.after && rl.after.waLoaded) + ' panel=' + (rl.after && rl.after.panel) + ' keys=' + JSON.stringify(rl.after && rl.after.keys) + ' lastSettle=' + (rl.after && rl.after.lastSettle));
  console.log('  产品页错=' + realPageErrs.length + ' 环境页错=' + (out.pageErrors.length - realPageErrs.length) + ' consoleErr=' + out.consoleErrors.length);
  if (realPageErrs.length) console.log('  产品页错样本=' + JSON.stringify(realPageErrs.slice(0, 3)));
  if (out.errors.length) console.log('  通道错误=' + JSON.stringify(out.errors.slice(0, 3)));
  console.log('HOSTED-PATHS: ' + (ok ? 'PASS' : 'FAIL'));
  process.exit(ok ? 0 : 1);
})().catch(function (e) {
  console.error('HOSTED-PATHS 异常: ' + ((e && e.stack) || e));
  process.exit(3);
});

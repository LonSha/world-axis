// WorldAxis tests/q7-idempotent-floor-v2216.js — v2.216.0（优化计划 Q7：幂等真源不得当日志回收）
//
// 【它治的病：幂等账与普通历史共用一套回收策略】
//   计划 Q7 原文：「按热点优化复制序列化、读集、缓存失效、分片和历史回收。
//   **未完成义务及幂等账不能被当日志回收**」。
//   在途保护（core/evict.js IN_TRANSIT，v2.162.0 TP7）治的是**前一半**
//   （world.shipments / messages / journeys / farfield.pending / collab.queue / liaison.deals
//    的未完成行不被静默挤出）；**后一半（幂等账）此前一行治理都没有**。
//
//   现场实证（/tmp/q7/probe_cap.cjs、/tmp/q7/probe_dup.cjs，逐条写进本文件判据）：
//     ① `acts.res`（行动结算回执台账，**去重真源**：同 opId 不重复扣费）的上限
//        挂在 **`maxActs`** 上——那是并行行动容量，与之语义无关。实测 `maxActs: 1`
//        ⇒ 幂等台账只剩 1 条（`{ok:true, dropped:9, before:10, after:1}`）。
//     ② `events.res`（事件回执台账，去重真源：同一笔不二次结算）的上限挂在 `maxFails`
//        上——那是失败重试容量。把重试旋钮拧小，去重凭据跟着变短。
//     ③ `commit.receipts` 满 64 之后最早的 opId 回执被环形挤掉，`begin('op1')` 重新放行
//        （实测 `BEGIN op1 AGAIN => {ok:true}`）——「这一笔做过没有」在长局里退化成
//        「没做过」。这不是理论风险，是本仓最贵的那一类静默失效：**重复执行看起来像正常执行**。
//
// 【本版口径：四条】
//   ① **不新增第二套回收真源**：SITES（环形站点）/ NON_EVICT（写入侧硬上界）/
//      IN_TRANSIT（在途按行豁免）三表一字不动，只在挤出侧**增一张下限声明表**
//      （IDEMPOTENT），并把落点收进**同一个** `applyIdempotentFloor()`。
//   ② **只抬不猜**：调用方给的 cap 低于下限期时抬到下限；高于等于时**逐字不动**
//      —— 默认配置下行为与本版之前完全一致（既有契约零改动，B1/B2 钉这件事）。
//   ③ **保护生效不是实现缺陷**：抬升进 `evictStat().floorRaised` / `lastFloorRaise`，
//      **不进** `evictFailed` / `failedBy` —— 混进去会让「挤出器坏了」与「世界满了/被保护」
//      在诊断上长得一样（与 TP7 的 live 读数同口径）。
//   ④ **登记面漂移必须可判**：`idempotentDecls()` 每条带 `inSites`，容量审计把
//      `inSites=false` 的条目列进 `idempotentDrifted` —— 写了保护却不在挤出站点表上
//      ⇒ 保护永不生效（本版实测抓到过一条：注册表用了 state path 而非站点名）。
//
// 【正向】
//   A1 声明面：IDEMPOTENT 六条、`idempotentDecls()` 每条带 floor/why/inSites
//   A2 消费面：`capacityAudit.reclaimable()` 把幂等真源**独立成栏**（不并进 ring/nonEvict）
//   A3 面板面：`ui/panel.js`「可回收」栏按**真源键**渲染（此前读 r.reclaimable/r.protected
//      两个不存在的键 ⇒ 恒报「无」；迁移预检栏读 findings/schemaVersion/topKeys 同理）
//   B1 per-call 幂等站点低于下限 ⇒ 抬到下限（acts.res / events.res）
//   B2 高于等于下限 ⇒ 逐字不动（不抬、不记账）
//   B3 非幂等站点（people.profile 一类）不受影响（不上抬）
//   B4 抬升记账进 floorRaised/lastFloorRaise，**不进** evictFailed/failedBy
//   B5 static 站点（commit.receipts）的 cap 与 LIMITS.RECEIPTS 同源（不受旋钮影响）
//   B6 端到端：行动结算回执被保护 ⇒ 同 opId 重放仍判 duplicate-receipt
//   B7 只读：读 reclaimable / idempotentDecls 前后存档逐字节不变
//   B8 关掉的容量审计仍拒算（开关是活的）
// 【负控】N1 破坏下限表 ⇒ 幂等账退回被旋钮砍（真源码内存副本，两向自证）
//   N2 破坏抬升落点（array 里不过 applyIdempotentFloor）⇒ 下限失效
//   N3 破坏 inSites 判定 ⇒ 漂移条目被静默藏起
//   N4 原版上同判据全绿（两向自证，防恒绿）
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const gate = require('./ui-gate-sync.js');
const REL_EVICT = 'core/evict.js';
const REL_CA = 'engines/capacity-audit.js';
const REL_PANEL = 'ui/panel.js';
const REL_RUN = 'tests/run.js';

function srcOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function countOcc(s, sub) { return s.split(sub).length - 1; }
// 真装载（含 core/evict.js 与 engines/capacity-audit.js）；files 留空以免重复装 ui/*
function fresh(srcOverride) {
  return gate.fresh({ files: [], srcOverride: srcOverride || {} }).WA;
}
function jev(WA) { return WA.evict.evictStat(); }

// ── 正向 ─────────────────────────────────────────────────────────────────
function runA(a) {
  const ev = srcOf(REL_EVICT);
  a(countOcc(ev, 'const IDEMPOTENT = {') === 1, 'Q7 A1a: 幂等下限表在真源码中声明恰 1 次');
  ['commit.receipts', 'acts.res', 'events.res', 'liaison.evidence', 'coop.archive', 'phoneBridge.ops']
    .forEach(function (k) {
      a(countOcc(ev, "'" + k + "':") >= 1, 'Q7 A1b: 下限表含 ' + k);
    });
  a(/function applyIdempotentFloor\s*\(site, cap\)/.test(ev), 'Q7 A1c: 抬升落点收进单一实现 applyIdempotentFloor');
  a(countOcc(ev, 'applyIdempotentFloor(site, limit)') === 1, 'Q7 A1d: array() 的 per-call 分支**只有一处**调它（撞车 ⇒ 改一处不改另一处）');
  const WA = fresh();
  const decls = WA.evict.idempotentDecls();
  a(decls && typeof decls === 'object' && Object.keys(decls).length === 6,
    'Q7 A1e: idempotentDecls 六条（实 ' + Object.keys(decls || {}).length + '）');
  a(Object.keys(decls).every(function (k) {
    return typeof decls[k].floor === 'number' && decls[k].floor > 0
      && typeof decls[k].why === 'string' && decls[k].why.length > 10
      && decls[k].inSites === true;
  }), 'Q7 A1f: 每条带 floor / why / inSites=true（写了保护就必须在挤出站点表上）');

  const ca = srcOf(REL_CA);
  a(ca.indexOf('idempotentDecls') > 0, 'Q7 A2a: 容量审计消费 evict.idempotentDecls（真实消费者）');
  a(/idempotent: idemRows/.test(ca) && /idempotentCount/.test(ca),
    'Q7 A2b: reclaimable() 返回体带幂等栏与计数');
  a(/idempotentDrifted/.test(ca), 'Q7 A2c: 登记面漂移单独成栏（inSites=false 不静默）');
  a(countOcc(ca, 'idemRows') >= 3, 'Q7 A2d: 幂等栏真接进返回体（不是只声明不用）');

  const pn = srcOf(REL_PANEL);
  a(pn.indexOf("r.idempotent") > 0, 'Q7 A3a: 面板消费 r.idempotent（幂等真源栏）');
  a(pn.indexOf('r.reclaimable') < 0 && !/r\.protected\b/.test(pn),
    'Q7 A3b: 面板不再读**不存在的键** r.reclaimable / r.protected（此前恒报「无」）'
    + '；注：`r.protectedRows` 是离线引擎真字段，`\\b` 词界不误伤（实 '
    + (pn.indexOf('r.reclaimable') < 0 ? '无 r.reclaimable' : '仍读 r.reclaimable')
    + ' / ' + (/r\.protected\b/.test(pn) ? '仍读 r.protected' : '无 r.protected') + '）');
  a(pn.indexOf('r.ring') > 0 && pn.indexOf('r.nonEvict') > 0,
    'Q7 A3b2: 面板可回收栏按**真源三栏**渲染（r.ring / r.nonEvict / r.idempotent 都在读）');
  a(pn.indexOf('r.findings') < 0 && pn.indexOf('r.schemaVersion') < 0 && pn.indexOf('r.topKeys') < 0,
    'Q7 A3c: 迁移栏不再读不存在的 findings/schemaVersion/topKeys');
  a(pn.indexOf('r.codeSchema') > 0 && pn.indexOf('r.direction') > 0,
    'Q7 A3d: 迁移栏按**真源键**渲染（codeSchema/stateSchema/direction/plan）');
}

function runB(a) {
  // B1 per-call 幂等站点低于下限 ⇒ 抬到下限
  const WA = fresh();
  const mk = function (n) { const r = []; for (let i = 0; i < n; i++) r.push(i); return r; };
  const arr1 = mk(10);
  const e1 = WA.evict.array(arr1, 'acts.res', 1);
  a(e1.ok === true && arr1.length === 8,
    'Q7 B1a: acts.res cap=1 ⇒ 抬到下限 8（实保留 ' + arr1.length + '，dropped ' + e1.dropped + '）');
  const arr2 = mk(30);
  const e2 = WA.evict.array(arr2, 'events.res', 2);
  a(e2.ok === true && arr2.length === 12,
    'Q7 B1b: events.res cap=2 ⇒ 抬到下限 12（实保留 ' + arr2.length + '）');

  // B2 高于等于下限 ⇒ 逐字不动（既有契约零改动）
  const WA2 = fresh();
  const arr3 = mk(30);
  const e3 = WA2.evict.array(arr3, 'acts.res', 8);
  a(e3.ok === true && arr3.length === 8, 'Q7 B2a: cap=下限 ⇒ 逐字不动（保留 8）');
  const arr4 = mk(30);
  const e4 = WA2.evict.array(arr4, 'acts.res', 20);
  a(e4.ok === true && arr4.length === 20, 'Q7 B2b: cap>下限 ⇒ 逐字不动（保留 20，不抬）');
  a(jev(WA2).floorRaised === 0, 'Q7 B2c: 不抬时 floorRaised 不计数（实 ' + jev(WA2).floorRaised + '）');

  // B3 非幂等站点不受影响
  const WA3 = fresh();
  const arr5 = mk(30);
  const e5 = WA3.evict.array(arr5, 'beatLedger.rows', 3);
  a(e5.ok === true && arr5.length === 3, 'Q7 B3: 非幂等站点（beatLedger.rows cap=3）不抬（保留 ' + arr5.length + '）');
  a(jev(WA3).floorRaised === 0, 'Q7 B3b: 非幂等站点不产生抬升记账');

  // B4 抬升进自己的读数，不进 failedBy
  const WA4 = fresh();
  WA4.evict.resetEvictStat();
  const arr6 = mk(40);
  WA4.evict.array(arr6, 'acts.res', 1);
  const st = jev(WA4);
  a(st.floorRaised === 1 && st.lastFloorRaise && st.lastFloorRaise.site === 'acts.res'
    && st.lastFloorRaise.from === 1 && st.lastFloorRaise.to === 8,
    'Q7 B4a: floorRaised=1 且 lastFloorRaise 记 from/to（实 ' + JSON.stringify(st.lastFloorRaise) + '）');
  a(st.evictFailed === 0 && Object.keys(st.failedBy).length === 0,
    'Q7 B4b: 抬升**不进** evictFailed/failedBy（保护生效 ≠ 实现缺陷）');
  a(st.idempotent && Object.keys(st.idempotent).length === 6, 'Q7 B4c: evictStat 带幂等声明面（与在途读数分域）');

  // B5 static 站点 cap 与 LIMITS.RECEIPTS 同源
  const WA5 = fresh();
  const d5 = WA5.evict.siteDecls();
  a(d5['commit.receipts'] && d5['commit.receipts'].cap === 64,
    'Q7 B5a: commit.receipts 的 cap=64（不受任何设置旋钮影响）');
  const arr7 = mk(200);
  for (let i = 0; i < 200; i++) arr7[i] = { opId: 'x' + i };
  const e7 = WA5.evict.array(arr7, 'commit.receipts');
  a(e7.ok === true && arr7.length === 64, 'Q7 B5b: commit.receipts 真截断到 64（实 ' + arr7.length + '）');

  // B6 端到端：行动结算回执被保护 ⇒ 长局退场后同 opId 仍判 duplicate（含 archived 面）
  //   原判据只查「maxActs=1 时 acts.res 仍保 8 条」，把幂等**下限**当成了幂等**闭环**：
  //   cap=8 只是「旋钮拧不到下限以下」，而长局里第 9 笔起仍会环形退场 —— 那时
  //   「这一笔做过没有」若只查完整回执，就会重新放行（本仓最贵的一类静默失效）。
  //   故本判据走真链路（add → admit → advance）跑到第 10 笔，钉三件事：
  //     ① 第 1 笔（op0）的完整回执已退场（不在 res 里）；
  //     ② 但凭据落在摘要台账（acts.digests）；
  //     ③ 同 opId 重放仍判 duplicate-receipt，且带 archived:true（可判「做过、只是回执归档了」）。
  const WA6 = fresh();
  WA6.act.setSettings({ enabled: true, maxActs: 8, maxRun: 12, defaultDurationMs: 1000 });
  WA6.store.transact(function (d) {
    d.people = { p_甲: { id: 'p_甲', name: '甲', knowledge: {}, resources: {},
      life: { goals: [{ id: 'g_甲', text: '测试目标', status: 'active' }], schedule: [] } } };
    d.acts = { rows: [], res: [], digests: {} };
  });
  const tb6 = Date.now();
  // 注：不冻结时钟 —— act 的行 id 是 `act_<now>_<rows.length>`，而 rows 有界（cap=maxActs）后
  //   `rows.length` 会回落，冻结时钟会让第 9 笔起与第 1 笔**撞 id**（既有 id 生成形态的弱点，
  //   与 Q7 无关）。真实时钟逐毫秒递增即可避开；wait 类不经 world，无需冻结决策时钟。
  let b6Fail = '';
  for (let i = 0; i < 10; i++) {
    const ti = tb6 + i * 37;
    const a6 = WA6.act.add('甲', { kind: 'wait', text: '待着', goalId: 'g_甲', opId: 'op' + i, duration: 1000 });
    if (!a6.ok) { b6Fail = 'add:' + i + ':' + a6.reason; break; }
    const ad6 = WA6.act.admit(a6.id, ti);
    if (!ad6.ok) { b6Fail = 'admit:' + i + ':' + ad6.reason; break; }
    WA6.act.advance(ti + 5000);
  }
  const acts6 = WA6.store.get().acts;
  const kept6 = acts6.res.map(function (x) { return x.opId; });
  const dig6 = Object.keys(acts6.digests || {}).map(function (k) { return acts6.digests[k].opId; });
  a(!b6Fail, 'Q7 B6a: 十笔真链路（add→admit→advance）全部成立（实 ' + (b6Fail || 'ok') + '）');
  a(kept6.indexOf('op0') < 0 && dig6.indexOf('op0') >= 0 && kept6.length === 8,
    'Q7 B6b: 第 1 笔完整回执已退场、凭据落进摘要台账（res ' + kept6.join(',') + ' / digests ' + dig6.join(',') + '）');
  const dup6 = WA6.act.add('甲', { kind: 'wait', text: '待着', goalId: 'g_甲', opId: 'op0', duration: 1000 });
  a(dup6.ok === false && dup6.reason === 'duplicate-receipt' && dup6.archived === true && dup6.on === 'archived',
    'Q7 B6c: 回执已退场的同 opId 重放仍判 duplicate-receipt 且带 archived:true（实 ' + JSON.stringify(dup6) + '）');
  const dup6b = WA6.act.add('甲', { kind: 'wait', text: '待着', goalId: 'g_甲', opId: 'op9', duration: 1000 });
  a(dup6b.ok === false && dup6b.reason === 'duplicate-receipt' && !dup6b.archived,
    'Q7 B6d: 完整回执仍在册的同 opId 重放仍判 duplicate-receipt（不带 archived，实 ' + JSON.stringify(dup6b) + '）');
  a(WA6.act.stat().archived === 1 && WA6.act.stat().digestCollision === 0,
    'Q7 B6e: archived 进自己的读数栏（实 ' + WA6.act.stat().archived + '）且零碰撞');

  // B7 只读
  const WA7 = fresh();
  WA7.capacityAudit.setSettings({ enabled: true });
  const z1 = JSON.stringify(WA7.store.get());
  WA7.capacityAudit.reclaimable();
  WA7.evict.idempotentDecls();
  WA7.evict.evictStat();
  const z2 = JSON.stringify(WA7.store.get());
  a(z1 === z2, 'Q7 B7: 读幂等声明面与可回收面**零写入**（存档逐字节不变）');

  // B8 关掉仍拒算
  const WA8 = fresh();
  WA8.capacityAudit.setSettings({ enabled: false });
  a(WA8.capacityAudit.reclaimable().ok === false, 'Q7 B8: 容量审计关着 ⇒ reclaimable 仍拒算（开关是活的）');

  // A2 消费面：reclaimable 真带幂等栏 + 漂移检测
  const WA9 = fresh();
  WA9.capacityAudit.setSettings({ enabled: true });
  const rc = WA9.capacityAudit.reclaimable();
  a(rc.ok === true && Array.isArray(rc.idempotent) && rc.idempotent.length === 6,
    'Q7 A2e: reclaimable().idempotent 六条（实 ' + ((rc.idempotent || []).length) + '）');
  a(Array.isArray(rc.idempotentDrifted) && rc.idempotentDrifted.length === 0,
    'Q7 A2f: 当前零漂移（每条都在挤出站点表上）');
  a(rc.note.indexOf('幂等真源') > 0, 'Q7 A2g: 分栏口径写在返回体的 note 里');
  a(Array.isArray(rc.ring) && rc.ringCount === rc.ring.length && rc.ringCount > 100,
    'Q7 A2h: 环形站点栏未被破坏（实 ' + rc.ringCount + ' 条）');
}

// ── 负控：真源码内存副本破坏 → 重跑同款真判据 ─────────────────────────────
function brokenEvict(from, to) {
  const src = srcOf(REL_EVICT);
  const hits = countOcc(src, from);
  if (hits !== 1) throw new Error('anchor hits ' + hits + ' :: ' + from.slice(0, 60));
  return { src: src.split(from).join(to), hits: hits };
}
function withEvict(srcOv, fn) {
  const WA = fresh({ [REL_EVICT]: srcOv });
  return fn(WA);
}
function runNegative(a) {
  const ORIG = srcOf(REL_EVICT);
  const mk = function (n) { const r = []; for (let i = 0; i < n; i++) r.push(i); return r; };

  // N1 破坏下限表（把 acts.res 下限压到 0 等效于「没有下限」）⇒ 幂等账退回被旋钮砍
  const A_FLOOR = "    'acts.res':         { floor: 8, why: '行动结算回执（去重真源：同 opId 不重复扣费。上限此前挂在 maxActs=并行行动容量 上，语义无关）' },";
  let b1 = null;
  try { b1 = brokenEvict(A_FLOOR, "    'acts.res':         { floor: 0, why: 'x' },"); } catch (e) { b1 = null; }
  a(b1 !== null, 'Q7 N1a: 下限表锚点恰中 1 次（可破坏）');
  if (b1) {
    const got = withEvict(b1.src, function (WA) { const r = mk(10); WA.evict.array(r, 'acts.res', 1); return r.length; });
    a(got !== 8, 'Q7 N1b: 破坏下限 ⇒ 幂等账退回被旋钮砍（破坏后实得 ' + got + '，原版为 8）');
  }

  // N2 破坏抬升落点：array() 里不再过 applyIdempotentFloor
  const A_CALL = '      cap = applyIdempotentFloor(site, limit).cap;';
  let b2 = null;
  try { b2 = brokenEvict(A_CALL, '      cap = limit;'); } catch (e) { b2 = null; }
  a(b2 !== null, 'Q7 N2a: 抬升落点锚点恰中 1 次');
  if (b2) {
    const got = withEvict(b2.src, function (WA) { const r = mk(10); WA.evict.array(r, 'acts.res', 1); return r.length; });
    a(got !== 8, 'Q7 N2b: 破坏抬升落点 ⇒ 下限失效（破坏后实得 ' + got + '，原版为 8）');
    // 两向：破坏版上「非幂等站点不受影响」仍成立（证明破坏没把整个挤出器打断）
    const got3 = withEvict(b2.src, function (WA) { const r = mk(30); WA.evict.array(r, 'beatLedger.rows', 3); return r.length; });
    a(got3 === 3, 'Q7 N2c: 破坏版上非幂等站点仍逐字不动（破坏是局部的，没把整条挤出链打断）');
  }

  // N3 破坏 inSites 判定 ⇒ 漂移被静默藏起
  const A_INSITES = '        inSites: Object.prototype.hasOwnProperty.call(SITES, k) };';
  let b3 = null;
  try { b3 = brokenEvict(A_INSITES, '        inSites: true };'); } catch (e) { b3 = null; }
  a(b3 !== null, 'Q7 N3a: inSites 判定锚点恰中 1 次');
  if (b3) {
    const got = withEvict(b3.src, function (WA) {
      WA.capacityAudit.setSettings({ enabled: true });
      const d = WA.evict.idempotentDecls();
      // 找一个**真不在** SITES 上的键：这里用「临时改写返回体」不可行，改判「判定函数本身」
      // 是否真读 SITES —— 破坏版恒 true，于是对**任意**键都答 true。
      return d['__nope__'] ? d['__nope__'].inSites : null;
    });
    // 原版：不存在该键 ⇒ null；破坏版也一样（键不存在）。故改判：破坏版对**真缺失**的键也答 true
    const orig = fresh();
    const dd = orig.evict.idempotentDecls();
    a(dd['phoneBridge.ops'] && dd['phoneBridge.ops'].inSites === true,
      'Q7 N3b: （原版）phoneBridge.ops 在挤出站点表上 ⇒ inSites=true（站点名而非 path）');
    void got;
    // 硬度判据：把 inSites 恒真的破坏版与一份**故意错键**的期望对照 —— 判据必须能分辨
    const srcMis = ORIG.replace("'phoneBridge.ops':  { floor: 40", "'__bad_key__':  { floor: 40");
    const WAx = fresh({ [REL_EVICT]: srcMis });
    const dx = WAx.evict.idempotentDecls();
    a(dx['__bad_key__'] && dx['__bad_key__'].inSites === false,
      'Q7 N3c: 错键（不在 SITES 上）被如实标 inSites=false（登记面漂移可判）');
    const WAy = fresh({ [REL_EVICT]: b3.src });
    const dy = WAy.evict.idempotentDecls();
    // v2.216.0 修：原判据只把「恒真判定」装进内存，却没把错键**也**装进去 ——
    //   于是 `dy['__bad_key__']` 恒为 undefined，判据读的是「键不存在」而不是
    //   「破坏后错键被静默标 true」。修法：在**同一个破坏副本**上再做一次错键替换
    //   （两处替换叠加，才构成「判定失效 + 错键」的完整破坏态）。
    const srcBad = b3.src.replace("'phoneBridge.ops':  { floor: 40", "'__bad_key__':  { floor: 40");
    a(srcBad !== b3.src, 'Q7 N3d0: 破坏副本上错键替换真的改变了源码文本');
    const WAz = fresh({ [REL_EVICT]: srcBad });
    const dz = WAz.evict.idempotentDecls();
    a(dz['__bad_key__'] && dz['__bad_key__'].inSites === true,
      'Q7 N3d: 破坏 inSites 判定 ⇒ 错键被**静默标成 true**（漂移检测失效，实 '
      + JSON.stringify(dz['__bad_key__']) + '）');
  }

  // N4 原版两向自证
  const WO = fresh();
  const r0 = mk(10);
  WO.evict.array(r0, 'acts.res', 1);
  a(r0.length === 8, 'Q7 N4a: （纯度和）原版上下限生效（实保留 ' + r0.length + '）');
  const WO2 = fresh();
  const r2 = mk(30);
  WO2.evict.array(r2, 'beatLedger.rows', 3);
  a(r2.length === 3, 'Q7 N4b: （纯度和）原版上非幂等站点不抬');
  a(srcOf(REL_RUN).indexOf('q7-idempotent-floor-v2216.js') > 0,
    'Q7 N4c: 本锁已挂进 tests/run.js（孤儿锁 ⇒ 判据永不执行）');

  // N5 破坏**摘要留痕落点**（act.js 的 writeDigests）⇒ 长局里「做过」重新退化成「没做过」
  //   与 N1/N2 同规格：真源码内存副本 + 原版两向自证。这条是本版最贵的一条 ——
  //   它破坏的不是读数，而是幂等**本身**（回执退场后同一 opId 被重新放行）。
  const ACT = 'engines/act.js';
  const actSrc = srcOf(ACT);
  const A_WD = '    writeDigests(draft, draft.acts.res, cfg);\n';
  a(countOcc(actSrc, A_WD) === 1, 'Q7 N5a: 摘要留痕落点锚点恰中 1 次（可破坏）');
  const actBroken = actSrc.split(A_WD).join('');
  a(actBroken !== actSrc, 'Q7 N5b: 破坏真的改变了 act.js 源码文本');
  const b6probe = function (WA) {
    WA.act.setSettings({ enabled: true, maxActs: 8, maxRun: 12, defaultDurationMs: 1000 });
    WA.store.transact(function (d) {
      d.people = { p_甲: { id: 'p_甲', name: '甲', knowledge: {}, resources: {},
        life: { goals: [{ id: 'g_甲', text: '测试目标', status: 'active' }], schedule: [] } } };
      d.acts = { rows: [], res: [], digests: {} };
    });
    const t = Date.now();
    for (let i = 0; i < 10; i++) {
      const ti = t + i * 37;
      const x = WA.act.add('甲', { kind: 'wait', text: '待着', goalId: 'g_甲', opId: 'op' + i, duration: 1000 });
      if (!x.ok) return 'add:' + x.reason;
      const ad = WA.act.admit(x.id, ti);
      if (!ad.ok) return 'admit:' + ad.reason;
      WA.act.advance(ti + 5000);
    }
    const dup = WA.act.add('甲', { kind: 'wait', text: '待着', goalId: 'g_甲', opId: 'op0', duration: 1000 });
    return (dup.ok === false && dup.reason === 'duplicate-receipt' && dup.archived === true) ? 'archived'
      : (dup.ok === true ? 're-admitted' : ('other:' + dup.reason + '/' + dup.archived));
  };
  const origProbe = b6probe(fresh());
  a(origProbe === 'archived', 'Q7 N5c: （原版）回执退场后同 opId 仍判 archived（实 ' + origProbe + '）');
  const brokenProbe = gate.fresh({ files: [], srcOverride: { [ACT]: actBroken } }).WA;
  const got5 = b6probe(brokenProbe);
  a(got5 !== 'archived', 'Q7 N5d: 破坏摘要留痕 ⇒ 长局里「做过」退化成「没做过」（破坏后实得 '
    + got5 + '，原版为 archived）');
  a(srcOf(ACT) === actSrc, 'Q7 N5e: 被破坏过的文件真源码逐字未变（破坏只发生在内存副本上）');
}

function runAll(a) { runA(a); runB(a); }
module.exports = { runA: runA, runB: runB, runAll: runAll, runNegative: runNegative,
  REL_EVICT: REL_EVICT, REL_CA: REL_CA, REL_PANEL: REL_PANEL, fresh: fresh };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) pass++; else { fail++; console.log('FAIL ' + name); } };
  runAll(a); runNegative(a);
  console.log('\nQ7 idempotent-floor v2216 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}

#!/usr/bin/env node
/**
 * v2.407.0 专锁：三缝收口 + 外部 11 份资料 7 主线（A/B/C/D/E/F/G）
 *
 *  真数据驱动：store.transact 种入真实形态数据，逐引擎断言：
 *   ① reading-bookmark  跨楼层同族复用 / 回退拒绝 / 摘要豁免 / 补读块只点名
 *   ② summarizer-adapter entries+cap 修复 / 出处固定 / 缺区间拒收 / relay 接口
 *   ③ director          六面归一 / 桶 / 冷却顺延 / 压下可见 / 零 store 写
 *   ④ branch-continuity 证据契约 / whole-reject / ClearAll 拒 / 跨族拒 / 恢复
 *   ⑤ fact-continuity   事实分层 / 信息边界 / 经济锚定 / 状态签名 / 注入纪律
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

function runAll(assertFn) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh({});
  const WA = env.WA;
  WA.store.init();
  require(path.join(BASE, 'engines/memory-relay.js'));
  require(path.join(BASE, 'engines/world-reader.js'));
  require(path.join(BASE, 'engines/summarizer-adapter.js'));
  require(path.join(BASE, 'engines/reading-bookmark.js'));
  require(path.join(BASE, 'engines/director.js'));
  require(path.join(BASE, 'engines/branch-continuity.js'));
  require(path.join(BASE, 'engines/fact-continuity.js'));

  let pass = 0, fail = 0;
  const fails = [];
  const a = function (ok, name) {
    if (ok) { pass++; } else { fail++; fails.push(name); }
    if (typeof assertFn === 'function') assertFn(ok, name);
  };
  const src = function (f) { return fs.readFileSync(path.join(BASE, f), 'utf8'); };
  const on = function (mod, patch) {
    if (!WA.settingsBus) { mod.__testEnabled = true; return; }
    try { mod.setSettings(Object.assign({ enabled: true }, patch || {})); } catch (e) {}
  };

  // ── T1：注册 / 默认关闭 / 零写入面（静态契约）──────────────────────
  const mods = {
    'engines/summarizer-adapter.js': 'summarizerAdapter',
    'engines/reading-bookmark.js': 'readingBookmark',
    'engines/director.js': 'director',
    'engines/branch-continuity.js': 'branchContinuity',
    'engines/fact-continuity.js': 'factContinuity'
  };
  Object.keys(mods).forEach(function (f) {
    const ns = mods[f];
    a(!!WA[ns], 'T1 ' + ns + ' 命名空间在位');
    a(src(f).indexOf("registerModule('" + f + "'") >= 0 || src(f).indexOf('registerModule("' + f + '"') >= 0,
      'T1 ' + ns + ' 注册锚在位');
  });
  a(WA.readingBookmark.getSettings().enabled === false, 'T1a 书签默认关闭');
  a(WA.summarizerAdapter.getSettings().enabled === false, 'T1b 适配层默认关闭');
  a(WA.director.getSettings().enabled === false, 'T1c 导演默认关闭');
  a(WA.branchContinuity.getSettings().enabled === false, 'T1d 分支判据默认关闭');
  a(WA.factContinuity.getSettings().enabled === false, 'T1e 事实判据默认关闭');
  // 关闭态：注入面必须空串、写面不动作（零 token / 零副作用）。
  a(WA.readingBookmark.catchUpBlock({ idx: 5, swipe: 0 }) === '', 'T1f 关闭时补读块空串');
  a(WA.summarizerAdapter.buildBlock('current') === '', 'T1g 关闭时摘要块空串');
  a(WA.director.buildBlock() === '', 'T1h 关闭时排期块空串');
  a(WA.branchContinuity.buildBlock() === '', 'T1i 关闭时连续性块空串');
  a(WA.factContinuity.buildBlock() === '', 'T1j 关闭时事实纪律块空串');
  // 只读引擎不得出现真实 store.transact 调用（注释里的「零 store 写」字样不算）。
  const transactCall = /\bWA\.store\.transact\s*\(|\bstore\.transact\s*\(/;
  a(!transactCall.test(src('engines/director.js')), 'T1k 导演零 store 写');
  a(!transactCall.test(src('engines/branch-continuity.js')), 'T1l 分支判据零 store 写');
  a(!transactCall.test(src('engines/fact-continuity.js')), 'T1m 事实判据零 store 写');
  a(!transactCall.test(src('engines/summarizer-adapter.js')), 'T1n 适配层零 store 写');

  // ── T2：三缝① 书签（真数据 + 跨楼层同族复用）──────────────────────
  on(WA.readingBookmark);
  const m1 = WA.readingBookmark.mark({ idx: 3, swipe: 0, hash: 'h3' });
  a(m1.ok === true && m1.outcome === 'new', 'T2a 首次落书签=new');
  a(m1.mark.branch === 's0', 'T2b 行主键是 swipe 族（跨楼层复用，不是锚点键）');
  a(m1.mark.lastAnchorKey === 'm3_s0', 'T2c 锚点出处另行保留供审计');
  const m2 = WA.readingBookmark.mark({ idx: 7, swipe: 0, hash: 'h7' });
  a(m2.ok === true && m2.outcome === 'advanced' && m2.mark.idx === 7, 'T2d 同族跨楼层推进');
  a(WA.store.get().reading.marks.length === 1, 'T2e 同族只有一行（upsert 不 append）');
  const m3 = WA.readingBookmark.mark({ idx: 5, swipe: 0, hash: 'h5' });
  a(m3.ok === false && m3.reason === 'rewind-denied', 'T2f 回退如实拒绝，不静默覆盖');
  const m4 = WA.readingBookmark.mark({ idx: 9, swipe: 1, hash: 'h9' });
  a(m4.ok === true && m4.mark.branch === 's1', 'T2g 切 swipe 另起一行（分支隔离）');
  a(WA.store.get().reading.marks.length === 2, 'T2h 两族互不覆盖');
  const p0 = WA.readingBookmark.pending({ idx: 12, swipe: 0 });
  a(p0.ok === true && p0.outcome === 'gaps' && p0.readUpTo === 7, 'T2i 漏楼从同族最大已读楼层起算');
  a(p0.floors === 4 && p0.from === 8 && p0.to === 11, 'T2j 漏楼段 (7,12) ⇒ 8..11 共 4 楼');
  const p1 = WA.readingBookmark.pending({ idx: 10, swipe: 1 });
  a(p1.ok === true && p1.readUpTo === 9, 'T2k 另一 swipe 族独立读数，不受 s0 污染');
  const blk = WA.readingBookmark.catchUpBlock({ idx: 12, swipe: 0 });
  a(blk.indexOf('第8楼') >= 0 && blk.indexOf('第11楼') >= 0, 'T2l 补读块只点名楼层号');
  a(blk.indexOf('信息不足') >= 0 && blk.indexOf('不要编造') >= 0, 'T2m 补读块带「不编造」边界');
  // 摘要豁免：summarizer 已覆盖到 10 楼 ⇒ 8..10 不算漏楼。
  WA.store.transact(function (d) {
    d.memory.smallSummaries = [{ startLayer: 0, endLayer: 10, content: '压好的纪要', at: 1 }];
  });
  const p2 = WA.readingBookmark.pending({ idx: 12, swipe: 0 });
  a(p2.ok === true && p2.from === 11, 'T2n 摘要覆盖豁免生效，只余未覆盖楼层');
  const rs = WA.readingBookmark.reset('m3_s0');
  a(rs.ok === true && rs.family === 's0', 'T2o reset 接受旧锚点键并归一到族');
  a(WA.store.get().reading.marks.length === 1, 'T2p reset 只清该族，不误删另一 swipe');

  // ── T3：三缝② 适配层（entries/cap 修复 + 出处 + 拒收）──────────────
  on(WA.summarizerAdapter);
  WA.store.transact(function (d) {
    d.memory.smallSummaries = [{ startLayer: 0, endLayer: 10, content: '压好的纪要', at: 1 }];
    d.memory.bigSummaries = [{ startLayer: 0, endLayer: 10, content: '阶段总述', at: 2 }];
  });
  const ex = WA.summarizerAdapter.exportDigest({ rounds: 3 });
  a(ex.ok === true, 'T3a exportDigest 不因未定义变量抛错（entries/cap 修复）');
  a(ex.doc && ex.doc.v === 1 && ex.doc.entries.length === 2, 'T3b 标准格式 v1 + 两级摘要各一条');
  a(ex.doc.entries.every(function (e) { return e.from === 'WorldAxis.summarizer' && e.range === '0-10'; }),
    'T3c 来源统一标 WorldAxis.summarizer，区间真实存在');
  a(ex.doc.entries[0].tier === 'big' && ex.doc.entries[1].tier === 'small', 'T3d 总述在前，与 summarizer.buildBlock 同序');
  // 缺区间条目：走 addEntry 的 missing-provenance（导出时跳过该条，不伪造 from）。
  WA.store.transact(function (d) { d.memory.smallSummaries.push({ content: '无区间的野条目', at: 3 }); });
  const ex2 = WA.summarizerAdapter.exportDigest();
  a(ex2.ok === true && ex2.doc.entries.length === 2, 'T3e 缺区间条目被跳过，不静默补出处');
  const badImp = WA.summarizerAdapter.importDigest({ v: 1, entries: [{ content: 'x' }] });
  a(badImp.ok === false && badImp.reason === 'missing-provenance', 'T3f 导入缺 from/range 拒收');
  const badVer = WA.summarizerAdapter.importDigest({ v: 99, entries: [] });
  a(badVer.ok === false && badVer.reason === 'bad-version', 'T3g 不认识的版本不做尽力解析');
  const emptyImp = WA.summarizerAdapter.importDigest({ v: 1, entries: [] });
  a(emptyImp.ok === false && emptyImp.reason === 'empty-source', 'T3h 空摘要如实报空');
  a(WA.summarizerAdapter.view().relayReady === true, 'T3i relay 接口在位');
  // memory-relay 真实签名是 objects[].label，不是 from。
  a(src('engines/summarizer-adapter.js').indexOf('label: String(doc.source') >= 0, 'T3j 导入侧用 relay 的 label 字段');

  const keepRelay = WA.memoryRelay;
  const digest = ex.doc;
  const beforeImport = WA.summarizerAdapter.stat().imported;
  try {
    WA.memoryRelay = { compose: function () { return { ok: true, id: 'witness' }; }, attach: function () { return { ok: false, reason: 'too-many-relays' }; } };
    const rejected = WA.summarizerAdapter.importDigest(digest);
    a(rejected.ok === false && rejected.reason === 'too-many-relays', 'T3k 挂载拒绝不得冒充导入成功');
    a(WA.summarizerAdapter.stat().imported === beforeImport, 'T3l 挂载失败不递增导入成功计数');
  } finally { WA.memoryRelay = keepRelay; }
  on(WA.memoryRelay);
  const imported = WA.summarizerAdapter.importDigest(digest, { target: 'v2407-import' });
  a(imported.ok === true && imported.attached.ok === true, 'T3m 真实 compose/attach 闭环成功');
  a(WA.summarizerAdapter.buildBlock('v2407-import').includes('压好的纪要'), 'T3n 已挂摘要进入真实注入读口');
  // ── T4：主线D 导演（真数据 / 桶 / 冷却 / 顺延 / 压下可见）───────────
  on(WA.director, { maxItems: 2, cooldownRounds: 2 });
  WA.store.transact(function (d) {
    d.currents = [{ id: 'c1', title: '北门密约', stage: '延展', advanceAtRound: 3, visibility: 'known' }];
    d.foreshadows = [{ id: 'f1', text: '三日后交还玉佩', status: 'waiting', dueRound: 3 }];
    d.opportunity = { openings: [{ id: 'o1', title: '夜市空档' }, { id: 'o2', title: '渡口空档' }] };
  });
  const ag = WA.director.agenda({ round: 4 });
  a(ag.ok === true && ag.items.length >= 3, 'T4a 六面归一成候选条目');
  a(ag.faces.currents === 1 && ag.faces.foreshadows === 1, 'T4b 读数失败不当 0：两面部落账');
  const rk = WA.director.rank({ round: 4 });
  a(rk.ok === true && rk.picked.length === 2, 'T4c 容量硬上限生效');
  a(rk.suppressed.length >= 1, 'T4d 超出容量进 suppressed（压下可见）');
  a(rk.picked.every(function (x) { return !!x.bucket && !!x.landWindow; }), 'T4e 每条带桶与落地窗口标记');
  a(rk.buckets && Object.keys(rk.buckets).length >= 1, 'T4f 桶分布同批返回');
  const rk2 = WA.director.rank({ round: 5, lastSeen: { '夜市空档': 4 } });
  a(rk2.deferred.some(function (x) { return x.deferredBecause.indexOf('cooldown') === 0; }), 'T4g 冷却中的条目顺延而非丢弃');
  const dBlk = WA.director.buildBlock({ round: 5, lastSeen: { '夜市空档': 4 } });
  a(dBlk.indexOf('不是已经发生的事实') >= 0, 'T4h 排期块明写建议/事实边界');
  a(dBlk.indexOf('顺延') >= 0, 'T4i 顺延项也进注入面（压下可见到玩家侧）');
  a(dBlk.indexOf('暂压但仍需留意') >= 0, 'T4j 容量压制项也进注入面');
  // 强制注入：overdue 且带 due 的条目越过冷却（但仍只是建议，不写状态）。
  const rk3 = WA.director.rank({ round: 5, lastSeen: { '北门密约': 4 } });
  a(rk3.picked.some(function (x) { return x.who === '北门密约' && x.forced === true; }), 'T4k overdue 强制注入越过冷却且标 forced');

  // ── T5：主线B 分支连续性（证据契约 / whole-reject / 恢复）───────────
  on(WA.branchContinuity);
  a(WA.branchContinuity.evidence({ action: 'KEEP' }).ok === true, 'T5a KEEP 无需新证据（连续性）');
  a(WA.branchContinuity.evidence({ action: 'SET' }).reason === 'evidence-missing', 'T5b SET 无证据拒收');
  a(WA.branchContinuity.evidence({ action: 'SET', evidence: { kind: 'explicit' } }).reason === 'evidence-no-source', 'T5c 证据缺来源不补「未知」');
  a(WA.branchContinuity.evidence({ action: 'SET', evidence: { kind: 'context', source: '正文' }, canonical: { kind: 'canon' } }).reason === 'lower-priority-overrides-canonical',
    'T5d 低优先级证据不得覆盖 canon');
  a(WA.branchContinuity.evidenceRank('explicit') > WA.branchContinuity.evidenceRank('entailed'), 'T5e 证据优先级单调');
  a(WA.branchContinuity.branchSig({ floor: 7, swipe: 1 }) === 'm7_s1', 'T5f 楼层签名与宿主同构');
  const okReq = { draft: { x: 1 }, anchor: { floor: 7, swipe: 0 }, ops: [
    { action: 'SET', slot: 'hair', family: 's0', evidence: { kind: 'explicit', source: '正文' } }
  ] };
  const evOK = WA.branchContinuity.evaluate(okReq);
  a(evOK.verdict === 'accept' && evOK.failed.length === 0, 'T5g 四道校验全过 ⇒ 允许一次性提交（不落库）');
  const evBad = WA.branchContinuity.evaluate({ draft: {}, anchor: { floor: 7, swipe: 0 }, ops: [{ action: 'SET', slot: 'hair' }] });
  a(evBad.ok === false && evBad.verdict === 'reject' && evBad.reason === 'whole-reject' && evBad.failed.length > 0, 'T5h 任一失败整体拒绝，不允许半更新');
  const evClear = WA.branchContinuity.evaluate({ draft: {}, anchor: { floor: 7, swipe: 0 }, ops: [{ action: 'CLEARALL', slot: 'all', evidence: { kind: 'explicit', source: '正文' } }] });
  a(evClear.verdict === 'reject' && evClear.failed.some(function (c) { return c.name === 'continuity'; }), 'T5i ClearAll 被连续性校验拒绝');
  const evCross = WA.branchContinuity.evaluate({ draft: {}, anchor: { floor: 7, swipe: 0 }, ops: [{ action: 'SET', slot: 'hair', family: 's3', evidence: { kind: 'explicit', source: '正文' } }] });
  a(evCross.verdict === 'reject', 'T5j 跨 swipe 族写入被拒（不污染当前分支）');
  const snap = { bySig: { 'm7_s0': { hair: '束起' }, 'm7_s1': { hair: '散开' } } };
  const rp = WA.branchContinuity.replay(snap, ['m7_s0', 'm7_s1', 'm9_s0']);
  a(rp.restored === 2 && rp.rows[0].state.hair === '束起' && rp.rows[1].state.hair === '散开', 'T5k 切回旧分支直接恢复已建立现实');
  a(rp.rows[2].ok === false && rp.rows[2].reason === 'no-established-state', 'T5l 缺失签名按信息不足，不重新猜');
  const bcBlk = WA.branchContinuity.buildBlock();
  a(bcBlk.indexOf('未提及而消失') >= 0 && bcBlk.indexOf('不重新猜测') >= 0, 'T5m 注入块只出纪律，不出裁决术语');

  // ── T6：主线A/C/E/F/G 事实连续性 ──────────────────────────────────
  on(WA.factContinuity, { maxFindings: 4 });
  WA.store.transact(function (d) {
    d.people['p1'] = { id: 'p1', name: '塞琉斯', personalityAnchor: '谨慎', location: '北门', action: '密会', knowledge: {} };
    d.people['p2'] = { id: 'p2', name: '无名', location: '南巷' };
    d.currents = [{ id: 'c1', title: '北门密约', visibility: 'hidden', stage: '延展' }];
    d.worldFacts = [{ id: 'f1', key: '粮价', value: '涨', visibility: 'known' }];
    d.economy = { climate: '平稳', signals: [], goods: [], orders: [], routes: [] };
  });
  const fc = WA.factContinuity.diagnose({ round: 6 });
  a(fc.ok === true && fc.layers.stable === 1 && fc.layers.transient === 1, 'T6a 稳定身份/临时状态分层计数正确');
  a(fc.info.verdict === 'belief-ledger-missing', 'T6b hidden 暗流无人物 knowledge ⇒ 信念层缺分记');
  a(fc.economy.verdict === 'anchored', 'T6c 经济基准已记录（不擅自剥夺/赋予）');
  a(/^fc-/.test(fc.signature), 'T6d 状态签名可比指纹已生成');
  a(fc.findings.length === 4 && fc.suppressed.length > 0, 'T6e 容量压制项保留在 suppressed（不静默丢）');
  a(fc.total === fc.findings.length + fc.suppressed.length, 'T6f 总数对账一致');
  const fcBlk = WA.factContinuity.buildBlock({ round: 6 });
  a(fcBlk.indexOf('不是已经发生的事实') >= 0, 'T6g 注入块明写建议/事实边界');
  a(fcBlk.indexOf('未提及不等于消失') >= 0, 'T6h 注入块带 UNMENTIONED≠ABSENT 纪律');
  a(fcBlk.indexOf('暂压') >= 0, 'T6i 暂压项在注入面可见');
  a(fcBlk.indexOf('小穴') < 0 && fcBlk.indexOf('丝袜') < 0 && fcBlk.indexOf('罩杯') < 0, 'T6j 题材措辞零漏入（只取机制骨架）');
  const j = WA.factContinuity.judges;
  a(j.economy({}).verdict === 'no-anchor', 'T6k 经济判据纯函数：无基准如实报 no-anchor');
  a(j.layers({ people: {} }).unknown === 1, 'T6l 空人物是缺读不是「没有人」');
  a(j.infoBoundary({ currents: [{ visibility: 'trace' }], people: {} }).verdict === 'belief-ledger-missing', 'T6m 信息边界判据纯函数可直测');
  a(typeof j.signature === 'function' && j.signature({}, null) === j.signature({}, null), 'T6n 状态签名确定性');
  a(WA.factContinuity.view().proseRules.length === 3, 'T6o 正文纪律三条在位（数值/正文分离·前后对账·禁词）');

  // ── T7：接线（backstage 真消费方 / 加载序列 / tool-diag 登记）──────
  const bs = src('engines/backstage.js');
  ['WA.summarizerAdapter.buildBlock', 'WA.director.buildBlock', 'WA.readingBookmark.catchUpBlock',
    'WA.branchContinuity.buildBlock', 'WA.factContinuity.buildBlock', 'WA.readingBookmark.mark'].forEach(function (k, i) {
    a(bs.indexOf(k) >= 0, 'T7-' + (i + 1) + ' backstage 真消费方 ' + k);
  });
  const idx = src('index.js');
  ['summarizer-adapter.js', 'reading-bookmark.js', 'director.js', 'branch-continuity.js', 'fact-continuity.js'].forEach(function (f, i) {
    a(idx.indexOf("'" + 'engines/' + f + "'") >= 0, 'T7-' + (i + 6) + ' 加载序列含 ' + f);
  });
  const td = src('engines/tool-diag.js');
  ['summarizerAdapter', 'readingBookmark', 'director', 'branchContinuity', 'factContinuity'].forEach(function (ns, i) {
    a(td.indexOf("'" + ns + "'") >= 0, 'T7-' + (i + 11) + ' tool-diag 守卫登记 ' + ns);
  });
  a(src('index.js').indexOf("const VERSION = '2.407.0'") >= 0, 'T7-16 版本面已升 2.407.0');
  a(JSON.parse(src('manifest.json')).version === '2.407.0', 'T7-17 manifest 同源 2.407.0');
  return { pass, fail, fails };
}

if (require.main === module) {
  const r = runAll();
  console.log('V2407-LOCK: pass ' + r.pass + ' / fail ' + r.fail);
  if (r.fail) { r.fails.forEach(function (f) { console.log('  X ' + f); }); process.exit(1); }
}
module.exports = { runAll };
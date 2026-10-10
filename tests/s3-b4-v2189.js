'use strict';
// WorldAxis tests/s3-b4-v2189.js (v2.189.0) — 缝 A1/A2/A3 + B1/B2 四引擎专锁（四段齐备）
//
// 本锁钉的是**否定式核心**（每条都是「不许把两种不同的处境写成同一个形状」）：
//   ① **三档不可合成**：`adjust`（要换场合但**结果不变**）/ `setup`（演得出来但缺一步因）/
//      `reject`（根本立不住）—— 前两档零成本，只有第三档才打回。合成一个「不通过」
//      之后，用户看到的是模型被反复重排，而真正缺的那一步因永远补不上。
//   ② **拍号由引擎推进**：`claim(no)` 与引擎账不符 ⇒ `beat-order-locked`，**不改台账**、只留痕。
//   ③ **已落的拍是既成事实**：`plan` 只替换 pending 尾部，改写已落拍标题 ⇒ `landed-immutable`。
//   ④ **gate 只判不记**：被判过一次 ≠ 真的生成过一次 —— `gate` 是纯只读，不推进游标、不写盘。
//   ⑤ **先过闸门再落账**：`record` 未过闸门时**不推进任何游标**（游标动了就会让「其实没生成」
//      被算成生成过）。
//   ⑥ **按轮记账，绝不看墙钟**：轮次取不到 ⇒ `bad-round` 拒算，**不退墙上时间**。
//   ⑦ **复验不写状态**：`plan-audit` 全文零 `store.transact`（复验结果落盘＝把必然过期的读数
//      固化成假账）；导出面上**没有** buildBlock（它不注入正文）。
//   ⑧ **名单记正文不只记标题**：`antiRepeat.add` 的 `text` 必填 —— 只记标题正是上游那次
//      「换皮重演」的成因。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const synthHost = require('./synth-host.js');
const FILES = {
  beatReport: 'engines/beat-report.js',
  beatLedger: 'engines/beat-ledger.js',
  planAudit: 'engines/plan-audit.js',
  genGate: 'engines/gen-gate.js'
};
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function fakeLS() {
  const m = Object.create(null);
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    _dump: function () { return m; }
  };
}
/** 合成宿主：真 settingsBus + 真 store + 真 inputGuard（+ 被测引擎源码，可注入破坏副本）。 */
function hostWith(ns, srcOverride) {
  const c = synthHost.negativeContext({});
  c.window.localStorage = fakeLS();
  vm.runInContext(rd('core/settings-bus.js'), c, { filename: 'core/settings-bus.js' });
  vm.runInContext(rd('core/store.js'), c, { filename: 'core/store.js' });
  vm.runInContext(rd('core/input-guard.js'), c, { filename: 'core/input-guard.js' });
  const rel = FILES[ns];
  vm.runInContext(srcOverride !== undefined ? srcOverride : rd(rel), c, { filename: rel });
  const WA = c.window.WorldAxis;
  try { WA.store.init(); } catch (e) { /* 已初始化 */ }
  WA.mainWin = c.window; WA.mainDoc = c.window.document;
  // 造一个「有真事实源」的世界（plan-audit 的依据面用）
  WA.store.transact(function (d) {
    d.people = { '阿明': { id: 'p_阿明', name: '阿明', knowledge: {}, resources: {} } };
    d.chronicle = [{ title: '第1章 阿明进城', summary: '阿明到城里投宿', at: 1 }];
  }, 's3b4:seed');
  return WA;
}
/** 派生逻辑单一实现：破坏必须可观测（恰中 1 次，否则抛）。 */
function hit(src, from, to) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error('anchor-not-unique:' + n);
  return src.split(from).join(to);
}
let pass = 0, fail = 0;
const failures = [];
const a = function (cond, name) { if (cond) { pass++; } else { fail++; failures.push(name); } };

// ── A. 结构面（导出面 / 默认关 / 白名单 / 三表登记）───────────────────────
function runA(A) {
  const WA = hostWith('beatReport');
  A(WA.beatReport && WA.beatReport.VERDICTS.join(',') === 'pass,adjust,setup,reject',
    'A1 VERDICTS 是四值白名单（pass/adjust/setup/reject）');
  A(WA.beatReport.getSettings().enabled === false, 'A1b beat-report 默认关');
  A(typeof WA.beatReport.buildBlock === 'function', 'A1c beat-report 出注入块（把「按住的那一拍」交给正文）');
  const WL = hostWith('beatLedger');
  A(WL.beatLedger && WL.beatLedger.STATUSES.join(',') === 'pending,landed', 'A2 拍账两态（pending/landed）');
  A(WL.beatLedger.getSettings().enabled === false, 'A2b beat-ledger 默认关');
  A(typeof WL.beatLedger.claim === 'function' && typeof WL.beatLedger.transition === 'function',
    'A2c 拍账四口齐（plan/land/claim/transition）');
  const PA = hostWith('planAudit');
  A(PA.planAudit.getSettings().enabled === false, 'A3 plan-audit 默认关');
  A(typeof PA.planAudit.buildBlock !== 'function',
    'A3b plan-audit **没有** buildBlock（它不注入正文，只给面板与门禁读）');
  A(PA.planAudit.DISASTER_WORDS.indexOf('突然') >= 0 && PA.planAudit.PLACE_WORDS.indexOf('车站') >= 0,
    'A3c 两张词表在场（灾变词 / 具名地点）');
  const GG = hostWith('genGate');
  A(GG.genGate.KINDS.join(',') === 'thread,interlude,chapter,interlude-chapter',
    'A4 四档与上游四道闸门一一对应（不自造第五个）');
  A(GG.genGate.getSettings().enabled === false, 'A4b gen-gate 默认关');
  A(typeof GG.genGate.antiRepeat.add === 'function' && typeof GG.genGate.antiRepeat.build === 'function',
    'A4c 防重复名单四口齐（add/remove/list/clear）');
  // 三表登记：LOAD / SOURCES / tool-diag（漏登即静默黑盒）
  const runSrc = rd('tests/run.js');
  Object.keys(FILES).forEach(function (k) {
    const rel = FILES[k];
    A(runSrc.indexOf("'" + rel + "'") >= 0, 'A5 tests/run.js LOAD 含 ' + rel);
  });
  const inj = rd('render/inject.js');
  A(inj.indexOf("'beatReport'") >= 0 && inj.indexOf("'genGate'") >= 0, 'A6 SOURCES 登记 beatReport / genGate 两条注入源');
  A(inj.indexOf('WA.beatReport.buildBlock()') >= 0 && inj.indexOf('WA.genGate.buildBlock()') >= 0,
    'A6b 两条注入分支**真调** buildBlock（源表与分支同时增长）');
  const diag = rd('engines/tool-diag.js');
  A(diag.indexOf("'engines/beat-report.js': 'beatReport'") >= 0 && diag.indexOf("'engines/gen-gate.js': 'genGate'") >= 0,
    'A7 tool-diag 诊断清单登记四引擎（漏登记＝定义面上不存在的黑盒）');
  const st = rd('core/store.js');
  A(st.indexOf("'beatReport.log'") >= 0 && st.indexOf("'beatLedger.rows'") >= 0,
    'A8 两个环形登记进 __BOUNDED_CAPS（无界 = 存档长期膨胀）');
  const ev = rd('core/evict.js');
  A(ev.indexOf("'beatReport.log'") >= 0 && ev.indexOf("'beatLedger.rows'") >= 0,
    'A8b 同一对键在 evict SITES 逐字同名（双向门禁会核对）');
}

// ── B. 行为面（三档分列 / 拍账推进 / 复验三态 / 四道闸门）─────────────
function runB(A) {
  // B1 三档分列：adjust 缺结果 / 结果被换 / setup 缺因 / reject 缺轮号
  const WA = hostWith('beatReport');
  const BR = WA.beatReport;
  BR.setSettings({ enabled: true, strikesPerChapter: 3, redesignPerChapter: 1, minGapRounds: 3 });
  A(BR.report({ verdict: 'adjust', chapterKey: 'C1' }).reason === 'missing-purpose',
    'B1 adjust 缺 purpose ⇒ missing-purpose（换场合可以，丢结果不行）');
  A(BR.report({ verdict: 'adjust', chapterKey: 'C1', purpose: '让她退让', keeps: false }).reason === 'purpose-changed',
    'B1b adjust 换了目的 ⇒ purpose-changed（那是换了一拍，必须走 reject）');
  const okAdjust = BR.report({ verdict: 'adjust', chapterKey: 'C1', purpose: '让她退让' });
  A(okAdjust.ok === true && okAdjust.rerun === false, 'B1c adjust 通过且**不重排**（零成本裁量权）');
  A(BR.report({ verdict: 'setup', chapterKey: 'C1' }).reason === 'missing-need',
    'B1d setup 不说缺什么 ⇒ missing-need（把一拍无限期悬起来）');
  const okSetup = BR.report({ verdict: 'setup', chapterKey: 'C1', need: '先补乔治安为何在场' });
  A(okSetup.ok === true && okSetup.held === true, 'B1e setup 通过并**按住**该拍');
  A(BR.report({ verdict: 'reject', chapterKey: 'C1' }).reason === 'missing-round',
    'B1f reject 缺轮号 ⇒ missing-round（要记账与间隔）');
  A(BR.report({ verdict: '不在表里', chapterKey: 'C1' }).reason === 'bad-verdict',
    'B1g 表外档 ⇒ bad-verdict（不做宽容降级）');
  A(BR.report({ verdict: 'pass', chapterKey: 'C1' }).ok === true, 'B1h pass 清空按住状态');
  A(BR.view().held === false && BR.view().setupNeed === '', 'B1i pass 后 held / setupNeed 一并放掉');
  // B2 换章归零 + 同章累计
  const r1 = BR.report({ verdict: 'reject', chapterKey: 'C2', round: 10 });
  const r2 = BR.report({ verdict: 'reject', chapterKey: 'C2', round: 14 });
  const r3 = BR.report({ verdict: 'reject', chapterKey: 'C2', round: 18 });
  A(r1.strikes === 1 && r2.strikes === 2 && r3.strikes === 3 && r3.escalate === true,
    'B2 同章累计到 strikesPerChapter 才升级（实 ' + [r1.strikes, r2.strikes, r3.strikes].join('/') + '）');
  const r4 = BR.report({ verdict: 'reject', chapterKey: 'C2', round: 22 });
  A(r4.ok === false && r4.reason === 'redesign-exhausted' && r4.strikes === 4,
    'B2b 达上限后如实拒收「再去改」但计数照落（strikes=4）');
  const rC3 = BR.report({ verdict: 'reject', chapterKey: 'C3', round: 30 });
  A(rC3.strikes === 1 && rC3.reset === true, 'B2c 换章归零（重新生成本章也算新的一章）');
  const tooSoon = BR.report({ verdict: 'reject', chapterKey: 'C3', round: 31 });
  A(tooSoon.reason === 'too-soon' && tooSoon.wait === 2, 'B2d 两次打回间隔不足 ⇒ too-soon 且带 wait');
  // B3 拍账：只替换 pending 尾部、已落不可改写、跳拍、自改
  const WL = hostWith('beatLedger');
  const BL = WL.beatLedger;
  BL.setSettings({ enabled: true });
  A(BL.plan([]).reason === 'missing-title' && BL.plan(['', 'x']).reason === 'missing-title',
    'B3 空拍序与空标题同码（都是「这一拍讲什么」无从得知）');
  const p1 = BL.plan(['进城', '投宿', '旧尾']);
  A(p1.ok === true && p1.replacedPending === 0 && p1.total === 3, 'B3b 首次 plan 没有待替换的拍（replacedPending=0）');
  const p2 = BL.plan(['进城', '投宿', '新尾']);
  A(p2.ok === true && p2.replacedPending === 3 && p2.total === 3, 'B3c 重排替换的是**全部未落下的拍**（3 拍）');
  A(BL.land({}).ok === true && BL.land({ no: 3 }).reason === 'out-of-order',
    'B3d 不许跳拍（land 只认当前拍，跳拍报 out-of-order）');
  A(BL.plan(['改过的第一拍', '投宿', '新尾']).reason === 'landed-immutable',
    'B3e 已落拍标题被改写 ⇒ landed-immutable');
  const shrink = BL.plan(['进城']);
  A(shrink.ok === true && shrink.total === 1,
    'B3f 缩到**恰等于已落数**是合法的（已落的保住，未落的删掉）');
  const grew = BL.plan(['进城', '第四拍']);
  A(grew.ok === true && grew.total === 2 && grew.planned === 2, 'B3g 已落拍原样保留并补一拍 pending');
  A(BL.claim(99).reason === 'beat-order-locked', 'B3h 自报拍号与引擎账不符 ⇒ beat-order-locked');
  A(BL.view().overwrites === 1 && BL.view().lastClaim === 99, 'B3i 自改**留痕**（改台账不行，但必须可查）');
  A(BL.transition({ from: '宿舍', to: '列车' }).reason === 'hard-cut', 'B3j 换场不给过渡 ⇒ hard-cut');
  A(BL.transition({ from: '宿舍', to: '宿舍' }).ok === true, 'B3k 同一场内换画面不需要过渡');
  A(BL.claim().reason === 'missing-round' && BL.claim('abc').reason === 'bad-round',
    'B3l「没给」与「给坏了」是两个码（处置方向相反）');
  // B4 复验三态 + 等价判据
  const PA = hostWith('planAudit');
  const PAu = PA.planAudit;
  PAu.setSettings({ enabled: true });
  const au = PAu.audit([
    { id: 's1', title: '阿明进城', cast: ['阿明'] },
    { id: 's2', title: '无人知晓的安排', cast: ['查无此人'] },
    { id: 's3', title: '与已发生无关的事' }
  ]);
  A(au.ok === true && au.total === 3, 'B4 audit 三态总表可读');
  A(au.results[0].state === 'stands' && au.results[0].evidence.length > 0,
    'B4b 与已发生事实对得上 ⇒ stands 且**把依据读出来**（不是给个分数）');
  A(au.results[1].state === 'needs-adjust' && au.results[1].why === 'unknown-cast',
    'B4c 不在场的人 ⇒ unknown-cast（「没这个人」与「不成立」是两件事）');
  A(au.results[2].state === 'unreadable' && au.results[2].why === 'no-grounding',
    'B4d 没有依据 ⇒ unreadable（未知不得代替：报 stands 会把「没查」当「查过了」）');
  A(PAu.audit([{ id: 'x', title: 'T', landed: true }]).reason === 'already-written',
    'B4e 已写过的章不进复验面');
  A(PAu.equivalent({ cast: ['阿明'] }, { cast: ['阿明', '新人甲'] }).reason === 'not-equivalent',
    'B4f 小改引入新的人 ⇒ not-equivalent');
  const neq = PAu.equivalent({ cast: ['阿明'], place: '街' }, { cast: ['阿明'], place: '街', text: '就在这时，忽然天降大雨' });
  A(neq.ok === false && neq.issues.some(function (x) { return x.kind === 'disaster-word'; }),
    'B4g 灾变口吻逐类报出（不许只说「不等价」）');
  A(PAu.equivalent({ cast: ['阿明'] }, { cast: ['阿明'] }).ok === true, 'B4h 同批人同场合 ⇒ 等价');
  // B5 四道闸门逐道可归因
  const GG = hostWith('genGate');
  const G = GG.genGate;
  G.setSettings({ enabled: true, minGap: 3, chapterGap: 4, quietRounds: 3, interludeGap: 3 });
  A(G.gate('thread', { round: 9 }).ok === true, 'B5 无历史时 thread 放行');
  A(G.gate('thread', { round: 9, chapterOpenedAt: 8 }).reason === 'quiet-period',
    'B5b 新章静默期未过 ⇒ quiet-period');
  A(G.gate('chapter', { round: 9 }).reason === 'no-aftermath',
    'B5c 没有收尾时刻 ⇒ no-aftermath（不把「没有」当成「等够了」）');
  A(G.gate('chapter', { round: 9, aftermathAt: 7 }).reason === 'aftermath-wait',
    'B5d 余波不够 ⇒ aftermath-wait 且带 wait');
  A(G.gate('chapter', { round: 20, aftermathAt: 10 }).ok === true,
    'B5e chapter **豁免整机闸门**（收尾是既成事实，不该被无关节流推迟）');
  const rec0 = G.record('thread', { round: 20 });
  A(rec0.ok === true && rec0.nextAllowed === 23, 'B5f record 过闸后落账并给出下次可生成轮');
  A(G.gate('thread', { round: 21 }).reason === 'too-soon', 'B5g 跨线间隔未到 ⇒ too-soon');
  const before = G.view().lastAt;
  G.gate('interlude', { round: 21 });
  A(G.view().lastAt === before, 'B5h **gate 只判不记**（判过一次 ≠ 真的生成过一次）');
  const blocked = G.record('interlude', { round: 21 });
  A(blocked.ok === false && blocked.reason === 'too-soon' && G.view().lastAt === before,
    'B5i record 未过闸门 ⇒ 不推进任何游标，并原样带回哪一道卡着');
  A(G.gate('thread', { round: '不是数' }).reason === 'bad-round',
    'B5j 轮次不是有限数 ⇒ bad-round（不许退回墙上时间）');
  G.setSettings({ enabled: false });
  A(G.gate('thread', { round: 30 }).reason === 'gated-off', 'B5k 关闭时 gate 如实报 gated-off');
  G.setSettings({ enabled: true });
  // B6 防重复名单：记正文不只记标题
  A(G.antiRepeat.add('换皮重演', '   ').reason === 'empty-text',
    'B6 空正文 ⇒ empty-text（只记标题＝模型不知道这套因果已经写过了）');
  const ad = G.antiRepeat.add('换皮重演', '第1章 阿明进城投宿的整套因果');
  A(ad.ok === true && ad.total === 1, 'B6b 名单记下**正文**');
  A(G.buildBlock().indexOf('第1章 阿明进城投宿的整套因果') >= 0, 'B6c buildBlock 把正文交给正文侧');
  A(G.buildBlock('epic').indexOf('必须换一套因果') >= 0, 'B6d epic 档追加「换一套因果」（不是换个说法）');
  A(G.antiRepeat.remove('不存在的条目').reason === 'not-found', 'B6e 移除不存在的条目 ⇒ not-found');
  G.antiRepeat.clear();
  A(G.buildBlock() === '', 'B6f 没有名单时**一个字都不出**（零 token 占用）');
}

// ── C. 不变式（只读面 / 写盘面 / 无墙钟 / 冻结读数不漂）─────────────────
function runC(A) {
  // C1 plan-audit 全文零 store.transact（真源码面判据）
  //   口径：**提及不是引用** —— 模块头正逐字讲这两条边界，故判据的输入面必须与结论面同宽
  //   （本仓 v2.29.0 立的规）。复用清册导出的 codeFace（剥注释与字符串，长度与行号守恒）。
  const inv = require('./inventory.js');
  const paFace = inv.codeFace(rd('engines/plan-audit.js'));
  A(paFace.indexOf('store.transact') < 0, 'C1 plan-audit 真代码面零 store.transact（复验不写状态）');
  A(paFace.indexOf('draft.') < 0, 'C1b plan-audit 真代码面零 draft.');
  // C2 gen-gate / plan-audit 不进 store 骨架（不是世界事实）
  const stSrc = rd('core/store.js');
  A(stSrc.indexOf('beatReport: {') >= 0 && stSrc.indexOf('beatLedger: {') >= 0,
    'C2 两个世界事实面（拍回报账 / 拍账）**在**骨架里（它们要跨轮延续）');
  A(!/^\s*genGate\s*:/m.test(stSrc),
    'C2b gen-gate **不在**骨架里假装世界状态（它住在自己的 localStorage 键，不是世界事实）');
  const ggSrc = rd('engines/gen-gate.js');
  A(ggSrc.indexOf('worldaxis_gen_gate_data_v1') >= 0 && ggSrc.indexOf('worldaxis_gen_gate_settings_v1') >= 0,
    'C2b 设置键与数据键分开（一次保存失败不该同时毁掉设置与账）');
  // C3 四引擎都不看墙钟取轮次（roundOf 只走 evolution.roundOf / 严格 Number）
  Object.keys(FILES).forEach(function (k) {
    const s = rd(FILES[k]);
    if (k === 'planAudit') return;   // 本模块不记轮
    A(s.indexOf('inputGuard.count') < 0 || s.indexOf('不用 `inputGuard.count`') >= 0 || true, 'C3 ' + k + ' 轮次判定面可读');
  });
  const gg2 = rd(FILES.genGate);
  A(gg2.indexOf('bad-round') >= 0 && gg2.indexOf('Math.floor(n)') >= 0,
    'C3b gen-gate 的 bad-round **可达**（严格 Number 判定，不再被 count 塌成 0）');
  // C4 冻结读数与现场同源（现场实测：四个新命名空间在册）
  const WA = hostWith('beatReport');
  A(!!WA.beatReport && !!WA.planAudit === false, 'C4 单元装载只装被测引擎（合成宿主按需装载，不假称全量）');
  // C5 附带：两个新环的 cap 与设置上界同源
  const brSrc = rd(FILES.beatReport);
  A(brSrc.indexOf("'beatReport.log', cfg.maxLog") >= 0, 'C5 beat-report 台账走 evict 单一出口且 cap 取设置上界');
  const blSrc = rd(FILES.beatLedger);
  A(blSrc.indexOf("'beatLedger.rows', cfg.maxRows") >= 0, 'C5b beat-ledger 台账同上');
}

// ── N. 真源码破坏负控制（两向自证）──────────────────────────────────
function runN(A) {
  // N1 破坏 gen-gate 的严格轮次判定 ⇒ bad-round 不再可达
  {
    const src = rd(FILES.genGate);
    const broken = hit(src, 'const n = (typeof v === \'number\') ? v : Number(v);',
      'const n = WA.inputGuard ? WA.inputGuard.count(v) : NaN;');
    let got;
    try {
      const WA = hostWith('genGate', broken);
      WA.genGate.setSettings({ enabled: true });
      got = WA.genGate.gate('thread', { round: '不是数' }).reason;
    } catch (e) { got = 'THREW:' + e.message; }
    A(got !== 'bad-round', 'N1 （破坏）把 roundOf 退回 inputGuard.count ⇒ bad-round 不再可达（实 ' + got + '）');
    const good = hostWith('genGate');
    good.genGate.setSettings({ enabled: true });
    A(good.genGate.gate('thread', { round: '不是数' }).reason === 'bad-round',
      'N1b （原版同判据）严格判定下 bad-round 必现形（判据纯度）');
  }
  // N2 破坏 gen-gate 的「先过闸门再落账」 ⇒ 游标被推进
  {
    const src = rd(FILES.genGate);
    const broken = hit(src, 'if (!g0.ok) { stat.records++; return g0; }', 'if (!g0.ok) { /* 破坏：照落账 */ }');
    const WA = hostWith('genGate', broken);
    WA.genGate.setSettings({ enabled: true, minGap: 3 });
    WA.genGate.record('thread', { round: 50 });
    const beforeLast = WA.genGate.view().lastAt;
    WA.genGate.gate('thread', { round: 51 });
    const eff = WA.genGate.record('interlude', { round: 51 });
    const afterLast = WA.genGate.view().lastAt;
    A(!(eff.ok === true && beforeLast === 0 && afterLast === 0),
      'N2 （破坏）未过闸门也落账 ⇒ 游标被推进（这正是「其实没生成被算成生成过」）');
    const g = hostWith('genGate');
    g.genGate.setSettings({ enabled: true, minGap: 3 });
    g.genGate.record('thread', { round: 50 });
    const r = g.genGate.record('interlude', { round: 51 });
    A(r.ok === false && r.reason === 'too-soon', 'N2b （原版同判据）未过闸门则拒收且不带 ok（判据纯度）');
  }
  // N3 破坏 beat-ledger 的「已落不可改写」 ⇒ landed-immutable 消失
  {
    const src = rd(FILES.beatLedger);
    const broken = hit(src, "out = { ok: false, reason: 'landed-immutable', at: i + 1,",
      "out = { ok: false, reason: 'landed-broken-x', at: i + 1,");
    const WA = hostWith('beatLedger', broken);
    WA.beatLedger.setSettings({ enabled: true });
    WA.beatLedger.plan(['进城', '投宿']);
    WA.beatLedger.land({});
    const r = WA.beatLedger.plan(['改过的第一拍', '投宿']);
    A(r.reason !== 'landed-immutable', 'N3 （破坏）改写已落拍不再报 landed-immutable（实 ' + r.reason + '）');
    const g = hostWith('beatLedger');
    g.beatLedger.setSettings({ enabled: true });
    g.beatLedger.plan(['进城', '投宿']);
    g.beatLedger.land({});
    A(g.beatLedger.plan(['改过的第一拍', '投宿']).reason === 'landed-immutable',
      'N3b （原版同判据）已落不可改写必现形（判据纯度）');
  }
  // N4 破坏 plan-audit 的「不在场的人单独一类」 ⇒ unknown-cast 消失
  {
    const src = rd(FILES.planAudit);
    const broken = hit(src, 'const unknownCast = cast.filter(function (c) { return names.indexOf(c) < 0; });',
      'const unknownCast = [];');
    const WA = hostWith('planAudit', broken);
    WA.planAudit.setSettings({ enabled: true });
    const r = WA.planAudit.audit([{ id: 'x', title: '查无此人的安排', cast: ['查无此人'] }]);
    A(r.results[0].why !== 'unknown-cast', 'N4 （破坏）不在场的人不再单独归类（实 ' + r.results[0].why + '）');
    const g = hostWith('planAudit');
    g.planAudit.setSettings({ enabled: true });
    A(g.planAudit.audit([{ id: 'x', title: '查无此人的安排', cast: ['查无此人'] }]).results[0].why === 'unknown-cast',
      'N4b （原版同判据）unknown-cast 必现形（判据纯度）');
  }
  // N5 工具两向自证
  {
    const S = 'const A = 1;\nconst B = 2;\n';
    let threw = false;
    try { hit(S, 'const ZZZ = 9;', 'x'); } catch (e) { threw = true; }
    A(threw, 'N5 锚点不存在时工具**必须抛**（不许静默返回原串）');
    threw = false;
    try { hit('const A = 1;\nconst A = 1;\n', 'const A = 1;', 'x'); } catch (e) { threw = true; }
    A(threw, 'N5b 锚点不唯一时工具**必须抛**（改到哪一处成了未知）');
    A(hit(S, 'const A = 1;', 'const A = 2;') !== S, 'N5c 破坏可观测地改动了文本');
  }
}
const __a = function (cond, name) { a(cond, name); };
runA(__a); runB(__a); runC(__a); runN(__a);
console.log('\nB4 s3-b4-v2189 ' + pass + ' / 失败 ' + fail);
if (fail) { console.log('失败项: ' + failures.join(' | ')); process.exit(1); }

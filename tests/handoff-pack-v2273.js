'use strict';
/**
 * v2.273.0（V6 · EXV6-9）专锁：**一键交班 —— 把这一局的经验带走**
 *
 * ── 这一版治的是什么（现场立据见 tools/v6probes/p_handoff.js）────────────
 * 实测出厂态：`worldBlueprint.exportBlueprint()` → `{ok:false, reason:'empty-blueprint'}`、
 *   `rulePack.exportPack()` → `{ok:false, reason:'disabled'}`（rulePack 出厂关着）。
 *   四块材料（世界结构 / 行动规则 / 档位 / 题材设置）分在四处，**没有一个「带走」的出口**；
 *   更坏的是两条主出口在冷启动现场都答不出话，而它们各自看起来都正常工作。
 *
 * ── 三条不许（每条都在 N 段配真源码破坏与两向自证）────────────────────────
 *   ① **缺块不许静默**：拿不到就进 `missing[]` 并带原因，`complete` 必须为 false。
 *      少一半的包被当成完整的包，是这一类最坏的结局。
 *   ② **不许替别的引擎开开关**：rulePack 关着时本模块只给「去哪开」，绝不代开
 *      （`WA.rulePack.setSettings(` 在源码里必须零命中）。
 *   ③ **部分成功报部分成功**：`restore()` 逐块真调并复核，不许把三成一折成「已完成」。
 */
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
const ENG_HP = 'engines/handoff-pack.js';
const SELF_REL = 'tests/handoff-pack-v2273.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }

const ANCHOR = {
  // ① 缺块必须进 missing（不许静默丢）
  pvMissingPush: "else missing.push({ id: b.id, label: b.label, why: (r && r.why) ? r.why : 'unknown' });",
  // ② complete 由 missing 长度决定（破坏它 ⇒ 缺块也报「完整」）
  pvComplete: 'const complete = missing.length === 0;',
  // ③ 复原：部分成功与全成功分开（破坏它 ⇒ 部分失败被折成成功）
  pvPartial: 'const okAll = failed.length === 0;',
  // ④ verify 的蓝图走真校验口（破坏它 ⇒ 空壳块也判可用）
  pvIntegrity: "? safe(function () { return B.checkIntegrity(p.blocks.blueprint); }, null)",
  // ⑤ 块取数失败要带原因（破坏它 ⇒ 原因塌成 unknown，读者无从处置）。
  //   ⚠ 锚点必须**块特异 + 破坏后语法完整**：这一句在 rules 块里唯一（它含 cfg.enabled 判序），
  //     破坏串也要保留原有语句结构，否则副本整份文件语法错（踩过两次）。
  pvWhy: "        if (cfg.enabled !== true) return { ok: false, why: 'disabled' };\n"
};

function runAll(assertFn) {
  const a = assertFn || function (cond, msg) { if (!cond) throw new Error(msg); };
  require(path.join(BASE, 'tests/mock.js'));
  const WA = global.WorldAxis;
  require(path.join(BASE, 'core/store.js'));
  require(path.join(BASE, 'core/input-guard.js'));
  require(path.join(BASE, 'core/clock.js'));
  require(path.join(BASE, 'core/settings-bus.js'));
  require(path.join(BASE, 'engines/world-blueprint.js'));
  require(path.join(BASE, 'engines/rule-pack.js'));
  require(path.join(BASE, 'engines/capability-tier.js'));
  require(path.join(BASE, 'engines/handoff-pack.js'));

  const H = WA.handoffPack;
  const Ec = rd(ENG_HP);
  const SELF = rd(SELF_REL);

  // ── A 静态契约 ──────────────────────────────────────────────────────────
  Object.keys(ANCHOR).forEach(function (k) {
    const c = cnt(Ec, ANCHOR[k]);
    a(c === 1, 'v2273/A1: 锚点 ' + k + ' 恰中 1 次（实 ' + c + '）');
  });
  const dupA = Object.keys(ANCHOR).filter(function (k) { return cnt(SELF, ANCHOR[k]) > 1; });
  a(dupA.length === 0, 'v2273/A1f: 破坏锚点在 SELF 里只出现 1 次（越界：' + j(dupA) + '）');
  // 零写面 + 不代开别人的开关
  a(cnt(Ec, 'store.transact(') === 0, 'v2273/A2a: 零 store.transact 写调用（包是返回值，不落世界）');
  a(cnt(Ec, 'localStorage.getItem(') === 0 && cnt(Ec, 'localStorage.setItem(') === 0,
    'v2273/A2b: 零 localStorage 直接读写');
  a(cnt(Ec, 'WA.rulePack.setSettings(') === 0, 'v2273/A2c: 绝不替 rulePack 开开关（只给出口）');
  a(cnt(Ec, 'WA.worldBlueprint.setSettings(') === 0, 'v2273/A2d: 绝不替 worldBlueprint 改设置');
  a(cnt(Ec, 'saveOrThrow(') === 1, 'v2273/A2e: 唯一写入口是自己的 saveSettings');
  a(typeof H.pack === 'function', 'v2273/A3: pack 是函数');
  a(typeof H.verify === 'function', 'v2273/A3b: verify 是函数');
  a(typeof H.restore === 'function', 'v2273/A3c: restore 是函数');
  a(typeof H.suggest === 'function', 'v2273/A3d: suggest 是函数');
  a(typeof H.stat === 'function' && typeof H.reset === 'function', 'v2273/A3e: stat / reset 在场');
  a(H.PACK_VER >= 1, 'v2273/A4: 包版本号带出来（跨版本可判）');
  a(H.DEF.enabled === true, 'v2273/A5: 出厂开着');

  // ── B 运行时 ────────────────────────────────────────────────────────────
  H.reset();
  WA.store.init();
  H.setSettings({ enabled: true, includeBlueprint: true, includeRules: true,
    includeTier: true, includeTheme: true, maxNotes: 4 });
  WA.rulePack.setSettings({ enabled: false });   // 出厂态：关着

  // B1 出厂态打包：两块拿到、两块如实缺
  const p1 = H.pack();
  a(p1.ok === true, 'v2273/B1a: 打包成功（缺块不影响出包）');
  a(p1.complete === false, 'v2273/B1b: 缺块时 complete 为 false（不静默）');
  a(p1.missing.length >= 1, 'v2273/B1c: missing 逐条列出（实 ' + p1.missing.length + '）');
  const mRules = p1.missing.filter(function (m) { return m.id === 'rules'; })[0];
  a(!!mRules && mRules.why === 'disabled', 'v2273/B1d: 规则包缺的原因逐字带出 disabled');
  const mBp = p1.missing.filter(function (m) { return m.id === 'blueprint'; })[0];
  a(!!mBp && mBp.why === 'empty-blueprint', 'v2273/B1e: 蓝图缺的原因是引擎自己的 empty-blueprint（不另编一个）');
  a(p1.missing.every(function (m) { return m.label && m.why; }), 'v2273/B1f: 每条缺块都带 label 与 why');
  a(typeof p1.note === 'string' && p1.note.indexOf('复不出完整的一局') >= 0,
    'v2273/B1g: note 明说「缺块的包仍可用但复不出完整一局」');
  a(Object.keys(p1.blocks).length >= 1, 'v2273/B1h: 拿到的块真的装进包里');

  // B2 verify：按块分列，蓝图的 checkable 必须为 true（它有自己的校验口）
  const v1 = H.verify(p1);
  a(v1.verdict === 'partial', 'v2273/B2a: 缺块包判 partial（不是 restorable / unusable）');
  a(v1.rows.length === 4, 'v2273/B2b: 四块各一行（含缺的）');
  const rTier = v1.rows.filter(function (r) { return r.id === 'tier'; })[0];
  a(rTier.present === true && rTier.ok === true, 'v2273/B2c: 拿到的块判可用');
  const rBp = v1.rows.filter(function (r) { return r.id === 'blueprint'; })[0];
  a(rBp.present === false && rBp.ok === false, 'v2273/B2d: 缺的块如实判不可用');
  // checkable 只在「块在场」时才有意义：缺块那行无从校验，故不设该字段（缺字段 ≠ false）。
  //   要判「蓝图有没有真走 checkIntegrity」，必须**构造一份带蓝图的包**再看那一行。
  //   ⚠ 这一小段必须**不留状态**：它把 rulePack 临时打开只是为了拿到一份带蓝图的包，
  //     用完立刻关回去 —— 否则后面 B5 的前置（rulePack 关着）会被它污染（首跑即此）。
  const kRuleOn = WA.rulePack.getSettings().enabled;
  WA.rulePack.setSettings({ enabled: true });
  const pBp = H.pack();
  WA.rulePack.setSettings({ enabled: kRuleOn });
  if (Object.prototype.hasOwnProperty.call(pBp.blocks, 'blueprint')) {
    const vb = H.verify(pBp);
    const rb = vb.rows.filter(function (r) { return r.id === 'blueprint'; })[0];
    a(rb.present === true && rb.checkable === true, 'v2273/B2e: 蓝图块在场时标 checkable（它有自己的校验口）');
  } else {
    // 空世界取不到蓝图 ⇒ 这条判据无法在真现场成立：如实跳过并说明，不假装通过。
    a(cnt(rd(ENG_HP), "b.id === 'blueprint'") === 1,
      'v2273/B2e: 无蓝图可取时，以源码里存在蓝图专属校验分支为据（不假装跑过）');
  }
  a(rTier.checkable === false, 'v2273/B2f: 无独立校验口的块如实标 checkable:false（不假装校过）');

  // B3 verify 的三种坏形状
  a(H.verify(null).verdict === 'bad-shape', 'v2273/B3a: 非对象判 bad-shape');
  a(H.verify({ ver: 999, blocks: {} }).verdict === 'unusable', 'v2273/B3b: 版本不符 + 无块 ⇒ unusable');
  const vBad = H.verify({ ver: H.PACK_VER, blocks: {} });
  a(vBad.verdict === 'unusable' && vBad.problems.length > 0, 'v2273/B3c: 空块表判 unusable 并带 problems');

  // B4 suggest：缺块给出口，且**不代开**
  const s1 = H.suggest(p1);
  a(s1.ok === true, 'v2273/B4a: 建议可出');
  a(s1.rows.some(function (r) { return r.code === 'missing-rules'; }), 'v2273/B4b: 规则包缺 → 有对应建议');
  const rulesRow = s1.rows.filter(function (r) { return r.code === 'missing-rules'; })[0];
  a(rulesRow.text.indexOf('把开关打开') >= 0, 'v2273/B4c: 建议写「去打开」而不是替它打开');
  a(s1.rows.some(function (r) { return r.code === 'restore-order'; }), 'v2273/B4d: 给出复原顺序');
  a(s1.total >= s1.rows.length, 'v2273/B4e: 截断看得见（total ≥ 实列）');
  const s2 = H.suggest(p1, {});
  const capped = H.suggest(p1);
  const sMax = (function () { H.setSettings({ maxNotes: 1 }); const r = H.suggest(p1); H.setSettings({ maxNotes: 4 }); return r; })();
  a(sMax.rows.length === 1, 'v2273/B4f: maxNotes 生效');

  // B5 打开 rulePack 后重打：规则块进包（但**本模块没去开它**）
  WA.rulePack.setSettings({ enabled: true, packs: [{ name: 'probe', keys: [{ k: 'a' }], at: 1 }] });
  const p2 = H.pack();
  a(p2.blocks.rules !== undefined, 'v2273/B5a: 开了规则包后该块进包');
  a(cnt(rd(ENG_HP), 'WA.rulePack.setSettings(') === 0, 'v2273/B5b: 本模块源码里仍零调用（开是玩家开的）');

  // B6 restore：只复原指定块，部分成功如实
  const before = WA.capabilityTier.getSettings().tier;
  const r1 = H.restore(p1, { only: ['tier'] });
  a(r1.ok === true, 'v2273/B6a: 只复原一块时 ok 为 true（没有失败项）');
  a(j(r1.applied) === j(['tier']), 'v2273/B6b: applied 逐字带出（实 ' + j(r1.applied) + '）');
  a(j(r1.failed) === j([]), 'v2273/B6c: failed 为空');
  a(r1.skipped.length >= 1, 'v2273/B6d: 未选的块进 skipped（不是 vanished）');
  a(r1.skipped.every(function (s) { return s.why === 'not-selected' || s.why === 'missing'; }),
    'v2273/B6e: skipped 带原因');
  // 全量复原时，缺块的块应进 skipped(missing) 而不是 failed
  const r2 = H.restore(p1);
  a(r2.applied.indexOf('tier') >= 0, 'v2273/B6f: 全量复原时拿到的块真被复原');
  a(r2.failed.every(function (f) { return f.why !== 'missing'; }), 'v2273/B6g: 缺块进 skipped 而非 failed（两态分开）');

  // B7 restore 的拒绝路径
  a(H.restore({ ver: H.PACK_VER, blocks: {} }).reason === 'unusable', 'v2273/B7a: 不可用包拒绝复原');
  H.setSettings({ enabled: false });
  a(H.restore(p1).reason === 'disabled', 'v2273/B7b: 关着时拒绝复原');
  a(H.pack().reason === 'disabled', 'v2273/B7c: 关着时不打包');
  H.setSettings({ enabled: true });

  // B8 include* 开关真的生效（关掉某块 ⇒ 该块进 missing 且 why=excluded）
  const p3 = H.pack({ includeRules: false });
  const m3 = p3.missing.filter(function (m) { return m.id === 'rules'; })[0];
  a(!!m3 && m3.why === 'excluded', 'v2273/B8a: 主动排除的块 why 标 excluded（与「拿不到」分开）');
  a(H.suggest(p3).rows.every(function (r) { return r.code !== 'missing-rules'; }),
    'v2273/B8b: 主动排除不该给「去打开」的建议');

  // B9 stat 面
  const st = H.stat();
  a(st.sources.worldBlueprint === true, 'v2273/B9a: stat 报世界蓝图源在位');
  a(st.sources.rulePack === true, 'v2273/B9b: stat 报规则包源在位');
  a(st.sources.capabilityTier === true, 'v2273/B9c: stat 报档位源在位');
  a(st.missingBlocks >= 1, 'v2273/B9d: 缺块计数真在涨（不是恒 0）');
  a(typeof st.lastReason === 'string' && st.lastReason.length > 0, 'v2273/B9e: lastReason 记最近一次结论');

  // ── C 零写盘不变式（pack / verify / suggest 全程不碰世界）──────────────
  const snapBefore = j(WA.store.get());
  for (let i = 0; i < 5; i++) { H.pack(); H.verify(p1); H.suggest(p1); }
  const snapAfter = j(WA.store.get());
  a(snapBefore === snapAfter, 'v2273/C1: 读侧三口零写盘（只有 restore 会写）');

  // ── N 真源码破坏 + 两向自证 ────────────────────────────────────────────
  function loadBroken(srco) {
    const sandboxWA = {
      store: WA.store, settingsBus: WA.settingsBus,
      worldBlueprint: WA.worldBlueprint, rulePack: WA.rulePack,
      capabilityTier: WA.capabilityTier, backstage: WA.backstage,
      registerModule: function () {}
    };
    const G2 = { WorldAxis: sandboxWA };
    const fn = new Function('window', 'global', srco);
    fn(G2, G2);
    return sandboxWA;
  }

  // N1 破坏「缺块进 missing」⇒ 缺块凭空消失（包看起来完整）
  {
    const bad = Ec.replace(ANCHOR.pvMissingPush, 'else { /* dropped */ }');
    a(bad !== Ec, 'v2273/N1a: N1 源码破坏成功（锚点命中）');
    const w = loadBroken(bad);
    WA.rulePack.setSettings({ enabled: false });
    const rv = H.pack();
    a(rv.missing.length >= 1, 'v2273/N1b: 原版上缺块被列出（两向自证正向半边）');
    const rb = w.handoffPack.pack();
    a(rb.missing.length === 0 && rb.complete === true,
      'v2273/N1c: 破坏副本上缺块消失、包自称完整（正是本版要防的）');
  }

  // N2 破坏 complete 判据 ⇒ 同一现场 complete 恒 true
  {
    const bad = Ec.replace(ANCHOR.pvComplete, 'const complete = true;');
    a(bad !== Ec, 'v2273/N2a: N2 源码破坏成功（锚点命中）');
    const w = loadBroken(bad);
    WA.rulePack.setSettings({ enabled: false });
    a(H.pack().complete === false, 'v2273/N2b: 原版上缺块 ⇒ complete false（两向自证正向半边）');
    a(w.handoffPack.pack().complete === true, 'v2273/N2c: 破坏副本上 complete 恒 true');
  }

  // N3 破坏「部分成功」判据 ⇒ 有失败项也报 ok:true
  {
    const bad = Ec.replace(ANCHOR.pvPartial, 'const okAll = true;');
    a(bad !== Ec, 'v2273/N3a: N3 源码破坏成功（锚点命中）');
    const w = loadBroken(bad);
    // 造一个必然失败的复原：块在包里但引擎被摘掉
    const pk = H.pack({ includeRules: true });
    pk.blocks.rules = { name: 'x', keys: [] };
    const kR = WA.rulePack;
    WA.rulePack = undefined;
    a(H.restore(pk).ok === false, 'v2273/N3b: 原版上复原失败时 ok false（两向自证正向半边）');
    a(w.handoffPack.restore(pk).ok === true, 'v2273/N3c: 破坏副本上失败被折成成功');
    WA.rulePack = kR;
  }

  // N4 破坏 verify 的蓝图真校验 ⇒ 空壳蓝图也判可用
  {
    const bad = Ec.replace(ANCHOR.pvIntegrity, '? { ok: true, problems: [] }');
    a(bad !== Ec, 'v2273/N4a: N4 源码破坏成功（锚点命中）');
    const w = loadBroken(bad);
    const pk = { ver: H.PACK_VER, blocks: { blueprint: { nope: 1 }, tier: { tier: 'lite' } } };
    const rv = H.verify(pk);
    a(rv.verdict === 'partial', 'v2273/N4b: 原版上空壳蓝图验不过（两向自证正向半边）');
    const rb = w.handoffPack.verify(pk);
    a(rb.verdict !== 'partial' || rb.rows.filter(function (r) { return r.id === 'blueprint'; })[0].ok === true,
      'v2273/N4c: 破坏副本上空壳蓝图被判可用');
  }

  // N5 破坏「块内取数失败时把引擎的 reason 原样带出」⇒ 原因塌成 not-ok
  //   （「引擎报了个具体原因」与「读不到」在读数上同形，读者无从处置）。
  //   ⚠ 这一行在两块（blueprint / rules）里**各出现一次（实 2）**，故不假装唯一：
  //     断言「恰 2 次、且替换后两处都变」，再在破坏副本上看现形。
  {
    const A_BP = "if (r.ok !== true) return { ok: false, why: str(r.reason || 'not-ok', 32) };";
    a(cnt(Ec, A_BP) === 2, 'v2273/N5a: 锚点（引擎原因带出行）恰 2 次，两块各一（实 ' + cnt(Ec, A_BP) + '）');
    const bad = Ec.split(A_BP).join("if (r.ok !== true) return { ok: false, why: 'not-ok' };");
    a(bad !== Ec && cnt(bad, A_BP) === 0, 'v2273/N5a2: N5 源码破坏成功（两处都换掉、语法完整）');
    const w = loadBroken(bad);
    // 现场：把 blueprint 引擎摘掉 ⇒ 原版给出具体的 absent；破坏副本只剩 not-ok
    const kB = WA.worldBlueprint;
    WA.worldBlueprint = undefined;
    const mno = H.pack().missing.filter(function (m) { return m.id === 'blueprint'; })[0];
    a(!!mno && mno.why === 'absent', 'v2273/N5b: 原版上原因逐字带出 absent（两向自证正向半边）');
    const mnb = w.handoffPack.pack().missing.filter(function (m) { return m.id === 'blueprint'; })[0];
    a(!!mnb && mnb.why === 'not-ok', 'v2273/N5c: 破坏副本上原因塌成 not-ok（「不在场」与「读不到」同形）');
    WA.worldBlueprint = kB;
  }

  // N6 负控制全程未改真源码与真设置
  a(rd(ENG_HP) === Ec, 'v2273/N6a: 负控制后引擎源码逐字未变');
  a(H.getSettings().enabled === true, 'v2273/N6b: 负控制后真设置逐字未变');

  console.log('EXV6-9 handoff-pack-v2273: 全部通过');
  return true;
}
// 挂载面：tests/run.js 用 runLock('./handoff-pack-v2273.js','runAll') 调它；
//   缺这一行时全量回归会记 NO runAll（独立跑绿、回归记红的假红）。
module.exports = { runAll: runAll };
if (require.main === module) {
  runAll();
}
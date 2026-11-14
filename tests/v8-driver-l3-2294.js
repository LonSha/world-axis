'use strict';
/**
 * v2.294.0（V8 OPV8-4）：驱动台账「假阴性」与 L3 处置线专锁
 *
 * 这一锁要挡的是什么（先说缺口）：
 *   OPV8-4 要求「34 台 L3 逐台下裁决」。实测这 10 台（L3a 4 + L3b 6）**每一台都有
 *   产品内真实消费者**，被判成 L3 是**驱动分层算法自己的假阴性**，不是功能悬空：
 *
 *     ① core/interceptor.js 用 `window.worldAxisGenerateInterceptor = async function`
 *        把自己交给 SillyTavern。它没有 buildBlock（不进盘点表）、命名空间也不是自证面，
 *        于是它在轮边界（before/after 链、输出净化、MESSAGE_DELETED）发出的全部调用边
 *        被 reachSet 丢掉 —— antiOmniscience / moodGlide / oneShotMod / outputGuard /
 *        personaAnchor 五台「每轮都被调」的引擎因此被写成「没人喂」。
 *     ② WA.actionDesk 给出 L2r 的路由表，但本体没有 buildBlock、不进盘点表，
 *        于是 engines/action-desk.js:855 对 survival.statusOf(w) 的真实调用也被丢掉
 *        —— survival 被写成「谁都不碰」。
 *
 *   两处都是账本自己注释里警告过的那个病：把「有人喂」写成「没人喂」。
 *
 * 为什么不能靠「放开 render/ui 参与扩散」修（本锁必须守住的反方向）：
 *   注入链有 103 个 buildBlock 分支，覆盖盘点面 112 台中的 103 台（92%）。让它参与扩散，
 *   L2e 会暴涨、L3 整档归零 —— 那正是 tests/v7-driver-ledger-2275.js 的 N3 负控所挡的
 *   「洗白」形态。覆盖率 92% 的面没有区分度，它只说得出「注入链会读它」。
 *   所以本锁同时钉住**上界**：L3 不许被洗成 0（不做过度修复）。
 *
 * 验收口径（六向）：
 *   P1 完整预取面下能下结论、且假阴性根治：轮边界五台 + survival 全部不在 L3
 *   P2 修的是「入口边」而不是无差别放宽：reachEntry 计数 > 0 且这些边有具名驱动者
 *   P3 由注入链消费的 L3a 四台仍在（不洗白），且 hint 如实说「注入链在消费」而不是
 *      「开关开着也不会出内容」（那是本轮实际修掉的假读数）
 *   P4 每台 L3 都有处置记录：能说出「谁在读它 / 缺的是什么入口」
 *   P5 分层七档合计 = 盘点总数（计数守恒），L3b 未被虚报
 *   P6 反方向守卫：放开 render/ui 扩散后 L3 必须被洗成 0（证明本锁的 P3 不是恒真）
 *
 * 负控制（真源码破坏，两向自证）：
 *   N1 破坏「入口播种」⇒ 轮边界引擎退回 L3（回到修复前的假阴性）
 *   N2 破坏「routesFace 判定」⇒ L2r 整档清空、路由驱动引擎退层（回到升级前的分层）
 *   N3 破坏「目录过滤」放开 render/ui ⇒ L3 被洗成 0（P3 的现形方向）
 *
 *   【v2.407.0 跟位】driver-ledger 引入 L2r（actionDesk.ROUTES 路由登记面）后：
 *   dream / gauge / moodGlide / survival 被路由表登记为可执行动作 ⇒ 合法升入 L2r；
 *   floorSnapshot 仍无任何驱动登记（路由没登记它）⇒ 恒留 L3a，P3 的「不洗白」判据保住。
 *   P1b / P2c / N1 / N2 的期望名单据此逐条跟位（判据形态未变，只跟分层事实）。
 */
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
const { load, must1 } = require('./v8-harness.js');

const ENG_REL = 'engines/driver-ledger.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }

/** 装配完整预取面（与 tests/v7-driver-ledger-2275.js 的 setPrefetch 同构）。 */
function setPrefetch(WA) {
  const DIRS = ['ui', 'engines', 'core', 'render', 'actors', 'direction', 'compat', 'design'];
  const all = [];
  (function walk(dir) {
    let ents = [];
    try { ents = fs.readdirSync(path.join(BASE, dir), { withFileTypes: true }); } catch (e) { return; }
    for (const ent of ents) {
      const rel = dir + '/' + ent.name;
      if (ent.isDirectory()) walk(rel); else if (ent.name.endsWith('.js')) all.push(rel);
    }
  })('ui');
  for (const d of DIRS) {
    if (d === 'ui') continue;
    (function walk(dir) {
      let ents = [];
      try { ents = fs.readdirSync(path.join(BASE, dir), { withFileTypes: true }); } catch (e) { return; }
      for (const ent of ents) {
        const rel = dir + '/' + ent.name;
        if (ent.isDirectory()) walk(rel); else if (ent.name.endsWith('.js')) all.push(rel);
      }
    })(d);
  }
  all.push('index.js');
  const pf = new Map();
  for (const rel of all) {
    let t = '';
    try { t = rd(rel); } catch (e) { continue; }
    if (t && t.length >= 16) pf.set(rel, t);
  }
  WA.baseUrl = '';
  WA.__prefetch = pf;
  WA.__loadOrder = all.slice();
  return WA;
}

/** 被假阴性误伤的六台（五台轮边界 + survival）。 */
const MISLABELED = ['antiOmniscience', 'moodGlide', 'oneShotMod', 'outputGuard',
  'personaAnchor', 'survival'];
/** 由注入链消费、没有独立驱动登记入口的引擎（真实 L3a，不该被洗白）。
 *   v2.295.0（V9）：injectCollector 获得面板设置控件（「结构汇流选材」分区），
 *   由 L3a 升为 L2p（面板驱动）—— 不再列在本表，另由 P3f 单独钉住。
 *   v2.407.0 跟位：dream / gauge 被 actionDesk.ROUTES 登记了可执行动作
 *   （dream.weave、dream.archive、gauge.create、gauge.step）⇒ 合法升为 L2r，
 *   不再列在本表，另由 P3g 单独钉住；只剩 floorSnapshot 仍恒留 L3a。 */
const INJECT_CONSUMED = ['floorSnapshot'];
/** v2.407.0 跟位：被路由表升级的注入链消费引擎（L2r 如实跟位）。 */
const ROUTED_UPGRADED = ['dream', 'gauge'];

function runAll(assertFn) {
  const a = assertFn || function (c, m) { if (!c) throw new Error(m); };
  const WA = setPrefetch(load(null));
  const v = WA.driverLedger.view();

  // ── P0 前提：这一面必须真能下结论，否则后面的「不在 L3」可能是「没读全」 ──
  a(v.scan.canConclude === true, 'P0: 完整预取面下可以下结论（实 canConclude=' + v.scan.canConclude + '）');
  a(v.scan.level === 'prefetch', 'P0b: 扫描面是 prefetch（实 ' + v.scan.level + '）');
  a(v.total > 0, 'P0c: 确实盘点到了带 buildBlock 的引擎（实 ' + v.total + '）');

  // ── P1 假阴性根治：六台不许留在 L3 ──
  const l3 = (v.layerNames.L3a || []).concat(v.layerNames.L3b || []);
  const still = MISLABELED.filter(function (ns) { return l3.indexOf(ns) >= 0; });
  a(still.length === 0, 'P1: 六台被假阴性误伤的引擎全部离开 L3（仍在 ' + JSON.stringify(still) + '）');
  // 每一台的具体落层也要核：修完应进 L2e（引擎互调/入口驱动），不是别的档。
  //   v2.407.0 跟位：moodGlide / survival 被 actionDesk 路由表登记（L2r），
  //   其余四台仍落 L2e。判据从「六台全在 L2e」改为「六台各在其升级后的档」。
  const IN_L2R = ['moodGlide', 'survival'];
  const IN_L2E = MISLABELED.filter(function (ns) { return IN_L2R.indexOf(ns) < 0; });
  const wrong = MISLABELED.filter(function (ns) {
    const tgt = IN_L2R.indexOf(ns) >= 0 ? v.layerNames.L2r : v.layerNames.L2e;
    return (tgt || []).indexOf(ns) < 0;
  });
  a(wrong.length === 0, 'P1b: 六台各落其升级后的档（moodGlide/survival→L2r，其余→L2e；不在的：' + JSON.stringify(wrong) + '）');
  const wrongE = IN_L2E.filter(function (ns) { return (v.layerNames.L2e || []).indexOf(ns) < 0; });
  a(wrongE.length === 0, 'P1b2: 四台引擎互调档仍落 L2e（不在的：' + JSON.stringify(wrongE) + '）');

  // ── P2 修的是「入口边」：计数可观测且驱动者具名 ──
  a(v.scan.reachEntry > 0, 'P2: 入口边计数可见且非零（实 ' + v.scan.reachEntry + '）');
  a(Array.isArray(v.scan.reachEntryList) && v.scan.reachEntryList.length === v.scan.reachEntry,
    'P2b: 入口边名单条数与计数一致（' + (v.scan.reachEntryList || []).length + ' vs ' + v.scan.reachEntry + '）');
  const roundBoundary = ['antiOmniscience', 'moodGlide', 'oneShotMod', 'outputGuard', 'personaAnchor'];
  //   v2.407.0 跟位：moodGlide 的 hint 现在是 L2r 路由形态（「actionDesk 路由表给它登记了
  //   可执行动作：…」），不再是「被可达引擎调用」。判据改为「hint 点名到成员」：
  //   L2e 形态点「引擎.成员」，L2r 形态点「命名空间.动作」——都算点名，不收笼统话术。
  const missingVia = roundBoundary.filter(function (ns) {
    const w = WA.driverLedger.why(ns);
    if (/被可达引擎调用：[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*/.test(w.hint)) return false;
    if (/actionDesk 路由表给它登记了可执行动作：[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*/.test(w.hint)) return false;
    return true;
  });
  a(missingVia.length === 0, 'P2c: 轮边界五台的驱动者都能点出「引擎.成员/命名空间.动作」（缺：' + JSON.stringify(missingVia) + '）');

  // ── P3 不洗白：注入链消费的四台仍在，且措辞如实 ──
  INJECT_CONSUMED.forEach(function (ns) {
    const row = v.layerNames.L3a || [];
    a(row.indexOf(ns) >= 0, 'P3(' + ns + '): 仍在 L3a —— 注入链消费不是驱动入口，不许洗白');
    const w = WA.driverLedger.why(ns);
    a(/注入链消费/.test(w.hint), 'P3b(' + ns + '): hint 点出「注入链消费」这一事实（实 ' + w.hint.slice(0, 60) + '…）');
    a(/不是驱动入口/.test(w.hint), 'P3c(' + ns + '): hint 说清「那不是驱动入口」（不把读侧当驱动）');
  });
  // ── P3f v2.295.0（V9）升档如实跟位：injectCollector 有了真面板控件 ──
  a((v.layerNames.L2p || []).indexOf('injectCollector') >= 0,
    'P3f(injectCollector): V9 面板设置分区落成 ⇒ 由 L3a 升为 L2p（面板驱动，不再挂孤儿档）');
  a((v.layerNames.L3a || []).indexOf('injectCollector') < 0,
    'P3f2(injectCollector): 不再被误标为「只被诊断面读」（L3a 名单不含它）');
  // ── P3g v2.407.0 升档如实跟位：dream / gauge 被路由表登记 ⇒ 由 L3a 升为 L2r ──
  ROUTED_UPGRADED.forEach(function (ns) {
    a((v.layerNames.L2r || []).indexOf(ns) >= 0,
      'P3g(' + ns + '): 路由表登记了可执行动作 ⇒ 由 L3a 升为 L2r（升档如实）');
    a((v.layerNames.L3a || []).indexOf(ns) < 0,
      'P3g2(' + ns + '): 不再挂「只被诊断面读」档（L3a 名单不含它）');
    const w = WA.driverLedger.why(ns);
    a(/actionDesk 路由表给它登记了可执行动作/.test(w.hint),
      'P3g3(' + ns + '): hint 如实点出路由登记（实 ' + w.hint.slice(0, 50) + '…）');
  });
const summary = WA.driverLedger.summaryText();
  // 本轮实际修掉的假读数：原句「这 N 个机制开关开着也不会出内容」对 L3a 是假话
  a(!/开关开着也不会出内容/.test(summary),
    'P3d: 摘要不再把 L3a 说成「开关开着也不会出内容」（实测 dream 启用即产出）');
  a(/注入链/.test(summary), 'P3e: 摘要点出 L3a 的真实病因是缺驱动登记入口而不是不出内容');

  // ── P4 每台 L3 都有处置记录：能说出谁在读、缺什么 ──
  const allL3 = (v.layerNames.L3a || []).concat(v.layerNames.L3b || []);
  const noDisposition = allL3.filter(function (ns) {
    const w = WA.driverLedger.why(ns);
    return !w.ok || !w.hint || w.hint.length < 10;
  });
  a(noDisposition.length === 0,
    'P4: 每台 L3 都有可说清的处置记录（缺：' + JSON.stringify(noDisposition) + '）');

  // ── P5 计数守恒 + L3b 不虚报 ──
  const sum = Object.keys(v.counts).reduce(function (s, k) { return s + (v.counts[k] || 0); }, 0);
  a(sum === v.total, 'P5: 七档合计 = 盘点总数（' + sum + ' vs ' + v.total + '）');
  a(v.counts.L3b === (v.layerNames.L3b || []).length,
    'P5b: L3b 计数与名单一致（' + v.counts.L3b + ' vs ' + (v.layerNames.L3b || []).length + '）');

  // ── P6 反方向守卫：放开 render/ui 扩散必须把 L3 洗成 0（否则 P3 不成立） ──
  const broken = must1(rd(ENG_REL),
    "return r.indexOf('engines/') === 0 || r.indexOf('core/') === 0;",
    'return true;');
  const W2 = setPrefetch(load({ [ENG_REL]: broken }));
  const v2 = W2.driverLedger.view();
  a((v2.counts.L3a + v2.counts.L3b) === 0,
    'P6: 放开 render/ui 扩散后 L3 被洗成 0（实 ' + (v2.counts.L3a + v2.counts.L3b)
    + '）—— 证明 P3 的「留在 L3a」不是恒真，是本锁真在挡的事');
}

function runNegative(assertFn) {
  const a = assertFn || function (c, m) { if (!c) throw new Error(m); };
  const src = rd(ENG_REL);

  // ── N1 破坏「宿主入口播种」⇒ 五台轮边界引擎退回 L3（回到修复前的假阴性） ──
  {
    const bad = must1(src, "if (/window\\.[A-Za-z_$][\\w$]*\\s*=\\s*(async\\s+)?function/.test(src)) f.entry = true;",
      'if (false) f.entry = true;');
    const W = setPrefetch(load({ [ENG_REL]: bad }));
    const v = W.driverLedger.view();
    //   v2.407.0 跟位：moodGlide / survival 已由 actionDesk 路由面驱动（L2r），入口播种
    //   破坏不影响它们；会被打回 L3 的是仍依赖宿主入口播种的 antiOmniscience / outputGuard。
    const back = ['antiOmniscience', 'outputGuard']
      .filter(function (ns) { return (v.layerNames.L3a || []).concat(v.layerNames.L3b || []).indexOf(ns) >= 0; });
    a(back.length === 2,
      'N1（现形）：拿掉入口播种 ⇒ 依赖宿主入口的两台退回 L3（实 ' + back.length + '）：'
      + JSON.stringify(back) + ' —— 这就是修复前的假阴性');
    // 两向：原版上同款判据必须真的没有它们
    const WO = setPrefetch(load(null));
    const vo = WO.driverLedger.view();
    const backO = ['antiOmniscience', 'outputGuard']
      .filter(function (ns) { return (vo.layerNames.L3a || []).concat(vo.layerNames.L3b || []).indexOf(ns) >= 0; });
    a(backO.length === 0, 'N1b（两向）：原版上这两台都不在 L3（实 ' + backO.length + '）');
  }

  // ── N2 破坏「routesFace 判定」⇒ L2r 整档清空，路由驱动的引擎退层（v2.407.0 跟位） ──
  //   L2r 现由 engines/driver-ledger.js routesFace() 的 Array.isArray 判定直读
  //   WA.actionDesk.ROUTES；破坏它 ⇒ 路由登记面整体失效，dream/gauge/moodGlide/survival
  //   退到 L2e（互调面兜住），floorSnapshot 不受影响仍 L3a（它本来就没被路由登记）。
  {
    const bad = must1(src, 'if (Array.isArray(r)) {', 'if (false) {');
    const W = setPrefetch(load({ [ENG_REL]: bad }));
    const v = W.driverLedger.view();
    a((v.layerNames.L2r || []).length === 0,
      'N2（现形）：破坏 routesFace 判定 ⇒ L2r 整档清空（实 ' + (v.layerNames.L2r || []).length + '）');
    const ROUTED = ['dream', 'gauge', 'moodGlide', 'survival'];
    const fell = ROUTED.filter(function (ns) {
      return (v.layerNames.L3a || []).concat(v.layerNames.L3b || []).indexOf(ns) >= 0;
    });
    a(fell.length === 0,
      'N2b（现形）：路由驱动引擎退层后仍不许掉进 L3（掉进的：' + JSON.stringify(fell) + '）');
    const WO = setPrefetch(load(null));
    const vo2 = WO.driverLedger.view();
    const inL2r = ROUTED.filter(function (ns) { return (vo2.layerNames.L2r || []).indexOf(ns) >= 0; });
    a(inL2r.length === ROUTED.length,
      'N2c（两向）：原版上四台都在 L2r（实 ' + inL2r.length + '）：' + JSON.stringify(inL2r));
  }

  // ── N3 破坏「目录过滤」⇒ L3 被洗成 0（P3/P6 的现形方向） ──
  {
    const bad = must1(src, "return r.indexOf('engines/') === 0 || r.indexOf('core/') === 0;",
      'return true;');
    const W = setPrefetch(load({ [ENG_REL]: bad }));
    const v = W.driverLedger.view();
    a((v.counts.L3a + v.counts.L3b) === 0,
      'N3（现形）：放开扩散范围 ⇒ L3 整档归零（实 ' + (v.counts.L3a + v.counts.L3b) + '）');
    const WO = setPrefetch(load(null));
    const vo = WO.driverLedger.view();
    a((vo.counts.L3a + vo.counts.L3b) > 0,
      'N3b（两向）：原版上 L3 非空（实 ' + (vo.counts.L3a + vo.counts.L3b) + '）—— 判据不是恒真');
  }
}

module.exports = { runAll, runNegative, MISLABELED, INJECT_CONSUMED };

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (c, name) { if (c) pass++; else { fail++; console.error('FAIL: ' + name); } };
  try { runAll(a); } catch (e) { fail++; console.error('THROW(runAll): ' + e.message); }
  try { runNegative(a); } catch (e) { fail++; console.error('THROW(runNegative): ' + e.message); }
  console.log('v8-driver-l3-2294: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail > 0 ? 1 : 0);
}
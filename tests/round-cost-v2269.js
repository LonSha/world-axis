'use strict';
/**
 * v2.269.0（V6 · EXV6-5）专锁：**单轮成本卡 —— 这一轮我花了多少上下文**
 *
 * ── 这一版治的是什么（现场立据见 tools/v6probes/p_roundcost.js）────────────
 * 实测三个面各自知道一部分：injectBudget（本轮 512/2400t、余量、档位口径）、
 *   injectValue（在册源 / 引用率 / 采纳率 / 零引用连击）、perfLedger（耗时趋势）。
 *   但它们分散在概览页「④ 性能趋势」段、预算段、注入价值榜单三处，
 *   没有任何一处把它们并列成一张卡 —— 玩家要自己对轮次坐标才能拼出「这一轮值不值」。
 *
 * ── 本版四条「不许」（每条都在 N 段配真源码破坏与两向自证）────────────────
 *   ① 读不到 ≠ 零成本（`no-reading` 时 `used` 必须是 null）；
 *   ② 榜单 ≠ 全集（`rows` 被 topN 截断，必须报 `capped` 与全量 `flaggedAll`）；
 *   ③ 长期趋势 ≠ 本轮读数（默认不读，读一次记一次）；
 *   ④ token ≠ 字符（不互算，两栏并存）。
 *
 * ── 段结构 ────────────────────────────────────────────────────────────────
 *  A 静态契约（锚点各恰 1 次 / 零写面 / 导出面 / SELF 锚点纯度 H5）
 *  B 运行时（四态 / token 与字符分列 / 榜单截断 / 两桶分离 / 本轮耗时只认快照 / line）
 *  C 零写盘不变式（多次调用 store 逐字不变）
 *  N 真源码破坏 + 两向自证（N1~N7）
 */
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
const ENG_RC = 'engines/round-cost.js';
const SELF_REL = 'tests/round-cost-v2269.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }

const ANCHOR = {
  // 「本轮在册」与「更早轮次的历史条目」必须分开：`report` 覆盖最近 24 轮累计，
  //   拿历史条目当本轮零引用 = 把上个月没用上的源报成本轮白花。
  pvFresh: 'const isFresh = (roundNow !== null && lr !== null && lr === roundNow);',
  // 只有 fresh 参与零引用计数
  pvZeroFresh: 'if (num(r.refDistinctAvg) === 0) zeroFresh++;',
  // 榜单 ≠ 全集：截断必须现形
  pvCapped: 'const capped = boardCount > rows.length;',
  // 读不到 ≠ 零成本（锚点取**两行**：这一句的返回值横跨两行，只咬首行的话
//   破坏副本会被紧随其后的 `used: null` 覆盖回去，负控制当场变成假绿 —— 本仓踩过这一类）
  pvNoReading: "return { ok: false, reason: 'no-reading', state: 'no-reading',\n        used: null, cap: null, chars: null, round: null,",
  // 长期趋势必须显式开启才读
  pvLongGuard: 'if (cfg.showLongTrend === true) {',
  // 本轮耗时只认快照 cost（不是 trend）
  pvTimingSrc: "const cost = (b.cost && typeof b.cost === 'object') ? b.cost : null;"
};

function runAll(assertFn) {
  const a = assertFn || function (cond, msg) { if (!cond) throw new Error(msg); };
  require(path.join(BASE, 'tests/mock.js'));
  const WA = global.WorldAxis;
  require(path.join(BASE, 'core/store.js'));
  require(path.join(BASE, 'core/input-guard.js'));
  require(path.join(BASE, 'core/clock.js'));
  require(path.join(BASE, 'core/settings-bus.js'));
  require(path.join(BASE, 'engines/inject-budget.js'));
  require(path.join(BASE, 'engines/inject-value.js'));
  require(path.join(BASE, 'engines/perf-ledger.js'));
  require(path.join(BASE, 'engines/round-cost.js'));

  const RC = WA.roundCost;
  const IV = WA.injectValue;
  const Ec = rd(ENG_RC);
  const SELF = rd(SELF_REL);

  // ── A 静态契约 ──────────────────────────────────────────────────────────
  Object.keys(ANCHOR).forEach(function (k) {
    const c = cnt(Ec, ANCHOR[k]);
    a(c === 1, 'v2269/A1: 锚点 ' + k + ' 在 ' + ENG_RC + ' 恰中 1 次（实 ' + c + '）');
  });
  // H5 判据纯度：锚点字面量在 SELF 里只声明一次（判据不得引用锚点串）
  const dupA = Object.keys(ANCHOR).filter(function (k) { return cnt(SELF, ANCHOR[k]) > 1; });
  a(dupA.length === 0, 'v2269/A1f: 破坏锚点在 SELF 里只出现 1 次（越界：' + j(dupA) + '）');
  // 零写面。注：注释里出现字样不算调用，故咬**调用形态**（v2.268.0 暗流日历锁同一条教训）
  a(cnt(Ec, 'store.transact(') === 0, 'v2269/A2a: 零 store.transact 写调用');
  a(cnt(Ec, 'localStorage.getItem(') === 0 && cnt(Ec, 'localStorage.setItem(') === 0,
    'v2269/A2b: 零 localStorage 读写调用');
  a(cnt(Ec, 'saveOrThrow(') === 1, 'v2269/A2c: 唯一写入口是玩家显式 setSettings（saveOrThrow 恰 1 次）');
  a(cnt(Ec, 'injectValue.settle(') === 0, 'v2269/A2d: 本卡不结算任何东西（settle 是 interceptor 的职责）');
  a(typeof RC.build === 'function', 'v2269/A3: build 是函数');
  a(typeof RC.build().line === 'string', 'v2269/A3b: 人话一行由 build() 直接给出（导出面不另立 line 口）');
  a(typeof RC.stat === 'function', 'v2269/A3c: stat 是函数');
  a(typeof RC.reset === 'function', 'v2269/A3d: reset 是函数');
  a(RC.DEF && typeof RC.DEF.topN === 'number', 'v2269/A4: DEF 带 topN');
  a(RC.BOUNDS && Array.isArray(RC.BOUNDS.topN), 'v2269/A4b: BOUNDS 声明 topN 区间');
  a(RC.DEF.showLongTrend === false, 'v2269/A5: 出厂不读长期趋势（它不是本轮读数）');

  // ── B 运行时 ────────────────────────────────────────────────────────────
  RC.reset();
  WA.store.init();
  RC.setSettings({ enabled: true, topN: 4, showZero: true, showTiming: true, showLongTrend: false });
  IV.setSettings({ enabled: true });

  // B1 无读数态：读不到 ≠ 零成本
  WA.store.transact(function (d) { delete d.lastInjection; });
  const b1 = RC.build();
  a(b1.ok === false && b1.reason === 'no-reading', 'v2269/B1a: 无上一轮报 no-reading（不是 ok）');
  a(b1.state === 'no-reading', 'v2269/B1b: state 为 no-reading 态');
  a(b1.used === null, 'v2269/B1c: used 为 null —— 读不到绝不折成 0');
  a(b1.cap === null, 'v2269/B1d: cap 为 null');
  a(b1.line.indexOf('不是「零成本」') >= 0, 'v2269/B1e: line 明说「不是零成本」');

  // B2 关闭态
  RC.setSettings({ enabled: false });
  const b2 = RC.build();
  a(b2.ok === false && b2.reason === 'disabled', 'v2269/B2a: 关闭态报 disabled');
  a(b2.used === null, 'v2269/B2b: 关闭态也不伪造读数');
  RC.setSettings({ enabled: true });

  // B3 快照在但无预算裁决（曾经注入过、该轮没可裁项）
  WA.store.transact(function (d) { d.lastInjection = { at: 1, injected: true, len: 40, round: 3, sources: ['echoes'] }; });
  const b3 = RC.build();
  a(b3.state === 'empty' && b3.reason === 'no-budget', 'v2269/B3a: 无预算读数报 empty/no-budget');
  a(b3.chars === 40, 'v2269/B3b: 字符数照实带出');
  a(b3.used === null, 'v2269/B3c: 无裁决时 used 仍为 null（不拿字符数冒充 token）');

  // 造轮工具：写快照 + 让 injectValue 真结算一轮
  function settleRound(round, used, cap, cost, items, body) {
    WA.store.transact(function (d) {
      d.lastInjection = {
        at: round, injected: true, len: 640, round: round, sources: items.map(function (x) { return x.source; }), mainCount: items.length,
        budget: cost === null ? { used: used, cap: cap, budgetMode: 'manual', overBudget: false }
          : {
            used: used, cap: cap, source: 'default', contextSize: null, remain: cap - used,
            budgetMode: 'auto-noctx', overBudget: false,
            headroom: { remain: cap - used, usedPct: Math.round((used / cap) * 1000) / 10, freePct: Math.round(((cap - used) / cap) * 1000) / 10, saturated: false, avgKeptTokens: 256, spareSources: 7, note: '' },
            cost: cost, keptCount: items.length, folded: [], dropped: []
          }
      };
    });
    IV.observe({ round: round, items: items });
    return IV.settle(body);
  }

  // B4 完整读数：token 面 / 字符面分列
  const st7 = settleRound(7, 512, 2400, { measured: 12, totalMs: 31.4, slowest: { source: '晨报', ms: 12.1 }, unmeasuredCount: 0 },
    [{ source: '晨报', content: '乙簿线索' }, { source: '夜报', content: '丁册线索' }],
    '正文里提到乙簿线索，所以晨报被用上了。');
  a(st7.ok === true, 'v2269/B4a: 造轮成功（settle ok）');
  const b4 = RC.build({ topN: 12 });
  a(b4.state === 'live', 'v2269/B4b: 完整读数报 live');
  a(b4.used === 512 && b4.cap === 2400, 'v2269/B4c: token 用量与上限来自 budget 裁决');
  a(b4.remain === 1888, 'v2269/B4d: 余量取 headroom.remain');
  a(b4.usedPct === 21.3, 'v2269/B4e: 用量百分比');
  a(b4.chars === 640, 'v2269/B4f: 字符数单列（不参与 token 换算）');
  a(b4.used !== b4.chars, 'v2269/B4g: token 与字符是两个数（互算即造假）');
  a(b4.mode === 'auto-noctx', 'v2269/B4h: 档位原样带出');
  a(typeof b4.modeText === 'string' && b4.modeText.indexOf('量不到上下文窗口') >= 0,
    'v2269/B4i: 档位人话走 injectBudget.budgetView（不另写一份）');
  a(b4.servedCount === 2, 'v2269/B4j: 本轮在册源 2 个');
  a(j(b4.served) === j(['晨报', '夜报']), 'v2269/B4k: 源名逐字带出');
  a(b4.board.fresh === 2, 'v2269/B4l: 榜单里两条都是本轮在册');
  a(b4.board.stale === 0, 'v2269/B4m: 首轮无历史条目（stale 为 0，不恒真）');
  a(b4.board.zeroInBoard === 1, 'v2269/B4n: 本轮零引用恰 1（夜报没被引到）');
  a(b4.board.adopted.length === 1 && b4.board.adopted[0] === '晨报', 'v2269/B4o: 被引到的源单列出来');
  a(b4.judgedRounds === 1 && b4.zeroRefRounds === 3, 'v2269/B4p: 轮次坐标与连击阈值来自 injectValue 真读口');

  // B5 榜单截断：rows 截断、总数照报、capped 现形
  settleRound(8, 300, 2400, { measured: 3, totalMs: 9.1, slowest: { source: '午报', ms: 4.4 }, unmeasuredCount: 0 },
    [{ source: '午报', content: '戊卷线索' }, { source: '晚报', content: '己函线索' }],
    '这一轮正文没有提任何一个线索词。');
  const b5 = RC.build({ topN: 1 });
  a(b5.board.topN === 1, 'v2269/B5a: topN 生效');
  a(b5.board.rows === 1, 'v2269/B5b: 榜单只回 1 条');
  a(b5.board.total === 4, 'v2269/B5c: 在册源总数报 4（榜单被截断看得见）');
  a(b5.board.capped === true, 'v2269/B5d: capped 为 true');
  a(typeof b5.note === 'string' && b5.note.indexOf('不等于全体零引用') >= 0,
    'v2269/B5e: 截断时必须说「榜单内 ≠ 全体」');
  const b5full = RC.build({ topN: 12 });
  a(b5full.board.capped === false, 'v2269/B5f: 榜单装得下时 capped 为 false（不恒真）');
  a(b5full.board.rows === 4, 'v2269/B5g: 装得下时四条全出');

  // B6 「本轮在册」与「更早轮次」分桶（不得把历史当现在）
  //   到这一步台账里已有 7/8 轮的条目，只往第 9 轮注入一个源 ⇒ 榜单必然混着旧条目。
  settleRound(9, 100, 2400, { measured: 1, totalMs: 2.2, slowest: { source: '空源', ms: 2.2 }, unmeasuredCount: 0 },
    [{ source: '空源', content: '庚牍线索' }], '这一轮也没有提到任何线索词。');
  const b6 = RC.build({ topN: 12 });
  a(b6.board.fresh === 1, 'v2269/B6a: 本轮在册恰 1（只有快照里那一个源）');
  a(b6.board.stale >= 3, 'v2269/B6b: 更早轮次的条目被分进 stale（不参与本轮计数）');
  a(b6.board.fresh + b6.board.stale === b6.board.rows, 'v2269/B6c: fresh + stale 恰等于榜单条数（不重不漏）');
  a(b6.board.zeroInBoard === 1, 'v2269/B6d: 本轮零引用只数 fresh 那一条（历史零引用不算进来）');
  a(b6.line.indexOf('本轮开销') === 0, 'v2269/B6e: line 仍以「本轮开销」开头');
  a(b6.line.indexOf('更早轮次的源不列入本轮') >= 0, 'v2269/B6f: line 把「还有历史条目」说出来');
  a(typeof b6.note === 'string' && b6.note.indexOf('更早轮次') >= 0, 'v2269/B6g: note 明说历史条目不计入本轮');

  // B7 本轮耗时只认快照 cost；长期趋势默认不读
  settleRound(10, 512, 2400, { measured: 12, totalMs: 31.4, slowest: { source: '晨报', ms: 12.1 }, unmeasuredCount: 0 },
    [{ source: '晨报', content: '乙簿线索' }], '正文没有提线索词。');
  const b7 = RC.build({ topN: 4 });
  a(b7.timing && b7.timing.totalMs === 31.4, 'v2269/B7a: 本轮耗时取自快照 cost');
  a(b7.timing.slowest && b7.timing.slowest.source === '晨报', 'v2269/B7b: 最慢源逐字带出');
  a(b7.longTrend === null, 'v2269/B7c: 默认不读长期趋势（null 而不是「零劣化」）');
  const stLong = RC.stat();
  a(stLong.longTrendReads === 0, 'v2269/B7d: 默认路径上一次 trend 都没读');
  const b7on = RC.build({ showLongTrend: true });
  a(b7on.longTrend && b7on.longTrend.ok === true, 'v2269/B7e: 显式开启才读趋势');
  a(RC.stat().longTrendReads === stLong.longTrendReads + 1, 'v2269/B7f: 读一次记一次（可区分「没读」与「读了是平的」）');
  const b7off = RC.build({ showTiming: false });
  a(b7off.timing === null, 'v2269/B7g: showTiming 关掉时耗时不出现');
  a(b7off.used === b7.used, 'v2269/B7h: 关耗时不影响 token 读数');
  settleRound(11, 512, 2400, null, [{ source: '晨报', content: '乙簿线索' }], '正文没有提线索词。');
  a(RC.build({}).timing === null, 'v2269/B7i: 快照里没有 cost 时耗时为 null（不编 0ms）');

  // B8 line 人话
  settleRound(12, 512, 2400, { measured: 12, totalMs: 31.4, slowest: { source: '晨报', ms: 12.1 }, unmeasuredCount: 0 },
    [{ source: '晨报', content: '乙簿线索' }], '正文没有提线索词。');
  const ln = RC.build({ topN: 4 }).line;
  a(ln.indexOf('本轮开销') === 0, 'v2269/B8a: line 以「本轮开销」开头');
  a(ln.indexOf('512/2400t') >= 0, 'v2269/B8b: line 含 token 用量');
  a(ln.indexOf('ms') >= 0, 'v2269/B8c: line 含耗时');
  a(ln.indexOf('lastInjection') < 0 && ln.indexOf('budget') < 0 && ln.indexOf('headroom') < 0,
    'v2269/B8d: line 不含内部字段名');

  // B9 stat 面：源在位性可读
  const st1 = RC.stat();
  a(st1.sources && st1.sources.injectBudget === true, 'v2269/B9a: stat 报 injectBudget 在位');
  a(st1.sources.injectValue === true, 'v2269/B9b: stat 报 injectValue 在位');
  a(st1.sources.store === true, 'v2269/B9c: stat 报 store 在位');
  a(st1.cards >= 1, 'v2269/B9d: cards 计数在涨');
  a(st1.lastState === 'live', 'v2269/B9e: lastState 记最近一次判决');

  // ── C 零写盘不变式 ──────────────────────────────────────────────────────
  const snapBefore = j(WA.store.get());
  for (let i = 0; i < 5; i++) { RC.build(); RC.build().line; RC.stat(); }
  const snapAfter = j(WA.store.get());
  a(snapBefore === snapAfter, 'v2269/C1: 纯读聚合，store 零写盘不变');

  // ── N 真源码破坏 + 两向自证（破坏副本只装在内存沙箱上）────────────────
  function loadBroken(srco) {
    const sandboxWA = {
      store: WA.store, settingsBus: WA.settingsBus,
      injectBudget: WA.injectBudget, injectValue: WA.injectValue, perfLedger: WA.perfLedger,
      registerModule: function () {}
    };
    const G2 = { WorldAxis: sandboxWA };
    const fn = new Function('window', 'global', srco);
    fn(G2, G2);
    return sandboxWA;
  }

  // N1 破坏「only fresh 计入零引用」这一条 ⇒ 历史条目的零引用被算进本轮（把上个月报成本轮）
  const badN1 = Ec.replace(ANCHOR.pvZeroFresh, 'if (false) zeroFresh++;');
  a(badN1 !== Ec, 'v2269/N1a: N1 源码破坏成功（锚点命中）');
  const w1 = loadBroken(badN1);
  a(b6.board.zeroInBoard === 1, 'v2269/N1b: 原版上本轮零引用为 1（两向自证的正向半边）');
  a(w1.roundCost.build({ topN: 12 }).board.zeroInBoard === 0,
    'v2269/N1c: 破坏副本上零引用塌成 0 —— 这一桶真在被这样数');

  // N2 破坏「本轮在册」判定 ⇒ fresh/stale 不再分，历史条目混进本轮计数
  const badN2 = Ec.replace(ANCHOR.pvFresh, 'const isFresh = true;');
  a(badN2 !== Ec, 'v2269/N2a: N2 源码破坏成功（锚点命中）');
  const w2 = loadBroken(badN2);
  const rv2 = RC.build({ topN: 12 });
  a(rv2.board.fresh === 1 && rv2.board.stale >= 3, 'v2269/N2b: 原版上 fresh/stale 分明（两向自证的正向半边）');
  const rb2 = w2.roundCost.build({ topN: 12 });
  a(rb2.board.fresh === rb2.board.rows && rb2.board.stale === 0,
    'v2269/N2c: 破坏副本上历史条目全被算成本轮在册');
  a(rb2.board.zeroInBoard > rv2.board.zeroInBoard, 'v2269/N2d: 破坏副本上本轮零引用被历史条目灌高');

  // N3 破坏截断判定 ⇒ 榜单被当成全集
  const badN3 = Ec.replace(ANCHOR.pvCapped, 'const capped = false;');
  a(badN3 !== Ec, 'v2269/N3a: N3 源码破坏成功（锚点命中）');
  const w3 = loadBroken(badN3);
  const r3 = w3.roundCost.build({ topN: 1 });
  a(r3.board.capped === false, 'v2269/N3b: 破坏后截断不再现形');
  a(r3.board.rows === 1 && r3.board.total >= 2, 'v2269/N3c: 截断本体仍发生（只是不再被报出来）');
  a(b5.board.capped === true, 'v2269/N3d: 原版上同款判据为真（两向自证成立）');

  // N4 破坏无读数分支 ⇒ used 从 null 变 0
  const badN4 = Ec.replace(ANCHOR.pvNoReading,
    "return { ok: true, state: 'no-reading', used: 0, cap: 0, chars: null, round: null,");
  a(badN4 !== Ec, 'v2269/N4a: N4 源码破坏成功（锚点命中）');
  const w4 = loadBroken(badN4);
  WA.store.transact(function (d) { delete d.lastInjection; });
  const r4 = w4.roundCost.build();
  a(r4.used === 0, 'v2269/N4b: 破坏副本上无读数被报成 used:0（正是本版要防的那类假绿）');
  a(b1.used === null, 'v2269/N4c: 原版上无读数仍是 null（两向自证成立）');

  // N5 破坏长期趋势守卫 ⇒ 出厂就把全窗样本当本轮读数
  const badN5 = Ec.replace(ANCHOR.pvLongGuard, 'if (true) {');
  a(badN5 !== Ec, 'v2269/N5a: N5 源码破坏成功（锚点命中）');
  const w5 = loadBroken(badN5);
  a(w5.roundCost.build({ topN: 4 }).longTrend !== null, 'v2269/N5b: 破坏后默认路径就读趋势');
  a(b7.longTrend === null, 'v2269/N5c: 原版默认路径不读（两向自证成立）');

  // N6 破坏本轮耗时来源
  const badN6 = Ec.replace(ANCHOR.pvTimingSrc, 'const cost = null;');
  a(badN6 !== Ec, 'v2269/N6a: N6 源码破坏成功（锚点命中）');
  const w6 = loadBroken(badN6);
  settleRound(15, 512, 2400, { measured: 12, totalMs: 31.4, slowest: { source: '晨报', ms: 12.1 }, unmeasuredCount: 0 },
    [{ source: '晨报', content: '乙簿线索' }], '正文没有提线索词。');
  a(w6.roundCost.build({}).timing === null, 'v2269/N6b: 破坏后本轮耗时不现形');
  a(RC.build({}).timing !== null, 'v2269/N6c: 原版上本轮耗时在场（两向自证成立）');

  // N7 负控制全程未改真源码与真设置
  a(rd(ENG_RC) === Ec, 'v2269/N7a: 负控制后引擎源码逐字未变');
  a(j(RC.getSettings()) === j({ enabled: true, topN: 4, showZero: true, showTiming: true, showLongTrend: false }),
    'v2269/N7b: 负控制后真设置逐字未变');

  console.log('EXV6-5 round-cost-v2269: 全部通过');
  return true;
}
// 挂载面：tests/run.js 用 runLock('./round-cost-v2269.js','runAll') 调它；
//   缺这一行时全量回归会记 NO runAll（独立跑绿、回归记红的假红）。
module.exports = { runAll: runAll };
if (require.main === module) {
  runAll();
}
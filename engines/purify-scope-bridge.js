/**
 * WorldAxis engines/purify-scope-bridge.js (v2.602.0) — 净化保护配对表（R277 / PSC-1）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   `engines/purify-scope.js`（159 行，v2.130.0）自己把话说得很清楚：
 *     「`restore` 必须每一项都能换回 … 「保护出得去回不来」是比「没保护」更坏的结局
 *       （正文会永久残留占位符）。」
 *   而 `WA.purifyScope` 全仓**零产品读者** —— 换句话说，这条链今天连「出去」都没做到：
 *   `render/purifier.js` 的净化仍然是全文级的，一个 `.*` 就能精确地删掉状态栏，
 *   而输出非空、空结果守卫不报，用户看到的是「状态栏忽然不见了」。
 *
 *   更麻烦的是：「从来没跑过」与「跑了但每次都无块可保」与「保了但没还原」
 *   在这台引擎的自有读数上**完全同形** —— `protects` / `blocks` / `restored` 三个数0
 *   不区分 Noop 与事故。本表把它们拆成五种 verdict。
 *
 * ── 它做什么（四个事实面）────────────────────────────────────
 *   ① `kinds()`   —— 三类受保护面现读（fence / comment / angle），与期望三值比对，
 *                     不一致报 drift（有人改了图案集，而“什么不保护”这一格变了）；
 *   ② `budget()`  —— 开关与 `maxBlocks`，并把一条**结构性事实**写成读数：
 *                     cap 处是 `if (outer.length >= cap) break` —— 超过 cap 的块
 *                     **静默不保护**，而返回的 `count` 只报“保护了几块”，
 *                     不报“还有几块没被保护”。这不是 bug，是判据的静默部分；
 *   ③ `pairing()` —— `protects` 与 `restored` 的配对判读（五态，见下）；
 *   ④ `faults()` + `residue()` —— 五个失败码的用户可见含义，与一个**纯函数**
 *                     残留占位符计数（只报个数，不回显正文）。
 *
 * ── 五态 verdict（本表存在的全部理由）─────────────────────
 *   `module-missing` 引擎不在；`no-settings` settingsBus 不在（读不到开关）；
 *   `never-run`      `protects === 0` —— **今天就是这个态**。净化链从未走过保护；
 *   `no-protect`     `protects > 0` 但 `blocks === 0` —— 每次都没找到可保护段；
 *   `unpaired`       `blocks > 0` 且 `restored < protects` —— 有保护没还原，正文可能残占位符；
 *   `broken`         `faults['not-found'] > 0` —— 实锤发生过“回不来”。
 *   优先级：`broken` > `unpaired` > `no-protect` > `never-run`。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 **零跑**：不调 `protect` / `restore` / `applyWith` —— 前两个会改 `stat` 的六个计数，
 *      `applyWith` 还会连带调两者。体检把失败计数改掉之后，读出来的就不是现场。
 *      专锁 B 组用探针钉住三个函数的调用计数 0，并断言前后 `stat()` 逐字相等。
 *   2 **零写**：不 `setSettings`、不 `save`、不 `transact`。
 *   3 **只报结构不报正文**：`residue()` 只回**个数**（含几个占位符），
 *      绝不把残留文本带出来 —— 那是楼层正文，可能含剧透。
 *   4 `kinds()` 每次现读 `P.kinds()`，与 `EXPECT` 三值比对；不一致报 `drift`，不硬算。
 *   5 `no-settings` 与 `never-run` 分开报：前者是装着问题（读不到开关就什么也测不准），
 *      后者是现场事实（引擎在、开关在、就是没跑过）。两者处置完全不同。
 *   6 读数唯一出口：四个事实面只在 `audit()` 里合成。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  /** 勘察态的三类图案（顺序也是判据一部分：fence → comment → angle）。 */
  const EXPECT = ['fence', 'comment', 'angle'];
  const WHY = ['ok', 'module-missing', 'no-settings', 'drift'];
  const VERDICT = ['module-missing', 'no-settings', 'drift', 'broken', 'unpaired', 'no-protect', 'never-run', 'ok'];

  /** 五个失败码 → 用户可见含义。表里没有的码会在 `faults().unregistered` 里冒出来。 */
  const FAULT_TEXT = {
    'empty-text': '空文本 / null：不收，不产出占位符',
    'bad-type': '入参不是字符串：报 bad-type',
    'bad-value': '传入的净化器抛错：返回原文，不把半成品交出去',
    'not-found': '占位符被净化规则吃掉或重复 —— **实锤“保护出得去回不来”**，正文可能残占位符',
    'no-block': '（不是失败码，是“未找到可保护段”的常态）'
  };

  /** 引擎自己的占位符前后缀（现读不到时用同一份字面量做纯函数判定）。 */
  const MARK_HEAD = String.fromCharCode(1) + 'WA-PS-';

  const stat = { audits: 0, reads: 0, lastWhy: '', lastVerdict: '', lastGap: null, lastReadAt: 0 };

  function clockWall() { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } }
  function P() { return WA.purifyScope || null; }

  function regOf(mod) {
    const all = WA.__settingsRegs;
    if (!Array.isArray(all)) return null;
    for (let i = 0; i < all.length; i++) {
      const r = all[i];
      if (r && r.module === mod) return r;
    }
    return null;
  }

  /** ① 三类受保护面。现读；与勘察三值比对。 */
  function kinds() {
    stat.reads++;
    const p = P();
    if (!p || typeof p.kinds !== 'function') {
      return { ok: false, why: 'module-missing', list: [], expect: EXPECT.slice(), drift: [] };
    }
    let list = null;
    try { list = p.kinds(); } catch (e) { list = null; }
    if (!Array.isArray(list)) return { ok: false, why: 'module-missing', list: [], expect: EXPECT.slice(), drift: [] };
    const got = list.slice();
    const drift = [];
    if (got.join(',') !== EXPECT.join(',')) {
      EXPECT.forEach(function (k) { if (got.indexOf(k) < 0) drift.push('missing:' + k); });
      got.forEach(function (k) { if (EXPECT.indexOf(k) < 0) drift.push('extra:' + k); });
      if (!drift.length) drift.push('order:' + got.join(','));
    }
    return { ok: drift.length === 0, why: drift.length ? 'drift' : 'ok', list: got, expect: EXPECT.slice(), drift: drift };
  }

  /** ② 开关与 cap，以及 cap 静默截断这条结构事实。 */
  function budget() {
    stat.reads++;
    const out = { ok: false, why: 'module-missing', enabled: null, maxBlocks: null, bound: [], capSilent: '', capped: false };
    const p = P();
    if (!p || typeof p.getSettings !== 'function') return out;
    if (!WA.settingsBus || typeof WA.settingsBus.read !== 'function') {
      return Object.assign({}, out, { why: 'no-settings' });
    }
    let s = null;
    try { s = p.getSettings(); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') return Object.assign({}, out, { why: 'no-settings' });

    const reg = regOf('purifyScope');
    const b = (reg && reg.bounds && Array.isArray(reg.bounds.maxBlocks)) ? reg.bounds.maxBlocks : [];
    const cap = s.maxBlocks;
    return {
      ok: true, why: 'ok',
      enabled: (s.enabled !== false),
      maxBlocks: cap,
      bound: b.slice(),
      /** cap 处静默截断：`count` 不报“还有几块没被保护”。 */
      capSilent: '第 ' + cap + ' 块之后的受保护段**不会报错、也不会计数** —— 返回体的 count 只说“保护了几块”，不说“还剩几块没保”',
      capped: (typeof cap === 'number' && isFinite(cap) && b.length === 2 && cap < b[1])
    };
  }

  /** ③ 配对判读。五态在这里定案。 */
  function pairing() {
    stat.reads++;
    const p = P();
    const out = { ok: false, why: 'module-missing', protects: 0, restored: 0, blocks: 0, charsKept: 0,
      blocked: 0, lastReason: '', gap: 0, verdict: 'module-missing', note: '' };
    if (!p || typeof p.stat !== 'function') return out;
    let s = null;
    try { s = p.stat(); } catch (e) { s = null; }
    if (!s) return out;

    const protects = s.protects || 0;
    const restored = s.restored || 0;
    const blocks = s.blocks || 0;
    const charsKept = s.charsKept || 0;
    const blocked = s.blocked || 0;
    const faults = (s.faults && typeof s.faults === 'object') ? s.faults : {};
    const gap = protects - restored;
    const lost = faults['not-found'] || 0;

    let verdict, note;
    if (lost > 0) {
      verdict = 'broken';
      note = '发生过 ' + lost + ' 次「占位符找不回来」—— 这是比没保护更坏的结局，请核对正文有没有残留占位符';
    } else if (blocks > 0 && gap > 0) {
      verdict = 'unpaired';
      note = '保护了 ' + protects + ' 次、只还原了 ' + restored + ' 次（差 ' + gap + '）—— 至少有一次保护没走完回程';
    } else if (protects > 0 && blocks === 0) {
      verdict = 'no-protect';
      note = '跑过 ' + protects + ' 次，每一次都「找不到可保护段」—— 要么正文里真的没有结构块，要么图案与正文形态对不上';
    } else if (protects === 0) {
      verdict = 'never-run';
      note = '一次都没跑过：净化仍然是全文级，状态栏 / MVU 块 / 围栏都可能被一个 .* 吃掉而不报错';
    } else {
      verdict = 'ok';
      note = '保护与还原配对（' + protects + ' / ' + restored + '），共保 ' + blocks + ' 块、' + charsKept + ' 字';
    }

    return {
      ok: (verdict === 'ok'), why: 'ok',
      protects: protects, restored: restored, blocks: blocks,
      charsKept: charsKept, blocked: blocked, lastReason: s.lastReason || '',
      gap: gap, verdict: verdict, note: note
    };
  }

  /** ④a 失败码。`unregistered` 非空即表示引擎新增了码而本表没跟上。 */
  function faultList() {
    stat.reads++;
    const p = P();
    if (!p || typeof p.stat !== 'function') {
      return { ok: false, why: 'module-missing', codes: [], unregistered: [] };
    }
    let s = null;
    try { s = p.stat(); } catch (e) { s = null; }
    if (!s) return { ok: false, why: 'module-missing', codes: [], unregistered: [] };
    const seen = (s.faults && typeof s.faults === 'object') ? s.faults : {};
    const codes = Object.keys(seen).map(function (k) {
      return { code: k, n: seen[k], means: FAULT_TEXT[k] || '' };
    }).sort(function (a, b) { return b.n - a.n; });
    return {
      ok: true, why: 'ok', codes: codes,
      unregistered: codes.filter(function (c) { return !FAULT_TEXT[c.code]; }).map(function (c) { return c.code; })
    };
  }

  /**
   * ④b 残留占位符计数。**纯函数**：不改 stat，也不回显文本。
   * 这是本表唯一能对“已经落到楼层里的内容”发言的地方 —— 只报个数。
   */
  function residue(text) {
    if (typeof text !== 'string' || !text) return { ok: true, n: 0, len: 0 };
    let n = 0;
    let i = text.indexOf(MARK_HEAD);
    while (i >= 0) { n++; i = text.indexOf(MARK_HEAD, i + MARK_HEAD.length); }
    return { ok: true, n: n, len: text.length };
  }

  function lineOf(a) {
    if (!a) return '';
    if (a.verdict === 'module-missing') return '净化保护引擎不在：WA.purifyScope 未加载 —— 配对无从判断';
    if (a.verdict === 'drift') return '保护面图案与勘察不一致（现 ' + a.kinds.join('/') + '）—— 本表拒绝硬算“什么不保护”';
    if (a.verdict === 'no-settings') return '设置读不到：settingsBus 不在，开关与 maxBlocks 都测不出 —— 这不是“关着”';
    if (a.verdict === 'never-run') {
      return '净化保护一次都没跑过：净化仍是全文级 —— 状态栏 / MVU 块 / 围栏都可能被一个 .* 精确删掉，而输出非空、守卫不报';
    }
    if (a.verdict === 'no-protect') {
      return '跑过 ' + a.pairing.protects + ' 次、每次都没找到可保护段 —— 段里可能真没结构块，也可能图案与正文形态对不上';
    }
    if (a.verdict === 'unpaired') return '保护出得去回不来：保 ' + a.pairing.protects + ' 次 / 还原 ' + a.pairing.restored + ' 次，差 ' + a.pairing.gap + ' 次';
    if (a.verdict === 'broken') return '实锤“回不来”：占位符找不回来 ' + a.lost + ' 次 —— 正文里可能残留占位符，比没保护更坏';
    return '保护与还原配对（' + a.pairing.protects + ' / ' + a.pairing.restored + '），共保 ' + a.pairing.blocks + ' 块、' + a.pairing.charsKept + ' 字';
  }

  function summaryText(a) {
    if (!a) return '';
    return '净化保护：' + a.verdict + ' ｜ 图案 ' + (a.kinds || []).join('/')
      + ' ｜ 开关 ' + (a.enabled === true ? '开' : (a.enabled === false ? '关' : '—'))
      + ' ｜ cap ' + (a.maxBlocks == null ? '—' : a.maxBlocks)
      + ' ｜ 保护 ' + (a.pairing ? a.pairing.protects : 0) + ' / 还原 ' + (a.pairing ? a.pairing.restored : 0)
      + ' ｜ 块 ' + (a.pairing ? a.pairing.blocks : 0) + ' ｜ 零跑零写';
  }

  /** 合成。五个事实面（含 kinds/budget）只在这里汇。 */
  function audit(opts) {
    stat.audits++;
    const p = P();
    const k = kinds();
    const bg = budget();
    const pr = pairing();
    const ft = faultList();

    let verdict = pr.verdict;
    let why = 'ok';
    if (!p) { verdict = 'module-missing'; why = 'module-missing'; }
    else if (k.why === 'drift') { verdict = 'drift'; why = 'drift'; }
    else if (bg.why === 'no-settings') { verdict = 'no-settings'; why = 'no-settings'; }
    else if (verdict === 'never-run' && bg.enabled === false) {
      /** 开关关着时的“没跑过”与“没人接”不是一回事 —— 与 BND-1 的同一条口径。 */
      verdict = 'never-run';
      why = 'ok';
    }

    const lost = (ft.codes.filter(function (c) { return c.code === 'not-found'; })[0] || {}).n || 0;
    const out = {
      ok: (verdict === 'ok'),
      why: why,
      verdict: verdict,
      kinds: k.list,
      drift: k.drift,
      enabled: bg.enabled,
      maxBlocks: bg.maxBlocks,
      bound: bg.bound,
      capSilent: bg.capSilent,
      pairing: pr.verdict === 'module-missing' ? null : pr,
      faults: ft.codes,
      lost: lost,
      neverRun: (verdict === 'never-run')
    };
    out.line = lineOf(out);
    out.text = summaryText(out);
    stat.lastWhy = out.why;
    stat.lastVerdict = out.verdict;
    stat.lastGap = pr.verdict === 'module-missing' ? null : pr.gap;
    stat.lastReadAt = clockWall();
    return out;
  }

  function diagnose(opts) {
    const a = audit(opts);
    return {
      ok: a.ok, why: a.why, verdict: a.verdict, line: a.line, text: a.text,
      counts: { kinds: (a.kinds || []).length, faults: (a.faults || []).length },
      pairing: a.pairing, faults: a.faults, budget: { enabled: a.enabled, maxBlocks: a.maxBlocks, bound: a.bound }
    };
  }

  function statOut() {
    return {
      audits: stat.audits, reads: stat.reads,
      last: { why: stat.lastWhy, verdict: stat.lastVerdict, gap: stat.lastGap, at: stat.lastReadAt },
      lastWhy: stat.lastWhy, lastVerdict: stat.lastVerdict, lastGap: stat.lastGap, lastReadAt: stat.lastReadAt
    };
  }

  WA.purifyScopeBridge = {
    EXPECT: EXPECT, WHY: WHY, VERDICT: VERDICT,
    kinds: kinds, budget: budget, pairing: pairing, faults: faultList, residue: residue,
    audit: audit, lineOf: lineOf, summaryText: summaryText, diagnose: diagnose,
    stat: statOut,
    __reset: function () {
      stat.audits = 0; stat.reads = 0; stat.lastWhy = '';
      stat.lastVerdict = ''; stat.lastGap = null; stat.lastReadAt = 0;
    },
    version: '2.602.0'
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/purify-scope-bridge.js', { kind: 'engine', ver: '2.602.0' });
  }
})();

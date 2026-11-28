/**
 * WorldAxis engines/pending-recon.js (v2.590.0) — 两套待办聚合器的对读面（R265 / PBS-1）
 *
 * ── 它治什么（现场读数，不是阅读推断）────────────────────────────────
 *   全仓有**两套**「现在等我做什么」的聚合器，各自被一半的地方用：
 *     · `engines/pending-center.js`（八源 + 开关 + 三旗标 + `act()` 透传写口）—— 待办页读它；
 *     · `core/unified-pending.js`（七探针 + 三态 `hands` / `skipped` / `faults`）——
 *       **产品面零读**，只有 `tests/v10-unified-pending.js` 与 `tests/v10-master-matrix.js`
 *       在消费；它在零读定性账本里挂的 cls 就是 `stale`。
 *
 *   本面**不做第三份清单**。理由与 v2.589.0 的设置面总账台是同一条：再写一份「待办列表」
 *   就是第二份真源，而两份清单一旦漂移，玩家会看到两个数、两个都不对。
 *   本面只回答一个问题的**可证伪**版本：「这两套读数说的是同一个世界吗？」
 *
 * ── 三条判读纪律（写死在 tests/pending-recon-v2590.js 里）────────────
 *   ① **不可读就不对读**：待办中心关着、或任一侧模块缺席 / 读失败 / 形状坏掉时，
 *      `comparable=false`，`divergences` **必须为空**，summary 必须说「对读不成立」。
 *      绝不允许把「这一侧没有读数」渲染成「两边一致」—— 那正是本仓反复治的「不可分」病
 *      （v2.205.0 / v2.298.0 / v2.589.0 同一族）。
 *   ② **条数不作分歧判读**：两套的收录口径不同（A 只收「有待处理动作」的行，B 收
 *      `pending()` 的全量），条数相等与否都不是分歧证据。故 `a.total` / `b.total` 只并列
 *      展示，`note` 里逐字写明这一点 —— 否则一次口径差就会年年报一条假分歧，
 *      而假分歧会把真分歧盖在同一条读数里。
 *   ③ **只报能证伪的分歧**：只有两类与条数、与覆盖差都无关，任一侧错了都能被指认 ——
 *      · `presence`：同一模块，一侧读到（ok）、另一侧判缺席；
 *      · `fault`：同一模块，一侧看到异常（`source-threw` / `faults`）、另一侧当它正常。
 *      覆盖差（只在 A 里 / 只在 B 里的源）单列 `coverage`，**不算错误** —— 两套管的本来
 *      就不是同一个集合（A 的源表比 B 多两源，B 也独有一源 —— 名字逐次不同，本文件一律不写），
 *      这是范围事实不是缺陷。
 *
 * ── 顺带把一个既有形状问题变成读数（**不改别人的返回体**）────────────
 *   A 侧把「模块抛异常」与「模块缺席」都塞进 `skipped`，只靠 `reason` 字符串
 *   （`source-threw`）区分；B 侧把两者分成 `skipped` / `faults` 两张名单 —— 那是 B 在
 *   v2.298.0 立的判据（异常不许静默消失）。本面按字符串把 A 的故障单独拎出来重报
 *   （`a.faults`），**不修改 A 的 items() 返回体**：那是它的边界；本面要的只是
 *   「读面能不能分辨」，而不是替它改形状。
 *
 * ── 零硬编码源名单 ─────────────────────────────────────────────────
 *   本文件不出现任何模块名（七个探针名一个都不写）：名单全部从两侧现场读数里取
 *   （A 的 `perSource` 键、B 的 `hands` / `skipped` / `faults`）。新源接进任一聚合器时，
 *   本面自动出现那一行，文件一行都不用改；反过来，写死名单会让「对读」只对读
 *   「我当初记得的那些源」—— 那比不做更坏，因为它看上去是绿的。
 */
(function () {
  'use strict';

  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.590.0';
  // 名单截断上限：超出的**自报**（`truncated` / `hidden`），不许让「只列了前 N 个」
  //   看起来像「一共就 N 个」。与 v2.589.0 总账台同一条纪律。
  const LIMIT_DEF = 60;

  // `last` 存**上一次 read() 的摘要**。`stat()` 只读它、**不触发新读**：
  //   一个计数据口自己去读一次数据，会让它数自己 —— 那样 `reads` 永远比真实发起的
  //   对读多 1，而「谁读了几次」正是这一面唯一的可核数。
  const _stat = { reads: 0, lastAt: 0, last: null };

  function arr(x) { return Array.isArray(x) ? x : []; }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function clean(v, n) {
    const s = (v === null || v === undefined) ? '' : String(v);
    return s.length > n ? (s.slice(0, n) + '…') : s;
  }

  // ── A 侧：engines/pending-center.js ────────────────────────────────
  //   `status` 是**本面的包壳状态**（模块缺 / 关着 / 读失败 / 形状坏 / 可读），
  //   `state` 是 A 自己的三旗标归一（unavailable / emptyAll / allClear / mixed）。
  //   两个名字分开是刻意的：混成一个字段，读面就又得先判「这是包壳的还是它的」。
  function missA(status, detail) {
    return { present: false, status: status, enabled: null, perSource: {}, sources: [],
      liveSources: [], skipped: [], faults: [], total: null, flags: null, emptyReporters: null,
      state: null, reason: status, detail: detail || null };
  }
  function sideA() {
    const P = WA.pendingCenter;
    if (!P) return missA('module-missing');
    if (typeof P.items !== 'function') return missA('no-entry');
    let cfg = null;
    try { cfg = (typeof P.getSettings === 'function') ? P.getSettings() : null; } catch (e) { cfg = null; }
    const enabled = (cfg && typeof cfg.enabled === 'boolean') ? cfg.enabled : null;
    if (enabled === false) {
      const m = missA('disabled'); m.present = true; m.enabled = false; return m;
    }
    let r = null;
    try { r = P.items({}); } catch (e) {
      const m = missA('read-threw', clean(e && (e.message || e), 80));
      m.present = true; m.enabled = enabled; return m;
    }
    if (!r || r.ok !== true) {
      const m = missA(clean(r && r.reason, 40) || 'bad-shape');
      m.present = true; m.enabled = enabled; return m;
    }
    const ps = (r.perSource && typeof r.perSource === 'object') ? r.perSource : {};
    const names = Object.keys(ps);
    const live = [], skipped = [], faults = [];
    names.forEach(function (n) {
      const x = ps[n] || {};
      if (x.ok === true) { live.push(n); return; }
      // A 自己保证 reason 非空（它的适配器都有 `|| 'unavailable'` 兜底）；此处仍不编词，
      //   留空即「它说不可用却没给理由」—— 那正是读面该看见的形态。
      const reason = clean(x.reason, 40) || null;
      skipped.push({ source: n, reason: reason });
      // 故障从 skipped 桶里按字符串拎出来重报（见文件头「顺带」一节）。
      if (reason === 'source-threw') faults.push({ source: n, reason: reason });
    });
    const st = live.length === 0 ? 'unavailable'
      : (r.emptyAll ? 'emptyAll' : (r.allClear ? 'allClear' : 'mixed'));
    return {
      present: true, status: 'ok', enabled: enabled,
      perSource: ps, sources: names, liveSources: live,
      skipped: skipped, faults: faults,
      total: num(r.total), shown: num(r.count), capped: !!r.capped,
      flags: { unavailable: !!r.unavailable, emptyAll: !!r.emptyAll, allClear: !!r.allClear },
      emptyReporters: num(r.emptyReported),
      state: st, reason: null, detail: null
    };
  }

  // ── B 侧：core/unified-pending.js ──────────────────────────────────
  //   B 的 `state`（ok / empty / fault）是它自己的三态；`status` 仍是本面的包壳状态。
  //   B 的三态里 fault **优先**（v2.298.0 判据）：有模块坏了就必须报，哪怕同时有产出。
  function missB(status, detail) {
    return { present: false, status: status, state: null, hands: [], skipped: [], faults: [],
      total: null, highCount: null, reason: status, detail: detail || null };
  }
  function sideB() {
    const U = WA.unifiedPending;
    if (!U) return missB('module-missing');
    if (typeof U.collect !== 'function') return missB('no-entry');
    let c = null;
    try { c = U.collect(); } catch (e) {
      return missB('read-threw', clean(e && (e.message || e), 80));
    }
    if (!c || typeof c !== 'object') return missB('bad-shape');
    const st = c.state;
    if (st !== 'ok' && st !== 'empty' && st !== 'fault') {
      // 三态以外的值：读面无法判读 ⇒ 整面对读不成立（不是「猜一个 ok」）。
      const m = missB('bad-shape', 'state=' + clean(st, 24));
      m.present = true; return m;
    }
    const hands = arr(c.hands).map(function (x) { return String(x); });
    const skipped = arr(c.skipped).map(function (x) {
      return { module: clean(x && x.module, 40), reason: clean(x && x.reason, 40) || 'absent' };
    });
    const faults = arr(c.faults).map(function (x) {
      return { module: clean(x && x.module, 40), msg: clean(x && (x.message || x.msg), 60) || 'unknown' };
    });
    return { present: true, status: 'ok', state: st, hands: hands, skipped: skipped, faults: faults,
      total: num(c.total), highCount: num(c.highCount), reason: null, detail: null };
  }

  // ── 逐源判读（交集上）──────────────────────────────────────────────
  const VERDICTS = ['agree', 'both-absent', 'presence', 'fault', 'fault-both'];
  // ⚠ 两个侧读口各有一条 `!x` 兜底。它在调用点**不可达**：交集的源名全部取自 A 的
  //   `perSource` 键，又在 B 的三张名单里出现过，故两侧各有一项。兜底故意**不带拒收码**：
  //   给一条永不执行的分支配一条见证，比没有见证更坏 —— 它会让拒收码门禁以为这条分支被覆盖过
  //   （本仓 v2.278.0 立这条门禁时要防的正是「永远走不到的分支看起来有覆盖」）。
  function aSideOf(a, name) {
    const x = a.perSource[name] || null;
    if (!x) return { state: 'unknown', reason: null, count: null };
    if (x.ok === true) return { state: 'ok', reason: null, count: num(x.count) };
    // 缺席且来源没给原因 ⇒ 如实留空，不编一个词填上（面板对 null 显示「—」）。
    const reason = clean(x.reason, 40) || null;
    return { state: (reason === 'source-threw') ? 'fault' : 'absent', reason: reason, count: num(x.count) };
  }
  function bSideOf(b, name) {
    for (let i = 0; i < b.faults.length; i++) {
      if (b.faults[i].module === name) return { state: 'fault', reason: clean(b.faults[i].msg, 60) || 'fault', count: null };
    }
    for (let i = 0; i < b.hands.length; i++) {
      if (b.hands[i] === name) return { state: 'ok', reason: null, count: null };
    }
    for (let i = 0; i < b.skipped.length; i++) {
      if (b.skipped[i].module === name) return { state: 'absent', reason: b.skipped[i].reason, count: null };
    }
    return { state: 'unknown', reason: null, count: null };
  }
  function verdictOf(av, bv) {
    if (av.state === 'fault' || bv.state === 'fault') {
      return (av.state === 'fault' && bv.state === 'fault') ? 'fault-both' : 'fault';
    }
    if (av.state === 'ok' && bv.state === 'ok') return 'agree';
    if (av.state !== 'ok' && bv.state !== 'ok') return 'both-absent';
    return 'presence';
  }
  function divergedOf(v) { return v === 'presence' || v === 'fault'; }

  // ── 主读面 ───────────────────────────────────────────────────────
  function read(opts) {
    const o = (opts && typeof opts === 'object') ? opts : {};
    const limit = (num(o.limit) && num(o.limit) > 0) ? Math.max(1, Math.floor(num(o.limit))) : LIMIT_DEF;
    const a = sideA();
    const b = sideB();
    _stat.reads++; _stat.lastAt = WA.clock?.wallNow?.() ?? null;

    // ① 不可读就不对读（纪律一）。顺序即优先级：A 的模块 > A 的开关 > A 的读 > B 的模块 > B 的读。
    let notComparable = null;
    if (!a.present) notComparable = 'a-' + a.status;
    else if (a.status !== 'ok') notComparable = 'a-' + a.status;
    else if (!b.present) notComparable = 'b-' + b.status;
    else if (b.status !== 'ok') notComparable = 'b-' + b.status;

    let shared = [], aOnly = [], bOnly = [], divergences = [], coverage = null;
    let counts = { shared: 0, agree: 0, diverged: 0, aOnly: 0, bOnly: 0 };

    if (!notComparable) {
      const inA = {};
      a.sources.forEach(function (n) { inA[n] = true; });
      const inB = {};
      b.hands.forEach(function (n) { inB[n] = true; });
      b.skipped.forEach(function (x) { if (x.module) inB[x.module] = true; });
      b.faults.forEach(function (x) { if (x.module) inB[x.module] = true; });

      const names = a.sources.filter(function (n) { return inB[n]; });
      names.forEach(function (n) {
        const av = aSideOf(a, n);
        const bv = bSideOf(b, n);
        const v = verdictOf(av, bv);
        const row = { name: n, a: av, b: bv, verdict: v, note: null };
        if (v === 'both-absent' && av.reason !== bv.reason) {
          // 两侧都说缺席，但**细度不同**（A 只报到 module-missing，B 能分 absent / no-entry）。
          //   这不是分歧（两边结论一致），但读面该知道是谁的读数更细。
          row.note = '两侧都判缺席；原因细度不同（A=' + clean(av.reason, 40) + ' / B=' + clean(bv.reason, 40) + '）';
        }
        if (divergedOf(v)) {
          divergences.push({ kind: v, name: n, a: av, b: bv,
            note: v === 'presence'
              ? (av.state === 'ok'
                ? 'A 读到、B 判缺席 —— 同一模块两套探针结论相反，至少一套的入口判定写错了'
                : 'B 读到、A 判缺席 —— 同上，方向相反')
              : (av.state === 'fault'
                ? 'A 看到异常、B 当它正常 —— B 的 try/catch 可能吞了同一个异常'
                : 'B 看到异常、A 当它正常 —— A 把异常塞进 skipped 后只靠 reason 字符串区分，读面容易看漏') });
        }
        shared.push(row);
      });
      const inShared = {};
      shared.forEach(function (r) { inShared[r.name] = true; });
      aOnly = a.sources.filter(function (n) { return !inShared[n]; });
      bOnly = Object.keys(inB).filter(function (n) { return !inA[n]; });

      // 聚合级：A 一个源都没读到、B 却真读成了若干 —— 与覆盖差无关，必有一侧探针错。
      if (a.state === 'unavailable' && b.hands.length > 0) {
        divergences.push({ kind: 'all-unavailable', name: '(聚合)', a: { state: 'absent', reason: null, count: null },
          b: { state: 'ok', reason: null, count: b.hands.length },
          note: 'A 报「八源无一在场」而 B 读到 ' + b.hands.length + ' 个模块 —— 两侧对同一批 ' + 'WA.<mod> 的在场性结论相反' });
      }
      counts = {
        shared: shared.length,
        agree: shared.filter(function (r) { return !divergedOf(r.verdict); }).length,
        diverged: shared.filter(function (r) { return divergedOf(r.verdict); }).length,
        aOnly: aOnly.length, bOnly: bOnly.length
      };
      coverage = { shared: shared.map(function (r) { return r.name; }), aOnly: aOnly.slice(), bOnly: bOnly.slice() };
    }

    // 名单截断（自报，纪律：不许让「只列了前 N 个」看起来像「一共就 N 个」）。
    const shownShared = shared.slice(0, limit);
    const truncated = {
      shared: shared.length > limit,
      hiddenShared: Math.max(0, shared.length - limit),
      aOnly: aOnly.length > limit, hiddenAOnly: Math.max(0, aOnly.length - limit),
      bOnly: bOnly.length > limit, hiddenBOnly: Math.max(0, bOnly.length - limit)
    };

    const out = {
      ok: true, version: VERSION, at: _stat.lastAt,
      comparable: !notComparable, notComparable: notComparable,
      a: { present: a.present, status: a.status, enabled: a.enabled, state: a.state,
        total: a.total, shown: a.shown || null, capped: a.capped || false,
        sourceCount: a.sources.length, liveSources: a.liveSources.slice(),
        skipped: a.skipped.slice(), faults: a.faults.slice(), flags: a.flags,
        emptyReporters: a.emptyReporters, reason: a.reason, detail: a.detail },
      b: { present: b.present, status: b.status, state: b.state,
        total: b.total, highCount: b.highCount,
        hands: b.hands.slice(), skipped: b.skipped.slice(), faults: b.faults.slice(),
        reason: b.reason, detail: b.detail },
      shared: shownShared, aOnly: aOnly.slice(0, limit), bOnly: bOnly.slice(0, limit),
      coverage: coverage, counts: counts, divergences: divergences,
      truncated: truncated, limit: limit,
      note: '只报能证伪的分歧（在场性 presence / 故障 fault）：条数不比相等 —— A 只收「有待处理动作」的行、'
        + 'B 收 pending() 全量，口径差不是分歧；覆盖差（aOnly / bOnly）是范围事实，不是错误。'
        + '不可读时 comparable=false 且 divergences 恒空（「这一侧没有读数」≠「两边一致」）。'
    };
    out.summary = summaryText(out);
    _stat.last = { comparable: out.comparable, notComparable: out.notComparable,
      counts: { shared: counts.shared, agree: counts.agree, diverged: counts.diverged,
        aOnly: counts.aOnly, bOnly: counts.bOnly } };
    return out;
  }

  function summaryText(r) {
    if (!r || r.ok !== true) return '对读面：读不出来（read() 返回非法）';
    if (!r.comparable) {
      const why = r.notComparable;
      const map = {
        'a-module-missing': '待办中心模块不在（engines/pending-center.js 未装载）',
        'a-no-entry': '待办中心在，但没有 items() 读口',
        'a-disabled': '待办中心关着（enabled=false）',
        'a-read-threw': '待办中心读口抛异常',
        'a-bad-shape': '待办中心返回体形状不合契约',
        'b-module-missing': '统一待办模块不在（core/unified-pending.js 未装载）',
        'b-no-entry': '统一待办在，但没有 collect() 读口',
        'b-read-threw': '统一待办读口抛异常',
        'b-bad-shape': '统一待办返回体形状不合契约'
      };
      return '对读不成立（' + why + '：' + (map[why] || '未知原因') + '）—— 这不是「两边一致」，是这一侧没有读数';
    }
    const c = r.counts;
    return '对读：交集 ' + c.shared + ' 源（一致 ' + c.agree + ' / 分歧 ' + c.diverged + '）；'
      + '覆盖差 A 独 ' + c.aOnly + ' 源、B 独 ' + c.bOnly + ' 源（两套管的不是同一集合，不是错误）';
  }

  function diagnose() {
    const r = read({ limit: 200 });
    return {
      ok: true, version: VERSION, comparable: r.comparable, notComparable: r.notComparable,
      counts: r.counts, divergences: r.divergences.slice(),
      aState: r.a.state, bState: r.b.state,
      summary: r.summary, note: r.note
    };
  }

  // ── 便利读口：两侧的**覆盖差**单独给一张名单（页面/宿主只想要这一面时不必读全量）──
  function coverage() {
    const r = read({ limit: 200 });
    return { ok: true, comparable: r.comparable, notComparable: r.notComparable,
      aOnly: r.aOnly.slice(), bOnly: r.bOnly.slice(), shared: (r.coverage ? r.coverage.shared.slice() : []),
      note: '覆盖差是范围事实：两套聚合器登记的不是同一个集合。' };
  }

  WA.pendingRecon = {
    VERSION: VERSION,
    VERDICTS: VERDICTS.slice(),
    read: read,
    coverage: coverage,
    diagnose: diagnose,
    summaryText: summaryText,
    stat: function () {
      // 回顾上一轮 read() 的摘要；`last` 为 null ⇒ **没读过**（报 null，不拿 0 冒充）。
      const l = _stat.last;
      return { reads: _stat.reads, at: _stat.lastAt, version: VERSION,
        read: !!l,
        comparable: l ? l.comparable : null,
        notComparable: l ? l.notComparable : null,
        diverged: l ? l.counts.diverged : null,
        shared: l ? l.counts.shared : null,
        aOnly: l ? l.counts.aOnly : null,
        bOnly: l ? l.counts.bOnly : null };
    },
    __reset: function () { _stat.reads = 0; _stat.lastAt = 0; _stat.last = null; }
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/pending-recon.js', { kind: 'engine', ver: VERSION });
  }
})();

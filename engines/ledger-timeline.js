/**
 * WorldAxis engines/ledger-timeline.js (v2.50.0) — 台账时间轴（纯只读）
 *
 * 缝合来源（两条，都以「时间维度」为核心）：
 *   · Nocturne Memory 的 `system://recent` / `system://diagnostic`——按「多久没被读过」
 *     判定一条记忆是否 stale，而不是只看「最近一次读的是什么」。
 *   · 梨园（Liyuan）的 harness 记账——确定性过滤过程数据、每拍锚定状态，把过程态与
 *     世界态分开记，不让「上一拍的快照」冒充「当前状态」。
 *
 * 本仓为什么需要它：
 *   台账层是**清一色的「最近一次」单值**——实测 121 处 `lastAt`、68 `lastReason`、
 *   46 `lastError`（v2.49.0 收口时统计）。单值台账有一个结构性盲区：
 *     「**每轮都在失败**」与「**刚失败了一次**」在面板、诊断包与健康分上**完全同形**
 *     （都是 lastReason='…' + lastAt=某时刻）。而这两件事处置方向相反：
 *     前者要停下来查根因，后者可以先放着看下一步。
 *   既有唯一带时间维度的容器是 `core/workflow.js` 的 `__chainHistory`（HISTORY_MAX=20），
 *   但它只覆盖**链执行耗时/状态**，不覆盖台账层——本引擎补的正是后者。
 *
 * 口径选择——**不是计数，是环形窗口**：
 *   计数只增不减，无法回答「现在还坏着吗」（v2.10.0 已明确否决用累计数当判据）；
 *   环形窗口记的是「最近 N 次各是什么状态」，于是它可以回答：
 *     · 连续几次同一失败（持续态）vs 偶发一次（瞬态）
 *     · 某台账连续同态多少次（**中性结论**——可能是稳定，也可能是停摆）
 *
 * 三条铁律：
 *   ① 纯只读：不改任何引擎的行为，只做观察；观察失败一律降级不影响主链；
 *   ② 时序走 `clockWall`（测量时间）——本引擎数据**不进存档**（环形窗口属过程数据，
 *      与梨园「过程数据确定性过滤」同口径），故绝不能污染决策时间；
 *   ③ 三态如实：'empty'（没观测到）≠ 'ok'（有窗口），且「停摆」与「失败」分开报——
 *      「没变」不等于「坏了」。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  const MAX_SITES = 60;       // 最多跟踪多少个观测点
  const MAX_STEPS = 12;       // 每个观测点的环形窗口长度
  const MAX_TEXT = 120;

  const clean = function (v) { return String(v == null ? '' : v).trim(); };
  function safe(fn, fb) { try { const v = fn(); if (v !== undefined) return v; } catch (e) {} return fb === undefined ? null : fb; }
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  // site -> { steps: [{at, ok, sig, key}], seen: n, lastSig, lastOk, lastAt }
  const __sites = {};
  let __order = [];

  /**
   * 记一笔观测。**同态计次而不追加**——这是本引擎的核心机制，且两个诉求必须同时满足：
   *   · 窗口不能被无变化的轮次灌满（否则 MAX_STEPS 里全是同一条，「跨轮」就没意义了）；
   *   · 「连续 N 次同态」仍必须可得（否则 stalled 永远不成立，本引擎的主要结论就废了）。
   * 首版只做了前半句（同态直接 return），于是 streak 恒为 1、stalled 恒为 false——
   * 判据 [C4]/[C6]/[C8] 当场现形。修法：**段（run）** 为单位，段内用 reps 计数。
   * @param {string} site  观测点（如 'settingsBus.write'）
   * @param {boolean} ok   该次观测的健康态
   * @param {string=} sig  细节签名（失败原因/写入键等；相同即视为同态）
   * @param {number=} key  可选单调序号（消费方自己的游标；比时间戳可靠）
   */
  function note(site, ok, sig, key) {
    try {
      const s = clean(site);
      if (!s) return null;
      let rec = __sites[s];
      if (!rec) {
        if (__order.length >= MAX_SITES) return null;   // 满了不新建（宁缺毋错）
        rec = __sites[s] = { steps: [], seen: 0, observed: 0, lastSig: null, lastOk: null, lastAt: 0 };
        __order.push(s);
      }
      rec.seen++;
      rec.observed++;
      rec.lastAt = clockWall();
      const s2 = clean(sig).slice(0, MAX_TEXT);
      const ok2 = !!ok;
      const last = rec.steps.length ? rec.steps[rec.steps.length - 1] : null;
      if (last && last.ok === ok2 && last.sig === s2) {
        last.reps++;                                   // 同态：计次，不追加
        last.at = rec.lastAt;
        if (typeof key === 'number') last.key = key;
        return rec;
      }
      rec.lastSig = s2;
      rec.lastOk = ok2;
      // v2.78.0: key 是楼层号；NaN 会让「同一段」的指纹失去可比性（NaN !== NaN 恒真）。
      rec.steps.push({ at: rec.lastAt, ok: ok2, sig: s2, reps: 1, key: ((typeof key === 'number' && isFinite(key)) ? key : null) });
      while (rec.steps.length > MAX_STEPS) rec.steps.shift();
      return rec;
    } catch (e) { return null; }
  }

  /**
   * 单站读视图。三个正交结论**必须分开**，否则「没变」会被当成「坏了」：
   *   · streak ：当前态已连续出现几次（= 末段 reps；含首次）
   *   · failing：当前**是否为失败态**（streak 说的是持续，failing 说的是健康）
   *   · stalled：同一态连续出现 >= 阈值（**中性**——可能是稳定，也可能是卡住）
   * 同时给出两个规模量：rounds（窗口里几**段**）/ observed（窗口里几**次**观测）。
   */
  function siteStat(site, stallThreshold) {
    const th = (typeof stallThreshold === 'number' && stallThreshold > 0) ? stallThreshold : 3;
    const rec = __sites[clean(site)];
    if (!rec || !rec.steps.length) {
      return { state: 'empty', seen: rec ? rec.seen : 0, observed: rec ? rec.observed : 0, streak: 0, rounds: 0, failing: false, stalled: false, detail: '未观测到（本引擎尚未收到该站点的观测）' };
    }
    const steps = rec.steps;
    const cur = steps[steps.length - 1];
    const streak = cur.reps;
    return {
      state: 'ok',
      seen: rec.seen,
      observed: rec.observed,
      rounds: steps.length,
      at: cur.at,
      ok: cur.ok,
      sig: cur.sig,
      streak: streak,
      failing: cur.ok === false,
      stalled: streak >= th,
      detail: '窗口内 ' + steps.length + ' 段 / ' + rec.observed + ' 次观测，当前态（' + (cur.ok ? '正常' : '失败')
        + (cur.sig ? '：' + cur.sig : '') + '）连续 ' + streak + ' 次'
    };
  }

  /** 全站读视图（诊断/面板消费） */
  function stat(opts) {
    const th = (opts && opts.stallThreshold) || 3;
    const failing = [], stalled = [], sites = [];
    for (let i = 0; i < __order.length; i++) {
      const s = __order[i];
      const st = siteStat(s, th);
      sites.push({ site: s, state: st.state, seen: st.seen, observed: st.observed, rounds: st.rounds, streak: st.streak, failing: st.failing, stalled: st.stalled, sig: st.sig, at: st.at });
      if (st.state !== 'empty') {
        if (st.failing) failing.push(s);
        if (st.stalled) stalled.push(s);
      }
    }
    return { sites: sites.length, tracked: __order.slice(), failing: failing, stalled: stalled, detail: sites, stallThreshold: th };
  }

  /** 一句话结论（诊断摘要用；**无观测时不谎称「健康」**） */
  function summaryText(opts) {
    const s = stat(opts);
    if (!s.sites) return '台账时间轴：未观测到任何站点（本引擎未接上消费端，或本轮尚未产生台账）';
    const parts = ['台账时间轴：跟踪 ' + s.sites + ' 个站点'];
    parts.push(s.failing.length
      ? '当前失败 ' + s.failing.length + ' 站（' + s.failing.slice(0, 3).join('、') + '）'
      : '当前无失败站');
    if (s.stalled.length) parts.push('连续同态 ' + s.stalled.length + ' 站（' + s.stalled.slice(0, 3).join('、') + '，请核对是「稳定」还是「停摆」）');
    return parts.join(' · ');
  }

  /** 清空（切聊天/复位） */
  function reset() { __order = []; Object.keys(__sites).forEach(function (k) { delete __sites[k]; }); Object.keys(__delta).forEach(function (k) { delete __delta[k]; }); return true; }

  // ── v2.50.0：内置站点集（把「最近一次单值」转成「本窗口内是否新增失败」）────────
  // 为什么不能在探针里直接写 `ok: stat().ok`：本仓台账的 `ok` 多是**累计语义**
  // （如 settingsBus.writeStat().ok === '本会话从未失败过'）。直接把累计值当「当前态」
  // 喂进来，一次历史失败会让时间轴报出「连续 N 次都在失败」——把**一个已经过去的现场**
  // 伪装成**正在持续的故障**，方向恰好反了（正是本引擎要治的那种病）。
  // 因此这里比的是**计数器增量**：本窗口内计数没涨 ⇒ 这一轮没有新增失败。语义与
  // 「每轮都在失败 vs 刚失败一次」严格对齐，且不依赖任何模块暴露「当前态」字段。
  const __delta = {};
  function noteCounter(site, count, sigWhenRaised) {
    if (typeof count !== 'number' || !isFinite(count)) return null;   // 读不出计数就不记（不猜）
    const prev = __delta[site];
    __delta[site] = count;
    if (prev === undefined) return null;   // 首次只见基线：不判「涨了」（没有可比对象）
    const raised = count > prev;
    return note(site, !raised, raised ? (sigWhenRaised || ('+' + (count - prev))) : null);
  }

  /** 内置站点集：只读调用各模块**已暴露**的读数函数（不新增任何引擎写点）
   *  返回**读数成功数**（不是新增记账数）——首轮采样只建立基线，仍属「读到了」，
   *  若按新增加数计会返回 0，消费端会误判「探针没接上」。 */
  function probeDefault() {
    let n = 0;
    const S = WA.settingsBus, ST = WA.store, CK = WA.clock;
    if (S && typeof S.writeStat === 'function') {
      const r = safe(function () { return S.writeStat(); }, null);
      if (r && typeof r.writeFailed === 'number') { noteCounter('settingsBus.write', r.writeFailed, String(r.lastError || 'write-failed').slice(0, 60)); n++; }
    }
    if (S && typeof S.readStat === 'function') {
      const r = safe(function () { return S.readStat(); }, null);
      if (r && typeof r.readFailed === 'number') { noteCounter('settingsBus.read', r.readFailed, String(r.lastError || 'read-failed').slice(0, 60)); n++; }
    }
    if (ST && typeof ST.integrityStat === 'function') {
      const r = safe(function () { return ST.integrityStat(); }, null);
      // integrityStat 的「未采样」与「采样失败」是两件事（lastOk === null ⇒ 未采样）
      if (r && typeof r.mismatches === 'number') { noteCounter('store.integrity', r.mismatches, String(r.lastReason || 'mismatch').slice(0, 60)); n++; }
    }
    if (ST && typeof ST.removeStat === 'function') {
      const r = safe(function () { return ST.removeStat(); }, null);
      if (r && typeof r.failed === 'number') { noteCounter('store.remove', r.failed, String(r.lastKey || 'remove-failed').slice(0, 60)); n++; }
    }
    if (CK && typeof CK.clockStat === 'function') {
      const r = safe(function () { return CK.clockStat(); }, null);
      if (r && typeof r.failed === 'number') { noteCounter('clock', r.failed, 'clock-arg-invalid'); n++; }
    }
    return n;
  }

  /**
   * 探针：把既有台账的「最近一次」字段喂进来。
   * 只读地调用各模块**已经暴露**的读数函数，不新增任何引擎写点——
   * 这样即使某个引擎不主动调用 note()，时间轴也能覆盖到它（治「接不上就永远空白」）。
   * @param {Array} hooks [{site, sig?, read:()=>({ok, sig?})}]
   */
  function probe(hooks) {
    const list = Array.isArray(hooks) ? hooks : [];
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      if (!h || !clean(h.site) || typeof h.read !== 'function') continue;
      try {
        const r = h.read();
        if (!r || typeof r.ok !== 'boolean') continue;   // 读不出结论就不记（不猜）
        note(h.site, r.ok, (r.sig !== undefined && r.sig !== null) ? r.sig : h.sig);
        n++;
      } catch (e) { /* 单个 hook 失败不影响其它站点 */ }
    }
    return n;
  }

  WA.ledgerTimeline = {
    MAX_SITES, MAX_STEPS,
    note, siteStat, stat, summaryText, reset, probe,
    probeDefault,           // v2.50.0: 内置站点集（计数器增量口径，见 noteCounter 注释）
    __sites: __sites        // 只读暴露给回归做隔离断言（产品代码不消费）
  };
  if (WA.log) WA.log('info', '台账时间轴已加载（只读）');
})();
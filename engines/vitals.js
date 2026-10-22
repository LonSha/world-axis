/**
 * WorldAxis engines/vitals.js (v2.230.0) — 生理线：周期 / 受孕 / 孕期 / 哺乳 + 怀孕知晓
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   本仓的 `survival` 只有饱食/精力/负重三条读数，`lifeline` 只有病况的程段与限制 ——
 *   两者都不回答一件持续数月、且**会自己往前走**的事：生殖与激素线。
 *   现场实测：`生理周期` / `受孕` / `孕期` / `孕周` / `哺乳` 在
 *   engines|core|actors|direction|render|ui **全库零命中**。
 *   后果：这类事要么不写，要么被写成「一句话就过去了」——长局里这是最刺眼的失真：
 *   一个会随天数演变的持续状态，在本仓没有任何落点。
 *
 * ── 缝合来源（显式写明，不冒称原创）──────────────────────────────────
 *   来源是打包前端「彼方 / ElseWhere」的生理监测模块，其提示词原文口径逐条对应：
 *     · 生理字段（生理周期 / 是否怀孕 / 周期长度）**由代码判定并锁定**，不由模型改；
 *     · Day / 孕周**按剧情时间自动推进**，日常推进无需返回；
 *     · **严禁**把孕期擅自改回普通周期，也严禁把「是否怀孕」从 true 改回 false
 *       —— 除非剧情明确写了流产/终止妊娠/确诊未孕/分娩；
 *     · 「怀孕知晓」三档：未知 / 疑似 / 已确认；
 *     · **即使「已确认」，其他 NPC 与主角仍不知道她怀孕** —— 除非剧情明确写了
 *       告知 / 陪同验孕 / 她亲口说出 / 他人目击。否则相关 NPC 不得体现知情。
 *   最后一条是本模块最贵的判据：它治的是**防全知**（「她知道自己怀孕了」与
 *   「全世界都知道她怀孕了」长得一样，是本仓反复治的那类静默失真）。
 *
 * ── 与既有模块的分工（三者不读写对方）────────────────────────────────
 *   · survival —— 饱食/精力/负重三值的**量与档**；
 *   · lifeline —— **病况**的程段、限制与照护缺口（本模块不碰病况）；
 *   · 本模块   —— **生殖与激素线**：周期 Day/相、受孕判定、孕期孕周、哺乳、
 *                  以及「谁知道」的知晓面。
 *   病况与孕期的叠加（妊娠期并发症）**不在本模块裁决** —— 那是调用方的事。
 *
 * ── 九条否定式边界（本模块存在的全部理由）────────────────────────────
 *   ① 总开关默认关闭。关闭时登记/推进/读数一律拒收 disabled，不猜。
 *   ② **必须是人名**：`no-name`（不拿「某个女人」建档）。
 *   ③ **未登记不冒充未孕**：`unknown-person`（「查不到」与「没怀」长得一样）。
 *   ④ **孕期不回退**：已确认怀孕者推进时必须沿孕期前进或原地，把孕期改回
 *      普通相一律拒收 `no-revert`（除非显式走 endPregnancy 且理由在白名单内）。
 *   ⑤ **周期长度须在合理域内**（bounds），出域拒收 `bad-cycle`（不夹取 —— 夹取会把
 *      「填错了」与「就是这样」抹平）。
 *   ⑥ **知晓三档互不回落**：unknown / suspected / confirmed 只能前进或原地，
 *      退回拒收 `know-revert`（「忘了她怀过」不是剧情）。
 *   ⑦ **防全知是硬默认**：`knowsOthers()` 恒返回 false，除非在该人条目里显式
 *      `told: ['某人']`（告知/目睹/陪同验孕三条路径之一才算）。
 *   ⑧ **时间推进用世界钟**：`tick(days)` 走 calendar/clock 的世界日，不读 Date.now
 *      作为「剧情时间」（Date.now 只做记录时间戳）。
 *   ⑨ 未知相名不猜：PHASES 白名单外拒收 `unknown-phase`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  /** v2.230.0：决策时间统一出口（裸调 Date.now 会绕过冻结，回放对不上时只能全库通读）。 */
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_vitals_settings_v1';
  const DEF = { enabled: false, maxRows: 24, cycleMin: 21, cycleMax: 35, gestDays: 280, lactDays: 180 };
  const __REG = { key: LS_KEY, def: DEF, module: 'vitals',
    bounds: { maxRows: [4, 48], cycleMin: [18, 30], cycleMax: [28, 45], gestDays: [200, 320], lactDays: [30, 720] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const PHASES = ['menstrual', 'follicular', 'ovulation', 'luteal'];
  const PHASE_LABEL = { menstrual: '月经期', follicular: '卵泡期', ovulation: '排卵期', luteal: '黄体期' };
  const KNOW = ['unknown', 'suspected', 'confirmed'];
  const KNOW_LABEL = { unknown: '未知', suspected: '疑似', confirmed: '已确认' };
  const KNOW_RANK = { unknown: 0, suspected: 1, confirmed: 2 };
  const END_REASONS = ['miscarriage', 'termination', 'not-pregnant', 'birth'];
  const TOLD_VIA = ['told', 'witnessed', 'accompanied', 'self-declared'];
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  const stat = { registered: 0, ticks: 0, conceived: 0, know: 0, ended: 0, refused: 0, blocked: 0,
    // v2.231.0（OPT-4）：剧情时间驱动面 ——
    //   swept       ：按剧情日差推进过几轮（同日重复调用不计数）；
    //   sweptDays   ：累计推进了几个剧情日；
    //   lastSweepDay：上一次推进锚在哪个剧情日（**不是计数器，是锚点**，reset 不清）；
    //   birthDue    ：到期但**等剧情事件**的孕期数（不靠计时自动杜撰分娩）。
    swept: 0, sweptDays: 0, lastSweepDay: null, birthDue: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().vitals; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function rowOf(name) { const k = clean(name, 40); return rows().filter(function (r) { return r && r.name === k; })[0] || null; }
  function refuse(reason) { stat.refused++; noteFault(reason); return { ok: false, reason: reason }; }
  function bucket(draft) {
    if (!draft.vitals || typeof draft.vitals !== 'object' || Array.isArray(draft.vitals)) draft.vitals = { rows: [] };
    if (!Array.isArray(draft.vitals.rows)) draft.vitals.rows = [];
    return draft.vitals;
  }
  function freshRow(name) {
    return { name: name, pregnant: false, cycleDay: 0, cycleLen: 28, lastStart: 0,
      gestDay: 0, lactDay: 0, know: 'unknown', told: [], phase: 'follicular', updatedAt: 0 };
  }
  /** 登记 / 重置某人的生理线（周期长度须在域内 —— 出域不夹取）。 */
  function register(name, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const nm = clean(name, 40);
    if (!nm) return refuse('no-name');
    const o = opts || {};
    const len = Number(o.cycleLen);
    if (Number.isFinite(len) && (len < cfg.cycleMin || len > cfg.cycleMax)) return refuse('bad-cycle');
    let out = null;
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      let r = b.rows.filter(function (x) { return x && x.name === nm; })[0];
      if (!r) { r = freshRow(nm); b.rows.push(r); }
      r.cycleLen = Number.isFinite(len) ? len : r.cycleLen;
      r.updatedAt = clockNow('vitals');
      const _keptVt = b.rows;
      // v2.231.0（OPT-2/OPT-4）：挤出器是**原地截断 + 返回报告**，不是「返回新数组」。
      //   把报告赋回数据槽 ⇒ 下一次进桶被 bucket() 重置为 [] ⇒ 整张表静默清空。
      if (WA.evict && WA.evict.array) WA.evict.array(_keptVt, 'vitals.rows');
      b.rows = _keptVt;
      out = { ok: true, reason: 'ok', name: nm, cycleLen: r.cycleLen };
      return true;
    }, 'vitals:register');
    if (out && out.ok) stat.registered++;
    return out || refuse('tx-failed');
  }
  /** 受孕判定。只在未孕者可判；已孕者拒收 already-pregnant（不覆盖）。 */
  function conceive(name, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const nm = clean(name, 40);
    if (!nm) return refuse('no-name');
    const r0 = rowOf(nm);
    if (!r0) return refuse('unknown-person');
    if (r0.pregnant) return refuse('already-pregnant');
    let out = null;
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      const r = b.rows.filter(function (x) { return x && x.name === nm; })[0];
      r.pregnant = true; r.gestDay = 0; r.lactDay = 0; r.know = 'unknown'; r.told = [];
      r.basis = clean((opts || {}).basis, 160);
      r.conceivedAt = clockNow('vitals'); r.updatedAt = clockNow('vitals');
      out = { ok: true, reason: 'ok', name: nm, gestDay: 0 };
      return true;
    }, 'vitals:conceive');
    if (out && out.ok) stat.conceived++;
    return out || refuse('tx-failed');
  }
  /** 知晓推进：三档只能前进或原地，退回拒收 know-revert。 */
  function know(name, level, via) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const nm = clean(name, 40);
    if (!nm) return refuse('no-name');
    const lv = clean(level, 12);
    if (KNOW.indexOf(lv) < 0) return refuse('unknown-level');
    const r0 = rowOf(nm);
    if (!r0) return refuse('unknown-person');
    if (KNOW_RANK[lv] < KNOW_RANK[r0.know || 'unknown']) return refuse('know-revert');
    let out = null;
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      const r = b.rows.filter(function (x) { return x && x.name === nm; })[0];
      r.know = lv; r.knowAt = clockNow('vitals'); r.updatedAt = clockNow('vitals');
      out = { ok: true, reason: 'ok', name: nm, know: lv };
      return true;
    }, 'vitals:know');
    if (out && out.ok) stat.know++;
    return out || refuse('tx-failed');
  }
  /** 告知某人（防全知：只有显式登记者才知情 —— 路径须在白名单内）。 */
  function tell(name, who, via) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const nm = clean(name, 40);
    const w = clean(who, 40);
    if (!nm || !w) return refuse('no-name');
    const v = clean(via, 20) || 'told';
    if (TOLD_VIA.indexOf(v) < 0) return refuse('unknown-via');
    const r0 = rowOf(nm);
    if (!r0) return refuse('unknown-person');
    if (!r0.pregnant) return refuse('not-pregnant');
    let out = null;
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      const r = b.rows.filter(function (x) { return x && x.name === nm; })[0];
      r.told = Array.isArray(r.told) ? r.told : [];
      if (r.told.indexOf(w) < 0) r.told.push(w);
      if (!Array.isArray(r.toldLog)) r.toldLog = [];
      r.toldLog.push({ who: w, via: v, at: clockNow('vitals') });
      while (r.toldLog.length > 24) r.toldLog.shift();
      r.updatedAt = clockNow('vitals');
      out = { ok: true, reason: 'ok', name: nm, told: r.told.slice() };
      return true;
    }, 'vitals:tell');
    return out || refuse('tx-failed');
  }
  /** 某人是否知情。**未知一律 false**（防全知是硬默认）。 */
  function knows(name, who) {
    const r = rowOf(name);
    if (!r || !r.pregnant) return false;
    return (r.told || []).indexOf(clean(who, 40)) >= 0;
  }
  /** 除当事人之外，谁知道 —— 返回名单（空 = 无人知情，这正是默认）。 */
  function knowsOthers(name) {
    const r = rowOf(name);
    if (!r || !r.pregnant) return [];
    return (r.told || []).slice();
  }
  /** 世界钟推进（天数）。**不读 Date.now 当剧情时间**（那只是记录戳）。 */
  function tick(name, days) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const nm = clean(name, 40);
    if (!nm) return refuse('no-name');
    const d = Math.floor(Number(days));
    if (!Number.isFinite(d) || d < 0) return refuse('bad-days');
    const r0 = rowOf(nm);
    if (!r0) return refuse('unknown-person');
    let out = null;
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      const r = b.rows.filter(function (x) { return x && x.name === nm; })[0];
      if (r.pregnant) {
        r.gestDay = (Number(r.gestDay) || 0) + d;
        if (r.gestDay >= cfg.gestDays) { r.pregnant = false; r.lactDay = 0; r.gestDay = cfg.gestDays; r.phase = 'luteal'; }
      } else if (Number(r.lactDay) > 0 && r.lactDay < cfg.lactDays) {
        r.lactDay = Math.min(cfg.lactDays, r.lactDay + d);
      } else {
        const len = Number(r.cycleLen) || 28;
        let day = (Number(r.cycleDay) || 0) + d;
        while (day >= len) day -= len;
        r.cycleDay = day;
        r.phase = phaseOf(day, len);
      }
      r.updatedAt = clockNow('vitals');
      out = { ok: true, reason: 'ok', name: nm, pregnant: r.pregnant, gestDay: r.gestDay, cycleDay: r.cycleDay, phase: r.phase };
      return true;
    }, 'vitals:tick');
    if (out && out.ok) stat.ticks++;
    return out || refuse('tx-failed');
  }
  /**
   * v2.231.0（OPT-4）：**剧情日读数**（唯一真源是 `store.clock.dayIndex`，与 playtime.story 同源）。
   *   缺失即 null（**拒算**，不拿真实时间顶替 —— 与 playtime「不猜日期」同口径）。
   */
  function storyDay() {
    try {
      const st = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
      const c = st.clock || {};
      return (typeof c.dayIndex === 'number' && isFinite(c.dayIndex)) ? c.dayIndex : null;
    } catch (e) { return null; }
  }
  /**
   * v2.231.0（OPT-4）：**推进锚点**。此前只活在模块内存（`stat.lastSweepDay`）——
   *   重载后锚点归零 ⇒ 第一次 sweep 只记锚点，把「重载期间跨过的剧情日」静默吞掉一次
   *   （推进链断在重载上，而面板上日子照走）。锚点必须进存档：
   *   真源是 `store.vitals.lastSweepDay`，内存值只作**同会话缓存**。
   */
  function anchorDay() {
    try {
      const st = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
      const v = st.vitals || {};
      if (typeof v.lastSweepDay === 'number' && isFinite(v.lastSweepDay)) return v.lastSweepDay;
    } catch (e) { /* 读不到就退回内存缓存 */ }
    return stat.lastSweepDay;
  }
  function saveAnchor(day) {
    try {
      WA.store.transact(function (draft) { bucket(draft).lastSweepDay = day; return true; }, 'vitals:anchor');
    } catch (e) { /* 锚点写失败不拖推进本身 */ }
  }
  /**
   * v2.231.0（OPT-4）：**按剧情日差推进**（世界心跳调用；此前 daySweep 只调 view() 空转）。
   *   四条口径（都是否定式）：
   *     ① **同日不重复**：`dayIndex` 没变 ⇒ 一格不动（同轮重生成不多算）。
   *     ② **跨日不漏算**：一次跨 N 日 ⇒ 一次推进 N 日（不做逐日空转）。
   *     ③ **无钟不猜**：世界钟缺失 ⇒ 如实 `no-clock`，**不**拿真实时间顶替（不猜日期）。
   *     ④ **到期不杜撰**：孕期到 `gestDays` ⇒ 只标 `birthDue` 等**剧情事件**（endPregnancy）
   *        来结束，**不**由计时自动清孕产 —— 「计时到了」与「孩子生了」是两件事。
   *   首次见到世界钟只**记锚点**，不追溯推进（不猜「之前过了多久」）。
   */
  function sweep() {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const day = storyDay();
    if (day === null) { stat.lastReason = 'no-clock'; return { ok: true, reason: 'no-clock', day: null, days: 0, ticked: 0 }; }
    const last = anchorDay();
    if (last === null) {
      stat.lastSweepDay = day; saveAnchor(day); stat.lastReason = 'anchored';
      return { ok: true, reason: 'anchored', day: day, days: 0, ticked: 0,
        note: '首次见到世界钟：只记锚点，不追溯推进（不猜之前过了多久）。' };
    }
    if (day <= last) { stat.lastReason = 'same-day'; return { ok: true, reason: 'same-day', day: day, days: 0, ticked: 0 }; }
    const days = day - last;
    const out = { ok: true, reason: 'ok', day: day, days: days, ticked: 0, due: [] };
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      b.rows.forEach(function (r) {
        if (!r || !r.name) return;
        if (r.pregnant) {
          r.gestDay = (Number(r.gestDay) || 0) + days;
          if (r.gestDay >= cfg.gestDays) {
            // 口径 ④：夹在阈值上并标「到期待处理」，**不**自动结束孕期。
            r.gestDay = cfg.gestDays; r.birthDue = true; out.due.push(r.name);
          }
          r.updatedAt = clockNow('vitals'); out.ticked++;
          return;
        }
        if (Number(r.lactDay) > 0 && r.lactDay < cfg.lactDays) {
          r.lactDay = Math.min(cfg.lactDays, r.lactDay + days);
          r.updatedAt = clockNow('vitals'); out.ticked++; return;
        }
        const len = Number(r.cycleLen) || 28;
        let d0 = (Number(r.cycleDay) || 0) + days;
        while (d0 >= len) d0 -= len;
        r.cycleDay = d0; r.phase = phaseOf(d0, len);
        r.updatedAt = clockNow('vitals'); out.ticked++;
      });
      return true;
    }, 'vitals:sweep');
    stat.lastSweepDay = day; saveAnchor(day); stat.swept++; stat.sweptDays += days;
    stat.birthDue = (function () {
      try { return rows().filter(function (r) { return r && r.birthDue === true; }).length; } catch (e) { return 0; }
    })();
    stat.lastReason = 'ok';
    out.note = '按剧情日差推进：同日不重复、跨日不漏算；孕期到期只标待处理，不自动结束。';
    return out;
  }
  /** 周期 Day → 相。断点与上游口径一致：约 1/4 月经、其後卵泡、中点排卵、后段黄体。 */
  function phaseOf(day, len) {
    const n = Math.max(1, Number(len) || 28);
    const d = ((Math.floor(Number(day) || 0) % n) + n) % n;
    const men = Math.max(3, Math.round(n * 0.18));
    const ovu = Math.round(n / 2);
    if (d < men) return 'menstrual';
    if (d <= ovu) return 'follicular';
    if (d <= ovu + 1) return 'ovulation';
    return 'luteal';
  }
  /** 结束孕期。理由须在白名单内（默认的流产/终止/确诊未孕/分娩四类）。 */
  function endPregnancy(name, reason) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const nm = clean(name, 40);
    if (!nm) return refuse('no-name');
    const rs = clean(reason, 20);
    if (END_REASONS.indexOf(rs) < 0) return refuse('unknown-reason');
    const r0 = rowOf(nm);
    if (!r0) return refuse('unknown-person');
    if (!r0.pregnant) return refuse('not-pregnant');
    let out = null;
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      const r = b.rows.filter(function (x) { return x && x.name === nm; })[0];
      const was = r.gestDay;
      r.pregnant = false; r.gestDay = 0; r.know = 'unknown'; r.told = [];
      r.endReason = rs; r.endedAt = clockNow('vitals'); r.updatedAt = clockNow('vitals');
      // v2.231.0（OPT-4）：剧情事件到了 ⇒ 清掉「到期待处理」标记（口径 ④ 的另一半）。
      r.birthDue = false;
      if (rs === 'birth') { r.lactDay = 1; } else { r.cycleDay = 0; r.phase = 'menstrual'; }
      r.history = Array.isArray(r.history) ? r.history : [];
      r.history.push({ reason: rs, gestDay: was, at: clockNow('vitals') });
      while (r.history.length > 12) r.history.shift();
      out = { ok: true, reason: 'ok', name: nm, endReason: rs, lact: rs === 'birth' };
      return true;
    }, 'vitals:endPregnancy');
    if (out && out.ok) stat.ended++;
    return out || refuse('tx-failed');
  }
  function view(name) {
    const r = rowOf(name);
    if (!r) return { ok: false, reason: 'unknown-person' };
    return { ok: true, name: r.name, pregnant: !!r.pregnant, gestDay: Number(r.gestDay) || 0,
      lactDay: Number(r.lactDay) || 0, cycleDay: Number(r.cycleDay) || 0, cycleLen: Number(r.cycleLen) || 28,
      phase: r.phase || 'luteal', phaseLabel: PHASE_LABEL[r.phase] || '',
      know: r.know || 'unknown', knowLabel: KNOW_LABEL[r.know || 'unknown'] || '',
      knowsOthers: knowsOthers(name) };
  }
  function buildBlock() {
    if (!settings().enabled) return '';
    const rs = rows().filter(function (r) { return r && (r.pregnant || Number(r.cycleDay) > 0); });
    if (!rs.length) return '';
    const lines = rs.slice(-12).map(function (r) {
      const bits = ['· ' + r.name + '｜' + (r.pregnant
        ? ('孕期 第' + (Number(r.gestDay) || 0) + '天 ｜ 知晓：' + (KNOW_LABEL[r.know || 'unknown'] || ''))
        : ('周期 第' + (Number(r.cycleDay) || 0) + '/' + (Number(r.cycleLen) || 28) + '天 ｜ ' + (PHASE_LABEL[r.phase] || '')))];
      if (r.pregnant && (r.told || []).length) bits.push('  已知情：' + r.told.join('、'));
      if (r.pregnant) bits.push('  （未告知者一律不知情 —— 不得默认他人知情）');
      return bits.join('\n');
    });
    return ['【生理线】'].concat(lines).join('\n');
  }
  function list() { return rows().map(function (r) { return r && r.name; }).filter(Boolean); }
  function reset() { stat.registered = 0; stat.ticks = 0; stat.conceived = 0; stat.know = 0; stat.ended = 0; stat.refused = 0; stat.blocked = 0;
    // v2.231.0（OPT-4）：推进面计数器清零，**锚点不动** —— 锚点不是计数器，
    //   清了会让下一次 sweep 重新「只记锚点」，把真实的跨日吞掉一次。
    stat.swept = 0; stat.sweptDays = 0; stat.birthDue = 0; stat.lastReason = ''; stat.faults = {}; return { ok: true }; }
  WA.vitals = {
    getSettings: settings, setSettings: saveSettings,
    register: register, conceive: conceive, know: know, tell: tell, knows: knows, knowsOthers: knowsOthers,
    tick: tick, endPregnancy: endPregnancy, phaseOf: phaseOf, view: view, list: list, buildBlock: buildBlock,
    sweep: sweep,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, reset: reset,
    PHASES: PHASES, PHASE_LABEL: PHASE_LABEL, KNOW: KNOW, KNOW_LABEL: KNOW_LABEL, END_REASONS: END_REASONS, TOLD_VIA: TOLD_VIA,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/vitals.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'vitals 已加载（2.230.0）');
  if (WA.workflow && typeof WA.workflow.register === 'function') {
    WA.workflow.register({
      id: 'vitals.daySweep', chain: 'after', order: 22, critical: false,
      label: '生理线·周期阶段刷新与孕期结算（周期/孕期状态账）',
      async run() {
        // v2.231.0（OPT-4）：原实现逐个名字调 view()（纯读）—— 面板上的日子在动、
        //   身体状态却一格不动（「剧情跨三天只推进三天」这条要求当时根本不成立）。
        //   现在按**剧情日差**推进：同日不重复、跨日不漏算、无钟不猜、到期不杜撰。
        try { sweep(); } catch (e) { /* 附属面失败不拖主链 */ }
      }
    });
  }
})();

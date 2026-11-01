/**
 * WorldAxis engines/world-briefing.js（v2.285.0 · V7 EXV7-1）
 * 今日世界简报：这一轮世界动了哪几根弦。
 *
 * 【EXV7-1 立项原文】记的是**结构化引擎的写入流水**：本轮 life 新目标几条、
 *   events 排期几个、intel 情报几份、bonds 关系变了几对。数据源是 OPV7-1 的
 *   intake 分发账本，不重算。零新容器。
 *
 * 【与世界日记的分工（两者语言同形，必须先说清）】
 *   worldDiary 答「镜头外**发生过什么**」（叙事事实，人话句子）；
 *   worldBriefing 答「这一轮**结构化引擎各自吃进了几笔**」（机制流水，计数行）。
 *   前者给读故事的，后者给盯系统的——简报的每一行都必须能核对到对应引擎
 *   stat() 的计数，核对不到的话那一行就不许出现。
 *
 * 【为什么快照而非现读差分】
 *   六源 stat() 都是**累计计数**（life.stat().changed 从开局加到现在），而简报要的是
 *   「这一轮」的增量。两个方案：
 *     ① 现读差分（渲染时 stat() − 上次 stat()）：渲染时机不定，两轮之间可能被任何
 *        东西写，差出来的数不属于任何一轮，是**多次写的和**——冒充单轮流水；
 *     ② 结算边界快照（每轮结算完的瞬间由 backstage 拍一次）：每轮的天然边界。
 *   选②，但**不走总线订阅**：run.js 对 `backstage:settled` 的监听位数有断言
 *   （bridge 测试断言「开闸后恰 1 个监听」），新订阅者会把那条读数悄悄改写 ——
 *   「一处观察面把另一处观察面的读数污染」是本仓判过多次的反模式。故本模块
 *   只暴露 `snap()`，由 `backstage._start` 在事务后副作用层直调（与 intake.run
 *   同层同型：失败不抛、不回滚、只作读数）。快照只读六源的 stat()/getSettings()，
 *   不碰任何写口。
 *
 * 【三态零读数分开（同 diaryBlock 裁决，不二次踩）】
 *   模块缺席 / 引擎关着 / 确实没写进 —— 各自不同因、各自不同处置：
 *     · 源引擎未加载   ⇒ 该行标 unavailable（「没装上」，不是「没动静」）；
 *     · 源引擎关着     ⇒ 该行标 off（intake 面向它的分发必拒，这是「关着」）；
 *     · 开着但增量为 0 ⇒ 真的没写进（本轮里没有对应事实，不是故障）。
 *
 * 【轮次坐标】
 *   真源 store.get().lastInjection.round（回落 evolution.roundOf(state)），与
 *   health-preflight 趋势判据同源——不拿调用次数当轮次（同一轮被看三次会被
 *   读成「三轮产出一样」）。
 *
 * 【本模块不做的事】
 *   · 不 buildBlock：简报是「面板概览页的玩家面读数」，不进注入（注入的是机制
 *     的产出物，不是机制的计分板）；
 *   · 不写 store / localStorage（除自身设置键）/ 不调模型 / 不碰任何引擎写口；
 *   · 不造第二真源：六源计数全部现读现核对，快照只保留差分所需的基线与终值。
 *
 * 【导出面（8 口）】
 *   getSettings / setSettings / snap / view / stat / MARKS / _viewFrom / reset
 */
(function () {
  'use strict';
  // 别名形态与仓内文件统一（module-cycle-gate 的 ALIAS_RE 只认这一种）：
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  const LS_KEY = 'worldaxis_world_briefing_settings_v1';
  const DEF = { enabled: true, maxRows: 8 };
  const __REG = { key: LS_KEY, def: DEF, module: 'worldBriefing', bounds: { maxRows: [3, 12] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function settings() {
    if (WA.settingsBus && typeof WA.settingsBus.read === 'function') {
      const raw = WA.settingsBus.read(__REG);
      const merged = Object.assign({}, DEF, raw || {});
      return typeof WA.settingsBus.normalize === 'function' ? WA.settingsBus.normalize(__REG, merged) : merged;
    }
    return Object.assign({}, DEF);
  }
  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    if (WA.settingsBus && typeof WA.settingsBus.saveOrThrow === 'function') {
      const norm = typeof WA.settingsBus.normalize === 'function' ? WA.settingsBus.normalize(__REG, merged) : merged;
      return WA.settingsBus.saveOrThrow(__REG, norm);
    }
    return merged;
  }

  const __stat = { snaps: 0, lastRound: -1, lastReason: '', faults: {}, dropped: 0 };
  function fault(k) { __stat.faults[k] = (__stat.faults[k] || 0) + 1; }
  /** 计数回落检测：源引擎的累计计数比上轮小 ⇒ 那轮的 delta 被置 null（不冒充负流水），但这件事要被记下。 */
  function countDropped(counts) {
    if (!__prevAtSnap) return;
    MARKS.forEach(function (m) {
      const k = m.ns + '.' + m.key;
      const a = counts[k], b = __prevAtSnap.counts[k];
      if (a !== undefined && b !== undefined && Number(a) < Number(b)) __stat.dropped++;
    });
  }

  /** 只读、失败即降级（观察层失败不许影响主链）。 */
  function safe(fn, fb) {
    try { const v = fn(); return v === undefined ? fb : v; } catch (e) { fault('read-threw'); return fb; }
  }

  /**
   * 六源清单：**这是本模块唯一的「知识」**（同 intake-dispatch MAPPING 的裁决）。
   *   每行必须能答三问：① ns 在不在（引擎未加载 ⇒ unavailable）；② stat 键在不在
   *   （key 不在 ⇒ 该行不许出现，核对不到的计数不进简报）；③ 数字方向（全是
   *   「写进」方向的累计计数，读方向的计数不算流水）。
   *   label 是面板文案（玩家面语言）；key 是源引擎 stat() 里的累计字段名。
   */
  const MARKS = [
    { ns: 'life',        key: 'changed',   label: '生活目标 / 日程（life.changed）' },
    { ns: 'events',      key: 'scheduled', label: '事件排期（events.scheduled）' },
    { ns: 'intel',       key: 'intel',     label: '情报入账（intel.intel）' },
    { ns: 'bonds',       key: 'sets',      label: '关系对（bonds.sets）' },
    { ns: 'temperament', key: 'sets',      label: '性格锚（temperament.sets）' },
    { ns: 'enigma',      key: 'marks',     label: '秘密标记（enigma.marks）' }
  ];

  /** 轮次坐标（与 health-preflight 趋势判据同源）。 */
  function roundNow() {
    return safe(function () {
      const st = WA.store && typeof WA.store.get === 'function' ? WA.store.get() : null;
      const r = st && st.lastInjection && isFinite(Number(st.lastInjection.round))
        ? Number(st.lastInjection.round) : null;
      if (r !== null) return r;
      if (WA.evolution && typeof WA.evolution.roundOf === 'function' && st) {
        const rr = WA.evolution.roundOf(st);
        return isFinite(Number(rr)) ? Number(rr) : -1;
      }
      return -1;
    }, -1);
  }

  /** 单源的当场计数；引擎缺席 / stat 缺键 ⇒ null（核对不到的计数不进简报）。 */
  function countOf(m) {
    const eng = WA[m.ns];
    if (!eng || typeof eng.stat !== 'function') return null;
    const st = safe(function () { return eng.stat(); }, null);
    if (!st || !Object.prototype.hasOwnProperty.call(st, m.key)) return null;
    const v = Number(st[m.key]);
    return isFinite(v) ? v : null;
  }

  /** 引擎开关态（关着的源在行里标 off，与「没写进」分开）。 */
  function engineOn(m) {
    const eng = WA[m.ns];
    if (!eng || typeof eng.getSettings !== 'function') return null;
    const cfg = safe(function () { return eng.getSettings(); }, null);
    if (!cfg || !Object.prototype.hasOwnProperty.call(cfg, 'enabled')) return null;
    return cfg.enabled === true;
  }

  // ── 快照：每轮结算边界的基线与终值（进程内存，不落盘）─────────────────────
  let __prev = null;        // 最近一次结算边界的 counts
  let __prevAtSnap = null;  // 上一轮边界（差分基线）：snap 时先算差再更新，故与 __prev 错开一轮
  let __last = null;        // 最近一次 snap 的完整快照（view 的直读真源）

  /**
   * 拍一轮快照。**只由 backstage._start 事务后调用**（与 intake.run 同层）。
   *   同轮重拍：保持终值刷新但不重设基线（基线属于上一轮的边界；同一轮的第二次
   *   结算不该被念成第二轮流水）。
   * @param anchor 可选（与 intake.run 同型；只用来诊断，不读业务字段）
   */
  function snap(anchor) {
    __stat.snaps++;
    const round = roundNow();
    const counts = {};
    MARKS.forEach(function (m) {
      const v = countOf(m);
      if (v !== null) counts[m.ns + '.' + m.key] = v;
    });
    if (__last && __last.round === round) {
      __last = { round: round, counts: counts,
        rows: __last.rows, total: __last.total, written: __last.written,
        quiet: __last.quiet, firstRound: __last.firstRound, reasons: __last.reasons };
      return view();
    }
    countDropped(counts);
    __prev = { round: round, counts: counts };
    __last = viewFrom(round, counts, __prevAtSnap);
    __prevAtSnap = __prev;
    __stat.lastRound = round;
    return view();
  }

  /**
   * 由终值与基线算一轮增量视图（纯函数，探针与专锁可直接驱动）。
   *   基线 prev 是「上一轮结算边界」的 counts；null ⇒ firstRound（写进去的数没有
   *   差分基准，不冒充增量——那会把「开局播种的存量」念成「这一轮的流水」）。
   */
  function viewFrom(round, counts, prev) {
    const rows = MARKS.map(function (m) {
      const now = Object.prototype.hasOwnProperty.call(counts, m.ns + '.' + m.key)
        ? counts[m.ns + '.' + m.key] : null;
      const on = engineOn(m);
      const before = (prev && Object.prototype.hasOwnProperty.call(prev.counts, m.ns + '.' + m.key))
        ? prev.counts[m.ns + '.' + m.key] : null;
      let delta = null;
      if (now !== null && before !== null && now >= before) delta = now - before;
      return { ns: m.ns, key: m.key, label: m.label, on: on, before: before, now: now, delta: delta };
    });
    const okRows = rows.filter(function (r) { return r.now !== null; });
    const written = okRows.reduce(function (s, r) { return s + (r.delta || 0); }, 0);
    return {
      round: round,
      rows: rows,
      total: okRows.length,
      written: written,
      quiet: written === 0 && okRows.length > 0,
      firstRound: !prev,
      reasons: {}
    };
  }

  /** 面板 / 诊断读数（只读）。没有快照时返回 {available:false}，不编造。 */
  function view() {
    if (!__last) return { available: false, reason: 'no-snapshot',
      note: '还没结算过一轮（简报在每轮世界结算后生成）' };
    const cfg = settings();
    return Object.assign({ available: true, maxRows: cfg.maxRows }, __last);
  }

  function stat() {
    return { snaps: __stat.snaps, lastRound: __stat.lastRound, lastReason: __stat.lastReason,
      faults: Object.assign({}, __stat.faults),
      // 计数回落次数：源引擎累计计数比上轮小 ⇒ 那几轮的 delta 被置 null（不冒充负流水），
      //   这不是故障，但值得被看见（见 tool-diag secWorldBriefing 注释③）
      dropped: __stat.dropped,
      sources: MARKS.reduce(function (acc, m) {
        acc[m.ns] = !!(WA[m.ns] && typeof WA[m.ns].stat === 'function');
        return acc;
      }, {}),
      enabled: !!settings().enabled };
  }

  function reset() {
    __stat.snaps = 0; __stat.lastRound = -1; __stat.lastReason = ''; __stat.faults = {};
    __prev = null; __prevAtSnap = null; __last = null;
    return true;
  }

  WA.worldBriefing = {
    getSettings: settings, setSettings: saveSettings,
    snap: snap, view: view, stat: stat, MARKS: MARKS,
    // 纯函数暴露给探针 / 专锁直接驱动（已登记的真实消费方：tools/v7probes/p_briefing_face.js
    // 与 tests/v7-briefing-2285.js；面板走 view()，不走这个口）。
    _viewFrom: viewFrom,
    reset: reset
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/world-briefing.js', { kind: 'engine', ver: '2.285.0' });
  }
  if (WA.log) WA.log('info', '世界简报已加载（只读聚合）');
})();
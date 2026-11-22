/**
 * WorldAxis engines/dormant-ladder.js (v2.526.0) — EXV28-15/16 暗线阶梯与「你怎么知道」
 * 读数：currents 快照 slice(0,10)（backstage:249）；visibility 四档 hidden|trace|known|direct；
 *      rumor.visibleTo/fullView 已在——本模块不造来路，只把六态阶梯投影出来。
 * 六态：未闻 / 听闻 / 未确认 / 已介入 / 已错过 / 已了结（只投影玩家可知）。
 * 边界：hidden 绝不进正文；「已错过」不复活，除非有新证据；只读投影，不改 owner 状态。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.529.0: 决策时间单一出口（G20：产品代码零裸调 Date.now()）。此前本引擎直接裸调，
  //   冻结/回放时这段读到的时刻不受控 —— 回放对不上时无从定位。
  const clockNow = function (s) { try { return WA.clock.now(s); } catch (e) { return Date.now(); } };
  const VERSION = '2.526.0';
  const LS_KEY = 'worldaxis_dormant_ladder_settings_v1';
  const DEF = { enabled: true, blockLimit: 3 };
  const __REG = { key: LS_KEY, def: DEF, module: 'dormantLadder', bounds: { blockLimit: [1, 6] } };
  const LADDER = ['未闻', '听闻', '未确认', '已介入', '已错过', '已了结'];
  const stat = { reads: 0, leaked: 0, refused: 0, lastReason: '' };
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function state() { try { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { return {}; } }
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n || 70) : ''; }
  /** 时刻取值（与 foreshadow / longline 同一口径：非正数一律当「没有」）。 */
  function tsOf(v) { const n = Number(v); return isFinite(n) && n > 0 ? Math.floor(n) : 0; }
  /**
   * v2.556.0：进注入块的四态。两端各去掉一个，且**都写明理由** ——
   *   去掉「未闻」：玩家还不知道，进了正文就是把未揭示剧情写进去（本模块的防泄露闸）；
   *   去掉「已了结」：已经收束，再提就是复读。
   *   （原实现把这个集合内联写在 buildBlock 里，选材判据也要用它 ⇒ 收成一处。）
   */
  const VISIBLE_STATES = ['听闻', '未确认', '已介入', '已错过'];
  function knownToPlayer(c) {
    if (!c) return false;
    if (c.visibility === 'hidden') return false;
    if (c.hidden === true) return false;
    return true;
  }
  /** 由 owner 的可见性/阶段推出阶梯态；推不出就如实 unknown。 */
  function stateOf(c) {
    if (!c) return '未闻';
    if (c.ladder && LADDER.indexOf(c.ladder) >= 0) return c.ladder;
    const st = String(c.stage || '');
    if (st === '已结束' || st === 'closed') return '已了结';
    if (st === '错过' || c.missed === true) return '已错过';
    if (st === '进行中' || st === '交汇') return '已介入';
    if (c.visibility === 'direct') return '已介入';
    if (c.visibility === 'known') return '未确认';
    if (c.visibility === 'trace') return '听闻';
    return '未闻';
  }
  function project(opts) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: true, items: [], reason: 'disabled' };
    const o = opts && typeof opts === 'object' ? opts : {};
    const d = state();
    const out = [];
    (Array.isArray(d.currents) ? d.currents : []).forEach(function (c) {
      if (!c) return;
      if (!knownToPlayer(c)) { stat.leaked++; return; }
      const st = stateOf(c);
      if (st === '未闻' && o.includeUnheard !== true) return;
      out.push({ id: c.id, title: clean(c.title, 40), state: st, at: tsOf(c.ladderAt),
        how: clean(c.how || (c.publicity === 'public' ? '公开的' : '听来的'), 40),
        side: c.kind === 'seed' ? 'seed' : 'current' });
    });
    // v2.556.0：读**伏笔真源**。这一支此前读的是 `d.foreshadow`（顶层键），
    //   而全仓伏笔只写在 `memory.foreshadows`（engines/foreshadow.js 的 list() 同源）——
    //   于是 `Array.isArray(undefined)` 恒 false，**「埋着的」这一整支从来没产出一行**
    //   （实测：project 的 items 里 side === 'foreshadow' 恒为 0）。
    //   防泄露闸照旧：显式 hidden 的伏笔一条都不进（与 knownToPlayer 同向）。
    (Array.isArray((d.memory || {}).foreshadows) ? d.memory.foreshadows : []).forEach(function (f) {
      if (!f) return;
      if (f.hidden === true || f.visibility === 'hidden') { stat.leaked++; return; }
      const st = f.status === 'recycled' ? '已了结' : (f.status === 'dropped' ? '已错过' : '未确认');
      out.push({ id: f.id, title: clean(f.content, 40), state: st,
        at: tsOf(f.updatedAt) || tsOf(f.at), how: '埋着的', side: 'foreshadow' });
    });
    stat.reads++;
    return { ok: true, items: out.slice(0, Number(o.limit) || 12), ladder: LADDER.slice() };
  }
  /** 只允许把「玩家已经知道的事」标成阶梯态；hidden 一律拒。 */
  function mark(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = String(s.id || '').trim();
    const st = String(s.state || '');
    if (!id) return { ok: false, reason: 'missing-id' };
    if (LADDER.indexOf(st) < 0) return { ok: false, reason: 'unknown-state', ladder: LADDER };
    let ok = false, blocked = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          const arr = Array.isArray(d.currents) ? d.currents : [];
          for (let i = 0; i < arr.length; i++) {
            if (arr[i] && arr[i].id === id) {
              if (arr[i].visibility === 'hidden' || arr[i].hidden === true) { blocked = true; break; }
              arr[i].ladder = st; arr[i].ladderAt = clockNow('dormantLadder'); ok = true; break;
            }
          }
          return true;
        }, 'dormantLadder:mark');
      }
    } catch (e) { ok = false; }
    if (blocked) { stat.refused++; stat.lastReason = 'hidden-leak'; return { ok: false, reason: 'hidden-leak' }; }
    return ok ? { ok: true, reason: 'marked', id: id, state: st } : { ok: false, reason: 'entry-missing' };
  }
  /**
   * v2.556.0：注入名额的**分配判据**（此前是 `project({limit:8})` 先截 8 条 → 再筛四态
   *   → 再 `slice(0, blockLimit)`）。那个顺序有两个只在局面里才看得见的后果：
   *     ① **筛在截断之后**：名额被随后会被筛掉的条目占掉，配额用不满；
   *     ② **按数组顺序取**：先来的占满名额 —— 实测 8 条「听闻」（最弱档，什么都不用做）
   *        把 3 个名额全占，同一时刻「已介入」和「已错过」（该继续推 / 该交待或放弃）
   *        一条都进不来。这就是 v2.555.0 在 foreshadow 治过的同一个病，第二处。
   *
   * 判据三条（缺一不可）：
   *   ① **先筛后截**：候选 = 四态全筛出来之后才谈名额（`project` 的 limit 只做防御，
   *      不再兼任输出名额）；
   *   ② **阶梯越深越先提**：按引擎自己的六态枚举 `LADDER` 的位次降序 ——
   *      「已错过」>「已介入」>「未确认」>「听闻」。这条**不新造优先级表**：
   *      阶梯本身就是有序的，用它就是「不猜」；
   *   ③ **同档按最近变化**：`ladderAt` 越近越先（玩家刚动过的那条）；再同按 id 字典序
   *      （同输入同输出，可复算）。
   *   名额够时（候选 ≤ blockLimit）**原样全进、顺序不变** —— 没有取舍就不改行为（fail-open）。
   *   纯函数：不改入参、不读 store。
   */
  function pickBlock(items, cap) {
    const all = Array.isArray(items) ? items.slice() : [];
    const quota = Math.max(0, Math.floor(Number(cap) || 0));
    if (!all.length || !quota) return { picked: [], mode: 'empty', quota: quota };
    if (all.length <= quota) return { picked: all.slice(), mode: 'all-fit', quota: quota };
    const sorted = all.slice().sort(function (a, b) {
      const d = LADDER.indexOf(b.state) - LADDER.indexOf(a.state);
      if (d !== 0) return d;
      const t = tsOf(b.at) - tsOf(a.at);
      if (t !== 0) return t;
      const ai = String(a.id || ''), bi = String(b.id || '');
      return ai < bi ? -1 : (ai > bi ? 1 : 0);
    });
    return { picked: sorted.slice(0, quota), mode: 'deepest-first', quota: quota };
  }
  /** 最近一次注入单的读数（供 stat().block / view().block 投影；**拷贝**出去，不是引用）。 */
  let __lastBlock = null;
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    // 候选上限只做防御（currents 可能有几百条），**不兼任**输出名额。
    const r = project({ limit: Number.MAX_SAFE_INTEGER });
    const items = (r.items || []).filter(function (x) { return VISIBLE_STATES.indexOf(x.state) >= 0; });
    const pick = pickBlock(items, cfg.blockLimit);
    // 读数先落账（**空表也留读数**）：`picked: 0` 与「从没构建过（null）」是两件事。
    __lastBlock = {
      at: clockNow('dormantLadder'), candidates: items.length, picked: pick.picked.length,
      quota: pick.quota, mode: pick.mode, ladder: LADDER.slice()
    };
    if (!pick.picked.length) return '';
    return '[你知道的暗线]' + String.fromCharCode(10) + pick.picked.map(function (x) {
      return '- ' + x.title + '（' + x.state + '，' + x.how + '）';
    }).join(String.fromCharCode(10));
  }
  function view() { return { enabled: settings().enabled, ladder: LADDER.slice(), items: project({ limit: 12 }).items, stat: stat, block: __lastBlock ? Object.assign({}, __lastBlock) : null }; }
  WA.dormantLadder = {
    getSettings: settings, setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    LADDER: LADDER.slice(), stateOf: stateOf, project: project, mark: mark, buildBlock: buildBlock, view: view,
    stat: function () {
      // v2.556.0：`block` 是「最近一次注入单」的名额面读数（拷贝出去，不是引用）。
      //   null = 本进程还没构建过；picked: 0 = 构建过但空表 —— 这两件事不许混成一个读数。
      //   candidates 与 picked 并列：`candidates: 8, picked: 3` 说的是「有 8 条可见暗线，
      //   这一轮只提最深的 3 条」—— 两个数若恒等，说明名额面根本没起作用。
      return Object.assign({}, stat, { block: __lastBlock ? Object.assign({}, __lastBlock) : null });
    }
  };
  if (WA.registerModule) WA.registerModule('engines/dormant-ladder.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/dormant-ladder 已加载（' + VERSION + '）');
})();
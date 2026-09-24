/**
 * WorldAxis engines/quota.js (v2.71.0)
 * 伏笔配给：短/长双池并发上限 × 轮次存龄 × 过期显式失效。
 *
 * 缝合来源：可待《从头越》「短期伏笔最多同时存在三条，长期伏笔最多同时存在三条，
 * 超出则删除存在时间最长/不重要的伏笔」「短期伏笔最多存在三十次输出，长期伏笔最多
 * 存在五十次输出，若过期且当前无法收回，则直接删除」；MoM 蛾摩拉「数量上限：同时
 * [活跃] 的事件，长期最多2条，短期最多3条」「进度达到上限前未被回收或因其他情况
 * 失效，必须标记为 [已失效]」。
 *
 * 预设里那是给模型的一次性要求；能落成引擎判据的是**配额是硬数字**：
 *   · 双池并发上限（short: 4 / long: 2）——满池登记拒收，不静默挤掉旧项；
 *   · 每条带轮次存龄（tick() 推进年龄）——过生存龄自动标 expired（留痕），
 *     **但不删除**（「过期」与「删除」是两件事：失效是状态，删除是显式决定）；
 *   · 回收是显式动作（resolve/drop），状态变更都进终态记录。
 *
 * 与 memory.foreshadows 的分工：那是「内容账」（伏笔正文 + 状态枚举 + 终态回收），
 * 由记忆引擎在摘要时自动生成；本模块是「配额账」——给**叙事者手动播的种子**提供
 * 并发配额与存龄纪律，不读写 memory.foreshadows（两账独立，互不覆盖）。
 * 与 longline.js 的分工：longline 给 memory 的伏笔设「回收承诺时刻」（时间戳向）；
 * 本模块量的是自己的「轮次年龄」（回合向）。
 *
 * 边界（全是否定式）：
 *   1 总开关默认关闭。关闭时写路径报 reason:'disabled'，不记账。
 *   2 池名双值白名单（short/long）。表外任何值整次拒收（bad-pool）。
 *   3 文本缺或空整次拒收（missing-text）；同池重复文本拒收（dup-text）。
 *   4 池满拒收（pool-full）——绝不静默挤出最旧项（「过期」有显式状态，挤出没有）。
 *   5 存活上限用满且未回收 ⇒ 自动标 expired（只标不删）；回收/放弃走显式入口。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_quota_settings_v1';
  const DEF = { enabled: false, shortCap: 4, longCap: 2, shortAge: 30, longAge: 50 };
  const __REG = { key: LS_KEY, def: DEF, module: 'quota',
    bounds: { shortCap: [1, 8], longCap: [1, 4], shortAge: [5, 60], longAge: [10, 120] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const POOLS = ['short', 'long'];
  const POOL_LABEL = { short: '短期', long: '长期' };
  const ACTIVE = ['active', 'expired'];   // expired 仍占位（显式回收/放弃才释放）
  const stat = { adds: 0, ticks: 0, resolved: 0, expired: 0, drops: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 80); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const q = state().quota; return (q && Array.isArray(q.rows)) ? q.rows : []; }
  function capOf(pool) { const cfg = settings(); return pool === 'short' ? cfg.shortCap : cfg.longCap; }
  function ageOf(pool) { const cfg = settings(); return pool === 'short' ? cfg.shortAge : cfg.longAge; }
  function live(pool) { return rows().filter(function (r) { return r && r.pool === pool && ACTIVE.indexOf(r.status) >= 0; }); }
  /** 登记一颗种子（status 从 active 起算，age=0）。 */
  function add(pool, text) {
    const p = String(pool == null ? '' : pool).trim().toLowerCase();
    const t = clean(text, 80);
    if (POOLS.indexOf(p) < 0) { noteFault('bad-pool'); return { ok: false, reason: 'bad-pool', got: pool }; }
    if (!t) { noteFault('missing-text'); return { ok: false, reason: 'missing-text' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.quota = draft.quota && typeof draft.quota === 'object' && !Array.isArray(draft.quota) ? draft.quota : { rows: [] };
      draft.quota.rows = Array.isArray(draft.quota.rows) ? draft.quota.rows : [];
      if (draft.quota.rows.filter(function (r) { return r && (r.status === 'active' || r.status === 'expired') && r.pool === p && r.text === t; })[0]) {
        out = { ok: false, reason: 'dup-text', pool: p, text: t }; return;
      }
      const liveCount = draft.quota.rows.filter(function (r) { return r && r.pool === p && (r.status === 'active' || r.status === 'expired'); }).length;
      const cap = p === 'short' ? settings().shortCap : settings().longCap;
      if (liveCount >= cap) { out = { ok: false, reason: 'pool-full', pool: p, cap: cap }; return; }
      const row = { id: WA.rand && WA.rand.id ? WA.rand.id('seed', 3, 'id') : ('seed_' + clockNow('quota')), pool: p, text: t, status: 'active', age: 0, at: clockNow('quota') };
      draft.quota.rows.push(row);
      if (WA.evict) WA.evict.array(draft.quota.rows, 'quota.rows');
      out = { ok: true, id: row.id, pool: p, text: t, live: liveCount + 1, cap: cap };
    }, 'quota:add');
    if (out && out.ok) { if (out.reason !== 'disabled') stat.adds++; stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'added'; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 轮次推进：所有 active 种子 age+1；到达生存龄上限的自动标 expired（只标不删）。 */
  function tick() {
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.quota = draft.quota && typeof draft.quota === 'object' && !Array.isArray(draft.quota) ? draft.quota : { rows: [] };
      draft.quota.rows = Array.isArray(draft.quota.rows) ? draft.quota.rows : [];
      let aged = 0, expired = 0;
      draft.quota.rows.forEach(function (r) {
        if (!r || r.status !== 'active') return;
        // v2.78.0: 修前存量 age 若是 NaN，`typeof NaN === 'number'` 让它**永不过期**（age >= limit 恒假）——
        //   一条被污染的存档会把该池永久占满，而且任何读数都看不出异常。
        r.age = ((typeof r.age === 'number' && isFinite(r.age)) ? r.age : 0) + 1;
        aged++;
        const limit = r.pool === 'short' ? settings().shortAge : settings().longAge;
        if (r.age >= limit) { r.status = 'expired'; r.expiredAt = clockNow('quota'); expired++; }
      });
      if (WA.evict) WA.evict.array(draft.quota.rows, 'quota.rows');
      out = { ok: true, aged: aged, expired: expired };
    }, 'quota:tick');
    if (out && out.ok) { if (out.reason !== 'disabled') { stat.ticks++; stat.expired += (out.expired || 0); } stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'ticked'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 回收一颗种子（叙事上已兑现）——终态 resolved。 */
  function resolve(id) {
    return finish(id, 'resolved');
  }
  /** 放弃一颗种子（叙事上永久失效）——终态 dropped。 */
  function drop(id) {
    return finish(id, 'dropped');
  }
  function finish(id, status) {
    const key = clean(id, 40);
    if (!key) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.quota = draft.quota && typeof draft.quota === 'object' && !Array.isArray(draft.quota) ? draft.quota : { rows: [] };
      draft.quota.rows = Array.isArray(draft.quota.rows) ? draft.quota.rows : [];
      const hit = draft.quota.rows.filter(function (r) { return r && r.id === key; })[0];
      if (!hit) { out = { ok: false, reason: 'missing', id: key }; return; }
      if (hit.status === 'resolved' || hit.status === 'dropped') { out = { ok: false, reason: 'already-terminal', id: key, status: hit.status }; return; }
      hit.status = status;
      hit.closedAt = clockNow('quota');
      out = { ok: true, id: key, pool: hit.pool, status: status };
    }, 'quota:' + status);
    if (out && out.ok) {
      if (out.reason !== 'disabled') { if (status === 'resolved') stat.resolved++; else stat.drops++; }
      stat.lastReason = out.reason === 'disabled' ? 'disabled' : status;
    } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 读：按池列出存活（active/expired）种子；bad-pool 拒收。 */
  function list(pool) {
    if (pool !== undefined && pool !== null && String(pool).trim() !== '') {
      const p = String(pool).trim().toLowerCase();
      if (POOLS.indexOf(p) < 0) { noteFault('bad-pool'); return { ok: false, reason: 'bad-pool', got: pool }; }
      const l = live(p);
      return { ok: true, pool: p, count: l.length, cap: capOf(p), rows: l.map(function (r) { return { id: r.id, text: r.text, status: r.status, age: r.age }; }) };
    }
    return { ok: true, short: live('short').length, long: live('long').length,
      shortCap: settings().shortCap, longCap: settings().longCap };
  }
  /** 注入块：双池配给 + 存龄 + 配额铁律（零 token：关闭或无存活种子时返回空串）。 */
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const s = live('short'), l = live('long');
    if (!s.length && !l.length) return '';
    function fmt(pool, arr, cap, ageLimit) {
      if (!arr.length) return null;
      const items = arr.map(function (r) {
        const mark = r.status === 'expired' ? '（已过期！须显式回收或放弃）' : '';
        return '· ' + r.text + '［存龄 ' + r.age + '/' + ageLimit + '］' + mark;
      });
      return '【' + POOL_LABEL[pool] + '种子 ' + arr.length + '/' + cap + '】' + '\n' + items.join('\n');
    }
    const parts = ['[伏笔配给] 种子配额与存龄纪律：'];
    const a = fmt('short', s, cfg.shortCap, cfg.shortAge); if (a) parts.push(a);
    const b = fmt('long', l, cfg.longCap, cfg.longAge); if (b) parts.push(b);
    parts.push('配额铁律：池满不得强行播种（须先显式回收或放弃）；过期种子必须显式处理，不静默消失；短期用于小插曲、长期用于暗线。');
    return parts.join('\n') + '\n';
  }
  WA.quota = {
    POOLS: POOLS,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    add: add, tick: tick, resolve: resolve, drop: drop, list: list, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();
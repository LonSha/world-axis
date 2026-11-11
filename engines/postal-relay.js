/**
 * WorldAxis engines/postal-relay.js (v2.400.0) — EXV22-2 驿传网络、驿马接力与军情时延
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   G3 实测：「驿站 / 驿马」在产品源码里只有 **1 命中**，还是注释。
 *   既有 courier-dispatch 只有「发 → 收」二元：一封信要么到了要么没到，
 *   **没有中继节点、没有换马耗时、没有驿路断毁**。
 *   后果：军情延误只能当剧情旁白写，写不出「为什么迟了三天」。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   驿路是一串**驿站节点**。`postalRelay.buildRoute` 建路并按站序累计每段
 *   里程与换马耗时，产出一条基线的总时延；`postalRelay.dispatchByRelay` 按
 *   当前存活/断毁的站点，给出**这一趟**的真实时延与沿途记事。
 *   链：拓扑（哪几站） → 换马耗时（每站多久） → 断毁（哪段走不通） → 军情时延。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① **不碰 store**：路由与派发都是纯计算，里程/站点由调用方给。真实信件
 *      入队仍在 courier-dispatch，本模块只回答「这趟要多久、为什么慢」。
 *   ② **断站不吞**：某站断毁 ⇒ 整趟如实报 `ok:false` + `hint` 点名断在哪一站，
 *      不「跳过它继续走」——那会把断驿悄悄变成按时抵达。
 *   ③ **拒收码只用 `disabled`**，其余走 hint（见文件头③）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_postal_relay_settings_v1';
  const DEF = {
    enabled: false,
    /** 每站换马与交接的固定耗时（小时）。0 会让「接力」变成「不接力」。 */
    relayHoursPerStation: 0.5,
    /** 驿马常规速度（公里/小时）。 */
    horseKmPerHour: 15,
    /** 单次派发允许的最长时延（小时），超出如实报过远。 */
    maxHours: 720
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'postalRelay' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    try {
      const raw = WA.settingsBus.read(__REG);
      return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
    } catch (e) { return Object.assign({}, DEF); }
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { routes: 0, dispatched: 0, refused: 0, lastReason: '' };
  /** relId -> { nodes:[{id,name,kmToNext,broken}] }。只存拓扑，不含任何世界状态。 */
  const ROUTES = {};

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function str(v) { return String(v == null ? '' : v).trim(); }

  /**
   * 建一条驿路。
   * @param {object} spec { id, nodes:[{id,name,kmToNext,broken}] }
   */
  function buildRoute(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = str(s.id);
    if (!id) { stat.refused++; stat.lastReason = 'missing-id'; return { ok: false, hint: 'missing-id：驿路必须有 id' }; }
    const src = Array.isArray(s.nodes) ? s.nodes : null;
    if (!src || src.length < 2) {
      stat.refused++; stat.lastReason = 'too-few-nodes';
      return { ok: false, hint: 'too-few-nodes：驿路至少要有两站（起点 + 终点），一站不叫驿传' };
    }
    const nodes = [];
    for (let i = 0; i < src.length; i++) {
      const n = src[i] && typeof src[i] === 'object' ? src[i] : {};
      const nid = str(n.id) || ('n' + i);
      const km = num(n.kmToNext);
      // 末站的 kmToNext 无意义（没有下一段），其余站必须给里程。
      if (i < src.length - 1 && (km === null || km <= 0)) {
        stat.refused++; stat.lastReason = 'missing-km';
        return { ok: false, hint: 'missing-km：第 ' + (i + 1) + ' 站到下一站的里程缺失或 <= 0' };
      }
      nodes.push({ id: nid, name: str(n.name) || nid, kmToNext: km === null ? 0 : km, broken: !!n.broken });
    }
    const totalKm = nodes.reduce(function (a, n) { return a + n.kmToNext; }, 0);
    const relays = nodes.length - 1;              // 换马次数 = 段数
    const rideHours = totalKm / cfg.horseKmPerHour;
    const relayHours = relays * cfg.relayHoursPerStation;
    const route = {
      id: id, nodes: nodes, totalKm: totalKm, relayCount: relays,
      rideHours: Math.round(rideHours * 100) / 100,
      relayHours: Math.round(relayHours * 100) / 100,
      hours: Math.round((rideHours + relayHours) * 100) / 100
    };
    ROUTES[id] = route;
    stat.routes++;
    return { ok: true, outcome: 'route-built', route: route };
  }

  /**
   * 按当前驿路状态派发一趟，给出真实时延与沿途记事。
   * @param {object} spec { routeId, priority }
   */
  function dispatchByRelay(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const routeId = str(s.routeId || s.id);
    const route = ROUTES[routeId];
    if (!route) {
      stat.refused++; stat.lastReason = 'unknown-route';
      return { ok: false, hint: 'unknown-route：先 buildRoute(' + (routeId || '?') + ')' };
    }
    // 断站判定：任何一段断了，整趟走不通 —— 如实点名，不跳过继续走。
    const brokenAt = [];
    for (let i = 0; i < route.nodes.length - 1; i++) {
      if (route.nodes[i].broken || route.nodes[i + 1].broken) brokenAt.push(route.nodes[i].id);
    }
    if (brokenAt.length) {
      stat.refused++; stat.lastReason = 'relay-broken';
      return {
        ok: false, hint: 'relay-broken：驿路 ' + routeId + ' 在 ' + brokenAt.join('、') + ' 断毁',
        brokenAt: brokenAt
      };
    }
    const priority = str(s.priority) || 'normal';
    // 军情加急：驿站优先让马，但换马耗时不会消失（这是驿传和飞鸽的分界）。
    const speedup = priority === 'urgent' ? 0.7 : 1;
    const rideHours = route.rideHours * speedup;
    const hours = Math.round((rideHours + route.relayHours) * 100) / 100;
    if (hours > cfg.maxHours) {
      stat.refused++; stat.lastReason = 'too-far';
      return { ok: false, hint: 'too-far：总时延 ' + hours + 'h 超出上限 ' + cfg.maxHours + 'h，如实拒算' };
    }
    stat.dispatched++;
    return {
      ok: true,
      outcome: 'relay-dispatched',
      routeId: routeId,
      priority: priority,
      totalKm: route.totalKm,
      relayCount: route.relayCount,
      rideHours: Math.round(rideHours * 100) / 100,
      relayHours: route.relayHours,
      hours: hours,
      // 沿途记事的原料：调用方可以据此写「在哪一站换的马」，不是凭空编。
      stations: route.nodes.map(function (n) { return n.name; })
    };
  }

  function view() {
    const cfg = settings();
    return {
      enabled: !!cfg.enabled,
      relayHoursPerStation: cfg.relayHoursPerStation,
      horseKmPerHour: cfg.horseKmPerHour,
      maxHours: cfg.maxHours,
      routeIds: Object.keys(ROUTES),
      routes: Object.keys(ROUTES).map(function (k) {
        const r = ROUTES[k];
        return { id: r.id, nodes: r.nodes.length, totalKm: r.totalKm, hours: r.hours };
      }),
      stat: Object.assign({}, stat)
    };
  }

  function setSettings(patch) {
    if (!WA.settingsBus) return { ok: false, hint: 'settingsBus 不可用' };
    const merged = Object.assign({}, settings(), patch && typeof patch === 'object' ? patch : {});
    //   ⚠ 写盘走 `saveOrThrow`，不是想当然的 `write`（v2.400.0 修）。
    //   本处初版写的是 `try { WA.settingsBus.write(__REG, merged); } catch (e) {...}`，
    //   而 `settingsBus` **根本没有 write 这个成员**（真源 core/settings-bus.js 的导出面：
    //   read / normalize / save / saveOrThrow / remove / 各类 stat）。后果不是「写失败」，而是
    //   **开关永远打不开**：每次 setSettings 都招一个 TypeError，被 catch 吞成
    //   `{ok:false, hint:'write-threw：WA.settingsBus.write is not a function'}`，而调用方只看
    //   ok 就以为「开关没开」。实测（真产品 LOAD 装载面）：八个引擎
    //   **全部** setSettings 返回 ok:false、enabled 恒为 false —— 就是说「出厂即关」
    //   在实际使用上变成了「**永远关着**」。
    //   为什么专锁没抓到：tests/exv22-v2400.js 的宿主 `makeHost()` 自带一个
    //   `write` 桩（当时是照着引擎的调用写的），于是 B4/B5 在假写面上绿了。
    //   这正是本仓反复点名的「测试里自塞了桩就测得过」。
    //   现在走与其余 12 个引擎逐字同形的真写口（如 engines/act.js:72）：
    //   `saveOrThrow(reg, normalize(reg, 合并后的字典))` —— 写不进去就抛，由本处转成可读的 hint。
    try { WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, merged)); } catch (e) {
      return { ok: false, hint: 'write-threw：' + (e && e.message ? e.message : '未知') };
    }
    //   写完回读：「写进去」不等于「存住了」（本仓 save 头注同语）。
    const back = settings();
    if (back.enabled !== merged.enabled) {
      return { ok: false, hint: 'write-verify：写后回读不一致（enabled ' + String(merged.enabled) + ' → ' + String(back.enabled) + '）' };
    }
    return { ok: true, settings: back };
  }

  function reset() {
    Object.keys(ROUTES).forEach(function (k) { delete ROUTES[k]; });
    stat.routes = 0; stat.dispatched = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }

  WA.postalRelay = {
    buildRoute: buildRoute,
    dispatchByRelay: dispatchByRelay,
    view: view,
    setSettings: setSettings,
    getSettings: settings,
    reset: reset
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/postal-relay.js', { kind: 'engine', ver: '2.400.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/postal-relay 已加载（2.400.0）');
  }
})();
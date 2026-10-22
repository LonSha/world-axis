/**
 * WorldAxis engines/survey.js (v2.231.0) — EXP-4：探索与地理发现
 *
 * ── 它治什么（缺口，现场实测）──────────────────────────────────
 *   世界里的地点与道路**一登记就人人皆知**：
 *     · `world.places` / `world.roads` 是**客观真源**（「世界有什么」），
 *       但全仓**没有任何一处记「谁知道了什么」** —— `grep` 下来
 *       `atlas` 答「画出来长什么样」、`worldGraph` 答「一跳能到哪」、
 *       `travelDesk` 答「这一趟怎么走」、`horizon` 答「路上出了什么事」，
 *       四者都默认「地图上的东西玩家已经全看见了」。
 *     · 于是 `world.buildBlock()` 把**全部**地点与最多 6 条道路直接注入正文 ——
 *       一个 NPC 刚探出来的捷径，下一轮就出现在玩家眼前；反过来，玩家也可以
 *       对着一条「从没人走过」的路侃侃而谈。**知道**与**存在**被当成了一件事。
 *     · `region` 有「远方传播拓扑」，但那是**地域级**的传播衰减，不是
 *       「某个人对某个地点的认知状态」。
 *
 * ── 本模块只做一件事：把「世界有什么」与「谁知道」分开 ──────────
 *   客观真源**仍然只有一份**（`world.places` / `world.roads`），本模块
 *   **不建平行坐标系统、不复制地点与道路、不自己算可达**（那是 `world.transit`
 *   的事）。本模块记的是**认知行**：`{who, place, know}` ——
 *   同一个地点，甲可以是 `confirmed`（亲自走过）、乙是 `heard`（听人说起）、
 *   丙是 `unknown`（没这一行，或这一行就是 unknown）。
 *
 * ── 三态封闭集（自造一个 ⇒ 拒收）─────────────────────────────
 *   `unknown` / `heard` / `confirmed`。三态**必须分开**，因为三件事的失效模式不同：
 *     · `unknown` 被当成 `confirmed` ⇒ 注入把没去过的地方写得像家门口（**泄底**）；
 *     · `heard` 被当成 `confirmed` ⇒ 听说来的传闻被当成事实写进正文（**传闻升格**）；
 *     · `confirmed` 被当成 `unknown` ⇒ 亲历者被写成路痴（**记忆丢失**）。
 *   本模块**不给**任何「大概知道」「模糊记得」的中间态 —— 那正是把上面三件事
 *   混成一件事的入口。
 *
 * ── 四条硬口径（全是否定式，逐条有判据咬）──────────────────────
 *   ① **发现归属实际探索者**：`survey()` 只把认知记在**发起勘察的那个人**身上，
 *      绝不顺带给别人记一笔（「NPC 探路发现捷径，玩家尚不知道」是验收原文）。
 *   ② **转述不升格**：`report()` 把「甲知道」传给「乙」，乙拿到的**最高是 `heard`**
 *      —— 亲历与听说不是一件事。乙要 `confirmed` 必须自己 `confirm()`（或自己去走一趟）。
 *   ③ **未登记即不可达**：勘察目标必须已登记在 `world.places`；两地之间没有登记道路时
 *      勘察以 `no-road` 拒收 —— 沿用 `world.buildBlock()` 的既有口径
 *      「未登记的道路走不通」，本模块**不自己造一条路**。
 *   ④ **遮罩面只报数不报名**：`fog()` 对未发现的地点**只给条数**，绝不带名字
 *      （带了名字就等于没遮 —— 验收原文「未发现区域不从地图标签或注入提前泄露」）。
 *
 * ── 与邻近模块的分工（不是同一件事，故不合并）──────────────────
 *   · `world.transit`  —— 「这一次走不走得通」（**判定**，读客观图）；本模块不重算。
 *   · `atlas`          —— 「画出来长什么样」（**视图**，读客观图）；本模块不画。
 *   · `region`         —— 「远方消息传得多远」（**传播衰减**，地域级）；本模块是逐人级。
 *   · `intel`/`rumor`  —— 「消息与谣言怎么传」（**事件与舆论**）；本模块记的是
 *                         「这个地点你知不知道」这一格状态，不是一条消息的旅程。
 *   · `noesis`         —— 防全知闸门按**事实**过滤；本模块按**地点**过滤，两者正交。
 *
 * ── 边界（全是否定式）─────────────────────────────────────────
 *   1 **不建第二份地图**：本模块全文不写 `world.places` / `world.roads`，
 *      一律调用期读（`placesOf()` / `roadBetween()` 都是读口）。
 *   2 **不自动建路**：勘察发现的是**认知**，不是路。世界要真加一条路，
 *      仍走 `world.addRoad`（本模块零调用）—— 否则「发现」会变成一次隐式地形改写。
 *   3 **不推进世界时钟**：勘察进度按 `advance({days})` 由调用方推，本模块不碰 `clock`。
 *   4 **缺料暂停必须提交**：与 `production.advance` 同规 —— 暂停本身就是一次状态写入，
 *      事务 `return false` 会把整张草稿回滚（返回体说 paused、存档里还是 scouting）。
 *   5 **存档是唯一真源**（`store.survey`）：`reload()` 从存档重建（切聊天必须重建）。
 *   6 **全关即零存在**：模块关闭时各口一律拒收 `disabled`，不产注入块。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_survey_settings_v1';
  const DEF = { enabled: false, maxSpots: 48, maxViews: 192, maxDays: 30, viewer: '' };
  const __REG = { key: LS_KEY, def: DEF, module: 'survey',
    bounds: { maxSpots: [4, 200], maxViews: [16, 600], maxDays: [1, 120] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // ── 认知三态（封闭集：自造一个 ⇒ 拒收）──
  const KNOW = ['unknown', 'heard', 'confirmed'];
  // 认知的**强弱序**：只允许升级，不允许被静默降级（降级要显式 `forget`）。
  const RANK = { unknown: 0, heard: 1, confirmed: 2 };
  // 勘察行动的状态（封闭集）
  const SCOUT_STATUS = ['scouting', 'paused', 'arrived', 'halted'];
  const OPEN_SCOUT = ['scouting', 'paused'];
  const stat = { declared: 0, surveyed: 0, advanced: 0, arrived: 0, paused: 0, resumed: 0,
    reported: 0, confirmed: 0, halted: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function refuse(reason, extra) { noteFault(reason); return Object.assign({ ok: false, reason: reason }, extra || {}); }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : (typeof v === 'string' ? v.slice(0, max || 60) : ''); }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function bagOf(root) {
    const p = (root || state()).survey;
    return (p && typeof p === 'object' && !Array.isArray(p)) ? p : null;
  }
  function spotsOf(root) { const b = bagOf(root); return (b && Array.isArray(b.spots)) ? b.spots : []; }
  function viewsOf(root) { const b = bagOf(root); return (b && Array.isArray(b.views)) ? b.views : []; }
  function scoutsOf(root) { const b = bagOf(root); return (b && Array.isArray(b.scouts)) ? b.scouts : []; }
  function ensure(draft) {
    if (!draft.survey || typeof draft.survey !== 'object' || Array.isArray(draft.survey)) {
      draft.survey = { spots: [], views: [], scouts: [] };
    }
    if (!Array.isArray(draft.survey.spots)) draft.survey.spots = [];
    if (!Array.isArray(draft.survey.views)) draft.survey.views = [];
    if (!Array.isArray(draft.survey.scouts)) draft.survey.scouts = [];
    return draft.survey;
  }
  function spotOf(name, root) {
    const k = clean(name, 40);
    return spotsOf(root).filter(function (s) { return s && clean(s.name, 40) === k; })[0] || null;
  }
  function viewRow(who, place, root) {
    const w = clean(who, 60), p = clean(place, 40);
    return viewsOf(root).filter(function (v) { return v && clean(v.who, 60) === w && clean(v.place, 40) === p; })[0] || null;
  }
  function scoutOf(id, root) {
    const k = clean(id, 60);
    return scoutsOf(root).filter(function (s) { return s && clean(s.id, 60) === k; })[0] || null;
  }
  function personExists(who, root) {
    const w = clean(who, 60);
    if (!w) return false;
    const ppl = (root || state()).people || {};
    if (ppl['p_' + w]) return true;
    const keys = Object.keys(ppl);
    for (let i = 0; i < keys.length; i++) {
      if (ppl[keys[i]] && clean(ppl[keys[i]].name, 60) === w) return true;
    }
    return false;
  }
  function haveOf(pur, material) { return (pur && typeof pur === 'object') ? (num(pur[material]) || 0) : 0; }
  function drawRes(pur, material, qty) {
    if (!pur || typeof pur !== 'object') return false;
    if (haveOf(pur, material) < qty) return false;
    pur[material] = +((haveOf(pur, material) - qty).toFixed(3));
    return true;
  }
  // ── 客观地图的**只读**读口（本模块不写 world.*，见边界 1）──
  function placesOf(root) {
    const w = (root || state()).world;
    return (w && Array.isArray(w.places)) ? w.places : [];
  }
  function roadsOf(root) {
    const w = (root || state()).world;
    return (w && Array.isArray(w.roads)) ? w.roads : [];
  }
  function placeExists(name, root) {
    const k = clean(name, 40);
    if (!k) return false;
    return placesOf(root).some(function (p) { return p && clean(p.name, 40) === k; });
  }
  /** 两地之间的登记道路（**无向**：a↔b 与 b↔a 是同一条）。 */
  function roadBetween(a, b, root) {
    const x = clean(a, 40), y = clean(b, 40);
    if (!x || !y) return null;
    return roadsOf(root).filter(function (r) {
      return r && ((clean(r.a, 40) === x && clean(r.b, 40) === y) || (clean(r.a, 40) === y && clean(r.b, 40) === x));
    })[0] || null;
  }
  /** 认知写入：只允许**升级**（unknown → heard → confirmed）。返回是否真的变了。 */
  function raiseView(row, know) {
    const k = clean(know, 12);
    if (KNOW.indexOf(k) < 0) return false;
    const cur = clean(row.know, 12) || 'unknown';
    if ((RANK[k] || 0) <= (RANK[cur] || 0)) return false;
    row.know = k;
    row.updatedAt = clockNow('survey');
    return true;
  }
  /**
   * 世界声明一个**可勘察点**（采集点 / 瞭望点 / 遗址 ……）。
   *   它**必须**对应一个已登记的 `world.places` 地点（否则 `unknown-place`）——
   *   本模块不发明地点，只声明「这个地点上有可勘察的东西」。
   */
  function declareSpot(name, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const nm = clean(name, 40);
    if (!nm) return refuse('missing-fields', { field: 'name' });
    const place = clean(o.place, 40) || nm;
    if (!placeExists(place)) return refuse('unknown-place', { place: place });
    let days = num(o.days) === null ? 1 : Math.floor(num(o.days));
    if (!(days >= 1)) return refuse('bad-days', { days: o.days });
    let clamped = false;
    if (days > cfg.maxDays) { days = cfg.maxDays; clamped = true; }
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const seen = b.spots.filter(function (s) { return s && clean(s.name, 40) === nm; })[0] || null;
      if (!seen && b.spots.length >= cfg.maxSpots) {
        out = { ok: false, reason: 'spots-full', cap: cfg.maxSpots }; return false;
      }
      const now = clockNow('survey');
      if (seen) {
        seen.place = place; seen.label = clean(o.label, 40) || nm; seen.kind = clean(o.kind, 20) || 'site';
        seen.days = days; seen.updatedAt = now;
        out = { ok: true, name: nm, place: place, days: days, replaced: true, clamped: clamped };
      } else {
        b.spots.push({ name: nm, label: clean(o.label, 40) || nm, kind: clean(o.kind, 20) || 'site',
          place: place, days: days, at: now, updatedAt: now });
        out = { ok: true, name: nm, place: place, days: days, replaced: false, clamped: clamped };
      }
      return true;
    }, 'survey:spot');
    if (out && out.ok) { stat.declared++; stat.lastReason = 'spot-declared'; if (clamped) noteFault('clamped'); }
    return out || refuse('store-unavailable');
  }
  /**
   * 发起一次勘察（**跨日运行**）：勘察者 `who` 去勘察点 `spot` 走一趟。
   *   ① 勘察者必须存在（`unknown-worker`）；
   *   ② 勘察点必须已声明（`no-such-spot`）；
   *   ③ 勘察者当前所在地与该勘察点之间**必须有登记道路**（`no-road`）——
   *      沿用「未登记的道路走不通」的既有口径，本模块不造路（边界 2）；
   *   ④ 认知**只记在勘察者本人身上**（口径 ①），别人一格不动。
   */
  function survey(spec, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec || {};
    const o = opts || {};
    const who = clean(s.who, 60);
    const spotName = clean(s.spot, 40);
    if (!who || !spotName) return refuse('missing-fields', { field: !who ? 'who' : 'spot' });
    if (!personExists(who)) return refuse('unknown-worker', { who: who });
    const spot = spotOf(spotName);
    if (!spot) return refuse('no-such-spot', { spot: spotName,
      declared: spotsOf().map(function (x) { return x.name; }) });
    const target = clean(spot.place, 40);
    if (!placeExists(target)) return refuse('unknown-place', { place: target });
    // 出发地：显式给了就用它（必须已登记），否则取勘察者**当前所在地**（世界侧读口）。
    let from = clean(s.from, 40);
    if (from) {
      if (!placeExists(from)) return refuse('unknown-place', { place: from });
    } else {
      const w = (WA.world && typeof WA.world.where === 'function') ? WA.world.where(who) : null;
      from = (w && w.ok && w.place) ? clean(w.place, 40) : '';
    }
    if (!from) return refuse('unknown-origin', { who: who, hint: '给 from，或先让这个人走到一个已登记的地点' });
    if (from === target) {
      // 已经在现场：不需要勘察，但**认知要如实记上**（亲历）。
      let same = null;
      WA.store.transact(function (draft) {
        const b = ensure(draft);
        const row = b.views.filter(function (v) { return v && clean(v.who, 60) === who && clean(v.place, 40) === target; })[0] || null;
        const now = clockNow('survey');
        if (row) { raiseView(row, 'confirmed'); same = { ok: true, id: row.id, who: who, place: target, know: row.know, atSpot: true }; }
        else {
          const id = 'vw_' + now + '_' + b.views.length;
          b.views.push({ id: id, who: who, place: target, know: 'confirmed', via: 'in-place',
            at: now, updatedAt: now });
          WA.evict.array(b.views, 'survey.views', cfg.maxViews);
          same = { ok: true, id: id, who: who, place: target, know: 'confirmed', atSpot: true };
        }
        return true;
      }, 'survey:in-place');
      if (same && same.ok) { stat.confirmed++; stat.lastReason = 'in-place'; }
      return same || refuse('store-unavailable');
    }
    const road = roadBetween(from, target);
    if (!road) {
      return refuse('no-road', { from: from, to: target,
        hint: '两地之间没有登记道路 ⇒ 走不通（未登记的道路走不通）。世界要加路走 world.addRoad。' });
    }
    let days = num(s.days) === null ? (num(spot.days) || 1) : Math.floor(num(s.days));
    if (!(days >= 1)) return refuse('bad-days', { days: s.days });
    let clamped = false;
    if (days > cfg.maxDays) { days = cfg.maxDays; clamped = true; }
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const now = clockNow('survey');
      const id = 'sc_' + now + '_' + b.scouts.length;
      const row = { id: id, who: who, from: from, to: target, spot: clean(spot.name, 40),
        days: days, done: 0, status: 'scouting', supply: num(s.supply) === null ? days : Math.max(0, Math.floor(num(s.supply))),
        spent: {}, at: now, updatedAt: now, arrivedAt: 0, pausedAt: 0, pausedReason: '',
        label: clean(o.label, 60) };
      b.scouts.push(row);
      WA.evict.array(b.scouts, 'survey.scouts', cfg.maxSpots);
      out = { ok: true, id: id, who: who, from: from, to: target, spot: row.spot, days: days,
        done: 0, status: 'scouting', supply: row.supply, road: { id: road.id, minutes: num(road.minutes) || 0 },
        clamped: clamped };
      return true;
    }, 'survey:start');
    if (out && out.ok) { stat.surveyed++; stat.lastReason = 'surveying'; if (clamped) noteFault('clamped'); }
    return out || refuse('store-unavailable');
  }
  /**
   * 推进在途勘察（按天）。
   *   每一天：先看补给够不够（**先判后动**，不够就一格都不扣）⇒ 缺补给 ⇒ `short-supply` 且
   *   工单停在 `paused`（**这一次事务必须提交**，见边界 4）；
   *   走满 `days` 天 ⇒ `arrived`，并把**勘察者本人**对目标地点的认知升到 `confirmed`。
   */
  function advance(opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const id = clean(o.id, 60);
    let steps = num(o.days) === null ? 1 : Math.floor(num(o.days));
    if (!(steps >= 1)) return refuse('bad-days', { days: o.days });
    const all = scoutsOf();
    const targets = id ? all.filter(function (s) { return s && clean(s.id, 60) === id; }) : all;
    if (id && !targets.length) return refuse('unknown-scout', { id: id });
    const open = targets.filter(function (s) { return s && OPEN_SCOUT.indexOf(clean(s.status, 12)) >= 0; });
    if (!open.length) return refuse('scout-closed', { id: id || null, open: 0 });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const now = clockNow('survey');
      const rows = b.scouts.filter(function (s) {
        if (!s) return false;
        if (id && clean(s.id, 60) !== id) return false;
        return OPEN_SCOUT.indexOf(clean(s.status, 12)) >= 0;
      });
      const moved = [], paused = [], arrived = [];
      rows.forEach(function (row) {
        if (clean(row.status, 12) === 'paused') { paused.push({ id: row.id, why: row.pausedReason || 'short-supply' }); return; }
        const who = clean(row.who, 60);
        const pe = draft.people || {};
        let pur = null;
        if (pe['p_' + who]) pur = pe['p_' + who].resources;
        else Object.keys(pe).forEach(function (k) { if (pe[k] && clean(pe[k].name, 60) === who) pur = pe[k].resources; });
        for (let i = 0; i < steps; i++) {
          if (num(row.done) >= num(row.days)) break;
          const need = 1;   // 每天一份补给
          if ((num(row.supply) || 0) < need) {
            row.status = 'paused';
            row.pausedAt = now;
            row.pausedReason = 'short-supply';
            row.updatedAt = now;
            stat.paused++;
            noteFault('short-supply');
            paused.push({ id: row.id, why: 'short-supply', supply: num(row.supply) || 0 });
            return;
          }
          row.supply = +((num(row.supply) || 0) - need).toFixed(3);
          row.done = (num(row.done) || 0) + 1;
          row.spent.supply = +((num(row.spent.supply) || 0) + need).toFixed(3);
          row.updatedAt = now;
          if (num(row.done) >= num(row.days)) {
            row.status = 'arrived';
            row.arrivedAt = now;
            // 口径 ①：认知**只记在勘察者本人身上**（亲历 ⇒ confirmed）。
            const to = clean(row.to, 40);
            const hit = b.views.filter(function (v) { return v && clean(v.who, 60) === who && clean(v.place, 40) === to; })[0] || null;
            if (hit) raiseView(hit, 'confirmed');
            else {
              const vid = 'vw_' + now + '_' + b.views.length;
              b.views.push({ id: vid, who: who, place: to, know: 'confirmed', via: 'survey',
                at: now, updatedAt: now });
              WA.evict.array(b.views, 'survey.views', cfg.maxViews);
            }
            stat.arrived++;
            arrived.push({ id: row.id, who: who, place: to });
          }
        }
        if (clean(row.status, 12) !== 'paused') moved.push({ id: row.id, done: row.done, days: row.days });
      });
      out = { ok: true, moved: moved, paused: paused, arrived: arrived,
        movedCount: moved.length, pausedCount: paused.length, arrivedCount: arrived.length };
      return true;
    }, 'survey:advance');
    if (out && out.ok) { stat.advanced++; stat.lastReason = out.arrivedCount ? 'arrived' : 'advanced'; }
    return out || refuse('store-unavailable');
  }
  /** 补给：把 `material × amount` 从某人手里扣进这张勘察单的补给池（默认材料 `supply`）。 */
  function resupply(id, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const s = scoutOf(id);
    if (!s) return refuse('unknown-scout', { id: id });
    if (OPEN_SCOUT.indexOf(clean(s.status, 12)) < 0) return refuse('scout-closed', { id: s.id, status: s.status });
    const by = clean(o.by, 60) || clean(s.who, 60);
    const amount = num(o.amount) === null ? 1 : num(o.amount);
    if (!(amount > 0)) return refuse('missing-fields', { field: 'amount' });
    if (!personExists(by)) return refuse('unknown-worker', { by: by });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.scouts.filter(function (x) { return x && clean(x.id, 60) === clean(s.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'unknown-scout', id: s.id }; return false; }
      if (OPEN_SCOUT.indexOf(clean(row.status, 12)) < 0) { out = { ok: false, reason: 'scout-closed', id: row.id, status: row.status }; return false; }
      const pe = draft.people || {};
      let pur = null;
      if (pe['p_' + by]) pur = pe['p_' + by].resources;
      else Object.keys(pe).forEach(function (k) { if (pe[k] && clean(pe[k].name, 60) === by) pur = pe[k].resources; });
      if (haveOf(pur, 'supply') < amount) {
        out = { ok: false, reason: 'short-supply', by: by, need: amount, have: haveOf(pur, 'supply') }; return false;
      }
      drawRes(pur, 'supply', amount);
      row.supply = +((num(row.supply) || 0) + amount).toFixed(3);
      row.updatedAt = clockNow('survey');
      out = { ok: true, id: row.id, by: by, amount: amount, supply: row.supply, status: row.status };
      return true;
    }, 'survey:resupply');
    if (out && out.ok) { stat.lastReason = 'resupplied'; }
    return out || refuse('store-unavailable');
  }
  /** 停工（显式）：把在途勘察停在 `paused`，不推进天数。 */
  function pause(id, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const s = scoutOf(id);
    if (!s) return refuse('unknown-scout', { id: id });
    if (clean(s.status, 12) !== 'scouting') return refuse('scout-closed', { id: s.id, status: s.status });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.scouts.filter(function (x) { return x && clean(x.id, 60) === clean(s.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'unknown-scout', id: s.id }; return false; }
      if (clean(row.status, 12) !== 'scouting') { out = { ok: false, reason: 'scout-closed', id: row.id, status: row.status }; return false; }
      row.status = 'paused';
      row.pausedAt = clockNow('survey');
      row.pausedReason = clean(o.why, 40) || 'manual';
      row.updatedAt = row.pausedAt;
      out = { ok: true, id: row.id, status: 'paused', done: row.done, days: row.days, why: row.pausedReason };
      return true;
    }, 'survey:pause');
    if (out && out.ok) { stat.paused++; stat.lastReason = 'paused'; }
    return out || refuse('store-unavailable');
  }
  /** 复工：paused → scouting。已经在走的单叫它是**无操作**，不报错。 */
  function resume(id) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = scoutOf(id);
    if (!s) return refuse('unknown-scout', { id: id });
    const st = clean(s.status, 12);
    if (st === 'scouting') return { ok: true, id: s.id, status: 'scouting', changed: false };
    if (st !== 'paused') return refuse('scout-closed', { id: s.id, status: st });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.scouts.filter(function (x) { return x && clean(x.id, 60) === clean(s.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'unknown-scout', id: s.id }; return false; }
      if (clean(row.status, 12) !== 'paused') { out = { ok: false, reason: 'scout-closed', id: row.id, status: row.status }; return false; }
      row.status = 'scouting';
      row.pausedReason = '';
      row.updatedAt = clockNow('survey');
      out = { ok: true, id: row.id, status: 'scouting', changed: true, done: row.done, days: row.days };
      return true;
    }, 'survey:resume');
    if (out && out.ok) { stat.resumed++; stat.lastReason = 'resumed'; }
    return out || refuse('store-unavailable');
  }
  /** 中止：把在途勘察停在 `halted`（已消耗的补给**不退**，已走的天数如实保留）。 */
  function halt(id, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const s = scoutOf(id);
    if (!s) return refuse('unknown-scout', { id: id });
    if (OPEN_SCOUT.indexOf(clean(s.status, 12)) < 0) return refuse('scout-closed', { id: s.id, status: s.status });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.scouts.filter(function (x) { return x && clean(x.id, 60) === clean(s.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'unknown-scout', id: s.id }; return false; }
      if (OPEN_SCOUT.indexOf(clean(row.status, 12)) < 0) { out = { ok: false, reason: 'scout-closed', id: row.id, status: row.status }; return false; }
      row.status = 'halted';
      row.updatedAt = clockNow('survey');
      row.why = clean(o.why, 40) || 'halted';
      out = { ok: true, id: row.id, status: 'halted', done: row.done, days: row.days,
        spent: Object.assign({}, row.spent || {}), why: row.why,
        note: '已消耗的补给不退、已走的天数照实保留（不假装没发生）' };
      return true;
    }, 'survey:halt');
    if (out && out.ok) { stat.halted++; stat.lastReason = 'halted'; }
    return out || refuse('store-unavailable');
  }
  /**
   * 转述：把「甲知道的某个地点」告诉乙（**不升格**，口径 ②）。
   *   甲必须真知道（`not-known`：甲自己都 `unknown` ⇒ 无从说起）；
   *   乙拿到的**最高是 `heard`** —— 除非乙本来就 `confirmed`（那就保持 confirmed，不降级）。
   */
  function report(spec, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec || {};
    const o = opts || {};
    const from = clean(s.from, 60), to = clean(s.to, 60), place = clean(s.place, 40);
    if (!from || !to || !place) {
      return refuse('missing-fields', { field: !from ? 'from' : (!to ? 'to' : 'place') });
    }
    if (from === to) return refuse('self-report', { who: from });
    if (!personExists(from)) return refuse('unknown-worker', { by: from });
    if (!personExists(to)) return refuse('unknown-worker', { by: to });
    if (!placeExists(place)) return refuse('unknown-place', { place: place });
    const src = viewRow(from, place);
    const srcKnow = src ? (clean(src.know, 12) || 'unknown') : 'unknown';
    if ((RANK[srcKnow] || 0) <= 0) {
      return refuse('not-known', { from: from, place: place,
        hint: '说的人自己都还不知道 ⇒ 无从说起（不是「传了个不确定的消息」，是「没有这回事」）' });
    }
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const now = clockNow('survey');
      const row = b.views.filter(function (v) { return v && clean(v.who, 60) === to && clean(v.place, 40) === place; })[0] || null;
      const via = clean(o.via, 60) || from;
      if (row) {
        const before = clean(row.know, 12) || 'unknown';
        const changed = raiseView(row, 'heard');   // 只升到 heard，绝不到 confirmed
        if (changed) { row.via = via; }
        out = { ok: true, id: row.id, to: to, place: place, know: row.know, before: before,
          changed: changed, from: from, via: via,
          note: '转述最高只到 heard —— 听说与亲历不是一件事（要 confirmed 得自己走一趟）' };
      } else {
        const id = 'vw_' + now + '_' + b.views.length;
        b.views.push({ id: id, who: to, place: place, know: 'heard', via: via, at: now, updatedAt: now });
        WA.evict.array(b.views, 'survey.views', cfg.maxViews);
        out = { ok: true, id: id, to: to, place: place, know: 'heard', before: 'unknown',
          changed: true, from: from, via: via,
          note: '转述最高只到 heard —— 听说与亲历不是一件事（要 confirmed 得自己走一趟）' };
      }
      return true;
    }, 'survey:report');
    if (out && out.ok) { stat.reported++; stat.lastReason = 'reported'; }
    return out || refuse('store-unavailable');
  }
  /**
   * 确认（亲历）：把某人对某地点的认知升到 `confirmed`。
   *   **必须在场证据**：调用方要么显式给 `at: true`（「此刻他确实在那儿」，由消费方按
   *   世界侧读口判），要么这个人对该地点已有 `heard` 且本口由「走了一趟」触发 ——
   *   本模块**不替调用方判在场**（那是 `world.where` 的事），只拒收「什么都没有就确认」。
   */
  function confirm(who, place, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const w = clean(who, 60), p = clean(place, 40);
    if (!w || !p) return refuse('missing-fields', { field: !w ? 'who' : 'place' });
    if (!personExists(w)) return refuse('unknown-worker', { who: w });
    if (!placeExists(p)) return refuse('unknown-place', { place: p });
    const cur = viewRow(w, p);
    const curKnow = cur ? (clean(cur.know, 12) || 'unknown') : 'unknown';
    const at = o.at === true;
    if (!at && (RANK[curKnow] || 0) <= 0) {
      return refuse('not-discovered', { who: w, place: p,
        hint: '既没听说过、也没给在场证据 ⇒ 不能凭空确认（亲历要有亲历的样子）' });
    }
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const now = clockNow('survey');
      const row = b.views.filter(function (v) { return v && clean(v.who, 60) === w && clean(v.place, 40) === p; })[0] || null;
      if (row) {
        const before = clean(row.know, 12) || 'unknown';
        const changed = raiseView(row, 'confirmed');
        row.via = clean(o.via, 60) || row.via || 'in-person';
        out = { ok: true, id: row.id, who: w, place: p, know: row.know, before: before, changed: changed };
      } else {
        const id = 'vw_' + now + '_' + b.views.length;
        b.views.push({ id: id, who: w, place: p, know: 'confirmed', via: clean(o.via, 60) || 'in-person',
          at: now, updatedAt: now });
        WA.evict.array(b.views, 'survey.views', cfg.maxViews);
        out = { ok: true, id: id, who: w, place: p, know: 'confirmed', before: 'unknown', changed: true };
      }
      return true;
    }, 'survey:confirm');
    if (out && out.ok) { stat.confirmed++; stat.lastReason = 'confirmed'; }
    return out || refuse('store-unavailable');
  }
  /** 只读：某人对某地点知道到什么程度（**唯一的认知判据口**，消费方都读它）。 */
  function knowsOf(who, place) {
    const w = clean(who, 60), p = clean(place, 40);
    const row = viewRow(w, p);
    return { ok: true, who: w, place: p, know: row ? (clean(row.know, 12) || 'unknown') : 'unknown',
      via: row ? clean(row.via, 60) : '', known: !!(row && (RANK[clean(row.know, 12)] || 0) > 0) };
  }
  /** 只读：某人**知道**的地点清单（按认知分档），以及他能说出名字的路。 */
  function routesOf(who) {
    const w = clean(who, 60);
    const rows = viewsOf().filter(function (v) { return v && clean(v.who, 60) === w && (RANK[clean(v.know, 12)] || 0) > 0; });
    const known = rows.map(function (v) { return clean(v.place, 40); });
    const roads = [];
    roadsOf().forEach(function (r) {
      if (!r) return;
      const a = clean(r.a, 40), b = clean(r.b, 40);
      // 一条路要被这个人「知道」，两端他都得有认知（不知道一头，就说不出这条路的走向）。
      if (known.indexOf(a) >= 0 && known.indexOf(b) >= 0) {
        roads.push({ id: r.id, a: a, b: b, minutes: num(r.minutes) || 0 });
      }
    });
    return { ok: true, who: w, places: rows.map(function (v) {
      return { place: clean(v.place, 40), know: clean(v.know, 12), via: clean(v.via, 60) };
    }), roads: roads, confirmed: rows.filter(function (v) { return clean(v.know, 12) === 'confirmed'; }).length,
      heard: rows.filter(function (v) { return clean(v.know, 12) === 'heard'; }).length };
  }
  /**
   * 遮罩面（**只报数不报名**，口径 ④）：这个人还不知道几个地点、几条路。
   *   未发现的地点**绝不出现在返回值里**（带了名字就等于没遮 —— 验收原文点名）。
   */
  function fog(who) {
    const w = clean(who, 60);
    const known = viewsOf().filter(function (v) {
      return v && clean(v.who, 60) === w && (RANK[clean(v.know, 12)] || 0) > 0;
    }).map(function (v) { return clean(v.place, 40); });
    const all = placesOf().map(function (p) { return clean(p.name, 40); });
    const hiddenPlaces = all.filter(function (n) { return known.indexOf(n) < 0; });
    const roads = roadsOf();
    let hiddenRoads = 0;
    roads.forEach(function (r) {
      if (!r) return;
      const a = clean(r.a, 40), b = clean(r.b, 40);
      if (known.indexOf(a) < 0 || known.indexOf(b) < 0) hiddenRoads++;
    });
    return { ok: true, who: w, knownCount: known.length, totalPlaces: all.length,
      hiddenPlaces: hiddenPlaces.length, hiddenRoads: hiddenRoads, totalRoads: roads.length,
      // 刻意**只给数**：不列名字、不给 id、不给「大概在哪个方向」。
      note: hiddenPlaces.length ? '还有 ' + hiddenPlaces.length + ' 个地点没被发现（未发现的地名不在此列出）' : null };
  }
  /** 只读：勘察单清单（可按状态 / 勘察者过滤）。 */
  function list(filter) {
    const f = filter || {};
    const st = clean(f.status, 12), who = clean(f.who, 60);
    return scoutsOf().filter(function (x) {
      if (!x) return false;
      if (st && clean(x.status, 12) !== st) return false;
      if (who && clean(x.who, 60) !== who) return false;
      return true;
    }).map(function (x) {
      return { id: x.id, who: x.who, from: x.from, to: x.to, spot: x.spot, days: num(x.days) || 0,
        done: num(x.done) || 0, status: x.status || '', supply: num(x.supply) || 0,
        spent: Object.assign({}, x.spent || {}), pausedReason: x.pausedReason || '' };
    });
  }
  function reload() {
    const b = bagOf();
    return { ok: true, spots: b ? spotsOf().length : 0, views: b ? viewsOf().length : 0,
      scouts: b ? scoutsOf().length : 0 };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, knows: KNOW.slice(), statuses: SCOUT_STATUS.slice(), openStatus: OPEN_SCOUT.slice(),
      maxSpots: cfg.maxSpots, maxViews: cfg.maxViews, maxDays: cfg.maxDays, viewer: cfg.viewer || '',
      spots: spotsOf().map(function (s) {
        return { name: s.name, label: s.label, kind: s.kind, place: s.place, days: num(s.days) || 1 };
      }),
      scouts: list({}),
      counts: { spots: spotsOf().length, views: viewsOf().length, scouts: scoutsOf().length,
        open: scoutsOf().filter(function (x) { return x && OPEN_SCOUT.indexOf(clean(x.status, 12)) >= 0; }).length,
        arrived: scoutsOf().filter(function (x) { return x && clean(x.status, 12) === 'arrived'; }).length },
      stat: statView() };
  }
  /**
   * 注入块：**只有指定了观察者才产**（`viewer` 为空 ⇒ 返回空串）。
   *
   *   这是本模块与「地图标签」之间唯一的一道闸：注入正文是**全知视角**，
   *   一旦把「谁知道什么」摊成一张全表写进去，遮罩就白做了 ——
   *   模型会读到「某地未发现」这个事实本身，反而知道那里有东西。
   *   故本块的口径与 `fog()` 逐条对齐：
   *     · 只列**该观察者已知**的地点（unknown 的地点一个字都不出现）；
   *     · 未发现的**只报条数**（「还有 N 处没探明」），**不列名、不给方向**；
   *     · `heard` 与 `confirmed` **分列**（听说不是亲历，注入里也必须分得开）；
   *     · 在途勘察单照实报（「谁在路上、走到第几天、还差几天」）。
   */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled || !WA.store) return '';
    const viewer = clean(cfg.viewer, 60);
    if (!viewer) return '';   // 无观察者 ⇒ 零 token（绝不产出全知版地图）
    const known = viewsOf().filter(function (v) {
      return v && clean(v.who, 60) === viewer && (RANK[clean(v.know, 12)] || 0) > 0;
    });
    const confirmed = known.filter(function (v) { return clean(v.know, 12) === 'confirmed'; })
      .map(function (v) { return clean(v.place, 40); });
    const heard = known.filter(function (v) { return clean(v.know, 12) === 'heard'; })
      .map(function (v) { return clean(v.place, 40); });
    const mine = scoutsOf().filter(function (s) { return s && clean(s.who, 60) === viewer; });
    const f = fog(viewer);
    if (!confirmed.length && !heard.length && !mine.length) return '';
    const lines = [];
    lines.push('· 你（' + viewer + '）已知的地点：'
      + (confirmed.length ? confirmed.join('、') + '（亲自到过）' : '无')
      + (heard.length ? '；' + heard.join('、') + '（只是听说过，**没去过**）' : ''));
    if (heard.length) {
      lines.push('· 听说不等于去过：上列「只是听说过」的地点，不得写成你去过、见过或熟悉那里。');
    }
    if (f && f.hiddenPlaces > 0) {
      lines.push('· 还有 ' + f.hiddenPlaces + ' 处地点你尚不知晓（**不在此列名**）：不得凭地图全貌推知，'
        + '也不得在对话里说出它们的名字或方位。');
    }
    const onway = mine.filter(function (s) { return OPEN_SCOUT.indexOf(clean(s.status, 12)) >= 0; });
    if (onway.length) {
      lines.push('· 在途勘察：' + onway.map(function (s) {
        return clean(s.to, 40) + '（已走 ' + (num(s.done) || 0) + '/' + (num(s.days) || 0) + ' 天，'
          + clean(s.status, 12) + '）';
      }).join('；') + '。未走完的路程不得写成已抵达。');
    }
    const done = mine.filter(function (s) { return s && clean(s.status, 12) === 'arrived'; });
    if (done.length) {
      lines.push('· 已探明：' + done.map(function (s) { return clean(s.to, 40); }).join('、') + '。');
    }
    const halted = mine.filter(function (s) { return s && clean(s.status, 12) === 'halted'; });
    if (halted.length) {
      lines.push('· 中止的勘察：' + halted.map(function (s) { return clean(s.to, 40); }).join('、')
        + '（已消耗的补给不退、已走的天数照实保留）。');
    }
    return '[探索与地理发现]\n' + lines.join('\n') + '\n';
  }
  function statView() { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  function resetStat() {
    stat.declared = 0; stat.surveyed = 0; stat.advanced = 0; stat.arrived = 0; stat.paused = 0;
    stat.resumed = 0; stat.reported = 0; stat.confirmed = 0; stat.halted = 0; stat.blocked = 0;
    stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }
  function reset() {
    WA.store.transact(function (draft) { const b = ensure(draft); b.spots = []; b.views = []; b.scouts = []; return true; }, 'survey:reset');
    resetStat();
    return { ok: true, cleared: true };
  }
  WA.survey = {
    KNOWS: KNOW.slice(),
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    declareSpot: declareSpot, spotOf: function (name) { const s = spotOf(name); return s ? { ok: true, name: s.name, place: s.place, days: num(s.days) || 1 } : { ok: false, reason: 'no-such-spot', spot: clean(name, 40) }; },
    survey: survey, advance: advance, resupply: resupply, pause: pause, resume: resume, halt: halt,
    report: report, confirm: confirm, knowsOf: knowsOf, routesOf: routesOf, fog: fog,
    list: list, reload: reload, view: view, buildBlock: buildBlock,
    stat: statView, resetStat: resetStat, reset: reset
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/survey.js', { kind: 'engine', ver: '2.231.0' });
  if (WA.log) WA.log('info', 'survey 已加载（2.231.0）');
})();

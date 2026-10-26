/**
 * WorldAxis engines/followup-gate.js (v2.251.0) — 越过静默阈值的升级提醒闸门
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   本仓「提醒/催办」全是**单步**的：`ladder.escalate()` 靠**事件**逐档升，
 *   `care-chain` 的 escalation 靠**失约次数**升。两者回答的都是
 *   「已经出事了，该往上升一档」，都答不出另一件事：
 *   **「什么都没发生，只是很久没动静了」——谁该先开口、多久、一天最多几次。**
 *   缺口后果：角色要么一直不吭声（读者以为关系断了），要么被模型每轮搭一句
 *   （骚扰感）。这两者的边界在现仓里没有任何一处落成判据。
 *
 * ── 机制（四道门控，缺一不响）────────────────────────────────────
 *   `due({ item, idleMinutes, at })` 四道闸全部通过才 `fire`：
 *     ① 静默够长（`idleMinutes >= idleThreshold`）
 *     ② 落在允许的钟点窗内（`hoursFrom <= h < hoursTo`，跨零点也支持）
 *     ③ 每条对象**每天最多一次**（`lastDay !== today`，按世界钟日期）
 *     ④ 每天总量**有上限**（`perDayCap`），不因为对象多就一口气全响
 *   任一道不过 ⇒ 如实拒收并**点名是哪一道**（`still-quiet` / `out-of-window` /
 *   `already-today` / `day-cap`），不许沉默返回 false。
 *   `fire()` 单独落账（与判定分开：判定是纯读，落账才动台账）。
 *
 * 【为什么判定与落账必须分开】due() 可能被一次注入构建调用多次（每条对象一次）。
 *   若判定时就落「今天已提醒」，同一轮里后一条对象会被前一条的副作用误拦；
 *   反过来只在 fire() 落账，则「判了不落」的调用方会让同一条对象反复被判 due。
 *
 * ── 缝合来源与许可 ──────────────────────────────────────────────
 *   来源：Cheiineeey/callhome `gateway-reference/escalation.js`。原文是挂了四道
 *   守卫的**一段提示词产物**（静默 300 分钟 + 12–23 点窗 + last_date !== today + DND
 *   全静默，理由由 LLM 写、失败走模板兜底）。许可 PolyForm NC ⇒ **搬算法不搬代码**，
 *   并且把原文隐含的东西显式化：闸门顺序固定、拒收分名、窗可跨零点、日上限可配。
 *
 * ── 边界（全是否定式）──────────────────────────────────────────
 *   ① 总开关默认关闭。关闭时一律 `disabled`，不落账。
 *   ② **不看正文、不判「该说什么」**：只答「现在该不该响」。理由文案（原文那 25 字
 *      的 LLM 生成 + 模板兜底）属于写作层，不进本模块。
 *   ③ **不自己推进关系**：响了之后 bonds/fondness 变不变由调用方决定。
 *   ④ 每条对象独立记账、互不挤压；`maxItems` 只管上限。
 *   ⑤ 时间一律取世界钟（`WA.clock.now`），不读墙钟——挂机不改变故事里的「多久」。
 *   ⑥ `fire()` **幂等当日**：同一对象同一天第二次 fire 不再加日计数（报 `already-today`），
 *      防止同一轮里判一次、落两次把日额度吃光。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_followupgate_settings_v1';
  const DEF = { enabled: false, idleThreshold: 300, hoursFrom: 12, hoursTo: 23, perDayCap: 2, maxItems: 24, dnd: false };
  const __REG = { key: LS_KEY, def: DEF, module: 'followupGate',
    bounds: { idleThreshold: [10, 4320], hoursFrom: [0, 23], hoursTo: [0, 24], perDayCap: [1, 12], maxItems: [4, 64] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  const stat = { dues: 0, fires: 0, blocked: 0, evicted: 0, lastReason: '' };
  function book() {
    const s = WA.store && WA.store.get ? WA.store.get() : {};
    const m = s && s.followupGate;
    return (m && typeof m === 'object') ? m : {};
  }
  function transact(fn, why) {
    if (!WA.store || !WA.store.transact) { try { fn(null); } catch (e) {} return false; }
    try { WA.store.transact(fn, 'followupGate:' + why); return true; } catch (e) { stat.lastReason = 'tx-failed'; return false; }
  }
  function dayKey(at) {
    const d = new Date(Number.isFinite(at) ? at : clockNow('followupGate.day'));
    return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
  }
  function hourOf(at) {
    return new Date(Number.isFinite(at) ? at : clockNow('followupGate.hour')).getUTCHours();
  }
  function inWindow(h, from, to) {
    if (from === to) return true;
    if (from < to) return h >= from && h < to;
    return h >= from || h < to;
  }
  function due(q) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    if (cfg.dnd) return { ok: false, reason: 'dnd' };
    const item = q && q.item ? String(q.item).slice(0, 60) : '';
    if (!item) return { ok: false, reason: 'missing-item' };
    const idle = Number(q.idleMinutes);
    if (!Number.isFinite(idle) || idle < 0) return { ok: false, reason: 'bad-idle' };
    stat.dues++;
    const at = Number.isFinite(q.at) ? Number(q.at) : clockNow('followupGate.due');
    const hour = hourOf(at);
    const today = dayKey(at);
    const b = book();
    const row = b.items && b.items[item] ? b.items[item] : null;
    const dayBucket = (b.days && b.days[today]) || 0;
    const lastDay = row && row.lastDay ? String(row.lastDay) : '';
    const reason = idle < cfg.idleThreshold ? 'still-quiet'
      : !inWindow(hour, cfg.hoursFrom, cfg.hoursTo) ? 'out-of-window'
        : lastDay === today ? 'already-today'
          : dayBucket >= cfg.perDayCap ? 'day-cap' : '';
    if (reason) { stat.blocked++; return { ok: false, reason: reason }; }
    return { ok: true, item: item, day: today, hour: hour };
  }
  function fire(item, at) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const key = item ? String(item).slice(0, 60) : '';
    if (!key) return { ok: false, reason: 'missing-item' };
    const when = Number.isFinite(at) ? Number(at) : clockNow('followupGate.fire');
    const today = dayKey(when);
    const b = book();
    const row = b.items && b.items[key] ? b.items[key] : null;
    if (row && String(row.lastDay || '') === today) return { ok: false, reason: 'already-today' };
    transact(function (d) {
      if (!d) return true;
      d.followupGate = d.followupGate || {};
      d.followupGate.items = d.followupGate.items || {};
      d.followupGate.days = d.followupGate.days || {};
      d.followupGate.items[key] = { lastDay: today, at: when, count: ((row && row.count) || 0) + 1 };
      d.followupGate.days[today] = ((d.followupGate.days[today] || 0) + 1);
      const keys = Object.keys(d.followupGate.items);
      if (keys.length > cfg.maxItems) {
        keys.sort(function (a, bb) { return (d.followupGate.items[a].at || 0) - (d.followupGate.items[bb].at || 0); });
        while (keys.length > cfg.maxItems) { delete d.followupGate.items[keys.shift()]; stat.evicted++; }
      }
      return true;
    }, 'fire');
    stat.fires++;
    return { ok: true, item: key, day: today };
  }
  function view() {
    const cfg = settings();
    const b = book();
    return {
      enabled: cfg.enabled, dnd: cfg.dnd, idleThreshold: cfg.idleThreshold,
      window: [cfg.hoursFrom, cfg.hoursTo], perDayCap: cfg.perDayCap,
      items: Object.keys(b.items || {}).length
    };
  }
  function statOf() { return Object.assign({}, stat); }
  WA.followupGate = { due: due, fire: fire, view: view, stat: statOf, settings: settings, saveSettings: saveSettings, REG: __REG, DEF: DEF };
})();

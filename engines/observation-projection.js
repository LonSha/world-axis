/**
 * WorldAxis engines/observation-projection.js (v2.251.0) — 同一事实的多观察者投影
 *
 * ── 它治什么（缺口，开工前先看现场）──────────────────────────────
 *   `anti-omniscience.filterInjectKnowledge()` 已经能做到「某人不知道某条事实就不给他」，
 *   但它的粒度是**单条目 × 单持有者**：一条一条问、一条一条滤。
 *   现场缺口在于另一件事：**同一个事实同时有 N 个持有者、每人手里是不同版本的时候，
 *   没人把它们摆在一起。** 调用方只能自己遍历人、自己重复调过滤器、自己防止
 *   把 A 的版本写给 B —— 这一段目前全库零命中（`viewFor` / `projectFor` / `视角投影` 实测
 *   2 命中，均为注释）。
 *
 *   后果是两类穿帮：
 *   ① **交叉污染**：A 听说的版本被当成 B 亲见的版本注入（两个人明明根本没见过面）；
 *   ② **私下内容外泄**：一条本是私对的发言，投影给全场时没有“台下版本”。
 *
 * ── 机制（一次投影成 N 份，每份只留本座那版）──────────────────
 *   `project(shared, holders, opt)`：
 *     · `shared`   —— 对**所有人相同**的公共部分（场景/时间/可见的环境）；
 *     · `holders`  —— `[{ who, version, source?, certainty? }]`，每人自带的版本；
 *     · 返回 `{ ok, seats: [{ who, block, redacted }], stats }`，**每座互不引用**；
 *     · 某人没有 version ⇒ 该座 `block` 只含公共部分且 `redacted:true`（他压根不知道）；
 *     · `opt.includeAbsent` 为真时，对未列入 holders 的人也给一份纯公共块。
 *   `sole(projected, who)` 取单座；`merge(...)` 只用于**读侧报告**，不用于注入（合并了就没有投影意义）。
 *
 * ── 缝合来源与许可 ──────────────────────────────────────────────
 *   来源：SerenQi/rain-go `packages/engine/src/match/match.ts:221-232` 的 `viewMatch`：
 *   剥 token、按座位调 `mod.view(state, viewer)`、观战传 null、每 socket 只收自己那份。
 *   原文是 TypeScript 且绑定具体游戏模块；这里取其形状重写为宿主无关的纯数据函数
 *   （本仓没有模块注册表可调，版本由调用方给）。
 *   另一半个来源是 c3ll256/dsh-toy 的「暗牌不出服务端」——所以座位块在本模块内**不做任何合并**。
 *
 * ── 边界（全是否定式）───────────────────────────────────────────
 *   ① 总开关默认关闭。关闭时 `project()` 仍返回结构但每座是裸合并（`degraded:true`）。
 *   ② **不读 store、不查信念库**：版本由调用方给。本模块排在
 *      `epistemic-view.buildView()` 之**后**、注入之**前**，不自己去翻账。
 *   ③ **座位块物理分开**：每座 block 是新对象（浅拷贝公共段 + 本座段），
 *      不复用同一引用——否则改一座会连带改全场。
 *   ④ 同一人只在 holders 里出现一次；重复出现取**第一条**并记 `dup`，不静默挑一条。
 *   ⑤ 空 holders 不报错（全盲场合也合法），但 `includeAbsent` 时必须在
 *      `opt.audience` 里给出受众名单，否则等于什么都没投影（报 `bad-audience`）。
 *   ⑥ 不负责判断「该不该是秘密」：那是 concealment / epistemic 的事。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_observationprojection_settings_v1';
  const DEF = { enabled: false, maxSeats: 24 };
  const __REG = { key: LS_KEY, def: DEF, module: 'observationProjection', bounds: { maxSeats: [4, 64] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  const stat = { projects: 0, seats: 0, redacted: 0, degraded: 0, blocked: 0, lastReason: '' };
  function clean(v, max) {
    return v == null ? '' : String(v).slice(0, max || 60);
  }
  function copyBlock(shared) {
    const o = {};
    if (shared && typeof shared === 'object') Object.keys(shared).forEach(function (k) { o[k] = shared[k]; });
    return o;
  }
  /**
   * 把一份公共事实按观察者投影成各座私有块。
   * @param {object} shared 对所有人相同的公共段
   * @param {Array} holders [{ who, version, source?, certainty? }]
   * @param {{includeAbsent?:boolean, audience?:string[]}} [opt]
   */
  function project(shared, holders, opt) {
    const cfg = settings();
    if (!cfg.enabled) { stat.degraded++; return { ok: false, reason: 'disabled', degraded: true, seats: [] }; }
    const o = opt || {};
    const list = Array.isArray(holders) ? holders : [];
    const seen = {};
    const seats = [];
    let dup = 0;
    for (let i = 0; i < list.length; i++) {
      const h = list[i] || {};
      const who = clean(h.who, 60);
      if (!who) { stat.blocked++; continue; }
      if (seen[who]) { dup++; continue; }
      seen[who] = true;
      if (seats.length >= cfg.maxSeats) { stat.blocked++; break; }
      const hasVersion = h.version !== undefined && h.version !== null && String(h.version) !== '';
      const block = copyBlock(shared);
      if (hasVersion) block.version = h.version;
      if (h.source) block.source = clean(h.source, 30);
      if (h.certainty) block.certainty = clean(h.certainty, 20);
      if (!hasVersion) stat.redacted++;
      seats.push({ who: who, block: block, redacted: !hasVersion });
    }
    if (o.includeAbsent) {
      const audience = Array.isArray(o.audience) ? o.audience : null;
      if (!audience) { stat.blocked++; return { ok: false, reason: 'bad-audience', seats: seats }; }
      for (let i = 0; i < audience.length; i++) {
        const who = clean(audience[i], 60);
        if (!who || seen[who]) continue;
        seen[who] = true;
        if (seats.length >= cfg.maxSeats) break;
        seats.push({ who: who, block: copyBlock(shared), redacted: true });
        stat.redacted++;
      }
    }
    if (!seats.length) { stat.blocked++; return { ok: false, reason: 'no-seat', seats: [] }; }
    stat.projects++;
    stat.seats += seats.length;
    return { ok: true, seats: seats, stats: { seats: seats.length, dup: dup, redacted: seats.filter(function (s) { return s.redacted; }).length } };
  }
  /** 取单座（投影结果只给一个人用时的出口）。 */
  function sole(projected, who) {
    if (!projected || !Array.isArray(projected.seats)) return { ok: false, reason: 'bad-projection' };
    const k = clean(who, 60);
    const hit = projected.seats.filter(function (s) { return s.who === k; })[0];
    if (!hit) return { ok: false, reason: 'not-seated' };
    return { ok: true, who: hit.who, block: hit.block, redacted: hit.redacted };
  }
  /** 读侧报告用（注入仍走 seats，不走路用 merge）。 */
  function merge(projected) {
    const out = {};
    if (!projected || !Array.isArray(projected.seats)) return out;
    projected.seats.forEach(function (s) {
      out[s.who] = s.block;   // 每座本就是独立对象，这里只按人建索引
    });
    return out;
  }
  function statOf() { return Object.assign({}, stat); }
  WA.observationProjection = { project: project, sole: sole, merge: merge, settings: settings, saveSettings: saveSettings, stat: statOf, REG: __REG, DEF: DEF };
})();

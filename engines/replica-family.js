/**
 * WorldAxis engines/replica-family.js (v2.530.0) — 副本族：一族条目的产名、铺开与回收
 *
 * 缝合来源：酒馆脚本「工作流助手」（replicaFamilyBaseName / replicaFamilyEnumSpec /
 *   replicaFamilySpec / replicaFamilyScheduleMode / replicaFamilyCleanup）。
 *
 * 病：后台推演会把「在场角色」这类清单写成一族条目（`前台角色1`、`前台角色2`……）。
 *   WorldAxis 侧只有 `evict`（容器容量）和 `wb-inject`（变量镜像），**没有「一族」这个概念**：
 *   族该建几条、哪条已经没用了、回收时按什么依据 —— 全在临时脚本里，没有台账也没有判据。
 *   后果是两个方向都错：该建的不建（角色出场了但世界书里没有格子），不该留的不删
 *   （旧副本永久占着注入预算与关键词表）。
 *
 * 判据（四条，缺一不可）：
 *   ① `plan(current, want)` 只出三张单 `{create, keep, drop}`，**不碰存储、不产名字之外的东西**；
 *   ② 产名是纯函数：`nameOf(base, i)` 稳定、连续、不跳号（改族名即整族重命名，由调用方决策）；
 *   ③ `cleanup` 幂等：同一轮重复调用返回空 drop，且 state 一字不变（`skipped:'same-round'`）；
 *   ④ **缺活动记录 ≠ 不活跃**：`activity[name] === undefined` 的条目一律不回收
 *      （与 fact-age「缺 lastTurn 记 unknown、不判 dead」同源 —— 把「没测到」当成「零」，
 *      就会静默删掉刚建的副本，而它只是还没轮上第一次活动）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const MAX_SPEC_LEN = 64;
  const DEFAULTS = { mode: 'manual', minActivityTries: 1, cycleRounds: 10 };

  /** `npc@act` → { tag:'npc', attr:'act' }；非法形态返回 null（不猜、不兜底）。 */
  function parseSpec(spec) {
    if (typeof spec !== 'string') return null;
    const s = spec.trim();
    if (!s || s.length > MAX_SPEC_LEN) return null;
    const at = s.indexOf('@');
    if (at < 0) return { tag: s, attr: '' };                    // 无属性：整串就是 tag
    if (at === 0 || at === s.length - 1) return null;           // 空 tag / 空 attr 都不猜
    const tag = s.slice(0, at).trim();
    const attr = s.slice(at + 1).trim();
    if (!tag || !attr) return null;
    return { tag: tag, attr: attr };
  }

  /** 族内第 i 条（0 起）的名字。base 为空时返回 ''（由调用方判空，不替它编一个）。 */
  function nameOf(base, i) {
    if (!base || typeof base !== 'string') return '';
    const n = Math.floor(Number(i));
    if (!isFinite(n) || n < 0) return '';
    return base + (n + 1);
  }

  /** 该族应有的名单（length 非法按 0，不抛）。 */
  function namesOf(base, count) {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    const out = [];
    for (let i = 0; i < n; i++) out.push(nameOf(base, i));
    return out;
  }

  /**
   * 三张单：create（该建）/ keep（该留）/ drop（该删）。
   * 顺序一律按 want 名单走，current 里多出来的按原顺序进 drop —— 读数要可复算。
   */
  function plan(current, want) {
    const cur = (Array.isArray(current) ? current : []).filter(function (x) { return typeof x === 'string' && x; });
    const w = want || {};
    const wanted = namesOf(w.base, w.count);
    const have = {};
    cur.forEach(function (n) { have[n] = true; });
    const wantSet = {};
    wanted.forEach(function (n) { wantSet[n] = true; });
    const create = wanted.filter(function (n) { return !have[n]; });
    const keep = wanted.filter(function (n) { return have[n]; });
    const drop = cur.filter(function (n) { return !wantSet[n]; });
    return { create: create, keep: keep, drop: drop, wanted: wanted };
  }

  /**
   * 回收：只按「活动次数」与「轮次」判，判不出就不动。
   *   state: { lastCleanupRound, roundsSinceCleanup, activity: {name: hits} }
   *   cfg  : { mode:'manual'|'auto', minActivityTries, cycleRounds }（auto 才按轮次自动跑）
   * 返回 { ok, skipped?, drop, why:{name:原因}, next:{...state} }
   */
  function cleanup(state, round, cfg) {
    const st = state && typeof state === 'object' ? state : {};
    const c = Object.assign({}, DEFAULTS, cfg || {});
    const r = Math.floor(Number(round) || 0);
    const cycle = Math.max(1, Math.floor(Number(c.cycleRounds) || DEFAULTS.cycleRounds));
    const minTry = Math.max(0, Math.floor(Number(c.minActivityTries) || 0));
    const next = {
      lastCleanupRound: r,
      roundsSinceCleanup: 0,
      activity: Object.assign({}, st.activity || {})
    };
    // ④ 幂等：同一轮重复调用不再动任何条目，也不改 state 的任何读数
    if (Math.floor(Number(st.lastCleanupRound) || -1) === r) {
      return { ok: true, skipped: 'same-round', drop: [], why: {}, next: Object.assign({}, st) };
    }
    // auto 模式只在轮次够的时候跑；不够就只把计数器 +1（这是唯一会写 next 的分支）
    const since = Math.floor(Number(st.roundsSinceCleanup) || 0) + 1;
    if (c.mode === 'auto' && since < cycle) {
      next.roundsSinceCleanup = since;
      next.lastCleanupRound = Math.floor(Number(st.lastCleanupRound) || 0);   // 没真清理 ⇒ 不动上一轮标记
      return { ok: true, skipped: 'not-due', drop: [], why: {}, next: next };
    }
    const drop = [];
    const why = {};
    Object.keys(next.activity).forEach(function (name) {
      const hits = next.activity[name];
      if (typeof hits !== 'number') { why[name] = 'no-activity'; return; }   // ④ 缺记录不回收
      if (hits >= minTry) return;
      drop.push(name);
      why[name] = 'idle<' + minTry;
      delete next.activity[name];      // 回收后连活动记录一起清（否则下次回收会「记得」一个不存在的副本）
    });
    drop.sort();
    return { ok: true, drop: drop, why: why, next: next };
  }

  /** 只读读数：族有多大、多少条真的活跃过（给诊断/面板用）。 */
  function stat(state) {
    const st = state && typeof state === 'object' ? state : {};
    const act = st.activity || {};
    const names = Object.keys(act);
    return {
      family: names.length,
      active: names.filter(function (n) { return typeof act[n] === 'number' && act[n] > 0; }).length,
      lastCleanupRound: Math.floor(Number(st.lastCleanupRound) || 0),
      roundsSinceCleanup: Math.floor(Number(st.roundsSinceCleanup) || 0)
    };
  }

  WA.replicaFamily = {
    parseSpec: parseSpec, nameOf: nameOf, namesOf: namesOf,
    plan: plan, cleanup: cleanup, stat: stat,
    DEFAULTS: Object.assign({}, DEFAULTS)
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/replica-family.js', { kind: 'engine', ver: '2.530.0' });
})();
/**
 * WorldAxis engines/betrothal-alliance.js (v2.400.0) — EXV22-6 婚约聘娶、妆匛与门第联姻
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   G3 实测：「婚约 / 聘礼」在产品源码里只有 **1 命中**，是 elsewhere.js 里一个
 *   状态枚举 `betroth` —— 也就是说**只有结果，没有过程**。
 *   缺的是谈判：门第差多少、妆匛怎么议、悔婚要赔多少、联姻把两家绑多紧。
 *   后果：婚约在本仓是「设了就成」，成了以后什么也不改变。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `betrothalAlliance.proposeMatch` 提一门亲，按两家门第差与妆匛算出
 *   **议成概率 / 需要的妆匛 / 悔婚代价 / 联姻绑定强度**；`settle` 落定，
 *   把绑定强度记成两家之间的**可读债务**（谁欠谁的人情）。
 *   链：门第差 → 妆匛议价 → 悔婚代价 → 联姻绑定 → 势力互相牵引。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① **不碰 store**：两家是谁、门第多高由调用方给；人物关系落账仍走 bonds / bonds.setBond。
 *   ② **不硬凑成婚**：门第差过大时如实报「议不成」并给出**差多少**，
 *      不为了叙事好看而让一切成真。
 *   ③ **拒收码只用 `disabled`**，其余走 hint。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_betrothal_alliance_settings_v1';
  const DEF = {
    enabled: false,
    /** 门第差每差一级，需要的妆匛倍率增加多少。 */
    dowryPerRankGap: 0.25,
    /** 门第差超过这个级数，议成的可能性归零（如实报议不成）。 */
    maxRankGap: 5,
    /** 悔婚代价 = 已下聘 × 该倍率。 */
    breachPenaltyRate: 2.0
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'betrothalAlliance' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    try {
      const raw = WA.settingsBus.read(__REG);
      return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
    } catch (e) { return Object.assign({}, DEF); }
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { proposed: 0, settled: 0, broken: 0, refused: 0, lastReason: '' };
  /** matchId -> 提案 */ const PROPOSALS = {};
  /** "houseA|houseB" -> { strength, since } */ const TIES = {};

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function str(v) { return String(v == null ? '' : v).trim(); }
  function tieKey(a, b) { return [a, b].sort().join('|'); }

  /**
   * 提一门亲。
   * @param {object} spec { id, houseA, houseB, rankA, rankB, baseDowry }
   */
  function proposeMatch(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = str(s.id);
    const houseA = str(s.houseA);
    const houseB = str(s.houseB);
    if (!id || !houseA || !houseB) {
      stat.refused++; stat.lastReason = 'missing-args';
      return { ok: false, hint: 'missing-args：需要 id / houseA / houseB' };
    }
    if (houseA === houseB) {
      stat.refused++; stat.lastReason = 'same-house';
      return { ok: false, hint: 'same-house：两家是同一家，联姻需要两个不同的家族' };
    }
    const rankA = num(s.rankA);
    const rankB = num(s.rankB);
    if (rankA === null || rankB === null) {
      stat.refused++; stat.lastReason = 'missing-rank';
      return { ok: false, hint: 'missing-rank：必须给两家门第（rankA / rankB），门第是议价的基础' };
    }
    const baseDowry = num(s.baseDowry) === null ? 100 : num(s.baseDowry);

    const gap = Math.abs(rankA - rankB);
    // 门第差过大：如实报议不成，并给出差了几级 —— 不留「也许能成」的模糊空间。
    if (gap > cfg.maxRankGap) {
      stat.refused++; stat.lastReason = 'rank-gap-too-wide';
      return {
        ok: false,
        hint: 'rank-gap-too-wide：门第差 ' + gap + ' 级超出上限 ' + cfg.maxRankGap + '，这门亲议不成',
        rankGap: gap
      };
    }
    // 低门第那家要补妆匛：差一级多 25%。
    const dowry = Math.round(baseDowry * (1 + gap * cfg.dowryPerRankGap) * 100) / 100;
    // 议成可能性：门第差越大越低（线性），差 0 级约 0.9（仍非必然 —— 还有别的坎）。
    const odds = Math.round((0.9 - gap * 0.12) * 100) / 100;
    // 联姻绑定强度：门第越相近绑得越紧（平等联姻 > 高攀/下嫁）。
    const tieStrength = Math.round((1 - gap / (cfg.maxRankGap + 1)) * 100) / 100;
    const breachPenalty = Math.round(dowry * cfg.breachPenaltyRate * 100) / 100;

    const p = {
      id: id, houseA: houseA, houseB: houseB, rankA: rankA, rankB: rankB,
      rankGap: gap, dowry: dowry, odds: Math.max(0.05, odds),
      tieStrength: Math.max(0, tieStrength), breachPenalty: breachPenalty,
      baseDowry: baseDowry, state: 'proposed'
    };
    PROPOSALS[id] = p;
    stat.proposed++;
    return {
      ok: true, outcome: 'match-proposed', id: id,
      rankGap: p.rankGap, dowry: p.dowry, odds: p.odds,
      tieStrength: p.tieStrength, breachPenalty: p.breachPenalty
    };
  }

  /**
   * 落定一门亲（把绑定记成两家之间的债务）。
   * @param {object} spec { id, at }
   */
  function settle(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = str(s.id);
    const p = PROPOSALS[id];
    if (!p) {
      stat.refused++; stat.lastReason = 'unknown-match';
      return { ok: false, hint: 'unknown-match：先 proposeMatch(' + (id || '?') + ')' };
    }
    if (p.state !== 'proposed') {
      stat.refused++; stat.lastReason = 'bad-state';
      return { ok: false, hint: 'bad-state：这门亲当前状态是 ' + p.state + '，不能重复落定' };
    }
    p.state = 'settled';
    const k = tieKey(p.houseA, p.houseB);
    const prev = TIES[k];
    TIES[k] = {
      strength: Math.round(Math.min(1, (prev ? prev.strength : 0) + p.tieStrength) * 100) / 100,
      since: num(s.at),
      matches: (prev ? prev.matches : 0) + 1
    };
    stat.settled++;
    return {
      ok: true, outcome: 'match-settled', id: id,
      houses: [p.houseA, p.houseB],
      tieStrength: p.tieStrength,
      cumulativeTie: TIES[k].strength,
      matches: TIES[k].matches,
      // 妆匛是**低门第一家付出去**的，写清方向：谁欠谁的人情要能读出来。
      dowryPaidBy: p.rankA <= p.rankB ? p.houseA : p.houseB,
      dowry: p.dowry
    };
  }

  /**
   * 悔婚：代价 = 已下聘 × 倍率，并且把已有的绑定按悔婚折损。
   * @param {object} spec { id }
   */
  function breach(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = str(s.id);
    const p = PROPOSALS[id];
    if (!p) {
      stat.refused++; stat.lastReason = 'unknown-match';
      return { ok: false, hint: 'unknown-match：没有可悔的这门亲' };
    }
    if (p.state === 'broken') {
      stat.refused++; stat.lastReason = 'bad-state';
      return { ok: false, hint: 'bad-state：已经悔过一次，不能重复悔婚' };
    }
    const wasSettled = p.state === 'settled';
    p.state = 'broken';
    const k = tieKey(p.houseA, p.houseB);
    if (wasSettled && TIES[k]) {
      // 悔婚折损一半绑定 —— 不是清零：两家的往来已经发生了。
      TIES[k].strength = Math.round(TIES[k].strength * 0.5 * 100) / 100;
    }
    stat.broken++;
    return {
      ok: true, outcome: 'match-broken', id: id,
      penalty: p.breachPenalty,
      penaltyPaidBy: p.rankA <= p.rankB ? p.houseA : p.houseB,
      tieAfter: wasSettled && TIES[k] ? TIES[k].strength : 0,
      wasSettled: wasSettled
    };
  }

  function view() {
    const cfg = settings();
    return {
      enabled: !!cfg.enabled,
      dowryPerRankGap: cfg.dowryPerRankGap,
      maxRankGap: cfg.maxRankGap,
      breachPenaltyRate: cfg.breachPenaltyRate,
      proposals: Object.keys(PROPOSALS).map(function (k) {
        const p = PROPOSALS[k];
        return { id: k, houses: [p.houseA, p.houseB], state: p.state, rankGap: p.rankGap, tieStrength: p.tieStrength };
      }),
      ties: Object.keys(TIES).map(function (k) {
        return { houses: k, strength: TIES[k].strength, matches: TIES[k].matches };
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
    Object.keys(PROPOSALS).forEach(function (k) { delete PROPOSALS[k]; });
    Object.keys(TIES).forEach(function (k) { delete TIES[k]; });
    stat.proposed = 0; stat.settled = 0; stat.broken = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }

  WA.betrothalAlliance = {
    proposeMatch: proposeMatch,
    settle: settle,
    breach: breach,
    view: view,
    setSettings: setSettings,
    getSettings: settings,
    reset: reset
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/betrothal-alliance.js', { kind: 'engine', ver: '2.400.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/betrothal-alliance 已加载（2.400.0）');
  }
})();
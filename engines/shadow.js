/**
 * WorldAxis engines/shadow.js (v2.63.0)
 * 社交漩涡：关系经历与承诺的深化——好感只是量值，**经历**才让人回不了头。
 *
 * 为什么单独成模块，而不并进 actors/registry.js 的 relations：
 *   registry 的 relations 是**量值面**（intimacy/trust/hostility/vigilance/attachment，
 *   0-100、单步 ±20、可上可下，是「此刻态度」）；本模块记的是**经历面**——
 *   两人之间发生过什么、共同隐瞒了什么、承诺到了哪一级。
 *   两者最要命的差别是**可逆性**：量值可以升可以降（今天吵翻、明天和好），
 *   经历不可逆（「你替他顶过一次罪」不会因为好感回落到 30 而消失）。
 *   把两者并进一张表，最直接的后果是**不可逆的东西被当成可回退的量值**，
 *   于是关系史可以在几次数值变动里被抹平——那是这个世界最不该丢的东西。
 *
 * 设计边界（**全是否定式**）：
 *   1 总开关默认关闭；关闭时不记经历、不注入、不改动任何关系量值。
 *   2 承诺不可凭空升级：`deepen` 只在**已有秘密且仍在生效**时才允许加深；
 *      没有秘密可加深时明确归因（不得把「第一次见面」直接写成「生死之交」）。
 *   3 共同隐瞒是**双方各持一行**：秘密不共享等于没发生；单方面持有的不是共同秘密。
 *   4 履行与背弃必须**分开归因**、两者都留痕（合成一个「承诺结束」，
 *      就再也答不出「他是守了还是赖了」——而那正是关系史上唯一重要的问题）。
 *   5 变淡只降**胁迫感**（severity），不动秘密是否曾存在：秘密的存在是事实，不是态度。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_shadow_settings_v1';
  const DEF = { enabled: false, maxRows: 12, maxExp: 8 };
  const __REG = { key: LS_KEY, def: DEF, module: 'shadow',
    bounds: { maxRows: [1, 48], maxExp: [1, 20] } };
  const SHADOW_KINDS = ['crime', 'debt', 'love', 'blood', 'shame', 'compact'];
  const STAKES = ['low', 'mid', 'high', 'fatal'];

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { shadows: 0, deepened: 0, brightened: 0, experiences: 0, blocked: 0, lastReason: '', faults: {} };

  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 60); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function node() { const s = state().shadow; return (s && typeof s === 'object' && !Array.isArray(s)) ? s : {}; }
  function rows() { return Array.isArray(node().rows) ? node().rows : []; }
  function namesOf(a, b) { return [clean(a, 60), clean(b, 60)]; }
  function pairKey(a, b) { return namesOf(a, b).sort().join('|'); }
  function findRow(list, k) { return list.filter(function (x) { return x && x.pair === k; })[0] || null; }
  function clampSev(v, fb) { const n = Number(v); return isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : fb; }

  /**
   * 共同隐瞒：双方各持一行（单方面持有的不是共同秘密）。
   *   「秘密」的定义就是**不能让别人知道**——只写在一个人名下的，是心事，不是把柄。
   */
  function addShadow(a, b, opts) {
    const o = opts || {};
    const nm = namesOf(a, b);
    if (!nm[0] || !nm[1]) return { ok: false, reason: 'missing-fields' };
    if (nm[0] === nm[1]) return { ok: false, reason: 'self-pair' };
    const kind = clean(o.kind, 20) || 'compact';
    if (SHADOW_KINDS.indexOf(kind) < 0) return { ok: false, reason: 'bad-kind', kinds: SHADOW_KINDS.slice() };
    const stakes = clean(o.stakes, 12) || 'mid';
    if (STAKES.indexOf(stakes) < 0) return { ok: false, reason: 'bad-stakes', stakes: STAKES.slice() };
    const k = pairKey(a, b);
    let out = null;
    WA.store.transact(function (draft) {
      draft.shadow = draft.shadow && typeof draft.shadow === 'object' && !Array.isArray(draft.shadow) ? draft.shadow : {};
      draft.shadow.rows = Array.isArray(draft.shadow.rows) ? draft.shadow.rows : [];
      const hit = findRow(draft.shadow.rows, k);
      if (hit) {
        if (hit.status === 'active') { out = { ok: true, pair: k, existed: true, kind: hit.kind, severity: hit.severity }; return; }
        // 已终结的秘密可以重开，但**不是覆写**：旧行留在 experiences 里（不可逆的东西不许被覆盖）。
        hit.status = 'active'; hit.kind = kind; hit.stakes = stakes;
        hit.severity = clampSev(o.severity, 4); hit.reopenedAt = clockNow('shadow'); hit.updatedAt = hit.reopenedAt;
        out = { ok: true, pair: k, existed: false, reopened: true, severity: hit.severity };
        return;
      }
      const row = { pair: k, holders: namesOf(a, b), kind: kind, secret: clean(o.secret, 80),
        stakes: stakes, severity: clampSev(o.severity, 4), status: 'active',
        openedAt: clockNow('shadow'), updatedAt: clockNow('shadow') };
      draft.shadow.rows.push(row);
      WA.evict.array(draft.shadow.rows, 'shadow.rows');
      out = { ok: true, pair: k, existed: false, kind: kind, severity: row.severity };
    }, 'shadow:add');
    if (out && out.ok) { if (!out.existed && !out.reopened) stat.shadows++; stat.lastReason = out.reopened ? 'reopened' : (out.existed ? 'existed' : 'opened'); }
    else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /** 加深：**只在已有秘密且仍在生效时**允许。没有可加深的东西时明确归因，不许凭空升级。 */
  function deepen(a, b, amount) {
    const nm = namesOf(a, b);
    if (!nm[0] || !nm[1]) return { ok: false, reason: 'missing-fields' };
    const add = Number(amount);
    if (!isFinite(add) || add <= 0) return { ok: false, reason: 'bad-amount' };
    const k = pairKey(a, b);
    const cur = findRow(rows(), k);
    if (!cur) return { ok: false, reason: 'no-shadow', pair: k };
    if (cur.status !== 'active') return { ok: false, reason: 'shadow-closed', pair: k, status: cur.status };
    let out = null;
    WA.store.transact(function (draft) {
      const list = (draft.shadow && Array.isArray(draft.shadow.rows)) ? draft.shadow.rows : [];
      const row = findRow(list, k);
      if (!row) { out = { ok: false, reason: 'no-shadow' }; return false; }
      const before = clampSev(row.severity, 0);
      const after = clampSev(before + add, before);
      row.severity = after; row.deepened = (Number(row.deepened) || 0) + 1;
      row.updatedAt = clockNow('shadow');
      out = { ok: true, pair: k, before: before, after: after, deepened: row.deepened };
    }, 'shadow:deepen');
    if (out && out.ok) { stat.deepened++; stat.lastReason = 'deepened'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 变淡：只降**胁迫感**（severity），**不删秘密是否曾存在**。
   *   降到底 ⇒ status 转 'faded'；记录仍在，且归因写明「变淡」而不是「没有了」。
   */
  function brighten(a, b, amount) {
    const nm = namesOf(a, b);
    if (!nm[0] || !nm[1]) return { ok: false, reason: 'missing-fields' };
    const cut = Number(amount);
    if (!isFinite(cut) || cut <= 0) return { ok: false, reason: 'bad-amount' };
    const k = pairKey(a, b);
    const cur = findRow(rows(), k);
    if (!cur) return { ok: false, reason: 'no-shadow', pair: k };
    if (cur.status !== 'active') return { ok: false, reason: 'shadow-closed', pair: k, status: cur.status };
    let out = null;
    WA.store.transact(function (draft) {
      const list = (draft.shadow && Array.isArray(draft.shadow.rows)) ? draft.shadow.rows : [];
      const row = findRow(list, k);
      if (!row) { out = { ok: false, reason: 'no-shadow' }; return false; }
      const before = clampSev(row.severity, 0);
      const after = clampSev(before - cut, before);
      row.severity = after; row.updatedAt = clockNow('shadow');
      if (after === 0) row.status = 'faded';   // 记录仍在：秘密**存在过**是事实，不是态度
      out = { ok: true, pair: k, before: before, after: after, status: row.status };
    }, 'shadow:brighten');
    if (out && out.ok) { stat.brightened++; stat.lastReason = out.status === 'faded' ? 'faded' : 'brightened'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 关系经历：留痕「发生过什么」。履行（kept）与背弃（broken）必须分开归因，
   *   两者都留痕——合成一个「承诺结束」，就再也答不出「他是守了还是赖了」。
   */
  function addExperience(a, b, item) {
    const o = item || {};
    const nm = namesOf(a, b);
    if (!nm[0] || !nm[1]) return { ok: false, reason: 'missing-fields' };
    const what = clean(o.what, 80);
    if (!what) return { ok: false, reason: 'missing-what' };
    const outcome = clean(o.outcome, 12) || 'open';
    if (['open', 'kept', 'broken'].indexOf(outcome) < 0) return { ok: false, reason: 'bad-outcome' };
    const k = pairKey(a, b);
    let out = null;
    WA.store.transact(function (draft) {
      draft.shadow = draft.shadow && typeof draft.shadow === 'object' && !Array.isArray(draft.shadow) ? draft.shadow : {};
      draft.shadow.experiences = Array.isArray(draft.shadow.experiences) ? draft.shadow.experiences : [];
      const row = { pair: k, holders: namesOf(a, b), what: what, outcome: outcome,
        at: clockNow('shadow') };
      draft.shadow.experiences.push(row);
      WA.evict.array(draft.shadow.experiences, 'shadow.experiences');
      out = { ok: true, pair: k, outcome: outcome };
    }, 'shadow:experience');
    if (out && out.ok) { stat.experiences++; stat.lastReason = 'experience:' + out.outcome; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  function experiencesOf(a, b) {
    const k = pairKey(a, b);
    const list = Array.isArray(node().experiences) ? node().experiences : [];
    return list.filter(function (x) { return x && x.pair === k; }).slice(-6);
  }

  /** 单条视图：秘密**仍在**但已变淡 与 从来没有过秘密，是两个局面。 */
  function getShadow(a, b) {
    const nm = namesOf(a, b);
    if (!nm[0] || !nm[1]) return { ok: false, reason: 'missing-fields' };
    const k = pairKey(a, b);
    const row = findRow(rows(), k);
    if (!row) return { ok: true, pair: k, exists: false, status: '', severity: 0, exp: experiencesOf(a, b) };
    return { ok: true, pair: k, exists: true, status: row.status, kind: row.kind, stakes: row.stakes,
      severity: clampSev(row.severity, 0), deepened: Number(row.deepened) || 0,
      closed: row.status !== 'active', exp: experiencesOf(a, b) };
  }

  /** 此人**持有**的秘密（只读，用于注入与诊断） */
  function visibleTo(name) {
    const who = clean(name, 60);
    if (!who) return [];
    return rows().filter(function (x) { return x && x.status === 'active' && Array.isArray(x.holders) && x.holders.indexOf(who) >= 0; })
      .slice(0, 6).map(function (x) { return { pair: x.pair, kind: x.kind, stakes: x.stakes, severity: clampSev(x.severity, 0),
        other: x.holders.filter(function (h) { return h !== who; })[0] || '' }; });
  }

  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const live = rows().filter(function (x) { return x && x.status === 'active'; }).slice(0, cfg.maxRows);
    const exps = (Array.isArray(node().experiences) ? node().experiences : []).slice(-Math.max(2, cfg.maxExp));
    if (!live.length && !exps.length) return '';
    const lines = [];
    live.forEach(function (x) {
      lines.push('共同隐瞒：' + x.holders.join('·') + '（' + x.kind + '／' + x.stakes + '／胁迫 ' + clampSev(x.severity, 0) + '）');
    });
    exps.forEach(function (x) {
      lines.push('关系经历：' + x.holders.join('·') + ' —— ' + x.what + '（' + x.outcome + '）');
    });
    lines.push('秘密只对被持有者公开，不得让未持有者「知道」；秘密是经历不是态度，不随好感涨落而消失。');
    lines.push('承诺的履行与背弃是两种不同事实：不得把背弃写成「关系结束」而隐去「他赖了」。');
    return '[社交漩涡]\n' + lines.join('\n') + '\n';
  }

  WA.shadow = {
    SHADOW_KINDS: SHADOW_KINDS, STAKES: STAKES,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    addShadow: addShadow, deepen: deepen, brighten: brighten,
    addExperience: addExperience, experiencesOf: experiencesOf,
    getShadow: getShadow, visibleTo: visibleTo, buildBlock: buildBlock,
    shadowStat: function () {
      const all = rows();
      return { rows: all.length,
        active: all.filter(function (x) { return x && x.status === 'active'; }).length,
        faded: all.filter(function (x) { return x && x.status === 'faded'; }).length,
        experiences: (Array.isArray(node().experiences) ? node().experiences : []).length,
        kept: (Array.isArray(node().experiences) ? node().experiences : []).filter(function (x) { return x && x.outcome === 'kept'; }).length,
        broken: (Array.isArray(node().experiences) ? node().experiences : []).filter(function (x) { return x && x.outcome === 'broken'; }).length };
    },
    stat: function () { return Object.assign({}, stat); }
  };
  // v2.63.0 观测面：把「被拒了什么」按原因计入 stat.faults。
  //   为什么必须另立一面：拒绝是**不落盘**的——被拒的东西当然写不进存档，
  //   于是「世界没有因为一句话长出一条不存在的街」这件事在状态里完全不可见，
  //   而它恰恰是本模块存在的全部理由。
  //   实现纪律：只读观测。不改判定、不改返回结构、不新增导出成员——
  //   包在总线上而不是散进各个函数里，是为了让「有没有漏掉某条出口」在结构上不可能发生。
  (function () {
    const api = WA.shadow;
    if (!api) return;
    Object.keys(api).forEach(function (k) {
      const fn = api[k];
      if (typeof fn !== 'function') return;
      api[k] = function () {
        const r = fn.apply(null, arguments);
        if (r && r.ok === false && typeof r.reason === 'string' && r.reason) {
          stat.faults[r.reason] = (stat.faults[r.reason] || 0) + 1;
        }
        return r;
      };
    });
  })();
})();
/**
 * WorldAxis engines/shared-awareness.js (v2.231.0) — IN-3 共同知晓与默契
 *
 * 核心职责：
 *   区分「知道一件事」与「知道别人也知道」，以及「大家都确认过约定」。
 *   只建两层社会认知：本人相信什么（复用 OP-7）、本人认为指定对方知道什么。
 *   配合具名协作事项的确认状态：可配合 / 需确认 / 存在误会。
 *   公开宣布不穿透封路消息延迟；缺席者、迟到者、未读者不自动加入。
 *   不做无限递归「我知道你知道我知道」。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : (typeof v === 'string' ? v.slice(0, max || 60) : '');
  }

  function personId(name) {
    const n = clean(name, 60);
    return n ? (n.indexOf('p_') === 0 ? n : 'p_' + n) : '';
  }

  function state() {
    return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
  }

  function bucket() {
    const s = state();
    return (s.sharedAwareness && typeof s.sharedAwareness === 'object') ? s.sharedAwareness : null;
  }

  function ensureBucket() {
    if (!bucket()) {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.sharedAwareness = d.sharedAwareness || { meta: {}, pacts: {} };
          return true;
        }, 'sharedAwareness:init');
      }
    }
    return bucket() || { meta: {}, pacts: {} };
  }

  /**
   * 登记「甲认为乙知道某事实」的二阶认知。
   * 只在确实有据（甲亲自告知、共同在场、甲看到乙收到）时成立。
   */
  function assertMeta(whoName, targetName, factId, basis) {
    const me = personId(whoName);
    const other = personId(targetName);
    const fId = clean(factId, 60);
    const b = clean(basis || 'told-directly', 30);
    if (!me || !other || !fId) return { ok: false, reason: 'missing-fields' };

    const allowed = ['told-directly', 'shared-presence', 'saw-receipt'];
    if (allowed.indexOf(b) < 0) {
      return { ok: false, reason: 'insufficient-basis', basis: b,
        note: '只有当面告知、共同在场或亲眼见到对方收到，才能认定对方也知情' };
    }

    const entry = {
      me: me, other: other, factId: fId, basis: b,
      certainty: b === 'shared-presence' ? 'probable' : 'confirmed',
      at: WA.clock.now('sharedAwareness')
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.sharedAwareness = d.sharedAwareness || { meta: {}, pacts: {} };
        d.sharedAwareness.meta[me + '>' + other + ':' + fId] = entry;
        return true;
      }, 'sharedAwareness:assertMeta');
    }

    return { ok: true, meta: entry };
  }

  /**
   * 查询「甲认为乙是否知道」。
   */
  function metaOf(whoName, targetName, factId) {
    const me = personId(whoName);
    const other = personId(targetName);
    const fId = clean(factId, 60);
    const bk = ensureBucket();
    const row = bk.meta && bk.meta[me + '>' + other + ':' + fId];
    if (!row) {
      return { ok: true, assumes: false, certainty: 'unknown',
        note: '没有任何依据表明「' + clean(targetName, 40) + '」也知道这件事' };
    }
    return { ok: true, assumes: true, certainty: row.certainty, basis: row.basis, at: row.at };
  }

  /**
   * 建立具名协作事项的确认状态。
   * participants 明确列出；缺席者不自动加入。
   */
  function openPact(pactId, spec) {
    const pId = clean(pactId, 60);
    const s = spec || {};
    if (!pId) return { ok: false, reason: 'missing-fields' };

    const participants = (Array.isArray(s.participants) ? s.participants : []).map(personId).filter(Boolean);
    if (participants.length < 2) return { ok: false, reason: 'need-two-participants' };

    const pact = {
      id: pId,
      title: clean(s.title || pId, 60),
      factId: clean(s.factId || pId, 60),
      participants: participants,
      confirmedBy: [],
      status: 'pending', // pending | coordinated | misunderstanding
      openedAt: WA.clock.now('sharedAwareness')
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.sharedAwareness = d.sharedAwareness || { meta: {}, pacts: {} };
        d.sharedAwareness.pacts[pId] = pact;
        return true;
      }, 'sharedAwareness:openPact');
    }

    return { ok: true, pact: pact };
  }

  /**
   * 参与者在场确认。未确认者不算。
   */
  function confirmPact(pactId, whoName) {
    const pId = clean(pactId, 60);
    const me = personId(whoName);
    const bk = ensureBucket();
    const pact = bk.pacts && bk.pacts[pId];
    if (!pact) return { ok: false, reason: 'pact-not-found' };
    if (pact.participants.indexOf(me) < 0) {
      return { ok: false, reason: 'not-a-participant', note: '缺席者不自动加入约定' };
    }

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        const p = d.sharedAwareness.pacts[pId];
        if (p.confirmedBy.indexOf(me) < 0) p.confirmedBy.push(me);
        p.status = p.confirmedBy.length >= p.participants.length ? 'coordinated' : 'pending';
        return true;
      }, 'sharedAwareness:confirmPact');
    }

    const updated = (bucket().pacts || {})[pId];
    return { ok: true, pactId: pId, confirmedBy: updated.confirmedBy.slice(),
      status: updated.status, pendingCount: updated.participants.length - updated.confirmedBy.length };
  }

  /**
   * 判断某协作事项当前是否可配合。
   */
  function coordination(pactId) {
    const pId = clean(pactId, 60);
    const bk = ensureBucket();
    const pact = bk.pacts && bk.pacts[pId];
    if (!pact) return { ok: false, reason: 'pact-not-found' };

    const missing = pact.participants.filter(function (x) { return pact.confirmedBy.indexOf(x) < 0; });
    if (missing.length === 0) {
      return { ok: true, state: 'coordinated', note: '全体参与人已当面确认，可以共同出发', missing: [] };
    }

    // 若某参与者自认对方也知道，但对方未确认 → 存在误会风险
    const risk = missing.filter(function (other) {
      const row = bk.meta && bk.meta[personId(pact.participants[0]) + '>' + other + ':' + pact.factId];
      return !!row;
    });

    if (risk.length > 0) {
      return { ok: true, state: 'misunderstanding', missing: missing,
        note: '有人以为对方已知晓，但对方尚未确认 —— 存在协调失败风险，需补发询问' };
    }
    return { ok: true, state: 'needs-confirmation', missing: missing,
      note: '尚有人未确认，需先行确认再统一行动' };
  }

  WA.sharedAwareness = {
    assertMeta: assertMeta,
    metaOf: metaOf,
    openPact: openPact,
    confirmPact: confirmPact,
    coordination: coordination
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/shared-awareness 已加载（2.231.0）');
  }
})();
/**
 * WorldAxis engines/social-legacy.js (v2.231.0) — IN-8 社会遗产
 *
 * 核心职责：
 *   由真实已结算事件形成可被看见、传述、承接或拒绝的遗产。
 *   未完事业、公共设施、具名物件、师承、被不同群体记住的声誉。
 *   继任者可接受目标、重新解释、改用途或放弃。
 *   不同见证者可以保留不同版本。
 *   纪念活动和地名/物品意义来自历史，不按每轮强制加仪式。
 *
 * 运行闭环：
 *   完成事件 → 具有来源的物件/地点/承诺关联 → 显式离任/迁居/剧情交接
 *   → 后继者通过接触/学习获知 → 选择承接范围 → 原 life/gear/operations/family/inst 执行。
 *   知识与能力靠传授，秘密靠合法知情路径，生老病死和亲属关系不由计时器强造。
 *
 * 边界：
 *   1. 社会遗产不得覆盖客观事实。
 *   2. 不把声誉、技能、情感或记忆当可继承财产。
 *   3. 遗产必须有可追溯来源事件（sourceEventId）。
 *   4. 不同见证者可保留不同版本，不自动合并为官方真相。
 *   5. 重载后物件出处、责任与选择仍可追溯。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60);
  }

  function num(v) {
    var n = Number(v);
    return (typeof n === 'number' && isFinite(n)) ? n : null;
  }

  function state() {
    return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
  }

  function now() {
    return WA.clock.now('socialLegacy');
  }

  var LEGACY_TYPES = ['unfinished-work', 'facility', 'named-item', 'lineage', 'reputation'];
  var ACCEPT_STATUSES = ['pending', 'accepted', 'reinterpreted', 'declined'];

  function bucket() {
    var s = state();
    return (s.socialLegacy && typeof s.socialLegacy === 'object') ? s.socialLegacy : null;
  }

  function ensureBucket() {
    if (!bucket()) {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.socialLegacy = d.socialLegacy || { legacies: [], witnesses: [] };
          return true;
        }, 'socialLegacy:init');
      }
    }
    return bucket() || { legacies: [], witnesses: [] };
  }

  /**
   * 从已结算事件形成遗产。
   */
  function formLegacy(spec) {
    var s = spec || {};
    var legacyType = clean(s.legacyType, 30);
    var sourceEventId = clean(s.sourceEventId, 80);
    var originator = clean(s.originator, 40);
    var description = clean(s.description, 120);

    if (!legacyType || !sourceEventId || !originator) return { ok: false, reason: 'missing-fields' };
    if (LEGACY_TYPES.indexOf(legacyType) < 0) return { ok: false, reason: 'bad-legacy-type', allowed: LEGACY_TYPES.slice() };

    var entry = {
      id: 'leg_' + now() + '_' + WA.rand.id(),
      legacyType: legacyType,
      sourceEventId: sourceEventId,
      originator: originator,
      description: description,
      acceptStatus: 'pending',
      successor: '',
      acceptScope: [],
      declinedScope: [],
      witnessAccounts: [],
      formedAt: now(),
      acceptedAt: 0
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.socialLegacy = d.socialLegacy || { legacies: [], witnesses: [] };
        d.socialLegacy.legacies.push(entry);
        return true;
      }, 'socialLegacy:formLegacy');
    }

    return { ok: true, legacy: entry };
  }

  /**
   * 后继者承接遗产。
   * 可接受、重新解释、改用途或放弃。
   */
  function acceptLegacy(legacyId, opts) {
    var s = opts || {};
    var lId = clean(legacyId, 60);
    var successor = clean(s.successor, 40);
    var status = clean(s.status, 20);

    if (!lId || !successor || !status) return { ok: false, reason: 'missing-fields' };
    if (ACCEPT_STATUSES.indexOf(status) < 0 && status !== 'pending') {
      return { ok: false, reason: 'bad-status', allowed: ACCEPT_STATUSES.slice() };
    }
    if (status === 'pending') return { ok: false, reason: 'bad-status', allowed: ACCEPT_STATUSES.slice() };

    var bk = ensureBucket();
    var leg = (bk.legacies || []).filter(function (l) { return l && l.id === lId; })[0];
    if (!leg) return { ok: false, reason: 'legacy-not-found' };
    if (leg.acceptStatus !== 'pending') return { ok: false, reason: 'already-decided', status: leg.acceptStatus };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        var l = (d.socialLegacy.legacies || []).filter(function (x) { return x && x.id === lId; })[0];
        if (!l) return false;
        l.acceptStatus = status;
        l.successor = successor;
        l.acceptScope = Array.isArray(s.acceptScope) ? s.acceptScope.slice(0, 6) : [];
        l.declinedScope = Array.isArray(s.declinedScope) ? s.declinedScope.slice(0, 6) : [];
        l.acceptedAt = now();
        if (s.note) l.acceptNote = clean(s.note, 80);
        return true;
      }, 'socialLegacy:acceptLegacy');
    }

    return { ok: true, legacyId: lId, status: status, successor: successor };
  }

  /**
   * 登记见证者对遗产的描述（不同见证者可保留不同版本）。
   */
  function witnessAccount(legacyId, witness, account) {
    var lId = clean(legacyId, 60);
    var who = clean(witness, 40);
    var text = clean(account, 120);
    if (!lId || !who || !text) return { ok: false, reason: 'missing-fields' };

    var entry = {
      legacyId: lId, witness: who, account: text, at: now()
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.socialLegacy = d.socialLegacy || { legacies: [], witnesses: [] };
        d.socialLegacy.witnesses.push(entry);
        return true;
      }, 'socialLegacy:witnessAccount');
    }

    return { ok: true, witness: entry };
  }

  /**
   * 查询遗产及其全部见证描述。
   */
  function viewLegacy(legacyId) {
    var lId = clean(legacyId, 60);
    var bk = ensureBucket();
    var leg = (bk.legacies || []).filter(function (l) { return l && l.id === lId; })[0];
    if (!leg) return { ok: false, reason: 'legacy-not-found' };

    var witnesses = (bk.witnesses || []).filter(function (w) { return w && w.legacyId === lId; });

    return {
      ok: true,
      legacy: JSON.parse(JSON.stringify(leg)),
      witnessAccounts: witnesses.map(function (w) { return { witness: w.witness, account: w.account, at: w.at }; }),
      note: '不同见证者可保留不同版本，不自动合并为官方真相'
    };
  }

  /**
   * 查询某角色留下的全部遗产。
   */
  function legaciesOf(originator) {
    var who = clean(originator, 40);
    var bk = ensureBucket();
    var legs = (bk.legacies || []).filter(function (l) { return l && l.originator === who; });
    return { ok: true, legacies: legs, count: legs.length };
  }

  WA.socialLegacy = {
    formLegacy: formLegacy,
    acceptLegacy: acceptLegacy,
    witnessAccount: witnessAccount,
    viewLegacy: viewLegacy,
    legaciesOf: legaciesOf,
    LEGACY_TYPES: LEGACY_TYPES.slice(),
    ACCEPT_STATUSES: ACCEPT_STATUSES.slice()
  };

  if (typeof WA.registerModule === 'function') WA.registerModule('engines/social-legacy.js', { kind: 'engine', ver: '2.231.0' });
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/social-legacy 已加载（2.231.0）');
  }
})();
/**
 * WorldAxis engines/legacy-oath.js (v2.303.0)
 * EXV13-4: 世代家族盟约与超长线契约违约连锁（Dynastic Oaths & Legacy Debt）
 *
 * 核心功能：
 *   1. 家族代际盟约缔结（bindLegacyOath）：
 *      超越个人生死的家族盟约，由当事家族缔结并明确违约抵押条件与世袭条款；
 *   2. 代际遗产债务追索（enforceInheritedDebt）：
 *      当原签署人故去或长周期契约到期时，债务与法律责任自动由合法继承人（heirId）继承承担；
 *   3. 违约追责与全城商业信用封锁（defaultSanction）：
 *      继承人若无力清偿且拒绝履约，将遭受信用断崖、商会联合封锁并查封其抵押物。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) {
    try { return WA.clock.now(site); } catch (e) { return Date.now(); }
  };

  const LS_KEY = 'worldaxis_legacy_oath_settings_v1';
  const DEF = { enabled: true, maxOaths: 40 };
  const __REG = { key: LS_KEY, def: DEF, module: 'legacyOath', bounds: {} };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return Object.assign({}, DEF, raw || {});
  }

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80);
  }

  function state() {
    return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
  }

  function ensure(draft) {
    draft.legacyOaths = draft.legacyOaths && typeof draft.legacyOaths === 'object' && !Array.isArray(draft.legacyOaths)
      ? draft.legacyOaths : { oaths: [], enforcements: [] };
    if (!Array.isArray(draft.legacyOaths.oaths)) draft.legacyOaths.oaths = [];
    if (!Array.isArray(draft.legacyOaths.enforcements)) draft.legacyOaths.enforcements = [];
    return draft.legacyOaths;
  }

  const _stat = {
    oathsBound: 0,
    enforced: 0,
    sanctioned: 0,
    refused: 0,
    lastReason: ''
  };

  /**
   * 1. 缔结代际家族盟约
   */
  function bindLegacyOath(spec) {
    const s = spec || {};
    const oid = clean(s.oathId || s.id, 50);
    const famA = clean(s.familyA, 50);
    const famB = clean(s.familyB, 50);
    const terms = clean(s.terms, 200);
    const collateral = clean(s.collateral, 100);
    const debtAmount = typeof s.debtAmount === 'number' ? s.debtAmount : 1000;

    if (!oid || !famA || !famB) {
      _stat.refused++;
      _stat.lastReason = 'missing-fields';
      return { ok: false, reason: 'missing-fields' };
    }

    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const existing = bag.oaths.find(function (o) { return o.oathId === oid; });
      if (existing) {
        out = { ok: false, reason: 'already-exists', oathId: oid };
        return false;
      }

      const now = clockNow('legacyOath');
      const oath = {
        oathId: oid,
        familyA: famA,
        familyB: famB,
        originalSignerA: clean(s.signerA || famA + '_ancestor', 40),
        originalSignerB: clean(s.signerB || famB + '_ancestor', 40),
        terms: terms,
        collateral: collateral,
        debtAmount: debtAmount,
        currency: clean(s.currency || 'gold', 20),
        status: 'active',
        createdAt: now,
        updatedAt: now,
        exemptionsClaimed: []
      };

      bag.oaths.push(oath);
      out = { ok: true, oath: JSON.parse(JSON.stringify(oath)) };
      return true;
    }, 'legacyOath:bindLegacyOath');

    if (out && out.ok) {
      _stat.oathsBound++;
      _stat.lastReason = 'oath_bound';
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 2. 执行代际继承债务催缴与判定（enforceInheritedDebt）
   */
  function enforceInheritedDebt(oathId, heirId, opts) {
    const oid = clean(oathId, 50);
    const hid = clean(heirId, 40);
    const o = opts || {};

    if (!oid || !hid) {
      _stat.refused++;
      return { ok: false, reason: 'missing-fields' };
    }

    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const oath = bag.oaths.find(function (x) { return x.oathId === oid; });
      if (!oath) {
        out = { ok: false, reason: 'oath-not-found', oathId: oid };
        return false;
      }

      const now = clockNow('legacyOath');
      // 检查是否有合法豁免条款
      if (o.exemptionClause) {
        oath.status = 'discharged_by_exemption';
        oath.exemptionNote = clean(o.exemptionClause, 120);
        oath.updatedAt = now;
        out = {
          ok: true,
          oathId: oid,
          heirId: hid,
          status: 'discharged_by_exemption',
          message: '出示跨阵营古老豁免协议，成功清偿并豁免家族债务！'
        };
        return true;
      }

      // 检查继承人是否有足够现款偿还
      const person = draft.people && (draft.people['p_' + hid] || draft.people[hid]);
      const resources = (person && person.resources) ? person.resources : {};
      const cur = oath.currency || 'gold';
      const balance = typeof resources[cur] === 'number' ? resources[cur] : 0;

      if (balance >= oath.debtAmount) {
        resources[cur] -= oath.debtAmount;
        oath.status = 'fulfilled';
        oath.updatedAt = now;
        out = {
          ok: true,
          oathId: oid,
          heirId: hid,
          status: 'fulfilled',
          paid: oath.debtAmount,
          remainingBalance: resources[cur]
        };
        return true;
      }

      // 余额不足且未出示豁免条款：违约并触发联合信用封锁
      oath.status = 'defaulted';
      oath.updatedAt = now;

      // 记录违约制裁
      const sanction = {
        oathId: oid,
        heirId: hid,
        defaultedDebt: oath.debtAmount,
        collateralSeized: oath.collateral,
        commercialLockdown: true,
        sanctionedAt: now
      };
      bag.enforcements.push(sanction);

      // 在角色履历与信用中留下严重污点
      if (person) {
        person.commitments = person.commitments || [];
        person.commitments.push({
          type: 'legacy_debt_default',
          oathId: oid,
          collateral: oath.collateral,
          status: 'sanctioned',
          at: now
        });
      }

      out = {
        ok: true,
        oathId: oid,
        heirId: hid,
        status: 'defaulted',
        balance: balance,
        debtDue: oath.debtAmount,
        shortfall: oath.debtAmount - balance,
        collateralSeized: oath.collateral,
        commercialLockdown: true,
        message: '继承人无力履行代际盟约且无豁免依据，商行联合实施信用封锁并没收抵押工坊！'
      };
      return true;
    }, 'legacyOath:enforceInheritedDebt');

    if (out && out.ok) {
      if (out.status === 'defaulted') _stat.sanctioned++;
      _stat.enforced++;
      _stat.lastReason = 'enforced:' + out.status;
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  function getOath(id) {
    const oid = clean(id, 50);
    const bag = ensure(state());
    const oath = bag.oaths.find(function (o) { return o.oathId === oid; });
    return oath ? JSON.parse(JSON.stringify(oath)) : null;
  }

  function stat() {
    return Object.assign({}, _stat);
  }

  WA.legacyOath = {
    bindLegacyOath: bindLegacyOath,
    enforceInheritedDebt: enforceInheritedDebt,
    getOath: getOath,
    stat: stat
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/legacy-oath.js', { kind: 'engine', ver: '2.303.0' });
  }
})();

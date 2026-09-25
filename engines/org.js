/**
 * WorldAxis engines/org.js (v2.54.0)
 * 资源与组织：势力资源库存、人物持有、条件式转移。
 *
 * 边界：
 *   1 总开关默认关闭；关闭时不结算、不注入。
 *   2 只记已存在的势力或人物，不凭空创建组织。
 *   3 资源不足时拒绝转移，不把负数伪装成成功。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_org_settings_v1';
  const DEF = { enabled: false, maxItems: 3 };
  const __REG = { key: LS_KEY, def: DEF, module: 'org', bounds: { maxItems: [1, 6] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) { return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {}))); }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { grants: 0, transfers: 0, blocked: 0, lastReason: '' };
  // ── v2.92.0（O5）：资源流水（观测面，**不参与判定**）──────────
  // 为什么需要它：本模块此前只有**累计计数**（grants / transfers / blocked），
  //   于是「某笔交易之后存量 = 存量 ± 流量」这句话在此之前**不可判定**——
  //   计数只知道发生了多少次，不知道每一次的前后值。库存被写坏时账上一切正常。
  // 三条口径：
  //   ① 只记**成功**的交易：失败的不是流量（被拒的转移只增 blocked 计数）。
  //   ② 流水**驻内存**（与 causal 磁带同口径：不落盘、不注入正文），环形上限
  //      JOURNAL_CAP，**挤出即记账**（dropped++）——静默丢弃不是可接受的默认值。
  //   ③ 记录**不得影响判定**：noteJournal 全程 try 包裹，grant / transfer 的
  //      返回值与既有 stat 语义一字不变（观测不得改变被观测行为）。
  const JOURNAL_CAP = 200;
  const journal = [];
  const journalStat = { recorded: 0, dropped: 0 };
  function noteJournal(row) {
    try {
      if (!row) return;
      journal.push(row);
      journalStat.recorded++;
      while (journal.length > JOURNAL_CAP) { journal.shift(); journalStat.dropped++; }
    } catch (e) {}
  }
  function clean(v, max) { return WA.inputGuard.text(v, max || 40); }
  function qty(v) { const n = Number(v); return isFinite(n) && n > 0 ? Math.min(9999, Math.floor(n)) : 0; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function holder(kind, name, root) {
    const st = root || state();
    if (kind === 'faction') {
      const key = clean(name, 40);
      return (((st.evolution || {}).factions) || []).filter(function (f) { return f && clean(f.name, 40) === key; })[0] || null;
    }
    if (kind !== 'person') return null;
    const key = clean(name, 60); if (!key) return null;
    const people = st.people || {};
    if (people[key]) return people[key];
    const id = key.indexOf('p_') === 0 ? key : ('p_' + key);
    return people[id] || null;
  }
  function stockOf(row) { return row && row.resources && typeof row.resources === 'object' && !Array.isArray(row.resources) ? row.resources : {}; }
  function grant(kind, name, item, amount) {
    const resource = clean(item, 30), n = qty(amount);
    if (!resource || !n) return { ok: false, reason: 'bad-resource' };
    if (!holder(kind, name)) return { ok: false, reason: 'missing-holder' };
    let out = null, pending = null;
    WA.store.transact(function (draft) {
      const row = holder(kind, name, draft);
      if (!row) { out = { ok: false, reason: 'missing-holder' }; return false; }
      row.resources = stockOf(row);
      const before = qty(row.resources[resource]) || 0;
      row.resources[resource] = before + n;
      row.updatedAt = clockNow('org');
      pending = { op: 'grant', resource: resource, amount: n, toKind: kind, toName: clean(name, 60), toBefore: before, toAfter: row.resources[resource] };
      out = { ok: true, id: resource, amount: row.resources[resource] };
    }, 'org:grant');
    if (out && out.ok) { stat.grants++; stat.lastReason = 'granted'; noteJournal(pending); } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function transfer(fromKind, fromName, toKind, toName, item, amount) {
    const resource = clean(item, 30), n = qty(amount);
    if (!resource || !n) return { ok: false, reason: 'bad-resource' };
    const from = holder(fromKind, fromName), to = holder(toKind, toName);
    if (!from || !to || (fromKind === toKind && clean(fromName, 60) === clean(toName, 60))) return { ok: false, reason: 'missing-holder' };
    if ((stockOf(from)[resource] || 0) < n) { stat.blocked++; stat.lastReason = 'insufficient'; return { ok: false, reason: 'insufficient' }; }
    let out = null, pending = null;
    WA.store.transact(function (draft) {
      const a = holder(fromKind, fromName, draft), b = holder(toKind, toName, draft);
      if (!a || !b) { out = { ok: false, reason: 'missing-holder' }; return false; }
      a.resources = stockOf(a); b.resources = stockOf(b);
      if ((a.resources[resource] || 0) < n) { out = { ok: false, reason: 'insufficient' }; return false; }
      const fromBefore = qty(a.resources[resource]) || 0, toBefore = qty(b.resources[resource]) || 0;
      a.resources[resource] = fromBefore - n; b.resources[resource] = toBefore + n;
      pending = { op: 'transfer', resource: resource, amount: n,
        fromKind: fromKind, fromName: clean(fromName, 60), fromBefore: fromBefore, fromAfter: fromBefore - n,
        toKind: toKind, toName: clean(toName, 60), toBefore: toBefore, toAfter: toBefore + n };
      if (!a.resources[resource]) delete a.resources[resource];
      out = { ok: true, id: resource, amount: n };
    }, 'org:transfer');
    if (out && out.ok) { stat.transfers++; stat.lastReason = 'transferred'; noteJournal(pending); } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function canAfford(kind, name, item, amount) {
    const row = holder(kind, name); if (!row) return false;
    return (stockOf(row)[clean(item, 30)] || 0) >= qty(amount);
  }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const lines = [];
    ((state().evolution || {}).factions || []).forEach(function (f) {
      const keys = Object.keys(stockOf(f)).slice(0, cfg.maxItems);
      if (keys.length) lines.push(f.name + '：' + keys.map(function (k) { return k + stockOf(f)[k]; }).join('、'));
    });
    Object.values(state().people || {}).slice(0, cfg.maxItems).forEach(function (p) {
      const keys = Object.keys(stockOf(p)).slice(0, cfg.maxItems);
      if (keys.length) lines.push(p.name + '：' + keys.map(function (k) { return k + stockOf(p)[k]; }).join('、'));
    });
    return lines.length ? '[资源与组织]\n' + lines.slice(0, cfg.maxItems + 2).join('\n') + '\n资源不足时不得完成转移或消耗；不得凭空增加库存。' : '';
  }
  // ── v2.92.0（O5）：资源账本读数（存量 / 流量 / 笔数 / 异常笔）──
  function qtyOf(kind, name, resource) {
    const row = holder(kind, name);
    return row ? (qty(stockOf(row)[resource]) || 0) : null;
  }
  /** 异常笔单列：负库存 / 前后值漂移 / 超额支付。**不猜**——逐笔按算术判。 */
  function anomalies() {
    const out = { stockDrift: [], negativeStock: [], overpay: [], count: 0 };
    journal.forEach(function (r, i) {
      const amt = qty(r.amount);
      const side = function (s) {
        const before = r[s + 'Before'], after = r[s + 'After'];
        const who = (s === 'to' ? r.toKind : r.fromKind) + ':' + (s === 'to' ? r.toName : r.fromName);
        const sign = s === 'to' ? 1 : -1;
        if (typeof before === 'number' && typeof after === 'number' && (before + sign * amt) !== after) {
          out.stockDrift.push({ i: i, op: r.op, resource: r.resource, side: s, who: who, expect: before + sign * amt, got: after });
        }
        if (typeof after === 'number' && after < 0) {
          out.negativeStock.push({ i: i, op: r.op, resource: r.resource, side: s, who: who, got: after });
        }
        if (s === 'from' && typeof before === 'number' && amt > before) {
          out.overpay.push({ i: i, op: r.op, resource: r.resource, who: who, want: amt, have: before });
        }
      };
      side('to');
      if (r.op === 'transfer') side('from');
    });
    out.count = out.stockDrift.length + out.negativeStock.length + out.overpay.length;
    return out;
  }
  /** 对账：把流水逐笔串起来，核对「这笔的 before == 上一笔的 after」，再与当前存量比对。
   *  基线照实：链首那笔的 before 没有上游可核（环形挤出后更无从核起）——如实报 truncated。 */
  function reconcile() {
    const breaks = [];
    const last = {};
    const has = function (k) { return Object.prototype.hasOwnProperty.call(last, k); };
    const kOf = function (kind, name, resource) { return kind + '|' + name + '|' + resource; };
    journal.forEach(function (r, i) {
      const sides = [['to', r.toKind, r.toName, r.toBefore, r.toAfter]];
      if (r.op === 'transfer') sides.push(['from', r.fromKind, r.fromName, r.fromBefore, r.fromAfter]);
      sides.forEach(function (s) {
        const k = kOf(s[1], s[2], r.resource), before = s[3], after = s[4];
        if (has(k) && typeof before === 'number' && before !== last[k]) {
          breaks.push({ i: i, why: 'chain', key: k, expect: last[k], got: before });
        }
        last[k] = after;
      });
    });
    const gone = [];
    Object.keys(last).forEach(function (k) {
      const parts = k.split('|');
      const cur = qtyOf(parts[0], parts[1], parts[2]);
      if (cur === null) { gone.push(k); return; }
      if (cur !== last[k]) breaks.push({ i: -1, why: 'vs-stock', key: k, expect: last[k], got: cur });
    });
    return {
      ok: breaks.length === 0, checked: journal.length, breaks: breaks.slice(0, 20), breakCount: breaks.length,
      baseline: journalStat.dropped > 0 ? 'truncated' : 'journal-head', truncated: journalStat.dropped > 0,
      holderGone: gone.slice(0, 10)
    };
  }
  /** 只读账本视图：存量（逐持有者逐资源）+ 流量（流入 / 流出 / 净）+ 笔数 + 异常笔 + 对账。 */
  function ledgerView() {
    const st = state();
    const holders = [];
    const push = function (kind, name, res) {
      const items = Object.keys(stockOf({ resources: res })).map(function (k) { return { id: k, qty: qty(res[k]) }; })
        .filter(function (x) { return x.qty > 0; });
      if (items.length) holders.push({ kind: kind, name: name, items: items, total: items.reduce(function (a, b) { return a + b.qty; }, 0) });
    };
    (((st.evolution || {}).factions) || []).forEach(function (f) { if (f) push('faction', clean(f.name, 40), stockOf(f)); });
    Object.keys(st.people || {}).forEach(function (k) { const p = st.people[k]; if (p) push('person', clean(p.name || k, 60), stockOf(p)); });
    let inflow = 0, outflow = 0;
    journal.forEach(function (r) { inflow += qty(r.amount); if (r.op === 'transfer') outflow += qty(r.amount); });
    return {
      enabled: !!settings().enabled,
      holderCount: holders.length, holders: holders.slice(0, 20),
      entries: journal.length, recorded: journalStat.recorded, dropped: journalStat.dropped, cap: JOURNAL_CAP,
      flow: { in: inflow, out: outflow, net: inflow - outflow },
      anomalies: anomalies(),
      reconciled: reconcile()
    };
  }

  WA.org = {
    KINDS: ['faction', 'person'],
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    grant: grant, transfer: transfer, canAfford: canAfford, stockOf: stockOf, buildBlock: buildBlock,
    // v2.92.0（O5）：账本读数两口。ledgerView → 诊断 secOrg + 面板「资源账本」按钮；
    //   reconcile → 诊断 secOrg（跨文件消费方）。**纯读**：不跑引擎、不改存档、不注入。
    ledgerView: ledgerView, reconcile: reconcile,
    stat: function () { return Object.assign({}, stat); }
  };
})();

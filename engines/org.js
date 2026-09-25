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
    let out = null;
    WA.store.transact(function (draft) {
      const row = holder(kind, name, draft);
      if (!row) { out = { ok: false, reason: 'missing-holder' }; return false; }
      row.resources = stockOf(row);
      row.resources[resource] = (qty(row.resources[resource]) || 0) + n;
      row.updatedAt = clockNow('org');
      out = { ok: true, id: resource, amount: row.resources[resource] };
    }, 'org:grant');
    if (out && out.ok) { stat.grants++; stat.lastReason = 'granted'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function transfer(fromKind, fromName, toKind, toName, item, amount) {
    const resource = clean(item, 30), n = qty(amount);
    if (!resource || !n) return { ok: false, reason: 'bad-resource' };
    const from = holder(fromKind, fromName), to = holder(toKind, toName);
    if (!from || !to || (fromKind === toKind && clean(fromName, 60) === clean(toName, 60))) return { ok: false, reason: 'missing-holder' };
    if ((stockOf(from)[resource] || 0) < n) { stat.blocked++; stat.lastReason = 'insufficient'; return { ok: false, reason: 'insufficient' }; }
    let out = null;
    WA.store.transact(function (draft) {
      const a = holder(fromKind, fromName, draft), b = holder(toKind, toName, draft);
      if (!a || !b) { out = { ok: false, reason: 'missing-holder' }; return false; }
      a.resources = stockOf(a); b.resources = stockOf(b);
      if ((a.resources[resource] || 0) < n) { out = { ok: false, reason: 'insufficient' }; return false; }
      a.resources[resource] -= n; b.resources[resource] = (b.resources[resource] || 0) + n;
      if (!a.resources[resource]) delete a.resources[resource];
      out = { ok: true, id: resource, amount: n };
    }, 'org:transfer');
    if (out && out.ok) { stat.transfers++; stat.lastReason = 'transferred'; } else stat.blocked++;
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
  WA.org = {
    KINDS: ['faction', 'person'],
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    grant: grant, transfer: transfer, canAfford: canAfford, stockOf: stockOf, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat); }
  };
})();

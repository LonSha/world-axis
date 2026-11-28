/**
 * WorldAxis engines/lost-and-found.js (v2.416.0) — EXV24-6 失物招领
 *
 * ── 物品丢了会怎样？此前全仓 0 命中。物品可由 gear/personal-inventory 声明存在，
 *   但丢了之后：有人捡到上交、有人私吞、失主认领要说出物证 —— 这一层没有。
 *
 * ── 机制 ── `reportLoss` 报失 → `logFound` 拾获（上交/私吞两途，私吞入账但留痕）
 *   → `claim` 认领（须说出物证，说不出不还）。
 *
 * ── 边界 ── ① 只写当前聊天存档。② 认领凭据是硬门禁：物证（distinguisher）为空一律拒收
 *   `missing-distinguisher` —— 说不出物证的不还，交给叙事去演冒领冲突。③ 条数有界。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_lost_found_settings_v1';
  const DEF = { enabled: true, maxRows: 32 };
  const __REG = { key: LS_KEY, def: DEF, module: 'lostFound', bounds: { maxRows: [8, 96] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})));
  }
  const stat = { reported: 0, found: 0, claimed: 0, pocketed: 0, refused: 0, lastReason: '' };
  // Stored with the chat and its floor snapshots. No process-global fallback or import of unattributed rows.
  function saved() { return WA.store?.get?.()?.lostFound || {}; }
  function update(fn) {
    let result;
    const tx = WA.store?.transact?.(draft => {
      const b = draft.lostFound || (draft.lostFound = {rows:[],seq:0});
      if (!Array.isArray(b.rows)) b.rows = [];
      result = fn(b);
      return result.ok || result.reason === 'claim-rejected';
    }, 'lostFound:update');
    if (result && !result.ok && result.reason !== 'claim-rejected') return result;
    if (!tx?.ok || !result) return {ok:false,reason:'store-unavailable'};
    return Object.assign(result,{deferred:!!tx.deferred,persisted:tx.persisted});
  }
  function str(v, max) { return String(v == null ? '' : v).trim().slice(0,max || 120); }
  function refuse(code) { stat.refused++; stat.lastReason = code; return {ok:false,hint:code}; }
  function reportLoss(spec) {
    const cfg = settings(); if (!cfg.enabled) return {ok:false,reason:'disabled'};
    const s = spec || {}, who = str(s.who), what = str(s.what);
    if (!who || !what) return refuse('missing-party');
    const result = update(b => {
      let seq = Number.isSafeInteger(b.seq) ? b.seq : 0;
      while (b.rows.some(r => r.id === 'lf' + (seq+1))) seq++;
      const id = 'lf' + (b.seq = seq+1);
      b.rows.push({id,who,what,where:str(s.where),lostAt:s.at || null,status:'lost',finder:null,disposition:null,claimants:[]});
      if (WA.evict) WA.evict.array(b.rows, 'lostFound.rows', cfg.maxRows);
      else b.rows.splice(0,Math.max(0,b.rows.length-cfg.maxRows));
      return {ok:true,id};
    });
    if (result.ok) stat.reported++; return result;
  }
  function logFound(id, spec) {
    if (!settings().enabled) return {ok:false,reason:'disabled'};
    const s = spec || {}, finder = str(s.finder), disposition = str(s.disposition);
    const result = update(b => {
      const r = b.rows.find(x => x.id === str(id) && x.status === 'lost');
      if (!r) return refuse('unknown-item');
      if (!finder) return refuse('missing-finder');
      if (!['surrender','pocketed'].includes(disposition)) return refuse('unknown-disposition');
      r.finder = finder; r.disposition = disposition;
      r.status = disposition === 'surrender' ? 'found' : 'closed-pocketed';
      return {ok:true,id:r.id,status:r.status,toClaim:r.status === 'found'};
    });
    if (result.ok) stat[result.toClaim ? 'found' : 'pocketed']++; return result;
  }
  function claim(id, spec) {
    if (!settings().enabled) return {ok:false,reason:'disabled'};
    const s = spec || {}, by = str(s.by), proof = str(s.distinguisher);
    const result = update(b => {
      const r = b.rows.find(x => x.id === str(id) && x.status === 'found');
      if (!r) return refuse('unknown-item');
      if (!by) return refuse('missing-by');
      if (!proof) return refuse('missing-distinguisher');
      r.claimants.push({by,proof,at:s.at || null,ok:r.who === by});
      r.claimants.splice(0,Math.max(0,r.claimants.length-32));
      if (r.who !== by) return {ok:false,reason:'claim-rejected',hint:'claim-rejected：认领未通过，凭据已留痕'};
      r.status = 'claimed'; return {ok:true,id:r.id,by};
    });
    if (result.ok) stat.claimed++; return result;
  }
  function view(id) {
    const rows = saved().rows || [];
    if (id) { const rec = rows.find(r => r.id === str(id)); return rec ? {ok:true,row:JSON.parse(JSON.stringify(rec))} : {ok:false,hint:'unknown-item'}; }
    return {ok:true,count:rows.length,rows:JSON.parse(JSON.stringify(rows))};
  }
  function statView() { return Object.assign({open:(saved().rows || []).filter(r => r.status === 'lost' || r.status === 'found').length},stat); }
  function reset() {
    const result = update(b => { b.rows.length = 0; return {ok:true}; });
    if (result.ok) Object.assign(stat,{reported:0,found:0,claimed:0,pocketed:0,refused:0,lastReason:''});
    return result;
  }
  WA.lostFound = {
    reportLoss: reportLoss, logFound: logFound, claim: claim, view: view, stat: statView, reset: reset,
    setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/lost-and-found.js', { kind: 'engine', ver: '2.416.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/lost-and-found 已加载（2.416.0）');
})();
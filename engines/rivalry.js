/**
 * WorldAxis engines/rivalry.js (v2.70.0)
 * 竞争焦点：三方注意力与资源竞争矩阵。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_rivalry_settings_v1';
  const DEF = { enabled: false, maxRows: 16 };
  const __REG = { key: LS_KEY, def: DEF, module: 'rivalry', bounds: { maxRows: [4, 32] } };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function rows() {
    const s = (WA.store && WA.store.get()) || {};
    return (s.rivalry && s.rivalry.rows) || [];
  }

  function makeKey(a, b, target) {
    const pair = [a, b].sort().join('&');
    return pair + '>>' + target;
  }

  function declare(charA, charB, target, weight, opts) {
    if (!settings().enabled) return { ok: true, reason: 'disabled' };
    if (!charA || !charB || !target) return { ok: false, reason: 'missing-fields' };
    if (charA === charB || charA === target || charB === target) return { ok: false, reason: 'invalid-actors' };

    // v2.78.0: 修前非数 weight 静默降级 50（bad-weight 存而在但只在 0..100 外可达，即「码不可达」）。
    //   现在：缺省仍为 50；但一旦给了值，就必须是有限数且落在域内，否则如实报 bad-weight。
    const w = (weight === undefined || weight === null) ? 50 : weight;
    if (typeof w !== 'number' || !isFinite(w) || w < 0 || w > 100) return { ok: false, reason: 'bad-weight', got: weight };

    const key = makeKey(charA, charB, target);
    let out = null;
    WA.store.transact(function (draft) {
      if (!draft.rivalry) draft.rivalry = { rows: [] };
      const list = draft.rivalry.rows || [];
      const existing = list.filter(function (r) { return r && r.key === key; })[0];
      const record = {
        key: key,
        charA: charA,
        charB: charB,
        target: target,
        weight: w,
        lastFavour: (opts && opts.initialFavour) || 'neutral',
        at: clockNow('rivalry')
      };
      if (existing) Object.assign(existing, record);
      else list.push(record);
      if (WA.evict) WA.evict.array(list, 'rivalry.rows');
      out = { ok: true, key: key, weight: w };
    }, 'rivalry.declare');
    return out;
  }

  function modulate(favouredChar, target, favourScore) {
    if (!settings().enabled) return { ok: true, reason: 'disabled' };
    if (!favouredChar || !target) return { ok: false, reason: 'missing-fields' };
    const score = (typeof favourScore === 'number' && isFinite(favourScore)) ? favourScore : 10;

    const list = rows().filter(function (r) {
      return r && r.target === target && (r.charA === favouredChar || r.charB === favouredChar);
    });
    if (!list.length) return { ok: false, reason: 'missing', favoured: favouredChar, target: target };

    const feedback = [];
    WA.store.transact(function (draft) {
      const dList = (draft.rivalry && draft.rivalry.rows) || [];
      list.forEach(function (hit) {
        const rival = (hit.charA === favouredChar) ? hit.charB : hit.charA;
        const penalty = Math.round(score * (hit.weight / 100));
        const rec = dList.filter(function (r) { return r && r.key === hit.key; })[0];
        if (rec) {
          rec.lastFavour = favouredChar;
          rec.at = clockNow('rivalry');
        }
        feedback.push({ rival: rival, penalty: penalty, weight: hit.weight });
      });
    }, 'rivalry.modulate');
    return { ok: true, favoured: favouredChar, target: target, feedback: feedback };
  }

  function retire(charA, charB, target) {
    if (!charA || !charB || !target) return { ok: false, reason: 'missing-fields' };
    const key = makeKey(charA, charB, target);
    let out = null;
    WA.store.transact(function (draft) {
      if (!draft.rivalry) draft.rivalry = { rows: [] };
      const list = draft.rivalry.rows || [];
      const idx = list.findIndex(function (r) { return r && r.key === key; });
      if (idx < 0) { out = { ok: false, reason: 'missing', key: key }; return; }
      list.splice(idx, 1);
      out = { ok: true, retired: key };
    }, 'rivalry.retire');
    return out;
  }

  function read(target) {
    if (!target) return { ok: false, reason: 'missing-fields' };
    const hits = rows().filter(function (r) { return r && r.target === target; });
    return { ok: true, target: target, count: hits.length, rivalries: hits };
  }

  function buildBlock() {
    if (!settings().enabled) return '';
    const list = rows().filter(function (r) { return r && r.key; });
    if (!list.length) return '';
    const lines = ['[竞争焦点] 三方资源与注意力竞争矩阵：'];
    list.forEach(function (r) {
      lines.push('· 焦点目标「' + r.target + '」 ｜ 竞对: ' + r.charA + ' VS ' + r.charB + '（烈度: ' + r.weight + '）');
    });
    return lines.join('\n');
  }

  WA.rivalry = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    declare: declare,
    modulate: modulate,
    retire: retire,
    read: read,
    buildBlock: buildBlock
  };
})();

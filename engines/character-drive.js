/**
 * WorldAxis engines/character-drive.js — 叙事脊柱 L4「人物驱动力」（v2.542.5）
 *
 * 【它治的病】L1 的 `stakes`（这一幕赌的是什么）此前一直是 null，因为「赌注」不是从
 *   剧情里读出来的，是从**人**身上读出来的：他想要什么、怕什么、哪条线不能越。
 *   没有这三样，正文模型只知道「发生了什么事」，不知道「这事对他意味着什么」。
 *
 * 【只推导，不改人】本模块**不写 store**：`people[id].drive` 若已显式存在就用它；
 *   否则在本轮现场推导，并把每个值的出处写进 `sources`。理由：把推导结果写回人物档案，
 *   等于让一个读图层的模块去改世界状态，且下次读到的就不再是「画像」而是「我上次的推断」。
 *
 * 【三条映射，能对上就对，对不上就空着（与 L1 的 skipped 同规）】
 *   want  ← people[id].drive.want ｜ people[id].intent        （意图就是「想要什么」的真字段）
 *   line  ← people[id].drive.line ｜ people[id].behaviorBoundaries（边界就是「不能越的线」的真字段）
 *   fear  ← people[id].drive.fear ｜ **无真字段**               （画像里没有 fear / dread / 之类的槽）
 *           ⇒ 本版**永远推不出来**，如实返回 null 并点名 'fear:no-field'。
 *           文档 §7 说可以「让模型补全」——那要在推演 prompt 里加一段，属另一次行为变更；
 *           本批不做，避免顺手改 prompt（本仓对 prompt 有独立判据面）。
 *
 * 【「触碰底线」的判定只认字面包含】`line` 非空、且本幕条目的 what/问题文本**字面上包含**该
 *   line 的关键词时才算触碰。字面判据会漏（同义表达抓不到），但不会冤——漏了只是没加压，
 *   冤了就是凭空把节奏拧到 press。宁可漏，不可冤。
 */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const VERSION = '2.542.5';
  const LS_KEY = 'worldaxis_character_drive_settings_v1';
  const DEF = { enabled: false, maxText: 40, lineTouchPace: 'press' };
  const __REG = { key: LS_KEY, def: DEF, module: 'characterDrive' };
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const __stat = { derives: 0, withWant: 0, withLine: 0, withFear: 0, lineHits: 0, lastAt: 0, faults: {} };

  function fault(face, e) { __stat.faults[face] = String((e && e.message) || e).slice(0, 120); }
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    try { return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {})); }
    catch (e) { fault('settings', e); return Object.assign({}, DEF); }
  }
  function clip(s, n) {
    const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    const cap = Math.max(4, Number(n) || DEF.maxText);
    return t.length > cap ? t.slice(0, cap) : t;
  }
  function person(s, id) {
    if (!s || !s.people || !id) return null;
    return s.people[id] || null;
  }

  /**
   * derive(id, store) — 只读推导。
   * 返回 { ok, id, name, want, fear, line, sources:{want,fear,line}, skipped[] }
   */
  function derive(id, storeLike) {
    const cfg = settings();
    const s = storeLike || (function () { try { return (WA.store && WA.store.get && WA.store.get()) || {}; } catch (e) { fault('store', e); return {}; } })();
    const p = person(s, id);
    const skipped = [];
    if (!p) return { ok: false, id: String(id || ''), reason: 'no-such-person', skipped: [{ face: 'people', reason: 'absent:' + String(id || '') }] };
    const drive = (p.drive && typeof p.drive === 'object') ? p.drive : {};
    const want = clip(drive.want || p.intent || '', cfg.maxText);
    const line = clip(drive.line || p.behaviorBoundaries || '', cfg.maxText);
    const fear = clip(drive.fear || '', cfg.maxText);
    const sources = {
      want: drive.want ? 'people[id].drive.want' : (p.intent ? 'people[id].intent' : 'none'),
      line: drive.line ? 'people[id].drive.line' : (p.behaviorBoundaries ? 'people[id].behaviorBoundaries' : 'none'),
      fear: drive.fear ? 'people[id].drive.fear' : 'none'
    };
    if (!want) skipped.push({ face: 'want', reason: 'no-field' });
    if (!fear) skipped.push({ face: 'fear', reason: 'no-field' });
    if (!line) skipped.push({ face: 'line', reason: 'no-field' });
    __stat.derives += 1; __stat.lastAt = Date.now();
    if (want) __stat.withWant += 1;
    if (line) __stat.withLine += 1;
    if (fear) __stat.withFear += 1;
    return {
      ok: true, id: String(id || ''), name: clip(p.name || String(id || '').replace(/^p_/, ''), 24),
      want: want || null, fear: fear || null, line: line || null,
      sources: sources, skipped: skipped
    };
  }

  /**
   * stakesOf(id, store) — 给 L1 用的筹码：两侧都只有「真字段」才出。
   * 返回 null 表示「一个都取不到」⇒ 调用方应把 stakes 留成 null（不编一行空话）。
   */
  function stakesOf(id, storeLike) {
    const cfg = settings();
    if (!cfg.enabled) return null;
    const d = derive(id, storeLike);
    if (!d.ok) return null;
    if (!d.want && !d.fear) return null;
    const stake = { id: d.id, name: d.name, sources: d.sources, partial: !(d.want && d.fear) };
    if (d.want) stake.win = '争取到：' + d.want;
    if (d.fear) stake.lose = '失手：' + d.fear;
    return stake;
  }

  /**
   * touchesLine(id, text, store) — 字面判据。返回 {hit:boolean, line, word}。
   * 只有 line 与 text 都非空时才可能 hit；判据是「text 里含 line」或「line 里含 text 的全部实词」的前半条。
   */
  function touchesLine(id, text, storeLike) {
    const cfg = settings();
    if (!cfg.enabled) return { hit: false, reason: 'disabled' };
    const d = derive(id, storeLike);
    if (!d.ok || !d.line) return { hit: false, reason: 'no-line' };
    const t = String(text || '');
    if (!t) return { hit: false, reason: 'no-text' };
    if (t.indexOf(d.line) >= 0) { __stat.lineHits += 1; return { hit: true, line: d.line, word: d.line }; }
    return { hit: false, line: d.line };
  }

  WA.characterDrive = {
    VERSION: VERSION,
    derive: derive,
    stakes: stakesOf,
    touchesLine: touchesLine,
    getSettings: function () { return settings(); },
    setSettings: function (patch) {
      if (!WA.settingsBus) return { ok: false, reason: 'settings-bus-absent' };
      try {
        const next = WA.settingsBus.normalize(__REG, Object.assign({}, DEF, settings(), patch || {}));
        WA.settingsBus.saveOrThrow(__REG, next);
        return { ok: true, settings: settings() };
      } catch (e) { return { ok: false, reason: 'save-failed', error: String((e && e.message) || e) }; }
    },
    stat: function () { return Object.assign({}, __stat, { faults: Object.assign({}, __stat.faults), enabled: settings().enabled }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/character-drive.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/character-drive 已加载（' + VERSION + '）');
})();
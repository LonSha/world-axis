/**
 * WorldAxis engines/relation-temp.js (v2.267.0) — 关系温度计：这段关系为什么变了
 *
 * 【EXV6-3】复用六型关系（bonds.js）与好感审计（fondness.js）：
 *   呈现这一轮变暖或变冷的原因，原因引用真实事件记录，不编造。
 *
 * 【设计纪律】
 *   ① 纯读聚合，零新容器：绝不新建第二套好感/关系存储，直接从既有 owner 的只读读口与 store 聚合；
 *   ② 真实依据，绝不编造：若有变动原因（history.reason）如实带出；若无事件记录，
 *      说明「近期无事件记录 / 关系平稳」，绝不生成虚构情节；
 *   ③ 结构与温度正交：六型（替身/寄生拯救/主权让渡/利益同盟/平行共存/对手共生）是结构，
 *      好感与信任是温度，两者分列清晰不混为一谈；
 *   ④ 变暖与变冷：严格依据数值步进方向（delta > 0 为升温 warmer，delta < 0 为降温 colder，
 *      delta === 0 为恒温 steady），不主观臆断。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};
  const LS_KEY = 'worldaxis_relation_temp_settings_v1';
  const DEF = {
    enabled: true,
    maxPeople: 4,          // 概览页最多展示几位人物的关系
    showTypes: true,        // 是否展示关系六型结构
    showReason: true        // 是否展示变动原因与事件依据
  };
  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'relationTemp',
    bounds: { maxPeople: [1, 10] }
  };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function settings() {
    if (WA.settingsBus && typeof WA.settingsBus.read === 'function') {
      const raw = WA.settingsBus.read(__REG);
      const merged = Object.assign({}, DEF, raw || {});
      return typeof WA.settingsBus.normalize === 'function' ? WA.settingsBus.normalize(__REG, merged) : merged;
    }
    return Object.assign({}, DEF);
  }

  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    if (WA.settingsBus && typeof WA.settingsBus.saveOrThrow === 'function') {
      const norm = typeof WA.settingsBus.normalize === 'function' ? WA.settingsBus.normalize(__REG, merged) : merged;
      return WA.settingsBus.saveOrThrow(__REG, norm);
    }
    return merged;
  }

  const __stat = {
    builds: 0,
    linesEmitted: 0,
    emptyBuilds: 0,
    warmerCount: 0,
    colderCount: 0,
    steadyCount: 0,
    lastReason: '',
    faults: {}
  };

  function fault(k) { __stat.faults[k] = (__stat.faults[k] || 0) + 1; }

  function safe(fn, fb) {
    try { const v = fn(); return v === undefined ? fb : v; } catch (e) { fault('read-threw'); return fb; }
  }

  function txt(v, max) {
    const s = (v === null || v === undefined) ? '' : String(v);
    return s.replace(/\s+/g, ' ').trim().slice(0, max || 60);
  }

  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; }

  /**
   * 收集某人的六型关系标签
   */
  function getBondTypes(person, player) {
    const b = safe(function () {
      const st = WA.store && typeof WA.store.get === 'function' ? WA.store.get() : null;
      return (st && st.bonds && Array.isArray(st.bonds.rows)) ? st.bonds.rows : [];
    }, []);
    const types = [];
    const who = txt(person, 40);
    const ply = txt(player, 40);
    for (let i = 0; i < b.length; i++) {
      const r = b[i];
      if (!r || !Array.isArray(r.types)) continue;
      if (ply) {
        if ((r.a === who && r.b === ply) || (r.a === ply && r.b === who)) {
          r.types.forEach(function (t) { if (types.indexOf(t) < 0) types.push(t); });
        }
      } else {
        if (r.a === who || r.b === who) {
          r.types.forEach(function (t) { if (types.indexOf(t) < 0) types.push(t); });
        }
      }
    }
    return types;
  }

  /**
   * 构建关系温度条目与人话说明
   */
  function build(opts) {
    const o = opts || {};
    const cfg = settings();
    __stat.builds++;
    if (!cfg.enabled) {
      __stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled', quiet: true, hint: '关系温度计已关闭', items: [], lines: [], line: '关系温度计已关闭' };
    }

    const st = safe(function () {
      return WA.store && typeof WA.store.get === 'function' ? WA.store.get() : null;
    }, null);

    if (!st) {
      __stat.emptyBuilds++;
      __stat.lastReason = 'store-absent';
      return { ok: false, reason: 'store-absent', quiet: true, hint: '数据暂不可用', items: [], lines: [], line: '数据暂不可用' };
    }

    // 获取玩家名（优先 worldBridge）
    let player = safe(function () {
      const wk = WA.worldBridge && typeof WA.worldBridge.worldKey === 'function' ? WA.worldBridge.worldKey() : null;
      if (wk && wk.player) return txt(wk.player, 40);
      const s = WA.store && typeof WA.store.get === 'function' ? WA.store.get() : null;
      if (s && s.player && s.player.name) return txt(s.player.name, 40);
      return '';
    }, '');

    const DEFAULT_PLAYERS = ['玩家', 'player', 'User', 'user', '你', '我'];
    if (!player && o.player) player = txt(o.player, 40);

    const fRows = (st.fondness && Array.isArray(st.fondness.rows)) ? st.fondness.rows : [];
    const bRows = (st.bonds && Array.isArray(st.bonds.rows)) ? st.bonds.rows : [];

    // 收集所有涉及的人物名
    const peopleMap = {};
    fRows.forEach(function (r) {
      if (r && r.person) peopleMap[txt(r.person, 40)] = true;
    });
    bRows.forEach(function (r) {
      if (!r) return;
      if (r.a && r.a !== player) peopleMap[txt(r.a, 40)] = true;
      if (r.b && r.b !== player) peopleMap[txt(r.b, 40)] = true;
    });
    delete peopleMap[''];
    if (player) delete peopleMap[player];
    DEFAULT_PLAYERS.forEach(function (p) { delete peopleMap[p]; });

    const people = Object.keys(peopleMap);
    if (!people.length) {
      __stat.emptyBuilds++;
      __stat.lastReason = 'no-records';
      return {
        ok: true,
        quiet: true,
        reason: 'no-records',
        hint: '暂无记录在案的关系变化 —— 并非形同陌路，是好感与关系尚未结算',
        items: [],
        lines: [],
        line: '暂无记录在案的关系变化 —— 并非形同陌路，是好感与关系尚未结算'
      };
    }

    const items = [];
    people.forEach(function (who) {
      const fRow = fRows.filter(function (r) { return r && r.person === who; })[0];
      const val = fRow ? num(fRow.value) : 0;
      const trust = fRow && fRow.trust != null ? num(fRow.trust) : null;
      const note = fRow ? txt(fRow.note, 60) : '';

      // 计算区间 band
      let band = '未评定';
      if (WA.fondness && Array.isArray(WA.fondness.BANDS)) {
        for (let i = 0; i < WA.fondness.BANDS.length; i++) {
          const b = WA.fondness.BANDS[i];
          if (val >= b.lo && val <= b.hi) { band = b.name; break; }
        }
      }

      // 最近一次变动
      let delta = 0;
      let dir = 'steady';
      let reason = '';
      let histKind = '';
      if (fRow && Array.isArray(fRow.history) && fRow.history.length > 0) {
        const lastH = fRow.history[fRow.history.length - 1];
        if (lastH) {
          delta = +(num(lastH.to) - num(lastH.from)).toFixed(1);
          dir = delta > 0 ? 'warmer' : (delta < 0 ? 'colder' : 'steady');
          reason = txt(lastH.reason, 80);
          histKind = txt(lastH.kind, 20);
        }
      }

      if (dir === 'warmer') __stat.warmerCount++;
      else if (dir === 'colder') __stat.colderCount++;
      else __stat.steadyCount++;

      const types = getBondTypes(who, player);

      // 人话文本拼接
      let desc = who + '：温度 ' + val.toFixed(1) + '（' + band + '）';
      if (trust !== null) desc += '｜信任 ' + trust;
      if (cfg.showTypes && types.length) desc += '｜关系：' + types.join('、');
      if (cfg.showReason) {
        if (dir === 'warmer') {
          desc += ' ↗ 升温(+' + delta + ')' + (reason ? '：因「' + reason + '」' : '');
        } else if (dir === 'colder') {
          desc += ' ↘ 降温(' + delta + ')' + (reason ? '：因「' + reason + '」' : '');
        } else {
          desc += ' → 平稳' + (reason ? '（' + reason + '）' : '');
        }
      }

      items.push({
        person: who,
        value: val,
        band: band,
        trust: trust,
        note: note,
        types: types,
        delta: delta,
        dir: dir,
        reason: reason,
        kind: histKind,
        text: desc
      });
    });

    // 排序：绝对变动量大者优先，其次好感高者优先
    items.sort(function (a, b) {
      const da = Math.abs(a.delta);
      const db = Math.abs(b.delta);
      if (db !== da) return db - da;
      return b.value - a.value;
    });

    const cap = Math.max(1, Math.min(10, num(o.maxPeople) || cfg.maxPeople));
    const dropped = Math.max(0, items.length - cap);
    const visible = items.slice(0, cap);
    const lines = visible.map(function (it) { return it.text; });
    __stat.linesEmitted += lines.length;
    __stat.lastReason = 'built';

    return {
      ok: true,
      quiet: false,
      reason: 'built',
      items: visible,
      lines: lines,
      total: items.length,
      cap: cap,
      truncated: dropped > 0,
      dropped: dropped,
      line: (lines.length ? lines[0] : '关系暂无记录')
    };
  }


  function stat() {
    return Object.assign({}, __stat, {
      faults: Object.assign({}, __stat.faults),
      enabled: !!settings().enabled
    });
  }

  function reset() {
    __stat.builds = 0;
    __stat.linesEmitted = 0;
    __stat.emptyBuilds = 0;
    __stat.warmerCount = 0;
    __stat.colderCount = 0;
    __stat.steadyCount = 0;
    __stat.lastReason = '';
    __stat.faults = {};
    return true;
  }

  WA.relationTemp = {
    getSettings: settings,
    setSettings: saveSettings,
    build: build,
    stat: stat,
    reset: reset,
    DEF: Object.assign({}, DEF)
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/relation-temp.js', { kind: 'engine', ver: '2.267.0' });
  }
  if (WA.log) WA.log('info', '关系温度计已加载（只读聚合）');
})();
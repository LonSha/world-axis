/**
 * WorldAxis engines/fact-age.js (v2.529.0) — 世界事实的老化分层
 *
 * 病：长档里的事实只会被追加，不会被回看。一条「城东的桥塌了」写进存档之后，
 *   三十楼之后没人再提，它就既不是「活的」也不是「错的」—— 它是**陈的**。
 *   全库没有任何一处能回答：这份存档里哪些事实已经很久没被引用过？
 *   于是「引用一条八十楼前的设定」和「引用上一条设定」看起来一样，都没人提醒。
 *
 * 本模块只做三件事：
 *   ① `classify(age)` —— 把「距上次引用多少楼」分成四档（fresh / aging / stale / dead）；
 *   ② `plan(facts, nowTurn)` —— 给一批事实打档，**保持输入顺序**，数出每档几条；
 *   ③ `stat()` —— 记几个数（plan 了几次、几条没时间戳、几次配置被回绝）。
 *
 * 边界（都是否定式）
 *   1 这是**读数**不是**修改器**：不删事实、不改存档、不写盘。删不删由调用方决定。
 *   2 时间戳缺失（`lastTurn` 不是有限数）的事实单列 `unknown`，**不判 dead** ——
 *      没记时间不等于很久没提；把它算成死的，会让一份没带时间戳的老档全体阵亡。
 *   3 阈值必须**严格递增**（aging < stale < dead）。配成乱序时回落到默认并记一次
 *      fault，而不是就地接受 —— 乱序的阈值会让某一档永远空着，读数看着正常其实失效。
 *   4 边界值是**闭区间下界**：`age === aging` 归 aging（不是 fresh）。
 *   5 负数 age（时钟回退）按 0 算，不产出负数档。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  var VERSION = '2.529.0';
  var DEFAULTS = { aging: 20, stale: 60, dead: 120 };
  var settings = { aging: DEFAULTS.aging, stale: DEFAULTS.stale, dead: DEFAULTS.dead };
  var stat = { planned: 0, unknown: 0, faults: 0 };

  function snapshot() { return { aging: settings.aging, stale: settings.stale, dead: settings.dead }; }

  function strict(t) {
    return !!t && typeof t === 'object'
      && typeof t.aging === 'number' && isFinite(t.aging)
      && typeof t.stale === 'number' && isFinite(t.stale)
      && typeof t.dead === 'number' && isFinite(t.dead)
      && t.aging >= 0 && t.aging < t.stale && t.stale < t.dead;
  }

  function setSettings(patch) {
    var next = snapshot();
    var p = patch || {};
    for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k) && next[k] !== undefined) next[k] = p[k];
    if (!strict(next)) { stat.faults++; return snapshot(); }
    settings.aging = next.aging; settings.stale = next.stale; settings.dead = next.dead;
    return snapshot();
  }

  function classify(age) {
    var n = Number(age);
    if (!isFinite(n)) return 'unknown';
    var a = n < 0 ? 0 : n;
    if (a >= settings.dead) return 'dead';
    if (a >= settings.stale) return 'stale';
    if (a >= settings.aging) return 'aging';
    return 'fresh';
  }

  function plan(facts, nowTurn) {
    var rows = [];
    var counts = { fresh: 0, aging: 0, stale: 0, dead: 0, unknown: 0 };
    var ids = { stale: [], dead: [], unknown: [] };
    var now = Number(nowTurn);
    var nowOk = isFinite(now);
    var list = Array.isArray(facts) ? facts : [];
    for (var i = 0; i < list.length; i++) {
      var f = list[i] || {};
      var last = Number(f.lastTurn);
      var age = null;
      var level = 'unknown';
      if (nowOk && isFinite(last)) {
        age = now - last;
        if (age < 0) age = 0;
        level = classify(age);
      }
      counts[level]++;
      if (level === 'unknown') { stat.unknown++; ids.unknown.push(f.id); }
      else if (level === 'stale') ids.stale.push(f.id);
      else if (level === 'dead') ids.dead.push(f.id);
      rows.push({
        id: f.id,
        age: age,
        level: level,
        weight: f.weight === undefined ? 1 : f.weight,
        text: f.text
      });
    }
    stat.planned++;
    return { rows: rows, counts: counts, ids: ids, now: nowOk ? now : null };
  }

  WA.factAge = {
    version: VERSION,
    defaults: DEFAULTS,
    getSettings: snapshot,
    setSettings: setSettings,
    classify: classify,
    plan: plan,
    stat: function () {
      return { planned: stat.planned, unknown: stat.unknown, faults: stat.faults };
    }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/fact-age.js', { kind: 'engine', ver: VERSION });
})();

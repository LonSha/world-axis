/**
 * WorldAxis engines/hearsay-ledger.js (v2.524.0) — EXV28-09/10/11
 *   同一件事的几个版本 · 碎片拼图 · 对质时能落到「谁在何时何地听谁说的」
 *
 * ── 它治的病（本仓实测过的空洞）──────────────────────────────────────────
 *   1 一件真事在传播里会分叉成**几个版本**（谁在场、谁转述、谁编的），
 *     而既有 rumor 只管「传播强度」，不保留**版本本身**：两个 NPC 问到同一件事，
 *     拿到的永远是同一条正文 ⇒ 「信息不对称」只存在于「知道 / 不知道」两态，
 *     不存在「他听到的和她听到的不一样」。
 *   2 玩家想对质（"这话谁说的？"）时，没有任何地方记着**来路**：
 *     编码能追到"某人说的"，追不到"某年某地听某人说的、那人又是听谁说的"。
 *   3 碎片（线索）只有"存着"这一态：1 条也能让模型下结论，反证来了也不翻。
 *
 * ── 三条硬纪律 ───────────────────────────────────────────────────────
 *   ① 版本不合并：同一 `eventRef` 下允许多个版本，读口**按听者**返回；
 *      没有该听者的版本就如实 `unheard`（不许拿别人的版本顶替）。
 *   ② 对质只回溯已记的链：链缺环就返 `chain-broken` 并指出**断在哪一环**，
 *      不替玩家补一个"应该是他说的"。
 *   ③ 拼图缺块显式：`< minShards` 只回 `need-more`（列出还缺什么维度），
 *      被一条反证推翻就整块作废并留痕（`overturned`），不许静默改写结论。
 *
 * ── 落点（不新增顶层容器）────────────────────────────────────────────
 *   复用 `chronicle`（kind:'hearsay' 版本 / kind:'shard' 碎片 / kind:'oath' 无），
 *   与 trace-post 共用同一容器，读口按 kind 过滤，互不污染。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.524.0';
  const LS_KEY = 'worldaxis_hearsay_settings_v1';
  const DEF = { enabled: true, maxVersions: 6, minShards: 3, maxShards: 12 };
  const __REG = { key: LS_KEY, def: DEF, module: 'hearsayLedger',
    bounds: { maxVersions: [1, 24], minShards: [2, 6], maxShards: [4, 40] } };
  const stat = { versions: 0, traced: 0, assembled: 0, overturned: 0, refused: 0, lastReason: '' };
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function round() { try { return WA.evolution && WA.evolution.roundOf ? WA.evolution.roundOf() : 0; } catch (e) { return 0; } }
  function now() { try { return WA.clock.now('hearsayLedger'); } catch (e) { return Date.now(); } }
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n || 90) : ''; }
  function rows() {
    let d = {};
    try { d = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { d = {}; }
    return Array.isArray(d.chronicle) ? d.chronicle : [];
  }
  function pick(kind) { return rows().filter(function (x) { return x && x.kind === kind; }); }

  /** 版本：谁听到的版本是什么，各记一条（同 eventRef + 同 listener 覆盖为最新）。 */
  function version(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const eventRef = clean(s.eventRef, 60);
    const listener = clean(s.listener || s.who, 40);
    const content = clean(s.content || s.belief, 140);
    if (!eventRef) { stat.refused++; stat.lastReason = 'missing-event'; return { ok: false, reason: 'missing-event' }; }
    if (!listener) { stat.refused++; stat.lastReason = 'missing-listener'; return { ok: false, reason: 'missing-listener' }; }
    if (!content) { stat.refused++; stat.lastReason = 'missing-content'; return { ok: false, reason: 'missing-content' }; }
    const from = clean(s.from || s.via, 60);
    const where = clean(s.where, 40);
    const mine = pick('hearsay').filter(function (x) { return x.eventRef === eventRef; });
    if (mine.length >= cfg.maxVersions) { stat.refused++; stat.lastReason = 'too-many-versions'; return { ok: false, reason: 'too-many-versions', at: mine.length }; }
    const row = { id: 'hv_' + round() + '_' + (stat.versions + 1), kind: 'hearsay',
      eventRef: eventRef, listener: listener, content: content, from: from || 'unknown',
      where: where, round: round(), at: now(), overturned: false };
    let wrote = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.chronicle = Array.isArray(d.chronicle) ? d.chronicle : [];
          // 同一 listener 对同一件事只留最新一版（他改口了），旧的作废但留痕。
          d.chronicle.forEach(function (x) {
            if (x && x.kind === 'hearsay' && x.eventRef === eventRef && x.listener === listener) {
              x.supersededAt = now(); x.supersededBy = row.id;
            }
          });
          d.chronicle.push(row);
          return true;
        }, 'hearsay:version');
        wrote = true;
      }
    } catch (e) { wrote = false; }
    stat.versions++;
    return { ok: true, reason: wrote ? 'versioned' : 'versioned-no-store', id: row.id, eventRef: eventRef, listener: listener };
  }

  /** 按听者读：他有版本就是他的那一版；没有就是 unheard（不拿别人的顶替）。 */
  function heard(spec) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: true, known: false, reason: 'disabled', items: [] };
    const s = spec && typeof spec === 'object' ? spec : {};
    const eventRef = clean(s.eventRef, 60);
    const listener = clean(s.listener || s.who, 40);
    if (!eventRef) return { ok: false, reason: 'missing-event' };
    if (!listener) return { ok: false, reason: 'missing-listener' };
    const hit = pick('hearsay').filter(function (x) {
      return x.eventRef === eventRef && x.listener === listener && !x.overturned && !x.supersededAt;
    })[0];
    if (!hit) return { ok: true, known: false, reason: 'unheard', eventRef: eventRef, listener: listener };
    return { ok: true, known: true, content: hit.content, from: hit.from, where: hit.where, round: hit.round };
  }

  /** 两个版本差在哪：逐字比对，只报差异事实，不judge谁对。 */
  function diverge(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const eventRef = clean(s.eventRef, 60);
    const a = heard({ eventRef: eventRef, listener: clean(s.a, 40) });
    const b = heard({ eventRef: eventRef, listener: clean(s.b, 40) });
    if (!eventRef) return { ok: false, reason: 'missing-event' };
    if (!a.known || !b.known) {
      stat.refused++; stat.lastReason = 'unheard';
      return { ok: false, reason: 'unheard', a: a.known === true, b: b.known === true };
    }
    if (a.content === b.content) return { ok: true, same: true, text: '两人说法一致' };
    return { ok: true, same: false, a: a.content, b: b.content,
      text: '一个说「' + clean(a.content, 40) + '」，另一个说「' + clean(b.content, 40) + '」' };
  }

  /** 对质：把这条版本往上游走，落成「谁在何时何地听谁说的」；缺环就断。 */
  function trace(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = clean(s.id, 40);
    if (!id) return { ok: false, reason: 'missing-id' };
    const hit = pick('hearsay').filter(function (x) { return x.id === id; })[0];
    if (!hit) return { ok: false, reason: 'version-missing' };
    const chain = [{ listener: hit.listener, from: hit.from, where: hit.where, round: hit.round }];
    let cur = hit;
    let guard = 0;
    while (guard++ < 12) {
      const up = pick('hearsay').filter(function (x) {
        return x.listener === cur.from && x.round <= cur.round && x.id !== cur.id;
      }).sort(function (p, q) { return (q.round || 0) - (p.round || 0); })[0];
      if (!up) break;
      chain.push({ listener: up.listener, from: up.from, where: up.where, round: up.round });
      cur = up;
    }
    stat.traced++;
    const tail = chain[chain.length - 1];
    const broken = !tail.from || tail.from === 'unknown';
    return { ok: true, id: id, chain: chain.slice(0, 8),
      lines: chain.slice(0, 8).map(function (c) {
        return '第 ' + c.round + ' 轮，' + (c.where ? '在' + c.where + '，' : '') + c.listener + '听' + (c.from || '来路不明') + '说';
      }),
      reason: broken ? 'chain-broken' : 'traced',
      brokenAt: broken ? { listener: tail.listener, round: tail.round } : null };
  }

  /** 碎片：一条不下结论；够数才可拼；一条反证就整块作废并留痕。 */
  function shard(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const topic = clean(s.topic, 60);
    const text = clean(s.text || s.content, 120);
    const dim = clean(s.dim || s.aspect, 30);
    if (!topic) { stat.refused++; stat.lastReason = 'missing-topic'; return { ok: false, reason: 'missing-topic' }; }
    if (!text) { stat.refused++; stat.lastReason = 'missing-shard'; return { ok: false, reason: 'missing-shard' }; }
    if (!dim) { stat.refused++; stat.lastReason = 'missing-dimension'; return { ok: false, reason: 'missing-dimension' }; }
    const mine = pick('shard').filter(function (x) { return x.topic === topic; });
    if (mine.length >= cfg.maxShards) { stat.refused++; stat.lastReason = 'too-many-shards'; return { ok: false, reason: 'too-many-shards' }; }
    const row = { id: 'hs_' + round() + '_' + (stat.versions + 1), kind: 'shard', topic: topic,
      text: text, dim: dim, refutes: clean(s.refutes, 60), round: round(), at: now() };
    let wrote = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.chronicle = Array.isArray(d.chronicle) ? d.chronicle : [];
          d.chronicle.push(row);
          return true;
        }, 'hearsay:shard');
        wrote = true;
      }
    } catch (e) { wrote = false; }
    return { ok: true, reason: wrote ? 'sharded' : 'sharded-no-store', id: row.id, have: mine.length + 1 };
  }

  /** 拼图结论：缺块显式、够数才拼、有反证就先翻。 */
  function assemble(spec) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: true, known: false, reason: 'disabled' };
    const s = spec && typeof spec === 'object' ? spec : {};
    const topic = clean(s.topic, 60);
    if (!topic) return { ok: false, reason: 'missing-topic' };
    const mine = pick('shard').filter(function (x) { return x.topic === topic && !x.droppedAt; });
    const refuters = mine.filter(function (x) { return x.refutes; });
    if (refuters.length) {
      stat.overturned++;
      try {
        if (WA.store && WA.store.transact) {
          WA.store.transact(function (d) {
            (Array.isArray(d.chronicle) ? d.chronicle : []).forEach(function (x) {
              if (x && x.kind === 'shard' && x.topic === topic) x.droppedAt = now();
            });
            return true;
          }, 'hearsay:overturn');
        }
      } catch (e) { /* 留痕失败不伪造 */ }
      return { ok: true, known: true, reason: 'overturned', by: refuters[0].text, shards: mine.length };
    }
    const dims = {};
    mine.forEach(function (x) { if (x.dim) dims[x.dim] = true; });
    const have = Object.keys(dims);
    if (have.length < cfg.minShards) {
      return { ok: true, known: false, reason: 'need-more', have: have, need: cfg.minShards,
        missing: '还差 ' + (cfg.minShards - have.length) + ' 块（已有的维度：' + (have.join('、') || '无') + '）' };
    }
    stat.assembled++;
    return { ok: true, known: true, reason: 'assembled', dims: have, shards: mine.length,
      text: mine.map(function (x) { return x.text; }).slice(0, 6).join('；') };
  }

  function view() {
    const hv = pick('hearsay'), sh = pick('shard');
    return { enabled: settings().enabled, versions: hv.length,
      events: Object.keys(hv.reduce(function (m, x) { m[x.eventRef] = 1; return m; }, {})).length,
      shards: sh.filter(function (x) { return !x.droppedAt; }).length, stat: stat, block: buildBlock() };
  }
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const lines = [];
    const hv = pick('hearsay').filter(function (x) { return !x.overturned && !x.supersededAt; });
    const byEvent = {};
    hv.forEach(function (x) { (byEvent[x.eventRef] = byEvent[x.eventRef] || []).push(x); });
    Object.keys(byEvent).forEach(function (k) {
      const vs = byEvent[k];
      if (vs.length < 2 || lines.length >= 3) return;
      lines.push('- 同一件事，传出来两个版本：' + clean(vs[0].listener, 20) + '说「' + clean(vs[0].content, 30)
        + '」，' + clean(vs[1].listener, 20) + '说「' + clean(vs[1].content, 30) + '」');
    });
    const topics = {};
    pick('shard').forEach(function (x) { if (!x.droppedAt) (topics[x.topic] = topics[x.topic] || []).push(x); });
    Object.keys(topics).forEach(function (k) {
      const n = Object.keys(topics[k].reduce(function (m, x) { m[x.dim] = 1; return m; }, {})).length;
      if (n < 1 || lines.length >= 6) return;
      lines.push('- 关于「' + clean(k, 30) + '」手上有 ' + n + ' 块碎片（' + (n < cfg.minShards ? '还拼不出，别急着下结论' : '可以拼了') + '）');
    });
    return lines.length ? '[听来的 / 拼出来的]\n' + lines.join('\n') : '';
  }

  WA.hearsayLedger = {
    getSettings: settings,
    setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    version: version, heard: heard, diverge: diverge, trace: trace, shard: shard, assemble: assemble,
    view: view, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/hearsay-ledger.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/hearsay-ledger 已加载（' + VERSION + '）');
})();

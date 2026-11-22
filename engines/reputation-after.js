/**
 * WorldAxis engines/reputation-after.js (v2.524.0) — EXV29-20 身后名
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   `posthumous|身后名|名誉` **0 命中**：人一死，现场对他的评价就只剩正文里那一句，
 *   谁说的、凭什么说的、过几年翻没翻——一处都记不住。可死人恰恰**由活人改写**：
 *   同一句"他是个清官"，出殡时是这么说的，十年后翻案时是另一套说法。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   一条评价 = 关于谁（`subject`）+ 谁说的（`by`）+ 一句什么话（`label`）+ 凭什么（`source`）。
 *   `view({subject, deathAt})` 按死者那一刻切两段（**当时** / **后来**），分段累计并给出
 *   差（`swing`）——同一人两个时点两种评价，每一句都追得到来源与人。
 *
 * ── 缝合边界（否定式，每条都有判据咬）─────────────────────────────
 *   ① 无来源不算评价：`source` 不在四档或留空 ⇒ `missing-fields`（不替活人编依据）。
 *   ② 死人没法自辩：`by === subject` ⇒ `bad-scope`（身后名只能由活人写）。
 *   ③ 一人一票：同一 `subject|by` 再写 ⇒ 覆盖旧话并报 `revised:true`（不刷票）。
 *   ④ 权重只认 1–3：越界就夹回并如实说 `clamped`（不许悄悄加倍）。
 *   ⑤ 有界：最多 64 条（与 `__BOUNDED_CAPS` 对齐）。
 *   ⑥ 死期只记一次：`markDead` 之后 `view()` 不必每次传 `deathAt`（注入口也才说得出话）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const STORE_KEY = 'reputationAfter';
  const CAP = 64;
  const SOURCES = ['witnessed', 'document', 'hearsay', 'rumor'];
  const SCN = { witnessed: '亲眼所见', document: '文书为证', hearsay: '听人说的', rumor: '流言' };
  const stat = { noted: 0, revised: 0, refused: 0, badInput: 0 };
  let shadow = null;

  function refuse(code, extra) {
    stat.badInput++;
    return Object.assign({ ok: false, reason: code }, extra || {});
  }
  function readAll() {
    try {
      const all = WA.store && typeof WA.store.get === 'function' ? (WA.store.get() || {}) : {};
      const m = all[STORE_KEY];
      return (m && typeof m === 'object' && !Array.isArray(m)) ? m : (shadow || {});
    } catch (e) { return shadow || {}; }
  }
  function writeAll(m) {
    try {
      if (!WA.store || !WA.store.transact) { shadow = m; return false; }
      WA.store.transact(function (d) { d[STORE_KEY] = m; return true; }, 'rep:after');
      return true;
    } catch (e) { shadow = m; return false; }
  }
  function clean(v, max) {
    const s = (v === undefined || v === null) ? '' : String(v).trim();
    return s.slice(0, max || 60);
  }
  function nowAt() {
    try { return (function () { try { return WA.clock.now('repAfter'); } catch (e) { return Date.now(); } })(); }
    catch (e) { return Date.now(); }
  }
  function capIt(m) {
    const ks = Object.keys(m);
    if (ks.length <= CAP) return m;
    ks.sort(function (a, b) { return ((m[a].at || 0) - (m[b].at || 0)); });
    ks.slice(0, ks.length - CAP).forEach(function (k) { delete m[k]; });
    return m;
  }

  /**
   * 记一句评价。
   * @param {object} spec { subject, by, label, source, weight, at }
   */
  function note(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const subject = clean(src.subject, 32);
    const by = clean(src.by, 32);
    const label = clean(src.label, 60);
    const source = clean(src.source, 16);
    const missing = [];
    if (!subject) missing.push('subject');
    if (!by) missing.push('by');
    if (!label) missing.push('label');
    if (missing.length) return refuse('missing-fields', { missing: missing, why: '评价要有人、有嘴、有一句话' });
    if (SOURCES.indexOf(source) < 0) return refuse('missing-fields', { missing: ['source'], field: 'source', got: source,
      why: '凭什么这么说：来源必须是 ' + SOURCES.join('/') });
    if (by === subject) return refuse('bad-scope', { field: 'by', why: '死人不能给自己写名声：身后名只有活人写得成' });
    let weight = Number(src.weight);
    let clamped = false;
    if (!isFinite(weight)) weight = 1;
    if (weight < 1) { weight = 1; clamped = true; }
    if (weight > 3) { weight = 3; clamped = true; }
    const key = subject + '|' + by;
    const m = readAll();
    const prev = m[key];
    const at = Number.isFinite(Number(src.at)) ? Number(src.at) : nowAt();
    m[key] = { key: key, subject: subject, by: by, label: label, source: source, sourceCN: SCN[source],
      weight: weight, at: at, firstAt: prev ? (prev.firstAt || prev.at) : at };
    writeAll(capIt(m));
    if (prev) stat.revised++; else stat.noted++;
    return { ok: true, reason: 'ok', key: key, subject: subject, by: by, label: label,
      source: source, sourceCN: SCN[source], weight: weight, revised: !!prev, clamped: clamped,
      note: prev ? ('改口：' + by + '的说法换成「' + label + '」（一人一票，不刷票）')
        : (by + '说：' + label + '（' + SCN[source] + '）') };
  }

  /** 记下死期（只记一次，第二次不覆盖——死期不许改口）。 */
  function markDead(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const subject = clean(src.subject, 32);
    if (!subject) return refuse('missing-fields', { missing: ['subject'] });
    const at = Number(src.at);
    if (!isFinite(at) || at <= 0) return refuse('missing-fields', { missing: ['at'], why: '哪一刻死的：没有死期就分不了"当时/后来"' });
    const m = readAll();
    m.__dead = (m.__dead && typeof m.__dead === 'object') ? m.__dead : {};
    if (m.__dead[subject]) {
      stat.refused++;
      return { ok: false, reason: 'already-handled', subject: subject, at: m.__dead[subject], note: '死期已经记过了：不许改口' };
    }
    m.__dead[subject] = at;
    writeAll(capIt(m));
    return { ok: true, reason: 'ok', subject: subject, at: at, note: '死期已记：此后 view 不必再传 deathAt' };
  }
  function deadAt(subject) {
    const m = readAll();
    const d = (m.__dead && typeof m.__dead === 'object') ? m.__dead[subject] : null;
    return (typeof d === 'number' && isFinite(d)) ? d : null;
  }

  /** 两个时点分段的读数：`deathAt` 之前算"当时"，之后算"后来"。 */
  function view(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const subject = clean(src.subject, 32);
    if (!subject) return refuse('missing-fields', { missing: ['subject'] });
    const deathAt = Number.isFinite(Number(src.deathAt)) && Number(src.deathAt) > 0
      ? Number(src.deathAt) : deadAt(subject);
    const m = readAll();
    const all = Object.keys(m).map(function (k) { return m[k]; })
      .filter(function (r) { return r.subject === subject; })
      .sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    if (!all.length) {
      return { ok: true, reason: 'ok', subject: subject, empty: true, then: null, now: null,
        swing: 0, note: '还没有人评价过他：身后无名，也就无从改口' };
    }
    if (deathAt === null) {
      return { ok: true, reason: 'ok', subject: subject, empty: false, deathAt: null,
        all: all.slice(0, 16), swing: 0, then: null, now: null,
        note: '没给死期：只能摊开全部评价，分不了"当时/后来"' };
    }
    const pack = function (rows) {
      const score = rows.reduce(function (a, r) { return a + (r.weight || 1); }, 0);
      return { rows: rows.slice(0, 12), count: rows.length, score: score,
        labels: rows.map(function (r) { return r.label; }) };
    };
    const then = pack(all.filter(function (r) { return (r.at || 0) <= deathAt; }));
    const now = pack(all.filter(function (r) { return (r.at || 0) > deathAt; }));
    const swing = now.score - then.score;
    return { ok: true, reason: 'ok', subject: subject, empty: false, deathAt: deathAt,
      then: then, now: now, swing: swing,
      note: swing === 0 ? '身后的说法和当时一样多：名声没被改写'
        : (swing > 0 ? ('身后多了 ' + swing + ' 分好话：活人在给他补名声')
          : ('身后少了 ' + (-swing) + ' 分：活人在给他抹') ) };
  }

  function statOf() { return Object.assign({}, stat); }
  function buildBlock(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    let v = view(src);
    if (!src.subject) {
      // 无参调用（注入面）：挑改口最大的那一个说，不说等于没做
      const m = readAll();
      const subs = Object.keys(m.__dead && typeof m.__dead === 'object' ? m.__dead : {});
      let best = null;
      subs.forEach(function (sub) {
        const x = view({ subject: sub });
        if (!x || x.then === null || !x.swing) return;
        if (!best || Math.abs(x.swing) > Math.abs(best.swing)) best = x;
      });
      v = best || v;
    }
    if (!v || v.empty || v.then === null || v.now === null) return '';
    if (!v.swing) return '';
    const dir = v.swing > 0 ? '身后评价转好' : '身后评价转坏';
    return '【身后名】' + v.subject + '：' + dir + '（当时 ' + v.then.count + ' 人说过，后来 ' + v.now.count + ' 人改口）——'
      + (v.swing > 0 ? '别写成他一直被夸：是后来有人替他说话。' : '别写成他一直挨骂：是后来有人翻他的旧账。');
  }

  WA.reputationAfter = {
    SOURCES: SOURCES.slice(), SCN: Object.assign({}, SCN), CAP: CAP,
    note: note, markDead: markDead, deadAt: deadAt, view: view, buildBlock: buildBlock, stat: statOf
  };
})();
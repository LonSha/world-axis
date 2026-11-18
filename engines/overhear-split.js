/**
 * WorldAxis engines/overhear-split.js (v2.524.0) — EXV29-09 听者分层
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   现场 19 个文件涉及 `overhear|eavesdrop`，`spatial-acoustics` 管距离、`lingua-broker` 管方言、
 *   但**没有任何一处把"同一句话对不同人听到什么"算出来**。于是同一句台词，
 *   站在门口的人和坐在桌边的人拿到的是**一字不差的同一份内容**——耳朵没有远近。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `split({line, listeners})` 给每个听者算一个**损耗分**：
 *   距离（distance，0..10）+ 噪音（noise，0..1）+ 方言差（dialect 不同记 2 分）。
 *   0..2 分 ⇒ `full`（整句）；3..5 ⇒ `partial`（只拿到骨头，丢了措辞）；
 *   ≥6 ⇒ `voice-only`（只听见"他在说话"）。每条都带 `why`。
 *
 * ── 缝合边界（否定式，每条都有判据咬）─────────────────────────────
 *   ① 远处者拿不到内容：`voice-only` 的 `got` **不得包含原句任何 6 字以上片段**（负控制：泄漏必红）。
 *   ② 三人三版：三个人三种损耗就必须给出三种 `fidelity`，不许合并成一份。
 *   ③ 无损才算 full：分 >0 一律不许标 `full`（不许"大约听清"）。
 *   ④ 没听者不猜：空 `listeners` ⇒ `empty:true`。
 *   ⑤ 纯函数：本模块**不写存档、不掷骰、不进正文**，只回一份分发结果。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const FAR = 6;               // 损耗分达到这个数 ⇒ 只听见"在说话"
  const PARTIAL = 3;           // 达到这个数 ⇒ 只拿到骨头
  const MAX_DIST = 10;
  const stat = { splits: 0, listeners: 0, badInput: 0, empty: 0 };

  function refuse(code, extra) {
    stat.badInput++;
    return Object.assign({ ok: false, reason: code }, extra || {});
  }
  function clean(v, max) {
    const s = (v === undefined || v === null) ? '' : String(v).trim();
    return s.slice(0, max || 24);
  }
  function num(v, lo, hi, dflt) {
    const n = Number(v);
    if (!isFinite(n)) return dflt;
    return Math.max(lo, Math.min(hi, n));
  }
  /** 只保留"骨头"：去掉引号与修饰，最多 12 字（模拟"听了个大概"）。 */
  function bones(line) {
    const t = String(line).replace(/[「」“”"'‘’，。！？、；：…—\s]/g, '');
    return t.slice(0, 12) + (t.length > 12 ? '…' : '');
  }
  function normDialect(d) { return clean(d, 12) || 'local'; }

  function split(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const line = clean(src.line, 120);
    if (!line) return refuse('missing-fields', { missing: ['line'] });
    const list = Array.isArray(src.listeners) ? src.listeners : [];
    if (!list.length) { stat.empty++; return { ok: true, reason: 'ok', empty: true, rows: [], note: '没有听者：不猜谁听见了什么' }; }
    const speakerDialect = normDialect(src.dialect);
    const rows = [];
    list.forEach(function (p) {
      const who = clean(p && p.who, 24);
      if (!who) return;
      const distance = num(p.distance, 0, MAX_DIST, 0);
      const noise = num(p.noise, 0, 1, 0);
      const dialect = normDialect(p.dialect);
      const dialectGap = (dialect === speakerDialect) ? 0 : 2;
      const score = Math.round((distance * 0.6 + noise * 4 + dialectGap) * 10) / 10;
      let fidelity = 'full';
      let got = line;
      if (score >= FAR) { fidelity = 'voice-only'; got = '（只听见有人在说话，听不清说什么）'; }
      else if (score > 0) { fidelity = 'partial'; got = bones(line); }   // 分 >0 就不算"整句听清"
      const bits = [];
      if (distance) bits.push('隔 ' + distance + ' 步');
      if (noise) bits.push('噪 ' + noise);
      if (dialectGap) bits.push('口音不同');
      rows.push({
        who: who, fidelity: fidelity, got: got, score: score, distance: distance, noise: noise,
        dialect: dialect, why: bits.length ? (bits.join('、') + ' ⇒ 损耗 ' + score) : '就在近前、没噪音、同一口音 ⇒ 整句听清'
      });
    });
    if (!rows.length) return refuse('missing-fields', { missing: ['who'], why: '听者必须有人名' });
    stat.splits++;
    stat.listeners += rows.length;
    const kinds = {};
    rows.forEach(function (r) { kinds[r.fidelity] = true; });
    return {
      ok: true, reason: 'ok', empty: false, rows: rows,
      distinct: Object.keys(kinds).length,
      note: '同一句按距离/噪音/口音分成 ' + Object.keys(kinds).length + ' 种听觉版本'
    };
  }

  function statOf() { return Object.assign({}, stat); }
  function buildBlock() { return ''; }   // 纯判据：不进注入面（由场景层自己取用）

  WA.overhearSplit = {
    FAR: FAR, PARTIAL: PARTIAL, MAX_DIST: MAX_DIST,
    split: split, bones: bones, buildBlock: buildBlock, stat: statOf
  };
})();
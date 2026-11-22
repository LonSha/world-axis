/**
 * WorldAxis engines/past-life.js (v2.524.0) — EXV29-18 重开一局的前世
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   重开一局时，玩家常想"接着上次那个人"——但现场只有两条粗路：
 *   `player-archive` 的整包续接（把上一局的人、关系、暗流全套搬过来）与全新开局（什么都不带）。
 *   中间那一档没人做：**只带一两样东西，而且新局知道它来自上一局**。
 *   不做这一档的后果是串档——上一局的事被当成这一世已经发生过的事写进正文。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `offer()` 从上一局归档里挑出**可继承项**（人名 / 未收的线），逐项带 key；
 *   `choose(keys, token)` 只接受本次 offer 发出去的 key，落成 `pastLife`
 *   ——每条都盖着 `from:{chatId, round, label:'上一局'}` 的戳；
 *   `decline()` 则把这块彻底删掉（零残留），`residue()` 供验收查残留。
 *
 * ── 缝合边界（否定式，每条都有判据咬）─────────────────────────────
 *   ① 不串档：token 的 chatId 与当前聊天不同 ⇒ `chat-changed`（负控制：串档必红）。
 *   ② 不编继承项：key 不在本次 offer 名单里 ⇒ `unknown-kind`（不许手写一个"前世记忆"）。
 *   ③ 知道那是上一局：`buildBlock()` 一律以【前世】开头并写明"不是这一世发生的事"。
 *   ④ 不继承则零残留：`decline()` 删键，`residue().count === 0`。
 *   ⑤ 有界：最多继承 3 项，单项 96 字（与 `__BOUNDED_CAPS` 对齐）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const STORE_KEY = 'pastLife';
  const CAP = 3;
  const TEXT_MAX = 96;
  const KINDS = ['person', 'thread'];
  const CN = { person: '人', thread: '未收的线' };
  const stat = { offered: 0, chosen: 0, declined: 0, refused: 0 };
  let lastOffer = null;   // { token, chatId, round, items:[] }
  let shadow = null;

  function refuse(code, extra) {
    stat.refused++;
    return Object.assign({ ok: false, reason: code }, extra || {});
  }
  function chatId() {
    try { return String((WA.store && WA.store.chatId && WA.store.chatId()) || 'wa_default'); }
    catch (e) { return 'wa_default'; }
  }
  function readRaw() {
    try {
      const all = WA.store && typeof WA.store.get === 'function' ? (WA.store.get() || {}) : {};
      const b = all[STORE_KEY];
      return (b && typeof b === 'object' && !Array.isArray(b)) ? b : (shadow || null);
    } catch (e) { return shadow || null; }
  }
  function writeRaw(b) {
    try {
      if (!WA.store || !WA.store.transact) { shadow = b; return false; }
      WA.store.transact(function (d) { d[STORE_KEY] = b; return true; }, 'past:life');
      return true;
    } catch (e) { shadow = b; return false; }
  }
  function clearRaw() {
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) { delete d[STORE_KEY]; return true; }, 'past:life:clear');
        shadow = null;
        return true;
      }
    } catch (e) { /* 落到 shadow */ }
    shadow = null;
    return false;
  }
  function clean(v, max) {
    const s = (v === undefined || v === null) ? '' : String(v).trim();
    return s.slice(0, max || TEXT_MAX);
  }

  /** 上一局的归档作品（本机按聊天隔离，最近一份就是"上一局"）。 */
  function prevWorks() {
    try {
      const v = WA.playerArchive && WA.playerArchive.view ? WA.playerArchive.view() : null;
      const list = (v && Array.isArray(v.works)) ? v.works : [];
      return list.filter(function (w) { return w && w.data; });
    } catch (e) { return []; }
  }

  /**
   * 列出可继承项。没有任何上一局归档 ⇒ `not-happened`（不凭空造一个前世）。
   */
  function offer() {
    const works = prevWorks();
    if (!works.length) {
      return refuse('not-happened', { items: [], note: '本机没有上一局的归档：没有前世可继承（也不替你编一个）' });
    }
    const work = works[works.length - 1];
    const tail = (work.data && work.data.continuation) || null;
    const items = [];
    const people = (tail && Array.isArray(tail.people)) ? tail.people : [];
    people.slice(0, 6).forEach(function (p, i) {
      const name = clean(p && p.name, 24);
      if (!name) return;
      items.push({ key: 'p' + i, kind: 'person', label: name, text: name + '（上一局的人，如今只是别人口中的旧名字）' });
    });
    const currents = (tail && Array.isArray(tail.currents)) ? tail.currents : [];
    currents.slice(0, 6).forEach(function (c, i) {
      const title = clean(c && c.title, 40);
      if (!title) return;
      items.push({ key: 't' + i, kind: 'thread', label: title, text: title + '（上一局没走完的事，这一世只当旧闻）' });
    });
    if (!items.length) return refuse('not-happened', { items: [], note: '上一局归档里没有可继承的人或线' });
    const token = String(chatId()) + '#' + String(work.round === undefined ? 0 : work.round);
    lastOffer = { token: token, chatId: chatId(), round: work.round, items: items.slice() };
    stat.offered++;
    return {
      ok: true, reason: 'ok', token: token, round: work.round, chatId: chatId(),
      items: items.slice(0, CAP), total: items.length, kinds: KINDS.slice(),
      note: '上一局可继承 ' + Math.min(items.length, CAP) + ' 样（最多 ' + CAP + ' 样）；不选就什么也不带'
    };
  }

  /**
   * 选定要带过来的项。keys 用本次 offer 的 key；空数组=不带（等价 decline）。
   * @param {string[]} keys @param {string} token
   */
  function choose(keys, token) {
    const offerSnap = lastOffer;
    if (!offerSnap) return refuse('missing-fields', { missing: ['offer'], why: '先 offer() 拿到名单与 token，再 choose' });
    const tk = clean(token, 80);
    if (!tk) return refuse('missing-fields', { missing: ['token'] });
    if (tk !== offerSnap.token) return refuse('chat-changed', { expected: offerSnap.token, got: tk,
      note: '串档：这份继承名单不是本局发出的（或已换聊天/换局）' });
    if (chatId() !== offerSnap.chatId) return refuse('chat-changed', { expected: offerSnap.chatId, got: chatId(),
      note: '串档：名单是在另一个聊天里发的，不许搬到这一局' });
    const list = Array.isArray(keys) ? keys : [];
    if (!list.length) { stat.declined++; clearRaw(); return { ok: true, reason: 'ok', inherited: [], note: '不带前世：本局零残留' }; }
    if (list.length > CAP) return refuse('bad-scope', { field: 'keys', cap: CAP, got: list.length, why: '最多带 ' + CAP + ' 样' });
    const picked = [];
    for (let i = 0; i < list.length; i++) {
      const k = clean(list[i], 16);
      const hit = offerSnap.items.filter(function (it) { return it.key === k; })[0];
      if (!hit) return refuse('unknown-kind', { field: 'keys', got: k, allowed: offerSnap.items.map(function (it) { return it.key; }),
        why: '不许手写继承项：只能从 offer 名单里挑' });
      if (picked.some(function (p) { return p.key === hit.key; })) continue;
      picked.push(hit);
    }
    const from = { chatId: offerSnap.chatId, round: offerSnap.round, label: '上一局' };
    const rows = picked.map(function (it) {
      return { key: it.key, kind: it.kind, kindCN: CN[it.kind] || it.kind, label: clean(it.label, 40), text: clean(it.text, TEXT_MAX), from: Object.assign({}, from) };
    });
    writeRaw({ from: from, items: rows });
    stat.chosen++;
    return {
      ok: true, reason: 'ok', from: from, inherited: rows.slice(),
      note: '带了 ' + rows.length + ' 样过来：每一件都记着来自' + from.label + '第 ' + (from.round === undefined ? '?' : from.round) + '回，别当本世已发生'
    };
  }

  /** 不带前世（显式拒绝也要留痕：`declined` 计数，但存档零残留）。 */
  function decline() {
    stat.declined++;
    clearRaw();
    return { ok: true, reason: 'ok', inherited: [], note: '本局不继承：前世不留残留' };
  }

  /** 残留检查（验收用）：不继承时必须 count === 0。 */
  function residue() {
    const b = readRaw();
    const items = (b && Array.isArray(b.items)) ? b.items : [];
    return { ok: true, reason: 'ok', count: items.length, from: (b && b.from) || null, items: items.slice(0, CAP) };
  }

  function statOf() { return Object.assign({}, stat); }
  function buildBlock() {
    const r = residue();
    if (!r.count) return '';
    return '【前世】本局从' + (r.from && r.from.label ? r.from.label : '上一局') + '带来 '
      + r.count + ' 样东西：' + r.items.map(function (it) { return it.text; }).join('；')
      + '——这些**不是这一世发生过的事**，只能作为旧事、传闻或似曾相识被提起。';
  }

  WA.pastLife = {
    KINDS: KINDS.slice(), CN: Object.assign({}, CN), CAP: CAP, TEXT_MAX: TEXT_MAX,
    offer: offer, choose: choose, decline: decline, residue: residue, buildBlock: buildBlock, stat: statOf
  };
})();
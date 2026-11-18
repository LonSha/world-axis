/**
 * WorldAxis engines/exit-rite.js (v2.524.0) — EXV29-16 退场仪典
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   主要人物要离场时，现场最省事的做法是**把他从名单里删掉**：下一轮注入里没有他，
 *   模型就不再写他，玩家回过神时人已经不见了，连一句"他走了"都没有。
 *   现场 `mortuary-rites` 只管丧事（五服/服丧期内禁事），`stage-session` 只管设定
 *   演绎会话——两者都不负责"一个人怎么离场、谁看着"。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   退场必须是一次**登记在案的场面**：谁走了（`id`/`role`）、为什么（`cause` 四档）、
 *   在哪儿（`where`）、谁看着（`witnesses` 至少一人且不能是本人）。
 *   登记后此人**永远留在退场名册里**（`gone`/`list` 可查），不是从名单消失；
 *   死退场可把丧事交给 `mortuaryRites.holdFuneral`（给 mournerId/kin/at 才转交）。
 *
 * ── 缝合边界（否定式，每条都有判据咬）─────────────────────────────
 *   ① 不许静默删除：本模块**没有删除函数**，`list()` 永远含已退场者与其场面。
 *   ② 无见证不算仪典：`witnesses` 空 ⇒ `missing-fields`（missing:['witnesses']）。
 *   ③ 不给自己作证：见证人里含本人 id ⇒ `bad-scope`（field:'witnesses'）。
 *   ④ 理由必须在四档内：`cause` 不在表 ⇒ `unknown-kind`。
 *   ⑤ 退场只写一次：再 `add` 同一 id ⇒ `already`，原场面不被覆盖（不许改口）。
 *   ⑥ 有界：最多 24 人在册（与 `__BOUNDED_CAPS` 对齐）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const STORE_KEY = 'exitRites';
  const CAP = 24;
  // 四档离场理由：只钉这四种，别的写不进来（写不进来就不会被瞎编）
  const CAUSES = ['death', 'departure', 'exile', 'retire'];
  const CN = { death: '亡故', departure: '离去', exile: '逐出', retire: '退隐' };
  const stat = { rites: 0, refused: 0, badInput: 0, handoffs: 0 };
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
      WA.store.transact(function (d) { d[STORE_KEY] = m; return true; }, 'exit:rite');
      return true;
    } catch (e) { shadow = m; return false; }
  }
  function clean(v, max) {
    const s = (v === undefined || v === null) ? '' : String(v).trim();
    return s.slice(0, max || 60);
  }
  function nowAt() {
    try { return (function () { try { return WA.clock.now('exitRite'); } catch (e) { return Date.now(); } })(); }
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
   * 登记一场退场。场面四样缺一不可，见证人不得是本人。
   * @param {object} spec { id, role, cause, where, witnesses:[], last, mournerId, kin, at }
   */
  function add(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const id = clean(src.id, 32);
    const role = clean(src.role, 24);
    const cause = clean(src.cause, 16);
    const where = clean(src.where, 40);
    const missing = [];
    if (!id) missing.push('id');
    if (!role) missing.push('role');
    if (!cause) missing.push('cause');
    if (!where) missing.push('where');
    if (missing.length) return refuse('missing-fields', { missing: missing, why: '退场要有场面：人/身份/理由/地点四样缺一不可' });
    if (CAUSES.indexOf(cause) < 0) return refuse('unknown-kind', { field: 'cause', got: cause, allowed: CAUSES.slice() });
    const raw = Array.isArray(src.witnesses) ? src.witnesses : [];
    const witnesses = raw.map(function (w) { return clean(w, 32); }).filter(function (w) { return !!w; });
    if (!witnesses.length) return refuse('missing-fields', { missing: ['witnesses'], why: '没人看着的离场不算场面' });
    if (witnesses.some(function (w) { return w === id; })) {
      return refuse('bad-scope', { field: 'witnesses', why: '不许自己给自己作证：见证人里剔掉 ' + id });
    }
    const m = readAll();
    if (m[id]) {
      stat.refused++;
      return { ok: false, reason: 'already', id: id, where: m[id].where, cause: m[id].cause,
        note: '这个人已经退场登记过了：场面不许改口，再写请另开新角色' };
    }
    const row = {
      id: id, role: role, cause: cause, causeCN: CN[cause], where: where,
      witnesses: witnesses.slice(0, 8), last: clean(src.last, 80) || '', at: nowAt()
    };
    let handoff = null;
    // 死退场：把丧事交给丧事模块（只在调用方给全它要的三样时才转交，不替它猜亲等）
    if (cause === 'death' && src.mournerId && src.kin) {
      const mr = WA.mortuaryRites;
      if (mr && typeof mr.holdFuneral === 'function') {
        const r = mr.holdFuneral({ mournerId: clean(src.mournerId, 32), kin: clean(src.kin, 16), at: row.at, deceased: id });
        handoff = { to: 'mortuaryRites.holdFuneral', ok: !!(r && r.ok), reason: (r && (r.reason || r.hint)) || null, days: (r && r.days) || null };
        if (r && r.ok) stat.handoffs++;
      } else {
        handoff = { to: 'mortuaryRites.holdFuneral', ok: false, reason: 'module-missing', days: null };
      }
    }
    row.handoff = handoff;
    m[id] = row;
    writeAll(capIt(m));
    stat.rites++;
    return {
      ok: true, reason: 'ok', id: id, cause: cause, causeCN: CN[cause], where: where,
      witnesses: row.witnesses.slice(), handoff: handoff,
      scene: id + '（' + role + '）' + CN[cause] + '于' + where + '，' + row.witnesses.join('、') + '在场'
        + (row.last ? '；最后一句话：' + row.last : ''),
      note: '退场已入册：他会留在名册里，不会从名单消失'
    };
  }

  /** 这个人退场了没有（没登记过 ⇒ not-happened，不是"还在"）。 */
  function gone(id) {
    const key = clean(id, 32);
    if (!key) return refuse('missing-fields', { missing: ['id'] });
    const m = readAll();
    const row = m[key];
    if (!row) return { ok: false, reason: 'not-happened', id: key, note: '没有退场登记：此人还在场（或从未登记过退场）' };
    return { ok: true, reason: 'ok', id: key, cause: row.cause, causeCN: row.causeCN, where: row.where,
      witnesses: (row.witnesses || []).slice(), at: row.at };
  }

  /** 在册者（含已退场者——这里不许"看不见就等于没发生"）。 */
  function list() {
    const m = readAll();
    const ks = Object.keys(m);
    const rows = ks.map(function (k) { return m[k]; }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    return { ok: true, reason: 'ok', empty: ks.length === 0, count: ks.length, rows: rows.slice(0, CAP) };
  }

  function statOf() { return Object.assign({}, stat); }
  function buildBlock() {
    const l = list();
    if (l.empty) return '';
    return '【已退场】' + l.rows.slice(0, 3).map(function (r) {
      return r.id + '（' + r.causeCN + '于' + r.where + '，' + (r.witnesses || []).length + ' 人见证）';
    }).join('；') + '——他们已经离场，不要再当在场者写，但别当他们没存在过。';
  }

  WA.exitRite = {
    CAUSES: CAUSES.slice(), CN: Object.assign({}, CN), CAP: CAP,
    add: add, gone: gone, list: list, buildBlock: buildBlock, stat: statOf
  };
})();

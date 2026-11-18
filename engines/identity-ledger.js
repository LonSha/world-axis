/**
 * WorldAxis engines/identity-ledger.js (v2.524.0) — EXV29-01 四元组同一性账本
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   同一个人跑到第三百楼会"漂"：叫法变了、口音没了、习惯动作换了、忌讳也忘了。
 *   现场读数（`grep -rlE` 实测）：`称谓|称呼` 6 文件 · `忌讳|禁忌` 15 文件 ·
 *   `口音|方言` 12 文件 · `aging|ageUp|年岁|岁数` **0 命中**。
 *   四元组**散在四处，没有任何一处对账**：`persona-anchor` 只管"人设不许崩"，
 *   `idiosyncrasy` 只管怪癖，`masks` 只管面具，`appearance` 只管外貌 ——
 *   谁都没有回答这个问题：**"他这一轮和他第一轮，还是同一个人吗？"**
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   给每个人记一份**四元组基线**（称呼 / 口音 / 习惯动作 / 忌讳），
 *   `audit()` 拿当前的四个值去比基线，回**漂了哪几项、一致几成、依据哪一次基线**。
 *   它**只报不改**：不改称呼、不改文风、不动任何人物数据（改写是 persona/style 的病，不是这里的）。
 *
 * ── 缝合边界（否定式，每条都有判据咬）─────────────────────────────
 *   ① 只报不改：本模块三个写口里只有一个写"基线"（`snapshot`），**从不写人物四元组本身**。
 *   ② 没基线不猜：`audit` 遇到没记过的人一律 `not-happened`（不拿空基线当"全漂"）。
 *   ③ 四元组必满：缺项一律 `missing-fields` 并点名缺哪几项（不许用空串顶过去）。
 *   ④ 有界：`identityLedger` 最多记 48 人，超出按"最久未审计"挤出（与 `__BOUNDED_CAPS` 逐字对齐）。
 *   ⑤ 一致率是**读数不是评分**：`ratio` 只报"四项里几项没漂"，不折算好感/信任。
 *   ⑥ 幂等：同一个人同一基线，`snapshot` 再叫一次只更新时间戳，不产生第二条基线。
 *
 * ── EXV29-06（漂移报告一屏）────────────────────────────────────────
 *   `audit({...,ref:'#312'})` 的 `ref` 是**依据哪一楼**；漂移项原样带上它，
 *   `report()` 把每人最近一次审计的漂移平铺成 `driftRows`（谁、漂了哪项、依据哪一楼），
 *   `brief()` 出一行话。没漂就明说"没漂"，没记过就明说"还没有基线"——不许拿空表冒充"没漂"。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const STORE_KEY = 'identityLedger';
  const CAP = 48;
  const FIELDS = ['address', 'accent', 'habit', 'taboo'];
  const CN = { address: '称呼', accent: '口音', habit: '习惯动作', taboo: '忌讳' };
  const stat = { snapshotted: 0, audited: 0, drifted: 0, noBaseline: 0, badInput: 0, lastDrift: [] };
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
      WA.store.transact(function (d) { d[STORE_KEY] = m; return true; }, 'identity:ledger');
      return true;
    } catch (e) { shadow = m; return false; }
  }
  function norm(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const id = src.id === undefined || src.id === null ? '' : String(src.id).trim();
    const quad = {};
    const missing = [];
    if (!id) missing.push('id');
    FIELDS.forEach(function (f) {
      const v = src[f] === undefined || src[f] === null ? '' : String(src[f]).trim();
      if (!v) missing.push(f); else quad[f] = v;
    });
    return { id: id, quad: quad, missing: missing };
  }
  function capIt(m) {
    const ids = Object.keys(m);
    if (ids.length <= CAP) return m;
    ids.sort(function (a, b) { return (m[a].at || 0) - (m[b].at || 0); });
    ids.slice(0, ids.length - CAP).forEach(function (k) { delete m[k]; });
    return m;
  }

  /** 记/刷新一个人的四元组基线（幂等：同人只一条，刷新只动时间戳与四元组）。 */
  function snapshot(o) {
    const n = norm(o);
    if (n.missing.length) return refuse('missing-fields', { missing: n.missing, why: '四元组必填满，不许空串顶过去' });
    const m = readAll();
    const existed = !!m[n.id];
    const at = (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('identityLedger') : Date.now();
    m[n.id] = {
      quad: Object.assign({}, n.quad), at: at, audits: (existed ? (m[n.id].audits || 0) : 0),
      ref: (o && o.ref !== undefined && o.ref !== null) ? String(o.ref).slice(0, 24) : (existed ? (m[n.id].ref || '') : ''),
      // 换基线就该清掉旧的漂移留痕：那是"上一条基线"的事，留着会把两代混成一屏。
      last: existed ? (m[n.id].last || null) : null
    };
    if (existed) m[n.id].last = null;
    writeAll(capIt(m));
    stat.snapshotted++;
    return { ok: true, reason: 'ok', id: n.id, created: !existed,
      quad: Object.assign({}, n.quad), at: at,
      note: existed ? '已有基线：本次只刷新四元组与时间戳，不新增第二条' : '基线已立' };
  }

  /** 审计：拿当前四元组比基线，回漂了哪几项与一致率。**只读**。 */
  function audit(o) {
    const n = norm(o);
    if (!n.id) return refuse('missing-fields', { missing: ['id'] });
    const m = readAll();
    const base = m[n.id];
    if (!base || !base.quad) { stat.noBaseline++; return { ok: false, reason: 'not-happened', id: n.id,
      note: '这个人没有基线：不拿空基线当"全漂"，先别下结论' }; }
    const drift = [];
    const same = [];
    FIELDS.forEach(function (f) {
      const now = n.quad[f];
      if (now === undefined) return;              // 未提供的项不参与（审计可以只查两项）
      if (now !== base.quad[f]) drift.push({ field: f, cn: CN[f], was: base.quad[f], now: now });
      else same.push(f);
    });
    const counted = drift.length + same.length;
    if (!counted) return refuse('missing-fields', { missing: FIELDS.slice(), why: '四项都没给，审计无从谈起' });
    const ratio = counted ? (same.length / counted) : 1;
    const ref = (o && o.ref !== undefined && o.ref !== null) ? String(o.ref).slice(0, 24) : '';
    base.audits = (base.audits || 0) + 1;
    // 留痕：只留最近一次（单条，天然有界）。有漂才记，没漂就记"这一轮没漂"。
    base.last = {
      at: (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('identityLedger') : Date.now(),
      ref: ref,
      ratio: Math.round(ratio * 100) / 100,
      drift: drift.map(function (d) { return { field: d.field, cn: d.cn, was: d.was, now: d.now, ref: ref }; })
    };
    writeAll(m);
    stat.audited++;
    if (drift.length) { stat.drifted++; stat.lastDrift = drift.map(function (d) { return d.field; }); }
    return { ok: true, reason: 'ok', id: n.id, drift: drift, same: same,
      ratio: Math.round(ratio * 100) / 100, counted: counted,
      baseAt: base.at, audits: base.audits, ref: ref,
      note: drift.length ? ('漂了 ' + drift.length + ' 项：' + drift.map(function (d) { return d.cn; }).join('、'))
        : '四项全对得上：还是同一个人' };
  }

  /** 读数：谁漂了、漂了几项。没有记录时明说没有（`ok-empty`）。 */
  function report() {
    const m = readAll();
    const ids = Object.keys(m);
    if (!ids.length) return { ok: true, reason: 'ok', empty: true, people: [], note: '还没有任何基线（先 snapshot）' };
    const rows = ids.map(function (id) {
      const last = m[id].last || null;
      return {
        id: id, at: m[id].at, audits: m[id].audits || 0, quad: Object.assign({}, m[id].quad),
        baseRef: m[id].ref || '',
        lastAt: last ? last.at : null, lastRef: last ? (last.ref || '') : '',
        drifted: last ? last.drift.length : 0,
        drift: last ? last.drift.slice() : []
      };
    });
    const driftRows = [];
    rows.forEach(function (r) {
      r.drift.forEach(function (d) {
        driftRows.push({ id: r.id, field: d.field, cn: d.cn, was: d.was, now: d.now, ref: d.ref || r.lastRef || r.baseRef || '' });
      });
    });
    rows.sort(function (a, b) { return (b.audits - a.audits) || (b.at - a.at); });
    return { ok: true, reason: 'ok', empty: false, people: rows.slice(0, 12), total: ids.length, cap: CAP,
      driftRows: driftRows.slice(0, 20), driftTotal: driftRows.length };
  }
  /** 一屏：谁漂了、漂了哪几项、依据哪一楼；没漂就明说"没漂"。 */
  function brief() {
    const r = report();
    if (r.empty) return { ok: true, reason: 'ok', empty: true, line: '还没有任何基线：先给主要角色立一条，才谈得上"漂没漂"。', rows: [] };
    if (!r.driftTotal) {
      const audited = r.people.filter(function (p) { return p.audits > 0; }).length;
      return { ok: true, reason: 'ok', empty: false, drifted: 0, line: audited
        ? ('这 ' + audited + ' 个人都对得上基线：没漂。')
        : '立了基线还没审过：说不清漂没漂（不许拿"没审"当"没漂"）。', rows: [] };
    }
    const head = r.driftRows.slice(0, 5).map(function (d) {
      return d.id + ' 的' + d.cn + '「' + d.was + '」→「' + d.now + '」' + (d.ref ? '（' + d.ref + '）' : '');
    });
    return {
      ok: true, reason: 'ok', empty: false, drifted: r.driftTotal,
      line: '漂了 ' + r.driftTotal + ' 处：' + head.join('；') + (r.driftTotal > head.length ? ' 等' : '') + '。',
      rows: r.driftRows.slice(0, 12)
    };
  }

  function view() {
    const r = report();
    return { ok: true, total: r.total || 0, cap: CAP, people: r.people || [], stat: statOf() };
  }
  function statOf() { return Object.assign({}, stat, { lastDrift: stat.lastDrift.slice() }); }
  /** 注入面：真有漂移才说话（没漂、没记，一律零 token）。 */
  function buildBlock() {
    const d = stat.lastDrift;
    if (!d.length) return '';
    return '【同一性】上次审计漂了 ' + d.length + ' 项（' + d.map(function (f) { return CN[f] || f; }).join('、') + '）：他和他最初不是一个人了。';
  }

  WA.identityLedger = {
    snapshot: snapshot, audit: audit, report: report, brief: brief, view: view, buildBlock: buildBlock,
    stat: statOf, FIELDS: FIELDS.slice(), CN: Object.assign({}, CN), CAP: CAP
  };
})();
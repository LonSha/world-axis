/**
 * WorldAxis engines/projection-bridge.js (v2.594.0) — 多观察者投影的落地面（OPJ-1）
 *
 * 【它治什么（开工前先看现场）】
 *   `engines/observation-projection.js` 能把「一份公共事实」按观察者投成 N 座私有块，
 *   但它自己按边界② 不读 store、不查信念库 —— 版本要调用方给。
 *   于是全库没有一个地方把「同一条事实，场上每人手里是哪一版」摆出来：
 *   `WA.observationProjection` 产品面零读，`observationProjection.project` 只在测试与
 *   拒收码见证里被叫过。
 *
 *   本文件不重写投影：座位划分 / 缺席者 / 每座独立对象全部委托
 *   `WA.observationProjection.project`。它只补两个缺口：
 *     ① 版本从哪来 —— `epistemicStore.beliefs` 那本账（`epistemicView.registerBelief`
 *        是它唯一的写口，本文件 0 处写它）；
 *     ② 摆出来给人看 —— 每个话题「几座 / 几种说法 / 谁一无所知 / 谁那版与事实不符」。
 *
 * 【六条口径（不给回退）】
 *   1 零写：本文件 0 处 transact( / patch( / setItem( / saveOrThrow(，也不写 beliefs。
 *     投影是读侧的计算，落账是 epistemicView 的事。
 *   2 不解析复合键：beliefs 的键是 pId + 冒号 + tId，而 personId('a:b') 得 'p_a:b'
 *     ⇒ 这个键**天然不可反解**。逐行只认行内自带的 personId / topicId 两个字段，
 *     缺任一就计入 legacy 跳过 —— 不猜、不按冒号切。
 *   3 说法按**正文全等**分组，不按 version 标签分组：两个人可能都写 v1
 *     却是完全不同的说法，按标签分组会把两个说法并成一个（那正是交叉污染
 *     在读侧的翻版）。version 是标签，summary 才是内容。
 *   4 三档分开数：held（有说法）/ bare（登记了但没写内容）/ unaware（这条账上根本没他）。
 *     三档都只拿公共段时长得一样，混成一个数就再也分不出来了。
 *   5 总开关关不是「没人知道」：project 在 disabled 时回 degraded:true 与空 seats，
 *     本文件据此报 disabled 并在读数里写明「不是所有人都知道同一版」。
 *   6 一行读数只有一份：lineOf() 是唯一读数出口，summaryText() 直接回它，
 *     不在第二处另写一个短版。
 *
 * 【边界（否定式）】
 *   · 不判「该不该让他知道」—— 那是 antiOmniscience / concealment 的事，
 *     本文件只把已知的版本摆出来。
 *   · 不改 faithful / 不改 certainty：faithful:false 只单独计数，
 *     谁手里的版本与事实不符由信念账自己说。
 *   · 不掷骰、不自造时间：时间只从 clock.wallNow() 取一次。
 *   · 被 maxSeats 截断时如实记 truncated，不把「没排上座」算成「不知道」。
 */
(function () {
  'use strict';
  var WA = window.WorldAxis = window.WorldAxis || {};
  var VERSION = '2.594.0';
  var DEFAULT_TOP = 6;
  var MAX_TOP = 12;
  // 计数器先于使用处声明（本文件 scan 会写它，别靠 var 提升）。
  var _stat = { scans: 0, last: null };

  function clockWall() { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } }
  function state() { try { return (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : {}; } catch (e) { return {}; } }
  function num(v) { var n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }
  function str(v) { return v == null ? '' : String(v).trim(); }
  function clip(s, max) {
    var t = String(s == null ? '' : s);
    return t.length > max ? (t.slice(0, max - 1) + '…') : t;
  }
  /** personId('p_李明') 去掉前缀给人看；不带前缀的原样回。 */
  function whoOf(pid) { var t = str(pid); return t.indexOf('p_') === 0 ? t.slice(2) : t; }
  function summaryOf(e) { return str(e && e.summary); }
  function labelOf(e) { return str(e && e.version); }

  /**
   * 从信念账读出行（不反解复合键）。
   * @returns {{list:Array, legacy:number, orphan:number}}
   */
  function beliefs() {
    var s = state();
    var b = (s.epistemicStore && s.epistemicStore.beliefs) || null;
    var out = { list: [], legacy: 0, orphan: 0 };
    if (!b || typeof b !== 'object') return out;
    var keys = Object.keys(b);
    for (var i = 0; i < keys.length; i++) {
      var e = b[keys[i]];
      if (!e || typeof e !== 'object') { out.orphan++; continue; }
      var pid = str(e.personId);
      var tid = str(e.topicId);
      if (!pid || !tid) { out.legacy++; continue; }
      out.list.push({ key: keys[i], personId: pid, topicId: tid, who: whoOf(pid), entry: e });
    }
    return out;
  }

  /** 受众名单 = store.people 里的真实人名（同人只一次）。 */
  function audienceOf() {
    var s = state();
    var p = (s.people && typeof s.people === 'object') ? s.people : {};
    var ids = Object.keys(p);
    var out = [];
    var seen = {};
    for (var i = 0; i < ids.length; i++) {
      var it = p[ids[i]] || {};
      var nm = str(it.name);
      var who = nm || whoOf(ids[i]);
      if (!who || seen[who]) continue;
      seen[who] = true;
      out.push(who);
    }
    return out;
  }

  /** 按 topicId 归组，保持台账里的出现顺序（不按名字排，免得读数和落账顺序脱钩）。 */
  function groupOf(list) {
    var idx = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!idx[r.topicId]) { idx[r.topicId] = { topic: r.topicId, rows: [] }; out.push(idx[r.topicId]); }
      idx[r.topicId].rows.push(r);
    }
    return out;
  }

  /**
   * 把一个话题的行交给 observationProjection 投一次。
   * 本函数只做「装箱」：holders 的 version 字段装的是**那人自己的说法正文**，
   * 因为投影的口径就是「每座只留本座那版」；标签另存 label 给读数用。
   */
  function projectFor(group, audience) {
    var OP = WA.observationProjection;
    if (!OP || typeof OP.project !== 'function') return { ok: false, why: 'module-missing' };
    var holders = [];
    var seen = {};
    var dup = 0;
    var rowsByWho = {};
    for (var i = 0; i < group.rows.length; i++) {
      var r = group.rows[i];
      if (seen[r.who]) { dup++; continue; }
      seen[r.who] = true;
      rowsByWho[r.who] = r;
      var sum = summaryOf(r.entry);
      if (!sum) continue;
      holders.push({ who: r.who, version: sum, source: str(r.entry.source), certainty: str(r.entry.certainty) });
    }
    var res = null;
    try {
      res = OP.project({ topic: group.topic }, holders, { includeAbsent: true, audience: audience });
    } catch (e) {
      return { ok: false, why: 'project-threw', err: (e && e.message) ? String(e.message) : 'unknown' };
    }
    if (!res || res.ok !== true) {
      var rs = res && res.reason;
      return { ok: false, why: rs === 'disabled' ? 'disabled' : 'project-refused', reason: rs || '', degraded: !!(res && res.degraded) };
    }
    var seats = [];
    var raw = Array.isArray(res.seats) ? res.seats : [];
    for (var j = 0; j < raw.length; j++) {
      var s = raw[j] || {};
      var src = rowsByWho[s.who] || null;
      var kind = src ? (summaryOf(src.entry) ? 'held' : 'bare') : 'unaware';
      var blk = s.block || {};
      seats.push({
        who: str(s.who),
        kind: kind,
        version: str(blk.version),
        label: src ? labelOf(src.entry) : '',
        certainty: str(blk.certainty),
        source: str(blk.source),
        faithful: src ? (src.entry.faithful !== false) : null,
        redacted: !!s.redacted
      });
    }
    var counts = { held: 0, bare: 0, unaware: 0, distorted: 0 };
    var textIdx = {};
    var groups = [];
    for (var k = 0; k < seats.length; k++) {
      var st = seats[k];
      if (st.kind === 'held') {
        counts.held++;
        if (st.faithful === false) counts.distorted++;
        if (!textIdx[st.version]) { textIdx[st.version] = { text: st.version, who: [] }; groups.push(textIdx[st.version]); }
        textIdx[st.version].who.push(st.who);
      } else if (st.kind === 'bare') { counts.bare++; }
      else { counts.unaware++; }
    }
    groups.sort(function (a, b) { return (b.who.length - a.who.length) || (a.text < b.text ? -1 : 1); });
    var lost = holders.length - counts.held;
    return {
      ok: true,
      why: 'ok',
      seats: seats,
      groups: groups,
      distinct: groups.length,
      counts: counts,
      dup: dup,
      truncated: lost > 0,
      lost: lost > 0 ? lost : 0,
      stats: res.stats || null
    };
  }

  function emptyCounts() { return { held: 0, bare: 0, unaware: 0, distorted: 0 }; }

  /**
   * 扫全账：每个话题一组读数。top 只影响返回里缩略的条数，不影响 totals。
   */
  function scan(opts) {
    var o = opts || {};
    var lim = num(o.top);
    if (lim === null) lim = DEFAULT_TOP;
    lim = Math.max(1, Math.min(MAX_TOP, Math.floor(lim)));
    var b = beliefs();
    var groups = groupOf(b.list);
    var audience = audienceOf();
    // 被委托方缺席时**不逐话题编行**：没有投影就没有座，编一车「0 座」比不报更坑。
    var OPx = WA.observationProjection;
    if (!OPx || typeof OPx.project !== 'function') {
      var t0 = { topics: groups.length, beliefs: b.list.length, audience: audience.length,
        seats: 0, held: 0, bare: 0, unaware: 0, distinct: 0, distorted: 0,
        dup: 0, truncated: 0, refused: 0, legacy: b.legacy, orphan: b.orphan };
      var rec0 = { ok: true, version: VERSION, at: clockWall(), why: 'module-missing', top: [], all: [], totals: t0, shown: 0, limit: lim };
      _stat.last = { at: rec0.at, why: 'module-missing', topics: t0.topics, seats: 0, distinct: 0, distorted: 0, refused: 0 };
      _stat.scans++;
      return rec0;
    }
    var totals = {
      topics: groups.length, beliefs: b.list.length, audience: audience.length,
      seats: 0, held: 0, bare: 0, unaware: 0, distinct: 0, distorted: 0,
      dup: 0, truncated: 0, refused: 0, legacy: b.legacy, orphan: b.orphan
    };
    var all = [];
    var disabledAll = groups.length > 0;
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var pr = projectFor(g, audience);
      var rec = {
        topic: g.topic, rows: g.rows.length, ok: pr.ok, why: pr.why || 'ok',
        seats: 0, held: 0, bare: 0, unaware: 0, distinct: 0, distorted: 0,
        dup: pr.dup || 0, truncated: false, lost: 0, groups: pr.groups || [], err: pr.err || ''
      };
      if (pr.ok) {
        rec.seats = pr.seats.length;
        rec.held = pr.counts.held;
        rec.bare = pr.counts.bare;
        rec.unaware = pr.counts.unaware;
        rec.distinct = pr.distinct;
        rec.distorted = pr.counts.distorted;
        rec.truncated = !!pr.truncated;
        rec.lost = pr.lost || 0;
        totals.seats += rec.seats;
        totals.held += rec.held;
        totals.bare += rec.bare;
        totals.unaware += rec.unaware;
        totals.distinct += rec.distinct;
        totals.distorted += rec.distorted;
        totals.dup += rec.dup;
        if (rec.truncated) totals.truncated++;
      } else {
        totals.refused++;
        if (pr.why !== 'disabled') disabledAll = false;
      }
      all.push(rec);
    }
    var why = 'ok';
    var OP = WA.observationProjection;
    if (!OP || typeof OP.project !== 'function') why = 'module-missing';
    else if (!groups.length) why = 'no-beliefs';
    else if (disabledAll && totals.refused === groups.length) why = 'disabled';
    else if (totals.refused === groups.length) why = 'project-refused';
    all.sort(function (a, b2) {
      return (b2.distinct - a.distinct) || (b2.seats - a.seats) || (a.topic < b2.topic ? -1 : 1);
    });
    var top = all.slice(0, lim);
    var rec2 = {
      ok: true, version: VERSION, at: clockWall(), why: why,
      top: top, all: all, totals: totals, shown: top.length, limit: lim
    };
    _stat.last = {
      at: rec2.at, why: why, topics: totals.topics, seats: totals.seats,
      distinct: totals.distinct, distorted: totals.distorted, refused: totals.refused
    };
    _stat.scans++;
    return rec2;
  }

  /** 单话题细节（给读数面的一行与逐座行）。 */
  function view(topicId) {
    var tid = str(topicId);
    if (!tid) return { ok: false, why: 'no-topic', topic: '', version: VERSION, seats: [], groups: [], counts: emptyCounts(), dup: 0, truncated: false, lost: 0, line: ('话题（未给）：' + whyText('no-topic')) };
    var b = beliefs();
    var pick = [];
    for (var i = 0; i < b.list.length; i++) if (b.list[i].topicId === tid) pick.push(b.list[i]);
    if (!pick.length) return { ok: false, why: 'unknown-topic', topic: tid, version: VERSION, seats: [], groups: [], counts: emptyCounts(), dup: 0, truncated: false, lost: 0, line: ('话题「' + clip(tid, 24) + '」：' + whyText('unknown-topic')) };
    var pr = projectFor({ topic: tid, rows: pick }, audienceOf());
    var out = {
      ok: pr.ok, why: pr.why || 'ok', topic: tid, version: VERSION, at: clockWall(),
      seats: pr.seats || [], groups: pr.groups || [], counts: pr.counts || emptyCounts(),
      distinct: pr.distinct || 0, dup: pr.dup || 0, truncated: !!pr.truncated, lost: pr.lost || 0,
      err: pr.err || '', line: ''
    };
    out.line = pr.ok ? ('话题「' + clip(tid, 24) + '」：' + out.seats.length + ' 座（有说法 ' + out.counts.held
      + ' · 登记无内容 ' + out.counts.bare + ' · 一概不知 ' + out.counts.unaware + '）· 说法 '
      + out.distinct + ' 处 · 与事实不符 ' + out.counts.distorted)
      : ('话题「' + clip(tid, 24) + '」：' + whyText(out.why));
    return out;
  }

  function whyText(why) {
    if (why === 'module-missing') return 'observationProjection 未装载（engines/observation-projection.js）';
    if (why === 'disabled') return '总开关关着 —— 这不是「所有人都知道同一版」';
    if (why === 'no-archive') return '台账是空的';
    if (why === 'unknown-topic') return '信念账上没有这个话题';
    if (why === 'no-topic') return '没给话题';
    if (why === 'project-threw') return '投影抛错';
    if (why === 'project-refused') return '投影拒收';
    return String(why || '未知');
  }

  /** 唯一读数出口：一行。 */
  function lineOf(r) {
    if (!r || r.ok !== true) return '';
    var t = r.totals || null;
    if (t) {
      if (r.why === 'module-missing') return '投影台账：observationProjection 未装载（engines/observation-projection.js）';
      if (r.why === 'disabled') return '投影台账：总开关关着（0 座）—— 这不是「场上所有人都知道同一版」';
      if (r.why === 'no-beliefs') return '投影台账：信念账上一行都没有（0 条）—— 没人登记过版本，不是「所有人都知道同一版」';
      if (r.why === 'project-refused') return '投影台账：' + t.refused + ' 个话题全部被投影拒收（见诊断面逐条原因）';
      return '投影台账：' + t.topics + ' 个话题 / ' + t.beliefs + ' 条信念 · 座位 ' + t.seats
        + '（有说法 ' + t.held + ' · 登记无内容 ' + t.bare + ' · 一概不知 ' + t.unaware + '）'
        + ' · 说法分歧 ' + t.distinct + ' 处 · 与事实不符 ' + t.distorted
        + (t.truncated ? (' · 被座位上限截断 ' + t.truncated + ' 处') : '');
    }
    return r.line || '';
  }

  /** 唯一读数出口（对外名字）。空读数不冒充「干净」。 */
  function summaryText(r) {
    if (!r || r.ok !== true) return '';
    return lineOf(r) || ('观察投影：' + whyText(r.why));
  }

  /** 诊断面：逐条写明在不在、开没开、被拒的为什么被拒。 */
  function diagnose() {
    var out = [];
    var OP = WA.observationProjection;
    out.push('[观察投影] v' + VERSION + ' · observationProjection ' + ((OP && typeof OP.project === 'function') ? '在' : '缺'));
    var cfg = null;
    try { cfg = (OP && typeof OP.settings === 'function') ? OP.settings() : null; } catch (e) { cfg = null; }
    out.push('  总开关 ' + (cfg ? (cfg.enabled ? '开' : '关') : '读不到') + (cfg ? (' · 座位上限 ' + cfg.maxSeats) : ''));
    var r = scan({ top: MAX_TOP });
    out.push('  ' + (lineOf(r) || ('why=' + r.why)));
    var all = r.all || [];
    for (var i = 0; i < all.length; i++) {
      var g = all[i];
      if (!g.ok) { out.push('  · 「' + clip(g.topic, 24) + '」 被拒：' + whyText(g.why) + (g.err ? ('（' + clip(g.err, 60) + '）') : '')); continue; }
      var parts = [];
      var gs = g.groups || [];
      for (var j = 0; j < gs.length && j < 4; j++) parts.push('「' + clip(gs[j].text, 18) + '」×' + gs[j].who.length);
      if (gs.length > 4) parts.push('…共 ' + gs.length + ' 种');
      out.push('  · 「' + clip(g.topic, 24) + '」 ' + g.seats + ' 座 / 说法 ' + g.distinct + ' 种'
        + (parts.length ? ('：' + parts.join('、')) : '')
        + (g.distorted ? (' · 与事实不符 ' + g.distorted) : '')
        + (g.truncated ? (' · 截断 ' + g.lost) : ''));
    }
    var t = r.totals || {};
    out.push('  逐条来源：epistemicStore.beliefs（' + t.beliefs + ' 行）· legacy 跳过 ' + t.legacy + ' 行 / 坏行 ' + t.orphan + ' 行');
    out.push('  边界：不写 beliefs、不改 faithful、不判「该不该让他知道」；座位由 observationProjection 划，被上限截断的如实记，不并进「一概不知」。');
    return out.join(String.fromCharCode(10));
  }

  function stat() { return { scans: _stat.scans, last: _stat.last ? JSON.parse(JSON.stringify(_stat.last)) : null }; }
  function __reset() { _stat.scans = 0; _stat.last = null; return true; }

  WA.projectionBridge = {
    VERSION: VERSION,
    scan: scan,
    view: view,
    lineOf: lineOf,
    summaryText: summaryText,
    diagnose: diagnose,
    stat: stat,
    __reset: __reset
  };
})();

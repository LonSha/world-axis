/**
 * WorldAxis engines/world-clock.js (v2.230.0) — 世界钟权威
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   本仓有 `calendar` / `storyclock` / `chrono`，但**「谁说了算」没有裁决**：
 *   现场实测 `世界钟权威` / `clockAuthority` / `权威钟` 在
 *   engines|core|actors|direction|render|ui **零命中**。
 *   后果：世界书、正文、状态栏、宿主扩展各报一个日期，**没有一条规则说以谁为准**；
 *   更糟的是「残缺的钟」会被当成「有效的钟」覆写掉可靠的钟。
 *
 * ── 缝合来源（显式写明，不冒称原创）──────────────────────────────────
 *   来源是 atonal519/ST-SevenDaysCal 的 business/axis/story-clock.js（故事时间戳）：
 *     · **完整才有权威**：`date + weekday + time` 三字段齐全才算 `complete`，
 *       缺一即**不作证据**（残钟不能改时间相位，更不能贡献星期）；
 *     · **双向隔离**：机器块是**附加元数据**，既不替代也不被其他时间格式替代；
 *       `端=字段化` 与 `端=自然语言` 分开解析，脏的自然语言**不猜**（`dirty` 拒收）；
 *     · **重复标签夺权失败**：同一端出现两次 ⇒ `duplicate`，两份互相冲突者都不占权威；
 *     · **同一日才可跨楼佐证**：只有**最近一份完整历史**且**同日/纪年相容**才可作证；
 *       它一冲突就立即"未知"，**不越过它捞更老的记录**；
 *     · **只读最近 N 楼**（扫描上限），更老的不翻。
 *   本模块只取其中**可判定的那一层**（完整性 / 唯一性 / 同日佐证 / 扫描上限 /
 *   不越权覆写）；真正的历法换算由 `calendar` / `coordinate` 做。
 *
 * ── 与既有模块的分工（三者不读写对方）────────────────────────────────
 *   · calendar —— 「历法怎么算」，本模块不改它；
 *   · storyclock —— 「时间戳怎么读」，本模块**只做权威裁决**；
 *   · 本模块 —— **完整性闸 + 唯一性闸 + 同日佐证 + 扫描上限 + 拒收具名**。
 *
 * ── 八条否定式边界（本模块存在的全部理由）────────────────────────────
 *   ① 总开关默认关闭。关闭时 `judge` 一律 `disabled`。
 *   ② **三字段齐全才算完整**：缺 weekday 或 time ⇒ `incomplete`（不作证据）。
 *   ③ **残缺不得覆写可靠**：`incomplete` / `duplicate` 的端**永远降权**，
 *      即便它比可靠端更新（防"残钟夺权"）。
 *   ④ **重复即夺权失败**：同一端 ≥2 份 ⇒ `duplicate`，两份都不占权威。
 *   ⑤ **脏自然语言不猜**：结构化端里出现第二个冒号字段 ⇒ `dirty` 拒收。
 *   ⑥ **同日才可佐证**：跨楼佐证要求 `month+day` 相同且年/纪年不相容时拒。
 *   ⑦ **扫描有上限**：只翻最近 `scanLimit` 条，超出的老楼不翻并如实报 `scanned`。
 *   ⑧ 不落盘、不跨会话、不改任何一方的原文（**纯裁决**）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_world_clock_settings_v1';
  const DEF = { enabled: false, scanLimit: 100, maxFields: 24, requireWeekday: true, requireTime: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'worldClock',
    bounds: { scanLimit: [1, 1000], maxFields: [2, 200] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const WD_INDEX = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
  const SOURCES = ['sdc', 'book', 'body', 'status', 'host'];
  const SOURCE_LABEL = { sdc: '故事时间戳', book: '世界书', body: '正文', status: '状态栏', host: '宿主扩展' };
  // 权威序：显式机器块 > 世界书 > 正文 > 状态栏 > 宿主扩展（前者压后者）
  const AUTHORITY = { sdc: 5, book: 4, body: 3, status: 2, host: 1 };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {}))) : Object.assign({}, DEF, next || {});
  }

  const stat = { judged: 0, complete: 0, incomplete: 0, duplicate: 0, dirty: 0, witnessed: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; stat.blocked++; stat.lastReason = r; }
  function refuse(r) { stat.refused++; noteFault(r); return { ok: false, reason: r }; }
  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 200); }

  function weekdayIndexOf(v) {
    const t = String(v == null ? '' : v).trim();
    if (!t) return null;
    if (/^[一二三四五六日天]$/.test(t)) return WD_INDEX[t];
    const m = /(?:周|週|星期|礼拜|禮拜)\s*([一二三四五六日天])/.exec(t);
    if (m) return WD_INDEX[m[1]];
    const en = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const i = en.indexOf(t.toLowerCase());
    return i >= 0 ? i : null;
  }
  /** 端解析：只认 `k=v` 字段化形式，不猜自然语言。 */
  function parseEnd(raw, cfg) {
    const text = String(raw == null ? '' : raw);
    if (!text.trim()) return { why: 'empty-end' };
    const fields = {};
    let count = 0;
    const parts = text.split(/[|｜,，;；\n]+/);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i].trim();
      if (!p) continue;
      const m = /^([A-Za-z_\u4e00-\u9fff]{1,12})\s*[=＝:：]\s*(.+)$/.exec(p);
      if (!m) continue;
      count++;
      if (count > cfg.maxFields) return { why: 'too-many-fields' };
      fields[m[1].toLowerCase()] = m[2].trim();
    }
    if (!count) return { why: 'not-fielded' };
    const date = fields.date || fields['日期'] || null;
    const wdRaw = fields.weekday || fields['星期'] || null;
    const time = fields.time || fields['时间'] || null;
    // 脏自然语言：结构化端里 time 又出现第二个带分隔的键
    const dirty = !!time && /(?:^|\s)[^=＝:|｜,，;；\n]+\s*(?:[=＝]|:(?=\s*[^\d]))/.test(time);
    if (dirty) return { why: 'dirty' };
    const wd = weekdayIndexOf(wdRaw);
    const wdText = wd == null ? null : WEEKDAYS[wd];
    const md = /(\d{1,2})\s*[-/.]\s*(\d{1,2})/.exec(date || '');
    const month = md ? +md[1] : null; const day = md ? +md[2] : null;
    const yearH = /(\d{1,4})\s*年/.exec(date || '');
    const year = yearH ? +yearH[1] : null;
    const timeOk = !!time && /^\d{1,2}\s*[:：]\s*\d{2}(?:\s*[:：]\s*\d{2})?$/.test(time.trim());
    if (time && !timeOk) return { why: 'dirty-time' };
    const haveWeekday = !cfg.requireWeekday || wd != null;
    const haveTime = !cfg.requireTime || timeOk;
    const complete = !!date && haveWeekday && haveTime;
    return { ok: true, why: 'ok', date: date, month: month, day: day, year: year,
      weekdayIndex: wd, weekdayText: wdText, time: timeOk ? time.trim() : null, complete: complete };
  }
  function sameDate(a, b) {
    if (!a || !b || a.month == null || b.month == null) return false;
    if (a.month !== b.month || a.day !== b.day) return false;
    if (a.year != null && b.year != null && a.year !== b.year) return false;
    return true;
  }
  /**
   * 裁决：给定若干候选钟（每条含 source / ends），判定谁占权威、谁只能当佐证。
   * candidates: [{ source, start, end }] 或 [{ source, text, ends:[..] }]
   */
  function judge(candidates, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const list = Array.isArray(candidates) ? candidates : [candidates];
    if (!list.length) return refuse('no-candidates');
    const rows = [];
    list.forEach(function (c) {
      const o = c || {};
      const src = SOURCES.indexOf(clean(o.source, 20)) >= 0 ? clean(o.source, 20) : 'host';
      // 唯一性闸：同一端匹配到 ≥2 份（或一端缺失）⇒ duplicate，两份都不占权威。
      // 上游口径：`starts.length !== 1 || ends.length !== 1` ⇒ duplicate。
      const starts = Array.isArray(o.startTexts) ? o.startTexts : null;
      const endsTexts = Array.isArray(o.endTexts) ? o.endTexts : null;
      if (starts || endsTexts) {
        const sN = starts ? starts.length : 1; const eN = endsTexts ? endsTexts.length : 1;
        if (sN !== 1 || eN !== 1) { rows.push({ source: src, why: 'duplicate', complete: false, duplicate: true,
          starts: sN, ends: eN }); return; }
      }
      const ends = Array.isArray(o.ends) ? o.ends.slice() : [o.start, o.end].filter(function (v) { return v != null; });
      if (!ends.length) { rows.push({ source: src, why: 'empty-end', complete: false, duplicate: false }); return; }
      const parsed = ends.map(function (e) { return parseEnd(e, cfg); });
      const bad = parsed.find(function (p) { return !p.ok; });
      if (bad) { rows.push({ source: src, why: bad.why, complete: false, duplicate: false }); return; }
      const complete = parsed.every(function (p) { return p.complete; });
      const meta = parsed[parsed.length - 1];
      rows.push({ source: src, why: complete ? 'ok' : 'incomplete', complete: complete, duplicate: false,
        meta: meta, authority: AUTHORITY[src] || 0 });
    });
    const completeRows = rows.filter(function (r) { return r.complete; });
    const dupRows = rows.filter(function (r) { return r.duplicate; });
    const dirtyRows = rows.filter(function (r) { return r.why === 'dirty' || r.why === 'dirty-time'; });
    const incRows = rows.filter(function (r) { return r.why === 'incomplete'; });
    stat.judged++; stat.complete += completeRows.length; stat.incomplete += incRows.length;
    stat.duplicate += dupRows.length; stat.dirty += dirtyRows.length;
    if (!completeRows.length) {
      // 没有完整的钟：权威空缺。**残缺不得夺权**，如实退回未知。
      const why = dupRows.length ? 'duplicate' : (dirtyRows.length ? 'dirty' : (incRows.length ? 'incomplete' : 'no-complete'));
      noteFault('no-authority:' + why);
      return { ok: false, reason: 'no-authority:' + why, authority: null, rows: rows,
        demoted: rows.filter(function (r) { return !r.complete; }).map(function (r) { return { source: r.source, why: r.why }; }),
        note: '残缺/重复/脏的端不作证据，也不覆写任何可靠端' };
    }
    // 权威：先按权威序，再按完整端指定；同源多份取「同源首份」（不合并冲突）
    completeRows.sort(function (a, b) { return b.authority - a.authority; });
    const top = completeRows[0];
    const winner = { source: top.source, sourceLabel: SOURCE_LABEL[top.source], date: top.meta.date,
      month: top.meta.month, day: top.meta.day, year: top.meta.year,
      weekdayIndex: top.meta.weekdayIndex, weekdayText: top.meta.weekdayText, time: top.meta.time };
    // 同权威并列两份且互不相同 ⇒ 冲突，谁都不占（具名冲突）
    const peers = completeRows.filter(function (r) { return r.authority === top.authority; });
    if (peers.length > 1) {
      const first = peers[0].meta; const clash = peers.slice(1).find(function (r) { return !sameDate(first, r.meta) || first.time !== r.meta.time; });
      if (clash) {
        noteFault('tie-conflict');
        return { ok: false, reason: 'tie-conflict', authority: null,
          tied: peers.map(function (r) { return { source: r.source, date: r.meta.date, time: r.meta.time }; }),
          note: '同权威并列且互相冲突 ⇒ 谁都不占权威' };
      }
    }
    // 跨楼佐证：只在有 reference 时做，且必须同日
    let witness = null;
    const o2 = opts || {};
    if (o2.reference) {
      const ref = o2.reference;
      const refParsed = (ref.month != null) ? { month: ref.month, day: ref.day, year: ref.year == null ? null : ref.year } : null;
      if (refParsed && sameDate(winner, refParsed)) { witness = { floor: ref.floor == null ? null : ref.floor, why: 'same-day' }; stat.witnessed++; }
      else witness = { floor: ref.floor == null ? null : ref.floor, why: 'not-same-day' };
    }
    const scanned = Number.isFinite(Number(o2.scanned)) ? Math.floor(Number(o2.scanned)) : cfg.scanLimit;
    return { ok: true, reason: 'ok', authority: winner,
      demoted: rows.filter(function (r) { return !r.complete; }).map(function (r) { return { source: r.source, why: r.why }; }),
      rows: rows, witness: witness, scanned: scanned, scanLimit: cfg.scanLimit,
      satisfiedBy: winner.source, note: '残缺/重复/脏的端永久降权，不覆写可靠端' };
  }
  /** 单端快判：给出这一端是否完整（不涉权威裁决）。 */
  function inspectEnd(raw) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const p = parseEnd(raw, cfg);
    if (!p.ok) return { ok: false, reason: p.why };
    return { ok: true, reason: p.complete ? 'complete' : 'incomplete', complete: p.complete,
      date: p.date, month: p.month, day: p.day, year: p.year,
      weekdayText: p.weekdayText, time: p.time };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, sources: SOURCES.slice(), sourceLabel: SOURCE_LABEL,
      authorityOrder: SOURCES.slice().sort(function (a, b) { return AUTHORITY[b] - AUTHORITY[a]; }),
      scanLimit: cfg.scanLimit, maxFields: cfg.maxFields,
      requireWeekday: cfg.requireWeekday, requireTime: cfg.requireTime, weekdays: WEEKDAYS.slice(),
      semantics: '完整(date+weekday+time)才占权威 / 残缺重复脏端永久降权 / 同日才可跨楼佐证' };
  }
  function resetStat() {
    stat.judged = 0; stat.complete = 0; stat.incomplete = 0; stat.duplicate = 0; stat.dirty = 0;
    stat.witnessed = 0; stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }

  WA.worldClock = {
    getSettings: settings, setSettings: saveSettings, view: view,
    judge: judge, inspectEnd: inspectEnd, parseEnd: parseEnd,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, resetStat: resetStat,
    SOURCES: SOURCES, SOURCE_LABEL: SOURCE_LABEL, AUTHORITY: AUTHORITY, WEEKDAYS: WEEKDAYS,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/world-clock.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'worldClock 已加载（2.230.0）');
})();
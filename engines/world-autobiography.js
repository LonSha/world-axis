/**
 * WorldAxis engines/world-autobiography.js（v2.292.0 · V7 EXV7-8）
 * 世界自传：这一局跑下来，世界变成了什么样。
 *
 * 【EXV7-8 立项原文】复用 V6 世界日记 + EXV7-1 简报 + `chrono.chronicle`，
 *   按「章」压缩长局（每 N 轮一章），产出**可导出**的世界自传。
 *   **明确不做**：不生成新情节、不替玩家叙事、不碰 `store` 写面。
 *
 * 【本模块答的问题，与三个既有读口都不是同一问】
 *   chrono.chronicle   答「逐条发生了什么」（时间序扁平列表，长局会滚成几百条）；
 *   worldDiary.build   答「这几轮镜头外发生了什么」（只覆盖最近几轮，向前滚动）；
 *   worldBriefing.view 答「这一轮结构化引擎各自吃进几笔」（单轮流水）；
 *   本模块答「**整局下来，世界分几个阶段、每个阶段留了什么**」——
 *   把扁平列表压成有边界的分章，是长局唯一还缺的那一层。
 *   三者都不重复实现：条目集合与「哪些不许进」的判据走 `chrono.chronicle`，
 *   日常与单轮读数只作**尾部附记**引用，不并入章正文。
 *
 * 【七条否定式边界（本模块存在的全部理由）】
 *   ① **不生成新情节**：章正文逐条来自条目原文（`title` + `text`），
 *      零新增叙述句。没有 `summary` 的条目如实留空 —— 不补写、不润色、不衔接。
 *   ② **不替玩家叙事**：不写「玩家做了什么」这类句子。玩家视角的因果归正文模型，
 *      本模块只摘世界侧已归档的事实。
 *   ③ **不碰 `store` 写面**：不 `transact`、不 `save`、不 `patch`、不新建容器。
 *      `reads` / `exports` 只是本模块自己的内存读数，与存档无关。
 *   ④ **不猜轮**：条目没有 `round` 就不给它编一个。轮坐标按 `at` 从存档建索引，
 *      同一时刻出现两条不同轮号 ⇒ 该时刻的轮坐标**判为不可信**并记 null（见 `roundIndexOf`）。
 *   ⑤ **不折算时间**：章边界只用「两个都带轮号的相邻条目之间的**轮差**」——
 *      轮差是同一把尺子上的减法，不需要任何换算率。**绝不用 `at` 减去某个基准去折轮**。
 *   ⑥ **不静默丢**：`hidden` 条目只计数不进正文（与 `chrono.chronicle` 同口径）；
 *      超出 `maxChapters` 的章、超出 `maxLines` 的条目都如实回带 `dropped`。
 *   ⑦ **不骗人有几章**：无任何轮信息而长局超出体积上限时，退化成「按条数切章」，
 *      并把 `chapterMode` 显式报成 `by-volume` —— 读者不会误以为那是按轮切的。
 *
 * 【导出面（7 口）】
 *   getSettings / setSettings / autobiography / exportText / buildBlock / stat / reset
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};
  const LS_KEY = 'worldaxis_world_autobiography_settings_v1';
  const DEF = {
    enabled: true,
    chapterRounds: 5,      // 主口径：相邻两条**都带轮号**且轮差 ≥ N ⇒ 在此断章
    maxChapters: 12,       // 最多几章（超出取**最近**的，如实报 dropped）
    maxLines: 6,           // 每章最多摘几条（压缩机，不是生成器）
    maxEntries: 240,       // 从编年史取多少条（有界；chrono 自身硬上限 256）
    volumeChapterSize: 24  // 退化口径：无轮信息时每章几条
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'worldAutobiography',
    bounds: {
      chapterRounds: [1, 30], maxChapters: [1, 24], maxLines: [1, 12],
      maxEntries: [24, 256], volumeChapterSize: [4, 64]
    } };
  // filter + concat（不是裸 concat）：同一 key 第二次装载不许在登记面留下两条。
  WA.__settingsRegs = (WA.__settingsRegs || [])
    .filter(function (r) { return !r || r.key !== LS_KEY; }).concat([__REG]);
  const __stat = {
    reads: 0, exports: 0, chapters: 0, lines: 0, dropped: 0,
    byRound: 0, byVolume: 0, roundMisses: 0,
    faults: {}, lastReason: ''
  };
  function fault(k) { __stat.faults[k] = (__stat.faults[k] || 0) + 1; __stat.lastReason = k; }
  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 60)
      : String(v == null ? '' : v).slice(0, max || 60);
  }
  function num(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }
  function clamp(v, lo, hi, fb) {
    const n = num(v);
    return (n === null) ? fb : Math.max(lo, Math.min(hi, Math.floor(n)));
  }
  function settings() {
    const raw = (WA.settingsBus && typeof WA.settingsBus.read === 'function')
      ? WA.settingsBus.read(__REG) : DEF;
    const merged = Object.assign({}, DEF, raw || {});
    return (WA.settingsBus && typeof WA.settingsBus.normalize === 'function')
      ? WA.settingsBus.normalize(__REG, merged) : merged;
  }
  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    if (WA.settingsBus && typeof WA.settingsBus.saveOrThrow === 'function') {
      const norm = (typeof WA.settingsBus.normalize === 'function')
        ? WA.settingsBus.normalize(__REG, merged) : merged;
      return WA.settingsBus.saveOrThrow(__REG, norm);
    }
    return merged;
  }
  /**
   * 轮坐标索引：`at -> round | null`。
   *
   * 为什么要这张表：`chrono.chronicle()` 的行**不带 `round`**（它以 `at` 排序，刻意把
   *   内部轮号从读数面剥掉）。而「每 N 轮一章」只能用轮号做减法 —— 用 `at` 折算轮号
   *   需要换算率，本仓没有、也不许造。所以轮号从**真源**（`store.chronicle`）按 `at` 取。
   *
   * 冲突口径（关键）：同一个 `at` 上允许挂多条（同一毫秒内写了两笔），但只要它们的
   *   `round` 不一致，这个时刻的轮坐标就**判为不可信**、整格记 `null`。
   *   宁可少一章轮标签，也不给读者一个错的轮号 —— 轮号一旦错，章的先后就全错。
   */
  function roundIndexOf() {
    const idx = {};
    let s = null;
    try { s = (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : null; } catch (e) { s = null; }
    const chron = (s && Array.isArray(s.chronicle)) ? s.chronicle : [];
    chron.forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      const at = num(c.at);
      if (at === null) return;
      const r = num(c.round);
      const k = String(at);
      if (!Object.prototype.hasOwnProperty.call(idx, k)) { idx[k] = r; return; }
      if (idx[k] !== r) idx[k] = null;
    });
    return idx;
  }
  /** 条目集合：走 `chrono.chronicle`（hidden 过滤 / 排序 / 上限判据都在那里，不重写）。 */
  function collect(cfg) {
    if (!WA.chrono || typeof WA.chrono.chronicle !== 'function') {
      return { ok: false, reason: 'chrono-absent' };
    }
    let r = null;
    try { r = WA.chrono.chronicle({ limit: cfg.maxEntries }); } catch (e) { return { ok: false, reason: 'chrono-threw' }; }
    if (!r || r.ok !== true) return { ok: false, reason: 'chronicle-refused' };
    const idx = roundIndexOf();
    const rows = (Array.isArray(r.rows) ? r.rows : []).map(function (x) {
      const at = num(x.at);
      const k = (at === null) ? null : String(at);
      const round = (k !== null && Object.prototype.hasOwnProperty.call(idx, k)) ? idx[k] : null;
      return {
        at: at === null ? 0 : at,
        kind: clean(x.label || x.kind, 20) || 'event',
        title: clean(x.title, 80),
        text: clean(x.text, 120),
        round: round,
        refs: Array.isArray(x.refs) ? x.refs.slice(0, 4) : []
      };
    });
    const missed = rows.filter(function (x) { return x.round === null; }).length;
    __stat.roundMisses += missed;
    return {
      ok: true, rows: rows, total: num(r.total) || rows.length,
      hiddenCount: num(r.hiddenCount) || 0, capped: !!r.capped, roundMisses: missed
    };
  }
  /**
   * 断章计划。**只用轮差**，绝不折算时间。
   *
   * 主口径 `by-round`：相邻两条**都带轮号**且 `b - a >= chapterRounds` ⇒ 在中间断。
   *   一条缺轮号就可能漏掉一个真实的阶段边界 —— 这是**已知上限**，如实报在
   *   `roundMisses` 里，而不是给它补一个轮号把边界找回来。
   * 退化口径 `by-volume`：一条边界都没找到、且条目数超过 `volumeChapterSize` 时，
   *   按条数切。此时 `chapterMode` 报 `by-volume`，读者能看出「这不是按轮切的」。
   */
  function planBreaks(rows, cfg) {
    const gaps = [];
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1].round, b = rows[i].round;
      if (a !== null && b !== null && (b - a) >= cfg.chapterRounds) gaps.push(i);
    }
    if (gaps.length) return { mode: 'by-round', gaps: gaps, degraded: false };
    if (rows.length > cfg.volumeChapterSize) {
      const g = [];
      for (let i = cfg.volumeChapterSize; i < rows.length; i += cfg.volumeChapterSize) g.push(i);
      return { mode: 'by-volume', gaps: g, degraded: true };
    }
    // 一章装得下、也没找到轮边界 ⇒ 谈不上退化（口径仍是轮，只是本局没跨过 N 轮）。
    return { mode: 'by-round', gaps: [], degraded: false };
  }
  /** 章内一行：只用条目原文，不加任何衔接词（边界 ①②）。 */
  function lineOf(x) {
    return '· ' + (x.title || '（无题）') + (x.text ? '：' + x.text : '');
  }
  function sliceChapters(rows, plan, cfg) {
    const all = [];
    const gaps = plan.gaps;
    let start = 0;
    for (let g = 0; g <= gaps.length; g++) {
      const end = (g < gaps.length) ? gaps[g] : rows.length;
      if (end <= start) { start = end; continue; }
      const seg = rows.slice(start, end);
      const rounds = seg.map(function (x) { return x.round; })
        .filter(function (v) { return v !== null; });
      const kinds = {};
      seg.forEach(function (x) { kinds[x.kind] = (kinds[x.kind] || 0) + 1; });
      const shownRows = seg.slice(0, cfg.maxLines);
      all.push({
        index: all.length + 1,
        from: seg[0].at, to: seg[seg.length - 1].at,
        rounds: rounds.length ? { min: Math.min.apply(null, rounds), max: Math.max.apply(null, rounds) } : null,
        count: seg.length, shown: shownRows.length, dropped: seg.length - shownRows.length,
        kinds: kinds,
        lines: shownRows.map(lineOf),
        entries: shownRows.map(function (x) {
          return { at: x.at, kind: x.kind, title: x.title, text: x.text, round: x.round, refs: x.refs };
        })
      });
      start = end;
    }
    return all;
  }
  /**
   * 主读面：分章自传。
   *
   * 两种「没得看」必须可分：模块关着（`reason:'disabled'`）≠ 一条归档都没有
   *   （`ok:true, chapters:0`）≠ 源缺席（`reason:'chrono-absent'`）。
   *   未知一律不许冒充「没有」。
   */
  function autobiography(opts) {
    const cfg = settings();
    const o = (opts && typeof opts === 'object') ? opts : {};
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled', chapters: 0 }; }
    const eff = Object.assign({}, cfg, {
      chapterRounds: clamp(o.chapterRounds, 1, 30, cfg.chapterRounds),
      maxChapters: clamp(o.maxChapters, 1, 24, cfg.maxChapters),
      maxLines: clamp(o.maxLines, 1, 12, cfg.maxLines),
      maxEntries: clamp(o.maxEntries, 24, 256, cfg.maxEntries),
      volumeChapterSize: clamp(o.volumeChapterSize, 4, 64, cfg.volumeChapterSize)
    });
    const src = collect(eff);
    if (!src.ok) { fault(src.reason); return { ok: false, reason: src.reason, chapters: 0 }; }
    __stat.reads++;
    if (!src.rows.length) {
      __stat.lastReason = 'empty';
      return {
        ok: true, chapterMode: 'by-round', degraded: false, chapters: 0, total: 0,
        chaptersTotal: 0, droppedChapters: 0, hiddenCount: src.hiddenCount,
        roundMisses: src.roundMisses, rows: [], byKind: {},
        storyLabel: storyLabel(),
        note: '这一局的归档里还没有任何一条已结算的事 —— 不是「读不到」，是确实还没发生'
      };
    }
    const plan = planBreaks(src.rows, eff);
    const all = sliceChapters(src.rows, plan, eff);
    const droppedChapters = Math.max(0, all.length - eff.maxChapters);
    // 超出上限时保留**最近**的几章（长局的历史会滚出视图，与 chronicle-view 同口径）
    const kept = droppedChapters > 0 ? all.slice(-eff.maxChapters) : all;
    const byKind = {};
    src.rows.forEach(function (x) { byKind[x.kind] = (byKind[x.kind] || 0) + 1; });
    const lines = kept.reduce(function (s, c) { return s + c.shown; }, 0);
    const droppedLines = kept.reduce(function (s, c) { return s + c.dropped; }, 0);
    __stat.chapters += kept.length;
    __stat.lines += lines;
    __stat.dropped += droppedLines + droppedChapters;
    if (plan.mode === 'by-round') __stat.byRound++; else __stat.byVolume++;
    __stat.lastReason = 'built';
    return {
      ok: true,
      chapterMode: plan.mode, degraded: plan.degraded,
      chapters: kept.length, chaptersTotal: all.length, droppedChapters: droppedChapters,
      total: src.rows.length, lines: lines, droppedLines: droppedLines,
      hiddenCount: src.hiddenCount, roundMisses: src.roundMisses,
      cappedBySource: src.capped,
      rows: kept, byKind: byKind,
      storyLabel: storyLabel(),
      appendix: appendix(),
      note: (plan.mode === 'by-round'
        ? '按轮断章：只用两个都带轮号的相邻条目之间的轮差，不折算时间'
        : '本局没有任何两条相邻条目同时带轮号 ⇒ 退化为按条数切章（chapterMode=by-volume，不是按轮切的）')
        + '；章正文逐条摘自归档原文，未生成新叙述；hidden 条目只计数不进正文'
    };
  }
  /** 剧情钟标签（缺席如实留空，不猜日期）。 */
  function storyLabel() {
    if (WA.playtime && typeof WA.playtime.story === 'function') {
      try { const s = WA.playtime.story(); if (s && s.ok) return s.label; } catch (e) {}
    }
    try {
      const st = (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : {};
      const l = String(((st || {}).clock || {}).label || '').trim();
      return l || '';
    } catch (e) { return ''; }
  }
  /**
   * 尾部附记：V6 世界日记 + EXV7-1 简报的**当场读数**。
   *
   * 为什么并进章正文是错的：世界日记只覆盖最近几轮（向前滚动），简报只覆盖单轮流水，
   *   两者都不属于「某一章」；塞进章里会让同一段时间出现两条来源、且章边界对它们无意义。
   *   所以只作附记引用，各自的缺席也各自如实报（缺席 ≠ 空）。
   */
  function appendix() {
    const out = {};
    out.diary = (function () {
      if (!WA.worldDiary || typeof WA.worldDiary.build !== 'function') {
        return { absent: true, why: 'engines/world-diary.js 的 build 缺席' };
      }
      try {
        const d = WA.worldDiary.build({ maxLines: 3 });
        if (!d) return { absent: true, why: 'build 无返回' };
        if (d.ok !== true) return { absent: false, quiet: true, why: d.reason || 'refused', lines: [] };
        return { absent: false, quiet: !!d.quiet, lines: (d.lines || []).slice(0, 3), dropped: num(d.dropped) || 0 };
      } catch (e) { return { absent: true, why: 'build 抛错' }; }
    })();
    out.briefing = (function () {
      if (!WA.worldBriefing || typeof WA.worldBriefing.view !== 'function') {
        return { absent: true, why: 'engines/world-briefing.js 的 view 缺席' };
      }
      try {
        const v = WA.worldBriefing.view();
        if (!v || v.available !== true) {
          return { absent: false, quiet: true, why: (v && v.reason) || 'no-snapshot', lines: [] };
        }
        const rows = (Array.isArray(v.rows) ? v.rows : []).filter(function (r) { return r.now !== null; });
        return {
          absent: false, quiet: !rows.length, round: v.round,
          written: num(v.written) || 0, sources: rows.length,
          lines: rows.slice(0, 4).map(function (r) {
            return '· ' + clean(r.label, 40) + '：' + (r.now === null ? '核对不到' : String(r.now))
              + (r.delta === null ? '（上轮无基线）' : '（+' + String(r.delta) + '）');
          })
        };
      } catch (e) { return { absent: true, why: 'view 抛错' }; }
    })();
    return out;
  }
  /**
   * 可导出文本。**只拼已算好的东西**：章头（计数）+ 逐条原文 + 附记。
   * 不新增任何叙述句（边界 ①），不写盘、不下载（拿到字符串之后由消费方决定去处）。
   */
  function exportText(opts) {
    const r = autobiography(opts);
    if (r.ok !== true) {
      return { ok: false, reason: r.reason, markdown: '', chapters: 0, chars: 0 };
    }
    const head = ['# 世界自传'];
    head.push('');
    head.push('> ' + (r.storyLabel ? '剧情时间：' + r.storyLabel : '剧情时间：未设定（世界钟缺席，不猜日期）')
      + ' · 共 ' + r.chapters + ' 章' + (r.droppedChapters ? '（另有 ' + r.droppedChapters + ' 章已略去）' : '')
      + ' · 归档 ' + r.total + ' 条 · 口径：' + (r.chapterMode === 'by-round' ? '按轮断章' : '按条数断章'));
    head.push('> 本自传逐条摘自世界归档原文，**未生成新情节、未替玩家叙事**；'
      + 'hidden 条目只计数（' + r.hiddenCount + ' 条）不进正文。');
    const body = [];
    r.rows.forEach(function (c) {
      body.push('');
      const rl = c.rounds ? (' · 轮 ' + c.rounds.min + '～' + c.rounds.max) : '';
      body.push('## 第 ' + c.index + ' 章' + rl + ' · ' + c.count + ' 条');
      c.lines.forEach(function (l) { body.push(l); });
      if (c.dropped > 0) body.push('（本章另有 ' + c.dropped + ' 条未摘录）');
    });
    const app = [];
    const d = r.appendix.diary;
    if (d && !d.absent) {
      app.push('');
      app.push('### 附记 · 世界日记（最近几轮镜头外）');
      if (!d.lines || !d.lines.length) app.push('（这几轮镜头外无事 —— 不是「没读到」）');
      else d.lines.forEach(function (l) { app.push('· ' + l); });
    }
    const b = r.appendix.briefing;
    if (b && !b.absent) {
      app.push('');
      app.push('### 附记 · 本轮引擎产出');
      if (!b.lines || !b.lines.length) app.push('（尚未结算过一轮 —— 简报在每轮世界结算后生成）');
      else b.lines.forEach(function (l) { app.push(l); });
    }
    const md = head.concat(body, app).join('\n');
    __stat.exports++;
    return {
      ok: true, markdown: md, chapters: r.chapters, chars: md.length,
      chapterMode: r.chapterMode,
      // 导出也有界：字符上限只用于提示（不截断内容），超长由消费方自己决定怎么用
      large: md.length > 12000,
      note: '文本仅供导出/复制；本模块不写盘、不下载'
    };
  }
  /** 注入侧块：只给最近一章的摘要行（不把整部自传塞进正文）。 */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const r = autobiography({ maxChapters: 3, maxLines: 2 });
    if (r.ok !== true || !r.rows.length) return '';
    const lines = r.rows.map(function (c) {
      return '第 ' + c.index + ' 章（' + c.count + ' 条）' + (c.lines.length ? '：' + c.lines.join('；') : '');
    });
    return '[世界自传·近三章]' + String.fromCharCode(10) + lines.join(String.fromCharCode(10))
      + String.fromCharCode(10) + '以上是这世界此前分阶段的归档摘录；只供你把握世界走向，'
      + '不要据此编造尚未发生的事，也不要点明「这是第几章」。';
  }
  function stat() {
    return {
      reads: __stat.reads, exports: __stat.exports, chapters: __stat.chapters,
      lines: __stat.lines, dropped: __stat.dropped,
      byRound: __stat.byRound, byVolume: __stat.byVolume, roundMisses: __stat.roundMisses,
      lastReason: __stat.lastReason, faults: Object.assign({}, __stat.faults),
      enabled: !!settings().enabled,
      // 三路来源各自在不在场：缺一路不是「没事发生」（本仓反复强调的分栏）
      sources: {
        chrono: !!(WA.chrono && typeof WA.chrono.chronicle === 'function'),
        worldDiary: !!(WA.worldDiary && typeof WA.worldDiary.build === 'function'),
        worldBriefing: !!(WA.worldBriefing && typeof WA.worldBriefing.view === 'function'),
        store: !!(WA.store && typeof WA.store.get === 'function')
      }
    };
  }
  function reset() {
    __stat.reads = 0; __stat.exports = 0; __stat.chapters = 0; __stat.lines = 0;
    __stat.dropped = 0; __stat.byRound = 0; __stat.byVolume = 0; __stat.roundMisses = 0;
    __stat.lastReason = ''; __stat.faults = {};
    return true;
  }
  WA.worldAutobiography = {
    getSettings: settings, setSettings: saveSettings,
    autobiography: autobiography, exportText: exportText,
    buildBlock: buildBlock, stat: stat, reset: reset,
    DEF: Object.assign({}, DEF)
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/world-autobiography.js', { kind: 'engine', ver: '2.292.0' });
  }
  if (WA.log) WA.log('info', '世界自传已加载（只读分章聚合）');
})();

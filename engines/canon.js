/**
 * WorldAxis engines/canon.js (v2.99.0)
 * 原著分幕：把一部长文本切成分层可定位的「幕 → 剧情点」骨架（只切分，不改写）。
 *
 * 缝合来源：Persona-Arena `src/canon.js`（ADR-0009「原著整理成「幕 → 剧情点」，
 *   罗盘先定位再推演」）。它的 TXT 流水线原话是：
 *   「逐段提取剧情点 → 每 N 段合并成节 → 模型按阶段分幕（幕数约为节数/6）→ 写概览」，
 *   并明确一条**信息量纪律**：「信息量随篇幅线性增长，而非压到固定长度」。
 *
 * 本仓为什么需要它：
 *   本仓的全部叙事状态都是**世界侧**的（currents / echoes / chronicle / causal.chains），
 *   清一色是「这个世界自己长出来的历史」。**没有任何一处记录「原著里本该长什么样」**——
 *   实测 `幕目` / `剧情点` / `原著` 在 core|engines|actors|direction|render|compat|ui 全零命中。
 *   后果是一类结构性盲区：原著向玩法（同人、翻改、二周目）最贵的问题
 *   「**现在演到原著哪一段了**」在本仓不可答，只能靠人记；
 *   而「已偏离原著哪一段」「哪一段已经不可能再发生」这两个更贵的问题，
 *   连**输入面**都没有（没有幕坐标，就没有偏离的基准）。
 *
 * 边界（**全是否定式**）：
 *   1 总开关默认关闭；关闭时不切分、不采纳、不注入。
 *   2 **只切分，不改写**：本模块从不修改用户给的原著文本，也不生成原著内容。
 *      切分在**句级无损**：每一句都落进了某个剧情点（`truncated.totalPoints` 是截断前
 *      实际产出的点数，不是原文字符数）。点只保留题名与长度，**正文本身不进存储**（见口径 5）
 *      ——所以「点正文按句拼接」这件事不发生：句间空白（换行与连续空格）是唯一在账上丢掉的东西。
 *   3 **不调模型**：分幕是纯算术（按字符与段落边界合并），不调 apiRouter。
 *      「用模型分幕」是上游做法，本仓不放：模型分幕不可复现，而幕坐标一旦不可复现，
 *      「上次定位到第 3 幕」这句话就没有意义。
 *   4 **信息量随篇幅线性**：幕数由「节数 / 每幕节数」决定，**不是固定拍数**。
 *   5 原著文本**不入存档**：它由调用方传入（面板粘贴 / 导入），本模块只把**大纲**落盘
 *      （有界、体积与篇幅无关——与 §4 的「线性」不矛盾：线性的是幕数，不是存档）。
 *   6 未采纳的大纲不落盘：`buildOutline` 纯计算（不写 store、不写 stat 以外的全局、不注入），
 *      `adopt` 是唯一写入口。
 *   7 截断**必须报出**：`truncated.acts` / `truncated.points` 各自独立，
 *      并且**先截点再分幕**——顺序反了会分出一批「点全被砍掉」的空幕。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_canon_settings_v1';
  const DEF = {
    enabled: false,
    // 一段的目标字符数（切分粒度，越小幕越密）
    segChars: 1200,
    // 一个剧情点至少多少字（低于此则并入上一个点 → 避免碎片化）
    minPointChars: 40,
    // 一个剧情点最多多少字（超过则按句切）
    maxPointChars: 400,
    // 每幕合并多少「节」（节 = perAct 个剧情点）。ADR-0009 的「幕数 ≈ 节数/6」即此值取 6。
    perAct: 6,
    // 幕数硬上限（超出报 truncated，不静默丢弃）
    maxActs: 24,
    // 剧情点总数硬上限（先于分幕生效）
    maxPoints: 600
  };
  const __REG = {
    key: LS_KEY, def: DEF, module: 'canon',
    bounds: { segChars: [200, 20000], minPointChars: [10, 2000], maxPointChars: [40, 8000],
      perAct: [1, 40], maxActs: [1, 200], maxPoints: [20, 5000] }
  };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    const merged = Object.assign({}, DEF, raw || {});
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, merged) : merged;
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const LIMITS = { MAX_TEXT: 4000000, MAX_ACTS: 200, MAX_POINTS: 5000, TITLE: 60, BRIEF: 12, ACTS_KEEP: 60,
    // v2.100.0（第五十七面）：对位面三个上界。单次对位文本上限 / 每源取最近多少行 / 报出的共有片段数。
    MAX_ALIGN_TEXT: 20000, ALIGN_ROWS: 24, ALIGN_KEEP: 8 };
  const stat = { builds: 0, adopted: 0, cleared: 0, blocked: 0, truncated: 0, faults: {},
    // v2.100.0：对位面三个计数。**与 builds / adopted / cleared 分列**——
    //   「我看了几眼对位」与「我整理了几次原著」是两件事，挤进同一个计数器就再也分不出。
    signals: 0, aligns: 0, gaps: 0,
    lastReason: '', lastActs: 0, lastPoints: 0, lastChars: 0, lastAt: 0 };
  function noteFault(kind, e) {
    try { stat.faults[kind] = (stat.faults[kind] || 0) + 1; } catch (x) {}
    try { if (WA.log) WA.log('warn', '原著分幕：' + kind + ' 失败', e || null); } catch (x) {}
  }
  function clean(v, max) {
    try { return WA.inputGuard.text(v, max || LIMITS.TITLE); }
    catch (e) { const s = (v == null) ? '' : String(v); return s.replace(/\s+/g, ' ').trim().slice(0, max || LIMITS.TITLE); }
  }
  // inputGuard.num 是**两参**（v, fallback）——不是 (v, lo, hi)。钳制由本函数自理：
  //   越界值不许静默夹到边界（那是「替调用方做了决定」），一律回落到设置里的默认值。
  function pick(v, lo, hi, dft) {
    let n;
    try { n = WA.inputGuard.num(v, dft); } catch (e) { n = Number(v); }
    if (!isFinite(n)) n = dft;
    return (n >= lo && n <= hi) ? n : dft;
  }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }

  // ── 切分：句 → 点 → 节 → 幕（纯算术，不调模型）────────────────
  // 句边界只认中文句末标点与换行。**不认英文句点**：网文里的「Mr.」「3.5」会被切碎。
  const SENT_RE = /[。！？!?…]+|\n+/g;
  function splitSentences(t) {
    const out = [];
    let start = 0;
    SENT_RE.lastIndex = 0;
    let m;
    while ((m = SENT_RE.exec(t)) !== null) {
      const piece = t.slice(start, m.index + m[0].length);
      if (piece.trim()) out.push(piece);
      start = m.index + m[0].length;
    }
    if (start < t.length) {
      const tail = t.slice(start);
      if (tail.trim()) out.push(tail);
    }
    return out;
  }
  // 段：按换行聚到 segChars 附近；单行超长（无换行的巨型段落）再按句切一刀。
  function segmentText(t, segChars) {
    const out = [];
    let cur = '';
    t.split('\n').forEach(function (line) {
      if (cur && (cur.length + line.length + 1) > segChars) { out.push(cur); cur = ''; }
      cur += (cur ? '\n' : '') + line;
    });
    if (cur) out.push(cur);
    const flat = [];
    out.forEach(function (s) {
      if (s.length <= segChars * 2) { flat.push(s); return; }
      let buf = '';
      splitSentences(s).forEach(function (sn) {
        if (buf && (buf.length + sn.length) > segChars) { flat.push(buf); buf = ''; }
        buf += sn;
      });
      if (buf) flat.push(buf);
    });
    return flat.map(function (s, i) { return { i: i, chars: s.length, text: s }; });
  }
  // 点：把一个段切成若干「剧情点」。点号**全局连续**（跨段不重号），
  //   否则 `A3.5` 这类坐标在跨段时会指到两个不同的点。
  function pointsOf(seg, cfg, globalStart) {
    const out = [];
    let cur = '';
    let n = globalStart;
    // 落点：**未达 minPointChars 不落点**（留着与后续句子合并），force = 段尾强制收尾。
    //   为什么不「并进上一个已完成的点」：那会写出一个点**撤回不了**的脏改
    //   （改 chars 与 title 而不改正文），而段落边界是切分的天然分界——
    //   跨段合并会让「点」不再是「段内的点」，坐标也就指不回原文了。
    function flush(force) {
      const body = cur.trim();
      if (!body) { cur = ''; return; }
      if (!force && body.length < cfg.minPointChars) return;   // 攒着
      cur = '';
      n++;
      out.push({ no: n, seg: seg.i, chars: body.length, title: titleOf(body) });
    }
    splitSentences(seg.text).forEach(function (sn) {
      // 只在「已达最小长度」时才因超长而切；否则短句会被 max/min 两个阈值夹死。
      if (cur && (cur.length + sn.length) > cfg.maxPointChars && cur.trim().length >= cfg.minPointChars) flush(false);
      cur += sn;
    });
    flush(true);
    return out;
  }
  function titleOf(body) {
    const first = splitSentences(body)[0] || body;
    return clean(String(first).replace(/\s+/g, ' ').trim(), LIMITS.TITLE);
  }
  /**
   * 分幕（纯计算，零副作用）。
   *   幕数 = ceil(节数 / perAct)，节 = ceil(点数 / perAct)。
   *   这就是 ADR-0009 的「幕数 ≈ 节数/6」——**两段式合并**，不是固定拍数。
   *   顺序纪律：**先截点、再分幕**（先分幕后截点会产出空幕）。
   */
  function buildOutline(text, opts) {
    const raw = String(text == null ? '' : text);
    if (!raw.trim()) { stat.blocked++; stat.lastReason = 'empty-text'; return { ok: false, reason: 'empty-text' }; }
    if (raw.length > LIMITS.MAX_TEXT) {
      stat.blocked++; stat.lastReason = 'too-long';
      return { ok: false, reason: 'too-long', chars: raw.length, max: LIMITS.MAX_TEXT };
    }
    let out = null;
    try {
      // opts 是**试算参数**（面板上「调个数字看看效果」那一路），它同样要过边界：
      //   此前 opts 直接并进 cfg 而**绕过全部钳制**，于是 `perAct: 0` 会让分幕循环步长为零
      //   （`i += 0` 永不前进）——那不是「算错一个数」，是把面板连同回归一起挂住。
      //   归一化本身也在 try 内：调参调崩了要与「你给的东西不对」分开报（build-throw），
      //   而不是把异常抛给调用方（面板的 on() 里没有 try，抛出去就是「点了没反应」）。
      //   与 pick 同一取舍：越界一律**回落设置里的默认值**，不静默夹到边界
      //   （夹到边界会让「你填的 999」看起来像是被接受了）。
      const base = settings();
      const o = opts || {};
      const cfg = Object.assign({}, base);
      if (o.segChars !== undefined) cfg.segChars = pick(o.segChars, 200, 20000, base.segChars);
      if (o.minPointChars !== undefined) cfg.minPointChars = pick(o.minPointChars, 10, 2000, base.minPointChars);
      if (o.maxPointChars !== undefined) cfg.maxPointChars = pick(o.maxPointChars, 40, 8000, base.maxPointChars);
      if (o.perAct !== undefined) cfg.perAct = pick(o.perAct, 1, 40, base.perAct);
      if (o.maxActs !== undefined) cfg.maxActs = pick(o.maxActs, 1, LIMITS.MAX_ACTS, base.maxActs);
      if (o.maxPoints !== undefined) cfg.maxPoints = pick(o.maxPoints, 20, LIMITS.MAX_POINTS, base.maxPoints);
      const segs = segmentText(raw, cfg.segChars);
      let pts = [], g = 0;
      segs.forEach(function (s) { const row = pointsOf(s, cfg, g); g += row.length; pts = pts.concat(row); });
      const totalPoints = pts.length;
      let pointCut = false;
      if (totalPoints > cfg.maxPoints) { pts = pts.slice(0, cfg.maxPoints); pointCut = true; }
      const sects = [];
      for (let i = 0; i < pts.length; i += cfg.perAct) sects.push(pts.slice(i, i + cfg.perAct));
      const acts = [];
      for (let i = 0; i < sects.length; i += cfg.perAct) {
        const group = sects.slice(i, i + cfg.perAct);
        let chars = 0;
        const flat = [];
        group.forEach(function (sec) {
          sec.forEach(function (p) { chars += p.chars; flat.push(p); });
        });
        acts.push({
          no: acts.length + 1,
          title: flat.length ? flat[0].title : '（空幕）',
          chars: chars,
          pointFrom: flat.length ? flat[0].no : null,
          pointTo: flat.length ? flat[flat.length - 1].no : null,
          points: flat.map(function (p) { return { no: p.no, seg: p.seg, title: p.title, chars: p.chars }; })
        });
      }
      const totalActs = acts.length;
      let actCut = false, kept = acts;
      if (totalActs > cfg.maxActs) { kept = acts.slice(0, cfg.maxActs); actCut = true; }
      if (actCut || pointCut) stat.truncated++;
      stat.builds++;
      stat.lastActs = kept.length;
      stat.lastPoints = pts.length;
      stat.lastChars = raw.length;
      stat.lastAt = clockNow('canon');
      stat.lastReason = (actCut || pointCut) ? 'truncated' : 'ok';
      out = { ok: true, acts: kept, segs: segs.length, points: pts.length,
        chars: raw.length, perAct: cfg.perAct, segChars: cfg.segChars,
        truncated: { acts: actCut, points: pointCut, totalActs: totalActs, totalPoints: totalPoints } };
    } catch (e) {
      noteFault('build', e); stat.blocked++; stat.lastReason = 'build-throw';
      return { ok: false, reason: 'build-throw' };
    }
    return out;
  }
  function outline() { const s = state(); return (s.canon && s.canon.outline) || null; }
  /**
   * 采纳（唯一写入口）：把大纲落盘。**原著全文不落盘**——落的是可定位的骨架。
   *   已采纳过 ⇒ 覆盖并留下 `replacedAt`（不静默替换，返回值带 `replaced`）。
   */
  function adopt(built, sourceNote) {
    if (!(built && built.ok)) { stat.blocked++; stat.lastReason = 'bad-outline'; return { ok: false, reason: 'bad-outline' }; }
    const prev = outline();
    const row = {
      acts: built.acts.slice(0, LIMITS.MAX_ACTS),
      acts0: built.truncated.totalActs,
      points0: built.truncated.totalPoints,
      chars: built.chars, segs: built.segs, perAct: built.perAct, segChars: built.segChars,
      truncated: { acts: !!built.truncated.acts, points: !!built.truncated.points },
      note: clean(sourceNote, 80),
      adoptedAt: clockNow('canon'),
      replacedAt: prev ? (prev.adoptedAt || 0) : 0
    };
    let out = null;
    try {
      WA.store.transact(function (draft) {
        if (!draft.canon || typeof draft.canon !== 'object') draft.canon = { outline: null };
        draft.canon.outline = row;
        out = { ok: true, acts: row.acts.length, points: row.points0, replaced: !!prev };
      }, 'canon:adopt');
    } catch (e) {
      noteFault('adopt', e); stat.blocked++; stat.lastReason = 'adopt-throw';
      return { ok: false, reason: 'adopt-throw' };
    }
    if (out && out.ok) { stat.adopted++; stat.lastReason = 'adopted'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function clearOutline() {
    if (!outline()) { stat.blocked++; stat.lastReason = 'no-outline'; return { ok: false, reason: 'no-outline' }; }
    let out = null;
    try {
      WA.store.transact(function (draft) {
        if (draft.canon) draft.canon.outline = null;
        out = { ok: true };
      }, 'canon:clear');
    } catch (e) {
      noteFault('clear', e); stat.blocked++; stat.lastReason = 'clear-throw';
      return { ok: false, reason: 'clear-throw' };
    }
    stat.cleared++; stat.lastReason = 'cleared';
    return out || { ok: false, reason: 'store-unavailable' };
  }
  // ── 定位：幕/点坐标（O2 未覆盖项的「语义坐标」落点）────────────
  // 坐标形如 `A3`（第 3 幕）/ `A3.5`（第 3 幕第 5 点）。**标出来的，不是猜的**：
  //   越界一律照实不成立（out-of-range），不夹到边界。
  function coordOf(actNo, pointNo) {
    const a = pick(actNo, 1, LIMITS.MAX_ACTS, 0);
    if (!a) return null;
    if (pointNo === undefined || pointNo === null || pointNo === '') return { text: 'A' + a, act: a, point: null };
    const p = pick(pointNo, 1, LIMITS.MAX_POINTS, 0);
    if (!p) return null;
    return { text: 'A' + a + '.' + p, act: a, point: p };
  }
  const COORD_RE = /^A(\d{1,3})(?:\.(\d{1,4}))?$/;
  function locate(coord) {
    const o = outline();
    if (!o) { stat.blocked++; stat.lastReason = 'no-outline'; return { ok: false, reason: 'no-outline' }; }
    const raw = clean(coord, 20);
    const m = raw.match(COORD_RE);
    if (!m) { stat.blocked++; stat.lastReason = 'bad-coord'; return { ok: false, reason: 'bad-coord', got: raw }; }
    const a = Number(m[1]), p = m[2] ? Number(m[2]) : null;
    const act = (o.acts || []).filter(function (x) { return x && x.no === a; })[0] || null;
    if (!act) {
      stat.blocked++; stat.lastReason = 'out-of-range';
      return { ok: false, reason: 'out-of-range', coord: raw, acts: (o.acts || []).length };
    }
    if (p === null) {
      return { ok: true, coord: 'A' + a, act: a, point: null, title: act.title, chars: act.chars, points: act.points.length };
    }
    const pt = (act.points || []).filter(function (x) { return x && x.no === p; })[0] || null;
    if (!pt) {
      stat.blocked++; stat.lastReason = 'out-of-range';
      return { ok: false, reason: 'out-of-range', coord: raw, points: act.points.length };
    }
    return { ok: true, coord: 'A' + a + '.' + p, act: a, point: p, title: pt.title, chars: pt.chars };
  }
  // 幕目简报（面板用）：只列幕号与题名，**不列点**（点会剧透剧情细节）
  function actsBrief(max) {
    const o = outline();
    const n = pick(max, 1, LIMITS.ACTS_KEEP, LIMITS.BRIEF);
    if (!o) return { ok: false, reason: 'no-outline', rows: [] };
    return { ok: true, total: o.acts0 || o.acts.length, shown: Math.min(n, o.acts.length),
      truncated: !!(o.truncated && o.truncated.acts),
      rows: o.acts.slice(0, n).map(function (a) {
        return { no: a.no, title: a.title, chars: a.chars, points: a.points.length, coord: 'A' + a.no }; }) };
  }
  // 取某一幕的剧情点题名（作者面）
  function actText(actNo) {
    const o = outline();
    if (!o) { stat.blocked++; stat.lastReason = 'no-outline'; return { ok: false, reason: 'no-outline' }; }
    const a = pick(actNo, 1, LIMITS.MAX_ACTS, 0);
    const act = (o.acts || []).filter(function (x) { return x && x.no === a; })[0] || null;
    if (!act) { stat.blocked++; stat.lastReason = 'out-of-range'; return { ok: false, reason: 'out-of-range' }; }
    return { ok: true, act: act.no, title: act.title, chars: act.chars, coord: 'A' + act.no,
      rows: (act.points || []).map(function (p) {
        return { no: p.no, title: p.title, chars: p.chars, coord: 'A' + act.no + '.' + p.no }; }) };
  }
  // ── 注入块：只给幕目，不给剧情细节（剧透边界）────────────────
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const o = outline();
    if (!o || !o.acts || !o.acts.length) return '';
    // 题名末尾的句末标点要剥掉再拼句子：`title` 本身就以「。」结尾（它是首句原文），
    //   直接拼会得到「…了几句。。」——门面文字上的双标点是用户最先看到的那类瑕疵。
    const trim = function (s) { return String(s || '').replace(/[。！？!?…，,；;：:]+$/, ''); };
    const head = o.acts.slice(0, 3).map(function (a) { return 'A' + a.no + ' ' + trim(a.title); }).join('；');
    return '【原著幕目】共 ' + (o.acts0 || o.acts.length) + ' 幕'
      + (o.truncated && o.truncated.acts ? '（已整理 ' + o.acts.length + ' 幕，其余未分）' : '')
      + '。开篇：' + head + '。推进请与幕目对齐，不要提前演出后续幕的事件。';
  }
  // ── 对位（v2.100.0 第五十七面）：拿世界侧历史去撞原著幕目 ────────────
  // 治的病：v2.99.0 只给了**基准**（幕目骨架），把「现在演到原著哪一段了」留在
  //   「只能靠人记」。本版把**可观测的那一半**做出来：把世界侧已经发生的事
  //   （chronicle / currents / echoes / 章节历史）与幕目题名做**字面重叠对位**。
  //
  // **本版不做「偏离判定」**——那是本次刻意不越的线：
  //   同一段剧情，有人要逐句照演、有人只要骨架对上就算没偏。**判定标准是作者的**，
  //   不是引擎的；引擎替作者定标准，等于把「我觉得你写偏了」包装成客观读数。
  //   本版只交两样东西：读数（最接近第几幕）与证据（凭什么）。
  //
  // 边界（全是否定式）：
  //   ① **对的是题名，不是正文**：原著正文不入存档（v2.99.0 口径 5），故粒度是
  //      **题名级**，如实写进返回（`scope`），不假装做过逐句比对。
  //   ② **不调模型**：纯算术（二字窗口交集计数）。
  //   ③ **证据与推断分列**：`evidence`（共有片段）与 `score` 一起交出——
  //      说不出「它说在第 3 幕，凭什么」的读数，等于让人替引擎背书。
  //   ④ **没信号就说没信号**：证据为空一律 `no-signal`，**不给「最接近」的坐标**。
  //      「随便挑一个最像的」与「没对上」在面板上必须长得不一样。
  //   ⑤ **观测不得改变被观测对象**：三个入口全是纯读（不写 store、不改已落盘骨架）；
  //      诊断面 `alignView` 连 stat 都不写。
  //   ⑥ **不替用户回写坐标**：对位结果**不自动** markCoord。O10 立的规矩是
  //      「坐标是标出来的、不是猜的」——对位是猜，猜的输出要人看一眼后**手动**标。
  //   ⑦ 题名归一化后不足 4 字（窗口数 < ALIGN_MIN_NEED）的幕不参与对位（标 `thin`）：
  //      两字撞上不是信号，是噪声。这条是**噪声下限**，不是精度调优。
  const ALIGN_TITLE = '题名级';
  const ALIGN_GRAM = 2;
  // 噪声下限（题名归一化后窗口数 < 此值 ⇒ 不参与对位）。
  //   **不另设 ALIGN_KEEP**：报出几条共有片段只认 LIMITS.ALIGN_KEEP 一处——
  //   同一语义两处真源，日后必然各改一处，于是同一个问题有了两个答案。
  const ALIGN_MIN_NEED = 3;
  const ALIGN_SOURCES = ['chronicle', 'currents', 'echoes', 'chapters'];
  // 只留汉字/字母/数字：标点与空白一律不参与匹配（否则「。」会变成所有题名的共同窗口）
  const NOISE_RE = /[^0-9A-Za-z\u4e00-\u9fa5]/g;
  function flatText(x) { return String(x == null ? '' : x).replace(NOISE_RE, ''); }
  function gramSet(x) {
    const t = flatText(x), out = {};
    for (let i = 0; i + ALIGN_GRAM <= t.length; i++) out[t.slice(i, i + ALIGN_GRAM)] = 1;
    return out;
  }
  /**
   * 一处实现：一个幕题名被这段文本覆盖了多少。
   *   分母取**题名的窗口数**，不是文本的窗口数：世界侧的历史行远长于幕题名，
   *   用 Jaccard 会被长度压死；要问的是「这一幕的题名有多少真的出现在这段历史里」。
   */
  function coverOf(textGrams, title) {
    const keys = Object.keys(gramSet(title));
    if (keys.length < ALIGN_MIN_NEED) return { score: 0, hit: 0, need: keys.length, thin: true, evidence: [] };
    let hit = 0; const ev = [];
    for (let i = 0; i < keys.length; i++) {
      if (textGrams[keys[i]]) { hit++; if (ev.length < LIMITS.ALIGN_KEEP) ev.push(keys[i]); }
    }
    return { score: hit / keys.length, hit: hit, need: keys.length, thin: false, evidence: ev };
  }
  // 一段文本最像哪一幕（平手取幕号小的那一个——顺序稳定才可复现）
  function bestAct(textGrams, acts) {
    let cand = null;
    for (let i = 0; i < acts.length; i++) {
      const act = acts[i];
      if (!act) continue;
      const c = coverOf(textGrams, act.title);
      if (c.hit > 0 && (!cand || c.score > cand.score)) {
        cand = { actNo: act.no, coord: 'A' + act.no, title: act.title,
          score: c.score, hit: c.hit, need: c.need, thin: c.thin, evidence: c.evidence };
      }
    }
    return cand;
  }
  /**
   * 世界侧历史行（只读）。每源取最近 LIMITS.ALIGN_ROWS 行，总数另设上限。
   *   label 是给证据用的「这一行是谁」；没有题名的行照实写 `(无题名)`，不留空串。
   */
  function historyRows(scope) {
    const s = state();
    const want = ALIGN_SOURCES.indexOf(scope) >= 0 ? [scope] : ALIGN_SOURCES;
    const out = [];
    function add(src, label, text) {
      if (out.length >= LIMITS.ALIGN_ROWS * 2) return;
      const t = clean(text, 160);
      if (t) out.push({ src: src, label: clean(label, 40) || '(无题名)', text: t });
    }
    if (want.indexOf('chronicle') >= 0) (s.chronicle || []).slice(-LIMITS.ALIGN_ROWS).forEach(function (c) {
      if (c) add('chronicle', c.title, (c.title || '') + ' ' + (c.summary || ''));
    });
    if (want.indexOf('currents') >= 0) (s.currents || []).slice(-LIMITS.ALIGN_ROWS).forEach(function (c) {
      if (c) add('currents', c.title, (c.title || '') + ' ' + (c.summary || ''));
    });
    if (want.indexOf('echoes') >= 0) (s.echoes || []).slice(-LIMITS.ALIGN_ROWS).forEach(function (c) {
      if (c) add('echoes', c.id, String(c.result || ''));
    });
    if (want.indexOf('chapters') >= 0) {
      const hist = (s.chapters && s.chapters.history) || [];
      const cur = s.chapters && s.chapters.current;
      (cur ? hist.concat([cur]) : hist).slice(-LIMITS.ALIGN_ROWS).forEach(function (c) {
        if (c) add('chapters', c.title, (c.title || '') + ' ' + (c.notes || ''));
      });
    }
    return out;
  }
  /**
   * signal：纯计算。给一段文本，答「它最像哪一幕」并交出证据。**不读 store 之外的任何东西、不落盘。**
   *   拒收三态与 locate / actText 同规格（no-outline / empty-text / too-long），
   *   且都进 stat.blocked —— 「你给的东西不对」是我们这边看得见的账。
   */
  function signal(text, topN) {
    const o = outline();
    if (!o) { stat.blocked++; stat.lastReason = 'no-outline'; return { ok: false, reason: 'no-outline' }; }
    const raw = String(text == null ? '' : text);
    if (!raw.trim()) { stat.blocked++; stat.lastReason = 'empty-text'; return { ok: false, reason: 'empty-text' }; }
    if (raw.length > LIMITS.MAX_ALIGN_TEXT) {
      stat.blocked++; stat.lastReason = 'too-long';
      return { ok: false, reason: 'too-long', chars: raw.length, max: LIMITS.MAX_ALIGN_TEXT };
    }
    const tg = gramSet(raw);
    const n = pick(topN, 1, LIMITS.ALIGN_ROWS, LIMITS.ALIGN_KEEP);
    const rows = (o.acts || []).map(function (act) {
      if (!act) return null;
      const c = coverOf(tg, act.title);
      return { actNo: act.no, coord: 'A' + act.no, title: act.title,
        score: c.score, hit: c.hit, need: c.need, thin: c.thin, evidence: c.evidence };
    }).filter(function (r) { return r && r.hit > 0; })
      .sort(function (x, y) { return (y.score - x.score) || (x.actNo - y.actNo); });
    stat.signals++;
    stat.lastReason = rows.length ? 'signal' : 'no-signal';
    if (!rows.length) {
      return { ok: false, reason: 'no-signal', scope: ALIGN_TITLE,
        grams: Object.keys(tg).length, acts: (o.acts || []).length };
    }
    return { ok: true, scope: ALIGN_TITLE, grams: Object.keys(tg).length,
      best: rows[0], rows: rows.slice(0, n), hitActs: rows.length, acts: (o.acts || []).length };
  }
  /**
   * 对位的纯算核心（**零 stat 写入**）——用户面与诊断面共用这一处实现。
   *   为什么单拎出来：诊断面调它时不能涨任何计数（「看一眼」不该改账），
   *   而用户面拒收时该记账。口径分叉点只允许在**外层包一层**，不允许两处各写一套算法。
   */
  function alignCalc(scope) {
    const o = outline();
    if (!o || !o.acts || !o.acts.length) return { ok: false, reason: 'no-outline' };
    const rows = historyRows(scope);
    const sources = {};
    rows.forEach(function (r) { sources[r.src] = (sources[r.src] || 0) + 1; });
    if (!rows.length) return { ok: false, reason: 'no-history', sources: sources };
    const scored = rows.map(function (r) {
      return { src: r.src, label: r.label, cand: bestAct(gramSet(r.text), o.acts) };
    });
    const hit = scored.filter(function (x) { return !!x.cand; });
    // 一行都没撞上 ⇒ 照实说没信号，**不给坐标**（口径④）
    if (!hit.length) return { ok: false, reason: 'no-signal', rows: rows.length, sources: sources, scope: ALIGN_TITLE };
    const byAct = {};
    hit.forEach(function (x) {
      const k = x.cand.actNo;
      if (!byAct[k]) byAct[k] = { actNo: k, coord: x.cand.coord, title: x.cand.title, votes: 0, score: 0, evidence: [], rows: [] };
      byAct[k].votes++;
      // 分取该幕的**最高分**（票数答「几行指向它」，分答「指得多准」，两个都要）
      if (x.cand.score > byAct[k].score) { byAct[k].score = x.cand.score; byAct[k].evidence = x.cand.evidence; }
      if (byAct[k].rows.length < 3) byAct[k].rows.push(x.label);
    });
    const rank = Object.keys(byAct).map(function (k) { return byAct[k]; })
      .sort(function (a, b) { return (b.votes - a.votes) || (b.score - a.score) || (a.actNo - b.actNo); });
    const arch = o.acts.length;
    const total = o.acts0 || arch;
    const top = rank[0];
    return { ok: true, scope: ALIGN_TITLE, rows: rows.length, hitRows: hit.length, sources: sources,
      best: top, runners: rank.slice(1, 3), hitActs: rank.length, acts: arch, total: total,
      passed: top.actNo, remain: Math.max(0, total - top.actNo),
      truncated: { acts: !!(o.truncated && o.truncated.acts), points: !!(o.truncated && o.truncated.points) } };
  }
  /**
   * position：用世界侧历史对位（用户面）。拒收写 stat.blocked，成功记 stat.aligns。
   *   `opts.scope` 只能是 ALIGN_SOURCES 里的一个；给别的（含空）一律**四源全扫**，
   *   不报错——因为「不指定」是正常用法，而拼错的 scope 名回落成「全扫」也不会给出错答案。
   */
  function position(opts) {
    const r = alignCalc(clean((opts && opts.scope) || '', 20));
    if (!r.ok) { stat.blocked++; stat.lastReason = r.reason; return r; }
    stat.aligns++; stat.lastReason = 'aligned';
    return r;
  }
  /**
   * gap：幕目推进度。**只报数，不判偏离**——「还剩 4 幕」是事实，「所以你不该在这里」是判定。
   *   坐标语法/越界沿用既有词汇（bad-coord / out-of-range），不另造词。
   */
  function gap(coord) {
    const o = outline();
    if (!o) { stat.blocked++; stat.lastReason = 'no-outline'; return { ok: false, reason: 'no-outline' }; }
    const raw = clean(coord, 20);
    const m = raw.match(COORD_RE);
    if (!m) { stat.blocked++; stat.lastReason = 'bad-coord'; return { ok: false, reason: 'bad-coord', got: raw }; }
    const a = Number(m[1]);
    const arch = (o.acts || []).length;
    if (!(a >= 1 && a <= arch)) {
      stat.blocked++; stat.lastReason = 'out-of-range';
      return { ok: false, reason: 'out-of-range', coord: raw, acts: arch, total: o.acts0 || arch };
    }
    const total = o.acts0 || arch;
    stat.gaps++; stat.lastReason = 'gap';
    return { ok: true, coord: 'A' + a, act: a, total: total, archived: arch,
      passed: a, remain: Math.max(0, total - a), truncated: !!(o.truncated && o.truncated.acts) };
  }
  /**
   * alignView：诊断面的只读对位视图（**零 stat 写入**，口径⑤）。
   *   未采纳原著、世界侧还没历史、一行都没撞上——三种都**不是故障**，
   *   故一律 `ok:true` + `hasSignal:false` + 到底哪一步没戏（reason）。
   *   报成 error 会让「刚装上还没用」看起来像坏了（与 actsBrief 同一取舍）。
   */
  function alignView() {
    const o = outline();
    if (!o || !o.acts || !o.acts.length) return { ok: true, adopted: false, hasSignal: false };
    const r = alignCalc('');
    if (!r.ok) {
      return { ok: true, adopted: true, hasSignal: false, reason: r.reason,
        rows: r.rows || 0, sources: r.sources || {} };
    }
    return { ok: true, adopted: true, hasSignal: true, coord: r.best.coord, actNo: r.best.actNo,
      title: r.best.title, score: r.best.score, votes: r.best.votes, evidence: r.best.evidence,
      runners: r.runners.map(function (x) { return x.coord + '(' + x.votes + '/' + x.score.toFixed(2) + ')'; }),
      rows: r.rows, hitRows: r.hitRows, hitActs: r.hitActs, sources: r.sources,
      acts: r.acts, total: r.total, passed: r.passed, remain: r.remain,
      cutActs: !!(r.truncated && r.truncated.acts), cutPoints: !!(r.truncated && r.truncated.points) };
  }
  // ── 只读视图 ─────────────────────────────────────────────
  function outlineView() {
    const o = outline();
    if (!o) return { ok: true, adopted: false, acts: 0, acts0: 0, points: 0, chars: 0 };
    return { ok: true, adopted: true, acts: o.acts.length, acts0: o.acts0 || o.acts.length,
      points: o.points0 || 0, chars: o.chars || 0, segs: o.segs || 0,
      perAct: o.perAct, segChars: o.segChars,
      truncated: { acts: !!(o.truncated && o.truncated.acts), points: !!(o.truncated && o.truncated.points) },
      note: o.note || '', adoptedAt: o.adoptedAt || 0, replacedAt: o.replacedAt || 0 };
  }

  WA.canon = {
    LIMITS: LIMITS,
    getSettings: settings,
    setSettings: saveSettings,
    buildOutline: buildOutline,
    adopt: adopt,
    clearOutline: clearOutline,
    locate: locate,
    coordOf: coordOf,
    actsBrief: actsBrief,
    actText: actText,
    buildBlock: buildBlock,
    outlineView: outlineView,
    // v2.100.0（第五十七面）：对位面四口，**每口一个真消费方**——
    //   signal / position / gap 三枚面板按钮（贴文本试算 / 用世界侧历史对位 / 看推进度），
    //   alignView 由诊断 secCanon.align 消费。四口全是纯读，不替用户回写坐标。
    signal: signal,
    position: position,
    gap: gap,
    alignView: alignView,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();
/**
 * WorldAxis ui/assistant.js (v0.3) — 世界助手对话（缝合 酒馆询问机，就世界状态问答）
 *
 * v2.208.0（E1 证据问答）：旧版只喂一份**固定快照**（最近 10 人 / 8 暗流 / 10 事实），
 *   于是三件事同时成立：「超出快照范围的历史找不到」「回答没有依据」「没查着与查不了长得一样」。
 *   本版把回答建立在**现场检索**之上，四条判据写死在代码里：
 *     ① 检索先行：提问串先拆词，再走 historySearch.search()（六面）与 noesis 渠道；
 *        世界状态快照降为**补充材料**（仍保留，负责「现在怎么样」这类实时问题）；
 *     ② 每条事实性回答要有依据：模型须对断言回填 [n] 引用号，引用号由**代码**核对
 *        —— 只认落在本次检索真实返回行上的号（citations 不由模型自称）；
 *     ③ 没证据要说没证据：命中 0 行 ⇒ citations: [] 且 none === true，
 *        提示词里明写「查不到就说查不到，不许编」；
 *     ④ 查不了也要说出来：blind / deferred / notCovered 原样带出，与「命中 0」分列。
 *
 * 视角纪律（E1 验收第 4 条）：检索**之前**先按当前观测视角收窄候选面。
 *   WA.perspective.getView().view === 'player' 时，rules / entries 两面被摘掉
 *   （作者侧设定面，正文角色不该经由问答读到），并记进 droppedFaces；
 *   摘掉的面照样进 notCovered，不静默消失。全知视角下六面全开。
 *   这是**检索面**的闸，与 outletAllowed（出口面闸）互补，两处各治一条泄漏面。
 *
 * 边界：本文件只读世界，不写任何容器。ask() 的唯一副作用是调一次模型 API。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const CIT_MAX = 12;    // 送进提示词的行上限（引用号空间 = 1..CIT_MAX）
  const SNIP_MAX = 140;  // 单行正文截断
  const PLAYER_DENY_FACES = ['rules', 'entries'];  // 玩家视角下摘掉的作者侧设定面
  const STOPWORDS = ['的', '了', '吗', '呢', '是', '在', '有', '和', '与', '为什么', '怎么',
    '什么', '哪', '谁', '会', '不', '这', '那', '他', '她', '它', '我', '你'];

  const stat = { asks: 0, refusals: 0, cited: 0, uncited: 0, noEvidence: 0, blindRuns: 0,
    viewFiltered: 0, rowsOffered: 0, lastMs: 0, lastReason: null, faults: {} };

  function clean(v, n) {
    const s = String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim();
    return s.length > (n || 80) ? s.slice(0, n) : s;
  }
  function noteFault(k) { try { stat.faults[k] = (stat.faults[k] || 0) + 1; } catch (e) { /* 计量失败不影响主流程 */ } }
  /** 当前世界时刻。时钟缺席时退到本机时间 —— **只有这一处**兜底，不在别处再取一次「现在」。 */
  function clockNow() {
    let t = null;
    try { if (WA.clock && typeof WA.clock.now === 'function') t = WA.clock.now('assistant'); }
    catch (e) { noteFault('clock-threw'); }
    return (typeof t === 'number' && isFinite(t)) ? t : Date.now();
  }

  /** 当前观测视角。读不到就当归作者视角 —— 与 perspective「未装载=不拦」的默认一致。 */
  function viewNow() {
    try {
      if (WA.perspective && typeof WA.perspective.getView === 'function') {
        const v = WA.perspective.getView();
        if (v && v.view) return v.view;
      }
    } catch (e) { noteFault('view-threw'); }
    return 'omniscient';
  }

  /** 提问拆词：中英混排，剔停用词与单字噪声。**可能返回空表** —— 空表不是「查过没有」，
   *  而是「这次提问里没有被检索的词」，调用方必须走 `noTerms` 通道如实说出（不静默当成零命中）。 */
  function terms(q) {
    const raw = String(q === null || q === undefined ? '' : q);
    const out = [];
    function push(t) {
      const s = clean(t, 24);
      if (!s || s.length < 2 || STOPWORDS.indexOf(s) >= 0 || out.indexOf(s) >= 0) return;
      out.push(s);
    }
    (raw.match(/[A-Za-z0-9_]{2,}/g) || []).forEach(push);
    // 中文：先按停用词**切开**，只把残留片段当候选词 —— 否则「的了是吗呢」这种纯噪声串
    //   会被 3 字窗切成「的了是」并当成可检索词（那正是「没词可查」被伪装成「查过」的入口）。
    const CH_STOP = new RegExp(STOPWORDS.filter(function (w) { return w.length === 1; }).join('|'), 'g');
    (raw.match(/[\u4e00-\u9fa5]{2,}/g) || []).forEach(function (chunk) {
      chunk.split(CH_STOP).forEach(function (piece) {
        push(piece);
        if (piece.length >= 5) {
          for (let i = 0; i + 3 <= piece.length && i < 6; i++) push(piece.slice(i, i + 3));
        }
      });
    });
    return out.slice(0, 6);
  }

  /** 六面检索一轮：逐词查、按 (face,ref) 去重；把「没查全」的证据一并带回。 */
  function gather(q, opts) {
    const o = opts || {};
    const view = viewNow();
    const hs = WA.historySearch;
    const rows = [], taken = {};
    const blind = {}, deferred = {}, notCovered = {};
    const used = [];
    let faces = null, droppedFaces = [];

    // —— 视角闸：先于检索收窄候选面，而不是拿到全知结果再摘行 ——
    if (view === 'player' && o.respectView !== false) {
      const known = (hs && Array.isArray(hs.FACES)) ? hs.FACES.slice() : [];
      if (known.length) {
        faces = known.filter(function (f) { return PLAYER_DENY_FACES.indexOf(f) < 0; });
        droppedFaces = known.filter(function (f) { return PLAYER_DENY_FACES.indexOf(f) >= 0; });
        droppedFaces.forEach(function (f) { notCovered[f] = 'view-filtered'; });
      }
    }
    if (!hs || typeof hs.search !== 'function') {
      return { ok: false, reason: 'no-search-face', rows: [], blind: [], deferred: [],
        notCovered: [], droppedFaces: [], terms: [], view: view, calls: 0, short: true };
    }

    const ts = terms(q);
    let calls = 0;
    // 无可检索词：**不许**静默当成「六面全查过、零命中」—— 那会把「我没能提问」
    //   说成「世界没记录」。单列 noTerms，与「查了没有 / 没查全」三足鼎立。
    if (!ts.length) {
      // reason 码与 reason:'no-search-face' 同族 —— 调用方（面板/诊断）能凭码分流，
      //   不必去猜「零命中」到底是没词、没查全、还是真没有。
      return { ok: true, view: view, terms: [], calls: 0, noTerms: true, reason: 'no-terms',
        rows: [], totalRows: 0, blind: [], deferred: [], notCovered: [], droppedFaces: droppedFaces,
        short: true };
    }
    ts.forEach(function (t) {
      const args = { limit: CIT_MAX };
      if (faces) args.faces = faces;
      let r = null;
      try { r = hs.search(t, args); } catch (e) { noteFault('search-threw'); r = null; }
      calls++;
      if (!r || r.ok !== true) {
        // 检索口自己拒收：整轮记为「查不了」，而不是空结果
        const ks = (r && Array.isArray(r.known) && r.known.length) ? r.known : ['*'];
        ks.forEach(function (f) { blind[f] = (r && r.reason) || 'search-refused'; });
        return;
      }
      used.push(t);
      (r.rows || []).forEach(function (x) {
        const rid = String((x && x.face) || '') + '|' + String((x && x.ref) || '');
        if (taken[rid]) return;
        taken[rid] = true;
        rows.push(x);
      });
      (r.blind || []).forEach(function (f) { if (!blind[f]) blind[f] = 'source-refused'; });
      (r.deferred || []).forEach(function (f) { if (!deferred[f]) deferred[f] = 'scan-capped'; });
      (r.notCovered || []).forEach(function (f) { if (!notCovered[f]) notCovered[f] = 'not-covered'; });
    });

    const blindList = Object.keys(blind);
    const deferredList = Object.keys(deferred);
    const ncList = Object.keys(notCovered).sort();
    return {
      ok: true, view: view, terms: used, calls: calls, noTerms: false,
      rows: rows.slice(0, CIT_MAX), totalRows: rows.length,
      blind: blindList, deferred: deferredList, notCovered: ncList, droppedFaces: droppedFaces,
      // 「没查全」= 读不到 + 挡下 + 视角摘掉；三者与「命中 0」都不许长得一样
      short: (blindList.length + deferredList.length + ncList.length) > 0
    };
  }

  /** 世界状态补充材料（旧版那份快照，保留，但降级为补充而非唯一依据）。 */
  function snapshot() {
    let s = null;
    try { s = (WA.store && typeof WA.store.get === 'function') ? WA.store.get() : null; } catch (e) { noteFault('store-threw'); }
    if (!s) return null;
    const people = (s.people && typeof s.people === 'object') ? Object.keys(s.people) : [];
    return {
      clock: (s.clock && s.clock.label) || null,
      // 快照自报「我只有这么多」：截断必须可见，别让模型以为这就是全世界
      peopleCount: people.length,
      people: people.slice(0, 10).map(function (k) {
        const p = s.people[k] || {};
        return { n: clean(p.name || k, 24), loc: clean(p.location, 20), act: clean(p.action, 24) };
      }),
      peopleTrimmed: Math.max(0, people.length - 10),
      currents: ((s.currents || []).slice(-8)).map(function (c) {
        return { t: clean(c.title, 30), v: c.visibility, st: c.stage };
      }),
      factCount: (s.worldFacts || []).length
    };
  }

  /** 把检索行编成可引用的清单（引用号 = 下标 + 1）。 */
  function evidenceBlock(g, s) {
    const lines = [];
    g.rows.forEach(function (x, i) {
      const face = x.face || '?';
      const at = (x.at === null || x.at === undefined) ? '' : ('@' + x.at);
      lines.push('[' + (i + 1) + '] (' + face + ')' + (x.title || '(无题)') + at
        + ' | ' + clean(x.text || x.snippet || '', SNIP_MAX)
        + ' | 来源口 ' + (x.source || '?'));
    });
    if (s) {
      lines.push('（补充·世界状态快照）在场 ' + s.peopleCount + ' 人'
        + (s.peopleTrimmed ? ('（只列 10 人，另有 ' + s.peopleTrimmed + ' 人未列）') : '')
        + '，暗流 ' + s.currents.length + ' 条，事实 ' + s.factCount + ' 条'
        + '，世界时钟 ' + (s.clock || '无') + '。');
    }
    return lines.join('\n');
  }

  /** 缺口自述：把「没查全」的三种来源 + 「这次没能提问」分开写出来。 */
  function gapBlock(g) {
    const parts = [];
    if (g.noTerms) parts.push('这次提问里没有被检索的词（**没有查过任何面**，不是查了没有）');
    if (g.blind.length) parts.push('读不到的面：' + g.blind.join('/'));
    if (g.deferred.length) parts.push('被扫描上限挡下的面：' + g.deferred.join('/'));
    if (g.droppedFaces && g.droppedFaces.length) {
      parts.push('因当前是玩家视角而**未检索**的面：' + g.droppedFaces.join('/'));
    }
    if (!g.rows.length && !parts.length) return '（本次六面全查过，一条命中都没有 —— 是真的没记录，不是查不了）';
    return parts.length ? ('（本次没查全：' + parts.join('；') + '）') : '（本次六面全部查到，无未查面）';
  }

  /** 从模型回答里抽引用号，并**核对**每个号是否落在本次真实返回的行上。 */
  function citationsOf(text, g) {
    const seen = {}, out = [];
    const re = /\[(\d{1,2})\]/g;
    const t = String(text || '');
    const offered = Array.isArray(g.rows) ? g.rows : [];
    let m;
    while ((m = re.exec(t)) !== null) {
      const n = Number(m[1]);
      const row = (n >= 1 && n <= offered.length) ? offered[n - 1] : null;
      if (!row || typeof row !== 'object') continue;   // 没有对应行 = 号是编的，拒收
      if (seen[n]) continue;
      seen[n] = true;
      out.push({ n: n, face: row.face, ref: row.ref, title: row.title, source: row.source, route: row.route });
    }
    return out.sort(function (a, b) { return a.n - b.n; });
  }

  const SYS = '你是「世界枢轴」助手。回答关于世界、人物、暗流、舆情的问题。'
    + '【硬规则】① 每条事实性断言后面必须标引用号，形如 [3]，号取自【检索证据】里的编号；'
    + '证据里没有的内容一律不许写（不许凭常识补全、不许把那 10 行快照当作全部人物）；'
    + '② 若【检索证据】为空，直接答「查不到对应的世界记录」，并说明是「查了没有」还是「没查全」；'
    + '③ 每条【检索证据】都带来源口，回答末尾用一行「依据：」列出实际用到的编号与来源；'
    + '④ 用户是上帝视角，可透露 hidden 级信息，但要提醒哪些内容正文角色不该知道；'
    + '⑤ 简洁作答，不要复述规则、不要编造引用号。';

  /**
   * 提问 → 检索 → 带引用作答。
   * @param {string} question 提问
   * @param {{respectView?:boolean, withSnapshot?:boolean, maxTokens?:number}} [opts]
   */
  async function ask(question, opts) {
    const o = opts || {};
    stat.asks++;
    const t0 = clockNow();
    const q = clean(question, 400);
    if (!q) { stat.refusals++; stat.lastReason = 'empty-question'; return { ok: false, reason: 'empty-question' }; }
    const cfg = (WA.apiRouter && typeof WA.apiRouter.getChannel === 'function') ? WA.apiRouter.getChannel('default') : null;
    if (!cfg || !cfg.baseUrl || !cfg.model) {
      stat.refusals++; stat.lastReason = 'channel-unconfigured';
      return { ok: false, reason: 'channel-unconfigured' };
    }

    const g = gather(q, o);
    if (!g.ok) { stat.refusals++; stat.lastReason = g.reason; return { ok: false, reason: g.reason, view: g.view }; }
    const s = o.withSnapshot === false ? null : snapshot();
    const user = '【提问】' + q
      + '\n【检索证据】\n' + (evidenceBlock(g, s) || '（无）')
      + '\n【检索缺口】\n' + gapBlock(g);

    let text = null;
    try {
      text = await WA.apiRouter.call('default', [
        { role: 'system', content: SYS },
        { role: 'user', content: user }
      ], { maxTokens: o.maxTokens || 1500, temperature: 0.4 });
    } catch (e) { noteFault('api-threw'); text = null; }
    if (!text) {
      stat.lastReason = 'api-fail'; stat.lastMs = clockNow() - t0;
      return { ok: false, reason: 'api-fail', view: g.view };
    }

    const body = String(text).trim();
    const cites = citationsOf(body, g);
    if (!g.rows.length) { stat.noEvidence++; stat.lastReason = 'no-evidence'; }
    else if (cites.length) { stat.cited++; stat.lastReason = 'cited'; }
    else { stat.uncited++; stat.lastReason = 'uncited'; }
    if (g.blind.length || g.deferred.length || g.notCovered.length) stat.blindRuns++;
    if (g.droppedFaces && g.droppedFaces.length) stat.viewFiltered++;
    stat.rowsOffered += g.rows.length;
    stat.lastMs = clockNow() - t0;
    return {
      ok: true, text: body, view: g.view, terms: g.terms,
      // 依据面：号是**代码核对过的**，不是模型自称的
      citations: cites,
      evidence: { rows: g.rows, offered: g.rows.length, matched: g.totalRows },
      gaps: { blind: g.blind, deferred: g.deferred, notCovered: g.notCovered, droppedFaces: g.droppedFaces,
        noTerms: !!g.noTerms },
      none: g.rows.length === 0,
      short: !!g.short,
      ms: stat.lastMs
    };
  }

  WA.assistant = {
    ask: ask,
    /** 只要检索面（不调模型）：面板「证据」区与测试用。 */
    search: function (q, o) { return gather(q, o || {}); },
    /** 缺口自述（读不到 / 挡下 / 视角摘掉）—— 与「命中 0」分列的对外表达。 */
    gaps: function (q, o) {
      const g = gather(q, o || {});
      if (!g.ok) return { ok: false, reason: g.reason };
      return { ok: true, view: g.view, blind: g.blind, deferred: g.deferred,
        notCovered: g.notCovered, droppedFaces: g.droppedFaces, rows: g.rows.length, short: !!g.short };
    },
    /** 当前视角下会被摘掉的检索面（面板提示用，只读）。 */
    FACE_POLICY: { playerDenied: PLAYER_DENY_FACES.slice() },
    terms: terms,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();

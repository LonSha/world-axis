/**
 * WorldAxis engines/gen-gate.js (v2.189.0) — 生成闸门与防重复名单（缝 B1 + B2）
 *
 * ── 它治什么（缺口，现场实测）──────────────────────────────────
 *   本仓有**许多**「每 N 轮做一次」的自主面：`rhythm-loop` 推相位、`agenda` 报到时、
 *   `proactive` 拉一把、`offline-tick` 补批次。它们各自很克制，但**没有一处回答得了
 *   那句最贵的话**：「这一刻**同时**允许几件事冒出来？」
 *   实测：`minGap` / `生成间隔` / `两次生成` / `跨线` 在 `engines` 零命中
 *   （`proactive` 里那个 `COOLDOWN_ROUNDS` 是**同一个 NPC 连续拉动**的冷却，语义是
 *   「别老拽同一个人」，不是「任意两次自主生成之间至少隔几轮」——两件事）。
 *
 *   缝合来源：SnowIII/story-director（MIT）`README §四道「别一直生成」的闸门`。
 *   原文四道（**全部按轮记账、完全不看墙钟**）：
 *     · 任意两次生成的最小间隔（默认 3）—— **跨线生效**。原文：「没有它，支线和插曲
 *       会在同一轮一起冒出来」；
 *     · 上一章收尾后隔几轮才开下一章（默认 4）—— 留出「余波」的时间；
 *     · 新章开头几轮先不插支线 / 插曲（默认 3）—— 让主线先立住；
 *     · 开间章前再等几轮（默认 3）—— 同上，管间章。
 *   还有一条上游**用事故换来的**细则，本模块照抄：
 *     > 「⚠ 这里**不再看** autoCooldown：收尾是剧情已经发生的事实，不该被「刚生成过支线 /
 *     >   插曲」这种无关的节流推迟（以前正是它让「拍演完却不换章」）。冷却要在收尾之后才生效。」
 *   故 `chapter` / `interlude-chapter` 两档**豁免整机闸门**，只看「余波」那一档 ——
 *   把它们也塞进跨线间隔，就会复刻上游那个「拍演完了却永远不换章」的现场。
 *
 *   B2 防重复名单同批落地：上游 `antiRepeatBlock` 的原话是
 *     > 「已经走过的章（不要重演，也不要换个说法再来一遍）」
 *   而它的**第二次事故**才逼出真正的口径：
 *     > 「用户点『重新生成章纲』，出来的四章和上一版几乎一字不差……原因之一就是旧章表被当成
 *     >   『你这一册的章内容』发下去了（模型当然照着抄），而防重复块里**只有章名标题、没有内容**，
 *     >   模型根本不知道『这套因果已经写过了』。」
 *   故本模块的名单**记正文（截断），不只记标题** —— 只记标题正是那次事故的成因。
 *
 * ── 本模块落点（只读判定 + 一个自持的名单库）──────────────────
 *   · `gate(kind, ctx)`     —— 「这一刻能生成吗」；按轮算 remaining，**逐档报哪道闸门卡着**
 *   · `record(kind, round)` —— 记为生成过一次：**先过闸门再落账**（未过闸门时不推进游标）
 *   · `antiRepeat.add/remove/list` —— 废弃与被换掉的标题 / 正文 ≠ 进归档，只作「要避开的东西」
 *   · `buildBlock()`        —— 把「要避开的东西」交给正文（**只在有名单时出字**）
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `gate` 报 `gated-off`，`record` 原地拒收且**不推进任何游标**。
 *   2 `gate` 是**纯只读**：不改任何状态、不推进游标、不写盘。「判」与「记」是两个动作，
 *      合成一个会让「被判过一次」与「真的生成过一次」在读数上同形（本仓反复治过的那一类）。
 *   3 **先过闸门再落账**：`record` 未过闸门时返回拒收并**原样带回是哪一道闸门卡着**
 *      （`wait` 是还要等几轮，不是「不许」）——把 `blocked` 折成「记不上」会让现场无法归因。
 *   4 **整机闸门跨线生效**：`thread` / `interlude` 档要看 `minGap`；`chapter` /
 *      `interlude-chapter` 档**豁免它**（理由见上：上游用事故换来的那条）。
 *   5 **按轮记账，绝不看墙钟**：轮次唯一取自 `evolution.roundOf`（本仓单一真源）。
 *      拿不到轮次时**拒算**（`bad-round`）而不是退回墙上时间 ——
 *      上一次「真实时间与剧情时间混算」的代价是离线间隔被整平（v2.161.0 TP3）。
 *   6 **余波要有时刻**：`chapter` / `interlude-chapter` 档拿不到收尾时刻时报 `no-aftermath`
 *      （不把「没有这一刻」当成「已经等了很久」——那会让它当场放行）。
 *   7 **名单记正文不只记标题**（上游第二次事故的成因就在这）：`text` 必填，空文本拒收。
 *   8 **范围切换要明说**：换聊天（`chatId` 不同）时闸门账**重新开始**并如实报 `scopeReset`
 *      ——把上一个聊天的节流带过来，正是「两件不同的事在读数上同形」。
 *   9 名单有界且挤出有账：`entries` 按 `maxEntries` 环形挤出，并**累计挤出数**（`pruned`）
 *      ——无界 = 存档长期膨胀；无账 = 挤掉过什么没人知道。
 *  10 **不进 store 骨架、不登记 evict 站点**：闸门账与名单都存在本模块自己的 localStorage 键里
 *      （同 `presetWorld` / `perfLedger` 两条先例：**那些不是世界事实**，不该进存档，
 *      也不该在 `SITES` / `__BOUNDED_CAPS` 里假装它是个 store 环形容器 ——
 *      那正是 `region.places` 同型的「零调用站点」缺陷）。
 *      有界由本文件自己夹（第 9 条），挤出数进读数。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_gen_gate_settings_v1';
  // 设置键与数据键分开（同 preset-world：一次保存失败不该同时毁掉设置与账）。
  const DATA_KEY = 'worldaxis_gen_gate_data_v1';
  /** 四个生成面（与上游四道闸门一一对应，不自造第五个）。 */
  const KINDS = ['thread', 'interlude', 'chapter', 'interlude-chapter'];
  const DEF = { enabled: false, minGap: 3, chapterGap: 4, quietRounds: 3, interludeGap: 3, maxEntries: 24 };
  const __REG = {
    key: LS_KEY, def: DEF, module: 'genGate',
    bounds: {
      minGap: [1, 30], chapterGap: [1, 30], quietRounds: [1, 30],
      interludeGap: [1, 30], maxEntries: [4, 64]
    }
  };
  const __DATA = { key: DATA_KEY, def: null, module: 'genGate', optional: true };
  const SCHEMA = 1;
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
                          : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG, __DATA]);

  const stat = { gates: 0, oks: 0, records: 0, scopeResets: 0, adds: 0, removes: 0, pruned: 0, blocks: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 120) : String(v == null ? '' : v).slice(0, max || 120); }
  /** 轮次唯一真源（边界 5）：拿不到就 null，绝不退回墙上时间。 */
  function roundOf(v) {
    if (v === undefined || v === null || v === '') {
      try {
        const s = (WA.store && WA.store.get && WA.store.get()) || null;
        if (WA.evolution && typeof WA.evolution.roundOf === 'function') {
          const n0 = WA.evolution.roundOf(s);
          return (typeof n0 === 'number' && isFinite(n0) && n0 >= 0) ? Math.floor(n0) : null;
        }
      } catch (e) { return null; }
      return null;
    }
    // ⚠ 刻意**不用 `inputGuard.count`** —— 实测 `count('abc')===0`、`count(NaN)===0`、
    //   `count(Infinity)===0`：它把所有坏输入塌成 0，于是「轮次坏了」与「第 0 轮」在读数上同形，
    //   而 `bad-round` 这个拒收码会因此**写得出、跑不到**（reject-code-gate 要抓的正是「存在但不可证」）。
    //   口径同 beat-report / beat-ledger / rule-pack：轮次不是有限数 ⇒ 拒收（NaN 不得被当成某一轮）。
    const n = (typeof v === 'number') ? v : Number(v);
    return (typeof n === 'number' && isFinite(n) && n >= 0) ? Math.floor(n) : null;
  }
  // 范围键的唯一真源是 `store.chatId()`（本仓导出面），**不从骨架里读一个假的 chatId 字段**。
  function chatKey() {
    try {
      if (WA.store && typeof WA.store.chatId === 'function') return clean(WA.store.chatId(), 80) || 'wa_default';
    } catch (e) { /* 读失败按下二者 */ }
    try {
      const s = (WA.store && WA.store.get && WA.store.get()) || null;
      return clean(s && s.chatId, 80) || 'wa_default';
    } catch (e) { return 'wa_default'; }
  }

  const EMPTY = { version: SCHEMA, updatedAt: 0, chatKey: '', seq: 0, lastAt: 0, pruned: 0, cursors: {}, entries: [] };
  /** 读盘（空集与读失败是两种结论 —— 同 preset-world 口径）。 */
  function readData() {
    if (!WA.settingsBus || typeof WA.settingsBus.read !== 'function') return { ok: false, reason: 'read-failed', data: EMPTY };
    let raw = null;
    try { raw = WA.settingsBus.read(__DATA); } catch (e) { return { ok: false, reason: 'read-failed', data: EMPTY }; }
    if (raw === null || raw === undefined) return { ok: true, data: EMPTY };
    if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'bad-type', data: EMPTY };
    return { ok: true, data: {
      version: typeof raw.version === 'number' ? raw.version : SCHEMA,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
      chatKey: typeof raw.chatKey === 'string' ? raw.chatKey : '',
      seq: typeof raw.seq === 'number' ? raw.seq : 0,
      lastAt: typeof raw.lastAt === 'number' ? raw.lastAt : 0,
      pruned: typeof raw.pruned === 'number' ? raw.pruned : 0,
      cursors: (raw.cursors && typeof raw.cursors === 'object' && !Array.isArray(raw.cursors)) ? raw.cursors : {},
      entries: Array.isArray(raw.entries) ? raw.entries.filter(function (r) { return r && typeof r === 'object'; }) : []
    } };
  }
  function writeData(data) {
    if (!WA.settingsBus || typeof WA.settingsBus.saveOrThrow !== 'function') { noteFault('write-failed'); return { ok: false, reason: 'write-failed' }; }
    const r = WA.settingsBus.saveOrThrow(__DATA, data);
    if (!r || r.ok !== true) { noteFault('write-failed'); return { ok: false, reason: 'write-failed' }; }
    return { ok: true };
  }

  /**
   * 这一刻能生成吗（边界 2：**纯只读**）。逐档报**是哪一道闸门卡着**与还要等几轮。
   * @param {'thread'|'interlude'|'chapter'|'interlude-chapter'} kind
   * @param {{round?:number, aftermathAt?:number, chapterOpenedAt?:number}} [ctx]
   */
  function gate(kind, ctx) {
    stat.gates++;
    const cfg = settings();
    if (!cfg.enabled) { noteFault('gated-off'); return { ok: false, reason: 'gated-off' }; }
    const k = clean(kind, 32).toLowerCase();
    if (KINDS.indexOf(k) < 0) { noteFault('bad-kind'); return { ok: false, reason: 'bad-kind', allowed: KINDS.slice() }; }
    const c = ctx || {};
    const round = roundOf(c.round);
    if (round === null) { noteFault('bad-round'); return { ok: false, reason: 'bad-round', detail: '轮次取不到 ⇒ 拒算（不许退回墙上时间）' }; }
    const g = readData();
    if (!g.ok) { noteFault(g.reason); return { ok: false, reason: g.reason }; }
    const a = g.data;
    // 范围切换（边界 8）：换聊天时旧的节流不适用 —— 但**读侧不改盘**，只如实报。
    const scopeReset = !!(a.chatKey && a.chatKey !== chatKey());
    const lastAt = scopeReset ? 0 : a.lastAt;
    const since = (lastAt > 0) ? (round - lastAt) : Infinity;
    const cur = scopeReset ? {} : (a.cursors || {});

    // ② 整机闸门（跨线生效）。**chapter 两档豁免它** —— 收尾是既成事实，不该被无关节流推迟。
    const exemptGap = (k === 'chapter' || k === 'interlude-chapter');
    if (!exemptGap && isFinite(since) && since < cfg.minGap) {
      noteFault('too-soon');
      return { ok: false, reason: 'too-soon', gate: 'min-gap', wait: cfg.minGap - since, since: since, round: round };
    }
    // ④ 新章静默期：刚换章先把主线立住
    if (k === 'thread' || k === 'interlude') {
      const opened = numOrNull(c.chapterOpenedAt !== undefined ? c.chapterOpenedAt : cur.chapterOpened);
      if (opened !== null) {
        const s2 = round - opened;
        if (s2 < cfg.quietRounds) {
          noteFault('quiet-period');
          return { ok: false, reason: 'quiet-period', gate: 'new-chapter-quiet', wait: cfg.quietRounds - s2, round: round };
        }
      }
    }
    // ③ 余波：上一章收尾后隔几轮才开下一章 / 开间章
    if (k === 'chapter' || k === 'interlude-chapter') {
      const after = numOrNull(c.aftermathAt !== undefined ? c.aftermathAt : cur.aftermath);
      if (after === null || after <= 0) {
        // 边界 6：没有那一刻 ≠ 已经等了很久
        noteFault('no-aftermath');
        return { ok: false, reason: 'no-aftermath', gate: k === 'chapter' ? 'chapter-gap' : 'interlude-aftermath',
          detail: '上一章还没有收尾时刻 ⇒ 余波无从算起（不把「没有」当成「等够了」）' };
      }
      const need = (k === 'chapter') ? cfg.chapterGap : cfg.interludeGap;
      const s3 = round - after;
      if (s3 < need) {
        noteFault('aftermath-wait');
        return { ok: false, reason: 'aftermath-wait', gate: k === 'chapter' ? 'chapter-gap' : 'interlude-aftermath',
          wait: need - s3, since: s3, round: round };
      }
    }
    stat.oks++;
    return { ok: true, kind: k, round: round, since: isFinite(since) ? since : null, scopeReset: scopeReset,
      gates: { minGap: cfg.minGap, chapterGap: cfg.chapterGap, quietRounds: cfg.quietRounds, interludeGap: cfg.interludeGap } };
  }
  function numOrNull(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n) && n > 0) ? Math.floor(n) : null; }

  /**
   * 记为「生成过一次」。**先过闸门再落账**（边界 3）——未过闸门时原样带回是哪一道卡着。
   */
  function record(kind, ctx) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('gated-off'); return { ok: false, reason: 'gated-off' }; }
    const c = ctx || {};
    const g0 = gate(kind, c);
    // 拒收**不落账、不推进任何游标**（游标动了就会让「其实没生成」被算成生成过）；
    //   原样带回是哪一道闸门卡着 —— 把 blocked 折成「记不上」会让现场无法归因。
    if (!g0.ok) { stat.records++; return g0; }
    const round = g0.round;
    const k = g0.kind;
    const g = readData();
    if (!g.ok) { noteFault(g.reason); return { ok: false, reason: g.reason }; }
    const key = chatKey();
    const scopeReset = !!(g.data.chatKey && g.data.chatKey !== key);
    const a = scopeReset ? Object.assign({}, EMPTY) : g.data;
    if (scopeReset) stat.scopeResets++;
    a.chatKey = key;
    a.seq = (a.seq || 0) + 1;
    a.lastAt = round;
    const cursors = Object.assign({}, a.cursors || {});
    cursors[k] = round;
    if (k === 'chapter') cursors.chapterOpened = round;
    if (k === 'interlude-chapter') cursors.aftermath = round;
    a.cursors = cursors;
    a.updatedAt = clockNow('genGate');
    const w = writeData(a);
    if (!w.ok) return w;
    stat.records++;
    return { ok: true, kind: k, round: round, seq: a.seq, scopeReset: scopeReset,
      nextAllowed: round + Math.max(1, Math.round(cfg.minGap)) };
  }

  // ── B2 防重复名单 ────────────────────────────────────────────
  /** 登记一条「要避开的东西」。**记正文不只记标题**（上游第二次事故的成因）。 */
  function add(reason, text, at) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('gated-off'); return { ok: false, reason: 'gated-off' }; }
    const why = clean(reason, 40);
    const body = clean(text, 400);
    if (!body) { noteFault('empty-text'); return { ok: false, reason: 'empty-text', detail: '要避开的东西必须带正文（只记标题＝模型不知道这套因果已经写过了）' }; }
    const g = readData();
    if (!g.ok) { noteFault(g.reason); return { ok: false, reason: g.reason }; }
    const key = chatKey();
    const a = (g.data.chatKey && g.data.chatKey !== key) ? Object.assign({}, EMPTY) : g.data;
    if (a.chatKey !== key) { a.chatKey = key; stat.scopeResets++; }
    const entries = (a.entries || []).slice();
    const i = entries.findIndex(function (r) { return r && r.text === body; });
    const existed = i >= 0;
    const row = { why: why || 'replaced', text: body, at: numOrNull(at) || roundOf(undefined) || 0 };
    if (existed) entries[i] = row; else entries.push(row);
    let pruned = (a.pruned || 0);
    if (entries.length > cfg.maxEntries) { pruned += entries.length - cfg.maxEntries; entries.splice(0, entries.length - cfg.maxEntries); stat.pruned += 1; }
    a.entries = entries; a.pruned = pruned;
    a.seq = (a.seq || 0) + 1;
    a.updatedAt = clockNow('genGate');
    const w = writeData(a);
    if (!w.ok) return w;
    stat.adds++;
    return { ok: true, existed: existed, total: entries.length, max: cfg.maxEntries };
  }
  function remove(text) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('gated-off'); return { ok: false, reason: 'gated-off' }; }
    const body = clean(text, 400);
    if (!body) { noteFault('empty-text'); return { ok: false, reason: 'empty-text' }; }
    const g = readData();
    if (!g.ok) { noteFault(g.reason); return { ok: false, reason: g.reason }; }
    const i = (g.data.entries || []).findIndex(function (r) { return r && r.text === body; });
    if (i < 0) { noteFault('not-found'); return { ok: false, reason: 'not-found' }; }
    const entries = g.data.entries.slice(); entries.splice(i, 1);
    const a = Object.assign({}, g.data, { entries: entries, seq: (g.data.seq || 0) + 1, updatedAt: clockNow('genGate') });
    const w = writeData(a);
    if (!w.ok) return w;
    stat.removes++;
    return { ok: true, total: entries.length };
  }
  function list() { const g = readData(); const a = g.ok ? g.data : EMPTY; return (a.entries || []).slice(); }
  function clear() {
    const g = readData();
    if (!g.ok) { noteFault(g.reason); return { ok: false, reason: g.reason }; }
    return writeData(Object.assign({}, g.data, { entries: [], seq: (g.data.seq || 0) + 1, updatedAt: clockNow('genGate') }));
  }
  /** 把「要避开的东西」交给正文。**没有名单就一个字都不出**（零 token 占用）。 */
  function buildBlock(task) {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const rows = list();
    if (!rows.length) return '';
    stat.blocks++;
    const t = clean(task, 24);
    const lines = ['[要避开的东西] 下面这些**已经用过了**：不要重演，也不要换个说法再来一遍。'];
    rows.slice(-12).forEach(function (r) {
      lines.push('· ' + (r.why ? '（' + r.why + '）' : '') + r.text);
    });
    if (t === 'epic') {
      lines.push('新的一部**必须换一套因果**：起因不同、推动的人不同、代价不同、落点不同；');
      lines.push('连「推进形状」也不能一样（上一部若是「接连施压 → 逼到绝境 → 摊牌 → 妥协」，这一部就不许再来一遍）。');
    }
    return lines.join('\n') + '\n';
  }

  function view() {
    const cfg = settings();
    const g = readData();
    const a = g.ok ? g.data : EMPTY;
    const key = chatKey();
    const scopeReset = !!(a.chatKey && a.chatKey !== key);
    const out = { ok: g.ok, reason: g.ok ? null : g.reason, chatKey: key, storedFor: a.chatKey,
      scopeReset: scopeReset, lastAt: scopeReset ? 0 : a.lastAt, seq: a.seq, pruned: a.pruned,
      entries: (a.entries || []).length, max: cfg.maxEntries };
    // 逐档算「还要等几轮」——把节奏摊开，否则闸门就是黑箱（上游 pacingHint 的口径）
    const round = roundOf(undefined);
    out.ready = {};
    if (round !== null) {
      KINDS.forEach(function (k) {
        const r = gate(k, { round: round });
        out.ready[k] = r.ok ? { ok: true } : { ok: false, reason: r.reason, wait: (r.wait === undefined ? null : r.wait) };
      });
    }
    return out;
  }
  function diagnose() {
    const cfg = settings();
    const g = readData();
    const a = g.ok ? g.data : EMPTY;
    return {
      enabled: cfg.enabled,
      storage: { key: DATA_KEY, shared: false, note: '闸门账与名单住在本模块自己的 localStorage 键（不是世界事实，不进存档骨架）' },
      gates: { minGap: cfg.minGap, chapterGap: cfg.chapterGap, quietRounds: cfg.quietRounds, interludeGap: cfg.interludeGap },
      kinds: KINDS.slice(),
      cursorKeys: Object.keys(a.cursors || {}),
      chatKey: chatKey(), storedFor: a.chatKey,
      lastAt: a.lastAt, seq: a.seq, pruned: a.pruned,
      entries: (a.entries || []).map(function (r) { return { why: r.why, chars: String(r.text || '').length, at: r.at }; }),
      notes: [
        '按轮记账，绝不看墙钟（轮次唯一取自 evolution.roundOf）',
        'chapter / interlude-chapter 两档豁免整机闸门 —— 收尾是既成事实，不该被无关节流推迟',
        'gate 只判不记：被判过一次 ≠ 真的生成过一次（两个动作分开）',
        '名单记正文不只记标题 —— 只记标题正是上游那次「换皮重演」的成因'
      ]
    };
  }

  WA.genGate = {
    KINDS: KINDS.slice(),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    gate: gate, record: record,
    antiRepeat: { add: add, remove: remove, list: list, clear: clear, build: buildBlock },
    buildBlock: buildBlock,
    view: view,
    diagnose: diagnose,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/gen-gate.js', { kind: 'engine', ver: '2.189.0' });
})();

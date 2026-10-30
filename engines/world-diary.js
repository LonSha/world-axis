/**
 * WorldAxis engines/world-diary.js (v2.265.0) — 世界日记：你看不见的地方发生了什么
 *
 * 【EXV6-1】每轮把**镜头之外真实结算过**的事实压成一到三句人话：
 *   不含内部 id、不含技术词、不含数值桶名。纯读聚合，零新容器。
 *
 * 【为什么不新开一本日记】
 *   本仓「不新建第二套真源」这条纪律在这里最容易被破：做一个 `worldDiary.lines[]`
 *   容器、每轮往里 push 一句，看起来最省事 —— 但那等于把「发生过什么」记两份，
 *   而且第二份会与第一份漂移（引擎改了结算，日记还在念旧的）。
 *   这里只做一件事：**从既有 owner 的只读读口里现算**。
 *     ① `livingWorld` 的 ripples / intersections / vignettes / livingTraces（幕后生活）
 *     ② `elsewhere` 的 card.recent（幕后 NPC 近况）
 *     ③ `offlineTick` 的 summary().lines（你不在时发生的事 —— 已有措辞，直接念）
 *   三者都是既有容器，本模块**零 store.transact、零 settingsBus 写、零 localStorage**。
 *
 * 【信息边界：只报玩家视角能知道的】
 *   计划原文要求「信息边界走既有 noesis / epistemic-view」。这里的做法是**先问边界再落句**：
 *     · 若 `noesis` 或 `epistemic-view` 能对某个地点给出可见性判定，则不可见的地点点名到
 *       「某处」而不是原名（地点名会泄露地图结构，那是另一种越权）；
 *     · 人物名照实报 —— 它们本来就出现在玩家可见的幕后状态块里（`elsewhere.buildBlock`），
 *       日记再隐去反而与之一致性相反；
 *     · 边界口缺席时**不假装能判**：`boundary.available=false` 如实带出，句子降级为
 *       不含地名的形态，绝不因为「判不了」就当作「全都可见」。
 *
 * 【三句话上限是硬约束】
 *   日记的价值在于「一眼看完」。`maxLines`（默认 3）是硬上限，超出截断并如实记
 *   `truncated:true` + `dropped:N` —— 悄悄丢掉等于玩家以为「就这么多」。
 *
 * 【本模块不做的事】
 *   · 不生成、不调用模型：全部是既有事实的措辞化，所以它可以在任何时刻被调用（含无 API 时）；
 *   · 不改任何引擎状态：连 `livingWorld.tick` 都不碰；
 *   · 不编造：没有任何事实来源时返回 `quiet:true` 的「这几轮没有需要你知道的事」，
 *     而不是编一段「世界在悄悄运转」——那是空转冒充有事发生。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};
  const LS_KEY = 'worldaxis_world_diary_settings_v1';
  const DEF = {
    enabled: true,
    maxLines: 3,          // 硬上限：一眼看完
    maxItems: 6,          // 每个来源最多取几条原始事实（防止一个来源淹没其它）
    includeOffline: true, // 「你不在时发生的事」要不要并进日记
    hidePlace: false      // 手动强制隐去地名（玩家想更抽象时用）
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'worldDiary', bounds: { maxLines: [1, 6], maxItems: [1, 20] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function settings() {
    if (WA.settingsBus && typeof WA.settingsBus.read === 'function') {
      const raw = WA.settingsBus.read(__REG);
      const merged = Object.assign({}, DEF, raw || {});
      return typeof WA.settingsBus.normalize === 'function' ? WA.settingsBus.normalize(__REG, merged) : merged;
    }
    return Object.assign({}, DEF);
  }
  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    if (WA.settingsBus && typeof WA.settingsBus.saveOrThrow === 'function') {
      const norm = typeof WA.settingsBus.normalize === 'function' ? WA.settingsBus.normalize(__REG, merged) : merged;
      return WA.settingsBus.saveOrThrow(__REG, norm);
    }
    return merged;
  }

  const __stat = {
    builds: 0, linesEmitted: 0, emptyBuilds: 0, dropped: 0,
    boundaryConsulted: 0, boundaryAvailable: 0,
    lastReason: '', faults: {}
  };
  function fault(k) { __stat.faults[k] = (__stat.faults[k] || 0) + 1; }

  /** 只读、失败即降级（本仓纪律：观察层失败不许影响主链）。 */
  function safe(fn, fb) {
    try { const v = fn(); return v === undefined ? fb : v; } catch (e) { fault('read-threw'); return fb; }
  }
  function txt(v, max) {
    const s = (v === null || v === undefined) ? '' : String(v);
    return s.replace(/\s+/g, ' ').trim().slice(0, max || 60);
  }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; }

  // ── 信息边界：只问「这一处玩家看得见吗」，看不见就不点名 ──────────────────
  /**
   * 为什么要单独一层：地点的**可见性是知识面问题**，不是本模块能自己判的。
   *
   * 【实施期修正 v2.265.0】计划原文写「走既有 noesis / epistemic-view」，实测两处都得改：
   *   · `noesis` 里**没有**「按地点问可见性」那一口（计划原文假定的名字根本不存在）。它的空间轴是
   *     `perceive(person, placeId)`：**从玩家自身视角**问「这个人能感知到这个地方吗」，
   *     返回 `range: present / impaired / out / unknown`（四态，`unknown` 与 `out` 分开）。
   *     这正是要的那把尺 —— 所以用它，而不是新造一个地点查询。
   *   · `epistemic-view` 是**信念面**（registerBelief / buildView），管的是「某人以为什么」，
   *     不是「这里玩家看不看得见」。拿它判可见性是**类型错配**，故不接。
   *   玩家名从 `worldBridge.worldKey().player` 取 —— 它是本仓唯一权威的「玩家是谁」，
   *   拿不到就等于**判不了**（`available:false`），句子降级为不点名，绝不当作「全都可见」。
   *
   * 【四态怎么用】
   *   `present` ⇒ 点名；`impaired` ⇒ 点名但加「远远地」；`out` / `unknown` / 读不出 ⇒ 不点名。
   *   `impaired` 单独留一档是有意的：它与 `out` 在旧读数上都会显得「不是清清楚楚」，
   *   但处置不同（一个是「看得见但模糊」，一个是「根本不在那」）。
   */
  function boundary() {
    const n = WA.noesis;
    const perceiveOk = !!(n && typeof n.perceive === 'function');
    let player = '';
    if (perceiveOk) {
      player = txt(safe(function () {
        const wk = WA.worldBridge && typeof WA.worldBridge.worldKey === 'function' ? WA.worldBridge.worldKey() : null;
        return wk && wk.player;
      }, ''), 40);
    }
    const available = !!(perceiveOk && player);
    const why = !perceiveOk ? 'noesis.perceive-absent' : (!player ? 'player-unknown' : '');
    return { available: available, sources: perceiveOk ? ['noesis.perceive'] : [], player: player, why: why };
  }
  /**
   * 三态输出，**不是两态**：
   *   · `ok:true`   ⇒ 点名（`place` 有值）；
   *   · `ok:false + hidden:true`  ⇒ 有地名但玩家看不见（该隐去）；
   *   · `ok:false + hidden:false` ⇒ 这条事实本来就没地名 / 判不了（不是「被隐去」）。
   * 为什么要分：把「没有地名」与「有但隐去了」压成同一个 `hidden` 会让 `hidden` 这一栏
   *   在多数行上恒真 —— 那样它就不再是判据，与「全都可见」一样是假绿。
   */
  function placeVisible(place, b) {
    const p = txt(place, 40);
    if (!p) return { ok: false, place: '', hidden: false, why: 'no-place' };
    if (!b.available) return { ok: false, place: '', hidden: false, why: b.why || 'boundary-absent' };
    const r = safe(function () { return WA.noesis.perceive(b.player, p); }, null);
    // `ok:false` 有两种成因，处置相反：**判不了**（模块未启用 / 缺字段）不能说「看不见」，
    //   那是把「没读到」写成「读到了且为否」—— 本仓点名的假绿。只有 `ok:true` 且
    //   `range` 落到 out/unknown 时才是真·看不见（此时 `perceive` 确实给了结论）。
    if (!r || r.ok !== true) return { ok: false, place: '', hidden: false, why: 'perceive-' + ((r && r.reason) || 'failed') };
    if (r.range === 'present') return { ok: true, place: p, hidden: false, range: 'present' };
    if (r.range === 'impaired') return { ok: true, place: p, hidden: false, range: 'impaired' };
    return { ok: false, place: '', hidden: true, why: String(r.range || r.reason || 'unknown') };
  }
  /**
   * 点名时的前缀：`impaired` 要说出「看得见但不真切」，否则与清清楚楚同形。
   * `bare` 用于「后接片段自带介词」的场合（「集市，在摊前…」），避免「在集市在摊前」这种叠介词。
   */
  function atPlace(pv, bare) {
    if (!pv.ok || !pv.place) return '';
    if (bare) return (pv.range === 'impaired' ? '远处的' : '') + pv.place;
    return (pv.range === 'impaired' ? '远远地在' : '在') + pv.place;
  }

  // ── 三路只读来源 ────────────────────────────────────────────────────────
  /** ① 幕后生活：照面 / 微情境 / 涟漪 / 痕迹（`livingWorld` 的四个既有数组）。 */
  function fromLiving(cfg, b) {
    const out = [];
    const snap = safe(function () {
      const st = WA.store && typeof WA.store.get === 'function' ? WA.store.get() : null;
      return (st && st.livingWorld) ? st.livingWorld : null;
    }, null);
    if (!snap) return out;
    const tick = num(snap.tick);
    const fresh = function (row) { return row && (tick - num(row.tick || row.atTick)) <= 3; };

    (Array.isArray(snap.intersections) ? snap.intersections : []).filter(fresh).slice(-cfg.maxItems).forEach(function (i) {
      const who = Array.isArray(i.participants) ? i.participants.map(function (x) { return txt(x, 20); }).filter(Boolean) : [];
      if (who.length < 2) return;
      const pv = placeVisible(i.place, b);
      // 措辞**不随可见性改变**：可见性只决定「地点名说不说」，不能决定「事实是什么」。
      //  首版把两件事写在一起（可见时说「互通难处」、不可见时说「只有他们知道的事」），
      //  实测句子看着都对 —— 但那是在用可见性改写事实内容，注入面一旦复用就成了「编」。
      out.push({ kind: 'meeting', who: who, place: pv.place, hidden: pv.hidden,
        text: who[0] + '和' + who[1] + atPlace(pv) + '照了面，互通了近来的难处。' });
    });
    (Array.isArray(snap.ripples) ? snap.ripples : []).filter(fresh).slice(-cfg.maxItems).forEach(function (r) {
      const src = txt(r.source, 20);
      const peers = Array.isArray(r.affectedPeers) ? r.affectedPeers.map(function (x) { return txt(x, 20); }).filter(Boolean) : [];
      if (!src) return;
      const pv = placeVisible(r.place, b);
      // 地名说不出来时**不能**直接省略宾语 —— 「老周遇到变故」这种句子会让人以为变故与地点无关。
      // 改用不泄露地点的兜底宾语（「在你看不见的地方」），事实内容不变、地图结构不外泄。
      const where = atPlace(pv) || '在你看不见的地方';
      out.push({ kind: 'ripple', who: [src].concat(peers), place: pv.place, hidden: pv.hidden,
        text: src + where + '遇到变故' + (peers.length ? '，' + peers.slice(0, 2).join('、') + '受了牵连' : '') + '。' });
    });
    (Array.isArray(snap.vignettes) ? snap.vignettes : []).filter(fresh).slice(-cfg.maxItems).forEach(function (v) {
      const who = txt(v.name, 20);
      if (!who) return;
      const pv = placeVisible(v.place, b);
      // 微情境的 `detail` 是**片段**（作者侧写的是「在摊前讨价还价」这类自带介词的句子），
      //   与 atPlace 的「在集市」直接相接会成「在集市在摊前」—— 两句都通，合起来不通。
      //   处置：detail 自带「在/正/忽」这类起头时不加地名前缀，用地名另起一个短句。
      const det = txt(v.detail, 60);
      out.push({ kind: 'vignette', who: [who], place: pv.place, hidden: pv.hidden,
        text: who + (pv.ok && pv.place ? '在' + atPlace(pv, true) + '，' : '') + det });
    });
    (Array.isArray(snap.livingTraces) ? snap.livingTraces : []).filter(fresh).slice(-cfg.maxItems).forEach(function (t) {
      const who = txt(t.who, 20);
      if (!who) return;
      const pv = placeVisible(t.place, b);
      out.push({ kind: 'trace', who: [who], place: pv.place, hidden: pv.hidden,
        text: who + atPlace(pv) + '留下了痕迹：' + txt(t.detail, 40) });
    });
    return out;
  }
  /** ② 幕后 NPC 近况：`elsewhere` 的 card.recent（它本来就是「镜头外仍在生活」的记录）。 */
  function fromElsewhere(cfg, b) {
    const out = [];
    const names = safe(function () { return WA.elsewhere && typeof WA.elsewhere.list === 'function' ? WA.elsewhere.list() : []; }, []);
    (Array.isArray(names) ? names : []).slice(0, cfg.maxItems).forEach(function (nm) {
      const c = safe(function () { return WA.elsewhere.card(nm); }, null);
      const card = (c && c.ok && c.card) ? c.card : null;
      if (!card) return;
      const recent = Array.isArray(card.recent) ? card.recent.slice(-1) : [];
      if (!recent.length) return;
      const who = txt(card.name, 20);
      const pv = placeVisible(card.place, b);
      out.push({ kind: 'elsewhere', who: [who], place: pv.place, hidden: pv.hidden,
        text: who + (pv.ok && pv.place ? '在' + atPlace(pv, true) + '，' : '') + txt(recent[0], 60) });
    });
    return out;
  }
  /** ③ 你不在时发生的事：`offlineTick.summary()` 的既有措辞（不重写，避免第二份口径）。 */
  function fromOffline(cfg) {
    if (!cfg.includeOffline) return [];
    const s = safe(function () { return WA.offlineTick && typeof WA.offlineTick.summary === 'function' ? WA.offlineTick.summary() : null; }, null);
    if (!s || !s.ok || !Array.isArray(s.lines) || !s.lines.length) return [];
    return s.lines.map(function (l) { return { kind: 'offline', who: [], place: '', hidden: false, text: txt(l, 120) }; });
  }

  /**
   * 生成日记（**纯读**）。
   * @param {{maxLines?:number}} opt
   * @returns {{ok:boolean, lines:string[], items:Array, quiet:boolean, truncated:boolean, dropped:number, ...}}
   */
  function build(opt) {
    const cfg = settings();
    if (!cfg.enabled) {
      __stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled', lines: [], items: [], quiet: false, truncated: false, dropped: 0,
        line: '世界日记：未启用' };
    }
    const o = (opt && typeof opt === 'object') ? opt : {};
    const cap = Math.max(1, Math.min(6, num(o.maxLines) || cfg.maxLines));
    const b = boundary();
    __stat.boundaryConsulted++;
    if (b.available) __stat.boundaryAvailable++;

    const items = []
      .concat(fromOffline(cfg))
      .concat(fromLiving(cfg, b))
      .concat(fromElsewhere(cfg, b));

    __stat.builds++;
    if (!items.length) {
      __stat.emptyBuilds++; __stat.lastReason = 'quiet';
      return { ok: true, lines: [], items: [], quiet: true, truncated: false, dropped: 0,
        boundary: b,
        line: '世界日记：这几轮镜头外无事。',
        hint: '这几轮镜头外没有需要你知道的事 —— 不是「没读到」，是确实没有' };
    }
    // 去重：同一句措辞出现两次（多来源撞车）只留第一次 —— 日记里重复比缺失更难看。
    const seen = {}, uniq = [];
    items.forEach(function (it) { if (!seen[it.text]) { seen[it.text] = 1; uniq.push(it); } });
    const lines = uniq.slice(0, cap).map(function (i) { return i.text; });
    const dropped = uniq.length - lines.length;
    __stat.linesEmitted += lines.length;
    __stat.dropped += dropped;
    __stat.lastReason = 'built';
    return { ok: true, lines: lines, items: uniq.slice(0, cap), total: uniq.length,
      truncated: dropped > 0, dropped: dropped, quiet: false, boundary: b, cap: cap,
      line: '世界日记：' + lines.join(' ') + (dropped > 0 ? '（另有 ' + dropped + ' 条未展开）' : '') };
  }


  function stat() {
    return { builds: __stat.builds, linesEmitted: __stat.linesEmitted, emptyBuilds: __stat.emptyBuilds,
      dropped: __stat.dropped, boundaryConsulted: __stat.boundaryConsulted,
      boundaryAvailable: __stat.boundaryAvailable, lastReason: __stat.lastReason,
      faults: Object.assign({}, __stat.faults),
      // 三路来源各自在不在场：缺一路不是「没事发生」，是两个概念（本仓反复强调的分栏）
      sources: {
        livingWorld: !!(WA.livingWorld && typeof WA.livingWorld.detectEncounters === 'function'),
        elsewhere: !!(WA.elsewhere && typeof WA.elsewhere.card === 'function'),
        offlineTick: !!(WA.offlineTick && typeof WA.offlineTick.summary === 'function'),
        boundary: (function () { const b = boundary(); return { available: b.available, sources: b.sources }; })()
      },
      enabled: !!settings().enabled, maxLines: settings().maxLines };
  }
  function reset() {
    __stat.builds = 0; __stat.linesEmitted = 0; __stat.emptyBuilds = 0; __stat.dropped = 0;
    __stat.boundaryConsulted = 0; __stat.boundaryAvailable = 0;
    __stat.lastReason = ''; __stat.faults = {};
    return true;
  }

  WA.worldDiary = {
    getSettings: settings, setSettings: saveSettings,
    build: build, stat: stat, reset: reset,
    boundary: boundary,
    DEF: Object.assign({}, DEF)
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/world-diary.js', { kind: 'engine', ver: '2.265.0' });
  }
  if (WA.log) WA.log('info', '世界日记已加载（只读聚合）');
})();

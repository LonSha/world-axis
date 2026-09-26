/**
 * WorldAxis engines/rumor.js (v2.96.0)
 * 传播与辟谣：一条事实在人际间怎么传、传到最后还是不是原来那条。
 *
 * 为什么单独成模块，而不并进 intel.js / opinion.js：
 *   intel.js 管的是「某个人知道什么」——带来源的人物认知条目（LEVELS = rumor/report/witness/record）；
 *   opinion.js 管的是「公众看到/传言的舆论层」——新闻与论坛，是要进正文的东西。
 *   本模块管的是**传播链**：谁在什么层、用什么动机、把哪个值传给了谁；
 *   以及最重要的那一句——「传到最后还 是不是原来那条」。
 *   三者并起来最直接的后果：状态里再也分不出「张三听说了」与「张三听说的还是不是真的」。
 *
 * 四层显式分层（本模块的全部词汇）：
 *   fact    事实本身（唯一来源是 memory.upsertFact 写下的那条；本模块**只读不写**）
 *   witness 亲历者（在场看见/听见的人）
 *   hearsay 转述（听别人说的；经手次数已不可考）
 *   rumor   流言（出处不可溯，且已被动机改写或被添油加醋）
 *
 * 边界（**全是否定式**——这八条正是本模块存在的全部理由）：
 *   1 总开关默认关闭。关闭时不记录、不注入、不收发。
 *   2 **事实不得被本模块改写**。事实的唯一写者是 memory.upsertFact；本模块只做两件事：
 *     记「谁在什么层、用什么动机、把哪个值传了出去」，以及记「这个值被改了没有」。
 *     辟谣也不改事实——辟谣改的是「有人不再当它是一回事」，不是「这件事没发生过」。
 *   3 **层不得升格**。传播只能从「更真」走向「更不真」（fact→witness→hearsay→rumor）；
 *     反向升格一律拒收（layer-ascend）：低置信不得被写成既成事实（与 intel 第 3 条同源）。
 *   4 **篡改不得进事实层与目击层**。动机为 distort 的转述只能落在 hearsay / rumor；
 *     落在 fact / witness 一律拒收（tamper-layer）——否则「我听说」会被记成「我看见」。
 *   5 **未声明的改写一律拒收**（undeclared-rewrite）。如实转述（honest）却改了口径，
 *     是账面上最危险的一种错：`intact` 仍是 true，而值已经不一样了。
 *   6 置信度**不内联第二套数**：层的置信度由 intel.CONFIDENCE 经 LAYER_LEVEL 反查；
 *     intel 缺席时报 engine-absent，不回落成一个自造的数字。
 *   7 玩家面不剧透：buildBlock() 只出 fact / witness 两层；hearsay / rumor 只进 fullView()（全知诊断）。
 *   8 观测不得改变被观测对象：investigate() / chains() / visibleTo() 是纯读，
 *     不落盘、不动 stat、不触发挤出。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_rumor_settings_v1';
  const DEF = { enabled: false, maxChains: 8, maxHops: 6, maxSuppressed: 4 };
  const __REG = { key: LS_KEY, def: DEF, module: 'rumor',
    bounds: { maxChains: [1, 16], maxHops: [1, 12], maxSuppressed: [1, 8] } };
  // 四层单一真源。数组顺序即「可信度序」：只许向下走，不许向上走。
  const LAYERS = ['fact', 'witness', 'hearsay', 'rumor'];
  const LAYER_ORDER = { fact: 0, witness: 1, hearsay: 2, rumor: 3 };
  // 层 ↔ intel 层级的映射单一真源。置信度由此反查 intel.CONFIDENCE —— 本模块不自建第二套数。
  const LAYER_LEVEL = { fact: 'record', witness: 'witness', hearsay: 'report', rumor: 'rumor' };
  // 动机四值：如实 / 隐瞒 / 歪曲 / 辟谣。**动机决定这一跳能不能改值**。
  const MOTIVES = ['honest', 'conceal', 'distort', 'refute'];
  // 有能力改写 value 的动机只有 distort 一个；其余三值都不许动 value。
  const REWRITABLE = ['distort'];
  // 玩家面可见的层。buildBlock 只出这两层；hearsay / rumor 只进 fullView。
  const PUBLIC_LAYERS = ['fact', 'witness'];
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { started: 0, relays: 0, concealed: 0, refuted: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function chains() { const r = state().rumor; return (r && Array.isArray(r.chains)) ? r.chains : []; }
  function find(id) { const k = clean(id, 80); return chains().filter(function (x) { return x && x.id === k; })[0]; }

  /** 层 ↔ intel 层级的反查（单源映射）。未知层报空串，不猜。 */
  function layerOf(level) {
    const lv = clean(level, 20);
    const hit = LAYERS.filter(function (x) { return LAYER_LEVEL[x] === lv; })[0];
    return hit || '';
  }
  /** 反查 intel 的置信度。intel 缺席即 null —— **绝不内联一套自造的数**。 */
  function confOf(layer) {
    const lv = LAYER_LEVEL[clean(layer, 20)];
    if (!lv) return null;
    const C = WA.intel && WA.intel.CONFIDENCE;
    if (!C || !isFinite(Number(C[lv]))) return null;
    return Number(C[lv]);
  }
  /** 下一层（只能更不真；rumor 到底就是 rumor，不再降）。 */
  function nextLayer(layer) {
    const o = LAYER_ORDER[clean(layer, 20)];
    if (!isFinite(o)) return 'rumor';
    return LAYERS[Math.min(LAYERS.length - 1, o + 1)];
  }
  /**
   * 事实真源。**只读**：事实的唯一写者是 memory.upsertFact（以及 worldFacts 的写入方）。
   * 未登记报 unknown-fact —— 不凭空造一条（「没发生的事不该有传播链」）。
   */
  function factRow(key) {
    const k = clean(key, 80);
    if (!k) return null;
    const st = state();
    const facts = [].concat(st.worldFacts || [], (st.memory || {}).facts || []);
    const hit = facts.filter(function (x) { return x && (x.key === k || x.id === k) && x.active !== false; })[0];
    if (!hit) return null;
    return { key: k, value: String(hit.value == null ? '' : hit.value), source: String(hit.reason || hit.source || 'fact') };
  }

  /**
   * 起一条传播链。**一事实一链**：id 由 factKey 派生（'rm_' + key）——
   *   同一件事不该有两条互不相干的传播链，否则「传到最后还是不是原来那条」要从哪条算起？
   * 事实必须已登记：未登记报 unknown-fact，不凭空造一条。
   */
  function startChain(factKey, note) {
    const k = clean(factKey, 80);
    if (!k) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const f = factRow(k);
    if (!f) { noteFault('unknown-fact'); return { ok: false, reason: 'unknown-fact', key: k }; }
    const id = 'rm_' + k;
    const memo = clean(note, 60);
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.rumor = draft.rumor && typeof draft.rumor === 'object' && !Array.isArray(draft.rumor) ? draft.rumor : { chains: [] };
      draft.rumor.chains = Array.isArray(draft.rumor.chains) ? draft.rumor.chains : [];
      if (draft.rumor.chains.filter(function (x) { return x && x.id === id; })[0]) { out = { ok: false, reason: 'exists', id: id }; return false; }
      if (draft.rumor.chains.length >= settings().maxChains) { out = { ok: false, reason: 'chains-full', id: id }; return false; }
      const now = clockNow('rumor');
      draft.rumor.chains.push({ id: id, factKey: k, factValue: f.value, factSource: f.source, note: memo,
        layer: 'fact', intact: true, hops: [], suppressed: [], at: now, updatedAt: now });
      WA.evict.array(draft.rumor.chains, 'rumor.chains');
      out = { ok: true, id: id, layer: 'fact', conf: confOf('fact'), hops: 0 };
    }, 'rumor:start');
    if (out && out.ok) { if (out.reason !== 'disabled') { stat.started++; stat.lastReason = 'started'; } else stat.lastReason = 'disabled'; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 一跳的核心计算（纯函数，不落盘）。四条门在此处，**顺序有意**：
   *   ① 层合法性 → ② 不许升格 → ③ 篡改不许落公开层 → ④ 未声明的改值。
   */
  function hopCalc(c, item, motive) {
    const cur = LAYERS.indexOf(c.layer) >= 0 ? c.layer : 'rumor';
    const want = clean(item && item.layer, 20);
    let target;
    if (want) {
      if (LAYERS.indexOf(want) < 0) return { bad: 'bad-layer', layers: LAYERS.slice() };
      if (LAYER_ORDER[want] < LAYER_ORDER[cur]) return { bad: 'layer-ascend', from: cur, to: want };
      target = want;
    } else target = nextLayer(cur);
    const rewrites = REWRITABLE.indexOf(motive) >= 0;
    // 篡改只能落在已经不可考的两层（转述 / 流言）。落在事实层或目击层 = 「我听说」被记成「我看见」。
    if (rewrites && PUBLIC_LAYERS.indexOf(target) >= 0) return { bad: 'tamper-layer', layer: target, motive: motive };
    const lastHop = c.hops.length ? c.hops[c.hops.length - 1] : null;
    const prevValue = lastHop ? String(lastHop.value) : String(c.factValue);
    const given = (item && item.value != null && String(item.value) !== '') ? String(item.value) : prevValue;
    // 没声明要改，就不许改。这是账面上最危险的一种错：intact 仍是 true，而值已经不一样了。
    if (!rewrites && given !== prevValue) return { bad: 'undeclared-rewrite', motive: motive, expect: prevValue };
    const conf = confOf(target);
    // 置信度不内联第二套数：intel 缺席即拒收，不回落成一个自造的数字。
    if (conf === null) return { bad: 'engine-absent', engine: 'intel', level: LAYER_LEVEL[target] };
    return { layer: target, fromLayer: cur, value: given, conf: conf, intact: given === String(c.factValue) };
  }

  /** 一跳的落盘（调用方已保证 settings().enabled）。 */
  function doHop(id, item, motive) {
    const k = clean(id, 80);
    if (!k) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const from = clean(item && item.from, 60), to = clean(item && item.to, 60);
    if (!from || !to) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.rumor = draft.rumor && typeof draft.rumor === 'object' && !Array.isArray(draft.rumor) ? draft.rumor : { chains: [] };
      draft.rumor.chains = Array.isArray(draft.rumor.chains) ? draft.rumor.chains : [];
      const c = draft.rumor.chains.filter(function (x) { return x && x.id === k; })[0];
      if (!c) { out = { ok: false, reason: 'missing', id: k }; return false; }
      c.hops = Array.isArray(c.hops) ? c.hops : [];
      const cap = Math.max(1, settings().maxHops);
      // 满员**拒收，不挤出**——一条链的中间跳被丢掉，「传到最后还是不是原来那条」就再也答不出。
      if (c.hops.length >= cap) { out = { ok: false, reason: 'hops-full', id: k, cap: cap }; return false; }
      const h = hopCalc(c, item, motive);
      if (h.bad) { out = Object.assign({ ok: false, reason: h.bad }, h); delete out.bad; return false; }
      const hop = { at: clockNow('rumor'), from: from, to: to, fromLayer: h.fromLayer, layer: h.layer,
        motive: motive, value: h.value, conf: h.conf, intact: h.intact };
      c.hops.push(hop);
      c.layer = h.layer;
      // 累积：**一旦被改写就再也回不来**——后来有人把值改回原样，也不能宣称「这条链没被改过」。
      c.intact = !!c.intact && h.intact;
      c.updatedAt = hop.at;
      out = { ok: true, id: k, layer: h.layer, fromLayer: h.fromLayer, motive: motive,
        value: h.value, intact: c.intact, hopIntact: h.intact, hops: c.hops.length, conf: h.conf };
    }, 'rumor:hop');
    if (out && out.ok) {
      if (out.reason !== 'disabled') {
        if (motive === 'refute') stat.refuted++; else stat.relays++;
        if (motive === 'conceal') stat.concealed++;
        stat.lastReason = motive === 'refute' ? 'refuted' : (motive === 'conceal' ? 'concealed' : 'relayed');
      } else stat.lastReason = 'disabled';
    } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /** 转述一跳：如实 / 隐瞒 / 歪曲三种动机都走这里（递出去的才算传）。 */
  function relay(id, item) {
    const motive = clean(item && item.motive, 20) || 'honest';
    if (MOTIVES.indexOf(motive) < 0) { noteFault('bad-motive'); return { ok: false, reason: 'bad-motive', motives: MOTIVES.slice() }; }
    if (motive === 'refute') return doHop(id, item, 'refute');
    return doHop(id, item, motive);
  }

  /**
   * 辟谣：公开否认。**不改事实**（事实的唯一写者仍是 memory.upsertFact；
   *   「这件事没发生过」与「我不再当它是一回事」是两件事），且**不升格**
   *   （hearsay 不会因为有人辟谣就变回 fact）。故值强制取上一跳、层只许向下。
   */
  function refute(id, item) {
    return doHop(id, Object.assign({}, item || {}, { value: null }), 'refute');
  }

  /**
   * 隐瞒：有人知道，但没往外传。它**不是一次传播**，故不进 hops，另记 suppressed。
   *   为什么不记成 motive:'conceal' 的一跳：跳的定义是「把值递给了下一个人」；
   *   隐瞒恰恰是没有递出去。混在一起会让「这条链经了几手」永远算不准。
   */
  function conceal(id, item) {
    const k = clean(id, 80);
    if (!k) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const by = clean(item && item.by, 60), why = clean(item && item.why, 60);
    if (!by) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.rumor = draft.rumor && typeof draft.rumor === 'object' && !Array.isArray(draft.rumor) ? draft.rumor : { chains: [] };
      draft.rumor.chains = Array.isArray(draft.rumor.chains) ? draft.rumor.chains : [];
      const c = draft.rumor.chains.filter(function (x) { return x && x.id === k; })[0];
      if (!c) { out = { ok: false, reason: 'missing', id: k }; return false; }
      c.suppressed = Array.isArray(c.suppressed) ? c.suppressed : [];
      const cap = Math.max(1, settings().maxSuppressed);
      if (c.suppressed.length >= cap) { out = { ok: false, reason: 'suppressed-full', id: k, cap: cap }; return false; }
      c.suppressed.push({ at: clockNow('rumor'), by: by, layer: LAYERS.indexOf(c.layer) >= 0 ? c.layer : 'rumor', why: why });
      c.updatedAt = clockNow('rumor');
      out = { ok: true, id: k, by: by, suppressed: c.suppressed.length, layer: c.layer };
    }, 'rumor:conceal');
    if (out && out.ok) { if (out.reason !== 'disabled') { stat.concealed++; stat.lastReason = 'concealed'; } else stat.lastReason = 'disabled'; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 证据调查：把一条链的**全部**经手逐跳列出，并回答那个唯一的问题——
   *   「传到最后还是不是原来那条」。**纯读**：不落盘、不动 stat、不触发挤出。
   * 四态如实：开关关闭 / 链名缺失 / 链不存在 / 正常（不把「没找到」与「没传」混为一谈）。
   */
  function investigate(id) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const k = clean(id, 80);
    if (!k) return { ok: false, reason: 'missing-fields' };
    const c = find(k);
    if (!c) return { ok: false, reason: 'missing', id: k };
    const hops = (Array.isArray(c.hops) ? c.hops : []).map(function (h) {
      return { from: h.from, to: h.to, layer: h.layer, motive: h.motive, value: h.value, conf: h.conf, intact: !!h.intact };
    });
    const final = hops.length ? hops[hops.length - 1] : null;
    const finalValue = final ? final.value : String(c.factValue);
    return { ok: true, id: c.id, factKey: c.factKey, factValue: c.factValue,
      // 事实侧与终态侧的 diff 只体现在「层 / 置信度 / 经手人」与这个布尔上；**正文（value）不被改写**
      // 除非有人显式以 distort 动机改过它——那时 intact 为 false，且 hops 里能看到是哪一跳改的。
      layer: c.layer, intact: !!c.intact, tampered: !c.intact,
      finalValue: finalValue, drift: (finalValue === String(c.factValue)) ? null : { from: String(c.factValue), to: finalValue },
      hops: hops, hopCount: hops.length, suppressed: (Array.isArray(c.suppressed) ? c.suppressed : []).length };
  }

  /**
   * 某人在本链上看得到什么。**只出公开层（fact / witness）**——转述与流言不过玩家面。
   * 纯读，不改任何状态。
   */
  function visibleTo(person) {
    const who = clean(person, 60);
    if (!who) return { ok: false, reason: 'missing-fields' };
    const out = [];
    chains().forEach(function (c) {
      if (!c || PUBLIC_LAYERS.indexOf(c.layer) < 0) return;
      const hops = Array.isArray(c.hops) ? c.hops : [];
      const seen = hops.filter(function (h) { return h && (h.from === who || h.to === who); });
      if (!seen.length) return;
      const last = seen[seen.length - 1];
      out.push({ id: c.id, factKey: c.factKey, layer: last.layer, value: last.value, conf: last.conf,
        direct: last.from === who || last.to === who });
    });
    return { ok: true, person: who, rows: out, count: out.length };
  }

  /**
   * 全知视图（**只进诊断**）：四层全出，含被隐瞒者与已被改写者。
   * 与 buildBlock 的分工是硬的：buildBlock 是给模型看的玩家面，这里是给作者看的底牌。
   */
  function fullView() {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    return { ok: true, chains: chains().map(function (c) {
      const hops = Array.isArray(c.hops) ? c.hops : [];
      return { id: c.id, factKey: c.factKey, layer: c.layer, intact: !!c.intact, hopCount: hops.length,
        suppressed: (Array.isArray(c.suppressed) ? c.suppressed : []).length,
        // 逐层计数：把「有多少还停在事实层」与「有多少已经到流言」分开数，
        //   合起来数就看不出「这条链到底烂到哪一层了」。
        byLayer: LAYERS.reduce(function (a, L) { a[L] = hops.filter(function (h) { return h && h.layer === L; }).length; return a; }, {}) };
    }) };
  }

  /**
   * 玩家面注入块。**只出 fact / witness 两层**（hearsay / rumor 只进 fullView）——
   *   转述与流言一旦进正文，模型就会把它们当成既成事实写下去，而那正是本模块要防的那件事。
   * 与 SOURCES 同批登记：只加分支不加源表 = 开关点了零效果。
   */
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const list = chains().filter(function (c) {
      if (!c || PUBLIC_LAYERS.indexOf(c.layer) < 0) return false;
      const hops = Array.isArray(c.hops) ? c.hops : [];
      // 停在事实层且没人经手的链不进正文：那是「事实」本身，记忆块已经在讲它了。
      return hops.some(function (h) { return h && PUBLIC_LAYERS.indexOf(h.layer) >= 0; });
    }).slice(-Math.max(1, cfg.maxChains));
    if (!list.length) return '';
    const lines = list.map(function (c) {
      const hops = (Array.isArray(c.hops) ? c.hops : []).filter(function (h) { return h && PUBLIC_LAYERS.indexOf(h.layer) >= 0; });
      const last = hops[hops.length - 1];
      const tail = last && last.layer === 'witness' ? '（有人亲历）' : '（事实已知）';
      return '· ' + c.factKey + ' = ' + String(c.factValue) + tail;
    });
    return '[传开的与亲眼见的]\n' + lines.join('\n')
      + '\n本节只收「事实本身」与「亲历者所见」两类；听来的转述与流言不进此处——'
      + '角色只能依据自己亲历或当面听来的内容行动，不得把「听说」写成「看见」。\n';
  }

  WA.rumor = {
    LAYERS: LAYERS, MOTIVES: MOTIVES, PUBLIC_LAYERS: PUBLIC_LAYERS, LAYER_LEVEL: LAYER_LEVEL,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    startChain: startChain, relay: relay, refute: refute, conceal: conceal,
    investigate: investigate, visibleTo: visibleTo, fullView: fullView, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();

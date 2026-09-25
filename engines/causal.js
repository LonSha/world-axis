/**
 * WorldAxis engines/causal.js (v2.62.0)
 * 因果结算：原因成立 → 条件满足 → 行动发生 → 直接后果 → 延迟后果。
 *
 * 为什么单独成模块（而不并进 intel）：
 *   intel 管的是「谁知道什么、凭什么相信」，是**认知面**；本模块管的是
 *   「事情怎么发生、后果什么时候到」，是**结算面**。两者的真源不同：
 *   认知可以错（怀疑/谣言），结算不可错（已发生的事实就是事实）。
 *   把它们并成一个模块，最直接的后果是「人物以为会发生」与「真的发生了」
 *   在状态里长得一样——而路线图把这条列为最有价值的区分。
 *
 * 设计边界：
 *   1 总开关默认关闭。关闭时不结算、不注入，也不凭空补写后果。
 *   2 原因必须指向已存在的事实 / 事件 / 暗流（不凭空生成原因）。
 *     主语检查复用 intel.knownCause（单一真源），不另写一份「什么算已知」。
 *   3 **最有价值的是取消、延期与失效**：前提消失后旧计划不得照常执行；
 *      事件结束后也不得立刻把所有后果清空。故 cancelled / expired 是
 *      显式终态而不是「记录被删掉」——删掉就再也答不出「为什么没发生」。
 *   4 延迟后果到点只**报告**，由调用方结算；不自动把预测写成既成事实。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) {
    try { return WA.clock.now(site); } catch (e) { return Date.now(); }
  };
  const LS_KEY = 'worldaxis_causal_settings_v1';
  const DEF = { enabled: false, maxChains: 4, maxItems: 2 };
  const __REG = { key: LS_KEY, def: DEF, module: 'causal', bounds: { maxChains: [1, 8], maxItems: [1, 4] } };
  // 阶段：原因待定 → 条件未足 → 已行动 → 直接后果落地 → 延迟后果在途 → 终态
  const STAGES = ['open', 'pending', 'acted', 'immediate', 'delayed'];
  // 终态三态必须区分：结算 / 取消 / 失效。混成一个「关闭」就答不出为什么。
  const TERMINAL = ['settled', 'cancelled', 'expired'];
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // v2.87.0 B6：两份读数从不混用。
  //   stat      —— **本次进程的累计**（自模块装载起发生过几次），刷新即零。
  //   stateView —— **存档里的当前状态**（现在有几条、各处于什么状态），只读存档、不随进程复位。
  //   两者之前混在同一个计数器里：「这条链现在怎么了」永远答不出，
  //   因为读到的是「这一轮开着过程中发生过几次」。
  const stat = { chains: 0, acts: 0, deferred: 0, cancelled: 0, expired: 0, blocked: 0, lastReason: '' };

  function clean(v, max) { return WA.inputGuard.text(v, max || 80); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function txt(v) { return (v === undefined || v === null) ? '' : String(v); }
  /** 原因是否已存在——单一真源指向 intel.knownCause；intel 缺席时按同一口径兜底 */
  function knownCause(id) {
    const key = clean(id, 80);
    if (!key) return false;
    // intel 认出即成立；**认不出不能就此返回** —— intel 的口径里没有「因果结算记录」这一面，
    //   早期写法在这里直接 return，于是下面那段传播判定永远走不到（实测：加了分支仍全 false）。
    try { if (WA.intel && typeof WA.intel.knownCause === 'function' && WA.intel.knownCause(key)) return true; } catch (e) {}
    const st = state();
    const facts = [].concat(st.worldFacts || [], (st.memory || {}).facts || []);
    const events = ((st.evolution || {}).events || []);
    const currents = st.currents || [];
    // v2.84.0：已结算的因果后果同样是**已发生的事**，必须能当后续因果链的原因——
    //   否则「A 发生 → 引起 B」这条最核心的传播环在模块内自我封闭：
    //   后果写进 echoes 之后，除了正文谁也读不到，链条永远接不起来。
    //   实测（v2.84.0 探针）：结算完的链 id / 回声 id，knownCause 都是 false。
    if (settledCause(key, st)) return true;
    return facts.some(function (x) { return x && (x.id === key || x.key === key); })
      || events.some(function (x) { return x && x.id === key; })
      || currents.some(function (x) { return x && (x.id === key || (x.causes || []).indexOf(key) >= 0); });
  }
  /**
   * 已结算的因果后果是否可作原因（v2.84.0 B5：传播环的入口）。
   *   只认**已结算**（status='settled' / delayed 项 status='settled'）：
   *   在途链的 delayed 仍是预测，不得充当原因——否则「打算做」被当成「已经做了」。
   *   回声 id 与链 id 都要认：前者是正文可读的触面，后者是结算台账的主键。
   */
  function settledCause(key, st) {
    const settled = ((st.causal || {}).settled || []);
    if (settled.some(function (x) { return x && (x.id === key || x.echo === key || (x.echo && x.echo === 'ec_' + key)); })) return true;
    return ((st.causal || {}).chains || []).some(function (x) {
      if (!x || x.status !== 'settled') return false;
      if (x.id === key) return true;
      // 回声 id 的构造在 settle 里是 'ec_' + <延迟项 id>：调用方拿到的是回声 id，
      //   故这里必须同时认「延迟项 id」与「回声 id」两种写法，否则正文可见的那一面接不上。
      return (x.delayed || []).some(function (d) {
        return d && d.status === 'settled' && (d.id === key || 'ec_' + d.id === key);
      });
    });
  }
  function ensureCausal(draft) {
    if (!draft.causal || typeof draft.causal !== 'object' || Array.isArray(draft.causal)) draft.causal = { chains: [], settled: [] };
    if (!Array.isArray(draft.causal.chains)) draft.causal.chains = [];
    if (!Array.isArray(draft.causal.settled)) draft.causal.settled = [];
    return draft.causal;
  }
  function row(id) {
    const c = (state().causal || {}).chains || [];
    return c.filter(function (x) { return x && x.id === clean(id, 80); })[0] || null;
  }
  function isTerminal(x) { return !!x && TERMINAL.indexOf(x.status) >= 0; }

  /**
   * 建立一条因果链。cause 必须已存在；condition 可空（空 = 无条件，立即满足）。
   * delayed 是**待执行的后果**，不是已发生的事实——它到点只报告，不自动写入事实。
   */
  function addChain(item) {
    const it = item || {};
    const cause = clean(it.cause, 80), action = clean(it.action, 80);
    if (!cause || !action) return { ok: false, reason: 'missing-fields' };
    if (!knownCause(cause)) return { ok: false, reason: 'unknown-cause' };
    let out = null;
    WA.store.transact(function (draft) {
      const c = ensureCausal(draft);
      const now = clockNow('causal');
      const rowItem = {
        id: 'cs_' + now + '_' + c.chains.length,
        cause: cause,
        condition: clean(it.condition, 80),
        action: action,
        immediate: clean(it.immediate, 120),
        delayed: [],
        status: 'open',
        stage: 'open',
        cancelReason: '',
        at: now,
        updatedAt: now
      };
      // 延迟后果：{after: 相对毫秒, text} —— 相对量避免「排期时刻」与「到期时刻」两处真源
      const dl = Array.isArray(it.delayed) ? it.delayed.slice(0, 4) : [];
      dl.forEach(function (x, i) {
        const text = clean(x && x.text, 120);
        if (!text) return;
        const after = isFinite(Number(x && x.after)) ? Math.max(0, Number(x.after)) : 0;
        rowItem.delayed.push({ id: rowItem.id + '_d' + i, text: text, after: after, dueAt: now + after, status: 'scheduled' });
      });
      c.chains.push(rowItem);
      // 挤出走单一出口（cap 的单一真源是 core/evict.js 的 SITES，与 store.__BOUNDED_CAPS 同源）。
      //   终态记录同样占位并被挤出——「留痕」有边界，但不等于可以无界留痕。
      if (WA.evict) WA.evict.array(c.chains, 'causal.chains');
      else if (c.chains.length > 24) c.chains.splice(0, c.chains.length - 24);
      out = { ok: true, id: rowItem.id, delayed: rowItem.delayed.length };
    }, 'causal:add-chain');
    if (out && out.ok) { stat.chains++; stat.lastReason = 'added'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 推进一条链：原因成立 + 条件满足 ⇒ 行动发生 ⇒ 直接后果落进世界事实。
   * 条件未满足 ⇒ 停在 pending（**这就是「延期」的自然形态**，不需要额外的 defer 调用）。
   * 原因已消失（不再 knownCause）⇒ 自动 **expire（失效）**：旧计划不得照常执行。
   */
  function tick(facts) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: true, changed: 0, reason: 'disabled' }; }
    const f = facts || {};
    let n = null;
    WA.store.transact(function (draft) {
      // v2.87.0 B6：推进语义只有一份（advanceChains），真跑与试演共用。
      n = advanceChains(draft, f, cfg);
      stat.expired += n.expired;
      stat.acts += n.acted;
    }, 'causal:tick');
    const changed = n ? n.changed : 0, expired = n ? n.expired : 0;
    if (n && n.pending) stat.lastReason = 'condition-open';
    stat.lastReason = expired ? 'expired' : (changed ? 'advanced' : (stat.lastReason || 'nothing-to-do'));
    return { ok: true, changed: changed, expired: expired, reason: stat.lastReason };
  }

  /** 到点的延迟后果（**只报告，不自动结算**——预测不得自己变成事实） */
  function due(now) {
    const t = isFinite(Number(now)) ? Number(now) : clockNow('causal');
    const c = (state().causal || {}).chains || [];
    const out = [];
    c.forEach(function (x) {
      if (!x || isTerminal(x)) return;
      (x.delayed || []).forEach(function (d) {
        if (d && d.status === 'scheduled' && isFinite(d.dueAt) && t >= d.dueAt) out.push({ chain: x.id, id: d.id, text: d.text, dueAt: d.dueAt });
      });
    });
    return out;
  }

  // 阶段是否已越过「行动发生」——**settle 的前置条件**。
  //   为什么必须判：条件未足（pending）或从未 tick（open）时，这件事**还没发生**。
  //   此时允许结算它的延迟后果，等于把「预测」直接写成「已发生」——正是本模块
  //   第 3 条边界（取消/失效显式留痕）想守住的同一件事，只是漏了这条路径。
  //   实测（v2.84.0 探针）：open + 条件未足的链调用 settle 返回 ok，回声落盘、链变 settled。
  //   'acted' 也要算「已行动」：tick 一次只推进一格（open→acted→immediate），
  //   行动发生的**那一刻**就是 acted；把结算门槛设成 immediate 会让「行动刚发生、
  //   后果正要落地」这一格变成死区（实测：条件满足后同一项仍被拒，守卫成了恒拒）。
  const SETTLE_READY = ['acted', 'immediate', 'delayed'];
  function hasActed(x) { return !!x && SETTLE_READY.indexOf(x.stage) >= 0; }

  /** 该因果链是否已具备结算延迟后果的前置条件。未具备时返回原因码（供调用方如实拒收）。 */
  function settleBlockReason(x) {
    if (!x) return 'missing-chain';
    if (isTerminal(x)) return 'chain-terminal';
    if (!hasActed(x)) return 'not-acted';
    return '';
  }

  /** 结算一条延迟后果（写进回声，可被正文触到） */
  function settle(chainId, delayedId, note) {
    const cid = clean(chainId, 80), did = clean(delayedId, 80);
    if (!cid || !did) return { ok: false, reason: 'missing-fields' };
    let out = null;
    WA.store.transact(function (draft) {
      const c = ensureCausal(draft);
      const x = c.chains.filter(function (y) { return y && y.id === cid; })[0];
      // 「还没发生」不得结算（见 settleBlockReason）：预测不得跳过行动直接变成既成事实
      const block = settleBlockReason(x);
      if (block) {
        out = { ok: false, reason: block };
        if (x) { out.stage = x.stage; out.status = x.status; }
        return false;
      }
      const d = (x.delayed || []).filter(function (y) { return y && y.id === did; })[0];
      if (!d) { out = { ok: false, reason: 'missing-delayed' }; return false; }
      if (d.status !== 'scheduled') { out = { ok: false, reason: 'already-' + d.status }; return false; }
      const now = clockNow('causal');
      d.status = 'settled'; d.settledAt = now;
      // 后果落成回声（已结算结果与正文的接触面），不是「预测」
      draft.echoes = Array.isArray(draft.echoes) ? draft.echoes : [];
      draft.echoes.push({ id: 'ec_' + did, refCurrent: x.cause, result: clean(note, 120) || d.text, exposure: 'obvious', at: now });
      if (draft.echoes.length > 40) draft.echoes.splice(0, draft.echoes.length - 40);
      // 全部延迟后果都已处置 ⇒ 整条链结算为终态（**不删记录**：删了就答不出「为什么后来是这样」）
      const left = (x.delayed || []).filter(function (y) { return y && y.status === 'scheduled'; }).length;
      if (!left) { x.status = 'settled'; x.settledAt = now; }
      x.updatedAt = now;
      // echo 字段记的是**回声 id**：settledCause 靠它把「正文可见的回声」映射回链，
      //   只记链 id 会让正文侧拿到的回声 id 问不出「这是谁引起的」。
      c.settled.push({ id: x.id, at: now, result: d.text, echo: 'ec_' + d.id });
      if (WA.evict) WA.evict.array(c.settled, 'causal.settled');
      else if (c.settled.length > 40) c.settled.splice(0, c.settled.length - 40);
      out = { ok: true, id: did, chainStatus: x.status };
    }, 'causal:settle');
    if (out && out.ok) stat.lastReason = 'settled'; else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /** 取消：有人主动叫停（与「前提消失」的失效分开归因） */
  function cancel(chainId, reason) {
    const cid = clean(chainId, 80);
    if (!cid) return { ok: false, reason: 'missing-fields' };
    let out = null;
    WA.store.transact(function (draft) {
      const x = ensureCausal(draft).chains.filter(function (y) { return y && y.id === cid; })[0];
      if (!x) { out = { ok: false, reason: 'missing-chain' }; return false; }
      if (isTerminal(x)) { out = { ok: false, reason: 'chain-terminal', status: x.status }; return false; }
      x.status = 'cancelled'; x.cancelReason = clean(reason, 80) || '调用方取消'; x.updatedAt = clockNow('causal');
      out = { ok: true, id: x.id, status: x.status };
    }, 'causal:cancel');
    if (out && out.ok) { stat.cancelled++; stat.lastReason = 'cancelled'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /** 延期：同一件事的排期整体后移（延迟后果的 dueAt 一起推）。返回推后了几项。 */
  function defer(chainId, byMs) {
    const cid = clean(chainId, 80), by = Number(byMs);
    if (!cid || !isFinite(by) || by === 0) return { ok: false, reason: 'bad-args' };
    let out = null;
    WA.store.transact(function (draft) {
      const x = ensureCausal(draft).chains.filter(function (y) { return y && y.id === cid; })[0];
      if (!x) { out = { ok: false, reason: 'missing-chain' }; return false; }
      if (isTerminal(x)) { out = { ok: false, reason: 'chain-terminal', status: x.status }; return false; }
      let n = 0;
      (x.delayed || []).forEach(function (d) {
        if (d && d.status === 'scheduled') { d.dueAt = Math.max(0, Number(d.dueAt || 0) + by); n++; }
      });
      x.deferredBy = Number(x.deferredBy || 0) + by;
      x.status = 'delayed'; x.stage = 'delayed'; x.updatedAt = clockNow('causal');
      out = { ok: true, id: x.id, shifted: n };
    }, 'causal:defer');
    if (out && out.ok) { stat.deferred++; stat.lastReason = 'deferred'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /** 已发生 vs 待发生 vs 有条件：三态查询口（这三件事不得同形） */
  /**
   * v2.87.0 B6：当前状态视图（**只读存档**，零副作用）。
   *   与 stat()（本次进程累计）的分别：
   *     · stat()     答「自模块装载起发生过几次」—— 刷新页面即归零；
   *     · stateView() 答「存档里现在有几条、各处于什么状态」—— 只跟存档走。
   *   两者之前混在同一个计数器：读 stat() 的人以为自己看到了「当前状态」，
   *   实际看到的是「这一轮开着过程中的累计」—— 「这条链现在怎么了」永远答不出。
   *   byStatus 按真实状态分组（含三个终态），于是「取消 / 失效 / 结算」分得开，
   *   而不是都表现为「链没了」。
   */
  /**
   * v2.87.0 B6：一轮推进的**唯一实现**——真跑（tick）与分支试演（rehearse）共用同一份。
   *
   * 抽出来的理由不是「少写代码」，而是**两份实现必然漂移**：试演若另写一通推进规则，
   * 它给出的预览会在某个分支上与真跑不一致——而那种不一致恰好最难发现：
   * 用户据预览做决定，真跑却走了另一条路。
   *
   * 约定：只改传入的 draft（试演传深拷贝），**不碰 store、不碰 stat、不写台账**。
   * only 非空时只推进指定链（供单点干预预览）；真跑不传。
   */
  function advanceChains(draft, f, cfg, only) {
    const c = ensureCausal(draft);
    const now = isFinite(Number(f.now)) ? Number(f.now) : clockNow('causal');
    const n = { changed: 0, expired: 0, acted: 0, immediate: 0, delayed: 0, pending: 0, untouched: 0,
      skipped: Math.max(0, c.chains.length - cfg.maxChains), facts: [] };
    const rows = c.chains.slice(-cfg.maxChains).filter(function (x) { return !only || (x && x.id === only); });
    rows.forEach(function (x) {
      if (!x || isTerminal(x)) { n.untouched++; return; }
      if (!knownCause(x.cause) && (f.pruneInvalid !== false)) {
        x.status = 'expired'; x.stage = 'open';
        x.cancelReason = '前提消失（原因已不在世界事实中）'; x.updatedAt = now;
        n.expired++; n.changed++;
        return;
      }
      if (x.status === 'open') {
        const ready = !x.condition || (Array.isArray(f.metConditions) && f.metConditions.indexOf(x.condition) >= 0);
        if (!ready) {
          if (x.stage !== 'pending') { x.stage = 'pending'; x.updatedAt = now; n.changed++; }
          n.pending++;
          return;
        }
        x.status = 'acted'; x.stage = 'acted'; x.updatedAt = now;
        x.actedAt = now; n.changed++; n.acted++;
        return;
      }
      if (x.status === 'acted') {
        if (x.immediate) {
          draft.worldFacts = Array.isArray(draft.worldFacts) ? draft.worldFacts : [];
          if (!draft.worldFacts.some(function (w) { return w && w.key === ('causal:' + x.id); })) {
            draft.worldFacts.push({ id: 'wf_' + x.id, key: 'causal:' + x.id, value: x.immediate, scope: 'world', source: 'causal', at: now });
            if (draft.worldFacts.length > 100) draft.worldFacts.splice(0, draft.worldFacts.length - 100);
            n.facts.push('causal:' + x.id);
          }
        }
        x.status = 'immediate'; x.stage = 'immediate'; x.updatedAt = now; n.changed++; n.immediate++;
        return;
      }
      if (x.status === 'immediate') {
        x.status = 'delayed'; x.stage = 'delayed'; x.updatedAt = now; n.changed++; n.delayed++;
      }
    });
    return n;
  }
  /** 当前状态的摘要（单一实现：stateView 与试演后的读数同源） */
  function summarize(st) {
    const rows = (((st || {}).causal || {}).chains || []).filter(function (x) { return x && typeof x === 'object'; });
    const byStatus = {}, byStage = {};
    let live = 0, terminal = 0, scheduled = 0, pending = 0;
    rows.forEach(function (x) {
      const k = String(x.status || '(未标注)');
      byStatus[k] = (byStatus[k] || 0) + 1;
      const g = String(x.stage || '(未标注)');
      byStage[g] = (byStage[g] || 0) + 1;
      if (g === 'pending') pending++;
      if (isTerminal(x)) terminal++; else live++;
      (x.delayed || []).forEach(function (d) { if (d && d.status === 'scheduled') scheduled++; });
    });
    return {
      chains: rows.length, live: live, terminal: terminal,
      byStatus: byStatus, byStage: byStage, pending: pending,
      scheduledDelayed: scheduled,
      settledRows: (((st || {}).causal || {}).settled || []).length
    };
  }
  function stateView() { return summarize(state()); }
  /**
   * v2.87.0 B6：分支试演——「如果这一轮这么推进，会发生什么」。
   *
   * 与 rehearse 的分工：本函数跑**一整轮**（全部在推进窗口内的链），
   * previewIntervention 跑**单个动作**（定点）。
   *
   * 三条硬约束（清单：分支零污染）：
   *   ① 在深拷贝上跑，不调 store.transact；
   *   ② 不碰 stat、不写任何台账 —— 试演不得在任何面上留下痕迹；
   *   ③ 与真跑共用 advanceChains —— 预览与真跑不同源就毫无意义。
   */
  function rehearse(facts) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const f = facts || {};
    const draft = JSON.parse(JSON.stringify(state() || {}));
    const snap = function (d) {
      const m = {};
      (((d.causal || {}).chains) || []).forEach(function (x) {
        if (x && x.id) m[x.id] = { status: x.status, stage: x.stage };
      });
      return m;
    };
    const b = snap(draft);
    const n = advanceChains(draft, f, cfg);
    const a = snap(draft);
    const changes = [];
    Object.keys(a).forEach(function (id) {
      const x = b[id], y = a[id];
      if (!x || x.status !== y.status || x.stage !== y.stage) {
        changes.push({ id: id, from: x ? (x.status + '/' + x.stage) : '(新)', to: y.status + '/' + y.stage });
      }
    });
    return { ok: true, counts: n, changes: changes, facts: n.facts.slice(), after: summarize(draft), dryRun: true };
  }
  /**
   * v2.87.0 B6：干预预览——「现在对这条链做这个动作，会变成什么」（只读，零副作用）。
   *   导演面所有误操作都源于「先执行再看结果」；预览不留痕，才谈得上
   *   「干预预览留痕」——留痕的是**选择**，不是预览本身。
   *   action ∈ {advance, cancel, settle}。allowed=false 时给出原因码（与真跑同一套）。
   */
  function previewIntervention(chainId, action, args) {
    const cfg = settings();
    const cid = clean(chainId, 80), act = clean(action, 40);
    if (!cid || !act) return { ok: false, reason: 'missing-fields' };
    const x0 = row(cid);
    if (!x0) return { ok: false, reason: 'missing-chain' };
    const a = args || {};
    const before = { status: x0.status, stage: x0.stage };
    if (act === 'advance') {
      if (!cfg.enabled) return { ok: true, chain: cid, action: act, allowed: false, reason: 'disabled', before: before };
      const draft = JSON.parse(JSON.stringify(state() || {}));
      const n = advanceChains(draft, a, cfg, cid);
      const x = (((draft.causal || {}).chains) || []).filter(function (y) { return y && y.id === cid; })[0] || {};
      return { ok: true, chain: cid, action: act, allowed: true, before: before,
        after: { status: x.status, stage: x.stage }, counts: n,
        willWrite: n.facts.slice(), wouldChange: n.changed > 0, dryRun: true };
    }
    if (act === 'cancel') {
      if (isTerminal(x0)) return { ok: true, chain: cid, action: act, allowed: false, reason: 'chain-terminal', before: before };
      return { ok: true, chain: cid, action: act, allowed: true, before: before,
        after: { status: 'cancelled', stage: x0.stage }, reason: clean(a.reason, 80) || '调用方取消', dryRun: true };
    }
    if (act === 'settle') {
      const block = settleBlockReason(x0);
      if (block) return { ok: true, chain: cid, action: act, allowed: false, reason: block, before: before };
      const did = clean(a.delayedId, 80);
      const d = ((x0.delayed || []).filter(function (y) { return y && y.id === did; })[0]) || null;
      if (!d && did) return { ok: true, chain: cid, action: act, allowed: false, reason: 'missing-delayed', before: before };
      if (d && d.status !== 'scheduled') return { ok: true, chain: cid, action: act, allowed: false, reason: 'already-' + d.status, before: before };
      return { ok: true, chain: cid, action: act, allowed: true, before: before,
        after: { status: x0.status, stage: x0.stage, delayedId: d ? d.id : '', echo: d ? ('ec_' + d.id) : '' },
        willWrite: d ? ['ec_' + d.id] : [], dryRun: true };
    }
    return { ok: false, reason: 'unknown-action', action: act };
  }
  /**
   * v2.87.0 B6：冲突显式选择——同因同果的重复链。
   *   实测缺口：对同一 cause 连续两次同 action 建链，得到两条独立链，各自 tick、
   *   各自落事实 ⇒ 世界状态里出现两个「带伞」，调用方无从知道该用哪条。
   *   本函数只**报出**冲突（只读，不改任何状态）；消解由调用方显式选择
   *   （cancel 其一 / 都留）——「静默取一」才是真缺陷。
   */
  function conflicts() {
    const rows = (((state().causal || {}).chains) || []).filter(function (x) { return x && !isTerminal(x); });
    const seen = {}, out = [];
    rows.forEach(function (x) {
      const k = txt(x.cause) + ' :: ' + txt(x.action);
      if (seen[k]) {
        out.push({ cause: x.cause, action: x.action, ids: [seen[k].id, x.id],
          options: [seen[k].id, x.id, 'both'], note: '两条在途链同因同果，须显式选择保留哪条' });
      } else seen[k] = x;
    });
    return out;
  }
  /**
   * v2.87.0 B6：回放证据——「这一轮的推进凭什么？能不能重放同一个结果？」
   *   随机源已由 core/rand 治理（种子/通道/draws 可分列），但**没有任何一处把它与
   *   因果推进绑在一起**：事后想说「这一轮是可复现的」只能自己拼读数。
   *   reproducible=false 时**不得声称可回放**（自动种子刷新即换）。
   */
  function evidence() {
    const cfg = settings();
    const rnd = (WA.rand && typeof WA.rand.randStat === 'function') ? WA.rand.randStat() : null;
    const view = stateView();
    return {
      enabled: !!cfg.enabled, maxChains: cfg.maxChains,
      seed: rnd ? rnd.seed : null, seedSource: rnd ? rnd.seedSource : 'rand-absent',
      reproducible: !!(rnd && rnd.reproducible),
      draws: rnd ? rnd.draws : 0,
      channels: rnd && rnd.byChannel ? Object.keys(rnd.byChannel).sort() : [],
      chains: view.chains, byStatus: view.byStatus,
      acts: stat.acts, expired: stat.expired, blocked: stat.blocked
    };
  }
  function classify(chainId) {
    const x = row(chainId);
    if (!x) return { ok: false, reason: 'missing-chain' };
    return {
      ok: true, id: x.id, status: x.status, stage: x.stage,
      happened: ['immediate', 'delayed', 'settled'].indexOf(x.status) >= 0,
      pending: x.status === 'delayed' ? (x.delayed || []).filter(function (d) { return d.status === 'scheduled'; }).length : 0,
      conditional: x.condition || '',
      terminal: isTerminal(x),
      cancelled: TERMINAL.indexOf(x.status) >= 0,
      cancelReason: x.cancelReason || ''
    };
  }

  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const c = (state().causal || {}).chains || [];
    const live = c.filter(function (x) { return x && !isTerminal(x); }).slice(-cfg.maxChains);
    if (!live.length) return '';
    const lines = live.map(function (x) {
      const cond = x.condition ? ('（条件：' + x.condition + '）') : '';
      const stage = x.stage === 'pending' ? '条件未足' : x.stage;
      const dl = (x.delayed || []).filter(function (d) { return d.status === 'scheduled'; }).length;
      return x.cause + ' → ' + x.action + cond + '｜' + stage + (dl ? '｜待发生 ' + dl + ' 项' : '');
    });
    return '[因果结算]\n' + lines.join('\n')
      + '\n以上是正在推进的因果链。「待发生」不等于已发生，不得把延迟后果写成既成事实；'
      + '条件未足时事情必须停住，不得替它提前完成。';
  }

  WA.causal = {
    STAGES: STAGES, TERMINAL: TERMINAL,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    addChain: addChain, tick: tick, due: due, settle: settle, cancel: cancel, defer: defer,
    // v2.62.0: 原先还导出 isTerminal，但它是**自用谓词**（classify / tick 内部用），
    //   外部零消费 ⇒ dead-export-gate 判 self-only（过度导出）。终态判定已由 classify().terminal
    //   对外表达，不必再挂一个没有消费方的口——「导出即有承诺」是本仓库的纪律。
    classify: classify, knownCause: knownCause, buildBlock: buildBlock,
    // v2.84.0 B5：结算前置条件对外可查——调用方（UI/正文/其他引擎）能先问「这条链
    //   现在允许结算吗」，而不是撞上 not-acted 才知道。与 classify 一样是**只读**口。
    settleBlockReason: settleBlockReason,
    stat: function () { return Object.assign({}, stat); },
    // v2.87.0 B6：当前状态（只读存档）。与 stat()（本次进程累计）分列：
    //   累计答「这一轮发生过几次」，当前状态答「现在是怎么样」。混成一个数，两个问题都答不出。
    stateView: stateView,
    // v2.87.0 B6：导演面四个只读口（干预预览 / 分支试演 / 冲突报出 / 回放证据）。
    //   全部零副作用：预览与试演不改任何状态，冲突只报不消解，证据只读。
    previewIntervention: previewIntervention,
    rehearse: rehearse,
    conflicts: conflicts,
    evidence: evidence
  };
})();
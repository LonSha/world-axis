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
  const stat = { chains: 0, acts: 0, deferred: 0, cancelled: 0, expired: 0, blocked: 0, lastReason: '' };

  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 80); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  /** 原因是否已存在——单一真源指向 intel.knownCause；intel 缺席时按同一口径兜底 */
  function knownCause(id) {
    const key = clean(id, 80);
    if (!key) return false;
    try { if (WA.intel && typeof WA.intel.knownCause === 'function') return WA.intel.knownCause(key); } catch (e) {}
    const st = state();
    const facts = [].concat(st.worldFacts || [], (st.memory || {}).facts || []);
    const events = ((st.evolution || {}).events || []);
    const currents = st.currents || [];
    return facts.some(function (x) { return x && (x.id === key || x.key === key); })
      || events.some(function (x) { return x && x.id === key; })
      || currents.some(function (x) { return x && (x.id === key || (x.causes || []).indexOf(key) >= 0); });
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
    let changed = 0, expired = 0;
    WA.store.transact(function (draft) {
      const c = ensureCausal(draft);
      const now = isFinite(Number(f.now)) ? Number(f.now) : clockNow('causal');
      c.chains.slice(-cfg.maxChains).forEach(function (x) {
        if (!x || isTerminal(x)) return;
        // 前提消失 ⇒ 失效（最有价值的能力之一：旧计划不能照常执行）
        if (!knownCause(x.cause) && (f.pruneInvalid !== false)) {
          x.status = 'expired'; x.stage = 'open';
          x.cancelReason = '前提消失（原因已不在世界事实中）'; x.updatedAt = now;
          expired++; changed++; stat.expired++;
          return;
        }
        if (x.status === 'open') {
          const ready = !x.condition || (Array.isArray(f.metConditions) && f.metConditions.indexOf(x.condition) >= 0);
          if (!ready) {
            if (x.stage !== 'pending') { x.stage = 'pending'; x.updatedAt = now; changed++; }
            stat.lastReason = 'condition-open';
            return;
          }
          x.status = 'acted'; x.stage = 'acted'; x.updatedAt = now;
          x.actedAt = now; changed++; stat.acts++;
          return;
        }
        if (x.status === 'acted') {
          if (x.immediate) {
            // 直接后果落进权威世界事实——这是「已发生」，与 delayed 的「待发生」严格分开
            draft.worldFacts = Array.isArray(draft.worldFacts) ? draft.worldFacts : [];
            if (!draft.worldFacts.some(function (w) { return w && w.key === ('causal:' + x.id); })) {
              draft.worldFacts.push({ id: 'wf_' + x.id, key: 'causal:' + x.id, value: x.immediate, scope: 'world', source: 'causal', at: now });
              if (draft.worldFacts.length > 100) draft.worldFacts.splice(0, draft.worldFacts.length - 100);
            }
          }
          x.status = 'immediate'; x.stage = 'immediate'; x.updatedAt = now; changed++;
          return;
        }
        if (x.status === 'immediate') {
          x.status = 'delayed'; x.stage = 'delayed'; x.updatedAt = now; changed++;
        }
      });
    }, 'causal:tick');
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

  /** 结算一条延迟后果（写进回声，可被正文触到） */
  function settle(chainId, delayedId, note) {
    const cid = clean(chainId, 80), did = clean(delayedId, 80);
    if (!cid || !did) return { ok: false, reason: 'missing-fields' };
    let out = null;
    WA.store.transact(function (draft) {
      const c = ensureCausal(draft);
      const x = c.chains.filter(function (y) { return y && y.id === cid; })[0];
      if (!x) { out = { ok: false, reason: 'missing-chain' }; return; }
      if (isTerminal(x)) { out = { ok: false, reason: 'chain-terminal', status: x.status }; return; }
      const d = (x.delayed || []).filter(function (y) { return y && y.id === did; })[0];
      if (!d) { out = { ok: false, reason: 'missing-delayed' }; return; }
      if (d.status !== 'scheduled') { out = { ok: false, reason: 'already-' + d.status }; return; }
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
      c.settled.push({ id: x.id, at: now, result: d.text });
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
      if (!x) { out = { ok: false, reason: 'missing-chain' }; return; }
      if (isTerminal(x)) { out = { ok: false, reason: 'chain-terminal', status: x.status }; return; }
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
      if (!x) { out = { ok: false, reason: 'missing-chain' }; return; }
      if (isTerminal(x)) { out = { ok: false, reason: 'chain-terminal', status: x.status }; return; }
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
    stat: function () { return Object.assign({}, stat); }
  };
})();
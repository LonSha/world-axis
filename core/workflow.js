/**
 * WorldAxis core/workflow.js
 * 工作流节点注册表：before_reply / after_reply 两链，节点可开关/排序/回滚
 * 缝合来源：EW-Assistant 工作流调度 + 世界背面任务串行链
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainWin = WA.mainWin || window;
  const LS_KEY = 'worldaxis_workflow_v1';

  // 节点：{id, chain:'before'|'after', label, order, enabled, run(ctx)->Promise|void, rollback?(ctx)}
  const nodes = new Map();
  // v0.1.23: 节点执行画像（跨注册保留，排查「生成前卡顿在哪个节点」）
  const stats = new Map(); // id -> {count, errors, lastMs, totalMs, lastAt, lastStatus}
  const lastChains = { before: null, after: null }; // 最近一次各链的汇总

  const __REG = { key: LS_KEY, def: {}, module: 'workflow' };
  // v2.3.0: 读路径统一走 settingsBus（写路径早已迁移）——开关表损坏此前静默回落
  //   「全部节点按注册默认值」（等价于用户所有开关都被重置），且无任何留痕
  function loadSwitches() { return WA.settingsBus.read(__REG); }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function saveSwitches(sw) { WA.settingsBus.save(__REG, sw); }
  // v0.1.42: 链运行环形历史——最近 N 次运行的逐节点耗时/状态序列（趋势观察）
  const HISTORY_MAX = 20;
  const __chainHistory = [];
  function persistWorkflowHistory() {
    try {
      const chatId = (WA.store && WA.store.chatId) ? WA.store.chatId() : 'wa_default';
      const mainWin = (typeof window !== 'undefined' ? window : global);
      mainWin.localStorage.setItem('worldaxis_wf_history_' + chatId, JSON.stringify(__chainHistory.slice(-HISTORY_MAX)));
    } catch (e) {}
  }
  function recChain(chain, nodes, tStart) {
    try {
      __chainHistory.push({
        chain: chain, at: Date.now(), ms: Date.now() - tStart,
        nodes: nodes.map(function (n) { return { id: n.id, ms: n.ms, status: n.status }; })
      });
      while (__chainHistory.length > HISTORY_MAX) __chainHistory.shift();
      persistWorkflowHistory();
    } catch (e) { /* 历史留痕失败不影响链执行 */ }
  }
  // v2.1.0: 节点失败台账（此前失败只进日志与计数，原因不可查、巡视不可见）
  const FAIL_MAX = 30;
  const __wfFails = [];
  // v2.1.0: 单调消费序号——游标不依赖 Date.now（毫秒精度歧义 + 时钟回拨会漏报）；
  //   跨 resetHistory 不回退（清台账不等于让消费方重复计历史）。
  let __wfSeq = 0;
  function recFail(id, label, chain, msg) {
    try {
      __wfFails.push({ seq: ++__wfSeq, id: id, label: label || id, chain: chain, at: Date.now(), msg: String(msg == null ? '' : msg).slice(0, 160) });
      while (__wfFails.length > FAIL_MAX) __wfFails.shift();
    } catch (e) { /* 台账自身失败不影响链执行 */ }
  }
  function recStat(id, ms, status) {
    try {
      const st = stats.get(id) || { count: 0, errors: 0, lastMs: 0, totalMs: 0, lastAt: 0, lastStatus: null };
      st.count++; st.totalMs += ms; st.lastMs = ms; st.lastAt = Date.now(); st.lastStatus = status;
      if (status === 'error') st.errors++;
      stats.set(id, st);
    } catch (e) { /* 画像失败不影响链执行 */ }
  }

  const wf = WA.workflow = {
    register(node) {
      if (!node || !node.id || !node.chain) return;
      const sw = loadSwitches();
      nodes.set(node.id, Object.assign({ order: 100, enabled: true }, node, {
        enabled: sw[node.id] != null ? !!sw[node.id].enabled : (node.enabled !== false)
      }));
    },
    unregister(id) { nodes.delete(id); },
    setEnabled(id, on) {
      const n = nodes.get(id); if (!n) return;
      n.enabled = !!on;
      const sw = loadSwitches(); sw[id] = { enabled: n.enabled }; saveSwitches(sw);
    },
    list(chain) {
      return Array.from(nodes.values())
        .filter(n => !chain || n.chain === chain)
        .sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id));
    },

    /** 顺序执行一条链；单节点失败不中断后续（除非 node.critical） */
    async run(chain, ctx) {
      const tChain = Date.now();
      const executed = [];
      const trace142 = [];
      const list = this.list(chain).filter(n => n.enabled);
      WA.log('info', `工作流[${chain}] 执行 ${list.length} 个节点`);
      for (const node of list) {
        const t0 = Date.now();
        try {
          await node.run(ctx);
          executed.push(node);
          recStat(node.id, Date.now() - t0, 'ok');
          trace142.push({ id: node.id, ms: Date.now() - t0, status: 'ok' });
          WA.log('info', `  ✓ ${node.label || node.id} (${Date.now() - t0}ms)`);
        } catch (e) {
          recStat(node.id, Date.now() - t0, 'error');
          recFail(node.id, node.label, chain, (e && e.message) || e);   // v2.1.0: 失败原因入台账
          trace142.push({ id: node.id, ms: Date.now() - t0, status: 'error' });
          WA.log('error', `  ✗ ${node.label || node.id}: ` + (e && e.message || e));
          if (node.critical) {
            // 关键节点失败：逆序回滚已执行节点
            for (let i = executed.length - 1; i >= 0; i--) {
              try { executed[i].rollback && await executed[i].rollback(ctx); } catch (re) { WA.log('warn', '回滚失败 ' + executed[i].id, re); }
            }
            throw e;
          }
        }
      }
      try {
        lastChains[chain] = { at: Date.now(), nodeCount: list.length, executedCount: executed.length, ms: Date.now() - tChain };
        recChain(chain, trace142, tChain);
      } catch (e) {}
      return executed;
    },
    /** v0.1.23: 节点执行画像只读视图（按 lastMs 降序 Top N + 链级汇总），tool-diag 消费 */
    stats(topN) {
      const rows = [];
      stats.forEach(function (st, id) {
        rows.push({ id: id, count: st.count, errors: st.errors, lastMs: st.lastMs, avgMs: Math.round(st.totalMs / Math.max(1, st.count)), lastAt: st.lastAt, lastStatus: st.lastStatus });
      });
      rows.sort(function (a, b) { return b.lastMs - a.lastMs; });
      const n = topN && topN > 0 ? topN : 10;
      return { nodes: rows.slice(0, n), tracked: rows.length, lastChains: Object.assign({}, lastChains) };
    },
    resetStats() { stats.clear(); Object.keys(lastChains).forEach(function (k) { delete lastChains[k]; }); },
    /**
     * v2.1.0: 节点失败台账（只读）——失败原因此前只进日志，无任何程序化出口。
     *   items 按时间倒序（最近优先）；since 为**单调序号游标**，只取 seq > since 的失败
     *   （巡视据此算「本轮新增」；用序号而不用时间戳，避免毫秒同刻重复计入与时钟回拨漏报）。
     */
    fails(topN, since) {
      const n = (typeof topN === 'number' && topN > 0) ? topN : 10;
      const src = (typeof since === 'number' && since > 0) ? __wfFails.filter(function (f) { return f.seq > since; }) : __wfFails;
      return {
        tracked: __wfFails.length,
        items: src.slice(-n).reverse().map(function (f) { return { seq: f.seq, id: f.id, label: f.label, chain: f.chain, at: f.at, msg: f.msg }; })
      };
    },
    /** v2.1.0: 失败台账只读快照（巡视与诊断共用同一份口径） */
    failStats() {
      const byId = {};
      __wfFails.forEach(function (f) { byId[f.id] = (byId[f.id] || 0) + 1; });
      return { tracked: __wfFails.length, max: FAIL_MAX, byId: byId, seq: __wfSeq, lastAt: __wfFails.length ? __wfFails[__wfFails.length - 1].at : 0 };
    },
    /** v0.1.42: 链运行历史只读视图（tool-diag 消费）——最近 N 次运行的逐节点耗时序列 */
    history(topN) {
      const n = (typeof topN === 'number' && topN > 0) ? topN : 5;
      const rows = __chainHistory.slice(-n).map(function (h) {
        return { chain: h.chain, at: h.at, ms: h.ms, nodeCount: h.nodes.length,
          slowest: h.nodes.slice().sort(function (a, b) { return b.ms - a.ms; }).slice(0, 3),
          errors: h.nodes.filter(function (x) { return x.status === 'error'; }).length };
      });
      return { tracked: __chainHistory.length, max: HISTORY_MAX, runs: rows };
    },
    resetHistory(chatId) {
      __chainHistory.length = 0;
      __wfFails.length = 0;   // v2.1.0: 台账随历史一并重置（语义：清空运行痕迹）
      try {
        const cid = chatId || ((WA.store && WA.store.chatId) ? WA.store.chatId() : 'wa_default');
        const mainWin = (typeof window !== 'undefined' ? window : global);
        mainWin.localStorage.removeItem('worldaxis_wf_history_' + cid);
      } catch (e) {}
    },
    loadHistory(chatId) {
      try {
        const cid = chatId || ((WA.store && WA.store.chatId) ? WA.store.chatId() : 'wa_default');
        const mainWin = (typeof window !== 'undefined' ? window : global);
        const raw = mainWin.localStorage.getItem('worldaxis_wf_history_' + cid);
        __chainHistory.length = 0;
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            arr.slice(-HISTORY_MAX).forEach(function (x) { __chainHistory.push(x); });
          }
        }
      } catch (e) {}
    }
  };
})();

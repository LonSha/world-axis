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

  function loadSwitches() {
    try { return JSON.parse(mainWin.localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveSwitches(sw) { mainWin.localStorage.setItem(LS_KEY, JSON.stringify(sw)); }
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
      const list = this.list(chain).filter(n => n.enabled);
      WA.log('info', `工作流[${chain}] 执行 ${list.length} 个节点`);
      for (const node of list) {
        const t0 = Date.now();
        try {
          await node.run(ctx);
          executed.push(node);
          recStat(node.id, Date.now() - t0, 'ok');
          WA.log('info', `  ✓ ${node.label || node.id} (${Date.now() - t0}ms)`);
        } catch (e) {
          recStat(node.id, Date.now() - t0, 'error');
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
    resetStats() { stats.clear(); Object.keys(lastChains).forEach(function (k) { delete lastChains[k]; }); }
  };
})();

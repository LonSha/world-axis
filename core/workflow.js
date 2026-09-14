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

  function loadSwitches() {
    try { return JSON.parse(mainWin.localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveSwitches(sw) { mainWin.localStorage.setItem(LS_KEY, JSON.stringify(sw)); }

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
      const executed = [];
      const list = this.list(chain).filter(n => n.enabled);
      WA.log('info', `工作流[${chain}] 执行 ${list.length} 个节点`);
      for (const node of list) {
        const t0 = Date.now();
        try {
          await node.run(ctx);
          executed.push(node);
          WA.log('info', `  ✓ ${node.label || node.id} (${Date.now() - t0}ms)`);
        } catch (e) {
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
      return executed;
    }
  };
})();

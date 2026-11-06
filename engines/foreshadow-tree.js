/**
 * WorldAxis engines/foreshadow-tree.js (v2.303.0)
 * OPV13-2: 复杂事件伏笔的长周期生命树与回收失真
 *
 * 核心功能：
 *   1. 四态生命树模型：planted（埋设）-> dormant（潜伏发酵）-> harvested（回收揭示）/ decayed（失效淡忘）；
 *   2. 歧义发酵与误导分支（distort/ferment）：潜伏期因外部干扰与偏见催生 distorted_lead；
 *   3. 真实闭环与伪真相闭环判定（harvest）：根据出示证据链完整度裁决 true_closure vs distorted_closure；
 *   4. 自然失效淡忘（decay）：逾期或情势更迭后线索自然淡出，杜绝死板等待。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) {
    try { return WA.clock.now(site); } catch (e) { return Date.now(); }
  };

  const LS_KEY = 'worldaxis_foreshadow_tree_settings_v1';
  const DEF = { enabled: true, maxTrees: 60, staleThresholdDays: 180 };
  const __REG = { key: LS_KEY, def: DEF, module: 'foreshadowTree', bounds: {} };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return Object.assign({}, DEF, raw || {});
  }

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80);
  }

  function state() {
    return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
  }

  function bagOf(root) {
    const s = root || state();
    if (!s.foreshadowTree || typeof s.foreshadowTree !== 'object') {
      return { trees: [] };
    }
    if (!Array.isArray(s.foreshadowTree.trees)) {
      s.foreshadowTree.trees = [];
    }
    return s.foreshadowTree;
  }

  function ensure(draft) {
    draft.foreshadowTree = draft.foreshadowTree && typeof draft.foreshadowTree === 'object' && !Array.isArray(draft.foreshadowTree)
      ? draft.foreshadowTree : { trees: [] };
    if (!Array.isArray(draft.foreshadowTree.trees)) draft.foreshadowTree.trees = [];
    return draft.foreshadowTree;
  }

  const _stat = {
    planted: 0,
    fermented: 0,
    distorted: 0,
    harvestedTrue: 0,
    harvestedDistorted: 0,
    decayed: 0,
    refused: 0,
    lastReason: ''
  };

  /**
   * 1. 埋设伏笔（planted）
   */
  function plant(spec) {
    const s = spec || {};
    const id = clean(s.id, 50);
    const title = clean(s.title || s.name, 60);
    const premise = clean(s.premise || s.content, 200);
    const trueTarget = clean(s.trueTarget || s.target, 80);
    const coreClues = Array.isArray(s.clues) ? s.clues.map(function (c) { return clean(c, 80); }).filter(Boolean) : [];

    if (!id || !title) {
      _stat.refused++;
      _stat.lastReason = 'missing-id-or-title';
      return { ok: false, reason: 'missing-id-or-title' };
    }

    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const existing = bag.trees.find(function (t) { return t.id === id; });
      if (existing) {
        out = { ok: false, reason: 'already-exists', id: id };
        return false;
      }

      const now = clockNow('foreshadowTree');
      const tree = {
        id: id,
        title: title,
        premise: premise,
        trueTarget: trueTarget,
        coreClues: coreClues,
        status: 'planted',
        lifecycle: ['planted'],
        distortionLeads: [],
        createdAt: now,
        updatedAt: now,
        fermentedAt: null,
        harvestedAt: null,
        closureVerdict: null
      };

      bag.trees.push(tree);
      if (WA.evict && typeof WA.evict.array === 'function') {
        WA.evict.array(bag.trees, 'foreshadowTree.trees', settings().maxTrees);
      }

      out = { ok: true, tree: JSON.parse(JSON.stringify(tree)) };
      return true;
    }, 'foreshadowTree:plant');

    if (out && out.ok) {
      _stat.planted++;
      _stat.lastReason = 'planted';
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 2. 潜伏发酵（dormant）
   */
  function ferment(id, opts) {
    const tid = clean(id, 50);
    const o = opts || {};
    let out = null;

    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const tree = bag.trees.find(function (t) { return t.id === tid; });
      if (!tree) {
        out = { ok: false, reason: 'tree-not-found', id: tid };
        return false;
      }
      if (tree.status !== 'planted') {
        out = { ok: false, reason: 'invalid-status-transition', currentStatus: tree.status };
        return false;
      }

      const now = clockNow('foreshadowTree');
      tree.status = 'dormant';
      tree.lifecycle.push('dormant');
      tree.fermentedAt = now;
      tree.updatedAt = now;
      tree.interveningContext = clean(o.interveningContext || o.context, 150);

      out = { ok: true, id: tid, status: 'dormant', fermentedAt: now };
      return true;
    }, 'foreshadowTree:ferment');

    if (out && out.ok) {
      _stat.fermented++;
      _stat.lastReason = 'fermented';
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 3. 产生误导分支（distorted_lead）
   */
  function distort(id, opts) {
    const tid = clean(id, 50);
    const o = opts || {};
    const leadText = clean(o.leadText || o.misleadingNarrative, 150);
    const bias = clean(o.bias || 'rumor_drift', 40);

    if (!leadText) {
      return { ok: false, reason: 'missing-lead-text' };
    }

    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const tree = bag.trees.find(function (t) { return t.id === tid; });
      if (!tree) {
        out = { ok: false, reason: 'tree-not-found', id: tid };
        return false;
      }
      if (tree.status !== 'dormant' && tree.status !== 'planted') {
        out = { ok: false, reason: 'cannot-distort-in-current-status', currentStatus: tree.status };
        return false;
      }

      const now = clockNow('foreshadowTree');
      const lead = {
        leadId: 'dist_' + (tree.distortionLeads.length + 1),
        text: leadText,
        bias: bias,
        plantedAt: now
      };

      tree.distortionLeads.push(lead);
      tree.updatedAt = now;

      out = { ok: true, id: tid, lead: lead, distortionCount: tree.distortionLeads.length };
      return true;
    }, 'foreshadowTree:distort');

    if (out && out.ok) {
      _stat.distorted++;
      _stat.lastReason = 'distorted';
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 4. 回收揭示（harvest）
   * 根据出示证据链完整度裁决 true_closure vs distorted_closure
   */
  function harvest(id, opts) {
    const tid = clean(id, 50);
    const o = opts || {};
    const solver = clean(o.solver || 'player', 40);
    const evidenceList = Array.isArray(o.evidenceIds || o.evidences)
      ? (o.evidenceIds || o.evidences).map(function (e) { return clean(e, 80); }).filter(Boolean)
      : [];

    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const tree = bag.trees.find(function (t) { return t.id === tid; });
      if (!tree) {
        out = { ok: false, reason: 'tree-not-found', id: tid };
        return false;
      }
      if (tree.status === 'harvested' || tree.status === 'decayed') {
        out = { ok: false, reason: 'already-terminal', currentStatus: tree.status };
        return false;
      }

      const now = clockNow('foreshadowTree');
      // 判定证据匹配度
      const required = tree.coreClues || [];
      let matches = 0;
      required.forEach(function (req) {
        if (evidenceList.indexOf(req) >= 0) matches++;
      });

      const coverage = required.length > 0 ? (matches / required.length) : (evidenceList.length > 0 ? 1 : 0);
      const hasDistortions = (tree.distortionLeads || []).length > 0;

      let verdict = 'true_closure';
      let revelation = '';

      if (coverage >= 0.5) {
        verdict = 'true_closure';
        revelation = '证据确凿，击破所有误导分支，彻底揭示真相：' + tree.trueTarget;
      } else if (hasDistortions) {
        verdict = 'distorted_closure';
        const topLead = tree.distortionLeads[tree.distortionLeads.length - 1];
        revelation = '因缺乏关键物证，调查陷入误导假象：' + topLead.text;
      } else {
        verdict = 'incomplete_closure';
        revelation = '线索残缺不全，仅得出悬疑猜测。';
      }

      tree.status = 'harvested';
      tree.lifecycle.push('harvested');
      tree.harvestedAt = now;
      tree.updatedAt = now;
      tree.closureVerdict = verdict;
      tree.closureDetails = {
        solver: solver,
        evidencePresented: evidenceList,
        coverageRate: coverage,
        revelation: revelation
      };

      out = {
        ok: true,
        id: tid,
        status: 'harvested',
        verdict: verdict,
        coverage: coverage,
        revelation: revelation
      };
      return true;
    }, 'foreshadowTree:harvest');

    if (out && out.ok) {
      if (out.verdict === 'true_closure') _stat.harvestedTrue++;
      else _stat.harvestedDistorted++;
      _stat.lastReason = 'harvested:' + out.verdict;
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 5. 失效淡忘（decay）
   */
  function decay(id, opts) {
    const tid = clean(id, 50);
    const o = opts || {};
    const reason = clean(o.reason || 'time_elapsed_without_resolution', 120);

    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const tree = bag.trees.find(function (t) { return t.id === tid; });
      if (!tree) {
        out = { ok: false, reason: 'tree-not-found', id: tid };
        return false;
      }
      if (tree.status === 'harvested' || tree.status === 'decayed') {
        out = { ok: false, reason: 'already-terminal', currentStatus: tree.status };
        return false;
      }

      const now = clockNow('foreshadowTree');
      tree.status = 'decayed';
      tree.lifecycle.push('decayed');
      tree.updatedAt = now;
      tree.decayReason = reason;

      out = { ok: true, id: tid, status: 'decayed', decayReason: reason };
      return true;
    }, 'foreshadowTree:decay');

    if (out && out.ok) {
      _stat.decayed++;
      _stat.lastReason = 'decayed';
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  function get(id) {
    const tid = clean(id, 50);
    const bag = bagOf(state());
    const tree = bag.trees.find(function (t) { return t.id === tid; });
    if (!tree) return null;
    return JSON.parse(JSON.stringify(tree));
  }

  function stat() {
    const bag = bagOf(state());
    return Object.assign({}, _stat, {
      totalTrees: bag.trees.length,
      activeDormant: bag.trees.filter(function (t) { return t.status === 'dormant'; }).length,
      harvested: bag.trees.filter(function (t) { return t.status === 'harvested'; }).length,
      decayed: bag.trees.filter(function (t) { return t.status === 'decayed'; }).length
    });
  }

  WA.foreshadowTree = {
    plant: plant,
    ferment: ferment,
    distort: distort,
    harvest: harvest,
    decay: decay,
    get: get,
    stat: stat
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/foreshadow-tree.js', { kind: 'engine', ver: '2.303.0' });
  }
})();

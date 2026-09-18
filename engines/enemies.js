/**
 * WorldAxis engines/enemies.js (v0.3)
 * 仇敌录：blood血仇/grudge恩怨 + 黑盒（隐秘行为/资产） + 天下大势
 * 移植自 DlSNlGHT World world-engine-evolution.js (enemies/blackbox/worldTrends)
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const ENEMY_STATUS = ['追踪中', '策划中', '执行中', '已终结'];
  const ENEMY_TYPE = ['blood', 'grudge'];
  const ASSET_STATUS = ['有效', '过期', '暴露', '失效'];
  const TERMINATED_KEEP = 20; // 已终结仇敌保留20轮
  const TERMINATED_MAX = 20; // v1.0.0: 终结态数量兜底（20轮窗口内海量终结时仍不超量）
  const MAX_ACTIVE = 24;     // v1.0.0: 活跃仇敌环形容量（与 __BOUNDED_CAPS['evolution.enemies'] 登记同源）

  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  WA.enemies = {
    ENEMY_STATUS: ENEMY_STATUS, ENEMY_TYPE: ENEMY_TYPE, ASSET_STATUS: ASSET_STATUS,
    /** 仇敌录入账（backstage applyResult调用） */
    apply(draft, enemies) {
      (enemies || []).slice(0, 6).forEach(e => {
        if (!e || !e.name) return;
        draft.evolution.enemies = draft.evolution.enemies || [];
        const old = draft.evolution.enemies.find(x => x.name === e.name);
        const type = ENEMY_TYPE.includes(e.type) ? e.type : (old && old.type) || 'grudge';
        const status = ENEMY_STATUS.includes(e.status) ? e.status : (old && old.status) || '追踪中';
        if (old) {
          old.reason = e.reason || old.reason; old.type = type; old.status = status;
          if (status === '已终结' && !old.terminatedRound) old.terminatedRound = draft.evolution.round;
        } else {
          draft.evolution.enemies.push({ id: uid('en'), name: e.name, reason: e.reason || '', type, status, terminatedRound: null, createdRound: draft.evolution.round });
        }
      });
      // 已终结仇敌保留TERMINATED_KEEP轮后清除
      draft.evolution.enemies = (draft.evolution.enemies || []).filter(e => {
        if (e.status === '已终结' && e.terminatedRound != null && (draft.evolution.round - e.terminatedRound) > TERMINATED_KEEP) {
          WA.log('info', '仇敌已清除（终结超过' + TERMINATED_KEEP + '轮）：' + e.name);
          return false;
        }
        return true;
      });
      // v1.0.0: 活跃态环形剪枝——此前活跃仇敌（追踪中/策划中/执行中）无回收上限，
      // 长局无限累积且注入块全量展开；超 MAX_ACTIVE 时挤出最早创建者（终结者走独立生命周期，不在此列）。
      const enArr = draft.evolution.enemies = draft.evolution.enemies || [];
      const active = enArr.filter(e => e && e.status !== '已终结');
      if (active.length > MAX_ACTIVE) {
        const totalExcess = active.length - MAX_ACTIVE;
        active.sort((a, b) => (a.createdRound || 0) - (b.createdRound || 0));
        const toDrop = new Set(active.slice(0, totalExcess).map(e => e.id));
        // v2.13.0: 挤出侧单一出口记账（业务规则筛选型——按 createdRound 最旧优先）
        if (WA.evict) WA.evict.note('evolution.enemies', active.slice(0, totalExcess));
        draft.evolution.enemies = enArr.filter(e => !e || !toDrop.has(e.id));
        WA.log('info', '活跃仇敌容量治理：挤出最早创建的 ' + totalExcess + ' 个（保留 ' + MAX_ACTIVE + ' 个活跃上限）');
      }
      // v1.0.0: 终结态数量兜底——20 轮窗口内海量终结时按终结时间最旧挤出（总量硬上限兜底）
      const term = (draft.evolution.enemies || []).filter(e => e && e.status === '已终结');
      if (term.length > TERMINATED_MAX) {
        term.sort((a, b) => (a.terminatedRound || 0) - (b.terminatedRound || 0));
        const dropT = new Set(term.slice(0, term.length - TERMINATED_MAX).map(e => e.id));
        // v2.13.0: 终结态兜底挤出同样记账（业务规则筛选型）
        if (WA.evict) WA.evict.note('evolution.enemies', term.slice(0, term.length - TERMINATED_MAX));
        draft.evolution.enemies = (draft.evolution.enemies || []).filter(e => !e || !dropT.has(e.id));
        WA.log('info', '终结仇敌数量治理：挤出最早的 ' + (term.length - TERMINATED_MAX) + ' 个（保留 ' + TERMINATED_MAX + ' 个终结记录）');
      }
    },

    /** 黑盒入账 */
    applyBlackbox(draft, bb) {
      if (!bb) return;
      const box = draft.evolution.blackbox = draft.evolution.blackbox || { secretActions: [], secretAssets: [] };
      (bb.secretActions || []).slice(0, 6).forEach(a => {
        if (!a || !a.action) return;
        box.secretActions.push({ action: String(a.action).slice(0, 80), witnesses: String(a.witnesses || '无').slice(0, 40), at: Date.now() });
      });
      if (WA.evict) WA.evict.array(box.secretActions, 'evolution.blackboxActions');
      else box.secretActions = box.secretActions.slice(-15);
      (bb.secretAssets || []).slice(0, 8).forEach(a => {
        if (!a || !a.name) return;
        const old = box.secretAssets.find(x => x.name === a.name);
        const exposure = Math.max(0, Math.min(100, a.exposure != null ? a.exposure : (old && old.exposure) || 0));
        const status = ASSET_STATUS.includes(a.status) ? a.status : (old && old.status) || '有效';
        if (old) { old.exposure = exposure; old.status = status; }
        else box.secretAssets.push({ name: String(a.name).slice(0, 40), exposure, status });
      });
      if (WA.evict) WA.evict.array(box.secretAssets, 'evolution.blackboxAssets');
      else box.secretAssets = box.secretAssets.slice(-15);
    },

    /** 天下大势入账 */
    applyWorldTrends(draft, trends) {
      (trends || []).slice(0, 4).forEach(t => {
        if (!t || !t.name) return;
        draft.evolution.worldTrends = draft.evolution.worldTrends || [];
        const old = draft.evolution.worldTrends.find(x => x.name === t.name);
        if (old) {
          old.scope = t.scope || old.scope; old.description = t.description || old.description;
          old.status = (t.status === '已结束') ? '已结束' : '持续中';
        } else {
          draft.evolution.worldTrends.push({ id: uid('wt'), name: t.name, scope: t.scope || '', status: '持续中', description: t.description || '', source: t.source || '', createdRound: draft.evolution.round });
        }
      });
    },

    /** 仇敌/黑盒/大势注入块（before链，谨慎：黑盒内容仅提示存在性，不暴露细节） */
    buildEnemiesBlock() {
      const s = WA.store.get();
      const parts = [];
      const enemies = (s.evolution.enemies || []).filter(e => e.status !== '已终结');
      if (enemies.length) {
        // v1.0.0: 有界展开——超上限时截取前 12 个并标注余量（防长局注入膨胀）
        const shown = enemies.slice(0, 12);
        const more = enemies.length - shown.length;
        parts.push('【活跃仇敌】' + shown.map(e => e.name + '(' + e.type + '/' + e.status + ')').join('；') + (more > 0 ? '；…等' + more + '个' : ''));
      }
      const wt = (s.evolution.worldTrends || []).filter(t => t.status === '持续中');
      if (wt.length) parts.push('【天下大势】' + wt.map(t => t.name + '：' + (t.description || '').slice(0, 40)).join('；'));
      const exposedAssets = ((s.evolution.blackbox || {}).secretAssets || []).filter(a => a.status === '暴露');
      if (exposedAssets.length) parts.push('【已暴露隐秘资产】' + exposedAssets.map(a => a.name).join('；'));
      if (!parts.length) return '';
      return '<world_axis_enemies>\n' + parts.join('\n') + '\n</world_axis_enemies>';
    }
  };

  WA.workflow.register({
    id: 'enemies.inject', chain: 'before', order: 19, label: '仇敌/大势注入',
    async run(ctx) {
      const block = WA.enemies.buildEnemiesBlock();
      if (block) ctx.injections.push({ source: '仇敌/大势', position: 'after_last_user', depth: 1, content: block });
    }
  });
})();
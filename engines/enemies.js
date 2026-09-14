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

  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  WA.enemies = {
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
    },

    /** 黑盒入账 */
    applyBlackbox(draft, bb) {
      if (!bb) return;
      const box = draft.evolution.blackbox = draft.evolution.blackbox || { secretActions: [], secretAssets: [] };
      (bb.secretActions || []).slice(0, 6).forEach(a => {
        if (!a || !a.action) return;
        box.secretActions.push({ action: String(a.action).slice(0, 80), witnesses: String(a.witnesses || '无').slice(0, 40), at: Date.now() });
      });
      box.secretActions = box.secretActions.slice(-15);
      (bb.secretAssets || []).slice(0, 8).forEach(a => {
        if (!a || !a.name) return;
        const old = box.secretAssets.find(x => x.name === a.name);
        const exposure = Math.max(0, Math.min(100, a.exposure != null ? a.exposure : (old && old.exposure) || 0));
        const status = ASSET_STATUS.includes(a.status) ? a.status : (old && old.status) || '有效';
        if (old) { old.exposure = exposure; old.status = status; }
        else box.secretAssets.push({ name: String(a.name).slice(0, 40), exposure, status });
      });
      box.secretAssets = box.secretAssets.slice(-15);
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
      if (enemies.length) parts.push('【活跃仇敌】' + enemies.map(e => e.name + '(' + e.type + '/' + e.status + ')').join('；'));
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
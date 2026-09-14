/**
 * WorldAxis engines/direct-event.js
 * 突发事件引擎：一轮生成多轮解封 + 小纸条暗箱 + 客观外部推力 + Action Hook
 * 缝合来源：st-direct-event（一轮生成多轮享受/暗箱/终局判定/敌方身份通报）
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const directEvent = WA.directEvent = {
    active() { return WA.store.get().directEvents.find(e => e.status === 'active') || null; },

    /** 生成一个完整事件档案（副模型单次推理：暗箱+分轮小纸条+终局条件） */
    async create(opts) {
      opts = opts || {};
      const turns = Math.max(1, Math.min(30, opts.turns || 6));
      const sys = [
        '你是事件导演。一次推演完整事件链，输出严格JSON。',
        '铁律：小纸条绝不代写/预设玩家任何言行、内心或态度；只写【客观环境剧变/物理危机】与【NPC主动作为】；每张纸条结尾停在NPC具体动作或抉择点（Action Hook）。',
        '首行必须通报：【登场对手身份】：<姓名/代号>（所属势力/定位战力/装束动机）。',
        'JSON结构：{"title":"","opponent":"","box":"暗箱核心机密（主模型不可见的完整脉络与分支结局条件）","notes":["第1轮小纸条","第2轮小纸条",...共' + turns + '张],"goodEnd":"","badEnd":""}'
      ].join('\n');
      const s = WA.store.get();
      const worldSnap = JSON.stringify({ clock: s.clock, currents: s.currents.slice(-5).map(c => c.title) });
      try {
        const r = await WA.apiRouter.call('inference', [
          { role: 'system', content: sys },
          { role: 'user', content: '【世界快照】' + worldSnap + '\n【要求】' + (opts.prompt || '生成一个贴合当前世界状态的突发事件') }
        ], { json: true, maxTokens: 6000, temperature: 0.85 });
        if (!r || !Array.isArray(r.notes) || !r.notes.length) throw new Error('事件档案为空');
        const ev = {
          id: 'de' + Date.now(), title: r.title || '突发事件', opponent: r.opponent || '',
          totalTurns: r.notes.length, currentTurn: 0, status: 'active',
          box: r.box || '', notes: r.notes, goodEnd: r.goodEnd || '', badEnd: r.badEnd || '', createdAt: Date.now()
        };
        WA.store.transact(draft => { draft.directEvents.push(ev); });
        WA.emit('direct-event:created', ev);
        return { ok: true, event: ev };
      } catch (e) { WA.log('error', '突发事件生成失败', e && e.message); return { ok: false, error: e }; }
    },

    /** 取当前轮小纸条并推进（before链调用，注入用） */
    peekNote() {
      const ev = this.active();
      if (!ev) return null;
      if (ev.currentTurn >= ev.totalTurns) return null;
      return { ev, note: ev.notes[ev.currentTurn], turn: ev.currentTurn + 1, total: ev.totalTurns };
    },
    advance() {
      const ev = this.active(); if (!ev) return;
      WA.store.transact(draft => {
        const d = draft.directEvents.find(x => x.id === ev.id);
        if (d) { d.currentTurn++; if (d.currentTurn >= d.totalTurns) d.status = 'done'; }
      });
    },
    abort(id) {
      WA.store.transact(draft => { const d = draft.directEvents.find(x => x.id === (id || (this.active() || {}).id)); if (d) d.status = 'aborted'; });
    }
  };

  // before链：有active事件时把当前轮小纸条注入（零剧透：只递当前轮）
  WA.workflow.register({
    id: 'direct-event.note', chain: 'before', order: 30, label: '突发事件·本轮小纸条',
    async run(ctx) {
      const p = WA.directEvent.peekNote();
      if (!p) return;
      ctx.injections.push({
        source: '突发事件·' + p.ev.title + '（第' + p.turn + '/' + p.total + '轮）',
        position: 'after_last_user', depth: 0,
        content: '<direct_event_note>\n【后台事件推进·仅你可见，不要复述给玩家】\n' + p.note + '\n</direct_event_note>'
      });
    }
  });
  // after链：回复完成后推进轮次
  WA.workflow.register({
    id: 'direct-event.advance', chain: 'after', order: 40, label: '突发事件·轮次推进',
    async run() { WA.directEvent.advance(); }
  });
})();

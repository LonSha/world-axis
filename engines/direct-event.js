/** WorldAxis engines/direct-event.js (v0.2) — 突发事件（缝合 st-direct-event：一轮生成·多轮解封） */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const BOX_SYS = `你是「突发事件暗箱」生成器。生成一个分轮解封的突发事件。规则：
1. 事件共N轮，每轮揭示一层（真相逐层剥开）；
2. 绝不代写玩家言行；只描述环境、NPC动作与线索；
3. 每轮结尾留一个钩子牵引玩家进入下一轮；
4. 首轮需通报【登场对手身份】（可化名/伪装）。
只输出JSON：{"title":"...","opponent":"对手身份","box":"暗箱内情（完整真相，仅引擎可见）","notes":["第1轮小纸条","第2轮小纸条",...]}`;

  function getCtx() { try { return WA.mainWin.SillyTavern.getContext(); } catch (e) { return null; } }
  // v0.1.13: 生成中 busy 锁（缝合 ggd 小剧场 _sgnAutoActionBusy）——
  // after 链在 GENERATION_ENDED 回调里触发自动推进，若推进本身再触发生成，
  // 回调会再次命中 ENDED 形成无限自激。一把布尔锁即可切断。
  let _advanceBusy = false;

    // v0.1.43: 突发事件有界化——活跃项全留，终态项仅保留最近 3 条且剥离 notes（notes 是体积大头）
    const KEEP_DONE = 3;
    function pruneDirect(list) {
      const active = list.filter(function (e) { return e && e.status === 'active'; });
      const ended = list.filter(function (e) { return e && e.status !== 'active'; })
        .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); })
        .slice(0, KEEP_DONE)
        .map(function (e) { const c = Object.assign({}, e); delete c.notes; return c; });
      const kept = active.concat(ended).sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
      // v2.13.0: 终态突发事件环形挤出记账（此前静默丢弃最旧的终态纸条，用户无从得知）
      if (WA.evict) {
        const keptIds = {};
        kept.forEach(function (e) { if (e && e.id) keptIds[e.id] = true; });
        const dropped = (list || []).filter(function (e) { return e && !keptIds[e.id]; });
        if (dropped.length) WA.evict.note('directEvents', dropped);
      }
      return kept;
    }
  WA.directEvent = {
    /** 生成一个突发事件（一轮API调用，产出全部小纸条） */
    async create(opts) {
      opts = opts || {};
      const cfg = WA.apiRouter.getChannel('inference');
      if (!cfg.baseUrl || !cfg.model) { WA.log('warn', '突发事件：推演通道未配置'); return { ok: false }; }
      const turns = Math.max(1, Math.min(30, opts.turns || 6));
      const ctx = getCtx(); const chat = (ctx && ctx.chat) || [];
      const recent = chat.slice(-2).map(m => String(m.mes || '').slice(0, 400)).join('\n');
      const r = await WA.apiRouter.call('inference', [
        { role: 'system', content: BOX_SYS.replace('N轮', turns + '轮') },
        { role: 'user', content: '【事件要求】' + (opts.prompt || '（自由生成一个突发事件）') + '\n【近期剧情参考】\n' + recent }
      ], { json: true, maxTokens: 4000, temperature: 0.9 }).catch(e => { WA.log('error', '突发事件生成失败', e.message); return null; });
      if (!r || !r.notes || !r.notes.length) return { ok: false };
      WA.store.transact(d => {
        // 同时只允许一个活跃突发事件
        (d.directEvents || []).forEach(e => { if (e.status === 'active') e.status = 'aborted'; });
        d.directEvents.push({
          id: 'de' + clockNow('directEvent'), title: r.title || '突发事件',
          totalTurns: Math.min(turns, r.notes.length), currentTurn: 0,
          status: 'active', opponent: r.opponent || '', box: r.box || '',
          notes: r.notes.map(n => String(n).slice(0, 500)), createdAt: clockNow('directEvent')
        });
        d.directEvents = pruneDirect(d.directEvents || []);   // v0.1.43
      });
      WA.emit('directEvent:started');
      WA.log('info', '突发事件已生成：' + (r.title || '') + ' 共' + r.notes.length + '轮');
      return { ok: true };
    },

    active() { return (WA.store.read('directEvents', []) || []).find(e => e.status === 'active'); },

    abort() {
      WA.store.transact(d => { (d.directEvents || []).forEach(e => { if (e.status === 'active') e.status = 'aborted'; }); d.directEvents = pruneDirect(d.directEvents || []); });  // v0.1.43
      WA.emit('directEvent:ended');
    },

    /** 解封当前轮小纸条（before链注入，零剧透：只给当前轮） */
    currentNote() {
      const ev = this.active();
      if (!ev) return null;
      return ev.notes[ev.currentTurn] || null;
    },

    /** 推进一轮（after链）。v0.1.13: busy 锁防重入——同一轮 ENDED 只推进一次 */
    advance() {
      if (_advanceBusy) return;
      const ev = this.active();
      if (!ev) return;
      _advanceBusy = true;
      try {
        WA.store.transact(d => {
          const e = (d.directEvents || []).find(x => WA.store.sameId(x.id, ev.id)); // v2.30.0 P1-1 收口
          if (!e) return;
          e.currentTurn++;
          if (e.currentTurn >= e.totalTurns) { e.status = 'done'; WA.emit('directEvent:ended'); d.directEvents = pruneDirect(d.directEvents || []); }  // v0.1.43
        });
      } finally { _advanceBusy = false; }
    }
  };

  // before链：注入当前轮小纸条（不含暗箱内情，零剧透）
  WA.workflow.register({
    id: 'directEvent.note', chain: 'before', order: 20, label: '突发事件·本轮小纸条',
    async run(ctx) {
      const note = WA.directEvent.currentNote();
      const ev = WA.directEvent.active();
      if (!note || !ev) return;
      ctx.injections.push({
        source: '突发事件·第' + (ev.currentTurn + 1) + '轮',
        position: 'after_last_user', depth: 0,
        content: '<direct_event>\n【突发事件·进行中】' + ev.title + '\n【登场对手】' + ev.opponent + '\n【本轮展开】' + note + '\n【铁律】绝不代写玩家言行；围绕本轮展开推进。\n</direct_event>'
      });
    }
  });

  // after链：推进一轮
  WA.workflow.register({
    id: 'directEvent.advance', chain: 'after', order: 15, label: '突发事件·推进',
    async run() { WA.directEvent.advance(); }
  });
})();
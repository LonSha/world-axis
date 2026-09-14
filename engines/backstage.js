/**
 * WorldAxis engines/backstage.js
 * 世界演算底座：主世界时间轴/暗流/回声/纪事/认知边界/发送前一致性屏障
 * 缝合来源：世界背面 core（串行推演链/事务/取消/正文优先原则/发送前屏障1.3.1）
 * 骨架版：提供推演任务队列+提示词装配+结算入口；深度提示词在后续版本填充
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  // 串行推演链：同一时刻只跑一个世界推演任务（可取消）
  let currentTask = null;   // {id, ac, anchor, reason}
  let pendingAnchor = null; // 运行期间到达的新正文只打标记
  let taskSeq = 0;

  function getCtx() {
    try { return WA.mainWin.SillyTavern && WA.mainWin.SillyTavern.getContext ? WA.mainWin.SillyTavern.getContext() : null; }
    catch (e) { return null; }
  }

  function latestAnchor() {
    const ctx = getCtx();
    const chat = ctx && ctx.chat;
    if (!chat || !chat.length) return null;
    const idx = chat.length - 1;
    const m = chat[idx];
    return { idx, swipe: m.swipe_id || 0, hash: String(m.mes || '').length + ':' + String(m.mes || '').slice(-32) };
  }

  const backstage = WA.backstage = {
    isRunning: () => !!currentTask,
    pending: () => pendingAnchor,

    /** 请求一次世界推演（after_reply 链调用） */
    requestSimulate(reason) {
      const anchor = latestAnchor();
      if (!anchor) return { ok: false, reason: 'no-chat' };
      if (currentTask) { pendingAnchor = { anchor, reason }; return { ok: true, queued: true }; }
      return this._start(anchor, reason);
    },

    async _start(anchor, reason) {
      const id = ++taskSeq;
      const ac = new AbortController();
      currentTask = { id, ac, anchor, reason };
      WA.emit('backstage:started', { id, reason });
      try {
        const result = await this._runInference(anchor, ac.signal);
        if (ac.signal.aborted) return { ok: false, aborted: true };
        // 结算（事务）
        if (result) {
          WA.store.transact(draft => { this.applyResult(draft, result, anchor); });
        }
        WA.emit('backstage:settled', { id, anchor });
        return { ok: true };
      } catch (e) {
        WA.log('error', '世界推演失败', e && e.message);
        return { ok: false, error: e };
      } finally {
        currentTask = null;
        // 追赶：有pending则续跑
        if (pendingAnchor) {
          const p = pendingAnchor; pendingAnchor = null;
          this._start(p.anchor, p.reason || 'catch-up');
        }
      }
    },

    abort() { if (currentTask) currentTask.ac.abort(); },

    /** 推演提示词装配（骨架：装配输入，规则提示词由方向设置/世界书提供） */
    buildPrompt(anchor) {
      const s = WA.store.get();
      const ctx = getCtx();
      const chat = (ctx && ctx.chat) || [];
      const recent = chat.slice(Math.max(0, chat.length - 6)).map(m => (m.is_user ? '【玩家】' : '【正文】') + String(m.mes || '').slice(0, 800));
      const sys = [
        '你是世界演算引擎。镜头之外，世界仍在继续。',
        '基于当前世界状态与最新正文，结算镜头外的世界变化。',
        '已发生的正文事实优先；不篡改正文；不把所有事情围着玩家转。',
        '回复必须且只能是JSON对象：{"worldFacts":[],"people":[],"currents":[],"echoes":[],"chronicle":[], "clock":""}',
        'currents中事件可见性visibility取 hidden|trace|public；trace必须给public_trace（外人能看到的表面迹象）。'
      ].join('\n');
      const worldSnap = JSON.stringify({
        clock: s.clock, background: s.background.text ? s.background.text.slice(0, 600) : '',
        facts: s.worldFacts.slice(-20), people: Object.values(s.people).slice(0, 12).map(p => ({ n: p.name, loc: p.location, act: p.action })),
        currents: s.currents.filter(c => !['已结束'].includes(c.stage)).slice(0, 10).map(c => ({ t: c.title, v: c.visibility }))
      });
      return [
        { role: 'system', content: sys },
        { role: 'user', content: '【世界快照】' + worldSnap + '\n【近期正文】\n' + recent.join('\n---\n') }
      ];
    },

    async _runInference(anchor, signal) {
      const cfg = WA.apiRouter.getChannel('inference');
      if (!cfg.baseUrl || !cfg.model) { WA.log('info', '推演通道未配置，跳过世界推演'); return null; }
      const messages = this.buildPrompt(anchor);
      return await WA.apiRouter.call('inference', messages, { json: true, signal, maxTokens: 4000 });
    },

    /** 结算入口：把推演结果写入store（各字段合并而非覆盖） */
    applyResult(draft, r, anchor) {
      const now = Date.now();
      if (r.clock && typeof r.clock === 'string') { draft.clock.label = r.clock; draft.clock.source = 'engine'; }
      (r.worldFacts || []).forEach(f => {
        if (!f || !f.key) return;
        const old = draft.worldFacts.find(x => x.key === f.key);
        if (old) { if (old.value !== f.value) { draft.chronicle.push({ id: 'chg' + now, kind: 'fact', title: f.key, summary: old.value + ' → ' + f.value, at: now }); old.value = f.value; old.at = now; } }
        else draft.worldFacts.push({ id: 'wf' + now + Math.random().toString(36).slice(2, 6), key: f.key, value: f.value, scope: f.scope || 'world', source: 'engine', at: now, branchId: anchor && anchor.idx });
      });
      (r.people || []).forEach(p => {
        if (!p || !p.name) return;
        const id = 'p_' + String(p.name);
        const old = draft.people[id] || { id, name: p.name, knowledge: {} };
        draft.people[id] = Object.assign(old, {
          location: p.location || old.location, action: p.action || old.action,
          intent: p.intent || old.intent, body: p.body || old.body, updatedAt: now
        });
        if (p.knowledge) old.knowledge = Object.assign(old.knowledge || {}, p.knowledge);
      });
      (r.currents || []).forEach(c => {
        if (!c || !c.title) return;
        const old = draft.currents.find(x => x.title === c.title);
        if (old) { old.summary = c.summary || old.summary; old.stage = c.stage || old.stage; old.visibility = c.visibility || old.visibility; old.public_trace = c.public_trace || old.public_trace; old.updatedAt = now; }
        else draft.currents.push({ id: 'cu' + now + Math.random().toString(36).slice(2, 6), title: c.title, summary: c.summary || '', visibility: c.visibility || 'hidden', public_trace: c.public_trace || '', causes: c.causes || [], participants: c.participants || [], stage: c.stage || '发展', createdAt: now, updatedAt: now, branchId: anchor && anchor.idx });
      });
      (r.echoes || []).forEach(e => { if (e && e.result) draft.echoes.push({ id: 'ec' + now + Math.random().toString(36).slice(2, 6), refCurrent: e.refCurrent || '', result: e.result, exposure: e.exposure || 'subtle', at: now }); });
      (r.chronicle || []).forEach(c => { if (c && c.title) draft.chronicle.push({ id: 'ch' + now + Math.random().toString(36).slice(2, 6), kind: c.kind || 'event', title: c.title, summary: c.summary || '', at: now, refs: c.refs || [] }); });
      // 容量控制
      draft.echoes = draft.echoes.slice(-40);
      draft.chronicle = draft.chronicle.slice(-200);
      draft.worldFacts = draft.worldFacts.slice(-100);
    }
  };

  // ── 工作流节点注册 ──
  WA.workflow.register({
    id: 'backstage.consistency', chain: 'before', order: 10, critical: false,
    label: '一致性屏障·世界结算',
    async run(ctx) {
      // 发送前：若有未结算正文（推演落后），先补完再继续
      if (WA.backstage.isRunning()) {
        WA.log('info', '一致性屏障：等待进行中的世界推演（不阻塞过久）');
        // 骨架版：不硬阻塞生成，只记录；完整版可await带超时
      }
    }
  });

  WA.workflow.register({
    id: 'backstage.simulate', chain: 'after', order: 20, critical: false,
    label: '世界推演（后台）',
    async run(ctx) { WA.backstage.requestSimulate('after-reply'); }
  });
})();

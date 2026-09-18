/** WorldAxis engines/chapters.js (v0.2) — 章节叙事（缝合 st-beat-tracker） */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  // v0.1.43: 章节史有界化——仅保留最近 MAX_HISTORY 章；编号改由 seq 计数器驱动，
  // 与 history 长度解耦，裁剪后不会出现重复章号（旧数据无 seq 时从现存最大 no 续起）。
  const MAX_HISTORY = 20;
  function pruneHistory(list) {
    const a = list || [];
    // v2.13.0: 章节史挤出走单一出口（此前 slice(-N) 静默丢弃最旧章节）
    if (WA.evict && Array.isArray(a) && a.length > MAX_HISTORY) {
      const tail = a.slice(0, a.length - MAX_HISTORY);
      WA.evict.note('chapters.history', tail);
    }
    return a.slice(-MAX_HISTORY);
  }
  function nextNo(d) {
    const hist = d.chapters.history || [];
    let mx = d.chapters.seq || 0;
    hist.forEach(function (h) { if (h && typeof h.no === 'number' && h.no > mx) mx = h.no; });
    if (d.chapters.current && typeof d.chapters.current.no === 'number' && d.chapters.current.no > mx) mx = d.chapters.current.no;
    d.chapters.seq = mx + 1;
    return d.chapters.seq;
  }
  WA.chapters = {
    start(title, opts) {
      opts = opts || {};
      WA.store.transact(d => {
        if (d.chapters.current) { // 自动结束旧章
          d.chapters.history.push(Object.assign({}, d.chapters.current, { endedAt: clockNow('chapters') }));
        }
        const no = nextNo(d);
        d.chapters.current = { no: no, title: title || ('第' + no + '章'), script: opts.script || '', notes: opts.notes || '', startedAt: clockNow('chapters') };
        d.chapters.active = true;
        d.chapters.history = pruneHistory(d.chapters.history);   // v0.1.43
      });
      WA.emit('chapters:changed');
    },
    end(note) {
      WA.store.transact(d => {
        if (!d.chapters.current) return false;
        d.chapters.current.endedAt = clockNow('chapters');
        d.chapters.current.endNote = note || '';
        d.chapters.history.push(d.chapters.current);
        d.chapters.history = pruneHistory(d.chapters.history);   // v0.1.43
        d.chapters.current = null;
        d.chapters.active = false;
      });
      WA.emit('chapters:changed');
    },
    current() { return WA.store.read('chapters.current', null); },
    /** before链：注入章节上下文 */
    buildChapterBlock() {
      const c = this.current();
      if (!c) return '';
      return '<chapter_context>\n【当前章节】' + c.title + (c.script ? '\n章节目标：' + c.script : '') + '\n</chapter_context>';
    }
  };

  WA.workflow.register({
    id: 'chapters.inject', chain: 'before', order: 15, label: '章节上下文注入',
    async run(ctx) {
      const block = WA.chapters.buildChapterBlock();
      if (block) ctx.injections.push({ source: '章节', position: 'after_last_user', depth: 2, content: block });
    }
  });
})();
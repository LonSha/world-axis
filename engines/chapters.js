/** WorldAxis engines/chapters.js (v0.2) — 章节叙事（缝合 st-beat-tracker） */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  WA.chapters = {
    start(title, opts) {
      opts = opts || {};
      WA.store.transact(d => {
        if (d.chapters.current) { // 自动结束旧章
          d.chapters.history.push(Object.assign({}, d.chapters.current, { endedAt: Date.now() }));
        }
        d.chapters.current = { no: (d.chapters.history.length + 1), title: title || ('第' + (d.chapters.history.length + 1) + '章'), script: opts.script || '', notes: opts.notes || '', startedAt: Date.now() };
        d.chapters.active = true;
      });
      WA.emit('chapters:changed');
    },
    end(note) {
      WA.store.transact(d => {
        if (!d.chapters.current) return false;
        d.chapters.current.endedAt = Date.now();
        d.chapters.current.endNote = note || '';
        d.chapters.history.push(d.chapters.current);
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
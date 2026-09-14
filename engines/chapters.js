/** WorldAxis engines/chapters.js — 章节叙事管理（缝合 st-beat-tracker）骨架 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  WA.chapters = {
    start(title, script) {
      WA.store.transact(draft => {
        const no = (draft.chapters.history.length + 1);
        if (draft.chapters.current) draft.chapters.history.push(draft.chapters.current);
        draft.chapters.current = { no, title: title || ('第' + no + '章'), script: script || '', notes: '', startedAt: Date.now() };
        draft.chapters.active = true;
      });
    },
    end() {
      WA.store.transact(draft => {
        if (draft.chapters.current) { draft.chapters.history.push(draft.chapters.current); draft.chapters.current = null; }
        draft.chapters.active = false;
      });
    },
    current() { return WA.store.read('chapters.current', null); }
  };
})();

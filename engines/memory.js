/** WorldAxis engines/memory.js — L0-L3分层记忆 + 长期事实 + 伏笔生命周期（缝合 世界背面 + World记忆引擎）骨架 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  WA.memory = {
    addFact(key, value, reason) {
      WA.store.transact(draft => {
        const old = draft.memory.facts.find(f => f.key === key && f.active);
        if (old) { old.active = false; old.reason = reason || '被新值替代'; }
        draft.memory.facts.push({ key, value, version: (old ? old.version + 1 : 1), active: true, at: Date.now() });
      });
    },
    addForeshadow(content, links) {
      WA.store.transact(draft => { draft.memory.foreshadows.push({ id: 'fs' + Date.now(), content, status: 'waiting', links: links || [], at: Date.now() }); });
    },
    setForeshadow(id, status) {
      WA.store.transact(draft => { const f = draft.memory.foreshadows.find(x => x.id === id); if (f) f.status = status; });
    }
  };
})();

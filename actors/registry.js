/**
 * WorldAxis actors/registry.js — NPC注册与档案（SoulLink JSON契约 + 世界背面认知边界）
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_npc_registry_v1';
  const mainWin = WA.mainWin || window;

  function loadAll() { try { return JSON.parse(mainWin.localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; } }
  function saveAll(m) { mainWin.localStorage.setItem(LS_KEY, JSON.stringify(m)); }
  function chatId() { try { const c = WA.mainWin.SillyTavern.getContext(); return c.chatId || 'default'; } catch (e) { return 'default'; } }

  WA.registry = {
    list() { const all = loadAll(); return all[chatId()] || []; },
    register(name) {
      if (!name) return false;
      const all = loadAll(); const cid = chatId();
      all[cid] = all[cid] || [];
      if (!all[cid].includes(name)) { all[cid].push(name); saveAll(all); WA.emit('registry:changed'); return true; }
      return false;
    },
    unregister(name) {
      const all = loadAll(); const cid = chatId();
      all[cid] = (all[cid] || []).filter(n => n !== name); saveAll(all); WA.emit('registry:changed');
    },
    /** 档案存取（SoulLink结构：fields + personality/worldview/family/relationships/memory分节） */
    getProfile(name) {
      const s = WA.store.get();
      const p = s.people['p_' + name];
      return (p && p.profile) || { fields: { name }, personality: [], worldview: [], family: [], relationships: [], memory: [] };
    },
    setProfile(name, profile) {
      WA.store.transact(draft => {
        const id = 'p_' + name;
        draft.people[id] = draft.people[id] || { id, name, knowledge: {} };
        draft.people[id].profile = profile;
        draft.people[id].updatedAt = Date.now();
      });
    }
  };
})();

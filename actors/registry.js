/**
 * WorldAxis actors/registry.js — NPC注册与档案（SoulLink JSON契约 + 世界背面认知边界）
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_npc_registry_v1';
  const mainWin = WA.mainWin || window;

  function loadAll() { try { return JSON.parse(mainWin.localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; } }
  const __REG = { key: LS_KEY, def: {}, module: 'registry' };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function saveAll(m) { WA.settingsBus.save(__REG, m); }
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
    },
    /**
     * v2.2.0: 安全档案写入（准入 + 按节合并 + 剪裁取自容量登记表）。
     *   缺陷背景：裸 setProfile 整份覆盖且无准入——误传 {personality:'字符串'} 会写坏结构，
     *   让 getProfile 的消费端（独白/观测的性格锚点）拿到非数组而静默降级。
     *   sections 各节接受：数组 | 换行分隔字符串 | 省略（该节不动）；
     *   relationships 条目：{target, relation, dynamic} 或 'target|relation|dynamic' 字符串。
     *   opts.replace === true → 整节替换（默认追加合并，去重同文本）。
     *   返回 {ok, name, reason?, added:{节:条数}, rejected:[...], total}
     */
    setProfileSafe(name, sections, opts) {
      const o = opts || {};
      if (typeof name !== 'string' || !name.trim()) return { ok: false, reason: 'missing-name' };
      const nm = name.trim();
      if (!sections || typeof sections !== 'object' || Array.isArray(sections)) return { ok: false, reason: 'not-object' };
      // 剪裁上限取自 store 容量登记表（单一真源）——写死常量会与登记值漂移，被 sizeAudit 判 drifted
      const capOf = function (sec) {
        try {
          const meta = WA.store && WA.store.capsFor ? WA.store.capsFor('people.p_x.profile.' + sec) : null;
          if (meta && typeof meta.cap === 'number' && meta.cap > 0) return meta.cap;
        } catch (e) {}
        return null;
      };
      const TEXT_SECS = ['personality', 'worldview', 'family', 'memory'];
      const out = { ok: true, name: nm, added: {}, rejected: [], total: 0 };
      const toTexts = function (v) {
        if (typeof v === 'string') return v.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        if (Array.isArray(v)) return v.map(function (x) { return typeof x === 'string' ? x.trim() : (x && x.text ? String(x.text).trim() : ''); }).filter(Boolean);
        return null;
      };
      const toRels = function (v) {
        if (typeof v === 'string') v = v.split('\n');
        if (!Array.isArray(v)) return null;
        const okRows = [];
        v.forEach(function (x) {
          let t = null, r = '', dy = '';
          if (x && typeof x === 'object') { t = x.target; r = x.relation || ''; dy = x.dynamic || ''; }
          else if (typeof x === 'string' && x.trim()) { const parts = x.split('|').map(function (y) { return y.trim(); }); t = parts[0]; r = parts[1] || ''; dy = parts[2] || ''; }
          if (!t) { out.rejected.push({ section: 'relationships', reason: 'missing-target' }); return; }
          okRows.push({ target: String(t).slice(0, 60), relation: String(r).slice(0, 60), dynamic: String(dy).slice(0, 160) });
        });
        return okRows;
      };
      const now = Date.now();
      let changed = false;
      const next = {
        fields: null,
        personality: null, worldview: null, family: null, memory: null, relationships: null
      };
      const old = this.getProfile(nm);
      TEXT_SECS.forEach(function (sec) {
        if (!(sec in sections)) return;
        const items = toTexts(sections[sec]);
        if (items === null) { out.rejected.push({ section: sec, reason: 'bad-shape' }); return; }
        const kept = items.filter(function (x) { return x.length > 0 && x.length <= 200; });
        if (kept.length !== items.length) out.rejected.push({ section: sec, reason: 'length-or-empty' });
        const base = (o.replace === true || !Array.isArray(old[sec])) ? [] : old[sec].map(function (x) { return x && x.text ? x : { text: String(x || ''), at: now }; });
        kept.forEach(function (t) {
          const dup = base.some(function (x) { return String(x.text) === t; });
          if (dup) return;
          base.push({ text: t, at: now });
        });
        const cap = capOf(sec) || 25;
        next[sec] = base.slice(-cap);
        out.added[sec] = Math.max(0, next[sec].length - (o.replace === true ? 0 : (old[sec] || []).length));
        changed = true;
      });
      if ('relationships' in sections) {
        const rels = toRels(sections.relationships);
        if (rels === null) out.rejected.push({ section: 'relationships', reason: 'bad-shape' });
        else {
          const base = (o.replace === true || !Array.isArray(old.relationships)) ? [] : old.relationships.slice();
          rels.forEach(function (rl) {
            const hit = base.filter(function (x) { return x && x.target === rl.target; })[0];
            if (hit) { hit.relation = rl.relation || hit.relation; hit.dynamic = rl.dynamic || hit.dynamic; hit.at = now; }
            else base.push({ target: rl.target, relation: rl.relation, dynamic: rl.dynamic, at: now });
          });
          const capR = capOf('relationships') || 15;
          next.relationships = base.slice(-capR);
          out.added.relationships = Math.max(0, next.relationships.length - (o.replace === true ? 0 : (old.relationships || []).length));
          changed = true;
        }
      }
      if (!changed) return { ok: false, reason: 'no-sections', rejected: out.rejected };
      const merged = {
        fields: Object.assign({ name: nm }, old.fields || {}),
        personality: next.personality || (old.personality || []),
        worldview: next.worldview || (old.worldview || []),
        family: next.family || (old.family || []),
        memory: next.memory || (old.memory || []),
        relationships: next.relationships || (old.relationships || [])
      };
      WA.store.transact(function (draft) {
        const id = 'p_' + nm;
        const p = draft.people[id] = draft.people[id] || { id: id, name: nm, knowledge: {} };
        p.profile = merged;
        p.updatedAt = now;
      });
      TEXT_SECS.concat(['relationships']).forEach(function (sec) { out.total += (merged[sec] || []).length; });
      WA.emit('registry:changed');
      return out;
    },
    /** v2.2.0: 清空某人档案（分节清空，保留人物条目本身） */
    clearProfile(name) {
      const nm = String(name || '').trim();
      if (!nm) return { ok: false, reason: 'missing-name' };
      const empty = { fields: { name: nm }, personality: [], worldview: [], family: [], relationships: [], memory: [] };
      return this.setProfileSafe(nm, empty, { replace: true }).ok ? { ok: true, name: nm } : { ok: false, reason: 'no-sections' };
    },
    /** v2.2.0: 档案覆盖率只读视图（巡视/诊断消费）——「有注册却零档案」此前完全不可见 */
    profileStat() {
      const names = this.list();
      const s = WA.store.get();
      const withProfile = [], detail = {};
      let entries = 0, sections = 0;
      names.forEach(function (n) {
        const p = (s.people || {})['p_' + n];
        const pr = p && p.profile;
        if (!pr) return;
        let cnt = 0;
        ['personality', 'worldview', 'family', 'memory', 'relationships'].forEach(function (k) {
          const a = pr[k];
          if (Array.isArray(a) && a.length) { sections++; cnt += a.length; }
        });
        entries += cnt;
        detail[n] = cnt;
        if (cnt > 0) withProfile.push(n);
      });
      return { registered: names.length, withProfile: withProfile.length, sections: sections, entries: entries, detail: detail };
    }
  };
})();

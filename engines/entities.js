/**
 * WorldAxis engines/entities.js (v0.8)
 * 实体记忆库：组织/物品/能力/地点 四类实体 + 别名索引
 * 缝合来源：DlSNlGHT World —— memory-engine-data.js entity_memory机制
 *
 * 机制：
 *  - 四类实体：organization(组织)/object(物品)/ability(能力)/location(地点)
 *  - 每个实体：{id, name, aliases[], desc, refs, updatedAt}
 *  - entity_index：`type:normalized(name或alias)` → id 的查找索引（自动重建）
 *  - upsert：按名字或别名命中即更新，否则新建
 *  - backstage推演结果中的 entities 字段入账：{"organization":[...],"object":[...],"ability":[...],"location":[...]}
 *  - 注入块：按类型分组列出实体名+别名（供推演参考既有实体，防止重复生成）
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const ENTITY_TYPES = ['organization', 'object', 'ability', 'location'];
  const TYPE_LABELS = { organization: '组织', object: '物品', ability: '能力', location: '地点' };
  const CAP_PER_TYPE = 30;

  const clean = v => String(v == null ? '' : v).trim();
  const normalized = v => clean(v).toLocaleLowerCase();
  const unique = values => Array.from(new Set((Array.isArray(values) ? values : [values]).map(clean).filter(Boolean)));

  function ensureState(draft) {
    if (!draft.evolution) draft.evolution = {};
    if (!draft.evolution.entityMemory || typeof draft.evolution.entityMemory !== 'object') {
      draft.evolution.entityMemory = { organization: [], object: [], ability: [], location: [] };
    }
    for (const t of ENTITY_TYPES) {
      if (!Array.isArray(draft.evolution.entityMemory[t])) draft.evolution.entityMemory[t] = [];
    }
    return draft.evolution.entityMemory;
  }

  function rebuildIndex(em) {
    const index = {};
    for (const type of ENTITY_TYPES) {
      for (const entity of (em[type] || [])) {
        if (!clean(entity && entity.id)) continue;
        for (const name of unique([entity.name, ...(entity.aliases || [])])) {
          index[`${type}:${normalized(name)}`] = entity.id;
        }
      }
    }
    em._index = index;
    return index;
  }

  function getIndex() {
    const st = WA.store.get();
    const em = st && st.evolution && st.evolution.entityMemory;
    if (!em) return {};
    if (!em._index) rebuildIndex(em);
    return em._index;
  }

  /**
   * 按名字/别名查找实体ID，未命中返回null
   */
  function findId(type, name) {
    return getIndex()[`${type}:${normalized(name)}`] || null;
  }

  /**
   * 新建或更新实体（按名字或任一别名命中）
   * @param {object} draft  transact draft
   * @param {string} type   ENTITY_TYPES之一
   * @param {object} data   {name, aliases?, desc?, refs?}
   * @returns {'created'|'updated'|'skipped'}
   */
  function upsert(draft, type, data) {
    if (!ENTITY_TYPES.includes(type)) return 'skipped';
    const name = clean(data && data.name);
    if (!name) return 'skipped';
    const em = ensureState(draft);
    const aliases = unique(data.aliases).filter(a => normalized(a) !== normalized(name)).slice(0, 6);

    let entity = null;
    const nameKey = `${type}:${normalized(name)}`;
    const idx = em._index || {};
    let id = idx[nameKey] || null;
    if (!id) {
      for (const alias of aliases) {
        id = idx[`${type}:${normalized(alias)}`] || null;
        if (id) break;
      }
    }
    if (id) entity = em[type].find(e => e.id === id);

    if (entity) {
      // 更新：合并别名、刷新描述，并合并来源引用（v0.8.0：修复 refs 生产方缺失）
      entity.aliases = unique([entity.name, ...(entity.aliases || []), ...aliases])
        .filter(a => normalized(a) !== normalized(entity.name)).slice(0, 6);
      if (data.desc) entity.desc = String(data.desc).slice(0, 150);
      if (WA.timeline && WA.timeline.unionRefs && Array.isArray(data.refs)) {
        entity.refs = WA.timeline.unionRefs([entity.refs || [], data.refs]);
      }
      entity.updatedAt = clockNow('entities');
      rebuildIndex(em);
      return 'updated';
    }
    // 新建
    const newId = WA.rand.id(type[0] + '_', 4, 'id');
    em[type].push({
      id: newId, name,
      aliases,
      desc: String((data && data.desc) || '').slice(0, 150),
      refs: (WA.timeline && WA.timeline.unionRefs && Array.isArray(data.refs)) ? WA.timeline.unionRefs([data.refs]) : [],
      updatedAt: clockNow('entities')
    });
    // 容量裁剪（保留最新的）
    // v2.13.0: 改走挤出侧单一出口。此前这里是**主路径**裸 slice——同一容器在
    //   applyEntityUpdates（backstage 入账）已接台账，而这条「直接建实体」的路径漏接，
    //   于是「长局里最早的实体被丢掉」这件事只在部分路径可见。同一容器只认一个站点。
    if (WA.evict) WA.evict.array(em[type], 'evolution.entityMemory');
    else if (em[type].length > CAP_PER_TYPE) em[type] = em[type].slice(-CAP_PER_TYPE);
    rebuildIndex(em);
    return 'created';
  }

  /**
   * backstage结果中的entities字段入账
   * @param {object} draft
   * @param {object} entities  {"organization":[{name,aliases,desc}...], ...}
   */
  function applyEntities(draft, entities) {
    if (!entities || typeof entities !== 'object') return;
    let created = 0, updated = 0;
    for (const type of ENTITY_TYPES) {
      const list = entities[type];
      if (!Array.isArray(list)) continue;
      for (const item of list.slice(0, 6)) {
        if (!item || !item.name) continue;
        const r = upsert(draft, type, item);
        if (r === 'created') created++;
        else if (r === 'updated') updated++;
      }
    }
    if (created + updated > 0) WA.log('info', `实体记忆入账: 新建${created} 更新${updated}`);
  }

  /**
   * 记忆提取结果的实体更新入账（区别于backstage的applyEntities）
   * 源码语义：description空=不覆盖本地描述；event累积进历史（同文本去重，每人上限8条）
   * 同一实体的多项事件复用同一实体条目，不因逐项返回而重复创建
   * @returns {number} 处理的更新条数
   */
  function applyEntityUpdates(draft, list) {
    if (!Array.isArray(list)) return 0;
    const em = ensureState(draft);
    const idx = em._index || rebuildIndex(em);
    const touched = new Map(); // type:normName → entity
    let count = 0;
    for (const raw of list.slice(0, 8)) {
      if (!raw || !ENTITY_TYPES.includes(raw.type)) continue;
      const name = clean(raw.name);
      if (!name) continue;
      const key = raw.type + ':' + normalized(name);
      let ent = touched.get(key) || null;
      if (!ent) {
        let id = idx[key] || null;
        if (!id) {
          for (const a of strArr(raw.aliases)) {
            id = idx[`${raw.type}:${normalized(a)}`] || null;
            if (id) break;
          }
        }
        if (id) ent = em[raw.type].find(e => e.id === id) || null;
      }
      if (ent) {
        // 合并别名
        ent.aliases = unique([ent.name, ...(ent.aliases || []), ...strArr(raw.aliases)])
          .filter(a => normalized(a) !== normalized(ent.name)).slice(0, 6);
        // 空description=不更新本地描述（源码语义）
        const desc = clean(raw.description);
        if (desc) ent.desc = desc.slice(0, 200);
      } else {
        ent = {
          id: WA.rand.id(raw.type[0] + '_', 4, 'id'),
          name, aliases: strArr(raw.aliases).filter(a => normalized(a) !== normalized(name)).slice(0, 6),
          desc: clean(raw.description).slice(0, 200),
          events: [], updatedAt: clockNow('entities')
        };
        em[raw.type].push(ent);
        // v2.13.0: 实体库挤出走单一出口（cap 与 __BOUNDED_CAPS 同源）
        if (WA.evict) WA.evict.array(em[raw.type], 'evolution.entityMemory');
        else if (em[raw.type].length > CAP_PER_TYPE) em[raw.type] = em[raw.type].slice(-CAP_PER_TYPE);
        rebuildIndex(em);
      }
      touched.set(key, ent);
      // event累积（去重，保留最新8条）
      const ev = clean(raw.event);
      if (ev) {
        ent.events = ent.events || [];
        if (!ent.events.some(x => normalized(x.e) === normalized(ev))) {
          ent.events.push({ e: ev.slice(0, 60), t: clean(raw.time).slice(0, 40), at: clockNow('entities') });
          if (WA.evict) WA.evict.array(ent.events, 'evolution.entityEvents');
          else if (ent.events.length > 8) ent.events.splice(0, ent.events.length - 8);
        }
      }
      ent.updatedAt = clockNow('entities');
      count++;
    }
    return count;
  }

  const strArr = v => (Array.isArray(v) ? v : (v == null || v === '' ? [] : [v])).map(x => String(x == null ? '' : x).trim()).filter(Boolean);

  /**
   * 注入块：按类型分组列出既有实体（防止推演重复造实体）
   */
  function buildEntitiesBlock() {
    const st = WA.store.get();
    const em = st && st.evolution && st.evolution.entityMemory;
    if (!em) return '';
    const lines = [];
    for (const type of ENTITY_TYPES) {
      const list = (em[type] || []).slice(-8);
      if (!list.length) continue;
      const items = list.map(e => {
        const aliasStr = (e.aliases || []).length ? `（${e.aliases.join('/')}）` : '';
        return e.name + aliasStr;
      }).join('、');
      lines.push(`【${TYPE_LABELS[type]}】${items}`);
    }
    if (!lines.length) return '';
    return '【既有实体库】推演必须复用以下实体，不得重复创建同义实体：\n' + lines.join('\n');
  }

  WA.entities = { ENTITY_TYPES, TYPE_LABELS, upsert, applyEntities, applyEntityUpdates, findId, buildEntitiesBlock, ensureState, rebuildIndex };
})();
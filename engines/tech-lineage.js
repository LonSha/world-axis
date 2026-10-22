/**
 * WorldAxis engines/tech-lineage.js (v2.231.0) — IN-5 活的技术谱系
 *
 * 核心职责：
 *   技术不仅是独立解锁项，而是活的实践生态与传承谱系。
 *   成果形成具名谱系：前驱方法、手稿文献、默会技艺与地方变体。
 *   三权分立：拿到手稿但未受训者不可直接熟练生产。
 *   师承与代际传承：师傅离开后受训出师学徒可续作，未完成者只能按已掌握范围做。
 *   无活跃实践者时标记为“暂时无人能做”，不删除文献手稿与历史记录。
 *   复兴无需复制逝者/离场者的私人记忆。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : (typeof v === 'string' ? v.slice(0, max || 60) : '');
  }

  function personId(name) {
    const n = clean(name, 60);
    return n ? (n.indexOf('p_') === 0 ? n : 'p_' + n) : '';
  }

  function state() {
    return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
  }

  function ensureLineageStore() {
    let s = state();
    if (!s.techLineage || typeof s.techLineage !== 'object') {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.techLineage = d.techLineage || { traditions: {} };
          return true;
        }, 'techLineage:init');
      }
      s = state();
    }
    return s.techLineage || { traditions: {} };
  }

  /**
   * 声明一项技术传统 / 谱系
   */
  function declareTradition(traditionId, def) {
    const id = clean(traditionId, 40);
    if (!id) return { ok: false, reason: 'missing-id' };

    const tStore = ensureLineageStore();
    const d = def || {};

    const tradition = {
      id: id,
      name: clean(d.name || id, 60),
      predecessor: clean(d.predecessor || '', 40),
      documents: Array.isArray(d.documents) ? d.documents.map(function (doc) { return clean(doc, 40); }) : [],
      requiredSkill: clean(d.requiredSkill || 'craft', 40),
      requiredMinStage: Number(d.requiredMinStage) || 1,
      variants: {},
      practitioners: {}, // personId -> { role: 'master'|'apprentice', stage: number, mentor: string }
      status: 'active' // 'active' | 'dormant'
    };

    if (d.variants && typeof d.variants === 'object') {
      Object.keys(d.variants).forEach(function (vKey) {
        const v = d.variants[vKey];
        tradition.variants[vKey] = {
          id: clean(vKey, 40),
          name: clean(v.name || vKey, 60),
          envRequirements: Object.assign({}, v.envRequirements || {}),
          tradeOff: {
            cost: Number(v.cost) || 1.0,
            durability: Number(v.durability) || 1.0,
            efficiency: Number(v.efficiency) || 1.0
          },
          confirmed: !!v.confirmed
        };
      });
    }

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (s) {
        s.techLineage = s.techLineage || { traditions: {} };
        s.techLineage.traditions[id] = tradition;
        return true;
      }, 'techLineage:declare');
    }

    return { ok: true, tradition: tradition };
  }

  function getTradition(traditionId) {
    const tStore = ensureLineageStore();
    return (tStore.traditions && tStore.traditions[clean(traditionId, 40)]) || null;
  }

  /**
   * 登记或传授技艺（师傅教学徒）
   */
  function teach(traditionId, masterName, apprenticeName) {
    const trad = getTradition(traditionId);
    if (!trad) return { ok: false, reason: 'tradition-not-found' };

    const mId = personId(masterName);
    const aId = personId(apprenticeName);

    // 师傅必须在场且具备独立熟练资格（或者系统初始指定的master）
    const mRecord = trad.practitioners[mId];
    if (!mRecord || mRecord.stage < trad.requiredMinStage) {
      return { ok: false, reason: 'unqualified-master', master: masterName };
    }

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (s) {
        const t = s.techLineage.traditions[trad.id];
        const prev = t.practitioners[aId] || { stage: 0 };
        t.practitioners[aId] = {
          role: (prev.stage + 1 >= t.requiredMinStage) ? 'master' : 'apprentice',
          stage: prev.stage + 1,
          mentor: mId,
          learnedAt: (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('techLineage') : Date.now()
        };
        t.status = 'active';
        return true;
      }, 'techLineage:teach');
    }

    const updated = getTradition(traditionId);
    return {
      ok: true,
      apprentice: aId,
      newStage: updated.practitioners[aId].stage,
      graduated: updated.practitioners[aId].stage >= trad.requiredMinStage
    };
  }

  /**
   * 注册一名独立大师（开创者或迁徙者）
   */
  function registerMaster(traditionId, whoName, stage) {
    const trad = getTradition(traditionId);
    if (!trad) return { ok: false, reason: 'tradition-not-found' };

    const wId = personId(whoName);
    const st = Math.max(Number(stage) || trad.requiredMinStage, trad.requiredMinStage);

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (s) {
        const t = s.techLineage.traditions[trad.id];
        t.practitioners[wId] = { role: 'master', stage: st, mentor: null };
        t.status = 'active';
        return true;
      }, 'techLineage:registerMaster');
    }

    return { ok: true, practitioner: wId };
  }

  /**
   * 实践者离场（迁徙、隐退、过世）
   */
  function departPractitioner(traditionId, whoName) {
    const trad = getTradition(traditionId);
    if (!trad) return { ok: false, reason: 'tradition-not-found' };

    const wId = personId(whoName);
    if (!trad.practitioners[wId]) return { ok: false, reason: 'not-a-practitioner' };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (s) {
        const t = s.techLineage.traditions[trad.id];
        delete t.practitioners[wId];

        // 检查是否还有能独立操作的熟手
        const activeMasters = Object.keys(t.practitioners).filter(function (pid) {
          return t.practitioners[pid].stage >= t.requiredMinStage;
        });

        if (activeMasters.length === 0) {
          t.status = 'dormant'; // 暂时无人能做，但文献依然保留
        }
        return true;
      }, 'techLineage:depart');
    }

    const updated = getTradition(traditionId);
    return { ok: true, departed: wId, traditionStatus: updated.status };
  }

  /**
   * 检查一个人是否能够独立按照某传统生产
   */
  function canProduce(traditionId, whoName, opts) {
    const trad = getTradition(traditionId);
    if (!trad) return { ok: false, reason: 'tradition-not-found', can: false };

    const wId = personId(whoName);
    const o = opts || {};

    // 1. 文献检查：如果有手稿，但个人未受训
    const hasDoc = o.hasDocument || (o.docId && trad.documents.indexOf(o.docId) >= 0);
    const pRecord = trad.practitioners[wId];

    if (!pRecord || pRecord.stage < trad.requiredMinStage) {
      if (hasDoc) {
        return {
          ok: true,
          can: false,
          reason: 'unskilled-reader',
          stage: pRecord ? pRecord.stage : 0,
          requiredStage: trad.requiredMinStage,
          note: '手握文献手稿，但缺乏实践训练与指导，无法直接熟练生产'
        };
      }
      return {
        ok: true,
        can: false,
        reason: 'no-knowledge-or-skill',
        note: '既无师承技能，亦无工艺文献'
      };
    }

    // 2. 检查地方变体兼容性
    if (o.variantId) {
      const v = trad.variants[o.variantId];
      if (!v) return { ok: false, reason: 'variant-not-found', can: false };
      if (!v.confirmed) {
        return { ok: true, can: false, reason: 'variant-unconfirmed', note: '该地方变体尚未通过试验确立' };
      }
    }

    return {
      ok: true,
      can: true,
      practitioner: wId,
      stage: pRecord.stage,
      role: pRecord.role
    };
  }

  /**
   * 在地方材料与环境下显式确认变体（带成本与耐用度取舍）
   */
  function confirmVariant(traditionId, variantId, envContext) {
    const trad = getTradition(traditionId);
    if (!trad) return { ok: false, reason: 'tradition-not-found' };

    const vId = clean(variantId, 40);
    const v = trad.variants[vId];
    if (!v) return { ok: false, reason: 'variant-not-found' };

    const env = envContext || {};
    // 检查环境必要条件
    const reqs = v.envRequirements || {};
    const missing = Object.keys(reqs).filter(function (k) { return !env[k]; });
    if (missing.length > 0) {
      return { ok: false, reason: 'unmet-env-conditions', missing: missing };
    }

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (s) {
        const t = s.techLineage.traditions[trad.id];
        t.variants[vId].confirmed = true;
        t.variants[vId].confirmedAt = (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('techLineage') : Date.now();
        return true;
      }, 'techLineage:confirmVariant');
    }

    return { ok: true, variantId: vId, tradeOff: v.tradeOff };
  }

  WA.techLineage = {
    declareTradition: declareTradition,
    getTradition: getTradition,
    teach: teach,
    registerMaster: registerMaster,
    departPractitioner: departPractitioner,
    canProduce: canProduce,
    confirmVariant: confirmVariant
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/tech-lineage 已加载（2.231.0）');
  }
})();
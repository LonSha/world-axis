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
          d.techLineage = d.techLineage || { traditions: {}, standards: {}, retrofits: {}, adapters: [] };
          return true;
        }, 'techLineage:init');
      }
      s = state();
    } else if (!s.techLineage.standards || !s.techLineage.retrofits || !s.techLineage.adapters) {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.techLineage = d.techLineage || {};
          d.techLineage.traditions = d.techLineage.traditions || {};
          d.techLineage.standards = d.techLineage.standards || {};
          d.techLineage.retrofits = d.techLineage.retrofits || {};
          d.techLineage.adapters = d.techLineage.adapters || [];
          return true;
        }, 'techLineage:ensureSubStores');
      }
      s = state();
    }
    return s.techLineage || { traditions: {}, standards: {}, retrofits: {}, adapters: [] };
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
          learnedAt: WA.clock.now('techLineage')
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
        t.variants[vId].confirmedAt = WA.clock.now('techLineage');
        return true;
      }, 'techLineage:confirmVariant');
    }

    return { ok: true, variantId: vId, tradeOff: v.tradeOff };
  }

  /**
   * 声明地方技术标准 / 机械规格（WX-5）
   */
  function declareStandard(specId, def) {
    const id = clean(specId, 40);
    if (!id) return { ok: false, reason: 'missing-id' };
    const d = def || {};
    const standard = {
      id: id,
      name: clean(d.name || id, 60),
      placeId: clean(d.placeId || '', 40),
      stationType: clean(d.stationType || 'workbench', 40),
      version: clean(d.version || '1.0', 20),
      specCode: clean(d.specCode || id, 40),
      compatibilities: {}, // targetSpecId -> { relation: 'direct'|'forward_compatible'|'requires_adapter'|'incompatible', adapterItemId: string, costFactor: number, extraDays: number }
      createdAt: WA.clock.now('techLineage')
    };
    if (d.compatibilities && typeof d.compatibilities === 'object') {
      Object.keys(d.compatibilities).forEach(function (k) {
        const c = d.compatibilities[k];
        standard.compatibilities[k] = {
          relation: clean(c.relation || 'incompatible', 30),
          adapterItemId: clean(c.adapterItemId || '', 40),
          costFactor: Number(c.costFactor) || 1.0,
          extraDays: Number(c.extraDays) || 0
        };
      });
    }
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (s) {
        s.techLineage = s.techLineage || {};
        s.techLineage.standards = s.techLineage.standards || {};
        s.techLineage.standards[id] = standard;
        return true;
      }, 'techLineage:declareStandard');
    }
    return { ok: true, standard: standard };
  }

  function getStandard(specId) {
    const tStore = ensureLineageStore();
    return (tStore.standards && tStore.standards[clean(specId, 40)]) || null;
  }

  function listStandards(opts) {
    const tStore = ensureLineageStore();
    const st = tStore.standards || {};
    const o = opts || {};
    let list = Object.keys(st).map(function (k) { return st[k]; });
    if (o.placeId) {
      list = list.filter(function (s) { return s.placeId === clean(o.placeId, 40); });
    }
    if (o.stationType) {
      list = list.filter(function (s) { return s.stationType === clean(o.stationType, 40); });
    }
    return { ok: true, count: list.length, standards: list };
  }

  /**
   * 检查工位规格与目标规格的兼容性关系
   */
  function checkCompatibility(facilitySpecId, targetSpecId, opts) {
    const fId = clean(facilitySpecId, 40);
    const tId = clean(targetSpecId, 40);
    if (!fId || !tId) return { ok: false, reason: 'missing-specs' };
    if (fId === tId) {
      return { ok: true, compatible: true, relation: 'direct', costFactor: 1.0, extraDays: 0 };
    }
    const std = getStandard(fId);
    if (!std || !std.compatibilities || !std.compatibilities[tId]) {
      return {
        ok: true,
        compatible: false,
        relation: 'incompatible',
        reason: 'no-declared-compatibility',
        note: '未声明兼容关系，依据严格物理规则判定为不可通用'
      };
    }
    const rel = std.compatibilities[tId];
    const isCompat = rel.relation === 'direct' || rel.relation === 'forward_compatible';
    const reqAdapter = rel.relation === 'requires_adapter';
    return {
      ok: true,
      compatible: isCompat || reqAdapter,
      relation: rel.relation,
      requiresAdapter: reqAdapter,
      adapterItemId: rel.adapterItemId || '',
      costFactor: rel.costFactor || 1.0,
      extraDays: rel.extraDays || 0
    };
  }

  /**
   * 投资规划工位改装（retrofit）
   */
  function planRetrofit(facilityId, targetSpecId, opts) {
    const fId = clean(facilityId, 40);
    const tId = clean(targetSpecId, 40);
    if (!fId || !tId) return { ok: false, reason: 'missing-fields' };
    const o = opts || {};
    const daysRequired = Math.max(1, Number(o.daysRequired) || 3);
    const fundsRequired = Math.max(0, Number(o.fundsRequired) || 20);
    const materials = (o.materials && typeof o.materials === 'object') ? Object.assign({}, o.materials) : { wood: 5, metal: 2 };

    const s = state();
    if (s.economy && s.economy.money && s.economy.money.funds != null) {
      if (s.economy.money.funds < fundsRequired) {
        return { ok: false, reason: 'insufficient-funds', available: s.economy.money.funds, required: fundsRequired };
      }
    }

    let retrofitRecord = {
      facilityId: fId,
      targetSpecId: tId,
      daysRequired: daysRequired,
      daysRemaining: daysRequired,
      fundsInvested: fundsRequired,
      materialsInvested: materials,
      status: 'in_progress',
      downTime: true,
      startedAt: WA.clock.now('techLineage'),
      plannedBy: clean(o.by || 'master', 40)
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (draft) {
        draft.techLineage = draft.techLineage || {};
        draft.techLineage.retrofits = draft.techLineage.retrofits || {};
        draft.techLineage.retrofits[fId] = retrofitRecord;
        if (draft.production && draft.production.facilities && draft.production.facilities[fId]) {
          draft.production.facilities[fId].status = 'retrofitting';
          draft.production.facilities[fId].activeOrderId = null;
        }
        if (draft.economy && draft.economy.money && typeof draft.economy.money.funds === 'number') {
          draft.economy.money.funds -= fundsRequired;
        }
        return true;
      }, 'techLineage:planRetrofit');
    }
    return { ok: true, retrofit: retrofitRecord };
  }

  /**
   * 推进工位改装进度
   */
  function advanceRetrofit(facilityId, days) {
    const fId = clean(facilityId, 40);
    const tStore = ensureLineageStore();
    const ret = tStore.retrofits && tStore.retrofits[fId];
    if (!ret) return { ok: false, reason: 'retrofit-not-found' };
    if (ret.status !== 'in_progress') return { ok: false, reason: 'not-in-progress', status: ret.status };
    const step = Math.max(1, Number(days) || 1);
    let completed = false;

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (draft) {
        const r = draft.techLineage.retrofits[fId];
        r.daysRemaining = Math.max(0, r.daysRemaining - step);
        if (r.daysRemaining === 0) {
          r.status = 'completed';
          r.downTime = false;
          r.completedAt = WA.clock.now('techLineage');
          completed = true;
          if (draft.production && draft.production.facilities && draft.production.facilities[fId]) {
            draft.production.facilities[fId].specId = r.targetSpecId;
            draft.production.facilities[fId].status = 'idle';
          }
        }
        return true;
      }, 'techLineage:advanceRetrofit');
    }
    const updated = ensureLineageStore().retrofits[fId];
    return { ok: true, completed: completed, daysRemaining: updated.daysRemaining, retrofit: updated };
  }

  /**
   * 取消或中断改装（沉没成本不返还）
   */
  function cancelRetrofit(facilityId) {
    const fId = clean(facilityId, 40);
    const tStore = ensureLineageStore();
    const ret = tStore.retrofits && tStore.retrofits[fId];
    if (!ret) return { ok: false, reason: 'retrofit-not-found' };
    if (ret.status !== 'in_progress') return { ok: false, reason: 'not-in-progress', status: ret.status };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (draft) {
        const r = draft.techLineage.retrofits[fId];
        r.status = 'cancelled';
        r.downTime = false;
        r.cancelledAt = WA.clock.now('techLineage');
        if (draft.production && draft.production.facilities && draft.production.facilities[fId]) {
          draft.production.facilities[fId].status = 'idle';
        }
        return true;
      }, 'techLineage:cancelRetrofit');
    }
    return { ok: true, facilityId: fId, status: 'cancelled', note: '改装已取消，沉没投资（资金/材料）不予返还' };
  }

  /**
   * 试制/加工规格适配件（路线2：adapter）
   */
  function produceAdapter(spec) {
    const s = spec || {};
    const adapterId = clean(s.adapterId || ('adp_' + WA.rand.id()), 40);
    const fromSpec = clean(s.fromSpec, 40);
    const toSpec = clean(s.toSpec, 40);
    if (!fromSpec || !toSpec) return { ok: false, reason: 'missing-specs' };
    const cost = Math.max(1, Number(s.cost) || 5);
    const entry = {
      id: adapterId,
      name: clean(s.name || (fromSpec + '_to_' + toSpec + '_adapter'), 60),
      fromSpec: fromSpec,
      toSpec: toSpec,
      cost: cost,
      durability: Number(s.durability) || 10,
      createdAt: WA.clock.now('techLineage')
    };
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (draft) {
        draft.techLineage = draft.techLineage || {};
        draft.techLineage.adapters = draft.techLineage.adapters || [];
        draft.techLineage.adapters.push(entry);
        return true;
      }, 'techLineage:produceAdapter');
    }
    return { ok: true, adapter: entry };
  }

  /**
   * 外包委托代工（路线4：outsource）
   */
  function outsourceWork(orderId, targetFacilityId, opts) {
    const oId = clean(orderId, 40);
    const fId = clean(targetFacilityId, 40);
    if (!oId || !fId) return { ok: false, reason: 'missing-fields' };
    const o = opts || {};
    const fee = Math.max(0, Number(o.fee) || 15);
    const extraTransitDays = Math.max(0, Number(o.extraTransitDays) || 2);

    const s = state();
    const order = s.production && s.production.orders && s.production.orders[oId];
    if (!order) return { ok: false, reason: 'order-not-found' };

    let record = {
      orderId: oId,
      targetFacilityId: fId,
      fee: fee,
      extraTransitDays: extraTransitDays,
      status: 'outsourced',
      assignedAt: WA.clock.now('techLineage')
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (draft) {
        if (draft.production && draft.production.orders && draft.production.orders[oId]) {
          draft.production.orders[oId].outsourced = true;
          draft.production.orders[oId].assignedFacility = fId;
          draft.production.orders[oId].daysRequired = (draft.production.orders[oId].daysRequired || 1) + extraTransitDays;
        }
        draft.techLineage = draft.techLineage || {};
        draft.techLineage.outsourced = draft.techLineage.outsourced || [];
        draft.techLineage.outsourced.push(record);
        return true;
      }, 'techLineage:outsourceWork');
    }
    return { ok: true, outsourced: record };
  }

  WA.techLineage = {
    declareTradition: declareTradition,
    getTradition: getTradition,
    teach: teach,
    registerMaster: registerMaster,
    departPractitioner: departPractitioner,
    canProduce: canProduce,
    confirmVariant: confirmVariant,
    declareStandard: declareStandard,
    getStandard: getStandard,
    listStandards: listStandards,
    checkCompatibility: checkCompatibility,
    planRetrofit: planRetrofit,
    advanceRetrofit: advanceRetrofit,
    cancelRetrofit: cancelRetrofit,
    produceAdapter: produceAdapter,
    outsourceWork: outsourceWork
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/tech-lineage 已加载（2.231.0）');
  }
})();
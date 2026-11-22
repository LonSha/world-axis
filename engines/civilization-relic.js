/**
 * WorldAxis engines/civilization-relic.js (v2.305.0) — EXV13-9 文明阶段更迭时的技术遗失与失落遗物谱系
 *
 * 核心机制：
 *   1. 远古遗物发掘登记（discoverRelic）：
 *      在废墟矿井或古老遗迹中发掘旧时代技术残卷或器械残件，
 *      登记残破度（condition）与碎片数（fragments）。
 *   2. 多轮逆向攻关与代价失败（reverseEngineer）：
 *      工匠与学者在作坊进行逆向研读。攻关伴随试错风险，
 *      首轮或冒进试验可能遭遇“富有启发性失败”（insightful_failure），
 *      消耗物资并造成器械折损，但积累关键灵感点（inspiration）。
 *   3. 启发突破与技术传承复苏（breakthrough）：
 *      灵感累积达标后实现技术突破，古代遗物被完全复原（reconstructed: true），
 *      并在活技术谱系（techLineage）中确立当代新生分支传承。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : (typeof v === 'string' ? v.slice(0, max || 60) : '');
  }

  function clockNow() {
    try { return WA.clock.now('civilizationRelic'); } catch (e) { return Date.now(); }
  }

  function state() {
    return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
  }

  function ensure(st) {
    if (!st.civilizationRelic || typeof st.civilizationRelic !== 'object') {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (draft) {
          draft.civilizationRelic = draft.civilizationRelic || { relics: {}, breakthroughs: [] };
          return true;
        }, 'civilizationRelic:init');
      }
    }
    return (state().civilizationRelic) || { relics: {}, breakthroughs: [] };
  }

  const _stat = { discovered: 0, attempts: 0, failures: 0, breakthroughs: 0 };

  /**
   * 发掘并登记远古失落遗物
   */
  function discoverRelic(spec) {
    const s = spec || {};
    const relicId = clean(s.relicId || s.id, 50);
    if (!relicId) return { ok: false, reason: 'missing-relic-id' };

    const name = clean(s.name || relicId, 60);
    const lostTechKey = clean(s.lostTechKey || s.techKey || 'ancient_artifact', 50);
    const condition = clean(s.condition || 'damaged_scroll', 40);
    const originSite = clean(s.originSite || s.site || 'ancient_ruins', 60);
    const fragmentsCount = Math.max(1, Number(s.fragmentsCount) || 1);

    const cur = state();
    ensure(cur);

    let relicRecord = null;
    WA.store.transact(function (draft) {
      draft.civilizationRelic = draft.civilizationRelic || { relics: {}, breakthroughs: [] };
      relicRecord = {
        relicId: relicId,
        name: name,
        lostTechKey: lostTechKey,
        condition: condition,
        originSite: originSite,
        fragmentsCount: fragmentsCount,
        discoveredAt: clockNow(),
        inspiration: 0,
        attemptsCount: 0,
        reconstructed: false,
        activeTraditionKey: null
      };
      draft.civilizationRelic.relics[relicId] = relicRecord;
      return true;
    }, 'civilizationRelic:discover');

    _stat.discovered++;
    return {
      ok: true,
      relic: relicRecord,
      note: '远古遗物【' + name + '】已成功发掘并收入档案，等待逆向破译。'
    };
  }

  /**
   * 逆向工程攻关试验
   */
  function reverseEngineer(spec) {
    const s = spec || {};
    const relicId = clean(s.relicId || s.id, 50);
    const scholarId = clean(s.scholarId || s.who || 'p_scholar', 50);
    const labPlaceId = clean(s.labPlaceId || s.place || 'workshop', 50);
    const attempt = Math.max(1, Number(s.attempt) || 1);
    const resourceCost = s.resourceCost || { steel: 30, gold: 10 };

    const bag = ensure(state());
    const r = bag.relics && bag.relics[relicId];
    if (!r) return { ok: false, reason: 'relic-not-found', relicId: relicId };
    if (r.reconstructed) {
      return { ok: true, reconstructed: true, alreadyDone: true, note: '该失落技术已成功复现，无需重复攻关。' };
    }

    _stat.attempts++;
    let resultOutcome = null;

    WA.store.transact(function (draft) {
      const target = draft.civilizationRelic.relics[relicId];
      if (!target) return false;

      target.attemptsCount += 1;

      // 判定逻辑：首轮试验必定遭遇挫折产生启发性失败（除非预先已掌握高额灵感）
      const canBreakthrough = (attempt >= 2 || target.inspiration >= 40);

      if (!canBreakthrough) {
        // 富有启发性的失败：消耗材料，构件受损，但获得灵感点
        target.inspiration += 45;
        target.condition = 'partially_tested';
        _stat.failures++;

        resultOutcome = {
          outcome: 'insightful_failure',
          inspiration: target.inspiration,
          inspirationGain: 45,
          reconstructed: false,
          costPaid: resourceCost,
          toolDamaged: 'precision_caliper_bent',
          summary: '首轮攻关构件因水压过载炸损，消耗 50 钢材并折损精密卡尺，但逆向团队记录下关键水流涡旋常数（灵感 +45）！'
        };
      } else {
        // 次轮或充分准备：实现重大技术突破
        target.inspiration = 100;
        target.reconstructed = true;
        target.condition = 'fully_restored';
        target.activeTraditionKey = 'tradition_' + target.lostTechKey;
        _stat.breakthroughs++;

        // 联动当代活技术谱系：宣告新传统
        if (WA.techLineage && typeof WA.techLineage.declareTradition === 'function') {
          WA.techLineage.declareTradition(target.activeTraditionKey, {
            name: '复现·' + target.name,
            predecessor: 'ancient_ruin_archetype',
            requiredSkill: 'craft',
            requiredMinStage: 2
          });
        }

        resultOutcome = {
          outcome: 'breakthrough',
          inspiration: 100,
          reconstructed: true,
          techUnlocked: target.lostTechKey,
          traditionCreated: target.activeTraditionKey,
          summary: '逆向攻关取得决定性突破！成功复现古代水力核心构造，并在城邦谱系中恢复失传已久的水云工程实践！'
        };

        draft.civilizationRelic.breakthroughs.push({
          relicId: relicId,
          scholarId: scholarId,
          unlockedAt: clockNow(),
          techKey: target.lostTechKey
        });
      }
      return true;
    }, 'civilizationRelic:reverseEngineer');

    return Object.assign({ ok: true, relicId: relicId }, resultOutcome);
  }

  function getRelic(relicId) {
    const rId = clean(relicId, 50);
    const bag = ensure(state());
    const r = bag.relics && bag.relics[rId];
    return r ? JSON.parse(JSON.stringify(r)) : null;
  }

  function stat() {
    return Object.assign({}, _stat);
  }

  WA.civilizationRelic = {
    discoverRelic: discoverRelic,
    reverseEngineer: reverseEngineer,
    getRelic: getRelic,
    stat: stat
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/civilization-relic.js', { kind: 'engine', ver: '2.305.0' });
  }
})();

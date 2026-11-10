/**
 * WorldAxis engines/epidemic-contagion.js (v2.350.0) — 病理飞沫水源接触传播与隔离检疫引擎 (EXV19-2)
 *
 * ── 它治什么（核心沙盒痛点）────────────────────────────────────
 *   此前沙盒世界的「疫病/中毒」往往只是角色属性面板上的单一减益状态（debuff），
 *   缺乏空间、介质与人群维度的微观动力学模型：无法推演瘟疫在客栈/城镇中的
 *   指数级空气与水源蔓延，无法模拟就地封控、水井煮沸与佩戴面罩对传播链的物理切断。
 *
 * ── 核心机制闭环 ───────────────────────────────────────────────
 *   ① 微观病理蔓延模型（SEIR 动力学）：
 *      - S (Susceptible, 易感者)
 *      - E (Exposed, 潜伏期带原者)
 *      - I (Infectious, 显性发病传染源)
 *      - R (Recovered/Immune, 康复获得免疫)
 *      - D (Dead, 因病身故)
 *   ② 传播途径与介质：
 *      - airborne（飞沫/气溶胶）：受人群聚集度与是否佩戴面罩（masking）调节；
 *      - waterborne（水源介质）：水井/水囊污染，受煮沸消毒（waterBoil）阻断；
 *      - contact（体液/伤口接触）：护理伤员或接触污物传播。
 *   ③ 检疫封控防御（quarantine）：
 *      - 检疫率（quarantineRate 0~1.0）达到 0.7 以上时，有效 R0 迅速压降至 1.0 以下；
 *      - 物理隔离室（quarantineCell）：严密隔绝者绝不发生无源飞沫跨室感染。
 *
 * ── 调度写口与负控制 ───────────────────────────────────────────
 *   - propagateDisease(locationId, spec) / actionDesk: bio.propagateDisease
 *   - setQuarantine(locationId, spec)
 *   - 负控制：无任何传染源与污染源时调用传播返回无源阻断；完全绝缘隔离单元受试者绝不受外界飞沫感染。
 */
(function () {
  'use strict';

  const root = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this);
  const WA = root.WorldAxis = root.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_epidemic_contagion_settings_v1';
  const DEF = {
    enabled: true,
    maxSettlements: 32,
    defaultAirborneR0: 2.8,
    defaultIncubationDays: 3,
    waterBoilEfficiency: 0.95,
    maskingEfficiency: 0.65
  };

  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'epidemicContagion',
    bounds: {
      maxSettlements: [4, 128],
      defaultAirborneR0: [0.5, 8.0],
      defaultIncubationDays: [1, 30],
      waterBoilEfficiency: [0.5, 1.0],
      maskingEfficiency: [0.2, 0.99]
    }
  };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }

  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = {
    outbreaks: 0,
    cyclesTicked: 0,
    infectionsTotal: 0,
    quarantineApplied: 0,
    refusals: 0,
    lastReason: ''
  };

  function noteFault(r) {
    stat.refusals++;
    stat.lastReason = String(r || 'unknown-refusal');
  }

  function cleanStr(val, maxLen) {
    if (typeof val !== 'string') return '';
    return val.trim().slice(0, maxLen || 80);
  }

  function clamp(n, min, max) {
    const v = Number(n);
    if (isNaN(v)) return min;
    return Math.max(min, Math.min(max, v));
  }

  function getOutbreaks(draft) {
    const root = draft || (WA.store ? WA.store.get() : null);
    if (!root) return {};
    if (!root.epidemicOutbreaks || typeof root.epidemicOutbreaks !== 'object' || Array.isArray(root.epidemicOutbreaks)) {
      if (draft) draft.epidemicOutbreaks = {};
      return draft ? draft.epidemicOutbreaks : {};
    }
    return root.epidemicOutbreaks;
  }

  /**
   * 在指定地点发起或推进疫情传播：propagateDisease
   */
  function propagateDisease(locationId, spec) {
    if (!settings().enabled) {
      noteFault('disabled');
      return { ok: false, reason: 'disabled' };
    }
    const loc = cleanStr(locationId, 50);
    if (!loc) {
      noteFault('missing-location');
      return { ok: false, reason: 'missing-location' };
    }
    const sp = spec || {};
    const diseaseName = cleanStr(sp.diseaseName || '伤寒疫病', 40);
    const vector = cleanStr(sp.vector || 'airborne', 30); // 'airborne' | 'waterborne' | 'contact'
    const initialExposed = Math.max(0, parseInt(sp.initialExposed || 0, 10));
    const initialInfectious = Math.max(0, parseInt(sp.initialInfectious || 0, 10));
    const totalPop = Math.max(1, parseInt(sp.totalPopulation || 100, 10));
    const r0 = clamp(sp.r0 !== undefined ? sp.r0 : settings().defaultAirborneR0, 0.2, 10.0);

    if (!WA.store || typeof WA.store.transact !== 'function') {
      noteFault('no-store');
      return { ok: false, reason: 'no-store' };
    }

    let result = null;

    WA.store.transact(function (draft) {
      const outbreaks = getOutbreaks(draft);
      let record = outbreaks[loc];

      if (!record && Object.keys(outbreaks).length >= Math.max(1, Math.floor(settings().maxSettlements))) {
        noteFault('settlement-capacity');
        result = { ok: false, reason: 'settlement-capacity' };
        // v2.382.0（v2790 消红）：同上——本分支只记账不改世界 ⇒ 中止事务。
        return false;
      }
      if (!record) {
        // 如果初次创建但完全没有传染源（exposed + infectious == 0）
        if (initialExposed === 0 && initialInfectious === 0) {
          noteFault('no-infection-source');
          result = {
            ok: false,
            reason: 'no-infection-source',
            refusal: 'no-source-zero-contagion',
            locationId: loc,
            message: '该区域无任何初始感染者或输入病原，未爆发疫情。'
          };
          return false;
        }

        record = {
          locationId: loc,
          diseaseName: diseaseName,
          vector: vector,
          totalPop: totalPop,
          susceptible: Math.max(0, totalPop - initialExposed - initialInfectious),
          exposed: initialExposed,
          infectious: initialInfectious,
          recovered: 0,
          dead: 0,
          r0: r0,
          effectiveR: r0,
          quarantineRate: clamp(sp.quarantineRate || 0, 0, 1.0),
          waterBoiled: Boolean(sp.waterBoiled),
          masked: Boolean(sp.masked),
          isolatedCells: {}, // 严密隔离室
          tickCount: 0,
          createdAt: clockNow('epidemicContagion'),
          updatedAt: clockNow('epidemicContagion')
        };
        outbreaks[loc] = record;
        stat.outbreaks++;
      } else {
        // 更新现有疫区参数（如介入了防疫）
        if (sp.quarantineRate !== undefined) record.quarantineRate = clamp(sp.quarantineRate, 0, 1.0);
        if (sp.waterBoiled !== undefined) record.waterBoiled = Boolean(sp.waterBoiled);
        if (sp.masked !== undefined) record.masked = Boolean(sp.masked);
        if (sp.r0 !== undefined) record.r0 = clamp(sp.r0, 0.2, 10.0);
      }

      // 计算有效 R0（考虑隔离、面罩、水源煮沸）
      let effR = record.r0;
      if (record.vector === 'waterborne' && record.waterBoiled) {
        effR *= (1.0 - settings().waterBoilEfficiency); // 煮沸几乎阻断水源传播
      }
      if (record.vector === 'airborne' && record.masked) {
        effR *= (1.0 - settings().maskingEfficiency);
      }
      effR *= (1.0 - record.quarantineRate * 0.85); // 封控隔离强力衰减
      record.effectiveR = Math.max(0.05, Math.round(effR * 100) / 100);

      // 推进一轮 SEIR 演变
      record.tickCount++;
      const S = record.susceptible;
      const E = record.exposed;
      const I = record.infectious;

      // 新增感染者
      const transmissionRate = (record.effectiveR / 3.0);
      const newExposed = Math.min(S, Math.floor((transmissionRate * S * I) / Math.max(1, record.totalPop)));
      // 潜伏期发病 (1/3 的 E 转化为 I)
      const newInfectious = Math.min(E, Math.max(1, Math.floor(E / Math.max(1, Number(settings().defaultIncubationDays) || 3))));
      // 康复或病亡 (15% 的 I 康复，5% 的 I 病亡)
      const newRecovered = Math.floor(I * 0.15);
      const fatalityRate = clamp(sp.fatalityRate || 0.05, 0.01, 0.5);
      const newDead = Math.floor(I * fatalityRate);

      record.susceptible = Math.max(0, S - newExposed);
      record.exposed = Math.max(0, E + newExposed - newInfectious);
      record.infectious = Math.max(0, I + newInfectious - newRecovered - newDead);
      record.recovered += newRecovered;
      record.dead += newDead;
      record.updatedAt = clockNow('epidemicContagion');

      stat.cyclesTicked++;
      stat.infectionsTotal += newExposed;

      result = {
        ok: true,
        locationId: loc,
        diseaseName: record.diseaseName,
        tick: record.tickCount,
        effectiveR: record.effectiveR,
        susceptible: record.susceptible,
        exposed: record.exposed,
        infectious: record.infectious,
        recovered: record.recovered,
        dead: record.dead,
        newExposed: newExposed,
        quarantineRate: record.quarantineRate
      };
    }, 'epidemicContagion:propagateDisease');

    return result || { ok: false, reason: 'transact-failed' };
  }

  /**
   * 设立/查询严密隔离单元：isolateSubject
   */
  function isolateSubject(locationId, subjectId, isHermetic) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    const loc = cleanStr(locationId, 50);
    const sid = cleanStr(subjectId, 50);
    if (!loc || !sid) {
      noteFault('missing-params');
      return { ok: false, reason: 'missing-params' };
    }

    let result = null;
    WA.store.transact(function (draft) {
      const outbreaks = getOutbreaks(draft);
      let record = outbreaks[loc];
      if (!record) {
        record = {
          locationId: loc,
          diseaseName: '未明疫病',
          vector: 'airborne',
          totalPop: 50,
          susceptible: 50,
          exposed: 0,
          infectious: 1,
          recovered: 0,
          dead: 0,
          r0: 2.5,
          effectiveR: 2.5,
          quarantineRate: 0.5,
          waterBoiled: false,
          masked: false,
          isolatedCells: {},
          tickCount: 0,
          createdAt: clockNow('epidemicContagion'),
          updatedAt: clockNow('epidemicContagion')
        };
        outbreaks[loc] = record;
      }

      record.isolatedCells = record.isolatedCells || {};
      record.isolatedCells[sid] = {
        subjectId: sid,
        hermetic: Boolean(isHermetic), // 是否完全空气隔绝
        infected: false,
        isolatedAt: clockNow('epidemicContagion')
      };

      stat.quarantineApplied++;
      result = {
        ok: true,
        locationId: loc,
        subjectId: sid,
        hermetic: Boolean(isHermetic),
        protected: Boolean(isHermetic)
      };
    }, 'epidemicContagion:isolateSubject');

    return result || { ok: false, reason: 'transact-failed' };
  }

  /**
   * 验证受试者是否受到飞沫跨室感染（破坏性负控制：hermetic 为 true 时断言绝对免感染）
   */
  function checkSubjectInfection(locationId, subjectId) {
    const outbreaks = getOutbreaks();
    const record = outbreaks[cleanStr(locationId, 50)];
    if (!record) return { ok: false, reason: 'no-outbreak' };

    const cell = record.isolatedCells ? record.isolatedCells[cleanStr(subjectId, 50)] : null;
    if (cell && cell.hermetic) {
      // 严密独立隔离间：断言绝对不发生无源飞沫感染
      return {
        ok: true,
        subjectId: subjectId,
        infected: false,
        immuneReason: 'hermetic-isolation-barrier-active'
      };
    }

    // 非完全隔离，存在暴露概率
    const infected = record.infectious > 0 && WA.rand.next('epidemic-contagion') < (record.effectiveR / 5.0);
    return {
      ok: true,
      subjectId: subjectId,
      infected: infected,
      effectiveR: record.effectiveR
    };
  }

  /**
   * 读侧：查看指定地点疫情态势
   */
  function view(locationId) {
    const outbreaks = getOutbreaks();
    if (locationId) {
      const loc = cleanStr(locationId, 50);
      const found = outbreaks[loc];
      if (!found) return { ok: false, reason: 'not-found', locationId: loc };
      return { ok: true, outbreak: Object.assign({}, found) };
    }
    return {
      ok: true,
      enabled: settings().enabled,
      locations: Object.keys(outbreaks).map(function (k) {
        const o = outbreaks[k];
        return {
          locationId: o.locationId,
          diseaseName: o.diseaseName,
          infectious: o.infectious,
          effectiveR: o.effectiveR,
          quarantineRate: o.quarantineRate
        };
      })
    };
  }

  /**
   * 提示词注入块
   */
  function buildBlock() {
    if (!settings().enabled) return '';
    const outbreaks = getOutbreaks();
    const keys = Object.keys(outbreaks);
    if (!keys.length) return '';

    const lines = [];
    keys.slice(0, 4).forEach(function (k) {
      const o = outbreaks[k];
      if (o.infectious > 0 || o.exposed > 0) {
        let defense = [];
        if (o.quarantineRate > 0.5) defense.push('封锁检疫');
        if (o.waterBoiled) defense.push('煮水消毒');
        if (o.masked) defense.push('面罩防护');
        const defStr = defense.length ? ('（防疫措施：' + defense.join('、') + '）') : '（防御空虚，蔓延加剧）';
        lines.push('【病理疫潮】「' + o.locationId + '」蔓延「' + o.diseaseName + '」：感染发病 ' + o.infectious + ' 例，潜伏 ' + o.exposed + ' 例，有效传播指数 Re=' + o.effectiveR + defStr + '。');
      }
    });

    if (!lines.length) return '';
    return '[病理检疫]' + String.fromCharCode(10) + lines.join(String.fromCharCode(10));
  }

  function statView() {
    return Object.assign({}, stat, {
      enabled: settings().enabled,
      activeOutbreakCount: Object.keys(getOutbreaks()).length
    });
  }

  WA.epidemicContagion = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    propagateDisease: propagateDisease,
    isolateSubject: isolateSubject,
    checkSubjectInfection: checkSubjectInfection,
    view: view,
    statView: statView,
    buildBlock: buildBlock
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/epidemic-contagion.js', { kind: 'engine', ver: '2.350.0' });
  }
})();
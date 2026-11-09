/**
 * WorldAxis engines/ideology-memetics.js (v2.340.0)
 * EXV17-4: 意识形态模因共振与信仰狂热引擎
 *
 * 核心机制：
 * 1. 模拟思想、教条、邪说或文明信念在人群中的传播动力学；
 * 2. 模因（Meme）具备感染力（infectivity）、狂热排他性（fanaticism）、变异率（mutationRate）；
 * 3. 宿主区域具备智识启蒙度（enlightenmentLevel）与安居乐业度（contentmentLevel），构成天然理智免疫屏障；
 * 4. 负控制拦截：在民智启蒙极高（>= 80）或安居乐业的富庶区域，低劣煽动模因将被“理性免疫（rational-immunity）”直接阻断；
 * 5. 当群体狂热度（fanaticism）突破临界（>= 80），自发进入“狂热审判风暴（fanatic-frenzy）”或狂暴洗礼态。
 */

(function () {
  'use strict';

  const VERSION = '2.340.0';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  WA.engines = WA.engines || {};

  // 模因库 memeKey -> MemeDef
  const _memeCatalog = new Map();
  // 区域信仰分布 regionId -> Map(memeKey -> { adherents, fanaticism, infectionStage })
  const _regionalBeliefs = new Map();
  // 区域文明启蒙与安宁参数 regionId -> { enlightenment, contentment }
  const _regionalSociology = new Map();

  function setRegionalSociology(regionId, options) {
    const opts = options || {};
    const current = _regionalSociology.get(regionId) || {
      enlightenment: 50.0,
      contentment: 50.0
    };
    if (typeof opts.enlightenment === 'number') current.enlightenment = Math.max(0, Math.min(100, opts.enlightenment));
    if (typeof opts.contentment === 'number') current.contentment = Math.max(0, Math.min(100, opts.contentment));
    _regionalSociology.set(regionId, current);
    return { ok: true, regionId: regionId, sociology: current };
  }

  function getRegionalSociology(regionId) {
    return _regionalSociology.get(regionId) || { enlightenment: 50.0, contentment: 50.0 };
  }

  function registerMeme(memeKey, dogmaDef) {
    if (!memeKey) return { ok: false, error: 'memeKey-required' };
    const def = {
      memeKey: memeKey,
      dogmaName: dogmaDef.dogmaName || memeKey,
      doctrineCore: dogmaDef.doctrineCore || '未名思想',
      baseInfectivity: typeof dogmaDef.baseInfectivity === 'number' ? dogmaDef.baseInfectivity : 0.6,
      fanaticismPotency: typeof dogmaDef.fanaticismPotency === 'number' ? dogmaDef.fanaticismPotency : 50.0,
      radicalism: dogmaDef.radicalism || 'moderate', // 'peaceful' | 'moderate' | 'extremist'
      createdAtTick: clockNow('ideology-memetics')
    };
    _memeCatalog.set(memeKey, def);
    return { ok: true, meme: def };
  }

  function broadcastMeme(options) {
    const opts = options || {};
    const memeKey = opts.memeKey;
    if (!memeKey || typeof memeKey !== 'string') {
      return { ok: false, error: 'memeKey-required' };
    }
    const regionId = opts.regionId || 'central_square';
    const broadcastIntensity = typeof opts.intensity === 'number' ? opts.intensity : 60.0;

    let meme = _memeCatalog.get(memeKey);
    if (!meme) {
      // 动态隐式登记
      registerMeme(memeKey, {
        dogmaName: opts.dogmaName || memeKey,
        doctrineCore: opts.dogmaContent || '即席宣讲的意识形态教义',
        baseInfectivity: (broadcastIntensity / 100) * 0.8,
        fanaticismPotency: broadcastIntensity
      });
      meme = _memeCatalog.get(memeKey);
    }

    const soc = getRegionalSociology(regionId);

    // 负控制拦截：在一个民智启蒙度极高（>= 80）或安居乐业（contentment >= 85）的节点，
    // 低俗或狂热模因断言被理性免疫自然阻断。
    if (soc.enlightenment >= 80.0 && broadcastIntensity < 90.0) {
      return {
        ok: false,
        blocked: true,
        reason: 'rational-immunity-enlightened',
        details: `区域 [${regionId}] 智识启蒙度达 ${soc.enlightenment}%，人群具有强大理性免疫力，低劣意识形态无法扎根。`
      };
    }
    if (soc.contentment >= 85.0 && broadcastIntensity < 85.0) {
      return {
        ok: false,
        blocked: true,
        reason: 'rational-immunity-contentment',
        details: `区域 [${regionId}] 民众富庶安定（安宁度 ${soc.contentment}%），对末日狂热煽动完全免疫。`
      };
    }

    // 成功感染与渗透
    let regMap = _regionalBeliefs.get(regionId);
    if (!regMap) {
      regMap = new Map();
      _regionalBeliefs.set(regionId, regMap);
    }

    const currentBelief = regMap.get(memeKey) || {
      adherents: 0,
      fanaticism: 10.0,
      infectionStage: 'latent'
    };

    const newAdherents = Math.floor(broadcastIntensity * 2.5);
    currentBelief.adherents += newAdherents;
    currentBelief.fanaticism = Math.min(100.0, currentBelief.fanaticism + (broadcastIntensity * 0.85));

    if (currentBelief.fanaticism >= 80.0) {
      currentBelief.infectionStage = 'fanatic-frenzy'; // 狂热审判猎巫态
    } else if (currentBelief.fanaticism >= 50.0) {
      currentBelief.infectionStage = 'zealous'; // 狂信徒
    } else {
      currentBelief.infectionStage = 'proselytizing'; // 传道扩张
    }

    regMap.set(memeKey, currentBelief);

    return {
      ok: true,
      broadcastSuccess: true,
      regionId: regionId,
      memeKey: memeKey,
      adherentsGained: newAdherents,
      totalAdherents: currentBelief.adherents,
      fanaticism: currentBelief.fanaticism,
      infectionStage: currentBelief.infectionStage,
      isFrenzy: currentBelief.infectionStage === 'fanatic-frenzy'
    };
  }

  function getRegionalMemeStatus(regionId, memeKey) {
    const regMap = _regionalBeliefs.get(regionId);
    if (!regMap || !regMap.has(memeKey)) {
      return { ok: false, error: 'meme-not-found-in-region' };
    }
    return { ok: true, status: regMap.get(memeKey) };
  }

  function resetAll() {
    _memeCatalog.clear();
    _regionalBeliefs.clear();
    _regionalSociology.clear();
    return { ok: true, cleared: true };
  }

  function diagnose() {
    return {
      version: VERSION,
      totalMemes: _memeCatalog.size,
      activeRegions: _regionalBeliefs.size
    };
  }

  const api = {
    VERSION: VERSION,
    setRegionalSociology: setRegionalSociology,
    getRegionalSociology: getRegionalSociology,
    registerMeme: registerMeme,
    broadcastMeme: broadcastMeme,
    getRegionalMemeStatus: getRegionalMemeStatus,
    resetAll: resetAll,
    diagnose: diagnose
  };

  WA.engines.ideologyMemetics = api;
  WA.ideologyMemetics = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();

/**
 * WorldAxis engines/engineering-blueprint.js (v2.380.0)
 * EXV21-5: 文明发明工坊、工程器械与技术图纸跃迁引擎 (Engineering Blueprint, Siege Workshop & Tech Leakage Engine)
 *
 * ── 核心架构哲学（Genre-Neutral Architecture）─────────────────────────
 * 无论是古代回回炮/巨型冲车、蒸汽朋克飞艇/重型风钻、修仙神舟傀儡还是科幻轨道加农炮/聚能光束，统一抽象为工程器械模型：
 *  1. 图纸理论成熟度与试错研发（Blueprint Theory & Research）：
 *     - 图纸类型（blueprintKind）: 'trebuchet' (投石机/抛射重炮), 'battering_ram' (攻城撞槌/破甲钻), 'glider' (滑翔翼/空降空舟), 'barrier_beacon' (防御结界信标/能量护盾);
 *     - 理论成熟度（theoryMaturity, 0~100）、原型制作耗材成本（iron/wood/crystal/fuel）；
 *     - 研发灾难性事故（hazardRisk）：高危险研发失控引发工坊大爆炸（hazardBurst）、火灾或毒性粉尘外溢。
 *  2. 器械组装与破坏攻坚（Assembly & Siege Demolition）：
 *     - assembleSiegeDevice: 消耗关键材料组装设备，赋予耐久度（durability）与攻坚破防值（breachPower）；
 *     - fireSiegeEngine: 向目标要塞/城墙马面发射，根据射程与弹药结算城防损伤；
 *     - 技术扩散与间谍窃密（blueprintLeakage）：图纸落入敌手导致敌对阵营急速反向仿制。
 *  3. 破坏性负控制与状态持久化：
 *     - 关键材料（iron/wood/powerSource）归零时强行组装重型器械，严格驳回（refusal: 'materials-depleted'）；
 *     - 器械耐久归零或弹药耗尽调用发射驳回（refusal: 'device-broken-or-empty'）；
 *     - 工坊状态落入 store.engineeringWorkshop 台账。
 */
'use strict';

(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  WA.engines = WA.engines || {};

  const VERSION = '2.380.0';
  const LS_KEY = 'worldaxis_engineering_blueprint_settings_v1';

  const DEF = {
    enabled: true,
    maxWorkshops: 20,
    baseExplosionRisk: 15,
    durabilityWearPerShot: 20
  };

  let stat = {
    devicesEngineered: 0,
    siegeFired: 0,
    researchAccidents: 0,
    blueprintsLeaked: 0,
    refusals: 0,
    lastReason: ''
  };

  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'engineeringBlueprint'
  };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return Object.assign({}, DEF, raw || {});
  }

  function saveSettings(next) {
    if (WA.settingsBus && typeof WA.settingsBus.saveOrThrow === 'function') {
      return WA.settingsBus.saveOrThrow(__REG, Object.assign({}, DEF, next || {}));
    }
    return Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function cleanStr(s, max) { return String(s || '').trim().slice(0, max || 80); }
  function clamp(v, min, max) { const n = Number(v); if (isNaN(n)) return min; return Math.max(min, Math.min(max, n)); }
  function clockNow(site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } }
  function noteFault(r) { stat.refusals++; stat.lastReason = String(r || 'unknown'); }

  function getStore(draft) {
    const target = draft || (WA.store ? WA.store.get() : null);
    if (!target) return null;
    if (!target.engineeringWorkshop || typeof target.engineeringWorkshop !== 'object') {
      if (draft) target.engineeringWorkshop = { workshops: {}, inventory: {}, log: [] };
      return draft ? target.engineeringWorkshop : null;
    }
    return target.engineeringWorkshop;
  }

  function registerWorkshop(workshopId, spec) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    const wid = cleanStr(workshopId, 40);
    if (!wid) {
      noteFault('invalid-workshop-id');
      return { ok: false, refusal: 'invalid-workshop-id' };
    }

    const p = spec || {};
    const record = {
      workshopId: wid,
      name: cleanStr(p.name || wid, 60),
      factionId: cleanStr(p.factionId || 'neutral', 40),
      leadArtisan: cleanStr(p.leadArtisan || 'Chief Engineer', 60),
      resources: {
        iron: Math.max(0, parseInt(p.iron, 10) || 100),
        wood: Math.max(0, parseInt(p.wood, 10) || 100),
        powerFuel: Math.max(0, parseInt(p.powerFuel, 10) || 50)
      },
      blueprints: Array.isArray(p.blueprints) ? p.blueprints.slice(0, 10) : ['trebuchet'],
      assembledDevices: {},
      updatedAt: clockNow('workshop:register')
    };

    let capacityReached = false;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const s = getStore(draft);
        if (s && !s.workshops[wid] && Object.keys(s.workshops).length >= Math.max(1, Math.floor(settings().maxWorkshops))) {
          capacityReached = true;
          return;
        }
        if (s) {
          s.workshops[wid] = record;
        }
      });
    }

    if (capacityReached) return { ok: false, reason: 'capacity-reached' };
    return { ok: true, workshop: record };
  }

  /**
   * 核心多路业务派发：engineerDevice
   */
  function engineerDevice(opKind, spec, opts) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    const op = cleanStr(opKind, 30);
    const p = spec || {};
    const wid = cleanStr(p.workshopId, 40);

    const st = getStore();
    const workshop = (st && st.workshops && st.workshops[wid]) ? Object.assign({}, st.workshops[wid]) : null;

    if (!workshop && op !== 'register') {
      noteFault('workshop-not-found');
      return { ok: false, refusal: 'workshop-not-found', workshopId: wid };
    }

    switch (op) {
      case 'assemble': {
        const deviceType = cleanStr(p.deviceType || 'trebuchet', 30);
        const deviceId = cleanStr(p.deviceId || deviceType + '_' + clockNow('engineering-blueprint'), 40);

        // 材料成本检定
        const reqIron = 30;
        const reqWood = 40;
        const reqFuel = 10;

        if (workshop.resources.iron < reqIron || workshop.resources.wood < reqWood || workshop.resources.powerFuel < reqFuel) {
          noteFault('materials-depleted');
          return {
            ok: false,
            refusal: 'materials-depleted',
            workshopId: wid,
            currentResources: workshop.resources,
            required: { iron: reqIron, wood: reqWood, powerFuel: reqFuel },
            reason: 'Cannot assemble siege device; crucial raw materials depleted.'
          };
        }

        // 研发事故检定 (5%~20% 概率爆炸)
        const risk = clamp(p.risk || settings().baseExplosionRisk, 0, 50);
        const roll = (typeof p.testRoll === 'number') ? p.testRoll : Math.floor(WA.rand.next('engineering-blueprint') * 100);

        if (roll < risk) {
          stat.researchAccidents++;
          workshop.resources.iron = Math.max(0, workshop.resources.iron - reqIron);
          workshop.resources.wood = Math.max(0, workshop.resources.wood - reqWood);
          workshop.resources.powerFuel = Math.max(0, workshop.resources.powerFuel - reqFuel);
          workshop.updatedAt = clockNow('workshop:accident');

          if (WA.store && typeof WA.store.transact === 'function') {
            WA.store.transact(function (draft) {
              const s = getStore(draft);
              if (s && s.workshops[wid]) {
                s.workshops[wid] = workshop;
                s.log.push({ op: 'accident', wid, deviceType, at: clockNow() });
              }
            });
          }

          return {
            ok: false,
            accident: true,
            refusal: 'catastrophic-workshop-explosion',
            workshopId: wid,
            damageInflicted: 'Prototype ruptured during assembly; materials lost and workshop damaged.'
          };
        }

        stat.devicesEngineered++;
        workshop.resources.iron -= reqIron;
        workshop.resources.wood -= reqWood;
        workshop.resources.powerFuel -= reqFuel;

        const newDevice = {
          deviceId,
          deviceType,
          durability: 100,
          breachPower: deviceType === 'trebuchet' ? 85 : 60,
          ammo: Math.max(1, parseInt(p.ammo, 10) || 5),
          craftedAt: clockNow('workshop:assemble')
        };

        workshop.assembledDevices[deviceId] = newDevice;
        workshop.updatedAt = clockNow('workshop:assembled');

        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s && s.workshops[wid]) {
              s.workshops[wid] = workshop;
              s.log.push({ op: 'assemble', wid, deviceId, at: clockNow() });
            }
          });
        }

        return {
          ok: true,
          op: 'assemble',
          workshopId: wid,
          device: newDevice,
          remainingResources: workshop.resources
        };
      }

      case 'fire_siege': {
        const did = cleanStr(p.deviceId, 40);
        const targetFortification = cleanStr(p.targetFortification || 'Outer Gate', 60);

        if (!workshop.assembledDevices || !workshop.assembledDevices[did]) {
          noteFault('device-not-found');
          return { ok: false, refusal: 'device-not-found', deviceId: did };
        }

        const dev = workshop.assembledDevices[did];
        if (dev.durability <= 0 || dev.ammo <= 0) {
          noteFault('device-broken-or-empty');
          return {
            ok: false,
            refusal: 'device-broken-or-empty',
            deviceId: did,
            durability: dev.durability,
            ammo: dev.ammo,
            reason: 'Siege engine is either wrecked (durability 0) or ammunition is completely spent.'
          };
        }

        stat.siegeFired++;
        dev.ammo -= 1;
        dev.durability = clamp(dev.durability - settings().durabilityWearPerShot, 0, 100);

        const wallDamage = Math.round(dev.breachPower * (0.8 + WA.rand.next('engineering-blueprint') * 0.4));
        workshop.updatedAt = clockNow('workshop:fire');

        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s && s.workshops[wid]) {
              s.workshops[wid] = workshop;
            }
          });
        }

        return {
          ok: true,
          op: 'fire_siege',
          deviceId: did,
          targetFortification,
          structuralDamage: wallDamage,
          remainingAmmo: dev.ammo,
          remainingDurability: dev.durability
        };
      }

      case 'leak_blueprint': {
        stat.blueprintsLeaked++;
        const stolenBlueprint = cleanStr(p.blueprint || 'trebuchet', 30);
        const rivalFaction = cleanStr(p.rivalFaction || 'Enemy Syndicate', 40);

        if (WA.store && typeof WA.store.transact === 'function') {
          WA.store.transact(function (draft) {
            const s = getStore(draft);
            if (s) {
              s.log.push({ op: 'leak', wid, stolenBlueprint, rivalFaction, at: clockNow() });
            }
          });
        }

        return {
          ok: true,
          op: 'leak_blueprint',
          workshopId: wid,
          stolenBlueprint,
          acquiredBy: rivalFaction,
          effect: 'Rival faction unlocked reverse-engineering capability.'
        };
      }

      default: {
        noteFault('unsupported-op');
        return { ok: false, refusal: 'unsupported-op', opKind };
      }
    }
  }

  function getWorkshop(workshopId) {
    const st = getStore();
    if (!st || !st.workshops) return null;
    return st.workshops[cleanStr(workshopId, 40)] || null;
  }

  function listWorkshops() {
    const st = getStore();
    if (!st || !st.workshops) return [];
    return Object.keys(st.workshops).map(k => st.workshops[k]);
  }

  function buildBlock(context) {
    if (!settings().enabled) return '';
    const ws = listWorkshops();
    if (!ws.length) return '';

    const lines = ws.slice(0, 3).map(w => {
      const devKeys = Object.keys(w.assembledDevices || {});
      return `【军械工坊·${w.name}】铁料:${w.resources.iron} 木料:${w.resources.wood} 现成器械:${devKeys.length}台 (${devKeys.join(', ') || '无'})`;
    });

    return '[文明工坊与攻城工程器械]\n' + lines.join('\n');
  }

  function diagnose() {
    return {
      version: VERSION,
      enabled: settings().enabled,
      workshopCount: listWorkshops().length,
      stat: Object.assign({}, stat)
    };
  }

  function statView() {
    return Object.assign({}, stat);
  }

  function resetStat() {
    stat = {
      devicesEngineered: 0,
      siegeFired: 0,
      researchAccidents: 0,
      blueprintsLeaked: 0,
      refusals: 0,
      lastReason: ''
    };
  }

  const engineeringBlueprint = {
    version: VERSION,
    settings,
    saveSettings,
    registerWorkshop,
    engineerDevice,
    getWorkshop,
    listWorkshops,
    buildBlock,
    diagnose,
    stat: statView,
    resetStat
  };

  WA.engines.engineeringBlueprint = engineeringBlueprint;
  WA.engineeringBlueprint = engineeringBlueprint;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engineeringBlueprint;
  }
})();
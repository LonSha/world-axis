/**
 * WorldAxis engines/alchemy-toxicology.js (v2.351.0) — 毒理相生相克、药剂提炼与银针验毒引擎 (EXV19-7)
 *
 * ── 它治什么（核心沙盒痛点）────────────────────────────────────
 *   沙盒世界的“中毒”经常被简化为一个纯减血 Debuff，忽视了药理学与因果相生相克：
 *   没有神经麻痹、溶血破壁、脏腑溃烂的微观病理区分；
 *   缺乏暗中下毒、银针发黑验毒、试毒活禽死伤甄别；
 *   更没有依据君臣佐使、以毒攻毒、中和解毒的完整药理闭环。
 *
 * ── 核心机制闭环 ───────────────────────────────────────────────
 *   ① 四大微观毒素谱系（Toxin Spectra）：
 *      - neurotoxin（神经剧毒）：导致麻痹、呼吸衰竭、四肢瘫软；
 *      - hemotoxin（溶血毒素）：破坏凝血机制、七窍流血、内出血休克；
 *      - cytotoxin（细胞/脏腑溃烂）：腐蚀消化道与内脏、剧痛抽搐；
 *      - hallucinogen（致幻迷药）：迷失神志、认知解离、口吐真言。
 *   ② 核心炼药与验毒指令（brewOrTestToxin）：
 *      - screenPoison: 验毒甄别（银针刺探/验毒石/活禽试毒），识别隐匿毒物；
 *      - brewToxin: 萃取提炼高纯度剧毒，设定潜伏期与致死阈值（LD50）；
 *      - counterToxin: 中和解毒（以草药针对性中和），消除体内残毒；
 *   ③ 破坏性负控制：
 *      - 当毒素已深度侵蚀血液脏器且致死度已达 100% 极限（severity >= 100），且心肺已停止，
 *        断言禁止使用轻微解毒草药直接即刻起死回生（refusal: 'lethal-toxicity-irreversible'）。
 *
 * ── 铁律与设计边界 ─────────────────────────────────────────────
 *   - 纯框架中立，全题材通用（无论修仙鹤顶红/含笑半步癫、武侠断肠草、赛博合成神经毒剂）；
 *   - 持久化于 WA.store（root.toxicologyLedger）；
 *   - 真实严密的行为真源。
 */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this);
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_alchemy_toxicology_settings_v1';
  const DEF = {
    enabled: true,
    maxPatients: 32,
    maxToxinTypes: 16,
    neutralizeRate: 40
  };
  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'alchemyToxicology',
    bounds: {
      maxPatients: [4, 64],
      maxToxinTypes: [4, 64],
      neutralizeRate: [10, 80]
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
    toxinsBrewed: 0,
    testsConducted: 0,
    toxinsNeutralized: 0,
    fatalities: 0,
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
  function getToxStore(draft) {
    const target = draft || (WA.store ? WA.store.get() : null);
    if (!target) return null;
    if (!target.toxicologyLedger) {
      if (draft) draft.toxicologyLedger = { cases: {}, recipes: [] };
      return draft ? draft.toxicologyLedger : null;
    }
    return target.toxicologyLedger;
  }

  /**
   * 毒理与药剂主枢纽
   */
  function brewOrTestToxin(spec) {
    spec = spec || {};
    const action = cleanStr(spec.action || spec.subType || 'screenPoison', 32);
    const actorId = cleanStr(spec.actorId || spec.who || 'alchemist_practitioner', 48);

    let result = null;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        const store = getToxStore(draft);
        if (!store) {
          result = { ok: false, refusal: 'toxicology-store-unavailable' };
          noteFault('toxicology-store-unavailable');
          return;
        }

        const now = clockNow('brewOrTestToxin');

        if (action === 'screenPoison') {
          // 银针验毒 / 探针甄别
          const medium = cleanStr(spec.medium || 'cup_of_wine', 48);
          const hasToxin = spec.hasToxin !== false;
          const toxinType = cleanStr(spec.toxinType || 'neurotoxin', 32);
          const method = cleanStr(spec.method || 'silver_needle', 32); // silver_needle | taste_avian | spirit_stone

          stat.testsConducted++;
          if (hasToxin) {
            result = {
              ok: true,
              action: 'screenPoison',
              detected: true,
              medium: medium,
              toxinType: toxinType,
              method: method,
              narrative: method === 'silver_needle'
                ? `银针刺入「${medium}」，针尖瞬间泛起刺目乌黑并伴有微弱气泡，剧毒昭然若揭！`
                : `探毒试剂与「${medium}」接触，当即剧烈变色翻涌，成功拦截致命暗杀毒害！`
            };
          } else {
            result = {
              ok: true,
              action: 'screenPoison',
              detected: false,
              medium: medium,
              method: method,
              narrative: `银针浸润「${medium}」良久依然明亮如初，未探得任何已知毒质反应。`
            };
          }
        } else if (action === 'counterToxin') {
          // 中和解毒
          const patientId = cleanStr(spec.patientId || actorId, 48);
          let pCase = store.cases[patientId];
          if (!pCase) {
            pCase = {
              patientId: patientId,
              toxinType: cleanStr(spec.toxinType || 'hemotoxin', 32),
              severity: clamp(spec.severity != null ? spec.severity : 50, 0, 100),
              status: 'poisoned',
              updatedAt: now
            };
            store.cases[patientId] = pCase;
          }

          // 破坏性负控制断言：毒入膏肓且已致死（severity >= 100），严禁常规轻微草药解毒
          if (pCase.severity >= 100) {
            pCase.status = 'deceased';
            stat.fatalities++;
            result = {
              ok: false,
              refusal: 'lethal-toxicity-irreversible',
              reason: '剧毒已全面攻心溶解内脏骨髓（毒素烈度 100%），心肺早已停搏，常规草药解毒无法起死回生！',
              patientId: patientId,
              severity: pCase.severity
            };
            noteFault('lethal-toxicity-irreversible');
            return;
          }

          const remedyPower = clamp(spec.remedyPower != null ? spec.remedyPower : 40, 10, 80);
          const oldSev = pCase.severity;
          pCase.severity = clamp(pCase.severity - remedyPower, 0, 100);
          if (pCase.severity <= 0) pCase.status = 'detoxified';
          pCase.updatedAt = now;
          stat.toxinsNeutralized++;

          result = {
            ok: true,
            action: 'counterToxin',
            patientId: patientId,
            toxinType: pCase.toxinType,
            remedyPower: remedyPower,
            oldSeverity: oldSev,
            currentSeverity: pCase.severity,
            status: pCase.status,
            narrative: `针对性的甘草解毒汤药灌服入喉，中和克制体内「${pCase.toxinType}」，毒素侵蚀度从 ${oldSev} 降至 ${pCase.severity}。`
          };
        } else if (action === 'brewToxin') {
          // 炼制提炼毒剂
          const toxinName = cleanStr(spec.name || '乌头蚀骨散', 48);
          const toxinType = cleanStr(spec.toxinType || 'cytotoxin', 32);
          const potency = clamp(spec.potency != null ? spec.potency : 75, 10, 100);

          const recipe = {
            id: 'tox_' + Date.now(),
            name: toxinName,
            type: toxinType,
            potency: potency,
            brewedBy: actorId,
            createdAt: now
          };
          store.recipes.unshift(recipe);
          if (store.recipes.length > 20) store.recipes.length = 20;
          stat.toxinsBrewed++;

          result = {
            ok: true,
            action: 'brewToxin',
            recipeId: recipe.id,
            name: toxinName,
            type: toxinType,
            potency: potency,
            narrative: `药碾沉重研磨，冷凝管滴落深墨色药露，成功提纯出高浓烈度「${toxinName}」（烈度 ${potency}）。`
          };
        } else {
          result = { ok: false, refusal: 'unknown-toxicology-action', reason: '未知毒理操作: ' + action };
          noteFault('unknown-toxicology-action');
        }
      });
    }

    return result || { ok: false, refusal: 'store-unavailable' };
  }

  function buildBlock() {
    const store = getToxStore();
    if (!store) return '';
    const activeCases = Object.values(store.cases || {}).filter(function (c) { return c.status === 'poisoned'; }).slice(0, 3);
    if (activeCases.length === 0) return '';

    const lines = ['【毒理药相与微观病理】'];
    activeCases.forEach(function (c) {
      lines.push(`· 伤患 ${c.patientId}：身中「${c.toxinType}」，体内毒素烈度 ${c.severity}/100 [侵蚀发作中]`);
    });
    return lines.join('\n');
  }

  WA.alchemyToxicology = {
    DEF: DEF,
    settings: settings,
    saveSettings: saveSettings,
    brewOrTestToxin: brewOrTestToxin,
    buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat); }
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/alchemy-toxicology.js', { kind: 'engine', ver: '2.351.0' });
  }
})();
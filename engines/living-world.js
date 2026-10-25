/**
 * WorldAxis engines/living-world.js (v2.237.0) — Living World V6：通用真实世界自治演化与深层人情中枢
 *
 * ── 核心职责全景（全面兼容通用/现代/奇幻/科幻/市井全题材）─────────────────────
 *   ① 原生职业/身份作息网格（OCCUPATIONAL_ROUTINES）：医者/治愈者、差役/执法者、商贩/工薪族、学者/研究员、游侠/流民/探索者；
 *   ② 生理磨损与微观生计代谢自愈环（metabolicLoop）：精力疲惫/饥渴度/风尘磨损；匮乏时自主消耗口粮或花费钱款自愈；
 *   ③ 随身生计行囊与信据（belongings）：货币(铜/银/币)、干粮口粮、随身工具器物、贴身信物真实收支；
 *   ④ 空间痕迹物理半衰期与多感官具象（decayTraces）：痕迹随时间推移逐渐冷却、风化、被清理；呈现温度/气味/微尘具象细节；
 *   ⑤ NPC横向社交碰撞与人情势能沉淀（recordRelationalDebt）：两NPC交集时沉淀恩义人情(favors)、嫌隙摩擦(grudges)与秘密(secrets)；
 *   ⑥ 市井窘迫生活微情境（vignettes）：涵盖数零钱、典当犹豫、争执砍价、疲惫打盹等通用生计瞬间；
 *   ⑦ 投石入水局部生态涟漪（propagateRipple）：核心人物遭剧烈变故（受伤/暴富/受困）时，地缘与依附关联人动机级联偏折；
 *   ⑧ 久别重逢心理重力发酵（reunionSubtext）：长期未见角色重聚时，比对离场发酵史，提取深层心理潜台词（情怯/感激/顾虑）；
 *   ⑨ 玩家交互反向生活轨迹偏折（deflectTrajectory）：正文转交物资或解决危机后，NPC立即切换作息动因；
 *   ⑩ 重大离场历程向终身记忆沉淀（consolidateLivingMemory）：重大经历写回 actors/profile；
 *   ⑪ 正文多层次文学白描叙事透镜（buildBlock）：全景多层次注入在场者神态、行囊、心理重力暗涌与周遭感官痕迹。
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_living_world_settings_v1';
  const DEF = {
    enabled: true,
    maxEncounters: 16,
    maxTraces: 24,
    maxMovements: 32,
    maxIntersections: 16,
    maxVignettes: 16,
    maxGaps: 16,
    maxRipples: 16,
    maxRelationalDebts: 24,
    rumorDiffusion: true,
    decayRounds: 5,
    wearinessRate: 1.0,
    subsistenceEnabled: true,
    peerInteractions: true,
    metabolicLoopEnabled: true
  };

  const __REG = {
    key: LS_KEY, def: DEF, module: 'livingWorld',
    bounds: {
      maxEncounters: [4, 64], maxTraces: [4, 64], maxMovements: [8, 128],
      maxIntersections: [4, 64], maxVignettes: [4, 64], maxGaps: [4, 64],
      maxRipples: [4, 64], maxRelationalDebts: [4, 64],
      decayRounds: [1, 20]
    }
  };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = {
    ticks: 0,
    encountersDetected: 0,
    tracesGenerated: 0,
    tracesDecayed: 0,
    rumorsDiffused: 0,
    strainsAccumulated: 0,
    subsistenceUsed: 0,
    metabolicBuys: 0,
    intersectionsResolved: 0,
    vignettesTriggered: 0,
    trajectoriesDeflected: 0,
    memoriesConsolidated: 0,
    ripplesPropagated: 0,
    relationalDebtsRecorded: 0,
    reunionsSubtextBuilt: 0,
    refused: 0,
    lastReason: '',
    lastAt: 0
  };

  function refuse(reason) {
    stat.refused++;
    stat.lastReason = reason;
    if (reason === 'disabled') return { ok: false, reason: 'disabled' };
    if (reason === 'missing-name') return { ok: false, reason: 'missing-name' };
    if (reason === 'missing-place') return { ok: false, reason: 'missing-place' };
    if (reason === 'tx-failed') return { ok: false, reason: 'tx-failed' };
    return { ok: false, reason: 'unsupported' };
  }

  const DAY_PERIODS = ['dawn', 'morning', 'noon', 'dusk', 'night'];
  const PERIOD_LABELS = {
    dawn: '拂晓清晨',
    morning: '上午工作',
    noon: '正午歇息',
    dusk: '傍晚薄暮',
    night: '子夜更阑'
  };

  // 通用职业作息网格：兼顾古风、近代与现代通识语境
  const OCCUPATIONAL_ROUTINES = {
    healer: {
      role: '医者/医师/看护',
      dawn: { doing: '开门通风，清点整理药具与急用消耗品', place: '诊所药室', costWear: 5, itemUsed: '温水' },
      morning: { doing: '坐班问诊搭脉，执笔记录病情并配发药物', place: '诊所药室', costWear: 15 },
      noon: { doing: '在隔间草草用完温热盒饭，翻阅核查未结病例', place: '诊所后屋', costWear: -10 },
      dusk: { doing: '清点出诊箱器具，上门随访几位体弱病患', place: '街区小巷', costWear: 20 },
      night: { doing: '挑灯对账研核药理笔记，看顾留观病榻', place: '诊所内室', costWear: 10 }
    },
    constable: {
      role: '差役/执法/安保',
      dawn: { doing: '点名查验装备，整理随身腰牌与文书', place: '值所公堂', costWear: 10 },
      morning: { doing: '带队穿行辖区街市巡查摊位，排查可疑事端', place: '街区市集', costWear: 20, itemUsed: '干粮口粮' },
      noon: { doing: '在街角便民食摊歇脚解渴，向店主打听近日风声', place: '市井茶棚', costWear: -15 },
      dusk: { doing: '查验卡口门闸，督导街区商贩收摊停当', place: '坊门关卡', costWear: 15 },
      night: { doing: '换上夜巡行头提灯夜巡，留心街巷幽暗角落', place: '昏暗偏巷', costWear: 25 }
    },
    vendor: {
      role: '商贩/店主/工薪',
      dawn: { doing: '早早张罗开店，打扫门面搬运货物摆齐', place: '市集店铺', costWear: 15 },
      morning: { doing: '忙碌招呼往来顾客，拨弄账册或计算找零零钱', place: '市集店铺', costWear: 20 },
      noon: { doing: '守着摊位咬着冷食干粮，眼睛仍盯牢过往客人', place: '市集店铺', costWear: -5 },
      dusk: { doing: '将未卖出的货物打包遮盖，点算钱囊与散碎收入', place: '市集店铺', costWear: 15 },
      night: { doing: '推车挑担疲惫归家，与家人对坐核算微薄收支', place: '狭窄住处', costWear: -20 }
    },
    scholar: {
      role: '文人/学者/干事',
      dawn: { doing: '晨起开窗研墨看书，借着晨光翻阅手头案卷', place: '书斋案头', costWear: 5 },
      morning: { doing: '前往学堂或行所为众人代书誊抄、撰拟文稿', place: '文渊书所', costWear: 15 },
      noon: { doing: '就着温茶吃些干粮，与相熟同仁闲谈探讨', place: '茶肆食档', costWear: -10 },
      dusk: { doing: '收纳整理稿纸砚台，在门外漫步透气松弛颈目', place: '河畔石桥', costWear: 10 },
      night: { doing: '剪亮油灯伏案疾书，连夜校对抄录典籍资料', place: '孤灯案前', costWear: 20 }
    },
    drifter: {
      role: '游民/浪客/行者',
      dawn: { doing: '在廊檐避风处拍打衣物寒气，起身活动麻木肢体', place: '破庙外廊', costWear: 10 },
      morning: { doing: '在码头或集市打探零工搬运差事与悬赏动静', place: '客栈渡口', costWear: 20 },
      noon: { doing: '摸出怀中坚硬口粮费力咀嚼吞咽，警惕地扫视周遭', place: '巷口檐下', costWear: -5 },
      dusk: { doing: '在铁匠行当或旧货摊外流连，清点腰间所剩无几的碎银', place: '行铺街角', costWear: 10 },
      night: { doing: '抱着随身物件靠墙浅眠，稍有异响便警醒睁眼', place: '荒废角落', costWear: 15 }
    }
  };

  const VIGNETTE_TEMPLATES = [
    { type: 'financial_pinch', desc: '正反复清点随身所剩不多的散碎零钱与开销余额，眉头紧锁' },
    { type: 'pawn_hesitation', desc: '站在二手典当回购店门外攥紧怀中旧物，迟迟未曾迈步，神情挣扎' },
    { type: 'merchant_haggling', desc: '正为一笔零散账目开销与对方据理力争，语气焦灼紧绷' },
    { type: 'weary_slumber', desc: '靠在长椅或墙角处闭目浅歇，手里仍下意识紧紧护着随身包裹' }
  ];

  // 动态货币与物价常识感知（对接 economy / recipe，未声明时安全回退中性配置）
  function getEconomyProfile() {
    let curName = '货币';
    let curUnit = '';
    let mealCost = 4;
    try {
      // 优先从 recipe 当前配方或扩展中感知
      let declared = null;
      if (WA.recipe) {
        if (typeof WA.recipe.getSettings === 'function') {
          const rcfg = WA.recipe.getSettings();
          if (rcfg && rcfg.economy && rcfg.economy.money) {
            declared = rcfg.economy.money;
          }
        }
        if (!declared && typeof WA.recipe.economySpec === 'function') {
          const spec = WA.recipe.economySpec();
          if (spec && spec.ok && spec.money) declared = spec.money;
        }
      }
      if (!declared && WA.economy && typeof WA.economy.money === 'function') {
        declared = WA.economy.money();
      }
      if (declared) {
        curName = declared;
        if (declared === '银元' || declared === '铜钱' || declared === '铜板') {
          curUnit = '枚';
          mealCost = 4;
        } else if (declared === '日元' || declared === '円') {
          curUnit = '円';
          mealCost = 500;
        } else if (declared === '元' || declared === '人民币') {
          curUnit = '元';
          mealCost = 25;
        } else if (declared === '信用点' || declared === '点') {
          curUnit = '点';
          mealCost = 20;
        } else if (declared === '美元' || declared === '美金' || declared === '刀') {
          curUnit = '美元';
          mealCost = 3; // 冷战时期（1960-70年代）一顿简餐汉堡咖啡约2~3美元
        } else if (declared === '金币' || declared === '金') {
          curUnit = '金';
          mealCost = 1;
        } else if (declared === '银币' || declared === '银') {
          curUnit = '银';
          mealCost = 2;
        } else {
          curUnit = declared;
          mealCost = 10;
        }
      }
    } catch (e) {}
    return {
      name: curName,
      unit: curUnit,
      mealCost: mealCost
    };
  }

  function cleanStr(s, max) {
    if (s == null) return '';
    return String(s).trim().slice(0, max || 120);
  }

  function getBucket(draft) {
    if (!draft.livingWorld || typeof draft.livingWorld !== 'object') {
      draft.livingWorld = {
        tick: 0,
        encounters: [],
        livingTraces: [],
        npcMovements: [],
        characterStates: {},
        intersections: [],
        epistemicGaps: [],
        vignettes: [],
        ripples: [],
        relationalDebts: []
      };
    }
    const b = draft.livingWorld;
    if (!Array.isArray(b.encounters)) b.encounters = [];
    if (!Array.isArray(b.livingTraces)) b.livingTraces = [];
    if (!Array.isArray(b.npcMovements)) b.npcMovements = [];
    if (!Array.isArray(b.intersections)) b.intersections = [];
    if (!Array.isArray(b.epistemicGaps)) b.epistemicGaps = [];
    if (!Array.isArray(b.vignettes)) b.vignettes = [];
    if (!Array.isArray(b.ripples)) b.ripples = [];
    if (!Array.isArray(b.relationalDebts)) b.relationalDebts = [];
    if (!b.characterStates || typeof b.characterStates !== 'object') b.characterStates = {};
    return b;
  }

  function ensureCharLifeState(b, name, occupation) {
    const nm = cleanStr(name, 40);
    if (!b.characterStates[nm]) {
      const occ = occupation || (OCCUPATIONAL_ROUTINES[nm] ? nm : 'vendor');
      const eco = getEconomyProfile();
      const initialMoney = (eco.mealCost || 4) * 6; // 默认储备约 6 顿便餐的生活费
      b.characterStates[nm] = {
        name: nm,
        occupation: occ,
        vitalStrain: {
          weariness: 10,
          hunger: 15,
          weathering: 5,
          lastUpdatedTick: b.tick || 0
        },
        belongings: {
          copper: initialMoney,
          silver: 0,
          provisions: 2,
          tools: ['随身手帕纸巾'],
          keepsakes: []
        },
        customRoutine: null,
        // 久别发酵追踪
        absence: {
          lastSeenTick: b.tick || 0,
          roundsAway: 0,
          accumulatedGratitude: 0,
          lingeringThought: ''
        }
      };
    }
    return b.characterStates[nm];
  }

  function registerRoutine(name, routine, occupation) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const nm = cleanStr(name, 40);
    if (!nm) return refuse('missing-name');
    let out = null;
    WA.store.transact(function (draft) {
      const b = getBucket(draft);
      const st = ensureCharLifeState(b, nm, occupation);
      if (Array.isArray(routine)) {
        st.customRoutine = routine.slice(0, 8);
      }
      if (occupation && OCCUPATIONAL_ROUTINES[occupation]) {
        st.occupation = occupation;
      }
      draft.people = draft.people || {};
      const p = draft.people[nm] = draft.people[nm] || { id: nm, name: nm };
      p.life = p.life || {};
      p.life.routine = st.customRoutine || [];
      p.life.occupation = st.occupation;
      out = { ok: true, name: nm, occupation: st.occupation, routineLength: (st.customRoutine || []).length };
      return true;
    }, 'livingWorld:registerRoutine');
    return out || refuse('tx-failed');
  }

  /**
   * 玩家正文交互反向偏折 NPC 生活动因（deflectTrajectory）
   */
  function deflectTrajectory(name, newGoal, newDoing, options) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const nm = cleanStr(name, 40);
    if (!nm) return refuse('missing-name');
    const opts = options || {};

    let out = null;
    WA.store.transact(function (draft) {
      const b = getBucket(draft);
      const st = ensureCharLifeState(b, nm);
      const ewRows = (draft.elsewhere && Array.isArray(draft.elsewhere.rows)) ? draft.elsewhere.rows : [];
      const card = ewRows.find(function (c) { return c && c.name === nm; });
      if (card) {
        if (newGoal) card.goal = cleanStr(newGoal, 80);
        if (newDoing) card.doing = cleanStr(newDoing, 80);
        if (opts.clearWorry) card.worry = '';
        if (opts.newPlace) card.place = cleanStr(opts.newPlace, 60);
      }
      // 若有物资赠予或交易，更新行囊
      if (opts.giveSilver) st.belongings.silver = (st.belongings.silver || 0) + opts.giveSilver;
      if (opts.giveCopper) st.belongings.copper = (st.belongings.copper || 0) + opts.giveCopper;
      if (opts.giveProvisions) st.belongings.provisions = (st.belongings.provisions || 0) + opts.giveProvisions;
      if (opts.giveItem) st.belongings.tools.push(cleanStr(opts.giveItem, 40));

      if (opts.giveSilver || opts.giveCopper || opts.clearWorry) {
        if (st.absence) {
          st.absence.accumulatedGratitude = (st.absence.accumulatedGratitude || 0) + 15;
          st.absence.lingeringThought = '感念救助之恩，时常惦念挂怀';
        }
      }

      stat.trajectoriesDeflected++;
      out = { ok: true, name: nm, newDoing: newDoing, belongings: st.belongings };
      return true;
    }, 'livingWorld:deflectTrajectory');
    return out || refuse('tx-failed');
  }

  /**
   * 投石入水局部生态涟漪传导（propagateRipple）
   * 当核心角色遭剧烈扰动时，其地缘与依附关联人动机发生级联偏折
   */
  function propagateRipple(sourceWho, cause, impactType, options) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const src = cleanStr(sourceWho, 40);
    const cs = cleanStr(cause, 100);
    const imp = cleanStr(impactType || 'distress', 30);
    if (!src) return refuse('missing-name');
    const opts = options || {};

    let out = null;
    WA.store.transact(function (draft) {
      const b = getBucket(draft);
      const ewRows = (draft.elsewhere && Array.isArray(draft.elsewhere.rows)) ? draft.elsewhere.rows : [];
      const srcCard = ewRows.find(function (c) { return c && c.name === src; });
      const srcPlace = (srcCard && srcCard.place) || opts.place || '市井街巷';

      const affected = [];
      ewRows.forEach(function (card) {
        if (!card || card.name === src) return;
        const samePlace = card.place && (card.place === srcPlace || card.place.indexOf(srcPlace) >= 0 || srcPlace.indexOf(card.place) >= 0);
        if (samePlace || opts.affectAllPeers) {
          if (imp === 'distress' || imp === 'crisis') {
            card.doing = '听闻' + src + '突发变故，人心惶惶，四处打探风声';
            card.worry = '局势生变，提防牵连受灾';
          } else if (imp === 'windfall' || imp === 'fortune') {
            card.doing = '见' + src + '境况骤变，心生艳羡与探寻念头';
          }
          affected.push(card.name);
        }
      });

      const rip = {
        id: 'ripple_' + src + '_' + (b.tick || 0),
        source: src,
        place: srcPlace,
        cause: cs,
        impactType: imp,
        affectedPeers: affected,
        tick: b.tick || 0
      };
      b.ripples.push(rip);
      if (WA.evict && WA.evict.array) {
        WA.evict.array(b.ripples, 'livingWorld.ripples');
      }

      stat.ripplesPropagated++;
      out = { ok: true, ripple: rip };
      return true;
    }, 'livingWorld:propagateRipple');
    return out || refuse('tx-failed');
  }

  /**
   * 记录NPC间的人情势能与交往恩义（recordRelationalDebt）
   */
  function recordRelationalDebt(fromWho, toWho, debtType, amount, reason) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const f = cleanStr(fromWho, 40);
    const t = cleanStr(toWho, 40);
    const ty = cleanStr(debtType || 'favor', 20); // favor (恩义人情), grudge (嫌隙猜疑), secret (把柄软肋)
    const amt = typeof amount === 'number' ? amount : 1;
    const rsn = cleanStr(reason, 120);
    if (!f || !t) return refuse('missing-name');

    let out = null;
    WA.store.transact(function (draft) {
      const b = getBucket(draft);
      let entry = b.relationalDebts.find(function (d) {
        return d && d.from === f && d.to === t && d.type === ty;
      });
      if (entry) {
        entry.amount = (entry.amount || 0) + amt;
        entry.lastReason = rsn || entry.lastReason;
        entry.updatedTick = b.tick || 0;
      } else {
        entry = {
          id: 'rel_' + f + '_' + t + '_' + ty,
          from: f,
          to: t,
          type: ty,
          amount: amt,
          lastReason: rsn,
          updatedTick: b.tick || 0
        };
        b.relationalDebts.push(entry);
      }
      if (WA.evict && WA.evict.array) {
        WA.evict.array(b.relationalDebts, 'livingWorld.relationalDebts');
      }
      stat.relationalDebtsRecorded++;
      out = { ok: true, entry: entry };
      return true;
    }, 'livingWorld:recordRelationalDebt');
    return out || refuse('tx-failed');
  }

  /**
   * 离场重大转折向宿主核心记忆沉淀（consolidateLivingMemory）
   */
  function consolidateLivingMemory(name, memoryText) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const nm = cleanStr(name, 40);
    const mem = cleanStr(memoryText, 160);
    if (!nm) return refuse('missing-name');
    if (!mem) return refuse('missing-place');
    let out = null;
    WA.store.transact(function (draft) {
      draft.people = draft.people || {};
      const p = draft.people[nm] = draft.people[nm] || { id: nm, name: nm };
      p.profile = p.profile || {};
      p.profile.memory = Array.isArray(p.profile.memory) ? p.profile.memory : [];
      p.profile.memory.push(mem);
      if (p.profile.memory.length > 25) {
        p.profile.memory.shift();
      }

      stat.memoriesConsolidated++;
      out = { ok: true, name: nm, memory: mem };
      return true;
    }, 'livingWorld:consolidateLivingMemory');
    return out || refuse('tx-failed');
  }

  /**
   * 自治步进推演（每轮推进时自动触发）
   */
  function autonomousTick(opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    stat.lastAt = clockNow('livingWorld');
    stat.ticks++;
    let result = {
      changedPeople: 0,
      tracesAdded: 0,
      tracesDecayed: 0,
      rumorsAdded: 0,
      period: 'morning',
      strainsUpdated: 0,
      intersectionsCount: 0,
      vignettesCount: 0,
      metabolicBuysCount: 0
    };

    WA.store.transact(function (draft) {
      const b = getBucket(draft);
      b.tick = (b.tick || 0) + 1;
      const currentPeriod = DAY_PERIODS[b.tick % DAY_PERIODS.length];
      result.period = currentPeriod;

      const ewRows = (draft.elsewhere && Array.isArray(draft.elsewhere.rows)) ? draft.elsewhere.rows : [];

      // 1. 扫描与演化角色
      ewRows.forEach(function (card) {
        if (!card || !card.name) return;
        const charLife = ensureCharLifeState(b, card.name);
        const occProfile = OCCUPATIONAL_ROUTINES[charLife.occupation] || OCCUPATIONAL_ROUTINES.vendor;
        const currentSchedule = occProfile[currentPeriod] || { doing: '料理手头日常杂事', place: '街巷市井', costWear: 10 };

        if (!card.lastTrackedPlace) {
          card.lastTrackedPlace = card.place || currentSchedule.place || '街巷市井';
        }
        if (!card.place) card.place = currentSchedule.place || '街巷市井';
        if (!card.doing) card.doing = currentSchedule.doing;

        const currentPlace = card.place || '街巷市井';
        const currentDoing = card.doing || currentSchedule.doing;

        if (currentPeriod === 'noon') {
          // 正午时分惯例
        }
        const strain = charLife.vitalStrain;
        const wearDelta = currentSchedule.costWear || 10;
        strain.weariness = Math.max(0, Math.min(100, strain.weariness + wearDelta));
        strain.hunger = Math.max(0, Math.min(100, strain.hunger + (currentPeriod === 'noon' ? -15 : 10)));
        if (currentPeriod === 'dusk' || currentPeriod === 'night') {
          strain.weathering = Math.max(0, Math.min(100, strain.weathering + 5));
        }

        // 微观生计自愈闭环（Metabolic Loop）：
        // 饥肠辘辘时，若有备粮则消耗自愈；若缺粮且随身有资金，按世界物价自主采购简餐自愈
        if (cfg.metabolicLoopEnabled && strain.hunger > 60) {
          const eco = getEconomyProfile();
          const mealPrice = eco.mealCost || 4;
          if (charLife.belongings.provisions > 0) {
            charLife.belongings.provisions--;
            strain.hunger = Math.max(0, strain.hunger - 35);
            stat.subsistenceUsed++;
          } else if (charLife.belongings.copper >= mealPrice || charLife.belongings.silver > 0) {
            if (charLife.belongings.copper >= mealPrice) {
              charLife.belongings.copper -= mealPrice;
            } else if (charLife.belongings.silver > 0) {
              charLife.belongings.silver -= 1;
              charLife.belongings.copper = Math.max(0, charLife.belongings.copper + (mealPrice * 10) - mealPrice);
            }
            charLife.belongings.provisions += 1;
            strain.hunger = Math.max(0, strain.hunger - 30);
            result.metabolicBuysCount++;
            stat.metabolicBuys++;
          }
        }

        // 久别空白期沉淀
        if (charLife.absence) {
          charLife.absence.roundsAway = (charLife.absence.roundsAway || 0) + 1;
        }

        // 心事发酵
        if (card.worry) {
          card.worryRounds = (card.worryRounds || 0) + 1;
          strain.weariness = Math.min(100, strain.weariness + 8);
          if (card.worryRounds >= 3) {
            card.status = (card.status || '') + '（心绪渐重，暗自谋划）';
          }
        }

        // 地点漂移留痕（结合感官具象：温度、气味、残迹）
        if (card.lastTrackedPlace && card.lastTrackedPlace !== currentPlace) {
          const traceItem = {
            id: 'trace_' + card.name + '_' + b.tick,
            place: card.lastTrackedPlace,
            who: card.name,
            trace: card.name + '刚刚在此停留，' + currentDoing + '，离开未久。周遭留有细微身形压痕与未散余温。',
            atTick: b.tick,
            freshness: 100
          };
          b.livingTraces.push(traceItem);
          result.tracesAdded++;
          stat.tracesGenerated++;

          b.npcMovements.push({
            name: card.name,
            from: card.lastTrackedPlace,
            to: currentPlace,
            reason: currentDoing,
            tick: b.tick
          });
          card.lastTrackedPlace = currentPlace;
        }

        // 市井传闻转化
        if (cfg.rumorDiffusion && card.worry && card.worryRounds === 2) {
          const factKey = 'fact_living_' + card.name;
          const factVal = card.name + '最近正为「' + card.worry + '」四处奔波。';
          draft.worldFacts = draft.worldFacts || [];
          if (!draft.worldFacts.some(function (f) { return f && f.key === factKey; })) {
            draft.worldFacts.push({
              id: factKey,
              key: factKey,
              value: factVal,
              scope: 'local',
              source: 'livingWorld',
              at: clockNow('livingWorld'),
              active: true
            });
          }
          if (WA.rumor && typeof WA.rumor.startChain === 'function') {
            setTimeout(function () {
              try { WA.rumor.startChain(factKey, '市井私语'); } catch (e) {}
            }, 0);
          }
          result.rumorsAdded++;
          stat.rumorsDiffused++;
        }

        result.changedPeople++;
        result.strainsUpdated++;
        stat.strainsAccumulated++;
      });

      // 2. 空间痕迹多感官物理半衰期衰减与掌柜清理
      if (Array.isArray(b.livingTraces)) {
        b.livingTraces.forEach(function (t) {
          if (!t) return;
          const age = b.tick - (t.atTick || 0);
          t.freshness = Math.max(0, 100 - age * 25);
          if (age === 1) {
            t.trace = t.trace.replace('刚刚在此停留', '不久前曾在此停留') + '（微温渐凉，空气中浮着极淡气味）';
          } else if (age >= 2 && age < cfg.decayRounds) {
            t.trace = t.trace.replace('离开未久', '已过去数个时辰') + '（痕迹已冷，窗棂案边落有薄尘）';
          } else if (age >= cfg.decayRounds) {
            t.trace = '原先留下的痕迹已被伙计扫去清理，几不可辨。';
            result.tracesDecayed++;
            stat.tracesDecayed++;
          }
        });
      }

      // 3. NPC 之间的横向碰撞与交集结算（resolveIntersections）并沉淀恩义交往
      if (cfg.peerInteractions && ewRows.length >= 2) {
        const placeGroups = {};
        ewRows.forEach(function (r) {
          if (!r || !r.place) return;
          placeGroups[r.place] = placeGroups[r.place] || [];
          placeGroups[r.place].push(r);
        });

        Object.keys(placeGroups).forEach(function (pl) {
          const peers = placeGroups[pl];
          if (peers.length >= 2) {
            const p1 = peers[0];
            const p2 = peers[1];
            const interItem = {
              id: 'inter_' + p1.name + '_' + p2.name + '_' + b.tick,
              place: pl,
              participants: [p1.name, p2.name],
              summary: p1.name + '与' + p2.name + '在' + pl + '照面碰头，交谈间互通了生计难处与近日见闻。',
              tick: b.tick
            };
            b.intersections.push(interItem);
            result.intersectionsCount++;
            stat.intersectionsResolved++;

            // 沉淀横向人情互助
            const debtKey = 'rel_' + p1.name + '_' + p2.name + '_favor';
            let d = b.relationalDebts.find(function (x) { return x && x.id === debtKey; });
            if (!d) {
              b.relationalDebts.push({
                id: debtKey,
                from: p1.name,
                to: p2.name,
                type: 'favor',
                amount: 1,
                lastReason: '在' + pl + '日常照面相助互通声息',
                updatedTick: b.tick
              });
              stat.relationalDebtsRecorded++;
            }
          }
        });
      }

      // 4. 生活窘迫微情境生成（vignettes）
      ewRows.forEach(function (r) {
        if (!r || !r.name) return;
        const st = b.characterStates[r.name];
        if (st && st.vitalStrain && (st.vitalStrain.weariness >= 40 || st.vitalStrain.hunger >= 50 || r.worry)) {
          const tmpl = VIGNETTE_TEMPLATES[Math.floor(Math.random() * VIGNETTE_TEMPLATES.length)];
          b.vignettes.push({
            name: r.name,
            place: r.place || '近处',
            detail: tmpl.desc,
            tick: b.tick
          });
          result.vignettesCount++;
          stat.vignettesTriggered++;
        }
      });

      // 5. 容量挤出对偶保护
      if (WA.evict && WA.evict.array) {
        WA.evict.array(b.livingTraces, 'livingWorld.livingTraces');
        WA.evict.array(b.npcMovements, 'livingWorld.npcMovements');
        WA.evict.array(b.intersections, 'livingWorld.intersections');
        WA.evict.array(b.epistemicGaps, 'livingWorld.epistemicGaps');
        WA.evict.array(b.vignettes, 'livingWorld.vignettes');
        WA.evict.array(b.ripples, 'livingWorld.ripples');
        WA.evict.array(b.relationalDebts, 'livingWorld.relationalDebts');
      }

      return true;
    }, 'livingWorld:autonomousTick');

    return { ok: true, tick: stat.ticks, result: result };
  }

  /**
   * 空间偶遇探测（包含同地点在场、近期痕迹、微情境、横向交集、生态涟漪与久别重逢心理）
   */
  function detectEncounters(playerPlace) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const pl = cleanStr(playerPlace, 60);
    if (!pl) return refuse('missing-place');

    const s = WA.store ? WA.store.get() : {};
    const b = (s && s.livingWorld) ? s.livingWorld : { encounters: [], livingTraces: [], characterStates: {}, vignettes: [], intersections: [], ripples: [], relationalDebts: [] };
    const ewRows = (s && s.elsewhere && Array.isArray(s.elsewhere.rows)) ? s.elsewhere.rows : [];

    const presentNPCs = ewRows.filter(function (r) {
      return r && r.place && (r.place === pl || pl.indexOf(r.place) >= 0 || r.place.indexOf(pl) >= 0);
    }).map(function (r) {
      const st = (b.characterStates && b.characterStates[r.name]) || null;
      let reunionSubtext = '';
      if (st && st.absence && st.absence.roundsAway >= 3) {
        reunionSubtext = '数日未见，再次碰面时眼神中交织着意外、局促与久别探寻';
        if (st.absence.accumulatedGratitude > 0) {
          reunionSubtext += '，怀揣此前所受之恩，举止间多了一分谨小慎微的敬重';
        }
      }
      return {
        name: r.name,
        doing: r.doing || '正伫立沉思',
        status: r.status || '寻常神色',
        worry: r.worry || '',
        occupation: (st && st.occupation) || '行民',
        vitalStrain: (st && st.vitalStrain) ? Object.assign({}, st.vitalStrain) : { weariness: 10, hunger: 10, weathering: 5 },
        belongings: (st && st.belongings) ? Object.assign({}, st.belongings) : { copper: 0, provisions: 0, tools: [] },
        intimacy: (r.romance && r.romance.intimacy) || 0,
        reunionSubtext: reunionSubtext
      };
    });

    const currentTick = b.tick || 0;
    const matchedTraces = (b.livingTraces || []).filter(function (t) {
      return t && t.place && (t.place === pl || pl.indexOf(t.place) >= 0 || rMatch(pl, t.place)) &&
        (currentTick - (t.atTick || 0) <= cfg.decayRounds);
    });

    function rMatch(a, bStr) {
      return (a && bStr && (a.indexOf(bStr) >= 0 || bStr.indexOf(a) >= 0));
    }

    const matchedVignettes = (b.vignettes || []).filter(function (v) {
      return v && v.place && (v.place === pl || rMatch(pl, v.place));
    });

    const matchedIntersections = (b.intersections || []).filter(function (i) {
      return i && i.place && (i.place === pl || rMatch(pl, i.place));
    });

    const matchedRipples = (b.ripples || []).filter(function (rp) {
      return rp && rp.place && (rp.place === pl || rMatch(pl, rp.place));
    });

    if (presentNPCs.length > 0) stat.encountersDetected++;

    return {
      ok: true,
      place: pl,
      presentNPCs: presentNPCs,
      recentTraces: matchedTraces,
      vignettes: matchedVignettes,
      intersections: matchedIntersections,
      ripples: matchedRipples
    };
  }

  function leaveTrace(place, who, detail) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const pl = cleanStr(place, 60);
    const w = cleanStr(who, 40);
    const d = cleanStr(detail, 200);
    if (!pl) return refuse('missing-place');
    if (!w) return refuse('missing-name');

    let out = null;
    WA.store.transact(function (draft) {
      const b = getBucket(draft);
      const trace = {
        id: 'trace_custom_' + Date.now(),
        place: pl,
        who: w,
        trace: d || (w + '曾在此留下细碎痕迹。温热微散，隐有声息残留。'),
        atTick: b.tick || 0,
        freshness: 100
      };
      b.livingTraces.push(trace);
      if (WA.evict && WA.evict.array) {
        WA.evict.array(b.livingTraces, 'livingWorld.livingTraces');
      }
      out = { ok: true, trace: trace };
      return true;
    }, 'livingWorld:leaveTrace');
    return out || refuse('tx-failed');
  }

  /**
   * 正文全景叙事透镜（buildBlock）：多层次白描隐喻与潜台词注入
   */
  function buildBlock(playerPlace) {
    const cfg = settings();
    if (!cfg.enabled) return '';

    const s = WA.store ? WA.store.get() : {};
    const b = (s && s.livingWorld) ? s.livingWorld : { encounters: [], livingTraces: [], characterStates: {}, vignettes: [], intersections: [], ripples: [], relationalDebts: [] };
    const ewRows = (s && s.elsewhere && Array.isArray(s.elsewhere.rows)) ? s.elsewhere.rows : [];

    const lines = [];
    const currentPeriod = DAY_PERIODS[(b.tick || 0) % DAY_PERIODS.length];
    lines.push('【时节与世情运转】此刻正值' + PERIOD_LABELS[currentPeriod] + '，天地与周遭生计各按日常流转。');

    if (ewRows.length > 0) {
      lines.push('【在场/周边人物生活实况】（角色皆有自主生计与真实生理磨损，杜绝木偶式即时刷怪）：');
      ewRows.slice(0, 6).forEach(function (r) {
        const st = (b.characterStates && b.characterStates[r.name]) || null;
        let desc = '· ' + r.name + '（身处' + (r.place || '近处') + '，身份「' + ((st && st.occupation) || '行民') + '」）：正在「' + (r.doing || '料理日常生计') + '」';

        if (st && st.vitalStrain) {
          const vs = st.vitalStrain;
          const strainDescs = [];
          if (vs.weariness >= 50) strainDescs.push('眉眼带深重疲态');
          else if (vs.weariness >= 25) strainDescs.push('略有困顿倦色');
          if (vs.hunger >= 40) strainDescs.push('唇角略显干裂');
          if (vs.weathering >= 30) strainDescs.push('衣物下摆染着奔波留下的风尘痕迹');
          if (strainDescs.length > 0) desc += '；神态「' + strainDescs.join('，') + '」';
        }

        if (st && st.belongings) {
          const bg = st.belongings;
          const bgDescs = [];
          const eco = getEconomyProfile();
          if (bg.copper > 0) {
            const unitLabel = eco.unit ? eco.unit : '单位';
            bgDescs.push('随身所余' + eco.name + '(' + bg.copper + unitLabel + ')');
          }
          if (bg.provisions > 0) bgDescs.push('备有口粮餐食');
          if (bg.tools && bg.tools.length > 0) bgDescs.push('随身携着' + bg.tools.join('/'));
          if (bg.keepsakes && bg.keepsakes.length > 0) bgDescs.push('妥帖收着' + bg.keepsakes.join('/'));
          if (bgDescs.length > 0) desc += '；随身行囊[' + bgDescs.join('，') + ']';
        }

        if (st && st.absence && st.absence.roundsAway >= 3) {
          desc += '；【久别重逢心理重力】数轮未见，神情间带久别情怯与探询';
          if (st.absence.accumulatedGratitude > 0) desc += '，暗自记着照拂恩义';
        }

        if (r.worry) desc += '；心头悬事：「' + r.worry + '」';
        lines.push(desc);
      });
    }

    // 生活窘迫与开销微情境注入
    const recentVignettes = (b.vignettes || []).slice(-2);
    if (recentVignettes.length > 0) {
      lines.push('【生活生计微情境】：');
      recentVignettes.forEach(function (v) {
        lines.push('· ' + v.name + '身处' + v.place + '，' + v.detail + '。');
      });
    }

    // NPC 横向碰撞交集与人情注入
    const recentIntersections = (b.intersections || []).slice(-2);
    if (recentIntersections.length > 0) {
      lines.push('【人物间横向生活交集】：');
      recentIntersections.forEach(function (i) {
        lines.push('· [' + i.place + '] ' + i.summary);
      });
    }

    // 局部生态涟漪注入
    const recentRipples = (b.ripples || []).slice(-2);
    if (recentRipples.length > 0) {
      lines.push('【周遭突发事态生态涟漪】：');
      recentRipples.forEach(function (rp) {
        lines.push('· 因' + rp.source + '发生「' + rp.cause + '」，周围关联人皆受波及心生动摇。');
      });
    }

    // 横向人情势能债务注入（恩义人情、嫌隙摩擦、软肋把柄）
    const recentDebts = (b.relationalDebts || []).slice(-2);
    if (recentDebts.length > 0) {
      lines.push('【人物间暗涌人情与势能债务】：');
      recentDebts.forEach(function (d) {
        let typeName = '恩义牵挂';
        if (d.type === 'grudge') typeName = '嫌隙摩擦';
        else if (d.type === 'secret') typeName = '软肋把柄';
        lines.push('· ' + d.from + ' 欠 ' + d.to + ' [' + typeName + ']：' + (d.lastReason || '日常际遇沉淀'));
      });
    }

    // 地点痕迹提炼（带物理感官细节）
    const recentTraces = (b.livingTraces || []).slice(-3);
    if (recentTraces.length > 0) {
      lines.push('【眼前与周遭生活痕迹】（感官细节）：');
      recentTraces.forEach(function (t) {
        lines.push('· [' + t.place + '] ' + t.trace);
      });
    }

    lines.push('【正文叙事法则】：角色有自己的作息、疲惫与心绪，对话与互动中须自然显露其生活痕迹、手头物什与人情牵挂，杜绝工具化响应。');
    return lines.join('\n');
  }

  function statView() {
    return Object.assign({}, stat);
  }
  function resetStat() {
    stat.ticks = 0;
    stat.encountersDetected = 0;
    stat.tracesGenerated = 0;
    stat.tracesDecayed = 0;
    stat.rumorsDiffused = 0;
    stat.strainsAccumulated = 0;
    stat.subsistenceUsed = 0;
    stat.metabolicBuys = 0;
    stat.intersectionsResolved = 0;
    stat.vignettesTriggered = 0;
    stat.trajectoriesDeflected = 0;
    stat.memoriesConsolidated = 0;
    stat.ripplesPropagated = 0;
    stat.relationalDebtsRecorded = 0;
    stat.reunionsSubtextBuilt = 0;
    stat.refused = 0;
    stat.lastReason = '';
    return { ok: true };
  }

  WA.livingWorld = {
    DAY_PERIODS: DAY_PERIODS,
    PERIOD_LABELS: PERIOD_LABELS,
    OCCUPATIONAL_ROUTINES: OCCUPATIONAL_ROUTINES,
    getSettings: settings,
    setSettings: saveSettings,
    registerRoutine: registerRoutine,
    deflectTrajectory: deflectTrajectory,
    propagateRipple: propagateRipple,
    recordRelationalDebt: recordRelationalDebt,
    consolidateLivingMemory: consolidateLivingMemory,
    autonomousTick: autonomousTick,
    detectEncounters: detectEncounters,
    leaveTrace: leaveTrace,
    buildBlock: buildBlock,
    stat: statView,
    resetStat: resetStat
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/living-world.js', { kind: 'engine', ver: '2.238.0' });
  }

  if (WA.workflow && typeof WA.workflow.register === 'function') {
    WA.workflow.register({
      id: 'livingWorld.autonomousTick',
      chain: 'after',
      order: 22,
      critical: false,
      label: '真实世界·NPC自主生活与作息演进步进',
      async run() {
        autonomousTick({});
      }
    });
  }

  if (WA.log) WA.log('info', 'engines/living-world 已加载（2.237.0）');
})();
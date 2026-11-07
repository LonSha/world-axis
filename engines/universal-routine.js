/**
 * WorldAxis engines/universal-routine.js (v2.330.0)
 * 全题材生活作息节律时钟引擎 (Universal Circadian Routine & Multi-Genre Pacing)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 世界无论何种题材，芸芸众生与凡夫修士皆受其所在世界观规律的作息驱动。
 * 彻底消除题材硬编码，抽象为普适的八大作息区间（Slots）：
 *  1. dawn (拂晓/破晓/晨课/早班)
 *  2. morning (晨间/上午正事/论道授业/营生劳作)
 *  3. noon (正午/午膳/打坐调息/工休停滞)
 *  4. afternoon (午后/历练/事务交接/商业经营)
 *  5. dusk (日落/黄昏/归途/卸货收摊)
 *  6. evening (夜幕/夜肆/晚自习/论剑切磋)
 *  7. night (深夜/就寝/入定修行/地下黑市)
 *  8. midnight (子夜/梦魇/宵禁巡逻/深层静息)
 *
 * 核心 API：
 *  - registerActorRoutine(actorId, archetype, scheduleConfig)
 *  - evaluateActorRoutine(actorId, currentHour)
 *  - setActorDeviation(actorId, deviationKind, customActivity)
 *  - clearActorDeviation(actorId)
 *  - getActorScheduleStatus(actorId)
 */
'use strict';

(function () {
  const root = typeof window !== 'undefined' ? window : global;
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  WA.engines = WA.engines || {};

  const VERSION = '2.330.0';

  const TIME_SLOTS = Object.freeze([
    { id: 'dawn', label: '拂晓破晓', hours: [5, 6, 7] },
    { id: 'morning', label: '晨间正务', hours: [8, 9, 10, 11] },
    { id: 'noon', label: '正午小憩', hours: [12, 13] },
    { id: 'afternoon', label: '午后营生', hours: [14, 15, 16, 17] },
    { id: 'dusk', label: '黄昏收工', hours: [18, 19] },
    { id: 'evening', label: '夜晚消遣', hours: [20, 21, 22] },
    { id: 'night', label: '深夜静息', hours: [23, 0, 1] },
    { id: 'midnight', label: '子夜深眠', hours: [2, 3, 4] }
  ]);

  // 全题材通用身份模板集
  const ARCHETYPES = Object.freeze({
    // 现代都市/学生/打工人
    modern_standard: {
      dawn: { activity: '晨起洗漱，赶赴通勤载具', defaultZone: 'transit_hub' },
      morning: { activity: '工位打卡劳作或教室听课研习', defaultZone: 'workplace' },
      noon: { activity: '就近用膳，工位或课桌闭目小憩', defaultZone: 'cafeteria' },
      afternoon: { activity: '密集业务对接，处理手头繁琐事务', defaultZone: 'workplace' },
      dusk: { activity: '打卡下班，步入归途或路边摊买食', defaultZone: 'commercial_street' },
      evening: { activity: '休闲娱乐、购物、聚餐或自习备考', defaultZone: 'living_area' },
      night: { activity: '洗漱放松，刷阅讯息，准备安歇', defaultZone: 'home' },
      midnight: { activity: '深层睡眠，身体代谢修复', defaultZone: 'home' }
    },
    // 玄幻修仙宗门弟子
    xianxia_disciple: {
      dawn: { activity: '卯时登顶，吞吐朝霞紫气与天地灵机', defaultZone: 'mountain_peak' },
      morning: { activity: '传功大殿听长老论道或药园灵田当值', defaultZone: 'training_hall' },
      noon: { activity: '灵膳堂进食辟谷灵米或打坐调息', defaultZone: 'dining_hall' },
      afternoon: { activity: '演武台同门切磋或执事殿接取宗门历练', defaultZone: 'martial_stage' },
      dusk: { activity: '坊市采买丹药符箓，擦拭本命法宝', defaultZone: 'sect_market' },
      evening: { activity: '藏经阁翻阅残篇古籍或向师尊请教破境法门', defaultZone: 'scripture_pavilion' },
      night: { activity: '洞府石门紧闭，点燃凝神香盘膝入定', defaultZone: 'cultivation_cave' },
      midnight: { activity: '周天大循环运转，神游太虚深层休眠', defaultZone: 'cultivation_cave' }
    },
    // 西幻城邦冒险者与平民
    fantasy_adventurer: {
      dawn: { activity: '整理轻甲磨砺剑刃，教堂晨钟祈祷', defaultZone: 'town_chapel' },
      morning: { activity: '公会告示栏承接委托，城防卫队换防巡逻', defaultZone: 'guild_hall' },
      noon: { activity: '酒馆黑面包炖菜填腹，打探密林异动', defaultZone: 'tavern' },
      afternoon: { activity: '城郊荒野探险清剿魔物或铁匠铺修理装备', defaultZone: 'wilderness' },
      dusk: { activity: '交付战利品核算赏金，街巷油灯渐次点亮', defaultZone: 'guild_hall' },
      evening: { activity: '热闹酒馆拼酒畅谈，鲁特琴吟游诗歌', defaultZone: 'tavern' },
      night: { activity: '回旅店客房清洗血渍，清点行囊战利品', defaultZone: 'inn_room' },
      midnight: { activity: '壁炉余烬微明，警觉入眠', defaultZone: 'inn_room' }
    },
    // 末世废土幸存者
    apocalypse_survivor: {
      dawn: { activity: '检查辐射读数与净水滤芯，准备启程', defaultZone: 'bunker' },
      morning: { activity: '废墟暗处潜行搜刮物资与罐头电池', defaultZone: 'ruins' },
      noon: { activity: '躲避强烈辐射尘暴，生火加热应急口粮', defaultZone: 'shelter_hideout' },
      afternoon: { activity: '废土黑市以物易物，更换防毒面罩滤盒', defaultZone: 'black_market' },
      dusk: { activity: '在变异夜行怪物苏醒前紧急撤回避难所', defaultZone: 'checkpoint' },
      evening: { activity: '加固铁丝网与警戒陷阱，擦拭改装枪械', defaultZone: 'bunker' },
      night: { activity: '轮流守夜站岗，警惕变异兽与掠夺者夜袭', defaultZone: 'bunker_watch' },
      midnight: { activity: '浅层警醒睡眠，枪械压在枕下', defaultZone: 'bunker' }
    }
  });

  // 存储角色作息画像: Map<actorId, RoutineProfile>
  const _actorRoutines = new Map();

  function _cleanStr(s, max) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, max || 60);
  }

  function _getSlotByHour(hour) {
    const h = ((Number(hour) % 24) + 24) % 24;
    for (const slot of TIME_SLOTS) {
      if (slot.hours.includes(h)) return slot;
    }
    return TIME_SLOTS[1]; // 默认 morning
  }

  /**
   * 注册角色作息表
   */
  function registerActorRoutine(actorId, archetype, scheduleConfig) {
    const aid = _cleanStr(actorId);
    if (!aid) return { ok: false, reason: 'missing-actor-id' };

    const archKey = _cleanStr(archetype || 'modern_standard');
    const baseArch = ARCHETYPES[archKey] || ARCHETYPES.modern_standard;

    scheduleConfig = scheduleConfig || {};

    const profile = {
      actorId: aid,
      archetype: archKey,
      slots: Object.assign({}, baseArch, scheduleConfig.customSlots || {}),
      deviation: null, // { kind, customActivity, targetZone, expiresAt }
      willingness: Number.isFinite(Number(scheduleConfig.willingness)) ? Number(scheduleConfig.willingness) : 80,
      updatedAt: Date.now()
    };

    _actorRoutines.set(aid, profile);
    return { ok: true, actorId: aid, archetype: archKey, slotsCount: Object.keys(profile.slots).length };
  }

  /**
   * 设定角色临时作息偏离 (反骨/旷工/偷溜/突发私事)
   */
  function setActorDeviation(actorId, deviationKind, customActivity, targetZone) {
    const aid = _cleanStr(actorId);
    if (!aid || !_actorRoutines.has(aid)) {
      return { ok: false, reason: 'actor-routine-not-registered' };
    }

    const dk = _cleanStr(deviationKind);
    if (!dk) return { ok: false, reason: 'missing-deviation-kind' };

    const act = _cleanStr(customActivity, 100);
    const tz = _cleanStr(targetZone, 60);

    const profile = _actorRoutines.get(aid);
    profile.deviation = {
      kind: dk,
      customActivity: act,
      targetZone: tz,
      setAt: Date.now()
    };

    return { ok: true, actorId: aid, deviation: profile.deviation };
  }

  /**
   * 清除角色作息偏离，重回正轨
   */
  function clearActorDeviation(actorId) {
    const aid = _cleanStr(actorId);
    if (!aid || !_actorRoutines.has(aid)) {
      return { ok: false, reason: 'actor-routine-not-registered' };
    }
    const profile = _actorRoutines.get(aid);
    profile.deviation = null;
    return { ok: true, actorId: aid, cleared: true };
  }

  /**
   * 评估角色的当前作息状态
   */
  function evaluateActorRoutine(actorId, currentHour) {
    const aid = _cleanStr(actorId);
    if (!aid) return { ok: false, reason: 'missing-actor-id' };

    let profile = _actorRoutines.get(aid);
    if (!profile) {
      // 自动注册通用现代模板兜底
      registerActorRoutine(aid, 'modern_standard');
      profile = _actorRoutines.get(aid);
    }

    const hour = Number.isFinite(Number(currentHour)) ? Number(currentHour) : 9;
    const slotObj = _getSlotByHour(hour);
    const slotId = slotObj.id;

    // 优先检查偏离
    if (profile.deviation) {
      return {
        ok: true,
        actorId: aid,
        hour: hour,
        slotId: slotId,
        slotLabel: slotObj.label,
        isDeviated: true,
        deviationKind: profile.deviation.kind,
        currentActivity: profile.deviation.customActivity || '偏离既定作息的特异行动',
        targetZone: profile.deviation.targetZone || 'unspecified_zone',
        expectedActivity: (profile.slots[slotId] && profile.slots[slotId].activity) || ''
      };
    }

    const slotDef = profile.slots[slotId] || { activity: '按日常惯例行事', defaultZone: 'common_ground' };

    return {
      ok: true,
      actorId: aid,
      hour: hour,
      slotId: slotId,
      slotLabel: slotObj.label,
      isDeviated: false,
      currentActivity: slotDef.activity,
      targetZone: slotDef.defaultZone,
      archetype: profile.archetype
    };
  }

  function getActorScheduleStatus(actorId) {
    const aid = _cleanStr(actorId);
    if (!aid || !_actorRoutines.has(aid)) return null;
    const p = _actorRoutines.get(aid);
    return {
      actorId: p.actorId,
      archetype: p.archetype,
      willingness: p.willingness,
      hasDeviation: !!p.deviation,
      deviation: p.deviation
    };
  }

  function resetAll() {
    _actorRoutines.clear();
    return { ok: true, reset: true };
  }

  const engine = {
    version: VERSION,
    registerActorRoutine: registerActorRoutine,
    setActorDeviation: setActorDeviation,
    clearActorDeviation: clearActorDeviation,
    evaluateActorRoutine: evaluateActorRoutine,
    getActorScheduleStatus: getActorScheduleStatus,
    resetAll: resetAll
  };

  WA.engines.universalRoutine = engine;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
})();
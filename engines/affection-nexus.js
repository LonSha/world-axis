/**
 * WorldAxis engines/affection-nexus.js (v2.327.0)
 * 关系与心理动态演化中枢：八档柔性好感演化、质变锁微波浮动、双向修罗场开火仲裁与破锁通道
 *
 * 核心设计哲学：
 * 1. 杜绝机械死板：好感度非固定梯级僵化跳变，锁内引入情绪微波（Micro-Fluctuation）浮动，
 *    在关键阈值（19/39/59/79）前展现有血有肉的情感拉扯与犹疑。
 * 2. 意外与边缘覆盖：支持生死救援/绝密托付时的突发破锁（Emergent Breakthrough，豁免 2 次要求）；
 *    支持重大背叛/背刺时的锁位跌破与心理崩塌（Latch Fallthrough）。
 * 3. 独立轨与伴侣轨双向流转：针对工具/战友型 NPC，独立轨锁定合作，永不倒贴争宠；
 *    伴侣轨随好感提升逐步解锁占有欲、排他防御与心智锚定。
 * 4. 修罗场横纵双向开火：多 NPC 同场时，横向针对情敌（机锋讽刺/隐性使绊/直接对峙），
 *    纵向针对主角的和稀泥（端水冷淡/反弹回落/信任折损）。
 */
'use strict';

(function () {
  const WA = (typeof window !== 'undefined' && window.WorldAxis)
    ? window.WorldAxis
    : (typeof global !== 'undefined' && global.WorldAxis)
      ? global.WorldAxis
      : {};

  WA.engines = WA.engines || {};

  // 质变锁阈值常量表与默认配置
  const LATCH_TIERS = Object.freeze([
    { level: 1, threshold: 19.0, name: '熟人防线', desc: '礼貌客套与泛泛之交' },
    { level: 2, threshold: 39.0, name: '朋友防线', desc: '信任建立与日常互助' },
    { level: 3, threshold: 59.0, name: '知己防线', desc: '情感依赖与部分软肋托付' },
    { level: 4, threshold: 79.0, name: '灵魂防线', desc: '终极契合、排他独占与核心锚定' }
  ]);

  const DEFAULT_AFF_RECORD = Object.freeze({
    fondness: 0.0,            // -100.00 ~ 100.00
    track: 'independent',     // 'independent' | 'partner'
    arcana: 'Fool',           // 阿卡纳心智原型
    currentLatch: 0,          // 当前已通过的最大锁等级 (0 ~ 4)
    latchProgress: 0,         // 当前锁的破锁进度计数 (常规需 >= 2)
    latchBreakEvents: [],     // 触发破锁记录历史
    defenses: {               // 四维心智防御算子
      rationality: 0.60,      // 理性壁垒 (抵御画饼和空头承诺)
      pride: 0.50,            // 自尊防御 (抵御践踏和轻浮撩拨)
      vulnerability: 0.20,    // 脆弱度/心门敞开度 (越高越容易破防)
      attachment: 0.00        // 情感锚定度 (伴侣轨随好感增长)
    },
    rivalryTarget: null,      // 当前关注的情敌/竞争目标
    crossFireState: {         // 修罗场开火状态
      alertLevel: 0,          // 0:平静, 1:隐刺机锋, 2:利益排挤/警告, 3:正面摊牌/死斗
      waterHoldingPenalty: 0  // 针对主角端水行为的累积冷淡惩罚
    },
    lastUpdatedTurn: 0
  });

  /**
   * 基础校验与状态安全补齐（具备缺省自愈能力）
   */
  function ensureRecord(rec) {
    if (!rec || typeof rec !== 'object') {
      return JSON.parse(JSON.stringify(DEFAULT_AFF_RECORD));
    }
    const clean = Object.assign({}, DEFAULT_AFF_RECORD, rec);
    clean.fondness = typeof clean.fondness === 'number' ? clean.fondness : 0.0;
    if (typeof rec.currentLatch === 'number') {
      clean.currentLatch = Math.max(0, Math.min(4, clean.currentLatch));
    } else {
      // 缺省自愈：根据初始好感自动校准已达到的锁位
      let autoLatch = 0;
      for (let i = 0; i < LATCH_TIERS.length; i++) {
        if (clean.fondness >= LATCH_TIERS[i].threshold) {
          autoLatch = i + 1;
        } else {
          break;
        }
      }
      clean.currentLatch = autoLatch;
    }
    clean.latchProgress = typeof clean.latchProgress === 'number' ? clean.latchProgress : 0;
    clean.latchBreakEvents = Array.isArray(clean.latchBreakEvents) ? clean.latchBreakEvents.slice() : [];
    clean.defenses = Object.assign({}, DEFAULT_AFF_RECORD.defenses, clean.defenses || {});
    clean.crossFireState = Object.assign({}, DEFAULT_AFF_RECORD.crossFireState, clean.crossFireState || {});
    return clean;
  }

  /**
   * 柔性好感演化结算
   * @param {Object} currentRecord 角色当前情感记录
   * @param {number} delta 基础增减变动
   * @param {Object} options 突发上下文参数 { emergentBreak, betrayal, waterHolding, reason, arcanaBias }
   * @returns {Object} 结算结果 { nextRecord, appliedDelta, locked, message, eventTriggered }
   */
  function evolveAffection(currentRecord, delta, options) {
    const opts = options || {};
    const rec = ensureRecord(currentRecord);
    const prevFondness = rec.fondness;
    let effectiveDelta = Number(delta) || 0.0;
    let eventTriggered = null;
    let isLocked = false;
    let note = '';

    // 1. 意外处理：背叛/背刺事件 -> 锁位跌破与心理崩塌 (Latch Fallthrough)
    if (opts.betrayal) {
      rec.currentLatch = Math.max(0, rec.currentLatch - (opts.betrayalTiers || 1));
      rec.latchProgress = 0;
      rec.defenses.rationality = Math.min(1.0, rec.defenses.rationality + 0.35);
      rec.defenses.pride = Math.min(1.0, rec.defenses.pride + 0.30);
      rec.defenses.vulnerability = Math.max(0.0, rec.defenses.vulnerability - 0.40);
      rec.crossFireState.waterHoldingPenalty = 0; // 背叛直接覆盖端水矛盾，上升为核心背刺
      effectiveDelta = effectiveDelta < 0 ? effectiveDelta * 1.5 : -25.0; // 严厉暴跌
      eventTriggered = 'BETRAYAL_COLLAPSE';
      note = '遭遇重大背叛，信任质变锁跌破，理性壁垒全面强化反弹。';
    }

    // 2. 意外处理：端水和稀泥惩罚 (针对主角敷衍/摇摆的纵向反弹)
    if (opts.waterHolding) {
      rec.crossFireState.waterHoldingPenalty += 1;
      const penaltyDamp = Math.max(0.2, 1.0 - rec.crossFireState.waterHoldingPenalty * 0.25);
      if (effectiveDelta > 0) {
        effectiveDelta *= penaltyDamp; // 收益严重稀释
      } else {
        effectiveDelta *= 1.3; // 引起的不满加剧
      }
      note += (note ? ' ' : '') + '察觉到端水和稀泥行为，好感提升受阻并引发冷淡累积。';
    }

    // 3. 防御算子折减与心智过滤
    if (effectiveDelta > 0) {
      // 伴侣轨与独立轨偏置：独立轨对纯情感撩拨有天然抗性
      let trackDamp = rec.track === 'independent' ? 0.65 : 1.0;
      // 理性度削弱轻浮的好感增长，脆弱度则提供放大
      const defenseMod = Math.max(0.1, (1.0 - rec.defenses.rationality * 0.5) * (0.8 + rec.defenses.vulnerability * 0.4));
      effectiveDelta = effectiveDelta * trackDamp * defenseMod;
    }

    // 计算初拟新值
    let targetFondness = prevFondness + effectiveDelta;

    // 4. 质变锁检测与柔性微波浮动
    const nextLatchTier = LATCH_TIERS[rec.currentLatch]; // 下一道待突破的锁
    if (nextLatchTier && targetFondness >= nextLatchTier.threshold) {
      // 检查是否具备突发破锁条件（生死危机/绝密托付/牺牲救援）
      if (opts.emergentBreak) {
        rec.currentLatch += 1;
        rec.latchProgress = 0;
        rec.latchBreakEvents.push({
          level: rec.currentLatch,
          reason: opts.reason || '突发重大危机下的生死契合',
          turn: opts.turn || 0
        });
        eventTriggered = 'EMERGENT_BREAKTHROUGH';
        note += (note ? ' ' : '') + `在突发危难下突破第${rec.currentLatch}道质变锁【${nextLatchTier.name}】！`;
        // 允许直接突破限制
      } else {
        // 常规破锁逻辑：需要关键事件累积进度
        if (opts.keyMilestone) {
          rec.latchProgress += 1;
        }

        if (rec.latchProgress >= 2) {
          rec.currentLatch += 1;
          rec.latchProgress = 0;
          rec.latchBreakEvents.push({
            level: rec.currentLatch,
            reason: opts.reason || '双向共鸣与心智相通',
            turn: opts.turn || 0
          });
          eventTriggered = 'LATCH_UNLOCKED';
          note += (note ? ' ' : '') + `成功解锁第${rec.currentLatch}道质变锁【${nextLatchTier.name}】！`;
        } else {
          // 未满足破锁事件：触发【锁内微波浮动】（Micro-Fluctuation）
          // 不死板卡在阈值整数，而在临界点下方保留有生命力的细微涟漪（拉扯感）
          isLocked = true;
          const ceiling = nextLatchTier.threshold;
          const floor = ceiling - 2.50; // 微波拉扯区间 [threshold - 2.5, threshold - 0.01]
          const fluctuation = Math.sin((targetFondness + (opts.turn || 1)) * 1.5) * 0.8;
          // 若当前值本来已在当前区间下方，微波浮动不应倒推使数值暴跌
          const clampedCandidate = Math.min(ceiling - 0.05, Math.max(floor, (ceiling - 1.2) + fluctuation));
          targetFondness = Math.max(prevFondness, clampedCandidate);
          note += (note ? ' ' : '') + `受限于【${nextLatchTier.name}】，情感在临界线前犹疑拉扯（待关键契机解锁）。`;
        }
      }
    }

    // 限制在标准区间 [-100.00, 100.00]
    rec.fondness = Math.max(-100.0, Math.min(100.0, Math.round(targetFondness * 100) / 100));
    rec.lastUpdatedTurn = opts.turn || rec.lastUpdatedTurn;

    // 动态调整情感锚定防御（若好感高，伴侣轨的依恋度提升）
    if (rec.track === 'partner' && rec.fondness > 40.0) {
      rec.defenses.attachment = Math.min(1.0, 0.2 + (rec.fondness - 40.0) * 0.013);
    }

    return {
      nextRecord: rec,
      appliedDelta: Math.round((rec.fondness - prevFondness) * 100) / 100,
      locked: isLocked,
      eventTriggered: eventTriggered,
      message: note || '情感动态演化平稳。'
    };
  }

  /**
   * 双轨迁移仲裁（独立战友轨 <-> 伴侣依恋轨）
   */
  function switchTrack(record, newTrack, reason) {
    const rec = ensureRecord(record);
    if (newTrack !== 'partner' && newTrack !== 'independent') {
      return { success: false, reason: '无效的目标轨迹类型', record: rec };
    }
    if (rec.track === newTrack) {
      return { success: true, modified: false, record: rec };
    }
    rec.track = newTrack;
    if (newTrack === 'independent') {
      // 转为独立轨：清退排他占有度，重置修罗场警报
      rec.defenses.attachment = Math.max(0.0, rec.defenses.attachment - 0.3);
      rec.crossFireState.alertLevel = 0;
      rec.rivalryTarget = null;
    } else {
      // 转为伴侣轨：释放依恋潜力
      rec.defenses.vulnerability = Math.min(1.0, rec.defenses.vulnerability + 0.15);
    }
    return {
      success: true,
      modified: true,
      reason: reason || '剧情事件导致角色定位轨迹变更',
      record: rec
    };
  }

  /**
   * 修罗场横纵双向开火仲裁（多 NPC 同场交互）
   * @param {Object} selfRecord 当前角色的情感记录
   * @param {Object} rivalRecord 竞争对手的情感记录
   * @param {Object} context 同场环境 { playerIntimacyWithRival, isSecret, turn }
   * @returns {Object} 仲裁结果 { alertLevel, lateralAction, longitudinalPenalty, stance }
   */
  function arbitrateCrossFire(selfRecord, rivalRecord, context) {
    const self = ensureRecord(selfRecord);
    const ctx = context || {};

    // 独立战友轨对争宠修罗场免疫，不主动开火
    if (self.track === 'independent') {
      return {
        alertLevel: 0,
        lateralAction: 'NONE',
        longitudinalPenalty: 0,
        stance: '保持专业距离与客观合作，不参与情感倾轧。'
      };
    }

    const rival = rivalRecord ? ensureRecord(rivalRecord) : null;
    const selfFondness = self.fondness;
    const rivalFondness = rival ? rival.fondness : 0;
    const playerBias = ctx.playerIntimacyWithRival || 0; // 主角对情敌的主动亲密举动

    let alertLevel = 0;
    let lateralAction = 'NONE';
    let longitudinalPenalty = 0;
    let stance = '';

    // 触发判定：当前角色好感达到朋友防线（>39），且情敌具备实质威胁
    if (selfFondness >= 39.0 && (rivalFondness >= 25.0 || playerBias > 0)) {
      if (selfFondness >= 79.0 || (selfFondness > 60.0 && playerBias >= 20.0)) {
        // Ⅲ级：正面摊牌/死斗/绝不让步
        alertLevel = 3;
        lateralAction = 'FRONTAL_CONFRONTATION';
        longitudinalPenalty = playerBias > 0 ? 5.0 : 2.0;
        stance = '排他占有欲达到顶峰，横向对敌形成冰冷压制，纵向对主角的和稀泥绝不妥协。';
      } else if (selfFondness >= 59.0 || playerBias > 10.0) {
        // Ⅱ级：利益排挤/宣誓主权/软性警告
        alertLevel = 2;
        lateralAction = 'TERRITORY_CLAIM';
        longitudinalPenalty = playerBias > 0 ? 2.5 : 1.0;
        stance = '有意识地宣示主权与过往默契，制造排他氛围，对主角投去探究与施压眼神。';
      } else {
        // Ⅰ级：微讽机锋/拆台挑刺
        alertLevel = 1;
        lateralAction = 'SUBTLE_SARCASM';
        longitudinalPenalty = 0.5;
        stance = '言辞微带机锋挑刺，表面礼貌但暗含拆台，观察主角反应。';
      }
    } else {
      stance = '心态平和，虽有觉察但未上升为实质排他戒备。';
    }

    self.crossFireState.alertLevel = alertLevel;
    return {
      alertLevel: alertLevel,
      lateralAction: lateralAction,
      longitudinalPenalty: longitudinalPenalty,
      stance: stance
    };
  }

  /**
   * 提示词注入构建器（对齐 WorldAxis 规范）
   */
  function buildBlock(record, charName) {
    if (!record) return '';
    const rec = ensureRecord(record);
    const name = charName || '角色';
    const latchName = rec.currentLatch > 0 ? LATCH_TIERS[rec.currentLatch - 1].name : '无';
    const nextTier = LATCH_TIERS[rec.currentLatch];

    const lines = [
      `【${name}·心理与情感中枢】`,
      `• 好感刻度: ${rec.fondness.toFixed(2)}/100.00 | 轨迹: ${rec.track === 'partner' ? '伴侣依恋轨' : '独立协作轨'} | 心智原型: ${rec.arcana}`,
      `• 关系防线: 已解锁【${latchName}】${nextTier ? ` | 下级质变门槛【${nextTier.name}】(${nextTier.threshold.toFixed(1)})` : ' (已达顶峰)'}`,
      `• 心智算子: 理性壁垒 ${(rec.defenses.rationality * 100).toFixed(0)}% | 自尊防御 ${(rec.defenses.pride * 100).toFixed(0)}% | 脆弱敞开 ${(rec.defenses.vulnerability * 100).toFixed(0)}%`
    ];

    if (rec.track === 'partner' && rec.crossFireState.alertLevel > 0) {
      lines.push(`• 修罗场警备: ${rec.crossFireState.alertLevel}级警戒 | 严禁主角端水和稀泥，排他性行为已激活`);
    }

    return lines.join('\n');
  }

  // 注册至 WorldAxis 引擎总线
  WA.affectionNexus = {
    ensureRecord: ensureRecord,
    evolveAffection: evolveAffection,
    switchTrack: switchTrack,
    arbitrateCrossFire: arbitrateCrossFire,
    buildBlock: buildBlock,
    LATCH_TIERS: LATCH_TIERS.slice()
  };
})();

/**
 * WorldAxis engines/intimate-arbiter.js (v2.327.0)
 * 亲密生理与物理弹性仲裁器：三腔解剖口径、流体动力阻力、柔性意外与突发中断仲裁
 *
 * 核心设计哲学：
 * 1. 拒绝冰冷死板查表：不仅进行几何尺寸判定，更将生理体液润滑、肌肉心理放松度深度融合，
 *    使快感、疼痛与耐力成为动态波动的连续体验。
 * 2. 多重突发意外覆盖：
 *    - 【润滑不足/心理紧绷】：摩擦阻力剧增，快感骤降 70%，疼痛撕裂风险上升。
 *    - 【突发惊扰/外部打断】：脚步声、敲门、警报触发强制中断，进入应急紧绷态。
 *    - 【激烈滑脱与锁结卡死】：姿势激烈或角度偏差造成滑脱；特殊器官（膨大结）触发闭锁状态。
 *    - 【超限自卫与痉挛推拒】：过大尺寸或强行顶撞诱发非自主腹肌痉挛与自卫保护机制。
 * 3. 异质宽容与缺省自愈：支持异种（魅魔、史莱姆、神圣非人）体质自适应宽容，免除人类受损限制；
 *    所有输入字段具备平滑缺省兜底，杜绝 NaN 与未定义崩溃。
 */
'use strict';

(function () {
  const WA = window.WorldAxis = window.WorldAxis || {};

  WA.engines = WA.engines || {};

  // 解剖口径默认参数基准（单位：厘米 cm）
  const CAVITY_DEFAULTS = Object.freeze({
    vaginal: {
      depthBaseline: 9.5,      // 常态深度 D0
      stretchCoeff: 1.30,      // 兴奋延展系数 k
      fornixBuffer: 2.0,       // 后穹隆缓冲底 F
      caliperBaseline: 2.8,    // 基础适配直径
      elasticLimit: 5.5        // 人类生理弹性极限直径
    },
    anal: {
      depthBaseline: 13.0,
      stretchCoeff: 1.15,
      fornixBuffer: 0.5,
      caliperBaseline: 2.4,
      elasticLimit: 4.8
    },
    oral: {
      depthBaseline: 11.0,
      stretchCoeff: 1.10,
      fornixBuffer: 1.0,
      caliperBaseline: 3.2,
      elasticLimit: 5.0
    }
  });

  const DEFAULT_INTIMATE_STATE = Object.freeze({
    cavity: 'vaginal',         // 'vaginal' | 'anal' | 'oral'
    arousal: 0.0,              // 兴奋度 0.0 ~ 100.0
    lubrication: 0.5,          // 润滑度 0.0 (干涩) ~ 1.0 (湿润充盈)
    relaxation: 0.6,           // 放松度 0.0 (极度紧绷) ~ 1.0 (完全接纳)
    pleasure: 0.0,             // 累积快感 0.0 ~ 100.0
    stamina: 100.0,            // 剩余耐力 0.0 ~ 100.0
    orgasmCount: 0,            // 达到高潮次数
    lockedState: null,         // 锁结卡死状态 { locked: boolean, remainingDuration: number }
    interrupted: false,        // 是否遭遇突发打断
    interruptionReason: '',
    traits: []                 // 特殊体质：如 'succubus', 'slime', 'non_human', 'athletic'
  });

  /**
   * 确保状态数据安全完整
   */
  function ensureIntimateState(state) {
    if (!state || typeof state !== 'object') {
      return JSON.parse(JSON.stringify(DEFAULT_INTIMATE_STATE));
    }
    const clean = Object.assign({}, DEFAULT_INTIMATE_STATE, state);
    clean.arousal = typeof clean.arousal === 'number' ? Math.max(0, Math.min(100, clean.arousal)) : 0.0;
    clean.lubrication = typeof clean.lubrication === 'number' ? Math.max(0, Math.min(1.0, clean.lubrication)) : 0.5;
    clean.relaxation = typeof clean.relaxation === 'number' ? Math.max(0, Math.min(1.0, clean.relaxation)) : 0.6;
    clean.pleasure = typeof clean.pleasure === 'number' ? Math.max(0, Math.min(100, clean.pleasure)) : 0.0;
    clean.stamina = typeof clean.stamina === 'number' ? Math.max(0, Math.min(100, clean.stamina)) : 100.0;
    clean.orgasmCount = typeof clean.orgasmCount === 'number' ? clean.orgasmCount : 0;
    clean.traits = Array.isArray(clean.traits) ? clean.traits.slice() : [];
    return clean;
  }

  /**
   * 判定插入物物理与解剖匹配几何
   * @param {Object} cavityParams 腔体基准数据
   * @param {Object} inserter 插入物参数 { length, diameter, shape: 'regular'|'graded'|'knot', tipDiameter, baseDiameter }
   * @param {number} arousal 兴奋度
   * @param {Array} traits 角色特质
   */
  function calculateGeometry(cavityType, inserter, arousal, traits) {
    const baseline = CAVITY_DEFAULTS[cavityType] || CAVITY_DEFAULTS.vaginal;
    const isNonHuman = traits && (traits.includes('succubus') || traits.includes('slime') || traits.includes('non_human'));

    // 延展计算：兴奋度提升带来腔体深度延展
    const arousalFactor = 1.0 + (arousal / 100.0) * (baseline.stretchCoeff - 1.0);
    const dAct = baseline.depthBaseline * (isNonHuman ? arousalFactor * 1.3 : arousalFactor);
    const dReach = dAct + baseline.fornixBuffer;

    // 有效直径判定（常规形取单一值，梯度形取均值加权，异形考虑膨大部）
    let effectiveDiameter = inserter.diameter || 3.2;
    if (inserter.shape === 'graded') {
      const tip = inserter.tipDiameter || effectiveDiameter * 0.8;
      const base = inserter.baseDiameter || effectiveDiameter * 1.2;
      effectiveDiameter = (tip * 0.4) + (base * 0.6);
    } else if (inserter.shape === 'knot') {
      effectiveDiameter = Math.max(effectiveDiameter, (inserter.knotDiameter || effectiveDiameter * 1.35));
    }

    const effectiveLength = inserter.length || 14.0;

    // 口径匹配倍率
    const caliperRatio = effectiveDiameter / baseline.caliperBaseline;
    let caliberCategory = 'fit';
    if (caliperRatio < 0.85) caliberCategory = 'loose';
    else if (caliperRatio <= 1.05) caliberCategory = 'fit';
    else if (caliperRatio <= 1.25) caliberCategory = 'tight';
    else if (caliperRatio <= 1.45) caliberCategory = 'filled';
    else caliberCategory = 'overstretched';

    // 宫颈与深处压迫深度
    const cervicalOverhang = Math.max(0, effectiveLength - dAct);

    return {
      dAct: Math.round(dAct * 10) / 10,
      dReach: Math.round(dReach * 10) / 10,
      effectiveDiameter: Math.round(effectiveDiameter * 10) / 10,
      effectiveLength: effectiveLength,
      caliperRatio: Math.round(caliperRatio * 100) / 100,
      caliberCategory: caliberCategory,
      cervicalOverhang: Math.round(cervicalOverhang * 10) / 10,
      isNonHuman: isNonHuman
    };
  }

  /**
   * 亲密交互回合弹性仲裁
   * @param {Object} currentState 角色当前生理状态
   * @param {Object} inserter 插入物与动作参数 { length, diameter, shape, velocity, angle, knotEngaged }
   * @param {Object} context 突发上下文 { externalDisturbance, forceLevel, lubricantAdded }
   * @returns {Object} 仲裁结果 { nextState, feedback, orgasmTriggered, slipOut, spasmDefense }
   */
  function arbitrateIntimacy(currentState, inserter, context) {
    const state = ensureIntimateState(currentState);
    const ctx = context || {};
    const ins = inserter || { length: 13.5, diameter: 3.3, shape: 'regular' };
    const notes = [];

    // 1. 突发意外：外部突发惊扰（脚步声、敲门、警报）
    if (ctx.externalDisturbance) {
      state.interrupted = true;
      state.interruptionReason = ctx.externalDisturbanceReason || '外部突发异响打断';
      state.relaxation = Math.max(0.1, state.relaxation - 0.4); // 惊吓紧绷
      return {
        nextState: state,
        feedback: `【突发打断】因「${state.interruptionReason}」，亲密交互被强制中止，角色神经紧绷戒备。`,
        orgasmTriggered: false,
        slipOut: true,
        spasmDefense: false,
        interrupted: true
      };
    }

    // 2. 润滑剂补给或自然分泌演进
    if (ctx.lubricantAdded) {
      state.lubrication = Math.min(1.0, state.lubrication + 0.4);
      notes.push('人工润滑剂介入，干涩感大幅缓解。');
    } else {
      // 兴奋带来自然润滑
      state.lubrication = Math.min(1.0, state.lubrication + (state.arousal / 100.0) * 0.08);
    }

    // 3. 几何与解剖口径测算
    const geo = calculateGeometry(state.cavity, ins, state.arousal, state.traits);

    // 4. 意外检查：激烈抽插姿势偏角导致的【脱出/滑脱】（Slip Out）
    let isSlipOut = false;
    if (ins.velocity === 'extreme' && !state.lockedState && WA.rand.next('intimate-arbiter') < 0.15) {
      isSlipOut = true;
      notes.push('由于动作剧烈且角度偏差，插入物意外滑脱，节奏短暂脱节。');
    }

    // 5. 意外检查：超限尺寸与剧痛自卫【痉挛推拒】（Spasm Defense）
    let isSpasm = false;
    if (geo.caliperRatio > 1.55 && !geo.isNonHuman && state.relaxation < 0.5) {
      isSpasm = true;
      state.relaxation = Math.max(0.05, state.relaxation - 0.2);
      state.stamina = Math.max(0, state.stamina - 15.0);
      notes.push('口径显著超出生理耐受极限，盆底与腹肌引发非自主强烈痉挛，触发本能推拒自卫！');
    }

    // 6. 意外检查：犬科/特殊异形【锁结闭锁】（Knotting Lock）
    if (ins.shape === 'knot' && ins.knotEngaged && !isSlipOut) {
      if (!state.lockedState) {
        state.lockedState = { locked: true, remainingTurns: 3 };
        notes.push('膨大锁结完全契合卡死，局部腔体形成强力闭锁嵌顿，短时间内无法脱离。');
      }
    }
    if (state.lockedState) {
      state.lockedState.remainingTurns -= 1;
      if (state.lockedState.remainingTurns <= 0) {
        state.lockedState = null;
        notes.push('锁结膨胀逐渐消退，闭锁解除恢复自由。');
      }
    }

    // 7. 快感与耐力损耗综合结算
    let pleasureDelta = 0;
    let staminaCost = 5.0;

    if (!isSlipOut && !isSpasm) {
      // 基础快感按贴合档位计算
      const ratioMap = { loose: 0.6, fit: 1.0, tight: 1.35, filled: 1.55, overstretched: 0.9 };
      let caliberBonus = ratioMap[geo.caliberCategory] || 1.0;

      // 意外惩罚：若润滑不足（干涩）或心理紧绷，快感大打折扣，转化为不适与疼痛
      if (state.lubrication < 0.35 || state.relaxation < 0.3) {
        caliberBonus *= 0.3; // 快感折损 70%
        staminaCost += 8.0;
        notes.push('润滑不足且心理未完全放松，干涩摩擦带来痛楚与阻力。');
      } else {
        // 良好契合与深度压迫带来快感爆发
        if (geo.cervicalOverhang > 0) {
          caliberBonus += 0.4;
          notes.push(`深度触及腔底敏感穹隆（压迫深延 ${geo.cervicalOverhang}cm），带来深层刺激反馈。`);
        }
      }

      pleasureDelta = 12.0 * caliberBonus;
      state.arousal = Math.min(100.0, state.arousal + 10.0);
    }

    state.pleasure = Math.min(100.0, state.pleasure + pleasureDelta);
    state.stamina = Math.max(0.0, state.stamina - staminaCost);

    // 8. 高潮触发判定（达到 90 且耐力尚未完全耗尽）
    let orgasmTriggered = false;
    if (state.pleasure >= 88.0) {
      orgasmTriggered = true;
      state.orgasmCount += 1;
      state.pleasure = 20.0; // 高潮后回落至温和余韵
      state.stamina = Math.max(0, state.stamina - 20.0);
      state.relaxation = Math.min(1.0, state.relaxation + 0.3); // 潮吹高潮后全身肌肉放松
      notes.push(`【绝顶高潮】快感累积冲破临界，身体剧烈颤抖迎来第${state.orgasmCount}次高潮痉挛释放！`);
    }

    return {
      nextState: state,
      feedback: notes.join(' ') || '亲密物理交互平稳进行中。',
      geometry: geo,
      orgasmTriggered: orgasmTriggered,
      slipOut: isSlipOut,
      spasmDefense: isSpasm,
      interrupted: false
    };
  }

  /**
   * 提示词注入文本构建
   */
  function buildBlock(state, charName) {
    if (!state) return '';
    const s = ensureIntimateState(state);
    const name = charName || '角色';

    const lines = [
      `【${name}·亲密生理与物理状态】`,
      `• 当前腔位: ${s.cavity} | 润滑充盈度: ${(s.lubrication * 100).toFixed(0)}% | 心理放松度: ${(s.relaxation * 100).toFixed(0)}%`,
      `• 快感蓄积: ${s.pleasure.toFixed(1)}/100.0 (高潮已计: ${s.orgasmCount}次) | 体能残余: ${s.stamina.toFixed(1)}%`
    ];

    if (s.lockedState) {
      lines.push(`• 物理锁死: 处于锁结嵌顿状态（强制连接中）`);
    }
    if (s.interrupted) {
      lines.push(`• 警戒状态: 亲密已被中断（${s.interruptionReason}），情绪紧绷抗拒强行继续`);
    }

    return lines.join('\n');
  }

  // 挂载至 WorldAxis 引擎总线
  WA.intimateArbiter = {
    ensureIntimateState: ensureIntimateState,
    calculateGeometry: calculateGeometry,
    arbitrateIntimacy: arbitrateIntimacy,
    buildBlock: buildBlock,
    CAVITY_DEFAULTS: CAVITY_DEFAULTS
  };
})();
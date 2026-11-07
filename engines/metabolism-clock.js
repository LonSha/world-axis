/**
 * WorldAxis engines/metabolism-clock.js (v2.329.0)
 * 生理代谢、疲劳负荷与环境体温/醉酒时钟引擎 (Metabolism & Biological Clock)
 *
 * ── 定位与边界（精准避让生态位重叠）─────────────────────────────────────
 *   1. 避让 LonSha 记忆插件：本模块不记录对话记忆、事实提取、知识图谱与向量检索；
 *   2. 避让 RubyPhone 手机插件：本模块不提供通讯录、社交朋友圈、群聊界面与手机应用生态；
 *   3. 专注硬核生理物理规律：
 *      - 熬夜与疲劳时钟（醒觉时长累计、困倦阶段惩罚、睡眠恢复计算）；
 *      - 环境失温与体温失衡（联动天气 rain/snow/storm，缺乏遮蔽或失温导致的体质磨损）；
 *      - 酒精吸收与指数衰减代谢（居酒屋/酒肆饮酒后的 BAC 衰减、吐真言倾向、酩酊醉酒判定）。
 */
(function () {
  'use strict';
  const WA = (typeof window !== 'undefined' ? window.WorldAxis : (global.WorldAxis = global.WorldAxis || {}));
  const LS_KEY = 'worldaxis_metabolism_clock_settings_v1';
  const DEF = {
    enabled: true,
    fatigueRatePerHour: 4.2,      // 每醒觉 1 小时增加疲劳点数（0~100）
    alcoholMetabolismRatePerHour: 15.0, // 每小时代谢酒精点数（BAC）
    hypothermiaThreshold: 30       // 暴露恶劣天气下的失温危险线
  };

  const __REG = { key: LS_KEY, def: DEF, module: 'metabolismClock' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
  }

  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // 内部生理状态台账 (按角色聚合)
  // characterId -> { awakeHours, fatigue, alcoholBac, bodyTempState, lastUpdateHour }
  const characterVitals = {};

  const metabolismClock = {
    version: '2.329.0',
    settings: settings,

    /**
     * 获取或初始化角色生理时钟状态
     */
    getVitals: function (characterId) {
      if (!characterId) return null;
      if (!characterVitals[characterId]) {
        characterVitals[characterId] = {
          characterId: characterId,
          awakeHours: 10,       // 默认清醒 10 小时
          fatigue: 20,          // 基础微弱疲劳 (0~100)
          alcoholBac: 0,        // 血液酒精指数 0
          bodyTemp: 'normal',   // normal | chilled (受寒) | hypothermic (失温) | fever (发热)
          lastMealHoursAgo: 4   // 距上一餐时长
        };
      }
      return characterVitals[characterId];
    },

    /**
     * 结算生理时钟推进（随时间流逝）
     * @param {string} characterId
     * @param {number} elapsedHours
     * @param {Object} context { sleeping: boolean, drinkingUnits: number, weather: string, sheltered: boolean }
     */
    advanceClock: function (characterId, elapsedHours, context) {
      const v = this.getVitals(characterId);
      if (!v) return null;
      const hours = Math.max(0.1, Number(elapsedHours) || 1);
      const ctx = context || {};

      if (ctx.sleeping) {
        // 睡眠中：消除疲劳与恢复精神
        v.fatigue = Math.max(0, v.fatigue - hours * 12.5); // 8小时大约消除 100 疲劳
        v.awakeHours = 0;
      } else {
        // 清醒中：累积清醒时长与疲劳
        v.awakeHours += hours;
        v.fatigue = Math.min(100, v.fatigue + hours * DEF.fatigueRatePerHour);
      }

      // 酒精代谢
      if (ctx.drinkingUnits) {
        v.alcoholBac = Math.min(100, v.alcoholBac + ctx.drinkingUnits * 25);
      }
      if (v.alcoholBac > 0) {
        v.alcoholBac = Math.max(0, v.alcoholBac - hours * DEF.alcoholMetabolismRatePerHour);
      }

      // 环境体温侵蚀（雨雪天气 + 无遮蔽/失温）
      if (!ctx.sheltered && (ctx.weather === 'rain' || ctx.weather === 'snow' || ctx.weather === 'storm')) {
        if (v.bodyTemp === 'normal') v.bodyTemp = 'chilled';
        else if (v.bodyTemp === 'chilled' && hours >= 1.5) v.bodyTemp = 'hypothermic';
      } else if (ctx.sheltered) {
        if (v.bodyTemp === 'hypothermic') v.bodyTemp = 'chilled';
        else if (v.bodyTemp === 'chilled') v.bodyTemp = 'normal';
      }

      return this.evaluateState(characterId);
    },

    /**
     * 评定当前生理负荷与判定修正
     */
    evaluateState: function (characterId) {
      const v = this.getVitals(characterId);
      if (!v) return null;

      // 疲劳阶段
      let fatigueTier = 'fresh';
      let fatigueDesc = '精力充沛';
      if (v.fatigue >= 80 || v.awakeHours >= 24) {
        fatigueTier = 'exhausted';
        fatigueDesc = '极度透支，眼皮沉重，随时可能失去知觉昏睡';
      } else if (v.fatigue >= 55 || v.awakeHours >= 16) {
        fatigueTier = 'tired';
        fatigueDesc = '疲态尽显，反应迟钝，注意力出现明显涣散';
      } else if (v.fatigue >= 35) {
        fatigueTier = 'weary';
        fatigueDesc = '微有困意与轻度倦怠';
      }

      // 醉酒阶段
      let alcoholTier = 'sober';
      let alcoholDesc = '神智完全清醒';
      if (v.alcoholBac >= 75) {
        alcoholTier = 'blackout';
        alcoholDesc = '酩酊大醉，步履蹒跚，意识断片边缘';
      } else if (v.alcoholBac >= 45) {
        alcoholTier = 'drunk';
        alcoholDesc = '明显醉意，言辞放肆，防备心理大幅下降（容易吐露真言）';
      } else if (v.alcoholBac >= 20) {
        alcoholTier = 'tipsy';
        alcoholDesc = '面色微红，微醺兴奋，情绪被放大';
      }

      // 体温失衡警告
      let tempDesc = '体温正常';
      if (v.bodyTemp === 'hypothermic') {
        tempDesc = '全身湿透冰凉，嘴唇发紫打颤，陷入危险的低温失温状态';
      } else if (v.bodyTemp === 'chilled') {
        tempDesc = '衣衫受潮发凉，瑟瑟发抖';
      }

      return {
        characterId: characterId,
        fatigue: Math.round(v.fatigue),
        awakeHours: Math.round(v.awakeHours * 10) / 10,
        fatigueTier: fatigueTier,
        fatigueDesc: fatigueDesc,
        alcoholBac: Math.round(v.alcoholBac),
        alcoholTier: alcoholTier,
        alcoholDesc: alcoholDesc,
        bodyTemp: v.bodyTemp,
        tempDesc: tempDesc,
        actionPenalty: (fatigueTier === 'exhausted' ? 0.4 : (fatigueTier === 'tired' ? 0.2 : 0.0))
      };
    },

    /**
     * 生成反哺正文的生理透镜描述块
     */
    buildVitalsFeed: function (characterId) {
      const st = this.evaluateState(characterId);
      if (!st) return '';
      // 只有产生异常（疲劳、醉酒、受寒）时才注入正文，避免无谓占用 token
      const abnormal = st.fatigueTier !== 'fresh' || st.alcoholTier !== 'sober' || st.bodyTemp !== 'normal';
      if (!abnormal) return '';

      const lines = [`【${st.characterId} · 生理代谢与身体状态】`];
      if (st.fatigueTier !== 'fresh') lines.push(`· 疲劳负荷: [${st.fatigueTier}] ${st.fatigueDesc}（已醒觉 ${st.awakeHours}h）`);
      if (st.alcoholTier !== 'sober') lines.push(`· 酒精反应: [${st.alcoholTier}] ${st.alcoholDesc}`);
      if (st.bodyTemp !== 'normal') lines.push(`· 体温环境: [${st.bodyTemp}] ${st.tempDesc}`);
      return lines.join('\n');
    },

    /**
     * OPV16-1: 施加微观极端环境代偿负荷 (Microclimate & Hazard Compensation)
     * 在极寒、酷暑、毒瘴环境下，生物体维持体征将以 2~4 倍速率加速消耗卡路里与体力储备
     */
    applyHazardLoad: function (characterId, hazardType, severity, durationHours, opts) {
      const v = this.getVitals(characterId);
      if (!v) return { ok: false, error: 'character_not_found' };

      const sev = typeof severity === 'number' ? Math.max(0, severity) : 1;
      const dur = typeof durationHours === 'number' ? Math.max(0, durationHours) : 1;
      const opt = opts || {};

      // 负控制拦截：环境负荷为 0 或角色身处密封恒温恒湿仓时，绝不产生加速代偿消耗
      if (sev === 0 || opt.insulated === true) {
        return {
          ok: true,
          characterId: characterId,
          hazardType: hazardType,
          acceleratedDrain: 0,
          fatigue: v.fatigue,
          bodyTemp: v.bodyTemp,
          message: 'Zero hazard or fully insulated; no metabolic compensation needed.'
        };
      }

      // 代偿乘数：根据险阻类型加速体力透支
      let drainMultiplier = 1.0 + (sev * 0.7); // 1.7x ~ 4.5x
      // 防具装备御寒/防毒绝缘抵消
      const insulation = typeof opt.thermalInsulation === 'number' ? Math.max(0, Math.min(1.0, opt.thermalInsulation)) : 0;
      drainMultiplier = Math.max(1.0, drainMultiplier * (1.0 - insulation));

      const addedFatigue = Math.round(DEF.fatigueRatePerHour * dur * drainMultiplier * 10) / 10;
      v.fatigue = Math.min(100, Math.round((v.fatigue + addedFatigue) * 10) / 10);

      // 体温与失衡判定
      if (hazardType === 'cold') {
        if (sev >= 3 && insulation < 0.5) {
          v.bodyTemp = v.fatigue >= 80 ? 'frozen' : 'hypothermia';
        } else if (sev >= 1) {
          v.bodyTemp = 'chilled';
        }
      } else if (hazardType === 'heat') {
        if (sev >= 3) v.bodyTemp = 'heatstroke';
        else if (sev >= 1) v.bodyTemp = 'feverish';
      }

      const st = this.evaluateState(characterId);
      return {
        ok: true,
        characterId: characterId,
        hazardType: hazardType,
        severity: sev,
        durationHours: dur,
        drainMultiplier: Math.round(drainMultiplier * 100) / 100,
        addedFatigue: addedFatigue,
        currentFatigue: v.fatigue,
        fatigueTier: st.fatigueTier,
        bodyTemp: v.bodyTemp,
        isFainted: v.fatigue >= 95
      };
    },

    diagnose: function () {
      return {
        version: this.version,
        trackedCharacters: Object.keys(characterVitals).length
      };
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = metabolismClock;
  }
  WA.metabolismClock = metabolismClock;
})();

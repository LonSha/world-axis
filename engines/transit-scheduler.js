/**
 * WorldAxis engines/transit-scheduler.js (v2.328.0)
 * 多模态通勤与深夜滞留仲裁引擎 (Multi-modal Transit & Stranded Arbiter)
 *
 * 核心机制：
 * 1. 三模态交通网络换算：
 *    - 徒步 (Foot): 速度约 4.5km/h (考虑街巷折返 1.3)，消耗体能与饱腹度，不受停运限制；
 *    - 骨干网 (Transit / 电车 / 地铁 / 班车): 速度约 35km/h，极低费用，但受发车时间窗限制（默认 05:30 - 24:30）；
 *    - 点对点载具 (Taxi / 专车 / 乘骑): 速度约 25~40km/h，高额开销，夜间加收 20%~30%，全天候但可能遇到堵车。
 * 2. 城市深夜滞留仲裁 (Stranded Arbiter)：
 *    - 当剧情世界时间进入末班车停运期（00:30~05:30），且角色距离归宿/据点远于阈值（默认 > 2.5km），且无法负担昂贵直达载具时：
 *      强制触发 `stranded: true`（滞留状态），仲裁出可行的应急避难去处（24h漫画网咖/通宵快餐店/街头避寒/向同城好友求留宿）；
 *    - 强力催生深夜求助、意外借宿、街头相依为命等顶级戏剧张力！
 * 3. 恶劣天气阻滞惩罚 (Weather Impedance): 暴雨、大雪、大雾时自动换算延误倍率。
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  WA.engines = WA.engines || {};

  const VERSION = '2.328.0';

  const DEFAULT_TRANSIT_CONFIG = Object.freeze({
    transitOpenHour: 5.5,    // 05:30 首班车
    transitCloseHour: 24.5,  // 00:30 末班车停运
    footSpeedKmH: 4.5,
    footDetourFactor: 1.3,
    transitSpeedKmH: 35.0,
    transitBaseFare: 150,    // 基础票价（如日元/铜钱）
    transitFarePerKm: 25,
    taxiBaseFare: 600,
    taxiFarePerKm: 300,
    taxiNightSurcharge: 0.25 // 夜间加价 25%
  });

  const DEFAULT_SCHEDULER_STATE = Object.freeze({
    strandedRecords: {},     // charName -> { stranded: true, sinceHour, distanceToHome, emergencySpot, reason }
    activeTrips: {}          // charName -> { from, to, mode, durationMin, startedAt, etaMin }
  });

  const transitScheduler = {
    version: VERSION,

    getState() {
      if (WA.store && typeof WA.store.get === 'function') {
        const s = WA.store.get();
        if (s && s.transitScheduler) return s.transitScheduler;
      }
      if (!this._memState) {
        this._memState = JSON.parse(JSON.stringify(DEFAULT_SCHEDULER_STATE));
      }
      return this._memState;
    },

    /**
     * 计算两点通勤方案与代价
     * @param {number} distanceKm 直线物理距离(公里)
     * @param {number} currentHour 当前世界时间的小时数 (0.00 ~ 23.99)
     * @param {object} envMod 环境修正 (weather: 'normal'|'rain'|'storm'|'snow')
     */
    planCommute(distanceKm, currentHour, envMod) {
      distanceKm = Math.max(0.1, Number(distanceKm) || 1.0);
      currentHour = typeof currentHour === 'number' ? (currentHour % 24) : 14.0;
      envMod = envMod || {};

      let weatherFactor = 1.0;
      if (envMod.weather === 'rain') weatherFactor = 1.25;
      if (envMod.weather === 'storm' || envMod.weather === 'snow') weatherFactor = 1.6;

      const cfg = DEFAULT_TRANSIT_CONFIG;
      const results = {};

      // 1. 徒步
      const actualFootKm = distanceKm * cfg.footDetourFactor;
      const footHours = (actualFootKm / cfg.footSpeedKmH) * weatherFactor;
      const footMin = Math.round(footHours * 60);
      results.foot = {
        mode: 'foot',
        available: true,
        durationMin: footMin,
        cost: 0,
        staminaBurn: Math.round(actualFootKm * 12), // 体力点数消耗
        desc: `徒步约 ${footMin} 分钟 (${actualFootKm.toFixed(1)} km)`
      };

      // 2. 骨干公共交通 (电车/班车)
      // 营业时间判定：05:30 到 24:30
      const isTransitOpen = (currentHour >= cfg.transitOpenHour) || (currentHour < (cfg.transitCloseHour - 24));
      if (isTransitOpen) {
        const rideMin = Math.round((distanceKm / cfg.transitSpeedKmH) * 60 * (weatherFactor > 1.2 ? 1.2 : 1.0));
        const waitMin = 8; // 平均候车时间
        const totalMin = rideMin + waitMin;
        const fare = Math.round(cfg.transitBaseFare + distanceKm * cfg.transitFarePerKm);
        results.transit = {
          mode: 'transit',
          available: true,
          durationMin: totalMin,
          cost: fare,
          staminaBurn: 2,
          desc: `公共交通约 ${totalMin} 分钟 (票价 ${fare})`
        };
      } else {
        results.transit = {
          mode: 'transit',
          available: false,
          reason: 'out_of_service',
          desc: '末班车已断绝 (运行时间 05:30-00:30)'
        };
      }

      // 3. 直达出租载具
      const isNight = (currentHour >= 22 || currentHour < 5);
      const nightRate = isNight ? (1 + cfg.taxiNightSurcharge) : 1.0;
      const taxiMin = Math.round((distanceKm / 28.0) * 60 * weatherFactor);
      const taxiFare = Math.round((cfg.taxiBaseFare + distanceKm * cfg.taxiFarePerKm) * nightRate);
      results.direct = {
        mode: 'direct',
        available: true,
        durationMin: Math.max(5, taxiMin),
        cost: taxiFare,
        isNightSurcharge: isNight,
        desc: `直达载具约 ${taxiMin} 分钟 (费用 ${taxiFare}${isNight ? ' · 夜间加价' : ''})`
      };

      return {
        distanceKm,
        currentHour,
        options: results
      };
    },

    /**
     * 深夜末班车断绝与滞留仲裁
     * @param {string} charName 角色名
     * @param {object} situation { currentHour, distanceToHomeKm, walletFunds, hasHomeKey, nearbyAffordances }
     */
    arbitrateStranded(charName, situation) {
      if (!charName) return { ok: false, reason: 'missing-charName' };
      situation = situation || {};
      const currentHour = typeof situation.currentHour === 'number' ? situation.currentHour : 1.5; // 默认深夜 01:30
      const dist = typeof situation.distanceToHomeKm === 'number' ? situation.distanceToHomeKm : 5.0;
      const funds = typeof situation.walletFunds === 'number' ? situation.walletFunds : 300;
      const nearbyAffs = Array.isArray(situation.nearbyAffordances) ? situation.nearbyAffordances : [];

      const state = this.getState();
      const plan = this.planCommute(dist, currentHour);

      // 判定是否处于末班车停运区间 (00:30 ~ 05:30)
      const isLateNight = (currentHour >= 0.5 && currentHour < 5.5);

      if (!isLateNight || dist <= 1.5) {
        // 白天或近在咫尺，解除滞留
        if (state.strandedRecords[charName]) {
          delete state.strandedRecords[charName];
        }
        return { ok: true, stranded: false, note: '正常通勤范围内或未到停运时段' };
      }

      // 检查直达载具承受力
      const taxiCost = plan.options.direct.cost;
      const canAffordTaxi = funds >= taxiCost;

      if (canAffordTaxi && situation.preferTaxi !== false) {
        return {
          ok: true,
          stranded: false,
          solution: 'taxi',
          cost: taxiCost,
          note: `可负担深夜直达载具返回 (需花费 ${taxiCost})`
        };
      }

      // 判定为滞留！寻找可行应急庇护
      let emergencyOption = 'street_bench'; // 默认最惨：露宿长椅/车站卷帘门外
      let optionDesc = '在车站封闭卷帘门外或公园长椅上挨冻待到拂晓';

      if (nearbyAffs.includes('cyber_cafe') || funds >= 1200) {
        emergencyOption = 'cyber_cafe';
        optionDesc = '前往通宵漫画网咖/胶囊包厢借宿 (约 1500)';
      } else if (nearbyAffs.includes('convenience_store') || funds >= 300) {
        emergencyOption = 'convenience_store_stand';
        optionDesc = '在 24 小时便利店就餐区买热饮勉强避寒打盹';
      } else if (situation.hasLocalFriend) {
        emergencyOption = 'ask_friend';
        optionDesc = '鼓起勇气向同城好友/熟人发送求宿通讯';
      }

      const record = {
        stranded: true,
        charName,
        sinceHour: currentHour,
        distanceToHomeKm: dist,
        funds,
        emergencyOption,
        optionDesc,
        recordedAt: Date.now()
      };

      state.strandedRecords[charName] = record;
      return {
        ok: true,
        stranded: true,
        record
      };
    },

    /**
     * 叙事透镜 Prompt 反哺
     */
    buildBlock() {
      const state = this.getState();
      const records = Object.values(state.strandedRecords);
      if (records.length === 0) return '';

      const lines = ['【交通与深夜滞留仲裁】'];
      for (const rec of records) {
        lines.push(`· ⚠ ${rec.charName} 处于深夜滞留状态！(距归宿 ${rec.distanceToHomeKm.toFixed(1)}km · 末班车断绝 · 资金 ${rec.funds})`);
        lines.push(`  → 当前现实出路：${rec.optionDesc}`);
      }
      return lines.join('\n');
    }
  };

  WA.engines.transitScheduler = transitScheduler;
  WA.transitScheduler = transitScheduler;
})();
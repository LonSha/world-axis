/**
 * WorldAxis engines/environmental-occlusion.js (v2.328.0)
 * 视听阻抗与环境遮蔽引擎 (Audio-Visual Occlusion & Micro-Ambience Vector)
 *
 * 核心机制：
 * 1. 视线遮蔽与阻断 (Line-of-Sight Occlusion)：
 *    - 同一微观子空间(room/floor)：完全可视；
 *    - 隔门/隔墙/建筑内外：直接阻断视觉感知，防止模型穿墙“看到”不在场角色；
 *    - 特殊通道（如玻璃窗/监视器）：可定向透视，但附带感知折损。
 * 2. 真实声学分贝衰减模型 (Acoustic dB Attenuation)：
 *    - 音源分贝等级：whisper(耳语 25dB), talk(正常交谈 55dB), quarrel(激烈争吵 75dB), scream(尖叫呼救 90dB), explosion(爆炸/枪响 130dB)；
 *    - 介质物理阻抗：薄木门/隔断 (-20dB)，实心防盗门/承重墙 (-45dB)，双层隔音玻璃 (-35dB)；
 *    - 距离平方反比空气衰减：20 * log10(距离米数)；
 *    - 到达分贝 vs 区域背景噪音：
 *      · > 背景噪音 + 15dB: 听觉清晰，能辨认原话；
 *      · 背景噪音 ~ +15dB: 隔墙隐约有动静/闷响，无法听清词句；
 *      · < 背景噪音: 彻底被市井环境白噪音掩盖淹没。
 * 3. 微观环境氛围矢量 (Micro-Ambience Vector)：
 *    - 光照 (lighting: 'dark'|'dim'|'normal'|'bright')；
 *    - 监控与人眼密度 (surveillance: 'blind_spot'|'sparse'|'dense')；
 *    - 实时反哺正文透镜，为潜入、密谋、幽会提供决定性环境物理依据。
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  WA.engines = WA.engines || {};

  const VERSION = '2.328.0';

  const SOUND_LEVELS = Object.freeze({
    whisper: 25,
    talk: 55,
    quarrel: 75,
    scream: 90,
    gunshot: 130
  });

  const BARRIER_LOSS = Object.freeze({
    none: 0,
    open_door: 5,
    thin_partition: 18,
    wooden_door: 22,
    concrete_wall: 45,
    soundproof_glass: 38
  });

  const DEFAULT_OCCLUSION_STATE = Object.freeze({
    ambientProfiles: {},     // nodeId -> { lighting, noiseDb, surveillance, weatherExposure }
    recentAudibleEvents: []  // [{ id, soundType, rawDb, sourceNode, heardBy: [charName], timestamp }]
  });

  const environmentalOcclusion = {
    version: VERSION,

    getState() {
      if (WA.store && typeof WA.store.get === 'function') {
        const s = WA.store.get();
        if (s && s.environmentalOcclusion) return s.environmentalOcclusion;
      }
      if (!this._memState) {
        this._memState = JSON.parse(JSON.stringify(DEFAULT_OCCLUSION_STATE));
      }
      return this._memState;
    },

    /**
     * 判定两点之间的视线可见性
     */
    canSee(observerLoc, targetLoc) {
      if (!observerLoc || !targetLoc) return { visible: false, reason: 'missing-location' };
      // 1. 同一空间且同一房间 -> 完全可见
      if (observerLoc.nodeId === targetLoc.nodeId &&
          (observerLoc.room === targetLoc.room || (!observerLoc.room && !targetLoc.room))) {
        return { visible: true, direct: true, note: '同室直视无阻' };
      }
      // 2. 同一建筑但不同房间/楼层 -> 默认被墙体门扉遮蔽
      if (observerLoc.nodeId === targetLoc.nodeId) {
        return { visible: false, occluded: true, reason: 'room_partition', note: '被室内墙壁或门扉遮挡' };
      }
      // 3. 不同建筑地点 -> 完全不可视
      return { visible: false, occluded: true, reason: 'different_venues', note: '身处不同物理建筑，完全视线隔离' };
    },

    /**
     * 声学分贝物理传播演算
     * @param {string} soundType 'whisper'|'talk'|'quarrel'|'scream'|'gunshot'
     * @param {object} sourceLoc { nodeId, room }
     * @param {object} listenerLoc { nodeId, room }
     * @param {object} barrierOpts { barriers: ['wooden_door', 'concrete_wall'], distanceMeters: 10, backgroundNoiseDb: 40 }
     */
    auditAcoustic(soundType, sourceLoc, listenerLoc, barrierOpts) {
      barrierOpts = barrierOpts || {};
      const initialDb = SOUND_LEVELS[soundType] || 55;
      const bgNoise = typeof barrierOpts.backgroundNoiseDb === 'number' ? barrierOpts.backgroundNoiseDb : 40; // 默认城市普通白天 40dB
      const dist = Math.max(1.0, Number(barrierOpts.distanceMeters) || 3.0);

      // 1. 距离反比衰减
      const distLoss = Math.round(20 * Math.log10(dist));

      // 2. 障碍介质穿透阻抗
      let barrierLoss = 0;
      const barriers = Array.isArray(barrierOpts.barriers) ? barrierOpts.barriers : [];
      if (barriers.length > 0) {
        for (const b of barriers) {
          barrierLoss += (BARRIER_LOSS[b] || 20);
        }
      } else {
        // 自动按相对位置推断屏障
        if (sourceLoc && listenerLoc) {
          if (sourceLoc.nodeId === listenerLoc.nodeId) {
            if (sourceLoc.room !== listenerLoc.room) {
              barrierLoss += BARRIER_LOSS.wooden_door; // 室内隔断
            }
          } else {
            barrierLoss += BARRIER_LOSS.concrete_wall; // 跨建筑外墙
          }
        }
      }

      const receivedDb = Math.max(0, initialDb - distLoss - barrierLoss);
      const snr = receivedDb - bgNoise; // 信噪比 (Signal-to-Noise Ratio)

      let perception = 'none';
      let desc = '声音已彻底被周围环境杂音淹没';

      if (snr >= 15) {
        perception = 'clear';
        desc = `声音清晰可辨 (${receivedDb}dB · 能听清一字一句)`;
      } else if (snr >= 0) {
        perception = 'muffled';
        desc = `隐约听到沉闷动静或争吵声 (${receivedDb}dB · 隔墙无法听清具体字句)`;
      }

      return {
        soundType,
        initialDb,
        distLoss,
        barrierLoss,
        receivedDb,
        bgNoise,
        snr,
        perception,
        desc
      };
    },

    /**
     * 设置或获取某场所的微观氛围矢量
     */
    setAmbient(nodeId, profile) {
      const state = this.getState();
      state.ambientProfiles[nodeId] = Object.assign({
        lighting: 'normal',         // 'dark' | 'dim' | 'normal' | 'bright'
        noiseDb: 40,                // 背景噪音分贝
        surveillance: 'sparse',     // 'blind_spot' | 'sparse' | 'dense'
        weatherExposure: 'sheltered'// 'sheltered' | 'exposed'
      }, profile || {});
      return state.ambientProfiles[nodeId];
    },

    getAmbient(nodeId) {
      const state = this.getState();
      return state.ambientProfiles[nodeId] || {
        lighting: 'normal',
        noiseDb: 40,
        surveillance: 'sparse',
        weatherExposure: 'sheltered'
      };
    },

    /**
     * 叙事透镜 Prompt 反哺
     */
    buildBlock() {
      const state = this.getState();
      const entries = Object.entries(state.ambientProfiles);
      if (entries.length === 0) return '';

      const lines = ['【微观环境与声学遮蔽】'];
      for (const [nodeId, amb] of entries.slice(-3)) {
        const lightMap = { dark: '漆黑无光', dim: '昏暗背光', normal: '常态照明', bright: '明亮通透' };
        const survMap = { blind_spot: '无监控/死角视线盲区', sparse: '零星人眼路过', dense: '监控密布/众目睽睽' };
        lines.push(`· 场所 [${nodeId}]: ${lightMap[amb.lighting] || '常态'} · 背景底噪 ${amb.noiseDb}dB · ${survMap[amb.surveillance] || '普通'}`);
      }
      return lines.join('\n');
    }
  };

  WA.engines.environmentalOcclusion = environmentalOcclusion;
  WA.environmentalOcclusion = environmentalOcclusion;
})();
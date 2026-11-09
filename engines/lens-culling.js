/**
 * WorldAxis engines/lens-culling.js (v2.330.0)
 * 微观空间视窗语义降噪与认知裁剪引擎 (Micro-Spatial Lens Semantic Culling)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 彻底消灭大语言模型生成时的“隔墙有耳、透视全知”幻觉。
 * 当正文透镜或 Prompt 注入管线准备将周围发生的声学与物证事实注入上下文时：
 * 依据物理介质阻抗、遮蔽状态、距离衰减与背景白噪音，自动进行三级语义安全裁剪：
 *  1. 'full'（视听清晰完整保留）；
 *  2. 'muffled'（模糊降噪：将具体对话替换为“隔着墙板隐约传来沉闷争执声”，保留物理动静，屏蔽精确词义）；
 *  3. 'culled'（彻底裁汰：声压被背景噪音掩盖，或视线被绝对阻隔，直接从注入流中移除，确保零全知穿帮）。
 */
'use strict';

(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  WA.engines = WA.engines || {};

  const VERSION = '2.330.0';

  function _cleanStr(s, max) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, max || 120);
  }

  /**
   * 对声学事件进行语义裁剪
   * @param {object} soundEvent { sourceActorId, soundLevel, sourceRoomId, speechText }
   * @param {object} listenerContext { listenerActorId, listenerRoomId, backgroundNoiseDb }
   */
  function cullAcousticEvent(soundEvent, listenerContext) {
    if (!soundEvent) return { ok: false, reason: 'missing-sound-event' };
    listenerContext = listenerContext || {};

    const srcRoom = _cleanStr(soundEvent.sourceRoomId);
    const lisRoom = _cleanStr(listenerContext.listenerRoomId);
    const soundLvl = _cleanStr(soundEvent.soundLevel || 'talk');
    const speech = _cleanStr(soundEvent.speechText || '', 200);
    const bgNoise = Number(listenerContext.backgroundNoiseDb || 40);

    // 同一房间且同物理微观节点：完整保留
    if (srcRoom && lisRoom && srcRoom === lisRoom) {
      return {
        ok: true,
        action: 'full',
        audibleText: speech,
        desc: `[同室清晰听闻] ${speech}`
      };
    }

    // 隔断空间：调用 environmental-occlusion 真实物理衰减
    let arrivedDb = 35;
    let audibility = 'muffled';
    if (WA.engines && WA.engines.environmentalOcclusion && typeof WA.engines.environmentalOcclusion.auditAcoustic === 'function') {
      const occlRes = WA.engines.environmentalOcclusion.auditAcoustic(soundLvl, { nodeId: 'building', room: srcRoom }, { nodeId: 'building', room: lisRoom }, {
        backgroundNoiseDb: bgNoise,
        distanceMeters: 3
      });
      arrivedDb = occlRes.receivedDb;
      audibility = occlRes.perception === 'none' ? 'inaudible' : occlRes.perception;
    } else {
      // 内部数学兜底模型
      const levelMap = { whisper: 25, talk: 55, quarrel: 75, scream: 90, gunshot: 130 };
      const raw = (levelMap[soundLvl] || 55) - 35; // 隔墙阻抗 -35dB
      arrivedDb = raw;
      if (raw > bgNoise + 15) audibility = 'clear';
      else if (raw > bgNoise) audibility = 'muffled';
      else audibility = 'inaudible';
    }

    if (audibility === 'inaudible' || arrivedDb <= bgNoise) {
      return {
        ok: true,
        action: 'culled',
        arrivedDb: arrivedDb,
        backgroundNoise: bgNoise,
        audibleText: null,
        desc: '声音彻底湮没于背景杂音与墙体阻抗中，不可察觉'
      };
    }

    if (audibility === 'muffled') {
      let blurredNarrative = '隔墙传来含混沉闷的语声动静，无法辨识具体字句。';
      if (soundLvl === 'quarrel') blurredNarrative = '隔板对面隐约传来激烈急促的争执闷响与桌椅碰擦声，但听不清原话。';
      else if (soundLvl === 'scream') blurredNarrative = '隐约透来一声沉闷的惊呼急促回音。';
      else if (soundLvl === 'whisper') return { ok: true, action: 'culled', arrivedDb: arrivedDb, audibleText: null };

      return {
        ok: true,
        action: 'muffled',
        arrivedDb: arrivedDb,
        audibleText: blurredNarrative,
        desc: blurredNarrative
      };
    }

    // clear 穿透
    return {
      ok: true,
      action: 'full',
      arrivedDb: arrivedDb,
      audibleText: speech,
      desc: `[隔墙清晰漏音] ${speech}`
    };
  }

  /**
   * 对物证事实执行遮蔽感知裁剪
   */
  function cullTraceFact(traceItem, observerContext) {
    if (!traceItem) return { ok: false, reason: 'missing-trace-item' };
    observerContext = observerContext || {};

    const isConcealed = !!traceItem.concealed;
    const observerPerception = Number(observerContext.perception || 50);
    const concealThreshold = Number(traceItem.concealThreshold || 70);

    if (isConcealed && observerPerception < concealThreshold) {
      return {
        ok: true,
        action: 'culled',
        reason: 'occluded-in-secret-pocket-or-hidden-layer',
        visibleTrace: null
      };
    }

    return {
      ok: true,
      action: 'full',
      visibleTrace: traceItem
    };
  }

  const engine = {
    version: VERSION,
    cullAcousticEvent: cullAcousticEvent,
    cullTraceFact: cullTraceFact,
    diagnose: function () {
      return {
        ok: true,
        version: VERSION
      };
    }
  };

  WA.engines.lensCulling = engine;
  WA.lensCulling = engine;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
})();